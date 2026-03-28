const { EmbedBuilder, Colors, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, StringSelectMenuBuilder, MessageFlags } = require("discord.js");
const farmAnimals = require('../../json/farm-animals.json');
const feedItems = require('../../json/feed-items.json');
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
        console.error("❌ خطأ في تحميل ملف متجر المزرعة:", e2);
    }
}

const EMOJI_MORA = '<:mora:1435647151349698621>';
const LEFT_EMOJI = '<:left:1439164494759723029>';
const RIGHT_EMOJI = '<:right:1439164491072929915>';
const ITEMS_PER_PAGE = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

const getNavRow = (activeTab) => {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('nav_land').setLabel('أرضي').setStyle(activeTab === 'land' ? ButtonStyle.Primary : ButtonStyle.Secondary).setEmoji('🏡'),
        new ButtonBuilder().setCustomId('nav_animals').setLabel('الحيوانات').setStyle(activeTab === 'animals' ? ButtonStyle.Primary : ButtonStyle.Secondary).setEmoji('🐮'),
        new ButtonBuilder().setCustomId('nav_feed').setLabel('المخزن').setStyle(activeTab === 'feed' ? ButtonStyle.Primary : ButtonStyle.Secondary).setEmoji('🌾'),
        new ButtonBuilder().setCustomId('nav_shop').setLabel('المتجر').setStyle(activeTab === 'shop' ? ButtonStyle.Success : ButtonStyle.Secondary).setEmoji('🛒')
    );
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
    description: 'إدارة المزرعة المتكاملة.',
    
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

        let animalsPage = 0;
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
            const [maxCapacity, userAnimalsRes] = await Promise.all([
                getPlayerCapacity(client, userId, guildId),
                db.query(`SELECT * FROM user_farm WHERE "userID" = $1 AND "guildID" = $2 ORDER BY "quantity" DESC`, [userId, guildId])
                  .catch(() => db.query(`SELECT * FROM user_farm WHERE userid = $1 AND guildid = $2 ORDER BY quantity DESC`, [userId, guildId]).catch(()=>({rows:[]})))
            ]);
            
            const userAnimals = userAnimalsRes.rows;

            const baseEmbed = new EmbedBuilder()
                .setColor("Random")
                .setAuthor({ name: `🐄 حظيرة ${targetUser.username}`, iconURL: targetUser.displayAvatarURL() })
                .setImage('https://i.postimg.cc/65VKKCdP/dp2kuk914o9y_gif_1731_560.gif');

            if (!userAnimals || userAnimals.length === 0) {
                baseEmbed.setDescription(`📦 **السعة:** [ \`0\` / \`${maxCapacity}\` ]\n\n🍂 **الحظيرة فارغة**\nتوجّه إلى المتجر 🛒 لشراء حيواناتك الأولى.`);
                return { embed: baseEmbed, actionRow: null };
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
                
                if (timeLeftMs > TWELVE_HOURS_MS) {
                    totalFarmIncome += (animalData.income_per_day * qty);
                }

                const timestampSeconds = Math.floor(fullUntil / 1000);
                if (timeLeftMs > TWELVE_HOURS_MS) {
                    hungerStatusText = `🟢 شبعـان: <t:${timestampSeconds}:R>`;
                } else if (timeLeftMs > 0) {
                    hungerStatusText = `🔴 جـائـع - بـدون دخـل ينفد <t:${timestampSeconds}:R>`;
                } else {
                    hungerStatusText = `🔴 جـائـع تمـاماً - بـدون دخـل (0%)`;
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
                        hungerText: hungerStatusText, age: ageDays, lifeRemaining: lifeRemaining
                    });
                }
            }

            const processedAnimals = Array.from(animalsMap.values());
            const totalPages = Math.ceil(processedAnimals.length / ITEMS_PER_PAGE);
            
            if (page < 0) page = 0;
            if (page >= totalPages && totalPages > 0) page = totalPages - 1;

            const start = page * ITEMS_PER_PAGE;
            const end = start + ITEMS_PER_PAGE;
            const currentItems = processedAnimals.slice(start, end);

            let header = currentCapacityUsed >= maxCapacity 
                ? `🚫 **الحظيرة ممتلئة!**\n✶ السعة: [ \`${currentCapacityUsed}\` / \`${maxCapacity}\` ]\n💡 ارفع مستواك لزيادة السعة القصوى.\n\n`
                : `📦 **إحصائيات السعة:**\n✶ المساحة المستخدمة: [ \`${currentCapacityUsed}\` / \`${maxCapacity}\` ]\n\n`;

            const desc = currentItems.map(item => 
                `**✥ ${item.name} ${item.emoji}**\n` +
                `✶ الـعـدد: \`${item.quantity.toLocaleString()}\`\n` +
                `✶ الـدخـل اليومي: \`${item.income.toLocaleString()}\` ${EMOJI_MORA} ${item.income === 0 ? ' (متوقف بسبب الجوع)' : ''}\n` +
                `✥ حالـة الجـوع: ${item.hungerText}\n` +
                `✥ اقـدم حـيـوان عمـره: \`${item.age}\` يوم - متبقي \`${item.lifeRemaining}\``
            ).join('\n\n');

            baseEmbed.setDescription(header + (desc || "لا يوجد حيوانات في هذه الصفحة."));
            baseEmbed.setFooter({ text: `صفحة ${page + 1}/${totalPages} • إجمالي الدخل اليومي: ${totalFarmIncome.toLocaleString()}`, iconURL: targetUser.displayAvatarURL() });

            return { embed: baseEmbed, actionRow: getAnimalsPaginationRow(page, totalPages) };
        };

        const renderFeedStore = async () => {
            let inventoryRes;
            try { inventoryRes = await db.query(`SELECT * FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId]); }
            catch(e) { inventoryRes = await db.query(`SELECT * FROM user_inventory WHERE userid = $1 AND guildid = $2`, [userId, guildId]).catch(()=>({rows:[]})); }
            
            const inventory = inventoryRes.rows;
            const feedInventory = [];

            feedItems.forEach(feed => {
                const itemInInv = inventory.find(i => String(i.itemID || i.itemid) === String(feed.id));
                if (itemInInv && Number(itemInInv.quantity) > 0) {
                    const targetAnimal = farmAnimals.find(a => String(a.feed_id) === String(feed.id));
                    feedInventory.push({ 
                        ...feed, qty: Number(itemInInv.quantity),
                        animalName: targetAnimal ? targetAnimal.name : 'مجهول',
                        animalEmoji: targetAnimal ? targetAnimal.emoji : '❓'
                    });
                }
            });

            const embed = new EmbedBuilder()
                .setTitle('✥ مـخـزن الاعلاف')
                .setColor('#D48950')
                .setImage('https://i.postimg.cc/qB6RDR0f/1000166519.gif');

            let actionRow = null;

            if (feedInventory.length === 0) {
                embed.setDescription("🚫 **المخزن فارغ!**\nتوجّه إلى المتجر 🛒 لشراء الأعلاف وإطعام حيواناتك.");
            } else {
                const list = feedInventory.map(f => 
                    `✶ ${f.emoji} **${f.name}** : \`${f.qty}\` ⬅️ لـ **${f.animalName}** ${f.animalEmoji}`
                ).join('\n\n');
                embed.setDescription(list);
                actionRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('btn_feed_animal').setLabel('اطعـام').setStyle(ButtonStyle.Success).setEmoji('🥄')
                );
            }
            return { embed, actionRow };
        };

        const mockInteraction = { 
            user: targetUser, 
            guild: guild, 
            member: targetMember,
            id: message ? message.id : interaction.id 
        };

        const landData = await renderLand(mockInteraction, client, db);
        const initialComponents = [...(landData.components || []), getNavRow('land')];

        const msg = await reply({ 
            embeds: landData.embeds || [], 
            components: initialComponents,
            files: landData.files, 
            content: landData.content || '',
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
                        files: newLandData.files,
                        attachments: [] 
                    }).catch(() => {});
                }
                else if (i.customId === 'nav_animals') {
                    await i.deferUpdate().catch(() => {});
                    const data = await renderFarmAnimals(animalsPage);
                    const components = data.actionRow ? [data.actionRow, getNavRow('animals')] : [getNavRow('animals')];
                    await i.editReply({ embeds: [data.embed], components: components, files: [], attachments: [], content: '' }).catch(() => {});
                }
                else if (i.customId === 'nav_feed') {
                    await i.deferUpdate().catch(() => {});
                    const data = await renderFeedStore();
                    const components = data.actionRow ? [data.actionRow, getNavRow('feed')] : [getNavRow('feed')];
                    await i.editReply({ embeds: [data.embed], components: components, files: [], attachments: [], content: '' }).catch(() => {});
                }
                else if (i.customId === 'nav_shop') {
                    if (!i.deferred && !i.replied) await i.deferUpdate().catch(() => {});
                    
                    if (!farmShop) {
                        return await i.followUp({ 
                            content: `❌ **حدث خطأ في ملف المتجر يمنعه من العمل!**\n\`${farmShopError || 'الملف مفقود'}\`\n\n*(الرجاء إبلاغ الإدارة بهذا الخطأ لإصلاحه)*`, 
                            flags: [MessageFlags.Ephemeral] 
                        }).catch(() => {});
                    }

                    try {
                        const menuFn = farmShop.buildMainMenu || farmShop.getShopMenu || farmShop.generateMainMenu;
                        
                        if (menuFn) {
                            const data = await menuFn(user, client, db);
                            const embeds = data.embeds || (data.embed ? [data.embed] : []);
                            const components = data.components || (data.actionRow ? [data.actionRow] : []);
                            
                            components.push(getNavRow('shop'));

                            await i.editReply({ 
                                embeds: embeds, 
                                components: components, 
                                files: data.files || [], 
                                attachments: [], 
                                content: data.content || '' 
                            }).catch(() => {});
                        } else if (farmShop.handleShopInteraction) {
                            await farmShop.handleShopInteraction(i, client, db, user, guild, shopState, getNavRow);
                        } else {
                            await i.followUp({ content: '❌ المتجر متوفر كملف لكن دالة الفتح (`buildMainMenu`) غير موجودة فيه!', flags: [MessageFlags.Ephemeral] }).catch(() => {});
                        }
                    } catch (err) {
                        console.error(err);
                        await i.followUp({ content: `❌ **خطأ برمجي أثناء فتح المتجر:**\n\`${err.message}\``, flags: [MessageFlags.Ephemeral] }).catch(() => {});
                    }
                }
                else if (farmShop && (i.customId === 'shop_cat_select' || i.customId.startsWith('shop_cat_') || i.customId === 'farm_select_item' || i.customId.startsWith('buy_btn_farm|') || i.customId.startsWith('farm_shop_'))) {
                    if (farmShop.handleShopInteraction) {
                        await farmShop.handleShopInteraction(i, client, db, user, guild, shopState, getNavRow);
                    }
                }
                else if (i.customId === 'farm_prev' || i.customId === 'farm_next') {
                    await i.deferUpdate().catch(() => {});
                    if (i.customId === 'farm_prev') animalsPage--;
                    else animalsPage++;
                    const data = await renderFarmAnimals(animalsPage);
                    const components = data.actionRow ? [data.actionRow, getNavRow('animals')] : [getNavRow('animals')];
                    await i.editReply({ embeds: [data.embed], components: components }).catch(() => {});
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

                    if (options.length === 0) return await i.reply({ content: '❌ لا تملك حيوانات.', flags: [MessageFlags.Ephemeral] }).catch(() => {});

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
                            
                            const [sampleRes, countRowRes, invRowRes] = await Promise.all([
                                db.query(`SELECT "lastFedTimestamp" FROM user_farm WHERE "userID" = $1 AND "guildID" = $2 AND "animalID" = $3 LIMIT 1`, [userId, guildId, animalId]).catch(()=>db.query(`SELECT lastfedtimestamp FROM user_farm WHERE userid = $1 AND guildid = $2 AND animalid = $3 LIMIT 1`, [userId, guildId, animalId]).catch(()=>({rows:[]}))),
                                db.query(`SELECT SUM("quantity") as total FROM user_farm WHERE "userID" = $1 AND "guildID" = $2 AND "animalID" = $3`, [userId, guildId, animalId]).catch(()=>db.query(`SELECT SUM(quantity) as total FROM user_farm WHERE userid = $1 AND guildid = $2 AND animalid = $3`, [userId, guildId, animalId]).catch(()=>({rows:[]}))),
                                db.query(`SELECT "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [userId, guildId, feedId]).catch(()=>db.query(`SELECT quantity FROM user_inventory WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [userId, guildId, feedId]).catch(()=>({rows:[]})))
                            ]);
                            
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
                            
                            await Promise.all([
                                db.query(`UPDATE user_inventory SET "quantity" = "quantity" - $1 WHERE "userID" = $2 AND "guildID" = $3 AND "itemID" = $4`, [totalAnimals, userId, guildId, feedId]).catch(() => db.query(`UPDATE user_inventory SET quantity = quantity - $1 WHERE userid = $2 AND guildid = $3 AND itemid = $4`, [totalAnimals, userId, guildId, feedId]).catch(()=>{})),
                                db.query(`UPDATE user_farm SET "lastFedTimestamp" = $1 WHERE "userID" = $2 AND "guildID" = $3 AND "animalID" = $4`, [Date.now(), userId, guildId, animalId]).catch(() => db.query(`UPDATE user_farm SET lastfedtimestamp = $1 WHERE userid = $2 AND guildid = $3 AND animalid = $4`, [Date.now(), userId, guildId, animalId]).catch(()=>{}))
                            ]);
                            
                            await subI.reply({ content: `✅ تم إطعام ${totalAnimals} **${animal.name}** بنجاح وتجديد طاقته!` }).catch(() => {});
                            
                            const data = await renderFeedStore();
                            const components = data.actionRow ? [data.actionRow, getNavRow('feed')] : [getNavRow('feed')];
                            await msg.edit({ embeds: [data.embed], components: components, files: [], attachments: [] }).catch(() => {});
                        }
                    });
                }
            } catch (err) {}
        });

        collector.on('end', () => { if (msg.editable) msg.edit({ components: [] }).catch(() => {}); });
    }
};
