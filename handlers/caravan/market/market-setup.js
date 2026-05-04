const {
    EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
    StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
    MessageFlags,
} = require('discord.js');
const { safeQuery } = require('../db');
const { EMOJI_MORA } = require('../config');
const { createListing, lockItemsFromInventory, getListingsByCaravan } = require('./market-db');

const upgradeMats = require('../../../json/upgrade-materials.json');
const seedsData = require('../../../json/seeds.json');
const farmAnimals = require('../../../json/farm-animals.json');
const path = require('path');
const shopItems = require(path.join(process.cwd(), 'json', 'shop-items.json'));

const RARITY_AR = {
    'Common': '\u0639\u0627\u062f\u064a',
    'Uncommon': '\u0634\u0627\u0626\u0639',
    'Rare': '\u0646\u0627\u062f\u0631',
    'Epic': '\u0645\u0644\u062d\u0645\u064a',
    'Legendary': '\u0623\u0633\u0637\u0648\u0631\u064a'
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
    return ITEM_DICT.get(id) || { name: id.replace(/_/g, ' '), emoji: '\ud83d\udce6', rarity: 'Common' };
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
        .setTitle('\ud83c\udfea \u0633\u0648\u0642 \u0627\u0644\u0642\u0627\u0641\u0644\u0629 \u2014 \u062a\u062d\u0636\u064a\u0631 \u0627\u0644\u0628\u0636\u0627\u0626\u0639')
        .setDescription(
            `\u0623\u0636\u0641 \u0639\u0646\u0627\u0635\u0631 \u0645\u0646 \u0645\u062e\u0632\u0648\u0646\u0643 \u0644\u0628\u064a\u0639\u0647\u0627 \u0641\u064a \u0633\u0648\u0642 \u0627\u0644\u0642\u0627\u0641\u0644\u0629 \u0639\u0646\u062f \u0627\u0644\u0648\u0635\u0648\u0644.\n` +
            `\ud83d\udce6 \u0639\u0646\u0627\u0635\u0631 \u0641\u064a \u0627\u0644\u0645\u062e\u0632\u0648\u0646: **${inventoryCount}**\n` +
            `\ud83d\udcb0 \u0627\u0644\u0642\u064a\u0645\u0629 \u0627\u0644\u0625\u062c\u0645\u0627\u0644\u064a\u0629: **${totalValue.toLocaleString()}** ${EMOJI_MORA}`
        );

    if (listings.length > 0) {
        const fields = listings.map((l, i) => {
            const info = getItemInfo(l.itemId);
            const rarityTxt = info.rarity ? `[${RARITY_AR[info.rarity] || info.rarity}] ` : '';
            return {
                name: `${i + 1}. ${info.emoji || '\ud83d\udce6'} ${info.name} ${rarityTxt}`,
                value: `\u0627\u0644\u0643\u0645\u064a\u0629: **${l.quantity}** | \u0627\u0644\u0633\u0639\u0631: **${l.pricePerUnit.toLocaleString()}** ${EMOJI_MORA}/\u0648\u0627\u062d\u062f\u0629`,
                inline: false,
            };
        });
        embed.addFields(fields);
    } else {
        embed.addFields({
            name: '\u0644\u0627 \u062a\u0648\u062c\u062f \u0628\u0636\u0627\u0626\u0639 \u062d\u0627\u0644\u064a\u0627\u064b',
            value: '\u0627\u062e\u062a\u0631 \u0639\u0646\u0627\u0635\u0631 \u0645\u0646 \u0627\u0644\u0642\u0627\u0626\u0645\u0629 \u0623\u062f\u0646\u0627\u0647 \u0644\u0625\u0636\u0627\u0641\u062a\u0647\u0627.',
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

async function showMarketSetup(interaction, client, db, user, guild, dest) {
    const inventory = await fetchUserInventory(db, user.id, guild.id);
    const listings = getMarketListingsCache(client, user.id, guild.id);
    const listedItemIds = new Set(listings.map(l => l.itemId));
    const availableItems = inventory.filter(i => !listedItemIds.has(i.itemId));

    const embed = await buildMarketSetupEmbed(user, listings, inventory.length, dest);

    const options = availableItems.slice(0, 25).map(item => {
        const info = getItemInfo(item.itemId);
        const rarityTxt = info.rarity ? `[${RARITY_AR[info.rarity] || info.rarity}] ` : '';
        return {
            label: `${info.name?.substring(0, 25) || item.itemId}`,
            value: item.itemId,
            description: `${rarityTxt}\u0627\u0644\u0645\u062a\u0648\u0641\u0631: ${item.quantity}`,
            emoji: info.emoji || '\ud83d\udce6',
        };
    });

    const components = [];

    if (options.length > 0) {
        components.push(
            new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('mkt_add_item')
                    .setPlaceholder('\u2795 \u0627\u062e\u062a\u0631 \u0639\u0646\u0635\u0631\u0627\u064b \u0644\u0625\u0636\u0627\u0641\u062a\u0647 \u0625\u0644\u0649 \u0627\u0644\u0633\u0648\u0642...')
                    .addOptions(options)
            )
        );
    }

    if (listings.length > 0) {
        const removeOptions = listings.slice(0, 25).map((l, i) => {
            const info = getItemInfo(l.itemId);
            return {
                label: `${info.name?.substring(0, 25) || l.itemId} (x${l.quantity})`,
                value: String(i),
                description: `${l.pricePerUnit.toLocaleString()} ${EMOJI_MORA}/\u0648\u0627\u062d\u062f\u0629`,
                emoji: info.emoji || '\ud83d\udce6',
            };
        });
        components.push(
            new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('mkt_remove_item')
                    .setPlaceholder('\u2796 \u0627\u062e\u062a\u0631 \u0639\u0646\u0635\u0631\u0627\u064b \u0644\u0625\u0632\u0627\u0644\u062a\u0647 \u0645\u0646 \u0627\u0644\u0633\u0648\u0642...')
                    .addOptions(removeOptions)
            )
        );
    }

    components.push(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('mkt_launch')
                .setLabel('\ud83d\ude80 \u0625\u0637\u0644\u0627\u0642 \u0627\u0644\u0642\u0627\u0641\u0644\u0629 (\u0645\u0639 \u0627\u0644\u0633\u0648\u0642)')
                .setStyle(ButtonStyle.Success)
                .setDisabled(listings.length === 0),
            new ButtonBuilder()
                .setCustomId('mkt_skip')
                .setLabel('\u23ed\uFE0F \u062a\u062e\u0637\u064a \u0627\u0644\u0633\u0648\u0642 (\u0625\u0631\u0633\u0627\u0644 \u0639\u0627\u062f\u064a)')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('mkt_back')
                .setLabel('\u21a9\uFE0F \u0631\u062c\u0648\u0639')
                .setStyle(ButtonStyle.Danger)
        )
    );

    const reply = await interaction.reply({ embeds: [embed], components, flags: [MessageFlags.Ephemeral], fetchReply: true });
    return reply;
}

async function handleAddItemSelect(interaction, client, db, user, guild, dest) {
    const itemId = interaction.values[0];
    const info = getItemInfo(itemId);

    const inventory = await fetchUserInventory(db, user.id, guild.id);
    const invItem = inventory.find(i => i.itemId === itemId);

    if (!invItem || invItem.quantity <= 0) {
        return interaction.followUp({ content: '\u274c \u0644\u0627 \u062a\u0645\u0644\u0643 \u0647\u0630\u0627 \u0627\u0644\u0639\u0646\u0635\u0631.', flags: [MessageFlags.Ephemeral] });
    }

    const modal = new ModalBuilder()
        .setCustomId(`mkt_price_modal_${itemId}`)
        .setTitle(`\u062a\u0633\u0639\u064a\u0631: ${info.name}`);

    const qtyInput = new TextInputBuilder()
        .setCustomId('mkt_qty')
        .setLabel(`\u0627\u0644\u0643\u0645\u064a\u0629 (\u0627\u0644\u0645\u062a\u0648\u0641\u0631: ${invItem.quantity})`)
        .setPlaceholder('\u0623\u062f\u062e\u0644 \u0639\u062f\u062f \u0627\u0644\u0648\u062d\u062f\u0627\u062a \u0644\u0644\u0628\u064a\u0639')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

    const priceInput = new TextInputBuilder()
        .setCustomId('mkt_price')
        .setLabel(`\u0627\u0644\u0633\u0639\u0631 \u0644\u0643\u0644 \u0648\u0627\u062d\u062f\u0629 (${EMOJI_MORA})`)
        .setPlaceholder('\u0623\u062f\u062e\u0644 \u0627\u0644\u0633\u0639\u0631 \u0628\u0627\u0644\u0645\u0648\u0631\u0627')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

    modal.addComponents(
        new ActionRowBuilder().addComponents(qtyInput),
        new ActionRowBuilder().addComponents(priceInput)
    );

    await interaction.showModal(modal);
}

async function handlePriceModalSubmit(modalSubmit, client, db, user, guild, dest) {
    const itemId = modalSubmit.customId.replace('mkt_price_modal_', '');
    const qtyStr = modalSubmit.fields.getTextInputValue('mkt_qty');
    const priceStr = modalSubmit.fields.getTextInputValue('mkt_price');

    const qty = parseInt(qtyStr);
    const price = parseInt(priceStr);

    if (isNaN(qty) || qty < 1) {
        return modalSubmit.followUp({ content: '\u274c \u0643\u0645\u064a\u0629 \u063a\u064a\u0631 \u0635\u0627\u0644\u062d\u0629.', flags: [MessageFlags.Ephemeral] });
    }

    if (isNaN(price) || price < 1) {
        return modalSubmit.followUp({ content: '\u274c \u0633\u0639\u0631 \u063a\u064a\u0631 \u0635\u0627\u0644\u062d. \u064a\u062c\u0628 \u0623\u0646 \u064a\u0643\u0648\u0646 \u0623\u0639\u0644\u0649 \u0645\u0646 0.', flags: [MessageFlags.Ephemeral] });
    }

    if (price > 999999999) {
        return modalSubmit.followUp({ content: '\u274c \u0627\u0644\u0633\u0639\u0631 \u0627\u0644\u0642\u0635\u0648\u0649 \u0647\u0648 999,999,999 \u0645\u0648\u0631\u0627.', flags: [MessageFlags.Ephemeral] });
    }

    const inventory = await fetchUserInventory(db, user.id, guild.id);
    const invItem = inventory.find(i => i.itemId === itemId);

    if (!invItem || qty > invItem.quantity) {
        return modalSubmit.followUp({ content: `\u274c \u0643\u0645\u064a\u0629 \u063a\u064a\u0631 \u0645\u062a\u0648\u0641\u0631\u0629. \u0644\u062f\u064a\u0643 **${invItem?.quantity || 0}** \u0641\u0642\u0637.`, flags: [MessageFlags.Ephemeral] });
    }

    const listings = getMarketListingsCache(client, user.id, guild.id);

    const existing = listings.find(l => l.itemId === itemId);
    if (existing) {
        return modalSubmit.followUp({ content: '\u274c \u0647\u0630\u0627 \u0627\u0644\u0639\u0646\u0635\u0631 \u0645\u0636\u0627\u0641 \u0628\u0627\u0644\u0641\u0639\u0644. \u0623\u0632\u0644\u0647 \u0623\u0648\u0644\u0627\u064b.', flags: [MessageFlags.Ephemeral] });
    }

    if (listings.length >= 10) {
        return modalSubmit.followUp({ content: '\u274c \u0627\u0644\u062d\u062f \u0627\u0644\u0623\u0642\u0635\u0649 10 \u0639\u0646\u0627\u0635\u0631 \u0641\u064a \u0627\u0644\u0633\u0648\u0642.', flags: [MessageFlags.Ephemeral] });
    }

    const info = getItemInfo(itemId);
    listings.push({
        itemId,
        itemName: info.name,
        itemEmoji: info.emoji || '\ud83d\udce6',
        quantity: qty,
        pricePerUnit: price,
    });

    await modalSubmit.deferUpdate().catch(() => {});
    const embed = await buildMarketSetupEmbed(user, listings, inventory.length, dest);
    await modalSubmit.editReply({ embeds: [embed] }).catch(() => {});
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

    const listedItemIds = new Set(listings.map(l => l.itemId));
    const availableItems = inventory.filter(i => !listedItemIds.has(i.itemId));

    const options = availableItems.slice(0, 25).map(item => {
        const info = getItemInfo(item.itemId);
        const rarityTxt = info.rarity ? `[${RARITY_AR[info.rarity] || info.rarity}] ` : '';
        return {
            label: `${info.name?.substring(0, 25) || item.itemId}`,
            value: item.itemId,
            description: `${rarityTxt}\u0627\u0644\u0645\u062a\u0648\u0641\u0631: ${item.quantity}`,
            emoji: info.emoji || '\ud83d\udce6',
        };
    });

    const components = [];

    if (options.length > 0) {
        components.push(
            new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('mkt_add_item')
                    .setPlaceholder('\u2795 \u0627\u062e\u062a\u0631 \u0639\u0646\u0635\u0631\u0627\u064b \u0644\u0625\u0636\u0627\u0641\u062a\u0647 \u0625\u0644\u0649 \u0627\u0644\u0633\u0648\u0642...')
                    .addOptions(options)
            )
        );
    }

    if (listings.length > 0) {
        const removeOptions = listings.slice(0, 25).map((l, i) => {
            const info = getItemInfo(l.itemId);
            return {
                label: `${info.name?.substring(0, 25) || l.itemId} (x${l.quantity})`,
                value: String(i),
                description: `${l.pricePerUnit.toLocaleString()} ${EMOJI_MORA}/\u0648\u0627\u062d\u062f\u0629`,
                emoji: info.emoji || '\ud83d\udce6',
            };
        });
        components.push(
            new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('mkt_remove_item')
                    .setPlaceholder('\u2796 \u0627\u062e\u062a\u0631 \u0639\u0646\u0635\u0631\u0627\u064b \u0644\u0625\u0632\u0627\u0644\u062a\u0647 \u0645\u0646 \u0627\u0644\u0633\u0648\u0642...')
                    .addOptions(removeOptions)
            )
        );
    }

    components.push(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('mkt_launch')
                .setLabel('\ud83d\ude80 \u0625\u0637\u0644\u0627\u0642 \u0627\u0644\u0642\u0627\u0641\u0644\u0629 (\u0645\u0639 \u0627\u0644\u0633\u0648\u0642)')
                .setStyle(ButtonStyle.Success)
                .setDisabled(listings.length === 0),
            new ButtonBuilder()
                .setCustomId('mkt_skip')
                .setLabel('\u23ed\uFE0F \u062a\u062e\u0637\u064a \u0627\u0644\u0633\u0648\u0642 (\u0625\u0631\u0633\u0627\u0644 \u0639\u0627\u062f\u064a)')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('mkt_back')
                .setLabel('\u21a9\uFE0F \u0631\u062c\u0648\u0639')
                .setStyle(ButtonStyle.Danger)
        )
    );

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
};
