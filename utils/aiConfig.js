const channelsCache = new Map();
const blacklistCache = new Set();
const restrictedCategoriesCache = new Set(); 
const paidChannelsCache = new Map(); 

let db; 

async function init(databaseClient) {
    if (!databaseClient) {
        console.error("[AI Config] ⚠️ Error: databaseClient is undefined. Make sure to pass client.sql when calling init().");
        return;
    }
    
    db = databaseClient;
    
    try {
        await db.query('CREATE TABLE IF NOT EXISTS ai_channels ("channelID" TEXT PRIMARY KEY, "isNsfw" INTEGER)');
        await db.query('CREATE TABLE IF NOT EXISTS ai_blacklist ("userID" TEXT PRIMARY KEY)');
        await db.query('CREATE TABLE IF NOT EXISTS ai_restricted_categories ("guildID" TEXT, "categoryID" TEXT PRIMARY KEY)');
        await db.query('CREATE TABLE IF NOT EXISTS ai_paid_channels ("channelID" TEXT PRIMARY KEY, "guildID" TEXT, "mode" TEXT, "expiresAt" BIGINT)');

        const channels = await db.query('SELECT * FROM ai_channels');
        channelsCache.clear();
        channels.rows.forEach(row => {
            channelsCache.set(row.channelid || row.channelID, { nsfw: !!(row.isnsfw || row.isNsfw) });
        });
        console.log(`[AI Config] ✅ Loaded ${channels.rows.length} channels from DB.`);

        const blocked = await db.query('SELECT "userID" FROM ai_blacklist');
        blacklistCache.clear();
        blocked.rows.forEach(row => blacklistCache.add(row.userid || row.userID));
        console.log(`[AI Config] ✅ Loaded ${blocked.rows.length} blocked users.`);

        const categories = await db.query('SELECT "categoryID" FROM ai_restricted_categories');
        restrictedCategoriesCache.clear();
        categories.rows.forEach(row => restrictedCategoriesCache.add(row.categoryid || row.categoryID));
        console.log(`[AI Config] ✅ Loaded ${categories.rows.length} restricted categories.`);

        const paidChannels = await db.query('SELECT * FROM ai_paid_channels');
        paidChannelsCache.clear();
        paidChannels.rows.forEach(row => {
            paidChannelsCache.set(row.channelid || row.channelID, {
                mode: row.mode,
                expiresAt: Number(row.expiresat || row.expiresAt)
            });
        });

    } catch (e) {
        console.error("[AI Config] ⚠️ Error loading cache:", e.message);
    }
}

module.exports = {
    init, 

    addChannel: async (channelId, isNsfw = false) => {
        if (!db) return console.error("[AI Config] db not initialized.");
        const nsfwInt = isNsfw ? 1 : 0;
        try {
            await db.query('INSERT INTO ai_channels ("channelID", "isNsfw") VALUES ($1, $2) ON CONFLICT ("channelID") DO UPDATE SET "isNsfw" = EXCLUDED."isNsfw"', [channelId, nsfwInt]);
            channelsCache.set(channelId, { nsfw: isNsfw });
        } catch (e) { console.error("[AI Config] Save Error:", e.message); }
    },

    removeChannel: async (channelId) => {
        if (!db) return;
        try {
            await db.query('DELETE FROM ai_channels WHERE "channelID" = $1', [channelId]);
            channelsCache.delete(channelId);
        } catch (e) { console.error("[AI Config] Delete Error:", e.message); }
    },

    getChannelSettings: (channelId) => {
        if (channelsCache.has(channelId)) {
            return channelsCache.get(channelId);
        }
        
        if (paidChannelsCache.has(channelId)) {
            const data = paidChannelsCache.get(channelId);
            if (Date.now() > data.expiresAt) {
                paidChannelsCache.delete(channelId);
                if (db) db.query('DELETE FROM ai_paid_channels WHERE "channelID" = $1', [channelId]).catch(() => {});
                return null;
            }
            return { nsfw: data.mode === 'NSFW' };
        }

        return null;
    },

    getAllChannels: () => {
        const obj = {};
        channelsCache.forEach((val, key) => { obj[key] = val; });
        return obj;
    },

    blockUser: async (userId) => {
        if (!db) return;
        try {
            await db.query('INSERT INTO ai_blacklist ("userID") VALUES ($1) ON CONFLICT DO NOTHING', [userId]);
            blacklistCache.add(userId);
        } catch(e) {}
    },

    unblockUser: async (userId) => {
        if (!db) return;
        try {
            await db.query('DELETE FROM ai_blacklist WHERE "userID" = $1', [userId]);
            blacklistCache.delete(userId);
        } catch(e) {}
    },

    isBlocked: (userId) => {
        return blacklistCache.has(userId);
    },

    addRestrictedCategory: async (guildId, categoryId) => {
        if (!db) return;
        try {
            await db.query('INSERT INTO ai_restricted_categories ("guildID", "categoryID") VALUES ($1, $2) ON CONFLICT ("categoryID") DO UPDATE SET "guildID" = EXCLUDED."guildID"', [guildId, categoryId]);
            restrictedCategoriesCache.add(categoryId);
        } catch(e) {}
    },

    removeRestrictedCategory: async (categoryId) => {
        if (!db) return;
        try {
            await db.query('DELETE FROM ai_restricted_categories WHERE "categoryID" = $1', [categoryId]);
            restrictedCategoriesCache.delete(categoryId);
        } catch(e) {}
    },

    isRestrictedCategory: (categoryId) => {
        if (!categoryId) return false;
        return restrictedCategoriesCache.has(categoryId);
    },

    setPaidChannel: async (guildId, channelId, mode) => {
        if (!db) return;
        const expiresAt = Date.now() + (24 * 60 * 60 * 1000); 
        try {
            await db.query('INSERT INTO ai_paid_channels ("channelID", "guildID", "mode", "expiresAt") VALUES ($1, $2, $3, $4) ON CONFLICT ("channelID") DO UPDATE SET "guildID" = EXCLUDED."guildID", "mode" = EXCLUDED."mode", "expiresAt" = EXCLUDED."expiresAt"', [channelId, guildId, mode, expiresAt]);
            paidChannelsCache.set(channelId, { mode, expiresAt });
        } catch(e) {}
    },

    getPaidChannelStatus: (channelId) => {
        if (paidChannelsCache.has(channelId)) {
            const data = paidChannelsCache.get(channelId);
            if (Date.now() > data.expiresAt) {
                paidChannelsCache.delete(channelId);
                if (db) db.query('DELETE FROM ai_paid_channels WHERE "channelID" = $1', [channelId]).catch(() => {});
                return null;
            }
            return data;
        }
        return null;
    }
};
