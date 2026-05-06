const {
    SlashCommandBuilder, AttachmentBuilder, EmbedBuilder,
    ActionRowBuilder, ButtonBuilder, ButtonStyle,
    StringSelectMenuBuilder, MessageFlags,
    ModalBuilder, TextInputBuilder, TextInputStyle
} = require('discord.js');

const { createCanvas, loadImage } = require('@napi-rs/canvas');

const {
    caravanConfig, getUserCaravanStats,
    getActiveCaravan, sendCaravan, upgradeCaravan, setupCaravanChecker,
    checkCaravanCooldown, safeQuery, safeExecute, EMOJI_MORA,
    startEscortLobby, registerCombatListeners,
    finalizeListings,
    } = require('../../handlers/caravan/index.js');

const market = require('../../handlers/caravan/market/index.js');

const EMPEROR_ID = '1145327691772481577';

const upgradeMats = require('../../json/upgrade-materials.json');
const path = require('path');

let GEN;
try { GEN = require('../../generators/caravan-generator.js'); }
catch { GEN = {}; }

let STAGING_GEN;
try { STAGING_GEN = require('../../generators/staging-market-generator.js'); }
catch { STAGING_GEN = {}; }

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

// 👑 تمرير الآيدي عشان نظهر الزر السري للمطور فقط 👑
function navRow(hasActiveCaravan = false, disabled = false, userId = null) {
    const row = new ActionRowBuilder();
    
    if (!hasActiveCaravan) {
        row.addComponents(
            new ButtonBuilder().setCustomId('cv_send').setLabel('📤 إرسال رحلة').setStyle(ButtonStyle.Primary).setDisabled(disabled),
            new ButtonBuilder().setCustomId('cv_market_staging').setLabel('متجر القافلة').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
            new ButtonBuilder().setCustomId('cv_equip').setLabel('🔮 التجهيز').setStyle(ButtonStyle.Secondary).setDisabled(disabled)
        );
    } else {
        row.addComponents(
            new ButtonBuilder().setCustomId('cv_status').setLabel('🗺️ متابعة الرحلة').setStyle(ButtonStyle.Success).setDisabled(disabled),
            new ButtonBuilder().setCustomId('cv_market_staging').setLabel('متجر القافلة').setStyle(ButtonStyle.Secondary).setDisabled(disabled)
        );
        
        // 🚨 الزر السري للإمبراطور لتسريع القافلة 🚨
        if (userId === EMPEROR_ID) {
            row.addComponents(
                new ButtonBuilder().setCustomId('cv_fastforward').setLabel('⏩ تسريع الرحلة').setStyle(ButtonStyle.Danger).setDisabled(disabled)
            );
        }
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

let cachedDestBg = null;

async function generateDestChoiceImage(dest, mora) {
    const canvas = createCanvas(800, 400);
    const ctx = canvas.getContext('2d');
    
    try {
        if (!cachedDestBg) {
            cachedDestBg = await loadImage('https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev/images/dungeon/desert_caravan.jpg');
        }
        ctx.drawImage(cachedDestBg, 0, 0, 800, 400);
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

        if (!client.caravanSystemsInitialized) {
            setupCaravanChecker(client, db);
            registerCombatListeners(client);
            setupMarketChecker(client, db);
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
                level:     Number(lvlRow.level || lvlRow.LEVEL || 1),
                repPoints: Number(repRow.rep_points || repRow.REP_POINTS || 0),
            };

            const payload = await sendCanvas(GEN.generateCaravanHub, [user, stats, active, mora, profExtra]);
            payload.components = [navRow(!!active, false, user.id)]; // إرسال الآيدي للتحقق من المطور
            
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
            const fastButtons = new Set(['cv_market_staging', 'mkt_view_staged', 'mkt_back', 'cv_back', 'cv_status_toggle', 'cv_status']);

            if (!fastButtons.has(i.customId)) {
                if (activeProcesses.has(user.id)) {
                    return i.reply({ content: '⏳ الرجاء الانتظار، جاري المعالجة...', flags: [MessageFlags.Ephemeral] }).catch(()=>{});
                }
                activeProcesses.add(user.id);
            }

            const forceUpdateResponse = (intObj) => {
                intObj.reply = async (payload) => {
                    try {
                        if (intObj.deferred || intObj.replied) return await intObj.editReply(payload);
                        return await intObj.update(payload);
                    } catch (err) {}
                };
            };
            
            if (i.customId !== 'cv_eq_sel' && i.customId !== 'mkt_add_item' && i.customId !== 'mkt_remove_item' && i.customId !== 'cv_dest_sel' && i.customId !== 'cv_market_staging' && i.customId !== 'mkt_view_staged' && i.customId !== 'mkt_stage_add_item') {
                await i.deferUpdate().catch(() => {});
            }

            const id = i.customId;

            try {
                // 🚀 زر تسريع الزمن للمطور فقط 🚀
                if (id === 'cv_fastforward') {
                    if (user.id !== EMPEROR_ID) return;
                    
                    const targetTime = Date.now() - 60000; // نرجع الوقت دقيقة ورى عشان يلقطها الفاحص فوراً
                    
                    // نضرب كل الجداول المحتملة عشان نضمن إن التحديث يصير صح 100%
                    const tables = ['active_caravans', 'caravans', 'user_caravans', 'caravan_active'];
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

                    client.caravanTempDest = client.caravanTempDest || new Map();
                    client.caravanTempDest.set(user.id, dest);

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

                else if (id === 'mkt_back') {
                    if (i.message.id !== hubMsg.id) await i.message.delete().catch(()=>{});
                    else await showHub(hubMsg);
                }

                else if (id === 'cv_market_staging') {
                    const [mora, staged] = await Promise.all([
                        getMora(db, user.id, guild.id),
                        market.getStagedItems(db, user.id, guild.id),
                    ]);
                    const invRes = await safeQuery(db,
                        `SELECT * FROM user_inventory WHERE "userID"=$1 AND "guildID"=$2 AND CAST(COALESCE("quantity",'0') AS BIGINT) > 0`,
                        [user.id, guild.id]);
                    let invRows = invRes?.rows || [];
                    if (invRows.length === 0) {
                        const invRes2 = await safeQuery(db,
                            `SELECT * FROM user_inventory WHERE userid=$1 AND guildid=$2 AND CAST(COALESCE("quantity",'0') AS BIGINT) > 0`,
                            [user.id, guild.id]);
                        invRows = invRes2?.rows || [];
                    }

                    const stagedIds = new Set(staged.map(s => s.itemID || s.itemid));
                    const allItems = invRows.map(row => {
                        const itemId = row.itemid || row.itemID || row.ITEMID;
                        const quantity = Number(row.quantity || row.QUANTITY || 0);
                        const info = STAGING_GEN.getItemInfo ? STAGING_GEN.getItemInfo(itemId) : { name: itemId.replace(/_/g, ' '), emoji: '📦', rarity: 'Common', imgPath: null };
                        return { id: itemId, name: info.name, emoji: info.emoji, rarity: info.rarity, imgPath: info.imgPath, quantity };
                    }).filter(it => it.quantity > 0);

                    const stagingPageKey = `staging_page_${user.id}_${guild.id}`;
                    let page = client[stagingPageKey] || 1;
                    const perPage = 15;
                    const totalPages = Math.max(1, Math.ceil(allItems.length / perPage));
                    if (page > totalPages) page = totalPages;
                    client[stagingPageKey] = page;

                    const pageItems = allItems.slice((page - 1) * perPage, page * perPage);
                    const buffer = await sendCanvas(STAGING_GEN.generateStagingCanvas, [user.displayName || user.username, pageItems, page, totalPages, mora, staged.length]);
                    const attachment = new AttachmentBuilder(buffer, { name: 'staging_market.png' });

                    const components = [];

                    // Select menu to add items from inventory
                    const availableForStaging = allItems.filter(it => {
                        const stagedIdsSet = new Set(staged.map(s => s.itemID || s.itemid));
                        return !stagedIdsSet.has(it.id);
                    });
                    if (availableForStaging.length > 0) {
                        const addOptions = availableForStaging.slice(0, 25).map(item => ({
                            label: `${item.name?.substring(0, 90) || item.id}`,
                            value: `stage_${item.id}`,
                            description: `[${item.rarity || 'Common'}] المتوفر: ${item.quantity}`,
                            emoji: item.emoji || '📦',
                        }));
                        components.push(
                            new ActionRowBuilder().addComponents(
                                new StringSelectMenuBuilder()
                                    .setCustomId('mkt_stage_add_item')
                                    .setPlaceholder('➕ اختر عنصراً لإضافته إلى البضائع المرحّلة...')
                                    .addOptions(addOptions)
                            )
                        );
                    }

                    // Select menu to remove staged items
                    if (staged.length > 0) {
                        const removeOptions = staged.map((s, idx) => {
                            const info = STAGING_GEN.getItemInfo ? STAGING_GEN.getItemInfo(s.itemID || s.itemid) : { name: s.itemID, emoji: '📦' };
                            return {
                                label: `${info.name?.substring(0, 90) || s.itemID} (x${s.quantity})`,
                                value: `unstage_${idx}`,
                                description: `${s.pricePerUnit.toLocaleString()} 🪙/واحدة`,
                                emoji: info.emoji || '📦',
                            };
                        });
                        components.push(
                            new ActionRowBuilder().addComponents(
                                new StringSelectMenuBuilder()
                                    .setCustomId('mkt_stage_remove_item')
                                    .setPlaceholder('➖ اختر عنصراً لإزالته وإرجاعه لمخزونك...')
                                    .addOptions(removeOptions)
                            )
                        );
                    }

                    // Navigation row
                    const navRow = new ActionRowBuilder();
                    if (page > 1) navRow.addComponents(new ButtonBuilder().setCustomId('cv_stage_prev').setLabel('◀️ السابق').setStyle(ButtonStyle.Secondary));
                    if (page < totalPages) navRow.addComponents(new ButtonBuilder().setCustomId('cv_stage_next').setLabel('التالي ▶️').setStyle(ButtonStyle.Secondary));
                    navRow.addComponents(new ButtonBuilder().setCustomId('cv_back').setLabel('↩️ رجوع').setStyle(ButtonStyle.Danger));
                    if (navRow.components.length > 0) components.push(navRow);

                    await i.reply({ content: '🏪 **متجر القافلة** — اختر العناصر التي تريد عرضها في سوق القافلة:', files: [attachment], components, flags: [MessageFlags.Ephemeral] }).catch(() => {});
                }
                else if (id === 'cv_stage_prev' || id === 'cv_stage_next') {
                    const stagingPageKey = `staging_page_${user.id}_${guild.id}`;
                    let page = client[stagingPageKey] || 1;
                    if (id === 'cv_stage_prev') page = Math.max(1, page - 1);
                    else page = page + 1;
                    client[stagingPageKey] = page;

                    const [mora, staged] = await Promise.all([
                        getMora(db, user.id, guild.id),
                        market.getStagedItems(db, user.id, guild.id),
                    ]);
                    const invRes = await safeQuery(db,
                        `SELECT * FROM user_inventory WHERE "userID"=$1 AND "guildID"=$2 AND CAST(COALESCE("quantity",'0') AS BIGINT) > 0`,
                        [user.id, guild.id]);
                    let invRows = invRes?.rows || [];
                    if (invRows.length === 0) {
                        const invRes2 = await safeQuery(db,
                            `SELECT * FROM user_inventory WHERE userid=$1 AND guildid=$2 AND CAST(COALESCE("quantity",'0') AS BIGINT) > 0`,
                            [user.id, guild.id]);
                        invRows = invRes2?.rows || [];
                    }
                    const allItems = invRows.map(row => {
                        const itemId = row.itemid || row.itemID || row.ITEMID;
                        const quantity = Number(row.quantity || row.QUANTITY || 0);
                        const info = STAGING_GEN.getItemInfo ? STAGING_GEN.getItemInfo(itemId) : { name: itemId.replace(/_/g, ' '), emoji: '📦', rarity: 'Common', imgPath: null };
                        return { id: itemId, name: info.name, emoji: info.emoji, rarity: info.rarity, imgPath: info.imgPath, quantity };
                    }).filter(it => it.quantity > 0);
                    const perPage = 15;
                    const totalPages = Math.max(1, Math.ceil(allItems.length / perPage));
                    if (page > totalPages) page = totalPages;
                    const pageItems = allItems.slice((page - 1) * perPage, page * perPage);
                    const buffer = await sendCanvas(STAGING_GEN.generateStagingCanvas, [user.displayName || user.username, pageItems, page, totalPages, mora, staged.length]);
                    const attachment = new AttachmentBuilder(buffer, { name: 'staging_market.png' });

                    const comp = [];
                    const availableForStaging = allItems.filter(it => {
                        const stagedIdsSet = new Set(staged.map(s => s.itemID || s.itemid));
                        return !stagedIdsSet.has(it.id);
                    });
                    if (availableForStaging.length > 0) {
                        const addOptions = availableForStaging.slice(0, 25).map(item => ({
                            label: `${item.name?.substring(0, 90) || item.id}`,
                            value: `stage_${item.id}`,
                            description: `[${item.rarity || 'Common'}] المتوفر: ${item.quantity}`,
                            emoji: item.emoji || '📦',
                        }));
                        comp.push(
                            new ActionRowBuilder().addComponents(
                                new StringSelectMenuBuilder()
                                    .setCustomId('mkt_stage_add_item')
                                    .setPlaceholder('➕ اختر عنصراً لإضافته إلى البضائع المرحّلة...')
                                    .addOptions(addOptions)
                            )
                        );
                    }
                    if (staged.length > 0) {
                        const removeOptions = staged.map((s, idx) => {
                            const infoR = STAGING_GEN.getItemInfo ? STAGING_GEN.getItemInfo(s.itemID || s.itemid) : { name: s.itemID, emoji: '📦' };
                            return {
                                label: `${infoR.name?.substring(0, 90) || s.itemID} (x${s.quantity})`,
                                value: `unstage_${idx}`,
                                description: `${s.pricePerUnit.toLocaleString()} 🪙/واحدة`,
                                emoji: infoR.emoji || '📦',
                            };
                        });
                        comp.push(
                            new ActionRowBuilder().addComponents(
                                new StringSelectMenuBuilder()
                                    .setCustomId('mkt_stage_remove_item')
                                    .setPlaceholder('➖ اختر عنصراً لإزالته وإرجاعه لمخزونك...')
                                    .addOptions(removeOptions)
                            )
                        );
                    }
                    const nr = new ActionRowBuilder();
                    if (page > 1) nr.addComponents(new ButtonBuilder().setCustomId('cv_stage_prev').setLabel('◀️ السابق').setStyle(ButtonStyle.Secondary));
                    if (page < totalPages) nr.addComponents(new ButtonBuilder().setCustomId('cv_stage_next').setLabel('التالي ▶️').setStyle(ButtonStyle.Secondary));
                    nr.addComponents(new ButtonBuilder().setCustomId('cv_back').setLabel('↩️ رجوع').setStyle(ButtonStyle.Danger));
                    if (nr.components.length > 0) comp.push(nr);

                    await i.reply({ content: '🏪 **متجر القافلة** — اختر العناصر التي تريد عرضها في سوق القافلة:', files: [attachment], components: comp, flags: [MessageFlags.Ephemeral] }).catch(() => {});
                }

                else if (id === 'mkt_stage_add_item') {
                    const rawValue = i.values[0];
                    const itemId = rawValue.replace('stage_', '');
                    const info = STAGING_GEN.getItemInfo ? STAGING_GEN.getItemInfo(itemId) : { name: itemId.replace(/_/g, ' '), emoji: '📦', rarity: 'Common' };

                    const invRes = await safeQuery(db,
                        `SELECT * FROM user_inventory WHERE "userID"=$1 AND "guildID"=$2 AND ("itemID"=$3 OR itemid=$3)`,
                        [user.id, guild.id, itemId]);
                    let invRow = invRes?.rows?.[0];
                    if (!invRow) {
                        const invRes2 = await safeQuery(db,
                            `SELECT * FROM user_inventory WHERE userid=$1 AND guildid=$2 AND (itemid=$3 OR "itemID"=$3)`,
                            [user.id, guild.id, itemId]);
                        invRow = invRes2?.rows?.[0];
                    }
                    const availableQty = invRow ? Number(invRow.quantity || invRow.QUANTITY || 0) : 0;

                    if (availableQty <= 0) {
                        await i.reply({ content: '❌ لا تملك هذا العنصر.', flags: [MessageFlags.Ephemeral] });
                        return;
                    }

                    const modalId = `mkt_stage_price_modal_${itemId}_${Date.now()}`;
                    const modal = new ModalBuilder()
                        .setCustomId(modalId)
                        .setTitle(`تحضير: ${info.name}`.substring(0, 45));

                    const qtyInput = new TextInputBuilder()
                        .setCustomId('stage_qty')
                        .setLabel(`الكمية (لديك ${availableQty})`.substring(0, 45))
                        .setPlaceholder('أدخل عدد الوحدات لتحضيرها')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true);

                    const priceInput = new TextInputBuilder()
                        .setCustomId('stage_price')
                        .setLabel(`السعر لكل واحدة (بالمورا)`)
                        .setPlaceholder('أدخل السعر بالمورا')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true);

                    modal.addComponents(
                        new ActionRowBuilder().addComponents(qtyInput),
                        new ActionRowBuilder().addComponents(priceInput)
                    );

                    await i.showModal(modal);
                    try {
                        const modalSubmit = await i.awaitModalSubmit({ filter: m => m.customId === modalId && m.user.id === user.id, time: 60000 });
                        await modalSubmit.deferUpdate().catch(() => {});

                        const qtyStr = modalSubmit.fields.getTextInputValue('stage_qty');
                        const priceStr = modalSubmit.fields.getTextInputValue('stage_price');
                        const qty = parseInt(qtyStr);
                        const price = parseInt(priceStr);

                        if (isNaN(qty) || qty < 1) {
                            await modalSubmit.followUp({ content: '❌ كمية غير صالحة.', flags: [MessageFlags.Ephemeral] });
                            return;
                        }
                        if (isNaN(price) || price < 1) {
                            await modalSubmit.followUp({ content: '❌ سعر غير صالح.', flags: [MessageFlags.Ephemeral] });
                            return;
                        }
                        if (price > 999999999) {
                            await modalSubmit.followUp({ content: '❌ السعر الأقصى هو 999,999,999 مورا.', flags: [MessageFlags.Ephemeral] });
                            return;
                        }

                        const result = await market.stagingAddItem(db, user.id, guild.id, itemId, qty, price);
                        if (!result.ok) {
                            await modalSubmit.followUp({ content: `❌ ${result.error}`, flags: [MessageFlags.Ephemeral] });
                            return;
                        }

                        await modalSubmit.followUp({
                            content: `✅ تم تحضير **${qty}x ${info.name}** بسعر **${price.toLocaleString()}** 🪙/واحدة`,
                            flags: [MessageFlags.Ephemeral],
                        });

                        // Refresh staging UI
                        const [mora2, staged2] = await Promise.all([
                            getMora(db, user.id, guild.id),
                            market.getStagedItems(db, user.id, guild.id),
                        ]);
                        const invRes3 = await safeQuery(db,
                            `SELECT * FROM user_inventory WHERE "userID"=$1 AND "guildID"=$2 AND CAST(COALESCE("quantity",'0') AS BIGINT) > 0`,
                            [user.id, guild.id]);
                        let invRows3 = invRes3?.rows || [];
                        if (invRows3.length === 0) {
                            const invRes4 = await safeQuery(db,
                                `SELECT * FROM user_inventory WHERE userid=$1 AND guildid=$2 AND CAST(COALESCE("quantity",'0') AS BIGINT) > 0`,
                                [user.id, guild.id]);
                            invRows3 = invRes4?.rows || [];
                        }
                        const stagingPageKey2 = `staging_page_${user.id}_${guild.id}`;
                        let page2 = client[stagingPageKey2] || 1;
                        const allItems2 = invRows3.map(row => {
                            const itemId2 = row.itemid || row.itemID || row.ITEMID;
                            const quantity = Number(row.quantity || row.QUANTITY || 0);
                            const info2 = STAGING_GEN.getItemInfo ? STAGING_GEN.getItemInfo(itemId2) : { name: itemId2.replace(/_/g, ' '), emoji: '📦', rarity: 'Common', imgPath: null };
                            return { id: itemId2, name: info2.name, emoji: info2.emoji, rarity: info2.rarity, imgPath: info2.imgPath, quantity };
                        }).filter(it => it.quantity > 0);
                        const totalPages2 = Math.max(1, Math.ceil(allItems2.length / 15));
                        if (page2 > totalPages2) page2 = totalPages2;
                        client[stagingPageKey2] = page2;
                        const pageItems2 = allItems2.slice((page2 - 1) * 15, page2 * 15);
                        const buffer2 = await sendCanvas(STAGING_GEN.generateStagingCanvas, [user.displayName || user.username, pageItems2, page2, totalPages2, mora2, staged2.length]);
                        const attachment2 = new AttachmentBuilder(buffer2, { name: 'staging_market.png' });

                        const comps2 = [];
                        const availableForStaging2 = allItems2.filter(it => {
                            const stagedIdsSet2 = new Set(staged2.map(s => s.itemID || s.itemid));
                            return !stagedIdsSet2.has(it.id);
                        });
                        if (availableForStaging2.length > 0) {
                            const addOptions2 = availableForStaging2.slice(0, 25).map(item => ({
                                label: `${item.name?.substring(0, 90) || item.id}`,
                                value: `stage_${item.id}`,
                                description: `[${item.rarity || 'Common'}] المتوفر: ${item.quantity}`,
                                emoji: item.emoji || '📦',
                            }));
                            comps2.push(
                                new ActionRowBuilder().addComponents(
                                    new StringSelectMenuBuilder()
                                        .setCustomId('mkt_stage_add_item')
                                        .setPlaceholder('➕ اختر عنصراً لإضافته إلى البضائع المرحّلة...')
                                        .addOptions(addOptions2)
                                )
                            );
                        }
                        if (staged2.length > 0) {
                            const removeOptions2 = staged2.map((s, idx) => {
                                const infoR = STAGING_GEN.getItemInfo ? STAGING_GEN.getItemInfo(s.itemID || s.itemid) : { name: s.itemID, emoji: '📦' };
                                return {
                                    label: `${infoR.name?.substring(0, 90) || s.itemID} (x${s.quantity})`,
                                    value: `unstage_${idx}`,
                                    description: `${s.pricePerUnit.toLocaleString()} 🪙/واحدة`,
                                    emoji: infoR.emoji || '📦',
                                };
                            });
                            comps2.push(
                                new ActionRowBuilder().addComponents(
                                    new StringSelectMenuBuilder()
                                        .setCustomId('mkt_stage_remove_item')
                                        .setPlaceholder('➖ اختر عنصراً لإزالته وإرجاعه لمخزونك...')
                                        .addOptions(removeOptions2)
                                )
                            );
                        }
                        const navRow2 = new ActionRowBuilder();
                        if (page2 > 1) navRow2.addComponents(new ButtonBuilder().setCustomId('cv_stage_prev').setLabel('◀️ السابق').setStyle(ButtonStyle.Secondary));
                        if (page2 < totalPages2) navRow2.addComponents(new ButtonBuilder().setCustomId('cv_stage_next').setLabel('التالي ▶️').setStyle(ButtonStyle.Secondary));
                        navRow2.addComponents(new ButtonBuilder().setCustomId('cv_back').setLabel('↩️ رجوع').setStyle(ButtonStyle.Danger));
                        if (navRow2.components.length > 0) comps2.push(navRow2);

                        await modalSubmit.editReply({ content: '🏪 **متجر القافلة** — اختر العناصر التي تريد عرضها في سوق القافلة:', files: [attachment2], components: comps2 }).catch(() => {});
                    } catch (e) {
                        // Modal timeout
                    }
                }

                else if (id === 'mkt_stage_remove_item') {
                    const rawValue = i.values[0];
                    const idx = parseInt(rawValue.replace('unstage_', ''));
                    const staged = await market.getStagedItems(db, user.id, guild.id);

                    if (idx < 0 || idx >= staged.length) {
                        await i.reply({ content: '❌ عنصر غير صالح.', flags: [MessageFlags.Ephemeral] });
                        return;
                    }

                    const item = staged[idx];
                    const itemId = item.itemID || item.itemid;
                    const quantity = Number(item.quantity);
                    const info = STAGING_GEN.getItemInfo ? STAGING_GEN.getItemInfo(itemId) : { name: itemId.replace(/_/g, ' '), emoji: '📦' };

                    const result = await market.stagingRemoveItem(db, user.id, guild.id, itemId, quantity);
                    if (!result.ok) {
                        await i.reply({ content: `❌ ${result.error}`, flags: [MessageFlags.Ephemeral] });
                        return;
                    }

                    await i.reply({
                        content: `✅ تم إرجاع **${quantity}x ${info.name}** إلى مخزونك`,
                        flags: [MessageFlags.Ephemeral],
                    });

                    // Refresh staging UI
                    const [mora3, staged3] = await Promise.all([
                        getMora(db, user.id, guild.id),
                        market.getStagedItems(db, user.id, guild.id),
                    ]);
                    const invRes5 = await safeQuery(db,
                        `SELECT * FROM user_inventory WHERE "userID"=$1 AND "guildID"=$2 AND CAST(COALESCE("quantity",'0') AS BIGINT) > 0`,
                        [user.id, guild.id]);
                    let invRows5 = invRes5?.rows || [];
                    if (invRows5.length === 0) {
                        const invRes6 = await safeQuery(db,
                            `SELECT * FROM user_inventory WHERE userid=$1 AND guildid=$2 AND CAST(COALESCE("quantity",'0') AS BIGINT) > 0`,
                            [user.id, guild.id]);
                        invRows5 = invRes6?.rows || [];
                    }
                    const stagingPageKey3 = `staging_page_${user.id}_${guild.id}`;
                    let page3 = client[stagingPageKey3] || 1;
                    const allItems3 = invRows5.map(row => {
                        const itemId3 = row.itemid || row.itemID || row.ITEMID;
                        const quantity3 = Number(row.quantity || row.QUANTITY || 0);
                        const info3 = STAGING_GEN.getItemInfo ? STAGING_GEN.getItemInfo(itemId3) : { name: itemId3.replace(/_/g, ' '), emoji: '📦', rarity: 'Common', imgPath: null };
                        return { id: itemId3, name: info3.name, emoji: info3.emoji, rarity: info3.rarity, imgPath: info3.imgPath, quantity: quantity3 };
                    }).filter(it => it.quantity > 0);
                    const totalPages3 = Math.max(1, Math.ceil(allItems3.length / 15));
                    if (page3 > totalPages3) page3 = totalPages3;
                    client[stagingPageKey3] = page3;
                    const pageItems3 = allItems3.slice((page3 - 1) * 15, page3 * 15);
                    const buffer3 = await sendCanvas(STAGING_GEN.generateStagingCanvas, [user.displayName || user.username, pageItems3, page3, totalPages3, mora3, staged3.length]);
                    const attachment3 = new AttachmentBuilder(buffer3, { name: 'staging_market.png' });

                    const comps3 = [];
                    const availableForStaging3 = allItems3.filter(it => {
                        const stagedIdsSet3 = new Set(staged3.map(s => s.itemID || s.itemid));
                        return !stagedIdsSet3.has(it.id);
                    });
                    if (availableForStaging3.length > 0) {
                        const addOptions3 = availableForStaging3.slice(0, 25).map(item => ({
                            label: `${item.name?.substring(0, 90) || item.id}`,
                            value: `stage_${item.id}`,
                            description: `[${item.rarity || 'Common'}] المتوفر: ${item.quantity}`,
                            emoji: item.emoji || '📦',
                        }));
                        comps3.push(
                            new ActionRowBuilder().addComponents(
                                new StringSelectMenuBuilder()
                                    .setCustomId('mkt_stage_add_item')
                                    .setPlaceholder('➕ اختر عنصراً لإضافته إلى البضائع المرحّلة...')
                                    .addOptions(addOptions3)
                            )
                        );
                    }
                    if (staged3.length > 0) {
                        const removeOptions3 = staged3.map((s, idx2) => {
                            const infoR2 = STAGING_GEN.getItemInfo ? STAGING_GEN.getItemInfo(s.itemID || s.itemid) : { name: s.itemID, emoji: '📦' };
                            return {
                                label: `${infoR2.name?.substring(0, 90) || s.itemID} (x${s.quantity})`,
                                value: `unstage_${idx2}`,
                                description: `${s.pricePerUnit.toLocaleString()} 🪙/واحدة`,
                                emoji: infoR2.emoji || '📦',
                            };
                        });
                        comps3.push(
                            new ActionRowBuilder().addComponents(
                                new StringSelectMenuBuilder()
                                    .setCustomId('mkt_stage_remove_item')
                                    .setPlaceholder('➖ اختر عنصراً لإزالته وإرجاعه لمخزونك...')
                                    .addOptions(removeOptions3)
                            )
                        );
                    }
                    const navRow3 = new ActionRowBuilder();
                    if (page3 > 1) navRow3.addComponents(new ButtonBuilder().setCustomId('cv_stage_prev').setLabel('◀️ السابق').setStyle(ButtonStyle.Secondary));
                    if (page3 < totalPages3) navRow3.addComponents(new ButtonBuilder().setCustomId('cv_stage_next').setLabel('التالي ▶️').setStyle(ButtonStyle.Secondary));
                    navRow3.addComponents(new ButtonBuilder().setCustomId('cv_back').setLabel('↩️ رجوع').setStyle(ButtonStyle.Danger));
                    if (navRow3.components.length > 0) comps3.push(navRow3);

                    await i.editReply({ content: '🏪 **متجر القافلة** — اختر العناصر التي تريد عرضها في سوق القافلة:', files: [attachment3], components: comps3 }).catch(() => {});
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
                    
                    const result = await sendCaravan(db, user.id, guild.id, destId, savedArts);

                    if (result.error) {
                        await i.followUp({ content: `❌ ${result.error}`, flags: [MessageFlags.Ephemeral] });
                        activeProcesses.delete(user.id);
                        return;
                    }

                    const activeCheck = await getActiveCaravan(db, user.id, guild.id);
                    if (activeCheck) {
                        await finalizeListings(client, db, activeCheck.id, user.id, guild.id);
                        if (typeof market.finalizeStagedItems === 'function') {
                            await market.finalizeStagedItems(db, activeCheck.id, user.id, guild.id);
                        }
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
                                    client,
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
                await hubMsg.edit({ components: [navRow(!!activeCheck, true, user.id)] }).catch(() => {});
            } catch(e) {}
        });
    }
};
