const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, ModalBuilder, TextInputBuilder, TextInputStyle, Colors } = require('discord.js');

const EMOJI_MORA = '<:mora:1435647151349698621>'; 
const AUCTION_COLOR = "#D9AD5F";
const AUCTION_IMAGE = "https://i.postimg.cc/3JxcxWJ0/fc6a5a55-09da-42af-9ae9-6313540a6415-(1).png"; 

async function ensureAuctionTable(db) {
    await db.query(`
        CREATE TABLE IF NOT EXISTS active_auctions (
            messageid TEXT PRIMARY KEY,
            channelid TEXT,
            hostid TEXT,
            item_name TEXT,
            current_bid BIGINT,
            start_price BIGINT DEFAULT 0,
            highest_bidder TEXT,
            min_increment BIGINT,
            end_time BIGINT,
            image_url TEXT,
            bid_count BIGINT DEFAULT 0
        )
    `);
    try { await db.query("ALTER TABLE active_auctions ADD COLUMN start_price BIGINT DEFAULT 0"); } catch (e) {}
    try { await db.query("ALTER TABLE active_auctions ADD COLUMN bid_count BIGINT DEFAULT 0"); } catch (e) {}
}

async function startAuctionSystem(client) {
    const db = client.sql; 
    await ensureAuctionTable(db);

    setInterval(async () => {
        if (!db) return;
        try {
            const now = Date.now();
            const activeAuctionsRes = await db.query("SELECT * FROM active_auctions");
            const activeAuctions = activeAuctionsRes.rows;
            for (const auction of activeAuctions) {
                if (now >= parseInt(auction.end_time)) {
                    await endAuction(client, auction);
                }
            }
        } catch (err) {
            console.error("[Auction System Error]", err.message);
        }
    }, 10000);
}

async function endAuction(client, auctionData) {
    const db = client.sql; 
    
    try {
        await db.query("DELETE FROM active_auctions WHERE messageid = $1", [auctionData.messageid]);
    } catch (e) {
        console.error("Failed to delete auction:", e);
        return; 
    }

    const channel = client.channels.cache.get(auctionData.channelid);
    if (!channel) return;

    try {
        const msg = await channel.messages.fetch(auctionData.messageid).catch(() => null);
        if (msg) {
            await msg.edit({ components: [] }).catch(() => {});
        }

        if (auctionData.highest_bidder) {
            const winEmbed = new EmbedBuilder()
                .setTitle('✥ انـتهـى المزاد')
                .setDescription(`
✶ تـم بيـع: **${auctionData.item_name}**
✶ المشتـري: <@${auctionData.highest_bidder}>
✶ السعر النهائي: **${parseInt(auctionData.current_bid).toLocaleString()}** ${EMOJI_MORA}
                `)
                .setColor(AUCTION_COLOR)
                .setImage(AUCTION_IMAGE) 
                .setTimestamp();

            await channel.send({ content: `🔔 | <@${auctionData.highest_bidder}>`, embeds: [winEmbed] });

        } else {
            const failEmbed = new EmbedBuilder()
                .setTitle('✥ انـتهـى المزاد')
                .setDescription(`
✶ تـم بيـع: **${auctionData.item_name}**
✶ الحالة: **لم يتم البيع (لا يوجد مزايدات)**
                `)
                .setColor("Red")
                .setImage(AUCTION_IMAGE); 
            
            await channel.send({ embeds: [failEmbed] });
        }

    } catch (err) {
        console.error("Auction End Error:", err);
    }
}

async function handleAuctionSystem(interaction) {
    const { customId, user, guild, client } = interaction;
    const db = client.sql; 

    if (!db) {
        if (!interaction.replied && !interaction.deferred) {
            return interaction.reply({ content: "⚠️ قاعدة البيانات غير متصلة.", ephemeral: true });
        }
        return;
    }

    let messageID, action;
    if (customId.startsWith('bid_open_')) { messageID = customId.replace('bid_open_', ''); action = 'open_menu'; } 
    else if (customId.startsWith('bid_min_')) { messageID = customId.replace('bid_min_', ''); action = 'place_min_bid'; } 
    else if (customId.startsWith('bid_custom_btn_')) { messageID = customId.replace('bid_custom_btn_', ''); action = 'open_modal'; } 
    else if (customId.startsWith('bid_modal_submit_')) { messageID = customId.replace('bid_modal_submit_', ''); action = 'submit_custom_bid'; } 
    else { return; }

    const auctionRes = await db.query("SELECT * FROM active_auctions WHERE messageid = $1", [messageID]);
    const auction = auctionRes.rows[0];
    if (!auction) {
        const msg = "❌ انتهى هذا المزاد.";
        if (interaction.replied || interaction.deferred) return interaction.followUp({ content: msg, ephemeral: true });
        return interaction.reply({ content: msg, ephemeral: true });
    }

    const userDataRes = await db.query("SELECT mora, bank FROM levels WHERE userid = $1 AND guildid = $2", [user.id, guild.id]);
    const userData = userDataRes.rows[0] || { mora: 0, bank: 0 };

    if (action === 'open_menu') {
        const menuEmbed = new EmbedBuilder()
            .setTitle('✥ دار المزاد')
            .setDescription(`
**اهـلاً بـك في مـنـصـة المـزايـدة**

📦 **عـنصـر المزاد:** ${auction.item_name}
💰 **السعر الحالي:** ${parseInt(auction.current_bid).toLocaleString()} ${EMOJI_MORA}
📈 **اقـل مبلـغ للزيادة:** ${parseInt(auction.min_increment).toLocaleString()} ${EMOJI_MORA}

💸 **رصـيدك الكـاش:** ${parseInt(userData.mora || 0).toLocaleString()} ${EMOJI_MORA}
🏦 **رصيـد البنـك:** ${parseInt(userData.bank || 0).toLocaleString()} ${EMOJI_MORA}
            `)
            .setColor(AUCTION_COLOR)
            .setThumbnail(guild.iconURL() || user.displayAvatarURL());

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`bid_min_${messageID}`).setLabel(`مـزايـدة (+${parseInt(auction.min_increment).toLocaleString()})`).setStyle(ButtonStyle.Success).setEmoji('💸'),
            new ButtonBuilder().setCustomId(`bid_custom_btn_${messageID}`).setLabel('تـخصـيـص').setStyle(ButtonStyle.Primary).setEmoji('✍️')
        );
        return interaction.reply({ embeds: [menuEmbed], components: [row], ephemeral: true });
    }

    if (action === 'open_modal') {
        const modal = new ModalBuilder().setCustomId(`bid_modal_submit_${messageID}`).setTitle('تخصيص مبلغ الزيادة');
        const input = new TextInputBuilder().setCustomId('bid_amount_input').setLabel(`المبلغ الإضافي`).setPlaceholder(`أقل شي: ${auction.min_increment}`).setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
    }

    let incrementAmount = 0;
    if (action === 'place_min_bid') {
        await interaction.deferUpdate().catch(() => {});
        incrementAmount = parseInt(auction.min_increment);
    } else if (action === 'submit_custom_bid') {
        await interaction.deferReply({ ephemeral: true }).catch(() => {});
        const val = parseInt(interaction.fields.getTextInputValue('bid_amount_input'));
        if (isNaN(val) || val < parseInt(auction.min_increment)) return interaction.editReply({ content: `❌ أقل مبلغ: ${auction.min_increment}` });
        incrementAmount = val;
    }

    try {
        const currentAuctionRes = await db.query("SELECT * FROM active_auctions WHERE messageid = $1", [messageID]);
        const currentAuction = currentAuctionRes.rows[0];
        if (!currentAuction) throw new Error("AUCTION_ENDED");

        const newTotalBid = parseInt(currentAuction.current_bid) + incrementAmount;
        let cost = newTotalBid;
        if (currentAuction.highest_bidder === user.id) cost = incrementAmount;

        const freshMoraRes = await db.query("SELECT mora FROM levels WHERE userid = $1 AND guildid = $2", [user.id, guild.id]);
        const freshMora = freshMoraRes.rows[0]?.mora || 0;
        
        if (freshMora < cost) {
            const msg = `❌ الرصيد غير كافي. المطلوب: **${cost.toLocaleString()}**`;
            
            if (interaction.deferred || interaction.replied) {
                if (action === 'submit_custom_bid') {
                    return interaction.editReply(msg);
                } else {
                    return interaction.followUp({ content: msg, ephemeral: true });
            }
            } else {
                return interaction.reply({ content: msg, ephemeral: true });
            }
        }

        try {
            await db.query("BEGIN");

            // ✅ استرداد رهان المزايد السابق + RETURNING لتحديث كاشه
            if (currentAuction.highest_bidder && currentAuction.highest_bidder !== user.id) {
                const prevBidderRes = await db.query("UPDATE levels SET mora = mora + $1 WHERE userid = $2 AND guildid = $3 RETURNING mora", [currentAuction.current_bid, currentAuction.highest_bidder, guild.id]);
                if (interaction?.client?.updateLevelField && prevBidderRes.rows[0]) {
                    interaction.client.updateLevelField(currentAuction.highest_bidder, guild.id, { mora: Number(prevBidderRes.rows[0].mora) });
                }
            }
            // ✅ GREATEST لمنع الرصيد السالب + RETURNING لتحديث كاش المزايد الجديد
            const bidDeductRes = await db.query("UPDATE levels SET mora = GREATEST(0, mora - $1) WHERE userid = $2 AND guildid = $3 RETURNING mora", [cost, user.id, guild.id]);
            if (interaction?.client?.updateLevelField && bidDeductRes.rows[0]) {
                interaction.client.updateLevelField(user.id, guild.id, { mora: Number(bidDeductRes.rows[0].mora) });
            }

            let newEndTime = parseInt(currentAuction.end_time);
            if (newEndTime - Date.now() < 60000) newEndTime += 60000;
            const newBidCount = (parseInt(currentAuction.bid_count) || 0) + 1;

            await db.query("UPDATE active_auctions SET current_bid = $1, highest_bidder = $2, end_time = $3, bid_count = $4 WHERE messageid = $5", [newTotalBid, user.id, newEndTime, newBidCount, messageID]);
            
            await db.query("COMMIT");

            const channel = guild.channels.cache.get(currentAuction.channelid);
            if (channel) {
                const msg = await channel.messages.fetch(messageID).catch(() => null);
                if (msg) {
                    const newEmbed = new EmbedBuilder()
                        .setTitle('✥ دار المزاد')
                        .setDescription(`
✶ عـنـصر المزاد🔨: **${currentAuction.item_name}**
✶ السعـر الحالي💰: **${newTotalBid.toLocaleString()}** ${EMOJI_MORA}
✶ سعـر البدايـة🏁: **${(parseInt(currentAuction.start_price) || 0).toLocaleString()}** ${EMOJI_MORA}

✶ اعـلـى مزايـد👑: <@${user.id}>
✶ عـدد المزايـدات📈: \`${newBidCount}\`
✶ اقل مزايدة🪙: \`${parseInt(currentAuction.min_increment).toLocaleString()}\`
✶ ينـتـهـي⏳: <t:${Math.floor(newEndTime / 1000)}:R>
                        `)
                        .setColor("Random");

                    if (currentAuction.image_url) {
                        newEmbed.setImage(currentAuction.image_url);
                    } else {
                        newEmbed.setImage(AUCTION_IMAGE);
                    }

                    await msg.edit({ embeds: [newEmbed] });
                    
                    channel.send({ content: `🔥 **${newTotalBid.toLocaleString()}** ${EMOJI_MORA} بواسطة <@${user.id}>` })
                        .then(m => setTimeout(() => m.delete().catch(()=>{}), 5000));
                }
            }

            const successMsg = `✅ **تم!** أنت الأعلى بـ **${newTotalBid.toLocaleString()}**`;
            
            if (action === 'submit_custom_bid') {
                await interaction.editReply({ content: successMsg, components: [] });
            } else {
                await interaction.followUp({ content: successMsg, ephemeral: true });
            }

        } catch (txErr) {
            await db.query("ROLLBACK");
            throw txErr;
        }

    } catch (err) {
        console.error("Bid Error:", err);
        const msg = "❌ حدث خطأ أثناء المزايدة.";
        
        if (interaction.deferred || interaction.replied) {
            if (action === 'submit_custom_bid') await interaction.editReply(msg);
            else await interaction.followUp({ content: msg, ephemeral: true });
        } else {
            await interaction.reply({ content: msg, ephemeral: true });
        }
    }
}

module.exports = { startAuctionSystem, handleAuctionSystem };
