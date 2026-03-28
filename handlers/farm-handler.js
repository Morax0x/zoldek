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

async function getGrowthMultiplier(db, userId, guildId) {
    try {
        let repRes;
        try { repRes = await db.query(`SELECT "rep_points" FROM user_reputation WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId]); }
        catch(e) { repRes = await db.query(`SELECT rep_points FROM user_reputation WHERE userid = $1 AND guildid = $2`, [userId, guildId]).catch(()=>({rows:[]})); }
        const points = repRes.rows[0]?.rep_points || 0;
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
        await db.query(`CREATE TABLE IF NOT EXISTS farm_last_payout ("id" TEXT PRIMARY KEY, "lastPayoutDate" BIGINT)`);
        await db.query(`CREATE TABLE IF NOT EXISTS farm_daily_log ("id" BIGSERIAL PRIMARY KEY, "userID" TEXT, "guildID" TEXT, "actionType" TEXT, "itemName" TEXT, "count" BIGINT, "timestamp" BIGINT)`);
    } catch (e) {
        console.error("Error creating farm tables:", e);
    }

    let farmOwnersRes;
    try {
        farmOwnersRes = await db.query(`SELECT DISTINCT "userID", "guildID" FROM user_farm UNION SELECT DISTINCT "userID", "guildID" FROM user_lands`);
    } catch(e) {
        farmOwnersRes = await db.query(`SELECT DISTINCT userid as "userID", guildid as "guildID" FROM user_farm UNION SELECT DISTINCT userid as "userID", guildid as "guildID" FROM user_lands`).catch(()=>({rows:[]}));
    }
    
    const farmOwners = farmOwnersRes.rows;
    if (!farmOwners || !farmOwners.length) return;
    
    for (const owner of farmOwners) {
        try {
            const userID = owner.userID || owner.userid;
            const guildID = owner.guildID || owner.guildid;
            
            if (!userID || !guildID) continue;

            const payoutID = `${userID}-${guildID}`;
            
            // 🚀 تسريع جلب البيانات: دمج طلبات وقت التوزيع وبف العامل في طلب متوازي واحد!
            const [lastPayoutDataRes, workerBuffRes, growthMultiplier] = await Promise.all([
                db.query(`SELECT "lastPayoutDate" FROM farm_last_payout WHERE "id" = $1`, [payoutID]).catch(() => db.query(`SELECT lastpayoutdate FROM farm_last_payout WHERE id = $1`, [payoutID]).catch(()=>({rows:[]}))),
                db.query(`SELECT * FROM user_buffs WHERE "userID" = $1 AND "guildID" = $2 AND "buffType" = 'farm_worker' AND "expiresAt" > $3`, [userID, guildID, now]).catch(() => db.query(`SELECT * FROM user_buffs WHERE userid = $1 AND guildid = $2 AND bufftype = 'farm_worker' AND expiresat > $3`, [userID, guildID, now]).catch(()=>({rows:[]}))),
                getGrowthMultiplier(db, userID, guildID)
            ]);
            
            const lastPayoutData = lastPayoutDataRes.rows[0];
            const payoutTime = lastPayoutData ? (Number(lastPayoutData.lastPayoutDate || lastPayoutData.lastpayoutdate) || 0) : 0;
            const isDailyPayoutDue = (now - payoutTime) >= ONE_DAY;
            const hasWorker = workerBuffRes.rows.length > 0;

            // 1. نظام الحصاد المستمر للعامل
            if (hasWorker) {
                let plantedPlotsRes;
                try { plantedPlotsRes = await db.query(`SELECT * FROM user_lands WHERE "userID" = $1 AND "guildID" = $2 AND "status" = 'planted'`, [userID, guildID]); }
                catch(e) { plantedPlotsRes = await db.query(`SELECT * FROM user_lands WHERE userid = $1 AND guildid = $2 AND status = 'planted'`, [userID, guildID]).catch(()=>({rows:[]})); }
                
                const plantedPlots = plantedPlotsRes.rows;
                
                if (plantedPlots.length > 0) {
                    const harvestUpdates = [];
                    let totalExtraMora = 0;
                    let totalExtraXp = 0;
                    
                    for (const plot of plantedPlots) {
                        const seedId = plot.seedID || plot.seedid;
                        const seed = seedsData.find(s => String(s.id) === String(seedId));
                        if (!seed) continue;

                        const growthMs = (seed.growth_time_hours * 3600000) * growthMultiplier;
                        const plantTime = Number(plot.plantTime || plot.planttime) || now;
                        const age = now - plantTime;

                        if (age >= growthMs) {
                            harvestUpdates.push(
                                db.query(`UPDATE user_lands SET "status" = 'empty', "seedID" = NULL, "plantTime" = NULL WHERE "userID" = $1 AND "guildID" = $2 AND "plotID" = $3`, [userID, guildID, plot.plotID || plot.plotid]).catch(() => db.query(`UPDATE user_lands SET status = 'empty', seedid = NULL, planttime = NULL WHERE userid = $1 AND guildid = $2 AND plotid = $3`, [userID, guildID, plot.plotID || plot.plotid]).catch(()=>{}))
                            );
                            
                            totalExtraMora += Number(seed.sell_price) || 0;
                            totalExtraXp += Number(seed.xp_reward) || 0;
                            
                            if (updateGuildStat) updateGuildStat(client, guildID, userID, 'crops_harvested', seed.sell_price);

                            harvestUpdates.push(
                                db.query(`INSERT INTO farm_daily_log ("userID", "guildID", "actionType", "itemName", "count", "timestamp") VALUES ($1, $2, $3, $4, $5, $6)`, [userID, guildID, 'harvest', seed.name, 1, now]).catch(() => db.query(`INSERT INTO farm_daily_log (userid, guildid, actiontype, itemname, count, timestamp) VALUES ($1, $2, $3, $4, $5, $6)`, [userID, guildID, 'harvest', seed.name, 1, now]).catch(()=>{}))
                            );
                        }
                    }

                    // 🚀 تنفيذ كل عمليات الحصاد في وقت واحد
                    if (harvestUpdates.length > 0) {
                        await Promise.all(harvestUpdates);
                        
                        try {
                            const guildObj = client.guilds.cache.get(guildID);
                            const memberObj = guildObj ? await guildObj.members.fetch(userID).catch(()=>null) : null;
                            if (memberObj && addXPAndCheckLevel) {
                                await addXPAndCheckLevel(client, memberObj, db, totalExtraXp, totalExtraMora, false).catch(()=>{});
                            } else {
                                await db.query(`UPDATE levels SET "mora" = COALESCE(CAST("mora" AS BIGINT), 0) + $1, "xp" = COALESCE(CAST("xp" AS BIGINT), 0) + $2, "totalXP" = COALESCE(CAST("totalXP" AS BIGINT), 0) + $2 WHERE "user" = $3 AND "guild" = $4`, [totalExtraMora, totalExtraXp, userID, guildID]).catch(()=>{});
                            }
                        } catch(e) {}
                    }
                }
            }

            // 2. معالجة الحيوانات (الموت، الجوع، الإطعام التلقائي، والدخل اليومي)
            let userFarmRes;
            try { userFarmRes = await db.query(`SELECT * FROM user_farm WHERE "userID" = $1 AND "guildID" = $2`, [userID, guildID]); }
            catch(e) { userFarmRes = await db.query(`SELECT * FROM user_farm WHERE userid = $1 AND guildid = $2`, [userID, guildID]).catch(()=>({rows:[]})); }
            const userFarm = userFarmRes.rows;
            
            let dailyAnimalIncome = 0;
            let currentAnimalsCount = 0;
            let hungryAnimalsCount = 0;
            let oldDeaths = [];
            let outOfStock = false;
            const animalUpdates = [];

            for (const row of userFarm) {
                const animalId = row.animalID || row.animalid;
                const animal = farmAnimals.find(a => String(a.id) === String(animalId));
                if (!animal) continue; 

                const qty = Number(row.quantity) || 1;
                const purchaseTimestamp = Number(row.purchaseTimestamp || row.purchasetimestamp) || now; 
                const ageInMs = now - purchaseTimestamp;
                const lifespanInMs = animal.lifespan_days * ONE_DAY;

                // نظام الموت الطبيعي
                if (ageInMs >= lifespanInMs) {
                    animalUpdates.push(
                        db.query(`DELETE FROM user_farm WHERE "id" = $1`, [row.id || row.ID]).catch(() => db.query(`DELETE FROM user_farm WHERE id = $1`, [row.id || row.ID]).catch(()=>{})),
                        db.query(`INSERT INTO farm_daily_log ("userID", "guildID", "actionType", "itemName", "count", "timestamp") VALUES ($1, $2, $3, $4, $5, $6)`, [userID, guildID, 'death_old', animal.name, qty, now]).catch(() => db.query(`INSERT INTO farm_daily_log (userid, guildid, actiontype, itemname, count, timestamp) VALUES ($1, $2, $3, $4, $5, $6)`, [userID, guildID, 'death_old', animal.name, qty, now]).catch(()=>{}))
                    );
                    if (!oldDeaths.includes(animal.name)) oldDeaths.push(animal.name);
                    continue; 
                }

                currentAnimalsCount += qty;
                const maxHungerMs = (animal.max_hunger_days || 3) * ONE_DAY; 
                let lastFed = Number(row.lastFedTimestamp || row.lastfedtimestamp) || now;
                let fullUntil = lastFed + maxHungerMs; 
                let timeLeft = fullUntil - now; 
                const feedThreshold = Math.max(14 * 60 * 60 * 1000, maxHungerMs * 0.25);

                // إطعام العامل التلقائي
                if (hasWorker && timeLeft <= feedThreshold) {
                    let invDataRes;
                    try { invDataRes = await db.query(`SELECT * FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [userID, guildID, animal.feed_id]); }
                    catch(e) { invDataRes = await db.query(`SELECT * FROM user_inventory WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [userID, guildID, animal.feed_id]).catch(()=>({rows:[]})); }
                    const invData = invDataRes.rows[0];
                    
                    if (invData && Number(invData.quantity || invData.Quantity) >= qty) {
                        const newQty = Number(invData.quantity || invData.Quantity) - qty;
                        if(newQty > 0) {
                            animalUpdates.push(db.query(`UPDATE user_inventory SET "quantity" = $1 WHERE "id" = $2`, [newQty, invData.id || invData.ID]).catch(() => db.query(`UPDATE user_inventory SET quantity = $1 WHERE id = $2`, [newQty, invData.id || invData.ID]).catch(()=>{})));
                        } else {
                            animalUpdates.push(db.query(`DELETE FROM user_inventory WHERE "id" = $1`, [invData.id || invData.ID]).catch(() => db.query(`DELETE FROM user_inventory WHERE id = $1`, [invData.id || invData.ID]).catch(()=>{})));
                        }
                        
                        animalUpdates.push(
                            db.query(`UPDATE user_farm SET "lastFedTimestamp" = $1 WHERE "id" = $2`, [now, row.id || row.ID]).catch(() => db.query(`UPDATE user_farm SET lastfedtimestamp = $1 WHERE id = $2`, [now, row.id || row.ID]).catch(()=>{})),
                            db.query(`INSERT INTO farm_daily_log ("userID", "guildID", "actionType", "itemName", "count", "timestamp") VALUES ($1, $2, $3, $4, $5, $6)`, [userID, guildID, 'feed', animal.name, qty, now]).catch(() => db.query(`INSERT INTO farm_daily_log (userid, guildid, actiontype, itemname, count, timestamp) VALUES ($1, $2, $3, $4, $5, $6)`, [userID, guildID, 'feed', animal.name, qty, now]).catch(()=>{}))
                        );
                        
                        lastFed = now;
                        timeLeft = maxHungerMs;
                    } else {
                        outOfStock = true;
                    }
                }

                // حساب الدخل اليومي
                if (isDailyPayoutDue) {
                    if (timeLeft > TWELVE_HOURS) {
                        dailyAnimalIncome += (Number(animal.income_per_day) * qty);
                    } else {
                        hungryAnimalsCount += qty; 
                    }
                }
            } 

            // 🚀 تنفيذ كل عمليات الحيوانات (الموت والإطعام) في وقت واحد
            if (animalUpdates.length > 0) {
                await Promise.all(animalUpdates);
            }

            // 3. التقرير والتوزيع
            if (!isDailyPayoutDue) continue;

            if (dailyAnimalIncome > 0) {
                try {
                    const guildObj = client.guilds.cache.get(guildID);
                    const memberObj = guildObj ? await guildObj.members.fetch(userID).catch(()=>null) : null;
                    if (memberObj && addXPAndCheckLevel) {
                        await addXPAndCheckLevel(client, memberObj, db, 0, dailyAnimalIncome, false).catch(()=>{});
                    } else {
                        await db.query(`UPDATE levels SET "mora" = COALESCE(CAST("mora" AS BIGINT), 0) + $1 WHERE "user" = $2 AND "guild" = $3`, [dailyAnimalIncome, userID, guildID]).catch(()=>{});
                    }
                } catch(e) {}
            }

            let dailyLogsRes;
            try { dailyLogsRes = await db.query(`SELECT * FROM farm_daily_log WHERE "userID" = $1 AND "guildID" = $2`, [userID, guildID]); }
            catch(e) { dailyLogsRes = await db.query(`SELECT * FROM farm_daily_log WHERE userid = $1 AND guildid = $2`, [userID, guildID]).catch(()=>({rows:[]})); }
            
            let harvestedMap = new Map(), fedMap = new Map();

            for (const log of dailyLogsRes.rows) {
                const logCount = Number(log.count) || 1;
                const aType = log.actionType || log.actiontype;
                const iName = log.itemName || log.itemname;
                if (aType === 'harvest') harvestedMap.set(iName, (harvestedMap.get(iName) || 0) + logCount);
                else if (aType === 'feed') fedMap.set(iName, (fedMap.get(iName) || 0) + logCount);
            }

            // 🚀 تسريع تنظيف السجلات
            await Promise.all([
                db.query(`DELETE FROM farm_daily_log WHERE "userID" = $1 AND "guildID" = $2`, [userID, guildID]).catch(() => db.query(`DELETE FROM farm_daily_log WHERE userid = $1 AND guildid = $2`, [userID, guildID]).catch(()=>{})),
                db.query(`INSERT INTO farm_last_payout ("id", "lastPayoutDate") VALUES ($1, $2) ON CONFLICT("id") DO UPDATE SET "lastPayoutDate" = $3`, [payoutID, now, now]).catch(() => db.query(`INSERT INTO farm_last_payout (id, lastpayoutdate) VALUES ($1, $2) ON CONFLICT(id) DO UPDATE SET lastpayoutdate = $3`, [payoutID, now, now]).catch(()=>{}))
            ]);

            if (dailyAnimalIncome <= 0 && dailyLogsRes.rows.length === 0 && hungryAnimalsCount === 0 && oldDeaths.length === 0) continue;

            const guildObj = client.guilds.cache.get(guildID);
            if (!guildObj) continue;
            
            let settingsRes;
            try { settingsRes = await db.query(`SELECT "casinoChannelID" FROM settings WHERE "guild" = $1`, [guildID]); }
            catch(e) { settingsRes = await db.query(`SELECT casinochannelid FROM settings WHERE guild = $1`, [guildID]).catch(()=>({rows:[]})); }
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
