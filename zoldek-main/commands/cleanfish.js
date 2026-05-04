module.exports = {
    name: 'تنظيف-السمك',
    description: 'أمر سري للمطور لمسح الأسماك القديمة من قاعدة البيانات',
    
    async execute(message) {
        // حماية: الأمر يشتغل للمطور فقط (حطيت الآيدي حقك اللي بالكود)
        if (message.author.id !== "1145327691772481577") return;

        const db = message.client.sql;
        
        try {
            // محاولة الحذف (PostgreSQL)
            const result = await db.query(`DELETE FROM user_inventory WHERE "itemID" LIKE 'fish_%'`);
            const deletedCount = result.rowCount || 0;
            return message.reply(`✅ **تمت الإبادة بنجاح!** تم مسح **${deletedCount}** سمكة قديمة من حقائب اللاعبين.`);
        } catch (e) {
            try {
                // محاولة الحذف (SQLite كبديل)
                const result = await db.query(`DELETE FROM user_inventory WHERE itemid LIKE 'fish_%'`);
                return message.reply(`✅ **تمت الإبادة بنجاح!** تم تنظيف الداتابيز من الأسماك القديمة.`);
            } catch (err) {
                console.error(err);
                return message.reply(`❌ حدث خطأ أثناء التنظيف: ${err.message}`);
            }
        }
    }
};
