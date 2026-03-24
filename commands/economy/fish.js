const { SlashCommandBuilder, EmbedBuilder, Colors, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, AttachmentBuilder } = require("discord.js");
const path = require('path');
const { generateFishingCard } = require('../../generators/fishing-card-generator.js');

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

async function getCooldownReductionMs(db, userId, guildId) {
    try {
        let repRes;
        try { repRes = await db.query(`SELECT "rep_points" FROM user_reputation WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId]); }
        catch(e) { repRes = await db.query(`SELECT rep_points FROM user_reputation WHERE userid = $1 AND guildid = $2`, [userId, guildId]).catch(()=>({rows:[]})); }
        
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

module.exports = {
    data: new SlashCommandBuilder().setName('صيد').setDescription('ابـدأ رحـلـة صيد تفاعلية جديدة'),
    name: 'fish',
    aliases: ['صيد', 'ص', 'fishing'],
    category: "Economy",
    description: "صيد الأسماك بنظام الشد والجذب الرسومي المستند على ندرة السمكة.",

    async execute(interactionOrMessage) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        const user = isSlash ? interactionOrMessage.user : interactionOrMessage.author;
        const guild = interactionOrMessage.guild;
        const member = interactionOrMessage.member; 
        const client = interactionOrMessage.client;
        const sql = client.sql;

        if (activeFishingSessions.has(user.id)) {
            const content = "⚠️ **لديك رحلة صيد جارية!** ركز على سنارتك.";
            if (isSlash) return interactionOrMessage.reply({ content, flags: [MessageFlags.Ephemeral] });
            return interactionOrMessage.reply(content);
        }
        
        activeFishingSessions.add(user.id);

        try {
            let userDataRes;
            try { userDataRes = await sql.query('SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2', [user.id, guild.id]); }
            catch(e) { userDataRes = await sql.query('SELECT * FROM levels WHERE userid = $1 AND guildid = $2', [user.id, guild.id]).catch(()=>({rows:[]})); }
            
            let userData = userDataRes.rows[0];

            if (!userData) {
                userData = { user: user.id, guild: guild.id, rodLevel: 1, boatLevel: 1, currentLocation: 'beach', lastFish: 0, xp: 0, mora: 0, totalXP: 0, level: 1 };
                try { await sql.query('INSERT INTO levels ("user", "guild", "xp", "totalXP", "level", "mora", "rodLevel", "boatLevel", "currentLocation", "lastFish") VALUES ($1, $2, 0, 0, 1, 0, 1, 1, $3, $4)', [user.id, guild.id, 'beach', '0']); }
                catch(e) { await sql.query('INSERT INTO levels (userid, guildid, xp, totalxp, level, mora, rodlevel, boatlevel, currentlocation, lastfish) VALUES ($1, $2, 0, 0, 1, 0, 1, 1, $3, $4)', [user.id, guild.id, 'beach', '0']).catch(()=>{}); }
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
                activeFishingSessions.delete(user.id); // تأمين الحذف
                const content = `⏳ رميت السنارة مؤخراً! الأسماك حذرة الآن، انتظر **${minutes}:${seconds}** دقيقة لتعود للصيد.`;
                if (isSlash) return interactionOrMessage.reply({ content, flags: [MessageFlags.Ephemeral] });
                return interactionOrMessage.reply(content);
            }

            let woundedDebuffRes;
            try { woundedDebuffRes = await sql.query(`SELECT "expiresAt" FROM user_buffs WHERE "userID" = $1 AND "guildID" = $2 AND "buffType" = 'pvp_wounded' AND "expiresAt" > $3`, [user.id, guild.id, now]); }
            catch(e) { woundedDebuffRes = await sql.query(`SELECT expiresat FROM user_buffs WHERE userid = $1 AND guildid = $2 AND bufftype = 'pvp_wounded' AND expiresat > $3`, [user.id, guild.id, now]).catch(()=>({rows:[]})); }
            
            const woundedDebuff = woundedDebuffRes.rows[0];
            if (woundedDebuff) {
                activeFishingSessions.delete(user.id); // تأمين الحذف
                const minutesLeft = Math.ceil((Number(woundedDebuff.expiresAt || woundedDebuff.expiresat) - now) / 60000);
                const content = `🩹 | أنت **جريح** حالياً! عليك الراحة لمدة **${minutesLeft}** دقيقة.`;
                if (isSlash) return interactionOrMessage.reply({ content, flags: [MessageFlags.Ephemeral] });
                return interactionOrMessage.reply(content);
            }

            if (user.id !== OWNER_ID) {
                try { await sql.query(`UPDATE levels SET "lastFish" = $1 WHERE "user" = $2 AND "guild" = $3`, [nowStr, user.id, guild.id]); } 
                catch (err) { await sql.query(`UPDATE levels SET lastfish = $1 WHERE userid = $2 AND guildid = $3`, [nowStr, user.id, guild.id]).catch(()=>{}); }
                if (typeof client.getLevel === 'function' && typeof client.setLevel === 'function') {
                    let cacheData = await client.getLevel(user.id, guild.id);
                    if (cacheData) { cacheData.lastFish = nowStr; await client.setLevel(cacheData); }
                }
            }

            const currentRod = rodsConfig.find(r => r.level === (Number(userData.rodLevel || userData.rodlevel) || 1)) || rodsConfig[0];
            const currentBoat = boatsConfig.find(b => b.level === (Number(userData.boatLevel || userData.boatlevel) || 1)) || boatsConfig[0];
            const locationId = userData.currentLocation || userData.currentlocation || 'beach';
            const currentLocation = locationsConfig.find(l => l.id === locationId) || locationsConfig[0];

            let repLuckBonus = 0;
            let repRankText = "";
            try {
                let repRes;
                try { repRes = await sql.query(`SELECT "rep_points" FROM user_reputation WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guild.id]); }
                catch(e) { repRes = await sql.query(`SELECT rep_points FROM user_reputation WHERE userid = $1 AND guildid = $2`, [user.id, guild.id]).catch(()=>({rows:[]})); }
                
                const repPoints = repRes.rows[0]?.rep_points || 0;
                
                if (repPoints >= 1000) { repLuckBonus = 10; repRankText = "SS"; }
                else if (repPoints >= 500) { repLuckBonus = 8; repRankText = "S"; }
                else if (repPoints >= 250) { repLuckBonus = 6; repRankText = "A"; }
                else if (repPoints >= 100) { repLuckBonus = 5; repRankText = "B"; }
                else if (repPoints >= 50) { repLuckBonus = 4; repRankText = "C"; }
                else if (repPoints >= 25) { repLuckBonus = 3; repRankText = "D"; }
            } catch(e) {}

            let usedBaitName = null;
            let baitLuckBonus = 0;
            
            let userBaitsRes;
            try { userBaitsRes = await sql.query(`SELECT * FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guild.id]); }
            catch(e) { userBaitsRes = await sql.query(`SELECT * FROM user_inventory WHERE userid = $1 AND guildid = $2`, [user.id, guild.id]).catch(()=>({rows:[]})); }
            
            const userBaits = userBaitsRes.rows;
            const availableBaits = userBaits.filter(invItem => fishingConfig.baits.some(b => b.id === (invItem.itemID || invItem.itemid) && Number(invItem.quantity) > 0));

            if (availableBaits.length > 0) {
                const richBaits = availableBaits.map(invItem => {
                    const config = fishingConfig.baits.find(b => b.id === (invItem.itemID || invItem.itemid));
                    return { ...invItem, luck: config.luck, name: config.name, id: config.id };
                });
                richBaits.sort((a, b) => b.luck - a.luck);
                const bestBait = richBaits[0];
                
                try {
                    await sql.query("BEGIN");
                    const checkBait = await sql.query(`SELECT "quantity" FROM user_inventory WHERE "userID" = $1 AND "itemID" = $2`, [user.id, bestBait.id]);
                    if (checkBait.rows.length > 0 && Number(checkBait.rows[0].quantity) > 0) {
                        usedBaitName = bestBait.name;
                        baitLuckBonus = bestBait.luck;
                        if (Number(checkBait.rows[0].quantity) > 1) {
                            await sql.query(`UPDATE user_inventory SET "quantity" = "quantity" - 1 WHERE "userID" = $1 AND "itemID" = $2`, [user.id, bestBait.id]);
                        } else {
                            await sql.query(`DELETE FROM user_inventory WHERE "userID" = $1 AND "itemID" = $2`, [user.id, bestBait.id]);
                        }
                    }
                    await sql.query("COMMIT");
                } catch(e) {
                    await sql.query("ROLLBACK").catch(()=>{});
                }
            }

            let isFisherKing = false;
            try {
                const settingsRes = await sql.query(`SELECT "roleFisherKing" FROM settings WHERE "guild" = $1`, [guild.id]);
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

            let desc = `**العدة:** 🎣 ${currentRod.name} | 🚤 ${currentBoat.name}\n🌊 **الموقع:** ${currentLocation.name}`;
            desc += usedBaitName ? `\n🪱 **الطعم:** ${usedBaitName}` : `\n🪱 **الطعم:** لا يوجد - الأسماك الثمينة لن تقترب!`; 
            desc += extraBuffsText; 

            // 🔥 الطريقة الصحيحة والمدرعة لإرسال الرسالة وجلبها للـ Collector 🔥
            let loadingMsg;
            if (isSlash) {
                // استخدام withResponse: true هو الطريقة المعتمدة في v14
                const response = await interactionOrMessage.reply({ content: `**🌊 يرمي السنارة في الماء...**\n${desc}`, withResponse: true });
                loadingMsg = response.resource?.message || response;
                // كإجراء احتياطي، نستخدم fetchReply إذا فشلت الطريقة الأولى
                if (!loadingMsg || !loadingMsg.createMessageComponentCollector) {
                    loadingMsg = await interactionOrMessage.fetchReply();
                }
            } else {
                loadingMsg = await interactionOrMessage.reply({ content: `**🌊 يرمي السنارة في الماء...**\n${desc}` });
            }

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

                // إنشاء الـ Collector على الرسالة نفسها بشكل آمن
                const collector = loadingMsg.createMessageComponentCollector({
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
                                    await pvpCore.startPveBattle(interactionOrMessage, client, sql, member, monster, playerWeapon);
                                    return; 
                                }
                            }

                            const summary = {};
                            caughtFish.forEach(f => {
                                summary[f.id] = summary[f.id] 
                                    ? { name: f.name, count: summary[f.id].count + 1, emoji: f.emoji, rarity: f.rarity } 
                                    : { name: f.name, count: 1, emoji: f.emoji, rarity: f.rarity };
                            });

                            for (const [fId, info] of Object.entries(summary)) {
                                try { await sql.query(`INSERT INTO user_inventory ("guildID", "userID", "itemID", "quantity") VALUES ($1, $2, $3, $4) ON CONFLICT("guildID", "userID", "itemID") DO UPDATE SET "quantity" = user_inventory."quantity" + $4`, [guild.id, user.id, fId, info.count]); }
                                catch(e) { await sql.query(`INSERT INTO user_inventory (guildid, userid, itemid, quantity) VALUES ($1, $2, $3, $4) ON CONFLICT(guildid, userid, itemid) DO UPDATE SET quantity = user_inventory.quantity + $4`, [guild.id, user.id, fId, info.count]).catch(()=>{}); }
                            }
                            
                            if (addXPAndCheckLevel && totalValue > 0) {
                                const xpEarned = caughtFish.length * 15;
                                await addXPAndCheckLevel(client, member, sql, xpEarned, totalValue, false).catch(()=>{});
                            } else {
                                try { await sql.query(`UPDATE levels SET "mora" = COALESCE(CAST("mora" AS BIGINT), 0) + $1 WHERE "user" = $2 AND "guild" = $3`, [totalValue, user.id, guild.id]); }
                                catch(e) { await sql.query(`UPDATE levels SET mora = COALESCE(CAST(mora AS BIGINT), 0) + $1 WHERE userid = $2 AND guildid = $3`, [totalValue, user.id, guild.id]).catch(()=>{}); }
                                if (typeof client.getLevel === 'function' && typeof client.setLevel === 'function') {
                                    let cache = await client.getLevel(user.id, guild.id);
                                    if (cache) { cache.mora = String(Number(cache.mora || 0) + totalValue); await client.setLevel(cache); }
                                }
                            }
                            
                            try {
                                if (updateGuildStat) await updateGuildStat(client, guild.id, user.id, 'fish_caught', caughtFish.length);
                            } catch(err) {}

                            let description = "✶ قمـت بصيـد:\n";
                            for (const info of Object.values(summary)) {
                                let rarityStar = info.rarity >= 5 ? "🌟" : (info.rarity === 4 ? "✨" : "");
                                description += `✶ ${info.emoji} ${info.name} ${rarityStar} **x${info.count}**\n`;
                            }
                            description += `\n✶ قيـمـة الصيد: \`${totalValue.toLocaleString()}\` ${EMOJI_MORA}`;
                            description += extraBuffsText; 

                            const resultEmbed = new EmbedBuilder()
                                .setTitle(`✥ الغنيمــة !`) 
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
                        // 🔥 الحماية النهائية 🔥 إزالة اسم اللاعب من الجلسات النشطة في كل الحالات
                        activeFishingSessions.delete(user.id);
                    }
                });

            }, waitTime);
        } catch (e) {
            console.error("Fish command main error:", e);
            const content = "❌ حدث خطأ أثناء تجهيز الصيد.";
            if (isSlash) interactionOrMessage.reply({ content, flags: [MessageFlags.Ephemeral] }).catch(()=>{});
            else interactionOrMessage.reply(content).catch(()=>{});
        } finally {
            // إضافة حماية إضافية لو حدث خطأ كبير قبل الدخول في اللوب
            if (!activeFishingSessions.has(user.id)) return;
            // يتم تفريغ الجلسة من الـ Timeout أو الـ Collector أعلاه.
        }
    }
};
