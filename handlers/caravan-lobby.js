'use strict';

const {
    EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
    StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
    ChannelType, ComponentType, MessageFlags,
} = require('discord.js');

const { safeQuery, safeExecute, caravanConfig } = require('./caravan-core.js');
const { manageTickets } = require('./dungeon/utils.js');

// ─── Constants ────────────────────────────────────────────────────────────────
const LOBBY_TIMEOUT_MS = 5 * 60 * 1000;   // 5 min to fill lobby
const AMBUSH_WINDOW_MS = 30 * 60 * 1000;  // 30 min to respond to ambush
const MAX_PARTY        = 3;               // owner + 2 guards max

const CLASS_OPTIONS = [
    { v: 'Tank',     l: 'الطليعة',   e: '🛡️' },
    { v: 'Priest',   l: 'الكاهن',    e: '✨' },
    { v: 'Mage',     l: 'الساحر',    e: '🔮' },
    { v: 'Summoner', l: 'المستدعي',  e: '🐺' },
];

// ─── Ticket Helpers (mirrors tickets.js — passes member for VIP bonus calc) ──
async function hasGuardTicket(db, userId, guildId, member = null) {
    const r = await manageTickets(userId, guildId, db, 'check', member);
    return r.tickets > 0;
}

async function consumeGuardTicket(db, userId, guildId, member = null) {
    const r = await manageTickets(userId, guildId, db, 'consume', member);
    return r.success === true;
}

// ─── Lobby Embed ──────────────────────────────────────────────────────────────
function buildLobbyEmbed(hostId, party, partyClasses, destConfig, isAmbush = false) {
    const CLASS_MAP = {
        Leader: '👑 قائد', Tank: '🛡️ طليعة',
        Priest: '✨ كاهن', Mage: '🔮 ساحر', Summoner: '🐺 مستدعٍ',
    };
    const memberList = party.map((id, i) =>
        `\`${i + 1}.\` <@${id}> — **${CLASS_MAP[partyClasses.get(id)] || '?'}**`
    ).join('\n');

    const title = isAmbush
        ? '⚔️ لوبي الدفاع عن القافلة!'
        : `🛡️ لوبي تأمين القافلة — ${destConfig?.emoji || ''} ${destConfig?.name || ''}`;

    return new EmbedBuilder()
        .setColor(isAmbush ? '#FF6600' : '#FFD700')
        .setTitle(title)
        .setDescription(
            `القائد: <@${hostId}>\n` +
            `📜 قاتلوا **5 موجات** لحماية القافلة!\n\n` +
            `🎟️ **كل حارس (غير المالك) يدفع تذكرة زنزانة واحدة عند الانضمام**\n\n` +
            `👥 **الفريق (${party.length}/${MAX_PARTY}):**\n${memberList}`
        );
}

// ─── Shared Lobby Runner ──────────────────────────────────────────────────────
// Returns { ready, party, partyClasses, thread }
// ready=true  → lobby started, thread created
// ready=false → cancelled / timeout / error
async function _runLobby(channel, hostId, guild, db, destConfig, ids, isAmbush = false) {
    const partyClasses = new Map([[hostId, 'Leader']]);
    const party        = [hostId];
    const { joinId, startId, cancelId } = ids;

    const lobbyButtons = () => new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(joinId).setLabel('انضمام كحارس').setStyle(ButtonStyle.Success).setEmoji('➕'),
        new ButtonBuilder().setCustomId(startId).setLabel('انطلاق للقتال').setStyle(ButtonStyle.Primary).setEmoji('⚔️'),
        new ButtonBuilder().setCustomId(cancelId).setLabel('إلغاء').setStyle(ButtonStyle.Danger).setEmoji('✖️')
    );

    const msg = await channel.send({
        content: `<@${hostId}>`,
        embeds: [buildLobbyEmbed(hostId, party, partyClasses, destConfig, isAmbush)],
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
                // ── Join ──────────────────────────────────────────────────────
                if (i.customId === joinId) {
                    if (i.user.id === hostId)
                        return i.reply({ content: '👑 أنت القائد بالفعل.', flags: [MessageFlags.Ephemeral] });
                    if (party.length >= MAX_PARTY)
                        return i.reply({ content: '🚫 الفريق ممتلئ.', flags: [MessageFlags.Ephemeral] });
                    if (party.includes(i.user.id))
                        return i.reply({ content: '✅ أنت منضم بالفعل.', flags: [MessageFlags.Ephemeral] });

                    // Ticket check before showing class selector (pass member for VIP bonus)
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

                    // Deduct ticket on confirmed join (pass member for VIP bonus)
                    const consumed = await consumeGuardTicket(db, i.user.id, guild.id, i.member);
                    if (!consumed)
                        return sel.editReply({ content: '❌ فشل خصم التذكرة، يبدو أنك استخدمتها للتو!', components: [] }).catch(() => {});

                    partyClasses.set(i.user.id, chosen);
                    party.push(i.user.id);
                    await sel.editReply({ content: `✅ انضممت كـ **${chosen}** — خُصمت تذكرة زنزانة.`, components: [] }).catch(() => {});
                    await msg.edit({ embeds: [buildLobbyEmbed(hostId, party, partyClasses, destConfig, isAmbush)] }).catch(() => {});

                // ── Start ─────────────────────────────────────────────────────
                } else if (i.customId === startId) {
                    if (i.user.id !== hostId)
                        return i.reply({ content: '⛔ القائد فقط يستطيع البدء.', flags: [MessageFlags.Ephemeral] });
                    await i.deferUpdate().catch(() => {});
                    collector.stop('start');

                // ── Cancel ────────────────────────────────────────────────────
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
        await msg.edit({ content: '❌ اللوبي انتهى أو أُلغي.', embeds: [], components: [] }).catch(() => {});
        return { ready: false, cancelled: stopReason === 'cancel', party, partyClasses };
    }

    await msg.edit({ content: '✅ الفريق جاهز! جاري فتح ساحة المعركة...', embeds: [], components: [] }).catch(() => {});

    // Create combat thread
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
// Called from caravan.js when owner picks "تأمين الطريق"
// Returns { ready, party, partyClasses, thread }
async function startEscortLobby(channel, host, guild, db, destConfig) {
    return _runLobby(channel, host.id, guild, db, destConfig, {
        joinId:   'cvl_join',
        startId:  'cvl_start',
        cancelId: 'cvl_cancel',
    }, false);
}

// ─── Surprise Ambush Notification ────────────────────────────────────────────
// Called from caravan-core.js when a caravan is flagged for ambush.
// Bribe button vanishes the moment "طلب فزعة" is clicked.
// After lobby fills, emits 'caravan_ambush_ready' for the combat engine (Phase 2).
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

    const alertEmbed = new EmbedBuilder()
        .setColor('#FF4444')
        .setTitle('⚔️ تحذير — قافلتك تتعرض للكمين!')
        .setDescription(
            `<@${userId}>\n\n` +
            `🗺️ **الوجهة:** ${dest.emoji} ${dest.name}\n\n` +
            `قطاع الطرق يكمنون لقافلتك الآن!\n\n` +
            `🛡️ **طلب فزعة** — قاتل 5 موجات وأنقذ البضاعة كاملةً\n` +
            `*(كل حارس يدفع تذكرة زنزانة واحدة)*\n\n` +
            `💰 **دفع رشوة** — احتفظ بـ**15%** فقط من المكافآت\n\n` +
            `⏳ لديك **30 دقيقة** للرد — وإلا ستُدمَّر القافلة!`
        )
        .setTimestamp();

    // Initial row: both buttons visible
    const initialRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`cv_amb_guard_${caravanId}`)
            .setLabel('🛡️ طلب فزعة')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(`cv_amb_bribe_${caravanId}`)
            .setLabel('💰 دفع رشوة')
            .setStyle(ButtonStyle.Danger)
    );

    let attackMsg;
    try {
        attackMsg = await channel.send({ content: `<@${userId}>`, embeds: [alertEmbed], components: [initialRow] });
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
        // ── BRIBE (owner only) ─────────────────────────────────────────────
        if (interaction.customId === `cv_amb_bribe_${caravanId}`) {
            if (interaction.user.id !== userId)
                return interaction.reply({ content: '⛔ فقط مالك القافلة يستطيع الرشوة!', flags: [MessageFlags.Ephemeral] });

            await interaction.deferUpdate().catch(() => {});
            await safeExecute(db,
                `UPDATE user_caravans SET "attackResolved"=1,"rewardMultiplier"=0.15 WHERE "id"=$1`,
                [caravanId]);
            await attackMsg.edit({
                content: `💰 <@${userId}> دفعت الرشوة! ستصل قافلتك بـ **15%** فقط من المكافآت.`,
                embeds: [], components: [],
            }).catch(() => {});
            collector.stop('bribed');
            return;
        }

        // ── GUARD: bribe button vanishes immediately ────────────────────────
        await interaction.deferUpdate().catch(() => {});

        // Replace alert with status embed — NO bribe button
        await attackMsg.edit({
            embeds: [new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle('🛡️ جاري تنظيم الحراسة...')
                .setDescription(`<@${userId}> طلب الفزعة!\nاجتمع الحراس لصدّ القطاع — **التذكرة مطلوبة للانضمام**`)
            ],
            components: [],   // ← bribe button gone forever
        }).catch(() => {});

        // Open the lobby
        const lobbyResult = await _runLobby(channel, userId, guild, db, dest, {
            joinId:   `cva_join_${caravanId}`,
            startId:  `cva_start_${caravanId}`,
            cancelId: `cva_cancel_${caravanId}`,
        }, true);

        if (!lobbyResult.ready) {
            // Lobby timed out / cancelled → destroy caravan
            await safeExecute(db, `DELETE FROM user_caravans WHERE "id"=$1`, [caravanId]);
            await channel.send(`💔 <@${userId}> **نُهبت قافلتك!** لم يُنظَّم دفاع في الوقت المحدد.`).catch(() => {});
            collector.stop('user');
            return;
        }

        // Signal combat engine (Phase 2 handles 'caravan_ambush_ready')
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

        // Timeout — caravan destroyed
        await safeExecute(db, `DELETE FROM user_caravans WHERE "id"=$1 AND "attackResolved"=0`, [caravanId]);
        await attackMsg.edit({
            content: `💀 <@${userId}> انتهت المهلة! قطاع الطرق دمروا قافلتك.`,
            embeds: [], components: [],
        }).catch(() => {});
    });
}

module.exports = {
    startEscortLobby,
    sendAmbushNotification,
    buildLobbyEmbed,
    CLASS_OPTIONS,
    LOBBY_TIMEOUT_MS,
    AMBUSH_WINDOW_MS,
    MAX_PARTY,
};
