const { joinVoiceChannel } = require('@discordjs/voice');
const { ActivityType } = require('discord.js');

module.exports = async (client) => {
    const db = client.sql || client.db; // التأكد من استخدام الكائن الصحيح للـ db

    console.log("🔄 [Auto-Join] Checking saved voice channels and status...");

    try {
        // 🔥 حماية الأعمدة المزدوجة "savedStatusType" و "savedStatusText"
        const savedStatusRes = await db.query('SELECT "savedStatusType", "savedStatusText" FROM settings WHERE "savedStatusText" IS NOT NULL LIMIT 1');
        const savedStatus = savedStatusRes.rows[0];
        
        if (savedStatus) {
            const statusType = savedStatus.savedStatusType || savedStatus.savedstatustype;
            const statusText = savedStatus.savedStatusText || savedStatus.savedstatustext;

            let type = ActivityType.Playing;
            if (statusType === 'Watching') type = ActivityType.Watching;
            else if (statusType === 'Listening') type = ActivityType.Listening;
            else if (statusType === 'Streaming') type = ActivityType.Streaming;
            else if (statusType === 'Competing') type = ActivityType.Competing;
            else if (statusType === 'Custom') type = ActivityType.Custom;

            if (type === ActivityType.Custom) {
                client.user.setPresence({
                    activities: [{ name: statusText, type: type, state: statusText }],
                    status: 'online'
                });
            } else {
                client.user.setPresence({
                    activities: [{ name: statusText, type: type }],
                    status: 'online'
                });
            }
            console.log(`✅ [Status] Restored: ${statusType} ${statusText}`);
        }
    } catch (e) {
        console.error("[Auto-Join] Error restoring status:", e.message);
    }

    try {
        // 🔥 حماية الأعمدة المزدوجة "voiceChannelID"
        const settingsRes = await db.query('SELECT "guild", "voiceChannelID" FROM settings WHERE "voiceChannelID" IS NOT NULL');
        const settings = settingsRes.rows;

        for (const data of settings) {
            const guild = client.guilds.cache.get(data.guild);
            if (!guild) continue;

            const voiceChannelId = data.voiceChannelID || data.voicechannelid;
            const channel = guild.channels.cache.get(voiceChannelId);
            
            if (!channel || !channel.isVoiceBased()) {
                await db.query('UPDATE settings SET "voiceChannelID" = NULL WHERE "guild" = $1', [data.guild]);
                continue;
            }

            try {
                joinVoiceChannel({
                    channelId: channel.id,
                    guildId: guild.id,
                    adapterCreator: guild.voiceAdapterCreator,
                    selfDeaf: false,
                    selfMute: false
                });
                console.log(`✅ [Voice] Rejoined channel ${channel.name} in ${guild.name}`);
            } catch (error) {
                console.error(`❌ [Voice] Failed to join ${channel.name}:`, error.message);
            }
        }
    } catch (e) {
        console.error("[Auto-Join] Error restoring voice connection:", e.message);
    }
};
