const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, SlashCommandBuilder, AttachmentBuilder, Colors, EmbedBuilder, MessageFlags } = require("discord.js");
const fs = require('fs');
const path = require('path');

let marketConfig = [];
try {
    const marketConfigPath = path.join(process.cwd(), 'json', 'market-items.json');
    if (fs.existsSync(marketConfigPath)) marketConfig = require(marketConfigPath);
} catch (e) {
    console.error("⚠️ [Market] تحذير: لم يتم العثور على ملف market-items.json");
}

let marketGen;
try {
    const generatorPath = path.join(process.cwd(), 'generators', 'market-generator.js');
    marketGen = require(generatorPath);
} catch (e) {
    console.error("⚠️ [Market] تحذير: فشل في تحميل market-generator.js", e.message);
}

const UPDATE_INTERVAL_MS = 1 * 60 * 60 * 1000;
const ITEMS_PER_PAGE = 9;

const EMOJI_RIGHT = '1439164491072929915'; 
const EMOJI_LEFT = '1439164494759723029';  
const EMOJI_BACK = '↩️'; 

function getUpdateTimeRemaining() {
    const now = Date.now();
    const timeSinceStart = now % UPDATE_INTERVAL_MS;
    const remainingTime = UPDATE_INTERVAL_MS - timeSinceStart;
    const totalSeconds = Math.floor(remainingTime / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function cleanNameForMenu(name) {
    if (!name) return '';
    return name.replace(/<a?:.+?:\d+>/g, '').replace(/[\u{1F600}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F300}-\u{1F5FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FADF}\u{1F004}-\u{1F0CF}\u{2B00}-\u{2BFF}₿]/gu, '').trim();
}

async function buildVisualGridView(allItems, pageIndex, timeRemaining, userAvatarUrl) {
    if (!marketGen || typeof marketGen.drawMarketGrid !== 'function') {
        throw new Error("مكتبة الرسم Canvas غير محملة بشكل صحيح!");
    }

    const startIndex = pageIndex * ITEMS_PER_PAGE;
    const itemsOnPage = allItems.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    const totalPages = Math.ceil(allItems.length / ITEMS_PER_PAGE);

    const imageBuffer = await marketGen.drawMarketGrid(allItems, timeRemaining, pageIndex, totalPages, userAvatarUrl);
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'market_board.png' });

    const selectOptions = itemsOnPage.map(item => ({
        label: cleanNameForMenu(item.name),
        description: `السعر: ${Number(item.currentPrice || item.currentprice || item.price).toLocaleString()}`,
        value: item.id
    }));

    const selectMenuRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('market_select_item')
            .setPlaceholder('🔻 اختر الأصل لعرض التفاصيل والتداول...')
            .addOptions(selectOptions)
    );

    const actionRows = [selectMenuRow];

    if (totalPages > 1) {
        const navRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('market_next').setEmoji(EMOJI_LEFT).setStyle(ButtonStyle.Secondary).setDisabled(pageIndex === totalPages - 1),
            new ButtonBuilder().setCustomId('market_prev').setEmoji(EMOJI_RIGHT).setStyle(ButtonStyle.Secondary).setDisabled(pageIndex === 0)
        );
        actionRows.push(navRow);
    }

    return { attachment, components: actionRows };
}

async function buildDetailViewImage(item, userId, guildId, sql) {
    let userPortfolio;
    try {
        const userPortfolioRes = await sql.query(`SELECT "quantity" FROM user_portfolio WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [userId, guildId, item.id]);
        userPortfolio = userPortfolioRes.rows ? userPortfolioRes.rows[0] : (Array.isArray(userPortfolioRes) ? userPortfolioRes[0] : null);
    } catch (e) {
        try {
            const userPortfolioRes = sql.prepare("SELECT quantity FROM user_portfolio WHERE userID = ? AND guildID = ? AND itemID = ?").get(userId, guildId, item.id);
            userPortfolio = userPortfolioRes;
        } catch(err) {}
    }
    const userQuantity = userPortfolio ? Number(userPortfolio.quantity || userPortfolio.Quantity || 0) : 0;
    const currentPrice = Number(item.currentPrice || item.currentprice || item.price || 0);
    const lastPrice = Number(item.lastPrice || item.lastprice || 0);
    
    // الحسبة الحقيقية للتغير بالنسبة المئوية
    const changePercent = lastPrice > 0 ? ((currentPrice - lastPrice) / lastPrice) * 100 : 0;

    const imageBuffer = await marketGen.drawMarketDetail(item, userQuantity, currentPrice, changePercent);
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'market_detail.png' });

    const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`market_next_detail_${item.id}`).setEmoji(EMOJI_LEFT).setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`market_prev_detail_${item.id}`).setEmoji(EMOJI_RIGHT).setStyle(ButtonStyle.Secondary),
        // توجيه صحيح للهاندلر المركزي ليتولى هو العمل!
        new ButtonBuilder().setCustomId(`buy_modal_${item.id}`).setLabel('شراء 🛒').setStyle(ButtonStyle.Success)
    );

    if (userQuantity > 0) {
        actionRow.addComponents(
            new ButtonBuilder().setCustomId(`sell_modal_${item.id}`).setLabel(`بيع 💰`).setStyle(ButtonStyle.Danger)
        );
    }

    actionRow.addComponents(
        new ButtonBuilder().setCustomId('market_back_to_grid').setEmoji(EMOJI_BACK).setStyle(ButtonStyle.Primary)
    );

    return { attachment, components: [actionRow] };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('market')
        .setDescription('يعرض لوحة أسعار الأسهم والعقارات الحالية بشكل مرئي.'),

    name: 'market',
    aliases: ['سوق', 'استثمار', 'اسعار', 'بورصة'],
    category: "Economy",
    description: 'يعرض لوحة أسعار الأسهم والعقارات الحالية بشكل مرئي.',

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, client, sql, user, guild;

        if (isSlash) {
            interaction = interactionOrMessage;
            client = interaction.client;
            sql = client.sql;
            user = interaction.user;
            guild = interaction.guild;
            try {
                if (!interaction.deferred && !interaction.replied) await interaction.deferReply();
            } catch (e) {}
        } else {
            message = interactionOrMessage;
            client = message.client;
            sql = client.sql;
            user = message.author;
            guild = message.guild;
        }

        const reply = async (payload) => {
            if (isSlash) return await interaction.editReply(payload).catch(()=>{});
            else return await message.channel.send(payload).catch(()=>{});
        };

        try {
            let dbItems = [];
            try {
                const dbItemsRes = await sql.query("SELECT * FROM market_items");
                dbItems = dbItemsRes.rows ? dbItemsRes.rows : (Array.isArray(dbItemsRes) ? dbItemsRes : []);
            } catch (dbErr) {
                try {
                    dbItems = sql.prepare("SELECT * FROM market_items").all();
                } catch(sqliteErr) {
                    return reply({ content: "❌ عذراً، لا يمكن الاتصال بقاعدة بيانات السوق حالياً." });
                }
            }

            const validItemIds = new Set(marketConfig.map(i => i.id));
            let allItems = dbItems.filter(item => validItemIds.has(item.id));
            
            if (allItems.length === 0) {
                allItems = marketConfig;
            } else {
                allItems = allItems.map(dbItem => {
                    const configData = marketConfig.find(c => c.id === dbItem.id);
                    return { ...dbItem, ...configData }; 
                });
            }

            if (allItems.length === 0) {
                return reply({ content: "السوق فارغ تماماً حالياً." });
            }

            let currentPage = 0;
            let currentView = 'grid'; 
            let timeRemaining = getUpdateTimeRemaining();
            
            const avatarUrl = user.displayAvatarURL({ extension: 'png', forceStatic: true, size: 256 });

            const { attachment, components } = await buildVisualGridView(allItems, currentPage, timeRemaining, avatarUrl);
            
            let msg;
            const initPayload = { files: [attachment], attachments: [], components: components, content: '' };
            
            if (isSlash) {
                msg = await interaction.editReply(initPayload);
            } else {
                msg = await message.channel.send(initPayload);
            }

            const filter = i => i.user.id === user.id;
            const collector = msg.createMessageComponentCollector({ time: 300000, filter });

            collector.on('collect', async i => {
                try {
                    if (i.isButton()) {
                        if (i.customId === 'market_prev' || i.customId === 'market_next') {
                            try { await i.deferUpdate(); } catch (e) {}

                            if (currentView === 'grid') {
                                if (i.customId === 'market_next') currentPage = Math.min(Math.ceil(allItems.length / ITEMS_PER_PAGE) - 1, currentPage + 1);
                                else if (i.customId === 'market_prev') currentPage = Math.max(0, currentPage - 1);

                                timeRemaining = getUpdateTimeRemaining();
                                const newPage = await buildVisualGridView(allItems, currentPage, timeRemaining, avatarUrl);
                                await i.editReply({ files: [newPage.attachment], attachments: [], components: newPage.components, content: '' });
                            }
                        } else if (i.customId.startsWith('market_prev_detail_') || i.customId.startsWith('market_next_detail_')) {
                            try { await i.deferUpdate(); } catch (e) {}
                            
                            const currentItemID = i.customId.split('_')[3];
                            let currentItemIndex = allItems.findIndex(it => it.id === currentItemID);

                            if (i.customId.startsWith('market_next_detail_')) {
                                currentItemIndex = (currentItemIndex + 1) % allItems.length;
                            } else if (i.customId.startsWith('market_prev_detail_')) {
                                currentItemIndex = (currentItemIndex - 1 + allItems.length) % allItems.length;
                            }

                            const item = allItems[currentItemIndex];
                            const { attachment: detailImage, components: detailComponents } = await buildDetailViewImage(item, i.user.id, i.guild.id, sql); 
                            await i.editReply({ files: [detailImage], attachments: [], components: detailComponents, content: '' });

                        } else if (i.customId === 'market_back_to_grid') {
                            try { await i.deferUpdate(); } catch (e) {}
                            currentView = 'grid';
                            timeRemaining = getUpdateTimeRemaining();
                            const { attachment: gridAttachment, components: gridComponents } = await buildVisualGridView(allItems, currentPage, timeRemaining, avatarUrl);
                            await i.editReply({ files: [gridAttachment], attachments: [], components: gridComponents, content: '' });

                        } 
                        // 🔥 التصحيح: الأزرار تفتح نافذة الإدخال فوراً دون تعارض مع ملف interaction-handler 🔥
                        else if (i.customId.startsWith('buy_modal_') || i.customId.startsWith('sell_modal_')) {
                            const isBuy = i.customId.startsWith('buy_modal_');
                            const assetId = i.customId.replace(isBuy ? 'buy_modal_' : 'sell_modal_', '');
                            const item = allItems.find(it => it.id === assetId);

                            if (!item) return;

                            const modal = new ModalBuilder()
                                .setCustomId(i.customId) // تمرير الآيدي مباشرة للهاندلر
                                .setTitle(isBuy ? "شراء أصل" : "بيع أصل");

                            const quantityInput = new TextInputBuilder()
                                .setCustomId('quantity_input')
                                .setLabel(isBuy ? "الكمية التي تريد شراءها" : "الكمية التي تريد بيعها")
                                .setStyle(TextInputStyle.Short)
                                .setPlaceholder(`السعر الحالي: ${Number(item.currentPrice || item.currentprice || item.price).toLocaleString()}`)
                                .setRequired(true);

                            modal.addComponents(new ActionRowBuilder().addComponents(quantityInput));
                            await i.showModal(modal);
                        }
                    }

                    else if (i.isStringSelectMenu() && i.customId === 'market_select_item') {
                        try { await i.deferUpdate(); } catch (e) {}
                        try {
                            currentView = 'detail';
                            const selectedID = i.values[0];
                            const item = allItems.find(it => it.id === selectedID);
                            if (!item) return;
                            
                            const { attachment: detailImage, components: detailComponents } = await buildDetailViewImage(item, i.user.id, i.guild.id, sql); 
                            await i.editReply({ files: [detailImage], attachments: [], components: detailComponents, embeds: [], content: '' });
                        } catch (err) {
                            console.error("❌ خطأ أثناء توليد بطاقة تفاصيل السوق:", err);
                        }
                    }
                } catch (error) {
                    console.error("❌ خطأ عام في كوليكتور السوق:", error);
                }
            });

            collector.on('end', () => {
                if(msg && msg.editable) msg.edit({ components: [] }).catch(() => null);
            });

        } catch (globalError) {
            return reply({ content: `❌ **حدث خطأ غير متوقع:**\n\`${globalError.message}\``, flags: [MessageFlags.Ephemeral] });
        }
    }
};
