module.exports = {
    name: 'تسريع-القافلة',
    aliases: ['تسريع', 'ff', 'skip-time'],
    category: 'Owner',
    description: 'تسريع وصول القافلة الحالية لاختبار النظام (للمطور فقط)',
    
    async execute(message) {
        // حماية فولاذية: الأمر للإمبراطور فقط
        if (message.author.id !== '1145327691772481577') return;
        
        const db = message.client.sql;
        // نرجع وقت الوصول 60 ثانية للخلف عشان الفاحص التلقائي يلقطها فوراً
        const targetTime = Date.now() - 60000; 
        
        let success = false;
        // قائمة بأسماء جداول القوافل المحتملة في قاعدة بياناتك
        const tables = ['user_caravans'];
        
        for (const table of tables) {
            try {
                // محاولة التحديث بالصيغة الأولى
                const res = await db.query(`UPDATE ${table} SET "endTime" = $1 WHERE "userID" = $2 RETURNING id`, [targetTime, message.author.id]);
                if (res && res.rowCount > 0) success = true;
            } catch(e) {
                try {
                    // محاولة التحديث بالصيغة الثانية (حروف صغيرة)
                    const res2 = await db.query(`UPDATE ${table} SET endtime = $1 WHERE userid = $2 RETURNING id`, [targetTime, message.author.id]);
                    if (res2 && res2.rowCount > 0) success = true;
                } catch(err) {}
            }
        }
        
        if (success) {
            message.reply('⏳ ⏩ **تم التلاعب بالزمن بنجاح!** قافلتك وصلت للتو. (انتظر ثواني فقط حتى يقوم فاحص البوت بإعلان وصولها وتوزيع الأرباح).');
        } else {
            message.reply('❌ لم أجد قافلة نشطة لك لكي أسرعها، تأكد أنك أرسلت قافلة أولاً.');
        }
    }
};
