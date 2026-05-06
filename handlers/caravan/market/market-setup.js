const {
    EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
    StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
    MessageFlags,
} = require('discord.js');
const { safeQuery } = require('../db');
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

async function buildMarketSetupEmbed(user, listings, inventoryCount, dest) {
    const totalValue = listings.reduce((sum, l) => sum + (l.pricePerUnit * l.quantity), 0);

    const embed = new EmbedBuilder()
        .setColor(dest?.color || '#FFD700')
        .setTitle('🏪 سوق القافلة — تحضير البضائع')
        .setDescription(
            `أضف عناصر من مخزونك لبيعها في سوق القافلة عند الوصول.\n` +
            `📦 عناصر في المخزون: **${inventoryCount}**\n` +
            `💰 القيمة الإجمالية: **${totalValue.toLocaleString()}** ${EMOJI_MORA}`
        );

    if (listings.length > 0) {
        const fields = listings.map((l, i) => {
            const info = getItemInfo(l.itemId);
            const rarityTxt = info.rarity ? `[${RARITY_AR[info.rarity] || info.rarity}] ` : '';
            return {
                name: `${i + 1}. ${info.emoji || '📦'} ${info.name} ${rarityTxt}`,
                value: `الكمية: **${l.quantity}** | السعر: **${l.pricePerUnit.toLocaleString()}** ${EMOJI_MORA}/واحدة`,
                inline: false,
            };
        });
        embed.addFields(fields);
    } else {
        embed.addFields({
            name: 'لا توجد بضائع حالياً',
            value: 'اختر عناصر من القائمة أدناه لإضافتها.',
            inline: false,
        });
    }

    return embed;
}

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

// Show a basic staging view (for now, ephemeral embed with staged items)
async function showStagingUI(interaction, db, user, guild) {
    const staged = await getStagedItems(db, user.id, guild.id);
    const embed = new EmbedBuilder()
        .setTitle('🏪 استعراض بضائع السوق المرحل')
        .setDescription(`العناصر المرحّلة لديك: ${staged.length}`);
    if (staged.length > 0) {
        const fields = staged.map(s => {
            const name = s.itemID || s.itemID;
            return {
                name: `- ${name}`,
                value: `الكمية: ${s.quantity} | السعر: ${s.pricePerUnit}`
            };
        });
        embed.addFields(fields);
    } else {
        embed.addFields({ name: 'لا توجد بضائع مرحّلة', value: 'استخدم متجر القافلة لإضافة عناصرك إلى السوق المعلن عنه لاحقاً.', inline: false });
    }

    // Basic page-like selection for adding to staging (first 25 items of personal inventory)
    const inventory = await getStagedItems(db, user.id, guild.id); // placeholder: reusing staging for simplicity
    const firstPageItems = inventory.slice(0, 25);
    const options = firstPageItems.map(it => {
        const id = it.itemID || it.itemID;
        return {
            label: id,
            description: `المخزون: ${it.quantity || 0}`,
            value: id,
        };
    });
    if (options.length > 0) {
        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('mkt_stage_add_item')
                .setPlaceholder('اختر عنصرًا لإضافته إلى القافلة...')
                .addOptions(options)
        );
        await interaction.reply({ embeds: [embed], components: [row], ephemeral: true }).catch(() => {});
        return;
    }
    await interaction.reply({ embeds: [embed], ephemeral: true }).catch(() => {});
}

// 👑 دالة جديدة لبناء الأزرار والقوائم وتحديث حالتها بذكاء 👑
function buildMarketComponents(inventory, listings) {
    const listedItemIds = new Set(listings.map(l => l.itemId));
    const availableItems = inventory.filter(i => !listedItemIds.has(i.itemId));

    const options = availableItems.slice(0, 25).map(item => {
        const info = getItemInfo(item.itemId);
        const rarityTxt = info.rarity ? `[${RARITY_AR[info.rarity] || info.rarity}] ` : '';
        return {
            label: `${info.name?.substring(0, 25) || item.itemId}`,
            value: item.itemId,
            description: `${rarityTxt}المتوفر: ${item.quantity}`,
            emoji: info.emoji || '📦',
        };
    });

    const components = [];

    if (options.length > 0) {
        components.push(
            new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('mkt_add_item')
                    .setPlaceholder('➕ اختر عنصراً لإضافته إلى السوق...')
                    .addOptions(options)
            )
        );
    }

    // Quick access to staged market view
    components.push(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('mkt_view_staged')
                .setLabel('استعراض بضائع السوق')
                .setStyle(ButtonStyle.Secondary)
        )
    );

    if (listings.length > 0) {
        const removeOptions = listings.slice(0, 25).map((l, i) => {
            const info = getItemInfo(l.itemId);
            return {
                label: `${info.name?.substring(0, 25) || l.itemId} (x${l.quantity})`,
                value: String(i),
                description: `${l.pricePerUnit.toLocaleString()} ${EMOJI_MORA}/واحدة`,
                emoji: info.emoji || '📦',
            };
        });
        components.push(
            new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('mkt_remove_item')
                    .setPlaceholder('➖ اختر عنصراً لإزالته من السوق...')
                    .addOptions(removeOptions)
            )
        );
    }

    components.push(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('mkt_launch')
                .setLabel('🚀 إطلاق القافلة (مع السوق)')
                .setStyle(ButtonStyle.Success)
                .setDisabled(listings.length === 0), // يفتح الزر فوراً إذا كان فيه عنصر 1 على الأقل
            new ButtonBuilder()
                .setCustomId('mkt_skip')
                .setLabel('⏭️ تخطي السوق (إرسال عادي)')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('mkt_back')
                .setLabel('↩️ رجوع')
                .setStyle(ButtonStyle.Danger)
        )
    );

    return components;
}

async function showMarketSetup(interaction, client, db, user, guild, dest) {
    const inventory = await fetchUserInventory(db, user.id, guild.id);
    const listings = getMarketListingsCache(client, user.id, guild.id);
    
    const embed = await buildMarketSetupEmbed(user, listings, inventory.length, dest);
    const components = buildMarketComponents(inventory, listings);

    const reply = await interaction.reply({ embeds: [embed], components, flags: [MessageFlags.Ephemeral], fetchReply: true });
    return reply;
}

async function handleAddItemSelect(interaction, client, db, user, guild, dest) {
    try {
        const itemId = interaction.values[0];
        const info = getItemInfo(itemId);

        const inventory = await fetchUserInventory(db, user.id, guild.id);
        const invItem = inventory.find(i => i.itemId === itemId);

        if (!invItem || invItem.quantity <= 0) {
            return await interaction.followUp({ content: '❌ لا تملك هذا العنصر.', flags: [MessageFlags.Ephemeral] });
        }

        const modal = new ModalBuilder()
            .setCustomId(`mkt_price_modal_${itemId}`)
            .setTitle(`تسعير: ${info.name}`.substring(0, 45));

        const qtyInput = new TextInputBuilder()
            .setCustomId('mkt_qty')
            .setLabel(`الكمية (لديك ${invItem.quantity})`.substring(0, 45)) 
            .setPlaceholder('أدخل عدد الوحدات للبيع')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const priceInput = new TextInputBuilder()
            .setCustomId('mkt_price')
            .setLabel(`السعر لكل واحدة (بالمورا)`)
            .setPlaceholder('أدخل السعر بالمورا')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(qtyInput),
            new ActionRowBuilder().addComponents(priceInput)
        );

        await interaction.showModal(modal);
    } catch (err) {
        console.error('[Market Setup Error]', err);
    }
}

async function handlePriceModalSubmit(modalSubmit, client, db, user, guild, dest) {
    const itemId = modalSubmit.customId.replace('mkt_price_modal_', '');
    const qtyStr = modalSubmit.fields.getTextInputValue('mkt_qty');
    const priceStr = modalSubmit.fields.getTextInputValue('mkt_price');

    const qty = parseInt(qtyStr);
    const price = parseInt(priceStr);

    if (isNaN(qty) || qty < 1) {
        return modalSubmit.followUp({ content: '❌ كمية غير صالحة.', flags: [MessageFlags.Ephemeral] });
    }

    if (isNaN(price) || price < 1) {
        return modalSubmit.followUp({ content: '❌ سعر غير صالح. يجب أن يكون أعلى من 0.', flags: [MessageFlags.Ephemeral] });
    }

    if (price > 999999999) {
        return modalSubmit.followUp({ content: '❌ السعر الأقصى هو 999,999,999 مورا.', flags: [MessageFlags.Ephemeral] });
    }

    const inventory = await fetchUserInventory(db, user.id, guild.id);
    const invItem = inventory.find(i => i.itemId === itemId);

    if (!invItem || qty > invItem.quantity) {
        return modalSubmit.followUp({ content: `❌ كمية غير متوفرة. لديك **${invItem?.quantity || 0}** فقط.`, flags: [MessageFlags.Ephemeral] });
    }

    const listings = getMarketListingsCache(client, user.id, guild.id);

    const existing = listings.find(l => l.itemId === itemId);
    if (existing) {
        return modalSubmit.followUp({ content: '❌ هذا العنصر مضاف بالفعل. أزله أولاً.', flags: [MessageFlags.Ephemeral] });
    }

    if (listings.length >= 10) {
        return modalSubmit.followUp({ content: '❌ الحد الأقصى 10 عناصر في السوق.', flags: [MessageFlags.Ephemeral] });
    }

    const info = getItemInfo(itemId);
    listings.push({
        itemId,
        itemName: info.name,
        itemEmoji: info.emoji || '📦',
        quantity: qty,
        pricePerUnit: price,
    });

    await modalSubmit.deferUpdate().catch(() => {});
    
    const embed = await buildMarketSetupEmbed(user, listings, inventory.length, dest);
    // 👑 التعديل السحري: تحديث الأزرار عشان يفتح زر الإطلاق 👑
    const components = buildMarketComponents(inventory, listings);
    
    await modalSubmit.editReply({ embeds: [embed], components }).catch(() => {});
}

async function handleRemoveItemSelect(interaction, client, db, user, guild, dest) {
    const index = parseInt(interaction.values[0]);
    const listings = getMarketListingsCache(client, user.id, guild.id);

    if (index >= 0 && index < listings.length) {
        listings.splice(index, 1);
    }

    await interaction.deferUpdate().catch(() => {});

    const inventory = await fetchUserInventory(db, user.id, guild.id);
    const embed = await buildMarketSetupEmbed(user, listings, inventory.length, dest);
    const components = buildMarketComponents(inventory, listings); // 👑 تحديث الأزرار

    await interaction.editReply({ embeds: [embed], components }).catch(() => {});
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

    const key = `market_listings_${userId}_${guildId}`;
    if (client.marketListings) client.marketListings.delete(key);

    return { ok: true, listings: dbListings };
}

function clearMarketListingsCache(client, userId, guildId) {
    const key = `market_listings_${userId}_${guildId}`;
    if (client.marketListings) client.marketListings.delete(key);
}

module.exports = {
    showMarketSetup,
    handleAddItemSelect,
    handlePriceModalSubmit,
    handleRemoveItemSelect,
    finalizeListings,
    clearMarketListingsCache,
    getMarketListingsCache,
    getItemInfo,
    // staging related
    getStagedItems,
    stagingAddItem,
    stagingRemoveItem,
    finalizeStagedItems,
    showStagingUI,
};
