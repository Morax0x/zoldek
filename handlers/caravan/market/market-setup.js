const {
    EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
    StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
    MessageFlags, AttachmentBuilder
} = require('discord.js');
const { safeQuery, safeExecute } = require('../db');
const { EMOJI_MORA } = require('../config');
const { createListing, lockItemsFromInventory } = require('./market-db'); // إزالة دوال الستيجنج القديمة المليئة بالأخطاء

let INVENTORY_GEN;
try { INVENTORY_GEN = require('../../../generators/inventory-generator.js'); } catch (e) { INVENTORY_GEN = null; }

const resolveItemInfo = INVENTORY_GEN ? INVENTORY_GEN.resolveItemInfo : (id) => ({ name: id, emoji: '📦', rarity: 'Common', category: 'أخرى', imgPath: null });
const getItemInfo = resolveItemInfo;

const CATEGORY_NAMES = {
    'موارد': '💎 موارد وتطوير',
    'صيد': '🪱 طعوم الصيد',
    'مزرعة': '🌾 المزرعة',
    'staged': '🛒 سلة البضائع (محملة)'
};

const RARITY_AR = { 'Common': 'عادي', 'Uncommon': 'شائع', 'Rare': 'نادر', 'Epic': 'ملحمي', 'Legendary': 'أسطوري' };

async function getFilteredInventoryCategories(db, userId, guildId) {
    if (!INVENTORY_GEN) return { 'موارد': [], 'صيد': [], 'مزرعة': [] };
    const rawCategories = await INVENTORY_GEN.getInventoryCategories(db, userId, guildId);
    
    return {
        'موارد': rawCategories['موارد'] || [],
        'صيد': (rawCategories['صيد'] || []).filter(item => String(item.id).startsWith('bait_')),
        'مزرعة': rawCategories['مزرعة'] || []
    };
}

// ============================================================================
// [دوال قواعد البيانات فائقة الحماية - تتخطى أخطاء أحرف الأعمدة]
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
    try {
        await db.query(`CREATE TABLE IF NOT EXISTS caravan_staging_market (id SERIAL PRIMARY KEY, "userID" VARCHAR(50), "guildID" VARCHAR(50), "itemID" VARCHAR(100), "quantity" INTEGER, "pricePerUnit" INTEGER)`).catch(()=>{});
        let res = await db.query(`SELECT * FROM caravan_staging_market WHERE "userID"=$1 AND "guildID"=$2`, [userId, guildId]).catch(()=>null);
        if (!res || !res.rows || res.rows.length === 0) {
            res = await db.query(`SELECT * FROM caravan_staging_market WHERE userid=$1 AND guildid=$2`, [userId, guildId]).catch(()=>null);
        }
        return res?.rows || [];
    } catch { return []; }
}

async function stagingAddItemSafe(db, userId, guildId, itemId, quantity, price) {
    let success = false;

    // 1. المحاولة بالأحرف الكبيرة (PostgreSQL Default)
    try {
        const res = await db.query(
            `UPDATE user_inventory SET quantity = CAST(COALESCE(quantity, '0') AS INTEGER) - $1 WHERE "userID" = $2 AND "guildID" = $3 AND ("itemID" = $4 OR itemid=$4) AND CAST(COALESCE(quantity, '0') AS INTEGER) >= $1 RETURNING *`, 
            [quantity, userId, guildId, itemId]
        );
        if (res && res.rows && res.rows.length > 0) success = true;
    } catch (e) {}

    // 2. المحاولة بالأحرف الصغيرة (لو كانت الداتابيس معدلة)
    if (!success) {
        try {
            const res2 = await db.query(
                `UPDATE user_inventory SET quantity = CAST(COALESCE(quantity, '0') AS INTEGER) - $1 WHERE userid = $2 AND guildid = $3 AND (itemid = $4 OR "itemID"=$4) AND CAST(COALESCE(quantity, '0') AS INTEGER) >= $1 RETURNING *`, 
                [quantity, userId, guildId, itemId]
            );
            if (res2 && res2.rows && res2.rows.length > 0) success = true;
        } catch (e) {}
    }

    if (!success) return { ok: false, error: 'الكمية غير كافية في مخزونك.' };

    // الإضافة لعربة القافلة
    try {
        await db.query(`INSERT INTO caravan_staging_market ("userID", "guildID", "itemID", "quantity", "pricePerUnit") VALUES ($1, $2, $3, $4, $5)`, [userId, guildId, itemId, quantity, price]);
    } catch(e) {
        try { await db.query(`INSERT INTO caravan_staging_market (userid, guildid, itemid, quantity, priceperunit) VALUES ($1, $2, $3, $4, $5)`, [userId, guildId, itemId, quantity, price]); } catch (err) {}
    }
    
    return { ok: true };
}

async function stagingRemoveItemSafe(db, userId, guildId, itemId, quantity) {
    try {
        await db.query(`DELETE FROM caravan_staging_market WHERE "userID"=$1 AND "guildID"=$2 AND ("itemID"=$3 OR itemid=$3)`, [userId, guildId, itemId]).catch(() => {
            return db.query(`DELETE FROM caravan_staging_market WHERE userid=$1 AND guildid=$2 AND (itemid=$3 OR "itemID"=$3)`, [userId, guildId, itemId]);
        });
        
        let updated = false;
        try {
            const res = await db.query(`UPDATE user_inventory SET quantity = CAST(COALESCE(quantity, '0') AS INTEGER) + $1 WHERE "userID" = $2 AND "guildID" = $3 AND ("itemID" = $4 OR itemid=$4) RETURNING *`, [quantity, userId, guildId, itemId]);
            if (res && res.rowCount > 0) updated = true;
        } catch(e) {}
        
        if (!updated) {
            try {
                const res2 = await db.query(`UPDATE user_inventory SET quantity = CAST(COALESCE(quantity, '0') AS INTEGER) + $1 WHERE userid = $2 AND guildid = $3 AND (itemid = $4 OR "itemID"=$4) RETURNING *`, [quantity, userId, guildId, itemId]);
                if (res2 && res2.rowCount > 0) updated = true;
            } catch(e) {}
        }
        
        if (!updated) {
            try { await db.query(`INSERT INTO user_inventory ("guildID", "userID", "itemID", "quantity") VALUES ($1, $2, $3, $4)`, [guildId, userId, itemId, quantity]); } catch(e) {
                await db.query(`INSERT INTO user_inventory (guildid, userid, itemid, quantity) VALUES ($1, $2, $3, $4)`, [guildId, userId, itemId, quantity]).catch(()=>{});
            }
        }
        
        return { ok: true };
    } catch { return { ok: false, error: 'حدث خطأ أثناء الإرجاع.' }; }
}

async function finalizeStagedItems(db, caravanId, userId, guildId) {
    const staged = await getStagedItemsSafe(db, userId, guildId);
    for (const st of staged) {
        const itemId = st.itemID || st.itemid;
        const qty = st.quantity;
        const price = st.pricePerUnit || st.priceperunit;
        try {
            await db.query(`INSERT INTO caravan_market_listings ("caravanID","guildID","itemID","quantity","quantitySold","pricePerUnit") VALUES ($1,$2,$3,$4,0,$5)`, [caravanId, guildId, itemId, qty, price]);
        } catch(e) {
            await db.query(`INSERT INTO caravan_market_listings (caravanid, guildid, itemid, quantity, quantitysold, priceperunit) VALUES ($1,$2,$3,$4,0,$5)`, [caravanId, guildId, itemId, qty, price]).catch(()=>{});
        }
    }
    await db.query(`DELETE FROM caravan_staging_market WHERE "userID"=$1 AND "guildID"=$2`, [userId, guildId]).catch(()=>{
        return db.query(`DELETE FROM caravan_staging_market WHERE userid=$1 AND guildid=$2`, [userId, guildId]).catch(()=>{});
    });
}

// ============================================================================
// [الواجهة الرئيسية] متجر القافلة
// ============================================================================
async function showStagingUI(interaction, db, user, guild, forceEdit = false) {
    const stateKey = `mkt_state_${user.id}_${guild.id}`;
    if (!interaction.client[stateKey]) {
        interaction.client[stateKey] = { category: 'موارد', page: 1, selectedIndex: 0 };
    }
    const state = interaction.client[stateKey];

    if (!CATEGORY_NAMES[state.category]) state.category = 'موارد';

    const [staged, categoriesData] = await Promise.all([
        getStagedItemsSafe(db, user.id, guild.id),
        getFilteredInventoryCategories(db, user.id, guild.id)
    ]);

    const isCart = state.category === 'staged';
    let currentItems = [];

    if (isCart) {
        currentItems = staged.map(s => {
            const info = resolveItemInfo(s.itemID || s.itemid);
            return { id: s.itemID || s.itemid, name: info.name, emoji: info.emoji, rarity: info.rarity, quantity: s.quantity, pricePerUnit: s.pricePerUnit || s.priceperunit, imgPath: info.imgPath, fullImage: info.fullImage };
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
            const drawCategory = isCart ? 'موارد' : state.category; 
            const drawItems = pageItems.map(item => ({ ...item, category: drawCategory }));
            buffer = await INVENTORY_GEN.generateInventoryCard(user.displayName || user.username, drawCategory, drawItems, state.page, totalPages, state.selectedIndex);
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
// [الأحداث]
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
        interaction.client[stateKey] = { category: 'موارد', page: 1, selectedIndex: 0 };
    }
    const state = interaction.client[stateKey];

    if (interaction.isStringSelectMenu() && id.startsWith('stg_cat_')) {
        state.category = interaction.values[0].replace('cat_', '');
        state.page = 1;
        state.selectedIndex = 0;
        await interaction.deferUpdate().catch(()=>{});
        return await showStagingUI(interaction, db, user, guild, true);
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
    getFilteredInventoryCategories,
    getStagedItemsSafe,
    finalizeStagedItems,
    showStagingUI,
    handleStagingInteraction,
    handleStageModalSubmit,
    finalizeListings,
};
