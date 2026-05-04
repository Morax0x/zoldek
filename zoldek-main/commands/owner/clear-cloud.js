const { EmbedBuilder } = require('discord.js');

const OWNER_ID = "1145327691772481577";

module.exports = {
    name: 'clear-cloud',
    aliases: ['تفريغ-السحابة'],
    description: 'مسح جميع بيانات السحابة استعداداً لهجرة جديدة.',
    category: "Owner",

    async execute(message, args) {
        if (message.author.id !== OWNER_ID) return;

        const db = message.client.sql;
        if (!db) return message.reply("❌ البوت غير متصل بقاعدة البيانات السحابية!");

        const msg = await message.reply("⚠️ **تحذير: جاري تفريغ ومسح جميع الجداول من السحابة من جذورها...**");

        try {
            // مسح كل الجداول من جذورها لكي يقوم البوت بإعادة إنشائها بالأسماء الصحيحة
            await db.query(`
                DO $$ DECLARE
                    r RECORD;
                BEGIN
                    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
                        EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.tablename) || ' CASCADE';
                    END LOOP;
                END $$;
            `);
            
            await msg.edit("✅ **تم مسح جميع الجداول من السحابة بنجاح!**\nالسحابة الآن فارغة تماماً كأنها جديدة.\n\n⚠️ **الرجاء إعادة تشغيل البوت (Restart) فوراً من اللوحة** لكي يبني الجداول بالشكل الصحيح، وبعدها استخدم أمر `-mc` براحتك!");
        } catch(e) {
            await msg.edit(`❌ **حدث خطأ أثناء التفريغ:**\n\`\`\`js\n${e.message}\n\`\`\``);
        }
    }
};
