const {
    ActionRowBuilder, ButtonBuilder, ButtonStyle,
    StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
    MessageFlags, AttachmentBuilder, EmbedBuilder
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
const { generateMarketCanvas, ITEMS_PER_PAGE } = require('../../../generators/caravan/market-generator');

// Page state: sessionId (threadId) → page number
const marketPages = new Map();

async function buildMarketImage(listings, dest, page = 0) {
    return generateMarketCanvas(listings, dest, page);
}

function buildMarketComponents(listings, threadId, page = 0) {
    const components = [];
    const activeListings = listings.filter(l => {
        const available = Number(l.quantity) - Number(l.quantitysold || l.quantitySold || 0);
        return available > 0;
    });

    if (activeListings.length === 0) return components;

    const totalPages = Math.max(1, Math.ceil(activeListings.length / ITEMS_PER_PAGE));
    const safePage   = Math.max(0, Math.min(page, totalPages - 1));

    // Page items for buy menu
    const pageItems = activeListings.slice(safePage * ITEMS_PER_PAGE, (safePage + 1) * ITEMS_PER_PAGE);

    const options = pageItems.slice(0, 25).map(l => {
        const info = getItemInfo(l.itemid || l.itemID);
        const available = Number(l.quantity) - Number(l.quantitysold || l.quantitySold || 0);
        const price = Number(l.priceperunit || l.pricePerUnit);
        return {
            label: `${info.name?.substring(0, 25) || l.itemid} (x${available})`,
            value: `buy_${l.id}`,
            description: `${price.toLocaleString()} مورا / واحدة`,
            emoji: info.emoji || '📦',
        };
    });

    components.push(
        new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('mkt_buy_select')
                .setPlaceholder('🛒 اختر عنصراً للشراء...')
                .addOptions(options)
        )
    );

    // Pagination buttons (only shown if more than 1 page)
    if (totalPages > 1) {
        const prevBtn = new ButtonBuilder()
            .setCustomId('mkt_page_prev')
            .setLabel('◄ السابق')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(safePage === 0);

        const nextBtn = new ButtonBuilder()
            .setCustomId('mkt_page_next')
            .setLabel('التالي ►')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(safePage >= totalPages - 1);

        components.push(new ActionRowBuilder().addComponents(prevBtn, nextBtn));
    }

    return components;
}

async function updateMarketMessage(channel, listings, dest, interaction = null) {
    try {
        const threadId = channel.id;
        const page     = marketPages.get(threadId) || 0;

        // Try canvas image; fallback embed if it fails
        let buffer, components = [], canvasOk = false;
        try {
            buffer = await buildMarketImage(listings, dest, page);
            if (buffer) {
                components = buildMarketComponents(listings, threadId, page);
                canvasOk = true;
            }
        } catch (e) { console.error('[MarketCanvas Error]', e); }

        let payload;
        if (canvasOk) {
            const attachment = new AttachmentBuilder(buffer, { name: 'market.png' });
            payload = { files: [attachment] };
            if (components.length) payload.components = components;
        } else {
            // Fallback: build components safely, send simple embed
            try { components = buildMarketComponents(listings, threadId, page); } catch (e) { console.error('[MarketComponents Error]', e); components = []; }
            const mktName = `${dest.emoji || ''} سوق القافلة — ${dest.name || ''}`;
            payload = { embeds: [new EmbedBuilder().setColor(dest.color || '#FFD700').setTitle(mktName).setDescription(`🛒 ${listings.length} عنصر في السوق`).setFooter({ text: '™ Empire' })] };
            if (components.length) payload.components = components;
            console.log(`[MarketUI] Fallback embed (listings=${listings.length} components=${components.length})`);
        }

        if (interaction && interaction.message) {
            await interaction.message.edit(payload).catch(() => {});
            return;
        }

        const msgs = await channel.messages.fetch({ limit: 20 }).catch(() => null);
        if (!msgs) {
            await channel.send(payload).catch(e => console.error('[Market Send1]', e));
            return;
        }

        const marketMsg = canvasOk ? msgs.find(m =>
            m.author.id === channel.client.user.id &&
            m.attachments.some(a => a.name === 'market.png') &&
            m.components.length > 0
        ) : msgs.find(m =>
            m.author.id === channel.client.user.id &&
            m.embeds.length > 0 &&
            m.embeds[0]?.title?.includes('سوق القافلة')
        );

        if (marketMsg) {
            await marketMsg.edit(payload).catch(() => {});
        } else {
            await channel.send(payload).catch(e => console.error('[Market Send2]', e));
        }
    } catch (e) {
        console.error('[Update Market Error]', e);
    }
}

async function handlePageNav(interaction, client, db, direction) {
    try {
        await interaction.deferUpdate().catch(() => {});
        const threadId = interaction.channel.id;
        const listings = await getListingsBySession(db, threadId);
        const session  = await getSessionByThread(db, threadId);
        const dest = require('../config').caravanConfig.destinations.find(d =>
            d.id === (session?.destinationid || session?.destinationId)
        );

        const activeListings = listings.filter(l =>
            (Number(l.quantity) - Number(l.quantitysold || l.quantitySold || 0)) > 0
        );
        const totalPages = Math.max(1, Math.ceil(activeListings.length / ITEMS_PER_PAGE));
        const current    = marketPages.get(threadId) || 0;
        const next       = direction === 'next'
            ? Math.min(current + 1, totalPages - 1)
            : Math.max(current - 1, 0);

        marketPages.set(threadId, next);

        const buffer     = await buildMarketImage(listings, dest, next);
        const attachment = new AttachmentBuilder(buffer, { name: 'market.png' });
        const components = buildMarketComponents(listings, threadId, next);

        await interaction.message.edit({ embeds: [], files: [attachment], components }).catch(() => {});
    } catch (e) {
        console.error('[handlePageNav Error]', e);
    }
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

    // تمرير الـ client للحماية من ضياع الفلوس
    const result = await buyItem(db, listingId, user.id, ownerId, guildId, listing.itemid || listing.itemID, qty, pricePerUnit, 'player', client);

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

        // 👑 تحديث الصورة بدون إرسال رسالة جديدة 👑
        await updateMarketMessage(modalSubmit.channel, updatedListings, dest, modalSubmit);
    }
}

async function handleRefresh(interaction, client, db) {
    // Kept for backwards compat with any existing customId 'mkt_refresh'
    await interaction.deferUpdate().catch(() => {});
    const threadId = interaction.channel.id;
    const listings = await getListingsBySession(db, threadId);
    const session  = await getSessionByThread(db, threadId);
    const dest = require('../config').caravanConfig.destinations.find(d =>
        d.id === (session?.destinationid || session?.destinationId)
    );
    await updateMarketMessage(interaction.channel, listings, dest, interaction);
}

async function refreshMarketMessage(channel, db) {
    const threadId = channel.id;
    const listings = await getListingsBySession(db, threadId);
    const session = await getSessionByThread(db, threadId);
    const dest = require('../config').caravanConfig.destinations.find(d =>
        d.id === (session?.destinationid || session?.destinationId)
    );

    // 👑 التحديث الذكي للسوق 👑
    await updateMarketMessage(channel, listings, dest);
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

    const priceInput = new TextInputBuilder()
        .setCustomId('mkt_new_price')
        .setLabel(`السعر الجديد (الحالي: ${currentPrice})`.substring(0, 45))
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
        content: `✅ تم تعديل سعر **${itemInfo.name}** إلى **${newPrice.toLocaleString()}** مورا`,
        flags: [MessageFlags.Ephemeral],
    });

    const threadId = modalSubmit.channel.id;
    const listings = await getListingsBySession(db, threadId);
    const session = await getSessionByThread(db, threadId);
    const dest = require('../config').caravanConfig.destinations.find(d =>
        d.id === (session?.destinationid || session?.destinationId)
    );

    // 👑 التحديث الذكي للصورة بدل إرسال رسالة جديدة 👑
    await updateMarketMessage(modalSubmit.channel, listings, dest);
}

module.exports = {
    buildMarketImage,
    buildMarketComponents,
    updateMarketMessage,
    handleBuySelect,
    handleBuyModalSubmit,
    handleRefresh,
    handlePageNav,
    refreshMarketMessage,
    handleOwnerPriceChange,
    handlePriceChangeSelect,
    handleNewPriceModalSubmit,
    marketPages,
};
