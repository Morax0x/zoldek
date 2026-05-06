const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const { joinVoiceChannel, getVoiceConnection } = require('@discordjs/voice');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('صوت')
        .setDescription('التحكم في تواجد البوت الصوتي.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addSubcommand(sub => sub.setName('دخول').setDescription('إدخال البوت للقناة الصوتية (تثبيت 24/7).'))
        .addSubcommand(sub => sub.setName('خروج').setDescription('إخراج البوت من القناة الصوتية وإلغاء التثبيت.')),

    name: 'voice',
    aliases: ['صوت', 'v'],
    category: "Admin",
    description: "التحكم في البوت الصوتي",

    async execute(interactionOrMessage, args) {
        // دعم السلاش والرسائل العادية
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let member, guild, client;
        let sub;

        if (isSlash) {
            member = interactionOrMessage.member;
            guild = interactionOrMessage.guild;
            client = interactionOrMessage.client;
            sub = interactionOrMessage.options.getSubcommand();
            await interactionOrMessage.deferReply({ ephemeral: true });
        } else {
            // دعم الرسائل العادية (مثال: -صوت دخول)
            member = interactionOrMessage.member;
            guild = interactionOrMessage.guild;
            client = interactionOrMessage.client;
            sub = args[0]; // دخول أو خروج
        }

        const reply = async (content) => {
            if (isSlash) return interactionOrMessage.editReply(content);
            return interactionOrMessage.reply(content);
        };

        const db = client.sql; // تأكد أن client.sql هو اتصال الـ PostgreSQL

        // --- أمر الدخول ---
        if (sub === 'دخول' || sub === 'join') {
            const channel = member.voice.channel;
            if (!channel) return reply("❌ يجب أن تكون في قناة صوتية أولاً.");

            try {
                // 1. الانضمام للقناة
                joinVoiceChannel({
                    channelId: channel.id,
                    guildId: guild.id,
                    adapterCreator: guild.voiceAdapterCreator,
                    selfDeaf: false, 
                    selfMute: false  
                });

                // 2. حفظ القناة في قاعدة البيانات للتثبيت
                await db.query(`INSERT INTO settings ("guild") VALUES ($1) ON CONFLICT ("guild") DO NOTHING`, [guild.id]);
                await db.query(`UPDATE settings SET "voiceChannelID" = $1 WHERE "guild" = $2`, [channel.id, guild.id]);

                return reply(`✅ **تم الدخول والتثبيت!**\n- القناة: ${channel.name}\n- سيعود البوت لهذه القناة تلقائياً إذا أعيد تشغيله.`);
            
            } catch (error) {
                console.error(error);
                return reply("❌ حدث خطأ في الاتصال.");
            }
        }

        // --- أمر الخروج ---
        if (sub === 'خروج' || sub === 'leave') {
            const connection = getVoiceConnection(guild.id);
            
            // 1. حذف القناة من قاعدة البيانات لإلغاء التثبيت
            try {
                await db.query(`UPDATE settings SET "voiceChannelID" = NULL WHERE "guild" = $1`, [guild.id]);
            } catch (e) {
                console.error("Failed to update voiceChannelID to NULL:", e);
            }

            if (connection) {
                connection.destroy();
                return reply("✅ تم الخروج وإلغاء التثبيت.");
            } else {
                return reply("✅ تم إلغاء التثبيت (البوت ليس في قناة حالياً).");
            }
        }
    },
};
