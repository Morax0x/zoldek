const {
    SlashCommandBuilder, AttachmentBuilder, EmbedBuilder,
    ActionRowBuilder, ButtonBuilder, ButtonStyle,
    StringSelectMenuBuilder, MessageFlags,
    ModalBuilder, TextInputBuilder, TextInputStyle
} = require('discord.js');

const { createCanvas, loadImage } = require('@napi-rs/canvas'); // 👑 استدعاء أداة الرسم للوجهات

const {
    caravanConfig, getUserCaravanStats,
    getActiveCaravan, sendCaravan, upgradeCaravan, setupCaravanChecker,
    checkCaravanCooldown, safeQuery, safeExecute, EMOJI_MORA,
    startEscortLobby, registerCombatListeners,
    showMarketSetup, handleAddItemSelect, handlePriceModalSubmit,
    handleRemoveItemSelect, finalizeListings, clearMarketListingsCache,
    getMarketListingsCache, handleBuySelect, handleBuyModalSubmit,
    handleRefresh, handleOwnerPriceChange, handlePriceChangeSelect,
    handleNewPriceModalSubmit, setupMarketChecker,
} = require('../../handlers/caravan/index.js');

const EMPEROR_ID = '1145327691772481577';

const upgradeMats = require('../../json/upgrade-materials.json');
const path = require('path');

let GEN;
try { GEN = require('../../generators/caravan-generator.js'); }
catch { GEN = {}; }

let allGameItems = [];
try {
    const shopItems = require(path.join(process.cwd(), 'json', 'shop-items.json')) || [];
    const wepItems = require(path.join(process.cwd(), 'json', 'weapons-config.json'));
    allGameItems = [...shopItems];
    if (wepItems && wepItems.weapons) {
        Object.keys(wepItems.weapons).forEach(k => {
            wepItems.weapons[k].forEach(w => allGameItems.push({ id: w.id, name: w.name, rarity: w.rarity }));
        });
    }
} catch(e) {}

function getItemNameSafe(id) {
    const itm = allGameItems.find(x => x.id === id);
    if (itm && itm.name) return itm.name;
    return String(id).replace(/_/g, ' ');
}

const RARITY_AR = {
    'Common': 'عادي',
    'Uncommon': 'شائع',
    'Rare': 'نادر',
    'Epic': 'ملحمي',
    'Legendary': 'أسطوري'
};

const R2_BASE = 'https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev';

function allItemsList() {
    const list = [];
    if (upgradeMats?.weapon_materials) {
        upgradeMats.weapon_materials.forEach(r => {
            r.materials.forEach(m => {
                const imgUrl = m.image ? `${R2_BASE}/images/materials/${m.image}` : null;
                list.push({ ...m, type: 'material', imgPath: imgUrl });
            });
        });
    }
    if (upgradeMats?.skill_books) {
        upgradeMats.skill_books.forEach(c => {
            c.books.forEach(b => {
                const imgUrl = b.image ? `${R2_BASE}/images/materials/${b.image}` : null;
                list.push({ ...b, type: 'book', imgPath: imgUrl });
            });
        });
    }
    return list;
}

async function getMora(db, userId, guildId) {
    try {
        const r = await db.query(`SELECT "mora" FROM levels WHERE "user"=$1 AND "guild"=$2`, [userId, guildId]);
        return Number(r.rows[0]?.mora || 0);
    } catch { return 0; }
}

function navRow(hasActiveCaravan = false, disabled = false) {
    const row = new ActionRowBuilder();
    
    if (!hasActiveCaravan) {
        row.addComponents(
            new ButtonBuilder().setCustomId('cv_send').setLabel('📤 إرسال رحلة').setStyle(ButtonStyle.Primary).setDisabled(disabled),
            new ButtonBuilder().setCustomId('cv_equip').setLabel('🔮 التجهيز').setStyle(ButtonStyle.Secondary).setDisabled(disabled)
        );
    } else {
        row.addComponents(
            new ButtonBuilder().setCustomId('cv_status').setLabel('🗺️ متابعة الرحلة').setStyle(ButtonStyle.Success).setDisabled(disabled)
        );
    }
    
    row.addComponents(
        new ButtonBuilder().setCustomId('cv_upgrade').setLabel('🏗️ الترقيات').setStyle(ButtonStyle.Secondary).setDisabled(disabled)
    );

    return row;
}

async function sendCanvas(fn, args, content = '') {
    try {
        if (typeof fn !== 'function') throw new Error('no fn');
        const buf = await fn(...args);
        return { files: [new AttachmentBuilder(buf, { name: 'caravan.png' })], content, embeds: [] };
    } catch (e) {
        return { content: `⚠️ تعذّر توليد الصورة إما لبطء الاتصال أو نقص في الموارد.`, embeds: [], files: [] };
    }
}

// 👑 دالة لرسم واجهة اختيار الوجهة بدون إمبيد 👑
async function generateDestChoiceImage(dest, mora) {
    const canvas = createCanvas(800, 400);
    const ctx = canvas.getContext('2d');
    
    try {
        const bg = await loadImage('https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev/images/dungeon/desert_caravan.jpg');
        ctx.drawImage(bg, 0, 0, 800, 400);
    } catch(e) {
        ctx.fillStyle = '#1c1c1e';
        ctx.fillRect(0, 0, 800, 400);
    }
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillRect(0, 0, 800, 400);
    
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillStyle = dest.color || '#FFD700';
    ctx.font = 'bold 36px "sans-serif"';
    ctx.fillText(`الانطلاق إلى ${dest.name}`, 750, 40);
    
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 26px "sans-serif"';
    ctx.fillText(`💰 التكلفة: ${dest.cost.toLocaleString()} مورا`, 750, 110);
    
    ctx.fillStyle = (mora >= dest.cost) ? '#2ECC71' : '#E74C3C';
    ctx.fillText(`💳 رصيدك الحالي: ${mora.toLocaleString()} مورا`, 750, 150);
    
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(`⏱️ المدة المتوقعة: ${dest.duration_hours} ساعة`, 750, 190);
    ctx.fillText(`⚠️ نسبة الخطر والكمائن: ${(dest.risk_factor * 100).toFixed(0)}%`, 750, 230);
    
    ctx.fillStyle = '#3498DB';
    ctx.font = '22px "sans-serif"';
    ctx.fillText(`🛡️ [تأمين الطريق]: قاتل 5 موجات لحماية القافلة مسبقاً (مضمونة).`, 750, 290);
    
    ctx.fillStyle = '#E67E22';
    ctx.fillText(`🐫 [إرسال بدون حماية]: قد تتعرض القافلة لكمين في أي وقت!`, 750, 330);
    
    return canvas.toBuffer('image/png');
}

const activeProcesses = new Set();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('caravan')
        .setDescription('🐪 نظام القوافل — مركز التحكم الكامل'),

    name:     'caravan',
    aliases:  ['قافلة', 'قوافل', 'رحلة', 'تجارة'],
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
        setupCaravanChecker(client, db);
        registerCombatListeners(client);
        setupMarketChecker(client, db);

        const reply = async (payload) => {
            try {
                if (isSlash) return await interaction.editReply(payload);
                return await message.channel.send(payload);
            } catch { return null; }
        };

        async function showHub(editMsg = null) {
            const [stats, active, mora, lvlRes, repRes] = await Promise.all([
                getUserCaravanStats(db, user.id, guild.id),
                getActiveCaravan(db, user.id, guild.id),
                getMora(db, user.id, guild.id),
                safeQuery(db, `SELECT "level" FROM levels WHERE "user"=$1 AND "guild"=$2`, [user.id, guild.id]),
                safeQuery(db, `SELECT "rep_points" FROM user_reputation WHERE "userID"=$1 AND "guildID"=$2`, [user.id, guild.id]),
            ]);

            const lvlRow  = lvlRes?.rows?.[0] || {};
            const repRow  = repRes?.rows?.[0] || {};
            const profExtra = {
                level:     Number(lvlRow.level || lvlRow.LEVEL || 1),
                repPoints: Number(repRow.rep_points || repRow.REP_POINTS || 0),
            };

            const payload = await sendCanvas(GEN.generateCaravanHub, [user, stats, active, mora, profExtra]);
            payload.components = [navRow(!!active)];
            
            if (editMsg) return editMsg.edit(payload).catch(() => {});
            return reply(payload);
        }

        async function updateEquipUI(actionCtx, updatedEquip = null) {
            let invRes = await safeQuery(db, `SELECT * FROM user_inventory WHERE "userID"=$1 AND "guildID"=$2`, [user.id, guild.id]);
            if (!invRes || !invRes.rows || invRes.rows.length === 0) {
                invRes = await safeQuery(db, `SELECT * FROM user_inventory WHERE userid=$1 AND guildid=$2`, [user.id, guild.id]);
            }
            
            const allRows = invRes?.rows || [];
            const allItems  = allItemsList();
            const validIds = allItems.map(x => x.id);
            
            const validArtifacts = allRows.filter(row => {
                const id = row.itemid || row.itemID || row.ITEMID;
                const qty = Number(row.quantity || row.QUANTITY || 0);
                return qty > 0 && validIds.includes(id);
            });

            validArtifacts.sort((a, b) => {
                const qtyA = Number(a.quantity || a.QUANTITY || 0);
                const qtyB = Number(b.quantity || b.QUANTITY || 0);
                return qtyB - qtyA; 
            });

            if (!validArtifacts.length) {
                const msg = '📦 ليس لديك أدوات قافلة في المخزن لتجهيزها.';
                if (actionCtx.isReplied || actionCtx.deferred) await actionCtx.followUp({ content: msg, flags: [MessageFlags.Ephemeral] });
                else await actionCtx.reply({ content: msg, flags: [MessageFlags.Ephemeral] });
                return;
            }
            
            const sessionKey = `${user.id}-${guild.id}`;
            if (!client.caravanEquip) client.caravanEquip = new Map();
            const equipped  = updatedEquip || client.caravanEquip.get(sessionKey) || [];
            const mora      = await getMora(db, user.id, guild.id);
            
            const payload   = await sendCanvas(GEN.generateEquipPanel, [user, equipped, validArtifacts, allItems, mora]);

            const opts = validArtifacts.slice(0, 25).map(row => {
                const id2  = row.itemid || row.itemID || row.ITEMID;
                const itm  = allItems.find(x => x.id === id2) || {};
                
                const cleanName = itm.name || getItemNameSafe(id2); 
                const eqItem = equipped.find(x => x.id === id2);
                const isEq = !!eqItem;
                const availableQty = Number(row.quantity || row.QUANTITY || 0);
                const rarityTxt = itm.rarity ? `[${RARITY_AR[itm.rarity] || itm.rarity}] ` : '';
                
                return {
                    label:       cleanName.substring(0, 25),
                    value:       id2,
                    description: isEq ? `✅ مجهزة (${eqItem.count} حبة) - انقر للإزالة` : `${rarityTxt}المتوفر: ${availableQty} | انقر للتجهيز`,
                    emoji:       isEq ? '✅' : (itm.emoji || '📦'),
                };
            });
            
            payload.components = [
                new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder().setCustomId('cv_eq_sel').setPlaceholder('🔧 اختر أداة لتركيبها أو خلعها...').addOptions(opts)
                ),
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('cv_back').setLabel('↩️ رجوع للرئيسية').setStyle(ButtonStyle.Secondary)
                ),
            ];

            if (actionCtx.deferred || actionCtx.replied) {
                await actionCtx.editReply(payload).catch(() => {});
            } else if (typeof actionCtx.update === 'function') {
                await actionCtx.update(payload).catch(() => {});
            } else {
                await hubMsg.edit(payload).catch(() => {});
            }
        }

        const hubMsg = await showHub();
        if (!hubMsg) return;

        let currentStatusMode = 'map'; 

        const collector = hubMsg.createMessageComponentCollector({
            filter: i => i.user.id === user.id,
            time: 5 * 60 * 1000,
            idle: 3 * 60 * 1000,
        });

        collector.on('collect', async i => {
            if (activeProcesses.has(user.id)) {
                return i.reply({ content: '⏳ الرجاء الانتظار، جاري المعالجة...', flags: [MessageFlags.Ephemeral] }).catch(()=>{});
            }
            activeProcesses.add(user.id);
            
            if (i.customId !== 'cv_eq_sel' && i.customId !== 'mkt_add_item' && i.customId !== 'mkt_remove_item') {
                await i.deferUpdate().catch(() => {});
            }

            const id = i.customId;

            try {
                if (id === 'cv_send') {
                    const active = await getActiveCaravan(db, user.id, guild.id);
                    if (active) {
                        await i.followUp({ content: '❌ لديك رحلة نشطة بالفعل!', flags: [MessageFlags.Ephemeral] });
                        activeProcesses.delete(user.id);
                        return;
                    }

                    if (user.id !== EMPEROR_ID) {
                        const cd = await checkCaravanCooldown(db, user.id, guild.id);
                        if (cd.onCooldown) {
                            const ts = Math.floor(cd.expiresAt / 1000);
                            await i.followUp({
                                content: `⏳ قافلتك دُمِّرت مؤخراً!\nيمكنك إرسال قافلة جديدة <t:${ts}:R>.`,
                                flags: [MessageFlags.Ephemeral],
                            });
                            activeProcesses.delete(user.id);
                            return;
                        }
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
                                .setPlaceholder('🗺️ اختر المدينة للإنطلاق...')
                                .addOptions(opts)
                        ),
                        new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId('cv_back').setLabel('↩️ التراجع للرئيسية').setStyle(ButtonStyle.Danger)
                        ),
                    ];
                    await hubMsg.edit(payload).catch(() => {});
                }

                else if (id === 'cv_dest_sel') {
                    const destId = i.values[0];
                    const dest   = caravanConfig.destinations.find(d => d.id === destId);
                    const mora   = await getMora(db, user.id, guild.id);
                    
                    if (mora < dest.cost) {
                        await i.followUp({ content: `❌ تحتاج **${dest.cost.toLocaleString()}** ${EMOJI_MORA}. رصيدك: **${mora.toLocaleString()}**`, flags: [MessageFlags.Ephemeral] });
                        activeProcesses.delete(user.id);
                        return;
                    }

                    // 👑 حفظ الوجهة المحددة للرحلة
                    client.caravanTempDest = client.caravanTempDest || new Map();
                    client.caravanTempDest.set(user.id, dest);

                    // 👑 تنظيف سجلات السوق السابقة وفتح واجهة التجهيز!
                    clearMarketListingsCache(client, user.id, guild.id);
                    await showMarketSetup(i, client, db, user, guild, dest);
                }

                // ─── أوامر تجهيز السوق (Market Setup) ───
                else if (id === 'mkt_add_item') {
                    const dest = client.caravanTempDest?.get(user.id);
                    await handleAddItemSelect(i, client, db, user, guild, dest);
                    try {
                        const modalSubmit = await i.awaitModalSubmit({ filter: m => m.customId.startsWith('mkt_price_modal_') && m.user.id === user.id, time: 60000 });
                        await handlePriceModalSubmit(modalSubmit, client, db, user, guild, dest);
                    } catch(e) {}
                }

                else if (id === 'mkt_remove_item') {
                    const dest = client.caravanTempDest?.get(user.id);
                    await handleRemoveItemSelect(i, client, db, user, guild, dest);
                }

                else if (id === 'mkt_back') {
                    await i.deleteReply().catch(()=>{});
                }

                // ─── إطلاق القافلة بعد الانتهاء من تجهيز السوق ───
                else if (id === 'mkt_launch' || id === 'mkt_skip') {
                    const dest = client.caravanTempDest?.get(user.id);
                    const mora = await getMora(db, user.id, guild.id);
                    
                    await i.deleteReply().catch(()=>{}); // إغلاق نافذة السوق

                    // رسم صورة التأمين بدون إمبيد
                    const buffer = await generateDestChoiceImage(dest, mora);
                    const attachment = new AttachmentBuilder(buffer, { name: 'dest_choice.png' });

                    await hubMsg.edit({
                        content: `<@${user.id}>`,
                        embeds: [],
                        files: [attachment],
                        components: [
                            new ActionRowBuilder().addComponents(
                                new ButtonBuilder()
                                    .setCustomId(`cv_escort_${dest.id}`)
                                    .setLabel('🛡️ تأمين الطريق (تذكرة حارس)')
                                    .setStyle(ButtonStyle.Primary),
                                new ButtonBuilder()
                                    .setCustomId(`cv_noprotect_${dest.id}`)
                                    .setLabel('🐫 إرسال بدون حماية')
                                    .setStyle(ButtonStyle.Secondary),
                                new ButtonBuilder()
                                    .setCustomId('cv_back')
                                    .setLabel('↩️ إلغاء الرحلة')
                                    .setStyle(ButtonStyle.Danger)
                            )
                        ]
                    }).catch(() => {});
                }

                else if (id.startsWith('cv_noprotect_')) {
                    const destId = id.replace('cv_noprotect_', '');
                    const dest   = caravanConfig.destinations.find(d => d.id === destId);
                    const mora   = await getMora(db, user.id, guild.id);
                    if (mora < dest.cost) {
                        await i.followUp({ content: `❌ تحتاج **${dest.cost.toLocaleString()}** ${EMOJI_MORA}. رصيدك: **${mora.toLocaleString()}**`, flags: [MessageFlags.Ephemeral] });
                        activeProcesses.delete(user.id);
                        return;
                    }

                    await safeExecute(db, `UPDATE levels SET "mora"=CAST(COALESCE("mora",'0') AS BIGINT)-$1 WHERE "user"=$2 AND "guild"=$3`, [dest.cost, user.id, guild.id]);

                    const sessionKey = `${user.id}-${guild.id}`;
                    const savedArts  = client.caravanEquip?.get(sessionKey) || [];
                    const { sendCaravan } = require('./journey');
                    const result     = await sendCaravan(db, user.id, guild.id, destId, savedArts);

                    if (result.error) {
                        await i.followUp({ content: `❌ ${result.error}`, flags: [MessageFlags.Ephemeral] });
                        activeProcesses.delete(user.id);
                        return;
                    }

                    // 👑 حفظ بضائع السوق في قاعدة البيانات وربطها بالقافلة!
                    const activeCheck = await getActiveCaravan(db, user.id, guild.id);
                    if (activeCheck) {
                        await finalizeListings(client, db, activeCheck.id, user.id, guild.id);
                    }

                    if (client.caravanEquip) client.caravanEquip.delete(sessionKey);

                    const eta = Math.floor(result.endTime / 1000);
                    await i.followUp({
                        content: `✅ **انطلقت القافلة إلى ${dest.emoji} ${dest.name}!**\n📅 **وقت الوصول:** <t:${eta}:R>\n⚠️ **نسبة الخطر:** ${(result.riskFactor*100).toFixed(0)}%`,
                        flags: [MessageFlags.Ephemeral],
                    }).catch(() => {});
                    
                    await showHub(hubMsg);
                }

                else if (id.startsWith('cv_escort_')) {
                    const destId = id.replace('cv_escort_', '');
                    const dest   = caravanConfig.destinations.find(d => d.id === destId);
                    if (!dest) { activeProcesses.delete(user.id); return; }

                    const active = await getActiveCaravan(db, user.id, guild.id);
                    if (active) {
                        await i.followUp({ content: '❌ لديك رحلة نشطة بالفعل!', flags: [MessageFlags.Ephemeral] });
                        activeProcesses.delete(user.id);
                        return;
                    }

                    await hubMsg.edit({
                        content: '🛡️ **لوبي التأمين قيد الإعداد...**',
                        embeds: [], files: [], components: []
                    }).catch(() => {});

                    startEscortLobby(i.channel, user, guild, db, dest)
                        .then(async lobbyResult => {
                            if (lobbyResult.ready) {
                                client.emit('caravan_escort_ready', {
                                    thread:       lobbyResult.thread,
                                    party:        lobbyResult.party,
                                    partyClasses: lobbyResult.partyClasses,
                                    guild,
                                    dest,
                                    destId,
                                    hostId:       user.id,
                                    channel:      i.channel,
                                    hubMsg,
                                    db,
                                    getMora,
                                    showHub,
                                    client, // تمرير الـ client مهم لحفظ بضائع السوق لاحقاً
                                });
                                return;
                            }
                            if (!lobbyResult.cancelled) {
                                await i.channel.send({
                                    content: `💀 **فشل التأمين!**\n<@${user.id}> لم تنجح الحراسة. القافلة لم تُرسَل ولم يُخصَم منك شيء.`
                                }).catch(() => {});
                            }
                            await showHub(hubMsg);
                        })
                        .catch(async err => {
                            console.error('[EscortLobby error]', err);
                            await showHub(hubMsg);
                        });
                }

                else if (id === 'cv_status' || id === 'cv_status_toggle') {
                    const active = await getActiveCaravan(db, user.id, guild.id);
                    if (!active) {
                        await i.followUp({ content: '📭 لا توجد رحلة نشطة للتبعها.', flags: [MessageFlags.Ephemeral] });
                        activeProcesses.delete(user.id);
                        return;
                    }
                    
                    if (id === 'cv_status_toggle') {
                        currentStatusMode = currentStatusMode === 'map' ? 'details' : 'map';
                    } else {
                        currentStatusMode = 'map'; 
                    }

                    const destId = active.destinationid || active.destinationId;
                    const dest   = caravanConfig.destinations.find(d => d.id === destId) || {};
                    const stats  = await getUserCaravanStats(db, user.id, guild.id);
                    const payload = await sendCanvas(GEN.generateCaravanStatus, [user, active, stats, dest, currentStatusMode]);
                    
                    const toggleLabel = currentStatusMode === 'map' ? '📊 التقرير التفصيلي' : '🗺️ إظهار الخريطة';
                    
                    payload.components = [
                        new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId('cv_status_toggle').setLabel(toggleLabel).setStyle(ButtonStyle.Primary),
                            new ButtonBuilder().setCustomId('cv_back').setLabel('↩️ العودة للرئيسية').setStyle(ButtonStyle.Secondary)
                        ),
                    ];
                    await hubMsg.edit(payload).catch(() => {});
                }

                else if (id === 'cv_upgrade') {
                    const [stats, mora] = await Promise.all([
                        getUserCaravanStats(db, user.id, guild.id),
                        getMora(db, user.id, guild.id),
                    ]);
                    const payload = await sendCanvas(GEN.generateUpgradePanel, [user, stats, mora]);

                    const opts = Object.entries(caravanConfig.upgrades).map(([key, cfg]) => {
                        const rank  = Number(stats[`${key}_rank`] || stats[`${key}_RANK`] || 1);
                        const maxed = rank >= cfg.max_level;
                        const cost  = maxed ? 0 : cfg.costs[rank];
                        return {
                            label:       `${cfg.name} — مستوى ${rank}${maxed?' (MAX)':''}`,
                            value:       key,
                            description: maxed ? 'تأثير كامل ونشط' : `تكلفة الترقية: ${cost.toLocaleString()} مورا`,
                            emoji:       cfg.emoji,
                        };
                    });
                    payload.components = [
                        new ActionRowBuilder().addComponents(
                            new StringSelectMenuBuilder().setCustomId('cv_upg_sel').setPlaceholder('🛠️ حدد العنصر لترقيته...').addOptions(opts)
                        ),
                        new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId('cv_back').setLabel('↩️ رجوع للرئيسية').setStyle(ButtonStyle.Secondary)
                        ),
                    ];
                    await hubMsg.edit(payload).catch(() => {});
                }

                else if (id === 'cv_upg_sel') {
                    const result = await upgradeCaravan(db, user.id, guild.id, i.values[0]);
                    if (result.error) {
                        await i.followUp({ content: `❌ ${result.error}`, flags: [MessageFlags.Ephemeral] });
                    } else {
                        await i.followUp({
                            content: `✅ تمت ترقية ${result.upgCfg.emoji} **${result.upgCfg.name}** إلى مستوى **${result.newLevel}**\n💰 التكلفة: **${result.cost.toLocaleString()}** مورا`,
                            flags: [MessageFlags.Ephemeral],
                        }).catch(() => {});
                    }
                    
                    const [stats2, mora2] = await Promise.all([
                        getUserCaravanStats(db, user.id, guild.id),
                        getMora(db, user.id, guild.id),
                    ]);
                    const payload2 = await sendCanvas(GEN.generateUpgradePanel, [user, stats2, mora2]);
                    const opts2 = Object.entries(caravanConfig.upgrades).map(([key, cfg]) => {
                        const rank  = Number(stats2[`${key}_rank`] || stats2[`${key}_RANK`] || 1);
                        const maxed = rank >= cfg.max_level;
                        const cost  = maxed ? 0 : cfg.costs[rank];
                        return {
                            label:       `${cfg.name} — مستوى ${rank}${maxed?' (MAX)':''}`,
                            value:       key,
                            description: maxed ? 'تأثير كامل ونشط' : `تكلفة الترقية: ${cost.toLocaleString()} مورا`,
                            emoji:       cfg.emoji,
                        };
                    });
                    payload2.components = [
                        new ActionRowBuilder().addComponents(
                            new StringSelectMenuBuilder().setCustomId('cv_upg_sel').setPlaceholder('🛠️ حدد العنصر لترقيته...').addOptions(opts2)
                        ),
                        new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId('cv_back').setLabel('↩️ رجوع للرئيسية').setStyle(ButtonStyle.Secondary)
                        ),
                    ];
                    await hubMsg.edit(payload2).catch(() => {});
                }

                else if (id === 'cv_equip') {
                    const active = await getActiveCaravan(db, user.id, guild.id);
                    if (active) {
                        await i.followUp({ content: '❌ لا يمكنك تجهيز الأدوات والقافلة في منتصف رحلتها!', flags: [MessageFlags.Ephemeral] });
                        activeProcesses.delete(user.id);
                        return;
                    }
                    await updateEquipUI(i);
                }

                else if (id === 'cv_eq_sel') {
                    const sessionKey = `${user.id}-${guild.id}`;
                    let current = client.caravanEquip?.get(sessionKey) || [];
                    const itemId = i.values[0];

                    const existingIndex = current.findIndex(x => x.id === itemId);
                    
                    if (existingIndex !== -1) {
                        await i.deferUpdate().catch(() => {}); 
                        current.splice(existingIndex, 1);
                        if (!client.caravanEquip) client.caravanEquip = new Map();
                        client.caravanEquip.set(sessionKey, current);
                        
                        await updateEquipUI(i, current);
                        return;
                    }

                    if (current.length >= 3) {
                        await i.reply({ content: '❌ مساحة القافلة ممتلئة (3 أنواع كحد أقصى). اخلع أداة لتتمكن من إضافة غيرها.', flags: [MessageFlags.Ephemeral] });
                        activeProcesses.delete(user.id);
                        return;
                    }

                    let invResCheck = await safeQuery(db, `SELECT * FROM user_inventory WHERE "userID"=$1 AND "guildID"=$2`, [user.id, guild.id]);
                    if (!invResCheck || !invResCheck.rows || invResCheck.rows.length === 0) {
                        invResCheck = await safeQuery(db, `SELECT * FROM user_inventory WHERE userid=$1 AND guildid=$2`, [user.id, guild.id]);
                    }
                    const targetRow = (invResCheck?.rows || []).find(r => (r.itemid || r.itemID || r.ITEMID) === itemId);
                    const availableQty = targetRow ? Number(targetRow.quantity || targetRow.QUANTITY || 0) : 0;

                    if (availableQty <= 0) {
                        await i.reply({ content: '❌ لا تملك هذه الأداة في المخزن.', flags: [MessageFlags.Ephemeral] });
                        activeProcesses.delete(user.id);
                        return;
                    }

                    if (availableQty === 1) {
                        await i.deferUpdate().catch(() => {});
                        current.push({ id: itemId, count: 1 });
                        if (!client.caravanEquip) client.caravanEquip = new Map();
                        client.caravanEquip.set(sessionKey, current);
                        await updateEquipUI(i, current);
                    } else {
                        const modalId = `cv_eq_mod_${Date.now()}`;
                        const modal = new ModalBuilder().setCustomId(modalId).setTitle('تحديد كمية الارتيفاكت');
                        
                        const maxAllowed = Math.min(availableQty, 20);
                        const qtyInput = new TextInputBuilder()
                            .setCustomId('qty')
                            .setLabel(`الكمية المراد تجهيزها (1 إلى ${maxAllowed})`)
                            .setPlaceholder(`العدد المتوفر: ${availableQty}`)
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true);
                            
                        modal.addComponents(new ActionRowBuilder().addComponents(qtyInput));
                        await i.showModal(modal);

                        try {
                            const modalSubmit = await i.awaitModalSubmit({ filter: m => m.customId === modalId && m.user.id === user.id, time: 60000 });
                            
                            await modalSubmit.deferUpdate().catch(() => {});

                            const qtyStr = modalSubmit.fields.getTextInputValue('qty');
                            let qty = parseInt(qtyStr);

                            if (isNaN(qty) || qty < 1 || qty > maxAllowed) {
                                await modalSubmit.followUp({ content: `❌ كمية غير صالحة. الرجاء إدخال رقم صحيح بين 1 و ${maxAllowed}.`, flags: [MessageFlags.Ephemeral] });
                                activeProcesses.delete(user.id);
                                return;
                            }

                            current.push({ id: itemId, count: qty });
                            if (!client.caravanEquip) client.caravanEquip = new Map();
                            client.caravanEquip.set(sessionKey, current);

                            await updateEquipUI(modalSubmit, current, true);
                        } catch (e) {
                            activeProcesses.delete(user.id);
                        }
                    }
                }

                else if (id === 'cv_back') {
                    await showHub(hubMsg);
                }
            } finally {
                activeProcesses.delete(user.id);
            }
        });

        collector.on('end', async () => {
            try {
                const activeCheck = await getActiveCaravan(db, user.id, guild.id);
                await hubMsg.edit({ components: [navRow(!!activeCheck, true)] }).catch(() => {});
            } catch(e) {}
        });
    }
};
