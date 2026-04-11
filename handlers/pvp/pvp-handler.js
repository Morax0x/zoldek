const { MessageFlags, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, Colors } = require("discord.js");
const core = require('./index.js'); 
const botAI = require('./pvp-ai.js'); 
const { calculateMoraBuff } = require('../../streak-handler.js'); 

// استدعاء المعلق المنفصل مع حماية كاملة من الأخطاء
let triggerAnnouncer = () => {};
let initAnnouncer = () => {};
try {
    const _ann = require('./pvp-announcer.js');
    const _rawTrigger = _ann.triggerAnnouncer;
    const _rawInit = _ann.initAnnouncer;
    triggerAnnouncer = (bs, text) => {
        try {
            const p = _rawTrigger(bs, text);
            if (p && typeof p.catch === 'function') p.catch(() => {});
        } catch(e) {}
    };
    initAnnouncer = (bs, p1, p2) => {
        try {
            const p = _rawInit(bs, p1, p2);
            if (p && typeof p.catch === 'function') p.catch(e => console.error('[Announcer Init Error]', e));
        } catch(e) {}
    };
} catch (e) {}

// 🔥 نظام الحماية المطلقة: تمنع تعليق المعركة إذا تأخرت الصورة أو فشلت 🔥
async function safeBuildBattleEmbed(battleState) {
    try {
        const result = await Promise.race([
            core.buildBattleEmbed(battleState),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Canvas_Timeout")), 6000))
        ]);
        return result;
    } catch (e) {
        console.error("[SafeEmbed] Canvas Timeout/Error - Falling back to text mode:", e.message);
        
        const [attackerId, defenderId] = battleState.turn;
        const attacker = battleState.players.get(attackerId);
        const defender = battleState.players.get(defenderId);
        
        if (!attacker || !defender) return { embeds: [], components: [], files: [] };

        const attackerName = attacker.isMonster ? attacker.name : core.cleanDisplayName(attacker.member?.displayName || attacker.member?.user?.username || 'مقاتل');
        const defenderName = defender.isMonster ? defender.name : core.cleanDisplayName(defender.member?.displayName || defender.member?.user?.username || 'مقاتل');

        const embed = new EmbedBuilder()
            .setTitle(`⚔️ ${attackerName} 🆚 ${defenderName} ⚔️`)
            .setColor(Colors.Red)
            .setDescription(battleState.isPvE ? `🦑 **معركة ضد وحش!**\nالدور الآن لـ: **${attackerName}**` : `الرهان: **${(battleState.bet * 2).toLocaleString()}**\n**الدور الآن لـ:** <@${attackerId}>`);
        
        embed.addFields(
            { name: `${attackerName}`, value: `HP: ${attacker.hp}/${attacker.maxHp}`, inline: true },
            { name: `${defenderName}`, value: `HP: ${defender.hp}/${defender.maxHp}`, inline: true }
        );

        if (battleState.log.length > 0) {
            embed.addFields({ name: "📝 السجل:", value: battleState.log.slice(-4).join('\n'), inline: false });
        }
        
        let components = [];
        if (!attacker.isMonster) {
            const mainButtons = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('pvp_action_attack').setLabel('هـجـوم').setStyle(ButtonStyle.Danger).setEmoji('⚔️'),
                new ButtonBuilder().setCustomId('pvp_action_skill').setLabel('مـهــارات').setStyle(ButtonStyle.Primary).setEmoji('✨')
            );
            if (!battleState.isPvE) mainButtons.addComponents(new ButtonBuilder().setCustomId('pvp_action_forfeit').setLabel('انسحاب').setStyle(ButtonStyle.Secondary).setEmoji('🏳️'));
            components = [mainButtons];
        }
        return { embeds: [embed], components, files: [] };
    }
}

// 🔥 حماية وحش البحر من التعليق الأبدي 🔥
async function processMonsterTurn(battleState, db) {
    const monsterId = "monster";
    const playerId = battleState.turn[1];
    const monster = battleState.players.get(monsterId);
    const player = battleState.players.get(playerId);
    
    if (!monster || !player) {
        battleState.processingTurn = false;
        return;
    }

    try {
        await new Promise(r => setTimeout(r, 1500));

        const { logEntries, skipTurn } = core.applyPersistentEffects(battleState, monsterId);
        battleState.log.push(...logEntries);

        if (monster.hp <= 0) {
            try { triggerAnnouncer(battleState, `الوحش ${monster.name} سقط ميتاً أخيراً!`); } catch(e) {}
            await core.endBattle(battleState, playerId, db, "win");
            return;
        }

        if (skipTurn) {
            battleState.log.push(`⚡ **${monster.name}** لم يستطع التحرك بسبب الشلل!`);
        } else {
            let hitSelf = false;
            if (monster.effects.confusion && Math.random() < 0.5) {
                hitSelf = true;
                const selfDmg = Math.floor(monster.weapon.currentDamage * 0.5);
                monster.hp -= selfDmg;
                battleState.log.push(`😵 **${monster.name}** ضرب نفسه بسبب الارتباك! (-${selfDmg})`);
            }

            if (!hitSelf) {
                let isBlindMiss = false;
                if (monster.effects.blind > 0 && Math.random() < 0.5) {
                    isBlindMiss = true;
                    battleState.log.push(`🌫️ **${monster.name}** أخطأ الهجوم بسبب العمى!`);
                }

                if (!isBlindMiss) {
                    // تحديث لحساب الضرر ليكون متوافقاً مع النظام الجديد
                    const { finalDmg, isEvasion } = core.calculateDamage(monster, player);

                    if (isEvasion) {
                        battleState.log.push(`👻 **${monster.name}** هاجم، لكنك راوغت الهجوم ببراعة!`);
                    } else if (finalDmg > 0) {
                        player.hp -= finalDmg;
                        battleState.log.push(`🦑 **${monster.name}** هاجمك وألحق **${finalDmg}** ضرر!`);
                        if (finalDmg > player.maxHp * 0.20) {
                            try { triggerAnnouncer(battleState, `الوحش ${monster.name} سدد ضربة ساحقة للاعب أفقدته ${finalDmg} نقطة صحة دفعة واحدة!`); } catch(e){}
                        }
                    } else {
                        battleState.log.push(`🛡️ درعك أو دفاعك امتص هجوم الوحش بالكامل!`);
                    }
                }
            }
        }

        if (player.hp <= 0) {
            player.hp = 0;
            try { triggerAnnouncer(battleState, `اللاعب سقط ضحية للوحش ${monster.name} ومات!`); } catch(e){}
            await core.endBattle(battleState, monsterId, db, "win");
            return;
        }

        battleState.turn = [playerId, monsterId];
        
        const { embeds, components, files } = await safeBuildBattleEmbed(battleState);
        if (battleState.message) await battleState.message.edit({ embeds, components, files }).catch(() => {});
        
    } catch (e) {
        console.error("[processMonsterTurn Logic Error]:", e);
    } finally {
        if (battleState && battleState.turn[0] !== "monster") {
            battleState.processingTurn = false;
        }
    }
}

async function handleVotingAndBetting(i, client, db) {
    const channelId = i.channelId || i.message?.channelId || i.channel?.id;
    let battleState = core.activePvpBattles.get(channelId);
    
    if (!battleState) return i.reply({ content: "انتهت المعركة أو ألغيت.", flags: [MessageFlags.Ephemeral] }).catch(()=>{});

    if (i.customId.startsWith('pvp_bet_')) {
        const betTargetId = i.customId.split('_')[2];
        const threadId = i.customId.split('_')[3];
        const p1Id = Array.from(battleState.players.keys())[0];
        const p2Id = Array.from(battleState.players.keys())[1];
        
        if (i.user.id === p1Id || i.user.id === p2Id) return i.reply({ content: "❌ لا يمكنك المراهنة في معركة تشارك فيها!", flags: [MessageFlags.Ephemeral] }).catch(()=>{});
        if (!battleState.bettingPool.isOpen) return i.reply({ content: "🔒 أُغلقت شباك التذاكر! لا يمكن المراهنة الآن.", flags: [MessageFlags.Ephemeral] }).catch(()=>{});

        const existingBet = battleState.bettingPool.bets.get(i.user.id);
        if (existingBet && existingBet.targetId !== betTargetId) return i.reply({ content: "❌ لقد راهنت بالفعل على الخصم! لا يمكنك خيانة رهانك.", flags: [MessageFlags.Ephemeral] }).catch(()=>{});

        const modal = new ModalBuilder().setCustomId(`modal_pvp_bet_${betTargetId}_${threadId}`).setTitle('المراهنة على المعركة');
        const amountInput = new TextInputBuilder().setCustomId('bet_amount').setLabel("كم مورا تريد أن تراهن؟").setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(amountInput));
        await i.showModal(modal).catch(()=>{});
        return;
    }

    if (i.customId.startsWith('pvp_vote_')) {
        const p1Id = Array.from(battleState.players.keys())[0];
        const p2Id = Array.from(battleState.players.keys())[1];

        if (i.user.id !== p1Id && i.user.id !== p2Id) return i.reply({ content: "❌ فقط المتبارزين يمكنهم التصويت على الوقت!", flags: [MessageFlags.Ephemeral] }).catch(()=>{});

        const voteValue = parseInt(i.customId.split('_')[2]);
        battleState.timeVotes[i.user.id] = voteValue;

        const p1Vote = battleState.timeVotes[p1Id];
        const p2Vote = battleState.timeVotes[p2Id];

        const p1NameMention = `<@${p1Id}>`;
        const p2NameMention = battleState.isBotMatch ? `**الزعيم موركس**` : `<@${p2Id}>`;

        let warningMsg = "";
        if (p1Vote !== null && p2Vote !== null && p1Vote !== p2Vote && !battleState.isBotMatch) {
            warningMsg = "\n\n⚠️ **لم تتفقا على نفس الوقت! يرجى من أحدكم تغيير التصويت ليتطابق مع الآخر.**";
        }

        const rulesEmbed = new EmbedBuilder()
            .setTitle('✥ عـقـد المعـركـة')
            .setDescription(`✦ بانتهاء المهلة، يُهزم الأضعف صحةً\n✦ صوتـوا على مـدة المعركـة\n\n✶ ${p1NameMention}: ${p1Vote ? `**${p1Vote} دقائق** ✅` : '⏳ بانتظار التصويت...'}\n✶ ${p2NameMention}: ${p2Vote ? (p2Vote === 'bot' ? '**جاهز للبطش!** 🐉' : `**${p2Vote} دقائق** ✅`) : '⏳ بانتظار التصويت...'}${warningMsg}`)
            .setColor(p1Vote !== null && p2Vote !== null && p1Vote !== p2Vote && !battleState.isBotMatch ? Colors.Red : 0x38558F)
            .setImage('https://i.postimg.cc/DyB5Pv8F/3.png');

        await i.update({ embeds: [rulesEmbed] }).catch(()=>{});

        if (p1Vote !== null && p2Vote !== null && (p1Vote === p2Vote || battleState.isBotMatch)) {
            battleState.status = 'active';
            let finalTime = battleState.isBotMatch ? (p1Vote !== "bot" ? p1Vote : p2Vote) : p1Vote; 

            battleState.durationMs = finalTime * 60 * 1000;
            battleState.log.push(`⏱️ تم تحديد وقت المباراة: **${finalTime} دقائق**`);

            battleState.bettingTimer = setTimeout(async () => {
                try {
                    const bState = core.activePvpBattles.get(channelId);
                    if (bState && bState.bettingPool.isOpen) {
                        bState.bettingPool.isOpen = false;
                        bState.log.push(`🔒 أُغلقت شباك المراهنات!`);
                        await core.updateSpectatorEmbed(bState).catch(()=>{});
                        const { embeds, components, files } = await safeBuildBattleEmbed(bState);
                        if (bState.message) await bState.message.edit({ embeds, components, files }).catch(()=>{});
                    }
                } catch(e) {}
            }, battleState.durationMs * 0.33);

            battleState.timeoutTimer = setTimeout(async () => {
                try {
                    const bState = core.activePvpBattles.get(channelId);
                    if (bState && bState.status === 'active') {
                        const player1 = bState.players.get(p1Id);
                        const player2 = bState.players.get(p2Id);
                        
                        let winnerId = p1Id;
                        if (player2.hp > player1.hp) winnerId = p2Id;
                        else if (player1.hp === player2.hp) winnerId = Math.random() > 0.5 ? p1Id : p2Id;

                        try { triggerAnnouncer(bState, `انتهى الوقت المحدد للمباراة! حان وقت التقييم!`); } catch(e){}
                        await core.endBattle(bState, winnerId, db, "timeout");
                    }
                } catch (e) {}
            }, battleState.durationMs);

            try { await battleState.message.delete().catch(()=>{}); } catch(e){}
            
            try {
                const annEmbed = new EmbedBuilder().setDescription("🎙️ **المعلق يمسك الميكروفون...**").setColor(Colors.Gold);
                battleState.announcerMessage = await battleState.thread.send({ embeds: [annEmbed] }).catch(()=>{});
                
                const { embeds, components, files } = await safeBuildBattleEmbed(battleState);
                battleState.message = await battleState.thread.send({ content: null, embeds, components, files }).catch(()=>{});
                
                const p1NameClean = core.cleanDisplayName(i.guild.members.cache.get(p1Id)?.displayName || "مقاتل 1");
                const p2NameClean = battleState.isBotMatch ? 'الزعيم موركس' : core.cleanDisplayName(i.guild.members.cache.get(p2Id)?.displayName || "مقاتل 2");
                try { initAnnouncer(battleState, p1NameClean, p2NameClean); } catch(e){}
            } catch(e) {}
        }
    }
}

async function handlePvpBetModal(i, client, db) {
    const parts = i.customId.split('_');
    const betTargetId = parts[3];
    const threadId = parts[4];

    const battleState = core.activePvpBattles.get(threadId);
    if (!battleState) return i.reply({ content: "❌ انتهت المعركة أو لم تعد متاحة.", flags: [MessageFlags.Ephemeral] }).catch(()=>{});

    if (!battleState.bettingPool.isOpen) return i.reply({ content: "🔒 أُغلقت شباك التذاكر! لا يمكن المراهنة الآن.", flags: [MessageFlags.Ephemeral] }).catch(()=>{});

    const amountStr = i.fields.getTextInputValue('bet_amount');
    let amount = parseInt(amountStr);

    if (isNaN(amount) || amount <= 0) return i.reply({ content: "❌ يرجى إدخال رقم صحيح وموجب.", flags: [MessageFlags.Ephemeral] }).catch(()=>{});
    await i.deferReply({ flags: [MessageFlags.Ephemeral] }).catch(()=>{});

    let userDataRes = await db.query(`SELECT "mora" FROM levels WHERE "user" = $1 AND "guild" = $2`, [i.user.id, i.guild.id]).catch(() => ({ rows: [] }));
    let userMora = userDataRes.rows[0] ? Number(userDataRes.rows[0].mora) : 0;

    if (userMora < amount) return i.editReply({ content: `❌ لا تملك **${amount.toLocaleString()}** مورا في رصيدك!` }).catch(()=>{});

    let lateTax = battleState.status === 'active' ? Math.floor(amount * 0.02) : 0;
    const finalBet = amount - lateTax;
    if (finalBet <= 0) return i.editReply({ content: "❌ المبلغ قليل جداً لتغطية رسوم الدخول المتأخر (2%)." }).catch(()=>{});

    const betDeductRes = await db.query(`UPDATE levels SET "mora" = GREATEST(0, CAST(COALESCE("mora", '0') AS BIGINT) - $1) WHERE "user" = $2 AND "guild" = $3 RETURNING "mora"`, [amount, i.user.id, i.guild.id]).catch(()=>({rows:[]}));
    if (client?.updateLevelField && betDeductRes.rows[0]) {
        client.updateLevelField(i.user.id, i.guild.id, { mora: Number(betDeductRes.rows[0].mora) });
    }

    const p1Id = Array.from(battleState.players.keys())[0];
    const p2Id = Array.from(battleState.players.keys())[1];

    if (betTargetId === p1Id) battleState.bettingPool.totalP1 += finalBet;
    else if (betTargetId === p2Id) battleState.bettingPool.totalP2 += finalBet;

    const existingBet = battleState.bettingPool.bets.get(i.user.id) || { targetId: betTargetId, amount: 0, name: core.cleanDisplayName(i.user.username) };
    existingBet.amount += finalBet;
    battleState.bettingPool.bets.set(i.user.id, existingBet);

    let replyMsg = `✅ تمت المراهنة بـ **${amount.toLocaleString()}** مورا بنجاح!`;
    if (lateTax > 0) replyMsg += `\n(تم خصم **${lateTax.toLocaleString()}** مورا ضريبة دخول متأخر)`;
    
    await i.editReply({ content: replyMsg }).catch(()=>{});
    await core.updateSpectatorEmbed(battleState).catch(()=>{});
}

async function handlePvpChallenge(i, client, db) {
    const parts = i.customId.split('_');
    const action = parts[1]; 
    const challengerId = parts[2];
    const opponentId = parts[3];
    const bet = parseInt(parts[4]);

    if (i.user.id !== opponentId && (action === 'accept' || action === 'decline')) return i.reply({ content: "أنت لست الشخص المطلوب في هذا التحدي.", flags: [MessageFlags.Ephemeral] }).catch(()=>{});

    if ((i.user.id === challengerId || i.user.id === opponentId) && action === 'decline') {
        const channelId = i.channelId || i.message?.channelId || i.channel?.id;
        if (!core.activePvpChallenges.has(channelId)) return i.update({ content: "انتهى وقت التحدي.", embeds: [], components: [] }).catch(()=>{});
        core.activePvpChallenges.delete(channelId);

        await db.query(`UPDATE levels SET "lastPVP" = 0 WHERE "user" = $1 AND "guild" = $2`, [challengerId, i.guild.id]).catch(()=>{});

        const isCancel = i.user.id === challengerId;
        const statusType = isCancel ? 'canceled' : 'declined';
        
        try {
            const { generatePvPChallengeImage } = require('../../generators/pvp-summary-generator.js');
            const cLevelRes = await db.query(`SELECT level FROM levels WHERE "user" = $1 AND "guild" = $2`, [challengerId, i.guild.id]).catch(()=>({rows:[]}));
            const oLevelRes = await db.query(`SELECT level FROM levels WHERE "user" = $1 AND "guild" = $2`, [opponentId, i.guild.id]).catch(()=>({rows:[]}));
            const cRaceObj = await core.getUserRace({ id: challengerId }, db);
            const oRaceObj = await core.getUserRace({ id: opponentId }, db);
            const cMem = await i.guild.members.fetch(challengerId).catch(()=>null);
            const oMem = await i.guild.members.fetch(opponentId).catch(()=>null);

            const cInfo = { name: core.cleanDisplayName(cMem?.displayName || "مقاتل"), avatar: cMem?.displayAvatarURL({ extension: 'png', size: 256, forceStatic: true }) || 'https://i.postimg.cc/WzRGhgJ9/mwraks.png', level: cLevelRes.rows[0]?.level || 1, race: cRaceObj ? (cRaceObj.raceName || cRaceObj.racename) : 'Human' };
            const oInfo = { name: core.cleanDisplayName(oMem?.displayName || "مقاتل"), avatar: oMem?.displayAvatarURL({ extension: 'png', size: 256, forceStatic: true }) || 'https://i.postimg.cc/WzRGhgJ9/mwraks.png', level: oLevelRes.rows[0]?.level || 1, race: oRaceObj ? (oRaceObj.raceName || oRaceObj.racename) : 'Human' };

            const imgBuffer = await generatePvPChallengeImage(cInfo, oInfo, bet, bet * 2, statusType);
            if (imgBuffer) {
                const { AttachmentBuilder } = require('discord.js');
                const attach = new AttachmentBuilder(imgBuffer, { name: 'challenge_declined.png' });
                return i.update({ content: `<@${opponentId}>`, files: [attach], embeds: [], components: [] }).catch(()=>{});
            }
        } catch(e) {}

        return i.update({ content: `<@${opponentId}>`, embeds: [], components: [] }).catch(()=>{});
    }

    if (action === 'accept') {
        const channelId = i.channelId || i.message?.channelId || i.channel?.id;
        if (!core.activePvpChallenges.has(channelId)) return i.update({ content: "انتهى وقت التحدي.", embeds: [], components: [] }).catch(()=>{});

        const opponentMember = i.member;
        const challengerMember = await i.guild.members.fetch(challengerId).catch(() => null);
        
        if (!challengerMember) {
            await db.query(`UPDATE levels SET "lastPVP" = 0 WHERE "user" = $1 AND "guild" = $2`, [challengerId, i.guild.id]).catch(()=>{});
            return i.update({ content: "المتحدي غادر السيرفر.", embeds: [], components: [] }).catch(()=>{});
        }

        const opponentWeapon = await core.getWeaponData(db, opponentMember);
        if (!opponentWeapon || opponentWeapon.currentLevel === 0) return i.reply({ content: `❌ أنت لست جاهزاً (تحتاج سلاح وعرق).`, flags: [MessageFlags.Ephemeral] }).catch(()=>{});

        const challengerWeapon = await core.getWeaponData(db, challengerMember);
        if (!challengerWeapon || challengerWeapon.currentLevel === 0) {
            await db.query(`UPDATE levels SET "lastPVP" = 0 WHERE "user" = $1 AND "guild" = $2`, [challengerId, i.guild.id]).catch(()=>{});
            return i.update({ content: `❌ المتحدي لم يعد جاهزاً.`, embeds: [], components: [] }).catch(()=>{});
        }

        core.activePvpChallenges.delete(channelId);
        await i.deferUpdate().catch(()=>{}); 
        await i.editReply({ components: [], embeds: [] }).catch(()=>{});
        try {
            await core.startPvpBattle(i, client, db, challengerMember, opponentMember, bet);
        } catch(e) {
            console.error("Error in startPvpBattle:", e);
        }
    }
}

async function handlePvpSkillSelect(i, client, db) {
    const channelId = i.channelId || i.message?.channelId || i.channel?.id;
    let battleState = core.activePvpBattles.get(channelId);
    let isPvE = false;
    
    if (!battleState) { 
        battleState = core.activePveBattles.get(channelId); 
        if (battleState) isPvE = true; 
    }
    
    if (!battleState) return i.reply({ content: "انتهت المعركة.", flags: [MessageFlags.Ephemeral] }).catch(() => {});

    const attackerId = battleState.turn[0];
    if (i.user.id !== attackerId) return i.reply({ content: "ليس دورك!", flags: [MessageFlags.Ephemeral] }).catch(()=>{});

    const skillId = i.values[0];
    const attacker = battleState.players.get(attackerId);
    if (!attacker) return i.reply({ content: "حدث خطأ في بيانات اللاعب.", flags: [MessageFlags.Ephemeral] }).catch(()=>{});

    const cooldowns = battleState.skillCooldowns[attackerId] || {};
    if (cooldowns[skillId] > 0) return i.reply({ content: `المهارة في الانتظار (${cooldowns[skillId]} جولات)!`, flags: [MessageFlags.Ephemeral] }).catch(()=>{});

    if (battleState.processingTurn) return i.reply({ content: "⌛ جاري المعالجة...", flags: [MessageFlags.Ephemeral] }).catch(()=>{});
    battleState.processingTurn = true;

    try {
        await i.deferUpdate().catch(()=>{});
        try { await i.deleteReply().catch(()=>{}); } catch(e) {}

        const defenderId = battleState.turn[1];
        const defender = battleState.players.get(defenderId);
        if (!defender) { battleState.processingTurn = false; return; }

        const attackerName = attacker.isMonster ? attacker.name : core.cleanDisplayName(attacker.member?.user?.displayName);

        if (!isPvE && battleState.stats) battleState.stats.actions += 1;

        const { logEntries, skipTurn } = core.applyPersistentEffects(battleState, attackerId);
        battleState.log.push(...logEntries);

        if (attacker.hp <= 0) {
            attacker.hp = 0;
            try{ triggerAnnouncer(battleState, `اللاعب ${attackerName} سقط صريعاً بسبب تأثيرات النزيف أو السموم!`); } catch(e){}
            await core.endBattle(battleState, defenderId, db, "win", calculateMoraBuff);
            return;
        }

        if (skipTurn) {
            battleState.log.push(`⚡ **${attackerName}** مشلول ولا يستطيع الحركة!`);
            try{ triggerAnnouncer(battleState, `اللاعب ${attackerName} متجمد في مكانه كالصنم! الشلل يمنعه من الحركة!`); } catch(e){}
            battleState.turn = [defenderId, attackerId];
            
            try {
                const { embeds, components, files } = await safeBuildBattleEmbed(battleState);
                await battleState.message.edit({ embeds, components, files }).catch(() => {});
            } catch(e){}
            
            if (isPvE && battleState.turn[0] === "monster") processMonsterTurn(battleState, db).catch(err => console.error(err));
            else if (battleState.isBotMatch && battleState.turn[0] === battleState.message.client.user?.id) botAI.processTestingBotTurn(battleState, db, core, calculateMoraBuff).catch(err => console.error(err));
            else battleState.processingTurn = false;
            return;
        }

        Object.keys(battleState.skillCooldowns[attackerId]).forEach(s => {
            if (battleState.skillCooldowns[attackerId][s] > 0) battleState.skillCooldowns[attackerId][s]--;
        });

        let isConfusedHit = false;
        if (attacker.effects && attacker.effects.confusion && Math.random() < 0.5) isConfusedHit = true;

        if (isConfusedHit) {
            const weaponDmg = attacker.weapon?.currentDamage || 15;
            const selfDmg = Math.floor(weaponDmg * 0.5);
            attacker.hp -= selfDmg;
            battleState.log.push(`😵 **${attackerName}** في حالة ارتباك وضرب نفسه! (-${selfDmg})`);
            try{ triggerAnnouncer(battleState, `اللاعب ${attackerName} ارتبك وضرب نفسه! يا للغباء يفقد ${selfDmg} من صحته!`); } catch(e){}
        } else {
            const skills = attacker.skills || {};
            const skill = Object.values(skills).find(s => s.id === skillId);
            if (skill) {
                battleState.skillCooldowns[attackerId][skillId] = skill.cooldown || core.SKILL_COOLDOWN_TURNS;
                try {
                    const actionLog = core.applySkillEffect(battleState, attackerId, skill);
                    battleState.log.push(actionLog);
                    try{ triggerAnnouncer(battleState, `اللاعب ${attackerName} استخدم مهارته الخاصة "${skill.name}"! ${actionLog}`); } catch(e){}
                } catch(e){
                    console.error("Skill execution error", e);
                }

                if (!isPvE && battleState.stats && battleState.stats[attackerId]) battleState.stats[attackerId].skillsUsed += 1;
            }
        }

        if (defender.hp <= 0) {
            defender.hp = 0;
            try{ 
                const { embeds, components, files } = await safeBuildBattleEmbed(battleState);
                await battleState.message.edit({ embeds, components, files }).catch(() => {});
            } catch(e){}
            try{ triggerAnnouncer(battleState, `الضربة القاضية من ${attackerName}! سقط الخصم أرضاً وانتهت المعركة!`); } catch(e){}
            await core.endBattle(battleState, attackerId, db, "win", calculateMoraBuff);
            return;
        }
        if (attacker.hp <= 0) {
            attacker.hp = 0;
            try{ 
                const { embeds, components, files } = await safeBuildBattleEmbed(battleState);
                await battleState.message.edit({ embeds, components, files }).catch(() => {});
            } catch(e){}
            await core.endBattle(battleState, defenderId, db, "win", calculateMoraBuff);
            return;
        }

        battleState.turn = [defenderId, attackerId];
        try{ 
            const { embeds, components, files } = await safeBuildBattleEmbed(battleState);
            await battleState.message.edit({ embeds, components, files }).catch(() => {});
        } catch(e){}

        if (isPvE && battleState.turn[0] === "monster") processMonsterTurn(battleState, db).catch(err => console.error(err));
        else if (battleState.isBotMatch && battleState.turn[0] === battleState.message.client.user?.id) botAI.processTestingBotTurn(battleState, db, core, calculateMoraBuff).catch(err => console.error(err));
        else battleState.processingTurn = false;

    } catch (err) {
        console.error("[PvP Skill Handler Error]", err);
    } finally {
        if (battleState && (!isPvE || battleState.turn[0] !== "monster")) battleState.processingTurn = false;
    }
}

async function handlePvpTurn(i, client, db) {
    const channelId = i.channelId || i.message?.channelId || i.channel?.id;
    let battleState = core.activePvpBattles.get(channelId);
    let isPvE = false;

    if (!battleState) { 
        battleState = core.activePveBattles.get(channelId); 
        if (battleState) isPvE = true; 
    }

    if (!battleState) { if (i.customId.startsWith('pvp_')) return i.update({ content: "انتهت المعركة.", components: [] }).catch(() => {}); return; }

    if (battleState.status === 'voting') return i.reply({ content: "⏳ بانتظار إكمال التصويت على وقت المباراة!", flags: [MessageFlags.Ephemeral] }).catch(()=>{});

    const attackerId = battleState.turn[0];
    const defenderId = battleState.turn[1];

    if (i.user.id !== attackerId) return i.reply({ content: "ليس دورك!", flags: [MessageFlags.Ephemeral] }).catch(()=>{});

    if (i.customId === 'pvp_action_skill') {
        try {
            const skillMenu = core.buildPvpSkillSelector(battleState);
            if (!skillMenu) return i.reply({ content: "لا تملك مهارات!", flags: [MessageFlags.Ephemeral] }).catch(()=>{});
            return await i.reply({ content: "✨ **اختر مهارة:**", components: [skillMenu], flags: [MessageFlags.Ephemeral] }).catch(()=>{});
        } catch (e) { if (e.code === 10062) return; console.error("Skill Menu error", e); return; }
    }

    if (battleState.processingTurn) return i.reply({ content: "⌛ جاري المعالجة...", flags: [MessageFlags.Ephemeral] }).catch(()=>{});
    battleState.processingTurn = true;

    try {
        await i.deferUpdate().catch(()=>{});
        const attacker = battleState.players.get(attackerId);
        const defender = battleState.players.get(defenderId);
        if (!attacker || !defender) { battleState.processingTurn = false; return; }

        const attackerName = attacker.isMonster ? attacker.name : core.cleanDisplayName(attacker.member?.user?.displayName);
        const defenderName = defender.isMonster ? defender.name : core.cleanDisplayName(defender.member?.user?.displayName);

        if (!isPvE && battleState.stats) battleState.stats.actions += 1;

        const { logEntries, skipTurn } = core.applyPersistentEffects(battleState, attackerId);
        battleState.log.push(...logEntries);

        if (attacker.hp <= 0) {
            attacker.hp = 0;
            try{ triggerAnnouncer(battleState, `اللاعب ${attackerName} سقط صريعاً بسبب تأثيرات النزيف أو السموم!`); }catch(e){}
            await core.endBattle(battleState, defenderId, db, "win", calculateMoraBuff);
            return;
        }

        if (skipTurn) {
            battleState.log.push(`⚡ **${attackerName}** مشلول ولا يستطيع الحركة!`);
            try{ triggerAnnouncer(battleState, `اللاعب ${attackerName} متجمد في مكانه كالصنم! الشلل يمنعه من الحركة!`); }catch(e){}
            battleState.turn = [defenderId, attackerId];
            
            try{
                const { embeds, components, files } = await safeBuildBattleEmbed(battleState);
                await i.editReply({ embeds, components, files }).catch(async () => {
                    if (battleState.message) await battleState.message.edit({ embeds, components, files }).catch(()=>{});
                });
            } catch(e){}
            
            if (isPvE && battleState.turn[0] === "monster") processMonsterTurn(battleState, db).catch(err => console.error(err));
            else if (battleState.isBotMatch && battleState.turn[0] === battleState.message.client.user?.id) botAI.processTestingBotTurn(battleState, db, core, calculateMoraBuff).catch(err => console.error(err));
            else battleState.processingTurn = false;
            return;
        }

        if (i.customId === 'pvp_action_forfeit') {
            try{ triggerAnnouncer(battleState, `يا للعار! اللاعب ${attackerName} ينسحب من المعركة كالجبناء!`); }catch(e){}
            await core.endBattle(battleState, defenderId, db, "forfeit", calculateMoraBuff);
            return;
        }

        Object.keys(battleState.skillCooldowns[attackerId]).forEach(skill => {
            if (battleState.skillCooldowns[attackerId][skill] > 0) battleState.skillCooldowns[attackerId][skill]--;
        });

        if (i.customId === 'pvp_action_attack') {
            let isConfusedHit = false;
            if (attacker.effects && attacker.effects.confusion && Math.random() < 0.5) isConfusedHit = true;

            if (isConfusedHit) {
                const weaponDmg = attacker.weapon?.currentDamage || 15;
                const selfDmg = Math.floor(weaponDmg * 0.5);
                attacker.hp -= selfDmg;
                battleState.log.push(`😵 **${attackerName}** في حالة ارتباك وضرب نفسه! (-${selfDmg})`);
                try{ triggerAnnouncer(battleState, `اللاعب ${attackerName} ارتبك وضرب نفسه! يا للغباء يفقد ${selfDmg} من صحته!`); }catch(e){}
            } else if (!attacker.weapon || attacker.weapon.currentLevel === 0) {
                battleState.log.push(`❌ ${attackerName} يحاول الهجوم بلا سلاح!`);
            } else {
                if (attacker.effects.blind > 0 && Math.random() < 0.5) {
                    battleState.log.push(`🌫️ **${attackerName}** أخطأ الهجوم بسبب العمى!`);
                    try{ triggerAnnouncer(battleState, `اللاعب ${attackerName} يضرب الهواء كالأعمى ولا يصيب شيئاً!`); }catch(e){}
                } else {
                    const attackerHpBefore = attacker.hp;
                    let result = { finalDmg: 0, isCrit: false, lifestealAmount: 0, isEvasion: false };
                    
                    try {
                        result = core.calculateDamage(attacker, defender);
                    } catch(e) { console.error("Calc Dmg Error", e); }

                    if (result.isEvasion) {
                        battleState.log.push(`👻 **${attackerName}** هاجم، لكن **${defenderName}** راوغ ببراعة!`);
                        try{ triggerAnnouncer(battleState, `مراوغة أسطورية من ${defenderName}! هجوم ${attackerName} ذهب في الهواء!`); }catch(e){}
                    } else {
                        // إضافة نظام اللايف ستيل
                        if (result.lifestealAmount > 0) {
                            attacker.hp = Math.min(attacker.maxHp, attacker.hp + result.lifestealAmount);
                        }

                        defender.hp -= result.finalDmg;

                        if (!isPvE && battleState.stats && battleState.stats[attackerId]) battleState.stats[attackerId].damageDealt += result.finalDmg;

                        if (result.finalDmg > 0) {
                            let logText = `⚔️ **${attackerName}** هاجم وألحق **${result.finalDmg}** ضرر!`;
                            if (result.isCrit) logText += ` (كريت!)`;
                            if (result.lifestealAmount > 0) logText += ` [شفى ${result.lifestealAmount}❤️]`;
                            
                            battleState.log.push(logText);
                            try{ triggerAnnouncer(battleState, `اللاعب ${attackerName} ضرب خصمه بقوة وسلب منه ${result.finalDmg} نقطة صحة!`); }catch(e){}
                        } else {
                            battleState.log.push(`🛡️ **${defenderName}** امتص الضربة بالكامل!`);
                            try{ triggerAnnouncer(battleState, `اللاعب ${defenderName} تصدى للضربة ببراعة ولم يتأثر أبداً!`); }catch(e){}
                        }
                    }
                }
            }
        }

        if (defender.hp <= 0) {
            defender.hp = 0;
            try{
                const { embeds, components, files } = await safeBuildBattleEmbed(battleState);
                await i.editReply({ embeds, components, files }).catch(async () => {
                    if (battleState.message) await battleState.message.edit({ embeds, components, files }).catch(()=>{});
                });
            } catch(e){}
            try{ triggerAnnouncer(battleState, `الضربة القاضية من ${attackerName}! سقط الخصم أرضاً وانتهت المعركة!`); }catch(e){}
            await core.endBattle(battleState, attackerId, db, "win", calculateMoraBuff);
            return;
        }
        if (attacker.hp <= 0) {
            attacker.hp = 0;
            try{
                const { embeds, components, files } = await safeBuildBattleEmbed(battleState);
                await i.editReply({ embeds, components, files }).catch(async () => {
                    if (battleState.message) await battleState.message.edit({ embeds, components, files }).catch(()=>{});
                });
            } catch(e){}
            await core.endBattle(battleState, defenderId, db, "win", calculateMoraBuff);
            return;
        }

        battleState.turn = [defenderId, attackerId];
        try{
            const { embeds, components, files } = await safeBuildBattleEmbed(battleState);
            await i.editReply({ embeds, components, files }).catch(async () => {
                if (battleState.message) await battleState.message.edit({ embeds, components, files }).catch(()=>{});
            });
        } catch(e){}

        if (isPvE && battleState.turn[0] === "monster") processMonsterTurn(battleState, db).catch(err => console.error(err));
        else if (battleState.isBotMatch && battleState.turn[0] === battleState.message.client.user?.id) botAI.processTestingBotTurn(battleState, db, core, calculateMoraBuff).catch(err => console.error(err));
        else battleState.processingTurn = false;

    } catch (err) {
        console.error("[PvP Handler Error]", err);
        await i.editReply({ content: "حدث خطأ أثناء المعركة." }).catch(() => {});
    } finally {
        if (battleState && (!isPvE || battleState.turn[0] !== "monster")) battleState.processingTurn = false;
    }
}

async function handlePvpInteraction(i, client, db) {
    try {
        if (i.customId.startsWith('pvp_accept_') || i.customId.startsWith('pvp_decline_')) {
            await handlePvpChallenge(i, client, db);
        } else if (i.customId.startsWith('pvp_vote_') || i.customId.startsWith('pvp_bet_')) {
            await handleVotingAndBetting(i, client, db);
        } else if (i.customId === 'pvp_skill_select_menu') {
            await handlePvpSkillSelect(i, client, db);
        } else {
            await handlePvpTurn(i, client, db);
        }
    } catch (error) {
        if (error.code === 10062) return;
        console.error("[PvP Handler] Critical Error:", error);
    }
}

module.exports = {
    handlePvpInteraction, 
    handlePvpBetModal, 
    activePvpChallenges: core.activePvpChallenges, 
    activePvpBattles: core.activePvpBattles,
};
