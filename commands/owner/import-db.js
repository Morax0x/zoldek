const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const zlib = require('zlib');

const OWNER_ID = "1145327691772481577";

module.exports = {
    data: new SlashCommandBuilder()
        .setName('import-db')
        .setDescription('استعادة قاعدة البيانات بذكاء مع حماية الذاكرة - للمالك فقط')
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

        const msg = await reply("⏳ **جاري الفحص ورفع البيانات وإيقاف التخزين المؤقت... الرجاء عدم استخدام البوت!**");

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

                let tableColsRes;
                try {
                    tableColsRes = await db.query(`SELECT column_name FROM information_schema.columns WHERE table_name = $1`, [table]);
                } catch(e) { continue; }

                if (tableColsRes.rows.length === 0) continue;
                
                const validColumns = tableColsRes.rows.map(r => r.column_name);
                
                const backupCols = new Set();
                rows.forEach(r => Object.keys(r).forEach(k => backupCols.add(k)));
                const targetCols = validColumns.filter(c => backupCols.has(c));
                
                if (targetCols.length === 0) continue;

                const colsStr = targetCols.map(c => `"${c}"`).join(', ');

                // 🔥 قفل الجدول بالكامل أثناء النقل عشان ما يتدخل أي لاعب يخرب البيانات 🔥
                await db.query('BEGIN');
                
                try {
                    await db.query(`TRUNCATE TABLE "${table}" CASCADE`);

                    const BATCH_SIZE = 500; 
                    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
                        const chunk = rows.slice(i, i + BATCH_SIZE);
                        let values = [];
                        let placeholdersArray = [];
                        let paramIndex = 1;

                        for (const row of chunk) {
                            let rowParams = [];
                            for (const col of targetCols) {
                                values.push(row[col] !== undefined ? row[col] : null);
                                rowParams.push(`$${paramIndex++}`);
                            }
                            placeholdersArray.push(`(${rowParams.join(', ')})`);
                        }
                        
                        await db.query(`INSERT INTO "${table}" (${colsStr}) VALUES ${placeholdersArray.join(', ')}`, values);
                        rowsRestored += chunk.length;
                    }
                    
                    await db.query('COMMIT'); // فتح الجدول
                    tablesRestored++;
                    
                } catch (e) {
                    await db.query('ROLLBACK');
                    console.log(`[Import] Fallback to single row for ${table} due to error:`, e.message);
                    
                    // نظام الحماية: إذا فشلت الحزمة، يرفع سطر بسطر
                    await db.query('BEGIN');
                    await db.query(`TRUNCATE TABLE "${table}" CASCADE`);
                    for (const row of rows) {
                        const singleValues = [];
                        const singleParams = [];
                        let sIndex = 1;
                        for (const col of targetCols) {
                            singleValues.push(row[col] !== undefined ? row[col] : null);
                            singleParams.push(`$${sIndex++}`);
                        }
                        try {
                            await db.query(`INSERT INTO "${table}" (${colsStr}) VALUES (${singleParams.join(', ')})`, singleValues);
                            rowsRestored++;
                        } catch(err) {}
                    }
                    await db.query('COMMIT');
                    tablesRestored++;
                }
            }

            // مسح الذاكرة المؤقتة من البوت
            for (const key of Object.keys(client)) {
                if (client[key] instanceof Map) client[key].clear();
            }

            await reply(`✅ **اكتملت المهمة يا إمبراطور!**\nتمت استعادة **${rowsRestored.toLocaleString()}** سجل بدقة.\n⚠️ **سيتم إعادة تشغيل البوت الآن تلقائياً لمسح الذاكرة وتثبيت البيانات...**`);
            
            // 🔥 إطفاء إجباري لمنع البوت من حفظ البيانات الخاطئة في الرام 🔥
            setTimeout(() => {
                process.exit(1); 
            }, 3000);

        } catch (error) {
            console.error("Import DB Error:", error);
            await reply("❌ حدث خطأ أثناء رفع البيانات. تأكد من أن الملف سليم.");
        }
    }
};
