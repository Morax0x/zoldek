const { EmbedBuilder, Colors } = require("discord.js");

let farmAnimals, seedsData, feedItems;
try {
    farmAnimals = require('../../json/farm-animals.json'); 
    seedsData = require('../../json/seeds.json'); 
    feedItems = require('../../json/feed-items.json');
} catch(e) {
    farmAnimals = require('../json/farm-animals.json'); 
    seedsData = require('../json/seeds.json'); 
    feedItems = require('../json/feed-items.json');
}

let updateGuildStat, addXPAndCheckLevel;
try {
    ({ updateGuildStat } = require('./guild-board-handler.js'));
    ({ addXPAndCheckLevel } = require('./handler-utils.js'));
} catch (e) {
    try {
        ({ addXPAndCheckLevel } = require('../handlers/handler-utils.js'));
    } catch(e2) {}
}

const EMOJI_MORA = '<:mora:1435647151349698621>';

// 🛡️ نظام معالجة استعلامات فولاذي وذكي للحماية من الانهيارات
const safeQuery = async (db, qPg, params) => {
    let res;
    try { 
        res = await db.query(qPg, params); 
    } catch(e) { 
        res = { rows: [] }; 
    }

    const rows1 = Array.isArray(res) ? res : (res?.rows || []);
    if (rows1.length > 0) return { rows: rows1 };

    let fallbackQuery = qPg
        .replace(/"userID"/gi, "userid")
        .replace(/"guildID"/gi, "guildid")
        .replace(/"itemID"/gi, "itemid")
        .replace(/"animalID"/gi, "animalid")
        .replace(/"quantity"/gi, "quantity")
        .replace(/"mora"/gi, "mora")
        .replace(/"xp"/gi, "xp")
        .replace(/"level"/gi, "level")
        .replace(/"id"/gi, "id")
        .replace(/"user"/gi, "userid")
        .replace(/"guild"/gi, "guildid")
        .replace(/"lastPayoutDate"/gi, "lastpayoutdate")
        .replace(/"actionType"/gi, "actiontype")
        .replace(/"itemName"/gi, "itemname")
        .replace(/"count"/gi, "count")
        .replace(/"timestamp"/gi, "timestamp")
        .replace(/"seedID"/gi, "seedid")
        .replace(/"plantTime"/gi, "planttime")
        .replace(/"plotID"/gi, "plotid")
        .replace(/"status"/gi, "status")
        .replace(/"purchaseTimestamp"/gi, "purchasetimestamp")
        .replace(/"lastFedTimestamp"/gi, "lastfedtimestamp");

    if (fallbackQuery !== qPg) {
        try { 
            let res2 = await db.query(fallbackQuery, params); 
            const rows2 = Array.isArray(res2) ? res2 : (res2?.rows || []);
            return { rows: rows2 };
        } catch(e2) { }
    }
    
    return { rows: [] };
};

// 🛡️ تنفيذ أوامر الإدخال/التحديث بصمت وبدون إرجاع قراءة
const safeExecute = async (db, qPg, params) => {
    try { await db.query(qPg, params); return true; } catch(e) { 
        let fallbackQuery = qPg
            .replace(/"userID"/gi, "userid").replace(/"guildID"/gi, "guildid")
            .replace(/"itemID"/gi, "itemid").replace(/"animalID"/gi, "animalid")
            .replace(/"quantity"/gi, "quantity").replace(/"mora"/gi, "mora")
            .replace(/"xp"/gi, "xp").replace(/"level"/gi, "level")
            .replace(/"id"/gi, "id").replace(/"user"/gi, "userid")
            .replace(/"guild"/gi, "guildid").replace(/"lastPayoutDate"/gi, "lastpayoutdate")
            .replace(/"actionType"/gi, "actiontype").replace(/"itemName"/gi, "itemname")
            .replace(/"count"/gi, "count").replace(/"timestamp"/gi, "timestamp")
            .replace(/"seedID"/gi, "seedid").replace(/"plantTime"/gi, "planttime")
            .replace(/"plotID"/gi, "plotid").replace(/"status"/gi, "status")
            .replace(/"purchaseTimestamp"/gi, "purchasetimestamp")
            .replace(/"lastFedTimestamp"/gi, "lastfedtimestamp");

        if (fallbackQuery !== qPg) {
            try { await db.query(fallbackQuery, params); return true; } catch(e2) { return false; }
        }
        return false;
    }
};

async function getGrowthMultiplier(db, userId, guildId) {
    try {
        const repRes = await safeQuery(db, `SELECT "rep_points" FROM user_reputation WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId]);
        const points = Number(repRes.rows[0]?.rep_points || repRes.rows[0]?.rep_Points || 0);
        if (points >= 1000) return 0.80; 
        if (points >= 500)  return 0.85; 
        if (points >= 250)  return 0.90; 
        if (points >= 100)  return 0.95; 
        if (points >= 50)   return 0.97; 
        return 1.0;
    } catch(e) { return 1.0; }
}

async function checkFarmIncome(client, db) {
    if (!db) return;

    const now = Date.now();
    const ONE_DAY = 24 * 60 * 60 * 1000;
    const TWELVE_HOURS = 12 * 60 * 60 * 1000; 

    try {
        await safeExecute(db, `CREATE TABLE IF NOT EXISTS farm_last_payout ("id" TEXT PRIMARY KEY, "lastPayoutDate" BIGINT)`, []);
        await safeExecute(db, `CREATE TABLE IF NOT EXISTS farm_daily_log ("id" BIGSERIAL PRIMARY KEY, "userID" TEXT, "guildID" TEXT, "actionType" TEXT, "itemName" TEXT, "count" BIGINT, "timestamp" BIGINT)`, []);
    } catch (e) { }

    const farmOwnersRes = await safeQuery(db, `SELECT DISTINCT "userID", "guildID" FROM user_farm UNION SELECT DISTINCT "userID", "guildID" FROM user_lands`, []);
    const farmOwners = farmOwnersRes.rows;
    
    if (!farmOwners || farmOwners.length === 0) return;
    
    for (const owner of farmOwners) {
        try {
            const userID = owner.userID || owner.userid;
            const guildID = owner.guildID || owner.guildid;
            
            if (!userID || !guildID) continue;

            const payoutID = `${userID}-${guildID}`;
            
            const [lastPayoutDataRes, workerBuffRes] = await Promise.all([
                safeQuery(db, `SELECT "lastPayoutDate" FROM farm_last_payout WHERE "id" = $1`, [payoutID]),
                safeQuery(db, `SELECT * FROM user_buffs WHERE "userID" = $1 AND "guildID" = $2 AND "buffType" = 'farm_worker' AND "expiresAt" > $3`, [userID, guildID, now])
            ]);

            const growthMultiplier = await getGrowthMultiplier(db, userID, guildID);

            const lastPayoutData = lastPayoutDataRes.rows[0];
            const payoutTime = lastPayoutData ? Number(lastPayoutData.lastPayoutDate || lastPayoutData.lastpayoutdate || 0) : 0;
            const isDailyPayoutDue = (now - payoutTime) >= ONE_DAY;
            const hasWorker = workerBuffRes.rows.length > 0;

            // ============================================
            // 1. نظام الحصاد المستمر للعامل
            // ============================================
            if (hasWorker) {
                const plantedPlotsRes = await safeQuery(db, `SELECT * FROM user_lands WHERE "userID" = $1 AND "guildID" = $2 AND "status" = 'planted'`, [userID, guildID]);
                const plantedPlots = plantedPlotsRes.rows;
                
                if (plantedPlots.length > 0) {
                    let totalExtraMora = 0;
                    let totalExtraXp = 0;
                    
                    for (const plot of plantedPlots) {
                        const seedId = plot.seedID || plot.seedid;
                        const plotId = plot.plotID || plot.plotid;
                        const seed = seedsData.find(s => String(s.id) === String(seedId));
                        if (!seed) continue;

                        const growthMs = (seed.growth_time_hours * 3600000) * growthMultiplier;
                        
                        let plantTime = Number(plot.plantTime || plot.planttime);
                        if (!plantTime || plantTime < 10000000000) plantTime = now; 

                        const age = now - plantTime;

                        if (age >= growthMs) {
                            await safeExecute(db, `UPDATE user_lands SET "status" = 'empty', "seedID" = NULL, "plantTime" = NULL WHERE "userID" = $1 AND "guildID" = $2 AND "plotID" = $3`, [userID, guildID, plotId]);
                            
                            totalExtraMora += Number(seed.sell_price) || 0;
                            totalExtraXp += Number(seed.xp_reward) || 0;
                            
                            if (updateGuildStat) updateGuildStat(client, guildID, userID, 'crops_harvested', seed.sell_price);

                            await safeExecute(db, `INSERT INTO farm_daily_log ("userID", "guildID", "actionType", "itemName", "count", "timestamp") VALUES ($1, $2, $3, $4, $5, $6)`, [userID, guildID, 'harvest', seed.name, 1, now]);
                        }
                    }

                    if (totalExtraMora > 0 || totalExtraXp > 0) {
                        try {
                            const guildObj = client.guilds.cache.get(guildID);
                            const memberObj = guildObj ? await guildObj.members.fetch(userID).catch(()=>null) : null;
                            if (memberObj && addXPAndCheckLevel) {
                                await addXPAndCheckLevel(client, memberObj, db, totalExtraXp, totalExtraMora, false).catch(()=>{});
                            } else {
                                await safeExecute(db, `UPDATE levels SET "mora" = CAST(COALESCE("mora", '0') AS BIGINT) + $1, "xp" = CAST(COALESCE("xp", '0') AS BIGINT) + $2, "totalXP" = CAST(COALESCE("totalXP", '0') AS BIGINT) + $2 WHERE "user" = $3 AND "guild" = $4`, [totalExtraMora, totalExtraXp, userID, guildID]);
                            }
                        } catch(e) {}
                    }
                }
            }

            // ============================================
            // 2. معالجة الحيوانات (الموت من الكبر والجوع)
            // ============================================
            const userFarmRes = await safeQuery(db, `SELECT * FROM user_farm WHERE "userID" = $1 AND "guildID" = $2`, [userID, guildID]);
            const userFarm = userFarmRes.rows;
            
            let dailyAnimalIncome = 0;
            let currentAnimalsCount = 0;
            let hungryAnimalsCount = 0;
            let oldDeaths = [];
            let outOfStock = false;

            for (const row of userFarm) {
                const animalId = row.animalID || row.animalid;
                const rowId = row.id || row.ID;
                const animal = farmAnimals.find(a => String(a.id) === String(animalId));
                if (!animal) continue; 

                const qty = Number(row.quantity || row.Quantity) || 1;
                
                let purchaseTimestamp = Number(row.purchaseTimestamp || row.purchasetimestamp);
                if (!purchaseTimestamp || purchaseTimestamp < 10000000000) {
                    purchaseTimestamp = now; 
                    await safeExecute(db, `UPDATE user_farm SET "purchaseTimestamp" = $1 WHERE "id" = $2`, [now, rowId]);
                }

                // 🔥 تصليح الموت من الكبر: حساب الأيام كاملة لمنع الموت المبكر بأجزاء الثواني 🔥
                const ageInDays = Math.floor((now - purchaseTimestamp) / ONE_DAY);
                const lifespanDays = animal.lifespan_days;

                // 💀 الموت من الكبر فقط
                if (ageInDays >= lifespanDays) {
                    await safeExecute(db, `DELETE FROM user_farm WHERE "id" = $1`, [rowId]);
                    await safeExecute(db, `INSERT INTO farm_daily_log ("userID", "guildID", "actionType", "itemName", "count", "timestamp") VALUES ($1, $2, $3, $4, $5, $6)`, [userID, guildID, 'death_old', animal.name, qty, now]);
                    if (!oldDeaths.includes(animal.name)) oldDeaths.push(`${animal.name} (${qty})`);
                    continue; 
                }

                const maxHungerMs = (animal.max_hunger_days || 3) * ONE_DAY; 
                
                let lastFed = Number(row.lastFedTimestamp || row.lastfedtimestamp);
                if (!lastFed || lastFed < 10000000000) {
                    lastFed = purchaseTimestamp; 
                }

                let fullUntil = lastFed + maxHungerMs; 
                let timeLeft = fullUntil - now; 
                
                currentAnimalsCount += qty;
                const feedThreshold = Math.max(14 * 60 * 60 * 1000, maxHungerMs * 0.25);

                // الإطعام التلقائي من العامل
                if (hasWorker && timeLeft <= feedThreshold) {
                    const invDataRes = await safeQuery(db, `SELECT "id", "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [userID, guildID, animal.feed_id]);
                    const invData = invDataRes.rows[0];
                    
                    if (invData && Number(invData.quantity || invData.Quantity) >= qty) {
                        const invId = invData.id || invData.ID;
                        const newQty = Number(invData.quantity || invData.Quantity) - qty;
                        
                        if(newQty > 0) {
                            await safeExecute(db, `UPDATE user_inventory SET "quantity" = $1 WHERE "id" = $2`, [newQty, invId]);
                        } else {
                            await safeExecute(db, `DELETE FROM user_inventory WHERE "id" = $1`, [invId]);
                        }
                        
                        await safeExecute(db, `UPDATE user_farm SET "lastFedTimestamp" = $1 WHERE "id" = $2`, [now, rowId]);
                        await safeExecute(db, `INSERT INTO farm_daily_log ("userID", "guildID", "actionType", "itemName", "count", "timestamp") VALUES ($1, $2, $3, $4, $5, $6)`, [userID, guildID, 'feed', animal.name, qty, now]);
                        
                        lastFed = now;
                        timeLeft = maxHungerMs;
                    } else {
                        outOfStock = true;
                    }
                }

                // حساب الدخل اليومي
                if (isDailyPayoutDue) {
                    if (timeLeft > 0) { // 🔥 تصليح الدخل: يعطي دخل إذا كان شبعاناً (باقي فيه وقت) 🔥
                        dailyAnimalIncome += (Number(animal.income_per_day) * qty);
                    } else {
                        hungryAnimalsCount += qty; 
                    }
                }
            } 

            // ============================================
            // 3. التقرير والتوزيع النهائي (يُنفذ مرة كل 24 ساعة)
            // ============================================
            if (!isDailyPayoutDue) continue;

            if (dailyAnimalIncome > 0) {
                try {
                    const guildObj = client.guilds.cache.get(guildID);
                    const memberObj = guildObj ? await guildObj.members.fetch(userID).catch(()=>null) : null;
                    if (memberObj && addXPAndCheckLevel) {
                        await addXPAndCheckLevel(client, memberObj, db, 0, dailyAnimalIncome, false).catch(()=>{});
                    } else {
                        await safeExecute(db, `UPDATE levels SET "mora" = CAST(COALESCE("mora", '0') AS BIGINT) + $1 WHERE "user" = $2 AND "guild" = $3`, [dailyAnimalIncome, userID, guildID]);
                    }
                } catch(e) {}
            }

            const dailyLogsRes = await safeQuery(db, `SELECT * FROM farm_daily_log WHERE "userID" = $1 AND "guildID" = $2`, [userID, guildID]);
            let harvestedMap = new Map(), fedMap = new Map();

            for (const log of dailyLogsRes.rows) {
                const logCount = Number(log.count) || 1;
                const aType = log.actionType || log.actiontype;
                const iName = log.itemName || log.itemname;
                if (aType === 'harvest') harvestedMap.set(iName, (harvestedMap.get(iName) || 0) + logCount);
                else if (aType === 'feed') fedMap.set(iName, (fedMap.get(iName) || 0) + logCount);
            }

            // تحديث وقت الاستلام لتجنب التكرار وتفريغ سجل اليوم
            await safeExecute(db, `DELETE FROM farm_daily_log WHERE "userID" = $1 AND "guildID" = $2`, [userID, guildID]);
            await safeExecute(db, `INSERT INTO farm_last_payout ("id", "lastPayoutDate") VALUES ($1, $2) ON CONFLICT("id") DO UPDATE SET "lastPayoutDate" = $3`, [payoutID, now, now]);

            if (dailyAnimalIncome <= 0 && dailyLogsRes.rows.length === 0 && hungryAnimalsCount === 0 && oldDeaths.length === 0) continue;

            const guildObj = client.guilds.cache.get(guildID);
            if (!guildObj) continue;
            
            const settingsRes = await safeQuery(db, `SELECT "casinoChannelID" FROM settings WHERE "guild" = $1`, [guildID]);
            const casinoId = settingsRes.rows[0]?.casinochannelid || settingsRes.rows[0]?.casinoChannelID;
            if (!casinoId) continue;
            
            const channel = guildObj.channels.cache.get(casinoId);
            if (!channel) continue;
            
            const member = await guildObj.members.fetch(userID).catch(() => null);
            if (!member) continue; 

            let description = "";
            if (hasWorker && (fedMap.size > 0 || harvestedMap.size > 0 || outOfStock)) {
                description += `**✶تـقـرير عـامل المزرعـة**\n\n`;
                if (fedMap.size > 0) {
                    description += `**★ تـم اطعـام:**\n`;
                    fedMap.forEach((count, name) => description += `- ${name}: ${count}\n`);
                }
                if (outOfStock) description += `**★ ⚠️ تنبيه:** مخزون بعض الأعلاف نفد! لم يتم إطعام الجميع.\n\n`;
                if (harvestedMap.size > 0) {
                    description += `**★ تـم حصـاد:**\n`;
                    harvestedMap.forEach((count, name) => description += `- ${name}: ${count}\n`);
                }
                description += `────────────────────\n`;
            }

            description += `✶ حـققـت حيواناتك دخـل يومي بقيمـة: **${dailyAnimalIncome.toLocaleString()}** ${EMOJI_MORA}\n` +
                           `✶ عـدد الحـيوانات الحية في مزرعتك: **${currentAnimalsCount.toLocaleString()}**`;

            if (hungryAnimalsCount > 0) description += `\n\n⚠️ تنبـيه: **${hungryAnimalsCount}** من حيواناتك جائـعة ولم تحقق دخلاً اليوم.`;
            if (oldDeaths.length > 0) description += `\n\n💀 مات من الكبر: ${oldDeaths.join('، ')}`;

            const embed = new EmbedBuilder()
                .setTitle(`❖ تـقرير المـزرعـة اليومي`)
                .setColor("Random")
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                .setImage('https://i.postimg.cc/sD3FWvWT/2755e200-2fc8-45e1-8f3f-785b8e19793d-(1).png')
                .setDescription(description)
                .setTimestamp();

            await channel.send({ content: `<@${userID}>`, embeds: [embed] }).catch(() => {});

        } catch (err) {
            console.error(`[Farm Critical Error] User: ${owner.userID || owner.userid}`, err);
        }
    }
}

module.exports = { checkFarmIncome };
