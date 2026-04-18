const { SlashCommandBuilder, PermissionsBitField, EmbedBuilder, Colors, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('fix-buffs')
        .setDescription('فورمات شامل لتنظيف جميع التعزيزات واللعنات المعلقة (ما عدا المزرعة والمخفي)')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addUserOption(option => 
            option.setName('user')
            .setDescription('اختر عضو معين (اتركه فارغ لتنظيف السيرفر بالكامل)')
            .setRequired(false)),
    
    name: 'fix-buffs',
    aliases: ['تنظيف-البفات', 'تصفير-اللعنات', 'فورمات-بف'],
    category: 'Admin',
    
    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        const client = interactionOrMessage.client;
        const db = client.sql;
        const guildId = interactionOrMessage.guild.id;

        const member = isSlash ? interactionOrMessage.member : interactionOrMessage.member;
        if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            const errMsg = '❌ لا تملك صلاحية لاستخدام هذا الأمر.';
            return isSlash ? interactionOrMessage.reply({ content: errMsg, flags: [MessageFlags.Ephemeral] }) : interactionOrMessage.reply(errMsg);
        }

        let targetUser = null;
        if (isSlash) {
            targetUser = interactionOrMessage.options.getUser('user');
        } else {
            targetUser = interactionOrMessage.mentions.users.first();
            if (!targetUser && args && args[0]) {
                try { targetUser = await client.users.fetch(args[0].replace(/[<@!>]/g, '')); } catch(e){}
            }
        }

        if (isSlash) await interactionOrMessage.deferReply({ flags: [MessageFlags.Ephemeral] });

        try {
            let query = "";
            let params = [];
            let msg = "";

            // 🔥 التعديل الجذري هنا: مسح كل شيء ما عدا (عامل المزرعة) و (التعزيز المخفي للأسلحة والمهارات)
            if (targetUser) {
                query = `DELETE FROM user_buffs WHERE "guildID" = $1 AND "userID" = $2 AND "buffType" NOT LIKE 'hidden_%' AND "buffType" != 'farm_worker'`;
                params = [guildId, targetUser.id];
                msg = `✅ **تم عمل "فورمات شامل" لجميع التعزيزات واللعنات للاعب <@${targetUser.id}> بنجاح!**\n\n💡 *ملاحظة:* النظام الآن سيعيد حساب تعزيزاته من الصفر بناءً على (رتبه الحالية) فقط بمجرد أن يتفاعل!`;
            } else {
                query = `DELETE FROM user_buffs WHERE "guildID" = $1 AND "buffType" NOT LIKE 'hidden_%' AND "buffType" != 'farm_worker'`;
                params = [guildId];
                msg = `✅ **تم عمل "فورمات شامل" لجميع تعزيزات ولعنات السيرفر بالكامل!**\n\n💡 *ملاحظة:* سيرجع كل لاعب لنسبته الطبيعية المستمدة من الرتب بمجرد تفاعله بالدردشة.`;
            }

            try {
                await db.query(query, params);
            } catch (e) {
                let fallbackQuery = query.replace(/"guildID"/g, "guildid").replace(/"userID"/g, "userid").replace(/"buffType"/g, "bufftype");
                await db.query(fallbackQuery, params);
            }

            const embed = new EmbedBuilder()
                .setColor(Colors.Green)
                .setTitle('🪄 تمت عملية الفورمات والتطهير بنجاح')
                .setDescription(msg);

            if (isSlash) {
                await interactionOrMessage.editReply({ embeds: [embed] });
            } else {
                await interactionOrMessage.reply({ embeds: [embed] });
            }

        } catch (err) {
            console.error("[Fix Buffs Error]:", err);
            const errMsg = '❌ حدث خطأ أثناء محاولة مسح البيانات.';
            if (isSlash) await interactionOrMessage.editReply(errMsg);
            else await interactionOrMessage.reply(errMsg);
        }
    }
};
