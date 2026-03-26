const { SlashCommandBuilder, AttachmentBuilder, MessageFlags } = require('discord.js');

const OWNER_ID = "1145327691772481577";

module.exports = {
    data: new SlashCommandBuilder()
        .setName('export-db')
        .setDescription('يستخرج قاعدة البيانات كاملة إلى ملف JSON (للمالك فقط)'),
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
        const msg = await reply("⏳ **جاري استخراج بيانات الإمبراطورية...** الرجاء الانتظار.");

        try {
            const db = client.sql;
            
            // جلب أسماء كل الجداول في قاعدة البيانات
            const tablesRes = await db.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
            const tables = tablesRes.rows.map(r => r.tablename);

            const exportData = {};

            // الدوران على كل جدول وسحب كل البيانات
            for (const table of tables) {
                const res = await db.query(`SELECT * FROM "${table}"`);
                exportData[table] = res.rows;
            }

            // تحويل البيانات لملف JSON
            const jsonString = JSON.stringify(exportData, null, 2);
            const buffer = Buffer.from(jsonString, 'utf-8');
            const attachment = new AttachmentBuilder(buffer, { name: `Empress_DB_Backup_${Date.now()}.json` });

            const finalMsg = "✅ **تم استخراج قاعدة البيانات بنجاح يا إمبراطور!**\nحمل هذا الملف واحتفظ به، ثم استخدم أمر الاستيراد في القاعدة الجديدة.";
            
            if (isSlash) {
                await interactionOrMessage.editReply({ content: finalMsg, files: [attachment] });
            } else {
                await msg.edit({ content: finalMsg, files: [attachment] });
            }

        } catch (error) {
            console.error("Export DB Error:", error);
            const err = "❌ حدث خطأ أثناء التصدير، راجع الكونسول.";
            if (isSlash) await interactionOrMessage.editReply(err);
            else await msg.edit(err);
        }
    }
};
