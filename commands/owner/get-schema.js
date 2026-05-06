const { AttachmentBuilder } = require('discord.js');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

const OWNER_ID = "1145327691772481577"; // أيديك كمالك للبوت

module.exports = {
    name: 'get-schema',
    aliases: ['هيكل'],
    description: 'استخراج هيكل القاعدة القديمة.',
    category: "Owner",

    async execute(message, args) {
        if (message.author.id !== OWNER_ID) return;

        const msg = await message.reply("⏳ **جاري فحص ملف `mainDB.sqlite` واستخراج الهيكل...**");

        const dbPath = './mainDB.sqlite'; // مسار قاعدة البيانات القديمة

        if (!fs.existsSync(dbPath)) {
            return msg.edit("❌ **لم أتمكن من العثور على ملف `mainDB.sqlite` في ملفات البوت. تأكد أنه موجود!**");
        }

        const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
            if (err) {
                return msg.edit(`❌ **حدث خطأ أثناء فتح القاعدة:**\n\`\`\`js\n${err.message}\n\`\`\``);
            }

            db.all("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'", [], (err, rows) => {
                if (err) {
                    return msg.edit(`❌ **حدث خطأ أثناء قراءة الجداول:**\n\`\`\`js\n${err.message}\n\`\`\``);
                }

                let content = "====== 📊 هيكل الجداول الأصلي ======\n\n";
                rows.forEach((row) => {
                    content += `-- Table: ${row.name}\n`;
                    content += `${row.sql};\n\n`;
                });
                content += "=====================================\n";

                // حفظ الهيكل في ملف نصي
                fs.writeFileSync('./old_schema.txt', content);
                
                const attachment = new AttachmentBuilder('./old_schema.txt');
                
                msg.edit({ content: "✅ **تم استخراج الهيكل الأصلي بنجاح!** افتح الملف المرفق، انسخ محتواه، وأرسله لي هنا:", files: [attachment] });
                
                db.close();
            });
        });
    }
};
