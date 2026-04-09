const { MessageFlags, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, Colors } = require("discord.js");
const core = require('./index.js'); 
const botAI = require('./pvp-ai.js'); 
const { calculateMoraBuff } = require('../../streak-handler.js'); 
const { triggerAnnouncer, initAnnouncer } = require('./pvp-announcer.js');

function checkShieldBreakGlobal(battleState, defenderId) {
    const defender = battleState.players.get(defenderId);
    if (defender && defender.effects.shield <= 0 && defender.effects.shield_source) {
        const skillId = defender.effects.shield_source;
        const cd = defender.effects.shield_cd_duration || 4; 
        if (!battleState.skillCooldowns[defenderId]) battleState.skillCooldowns[defenderId] = {};
        battleState.skillCooldowns[defenderId][skillId] = cd;
        defender.effects.shield_source = null;
        defender.effects.shield_cd_duration = 0;
        return `💔 **انكسر درع ${defender.isMonster ? defender.name : core.cleanDisplayName(defender.member?.user?.displayName)}**! (بدأ كولداون المهارة)`;
    }
    return null;
}

async function processMonsterTurn(battleState, db) {
    const monsterId = "monster";
    const playerId = battleState.turn[1];
    const monster = battleState.players.get(monsterId);
    const player = battleState.players.get(playerId);
    if (!monster || !player) return;

    await new Promise(r => setTimeout(r, 1500));

    const { logEntries, skipTurn } = core.applyPersistentEffects(battleState, monsterId);
    battleState.log.push(...logEntries);

    if (monster.hp <= 0) {
        triggerAnnouncer(battleState, `الوحش ${monster.name} سقط ميتاً أخيراً!`);
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
                if (player.effects.evasion > 0) {
                    battleState.log.push(`👻 **${monster.name}** هاجم، لكنك راوغت الهجوم ببراعة!`);
                } else {
                    let damage = monster.weapon.currentDamage;
                    if (monster.effects.weaken > 0) damage = Math.floor(damage * (1 - monster.effects.weaken));

                    let damageTaken = Math.floor(damage);

                    if (player.effects.shield > 0) {
                        if (player.effects.shield >= damageTaken) {
                            player.effects.shield -= damageTaken;
                            damageTaken = 0;
                            battleState.log.push(`🛡️ درع اللاعب امتص الهجوم بالكامل!`);
                        } else {
                            damageTaken -= player.effects.shield;
                            player.effects.shield = 0;
                            battleState.log.push(`🛡️ درع اللاعب تحطم ولكنه خفف الضرر!`);
                        }
                    }

                    if (player.effects.rebound_active > 0) {
                        const reflected = Math.floor(damageTaken * player.effects.rebound_active);
                        monster.hp -= reflected;
                        damageTaken -= reflected;
                        battleState.log.push(`🔄 عكست **${reflected}** ضرر للوحش!`);
                    }

                    player.hp -= damageTaken;
                    if (damageTaken > 0) {
                        battleState.log.push(`🦑 **${monster.name}** هاجمك وألحق **${damageTaken}** ضرر!`);
                        if (damageTaken > player.maxHp * 0.20) triggerAnnouncer(battleState, `الوحش ${monster.name} سدد ضربة ساحقة للاعب أفقدته ${damageTaken} نقطة صحة دفعة واحدة!`);
                    }

                    const breakMsg = checkShieldBreakGlobal(battleState, playerId);
                    if (breakMsg) battleState.log.push(breakMsg);
                }
            }
        }
    }

    if (player.hp <= 0) {
        player.hp = 0;
        triggerAnnouncer(battleState, `اللاعب سقط ضحية للوحش ${monster.name} ومات!`);
        await core.endBattle(battleState, monsterId, db, "win");
        return;
    }

    battleState.turn = [playerId, monsterId];
    
    const { embeds, components, files } = await core.buildBattleEmbed(battleState);
    if (battleState.message) await battleState.message.edit({ embeds, components, files }).catch(() => {});
    battleState.processingTurn = false;
}

// 🔥 نظام الذكاء الاصطناعي لفارس الإمبراطور 🔥
async function processGuardTurn(battleState, db) {
    const guardId = "guard";
    const playerId = battleState.turn[1];
    const guard = battleState.players.get(guardId);
    const player = battleState.players.get(playerId);
    if (!guard || !player) return;

    await new Promise(r => setTimeout(r, 1500));

    const playerCooldowns = battleState.skillCooldowns[playerId];
    if (playerCooldowns) {
        for (const skillId in playerCooldowns) {
            if (playerCooldowns[skillId] > 0) playerCooldowns[skillId]--;
        }
    }

    const { logEntries, skipTurn } = core.applyPersistentEffects(battleState, guardId);
    if (logEntries.length > 0) battleState.log.push(...logEntries);

    if (guard.hp <= 0) {
        triggerAnnouncer(battleState, `فارس الإمبراطور سقط أخيراً! لقد فعلها اللص!`);
        await core.endBattle(battleState, playerId, db, "win");
        return;
    }

    if (skipTurn) {
        battleState.log.push(`💤 **فارس الإمبراطور** مشلول ولا يستطيع الحركة!`);
        triggerAnnouncer(battleState, `يا إلهي! فارس الإمبراطور مشلول تماماً وغير قادر على الحراك!`);
    } else {
        let actionLog = "";
        
        if (guard.hp < guard.maxHp * 0.30 && guard.effects.blood_liturgy_used < 5) {
            const drainDmg = Math.floor(guard.weapon.currentDamage * 1.5); 
            player.hp -= drainDmg;
            const healAmt = Math.max(Math.floor(drainDmg * 0.8), Math.floor(guard.maxHp * 0.15));
            guard.hp = Math.min(guard.maxHp, guard.hp + healAmt);
            guard.effects.blood_liturgy_used++; 
            actionLog = `🩸 **فارس الإمبراطور** استخدم "قداس الدم"! امتص **${drainDmg}** من صحتك وشفى نفسه (+${healAmt})!`;
            triggerAnnouncer(battleState, `فارس الإمبراطور يسحب الدماء بقداس الدم ويستعيد طاقته! إنها مجزرة!`);
            const breakMsg = checkShieldBreakGlobal(battleState, playerId);
            if (breakMsg) actionLog += `\n${breakMsg}`;
        }
        else if (guard.hp < guard.maxHp * 0.50 && guard.effects.potions_used < 5) {
            const healAmount = Math.floor(guard.maxHp * 0.25); 
            guard.hp = Math.min(guard.maxHp, guard.hp + healAmount);
            const shieldAmt = Math.floor(guard.maxHp * 0.10);
            guard.effects.shield += shieldAmt;
            guard.effects.potions_used++; 
            actionLog = `🧪 **فارس الإمبراطور** شرب جرعة طوارئ واستعاد **${healAmount}** HP واكتسب درعاً!`;
            triggerAnnouncer(battleState, `الفارس يشرب جرعة شفاء ويتحصن من جديد!`);
        }
        else if (player.hp < player.maxHp * 0.20) {
            const dmg = core.calculateDamage(guard, player, 1.5);
            player.hp -= dmg;
            actionLog = `💀 **فارس الإمبراطور** رأى ضعفك واستخدم "إعدام"! سبب **${dmg}** ضرر!`;
            triggerAnnouncer(battleState, `الفارس ينقض بحكم الإعدام! ضربة فتاكة ومميتة!`);
            const breakMsg = checkShieldBreakGlobal(battleState, playerId);
            if (breakMsg) actionLog += `\n${breakMsg}`;
        }
        else if (player.effects.shield > 0) {
            const dmg = core.calculateDamage(guard, player, 1.3); 
            player.hp -= dmg;
            actionLog = `🔨 **فارس الإمبراطور** سدد ضربة ثقيلة لتحطيم درعك! سبب **${dmg}** ضرر!`;
            triggerAnnouncer(battleState, `ضربة عنيفة من الفارس محطماً الدرع بكل وحشية!`);
            const breakMsg = checkShieldBreakGlobal(battleState, playerId);
            if (breakMsg) actionLog += `\n${breakMsg}`;
        }
        else if (player.effects.buff > 0 && Math.random() < 0.20) {
            guard.effects.rebound_active = 0.5; 
            guard.effects.rebound_turns = 1;
            actionLog = `🛡️ **فارس الإمبراطور** يتخذ وضعية "انعكاس الضرر"!`;
            triggerAnnouncer(battleState, `الفارس يستعد لرد الضربات! احترس من الانعكاس!`);
        }
        else {
            let multiplier = player.effects.buff > 0 ? 1.1 : 1.0;
            const dmg = core.calculateDamage(guard, player, multiplier);
            player.hp -= dmg;
            const breakMsg = checkShieldBreakGlobal(battleState, playerId);
            if (breakMsg) actionLog += `${breakMsg}\n`;

            if (Math.random() < 0.2) {
                player.effects.burn = Math.floor(guard.weapon.currentDamage * 0.1);
                player.effects.burn_turns = 2;
                actionLog += `⚔️ **فارس الإمبراطور** جرحك وسـبب نزيفاً! (**${dmg}** ضرر)`;
                triggerAnnouncer(battleState, `سيف الفارس يمزق اللحم ويسبب نزيفاً مرعباً!`);
            } else {
                actionLog += `⚔️ **فارس الإمبراطور** هاجمك وسبب **${dmg}** ضرر!`;
                if (dmg > 0) triggerAnnouncer(battleState, `الفارس يوجه ضربة قوية! هجوم لا يستهان به!`);
            }
        }

        battleState.log.push(actionLog);
    }

    if (player.hp <= 0) {
        player.hp = 0;
        triggerAnnouncer(battleState, `اللاعب سقط ضحية لفارس الإمبراطور ومات!`);
        await core.endBattle(battleState, guardId, db, "win");
        return;
    }

    battleState.turn = [playerId, guardId];
    
    const { embeds, components, files } = await core.buildBattleEmbed(battleState);
    if (battleState.message) await battleState.message.edit({ embeds, components, files }).catch(() => {});
    battleState.processingTurn = false;
}

async function handleVotingAndBetting(i, client, db) {
    const channelId = i.channelId || i.message?.channelId || i.channel?.id;
    let battleState = core.activePvpBattles.get(channelId);
    
    if (!battleState) return i.reply({ content: "انتهت المعركة أو ألغيت.", flags: [MessageFlags.Ephemeral] });

    if (i.customId.startsWith('pvp_bet_')) {
        const betTargetId = i.customId.split('_')[2];
        const threadId = i.customId.split('_')[3];
        const p1Id = Array.from(battleState.players.keys())[0];
        const p2Id = Array.from(battleState.players.keys())[1];
        
        if (i.user.id === p1Id || i.user.id === p2Id) return i.reply({ content: "❌ لا يمكنك المراهنة في معركة تشارك فيها!", flags: [MessageFlags.Ephemeral] });
        if (!battleState.bettingPool.isOpen) return i.reply({ content: "🔒 أُغلقت شباك التذاكر! لا يمكن المراهنة الآن.", flags: [MessageFlags.Ephemeral] });

        const existingBet = battleState.bettingPool.bets.get(i.user.id);
        if (existingBet && existingBet.targetId !== betTargetId) return i.reply({ content: "❌ لقد راهنت بالفعل على الخصم! لا يمكنك خيانة رهانك.", flags: [MessageFlags.Ephemeral] });

        const modal = new ModalBuilder().setCustomId(`modal_pvp_bet_${betTargetId}_${threadId}`).setTitle('المراهنة على المعركة');
        const amountInput = new TextInputBuilder().setCustomId('bet_amount').setLabel("كم مورا تريد أن تراهن؟").setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(amountInput));
        await i.showModal(modal);
        return;
    }

    if (i.customId.startsWith('pvp_vote_')) {
        const p1Id = Array.from(battleState.players.keys())[0];
        const p2Id = Array.from(battleState.players.keys())[1];

        if (i.user.id !== p1Id && i.user.id !== p2Id) return i.reply({ content: "❌ فقط المتبارزين يمكنهم التصويت على الوقت!", flags: [MessageFlags.Ephemeral] });

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

        await i.update({ embeds: [rulesEmbed] });

        if (p1Vote !== null && p2Vote !== null && (p1Vote === p2Vote || battleState.isBotMatch)) {
            battleState.status = 'active';
            let finalTime = battleState.isBotMatch ? (p1Vote !== "bot" ? p1Vote : p2Vote) : p1Vote; 

            battleState.durationMs = finalTime * 60 * 1000;
            battleState.log.push(`⏱️ تم تحديد وقت المباراة: **${finalTime} دقائق**`);

            battleState.bettingTimer = setTimeout(async () => {
                const bState = core.activePvpBattles.get(channelId);
                if (bState && bState.bettingPool.isOpen) {
                    bState.bettingPool.isOpen = false;
                    bState.log.push(`🔒 أُغلقت شباك المراهنات!`);
                    await core.updateSpectatorEmbed(bState);
                    const { embeds, components, files } = await core.buildBattleEmbed(bState);
                    if (bState.message) await bState.message.edit({ embeds, components, files }).catch(()=>{});
                }
            }, battleState.durationMs * 0.33);

            battleState.timeoutTimer = setTimeout(async () => {
                const bState = core.activePvpBattles.get(channelId);
                if (bState && bState.status === 'active') {
                    const player1 = bState.players.get(p1Id);
                    const player2 = bState.players.get(p2Id);
                    
                    let winnerId = p1Id;
                    if (player2.hp > player1.hp) winnerId = p2Id;
                    else if (player1.hp === player2.hp) winnerId = Math.random() > 0.5 ? p1Id : p2Id;

                    triggerAnnouncer(bState, `انتهى الوقت المحدد للمباراة! حان وقت التقييم!`);
                    await core.endBattle(bState, winnerId, db, "timeout");
                }
            }, battleState.durationMs);

            try { await battleState.message.delete().catch(()=>{}); } catch(e){}
            
            const annEmbed = new EmbedBuilder().setDescription("🎙️ **المعلق يمسك الميكروفون...**").setColor(Colors.Gold);
            battleState.announcerMessage = await battleState.thread.send({ embeds: [annEmbed] });
            
            const { embeds, components, files } = await core.buildBattleEmbed(battleState);
            battleState.message = await battleState.thread.send({ content: null, embeds, components, files });
            
            const p1NameClean = core.cleanDisplayName(i.guild.members.cache.get(p1Id)?.displayName || "مقاتل 1");
            const p2NameClean = battleState.isBotMatch ? 'الزعيم موركس' : core.cleanDisplayName(i.guild.members.cache.get(p2Id)?.displayName || "مقاتل 2");
            initAnnouncer(battleState, p1NameClean, p2NameClean);
        }
    }
}

async function handlePvpBetModal(i, client, db) {
    const parts = i.customId.split('_');
    const betTargetId = parts[3];
    const threadId = parts[4];

    const battleState = core.activePvpBattles.get(threadId);
    if (!battleState) return i.reply({ content: "❌ انتهت المعركة أو لم تعد متاحة.", flags: [MessageFlags.Ephemeral] });

    if (!battleState.bettingPool.isOpen) return i.reply({ content: "🔒 أُغلقت شباك التذاكر! لا يمكن المراهنة الآن.", flags: [MessageFlags.Ephemeral] });

    const amountStr = i.fields.getTextInputValue('bet_amount');
    let amount = parseInt(amountStr);

    if (isNaN(amount) || amount <= 0) return i.reply({ content: "❌ يرجى إدخال رقم صحيح وموجب.", flags: [MessageFlags.Ephemeral] });
    await i.deferReply({ flags: [MessageFlags.Ephemeral] });

    let userDataRes = await db.query(`SELECT "mora" FROM levels WHERE "user" = $1 AND "guild" = $2`, [i.user.id, i.guild.id]).catch(() => ({ rows: [] }));
    let userMora = userDataRes.rows[0] ? Number(userDataRes.rows[0].mora) : 0;

    if (userMora < amount) return i.editReply({ content: `❌ لا تملك **${amount.toLocaleString()}** مورا في رصيدك!` });

    let lateTax = battleState.status === 'active' ? Math.floor(amount * 0.02) : 0;
    const finalBet = amount - lateTax;
    if (finalBet <= 0) return i.editReply({ content: "❌ المبلغ قليل جداً لتغطية رسوم الدخول المتأخر (2%)." });

    const betDeductRes = await db.query(`UPDATE levels SET "mora" = GREATEST(0, "mora" - $1) WHERE "user" = $2 AND "guild" = $3 RETURNING "mora"`, [amount, i.user.id, i.guild.id]).catch(()=>({rows:[]}));
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
    
    await i.editReply({ content: replyMsg });
    await core.updateSpectatorEmbed(battleState);
}

async function handlePvpChallenge(i, client, db) {
    const parts = i.customId.split('_');
    const action = parts[1]; 
    const challengerId = parts[2];
    const opponentId = parts[3];
    const bet = parseInt(parts[4]);

    if (i.user.id !== opponentId && (action === 'accept' || action === 'decline')) return i.reply({ content: "أنت لست الشخص المطلوب في هذا التحدي.", flags: [MessageFlags.Ephemeral] });

    if ((i.user.id === challengerId || i.user.id === opponentId) && action === 'decline') {
        const channelId = i.channelId || i.message?.channelId || i.channel?.id;
        if (!core.activePvpChallenges.has(channelId)) return i.update({ content: "انتهى وقت التحدي.", embeds: [], components: [] });
        core.activePvpChallenges.delete(channelId);

        await db.query(`UPDATE levels SET "lastPVP" = 0 WHERE "user" = $1 AND "guild" = $2`, [challengerId, i.guild.id]);

        const isCancel = i.user.id === challengerId;
        const statusType = isCancel ? 'canceled' : 'declined';
        
        try {
            const { generatePvPChallengeImage } = require('../../generators/pvp-summary-generator.js');
            const cLevelRes = await db.query(`SELECT level FROM levels WHERE "user" = $1 AND "guild" = $2`, [challengerId, i.guild.id]);
            const oLevelRes = await db.query(`SELECT level FROM levels WHERE "user" = $1 AND "guild" = $2`, [opponentId, i.guild.id]);
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
                return i.update({ content: `<@${opponentId}>`, files: [attach], embeds: [], components: [] });
            }
        } catch(e) {}

        return i.update({ content: `<@${opponentId}>`, embeds: [], components: [] });
    }

    if (action === 'accept') {
        const channelId = i.channelId || i.message?.channelId || i.channel?.id;
        if (!core.activePvpChallenges.has(channelId)) return i.update({ content: "انتهى وقت التحدي.", embeds: [], components: [] });

        const opponentMember = i.member;
        const challengerMember = await i.guild.members.fetch(challengerId).catch(() => null);
        
        if (!challengerMember) {
            await db.query(`UPDATE levels SET "lastPVP" = 0 WHERE "user" = $1 AND "guild" = $2`, [challengerId, i.guild.id]);
            return i.update({ content: "المتحدي غادر السيرفر.", embeds: [], components: [] });
        }

        const opponentWeapon = await core.getWeaponData(db, opponentMember);
        if (!opponentWeapon || opponentWeapon.currentLevel === 0) return i.reply({ content: `❌ أنت لست جاهزاً (تحتاج سلاح وعرق).`, flags: [MessageFlags.Ephemeral] });

        const challengerWeapon = await core.getWeaponData(db, challengerMember);
        if (!challengerWeapon || challengerWeapon.currentLevel === 0) {
            await db.query(`UPDATE levels SET "lastPVP" = 0 WHERE "user" = $1 AND "guild" = $2`, [challengerId, i.guild.id]);
            return i.update({ content: `❌ المتحدي لم يعد جاهزاً.`, embeds: [], components: [] });
        }

        core.activePvpChallenges.delete(channelId);
        await i.deferUpdate(); 
        await i.editReply({ components: [], embeds: [] });
        await core.startPvpBattle(i, client, db, challengerMember, opponentMember, bet);
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
    if (i.user.id !== attackerId) return i.reply({ content: "ليس دورك!", flags: [MessageFlags.Ephemeral] });

    const skillId = i.values[0];
    const attacker = battleState.players.get(attackerId);
    if (!attacker) return i.reply({ content: "حدث خطأ في بيانات اللاعب.", flags: [MessageFlags.Ephemeral] });

    const cooldowns = battleState.skillCooldowns[attackerId] || {};
    if (cooldowns[skillId] > 0) return i.reply({ content: `المهارة في الانتظار (${cooldowns[skillId]} جولات)!`, flags: [MessageFlags.Ephemeral] });

    if (battleState.processingTurn) return i.reply({ content: "⌛ جاري المعالجة...", flags: [MessageFlags.Ephemeral] });
    battleState.processingTurn = true;

    try {
        await i.deferUpdate();
        try { await i.deleteReply(); } catch(e) {}

        const defenderId = battleState.turn[1];
        const defender = battleState.players.get(defenderId);
        if (!defender) { battleState.processingTurn = false; return; }

        const attackerName = attacker.isMonster ? attacker.name : core.cleanDisplayName(attacker.member?.user?.displayName);

        if (!isPvE && battleState.stats) battleState.stats.actions += 1;

        const { logEntries, skipTurn } = core.applyPersistentEffects(battleState, attackerId);
        battleState.log.push(...logEntries);

        if (attacker.hp <= 0) {
            attacker.hp = 0;
            triggerAnnouncer(battleState, `اللاعب ${attackerName} سقط صريعاً بسبب تأثيرات النزيف أو السموم!`);
            await core.endBattle(battleState, defenderId, db, "win", calculateMoraBuff);
            return;
        }

        if (skipTurn) {
            battleState.log.push(`⚡ **${attackerName}** مشلول ولا يستطيع الحركة!`);
            triggerAnnouncer(battleState, `اللاعب ${attackerName} متجمد في مكانه كالصنم! الشلل يمنعه من الحركة!`);
            battleState.turn = [defenderId, attackerId];
            const { embeds, components, files } = await core.buildBattleEmbed(battleState);
            await battleState.message.edit({ embeds, components, files }).catch(() => {});
            
            if (isPvE && battleState.turn[0] === "monster") processMonsterTurn(battleState, db).catch(err => console.error(err));
            else if (isPvE && battleState.turn[0] === "guard") processGuardTurn(battleState, db).catch(err => console.error(err));
            else if (battleState.isBotMatch && battleState.turn[0] === battleState.message.client.user.id) botAI.processTestingBotTurn(battleState, db, core, calculateMoraBuff).catch(err => console.error(err));
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
            triggerAnnouncer(battleState, `اللاعب ${attackerName} ارتبك وضرب نفسه! يا للغباء يفقد ${selfDmg} من صحته!`);
            const breakMsg = checkShieldBreakGlobal(battleState, attackerId);
            if (breakMsg) battleState.log.push(breakMsg);
        } else {
            const skills = attacker.skills || {};
            const skill = Object.values(skills).find(s => s.id === skillId);
            if (skill) {
                battleState.skillCooldowns[attackerId][skillId] = skill.cooldown || core.SKILL_COOLDOWN_TURNS;
                const actionLog = core.applySkillEffect(battleState, attackerId, skill);
                battleState.log.push(actionLog);
                
                triggerAnnouncer(battleState, `اللاعب ${attackerName} استخدم مهارته الخاصة "${skill.name}"! ${actionLog}`);
                
                const breakMsg = checkShieldBreakGlobal(battleState, defenderId);
                if (breakMsg) battleState.log.push(breakMsg);

                if (!isPvE && battleState.stats && battleState.stats[attackerId]) battleState.stats[attackerId].skillsUsed += 1;
            }
        }

        if (defender.hp <= 0) {
            defender.hp = 0;
            const { embeds, components, files } = await core.buildBattleEmbed(battleState);
            await battleState.message.edit({ embeds, components, files }).catch(() => {});
            triggerAnnouncer(battleState, `الضربة القاضية من ${attackerName}! سقط الخصم أرضاً وانتهت المعركة!`);
            await core.endBattle(battleState, attackerId, db, "win", calculateMoraBuff);
            return;
        }
        if (attacker.hp <= 0) {
            attacker.hp = 0;
            const { embeds, components, files } = await core.buildBattleEmbed(battleState);
            await battleState.message.edit({ embeds, components, files }).catch(() => {});
            await core.endBattle(battleState, defenderId, db, "win", calculateMoraBuff);
            return;
        }

        battleState.turn = [defenderId, attackerId];
        const { embeds, components, files } = await core.buildBattleEmbed(battleState);
        await battleState.message.edit({ embeds, components, files }).catch(() => {});

        if (isPvE && battleState.turn[0] === "monster") processMonsterTurn(battleState, db).catch(err => console.error(err));
        else if (isPvE && battleState.turn[0] === "guard") processGuardTurn(battleState, db).catch(err => console.error(err));
        else if (battleState.isBotMatch && battleState.turn[0] === battleState.message.client.user.id) botAI.processTestingBotTurn(battleState, db, core, calculateMoraBuff).catch(err => console.error(err));
        else battleState.processingTurn = false;

    } catch (err) {
        console.error("[PvP Skill Handler Error]", err);
    } finally {
        if (battleState && (!isPvE || (battleState.turn[0] !== "monster" && battleState.turn[0] !== "guard"))) battleState.processingTurn = false;
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

    if (battleState.status === 'voting') return i.reply({ content: "⏳ بانتظار إكمال التصويت على وقت المباراة!", flags: [MessageFlags.Ephemeral] });

    const attackerId = battleState.turn[0];
    const defenderId = battleState.turn[1];

    if (i.user.id !== attackerId) return i.reply({ content: "ليس دورك!", flags: [MessageFlags.Ephemeral] });

    if (i.customId === 'pvp_action_skill') {
        try {
            const skillMenu = core.buildPvpSkillSelector(battleState);
            if (!skillMenu) return i.reply({ content: "لا تملك مهارات!", flags: [MessageFlags.Ephemeral] });
            return await i.reply({ content: "✨ **اختر مهارة:**", components: [skillMenu], flags: [MessageFlags.Ephemeral] });
        } catch (e) { if (e.code === 10062) return; throw e; }
    }

    if (battleState.processingTurn) return i.reply({ content: "⌛ جاري المعالجة...", flags: [MessageFlags.Ephemeral] });
    battleState.processingTurn = true;

    try {
        await i.deferUpdate();
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
            triggerAnnouncer(battleState, `اللاعب ${attackerName} سقط صريعاً بسبب تأثيرات النزيف أو السموم!`);
            await core.endBattle(battleState, defenderId, db, "win", calculateMoraBuff);
            return;
        }

        if (skipTurn) {
            battleState.log.push(`⚡ **${attackerName}** مشلول ولا يستطيع الحركة!`);
            triggerAnnouncer(battleState, `اللاعب ${attackerName} متجمد في مكانه كالصنم! الشلل يمنعه من الحركة!`);
            battleState.turn = [defenderId, attackerId];
            const { embeds, components, files } = await core.buildBattleEmbed(battleState);
            await i.editReply({ embeds, components, files });
            
            if (isPvE && battleState.turn[0] === "monster") processMonsterTurn(battleState, db).catch(err => console.error(err));
            else if (isPvE && battleState.turn[0] === "guard") processGuardTurn(battleState, db).catch(err => console.error(err));
            else if (battleState.isBotMatch && battleState.turn[0] === battleState.message.client.user.id) botAI.processTestingBotTurn(battleState, db, core, calculateMoraBuff).catch(err => console.error(err));
            else battleState.processingTurn = false;
            return;
        }

        if (i.customId === 'pvp_action_forfeit') {
            triggerAnnouncer(battleState, `يا للعار! اللاعب ${attackerName} ينسحب من المعركة كالجبناء!`);
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
                triggerAnnouncer(battleState, `اللاعب ${attackerName} ارتبك وضرب نفسه! يا للغباء يفقد ${selfDmg} من صحته!`);
                
                const breakMsg = checkShieldBreakGlobal(battleState, attackerId);
                if (breakMsg) battleState.log.push(breakMsg);
            } else if (!attacker.weapon || attacker.weapon.currentLevel === 0) {
                battleState.log.push(`❌ ${attackerName} يحاول الهجوم بلا سلاح!`);
            } else {
                if (attacker.effects.blind > 0 && Math.random() < 0.5) {
                    battleState.log.push(`🌫️ **${attackerName}** أخطأ الهجوم بسبب العمى!`);
                    triggerAnnouncer(battleState, `اللاعب ${attackerName} يضرب الهواء كالأعمى ولا يصيب شيئاً!`);
                } else {
                    const attackerHpBefore = attacker.hp;
                    const dmg = core.calculateDamage(attacker, defender);

                    if (defender.effects.evasion > 0) {
                        battleState.log.push(`👻 **${attackerName}** هاجم، لكن **${defenderName}** راوغ ببراعة!`);
                        triggerAnnouncer(battleState, `مراوغة أسطورية من ${defenderName}! هجوم ${attackerName} ذهب في الهواء!`);
                    } else {
                        if (defender.effects.rebound_active > 0) {
                            const reflected = attackerHpBefore - attacker.hp;
                            if (reflected > 0) battleState.log.push(`🔄 **${defenderName}** عكس **${reflected}** من الضرر!`);
                        }
                        defender.hp -= dmg;

                        if (!isPvE && battleState.stats && battleState.stats[attackerId]) battleState.stats[attackerId].damageDealt += dmg;

                        if (dmg > 0) {
                            battleState.log.push(`⚔️ **${attackerName}** هاجم وألحق **${dmg}** ضرر!`);
                            triggerAnnouncer(battleState, `اللاعب ${attackerName} ضرب خصمه بقوة وسلب منه ${dmg} نقطة صحة!`);
                        } else {
                            battleState.log.push(`🛡️ **${defenderName}** امتص الضربة بالكامل!`);
                            triggerAnnouncer(battleState, `اللاعب ${defenderName} تصدى للضربة ببراعة ولم يتأثر أبداً!`);
                        }

                        const breakMsg = checkShieldBreakGlobal(battleState, defenderId);
                        if (breakMsg) battleState.log.push(breakMsg);
                    }
                }
            }
        }

        if (defender.hp <= 0) {
            defender.hp = 0;
            const { embeds, components, files } = await core.buildBattleEmbed(battleState);
            await i.editReply({ embeds, components, files });
            triggerAnnouncer(battleState, `الضربة القاضية من ${attackerName}! سقط الخصم أرضاً وانتهت المعركة!`);
            await core.endBattle(battleState, attackerId, db, "win", calculateMoraBuff);
            return;
        }
        if (attacker.hp <= 0) {
            attacker.hp = 0;
            const { embeds, components, files } = await core.buildBattleEmbed(battleState);
            await i.editReply({ embeds, components, files });
            await core.endBattle(battleState, defenderId, db, "win", calculateMoraBuff);
            return;
        }

        battleState.turn = [defenderId, attackerId];
        const { embeds, components, files } = await core.buildBattleEmbed(battleState);
        await i.editReply({ embeds, components, files });

        if (isPvE && battleState.turn[0] === "monster") processMonsterTurn(battleState, db).catch(err => console.error(err));
        else if (isPvE && battleState.turn[0] === "guard") processGuardTurn(battleState, db).catch(err => console.error(err));
        else if (battleState.isBotMatch && battleState.turn[0] === battleState.message.client.user.id) botAI.processTestingBotTurn(battleState, db, core, calculateMoraBuff).catch(err => console.error(err));
        else battleState.processingTurn = false;

    } catch (err) {
        console.error("[PvP Handler Error]", err);
        await i.editReply({ content: "حدث خطأ أثناء المعركة." }).catch(() => {});
    } finally {
        if (battleState && (!isPvE || (battleState.turn[0] !== "monster" && battleState.turn[0] !== "guard"))) battleState.processingTurn = false;
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
