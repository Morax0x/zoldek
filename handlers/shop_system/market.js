const { EmbedBuilder, Colors, MessageFlags } = require("discord.js");
const marketItemsConfig = require('../../json/market-items.json');

let EMOJI_MORA = '🪙'; 
try {
    const utils = require('./utils');
    if (utils.EMOJI_MORA) EMOJI_MORA = utils.EMOJI_MORA;
} catch (e) {}

const MARKET_VOLATILITY = 0.05; 

// 🔥 قفل العمليات لمنع الدبل كليك ونسخ الأموال 🔥
const marketTransactionLocks = new Set();

function calculateSlippage(basePrice, quantity, isBuy) {
    const slippageFactor = 0.0001; 
    const impact = quantity * slippageFactor;
    let avgPrice = isBuy ? basePrice * (1 + (impact / 2)) : basePrice * (1 - (impact / 2));
    return Math.max(Math.floor(avgPrice), 1);
}

async function updateMarketPrices(db) {
    if (!db) return;
    try {
        let allItemsRes;
        try { allItemsRes = await db.query(`SELECT * FROM market_items`); }
        catch (e) { return; } // في حال لم يتم إنشاء الجدول بعد
        
        const allItems = allItemsRes.rows;
        if (allItems.length === 0) return;
        
        const SATURATION_POINT = 2000; 
        const MIN_PRICE = 10; 
        const MAX_PRICE = 50000;             
        
        for (const item of allItems) {
            let resultRes;
            try { resultRes = await db.query(`SELECT SUM("quantity") as total FROM user_portfolio WHERE "itemID" = $1`, [item.id]); }
            catch(e) { resultRes = await db.query(`SELECT SUM(quantity) as total FROM user_portfolio WHERE itemid = $1`, [item.id]).catch(()=>({rows:[{total: 0}]})); }
            
            const totalOwned = Number(resultRes.rows[0].total) || 0;
            
            let randomPercent = (Math.random() * 0.20) - 0.10; 
            const saturationPenalty = (totalOwned / SATURATION_POINT) * 0.02;
            let finalChangePercent = randomPercent - saturationPenalty;
            
            if (Number(item.currentPrice || item.currentprice) > 5000 && finalChangePercent > 0) finalChangePercent /= 2; 
            if (finalChangePercent < -0.30) finalChangePercent = -0.30;
            
            const oldPrice = Number(item.currentPrice || item.currentprice);
            let newPrice = Math.floor(oldPrice * (1 + finalChangePercent));
            if (newPrice < MIN_PRICE) newPrice = MIN_PRICE;
            if (newPrice > MAX_PRICE) newPrice = MAX_PRICE;
            
            const changeAmount = newPrice - oldPrice;
            const displayPercent = oldPrice > 0 ? ((changeAmount / oldPrice) * 100).toFixed(2) : 0;
            
            try { await db.query(`UPDATE market_items SET "currentPrice" = $1, "lastChangePercent" = $2, "lastChange" = $3 WHERE "id" = $4`, [newPrice, displayPercent, changeAmount, item.id]); }
            catch(e) { await db.query(`UPDATE market_items SET currentprice = $1, lastchangepercent = $2, lastchange = $3 WHERE id = $4`, [newPrice, displayPercent, changeAmount, item.id]).catch(()=>{}); }
        }
    } catch (err) { 
        console.error("[Market System] Error updating prices:", err.message); 
    }
}

async function _handleMarketTransaction(i, client, db, isBuy) {
    // 🔥 التحقق من القفل قبل كل شيء لتجنب الدبل كليك 🔥
    if (marketTransactionLocks.has(i.user.id)) {
        if (!i.replied && !i.deferred) await i.reply({ content: "⏳ يرجى الانتظار، معاملتك السابقة قيد التنفيذ...", flags: MessageFlags.Ephemeral }).catch(()=>{});
        return;
    }
    marketTransactionLocks.add(i.user.id);

    try {
        await i.deferReply(); 
        console.log(`\n--- [MARKET DEBUG] بدأ ${i.user.username} عملية ${isBuy ? 'شراء' : 'بيع'} ---`);
        
        const quantityString = i.fields.getTextInputValue('quantity_input');
        const quantity = parseInt(quantityString.trim().replace(/,/g, ''));
        
        if (isNaN(quantity) || quantity <= 0) return await i.editReply('❌ كمية غير صالحة.');

        const assetId = i.customId.replace(isBuy ? 'buy_modal_' : 'sell_modal_', '');
        
        if (isBuy && client.marketLocks && client.marketLocks.has(assetId)) {
            return await i.editReply({ content: `🚫 **السهم في حالة انهيار وإعادة هيكلة!**\nيرجى الانتظار قليلاً حتى يتم طرحه بالسعر الجديد.` });
        }

        let itemRes;
        try { itemRes = await db.query(`SELECT * FROM market_items WHERE "id" = $1`, [assetId]); }
        catch(e) { itemRes = await db.query(`SELECT * FROM market_items WHERE id = $1`, [assetId]).catch(()=>({rows:[]})); }
        
        const item = itemRes.rows[0];
        if (!item) return await i.editReply('❌ الأصل غير موجود.');

        // جلب الرصيد الحالي من الداتا بيز مباشرة للتحقق
        let dbUserRes;
        try { dbUserRes = await db.query(`SELECT "mora", "bank" FROM levels WHERE "user" = $1 AND "guild" = $2`, [i.user.id, i.guild.id]); }
        catch(e) { dbUserRes = await db.query(`SELECT mora, bank FROM levels WHERE userid = $1 AND guildid = $2`, [i.user.id, i.guild.id]).catch(()=>({rows:[]})); }
        
        let dbUser = dbUserRes.rows[0];
        if (!dbUser) {
            try { await db.query(`INSERT INTO levels ("user", "guild", "mora", "bank", "level", "xp", "totalXP") VALUES ($1, $2, 0, 0, 1, 0, 0)`, [i.user.id, i.guild.id]); }
            catch(e) { await db.query(`INSERT INTO levels (userid, guildid, mora, bank, level, xp, totalxp) VALUES ($1, $2, 0, 0, 1, 0, 0)`, [i.user.id, i.guild.id]).catch(()=>{}); }
            dbUser = { mora: 0, bank: 0 };
        }
        
        let userMora = Number(dbUser.mora || dbUser.mora) || 0;
        let pfItemRes;
        try { pfItemRes = await db.query(`SELECT * FROM user_portfolio WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [i.user.id, i.guild.id, item.id]); }
        catch(e) { pfItemRes = await db.query(`SELECT * FROM user_portfolio WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [i.user.id, i.guild.id, item.id]).catch(()=>({rows:[]})); }
        let pfItem = pfItemRes.rows[0];
        
        if (isBuy) {
            const avgPrice = calculateSlippage(Number(item.currentPrice || item.currentprice), quantity, true);
            const totalCost = Math.floor(avgPrice * quantity);
            
            console.log(`[MARKET DEBUG] التكلفة المطلوبة: ${totalCost} | رصيد اللاعب: ${userMora}`);
            
            if (userMora < totalCost) return await i.editReply(`❌ **رصيدك غير كافي!** تحتاج: **${totalCost.toLocaleString()}** 🪙`);
            
            // 🔥 التحديث الذري الآمن (يخصم ويرد القيمة الدقيقة فورا)
            let updateRes;
            try { updateRes = await db.query(`UPDATE levels SET "mora" = "mora" - $1 WHERE "user" = $2 AND "guild" = $3 RETURNING "mora"`, [totalCost, i.user.id, i.guild.id]); }
            catch(e) { updateRes = await db.query(`UPDATE levels SET mora = mora - $1 WHERE userid = $2 AND guildid = $3 RETURNING mora`, [totalCost, i.user.id, i.guild.id]).catch(()=>({rows:[{mora: userMora - totalCost}]})); }
            
            const exactNewMora = updateRes.rows[0] ? updateRes.rows[0].mora : (userMora - totalCost);
            console.log(`[MARKET DEBUG] ✅ تم الخصم بنجاح. الرصيد الجديد في الداتابيز: ${exactNewMora}`);

            if (pfItem) {
                try { await db.query(`UPDATE user_portfolio SET "quantity" = "quantity" + $1 WHERE "id" = $2`, [quantity, pfItem.id]); }
                catch(e) { await db.query(`UPDATE user_portfolio SET quantity = quantity + $1 WHERE id = $2`, [quantity, pfItem.id]).catch(()=>{}); }
            } else {
                try { await db.query(`INSERT INTO user_portfolio ("guildID", "userID", "itemID", "quantity", "purchasePrice") VALUES ($1, $2, $3, $4, $5)`, [i.guild.id, i.user.id, item.id, quantity, avgPrice]); }
                catch(e) { await db.query(`INSERT INTO user_portfolio (guildid, userid, itemid, quantity, purchaseprice) VALUES ($1, $2, $3, $4, $5)`, [i.guild.id, i.user.id, item.id, quantity, avgPrice]).catch(()=>{}); }
            }
            
            // إجبار كاش البوت على احترام الداتابيز
            if (client.getLevel && client.setLevel) {
                let cacheData = await client.getLevel(i.user.id, i.guild.id);
                if (cacheData) { cacheData.mora = Number(exactNewMora); await client.setLevel(cacheData); }
            }

            const embed = new EmbedBuilder().setTitle('✅ تمت عملية الشراء').setColor(Colors.Green).setDescription(`📦 اشتريت: **${quantity.toLocaleString()}** من **${item.name}**\n💵 التكلفة: **${totalCost.toLocaleString()}** ${EMOJI_MORA}`);
            await i.editReply("✅ تم تحديث الرصيد وإرسال الفاتورة.");
            return await i.channel.send({ content: `<@${i.user.id}>`, embeds: [embed] });

        } else {
            const userQty = pfItem ? Number(pfItem.quantity) : 0;
            if (userQty < quantity) return await i.editReply(`❌ لا تملك هذه الكمية (لديك: **${userQty.toLocaleString()}**).`);
            
            const avgPrice = calculateSlippage(Number(item.currentPrice || item.currentprice), quantity, false);
            const totalGain = Math.floor(avgPrice * quantity);
            
            if (userQty - quantity > 0) {
                try { await db.query(`UPDATE user_portfolio SET "quantity" = "quantity" - $1 WHERE "id" = $2`, [quantity, pfItem.id]); }
                catch(e) { await db.query(`UPDATE user_portfolio SET quantity = quantity - $1 WHERE id = $2`, [quantity, pfItem.id]).catch(()=>{}); }
            } else {
                try { await db.query(`DELETE FROM user_portfolio WHERE "id" = $1`, [pfItem.id]); }
                catch(e) { await db.query(`DELETE FROM user_portfolio WHERE id = $1`, [pfItem.id]).catch(()=>{}); }
            }

            // 🔥 التحديث الذري الآمن للبيع
            let updateRes;
            try { updateRes = await db.query(`UPDATE levels SET "mora" = "mora" + $1 WHERE "user" = $2 AND "guild" = $3 RETURNING "mora"`, [totalGain, i.user.id, i.guild.id]); }
            catch(e) { updateRes = await db.query(`UPDATE levels SET mora = mora + $1 WHERE userid = $2 AND guildid = $3 RETURNING mora`, [totalGain, i.user.id, i.guild.id]).catch(()=>({rows:[{mora: userMora + totalGain}]})); }
            
            const exactNewMora = updateRes.rows[0] ? updateRes.rows[0].mora : (userMora + totalGain);
            console.log(`[MARKET DEBUG] ✅ تم البيع وإضافة الأرباح. الرصيد الجديد: ${exactNewMora}`);

            // إجبار الكاش
            if (client.getLevel && client.setLevel) {
                let cacheData = await client.getLevel(i.user.id, i.guild.id);
                if (cacheData) { cacheData.mora = Number(exactNewMora); await client.setLevel(cacheData); }
            }
            
            const embed = new EmbedBuilder().setTitle('📈 تمت عملية البيع').setColor(Colors.Blue).setDescription(`📦 بعت: **${quantity.toLocaleString()}** من **${item.name}**\n💰 الأرباح: **${totalGain.toLocaleString()}** ${EMOJI_MORA}`);
            await i.editReply("✅ تم البيع بنجاح.");
            return await i.channel.send({ content: `<@${i.user.id}>`, embeds: [embed] });
        }

    } catch (e) { 
        console.error("[MARKET FATAL ERROR]:", e); 
        await i.editReply("❌ تعطلت قاعدة البيانات أثناء معالجة الطلب.").catch(()=>{}); 
    } finally {
        // 🔥 فتح القفل بعد انتهاء كل شيء 🔥
        marketTransactionLocks.delete(i.user.id);
    }
}

module.exports = { _handleMarketTransaction, updateMarketPrices, calculateSlippage };
