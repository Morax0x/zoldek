const { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    StringSelectMenuBuilder, 
    StringSelectMenuOptionBuilder, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    ComponentType, 
    Colors, 
    MessageFlags 
} = require("discord.js");

// 🔥 استيراد الدالة السحرية المركزية للتلفيل الصامت 🔥
let addXPAndCheckLevel;
try { ({ addXPAndCheckLevel } = require('../handler-utils.js')); } 
catch (e) { try { ({ addXPAndCheckLevel } = require('./handler-utils.js')); } catch (e2) {} }

let utils;
try { utils = require('./utils.js'); } 
catch (e) { try { utils = require('./shop_system/utils.js'); } catch (e2) { utils = {}; } }

const { 
    shopItems = [], potionItems = [], weaponsConfig = [], skillsConfig = [], rodsConfig = [], boatsConfig = [], baitsConfig = [], 
    EMOJI_MORA = '<:mora:1435647151349698621>', OWNER_ID, BANNER_URL, THUMBNAILS, 
    ensureInventoryTable, sendShopLog 
} = utils;

const CUSTOM_XP_RATE = 5; 
const MAX_FARM_LIMIT = 1000;
const MAX_POTION_LIMIT = 999;

let _handleFarmTransaction, _handleMarketTransaction, updateMarketPrices;
try { const m = require('./farm.js'); _handleFarmTransaction = m._handleFarmTransaction; } catch(e) { try { const m = require('./shop_system/farm.js'); _handleFarmTransaction = m._handleFarmTransaction; } catch(e2) {} }
try { const m = require('./market.js'); _handleMarketTransaction = m._handleMarketTransaction; updateMarketPrices = m.updateMarketPrices; } catch(e) { try { const m = require('./shop_system/market.js'); _handleMarketTransaction = m._handleMarketTransaction; updateMarketPrices = m.updateMarketPrices; } catch(e2) {} }

const EXCLUDED_FROM_MAIN_MENU = ['upgrade_weapon', 'upgrade_skill', 'upgrade_rod', 'fishing_gear_menu', 'potions_menu', 'exchange_xp'];

const emojiMap = new Map([
    ['upgrade_weapon', '⚔️'],
    ['upgrade_skill', '<:goldgem:979098126591868928>'],
    ['exchange_xp', '<a:levelup:1437805366048985290>'],
    ['personal_guard_1d', '<:FBI:1439666820016508929>'],
    ['streak_shield', '<:Shield:1437804676224516146>'],
    ['xp_buff_1d_3', '<:oboost:1439665972587003907>'],
    ['xp_buff_1d_7', '<:sboosting:1439665969864773663>'],
    ['xp_buff_2d_10', '<:gboost:1439665966354268201>'],
    ['vip_role_3d', '<a:JaFaster:1435572430042042409>'],
    ['change_race', '🧬'],
    ['fishing_gear_menu', '🎣'],
    ['potions_menu', '🧪'],
    ['farm_worker_3d', '👨‍🌾'] 
]);

function getBuyableItems() { 
    return shopItems.filter(it => it.category !== 'menus' && !EXCLUDED_FROM_MAIN_MENU.includes(it.id)); 
}

function getPotionItems() { return potionItems; }

function getGeneralSkills() { return skillsConfig.filter(s => s.id.startsWith('skill_')); }

function getRaceSkillConfig(raceName) { 
    if (!raceName) return null;
    return skillsConfig.find(s => {
        if (!s.id.startsWith('race_')) return false;
        const idName = s.id.replace('race_', '').replace('_skill', '').replace(/_/g, ' ').toLowerCase();
        return idName === raceName.toLowerCase();
    }); 
}

async function getUserRace(member, db) { 
    if (!member || !member.roles) return null;
    let res;
    try { res = await db.query(`SELECT "roleID", "raceName" FROM race_roles WHERE "guildID" = $1`, [member.guild.id]); }
    catch(e) { res = await db.query(`SELECT roleid as "roleID", racename as "raceName" FROM race_roles WHERE guildid = $1`, [member.guild.id]).catch(()=>({rows:[]})); }
    const userRoleIDs = member.roles.cache.map(r => r.id); 
    const userRace = res.rows.find(r => userRoleIDs.includes(r.roleID || r.roleid)); 
    return userRace || null; 
}

async function getAllUserAvailableSkills(member, db) { 
    const generalSkills = getGeneralSkills(); 
    const userRace = await getUserRace(member, db); 
    let raceSkill = null; 
    if (userRace) { raceSkill = getRaceSkillConfig(userRace.raceName || userRace.racename); } 
    let allSkills = []; 
    if (raceSkill) { allSkills.push(raceSkill); } 
    return allSkills.concat(generalSkills); 
}

async function handlePurchaseWithCoupons(interaction, itemData, quantity, totalPrice, client, db, callbackType) {
    const member = interaction.member; const guildID = interaction.guild.id; const userID = member.id;
    let bossCouponRes;
    try { bossCouponRes = await db.query(`SELECT * FROM user_coupons WHERE "guildID" = $1 AND "userID" = $2 AND "isUsed" = 0 LIMIT 1`, [guildID, userID]); }
    catch(e) { bossCouponRes = await db.query(`SELECT * FROM user_coupons WHERE guildid = $1 AND userid = $2 AND isused = 0 LIMIT 1`, [guildID, userID]).catch(()=>({rows:[]})); }
    const bossCoupon = bossCouponRes.rows[0];
    
    let roleCouponsRes;
    try { roleCouponsRes = await db.query(`SELECT * FROM role_coupons_config WHERE "guildID" = $1`, [guildID]); }
    catch(e) { roleCouponsRes = await db.query(`SELECT * FROM role_coupons_config WHERE guildid = $1`, [guildID]).catch(()=>({rows:[]})); }
    
    let bestRoleCoupon = null;
    for (const config of roleCouponsRes.rows) {
        if (member.roles.cache.has(config.roleID || config.roleid)) {
            if (!bestRoleCoupon || Number(config.discountPercent || config.discountpercent) > Number(bestRoleCoupon.discountPercent || bestRoleCoupon.discountpercent)) bestRoleCoupon = config;
        }
    }
    
    let isRoleCouponReady = false;
    if (bestRoleCoupon) {
        let usageDataRes;
        try { usageDataRes = await db.query(`SELECT "lastUsedTimestamp" FROM user_role_coupon_usage WHERE "guildID" = $1 AND "userID" = $2`, [guildID, userID]); }
        catch(e) { usageDataRes = await db.query(`SELECT lastusedtimestamp FROM user_role_coupon_usage WHERE guildid = $1 AND userid = $2`, [guildID, userID]).catch(()=>({rows:[]})); }
        const usageData = usageDataRes.rows[0];
        const fifteenDaysMs = 15 * 24 * 60 * 60 * 1000;
        if (!usageData || (Date.now() - Number(usageData.lastUsedTimestamp || usageData.lastusedtimestamp) > fifteenDaysMs)) isRoleCouponReady = true; else bestRoleCoupon = null; 
    }
    
    if (!bossCoupon && !bestRoleCoupon) return processFinalPurchase(interaction, itemData, quantity, totalPrice, 0, 'none', client, db, callbackType);

    const row = new ActionRowBuilder();
    let couponMessage = "";
    let finalPriceWithBoss = totalPrice, finalPriceWithRole = totalPrice;

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
    let msg; if (interaction.replied || interaction.deferred) msg = await interaction.followUp(replyData); else msg = await interaction.reply(replyData);
    const filter = i => i.user.id === userID;
    const collector = msg.createMessageComponentCollector({ filter, componentType: ComponentType.Button, time: 60000 });
    collector.on('collect', async i => {
        await i.deferUpdate(); await i.editReply({ content: "⏳ جاري تنفيذ الطلب...", components: [] });
        if (i.customId === 'skip_coupon') await processFinalPurchase(i, itemData, quantity, totalPrice, 0, 'none', client, db, callbackType);
        else if (i.customId === 'use_boss_coupon') await processFinalPurchase(i, itemData, quantity, finalPriceWithBoss, Number(bossCoupon.discountPercent || bossCoupon.discountpercent), 'boss', client, db, callbackType, bossCoupon.id);
        else if (i.customId === 'use_role_coupon') await processFinalPurchase(i, itemData, quantity, finalPriceWithRole, Number(bestRoleCoupon.discountPercent || bestRoleCoupon.discountpercent), 'role', client, db, callbackType);
        collector.stop();
    });
}

// 🔥 تحديث شامل للرد ليكون "علني" في الشات 🔥
async function processFinalPurchase(interaction, itemData, quantity, finalPrice, discountUsed, couponType, client, db, callbackType, couponIdToDelete = null) {
    let userData = await client.getLevel(interaction.user.id, interaction.guild.id);
    if (!userData) userData = { ...client.defaultData, user: interaction.user.id, guild: interaction.guild.id };
      
    // هذا الرد مخصص فقط للأخطاء لكي تظل مخفية
    const errorReply = async (msgContent) => {
        if (interaction.deferred || interaction.replied) return await interaction.followUp({ content: msgContent, flags: MessageFlags.Ephemeral }); 
        else return await interaction.reply({ content: msgContent, flags: MessageFlags.Ephemeral });
    };

    if (Number(userData.mora) < finalPrice) {
        const userBank = Number(userData.bank) || 0; 
        let errorMsg = `❌ **عذراً، لا تملك مورا كافية!**\nالمطلوب بالكاش: **${finalPrice.toLocaleString()}** ${EMOJI_MORA}`;
        if (userBank >= finalPrice) errorMsg += `\n\n💡 **تلميح:** ليس لديك كاش كافٍ، ولكن لديك **${userBank.toLocaleString()}** في البنك.`;
        return await errorReply(errorMsg);
    }

    if (callbackType === 'item') {
        if (itemData.category === 'potions') {
            let invCheckRes = await db.query(`SELECT "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [interaction.user.id, interaction.guild.id, itemData.id]).catch(()=>({rows:[]}));
            let currQty = invCheckRes.rows[0] ? Number(invCheckRes.rows[0].quantity) : 0;
            if (currQty + quantity > MAX_POTION_LIMIT) return await errorReply(`🚫 **لا يمكنك الشراء!**\nحقيبتك لا تتسع للمزيد من هذا العنصر. الحد الأقصى هو **${MAX_POTION_LIMIT}**.`);
        } 
        else if (itemData.id.startsWith('feed_') || itemData.id.startsWith('seed_') || itemData.category === 'farming') {
            let invCheckRes = await db.query(`SELECT "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [interaction.user.id, interaction.guild.id, itemData.id]).catch(()=>({rows:[]}));
            let currQty = invCheckRes.rows[0] ? Number(invCheckRes.rows[0].quantity) : 0;
            if (currQty + quantity > MAX_FARM_LIMIT) return await errorReply(`🚫 **مخزن المزرعة ممتلئ!**\nلا يمكنك حمل أكثر من **${MAX_FARM_LIMIT}** من هذا العنصر.`);
        }
    }

    userData.mora = Number(userData.mora) - finalPrice; 
    userData.shop_purchases = (Number(userData.shop_purchases) || 0) + 1;
    await client.setLevel(userData);
      
    if (couponType === 'boss' && couponIdToDelete) {
        try { await db.query(`DELETE FROM user_coupons WHERE "id" = $1`, [couponIdToDelete]); }
        catch(e) { await db.query(`DELETE FROM user_coupons WHERE id = $1`, [couponIdToDelete]).catch(()=>{}); }
    }
    else if (couponType === 'role') {
        try { await db.query(`INSERT INTO user_role_coupon_usage ("guildID", "userID", "lastUsedTimestamp") VALUES ($1, $2, $3) ON CONFLICT ("guildID", "userID") DO UPDATE SET "lastUsedTimestamp" = EXCLUDED."lastUsedTimestamp"`, [interaction.guild.id, interaction.user.id, Date.now()]); }
        catch(e) { await db.query(`INSERT INTO user_role_coupon_usage (guildid, userid, lastusedtimestamp) VALUES ($1, $2, $3) ON CONFLICT (guildid, userid) DO UPDATE SET lastusedtimestamp = EXCLUDED.lastusedtimestamp`, [interaction.guild.id, interaction.user.id, Date.now()]).catch(()=>{}); }
    }

    if (callbackType === 'item') {
        if (itemData.id === 'personal_guard_1d') { 
            userData.hasGuard = (Number(userData.hasGuard) || 0) + 3; 
            userData.guardExpires = 0; 
            await client.setLevel(userData); 
        }
        else if (itemData.category === 'potions') { 
            await ensureInventoryTable(db); 
            try { await db.query(`INSERT INTO user_inventory ("guildID", "userID", "itemID", "quantity") VALUES ($1, $2, $3, 1) ON CONFLICT("guildID", "userID", "itemID") DO UPDATE SET "quantity" = LEAST(user_inventory."quantity" + 1, 999)`, [interaction.guild.id, interaction.user.id, itemData.id]); }
            catch(e) { await db.query(`INSERT INTO user_inventory (guildid, userid, itemid, quantity) VALUES ($1, $2, $3, 1) ON CONFLICT(guildid, userid, itemid) DO UPDATE SET quantity = LEAST(user_inventory.quantity + 1, 999)`, [interaction.guild.id, interaction.user.id, itemData.id]).catch(()=>{}); }
        }
        else if (itemData.id === 'streak_shield') {
            let existingStreakRes = await db.query(`SELECT * FROM streaks WHERE "userID" = $1 AND "guildID" = $2`, [interaction.user.id, interaction.guild.id]).catch(()=> db.query(`SELECT * FROM streaks WHERE userid = $1 AND guildid = $2`, [interaction.user.id, interaction.guild.id]).catch(()=>({rows:[]})));
            const existingStreak = existingStreakRes.rows[0];
            const id = existingStreak?.id || `${interaction.guild.id}-${interaction.user.id}`;
            try { await db.query(`INSERT INTO streaks ("id", "guildID", "userID", "streakCount", "lastMessageTimestamp", "hasGracePeriod", "hasItemShield", "nicknameActive", "hasReceivedFreeShield", "separator", "dmNotify", "highestStreak") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) ON CONFLICT ("id") DO UPDATE SET "hasItemShield" = "hasItemShield" + 1`, [id, interaction.guild.id, interaction.user.id, existingStreak?.streakCount || existingStreak?.streakcount || 0, existingStreak?.lastMessageTimestamp || existingStreak?.lastmessagetimestamp || 0, existingStreak?.hasGracePeriod || existingStreak?.hasgraceperiod || 0, 1, existingStreak?.nicknameActive ?? existingStreak?.nicknameactive ?? 1, existingStreak?.hasReceivedFreeShield || existingStreak?.hasreceivedfreeshield || 0, existingStreak?.separator || '»', existingStreak?.dmNotify ?? existingStreak?.dmnotify ?? 1, existingStreak?.highestStreak || existingStreak?.higheststreak || 0]); }
            catch(e) { await db.query(`INSERT INTO streaks (id, guildid, userid, streakcount, lastmessagetimestamp, hasgraceperiod, hasitemshield, nicknameactive, hasreceivedfreeshield, separator, dmnotify, higheststreak) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) ON CONFLICT (id) DO UPDATE SET hasitemshield = hasitemshield + 1`, [id, interaction.guild.id, interaction.user.id, existingStreak?.streakCount || existingStreak?.streakcount || 0, existingStreak?.lastMessageTimestamp || existingStreak?.lastmessagetimestamp || 0, existingStreak?.hasGracePeriod || existingStreak?.hasgraceperiod || 0, 1, existingStreak?.nicknameActive ?? existingStreak?.nicknameactive ?? 1, existingStreak?.hasReceivedFreeShield || existingStreak?.hasreceivedfreeshield || 0, existingStreak?.separator || '»', existingStreak?.dmNotify ?? existingStreak?.dmnotify ?? 1, existingStreak?.highestStreak || existingStreak?.higheststreak || 0]).catch(()=>{}); }
        }
        else if (itemData.id === 'streak_shield_media') {
            let existingMediaStreakRes = await db.query(`SELECT * FROM media_streaks WHERE "userID" = $1 AND "guildID" = $2`, [interaction.user.id, interaction.guild.id]).catch(()=> db.query(`SELECT * FROM media_streaks WHERE userid = $1 AND guildid = $2`, [interaction.user.id, interaction.guild.id]).catch(()=>({rows:[]})));
            const existingMediaStreak = existingMediaStreakRes.rows[0];
            const id = existingMediaStreak?.id || `${interaction.guild.id}-${interaction.user.id}`;
            try { await db.query(`INSERT INTO media_streaks ("id", "guildID", "userID", "streakCount", "lastMediaTimestamp", "hasGracePeriod", "hasItemShield", "hasReceivedFreeShield", "dmNotify", "highestStreak") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT ("id") DO UPDATE SET "hasItemShield" = "hasItemShield" + 1`, [id, interaction.guild.id, interaction.user.id, existingMediaStreak?.streakCount || existingMediaStreak?.streakcount || 0, existingMediaStreak?.lastMediaTimestamp || existingMediaStreak?.lastmediatimestamp || 0, existingMediaStreak?.hasGracePeriod || existingMediaStreak?.hasgraceperiod || 0, 1, existingMediaStreak?.hasReceivedFreeShield || existingMediaStreak?.hasreceivedfreeshield || 0, existingMediaStreak?.dmNotify ?? existingMediaStreak?.dmnotify ?? 1, existingMediaStreak?.highestStreak || existingMediaStreak?.higheststreak || 0]); }
            catch(e) { await db.query(`INSERT INTO media_streaks (id, guildid, userid, streakcount, lastmediatimestamp, hasgraceperiod, hasitemshield, hasreceivedfreeshield, dmnotify, higheststreak) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (id) DO UPDATE SET hasitemshield = hasitemshield + 1`, [id, interaction.guild.id, interaction.user.id, existingMediaStreak?.streakCount || existingMediaStreak?.streakcount || 0, existingMediaStreak?.lastMediaTimestamp || existingMediaStreak?.lastmediatimestamp || 0, existingMediaStreak?.hasGracePeriod || existingMediaStreak?.hasgraceperiod || 0, 1, existingMediaStreak?.hasReceivedFreeShield || existingMediaStreak?.hasreceivedfreeshield || 0, existingMediaStreak?.dmNotify ?? existingMediaStreak?.dmnotify ?? 1, existingMediaStreak?.highestStreak || existingMediaStreak?.higheststreak || 0]).catch(()=>{}); }
        }
        else if (itemData.id.startsWith('xp_buff_')) {
            let multiplier = 0, buffPercent = 0, duration = 0;
            switch (itemData.id) {
                case 'xp_buff_1d_3': multiplier = 0.45; buffPercent = 45; duration = 24 * 60 * 60 * 1000; break;
                case 'xp_buff_1d_7': multiplier = 0.70; buffPercent = 70; duration = 48 * 60 * 60 * 1000; break;
                case 'xp_buff_2d_10': multiplier = 0.90; buffPercent = 90; duration = 72 * 60 * 60 * 1000; break;
            }
            if (duration > 0) {
                const expiresAt = Date.now() + duration;
                try { await db.query(`INSERT INTO user_buffs ("userID", "guildID", "buffType", "multiplier", "expiresAt", "buffPercent") VALUES ($1, $2, $3, $4, $5, $6)`, [interaction.user.id, interaction.guild.id, 'xp', multiplier, expiresAt, buffPercent]); }
                catch(e) { await db.query(`INSERT INTO user_buffs (userid, guildid, bufftype, multiplier, expiresat, buffpercent) VALUES ($1, $2, $3, $4, $5, $6)`, [interaction.user.id, interaction.guild.id, 'xp', multiplier, expiresAt, buffPercent]).catch(()=>{}); }
            }
        }
        else if (itemData.id === 'vip_role_3d') {
            let settingsRes;
            try { settingsRes = await db.query(`SELECT "vipRoleID" FROM settings WHERE "guild" = $1`, [interaction.guild.id]); }
            catch(e) { settingsRes = await db.query(`SELECT viproleid FROM settings WHERE guild = $1`, [interaction.guild.id]).catch(()=>({rows:[]})); }
            const settings = settingsRes.rows[0];
            if (settings && (settings.vipRoleID || settings.viproleid)) {
                const member = await interaction.guild.members.fetch(interaction.user.id).catch(()=>{});
                if (member) await member.roles.add(settings.vipRoleID || settings.viproleid).catch(()=>{});
                const expiresAt = Date.now() + (3 * 24 * 60 * 60 * 1000);
                try { await db.query(`INSERT INTO temporary_roles ("userID", "guildID", "roleID", "expiresAt") VALUES ($1, $2, $3, $4) ON CONFLICT ("userID", "guildID", "roleID") DO UPDATE SET "expiresAt" = EXCLUDED."expiresAt"`, [interaction.user.id, interaction.guild.id, settings.vipRoleID || settings.viproleid, expiresAt]); }
                catch(e) { await db.query(`INSERT INTO temporary_roles (userid, guildid, roleid, expiresat) VALUES ($1, $2, $3, $4) ON CONFLICT (userid, guildid, roleid) DO UPDATE SET expiresat = EXCLUDED.expiresat`, [interaction.user.id, interaction.guild.id, settings.vipRoleID || settings.viproleid, expiresAt]).catch(()=>{}); }
            }
        }
        else if (itemData.id === 'farm_worker_3d') {
            const duration = 3 * 24 * 60 * 60 * 1000;
            let existingWorkerRes = await db.query(`SELECT "expiresAt" FROM user_buffs WHERE "userID" = $1 AND "guildID" = $2 AND "buffType" = 'farm_worker'`, [interaction.user.id, interaction.guild.id]).catch(()=> db.query(`SELECT expiresat FROM user_buffs WHERE userid = $1 AND guildid = $2 AND bufftype = 'farm_worker'`, [interaction.user.id, interaction.guild.id]).catch(()=>({rows:[]})));
            const existingWorker = existingWorkerRes.rows[0];
            let newExpiresAt = Date.now() + duration;
            if (existingWorker && Number(existingWorker.expiresAt || existingWorker.expiresat) > Date.now()) {
                newExpiresAt = Number(existingWorker.expiresAt || existingWorker.expiresat) + duration;
            }
            try { await db.query(`INSERT INTO user_buffs ("userID", "guildID", "buffType", "multiplier", "expiresAt", "buffPercent") VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT ("userID", "guildID", "buffType") DO UPDATE SET "expiresAt" = EXCLUDED."expiresAt"`, [interaction.user.id, interaction.guild.id, 'farm_worker', 0, newExpiresAt, 0]); }
            catch(e) { await db.query(`INSERT INTO user_buffs (userid, guildid, bufftype, multiplier, expiresat, buffpercent) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (userid, guildid, bufftype) DO UPDATE SET expiresat = EXCLUDED.expiresat`, [interaction.user.id, interaction.guild.id, 'farm_worker', 0, newExpiresAt, 0]).catch(()=>{}); }
        }
        else if (itemData.id === 'change_race') {
            try {
                let allRaceRolesRes = await db.query(`SELECT "roleID", "raceName" FROM race_roles WHERE "guildID" = $1`, [interaction.guild.id]).catch(()=> db.query(`SELECT roleid, racename FROM race_roles WHERE guildid = $1`, [interaction.guild.id]).catch(()=>({rows:[]})));
                const raceRoleIDs = allRaceRolesRes.rows.map(r => r.roleID || r.roleid);
                const userRaceRole = interaction.member.roles.cache.find(r => raceRoleIDs.includes(r.id));
                if (userRaceRole) { await interaction.member.roles.remove(userRaceRole); }
                await db.query(`DELETE FROM user_weapons WHERE "userID" = $1 AND "guildID" = $2`, [interaction.user.id, interaction.guild.id]).catch(()=> db.query(`DELETE FROM user_weapons WHERE userid = $1 AND guildid = $2`, [interaction.user.id, interaction.guild.id]).catch(()=>{}));
                await db.query(`DELETE FROM user_skills WHERE "userID" = $1 AND "guildID" = $2 AND "skillID" LIKE 'race_%'`, [interaction.user.id, interaction.guild.id]).catch(()=> db.query(`DELETE FROM user_skills WHERE userid = $1 AND guildid = $2 AND skillid LIKE 'race_%'`, [interaction.user.id, interaction.guild.id]).catch(()=>{}));
            } catch (err) {}
              
            const expiresAt = Date.now() + (7 * 24 * 60 * 60 * 1000);
            try {
                await db.query(`INSERT INTO user_buffs ("guildID", "userID", "buffPercent", "expiresAt", "buffType", "multiplier") VALUES ($1, $2, $3, $4, $5, $6)`, [interaction.guild.id, interaction.user.id, -5, expiresAt, 'xp', -0.05]);
                await db.query(`INSERT INTO user_buffs ("guildID", "userID", "buffPercent", "expiresAt", "buffType", "multiplier") VALUES ($1, $2, $3, $4, $5, $6)`, [interaction.guild.id, interaction.user.id, -5, expiresAt, 'mora', -0.05]);
            } catch(e) {}
        }
    } 
    else if (callbackType === 'weapon') {
        const newLevel = itemData.currentLevel + 1;
        if (itemData.isBuy) {
            try { await db.query(`INSERT INTO user_weapons ("userID", "guildID", "raceName", "weaponLevel") VALUES ($1, $2, $3, $4)`, [interaction.user.id, interaction.guild.id, itemData.raceName, newLevel]); }
            catch(e) { await db.query(`INSERT INTO user_weapons (userid, guildid, racename, weaponlevel) VALUES ($1, $2, $3, $4)`, [interaction.user.id, interaction.guild.id, itemData.raceName, newLevel]).catch(()=>{}); }
        } else {
            try { await db.query(`UPDATE user_weapons SET "weaponLevel" = $1 WHERE "userID" = $2 AND "guildID" = $3 AND "raceName" = $4`, [newLevel, interaction.user.id, interaction.guild.id, itemData.raceName]); }
            catch(e) { await db.query(`UPDATE user_weapons SET weaponlevel = $1 WHERE userid = $2 AND guildid = $3 AND racename = $4`, [newLevel, interaction.user.id, interaction.guild.id, itemData.raceName]).catch(()=>{}); }
        }
    } 
    else if (callbackType === 'skill') {
        const newLevel = itemData.currentLevel + 1;
        if (itemData.isBuy) {
            try { await db.query(`INSERT INTO user_skills ("userID", "guildID", "skillID", "skillLevel") VALUES ($1, $2, $3, $4)`, [interaction.user.id, interaction.guild.id, itemData.skillId, newLevel]); }
            catch(e) { await db.query(`INSERT INTO user_skills (userid, guildid, skillid, skilllevel) VALUES ($1, $2, $3, $4)`, [interaction.user.id, interaction.guild.id, itemData.skillId, newLevel]).catch(()=>{}); }
        } else {
            try { await db.query(`UPDATE user_skills SET "skillLevel" = $1 WHERE "id" = $2`, [newLevel, itemData.dbId]); }
            catch(e) { await db.query(`UPDATE user_skills SET skilllevel = $1 WHERE id = $2`, [newLevel, itemData.dbId]).catch(()=>{}); }
        }
    }

    let successMsg = `📦 **العنصر:** ${itemData.name || itemData.raceName || 'Unknown'}\n💰 **التكلفة:** ${finalPrice.toLocaleString()} ${EMOJI_MORA}`;
    if (discountUsed > 0) successMsg += `\n📉 **تم تطبيق خصم:** ${discountUsed}%`;
    if (itemData.id === 'farm_worker_3d') successMsg += `\n👨‍🌾 **عامل المزرعة بدأ العمل!** سيقوم بحصاد المحاصيل وإطعام الحيوانات.`;
    
    // 🔥 جعل الرد علني (Public) في الشات كرسالة مستقلة تمنشن اللاعب 🔥
    const successEmbed = new EmbedBuilder()
        .setTitle('✅ تمت عملية الشراء بنجاح')
        .setColor(Colors.Green)
        .setDescription(successMsg)
        .setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL() });

    if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: "✅ تم تجهيز الطلب وإرسال الفاتورة.", components: [] }).catch(()=>{});
    } else {
        await interaction.reply({ content: "✅ تم تجهيز الطلب وإرسال الفاتورة.", flags: MessageFlags.Ephemeral }).catch(()=>{});
    }
    
    await interaction.channel.send({ content: `<@${interaction.user.id}>`, embeds: [successEmbed] }).catch(()=>{});
    sendShopLog(client, interaction.guild.id, interaction.member, itemData.name || itemData.raceName || "Unknown", finalPrice, `شراء ${discountUsed > 0 ? '(مع كوبون)' : ''}`);
    
    // إعادة بناء واجهة السلاح/المهارة إذا كان التحديث فيها
    if (callbackType === 'weapon') await _handleWeaponUpgrade(interaction, client, db, true); 
    if (callbackType === 'skill') await _handleSkillUpgrade(interaction, client, db, true);
}

function buildPaginatedItemEmbed(selectedItemId) {
    const isPotion = potionItems.find(i => i.id === selectedItemId);
    const itemList = isPotion ? potionItems : getBuyableItems();
    const itemIndex = itemList.findIndex(it => it.id === selectedItemId);
    if (itemIndex === -1) return null;

    const item = itemList[itemIndex];
    const totalItems = itemList.length;
    const prevIndex = (itemIndex - 1 + totalItems) % totalItems;
    const nextIndex = (itemIndex + 1) % totalItems;
    const prevItemId = itemList[prevIndex].id;
    const nextItemId = itemList[nextIndex].id;

    const detailEmbed = new EmbedBuilder()
        .setTitle(`${item.emoji} ${item.name}`)
        .setDescription(item.description)
        .addFields({ name: 'السعر', value: `**${item.price.toLocaleString()}** ${EMOJI_MORA}`, inline: true })
        .setColor(isPotion ? Colors.Purple : Colors.Greyple)
        .setImage(BANNER_URL)
        .setThumbnail(THUMBNAILS.get(item.id) || item.image || null)
        .setFooter({ text: `العنصر ${itemIndex + 1} / ${totalItems}` });

    const prevButton = new ButtonBuilder().setCustomId(`shop_paginate_item_${prevItemId}`).setEmoji('<:left:1439164494759723029>').setStyle(ButtonStyle.Secondary);
    const buyButton = new ButtonBuilder().setCustomId(`buy_item_${item.id}`).setLabel('شراء').setStyle(ButtonStyle.Success).setEmoji('<:mora:1435647151349698621>');
    const nextButton = new ButtonBuilder().setCustomId(`shop_paginate_item_${nextItemId}`).setEmoji('<:right:1439164491072929915>').setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder().addComponents(prevButton, buyButton, nextButton);
    return { embeds: [detailEmbed], components: [row] };
}

async function buildSkillEmbedWithPagination(allUserSkills, pageIndex, db, i) {
    pageIndex = parseInt(pageIndex) || 0;
    const totalSkills = allUserSkills.length;
    if (totalSkills === 0) return { content: '❌ لا توجد مهارات متاحة.', embeds: [], components: [] };
    if (pageIndex < 0) pageIndex = totalSkills - 1;
    if (pageIndex >= totalSkills) pageIndex = 0;
    const skillConfig = allUserSkills[pageIndex];
    if (!skillConfig) return { content: '❌ خطأ في البيانات.', embeds: [], components: [] };
    const prevIndex = (pageIndex - 1 + totalSkills) % totalSkills;
    const nextIndex = (pageIndex + 1) % totalSkills;
    
    let userSkillRes = await db.query(`SELECT * FROM user_skills WHERE "userID" = $1 AND "guildID" = $2 AND "skillID" = $3`, [i.user.id, i.guild.id, skillConfig.id]).catch(()=> db.query(`SELECT * FROM user_skills WHERE userid = $1 AND guildid = $2 AND skillid = $3`, [i.user.id, i.guild.id, skillConfig.id]).catch(()=>({rows:[]})));
    let userSkill = userSkillRes.rows[0];
    let currentLevel = userSkill ? Number(userSkill.skillLevel || userSkill.skilllevel) : 0;
    const isRaceSkill = skillConfig.id.startsWith('race_');
    const embedTitle = `${skillConfig.emoji} ${skillConfig.name} ${isRaceSkill ? '(مهارة عرق)' : ''}`;
    const embed = new EmbedBuilder().setTitle(embedTitle).setDescription(skillConfig.description).setColor(isRaceSkill ? Colors.Gold : Colors.Blue).setImage(BANNER_URL).setThumbnail(THUMBNAILS.get('upgrade_skill')).setFooter({ text: `المهارة ${pageIndex + 1} / ${totalSkills}` });
    const navigationRow = new ActionRowBuilder();
    const buttonRow = new ActionRowBuilder();
    navigationRow.addComponents(new ButtonBuilder().setCustomId(`shop_skill_paginate_${prevIndex}`).setEmoji('<:left:1439164494759723029>').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId(`shop_skill_paginate_${nextIndex}`).setEmoji('<:right:1439164491072929915>').setStyle(ButtonStyle.Secondary));
    
    let currentEffect, nextEffect, nextLevelPrice, buttonId, buttonLabel;
    const effectType = skillConfig.stat_type.includes('%') ? '%' : (skillConfig.stat_type === 'TrueDMG' || skillConfig.stat_type === 'RecoilDMG' ? ' DMG' : '');
    if (currentLevel === 0) { currentEffect = 0; } 
    else if (skillConfig.max_level === 1) { currentEffect = skillConfig.base_value; } 
    else { currentEffect = skillConfig.base_value + (skillConfig.value_increment * (currentLevel - 1)); }
    embed.addFields({ name: "المستوى الحالي", value: `Lv. ${currentLevel}`, inline: true }, { name: "التأثير الحالي", value: `${currentEffect}${effectType}`, inline: true });
    
    if (currentLevel >= (skillConfig.max_level || 20)) { 
        embed.addFields({ name: "التطوير القادم", value: "وصلت للحد الأقصى!", inline: true });
        buttonRow.addComponents(new ButtonBuilder().setCustomId('max_level').setLabel('الحد الأقصى').setStyle(ButtonStyle.Success).setDisabled(true));
    } else {
        if (currentLevel === 0) { nextLevelPrice = skillConfig.base_price; buttonLabel = `شراء (Lv.1)`; buttonId = `buy_skill_${skillConfig.id}`; } 
        else { nextLevelPrice = skillConfig.base_price + (skillConfig.price_increment * currentLevel); buttonLabel = `تطوير (Lv.${currentLevel + 1})`; buttonId = `upgrade_skill_${skillConfig.id}`; }
        if (skillConfig.max_level === 1) { nextEffect = skillConfig.base_value; } else { nextEffect = skillConfig.base_value + (skillConfig.value_increment * currentLevel); }
        embed.addFields({ name: "المستوى القادم", value: `Lv. ${currentLevel + 1}`, inline: true }, { name: "التأثير القادم", value: `${nextEffect}${effectType}`, inline: true }, { name: "التكلفة", value: `${nextLevelPrice.toLocaleString()} ${EMOJI_MORA}`, inline: true });
        buttonRow.addComponents(new ButtonBuilder().setCustomId(buttonId).setLabel(buttonLabel).setStyle(ButtonStyle.Success).setEmoji('⬆️'));
    }
    
    const components = [buttonRow, navigationRow].filter(r => r.components.length > 0);
    return { embeds: [embed], components: components };
}

async function _handleRodSelect(i, client, db) {
    if(i.replied || i.deferred) await i.editReply("جاري التحميل..."); else await i.deferReply({ flags: MessageFlags.Ephemeral });
    let userDataRes = await db.query(`SELECT "rodLevel" FROM levels WHERE "user" = $1 AND "guild" = $2`, [i.user.id, i.guild.id]).catch(()=> db.query(`SELECT rodlevel FROM levels WHERE userid = $1 AND guildid = $2`, [i.user.id, i.guild.id]).catch(()=>({rows:[]})));
    let userData = userDataRes.rows[0];
    const currentLevel = userData ? (Number(userData.rodLevel || userData.rodlevel) || 1) : 1;
    const nextLevel = currentLevel + 1;
    const currentRod = rodsConfig.find(r => r.level === currentLevel) || rodsConfig[0];
    const nextRod = rodsConfig.find(r => r.level === nextLevel);
    const embed = new EmbedBuilder().setTitle(`🎣 سنارة الصيد`).setDescription(`**السنارة الحالية:** ${currentRod.name}`).setColor(Colors.Aqua).setImage(BANNER_URL).setThumbnail(THUMBNAILS.get('upgrade_rod'))
        .addFields({ name: 'المستوى الحالي', value: `Lv. ${currentLevel}`, inline: true }, { name: 'أقصى صيد', value: `${currentRod.max_fish} سمكات`, inline: true }, { name: 'الحظ', value: `+${currentRod.luck_bonus}%`, inline: true });
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
    if(i.replied || i.deferred) await i.editReply("جاري التحميل..."); else await i.deferReply({ flags: MessageFlags.Ephemeral });
    let userDataRes = await db.query(`SELECT "boatLevel" FROM levels WHERE "user" = $1 AND "guild" = $2`, [i.user.id, i.guild.id]).catch(()=> db.query(`SELECT boatlevel FROM levels WHERE userid = $1 AND guildid = $2`, [i.user.id, i.guild.id]).catch(()=>({rows:[]})));
    let userData = userDataRes.rows[0];
    const currentLevel = userData ? (Number(userData.boatLevel || userData.boatlevel) || 1) : 1;
    const nextLevel = currentLevel + 1;
    const currentBoat = boatsConfig.find(b => b.level === currentLevel) || boatsConfig[0];
    const nextBoat = boatsConfig.find(b => b.level === nextLevel);
    const embed = new EmbedBuilder().setTitle(`🚤 قـوارب الـصـيـد`).setDescription(`**القارب الحالي:** ${currentBoat.name}`).setColor(Colors.Blue).setImage(BANNER_URL);
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

async function _handleBaitBuy(i, client, db) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const baitId = i.values[0].replace('buy_bait_', '');
    const bait = baitsConfig.find(b => b.id === baitId);
    
    const qty = 5; 
    const unitPrice = Math.round(bait.price / 5);
    const cost = unitPrice * qty; 
    
    let userData = await client.getLevel(i.user.id, i.guild.id);
    if (Number(userData.mora) < cost) {
        const userBank = Number(userData.bank) || 0;
        let msg = `❌ رصيدك غير كافي لشراء هذه الحزمة! تحتاج إلى **${cost.toLocaleString()}** ${EMOJI_MORA}`;
        if (userBank >= cost) msg += `\n💡 لديك في البنك **${userBank.toLocaleString()}** مورا، اسحب منها.`;
        return i.editReply(msg);
    }
    userData.mora = Number(userData.mora) - cost; 
    await client.setLevel(userData);
    
    try { await db.query(`INSERT INTO user_inventory ("guildID", "userID", "itemID", "quantity") VALUES ($1, $2, $3, $4) ON CONFLICT("guildID", "userID", "itemID") DO UPDATE SET "quantity" = LEAST(user_inventory."quantity" + $5, 1000)`, [i.guild.id, i.user.id, baitId, qty, qty]); }
    catch(e) { await db.query(`INSERT INTO user_inventory (guildid, userid, itemid, quantity) VALUES ($1, $2, $3, $4) ON CONFLICT(guildid, userid, itemid) DO UPDATE SET quantity = LEAST(user_inventory.quantity + $5, 1000)`, [i.guild.id, i.user.id, baitId, qty, qty]).catch(()=>{}); }
    
    // 🔥 رد علني عند الشراء 🔥
    const successEmbed = new EmbedBuilder()
        .setTitle('✅ تمت عملية الشراء بنجاح')
        .setColor(Colors.Green)
        .setDescription(`📦 **العنصر:** حزمة (${qty} حبات) من ${bait.name}\n💰 **التكلفة:** ${cost.toLocaleString()} ${EMOJI_MORA}`)
        .setAuthor({ name: i.user.username, iconURL: i.user.displayAvatarURL() });

    await i.editReply({ content: "✅ تم تجهيز الطلب وإرسال الفاتورة." });
    await i.channel.send({ content: `<@${i.user.id}>`, embeds: [successEmbed] });
    sendShopLog(client, i.guild.id, i.member, `حزمة طعم: ${bait.name} (x${qty})`, cost, "شراء");
}

async function _handlePotionSelect(i, client, db) {
    if(i.replied || i.deferred) await i.followUp({ content: "جاري التحميل...", flags: MessageFlags.Ephemeral });
    else await i.deferReply({ flags: MessageFlags.Ephemeral });
      
    const potions = getPotionItems();
    if (potions.length === 0) return i.editReply({ content: "❌ لا توجد جرعات متاحة حالياً." });

    const potionOptions = potions.slice(0, 25).map(p => {
        return { label: p.name, description: `${p.price.toLocaleString()} مورا | ${p.description.substring(0, 50)}`, value: `buy_item_${p.id}`, emoji: p.emoji };
    });

    const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('shop_buy_potion_menu').setPlaceholder('اختر الجرعة لشرائها...').addOptions(potionOptions));
    const embed = new EmbedBuilder().setTitle('🧪 متجر الجرعات السحرية').setDescription('اختر الجرعة التي تريد شراءها من القائمة بالأسفل.').setColor(Colors.Purple).setImage(BANNER_URL).setThumbnail(THUMBNAILS.get('potions_menu'));

    await i.editReply({ embeds: [embed], components: [row] });
}

async function _handleWeaponUpgrade(i, client, db, isUpdate = false) {
    try {
        const userId = i.user.id; const guildId = i.guild.id; 
          
        let exactRaceName = null; let weaponConfig = null;
        if (!isUpdate) { 
             const isBuy = i.customId.startsWith('buy_weapon_');
             if (i.isStringSelectMenu() && i.values[0] === 'upgrade_weapon') {
                 if (!i.replied && !i.deferred) await i.deferReply({ flags: MessageFlags.Ephemeral });
                 const userRace = await getUserRace(i.member, db);
                 if (!userRace) return i.editReply({ content: "❌ ليس لديك عرق! قم باختيار عرقك أولاً." });
                 weaponConfig = weaponsConfig.find(w => w.race.toLowerCase() === (userRace.raceName || userRace.racename).toLowerCase());
                 if (!weaponConfig) return i.editReply({ content: `❌ لا يوجد سلاح متاح لعرقك.` });
                 exactRaceName = weaponConfig.race;
             }
             else if (i.isButton()) {
                 if (!i.replied && !i.deferred) await i.deferUpdate(); 
                 const raceNameFromBtn = i.customId.replace(isBuy ? 'buy_weapon_' : 'upgrade_weapon_', ''); 
                 weaponConfig = weaponsConfig.find(w => w.race.toLowerCase() === raceNameFromBtn.toLowerCase());
                 if (!weaponConfig) {
                     const userRace = await getUserRace(i.member, db);
                     if (userRace) weaponConfig = weaponsConfig.find(w => w.race.toLowerCase() === (userRace.raceName || userRace.racename).toLowerCase());
                 }
                 if (!weaponConfig) return await i.followUp({ content: `❌ خطأ: لم يتم العثور على بيانات السلاح.`, flags: MessageFlags.Ephemeral });
                 exactRaceName = weaponConfig.race;
             }
        } else {
             const userRace = await getUserRace(i.member, db);
             if (userRace) {
                 weaponConfig = weaponsConfig.find(w => w.race.toLowerCase() === (userRace.raceName || userRace.racename).toLowerCase());
                 exactRaceName = weaponConfig ? weaponConfig.race : null;
             }
        }

        if(!exactRaceName) return; 

        let userWeaponRes = await db.query(`SELECT * FROM user_weapons WHERE "userID" = $1 AND "guildID" = $2 AND "raceName" = $3`, [userId, guildId, exactRaceName]).catch(()=> db.query(`SELECT * FROM user_weapons WHERE userid = $1 AND guildid = $2 AND racename = $3`, [userId, guildId, exactRaceName]).catch(()=>({rows:[]})));
        let userWeapon = userWeaponRes.rows[0];
        let currentLevel = userWeapon ? Number(userWeapon.weaponLevel || userWeapon.weaponlevel) : 0;
          
        if (!isUpdate && i.isButton()) {
            if (currentLevel >= (weaponConfig.max_level || 20)) return await i.followUp({ content: '❌ لقد وصلت للحد الأقصى للتطوير!', flags: MessageFlags.Ephemeral });
            let price = (currentLevel === 0) ? weaponConfig.base_price : weaponConfig.base_price + (weaponConfig.price_increment * currentLevel);
              
            const isBuy = i.customId.startsWith('buy_weapon_');
            const itemData = { raceName: exactRaceName, newLevel: currentLevel + 1, isBuy: isBuy, dbId: userWeapon ? userWeapon.id : null, name: weaponConfig.name, currentLevel: currentLevel };
            await handlePurchaseWithCoupons(i, itemData, 1, price, client, db, 'weapon');
            return; 
        }

        const calculatedDamage = (currentLevel === 0) ? 0 : weaponConfig.base_damage + (weaponConfig.damage_increment * (currentLevel - 1));
        const embed = new EmbedBuilder().setTitle(`${weaponConfig.emoji} سلاح العرق: ${weaponConfig.name}`).setColor(Colors.Blue).setImage(BANNER_URL).setThumbnail(THUMBNAILS.get('upgrade_weapon')).addFields({ name: "العرق", value: exactRaceName, inline: true }, { name: "المستوى", value: `Lv. ${currentLevel}`, inline: true }, { name: "الضرر", value: `${calculatedDamage} DMG`, inline: true });
        const row = new ActionRowBuilder();
          
        if (currentLevel >= (weaponConfig.max_level || 20)) { 
            embed.addFields({ name: "التطوير", value: "وصلت للحد الأقصى!", inline: true }); 
            row.addComponents(new ButtonBuilder().setCustomId('max_level').setLabel('الحد الأقصى').setStyle(ButtonStyle.Success).setDisabled(true)); 
        } else { 
            const nextLevelPrice = (currentLevel === 0) ? weaponConfig.base_price : weaponConfig.base_price + (weaponConfig.price_increment * currentLevel); 
            const nextDamage = (currentLevel === 0) ? weaponConfig.base_damage : calculatedDamage + weaponConfig.damage_increment; 
            const buttonId = currentLevel === 0 ? `buy_weapon_${exactRaceName}` : `upgrade_weapon_${exactRaceName}`; 
            const buttonLabel = currentLevel === 0 ? `شراء (Lv.1)` : `تطوير (Lv.${currentLevel + 1})`; 
            embed.addFields({ name: "المستوى القادم", value: `Lv. ${currentLevel + 1}`, inline: true }, { name: "التأثير القادم", value: `${nextDamage} DMG`, inline: true }, { name: "تكلفة التطوير", value: `${nextLevelPrice.toLocaleString()} ${EMOJI_MORA}`, inline: true }); 
            row.addComponents(new ButtonBuilder().setCustomId(buttonId).setLabel(buttonLabel).setStyle(ButtonStyle.Success).setEmoji('⬆️')); 
        }
          
        if(isUpdate) await i.editReply({ embeds: [embed], components: [row] });
        else await i.editReply({ embeds: [embed], components: [row] });

    } catch (error) { console.error("خطأ في زر تطوير السلاح:", error); if (!isUpdate && (i.replied || i.deferred)) await i.followUp({ content: '❌ حدث خطأ.', flags: MessageFlags.Ephemeral }); }
}

async function _handleSkillUpgrade(i, client, db, isUpdate = false) {
    try {
        const userId = i.user.id; const guildId = i.guild.id; 
          
        let skillId, skillConfig;
        if (!isUpdate) {
             const isBuy = i.customId.startsWith('buy_skill_');
             await i.deferUpdate(); 
             skillId = i.customId.replace(isBuy ? 'buy_skill_' : 'upgrade_skill_', ''); 
             skillConfig = skillsConfig.find(s => s.id === skillId);
             if (!skillConfig) return await i.followUp({ content: '❌ خطأ: لم يتم العثور على بيانات هذه المهارة.', flags: MessageFlags.Ephemeral });
        } else {
             const isBuy = i.customId.startsWith('buy_skill_');
             skillId = i.customId.replace(isBuy ? 'buy_skill_' : 'upgrade_skill_', '');
             skillConfig = skillsConfig.find(s => s.id === skillId);
        }

        if(!skillConfig) return;

        let userSkillRes = await db.query(`SELECT * FROM user_skills WHERE "userID" = $1 AND "guildID" = $2 AND "skillID" = $3`, [userId, guildId, skillId]).catch(()=> db.query(`SELECT * FROM user_skills WHERE userid = $1 AND guildid = $2 AND skillid = $3`, [userId, guildId, skillId]).catch(()=>({rows:[]})));
        let userSkill = userSkillRes.rows[0];
        let currentLevel = userSkill ? Number(userSkill.skillLevel || userSkill.skilllevel) : 0; let price = 0;
          
        if (!isUpdate) {
            if (currentLevel >= (skillConfig.max_level || 20)) return await i.followUp({ content: '❌ لقد وصلت للحد الأقصى للتطوير بالفعل!', flags: MessageFlags.Ephemeral });
              
            price = (currentLevel === 0) ? skillConfig.base_price : skillConfig.base_price + (skillConfig.price_increment * currentLevel);
            const isBuy = i.customId.startsWith('buy_skill_');
            const itemData = { skillId: skillId, newLevel: currentLevel + 1, isBuy: isBuy, dbId: userSkill ? userSkill.id : null, name: skillConfig.name, currentLevel: currentLevel };
            await handlePurchaseWithCoupons(i, itemData, 1, price, client, db, 'skill');
            return;
        }

        const allUserSkills = await getAllUserAvailableSkills(i.member, db);
        const skillIndex = allUserSkills.findIndex(s => s.id === skillId);
        const paginationEmbed = await buildSkillEmbedWithPagination(allUserSkills, skillIndex, db, i);
          
        await i.editReply({ ...paginationEmbed });

    } catch (error) { console.error("خطأ في زر تطوير المهارة:", error); if (!isUpdate && (i.replied || i.deferred)) await i.followUp({ content: '❌ حدث خطأ.', flags: MessageFlags.Ephemeral }); }
}

async function _handleShopButton(i, client, db) {
    try {
        const userId = i.user.id; const guildId = i.guild.id; const boughtItemId = i.customId.replace('buy_item_', ''); 
          
        if (boughtItemId === 'item_temp_reply') {
            let userMoraRes = await db.query(`SELECT "mora" FROM levels WHERE "user" = $1 AND "guild" = $2`, [userId, guildId]).catch(()=> db.query(`SELECT mora FROM levels WHERE userid = $1 AND guildid = $2`, [userId, guildId]).catch(()=>({rows:[]})));
            const userMora = userMoraRes.rows[0] ? Number(userMoraRes.rows[0].mora || userMoraRes.rows[0].mora) : 0;
            if (userMora < 10000) return i.reply({ content: `❌ تحتاج 10,000 ${EMOJI_MORA}`, flags: [MessageFlags.Ephemeral] });
            const modal = new ModalBuilder().setCustomId('shop_buy_reply_modal').setTitle('شراء رد تلقائي (3 أيام)');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reply_trigger').setLabel("الكلمة (Trigger)").setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reply_response').setLabel("الرد (Response)").setStyle(TextInputStyle.Paragraph).setRequired(true))
            );
            return i.showModal(modal);
        }

        let item = shopItems.find(it => it.id === boughtItemId) || potionItems.find(it => it.id === boughtItemId);
        if (!item) return await i.reply({ content: '❌ هذا العنصر غير موجود!', flags: MessageFlags.Ephemeral });
        let userData = await client.getLevel(userId, guildId); 
        if (!userData) userData = { ...client.defaultData, user: userId, guild: guildId };
          
        const RESTRICTED_ITEMS = []; 
        const NON_DISCOUNTABLE = [...RESTRICTED_ITEMS, 'xp_buff_1d_3', 'xp_buff_1d_7', 'xp_buff_2d_10'];
        
        // 🔥 فحص حماية السعات للعناصر المميزة 🔥
        await i.deferReply({ flags: MessageFlags.Ephemeral });

        if (item.id === 'personal_guard_1d') {
            if (Number(userData.hasGuard || 0) >= 3) {
                return await i.editReply({ content: `🚫 **لا يمكنك الشراء!**\nلديك بالفعل **${userData.hasGuard}** محاولات حماية من الحارس الشخصي. (الحد الأقصى 3)` });
            }
        }
        else if (item.id === 'streak_shield') {
            let existingRes = await db.query(`SELECT "hasItemShield" FROM streaks WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId]).catch(()=> db.query(`SELECT hasitemshield FROM streaks WHERE userid = $1 AND guildid = $2`, [userId, guildId]).catch(()=>({rows:[]})));
            const currentShields = Number(existingRes.rows[0]?.hasItemShield || existingRes.rows[0]?.hasitemshield || 0);
            if (currentShields >= 3) {
                return await i.editReply({ content: `🚫 **درعك ممتلئ!**\nلديك **${currentShields}** دروع ستريك نشطة حالياً. لا يمكنك شراء المزيد حتى يتم استهلاكها.` });
            }
        }
        else if (item.id === 'streak_shield_media') {
            let existingRes = await db.query(`SELECT "hasItemShield" FROM media_streaks WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId]).catch(()=> db.query(`SELECT hasitemshield FROM media_streaks WHERE userid = $1 AND guildid = $2`, [userId, guildId]).catch(()=>({rows:[]})));
            const currentShields = Number(existingRes.rows[0]?.hasItemShield || existingRes.rows[0]?.hasitemshield || 0);
            if (currentShields >= 3) {
                return await i.editReply({ content: `🚫 **درع الميديا ممتلئ!**\nلديك **${currentShields}** دروع نشطة حالياً. لا يمكنك شراء المزيد.` });
            }
        }
        else if (item.id === 'farm_worker_3d') {
            let existingWorkerRes = await db.query(`SELECT "expiresAt" FROM user_buffs WHERE "userID" = $1 AND "guildID" = $2 AND "buffType" = 'farm_worker'`, [userId, guildId]).catch(()=> db.query(`SELECT expiresat FROM user_buffs WHERE userid = $1 AND guildid = $2 AND bufftype = 'farm_worker'`, [userId, guildId]).catch(()=>({rows:[]})));
            const existingWorker = existingWorkerRes.rows[0];
            const expiresAtMs = Number(existingWorker?.expiresAt || existingWorker?.expiresat || 0);
            const remainingDays = Math.ceil((expiresAtMs - Date.now()) / (24 * 60 * 60 * 1000));
            
            if (remainingDays >= 6) {
                return await i.editReply({ content: `🚫 **لا يمكنك توظيف عمال إضافيين!**\nوقت العامل الحالي يتجاوز الحد الأقصى المسموح (يتبقى له ${remainingDays} أيام).` });
            }
        }
        else if (item.id.startsWith('xp_buff_')) {
            let getActiveBuffRes = await db.query(`SELECT * FROM user_buffs WHERE "userID" = $1 AND "guildID" = $2 AND "buffType" = 'xp' AND "expiresAt" > $3`, [userId, guildId, Date.now()]).catch(()=> db.query(`SELECT * FROM user_buffs WHERE userid = $1 AND guildid = $2 AND bufftype = 'xp' AND expiresat > $3`, [userId, guildId, Date.now()]).catch(()=>({rows:[]})));
            const activeBuff = getActiveBuffRes.rows[0];
            if (activeBuff) {
                const replaceButton = new ButtonBuilder().setCustomId(`replace_buff_${item.id}`).setLabel("إلغاء القديم وشراء الجديد").setStyle(ButtonStyle.Danger);
                const cancelButton = new ButtonBuilder().setCustomId('cancel_purchase').setLabel("إلغاء").setStyle(ButtonStyle.Secondary);
                const row = new ActionRowBuilder().addComponents(replaceButton, cancelButton);
                return await i.editReply({ content: `⚠️ لديك معزز خبرة فعال بالفعل! (لا يمكن دمج معززين في نفس الوقت)`, components: [row], embeds: [] });
            }
        }

        if (NON_DISCOUNTABLE.includes(item.id) || item.id.startsWith('xp_buff_')) {
             if (Number(userData.mora) < item.price) {
                 const userBank = Number(userData.bank) || 0;
                 let msg = `❌ رصيدك غير كافي!`;
                 if (userBank >= item.price) msg += `\n💡 لديك في البنك **${userBank.toLocaleString()}** مورا، اسحب منها.`;
                 return await i.editReply({ content: msg });
             }
             if (RESTRICTED_ITEMS.includes(item.id)) return;
             await processFinalPurchase(i, item, 1, item.price, 0, 'none', client, db, 'item');
             return;
        }
        
        await handlePurchaseWithCoupons(i, item, 1, item.price, client, db, 'item');

    } catch (error) { console.error("خطأ في زر المتجر:", error); if (i.replied || i.deferred) await i.followUp({ content: '❌ حدث خطأ.', flags: MessageFlags.Ephemeral }); else await i.reply({ content: '❌ حدث خطأ.', flags: MessageFlags.Ephemeral }); }
}

async function _handleReplaceGuard(i, client, db) {
    try {
        await i.deferUpdate();
        const userId = i.user.id; const guildId = i.guild.id; const item = shopItems.find(it => it.id === 'personal_guard_1d');
        let userData = await client.getLevel(userId, guildId); 
        if (!userData) userData = { ...client.defaultData, user: userId, guild: guildId };
        
        // التحقق من الحد الأقصى للحارس عند التجديد الإجباري
        if (Number(userData.hasGuard || 0) >= 3) {
            return await i.followUp({ content: `🚫 لديك بالفعل **${userData.hasGuard}** محاولات من الحارس الشخصي (الحد الأقصى 3).`, components: [], embeds: [], flags: MessageFlags.Ephemeral });
        }

        if (Number(userData.mora) < item.price) {
            const userBank = Number(userData.bank) || 0;
            let msg = `❌ رصيدك غير كافي! تحتاج إلى **${item.price.toLocaleString()}** ${EMOJI_MORA}`;
            if (userBank >= item.price) msg += `\n💡 لديك في البنك **${userBank.toLocaleString()}** مورا.`;
            return await i.followUp({ content: msg, components: [], embeds: [], flags: MessageFlags.Ephemeral });
        }
        userData.mora = Number(userData.mora) - item.price; userData.hasGuard = (Number(userData.hasGuard) || 0) + 3; userData.guardExpires = 0; userData.shop_purchases = (Number(userData.shop_purchases) || 0) + 1;
        await client.setLevel(userData);
        
        // 🔥 رد علني 🔥
        const successEmbed = new EmbedBuilder()
            .setTitle('✅ تمت عملية التجديد بنجاح')
            .setColor(Colors.Green)
            .setDescription(`📦 **العنصر:** حارس شخصي\n💰 **التكلفة:** ${item.price.toLocaleString()} ${EMOJI_MORA}`)
            .setAuthor({ name: i.user.username, iconURL: i.user.displayAvatarURL() });

        await i.followUp({ content: "✅ تم تجهيز الطلب وإرسال الفاتورة.", flags: MessageFlags.Ephemeral });
        await i.channel.send({ content: `<@${i.user.id}>`, embeds: [successEmbed] });
        
        sendShopLog(client, guildId, i.member, "حارس شخصي (تجديد)", item.price, "شراء");
    } catch (error) { console.error("Guard Replace Error:", error); }
}

async function _handleReplaceBuffButton(i, client, db) {
    try {
        await i.deferUpdate();
        const userId = i.user.id; const guildId = i.guild.id; 
        const newItemId = i.customId.replace('replace_buff_', '');
        const item = shopItems.find(it => it.id === newItemId);
        
        if (!item) return await i.followUp({ content: '❌ هذا العنصر غير موجود!', components: [], embeds: [], flags: MessageFlags.Ephemeral });
        
        let userData = await client.getLevel(userId, guildId); 
        if (!userData) userData = { ...client.defaultData, user: userId, guild: guildId };
        
        if (Number(userData.mora) < item.price) {
            const userBank = Number(userData.bank) || 0;
            let msg = `❌ رصيدك غير كافي! تحتاج إلى **${item.price.toLocaleString()}** ${EMOJI_MORA}`;
            if (userBank >= item.price) msg += `\n💡 لديك في البنك **${userBank.toLocaleString()}** مورا.`;
            return await i.followUp({ content: msg, components: [], embeds: [], flags: MessageFlags.Ephemeral });
        }
        
        userData.mora = Number(userData.mora) - item.price;
        
        await db.query(`DELETE FROM user_buffs WHERE "userID" = $1 AND "guildID" = $2 AND "buffType" = 'xp'`, [userId, guildId]).catch(()=> db.query(`DELETE FROM user_buffs WHERE userid = $1 AND guildid = $2 AND bufftype = 'xp'`, [userId, guildId]).catch(()=>{}));
        
        let expiresAt, multiplier, buffPercent;
        switch (item.id) {
            case 'xp_buff_1d_3': multiplier = 0.45; buffPercent = 45; expiresAt = Date.now() + (24 * 60 * 60 * 1000); break;
            case 'xp_buff_1d_7': multiplier = 0.70; buffPercent = 70; expiresAt = Date.now() + (48 * 60 * 60 * 1000); break;
            case 'xp_buff_2d_10': multiplier = 0.90; buffPercent = 90; expiresAt = Date.now() + (72 * 60 * 60 * 1000); break;
        }
        
        if (multiplier > 0) {
            await db.query(`INSERT INTO user_buffs ("userID", "guildID", "buffType", "multiplier", "expiresAt", "buffPercent") VALUES ($1, $2, $3, $4, $5, $6)`, [userId, guildId, 'xp', multiplier, expiresAt, buffPercent]).catch(()=> db.query(`INSERT INTO user_buffs (userid, guildid, bufftype, multiplier, expiresat, buffpercent) VALUES ($1, $2, $3, $4, $5, $6)`, [userId, guildId, 'xp', multiplier, expiresAt, buffPercent]).catch(()=>{}));
        }

        userData.shop_purchases = (Number(userData.shop_purchases) || 0) + 1;
        await client.setLevel(userData);
        
        // 🔥 رد علني 🔥
        const successEmbed = new EmbedBuilder()
            .setTitle('✅ تمت عملية الشراء بنجاح')
            .setColor(Colors.Green)
            .setDescription(`📦 **العنصر:** ${item.name} (استبدال)\n💰 **التكلفة:** ${item.price.toLocaleString()} ${EMOJI_MORA}`)
            .setAuthor({ name: i.user.username, iconURL: i.user.displayAvatarURL() });

        await i.followUp({ content: "✅ تم تجهيز الطلب وإرسال الفاتورة.", flags: MessageFlags.Ephemeral });
        await i.channel.send({ content: `<@${i.user.id}>`, embeds: [successEmbed] });

        sendShopLog(client, guildId, i.member, item.name, item.price, "استبدال/شراء");
        
    } catch (error) { 
        console.error("خطأ في زر استبدال المعزز:", error); 
        if (i.replied || i.deferred) await i.followUp({ content: '❌ حدث خطأ.', flags: MessageFlags.Ephemeral }); 
    }
}

async function handleShopModal(i, client, db) {
    if (i.customId === 'exchange_xp_modal') { await _handleXpExchangeModal(i, client, db); return true; }
    if (i.customId === 'shop_buy_reply_modal') {
        const trigger = i.fields.getTextInputValue('reply_trigger').trim();
        const response = i.fields.getTextInputValue('reply_response').trim();
        const price = 10000;
        await i.deferReply({ flags: MessageFlags.Ephemeral });
        let userDataRes = await db.query(`SELECT "mora" FROM levels WHERE "user" = $1 AND "guild" = $2`, [i.user.id, i.guild.id]).catch(()=> db.query(`SELECT mora FROM levels WHERE userid = $1 AND guildid = $2`, [i.user.id, i.guild.id]).catch(()=>({rows:[]})));
        const userData = userDataRes.rows[0];
        if (!userData || Number(userData.mora || userData.mora) < price) return i.editReply(`❌ رصيدك غير كافي.`);
        let existingRes = await db.query(`SELECT 1 FROM auto_responses WHERE "guildID" = $1 AND "trigger" = $2`, [i.guild.id, trigger]).catch(()=> db.query(`SELECT 1 FROM auto_responses WHERE guildid = $1 AND trigger = $2`, [i.guild.id, trigger]).catch(()=>({rows:[]})));
        if (existingRes.rows.length > 0) return i.editReply(`❌ هذا الرد موجود مسبقاً.`);
        try {
            await db.query(`UPDATE levels SET "mora" = "mora" - $1 WHERE "user" = $2 AND "guild" = $3`, [price, i.user.id, i.guild.id]).catch(()=> db.query(`UPDATE levels SET mora = mora - $1 WHERE userid = $2 AND guildid = $3`, [price, i.user.id, i.guild.id]).catch(()=>{}));
            const expiresAt = Date.now() + (3 * 24 * 60 * 60 * 1000);
            await db.query(`INSERT INTO auto_responses ("guildID", "trigger", "response", "matchType", "cooldown", "createdBy", "expiresAt") VALUES ($1, $2, $3, 'exact', 600, $4, $5)`, [i.guild.id, trigger, response, i.user.id, expiresAt]).catch(()=> db.query(`INSERT INTO auto_responses (guildid, trigger, response, matchtype, cooldown, createdby, expiresat) VALUES ($1, $2, $3, 'exact', 600, $4, $5)`, [i.guild.id, trigger, response, i.user.id, expiresAt]).catch(()=>{}));
            
            // 🔥 رد علني 🔥
            const successEmbed = new EmbedBuilder()
                .setTitle('✅ تمت عملية الشراء بنجاح')
                .setColor(Colors.Green)
                .setDescription(`📦 **العنصر:** رد تلقائي (${trigger})\n💰 **التكلفة:** ${price.toLocaleString()} ${EMOJI_MORA}`)
                .setAuthor({ name: i.user.username, iconURL: i.user.displayAvatarURL() });

            await i.editReply({ content: "✅ تم تجهيز الطلب وإرسال الفاتورة." });
            await i.channel.send({ content: `<@${i.user.id}>`, embeds: [successEmbed] });

            sendShopLog(client, i.guild.id, i.member, `رد تلقائي: ${trigger}`, price, "شراء");
        } catch (e) { console.error(e); await i.editReply(`❌ حدث خطأ.`); }
        return true;
    }

    const isBuyMarket = i.customId.startsWith('buy_modal_');
    const isSellMarket = i.customId.startsWith('sell_modal_');
    const isBuyFarm = i.customId.startsWith('buy_animal_');
    const isSellFarm = i.customId.startsWith('sell_animal_');

    if (isBuyMarket || isSellMarket) {
        await _handleMarketTransaction(i, client, db, isBuyMarket);
        return true;
    }

    if (isBuyFarm || isSellFarm) {
        await _handleFarmTransaction(i, client, db, isBuyFarm);
        return true;
    }

    return false;
}

async function _handleXpExchangeModal(i, client, db) {
    try {
        await i.deferReply({ flags: MessageFlags.Ephemeral });
        const userId = i.user.id; const guildId = i.guild.id;
        let userLoanRes = await db.query(`SELECT 1 FROM user_loans WHERE "userID" = $1 AND "guildID" = $2 AND "remainingAmount" > 0`, [userId, guildId]).catch(()=> db.query(`SELECT 1 FROM user_loans WHERE userid = $1 AND guildid = $2 AND remainingamount > 0`, [userId, guildId]).catch(()=>({rows:[]})));
        if (userLoanRes.rows.length > 0) return await i.editReply({ content: `❌ عليك قرض.` });
        
        let userData = await client.getLevel(userId, guildId); 
        if (!userData) userData = { ...client.defaultData, user: userId, guild: guildId };
        
        const userMora = Number(userData.mora) || 0;
        const amountString = i.fields.getTextInputValue('xp_amount_input').trim().toLowerCase();
        let amountToBuy = 0;
        if (amountString === 'all') amountToBuy = Math.floor(userMora / CUSTOM_XP_RATE);
        else amountToBuy = parseInt(amountString.replace(/,/g, ''));
        
        if (isNaN(amountToBuy) || amountToBuy <= 0) return await i.editReply({ content: '❌ رقم غير صالح.' });
        
        const totalCost = amountToBuy * CUSTOM_XP_RATE;
        
        if (userMora < totalCost) {
            const userBank = Number(userData.bank) || 0;
            let msg = `❌ رصيدك غير كافي.`;
            if (userBank >= totalCost) msg += `\n💡 لديك في البنك **${userBank.toLocaleString()}** مورا.`;
            return await i.editReply({ content: msg });
        }
        
        userData.mora = Number(userData.mora) - totalCost; 
        
        if (addXPAndCheckLevel) {
            await addXPAndCheckLevel(client, i.member, db, amountToBuy, 0, false).catch(()=>{});
        } else {
            userData.xp = Number(userData.xp) + amountToBuy; 
            userData.totalXP = Number(userData.totalXP || userData.totalxp || 0) + amountToBuy;
            await client.setLevel(userData);
        }

        // 🔥 رد علني 🔥
        const successEmbed = new EmbedBuilder()
            .setTitle('✅ تمت عملية الشراء بنجاح')
            .setColor(Colors.Green)
            .setDescription(`📦 **العنصر:** ${amountToBuy.toLocaleString()} XP\n💰 **التكلفة:** ${totalCost.toLocaleString()} ${EMOJI_MORA}`)
            .setAuthor({ name: i.user.username, iconURL: i.user.displayAvatarURL() });

        await i.editReply({ content: "✅ تم تجهيز الطلب وإرسال الفاتورة." });
        await i.channel.send({ content: `<@${i.user.id}>`, embeds: [successEmbed] });

        sendShopLog(client, guildId, i.member, `شراء ${amountToBuy} XP`, totalCost, "تبديل");
    } catch (e) { console.error(e); }
}

async function handleShopInteractions(i, client, db) {
    if (i.customId === 'shop_open_menu') { 
        const userId = i.user.id;
        const guildId = i.guild.id;
        let userData = await client.getLevel(userId, guildId);
        if (!userData) {
            let dbRes = await db.query(`SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2`, [userId, guildId]).catch(()=> db.query(`SELECT * FROM levels WHERE userid = $1 AND guildid = $2`, [userId, guildId]).catch(()=>({rows:[]})));
            userData = dbRes.rows[0];
        }
        if (!userData) userData = { level: 0, mora: 0, bank: 0 }; 

        const userLevel = Number(userData.level) || 0;
        const cash = Number(userData.mora) || 0;
        const bank = Number(userData.bank) || 0;

        const filteredItems = shopItems.filter(item => {
            if (item.category === 'menus' || EXCLUDED_FROM_MAIN_MENU.includes(item.id)) return false;
            if (HIDDEN_ITEMS_ID.includes(item.id) && userLevel < 50) return false;
            return true;
        });

        if (filteredItems.length === 0) {
            return await i.reply({ content: `🚫 لا توجد عناصر متاحة لمستواك الحالي (${userLevel}).`, flags: MessageFlags.Ephemeral });
        }

        const specialOptions = [
            new StringSelectMenuOptionBuilder().setLabel('تطوير السلاح').setValue('upgrade_weapon').setEmoji('⚔️'),
            new StringSelectMenuOptionBuilder().setLabel('تطوير المهارات').setValue('upgrade_skill').setEmoji('<:goldgem:979098126591868928>'),
            new StringSelectMenuOptionBuilder().setLabel('متجر الجرعات').setValue('potions_menu').setEmoji('🧪'), 
            new StringSelectMenuOptionBuilder().setLabel('معدات الصيد').setValue('fishing_gear_menu').setEmoji('🎣'), 
            new StringSelectMenuOptionBuilder().setLabel('تبديل الخبرة').setValue('exchange_xp').setEmoji('<a:levelup:1437805366048985290>'),
        ];

        const normalOptions = filteredItems.map(item => {
            return new StringSelectMenuOptionBuilder()
                .setLabel(item.name)
                .setDescription(`${item.price.toLocaleString()} مورا`)
                .setValue(item.id)
                .setEmoji(emojiMap.get(item.id) || item.emoji || '🛍️');
        });

        const allOptions = [...specialOptions, ...normalOptions].slice(0, 25);

        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('shop_select_item')
                .setPlaceholder('اختر عنصراً للشراء...')
                .addOptions(allOptions)
        );

        const shopEmbed = new EmbedBuilder()
            .setTitle('✥ مـتـجـر الامبراطـوريـة')
            .setDescription(`
            اهـلا بـك بمتـجر الامبراطـوريـة
            ✬ رصيـدك الكـاش: **${cash.toLocaleString()}** ${EMOJI_MORA}
            ✬ رصـيد البنـك: **${bank.toLocaleString()}** ${EMOJI_MORA}
            ✬ مـسـتواك: **${userLevel}**

            ✦ تصفح القائمة لعرض الـعـنـاصر المتـاحـة لك حسـب مستـواك الحالـي
            `)
            .setColor('#BD9FC9')
            .setImage('https://i.postimg.cc/kMwWDMM0/shop.jpg');

        return await i.reply({ 
            embeds: [shopEmbed],
            components: [row], 
            flags: MessageFlags.Ephemeral 
        });
    }
    
    if (i.customId.startsWith('shop_paginate_item_')) { 
        try { 
            await i.deferUpdate(); 
            const id = i.customId.replace('shop_paginate_item_', ''); 
            const embed = buildPaginatedItemEmbed(id); 
            if (embed) await i.editReply(embed); 
        } catch (e) {} return; 
    }
    if (i.customId.startsWith('shop_skill_paginate_')) { 
        try { 
            await i.deferUpdate(); 
            const idx = i.customId.replace('shop_skill_paginate_', ''); 
            const skills = await getAllUserAvailableSkills(i.member, db); 
            const embed = await buildSkillEmbedWithPagination(skills, idx, db, i); 
            if (embed) await i.editReply(embed); 
        } catch (e) {} return; 
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
        const paginationEmbed = buildPaginatedItemEmbed(potionId);
        if (paginationEmbed) return await i.reply({ ...paginationEmbed, flags: MessageFlags.Ephemeral });
        else return await i.reply({ content: "❌ خطأ في تحميل بيانات الجرعة.", flags: MessageFlags.Ephemeral });
    }

    if (i.customId === 'upgrade_rod') await _handleRodUpgrade(i, client, db);
    else if (i.customId === 'upgrade_boat') await _handleBoatUpgrade(i, client, db);
    else if (i.isStringSelectMenu() && i.customId === 'shop_buy_bait_menu') await _handleBaitBuy(i, client, db);
    else if (i.customId.startsWith('buy_item_')) await _handleShopButton(i, client, db);
    else if (i.customId.startsWith('replace_buff_')) await _handleReplaceBuffButton(i, client, db);
    else if (i.customId.startsWith('buy_weapon_') || i.customId.startsWith('upgrade_weapon_')) await _handleWeaponUpgrade(i, client, db);
    else if (i.customId.startsWith('buy_skill_') || i.customId.startsWith('upgrade_skill_')) await _handleSkillUpgrade(i, client, db);
    else if (i.customId === 'cancel_purchase') { await i.deferUpdate(); await i.editReply({ content: 'تم الإلغاء.', components: [], embeds: [] }); }
    else if (i.customId === 'open_xp_modal') { 
        const xpModal = new ModalBuilder().setCustomId('exchange_xp_modal').setTitle('شراء خبرة');
        xpModal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('xp_amount_input').setLabel('الكمية').setStyle(TextInputStyle.Short).setRequired(true)));
        await i.showModal(xpModal);
    }
    else if (i.customId === 'replace_guard') { await _handleReplaceGuard(i, client, db); }
    
    else if (i.customId.startsWith('buy_market_') || i.customId.startsWith('sell_market_') || i.customId.startsWith('buy_animal_') || i.customId.startsWith('sell_animal_')) {
        const action = i.customId.split('_')[0]; 
        const modalId = action === 'buy' ? (i.customId.includes('market') ? 'buy_modal_' : 'buy_animal_') : (i.customId.includes('market') ? 'sell_modal_' : 'sell_animal_');
        const suffix = i.customId.split('_').slice(2).join('_'); 
        const modal = new ModalBuilder().setCustomId(modalId + suffix).setTitle(action === 'buy' ? 'شراء' : 'بيع');
        const input = new TextInputBuilder().setCustomId('quantity_input').setLabel('الكمية').setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await i.showModal(modal);
    }
}

async function handleShopSelectMenu(i, client, db) {
    try {
        const selected = i.values[0];

        if (selected === 'fishing_gear_menu') {
            await i.deferReply({ flags: MessageFlags.Ephemeral }); 
            const embed = new EmbedBuilder().setTitle('🎣 عـدة الـصـيـد').setDescription('اختر القسم الذي تريد تصفحه:').setColor(Colors.Aqua).setImage(BANNER_URL);
            const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('fishing_gear_sub_menu').setPlaceholder('اختر الفئة...').addOptions(
                { label: 'السنارات', value: 'gear_rods', emoji: '🎣' }, { label: 'القوارب', value: 'gear_boats', emoji: '🚤' }, { label: 'الطعوم', value: 'gear_baits', emoji: '🪱' }
            ));
            return await i.editReply({ embeds: [embed], components: [row] });
        }

        if (selected === 'upgrade_weapon') { 
            await _handleWeaponUpgrade(i, client, db); 
            return; 
        }

        if (selected === 'upgrade_skill') {
            await i.deferReply({ flags: MessageFlags.Ephemeral }); 
            const allUserSkills = await getAllUserAvailableSkills(i.member, db);
            if (allUserSkills.length === 0) return await i.editReply({ content: '❌ لا توجد مهارات متاحة.' });
            const skillOptions = allUserSkills.map(s => new StringSelectMenuOptionBuilder().setLabel(s.name).setDescription(s.description.substring(0,100)).setValue(s.id).setEmoji(s.emoji));
            const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('shop_skill_select_menu').setPlaceholder('اختر المهارة...').addOptions(skillOptions));
            return await i.editReply({ content: 'اختر مهارة:', components: [row] });
        }

        if (selected === 'exchange_xp') {
             const btn = new ButtonBuilder().setCustomId('open_xp_modal').setLabel('بدء التبادل').setStyle(ButtonStyle.Primary).setEmoji('🪙');
             const embed = new EmbedBuilder().setTitle('تبديل الخبرة').setDescription(`السعر: ${CUSTOM_XP_RATE} مورا = 1 XP`).setColor(Colors.Blue).setImage(BANNER_URL).setThumbnail(THUMBNAILS.get('exchange_xp'));
             return await i.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(btn)], flags: MessageFlags.Ephemeral });
        }
          
        if (selected === 'potions_menu') {
            await _handlePotionSelect(i, client, db);
            return;
        }

        let item = getBuyableItems().find(it => it.id === selected);
        if (!item) item = getPotionItems().find(it => it.id === selected);

        if (item) {
             const paginationEmbed = buildPaginatedItemEmbed(selected);
             if (paginationEmbed) return await i.reply({ ...paginationEmbed, flags: MessageFlags.Ephemeral });
        }
    } catch (e) { console.error(e); }
}

async function handleSkillSelectMenu(i, client, db) {
    try {
        await i.deferUpdate(); 
        const skillId = i.values[0];
        const allUserSkills = await getAllUserAvailableSkills(i.member, db);
        const skillIndex = allUserSkills.findIndex(s => s.id === skillId);
        if (skillIndex === -1) return await i.editReply({ content: "خطأ: المهارة غير موجودة." });
        const paginationEmbed = await buildSkillEmbedWithPagination(allUserSkills, skillIndex, db, i);
        await i.editReply({ content: null, ...paginationEmbed });
    } catch (error) { console.error(error); }
}

module.exports = {
    handleShopModal,
    handleShopSelectMenu,
    handleShopInteractions,
    handleSkillSelectMenu,
    updateMarketPrices
};
