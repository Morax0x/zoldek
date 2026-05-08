const { EmbedBuilder, ChannelType } = require('discord.js');
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

        const thread = await channel.threads.create({
            name: `🏪 سوق-${dest.name.replace(/ /g, '-')}`,
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
        }, marketDurationMs);

        activeTimers.set(thread.id, timer);

        return { thread, marketDurationMs, listings };
    } catch (err) {
        console.error('[createMarketThread Fatal]', err);
        return null;
    }
}

async function closeMarketThread(client, db, threadId, guildId) {
    try {
        const session = await getSessionByThread(db, threadId);
        if (!session || session.status === 'closed') return;

        await closeSession(db, threadId);

        const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
        if (!guild) return;

        const parentChannelId = session.channelid || session.channelId;
        const parentChannel = guild.channels.cache.get(parentChannelId) || await guild.channels.fetch(parentChannelId).catch(() => null);
        
        const thread = guild.channels.cache.get(threadId) || await guild.channels.fetch(threadId).catch(() => null);
        
        const ownerId = session.ownerid || session.ownerID;
        const returned = await returnUnsoldItems(db, ownerId, guildId);

        let embedDesc = '';
        if (returned.length > 0) {
            const summary = returned.map(r => `\`${r.quantity}x\` ${r.name}`).join('\n');
            embedDesc = `🛒 **البضائع المتبقية (عادت للسلة الدائمة):**\n${summary}\n\n`;
        } else {
            embedDesc = `🎉 **تم بيع جميع البضائع بالكامل!** لا يوجد بضائع متبقية.\n\n`;
        }

        embedDesc += `📊 **ملخص المبيعات النهائي:**\n` +
                     `• عمليات البيع: **${session.totalsales || session.totalSales || 0}**\n` +
                     `• الإيرادات: **${(session.totalrevenue || session.totalRevenue || 0).toLocaleString()}** ${EMOJI_MORA}`;

        const summaryEmbed = new EmbedBuilder()
            .setColor(returned.length > 0 ? '#FF9900' : '#2ECC71')
            .setTitle('⏳ انتهى وقت السوق وتم إغلاقه!')
            .setDescription(embedDesc)
            .setTimestamp();

        // إرسال التقرير في الروم الأساسية
        if (parentChannel) {
            await parentChannel.send({
                content: `🔔 إشعار إغلاق السوق لـ <@${ownerId}>:`,
                embeds: [summaryEmbed]
            }).catch(() => {});
        }

        // 👑 أرشفة الثريد وإغلاقه بدلاً من حذفه (لكي يبقى كسجل للمبيعات والتجارة) 👑
        if (thread) {
            await thread.setLocked(true, 'انتهى وقت السوق وتم إغلاقه').catch(() => {});
            await thread.setArchived(true).catch(() => {});
        }
        
        clearTimer(threadId);

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
};
