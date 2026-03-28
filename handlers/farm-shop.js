const { 
    EmbedBuilder, 
    ActionRowBuilder, 
    StringSelectMenuBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    MessageFlags,
    Colors
} = require('discord.js');

let farmAnimals, seedsData, feedItems;
try {
    // 🌟 المسار الافتراضي كونه بداخل مجلد handlers
    farmAnimals = require('../json/farm-animals.json'); 
    seedsData = require('../json/seeds.json'); 
    feedItems = require('../json/feed-items.json');
} catch(e) {
    farmAnimals = require('../../json/farm-animals.json'); 
    seedsData = require('../../json/seeds.json'); 
    feedItems = require('../../json/feed-items.json');
}

let getPlayerCapacity;
try {
    ({ getPlayerCapacity } = require('../utils/farmUtils.js'));
} catch (e) {
    ({ getPlayerCapacity } = require('../../utils/farmUtils.js'));
}

const EMOJI_MORA = '<:mora:1435647151349698621>';
const LEFT_EMOJI = '<:left:1439164494759723029>';
const RIGHT_EMOJI = '<:right:1439164491072929915>';
const ITEMS_PER_PAGE = 9; 
const MAX_FARM_LIMIT = 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

async function executeDB(db, query, params = []) {
    try {
        return await db.query(query, params);
    } catch (e) {
        console.error(`[DB Error]: ${e.message} \nQuery: ${query}`);
        throw e; 
    }
}

function buildMainMenu(user) {
    const embed = new EmbedBuilder()
        .setTitle('✥ المتـجر الـزراعـي المـركـزي 🌾')
        .setDescription(
            `من بذرةٍ صغيرة إلى مزرعةٍ عامرة، ستجد هنا مستلزمات الزراعة الأساسية\n` +
            `✶ يمكنك شراء الحيوانات، والبذور، والأعلاف 🌱\n\n` +
            `✶ كل ما تحتاجه لبداية مستقرة وتطوير مزرعتك خطوة بخطوة`
        )
        .setColor("Green")
        .setThumbnail(user.displayAvatarURL())
        .setImage('https://i.postimg.cc/dVpcpxXL/fmark.gif');

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('shop_cat_animals').setLabel('قسم الحيوانات').setStyle(ButtonStyle.Danger).setEmoji('🐔'),
        new ButtonBuilder().setCustomId('shop_cat_seeds').setLabel('قسم البذور').setStyle(ButtonStyle.Primary).setEmoji('🌱'),
        new ButtonBuilder().setCustomId('shop_cat_feed').setLabel('قسم الأعلاف').setStyle(ButtonStyle.Success).setEmoji('🌾')
    );

    return { embeds: [embed], components: [row] };
}

function buildGridView(allItems, pageIndex, currentCapacity, maxCapacity, category) {
    const startIndex = pageIndex * ITEMS_PER_PAGE;
    const itemsOnPage = allItems.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    const totalPages = Math.ceil(allItems.length / ITEMS_PER_PAGE);

    const col1 = [], col2 = [], col3 = [];
    itemsOnPage.forEach((item, index) => {
        const price = item.price.toLocaleString();
        const itemLine = `**${item.emoji} ${item.name}**\n${price} ${EMOJI_MORA}`;

        if (index % 3 === 0) col1.push(itemLine);
        else if (index % 3 === 1) col2.push(itemLine);
        else col3.push(itemLine);
    });

    let title = `🏞️ متجر ${category === 'seeds' ? 'البذور' : 'الأعلاف'}`;
    let desc = `اختر عنصراً من القائمة المنسدلة بالأسفل لعرض التفاصيل أو الشراء.`;
    
    if (category === 'animals') {
        title = '🏞️ متجر الحيوانات';
        desc = `📦 **سعة الحظيرة:** [ \`${currentCapacity}\` / \`${maxCapacity}\` ]\nاختر حيواناً من القائمة لعرض التفاصيل.`;
    }

    const embed = new EmbedBuilder()
        .setTitle(title)
        .setColor("Green")
        .setImage('https://i.postimg.cc/dVpcpxXL/fmark.gif')
        .setDescription(desc)
        .addFields(
            { name: '\u200B', value: col1.join('\n\n') || '\u200B', inline: true },
            { name: '\u200B', value: col2.join('\n\n') || '\u200B', inline: true },
            { name: '\u200B', value: col3.join('\n\n') || '\u200B', inline: true }
        )
        .setFooter({ text: `صفحة ${pageIndex + 1} من ${totalPages}` });

    const selectOptions = itemsOnPage.map(item => {
        let description = `${item.price} مورا`;
        if (category === 'animals') description = `دخل: ${item.income_per_day}/يوم | حجم: ${item.size || 1}`;
        if (category === 'seeds') description = `نمو: ${item.growth_time_hours}س | بيع: ${item.sell_price}`;
        
        return {
            label: `${item.name}`,
            description: description,
            value: `farm_select_item|${category}|${item.id}`,
            emoji: item.emoji
        };
    });

    const selectMenuRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('farm_select_item')
            .setPlaceholder('🔻 اضغط هنا لاختيار السلعة...')
            .addOptions(selectOptions)
    );

    const navRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('farm_back_main').setLabel('الرئيسية').setStyle(ButtonStyle.Secondary).setEmoji('🏠')
    );
    
    if (totalPages > 1) {
        navRow.addComponents(
            new ButtonBuilder().setCustomId('farm_page_prev').setEmoji(LEFT_EMOJI).setStyle(ButtonStyle.Secondary).setDisabled(pageIndex === 0),
            new ButtonBuilder().setCustomId('farm_page_next').setEmoji(RIGHT_EMOJI).setStyle(ButtonStyle.Secondary).setDisabled(pageIndex === totalPages - 1)
        );
    }

    return { embeds: [embed], components: [selectMenuRow, navRow] };
}

// 🎨 الدالة الأسطورية لعرض تفاصيل العنصر (مسرحة بـ Promise.all)
async function buildDetailView(item, userId, guildId, db, category, client) {
    let userQuantity = 0;
    let isFull = false;
    let maxCapacity = 0;
    let currentCapacityUsed = 0;

    // 1. حساب المخزون والسعة بشكل متوازي 🚀
    if (category === 'animals') {
        const [userFarmRes, cap] = await Promise.all([
            executeDB(db, `SELECT "animalID", "quantity" FROM user_farm WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId]).catch(()=>({rows:[]})),
            getPlayerCapacity ? getPlayerCapacity(client, userId, guildId) : Promise.resolve(0)
        ]);

        maxCapacity = cap;
        for (const row of userFarmRes.rows) {
            if (String(row.animalID || row.animalid) === String(item.id)) {
                userQuantity += Number(row.quantity || row.Quantity) || 0;
            }
            const fa = farmAnimals.find(a => String(a.id) === String(row.animalID || row.animalid));
            if (fa) currentCapacityUsed += (fa.size || 1) * (Number(row.quantity || row.Quantity) || 1);
        }
        isFull = (currentCapacityUsed + (item.size || 1)) > maxCapacity;
    } else {
        let invCheckRes = await executeDB(db, `SELECT "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [userId, guildId, item.id]).catch(()=>({rows:[]}));
        userQuantity = invCheckRes.rows[0] ? Number(invCheckRes.rows[0].quantity || invCheckRes.rows[0].Quantity) : 0;
        isFull = userQuantity >= MAX_FARM_LIMIT;
    }

    // 2. تجهيز الإيمبد الفخم
    let embedColor = Colors.Gold;
    let field2_name = "الدخل (لليوم)";
    let field2_val = "0";
    let field3_val = "";
    
    if (category === 'animals') {
        embedColor = Colors.Orange;
        field2_val = `${item.income_per_day} ${EMOJI_MORA}`;
        field3_val = `⏳ العمر: **${item.lifespan_days || 30}** يوم\n📦 الحجم: **${item.size || 1}** في الحظيرة`;
    } else if (category === 'seeds') {
        embedColor = Colors.Green;
        field2_name = "قيمة المحصول";
        field2_val = `${item.sell_price} ${EMOJI_MORA}`;
        field3_val = `⏳ النمو: **${item.growth_time_hours}** ساعة\n🍂 الذبول: **${item.wither_time_hours}** ساعة\n✨ الخبرة: **${item.xp_reward}** XP`;
    } else if (category === 'feed') {
        embedColor = Colors.DarkOrange;
        field2_name = "مخصص لـ";
        const target = farmAnimals.find(a => a.feed_id === item.id);
        field2_val = target ? target.name : "حيوانات متنوعة";
        field3_val = `📦 عنصر استهلاكي\n⚠️ ضروري لإبقاء الحيوان على قيد الحياة`;
    }

    const detailEmbed = new EmbedBuilder()
        .setTitle(`🔍 تفاصيل: ${item.emoji} ${item.name}`)
        .setColor(embedColor)
        .addFields(
            { name: '💰 سعر الشراء', value: `**${item.price.toLocaleString()}** ${EMOJI_MORA}`, inline: true },
            { name: field2_name, value: `**${field2_val}**`, inline: true },
            { name: '📊 الخصائص', value: field3_val, inline: false },
            { name: '📦 مخزونك الحالي', value: `تمتلك: **${userQuantity.toLocaleString()}**`, inline: false }
        );

    if (item.image) detailEmbed.setThumbnail(item.image);

    if (isFull) {
        if (category === 'animals') {
            detailEmbed.addFields({ name: '⚠️ تنبيه السعة', value: `🚫 **لا توجد مساحة كافية في الحظيرة!**\nالمساحة المتاحة: ${maxCapacity - currentCapacityUsed}`, inline: false });
        } else {
            detailEmbed.addFields({ name: '⚠️ تنبيه المخزن', value: `🚫 **وصلت للحد الأقصى (${MAX_FARM_LIMIT}) في المخزن!**`, inline: false });
        }
    }

    // 3. ترتيب الأزرار
    const actionRow1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`buy_btn_farm|${category}|${item.id}`)
            .setLabel(isFull ? 'ممتلئ' : 'شراء 🛒')
            .setStyle(isFull ? ButtonStyle.Secondary : ButtonStyle.Success)
            .setDisabled(isFull), 
            
        new ButtonBuilder()
            .setCustomId(`sell_btn_farm|${category}|${item.id}`)
            .setLabel(`بيع (نصف السعر) 💰`)
            .setStyle(ButtonStyle.Danger)
            .setDisabled(userQuantity === 0)
    );

    const actionRow2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('farm_back_to_grid').setLabel('العودة للقائمة').setStyle(ButtonStyle.Primary)
    );

    return { embeds: [detailEmbed], components: [actionRow1, actionRow2] };
}

async function handleShopInteraction(i, client, db, user, guild, shopState, getNavRow) {
    if (i.customId.startsWith('shop_cat_')) {
        await i.deferUpdate().catch(()=>{});
        const category = i.customId.replace('shop_cat_', '');
        shopState.currentCategory = category;
        shopState.currentPage = 0;

        let itemsList = [];
        if (category === 'animals') itemsList = farmAnimals;
        else if (category === 'seeds') itemsList = seedsData;
        else if (category === 'feed') itemsList = feedItems;
        shopState.currentItemsList = itemsList;

        let currentCap = 0;
        let maxCap = 0;
        if (category === 'animals') {
            // 🚀 تسريع الجلب المتوازي
            const [userFarmRes, capRes] = await Promise.all([
                executeDB(db, `SELECT "animalID", "quantity" FROM user_farm WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guild.id]).catch(()=>({rows:[]})),
                getPlayerCapacity ? getPlayerCapacity(client, user.id, guild.id) : Promise.resolve(0)
            ]);
            maxCap = capRes;
            for (const row of userFarmRes.rows) {
                const fa = farmAnimals.find(a => String(a.id) === String(row.animalID || row.animalid));
                if (fa) currentCap += (fa.size || 1) * (Number(row.quantity || row.Quantity) || 1);
            }
        }

        const data = buildGridView(itemsList, 0, currentCap, maxCap, category);
        return await i.editReply({ embeds: data.embeds, components: [...data.components, getNavRow('shop')], content: '' }).catch(()=>{});
    }

    if (i.customId === 'farm_back_main') {
        await i.deferUpdate().catch(()=>{});
        const data = buildMainMenu(user);
        return await i.editReply({ embeds: data.embeds, components: [...data.components, getNavRow('shop')], content: '' }).catch(()=>{});
    }

    if (i.customId === 'farm_page_prev' || i.customId === 'farm_page_next') {
        await i.deferUpdate().catch(()=>{});
        if (i.customId === 'farm_page_prev' && shopState.currentPage > 0) shopState.currentPage--;
        else if (i.customId === 'farm_page_next') shopState.currentPage++;

        let currentCap = 0, maxCap = 0;
        if (shopState.currentCategory === 'animals') {
            const [userFarmRes, capRes] = await Promise.all([
                executeDB(db, `SELECT "animalID", "quantity" FROM user_farm WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guild.id]).catch(()=>({rows:[]})),
                getPlayerCapacity ? getPlayerCapacity(client, user.id, guild.id) : Promise.resolve(0)
            ]);
            maxCap = capRes;
            for (const row of userFarmRes.rows) {
                const fa = farmAnimals.find(a => String(a.id) === String(row.animalID || row.animalid));
                if (fa) currentCap += (fa.size || 1) * (Number(row.quantity || row.Quantity) || 1);
            }
        }

        const data = buildGridView(shopState.currentItemsList, shopState.currentPage, currentCap, maxCap, shopState.currentCategory);
        return await i.editReply({ embeds: data.embeds, components: [...data.components, getNavRow('shop')] }).catch(()=>{});
    }

    // 🌟 فتح تفاصيل العنصر من القائمة المنسدلة
    if (i.isStringSelectMenu() && i.customId === 'farm_select_item') {
        await i.deferUpdate().catch(()=>{});
        const [_, category, itemId] = i.values[0].split('|');
        
        let item = null;
        if (category === 'animals') item = farmAnimals.find(a => String(a.id) === String(itemId));
        else if (category === 'seeds') item = seedsData.find(s => String(s.id) === String(itemId));
        else if (category === 'feed') item = feedItems.find(f => String(f.id) === String(itemId));

        if (!item) return await i.followUp({ content: '❌ العنصر غير موجود.', flags: [MessageFlags.Ephemeral] });

        shopState.currentItem = item;
        shopState.currentCategory = category;

        const data = await buildDetailView(item, user.id, guild.id, db, category, client);
        return await i.editReply({ embeds: data.embeds, components: [...data.components, getNavRow('shop')], content: '' }).catch(()=>{});
    }

    // 🌟 العودة لشبكة العناصر
    if (i.customId === 'farm_back_to_grid') {
        await i.deferUpdate().catch(()=>{});
        
        let currentCap = 0, maxCap = 0;
        if (shopState.currentCategory === 'animals') {
            const [userFarmRes, capRes] = await Promise.all([
                executeDB(db, `SELECT "animalID", "quantity" FROM user_farm WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guild.id]).catch(()=>({rows:[]})),
                getPlayerCapacity ? getPlayerCapacity(client, user.id, guild.id) : Promise.resolve(0)
            ]);
            maxCap = capRes;
            for (const row of userFarmRes.rows) {
                const fa = farmAnimals.find(a => String(a.id) === String(row.animalID || row.animalid));
                if (fa) currentCap += (fa.size || 1) * (Number(row.quantity || row.Quantity) || 1);
            }
        }

        const data = buildGridView(shopState.currentItemsList, shopState.currentPage || 0, currentCap, maxCap, shopState.currentCategory);
        return await i.editReply({ embeds: data.embeds, components: [...data.components, getNavRow('shop')] }).catch(()=>{});
    }

    // عرض Modal الشراء أو البيع
    if (i.isButton() && (i.customId.startsWith('buy_btn_farm|') || i.customId.startsWith('sell_btn_farm|'))) {
        const action = i.customId.startsWith('buy_') ? 'buy' : 'sell';
        const [_, category, itemId] = i.customId.split('|');
        
        let itemData = null;
        if (category === 'animals') itemData = farmAnimals.find(a => String(a.id) === String(itemId));
        else if (category === 'seeds') itemData = seedsData.find(s => String(s.id) === String(itemId));
        else if (category === 'feed') itemData = feedItems.find(f => String(f.id) === String(itemId));

        if (!itemData) return await i.reply({ content: '❌ العنصر غير موجود!', flags: [MessageFlags.Ephemeral] });

        const modal = new ModalBuilder()
            .setCustomId(`farm_${action}_modal|${category}|${itemData.id}`)
            .setTitle(`${action === 'buy' ? 'شراء' : 'بيع'} ${itemData.name}`);

        const labelText = action === 'buy' ? `الكمية (سعر الواحد: ${itemData.price})` : `الكمية المراد بيعها`;
        const qtyInput = new TextInputBuilder()
            .setCustomId('quantity_input')
            .setLabel(labelText)
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('1')
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(qtyInput));
        return await i.showModal(modal);
    }
}

async function handleFarmShopModal(i, client, db) {
    if (!i.customId.startsWith('farm_buy_modal|') && !i.customId.startsWith('farm_sell_modal|')) return false;

    try {
        // 🌟 جعل الرد ظاهراً للكل (ليس مخفي) 🌟
        await i.deferReply(); 
        
        const action = i.customId.startsWith('farm_buy_') ? 'buy' : 'sell';
        const [_, category, itemId] = i.customId.split('|');
        const qtyStr = i.fields.getTextInputValue('quantity_input').trim();
        const quantity = parseInt(qtyStr);

        if (isNaN(quantity) || quantity <= 0) return await i.editReply('❌ يرجى إدخال كمية صحيحة (أرقام فقط أكبر من 0).');

        let itemData = null;
        if (category === 'animals') itemData = farmAnimals.find(a => String(a.id) === String(itemId));
        else if (category === 'seeds') itemData = seedsData.find(s => String(s.id) === String(itemId));
        else if (category === 'feed') itemData = feedItems.find(f => String(f.id) === String(itemId));

        if (!itemData) return await i.editReply('❌ العنصر غير موجود!');

        // 🚀 تسريع الجلب باستخدام Promise.all
        const queries = [
            executeDB(db, `SELECT "mora" FROM levels WHERE "user" = $1 AND "guild" = $2`, [i.user.id, i.guild.id]).catch(()=>({rows:[]}))
        ];
        
        if (action === 'buy' && category === 'animals') {
            queries.push(executeDB(db, `SELECT "animalID", "quantity" FROM user_farm WHERE "userID" = $1 AND "guildID" = $2`, [i.user.id, i.guild.id]).catch(()=>({rows:[]})));
            queries.push(getPlayerCapacity ? getPlayerCapacity(client, i.user.id, i.guild.id) : Promise.resolve(0));
        } else if (action === 'buy' && category !== 'animals') {
            queries.push(executeDB(db, `SELECT "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [i.user.id, i.guild.id, itemData.id]).catch(()=>({rows:[]})));
        } else if (action === 'sell' && category === 'animals') {
            queries.push(executeDB(db, `SELECT * FROM user_farm WHERE "userID" = $1 AND "guildID" = $2 AND "animalID" = $3 ORDER BY "purchaseTimestamp" ASC`, [i.user.id, i.guild.id, itemData.id]).catch(()=>({rows:[]})));
        } else if (action === 'sell' && category !== 'animals') {
            queries.push(executeDB(db, `SELECT "id", "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [i.user.id, i.guild.id, itemData.id]).catch(()=>({rows:[]})));
        }

        const results = await Promise.all(queries);
        let userData = results[0]?.rows?.[0];

        if (!userData && action === 'buy') {
            await executeDB(db, `INSERT INTO levels ("user", "guild", "mora", "bank", "level") VALUES ($1, $2, 0, 0, 1)`, [i.user.id, i.guild.id]).catch(()=>{});
            userData = { mora: 0 };
        }

        if (action === 'buy') {
            const totalPrice = itemData.price * quantity;
            if (Number(userData.mora || 0) < totalPrice) {
                return await i.editReply(`❌ رصيدك الكاش غير كافي! تحتاج إلى **${totalPrice.toLocaleString()}** ${EMOJI_MORA}.`);
            }

            if (category === 'animals') {
                if (!getPlayerCapacity) return await i.editReply('❌ نظام المزرعة غير متوفر حالياً.');
                let currentCap = 0;
                const userFarmRows = results[1]?.rows || [];
                for (const row of userFarmRows) {
                    const fa = farmAnimals.find(a => String(a.id) === String(row.animalID || row.animalid));
                    if (fa) currentCap += (fa.size || 1) * (Number(row.quantity || row.Quantity) || 1);
                }
                const maxCapacity = results[2] || 0;
                const spaceNeeded = quantity * (itemData.size || 1);

                if (currentCap + spaceNeeded > maxCapacity) {
                    return await i.editReply(`🚫 **مساحة الحظيرة لا تكفي!**\nتحتاج إلى \`${spaceNeeded}\` مساحة، والمتاح لديك \`${maxCapacity - currentCap}\` فقط.`);
                }
            } else {
                let currQty = results[1]?.rows?.[0] ? Number(results[1].rows[0].quantity || results[1].rows[0].Quantity || 0) : 0;
                if (currQty + quantity > MAX_FARM_LIMIT) {
                    return await i.editReply(`🚫 **مخزنك ممتلئ!**\nالحد الأقصى هو **${MAX_FARM_LIMIT}**، ولديك حالياً \`${currQty}\`.`);
                }
            }

            // 🚀 تنفيذ خصم الفلوس وإضافة المورد في نفس الوقت!
            const buyUpdates = [
                executeDB(db, `UPDATE levels SET "mora" = "mora" - $1 WHERE "user" = $2 AND "guild" = $3`, [totalPrice, i.user.id, i.guild.id])
            ];
            
            try {
                if (category === 'animals') {
                    let farmCheck = await executeDB(db, `SELECT "id", "quantity" FROM user_farm WHERE "userID" = $1 AND "guildID" = $2 AND "animalID" = $3`, [i.user.id, i.guild.id, itemData.id]).catch(()=>({rows:[]}));
                    if (farmCheck?.rows?.[0]) {
                        buyUpdates.push(executeDB(db, `UPDATE user_farm SET "quantity" = "quantity" + $1 WHERE "id" = $2`, [quantity, farmCheck.rows[0].id || farmCheck.rows[0].ID]));
                    } else {
                        buyUpdates.push(executeDB(db, `INSERT INTO user_farm ("guildID", "userID", "animalID", "purchaseTimestamp", "lastCollected", "quantity", "lastFedTimestamp") VALUES ($1, $2, $3, $4, $5, $6, $7)`, [i.guild.id, i.user.id, itemData.id, Date.now(), 0, quantity, Date.now()]));
                    }
                } else {
                    let invCheckRes = await executeDB(db, `SELECT "id", "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [i.user.id, i.guild.id, itemData.id]).catch(()=>({rows:[]}));
                    if (invCheckRes?.rows?.[0]) {
                        buyUpdates.push(executeDB(db, `UPDATE user_inventory SET "quantity" = "quantity" + $1 WHERE "id" = $2`, [quantity, invCheckRes.rows[0].id || invCheckRes.rows[0].ID]));
                    } else {
                        buyUpdates.push(executeDB(db, `INSERT INTO user_inventory ("guildID", "userID", "itemID", "quantity") VALUES ($1, $2, $3, $4)`, [i.guild.id, i.user.id, itemData.id, quantity]));
                    }
                }
                await Promise.all(buyUpdates);
            } catch(e) {
                await executeDB(db, `UPDATE levels SET "mora" = "mora" + $1 WHERE "user" = $2 AND "guild" = $3`, [totalPrice, i.user.id, i.guild.id]);
                return await i.editReply('❌ حدث خطأ أثناء الحفظ. تم إرجاع أموالك.');
            }

            const successEmbed = new EmbedBuilder()
                .setTitle('✅ عملية شراء ناجحة')
                .setColor(Colors.Green)
                .setDescription(`📦 **العنصر:** ${itemData.emoji} ${itemData.name}\n🔢 **الكمية:** ${quantity.toLocaleString()}\n💰 **التكلفة:** ${totalPrice.toLocaleString()} ${EMOJI_MORA}`);
            
            // 🌟 تحديث واجهة التفاصيل لتعكس المخزون الجديد (استرجاع ذكي خلف الكواليس)
            if (i.message) {
                buildDetailView(itemData, i.user.id, i.guild.id, db, category, client).then(newData => {
                    i.message.edit({ embeds: newData.embeds, components: newData.components }).catch(()=>{});
                });
            }

            return await i.editReply({ content: `<@${i.user.id}>`, embeds: [successEmbed] });

        } else if (action === 'sell') {
            const sellPrice = Math.floor(itemData.price * 0.5); 
            const totalGain = sellPrice * quantity;

            if (category === 'animals') {
                const userAnimals = results[1]?.rows || [];
                let totalOwned = 0;
                userAnimals.forEach(row => totalOwned += Number(row.quantity || row.Quantity));
                
                if (totalOwned < quantity) return await i.editReply(`❌ لا تملك هذه الكمية للبيع! (تمتلك ${totalOwned})`);

                const now = Date.now();
                let remainingToSell = quantity;
                let totalRefund = 0;
                let soldCount = 0;
                const lifespanMs = (itemData.lifespan_days || 30) * DAY_MS;
                const noSellMs = Math.ceil((itemData.lifespan_days || 30) * 0.2) * DAY_MS;
                const sellUpdates = [];

                for (const row of userAnimals) {
                    if (remainingToSell <= 0) break;
                    const purchaseTime = Number(row.purchaseTimestamp || row.purchasetimestamp) || now;
                    const ageMs = now - purchaseTime;
                    const remainingLifeMs = lifespanMs - ageMs;

                    if (remainingLifeMs <= noSellMs) continue; 

                    let currentValRatio = (remainingLifeMs / lifespanMs);
                    if (currentValRatio > 1) currentValRatio = 1;
                    if (currentValRatio < 0) currentValRatio = 0;
                    const refundPrice = Math.floor(itemData.price * 0.70 * currentValRatio);

                    const sellFromRow = Math.min(Number(row.quantity || row.Quantity), remainingToSell);
                    totalRefund += (refundPrice * sellFromRow);
                    remainingToSell -= sellFromRow;
                    soldCount += sellFromRow;

                    if (Number(row.quantity || row.Quantity) === sellFromRow) {
                        sellUpdates.push(executeDB(db, `DELETE FROM user_farm WHERE "id" = $1`, [row.id || row.ID]).catch(()=>{}));
                    } else {
                        sellUpdates.push(executeDB(db, `UPDATE user_farm SET "quantity" = "quantity" - $1 WHERE "id" = $2`, [sellFromRow, row.id || row.ID]).catch(()=>{}));
                    }
                }

                if (soldCount === 0) return await i.editReply(`🚫 فشل البيع! حيواناتك كبيرة في السن ولا يقبلها السوق.`);
                
                sellUpdates.push(executeDB(db, `UPDATE levels SET "mora" = "mora" + $1 WHERE "user" = $2 AND "guild" = $3`, [totalRefund, i.user.id, i.guild.id]));
                await Promise.all(sellUpdates);

                const sellEmbed = new EmbedBuilder()
                    .setTitle('📈 عملية بيع زراعية')
                    .setColor(Colors.Blue)
                    .setDescription(`📦 **الكمية المباعة:** ${soldCount.toLocaleString()}x ${itemData.name}\n💰 **المبلغ المسترد:** ${totalRefund.toLocaleString()} ${EMOJI_MORA}`);
                
                if (i.message) {
                    buildDetailView(itemData, i.user.id, i.guild.id, db, category, client).then(newData => {
                        i.message.edit({ embeds: newData.embeds, components: newData.components }).catch(()=>{});
                    });
                }
                return await i.editReply({ content: `<@${i.user.id}>`, embeds: [sellEmbed] });

            } else {
                const invItem = results[1]?.rows?.[0];
                
                if (!invItem || Number(invItem.quantity || invItem.Quantity) < quantity) {
                    return await i.editReply(`❌ لا تملك هذه الكمية للبيع!`);
                }

                const sellUpdates = [
                    executeDB(db, `UPDATE levels SET "mora" = "mora" + $1 WHERE "user" = $2 AND "guild" = $3`, [totalGain, i.user.id, i.guild.id])
                ];

                if (Number(invItem.quantity || invItem.Quantity) === quantity) {
                    sellUpdates.push(executeDB(db, `DELETE FROM user_inventory WHERE "id" = $1`, [invItem.id || invItem.ID]).catch(()=>{}));
                } else {
                    sellUpdates.push(executeDB(db, `UPDATE user_inventory SET "quantity" = "quantity" - $1 WHERE "id" = $2`, [quantity, invItem.id || invItem.ID]).catch(()=>{}));
                }
                await Promise.all(sellUpdates);

                const sellEmbed = new EmbedBuilder()
                    .setTitle('📈 عملية بيع زراعية')
                    .setColor(Colors.Blue)
                    .setDescription(`📦 **الكمية المباعة:** ${quantity.toLocaleString()}x ${itemData.name}\n💰 **الأرباح:** ${totalGain.toLocaleString()} ${EMOJI_MORA} (نصف السعر)`);
                
                if (i.message) {
                    buildDetailView(itemData, i.user.id, i.guild.id, db, category, client).then(newData => {
                        i.message.edit({ embeds: newData.embeds, components: newData.components }).catch(()=>{});
                    });
                }
                return await i.editReply({ content: `<@${i.user.id}>`, embeds: [sellEmbed] });
            }
        }

    } catch (e) {
        console.error(e);
        return false;
    }
}

module.exports = {
    buildMainMenu,
    handleShopInteraction,
    handleFarmShopModal
};
