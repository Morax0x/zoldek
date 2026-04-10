const { EmbedBuilder, Colors } = require('discord.js');
const path = require('path');
const questsConfig = require(path.join(process.cwd(), 'json', 'quests-config.json'));

let addXPAndCheckLevel;
try {
    ({ addXPAndCheckLevel } = require('../handlers/handler-utils.js'));
} catch (e) {
    try {
        ({ addXPAndCheckLevel } = require('./handler-utils.js'));
    } catch (err) {}
}

const ROWS_PER_PAGE_ACH = 5;

// 🔥 أداة استعلام آمنة لتجنب كراش قاعدة البيانات بسبب اختلاف الحروف (Capital/Small) 🔥
const safeQuery = async (db, qPg, params) => {
    let res;
    try { res = await db.query(qPg, params); } 
    catch(e) { res = { rows: [] }; }

    const rows1 = Array.isArray(res) ? res : (res?.rows || []);
    if (rows1.length > 0) return { rows: rows1 };

    let fallbackQuery = qPg.toLowerCase();
    if (fallbackQuery !== qPg.toLowerCase() || qPg.includes('"')) {
        fallbackQuery = qPg.replace(/"/g, '').toLowerCase();
        try { 
            let res2 = await db.query(fallbackQuery, params); 
            const rows2 = Array.isArray(res2) ? res2 : (res2?.rows || []);
            return { rows: rows2 };
        } catch(e2) { }
    }
    return { rows: [] };
};

async function checkAchievements(client, member, levelData, totalStats) {
    const db = client.sql;
    if (!db || !member || !member.guild) return;

    await db.query(`CREATE TABLE IF NOT EXISTS achievement_tracking ("id" TEXT PRIMARY KEY, "count" INTEGER)`).catch(()=>{});

    const guildID = member.guild.id;
    const userID = member.id;

    const streakRes = await safeQuery(db, `SELECT * FROM streaks WHERE "guildID" = $1 AND "userID" = $2`, [guildID, userID]);
    let streakData = streakRes.rows[0];
    
    const mediaStreakRes = await safeQuery(db, `SELECT * FROM media_streaks WHERE "guildID" = $1 AND "userID" = $2`, [guildID, userID]);
    let mediaStreakData = mediaStreakRes.rows[0];

    const currentStats = {
        level: levelData ? (Number(levelData.level) || 1) : 1,
        mora: levelData ? (Number(levelData.mora) || 0) : 0,
        messages: levelData ? (Number(levelData.messages) || 0) : 0, 
        ...(totalStats || {}),
        streak: streakData ? (Number(streakData.streakCount || streakData.streakcount) || 0) : 0,
        highestStreak: streakData ? (Number(streakData.highestStreak || streakData.higheststreak) || 0) : 0,
        highestMediaStreak: mediaStreakData ? (Number(mediaStreakData.highestStreak || mediaStreakData.higheststreak) || 0) : 0,
        has_caesar_role: member.roles.cache.has(questsConfig.special_roles?.caesar_role) ? 1 : 0,
        has_race_role: 0, 
        has_tree_role: member.roles.cache.has(questsConfig.special_roles?.tree_role) ? 1 : 0,
    };

    for (const achievement of questsConfig.achievements) {
        let targetValue = achievement.goal;
        let currentValue = Number(currentStats[achievement.stat]) || 0;

        if (achievement.stat === 'total_boosts') {
            const trackingId = `${userID}-${guildID}-${achievement.id}`;
            const trackerRes = await safeQuery(db, `SELECT count FROM achievement_tracking WHERE "id" = $1`, [trackingId]);
            let tracker = trackerRes.rows[0];
            let lastRewardedCount = tracker ? (Number(tracker.count) || 0) : 0;

            if (currentValue > lastRewardedCount) {
                // تسليم الجائزة التلقائي
                await grantAchievementReward(client, member, achievement, db, true);
                
                try { await db.query(`INSERT INTO achievement_tracking ("id", "count") VALUES ($1, $2) ON CONFLICT ("id") DO UPDATE SET "count" = EXCLUDED."count"`, [trackingId, currentValue]); } catch(e){}
                try { await db.query(`INSERT INTO user_achievements ("userID", "guildID", "achievementID", "timestamp") VALUES ($1, $2, $3, $4)`, [userID, guildID, achievement.id, Date.now()]); } catch(e){}
            }
            continue;
        }

        const hasAchRes = await safeQuery(db, `SELECT 1 FROM user_achievements WHERE "userID" = $1 AND "guildID" = $2 AND "achievementID" = $3`, [userID, guildID, achievement.id]);
        if (hasAchRes.rows.length > 0) continue; // اللاعب استلمها مسبقاً

        if (currentValue >= targetValue) {
            // 🔥 تسليم الجائزة التلقائي فوراً 🔥
            await grantAchievementReward(client, member, achievement, db, false);
            try { await db.query(`INSERT INTO user_achievements ("userID", "guildID", "achievementID", "timestamp") VALUES ($1, $2, $3, $4)`, [userID, guildID, achievement.id, Date.now()]); } catch(e){}
        }
    }
}

async function grantAchievementReward(client, member, achievement, db, isRepeatable = false) {
    let xpReward = Number(achievement.reward?.xp) || 0; 
    let moraReward = Number(achievement.reward?.mora) || 0;
    let roleReward = achievement.reward?.role || null;
    let repReward = Number(achievement.repReward) || 0;

    // 1. تسليم المورا والإكس بي بأمان باستخدام الدالة المركزية
    if (addXPAndCheckLevel && (xpReward > 0 || moraReward > 0)) {
        await addXPAndCheckLevel(client, member, db, xpReward, moraReward, false);
    }

    // 2. تسليم السمعة (Reputation)
    if (repReward > 0) {
        try {
            await db.query(`
                INSERT INTO user_reputation ("userID", "guildID", "rep_points") 
                VALUES ($1, $2, $3) 
                ON CONFLICT("userID", "guildID") DO UPDATE SET "rep_points" = COALESCE(user_reputation."rep_points", 0) + $4
            `, [member.id, member.guild.id, repReward, repReward]);
        } catch (e) {
            await db.query(`
                INSERT INTO user_reputation (userid, guildid, rep_points) 
                VALUES ($1, $2, $3) 
                ON CONFLICT(userid, guildid) DO UPDATE SET rep_points = COALESCE(user_reputation.rep_points, 0) + $4
            `, [member.id, member.guild.id, repReward, repReward]).catch(()=>{});
        }
    }

    // 3. تسليم الرتبة
    if (roleReward) {
        try { await member.roles.add(roleReward); } catch (e) {}
    }

    // 4. إرسال رسالة الإعلان في قناة الإنجازات مع دعم المنشن الذكي
    const settingsRes = await safeQuery(db, `SELECT "achievementChannelID" FROM settings WHERE "guild" = $1`, [member.guild.id]);
    let settings = settingsRes.rows[0];
    
    if (settings && (settings.achievementchannelid || settings.achievementChannelID)) {
        const channelId = settings.achievementchannelid || settings.achievementChannelID;
        const channel = member.guild.channels.cache.get(channelId);
        
        if (channel) {
            // فحص إعدادات الإشعارات الخاصة باللاعب
            let notifSettingsRes = await db.query(`SELECT * FROM quest_notifications WHERE "id" = $1`, [`${member.id}-${member.guild.id}`]).catch(()=>({rows:[]}));
            let notifSettings = notifSettingsRes.rows[0];
            const aNotif = notifSettings ? Number(notifSettings.achievementsNotif ?? notifSettings.achievementsnotif ?? 1) : 1;

            // 🔥 هنا يتم التحديد: إذا مفعل (1) نضع منشن، وإذا معطل (0) نضع الاسم العادي 🔥
            const userIdentifier = aNotif !== 0 ? `<@${member.id}>` : `**${member.displayName}**`;

            const EMOJI_XP = '<:xp:1435647161730469958>'; 
            const EMOJI_MORA = '<:mora:1435647151349698621>';

            let desc = `**الإنجـاز:** ${achievement.name}\n` +
                       `**المتطلب:** ${achievement.description}\n` +
                       `────────────────────\n` +
                       `🎁 **الـجـوائـز التلقائية:**\n`;

            if (xpReward > 0) desc += `• ${xpReward} ${EMOJI_XP}\n`;
            if (moraReward > 0) desc += `• ${moraReward.toLocaleString()} ${EMOJI_MORA}\n`;
            if (repReward > 0) desc += `• +${repReward} 🌟 نقطة سمعة\n`;
            if (roleReward) desc += `• رتبة: <@&${roleReward}>\n`;

            if (isRepeatable) {
                desc += `\n🔄 **(مكافأة متكررة: تم تعزيز السيرفر مجدداً!)**`;
            }

            const embed = new EmbedBuilder()
                .setTitle(`🏆 إنجـاز جـديـد!`)
                .setAuthor({ name: member.displayName, iconURL: member.user.displayAvatarURL() })
                .setDescription(desc)
                .setColor(Colors.Gold)
                .setThumbnail("https://i.postimg.cc/k49M41bX/trophy.png")
                .setTimestamp();

            await channel.send({ content: userIdentifier, embeds: [embed], allowedMentions: { users: aNotif !== 0 ? [member.id] : [] } }).catch(()=>{});
        }
    }
}

async function getAchievementPageData(db, member, levelData, totalStats, completedAchievements, page = 1) {
    await db.query(`CREATE TABLE IF NOT EXISTS achievement_tracking ("id" TEXT PRIMARY KEY, "count" INTEGER)`).catch(()=>{});

    const achievements = questsConfig.achievements;
     
    const streakRes = await safeQuery(db, `SELECT * FROM streaks WHERE "guildID" = $1 AND "userID" = $2`, [member.guild.id, member.id]);
    let streakData = streakRes.rows[0];
    
    const mediaStreakRes = await safeQuery(db, `SELECT * FROM media_streaks WHERE "guildID" = $1 AND "userID" = $2`, [member.guild.id, member.id]);
    let mediaStreakData = mediaStreakRes.rows[0];

    const trackingRes = await safeQuery(db, `SELECT "id", "count" FROM achievement_tracking WHERE "id" LIKE $1`, [`${member.id}-${member.guild.id}-%`]);
    const trackingData = trackingRes.rows;

    const perPage = ROWS_PER_PAGE_ACH;
    const totalPages = Math.ceil(achievements.length / perPage);
    page = Math.max(1, Math.min(page, totalPages));

    const start = (page - 1) * perPage;
    const end = start + perPage;
    const achievementsToShow = achievements.slice(start, end);

    const achievementsData = achievementsToShow.map(ach => {
        const isDone = completedAchievements.some(c => (c.achievementid || c.achievementID) === ach.id);
        let currentProgress = 0;

        if (ach.stat === 'total_boosts') {
            if (totalStats && totalStats.total_boosts) {
                currentProgress = totalStats.total_boosts;
            }
        } 
        else if (isDone) {
            currentProgress = ach.goal;
        } 
        else {
            if (levelData && levelData.hasOwnProperty(ach.stat)) {
                currentProgress = levelData[ach.stat];
            } else if (totalStats && totalStats.hasOwnProperty(ach.stat)) {
                currentProgress = totalStats[ach.stat];
            } else if (ach.stat === 'highestStreak' && streakData) {
                currentProgress = streakData.higheststreak || streakData.highestStreak || 0;
            } else if (ach.stat === 'highestMediaStreak' && mediaStreakData) {
                currentProgress = mediaStreakData.higheststreak || mediaStreakData.highestStreak || 0;
            } else if (streakData && streakData.hasOwnProperty(ach.stat)) {
                currentProgress = streakData[ach.stat];
            } else if (ach.stat === 'has_caesar_role' || ach.stat === 'has_race_role' || ach.stat === 'has_tree_role') {
                currentProgress = 0; 
            }
            else if (ach.stat === 'total_topgg_votes') {
                currentProgress = totalStats.total_topgg_votes || 0;
            }
        }

        const displayProgress = ach.stat === 'total_boosts' ? currentProgress : Math.min(currentProgress || 0, ach.goal);

        return {
            achievement: ach,
            progress: displayProgress,
            isDone: isDone
        };
    });

    return { achievementsData, totalPages };
}

module.exports = {
    checkAchievements,
    getAchievementPageData
};
