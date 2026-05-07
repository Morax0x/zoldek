const {
    EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
    StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
    MessageFlags, AttachmentBuilder
} = require('discord.js');
const { safeQuery, safeExecute } = require('../db');
const { EMOJI_MORA } = require('../config');
const { createListing, lockItemsFromInventory, stagingAddItem, getStagedItems, stagingRemoveItem } = require('./market-db');

const path = require('path');
const upgradeMats = require('../../../json/upgrade-materials.json');
let fishData = [], farmSeeds = [], farmFeeds = [], potionsData = [], baitsData = [];

try { 
    const fishJson = require('../../../json/fishing-config.json') || require('../../../json/fish.json');
    fishData = fishJson.fishItems || fishJson; 
} catch(e) {}
try { baitsData = require('../../../json/baits.json'); } catch(e) {}
try { farmSeeds = require('../../../json/seeds.json'); } catch(e) {}
try { farmFeeds = require('../../../json/feed-items.json'); } catch(e) {}
try { potionsData = require('../../../json/potions.json'); } catch(e) {}

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
            // تحويل الأسماك إلى قسم الموارد عشان تباع بشكل طبيعي
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
}
buildDictionary();

function resolveItemInfo(itemId) {
    if (!itemId) return { name: 'مجهول', emoji: '❓', category: 'others', rarity: 'Common', imgPath: null };
    if (ITEM_DICTIONARY.has(itemId)) return ITEM_DICTIONARY.get(itemId);
    if (itemId.startsWith('bait_')) return { name: `طعم ${itemId.split('_')[1]}`, emoji: '🪱', category: 'fishing', rarity: 'Common', imgPath: null };
    return { name: itemId.replace(/_/g, ' '), emoji: '📦', category: 'others', rarity: 'Common', imgPath: null };
}
const getItemInfo = resolveItemInfo;

// 👑 إزالة قسم الأسهم وقسم "أخرى"، وتعديل الصيد ليكون طعوم فقط 👑
const CATEGORY_NAMES = {
    'materials': '💎 موارد وتطوير',
    'fishing': '🪱 طعوم الصيد',
    'farming': '🌾 المزرعة',
    'potions': '🧪 الجرعات',
    'staged': '🛒 سلة البضائع (محملة)'
};

const RARITY_AR = { 'Common': 'عادي', 'Uncommon': 'شائع', 'Rare': 'نادر', 'Epic': 'ملحمي', 'Legendary': 'أسطوري' };

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

async function getInventoryCategories(db, userId, guildId) {
    let inventory = [];
    try {
        const invRes = await safeQuery(db, `SELECT * FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId]);
        inventory = invRes?.rows || [];
        if (inventory.length === 0) {
            const invRes2 = await safeQuery(db, `SELECT * FROM user_inventory WHERE userid = $1 AND guildid = $2`, [userId, guildId]);
            inventory = invRes2?.rows || [];
        }
    } catch(e) {}

    // 👑 الأقسام المسموحة فقط 👑
    const categories = { materials: [], fishing: [], farming: [], potions: [] };
    
    for (const row of inventory) {
        const itemId = row.itemID || row.itemid;
        const quantity = Number(row.quantity || row.QUANTITY) || 0;
        if (quantity <= 0 || itemId === 'gacha_chest' || itemId === 'free_gacha_chest') continue;
        
        const itemInfo = resolveItemInfo(itemId);
        
        // الفلترة: إذا كان القسم موجود يتم إضافته، وإذا كان 'others' أو 'market' يتم تجاهله تلقائياً
        if (categories[itemInfo.category]) {
            categories[itemInfo.category].push({ ...itemInfo, quantity, id: itemId });
        }
    }
    
    const rarityWeights = { 'Legendary': 5, 'Epic': 4, 'Rare': 3, 'Uncommon': 2, 'Common': 1 };
    Object.keys(categories).forEach(cat => {
        categories[cat].sort((a, b) => (rarityWeights[b.rarity] || 1) - (rarityWeights[a.rarity] || 1));
    });

    return categories;
}

// ============================================================================
// [دوال الـ Staging للتعامل مع قاعدة البيانات أمنياً]
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
    if (dbListings.length > 0) await lockItemsFromInventory(db, guildId, userId, dbListings);
    clearMarketListingsCache(client, userId, guildId);
    return { ok: true, listings: dbListings };
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
        if (!res || res.rows.length === 0) return { ok: false, error: 'لا تملك كمية كافية.' };
        await safeExecute(db, `INSERT INTO caravan_staging_market ("userID", "guildID", "itemID", "quantity", "pricePerUnit") VALUES ($1, $2, $3, $4, $5)`, [userId, guildId, itemId, quantity, price]);
        return { ok: true };
    } catch { return { ok: false, error: 'حدث خطأ.' }; }
}

async function stagingRemoveItemSafe(db, userId, guildId, itemId, quantity) {
    if (typeof stagingRemoveItem === 'function') return await stagingRemoveItem(db, userId, guildId, itemId, quantity);
    try {
        await safeExecute(db, `DELETE FROM caravan_staging_market WHERE "userID"=$1 AND "guildID"=$2 AND ("itemID"=$3 OR itemid=$3) LIMIT 1`, [userId, guildId, itemId]);
        await safeExecute(db, `UPDATE user_inventory SET quantity = CAST(COALESCE(quantity, '0') AS INTEGER) + $1 WHERE "userID" = $2 AND "guildID" = $3 AND ("itemID" = $4 OR itemid=$4)`, [quantity, userId, guildId, itemId]);
        return { ok: true };
    } catch { return { ok: false, error: 'حدث خطأ.' }; }
}

// ============================================================================
// [الواجهة الرئيسية] متجر القافلة بأسلوب الـ Inventory الجديد
// ============================================================================
let INVENTORY_GEN;
try { INVENTORY_GEN = require('../../../generators/inventory-generator.js'); } catch (e) { INVENTORY_GEN = null; }

async function showStagingUI(interaction, db, user, guild, forceEdit = false) {
    const stateKey = `mkt_state_${user.id}_${guild.id}`;
    if (!interaction.client[stateKey]) {
        interaction.client[stateKey] = { category: 'materials', page: 1, selectedIndex: 0 };
    }
    const state = interaction.client[stateKey];

    const [staged, categoriesData] = await Promise.all([
        getStagedItemsSafe(db, user.id, guild.id),
        getInventoryCategories(db, user.id, guild.id)
    ]);

    const isCart = state.category === 'staged';
    let currentItems = [];

    if (isCart) {
        currentItems = staged.map(s => {
            const info = resolveItemInfo(s.itemID || s.itemid);
            return { id: s.itemID || s.itemid, name: info.name, emoji: info.emoji, rarity: info.rarity, quantity: s.quantity, pricePerUnit: s.pricePerUnit || s.priceperunit, imgPath: info.imgPath };
        });
    } else {
        const stagedIds = new Set(staged.map(s => s.itemID || s.itemid));
        currentItems = (categoriesData[state.category] || []).filter(i => !stagedIds.has(i.id));
    }

    const ITEMS_PER_PAGE = 15;
    const totalPages = Math.max(1, Math.ceil(currentItems.length / ITEMS_PER_PAGE));
    if (state.page > totalPages) state.page = totalPages;

    const pageItems = currentItems.slice((state.page - 1) * ITEMS_PER_PAGE, state.page * ITEMS_PER_PAGE);
    
    if (state.selectedIndex >= pageItems.length && pageItems.length > 0) state.selectedIndex = pageItems.length - 1;
    else if (pageItems.length === 0) state.selectedIndex = 0;

    interaction.client[stateKey].pageItems = pageItems;

    const expectedProfit = staged.reduce((acc, curr) => acc + (Number(curr.quantity) * Number(curr.pricePerUnit || curr.priceperunit)), 0);

    let buffer = null;
    if (INVENTORY_GEN && INVENTORY_GEN.generateInventoryCard) {
        try {
            // 👑 تم تمرير الخلفية الصحيحة للوحة عند فتح العربة عشان ما يضرب كراش وتظهر الصور
            const catForDraw = isCart ? 'materials' : state.category; 
            buffer = await INVENTORY_GEN.generateInventoryCard(user.displayName || user.username, catForDraw, pageItems, state.page, totalPages, state.selectedIndex);
        } catch (e) { buffer = null; }
    }

    const embed = new EmbedBuilder()
        .setColor('#F1C40F')
        .setAuthor({ name: `سوق القافلة لـ ${user.displayName || user.username}`, iconURL: user.displayAvatarURL() })
        .setDescription(
            `🛒 **إعداد البضائع للرحلة**\nاستخدم أزرار التحكم لتحديد العنصر، ثم اضغط 💠 للتحضير أو الإزالة.\n\n` +
            `📦 **البضائع المحملة:** \`${staged.length}\` | 💰 **الأرباح المتوقعة:** \`${expectedProfit.toLocaleString()}\` ${EMOJI_MORA}`
        );

    let itemsText = '';
    if (pageItems.length > 0) {
        pageItems.forEach((it, idx) => {
            const marker = idx === state.selectedIndex ? '🔹' : '🔸';
            if (isCart) {
                itemsText += `\`${idx + 1}.\` ${marker} ${it.emoji} **${it.name}** (x${it.quantity}) — **${(it.pricePerUnit).toLocaleString()}** للواحدة\n`;
            } else {
                const rarityTxt = it.rarity ? `[${RARITY_AR[it.rarity] || it.rarity}]` : '';
                itemsText += `\`${idx + 1}.\` ${marker} ${it.emoji} **${it.name}** ${rarityTxt} — تملك: **${it.quantity}**\n`;
            }
        });
    } else {
        itemsText = isCart ? '*سلة البضائع فارغة حالياً.*' : '*لا يوجد شيء هنا في المخزون.*';
    }
    embed.addFields({ name: `📂 ${CATEGORY_NAMES[state.category]} (صفحة ${state.page}/${totalPages})`, value: itemsText.substring(0, 1024), inline: false });

    const aId = user.id;
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`stg_l2_${aId}`).setEmoji('⏪').setStyle(ButtonStyle.Secondary).setDisabled(pageItems.length === 0),
        new ButtonBuilder().setCustomId(`stg_u1_${aId}`).setEmoji('⬆️').setStyle(ButtonStyle.Primary).setDisabled(pageItems.length === 0),
        new ButtonBuilder().setCustomId(`stg_r2_${aId}`).setEmoji('⏩').setStyle(ButtonStyle.Secondary).setDisabled(pageItems.length === 0)
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`stg_l1_${aId}`).setEmoji('⬅️').setStyle(ButtonStyle.Primary).setDisabled(pageItems.length === 0),
        new ButtonBuilder().setCustomId(`stg_ok_${aId}`).setEmoji('💠').setStyle(ButtonStyle.Success).setDisabled(pageItems.length === 0),
        new ButtonBuilder().setCustomId(`stg_r1_${aId}`).setEmoji('➡️').setStyle(ButtonStyle.Primary).setDisabled(pageItems.length === 0)
    );
    const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`stg_u2_${aId}`).setEmoji('⏫').setStyle(ButtonStyle.Secondary).setDisabled(pageItems.length === 0),
        new ButtonBuilder().setCustomId(`stg_d1_${aId}`).setEmoji('⬇️').setStyle(ButtonStyle.Primary).setDisabled(pageItems.length === 0),
        new ButtonBuilder().setCustomId(`stg_d2_${aId}`).setEmoji('⏬').setStyle(ButtonStyle.Secondary).setDisabled(pageItems.length === 0)
    );

    const row4 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`stg_prev_${aId}`).setEmoji('<:left:1439164494759723029>').setStyle(ButtonStyle.Secondary).setDisabled(state.page <= 1),
        new ButtonBuilder().setCustomId(`cv_back`).setLabel('إطلاق القافلة').setEmoji('🚀').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`stg_next_${aId}`).setEmoji('<:right:1439164491072929915>').setStyle(ButtonStyle.Secondary).setDisabled(state.page >= totalPages)
    );

    const catOptions = Object.keys(CATEGORY_NAMES).map(cat => ({
        label: CATEGORY_NAMES[cat].replace(/[^a-zA-Zأ-ي\s]/g, '').trim(),
        value: `cat_${cat}`,
        emoji: CATEGORY_NAMES[cat].split(' ')[0],
        default: state.category === cat
    }));

    const row5 = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId(`stg_cat_${aId}`).setPlaceholder('📁 تنقل بين الأقسام وسلة البضائع...').addOptions(catOptions)
    );

    const payload = { 
        embeds: buffer ? [] : [embed], 
        components: [row1, row2, row3, row4, row5], 
        files: buffer ? [new AttachmentBuilder(buffer, { name: 'market.png' })] : [], 
        content: buffer ? `**🏪 متجر القافلة لـ <@${user.id}>**` : '' 
    };

    if (forceEdit || interaction.deferred || interaction.replied) {
        await interaction.editReply(payload).catch(() => {});
    } else {
        await interaction.reply(payload).catch(() => {});
    }
}

// ============================================================================
// [الأحداث] الحركة واختيار البضائع باستخدام Modal
// ============================================================================
async function handleStagingInteraction(interaction, db, user, guild) {
    const id = interaction.customId;
    const authorId = user.id;

    if (!id.endsWith(`_${authorId}`) && id !== 'cv_back') {
        if (id.includes('_') && !id.startsWith('cv_')) {
           return interaction.reply({ content: '❌ هذا المتجر لا يخصك!', flags: [MessageFlags.Ephemeral] });
        }
    }

    const stateKey = `mkt_state_${user.id}_${guild.id}`;
    if (!interaction.client[stateKey]) {
        interaction.client[stateKey] = { category: 'materials', page: 1, selectedIndex: 0 };
    }
    const state = interaction.client[stateKey];

    if (interaction.isStringSelectMenu() && id.startsWith('stg_cat_')) {
        state.category = interaction.values[0].replace('cat_', '');
        state.page = 1;
        state.selectedIndex = 0;
        await interaction.deferUpdate().catch(()=>{});
        return await showStagingUI(interaction, db, user, guild, true);
    }

    if (id.startsWith('stg_ok_')) {
        const pageItems = state.pageItems || [];
        const selectedItem = pageItems[state.selectedIndex];

        if (!selectedItem) {
             await interaction.deferUpdate();
             return interaction.followUp({ content: "❌ المربع المحدد فارغ.", flags: [MessageFlags.Ephemeral] });
        }
        
        if (state.category === 'staged') {
            const modal = new ModalBuilder().setCustomId(`stg_rmv_modal_${selectedItem.id || selectedItem.itemID}`).setTitle(`إزالة البضاعة`);
            modal.addComponents(new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('rmv_qty').setLabel(`الكمية (الحد الأقصى ${selectedItem.quantity})`).setStyle(TextInputStyle.Short).setValue(String(selectedItem.quantity)).setRequired(true)
            ));
            return await interaction.showModal(modal).catch(()=>{});
        } else {
            const modal = new ModalBuilder().setCustomId(`stg_add_modal_${selectedItem.id}`).setTitle(`تسعير: ${selectedItem.name}`.substring(0, 45));
            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('add_qty').setLabel(`الكمية (لديك: ${selectedItem.quantity})`).setStyle(TextInputStyle.Short).setValue(String(selectedItem.quantity)).setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('add_price').setLabel(`سعر الحبة (مورا)`).setStyle(TextInputStyle.Short).setRequired(true)
                )
            );
            return await interaction.showModal(modal).catch(()=>{});
        }
    }

    await interaction.deferUpdate().catch(()=>{});

    if (id.startsWith('stg_prev_')) { state.page = Math.max(1, state.page - 1); state.selectedIndex = 0; }
    else if (id.startsWith('stg_next_')) { state.page += 1; state.selectedIndex = 0; }
    else {
        const moveType = id.split('_')[1]; 
        const col = state.selectedIndex % 5;
        const row = Math.floor(state.selectedIndex / 5);

        if (moveType === 'r1') { state.selectedIndex = row * 5 + ((col + 1) % 5); } 
        else if (moveType === 'l1') { state.selectedIndex = row * 5 + ((col - 1 + 5) % 5); }
        else if (moveType === 'd1') { state.selectedIndex = ((row + 1) % 3) * 5 + col; }
        else if (moveType === 'u1') { state.selectedIndex = ((row - 1 + 3) % 3) * 5 + col; }
        else if (moveType === 'r2') { state.selectedIndex = row * 5 + ((col + 2) % 5); }
        else if (moveType === 'l2') { state.selectedIndex = row * 5 + ((col - 2 + 5) % 5); }
        else if (moveType === 'd2') { state.selectedIndex = ((row + 2) % 3) * 5 + col; }
        else if (moveType === 'u2') { state.selectedIndex = ((row - 2 + 3) % 3) * 5 + col; }
    }

    await showStagingUI(interaction, db, user, guild, true);
}

// ============================================================================
// [التعامل مع استجابة المودل (Modal Submit)]
// ============================================================================
async function handleStageModalSubmit(modalSubmit, db, user, guild) {
    const id = modalSubmit.customId;
    
    if (id.startsWith('stg_add_modal_')) {
        const itemId = id.replace('stg_add_modal_', '');
        const qty = parseInt(modalSubmit.fields.getTextInputValue('add_qty'));
        const price = parseInt(modalSubmit.fields.getTextInputValue('add_price'));
        
        if (isNaN(qty) || qty < 1) return modalSubmit.reply({ content: '❌ كمية غير صالحة.', flags: [MessageFlags.Ephemeral] });
        if (isNaN(price) || price < 1 || price > 999999999) return modalSubmit.reply({ content: '❌ سعر غير صالح.', flags: [MessageFlags.Ephemeral] });

        await modalSubmit.deferUpdate().catch(() => {});
        const result = await stagingAddItemSafe(db, user.id, guild.id, itemId, qty, price);
        if (!result.ok) return modalSubmit.followUp({ content: `❌ ${result.error}`, flags: [MessageFlags.Ephemeral] });
        
        await showStagingUI(modalSubmit, db, user, guild, true);
        
    } else if (id.startsWith('stg_rmv_modal_')) {
        const itemId = id.replace('stg_rmv_modal_', '');
        const qty = parseInt(modalSubmit.fields.getTextInputValue('rmv_qty'));
        
        if (isNaN(qty) || qty < 1) return modalSubmit.reply({ content: '❌ كمية غير صالحة.', flags: [MessageFlags.Ephemeral] });
        
        await modalSubmit.deferUpdate().catch(() => {});
        const result = await stagingRemoveItemSafe(db, user.id, guild.id, itemId, qty);
        if (!result.ok) return modalSubmit.followUp({ content: `❌ ${result.error}`, flags: [MessageFlags.Ephemeral] });
        
        await showStagingUI(modalSubmit, db, user, guild, true);
    }
}

module.exports = {
    resolveItemInfo,
    getItemInfo,
    getMarketListingsCache,
    clearMarketListingsCache,
    fetchUserInventory,
    getInventoryCategories,
    showStagingUI,
    handleStagingInteraction,
    handleStageModalSubmit,
    finalizeListings,
};
