const { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags, AttachmentBuilder, EmbedBuilder, Colors } = require('discord.js');
const path = require('path');
const fs = require('fs');

const loadJson = (fileName) => {
    try {
        const filePath = path.join(process.cwd(), 'json', fileName);
        if (fs.existsSync(filePath)) return require(filePath);
    } catch(e) {}
    return [];
};

const farmAnimals = loadJson('farm-animals.json'); 
const seedsData = loadJson('seeds.json'); 
const feedItems = loadJson('feed-items.json');

let drawFarmShopGrid, drawFarmShopDetail;
try {
    const genPath = path.join(process.cwd(), 'generators', 'farm-shop-generator.js');
    ({ drawFarmShopGrid, drawFarmShopDetail } = require(genPath));
} catch (e) {
    drawFarmShopGrid = async () => null;
    drawFarmShopDetail = async () => null;
}

let getPlayerCapacity;
try { 
    const utilsPath = path.join(process.cwd(), 'utils', 'farmUtils.js');
    ({ getPlayerCapacity } = require(utilsPath)); 
} catch (e) { 
    getPlayerCapacity = async () => 10; 
}

const EMOJI_MORA = '<:mora:1435647151349698621>';
const MAX_FARM_LIMIT = 1000;

async function executeDB(db, query, params = []) {
    try { return await db.query(query, params); } 
    catch (e) { throw e; }
}

async function buildShopGrid(user, client, db, category) {
    let itemsList = [];
    if (category === 'animals') itemsList = farmAnimals;
    else if (category === 'seeds') itemsList = seedsData;
    else if (category === 'feed') itemsList = feedItems;

    let currentCap = 0, maxCap = 0;
    if (category === 'animals') {
        let userFarmRes;
        try { userFarmRes = await executeDB(db, `SELECT "animalID", "quantity" FROM user_farm WHERE "userID" = $1 AND "guildID" = $2`, [user.id, user.guildId || '']); }
        catch(e) { userFarmRes = await executeDB(db, `SELECT animalid, quantity FROM user_farm WHERE userid = $1 AND guildid = $2`, [user.id, user.guildId || '']).catch(()=>({rows:[]})); }
        
        maxCap = await getPlayerCapacity(client, user.id, user.guildId || '');
        for (const row of userFarmRes.rows) {
            const fa = farmAnimals.find(a => String(a.id) === String(row.animalID || row.animalid));
            if (fa) currentCap += (fa.size || 1) * (Number(row.quantity || row.Quantity) || 1);
        }
    }

    const buffer = await drawFarmShopGrid(itemsList, category, maxCap, currentCap);
    const attachment = buffer ? new AttachmentBuilder(buffer, { name: 'farm_shop.png' }) : null;

    const categoryRow = new ActionRowBuilder();

    if (category !== 'animals') {
        categoryRow.addComponents(new ButtonBuilder().setCustomId('shop_cat_animals').setLabel('حيوانات').setStyle(ButtonStyle.Secondary).setEmoji('🐄'));
    }
    if (category !== 'seeds') {
        categoryRow.addComponents(new ButtonBuilder().setCustomId('shop_cat_seeds').setLabel('بذور').setStyle(ButtonStyle.Secondary).setEmoji('🌱'));
    }
    if (category !== 'feed') {
        categoryRow.addComponents(new ButtonBuilder().setCustomId('shop_cat_feed').setLabel('أعلاف').setStyle(ButtonStyle.Secondary).setEmoji('🌾'));
    }

    categoryRow.addComponents(new ButtonBuilder().setCustomId('nav_land').setEmoji('↩️').setStyle(ButtonStyle.Danger));

    const selectOptions = itemsList.map(item => ({
        label: item.name,
        description: `السعر: ${item.price} مورا`,
        value: `farm_select_item|${category}|${item.id}`,
        emoji: item.emoji || '📦'
    }));

    const selectMenuRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('farm_select_item')
            .setPlaceholder('🔻 حدد عنصراً للشراء أو البيع...')
            .addOptions(selectOptions)
    );

    const payload = { content: '', components: [categoryRow, selectMenuRow], embeds: [] };
    if (attachment) payload.files = [attachment];

    return payload;
}

async function getShopMenu(user, client, db) {
    return await buildShopGrid(user, client, db, 'animals');
}

async function buildDetailView(item, userId, guildId, db, category, client) {
    let userQuantity = 0;
    let isFull = false;
    let maxCap = 0;
    let currentCap = 0;

    if (category === 'animals') {
        let userFarmRes;
        try { userFarmRes = await executeDB(db, `SELECT "animalID", "quantity" FROM user_farm WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId]); }
        catch(e) { userFarmRes = await executeDB(db, `SELECT animalid, quantity FROM user_farm WHERE userid = $1 AND guildid = $2`, [userId, guildId]).catch(()=>({rows:[]})); }

        maxCap = await getPlayerCapacity(client, userId, guildId);
        for (const row of userFarmRes.rows) {
            if (String(row.animalID || row.animalid) === String(item.id)) {
                userQuantity += Number(row.quantity || row.Quantity) || 0;
            }
            const fa = farmAnimals.find(a => String(a.id) === String(row.animalID || row.animalid));
            if (fa) currentCap += (fa.size || 1) * (Number(row.quantity || row.Quantity) || 1);
        }
        isFull = (currentCap + (item.size || 1)) > maxCap;
    } else {
        let invCheckRes;
        try { invCheckRes = await executeDB(db, `SELECT "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [userId, guildId, item.id]); }
        catch(e) { invCheckRes = await executeDB(db, `SELECT quantity FROM user_inventory WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [userId, guildId, item.id]).catch(()=>({rows:[]})); }

        userQuantity = invCheckRes?.rows?.[0] ? Number(invCheckRes.rows[0].quantity || invCheckRes.rows[0].Quantity) : 0;
        isFull = userQuantity >= MAX_FARM_LIMIT;
    }

    const buffer = await drawFarmShopDetail(item, category, userQuantity, maxCap, currentCap);
    const attachment = buffer ? new AttachmentBuilder(buffer, { name: 'farm_shop_detail.png' }) : null;

    const actionRow1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`buy_btn_farm|${category}|${item.id}`)
            .setLabel(isFull ? 'الحد الأقصى للسعة' : 'شراء 🛒')
            .setStyle(isFull ? ButtonStyle.Secondary : ButtonStyle.Success)
            .setDisabled(isFull), 
            
        new ButtonBuilder()
            .setCustomId(`sell_btn_farm|${category}|${item.id}`)
            .setLabel(`بيع (نصف السعر) 💰`)
            .setStyle(ButtonStyle.Danger)
            .setDisabled(userQuantity === 0)
    );

    const actionRow2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('farm_shop_back').setLabel('العودة للمتجر').setStyle(ButtonStyle.Secondary).setEmoji('↩️')
    );

    const payload = { content: '', components: [actionRow1, actionRow2], embeds: [] };
    if (attachment) payload.files = [attachment];

    return payload;
}

async function handleShopInteraction(i, client, db, user, guild, shopState) {
    if (i.customId.startsWith('shop_cat_')) {
        await i.deferUpdate().catch(()=>{});
        const category = i.customId.replace('shop_cat_', '');
        shopState.currentCategory = category;

        user.guildId = guild.id; 
        const data = await buildShopGrid(user, client, db, category);
        return await i.editReply({ files: data.files || [], embeds: [], components: data.components, content: data.content }).catch(()=>{});
    }

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
        return await i.editReply({ files: data.files || [], embeds: [], components: data.components, content: data.content }).catch(()=>{});
    }

    if (i.customId === 'farm_shop_back') {
        await i.deferUpdate().catch(()=>{});
        const data = await buildShopGrid(user, client, db, shopState.currentCategory || 'animals');
        return await i.editReply({ files: data.files || [], embeds: [], components: data.components, content: data.content }).catch(()=>{});
    }

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
        await i.deferReply({ flags: [MessageFlags.Ephemeral] }); 
        
        const action = i.customId.startsWith('farm_buy_') ? 'buy' : 'sell';
        const [_, category, itemId] = i.customId.split('|');
        const qtyStr = i.fields.getTextInputValue('quantity_input').trim();
        const quantity = parseInt(qtyStr);

        if (isNaN(quantity) || quantity <= 0) return await i.editReply('❌ يرجى إدخال كمية صحيحة.');

        let itemData = null;
        if (category === 'animals') itemData = farmAnimals.find(a => String(a.id) === String(itemId));
        else if (category === 'seeds') itemData = seedsData.find(s => String(s.id) === String(itemId));
        else if (category === 'feed') itemData = feedItems.find(f => String(f.id) === String(itemId));

        if (!itemData) return await i.editReply('❌ العنصر غير موجود!');

        if (action === 'buy') {
            const totalPrice = itemData.price * quantity;

            let moraRes;
            try { moraRes = await executeDB(db, `SELECT "mora", "bank" FROM levels WHERE "user" = $1 AND "guild" = $2`, [i.user.id, i.guild.id]); }
            catch(e) { moraRes = await executeDB(db, `SELECT mora, bank FROM levels WHERE userid = $1 AND guildid = $2`, [i.user.id, i.guild.id]).catch(()=>({rows:[]})); }

            let currentMora = Number(moraRes?.rows?.[0]?.mora || moraRes?.rows?.[0]?.Mora || 0);
            let currentBank = Number(moraRes?.rows?.[0]?.bank || moraRes?.rows?.[0]?.Bank || 0);

            if ((currentMora + currentBank) < totalPrice) {
                return await i.editReply(`❌ رصيدك (الكاش + البنك) غير كافي! تحتاج إجمالي **${totalPrice.toLocaleString()}** مورا.`);
            }

            if (category === 'animals') {
                let farmRes;
                try { farmRes = await executeDB(db, `SELECT "animalID", "quantity" FROM user_farm WHERE "userID" = $1 AND "guildID" = $2`, [i.user.id, i.guild.id]); }
                catch(e) { farmRes = await executeDB(db, `SELECT animalid, quantity FROM user_farm WHERE userid = $1 AND guildid = $2`, [i.user.id, i.guild.id]).catch(()=>({rows:[]})); }

                let currentCap = 0;
                for (const row of farmRes.rows) {
                    const fa = farmAnimals.find(a => String(a.id) === String(row.animalID || row.animalid));
                    if (fa) currentCap += (fa.size || 1) * (Number(row.quantity || row.Quantity) || 1);
                }
                const cap = await getPlayerCapacity(client, i.user.id, i.guild.id);
                const spaceNeeded = quantity * (itemData.size || 1);

                if (currentCap + spaceNeeded > cap) {
                    return await i.editReply(`🚫 **مساحة الحظيرة لا تكفي!**\nتحتاج \`${spaceNeeded}\` مساحة، والمتاح لديك \`${cap - currentCap}\` فقط.`);
                }
            } else {
                let invCheckRes;
                try { invCheckRes = await executeDB(db, `SELECT "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [i.user.id, i.guild.id, itemData.id]); }
                catch(e) { invCheckRes = await executeDB(db, `SELECT quantity FROM user_inventory WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [i.user.id, i.guild.id, itemData.id]).catch(()=>({rows:[]})); }
                
                let currQty = invCheckRes?.rows?.[0] ? Number(invCheckRes.rows[0].quantity || invCheckRes.rows[0].Quantity || 0) : 0;

                if (currQty + quantity > MAX_FARM_LIMIT) {
                    return await i.editReply(`🚫 **مخزنك ممتلئ!** الحد الأقصى هو **${MAX_FARM_LIMIT}**.`);
                }
            }

            if (currentMora >= totalPrice) {
                currentMora -= totalPrice;
            } else {
                let remainder = totalPrice - currentMora;
                currentMora = 0;
                currentBank -= remainder;
            }

            try {
                await executeDB(db, `UPDATE levels SET "mora" = $1, "bank" = $2 WHERE "user" = $3 AND "guild" = $4`, [currentMora, currentBank, i.user.id, i.guild.id]);
            } catch(e) {
                try { await executeDB(db, `UPDATE levels SET mora = $1, bank = $2 WHERE userid = $3 AND guildid = $4`, [currentMora, currentBank, i.user.id, i.guild.id]); }
                catch(e2) { return await i.editReply('❌ حدث خطأ داخلي أثناء تحديث الرصيد.'); }
            }

            try {
                if (category === 'animals') {
                    let farmCheck;
                    try { farmCheck = await executeDB(db, `SELECT "id", "quantity" FROM user_farm WHERE "userID" = $1 AND "guildID" = $2 AND "animalID" = $3`, [i.user.id, i.guild.id, itemData.id]); }
                    catch(e) { farmCheck = await executeDB(db, `SELECT id, quantity FROM user_farm WHERE userid = $1 AND guildid = $2 AND animalid = $3`, [i.user.id, i.guild.id, itemData.id]).catch(()=>({rows:[]})); }

                    if (farmCheck?.rows?.[0]) {
                        try { await executeDB(db, `UPDATE user_farm SET "quantity" = "quantity" + $1 WHERE "id" = $2`, [quantity, farmCheck.rows[0].id || farmCheck.rows[0].ID]); }
                        catch(e) { await executeDB(db, `UPDATE user_farm SET quantity = quantity + $1 WHERE id = $2`, [quantity, farmCheck.rows[0].id || farmCheck.rows[0].ID]); }
                    } else {
                        try { await executeDB(db, `INSERT INTO user_farm ("guildID", "userID", "animalID", "purchaseTimestamp", "lastCollected", "quantity", "lastFedTimestamp") VALUES ($1, $2, $3, $4, 0, $5, $4)`, [i.guild.id, i.user.id, itemData.id, Date.now(), quantity]); }
                        catch(e) { await executeDB(db, `INSERT INTO user_farm (guildid, userid, animalid, purchasetimestamp, lastcollected, quantity, lastfedtimestamp) VALUES ($1, $2, $3, $4, 0, $5, $4)`, [i.guild.id, i.user.id, itemData.id, Date.now(), quantity]); }
                    }
                } else {
                    let invCheckRes;
                    try { invCheckRes = await executeDB(db, `SELECT "id", "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [i.user.id, i.guild.id, itemData.id]); }
                    catch(e) { invCheckRes = await executeDB(db, `SELECT id, quantity FROM user_inventory WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [i.user.id, i.guild.id, itemData.id]).catch(()=>({rows:[]})); }

                    if (invCheckRes?.rows?.[0]) {
                        try { await executeDB(db, `UPDATE user_inventory SET "quantity" = "quantity" + $1 WHERE "id" = $2`, [quantity, invCheckRes.rows[0].id || invCheckRes.rows[0].ID]); }
                        catch(e) { await executeDB(db, `UPDATE user_inventory SET quantity = quantity + $1 WHERE id = $2`, [quantity, invCheckRes.rows[0].id || invCheckRes.rows[0].ID]); }
                    } else {
                        try { await executeDB(db, `INSERT INTO user_inventory ("guildID", "userID", "itemID", "quantity") VALUES ($1, $2, $3, $4)`, [i.guild.id, i.user.id, itemData.id, quantity]); }
                        catch(e) { await executeDB(db, `INSERT INTO user_inventory (guildid, userid, itemid, quantity) VALUES ($1, $2, $3, $4)`, [i.guild.id, i.user.id, itemData.id, quantity]); }
                    }
                }
            } catch (insertError) {
                try { await executeDB(db, `UPDATE levels SET "mora" = "mora" + $1 WHERE "user" = $2 AND "guild" = $3`, [totalPrice, i.user.id, i.guild.id]); }
                catch(e) { await executeDB(db, `UPDATE levels SET mora = mora + $1 WHERE userid = $2 AND guildid = $3`, [totalPrice, i.user.id, i.guild.id]); }
                return await i.editReply('❌ حدث خطأ داخلي أثناء تسليم العنصر، تم إرجاع أموالك.');
            }

            await i.editReply(`✅ اشتريت **${quantity.toLocaleString()}x ${itemData.name}** بنجاح!\nالتكلفة: ${totalPrice.toLocaleString()} مورا`);

        } else if (action === 'sell') {
            const sellPrice = Math.floor(itemData.price * 0.5); 
            const totalGain = sellPrice * quantity;

            try {
                if (category === 'animals') {
                    let farmRes;
                    try { farmRes = await executeDB(db, `SELECT "id", "quantity" FROM user_farm WHERE "userID" = $1 AND "guildID" = $2 AND "animalID" = $3 ORDER BY "purchaseTimestamp" ASC`, [i.user.id, i.guild.id, itemData.id]); }
                    catch(e) { farmRes = await executeDB(db, `SELECT id, quantity FROM user_farm WHERE userid = $1 AND guildid = $2 AND animalid = $3 ORDER BY purchasetimestamp ASC`, [i.user.id, i.guild.id, itemData.id]).catch(()=>({rows:[]})); }
                    
                    let totalOwned = 0;
                    farmRes.rows.forEach(row => totalOwned += Number(row.quantity || row.Quantity || 0));
                    
                    if (totalOwned < quantity) {
                        return await i.editReply(`❌ لا تملك هذه الكمية للبيع! (تمتلك ${totalOwned})`);
                    }

                    let remainingToSell = quantity;
                    for (const row of farmRes.rows) {
                        if (remainingToSell <= 0) break;
                        const qtyInRow = Number(row.quantity || row.Quantity || 0);
                        const sellFromRow = Math.min(qtyInRow, remainingToSell);
                        remainingToSell -= sellFromRow;

                        if (qtyInRow === sellFromRow) {
                            try { await executeDB(db, `DELETE FROM user_farm WHERE "id" = $1`, [row.id || row.ID]); }
                            catch(e) { await executeDB(db, `DELETE FROM user_farm WHERE id = $1`, [row.id || row.ID]); }
                        } else {
                            try { await executeDB(db, `UPDATE user_farm SET "quantity" = "quantity" - $1 WHERE "id" = $2`, [sellFromRow, row.id || row.ID]); }
                            catch(e) { await executeDB(db, `UPDATE user_farm SET quantity = quantity - $1 WHERE id = $2`, [sellFromRow, row.id || row.ID]); }
                        }
                    }
                } else {
                    let invCheckRes;
                    try { invCheckRes = await executeDB(db, `SELECT "id", "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [i.user.id, i.guild.id, itemData.id]); }
                    catch(e) { invCheckRes = await executeDB(db, `SELECT id, quantity FROM user_inventory WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [i.user.id, i.guild.id, itemData.id]).catch(()=>({rows:[]})); }
                    
                    let currQty = invCheckRes?.rows?.[0] ? Number(invCheckRes.rows[0].quantity || invCheckRes.rows[0].Quantity || 0) : 0;
                    
                    if (currQty < quantity) {
                        return await i.editReply(`❌ لا تملك هذه الكمية للبيع!`);
                    }

                    if (currQty === quantity) {
                        try { await executeDB(db, `DELETE FROM user_inventory WHERE "id" = $1`, [invCheckRes.rows[0].id || invCheckRes.rows[0].ID]); }
                        catch(e) { await executeDB(db, `DELETE FROM user_inventory WHERE id = $1`, [invCheckRes.rows[0].id || invCheckRes.rows[0].ID]); }
                    } else {
                        try { await executeDB(db, `UPDATE user_inventory SET "quantity" = "quantity" - $1 WHERE "id" = $2`, [quantity, invCheckRes.rows[0].id || invCheckRes.rows[0].ID]); }
                        catch(e) { await executeDB(db, `UPDATE user_inventory SET quantity = quantity - $1 WHERE id = $2`, [quantity, invCheckRes.rows[0].id || invCheckRes.rows[0].ID]); }
                    }
                }

                try {
                    try { await executeDB(db, `UPDATE levels SET "mora" = "mora" + $1 WHERE "user" = $2 AND "guild" = $3`, [totalGain, i.user.id, i.guild.id]); }
                    catch(e) { await executeDB(db, `UPDATE levels SET mora = mora + $1 WHERE userid = $2 AND guildid = $3`, [totalGain, i.user.id, i.guild.id]); }
                } catch (moneyError) {
                    return await i.editReply('❌ حدث خطأ داخلي أثناء إضافة الأموال.');
                }
                
                const sellEmbed = new EmbedBuilder()
                    .setTitle('📈 عملية بيع زراعية')
                    .setColor(Colors.Blue)
                    .setDescription(`📦 **الكمية المباعة:** ${quantity.toLocaleString()}x ${itemData.name}\n💰 **الأرباح:** ${totalGain.toLocaleString()} مورا (نصف السعر)`);
                
                await i.editReply({ content: `<@${i.user.id}>`, embeds: [sellEmbed] });

            } catch (sellError) {
                return await i.editReply('❌ حدث خطأ داخلي أثناء إزالة العنصر، لم يتم البيع.');
            }
        }

        if (i.message) {
            buildDetailView(itemData, i.user.id, i.guild.id, db, category, client).then(newData => {
                i.message.edit({ files: newData.files || [], components: newData.components, embeds: [], content: newData.content || '' }).catch(()=>{});
            });
        }
        return true;

    } catch (e) {
        return false;
    }
}

module.exports = {
    getShopMenu, 
    buildMainMenu: getShopMenu, 
    handleShopInteraction,
    handleFarmShopModal
};
