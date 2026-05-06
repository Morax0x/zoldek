function getTodayDateString() { 
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date());
}

function getWeekStartDateString() {
    const ksaTime = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Riyadh" }));
    const diff = ksaTime.getDate() - (ksaTime.getDay() + 2) % 7; 
    const friday = new Date(ksaTime.setDate(diff));
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(friday);
}

module.exports = (client, db) => {
    // 🚀 الذاكرة العشوائية (RAM Cache)
    const levelsCache = new Map();
    const dailyStatsCache = new Map();
    const weeklyStatsCache = new Map();
    const totalStatsCache = new Map();
    const questNotifCache = new Map();

    client.defaultData = { 
        user: null, guild: null, xp: 0, level: 1, totalXP: 0, mora: 0, lastWork: 0, lastDaily: 0, dailyStreak: 0, bank: 0, 
        lastInterest: 0, totalInterestEarned: 0, hasGuard: 0, guardExpires: 0, lastCollected: 0, totalVCTime: 0, 
        lastRob: 0, lastGuess: 0, lastRPS: 0, lastRoulette: 0, lastTransfer: 0, lastDeposit: 0, shop_purchases: 0, 
        total_meow_count: 0, boost_count: 0, lastPVP: 0, lastFarmYield: 0, lastFish: 0, rodLevel: 1, boatLevel: 1, currentLocation: 'beach',
        lastMemory: 0, lastArrange: 0, last_dungeon: 0, dungeon_tickets: 0, dungeon_gate_level: 1, max_dungeon_floor: 0, dungeon_wins: 0,
        lastRace: 0, lastTransferDate: '', dailyTransferCount: 0, last_rob_pardon: '', last_ticket_reset: '', dungeon_join_count: 0, last_join_reset: 0
    };

    const defaultDailyStats = { messages: 0, images: 0, stickers: 0, emojis_sent: 0, reactions_added: 0, replies_sent: 0, mentions_received: 0, vc_minutes: 0, water_tree: 0, counting_channel: 0, meow_count: 0, streaming_minutes: 0, disboard_bumps: 0, boost_channel_reactions: 0, topgg_votes: 0, main_chat_messages: 0, chatter_badge_given: 0, daily_badge_given: 0, knight_badge_given: 0, ai_interactions: 0, casino_profit: 0, mora_earned: 0, mora_donated: 0, knights_defeated: 0, fish_caught: 0, pvp_wins: 0, crops_harvested: 0 };
    
    const defaultWeeklyStats = { messages: 0, images: 0, stickers: 0, emojis_sent: 0, reactions_added: 0, replies_sent: 0, mentions_received: 0, vc_minutes: 0, water_tree: 0, counting_channel: 0, meow_count: 0, streaming_minutes: 0, disboard_bumps: 0, topgg_votes: 0, weekly_badge_given: 0, ai_interactions: 0 };
    
    const defaultTotalStats = { total_messages: 0, total_images: 0, total_stickers: 0, total_emojis_sent: 0, total_reactions_added: 0, total_replies_sent: 0, total_mentions_received: 0, total_vc_minutes: 0, total_disboard_bumps: 0, total_topgg_votes: 0, total_ai_interactions: 0 };
    
    const defaultQuestNotif = { userID: null, guildID: null, dailyNotif: 1, weeklyNotif: 1, achievementsNotif: 1, levelNotif: 1, kingsNotif: 1, badgesNotif: 1 };

    client.safeMerge = function(base, defaults) {
        const result = { ...base };
        for (const key in defaults) {
            if (result[key] === undefined) result[key] = defaults[key];
        }
        return result;
    };

    function fixCase(row, defaultObj) {
        if (!row) return null;
        let fixed = {};
        for (let key in defaultObj) {
            let lowerKey = key.toLowerCase();
            if (row[lowerKey] !== undefined && row[lowerKey] !== null) fixed[key] = row[lowerKey];
            else if (row[key] !== undefined && row[key] !== null) fixed[key] = row[key];
            else fixed[key] = defaultObj[key];
        }
        for (let key in row) {
            if (fixed[key] === undefined) fixed[key] = row[key];
        }

        for (const [k, v] of Object.entries(fixed)) {
            if (typeof v === 'string' && !isNaN(v) && v.trim() !== '') {
                if (!['user', 'userid', 'guild', 'guildid', 'id', 'lasttransferdate', 'date', 'weekstartdate', 'currentlocation', 'last_rob_pardon', 'last_ticket_reset'].includes(k.toLowerCase())) {
                    fixed[k] = Number(v);
                }
            }
        }
        return fixed;
    }


    // =====================================================================
    // 🛡️ نظام الطابور لحماية قاعدة البيانات (Save Queue System)
    // =====================================================================
    const pendingSaves = {
        levels: new Map(),
        daily: new Map(),
        weekly: new Map(),
        total: new Map(),
        notif: new Map()
    };
    
    let isSaving = false;

    // معالج الحفظ الصامت (يعمل كل 15 ثانية)
    setInterval(async () => {
        if (isSaving || !db) return;
        
        const savesLevels = new Map(pendingSaves.levels); pendingSaves.levels.clear();
        const savesDaily = new Map(pendingSaves.daily); pendingSaves.daily.clear();
        const savesWeekly = new Map(pendingSaves.weekly); pendingSaves.weekly.clear();
        const savesTotal = new Map(pendingSaves.total); pendingSaves.total.clear();
        const savesNotif = new Map(pendingSaves.notif); pendingSaves.notif.clear();

        if (savesLevels.size === 0 && savesDaily.size === 0 && savesWeekly.size === 0 && savesTotal.size === 0 && savesNotif.size === 0) return;

        isSaving = true;
        try {
            await db.query('BEGIN'); 

            // حفظ المستويات (Levels)
            for (const data of savesLevels.values()) {
                await db.query(`
                    INSERT INTO levels (
                        "user", "guild", "xp", "level", "totalXP", "mora", "lastWork", "lastDaily", "dailyStreak", "bank",
                        "lastInterest", "totalInterestEarned", "hasGuard", "guardExpires", "totalVCTime", "lastCollected",
                        "lastRob", "lastGuess", "lastRPS", "lastRoulette", "lastTransfer", "lastDeposit", "shop_purchases",
                        "total_meow_count", "boost_count", "lastPVP", "lastFarmYield", "lastFish", "rodLevel", "boatLevel",
                        "currentLocation", "lastMemory", "lastArrange", "last_dungeon", "dungeon_tickets", "last_ticket_reset", "dungeon_gate_level", "max_dungeon_floor", "dungeon_wins",
                        "lastRace", "dungeon_join_count", "last_join_reset", "last_rob_pardon"
                    ) VALUES (
                        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23,
                        $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43
                    ) ON CONFLICT ("user", "guild") DO UPDATE SET
                        "xp" = EXCLUDED."xp", "level" = EXCLUDED."level", "totalXP" = EXCLUDED."totalXP", "mora" = EXCLUDED."mora", "lastWork" = EXCLUDED."lastWork", "lastDaily" = EXCLUDED."lastDaily", "dailyStreak" = EXCLUDED."dailyStreak", "bank" = EXCLUDED."bank",
                        "lastInterest" = EXCLUDED."lastInterest", "totalInterestEarned" = EXCLUDED."totalInterestEarned", "hasGuard" = EXCLUDED."hasGuard", "guardExpires" = EXCLUDED."guardExpires", "totalVCTime" = EXCLUDED."totalVCTime", "lastCollected" = EXCLUDED."lastCollected",
                        "lastRob" = EXCLUDED."lastRob", "lastGuess" = EXCLUDED."lastGuess", "lastRPS" = EXCLUDED."lastRPS", "lastRoulette" = EXCLUDED."lastRoulette", "lastTransfer" = EXCLUDED."lastTransfer", "lastDeposit" = EXCLUDED."lastDeposit", "shop_purchases" = EXCLUDED."shop_purchases",
                        "total_meow_count" = EXCLUDED."total_meow_count", "boost_count" = EXCLUDED."boost_count", "lastPVP" = EXCLUDED."lastPVP", "lastFarmYield" = EXCLUDED."lastFarmYield", "lastFish" = EXCLUDED."lastFish", "rodLevel" = EXCLUDED."rodLevel", "boatLevel" = EXCLUDED."boatLevel",
                        "currentLocation" = EXCLUDED."currentLocation", "lastMemory" = EXCLUDED."lastMemory", "lastArrange" = EXCLUDED."lastArrange", "last_dungeon" = EXCLUDED."last_dungeon", "dungeon_tickets" = EXCLUDED."dungeon_tickets", "last_ticket_reset" = EXCLUDED."last_ticket_reset", "dungeon_gate_level" = EXCLUDED."dungeon_gate_level", "max_dungeon_floor" = EXCLUDED."max_dungeon_floor", "dungeon_wins" = EXCLUDED."dungeon_wins",
                        "lastRace" = EXCLUDED."lastRace", "dungeon_join_count" = EXCLUDED."dungeon_join_count", "last_join_reset" = EXCLUDED."last_join_reset", "last_rob_pardon" = EXCLUDED."last_rob_pardon";
                `, [
                    data.user || data.userid, data.guild || data.guildid, Number(data.xp) || 0, Number(data.level) || 1, Number(data.totalXP ?? data.totalxp) || 0, Number(data.mora) || 0, Number(data.lastWork ?? data.lastwork) || 0, Number(data.lastDaily ?? data.lastdaily) || 0, Number(data.dailyStreak ?? data.dailystreak) || 0, Number(data.bank) || 0,
                    Number(data.lastInterest ?? data.lastinterest) || 0, Number(data.totalInterestEarned ?? data.totalinterestearned) || 0, Number(data.hasGuard ?? data.hasguard) || 0, Number(data.guardExpires ?? data.guardexpires) || 0, Number(data.totalVCTime ?? data.totalvctime) || 0, Number(data.lastCollected ?? data.lastcollected) || 0,
                    Number(data.lastRob ?? data.lastrob) || 0, Number(data.lastGuess ?? data.lastguess) || 0, Number(data.lastRPS ?? data.lastrps) || 0, Number(data.lastRoulette ?? data.lastroulette) || 0, Number(data.lastTransfer ?? data.lasttransfer) || 0, Number(data.lastDeposit ?? data.lastdeposit) || 0, Number(data.shop_purchases) || 0,
                    Number(data.total_meow_count) || 0, Number(data.boost_count) || 0, Number(data.lastPVP ?? data.lastpvp) || 0, Number(data.lastFarmYield ?? data.lastfarmyield) || 0, Number(data.lastFish ?? data.lastfish) || 0, Number(data.rodLevel ?? data.rodlevel) || 1, Number(data.boatLevel ?? data.boatlevel) || 1,
                    data.currentLocation ?? data.currentlocation ?? 'beach', Number(data.lastMemory ?? data.lastmemory) || 0, Number(data.lastArrange ?? data.lastarrange) || 0, Number(data.last_dungeon) || 0, Number(data.dungeon_tickets) || 0, data.last_ticket_reset ?? data.last_ticket_reset ?? '', Number(data.dungeon_gate_level) || 1, Number(data.max_dungeon_floor) || 0, Number(data.dungeon_wins) || 0,
                    Number(data.lastRace ?? data.lastrace) || 0, Number(data.dungeon_join_count ?? data.dungeon_join_count) || 0, Number(data.last_join_reset ?? data.last_join_reset) || 0, data.last_rob_pardon ?? data.last_rob_pardon ?? ''
                ]);
            }

            // حفظ الإحصائيات اليومية
            for (const data of savesDaily.values()) {
                await db.query(`
                    INSERT INTO user_daily_stats ("id", "userID", "guildID", "date", "messages", "images", "stickers", "emojis_sent", "reactions_added", "replies_sent", "mentions_received", "vc_minutes", "water_tree", "counting_channel", "meow_count", "streaming_minutes", "disboard_bumps", "boost_channel_reactions", "topgg_votes", "main_chat_messages", "chatter_badge_given", "daily_badge_given", "knight_badge_given", "ai_interactions", "casino_profit", "mora_earned", "mora_donated", "knights_defeated", "fish_caught", "pvp_wins", "crops_harvested")
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31)
                    ON CONFLICT ("id") DO UPDATE SET
                    "userID"=EXCLUDED."userID", "guildID"=EXCLUDED."guildID", "date"=EXCLUDED."date", "messages"=EXCLUDED."messages", "images"=EXCLUDED."images", "stickers"=EXCLUDED."stickers", "emojis_sent"=EXCLUDED."emojis_sent", "reactions_added"=EXCLUDED."reactions_added", "replies_sent"=EXCLUDED."replies_sent", "mentions_received"=EXCLUDED."mentions_received", "vc_minutes"=EXCLUDED."vc_minutes", "water_tree"=EXCLUDED."water_tree", "counting_channel"=EXCLUDED."counting_channel", "meow_count"=EXCLUDED."meow_count", "streaming_minutes"=EXCLUDED."streaming_minutes", "disboard_bumps"=EXCLUDED."disboard_bumps", "boost_channel_reactions"=EXCLUDED."boost_channel_reactions", "topgg_votes"=EXCLUDED."topgg_votes", "main_chat_messages"=EXCLUDED."main_chat_messages", "chatter_badge_given"=EXCLUDED."chatter_badge_given", "daily_badge_given"=EXCLUDED."daily_badge_given", "knight_badge_given"=EXCLUDED."knight_badge_given", "ai_interactions"=EXCLUDED."ai_interactions", "casino_profit"=EXCLUDED."casino_profit", "mora_earned"=EXCLUDED."mora_earned", "mora_donated"=EXCLUDED."mora_donated", "knights_defeated"=EXCLUDED."knights_defeated", "fish_caught"=EXCLUDED."fish_caught", "pvp_wins"=EXCLUDED."pvp_wins", "crops_harvested"=EXCLUDED."crops_harvested";
                `, [
                    data.id, data.userID ?? data.userid, data.guildID ?? data.guildid, data.date, Number(data.messages) || 0, Number(data.images) || 0, Number(data.stickers) || 0, Number(data.emojis_sent) || 0, Number(data.reactions_added) || 0, Number(data.replies_sent) || 0, Number(data.mentions_received) || 0, Number(data.vc_minutes) || 0, Number(data.water_tree) || 0, Number(data.counting_channel) || 0, Number(data.meow_count) || 0, Number(data.streaming_minutes) || 0, Number(data.disboard_bumps) || 0, Number(data.boost_channel_reactions) || 0, Number(data.topgg_votes) || 0, Number(data.main_chat_messages) || 0, Number(data.chatter_badge_given) || 0, Number(data.daily_badge_given) || 0, Number(data.knight_badge_given) || 0, Number(data.ai_interactions) || 0, Number(data.casino_profit) || 0, Number(data.mora_earned) || 0, Number(data.mora_donated) || 0, Number(data.knights_defeated) || 0, Number(data.fish_caught) || 0, Number(data.pvp_wins) || 0, Number(data.crops_harvested) || 0
                ]);
            }

            // حفظ الإحصائيات الأسبوعية
            for (const data of savesWeekly.values()) {
                await db.query(`
                    INSERT INTO user_weekly_stats ("id", "userID", "guildID", "weekStartDate", "messages", "images", "stickers", "emojis_sent", "reactions_added", "replies_sent", "mentions_received", "vc_minutes", "water_tree", "counting_channel", "meow_count", "streaming_minutes", "disboard_bumps", "topgg_votes", "weekly_badge_given", "ai_interactions")
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
                    ON CONFLICT ("id") DO UPDATE SET
                    "userID"=EXCLUDED."userID", "guildID"=EXCLUDED."guildID", "weekStartDate"=EXCLUDED."weekStartDate", "messages"=EXCLUDED."messages", "images"=EXCLUDED."images", "stickers"=EXCLUDED."stickers", "emojis_sent"=EXCLUDED."emojis_sent", "reactions_added"=EXCLUDED."reactions_added", "replies_sent"=EXCLUDED."replies_sent", "mentions_received"=EXCLUDED."mentions_received", "vc_minutes"=EXCLUDED."vc_minutes", "water_tree"=EXCLUDED."water_tree", "counting_channel"=EXCLUDED."counting_channel", "meow_count"=EXCLUDED."meow_count", "streaming_minutes"=EXCLUDED."streaming_minutes", "disboard_bumps"=EXCLUDED."disboard_bumps", "topgg_votes"=EXCLUDED."topgg_votes", "weekly_badge_given"=EXCLUDED."weekly_badge_given", "ai_interactions"=EXCLUDED."ai_interactions";
                `, [
                    data.id, data.userID ?? data.userid, data.guildID ?? data.guildid, data.weekStartDate ?? data.weekstartdate, Number(data.messages) || 0, Number(data.images) || 0, Number(data.stickers) || 0, Number(data.emojis_sent) || 0, Number(data.reactions_added) || 0, Number(data.replies_sent) || 0, Number(data.mentions_received) || 0, Number(data.vc_minutes) || 0, Number(data.water_tree) || 0, Number(data.counting_channel) || 0, Number(data.meow_count) || 0, Number(data.streaming_minutes) || 0, Number(data.disboard_bumps) || 0, Number(data.topgg_votes) || 0, Number(data.weekly_badge_given) || 0, Number(data.ai_interactions) || 0
                ]);
            }

            // حفظ الإحصائيات الكلية
            for (const data of savesTotal.values()) {
                await db.query(`
                    INSERT INTO user_total_stats ("id", "userID", "guildID", "total_messages", "total_images", "total_stickers", "total_emojis_sent", "total_reactions_added", "total_replies_sent", "total_mentions_received", "total_vc_minutes", "total_disboard_bumps", "total_topgg_votes", "total_ai_interactions")
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                    ON CONFLICT ("id") DO UPDATE SET
                    "userID"=EXCLUDED."userID", "guildID"=EXCLUDED."guildID", "total_messages"=EXCLUDED."total_messages", "total_images"=EXCLUDED."total_images", "total_stickers"=EXCLUDED."total_stickers", "total_emojis_sent"=EXCLUDED."total_emojis_sent", "total_reactions_added"=EXCLUDED."total_reactions_added", "total_replies_sent"=EXCLUDED."total_replies_sent", "total_mentions_received"=EXCLUDED."total_mentions_received", "total_vc_minutes"=EXCLUDED."total_vc_minutes", "total_disboard_bumps"=EXCLUDED."total_disboard_bumps", "total_topgg_votes"=EXCLUDED."total_topgg_votes", "total_ai_interactions"=EXCLUDED."total_ai_interactions";
                `, [
                    data.id, data.userID ?? data.userid, data.guildID ?? data.guildid, Number(data.total_messages) || 0, Number(data.total_images) || 0, Number(data.total_stickers) || 0, Number(data.total_emojis_sent) || 0, Number(data.total_reactions_added) || 0, Number(data.total_replies_sent) || 0, Number(data.total_mentions_received) || 0, Number(data.total_vc_minutes) || 0, Number(data.total_disboard_bumps) || 0, Number(data.total_topgg_votes) || 0, Number(data.total_ai_interactions) || 0
                ]);
            }

            await db.query('COMMIT');
        } catch (error) {
            console.error("❌ [DB Manager Queue Save Error]:", error.message);
            await db.query('ROLLBACK').catch(()=>{});
        } finally {
            isSaving = false;
        }
    }, 15000); 

    // =====================================================================
    // 🟢 دوال الاستدعاء (API) للبوت
    // =====================================================================

    client.getLevel = async function(userId, guildId) {
        const cacheKey = `${userId}-${guildId}`;
        if (levelsCache.has(cacheKey)) return levelsCache.get(cacheKey);

        try {
            const res = await db.query(`SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2`, [userId, guildId]);
            const data = fixCase(res.rows[0], client.defaultData);
            if (data && data.user) levelsCache.set(cacheKey, data);
            return data && data.user ? data : null;
        } catch(e) { return null; }
    };

    client.setLevel = async function(data) {
        const userId = data.user || data.userid;
        const guildId = data.guild || data.guildid;
        const cacheKey = `${userId}-${guildId}`;

        levelsCache.set(cacheKey, data);
        pendingSaves.levels.set(cacheKey, data);
    };

    // ✅ تحديث حقل محدد في الكاش والكتابة المؤجلة لمنع قيم PVP من الضياع
    // يُستخدم بعد كل عملية DB مباشرة (خصم/إضافة مورا) لضمان التزامن
    client.updateLevelField = function(userId, guildId, updates) {
        const cacheKey = `${userId}-${guildId}`;
        if (levelsCache.has(cacheKey)) {
            const updated = { ...levelsCache.get(cacheKey), ...updates };
            levelsCache.set(cacheKey, updated);
            pendingSaves.levels.set(cacheKey, updated);
        } else if (pendingSaves.levels.has(cacheKey)) {
            // تحديث الكتابة المؤجلة حتى لو لم تكن البيانات في الكاش
            const updated = { ...pendingSaves.levels.get(cacheKey), ...updates };
            pendingSaves.levels.set(cacheKey, updated);
        }
    };

    client.getDailyStats = async function(id) {
        if (dailyStatsCache.has(id)) return dailyStatsCache.get(id);
        try {
            const res = await db.query(`SELECT * FROM user_daily_stats WHERE "id" = $1`, [id]);
            const data = fixCase(res.rows[0], defaultDailyStats);
            if (data && data.userID) dailyStatsCache.set(id, data);
            return data && data.userID ? data : null;
        } catch(e) { return null; }
    };

    client.setDailyStats = async function(data) {
        dailyStatsCache.set(data.id, data);
        pendingSaves.daily.set(data.id, data); 
    };

    client.getWeeklyStats = async function(id) {
        if (weeklyStatsCache.has(id)) return weeklyStatsCache.get(id);
        try {
            const res = await db.query(`SELECT * FROM user_weekly_stats WHERE "id" = $1`, [id]);
            const data = fixCase(res.rows[0], defaultWeeklyStats);
            if (data && data.userID) weeklyStatsCache.set(id, data);
            return data && data.userID ? data : null;
        } catch(e) { return null; }
    };

    client.setWeeklyStats = async function(data) {
        weeklyStatsCache.set(data.id, data);
        pendingSaves.weekly.set(data.id, data); 
    };

    client.getTotalStats = async function(id) {
        if (totalStatsCache.has(id)) return totalStatsCache.get(id);
        try {
            const res = await db.query(`SELECT * FROM user_total_stats WHERE "id" = $1`, [id]);
            const data = fixCase(res.rows[0], defaultTotalStats);
            if (data && data.userID) totalStatsCache.set(id, data);
            return data && data.userID ? data : null;
        } catch(e) { return null; }
    };

    client.setTotalStats = async function(data) {
        totalStatsCache.set(data.id, data);
        pendingSaves.total.set(data.id, data); 
    };

    client.getQuestNotif = async function(id) {
        if (questNotifCache.has(id)) return questNotifCache.get(id);
        try {
            const res = await db.query(`SELECT * FROM quest_notifications WHERE "id" = $1`, [id]);
            const data = fixCase(res.rows[0], defaultQuestNotif);
            if (data && data.userID) questNotifCache.set(id, data);
            return data && data.userID ? data : null;
        } catch(e) { return null; }
    };

    client.setQuestNotif = async function(data) {
        questNotifCache.set(data.id, data);
        const query = `
            INSERT INTO quest_notifications ("id", "userID", "guildID", "dailyNotif", "weeklyNotif", "achievementsNotif", "levelNotif", "kingsNotif", "badgesNotif")
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT ("id") DO UPDATE SET
            "userID"=EXCLUDED."userID", "guildID"=EXCLUDED."guildID", "dailyNotif"=EXCLUDED."dailyNotif", "weeklyNotif"=EXCLUDED."weeklyNotif", "achievementsNotif"=EXCLUDED."achievementsNotif", "levelNotif"=EXCLUDED."levelNotif", "kingsNotif"=EXCLUDED."kingsNotif", "badgesNotif"=EXCLUDED."badgesNotif";
        `;
        try {
            await db.query(query, [
                data.id, data.userID ?? data.userid, data.guildID ?? data.guildid, Number(data.dailyNotif ?? data.dailynotif) || 1, Number(data.weeklyNotif ?? data.weeklynotif) || 1, Number(data.achievementsNotif ?? data.achievementsnotif) || 1, Number(data.levelNotif ?? data.levelnotif) || 1, Number(data.kingsNotif ?? data.kingsnotif) || 1, Number(data.badgesNotif ?? data.badgesnotif) || 1
            ]);
        } catch (err) {}
    };

    // 🔥 الدالة السحرية لإضافة وتخزين المهام والإنجازات بشكل آمن 🔥
    client.incrementQuestStats = async function(userId, guildId, statName, valueToAdd = 1) {
        if (!userId || !guildId || !statName) return;

        const todayStr = getTodayDateString();
        const weekStr = getWeekStartDateString();

        const dailyId = `${userId}-${guildId}-${todayStr}`;
        const weeklyId = `${userId}-${guildId}-${weekStr}`;
        const totalId = `${userId}-${guildId}`;

        try {
            // 1. التحديث اليومي
            let daily = await client.getDailyStats(dailyId);
            if (!daily) daily = { id: dailyId, userID: userId, guildID: guildId, date: todayStr };
            daily = client.safeMerge(daily, defaultDailyStats);
            
            if (daily[statName] !== undefined) {
                daily[statName] = (Number(daily[statName]) || 0) + Number(valueToAdd);
                await client.setDailyStats(daily);
            }

            // 2. التحديث الأسبوعي
            let weekly = await client.getWeeklyStats(weeklyId);
            if (!weekly) weekly = { id: weeklyId, userID: userId, guildID: guildId, weekStartDate: weekStr };
            weekly = client.safeMerge(weekly, defaultWeeklyStats);
            
            if (weekly[statName] !== undefined) {
                weekly[statName] = (Number(weekly[statName]) || 0) + Number(valueToAdd);
                await client.setWeeklyStats(weekly);
            }

            // 3. التحديث الكلي (للإنجازات)
            let total = await client.getTotalStats(totalId);
            if (!total) total = { id: totalId, userID: userId, guildID: guildId };
            total = client.safeMerge(total, defaultTotalStats);
            
            const totalStatName = statName.startsWith('total_') ? statName : `total_${statName}`;
            
            if (total[totalStatName] !== undefined) {
                total[totalStatName] = (Number(total[totalStatName]) || 0) + Number(valueToAdd);
                await client.setTotalStats(total);
            } else if (total[statName] !== undefined) {
                total[statName] = (Number(total[statName]) || 0) + Number(valueToAdd);
                await client.setTotalStats(total);
            }
        } catch (e) {
            console.error("❌ [Increment Quest Stats Error]:", e.message);
        }
    };
};
