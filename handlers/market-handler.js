const { EmbedBuilder, Colors } = require("discord.js");

let EMOJI_MORA = '🪙'; 
try {
    const utils = require('../../utils'); // تأكد من مسار ملف utils
    if (utils && utils.EMOJI_MORA) EMOJI_MORA = utils.EMOJI_MORA;
} catch (e) {}

const CRASH_PRICE_TRIGGER = 10; 
const RESET_PRICE = 500; 
const MESSAGE_DELAY = 4000; 

// دالة لتنظيف الاسم من الإيموجيات لرسالة الإعلان
function cleanItemName(name) {
    if (!name) return 'أصل استثماري';
    return name.replace(/<a?:.+?:\d+>/g, '').replace(/[\u{1F600}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F300}-\u{1F5FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FADF}\u{1F004}-\u{1F0CF}\u{2B00}-\u{2BFF}₿]/gu, '').trim();
}

module.exports = async function handleMarketCrash(client, db, item) {
    if (!client.marketLocks) client.marketLocks = new Set();
    client.marketLocks.add(item.id);

    try {
        console.log(`[Market Crash] Stock ${item.id} crashed! Processing...`);

        // 🔥 تحديث سعر السهم المنهار وإعادة ضبطه
        try {
            await db.query(`UPDATE market_items SET "currentPrice" = $1, "lastChangePercent" = 0, "lastChange" = 0 WHERE "id" = $2`, [RESET_PRICE, item.id]);
        } catch(e) {
            await db.query(`UPDATE market_items SET currentprice = $1, lastchangepercent = 0, lastchange = 0 WHERE id = $2`, [RESET_PRICE, item.id]).catch(console.error);
        }

        // 🔥 جلب جميع المستثمرين في هذا السهم
        let investors = [];
        try {
            const investorsRes = await db.query(`SELECT "userID", "quantity" FROM user_portfolio WHERE "itemID" = $1`, [item.id]);
            investors = investorsRes.rows;
        } catch(e) {
            const investorsRes = await db.query(`SELECT userid, quantity FROM user_portfolio WHERE itemid = $1`, [item.id]).catch(()=>({rows:[]}));
            investors = investorsRes.rows;
        }

        if (investors.length === 0) {
            console.log(`[Market Crash] No investors found for ${item.id}.`);
            client.marketLocks.delete(item.id);
            return;
        }

        // 🔥 جلب قناة الكازينو لإرسال البيانات
        let settings;
        try {
            const settingsRes = await db.query(`SELECT "casinoChannelID" FROM settings WHERE "casinoChannelID" IS NOT NULL LIMIT 1`);
            settings = settingsRes.rows[0];
        } catch(e) {
            const settingsRes = await db.query(`SELECT casinochannelid FROM settings WHERE casinochannelid IS NOT NULL LIMIT 1`).catch(()=>({rows:[]}));
            settings = settingsRes.rows[0];
        }
        
        let channel = null;
        if (settings && (settings.casinoChannelID || settings.casinochannelid)) {
            channel = client.channels.cache.get(settings.casinoChannelID || settings.casinochannelid);
        }

        try {
            await db.query("BEGIN").catch(()=>{});
            for (const inv of investors) {
                const uID = inv.userID || inv.userid;
                const qty = Number(inv.quantity);
                const refundAmount = qty * CRASH_PRICE_TRIGGER; 
                
                // إرجاع التعويض
                try {
                    await db.query(`UPDATE levels SET "mora" = CAST("mora" AS BIGINT) + $1 WHERE "user" = $2`, [refundAmount, uID]);
                } catch(e) {
                    await db.query(`UPDATE levels SET mora = CAST(mora AS BIGINT) + $1 WHERE userid = $2`, [refundAmount, uID]).catch(()=>{});
                }
                
                // حذف السهم المنهار من المحفظة
                try {
                    await db.query(`DELETE FROM user_portfolio WHERE "userID" = $1 AND "itemID" = $2`, [uID, item.id]);
                } catch(e) {
                    await db.query(`DELETE FROM user_portfolio WHERE userid = $1 AND itemid = $2`, [uID, item.id]).catch(()=>{});
                }
            }
            await db.query("COMMIT").catch(()=>{});
        } catch (e) {
            await db.query("ROLLBACK").catch(()=>{});
            console.error("[Market Crash] Transaction Error:", e);
            throw e;
        }

        // تنظيف اسم السهم للرسالة العامة
        const cleanStockName = cleanItemName(item.name);

        if (channel) {
            investors.forEach((inv, index) => {
                const uID = inv.userID || inv.userid;
                const qty = Number(inv.quantity);

                setTimeout(async () => {
                    try {
                        const member = await channel.guild.members.fetch(uID).catch(() => null);
                        if (!member) return; 

                        const refundAmount = qty * CRASH_PRICE_TRIGGER;

                        const embed = new EmbedBuilder()
                            .setTitle(`❖ بـيـان صـادر عـن خـزانـة الإمبـراطوريـة`)
                            .setDescription(
                                `إن سـهـم **[ ${cleanStockName} ]** قـد هوى واعلن افلاسـه، وتهاوى حتى بلـغ أقصـى دركٍ في السـوق\n\n` +
                                `**التـدابـيـر الإمبـراطوريـة لإعـادة البعـث:**\n` +
                                `✶ إعلان إفلاس السهم \n` +
                                `✶ نزع محافظ المستثمرين كاملة بلا أي استثناء\n` +
                                `✶ إحياء السهم بأمرٍ سامٍ من الإمبراطور وطرحه بسعره الجديد **${RESET_PRICE.toLocaleString()}**\n\n` +
                                `✬ لانك احد مستثمري هذا السهم تم منحـك قيمتـه\n` +
                                `✬ حصـلـت عـلـى: **${refundAmount.toLocaleString()}** ${EMOJI_MORA}`
                            )
                            .setColor("Random")
                            .setImage('https://i.postimg.cc/4dftMyQ6/markett.png')
                            .setThumbnail(member.user.displayAvatarURL({ dynamic: true }));

                        await channel.send({ content: `<@${uID}>`, embeds: [embed] });

                    } catch (err) {
                        console.error(`[Crash Notification Error] User: ${uID}`, err);
                    }

                    // فتح القفل عند آخر مستثمر
                    if (index === investors.length - 1) {
                        client.marketLocks.delete(item.id);
                        console.log(`[Market Crash] All notifications sent for ${item.id}. Stock unlocked.`);
                    }

                }, index * MESSAGE_DELAY); 
            });
        } else {
            // فتح القفل إذا لم توجد قناة
            client.marketLocks.delete(item.id);
        }

    } catch (err) {
        console.error("[Market Crash Handler Error]", err);
        client.marketLocks.delete(item.id); 
    }
};
