const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const ms = require('ms');

const EMOJI_MORA = '<:mora:1435647151349698621>';
const AUCTION_COLOR = "#D9AD5F";
const AUCTION_IMAGE = "https://i.postimg.cc/3JxcxWJ0/fc6a5a55-09da-42af-9ae9-6313540a6415-(1).png"; 

module.exports = {
    name: 'auction',
    aliases: ['مزاد', 'createauction'],
    description: 'إنشاء مزاد جديد خطوة بخطوة.',
    category: 'Admin',
    
    async execute(message, args) {
        if (!message.member.permissions.has('ManageGuild')) return message.reply("🚫 ليس لديك صلاحية لإنشاء مزاد.");

        const msgFilter = m => m.author.id === message.author.id;
        const setupEmbed = new EmbedBuilder().setColor(AUCTION_COLOR).setTitle('🛠️ إعداد المزاد الجديد');

        await message.channel.send({ embeds: [setupEmbed.setDescription("1️⃣ **ما هو اسم السلعة؟**")] });
        const nameMsg = await message.channel.awaitMessages({ filter: msgFilter, max: 1, time: 60000, errors: ['time'] }).catch(() => null);
        if (!nameMsg) return message.reply("⏰ انتهى الوقت.");
        const itemName = nameMsg.first().content;

        await message.channel.send({ embeds: [setupEmbed.setDescription(`📦 السلعة: **${itemName}**\n\n2️⃣ **سعر فتح المزاد؟**`)] });
        const priceMsg = await message.channel.awaitMessages({ filter: msgFilter, max: 1, time: 60000, errors: ['time'] }).catch(() => null);
        if (!priceMsg) return message.reply("⏰ انتهى الوقت.");
        const startPrice = parseInt(priceMsg.first().content);
        if (isNaN(startPrice)) return message.reply("❌ يجب إدخال رقم صحيح.");

        await message.channel.send({ embeds: [setupEmbed.setDescription(`💰 البداية: **${startPrice}**\n\n3️⃣ **أقل مبلغ للزيادة؟**`)] });
        const incMsg = await message.channel.awaitMessages({ filter: msgFilter, max: 1, time: 60000, errors: ['time'] }).catch(() => null);
        if (!incMsg) return message.reply("⏰ انتهى الوقت.");
        const increment = parseInt(incMsg.first().content);
        if (isNaN(increment)) return message.reply("❌ يجب إدخال رقم صحيح.");

        await message.channel.send({ embeds: [setupEmbed.setDescription(`📈 الزيادة: **${increment}**\n\n4️⃣ **كم مدة المزاد؟** (مثلاً: 1h, 1d)`)] });
        const timeMsg = await message.channel.awaitMessages({ filter: msgFilter, max: 1, time: 60000, errors: ['time'] }).catch(() => null);
        if (!timeMsg) return message.reply("⏰ انتهى الوقت.");
        const durationStr = timeMsg.first().content;
        const duration = ms(durationStr);
        if (!duration) return message.reply("❌ صيغة الوقت غير صحيحة.");

        await message.channel.send({ embeds: [setupEmbed.setDescription(`⏳ المدة: **${durationStr}**\n\n5️⃣ **رابط صورة للسلعة** (أو اكتب "لا").`)] });
        const imgMsg = await message.channel.awaitMessages({ filter: msgFilter, max: 1, time: 60000, errors: ['time'] }).catch(() => null);
        if (!imgMsg) return message.reply("⏰ انتهى الوقت.");
        let itemImage = imgMsg.first().content;
        if (imgMsg.first().attachments.size > 0) itemImage = imgMsg.first().attachments.first().url;
        if (itemImage.toLowerCase() === 'لا' || itemImage.toLowerCase() === 'no') itemImage = null;

        await message.channel.send({ embeds: [setupEmbed.setDescription(`🖼️ الصورة: ${itemImage ? 'تم' : 'لا يوجد'}\n\n6️⃣ **منشن القناة أو أرسل الآيدي لنشر المزاد فيها**`)] });
        const chMsg = await message.channel.awaitMessages({ filter: msgFilter, max: 1, time: 60000, errors: ['time'] }).catch(() => null);
        if (!chMsg) return message.reply("⏰ انتهى الوقت.");
        
        let targetChannel = chMsg.first().mentions.channels.first() || message.guild.channels.cache.get(chMsg.first().content);
        if (!targetChannel) return message.reply("❌ لم يتم العثور على القناة. تأكد من المنشن أو الآيدي.");

        const endTime = Date.now() + duration;
        const confirmEmbed = new EmbedBuilder()
            .setTitle(`📢 معاينة المزاد`)
            .setDescription(`سيتم نشر المزاد بالمواصفات التالية في القناة ${targetChannel}، هل أنت متأكد؟`)
            .addFields(
                { name: '📦 السلعة', value: itemName, inline: true },
                { name: '💰 يبدأ بـ', value: `${startPrice}`, inline: true },
                { name: '⏳ المدة', value: durationStr, inline: true }
            )
            .setColor(AUCTION_COLOR);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('confirm_auction').setLabel('✅ نشر المزاد').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('cancel_auction').setLabel('❌ إلغاء').setStyle(ButtonStyle.Danger)
        );

        const confirmMsg = await message.channel.send({ embeds: [confirmEmbed], components: [row] });

        const btnFilter = (i) => i.user.id === message.author.id;
        const collector = confirmMsg.createMessageComponentCollector({ filter: btnFilter, time: 30000, max: 1 });

        collector.on('collect', async i => {
            if (i.customId === 'cancel_auction') {
                await i.update({ content: "تم الإلغاء.", embeds: [], components: [] });
            } else {
                await i.update({ content: `✅ تم نشر المزاد بنجاح في ${targetChannel}!`, embeds: [], components: [] });

                const auctionEmbed = new EmbedBuilder()
                    .setTitle('✥ دار المزاد')
                    .setDescription(`
✶ عـنـصر المزاد 🔨: **${itemName}**
✶ السعـر الحالي 💰: **${startPrice.toLocaleString()}** ${EMOJI_MORA}
✶ سعـر البدايـة 🏁: **${startPrice.toLocaleString()}** ${EMOJI_MORA}

✶ اعـلـى مزايـد 👑: لا يوجد
✶ عـدد المزايـدات 📈: \`0\`
✶ اقل مزايدة 🪙: \`${increment.toLocaleString()}\`
✶ ينـتـهـي ⏳: <t:${Math.floor(endTime / 1000)}:R>
                    `)
                    .setColor(AUCTION_COLOR);

                if (itemImage) {
                    auctionEmbed.setImage(itemImage); 
                } else {
                    auctionEmbed.setImage(AUCTION_IMAGE); 
                }

                const finalMsg = await targetChannel.send({ embeds: [auctionEmbed] });

                const bidRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`bid_open_${finalMsg.id}`) 
                        .setLabel(`مــزايــدة`)
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('💸')
                );

                await finalMsg.edit({ components: [bidRow] });

                const db = message.client.sql;
                
                try {
                    await db.query(`
                        INSERT INTO active_auctions ("messageID", "channelID", "hostID", "item_name", "current_bid", "start_price", "min_increment", "end_time", "image_url", "bid_count")
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0)
                    `, [finalMsg.id, targetChannel.id, message.author.id, itemName, startPrice, startPrice, increment, endTime, itemImage || null]);
                } catch(e) {
                    console.error("[Auction Create Error]:", e);
                }
            }
        });
    }
};
