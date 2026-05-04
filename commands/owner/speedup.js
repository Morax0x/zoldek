module.exports = {
    name: 'speedup',
    aliases: ['تسريع', 'فهرس'],
    category: 'Owner',
    description: 'إنشاء فهارس (Indexes) لتسريع قاعدة البيانات وجعل البوت كالصاروخ',
    
    async execute(message, args) {
        // حماية: الأمر للمالك فقط
        const OWNER_ID = "1145327691772481577"; 
        if (message.author.id !== OWNER_ID) return;

        const db = message.client.sql;
        if (!db) return message.reply("❌ **قاعدة البيانات غير متصلة.**");

        const msg = await message.reply("⏳ **جاري حقن طاقة السرعة في قاعدة البيانات... يرجى الانتظار.**");

        try {
            // تنفيذ أوامر تسريع قاعدة البيانات من خلال البوت مباشرة
            await db.query(`CREATE INDEX IF NOT EXISTS idx_levels_user_guild ON levels("user", "guild")`);
            await db.query(`CREATE INDEX IF NOT EXISTS idx_afk_user_guild ON afk("userID", "guildID")`);
            await db.query(`CREATE INDEX IF NOT EXISTS idx_auto_responses_guild_trigger ON auto_responses("guildID", "trigger")`);
            await db.query(`CREATE INDEX IF NOT EXISTS idx_daily_stats_id ON user_daily_stats("id")`);
            await db.query(`CREATE INDEX IF NOT EXISTS idx_ai_usage_userid ON ai_user_usage("userID")`);

            await msg.edit("🚀 **تم بنجاح يا إمبراطور!**\nقاعدة البيانات الآن تمتلك (الفهارس) وتعمل بأقصى سرعة ممكنة. البوت الآن جاهز لتحمل أي ضغط.");
        } catch (err) {
            console.error("[SpeedUp Command Error]:", err);
            await msg.edit("❌ **حدث خطأ أثناء محاولة تسريع قاعدة البيانات. راجع الكونسول لمعرفة السبب.**");
        }
    }
};
