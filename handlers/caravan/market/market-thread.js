const {
    ChannelType, AttachmentBuilder, EmbedBuilder
} = require('discord.js');
const { safeQuery, safeExecute } = require('../db');
const { caravanConfig } = require('../config');
const {
    createMarketSession,
    closeSession,
    returnUnsoldItems,
    getSessionByThread,
    getListingsBySession,
    getSessionByCaravan,
} = require('./market-db');

const { updateMarketMessage } = require('./market-ui');
const { scheduleNpcSpawn } = require('./market-npc-ai');
const { generateMarketSummaryCanvas } = require('../../../generators/caravan/market-summary-generator');
const { resolveItemInfo } = require('./market-setup');

const activeTimers = new Map(); // kept for backwards compat

async function createMarketThread(client, db, caravan, channelId) {
    try {
        const ownerId = caravan.userid || caravan.userID;
        const guildId = caravan.guildid || caravan.guildID;
        const destId = caravan.destinationid || caravan.destinationId;
        const caravanId = caravan.id;

        const dest = caravanConfig.destinations.find(d => d.id === destId);
        if (!dest) return null;

        let guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
        if (!guild) return null;

        let channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
        if (!channel) return null;

        let ownerName = ownerId;
        try {
            const member = await guild.members.fetch(ownerId).catch(() => null);
            ownerName = member?.displayName || member?.user?.globalName || member?.user?.username || ownerId;
        } catch {}

        const thread = await channel.threads.create({
            name: `🏪 قافلة #${ownerName}`,
            autoArchiveDuration: 1440,
            type: ChannelType.PublicThread,
            reason: `سوق القافلة - ${dest.name}`,
        }).catch(err => {
            console.error('[CreateThread Error]', err.message);
            return null;
        });

        if (!thread) return null;

        let durationMs = Number(caravan.endtime || caravan.endTime) - Number(caravan.starttime || caravan.startTime);
        if (isNaN(durationMs) || durationMs <= 0) durationMs = 30 * 60 * 1000; 
        
        const marketDurationMs = Math.max(15 * 60 * 1000, Math.min(durationMs, 24 * 60 * 60 * 1000));

        await createMarketSession(db, caravanId, ownerId, guildId, destId, thread.id, channel.id, marketDurationMs);

        const listings = await getListingsBySession(db, thread.id);

        const endTimestamp = Math.floor((Date.now() + marketDurationMs) / 1000);

        let serverIconUrl = guild.iconURL({ extension: 'png', size: 128 }) || null;

        const embed = new EmbedBuilder()
            .setColor(dest.color || '#FFD700')
            .setTitle('✥ سـوق الـقافـلـة')
            .setDescription(
                `✦ قـافـلـتـك تتجه الـى: **${dest.emoji} ${dest.name}**\n` +
                `✦ عـرضـت بـضـاعتـك للبيـع\n` +
                `✦ يستمر ترخيص متـجرك الـى:\n<t:${endTimestamp}:R>\n` +
                `✦ عدد العناصر: **${listings.length}**`
            )
            .setFooter({ text: '™ Empire | الامبراطورية', iconURL: serverIconUrl });

        const announcement = await thread.send({
            content: `✶ <@${ownerId}>`,
            embeds: [embed],
        }).catch(() => null);

        if (announcement) {
            await updateMarketMessage(thread, listings, dest);
        }

        scheduleNpcSpawn(client, db, thread, dest, ownerId, guildId, marketDurationMs);

        return { thread, marketDurationMs, listings };
    } catch (err) {
        console.error('[createMarketThread Fatal]', err);
        return null;
    }
}

async function closeMarketThread(client, db, threadId, guildId, journeyRewards = null) {
    try {
        const session = await getSessionByThread(db, threadId);
        if (!session || session.status === 'closed') return;

        const ownerId   = session.ownerid   || session.ownerID;
        const caravanId = session.caravanid || session.caravanId;

        await closeSession(db, threadId);

        // If journey rewards weren't passed (market timer fired before journey.js ran),
        // try to distribute them now if the caravan is still in 'traveling' state.
        if (!journeyRewards && caravanId) {
            try {
                const cvRow = await safeQuery(db,
                    `SELECT * FROM user_caravans WHERE "id"=$1 AND ("status"='traveling' OR status='traveling')`,
                    [caravanId]);
                const caravan = cvRow?.rows?.[0];
                if (caravan) {
                    const now = Date.now();
                    const endTime = Number(caravan.endtime || caravan.endTime || 0);
                    if (now >= endTime) {
                        const { distributeRewards } = require('../journey');
                        journeyRewards = await distributeRewards(client, db, caravan);
                    }
                }
            } catch (e) {
                console.error('[closeMarketThread] journey rewards auto-distribute error:', e?.message);
            }
        }

        const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
        if (!guild) return;

        let thread = guild.channels.cache.get(threadId);
        if (!thread) thread = await guild.channels.fetch(threadId).catch(() => null);
        if (!thread) return;

        const parentChannel = thread.parent;

        // Fetch all listings and return unsold items to inventory in parallel
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

            const itemId       = idKey    ? row[idKey]            : '?';
            const qty          = Number(qtyKey   ? row[qtyKey]   : 0);
            const quantitySold = Number(soldKey  ? row[soldKey]  : 0);
            const pricePerUnit = Number(priceKey ? row[priceKey] : 0);

            const info  = resolveItemInfo(itemId);
            const entry = {
                itemId,
                itemName:  nameKey  ? row[nameKey]  : (info.name  || itemId),
                itemEmoji: emojiKey ? row[emojiKey] : (info.emoji || '📦'),
                rarity:    info.rarity || 'Common',
                quantity:  qty,
                quantitySold,
                pricePerUnit,
            };

            if (quantitySold > 0) { soldItems.push(entry);  totalEarned += quantitySold * pricePerUnit; }
            if (qty - quantitySold > 0) unsoldItems.push(entry);
        }

        // Fetch owner display name and avatar for the report
        let ownerName = ownerId;
        let avatarUrl = null;
        try {
            const member = await guild.members.fetch(ownerId).catch(() => null);
            ownerName = member?.displayName || member?.user?.globalName || member?.user?.username || ownerId;
            avatarUrl = member?.user?.displayAvatarURL({ extension: 'png', size: 128 }) || null;
        } catch {}

        const destId   = session.destinationid || session.destinationId;
        const dest     = caravanConfig.destinations.find(d => d.id === destId);
        const destName = dest?.name || 'القافلة';

        // Generate canvas summary report
        let reportBuf = null;
        try {
            reportBuf = await generateMarketSummaryCanvas({
                destName, ownerName, avatarUrl,
                soldItems, unsoldItems, totalEarned,
                journeyRewards: journeyRewards || [],
            });
        } catch (e) {
            console.error('[closeMarketThread] canvas error:', e?.message);
        }

        // Send report to parent channel
        if (parentChannel) {
            const payload = { content: `<@${ownerId}> انتهت رحلتك إلى **${destName}** 🎉` };
            if (reportBuf) payload.files = [new AttachmentBuilder(reportBuf, { name: 'market-report.png' })];
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
        const guildId = session.guildid || session.guildID;
        
        if (threadId) {
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
    getSessionByCaravan,
};
