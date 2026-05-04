const { EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');

const OWNER_ID = "1145327691772481577";

module.exports = {
    name: 'admin',
    aliases: ['do', 'up', 'sss'],
    description: 'أوامر إدارة قاعدة البيانات للمالك فقط',
    category: "Admin",

    async execute(message, args) {
        if (message.author.id !== OWNER_ID) return;

        const client = message.client;
        const db = client.sql;
        if (!db) return;

        const prefix = args.prefix || "-";
        const commandName = message.content.split(" ")[0].slice(prefix.length).toLowerCase();

        if (commandName === 'up') {
            return message.reply("⚠️ **النظام الآن يعمل على السحابة (PostgreSQL).**\nلرفع أو استعادة البيانات، يرجى استخدام لوحة تحكم قاعدة البيانات السحابية (Dashboard) لضمان أمان البيانات.");
        }

        else if (commandName === 'do') {
            const msg = await message.reply("⏳ **جاري تجهيز النسخة السحابية...**");
            
            try {
                const tables = ['levels', 'settings', 'streaks', 'user_reputation', 'user_weapons', 'user_inventory', 'marriages', 'children', 'active_giveaways', 'user_achievements'];
                let backupData = {};

                for (const table of tables) {
                    try {
                        const res = await db.query(`SELECT * FROM ${table}`);
                        backupData[table] = res.rows;
                    } catch (e) {} 
                }

                const fileName = `CloudBackup_${new Date().toISOString().split('T')[0]}.json`;
                const filePath = path.join(process.cwd(), fileName);
                
                fs.writeFileSync(filePath, JSON.stringify(backupData, null, 2));

                const stats = fs.statSync(filePath);
                const fileSizeInMB = stats.size / (1024 * 1024);

                const attachment = new AttachmentBuilder(filePath, { name: fileName });

                try {
                    await message.author.send({ 
                        content: `📦 **نسخة احتياطية سحابية** (${fileSizeInMB.toFixed(2)} MB)\n📆 <t:${Math.floor(Date.now() / 1000)}:R>`, 
                        files: [attachment]
                    });
                    await msg.edit("✅ **تم إرسال النسخة السحابية للخاص.**");
                } catch (dmError) {
                    await message.reply({ 
                        content: `⚠️ **لم أستطع إرساله للخاص!**\n📦 إليك النسخة هنا:`, 
                        files: [attachment] 
                    });
                    await msg.delete().catch(()=>{});
                }

                fs.unlinkSync(filePath);

            } catch (err) { 
                console.error("[Admin DO] Error:", err);
                await msg.edit(`❌ خطأ عام: ${err.message}`); 
            }
        }
        
        else if (commandName === 'sss') {
            const channel = message.mentions.channels.first() || message.channel;
            try {
                await db.query(`CREATE TABLE IF NOT EXISTS bot_config ("key" TEXT PRIMARY KEY, "value" TEXT)`);
                await db.query(`
                    INSERT INTO bot_config ("key", "value") 
                    VALUES ($1, $2) 
                    ON CONFLICT("key") DO UPDATE SET "value" = EXCLUDED."value"
                `, ['backup_channel', channel.id]);
                
                message.reply(`✅ تم تعيين قناة النسخ التلقائي السحابي: ${channel}`);
            } catch (err) { 
                message.reply(`❌ خطأ: ${err.message}`); 
            }
        }
    }
};
