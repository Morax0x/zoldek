const defaultMarketItems = require("./json/market-items.json");

async function setupDatabase(clientOrSql) {
    const db = clientOrSql.sql ? clientOrSql.sql : clientOrSql;
    if (!db) return;

    console.log("[Database] Starting Cloud Integrity & Schema Check...");

    const tables = [
        // 👑 تم إضافة "lastScratch" BIGINT DEFAULT 0 هنا داخل الجدول الأساسي
        `CREATE TABLE IF NOT EXISTS levels ("user" TEXT NOT NULL, "guild" TEXT NOT NULL, "xp" BIGINT DEFAULT 0, "level" BIGINT DEFAULT 1, "totalXP" BIGINT DEFAULT 0, "mora" BIGINT DEFAULT 0, "lastWork" BIGINT DEFAULT 0, "lastDaily" BIGINT DEFAULT 0, "dailyStreak" BIGINT DEFAULT 0, "bank" BIGINT DEFAULT 0, "lastInterest" BIGINT DEFAULT 0, "totalInterestEarned" BIGINT DEFAULT 0, "hasGuard" BIGINT DEFAULT 0, "guardExpires" BIGINT DEFAULT 0, "totalVCTime" BIGINT DEFAULT 0, "lastCollected" BIGINT DEFAULT 0, "lastRob" BIGINT DEFAULT 0, "lastGuess" BIGINT DEFAULT 0, "lastRPS" BIGINT DEFAULT 0, "lastRoulette" BIGINT DEFAULT 0, "lastTransfer" BIGINT DEFAULT 0, "lastDeposit" BIGINT DEFAULT 0, "shop_purchases" BIGINT DEFAULT 0, "total_meow_count" BIGINT DEFAULT 0, "boost_count" BIGINT DEFAULT 0, "lastPVP" BIGINT DEFAULT 0, "lastFarmYield" BIGINT DEFAULT 0, "lastFish" BIGINT DEFAULT 0, "rodLevel" BIGINT DEFAULT 0, "boatLevel" BIGINT DEFAULT 0, "currentLocation" TEXT DEFAULT 'beach', "lastMemory" BIGINT DEFAULT 0, "lastArrange" BIGINT DEFAULT 0, "dungeon_gate_level" BIGINT DEFAULT 1, "max_dungeon_floor" BIGINT DEFAULT 0, "dungeon_wins" BIGINT DEFAULT 0, "lastDungeon" BIGINT DEFAULT 0, "last_dungeon" BIGINT DEFAULT 0, "lastScratch" BIGINT DEFAULT 0, "dungeon_join_count" BIGINT DEFAULT 0, "last_join_reset" BIGINT DEFAULT 0, "lastRace" BIGINT DEFAULT 0, "dungeon_tickets" BIGINT DEFAULT 0, "last_ticket_reset" TEXT DEFAULT '', "last_rob_pardon" TEXT DEFAULT '', "lastTransferDate" TEXT DEFAULT '', "dailyTransferCount" BIGINT DEFAULT 0, PRIMARY KEY ("user", "guild"))`,

        `CREATE TABLE IF NOT EXISTS user_fishing ("userID" TEXT NOT NULL, "guildID" TEXT NOT NULL, "rodLevel" BIGINT DEFAULT 1, "currentRod" TEXT DEFAULT 'سنارة خشبية', "boatLevel" BIGINT DEFAULT 1, "currentBoat" TEXT DEFAULT 'قارب خشب', PRIMARY KEY ("userID", "guildID"))`,

        `CREATE TABLE IF NOT EXISTS settings ("guild" TEXT PRIMARY KEY, "voiceXP" BIGINT DEFAULT 0, "voiceCooldown" BIGINT DEFAULT 60000, "customXP" BIGINT DEFAULT 25, "customCooldown" BIGINT DEFAULT 60000, "levelUpMessage" TEXT, "lvlUpTitle" TEXT, "lvlUpDesc" TEXT, "lvlUpImage" TEXT, "lvlUpColor" TEXT, "lvlUpMention" BIGINT DEFAULT 1, "streakEmoji" TEXT DEFAULT '🔥', "questChannelID" TEXT, "treeBotID" TEXT, "treeChannelID" TEXT, "treeMessageID" TEXT, "countingChannelID" TEXT, "vipRoleID" TEXT, "casinoChannelID" TEXT, "dropGiveawayChannelID" TEXT, "dropTitle" TEXT, "dropDescription" TEXT, "dropColor" TEXT, "dropFooter" TEXT, "dropButtonLabel" TEXT, "dropButtonEmoji" TEXT, "dropMessageContent" TEXT, "lastMediaUpdateSent" TEXT, "lastMediaUpdateMessageID" TEXT, "lastMediaUpdateChannelID" TEXT, "shopChannelID" TEXT, "bumpChannelID" TEXT, "customRoleAnchorID" TEXT, "customRolePanelTitle" TEXT, "customRolePanelDescription" TEXT, "customRolePanelImage" TEXT, "customRolePanelColor" TEXT, "chatChannelID" TEXT, "lastQuestPanelChannelID" TEXT, "streakTimerChannelID" TEXT, "dailyTimerChannelID" TEXT, "weeklyTimerChannelID" TEXT, "img_level" TEXT, "img_mora" TEXT, "img_streak" TEXT, "img_media_streak" TEXT, "img_strongest" TEXT, "img_weekly_xp" TEXT, "img_daily_xp" TEXT, "img_achievements" TEXT, "shopLogChannelID" TEXT, "marketStatus" TEXT DEFAULT 'normal', "boostChannelID" TEXT, "voiceChannelID" TEXT, "savedStatusType" TEXT, "savedStatusText" TEXT, "prefix" TEXT DEFAULT '-', "casinoChannelID2" TEXT, "serverTag" TEXT, "bumpNotifyRoleID" TEXT, "nextBumpTime" BIGINT DEFAULT 0, "lastBumperID" TEXT, "levelChannel" TEXT, "modLogChannelID" TEXT, "transactionLogChannelID" TEXT, "guildBoardChannelID" TEXT, "guildBoardMessageID" TEXT, "kingsBoardMessageID" TEXT, "guildAnnounceChannelID" TEXT, "roleCasinoKing" TEXT, "roleMerchant" TEXT, "rolePhilanthropist" TEXT, "roleVoice" TEXT, "roleAbyss" TEXT, "roleChatter" TEXT, "roleKnightSlayer" TEXT, "roleFisherKing" TEXT, "rolePvPKing" TEXT, "roleThief" TEXT, "roleDailyQuester" TEXT, "roleWeeklyQuester" TEXT, "roleRankSS" TEXT, "roleRankS" TEXT, "roleRankA" TEXT, "roleRankB" TEXT, "roleRankC" TEXT, "roleRankD" TEXT, "chatterChannelID" TEXT, "roleChatterBadge" TEXT, "roleDailyBadge" TEXT, "roleWeeklyBadge" TEXT)`,

        `CREATE TABLE IF NOT EXISTS report_settings ("guildID" TEXT PRIMARY KEY, "logChannelID" TEXT, "reportChannelID" TEXT, "jailRoleID" TEXT, "arenaRoleID" TEXT, "unlimitedRoleID" TEXT, "testRoleID" TEXT)`,
        `CREATE TABLE IF NOT EXISTS report_permissions ("guildID" TEXT NOT NULL, "roleID" TEXT NOT NULL, PRIMARY KEY ("guildID", "roleID"))`,
        `CREATE TABLE IF NOT EXISTS active_reports ("id" BIGSERIAL PRIMARY KEY, "guildID" TEXT NOT NULL, "targetID" TEXT NOT NULL, "reporterID" TEXT NOT NULL, "timestamp" BIGINT NOT NULL, UNIQUE("guildID", "targetID", "reporterID"))`,
        `CREATE TABLE IF NOT EXISTS jailed_members ("guildID" TEXT NOT NULL, "userID" TEXT NOT NULL, "unjailTime" BIGINT NOT NULL, PRIMARY KEY ("guildID", "userID"))`,
        `CREATE TABLE IF NOT EXISTS quest_achievement_roles ("guildID" TEXT NOT NULL, "roleID" TEXT NOT NULL, "achievementID" TEXT NOT NULL, PRIMARY KEY ("guildID", "roleID", "achievementID"))`,
        `CREATE TABLE IF NOT EXISTS race_roles ("guildID" TEXT NOT NULL, "roleID" TEXT PRIMARY KEY, "raceName" TEXT NOT NULL)`,
        `CREATE TABLE IF NOT EXISTS prefix ("serverprefix" TEXT, "guild" TEXT PRIMARY KEY)`,
        `CREATE TABLE IF NOT EXISTS role_buffs ("guildID" TEXT NOT NULL, "roleID" TEXT NOT NULL, "buffPercent" BIGINT NOT NULL, PRIMARY KEY ("guildID", "roleID"))`,
        `CREATE TABLE IF NOT EXISTS role_mora_buffs ("guildID" TEXT NOT NULL, "roleID" TEXT NOT NULL, "buffPercent" BIGINT NOT NULL, PRIMARY KEY ("guildID", "roleID"))`,
        
        `CREATE TABLE IF NOT EXISTS user_buffs ("id" BIGSERIAL PRIMARY KEY, "guildID" TEXT, "userID" TEXT, "buffPercent" BIGINT, "expiresAt" BIGINT, "buffType" TEXT, "multiplier" REAL DEFAULT 0.0)`,
        
        `CREATE TABLE IF NOT EXISTS streaks ("id" TEXT PRIMARY KEY, "guildID" TEXT, "userID" TEXT, "streakCount" BIGINT, "lastMessageTimestamp" BIGINT, "hasGracePeriod" BIGINT, "hasItemShield" BIGINT, "nicknameActive" BIGINT DEFAULT 1, "hasReceivedFreeShield" BIGINT DEFAULT 0, "separator" TEXT DEFAULT '|', "dmNotify" BIGINT DEFAULT 1, "highestStreak" BIGINT DEFAULT 0, "has12hWarning" BIGINT DEFAULT 0)`,
        `CREATE TABLE IF NOT EXISTS "rankCardTable" ("id" TEXT PRIMARY KEY, "barColor" TEXT, "textColor" TEXT, "backgroundColor" TEXT)`,
        
        `CREATE TABLE IF NOT EXISTS market_items ("id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "description" TEXT, "currentPrice" BIGINT DEFAULT 0, "lastChangePercent" REAL DEFAULT 0.0, "lastChange" BIGINT DEFAULT 0)`,
        `CREATE TABLE IF NOT EXISTS user_portfolio ("id" BIGSERIAL PRIMARY KEY, "guildID" TEXT NOT NULL, "userID" TEXT NOT NULL, "itemID" TEXT NOT NULL, "quantity" BIGINT DEFAULT 0, "purchasePrice" BIGINT DEFAULT 0, UNIQUE("guildID", "userID", "itemID"))`,
        `CREATE TABLE IF NOT EXISTS blacklistTable ("id" TEXT PRIMARY KEY, "guild" TEXT, "typeId" TEXT, "type" TEXT)`,
        `CREATE TABLE IF NOT EXISTS channel ("guild" TEXT PRIMARY KEY, "channel" TEXT)`,
        
        `CREATE TABLE IF NOT EXISTS user_farm ("id" BIGSERIAL PRIMARY KEY, "guildID" TEXT NOT NULL, "userID" TEXT NOT NULL, "animalID" TEXT NOT NULL, "purchaseTimestamp" BIGINT DEFAULT 0, "lastCollected" BIGINT DEFAULT 0, "quantity" BIGINT DEFAULT 1, "lastFedTimestamp" BIGINT DEFAULT 1767962178880)`,
        
        `CREATE TABLE IF NOT EXISTS user_daily_stats ("id" TEXT PRIMARY KEY, "userID" TEXT NOT NULL, "guildID" TEXT NOT NULL, "date" TEXT NOT NULL, "messages" BIGINT DEFAULT 0, "images" BIGINT DEFAULT 0, "stickers" BIGINT DEFAULT 0, "reactions_added" BIGINT DEFAULT 0, "replies_sent" BIGINT DEFAULT 0, "mentions_received" BIGINT DEFAULT 0, "vc_minutes" BIGINT DEFAULT 0, "water_tree" BIGINT DEFAULT 0, "counting_channel" BIGINT DEFAULT 0, "meow_count" BIGINT DEFAULT 0, "streaming_minutes" BIGINT DEFAULT 0, "disboard_bumps" BIGINT DEFAULT 0, "emojis_sent" BIGINT DEFAULT 0, "boost_channel_reactions" BIGINT DEFAULT 0, "ai_interactions" BIGINT DEFAULT 0, "topgg_votes" BIGINT DEFAULT 0, "casino_profit" BIGINT DEFAULT 0, "mora_earned" BIGINT DEFAULT 0, "mora_donated" BIGINT DEFAULT 0, "knights_defeated" BIGINT DEFAULT 0, "fish_caught" BIGINT DEFAULT 0, "pvp_wins" BIGINT DEFAULT 0, "crops_harvested" BIGINT DEFAULT 0, "main_chat_messages" BIGINT DEFAULT 0, "chatter_badge_given" BIGINT DEFAULT 0, "daily_badge_given" BIGINT DEFAULT 0, "knight_badge_given" BIGINT DEFAULT 0)`,
        
        `CREATE TABLE IF NOT EXISTS user_achievements ("id" BIGSERIAL PRIMARY KEY, "userID" TEXT NOT NULL, "guildID" TEXT NOT NULL, "achievementID" TEXT NOT NULL, "timestamp" BIGINT NOT NULL, UNIQUE("userID", "guildID", "achievementID"))`,
        `CREATE TABLE IF NOT EXISTS user_quest_claims ("claimID" TEXT PRIMARY KEY, "userID" TEXT NOT NULL, "guildID" TEXT NOT NULL, "questID" TEXT NOT NULL, "dateStr" TEXT NOT NULL)`,
        
        `CREATE TABLE IF NOT EXISTS user_weekly_stats ("id" TEXT PRIMARY KEY, "userID" TEXT NOT NULL, "guildID" TEXT NOT NULL, "weekStartDate" TEXT NOT NULL, "messages" BIGINT DEFAULT 0, "images" BIGINT DEFAULT 0, "stickers" BIGINT DEFAULT 0, "reactions_added" BIGINT DEFAULT 0, "replies_sent" BIGINT DEFAULT 0, "mentions_received" BIGINT DEFAULT 0, "vc_minutes" BIGINT DEFAULT 0, "water_tree" BIGINT DEFAULT 0, "counting_channel" BIGINT DEFAULT 0, "meow_count" BIGINT DEFAULT 0, "streaming_minutes" BIGINT DEFAULT 0, "disboard_bumps" BIGINT DEFAULT 0, "emojis_sent" BIGINT DEFAULT 0, "ai_interactions" BIGINT DEFAULT 0, "topgg_votes" BIGINT DEFAULT 0, "weekly_badge_given" BIGINT DEFAULT 0)`,
        
        `CREATE TABLE IF NOT EXISTS user_total_stats ("id" TEXT PRIMARY KEY, "userID" TEXT NOT NULL, "guildID" TEXT NOT NULL, "total_messages" BIGINT DEFAULT 0, "total_images" BIGINT DEFAULT 0, "total_stickers" BIGINT DEFAULT 0, "total_reactions_added" BIGINT DEFAULT 0, "total_replies_sent" BIGINT DEFAULT 0, "total_mentions_received" BIGINT DEFAULT 0, "total_vc_minutes" BIGINT DEFAULT 0, "total_disboard_bumps" BIGINT DEFAULT 0, "total_emojis_sent" BIGINT DEFAULT 0, "total_ai_interactions" BIGINT DEFAULT 0, "total_topgg_votes" BIGINT DEFAULT 0, UNIQUE("userID", "guildID"))`,
        
        `CREATE TABLE IF NOT EXISTS quest_notifications ("id" TEXT PRIMARY KEY, "userID" TEXT NOT NULL, "guildID" TEXT NOT NULL, "dailyNotif" BIGINT DEFAULT 1, "weeklyNotif" BIGINT DEFAULT 1, "achievementsNotif" BIGINT DEFAULT 1, "levelNotif" BIGINT DEFAULT 1, "kingsNotif" BIGINT DEFAULT 1, "badgesNotif" BIGINT DEFAULT 1, UNIQUE("userID", "guildID"))`,
        
        `CREATE TABLE IF NOT EXISTS user_weapons ("id" BIGSERIAL PRIMARY KEY, "userID" TEXT NOT NULL, "guildID" TEXT NOT NULL, "raceName" TEXT NOT NULL, "weaponLevel" BIGINT DEFAULT 1, UNIQUE("userID", "guildID", "raceName"))`,
        `CREATE TABLE IF NOT EXISTS user_skills ("id" BIGSERIAL PRIMARY KEY, "userID" TEXT NOT NULL, "guildID" TEXT NOT NULL, "skillID" TEXT NOT NULL, "skillLevel" BIGINT DEFAULT 1, UNIQUE("userID", "guildID", "skillID"))`,
        `CREATE TABLE IF NOT EXISTS temporary_roles ("userID" TEXT NOT NULL, "guildID" TEXT NOT NULL, "roleID" TEXT NOT NULL, "expiresAt" BIGINT DEFAULT 0, PRIMARY KEY ("userID", "guildID", "roleID"))`,
        `CREATE TABLE IF NOT EXISTS command_shortcuts ("guildID" TEXT NOT NULL, "channelID" TEXT NOT NULL, "shortcutWord" TEXT NOT NULL, "commandName" TEXT NOT NULL, PRIMARY KEY ("guildID", "channelID", "shortcutWord"))`,
        `CREATE TABLE IF NOT EXISTS command_permissions ("guildID" TEXT NOT NULL, "channelID" TEXT NOT NULL, "commandName" TEXT NOT NULL, PRIMARY KEY ("guildID", "channelID", "commandName"))`,
        `CREATE TABLE IF NOT EXISTS user_loans ("id" BIGSERIAL PRIMARY KEY, "userID" TEXT NOT NULL, "guildID" TEXT NOT NULL, "loanAmount" BIGINT DEFAULT 0, "remainingAmount" BIGINT DEFAULT 0, "dailyPayment" BIGINT DEFAULT 0, "lastPaymentDate" BIGINT DEFAULT 0, "missedPayments" BIGINT DEFAULT 0, UNIQUE("userID", "guildID"))`,
        `CREATE TABLE IF NOT EXISTS giveaway_weights ("guildID" TEXT NOT NULL, "roleID" TEXT NOT NULL, "weight" BIGINT NOT NULL, PRIMARY KEY ("guildID", "roleID"))`,
        `CREATE TABLE IF NOT EXISTS active_giveaways ("messageID" TEXT PRIMARY KEY, "guildID" TEXT NOT NULL, "channelID" TEXT NOT NULL, "prize" TEXT NOT NULL, "endsAt" BIGINT NOT NULL, "winnerCount" BIGINT NOT NULL, "xpReward" BIGINT DEFAULT 0, "moraReward" BIGINT DEFAULT 0, "isFinished" BIGINT DEFAULT 0)`,
        
        `CREATE TABLE IF NOT EXISTS giveaway_entries ("id" BIGSERIAL PRIMARY KEY, "giveawayID" TEXT NOT NULL, "userID" TEXT NOT NULL, "weight" BIGINT NOT NULL DEFAULT 1, UNIQUE("giveawayID", "userID"))`,
        
        `CREATE TABLE IF NOT EXISTS media_streaks ("id" TEXT PRIMARY KEY, "guildID" TEXT, "userID" TEXT, "streakCount" BIGINT DEFAULT 0, "lastMediaTimestamp" BIGINT DEFAULT 0, "hasGracePeriod" BIGINT DEFAULT 1, "hasItemShield" BIGINT DEFAULT 0, "hasReceivedFreeShield" BIGINT DEFAULT 1, "dmNotify" BIGINT DEFAULT 1, "highestStreak" BIGINT DEFAULT 0, "lastChannelID" TEXT)`,
        `CREATE TABLE IF NOT EXISTS media_streak_channels ("guildID" TEXT, "channelID" TEXT, "lastReminderMessageID" TEXT, "lastDailyMsgID" TEXT, PRIMARY KEY ("guildID", "channelID"))`,
        `CREATE TABLE IF NOT EXISTS level_roles ("guildID" TEXT NOT NULL, "level" BIGINT NOT NULL, "roleID" TEXT NOT NULL, PRIMARY KEY ("guildID", "level"))`,
        `CREATE TABLE IF NOT EXISTS custom_roles ("id" TEXT PRIMARY KEY, "guildID" TEXT NOT NULL, "userID" TEXT NOT NULL, "roleID" TEXT NOT NULL, UNIQUE("guildID", "userID"))`,
        `CREATE TABLE IF NOT EXISTS custom_role_permissions ("guildID" TEXT NOT NULL, "roleID" TEXT NOT NULL, PRIMARY KEY ("guildID", "roleID"))`,
        `CREATE TABLE IF NOT EXISTS role_menus_master ("message_id" TEXT PRIMARY KEY, "custom_id" TEXT UNIQUE NOT NULL, "is_locked" BOOLEAN NOT NULL DEFAULT false)`,
        `CREATE TABLE IF NOT EXISTS role_settings ("role_id" TEXT PRIMARY KEY, "anti_roles" TEXT, "is_removable" BOOLEAN NOT NULL DEFAULT true)`,
        `CREATE TABLE IF NOT EXISTS role_menu_items ("message_id" TEXT NOT NULL, "value" TEXT NOT NULL, "role_id" TEXT NOT NULL, "description" TEXT, "emoji" TEXT, PRIMARY KEY ("message_id", "value"))`,
        `CREATE TABLE IF NOT EXISTS bot_config ("key" TEXT PRIMARY KEY, "value" TEXT)`,
        `CREATE TABLE IF NOT EXISTS rainbow_roles ("roleID" TEXT PRIMARY KEY, "guildID" TEXT NOT NULL)`,
        
        `CREATE TABLE IF NOT EXISTS auto_responses ("id" BIGSERIAL PRIMARY KEY, "guildID" TEXT NOT NULL, "trigger" TEXT NOT NULL, "response" TEXT NOT NULL, "images" TEXT, "matchType" TEXT DEFAULT 'exact', "cooldown" BIGINT DEFAULT 0, "allowedChannels" TEXT, "ignoredChannels" TEXT, "createdBy" TEXT, "expiresAt" BIGINT, UNIQUE("guildID", "trigger"))`,
        `CREATE TABLE IF NOT EXISTS world_boss ("guildID" TEXT PRIMARY KEY, "currentHP" REAL, "maxHP" REAL, "name" TEXT, "image" TEXT, "active" BIGINT DEFAULT 0, "messageID" TEXT, "channelID" TEXT, "lastLog" TEXT DEFAULT '[]', "totalHits" BIGINT DEFAULT 0)`,
        `CREATE TABLE IF NOT EXISTS boss_cooldowns ("guildID" TEXT, "userID" TEXT, "lastHit" BIGINT, PRIMARY KEY ("guildID", "userID"))`,
        `CREATE TABLE IF NOT EXISTS user_coupons ("id" BIGSERIAL PRIMARY KEY, "guildID" TEXT, "userID" TEXT, "discountPercent" BIGINT, "isUsed" BIGINT DEFAULT 0)`,
        `CREATE TABLE IF NOT EXISTS boss_leaderboard ("guildID" TEXT, "userID" TEXT, "totalDamage" REAL DEFAULT 0, PRIMARY KEY("guildID", "userID"))`,
        `CREATE TABLE IF NOT EXISTS role_coupons_config ("guildID" TEXT, "roleID" TEXT, "discountPercent" BIGINT, PRIMARY KEY ("guildID", "roleID"))`,
        `CREATE TABLE IF NOT EXISTS user_role_coupon_usage ("guildID" TEXT, "userID" TEXT, "lastUsedTimestamp" BIGINT, PRIMARY KEY ("guildID", "userID"))`,
        `CREATE TABLE IF NOT EXISTS farm_last_payout ("id" TEXT PRIMARY KEY, "lastPayoutDate" BIGINT)`,
        `CREATE TABLE IF NOT EXISTS user_inventory ("id" BIGSERIAL PRIMARY KEY, "guildID" TEXT, "userID" TEXT, "itemID" TEXT, "quantity" BIGINT DEFAULT 0, UNIQUE("guildID", "userID", "itemID"))`,
        `CREATE TABLE IF NOT EXISTS mod_cases ("id" TEXT PRIMARY KEY, "guildID" TEXT, "caseID" BIGINT, "type" TEXT, "targetID" TEXT, "moderatorID" TEXT, "reason" TEXT, "timestamp" BIGINT)`,
        `CREATE TABLE IF NOT EXISTS xp_ignore ("guildID" TEXT, "id" TEXT, "type" TEXT, PRIMARY KEY ("guildID", "id"))`,
        `CREATE TABLE IF NOT EXISTS active_dungeons ("channelID" TEXT PRIMARY KEY, "guildID" TEXT, "hostID" TEXT, "data" TEXT)`,
        `CREATE TABLE IF NOT EXISTS dungeon_stats ("guildID" TEXT, "userID" TEXT, "tickets" BIGINT DEFAULT 0, "last_reset" TEXT DEFAULT '', "campfires" BIGINT DEFAULT 1, "last_campfire_reset" TEXT DEFAULT '', PRIMARY KEY ("guildID", "userID"))`,
        
        `CREATE TABLE IF NOT EXISTS user_lands ("userID" TEXT, "guildID" TEXT, "plotID" BIGINT, "status" TEXT, "seedID" TEXT, "plantTime" BIGINT, PRIMARY KEY ("userID", "guildID", "plotID"))`,
        
        `CREATE TABLE IF NOT EXISTS ai_channels ("channelID" TEXT PRIMARY KEY, "guildID" TEXT, "isNsfw" BIGINT DEFAULT 0)`,
        `CREATE TABLE IF NOT EXISTS ai_blacklist ("userID" TEXT PRIMARY KEY)`,
        `CREATE TABLE IF NOT EXISTS ai_role_limits ("guildID" TEXT, "roleID" TEXT, "limitCount" BIGINT, PRIMARY KEY("guildID", "roleID"))`,
        `CREATE TABLE IF NOT EXISTS ai_user_usage ("userID" TEXT PRIMARY KEY, "guildID" TEXT, "dailyUsage" BIGINT DEFAULT 0, "purchasedBalance" BIGINT DEFAULT 0, "lastResetDate" TEXT)`,
        `CREATE TABLE IF NOT EXISTS ai_restricted_categories ("guildID" TEXT, "categoryID" TEXT, PRIMARY KEY ("categoryID"))`,
        `CREATE TABLE IF NOT EXISTS ai_paid_channels ("channelID" TEXT, "guildID" TEXT, "mode" TEXT, "expiresAt" BIGINT, PRIMARY KEY ("channelID"))`,
        
        `CREATE TABLE IF NOT EXISTS knight_history ("id" TEXT PRIMARY KEY, "count" BIGINT, "lastDate" BIGINT)`,
        `CREATE TABLE IF NOT EXISTS achievement_tracking ("id" TEXT PRIMARY KEY, "count" BIGINT)`,
        `CREATE TABLE IF NOT EXISTS farm_daily_log ("id" BIGSERIAL PRIMARY KEY, "userID" TEXT, "guildID" TEXT, "actionType" TEXT, "itemName" TEXT, "count" BIGINT, "timestamp" BIGINT)`,
        `CREATE TABLE IF NOT EXISTS race_dungeon_buffs ("guildID" TEXT, "roleID" TEXT, "dungeonKey" TEXT, "statType" TEXT, "buffValue" REAL, PRIMARY KEY ("guildID", "roleID", "dungeonKey"))`,
        `CREATE TABLE IF NOT EXISTS ai_cooldowns ("userID" TEXT PRIMARY KEY, "lastMoraTime" BIGINT)`,
        
        `CREATE TABLE IF NOT EXISTS family_config ("guildID" TEXT PRIMARY KEY, "maleRole" TEXT, "femaleRole" TEXT, "divorceFee" BIGINT DEFAULT 5000, "adoptFee" BIGINT DEFAULT 2000)`,
        `CREATE TABLE IF NOT EXISTS marriages ("userID" TEXT, "partnerID" TEXT, "marriageDate" BIGINT, "guildID" TEXT, "dowry" BIGINT DEFAULT 0, PRIMARY KEY ("userID", "guildID"))`,
        `CREATE TABLE IF NOT EXISTS children ("parentID" TEXT, "childID" TEXT, "adoptDate" BIGINT, "guildID" TEXT)`,
        
        `CREATE TABLE IF NOT EXISTS active_auctions ("messageID" TEXT PRIMARY KEY, "channelID" TEXT, "hostID" TEXT, "item_name" TEXT, "current_bid" BIGINT, "highest_bidder" TEXT, "min_increment" BIGINT, "end_time" BIGINT, "image_url" TEXT, "buy_now_price" BIGINT DEFAULT 0, "start_price" BIGINT DEFAULT 0, "bid_count" BIGINT DEFAULT 0)`,
        
        `CREATE TABLE IF NOT EXISTS afk ("userID" TEXT, "guildID" TEXT, "reason" TEXT, "timestamp" BIGINT, "mentionsCount" BIGINT DEFAULT 0, "subscribers" TEXT DEFAULT '[]', "messages" TEXT DEFAULT '[]', PRIMARY KEY ("userID", "guildID"))`,
        
        `CREATE TABLE IF NOT EXISTS dungeon_saves ("hostID" TEXT PRIMARY KEY, "guildID" TEXT, "floor" BIGINT, "timestamp" BIGINT)`,
        `CREATE TABLE IF NOT EXISTS role_campfire_limits ("guildID" TEXT, "roleID" TEXT, "limitCount" BIGINT, PRIMARY KEY ("guildID", "roleID"))`,
        `CREATE TABLE IF NOT EXISTS user_reputation ("userID" TEXT, "guildID" TEXT, "rep_points" BIGINT DEFAULT 0, "last_rep_given" TEXT DEFAULT '0', "weekly_reps_given" BIGINT DEFAULT 0, "daily_reps_given" BIGINT DEFAULT 0, PRIMARY KEY ("userID", "guildID"))`,
        
        `CREATE TABLE IF NOT EXISTS kings_board_tracker ("id" TEXT PRIMARY KEY, "userID" TEXT, "guildID" TEXT, "date" TEXT, "casino_profit" BIGINT DEFAULT 0, "mora_earned" BIGINT DEFAULT 0, "messages" BIGINT DEFAULT 0, "mora_donated" BIGINT DEFAULT 0, "vc_minutes" BIGINT DEFAULT 0, "fish_caught" BIGINT DEFAULT 0, "pvp_wins" BIGINT DEFAULT 0, "mora_stolen" BIGINT DEFAULT 0, "dungeon_floor" BIGINT DEFAULT 0)`,
        
        `CREATE TABLE IF NOT EXISTS kings_daily_payout ("dateStr" TEXT PRIMARY KEY)`,
        `CREATE TABLE IF NOT EXISTS king_bonus_usage ("userID" TEXT, "date" TEXT, "type" TEXT, PRIMARY KEY ("userID", "date", "type"))`,

        // 🎂 جداول أعياد الميلاد المضافة حديثاً 🎂
        `CREATE TABLE IF NOT EXISTS user_birthdays ("userID" TEXT, "guildID" TEXT, "day" BIGINT, "month" BIGINT, "year" BIGINT, PRIMARY KEY ("userID", "guildID"))`,
        `CREATE TABLE IF NOT EXISTS birthday_settings ("guildID" TEXT PRIMARY KEY, "channelID" TEXT, "roleID" TEXT, "lastAnnouncedDate" TEXT)`,
        `CREATE TABLE IF NOT EXISTS active_birthdays ("userID" TEXT, "guildID" TEXT, "roleID" TEXT, "dateAdded" TEXT, PRIMARY KEY ("userID", "guildID"))`,
        // 🏪 جداول ماركت القافلة 🏪
        `CREATE TABLE IF NOT EXISTS caravan_market_listings ("id" BIGSERIAL PRIMARY KEY, "caravanId" BIGINT NOT NULL, "ownerID" TEXT NOT NULL, "guildID" TEXT NOT NULL, "itemID" TEXT NOT NULL, "itemName" TEXT NOT NULL, "itemEmoji" TEXT DEFAULT '📦', "quantity" BIGINT NOT NULL, "pricePerUnit" BIGINT NOT NULL, "quantitySold" BIGINT DEFAULT 0, "status" TEXT DEFAULT 'active', "threadId" TEXT DEFAULT NULL, "createdAt" BIGINT DEFAULT 0)`,
        `CREATE TABLE IF NOT EXISTS caravan_market_sessions ("id" BIGSERIAL PRIMARY KEY, "caravanId" BIGINT NOT NULL, "ownerID" TEXT NOT NULL, "guildID" TEXT NOT NULL, "destinationId" TEXT NOT NULL, "threadId" TEXT NOT NULL, "channelId" TEXT NOT NULL, "createdAt" BIGINT DEFAULT 0, "expiresAt" BIGINT DEFAULT 0, "status" TEXT DEFAULT 'open', "npcSpawnCount" BIGINT DEFAULT 0, "totalSales" BIGINT DEFAULT 0, "totalRevenue" BIGINT DEFAULT 0)`,
        `CREATE TABLE IF NOT EXISTS caravan_market_transactions ("id" BIGSERIAL PRIMARY KEY, "listingId" BIGINT NOT NULL, "buyerID" TEXT NOT NULL, "sellerID" TEXT NOT NULL, "guildID" TEXT NOT NULL, "itemID" TEXT NOT NULL, "quantity" BIGINT NOT NULL, "pricePerUnit" BIGINT NOT NULL, "totalPrice" BIGINT NOT NULL, "buyerType" TEXT DEFAULT 'player', "createdAt" BIGINT DEFAULT 0)`
    ];

    try {
        for (const query of tables) {
            await db.query(query).catch(e => {
            });
        }

        console.log("[Database] Running schema column integrity patches...");

        await ensureColumn(db, 'user_buffs', 'userID', 'TEXT');
        await ensureColumn(db, 'user_buffs', 'guildID', 'TEXT');
        await ensureColumn(db, 'user_buffs', 'buffPercent', 'BIGINT');
        await ensureColumn(db, 'user_buffs', 'expiresAt', 'BIGINT');
        await ensureColumn(db, 'user_buffs', 'buffType', 'TEXT');
        await ensureColumn(db, 'user_buffs', 'multiplier', 'REAL DEFAULT 0.0');

        await ensureColumn(db, 'giveaway_entries', 'weight', 'INTEGER DEFAULT 1');
        await ensureColumn(db, 'giveaway_entries', 'userID', 'TEXT');

        await ensureColumn(db, 'settings', 'roleVoice', 'TEXT');
        await ensureColumn(db, 'settings', 'roleThief', 'TEXT');
        await ensureColumn(db, 'settings', 'vipRoleID', 'TEXT');
        
        await ensureColumn(db, 'knight_history', 'lastDate', 'BIGINT DEFAULT 0');
        await ensureColumn(db, 'streaks', 'guildID', 'TEXT');
        await ensureColumn(db, 'user_reputation', 'daily_reps_given', 'BIGINT DEFAULT 0');
        await ensureColumn(db, 'user_reputation', 'weekly_reps_given', 'BIGINT DEFAULT 0');
        await ensureColumn(db, 'levels', 'last_dungeon', 'BIGINT DEFAULT 0');
        
        // 👑 بقيناها كطبقة حماية إضافية للبيانات القديمة
        await ensureColumn(db, 'levels', 'lastScratch', 'BIGINT DEFAULT 0');
        
        await ensureColumn(db, 'kings_board_tracker', 'dungeon_floor', 'BIGINT DEFAULT 0');
        await ensureColumn(db, 'kings_board_tracker', 'vc_minutes', 'BIGINT DEFAULT 0');
        await ensureColumn(db, 'kings_board_tracker', 'mora_stolen', 'BIGINT DEFAULT 0');

        await ensureColumn(db, 'user_weapons', 'weaponLevel', 'BIGINT DEFAULT 1');
        await ensureColumn(db, 'user_weapons', 'raceName', 'TEXT');
        await ensureColumn(db, 'user_skills', 'skillLevel', 'BIGINT DEFAULT 1');
        await ensureColumn(db, 'user_skills', 'skillID', 'TEXT');
        
        const insertItemPg = `INSERT INTO market_items ("id", "name", "description", "currentPrice") VALUES ($1, $2, $3, $4) ON CONFLICT ("id") DO NOTHING`;
        const insertItemLite = `INSERT OR IGNORE INTO market_items (id, name, description, currentPrice) VALUES ($1, $2, $3, $4)`;
        
        for (const item of defaultMarketItems) {
            try {
                await db.query(insertItemPg, [item.id, item.name, item.description, item.price]);
            } catch(e) {
                await db.query(insertItemLite, [item.id, item.name, item.description, item.price]).catch(()=>{});
            }
        }
        
        console.log("[Database] ✅ Schema integrity verified successfully!");
    } catch (e) {
        console.error("[Database] ❌ Critical Error in Setup:", e.message);
    }
}

async function ensureColumn(db, table, column, typeDef) {
    try {
        let hasColumn = false;

        try {
            const checkPg = await db.query(`SELECT column_name FROM information_schema.columns WHERE table_name=$1 AND column_name=$2`, [table, column]);
            if (checkPg && checkPg.rows && checkPg.rows.length > 0) hasColumn = true;
            
            const checkPgLower = await db.query(`SELECT column_name FROM information_schema.columns WHERE table_name=$1 AND column_name=$2`, [table, column.toLowerCase()]);
            if (checkPgLower && checkPgLower.rows && checkPgLower.rows.length > 0) hasColumn = true;
        } catch (pgErr) {}

        if (!hasColumn) {
            try {
                const checkLite = await db.query(`PRAGMA table_info("${table}")`);
                const cols = checkLite.rows ? checkLite.rows : (Array.isArray(checkLite) ? checkLite : []);
                if (cols.length > 0) {
                    if (cols.some(c => c.name === column || c.name.toLowerCase() === column.toLowerCase())) {
                        hasColumn = true;
                    }
                }
            } catch (liteErr) {}
        }

        if (!hasColumn) {
            console.log(`[Migration] Adding missing column '${column}' to table '${table}'...`);
            try {
                await db.query(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${typeDef}`);
            } catch(e) {
                await db.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${typeDef}`).catch(()=>{});
            }
        }
    } catch (e) {
        console.error(`[EnsureColumn Error] Failed to patch ${table}.${column}`);
    }
}

module.exports = { setupDatabase, ensureColumn };
