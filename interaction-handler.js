const { Events, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionsBitField, MessageFlags, Colors } = require("discord.js");

const { handleStreakPanel } = require('./handlers/streak-panel-handler.js');
const { handleShopInteractions, handleShopModal, handleShopSelectMenu, handleSkillSelectMenu } = require('./handlers/shop-handler.js');
const { handlePvpInteraction } = require('./handlers/pvp-handler.js');
const { getUserWeight, endGiveaway, handleGiveawayInteraction } = require('./handlers/giveaway-handler.js');
const { handleReroll } = require('./handlers/reroll-handler.js');
const { handleCustomRoleInteraction } = require('./handlers/custom-role-handler.js');
const { handleReactionRole } = require('./handlers/reaction-role-handler.js');
const { handleBossInteraction } = require('./handlers/boss-handler.js');
const { handleLandInteractions } = require('./handlers/farm-land.js');
const { handleAuctionSystem } = require('./handlers/auction-handler.js');
const { handleGuildBoard, handleQuestPanel } = require('./handlers/guild-board-handler.js');
const { generateNotificationControlPanel } = require('./generators/notification-generator.js');

const { handleNewSuggestion, handleSuggestionButtons, handleSuggestionModals } = require('./handlers/suggestion-handler.js');

const marketConfig = require('./json/market-items.json');
const EMOJI_MORA = '<:mora:1435647151349698621>';

let handleFarmInteractions;
let handleFarmShopModal; 
let farmShop; 

try {
    const farmModule = require('./handlers/farm-handler.js');
    handleFarmInteractions = farmModule.handleFarmInteractions || farmModule._handleFarmTransaction;
} catch (e) {
    console.error("ℹ️ Farm Handler not found or has an error.");
}

try {
    farmShop = require('./handlers/shop_system/farm-shop.js');
    handleFarmShopModal = farmShop.handleFarmShopModal;
} catch (e) {
    try {
        farmShop = require('./handlers/farm-shop.js');
        handleFarmShopModal = farmShop.handleFarmShopModal;
    } catch (e2) {
        console.error("ℹ️ Farm Shop module error.");
    }
}

const ms = require('ms');

const processingInteractions = new Set();
const giveawayBuilders = new Map();

async function updateBuilderEmbed(interaction, data) {
    const embed = new EmbedBuilder()
        .setTitle("✥ لوحة إنشاء قيفاواي ✥")
        .setDescription("تم تحديث البيانات. اضغط إرسال عندما تكون جاهزاً.")
        .setColor(data.color || "Grey")
        .addFields([
            { name: "الجائزة (*)", value: data.prize || "لم تحدد", inline: true },
            { name: "المدة (*)", value: data.durationStr || "لم تحدد", inline: true },
            { name: "الفائزون (*)", value: data.winnerCountStr || "لم تحدد", inline: true },
            { name: "الوصف", value: data.description ? "تم التحديد" : "لم يحدد", inline: true },
            { name: "القناة", value: data.channelID ? `<#${data.channelID}>` : "القناة الحالية", inline: true },
            { name: "المكافآت", value: (data.xpReward || data.moraReward) ? "تم التحديد" : "لا يوجد", inline: true },
        ]);

    const isReady = data.prize && data.durationStr && data.winnerCountStr;

    let components = interaction.message.components;
    if (!components || components.length === 0) {
        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('g_builder_content').setLabel('تعديل المحتوى').setStyle(ButtonStyle.Primary).setEmoji('📝'),
            new ButtonBuilder().setCustomId('g_builder_visuals').setLabel('تعديل الشكل').setStyle(ButtonStyle.Secondary).setEmoji('🎨')
        );
        components = [row1];
    }

    const row = new ActionRowBuilder().addComponents(
        components[0].components[0],
        components[0].components[1],
        new ButtonBuilder()
            .setCustomId('g_builder_send')
            .setLabel('إرسال القيفاواي')
            .setStyle(ButtonStyle.Success)
            .setDisabled(!isReady)
    );

    try {
        await interaction.message.edit({ embeds: [embed], components: [row] });
    } catch (error) {}
}

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
                    const isBlacklisted = db.prepare("SELECT 1 FROM blacklistTable WHERE id = ?").get(i.user.id);
                    if (isBlacklisted) return i.reply({ content: "🚫 **أنت في القائمة السوداء.**", flags: [MessageFlags.Ephemeral] });
                } catch (e) {}

                let isAllowed = false;
                if (i.member.permissions.has(PermissionsBitField.Flags.Administrator)) isAllowed = true;
                else {
                    const settings = db.prepare("SELECT casinoChannelID, casinoChannelID2 FROM settings WHERE guild = ?").get(i.guild.id);
                    if (settings && ((settings.casinoChannelID === i.channel.id) || (settings.casinoChannelID2 === i.channel.id)) && command.category === 'Economy') {
                        isAllowed = true;
                    } else {
                        try {
                            const channelPerm = db.prepare("SELECT 1 FROM command_permissions WHERE guildID = ? AND commandName = ? AND channelID = ?").get(i.guild.id, command.name, i.channel.id);
                            const categoryPerm = i.channel.parentId ? db.prepare("SELECT 1 FROM command_permissions WHERE guildID = ? AND commandName = ? AND channelID = ?").get(i.guild.id, command.name, i.channel.parentId) : null;
                            
                            if (channelPerm || categoryPerm) isAllowed = true;
                            else {
                                const hasRestrictions = db.prepare("SELECT 1 FROM command_permissions WHERE guildID = ? AND commandName = ?").get(i.guild.id, command.name);
                                if (!hasRestrictions) isAllowed = true;
                            }
                        } catch (e) { isAllowed = true; }
                    }
                }

                if (!isAllowed) return i.reply({ content: "❌ **لا يمكنك استخدام هذا الأمر في هذه القناة.**", flags: [MessageFlags.Ephemeral] });

                try { await command.execute(i); } catch (error) {
                    console.error(`[Slash Error: ${i.commandName}]`, error);
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

                // 🌟 الحماية القسوى: نمنع الهاندلر المركزي من سرقة أزرار المزرعة، ونتركها للكوليكتر في farm.js! 🌟
                if (id.startsWith('shop_cat_') || id.startsWith('farm_') || id.startsWith('buy_btn_farm|') || id.startsWith('sell_btn_farm|') || id.startsWith('nav_') || id.includes('feed_animal')) {
                    return; // تم الإيقاف هنا ليعمل كوليكتر المزرعة بكفاءة.
                }

                if (id.startsWith('notify_afk_')) {
                    const targetID = id.split('_')[2];
                    const afkData = db.prepare("SELECT * FROM afk WHERE userID = ? AND guildID = ?").get(targetID, i.guild.id);

                    if (!afkData) return i.reply({ content: "❌ هذا الشخص عاد بالفعل!", flags: [MessageFlags.Ephemeral] });

                    let subscribers = JSON.parse(afkData.subscribers || '[]');
                    if (subscribers.includes(i.user.id)) return i.reply({ content: "✅ أنت مسجل بالفعل في قائمة التنبيه.", flags: [MessageFlags.Ephemeral] });

                    subscribers.push(i.user.id);
                    db.prepare("UPDATE afk SET subscribers = ? WHERE userID = ? AND guildID = ?").run(JSON.stringify(subscribers), targetID, i.guild.id);
                    await i.reply({ content: "🔔 **تم!** سأقوم بمنشنتك فور عودة العضو.", flags: [MessageFlags.Ephemeral] });
                    return;

                } else if (id.startsWith('leave_msg_afk_')) {
                    const targetID = id.split('_')[3];
                    const afkData = db.prepare("SELECT * FROM afk WHERE userID = ? AND guildID = ?").get(targetID, i.guild.id);
                    
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
                } else if (id.startsWith('giveaway_')) {
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
                } else if (id === 'g_builder_content' || id === 'g_builder_visuals' || id === 'g_builder_send' || id === 'g_enter' || id === 'g_enter_drop') {
                    await handleGiveawayBuilderButtons(i, client, db);
                }
                return;
            }

            if (i.isModalSubmit()) {
                
                // 🌟 السماح بنوافذ بيع وشراء المزرعة فقط هنا
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

                    const afkData = db.prepare("SELECT * FROM afk WHERE userID = ? AND guildID = ?").get(targetID, i.guild.id);
                    
                    if (afkData) {
                        let messages = JSON.parse(afkData.messages || '[]');
                        
                        messages.push({
                            authorID: i.user.id,
                            content: content,
                            timestamp: Math.floor(Date.now() / 1000)
                        });

                        db.prepare("UPDATE afk SET messages = ? WHERE userID = ? AND guildID = ?").run(JSON.stringify(messages), targetID, i.guild.id);
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
                } else if (i.customId === 'g_content_modal' || i.customId === 'g_visuals_modal') {
                    if (!i.replied && !i.deferred) await i.deferUpdate().catch(() => {});
                    const data = giveawayBuilders.get(i.user.id) || {};
                    if (i.customId === 'g_content_modal') {
                        data.prize = i.fields.getTextInputValue('g_prize');
                        data.durationStr = i.fields.getTextInputValue('g_duration');
                        data.winnerCountStr = i.fields.getTextInputValue('g_winners');
                        data.rewardsInput = i.fields.getTextInputValue('g_rewards');
                        data.channelID = i.fields.getTextInputValue('g_channel');
                    } else {
                        data.description = i.fields.getTextInputValue('g_desc');
                        data.image = i.fields.getTextInputValue('g_image');
                        data.color = i.fields.getTextInputValue('g_color');
                        data.buttonEmoji = i.fields.getTextInputValue('g_emoji');
                    }
                    giveawayBuilders.set(i.user.id, data);
                    await updateBuilderEmbed(i, data);
                } else if (i.customId.startsWith('farm_plant_modal_')) {
                    await handleLandInteractions(i, client, db);
                } else if (i.customId.startsWith('buy_modal_') || i.customId.startsWith('sell_modal_')) {
                    await handleMarketInteraction(i, client, db);
                } else if (handleShopModal && await handleShopModal(i, client, db)) {

                } else if (i.customId.startsWith('customrole_modal_')) {
                    await handleCustomRoleInteraction(i, client, db);
                }
                return;
            }

        } catch (error) {
            if (error.code === 10062 || error.code === 40060) return;
            console.error("Interaction Handler Error:", error);
        } finally {
            if (processingInteractions.has(i.user.id)) {
                processingInteractions.delete(i.user.id);
            }
        }
    });
};

// 💰🔥 نظـــــام الســـــوق المصلّـــــح 100% 🔥💰
async function handleMarketInteraction(interaction, client, db) {
    const user = interaction.user;
    const guild = interaction.guild;

    if (interaction.customId.startsWith('buy_modal_')) {
        await interaction.deferReply({ ephemeral: false }); 

        const assetId = interaction.customId.replace('buy_modal_', '');
        const quantityInput = interaction.fields.getTextInputValue('quantity_input');
        const quantity = parseInt(quantityInput);

        if (isNaN(quantity) || quantity <= 0) return interaction.editReply({ content: '❌ يرجى إدخال رقم صحيح وموجب.', flags: [MessageFlags.Ephemeral] });

        const marketItem = db.prepare("SELECT * FROM market_items WHERE id = ?").get(assetId);

        let currentPrice = 0;
        let itemName = assetId;

        if (marketItem) {
            currentPrice = marketItem.currentPrice;
            itemName = marketItem.name;
        } else {
            const configItem = marketConfig.find(i => i.id === assetId);
            if (!configItem) return interaction.editReply({ content: '❌ حدث خطأ: هذا الأصل غير موجود.' });
            currentPrice = configItem.price;
            itemName = configItem.name;
        }

        let userData = await client.getLevel(user.id, guild.id);
        if (!userData) userData = { ...client.defaultData, user: user.id, guild: guild.id };
        const userMora = Number(userData.mora) || 0;
        
        const totalCost = currentPrice * quantity;

        if (userMora < totalCost) return interaction.editReply({ content: `🚫 ليس لديك رصيد كافٍ! التكلفة: **${totalCost.toLocaleString()}**` });

        const portfolioItem = db.prepare("SELECT quantity, purchasePrice FROM user_portfolio WHERE userID = ? AND guildID = ? AND itemID = ?").get(user.id, guild.id, assetId);
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
            db.prepare("UPDATE levels SET mora = mora - ? WHERE user = ? AND guild = ?").run(totalCost, user.id, guild.id);
            
            userData.mora = userMora - totalCost;
            await client.setLevel(userData);

            if (portfolioItem) {
                db.prepare("UPDATE user_portfolio SET quantity = quantity + ?, purchasePrice = ? WHERE userID = ? AND guildID = ? AND itemID = ?").run(quantity, newPurchasePrice, user.id, guild.id, assetId);
            } else {
                db.prepare("INSERT INTO user_portfolio (userID, guildID, itemID, quantity, purchasePrice) VALUES (?, ?, ?, ?, ?)").run(user.id, guild.id, assetId, quantity, newPurchasePrice);
            }

            const embed = new EmbedBuilder()
                .setAuthor({ name: user.displayName, iconURL: user.displayAvatarURL() })
                .setTitle('✶ تـم شـراء الاصـل')
                .setDescription(`★ **الأسهم:** ${quantity} x **${itemName}**\n★ **التكـلفـة:** ${totalCost.toLocaleString()} ${EMOJI_MORA}`)
                .setThumbnail('https://i.postimg.cc/0QgvCMBN/5956138480503032828-120-removebg-preview.png')
                .setColor(Colors.Green);

            await interaction.editReply({ content: `<@${user.id}>`, embeds: [embed] });
        } catch (err) {
            console.error(err);
            await interaction.editReply({ content: '❌ حدث خطأ أثناء معالجة العملية.' });
        }
    } else if (interaction.customId.startsWith('sell_modal_')) {
        await interaction.deferReply({ ephemeral: false }); 

        const assetId = interaction.customId.replace('sell_modal_', '');
        const quantityInput = interaction.fields.getTextInputValue('quantity_input');
        const quantity = parseInt(quantityInput);

        if (isNaN(quantity) || quantity <= 0) return interaction.editReply({ content: '❌ يرجى إدخال رقم صحيح وموجب.' });

        const portfolioItem = db.prepare("SELECT quantity FROM user_portfolio WHERE userID = ? AND guildID = ? AND itemID = ?").get(user.id, guild.id, assetId);

        if (!portfolioItem || parseInt(portfolioItem.quantity) < quantity) {
            return interaction.editReply({ content: `🚫 لا تملك هذه الكمية للبيع! لديك: **${portfolioItem ? portfolioItem.quantity : 0}**` });
        }

        const marketItem = db.prepare("SELECT * FROM market_items WHERE id = ?").get(assetId);
        let currentPrice = marketItem ? marketItem.currentPrice : 0;
        
        if (currentPrice === 0) {
            const configItem = marketConfig.find(i => i.id === assetId);
            currentPrice = configItem ? configItem.price : 0;
        }

        const totalEarned = Math.floor(currentPrice * quantity);

        let userData = await client.getLevel(user.id, guild.id);
        if (!userData) userData = { ...client.defaultData, user: user.id, guild: guild.id };

        try {
            db.prepare("UPDATE levels SET mora = mora + ? WHERE user = ? AND guild = ?").run(totalEarned, user.id, guild.id);
            
            userData.mora = Number(userData.mora) + totalEarned;
            await client.setLevel(userData);

            if (parseInt(portfolioItem.quantity) === quantity) {
                db.prepare("DELETE FROM user_portfolio WHERE userID = ? AND guildID = ? AND itemID = ?").run(user.id, guild.id, assetId);
            } else {
                db.prepare("UPDATE user_portfolio SET quantity = quantity - ? WHERE userID = ? AND guildID = ? AND itemID = ?").run(quantity, user.id, guild.id, assetId);
            }

            const embed = new EmbedBuilder()
                .setTitle('✅ تمت عملية البيع بنجاح')
                .setDescription(`تم بيع **${quantity}** من **${marketItem ? marketItem.name : assetId}**\nبسعر **${currentPrice}** للوحدة.\n\n💰 المبلغ المستلم: **${totalEarned.toLocaleString()}**`)
                .setColor(Colors.Red);

            await interaction.editReply({ content: `<@${user.id}>`, embeds: [embed] });
        } catch (err) {
            console.error(err);
            await interaction.editReply({ content: '❌ حدث خطأ أثناء معالجة العملية.' });
        }
    }
}

async function handleGiveawayBuilderButtons(i, client, db) {
    const id = i.customId;

    if (id === 'g_builder_content') {
        const data = giveawayBuilders.get(i.user.id) || {};
        const modal = new ModalBuilder().setCustomId('g_content_modal').setTitle('إعداد المحتوى (1/2)');
        modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('g_prize').setLabel('الجائزة (إجباري)').setStyle(TextInputStyle.Short).setValue(data.prize || '').setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('g_duration').setLabel('المدة (إجباري)').setPlaceholder("1d 5h 10m").setStyle(TextInputStyle.Short).setValue(data.durationStr || '').setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('g_winners').setLabel('عدد الفائزين (إجباري)').setPlaceholder("1").setStyle(TextInputStyle.Short).setValue(data.winnerCountStr || '').setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('g_rewards').setLabel('المكافآت (اختياري)').setPlaceholder("XP: 100 | Mora: 500").setStyle(TextInputStyle.Short).setValue(data.rewardsInput || '').setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('g_channel').setLabel('اي دي القناة (اختياري)').setPlaceholder("12345...").setStyle(TextInputStyle.Short).setValue(data.channelID || '').setRequired(false))
        );
        await i.showModal(modal);

    } else if (id === 'g_builder_visuals') {
        const data = giveawayBuilders.get(i.user.id) || {};
        const modal = new ModalBuilder().setCustomId('g_visuals_modal').setTitle('إعداد الشكل (2/2)');
        modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('g_desc').setLabel('الوصف (اختياري)').setStyle(TextInputStyle.Paragraph).setValue(data.description || '').setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('g_image').setLabel('رابط الصورة (اختياري)').setStyle(TextInputStyle.Short).setValue(data.image || '').setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('g_color').setLabel('اللون (اختياري)').setPlaceholder("#FFFFFF").setStyle(TextInputStyle.Short).setValue(data.color || '').setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('g_emoji').setLabel('ايموجي الزر (اختياري)').setPlaceholder("🎉").setStyle(TextInputStyle.Short).setValue(data.buttonEmoji || '').setRequired(false))
        );
        await i.showModal(modal);

    } else if (id === 'g_builder_send') {
        await i.deferReply({ flags: [MessageFlags.Ephemeral] });
        const data = giveawayBuilders.get(i.user.id);
        if (!data || !data.prize || !data.durationStr || !data.winnerCountStr) return i.editReply("❌ البيانات الأساسية مفقودة.");

        const durationMs = ms(data.durationStr);
        const winnerCount = parseInt(data.winnerCountStr);
        if (!durationMs || durationMs <= 0) return i.editReply("❌ المدة غير صالحة.");
        if (isNaN(winnerCount) || winnerCount < 1) return i.editReply("❌ عدد الفائزين غير صالح.");

        const endsAt = Date.now() + durationMs;
        let embedDescription = (data.description ? `${data.description}\n\n` : "") + `✶ عـدد الـمـشاركـيـن: \`0\`\n✦ ينتهي بعـد: <t:${Math.floor(endsAt / 1000)}:R>`;

        const embed = new EmbedBuilder()
            .setTitle(`✥ قـيـفـاواي عـلـى: ${data.prize}`)
            .setDescription(embedDescription)
            .setColor(data.color || "Random")
            .setImage(data.image || null)
            .setFooter({ text: `${winnerCount} فائز` });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('g_enter').setLabel('مـشـاركــة').setStyle(ButtonStyle.Success).setEmoji(data.buttonEmoji || '🎉')
        );

        let targetChannel = i.channel;
        if (data.channelID) {
            try {
                const ch = await client.channels.fetch(data.channelID);
                if (ch && ch.isTextBased()) targetChannel = ch;
            } catch (err) {}
        }

        const gMessage = await targetChannel.send({ embeds: [embed], components: [row] });
        db.prepare("INSERT INTO active_giveaways (messageID, guildID, channelID, prize, endsAt, winnerCount, xpReward, moraReward, isFinished) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)").run(gMessage.id, i.guild.id, targetChannel.id, data.prize, endsAt, winnerCount, data.xpReward || 0, data.moraReward || 0);

        setTimeout(() => endGiveaway(client, gMessage.id), durationMs);
        giveawayBuilders.delete(i.user.id);
        await i.message.edit({ content: "✅ تم إرسال القيفاواي بنجاح!", embeds: [], components: [] }).catch(() => {});
        await i.editReply("✅ تم الإرسال!");

    } else if (id === 'g_enter') {
        if (!i.replied && !i.deferred) await i.deferUpdate().catch(() => {});
        const giveawayID = i.message.id;
        const userID = i.user.id;
        
        const existingEntry = db.prepare("SELECT 1 FROM giveaway_entries WHERE giveawayID = ? AND userID = ?").get(giveawayID, userID);
        let replyMessage = "";
        
        if (existingEntry) {
            db.prepare("DELETE FROM giveaway_entries WHERE giveawayID = ? AND userID = ?").run(giveawayID, userID);
            replyMessage = "✅ تـم الـغـاء الـمـشاركـة";
        } else {
            const weight = await getUserWeight(i.member, db).catch(() => 1);
            db.prepare("INSERT INTO giveaway_entries (giveawayID, userID, weight) VALUES (?, ?, ?)").run(giveawayID, userID, weight);
            replyMessage = `✅ تـمـت الـمـشاركـة بنـجـاح دخـلت بـ: ${weight} تذكـرة`;
        }
        await i.followUp({ content: replyMessage, flags: [MessageFlags.Ephemeral] });
    } else if (id === 'g_enter_drop') {
        if (!i.replied && !i.deferred) await i.deferUpdate().catch(() => {});
        const messageID = i.message.id;
        const userID = i.user.id;
        try {
            const giveaway = db.prepare("SELECT * FROM active_giveaways WHERE messageID = ? AND isFinished = 0").get(messageID);
            if (!giveaway || (giveaway.endsAt && giveaway.endsAt < Date.now())) return i.followUp({ content: "❌ هذا القيفاواي انتهى.", flags: [MessageFlags.Ephemeral] });
            
            const existing = db.prepare("SELECT 1 FROM giveaway_entries WHERE giveawayID = ? AND userID = ?").get(messageID, userID);
            if (existing) return i.followUp({ content: "⚠️ أنت مسجل بالفعل.", flags: [MessageFlags.Ephemeral] });

            let weight = 1;
            try { weight = await getUserWeight(i.member, db); } catch (err) {}

            db.prepare("INSERT INTO giveaway_entries (giveawayID, userID, weight) VALUES (?, ?, ?)").run(messageID, userID, weight);
            return i.followUp({ content: `✅ تم التسجيل بنجاح (تذاكر: ${weight})!`, flags: [MessageFlags.Ephemeral] });
        } catch (error) {
            return i.followUp({ content: "❌ حدث خطأ.", flags: [MessageFlags.Ephemeral] });
        }
    }
}

async function handleTimeoutModal(i) {
    await i.deferReply({ flags: [MessageFlags.Ephemeral] });
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
