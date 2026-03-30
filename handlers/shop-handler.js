const { 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    StringSelectMenuBuilder, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    ComponentType, 
    Colors, 
    MessageFlags,
    EmbedBuilder
} = require("discord.js");

let addXPAndCheckLevel;
try { ({ addXPAndCheckLevel } = require('../handler-utils.js')); } 
catch (e) { try { ({ addXPAndCheckLevel } = require('./handler-utils.js')); } catch (e2) {} }

let utils;
try { utils = require('./utils.js'); } 
catch (e) { try { utils = require('./shop_system/utils.js'); } catch (e2) { utils = {}; } }

const { 
    potionItems = [], rodsConfig = [], boatsConfig = [], baitsConfig = [], 
    EMOJI_MORA = '<:mora:1435647151349698621>', BANNER_URL, THUMBNAILS, 
    ensureInventoryTable 
} = utils;

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

async function executeDB(db, query, params = []) {
    try { return await db.query(query, params); } 
    catch (e) { throw e; }
}

const safeQuery = async (db, qPg, qLite, params = []) => {
    try { return await db.query(qPg, params); } 
    catch(e) { return await db.query(qLite, params); }
};

async function sendShopLog(client, db, guildId, member, item, price, type = "شراء") {
    try {
        let settingsRes = await safeQuery(db, `SELECT "shopLogChannelID" FROM settings WHERE "guild" = $1`, `SELECT shoplogchannelid FROM settings WHERE guild = $1`, [guildId]).catch(()=>({rows:[]}));
        const settings = settingsRes?.rows?.[0];
        
        if (!settings || (!settings.shopLogChannelID && !settings.shoplogchannelid)) return;
        const targetChannel = settings.shopLogChannelID || settings.shoplogchannelid;
        
        const channel = await client.channels.fetch(targetChannel).catch(() => null);
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

    if (!item) return await i.reply({ content: '❌ هذا العنصر غير موجود!', flags: MessageFlags.Ephemeral });

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
        return await i.followUp({ embeds: [detailEmbed], components: [row], flags: MessageFlags.Ephemeral });
    } else {
        return await i.reply({ embeds: [detailEmbed], components: [row], flags: MessageFlags.Ephemeral });
    }
}

async function handlePurchaseWithCoupons(interaction, itemData, quantity, totalPrice, client, db, callbackType) {
    const member = interaction.member; 
    const guildID = interaction.guild.id; 
    const userID = member.id;
    
    let bossCouponRes = await safeQuery(db, `SELECT * FROM user_coupons WHERE "guildID" = $1 AND "userID" = $2 AND "isUsed" = 0 LIMIT 1`, `SELECT * FROM user_coupons WHERE guildid = $1 AND userid = $2 AND isused = 0 LIMIT 1`, [guildID, userID]).catch(()=>({rows:[]}));
    const bossCoupon = bossCouponRes?.rows?.[0] || null;
    
    let roleCouponsConfigRes = await safeQuery(db, `SELECT * FROM role_coupons_config WHERE "guildID" = $1`, `SELECT * FROM role_coupons_config WHERE guildid = $1`, [guildID]).catch(()=>({rows:[]}));
    const roleCouponsConfig = roleCouponsConfigRes?.rows || [];
    
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
        let usageDataRes = await safeQuery(db, `SELECT "lastUsedTimestamp" FROM user_role_coupon_usage WHERE "guildID" = $1 AND "userID" = $2`, `SELECT lastusedtimestamp FROM user_role_coupon_usage WHERE guildid = $1 AND userid = $2`, [guildID, userID]).catch(()=>({rows:[]}));
        const usageData = usageDataRes?.rows?.[0];
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

    const replyData = { content: `**🛍️ خيـارات الـدفع:**\n\n${couponMessage}`, components: [row], flags: MessageFlags.Ephemeral, fetchReply: true };
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
    let userDataRes = await safeQuery(db, `SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2`, `SELECT * FROM levels WHERE userid = $1 AND guildid = $2`, [interaction.user.id, interaction.guild.id]).catch(()=>({rows:[]}));
    let userData = userDataRes?.rows?.[0];
    
    if (!userData) {
        await safeQuery(db, `INSERT INTO levels ("user", "guild", "mora", "bank", "xp", "totalXP", "level") VALUES ($1, $2, 0, 0, 0, 0, 1)`, `INSERT INTO levels (userid, guildid, mora, bank, xp, totalxp, level) VALUES ($1, $2, 0, 0, 0, 0, 1)`, [interaction.user.id, interaction.guild.id]).catch(()=>{});
        userData = { user: interaction.user.id, guild: interaction.guild.id, level: 1, mora: 0, bank: 0, xp: 0, totalXP: 0 };
    }
      
    const errorReply = async (msgContent) => {
        if (interaction.deferred || interaction.replied) return await interaction.followUp({ content: msgContent, flags: MessageFlags.Ephemeral }); 
        else return await interaction.reply({ content: msgContent, flags: MessageFlags.Ephemeral });
    };

    if (Number(userData.mora || userData.Mora || 0) < finalPrice) {
        const userBank = Number(userData.bank || userData.Bank) || 0; 
        let errorMsg = `❌ **عذراً، لا تملك مورا كافية!**\nالمطلوب بالكاش: **${finalPrice.toLocaleString()}** ${EMOJI_MORA}`;
        if (userBank >= finalPrice) errorMsg += `\n\n💡 **تلميح:** ليس لديك كاش كافٍ، ولكن لديك **${userBank.toLocaleString()}** في البنك. قم بسحبها أولاً.`;
        return await errorReply(errorMsg);
    }

    if (callbackType === 'item') {
        if (itemData.category === 'potions' || itemData.id.startsWith('potion_')) {
            let invCheckRes = await safeQuery(db, `SELECT "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, `SELECT quantity FROM user_inventory WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [interaction.user.id, interaction.guild.id, itemData.id]).catch(()=>({rows:[]}));
            let currQty = invCheckRes?.rows?.[0] ? Number(invCheckRes.rows[0].quantity || invCheckRes.rows[0].Quantity) : 0;
            if (currQty + quantity > MAX_POTION_LIMIT) return await errorReply(`🚫 **لا يمكنك الشراء!**\nحقيبتك لا تتسع للمزيد من هذا العنصر. الحد الأقصى هو **${MAX_POTION_LIMIT}**.`);
        } 
    }

    let moraSuccess = false;
    try {
        await safeQuery(db, `UPDATE levels SET "mora" = CAST("mora" AS BIGINT) - $1 WHERE "user" = $2 AND "guild" = $3`, `UPDATE levels SET mora = CAST(mora AS BIGINT) - $1 WHERE userid = $2 AND guildid = $3`, [finalPrice, interaction.user.id, interaction.guild.id]);
        moraSuccess = true;
    } catch(e) {}

    if(!moraSuccess) return await errorReply('❌ حدث خطأ أثناء خصم الأموال.');

    let itemDeliverySuccess = false;
    try {
        if (couponType === 'boss' && couponIdToDelete) {
            await safeQuery(db, `DELETE FROM user_coupons WHERE "id" = $1`, `DELETE FROM user_coupons WHERE id = $1`, [couponIdToDelete]);
        }
        else if (couponType === 'role') {
            let roleUsageRes = await safeQuery(db, `SELECT "userID" FROM user_role_coupon_usage WHERE "guildID" = $1 AND "userID" = $2`, `SELECT userid FROM user_role_coupon_usage WHERE guildid = $1 AND userid = $2`, [interaction.guild.id, interaction.user.id]).catch(()=>({rows:[]}));
            if (roleUsageRes?.rows?.[0]) {
                await safeQuery(db, `UPDATE user_role_coupon_usage SET "lastUsedTimestamp" = $1 WHERE "guildID" = $2 AND "userID" = $3`, `UPDATE user_role_coupon_usage SET lastusedtimestamp = $1 WHERE guildid = $2 AND userid = $3`, [Date.now(), interaction.guild.id, interaction.user.id]);
            } else {
                await safeQuery(db, `INSERT INTO user_role_coupon_usage ("guildID", "userID", "lastUsedTimestamp") VALUES ($1, $2, $3)`, `INSERT INTO user_role_coupon_usage (guildid, userid, lastusedtimestamp) VALUES ($1, $2, $3)`, [interaction.guild.id, interaction.user.id, Date.now()]);
            }
        }

        if (callbackType === 'item') {
            if (itemData.id === 'personal_guard_1d') { 
                await safeQuery(db, `UPDATE levels SET "hasGuard" = LEAST(COALESCE("hasGuard", 0) + 3, 6), "guardExpires" = 0 WHERE "user" = $1 AND "guild" = $2`, `UPDATE levels SET hasguard = LEAST(COALESCE(hasguard, 0) + 3, 6), guardexpires = 0 WHERE userid = $1 AND guildid = $2`, [interaction.user.id, interaction.guild.id]);
            }
            else if (itemData.category === 'potions' || itemData.id.startsWith('potion_')) { 
                if(ensureInventoryTable) await ensureInventoryTable(db); 
                
                let invCheckRes = await safeQuery(db, `SELECT "id", "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, `SELECT id, quantity FROM user_inventory WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [interaction.user.id, interaction.guild.id, itemData.id]).catch(()=>({rows:[]}));
                if (invCheckRes?.rows?.[0]) {
                    const invId = invCheckRes.rows[0].id || invCheckRes.rows[0].ID;
                    let newQty = Math.min(Number(invCheckRes.rows[0].quantity || invCheckRes.rows[0].Quantity || 0) + 1, MAX_POTION_LIMIT);
                    await safeQuery(db, `UPDATE user_inventory SET "quantity" = $1 WHERE "id" = $2`, `UPDATE user_inventory SET quantity = $1 WHERE id = $2`, [newQty, invId]);
                } else {
                    await safeQuery(db, `INSERT INTO user_inventory ("guildID", "userID", "itemID", "quantity") VALUES ($1, $2, $3, 1)`, `INSERT INTO user_inventory (guildid, userid, itemid, quantity) VALUES ($1, $2, $3, 1)`, [interaction.guild.id, interaction.user.id, itemData.id]);
                }
            }
            else if (itemData.id === 'streak_shield') {
                let existingStreakRes = await safeQuery(db, `SELECT "id" FROM streaks WHERE "userID" = $1 AND "guildID" = $2`, `SELECT id FROM streaks WHERE userid = $1 AND guildid = $2`, [interaction.user.id, interaction.guild.id]).catch(()=>({rows:[]}));
                if (existingStreakRes?.rows?.[0]) {
                    const strkId = existingStreakRes.rows[0].id || existingStreakRes.rows[0].ID;
                    await safeQuery(db, `UPDATE streaks SET "hasItemShield" = COALESCE("hasItemShield", 0) + 1 WHERE "id" = $1`, `UPDATE streaks SET hasitemshield = COALESCE(hasitemshield, 0) + 1 WHERE id = $1`, [strkId]);
                } else {
                    const id = `${interaction.guild.id}-${interaction.user.id}`;
                    await safeQuery(db, `INSERT INTO streaks ("id", "guildID", "userID", "hasItemShield") VALUES ($1, $2, $3, 1)`, `INSERT INTO streaks (id, guildid, userid, hasitemshield) VALUES ($1, $2, $3, 1)`, [id, interaction.guild.id, interaction.user.id]);
                }
            }
            else if (itemData.id === 'streak_shield_media') {
                let existingMediaRes = await safeQuery(db, `SELECT "id" FROM media_streaks WHERE "userID" = $1 AND "guildID" = $2`, `SELECT id FROM media_streaks WHERE userid = $1 AND guildid = $2`, [interaction.user.id, interaction.guild.id]).catch(()=>({rows:[]}));
                if (existingMediaRes?.rows?.[0]) {
                    const medId = existingMediaRes.rows[0].id || existingMediaRes.rows[0].ID;
                    await safeQuery(db, `UPDATE media_streaks SET "hasItemShield" = COALESCE("hasItemShield", 0) + 1 WHERE "id" = $1`, `UPDATE media_streaks SET hasitemshield = COALESCE(hasitemshield, 0) + 1 WHERE id = $1`, [medId]);
                } else {
                    const id = `${interaction.guild.id}-${interaction.user.id}`;
                    await safeQuery(db, `INSERT INTO media_streaks ("id", "guildID", "userID", "hasItemShield") VALUES ($1, $2, $3, 1)`, `INSERT INTO media_streaks (id, guildid, userid, hasitemshield) VALUES ($1, $2, $3, 1)`, [id, interaction.guild.id, interaction.user.id]);
                }
            }
            else if (itemData.id.startsWith('xp_buff_')) {
                let multiplier = 0, buffPercent = 0, duration = 0;
                switch (itemData.id) {
                    case 'xp_buff_1d_3': multiplier = 0.45; buffPercent = 45; duration = 24 * 60 * 60 * 1000; break;
                    case 'xp_buff_1d_7': multiplier = 0.70; buffPercent = 70; duration = 48 * 60 * 60 * 1000; break;
                    case 'xp_buff_2d_10': multiplier = 0.90; buffPercent = 90; duration = 72 * 60 * 60 * 1000; break;
                }
                if (duration > 0) {
                    let buffRes = await safeQuery(db, `SELECT "id" FROM user_buffs WHERE "userID" = $1 AND "guildID" = $2 AND "buffType" = 'xp'`, `SELECT id FROM user_buffs WHERE userid = $1 AND guildid = $2 AND bufftype = 'xp'`, [interaction.user.id, interaction.guild.id]).catch(()=>({rows:[]}));
                    const expiresAt = Date.now() + duration;
                    if (buffRes?.rows?.[0]) {
                        const bfId = buffRes.rows[0].id || buffRes.rows[0].ID;
                        await safeQuery(db, `UPDATE user_buffs SET "multiplier" = $1, "expiresAt" = $2, "buffPercent" = $3 WHERE "id" = $4`, `UPDATE user_buffs SET multiplier = $1, expiresat = $2, buffpercent = $3 WHERE id = $4`, [multiplier, expiresAt, buffPercent, bfId]);
                    } else {
                        await safeQuery(db, `INSERT INTO user_buffs ("userID", "guildID", "buffType", "multiplier", "expiresAt", "buffPercent") VALUES ($1, $2, $3, $4, $5, $6)`, `INSERT INTO user_buffs (userid, guildid, bufftype, multiplier, expiresat, buffpercent) VALUES ($1, $2, $3, $4, $5, $6)`, [interaction.user.id, interaction.guild.id, 'xp', multiplier, expiresAt, buffPercent]);
                    }
                }
            }
            else if (itemData.id === 'farm_worker_3d') {
                const duration = 3 * 24 * 60 * 60 * 1000;
                let existingWorkerRes = await safeQuery(db, `SELECT "expiresAt", "id" FROM user_buffs WHERE "userID" = $1 AND "guildID" = $2 AND "buffType" = 'farm_worker'`, `SELECT expiresat, id FROM user_buffs WHERE userid = $1 AND guildid = $2 AND bufftype = 'farm_worker'`, [interaction.user.id, interaction.guild.id]).catch(()=>({rows:[]}));
                const existingWorker = existingWorkerRes?.rows?.[0];
                let newExpiresAt = Date.now() + duration;
                
                if (existingWorker) {
                    const expMs = Number(existingWorker.expiresAt || existingWorker.expiresat);
                    if (expMs > Date.now()) newExpiresAt = expMs + duration;
                    const workerId = existingWorker.id || existingWorker.ID;
                    await safeQuery(db, `UPDATE user_buffs SET "expiresAt" = $1 WHERE "id" = $2`, `UPDATE user_buffs SET expiresat = $1 WHERE id = $2`, [newExpiresAt, workerId]);
                } else {
                    await safeQuery(db, `INSERT INTO user_buffs ("userID", "guildID", "buffType", "multiplier", "expiresAt", "buffPercent") VALUES ($1, $2, $3, $4, $5, $6)`, `INSERT INTO user_buffs (userid, guildid, bufftype, multiplier, expiresat, buffpercent) VALUES ($1, $2, $3, $4, $5, $6)`, [interaction.user.id, interaction.guild.id, 'farm_worker', 0, newExpiresAt, 0]);
                }
            }
            else if (itemData.id === 'change_race') {
                let allRaceRolesRes = await safeQuery(db, `SELECT "roleID", "raceName" FROM race_roles WHERE "guildID" = $1`, `SELECT roleid, racename FROM race_roles WHERE guildid = $1`, [interaction.guild.id]).catch(()=>({rows:[]}));
                const raceRoleIDs = (allRaceRolesRes?.rows || []).map(r => r.roleID || r.roleid);
                const userRaceRole = interaction.member.roles.cache.find(r => raceRoleIDs.includes(r.id));
                if (userRaceRole) { await interaction.member.roles.remove(userRaceRole).catch(()=>{}); }

                await safeQuery(db, `DELETE FROM race_dungeon_buffs WHERE "guildID" = $1 AND "roleID" = $2`, `DELETE FROM race_dungeon_buffs WHERE guildid = $1 AND roleid = $2`, [interaction.guild.id, userRaceRole ? userRaceRole.id : 'none']).catch(()=>{});
                
                const expiresAt = Date.now() + (7 * 24 * 60 * 60 * 1000);
                let xpBuffCheck = await safeQuery(db, `SELECT "id" FROM user_buffs WHERE "userID" = $1 AND "guildID" = $2 AND "buffType" = 'xp'`, `SELECT id FROM user_buffs WHERE userid = $1 AND guildid = $2 AND bufftype = 'xp'`, [interaction.user.id, interaction.guild.id]).catch(()=>({rows:[]}));
                if (xpBuffCheck?.rows?.[0]) {
                    const xpId = xpBuffCheck.rows[0].id || xpBuffCheck.rows[0].ID;
                    await safeQuery(db, `UPDATE user_buffs SET "buffPercent" = $1, "expiresAt" = $2, "multiplier" = $3 WHERE "id" = $4`, `UPDATE user_buffs SET buffpercent = $1, expiresat = $2, multiplier = $3 WHERE id = $4`, [-5, expiresAt, -0.05, xpId]);
                }
                else await safeQuery(db, `INSERT INTO user_buffs ("guildID", "userID", "buffPercent", "expiresAt", "buffType", "multiplier") VALUES ($1, $2, $3, $4, 'xp', $5)`, `INSERT INTO user_buffs (guildid, userid, buffpercent, expiresat, bufftype, multiplier) VALUES ($1, $2, $3, $4, 'xp', $5)`, [interaction.guild.id, interaction.user.id, -5, expiresAt, -0.05]);
            }
        } 

        await safeQuery(db, `UPDATE levels SET "shop_purchases" = COALESCE("shop_purchases", 0) + 1 WHERE "user" = $1 AND "guild" = $2`, `UPDATE levels SET shop_purchases = COALESCE(shop_purchases, 0) + 1 WHERE userid = $1 AND guildid = $2`, [interaction.user.id, interaction.guild.id]).catch(()=>{});
        itemDeliverySuccess = true;
    } catch (e) {
        itemDeliverySuccess = false;
    }

    if (!itemDeliverySuccess) {
        try { await safeQuery(db, `UPDATE levels SET "mora" = CAST("mora" AS BIGINT) + $1 WHERE "user" = $2 AND "guild" = $3`, `UPDATE levels SET mora = CAST(mora AS BIGINT) + $1 WHERE userid = $2 AND guildid = $3`, [finalPrice, interaction.user.id, interaction.guild.id]); } catch(e){}
        return await errorReply(`❌ **حدث خطأ برمجي داخلي!**\nتم إرجاع **${finalPrice.toLocaleString()}** مورا لحسابك لتجنب ضياعها.`);
    }
    
    let successMsg = `📦 **العنصر:** ${itemData.name || 'Unknown'}\n💰 **التكلفة:** ${finalPrice.toLocaleString()} ${EMOJI_MORA}`;
    if (discountUsed > 0) successMsg += `\n📉 **تم تطبيق خصم:** ${discountUsed}%`;
    if (itemData.id === 'farm_worker_3d') successMsg += `\n👨‍🌾 **عامل المزرعة بدأ العمل!** سيقوم بحصاد المحاصيل وإطعام الحيوانات.`;
    if (itemData.id === 'change_race') successMsg += `\n🧬 **تم مسح عرقك القديم بنجاح!** و تم تطبيق عقوبة النقصان.`;
    
    const successEmbed = new EmbedBuilder()
        .setTitle('✅ تمت عملية الشراء بنجاح')
        .setColor(Colors.Green)
        .setDescription(successMsg)
        .setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL() });

    if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: null, embeds: [successEmbed], components: [] }).catch(()=>{});
    } else {
        await interaction.reply({ content: null, embeds: [successEmbed], components: [], flags: MessageFlags.Ephemeral }).catch(()=>{});
    }
    
    if (sendShopLog) sendShopLog(client, db, interaction.guild.id, interaction.member, itemData.name || "Unknown", finalPrice, `شراء ${discountUsed > 0 ? '(مع كوبون)' : ''}`);
}

async function _handleRodUpgrade(i, client, db) {
    try { if (!i.replied && !i.deferred) await i.deferUpdate(); } catch(e) {}
    
    let userDataRes = await safeQuery(db, `SELECT "mora", "bank" FROM levels WHERE "user" = $1 AND "guild" = $2`, `SELECT mora, bank FROM levels WHERE userid = $1 AND guildid = $2`, [i.user.id, i.guild.id]).catch(()=>({rows:[]}));
    let fishDataRes = await safeQuery(db, `SELECT * FROM user_fishing WHERE "userID" = $1 AND "guildID" = $2`, `SELECT * FROM user_fishing WHERE userid = $1 AND guildid = $2`, [i.user.id, i.guild.id]).catch(()=>({rows:[]}));

    let userData = userDataRes?.rows?.[0];
    if (!userData) return i.followUp({ content: '❌ لا توجد لك بيانات مالية.', flags: MessageFlags.Ephemeral });

    const fishRow = fishDataRes?.rows?.[0] || {};
    const currentLevel = Number(fishRow.rodLevel || fishRow.rodlevel || 1);
    const nextLevel = currentLevel + 1;
    const nextRod = finalRods.find(r => r.level === nextLevel);

    if (!nextRod) return i.followUp({ content: '❌ لقد وصلت للحد الأقصى للسنارة بالفعل!', flags: MessageFlags.Ephemeral });

    if (Number(userData.mora || userData.Mora || 0) < nextRod.price) {
        const userBank = Number(userData.bank || userData.Bank) || 0;
        let msg = `❌ رصيدك غير كافي! تحتاج إلى **${nextRod.price.toLocaleString()}** ${EMOJI_MORA}`;
        if (userBank >= nextRod.price) msg += `\n💡 لديك في البنك **${userBank.toLocaleString()}** مورا. اسحبها أولاً.`;
        return i.followUp({ content: msg, flags: MessageFlags.Ephemeral });
    }

    let moraSuccess = false;
    try {
        await safeQuery(db, `UPDATE levels SET "mora" = CAST("mora" AS BIGINT) - $1 WHERE "user" = $2 AND "guild" = $3`, `UPDATE levels SET mora = CAST(mora AS BIGINT) - $1 WHERE userid = $2 AND guildid = $3`, [nextRod.price, i.user.id, i.guild.id]);
        moraSuccess = true;
    } catch(e) {}

    if (!moraSuccess) return i.followUp({ content: '❌ حدث خطأ أثناء خصم الأموال.', flags: MessageFlags.Ephemeral });

    let fishSuccess = false;
    try {
        if (Object.keys(fishRow).length > 0) {
            await safeQuery(db, 
                `UPDATE user_fishing SET "rodLevel" = $1, "currentRod" = $2 WHERE "userID" = $3 AND "guildID" = $4`,
                `UPDATE user_fishing SET rodlevel = $1, currentrod = $2 WHERE userid = $3 AND guildid = $4`,
                [nextLevel, nextRod.name, i.user.id, i.guild.id]
            );
            fishSuccess = true;
        } else {
            await safeQuery(db, 
                `INSERT INTO user_fishing ("userID", "guildID", "rodLevel", "currentRod", "boatLevel", "currentBoat") VALUES ($1, $2, $3, $4, 1, 'قارب خشب')`,
                `INSERT INTO user_fishing (userid, guildid, rodlevel, currentrod, boatlevel, currentboat) VALUES ($1, $2, $3, $4, 1, 'قارب خشب')`,
                [i.user.id, i.guild.id, nextLevel, nextRod.name]
            );
            fishSuccess = true;
        }
    } catch (e) {
        fishSuccess = false;
    }

    if (!fishSuccess) {
        try { await safeQuery(db, `UPDATE levels SET "mora" = CAST("mora" AS BIGINT) + $1 WHERE "user" = $2 AND "guild" = $3`, `UPDATE levels SET mora = CAST(mora AS BIGINT) + $1 WHERE userid = $2 AND guildid = $3`, [nextRod.price, i.user.id, i.guild.id]); } catch(e){}
        return i.followUp({ content: '❌ حدث خطأ أثناء ترقية السنارة، تم إرجاع أموالك.', flags: MessageFlags.Ephemeral });
    }

    const embed = new EmbedBuilder()
        .setTitle('✅ تمت الترقية بنجاح!')
        .setColor(Colors.Green)
        .setDescription(`تم تطوير سنارتك إلى **${nextRod.name}**\n💰 التكلفة: ${nextRod.price.toLocaleString()} ${EMOJI_MORA}`);
    if (nextRod.image) embed.setThumbnail(nextRod.image);
    
    await i.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
    if(sendShopLog) sendShopLog(client, db, i.guild.id, i.member, `تطوير سنارة (${nextRod.name})`, nextRod.price, "ترقية");
}

async function _handleBoatUpgrade(i, client, db) {
    try { if (!i.replied && !i.deferred) await i.deferUpdate(); } catch(e) {}
    
    let userDataRes = await safeQuery(db, `SELECT "mora", "bank" FROM levels WHERE "user" = $1 AND "guild" = $2`, `SELECT mora, bank FROM levels WHERE userid = $1 AND guildid = $2`, [i.user.id, i.guild.id]).catch(()=>({rows:[]}));
    let fishDataRes = await safeQuery(db, `SELECT * FROM user_fishing WHERE "userID" = $1 AND "guildID" = $2`, `SELECT * FROM user_fishing WHERE userid = $1 AND guildid = $2`, [i.user.id, i.guild.id]).catch(()=>({rows:[]}));

    let userData = userDataRes?.rows?.[0];
    if (!userData) return i.followUp({ content: '❌ لا توجد لك بيانات مالية.', flags: MessageFlags.Ephemeral });

    const fishRow = fishDataRes?.rows?.[0] || {};
    const currentLevel = Number(fishRow.boatLevel || fishRow.boatlevel || 1);
    const nextLevel = currentLevel + 1;
    const nextBoat = finalBoats.find(b => b.level === nextLevel);

    if (!nextBoat) return i.followUp({ content: '❌ لقد وصلت للحد الأقصى للقارب بالفعل!', flags: MessageFlags.Ephemeral });

    if (Number(userData.mora || userData.Mora || 0) < nextBoat.price) {
        const userBank = Number(userData.bank || userData.Bank) || 0;
        let msg = `❌ رصيدك غير كافي! تحتاج إلى **${nextBoat.price.toLocaleString()}** ${EMOJI_MORA}`;
        if (userBank >= nextBoat.price) msg += `\n💡 لديك في البنك **${userBank.toLocaleString()}** مورا. اسحبها أولاً.`;
        return i.followUp({ content: msg, flags: MessageFlags.Ephemeral });
    }

    let moraSuccess = false;
    try {
        await safeQuery(db, `UPDATE levels SET "mora" = CAST("mora" AS BIGINT) - $1 WHERE "user" = $2 AND "guild" = $3`, `UPDATE levels SET mora = CAST(mora AS BIGINT) - $1 WHERE userid = $2 AND guildid = $3`, [nextBoat.price, i.user.id, i.guild.id]);
        moraSuccess = true;
    } catch(e) {}

    if (!moraSuccess) return i.followUp({ content: '❌ حدث خطأ أثناء خصم الأموال.', flags: MessageFlags.Ephemeral });

    let fishSuccess = false;
    try {
        if (Object.keys(fishRow).length > 0) {
            await safeQuery(db, 
                `UPDATE user_fishing SET "boatLevel" = $1, "currentBoat" = $2 WHERE "userID" = $3 AND "guildID" = $4`,
                `UPDATE user_fishing SET boatlevel = $1, currentboat = $2 WHERE userid = $3 AND guildid = $4`,
                [nextLevel, nextBoat.name, i.user.id, i.guild.id]
            );
            fishSuccess = true;
        } else {
            await safeQuery(db, 
                `INSERT INTO user_fishing ("userID", "guildID", "boatLevel", "currentBoat", "rodLevel", "currentRod") VALUES ($1, $2, $3, $4, 1, 'سنارة خشبية')`,
                `INSERT INTO user_fishing (userid, guildid, boatlevel, currentboat, rodlevel, currentrod) VALUES ($1, $2, $3, $4, 1, 'سنارة خشبية')`,
                [i.user.id, i.guild.id, nextLevel, nextBoat.name]
            );
            fishSuccess = true;
        }
    } catch (e) {
        fishSuccess = false;
    }

    if (!fishSuccess) {
        try { await safeQuery(db, `UPDATE levels SET "mora" = CAST("mora" AS BIGINT) + $1 WHERE "user" = $2 AND "guild" = $3`, `UPDATE levels SET mora = CAST(mora AS BIGINT) + $1 WHERE userid = $2 AND guildid = $3`, [nextBoat.price, i.user.id, i.guild.id]); } catch(e){}
        return i.followUp({ content: '❌ حدث خطأ أثناء ترقية القارب، تم إرجاع أموالك.', flags: MessageFlags.Ephemeral });
    }

    const embed = new EmbedBuilder()
        .setTitle('✅ تمت الترقية بنجاح!')
        .setColor(Colors.Green)
        .setDescription(`تم تطوير قاربك إلى **${nextBoat.name}**\n💰 التكلفة: ${nextBoat.price.toLocaleString()} ${EMOJI_MORA}`);
    if (nextBoat.image) embed.setThumbnail(nextBoat.image);

    await i.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
    if(sendShopLog) sendShopLog(client, db, i.guild.id, i.member, `تطوير قارب (${nextBoat.name})`, nextBoat.price, "ترقية");
}

async function _handleShopButton(i, client, db, explicitItemId = null) {
    try {
        try { if (!i.replied && !i.deferred) await i.deferReply({ flags: MessageFlags.Ephemeral }); } catch(e) {}
        
        const userId = i.user.id; 
        const guildId = i.guild.id; 
        const boughtItemId = explicitItemId || i.customId.replace('buy_item_', ''); 
          
        let item = shopItems.find(it => it.id === boughtItemId) || finalPotionItems.find(it => it.id === boughtItemId);
        if (!item) return await i.editReply({ content: '❌ هذا العنصر غير موجود!' });
        
        let userDataRes = await safeQuery(db, `SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2`, `SELECT * FROM levels WHERE userid = $1 AND guildid = $2`, [userId, guildId]).catch(()=>({rows:[]}));
        let userData = userDataRes?.rows?.[0] || { mora: 0, bank: 0 };
          
        const NON_DISCOUNTABLE = ['xp_buff_1d_3', 'xp_buff_1d_7', 'xp_buff_2d_10'];
        
        if (item.id === 'personal_guard_1d') {
            if (Number(userData.hasGuard || userData.hasguard || 0) >= 6) {
                return await i.editReply({ content: `🚫 **لا يمكنك الشراء!**\nلديك بالفعل أقصى عدد من محاولات حماية الحارس الشخصي (الحد الأقصى 6).` });
            }
        }
        else if (item.id === 'streak_shield') {
            let existingRes = await safeQuery(db, `SELECT "hasItemShield" FROM streaks WHERE "userID" = $1 AND "guildID" = $2`, `SELECT hasitemshield FROM streaks WHERE userid = $1 AND guildid = $2`, [userId, guildId]).catch(()=>({rows:[]}));
            const currentShields = Number(existingRes?.rows?.[0]?.hasItemShield || existingRes?.rows?.[0]?.hasitemshield || 0);
            if (currentShields >= 3) {
                return await i.editReply({ content: `🚫 **درعك ممتلئ!**\nلديك **${currentShields}** دروع ستريك نشطة حالياً. لا يمكنك شراء المزيد.` });
            }
        }
        else if (item.id === 'streak_shield_media') {
            let existingRes = await safeQuery(db, `SELECT "hasItemShield" FROM media_streaks WHERE "userID" = $1 AND "guildID" = $2`, `SELECT hasitemshield FROM media_streaks WHERE userid = $1 AND guildid = $2`, [userId, guildId]).catch(()=>({rows:[]}));
            const currentShields = Number(existingRes?.rows?.[0]?.hasItemShield || existingRes?.rows?.[0]?.hasitemshield || 0);
            if (currentShields >= 3) {
                return await i.editReply({ content: `🚫 **درع الميديا ممتلئ!**\nلديك **${currentShields}** دروع نشطة حالياً. لا يمكنك شراء المزيد.` });
            }
        }
        else if (item.id === 'farm_worker_3d') {
            let existingWorkerRes = await safeQuery(db, `SELECT "expiresAt" FROM user_buffs WHERE "userID" = $1 AND "guildID" = $2 AND "buffType" = 'farm_worker'`, `SELECT expiresat FROM user_buffs WHERE userid = $1 AND guildid = $2 AND bufftype = 'farm_worker'`, [userId, guildId]).catch(()=>({rows:[]}));
            const existingWorker = existingWorkerRes?.rows?.[0];
            const expiresAtMs = Number(existingWorker?.expiresAt || existingWorker?.expiresat || 0);
            const remainingDays = Math.ceil((expiresAtMs - Date.now()) / (24 * 60 * 60 * 1000));
            
            if (remainingDays >= 6) {
                return await i.editReply({ content: `🚫 **لا يمكنك توظيف عمال إضافيين!**\nوقت العامل الحالي يتجاوز الحد الأقصى المسموح (يتبقى له ${remainingDays} أيام).` });
            }
        }
        else if (item.id.startsWith('xp_buff_')) {
            let getActiveBuffRes = await safeQuery(db, `SELECT * FROM user_buffs WHERE "userID" = $1 AND "guildID" = $2 AND "buffType" = 'xp' AND "expiresAt" > $3`, `SELECT * FROM user_buffs WHERE userid = $1 AND guildid = $2 AND bufftype = 'xp' AND expiresat > $3`, [userId, guildId, Date.now()]).catch(()=>({rows:[]}));
            if (getActiveBuffRes?.rows?.[0]) {
                const replaceButton = new ButtonBuilder().setCustomId(`replace_buff_${item.id}`).setLabel("إلغاء القديم وشراء الجديد").setStyle(ButtonStyle.Danger);
                const cancelButton = new ButtonBuilder().setCustomId('cancel_purchase').setLabel("إلغاء").setStyle(ButtonStyle.Secondary);
                const row = new ActionRowBuilder().addComponents(replaceButton, cancelButton);
                return await i.editReply({ content: `⚠️ لديك معزز خبرة فعال بالفعل! (لا يمكن دمج معززين في نفس الوقت)`, components: [row], embeds: [] });
            }
        }

        if (NON_DISCOUNTABLE.includes(item.id) || item.id.startsWith('xp_buff_')) {
             if (Number(userData.mora || userData.Mora || 0) < item.price) {
                 const userBank = Number(userData.bank || userData.Bank) || 0;
                 let msg = `❌ رصيدك غير كافي!`;
                 if (userBank >= item.price) msg += `\n💡 لديك في البنك **${userBank.toLocaleString()}** مورا، اسحب منها.`;
                 return await i.editReply({ content: msg });
             }
             await processFinalPurchase(i, item, 1, item.price, 0, 'none', client, db, 'item');
             return;
        }
        
        await handlePurchaseWithCoupons(i, item, 1, item.price, client, db, 'item');

    } catch (error) { 
        if (i.replied || i.deferred) await i.followUp({ content: '❌ حدث خطأ.', flags: MessageFlags.Ephemeral }); 
        else await i.reply({ content: '❌ حدث خطأ.', flags: MessageFlags.Ephemeral }); 
    }
}

async function _handleBaitBuy(i, client, db, baitId) {
    try { if(!i.deferred && !i.replied) await i.deferReply({ flags: MessageFlags.Ephemeral }); } catch(e) {}
    const bait = finalBaits.find(b => b.id === baitId);
    if (!bait) return i.editReply({ content: '❌ هذا العنصر غير موجود!' });
    
    const qty = 5; 
    const unitPrice = Math.round(bait.price / 5);
    const cost = unitPrice * qty; 
    
    let userDataRes = await safeQuery(db, `SELECT "mora", "bank" FROM levels WHERE "user" = $1 AND "guild" = $2`, `SELECT mora, bank FROM levels WHERE userid = $1 AND guildid = $2`, [i.user.id, i.guild.id]).catch(()=>({rows:[]}));
    let userData = userDataRes?.rows?.[0];
    if (!userData) return i.editReply('❌ لا توجد لك بيانات في النظام.');

    if (Number(userData.mora || userData.Mora || 0) < cost) {
        const userBank = Number(userData.bank || userData.Bank) || 0;
        let msg = `❌ رصيدك غير كافي لشراء هذه الحزمة! تحتاج إلى **${cost.toLocaleString()}** ${EMOJI_MORA}`;
        if (userBank >= cost) msg += `\n💡 لديك في البنك **${userBank.toLocaleString()}** مورا، اسحب منها.`;
        return i.editReply(msg);
    }
    
    let moraSuccess = false;
    try {
        await safeQuery(db, `UPDATE levels SET "mora" = CAST("mora" AS BIGINT) - $1 WHERE "user" = $2 AND "guild" = $3`, `UPDATE levels SET mora = CAST(mora AS BIGINT) - $1 WHERE userid = $2 AND guildid = $3`, [cost, i.user.id, i.guild.id]);
        moraSuccess = true;
    } catch(e) {}

    if(!moraSuccess) return i.editReply('❌ حدث خطأ أثناء خصم الأموال.');
    
    let itemSuccess = false;
    try { 
        let invCheckRes = await safeQuery(db, `SELECT "id", "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, `SELECT id, quantity FROM user_inventory WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [i.user.id, i.guild.id, baitId]).catch(()=>({rows:[]}));
        if (invCheckRes?.rows?.[0]) {
            const invId = invCheckRes.rows[0].id || invCheckRes.rows[0].ID;
            let newQty = Math.min(Number(invCheckRes.rows[0].quantity || invCheckRes.rows[0].Quantity || 0) + qty, MAX_FARM_LIMIT);
            await safeQuery(db, `UPDATE user_inventory SET "quantity" = $1 WHERE "id" = $2`, `UPDATE user_inventory SET quantity = $1 WHERE id = $2`, [newQty, invId]);
            itemSuccess = true;
        } else {
            await safeQuery(db, `INSERT INTO user_inventory ("guildID", "userID", "itemID", "quantity") VALUES ($1, $2, $3, $4)`, `INSERT INTO user_inventory (guildid, userid, itemid, quantity) VALUES ($1, $2, $3, $4)`, [i.guild.id, i.user.id, baitId, qty]);
            itemSuccess = true;
        }
    } catch(e) { 
        itemSuccess = false;
    }

    if (!itemSuccess) {
        try { await safeQuery(db, `UPDATE levels SET "mora" = CAST("mora" AS BIGINT) + $1 WHERE "user" = $2 AND "guild" = $3`, `UPDATE levels SET mora = CAST(mora AS BIGINT) + $1 WHERE userid = $2 AND guildid = $3`, [cost, i.user.id, i.guild.id]); } catch(e){}
        return i.editReply('❌ حدث خطأ أثناء إضافة العنصر لمخزنك. تم استرجاع أموالك.');
    }
    
    const successEmbed = new EmbedBuilder()
        .setTitle('✅ تمت عملية الشراء بنجاح')
        .setColor(Colors.Green)
        .setDescription(`📦 **العنصر:** حزمة (${qty} حبات) من ${bait.name}\n💰 **التكلفة:** ${cost.toLocaleString()} ${EMOJI_MORA}`)
        .setAuthor({ name: i.user.username, iconURL: i.user.displayAvatarURL() });

    await i.editReply({ content: null, embeds: [successEmbed] });
    if(sendShopLog) sendShopLog(client, db, i.guild.id, i.member, `حزمة طعم: ${bait.name} (x${qty})`, cost, "شراء");
}

async function _handleReplaceGuard(i, client, db) {
    try {
        try { if (!i.replied && !i.deferred) await i.deferUpdate(); } catch(e) {}
        const userId = i.user.id; 
        const guildId = i.guild.id; 
        const item = shopItems.find(it => it.id === 'personal_guard_1d');
        
        let userDataRes = await safeQuery(db, `SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2`, `SELECT * FROM levels WHERE userid = $1 AND guildid = $2`, [userId, guildId]).catch(()=>({rows:[]}));
        let userData = userDataRes?.rows?.[0] || { mora: 0, bank: 0, hasGuard: 0 };
        
        if (Number(userData.hasGuard || userData.hasguard || 0) >= 6) {
            return await i.followUp({ content: `🚫 لديك بالفعل أقصى عدد من محاولات الحارس الشخصي.`, flags: MessageFlags.Ephemeral });
        }

        if (Number(userData.mora || userData.Mora || 0) < item.price) {
            const userBank = Number(userData.bank || userData.Bank) || 0;
            let msg = `❌ رصيدك غير كافي! تحتاج إلى **${item.price.toLocaleString()}** ${EMOJI_MORA}`;
            if (userBank >= item.price) msg += `\n💡 لديك في البنك **${userBank.toLocaleString()}** مورا.`;
            return await i.followUp({ content: msg, flags: MessageFlags.Ephemeral });
        }
        
        await safeQuery(db, 
            `UPDATE levels SET "mora" = CAST("mora" AS BIGINT) - $1, "hasGuard" = LEAST(COALESCE("hasGuard", 0) + 3, 6), "guardExpires" = 0 WHERE "user" = $2 AND "guild" = $3`,
            `UPDATE levels SET mora = CAST(mora AS BIGINT) - $1, hasguard = LEAST(COALESCE(hasguard, 0) + 3, 6), guardexpires = 0 WHERE userid = $2 AND guildid = $3`,
            [item.price, userId, guildId]
        );
        
        const successEmbed = new EmbedBuilder()
            .setTitle('✅ تمت عملية التجديد بنجاح')
            .setColor(Colors.Green)
            .setDescription(`📦 **العنصر:** حارس شخصي\n💰 **التكلفة:** ${item.price.toLocaleString()} ${EMOJI_MORA}`)
            .setAuthor({ name: i.user.username, iconURL: i.user.displayAvatarURL() });

        await i.followUp({ embeds: [successEmbed], flags: MessageFlags.Ephemeral });
        if(sendShopLog) sendShopLog(client, db, guildId, i.member, "حارس شخصي (تجديد)", item.price, "شراء");
    } catch (error) { }
}

async function _handleReplaceBuffButton(i, client, db) {
    try {
        try { if (!i.replied && !i.deferred) await i.deferUpdate(); } catch(e) {}
        const userId = i.user.id; 
        const guildId = i.guild.id; 
        const newItemId = i.customId.replace('replace_buff_', '');
        const item = shopItems.find(it => it.id === newItemId);
        
        if (!item) return await i.followUp({ content: '❌ هذا العنصر غير موجود!', flags: MessageFlags.Ephemeral });
        
        let userDataRes = await safeQuery(db, `SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2`, `SELECT * FROM levels WHERE userid = $1 AND guildid = $2`, [userId, guildId]).catch(()=>({rows:[]}));
        let userData = userDataRes?.rows?.[0] || { mora: 0, bank: 0 };
        
        if (Number(userData.mora || userData.Mora || 0) < item.price) {
            const userBank = Number(userData.bank || userData.Bank) || 0;
            let msg = `❌ رصيدك غير كافي! تحتاج إلى **${item.price.toLocaleString()}** ${EMOJI_MORA}`;
            if (userBank >= item.price) msg += `\n💡 لديك في البنك **${userBank.toLocaleString()}** مورا.`;
            return await i.followUp({ content: msg, flags: MessageFlags.Ephemeral });
        }
        
        let moraSuccess = false;
        try {
            await safeQuery(db, `UPDATE levels SET "mora" = CAST("mora" AS BIGINT) - $1 WHERE "user" = $2 AND "guild" = $3`, `UPDATE levels SET mora = CAST(mora AS BIGINT) - $1 WHERE userid = $2 AND guildid = $3`, [item.price, userId, guildId]);
            moraSuccess = true;
        } catch(e) {}

        if (!moraSuccess) return await i.followUp({ content: '❌ حدث خطأ أثناء خصم الأموال.', flags: MessageFlags.Ephemeral });

        try {
            await safeQuery(db, `DELETE FROM user_buffs WHERE "userID" = $1 AND "guildID" = $2 AND "buffType" = 'xp'`, `DELETE FROM user_buffs WHERE userid = $1 AND guildid = $2 AND bufftype = 'xp'`, [userId, guildId]);
            
            let expiresAt, multiplier, buffPercent;
            switch (item.id) {
                case 'xp_buff_1d_3': multiplier = 0.45; buffPercent = 45; expiresAt = Date.now() + (24 * 60 * 60 * 1000); break;
                case 'xp_buff_1d_7': multiplier = 0.70; buffPercent = 70; expiresAt = Date.now() + (48 * 60 * 60 * 1000); break;
                case 'xp_buff_2d_10': multiplier = 0.90; buffPercent = 90; expiresAt = Date.now() + (72 * 60 * 60 * 1000); break;
            }
            
            if (multiplier > 0) {
                await safeQuery(db, `INSERT INTO user_buffs ("userID", "guildID", "buffType", "multiplier", "expiresAt", "buffPercent") VALUES ($1, $2, $3, $4, $5, $6)`, `INSERT INTO user_buffs (userid, guildid, bufftype, multiplier, expiresat, buffpercent) VALUES ($1, $2, $3, $4, $5, $6)`, [userId, guildId, 'xp', multiplier, expiresAt, buffPercent]);
            }

            await safeQuery(db, `UPDATE levels SET "shop_purchases" = COALESCE("shop_purchases", 0) + 1 WHERE "user" = $1 AND "guild" = $2`, `UPDATE levels SET shop_purchases = COALESCE(shop_purchases, 0) + 1 WHERE userid = $1 AND guildid = $2`, [userId, guildId]);
            
            const successEmbed = new EmbedBuilder()
                .setTitle('✅ تمت عملية الشراء بنجاح')
                .setColor(Colors.Green)
                .setDescription(`📦 **العنصر:** ${item.name} (استبدال)\n💰 **التكلفة:** ${item.price.toLocaleString()} ${EMOJI_MORA}`)
                .setAuthor({ name: i.user.username, iconURL: i.user.displayAvatarURL() });

            await i.followUp({ embeds: [successEmbed], flags: MessageFlags.Ephemeral });
            if(sendShopLog) sendShopLog(client, db, guildId, i.member, item.name, item.price, "استبدال/شراء");
        } catch(e) {
            try { await safeQuery(db, `UPDATE levels SET "mora" = CAST("mora" AS BIGINT) + $1 WHERE "user" = $2 AND "guild" = $3`, `UPDATE levels SET mora = CAST(mora AS BIGINT) + $1 WHERE userid = $2 AND guildid = $3`, [item.price, userId, guildId]); } catch(e2){}
        }
    } catch (error) { }
}

async function _handlePotionSelect(i, client, db) {
    try {
        if(i.replied || i.deferred) await i.followUp({ content: "جاري التحميل...", flags: MessageFlags.Ephemeral });
        else await i.deferReply({ flags: MessageFlags.Ephemeral });
    } catch(e) {}
      
    if (finalPotionItems.length === 0) return i.editReply({ content: "❌ لا توجد جرعات متاحة حالياً." });

    const potionOptions = finalPotionItems.slice(0, 25).map(p => {
        return { label: p.name, description: `${p.price.toLocaleString()} مورا | ${p.description.substring(0, 50)}`, value: `buy_item_${p.id}`, emoji: p.emoji };
    });

    const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('shop_buy_potion_menu').setPlaceholder('اختر الجرعة لشرائها...').addOptions(potionOptions));
    const embed = new EmbedBuilder().setTitle('🧪 متجر الجرعات السحرية').setDescription('اختر الجرعة التي تريد شراءها من القائمة بالأسفل.').setColor(Colors.Purple).setImage(BANNER_URL);

    await i.editReply({ embeds: [embed], components: [row] });
}

async function _handleFishingMenu(i, client, db) {
    try { if (!i.replied && !i.deferred) await i.deferReply({ flags: MessageFlags.Ephemeral }); } catch(e) {} 
    const embed = new EmbedBuilder().setTitle('🎣 عـدة الـصـيـد').setDescription('اختر القسم الذي تريد تصفحه:').setColor(Colors.Aqua).setImage(BANNER_URL);
    const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('fishing_gear_sub_menu').setPlaceholder('اختر الفئة...').addOptions(
        { label: 'السنارات', value: 'gear_rods', emoji: '🎣' }, { label: 'القوارب', value: 'gear_boats', emoji: '🚤' }, { label: 'الطعوم', value: 'gear_baits', emoji: '🪱' }
    ));
    await i.editReply({ embeds: [embed], components: [row] });
}

async function _handleRodSelect(i, client, db) {
    try {
        if(i.replied || i.deferred) await i.editReply("جاري التحميل..."); else await i.deferReply({ flags: MessageFlags.Ephemeral });
    } catch(e) {}
    let userDataRes = await safeQuery(db, `SELECT "rodLevel" FROM user_fishing WHERE "userID" = $1 AND "guildID" = $2`, `SELECT rodlevel FROM user_fishing WHERE userid = $1 AND guildid = $2`, [i.user.id, i.guild.id]).catch(()=>({rows:[]}));
    let userData = userDataRes?.rows?.[0];
    const currentLevel = userData ? (Number(userData.rodLevel || userData.rodlevel) || 1) : 1;
    const nextLevel = currentLevel + 1;
    const currentRod = finalRods.find(r => r.level === currentLevel) || finalRods[0];
    const nextRod = finalRods.find(r => r.level === nextLevel);
    
    if(!currentRod) return i.editReply("❌ بيانات السنارات غير متوفرة.");

    const embed = new EmbedBuilder().setTitle(`🎣 سنارة الصيد`).setDescription(`**السنارة الحالية:** ${currentRod.name}`).setColor(Colors.Aqua).setImage(BANNER_URL)
        .addFields({ name: 'المستوى الحالي', value: `Lv. ${currentLevel}`, inline: true }, { name: 'أقصى صيد', value: `${currentRod.max_fish} سمكات`, inline: true }, { name: 'الحظ', value: `+${currentRod.luck_bonus}%`, inline: true });
    if(currentRod.image) embed.setThumbnail(currentRod.image);
    
    const row = new ActionRowBuilder();
    if (!nextRod) {
        embed.addFields({ name: "التطوير القادم", value: "الحد الأقصى", inline: true });
        row.addComponents(new ButtonBuilder().setCustomId('max_rod').setLabel('MAX').setStyle(ButtonStyle.Secondary).setDisabled(true));
    } else {
        embed.addFields({ name: "التالي", value: nextRod.name, inline: true }, { name: "السعر", value: `${nextRod.price.toLocaleString()}`, inline: true });
        row.addComponents(new ButtonBuilder().setCustomId('upgrade_rod').setLabel('تطوير').setStyle(ButtonStyle.Success).setEmoji('⬆️'));
    }
    await i.editReply({ embeds: [embed], components: [row] });
}

async function _handleBoatSelect(i, client, db) {
    try {
        if(i.replied || i.deferred) await i.editReply("جاري التحميل..."); else await i.deferReply({ flags: MessageFlags.Ephemeral });
    } catch(e) {}
    let userDataRes = await safeQuery(db, `SELECT "boatLevel" FROM user_fishing WHERE "userID" = $1 AND "guildID" = $2`, `SELECT boatlevel FROM user_fishing WHERE userid = $1 AND guildid = $2`, [i.user.id, i.guild.id]).catch(()=>({rows:[]}));
    let userData = userDataRes?.rows?.[0];
    const currentLevel = userData ? (Number(userData.boatLevel || userData.boatlevel) || 1) : 1;
    const nextLevel = currentLevel + 1;
    const currentBoat = finalBoats.find(b => b.level === currentLevel) || finalBoats[0];
    const nextBoat = finalBoats.find(b => b.level === nextLevel);
    
    if(!currentBoat) return i.editReply("❌ بيانات القوارب غير متوفرة.");

    const embed = new EmbedBuilder().setTitle(`🚤 قـوارب الـصـيـد`).setDescription(`**القارب الحالي:** ${currentBoat.name}`).setColor(Colors.Blue).setImage(BANNER_URL);
    if(currentBoat.image) embed.setThumbnail(currentBoat.image);
    
    const row = new ActionRowBuilder();
    if (!nextBoat) {
        embed.addFields({ name: "التطوير", value: "الحد الأقصى", inline: true });
        row.addComponents(new ButtonBuilder().setCustomId('max_boat').setLabel('MAX').setStyle(ButtonStyle.Secondary).setDisabled(true));
    } else {
        embed.addFields({ name: "القادم", value: nextBoat.name, inline: true }, { name: "السعر", value: `${nextBoat.price.toLocaleString()}`, inline: true }, { name: "يفتح", value: nextBoat.location_id, inline: false });
        row.addComponents(new ButtonBuilder().setCustomId('upgrade_boat').setLabel('شراء').setStyle(ButtonStyle.Success).setEmoji('🚤'));
    }
    await i.editReply({ embeds: [embed], components: [row] });
}

async function _handleBaitSelect(i, client, db) {
    try {
        if(i.replied || i.deferred) await i.editReply({ content: "جاري التحميل..." }); 
        else await i.deferReply({ flags: MessageFlags.Ephemeral });
    } catch(e) {}
    
    if (finalBaits.length === 0) return i.editReply({ content: "❌ لا توجد طعوم في المتجر حالياً." });
    
    const baitOptions = finalBaits.map(b => ({
        label: b.name,
        description: `${b.price} مورا | حزمة (5 حبات)`,
        value: `buy_bait_${b.id}`,
        emoji: '🪱'
    }));
    
    const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('shop_buy_bait_menu')
            .setPlaceholder('اختر الطعم لشرائه...')
            .addOptions(baitOptions)
    );
    
    const embed = new EmbedBuilder().setTitle('🪱 متجر الطعوم').setDescription('اختر الطعم الذي تود شراءه من القائمة السفلية (يتم بيع الطعوم كحزم، كل حزمة تحتوي على 5 طعوم).').setColor(Colors.Orange);
    await i.editReply({ content: null, embeds: [embed], components: [row] });
}

async function handleShopModal(i, client, db) {
    if (i.customId === 'exchange_xp_modal') {
        try {
            try { if (!i.replied && !i.deferred) await i.deferReply({ flags: MessageFlags.Ephemeral }); } catch(e) {}
            const userId = i.user.id; 
            const guildId = i.guild.id;
            
            let userLoanRes = await safeQuery(db, `SELECT 1 FROM user_loans WHERE "userID" = $1 AND "guildID" = $2 AND "remainingAmount" > 0`, `SELECT 1 FROM user_loans WHERE userid = $1 AND guildid = $2 AND remainingamount > 0`, [userId, guildId]).catch(()=>({rows:[]}));
            if (userLoanRes?.rows?.length > 0) return await i.editReply({ content: `❌ لا يمكنك تبادل الخبرة بينما عليك قرض في البنك.` });
            
            let userDataRes = await safeQuery(db, `SELECT "mora", "bank" FROM levels WHERE "user" = $1 AND "guild" = $2`, `SELECT mora, bank FROM levels WHERE userid = $1 AND guildid = $2`, [userId, guildId]).catch(()=>({rows:[]}));
            let userData = userDataRes?.rows?.[0];
            if (!userData) return await i.editReply({ content: `❌ لا توجد لك بيانات في النظام.` });
            
            const userMora = Number(userData.mora || userData.Mora) || 0;
            const amountString = i.fields.getTextInputValue('xp_amount_input').trim().toLowerCase();
            let amountToBuy = 0;
            
            if (amountString === 'all') amountToBuy = Math.floor(userMora / CUSTOM_XP_RATE);
            else amountToBuy = parseInt(amountString.replace(/,/g, ''));
            
            if (isNaN(amountToBuy) || amountToBuy <= 0) return await i.editReply({ content: '❌ يرجى إدخال رقم صحيح أو كتابة All.' });
            
            const totalCost = amountToBuy * CUSTOM_XP_RATE;
            
            if (userMora < totalCost) {
                const userBank = Number(userData.bank || userData.Bank) || 0;
                let msg = `❌ رصيدك غير كافي. تحتاج إلى **${totalCost.toLocaleString()}** مورا.`;
                if (userBank >= totalCost) msg += `\n💡 لديك في البنك **${userBank.toLocaleString()}** مورا، قم بسحبها أولاً.`;
                return await i.editReply({ content: msg });
            }
            
            let moraSuccess = false;
            try {
                await safeQuery(db, `UPDATE levels SET "mora" = CAST("mora" AS BIGINT) - $1 WHERE "user" = $2 AND "guild" = $3`, `UPDATE levels SET mora = CAST(mora AS BIGINT) - $1 WHERE userid = $2 AND guildid = $3`, [totalCost, userId, guildId]);
                moraSuccess = true;
            } catch(e) {}

            if(!moraSuccess) return await i.editReply({ content: '❌ حدث خطأ أثناء الخصم.' });

            try {
                if (addXPAndCheckLevel) {
                    await addXPAndCheckLevel(client, i.member, db, amountToBuy, 0, false).catch(()=>{});
                } else {
                    await safeQuery(db, 
                        `UPDATE levels SET "xp" = "xp" + $1, "totalXP" = "totalXP" + $1 WHERE "user" = $2 AND "guild" = $3`, 
                        `UPDATE levels SET xp = xp + $1, totalxp = totalxp + $1 WHERE userid = $2 AND guildid = $3`, 
                        [amountToBuy, userId, guildId]
                    );
                }

                const successEmbed = new EmbedBuilder()
                    .setTitle('✅ تمت عملية التبادل بنجاح')
                    .setColor(Colors.Green)
                    .setDescription(`📦 **العنصر:** ${amountToBuy.toLocaleString()} إكس بي (XP)\n💰 **التكلفة:** ${totalCost.toLocaleString()} ${EMOJI_MORA}\n*(التحويل: 1 إكس بي = ${CUSTOM_XP_RATE} مورا)*`)
                    .setAuthor({ name: i.user.username, iconURL: i.user.displayAvatarURL() });

                await i.editReply({ content: null, embeds: [successEmbed] });
                if(sendShopLog) sendShopLog(client, db, guildId, i.member, `شراء ${amountToBuy} XP`, totalCost, "تبادل خبرة");
            } catch(e) {
                try { await safeQuery(db, `UPDATE levels SET "mora" = CAST("mora" AS BIGINT) + $1 WHERE "user" = $2 AND "guild" = $3`, `UPDATE levels SET mora = CAST(mora AS BIGINT) + $1 WHERE userid = $2 AND guildid = $3`, [totalCost, userId, guildId]); } catch(e2){}
                return await i.editReply({ content: '❌ حدث خطأ أثناء التبادل. تم إرجاع أموالك.' });
            }
        } catch (e) { }
        return true;
    }
    return false;
}

async function handleShopInteractions(i, client, db) {
    if (i.isStringSelectMenu() && i.customId === 'shop_buy_select') {
        const rawId = i.values[0].replace('buy_item_', '');
        
        if (rawId === 'fishing_gear_menu') return await _handleFishingMenu(i, client, db);
        if (rawId === 'potions_menu') return await _handlePotionSelect(i, client, db);
        if (rawId === 'exchange_xp') {
             const btn = new ButtonBuilder().setCustomId('open_xp_modal').setLabel('🪙 بدء التبادل').setStyle(ButtonStyle.Primary);
             const embed = new EmbedBuilder().setTitle('تبديل الخبرة').setDescription(`السعر: ${CUSTOM_XP_RATE} مورا = 1 إكس بي (XP)`).setColor(Colors.Blue).setImage(BANNER_URL);
             return await i.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(btn)], flags: MessageFlags.Ephemeral });
        }

        return await sendItemDetailsEmbed(i, rawId, 'general');
    }

    if (i.isButton() && i.customId === 'open_xp_modal') {
         const xpModal = new ModalBuilder().setCustomId('exchange_xp_modal').setTitle(`تبادل الخبرة (1 XP = ${CUSTOM_XP_RATE} Mora)`);
         xpModal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('xp_amount_input').setLabel('الكمية (اكتب All للكل)').setStyle(TextInputStyle.Short).setRequired(true)));
         return await i.showModal(xpModal);
    }

    if (i.isStringSelectMenu() && i.customId === 'fishing_gear_sub_menu') {
        const val = i.values[0];
        if (val === 'gear_rods') await _handleRodSelect(i, client, db);
        else if (val === 'gear_boats') await _handleBoatSelect(i, client, db);
        else if (val === 'gear_baits') await _handleBaitSelect(i, client, db);
        return;
    }

    if (i.isStringSelectMenu() && i.customId === 'shop_buy_potion_menu') {
        const potionId = i.values[0].replace('buy_item_', '');
        return await sendItemDetailsEmbed(i, potionId, 'general');
    }

    if (i.isStringSelectMenu() && i.customId === 'shop_buy_bait_menu') {
        const baitId = i.values[0].replace('buy_bait_', '');
        return await sendItemDetailsEmbed(i, baitId, 'bait');
    }

    if (i.isButton() && i.customId.startsWith('buy_confirm_bait_')) {
        const baitId = i.customId.replace('buy_confirm_bait_', '');
        return await _handleBaitBuy(i, client, db, baitId);
    }
    
    if (i.isButton() && i.customId === 'upgrade_rod') return await _handleRodUpgrade(i, client, db);
    if (i.isButton() && i.customId === 'upgrade_boat') return await _handleBoatUpgrade(i, client, db);

    if (i.isButton() && i.customId.startsWith('buy_item_')) {
        const boughtItemId = i.customId.replace('buy_item_', ''); 
        return await _handleShopButton(i, client, db, boughtItemId);
    }
    
    if (i.customId.startsWith('replace_buff_')) await _handleReplaceBuffButton(i, client, db);
    else if (i.customId === 'cancel_purchase') { 
        try { if (!i.replied && !i.deferred) await i.deferUpdate(); } catch(e) {} 
        await i.editReply({ content: 'تم الإلغاء.', components: [], embeds: [] }); 
    }
    else if (i.customId === 'replace_guard') await _handleReplaceGuard(i, client, db);
}

module.exports = {
    handleShopModal,
    handleShopInteractions
};
