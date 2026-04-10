const { EmbedBuilder, Colors } = require('discord.js');
const path = require('path');
const questsConfig = require(path.join(process.cwd(), 'json', 'quests-config.json'));
const announcementTexts = require(path.join(process.cwd(), 'json', 'announcements-texts.js'));
const { generateSingleAchievementAlert } = require(path.join(process.cwd(), 'generators', 'achievement-generator.js'));

const ROWS_PER_PAGE_ACH = 5;

async function checkAchievements(client, member, levelData, totalStats) {
    const db = client.sql;
    if (!db) return;

    await db.query(`CREATE TABLE IF NOT EXISTS achievement_tracking ("id" TEXT PRIMARY KEY, "count" INTEGER)`);

    const guildID = member.guild.id;
    const userID = member.id;

    // 🔥 تصحيح استعلامات الداتابيز
    let streakData = null;
    try {
        const streakRes = await db.query(`SELECT * FROM streaks WHERE "guildID" = $1 AND "userID" = $2`, [guildID, userID]);
        streakData = streakRes.rows[0];
    } catch(e) {
        const streakRes = await db.query(`SELECT * FROM streaks WHERE guildid = $1 AND userid = $2`, [guildID, userID]).catch(()=>({rows:[]}));
        streakData = streakRes.rows[0];
    }
    
    let mediaStreakData = null;
    try {
        const mediaStreakRes = await db.query(`SELECT * FROM media_streaks WHERE "guildID" = $1 AND "userID" = $2`, [guildID, userID]);
        mediaStreakData = mediaStreakRes.rows[0];
    } catch(e) {
        const mediaStreakRes = await db.query(`SELECT * FROM media_streaks WHERE guildid = $1 AND userid = $2`, [guildID, userID]).catch(()=>({rows:[]}));
        mediaStreakData = mediaStreakRes.rows[0];
    }

    const currentStats = {
        level: levelData ? levelData.level : 1,
        mora: levelData ? levelData.mora : 0,
        messages: levelData ? levelData.messages : 0, 
        ...(totalStats || {}),
        streak: streakData ? (streakData.streakcount || streakData.streakCount) : 0,
        highestStreak: streakData ? (streakData.higheststreak || streakData.highestStreak) : 0,
        highestMediaStreak: mediaStreakData ? (mediaStreakData.higheststreak || mediaStreakData.highestStreak) : 0,
        has_caesar_role: member.roles.cache.has(questsConfig.special_roles?.caesar_role) ? 1 : 0,
        has_race_role: 0, 
        has_tree_role: member.roles.cache.has(questsConfig.special_roles?.tree_role) ? 1 : 0,
    };

    for (const achievement of questsConfig.achievements) {
        
        let targetValue = achievement.goal;
        let currentValue = currentStats[achievement.stat] || 0;

        if (achievement.stat === 'total_boosts') {
            const trackingId = `${userID}-${guildID}-${achievement.id}`;
            
            const trackerRes = await db.query(`SELECT count FROM achievement_tracking WHERE "id" = $1`, [trackingId]).catch(()=>({rows:[]}));
            let tracker = trackerRes.rows[0];
            let lastRewardedCount = tracker ? tracker.count : 0;

            if (currentValue > lastRewardedCount) {
                await grantAchievementReward(client, member, achievement, db, true);
                await db.query(`INSERT INTO achievement_tracking ("id", "count") VALUES ($1, $2) ON CONFLICT ("id") DO UPDATE SET "count" = EXCLUDED."count"`, [trackingId, currentValue]).catch(()=>{});
                try {
                    await db.query(`INSERT INTO user_achievements ("userID", "guildID", "achievementID", "timestamp") VALUES ($1, $2, $3, $4)`, [userID, guildID, achievement.id, Date.now()]);
                } catch(e) {
                    await db.query(`INSERT INTO user_achievements (userid, guildid, achievementid, timestamp) VALUES ($1, $2, $3, $4)`, [userID, guildID, achievement.id, Date.now()]).catch(()=>{});
                }
            }
            continue;
        }

        let hasAch = null;
        try {
            const hasAchRes = await db.query(`SELECT 1 FROM user_achievements WHERE "userID" = $1 AND "guildID" = $2 AND "achievementID" = $3`, [userID, guildID, achievement.id]);
            hasAch = hasAchRes.rows[0];
        } catch (e) {
            const hasAchRes = await db.query(`SELECT 1 FROM user_achievements WHERE userid = $1 AND guildid = $2 AND achievementid = $3`, [userID, guildID, achievement.id]).catch(()=>({rows:[]}));
            hasAch = hasAchRes.rows[0];
        }
        
        if (hasAch) continue; 

        if (currentValue >= targetValue) {
            await grantAchievementReward(client, member, achievement, db, false);
            try {
                await db.query(`INSERT INTO user_achievements ("userID", "guildID", "achievementID", "timestamp") VALUES ($1, $2, $3, $4)`, [userID, guildID, achievement.id, Date.now()]);
            } catch(e) {
                await db.query(`INSERT INTO user_achievements (userid, guildid, achievementid, timestamp) VALUES ($1, $2, $3, $4)`, [userID, guildID, achievement.id, Date.now()]).catch(()=>{});
            }
        }
    }
}

// 🔥 الدالة الرئيسية المعدلة لمنح الجوائز وإرسال الصورة والنص الأسطوري 🔥
async function grantAchievementReward(client, member, achievement, db, isRepeatable = false) {
    let xpReward = achievement.reward.xp || 0; 
    let moraReward = achievement.reward.mora || 0;
    let repReward = achievement.repReward ? Number(achievement.repReward) : 0;
    let roleReward = achievement.reward.role || null;

    // تحديث الخبرة والمورا
    let userData = await client.getLevel(member.id, member.guild.id);
    if (userData) {
        userData.xp += xpReward;
        userData.totalxp = (userData.totalxp || userData.totalXP || 0) + xpReward;
        userData.totalXP = userData.totalxp;
        userData.mora += moraReward;
        await client.setLevel(userData);
    }

    // تحديث نقاط السمعة (Rep) إذا وُجدت
    if (repReward > 0) {
        try {
            const repRes = await db.query(`SELECT "rep_points" FROM user_reputation WHERE "userID" = $1 AND "guildID" = $2`, [member.id, member.guild.id]);
            if (repRes.rows.length > 0) {
                await db.query(`UPDATE user_reputation SET "rep_points" = "rep_points" + $1 WHERE "userID" = $2 AND "guildID" = $3`, [repReward, member.id, member.guild.id]);
            } else {
                await db.query(`INSERT INTO user_reputation ("userID", "guildID", "rep_points") VALUES ($1, $2, $3)`, [member.id, member.guild.id, repReward]);
            }
        } catch (e) {
            console.error("Error updating rep reward:", e);
        }
    }

    if (roleReward) {
        try { await member.roles.add(roleReward); } catch (e) {}
    }

    const settingsRes = await db.query(`SELECT "achievementChannelID" FROM settings WHERE "guild" = $1`, [member.guild.id]).catch(()=>({rows:[]}));
    let settings = settingsRes.rows[0];
    if(!settings) {
        const fallbackRes = await db.query(`SELECT achievementchannelid FROM settings WHERE guild = $1`, [member.guild.id]).catch(()=>({rows:[]}));
        settings = fallbackRes.rows[0];
    }
    
    if (settings && (settings.achievementchannelid || settings.achievementChannelID)) {
        const channelId = settings.achievementchannelid || settings.achievementChannelID;
        const channel = member.guild.channels.cache.get(channelId);
        if (channel) {
            
            // 1. توليد نص الجوائز
            const EMOJI_MORA = '<:mora:1435647151349698621>';
            const EMOJI_REP_GOLD = '<:goldgem:979098126591868928>'; 
            
            let rewardText = `- المكـافـأة : ${moraReward.toLocaleString()} ${EMOJI_MORA}  |  ${xpReward.toLocaleString()} XP`;
            if (repReward > 0) rewardText += `  |  ${repReward.toLocaleString()} Rep ${EMOJI_REP_GOLD}`;
            if (roleReward) rewardText += `\n- رتبة جديدة: <@&${roleReward}>`;
            if (isRepeatable) rewardText += `\n🔄 **(مكافأة متكررة: تم تعزيز السيرفر مجدداً!)**`;

            // 2. سحب النص من الملف الأسطوري
            const userIdentifier = `<@${member.id}>`;
            const messageContent = announcementTexts.getQuestMessage('achievement', userIdentifier, achievement.name, rewardText, "", client);

            // 3. توليد الصورة الفضائية
            const attachment = await generateSingleAchievementAlert(member, achievement);

            // 4. إرسال الصورة والنص
            await channel.send({ content: messageContent, files: [attachment] }).catch(err => console.error("Failed to send achievement alert", err));
        }
    }
}

async function getAchievementPageData(db, member, levelData, totalStats, completedAchievements, page = 1) {
    await db.query(`CREATE TABLE IF NOT EXISTS achievement_tracking ("id" TEXT PRIMARY KEY, "count" INTEGER)`);

    const achievements = questsConfig.achievements;
     
    let streakData = null;
    try {
        const streakRes = await db.query(`SELECT * FROM streaks WHERE "guildID" = $1 AND "userID" = $2`, [member.guild.id, member.id]);
        streakData = streakRes.rows[0];
    } catch(e) {
        const streakRes = await db.query(`SELECT * FROM streaks WHERE guildid = $1 AND userid = $2`, [member.guild.id, member.id]).catch(()=>({rows:[]}));
        streakData = streakRes.rows[0];
    }
    
    let mediaStreakData = null;
    try {
        const mediaStreakRes = await db.query(`SELECT * FROM media_streaks WHERE "guildID" = $1 AND "userID" = $2`, [member.guild.id, member.id]);
        mediaStreakData = mediaStreakRes.rows[0];
    } catch(e) {
        const mediaStreakRes = await db.query(`SELECT * FROM media_streaks WHERE guildid = $1 AND userid = $2`, [member.guild.id, member.id]).catch(()=>({rows:[]}));
        mediaStreakData = mediaStreakRes.rows[0];
    }

    const trackingRes = await db.query(`SELECT "id", "count" FROM achievement_tracking WHERE "id" LIKE $1`, [`${member.id}-${member.guild.id}-%`]).catch(()=>({rows:[]}));
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
