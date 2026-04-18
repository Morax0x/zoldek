const { SlashCommandBuilder, PermissionsBitField, EmbedBuilder, Colors, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('fix-buffs')
        .setDescription('إزالة جميع التعزيزات واللعنات المؤقتة (خبرة، مورا، نزاع) المعلقة')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addUserOption(option => 
            option.setName('user')
            .setDescription('اختر عضو معين (اتركه فارغ لتنظيف السيرفر بالكامل)')
            .setRequired(false)),
    
    name: 'fix-buffs',
    aliases: ['تنظيف-البفات', 'تصفير-اللعنات'],
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

            if (targetUser) {
                query = `DELETE FROM user_buffs WHERE "guildID" = $1 AND "userID" = $2 AND "buffType" IN ('xp', 'mora', 'pvp_wounded')`;
                params = [guildId, targetUser.id];
                msg = `✅ **تم مسح جميع تعزيزات ولعنات (المورا والخبرة والنزاع) المعلقة للاعب <@${targetUser.id}> بنجاح!**\n*(لم يتم المساس بعامل المزرعة أو التعزيزات المخفية)*`;
            } else {
                query = `DELETE FROM user_buffs WHERE "guildID" = $1 AND "buffType" IN ('xp', 'mora', 'pvp_wounded')`;
                params = [guildId];
                msg = `✅ **تم مسح جميع تعزيزات ولعنات (المورا والخبرة والنزاع) المعلقة لجميع لاعبي السيرفر بنجاح!**\n*(الآن السيرفر نظيف بالكامل من أي أرقام فلكية أو لعنات قديمة عالقة)*`;
            }

            try {
                await db.query(query, params);
            } catch (e) {
                let fallbackQuery = query.replace(/"guildID"/g, "guildid").replace(/"userID"/g, "userid").replace(/"buffType"/g, "bufftype");
                await db.query(fallbackQuery, params);
            }

            const embed = new EmbedBuilder()
                .setColor(Colors.Green)
                .setTitle('🪄 تمت عملية التطهير بنجاح')
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
