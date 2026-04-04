const { EmbedBuilder, Colors } = require('discord.js');

let addXPAndCheckLevel;
try { ({ addXPAndCheckLevel } = require('../../handler-utils.js')); } catch (e) { try { ({ addXPAndCheckLevel } = require('../../../handlers/handler-utils.js')); } catch(err) {} }

const safeQuery = async (db, qPg, params) => {
    let res;
    try { res = await db.query(qPg, params); } catch(e) { res = { rows: [] }; }
    const rows1 = Array.isArray(res) ? res : (res?.rows || []);
    if (rows1.length > 0) return { rows: rows1 };

    let fallbackQuery = qPg.replace(/"userID"/gi, "userid").replace(/"guildID"/gi, "guildid").replace(/"itemID"/gi, "itemid").replace(/"quantity"/gi, "quantity").replace(/"rep_points"/gi, "rep_points").replace(/"mora"/gi, "mora").replace(/"xp"/gi, "xp").replace(/"totalXP"/gi, "totalxp").replace(/"level"/gi, "level").replace(/"id"/gi, "id").replace(/"user"/gi, "userid").replace(/"guild"/gi, "guildid");

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
        let fallbackQuery = qPg.replace(/"userID"/gi, "userid").replace(/"guildID"/gi, "guildid").replace(/"itemID"/gi, "itemid").replace(/"quantity"/gi, "quantity").replace(/"rep_points"/gi, "rep_points").replace(/"mora"/gi, "mora").replace(/"xp"/gi, "xp").replace(/"totalXP"/gi, "totalxp").replace(/"level"/gi, "level").replace(/"id"/gi, "id").replace(/"user"/gi, "userid").replace(/"guild"/gi, "guildid");
        if (fallbackQuery !== qPg) {
            try { await db.query(fallbackQuery, params); return true; } catch(e2) { return false;}
        }
        return false;
    }
};

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
}

async function handleMemberRetreat(member, floor, db, guildId, thread, sessionStartFloor = 1) {
    const earnedMora = Math.floor(member.loot.mora || 0);
    const earnedXp = Math.floor(member.loot.xp || 0);

    member.rewardsClaimed = false; 
    member.finalMora = earnedMora;
    member.finalXp = earnedXp;
    member.loot.mora = 0;
    member.loot.xp = 0;
    
    member.pendingRetreatSave = true;

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

        p.finalMora = finalMora;
        p.finalXp = finalXp;
        p.deathFloor = effectiveFloor; 
        p.pendingWipeSave = true;
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

        p.finalMora = earnedMora;
        p.finalXp = earnedXp;
        p.pendingRetreatSave = true;
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
