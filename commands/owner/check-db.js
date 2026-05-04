const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const Database = require('better-sqlite3');

const OWNER_ID = "1145327691772481577";

module.exports = {
    name: 'check-db',
    aliases: ['فحص'],
    description: 'فحص التوافق بين ملف SQLite وقاعدة البيانات السحابية.',
    category: "Owner",

    async execute(message, args) {
        if (message.author.id !== OWNER_ID) return;

        const client = message.client;
        const db = client.sql; 
        if (!db) return message.reply("❌ البوت غير متصل بقاعدة البيانات السحابية!");

        const downloadUrl = "https://files.catbox.moe/hn5ks5.sqlite";
        const msg = await message.reply("🔍 **جاري سحب الملف لتحليل الأعمدة المفقودة...**");
        
        const tempPath = path.join(process.cwd(), `temp_check_${Date.now()}.sqlite`);
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
                await msg.edit("✅ **تم السحب! جاري إجراء الفحص الشامل (مقارنة الأعمدة)...**");

                try {
                    const sqliteDb = new Database(tempPath);
                    const tablesToCheck = [
                        'levels', 'settings', 'streaks', 'media_streaks', 'user_daily_stats', 'user_weekly_stats', 'user_total_stats', 'user_inventory', 'user_portfolio', 'user_loans', 'user_reputation', 'user_weapons', 'user_skills', 'marriages', 'children', 'quest_notifications', 'user_quest_claims', 'user_achievements', 'market_items', 'active_giveaways', 'giveaway_entries', 'race_roles', 'user_farm'
                    ];

                    let missingReport = [];

                    for (const table of tablesToCheck) {
                        const checkTable = sqliteDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
                        if (!checkTable) continue;

                        const rows = sqliteDb.prepare(`SELECT * FROM ${table} LIMIT 1`).all();
                        if (rows.length === 0) continue;

                        const sqliteColumns = Object.keys(rows[0]).map(c => c.toLowerCase());
                        
                        let cloudColumns = [];
                        try {
                            const colRes = await db.query(`SELECT column_name FROM information_schema.columns WHERE table_name = '${table.toLowerCase()}'`);
                            cloudColumns = colRes.rows.map(r => r.column_name.toLowerCase());
                        } catch(e) {}

                        // ما هي الأعمدة الموجودة في القديم (SQLite) وغير موجودة في الجديد (السحابة)؟
                        const missingColumns = sqliteColumns.filter(c => !cloudColumns.includes(c));
                        
                        if (missingColumns.length > 0) {
                            missingReport.push(`**${table}**: \`${missingColumns.join('`, `')}\``);
                        }
                    }

                    sqliteDb.close();
                    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);

                    const embed = new EmbedBuilder()
                        .setTitle("📊 تقرير فحص قاعدة البيانات")
                        .setColor(missingReport.length > 0 ? "Red" : "Green");

                    if (missingReport.length > 0) {
                        embed.setDescription(`⚠️ تم العثور على أعمدة مفقودة في السحابة يجب إنشاؤها لتجنب فقدان البيانات:\n\n${missingReport.join('\n')}`);
                    } else {
                        embed.setDescription("✅ جميع الأعمدة متطابقة تماماً! السحابة جاهزة 100% لاستقبال كل البيانات.");
                    }

                    await msg.edit({ content: " ", embeds: [embed] });

                } catch (err) {
                    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
                    await msg.edit(`❌ خطأ أثناء الفحص: ${err.message}`);
                }
            });
        } catch (err) {
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
            await msg.edit(`❌ فشل التحميل: ${err.message}`);
        }
    }
};
