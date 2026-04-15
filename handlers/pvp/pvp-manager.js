const { EmbedBuilder, Colors, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require("discord.js");
const { activePvpBattles, activePveBattles, BASE_HP, HP_PER_LEVEL, WIN_IMAGES, LOSE_IMAGES, EMOJI_MORA } = require('./pvp-state.js');
const { cleanDisplayName } = require('./pvp-utils.js');
const { getWeaponData, getAllSkillData, getUserRace } = require('./pvp-data.js');
const { buildBattleEmbed, updateSpectatorEmbed } = require('./pvp-ui.js');
const { generatePvPResultImage } = require('../../generators/pvp-summary-generator.js'); 

let updateGuildStat;
try { ({ updateGuildStat } = require('../guild-board-handler.js')); } catch (e) {}

let addXPAndCheckLevel;
try { ({ addXPAndCheckLevel } = require('../handler-utils.js')); } catch (e) {}

const defEffects = () => ({ shield: 0, buff: 0, buff_turns: 0, weaken: 0, weaken_turns: 0, poison: 0, poison_turns: 0, burn: 0, burn_turns: 0, rebound_active: 0, rebound_turns: 0, stun: false, stun_turns: 0, confusion: false, confusion_turns: 0, evasion: 0, evasion_turns: 0, blind: 0, blind_turns: 0 });

function calculateCP(player) {
    if (!player) return 0;
    let cp = ((player.maxHp || 0) * 0.5) + ((player.damage || player.weapon?.currentDamage || 0) * 10);
    let skillScore = 0;
    if (player.skills) {
        Object.values(player.skills).forEach(s => {
            skillScore += (s.currentLevel || 0) * 20;
        });
    }
    return cp + skillScore;
}

// 🔥 دالة لتجهيز الإحصائيات الكاملة للاعب تم تصحيحها لتعمل بسلاسة 🔥
async function buildFullPlayerStats(db, member, levelData, isBotMatch = false, botOverrides = null) {
    if (isBotMatch && botOverrides) {
        return {
            hp: botOverrides.hp,
            maxHp: botOverrides.hp,
            level: botOverrides.level,
            raceName: botOverrides.raceName,
            damage: botOverrides.weapon.currentDamage,
            defense: 50,
            speed: 10,
            critChance: 15,
            lifesteal: 0,
            weapon: botOverrides.weapon,
            skills: botOverrides.skills
        };
    }

    const level = Number(levelData.level || 0);
    const maxHp = BASE_HP + (level * HP_PER_LEVEL);
    
    const userRace = await getUserRace(member, db);
    const raceName = userRace ? (userRace.raceName || userRace.racename) : 'Human';
    
    // سحب البيانات من الداتابيز بطريقة آمنة
    const skills = await getAllSkillData(db, member);
    const weapon = await getWeaponData(db, member);

    let finalDamage = weapon ? weapon.currentDamage : 15;
    let finalDefense = 0;
    let finalSpeed = 10;
    let finalCritChance = 15;
    let finalLifesteal = 0;

    // مستقبلاً لو أردت إضافة عتاد يزيد الكريت أو اللايف ستيل يتم إضافته هنا
    
    return {
        hp: maxHp,
        maxHp: maxHp,
        level: level,
        raceName: raceName,
        damage: finalDamage,
        defense: finalDefense,
        speed: finalSpeed,
        critChance: finalCritChance,
        lifesteal: finalLifesteal,
        weapon: weapon || { currentDamage: 15, currentLevel: 0 },
        skills: skills
    };
}

async function startPvpBattle(i, client, db, challengerMember, opponentMember, bet, isBotMatch = false) {
    try {
        const getLevelResChallenger = await db.query(`SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2`, [challengerMember.id, i.guild.id]).catch(() => ({rows:[]}));
        let challengerData = getLevelResChallenger.rows[0] || { user: challengerMember.id, guild: i.guild.id, level: 0, mora: 0, bank: 0 };

        const newChalMora = Math.max(0, Number(challengerData.mora) - bet);
        await db.query(`UPDATE levels SET "mora" = GREATEST(0, CAST(COALESCE("mora",'0') AS BIGINT) - $1) WHERE "user" = $2 AND "guild" = $3`, [bet, challengerMember.id, i.guild.id]).catch(()=>{});
        if (client.updateLevelField) client.updateLevelField(challengerMember.id, i.guild.id, { mora: newChalMora });

        let p1Stats = await buildFullPlayerStats(db, challengerMember, challengerData);
        let p2Stats;

        if (isBotMatch) {
            const botOverrides = {
                hp: 5000, level: 100, raceName: 'Dragon',
                weapon: { name: "سلاح الزعيم", currentDamage: 850, currentLevel: 30, raceName: "Dragon" },
                skills: {
                    'race_dragon_skill': { id: 'race_dragon_skill', name: 'أنفاس نارية', stat_type: 'TrueDMG_Burn', effectValue: 500, currentLevel: 20 },
                    'skill_healing': { id: 'skill_healing', name: 'علاج أسطـوري', stat_type: '%', effectValue: 40, currentLevel: 20 },
                    'skill_shielding': { id: 'skill_shielding', name: 'درع الزعيـم', stat_type: '%', effectValue: 50, currentLevel: 20 },
                    'skill_buffing': { id: 'skill_buffing', name: 'طاقة مطلقة', stat_type: '%', effectValue: 60, currentLevel: 20 }
                }
            };
            p2Stats = await buildFullPlayerStats(db, opponentMember, {}, true, botOverrides);
        } else {
            const getLevelResOpponent = await db.query(`SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2`, [opponentMember.id, i.guild.id]).catch(() => ({rows:[]}));
            let opponentData = getLevelResOpponent.rows[0] || { user: opponentMember.id, guild: i.guild.id, level: 0, mora: 0, bank: 0 };
            
            const newOppMora = Math.max(0, Number(opponentData.mora) - bet);
            await db.query(`UPDATE levels SET "mora" = GREATEST(0, CAST(COALESCE("mora",'0') AS BIGINT) - $1) WHERE "user" = $2 AND "guild" = $3`, [bet, opponentMember.id, i.guild.id]).catch(()=>{});
            if (client.updateLevelField) client.updateLevelField(opponentMember.id, i.guild.id, { mora: newOppMora });
            
            p2Stats = await buildFullPlayerStats(db, opponentMember, opponentData);
        }

        const now = Date.now();
        const cWoundRes = await db.query(`SELECT 1 FROM user_buffs WHERE "userID" = $1 AND "guildID" = $2 AND "buffType" = 'pvp_wounded' AND "expiresAt" > $3`, [challengerMember.id, i.guild.id, now]).catch(()=>({rows:[]}));
        const oWoundRes = isBotMatch ? { rows: [] } : await db.query(`SELECT 1 FROM user_buffs WHERE "userID" = $1 AND "guildID" = $2 AND "buffType" = 'pvp_wounded' AND "expiresAt" > $3`, [opponentMember.id, i.guild.id, now]).catch(()=>({rows:[]}));

        if (cWoundRes.rows.length > 0) p1Stats.hp = Math.floor(p1Stats.maxHp * 0.5);
        if (oWoundRes.rows.length > 0) p2Stats.hp = Math.floor(p2Stats.maxHp * 0.5);

        const challengerName = cleanDisplayName(challengerMember?.displayName || challengerMember?.user?.username || 'مقاتل');
        const opponentName = isBotMatch ? "الزعيم موركس" : cleanDisplayName(opponentMember?.displayName || opponentMember?.user?.username || 'مقاتل');

        let targetMessage = i.message || i; 
        if (i.isCommand && i.isCommand()) {
            targetMessage = await i.fetchReply().catch(() => null);
        }

        let thread;
        try {
            if (targetMessage && typeof targetMessage.startThread === 'function') {
                thread = await targetMessage.startThread({
                    name: `⚔️-${challengerName}-vs-${opponentName}`.substring(0, 100),
                    autoArchiveDuration: 60,
                    reason: 'PvP Battle Thread'
                });
            } else if (i.channel && typeof i.channel.threads?.create === 'function') {
                thread = await i.channel.threads.create({
                    name: `⚔️-${challengerName}-vs-${opponentName}`.substring(0, 100),
                    autoArchiveDuration: 60,
                    type: ChannelType.PublicThread,
                    reason: 'PvP Battle Thread'
                });
            }
        } catch (e) {
            console.error('[PvP] Thread creation failed:', e);
            const chalRefund = await db.query(`UPDATE levels SET "mora" = COALESCE(CAST("mora" AS BIGINT), 0) + $1 WHERE "user" = $2 AND "guild" = $3 RETURNING "mora"`, [bet, challengerMember.id, i.guild.id]).catch(() => ({rows:[]}));
            if (client.updateLevelField && chalRefund.rows[0]) client.updateLevelField(challengerMember.id, i.guild.id, { mora: Number(chalRefund.rows[0].mora) });

            if (!isBotMatch) {
                const oppRefund = await db.query(`UPDATE levels SET "mora" = COALESCE(CAST("mora" AS BIGINT), 0) + $1 WHERE "user" = $2 AND "guild" = $3 RETURNING "mora"`, [bet, opponentMember.id, i.guild.id]).catch(() => ({rows:[]}));
                if (client.updateLevelField && oppRefund.rows[0]) client.updateLevelField(opponentMember.id, i.guild.id, { mora: Number(oppRefund.rows[0].mora) });
            }
            if (i.channel) await i.channel.send({ content: "❌ فشل إنشاء ساحة المعركة. تم استرداد الرهان تلقائياً." }).catch(() => {});
            return;
        }

        if (!thread) return;

        try { await thread.members.add(challengerMember.id); } catch(e) {}
        if (!isBotMatch) try { await thread.members.add(opponentMember.id); } catch(e) {}

        const battleState = {
            isPvE: false, isBotMatch: isBotMatch,
            message: null, announcerMessage: null, spectatorMessage: null,
            bet: bet, totalPot: bet * 2, 
            turn: isBotMatch ? [challengerMember.id, opponentMember.id] : [opponentMember.id, challengerMember.id],
            log: [`🔥 بدأت المعركة!`], processingTurn: false, status: 'voting', durationMs: 0,
            timeVotes: { [challengerMember.id]: null, [opponentMember.id]: isBotMatch ? "bot" : null },
            bettingPool: { isOpen: true, totalP1: 0, totalP2: 0, bets: new Map() },
            stats: {
                [challengerMember.id]: { damageDealt: 0, skillsUsed: 0 },
                [opponentMember.id]: { damageDealt: 0, skillsUsed: 0 },
                actions: 0
            },
            mainChannel: i.channel, thread: thread,
            skillCooldowns: { [challengerMember.id]: {}, [opponentMember.id]: {} },
            players: new Map([
                [challengerMember.id, { member: challengerMember, ...p1Stats, effects: defEffects() }],
                [opponentMember.id, { member: opponentMember, isBot: isBotMatch, name: opponentName, ...p2Stats, effects: defEffects() }]
            ])
        };

        if (cWoundRes.rows.length > 0) battleState.log.push(`⚠️ **${challengerName}** دخل المعركة وهو جريح! (HP -50%)`);
        if (oWoundRes.rows.length > 0) battleState.log.push(`⚠️ **${opponentName}** دخل المعركة وهو جريح! (HP -50%)`);

        activePvpBattles.set(thread.id, battleState);

        const rulesEmbed = new EmbedBuilder()
            .setTitle('✥ عـقـد المعـركـة')
            .setDescription(`✦ بانتهاء المهلة، يُهزم الأضعف صحةً\n✦ صوتـوا على مـدة المعركـة\n\n✶ <@${challengerMember.id}>: ⏳ بانتظار التصويت...\n✶ ${isBotMatch ? '**الزعيم موركس**' : `<@${opponentMember.id}>`}: ${isBotMatch ? '**جاهز للقتال!** 🐉' : '⏳ بانتظار التصويت...'}`)
            .setColor(0x38558F)
            .setImage('https://i.postimg.cc/DyB5Pv8F/3.png');

        const rulesRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('pvp_vote_5').setLabel('5 دقائق').setStyle(ButtonStyle.Secondary).setEmoji('⏳'),
            new ButtonBuilder().setCustomId('pvp_vote_10').setLabel('10 دقائق').setStyle(ButtonStyle.Secondary).setEmoji('🕰️'),
            new ButtonBuilder().setCustomId('pvp_vote_15').setLabel('15 دقيقة').setStyle(ButtonStyle.Secondary).setEmoji('⏲️')
        );

        try {
            battleState.spectatorMessage = await thread.send({ content: '\u200B' });
            await updateSpectatorEmbed(battleState).catch(()=>{});
            battleState.message = await thread.send({ content: `${challengerMember} ${isBotMatch ? '' : opponentMember}`, embeds: [rulesEmbed], components: [rulesRow] });
        } catch (err) {
            console.error("[PvP] Failed to send initial thread messages", err);
            return;
        }

        const threadCollector = thread.createMessageCollector({ filter: m => !m.author.bot, time: 3600000 }); 
        let messageCounter = 0;
        let bumpCooldown = false;

        threadCollector.on('collect', async (msg) => {
            if (battleState.status === 'ended') {
                threadCollector.stop();
                return;
            }
            
            messageCounter++;
            if (messageCounter >= 20 && !bumpCooldown) {
                if (battleState.processingTurn) { messageCounter--; return; }

                messageCounter = 0;
                bumpCooldown = true;
                setTimeout(() => { bumpCooldown = false; }, 15000); 

                try {
                    if (battleState.announcerMessage && battleState.announcerMessage.deletable) await battleState.announcerMessage.delete().catch(() => {});
                    if (battleState.message && battleState.message.deletable) await battleState.message.delete().catch(() => {});
                } catch (e) {}

                try {
                    if (battleState.status === 'voting') {
                        const p1Vote = battleState.timeVotes[challengerMember.id];
                        const p2Vote = battleState.timeVotes[opponentMember.id];
                        const p1NameMention = `<@${challengerMember.id}>`;
                        const p2NameMention = isBotMatch ? `**الزعيم موركس**` : `<@${opponentMember.id}>`;

                        const newRulesEmbed = new EmbedBuilder()
                            .setTitle('✥ عـقـد المعـركـة')
                            .setDescription(`✦ بانتهاء المهلة، يُهزم الأضعف صحةً\n✦ صوتـوا على مـدة المعركـة\n\n✶ ${p1NameMention}: ${p1Vote ? `**${p1Vote} دقائق** ✅` : '⏳ بانتظار التصويت...'}\n✶ ${p2NameMention}: ${p2Vote ? (p2Vote === 'bot' ? '**جاهز للبطش!** 🐉' : `**${p2Vote} دقائق** ✅`) : '⏳ بانتظار التصويت...'}`)
                            .setColor(p1Vote !== null && p2Vote !== null && p1Vote !== p2Vote && !isBotMatch ? Colors.Red : 0x38558F)
                            .setImage('https://i.postimg.cc/DyB5Pv8F/3.png');

                        const newRulesRow = new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId('pvp_vote_5').setLabel('5 دقائق').setStyle(ButtonStyle.Secondary).setEmoji('⏳'),
                            new ButtonBuilder().setCustomId('pvp_vote_10').setLabel('10 دقائق').setStyle(ButtonStyle.Secondary).setEmoji('🕰️'),
                            new ButtonBuilder().setCustomId('pvp_vote_15').setLabel('15 دقيقة').setStyle(ButtonStyle.Secondary).setEmoji('⏲️')
                        );

                        battleState.message = await thread.send({ content: `${challengerMember} ${isBotMatch ? '' : opponentMember}`, embeds: [newRulesEmbed], components: [newRulesRow] });
                    } else if (battleState.status === 'active') {
                        if (battleState.announcerText) {
                            const annEmbed = new EmbedBuilder().setDescription(battleState.announcerText).setColor(battleState.announcerColor || Colors.Gold);
                            battleState.announcerMessage = await thread.send({ embeds: [annEmbed] });
                        }
                        const { embeds, components, files } = await buildBattleEmbed(battleState);
                        battleState.message = await thread.send({ content: null, embeds, components, files });
                    }
                } catch (e) {
                    console.error("[Auto-Bump Error]:", e);
                }
            }
        });
    } catch (e) {
        console.error("[startPvpBattle Critical Error]:", e);
    }
}

async function startPveBattle(interaction, client, db, playerMember, monsterData, playerWeaponOverride) {
    try {
        const getLevelRes = await db.query(`SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2`, [playerMember.id, interaction.guild.id]).catch(()=>({rows:[]}));
        let playerData = getLevelRes.rows[0] || { user: playerMember.id, guild: interaction.guild.id, level: 0, mora: 0, bank: 0 };

        let p1Stats = await buildFullPlayerStats(db, playerMember, playerData);
        
        if (playerWeaponOverride && p1Stats.weapon.currentLevel === 0) {
            p1Stats.weapon = playerWeaponOverride;
            p1Stats.damage = playerWeaponOverride.currentDamage;
        }

        const mMaxHp = Math.floor(p1Stats.maxHp * 0.8);
        const mDamage = Math.floor(p1Stats.damage * 0.9);
        
        const RACE_AR = {
            'Human': 'بشري', 'Dragon': 'تنين', 'Elf': 'آلف', 'Dark Elf': 'آلف الظلام',
            'Seraphim': 'سيرافيم', 'Demon': 'شيطان', 'Vampire': 'مصاص دماء',
            'Spirit': 'روح', 'Dwarf': 'قزم', 'Ghoul': 'غول', 'Hybrid': 'نصف وحش'
        };

        const translatedRaceP = RACE_AR[p1Stats.raceName] || p1Stats.raceName;
        const translatedMonsterRace = RACE_AR[monsterData?.race] || monsterData?.race || 'وحش أعماق';
        const monsterImage = monsterData?.image || 'https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev/images/pvp/monster.png';
        const playerName = cleanDisplayName(playerMember?.displayName || playerMember?.user?.username || 'صياد');

        let thread;
        try {
            const threadName = `🦑-صيد-${monsterData?.name || 'وحش'}-${playerName}`.substring(0, 100);
            if (interaction.message && typeof interaction.message.startThread === 'function') {
                thread = await interaction.message.startThread({ name: threadName, autoArchiveDuration: 60, reason: 'PvE Monster Battle' });
            } else if (interaction.channel && typeof interaction.channel.threads?.create === 'function') {
                thread = await interaction.channel.threads.create({ name: threadName, autoArchiveDuration: 60, type: ChannelType.PublicThread, reason: 'PvE Monster Battle' });
            }
        } catch (e) {
            console.error("Thread creation failed for PvE:", e);
            if (interaction.channel) await interaction.channel.send("❌ فشل إنشاء ساحة المعركة للوحش.").catch(()=>{});
            return;
        }

        if (!thread) {
            if (interaction.channel) await interaction.channel.send("❌ حدث خطأ، لم يتم إنشاء الثريد.").catch(()=>{});
            return;
        }

        try { await thread.members.add(playerMember.id); } catch(e) {}
        try { 
            if (interaction.editReply) {
                await interaction.editReply({ content: `🦑 **ظهر ${monsterData?.name || 'الوحش'}!** انتقل إلى الساحة: <#${thread.id}>`, embeds: [], components: [] }).catch(()=>{}); 
            }
        } catch(e){}

        const battleState = {
            isPvE: true, monsterData: monsterData, message: null, announcerMessage: null, turn: [playerMember.id, "monster"],
            log: [`🦑 **${monsterData?.name || 'الوحش'}** ظهر من الأعماق!`], processingTurn: false, status: 'active',
            skillCooldowns: { [playerMember.id]: {}, "monster": {} },
            thread: thread, mainChannel: interaction.channel && !interaction.channel.isThread() ? interaction.channel : null,
            players: new Map([
                [playerMember.id, { isMonster: false, member: playerMember, ...p1Stats, raceName: translatedRaceP, effects: defEffects() }],
                ["monster", { isMonster: true, name: monsterData?.name || 'وحش', image: monsterImage, raceName: translatedMonsterRace, hp: mMaxHp, maxHp: mMaxHp, level: monsterData?.level || '؟', damage: mDamage, weapon: { currentDamage: mDamage }, skills: {}, effects: defEffects() }]
            ])
        };

        activePveBattles.set(thread.id, battleState);
        
        let _rawInitAnnouncer = null;
        try { ({ initAnnouncer: _rawInitAnnouncer } = require('./pvp-announcer.js')); } catch (e) {}
        const safeInitAnnouncer = (bs, p1, p2) => {
            if (!_rawInitAnnouncer) return;
            try {
                const p = _rawInitAnnouncer(bs, p1, p2);
                if (p && typeof p.catch === 'function') p.catch(e => console.error('[PvE Announcer Init Error]', e));
            } catch(e) {}
        };

        try {
            if (_rawInitAnnouncer) {
                const annEmbed = new EmbedBuilder().setDescription("🎙️ **المعلق يمسك الميكروفون...**").setColor(Colors.Gold);
                battleState.announcerMessage = await thread.send({ embeds: [annEmbed] });
            }
            const { embeds, components, files } = await buildBattleEmbed(battleState);
            battleState.message = await thread.send({ content: `⚔️ **قتال ضد وحش!** <@${playerMember.id}>`, embeds, components, files });
        } catch (e) {
            console.error("Failed to send PvE messages:", e);
            return;
        }

        safeInitAnnouncer(battleState, playerName, monsterData?.name || 'الوحش');

        battleState.timeoutTimer = setTimeout(async () => {
            try {
                if (battleState.status === 'active') {
                    try {
                        let triggerAnnouncer;
                        try { ({ triggerAnnouncer } = require('./pvp-announcer.js')); } catch(e) {}
                        if (triggerAnnouncer) {
                            const p = triggerAnnouncer(battleState, `انتهى الوقت! الوحش يغوص في الأعماق مجدداً!`);
                            if (p && typeof p.catch === 'function') p.catch(() => {});
                        }
                    } catch(e) {}
                    await module.exports.endBattle(battleState, "monster", db, "timeout");
                }
            } catch (err) {
                console.error("Timeout Crash Prevented:", err);
            }
        }, 5 * 60 * 1000); 

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
                    const { embeds, components, files } = await buildBattleEmbed(battleState);
                    battleState.message = await thread.send({ content: null, embeds, components, files });
                } catch (e) { console.error("[Auto-Bump PvE Error]:", e); }
            }
        });
    } catch (e) {
        console.error("[startPveBattle Critical Error]:", e);
    }
}

async function endBattle(battleState, winnerId, db, reason = "win", buffCalculator = null) {
    try {
        if (!battleState || !battleState.message) return;
        if (battleState.status === 'ended') return;

        battleState.status = 'ended';
        if(battleState.timeoutTimer) clearTimeout(battleState.timeoutTimer);
        if(battleState.bettingTimer) clearTimeout(battleState.bettingTimer);

        if (!battleState.isPvE && battleState.bettingPool) {
            battleState.bettingPool.isOpen = false;
            try { await updateSpectatorEmbed(battleState); } catch(e){}
        }

        try {
            const { embeds: finalEmbeds, files: finalFiles } = await buildBattleEmbed(battleState);
            await battleState.message.edit({ embeds: finalEmbeds, components: [], files: finalFiles }).catch(() => {});
        } catch (e) { console.error("Error editing final message:", e); }

        const channelId = battleState.message.channel?.id;
        if (channelId) {
            activePvpBattles.delete(channelId);
            activePveBattles.delete(channelId);
        }
        if (battleState.thread && battleState.thread.id !== channelId) {
            activePvpBattles.delete(battleState.thread.id);
            activePveBattles.delete(battleState.thread.id);
        }

        const winner = battleState.players.get(winnerId);
        const loserId = Array.from(battleState.players.keys()).find(id => id !== winnerId);
        const loser = battleState.players.get(loserId);

        if (!winner || !loser) {
            console.error("[PvP] endBattle missing winner or loser data.");
            return;
        }

        const expireTime = Date.now() + (15 * 60 * 1000);
        const guildId = battleState.message.guild?.id;

        if (battleState.isPvE) {
            const embed = new EmbedBuilder();
            if (winnerId !== "monster") {
                const monster = battleState.monsterData || {};
                const rewardMora = Math.floor(Math.random() * ((monster.max_reward || 100) - (monster.min_reward || 10) + 1)) + (monster.min_reward || 10);
                const rewardXP = Math.floor(Math.random() * (300 - 50 + 1)) + 50;

                if (addXPAndCheckLevel && winner.member) {
                    await addXPAndCheckLevel(battleState.message.client, winner.member, db, rewardXP, rewardMora, false).catch(()=>{});
                } else if (winner.member) {
                    await db.query(`UPDATE levels SET "mora" = COALESCE(CAST("mora" AS BIGINT), 0) + $1, "xp" = COALESCE(CAST("xp" AS BIGINT), 0) + $2 WHERE "user" = $3 AND "guild" = $4`, [rewardMora, rewardXP, winner.member.id, guildId]).catch(()=>{});
                }
                
                if (winner.member) {
                    await db.query(`INSERT INTO user_buffs ("guildID", "userID", "buffPercent", "expiresAt", "buffType", "multiplier") VALUES ($1, $2, $3, $4, $5, $6)`, [guildId, winner.member.id, 15, expireTime, 'xp', 0.15]).catch(()=>{});
                    await db.query(`INSERT INTO user_buffs ("guildID", "userID", "buffPercent", "expiresAt", "buffType", "multiplier") VALUES ($1, $2, $3, $4, $5, $6)`, [guildId, winner.member.id, 15, expireTime, 'mora', 0.15]).catch(()=>{});
                    embed.setThumbnail(winner.member.displayAvatarURL());
                }

                embed.setColor(Colors.Gold).setImage(WIN_IMAGES[Math.floor(Math.random() * WIN_IMAGES.length)])
                    .setTitle(`🏆 قهرت ${monster.name || 'الوحش'}!`)
                    .setDescription(`💰 **الغنيمة:** ${rewardMora} ${EMOJI_MORA}\n✨ **خبرة:** ${rewardXP} XP\n✦ حصلت على تعزيز +15% لمدة 15د`);
            } else {
                if (loser.member) {
                    await db.query(`INSERT INTO user_buffs ("guildID", "userID", "buffPercent", "expiresAt", "buffType", "multiplier") VALUES ($1, $2, $3, $4, $5, $6)`, [guildId, loser.member.id, -15, expireTime, 'mora', -0.15]).catch(()=>{});
                }
                embed.setColor(Colors.DarkRed).setImage(LOSE_IMAGES[Math.floor(Math.random() * LOSE_IMAGES.length)])
                    .setTitle(`💀 هزمك ${battleState.monsterData?.name || 'الوحش'}...`)
                    .setDescription(`✦ حصلت على إضعاف -15% مورا واكس بي لمدة 15د`);
            }
            await battleState.message.channel.send({ embeds: [embed] }).catch(console.error);
            
            if (battleState.thread) {
                setTimeout(async () => { 
                    try { await battleState.thread.delete('انتهت المعركة مع الوحش'); } catch (e) {} 
                }, 120000); 
            }
            return;
        } 
        
        let score = 100;
        const stats = battleState.stats || { [winnerId]: {damageDealt:0, skillsUsed:0}, [loserId]: {damageDealt:0, skillsUsed:0}, actions: 0 };
        
        const rounds = Math.floor((stats.actions || 0) / 2);
        if (reason === 'forfeit') score -= 70; 
        else if (rounds < 3) score -= 30;
        else if (rounds < 5) score -= 10;

        const winnerCP = calculateCP(winner);
        const loserCP = calculateCP(loser);
        const cpDiff = Math.abs(winnerCP - loserCP) / Math.max(1, Math.max(winnerCP, loserCP));
        if (cpDiff > 0.4) score -= 25;
        else if (cpDiff > 0.2) score -= 10;

        const loserDamage = stats[loserId]?.damageDealt || 0;
        const damageRatio = loserDamage / Math.max(1, winner.maxHp);
        if (damageRatio < 0.15) score -= 40;
        else if (damageRatio < 0.30) score -= 15;

        const loserSkillsCount = Object.keys(loser.skills || {}).length;
        if ((stats[loserId]?.skillsUsed || 0) === 0 && loserSkillsCount > 0) score -= 15;

        let gradeText = ""; let buffReward = 0; let rankPoint = false; let cancelRewards = false;
        let chestReward = 0; 

        if (score >= 90) { gradeText = `🌟 التقييم [ S ] - معركة أسطورية`; buffReward = 15; rankPoint = true; chestReward = 5; }
        else if (score >= 75) { gradeText = `⚔️ التقييم [ A ] - معركة ممتازة`; buffReward = 15; rankPoint = true; chestReward = 2; }
        else if (score >= 50) { gradeText = `🛡️ التقييم [ B ] - معركة جيدة`; buffReward = 15; rankPoint = false; chestReward = 1; }
        else if (score >= 25) { gradeText = `🛑 التقييم [ C ] - تنمر!`; buffReward = 0; rankPoint = false; chestReward = 0; }
        else { gradeText = `❌ التقييم [ F ] - تلاعب/انسحاب!`; cancelRewards = true; }

        let finalWinnings = battleState.totalPot || 0;
        const pool = battleState.bettingPool;
        const discordClient = battleState.message?.client;

        if (cancelRewards) {
            if (!winner.isBot && winner.member) {
                const wRes = await db.query(`UPDATE levels SET "mora" = COALESCE(CAST("mora" AS BIGINT), 0) + $1 WHERE "user" = $2 AND "guild" = $3 RETURNING "mora"`, [battleState.bet, winnerId, guildId]).catch(()=>({rows:[]}));
                if (discordClient?.updateLevelField && wRes.rows[0]) discordClient.updateLevelField(winnerId, guildId, { mora: Number(wRes.rows[0].mora) });
            }
            if (!loser.isBot && loser.member) {
                const lRes = await db.query(`UPDATE levels SET "mora" = COALESCE(CAST("mora" AS BIGINT), 0) + $1 WHERE "user" = $2 AND "guild" = $3 RETURNING "mora"`, [battleState.bet, loserId, guildId]).catch(()=>({rows:[]}));
                if (discordClient?.updateLevelField && lRes.rows[0]) discordClient.updateLevelField(loserId, guildId, { mora: Number(lRes.rows[0].mora) });
            }

            if (pool && pool.bets && pool.bets.size > 0) {
                for (const [uid, betObj] of pool.bets.entries()) {
                    const bRes = await db.query(`UPDATE levels SET "mora" = COALESCE(CAST("mora" AS BIGINT), 0) + $1 WHERE "user" = $2 AND "guild" = $3 RETURNING "mora"`, [betObj.amount, uid, guildId]).catch(()=>({rows:[]}));
                    if (discordClient?.updateLevelField && bRes.rows[0]) discordClient.updateLevelField(uid, guildId, { mora: Number(bRes.rows[0].mora) });
                }
            }
            finalWinnings = 0;
        } else {
            const settingsRes = await db.query(`SELECT "rolePvPKing", "roleCasinoKing" FROM settings WHERE "guild" = $1`, [guildId]).catch(()=>({rows:[]}));
            const settings = settingsRes.rows[0] || {};

            if (rankPoint && !winner.isBot && winner.member && settings.rolePvPKing && winner.member.roles.cache.has(settings.rolePvPKing)) {
                const stealAmount = Math.floor((battleState.bet || 0) * 0.10);
                if (!loser.isBot && loser.member) {
                    const stealRes = await db.query(`UPDATE levels SET "mora" = GREATEST(0, COALESCE(CAST("mora" AS BIGINT), 0) - $1) WHERE "user" = $2 AND "guild" = $3 RETURNING "mora"`, [stealAmount, loserId, guildId]).catch(()=>({rows:[]}));
                    if (discordClient?.updateLevelField && stealRes.rows[0]) discordClient.updateLevelField(loserId, guildId, { mora: Number(stealRes.rows[0].mora) });
                }
                finalWinnings += stealAmount;
            }

            if (!winner.isBot && winner.member && settings.roleCasinoKing && !winner.member.roles.cache.has(settings.roleCasinoKing)) {
                const kingMembers = battleState.message.guild?.roles.cache.get(settings.roleCasinoKing)?.members;
                if (kingMembers && kingMembers.size > 0) {
                    const casinoTax = Math.floor(finalWinnings * 0.01);
                    if (casinoTax > 0) {
                        finalWinnings -= casinoTax;
                        await db.query(`UPDATE levels SET "bank" = COALESCE(CAST("bank" AS BIGINT), 0) + $1 WHERE "user" = $2 AND "guild" = $3`, [casinoTax, kingMembers.first().id, guildId]).catch(()=>{});
                    }
                }
            }

            if (!winner.isBot && winner.member) {
                const winRes = await db.query(`UPDATE levels SET "mora" = COALESCE(CAST("mora" AS BIGINT), 0) + $1 WHERE "user" = $2 AND "guild" = $3 RETURNING "mora"`, [finalWinnings, winnerId, guildId]).catch(()=>({rows:[]}));
                if (discordClient?.updateLevelField && winRes.rows[0]) discordClient.updateLevelField(winnerId, guildId, { mora: Number(winRes.rows[0].mora) });
                if (rankPoint && updateGuildStat) updateGuildStat(discordClient, guildId, winnerId, 'pvp_wins', 1).catch(()=>{});

                if (chestReward > 0) {
                    const invCheck = await db.query(`SELECT "quantity", "id" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [winnerId, guildId, 'gacha_chest']).catch(()=>({rows:[]}));
                    if (invCheck.rows && invCheck.rows.length > 0) {
                        await db.query(`UPDATE user_inventory SET quantity = quantity + $1 WHERE "id" = $2`, [chestReward, invCheck.rows[0].id]).catch(()=>{});
                    } else {
                        await db.query(`INSERT INTO user_inventory ("userID", "guildID", "itemID", "quantity") VALUES ($1, $2, $3, $4)`, [winnerId, guildId, 'gacha_chest', chestReward]).catch(()=>{});
                    }
                }
            }

            if (!loser.isBot && loser.member) {
                await db.query(`INSERT INTO user_buffs ("guildID", "userID", "buffPercent", "expiresAt", "buffType", "multiplier") VALUES ($1, $2, $3, $4, $5, $6)`, [guildId, loserId, -15, expireTime, 'mora', -0.15]).catch(()=>{});
                await db.query(`INSERT INTO user_buffs ("guildID", "userID", "buffPercent", "expiresAt", "buffType", "multiplier") VALUES ($1, $2, $3, $4, $5, $6)`, [guildId, loserId, 0, expireTime, 'pvp_wounded', 0]).catch(()=>{});
            }

            if (pool && pool.bets && pool.bets.size > 0) {
                const totalPot = pool.totalP1 + pool.totalP2;
                const empireTax = Math.floor(totalPot * 0.05);
                const netPot = totalPot - empireTax;
                let totalWinnerBet = 0;

                for (const [uid, betObj] of pool.bets.entries()) {
                    if (betObj.targetId === winnerId) totalWinnerBet += betObj.amount;
                }

                for (const [uid, betObj] of pool.bets.entries()) {
                    if (betObj.targetId === winnerId && totalWinnerBet > 0) {
                        const share = betObj.amount / totalWinnerBet;
                        const payout = Math.floor(netPot * share);
                        const betPayRes = await db.query(`UPDATE levels SET "mora" = COALESCE(CAST("mora" AS BIGINT), 0) + $1 WHERE "user" = $2 AND "guild" = $3 RETURNING "mora"`, [payout, uid, guildId]).catch(()=>({rows:[]}));
                        if (discordClient?.updateLevelField && betPayRes.rows[0]) discordClient.updateLevelField(uid, guildId, { mora: Number(betPayRes.rows[0].mora) });
                    }
                }
            }
        }

        let imageBuffer = null;
        if (generatePvPResultImage) {
            try {
                imageBuffer = await generatePvPResultImage(battleState, winnerId, gradeText, finalWinnings, chestReward);
            } catch (e) {
                console.error("[PvP] generatePvPResultImage threw:", e.message);
            }
        }
        if (imageBuffer) {
            try {
                const attachment = new AttachmentBuilder(imageBuffer, { name: 'pvp_result.png' });
                await battleState.message.channel.send({ files: [attachment] });
            } catch (e) {
                console.error("[PvP] Failed to send result image:", e.message);
                await battleState.message.channel.send({ content: `**انتهت المعركة!** التقييم: ${gradeText} | الفائز ربح ${finalWinnings} مورا.` }).catch(()=>{});
            }
        } else {
            await battleState.message.channel.send({ content: `**انتهت المعركة!** التقييم: ${gradeText} | الفائز ربح ${finalWinnings} مورا.` }).catch(()=>{});
        }

        if (battleState.thread && battleState.mainChannel) {
            try {
                if (imageBuffer) {
                    const mainAttachment = new AttachmentBuilder(imageBuffer, { name: 'pvp_result_main.png' });
                    await battleState.mainChannel.send({ content: `⚔️ **انتهت معركة الحلبة!** الفائز المستحق: <@${winnerId}>`, files: [mainAttachment] }).catch(()=>{});
                } else {
                    const summaryEmbed = new EmbedBuilder().setColor(cancelRewards ? Colors.Grey : Colors.Gold).setTitle(`⚔️ انتهت معركة الحلبة!`).setDescription(`الفائز: <@${winnerId}>\nالتقييم: ${gradeText}`);
                    await battleState.mainChannel.send({ embeds: [summaryEmbed] }).catch(()=>{});
                }
            } catch (e) {}

            setTimeout(async () => {
                try { await battleState.thread.delete('انتهت المعركة'); } catch (e) {}
            }, 120000); 
        }
    } catch (criticalError) {
        console.error("[CRITICAL] endBattle Error:", criticalError);
    }
}

module.exports = { startPvpBattle, startPveBattle, endBattle };
