const { Events, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionsBitField, MessageFlags, Colors } = require("discord.js");

const { handleStreakPanel } = require('./handlers/streak-panel-handler.js');
const { handleShopInteractions, handleShopModal, handleShopSelectMenu, handleSkillSelectMenu } = require('./handlers/shop-handler.js');
const { handlePvpInteraction, handlePvpBetModal } = require('./handlers/pvp/pvp-handler.js');
const { getUserWeight, endGiveaway, handleGiveawayInteraction } = require('./handlers/giveaway-handler.js');
const { handleReroll } = require('./handlers/reroll-handler.js');
const { handleCustomRoleInteraction } = require('./handlers/custom-role-handler.js');
const { handleReactionRole } = require('./handlers/reaction-role-handler.js');
const { handleBossInteraction } = require('./handlers/boss-handler.js');
const { handleLandInteractions } = require('./handlers/farm-land.js');
const { handleAuctionSystem } = require('./handlers/auction-handler.js');
const { handleGuildBoard, handleQuestPanel } = require('./handlers/guild-board-handler.js');
const { generateNotificationControlPanel } = require('./generators/notification-generator.js');
const {
    handlePriceModalSubmit,
    handleBuyModalSubmit,
    handleNewPriceModalSubmit,
    handleBuySelect,
    handleBuyNow,
    handleBuyQuantity,
    handleRefresh,
    handlePriceChangeSelect,
} = require('./handlers/caravan/market/index.js');

const { handleNewSuggestion, handleSuggestionButtons, handleSuggestionModals } = require('./handlers/suggestion-handler.js');

const marketConfig = require('./json/market-items.json');
const EMOJI_MORA = '<:mora:1435647151349698621>';

let handleFarmInteractions;
let handleFarmShopModal; 
let farmShop; 

try {
    const farmModule = require('./handlers/farm-handler.js');
    handleFarmInteractions = farmModule.handleFarmInteractions || farmModule._handleFarmTransaction;
} catch (e) {}

try {
    farmShop = require('./handlers/shop_system/farm-shop.js');
    handleFarmShopModal = farmShop.handleFarmShopModal;
} catch (e) {
    try {
        farmShop = require('./handlers/farm-shop.js');
        handleFarmShopModal = farmShop.handleFarmShopModal;
    } catch (e2) {}
}

const ms = require('ms');

const processingInteractions = new Set();

module.exports = (client, db, antiRolesCache) => {
    client.on(Events.InteractionCreate, async i => {
        if (processingInteractions.has(i.user.id)) {
            if (!i.isModalSubmit()) {
                return i.reply({ content: '⏳ | يرجى الانتظار قليلاً بين المحاولات.', flags: [MessageFlags.Ephemeral] }).catch(() => {});
            }
        }

        if (i.isButton() || i.isStringSelectMenu() || i.isModalSubmit() || i.isUserSelectMenu()) {
            processingInteractions.add(i.user.id);
            setTimeout(() => processingInteractions.delete(i.user.id), 3000);
        }

        try {
            if (i.isChatInputCommand()) {
                const command = i.client.commands.get(i.commandName);
                if (!command) return;

                try {
                    let isBlacklistedRes;
                    try { isBlacklistedRes = await db.query(`SELECT 1 FROM blacklistTable WHERE "id" = $1`, [i.user.id]); }
                    catch(e) { isBlacklistedRes = await db.query(`SELECT 1 FROM blacklistTable WHERE id = $1`, [i.user.id]).catch(()=>({rows:[]})); }
                    if (isBlacklistedRes && isBlacklistedRes.rows.length > 0) return i.reply({ content: "🚫 **أنت في القائمة السوداء.**", flags: [MessageFlags.Ephemeral] });
                } catch (e) {}

                let isAllowed = false;
                if (i.member.permissions.has(PermissionsBitField.Flags.Administrator)) isAllowed = true;
                else {
                    let settings = null;
                    try { 
                        let settingsRes = await db.query(`SELECT "casinoChannelID", "casinoChannelID2" FROM settings WHERE "guild" = $1`, [i.guild.id]).catch(()=>({rows:[]})); 
                        settings = settingsRes.rows[0];
                    } catch(e){}
                    
                    if (settings && ((settings.casinoChannelID === i.channel.id || settings.casinochannelid === i.channel.id) || (settings.casinoChannelID2 === i.channel.id || settings.casinochannelid2 === i.channel.id)) && command.category === 'Economy') {
                        isAllowed = true;
                    } else {
                        try {
                            let channelPermRes;
                            try { channelPermRes = await db.query(`SELECT 1 FROM command_permissions WHERE "guildID" = $1 AND "commandName" = $2 AND "channelID" = $3`, [i.guild.id, command.name, i.channel.id]); }
                            catch(e) { channelPermRes = await db.query(`SELECT 1 FROM command_permissions WHERE guildid = $1 AND commandname = $2 AND channelid = $3`, [i.guild.id, command.name, i.channel.id]).catch(()=>({rows:[]})); }
                            
                            let categoryPermRes = {rows: []};
                            if (i.channel.parentId) {
                                try { categoryPermRes = await db.query(`SELECT 1 FROM command_permissions WHERE "guildID" = $1 AND "commandName" = $2 AND "channelID" = $3`, [i.guild.id, command.name, i.channel.parentId]); }
                                catch(e) { categoryPermRes = await db.query(`SELECT 1 FROM command_permissions WHERE guildid = $1 AND commandname = $2 AND channelid = $3`, [i.guild.id, command.name, i.channel.parentId]).catch(()=>({rows:[]})); }
                            }
                            
                            if ((channelPermRes && channelPermRes.rows.length > 0) || (categoryPermRes && categoryPermRes.rows.length > 0)) isAllowed = true;
                            else {
                                let hasRestrictionsRes;
                                try { hasRestrictionsRes = await db.query(`SELECT 1 FROM command_permissions WHERE "guildID" = $1 AND "commandName" = $2`, [i.guild.id, command.name]); }
                                catch(e) { hasRestrictionsRes = await db.query(`SELECT 1 FROM command_permissions WHERE guildid = $1 AND commandname = $2`, [i.guild.id, command.name]).catch(()=>({rows:[]})); }
                                
                                if (!hasRestrictionsRes || hasRestrictionsRes.rows.length === 0) isAllowed = true;
                            }
                        } catch (e) { isAllowed = true; }
                    }
                }

                if (!isAllowed) return i.reply({ content: "❌ **لا يمكنك استخدام هذا الأمر في هذه القناة.**", flags: [MessageFlags.Ephemeral] });

                try { await command.execute(i); } catch (error) {
                    if (!i.replied && !i.deferred) await i.reply({ content: 'حدث خطأ داخلي!', flags: [MessageFlags.Ephemeral] });
                }
                return;
            }

            if (i.isAutocomplete()) {
                const command = i.client.commands.get(i.commandName);
                if (command?.autocomplete) await command.autocomplete(i);
                return;
            }
            
            if (i.isContextMenuCommand()) {
                const command = i.client.commands.get(i.commandName);
                if (command) await command.execute(i);
                return;
            }

            if (i.isButton() || i.isStringSelectMenu() || i.isUserSelectMenu()) {
                const id = i.customId;

                if (id.startsWith('trade_target_')) return;

                if (id.startsWith('sugg_')) {
                    if (handleSuggestionButtons) await handleSuggestionButtons(i, client, db);
                    return;
                }

                if (id.startsWith('shop_cat_') || id.startsWith('farm_') || id.startsWith('buy_btn_farm|') || id.startsWith('sell_btn_farm|') || id.startsWith('nav_') || id.includes('feed_animal') || id.startsWith('forge_')) {
                    return;
                }

                if (id.startsWith('notify_afk_')) {
                    const targetID = id.split('_')[2];
                    
                    let afkDataRes;
                    try { afkDataRes = await db.query(`SELECT * FROM afk WHERE "userID" = $1 AND "guildID" = $2`, [targetID, i.guild.id]); }
                    catch(e) { afkDataRes = await db.query(`SELECT * FROM afk WHERE userid = $1 AND guildid = $2`, [targetID, i.guild.id]).catch(()=>({rows:[]})); }
                    const afkData = afkDataRes?.rows?.[0];

                    if (!afkData) return i.reply({ content: "❌ هذا الشخص عاد بالفعل!", flags: [MessageFlags.Ephemeral] });

                    let subscribers = [];
                    try { subscribers = JSON.parse(afkData.subscribers || '[]'); } catch(e){}
                    if (subscribers.includes(i.user.id)) return i.reply({ content: "✅ أنت مسجل بالفعل في قائمة التنبيه.", flags: [MessageFlags.Ephemeral] });

                    subscribers.push(i.user.id);
                    try { 
                        await db.query(`UPDATE afk SET "subscribers" = $1 WHERE "userID" = $2 AND "guildID" = $3`, [JSON.stringify(subscribers), targetID, i.guild.id]); 
                    } catch(e){
                        await db.query(`UPDATE afk SET subscribers = $1 WHERE userid = $2 AND guildid = $3`, [JSON.stringify(subscribers), targetID, i.guild.id]).catch(()=>{});
                    }
                    await i.reply({ content: "🔔 **تم!** سأقوم بمنشنتك فور عودة العضو.", flags: [MessageFlags.Ephemeral] });
                    return;

                } else if (id.startsWith('leave_msg_afk_')) {
                    const targetID = id.split('_')[3];
                    
                    let afkDataRes;
                    try { afkDataRes = await db.query(`SELECT * FROM afk WHERE "userID" = $1 AND "guildID" = $2`, [targetID, i.guild.id]); }
                    catch(e) { afkDataRes = await db.query(`SELECT * FROM afk WHERE userid = $1 AND guildid = $2`, [targetID, i.guild.id]).catch(()=>({rows:[]})); }
                    const afkData = afkDataRes?.rows?.[0];
                    
                    if (!afkData) return i.reply({ content: "❌ هذا الشخص عاد للتو!", flags: [MessageFlags.Ephemeral] });

                    const modal = new ModalBuilder()
                        .setCustomId(`modal_afk_msg_${targetID}`)
                        .setTitle('ترك رسالة للمستخدم');

                    const messageInput = new TextInputBuilder()
                        .setCustomId('msg_content')
                        .setLabel("ما هي رسالتك؟")
                        .setStyle(TextInputStyle.Paragraph)
                        .setMaxLength(200)
                        .setRequired(true);

                    modal.addComponents(new ActionRowBuilder().addComponents(messageInput));
                    await i.showModal(modal);
                    return;

                } else if (id === 'show_afk_msgs') {
                    const msgs = global.afkMessagesCache ? global.afkMessagesCache.get(i.user.id) : null;

                    if (!msgs || msgs.length === 0) {
                        return i.reply({ content: "📭 لا توجد رسائل محفوظة (أو انتهت صلاحية العرض).", flags: [MessageFlags.Ephemeral] });
                    }

                    const embed = new EmbedBuilder()
                        .setColor(Colors.Blue)
                        .setTitle("📬 البريد الوارد أثناء غيابك");

                    let desc = "";
                    msgs.forEach((msg) => {
                        desc += `**✶ من:** <@${msg.authorID}>\n` +
                                `**✶ الوقت:** <t:${msg.timestamp}:R>\n` +
                                `**✶ الرسالة:**\n${msg.content}\n\n`; 
                    });

                    embed.setDescription(desc.substring(0, 4000));
                    await i.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
                    return;
                }

                if (id.startsWith('guild_board_')) {
                    await handleGuildBoard(i, client, db);
                    return;
                }

                if (id.startsWith('bid_')) { 
                    await handleAuctionSystem(i); 
                } 
                else if (id === 'g_enter' || id === 'g_enter_drop' || id.startsWith('giveaway_')) {
                    if (handleGiveawayInteraction) await handleGiveawayInteraction(client, i);
                } else if (id.startsWith('customrole_')) {
                    await handleCustomRoleInteraction(i, client, db);
                } else if (id.startsWith('boss_')) {
                    await handleBossInteraction(i, client, db);
                } else if (id.startsWith('land_')) {
                    await handleLandInteractions(i, client, db);
                } else if (id.startsWith('streak_panel_')) {
                    await handleStreakPanel(i, client, db);
                } else if (id.startsWith('rr_')) {
                    await handleReactionRole(i, client, db, antiRolesCache);
                } else if (id === 'g_reroll_select') {
                    await handleReroll(i, client, db);
                } 
                else if (id.startsWith('panel_') || id.startsWith('quests_') || id.startsWith('quest_panel_menu')) {
                    await handleQuestPanel(i, client, db);
                } 
                else if (id.startsWith('pvp_')) {
                    await handlePvpInteraction(i, client, db);
                } else if (id.startsWith('mkt_buy_select') || id.startsWith('mkt_buy_now_') || id.startsWith('mkt_buy_qty_') || id === 'mkt_refresh' || id === 'mkt_page_prev' || id === 'mkt_page_next' || id.startsWith('mkt_price_change_select') || id === 'mkt_owner_price') {
                    if (id.startsWith('mkt_buy_select')) {
                        await handleBuySelect(i, client, db, i.user, i.guild);
                    } else if (id.startsWith('mkt_buy_now_')) {
                        await handleBuyNow(i, client, db, i.user, i.guild);
                    } else if (id.startsWith('mkt_buy_qty_')) {
                        await handleBuyQuantity(i, client, db, i.user, i.guild);
                    } else if (id === 'mkt_refresh') {
                        await handleRefresh(i, client, db);
                    } else if (id === 'mkt_page_prev') {
                        const { handlePageNav } = require('./handlers/caravan/market/market-ui');
                        await handlePageNav(i, client, db, 'prev');
                    } else if (id === 'mkt_page_next') {
                        const { handlePageNav } = require('./handlers/caravan/market/market-ui');
                        await handlePageNav(i, client, db, 'next');
                    } else if (id === 'mkt_owner_price') {
                        await handleOwnerPriceChange(i, client, db, i.user);
                    } else if (id === 'mkt_price_prev') {
                        const { handlePriceNav } = require('./handlers/caravan/market/market-ui');
                        await handlePriceNav(i, client, db, 'prev');
                    } else if (id === 'mkt_price_next') {
                        const { handlePriceNav } = require('./handlers/caravan/market/market-ui');
                        await handlePriceNav(i, client, db, 'next');
                    } else if (id.startsWith('mkt_price_change_select')) {
                        await handlePriceChangeSelect(i, client, db, i.user);
                    }
                } else if (
                    id === 'shop_open_menu' ||
                    (id.startsWith('buy_') && !id.includes('_animal_') && !id.includes('_seed_') && !id.includes('_feed_') && !id.includes('asset_')) ||
                    (id.startsWith('upgrade_')) ||
                    id.startsWith('shop_') ||
                    id.startsWith('replace_') || id === 'cancel_purchase' || id === 'open_xp_modal' ||
                    id === 'max_level' || id === 'max_rod' || id === 'max_boat' || id === 'max_dungeon' ||
                    id === 'cast_rod' || id.startsWith('pull_rod') ||
                    (id.startsWith('sell_') && !id.includes('_animal_') && !id.includes('_seed_') && !id.includes('_feed_') && !id.includes('asset_')) ||
                    id.startsWith('mem_') ||
                    id === 'replace_guard' || id === 'confirm_dungeon_upgrade' ||
                    id === 'shop_select_item' || id === 'shop_skill_select_menu' ||
                    id === 'fishing_gear_sub_menu' || id === 'shop_buy_bait_menu' ||
                    id === 'shop_buy_potion_menu'
                ) {
                    if (id === 'shop_select_item') await handleShopSelectMenu(i, client, db);
                    else if (id === 'shop_skill_select_menu') await handleSkillSelectMenu(i, client, db);
                    else await handleShopInteractions(i, client, db);
                }
                return;
            }

            if (i.isModalSubmit()) {
                
                // 👑 اللاقط السحري: التقاط محادثات الذكاء الاصطناعي في سوق القوافل 👑
                if (i.customId.startsWith('mkt_npc_modal_')) {
                    try {
                        const npcAi = require('./handlers/caravan/market/market-npc-ai.js');
                        if (npcAi.handleNpcModalSubmit) {
                            await npcAi.handleNpcModalSubmit(i, client, db);
                        }
                    } catch (err) {
                        console.error('[NPC AI Modal Error]:', err);
                    }
                    return;
                }

                if (i.customId.startsWith('modal_pvp_bet_')) {
                    if (handlePvpBetModal) await handlePvpBetModal(i, client, db);
                    return;
                }
                
                if (i.customId.startsWith('farm_buy_modal|') || i.customId.startsWith('farm_sell_modal|')) {
                    if (handleFarmShopModal) {
                        await handleFarmShopModal(i, client, db);
                    }
                    return;
                }

                if (i.customId.startsWith('sugg_modal_reply_')) {
                    if (handleSuggestionModals) await handleSuggestionModals(i, client, db);
                    return;
                }

                if (i.customId.startsWith('modal_afk_msg_')) {
                    const targetID = i.customId.split('_')[3];
                    const content = i.fields.getTextInputValue('msg_content');

                    let afkDataRes;
                    try { afkDataRes = await db.query(`SELECT * FROM afk WHERE "userID" = $1 AND "guildID" = $2`, [targetID, i.guild.id]); }
                    catch(e) { afkDataRes = await db.query(`SELECT * FROM afk WHERE userid = $1 AND guildid = $2`, [targetID, i.guild.id]).catch(()=>({rows:[]})); }
                    const afkData = afkDataRes?.rows?.[0];
                    
                    if (afkData) {
                        let messages = [];
                        try { messages = JSON.parse(afkData.messages || '[]'); } catch(e){}
                        
                        messages.push({
                            authorID: i.user.id,
                            content: content,
                            timestamp: Math.floor(Date.now() / 1000)
                        });

                        try { 
                            await db.query(`UPDATE afk SET "messages" = $1 WHERE "userID" = $2 AND "guildID" = $3`, [JSON.stringify(messages), targetID, i.guild.id]); 
                        } catch(e){
                            await db.query(`UPDATE afk SET messages = $1 WHERE userid = $2 AND guildid = $3`, [JSON.stringify(messages), targetID, i.guild.id]).catch(()=>{});
                        }
                        await i.reply({ content: "✅ **تم إرسال رسالتك!** سيراها فور عودته.", flags: [MessageFlags.Ephemeral] });
                    } else {
                        await i.reply({ content: "❌ عاد الشخص قبل أن ترسل الرسالة.", flags: [MessageFlags.Ephemeral] });
                    }
                    return;
                }

                if (i.customId.startsWith('bid_')) { 
                    await handleAuctionSystem(i);
                    return;
                }

                if (i.customId.startsWith('timeout_app_modal_')) {
                    await handleTimeoutModal(i);
                } else if (i.customId.startsWith('farm_plant_modal_')) {
                    await handleLandInteractions(i, client, db);
                } else if (i.customId.startsWith('buy_modal_') || i.customId.startsWith('sell_modal_')) {
                    await handleMarketInteraction(i, client, db);
                } else if (handleShopModal && await handleShopModal(i, client, db)) {

                } else if (i.customId.startsWith('mkt_price_modal_')) {
                    await handlePriceModalSubmit(i, client, db, i.user, i.guild);
                } else if (i.customId.startsWith('mkt_buy_modal_')) {
                    await handleBuyModalSubmit(i, client, db, i.user, i.guild);
                } else if (i.customId.startsWith('mkt_new_price_modal_')) {
                    await handleNewPriceModalSubmit(i, client, db, i.user);
                } else if (i.customId.startsWith('customrole_modal_')) {
                    await handleCustomRoleInteraction(i, client, db);
                }
                return;
            }

        } catch (error) {
            if (error.code === 10062 || error.code === 40060) return;
            console.error("[InteractionCreate Error]:", error);
        } finally {
            if (processingInteractions.has(i.user.id)) {
                processingInteractions.delete(i.user.id);
            }
        }
    });
};

async function handleMarketInteraction(interaction, client, db) {
    const user = interaction.user;
    const guild = interaction.guild;

    if (interaction.customId.startsWith('buy_modal_')) {
        await interaction.deferReply({ ephemeral: false }).catch(()=>{}); 

        const assetId = interaction.customId.replace('buy_modal_', '');
        const quantityInput = interaction.fields.getTextInputValue('quantity_input');
        const quantity = parseInt(quantityInput);

        if (isNaN(quantity) || quantity <= 0) return interaction.editReply({ content: '❌ يرجى إدخال رقم صحيح وموجب.', flags: [MessageFlags.Ephemeral] });

        let marketItemRes;
        try { marketItemRes = await db.query(`SELECT * FROM market_items WHERE "id" = $1`, [assetId]); }
        catch(e) { marketItemRes = await db.query(`SELECT * FROM market_items WHERE id = $1`, [assetId]).catch(()=>({rows:[]})); }
        let marketItem = marketItemRes?.rows?.[0];

        let currentPrice = 0;
        let itemName = assetId;

        if (marketItem) {
            currentPrice = Number(marketItem.currentPrice || marketItem.currentprice) || 0;
            itemName = marketItem.name;
        } else {
            const configItem = marketConfig.find(i => i.id === assetId);
            if (!configItem) return interaction.editReply({ content: '❌ حدث خطأ: هذا الأصل غير موجود.' });
            currentPrice = Number(configItem.price) || 0;
            itemName = configItem.name;
        }

        let userData;
        try { userData = await client.getLevel(user.id, guild.id); } catch(e){}
        if (!userData) userData = { ...client.defaultData, user: user.id, guild: guild.id };
        const userMora = Number(userData.mora) || 0;
        
        const totalCost = currentPrice * quantity;

        if (userMora < totalCost) return interaction.editReply({ content: `🚫 ليس لديك رصيد كافٍ! التكلفة: **${totalCost.toLocaleString()}**` });

        let portfolioItemRes;
        try { portfolioItemRes = await db.query(`SELECT "quantity", "purchasePrice" FROM user_portfolio WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [user.id, guild.id, assetId]); }
        catch(e) { portfolioItemRes = await db.query(`SELECT quantity, purchasePrice as "purchasePrice" FROM user_portfolio WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [user.id, guild.id, assetId]).catch(()=>({rows:[]})); }
        let portfolioItem = portfolioItemRes?.rows?.[0];
        
        let newPurchasePrice = currentPrice;

        if (portfolioItem) {
            const oldQty = portfolioItem.quantity;
            const oldPrice = portfolioItem.purchasePrice || 0;
            const oldTotalCost = oldQty * oldPrice;
            const newTotalCost = quantity * currentPrice;
            const totalQty = parseInt(oldQty) + quantity;
            newPurchasePrice = Math.floor((oldTotalCost + newTotalCost) / totalQty);
        }

        try {
            try { await db.query(`UPDATE levels SET "mora" = "mora" - $1 WHERE "user" = $2 AND "guild" = $3`, [totalCost, user.id, guild.id]); }
            catch(e) { await db.query(`UPDATE levels SET mora = mora - $1 WHERE userid = $2 AND guildid = $3`, [totalCost, user.id, guild.id]).catch(()=>{}); }
            
            userData.mora = userMora - totalCost;
            try { await client.setLevel(userData); } catch(e){}

            if (portfolioItem) {
                try { await db.query(`UPDATE user_portfolio SET "quantity" = "quantity" + $1, "purchasePrice" = $2 WHERE "userID" = $3 AND "guildID" = $4 AND "itemID" = $5`, [quantity, newPurchasePrice, user.id, guild.id, assetId]); }
                catch(e) { await db.query(`UPDATE user_portfolio SET quantity = quantity + $1, purchasePrice = $2 WHERE userid = $3 AND guildid = $4 AND itemid = $5`, [quantity, newPurchasePrice, user.id, guild.id, assetId]).catch(()=>{}); }
            } else {
                try { await db.query(`INSERT INTO user_portfolio ("userID", "guildID", "itemID", "quantity", "purchasePrice") VALUES ($1, $2, $3, $4, $5)`, [user.id, guild.id, assetId, quantity, newPurchasePrice]); }
                catch(e) { await db.query(`INSERT INTO user_portfolio (userid, guildid, itemid, quantity, purchasePrice) VALUES ($1, $2, $3, $4, $5)`, [user.id, guild.id, assetId, quantity, newPurchasePrice]).catch(()=>{}); }
            }

            const embed = new EmbedBuilder()
                .setAuthor({ name: user.displayName, iconURL: user.displayAvatarURL() })
                .setTitle('✶ تـم شـراء الاصـل')
                .setDescription(`★ **الأسهم:** ${quantity} x **${itemName}**\n★ **التكـلفـة:** ${totalCost.toLocaleString()} ${EMOJI_MORA}`)
                .setThumbnail('https://i.postimg.cc/0QgvCMBN/5956138480503032828-120-removebg-preview.png')
                .setColor(Colors.Green);

            await interaction.editReply({ content: `<@${user.id}>`, embeds: [embed] });
        } catch (err) {
            await interaction.editReply({ content: '❌ حدث خطأ أثناء معالجة العملية.' });
        }
    } else if (interaction.customId.startsWith('sell_modal_')) {
        await interaction.deferReply({ ephemeral: false }).catch(()=>{}); 

        const assetId = interaction.customId.replace('sell_modal_', '');
        const quantityInput = interaction.fields.getTextInputValue('quantity_input');
        const quantity = parseInt(quantityInput);

        if (isNaN(quantity) || quantity <= 0) return interaction.editReply({ content: '❌ يرجى إدخال رقم صحيح وموجب.' });

        let portfolioItemRes;
        try { portfolioItemRes = await db.query(`SELECT "quantity" FROM user_portfolio WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [user.id, guild.id, assetId]); }
        catch(e) { portfolioItemRes = await db.query(`SELECT quantity FROM user_portfolio WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [user.id, guild.id, assetId]).catch(()=>({rows:[]})); }
        let portfolioItem = portfolioItemRes?.rows?.[0];

        if (!portfolioItem || parseInt(portfolioItem.quantity) < quantity) {
            return interaction.editReply({ content: `🚫 لا تملك هذه الكمية للبيع! لديك: **${portfolioItem ? portfolioItem.quantity : 0}**` });
        }

        let marketItemRes;
        try { marketItemRes = await db.query(`SELECT * FROM market_items WHERE "id" = $1`, [assetId]); }
        catch(e) { marketItemRes = await db.query(`SELECT * FROM market_items WHERE id = $1`, [assetId]).catch(()=>({rows:[]})); }
        let marketItem = marketItemRes?.rows?.[0];
        
        let currentPrice = marketItem ? Number(marketItem.currentPrice || marketItem.currentprice) : 0;
        
        if (currentPrice === 0 || isNaN(currentPrice)) {
            const configItem = marketConfig.find(i => i.id === assetId);
            currentPrice = configItem ? Number(configItem.price) : 0;
        }

        const totalEarned = Math.floor(currentPrice * quantity);

        let userData;
        try { userData = await client.getLevel(user.id, guild.id); } catch(e){}
        if (!userData) userData = { ...client.defaultData, user: user.id, guild: guild.id };

        try {
            try { await db.query(`UPDATE levels SET "mora" = "mora" + $1 WHERE "user" = $2 AND "guild" = $3`, [totalEarned, user.id, guild.id]); }
            catch(e) { await db.query(`UPDATE levels SET mora = mora + $1 WHERE userid = $2 AND guildid = $3`, [totalEarned, user.id, guild.id]).catch(()=>{}); }
            
            userData.mora = Number(userData.mora) + totalEarned;
            try { await client.setLevel(userData); } catch(e){}

            if (parseInt(portfolioItem.quantity) === quantity) {
                try { await db.query(`DELETE FROM user_portfolio WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [user.id, guild.id, assetId]); }
                catch(e) { await db.query(`DELETE FROM user_portfolio WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [user.id, guild.id, assetId]).catch(()=>{}); }
            } else {
                try { await db.query(`UPDATE user_portfolio SET "quantity" = "quantity" - $1 WHERE "userID" = $2 AND "guildID" = $3 AND "itemID" = $4`, [quantity, user.id, guild.id, assetId]); }
                catch(e) { await db.query(`UPDATE user_portfolio SET quantity = quantity - $1 WHERE userid = $2 AND guildid = $3 AND itemid = $4`, [quantity, user.id, guild.id, assetId]).catch(()=>{}); }
            }

            const embed = new EmbedBuilder()
                .setTitle('✅ تمت عملية البيع بنجاح')
                .setDescription(`تم بيع **${quantity}** من **${marketItem ? marketItem.name : assetId}**\nبسعر **${currentPrice}** للوحدة.\n\n💰 المبلغ المستلم: **${totalEarned.toLocaleString()}**`)
                .setColor(Colors.Red);

            await interaction.editReply({ content: `<@${user.id}>`, embeds: [embed] });
        } catch (err) {
            await interaction.editReply({ content: '❌ حدث خطأ أثناء معالجة العملية.' });
        }
    }
}

async function handleTimeoutModal(i) {
    await i.deferReply({ flags: [MessageFlags.Ephemeral] }).catch(()=>{});
    const targetId = i.customId.replace('timeout_app_modal_', '');
    let durationInput = i.fields.getTextInputValue('timeout_duration') || "3h";
    let reasonInput = i.fields.getTextInputValue('timeout_reason') || "مخالفة القوانين";

    const targetMember = await i.guild.members.fetch(targetId).catch(() => null);
    if (!targetMember) return i.editReply("❌ العضو غير موجود.");

    const durationMs = ms(durationInput);
    if (!durationMs || durationMs > 2419200000) return i.editReply("❌ مدة غير صالحة.");

    try {
        await targetMember.timeout(durationMs, `بواسطة ${i.user.tag}: ${reasonInput}`);
        const finishTime = Math.floor((Date.now() + durationMs) / 1000);
        await i.editReply({ content: `❖ خـالفـت القـوانيـن وتمـت معاقبـتك لـ\n✶ <t:${finishTime}:R>` });

        const dmEmbed = new EmbedBuilder()
            .setDescription(`**❖ خـالفـت القـوانيـن وتمـت معاقبـتك لـ**\n✶ المدة: ${durationInput}\n✶ السـبب: ${reasonInput}`)
            .setColor("Random")
            .setThumbnail(targetMember.user.displayAvatarURL());

        await targetMember.send({ embeds: [dmEmbed] }).catch(() => {});
    } catch (err) {
        await i.editReply("❌ حدث خطأ (تأكد من الصلاحيات).");
    }
}
