const { 
    EmbedBuilder, 
    ActionRowBuilder, 
    StringSelectMenuBuilder 
} = require('discord.js');

const { 
    EMOJI_MORA, 
    OWNER_ID, 
    potionItems,
    ITEM_LIMITS 
} = require('../constants'); 

const { 
    applyDamageToPlayer, 
    getRealPlayerData,
    calculateThreat 
} = require('../utils');

const { 
    checkBossPhase 
} = require('../monsters');

const { handleSkillUsage } = require('../skills');

const { 
    buildSkillSelector, 
    buildPotionSelector, 
    generateBattleEmbed 
} = require('../ui');

const weaponCalculator = require('../../combat/weapon-calculator');
const { cleanName } = require('../core/battle-utils'); 
const { handleOwnerMenu } = require('../actions/owner-menu');
const { saveDungeonState } = require('../core/state-manager');
const { getFloorCaps } = require('./seal-system'); 

async function handlePlayerBattleInteraction(i, context) {
    const {
        players, monster, floor, theme, log, threadChannel, db, guild, hostId,
        activeDungeonRequests, merchantState, retreatState, retreatedPlayers, isTrapActive,
        totalAccumulatedCoins, totalAccumulatedXP, battleMsg, turnTimeout, collector,
        ongoingRef, actedPlayers, processingUsers
    } = context;

    const sql = db;

    const isOwnerDefend = (i.customId === 'def' && i.user.id === OWNER_ID);

    if (!isOwnerDefend) {
        if (!i.replied && !i.deferred && !i.isStringSelectMenu() && !i.isModalSubmit()) {
            try { await i.deferUpdate(); } catch (e) {}
        }
    }

    if (processingUsers.has(i.user.id)) return; 
    const { damageCap, levelCap } = getFloorCaps(floor);

    if (isOwnerDefend) {
        try { await handleOwnerMenu(i, players, monster, log, threadChannel, sql, guild, hostId, activeDungeonRequests, merchantState, battleMsg, turnTimeout, collector, ongoingRef); } catch (err) {}
        if (!ongoingRef.value) { if (!collector.ended) collector.stop('owner_action'); return { ongoing: false }; }
        return { ongoing: true };
    }

    if (i.user.id === OWNER_ID && !players.find(p => p.id === OWNER_ID)) {
        const member = await i.guild.members.fetch(OWNER_ID).catch(() => null);
        if (member) {
            try {
                let ownerPlayer = getRealPlayerData(member, sql, 'Leader'); 
                if (ownerPlayer instanceof Promise) ownerPlayer = await ownerPlayer; 
                
                ownerPlayer.id = OWNER_ID; 
                ownerPlayer.name = cleanName(ownerPlayer.name || member.displayName);
                ownerPlayer.isDead = false;
                if (!ownerPlayer.hp) ownerPlayer.hp = ownerPlayer.maxHp || 999999;
                
                players.push(ownerPlayer);
                log.push(`👑 **الإمبـراطـور اقتحـم المعركـة ليساند فريقه!**`);
            } catch (e) {
                console.error("[Emperor Join Error]", e);
            }
        }
    }
        
    let p = players.find(pl => pl.id === i.user.id);
    if (!p) return i.followUp({ content: "🚫 لست مشاركاً!", ephemeral: true }).catch(()=>{});
    if (p.isDead || actedPlayers.includes(p.id)) return { ongoing: true };

    if (p.effects && p.effects.some(e => e.type === 'stun')) {
        await i.followUp({ content: "🚫 **أنت مشلول ولا تستطيع الحركة هذا الدور!**", ephemeral: true });
        actedPlayers.push(p.id); p.skipCount = 0; 
        log.push(`❄️ **${p.name}** مشلول ولم يستطع التحرك!`);
        await battleMsg.edit({ content: '', embeds: [generateBattleEmbed(players, monster, floor, theme, log, actedPlayers)] }).catch(()=>{});
        if (actedPlayers.length >= players.filter(pl => !pl.isDead).length) { clearTimeout(turnTimeout); collector.stop('turn_end'); }
        return { ongoing: true };
    }
        
    processingUsers.add(i.user.id);

    try {
        if (i.customId === 'skill') {
            const skillRow = buildSkillSelector(p);
            if (!skillRow) {
                await i.followUp({ content: "❌ لا توجد مهارات.", ephemeral: true });
                processingUsers.delete(i.user.id); return { ongoing: true };
            }
            try {
                const skillMsg = await i.followUp({ content: "✨ **اختر المهارة:**", components: [skillRow], ephemeral: true });
                const selection = await skillMsg.awaitMessageComponent({ filter: subI => subI.user.id === i.user.id, time: 10000 });
                await selection.deferUpdate().catch(()=>{}); 

                const skillId = selection.values[0];
                
                // 🔥 تم الإصلاح: حصر المنع على مهارة الدرع الأساسية فقط 🔥
                const shieldSkills = ['skill_shielding'];
                if (shieldSkills.includes(skillId) && p.shield > 0) {
                    await selection.followUp({ content: `🛡️ **لديك درع نشط بالفعل!**`, ephemeral: true });
                    processingUsers.delete(i.user.id); return { ongoing: true }; 
                }

                let skillNameUsed = "مهارة";
                let skillObj = { id: skillId, name: 'Skill', effectValue: 0, level: 1 };
                
                if (!skillId.startsWith('class_') && skillId !== 'class_special_skill' && skillId !== 'skill_secret_owner' && skillId !== 'skill_owner_leave') {
                     if (p.skills && p.skills[skillId]) { skillObj = { ...p.skills[skillId] }; if (skillObj.level > levelCap) skillObj.level = levelCap; }
                }

                let selectedTargetId = null;
                if ((p.class === 'Priest' || p.isHybridPriest) && (skillId === 'class_special_skill' || skillId === 'hybrid_heal')) {
                    const revivableDead = players.filter(m => m.isDead && !m.isPermDead);
                    if (revivableDead.length > 0) {
                        const targetOptions = revivableDead.map(deadPlayer => ({
                            label: `إنعاش: ${deadPlayer.name}`,
                            value: deadPlayer.id,
                            description: `قابل للإنعاش - HP: 0/${deadPlayer.maxHp}`,
                            emoji: '✨'
                        }));

                        targetOptions.push({
                            label: 'تجاهل الموتى وشفاء الأحياء',
                            value: 'heal_team_only',
                            description: 'توزيع الشفاء على أعضاء الفريق الأحياء',
                            emoji: '❤️'
                        });

                        const targetRow = new ActionRowBuilder().addComponents(
                            new StringSelectMenuBuilder()
                                .setCustomId('priest_target_select')
                                .setPlaceholder('اختر من تريد إنعاشه...')
                                .addOptions(targetOptions)
                        );

                        const targetMsg = await selection.followUp({ content: '✨ **توجد أرواح تنتظر الإنعاش، اختر هدفك:**', components: [targetRow], ephemeral: true });
                        try {
                            const targetInteraction = await targetMsg.awaitMessageComponent({ filter: subI => subI.user.id === i.user.id, time: 15000 });
                            await targetInteraction.deferUpdate().catch(()=>{});
                            selectedTargetId = targetInteraction.values[0];
                        } catch (e) {
                            await targetMsg.edit({ content: '⏰ انتهى وقت اختيار الهدف.', components: [] }).catch(()=>{});
                            processingUsers.delete(i.user.id);
                            return { ongoing: true };
                        }
                    }
                }

                const monsterHpBefore = monster.hp;
                const res = handleSkillUsage(p, { ...skillObj, id: skillId, targetId: selectedTargetId }, monster, log, threadChannel, players);
                const dmgDealt = monsterHpBefore - monster.hp;

                if (dmgDealt > 0) {
                    let finalDmg = dmgDealt;
                    let isCapped = false;
                    if (damageCap !== Infinity && finalDmg > damageCap) {
                        finalDmg = damageCap; monster.hp = Math.max(0, monsterHpBefore - finalDmg); isCapped = true;
                    }
                    if (log.length > 0) {
                        const lastLogIdx = log.length - 1;
                        if (!log[lastLogIdx].includes(finalDmg.toString())) {
                            if (isCapped) log[lastLogIdx] += ` (مختوم: ${finalDmg})`; 
                            else log[lastLogIdx] += ` (**${finalDmg}** 💥)`;
                        }
                    }
                }

                if (res && res.error) {
                    await selection.editReply({ content: res.error, components: [] }).catch(()=>{});
                    processingUsers.delete(i.user.id); return { ongoing: true };
                }
                
                if (res && res.name) skillNameUsed = res.name;
                else if (skillObj.name !== 'Skill') skillNameUsed = skillObj.name;

                p.threat = (p.threat || 0) + 100;
                actedPlayers.push(p.id); p.skipCount = 0; 
                await selection.editReply({ content: `✅ تم استخـدام: ${skillNameUsed}`, components: [] }).catch(()=>{});
                await battleMsg.edit({ content: '', embeds: [generateBattleEmbed(players, monster, floor, theme, log, actedPlayers)] }).catch(()=>{});
                checkBossPhase(monster, log); 
                
                await handleImmediateDeaths(players, threadChannel, ongoingRef, collector, monster);
                if (!ongoingRef.value) return { ongoing: false };

            } catch (err) { processingUsers.delete(i.user.id); return { ongoing: true }; }
        } 
        else if (i.customId === 'heal') {
            const potionRow = await buildPotionSelector(p, sql, guild.id);
            if (!potionRow) {
                await i.followUp({ content: "❌ لا توجد جرعات في الحقيبة.", ephemeral: true });
                processingUsers.delete(i.user.id); return { ongoing: true };
            }
            try {
                const potionMsg = await i.followUp({ content: "🧪 **اختر الجرعة:**", components: [potionRow], ephemeral: true });
                const selection = await potionMsg.awaitMessageComponent({ filter: subI => subI.user.id === i.user.id, time: 20000 }); 
                await selection.deferUpdate().catch(()=>{});
                
                const selectedValue = selection.values[0];

                if (selectedValue === 'buy_potions_action') {
                    let currentMora = 0;
                    try {
                        const userLevelRes = await sql.query(`SELECT "mora" FROM levels WHERE "user" = $1 AND "guild" = $2`, [p.id, guild.id]);
                        if (userLevelRes.rows.length === 0) {
                            const userLevelRes2 = await sql.query(`SELECT mora FROM levels WHERE user = $1 AND guild = $2`, [p.id, guild.id]);
                            currentMora = userLevelRes2.rows.length > 0 ? userLevelRes2.rows[0].mora : 0;
                        } else {
                            currentMora = userLevelRes.rows[0].mora;
                        }
                    } catch(e) {
                        const userLevelRes3 = await sql.query(`SELECT mora FROM levels WHERE userid = $1 AND guildid = $2`, [p.id, guild.id]).catch(()=>({rows:[]}));
                        currentMora = userLevelRes3.rows.length > 0 ? userLevelRes3.rows[0].mora : 0;
                    }

                    const shopOptions = potionItems.map(pot => ({
                        label: `${pot.name} (${pot.price.toLocaleString()} مورا)`,
                        value: pot.id,
                        description: pot.description ? pot.description.substring(0, 50) : "جرعة مفيدة",
                        emoji: pot.emoji
                    }));

                    const shopRow = new ActionRowBuilder().addComponents(
                        new StringSelectMenuBuilder()
                            .setCustomId('shop_buy_select')
                            .setPlaceholder('اختر الجرعة للشراء...')
                            .addOptions(shopOptions)
                    );

                    const shopMsg = await selection.followUp({
                        content: `💰 **متجر الجرعات السريع**\nرصيدك الحالي: **${Number(currentMora).toLocaleString()}** ${EMOJI_MORA}\nاختر الجرعة التي تريد شراءها:`,
                        components: [shopRow],
                        ephemeral: true
                    });

                    try {
                        const buyInteraction = await shopMsg.awaitMessageComponent({ time: 15000 });
                        await buyInteraction.deferUpdate();
                        
                        const itemID = buyInteraction.values[0];
                        const targetItem = potionItems.find(x => x.id === itemID);

                        if (Number(currentMora) < targetItem.price) {
                            await buyInteraction.followUp({ content: `❌ **لا تملك مورا كافية!** تحتاج ${targetItem.price} مورا.`, ephemeral: true });
                        } else {
                            try { await sql.query(`UPDATE levels SET "mora" = CAST(COALESCE("mora", '0') AS BIGINT) - $1 WHERE "user" = $2 AND "guild" = $3`, [targetItem.price, p.id, guild.id]); } 
                            catch(e) { await sql.query(`UPDATE levels SET mora = CAST(COALESCE(mora, '0') AS BIGINT) - $1 WHERE userid = $2 AND guildid = $3`, [targetItem.price, p.id, guild.id]).catch(()=>{}); }
                            
                            try {
                                const check = await sql.query(`SELECT "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [p.id, guild.id, targetItem.id]);
                                if (check.rows.length > 0) {
                                    await sql.query(`UPDATE user_inventory SET "quantity" = "quantity" + 1 WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [p.id, guild.id, targetItem.id]);
                                } else {
                                    await sql.query(`INSERT INTO user_inventory ("guildID", "userID", "itemID", "quantity") VALUES ($1, $2, $3, 1)`, [guild.id, p.id, targetItem.id]);
                                }
                            } catch (e) {
                                const check2 = await sql.query(`SELECT quantity FROM user_inventory WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [p.id, guild.id, targetItem.id]);
                                if (check2.rows.length > 0) {
                                    await sql.query(`UPDATE user_inventory SET quantity = quantity + 1 WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [p.id, guild.id, targetItem.id]);
                                } else {
                                    await sql.query(`INSERT INTO user_inventory (guildid, userid, itemid, quantity) VALUES ($1, $2, $3, 1)`, [guild.id, p.id, targetItem.id]);
                                }
                            }

                            await buyInteraction.followUp({ content: `✅ **تم شراء ${targetItem.name}!**\nاضغط على (جرعة) مرة أخرى لفتح حقيبتك واستخدامها.`, ephemeral: true });
                        }
                    } catch (e) {
                        await shopMsg.edit({ content: "⏰ انتهى وقت الشراء.", components: [] }).catch(()=>{});
                    }

                    processingUsers.delete(i.user.id);
                    return { ongoing: true }; 
                }

                const potionId = selectedValue.replace('use_potion_', '');
                
                if (potionId === 'potion_titan') {
                    const limit = (ITEM_LIMITS && ITEM_LIMITS['titan_potion']) ? ITEM_LIMITS['titan_potion'] : 3;
                    p.titanPotionUses = p.titanPotionUses || 0;
                    if (p.titanPotionUses >= limit) {
                        await selection.followUp({ content: `🚫 **لقد استهلكت الحد الأقصى (${limit}) من جرعة العملاق في هذا الدانجون!**`, ephemeral: true });
                        processingUsers.delete(i.user.id);
                        return { ongoing: true };
                    }
                    p.titanPotionUses++; 
                }
                
                if (sql) {
                    try {
                        await sql.query(`UPDATE user_inventory SET "quantity" = "quantity" - 1 WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [p.id, guild.id, potionId]);
                    } catch (e) {
                        await sql.query(`UPDATE user_inventory SET quantity = quantity - 1 WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [p.id, guild.id, potionId]).catch(()=>{});
                    }
                }

                let actionMsg = "";
                if (potionId === 'potion_heal') {
                    p.hp = Math.min(p.maxHp, p.hp + Math.floor(p.maxHp * 0.5));
                    actionMsg = "🧪 استعاد 50% HP!";
                    const threatGen = Math.floor((p.maxHp * 0.5) / 2);
                    p.threat = (p.threat || 0) + threatGen;

                } else if (potionId === 'potion_reflect') {
                    if (!p.effects) p.effects = [];
                    p.effects.push({ type: 'rebound_active', val: 0.5, turns: 2 });
                    actionMsg = "🌵 جهز درع الأشواك!";
                
                } else if (potionId === 'potion_time') {
                    p.special_cooldown = 0; 
                    p.skillCooldowns = {};
                    actionMsg = "⏳ شرب جرعة الزمن وأعاد شحن مهاراته!";
                
                } else if (potionId === 'potion_titan') {
                    p.maxHp *= 2; p.hp = p.maxHp;
                    if (!p.effects) p.effects = [];
                    p.effects.push({ type: 'titan', floors: 5 }); 
                    monster.targetFocusId = p.id;
                    const used = p.titanPotionUses || 1;
                    const limit = (ITEM_LIMITS && ITEM_LIMITS['titan_potion']) ? ITEM_LIMITS['titan_potion'] : 3;
                    actionMsg = `🔥 تحول لعملاق! (يستمر لـ 5 طوابق) (${used}/${limit})`;
                    p.threat = (p.threat || 0) + 1000;

                } else if (potionId === 'potion_sacrifice') {
                    p.hp = 0; p.isDead = true; p.isPermDead = true; p.deathFloor = floor; 
                    players.forEach(ally => {
                        if (ally.id !== p.id) {
                            ally.isDead = false; ally.isPermDead = false; ally.reviveCount = 0;
                            ally.hp = ally.maxHp; ally.effects = [];
                        }
                    });
                    actionMsg = "💀 شرب جرعة التضحية، تحللت جثته وأنقذ الجميع!";
                    threadChannel.send(`💀 **${p.name}** شرب جرعة التضحية، تحللت جثته وأنقذ الفريق!`).catch(()=>{});
                }
                
                log.push(`**${p.name}**: ${actionMsg}`);
                actedPlayers.push(p.id); p.skipCount = 0; 
                await selection.editReply({ content: `✅ ${actionMsg}`, components: [] }).catch(()=>{});
                
                await battleMsg.edit({ 
                    content: '', 
                    embeds: [generateBattleEmbed(players, monster, floor, theme, log, actedPlayers)] 
                }).catch(()=>{});

                await saveDungeonState(sql, threadChannel.id, guild.id, hostId, {
                    floor, players, merchantState, retreatedPlayers, isTrapActive, retreatState, 
                    loot: { coins: totalAccumulatedCoins, xp: totalAccumulatedXP },
                    themeName: theme.name, monsterData: monster
                });

                await handleImmediateDeaths(players, threadChannel, ongoingRef, collector, monster);
                if (!ongoingRef.value) return { ongoing: false };

            } catch (err) { processingUsers.delete(i.user.id); return { ongoing: true }; }
        } 
        else if (i.customId === 'atk' || i.customId === 'def') {
            actedPlayers.push(p.id); p.skipCount = 0; 
            if (i.customId === 'atk') {
                let canAttack = true;
                const confusion = p.effects ? p.effects.find(e => e.type === 'confusion') : null;
                if (confusion && Math.random() < confusion.val) {
                    canAttack = false;
                    const selfDmg = Math.floor(p.maxHp * 0.15); 
                    applyDamageToPlayer(p, selfDmg);
                    log.push(`😵 **${p.name}** في حالة ارتباك وضرب نفسه! (-${selfDmg})`);
                } 
                else if (p.effects && p.effects.some(e => e.type === 'blind' && Math.random() < e.val)) {
                    canAttack = false;
                    log.push(`☁️ **${p.name}** هاجم ولكن أخطأ الهدف بسبب العمى!`);
                }

                if (canAttack) {
                    const isOwner = p.id === OWNER_ID;
                    const monsterHpBefore = monster.hp;
                    const cappedPlayer = { ...p }; 
                    if (cappedPlayer.weaponLevel > levelCap) cappedPlayer.weaponLevel = levelCap;

                    const result = weaponCalculator.executeWeaponAttack(cappedPlayer, monster, isOwner);
                    const dmgDealt = monsterHpBefore - monster.hp;

                    if (dmgDealt > 0) {
                        let finalDmg = dmgDealt;
                        if (damageCap !== Infinity && finalDmg > damageCap) {
                            finalDmg = damageCap;
                            monster.hp = Math.max(0, monsterHpBefore - finalDmg);
                            result.log = result.log.replace(result.damage.toString(), finalDmg.toString());
                            result.log += ` (مختوم)`;
                        }
                    }

                    log.push(result.log);
                    const threatGen = calculateThreat(p, dmgDealt, false);
                    p.threat = (p.threat || 0) + threatGen;
                    checkBossPhase(monster, log);
                }
            } else if (i.customId === 'def') {
                p.defending = true; log.push(`🛡️ **${p.name}** يدافع!`);
                if (p.class === 'Tank') p.threat = (p.threat || 0) + 200;
            }
             
            await battleMsg.edit({ 
                content: '', 
                embeds: [generateBattleEmbed(players, monster, floor, theme, log, actedPlayers)] 
            }).catch(()=>{});

            await handleImmediateDeaths(players, threadChannel, ongoingRef, collector, monster);
            if (!ongoingRef.value) return { ongoing: false };
        }

        if (actedPlayers.length >= players.filter(pl => !pl.isDead).length) { 
            clearTimeout(turnTimeout); collector.stop('turn_end'); 
        }
    } catch (error) { console.error(error); } finally { processingUsers.delete(i.user.id); }

    return { ongoing: true };
}

async function handleImmediateDeaths(players, threadChannel, ongoingRef, collector, monster) {
    const deadThisTurn = players.filter(pl => pl.hp <= 0 && !pl.isDead);
    
    if (deadThisTurn.length > 0) {
        for (const deadP of deadThisTurn) {
            deadP.isDead = true;

            if (deadP.reviveCount && deadP.reviveCount >= 1) {
                deadP.isPermDead = true;
                await threadChannel.send(`☠️ **${deadP.name}** لفظ أنفاسه الأخيرة وتحللت جثته!`).catch(()=>{});
            } else {
                await threadChannel.send(`💀 **${deadP.name}** سقط في أرض المعركة!`).catch(()=>{});
            }

            if (deadP.class === 'Priest') {
                players.forEach(ally => {
                    if (!ally.isDead && ally.id !== deadP.id) {
                        const healAmt = Math.floor(ally.maxHp * 0.20);
                        ally.hp = Math.min(ally.maxHp, ally.hp + healAmt);
                    }
                });
                await threadChannel.send(`✨ **سـقـط الكـاهن وعـالج الفريـق عـلى الرمـق الاخيـر ✨**`).catch(()=>{});
            }
        }
    }
    
    if (players.every(p => p.isDead)) { 
        ongoingRef.value = false; 
        collector.stop('all_dead'); 
    }
    if (monster.hp <= 0) { 
        monster.hp = 0; 
        ongoingRef.value = false; 
        collector.stop('monster_dead'); 
    }
}

module.exports = { handlePlayerBattleInteraction };
