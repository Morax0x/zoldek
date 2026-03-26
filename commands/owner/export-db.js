const { SlashCommandBuilder, AttachmentBuilder, MessageFlags } = require('discord.js');
const fs = require('fs');
const path = require('path');

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
        const msg = await reply("⏳ **جاري سحب وضغط بيانات الإمبراطورية...** (قد يستغرق الأمر ثواني معدودة)");

        let tempFilePath = null;

        try {
            const db = client.sql;
            
            // جلب أسماء كل الجداول في قاعدة البيانات
            const tablesRes = await db.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
            const tables = tablesRes.rows.map(r => r.tablename);

            const exportData = {};

            // الدوران على كل جدول وسحب البيانات
            for (const table of tables) {
                const res = await db.query(`SELECT * FROM "${table}"`);
                exportData[table] = res.rows;
            }

            // 🔥 1. ضغط الملف: إزالة المسافات لتقليل حجم الملف بنسبة كبيرة جداً 🔥
            const jsonString = JSON.stringify(exportData);
            
            // 🔥 2. إنشاء ملف مؤقت في الاستضافة بدلاً من الرام لمنع التايم أوت 🔥
            const fileName = `Empress_DB_${Date.now()}.json`;
            tempFilePath = path.join(process.cwd(), fileName);
            fs.writeFileSync(tempFilePath, jsonString);

            // 🔥 3. قراءة الملف ورفعه كـ Stream لديسكورد 🔥
            const attachment = new AttachmentBuilder(tempFilePath, { name: fileName });

            const finalMsg = "✅ **تم استخراج قاعدة البيانات بنجاح يا إمبراطور!**\nحمل هذا الملف واحتفظ به، ثم استخدم أمر الاستيراد `!import-db` في القاعدة الجديدة.";
            
            if (isSlash) {
                await interactionOrMessage.editReply({ content: finalMsg, files: [attachment] });
            } else {
                await msg.edit({ content: finalMsg, files: [attachment] });
            }

            // 🔥 4. تنظيف وحذف الملف المؤقت بعد رفعه بدقائق قليلة للتأكد من وصوله 🔥
            setTimeout(() => {
                if (tempFilePath && fs.existsSync(tempFilePath)) {
                    fs.unlinkSync(tempFilePath);
                }
            }, 15000);

        } catch (error) {
            console.error("Export DB Error:", error);
            const err = "❌ حدث خطأ أثناء التصدير، أو أن حجم البيانات يتجاوز 25 ميجابايت (الحد الأقصى لرفع الملفات في ديسكورد).";
            if (isSlash) await interactionOrMessage.editReply(err);
            else await msg.edit(err);
            
            // تنظيف في حالة حدوث خطأ
            if (tempFilePath && fs.existsSync(tempFilePath)) {
                fs.unlinkSync(tempFilePath);
            }
        }
    }
};
