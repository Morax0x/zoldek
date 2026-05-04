const {
    EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
    StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
    MessageFlags,
} = require('discord.js');
const { safeQuery } = require('../db');
const { EMOJI_MORA } = require('../config');
const {
    buyItem,
    getListingsBySession,
    getSessionByThread,
    getListingById,
    updateListingPrice,
} = require('./market-db');
const { getItemInfo } = require('./market-setup');

const RARITY_AR = {
    'Common': '\u0639\u0627\u062f\u064a',
    'Uncommon': '\u0634\u0627\u0626\u0639',
    'Rare': '\u0646\u0627\u062f\u0631',
    'Epic': '\u0645\u0644\u062d\u0645\u064a',
    'Legendary': '\u0623\u0633\u0637\u0648\u0631\u064a'
};

async function buildMarketEmbed(listings, dest = null) {
    const embed = new EmbedBuilder()
        .setColor(dest?.color || '#FFD700')
        .setTitle('\ud83d\uded2 \u0627\u0644\u0645\u0639\u0631\u0648\u0636\u0627\u062a \u0627\u0644\u0645\u062a\u0627\u062d\u0629')
        .setTimestamp();

    if (listings.length === 0) {
        embed.setDescription('\u0644\u0627 \u062a\u0648\u062c\u062f \u0645\u0639\u0631\u0648\u0636\u0627\u062a \u062d\u0627\u0644\u064a\u0627\u064b.');
        return embed;
    }

    const fields = [];
    for (const listing of listings) {
        const info = getItemInfo(listing.itemid || listing.itemID);
        const qty = Number(listing.quantity);
        const sold = Number(listing.quantitysold || listing.quantitySold || 0);
        const available = qty - sold;

        if (available <= 0) continue;

        const pricePerUnit = Number(listing.priceperunit || listing.pricePerUnit);
        const rarityTxt = info.rarity ? `[${RARITY_AR[info.rarity] || info.rarity}] ` : '';

        fields.push({
            name: `${info.emoji || '\ud83d\udce6'} ${info.name} ${rarityTxt}`,
            value: (
                `\u0627\u0644\u0645\u062a\u0627\u062d: **${available}** \u0648\u062d\u062f\u0629\n` +
                `\u0627\u0644\u0633\u0639\u0631: **${pricePerUnit.toLocaleString()}** ${EMOJI_MORA}/\u0648\u0627\u062d\u062f\u0629\n` +
                `\u0627\u0644\u0625\u062c\u0645\u0627\u0644\u064a: **${(pricePerUnit * available).toLocaleString()}** ${EMOJI_MORA}`
            ),
            inline: true,
        });
    }

    if (fields.length === 0) {
        embed.setDescription('\u062a\u0645 \u0628\u064a\u0639 \u062c\u0645\u064a\u0639 \u0627\u0644\u0645\u0639\u0631\u0648\u0636\u0627\u062a!');
    } else {
        embed.setDescription('\u0627\u062e\u062a\u0631 \u0639\u0646\u0635\u0631\u0627\u064b \u0645\u0646 \u0627\u0644\u0642\u0627\u0626\u0645\u0629 \u0623\u062f\u0646\u0627\u0647 \u0644\u0634\u0631\u0627\u0626\u0647.');
        embed.addFields(fields);
    }

    return embed;
}

function buildMarketComponents(listings) {
    const components = [];
    const activeListings = listings.filter(l => {
        const available = Number(l.quantity) - Number(l.quantitysold || l.quantitySold || 0);
        return available > 0;
    });

    if (activeListings.length === 0) {
        return components;
    }

    const options = activeListings.slice(0, 25).map(l => {
        const info = getItemInfo(l.itemid || l.itemID);
        const available = Number(l.quantity) - Number(l.quantitysold || l.quantitySold || 0);
        const price = Number(l.priceperunit || l.pricePerUnit);
        return {
            label: `${info.name?.substring(0, 25) || l.itemid} (x${available})`,
            value: `buy_${l.id}`,
            description: `${price.toLocaleString()} ${EMOJI_MORA}/\u0648\u0627\u062d\u062f\u0629`,
            emoji: info.emoji || '\ud83d\udce6',
        };
    });

    components.push(
        new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('mkt_buy_select')
                .setPlaceholder('\ud83d\uded2 \u0627\u062e\u062a\u0631 \u0639\u0646\u0635\u0631\u0627\u064b \u0644\u0634\u0631\u0627\u0626\u0647...')
                .addOptions(options)
        )
    );

    components.push(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('mkt_refresh')
                .setLabel('\ud83d\udd04 \u062a\u062d\u062f\u064a\u062b')
                .setStyle(ButtonStyle.Secondary)
        )
    );

    return components;
}

async function handleBuySelect(interaction, client, db, user, guild) {
    const value = interaction.values[0];
    const listingId = parseInt(value.replace('buy_', ''));

    const listing = await getListingById(db, listingId);
    if (!listing) {
        return interaction.reply({ content: '\u274c \u0627\u0644\u0639\u0646\u0635\u0631 \u063a\u064a\u0631 \u0645\u062a\u0648\u0641\u0631.', flags: [MessageFlags.Ephemeral] });
    }

    const info = getItemInfo(listing.itemid || listing.itemID);
    const available = Number(listing.quantity) - Number(listing.quantitysold || listing.quantitySold || 0);

    if (available <= 0) {
        return interaction.reply({ content: '\u274c \u0646\u0641\u0630\u062a \u0627\u0644\u0643\u0645\u064a\u0629!', flags: [MessageFlags.Ephemeral] });
    }

    if (listing.ownerid === user.id || listing.ownerID === user.id) {
        return interaction.reply({ content: '\u274c \u0644\u0627 \u064a\u0645\u0643\u0646\u0643 \u0634\u0631\u0627\u0621 \u0639\u0646\u0635\u0631 \u0645\u0646 \u0633\u0648\u0642\u0643!', flags: [MessageFlags.Ephemeral] });
    }

    const modal = new ModalBuilder()
        .setCustomId(`mkt_buy_modal_${listingId}`)
        .setTitle(`\u0634\u0631\u0627\u0621: ${info.name}`);

    const qtyInput = new TextInputBuilder()
        .setCustomId('mkt_buy_qty')
        .setLabel(`\u0627\u0644\u0643\u0645\u064a\u0629 (\u0627\u0644\u0645\u062a\u0627\u062d: ${available})`)
        .setPlaceholder(`\u0623\u062f\u062e\u0644 \u0627\u0644\u0643\u0645\u064a\u0629 (1-${available})`)
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(qtyInput));

    await interaction.showModal(modal);
}

async function handleBuyModalSubmit(modalSubmit, client, db, user, guild) {
    const listingId = parseInt(modalSubmit.customId.replace('mkt_buy_modal_', ''));
    const qtyStr = modalSubmit.fields.getTextInputValue('mkt_buy_qty');
    const qty = parseInt(qtyStr);

    if (isNaN(qty) || qty < 1) {
        return modalSubmit.reply({ content: '\u274c \u0643\u0645\u064a\u0629 \u063a\u064a\u0631 \u0635\u0627\u0644\u062d\u0629.', flags: [MessageFlags.Ephemeral] });
    }

    const listing = await getListingById(db, listingId);
    if (!listing) {
        return modalSubmit.reply({ content: '\u274c \u0627\u0644\u0639\u0646\u0635\u0631 \u063a\u064a\u0631 \u0645\u062a\u0648\u0641\u0631.', flags: [MessageFlags.Ephemeral] });
    }

    const available = Number(listing.quantity) - Number(listing.quantitysold || listing.quantitySold || 0);

    if (qty > available) {
        return modalSubmit.reply({ content: `\u274c \u0627\u0644\u0643\u0645\u064a\u0629 \u0627\u0644\u0645\u062a\u0627\u062d\u0629 \u0647\u064a **${available}** \u0641\u0642\u0637.`, flags: [MessageFlags.Ephemeral] });
    }

    if (listing.ownerid === user.id || listing.ownerID === user.id) {
        return modalSubmit.reply({ content: '\u274c \u0644\u0627 \u064a\u0645\u0643\u0646\u0643 \u0634\u0631\u0627\u0621 \u0639\u0646\u0635\u0631 \u0645\u0646 \u0633\u0648\u0642\u0643!', flags: [MessageFlags.Ephemeral] });
    }

    const pricePerUnit = Number(listing.priceperunit || listing.pricePerUnit);
    const totalPrice = qty * pricePerUnit;

    const buyerLevel = await safeQuery(db,
        `SELECT "mora" FROM levels WHERE "user"=$1 AND "guild"=$2`,
        [user.id, guild.id]);

    const buyerMora = Number(buyerLevel.rows[0]?.mora || 0);

    if (buyerMora < totalPrice) {
        return modalSubmit.reply({
            content: `\u274c \u0631\u0635\u064a\u062f\u0643 \u063a\u064a\u0631 \u0643\u0627\u0641\u064d.\n\u0627\u0644\u0645\u0637\u0644\u0648\u0628: **${totalPrice.toLocaleString()}** ${EMOJI_MORA}\n\u0631\u0635\u064a\u062f\u0643: **${buyerMora.toLocaleString()}** ${EMOJI_MORA}`,
            flags: [MessageFlags.Ephemeral],
        });
    }

    const ownerId = listing.ownerid || listing.ownerID;
    const guildId = listing.guildid || listing.guildID;

    const result = await buyItem(
        db,
        listingId,
        user.id,
        ownerId,
        guildId,
        listing.itemid || listing.itemID,
        qty,
        pricePerUnit,
        'player'
    );

    if (result.error) {
        return modalSubmit.reply({ content: `\u274c ${result.error}`, flags: [MessageFlags.Ephemeral] });
    }

    const info = getItemInfo(listing.itemid || listing.itemID);

    await modalSubmit.reply({
        embeds: [new EmbedBuilder()
            .setColor('#00FF88')
            .setTitle('\u2705 \u0639\u0645\u0644\u064a\u0629 \u0634\u0631\u0627\u0621 \u0646\u0627\u062c\u062d\u0629!')
            .setDescription(
                `\u0634\u0631\u064a\u062a **${qty}x ${info.name}**\n` +
                `\u0627\u0644\u0633\u0639\u0631 \u0627\u0644\u0625\u062c\u0645\u0627\u0644\u064a: **${totalPrice.toLocaleString()}** ${EMOJI_MORA}\n` +
                `\u0627\u0644\u0628\u0627\u0626\u0639: <@${ownerId}>`
            )
            .setTimestamp()],
        flags: [MessageFlags.Ephemeral],
    });

    const session = await getSessionByThread(db, modalSubmit.channel.id);
    if (session) {
        const updatedListings = await getListingsBySession(db, modalSubmit.channel.id);
        const dest = require('../config').caravanConfig.destinations.find(d => d.id === (session.destinationid || session.destinationId));

        await modalSubmit.channel.send({
            embeds: [await buildMarketEmbed(updatedListings, dest)],
            components: buildMarketComponents(updatedListings),
        }).catch(() => {});
    }
}

async function handleRefresh(interaction, client, db) {
    const threadId = interaction.channel.id;
    const listings = await getListingsBySession(db, threadId);
    const session = await getSessionByThread(db, threadId);
    const dest = require('../config').caravanConfig.destinations.find(d =>
        d.id === (session?.destinationid || session?.destinationId)
    );

    await interaction.deferUpdate().catch(() => {});

    await interaction.editReply({
        embeds: [await buildMarketEmbed(listings, dest)],
        components: buildMarketComponents(listings),
    }).catch(() => {});
}

async function refreshMarketMessage(channel, db) {
    const threadId = channel.id;
    const listings = await getListingsBySession(db, threadId);
    const session = await getSessionByThread(db, threadId);
    const dest = require('../config').caravanConfig.destinations.find(d =>
        d.id === (session?.destinationid || session?.destinationId)
    );

    await channel.send({
        embeds: [await buildMarketEmbed(listings, dest)],
        components: buildMarketComponents(listings),
    }).catch(() => {});
}

async function handleOwnerPriceChange(interaction, client, db, user) {
    const threadId = interaction.channel.id;
    const session = await getSessionByThread(db, threadId);

    if (!session) {
        return interaction.reply({ content: '\u274c \u0647\u0630\u0627 \u0644\u064a\u0633 \u0633\u0648\u0642 \u0642\u0627\u0641\u0644\u0629.', flags: [MessageFlags.Ephemeral] });
    }

    const ownerId = session.ownerid || session.ownerID;
    if (user.id !== ownerId) {
        return interaction.reply({ content: '\u274c \u0641\u0642\u0637 \u0635\u0627\u062d\u0628 \u0627\u0644\u0633\u0648\u0642 \u064a\u0645\u0643\u0646\u0647 \u062a\u063a\u064a\u064a\u0631 \u0627\u0644\u0623\u0633\u0639\u0627\u0631.', flags: [MessageFlags.Ephemeral] });
    }

    const listings = await getListingsBySession(db, threadId);
    const activeListings = listings.filter(l => {
        const avail = Number(l.quantity) - Number(l.quantitysold || l.quantitySold || 0);
        return avail > 0;
    });

    if (activeListings.length === 0) {
        return interaction.reply({ content: '\u274c \u0644\u0627 \u062a\u0648\u062c\u062f \u0639\u0646\u0627\u0635\u0631 \u0642\u0627\u0628\u0644\u0629 \u0644\u0644\u062a\u0639\u062f\u064a\u0644.', flags: [MessageFlags.Ephemeral] });
    }

    const options = activeListings.slice(0, 25).map(l => {
        const info = getItemInfo(l.itemid || l.itemID);
        return {
            label: `${info.name?.substring(0, 25) || l.itemid}`,
            value: `price_${l.id}`,
            description: `\u0627\u0644\u0633\u0639\u0631 \u0627\u0644\u062d\u0627\u0644\u064a: ${(l.priceperunit || l.pricePerUnit).toLocaleString()} ${EMOJI_MORA}`,
            emoji: info.emoji || '\ud83d\udce6',
        };
    });

    await interaction.reply({
        content: '\ud83d\udcb0 \u0627\u062e\u062a\u0631 \u0639\u0646\u0635\u0631\u0627\u064b \u0644\u062a\u063a\u064a\u064a\u0631 \u0633\u0639\u0631\u0647:',
        components: [
            new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('mkt_price_change_select')
                    .setPlaceholder('\ud83d\udcb0 \u0627\u062e\u062a\u0631 \u0639\u0646\u0635\u0631\u0627\u064b...')
                    .addOptions(options)
            )
        ],
        flags: [MessageFlags.Ephemeral],
    });
}

async function handlePriceChangeSelect(interaction, client, db, user) {
    const value = interaction.values[0];
    const listingId = parseInt(value.replace('price_', ''));

    const listing = await getListingById(db, listingId);
    if (!listing) {
        return interaction.reply({ content: '\u274c \u0627\u0644\u0639\u0646\u0635\u0631 \u063a\u064a\u0631 \u0645\u0648\u062c\u0648\u062f.', flags: [MessageFlags.Ephemeral] });
    }

    const info = getItemInfo(listing.itemid || listing.itemID);
    const currentPrice = Number(listing.priceperunit || listing.pricePerUnit);

    const modal = new ModalBuilder()
        .setCustomId(`mkt_new_price_modal_${listingId}`)
        .setTitle(`\u062a\u063a\u064a\u064a\u0631 \u0627\u0644\u0633\u0639\u0631: ${info.name}`);

    const priceInput = new TextInputBuilder()
        .setCustomId('mkt_new_price')
        .setLabel(`\u0627\u0644\u0633\u0639\u0631 \u0627\u0644\u062c\u062f\u064a\u062f (${EMOJI_MORA}) \u2014 \u0627\u0644\u062d\u0627\u0644\u064a: ${currentPrice.toLocaleString()}`)
        .setPlaceholder('\u0623\u062f\u062e\u0644 \u0627\u0644\u0633\u0639\u0631 \u0627\u0644\u062c\u062f\u064a\u062f')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(priceInput));

    await interaction.showModal(modal);
}

async function handleNewPriceModalSubmit(modalSubmit, client, db, user) {
    const listingId = parseInt(modalSubmit.customId.replace('mkt_new_price_modal_', ''));
    const priceStr = modalSubmit.fields.getTextInputValue('mkt_new_price');
    const newPrice = parseInt(priceStr);

    if (isNaN(newPrice) || newPrice < 1) {
        return modalSubmit.reply({ content: '\u274c \u0633\u0639\u0631 \u063a\u064a\u0631 \u0635\u0627\u0644\u062d.', flags: [MessageFlags.Ephemeral] });
    }

    if (newPrice > 999999999) {
        return modalSubmit.reply({ content: '\u274c \u0627\u0644\u0633\u0639\u0631 \u0627\u0644\u0642\u0635\u0648\u0649 \u0647\u0648 999,999,999.', flags: [MessageFlags.Ephemeral] });
    }

    await updateListingPrice(db, listingId, newPrice);

    const info = (await getListingById(db, listingId));
    const itemInfo = getItemInfo(info?.itemid || info?.itemID || 'unknown');

    await modalSubmit.reply({
        content: `\u2705 \u062a\u0645 \u062a\u063a\u064a\u064a\u0631 \u0633\u0639\u0631 **${itemInfo.name}** \u0625\u0644\u0649 **${newPrice.toLocaleString()}** ${EMOJI_MORA}`,
        flags: [MessageFlags.Ephemeral],
    });

    const threadId = modalSubmit.channel.id;
    const listings = await getListingsBySession(db, threadId);
    const session = await getSessionByThread(db, threadId);
    const dest = require('../config').caravanConfig.destinations.find(d =>
        d.id === (session?.destinationid || session?.destinationId)
    );

    await modalSubmit.channel.send({
        embeds: [await buildMarketEmbed(listings, dest)],
        components: buildMarketComponents(listings),
    }).catch(() => {});
}

module.exports = {
    buildMarketEmbed,
    buildMarketComponents,
    handleBuySelect,
    handleBuyModalSubmit,
    handleRefresh,
    refreshMarketMessage,
    handleOwnerPriceChange,
    handlePriceChangeSelect,
    handleNewPriceModalSubmit,
};
