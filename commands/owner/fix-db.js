const OWNER_ID = "1145327691772481577"; // أيديك

module.exports = {
    name: 'fix-db',
    aliases: ['اصلاح-العداد'],
    description: 'مزامنة عدادات الـ ID بعد الهجرة.',
    category: "Owner",

    async execute(message, args) {
        if (message.author.id !== OWNER_ID) return;

        const db = message.client.sql;
        if (!db) return message.reply("❌ غير متصل بالسحابة!");

        const msg = await message.reply("⏳ **جاري مزامنة عدادات الـ ID للسحابة...**");

        // الجداول التي تحتوي على عداد تلقائي (BIGSERIAL)
        const tablesWithSerial = [
            'active_reports', 'user_buffs', 'user_portfolio', 'user_inventory',
            'user_farm', 'user_achievements', 'user_weapons', 'user_skills',
            'user_loans', 'giveaway_entries', 'auto_responses', 'user_coupons',
            'farm_daily_log'
        ];

        let success = 0;
        for (const table of tablesWithSerial) {
            try {
                // أمر SQL يقفز بالعداد إلى أعلى رقم ID موجود في الجدول
                await db.query(`SELECT setval('"${table}_id_seq"', COALESCE((SELECT MAX(id) FROM "${table}"), 1))`);
                success++;
            } catch (e) {
                console.error(`خطأ في مزامنة جدول ${table}:`, e.message);
            }
        }

        await msg.edit(`✅ **تمت المزامنة!** تم إصلاح عدادات ${success} جدول. مشكلة الـ (Duplicate) انتهت تماماً!`);
    }
};
