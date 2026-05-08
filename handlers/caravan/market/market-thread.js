const {
    EmbedBuilder, ChannelType
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

const { updateMarketMessage } = require('./market-ui');
const { scheduleNpcSpawn } = require('./market-npc-ai');

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
                            .setTitle('⏳ انتهى وقت السوق!')
                            .setDescription(
                                `🛒 البضائع التالية لا تزال في عربة قافلتك وستكون جاهزة في رحلتك القادمة:\n${summary}\n\n` +
                                `📊 ملخص المبيعات:\n` +
                                `• عمليات البيع: **${session.totalsales || session.totalSales || 0}**\n` +
                                `• الإيرادات: **${(session.totalrevenue || session.totalRevenue || 0).toLocaleString()}** ${EMOJI_MORA}`
                            )
                            .setTimestamp()]
                    }).catch(() => {});
                } else {
                    await thread.send({
                        embeds: [new EmbedBuilder()
                            .setColor('#2ECC71')
                            .setTitle('⏳ انتهى وقت السوق!')
                            .setDescription(
                                `🎉 تم بيع جميع البضائع بالكامل!\n\n` +
                                `📊 ملخص المبيعات:\n` +
                                `• عمليات البيع: **${session.totalsales || session.totalSales || 0}**\n` +
                                `• الإيرادات: **${(session.totalrevenue || session.totalRevenue || 0).toLocaleString()}** ${EMOJI_MORA}`
                            )
                            .setTimestamp()]
                    }).catch(() => {});
                }

                await thread.setLocked(true).catch(() => {});
                await thread.setArchived(true).catch(() => {});
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
