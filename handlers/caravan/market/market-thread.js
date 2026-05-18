const {
    ChannelType, AttachmentBuilder, EmbedBuilder, PermissionFlagsBits
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
        if (!dest) { console.error('[CreateThread] Invalid destination:', destId); return null; }

        if (!client?.guilds) { console.error('[CreateThread] Invalid client object (no guilds property)'); return null; }

        let guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
        if (!guild) { console.error('[CreateThread] Guild not found:', guildId); return null; }

        // Ensure roles cache is populated
        if (!guild.roles?.everyone) {
            await guild.roles.fetch().catch(() => {});
        }

        let channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
        if (!channel) { console.error('[CreateThread] Channel not found:', channelId); return null; }

        let ownerName = ownerId;
        try {
            const member = await guild.members.fetch(ownerId).catch(() => null);
            ownerName = member?.displayName || member?.user?.globalName || member?.user?.username || ownerId;
        } catch {}

        // Step 1: Create the market session in DB FIRST (before creating Discord thread)
        let durationMs = Number(caravan.endtime || caravan.endTime) - Number(caravan.starttime || caravan.startTime);
        if (isNaN(durationMs) || durationMs <= 0) durationMs = 30 * 60 * 1000;
        const marketDurationMs = Math.max(15 * 60 * 1000, Math.min(durationMs, 24 * 60 * 60 * 1000));

        // Get listings BEFORE creating thread to verify we have items
        const existingListings = await getListingsByCaravanForCaravan(db, caravanId);
        console.log(`[createMarketThread] caravanId=${caravanId} pre-check listings=${existingListings.length}`);

        // Step 2: Now create the Discord thread
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

        // Set permissions safely
        await thread.members.add(ownerId).catch(() => {});
        try {
            const everyoneRole = guild.roles?.everyone;
            if (everyoneRole?.id && thread.permissionOverwrites?.set) {
                await thread.permissionOverwrites.set([
                    { id: everyoneRole.id, deny: [PermissionFlagsBits.SendMessages] },
                ]);
            }
        } catch (permErr) {
            console.error('[CreateThread] Permission overwrite failed:', permErr?.message);
        }

        // Step 3: Create market session (with thread.id now available)
        try {
            await createMarketSession(db, caravanId, ownerId, guildId, destId, thread.id, channel.id, marketDurationMs);
        } catch (sessionErr) {
            console.error('[CreateThread] Session creation failed, deleting thread:', sessionErr?.message || sessionErr);
            await thread.delete().catch(() => {});
            return null;
        }

        const listings = await getListingsBySession(db, thread.id);
        console.log(`[createMarketThread] post-session listings=${listings.length}`);

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
        }).catch(err => {
            console.error('[CreateThread] Announcement send failed:', err?.message);
            return null;
        });

        // Step 4: Send market image/buttons — with guaranteed fallback
        if (listings.length > 0) {
            try {
                console.log(`[createMarketThread] calling updateMarketMessage with ${listings.length} listings...`);
                await updateMarketMessage(thread, listings, dest);
                console.log(`[createMarketThread] updateMarketMessage done`);
            } catch (mktErr) {
                console.error('[createMarketThread] updateMarketMessage threw:', mktErr?.message || mktErr);
                // Fallback: send a simple text message so the market isn't empty
                try {
                    await thread.send({ content: `🛒 **سوق القافلة** — ${listings.length} عنصر معروض. استخدم الأزرار أدناه للشراء.` });
                } catch {}
            }
        } else {
            console.log(`[createMarketThread] No listings to display for caravan ${caravanId}`);
        }

        scheduleNpcSpawn(client, db, thread, dest, ownerId, guildId, marketDurationMs);

        return { thread, marketDurationMs, listings };
    } catch (err) {
        console.error('[createMarketThread Fatal]', err);
        return null;
    }
}

// Helper: get listings by caravanId WITHOUT requiring a session (for pre-check)
async function getListingsByCaravanForCaravan(db, caravanId) {
    const { getListingsByCaravan } = require('./market-db');
    return getListingsByCaravan(db, caravanId);
}

async function closeMarketThread(client, db, threadId, guildId, journeyRewards = null, skipReport = false) {
    try {
        const session = await getSessionByThread(db, threadId);
        if (!session || session.status === 'closed') return;

        const ownerId   = session.ownerid   || session.ownerID;
        const caravanId = session.caravanid || session.caravanId;

        // Fetch all listings BEFORE closing the session — getListingsBySession filters
        // on status='open', so it must run before closeSession changes that to 'closed'.
        const listings = await getListingsBySession(db, threadId);

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

        // Keep unsold items in staging for next trip — just mark listings as returned
        await safeExecute(db, `UPDATE caravan_market_listings SET "status"='returned' WHERE "caravanId"=$1 AND "status" IN ('active','sold_out')`, [caravanId]).catch(() => {});
        await safeExecute(db, `UPDATE caravan_market_listings SET status='returned' WHERE caravanid=$1 AND status IN ('active','sold_out')`, [caravanId]).catch(() => {});

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
        const destColor = dest?.color || '#FFD700';

        // Generate canvas summary report
        let reportBuf = null;
        try {
            reportBuf = await generateMarketSummaryCanvas({
                destName, destId, destColor, ownerName, avatarUrl,
                soldItems, unsoldItems, totalEarned,
                journeyRewards: journeyRewards || [],
            });
        } catch (e) {
            console.error('[closeMarketThread] canvas error:', e?.message);
        }

        // Send report to parent channel (skip if already sent by processCaravanReturns)
        if (!skipReport && parentChannel) {
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
