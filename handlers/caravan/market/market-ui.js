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
const { createCanvas, loadImage } = require('@napi-rs/canvas');

// 👑 دالة توليد صورة السوق الفخمة (Canvas) 👑
async function buildMarketImage(listings, dest) {
    const canvas = createCanvas(800, 500);
    const ctx = canvas.getContext('2d');

    // 1. رسم الخلفية
    try {
        const bg = await loadImage('https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev/images/dungeon/desert_caravan.jpg');
        ctx.drawImage(bg, 0, 0, 800, 500);
    } catch (e) {
        ctx.fillStyle = '#1c1c1e';
        ctx.fillRect(0, 0, 800, 500);
    }

    // تظليل الخلفية لإبراز النصوص
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillRect(0, 0, 800, 500);

    // 2. رسم العنوان
    ctx.textAlign = 'center';
    ctx.fillStyle = dest?.color || '#FFD700';
    ctx.font = 'bold 38px "sans-serif"';
    ctx.fillText(`🛒 سوق القافلة — ${dest?.name || 'المدينة المجهولة'}`, 400, 55);

    // تصفية البضائع المتاحة فقط
    const activeListings = listings.filter(l => (Number(l.quantity) - Number(l.quantitysold || l.quantitySold || 0)) > 0);

    // 3. حالة السوق فارغ
    if (activeListings.length === 0) {
        ctx.fillStyle = '#E74C3C';
        ctx.font = 'bold 45px "sans-serif"';
        ctx.fillText('نفذت جميع البضائع من السوق!', 400, 250);
        return canvas.toBuffer('image/png');
    }

    // 4. رسم البضائع في شبكة (Grid)
    const startX = 40;
    const startY = 110;
    const boxW = 340;
    const boxH = 70;
    const gapX = 40;
    const gapY = 15;

    let row = 0; let col = 1; // للرسم من اليمين لليسار (عربي)

    for (let i = 0; i < activeListings.length; i++) {
        const listing = activeListings[i];
        const info = getItemInfo(listing.itemid || listing.itemID);
        const qty = Number(listing.quantity) - Number(listing.quantitysold || listing.quantitySold || 0);
        const price = Number(listing.priceperunit || listing.pricePerUnit);

        const x = startX + col * (boxW + gapX);
        const y = startY + row * (boxH + gapY);

        // صندوق البضاعة
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.strokeStyle = dest?.color || '#FFD700';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(x, y, boxW, boxH, 8);
        ctx.fill();
        ctx.stroke();

        // اسم الأداة
        ctx.textAlign = 'right';
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 20px "sans-serif"';
        ctx.fillText(info.name.substring(0, 20), x + boxW - 15, y + 30);

        // السعر
        ctx.fillStyle = '#2ECC71';
        ctx.font = '16px "sans-serif"';
        ctx.fillText(`السعر: ${price.toLocaleString()} مورا`, x + boxW - 15, y + 55);

        // الكمية المتاحة
        ctx.textAlign = 'left';
        ctx.fillStyle = '#3498DB';
        ctx.font = 'bold 16px "sans-serif"';
        ctx.fillText(`المتاح: ${qty}`, x + 15, y + 55);

        col--;
        if (col < 0) { col = 1; row++; }
        if (row > 4) break; // أقصى حد 10 عناصر في الصورة عشان ما تنحاس
    }

    return canvas.toBuffer('image/png');
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
            description: `${price.toLocaleString()} مورا / واحدة`,
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

// 👑 الدالة السحرية لتحديث رسالة السوق الحالية بدل التكرار 👑
async function updateMarketMessage(channel, listings, dest, interaction = null) {
    try {
        const buffer = await buildMarketImage(listings, dest);
        const attachment = new AttachmentBuilder(buffer, { name: 'market.png' });
        const components = buildMarketComponents(listings);

        // 1. إذا كان التحديث ناتج عن تفاعل زر مباشر (Refresh)
        if (interaction && interaction.message) {
            await interaction.message.edit({ embeds: [], files: [attachment], components }).catch(() => {});
            return;
        }

        // 2. إذا كان التحديث ناتج عن شراء ذكاء اصطناعي أو نافذة شراء، نبحث عن الرسالة الأصلية في الشات
        const msgs = await channel.messages.fetch({ limit: 20 }).catch(() => null);
        if (!msgs) return;

        const marketMsg = msgs.find(m => 
            m.author.id === channel.client.user.id && 
            m.components.length > 0 && 
            m.components[0].components[0].customId === 'mkt_buy_select'
        );

        if (marketMsg) {
            // تحديث الرسالة القديمة بدون إرسال جديدة
            await marketMsg.edit({ embeds: [], files: [attachment], components }).catch(() => {});
        } else {
            // لو ما لقى الرسالة (مثلاً انحذفت)، يرسلها من جديد
            await channel.send({ content: '', embeds: [], files: [attachment], components }).catch(() => {});
        }
    } catch (e) {
        console.error('[Update Market Error]', e);
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
    const threadId = interaction.channel.id;
    const listings = await getListingsBySession(db, threadId);
    const session = await getSessionByThread(db, threadId);
    const dest = require('../config').caravanConfig.destinations.find(d =>
        d.id === (session?.destinationid || session?.destinationId)
    );

    await interaction.deferUpdate().catch(() => {});
    
    // 👑 التحديث مباشرة على رسالة التفاعل 👑
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
    buildMarketImage, // تم تغيير التصدير من الإمبيد إلى الصورة
    buildMarketComponents,
    updateMarketMessage,
    handleBuySelect,
    handleBuyModalSubmit,
    handleRefresh,
    refreshMarketMessage,
    handleOwnerPriceChange,
    handlePriceChangeSelect,
    handleNewPriceModalSubmit,
};
