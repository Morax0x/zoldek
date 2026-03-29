const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, StringSelectMenuBuilder, MessageFlags, AttachmentBuilder } = require("discord.js");
const farmAnimals = require('../../json/farm-animals.json');
const feedItems = require('../../json/feed-items.json');
const seedsData = require('../../json/seeds.json');
const { getPlayerCapacity } = require('../../utils/farmUtils.js');
const { renderLand } = require('../../handlers/farm-land.js');

let farmShop;
let farmShopError = null;
try {
    farmShop = require('../../handlers/shop_system/farm-shop.js');
} catch(e) {
    farmShopError = e.message;
    try { 
        farmShop = require('../../handlers/farm-shop.js'); 
        farmShopError = null;
    } catch(e2) {
        farmShopError = e2.message;
    }
}

let drawFarmAnimalsGrid;
try {
    const farmGens = require('../../generators/farm-generator.js');
    drawFarmAnimalsGrid = farmGens.drawFarmAnimalsGrid;
} catch (e) {
    drawFarmAnimalsGrid = async () => null; 
}

let generateInventoryCard, resolveItemInfoLocal;
try {
    const invGen = require('../../generators/inventory-generator.js');
    generateInventoryCard = invGen.generateInventoryCard;
    resolveItemInfoLocal = invGen.resolveItemInfo;
} catch (e) {
    generateInventoryCard = async () => null;
    resolveItemInfoLocal = (id) => ({ name: id, emoji: '📦', rarity: 'Common' });
}

const EMOJI_MORA = '<:mora:1435647151349698621>';
const LEFT_EMOJI = '<:left:1439164494759723029>';
const RIGHT_EMOJI = '<:right:1439164491072929915>';
const ITEMS_PER_PAGE = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

function cleanEmojis(text) {
    if (!text) return '';
    return text.replace(/[\u{1F600}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F300}-\u{1F5FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FADF}\u{1F004}-\u{1F0CF}\u{2B00}-\u{2BFF}₿🪙]/gu, '').trim();
}

const getNavRow = (activeTab) => {
    const row = new ActionRowBuilder();
    if (activeTab !== 'land') row.addComponents(new ButtonBuilder().setCustomId('nav_land').setLabel('أرضي').setStyle(ButtonStyle.Secondary).setEmoji('🏡'));
    if (activeTab !== 'animals') row.addComponents(new ButtonBuilder().setCustomId('nav_animals').setLabel('الحيوانات').setStyle(ButtonStyle.Secondary).setEmoji('🐮'));
    if (activeTab !== 'feed') row.addComponents(new ButtonBuilder().setCustomId('nav_feed').setLabel('المخزن').setStyle(ButtonStyle.Secondary).setEmoji('🌾'));
    if (activeTab !== 'shop') row.addComponents(new ButtonBuilder().setCustomId('nav_shop').setLabel('المتجر').setStyle(ButtonStyle.Success).setEmoji('🛒'));
    return row;
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('مزرعتي')
        .setDescription('إدارة المزرعة المتكاملة (أرض، حيوانات، مخزن، متجر).')
        .addUserOption(option => 
            option.setName('المستخدم')
            .setDescription('المستخدم الذي تريد عرض مزرعته')
            .setRequired(false)),

    name: 'farm',
    aliases: ['مزرعتي', 'حيواناتي', 'mf', 'مزرعة', 'مزرعه', 'متجر_مزرعة', 'سوق_المزرعة'],
    category: "Economy",
    description: 'إدارة المزرعة المتكاملة بصور ديناميكية.',
    
    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, guild, client, user, targetMember;

        if (isSlash) {
            interaction = interactionOrMessage;
            guild = interaction.guild;
            client = interaction.client;
            user = interaction.user;
            targetMember = interaction.options.getMember('المستخدم') || interaction.member;
            await interaction.deferReply().catch(() => {});
        } else {
            message = interactionOrMessage;
            guild = message.guild;
            client = message.client;
            user = message.author;
            targetMember = message.mentions.members.first() || message.member;
        }

        const reply = async (payload) => {
            if (isSlash) return interaction.editReply(payload).catch(() => {});
            return message.channel.send(payload).catch(() => {});
        }

        const db = client.sql;
        const targetUser = targetMember.user;
        const userId = targetUser.id; 
        const guildId = guild.id;
        const isOwner = user.id === userId; 
        const now = Date.now();

        let startTab = 'land';
        let commandTrigger = "";
        let subCommand = "";

        if (!isSlash) {
            const words = interactionOrMessage.content.trim().split(/ +/);
            commandTrigger = words[0].toLowerCase().replace(/^[^\w\s\u0600-\u06FF]/, ''); 
            if (words.length > 1) {
                subCommand = words[1].toLowerCase(); 
            }
        }

        if (['مزرعتي', 'مزرعة', 'مزرعه', 'mf'].includes(commandTrigger)) {
            if (['حيوانات', 'حظيرة', 'animals'].includes(subCommand)) startTab = 'animals';
            else if (['مخزن', 'أعلاف', 'اعلاف', 'feed'].includes(subCommand)) startTab = 'feed';
            else if (['متجر', 'سوق', 'shop'].includes(subCommand)) startTab = 'shop';
        } else if (['متجر_مزرعة', 'سوق_المزرعة'].includes(commandTrigger)) {
            startTab = 'shop';
        } else if (['حيواناتي'].includes(commandTrigger)) {
            startTab = 'animals';
        }

        let animalsPage = 0;
        let feedPage = 0;
        let shopState = {}; 

        const getAnimalsPaginationRow = (page, totalPages) => {
            const row = new ActionRowBuilder();
            if (totalPages > 1) {
                row.addComponents(
                    new ButtonBuilder().setCustomId('farm_prev').setEmoji(LEFT_EMOJI).setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
                    new ButtonBuilder().setCustomId('farm_next').setEmoji(RIGHT_EMOJI).setStyle(ButtonStyle.Secondary).setDisabled(page === totalPages - 1)
                );
            }
            return row.components.length > 0 ? row : null;
        };

        const renderFarmAnimals = async (page = 0) => {
            let maxCapacity = await getPlayerCapacity(client, userId, guildId);
            let userFarmRes;
            try { userFarmRes = await db.query(`SELECT "animalID", "quantity", "purchaseTimestamp", "lastFedTimestamp" FROM user_farm WHERE "userID" = $1 AND "guildID" = $2 ORDER BY "quantity" DESC`, [userId, guildId]); }
            catch(e) { userFarmRes = await db.query(`SELECT animalid, quantity, purchasetimestamp, lastfedtimestamp FROM user_farm WHERE userid = $1 AND guildid = $2 ORDER BY quantity DESC`, [userId, guildId]).catch(()=>({rows:[]})); }
            
            const userAnimals = userFarmRes.rows;

            if (!userAnimals || userAnimals.length === 0) {
                return { content: `📦 **السعة:** [ \`0\` / \`${maxCapacity}\` ]\n\n🍂 **الحظيرة فارغة**\nتوجّه إلى المتجر 🛒 لشراء حيواناتك الأولى.`, files: [], actionRow: null };
            }

            let totalFarmIncome = 0;
            let currentCapacityUsed = 0;
            const animalsMap = new Map();

            for (const row of userAnimals) {
                const animalId = row.animalID || row.animalid;
                const animalData = farmAnimals.find(a => String(a.id) === String(animalId));
                if (!animalData) continue; 
                
                const qty = Number(row.quantity) || 1;
                currentCapacityUsed += (qty * (animalData.size || 1));

                const purchaseTime = Number(row.purchaseTimestamp || row.purchasetimestamp) || now;
                const ageMS = now - purchaseTime;
                const ageDays = Math.floor(ageMS / DAY_MS);
                const lifeRemaining = Math.max(0, animalData.lifespan_days - ageDays);

                const lastFed = Number(row.lastFedTimestamp || row.lastfedtimestamp) || now;
                const maxHungerMs = (animalData.max_hunger_days || 3) * DAY_MS; 
                const fullUntil = lastFed + maxHungerMs; 
                const timeLeftMs = fullUntil - now;
                const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
                
                let hungerStatusText = "";
                let isHungry = false;
                
                if (timeLeftMs > TWELVE_HOURS_MS) {
                    totalFarmIncome += (animalData.income_per_day * qty);
                    hungerStatusText = `شبعان`;
                } else if (timeLeftMs > 0) {
                    hungerStatusText = `جائع (بلا دخل)`;
                    isHungry = true;
                } else {
                    hungerStatusText = `يتضور جوعاً!`;
                    isHungry = true;
                }

                if (animalsMap.has(animalData.id)) {
                    const existing = animalsMap.get(animalData.id);
                    existing.quantity += qty;
                    if (timeLeftMs > TWELVE_HOURS_MS) existing.income += (animalData.income_per_day * qty);
                    if (ageDays > existing.age) { existing.age = ageDays; existing.lifeRemaining = lifeRemaining; }
                } else {
                    animalsMap.set(animalData.id, {
                        ...animalData, quantity: qty, 
                        income: (timeLeftMs > TWELVE_HOURS_MS) ? (animalData.income_per_day * qty) : 0,
                        hungerText: hungerStatusText, isHungry: isHungry, age: ageDays, lifeRemaining: lifeRemaining
                    });
                }
            }

            const processedAnimals = Array.from(animalsMap.values());
            const totalPages = Math.max(1, Math.ceil(processedAnimals.length / ITEMS_PER_PAGE));
            
            if (page < 0) page = 0;
            if (page >= totalPages && totalPages > 0) page = totalPages - 1;

            const start = page * ITEMS_PER_PAGE;
            const end = start + ITEMS_PER_PAGE;
            const currentItems = processedAnimals.slice(start, end);

            let files = [];
            if (drawFarmAnimalsGrid) {
                const buffer = await drawFarmAnimalsGrid(targetUser, currentItems, page, totalPages, maxCapacity, currentCapacityUsed, totalFarmIncome);
                if(buffer) files.push(new AttachmentBuilder(buffer, { name: 'farm_animals.png' }));
            }

            let fallbackContent = files.length > 0 ? '' : `📦 **السعة:** [ \`${currentCapacityUsed}\` / \`${maxCapacity}\` ]\n\n` + 
                currentItems.map(item => `**✥ ${item.name} ${item.emoji}**\n✶ العدد: \`${item.quantity}\`\n✶ الدخل: \`${item.income}\` ${EMOJI_MORA}\n✥ الحالة: ${item.hungerText}`).join('\n\n');

            return { content: fallbackContent, files, actionRow: getAnimalsPaginationRow(page, totalPages) };
        };

        const renderFeedStore = async (page = 0) => {
            let inventoryRes;
            try { inventoryRes = await db.query(`SELECT "itemID", "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId]); }
            catch(e) { inventoryRes = await db.query(`SELECT itemid, quantity FROM user_inventory WHERE userid = $1 AND guildid = $2`, [userId, guildId]).catch(()=>({rows:[]})); }
            
            const inventory = inventoryRes.rows;
            const farmItems = [];
            let hasFeed = false;

            for (const row of inventory) {
                const itemId = row.itemID || row.itemid;
                const qty = Number(row.quantity || row.Quantity) || 0;
                if (qty <= 0) continue;

                const isFeed = feedItems.some(f => String(f.id) === String(itemId));
                const isSeed = seedsData.some(s => String(s.id) === String(itemId));

                if (isFeed || isSeed) {
                    if (isFeed) hasFeed = true;
                    let info = resolveItemInfoLocal(itemId);
                    farmItems.push({ ...info, quantity: qty, id: itemId });
                }
            }

            const totalPages = Math.max(1, Math.ceil(farmItems.length / 15));
            if (page < 0) page = 0;
            if (page >= totalPages && totalPages > 0) page = totalPages - 1;

            const slice = farmItems.slice(page * 15, (page + 1) * 15);

            let files = [];
            let fallbackContent = '';

            if (generateInventoryCard) {
                const cleanUser = cleanEmojis(targetUser.username);
                const buffer = await generateInventoryCard(cleanUser, 'المخزن الزراعي', slice, page + 1, totalPages, -1);
                if (buffer) files.push(new AttachmentBuilder(buffer, { name: 'farm_inv.png' }));
            } else {
                if (slice.length === 0) fallbackContent = "🚫 **المخزن فارغ!**";
                else fallbackContent = slice.map(f => `✶ ${f.emoji} **${f.name}** : \`${f.quantity}\``).join('\n');
            }

            const actionRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('btn_feed_animal').setLabel('اطعـام القطيع').setStyle(ButtonStyle.Success).setEmoji('🥄').setDisabled(!hasFeed)
            );

            let paginationRow = null;
            if (totalPages > 1) {
                paginationRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('feed_prev').setEmoji(LEFT_EMOJI).setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
                    new ButtonBuilder().setCustomId('feed_next').setEmoji(RIGHT_EMOJI).setStyle(ButtonStyle.Secondary).setDisabled(page === totalPages - 1)
                );
            }

            return { content: fallbackContent, files, actionRow, paginationRow };
        };

        const mockInteraction = { 
            user: targetUser, 
            guild: guild, 
            member: targetMember,
            id: message ? message.id : interaction.id 
        };

        let initialData = {};
        if (startTab === 'animals') {
            initialData = await renderFarmAnimals(0);
        } else if (startTab === 'feed') {
            initialData = await renderFeedStore(0);
        } else if (startTab === 'shop') {
            if (farmShop && farmShop.getShopMenu) {
                user.guildId = guild.id;
                initialData = await farmShop.getShopMenu(user, client, db);
                initialData.actionRow = null; 
            } else {
                initialData = { content: "❌ متجر المزرعة قيد الصيانة." };
            }
        } else {
            initialData = await renderLand(mockInteraction, client, db);
        }

        let finalComponents = [];
        if (startTab !== 'shop') {
            if (initialData.actionRow) finalComponents.push(initialData.actionRow);
            if (initialData.paginationRow) finalComponents.push(initialData.paginationRow);
            finalComponents.push(getNavRow(startTab));
        } else {
            finalComponents = initialData.components || [];
        }

        const msg = await reply({ 
            embeds: initialData.embeds || [], 
            components: finalComponents,
            files: initialData.files || [], 
            content: initialData.content || '',
            fetchReply: true 
        });

        const collector = msg.createMessageComponentCollector({ 
            filter: i => {
                if (i.user.id === user.id) return true;
                i.reply({ content: `🚫 هذه الواجهة خاصة بـ ${user}`, flags: [MessageFlags.Ephemeral] }).catch(() => {});
                return false;
            }, 
            time: 300000 
        });

        collector.on('collect', async i => {
            try {
                if (i.customId === 'nav_land') {
                    await i.deferUpdate().catch(() => {});
                    const newLandData = await renderLand(mockInteraction, client, db);
                    await i.editReply({ 
                        embeds: [], 
                        content: newLandData.content || '',
                        components: [...(newLandData.components || []), getNavRow('land')], 
                        files: newLandData.files || [],
                        attachments: [] 
                    }).catch(() => {});
                }
                else if (i.customId === 'nav_animals') {
                    await i.deferUpdate().catch(() => {});
                    animalsPage = 0;
                    const data = await renderFarmAnimals(animalsPage);
                    const components = [];
                    if (data.actionRow) components.push(data.actionRow);
                    components.push(getNavRow('animals'));
                    await i.editReply({ embeds: [], components: components, files: data.files || [], attachments: [], content: data.content || '' }).catch(() => {});
                }
                else if (i.customId === 'nav_feed') {
                    await i.deferUpdate().catch(() => {});
                    feedPage = 0;
                    const data = await renderFeedStore(feedPage);
                    const components = [];
                    if (data.actionRow) components.push(data.actionRow);
                    if (data.paginationRow) components.push(data.paginationRow);
                    components.push(getNavRow('feed'));
                    await i.editReply({ embeds: [], components: components, files: data.files || [], attachments: [], content: data.content || '' }).catch(() => {});
                }
                else if (i.customId === 'nav_shop') {
                    if (!i.deferred && !i.replied) await i.deferUpdate().catch(() => {});
                    
                    if (!farmShop || !farmShop.getShopMenu) {
                        return await i.followUp({ 
                            content: `❌ **حدث خطأ في ملف المتجر يمنعه من العمل!**\n\`${farmShopError || 'الملف أو الدالة مفقودة'}\``, 
                            flags: [MessageFlags.Ephemeral] 
                        }).catch(() => {});
                    }

                    try {
                        user.guildId = guild.id;
                        const data = await farmShop.getShopMenu(user, client, db);
                        await i.editReply({ 
                            embeds: [], 
                            components: data.components || [], 
                            files: data.files || [], 
                            attachments: [], 
                            content: data.content || '' 
                        }).catch(() => {});
                    } catch (err) {
                        await i.followUp({ content: `❌ **خطأ برمجي أثناء فتح المتجر:**\n\`${err.message}\``, flags: [MessageFlags.Ephemeral] }).catch(() => {});
                    }
                }
                else if (farmShop && (i.customId === 'shop_cat_select' || i.customId.startsWith('shop_cat_') || i.customId === 'farm_select_item' || i.customId === 'farm_shop_back' || i.customId.startsWith('buy_btn_farm|') || i.customId.startsWith('sell_btn_farm|'))) {
                    if (farmShop.handleShopInteraction) {
                        await farmShop.handleShopInteraction(i, client, db, user, guild, shopState);
                    }
                }
                else if (i.customId === 'farm_prev' || i.customId === 'farm_next') {
                    await i.deferUpdate().catch(() => {});
                    if (i.customId === 'farm_prev') animalsPage--;
                    else animalsPage++;
                    const data = await renderFarmAnimals(animalsPage);
                    const components = [];
                    if (data.actionRow) components.push(data.actionRow);
                    components.push(getNavRow('animals'));
                    await i.editReply({ embeds: [], components: components, files: data.files || [], content: data.content || '' }).catch(() => {});
                }
                else if (i.customId === 'feed_prev' || i.customId === 'feed_next') {
                    await i.deferUpdate().catch(() => {});
                    if (i.customId === 'feed_prev') feedPage--;
                    else feedPage++;
                    const data = await renderFeedStore(feedPage);
                    const components = [];
                    if (data.actionRow) components.push(data.actionRow);
                    if (data.paginationRow) components.push(data.paginationRow);
                    components.push(getNavRow('feed'));
                    await i.editReply({ embeds: [], components: components, files: data.files || [], content: data.content || '' }).catch(() => {});
                }
                else if (i.customId === 'btn_feed_animal') {
                    if (!isOwner) return await i.reply({ content: '🚫 لا يمكنك إطعام حيوانات ليست ملكك!', flags: [MessageFlags.Ephemeral] }).catch(() => {});

                    let userAnimalsRowsRes;
                    try { userAnimalsRowsRes = await db.query(`SELECT "animalID" FROM user_farm WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId]); }
                    catch(e) { userAnimalsRowsRes = await db.query(`SELECT animalid FROM user_farm WHERE userid = $1 AND guildid = $2`, [userId, guildId]).catch(()=>({rows:[]})); }
                    
                    const userAnimalsRows = userAnimalsRowsRes.rows;
                    const distinctAnimalIds = [...new Set(userAnimalsRows.map(r => r.animalID || r.animalid))];
                    
                    const options = [];
                    for (const animId of distinctAnimalIds) {
                        const animal = farmAnimals.find(a => String(a.id) === String(animId));
                        if (!animal) continue; 
                        options.push({ label: `إطعام ${animal.name}`, description: `يتطلب ${feedItems.find(f=>String(f.id)===String(animal.feed_id))?.name}`, value: animal.id, emoji: animal.emoji });
                    }

                    if (options.length === 0) return await i.reply({ content: '❌ لا تملك حيوانات لإطعامها.', flags: [MessageFlags.Ephemeral] }).catch(() => {});

                    const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('menu_feed_animal').setPlaceholder('اختر الحيوان...').addOptions(options));
                    const response = await i.reply({ content: '🥄 **الإطعام:**', components: [row], flags: [MessageFlags.Ephemeral], fetchReply: true }).catch(() => {});
                    
                    if (!response) return; 

                    const subCollector = response.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 60000, max: 1 });
                    
                    subCollector.on('collect', async subI => {
                        if (subI.customId === 'menu_feed_animal') {
                            const animalId = subI.values[0];
                            const animal = farmAnimals.find(a => String(a.id) === String(animalId));
                            const feedId = animal.feed_id;
                            const maxHungerMs = (animal.max_hunger_days || 3) * DAY_MS;
                            
                            let sampleRes, countRowRes, invRowRes;
                            try {
                                sampleRes = await db.query(`SELECT "lastFedTimestamp" FROM user_farm WHERE "userID" = $1 AND "guildID" = $2 AND "animalID" = $3 LIMIT 1`, [userId, guildId, animalId]);
                                countRowRes = await db.query(`SELECT SUM("quantity") as total FROM user_farm WHERE "userID" = $1 AND "guildID" = $2 AND "animalID" = $3`, [userId, guildId, animalId]);
                                invRowRes = await db.query(`SELECT "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [userId, guildId, feedId]);
                            } catch(e) {
                                sampleRes = await db.query(`SELECT lastfedtimestamp FROM user_farm WHERE userid = $1 AND guildid = $2 AND animalid = $3 LIMIT 1`, [userId, guildId, animalId]).catch(()=>({rows:[]}));
                                countRowRes = await db.query(`SELECT SUM(quantity) as total FROM user_farm WHERE userid = $1 AND guildid = $2 AND animalid = $3`, [userId, guildId, animalId]).catch(()=>({rows:[]}));
                                invRowRes = await db.query(`SELECT quantity FROM user_inventory WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [userId, guildId, feedId]).catch(()=>({rows:[]}));
                            }
                            
                            const sample = sampleRes.rows[0];
                            if (sample && (sample.lastFedTimestamp || sample.lastfedtimestamp)) {
                                const lastFed = Number(sample.lastFedTimestamp || sample.lastfedtimestamp);
                                const timeSinceFed = Date.now() - lastFed;
                                if (timeSinceFed < (maxHungerMs * 0.10)) { 
                                    return subI.reply({ content: `✋ **${animal.name}** ما زال شبعاناً!\nالرجاء الانتظار حتى يهضم طعامه قليلاً لتجنب إهدار العلف.`, flags: [MessageFlags.Ephemeral] }).catch(() => {});
                                }
                            }

                            const countRow = countRowRes.rows[0];
                            const totalAnimals = countRow ? Number(countRow.total || countRow.totalqty) : 0;
                            
                            const invRow = invRowRes.rows[0];
                            if (!invRow || Number(invRow.quantity || invRow.Quantity) < totalAnimals) {
                                return subI.reply({ content: `❌ **علف غير كافي!**\nتحتاج **${totalAnimals}** وحدة لإطعام القطيع بالكامل.`, flags: [MessageFlags.Ephemeral] }).catch(() => {});
                            }
                            
                            try {
                                await db.query(`UPDATE user_inventory SET "quantity" = "quantity" - $1 WHERE "userID" = $2 AND "guildID" = $3 AND "itemID" = $4`, [totalAnimals, userId, guildId, feedId]);
                                await db.query(`UPDATE user_farm SET "lastFedTimestamp" = $1 WHERE "userID" = $2 AND "guildID" = $3 AND "animalID" = $4`, [Date.now(), userId, guildId, animalId]);
                            } catch(e) {
                                await db.query(`UPDATE user_inventory SET quantity = quantity - $1 WHERE userid = $2 AND guildid = $3 AND itemid = $4`, [totalAnimals, userId, guildId, feedId]).catch(()=>{});
                                await db.query(`UPDATE user_farm SET lastfedtimestamp = $1 WHERE userid = $2 AND guildid = $3 AND animalid = $4`, [Date.now(), userId, guildId, animalId]).catch(()=>{});
                            }
                            
                            await subI.reply({ content: `✅ تم إطعام ${totalAnimals} **${animal.name}** بنجاح وتجديد طاقته!` }).catch(() => {});
                            
                            const data = await renderFeedStore(feedPage);
                            const components = [];
                            if (data.actionRow) components.push(data.actionRow);
                            if (data.paginationRow) components.push(data.paginationRow);
                            components.push(getNavRow('feed'));
                            
                            await msg.edit({ embeds: [], components: components, files: data.files || [], attachments: [], content: data.content || '' }).catch(() => {});
                        }
                    });
                }
            } catch (err) {}
        });

        collector.on('end', () => { if (msg.editable) msg.edit({ components: [] }).catch(() => {}); });
    }
};
