const { SlashCommandBuilder, MessageFlags } = require('discord.js');

const OWNER_ID = "1145327691772481577";

module.exports = {
    data: new SlashCommandBuilder()
        .setName('import-db')
        .setDescription('استعادة قاعدة البيانات من ملف JSON (للمالك فقط)')
        .addAttachmentOption(option => option.setName('file').setDescription('ملف الـ JSON الخاص بالنسخة الاحتياطية').setRequired(true)),
    name: 'import-db',
    aliases: ['استيراد', 'رفع_البيانات'],
    
    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        const author = isSlash ? interactionOrMessage.user : interactionOrMessage.author;
        const client = interactionOrMessage.client;

        if (author.id !== OWNER_ID) return;

        let attachmentUrl = null;

        if (isSlash) {
            const file = interactionOrMessage.options.getAttachment('file');
            if (!file.name.endsWith('.json')) return interactionOrMessage.reply({ content: "❌ يجب أن يكون الملف بصيغة JSON.", flags: [MessageFlags.Ephemeral] });
            attachmentUrl = file.url;
            await interactionOrMessage.deferReply();
        } else {
            const message = interactionOrMessage;
            if (message.attachments.size === 0) return message.reply("❌ الرجاء إرفاق ملف الـ JSON مع الأمر.");
            const file = message.attachments.first();
            if (!file.name.endsWith('.json')) return message.reply("❌ يجب أن يكون الملف بصيغة JSON.");
            attachmentUrl = file.url;
        }

        const reply = async (content) => {
            if (isSlash) return interactionOrMessage.editReply(content);
            return interactionOrMessage.reply(content);
        };

        const msg = await reply("⏳ **جاري قراءة الملف وبدء نقل البيانات...**");

        try {
            // تحميل الملف من الديسكورد
            const response = await fetch(attachmentUrl);
            const data = await response.json();
            const db = client.sql;

            let tablesRestored = 0;
            let rowsRestored = 0;

            for (const table of Object.keys(data)) {
                const rows = data[table];
                if (rows.length === 0) continue;

                // تنظيف الجدول قبل رفع البيانات الجديدة عشان ما تتكرر
                await db.query(`TRUNCATE TABLE "${table}" CASCADE`).catch(() => {});

                const columns = Object.keys(rows[0]);
                const colsStr = columns.map(c => `"${c}"`).join(', ');
                const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');

                for (const row of rows) {
                    const values = columns.map(col => row[col]);
                    try {
                        await db.query(`INSERT INTO "${table}" (${colsStr}) VALUES (${placeholders})`, values);
                        rowsRestored++;
                    } catch (e) {
                        console.log(`Failed to insert row into ${table}:`, e.message);
                    }
                }
                tablesRestored++;
            }

            await reply(`✅ **اكتملت المهمة يا إمبراطور!**\nتمت استعادة **${rowsRestored}** سجل موزعة على **${tablesRestored}** جداول.`);

        } catch (error) {
            console.error("Import DB Error:", error);
            await reply("❌ حدث خطأ أثناء رفع البيانات. تأكد من أن الملف سليم.");
        }
    }
};
