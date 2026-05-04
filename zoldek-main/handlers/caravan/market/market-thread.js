const {
    EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
    ChannelType, MessageFlags,
} = require('discord.js');
const { safeQuery } = require('../db');
const { caravanConfig, EMOJI_MORA } = require('../config');
const {
    createMarketSession,
    closeSession,
    returnUnsoldItems,
    getSessionByThread,
    getListingsBySession,
} = require('./market-db');
const { buildMarketEmbed, buildMarketComponents } = require('./market-ui');
const { scheduleNpcSpawn } = require('./market-npc-ai');

const activeTimers = new Map();

async function createMarketThread(client, db, caravan, channelId) {
    try {
        const ownerId = caravan.userid || caravan.userID;
        const guildId = caravan.guildid || caravan.guildID;
        const destId = caravan.destinationid || caravan.destinationId;
        const caravanId = caravan.id;

        const dest = caravanConfig.destinations.find(d => d.id === destId);
        if (!dest) return null;

        const guild = client.guilds.cache.get(guildId);
        if (!guild) return null;

        const channel = guild.channels.cache.get(channelId);
        if (!channel) return null;

        const thread = await channel.threads.create({
            name: `\ud83c\udfea \u0633\u0648\u0642-${dest.name.replace(/ /g, '-')}`,
            autoArchiveDuration: 1440,
            type: ChannelType.PublicThread,
            reason: `\u0633\u0648\u0642 \u0627\u0644\u0642\u0627\u0641\u0644\u0629 - ${dest.name}`,
        });

        const durationMs = Number(caravan.endtime || caravan.endTime) - Number(caravan.starttime || caravan.startTime);
        const marketDurationMs = Math.max(
            10 * 60 * 1000,
            Math.min(durationMs, 24 * 60 * 60 * 1000)
        );

        await createMarketSession(db, caravanId, ownerId, guildId, destId, thread.id, channel.id, marketDurationMs);

        const listings = await getListingsBySession(db, thread.id);

        const embed = new EmbedBuilder()
            .setColor(dest.color || '#FFD700')
            .setTitle(`${dest.emoji} \u0633\u0648\u0642 \u0627\u0644\u0642\u0627\u0641\u0644\u0629 \u2014 ${dest.name}`)
            .setDescription(
                `<@${ownerId}> \u0648\u0635\u0644\u062a \u0642\u0627\u0641\u0644\u062a\u0647 \u0625\u0644\u0649 **${dest.name}**!\n` +
                `\u064a\u0645\u0643\u0646\u0643 \u0627\u0644\u0622\u0646 \u0639\u0631\u0636 \u0628\u0636\u0627\u0626\u0639\u0643 \u0644\u0644\u0628\u064a\u0639 \u0644\u0644\u0627\u0639\u0628\u064a\u0646 \u0627\u0644\u0622\u062e\u0631\u064a\u0646.\n\n` +
                `\u23f3 \u064a\u0628\u0642\u0649 \u0627\u0644\u0633\u0648\u0642 \u0645\u0641\u062a\u0648\u062d\u0627\u064b \u0644\u0640 **${Math.floor(marketDurationMs / 60000)} \u062f\u0642\u064a\u0642\u0629**.\n` +
                `\ud83d\udce6 \u0639\u062f\u062f \u0627\u0644\u0639\u0646\u0627\u0635\u0631: **${listings.length}**`
            )
            .setTimestamp();

        const announcement = await thread.send({
            content: `\ud83c\udf89 \u0633\u0648\u0642 \u062c\u062f\u064a\u062f \u0645\u0641\u062a\u0648\u062d! <@${ownerId}> \u064a\u0639\u0631\u0636 \u0628\u0636\u0627\u0626\u0639\u0647 \u0644\u0644\u0628\u064a\u0639!`,
            embeds: [embed],
        }).catch(() => null);

        if (announcement) {
            await thread.send({
                embeds: [await buildMarketEmbed(listings, dest)],
                components: buildMarketComponents(listings),
            }).catch(() => {});
        }

        scheduleNpcSpawn(client, db, thread, dest, ownerId, guildId, marketDurationMs);

        const timer = setTimeout(async () => {
            await closeMarketThread(client, db, thread.id, guildId);
            activeTimers.delete(thread.id);
        }, marketDurationMs);

        activeTimers.set(thread.id, timer);

        return { thread, marketDurationMs, listings };
    } catch (err) {
        console.error('[createMarketThread]', err);
        return null;
    }
}

async function closeMarketThread(client, db, threadId, guildId) {
    try {
        const session = await getSessionByThread(db, threadId);
        if (!session || session.status === 'closed') return;

        await closeSession(db, threadId);

        const guild = client.guilds.cache.get(guildId);
        if (guild) {
            const thread = guild.channels.cache.get(threadId);
            if (thread) {
                const returned = await returnUnsoldItems(db, session.ownerid || session.ownerID, guildId);

                if (returned.length > 0) {
                    const summary = returned.map(r => `${r.quantity}x ${r.name}`).join('\n');
                    await thread.send({
                        embeds: [new EmbedBuilder()
                            .setColor('#FF9900')
                            .setTitle('\u23f3 \u0627\u0646\u062a\u0647\u0649 \u0648\u0642\u062a \u0627\u0644\u0633\u0648\u0642!')
                            .setDescription(
                                `\u062a\u0645 \u0625\u0639\u0627\u062f\u0629 \u0627\u0644\u0628\u0636\u0627\u0626\u0639 \u063a\u064a\u0631 \u0627\u0644\u0645\u0628\u0627\u0639\u0629 \u0625\u0644\u0649 \u0627\u0644\u0645\u062e\u0632\u0648\u0646:\n${summary}\n\n` +
                                `\ud83d\udcca \u0645\u0644\u062e\u0635 \u0627\u0644\u0645\u0628\u064a\u0639\u0627\u062a:\n` +
                                `\u2022 \u0639\u0645\u0644\u064a\u0627\u062a \u0627\u0644\u0628\u064a\u0639: **${session.totalsales || session.totalSales || 0}**\n` +
                                `\u2022 \u0627\u0644\u0625\u064a\u0631\u0627\u062f\u0627\u062a: **${(session.totalrevenue || session.totalRevenue || 0).toLocaleString()}** ${EMOJI_MORA}`
                            )
                            .setTimestamp()]
                    }).catch(() => {});
                }

                await thread.setArchived(true).catch(() => {});
                await thread.setLocked(true).catch(() => {});
            }
        }
    } catch (err) {
        console.error('[closeMarketThread]', err);
    }
}

async function checkExpiredMarketSessions(client, db) {
    const { getExpiredSessions } = require('./market-db');
    const expired = await getExpiredSessions(db);

    for (const session of expired) {
        const threadId = session.threadid || session.threadId;
        if (threadId && !activeTimers.has(threadId)) {
            const guildId = session.guildid || session.guildID;
            await closeMarketThread(client, db, threadId, guildId);
        }
    }
}

function setupMarketChecker(client, db) {
    setInterval(() => checkExpiredMarketSessions(client, db), 60 * 1000);
}

function clearTimer(threadId) {
    const timer = activeTimers.get(threadId);
    if (timer) {
        clearTimeout(timer);
        activeTimers.delete(threadId);
    }
}

module.exports = {
    createMarketThread,
    closeMarketThread,
    checkExpiredMarketSessions,
    setupMarketChecker,
    clearTimer,
    activeTimers,
};
