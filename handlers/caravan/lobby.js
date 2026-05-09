'use strict';

const {
    ActionRowBuilder, ButtonBuilder, ButtonStyle,
    StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
    ChannelType, ComponentType, MessageFlags, AttachmentBuilder
} = require('discord.js');
const { createCanvas, loadImage } = require('@napi-rs/canvas'); 

const { safeQuery, safeExecute } = require('./db');
const { caravanConfig } = require('./config');
const { manageTickets } = require('../dungeon/utils.js');

// ─── Constants ────────────────────────────────────────────────────────────────
const LOBBY_TIMEOUT_MS = 5 * 60 * 1000;
const AMBUSH_WINDOW_MS = 30 * 60 * 1000;
const MAX_PARTY        = 3;

const CLASS_OPTIONS = [
    { v: 'Tank',     l: 'الطليعة',  e: '🛡️' },
    { v: 'Priest',   l: 'الكاهن',   e: '✨' },
    { v: 'Mage',     l: 'الساحر',   e: '🔮' },
    { v: 'Summoner', l: 'المستدعي', e: '🐺' },
];

// ─── Ticket Helpers ───────────────────────────────────────────────────────────
async function hasGuardTicket(db, userId, guildId, member = null) {
    const r = await manageTickets(userId, guildId, db, 'check', member);
    return r.tickets > 0;
}

async function consumeGuardTicket(db, userId, guildId, member = null) {
    const r = await manageTickets(userId, guildId, db, 'consume', member);
    return r.success === true;
}

// ─── أدوات الرسم المساعدة 👑 ──────────────────────────────────────────────────
function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

async function fetchImageSafe(url) {
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const buf = await res.arrayBuffer();
        return await loadImage(Buffer.from(buf));
    } catch { return null; }
}

// 👑 1. مولد صورة إشعار الكمين (تصميم سينمائي فخم) 👑
async function generateAmbushAlertImage(dest) {
    const W = 1200, H = 500;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');
    
    // محاولة جلب صورة المدينة الحقيقية
    const bgUrl = `https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev/images/destinations/${dest.id}.png`;
    let bg = await fetchImageSafe(bgUrl);
    
    if (!bg) {
        bg = await fetchImageSafe('https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev/images/dungeon/desert_ambush.jpg');
    }

    if (bg) {
        ctx.drawImage(bg, 0, 0, W, H);
    } else {
        ctx.fillStyle = '#111'; ctx.fillRect(0, 0, W, H);
    }
    
    // تظليل أحمر داكن للإنذار
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, 'rgba(40, 0, 0, 0.85)');
    grad.addColorStop(1, 'rgba(10, 0, 0, 0.95)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    
    ctx.textAlign = 'center';
    
    ctx.fillStyle = '#E74C3C';
    ctx.font = 'bold 70px "Arial", sans-serif';
    ctx.fillText('⚔️ تحذير — القافلة تتعرض لكمين! ⚔️', W / 2, 120);
    
    ctx.fillStyle = '#F1C40F';
    ctx.font = 'bold 45px "Arial", sans-serif';
    ctx.fillText(`الوجهة: ${dest.name} ${dest.emoji}`, W / 2, 220);
    
    ctx.fillStyle = '#BDC3C7';
    ctx.font = '35px "Arial", sans-serif';
    ctx.fillText('قطاع الطرق يهاجمون القافلة! تحتاج إلى حراس للنجاة أو دفع فدية.', W / 2, 300);
    
    // صندوقين توضيحية للأزرار
    ctx.fillStyle = 'rgba(46, 204, 113, 0.15)';
    ctx.strokeStyle = '#2ECC71'; ctx.lineWidth = 3;
    rr(ctx, 150, 360, 400, 100, 15); ctx.fill(); ctx.stroke();
    
    ctx.fillStyle = '#2ECC71';
    ctx.font = 'bold 32px "Arial", sans-serif';
    ctx.fillText('🛡️ حماية القافلة', 350, 420);
    
    ctx.fillStyle = 'rgba(231, 76, 60, 0.15)';
    ctx.strokeStyle = '#E74C3C';
    rr(ctx, 650, 360, 400, 100, 15); ctx.fill(); ctx.stroke();
    
    ctx.fillStyle = '#E74C3C';
    ctx.fillText('💰 دفع الرشوة', 850, 420);
    
    return canvas.toBuffer('image/png');
}

// 👑 2. محول اللوبي لصورة (تصميم فخم يعرض الفريق) 👑
async function buildLobbyPayload(hostId, party, partyClasses, destConfig, isAmbush, guild) {
    const W = 1200, H = 550;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    const bgUrl = `https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev/images/destinations/${destConfig.id}.png`;
    const bg = await fetchImageSafe(bgUrl);
    
    if (bg) {
        ctx.drawImage(bg, 0, 0, W, H);
    } else {
        ctx.fillStyle = '#05050A'; ctx.fillRect(0, 0, W, H);
    }

    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, 'rgba(10, 15, 30, 0.85)');
    grad.addColorStop(1, 'rgba(5, 7, 15, 0.98)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = 'center';
    ctx.fillStyle = isAmbush ? '#E74C3C' : '#3498DB';
    ctx.font = 'bold 65px "Arial", sans-serif';
    ctx.fillText(isAmbush ? '⚔️ الدفاع عن القافلة ⚔️' : '🛡️ تأمين مسار القافلة 🛡️', W / 2, 100);

    ctx.fillStyle = '#F1C40F';
    ctx.font = 'bold 40px "Arial", sans-serif';
    ctx.fillText(`الوجهة: ${destConfig.name} ${destConfig.emoji}`, W / 2, 170);

    const members = await Promise.all(party.map(uid => guild.members.fetch(uid).catch(() => null)));
    
    const boxW = 340, boxH = 250, gap = 40;
    const totalW = (3 * boxW) + (2 * gap);
    const startX = (W - totalW) / 2;
    const boxY = 240;

    for (let i = 0; i < 3; i++) {
        const cx = startX + i * (boxW + gap);
        
        rr(ctx, cx, boxY, boxW, boxH, 20);
        ctx.fillStyle = 'rgba(20, 25, 35, 0.7)';
        ctx.fill();
        ctx.strokeStyle = i < party.length ? '#F1C40F' : '#555';
        ctx.lineWidth = 3;
        ctx.stroke();

        if (i < party.length) {
            const uid = party[i];
            const mem = members[i];
            const clsVal = partyClasses.get(uid);
            let clsObj = CLASS_OPTIONS.find(c => c.v === clsVal);
            if (!clsObj) clsObj = { l: 'قائد القافلة', e: '👑' };

            let avatarImg = null;
            if (mem) {
                const avaUrl = mem.user.displayAvatarURL({ extension: 'png', size: 128 });
                avatarImg = await fetchImageSafe(avaUrl);
            }

            if (avatarImg) {
                ctx.save();
                ctx.beginPath();
                ctx.arc(cx + boxW / 2, boxY + 80, 50, 0, Math.PI * 2);
                ctx.clip();
                ctx.drawImage(avatarImg, cx + boxW / 2 - 50, boxY + 30, 100, 100);
                ctx.restore();
            } else {
                ctx.fillStyle = '#555';
                ctx.beginPath();
                ctx.arc(cx + boxW / 2, boxY + 80, 50, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.fillStyle = '#FFF';
            ctx.font = 'bold 30px "Arial", sans-serif';
            ctx.fillText(mem ? (mem.displayName || mem.user.username) : 'غير معروف', cx + boxW / 2, boxY + 175);

            ctx.fillStyle = '#F1C40F';
            ctx.font = 'bold 26px "Arial", sans-serif';
            ctx.fillText(`${clsObj.e} ${clsObj.l}`, cx + boxW / 2, boxY + 220);

        } else {
            ctx.fillStyle = '#7F8C8D';
            ctx.font = 'bold 35px "Arial", sans-serif';
            ctx.fillText('➕', cx + boxW / 2, boxY + 110);
            ctx.font = '26px "Arial", sans-serif';
            ctx.fillText('بانتظار حارس...', cx + boxW / 2, boxY + 170);
        }
    }

    const buffer = canvas.toBuffer('image/png');
    return { files: [new AttachmentBuilder(buffer, { name: 'caravan_lobby.png' })], embeds: [] };
}

// ─── Shared Lobby Runner ──────────────────────────────────────────────────────
async function _runLobby(channel, hostId, guild, db, destConfig, ids, isAmbush = false) {
    const partyClasses = new Map([[hostId, 'Leader']]);
    const party        = [hostId];
    const { joinId, startId, cancelId } = ids;

    const lobbyButtons = () => new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(joinId).setLabel('انضمام كحارس').setStyle(ButtonStyle.Success).setEmoji('➕'),
        new ButtonBuilder().setCustomId(startId).setLabel('انطلاق للقتال').setStyle(ButtonStyle.Primary).setEmoji('⚔️'),
        new ButtonBuilder().setCustomId(cancelId).setLabel('إلغاء').setStyle(ButtonStyle.Danger).setEmoji('✖️')
    );

    const payload = await buildLobbyPayload(hostId, party, partyClasses, destConfig, isAmbush, guild);

    const msg = await channel.send({
        content: `<@${hostId}>`,
        ...payload,
        components: [lobbyButtons()],
    }).catch(() => null);
    if (!msg) return { ready: false, cancelled: true };

    const collector = msg.createMessageComponentCollector({
        filter: i => [joinId, startId, cancelId].includes(i.customId),
        time: LOBBY_TIMEOUT_MS,
    });

    const stopReason = await new Promise(resolve => {
        collector.on('collect', async i => {
            try {
                if (i.customId === joinId) {
                    if (i.user.id === hostId)
                        return i.reply({ content: '👑 أنت القائد بالفعل.', flags: [MessageFlags.Ephemeral] });
                    if (party.length >= MAX_PARTY)
                        return i.reply({ content: '🚫 الفريق ممتلئ.', flags: [MessageFlags.Ephemeral] });
                    if (party.includes(i.user.id))
                        return i.reply({ content: '✅ أنت منضم بالفعل.', flags: [MessageFlags.Ephemeral] });

                    const hasTicket = await hasGuardTicket(db, i.user.id, guild.id, i.member);
                    if (!hasTicket)
                        return i.reply({
                            content: '🎟️ لا تملك **تذكرة زنزانة**! احصل عليها من نظام الزنزانة أولاً.',
                            flags: [MessageFlags.Ephemeral],
                        });

                    const taken = Array.from(partyClasses.values()).filter(c => c !== 'Leader');
                    const opts  = CLASS_OPTIONS.filter(o => !taken.includes(o.v));
                    if (!opts.length)
                        return i.reply({ content: '🚫 جميع التخصصات مأخوذة.', flags: [MessageFlags.Ephemeral] });

                    const selRow = new ActionRowBuilder().addComponents(
                        new StringSelectMenuBuilder()
                            .setCustomId(`${joinId}_cls`)
                            .setPlaceholder('اختر تخصصك...')
                            .addOptions(opts.map(o =>
                                new StringSelectMenuOptionBuilder().setLabel(o.l).setValue(o.v).setEmoji(o.e)
                            ))
                    );
                    const ephMsg = await i.reply({
                        content: '🛡️ اختر تخصصك (ستُخصَم تذكرة زنزانة عند التأكيد):',
                        components: [selRow],
                        flags: [MessageFlags.Ephemeral],
                        fetchReply: true,
                    });
                    const sel = await ephMsg.awaitMessageComponent({
                        filter: x => x.user.id === i.user.id,
                        time: 20000,
                        componentType: ComponentType.StringSelect,
                    }).catch(() => null);
                    if (!sel) return;
                    await sel.deferUpdate().catch(() => {});

                    const chosen = sel.values[0];
                    if (Array.from(partyClasses.values()).includes(chosen))
                        return sel.editReply({ content: '🚫 هذا التخصص أُخذ من شخص آخر!', components: [] }).catch(() => {});

                    const consumed = await consumeGuardTicket(db, i.user.id, guild.id, i.member);
                    if (!consumed)
                        return sel.editReply({ content: '❌ فشل خصم التذكرة، يبدو أنك استخدمتها للتو!', components: [] }).catch(() => {});

                    partyClasses.set(i.user.id, chosen);
                    party.push(i.user.id);
                    await sel.editReply({ content: `✅ انضممت كـ **${chosen}** — خُصمت تذكرة زنزانة.`, components: [] }).catch(() => {});
                    
                    const updatePayload = await buildLobbyPayload(hostId, party, partyClasses, destConfig, isAmbush, guild);
                    await msg.edit({ ...updatePayload }).catch(() => {});

                } else if (i.customId === startId) {
                    if (i.user.id !== hostId)
                        return i.reply({ content: '⛔ القائد فقط يستطيع البدء.', flags: [MessageFlags.Ephemeral] });
                    await i.deferUpdate().catch(() => {});
                    collector.stop('start');

                } else if (i.customId === cancelId) {
                    if (i.user.id !== hostId)
                        return i.reply({ content: '⛔ القائد فقط يستطيع الإلغاء.', flags: [MessageFlags.Ephemeral] });
                    await i.deferUpdate().catch(() => {});
                    collector.stop('cancel');
                }
            } catch (err) { console.error('[CaravanLobby collect]', err); }
        });
        collector.on('end', (_, r) => resolve(r));
    });

    if (stopReason !== 'start') {
        await msg.edit({ content: '❌ اللوبي انتهى أو أُلغي.', embeds: [], files: [], components: [] }).catch(() => {});
        return { ready: false, cancelled: stopReason === 'cancel', party, partyClasses };
    }

    await msg.edit({ content: '✅ الفريق جاهز! جاري فتح ساحة المعركة...', embeds: [], files: [], components: [] }).catch(() => {});

    let thread;
    try {
        const threadName = isAmbush
            ? `⚔️-دفاع-عن-القافلة`
            : `🛡️-تأمين-${(destConfig?.name || 'رحلة').replace(/ /g, '-')}`;

        thread = await channel.threads.create({
            name: threadName,
            autoArchiveDuration: 60,
            type: ChannelType.PublicThread,
        });
        for (const uid of party) await thread.members.add(uid).catch(() => {});
        await thread.send(
            isAmbush
                ? '⚔️ **قطاع الطرق شنوا هجومهم! قاتلوا لإنقاذ القافلة!**'
                : '🔔 **الطريق محفوف بالمخاطر! صفّوا 5 موجات لإيصال القافلة بسلام.**'
        ).catch(() => {});
    } catch (err) {
        console.error('[CaravanLobby thread]', err);
        return { ready: false, cancelled: false, party, partyClasses };
    }

    return { ready: true, party, partyClasses, thread };
}

// ─── Direct Escort Lobby ──────────────────────────────────────────────────────
async function startEscortLobby(channel, host, guild, db, destConfig) {
    return _runLobby(channel, host.id, guild, db, destConfig, {
        joinId:   'cvl_join',
        startId:  'cvl_start',
        cancelId: 'cvl_cancel',
    }, false);
}

// ─── Surprise Ambush Notification ────────────────────────────────────────────
async function sendAmbushNotification(client, db, caravan) {
    const userId    = caravan.userid  || caravan.userID;
    const guildId   = caravan.guildid || caravan.guildID;
    const caravanId = caravan.id;
    const destId    = caravan.destinationid || caravan.destinationId;
    const dest      = caravanConfig.destinations.find(d => d.id === destId);
    if (!dest) return;

    const settingsRes = await safeQuery(db, `SELECT "casinoChannelID" FROM settings WHERE "guild"=$1`, [guildId]);
    const casinoId    = settingsRes.rows[0]?.casinochannelid || settingsRes.rows[0]?.casinoChannelID;
    if (!casinoId) return;

    const guild   = client.guilds.cache.get(guildId);
    const channel = guild?.channels.cache.get(casinoId);
    if (!channel) return;

    // 👑 استخدام الدالة الجديدة المدمجة لتوليد الصورة 👑
    const buffer = await generateAmbushAlertImage(dest);
    const attachment = new AttachmentBuilder(buffer, { name: 'ambush_alert.png' });

    const initialRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`cv_amb_guard_${caravanId}`)
            .setLabel('🛡️حمايـة القافلـة')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(`cv_amb_bribe_${caravanId}`)
            .setLabel('💰 دفع رشوة')
            .setStyle(ButtonStyle.Danger)
    );

    let attackMsg;
    try {
        attackMsg = await channel.send({ 
            content: `🚨 <@${userId}> **القافلة تتعرض لكمين! لديك 30 دقيقة للرد!**`, 
            files: [attachment], 
            embeds: [],
            components: [initialRow] 
        });
    } catch { return; }

    await safeExecute(db,
        `UPDATE user_caravans SET "guardMessageId"=$1,"attackChannelId"=$2 WHERE "id"=$3`,
        [attackMsg.id, casinoId, caravanId]);

    if (!client.caravanAttackCollectors) client.caravanAttackCollectors = new Map();

    const collector = attackMsg.createMessageComponentCollector({
        filter: i => i.customId === `cv_amb_guard_${caravanId}` || i.customId === `cv_amb_bribe_${caravanId}`,
        time: AMBUSH_WINDOW_MS,
        max: 1,
    });
    client.caravanAttackCollectors.set(String(caravanId), collector);

    collector.on('collect', async interaction => {
        if (interaction.customId === `cv_amb_bribe_${caravanId}`) {
            if (interaction.user.id !== userId)
                return interaction.reply({ content: '⛔ فقط مالك القافلة يستطيع الرشوة!', flags: [MessageFlags.Ephemeral] });

            await interaction.deferUpdate().catch(() => {});
            await safeExecute(db,
                `UPDATE user_caravans SET "attackResolved"=1,"rewardMultiplier"=0.15 WHERE "id"=$1`,
                [caravanId]);
            await attackMsg.edit({
                content: `💰 <@${userId}> دفعت الرشوة! ستصل قافلتك بـ **15%** فقط من المكافآت.`,
                embeds: [], files: [], components: [],
            }).catch(() => {});
            collector.stop('bribed');
            return;
        }

        await interaction.deferUpdate().catch(() => {});
        await attackMsg.edit({
            content: `🛡️ <@${userId}> طلب الفزعة!\nجاري تنظيم الحراسة... `,
            embeds: [], files: [], components: [],
        }).catch(() => {});

        const lobbyResult = await _runLobby(channel, userId, guild, db, dest, {
            joinId:   `cva_join_${caravanId}`,
            startId:  `cva_start_${caravanId}`,
            cancelId: `cva_cancel_${caravanId}`,
        }, true);

        if (!lobbyResult.ready) {
            await safeExecute(db, `DELETE FROM user_caravans WHERE "id"=$1`, [caravanId]);
            await channel.send(`💔 <@${userId}> **نُهبت قافلتك!** لم يُنظَّم دفاع في الوقت المحدد.`).catch(() => {});
            collector.stop('user');
            return;
        }

        client.emit('caravan_ambush_ready', {
            thread:       lobbyResult.thread,
            party:        lobbyResult.party,
            partyClasses: lobbyResult.partyClasses,
            guild,
            guildId,
            userId,
            caravanId,
            channel,
            db,
        });

        collector.stop('user');
    });

    collector.on('end', async (_, reason) => {
        client.caravanAttackCollectors?.delete(String(caravanId));
        if (reason === 'user' || reason === 'bribed') return;

        await safeExecute(db, `DELETE FROM user_caravans WHERE "id"=$1 AND "attackResolved"=0`, [caravanId]);
        await attackMsg.edit({
            content: `💀 <@${userId}> انتهت المهلة! قطاع الطرق دمروا قافلتك.`,
            embeds: [], files: [], components: [],
        }).catch(() => {});
    });
}

module.exports = {
    startEscortLobby,
    sendAmbushNotification,
    buildLobbyPayload,
    CLASS_OPTIONS,
    LOBBY_TIMEOUT_MS,
    AMBUSH_WINDOW_MS,
    MAX_PARTY,
};
