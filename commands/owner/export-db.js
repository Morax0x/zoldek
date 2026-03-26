const { SlashCommandBuilder, AttachmentBuilder, MessageFlags } = require('discord.js');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib'); // 🚀 مكتبة الضغط المدمجة

const OWNER_ID = "1145327691772481577";

module.exports = {
    data: new SlashCommandBuilder()
        .setName('export-db')
        .setDescription('يستخرج قاعدة البيانات كاملة إلى ملف مضغوط (للمالك فقط)'),
    name: 'export-db',
    aliases: ['تصدير', 'سحب_البيانات'],
    
    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        const author = isSlash ? interactionOrMessage.user : interactionOrMessage.author;
        const client = interactionOrMessage.client;

        if (author.id !== OWNER_ID) {
            const content = "❌ هذا الأمر مخصص لإمبراطور السيرفر فقط.";
            return isSlash ? interactionOrMessage.reply({ content, flags: [MessageFlags.Ephemeral] }) : interactionOrMessage.reply(content);
        }

        const reply = async (content) => {
            if (isSlash) {
                if (interactionOrMessage.deferred) return interactionOrMessage.editReply(content);
                return interactionOrMessage.reply({ content, fetchReply: true });
            }
            return interactionOrMessage.reply(content);
        };

        if (isSlash) await interactionOrMessage.deferReply();
        const msg = await reply("⏳ **جاري سحب البيانات (70+ ميجا) وضغطها لتجنب التقطيع...**");

        let tempFilePath = null;

        try {
            const db = client.sql;
            
            const tablesRes = await db.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
            const tables = tablesRes.rows.map(r => r.tablename);

            const exportData = {};

            for (const table of tables) {
                const res = await db.query(`SELECT * FROM "${table}"`);
                exportData[table] = res.rows;
            }

            const jsonString = JSON.stringify(exportData);
            
            // 🔥 سحر الضغط: تقليص 70 ميجا إلى حوالي 5 ميجا فقط! 🔥
            const compressedData = zlib.gzipSync(jsonString);

            const fileName = `Empress_DB_${Date.now()}.json.gz`;
            tempFilePath = path.join(process.cwd(), fileName);
            fs.writeFileSync(tempFilePath, compressedData);

            const attachment = new AttachmentBuilder(tempFilePath, { name: fileName });

            const finalMsg = "✅ **تم استخراج وضغط قاعدة البيانات بنجاح يا إمبراطور!**\nالملف الآن بصيغة `.gz` (مضغوط لضمان اكتمال البيانات). حمله واستخدم أمر الاستيراد `!import-db` في القاعدة الجديدة.";
            
            if (isSlash) {
                await interactionOrMessage.editReply({ content: finalMsg, files: [attachment] });
            } else {
                await msg.edit({ content: finalMsg, files: [attachment] });
            }

            setTimeout(() => {
                if (tempFilePath && fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
            }, 15000);

        } catch (error) {
            console.error("Export DB Error:", error);
            const err = "❌ حدث خطأ أثناء التصدير، راجع الكونسول.";
            if (isSlash) await interactionOrMessage.editReply(err);
            else await msg.edit(err);
            
            if (tempFilePath && fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        }
    }
};
