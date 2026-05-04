const { EmbedBuilder, Colors, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags } = require("discord.js");
const { updateNickname } = require('../streak-handler.js');

async function buildTopStreaksEmbed(interaction, db, page = 1) {
    try {
        let settingsRes;
        try { settingsRes = await db.query(`SELECT "streakEmoji" FROM settings WHERE "guild" = $1`, [interaction.guild.id]); }
        catch(e) { settingsRes = await db.query(`SELECT streakemoji FROM settings WHERE guild = $1`, [interaction.guild.id]).catch(()=>({rows:[]})); }
        
        const streakEmoji = settingsRes && settingsRes.rows[0] ? (settingsRes.rows[0].streakEmoji || settingsRes.rows[0].streakemoji || '🔥') : '🔥';

        let allUsersRes;
        try { allUsersRes = await db.query(`SELECT * FROM streaks WHERE "guildID" = $1 AND "streakCount" > 0 ORDER BY "streakCount" DESC`, [interaction.guild.id]); }
        catch(e) { allUsersRes = await db.query(`SELECT * FROM streaks WHERE guildid = $1 AND streakcount > 0 ORDER BY streakcount DESC`, [interaction.guild.id]).catch(()=>({rows:[]})); }
        
        const allUsers = allUsersRes && allUsersRes.rows ? allUsersRes.rows : [];

        if (allUsers.length === 0) {
            const embed = new EmbedBuilder()
                .setTitle(`✥ اعـلـى الـمصـنـفـيـن بالـسـتـريـك`)
                .setColor("Red")
                .setImage('https://i.postimg.cc/NfLYXwD5/123.jpg')
                .setDescription("لا يوجد أحد في لوحة صدارة الستريك بعد!");
            return { embeds: [embed], components: [] };
        }

        const rowsPerPage = 5;
        const totalPages = Math.ceil(allUsers.length / rowsPerPage);
        page = Math.max(1, Math.min(page, totalPages));
        const start = (page - 1) * rowsPerPage;
        const end = start + rowsPerPage;
        const pageData = allUsers.slice(start, end);

        const embed = new EmbedBuilder()
            .setTitle(`✥ اعـلـى الـمصـNـفـيـن (ستريك)`)
            .setColor("Red")
            .setImage('https://i.postimg.cc/NfLYXwD5/123.jpg')
            .setTimestamp()
            .setFooter({ text: `صفحة ${page} / ${totalPages}` });

        let descriptionText = '';

        for (let i = 0; i < pageData.length; i++) {
            const streakData = pageData[i];
            const rank = start + i + 1;
            const uId = streakData.userID || streakData.userid;
            const sCount = streakData.streakCount || streakData.streakcount;

            let memberName;
            try {
                const userObj = await interaction.guild.members.fetch(uId);
                memberName = `<@${uId}>`;
            } catch (error) {
                memberName = `User Left (${uId})`;
            }

            let rankEmoji = '';
            if (rank === 1) rankEmoji = '🥇';
            else if (rank === 2) rankEmoji = '🥈';
            else if (rank === 3) rankEmoji = '🥉';
            else rankEmoji = `#${rank}`;

            descriptionText += `${rankEmoji} ${memberName}\n> **Streak**: \`${sCount}\` ${streakEmoji}\n\n`;
        }

        embed.setDescription(descriptionText);

        let components = [];
        if (totalPages > 1) {
            const pageRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                    .setCustomId(`streak_panel_top_prev_${page}`)
                    .setLabel('◀️')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page === 1),
                    new ButtonBuilder()
                    .setCustomId(`streak_panel_top_next_${page}`)
                    .setLabel('▶️')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page === totalPages)
                );
            components.push(pageRow);
        }

        return { embeds: [embed], components: components };

    } catch (err) {
        console.error("Error building top streaks embed:", err);
        return { embeds: [new EmbedBuilder().setTitle(' خطأ').setDescription('حدث خطأ أثناء جلب القائمة.').setColor(Colors.Red)], components: [] };
    }
}

async function handleStreakPanel(i, client, db) {
    let currentPage = 1;
    const selection = i.isStringSelectMenu() ? i.values[0] : i.customId;

    // تم إرجاع نظام التخفي بالضبط كما كان في الكود القديم الخاص بك
    if (i.isButton()) {
        await i.deferUpdate().catch(()=>{});
        if (i.customId.includes('_prev_') || i.customId.includes('_next_')) {
            const pageData = i.customId.split('_');
            currentPage = parseInt(pageData[pageData.length - 1]);
            if (i.customId.includes('_prev_')) currentPage--;
            if (i.customId.includes('_next_')) currentPage++;
        }
    } else if (i.isStringSelectMenu() && i.customId === 'streak_panel_select_sep') {
        await i.deferUpdate().catch(()=>{});
    } else {
        await i.deferReply({ flags: [MessageFlags.Ephemeral] }).catch(()=>{});
    }

    const guildID = i.guild.id;
    const userID = i.user.id;
    
    let streakRes;
    try { streakRes = await db.query(`SELECT * FROM streaks WHERE "guildID" = $1 AND "userID" = $2`, [guildID, userID]); }
    catch(e) { streakRes = await db.query(`SELECT * FROM streaks WHERE guildid = $1 AND userid = $2`, [guildID, userID]).catch(()=>({rows:[]})); }
    
    let streakData = streakRes && streakRes.rows ? streakRes.rows[0] : null;

    const saveStreak = async (data) => {
        try {
            await db.query(`
                INSERT INTO streaks ("id", "guildID", "userID", "streakCount", "lastMessageTimestamp", "hasGracePeriod", "hasItemShield", "nicknameActive", "hasReceivedFreeShield", "separator", "dmNotify", "highestStreak", "has12hWarning") 
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                ON CONFLICT ("id") DO UPDATE SET 
                    "streakCount" = EXCLUDED."streakCount", 
                    "lastMessageTimestamp" = EXCLUDED."lastMessageTimestamp", 
                    "hasGracePeriod" = EXCLUDED."hasGracePeriod", 
                    "hasItemShield" = EXCLUDED."hasItemShield", 
                    "nicknameActive" = EXCLUDED."nicknameActive", 
                    "hasReceivedFreeShield" = EXCLUDED."hasReceivedFreeShield", 
                    "separator" = EXCLUDED."separator", 
                    "dmNotify" = EXCLUDED."dmNotify", 
                    "highestStreak" = EXCLUDED."highestStreak", 
                    "has12hWarning" = EXCLUDED."has12hWarning"
            `, [data.id, data.guildID, data.userID, data.streakCount, data.lastMessageTimestamp, data.hasGracePeriod, data.hasItemShield, data.nicknameActive, data.hasReceivedFreeShield, data.separator, data.dmNotify, data.highestStreak, data.has12hWarning]);
        } catch(e) {
            await db.query(`
                INSERT INTO streaks (id, guildid, userid, streakcount, lastmessagetimestamp, hasgraceperiod, hasitemshield, nicknameactive, hasreceivedfreeshield, separator, dmnotify, higheststreak, has12hwarning) 
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                ON CONFLICT (id) DO UPDATE SET 
                    streakcount = EXCLUDED.streakcount, 
                    lastmessagetimestamp = EXCLUDED.lastmessagetimestamp, 
                    hasgraceperiod = EXCLUDED.hasgraceperiod, 
                    hasitemshield = EXCLUDED.hasitemshield, 
                    nicknameactive = EXCLUDED.nicknameactive, 
                    hasreceivedfreeshield = EXCLUDED.hasreceivedfreeshield, 
                    separator = EXCLUDED.separator, 
                    dmnotify = EXCLUDED.dmnotify, 
                    higheststreak = EXCLUDED.higheststreak, 
                    has12hwarning = EXCLUDED.has12hwarning
            `, [data.id, data.guildID, data.userID, data.streakCount, data.lastMessageTimestamp, data.hasGracePeriod, data.hasItemShield, data.nicknameActive, data.hasReceivedFreeShield, data.separator, data.dmNotify, data.highestStreak, data.has12hWarning]).catch(()=>{});
        }
    };

    if (!streakData) {
        streakData = {
            id: `${guildID}-${userID}`,
            guildID: guildID,
            userID: userID,
            streakCount: 0,
            lastMessageTimestamp: 0,
            hasGracePeriod: 0,
            hasItemShield: 0,
            nicknameActive: 1,
            hasReceivedFreeShield: 0,
            separator: '|',
            dmNotify: 1,
            highestStreak: 0,
            has12hWarning: 0
        };
        await saveStreak(streakData);
    } else {
        streakData = {
            id: streakData.id,
            guildID: streakData.guildID || streakData.guildid,
            userID: streakData.userID || streakData.userid,
            streakCount: streakData.streakCount || streakData.streakcount,
            lastMessageTimestamp: streakData.lastMessageTimestamp || streakData.lastmessagetimestamp,
            hasGracePeriod: streakData.hasGracePeriod || streakData.hasgraceperiod,
            hasItemShield: streakData.hasItemShield || streakData.hasitemshield,
            nicknameActive: streakData.nicknameActive !== undefined ? streakData.nicknameActive : streakData.nicknameactive,
            hasReceivedFreeShield: streakData.hasReceivedFreeShield || streakData.hasreceivedfreeshield,
            separator: streakData.separator,
            dmNotify: streakData.dmNotify !== undefined ? streakData.dmNotify : streakData.dmnotify,
            highestStreak: streakData.highestStreak || streakData.higheststreak,
            has12hWarning: streakData.has12hWarning || streakData.has12hwarning
        };
    }

    if (selection === 'streak_panel_toggle') {
        // 🔥 تم إصلاح عكس البوصلة: أصبح الآن يقرأ الـ true/false والـ 1/0 بشكل صحيح ليقلب الحالة 🔥
        const isActive = (streakData.nicknameActive == 1 || streakData.nicknameActive === true);
        const newState = isActive ? 0 : 1;
        
        streakData.nicknameActive = newState;
        await saveStreak(streakData);
        await updateNickname(i.member, db);
        await i.editReply({ content: newState === 0 ? "✅ تم **إخفاء** الستريك." : "✅ تم **إظهار** الستريك.", components: [] });

    } else if (selection === 'streak_panel_change_sep') {
        const currentSep = streakData.separator || '|';

        const separatorOptions = [
            { label: '|', value: '|' },
            { label: '•', value: '•' },
            { label: '»', value: '»' },
            { label: '✦', value: '✦' },
            { label: '★', value: '★' },
            { label: '❖', value: '❖' },
            { label: '✧', value: '✧' },
            { label: '✬', value: '✬' },
            { label: '〢', value: '〢' },
            { label: '┇', value: '┇' }
        ];

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('streak_panel_select_sep')
            .setPlaceholder('اختر الفاصل الذي تفضله...')
            .addOptions(
                separatorOptions.map(opt =>
                    new StringSelectMenuOptionBuilder()
                    .setLabel(opt.label)
                    .setValue(opt.value)
                    .setDefault(opt.value === currentSep)
                )
            );

        const row = new ActionRowBuilder().addComponents(selectMenu);
        await i.editReply({ content: 'اختر مظهر الفاصل الجديد لاسمك:', components: [row] });

    } else if (i.customId === 'streak_panel_select_sep') {
        const newSeparator = i.values[0];

        streakData.separator = newSeparator;
        await saveStreak(streakData);

        await updateNickname(i.member, db);

        await i.editReply({ content: `✅ تم تغيير فاصل الستريك الخاص بك إلى: \`${newSeparator}\``, components: [] });

    } else if (selection?.startsWith('streak_panel_top')) {
        const topData = await buildTopStreaksEmbed(i, db, currentPage);
        await i.editReply(topData);

    } else if (selection === 'streak_panel_notifications') {
        const isActive = (streakData.dmNotify == 1 || streakData.dmNotify === true);
        const newState = isActive ? 0 : 1;
        
        streakData.dmNotify = newState;
        await saveStreak(streakData);

        const status = newState === 1 ? "مفعلة" : "معطلة";
        await i.editReply({ content: `✅ تم ضبط إشعارات الستريك الخاصة بك إلى: **${status}**.` });
    }
    return;
}

module.exports = {
    handleStreakPanel,
    buildTopStreaksEmbed
};
