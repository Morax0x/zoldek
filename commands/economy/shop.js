const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, MessageFlags } = require("discord.js");
const shopItems = require('../../json/shop-items.json');

const OWNER_ID = '1145327691772481577';
const activeShopCmd = new Set();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('متجر')
        .setDescription('فتح المتجر للشراء، أو تثبيته للمالك'),

    name: 'shop',
    aliases: ['متجر', 'setup-shop', 'المتجر'],
    category: "Economy",

    async execute(interactionOrMessage) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, guild, client, user, channel;

        if (isSlash) {
            interaction = interactionOrMessage;
            guild = interaction.guild;
            client = interaction.client;
            user = interaction.user;
            channel = interaction.channel;
        } else {
            message = interactionOrMessage;
            guild = message.guild;
            client = message.client;
            user = message.author;
            channel = message.channel;
        }

        if (activeShopCmd.has(user.id)) return;
        activeShopCmd.add(user.id);

        try {
            const isOwner = user.id === OWNER_ID;

            if (isSlash) {
                if (isOwner) {
                    await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
                } else {
                    await interaction.deferReply().catch(() => {});
                }
            }

            let generateGlobalShopBoard;
            try { 
                generateGlobalShopBoard = require('../../generators/shop-generator.js').generateGlobalShopBoard; 
            } catch(e) {}

            if (!generateGlobalShopBoard) {
                const err = '❌ نظام الرسم غير متوفر حالياً.';
                return isSlash ? interaction.editReply(err).catch(()=>{}) : message.reply(err).catch(()=>{});
            }

            const db = client.sql;
            
            const imageBuffer = await generateGlobalShopBoard(shopItems);

            const options = shopItems.map(item => ({
                label: item.name,
                description: `السعر: ${item.price} | ${item.description.substring(0, 50)}`,
                value: `buy_item_${item.id}`,
                emoji: item.emoji || '📦'
            }));

            const row = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('shop_buy_select')
                    .setPlaceholder('🛒 اختر العنصر الذي تود شراءه من هنا...')
                    .addOptions(options)
            );

            if (isOwner) {
                let newShopMsg = await channel.send({
                    files: [{ attachment: imageBuffer, name: 'empire_shop_board.png' }],
                    components: [row]
                }).catch(()=>{});

                if (newShopMsg) {
                    try {
                        await db.query(`INSERT INTO settings ("guild") VALUES ($1) ON CONFLICT ("guild") DO NOTHING`, [guild.id]).catch(()=>{});
                        await db.query(`UPDATE settings SET "shopChannelID" = $1 WHERE "guild" = $2`, [channel.id, guild.id]).catch(() => db.query(`UPDATE settings SET shopchannelid = $1 WHERE guild = $2`, [channel.id, guild.id]).catch(()=>{}));
                        
                        if (client.lastOwnerShopMessage && client.lastOwnerShopMessage.id !== newShopMsg.id) {
                            try {
                                const oldMsg = await channel.messages.fetch(client.lastOwnerShopMessage.id);
                                if (oldMsg) await oldMsg.edit({ components: [] });
                            } catch(e){}
                        }
                        client.lastOwnerShopMessage = newShopMsg;

                        const doneMsg = '✅ تم نشر المتجر وتثبيته كمتجر أساسي بنجاح، وتم تعطيل المتجر القديم.';
                        if (isSlash) {
                            await interaction.editReply({ content: doneMsg }).catch(()=>{});
                        } else {
                            let r = await message.reply({ content: doneMsg }).catch(()=>{});
                            setTimeout(() => r?.delete().catch(()=>{}), 5000);
                        }
                    } catch (err) {}
                }
            } else {
                let sentMessage;
                const payload = {
                    files: [{ attachment: imageBuffer, name: 'empire_shop_temp.png' }],
                    components: [row]
                };

                if (isSlash) {
                    sentMessage = await interaction.editReply(payload).catch(()=>{});
                } else {
                    sentMessage = await message.reply(payload).catch(()=>{});
                }

                setTimeout(() => {
                    if (sentMessage && sentMessage.editable) {
                        sentMessage.edit({ components: [] }).catch(() => {});
                    }
                }, 60000);
            }
        } finally {
            activeShopCmd.delete(user.id);
        }
    }
};
