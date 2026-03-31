const { EmbedBuilder, Colors } = require('discord.js');

let addXPAndCheckLevel;
try {
    ({ addXPAndCheckLevel } = require('../../handler-utils.js'));
} catch (e) {
    try {
        ({ addXPAndCheckLevel } = require('../../../handlers/handler-utils.js'));
    } catch(err) {}
}

// 🔥 نظام المعالجة الذاتية لقواعد البيانات لضمان عدم ضياع أي مورد 🔥
const safeQuery = async (db, qPg, params) => {
    let res;
    try { res = await db.query(qPg, params); } catch(e) { res = { rows: [] }; }
    const rows1 = Array.isArray(res) ? res : (res?.rows || []);
    if (rows1.length > 0) return { rows: rows1 };

    let fallbackQuery = qPg
        .replace(/"userID"/gi, "userid")
        .replace(/"guildID"/gi, "guildid")
        .replace(/"itemID"/gi, "itemid")
        .replace(/"quantity"/gi, "quantity")
        .replace(/"rep_points"/gi, "rep_points")
        .replace(/"mora"/gi, "mora")
        .replace(/"xp"/gi, "xp")
        .replace(/"totalXP"/gi, "totalxp")
        .replace(/"level"/gi, "level")
        .replace(/"id"/gi, "id")
        .replace(/"user"/gi, "userid")
        .replace(/"guild"/gi, "guildid");

    if (fallbackQuery !== qPg) {
        try { 
            let res2 = await db.query(fallbackQuery, params); 
            const rows2 = Array.isArray(res2) ? res2 : (res2?.rows || []);
            return { rows: rows2 };
        } catch(e2) { }
    }
    return { rows: [] };
};

const safeExecute = async (db, qPg, params) => {
    try { await db.query(qPg, params); return true;} catch(e) { 
        let fallbackQuery = qPg
            .replace(/"userID"/gi, "userid")
            .replace(/"guildID"/gi, "guildid")
            .replace(/"itemID"/gi, "itemid")
            .replace(/"quantity"/gi, "quantity")
            .replace(/"rep_points"/gi, "rep_points")
            .replace(/"mora"/gi, "mora")
            .replace(/"xp"/gi, "xp")
            .replace(/"totalXP"/gi, "totalxp")
            .replace(/"level"/gi, "level")
            .replace(/"id"/gi, "id")
            .replace(/"user"/gi, "userid")
            .replace(/"guild"/gi, "guildid");
        if (fallbackQuery !== qPg) {
            try { await db.query(fallbackQuery, params); return true; } catch(e2) { return false;}
        }
        return false;
    }
};

// 🛡️ نظام الحفظ الفولاذي: مورا وخبرة 🛡️
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
        
        const checkRes = await safeQuery(db, `SELECT "mora", "xp", "totalXP", "level" FROM levels WHERE "user" = $1 AND "guild" = $2`, [userId, guildId]);
        if (checkRes.rows.length > 0) {
            hasRecord = true;
            currentMora = Number(checkRes.rows[0].mora || 0);
            currentXp = Number(checkRes.rows[0].xp || 0);
            currentTotalXp = Number(checkRes.rows[0].totalXP || checkRes.rows[0].totalxp || 0);
            currentLevel = Number(checkRes.rows[0].level || 1);
        }

        const newMora = currentMora + addMora;
        const newXp = currentXp + addXp;
        const newTotalXp = currentTotalXp + addXp;

        if (hasRecord) {
            await safeExecute(db, `UPDATE levels SET "mora" = $1, "xp" = $2, "totalXP" = $3 WHERE "user" = $4 AND "guild" = $5`, [newMora, newXp, newTotalXp, userId, guildId]);
        } else {
            await safeExecute(db, `INSERT INTO levels ("user", "guild", "mora", "xp", "totalXP", "level") VALUES ($1, $2, $3, $4, $5, $6)`, [userId, guildId, newMora, newXp, newTotalXp, currentLevel]);
        }
    } catch (e) {
        console.error(`[🚨 DUNGEON REWARDS ERROR] in safeUpdateLevels:`, e);
    }
}

// 🛡️ نظام الحفظ الفولاذي: السمعة والصناديق 🛡️
async function safeUpdateRepAndChests(db, userId, guildId, repReward, earnedChests) {
    if (!db) return;

    if (repReward > 0) {
        let currentRep = 0;
        const repRes = await safeQuery(db, `SELECT "rep_points" FROM user_reputation WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId]);
        if (repRes.rows.length > 0) {
            currentRep = Number(repRes.rows[0].rep_points || repRes.rows[0].rep_Points || 0);
            await safeExecute(db, `UPDATE user_reputation SET "rep_points" = $1 WHERE "userID" = $2 AND "guildID" = $3`, [currentRep + repReward, userId, guildId]);
        } else {
            await safeExecute(db, `INSERT INTO user_reputation ("userID", "guildID", "rep_points") VALUES ($1, $2, $3)`, [userId, guildId, repReward]);
        }
    }

    if (earnedChests > 0) {
        let currentQty = 0, rowId = null;
        const invRes = await safeQuery(db, `SELECT "id", "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = 'gacha_chest'`, [userId, guildId]);
        if (invRes.rows.length > 0) {
            currentQty = Number(invRes.rows[0].quantity || invRes.rows[0].Quantity || 0);
            rowId = invRes.rows[0].id || invRes.rows[0].ID;
            const newQty = Math.min(currentQty + earnedChests, 999);
            await safeExecute(db, `UPDATE user_inventory SET "quantity" = $1 WHERE "id" = $2`, [newQty, rowId]);
        } else {
            await safeExecute(db, `INSERT INTO user_inventory ("guildID", "userID", "itemID", "quantity") VALUES ($1, $2, 'gacha_chest', $3)`, [guildId, userId, earnedChests]);
        }
    }
}

async function processInstantRepAndChests(p, endFloor, db, guildId, sessionStartFloor = 1) {
    if (p.repAndChestsClaimed) return;
    
    const repMilestones = {
        20: 1, 30: 1, 35: 1, 40: 1, 45: 1, 50: 1,
        55: 2, 60: 2, 65: 3, 70: 3, 75: 4, 
        80: 5, 85: 5, 90: 5, 95: 5, 100: 5
    };

    let repReward = 0;
    let earnedChests = 0;
    
    // يحسب فقط من الطابق اللي بدأ فيه عشان ما يدبّل الجوائز!
    for (let f = sessionStartFloor; f <= endFloor; f++) {
        if (repMilestones[f]) repReward += repMilestones[f];
        if (f % 10 === 0) earnedChests++;
    }

    await safeUpdateRepAndChests(db, p.id, guildId, repReward, earnedChests);
    p.repAndChestsClaimed = true; 
}

async function handleMemberRetreat(member, floor, db, guildId, thread, sessionStartFloor = 1) {
    const earnedMora = Math.floor(member.loot.mora || 0);
    const earnedXp = Math.floor(member.loot.xp || 0);

    if (db && (earnedMora > 0 || earnedXp > 0)) {
        const client = thread ? thread.client : null;
        await safeUpdateLevels(db, member.id, guildId, earnedMora, earnedXp, "RETREAT", client);
        
        await processInstantRepAndChests(member, floor, db, guildId, sessionStartFloor);
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
            effectiveFloor = 20; 
            note = " (Safe Point F20)";
        } else {
            finalMora = Math.floor((p.loot.mora || 0) * 0.5);
            finalXp = Math.floor((p.loot.xp || 0) * 0.5);
            note = " (Penalty -50%)";
        }

        if (db && (finalMora > 0 || finalXp > 0)) {
            await safeUpdateLevels(db, p.id, guildId, finalMora, finalXp, "TEAM WIPE", client);
            // نحسب السمعة من 1 (أو نقطة البداية، لكن الموت يمسح الباقي)
            await processInstantRepAndChests(p, effectiveFloor, db, guildId, 1);
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
            // السمعة والصناديق للقائد والجميع يتم حسابها في end-game.js
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
    safeUpdateRepAndChests 
};
