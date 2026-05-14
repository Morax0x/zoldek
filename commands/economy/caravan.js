const {
    SlashCommandBuilder, AttachmentBuilder, EmbedBuilder,
    ActionRowBuilder, ButtonBuilder, ButtonStyle,
    StringSelectMenuBuilder, MessageFlags,
    ModalBuilder, TextInputBuilder, TextInputStyle
} = require('discord.js');

const path = require('path');
const fs   = require('fs');

const {
    caravanConfig, getUserCaravanStats,
    getActiveCaravan, sendCaravan, upgradeCaravan, setupCaravanChecker,
    checkCaravanCooldown, safeQuery, safeExecute, EMOJI_MORA,
    startEscortLobby, registerCombatListeners,
    finalizeListings,
    } = require('../../handlers/caravan/index.js');

const market = require('../../handlers/caravan/market/index.js');
const marketSetup = require('../../handlers/caravan/market/market-setup.js');

const EMPEROR_ID = '1145327691772481577';

const upgradeMats = require('../../json/upgrade-materials.json');

let GEN;
try { GEN = require('../../generators/caravan-generator.js'); }
catch { GEN = {}; }

// 👑 تم ربط ملف مولد اللوبي 👑
let LOBBY_GEN;
try { LOBBY_GEN = require('../../generators/caravan/lobby-generator.js'); }
catch { LOBBY_GEN = {}; }

let STAGING_GEN;
try { STAGING_GEN = require('../../generators/staging-market-generator.js'); }
catch { STAGING_GEN = {}; }

let allGameItems = [];
try {
    const shopItems = require(path.join(process.cwd(), 'json', 'shop-items.json')) || [];
    const wepItems = require(path.join(process.cwd(), 'json', 'weapons-config.json'));
    const seedsItems = require(path.join(process.cwd(), 'json', 'seeds.json')) || [];
    const fishItems = require(path.join(process.cwd(), 'json', 'fish.json'))?.fishItems || [];
    
    allGameItems = [...shopItems, ...seedsItems, ...fishItems];
    if (wepItems && wepItems.weapons) {
        Object.keys(wepItems.weapons).forEach(k => {
            wepItems.weapons[k].forEach(w => allGameItems.push({ id: w.id, name: w.name, rarity: w.rarity, emoji: w.emoji }));
        });
    }
} catch(e) {}

function getItemInfoSafe(id) {
    const itm = allGameItems.find(x => x.id === id);
    if (itm) return { name: itm.name, emoji: itm.emoji || '📦', rarity: itm.rarity || 'Common' };
    return { name: String(id).replace(/_/g, ' '), emoji: '📦', rarity: 'Common' };
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

function navRow(hasActiveCaravan = false, disabled = false, userId = null) {
    const row = new ActionRowBuilder();
    
    if (!hasActiveCaravan) {
        row.addComponents(
            new ButtonBuilder().setCustomId('cv_send').setLabel('📤 إرسال رحلة').setStyle(ButtonStyle.Primary).setDisabled(disabled),
            new ButtonBuilder().setCustomId('cv_market_staging').setLabel('تجهيز البضاعة').setEmoji('🏪').setStyle(ButtonStyle.Success).setDisabled(disabled),
            new ButtonBuilder().setCustomId('cv_equip').setEmoji('🔮').setLabel('عتاد').setStyle(ButtonStyle.Secondary).setDisabled(disabled)
        );
    } else {
        row.addComponents(
            new ButtonBuilder().setCustomId('cv_status').setLabel('🗺️ متابعة الرحلة').setStyle(ButtonStyle.Success).setDisabled(disabled)
        );
        
        if (userId === EMPEROR_ID) {
            row.addComponents(
                new ButtonBuilder().setCustomId('cv_fastforward').setLabel('⏩ تسريع الرحلة').setStyle(ButtonStyle.Danger).setDisabled(disabled)
            );
        }
    }
    
    row.addComponents(
        new ButtonBuilder().setCustomId('cv_upgrade').setEmoji('❗').setStyle(ButtonStyle.Secondary).setDisabled(disabled)
    );

    return row;
}

async function sendCanvas(fn, args, content = '') {
    try {
        if (typeof fn !== 'function') throw new Error('no fn');
        const buf = await fn(...args);
        return { files: [new AttachmentBuilder(buf, { name: 'caravan.png' })], content, embeds: [] };
    } catch (e) {
        return { content: `⚠️ تعذّر توليد الصورة.`, embeds: [], files: [] };
    }
}

const activeProcesses = new Set();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('قافلة')
        .setDescription('🐪 نظام القوافل — مركز التحكم الكامل'),

    name:     'caravan',
    aliases:  ['قافلة', 'سفر', 'تجر', 'شحن', 'قاف'],
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

        if (!client.caravanSystemsInitialized) {
            setupCaravanChecker(client, db);
            registerCombatListeners(client);
            market.setupMarketChecker(client, db);
            client.caravanSystemsInitialized = true;
        }

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
                level:        Number(lvlRow.level || lvlRow.LEVEL || 1),
                repPoints:    Number(repRow.rep_points || repRow.REP_POINTS || 0),
                best_loot:    Number(stats.best_loot || 0),
                best_loot_label: stats.best_loot_label || null,
                favorite_dest: stats.last_dest || '',
            };

            const payload = await sendCanvas(GEN.generateCaravanHub, [user, stats, active, mora, profExtra]);
            payload.components = [navRow(!!active, false, user.id)]; 
            
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
            const equipped  = updatedEquip || client.caravanEquip.get(sessionKey) || [null, null, null];
            const mora      = await getMora(db, user.id, guild.id);
            
            const payload   = await sendCanvas(GEN.generateEquipPanel, [user, equipped, validArtifacts, allItems, mora]);

            const slotLabels = ['سرعة', 'دفاع', 'حظ'];
            const allButtonsRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('cv_back').setEmoji('↩️').setLabel('رجوع').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('cv_eq_slot_0').setEmoji('⚡').setLabel(slotLabels[0]).setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('cv_eq_slot_1').setEmoji('🛡️').setLabel(slotLabels[1]).setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('cv_eq_slot_2').setEmoji('🍀').setLabel(slotLabels[2]).setStyle(ButtonStyle.Secondary),
            );
            
            payload.components = [allButtonsRow];

            if (actionCtx.deferred || actionCtx.replied) {
                await actionCtx.editReply(payload).catch(() => {});
            } else if (typeof actionCtx.update === 'function') {
                await actionCtx.update(payload).catch(() => {});
            } else {
                await hubMsg.edit(payload).catch(() => {});
            }
        }

        async function handleEquipFlow(actionCtx, sessionKey) {
            const equipped = client.caravanEquip?.get(sessionKey) || [null, null, null];
            const allItems = allItemsList();
            const equippedText = equipped.map(eq => {
                if (!eq) return 'فارغ';
                const itm = allItems.find(x => x.id === eq.id);
                return itm ? `${itm.emoji || ''} ${itm.name || ''} (x${eq.count})` : 'فارغ';
            });

            const desc = [
                '✬ **تجهيز عتاد القافلة**',
                '',
                `⚡ **سرعة**: ${equippedText[0]}`,
                `🛡️ **دفاع**: ${equippedText[1]}`,
                `🍀 **حظ**: ${equippedText[2]}`,
            ].join('\n');

            const slotBtnRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('cv_eqp_s0').setEmoji('⚡').setLabel('سرعة').setStyle(equipped[0] ? ButtonStyle.Success : ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('cv_eqp_s1').setEmoji('🛡️').setLabel('دفاع').setStyle(equipped[1] ? ButtonStyle.Success : ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('cv_eqp_s2').setEmoji('🍀').setLabel('حظ').setStyle(equipped[2] ? ButtonStyle.Success : ButtonStyle.Secondary),
            );

            const ephemMsg = await actionCtx.followUp({ content: desc, components: [slotBtnRow], flags: [MessageFlags.Ephemeral] }).catch(() => null);
            if (!ephemMsg) return;

            try {
                while (true) {
                    const slotClick = await ephemMsg.awaitMessageComponent({
                        filter: ci => ci.user.id === user.id && ci.customId.startsWith('cv_eqp_s'),
                        time: 60000,
                    }).catch(() => null);
                    if (!slotClick) break;

                    const si = parseInt(slotClick.customId.replace('cv_eqp_s', ''));
                    if (isNaN(si) || si < 0 || si > 2) continue;

                    let curEquipped = client.caravanEquip?.get(sessionKey) || [null, null, null];

                    // Unequip
                    if (curEquipped[si]) {
                        curEquipped[si] = null;
                        if (!client.caravanEquip) client.caravanEquip = new Map();
                        client.caravanEquip.set(sessionKey, curEquipped);
                        await slotClick.update({ content: '✬ تم فك العتاد', components: [] }).catch(() => {});
                        break;
                    }

                    // Empty slot → show select menu in same ephemeral
                    const invCheck = await safeQuery(db, `SELECT * FROM user_inventory WHERE "userID"=$1 AND "guildID"=$2`, [user.id, guild.id]).catch(() => null);
                    if (!invCheck || !invCheck.rows || invCheck.rows.length === 0) {
                        const altCheck = await safeQuery(db, `SELECT * FROM user_inventory WHERE userid=$1 AND guildid=$2`, [user.id, guild.id]).catch(() => null);
                        if (altCheck) invCheck.rows = altCheck.rows;
                    }
                    const invRows = (invCheck?.rows || []).filter(r => {
                        const rid = r.itemid || r.itemID || r.ITEMID;
                        return Number(r.quantity || r.QUANTITY || 0) > 0 && allItems.some(a => a.id === rid);
                    });

                    if (!invRows.length) {
                        await slotClick.reply({ content: '📦 لا توجد أدوات متوفرة في المخزن.', flags: [MessageFlags.Ephemeral] });
                        break;
                    }

                    if (!client.caravanEquipTarget) client.caravanEquipTarget = new Map();
                    client.caravanEquipTarget.set(sessionKey, si);

                    const opts = invRows.slice(0, 25).map(row => {
                        const id2 = row.itemid || row.itemID || row.ITEMID;
                        const itm = allItems.find(x => x.id === id2) || {};
                        return {
                            label: (itm.name || id2).substring(0, 25),
                            value: id2,
                            description: `المتوفر: ${Number(row.quantity || row.QUANTITY || 0)}`,
                            emoji: itm.emoji || '📦',
                        };
                    });

                    const selRow = new ActionRowBuilder().addComponents(
                        new StringSelectMenuBuilder()
                            .setCustomId('cv_eqp_sel')
                            .setPlaceholder('اختر أداة للتجهيز...')
                            .addOptions(opts)
                    );

                    await slotClick.update({ content: '✬ جـاري اعداد عـتـاد القافـلـة ..', components: [selRow] }).catch(() => {});
                    const menuMsg = await slotClick.fetchReply().catch(() => null);
                    if (!menuMsg) break;

                    try {
                        const selI = await menuMsg.awaitMessageComponent({
                            filter: m => m.customId === 'cv_eqp_sel' && m.user.id === user.id,
                            time: 60000,
                        });

                        const itemId = selI.values[0];
                        curEquipped = client.caravanEquip?.get(sessionKey) || [null, null, null];

                        const existingSlot = curEquipped.findIndex(x => x && x.id === itemId);
                        if (existingSlot !== -1) {
                            curEquipped[existingSlot] = null;
                            if (!client.caravanEquip) client.caravanEquip = new Map();
                            client.caravanEquip.set(sessionKey, curEquipped);
                            await selI.update({ content: '✬ جـاري اعداد عـتـاد القافـلـة ..', components: [] }).catch(() => {});
                            break;
                        }

                        if (curEquipped[si] !== null) {
                            await selI.reply({ content: '❌ هذه الفتحة مشغولة. أزل العتاد الحالي أولاً.', flags: [MessageFlags.Ephemeral] });
                            break;
                        }

                        const targetRow = invRows.find(r => (r.itemid || r.itemID || r.ITEMID) === itemId);
                        const availableQty = targetRow ? Number(targetRow.quantity || targetRow.QUANTITY || 0) : 0;

                        if (availableQty <= 0) {
                            await selI.reply({ content: '❌ لا تملك هذه الأداة في المخزن.', flags: [MessageFlags.Ephemeral] });
                            break;
                        }

                        if (availableQty === 1) {
                            curEquipped[si] = { id: itemId, count: 1 };
                            if (!client.caravanEquip) client.caravanEquip = new Map();
                            client.caravanEquip.set(sessionKey, curEquipped);
                            await selI.update({ content: '✬ جـاري اعداد عـتـاد القافـلـة ..', components: [] }).catch(() => {});
                            break;
                        }

                        const modalId = `cv_eqp_mod_${Date.now()}`;
                        const modal = new ModalBuilder().setCustomId(modalId).setTitle('تحديد الكمية');
                        const maxAllowed = Math.min(availableQty, 20);
                        const qtyInput = new TextInputBuilder()
                            .setCustomId('qty')
                            .setLabel(`الكمية (1 إلى ${maxAllowed})`)
                            .setPlaceholder(`المتوفر: ${availableQty}`)
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true);
                        modal.addComponents(new ActionRowBuilder().addComponents(qtyInput));
                        await selI.showModal(modal);

                        try {
                            const modalSubmit = await selI.awaitModalSubmit({ filter: m => m.customId === modalId && m.user.id === user.id, time: 60000 });

                            const qtyStr = modalSubmit.fields.getTextInputValue('qty');
                            let qty = parseInt(qtyStr);
                            if (isNaN(qty) || qty < 1 || qty > maxAllowed) {
                                await modalSubmit.reply({ content: `❌ كمية غير صالحة (1-${maxAllowed}).`, flags: [MessageFlags.Ephemeral] });
                                break;
                            }

                            curEquipped[si] = { id: itemId, count: qty };
                            if (!client.caravanEquip) client.caravanEquip = new Map();
                            client.caravanEquip.set(sessionKey, curEquipped);
                            await selI.update({ content: '✬ جـاري اعداد عـتـاد القافـلـة ..', components: [] }).catch(() => {});
                            await modalSubmit.deferUpdate().catch(() => {});
                        } catch (e) {}
                    } catch (e) {}
                    break;
                }
            } catch (e) {}
        }

        const hubMsg = await showHub();
        if (!hubMsg) return;

        let currentStatusMode = 'map'; 

        const collector = hubMsg.createMessageComponentCollector({
            filter: i => i.user.id === user.id,
            time: 10 * 60 * 1000,
        });

        collector.on('collect', async i => {
            const fastButtons = new Set(['cv_market_staging', 'cv_back', 'cv_status_toggle', 'cv_status']);

            if (!fastButtons.has(i.customId) && !i.customId.startsWith('stg_')) {
                if (activeProcesses.has(user.id)) {
                    return i.reply({ content: '⏳ الرجاء الانتظار، جاري المعالجة...', flags: [MessageFlags.Ephemeral] }).catch(()=>{});
                }
                activeProcesses.add(user.id);
            }
            
            if (i.customId !== 'cv_equip' && i.customId !== 'cv_market_staging' && !i.customId.startsWith('stg_')) {
                await i.deferUpdate().catch(() => {});
            }

            const id = i.customId;

            try {
                if (id === 'cv_fastforward') {
                    if (user.id !== EMPEROR_ID) return;
                    
                    const targetTime = Date.now() - 60000; 
                    
                    const tables = ['user_caravans'];
                    for (const table of tables) {
                        await safeExecute(db, `UPDATE ${table} SET "endTime" = $1 WHERE "userID" = $2`, [targetTime, user.id]);
                        await safeExecute(db, `UPDATE ${table} SET endtime = $1 WHERE userid = $2`, [targetTime, user.id]);
                    }
                    
                    await i.followUp({ 
                        content: '⏩ ⏳ **تم التلاعب بالزمن!** قافلتك وصلت للتو. (انتظر ثواني قليلة ليقوم فاحص البوت بتوزيع الأرباح وبيع البضائع وإشعارك بالوصول).', 
                        flags: [MessageFlags.Ephemeral] 
                    });
                }
                
                else if (id === 'cv_send') {
                    const [active, mora, stats] = await Promise.all([
                        getActiveCaravan(db, user.id, guild.id),
                        getMora(db, user.id, guild.id),
                        getUserCaravanStats(db, user.id, guild.id),
                    ]);
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
                            new ButtonBuilder().setCustomId('cv_back').setEmoji('↩️').setStyle(ButtonStyle.Danger)
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

                    client.caravanTempDest = client.caravanTempDest || new Map();
                    client.caravanTempDest.set(user.id, dest);

                    let imgPayload;
                    try {
                        const buffer = await LOBBY_GEN.generateDestChoiceImage(dest, mora);
                        const attachment = new AttachmentBuilder(buffer, { name: 'dest_choice.png' });
                        imgPayload = { content: `<@${user.id}>`, embeds: [], files: [attachment] };
                    } catch (e) {
                        const embed = new EmbedBuilder()
                            .setColor(dest.color || 0x2ECC71)
                            .setTitle(`${dest.emoji || '📍'} ${dest.name}`)
                            .setDescription(`**المدة:** ${dest.duration_hours} ساعة\n**نسبة الخطر:** ${(dest.risk_factor * 100).toFixed(0)}%\n**التكلفة:** ${dest.cost.toLocaleString()} مورا`)
                            .setFooter({ text: '™ Empire' });
                        imgPayload = { content: `<@${user.id}>`, embeds: [embed], files: [] };
                    }

                    await hubMsg.edit({
                        ...imgPayload,
                        components: [
                            new ActionRowBuilder().addComponents(
                                new ButtonBuilder()
                                    .setCustomId(`cv_escort_${dest.id}`)
                                    .setLabel('⚔️ هجوم وتأمين الطريق')
                                    .setStyle(ButtonStyle.Danger),
                                new ButtonBuilder()
                                    .setCustomId(`cv_noprotect_${dest.id}`)
                                    .setLabel('🐫 تخطي الحماية')
                                    .setStyle(ButtonStyle.Primary),
                                new ButtonBuilder()
                                    .setCustomId('cv_back')
                                    .setEmoji('↩️')
                                    .setStyle(ButtonStyle.Secondary)
                            )
                        ]
                    }).catch(() => {});
                }

                else if (id === 'cv_market_staging') {
                    await i.deferUpdate().catch(() => {});
                    await marketSetup.showStagingUI(i, db, user, guild, true);
                }
                
                else if (id.startsWith('stg_')) {
                    if (id.startsWith(`stg_ok_`)) {
                        const stateKey = `mkt_state_${user.id}_${guild.id}`;
                        const state = client[stateKey];
                        const pageItems = state?.pageItems || [];
                        const selectedItem = pageItems[state?.selectedIndex || 0];

                        if (!selectedItem) {
                             await i.deferUpdate().catch(()=>{});
                             return i.followUp({ content: "❌ المربع المحدد فارغ.", flags: [MessageFlags.Ephemeral] });
                        }
                        
                        if (state.category === 'staged') {
                            const itemIdToUse = selectedItem.id || selectedItem.itemID;
                            const modalId = `stg_rmv_modal_${itemIdToUse}|${Date.now()}`;
                            const modal = new ModalBuilder().setCustomId(modalId).setTitle(`إزالة البضاعة`);
                            modal.addComponents(new ActionRowBuilder().addComponents(
                                new TextInputBuilder().setCustomId('rmv_qty').setLabel(`الكمية (الحد الأقصى ${selectedItem.quantity})`).setStyle(TextInputStyle.Short).setValue(String(selectedItem.quantity)).setRequired(true)
                            ));
                            await i.showModal(modal);
                            
                            try {
                                const mSubmit = await i.awaitModalSubmit({ filter: m => m.customId.startsWith(`stg_rmv_modal_${itemIdToUse}|`) && m.user.id === user.id, time: 60000 });
                                mSubmit.customId = `stg_rmv_modal_${itemIdToUse}`;
                                await marketSetup.handleStageModalSubmit(mSubmit, db, user, guild);
                            } catch(e) { activeProcesses.delete(user.id); }
                            
                        } else {
                            const modalId = `stg_add_modal_${selectedItem.id}_${Date.now()}`;
                            const modal = new ModalBuilder().setCustomId(modalId).setTitle(`تسعير: ${selectedItem.name}`.substring(0, 45));
                            modal.addComponents(
                                new ActionRowBuilder().addComponents(
                                    new TextInputBuilder().setCustomId('add_qty').setLabel(`الكمية (لديك: ${selectedItem.quantity})`).setStyle(TextInputStyle.Short).setValue(String(selectedItem.quantity)).setRequired(true)
                                ),
                                new ActionRowBuilder().addComponents(
                                    new TextInputBuilder().setCustomId('add_price').setLabel(`سعر الحبة (مورا)`).setStyle(TextInputStyle.Short).setRequired(true)
                                )
                            );
                            await i.showModal(modal);
                            
                            try {
                                const mSubmit = await i.awaitModalSubmit({ filter: m => m.customId === modalId && m.user.id === user.id, time: 60000 });
                                mSubmit.customId = `stg_add_modal_${selectedItem.id}`;
                                await marketSetup.handleStageModalSubmit(mSubmit, db, user, guild);
                            } catch(e) { activeProcesses.delete(user.id); }
                        }
                    } else {
                        await marketSetup.handleStagingInteraction(i, db, user, guild);
                    }
                }

                else if (id.startsWith('cv_noprotect_')) {
                    const destId = id.replace('cv_noprotect_', '');
                    const dest   = caravanConfig.destinations.find(d => d.id === destId);
                    if (!dest) { activeProcesses.delete(user.id); return; }

                    const mora   = await getMora(db, user.id, guild.id);
                    if (mora < dest.cost) {
                        await i.followUp({ content: `❌ تحتاج **${dest.cost.toLocaleString()}** ${EMOJI_MORA}. رصيدك: **${mora.toLocaleString()}**`, flags: [MessageFlags.Ephemeral] });
                        activeProcesses.delete(user.id);
                        return;
                    }

                    const deductResult = await safeExecute(db, `UPDATE levels SET "mora"=CAST(COALESCE("mora",'0') AS BIGINT)-$1 WHERE "user"=$2 AND "guild"=$3`, [dest.cost, user.id, guild.id]);
                    if (!deductResult) {
                        await i.followUp({ content: '❌ فشل خصم الرصيد!', flags: [MessageFlags.Ephemeral] });
                        activeProcesses.delete(user.id);
                        return;
                    }

                    const sessionKey = `${user.id}-${guild.id}`;
                    const savedArts  = client.caravanEquip?.get(sessionKey) || [];
                    const channelId = i.message ? i.message.channelId : i.channelId;
                    const result = await sendCaravan(db, user.id, guild.id, destId, savedArts, channelId);

                    if (result.error) {
                        await i.followUp({ content: `❌ ${result.error}`, flags: [MessageFlags.Ephemeral] });
                        activeProcesses.delete(user.id);
                        return;
                    }

                    if (result.caravanId) {
                        await finalizeListings(client, db, result.caravanId, user.id, guild.id);
                        await market.finalizeStagedItems(db, result.caravanId, user.id, guild.id);
                    }

                    if (client.caravanEquip) client.caravanEquip.delete(sessionKey);

                    const listings = result.caravanId
                        ? await market.getListingsByCaravan(db, result.caravanId)
                        : [];

                    await showHub(hubMsg);

                    if (listings.length > 0 && result.caravanId) {
                        const dispatchNow = Date.now();
                        const caravanObj = {
                            userid: user.id,   userID: user.id,
                            guildid: guild.id, guildID: guild.id,
                            destinationid: destId, destinationId: destId,
                            id: result.caravanId,
                            starttime: dispatchNow, startTime: dispatchNow,
                            endtime: result.endTime, endTime: result.endTime,
                        };
                        await market.createMarketThread(client, db, caravanObj, channelId, hubMsg);
                    }
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
                        content: '🛡️ **جاري تجهيز فريق التأمين...**\n⏳ اختر المهام أنت ورفاقك',
                        embeds: [], files: [], components: []
                    }).catch(() => {});

                    const currentChannel = i.message ? i.message.channel : i.channel;

                    startEscortLobby(currentChannel, user, guild, db, dest)
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
                                    channel:      currentChannel,
                                    hubMsg,
                                    db,
                                    getMora,
                                    showHub,
                                    client,
                                });
                                return;
                            }
                            if (!lobbyResult.cancelled) {
                                await currentChannel.send({
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
                            new ButtonBuilder().setCustomId('cv_back').setEmoji('↩️').setStyle(ButtonStyle.Secondary)
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
                            new ButtonBuilder().setCustomId('cv_back').setEmoji('↩️').setStyle(ButtonStyle.Secondary)
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
                            new ButtonBuilder().setCustomId('cv_back').setEmoji('↩️').setStyle(ButtonStyle.Secondary)
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
                    const sessionKey = `${user.id}-${guild.id}`;
                    if (!client.caravanEquip) client.caravanEquip = new Map();
                    if (!client.caravanEquip.has(sessionKey)) {
                        client.caravanEquip.set(sessionKey, [null, null, null]);
                    }

                    await handleEquipFlow(i, sessionKey);
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
                await hubMsg.edit({ components: [navRow(!!activeCheck, true, user.id)] }).catch(() => {});
            } catch(e) {}
        });
    }
};
