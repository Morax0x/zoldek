const { EmbedBuilder, Colors } = require("discord.js");
const farmAnimals = require('../json/farm-animals.json');

async function checkLoanPayments(client, db) {
    if (!db) return;

    const now = Date.now();
    const ONE_DAY = 24 * 60 * 60 * 1000;

    let activeLoansRes;
    try {
        activeLoansRes = await db.query(`SELECT * FROM user_loans WHERE "remainingAmount" > 0 AND ("lastPaymentDate" + $1) <= $2`, [ONE_DAY, now]);
    } catch(e) {
        activeLoansRes = await db.query(`SELECT * FROM user_loans WHERE remainingamount > 0 AND (lastpaymentdate + $1) <= $2`, [ONE_DAY, now]).catch(()=>({rows:[]}));
    }
    
    const activeLoans = activeLoansRes.rows;

    if (activeLoans.length === 0) return;

    for (let loan of activeLoans) {
        try {
            const guild = client.guilds.cache.get(loan.guildID || loan.guildid);
            if (!guild) continue;

            let userDataRes;
            try { userDataRes = await db.query(`SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2`, [loan.userID || loan.userid, loan.guildID || loan.guildid]); }
            catch(e) { userDataRes = await db.query(`SELECT * FROM levels WHERE userid = $1 AND guildid = $2`, [loan.userID || loan.userid, loan.guildID || loan.guildid]).catch(()=>({rows:[]})); }
            
            let userData = userDataRes.rows[0];
            if (!userData) continue; 

            const member = await guild.members.fetch(loan.userID || loan.userid).catch(() => null);

            const dailyPay = Number(loan.dailyPayment || loan.dailypayment);
            let remainingAmount = Number(loan.remainingAmount || loan.remainingamount);

            const paymentAmount = Math.min(dailyPay, remainingAmount);
            let remainingToPay = paymentAmount; 
            let deductionDetails = ""; 
            
            const EMOJI_MORA = client.EMOJI_MORA || '<:mora:1435647151349698621>'; 

            userData.mora = Number(userData.mora) || 0;
            userData.bank = Number(userData.bank) || 0;
            userData.xp = Number(userData.xp) || 0;
            userData.level = Number(userData.level) || 1;

            if (remainingToPay > 0 && userData.mora > 0) {
                const takeMora = Math.min(userData.mora, remainingToPay);
                userData.mora -= takeMora;
                remainingToPay -= takeMora;
                
                if (takeMora > 0) {
                    deductionDetails += `💸 **خصم مورا:** تم استقطاع **${takeMora.toLocaleString()}** ${EMOJI_MORA}\n`;
                }
            }

            if (remainingToPay > 0 && userData.bank > 0) {
                const takeBank = Math.min(userData.bank, remainingToPay);
                userData.bank -= takeBank;
                remainingToPay -= takeBank;

                if (takeBank > 0) {
                     deductionDetails += `💳 **خصم بنكي:** تم سحب **${takeBank.toLocaleString()}** ${EMOJI_MORA}\n`;
                }
            }

            if (remainingToPay > 0) {
                 let portfolioRes;
                 try { portfolioRes = await db.query(`SELECT * FROM user_portfolio WHERE "userID" = $1 AND "guildID" = $2`, [loan.userID || loan.userid, loan.guildID || loan.guildid]); }
                 catch(e) { portfolioRes = await db.query(`SELECT * FROM user_portfolio WHERE userid = $1 AND guildid = $2`, [loan.userID || loan.userid, loan.guildID || loan.guildid]).catch(()=>({rows:[]})); }
                 
                 const portfolio = portfolioRes.rows;
                 
                 for (const item of portfolio) {
                     if (remainingToPay <= 0) break; 

                     let marketDataRes;
                     try { marketDataRes = await db.query(`SELECT "currentPrice", "name" FROM market_items WHERE "id" = $1`, [item.itemID || item.itemid]); }
                     catch(e) { marketDataRes = await db.query(`SELECT currentprice as "currentPrice", name FROM market_items WHERE id = $1`, [item.itemID || item.itemid]).catch(()=>({rows:[]})); }
                     
                     const marketData = marketDataRes.rows[0];
                     if (!marketData) continue; 

                     const price = Number(marketData.currentPrice || marketData.currentprice);
                     const neededQty = Math.ceil(remainingToPay / price);
                     const itemQty = Number(item.quantity);
                     const sellQty = Math.min(itemQty, neededQty);
                     const value = sellQty * price;
                     
                     if (sellQty >= itemQty) {
                         try { await db.query(`DELETE FROM user_portfolio WHERE "id" = $1`, [item.id]); }
                         catch(e) { await db.query(`DELETE FROM user_portfolio WHERE id = $1`, [item.id]).catch(()=>{}); }
                     } else {
                         try { await db.query(`UPDATE user_portfolio SET "quantity" = "quantity" - $1 WHERE "id" = $2`, [sellQty, item.id]); }
                         catch(e) { await db.query(`UPDATE user_portfolio SET quantity = quantity - $1 WHERE id = $2`, [sellQty, item.id]).catch(()=>{}); }
                     }
                     
                     if (value > remainingToPay) {
                         const change = value - remainingToPay;
                         userData.mora += change; 
                         remainingToPay = 0;
                     } else {
                         remainingToPay -= value;
                     }

                     deductionDetails += `📉 **تسييل أصول:** تم بيع **${sellQty}x ${marketData.name}**\n`;
                 }
            }

            if (remainingToPay > 0) {
                 let farmRes;
                 try { farmRes = await db.query(`SELECT * FROM user_farm WHERE "userID" = $1 AND "guildID" = $2`, [loan.userID || loan.userid, loan.guildID || loan.guildid]); }
                 catch(e) { farmRes = await db.query(`SELECT * FROM user_farm WHERE userid = $1 AND guildid = $2`, [loan.userID || loan.userid, loan.guildID || loan.guildid]).catch(()=>({rows:[]})); }
                 
                 const farm = farmRes.rows;
                 
                 for (const animalRow of farm) {
                     if (remainingToPay <= 0) break;

                     const animalData = farmAnimals.find(a => String(a.id) === String(animalRow.animalID || animalRow.animalid));
                     if (!animalData) continue;

                     const price = Number(animalData.price) || 0; 
                     
                     try { await db.query(`DELETE FROM user_farm WHERE "id" = $1`, [animalRow.id]); }
                     catch(e) { await db.query(`DELETE FROM user_farm WHERE id = $1`, [animalRow.id]).catch(()=>{}); }

                     if (price > remainingToPay) {
                         const change = price - remainingToPay;
                         userData.mora += change;
                         remainingToPay = 0;
                     } else {
                         remainingToPay -= price;
                     }

                     deductionDetails += `🚜 **بيع مزرعة:** تم مصادرة **${animalData.name}**\n`;
                 }
            }

            // 🔥 إصلاح العقوبة: تم تطبيقها بشكل صحيح بدون التسبب في انهيار الحفظ 🔥
            if (remainingToPay > 0) {
                const xpPenalty = Math.floor(remainingToPay * 2);
                
                if (userData.xp >= xpPenalty) {
                    userData.xp -= xpPenalty; 
                } else { 
                    userData.xp = 0; 
                    if (userData.level > 1) userData.level -= 1; 
                }
                
                deductionDetails += `⚠️ **عقوبة تعثر:** تم خصم **${xpPenalty.toLocaleString()}** XP لعدم كفاية الأصول\n`;
                // نعتبر أن القسط تم تسويته بالعقوبة
                remainingToPay = 0; 
            }

            // 🔥 التحديث النهائي لبيانات المستخدم بالكامل في الداتابيز 🔥
            try {
                await db.query(`UPDATE levels SET "mora" = $1, "bank" = $2, "xp" = $3, "level" = $4 WHERE "user" = $5 AND "guild" = $6`, [userData.mora, userData.bank, userData.xp, userData.level, loan.userID || loan.userid, loan.guildID || loan.guildid]);
            } catch(e) {
                await db.query(`UPDATE levels SET mora = $1, bank = $2, xp = $3, level = $4 WHERE userid = $5 AND guildid = $6`, [userData.mora, userData.bank, userData.xp, userData.level, loan.userID || loan.userid, loan.guildID || loan.guildid]).catch(()=>{});
            }
            
            // تحديث الذاكرة المخبئية للبوت إذا أمكن
            if (client.setLevel) await client.setLevel(userData);

            remainingAmount -= paymentAmount; 
            
            if (remainingAmount < 0) remainingAmount = 0;

            if (remainingAmount <= 0) {
                try { await db.query(`DELETE FROM user_loans WHERE "userID" = $1 AND "guildID" = $2`, [loan.userID || loan.userid, loan.guildID || loan.guildid]); }
                catch(e) { await db.query(`DELETE FROM user_loans WHERE userid = $1 AND guildid = $2`, [loan.userID || loan.userid, loan.guildID || loan.guildid]).catch(()=>{}); }
                deductionDetails += `\n🎉 **تم سداد القرض بالكامل!**`;
            } else {
                try { await db.query(`UPDATE user_loans SET "remainingAmount" = $1, "lastPaymentDate" = $2 WHERE "userID" = $3 AND "guildID" = $4`, [remainingAmount, now, loan.userID || loan.userid, loan.guildID || loan.guildid]); }
                catch(e) { await db.query(`UPDATE user_loans SET remainingamount = $1, lastpaymentdate = $2 WHERE userid = $3 AND guildid = $4`, [remainingAmount, now, loan.userID || loan.userid, loan.guildID || loan.guildid]).catch(()=>{}); }
            }

            if (!member) continue; 

            let settingsRes;
            try { settingsRes = await db.query(`SELECT "casinoChannelID" FROM settings WHERE "guild" = $1`, [guild.id]); }
            catch(e) { settingsRes = await db.query(`SELECT casinochannelid FROM settings WHERE guild = $1`, [guild.id]).catch(()=>({rows:[]})); }
            
            const settings = settingsRes.rows[0];
            
            if (settings && (settings.casinoChannelID || settings.casinochannelid)) {
                const channel = guild.channels.cache.get(settings.casinoChannelID || settings.casinochannelid);
                if (channel && deductionDetails) {
                    
                    const daysLeft = Math.ceil(remainingAmount / dailyPay);

                    const embed = new EmbedBuilder()
                        .setTitle(`❖ إشـعـار سـداد القـرض`)
                        .setColor(remainingToPay > 0 ? Colors.Red : Colors.Gold) 
                        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                        .setImage('https://i.postimg.cc/vmrBxCqF/download-(1).gif')
                        .setDescription(
                            `**📊 موقف القرض:**\n` +
                            `• المبلغ المستقطع: **${paymentAmount.toLocaleString()}** ${EMOJI_MORA}\n` +
                            `• المتبقي من الدين: **${remainingAmount.toLocaleString()}** ${EMOJI_MORA}\n` +
                            `• الأقساط المتبقية: **${daysLeft}** يوم تقريباً\n\n` +
                            `**🧾 تفاصيل العملية:**\n${deductionDetails}`
                        )
                        .setFooter({ text: "يتم الخصم تلقائياً كل 24 ساعة" })
                        .setTimestamp();

                    await channel.send({ content: `<@${loan.userID || loan.userid}>`, embeds: [embed] }).catch(() => {});
                    
                    await new Promise(r => setTimeout(r, 1000));
                }
            }

        } catch (err) {
            console.error(`[Loan Error] User: ${loan.userID || loan.userid}`, err);
        }
    }
}

module.exports = { checkLoanPayments };
