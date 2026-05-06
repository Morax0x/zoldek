const { PermissionsBitField, SlashCommandBuilder } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('تنبيه-البومب')
        .setDescription('يحدد الرتبة التي سيتم تنبيهها بعد ساعتين من البومب.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
        .addRoleOption(option =>
            option.setName('الرتبة')
            .setDescription('الرتبة التي سيتم منشنتها عند انتهاء الوقت')
            .setRequired(true)),

    name: 'set-bump-notify',
    aliases: ['bumpnotify', 'setnotify'],
    category: "Admin",
    description: "يحدد الرتبة التي سيتم تنبيهها بعد ساعتين من البومب.",

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, guild, client, member;

        if (isSlash) {
            interaction = interactionOrMessage;
            guild = interaction.guild;
            client = interaction.client;
            member = interaction.member;
            await interaction.deferReply({ ephemeral: true });
        } else {
            message = interactionOrMessage;
            guild = message.guild;
            client = message.client;
            member = message.member;
        }

        const db = client.sql;
        const reply = async (payload) => {
            if (isSlash) return interaction.editReply(payload);
            return message.reply(payload);
        };

        if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return reply(`ليس لديك صلاحية الإدارة!`);
        }

        let role;
        if (isSlash) {
            role = interaction.options.getRole('الرتبة');
        } else {
            role = message.mentions.roles.first() || guild.roles.cache.get(args[0]);
            if (!role) return reply("الاستخدام: `-setnotify @Role`");
        }

        try {
            // محاولة إضافة العمود إذا لم يكن موجوداً (لضمان عدم حدوث خطأ)
            try {
                await db.query(`ALTER TABLE settings ADD COLUMN IF NOT EXISTS "bumpNotifyRoleID" TEXT`);
            } catch (e) {
                // العمود موجود مسبقاً، نتجاهل الخطأ
            }

            await db.query(`
                INSERT INTO settings ("guild", "bumpNotifyRoleID") 
                VALUES ($1, $2) 
                ON CONFLICT("guild") DO UPDATE SET "bumpNotifyRoleID" = EXCLUDED."bumpNotifyRoleID"
            `, [guild.id, role.id]);

            return reply(`✅ تم تفعيل تنبيهات البومب! سيتم منشنة **${role.name}** وآخر شخص قام بالبومب بعد ساعتين.`);
        } catch (err) {
            console.error("Set Bump Notify Error:", err);
            return reply("حدث خطأ أثناء حفظ الإعدادات.");
        }
    }
};
