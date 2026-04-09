const { EmbedBuilder, ChannelType, Colors } = require("discord.js");
const path = require('path');

let core;
try { 
    core = require('./pvp-core.js'); 
} catch (e) { 
    core = require('./pvp/index.js'); 
}

const { initAnnouncer, triggerAnnouncer } = require('./pvp/pvp-announcer.js');

const activeKnightPlayers = new Set();
const BASE_HP = 800;       
const HP_PER_LEVEL = 60;

async function startGuardBattle(interaction, client, db, robberMember, amountToSteal) {
    try {
        if (activeKnightPlayers.has(robberMember.id)) {
            if (interaction.isRepliable && !interaction.replied) {
                return await interaction.reply({ content: "❌ أنت تقاتل الفارس بالفعل! ركز في معركتك!", ephemeral: true });
            } else {
                return await interaction.channel.send(`❌ <@${robberMember.id}> أنت تقاتل الفارس بالفعل! ركز في معركتك!`);
            }
        }
        activeKnightPlayers.add(robberMember.id);

        let robberData;
        try {
            const getLevelRes = await db.query(`SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2`, [robberMember.id, interaction.guild.id]);
            robberData = getLevelRes.rows[0];
        } catch(e) {
            const getLevelRes = await db.query(`SELECT * FROM levels WHERE userid = $1 AND guildid = $2`, [robberMember.id, interaction.guild.id]).catch(()=>({rows:[]}));
            robberData = getLevelRes.rows[0];
        }
        if (!robberData) robberData = { user: robberMember.id, guild: interaction.guild.id, level: 0, mora: 0, bank: 0 };
        
        const pMaxHp = BASE_HP + ((Number(robberData.level) || 0) * HP_PER_LEVEL);
        let robberWeapon = await core.getWeaponData(db, robberMember);
        if (!robberWeapon || robberWeapon.currentLevel === 0) {
            robberWeapon = { name: "قبضة يد", currentDamage: 15 };
        }
        const robberSkills = await core.getAllSkillData(db, robberMember);
        
        const userRaceP = await core.getUserRace(robberMember, db);
        const rawRaceP = userRaceP ? (userRaceP.raceName || userRaceP.racename) : 'Human';
        const RACE_AR = { 'Human': 'بشري', 'Dragon': 'تنين', 'Elf': 'آلف', 'Dark Elf': 'آلف الظلام', 'Seraphim': 'سيرافيم', 'Demon': 'شيطان', 'Vampire': 'مصاص دماء', 'Spirit': 'روح', 'Dwarf': 'قزم', 'Ghoul': 'غول', 'Hybrid': 'نصف وحش' };
        const translatedRaceP = RACE_AR[rawRaceP] || rawRaceP;

        const nowKSA = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Riyadh" }));
        const todayInt = parseInt(nowKSA.toLocaleDateString('en-CA').replace(/-/g, ''));
        const historyId = `${robberMember.id}-${interaction.guild.id}`;

        await db.query(`CREATE TABLE IF NOT EXISTS knight_history ("id" TEXT PRIMARY KEY, "count" INTEGER, "lastDate" BIGINT)`).catch(()=>{});

        const historyRes = await db.query(`SELECT * FROM knight_history WHERE "id" = $1`, [historyId]);
        let history = historyRes.rows[0];
        let encounterCount = 1; 

        if (history) {
            const dbLastDate = Number(history.lastDate || history.lastdate) || 0;
            if (dbLastDate === todayInt) {
                encounterCount = Number(history.count) + 1; 
                await db.query(`UPDATE knight_history SET "count" = $1 WHERE "id" = $2`, [encounterCount, historyId]);
            } else {
                encounterCount = 1;
                await db.query(`UPDATE knight_history SET "count" = $1, "lastDate" = $2 WHERE "id" = $3`, [1, todayInt, historyId]);
            }
        } else {
            await db.query(`INSERT INTO knight_history ("id", "count", "lastDate") VALUES ($1, $2, $3)`, [historyId, 1, todayInt]);
        }

        const multiplier = encounterCount; 
        const guardMaxHp = Math.floor(pMaxHp * 1.8 * multiplier); 
        const atkMultiplier = 1.4 + ((multiplier - 1) * 0.5); 
        const baseDmg = Math.floor(robberWeapon.currentDamage * atkMultiplier);
        const flatBonus = (multiplier - 1) * 20; 
        const finalGuardDmg = baseDmg + flatBonus;

        const guardWeapon = { 
            name: `نصل الإمبراطور ${multiplier > 1 ? `(غضب x${multiplier})` : ''}`, 
            currentDamage: finalGuardDmg
        };

        const initialShield = Math.floor(guardMaxHp * 0.1);

        const defEffects = () => ({ 
            shield: 0, buff: 0, buff_turns: 0, weaken: 0, weaken_turns: 0, 
            poison: 0, poison_turns: 0, burn: 0, burn_turns: 0, 
            rebound_active: 0, rebound_turns: 0, stun: false, stun_turns: 0, 
            confusion: false, confusion_turns: 0, evasion: 0, evasion_turns: 0, 
            blind: 0, blind_turns: 0, shield_source: null, shield_cd_duration: 0,
            potions_used: 0,        
            blood_liturgy_used: 0   
        });
        
        const guardEffects = defEffects();
        guardEffects.shield = initialShield;

        let introMsg = `🛡️ **فارس الإمبراطور** يغلق الأبواب! "لن تخرج من هنا حياً!"`;
        if (multiplier > 1) {
            introMsg = `🔥🛡️ **فارس الإمبراطور (غاضب x${multiplier})** يتذكر وجهك! "عدت للموت مجدداً؟ هذه المرة لن أرحمك!"`;
        }

        const playerName = core.cleanDisplayName(robberMember.displayName || robberMember.user.username);
        let thread;
        try {
            const threadName = `🛡️-حارس-${playerName}`.substring(0, 100);
            if (interaction.message && typeof interaction.message.startThread === 'function') {
                thread = await interaction.message.startThread({ name: threadName, autoArchiveDuration: 60, reason: 'Guard Battle' });
            } else if (interaction.channel) {
                thread = await interaction.channel.threads.create({ name: threadName, autoArchiveDuration: 60, type: ChannelType.PublicThread, reason: 'Guard Battle' });
            }
        } catch (e) {
            console.error("Thread creation failed for Guard:", e);
            if (interaction.channel) await interaction.channel.send("❌ فشل إنشاء ساحة المعركة للفارس.");
            activeKnightPlayers.delete(robberMember.id);
            return;
        }

        if (!thread) {
            activeKnightPlayers.delete(robberMember.id);
            return;
        }

        try { await thread.members.add(robberMember.id); } catch(e) {}
        try { 
            if (interaction.editReply) {
                await interaction.editReply({ content: `🏰 **القلعة تغلق أبوابها!** قاتل للنجاة: <#${thread.id}>`, embeds: [], components: [] }).catch(()=>{}); 
            }
        } catch(e){}

        const battleState = {
            isPvE: true, isGuardBattle: true, amountToSteal,
            message: null, announcerMessage: null, turn: [robberMember.id, "guard"], processingTurn: false,
            log: [introMsg], status: 'active',
            skillCooldowns: { [robberMember.id]: {}, "guard": {} },
            thread: thread, mainChannel: interaction.channel && !interaction.channel.isThread() ? interaction.channel : null,
            players: new Map([
                [robberMember.id, { isMonster: false, member: robberMember, hp: pMaxHp, maxHp: pMaxHp, level: Number(robberData.level), raceName: translatedRaceP, weapon: robberWeapon, skills: robberSkills, effects: defEffects() }],
                ["guard", { isMonster: true, name: `فـارس الإمبراطور ${multiplier > 1 ? `(x${multiplier})` : ''}`, image: 'https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev/images/pvp/knight.png', raceName: 'فارس إمبراطوري', level: 'Max', hp: guardMaxHp, maxHp: guardMaxHp, weapon: guardWeapon, skills: {}, effects: guardEffects }]
            ])
        };

        // تسجيل المعركة في Map الخاص بالأنظمة
        core.activePveBattles.set(thread.id, battleState);

        const annEmbed = new EmbedBuilder().setDescription("🎙️ **المعلق يمسك الميكروفون...**").setColor(Colors.Gold);
        battleState.announcerMessage = await thread.send({ embeds: [annEmbed] });

        const { embeds, components, files } = await core.buildBattleEmbed(battleState);
        battleState.message = await thread.send({ content: `⚔️ **قـاتـل لتنجـو بحيـاتـك!** <@${robberMember.id}>`, embeds, components, files });

        initAnnouncer(battleState, playerName, battleState.players.get("guard").name);

        // مهلة 5 دقائق
        battleState.timeoutTimer = setTimeout(async () => {
            if (battleState.status === 'active') {
                triggerAnnouncer(battleState, `انتهى الوقت! الفارس يستدعي الدعم واللص يتم القبض عليه!`);
                await core.endBattle(battleState, "guard", db, "timeout");
            }
        }, 5 * 60 * 1000); 

        // Auto bump
        const threadCollector = thread.createMessageCollector({ filter: m => !m.author.bot, time: 300000 }); 
        let messageCounter = 0;
        let bumpCooldown = false;

        threadCollector.on('collect', async (msg) => {
            if (battleState.status === 'ended') { threadCollector.stop(); return; }
            
            messageCounter++;
            if (messageCounter >= 20 && !bumpCooldown) {
                if (battleState.processingTurn) { messageCounter--; return; }

                messageCounter = 0; bumpCooldown = true;
                setTimeout(() => { bumpCooldown = false; }, 15000); 

                try {
                    if (battleState.announcerMessage && battleState.announcerMessage.deletable) await battleState.announcerMessage.delete().catch(() => {});
                    if (battleState.message && battleState.message.deletable) await battleState.message.delete().catch(() => {});
                } catch (e) {}

                try {
                    if (battleState.announcerText) {
                        const newAnnEmbed = new EmbedBuilder().setDescription(battleState.announcerText).setColor(battleState.announcerColor || Colors.Gold);
                        battleState.announcerMessage = await thread.send({ embeds: [newAnnEmbed] });
                    }
                    const { embeds, components, files } = await core.buildBattleEmbed(battleState);
                    battleState.message = await thread.send({ content: null, embeds, components, files });
                } catch (e) { console.error("[Auto-Bump Guard Error]:", e); }
            }
        });

    } catch (error) {
        console.error("Error starting knight battle:", error);
        activeKnightPlayers.delete(robberMember.id);
    }
}

module.exports = { startGuardBattle, activeKnightPlayers };
