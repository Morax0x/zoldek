const { AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const fs = require('fs');
const path = require('path');

const BACKUP_INTERVAL = 3 * 60 * 60 * 1000; 
const OWNER_ID = "1145327691772481577";
const BACKUP_CHANNEL_ID = "123456789012345678"; // <--- ضع آيدي قناة الباكب هنا

module.exports = (client, db) => {
    const performCloudBackup = async () => {
        try {
            const channel = await client.channels.fetch(BACKUP_CHANNEL_ID).catch(() => null);
            if (!channel) return;

            const tables = ['levels', 'settings', 'streaks', 'user_reputation', 'user_weapons'];
            let backupData = {};

            for (const table of tables) {
                const res = await db.query(`SELECT * FROM ${table}`);
                backupData[table] = res.rows;
            }

            const fileName = `Backup_${new Date().toISOString().split('T')[0]}.json`;
            const filePath = path.join(process.cwd(), fileName);
            fs.writeFileSync(filePath, JSON.stringify(backupData, null, 2));

            const attachment = new AttachmentBuilder(filePath, { name: fileName });

            await channel.send({ 
                content: `📦 **نسخة احتياطية سحابية (بيانات JSON)**\n⏰ <t:${Math.floor(Date.now() / 1000)}:R>\n📊 تم نسخ ${tables.length} جداول أساسية.`, 
                files: [attachment]
            });

            fs.unlinkSync(filePath);

        } catch (err) {
            console.error("[Cloud Backup Error]:", err);
        }
    };

    setInterval(performCloudBackup, BACKUP_INTERVAL);

    client.on('interactionCreate', async interaction => {
        if (!interaction.isButton() || interaction.customId !== 'restore_backup') return;

        if (interaction.user.id !== OWNER_ID) {
            return interaction.reply({ content: "🚫 هذه الخاصية معطلة حالياً في النظام السحابي، يرجى الاستعادة عبر لوحة تحكم السحابة.", flags: [MessageFlags.Ephemeral] });
        }
    });
};
