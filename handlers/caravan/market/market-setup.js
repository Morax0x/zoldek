const {
    EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
    StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
    MessageFlags,
} = require('discord.js');
const { safeQuery, safeExecute } = require('../db');
const { EMOJI_MORA } = require('../config');
const { createListing, lockItemsFromInventory, getListingsByCaravan, stagingAddItem, getStagedItems, finalizeStagedItems, stagingRemoveItem } = require('./market-db');

const upgradeMats = require('../../../json/upgrade-materials.json');
const seedsData = require('../../../json/seeds.json');
const farmAnimals = require('../../../json/farm-animals.json');
const path = require('path');
const shopItems = require(path.join(process.cwd(), 'json', 'shop-items.json'));

const RARITY_AR = {
    'Common': 'عادي',
    'Uncommon': 'شائع',
    'Rare': 'نادر',
    'Epic': 'ملحمي',
    'Legendary': 'أسطوري'
};

const ITEM_DICT = new Map();

// 👑 بناء قاعدة بيانات مصغرة لكل العناصر في اللعبة (تشمل الأسماك والأسلحة) 👑
function buildItemDict() {
    if (upgradeMats?.weapon_materials) {
        upgradeMats.weapon_materials.forEach(race => {
            race.materials.forEach(m => ITEM_DICT.set(m.id, m));
        });
    }
    if (upgradeMats?.skill_books) {
        upgradeMats.skill_books.forEach(cat => {
            cat.books.forEach(b => ITEM_DICT.set(b.id, b));
        });
    }
    if (seedsData) {
        seedsData.forEach(s => ITEM_DICT.set(s.id, s));
    }
    if (farmAnimals) {
        farmAnimals.forEach(a => ITEM_DICT.set(a.id, a));
    }
    if (shopItems) {
        shopItems.forEach(s => ITEM_DICT.set(s.id, s));
    }
    
    // إضافة الأسماك
    try {
        const fishData = require('../../../json/fish.json');
        if (fishData && fishData.fishItems) {
            fishData.fishItems.forEach(f => ITEM_DICT.set(f.id, f));
        }
    } catch(e) {}

    // إضافة الأسلحة
    try {
        const wepData = require('../../../json/weapons-config.json');
        if (wepData && wepData.weapons) {
            Object.keys(wepData.weapons).forEach(k => {
                wepData.weapons[k].forEach(w => ITEM_DICT.set(w.id, w));
            });
        }
    } catch(e) {}
}

buildItemDict();

function getItemInfo(id) {
    return ITEM_DICT.get(id) || { name: id.replace(/_/g, ' '), emoji: '📦', rarity: 'Common' };
}

function getMarketListingsCache(client, userId, guildId) {
    const key = `market_listings_${userId}_${guildId}`;
    if (!client.marketListings) client.marketListings = new Map();
    if (!client.marketListings.has(key)) {
        client.marketListings.set(key, []);
    }
    return client.marketListings.get(key);
}

// 👑 دوال التنظيف وترحيل البيانات القديمة (مهمة لمنع الكراشات) 👑
function clearMarketListingsCache(client, userId, guildId) {
    const key = `market_listings_${userId}_${guildId}`;
    if (client.marketListings) client.marketListings.delete(key);
}

async function finalizeListings(client, db, caravanId, userId, guildId) {
    const listings = getMarketListingsCache(client, userId, guildId);

    if (!listings || listings.length === 0) return { ok: true, listings: [] };

    const dbListings = [];
    for (const listing of listings) {
        const listingId = await createListing(db, caravanId, userId, guildId, listing);
        if (listingId) {
            dbListings.push({ ...listing, listingId });
        }
    }

    if (dbListings.length > 0) {
        await lockItemsFromInventory(db, guildId, userId, dbListings);
    }

    clearMarketListingsCache(client, userId, guildId);
    return { ok: true, listings: dbListings };
}


// ============================================================================
// [1] دوال حماية المتجر المدمجة (عشان ما يضرب كراش لو كلود نسي يضيفها)
// ============================================================================
async function getStagedItemsSafe(db, userId, guildId) {
    if (typeof getStagedItems === 'function') return await getStagedItems(db, userId, guildId);
    try {
        await safeExecute(db, `CREATE TABLE IF NOT EXISTS caravan_staging_market (id SERIAL PRIMARY KEY, "userID" VARCHAR(50), "guildID" VARCHAR(50), "itemID" VARCHAR(100), "quantity" INTEGER, "pricePerUnit" INTEGER)`);
        const res = await safeQuery(db, `SELECT * FROM caravan_staging_market WHERE "userID"=$1 AND "guildID"=$2`, [userId, guildId]);
        return res?.rows || [];
    } catch { return []; }
}

async function stagingAddItemSafe(db, userId, guildId, itemId, quantity, price) {
    if (typeof stagingAddItem === 'function') return await stagingAddItem(db, userId, guildId, itemId, quantity, price);
    try {
        // الخصم الآمن من المستودع يمنع التدبيل
        const res = await safeQuery(db, `UPDATE user_inventory SET quantity = CAST(COALESCE(quantity, '0') AS INTEGER) - $1 WHERE "userID" = $2 AND "guildID" = $3 AND ("itemID" = $4 OR itemid=$4) AND CAST(COALESCE(quantity, '0') AS INTEGER) >= $1 RETURNING *`, [quantity, userId, guildId, itemId]);
        if (!res || res.rows.length === 0) return { ok: false, error: 'لا تملك كمية كافية من هذا العنصر.' };
        
        await safeExecute(db, `INSERT INTO caravan_staging_market ("userID", "guildID", "itemID", "quantity", "pricePerUnit") VALUES ($1, $2, $3, $4, $5)`, [userId, guildId, itemId, quantity, price]);
        return { ok: true };
    } catch { return { ok: false, error: 'حدث خطأ في قاعدة البيانات.' }; }
}

async function stagingRemoveItemSafe(db, userId, guildId, itemId, quantity) {
    if (typeof stagingRemoveItem === 'function') return await stagingRemoveItem(db, userId, guildId, itemId, quantity);
    try {
        await safeExecute(db, `DELETE FROM caravan_staging_market WHERE "userID"=$1 AND "guildID"=$2 AND ("itemID"=$3 OR itemid=$3) LIMIT 1`, [userId, guildId, itemId]);
        await safeExecute(db, `UPDATE user_inventory SET quantity = CAST(COALESCE(quantity, '0') AS INTEGER) + $1 WHERE "userID" = $2 AND "guildID" = $3 AND ("itemID" = $4 OR itemid=$4)`, [quantity, userId, guildId, itemId]);
        return { ok: true };
    } catch { return { ok: false, error: 'حدث خطأ أثناء الإرجاع.' }; }
}


// ============================================================================
// [2] جلب المخزون والبيانات بأمان تام
// ============================================================================
async function fetchUserInventory(db, userId, guildId) {
    let invRes = await safeQuery(db,
        `SELECT * FROM user_inventory WHERE "userID"=$1 AND "guildID"=$2 AND CAST(COALESCE("quantity",'0') AS BIGINT) > 0`,
        [userId, guildId]);

    if (!invRes || !invRes.rows || invRes.rows.length === 0) {
        invRes = await safeQuery(db,
            `SELECT * FROM user_inventory WHERE userid=$1 AND guildid=$2 AND CAST(COALESCE("quantity",'0') AS BIGINT) > 0`,
            [userId, guildId]);
    }

    return (invRes?.rows || []).map(row => ({
        itemId: row.itemid || row.itemID || row.ITEMID,
        quantity: Number(row.quantity || row.QUANTITY || 0),
    }));
}


// ============================================================================
// [3] الواجهة الرئيسية للمتجر (Staging UI)
// ============================================================================
async function showStagingUI(interaction, db, user, guild) {
    const [staged, inventoryRows] = await Promise.all([
        getStagedItemsSafe(db, user.id, guild.id),
        fetchUserInventory(db, user.id, guild.id),
    ]);

    const stagedIds = new Set(staged.map(s => s.itemID || s.itemid));
    const availableForStaging = inventoryRows.filter(i => !stagedIds.has(i.itemId)).slice(0, 25);

    const expectedProfit = staged.reduce((acc, curr) => acc + (Number(curr.quantity) * Number(curr.pricePerUnit || curr.priceperunit)), 0);

    const embed = new EmbedBuilder()
        .setColor('#F1C40F')
        .setAuthor({ name: `عربة بضائع القافلة لـ ${user.displayName || user.username}`, iconURL: user.displayAvatarURL() })
        .setDescription(
            `🛒 **قم بتحضير بضاعتك هنا قبل الانطلاق!**\n` +
            `اختر العناصر من مخزونك وحدد الكمية والسعر الذي ترغب بالبيع به. بمجرد الانطلاق، سيتم عرض هذه البضائع للزوار تلقائياً.\n\n` +
            `📦 **الأصناف المحملة:** \`${staged.length}\`\n` +
            `💰 **الأرباح المتوقعة:** \`${expectedProfit.toLocaleString()}\` ${EMOJI_MORA}`
        );

    if (staged.length > 0) {
        let itemsText = '';
        staged.forEach((s, idx) => {
            const info = getItemInfo(s.itemID || s.itemid);
            const total = s.quantity * (s.pricePerUnit || s.priceperunit);
            const line = `\`${idx + 1}.\` ${info.emoji || '📦'} **${info.name}** (x${s.quantity}) — بسعر **${(s.pricePerUnit || s.priceperunit).toLocaleString()}** مورا للواحدة.\n`;
            
            if ((itemsText.length + line.length) < 950) {
                itemsText += line;
            } else if (!itemsText.endsWith('... والمزيد\n')) {
                itemsText += '... والمزيد\n';
            }
        });
        
        embed.addFields({ name: `📋 قائمة البضائع المجهزة (${staged.length})`, value: itemsText, inline: false });
    } else {
        embed.addFields({ name: '📋 قائمة البضائع', value: '*العربة فارغة حالياً. قم بإضافة البضائع من القائمة أدناه.*', inline: false });
    }

    const components = [];

    if (availableForStaging.length > 0) {
        const addOptions = availableForStaging.map(item => {
            const info = getItemInfo(item.itemId);
            const rarityTxt = info.rarity ? `[${RARITY_AR[info.rarity] || info.rarity}] ` : '';
            return {
                label: `${info.name?.substring(0, 90) || item.itemId}`,
                value: `stage_${item.itemId}`,
                description: `${rarityTxt}المتوفر: ${item.quantity}`,
                emoji: info.emoji || '📦',
            };
        });
        components.push(
            new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('mkt_stage_add_item')
                    .setPlaceholder('➕ إضافة بضاعة للعربة من المخزون...')
                    .addOptions(addOptions)
            )
        );
    }

    if (staged.length > 0) {
        const removeOptions = staged.slice(0, 25).map((s, idx) => {
            const info = getItemInfo(s.itemID || s.itemid);
            return {
                label: `إزالة: ${info.name?.substring(0, 80) || s.itemID}`,
                value: `unstage_${idx}`,
                description: `الكمية: ${s.quantity} | السعر: ${(s.pricePerUnit || s.priceperunit).toLocaleString()} مورا`,
                emoji: '➖',
            };
        });
        components.push(
            new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('mkt_stage_remove_item')
                    .setPlaceholder('➖ تفريغ بضاعة وإرجاعها للمخزون...')
                    .addOptions(removeOptions)
            )
        );
    }

    components.push(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('cv_back')
                .setLabel('↩️ العودة للرئيسية وإطلاق القافلة')
                .setStyle(ButtonStyle.Success)
        )
    );

    if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ embeds: [embed], components, files: [], content: '' }).catch(() => {});
    } else {
        await interaction.reply({ embeds: [embed], components, flags: [MessageFlags.Ephemeral] }).catch(() => {});
    }
}


// ============================================================================
// [4] التعامل مع المودلات (التسعير والإضافة والإزالة)
// ============================================================================
async function handleStageAddItemSelect(interaction, db, user, guild) {
    const rawValue = interaction.values[0];
    const itemId = rawValue.replace('stage_', '');
    const info = getItemInfo(itemId);

    const inventory = await fetchUserInventory(db, user.id, guild.id);
    const invItem = inventory.find(i => i.itemId === itemId);

    if (!invItem || invItem.quantity <= 0) {
        return await interaction.reply({ content: '❌ لا تملك هذا العنصر في مخزونك الحالي.', flags: [MessageFlags.Ephemeral] });
    }

    const modal = new ModalBuilder()
        .setCustomId(`mkt_stage_price_modal_${itemId}`)
        .setTitle(`تسعير: ${info.name}`.substring(0, 45));

    const qtyInput = new TextInputBuilder()
        .setCustomId('mkt_stage_qty')
        .setLabel(`الكمية (الحد الأقصى: ${invItem.quantity})`.substring(0, 45))
        .setPlaceholder('أدخل عدد الوحدات للبيع')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

    const priceInput = new TextInputBuilder()
        .setCustomId('mkt_stage_price')
        .setLabel(`سعر البيع للحبة الواحدة (مورا)`)
        .setPlaceholder('أدخل السعر (مثال: 500)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

    modal.addComponents(
        new ActionRowBuilder().addComponents(qtyInput),
        new ActionRowBuilder().addComponents(priceInput)
    );

    await interaction.showModal(modal);
}

async function handleStagePriceModalSubmit(modalSubmit, db, user, guild) {
    const itemId = modalSubmit.customId.replace('mkt_stage_price_modal_', '');
    const qtyStr = modalSubmit.fields.getTextInputValue('mkt_stage_qty');
    const priceStr = modalSubmit.fields.getTextInputValue('mkt_stage_price');

    const qty = parseInt(qtyStr);
    const price = parseInt(priceStr);

    if (isNaN(qty) || qty < 1) {
        return modalSubmit.reply({ content: '❌ الكمية غير صالحة. الرجاء إدخال رقم صحيح.', flags: [MessageFlags.Ephemeral] });
    }
    if (isNaN(price) || price < 1) {
        return modalSubmit.reply({ content: '❌ السعر غير صالح. يجب أن يكون أعلى من صفر.', flags: [MessageFlags.Ephemeral] });
    }
    if (price > 999999999) {
        return modalSubmit.reply({ content: '❌ السعر جنوني! الحد الأقصى هو 999,999,999 مورا.', flags: [MessageFlags.Ephemeral] });
    }

    await modalSubmit.deferUpdate().catch(() => {});

    const result = await stagingAddItemSafe(db, user.id, guild.id, itemId, qty, price);
    if (!result.ok) {
        return modalSubmit.followUp({ content: `❌ ${result.error}`, flags: [MessageFlags.Ephemeral] });
    }

    const info = getItemInfo(itemId);
    await modalSubmit.followUp({
        embeds: [new EmbedBuilder()
            .setColor('#2ECC71')
            .setDescription(`✅ تم تحميل **${qty}x ${info.name}** في العربة بسعر **${price.toLocaleString()}** مورا/واحدة!`)
        ],
        flags: [MessageFlags.Ephemeral],
    }).catch(()=>{});

    await showStagingUI(modalSubmit, db, user, guild);
}

async function handleStageRemoveItemSelect(interaction, db, user, guild) {
    await interaction.deferUpdate().catch(() => {});
    
    const rawValue = interaction.values[0];
    const idx = parseInt(rawValue.replace('unstage_', ''));
    const staged = await getStagedItemsSafe(db, user.id, guild.id);

    if (idx < 0 || idx >= staged.length) {
        return await interaction.followUp({ content: '❌ خطأ: لم يتم العثور على العنصر.', flags: [MessageFlags.Ephemeral] });
    }

    const item = staged[idx];
    const itemId = item.itemID || item.itemid;
    const quantity = Number(item.quantity);

    const result = await stagingRemoveItemSafe(db, user.id, guild.id, itemId, quantity);
    if (!result.ok) {
        return await interaction.followUp({ content: `❌ ${result.error}`, flags: [MessageFlags.Ephemeral] });
    }

    const info = getItemInfo(itemId);
    await interaction.followUp({
        embeds: [new EmbedBuilder()
            .setColor('#E74C3C')
            .setDescription(`➖ تم تنزيل **${quantity}x ${info.name}** من العربة وإعادتها لمخزونك.`)
        ],
        flags: [MessageFlags.Ephemeral],
    }).catch(()=>{});

    await showStagingUI(interaction, db, user, guild);
}

module.exports = {
    getItemInfo,
    getMarketListingsCache,
    clearMarketListingsCache,
    fetchUserInventory,
    // Staging Handlers
    showStagingUI,
    handleStageAddItemSelect,
    handleStagePriceModalSubmit,
    handleStageRemoveItemSelect,
    finalizeListings,
};
