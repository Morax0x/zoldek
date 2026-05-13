'use strict';

const {
    ActionRowBuilder, ButtonBuilder, ButtonStyle,
    StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
    ChannelType, ComponentType, MessageFlags, AttachmentBuilder, EmbedBuilder
} = require('discord.js');

const { safeQuery, safeExecute } = require('./db');
const { caravanConfig } = require('./config');
const { manageTickets } = require('../dungeon/utils.js');
const { setCaravanCooldown } = require('./tables');

const { generateAmbushAlertImage } = require('../../generators/caravan/lobby-generator');

// ─── Constants ────────────────────────────────────────────────────────────────
const LOBBY_TIMEOUT_MS = 5 * 60 * 1000;
const AMBUSH_WINDOW_MS = 10 * 60 * 1000;
const MAX_PARTY        = 3;

const CLASS_OPTIONS = [
    { v: 'Tank',     l: 'مدرع',  e: '🛡️' },
    { v: 'Priest',   l: 'كاهن',   e: '✨' },
    { v: 'Mage',     l: 'ساحر',   e: '🔮' },
    { v: 'Summoner', l: 'مستدع', e: '🐺' },
];

const R2_BASE = 'https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev';

async function hasGuardTicket(db, userId, guildId, member = null) {
    const r = await manageTickets(userId, guildId, db, 'check', member);
    return r.tickets > 0;
}

async function consumeGuardTicket(db, userId, guildId, member = null) {
    const r = await manageTickets(userId, guildId, db, 'consume', member);
    return r.success === true;
}

async function refundGuardTickets(db, userId, guildId, member = null) {
    const current = await manageTickets(userId, guildId, db, 'check', member);
    if (current.tickets < current.max) {
        const newCount = Math.min(current.max, current.tickets + 1);
        await safeExecute(db,
            `UPDATE dungeon_stats SET "tickets"=$1 WHERE "userID"=$2 AND "guildID"=$3`,
            [newCount, userId, guildId]);
    }
}

// ─── Embed Builder (مثل شكل لوبي الدانجون) ────────────────────────────────────
function buildLobbyEmbed(hostId, party, partyClasses, destConfig, isAmbush, guild) {
    const memberList = party.map((id, i) => {
        const cls = partyClasses.get(id);
        let display;
        if (i === 0) display = 'قائد القافلة 👑';
        else {
            const obj = CLASS_OPTIONS.find(c => c.v === cls);
            display = obj ? `${obj.e} ${obj.l}` : '❓';
        }
        return `\`${i+1}.\` <@${id}> — **${display}**`;
    }).join('\n');

    const folderMap = {
        'gold_city': 'gold_city',
        'magic_academy': 'academy',
        'imperial_capital': 'capital',
        'ancient_ruins': 'ancient_ruins',
        'nature_valley': 'nature_valley',
    };
    const folderName = folderMap[destConfig.id] || 'gold_city';
    const imageUrl = `${R2_BASE}/images/caravan/${folderName}.png`;
    const colorMap = {
        'gold_city': '#FFD700',
        'magic_academy': '#8A2BE2',
        'imperial_capital': '#DC143C',
        'ancient_ruins': '#CD853F',
        'nature_valley': '#228B22',
    };
    const title = isAmbush ? `⚔️ الدفاع عن القافلّة: ${destConfig.name}` : `🛡️ تأمين مسار القافلّة: ${destConfig.name}`;
    const color = isAmbush ? 0xFF4444 : (parseInt(colorMap[destConfig.id]?.replace('#', ''), 16) || 0xFFD700);
    const hostAvatar = guild?.members.cache.get(hostId)?.user.displayAvatarURL() || null;

    let desc = `**القائد:** <@${hostId}>\n**الوجهة:** ${destConfig.emoji || '📍'} ${destConfig.name}\n\n🔮 **تم فتح مسار القافلة!**\nاختر تخصصك واستعد للمعركة.\n\n👥 **الفريق:**\n${memberList}`;

    return new EmbedBuilder()
        .setTitle(title)
        .setColor(color)
        .setDescription(desc)
        .setImage(imageUrl)
        .setThumbnail(hostAvatar);
}

// ─── Shared Lobby Runner ──────────────────────────────────────────────────────
async function _runLobby(channel, hostId, guild, db, destConfig, ids, isAmbush = false) {
    const partyClasses = new Map([[hostId, 'Leader']]);
    const party        = [hostId];
    const { joinId, startId, cancelId } = ids;

    const lobbyButtons = () => new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(joinId).setLabel('انضمام').setStyle(ButtonStyle.Success).setEmoji('➕'),
        new ButtonBuilder().setCustomId(startId).setLabel('انطلاق').setStyle(ButtonStyle.Primary).setEmoji('⚔️'),
        new ButtonBuilder().setCustomId(cancelId).setLabel('إلغاء').setStyle(ButtonStyle.Danger).setEmoji('✖️')
    );

    const embed = buildLobbyEmbed(hostId, party, partyClasses, destConfig, isAmbush, guild);

    const msg = await channel.send({
        embeds: [embed],
        components: [lobbyButtons()],
    }).catch(() => null);
    if (!msg) return { ready: false, cancelled: true };

    const collector = msg.createMessageComponentCollector({
        filter: i => [joinId, startId, cancelId].includes(i.customId),
        time: LOBBY_TIMEOUT_MS,
    });

    const stopReason = await new Promise(resolve => {
        collector.on('collect', async i => {
            if (i.replied || i.deferred) return;
            try {
                if (i.customId === joinId) {
                    if (i.user.id === hostId) return i.reply({ content: '👑 أنت القائد بالفعل.', flags: [MessageFlags.Ephemeral] });
                    if (party.length >= MAX_PARTY) return i.reply({ content: '🚫 الفريق ممتلئ.', flags: [MessageFlags.Ephemeral] });
                    if (party.includes(i.user.id)) return i.reply({ content: '✅ أنت منضم بالفعل.', flags: [MessageFlags.Ephemeral] });

                    const hasTicket = await hasGuardTicket(db, i.user.id, guild.id, i.member);
                    if (!hasTicket) return i.reply({ content: '🎟️ لا تملك **تذكرة زنزانة**! احصل عليها من نظام الزنزانة أولاً.', flags: [MessageFlags.Ephemeral] });

                    const taken = Array.from(partyClasses.values()).filter(c => c !== 'Leader');
                    const opts  = CLASS_OPTIONS.filter(o => !taken.includes(o.v));
                    if (!opts.length) return i.reply({ content: '🚫 جميع التخصصات مأخوذة.', flags: [MessageFlags.Ephemeral] });

                    const selRow = new ActionRowBuilder().addComponents(
                        new StringSelectMenuBuilder().setCustomId(`${joinId}_cls`).setPlaceholder('اختر تخصصك...')
                        .addOptions(opts.map(o => new StringSelectMenuOptionBuilder().setLabel(o.l).setValue(o.v).setEmoji(o.e)))
                    );
                    const ephMsg = await i.reply({ content: '🛡️ اختر تخصصك:', components: [selRow], flags: [MessageFlags.Ephemeral], fetchReply: true });
                    const sel = await ephMsg.awaitMessageComponent({ filter: x => x.user.id === i.user.id, time: 20000, componentType: ComponentType.StringSelect }).catch(() => null);
                    if (!sel) {
                        await i.editReply({ content: '⏰ انتهى الوقت.', components: [] }).catch(()=>{});
                        return;
                    }

                    await sel.deferUpdate().catch(()=>{});
                    const chosen = sel.values[0];
                    if (Array.from(partyClasses.values()).includes(chosen)) return sel.editReply({ content: '🚫 هذا التخصص أُخذ من شخص آخر!', components: [] }).catch(()=>{});

                    const consumed = await consumeGuardTicket(db, i.user.id, guild.id, i.member);
                    if (!consumed) return sel.editReply({ content: '❌ فشل خصم التذكرة!', components: [] }).catch(()=>{});

                    partyClasses.set(i.user.id, chosen);
                    party.push(i.user.id);
                    await sel.editReply({ content: `✅ انضممت كـ **${chosen}**`, components: [] }).catch(()=>{});
                    const updatedEmbed = buildLobbyEmbed(hostId, party, partyClasses, destConfig, isAmbush, guild);
                    await msg.edit({ embeds: [updatedEmbed] }).catch(()=>{});

                } else if (i.customId === startId) {
                    if (i.user.id !== hostId) return i.reply({ content: '⛔ القائد فقط.', flags: [MessageFlags.Ephemeral] });
                    await i.deferUpdate().catch(()=>{});
                    collector.stop('start');
                } else if (i.customId === cancelId) {
                    if (i.user.id !== hostId) return i.reply({ content: '⛔ القائد فقط.', flags: [MessageFlags.Ephemeral] });
                    await i.deferUpdate().catch(()=>{});
                    collector.stop('cancel');
                }
            } catch (err) { console.error('[CaravanLobby collect]', err); }
        });
        collector.on('end', (_, r) => resolve(r));
    });

    if (stopReason !== 'start') {
        await msg.edit({ content: '❌ اللوبي انتهى أو أُلغي.', embeds: [], files: [], components: [] }).catch(() => {});
        for (const uid of party) {
            if (uid !== hostId) await refundGuardTickets(db, uid, guild.id, null).catch(() => {});
        }
        return { ready: false, cancelled: stopReason === 'cancel', party, partyClasses };
    }

    await msg.edit({ content: '✅ الفريق جاهز! جاري فتح ساحة المعركة...', embeds: [], files: [], components: [] }).catch(() => {});

    let thread;
    try {
        const threadName = isAmbush ? `⚔️-دفاع-عن-القافلة` : `🛡️-تأمين-${(destConfig?.name || 'رحلة').replace(/ /g, '-')}`;
        thread = await channel.threads.create({ name: threadName, autoArchiveDuration: 60, type: ChannelType.PublicThread });
        for (const uid of party) await thread.members.add(uid).catch(() => {});
        await thread.send(isAmbush ? '⚔️ **قطاع الطرق شنوا هجومهم! قاتلوا لإنقاذ القافلة!**' : '🔔 **الطريق محفوف بالمخاطر! صفّوا 5 موجات لإيصال القافلة بسلام.**').catch(() => {});
    } catch (err) { console.error('[CaravanLobby thread]', err); return { ready: false, cancelled: false, party, partyClasses }; }

    return { ready: true, party, partyClasses, thread };
}

// ─── Direct Escort Lobby ──────────────────────────────────────────────────────
async function startEscortLobby(channel, host, guild, db, destConfig) {
    return _runLobby(channel, host.id, guild, db, destConfig, { joinId: 'cvl_join', startId: 'cvl_start', cancelId: 'cvl_cancel' }, false);
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

    const buffer = await generateAmbushAlertImage(dest);
    const attachment = new AttachmentBuilder(buffer, { name: 'ambush_alert.png' });

    const initialRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`cv_amb_guard_${caravanId}`).setLabel('🛡️حمايـة القافلـة').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`cv_amb_bribe_${caravanId}`).setLabel('💰 دفع رشوة').setStyle(ButtonStyle.Danger)
    );

    let attackMsg;
    try {
        attackMsg = await channel.send({ content: `🚨 <@${userId}> **القافلة تتعرض لكمين! لديك 30 دقيقة للرد!**`, files: [attachment], embeds: [], components: [initialRow] });
    } catch { return; }

    await safeExecute(db, `UPDATE user_caravans SET "guardMessageId"=$1,"attackChannelId"=$2 WHERE "id"=$3`, [attackMsg.id, casinoId, caravanId]);
    if (!client.caravanAttackCollectors) client.caravanAttackCollectors = new Map();

    const collector = attackMsg.createMessageComponentCollector({ filter: i => i.customId === `cv_amb_guard_${caravanId}` || i.customId === `cv_amb_bribe_${caravanId}`, time: AMBUSH_WINDOW_MS, max: 1 });
    client.caravanAttackCollectors.set(String(caravanId), collector);

    collector.on('collect', async interaction => {
        if (interaction.customId === `cv_amb_bribe_${caravanId}`) {
            if (interaction.user.id !== userId) return interaction.reply({ content: '⛔ فقط مالك القافلة يستطيع الرشوة!', flags: [MessageFlags.Ephemeral] });
            await interaction.deferUpdate().catch(() => {});
            const { stagingLootItems } = require('./market/market-db');
            const looted = await stagingLootItems(db, userId, guildId, caravanConfig.attack.market_loot_bribe || 0.50);
            const lootNotice = looted.length ? `\n💀 نُهبت ${looted.length} بضاعة من سلتك!` : '';
            await safeExecute(db, `UPDATE user_caravans SET "attackResolved"=1 WHERE "id"=$1`, [caravanId]);
            const remaining = Math.ceil((Number(caravan.endtime || caravan.endTime || 0) - Date.now()) / 60000);
            await attackMsg.edit({ content: `💰 <@${userId}> دفعت الرشوة! قطاع الطرق أخذوا حصتهم من بضائعك.${lootNotice}\n✅ تستمر رحلتك إلى **${dest?.name || 'الوجهة'}** وستصل بعد ${Math.max(1, remaining)} دقيقة.`, embeds: [], files: [], components: [] }).catch(() => {});
            collector.stop('bribed');
            return;
        }

        await interaction.deferUpdate().catch(() => {});
        await attackMsg.edit({ content: `🛡️ <@${userId}> طلب الفزعة!\nجاري تنظيم الحراسة... `, embeds: [], files: [], components: [] }).catch(() => {});

        const lobbyResult = await _runLobby(channel, userId, guild, db, dest, { joinId: `cva_join_${caravanId}`, startId: `cva_start_${caravanId}`, cancelId: `cva_cancel_${caravanId}` }, true);

        if (!lobbyResult.ready) {
            await safeExecute(db, `DELETE FROM user_caravans WHERE "id"=$1`, [caravanId]);
            // تنظيف بيانات السوق المرتبطة بالقافلة المدمرة
            await safeExecute(db, `UPDATE caravan_market_listings SET "status"='returned' WHERE "caravanId"=$1 AND "status"='active'`, [caravanId]).catch(() => {});
            await safeExecute(db, `UPDATE caravan_market_sessions SET "status"='closed' WHERE "caravanId"=$1 AND "status"='open'`, [caravanId]).catch(() => {});
            await setCaravanCooldown(db, userId, guildId).catch(() => {});
            await channel.send(`💔 <@${userId}> **نُهبت قافلتك!** لم يُنظَّم دفاع في الوقت المحدد.\n⏳ كولداون ساعة واحدة قبل إرسال قافلة جديدة.`).catch(() => {});
            collector.stop('user');
            return;
        }

        client.emit('caravan_ambush_ready', { thread: lobbyResult.thread, party: lobbyResult.party, partyClasses: lobbyResult.partyClasses, guild, guildId, userId, caravanId, channel, db });
        collector.stop('user');
    });

    collector.on('end', async (_, reason) => {
        client.caravanAttackCollectors?.delete(String(caravanId));
        if (reason === 'user') return;
        const cvCheck = await safeQuery(db, `SELECT "attackResolved","endTime" FROM user_caravans WHERE "id"=$1`, [caravanId]).catch(() => ({ rows: [] }));
        if (cvCheck?.rows?.[0]?.attackResolved === 1 || cvCheck?.rows?.[0]?.attackResolved === '1') return;
        const { stagingLootItems } = require('./market/market-db');
        await stagingLootItems(db, userId, guildId, caravanConfig.attack.market_loot_defeat || 0.05);
        await safeExecute(db, `DELETE FROM user_caravans WHERE "id"=$1 AND "attackResolved"=0`, [caravanId]);
        // تنظيف بيانات السوق المرتبطة بالقافلة المدمرة
        await safeExecute(db, `UPDATE caravan_market_listings SET "status"='returned' WHERE "caravanId"=$1 AND "status"='active'`, [caravanId]).catch(() => {});
        await safeExecute(db, `UPDATE caravan_market_sessions SET "status"='closed' WHERE "caravanId"=$1 AND "status"='open'`, [caravanId]).catch(() => {});
        await setCaravanCooldown(db, userId, guildId).catch(() => {});
        await attackMsg.edit({ content: `💀 <@${userId}> انتهت المهلة! قطاع الطرق نهبوا قافلتك.\n⏳ كولداون ساعة واحدة قبل إرسال قافلة جديدة.`, embeds: [], files: [], components: [] }).catch(() => {});
    });
}

module.exports = {
    startEscortLobby, sendAmbushNotification, buildLobbyEmbed,
    CLASS_OPTIONS, LOBBY_TIMEOUT_MS, AMBUSH_WINDOW_MS, MAX_PARTY,
    refundGuardTickets,
};
