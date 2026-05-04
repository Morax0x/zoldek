const { Events } = require("discord.js");
const ownerReactionDelete = require("./ownerReactionDelete.js");

function getTodayDateString() { 
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date());
}

function getWeekStartDateString() {
    const ksaTime = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Riyadh" }));
    const diff = ksaTime.getDate() - (ksaTime.getDay() + 2) % 7; 
    const friday = new Date(ksaTime.setDate(diff));
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(friday);
}

module.exports = {
    name: Events.MessageReactionAdd,
    async execute(reaction, user) {
        
        try { await ownerReactionDelete.execute(reaction, user); } catch(e) {}

        if (user.bot) return;
        if (!reaction.message.guild) return;

        const client = reaction.client;
        const db = client.sql;
        
        if (!db) return;

        const guildID = reaction.message.guild.id;
        const userID = user.id;

        try {
            const dateStr = getTodayDateString();
            const weekStartDateStr = getWeekStartDateString();
            const dailyStatsId = `${userID}-${guildID}-${dateStr}`;
            const weeklyStatsId = `${userID}-${guildID}-${weekStartDateStr}`;
            const totalStatsId = `${userID}-${guildID}`;

            let boostChannelInc = 0;
            try {
                const settingsRes = await db.query(`SELECT "boostChannelID" FROM settings WHERE "guild" = $1`, [guildID]);
                const settings = settingsRes.rows[0];
                if (settings && (settings.boostChannelID || settings.boostchannelid) === reaction.message.channel.id) {
                    boostChannelInc = 1;
                }
            } catch (e) {}

            try { await db.query(`ALTER TABLE user_daily_stats ADD COLUMN IF NOT EXISTS "boost_channel_reactions" INTEGER DEFAULT 0`); } catch(e) {}

            const dRes = await db.query(`
                INSERT INTO user_daily_stats ("id", "userID", "guildID", "date", "reactions_added", "boost_channel_reactions") 
                VALUES ($1, $2, $3, $4, 1, $5) 
                ON CONFLICT("id") DO UPDATE SET 
                "reactions_added" = COALESCE(user_daily_stats."reactions_added", 0) + 1,
                "boost_channel_reactions" = COALESCE(user_daily_stats."boost_channel_reactions", 0) + $5
                RETURNING *
            `, [dailyStatsId, userID, guildID, dateStr, boostChannelInc]);

            const wRes = await db.query(`
                INSERT INTO user_weekly_stats ("id", "userID", "guildID", "weekStartDate", "reactions_added") 
                VALUES ($1, $2, $3, $4, 1) 
                ON CONFLICT("id") DO UPDATE SET 
                "reactions_added" = COALESCE(user_weekly_stats."reactions_added", 0) + 1
                RETURNING *
            `, [weeklyStatsId, userID, guildID, weekStartDateStr]);

            const tRes = await db.query(`
                INSERT INTO user_total_stats ("id", "userID", "guildID", "total_reactions_added") 
                VALUES ($1, $2, $3, 1) 
                ON CONFLICT("id") DO UPDATE SET 
                "total_reactions_added" = COALESCE(user_total_stats."total_reactions_added", 0) + 1
                RETURNING *
            `, [totalStatsId, userID, guildID]);

            const member = await reaction.message.guild.members.fetch(userID).catch(() => null);
            if (member && client.checkQuests) {
                if (dRes.rows[0]) await client.checkQuests(client, member, dRes.rows[0], 'daily', dateStr);
                if (wRes.rows[0]) await client.checkQuests(client, member, wRes.rows[0], 'weekly', weekStartDateStr);
                if (tRes.rows[0]) await client.checkAchievements(client, member, null, tRes.rows[0]);
            }

        } catch (err) {
            console.error("[Reaction Stats Error]", err);
        }
    },
};
