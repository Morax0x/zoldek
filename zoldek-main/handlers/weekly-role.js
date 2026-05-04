const path = require('path');
const rootDir = process.cwd();

let OWNER_ID = "1145327691772481577"; 
try {
    const constants = require(path.join(rootDir, 'handlers', 'dungeon', 'constants.js'));
    OWNER_ID = constants.OWNER_ID;
} catch (e) { 
    console.log("[WeeklyRole] Warning: Constants file not found, using default ID."); 
}

const CONFIG = {
    GUILD_ID: "848921014141845544", 
    ROLE_ID: "1408766278570872934", 
    UPDATE_INTERVAL: 10 * 60 * 1000 
};

function getWeekStartDateString() {
    const now = new Date();
    const diff = now.getUTCDate() - (now.getUTCDay() + 2) % 7;
    const friday = new Date(now.setUTCDate(diff));
    friday.setUTCHours(0, 0, 0, 0);
    return friday.toISOString().split('T')[0];
}

async function updateWeeklyRole(client) {
    try {
        const guild = client.guilds.cache.get(CONFIG.GUILD_ID);
        if (!guild) return; 

        const role = guild.roles.cache.get(CONFIG.ROLE_ID);
        if (!role) return console.log("[WeeklyRole] ❌ Role not found!");

        const db = client.sql; // ⚠️ تم التعديل من client.db إلى client.sql للتوافق مع باقي البوت
        if (!db) return;

        const weekStart = getWeekStartDateString();

        const queryResult = await db.query(`
            SELECT "userID", 
                   (COALESCE("messages", 0) * 15 + COALESCE("vc_minutes", 0) * 10) as score 
            FROM user_weekly_stats 
            WHERE "guildID" = $1 AND "userID" != $2 AND "weekStartDate" = $3 
            ORDER BY score DESC, "messages" DESC 
            LIMIT 1
        `, [CONFIG.GUILD_ID, OWNER_ID, weekStart]);

        const topUser = queryResult.rows[0];

        if (!topUser || topUser.score <= 0) {
            return; 
        }

        const topUserId = topUser.userID || topUser.userid; // ⚠️ حماية لضمان قراءة الـ ID

        const winnerMember = await guild.members.fetch(topUserId).catch(() => null);
        if (!winnerMember) return;

        const currentHolders = role.members;

        if (currentHolders.has(topUserId) && currentHolders.size === 1) {
            return;
        }

        console.log(`👑 [WeeklyRole] New King Detected: ${winnerMember.user.tag} (Score: ${topUser.score})`);

        for (const [memberID, member] of currentHolders) {
            if (memberID !== topUserId) {
                await member.roles.remove(role).catch(e => console.error(`[WeeklyRole] Failed to remove role from ${memberID}:`, e.message));
            }
        }

        if (!currentHolders.has(topUserId)) {
            await winnerMember.roles.add(role).catch(e => console.error(`[WeeklyRole] Failed to add role to ${topUserId}:`, e.message));
        }

    } catch (error) {
        console.error("[WeeklyRole] Error:", error);
    }
}

module.exports = (client) => {
    setTimeout(() => updateWeeklyRole(client), 5000); 
    setInterval(() => {
        updateWeeklyRole(client);
    }, CONFIG.UPDATE_INTERVAL);
};
