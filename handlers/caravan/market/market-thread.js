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

// 👑 تحديث: استدعاء الدالة السحرية للصور 👑
const { updateMarketMessage } = require('./market-ui');
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

        // 👑 إنشاء الثريد (السوق)
        const thread = await channel.threads.create({
            name: `🏪 سوق-${dest.name.replace(/ /g, '-')}`,
            autoArchiveDuration: 1440,
            type: ChannelType.PublicThread,
            reason: `سوق القافلة - ${dest.name}`,
        }).catch(err => {
            console.error('[CreateThread Error]', err);
            return null;
        });

        if (!thread) return null;

        // 👑 حساب مدة بقاء السوق مفتوح (مربوطة بمدة الرحلة الأساسية)
        const durationMs = Number(caravan.endtime || caravan.endTime) - Number(caravan.starttime || caravan.startTime);
        const marketDurationMs = Math.max(
            10 * 60 * 1000, // أقل مدة 10 دقائق
            Math.min(durationMs, 24 * 60 * 60 * 1000) // أقصى مدة 24 ساعة
        );

        await createMarketSession(db, caravanId, ownerId, guildId, destId, thread.id, channel.id, marketDurationMs);

        const listings = await getListingsBySession(db, thread.id);

        // 👑 إعلان وصول القافلة وافتتاح السوق
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
            // 👑 استخدام نظام الصور الجديد اللي صممناه 👑
            await updateMarketMessage(thread, listings, dest);
        }

        // تشغيل الذكاء الاصطناعي (البوتات تشتري)
        scheduleNpcSpawn(client, db, thread, dest, ownerId, guildId, marketDurationMs);

        // إعداد مؤقت لإغلاق السوق عند انتهاء الوقت
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
                // إعادة البضائع غير المباعة إلى عربة القافلة (caravan_staging_market)
                const returned = await returnUnsoldItems(db, session.ownerid || session.ownerID, guildId);

                // إرسال رسالة ملخص المبيعات
                if (returned.length > 0) {
                    const summary = returned.map(r => `${r.quantity}x ${r.name}`).join('\n');
                    await thread.send({
                        embeds: [new EmbedBuilder()
                            .setColor('#FF9900')
                            .setTitle('⏳ انتهى وقت السوق!')
                            .setDescription(
                                `🛒 تمت إعادة البضائع غير المباعة إلى **عربة القافلة** تلقائياً:\n${summary}\n\n` +
                                `*(ستكون جاهزة بأسعارها في رحلتك القادمة)*\n\n` +
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

                // قفل الشات وأرشفته
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
    // تشغيل الفاحص كل دقيقة للتأكد من إغلاق الأسواق المنتهية
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
