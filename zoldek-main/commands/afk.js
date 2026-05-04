const { EmbedBuilder, Colors } = require("discord.js");

const cooldowns = new Map();

module.exports = {
    name: 'afk',
    description: 'تفعيل وضع الغياب المؤقت',
    aliases: ['افك', 'غياب', 'مشغول'],

    async execute(message, args) {
        const userId = message.author.id;
        const now = Date.now();
        const cooldownAmount = 10 * 60 * 1000; 

        if (cooldowns.has(userId)) {
            const expirationTime = cooldowns.get(userId);
            
            if (now < expirationTime) {
                const expiredTimestamp = Math.floor(expirationTime / 1000); 
                
                const cooldownEmbed = new EmbedBuilder()
                    .setColor(Colors.Red)
                    .setDescription(`✶ غـبـت منـذ قليل .. انتظـر <t:${expiredTimestamp}:R> للتـأفيـك مجـددًا <:stop:1436337453098340442>`);

                return message.reply({ embeds: [cooldownEmbed] }).then(msg => {
                    setTimeout(() => msg.delete().catch(() => {}), 5000);
                });
            }
        }

        cooldowns.set(userId, now + cooldownAmount);
        setTimeout(() => cooldowns.delete(userId), cooldownAmount);

        const client = message.client;
        const db = client.sql;
        const guildId = message.guild.id;

        try {
            await db.query(`
                CREATE TABLE IF NOT EXISTS afk (
                    "userID" TEXT,
                    "guildID" TEXT,
                    "reason" TEXT,
                    "timestamp" BIGINT,
                    "mentionsCount" INTEGER DEFAULT 0,
                    "subscribers" TEXT DEFAULT '[]',
                    "messages" TEXT DEFAULT '[]',
                    PRIMARY KEY ("userID", "guildID")
                )
            `);
            
            await db.query(`ALTER TABLE afk ADD COLUMN IF NOT EXISTS "messages" TEXT DEFAULT '[]'`);
        } catch (e) {
            console.error("AFK Table Creation Error:", e);
        }

        const reason = args.join(" ") || "مشغـول حالياً";
        const timestamp = Math.floor(now / 1000);

        await db.query(`
            INSERT INTO afk ("userID", "guildID", "reason", "timestamp", "mentionsCount", "subscribers", "messages") 
            VALUES ($1, $2, $3, $4, 0, '[]', '[]')
            ON CONFLICT ("userID", "guildID") DO UPDATE SET 
            "reason" = EXCLUDED."reason",
            "timestamp" = EXCLUDED."timestamp",
            "mentionsCount" = 0,
            "subscribers" = '[]',
            "messages" = '[]'
        `, [userId, guildId, reason, timestamp]);

        try {
            const oldName = message.member.displayName;
            if (!oldName.includes("[AFK]")) {
                const newName = `[AFK] ${oldName}`.substring(0, 32);
                await message.member.setNickname(newName).catch(() => {});
            }
        } catch (e) {}

        const embed = new EmbedBuilder()
            .setColor("Random")
            .setTitle('✶ غـيـاب مؤقـت')
            .setThumbnail(message.author.displayAvatarURL())
            .setDescription(`💤 **تم تفعيل وضع الغيـاب المؤقـت بنجاح**\n\n📝 **السبب:** ${reason}`);

        message.reply({ embeds: [embed] }).then(msg => {
            setTimeout(() => msg.delete().catch(() => {}), 20000);
        });
    }
};
