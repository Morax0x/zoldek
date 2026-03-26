const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const zlib = require('zlib');

const OWNER_ID = "1145327691772481577";

module.exports = {
    data: new SlashCommandBuilder()
        .setName('import-db')
        .setDescription('استعادة قاعدة البيانات بذكاء (يتجاهل العواميد القديمة) - للمالك فقط')
        .addAttachmentOption(option => option.setName('file').setDescription('ملف النسخة الاحتياطية').setRequired(true)),
    name: 'import-db',
    aliases: ['استيراد', 'رفع_البيانات'],
    
    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        const author = isSlash ? interactionOrMessage.user : interactionOrMessage.author;
        const client = interactionOrMessage.client;

        if (author.id !== OWNER_ID) return;

        let attachmentUrl = null;
        let fileName = "";

        if (isSlash) {
            const file = interactionOrMessage.options.getAttachment('file');
            attachmentUrl = file.url;
            fileName = file.name;
            await interactionOrMessage.deferReply();
        } else {
            const message = interactionOrMessage;
            if (message.attachments.size === 0) return message.reply("❌ الرجاء إرفاق ملف النسخة الاحتياطية.");
            const file = message.attachments.first();
            attachmentUrl = file.url;
            fileName = file.name;
        }

        if (!fileName.endsWith('.json') && !fileName.endsWith('.gz')) {
            const err = "❌ يجب أن يكون الملف بصيغة `.json` أو `.json.gz`.";
            return isSlash ? interactionOrMessage.editReply(err) : interactionOrMessage.reply(err);
        }

        const reply = async (content) => {
            if (isSlash) return interactionOrMessage.editReply(content);
            return interactionOrMessage.reply(content);
        };

        const msg = await reply("⏳ **جاري الفحص الدقيق للملف وبدء رفع الإعدادات والبيانات...**");

        try {
            const response = await fetch(attachmentUrl);
            const arrayBuffer = await response.arrayBuffer();
            let buffer = Buffer.from(arrayBuffer);

            if (fileName.endsWith('.gz')) {
                buffer = zlib.gunzipSync(buffer);
            }

            const data = JSON.parse(buffer.toString('utf-8'));
            const db = client.sql;

            let tablesRestored = 0;
            let rowsRestored = 0;

            for (const table of Object.keys(data)) {
                const rows = data[table];
                if (rows.length === 0) continue;

                // 1. التأكد من وجود الجدول في القاعدة الجديدة وجلب العواميد الصحيحة فقط
                let tableColsRes;
                try {
                    tableColsRes = await db.query(`SELECT column_name FROM information_schema.columns WHERE table_name = $1`, [table]);
                } catch(e) { continue; }

                if (tableColsRes.rows.length === 0) continue; // الجدول غير موجود أساساً
                
                const validColumns = tableColsRes.rows.map(r => r.column_name);

                // 2. تنظيف الجدول لتهيئته
                await db.query(`TRUNCATE TABLE "${table}" CASCADE`).catch(() => {});

                let tableSuccess = false;

                // 3. إدخال البيانات سطراً بسطر مع فلترة العواميد الخربانة
                for (const row of rows) {
                    // نأخذ فقط العواميد الموجودة فعلياً في القاعدة الجديدة
                    const rowCols = Object.keys(row).filter(c => validColumns.includes(c));
                    if (rowCols.length === 0) continue;

                    const colsStr = rowCols.map(c => `"${c}"`).join(', ');
                    const placeholders = rowCols.map((_, i) => `$${i + 1}`).join(', ');
                    const values = rowCols.map(c => row[c]);

                    try {
                        await db.query(`INSERT INTO "${table}" (${colsStr}) VALUES (${placeholders})`, values);
                        rowsRestored++;
                        tableSuccess = true;
                    } catch (e) {
                        // يتم تجاهل الخطأ في سطر واحد عشان ما يخرب باقي الجدول (عزل الأخطاء)
                        console.log(`[Import Warning] Skipped a row in ${table}: ${e.message}`);
                    }
                }
                
                if (tableSuccess) tablesRestored++;
            }

            await reply(`✅ **اكتملت المهمة يا إمبراطور!**\nتم رفع الإعدادات وكل شيء! استعدنا **${rowsRestored.toLocaleString()}** سجل في **${tablesRestored}** جداول بنجاح تام.`);

        } catch (error) {
            console.error("Import DB Error:", error);
            await reply("❌ حدث خطأ أثناء رفع البيانات. تأكد من أن الملف سليم.");
        }
    }
};
