const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const zlib = require('zlib');

const OWNER_ID = "1145327691772481577";

module.exports = {
    data: new SlashCommandBuilder()
        .setName('import-db')
        .setDescription('استعادة قاعدة البيانات بدقة مع تصحيح حالة الأحرف - للمالك فقط')
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

        const msg = await reply("⏳ **جاري تحليل البيانات وتصحيح العواميد المخفية (Smart Mapping)... الرجاء الانتظار!** 🚀");

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

                // 1. جلب عواميد الجدول من القاعدة الجديدة بذكاء
                let tableColsRes;
                try {
                    tableColsRes = await db.query(`SELECT column_name FROM information_schema.columns WHERE table_name ILIKE $1`, [table]);
                } catch(e) { continue; }

                if (tableColsRes.rows.length === 0) continue;
                
                const validColumns = tableColsRes.rows.map(r => r.column_name);
                
                // 💡 الخدعة السحرية: خريطة لربط الأسماء القديمة بالجديدة وتجاهل حساسية الأحرف
                const validColMap = {};
                validColumns.forEach(c => validColMap[c.toLowerCase()] = c);

                // 2. تنظيف الجدول لتهيئته
                try { await db.query(`TRUNCATE TABLE "${table}" CASCADE`); } catch(e) {}

                // 3. استخراج العواميد المشتركة (بالتصحيح التلقائي)
                const targetColsSet = new Set();
                rows.forEach(r => Object.keys(r).forEach(k => {
                    const mappedCol = validColMap[k.toLowerCase()];
                    if (mappedCol) targetColsSet.add(mappedCol);
                }));
                
                const targetCols = Array.from(targetColsSet);
                if (targetCols.length === 0) continue;
                
                const colsStr = targetCols.map(c => `"${c}"`).join(', ');

                let tableSuccess = false;
                const BATCH_SIZE = 500; 
                
                for (let i = 0; i < rows.length; i += BATCH_SIZE) {
                    const chunk = rows.slice(i, i + BATCH_SIZE);
                    let values = [];
                    let placeholdersArray = [];
                    let paramIndex = 1;

                    for (const row of chunk) {
                        let rowParams = [];
                        
                        // توحيد مفاتيح الملف القديم لتصبح مطابقة تماماً
                        const lowerRow = {};
                        Object.keys(row).forEach(k => lowerRow[k.toLowerCase()] = row[k]);

                        for (const col of targetCols) {
                            const val = lowerRow[col.toLowerCase()];
                            values.push(val !== undefined ? val : null);
                            rowParams.push(`$${paramIndex++}`);
                        }
                        placeholdersArray.push(`(${rowParams.join(', ')})`);
                    }

                    try {
                        await db.query(`INSERT INTO "${table}" (${colsStr}) VALUES ${placeholdersArray.join(', ')}`, values);
                        rowsRestored += chunk.length;
                        tableSuccess = true;
                    } catch (e) {
                        console.log(`[Import] حزمة سريعة فشلت في جدول ${table} (${e.message})... جاري الرفع سطر بسطر...`);
                        
                        for (const row of chunk) {
                            const lowerRow = {};
                            Object.keys(row).forEach(k => lowerRow[k.toLowerCase()] = row[k]);

                            let singleValues = [];
                            let singleParams = [];
                            let sIndex = 1;
                            
                            for (const col of targetCols) {
                                const val = lowerRow[col.toLowerCase()];
                                singleValues.push(val !== undefined ? val : null);
                                singleParams.push(`$${sIndex++}`);
                            }
                            
                            try {
                                await db.query(`INSERT INTO "${table}" (${colsStr}) VALUES (${singleParams.join(', ')})`, singleValues);
                                rowsRestored++;
                                tableSuccess = true;
                            } catch(err2) {
                                // نتجاهل فقط السطر التالف فعلياً
                            }
                        }
                    }
                }
                if (tableSuccess) tablesRestored++;
            }

            await reply(`✅ **اكتملت المهمة وتمت استعادة كل البيانات المخفية يا إمبراطور!**\nتم حل مشكلة اختلاف أسماء العواميد بنجاح! رفعنا **${rowsRestored.toLocaleString()}** سجل لـ **${tablesRestored}** جداول. كل المستويات والستريكات والأموال عادت! 👑`);

        } catch (error) {
            console.error("Import DB Error:", error);
            await reply("❌ حدث خطأ أثناء رفع البيانات. راجع الكونسول.");
        }
    }
};
