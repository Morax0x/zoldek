const {
    ChannelType, AttachmentBuilder
} = require('discord.js');
const { safeQuery } = require('../db');
const { caravanConfig } = require('../config');
const {
    createMarketSession,
    closeSession,
    returnUnsoldItems,
    getSessionByThread,
    getListingsBySession,
} = require('./market-db');

const { updateMarketMessage } = require('./market-ui');
const { scheduleNpcSpawn } = require('./market-npc-ai');
const { generateMarketSummaryCanvas } = require('../../../generators/caravan/market-summary-generator');
const { resolveItemInfo } = require('./market-setup');

const activeTimers = new Map();

async function createMarketThread(client, db, caravan, channelId, sourceMessage = null) {
    try {
        const ownerId = caravan.userid || caravan.userID;
        const guildId = caravan.guildid || caravan.guildID;
        const destId = caravan.destinationid || caravan.destinationId;
        const caravanId = caravan.id;

        const dest = caravanConfig.destinations.find(d => d.id === destId);
        if (!dest) return null;

        let guild = client.guilds.cache.get(guildId);
        if (!guild) guild = await client.guilds.fetch(guildId).catch(() => null);
        if (!guild) return null;

        let channel = guild.channels.cache.get(channelId);
        if (!channel) channel = await guild.channels.fetch(channelId).catch(() => null);
        if (!channel) return null;

        const threadName = `🏪 سوق-${dest.name.replace(/ /g, '-')}`;
        const threadReason = `سوق القافلة - ${dest.name}`;

        // Create thread on arrival message if provided, otherwise standalone
        let thread;
        if (sourceMessage) {
            thread = await sourceMessage.startThread({
                name: threadName,
                autoArchiveDuration: 1440,
                reason: threadReason,
            }).catch(async (err) => {
                console.error('[CreateThread] startThread failed, trying channel.threads.create:', err?.message || err);
                return await channel.threads.create({
                    name: threadName,
                    autoArchiveDuration: 1440,
                    type: ChannelType.PublicThread,
                    reason: threadReason,
                }).catch(e2 => {
                    console.error('[CreateThread] channel.threads.create also failed:', e2?.message || e2);
                    return null;
                });
            });
        } else {
            thread = await channel.threads.create({
                name: threadName,
                autoArchiveDuration: 1440,
                type: ChannelType.PublicThread,
                reason: threadReason,
            }).catch(err => {
                console.error('[CreateThread Error]', err?.message || err);
                return null;
            });
        }

        console.log(`[CreateThread] thread=${thread?.id || null} channel=${channelId}`);
        if (!thread) return null;

        // Market duration tied to trip duration, clamped between 10 min and 24 h
        const durationMs = Number(caravan.endtime || caravan.endTime) - Number(caravan.starttime || caravan.startTime);
        const marketDurationMs = Math.max(
            10 * 60 * 1000,
            Math.min(durationMs, 24 * 60 * 60 * 1000)
        );

        await createMarketSession(db, caravanId, ownerId, guildId, destId, thread.id, channel.id, marketDurationMs);

        const listings = await getListingsBySession(db, thread.id);

        const embed = new EmbedBuilder()
            .setColor(dest.color || '#FFD700')
            .setTitle(`${dest.emoji} سوق القافلة — ${dest.name}`)
            .setDescription(
                `<@${ownerId}> وصلت قافلته إلى **${dest.name}**!\n` +
                `يمكنك الآن عرض بضائعك للبيع للاعبين الآخرين.\n\n` +
                `⏳ يبقى السوق مفتوحاً لـ **${Math.floor(marketDurationMs / 60000)} دقيقة**.\n` +
                `📦 عدد العناصر: **${listings.length}**`
            )
            .setTimestamp();

        const announcement = await thread.send({
            content: `🎉 سوق جديد مفتوح! <@${ownerId}> يعرض بضائعه للبيع!`,
            embeds: [embed],
        }).catch(() => null);

        if (announcement) {
            await updateMarketMessage(thread, listings, dest);
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

        const ownerId = session.ownerid || session.ownerID;

        await closeSession(db, threadId);

        const guild = client.guilds.cache.get(guildId);
        if (!guild) return;

        let thread = guild.channels.cache.get(threadId);
        if (!thread) thread = await guild.channels.fetch(threadId).catch(() => null);
        if (!thread) return;

        const parentChannel = thread.parent;

        // Fetch all listings and return unsold items to inventory
        const [listings] = await Promise.all([
            getListingsBySession(db, threadId),
            returnUnsoldItems(db, ownerId, guildId),
        ]);

        // Build sold/unsold arrays with item metadata
        const soldItems   = [];
        const unsoldItems = [];
        let   totalEarned = 0;

        for (const row of listings) {
            const idKey       = Object.keys(row).find(k => k.toLowerCase() === 'itemid');
            const nameKey     = Object.keys(row).find(k => k.toLowerCase() === 'itemname');
            const emojiKey    = Object.keys(row).find(k => k.toLowerCase() === 'itememoji');
            const qtyKey      = Object.keys(row).find(k => k.toLowerCase() === 'quantity');
            const soldKey     = Object.keys(row).find(k => k.toLowerCase() === 'quantitysold');
            const priceKey    = Object.keys(row).find(k => k.toLowerCase() === 'priceperunit');

            const itemId      = idKey    ? row[idKey]            : '?';
            const qty         = Number(qtyKey   ? row[qtyKey]   : 0);
            const quantitySold = Number(soldKey  ? row[soldKey]  : 0);
            const pricePerUnit = Number(priceKey ? row[priceKey] : 0);

            const info = resolveItemInfo(itemId);
            const entry = {
                itemId,
                itemName:  nameKey  ? row[nameKey]  : (info.name  || itemId),
                itemEmoji: emojiKey ? row[emojiKey] : (info.emoji || '📦'),
                rarity:    info.rarity || 'Common',
                quantity:  qty,
                quantitySold,
                pricePerUnit,
            };

            if (quantitySold > 0) {
                soldItems.push(entry);
                totalEarned += quantitySold * pricePerUnit;
            }
            if (qty - quantitySold > 0) {
                unsoldItems.push(entry);
            }
        }

        // Fetch owner display name
        let ownerName = ownerId;
        try {
            const member = await guild.members.fetch(ownerId).catch(() => null);
            ownerName = member?.displayName || member?.user?.username || ownerId;
        } catch {}

        const destId = session.destinationid || session.destinationId;
        const dest   = caravanConfig.destinations.find(d => d.id === destId);
        const destName = dest?.name || 'القافلة';

        // Generate canvas report
        let reportBuf = null;
        try {
            reportBuf = await generateMarketSummaryCanvas({ destName, ownerName, soldItems, unsoldItems, totalEarned });
        } catch (e) {
            console.error('[closeMarketThread] canvas error:', e?.message);
        }

        // Send report to parent channel
        if (parentChannel) {
            const payload = {
                content: `<@${ownerId}> انتهت جلسة سوقك في **${destName}**! 📋`,
            };
            if (reportBuf) {
                payload.files = [new AttachmentBuilder(reportBuf, { name: 'market-report.png' })];
            }
            await parentChannel.send(payload).catch(() => {});
        }

        // Delete the thread
        await thread.delete('انتهت جلسة السوق').catch(() => {});
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
