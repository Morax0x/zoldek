const { EmbedBuilder, Colors } = require('discord.js');

// 🔥 استيراد الدالة السحرية لإضافة الـ XP بصمت 🔥
let addXPAndCheckLevel;
try {
    ({ addXPAndCheckLevel } = require('../../handler-utils.js'));
} catch (e) {
    try {
        ({ addXPAndCheckLevel } = require('../../../handlers/handler-utils.js'));
    } catch(err) {}
}

// 🛡️ نظام الحفظ الفولاذي: مورا وخبرة (يحمي من مسح البيانات عند الاستعادة) 🛡️
async function safeUpdateLevels(db, userId, guildId, addMora, addXp, context, client) {
    if (!db || (addMora === 0 && addXp === 0)) return;
    
    try {
        if (addXPAndCheckLevel && client) {
            const guildObj = client.guilds.cache.get(guildId);
            if (guildObj) {
                const member = await guildObj.members.fetch(userId).catch(()=>null);
                if (member) {
                    await addXPAndCheckLevel(client, member, db, addXp, addMora, false).catch(()=>{});
                    return; 
                }
            }
        }
        
        let hasRecord = false;
        let currentMora = 0, currentXp = 0, currentTotalXp = 0, currentLevel = 1;
        
        try {
            const checkRes = await db.query(`SELECT "mora", "xp", "totalXP", "level" FROM levels WHERE "user" = $1 AND "guild" = $2`, [userId, guildId]).catch(()=> db.query(`SELECT mora, xp, totalxp, level FROM levels WHERE userid = $1 AND guildid = $2`, [userId, guildId]));
            if (checkRes && checkRes.rows && checkRes.rows.length > 0) {
                hasRecord = true;
                currentMora = Number(checkRes.rows[0].mora || 0);
                currentXp = Number(checkRes.rows[0].xp || 0);
                currentTotalXp = Number(checkRes.rows[0].totalXP || checkRes.rows[0].totalxp || 0);
                currentLevel = Number(checkRes.rows[0].level || 1);
            }
        } catch(e) {}

        const newMora = currentMora + addMora;
        const newXp = currentXp + addXp;
        const newTotalXp = currentTotalXp + addXp;

        if (hasRecord) {
            await db.query(`UPDATE levels SET "mora" = $1, "xp" = $2, "totalXP" = $3 WHERE "user" = $4 AND "guild" = $5`, [newMora, newXp, newTotalXp, userId, guildId]).catch(()=> db.query(`UPDATE levels SET mora = $1, xp = $2, totalxp = $3 WHERE userid = $4 AND guildid = $5`, [newMora, newXp, newTotalXp, userId, guildId]).catch(()=>{}));
        } else {
            await db.query(`INSERT INTO levels ("user", "guild", "mora", "xp", "totalXP", "level") VALUES ($1, $2, $3, $4, $5, $6)`, [userId, guildId, newMora, newXp, newTotalXp, currentLevel]).catch(()=> db.query(`INSERT INTO levels (userid, guildid, mora, xp, totalxp, level) VALUES ($1, $2, $3, $4, $5, $6)`, [userId, guildId, newMora, newXp, newTotalXp, currentLevel]).catch(()=>{}));
        }
    } catch (e) {
        console.error(`[🚨 DUNGEON REWARDS ERROR] in safeUpdateLevels:`, e);
    }
}

// 🛡️ نظام الحفظ الفولاذي: السمعة والصناديق (يمنع التصفير عند الريستارت) 🛡️
async function safeUpdateRepAndChests(db, userId, guildId, repReward, earnedChests) {
    if (!db) return;

    // 1. حماية وتحديث السمعة
    if (repReward > 0) {
        let hasRep = false, currentRep = 0;
        try {
            const repRes = await db.query(`SELECT "rep_points" FROM user_reputation WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId]).catch(()=> db.query(`SELECT rep_points FROM user_reputation WHERE userid = $1 AND guildid = $2`, [userId, guildId]));
            if (repRes?.rows?.[0]) {
                hasRep = true;
                currentRep = Number(repRes.rows[0].rep_points || repRes.rows[0].rep_Points || 0);
            }
        } catch(e) {}

        const newRep = currentRep + repReward;
        if (hasRep) {
            await db.query(`UPDATE user_reputation SET "rep_points" = $1 WHERE "userID" = $2 AND "guildID" = $3`, [newRep, userId, guildId]).catch(()=> db.query(`UPDATE user_reputation SET rep_points = $1 WHERE userid = $2 AND guildid = $3`, [newRep, userId, guildId]).catch(()=>{}));
        } else {
            await db.query(`INSERT INTO user_reputation ("userID", "guildID", "rep_points") VALUES ($1, $2, $3)`, [userId, guildId, newRep]).catch(()=> db.query(`INSERT INTO user_reputation (userid, guildid, rep_points) VALUES ($1, $2, $3)`, [userId, guildId, newRep]).catch(()=>{}));
        }
    }

    // 2. حماية وتحديث الصناديق (تضاف للحقيبة مباشرة)
    if (earnedChests > 0) {
        let hasInv = false, currentQty = 0, rowId = null;
        try {
            const invRes = await db.query(`SELECT "id", "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = 'gacha_chest'`, [userId, guildId]).catch(()=> db.query(`SELECT id, quantity FROM user_inventory WHERE userid = $1 AND guildid = $2 AND itemid = 'gacha_chest'`, [userId, guildId]));
            if (invRes?.rows?.[0]) {
                hasInv = true;
                currentQty = Number(invRes.rows[0].quantity || invRes.rows[0].Quantity || 0);
                rowId = invRes.rows[0].id || invRes.rows[0].ID;
            }
        } catch(e) {}

        const newQty = Math.min(currentQty + earnedChests, 999);
        if (hasInv) {
            await db.query(`UPDATE user_inventory SET "quantity" = $1 WHERE "id" = $2`, [newQty, rowId]).catch(()=> db.query(`UPDATE user_inventory SET quantity = $1 WHERE id = $2`, [newQty, rowId]).catch(()=>{}));
        } else {
            await db.query(`INSERT INTO user_inventory ("guildID", "userID", "itemID", "quantity") VALUES ($1, $2, 'gacha_chest', $3)`, [guildId, userId, newQty]).catch(()=> db.query(`INSERT INTO user_inventory (guildid, userid, itemid, quantity) VALUES ($1, $2, 'gacha_chest', $3)`, [guildId, userId, newQty]).catch(()=>{}));
        }
    }
}

// دالة لمعالجة السمعة والصناديق فورياً وبشكل آمن
async function processInstantRepAndChests(p, endFloor, db, guildId) {
    if (p.repAndChestsClaimed) return;
    
    const repMilestones = {
        20: 1, 30: 1, 35: 1, 40: 1, 45: 1, 50: 1,
        55: 2, 60: 2, 65: 3, 70: 3, 75: 4, 
        80: 5, 85: 5, 90: 5, 95: 5, 100: 5
    };

    let repReward = 0;
    
    for (let f = 1; f <= endFloor; f++) {
        if (repMilestones[f]) repReward += repMilestones[f];
    }
    
    // 🔥 صندوق واحد لكل 10 طوابق 🔥
    let earnedChests = Math.floor(endFloor / 10);

    await safeUpdateRepAndChests(db, p.id, guildId, repReward, earnedChests);
    p.repAndChestsClaimed = true; // تم الاستلام بنجاح، كي لا تتكرر إذا وصل للنهاية
}

async function handleMemberRetreat(member, floor, db, guildId, thread) {
    const earnedMora = Math.floor(member.loot.mora || 0);
    const earnedXp = Math.floor(member.loot.xp || 0);

    if (db && (earnedMora > 0 || earnedXp > 0)) {
        const client = thread ? thread.client : null;
        await safeUpdateLevels(db, member.id, guildId, earnedMora, earnedXp, "RETREAT", client);
        
        // 🔥 إضافة السمعة والصناديق فوراً بأمان قبل ما يسوي البوت ريستارت 🔥
        await processInstantRepAndChests(member, floor, db, guildId);
    }

    member.rewardsClaimed = true;
    member.finalMora = earnedMora;
    member.finalXp = earnedXp;
    member.loot.mora = 0;
    member.loot.xp = 0;

    return { mora: earnedMora, xp: earnedXp };
}

async function handleTeamWipe(players, currentFloor, db, guildId, client) {
    const results = [];
    for (const p of players) {
        if (p.rewardsClaimed) continue;
        let finalMora = 0, finalXp = 0, note = "";
        let effectiveFloor = Math.max(1, currentFloor - 1);

        if (currentFloor > 20) {
            finalMora = p.lootSnapshot20 ? p.lootSnapshot20.mora : 0;
            finalXp = p.lootSnapshot20 ? p.lootSnapshot20.xp : 0;
            effectiveFloor = 20; // العودة لنقطة الحفظ
            note = " (Safe Point F20)";
        } else {
            finalMora = Math.floor((p.loot.mora || 0) * 0.5);
            finalXp = Math.floor((p.loot.xp || 0) * 0.5);
            note = " (Penalty -50%)";
        }

        if (db && (finalMora > 0 || finalXp > 0)) {
            await safeUpdateLevels(db, p.id, guildId, finalMora, finalXp, "TEAM WIPE", client);
            // 🔥 إضافة السمعة والصناديق بأمان حتى وقت الموت 🔥
            await processInstantRepAndChests(p, effectiveFloor, db, guildId);
        }

        p.finalMora = finalMora;
        p.finalXp = finalXp;
        p.rewardsClaimed = true; 
        p.loot.mora = 0;
        p.loot.xp = 0;
        results.push({ name: p.name, mora: finalMora, xp: finalXp, note: note });
    }
    return results;
}

async function handleLeaderRetreat(players, db, guildId, client) {
    const results = [];
    for (const p of players) {
        if (p.rewardsClaimed) continue;
        const earnedMora = Math.floor(p.loot.mora || 0);
        const earnedXp = Math.floor(p.loot.xp || 0);

        if (db && (earnedMora > 0 || earnedXp > 0)) {
            await safeUpdateLevels(db, p.id, guildId, earnedMora, earnedXp, "LEADER RETREAT", client);
            // القائد بينسحب والرحلة بتنتهي كاملة، السمعة بتنحسب بـ end-game.js
        }

        p.finalMora = earnedMora;
        p.finalXp = earnedXp;
        p.rewardsClaimed = true;
        p.loot.mora = 0;
        p.loot.xp = 0;
        results.push({ name: p.name, mora: earnedMora, xp: earnedXp });
    }
    return results;
}

function snapshotLootAtFloor20(players) {
    players.forEach(p => {
        p.lootSnapshot20 = {
            mora: Math.floor(p.loot.mora || 0),
            xp: Math.floor(p.loot.xp || 0)
        };
    });
}

module.exports = { 
    handleMemberRetreat, 
    handleTeamWipe, 
    handleLeaderRetreat,
    snapshotLootAtFloor20,
    safeUpdateRepAndChests // تم التصدير في حال احتاجها نظام آخر
};
