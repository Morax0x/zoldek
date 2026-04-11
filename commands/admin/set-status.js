const { SlashCommandBuilder, ActivityType, PermissionsBitField } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('تغيير-الحالة')
        .setDescription('تغيير نشاط البوت (الفقاعة) وحالة الاتصال (اللون).')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addStringOption(option =>
            option.setName('النوع')
                .setDescription('نوع النشاط (الفقاعة أو يلعب...)')
                .setRequired(true)
                .addChoices(
                    { name: 'Custom (فقاعة كلام 💬)', value: 'Custom' },
                    { name: 'Playing (يلعب 🎮)', value: 'Playing' },
                    { name: 'Watching (يشاهد 📺)', value: 'Watching' },
                    { name: 'Listening (يستمع 🎧)', value: 'Listening' },
                    { name: 'Competing (يتنافس 🏆)', value: 'Competing' },
                    { name: 'Streaming (بث مباشر 🟣)', value: 'Streaming' }
                ))
        .addStringOption(option =>
            option.setName('النص')
                .setDescription('الكلام الذي يظهر')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('الوضع')
                .setDescription('لون الدائرة (أخضر، أصفر، أحمر)')
                .setRequired(false)
                .addChoices(
                    { name: 'Online (متصل 🟢)', value: 'online' },
                    { name: 'Idle (خامل 🟡)', value: 'idle' },
                    { name: 'Do Not Disturb (ممنوع الإزعاج 🔴)', value: 'dnd' },
                    { name: 'Invisible (مخفي ⚫)', value: 'invisible' }
                )),

    name: 'set-status',
    category: "Admin",

    async execute(interaction) {
        if (!interaction.isChatInputCommand) return;

        const typeStr = interaction.options.getString('النوع');
        const content = interaction.options.getString('النص');
        const statusStr = interaction.options.getString('الوضع') || 'online'; // الافتراضي متصل

        let activityData;

        // تجهيز بيانات النشاط
        if (typeStr === 'Custom') {
            activityData = {
                name: content, 
                type: ActivityType.Custom, 
                state: content 
            };
        } else if (typeStr === 'Streaming') {
            activityData = {
                name: content,
                type: ActivityType.Streaming,
                url: "https://www.twitch.tv/discord"
            };
        } else {
            let type;
            switch (typeStr) {
                case 'Playing': type = ActivityType.Playing; break;
                case 'Watching': type = ActivityType.Watching; break;
                case 'Listening': type = ActivityType.Listening; break;
                case 'Competing': type = ActivityType.Competing; break;
            }
            activityData = { name: content, type: type };
        }

        // 1. تطبيق النشاط + اللون فوراً
        interaction.client.user.setPresence({
            activities: [activityData],
            status: statusStr
        });

        // 2. حفظ الإعدادات في قاعدة البيانات (لضمان البقاء بعد الريستارت)
        const db = interaction.client.sql;
        const guildID = interaction.guild.id;

        try {
            // 🔥 تحديث الجدول لضمان وجود عمود لون الحالة (لو لم يكن موجوداً) 🔥
            try { await db.query(`ALTER TABLE settings ADD COLUMN "savedStatusPresence" TEXT DEFAULT 'online'`); } catch(e){}

            await db.query(`INSERT INTO settings ("guild") VALUES ($1) ON CONFLICT ("guild") DO NOTHING`, [guildID]);
            
            await db.query(`
                UPDATE settings 
                SET "savedStatusType" = $1, 
                    "savedStatusText" = $2,
                    "savedStatusPresence" = $3
                WHERE "guild" = $4
            `, [typeStr, content, statusStr, guildID]);
            
        } catch (e) {
            console.error("Failed to save status to DB:", e);
        }

        await interaction.reply({ 
            content: `✅ **تم التحديث والحفظ!**\n- النشاط: **${typeStr}**\n- النص: \`${content}\`\n- اللون: **${statusStr}**`, 
            ephemeral: true 
        });
    },
};
