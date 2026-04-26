const {
    SlashCommandBuilder, AttachmentBuilder, EmbedBuilder,
    ActionRowBuilder, ButtonBuilder, ButtonStyle,
    StringSelectMenuBuilder, ComponentType, MessageFlags
} = require('discord.js');

const {
    caravanConfig, initCaravanTables, getUserCaravanStats,
    getActiveCaravan, getEquippedBuffs, calcDuration, calcRiskFactor,
    sendCaravan, upgradeCaravan, setupCaravanChecker,
    safeQuery, safeExecute, EMOJI_MORA
} = require('../../handlers/caravan-core.js');

const upgradeMats = require('../../json/upgrade-materials.json');

let GEN;
try { GEN = require('../../generators/caravan-generator.js'); }
catch { GEN = {}; }

/* ─── helpers ─── */
function allItemsList() {
    const list = [];
    if (upgradeMats?.weapon_materials)
        upgradeMats.weapon_materials.forEach(r => r.materials.forEach(m => list.push({ ...m, type: 'material' })));
    if (upgradeMats?.skill_books)
        upgradeMats.skill_books.forEach(c => c.books.forEach(b => list.push({ ...b, type: 'book' })));
    return list;
}

async function getMora(db, userId, guildId) {
    try {
        const r = await db.query(`SELECT "mora" FROM levels WHERE "user"=$1 AND "guild"=$2`, [userId, guildId]);
        return Number(r.rows[0]?.mora || 0);
    } catch { return 0; }
}

/* ─── صف أزرار التنقل الرئيسية ─── */
function navRow(disabled = false) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('cv_send')   .setLabel('📤 إرسال رحلة').setStyle(ButtonStyle.Primary)   .setDisabled(disabled),
        new ButtonBuilder().setCustomId('cv_status') .setLabel('🗺️ الحالة')    .setStyle(ButtonStyle.Secondary) .setDisabled(disabled),
        new ButtonBuilder().setCustomId('cv_upgrade').setLabel('🏗️ الترقيات') .setStyle(ButtonStyle.Success)   .setDisabled(disabled),
        new ButtonBuilder().setCustomId('cv_equip')  .setLabel('🔮 التجهيز')   .setStyle(ButtonStyle.Secondary) .setDisabled(disabled),
    );
}

/* ─── إرسال canvas أو fallback ─── */
async function sendCanvas(fn, args, channel, content = '') {
    try {
        if (typeof fn !== 'function') throw new Error('no fn');
        const buf = await fn(...args);
        return { files: [new AttachmentBuilder(buf, { name: 'caravan.png' })], content };
    } catch (e) {
        return { embeds: [new EmbedBuilder().setColor('#FF4444').setDescription('⚠️ تعذّر توليد الصورة.')], content };
    }
}

/* ════════════════════════════════════════════════════
   أمر القافلة الموحّد
════════════════════════════════════════════════════ */
module.exports = {
    data: new SlashCommandBuilder()
        .setName('caravan')
        .setDescription('🐪 نظام القوافل — مركز التحكم الكامل'),

    name:     'caravan',
    aliases:  ['قافلة', 'قوافل', 'رحلة'],
    category: 'Economy',
    description: 'نظام القوافل المتكامل',

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, client, guild, user;

        if (isSlash) {
            interaction = interactionOrMessage;
            client = interaction.client; guild = interaction.guild; user = interaction.user;
            await interaction.deferReply().catch(() => {});
        } else {
            message = interactionOrMessage;
            client = message.client; guild = message.guild; user = message.author;
        }

        const db = client.sql;
        await initCaravanTables(db).catch(() => {});
        setupCaravanChecker(client, db);

        /* ─── دالة الرد ─── */
        const reply = async (payload) => {
            try {
                if (isSlash) return await interaction.editReply(payload);
                return await message.channel.send(payload);
            } catch { return null; }
        };

        /* ─── عرض Hub الرئيسي ─── */
        async function showHub(editMsg = null) {
            const [stats, active, mora] = await Promise.all([
                getUserCaravanStats(db, user.id, guild.id),
                getActiveCaravan(db, user.id, guild.id),
                getMora(db, user.id, guild.id),
            ]);
            const payload = await sendCanvas(GEN.generateCaravanHub, [user, stats, active, mora]);
            payload.components = [navRow()];
            if (editMsg) return editMsg.edit(payload).catch(() => {});
            return reply(payload);
        }

        /* ─── عرض Hub وإعداد Collector ─── */
        const hubMsg = await showHub();
        if (!hubMsg) return;

        const collector = hubMsg.createMessageComponentCollector({
            filter: i => i.user.id === user.id,
            time: 5 * 60 * 1000,
            idle: 3 * 60 * 1000,
        });

        collector.on('collect', async i => {
            await i.deferUpdate().catch(() => {});
            const id = i.customId;

            /* ══ إرسال رحلة ══ */
            if (id === 'cv_send') {
                const active = await getActiveCaravan(db, user.id, guild.id);
                if (active) {
                    await i.followUp({ content: '❌ لديك رحلة نشطة بالفعل! استخدم الحالة لمتابعتها.', flags: [MessageFlags.Ephemeral] });
                    return;
                }
                const mora = await getMora(db, user.id, guild.id);
                const stats = await getUserCaravanStats(db, user.id, guild.id);
                const payload = await sendCanvas(GEN.generateSendMap, [user, stats, mora]);

                const opts = caravanConfig.destinations.map(d => ({
                    label: d.name,
                    value: d.id,
                    description: `${d.duration_hours}س | ${d.cost.toLocaleString()} مورا | خطر ${(d.risk_factor*100).toFixed(0)}%`,
                    emoji: d.emoji.replace(/️/g,''),
                }));
                payload.components = [
                    new ActionRowBuilder().addComponents(
                        new StringSelectMenuBuilder()
                            .setCustomId('cv_dest_sel')
                            .setPlaceholder('اختر الوجهة...')
                            .addOptions(opts)
                    ),
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('cv_back').setLabel('↩️ رجوع').setStyle(ButtonStyle.Secondary)
                    ),
                ];
                await hubMsg.edit(payload).catch(() => {});
                return;
            }

            /* ══ اختيار الوجهة ══ */
            if (id === 'cv_dest_sel') {
                const destId = i.values[0];
                const dest   = caravanConfig.destinations.find(d => d.id === destId);
                const mora   = await getMora(db, user.id, guild.id);
                if (mora < dest.cost) {
                    await i.followUp({ content: `❌ تحتاج **${dest.cost.toLocaleString()}** ${EMOJI_MORA}. رصيدك: **${mora.toLocaleString()}**`, flags: [MessageFlags.Ephemeral] });
                    return;
                }
                await safeExecute(db,
                    `UPDATE levels SET "mora"=CAST(COALESCE("mora",'0') AS BIGINT)-$1 WHERE "user"=$2 AND "guild"=$3`,
                    [dest.cost, user.id, guild.id]);

                const sessionKey  = `${user.id}-${guild.id}`;
                const savedArts   = client.caravanEquip?.get(sessionKey) || [];
                const result      = await sendCaravan(db, user.id, guild.id, destId, savedArts);
                if (result.error) {
                    await i.followUp({ content: `❌ ${result.error}`, flags: [MessageFlags.Ephemeral] });
                    return;
                }
                const eta = Math.floor(result.endTime / 1000);
                const hrs = Math.floor(result.durationMs / 3600000);
                const mns = Math.floor((result.durationMs % 3600000) / 60000);
                await i.followUp({
                    embeds: [new EmbedBuilder()
                        .setColor(dest.color || '#00FF88')
                        .setTitle(`🐪 انطلقت إلى ${dest.emoji} ${dest.name}!`)
                        .setDescription(`⏱ **المدة:** ${hrs}س ${mns}د\n📅 **الوصول:** <t:${eta}:R>\n⚠️ **الخطر:** ${(result.riskFactor*100).toFixed(0)}%`)
                    ],
                    flags: [MessageFlags.Ephemeral],
                }).catch(() => {});
                await showHub(hubMsg);
                return;
            }

            /* ══ حالة الرحلة ══ */
            if (id === 'cv_status') {
                const active = await getActiveCaravan(db, user.id, guild.id);
                if (!active) {
                    await i.followUp({ content: '📭 لا توجد رحلة نشطة حالياً.', flags: [MessageFlags.Ephemeral] });
                    return;
                }
                const destId = active.destinationid || active.destinationId;
                const dest   = caravanConfig.destinations.find(d => d.id === destId) || {};
                const stats  = await getUserCaravanStats(db, user.id, guild.id);
                const payload = await sendCanvas(GEN.generateCaravanStatus, [user, active, stats, dest]);
                payload.components = [
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('cv_back').setLabel('↩️ رجوع').setStyle(ButtonStyle.Secondary)
                    ),
                ];
                await hubMsg.edit(payload).catch(() => {});
                return;
            }

            /* ══ الترقيات ══ */
            if (id === 'cv_upgrade') {
                const [stats, mora] = await Promise.all([
                    getUserCaravanStats(db, user.id, guild.id),
                    getMora(db, user.id, guild.id),
                ]);
                const payload = await sendCanvas(GEN.generateUpgradePanel, [user, stats, mora]);

                const opts = Object.entries(caravanConfig.upgrades).map(([key, cfg]) => {
                    const rank  = Number(stats[`${key}_rank`] || 1);
                    const maxed = rank >= cfg.max_level;
                    const cost  = maxed ? 0 : cfg.costs[rank];
                    return {
                        label:       `${cfg.name} — لv.${rank}${maxed?' (الأقصى)':''}`,
                        value:       key,
                        description: maxed ? 'وصلت للحد الأقصى' : `التكلفة: ${cost.toLocaleString()} مورا`,
                        emoji:       cfg.emoji,
                    };
                });
                payload.components = [
                    new ActionRowBuilder().addComponents(
                        new StringSelectMenuBuilder()
                            .setCustomId('cv_upg_sel')
                            .setPlaceholder('اختر نوع الترقية...')
                            .addOptions(opts)
                    ),
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('cv_back').setLabel('↩️ رجوع').setStyle(ButtonStyle.Secondary)
                    ),
                ];
                await hubMsg.edit(payload).catch(() => {});
                return;
            }

            /* ══ تنفيذ ترقية ══ */
            if (id === 'cv_upg_sel') {
                const result = await upgradeCaravan(db, user.id, guild.id, i.values[0]);
                if (result.error) {
                    await i.followUp({ content: `❌ ${result.error}`, flags: [MessageFlags.Ephemeral] });
                } else {
                    await i.followUp({
                        embeds: [new EmbedBuilder()
                            .setColor('#00FF88')
                            .setDescription(`✅ ${result.upgCfg.emoji} **${result.upgCfg.name}** → لv.**${result.newLevel}** | خُصم **${result.cost.toLocaleString()}** ${EMOJI_MORA}`)
                        ],
                        flags: [MessageFlags.Ephemeral],
                    }).catch(() => {});
                }
                /* تحديث لوحة الترقية مجدداً */
                const [stats2, mora2] = await Promise.all([
                    getUserCaravanStats(db, user.id, guild.id),
                    getMora(db, user.id, guild.id),
                ]);
                const payload2 = await sendCanvas(GEN.generateUpgradePanel, [user, stats2, mora2]);
                const opts2 = Object.entries(caravanConfig.upgrades).map(([key, cfg]) => {
                    const rank  = Number(stats2[`${key}_rank`] || 1);
                    const maxed = rank >= cfg.max_level;
                    const cost  = maxed ? 0 : cfg.costs[rank];
                    return {
                        label:       `${cfg.name} — لv.${rank}${maxed?' (الأقصى)':''}`,
                        value:       key,
                        description: maxed ? 'وصلت للحد الأقصى' : `التكلفة: ${cost.toLocaleString()} مورا`,
                        emoji:       cfg.emoji,
                    };
                });
                payload2.components = [
                    new ActionRowBuilder().addComponents(
                        new StringSelectMenuBuilder().setCustomId('cv_upg_sel').setPlaceholder('اختر نوع الترقية...').addOptions(opts2)
                    ),
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('cv_back').setLabel('↩️ رجوع').setStyle(ButtonStyle.Secondary)
                    ),
                ];
                await hubMsg.edit(payload2).catch(() => {});
                return;
            }

            /* ══ التجهيز ══ */
            if (id === 'cv_equip') {
                const active = await getActiveCaravan(db, user.id, guild.id);
                if (active) {
                    await i.followUp({ content: '❌ لا يمكن تغيير الأدوات أثناء رحلة نشطة.', flags: [MessageFlags.Ephemeral] });
                    return;
                }
                const invRes = await safeQuery(db,
                    `SELECT "itemID","quantity" FROM user_inventory WHERE "userID"=$1 AND "guildID"=$2 AND "quantity">0`,
                    [user.id, guild.id]);
                if (!invRes.rows.length) {
                    await i.followUp({ content: '📦 مخزنك فارغ! احصل على أدوات عبر `/gacha`.', flags: [MessageFlags.Ephemeral] });
                    return;
                }
                const allItems  = allItemsList();
                const sessionKey = `${user.id}-${guild.id}`;
                if (!client.caravanEquip) client.caravanEquip = new Map();
                const equipped  = client.caravanEquip.get(sessionKey) || [];
                const mora      = await getMora(db, user.id, guild.id);
                const payload   = await sendCanvas(GEN.generateEquipPanel, [user, equipped, invRes.rows, allItems, mora]);

                const opts = invRes.rows.slice(0, 25).map(row => {
                    const id2  = row.itemid || row.itemID;
                    const item = allItems.find(x => x.id === id2);
                    const isEq = equipped.includes(id2);
                    return {
                        label:       (item?.name || id2).substring(0, 25),
                        value:       id2,
                        description: `${item?.rarity||'?'} — ${isEq ? '✅ مجهّز' : 'غير مجهّز'}`,
                        emoji:       isEq ? '✅' : '📦',
                    };
                });
                payload.components = [
                    new ActionRowBuilder().addComponents(
                        new StringSelectMenuBuilder()
                            .setCustomId('cv_eq_sel')
                            .setPlaceholder('اختر أداة للتبديل...')
                            .addOptions(opts)
                    ),
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('cv_back').setLabel('↩️ رجوع').setStyle(ButtonStyle.Secondary)
                    ),
                ];
                await hubMsg.edit(payload).catch(() => {});
                return;
            }

            /* ══ تبديل أداة ══ */
            if (id === 'cv_eq_sel') {
                const sessionKey = `${user.id}-${guild.id}`;
                const current    = client.caravanEquip?.get(sessionKey) || [];
                const itemId     = i.values[0];
                let updated;
                if (current.includes(itemId)) {
                    updated = current.filter(x => x !== itemId);
                } else if (current.length >= 3) {
                    await i.followUp({ content: '❌ الحد الأقصى 3 أدوات. أزل أداة أولاً.', flags: [MessageFlags.Ephemeral] });
                    return;
                } else {
                    updated = [...current, itemId];
                }
                if (!client.caravanEquip) client.caravanEquip = new Map();
                client.caravanEquip.set(sessionKey, updated);

                /* تحديث لوحة التجهيز */
                const invRes2   = await safeQuery(db,
                    `SELECT "itemID","quantity" FROM user_inventory WHERE "userID"=$1 AND "guildID"=$2 AND "quantity">0`,
                    [user.id, guild.id]);
                const allItems2 = allItemsList();
                const mora2     = await getMora(db, user.id, guild.id);
                const payload2  = await sendCanvas(GEN.generateEquipPanel, [user, updated, invRes2.rows, allItems2, mora2]);
                const opts2 = invRes2.rows.slice(0, 25).map(row => {
                    const id2  = row.itemid || row.itemID;
                    const item = allItems2.find(x => x.id === id2);
                    const isEq = updated.includes(id2);
                    return {
                        label:       (item?.name || id2).substring(0, 25),
                        value:       id2,
                        description: `${item?.rarity||'?'} — ${isEq ? '✅ مجهّز' : 'غير مجهّز'}`,
                        emoji:       isEq ? '✅' : '📦',
                    };
                });
                payload2.components = [
                    new ActionRowBuilder().addComponents(
                        new StringSelectMenuBuilder().setCustomId('cv_eq_sel').setPlaceholder('اختر أداة للتبديل...').addOptions(opts2)
                    ),
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('cv_back').setLabel('↩️ رجوع').setStyle(ButtonStyle.Secondary)
                    ),
                ];
                await hubMsg.edit(payload2).catch(() => {});
                return;
            }

            /* ══ رجوع للـ Hub ══ */
            if (id === 'cv_back') {
                await showHub(hubMsg);
                return;
            }
        });

        collector.on('end', async () => {
            await hubMsg.edit({ components: [navRow(true)] }).catch(() => {});
        });
    }
};
