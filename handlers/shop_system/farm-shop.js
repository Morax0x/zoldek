const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, Colors } = require("discord.js");

let farmAnimals, seedsData, feedItems;
try {
    farmAnimals = require('../../json/farm-animals.json'); 
    seedsData = require('../../json/seeds.json'); 
    feedItems = require('../../json/feed-items.json');
} catch(e) {
    farmAnimals = require('../json/farm-animals.json'); 
    seedsData = require('../json/seeds.json'); 
    feedItems = require('../json/feed-items.json');
}

let getPlayerCapacity;
try {
    ({ getPlayerCapacity } = require('../../utils/farmUtils.js'));
} catch (e) {
    ({ getPlayerCapacity } = require('../utils/farmUtils.js'));
}

const EMOJI_MORA = '<:mora:1435647151349698621>';
const LEFT_EMOJI = '<:left:1439164494759723029>';
const RIGHT_EMOJI = '<:right:1439164491072929915>';
const ITEMS_PER_PAGE = 15;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_FARM_LIMIT = 1000; // 🔥 الحد الأقصى للمخزن (البذور والأعلاف)

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
        if (category === 'seeds') description = `نمو: ${item.growth_time_hours}س | قيمة المحصول: ${item.sell_price}`;
        
        return {
            label: `${item.name}`,
            description: description,
            value: item.id,
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

async function buildDetailView(item, userId, guildId, sql, itemIndex, totalItems, client, category) {
    let userQuantity = 0;
    let isFull = false;
    let maxCapacity = 0;
    let currentCapacityUsed = 0;

    if (category === 'animals') {
        let userFarmQueryRes;
        try { userFarmQueryRes = await sql.query(`SELECT SUM("quantity") as totalQty FROM user_farm WHERE "userID" = $1 AND "guildID" = $2 AND "animalID" = $3`, [userId, guildId, item.id]); }
        catch(e) { userFarmQueryRes = await sql.query(`SELECT SUM(quantity) as totalqty FROM user_farm WHERE userid = $1 AND guildid = $2 AND animalid = $3`, [userId, guildId, item.id]).catch(()=>({rows:[]})); }
        
        const userFarmQuery = userFarmQueryRes.rows[0];
        userQuantity = userFarmQuery && (userFarmQuery.totalqty || userFarmQuery.totalQty) ? Number(userFarmQuery.totalqty || userFarmQuery.totalQty) : 0;

        let userFarmRowsRes;
        try { userFarmRowsRes = await sql.query(`SELECT "animalID", "quantity" FROM user_farm WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId]); }
        catch(e) { userFarmRowsRes = await sql.query(`SELECT animalid, quantity FROM user_farm WHERE userid = $1 AND guildid = $2`, [userId, guildId]).catch(()=>({rows:[]})); }
        
        const userFarmRows = userFarmRowsRes.rows;
        
        for (const row of userFarmRows) {
            const fa = farmAnimals.find(a => a.id === (row.animalID || row.animalid));
            if (fa) currentCapacityUsed += (fa.size || 1) * (Number(row.quantity) || 1);
        }
        maxCapacity = await getPlayerCapacity(client, userId, guildId);
        isFull = (currentCapacityUsed + (item.size || 1)) > maxCapacity;
    } else {
        let invQueryRes;
        try { invQueryRes = await sql.query(`SELECT "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [userId, guildId, item.id]); }
        catch(e) { invQueryRes = await sql.query(`SELECT quantity FROM user_inventory WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [userId, guildId, item.id]).catch(()=>({rows:[]})); }
        
        const invQuery = invQueryRes.rows[0];
        userQuantity = invQuery ? Number(invQuery.quantity) : 0;
        
        // 🔥 فحص التعبئة للبذور والأعلاف (1000 حد أقصى) 🔥
        isFull = userQuantity >= MAX_FARM_LIMIT;
    }

    const price = item.price.toLocaleString();
    let field2_name = "الدخل (لليوم)";
    let field2_val = "0";
    let field3_val = "";
    let field4_val = "";
    let field5_val = "";

    if (category === 'animals') {
        field2_val = `${item.income_per_day} ${EMOJI_MORA}`;
        const lifespan = item.lifespan_days || 30;
        const noSellDays = Math.ceil(lifespan * 0.2);
        const income = (item.income_per_day * userQuantity).toLocaleString();
        
        field3_val = `⏳ العمر: **${lifespan}** يوم\n🚫 حظر البيع: آخر **${noSellDays}** أيام\n📦 الحجم: **${item.size}**`;
        field4_val = `**${userQuantity.toLocaleString()}** (إجمالي الدخل: ${income}/يوم)`;
        field5_val = `[ \`${currentCapacityUsed}\` / \`${maxCapacity}\` ]`;

    } else if (category === 'seeds') {
        field2_name = "قيمة المحصول (عند الحصاد)";
        field2_val = `${item.sell_price} ${EMOJI_MORA}`;
        const profit = item.sell_price - item.price;
        
        field3_val = `⏳ النمو: **${item.growth_time_hours}** ساعة\n🍂 الذبول: **${item.wither_time_hours}** ساعة\n✨ الخبرة: **${item.xp_reward}** XP`;
        field4_val = `**${userQuantity.toLocaleString()}** بذرة`;
        field5_val = `صافي الربح المتوقع: **${profit}** ${EMOJI_MORA}`;

    } else if (category === 'feed') {
        field2_name = "مخصص لـ";
        const target = farmAnimals.find(a => a.feed_id === item.id);
        field2_val = target ? target.name : "حيوانات متنوعة";
        
        field3_val = `📦 عنصر استهلاكي\n⚠️ ضروري لحياة الحيوان`;
        field4_val = `**${userQuantity.toLocaleString()}** كيس`;
        field5_val = "يمكن تخزينه بكميات كبيرة";
    }

    const detailEmbed = new EmbedBuilder()
        .setTitle(`🏞️ تفاصيل: ${item.name}`)
        .setColor("Blue")
        .setThumbnail(item.image || null)
        .addFields(
            { name: '💰 سعر الشراء', value: `${price} ${EMOJI_MORA}`, inline: true },
            { name: field2_name, value: field2_val, inline: true },
            { name: '📊 الخصائص', value: field3_val, inline: true },
            { name: category === 'feed' ? '🎒 في المخزن' : '🏡 في مزرعتك', value: field4_val, inline: false },
            { name: category === 'animals' ? '📦 السعة الحالية' : 'ℹ️ معلومات إضافية', value: field5_val, inline: false }
        )
        .setFooter({ text: `العنصر ${itemIndex + 1} من ${totalItems}` });

    if (isFull) {
        if (category === 'animals') {
            detailEmbed.addFields({ name: '⚠️ تنبيه السعة', value: '🚫 **لا توجد مساحة كافية في الحظيرة!**', inline: false });
        } else {
            detailEmbed.addFields({ name: '⚠️ تنبيه السعة', value: `🚫 **وصلت للحد الأقصى (${MAX_FARM_LIMIT}) في المخزن!**`, inline: false });
        }
    }

    const actionRow1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`farm_prev_detail_${item.id}`).setEmoji(LEFT_EMOJI).setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`farm_next_detail_${item.id}`).setEmoji(RIGHT_EMOJI).setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('farm_back_to_grid').setLabel('العودة للقائمة').setStyle(ButtonStyle.Primary)
    );

    const actionRow2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(category === 'animals' ? `buy_animal_${item.id}` : (category === 'seeds' ? `buy_seed_${item.id}` : `buy_feed_${item.id}`))
            .setLabel(isFull ? 'ممتلئ' : 'شراء 🛒')
            .setStyle(isFull ? ButtonStyle.Secondary : ButtonStyle.Success)
            .setDisabled(isFull), 
            
        new ButtonBuilder()
            .setCustomId(category === 'animals' ? `sell_animal_${item.id}` : (category === 'seeds' ? `sell_seed_${item.id}` : `sell_feed_${item.id}`))
            .setLabel(`بيع (نصف السعر) 💰`)
            .setStyle(ButtonStyle.Danger)
            .setDisabled(userQuantity === 0)
    );

    return { embeds: [detailEmbed], components: [actionRow1, actionRow2] };
}

async function handleShopInteraction(i, client, sql, user, guild, shopState, getNavRow) {
    try {
        if (i.customId.startsWith('shop_cat_')) {
            await i.deferUpdate().catch(()=>{});
            shopState.currentCategory = i.customId.replace('shop_cat_', '');
            shopState.currentView = 'grid';
            shopState.currentPage = 0;

            if (shopState.currentCategory === 'animals') shopState.currentItemsList = farmAnimals;
            else if (shopState.currentCategory === 'seeds') shopState.currentItemsList = seedsData;
            else if (shopState.currentCategory === 'feed') shopState.currentItemsList = feedItems;

            let currentCap = 0;
            if (shopState.currentCategory === 'animals') {
                let userRowsRes;
                try { userRowsRes = await sql.query(`SELECT "animalID", "quantity" FROM user_farm WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guild.id]); }
                catch(e) { userRowsRes = await sql.query(`SELECT animalid, quantity FROM user_farm WHERE userid = $1 AND guildid = $2`, [user.id, guild.id]).catch(()=>({rows:[]})); }
                
                const userRows = userRowsRes.rows;
                for (const row of userRows) {
                    const fa = farmAnimals.find(a => a.id === (row.animalID || row.animalid));
                    if (fa) currentCap += (fa.size || 1) * (Number(row.quantity) || 1);
                }
            }
            const currentMax = await getPlayerCapacity(client, user.id, guild.id);

            const data = buildGridView(shopState.currentItemsList, shopState.currentPage, currentCap, currentMax, shopState.currentCategory);
            await i.editReply({ embeds: data.embeds, components: [...data.components, getNavRow('shop')], content: '' }).catch(()=>{});
        }

        else if (i.isStringSelectMenu() && i.customId === 'farm_select_item') {
            await i.deferUpdate().catch(()=>{});
            const selectedId = i.values[0];
            shopState.currentItemIndex = shopState.currentItemsList.findIndex(it => it.id === selectedId);
            
            if (shopState.currentItemIndex !== -1) {
                shopState.currentView = 'detail';
                const item = shopState.currentItemsList[shopState.currentItemIndex];
                const data = await buildDetailView(item, user.id, guild.id, sql, shopState.currentItemIndex, shopState.currentItemsList.length, client, shopState.currentCategory);
                await i.editReply({ embeds: data.embeds, components: [...data.components, getNavRow('shop')], content: '' }).catch(()=>{});
            }
        }

        else if (i.customId === 'farm_back_main') {
            await i.deferUpdate().catch(()=>{});
            shopState.currentView = 'main';
            shopState.currentCategory = null;
            const data = buildMainMenu(user);
            await i.editReply({ embeds: data.embeds, components: [...data.components, getNavRow('shop')], content: '' }).catch(()=>{});
        }

        else if (i.customId === 'farm_back_to_grid') {
            await i.deferUpdate().catch(()=>{});
            shopState.currentView = 'grid';
            
            let currentCap = 0;
            if (shopState.currentCategory === 'animals') {
                let userRowsRes;
                try { userRowsRes = await sql.query(`SELECT "animalID", "quantity" FROM user_farm WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guild.id]); }
                catch(e) { userRowsRes = await sql.query(`SELECT animalid, quantity FROM user_farm WHERE userid = $1 AND guildid = $2`, [user.id, guild.id]).catch(()=>({rows:[]})); }
                
                const userRows = userRowsRes.rows;
                for (const row of userRows) {
                    const fa = farmAnimals.find(a => a.id === (row.animalID || row.animalid));
                    if (fa) currentCap += (fa.size || 1) * (Number(row.quantity) || 1);
                }
            }
            const currentMax = await getPlayerCapacity(client, user.id, guild.id);
            
            const data = buildGridView(shopState.currentItemsList, shopState.currentPage, currentCap, currentMax, shopState.currentCategory);
            await i.editReply({ embeds: data.embeds, components: [...data.components, getNavRow('shop')], content: '' }).catch(()=>{});
        }

        else if (i.customId === 'farm_page_prev' || i.customId === 'farm_page_next') {
            await i.deferUpdate().catch(()=>{});
            if (i.customId === 'farm_page_prev' && shopState.currentPage > 0) shopState.currentPage--;
            else if (i.customId === 'farm_page_next') shopState.currentPage++;

            let currentCap = 0;
            if (shopState.currentCategory === 'animals') {
                let userRowsRes;
                try { userRowsRes = await sql.query(`SELECT "animalID", "quantity" FROM user_farm WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guild.id]); }
                catch(e) { userRowsRes = await sql.query(`SELECT animalid, quantity FROM user_farm WHERE userid = $1 AND guildid = $2`, [user.id, guild.id]).catch(()=>({rows:[]})); }
                
                const userRows = userRowsRes.rows;
                for (const row of userRows) {
                    const fa = farmAnimals.find(a => a.id === (row.animalID || row.animalid));
                    if (fa) currentCap += (fa.size || 1) * (Number(row.quantity) || 1);
                }
            }
            const currentMax = await getPlayerCapacity(client, user.id, guild.id);

            const data = buildGridView(shopState.currentItemsList, shopState.currentPage, currentCap, currentMax, shopState.currentCategory);
            await i.editReply({ embeds: data.embeds, components: [...data.components, getNavRow('shop')], content: '' }).catch(()=>{});
        }

        else if (i.customId.startsWith('farm_prev_detail_') || i.customId.startsWith('farm_next_detail_')) {
            await i.deferUpdate().catch(()=>{});
            if (i.customId.startsWith('farm_next_detail_')) shopState.currentItemIndex = (shopState.currentItemIndex + 1) % shopState.currentItemsList.length;
            else shopState.currentItemIndex = (shopState.currentItemIndex - 1 + shopState.currentItemsList.length) % shopState.currentItemsList.length;

            const item = shopState.currentItemsList[shopState.currentItemIndex];
            const data = await buildDetailView(item, user.id, guild.id, sql, shopState.currentItemIndex, shopState.currentItemsList.length, client, shopState.currentCategory);
            await i.editReply({ embeds: data.embeds, components: [...data.components, getNavRow('shop')], content: '' }).catch(()=>{});
        }

        else if (i.customId.startsWith('buy_') || i.customId.startsWith('sell_')) {
            const action = i.customId.startsWith('buy_') ? 'buy' : 'sell';
            const typeStr = i.customId.split('_')[1]; 
            const itemId = i.customId.replace(`${action}_${typeStr}_`, '');
            const itemData = shopState.currentItemsList.find(it => it.id === itemId);

            if (!itemData) return;

            const modal = new ModalBuilder()
                .setCustomId(`farm_${action}_${itemId}`)
                .setTitle(`${action === 'buy' ? 'شراء' : 'بيع'} ${itemData.name}`);

            const labelText = action === 'buy' ? `الكمية (سعر الواحد: ${itemData.price})` : `الكمية (للبيع)`;
            const input = new TextInputBuilder()
                .setCustomId('qty_input')
                .setLabel(labelText)
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('1')
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(input));
            
            await i.showModal(modal).catch(()=>{});

            try {
                const submit = await i.awaitModalSubmit({ time: 60000, filter: s => s.user.id === user.id });
                
                const qty = parseInt(submit.fields.getTextInputValue('qty_input'));
                
                if (isNaN(qty) || qty <= 0) {
                    await submit.reply({ content: '❌ رقم غير صحيح.', flags: [MessageFlags.Ephemeral] });
                    return;
                }

                let userData = await client.getLevel(user.id, guild.id);
                if (!userData) userData = { ...client.defaultData, user: user.id, guild: guild.id };

                if (action === 'buy') {
                    // 🔥 حماية السعة القصوى للبذور والأعلاف (1000 حد أقصى) 🔥
                    if (shopState.currentCategory !== 'animals') {
                        let invCheckRes;
                        try { invCheckRes = await sql.query(`SELECT "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [user.id, guild.id, itemId]); }
                        catch(e) { invCheckRes = await sql.query(`SELECT quantity FROM user_inventory WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [user.id, guild.id, itemId]).catch(()=>({rows:[]})); }
                        
                        const currQty = invCheckRes.rows[0] ? Number(invCheckRes.rows[0].quantity) : 0;
                        if (currQty + qty > MAX_FARM_LIMIT) {
                            return submit.reply({ content: `🚫 **مخزنك ممتلئ!**\nالحد الأقصى هو ${MAX_FARM_LIMIT}. (تمتلك حالياً: ${currQty})`, flags: [MessageFlags.Ephemeral] });
                        }
                    }

                    if (shopState.currentCategory === 'animals') {
                        let userRowsRes;
                        try { userRowsRes = await sql.query(`SELECT "animalID", "quantity" FROM user_farm WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guild.id]); }
                        catch(e) { userRowsRes = await sql.query(`SELECT animalid, quantity FROM user_farm WHERE userid = $1 AND guildid = $2`, [user.id, guild.id]).catch(()=>({rows:[]})); }
                        
                        const userRows = userRowsRes.rows;
                        let currentCap = 0;
                        for (const row of userRows) {
                            const fa = farmAnimals.find(a => a.id === (row.animalID || row.animalid));
                            if (fa) currentCap += (fa.size || 1) * (Number(row.quantity) || 1);
                        }
                        const currentMax = await getPlayerCapacity(client, user.id, guild.id);
                        const requiredSize = (itemData.size || 1) * qty;
                        
                        if (Number(currentCap) + Number(requiredSize) > Number(currentMax)) {
                            return submit.reply({ content: `🚫 لا توجد مساحة كافية في الحظيرة! المساحة المطلوبة: ${requiredSize}, المتاحة: ${currentMax - currentCap}`, flags: [MessageFlags.Ephemeral] });
                        }
                    }

                    const totalCost = itemData.price * qty;
                    if (Number(userData.mora || 0) < totalCost) return submit.reply({ content: `❌ رصيد غير كافي! تحتاج **${totalCost.toLocaleString()}** مورا.`, flags: [MessageFlags.Ephemeral] });
                    
                    try { await sql.query(`UPDATE levels SET "mora" = "mora" - $1 WHERE "user" = $2 AND "guild" = $3`, [totalCost, user.id, guild.id]); }
                    catch(e) { await sql.query(`UPDATE levels SET mora = mora - $1 WHERE userid = $2 AND guildid = $3`, [totalCost, user.id, guild.id]).catch(()=>{}); }
                    
                    userData.mora = String(Number(userData.mora || 0) - totalCost);
                    if (typeof client.setLevel === 'function') await client.setLevel(userData);
                    
                    if (shopState.currentCategory === 'animals') {
                        try { await sql.query(`INSERT INTO user_farm ("guildID", "userID", "animalID", "quantity", "purchaseTimestamp", "lastFedTimestamp") VALUES ($1, $2, $3, $4, $5, $6)`, [guild.id, user.id, itemId, qty, Date.now(), Date.now()]); }
                        catch(e) { await sql.query(`INSERT INTO user_farm (guildid, userid, animalid, quantity, purchasetimestamp, lastfedtimestamp) VALUES ($1, $2, $3, $4, $5, $6)`, [guild.id, user.id, itemId, qty, Date.now(), Date.now()]).catch(()=>{}); }
                    } else {
                        // 🔥 تحديث السعة بشكل سليم باستخدام LEAST لضمان الجدار الناري 1000 🔥
                        try { await sql.query(`INSERT INTO user_inventory ("guildID", "userID", "itemID", "quantity") VALUES ($1, $2, $3, $4) ON CONFLICT("guildID", "userID", "itemID") DO UPDATE SET "quantity" = LEAST(user_inventory."quantity" + $5, $6)`, [guild.id, user.id, itemId, qty, qty, MAX_FARM_LIMIT]); }
                        catch(e) { await sql.query(`INSERT INTO user_inventory (guildid, userid, itemid, quantity) VALUES ($1, $2, $3, $4) ON CONFLICT(guildid, userid, itemid) DO UPDATE SET quantity = LEAST(COALESCE(quantity, 0) + $5, $6)`, [guild.id, user.id, itemId, qty, qty, MAX_FARM_LIMIT]).catch(()=>{}); }
                    }
                    
                    // 🔥 رد علني بدون Ephemeral لعملية الشراء الناجحة 🔥
                    const successEmbed = new EmbedBuilder()
                        .setTitle('✅ عملية شراء زراعية')
                        .setColor(Colors.Green)
                        .setDescription(`📦 **الكمية:** ${qty.toLocaleString()}x ${itemData.name}\n💵 **التكلفة:** ${totalCost.toLocaleString()} ${EMOJI_MORA}`)
                        .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() });

                    await submit.reply({ content: `<@${user.id}>`, embeds: [successEmbed] }).catch(()=>{});

                } else { 
                    if (shopState.currentCategory === 'animals') {
                        let userAnimalsRes;
                        try { userAnimalsRes = await sql.query(`SELECT * FROM user_farm WHERE "userID" = $1 AND "guildID" = $2 AND "animalID" = $3 ORDER BY "purchaseTimestamp" ASC`, [user.id, guild.id, itemId]); }
                        catch(e) { userAnimalsRes = await sql.query(`SELECT * FROM user_farm WHERE userid = $1 AND guildid = $2 AND animalid = $3 ORDER BY purchasetimestamp ASC`, [user.id, guild.id, itemId]).catch(()=>({rows:[]})); }
                        
                        const userAnimals = userAnimalsRes.rows;
                        
                        let totalOwned = 0;
                        userAnimals.forEach(row => totalOwned += Number(row.quantity));
                        if (totalOwned < qty) return submit.reply({ content: `❌ لا تملك الكمية! لديك: ${totalOwned}`, flags: [MessageFlags.Ephemeral] });

                        const now = Date.now();
                        let remainingToSell = qty;
                        let totalRefund = 0;
                        let soldCount = 0;
                        
                        const lifespanMs = (itemData.lifespan_days || 30) * DAY_MS;
                        const noSellMs = Math.ceil((itemData.lifespan_days || 30) * 0.2) * DAY_MS;

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

                            const sellFromRow = Math.min(Number(row.quantity), remainingToSell);
                            totalRefund += (refundPrice * sellFromRow);
                            remainingToSell -= sellFromRow;
                            soldCount += sellFromRow;

                            if (Number(row.quantity) === sellFromRow) {
                                try { await sql.query(`DELETE FROM user_farm WHERE "id" = $1`, [row.id]); }
                                catch(e) { await sql.query(`DELETE FROM user_farm WHERE id = $1`, [row.id]).catch(()=>{}); }
                            } else {
                                try { await sql.query(`UPDATE user_farm SET "quantity" = "quantity" - $1 WHERE "id" = $2`, [sellFromRow, row.id]); }
                                catch(e) { await sql.query(`UPDATE user_farm SET quantity = quantity - $1 WHERE id = $2`, [sellFromRow, row.id]).catch(()=>{}); }
                            }
                        }

                        if (soldCount === 0) return submit.reply({ content: `🚫 فشل البيع! حيواناتك كبيرة في السن ولا يقبلها السوق.`, flags: [MessageFlags.Ephemeral] });

                        try { await sql.query(`UPDATE levels SET "mora" = "mora" + $1 WHERE "user" = $2 AND "guild" = $3`, [totalRefund, user.id, guild.id]); }
                        catch(e) { await sql.query(`UPDATE levels SET mora = mora + $1 WHERE userid = $2 AND guildid = $3`, [totalRefund, user.id, guild.id]).catch(()=>{}); }
                        
                        userData.mora = String(Number(userData.mora || 0) + totalRefund);
                        if (typeof client.setLevel === 'function') await client.setLevel(userData);
                        
                        // 🔥 رد علني للبيع 🔥
                        const sellEmbed = new EmbedBuilder()
                            .setTitle('📈 عملية بيع زراعية')
                            .setColor(Colors.Blue)
                            .setDescription(`📦 **الكمية المباعة:** ${soldCount.toLocaleString()}x ${itemData.name}\n💰 **المبلغ المسترد:** ${totalRefund.toLocaleString()} ${EMOJI_MORA}`)
                            .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() });

                        await submit.reply({ content: `<@${user.id}>`, embeds: [sellEmbed] }).catch(()=>{});

                    } else {
                        let invItemRes;
                        try { invItemRes = await sql.query(`SELECT "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [user.id, guild.id, itemId]); }
                        catch(e) { invItemRes = await sql.query(`SELECT quantity FROM user_inventory WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [user.id, guild.id, itemId]).catch(()=>({rows:[]})); }
                        
                        const invItem = invItemRes.rows[0];
                        if (!invItem || Number(invItem.quantity) < qty) return submit.reply({ content: `❌ لا تملك الكمية.`, flags: [MessageFlags.Ephemeral] });
                        
                        const sellPrice = Math.floor(itemData.price * 0.5); 
                        const totalGain = sellPrice * qty;

                        try { await sql.query(`UPDATE levels SET "mora" = "mora" + $1 WHERE "user" = $2 AND "guild" = $3`, [totalGain, user.id, guild.id]); }
                        catch(e) { await sql.query(`UPDATE levels SET mora = mora + $1 WHERE userid = $2 AND guildid = $3`, [totalGain, user.id, guild.id]).catch(()=>{}); }

                        userData.mora = String(Number(userData.mora || 0) + totalGain);
                        if (typeof client.setLevel === 'function') await client.setLevel(userData);

                        if (Number(invItem.quantity) === qty) {
                            try { await sql.query(`DELETE FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [user.id, guild.id, itemId]); }
                            catch(e) { await sql.query(`DELETE FROM user_inventory WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [user.id, guild.id, itemId]).catch(()=>{}); }
                        } else {
                            try { await sql.query(`UPDATE user_inventory SET "quantity" = "quantity" - $1 WHERE "userID" = $2 AND "guildID" = $3 AND "itemID" = $4`, [qty, user.id, guild.id, itemId]); }
                            catch(e) { await sql.query(`UPDATE user_inventory SET quantity = quantity - $1 WHERE userid = $2 AND guildid = $3 AND itemid = $4`, [qty, user.id, guild.id, itemId]).catch(()=>{}); }
                        }

                        // 🔥 رد علني للبيع 🔥
                        const sellEmbed = new EmbedBuilder()
                            .setTitle('📈 عملية بيع زراعية')
                            .setColor(Colors.Blue)
                            .setDescription(`📦 **الكمية المباعة:** ${qty.toLocaleString()}x ${itemData.name}\n💰 **الأرباح:** ${totalGain.toLocaleString()} ${EMOJI_MORA} (نصف السعر)`)
                            .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() });

                        await submit.reply({ content: `<@${user.id}>`, embeds: [sellEmbed] }).catch(()=>{});
                    }
                }

                const newData = await buildDetailView(shopState.currentItemsList[shopState.currentItemIndex], user.id, guild.id, sql, shopState.currentItemIndex, shopState.currentItemsList.length, client, shopState.currentCategory);
                await i.message.edit({ embeds: newData.embeds, components: [...newData.components, getNavRow('shop')] }).catch(() => {});

            } catch (e) {
                if (e.code !== 40060 && e.code !== 10062) console.error("Modal Submit Error in Shop:", e);
            }
        }
    } catch (err) {
        console.error("Error inside handleShopInteraction:", err);
    }
}

module.exports = { buildMainMenu, handleShopInteraction };
