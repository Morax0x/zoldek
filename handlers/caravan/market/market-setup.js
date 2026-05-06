const {
    EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
    StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
    MessageFlags,
} = require('discord.js');
const { safeQuery, safeExecute } = require('../db');
const { EMOJI_MORA } = require('../config');
const { createListing, lockItemsFromInventory, stagingAddItem, getStagedItems, stagingRemoveItem } = require('./market-db');

const path = require('path');
const upgradeMats = require('../../../json/upgrade-materials.json');
let fishData = [], farmSeeds = [], farmFeeds = [], potionsData = [], marketData = [], baitsData = [];

try { 
    const fishJson = require('../../../json/fishing-config.json') || require('../../../json/fish.json');
    fishData = fishJson.fishItems || fishJson; 
} catch(e) {}
try { baitsData = require('../../../json/baits.json'); } catch(e) {}
try { farmSeeds = require('../../../json/seeds.json'); } catch(e) {}
try { farmFeeds = require('../../../json/feed-items.json'); } catch(e) {}
try { potionsData = require('../../../json/potions.json'); } catch(e) {}
try { marketData = require('../../../json/market-items.json'); } catch(e) {}

const ITEM_DICTIONARY = new Map();

const ID_TO_IMAGE = {
    'mat_dragon_1': 'dragon_ash.png', 'mat_dragon_2': 'dragon_scale.png', 'mat_dragon_3': 'dragon_claw.png', 'mat_dragon_4': 'dragon_heart.png', 'mat_dragon_5': 'dragon_core.png',
    'mat_human_1': 'human_iron.png', 'mat_human_2': 'human_steel.png', 'mat_human_3': 'human_meteor.png', 'mat_human_4': 'human_seal.png', 'mat_human_5': 'human_crown.png',
    'mat_elf_1': 'elf_branch.png', 'mat_elf_2': 'elf_bark.png', 'mat_elf_3': 'elf_flower.png', 'mat_elf_4': 'elf_crystal.png', 'mat_elf_5': 'elf_tear.png',
    'mat_darkelf_1': 'darkelf_obsidian.png', 'mat_darkelf_2': 'darkelf_glass.png', 'mat_darkelf_3': 'darkelf_crystal.png', 'mat_darkelf_4': 'darkelf_void.png', 'mat_darkelf_5': 'darkelf_ash.png',
    'mat_seraphim_1': 'seraphim_feathe.png', 'mat_seraphim_2': 'seraphim_halo.png', 'mat_seraphim_3': 'seraphim_crystal.png', 'mat_seraphim_4': 'seraphim_core.png', 'mat_seraphim_5': 'seraphim_chalice.png',
    'demon_1': 'demon_ember.png', 'mat_demon_2': 'demon_horn.png', 'mat_demon_3': 'demon_crystal.png', 'mat_demon_4': 'demon_flame.png', 'mat_demon_5': 'demon_crown.png',
    'mat_vampire_1': 'vampire_blood.png', 'mat_vampire_2': 'vampire_vial.png', 'mat_vampire_3': 'vampire_fang.png', 'mat_vampire_4': 'vampire_moon.png', 'mat_vampire_5': 'vampire_chalice.png',
    'mat_spirit_1': 'spirit_dust.png', 'mat_spirit_2': 'spirit_remnant.png', 'mat_spirit_3': 'spirit_crystal.png', 'mat_spirit_4': 'spirit_core.png', 'mat_spirit_5': 'spirit_pulse.png',
    'mat_hybrid_1': 'hybrid_claw.png', 'mat_hybrid_2': 'hybrid_fur.png', 'mat_hybrid_3': 'hybrid_bone.png', 'mat_hybrid_4': 'hybrid_crystal.png', 'mat_hybrid_5': 'hybrid_soul.png',
    'mat_dwarf_1': 'dwarf_copper.png', 'mat_dwarf_2': 'dwarf_bronze.png', 'mat_dwarf_3': 'dwarf_mithril.png', 'mat_dwarf_4': 'dwarf_heart.png', 'mat_dwarf_5': 'dwarf_hammer.png',
    'mat_ghoul_1': 'ghoul_bone.png', 'mat_ghoul_2': 'ghoul_remains.png', 'mat_ghoul_3': 'ghoul_skull.png', 'mat_ghoul_4': 'ghoul_crystal.png', 'mat_ghoul_5': 'ghoul_core.png',
    'book_general_1': 'gen_book_tactic.png', 'book_general_2': 'gen_book_combat.png', 'book_general_3': 'gen_book_arts.png', 'book_general_4': 'gen_book_war.png', 'book_general_5': 'gen_book_wisdom.png',
    'book_race_1': 'race_book_stone.png', 'book_race_2': 'race_book_ancestor.png', 'book_race_3': 'race_book_secrets.png', 'book_race_4': 'race_book_covenant.png', 'book_race_5': 'race_book_pact.png'
};

function buildDictionary() {
    if (upgradeMats && upgradeMats.weapon_materials) {
        for (const race of upgradeMats.weapon_materials) {
            for (const mat of race.materials) {
                ITEM_DICTIONARY.set(mat.id, { name: mat.name, emoji: mat.emoji, category: 'materials', rarity: mat.rarity, imgPath: `images/materials/${race.race.toLowerCase().replace(' ', '_')}/${ID_TO_IMAGE[mat.id] || mat.id + '.png'}` });
            }
        }
    }
    if (upgradeMats && upgradeMats.skill_books) {
        for (const cat of upgradeMats.skill_books) {
            const typeFolder = cat.category === 'General_Skills' ? 'general' : 'race';
            for (const book of cat.books) {
                ITEM_DICTIONARY.set(book.id, { name: book.name, emoji: book.emoji, category: 'materials', rarity: book.rarity, imgPath: `images/materials/${typeFolder}/${ID_TO_IMAGE[book.id] || book.id + '.png'}` });
            }
        }
    }
    
    if (fishData && Array.isArray(fishData)) {
        for (const fish of fishData) {
            ITEM_DICTIONARY.set(fish.id, { name: fish.name, emoji: fish.emoji || '🐟', category: 'materials', rarity: fish.rarity > 3 ? 'Epic' : 'Common', imgPath: fish.image || null });
        }
    }

    if (baitsData && Array.isArray(baitsData)) {
        for (const bait of baitsData) {
            ITEM_DICTIONARY.set(bait.id, { name: bait.name, emoji: bait.emoji || '🪱', category: 'fishing', rarity: 'Common', imgPath: bait.image || null });
        }
    }

    if (farmSeeds && Array.isArray(farmSeeds)) {
        for (const seed of farmSeeds) {
            ITEM_DICTIONARY.set(seed.id, { name: seed.name, emoji: seed.emoji || '🌾', category: 'farming', rarity: 'Common', imgPath: seed.image || `images/farm/seeds/${seed.id}.png` });
        }
    }
    if (farmFeeds && Array.isArray(farmFeeds)) {
        for (const feed of farmFeeds) {
            ITEM_DICTIONARY.set(feed.id, { name: feed.name, emoji: feed.emoji || '🌾', category: 'farming', rarity: 'Common', imgPath: feed.image || `images/feeds/${feed.id}.png` });
        }
    }
    if (potionsData && Array.isArray(potionsData)) {
        for (const potion of potionsData) {
            ITEM_DICTIONARY.set(potion.id, { name: potion.name, emoji: potion.emoji || '🧪', category: 'potions', rarity: 'Rare', imgPath: potion.image || `images/potions/${potion.id}.png` });
        }
    }
    if (marketData && Array.isArray(marketData)) {
        for (const market of marketData) {
            ITEM_DICTIONARY.set(market.id, { name: market.name, emoji: '📈', category: 'market', rarity: 'Epic', imgPath: market.image || `images/market/${market.id.toLowerCase()}.png` });
        }
    }
}

buildDictionary();

// 👑 الدالة اللي نسيتها وسببت الكراش (تم إضافتها وتصحيحها) 👑
function getItemInfo(itemId) {
    if (!itemId) return { name: 'مجهول', emoji: '❓', category: 'others', rarity: 'Common', imgPath: null };
    if (ITEM_DICTIONARY.has(itemId)) {
        return ITEM_DICTIONARY.get(itemId);
    }
    if (itemId.startsWith('bait_')) {
         return { name: `طعم ${itemId.split('_')[1]}`, emoji: '🪱', category: 'fishing', rarity: 'Common', imgPath: null };
    }
    return { name: itemId.replace(/_/g, ' '), emoji: '📦', category: 'others', rarity: 'Common', imgPath: null };
}

// دمج اسم الدالتين عشان أي ملف ثاني يستدعيها ما يضرب كراش
const resolveItemInfo = getItemInfo;

const CATEGORY_NAMES = {
    'materials': '💎 موارد وتطوير',
    'fishing': '🎣 أدوات الصيد',
    'farming': '🌾 المزرعة',
    'potions': '🧪 الجرعات',
    'market': '📈 أسهم وسوق',
    'others': '📦 عناصر أخرى'
};

const RARITY_AR = {
    'Common': 'عادي',
    'Uncommon': 'شائع',
    'Rare': 'نادر',
    'Epic': 'ملحمي',
    'Legendary': 'أسطوري'
};

async function getInventoryCategories(db, userId, guildId) {
    let inventory = [];
    let portfolio = [];
    let fishingStats = null;
    
    try {
        const [invRes, portRes, fishRes] = await Promise.all([
            safeQuery(db, `SELECT * FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId]),
            safeQuery(db, `SELECT * FROM user_portfolio WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId]),
            safeQuery(db, `SELECT * FROM user_fishing WHERE "userID" = $1 AND "guildID" = $2 LIMIT 1`, [userId, guildId]).catch(()=>({rows:[]}))
        ]);
        inventory = invRes?.rows || [];
        portfolio = portRes?.rows || [];
        fishingStats = fishRes?.rows?.[0];
    } catch(e) {
        try {
            const [invRes, portRes, fishRes] = await Promise.all([
                safeQuery(db, `SELECT * FROM user_inventory WHERE userid = $1 AND guildid = $2`, [userId, guildId]),
                safeQuery(db, `SELECT * FROM user_portfolio WHERE userid = $1 AND guildid = $2`, [userId, guildId]),
                safeQuery(db, `SELECT * FROM user_fishing WHERE userid = $1 AND guildid = $2 LIMIT 1`, [userId, guildId]).catch(()=>({rows:[]}))
            ]);
            inventory = invRes?.rows || [];
            portfolio = portRes?.rows || [];
            fishingStats = fishRes?.rows?.[0];
        } catch(err) {
            return { materials: [], fishing: [], farming: [], potions: [], market: [], others: [] };
        }
    }

    const categories = { materials: [], fishing: [], farming: [], potions: [], market: [], others: [] };
    
    if (fishingStats) {
        if (fishingStats.currentRod || fishingStats.currentrod) {
            const rodName = fishingStats.currentRod || fishingStats.currentrod;
            categories.fishing.push({
                id: 'current_rod', name: `سنارة ${rodName}`, emoji: '🎣', category: 'fishing',
                rarity: 'Rare', quantity: 1, imgPath: `images/fish/fishing/${rodName.toLowerCase().replace(' ', '_')}.png`
            });
        }
        if (fishingStats.currentBoat || fishingStats.currentboat) {
            const boatName = fishingStats.currentBoat || fishingStats.currentboat;
            categories.fishing.push({
                id: 'current_boat', name: `قارب ${boatName}`, emoji: '🛶', category: 'fishing',
                rarity: 'Epic', quantity: 1, imgPath: `images/fish/ships/${boatName.toLowerCase().replace(' ', '_')}.png`
            });
        }
    }

    for (const row of inventory) {
        const itemId = row.itemID || row.itemid;
        const quantity = Number(row.quantity) || 0;
        if (quantity <= 0) continue;
        if (itemId === 'gacha_chest' || itemId === 'free_gacha_chest') continue;
        
        const itemInfo = getItemInfo(itemId);
        if (categories[itemInfo.category]) {
            categories[itemInfo.category].push({ ...itemInfo, quantity, id: itemId });
        } else {
            categories.others.push({ ...itemInfo, quantity, id: itemId });
        }
    }

    for (const row of portfolio) {
        const itemId = row.itemID || row.itemid;
        const quantity = Number(row.quantity) || 0;
        const purchasePrice = Number(row.purchasePrice || row.purchaseprice) || 0;
        if (quantity <= 0) continue;

        const itemInfo = getItemInfo(itemId);
        categories.market.push({ ...itemInfo, quantity, id: itemId, purchasePrice });
    }
    
    const rarityWeights = { 'Legendary': 5, 'Epic': 4, 'Rare': 3, 'Uncommon': 2, 'Common': 1 };
    Object.keys(categories).forEach(cat => {
        categories[cat].sort((a, b) => {
            const weightA = rarityWeights[a.rarity] || 1;
            const weightB = rarityWeights[b.rarity] || 1;
            return weightB - weightA;
        });
    });

    return categories;
}

// ============================================================================
// [دوال الترحيل والكاش للحماية]
// ============================================================================
function getMarketListingsCache(client, userId, guildId) {
    const key = `market_listings_${userId}_${guildId}`;
    if (!client.marketListings) client.marketListings = new Map();
    if (!client.marketListings.has(key)) client.marketListings.set(key, []);
    return client.marketListings.get(key);
}

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
        if (listingId) dbListings.push({ ...listing, listingId });
    }

    if (dbListings.length > 0) {
        await lockItemsFromInventory(db, guildId, userId, dbListings);
    }
    clearMarketListingsCache(client, userId, guildId);
    return { ok: true, listings: dbListings };
}

async function fetchUserInventory(db, userId, guildId) {
    let invRes = await safeQuery(db, `SELECT * FROM user_inventory WHERE "userID"=$1 AND "guildID"=$2 AND CAST(COALESCE("quantity",'0') AS BIGINT) > 0`, [userId, guildId]);
    if (!invRes || !invRes.rows || invRes.rows.length === 0) {
        invRes = await safeQuery(db, `SELECT * FROM user_inventory WHERE userid=$1 AND guildid=$2 AND CAST(COALESCE("quantity",'0') AS BIGINT) > 0`, [userId, guildId]);
    }
    return (invRes?.rows || []).map(row => ({
        itemId: row.itemid || row.itemID || row.ITEMID,
        quantity: Number(row.quantity || row.QUANTITY || 0),
    }));
}

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
// [الواجهة الرئيسية] متجر القافلة بأسلوب الـ Inventory الجديد
// ============================================================================
async function showStagingUI(interaction, db, user, guild, forceEdit = false) {
    const stateKey = `mkt_state_${user.id}_${guild.id}`;
    if (!interaction.client[stateKey]) {
        interaction.client[stateKey] = { category: 'materials', page: 1 };
    }
    const state = interaction.client[stateKey];

    const [staged, categoriesData] = await Promise.all([
        getStagedItemsSafe(db, user.id, guild.id),
        getInventoryCategories(db, user.id, guild.id)
    ]);

    const stagedIds = new Set(staged.map(s => s.itemID || s.itemid));
    const currentCategoryItems = (categoriesData[state.category] || []).filter(i => !stagedIds.has(i.id));

    const perPage = 10;
    const totalPages = Math.max(1, Math.ceil(currentCategoryItems.length / perPage));
    if (state.page > totalPages) state.page = totalPages;

    const pageItems = currentCategoryItems.slice((state.page - 1) * perPage, state.page * perPage);
    const expectedProfit = staged.reduce((acc, curr) => acc + (Number(curr.quantity) * Number(curr.pricePerUnit || curr.priceperunit)), 0);

    const embed = new EmbedBuilder()
        .setColor('#F1C40F')
        .setAuthor({ name: `عربة بضائع القافلة لـ ${user.displayName || user.username}`, iconURL: user.displayAvatarURL() })
        .setDescription(
            `🛒 **نظام التحضير المسبق للقافلة**\n` +
            `اختر العناصر من القائمة بالأسفل، حدد الكمية والسعر، وستُعرض للبيع فور وصول القافلة.\n\n` +
            `📦 **الأصناف المحملة:** \`${staged.length}\`\n` +
            `💰 **الأرباح المتوقعة:** \`${expectedProfit.toLocaleString()}\` ${EMOJI_MORA}`
        );

    let invText = '';
    if (pageItems.length > 0) {
        pageItems.forEach((it, idx) => {
            const rarityTxt = it.rarity ? `[${RARITY_AR[it.rarity] || it.rarity}]` : '';
            invText += `\`${idx + 1}.\` ${it.emoji} **${it.name}** ${rarityTxt} — لديك: **${it.quantity}**\n`;
        });
    } else {
        invText = '*لا توجد بضائع إضافية في هذا القسم.*';
    }
    embed.addFields({ name: `🎒 مخزونك: ${CATEGORY_NAMES[state.category]} (صفحة ${state.page}/${totalPages})`, value: invText, inline: false });

    if (staged.length > 0) {
        let itemsText = '';
        staged.forEach((s, idx) => {
            const info = getItemInfo(s.itemID || s.itemid);
            const line = `\`${idx + 1}.\` ${info.emoji} **${info.name}** (x${s.quantity}) — **${(s.pricePerUnit || s.priceperunit).toLocaleString()}** مورا/للواحدة\n`;
            if ((itemsText.length + line.length) < 900) itemsText += line;
            else if (!itemsText.endsWith('... والمزيد\n')) itemsText += '... والمزيد\n';
        });
        embed.addFields({ name: `🚚 البضائع المجهزة للرحلة`, value: itemsText, inline: false });
    }

    const components = [];

    const catOptions = Object.keys(CATEGORY_NAMES).map(cat => ({
        label: CATEGORY_NAMES[cat].replace(/[^a-zA-Zأ-ي\s]/g, '').trim(),
        value: `cat_${cat}`,
        description: `تصفح ${CATEGORY_NAMES[cat]}`,
        emoji: CATEGORY_NAMES[cat].split(' ')[0],
        default: state.category === cat
    }));
    components.push(new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId('mkt_stage_category').setPlaceholder('📁 تغيير القسم...').addOptions(catOptions)
    ));

    if (pageItems.length > 0) {
        const addOptions = pageItems.map(item => ({
            label: `${item.name?.substring(0, 90) || item.id}`,
            value: `stage_${item.id}`,
            description: `المتوفر: ${item.quantity}`,
            emoji: item.emoji || '📦',
        }));
        components.push(new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder().setCustomId('mkt_stage_add_item').setPlaceholder('➕ إضافة بضاعة للعربة من هذه الصفحة...').addOptions(addOptions)
        ));
    }

    if (staged.length > 0) {
        const removeOptions = staged.slice(0, 25).map((s, idx) => {
            const info = getItemInfo(s.itemID || s.itemid);
            return {
                label: `إزالة: ${info.name?.substring(0, 80) || s.itemID}`,
                value: `unstage_${idx}`,
                description: `الكمية: ${s.quantity}`,
                emoji: '➖',
            };
        });
        components.push(new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder().setCustomId('mkt_stage_remove_item').setPlaceholder('➖ تفريغ بضاعة وإرجاعها للمخزون...').addOptions(removeOptions)
        ));
    }

    const navRow = new ActionRowBuilder();
    navRow.addComponents(new ButtonBuilder().setCustomId('cv_stage_prev').setLabel('◀️').setStyle(ButtonStyle.Primary).setDisabled(state.page <= 1));
    navRow.addComponents(new ButtonBuilder().setCustomId('cv_stage_page').setLabel(`${state.page} / ${totalPages}`).setStyle(ButtonStyle.Secondary).setDisabled(true));
    navRow.addComponents(new ButtonBuilder().setCustomId('cv_stage_next').setLabel('▶️').setStyle(ButtonStyle.Primary).setDisabled(state.page >= totalPages));
    navRow.addComponents(new ButtonBuilder().setCustomId('cv_back').setLabel('↩️ الرئيسية').setStyle(ButtonStyle.Success));
    components.push(navRow);

    if (forceEdit || interaction.deferred || interaction.replied) {
        await interaction.editReply({ embeds: [embed], components, files: [], content: '' }).catch(() => {});
    } else {
        await interaction.reply({ embeds: [embed], components, flags: [MessageFlags.Ephemeral] }).catch(() => {});
    }
}

// ============================================================================
// [التعامل مع الأحداث للـ Staging]
// ============================================================================
async function handleStageCategorySelect(interaction, db, user, guild) {
    const rawValue = interaction.values[0];
    const cat = rawValue.replace('cat_', '');
    const stateKey = `mkt_state_${user.id}_${guild.id}`;
    interaction.client[stateKey] = { category: cat, page: 1 };
    await interaction.deferUpdate().catch(()=>{});
    await showStagingUI(interaction, db, user, guild, true);
}

async function handleStagePageChange(interaction, db, user, guild, direction) {
    const stateKey = `mkt_state_${user.id}_${guild.id}`;
    if (!interaction.client[stateKey]) interaction.client[stateKey] = { category: 'materials', page: 1 };
    
    if (direction === 'prev') interaction.client[stateKey].page = Math.max(1, interaction.client[stateKey].page - 1);
    else interaction.client[stateKey].page += 1;

    await interaction.deferUpdate().catch(()=>{});
    await showStagingUI(interaction, db, user, guild, true);
}

async function handleStageAddItemSelect(interaction, db, user, guild) {
    const rawValue = interaction.values[0];
    const itemId = rawValue.replace('stage_', '');
    const info = getItemInfo(itemId);

    const cats = await getInventoryCategories(db, user.id, guild.id);
    let invItem = null;
    for (const key in cats) {
        invItem = cats[key].find(i => i.id === itemId);
        if (invItem) break;
    }

    if (!invItem || invItem.quantity <= 0) {
        return await interaction.reply({ content: '❌ لا تملك هذا العنصر في مخزونك الحالي.', flags: [MessageFlags.Ephemeral] });
    }

    const modal = new ModalBuilder().setCustomId(`mkt_stage_price_modal_${itemId}`).setTitle(`تسعير: ${info.name}`.substring(0, 45));

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

    modal.addComponents(new ActionRowBuilder().addComponents(qtyInput), new ActionRowBuilder().addComponents(priceInput));

    await interaction.showModal(modal);
}

async function handleStagePriceModalSubmit(modalSubmit, db, user, guild) {
    const itemId = modalSubmit.customId.replace('mkt_stage_price_modal_', '');
    const qty = parseInt(modalSubmit.fields.getTextInputValue('mkt_stage_qty'));
    const price = parseInt(modalSubmit.fields.getTextInputValue('mkt_stage_price'));

    if (isNaN(qty) || qty < 1) return modalSubmit.reply({ content: '❌ كمية غير صالحة.', flags: [MessageFlags.Ephemeral] });
    if (isNaN(price) || price < 1 || price > 999999999) return modalSubmit.reply({ content: '❌ سعر غير صالح.', flags: [MessageFlags.Ephemeral] });

    await modalSubmit.deferUpdate().catch(() => {});

    const result = await stagingAddItemSafe(db, user.id, guild.id, itemId, qty, price);
    if (!result.ok) return modalSubmit.followUp({ content: `❌ ${result.error}`, flags: [MessageFlags.Ephemeral] });

    await showStagingUI(modalSubmit, db, user, guild, true);
}

async function handleStageRemoveItemSelect(interaction, db, user, guild) {
    await interaction.deferUpdate().catch(() => {});
    const idx = parseInt(interaction.values[0].replace('unstage_', ''));
    const staged = await getStagedItemsSafe(db, user.id, guild.id);

    if (idx < 0 || idx >= staged.length) return await interaction.followUp({ content: '❌ خطأ: لم يتم العثور على العنصر.', flags: [MessageFlags.Ephemeral] });

    const item = staged[idx];
    const result = await stagingRemoveItemSafe(db, user.id, guild.id, item.itemID || item.itemid, Number(item.quantity));
    
    if (!result.ok) return await interaction.followUp({ content: `❌ ${result.error}`, flags: [MessageFlags.Ephemeral] });

    await showStagingUI(interaction, db, user, guild, true);
}

module.exports = {
    resolveItemInfo,
    getItemInfo,
    getMarketListingsCache,
    clearMarketListingsCache,
    fetchUserInventory,
    getInventoryCategories,
    // الدوال الجديدة
    showStagingUI,
    handleStageCategorySelect,
    handleStagePageChange,
    handleStageAddItemSelect,
    handleStagePriceModalSubmit,
    handleStageRemoveItemSelect,
    finalizeListings,
};
