const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const zlib = require('zlib'); 

const OWNER_ID = "1145327691772481577";

module.exports = {
    data: new SlashCommandBuilder()
        .setName('import-db')
        .setDescription('استعادة قاعدة البيانات من ملف مضغوط GZ (للمالك فقط)')
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

        const msg = await reply("⏳ **جاري قراءة الملف، فك الضغط، وبدء النقل الصاروخي للبيانات...** 🚀");

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

                // تصفير الجدول
                await db.query(`TRUNCATE TABLE "${table}" CASCADE`).catch(() => {});

                const columns = Object.keys(rows[0]);
                const colsStr = columns.map(c => `"${c}"`).join(', ');

                await db.query('BEGIN');
                try {
                    // 🔥 نظام الرفع الجماعي الصاروخي (Bulk Insert) 🔥
                    const BATCH_SIZE = 200; // نرفع كل 200 سطر دفعة واحدة
                    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
                        const batch = rows.slice(i, i + BATCH_SIZE);
                        const values = [];
                        const valueStrings = [];
                        let paramIndex = 1;

                        for (const row of batch) {
                            const rowParams = [];
                            for (const col of columns) {
                                values.push(row[col]);
                                rowParams.push(`$${paramIndex++}`);
                            }
                            valueStrings.push(`(${rowParams.join(', ')})`);
                        }

                        // إرسال الدفعة لقاعدة البيانات بضربة واحدة
                        await db.query(`INSERT INTO "${table}" (${colsStr}) VALUES ${valueStrings.join(', ')}`, values);
                        rowsRestored += batch.length;
                    }
                    
                    await db.query('COMMIT');
                    tablesRestored++;
                } catch (e) {
                    await db.query('ROLLBACK');
                    console.log(`Failed to insert into ${table}:`, e.message);
                }
            }

            await reply(`✅ **اكتملت المهمة بسرعة البرق يا إمبراطور!** ⚡\nتمت استعادة **${rowsRestored.toLocaleString()}** سجل موزعة على **${tablesRestored}** جداول بنجاح.`);

        } catch (error) {
            console.error("Import DB Error:", error);
            await reply("❌ حدث خطأ أثناء رفع البيانات. تأكد من أن الملف سليم.");
        }
    }
};
