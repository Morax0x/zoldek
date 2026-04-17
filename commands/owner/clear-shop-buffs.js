const { SlashCommandBuilder, PermissionsBitField, MessageFlags, EmbedBuilder } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clear-shop-buffs')
        .setDescription('🛠️ حذف تعزيزات الخبرة المشتراة من المتجر أو التي تحتوي أرقام فلكية بالخطأ'),

    name: 'clear-shop-buffs',
    aliases: ['تنظيف-البفات', 'مسح-التعزيزات', 'fix-buffs'],
    category: "Owner",
    description: 'ينظف تعزيزات الخبرة الخاصة بالمتجر فقط لتصليح الأرقام الفلكية',

    async execute(interactionOrMessage) {
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
            // تعزيزات المتجر هي 45% و 70% و 90%. الأرقام المضروبة ستكون أعلى من ذلك.
            // التعزيزات الطبيعية للمكافآت هي 15%، والسلبيات هي -15% أو -5%.
            // الكود سيحذف فقط الـ xp التي تبلغ 45% أو أكثر، مما يعني أنه سيستهدف المتجر والأخطاء الفلكية فقط!
            
            let deletedCount = 0;
            
            try {
                const res = await db.query(`DELETE FROM user_buffs WHERE "buffType" = 'xp' AND ("buffPercent" >= 45 OR "multiplier" >= 0.45) RETURNING *`);
                deletedCount = res.rowCount || res.rows?.length || 0;
            } catch(e) {
                // توافق مع SQLite
                const res = await db.query(`DELETE FROM user_buffs WHERE bufftype = 'xp' AND (buffpercent >= 45 OR multiplier >= 0.45) RETURNING *`).catch(()=>({rowCount: 0}));
                deletedCount = res.rowCount || res.rows?.length || 0;
            }

            const embed = new EmbedBuilder()
                .setTitle('✅ تم تنظيف التعزيزات بنجاح!')
                .setColor('Green')
                .setDescription(`تم مسح **${deletedCount}** تعزيز خبرة (من المتجر / أرقام فلكية) من قاعدة البيانات.\n\n🛡️ **ملاحظة:** التعزيزات الثابتة الخاصة بالرتب، والتعزيزات البسيطة الخاصة بالدانجون (15%) لم تتأثر وستبقى تعمل بشكل سليم 100%.`)
                .setTimestamp();

            await reply({ embeds: [embed] });

        } catch (err) {
            console.error("[Clear Buffs Error]:", err);
            await reply({ content: "❌ حدث خطأ داخلي أثناء محاولة تنظيف قاعدة البيانات.", flags: [MessageFlags.Ephemeral] });
        }
    }
};
