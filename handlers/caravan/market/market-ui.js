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

// استدعاء getItemInfo من ملف market-setup عشان يقرأ المعلومات صح
const { getItemInfo } = require('./market-setup');

const RARITY_AR = {
    'Common': 'عادي',
    'Uncommon': 'شائع',
    'Rare': 'نادر',
    'Epic': 'ملحمي',
    'Legendary': 'أسطوري'
};

async function buildMarketEmbed(listings, dest = null) {
    const embed = new EmbedBuilder()
        .setColor(dest?.color || '#FFD700')
        .setTitle('🛒 المعروضات المتاحة في السوق')
        .setTimestamp();

    if (listings.length === 0) {
        embed.setDescription('لا توجد معروضات حالياً.');
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
            name: `${info.emoji || '📦'} ${info.name} ${rarityTxt}`,
            value: (
                `المتاح: **${available}** وحدة\n` +
                `السعر: **${pricePerUnit.toLocaleString()}** ${EMOJI_MORA}/واحدة\n` +
                `الإجمالي: **${(pricePerUnit * available).toLocaleString()}** ${EMOJI_MORA}`
            ),
            inline: true,
        });
    }

    if (fields.length === 0) {
        embed.setDescription('تم بيع جميع المعروضات بالكامل!');
    } else {
        embed.setDescription('اختر عنصراً من القائمة أدناه لشرائه.');
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
            description: `${price.toLocaleString()} ${EMOJI_MORA}/واحدة`,
            emoji: info.emoji || '📦',
        };
    });

    components.push(
        new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('mkt_buy_select')
                .setPlaceholder('🛒 اختر عنصراً لشرائه...')
                .addOptions(options)
        )
    );

    components.push(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('mkt_refresh')
                .setLabel('🔄 تحديث السوق')
                .setStyle(ButtonStyle.Secondary)
        )
    );

    return components;
}

async function handleBuySelect(interaction, client, db, user, guild) {
    try {
        const value = interaction.values[0];
        const listingId = parseInt(value.replace('buy_', ''));

        const listing = await getListingById(db, listingId);
        if (!listing) {
            return await interaction.reply({ content: '❌ العنصر لم يعد متوفراً في السوق.', flags: [MessageFlags.Ephemeral] });
        }

        const info = getItemInfo(listing.itemid || listing.itemID);
        const available = Number(listing.quantity) - Number(listing.quantitysold || listing.quantitySold || 0);

        if (available <= 0) {
            return await interaction.reply({ content: '❌ نفذت الكمية المعروضة!', flags: [MessageFlags.Ephemeral] });
        }

        if (listing.ownerid === user.id || listing.ownerID === user.id) {
            return await interaction.reply({ content: '❌ لا يمكنك شراء بضائع من سوقك الخاص!', flags: [MessageFlags.Ephemeral] });
        }

        const modal = new ModalBuilder()
            .setCustomId(`mkt_buy_modal_${listingId}`)
            .setTitle(`شراء: ${info.name}`.substring(0, 45));

        const qtyInput = new TextInputBuilder()
            .setCustomId('mkt_buy_qty')
            .setLabel(`الكمية المطلوبة (المتاح: ${available})`.substring(0, 45))
            .setPlaceholder(`أدخل الكمية من 1 إلى ${available}`)
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(qtyInput));

        await interaction.showModal(modal);
    } catch (err) {
        console.error('[Buy Select Error]', err);
    }
}

async function handleBuyModalSubmit(modalSubmit, client, db, user, guild) {
    const listingId = parseInt(modalSubmit.customId.replace('mkt_buy_modal_', ''));
    const qtyStr = modalSubmit.fields.getTextInputValue('mkt_buy_qty');
    const qty = parseInt(qtyStr);

    if (isNaN(qty) || qty < 1) {
        return modalSubmit.reply({ content: '❌ كمية غير صالحة.', flags: [MessageFlags.Ephemeral] });
    }

    const listing = await getListingById(db, listingId);
    if (!listing) {
        return modalSubmit.reply({ content: '❌ العنصر لم يعد متوفراً.', flags: [MessageFlags.Ephemeral] });
    }

    const available = Number(listing.quantity) - Number(listing.quantitysold || listing.quantitySold || 0);

    if (qty > available) {
        return modalSubmit.reply({ content: `❌ الكمية المتبقية هي **${available}** فقط.`, flags: [MessageFlags.Ephemeral] });
    }

    if (listing.ownerid === user.id || listing.ownerID === user.id) {
        return modalSubmit.reply({ content: '❌ لا يمكنك شراء بضائعك!', flags: [MessageFlags.Ephemeral] });
    }

    const pricePerUnit = Number(listing.priceperunit || listing.pricePerUnit);
    const totalPrice = qty * pricePerUnit;

    const buyerLevel = await safeQuery(db, `SELECT "mora" FROM levels WHERE "user"=$1 AND "guild"=$2`, [user.id, guild.id]);
    const buyerMora = Number(buyerLevel.rows[0]?.mora || 0);

    if (buyerMora < totalPrice) {
        return modalSubmit.reply({
            content: `❌ رصيدك غير كافٍ.\nالمطلوب: **${totalPrice.toLocaleString()}** ${EMOJI_MORA}\nرصيدك: **${buyerMora.toLocaleString()}** ${EMOJI_MORA}`,
            flags: [MessageFlags.Ephemeral],
        });
    }

    const ownerId = listing.ownerid || listing.ownerID;
    const guildId = listing.guildid || listing.guildID;

    const result = await buyItem(db, listingId, user.id, ownerId, guildId, listing.itemid || listing.itemID, qty, pricePerUnit, 'player');

    if (result.error) {
        return modalSubmit.reply({ content: `❌ ${result.error}`, flags: [MessageFlags.Ephemeral] });
    }

    const info = getItemInfo(listing.itemid || listing.itemID);

    await modalSubmit.reply({
        embeds: [new EmbedBuilder()
            .setColor('#00FF88')
            .setTitle('✅ عملية شراء ناجحة!')
            .setDescription(
                `اشتريت **${qty}x ${info.name}**\n` +
                `السعر الإجمالي: **${totalPrice.toLocaleString()}** ${EMOJI_MORA}\n` +
                `البائع: <@${ownerId}>`
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
        return interaction.reply({ content: '❌ هذا ليس سوق قافلة.', flags: [MessageFlags.Ephemeral] });
    }

    const ownerId = session.ownerid || session.ownerID;
    if (user.id !== ownerId) {
        return interaction.reply({ content: '❌ فقط صاحب السوق يمكنه تعديل الأسعار.', flags: [MessageFlags.Ephemeral] });
    }

    const listings = await getListingsBySession(db, threadId);
    const activeListings = listings.filter(l => {
        const avail = Number(l.quantity) - Number(l.quantitysold || l.quantitySold || 0);
        return avail > 0;
    });

    if (activeListings.length === 0) {
        return interaction.reply({ content: '❌ لا توجد بضائع قابلة للتعديل.', flags: [MessageFlags.Ephemeral] });
    }

    const options = activeListings.slice(0, 25).map(l => {
        const info = getItemInfo(l.itemid || l.itemID);
        return {
            label: `${info.name?.substring(0, 25) || l.itemid}`,
            value: `price_${l.id}`,
            description: `السعر الحالي: ${(l.priceperunit || l.pricePerUnit).toLocaleString()} ${EMOJI_MORA}`,
            emoji: info.emoji || '📦',
        };
    });

    await interaction.reply({
        content: '💰 اختر عنصراً لتغيير سعره:',
        components: [
            new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('mkt_price_change_select')
                    .setPlaceholder('💰 اختر عنصراً...')
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
        return interaction.reply({ content: '❌ العنصر غير موجود.', flags: [MessageFlags.Ephemeral] });
    }

    const info = getItemInfo(listing.itemid || listing.itemID);
    const currentPrice = Number(listing.priceperunit || listing.pricePerUnit);

    const modal = new ModalBuilder()
        .setCustomId(`mkt_new_price_modal_${listingId}`)
        .setTitle(`تغيير السعر: ${info.name}`.substring(0, 45));

    // 👑 إزالة الإيموجيات المخصصة لمنع انهيار الديسكورد 👑
    const priceInput = new TextInputBuilder()
        .setCustomId('mkt_new_price')
        .setLabel(`السعر الجديد (بالمورا) - الحالي: ${currentPrice}`.substring(0, 45))
        .setPlaceholder('أدخل السعر الجديد بالمورا')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(priceInput));

    await interaction.showModal(modal).catch(err => console.error('[Show Price Change Modal Error]', err));
}

async function handleNewPriceModalSubmit(modalSubmit, client, db, user) {
    const listingId = parseInt(modalSubmit.customId.replace('mkt_new_price_modal_', ''));
    const priceStr = modalSubmit.fields.getTextInputValue('mkt_new_price');
    const newPrice = parseInt(priceStr);

    if (isNaN(newPrice) || newPrice < 1) {
        return modalSubmit.reply({ content: '❌ سعر غير صالح.', flags: [MessageFlags.Ephemeral] });
    }

    if (newPrice > 999999999) {
        return modalSubmit.reply({ content: '❌ السعر الأقصى هو 999,999,999.', flags: [MessageFlags.Ephemeral] });
    }

    await updateListingPrice(db, listingId, newPrice);

    const info = (await getListingById(db, listingId));
    const itemInfo = getItemInfo(info?.itemid || info?.itemID || 'unknown');

    await modalSubmit.reply({
        content: `✅ تم تعديل سعر **${itemInfo.name}** إلى **${newPrice.toLocaleString()}** ${EMOJI_MORA}`,
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
