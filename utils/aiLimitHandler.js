const DEFAULT_DAILY_LIMIT = 10;
const pendingRequests = new Map();

function getTodayDate() {
    return new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Riyadh' });
}

// دالة حماية الداتابيز
async function execSafe(db, qPg, qLite, params = []) {
    try {
        let res = await db.query(qPg, params);
        return res || { rows: [] };
    } catch(e) {
        try {
            let res2 = await db.query(qLite, params);
            return res2 || { rows: [] };
        } catch(e2) {
            return { rows: [], error: true };
        }
    }
}

module.exports = {
    getUserDailyLimit: async (member, db) => {
        if (!member || !member.roles) return DEFAULT_DAILY_LIMIT;

        const guildID = member.guild.id;
        const allLimitsRes = await execSafe(db, 
            'SELECT "roleID", "limitCount" FROM ai_role_limits WHERE "guildID" = $1', 
            'SELECT roleid as "roleID", limitcount as "limitCount" FROM ai_role_limits WHERE guildid = $1', 
            [guildID]
        );
        const allLimits = allLimitsRes.rows;
        
        let highestLimit = DEFAULT_DAILY_LIMIT; 

        if (allLimits.length > 0) {
            member.roles.cache.forEach(role => {
                const limitData = allLimits.find(l => l.roleID === role.id);
                if (limitData) {
                    const l = parseInt(limitData.limitCount);
                    if (l > highestLimit) highestLimit = l; // يعطيه أعلى ليمت موجود برتبه
                }
            });
        }
        return highestLimit;
    },

    checkUserUsage: async (member, db) => {
        if (!db) db = member.client.sql;
        const userId = member.id;
        const guildId = member.guild.id;
        const today = getTodayDate();

        // 1. تأكد من الجداول
        await execSafe(db, `CREATE TABLE IF NOT EXISTS ai_user_usage ("userID" TEXT PRIMARY KEY, "guildID" TEXT, "dailyUsage" INTEGER DEFAULT 0, "purchasedBalance" INTEGER DEFAULT 0, "lastResetDate" TEXT)`, `CREATE TABLE IF NOT EXISTS ai_user_usage (userid TEXT PRIMARY KEY, guildid TEXT, dailyusage INTEGER DEFAULT 0, purchasedbalance INTEGER DEFAULT 0, lastresetdate TEXT)`);
        
        let userUsageRes = await execSafe(db, 'SELECT * FROM ai_user_usage WHERE "userID" = $1', 'SELECT userid as "userID", dailyusage as "dailyUsage", purchasedbalance as "purchasedBalance", lastresetdate as "lastResetDate" FROM ai_user_usage WHERE userid = $1', [userId]);
        let userUsage = userUsageRes.rows[0];

        if (!userUsage) {
            await execSafe(db, 
                'INSERT INTO ai_user_usage ("userID", "guildID", "dailyUsage", "purchasedBalance", "lastResetDate") VALUES ($1, $2, 0, 0, $3)', 
                'INSERT INTO ai_user_usage (userid, guildid, dailyusage, purchasedbalance, lastresetdate) VALUES ($1, $2, 0, 0, $3)', 
                [userId, guildId, today]
            );
            userUsage = { userID: userId, dailyUsage: 0, purchasedBalance: 0, lastResetDate: today };
        }

        if (userUsage.lastResetDate !== today) {
            await execSafe(db, 'UPDATE ai_user_usage SET "dailyUsage" = 0, "lastResetDate" = $1 WHERE "userID" = $2', 'UPDATE ai_user_usage SET dailyusage = 0, lastresetdate = $1 WHERE userid = $2', [today, userId]);
            userUsage.dailyUsage = 0;
        }

        const maxDailyLimit = await module.exports.getUserDailyLimit(member, db);

        const userPending = pendingRequests.get(userId) || [];
        const pendingFree = userPending.filter(type => type === 'free').length;
        const pendingPurchased = userPending.filter(type => type === 'purchased').length;

        const currentDailyUsage = parseInt(userUsage.dailyUsage || 0) + pendingFree;
        const currentPurchasedBalance = parseInt(userUsage.purchasedBalance || 0) - pendingPurchased;

        if (currentDailyUsage < maxDailyLimit) {
            userPending.push('free');
            pendingRequests.set(userId, userPending);
            return { canChat: true, source: 'free', currentDailyUsage, maxDailyLimit, currentPurchasedBalance };
        }

        if (currentPurchasedBalance > 0) {
            userPending.push('purchased');
            pendingRequests.set(userId, userPending);
            return { canChat: true, source: 'purchased', currentDailyUsage, maxDailyLimit, currentPurchasedBalance };
        }

        return { canChat: false, source: 'none' };
    },

    incrementUsage: async (member, db) => {
        let userId = typeof member === 'string' ? member : member.id;
        const userPending = pendingRequests.get(userId) || [];
        const actionType = userPending.shift() || 'free'; 
        
        if (userPending.length === 0) pendingRequests.delete(userId);
        else pendingRequests.set(userId, userPending);

        if (actionType === 'free') {
            await execSafe(db, 'UPDATE ai_user_usage SET "dailyUsage" = "dailyUsage" + 1 WHERE "userID" = $1', 'UPDATE ai_user_usage SET dailyusage = dailyusage + 1 WHERE userid = $1', [userId]);
        } else if (actionType === 'purchased') {
            await execSafe(db, 'UPDATE ai_user_usage SET "purchasedBalance" = "purchasedBalance" - 1 WHERE "userID" = $1', 'UPDATE ai_user_usage SET purchasedbalance = purchasedbalance - 1 WHERE userid = $1', [userId]);
        }
    },
    
    releasePendingUsage: async (userId) => {
        const userPending = pendingRequests.get(userId) || [];
        if (userPending.length > 0) {
            userPending.shift();
            if (userPending.length === 0) pendingRequests.delete(userId);
            else pendingRequests.set(userId, userPending);
        }
    },

    addPurchasedBalance: async (userId, amount, db) => {
        const today = getTodayDate();
        await execSafe(db, 
            `INSERT INTO ai_user_usage ("userID", "guildID", "dailyUsage", "purchasedBalance", "lastResetDate") VALUES ($1, 'Unknown', 0, $2, $3) ON CONFLICT("userID") DO UPDATE SET "purchasedBalance" = COALESCE(ai_user_usage."purchasedBalance", 0) + $4`,
            `INSERT INTO ai_user_usage (userid, guildid, dailyusage, purchasedbalance, lastresetdate) VALUES ($1, 'Unknown', 0, $2, $3) ON CONFLICT(userid) DO UPDATE SET purchasedbalance = COALESCE(ai_user_usage.purchasedbalance, 0) + $4`,
            [userId, amount, today, amount]
        );
    },

    setRoleLimit: async (guildID, roleID, limit, db) => {
        await execSafe(db, `CREATE TABLE IF NOT EXISTS ai_role_limits ("guildID" TEXT, "roleID" TEXT, "limitCount" INTEGER, PRIMARY KEY ("guildID", "roleID"))`, `CREATE TABLE IF NOT EXISTS ai_role_limits (guildid TEXT, roleid TEXT, limitcount INTEGER, PRIMARY KEY (guildid, roleid))`);
        await execSafe(db, 
            `INSERT INTO ai_role_limits ("guildID", "roleID", "limitCount") VALUES ($1, $2, $3) ON CONFLICT ("guildID", "roleID") DO UPDATE SET "limitCount" = EXCLUDED."limitCount"`,
            `INSERT INTO ai_role_limits (guildid, roleid, limitcount) VALUES ($1, $2, $3) ON CONFLICT (guildid, roleid) DO UPDATE SET limitcount = EXCLUDED.limitcount`,
            [guildID, roleID, limit]
        );
    }
};
