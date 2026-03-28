const { EmbedBuilder, Colors, MessageFlags } = require("discord.js");
const fs = require('fs');
const path = require('path');

let marketItemsConfig = [];
try {
    const configPath = path.join(process.cwd(), 'json', 'market-items.json');
    if (fs.existsSync(configPath)) {
        marketItemsConfig = require(configPath);
    }
} catch (e) {
    console.error("⚠️ [Market Handler] فشل في تحميل ملف market-items.json");
}

let EMOJI_MORA = '🪙'; 
try {
    const utilsPath = path.join(process.cwd(), 'utils.js');
    if (fs.existsSync(utilsPath)) {
        const utils = require(utilsPath);
        if (utils.EMOJI_MORA) EMOJI_MORA = utils.EMOJI_MORA;
    }
} catch (e) {}

function cleanItemName(name) {
    if (!name) return 'أصل استثماري';
    return name.replace(/<a?:.+?:\d+>/g, '').replace(/[\u{1F600}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F300}-\u{1F5FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FADF}\u{1F004}-\u{1F0CF}\u{2B00}-\u{2BFF}₿]/gu, '').trim();
}

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
        catch(e) {
            try { allItemsRes = { rows: db.prepare(`SELECT * FROM market_items`).all() }; } 
            catch(err) { return; } 
        }
        
        const allItems = allItemsRes.rows;
        if (!allItems || allItems.length === 0) return;
        
        const SATURATION_POINT = 2000; 
        const MIN_PRICE = 10; 
        const MAX_PRICE = 50000;             
        
        for (const item of allItems) {
            let resultRes;
            try { resultRes = await db.query(`SELECT SUM("quantity") as total FROM user_portfolio WHERE "itemID" = $1`, [item.id]); }
            catch(e) { 
                try { resultRes = await db.query(`SELECT SUM(quantity) as total FROM user_portfolio WHERE itemid = $1`, [item.id]); }
                catch(err) { resultRes = { rows: [{ total: 0 }] }; }
            }
            
            const totalOwned = Number(resultRes.rows[0]?.total || 0);
            
            let randomPercent = (Math.random() * 0.20) - 0.10; 
            const saturationPenalty = (totalOwned / SATURATION_POINT) * 0.02;
            let finalChangePercent = randomPercent - saturationPenalty;
            
            if (Number(item.currentPrice || item.currentprice || item.price) > 5000 && finalChangePercent > 0) finalChangePercent /= 2; 
            if (finalChangePercent < -0.30) finalChangePercent = -0.30;
            
            const oldPrice = Number(item.currentPrice || item.currentprice || item.price);
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
    try {
        const quantityString = i.fields.getTextInputValue('quantity_input');
        const quantity = parseInt(quantityString.trim().replace(/,/g, ''));
        
        if (isNaN(quantity) || quantity <= 0) {
            await i.reply({ content: '❌ الكمية المدخلة غير صالحة. الرجاء إدخال رقم صحيح.', flags: [MessageFlags.Ephemeral] });
            return false;
        }

        const assetId = i.customId.replace(isBuy ? 'buy_modal_' : 'sell_modal_', '');
        
        // 🚀 تسريع: طلب بيانات المستخدم والعنصر في نفس الوقت!
        const [itemRes, dbUserRes, pfItemRes] = await Promise.all([
            db.query(`SELECT * FROM market_items WHERE "id" = $1`, [assetId]).catch(() => db.query(`SELECT * FROM market_items WHERE id = $1`, [assetId]).catch(()=>({rows:[]}))),
            db.query(`SELECT "mora" FROM levels WHERE "user" = $1 AND "guild" = $2`, [i.user.id, i.guild.id]).catch(() => db.query(`SELECT mora FROM levels WHERE userid = $1 AND guildid = $2`, [i.user.id, i.guild.id]).catch(()=>({rows:[]}))),
            db.query(`SELECT * FROM user_portfolio WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [i.user.id, i.guild.id, assetId]).catch(() => db.query(`SELECT * FROM user_portfolio WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [i.user.id, i.guild.id, assetId]).catch(()=>({rows:[]})))
        ]);
        
        const item = itemRes.rows[0];
        if (!item) {
            await i.reply({ content: '❌ عذراً، هذا الأصل الاستثماري غير موجود في السوق.', flags: [MessageFlags.Ephemeral] });
            return false;
        }

        let dbUser = dbUserRes.rows[0];
        if (!dbUser && isBuy) {
            try { await db.query(`INSERT INTO levels ("user", "guild", "mora", "bank", "level", "xp", "totalXP") VALUES ($1, $2, 0, 0, 1, 0, 0)`, [i.user.id, i.guild.id]); }
            catch(e) { await db.query(`INSERT INTO levels (userid, guildid, mora, bank, level, xp, totalxp) VALUES ($1, $2, 0, 0, 1, 0, 0)`, [i.user.id, i.guild.id]).catch(()=>{}); }
            dbUser = { mora: 0 };
        }
        
        let userMora = Number(dbUser?.mora || dbUser?.Mora) || 0;
        let pfItem = pfItemRes.rows[0];
        const cleanItemNameStr = cleanItemName(item.name); 

        if (isBuy) {
            const avgPrice = calculateSlippage(Number(item.currentPrice || item.currentprice || item.price), quantity, true);
            const totalCost = Math.floor(avgPrice * quantity);
            
            if (userMora < totalCost) {
                await i.reply({ content: `❌ **رصيدك غير كافي!**\nتحتاج إلى: **${totalCost.toLocaleString()}** ${EMOJI_MORA}\nرصيدك الحالي: **${userMora.toLocaleString()}** ${EMOJI_MORA}`, flags: [MessageFlags.Ephemeral] });
                return false;
            }

            let exactNewMora;
            try {
                await db.query("BEGIN").catch(()=>{});
                
                let updateRes;
                try { updateRes = await db.query(`UPDATE levels SET "mora" = CAST("mora" AS BIGINT) - $1 WHERE "user" = $2 AND "guild" = $3 AND CAST("mora" AS BIGINT) >= $1 RETURNING "mora"`, [totalCost, i.user.id, i.guild.id]); }
                catch(e) { updateRes = await db.query(`UPDATE levels SET mora = CAST(mora AS BIGINT) - $1 WHERE userid = $2 AND guildid = $3 AND CAST(mora AS BIGINT) >= $1 RETURNING mora`, [totalCost, i.user.id, i.guild.id]); }
                
                if (!updateRes || !updateRes.rows || updateRes.rows.length === 0) {
                    await db.query("ROLLBACK").catch(()=>{});
                    await i.reply({ content: `❌ **رصيدك غير كافي!** تم إلغاء العملية لحماية حسابك.`, flags: [MessageFlags.Ephemeral] });
                    return false;
                }
                exactNewMora = updateRes.rows[0].mora;

                if (pfItem) {
                    try { await db.query(`UPDATE user_portfolio SET "quantity" = "quantity" + $1 WHERE "id" = $2`, [quantity, pfItem.id || pfItem.ID]); }
                    catch(e) { await db.query(`UPDATE user_portfolio SET quantity = quantity + $1 WHERE id = $2`, [quantity, pfItem.id || pfItem.ID]); }
                } else {
                    try { await db.query(`INSERT INTO user_portfolio ("guildID", "userID", "itemID", "quantity", "purchasePrice") VALUES ($1, $2, $3, $4, $5)`, [i.guild.id, i.user.id, item.id, quantity, avgPrice]); }
                    catch(e) { await db.query(`INSERT INTO user_portfolio (guildid, userid, itemid, quantity, purchaseprice) VALUES ($1, $2, $3, $4, $5)`, [i.guild.id, i.user.id, item.id, quantity, avgPrice]); }
                }
                
                await db.query("COMMIT").catch(()=>{});
            } catch (txErr) {
                await db.query("ROLLBACK").catch(()=>{});
                throw txErr;
            }
            
            if (client.getLevel && client.setLevel) {
                let cacheData = await client.getLevel(i.user.id, i.guild.id);
                if (cacheData) { cacheData.mora = Number(exactNewMora); await client.setLevel(cacheData); }
            }

            const embed = new EmbedBuilder()
                .setTitle('✅ تمت عملية الشراء بنجاح')
                .setColor(Colors.Green)
                .setDescription(`📦 الأسهم المشتراة: **${quantity.toLocaleString()}** سهم من **${cleanItemNameStr}**\n💵 التكلفة الإجمالية: **${totalCost.toLocaleString()}** ${EMOJI_MORA}`)
                .setFooter({ text: "سوق الاستثمارات الإمبراطوري" });
            
            // 🔥 هنا يتم الرد على المودال برسالة عامة في الشات
            await i.reply({ content: `<@${i.user.id}>`, embeds: [embed] }).catch(()=>{});
            return true;

        } else {
            const userQty = pfItem ? Number(pfItem.quantity || pfItem.Quantity) : 0;
            if (userQty < quantity) {
                await i.reply({ content: `❌ لا تملك هذه الكمية للبيع! (رصيدك الحالي: **${userQty.toLocaleString()}** سهم).`, flags: [MessageFlags.Ephemeral] });
                return false;
            }
            
            const avgPrice = calculateSlippage(Number(item.currentPrice || item.currentprice || item.price), quantity, false);
            const totalGain = Math.floor(avgPrice * quantity);

            let exactNewMora;
            try {
                await db.query("BEGIN").catch(()=>{});
                
                if (userQty - quantity > 0) {
                    try { await db.query(`UPDATE user_portfolio SET "quantity" = "quantity" - $1 WHERE "id" = $2`, [quantity, pfItem.id || pfItem.ID]); }
                    catch(e) { await db.query(`UPDATE user_portfolio SET quantity = quantity - $1 WHERE id = $2`, [quantity, pfItem.id || pfItem.ID]); }
                } else {
                    try { await db.query(`DELETE FROM user_portfolio WHERE "id" = $1`, [pfItem.id || pfItem.ID]); }
                    catch(e) { await db.query(`DELETE FROM user_portfolio WHERE id = $1`, [pfItem.id || pfItem.ID]); }
                }

                let updateRes;
                try { updateRes = await db.query(`UPDATE levels SET "mora" = CAST(COALESCE("mora", '0') AS BIGINT) + $1 WHERE "user" = $2 AND "guild" = $3 RETURNING "mora"`, [totalGain, i.user.id, i.guild.id]); }
                catch(e) { updateRes = await db.query(`UPDATE levels SET mora = CAST(COALESCE(mora, '0') AS BIGINT) + $1 WHERE userid = $2 AND guildid = $3 RETURNING mora`, [totalGain, i.user.id, i.guild.id]); }
                
                exactNewMora = updateRes.rows[0].mora;
                
                await db.query("COMMIT").catch(()=>{});
            } catch (txErr) {
                await db.query("ROLLBACK").catch(()=>{});
                throw txErr;
            }

            if (client.getLevel && client.setLevel) {
                let cacheData = await client.getLevel(i.user.id, i.guild.id);
                if (cacheData) { cacheData.mora = Number(exactNewMora); await client.setLevel(cacheData); }
            }
            
            const embed = new EmbedBuilder()
                .setTitle('📈 تمت عملية البيع بنجاح')
                .setColor(Colors.Blue)
                .setDescription(`📦 الأسهم المباعة: **${quantity.toLocaleString()}** سهم من **${cleanItemNameStr}**\n💰 الأرباح المستلمة: **${totalGain.toLocaleString()}** ${EMOJI_MORA}`)
                .setFooter({ text: "سوق الاستثمارات الإمبراطوري" });

            // 🔥 الرد المباشر
            await i.reply({ content: `<@${i.user.id}>`, embeds: [embed] }).catch(()=>{});
            return true;
        }

    } catch (e) { 
        console.error("[MARKET FATAL ERROR]:", e); 
        if (i.deferred || i.replied) {
            await i.editReply("❌ حدث خطأ غير متوقع أثناء معالجة الطلب في قاعدة البيانات.").catch(()=>{}); 
        } else {
            await i.reply({ content: "❌ حدث خطأ غير متوقع أثناء معالجة الطلب في قاعدة البيانات.", flags: [MessageFlags.Ephemeral] }).catch(()=>{});
        }
        return false;
    }
}

module.exports = { _handleMarketTransaction, updateMarketPrices, calculateSlippage };
