const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ComponentType, Colors, MessageFlags, EmbedBuilder } = require("discord.js");

let addXPAndCheckLevel;
try { ({ addXPAndCheckLevel } = require('../handler-utils.js')); } 
catch (e) { try { ({ addXPAndCheckLevel } = require('./handler-utils.js')); } catch (e2) {} }

let utils;
try { utils = require('./utils.js'); } 
catch (e) { try { utils = require('./shop_system/utils.js'); } catch (e2) { utils = {}; } }

const { potionItems = [], rodsConfig = [], boatsConfig = [], baitsConfig = [], EMOJI_MORA = '<:mora:1435647151349698621>', BANNER_URL, ensureInventoryTable } = utils;
const shopItems = require('../json/shop-items.json');

let loadedPotionItems = [];
try { loadedPotionItems = require('../json/potions.json'); } catch(e) {}
const finalPotionItems = potionItems.length > 0 ? potionItems : loadedPotionItems;

let fishingConfig = {};
try { fishingConfig = require('../json/fishing-config.json'); } catch(e){}
const finalBaits = baitsConfig.length > 0 ? baitsConfig : (fishingConfig.baits || []);
const finalRods = rodsConfig.length > 0 ? rodsConfig : (fishingConfig.rods || []);
const finalBoats = boatsConfig.length > 0 ? boatsConfig : (fishingConfig.boats || []);

const CUSTOM_XP_RATE = 5; 
const MAX_POTION_LIMIT = 999;
const MAX_FARM_LIMIT = 1000;

const activeShopUsers = new Set();

async function execSafe(db, queryPg, queryLite, params = []) {
    try {
        let res = await db.query(queryPg, params);
        return res || { rows: [] };
    } catch (err1) {
        try {
            let res2 = await db.query(queryLite, params);
            return res2 || { rows: [] };
        } catch (err2) {
            console.error(`\n[❌ DB Error] Shop System:`);
            console.error(`- Pg Error: ${err1.message}`);
            console.error(`- Lite Error: ${err2.message}`);
            console.error(`- Query: ${queryPg}`);
            return { rows: [], error: true };
        }
    }
}

async function deductMora(client, db, userId, guildId, amount) {
    try {
        let dbMora = 0, dbBank = 0;
        let u = null;
        
        if (client && typeof client.getLevel === 'function') {
            u = await client.getLevel(userId, guildId);
        }

        if (u) {
            dbMora = Number(u.mora || u.Mora || 0);
            dbBank = Number(u.bank || u.Bank || 0);
        } else {
            let res = await execSafe(db, 
                `SELECT "mora", "bank" FROM levels WHERE "user" = $1 AND "guild" = $2`, 
                `SELECT mora, bank FROM levels WHERE userid = $1 AND guildid = $2`, 
                [userId, guildId]
            );
            if (res.rows && res.rows[0]) {
                dbMora = Number(res.rows[0].mora || res.rows[0].Mora || 0);
                dbBank = Number(res.rows[0].bank || res.rows[0].Bank || 0);
            }
        }

        if (dbMora >= amount) {
            dbMora -= amount;
        } else {
            let diff = amount - dbMora;
            dbMora = 0;
            dbBank -= diff;
        }

        if (u && typeof client.setLevel === 'function') {
            u.mora = String(dbMora);
            u.bank = String(dbBank);
            await client.setLevel(u);
        }

        let r1 = await execSafe(db, 
            `UPDATE levels SET "mora" = $1, "bank" = $2 WHERE "user" = $3 AND "guild" = $4`, 
            `UPDATE levels SET mora = $1, bank = $2 WHERE userid = $3 AND guildid = $4`, 
            [dbMora, dbBank, userId, guildId]
        );
        return !r1.error;
    } catch(e) {
        console.error("[❌ Deduct Mora Error]:", e);
        return false;
    }
}

async function refundMora(client, db, userId, guildId, amount) {
    try {
        if (client && typeof client.getLevel === 'function') {
            let u = await client.getLevel(userId, guildId);
            if (u) {
                u.mora = String(Number(u.mora || u.Mora || 0) + amount);
                if (typeof client.setLevel === 'function') await client.setLevel(u);
            }
        }
    } catch(e) {}

    await execSafe(db, 
        `UPDATE levels SET "mora" = CAST(COALESCE("mora", '0') AS BIGINT) + $1 WHERE "user" = $2 AND "guild" = $3`, 
        `UPDATE levels SET mora = CAST(COALESCE(mora, '0') AS BIGINT) + $1 WHERE userid = $2 AND guildid = $3`, 
        [amount, userId, guildId]
    );
}

async function getUserBal(db, userId, guildId) {
    let r = await execSafe(db, `SELECT "mora", "bank" FROM levels WHERE "user" = $1 AND "guild" = $2`, `SELECT mora, bank FROM levels WHERE userid = $1 AND guildid = $2`, [userId, guildId]);
    if(r.error || r.rows.length === 0) return { mora: 0, bank: 0 };
    return { mora: Number(r.rows[0].mora || r.rows[0].Mora || 0), bank: Number(r.rows[0].bank || r.rows[0].Bank || 0) };
}

async function safeGetFishing(db, userId, guildId) {
    await execSafe(db, 
        `CREATE TABLE IF NOT EXISTS user_fishing ("userID" TEXT, "guildID" TEXT, "rodLevel" BIGINT DEFAULT 1, "currentRod" TEXT DEFAULT 'سنارة خشبية', "boatLevel" BIGINT DEFAULT 1, "currentBoat" TEXT DEFAULT 'قارب خشب', PRIMARY KEY ("userID", "guildID"))`,
        `CREATE TABLE IF NOT EXISTS user_fishing (userid TEXT, guildid TEXT, rodlevel BIGINT DEFAULT 1, currentrod TEXT DEFAULT 'سنارة خشبية', boatlevel BIGINT DEFAULT 1, currentboat TEXT DEFAULT 'قارب خشب', PRIMARY KEY (userid, guildid))`
    );
    
    let r = await execSafe(db, `SELECT * FROM user_fishing WHERE "userID" = $1 AND "guildID" = $2`, `SELECT * FROM user_fishing WHERE userid = $1 AND guildid = $2`, [userId, guildId]);
    
    if (r.rows && r.rows.length > 0) return r.rows[0];

    let oldR = await execSafe(db, `SELECT "rodLevel", "boatLevel" FROM levels WHERE "user" = $1 AND "guild" = $2`, `SELECT rodLevel, boatLevel FROM levels WHERE userid = $1 AND guildid = $2`, [userId, guildId]);
    
    if (oldR.rows && oldR.rows.length > 0) {
        let oldRodLvl = Number(oldR.rows[0].rodLevel || oldR.rows[0].rodlevel || 0);
        let oldBoatLvl = Number(oldR.rows[0].boatLevel || oldR.rows[0].boatlevel || 0);

        if (oldRodLvl > 0 || oldBoatLvl > 0) {
            oldRodLvl = Math.max(1, oldRodLvl);
            oldBoatLvl = Math.max(1, oldBoatLvl);

            const rodData = finalRods.find(r => r.level === oldRodLvl) || finalRods[0];
            const boatData = finalBoats.find(b => b.level === oldBoatLvl) || finalBoats[0];

            const rodName = rodData ? rodData.name : 'سنارة خشبية';
            const boatName = boatData ? boatData.name : 'قارب خشب';

            await execSafe(db, 
                `INSERT INTO user_fishing ("userID", "guildID", "rodLevel", "currentRod", "boatLevel", "currentBoat") VALUES ($1, $2, $3, $4, $5, $6)`, 
                `INSERT INTO user_fishing (userid, guildid, rodlevel, currentrod, boatlevel, currentboat) VALUES ($1, $2, $3, $4, $5, $6)`, 
                [userId, guildId, oldRodLvl, rodName, oldBoatLvl, boatName]
            );

            return { rodLevel: oldRodLvl, currentRod: rodName, boatLevel: oldBoatLvl, currentBoat: boatName };
        }
    }
    return null;
}

async function safeGetInv(db, userId, guildId, itemId) {
    let r = await execSafe(db, `SELECT "id", "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, `SELECT id, quantity FROM user_inventory WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [userId, guildId, itemId]);
    return r.rows[0] || null;
}

async function safeAddInv(db, userId, guildId, itemId, qty) {
    let item = await safeGetInv(db, userId, guildId, itemId);
    if (item) {
        let newQty = Number(item.quantity || item.Quantity || 0) + qty;
        let id = item.id || item.ID;
        let r = await execSafe(db, `UPDATE user_inventory SET "quantity" = $1 WHERE "id" = $2`, `UPDATE user_inventory SET quantity = $1 WHERE id = $2`, [newQty, id]);
        return !r.error;
    } else {
        let r = await execSafe(db, `INSERT INTO user_inventory ("guildID", "userID", "itemID", "quantity") VALUES ($1, $2, $3, $4)`, `INSERT INTO user_inventory (guildid, userid, itemid, quantity) VALUES ($1, $2, $3, $4)`, [guildId, userId, itemId, qty]);
        return !r.error;
    }
}

async function sendShopLog(client, db, guildId, member, item, price, type = "شراء") {
    try {
        let r = await execSafe(db, `SELECT "shopLogChannelID" FROM settings WHERE "guild" = $1`, `SELECT shoplogchannelid FROM settings WHERE guild = $1`, [guildId]);
        let chId = r.rows[0]?.shopLogChannelID || r.rows[0]?.shoplogchannelid;
        if (!chId) return;
        const channel = await client.channels.fetch(chId).catch(() => null);
        if (!channel) return;

        const embed = new EmbedBuilder()
            .setTitle(`🛒 سجل عمليات المتجر`)
            .setColor(type.includes("بيع") ? Colors.Green : Colors.Gold)
            .addFields(
                { name: '👤 العضو', value: `${member} \n(\`${member.id}\`)`, inline: true },
                { name: '📦 العنصر', value: `**${item}**`, inline: true },
                { name: '💰 المبلغ', value: `**${price.toLocaleString()}** ${EMOJI_MORA}`, inline: true },
                { name: '🏷️ نوع العملية', value: type, inline: true },
                { name: '⏰ الوقت', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
            )
            .setThumbnail(member.user.displayAvatarURL())
            .setTimestamp();
        await channel.send({ embeds: [embed] }).catch(()=>{});
    } catch (e) {}
}

async function sendItemDetailsEmbed(i, itemId, itemType = 'general') {
    let item;
    let priceText = '';
    let descText = '';

    if (itemType === 'bait') {
        item = finalBaits.find(b => b.id === itemId);
        if(item) {
            const unitPrice = Math.round(item.price / 5);
            const cost = unitPrice * 5; 
            priceText = `**${cost.toLocaleString()}** ${EMOJI_MORA}`;
            descText = `حزمة تحتوي على (5 حبات) من ${item.name}.`;
        }
    } else {
        item = shopItems.find(it => it.id === itemId) || finalPotionItems.find(it => it.id === itemId);
        if(item) {
            priceText = `**${item.price > 0 ? item.price.toLocaleString() : 'مـورا ؟'}** ${EMOJI_MORA}`;
            descText = item.description || 'لا يوجد وصف.';
        }
    }

    if (!item) return await i.reply({ content: '❌ هذا العنصر غير موجود!', flags: [MessageFlags.Ephemeral] });

    const detailEmbed = new EmbedBuilder()
        .setTitle(`${item.emoji || '📦'} ${item.name}`)
        .setDescription(`**الوصف:**\n${descText}`)
        .addFields({ name: 'السعر', value: priceText, inline: true })
        .setColor(Colors.Gold);
        
    if(item.image) detailEmbed.setThumbnail(item.image);

    const customId = itemType === 'bait' ? `buy_confirm_bait_${item.id}` : `buy_item_${item.id}`;
    const buyBtn = new ButtonBuilder().setCustomId(customId).setLabel('تأكيد الشراء').setStyle(ButtonStyle.Success).setEmoji('🛒');
    const row = new ActionRowBuilder().addComponents(buyBtn);

    if(i.replied || i.deferred) {
        return await i.followUp({ embeds: [detailEmbed], components: [row], flags: [MessageFlags.Ephemeral] });
    } else {
        return await i.reply({ embeds: [detailEmbed], components: [row], flags: [MessageFlags.Ephemeral] });
    }
}

async function handlePurchaseWithCoupons(interaction, itemData, quantity, totalPrice, client, db, callbackType) {
    const member = interaction.member; 
    const guildID = interaction.guild.id; 
    const userID = member.id;
    
    let rBoss = await execSafe(db, `SELECT * FROM user_coupons WHERE "guildID" = $1 AND "userID" = $2 AND "isUsed" = 0 LIMIT 1`, `SELECT * FROM user_coupons WHERE guildid = $1 AND userid = $2 AND isused = 0 LIMIT 1`, [guildID, userID]);
    const bossCoupon = rBoss.rows[0] || null;
    
    let rRole = await execSafe(db, `SELECT * FROM role_coupons_config WHERE "guildID" = $1`, `SELECT * FROM role_coupons_config WHERE guildid = $1`, [guildID]);
    const roleCouponsConfig = rRole.rows || [];
    
    let bestRoleCoupon = null;
    for (const config of roleCouponsConfig) {
        const rID = config.roleID || config.roleid;
        const dPercent = config.discountPercent || config.discountpercent;
        if (member.roles.cache.has(rID)) {
            if (!bestRoleCoupon || Number(dPercent) > Number(bestRoleCoupon.discountPercent || bestRoleCoupon.discountpercent)) bestRoleCoupon = config;
        }
    }
    
    let isRoleCouponReady = false;
    if (bestRoleCoupon) {
        let rUse = await execSafe(db, `SELECT "lastUsedTimestamp" FROM user_role_coupon_usage WHERE "guildID" = $1 AND "userID" = $2`, `SELECT lastusedtimestamp FROM user_role_coupon_usage WHERE guildid = $1 AND userid = $2`, [guildID, userID]);
        const usageData = rUse.rows[0];
        const lastUsed = usageData?.lastUsedTimestamp || usageData?.lastusedtimestamp;
        const fifteenDaysMs = 15 * 24 * 60 * 60 * 1000;
        if (!usageData || (Date.now() - Number(lastUsed) > fifteenDaysMs)) isRoleCouponReady = true; else bestRoleCoupon = null; 
    }
    
    if (!bossCoupon && !bestRoleCoupon) return processFinalPurchase(interaction, itemData, quantity, totalPrice, 0, 'none', client, db, callbackType);

    const row = new ActionRowBuilder();
    let couponMessage = "";
    let finalPriceWithBoss = totalPrice;
    let finalPriceWithRole = totalPrice;

    if (bossCoupon) {
        const disCount = Number(bossCoupon.discountPercent || bossCoupon.discountpercent);
        finalPriceWithBoss = Math.floor(totalPrice * (1 - (disCount / 100)));
        couponMessage += `✶ لديـك كـوبـون خـصم بقيـمـة: **${disCount}%** هل تريـد استعمـالـه؟\n✬ اذا استعملته ستدفـع: **${finalPriceWithBoss.toLocaleString()}** ${EMOJI_MORA} - بدلاً مـن: **${totalPrice.toLocaleString()}**\n\n`;
        row.addComponents(new ButtonBuilder().setCustomId('use_boss_coupon').setLabel(`استعمـال (${disCount}%)`).setStyle(ButtonStyle.Success).setEmoji('🎫'));
    }
    if (bestRoleCoupon && isRoleCouponReady) {
        const disCount = Number(bestRoleCoupon.discountPercent || bestRoleCoupon.discountpercent);
        finalPriceWithRole = Math.floor(totalPrice * (1 - (disCount / 100)));
        couponMessage += `✶ لديـك كـوبـون خـصم بقيـمـة: **${disCount}%** هل تريـد استعمـالـه؟\n✬ اذا استعملته ستدفـع: **${finalPriceWithRole.toLocaleString()}** ${EMOJI_MORA} - بدلاً مـن: **${totalPrice.toLocaleString()}**\n\n`;
        row.addComponents(new ButtonBuilder().setCustomId('use_role_coupon').setLabel(`استعمـال (${disCount}%)`).setStyle(ButtonStyle.Success).setEmoji('🛡️'));
    }
    row.addComponents(new ButtonBuilder().setCustomId('skip_coupon').setLabel('تخـطـي (دفع كامل)').setStyle(ButtonStyle.Primary));

    const replyData = { content: `**🛍️ خيـارات الـدفع:**\n\n${couponMessage}`, components: [row], flags: [MessageFlags.Ephemeral], fetchReply: true };
    let msg; 
    try {
        if (interaction.replied || interaction.deferred) msg = await interaction.followUp(replyData); 
        else msg = await interaction.reply(replyData);
    } catch(e) {
        msg = await interaction.channel.send(replyData);
    }
    
    const filter = i => i.user.id === userID;
    const collector = msg.createMessageComponentCollector({ filter, componentType: ComponentType.Button, time: 60000 });
    
    collector.on('collect', async i => {
        try { if (!i.replied && !i.deferred) await i.deferUpdate(); } catch(e) {}
        await i.editReply({ content: "⏳ جاري تنفيذ الطلب...", components: [] });
        if (i.customId === 'skip_coupon') await processFinalPurchase(i, itemData, quantity, totalPrice, 0, 'none', client, db, callbackType);
        else if (i.customId === 'use_boss_coupon') await processFinalPurchase(i, itemData, quantity, finalPriceWithBoss, Number(bossCoupon.discountPercent || bossCoupon.discountpercent), 'boss', client, db, callbackType, bossCoupon.id || bossCoupon.ID);
        else if (i.customId === 'use_role_coupon') await processFinalPurchase(i, itemData, quantity, finalPriceWithRole, Number(bestRoleCoupon.discountPercent || bestRoleCoupon.discountpercent), 'role', client, db, callbackType);
        collector.stop();
    });
}

async function processFinalPurchase(interaction, itemData, quantity, finalPrice, discountUsed, couponType, client, db, callbackType, couponIdToDelete = null) {
    let bal = await getUserBal(db, interaction.user.id, interaction.guild.id);
    const totalWealth = bal.mora + bal.bank;

    const errorReply = async (msgContent) => {
        if (interaction.deferred || interaction.replied) return await interaction.followUp({ content: msgContent, flags: [MessageFlags.Ephemeral] }); 
        else return await interaction.reply({ content: msgContent, flags: [MessageFlags.Ephemeral] });
    };

    if (totalWealth < finalPrice) {
        return await errorReply(`❌ **عذراً، رصيدك (كاش + بنك) لا يكفي!**\nالمطلوب: **${finalPrice.toLocaleString()}** ${EMOJI_MORA}`);
    }

    if (callbackType === 'item') {
        if (itemData.category === 'potions' || itemData.id.startsWith('potion_')) {
            let inv = await safeGetInv(db, interaction.user.id, interaction.guild.id, itemData.id);
            let currQty = inv ? Number(inv.quantity || inv.Quantity || 0) : 0;
            if (currQty + quantity > MAX_POTION_LIMIT) return await errorReply(`🚫 **لا يمكنك الشراء!**\nحقيبتك ممتلئة من هذا العنصر.`);
        } 
    }

    let deducted = await deductMora(client, db, interaction.user.id, interaction.guild.id, finalPrice);
    if (!deducted) return await errorReply('❌ صار خطأ بخصم الفلوس، جرب ثانية.');

    let success = true;

    try {
        if (couponType === 'boss' && couponIdToDelete) {
            await execSafe(db, `DELETE FROM user_coupons WHERE "id" = $1`, `DELETE FROM user_coupons WHERE id = $1`, [couponIdToDelete]);
        }
        else if (couponType === 'role') {
            let rUse = await execSafe(db, `SELECT "userID" FROM user_role_coupon_usage WHERE "guildID" = $1 AND "userID" = $2`, `SELECT userid FROM user_role_coupon_usage WHERE guildid = $1 AND userid = $2`, [interaction.guild.id, interaction.user.id]);
            if (rUse.rows[0]) {
                await execSafe(db, `UPDATE user_role_coupon_usage SET "lastUsedTimestamp" = $1 WHERE "guildID" = $2 AND "userID" = $3`, `UPDATE user_role_coupon_usage SET lastusedtimestamp = $1 WHERE guildid = $2 AND userid = $3`, [Date.now(), interaction.guild.id, interaction.user.id]);
            } else {
                let insCoup = await execSafe(db, `INSERT INTO user_role_coupon_usage ("guildID", "userID", "lastUsedTimestamp") VALUES ($1, $2, $3)`, `INSERT INTO user_role_coupon_usage (guildid, userid, lastusedtimestamp) VALUES ($1, $2, $3)`, [interaction.guild.id, interaction.user.id, Date.now()]);
                let attC = 0;
                while (insCoup.error && attC < 10) {
                    insCoup = await execSafe(db, `INSERT INTO user_role_coupon_usage ("guildID", "userID", "lastUsedTimestamp") VALUES ($1, $2, $3)`, `INSERT INTO user_role_coupon_usage (guildid, userid, lastusedtimestamp) VALUES ($1, $2, $3)`, [interaction.guild.id, interaction.user.id, Date.now()]);
                    attC++;
                }
            }
        }

        if (callbackType === 'item') {
            if (itemData.id === 'personal_guard_1d') { 
                let r = await execSafe(db, `UPDATE levels SET "hasGuard" = LEAST(COALESCE("hasGuard", 0) + 3, 6), "guardExpires" = 0 WHERE "user" = $1 AND "guild" = $2`, `UPDATE levels SET hasguard = LEAST(COALESCE(hasguard, 0) + 3, 6), guardexpires = 0 WHERE userid = $1 AND guildid = $2`, [interaction.user.id, interaction.guild.id]);
                if(r.error) success = false;
                else {
                    try {
                        if (client && typeof client.getLevel === 'function') {
                            let u = await client.getLevel(interaction.user.id, interaction.guild.id);
                            if (u) {
                                u.hasGuard = Math.min((Number(u.hasGuard || u.hasguard || 0) + 3), 6);
                                u.guardExpires = 0;
                                await client.setLevel(u);
                            }
                        }
                    } catch(e){}
                }
            }
            else if (itemData.category === 'potions' || itemData.id.startsWith('potion_')) { 
                if(ensureInventoryTable) await ensureInventoryTable(db); 
                let added = await safeAddInv(db, interaction.user.id, interaction.guild.id, itemData.id, 1);
                if(!added) success = false;
            }
            else if (itemData.id === 'streak_shield') {
                let r = await execSafe(db, `SELECT "id" FROM streaks WHERE "userID" = $1 AND "guildID" = $2`, `SELECT id FROM streaks WHERE userid = $1 AND guildid = $2`, [interaction.user.id, interaction.guild.id]);
                if (r.rows[0]) {
                    const strkId = r.rows[0].id || r.rows[0].ID;
                    let r2 = await execSafe(db, `UPDATE streaks SET "hasItemShield" = COALESCE("hasItemShield", 0) + 1 WHERE "id" = $1`, `UPDATE streaks SET hasitemshield = COALESCE(hasitemshield, 0) + 1 WHERE id = $1`, [strkId]);
                    if(r2.error) success = false;
                } else {
                    const id = `${interaction.guild.id}-${interaction.user.id}`;
                    let r2 = await execSafe(db, `INSERT INTO streaks ("id", "guildID", "userID", "hasItemShield") VALUES ($1, $2, $3, 1)`, `INSERT INTO streaks (id, guildid, userid, hasitemshield) VALUES ($1, $2, $3, 1)`, [id, interaction.guild.id, interaction.user.id]);
                    if(r2.error) success = false;
                }
            }
            else if (itemData.id === 'streak_shield_media') {
                let r = await execSafe(db, `SELECT "id" FROM media_streaks WHERE "userID" = $1 AND "guildID" = $2`, `SELECT id FROM media_streaks WHERE userid = $1 AND guildid = $2`, [interaction.user.id, interaction.guild.id]);
                if (r.rows[0]) {
                    const medId = r.rows[0].id || r.rows[0].ID;
                    let r2 = await execSafe(db, `UPDATE media_streaks SET "hasItemShield" = COALESCE("hasItemShield", 0) + 1 WHERE "id" = $1`, `UPDATE media_streaks SET hasitemshield = COALESCE(hasitemshield, 0) + 1 WHERE id = $1`, [medId]);
                    if(r2.error) success = false;
                } else {
                    const id = `${interaction.guild.id}-${interaction.user.id}`;
                    let r2 = await execSafe(db, `INSERT INTO media_streaks ("id", "guildID", "userID", "hasItemShield") VALUES ($1, $2, $3, 1)`, `INSERT INTO media_streaks (id, guildid, userid, hasitemshield) VALUES ($1, $2, $3, 1)`, [id, interaction.guild.id, interaction.user.id]);
                    if(r2.error) success = false;
                }
            }
            else if (itemData.id.startsWith('xp_buff_')) {
                let multiplier = 0, buffPercent = 0, duration = 0;
                switch (itemData.id) {
                    case 'xp_buff_small': multiplier = 0.15; buffPercent = 15; duration = 12 * 60 * 60 * 1000; break;
                    case 'xp_buff_medium': multiplier = 0.25; buffPercent = 25; duration = 24 * 60 * 60 * 1000; break;
                    case 'xp_buff_large': multiplier = 0.30; buffPercent = 30; duration = 35 * 60 * 60 * 1000; break;
                }
                if (duration > 0) {
                    const expiresAt = Date.now() + duration;
                    let r = await execSafe(db, `SELECT * FROM user_buffs WHERE "userID" = $1 AND "guildID" = $2 AND "buffType" = 'xp'`, `SELECT * FROM user_buffs WHERE userid = $1 AND guildid = $2 AND bufftype = 'xp'`, [interaction.user.id, interaction.guild.id]);
                    
                    if (r.rows.length > 0) {
                        let r2 = await execSafe(db, `UPDATE user_buffs SET "multiplier" = $1, "expiresAt" = $2, "buffPercent" = $3 WHERE "userID" = $4 AND "guildID" = $5 AND "buffType" = 'xp'`, `UPDATE user_buffs SET multiplier = $1, expiresat = $2, buffpercent = $3 WHERE userid = $4 AND guildid = $5 AND bufftype = 'xp'`, [multiplier, expiresAt, buffPercent, interaction.user.id, interaction.guild.id]);
                        if(r2.error) success = false;
                    } else {
                        await execSafe(db, `DELETE FROM user_buffs WHERE "userID" = $1 AND "guildID" = $2 AND "buffType" = 'xp'`, `DELETE FROM user_buffs WHERE userid = $1 AND guildid = $2 AND bufftype = 'xp'`, [interaction.user.id, interaction.guild.id]);
                        try { await db.query(`ALTER TABLE user_buffs DROP CONSTRAINT IF EXISTS user_buffs_pkey`); } catch(e) {}
                        
                        let newId = Date.now(); 
                        let insXP = await execSafe(db, 
                            `INSERT INTO user_buffs ("id", "userID", "guildID", "buffType", "multiplier", "expiresAt", "buffPercent") VALUES ($1, $2, $3, 'xp', $4, $5, $6)`, 
                            `INSERT INTO user_buffs (id, userid, guildid, bufftype, multiplier, expiresat, buffpercent) VALUES ($1, $2, $3, 'xp', $4, $5, $6)`, 
                            [newId, interaction.user.id, interaction.guild.id, multiplier, expiresAt, buffPercent]
                        );
                        if(insXP.error) {
                            insXP = await execSafe(db, 
                                `INSERT INTO user_buffs ("userID", "guildID", "buffType", "multiplier", "expiresAt", "buffPercent") VALUES ($1, $2, $3, $4, $5, $6)`, 
                                `INSERT INTO user_buffs (userid, guildid, bufftype, multiplier, expiresat, buffpercent) VALUES ($1, $2, $3, $4, $5, $6)`, 
                                [interaction.user.id, interaction.guild.id, multiplier, expiresAt, buffPercent]
                            );
                        }
                        if(insXP.error) success = false;
                    }
                }
            }
            else if (itemData.id === 'farm_worker_3d') {
                const durationMs = 3 * 24 * 60 * 60 * 1000;
                const nowMs = Date.now();

                let wBuf = await execSafe(db,
                    `SELECT "id", "expiresAt" FROM user_buffs WHERE "userID" = $1 AND "guildID" = $2 AND "buffType" = 'farm_worker'`,
                    `SELECT id, expiresat as "expiresAt" FROM user_buffs WHERE userid = $1 AND guildid = $2 AND bufftype = 'farm_worker'`,
                    [interaction.user.id, interaction.guild.id]
                );

                let newExpiresAt = nowMs + durationMs;
                
                if (wBuf.rows.length > 0) {
                    const existingExp = Number(wBuf.rows[0].expiresAt || wBuf.rows[0].expiresat || 0);
                    if (existingExp > nowMs) newExpiresAt = existingExp + durationMs;
                    
                    let upd = await execSafe(db,
                        `UPDATE user_buffs SET "expiresAt" = $1 WHERE "userID" = $2 AND "guildID" = $3 AND "buffType" = 'farm_worker'`,
                        `UPDATE user_buffs SET expiresat = $1 WHERE userid = $2 AND guildid = $3 AND bufftype = 'farm_worker'`,
                        [newExpiresAt, interaction.user.id, interaction.guild.id]
                    );
                    if (upd.error) success = false;
                } else {
                    await execSafe(db, `DELETE FROM user_buffs WHERE "userID" = $1 AND "guildID" = $2 AND "buffType" = 'farm_worker'`, `DELETE FROM user_buffs WHERE userid = $1 AND guildid = $2 AND bufftype = 'farm_worker'`, [interaction.user.id, interaction.guild.id]);
                    try { await db.query(`ALTER TABLE user_buffs DROP CONSTRAINT IF EXISTS user_buffs_pkey`); } catch(e) {}
                    
                    let newId = Date.now(); 
                    let insWorker = await execSafe(db,
                        `INSERT INTO user_buffs ("id", "userID", "guildID", "buffType", "multiplier", "expiresAt", "buffPercent") VALUES ($1, $2, $3, 'farm_worker', 1, $4, 0)`,
                        `INSERT INTO user_buffs (id, userid, guildid, bufftype, multiplier, expiresat, buffpercent) VALUES ($1, $2, $3, 'farm_worker', 1, $4, 0)`,
                        [newId, interaction.user.id, interaction.guild.id, newExpiresAt]
                    );
                    
                    if (insWorker.error) {
                        insWorker = await execSafe(db,
                            `INSERT INTO user_buffs ("userID", "guildID", "buffType", "multiplier", "expiresAt", "buffPercent") VALUES ($1, $2, 'farm_worker', 1, $3, 0)`,
                            `INSERT INTO user_buffs (userid, guildid, bufftype, multiplier, expiresat, buffpercent) VALUES ($1, $2, 'farm_worker', 1, $3, 0)`,
                            [interaction.user.id, interaction.guild.id, newExpiresAt]
                        );
                    }
                    if (insWorker.error) success = false;
                }
            }
            else if (itemData.id === 'change_race') {
                let allRaceRolesRes = await execSafe(db, `SELECT "roleID", "raceName" FROM race_roles WHERE "guildID" = $1`, `SELECT roleid, racename FROM race_roles WHERE guildid = $1`, [interaction.guild.id]);
                const raceRoleIDs = (allRaceRolesRes.rows || []).map(r => r.roleID || r.roleid);
                const userRaceRole = interaction.member.roles.cache.find(r => raceRoleIDs.includes(r.id));
                if (userRaceRole) { await interaction.member.roles.remove(userRaceRole).catch(()=>{}); }

                await execSafe(db, `DELETE FROM race_dungeon_buffs WHERE "guildID" = $1 AND "roleID" = $2`, `DELETE FROM race_dungeon_buffs WHERE guildid = $1 AND roleid = $2`, [interaction.guild.id, userRaceRole ? userRaceRole.id : 'none']);
                
                const expiresAt = Date.now() + (7 * 24 * 60 * 60 * 1000);
                let xpBuffCheck = await execSafe(db, `SELECT * FROM user_buffs WHERE "userID" = $1 AND "guildID" = $2 AND "buffType" = 'xp'`, `SELECT * FROM user_buffs WHERE userid = $1 AND guildid = $2 AND bufftype = 'xp'`, [interaction.user.id, interaction.guild.id]);
                
                if (xpBuffCheck.rows.length > 0) {
                    let r2 = await execSafe(db, `UPDATE user_buffs SET "buffPercent" = $1, "expiresAt" = $2, "multiplier" = $3 WHERE "userID" = $4 AND "guildID" = $5 AND "buffType" = 'xp'`, `UPDATE user_buffs SET buffpercent = $1, expiresat = $2, multiplier = $3 WHERE userid = $4 AND guildid = $5 AND bufftype = 'xp'`, [-5, expiresAt, -0.05, interaction.user.id, interaction.guild.id]);
                    if(r2.error) success = false;
                }
                else {
                    await execSafe(db, `DELETE FROM user_buffs WHERE "userID" = $1 AND "guildID" = $2 AND "buffType" = 'xp'`, `DELETE FROM user_buffs WHERE userid = $1 AND guildid = $2 AND bufftype = 'xp'`, [interaction.user.id, interaction.guild.id]);
                    try { await db.query(`ALTER TABLE user_buffs DROP CONSTRAINT IF EXISTS user_buffs_pkey`); } catch(e) {}
                    
                    let newId = Date.now();
                    let insXP = await execSafe(db, 
                        `INSERT INTO user_buffs ("id", "guildID", "userID", "buffPercent", "expiresAt", "buffType", "multiplier") VALUES ($1, $2, $3, $4, $5, 'xp', $6)`, 
                        `INSERT INTO user_buffs (id, guildid, userid, buffpercent, expiresat, bufftype, multiplier) VALUES ($1, $2, $3, $4, $5, 'xp', $6)`, 
                        [newId, interaction.guild.id, interaction.user.id, -5, expiresAt, -0.05]
                    );
                    if (insXP.error) {
                        insXP = await execSafe(db, 
                            `INSERT INTO user_buffs ("guildID", "userID", "buffPercent", "expiresAt", "buffType", "multiplier") VALUES ($1, $2, $3, $4, 'xp', $5)`, 
                            `INSERT INTO user_buffs (guildid, userid, buffpercent, expiresat, bufftype, multiplier) VALUES ($1, $2, $3, $4, 'xp', $5)`, 
                            [interaction.guild.id, interaction.user.id, -5, expiresAt, -0.05]
                        );
                    }
                    if(insXP.error) success = false;
                }
            }
        } 

        if (success) {
            await execSafe(db, `UPDATE levels SET "shop_purchases" = COALESCE("shop_purchases", 0) + 1 WHERE "user" = $1 AND "guild" = $2`, `UPDATE levels SET shop_purchases = COALESCE(shop_purchases, 0) + 1 WHERE userid = $1 AND guildid = $2`, [interaction.user.id, interaction.guild.id]);
            
            let successMsg = `📦 **العنصر:** ${itemData.name || 'Unknown'}\n💰 **التكلفة:** ${finalPrice.toLocaleString()} ${EMOJI_MORA}`;
            if (discountUsed > 0) successMsg += `\n📉 **تم تطبيق خصم:** ${discountUsed}%`;
            if (itemData.id === 'farm_worker_3d') successMsg += `\n👨‍🌾 **عامل المزرعة بدأ العمل!** سيقوم بحصاد المحاصيل وإطعام الحيوانات (أضيف لك 3 أيام).`;
            if (itemData.id === 'change_race') successMsg += `\n🧬 **تم مسح عرقك القديم بنجاح!** و تم تطبيق اللعـنـة.`;
            
            const successEmbed = new EmbedBuilder()
                .setTitle('✅ تمت عملية الشراء بنجاح')
                .setColor(Colors.Green)
                .setDescription(successMsg)
                .setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL() });

            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content: null, embeds: [successEmbed], components: [] }).catch(()=>{});
            } else {
                await interaction.reply({ content: null, embeds: [successEmbed], components: [], flags: [MessageFlags.Ephemeral] }).catch(()=>{});
            }
            
            await sendShopLog(client, db, interaction.guild.id, interaction.member, itemData.name || "Unknown", finalPrice, `شراء ${discountUsed > 0 ? '(مع كوبون)' : ''}`);
        }

    } catch (e) {
        console.error("🔥 [Shop System Error] processFinalPurchase:", e);
        success = false;
    }

    if (!success) {
        await refundMora(client, db, interaction.user.id, interaction.guild.id, finalPrice);
        return await errorReply(`❌ **حدث خطأ بالحفظ!**\nتم إرجاع **${finalPrice.toLocaleString()}** مورا لحسابك.`);
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

        if (data.rewardsInput) {
            const xpMatch = data.rewardsInput.match(/xp:\s*(\d+)/i);
            const moraMatch = data.rewardsInput.match(/mora:\s*(\d+)/i);
            data.xpReward = xpMatch ? parseInt(xpMatch[1]) : 0;
            data.moraReward = moraMatch ? parseInt(moraMatch[1]) : 0;
        }

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
        
        try {
            await db.query(`INSERT INTO active_giveaways ("messageID", "guildID", "channelID", "prize", "endsAt", "winnerCount", "xpReward", "moraReward", "isFinished") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0)`, [gMessage.id, i.guild.id, targetChannel.id, data.prize, endsAt, winnerCount, data.xpReward || 0, data.moraReward || 0]);
        } catch (e) {
            try {
                await db.query(`INSERT INTO active_giveaways (messageid, guildid, channelid, prize, endsat, winnercount, xpreward, morareward, isfinished) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0)`, [gMessage.id, i.guild.id, targetChannel.id, data.prize, endsAt, winnerCount, data.xpReward || 0, data.moraReward || 0]);
            } catch(e2) {
                console.error("[Giveaway Insert Error]:", e2);
            }
        }

        const safeDuration = Math.min(durationMs, 2147483647);
        setTimeout(() => {
            const { endGiveaway } = require('./giveaway-handler.js');
            endGiveaway(client, gMessage.id);
        }, safeDuration);
        
        giveawayBuilders.delete(i.user.id);
        await i.message.edit({ content: "✅ تم إرسال القيفاواي بنجاح!", embeds: [], components: [] }).catch(() => {});
        await i.editReply("✅ تم الإرسال!");
    }
}
