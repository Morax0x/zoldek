const { AttachmentBuilder } = require('discord.js');

async function startAutoBackup(client) {
    // 60 دقيقة * 60 ثانية * 1000 جزء من الثانية = 1 ساعة
    const HOURLY_INTERVAL = 60 * 60 * 1000; 

    setInterval(async () => {
        const db = client.sql;
        if (!db) return;

        try {
            // 1. جلب آيدي القناة من قاعدة البيانات
            let configRes;
            try { configRes = await db.query(`SELECT "value" FROM bot_config WHERE "key" = 'backup_channel'`); }
            catch (e) { configRes = await db.query(`SELECT value FROM bot_config WHERE key = 'backup_channel'`).catch(()=>({rows:[]})); }
            
            const backupChannelId = configRes.rows[0]?.value;
            if (!backupChannelId) return; // إذا لم يتم تحديد القناة بعد، توقف بصمت

            // جلب القناة
            const channel = client.channels.cache.get(backupChannelId) || await client.channels.fetch(backupChannelId).catch(() => null);
            if (!channel) return; 

            // 2. تجهيز الجداول
            const tables = ['levels', 'settings', 'streaks', 'user_reputation', 'user_weapons', 'user_inventory', 'marriages', 'children', 'active_giveaways', 'user_achievements', 'kings_board_tracker', 'user_daily_stats', 'user_weekly_stats'];
            
            const dateStr = new Date().toISOString().replace(/T/, '_').replace(/:/g, '-').split('.')[0];
            
            let attachments = [];
            let totalSizeMB = 0;
            let batchNumber = 1;

            // 3. سحب البيانات جدولاً بجدول (لتخفيف الضغط على الرام)
            for (const table of tables) {
                try {
                    const res = await db.query(`SELECT * FROM ${table}`);
                    if (!res.rows || res.rows.length === 0) continue; // تخطي الجداول الفارغة

                    // ضغط البيانات بإزالة المسافات الفارغة (بدون null, 2)
                    const jsonString = JSON.stringify(res.rows); 
                    const buffer = Buffer.from(jsonString, 'utf-8');
                    
                    const sizeMB = buffer.length / (1024 * 1024);
                    totalSizeMB += sizeMB;

                    const fileName = `Backup_${table}_${dateStr}.json`;
                    attachments.push(new AttachmentBuilder(buffer, { name: fileName }));

                    // إرسال كل 4 جداول في رسالة منفصلة لتجنب حدود ديسكورد (25MB) وتفريغ الرام
                    if (attachments.length >= 4) {
                        await channel.send({ 
                            content: `📦 **نسخ احتياطي (الدفعة ${batchNumber})**\n⏰ **الوقت:** <t:${Math.floor(Date.now() / 1000)}:F>`, 
                            files: attachments 
                        });
                        attachments = []; // تفريغ المصفوفة من الذاكرة
                        batchNumber++;
                    }
                } catch (e) {
                    // تجاهل الجداول غير الموجودة بصمت
                } 
            }

            // 4. إرسال ما تبقى من الجداول
            if (attachments.length > 0) {
                await channel.send({ 
                    content: `📦 **الدفعة الأخيرة من النسخ الاحتياطي**\n📊 **إجمالي الحجم التقريبي:** ${totalSizeMB.toFixed(2)} MB\n⏰ **الوقت:** <t:${Math.floor(Date.now() / 1000)}:F>`, 
                    files: attachments 
                });
            }

        } catch (err) {
            console.error("[Auto Backup Error]:", err.message);
        }
    }, HOURLY_INTERVAL);
}

module.exports = { startAutoBackup };
