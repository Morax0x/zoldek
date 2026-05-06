const { SlashCommandBuilder, PermissionsBitField, MessageFlags } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('set-role-coupon')
        .setDescription('تعيين كوبون خصم خاص برتبة معينة (يتجدد كل 15 يوم)')
        .addRoleOption(option => 
            option.setName('role')
                .setDescription('الرتبة أو العرق')
                .setRequired(true))
        .addIntegerOption(option => 
            option.setName('discount')
                .setDescription('نسبة الخصم %')
                .setMinValue(1)
                .setMaxValue(99)
                .setRequired(true)),

    async execute(interaction, args) {
        // التحقق من الصلاحيات (أدمن فقط)
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: "❌ **ليس لديك صلاحية لاستخدام هذا الأمر.**", flags: [MessageFlags.Ephemeral] });
        }

        const role = interaction.options.getRole('role');
        const discount = interaction.options.getInteger('discount');
        const db = interaction.client.sql;

        // التأكد من وجود الجدول لضمان عمل ON CONFLICT بشكل سليم
        try {
            await db.query(`CREATE TABLE IF NOT EXISTS role_coupons_config ("guildID" TEXT, "roleID" TEXT, "discountPercent" INTEGER, PRIMARY KEY ("guildID", "roleID"))`);
        } catch(e) {
            console.error("Error creating role_coupons_config table:", e);
        }

        // حفظ الإعدادات في الداتابيس باستخدام PostgreSQL Upsert
        try {
            await db.query(`
                INSERT INTO role_coupons_config ("guildID", "roleID", "discountPercent") 
                VALUES ($1, $2, $3) 
                ON CONFLICT ("guildID", "roleID") 
                DO UPDATE SET "discountPercent" = EXCLUDED."discountPercent"
            `, [interaction.guild.id, role.id, discount]);

            return interaction.reply({ 
                content: `✅ **تم إعداد الكوبون بنجاح!**\n\n🎭 **الرتبة:** ${role}\n📉 **الخصم:** ${discount}%\n⏳ **التجديد:** تلقائياً كل 15 يوم لكل عضو يحمل الرتبة.`,
                flags: [MessageFlags.Ephemeral] 
            });
        } catch (error) {
            console.error("Set Role Coupon Error:", error);
            return interaction.reply({ content: "❌ حدث خطأ أثناء حفظ بيانات الكوبون في قاعدة البيانات.", flags: [MessageFlags.Ephemeral] });
        }
    }
};
