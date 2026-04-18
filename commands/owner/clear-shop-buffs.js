const { SlashCommandBuilder, PermissionsBitField, MessageFlags, EmbedBuilder } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clear-shop-buffs')
        .setDescription('🛠️ حذف تعزيزات الخبرة المشتراة من المتجر أو التي تحتوي أرقام فلكية بالخطأ')
        .addUserOption(option => 
            option.setName('user')
            .setDescription('اختر عضو معين (اتركه فارغ لتنظيف السيرفر بالكامل)')
            .setRequired(false)
        ),

    name: 'clear-shop-buffs',
    aliases: ['تنظيف-البفات', 'مسح-التعزيزات', 'fix-bu'],
    category: "Owner",
    description: 'ينظف تعزيزات الخبرة الخاصة بالمتجر فقط لتصليح الأرقام الفلكية',

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        const client = interactionOrMessage.client;
        const db = client.sql;
        
        const user = isSlash ? interactionOrMessage.user : interactionOrMessage.author;
        const member = isSlash ? interactionOrMessage.member : interactionOrMessage.member;

        // حماية الأمر للإمبراطور أو الإداريين فقط
        const OWNER_ID = "1145327691772481577"; // آيدي الإمبراطور
        if (user.id !== OWNER_ID && !member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            const err = '❌ هذا الأمر مخصص للإدارة العليا فقط.';
            return isSlash ? interactionOrMessage.reply({ content: err, flags: [MessageFlags.Ephemeral] }) : interactionOrMessage.reply(err);
        }

        // تحديد العضو المستهدف
        let targetUser = null;
        if (isSlash) {
            targetUser = interactionOrMessage.options.getUser('user');
        } else {
            targetUser = interactionOrMessage.mentions.users.first();
            if (!targetUser && args && args[0]) {
                try { targetUser = await client.users.fetch(args[0].replace(/[<@!>]/g, '')); } catch(e){}
            }
        }

        const reply = async (payload) => {
            if (isSlash) {
                if (interactionOrMessage.deferred || interactionOrMessage.replied) return await interactionOrMessage.editReply(payload);
                return await interactionOrMessage.reply(payload);
            }
            return await interactionOrMessage.reply(payload);
        };

        if (isSlash) await interactionOrMessage.deferReply({ flags: [MessageFlags.Ephemeral] });

        try {
            // 🧹 الفلترة الذكية:
            let deletedCount = 0;
            let query = "";
            let params = [];

            if (targetUser) {
                query = `DELETE FROM user_buffs WHERE "buffType" = 'xp' AND ("buffPercent" >= 45 OR "multiplier" >= 0.45) AND "userID" = $1 RETURNING *`;
                params = [targetUser.id];
            } else {
                query = `DELETE FROM user_buffs WHERE "buffType" = 'xp' AND ("buffPercent" >= 45 OR "multiplier" >= 0.45) RETURNING *`;
                params = [];
            }
            
            try {
                const res = await db.query(query, params);
                deletedCount = res.rowCount || res.rows?.length || 0;
            } catch(e) {
                // توافق مع SQLite
                let fallbackQuery = query.replace(/"/g, "").replace(/\$1/g, "?");
                const res = await db.query(fallbackQuery, params).catch(()=>({rowCount: 0}));
                deletedCount = res.rowCount || res.rows?.length || 0;
            }

            const embed = new EmbedBuilder()
                .setTitle('✅ تم تنظيف التعزيزات بنجاح!')
                .setColor('Green')
                .setDescription(targetUser 
                    ? `تم مسح **${deletedCount}** تعزيز خبرة (من المتجر / أرقام فلكية) خاص بالعضو <@${targetUser.id}> من قاعدة البيانات.\n\n🛡️ **ملاحظة:** التعزيزات الثابتة الخاصة بالرتب، والتعزيزات البسيطة الخاصة بالدانجون (15%) لم تتأثر وستبقى تعمل بشكل سليم 100%.`
                    : `تم مسح **${deletedCount}** تعزيز خبرة (من المتجر / أرقام فلكية) لجميع الأعضاء من قاعدة البيانات.\n\n🛡️ **ملاحظة:** التعزيزات الثابتة الخاصة بالرتب، والتعزيزات البسيطة الخاصة بالدانجون (15%) لم تتأثر وستبقى تعمل بشكل سليم 100%.`)
                .setTimestamp();

            await reply({ embeds: [embed] });

        } catch (err) {
            console.error("[Clear Buffs Error]:", err);
            await reply({ content: "❌ حدث خطأ داخلي أثناء محاولة تنظيف قاعدة البيانات.", flags: [MessageFlags.Ephemeral] });
        }
    }
};
