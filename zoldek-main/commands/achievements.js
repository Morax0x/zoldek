const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, Colors, AttachmentBuilder } = require("discord.js");
const questsConfig = require('../json/quests-config.json');
const { getAchievementPageData } = require('../achievements-utils.js');
const announcementsTexts = require('../json/announcements-texts.js'); 

const EMOJI_MORA = '<:mora:1435647151349698621>';
const EMOJI_STAR = '⭐';
const ROWS_PER_PAGE_ACH = 5; 

function getTodayDateString() {
    return new Date().toISOString().split('T')[0];
}

function getWeekStartDateString() {
    const now = new Date();
    const dayOfWeek = now.getUTCDay();
    const diff = now.getUTCDate() - (dayOfWeek + 2) % 7;
    const friday = new Date(now.setUTCDate(diff));
    friday.setUTCHours(0, 0, 0, 0);
    return friday.toISOString().split('T')[0];
}

function getTimeUntilNextDailyReset() {
    const now = new Date();
    const resetTime = new Date(now.getTime());
    resetTime.setUTCHours(21, 0, 0, 0); 
    if (now.getTime() > resetTime.getTime()) {
        resetTime.setUTCDate(resetTime.getUTCDate() + 1);
    }
    const diff = resetTime.getTime() - now.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours} س ${minutes} د`;
}

function getTimeUntilNextWeeklyReset() {
    const now = new Date();
    const resetTime = new Date(now.getTime());
    const currentDay = now.getUTCDay(); 
    let daysUntilFriday = (5 - currentDay + 7) % 7;
    resetTime.setUTCHours(21, 0, 0, 0);
    if (daysUntilFriday === 0 && now.getUTCHours() >= 21) {
        daysUntilFriday = 7;
    }
    resetTime.setUTCDate(now.getUTCDate() + daysUntilFriday);
    const diff = resetTime.getTime() - now.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    return `${days} ي ${hours} س`;
}

function buildProgressBar(progress, goal, length = 10) {
    const percent = Math.max(0, Math.min(1, progress / goal));
    const filledBlocks = Math.round(percent * length);
    const emptyBlocks = length - filledBlocks;
    return `[${'■'.repeat(filledBlocks)}${'□'.repeat(emptyBlocks)}] (${Math.floor(percent * 100)}%)`;
}

async function buildDailyEmbed(sql, member, dailyStats, page = 1) {
    const { generateDailyQuestsImage } = require('../generators/daily-quest-generator.js'); 

    let completedRes;
    try {
        completedRes = await sql.query(`SELECT * FROM user_quest_claims WHERE "userID" = $1 AND "guildID" = $2 AND "dateStr" = $3`, [member.id, member.guild.id, getTodayDateString()]);
    } catch(e) {
        completedRes = await sql.query(`SELECT * FROM user_quest_claims WHERE userid = $1 AND guildid = $2 AND datestr = $3`, [member.id, member.guild.id, getTodayDateString()]).catch(()=>({rows:[]}));
    }
    const completed = completedRes.rows;

    let allCompleted = true;

    const questsData = questsConfig.daily.map(quest => {
        const progress = dailyStats[quest.stat] || 0;
        const isDone = completed.some(c => (c.questID || c.questid) === quest.id);
        
        if (!isDone) allCompleted = false;

        return {
            quest: quest,
            progress: isDone ? quest.goal : progress
        };
    });

    const dateStr = getTodayDateString();
    const badgeClaimId = `${member.id}-${member.guild.id}-daily_badge-${dateStr}`;
    let badgeClaimedRes;
    try {
        badgeClaimedRes = await sql.query(`SELECT 1 FROM user_quest_claims WHERE "claimID" = $1`, [badgeClaimId]);
    } catch(e) {
        badgeClaimedRes = await sql.query(`SELECT 1 FROM user_quest_claims WHERE claimid = $1`, [badgeClaimId]).catch(()=>({rows:[]}));
    }
    const badgeClaimed = badgeClaimedRes.rows[0];

    if (allCompleted && questsData.length > 0 && !badgeClaimed) {
        try {
            await sql.query(`INSERT INTO user_quest_claims ("claimID", "userID", "guildID", "questID", "dateStr") VALUES ($1, $2, $3, $4, $5)`, [badgeClaimId, member.id, member.guild.id, 'daily_badge', dateStr]);
        } catch(e) {
            await sql.query(`INSERT INTO user_quest_claims (claimid, userid, guildid, questid, datestr) VALUES ($1, $2, $3, $4, $5)`, [badgeClaimId, member.id, member.guild.id, 'daily_badge', dateStr]).catch(()=>{});
        }
        
        let settingsRes;
        try {
            settingsRes = await sql.query(`SELECT "questChannelID", "lastQuestPanelChannelID" FROM settings WHERE "guild" = $1`, [member.guild.id]);
        } catch(e) {
            settingsRes = await sql.query(`SELECT questchannelid as "questChannelID", lastquestpanelchannelid as "lastQuestPanelChannelID" FROM settings WHERE guild = $1`, [member.guild.id]).catch(()=>({rows:[]}));
        }
        const settings = settingsRes.rows[0];
        
        if (settings && (settings.questChannelID || settings.questchannelid)) {
            const questChannelId = settings.questChannelID || settings.questchannelid;
            const channel = member.guild.channels.cache.get(questChannelId);
            if (channel) {
                const lastQuestPanelId = settings.lastQuestPanelChannelID || settings.lastquestpanelchannelid;
                const panelLink = lastQuestPanelId ? `\n\n✶ قـاعـة الانجـازات والمـهام والاشعـارات:\n<#${lastQuestPanelId}>` : "";
                const badgeMsg = announcementsTexts.getBadgeMessage('daily', `<@${member.id}>`, member.client, panelLink);
                channel.send({ content: badgeMsg }).catch(()=>{});
            }
        }
    }

    const { attachment, totalPages } = await generateDailyQuestsImage(member, questsData, page);

    // 🔥 إرسال الصورة بشكل مباشر بدون إيمبد 🔥
    return { embeds: [], files: [attachment], totalPages: totalPages };
}

async function buildWeeklyEmbed(sql, member, weeklyStats, page = 1) {
    const { generateWeeklyQuestsImage } = require('../generators/weekly-quest-generator.js');

    const weekStartDateStr = getWeekStartDateString();
    let completedRes;
    try {
        completedRes = await sql.query(`SELECT * FROM user_quest_claims WHERE "userID" = $1 AND "guildID" = $2 AND "dateStr" = $3`, [member.id, member.guild.id, weekStartDateStr]);
    } catch(e) {
        completedRes = await sql.query(`SELECT * FROM user_quest_claims WHERE userid = $1 AND guildid = $2 AND datestr = $3`, [member.id, member.guild.id, weekStartDateStr]).catch(()=>({rows:[]}));
    }
    const completed = completedRes.rows;

    let allCompleted = true;

    const questsData = questsConfig.weekly.map(quest => {
        const progress = weeklyStats[quest.stat] || 0;
        const isDone = completed.some(c => (c.questID || c.questid) === quest.id);
        
        if (!isDone) allCompleted = false;

        return {
            quest: quest,
            progress: isDone ? quest.goal : progress
        };
    });

    const badgeClaimId = `${member.id}-${member.guild.id}-weekly_badge-${weekStartDateStr}`;
    let badgeClaimedRes;
    try {
        badgeClaimedRes = await sql.query(`SELECT 1 FROM user_quest_claims WHERE "claimID" = $1`, [badgeClaimId]);
    } catch(e) {
        badgeClaimedRes = await sql.query(`SELECT 1 FROM user_quest_claims WHERE claimid = $1`, [badgeClaimId]).catch(()=>({rows:[]}));
    }
    const badgeClaimed = badgeClaimedRes.rows[0];

    if (allCompleted && questsData.length > 0 && !badgeClaimed) {
        try {
            await sql.query(`INSERT INTO user_quest_claims ("claimID", "userID", "guildID", "questID", "dateStr") VALUES ($1, $2, $3, $4, $5)`, [badgeClaimId, member.id, member.guild.id, 'weekly_badge', weekStartDateStr]);
        } catch(e) {
            await sql.query(`INSERT INTO user_quest_claims (claimid, userid, guildid, questid, datestr) VALUES ($1, $2, $3, $4, $5)`, [badgeClaimId, member.id, member.guild.id, 'weekly_badge', weekStartDateStr]).catch(()=>{});
        }
        
        let settingsRes;
        try {
            settingsRes = await sql.query(`SELECT "questChannelID", "lastQuestPanelChannelID" FROM settings WHERE "guild" = $1`, [member.guild.id]);
        } catch(e) {
            settingsRes = await sql.query(`SELECT questchannelid as "questChannelID", lastquestpanelchannelid as "lastQuestPanelChannelID" FROM settings WHERE guild = $1`, [member.guild.id]).catch(()=>({rows:[]}));
        }
        const settings = settingsRes.rows[0];
        
        if (settings && (settings.questChannelID || settings.questchannelid)) {
            const questChannelId = settings.questChannelID || settings.questchannelid;
            const channel = member.guild.channels.cache.get(questChannelId);
            if (channel) {
                const lastQuestPanelId = settings.lastQuestPanelChannelID || settings.lastquestpanelchannelid;
                const panelLink = lastQuestPanelId ? `\n\n✶ قـاعـة الانجـازات والمـهام والاشعـارات:\n<#${lastQuestPanelId}>` : "";
                const badgeMsg = announcementsTexts.getBadgeMessage('weekly', `<@${member.id}>`, member.client, panelLink);
                channel.send({ content: badgeMsg }).catch(()=>{});
            }
        }
    }

    const { attachment, totalPages } = await generateWeeklyQuestsImage(member, questsData, page);

    // 🔥 إرسال الصورة بشكل مباشر بدون إيمبد 🔥
    return { embeds: [], files: [attachment], totalPages: totalPages };
}

async function buildAchievementsEmbed(sql, member, levelData, totalStats, completedAchievements, page = 1) {
    const { generateAchievementPageImage } = require('../generators/achievement-generator.js');

    const { achievementsData, totalPages } = await getAchievementPageData(sql, member, levelData, totalStats, completedAchievements, page);

    const stats = {
        completed: completedAchievements.length,
        total: questsConfig.achievements.length,
        page: page,
        totalPages: totalPages
    };

    const attachment = await generateAchievementPageImage(member, achievementsData, stats);

    // 🔥 إرسال الصورة بشكل مباشر بدون إيمبد 🔥
    return { embeds: [], files: [attachment], totalPages: totalPages };
}

module.exports = {
    name: 'achievements',
    aliases: ['مهام', 'quests'],
    description: 'عرض قائمة المهام اليومية والأسبوعية والإنجازات.',

    async execute(message, args) {
        const member = message.member;
        const userId = member.id;
        const guildId = member.guild.id;

        const sql = message.client.sql;

        const dateStr = getTodayDateString();
        const weekStartDateStr = getWeekStartDateString();
        const totalStatsId = `${userId}-${guildId}`;

        const levelData = message.client.getLevel?.get(userId, guildId) || { ...message.client.defaultData, user: userId, guild: guildId };
        const dailyStats = message.client.getDailyStats?.get(`${userId}-${guildId}-${dateStr}`) || {};
        const weeklyStats = message.client.getWeeklyStats?.get(`${userId}-${guildId}-${weekStartDateStr}`) || {};
        const totalStats = message.client.getTotalStats?.get(totalStatsId) || {};
        
        let completedAchievementsRes;
        try {
            completedAchievementsRes = await sql.query(`SELECT * FROM user_achievements WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId]);
        } catch(e) {
            completedAchievementsRes = await sql.query(`SELECT * FROM user_achievements WHERE userid = $1 AND guildid = $2`, [userId, guildId]).catch(()=>({rows:[]}));
        }
        const completedAchievements = completedAchievementsRes.rows;

        let currentPage = 1;
        let currentView = 'daily';
        let currentTotalPages = 1;

        const idPrefix = `quests_${message.id}`;

        const generateDisplay = async (view, page) => {
            if (view === 'daily') {
                return await buildDailyEmbed(sql, member, dailyStats, page);
            }
            if (view === 'weekly') {
                return await buildWeeklyEmbed(sql, member, weeklyStats, page);
            }
            if (view === 'achievements') {
                return await buildAchievementsEmbed(sql, member, levelData, totalStats, completedAchievements, page);
            }
        };

        const generateButtons = (view, page, totalPages) => {
            const dailyButton = new ButtonBuilder()
                .setCustomId(idPrefix + '_daily')
                .setLabel('المهام اليومية')
                .setStyle(view === 'daily' ? ButtonStyle.Success : ButtonStyle.Secondary)
                .setEmoji('📋');

            const weeklyButton = new ButtonBuilder()
                .setCustomId(idPrefix + '_weekly')
                .setLabel('المهام الأسبوعية')
                .setStyle(view === 'weekly' ? ButtonStyle.Success : ButtonStyle.Secondary)
                .setEmoji('📅');

            const achButton = new ButtonBuilder()
                .setCustomId(idPrefix + '_achievements')
                .setLabel('إنجازاتي')
                .setStyle(view === 'achievements' ? ButtonStyle.Success : ButtonStyle.Secondary)
                .setEmoji('🏆');

            const prevButton = new ButtonBuilder()
                .setCustomId(idPrefix + '_prev')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('<:left:1439164494759723029>')
                .setDisabled(page === 1);

            const nextButton = new ButtonBuilder()
                .setCustomId(idPrefix + '_next')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('<:right:1439164491072929915>')
                .setDisabled(page === totalPages);

            if (totalPages > 1) {
                return new ActionRowBuilder().addComponents(dailyButton, weeklyButton, achButton, prevButton, nextButton);
            }
            return new ActionRowBuilder().addComponents(dailyButton, weeklyButton, achButton);
        };

        const initialDisplay = await generateDisplay(currentView, currentPage);
        currentTotalPages = initialDisplay.totalPages; 

        const components = generateButtons(currentView, currentPage, currentTotalPages); 
        const msg = await message.reply({ embeds: initialDisplay.embeds, files: initialDisplay.files, components: [components] });

        const filter = (i) => i.customId.startsWith(idPrefix) && i.user.id === message.author.id;
        const collector = msg.createMessageComponentCollector({ filter, time: 120000 });

        collector.on('collect', async i => {
            // 🔥 هنا يتم تفادي مهلة الـ 3 ثواني باحترافية عالية 🔥
            await i.deferUpdate().catch(()=>{});
            
            let newDisplay;
            let newComponents;

            if (i.customId.endsWith('_daily')) { currentView = 'daily'; currentPage = 1; }
            else if (i.customId.endsWith('_weekly')) { currentView = 'weekly'; currentPage = 1; }
            else if (i.customId.endsWith('_achievements')) { currentView = 'achievements'; currentPage = 1; }
            else if (i.customId.endsWith('_prev')) { currentPage--; }
            else if (i.customId.endsWith('_next')) { currentPage++; }

            newDisplay = await generateDisplay(currentView, currentPage);
            currentTotalPages = newDisplay.totalPages; 
            newComponents = generateButtons(currentView, currentPage, currentTotalPages); 

            await i.editReply({ embeds: newDisplay.embeds, files: newDisplay.files, components: [newComponents] }).catch(()=>{});
        });

        collector.on('end', () => {
            const finalComponents = generateButtons(currentView, currentPage, currentTotalPages).components.map(btn => btn.setDisabled(true));
            msg.edit({ components: [new ActionRowBuilder().addComponents(finalComponents)] }).catch(console.error);
        });
    },

    buildDailyEmbed,
    buildWeeklyEmbed,
    buildAchievementsEmbed,
    getTodayDateString,
    getWeekStartDateString
};
