const { EmbedBuilder, Colors } = require('discord.js');

const { EMOJI_MORA, EMOJI_XP, OWNER_ID } = require('./dungeon/constants');
const { ensureInventoryTable, getBaseFloorMora } = require('./dungeon/utils');
const { getRandomMonster, checkBossPhase } = require('./dungeon/monsters');
const { generateBattleEmbed, generateBattleRows } = require('./dungeon/ui');
const { checkDeaths, handleLeaderSuccession } = require('./dungeon/core/battle-utils');
const { setupPlayers } = require('./dungeon/core/setup');
const { sendEndMessage } = require('./dungeon/core/end-game');
const { processMonsterTurn } = require('./dungeon/logic/monster-turn');
const { handleTeamWipe, handleLeaderRetreat, snapshotLootAtFloor20 } = require('./dungeon/core/rewards');

const { getMoraxData, processMoraxTurn } = require('./dungeon/logic/final-boss');

const { saveDungeonState, deleteDungeonState } = require('./dungeon/core/state-manager');
const { handlePlayerBattleInteraction } = require('./dungeon/logic/battle-actions');
const { startStatusMonitor } = require('./dungeon/logic/status-monitor');
const { applyPostBattleUpdates, handleRestMenu } = require('./dungeon/logic/rest-phase');
const { checkSealMessages } = require('./dungeon/logic/seal-system');
const { applyFloorBuffs, handleTrapEvent, handleRandomEvents } = require('./dungeon/logic/floor-events');

const dungeonConfig = require('../json/dungeon-config.json');

async function runDungeon(threadChannel, mainChannel, partyIDs, theme, db, hostId, partyClasses, activeDungeonRequests, startFloor = 1, resumeData = null) {
    const guild = threadChannel.guild;
    const client = threadChannel.client; 
      
    if (!db) {
        return threadChannel.send("⚠️ **خطأ تقني:** قاعدة البيانات غير متصلة حالياً.").catch(() => {});
    }
    await ensureInventoryTable(db); 

    let retreatedPlayers = []; 
    let isTrapActive = false;
    let trapStartFloor = 0;
    let lastEventFloor = -10; 
    let lastEventType = null; 
    let merchantState = { skipFloors: 0, weaknessActive: false, isGateJump: false };
    let retreatState = { range_30_40: false, range_41_50: false, range_51_70: false, range_71_90: false };

    let players = [];
    let totalAccumulatedCoins = 0;
    let totalAccumulatedXP = 0;
    let resumedMonsterData = null;

    if (resumeData) {
        players = resumeData.players;
        merchantState = resumeData.merchantState || merchantState;
        retreatState = resumeData.retreatState || retreatState; 
        totalAccumulatedCoins = resumeData.loot.coins;
        totalAccumulatedXP = resumeData.loot.xp;
        startFloor = resumeData.floor; 
        retreatedPlayers = resumeData.retreatedPlayers || [];
        isTrapActive = resumeData.isTrapActive || false;
        resumedMonsterData = resumeData.monsterData || null;
        
        await threadChannel.send(`🔄 **تم استعادة البيانات!** جاري استكمال المعركة من الطابق **${startFloor}**...`).catch(()=>{});
    } else {
        const themeKey = Object.keys(dungeonConfig.themes).find(key => dungeonConfig.themes[key].name === theme.name) || null;
        players = await setupPlayers(guild, partyIDs, partyClasses, db, OWNER_ID, themeKey);

        if (startFloor > 1) {
             await threadChannel.send(`⛺ **تم استكمال الرحلة!** بدأ الفريق من الطابق **${startFloor}** بصحة كاملة.`).catch(()=>{});
        }
    }

    if (players.length === 0) {
        if (!resumeData) activeDungeonRequests.delete(hostId);
        return threadChannel.send("❌ خطأ: لم يتم العثور على اللاعبين.").catch(() => {});
    }

    const maxFloors = 100; 

    const statusCollector = startStatusMonitor(threadChannel, players);

    for (let floor = startFloor; floor <= maxFloors; floor++) {
        
        if (players.length === 0 || players.every(p => p.isDead)) {
            await deleteDungeonState(db, threadChannel.id); 
            statusCollector.stop(); 
            await handleTeamWipe(players, floor, db, guild.id);
            await sendEndMessage(mainChannel, threadChannel, players, retreatedPlayers, floor, "lose", db, guild.id, hostId, activeDungeonRequests, client);
            return; 
        }

        if (merchantState.skipFloors > 0) {
            let floorsSkipped = 0;
            let targetFloor = 0;

            if (merchantState.isGateJump) {
                targetFloor = merchantState.skipFloors;
                floorsSkipped = targetFloor - floor; 
                merchantState.isGateJump = false;
            } else {
                floorsSkipped = merchantState.skipFloors;
                targetFloor = floor + floorsSkipped;
            }

            merchantState.skipFloors = 0; 
            const oldFloor = floor;
            
            if (targetFloor > maxFloors) targetFloor = maxFloors; 
            
            floor = targetFloor - 1; 

            try {
                await threadChannel.send(`⏩ **انتقال سريع!** تم القفز من الطابق ${oldFloor} إلى ${targetFloor}.`);
            } catch (err) {
                console.log("Error sending message:", err.message);
                break; 
            }
            
            await saveDungeonState(db, threadChannel.id, guild.id, hostId, {
                floor: targetFloor, 
                players, merchantState, retreatState, retreatedPlayers, isTrapActive,
                loot: { coins: totalAccumulatedCoins, xp: totalAccumulatedXP },
                themeName: theme.name, monsterData: null 
            });
            continue; 
        }

        await checkSealMessages(floor, players, threadChannel); 
        await applyFloorBuffs(floor, players, threadChannel);

        for (let p of players) {
            if (!p.isDead) { 
                if (p.shieldPersistent) {
                    p.shieldFloorsCount = (p.shieldFloorsCount || 0) + 1;
                    if (p.shieldFloorsCount > 5) {
                        p.shieldPersistent = false; 
                        p.shield = p.startingShield || 0; 
                        p.shieldFloorsCount = 0;
                        threadChannel.send(`🛡️ **درع المرتزقة** الخاص بـ <@${p.id}> اهترأ وتلاشى بعد صموده 5 طوابق!`).catch(()=>{});
                    } else {
                        p.shield = (p.shield || 0) + (p.startingShield || 0);
                    }
                } else {
                    p.shield = p.startingShield || 0;
                    p.shieldFloorsCount = 0; 
                }
                
                p.startingShield = 0; 
                
                p.effects = p.effects.filter(e => 
                    ['poison', 'atk_buff', 'def_buff', 'weakness', 'titan', 'burn', 'stun', 'rebound_active', 'rebound', 'confusion'].includes(e.type)
                );
                
                p.defending = false; 
                p.summon = null; 
            } 
        }

        let monster;
        if (resumedMonsterData) {
            monster = resumedMonsterData;
            resumedMonsterData = null; 
        } 
        else if (floor === 100) {
            monster = getMoraxData();
        }
        else {
            let monsterType = 'minion'; 
            if (floor >= 31) monsterType = 'boss';
            else if (floor >= 21) monsterType = 'guardian';
            else if (floor >= 11) monsterType = 'elite';
            
            const randomMob = getRandomMonster(monsterType, theme, floor);
            let finalHp, finalAtk;
            
            if (floor <= 10) { finalHp = 300 + ((floor - 1) * 120); finalAtk = 10 + (floor * 1.5); } 
            else if (floor <= 20) { finalHp = 1500 + ((floor - 10) * 300); finalAtk = 28 + ((floor - 10) * 3); } 
            else if (floor <= 30) { finalHp = 5000 + ((floor - 20) * 600); finalAtk = 60 + ((floor - 20) * 4); } 
            else if (floor <= 50) { 
                const tier = floor - 30; 
                finalHp = 12000 + (tier * 1500); finalAtk = 110 + (tier * 7); 
            }
            else { 
                const tier = floor - 50; 
                finalHp = 50000 + (Math.pow(tier, 1.8) * 600); finalAtk = 300 + (tier * 15); 
            }

            monster = {
                isMonster: true, 
                name: `${randomMob.name} (Lv.${floor})`, 
                image: randomMob.image, 
                hp: Math.floor(finalHp), maxHp: Math.floor(finalHp), 
                atk: Math.floor(finalAtk), shield: 0, 
                enraged: false, effects: [], targetFocusId: null, frozen: false,
                memory: { healsUsed: 0, comboStep: 0, lastMove: null } 
            };

            if (floor <= 15) monster.atk = Math.min(monster.atk, 45); 
            else if (floor <= 25) monster.atk = Math.min(monster.atk, 90); 

            if (merchantState.weaknessActive) {
                monster.effects.push({ type: 'weakness', val: 0.50, turns: 99 });
                merchantState.weaknessActive = false;
            }
        }

        await saveDungeonState(db, threadChannel.id, guild.id, hostId, {
            floor, players, merchantState, retreatedPlayers, isTrapActive, retreatState, 
            loot: { coins: totalAccumulatedCoins, xp: totalAccumulatedXP },
            themeName: theme.name, monsterData: monster 
        });

        let log = [`⚠️ **الطابق ${floor}/${maxFloors}**: ظهر **${monster.name}**! (HP: ${monster.hp.toLocaleString()} | DMG: ${monster.atk})`];
        if (monster.effects.some(e => e.type === 'weakness')) log.push(`👁️ **تم كشف نقطة ضعف الوحش!** (+50% ضرر إضافي)`);

        let ongoing = true;
        let turnCount = 0;

        let battleMsg;
        try {
            battleMsg = await threadChannel.send({ 
                content: '', 
                embeds: [generateBattleEmbed(players, monster, floor, theme, log, [])], 
                components: generateBattleRows() 
            });
        } catch (err) {
            console.log("Dungeon Stop: Thread likely deleted.");
            break;
        }

        while (ongoing) {
            const collector = battleMsg.createMessageComponentCollector({ time: 24 * 60 * 60 * 1000 });
            let actedPlayers = [];
            let processingUsers = new Set(); 
            let ongoingRef = { value: true }; 

            await new Promise(resolve => {
                const turnTimeout = setTimeout(async () => { 
                    const afkPlayers = players.filter(p => !p.isDead && !actedPlayers.includes(p.id));
                      
                    if (afkPlayers.length > 0) {
                        for (const afkP of afkPlayers) {
                            afkP.skipCount = (afkP.skipCount || 0) + 1;
                            
                            if (afkP.skipCount >= 5) {
                                afkP.hp = 0; afkP.isDead = true; afkP.isPermDead = true; afkP.deathFloor = floor;
                                
                                const debuffDuration = 60 * 60 * 1000; const expiresAt = Date.now() + debuffDuration;
                                if (db) {
                                    await db.query(`INSERT INTO user_buffs ("guildID", "userID", "buffPercent", "expiresAt", "buffType", "multiplier") VALUES ($1, $2, $3, $4, $5, $6)`, [guild.id, afkP.id, -100, expiresAt, 'mora', -1.0]).catch(()=>{});
                                    await db.query(`INSERT INTO user_buffs ("guildID", "userID", "buffPercent", "expiresAt", "buffType", "multiplier") VALUES ($1, $2, $3, $4, $5, $6)`, [guild.id, afkP.id, -100, expiresAt, 'xp', -1.0]).catch(()=>{});
                                }
                                log.push(`☠️ **${afkP.name}** ابتـلعـه الدانـجون بسبب الخمـول!`);
                                await threadChannel.send(`✶ <@${afkP.id}> <:emoji_69:1451172248173023263> خـرقـت قوانين الدانجـون بسبب خمولك المستمـر... ابتلعك الدانجون وتم لعنـك بـ -100% اضعاف`).catch(()=>{});

                                if (afkP.class === 'Priest') {
                                    players.forEach(ally => {
                                        if (!ally.isDead && ally.id !== afkP.id) {
                                            const healAmt = Math.floor(ally.maxHp * 0.20);
                                            ally.hp = Math.min(ally.maxHp, ally.hp + healAmt);
                                        }
                                    });
                                    await threadChannel.send(`✨ **سـقـط الكـاهن وعـالج الفريـق عـلى الرمـق الاخيـر ✨**`).catch(()=>{});
                                }

                            } else {
                                monster.targetFocusId = afkP.id; actedPlayers.push(afkP.id); 
                                await threadChannel.send(`<:downward:1435880484046372914> <@${afkP.id}> تم تخطي دورك بسبب عدم الاستجابة! (تحذير ${afkP.skipCount}/5)`).catch(()=>{});
                            }
                        }
                        
                        handleLeaderSuccession(players, log);

                        if (players.every(p => p.isDead)) { ongoing = false; collector.stop('all_dead'); return; }
                        log.push(`⚠️ تم تخطي دور اللاعبين الخاملين.`);
                        collector.stop('turn_end'); 
                    } else {
                        collector.stop('turn_end');
                    }
                }, 45000); 

                collector.on('collect', async i => {
                    const context = {
                        players, monster, floor, theme, log, threadChannel, db, guild, hostId,
                        activeDungeonRequests, merchantState, retreatState, retreatedPlayers, isTrapActive,
                        totalAccumulatedCoins, totalAccumulatedXP, battleMsg, turnTimeout, collector,
                        ongoingRef, actedPlayers, processingUsers
                    };
                
                    const result = await handlePlayerBattleInteraction(i, context);
                    
                    if (result && !result.ongoing) {
                        ongoing = false;
                    }
                });
                
                collector.on('end', () => { clearTimeout(turnTimeout); resolve(); });
            });

            if (monster.hp <= 0) { 
                ongoing = false; 
                monster.hp = 0; 

                try {
                    await battleMsg.edit({ 
                        content: `**💀 سقط ${monster.name} مضرّجاً بدمائه!**`, 
                        embeds: [generateBattleEmbed(players, monster, floor, theme, log, [], '#000000')], 
                        components: [] 
                    }).catch(()=>{}); 
                } catch (e) { }

                await new Promise(r => setTimeout(r, 2500));
            }

            players.forEach(p => { 
                for (const sid in p.skillCooldowns) if (p.skillCooldowns[sid] > 0) p.skillCooldowns[sid]--; 
                if (p.special_cooldown > 0) p.special_cooldown--; 
                
                p.effects = p.effects.filter(e => { 
                    if (e.floors) return true; 
                    if (e.turns !== undefined) e.turns--; 
                    if (e.turns <= 0) return false; 
                    return true; 
                });
            });

            if (turnCount % 3 === 0 && ongoing) {
                try {
                    await battleMsg.delete().catch(()=>{});
                    battleMsg = await threadChannel.send({ 
                        content: '', 
                        embeds: [generateBattleEmbed(players, monster, floor, theme, log, [])], 
                        components: generateBattleRows() 
                    });
                } catch(e) { break; }
            }

            if (monster.hp > 0 && ongoing) {
                turnCount++;
                
                if (floor === 100) {
                    ongoing = await processMoraxTurn(monster, players, log, turnCount, battleMsg, floor, theme, threadChannel);
                } else {
                    ongoing = await processMonsterTurn(monster, players, log, turnCount, battleMsg, floor, theme, threadChannel);
                }
                
                if (ongoing) handleLeaderSuccession(players, log);
            }
        }

        if (players.every(p => p.isDead)) {
            const finalFloor = isTrapActive ? trapStartFloor : floor;
            await deleteDungeonState(db, threadChannel.id); 
            statusCollector.stop(); 
            await handleTeamWipe(players, floor, db, guild.id);
            await sendEndMessage(mainChannel, threadChannel, players, retreatedPlayers, finalFloor, "lose", db, guild.id, hostId, activeDungeonRequests, client);
            return; 
        }

        if (floor === maxFloors) {
            const moraxMora = getBaseFloorMora(100);
            const moraxXp = Math.floor(moraxMora * 0.10); 

            totalAccumulatedCoins += moraxMora;
            totalAccumulatedXP += moraxXp;

            players.forEach(p => { 
                if (!p.isDead) { 
                    p.loot.mora += moraxMora; 
                    p.loot.xp += moraxXp; 
                } 
            });
            break; 
        }
          
        const lootTotals = { coins: totalAccumulatedCoins, xp: totalAccumulatedXP };
        await applyPostBattleUpdates(players, floor, threadChannel, lootTotals);
        totalAccumulatedCoins = lootTotals.coins;
        totalAccumulatedXP = lootTotals.xp;

        const restImage = theme.rest_image || dungeonConfig.themes[theme.name]?.rest_image || 'https://i.postimg.cc/KcJ6gtzV/22.jpg';

        const restContext = {
            floor, players, retreatState, retreatedPlayers, 
            totalAccumulatedCoins, totalAccumulatedXP, 
            threadChannel, db, guild, log,
            theme, 
            restImage 
        };

        const decision = await handleRestMenu(restContext);

        if (decision === 'time' || decision === 'end_error') { 
            await deleteDungeonState(db, threadChannel.id); 
            players.forEach(p => { p.isDead = true; p.hp = 0; p.deathFloor = floor; });
            await threadChannel.send(`💀 **انتهى الوقت!** ابتلع ظلام الدانجون الفريق بأكمله...`).catch(()=>{});
            statusCollector.stop(); 
            await handleTeamWipe(players, floor, db, guild.id);
            await sendEndMessage(mainChannel, threadChannel, players, retreatedPlayers, floor, "lose", db, guild.id, hostId, activeDungeonRequests, client);
            return; 
        } 
        else if (decision === 'camp') {
            await deleteDungeonState(db, threadChannel.id);
            statusCollector.stop();
            
            await threadChannel.send(`⛺ **تم نصب الخيام بنجاح!**\nتم حفظ تقدمكم عند الطابق **${floor + 1}**. سيتم الآن توزيع الغنائم وإغلاق البوابة.`).catch(()=>{});

            await handleLeaderRetreat(players, db, guild.id);
            await sendEndMessage(mainChannel, threadChannel, players, retreatedPlayers, floor, "camp", db, guild.id, hostId, activeDungeonRequests, client);
            return; 
        }
        else if (decision === 'retreat') {
            await deleteDungeonState(db, threadChannel.id); 
            statusCollector.stop(); 
            await handleLeaderRetreat(players, db, guild.id);
            await sendEndMessage(mainChannel, threadChannel, players, retreatedPlayers, floor, "retreat", db, guild.id, hostId, activeDungeonRequests, client);
            return; 
        } 
        else if (decision === 'continue') {
            const trapResult = await handleTrapEvent(floor, players, threadChannel, isTrapActive);
            if (trapResult.triggered) {
                isTrapActive = true;
                trapStartFloor = floor;
                floor = trapResult.newFloor - 1; 
            } else {
                await threadChannel.send(`⚔️ **يتوغل الفريق بالدانجون نحو طوابق أعمق...**`).catch(()=>{});
                
                const eventResult = await handleRandomEvents(floor, lastEventFloor, lastEventType, threadChannel, players, db, guild.id, merchantState, isTrapActive);
                if (eventResult.type !== lastEventType) {
                    lastEventType = eventResult.type;
                    lastEventFloor = eventResult.floor;
                }
            }
        }
    }

    const alivePlayers = players.filter(p => !p.isDead);
    if (alivePlayers.length > 0) {
        await deleteDungeonState(db, threadChannel.id);
        statusCollector.stop(); 

        // 🔥 تم حماية الصورة هنا! 
        const bossImage = (dungeonConfig.final_boss && dungeonConfig.final_boss.image) 
            ? dungeonConfig.final_boss.image 
            : 'https://i.postimg.cc/WzRGhgJ9/mwraks.png';

        const winEmbed = new EmbedBuilder()
            .setTitle('👑 اعتـراف الإمبـراطـور: اجتيـاز الاختبـار الأعظـم 👑')
            .setDescription(`**"أحسنتـم... لم أتوقع أن تصمدوا أمامي لكل هذا الوقت."**\n\nتـمت تصفيـة الدانجـون بنجـاح، فالتسجـل امبراطوريتـنـا اسمأئكـم بين العظمـاء!`)
            .setColor(Colors.Gold)
            .setImage(bossImage)
            .setTimestamp();

        const mentions = alivePlayers.map(p => `<@${p.id}>`).join(' ');

        try {
            await threadChannel.send({ content: `🎉 ${mentions}`, embeds: [winEmbed] });
        } catch (err) {
            console.log("⚠️ تعذر إرسال رسالة الفوز (الثريد محذوف).");
        }

        await handleLeaderRetreat(alivePlayers, db, guild.id);
        await sendEndMessage(mainChannel, threadChannel, players, retreatedPlayers, 100, "win", db, guild.id, hostId, activeDungeonRequests, client);
    }
} 

module.exports = { runDungeon };
