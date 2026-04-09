const { SlashCommandBuilder, EmbedBuilder, Colors, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags, AttachmentBuilder } = require("discord.js");
const path = require('path');
let generateFishingCard;
try {
    ({ generateFishingCard } = require('../../generators/fishing-card-generator.js'));
} catch (e) {
    ({ generateFishingCard } = require('../generators/fishing-card-generator.js'));
}

let updateGuildStat, addXPAndCheckLevel;
try {
    ({ updateGuildStat } = require('../../handlers/guild-board-handler.js'));
    ({ addXPAndCheckLevel } = require('../../handlers/handler-utils.js'));
} catch (e) {
    try {
        ({ updateGuildStat } = require('../handlers/guild-board-handler.js'));
        ({ addXPAndCheckLevel } = require('../handlers/handler-utils.js'));
    } catch(e2) {}
}

const rootDir = process.cwd();
const fishingConfig = require(path.join(rootDir, 'json', 'fishing-config.json'));

let pvpCore;
try { pvpCore = require(path.join(rootDir, 'handlers', 'pvp-core.js')); } 
catch (e) { pvpCore = {}; }

if (typeof pvpCore.getWeaponData !== 'function') pvpCore.getWeaponData = () => ({ name: "سكين صيد صدئة", currentDamage: 15, currentLevel: 1 });
if (typeof pvpCore.getUserActiveSkill !== 'function') pvpCore.getUserActiveSkill = () => null;
if (typeof pvpCore.startPveBattle !== 'function') pvpCore.startPveBattle = async (i) => { await i.followUp({ content: "⚠️ حدث خطأ: نظام القتال غير جاهز.", flags: [MessageFlags.Ephemeral] }); };

const fishItems = fishingConfig.fishItems || [];
const rodsConfig = fishingConfig.rods || [];
const boatsConfig = fishingConfig.boats || [];
const locationsConfig = fishingConfig.locations || [];
const monstersConfig = fishingConfig.monsters || [];

const OWNER_ID = "1145327691772481577";
const EMOJI_MORA = '<:mora:1435647151349698621>';

const activeFishingSessions = new Set();

async function execSafe(db, queryPg, queryLite, params = []) {
    try {
        let res = await db.query(queryPg, params);
        return res || { rows: [] };
    } catch (err1) {
        try {
            let res2 = await db.query(queryLite, params);
            return res2 || { rows: [] };
        } catch (err2) {
            return { rows: [], error: true };
        }
    }
}

async function getCooldownReductionMs(db, userId, guildId) {
    try {
        let repRes = await execSafe(db, `SELECT "rep_points" FROM user_reputation WHERE "userID" = $1 AND "guildID" = $2`, `SELECT rep_points FROM user_reputation WHERE userid = $1 AND guildid = $2`, [userId, guildId]);
        
        const points = repRes.rows[0]?.rep_points || 0;
        
        let reductionMinutes = 0;
        if (points >= 1000) reductionMinutes = 30;
        else if (points >= 500) reductionMinutes = 15;
        else if (points >= 250) reductionMinutes = 10;
        else if (points >= 100) reductionMinutes = 8;
        else if (points >= 50) reductionMinutes = 7;
        else if (points >= 25) reductionMinutes = 6;
        else if (points >= 10) reductionMinutes = 5;

        return reductionMinutes * 60 * 1000;
    } catch(e) { return 0; }
}

function cleanDisplayName(name) {
    if (!name) return "لاعب";
    return name.replace(/<a?:.+?:\d+>/g, '').trim();
}

module.exports = {
    data: new SlashCommandBuilder().setName('صيد').setDescription('ابـدأ رحـلـة صيد تفاعلية جديدة'),
    name: 'fish',
    aliases: ['صيد', 'ص', 'fishing'],
    category: "Economy",
    description: "صيد الأسماك بنظام الشد والجذب الرسومي المستند على ندرة السمكة.",

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        const user = isSlash ? interactionOrMessage.user : interactionOrMessage.author;
        const guild = interactionOrMessage.guild;
        const member = interactionOrMessage.member; 
        const client = interactionOrMessage.client;
        const sql = client.sql;

        const reply = async (payload) => {
            if (payload.ephemeral) { delete payload.ephemeral; payload.flags = [MessageFlags.Ephemeral]; }
            if (isSlash) {
                if (interactionOrMessage.deferred || interactionOrMessage.replied) return interactionOrMessage.editReply(payload);
                return interactionOrMessage.reply({ ...payload, fetchReply: true }); 
            }
            return interactionOrMessage.reply(payload);
        };

        if (activeFishingSessions.has(user.id)) {
            return reply({ content: "⚠️ **لديك رحلة صيد جارية!** ركز على سنارتك.", ephemeral: true });
        }
        activeFishingSessions.add(user.id);

        try {
            let userDataRes = await execSafe(sql, 'SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2', 'SELECT * FROM levels WHERE userid = $1 AND guildid = $2', [user.id, guild.id]);
            let userData = userDataRes.rows[0];

            if (!userData) {
                userData = { user: user.id, guild: guild.id, rodLevel: 1, boatLevel: 1, currentLocation: 'beach', lastFish: 0, xp: 0, mora: 0, totalXP: 0, level: 1 };
                await execSafe(sql, 'INSERT INTO levels ("user", "guild", "xp", "totalXP", "level", "mora", "rodLevel", "boatLevel", "currentLocation", "lastFish") VALUES ($1, $2, 0, 0, 1, 0, 1, 1, $3, $4)', 'INSERT INTO levels (userid, guildid, xp, totalxp, level, mora, rodlevel, boatlevel, currentlocation, lastfish) VALUES ($1, $2, 0, 0, 1, 0, 1, 1, $3, $4)', [user.id, guild.id, 'beach', '0']);
            }

            const now = Date.now();
            const nowStr = String(now);
            const baseCooldown = 3600000; 
            const reductionMs = await getCooldownReductionMs(sql, user.id, guild.id);
            const cooldown = Math.max(0, baseCooldown - reductionMs);
            const lastFish = Number(userData.lastFish || userData.lastfish) || 0;
            
            if (user.id !== OWNER_ID && (now - lastFish < cooldown)) {
                const remaining = lastFish + cooldown - now;
                const minutes = Math.floor((remaining % 3600000) / 60000);
                const seconds = Math.floor((remaining % 60000) / 1000).toString().padStart(2, '0');
                activeFishingSessions.delete(user.id);
                return reply({ content: `⏳ رميت السنارة مؤخراً! الأسماك حذرة الآن، انتظر **${minutes}:${seconds}** دقيقة لتعود للصيد.` });
            }

            let woundedDebuffRes = await execSafe(sql, `SELECT "expiresAt" FROM user_buffs WHERE "userID" = $1 AND "guildID" = $2 AND "buffType" = 'pvp_wounded' AND "expiresAt" > $3`, `SELECT expiresat FROM user_buffs WHERE userid = $1 AND guildid = $2 AND bufftype = 'pvp_wounded' AND expiresat > $3`, [user.id, guild.id, now]);
            const woundedDebuff = woundedDebuffRes.rows[0];
            if (woundedDebuff) {
                activeFishingSessions.delete(user.id);
                const minutesLeft = Math.ceil((Number(woundedDebuff.expiresAt || woundedDebuff.expiresat) - now) / 60000);
                return reply({ content: `🩹 | أنت **جريح** حالياً! عليك الراحة لمدة **${minutesLeft}** دقيقة.`, ephemeral: true });
            }

            if (user.id !== OWNER_ID) {
                await execSafe(sql, `UPDATE levels SET "lastFish" = $1 WHERE "user" = $2 AND "guild" = $3`, `UPDATE levels SET lastfish = $1 WHERE userid = $2 AND guildid = $3`, [nowStr, user.id, guild.id]);
                if (typeof client.getLevel === 'function' && typeof client.setLevel === 'function') {
                    let cacheData = await client.getLevel(user.id, guild.id);
                    if (cacheData) { cacheData.lastFish = nowStr; await client.setLevel(cacheData); }
                }
            }

            let userFishingRes = await execSafe(sql, `SELECT * FROM user_fishing WHERE "userID" = $1 AND "guildID" = $2`, `SELECT * FROM user_fishing WHERE userid = $1 AND guildid = $2`, [user.id, guild.id]);
            let fishingData = userFishingRes.rows[0];
            
            let activeRodLevel = fishingData ? Number(fishingData.rodLevel || fishingData.rodlevel || 1) : Number(userData.rodLevel || userData.rodlevel || 1);
            let activeBoatLevel = fishingData ? Number(fishingData.boatLevel || fishingData.boatlevel || 1) : Number(userData.boatLevel || userData.boatlevel || 1);

            const currentRod = rodsConfig.find(r => r.level === activeRodLevel) || rodsConfig[0];
            const currentBoat = boatsConfig.find(b => b.level === activeBoatLevel) || boatsConfig[0];
            
            let targetLocationIndex = locationsConfig.findIndex(l => l.id === currentBoat.location_id);
            if (targetLocationIndex === -1) targetLocationIndex = 0;
            
            let activeLocation = locationsConfig[targetLocationIndex];
            
            while (activeLocation && currentRod.level < activeLocation.min_rod && targetLocationIndex > 0) {
                targetLocationIndex--;
                activeLocation = locationsConfig[targetLocationIndex];
            }
            
            const locationId = activeLocation.id;
            const currentLocation = activeLocation;

            let repLuckBonus = 0;
            let repRankText = "";
            let repRes = await execSafe(sql, `SELECT "rep_points" FROM user_reputation WHERE "userID" = $1 AND "guildID" = $2`, `SELECT rep_points FROM user_reputation WHERE userid = $1 AND guildid = $2`, [user.id, guild.id]);
            const repPoints = repRes.rows[0]?.rep_points || 0;
            
            if (repPoints >= 1000) { repLuckBonus = 10; repRankText = "SS"; }
            else if (repPoints >= 500) { repLuckBonus = 8; repRankText = "S"; }
            else if (repPoints >= 250) { repLuckBonus = 6; repRankText = "A"; }
            else if (repPoints >= 100) { repLuckBonus = 5; repRankText = "B"; }
            else if (repPoints >= 50) { repLuckBonus = 4; repRankText = "C"; }
            else if (repPoints >= 25) { repLuckBonus = 3; repRankText = "D"; }

            let usedBaitName = null;
            let baitLuckBonus = 0;
            
            let userBaitsRes = await execSafe(sql, `SELECT * FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2`, `SELECT * FROM user_inventory WHERE userid = $1 AND guildid = $2`, [user.id, guild.id]);
            const userBaits = userBaitsRes.rows;
            const availableBaits = userBaits.filter(invItem => fishingConfig.baits.some(b => b.id === (invItem.itemID || invItem.itemid) && Number(invItem.quantity) > 0));

            if (availableBaits.length > 0) {
                const richBaits = availableBaits.map(invItem => {
                    const config = fishingConfig.baits.find(b => b.id === (invItem.itemID || invItem.itemid));
                    return { ...invItem, luck: config.luck, name: config.name, id: config.id };
                });
                richBaits.sort((a, b) => b.luck - a.luck);
                const bestBait = richBaits[0];
                
                let checkBait = await execSafe(sql, `SELECT "quantity" FROM user_inventory WHERE "userID" = $1 AND "itemID" = $2`, `SELECT quantity FROM user_inventory WHERE userid = $1 AND itemid = $2`, [user.id, bestBait.id]);
                if (checkBait.rows.length > 0 && Number(checkBait.rows[0].quantity || checkBait.rows[0].Quantity) > 0) {
                    usedBaitName = bestBait.name;
                    baitLuckBonus = bestBait.luck;
                    if (Number(checkBait.rows[0].quantity || checkBait.rows[0].Quantity) > 1) {
                        await execSafe(sql, `UPDATE user_inventory SET "quantity" = "quantity" - 1 WHERE "userID" = $1 AND "itemID" = $2`, `UPDATE user_inventory SET quantity = quantity - 1 WHERE userid = $1 AND itemid = $2`, [user.id, bestBait.id]);
                    } else {
                        await execSafe(sql, `DELETE FROM user_inventory WHERE "userID" = $1 AND "itemID" = $2`, `DELETE FROM user_inventory WHERE userid = $1 AND itemid = $2`, [user.id, bestBait.id]);
                    }
                }
            }

            let isFisherKing = false;
            try {
                const settingsRes = await execSafe(sql, `SELECT "roleFisherKing" FROM settings WHERE "guild" = $1`, `SELECT rolefisherking FROM settings WHERE guild = $1`, [guild.id]);
                const settings = settingsRes.rows[0];
                if (settings && (settings.roleFisherKing || settings.rolefisherking) && member.roles.cache.has(settings.roleFisherKing || settings.rolefisherking)) {
                    isFisherKing = true;
                }
            } catch (e) {}

            let totalLuck = (currentRod.luck_bonus || 0) + baitLuckBonus + repLuckBonus;
            
            let extraBuffsText = "";
            if (repLuckBonus > 0) {
                extraBuffsText += `\n🌟 **بركة السمعة (${repRankText}):** حظ الصيد +${repLuckBonus}%`;
            }
            if (isFisherKing) {
                totalLuck += 20;
                extraBuffsText += `\n👑 **بركة ملك القنص:** حظ الصيد +20%`;
            }

            let allowedRarities = currentLocation.fish_types || [1, 2];
            let maxRarity = currentRod.max_rarity || 2;

            if (!usedBaitName) {
                maxRarity = Math.max(1, maxRarity - 1); 
                allowedRarities = allowedRarities.filter(r => r <= maxRarity);
                if (allowedRarities.length === 0) allowedRarities = [1];
                totalLuck = Math.max(0, totalLuck - 15); 
            }

            const fishCount = Math.floor(Math.random() * currentRod.max_fish) + 1;
            let caughtFish = [];
            let totalValue = 0;

            for (let k = 0; k < fishCount; k++) {
                const rerolls = 1 + Math.floor(totalLuck / 20); 
                let bestFish = null;
                for(let r=0; r<rerolls; r++) {
                    let rarity = allowedRarities[Math.floor(Math.random() * allowedRarities.length)];
                    if (rarity > maxRarity) rarity = maxRarity;
                    const possibleFishList = fishItems.filter(f => f.rarity === rarity);
                    if (possibleFishList.length > 0) {
                        const candidate = possibleFishList[Math.floor(Math.random() * possibleFishList.length)];
                        if (!bestFish || (candidate.rarity > bestFish.rarity || (candidate.rarity === bestFish.rarity && candidate.price > bestFish.price))) {
                            bestFish = candidate;
                        }
                    }
                }
                if (bestFish) {
                    caughtFish.push(bestFish);
                    totalValue += bestFish.price;
                }
            }

            if (caughtFish.length === 0) {
                const trashFish = fishItems.find(f => f.rarity === 1);
                caughtFish.push(trashFish);
                totalValue += trashFish.price;
            }

            let difficultyMultiplier = 1.0 + (totalValue / 2000); 
            difficultyMultiplier = Math.min(1.5, Math.max(1.0, difficultyMultiplier)); 

            if (isSlash) await interactionOrMessage.deferReply();

            let desc = `**العدة:** 🎣 ${currentRod.name} | 🚤 ${currentBoat.name}\n🌊 **الموقع:** ${currentLocation.name}`;
            desc += usedBaitName ? `\n🪱 **الطعم:** ${usedBaitName}` : `\n🪱 **الطعم:** لا يوجد - الأسماك الثمينة لن تقترب!`; 
            desc += extraBuffsText; 

            const loadingMsg = await reply({ content: `**🌊 يرمي السنارة في الماء...**\n${desc}` });
            const waitTime = Math.floor(Math.random() * 3000) + 2000; 

            setTimeout(async () => {
                const baseStartDistance = 120;
                const boatAdvantage = (currentBoat.level * 8);
                const startDistance = Math.max(40, baseStartDistance - boatAdvantage);

                let gameData = {
                    distance: startDistance, 
                    tension: 10,   
                    statusText: "عـلـقـت سمـكـة! اسـحـب الآن!",
                    maxTension: 100 + (currentRod.level * 15), 
                };

                let updateVersion = 0;
                let isGameOver = false;

                const getControlRows = () => {
                    return new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('fish_hard').setLabel('سحب قوي').setStyle(ButtonStyle.Danger).setEmoji('🔴'),
                        new ButtonBuilder().setCustomId('fish_steady').setLabel('سحب متوازن').setStyle(ButtonStyle.Primary).setEmoji('🟡'),
                        new ButtonBuilder().setCustomId('fish_relax').setLabel('إرخاء الخيط').setStyle(ButtonStyle.Success).setEmoji('🟢')
                    );
                };

                const sendUpdate = async (isFinal = false, btnInteraction = null) => {
                    updateVersion++;
                    const currentVersion = updateVersion;
                    
                    try {
                        const tensionPercent = Math.min(Math.max((gameData.tension / gameData.maxTension) * 100, 0), 100);
                        const displayDistance = Math.max(gameData.distance, 0);

                        const imgBuffer = await generateFishingCard(tensionPercent, displayDistance, gameData.statusText, locationId, currentBoat.level, currentRod.level);
                        
                        if (currentVersion !== updateVersion) return; 

                        const attachment = new AttachmentBuilder(imgBuffer, { name: 'fishing-game.png' });
                        const finalContent = isFinal ? `<@${user.id}> **انتهت المحاولة!**` : `<@${user.id}> **انتبه للعداد والمسافة!**`;
                        
                        const updatePayload = {
                            content: finalContent,
                            files: [attachment],
                            components: isFinal ? [] : [getControlRows()]
                        };
                        
                        if (btnInteraction) {
                            await btnInteraction.editReply(updatePayload).catch(()=>{});
                        } else if (isSlash) {
                            await interactionOrMessage.editReply(updatePayload).catch(()=>{});
                        } else {
                            await loadingMsg.edit(updatePayload).catch(()=>{});
                        }
                    } catch(err) {}
                };

                await sendUpdate();

                const collector = (isSlash ? interactionOrMessage : loadingMsg).createMessageComponentCollector({
                    filter: i => i.user.id === user.id && i.customId.startsWith('fish_'),
                    time: 60000 
                });

                collector.on('collect', async i => {
                    if (isGameOver) {
                        await i.deferUpdate().catch(()=>{});
                        return;
                    }

                    await i.deferUpdate().catch(()=>{});

                    if (i.customId === 'fish_hard') {
                        gameData.distance -= Math.floor(Math.random() * 12) + 8 + currentRod.level; 
                        gameData.tension += (Math.floor(Math.random() * 15) + 15) * difficultyMultiplier; 
                        gameData.statusText = "سحب عنيف! الخيط يهتز!";
                    } else if (i.customId === 'fish_steady') {
                        gameData.distance -= Math.floor(Math.random() * 6) + 4; 
                        gameData.tension += (Math.floor(Math.random() * 8) + 4) * difficultyMultiplier; 
                        gameData.statusText = "سحب متوازن.. السمكة تقترب.";
                    } else if (i.customId === 'fish_relax') {
                        gameData.distance += Math.floor(Math.random() * 8) + 4; 
                        gameData.tension -= Math.floor(Math.random() * 35) + 25; 
                        gameData.statusText = "إرخاء الخيط! السمكة تبتعد لتستريح.";
                    }

                    const fishAggression = Math.min(0.40, 0.15 + (difficultyMultiplier * 0.10)); 
                    if (Math.random() < fishAggression) {
                        gameData.tension += 10 * difficultyMultiplier;
                        gameData.statusText += " (السمكة تقاوم!)";
                    }

                    if (gameData.tension < 0) gameData.tension = 0;
                    if (gameData.distance < 0) gameData.distance = 0;

                    if (gameData.tension >= gameData.maxTension) {
                        isGameOver = true;
                        gameData.statusText = "💥 انقطع الخيط! هربت السمكة...";
                        await sendUpdate(true, i);
                        collector.stop('snapped');
                        return;
                    }
                    
                    if (gameData.distance >= 150) {
                        isGameOver = true;
                        gameData.statusText = "💨 السمكة ابتعدت جداً وأفلتت السنارة!";
                        await sendUpdate(true, i);
                        collector.stop('escaped');
                        return;
                    }

                    if (gameData.distance <= 0) {
                        isGameOver = true;
                        gameData.statusText = "✅ تم الصيد بنجاح!";
                        await sendUpdate(true, i);
                        collector.stop('success');
                        return;
                    }

                    await sendUpdate(false, i);
                });

                collector.on('end', async (collected, reason) => {
                    try {
                        if (reason === 'time') {
                            isGameOver = true;
                            gameData.statusText = "⏳ انتهى الوقت! السمكة هربت.";
                            await sendUpdate(true); 
                        }
                        
                        if (reason === 'success') {
                            const isOwner = user.id === OWNER_ID;
                            const monsterChance = isOwner ? 0.50 : (0.10 + (baitLuckBonus / 1000));
                            const monsterTriggered = Math.random() < monsterChance;
                            let possibleMonsters = monstersConfig.filter(m => m.locations.includes(locationId));
                            if (isOwner && possibleMonsters.length === 0) possibleMonsters = monstersConfig; 
                            
                            if (possibleMonsters.length > 0 && monsterTriggered) {
                                const monster = possibleMonsters[Math.floor(Math.random() * possibleMonsters.length)];
                                let playerWeapon = await pvpCore.getWeaponData(sql, member);
                                if (!playerWeapon || playerWeapon.currentLevel === 0) playerWeapon = { name: "سكين صيد صدئة", currentDamage: 15, currentLevel: 1 };

                                if (pvpCore.startPveBattle) {
                                    activeFishingSessions.delete(user.id);
                                    
                                    // 🔥 الحل العبقري: إنشاء الثريد من رسالة الصيد مباشرة 🔥
                                    let battleThread;
                                    try {
                                        const threadName = `🦑-صيد-${monster.name}-${cleanDisplayName(member.displayName || user.username)}`.substring(0, 100);
                                        battleThread = await loadingMsg.startThread({ 
                                            name: threadName, 
                                            autoArchiveDuration: 60, 
                                            reason: 'PvE Monster Battle' 
                                        });
                                        await battleThread.members.add(user.id).catch(()=>{});
                                        
                                        // تحديث رسالة الصيد لتدل على الثريد الجديد
                                        await loadingMsg.edit({ content: `**🦑 ظهر ${monster.name}!**\nانتقل إلى المعركة هنا: <#${battleThread.id}>`, components: [] }).catch(()=>{});
                                    } catch (err) {
                                        console.error("Failed to create thread:", err);
                                    }

                                    // تمرير الثريد على أنه هو قناة التفاعل ليتم حفظ المعركة بـ ID الثريد ويمنع التداخل
                                    if (battleThread) {
                                        const fakeInteraction = {
                                            channel: battleThread,
                                            editReply: async () => {}, // صامت لأننا كتبنا في الثريد
                                            guild: guild,
                                            user: user
                                        };
                                        await pvpCore.startPveBattle(fakeInteraction, client, sql, member, monster, playerWeapon);
                                    } else {
                                        await pvpCore.startPveBattle(interactionOrMessage, client, sql, member, monster, playerWeapon);
                                    }
                                    return; 
                                }
                            }

                            const summary = {};
                            caughtFish.forEach(f => {
                                summary[f.id] = summary[f.id] 
                                    ? { name: f.name, count: summary[f.id].count + 1, emoji: f.emoji, rarity: f.rarity } 
                                    : { name: f.name, count: 1, emoji: f.emoji, rarity: f.rarity };
                            });
                            
                            if (addXPAndCheckLevel && totalValue > 0) {
                                const xpEarned = caughtFish.length * 15;
                                await addXPAndCheckLevel(client, member, sql, xpEarned, totalValue, false).catch(()=>{});
                            } else {
                                await execSafe(sql, `UPDATE levels SET "mora" = COALESCE(CAST("mora" AS BIGINT), 0) + $1 WHERE "user" = $2 AND "guild" = $3`, `UPDATE levels SET mora = COALESCE(CAST(mora AS BIGINT), 0) + $1 WHERE userid = $2 AND guildid = $3`, [totalValue, user.id, guild.id]);
                                if (typeof client.getLevel === 'function' && typeof client.setLevel === 'function') {
                                    let cache = await client.getLevel(user.id, guild.id);
                                    if (cache) { cache.mora = String(Number(cache.mora || 0) + totalValue); await client.setLevel(cache); }
                                }
                            }
                            
                            try {
                                if (updateGuildStat) await updateGuildStat(client, guild.id, user.id, 'fish_caught', caughtFish.length);
                            } catch(err) {}

                            let description = "✶ قمـت بصيـد وبيع:\n";
                            for (const info of Object.values(summary)) {
                                let rarityStar = info.rarity >= 5 ? "🌟" : (info.rarity === 4 ? "✨" : "");
                                description += `✶ ${info.emoji} ${info.name} ${rarityStar} **x${info.count}**\n`;
                            }
                            description += `\n✶ قيمـة البيـع المُحصـلة: \`${totalValue.toLocaleString()}\` ${EMOJI_MORA}`;
                            description += extraBuffsText; 

                            const resultEmbed = new EmbedBuilder()
                                .setTitle(`✥ الغنيمــة المُـبـاعـة !`) 
                                .setDescription(description)
                                .setColor(Colors.Green)
                                .setThumbnail('https://i.postimg.cc/Wz0g0Zg0/fishing.png');

                            if (isSlash) {
                                await interactionOrMessage.followUp({ content: `<@${user.id}>`, embeds: [resultEmbed] }).catch(console.error);
                            } else {
                                await interactionOrMessage.channel.send({ content: `<@${user.id}>`, embeds: [resultEmbed] }).catch(console.error);
                            }
                        }
                    } catch (err) {
                        console.error("End Event Error in Fish:", err);
                    } finally {
                        activeFishingSessions.delete(user.id);
                    }
                });

            }, waitTime);
        } catch (e) {
            console.error("Fish command main error:", e);
            activeFishingSessions.delete(user.id);
            reply({ content: "❌ حدث خطأ أثناء تجهيز الصيد.", ephemeral: true }).catch(()=>{});
        }
    }
};
