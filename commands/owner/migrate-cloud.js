const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const Database = require('better-sqlite3');

const OWNER_ID = process.env.OWNER_ID || "1145327691772481577";

module.exports = {
    name: 'migrate-cloud',
    aliases: ['mc', 'هجرة'],
    category: "Owner",
    async execute(message, args) {
        if (message.author.id !== OWNER_ID) return;

        const db = message.client.sql;
        if (!db) return message.reply("❌ البوت غير متصل بقاعدة البيانات السحابية!");

        const downloadUrl = "https://files.catbox.moe/inkkh7.sqlite";
        const msg = await message.reply("⏳ **جاري سحب الملف الإمبراطوري والبدء في الهجرة الكبرى...**");
        
        const tempPath = path.join(process.cwd(), `temp_migrate_${Date.now()}.sqlite`);
        const file = fs.createWriteStream(tempPath);

        try {
            const response = await axios({
                method: 'GET',
                url: downloadUrl,
                responseType: 'stream',
                headers: { 'User-Agent': 'Mozilla/5.0' },
                timeout: 120000
            });

            response.data.pipe(file);

            file.on('finish', async function() {
                file.close();
                await msg.edit("✅ **تم السحب! جاري ضخ السجلات في السحابة الآن... (لا تقم بإيقاف البوت 🛑 قد يستغرق الأمر بضع دقائق)**");

                try {
                    const sqliteDb = new Database(tempPath);
                    
                    // استخراج جميع الجداول الموجودة في قاعدة البيانات القديمة تلقائياً
                    const tables = sqliteDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(t => t.name);
                    
                    let totalSuccess = 0;
                    let logDetails = [];

                    for (const table of tables) {
                        const rows = sqliteDb.prepare(`SELECT * FROM "${table}"`).all();
                        if (rows.length === 0) continue;

                        // ⚠️ أخذ أسماء الأعمدة كما هي بالضبط (بحروفها الكبيرة والصغيرة)
                        const columns = Object.keys(rows[0]);
                        const colsString = columns.map(c => `"${c}"`).join(', ');
                        const valsString = columns.map((_, i) => `$${i + 1}`).join(', ');
                        
                        let successCount = 0;
                        let errorCount = 0;

                        // ضخ البيانات
                        for (const row of rows) {
                            const values = columns.map(col => row[col]);
                            try {
                                await db.query(`INSERT INTO "${table}" (${colsString}) VALUES (${valsString}) ON CONFLICT DO NOTHING`, values);
                                successCount++;
                                totalSuccess++;
                            } catch (err) {
                                // الكود 23505 يعني أن البيانات موجودة مسبقاً (ON CONFLICT) فنتجاهلها ونعتبرها نجاح
                                if (err.code === '23505') successCount++; 
                                else {
                                    errorCount++;
                                    console.error(`Error in table ${table}:`, err.message);
                                }
                            }
                        }
                        logDetails.push(`**${table}**: ✅ ${successCount} | ❌ ${errorCount}`);
                    }
                    
                    sqliteDb.close();
                    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);

                    const embed = new EmbedBuilder()
                        .setTitle("🎉 تمت الهجرة الكبرى بنجاح!")
                        .setDescription(`تم نقل **${totalSuccess}** سجل إلى السحابة السريعة!\n\n**التفاصيل (الجداول النشطة):**\n${logDetails.join('\n')}`)
                        .setColor("Green");

                    await msg.edit({ content: " ", embeds: [embed] });

                } catch (err) {
                    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
                    console.error(err);
                    await msg.edit(`❌ **خطأ أثناء الهجرة:**\n\`\`\`js\n${err.message}\n\`\`\``);
                }
            });
        } catch (err) {
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
            await msg.edit(`❌ فشل التحميل من الرابط.`);
        }
    }
};
