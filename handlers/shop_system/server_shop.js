const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ComponentType, Colors, MessageFlags } = require("discord.js");
const { sendLevelUpMessage } = require('../handler-utils.js'); 
const farmAnimals = require('../../json/farm-animals.json'); // 🔥 تم استدعاء هذا الملف لتجنب انهيار המزرعة
const { 
    shopItems, potionItems, weaponsConfig, skillsConfig, rodsConfig, boatsConfig, baitsConfig, 
    EMOJI_MORA, OWNER_ID, XP_EXCHANGE_RATE, BANNER_URL, THUMBNAILS, 
    ensureInventoryTable, sendShopLog 
} = require('./utils');

const MAX_FARM_LIMIT = 1000;
const MAX_POTION_LIMIT = 999;

function getBuyableItems() { 
    return shopItems.filter(it => 
        it.category !== 'menus' && 
        !['upgrade_weapon', 'upgrade_skill', 'exchange_xp', 'upgrade_rod', 'fishing_gear_menu', 'potions_menu'].includes(it.id)
    ); 
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
    let allRaceRolesRes;
    try { allRaceRolesRes = await db.query(`SELECT "roleID", "raceName" FROM race_roles WHERE "guildID" = $1`, [member.guild.id]); }
    catch(e) { allRaceRolesRes = await db.query(`SELECT roleid as "roleID", racename as "raceName" FROM race_roles WHERE guildid = $1`, [member.guild.id]).catch(()=>({rows:[]})); }
    const allRaceRoles = allRaceRolesRes.rows;
    const userRoleIDs = member.roles.cache.map(r => r.id); 
    const userRace = allRaceRoles.find(r => userRoleIDs.includes(r.roleID || r.roleid)); 
    return userRace || null; 
}

async function getAllUserAvailableSkills(member, db) { 
    const generalSkills = getGeneralSkills(); 
    const userRace = await getUserRace(member, db); 
    let raceSkill = null; 
    if (userRace) { raceSkill = getRaceSkillConfig(userRace.raceName || userRace.racename); } 
    let allSkills = []; 
    if (raceSkill) { allSkills.push(raceSkill); } 
    allSkills = allSkills.concat(generalSkills); 
    return allSkills; 
}

async function handlePurchaseWithCoupons(interaction, itemData, quantity, totalPrice, client, db, callbackType) {
    const member = interaction.member; const guildID = interaction.guild.id; const userID = member.id;
    let bossCouponRes;
    try { bossCouponRes = await db.query(`SELECT * FROM user_coupons WHERE "guildID" = $1 AND "userID" = $2 AND "isUsed" = 0 LIMIT 1`, [guildID, userID]); }
    catch(e) { bossCouponRes = await db.query(`SELECT * FROM user_coupons WHERE guildid = $1 AND userid = $2 AND isused = 0 LIMIT 1`, [guildID, userID]).catch(()=>({rows:[]})); }
    const bossCoupon = bossCouponRes.rows[0];
    let roleCouponsConfigRes;
    try { roleCouponsConfigRes = await db.query(`SELECT * FROM role_coupons_config WHERE "guildID" = $1`, [guildID]); }
    catch(e) { roleCouponsConfigRes = await db.query(`SELECT * FROM role_coupons_config WHERE guildid = $1`, [guildID]).catch(()=>({rows:[]})); }
    const roleCouponsConfig = roleCouponsConfigRes.rows;
    
    let bestRoleCoupon = null;
    for (const config of roleCouponsConfig) {
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

async function processFinalPurchase(interaction, itemData, quantity, finalPrice, discountUsed, couponType, client, db, callbackType, couponIdToDelete = null) {
    let userDataRes;
    try { userDataRes = await db.query(`SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2`, [interaction.user.id, interaction.guild.id]); }
    catch(e) { userDataRes = await db.query(`SELECT * FROM levels WHERE userid = $1 AND guildid = $2`, [interaction.user.id, interaction.guild.id]).catch(()=>({rows:[]})); }
    
    let userData = userDataRes.rows[0];
    if (!userData) {
        userData = { user: interaction.user.id, guild: interaction.guild.id, level: 0, mora: 0, bank: 0, xp: 0, totalXP: 0 };
        try { await db.query(`INSERT INTO levels ("user", "guild", "mora", "bank", "xp", "totalXP", "level") VALUES ($1, $2, 0, 0, 0, 0, 0)`, [interaction.user.id, interaction.guild.id]); }
        catch(e) { await db.query(`INSERT INTO levels (userid, guildid, mora, bank, xp, totalxp, level) VALUES ($1, $2, 0, 0, 0, 0, 0)`, [interaction.user.id, interaction.guild.id]).catch(()=>{}); }
    }
      
    const safeReply = async (payload) => {
        payload.flags = MessageFlags.Ephemeral; 
        if (interaction.deferred || interaction.replied) return await interaction.followUp(payload); else return await interaction.reply(payload);
    };

    // 🔍 الفحص الاستباقي: هل سيتجاوز الحد الأقصى قبل الدفع؟
    if (callbackType === 'item') {
        if (itemData.category === 'potions') {
            let invCheckRes = await db.query(`SELECT "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [interaction.user.id, interaction.guild.id, itemData.id]).catch(()=>({rows:[]}));
            let currQty = invCheckRes.rows[0] ? Number(invCheckRes.rows[0].quantity) : 0;
            if (currQty + quantity > MAX_POTION_LIMIT) {
                return await safeReply({ content: `🚫 **لا يمكنك الشراء!**\nحقيبتك لا تتسع للمزيد من هذا العنصر. الحد الأقصى هو **${MAX_POTION_LIMIT}**.` });
            }
        } 
        else if (itemData.id.startsWith('feed_') || itemData.id.startsWith('seed_') || itemData.category === 'farming') {
            let invCheckRes = await db.query(`SELECT "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [interaction.user.id, interaction.guild.id, itemData.id]).catch(()=>({rows:[]}));
            let currQty = invCheckRes.rows[0] ? Number(invCheckRes.rows[0].quantity) : 0;
            if (currQty + quantity > MAX_FARM_LIMIT) {
                return await safeReply({ content: `🚫 **مخزن المزرعة ممتلئ!**\nلا يمكنك حمل أكثر من **${MAX_FARM_LIMIT}** من هذا العنصر.` });
            }
        }
    }

    if (Number(userData.mora) < finalPrice) {
        const userBank = Number(userData.bank) || 0; 
        let errorMsg = `❌ **عذراً، لا تملك مورا كافية!**\nالمطلوب بالكاش: **${finalPrice.toLocaleString()}** ${EMOJI_MORA}`;
        if (userBank >= finalPrice) errorMsg += `\n\n💡 **تلميح:** ليس لديك كاش كافٍ، ولكن لديك **${userBank.toLocaleString()}** في البنك.`;
        return await safeReply({ content: errorMsg });
    }

    userData.mora = Number(userData.mora) - finalPrice; 
    
    if (couponType === 'boss' && couponIdToDelete) {
        try { await db.query(`DELETE FROM user_coupons WHERE "id" = $1`, [couponIdToDelete]); }
        catch(e) { await db.query(`DELETE FROM user_coupons WHERE id = $1`, [couponIdToDelete]).catch(()=>{}); }
    }
    else if (couponType === 'role') {
        try { await db.query(`INSERT INTO user_role_coupon_usage ("guildID", "userID", "lastUsedTimestamp") VALUES ($1, $2, $3) ON CONFLICT("guildID", "userID") DO UPDATE SET "lastUsedTimestamp" = EXCLUDED."lastUsedTimestamp"`, [interaction.guild.id, interaction.user.id, Date.now()]); }
        catch(e) { await db.query(`INSERT INTO user_role_coupon_usage (guildid, userid, lastusedtimestamp) VALUES ($1, $2, $3) ON CONFLICT(guildid, userid) DO UPDATE SET lastusedtimestamp = EXCLUDED.lastusedtimestamp`, [interaction.guild.id, interaction.user.id, Date.now()]).catch(()=>{}); }
    }

    if (callbackType === 'item') {
        if (itemData.id === 'personal_guard_1d') { 
            try { await db.query(`UPDATE levels SET "hasGuard" = COALESCE("hasGuard", 0) + 3, "guardExpires" = 0 WHERE "user" = $1 AND "guild" = $2`, [interaction.user.id, interaction.guild.id]); }
            catch(e) { await db.query(`UPDATE levels SET hasguard = COALESCE(hasguard, 0) + 3, guardexpires = 0 WHERE userid = $1 AND guildid = $2`, [interaction.user.id, interaction.guild.id]).catch(()=>{}); }
        }
        else if (itemData.category === 'potions') { 
            await ensureInventoryTable(db); 
            try { await db.query(`INSERT INTO user_inventory ("guildID", "userID", "itemID", "quantity") VALUES ($1, $2, $3, $4) ON CONFLICT("guildID", "userID", "itemID") DO UPDATE SET "quantity" = LEAST(user_inventory."quantity" + $4, $5)`, [interaction.guild.id, interaction.user.id, itemData.id, quantity, MAX_POTION_LIMIT]); }
            catch(e) { await db.query(`INSERT INTO user_inventory (guildid, userid, itemid, quantity) VALUES ($1, $2, $3, $4) ON CONFLICT(guildid, userid, itemid) DO UPDATE SET quantity = LEAST(user_inventory.quantity + $4, $5)`, [interaction.guild.id, interaction.user.id, itemData.id, quantity, MAX_POTION_LIMIT]).catch(()=>{}); }
        }
        else if (itemData.id.startsWith('feed_') || itemData.id.startsWith('seed_') || itemData.category === 'farming') {
            await ensureInventoryTable(db); 
            try { await db.query(`INSERT INTO user_inventory ("guildID", "userID", "itemID", "quantity") VALUES ($1, $2, $3, $4) ON CONFLICT("guildID", "userID", "itemID") DO UPDATE SET "quantity" = LEAST(user_inventory."quantity" + $4, $5)`, [interaction.guild.id, interaction.user.id, itemData.id, quantity, MAX_FARM_LIMIT]); }
            catch(e) { await db.query(`INSERT INTO user_inventory (guildid, userid, itemid, quantity) VALUES ($1, $2, $3, $4) ON CONFLICT(guildid, userid, itemid) DO UPDATE SET quantity = LEAST(user_inventory.quantity + $4, $5)`, [interaction.guild.id, interaction.user.id, itemData.id, quantity, MAX_FARM_LIMIT]).catch(()=>{}); }
        }
        else if (itemData.id === 'streak_shield') {
            let existingStreakRes;
            try { existingStreakRes = await db.query(`SELECT * FROM streaks WHERE "userID" = $1 AND "guildID" = $2`, [interaction.user.id, interaction.guild.id]); }
            catch(e) { existingStreakRes = await db.query(`SELECT * FROM streaks WHERE userid = $1 AND guildid = $2`, [interaction.user.id, interaction.guild.id]).catch(()=>({rows:[]})); }
            const existingStreak = existingStreakRes.rows[0];
            const id = existingStreak?.id || `${interaction.guild.id}-${interaction.user.id}`;
            try { await db.query(`INSERT INTO streaks ("id", "guildID", "userID", "streakCount", "lastMessageTimestamp", "hasGracePeriod", "hasItemShield", "nicknameActive", "hasReceivedFreeShield", "separator", "dmNotify", "highestStreak") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) ON CONFLICT ("id") DO UPDATE SET "hasItemShield" = 1`, [id, interaction.guild.id, interaction.user.id, existingStreak?.streakCount || existingStreak?.streakcount || 0, existingStreak?.lastMessageTimestamp || existingStreak?.lastmessagetimestamp || 0, existingStreak?.hasGracePeriod || existingStreak?.hasgraceperiod || 0, 1, existingStreak?.nicknameActive ?? existingStreak?.nicknameactive ?? 1, existingStreak?.hasReceivedFreeShield || existingStreak?.hasreceivedfreeshield || 0, existingStreak?.separator || '»', existingStreak?.dmNotify ?? existingStreak?.dmnotify ?? 1, existingStreak?.highestStreak || existingStreak?.higheststreak || 0]); }
            catch(e) { await db.query(`INSERT INTO streaks (id, guildid, userid, streakcount, lastmessagetimestamp, hasgraceperiod, hasitemshield, nicknameactive, hasreceivedfreeshield, separator, dmnotify, higheststreak) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) ON CONFLICT (id) DO UPDATE SET hasitemshield = 1`, [id, interaction.guild.id, interaction.user.id, existingStreak?.streakCount || existingStreak?.streakcount || 0, existingStreak?.lastMessageTimestamp || existingStreak?.lastmessagetimestamp || 0, existingStreak?.hasGracePeriod || existingStreak?.hasgraceperiod || 0, 1, existingStreak?.nicknameActive ?? existingStreak?.nicknameactive ?? 1, existingStreak?.hasReceivedFreeShield || existingStreak?.hasreceivedfreeshield || 0, existingStreak?.separator || '»', existingStreak?.dmNotify ?? existingStreak?.dmnotify ?? 1, existingStreak?.highestStreak || existingStreak?.higheststreak || 0]).catch(()=>{}); }
        }
        else if (itemData.id === 'streak_shield_media') {
            let existingMediaStreakRes;
            try { existingMediaStreakRes = await db.query(`SELECT * FROM media_streaks WHERE "userID" = $1 AND "guildID" = $2`, [interaction.user.id, interaction.guild.id]); }
            catch(e) { existingMediaStreakRes = await db.query(`SELECT * FROM media_streaks WHERE userid = $1 AND guildid = $2`, [interaction.user.id, interaction.guild.id]).catch(()=>({rows:[]})); }
            const existingMediaStreak = existingMediaStreakRes.rows[0];
            const id = existingMediaStreak?.id || `${interaction.guild.id}-${interaction.user.id}`;
            try { await db.query(`INSERT INTO media_streaks ("id", "guildID", "userID", "streakCount", "lastMediaTimestamp", "hasGracePeriod", "hasItemShield", "hasReceivedFreeShield", "dmNotify", "highestStreak") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT ("id") DO UPDATE SET "hasItemShield" = 1`, [id, interaction.guild.id, interaction.user.id, existingMediaStreak?.streakCount || existingMediaStreak?.streakcount || 0, existingMediaStreak?.lastMediaTimestamp || existingMediaStreak?.lastmediatimestamp || 0, existingMediaStreak?.hasGracePeriod || existingMediaStreak?.hasgraceperiod || 0, 1, existingMediaStreak?.hasReceivedFreeShield || existingMediaStreak?.hasreceivedfreeshield || 0, existingMediaStreak?.dmNotify ?? existingMediaStreak?.dmnotify ?? 1, existingMediaStreak?.highestStreak || existingMediaStreak?.higheststreak || 0]); }
            catch(e) { await db.query(`INSERT INTO media_streaks (id, guildid, userid, streakcount, lastmediatimestamp, hasgraceperiod, hasitemshield, hasreceivedfreeshield, dmnotify, higheststreak) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (id) DO UPDATE SET hasitemshield = 1`, [id, interaction.guild.id, interaction.user.id, existingMediaStreak?.streakCount || existingMediaStreak?.streakcount || 0, existingMediaStreak?.lastMediaTimestamp || existingMediaStreak?.lastmediatimestamp || 0, existingMediaStreak?.hasGracePeriod || existingMediaStreak?.hasgraceperiod || 0, 1, existingMediaStreak?.hasReceivedFreeShield || existingMediaStreak?.hasreceivedfreeshield || 0, existingMediaStreak?.dmNotify ?? existingMediaStreak?.dmnotify ?? 1, existingMediaStreak?.highestStreak || existingMediaStreak?.higheststreak || 0]).catch(()=>{}); }
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
                const member = await interaction.guild.members.fetch(interaction.user.id);
                await member.roles.add(settings.vipRoleID || settings.viproleid).catch(console.error);
                const expiresAt = Date.now() + (3 * 24 * 60 * 60 * 1000);
                try { await db.query(`INSERT INTO temporary_roles ("userID", "guildID", "roleID", "expiresAt") VALUES ($1, $2, $3, $4) ON CONFLICT ("userID", "guildID", "roleID") DO UPDATE SET "expiresAt" = EXCLUDED."expiresAt"`, [interaction.user.id, interaction.guild.id, settings.vipRoleID || settings.viproleid, expiresAt]); }
                catch(e) { await db.query(`INSERT INTO temporary_roles (userid, guildid, roleid, expiresat) VALUES ($1, $2, $3, $4) ON CONFLICT (userid, guildid, roleid) DO UPDATE SET expiresat = EXCLUDED.expiresat`, [interaction.user.id, interaction.guild.id, settings.vipRoleID || settings.viproleid, expiresAt]).catch(()=>{}); }
            }
        }
        else if (itemData.id === 'change_race') {
            try {
                let allRaceRolesRes;
                try { allRaceRolesRes = await db.query(`SELECT "roleID", "raceName" FROM race_roles WHERE "guildID" = $1`, [interaction.guild.id]); }
                catch(e) { allRaceRolesRes = await db.query(`SELECT roleid, racename FROM race_roles WHERE guildid = $1`, [interaction.guild.id]).catch(()=>({rows:[]})); }
                const raceRoleIDs = allRaceRolesRes.rows.map(r => r.roleID || r.roleid);
                const userRaceRole = interaction.member.roles.cache.find(r => raceRoleIDs.includes(r.id));
                if (userRaceRole) { await interaction.member.roles.remove(userRaceRole); }

                try { await db.query(`DELETE FROM user_weapons WHERE "userID" = $1 AND "guildID" = $2`, [interaction.user.id, interaction.guild.id]); }
                catch(e) { await db.query(`DELETE FROM user_weapons WHERE userid = $1 AND guildid = $2`, [interaction.user.id, interaction.guild.id]).catch(()=>{}); }
                try { await db.query(`DELETE FROM user_skills WHERE "userID" = $1 AND "guildID" = $2 AND "skillID" LIKE 'race_%'`, [interaction.user.id, interaction.guild.id]); }
                catch(e) { await db.query(`DELETE FROM user_skills WHERE userid = $1 AND guildid = $2 AND skillid LIKE 'race_%'`, [interaction.user.id, interaction.guild.id]).catch(()=>{}); }

            } catch (err) {
                console.error("Error in change_race cleanup:", err);
            }
              
            const expiresAt = Date.now() + (7 * 24 * 60 * 60 * 1000);
            try { await db.query(`INSERT INTO user_buffs ("guildID", "userID", "buffPercent", "expiresAt", "buffType", "multiplier") VALUES ($1, $2, $3, $4, $5, $6)`, [interaction.guild.id, interaction.user.id, -5, expiresAt, 'xp', -0.05]); }
            catch(e) { await db.query(`INSERT INTO user_buffs (guildid, userid, buffpercent, expiresat, bufftype, multiplier) VALUES ($1, $2, $3, $4, $5, $6)`, [interaction.guild.id, interaction.user.id, -5, expiresAt, 'xp', -0.05]).catch(()=>{}); }
            try { await db.query(`INSERT INTO user_buffs ("guildID", "userID", "buffPercent", "expiresAt", "buffType", "multiplier") VALUES ($1, $2, $3, $4, $5, $6)`, [interaction.guild.id, interaction.user.id, -5, expiresAt, 'mora', -0.05]); }
            catch(e) { await db.query(`INSERT INTO user_buffs (guildid, userid, buffpercent, expiresat, bufftype, multiplier) VALUES ($1, $2, $3, $4, $5, $6)`, [interaction.guild.id, interaction.user.id, -5, expiresAt, 'mora', -0.05]).catch(()=>{}); }
        }
    } 
    else if (callbackType === 'weapon') {
        const newLevel = itemData.currentLevel + 1;
        if (itemData.isBuy) {
            try { await db.query(`INSERT INTO user_weapons ("userID", "guildID", "raceName", "weaponLevel") VALUES ($1, $2, $3, $4)`, [interaction.user.id, interaction.guild.id, itemData.raceName, newLevel]); }
            catch(e) { await db.query(`INSERT INTO user_weapons (userid, guildid, racename, weaponlevel) VALUES ($1, $2, $3, $4)`, [interaction.user.id, interaction.guild.id, itemData.raceName, newLevel]).catch(()=>{}); }
        }
        else {
            try { await db.query(`UPDATE user_weapons SET "weaponLevel" = $1 WHERE "userID" = $2 AND "guildID" = $3 AND "raceName" = $4`, [newLevel, interaction.user.id, interaction.guild.id, itemData.raceName]); }
            catch(e) { await db.query(`UPDATE user_weapons SET weaponlevel = $1 WHERE userid = $2 AND guildid = $3 AND racename = $4`, [newLevel, interaction.user.id, interaction.guild.id, itemData.raceName]).catch(()=>{}); }
        }
        
        await _handleWeaponUpgrade(interaction, client, db, true); 
    } 
    else if (callbackType === 'skill') {
        const newLevel = itemData.currentLevel + 1;
        if (itemData.isBuy) {
            try { await db.query(`INSERT INTO user_skills ("userID", "guildID", "skillID", "skillLevel") VALUES ($1, $2, $3, $4)`, [interaction.user.id, interaction.guild.id, itemData.skillId, newLevel]); }
            catch(e) { await db.query(`INSERT INTO user_skills (userid, guildid, skillid, skilllevel) VALUES ($1, $2, $3, $4)`, [interaction.user.id, interaction.guild.id, itemData.skillId, newLevel]).catch(()=>{}); }
        }
        else {
            try { await db.query(`UPDATE user_skills SET "skillLevel" = $1 WHERE "id" = $2`, [newLevel, itemData.dbId]); }
            catch(e) { await db.query(`UPDATE user_skills SET skilllevel = $1 WHERE id = $2`, [newLevel, itemData.dbId]).catch(()=>{}); }
        }
        
        await _handleSkillUpgrade(interaction, client, db, true); 
    }

    try { await db.query(`UPDATE levels SET "mora" = $1, "shop_purchases" = COALESCE("shop_purchases", 0) + 1 WHERE "user" = $2 AND "guild" = $3`, [userData.mora, interaction.user.id, interaction.guild.id]); }
    catch(e) { await db.query(`UPDATE levels SET mora = $1, shop_purchases = COALESCE(shop_purchases, 0) + 1 WHERE userid = $2 AND guildid = $3`, [userData.mora, interaction.user.id, interaction.guild.id]).catch(()=>{}); }
    
    let successMsg = `✅ **تمت العملية بنجاح!**\n📦 **العنصر:** ${itemData.name || itemData.raceName || 'Unknown'}\n💰 **المبلغ المدفوع:** ${finalPrice.toLocaleString()} ${EMOJI_MORA}`;
    if (discountUsed > 0) successMsg += `\n📉 **تم تطبيق خصم:** ${discountUsed}%`;
    
    await safeReply({ content: successMsg });
    sendShopLog(client, interaction.guild.id, interaction.member, itemData.name || itemData.raceName || "Unknown", finalPrice, `شراء ${discountUsed > 0 ? '(مع كوبون)' : ''}`);
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
    
    let userSkillRes;
    try { userSkillRes = await db.query(`SELECT * FROM user_skills WHERE "userID" = $1 AND "guildID" = $2 AND "skillID" = $3`, [i.user.id, i.guild.id, skillConfig.id]); }
    catch(e) { userSkillRes = await db.query(`SELECT * FROM user_skills WHERE userid = $1 AND guildid = $2 AND skillid = $3`, [i.user.id, i.guild.id, skillConfig.id]).catch(()=>({rows:[]})); }
    
    let userSkill = userSkillRes.rows[0];
    let currentLevel = userSkill ? Number(userSkill.skillLevel || userSkill.skilllevel) : 0;
    const isRaceSkill = skillConfig.id.startsWith('race_');
    const embedTitle = `${skillConfig.emoji} ${skillConfig.name} ${isRaceSkill ? '(مهارة عرق)' : ''}`;
    const embed = new EmbedBuilder().setTitle(embedTitle).setDescription(skillConfig.description).setColor(isRaceSkill ? Colors.Gold : Colors.Blue).setImage(BANNER_URL).setThumbnail(THUMBNAILS.get('upgrade_skill')).setFooter({ text: `المهارة ${pageIndex + 1} / ${totalSkills}` });
    const navigationRow = new ActionRowBuilder();
    const buttonRow = new ActionRowBuilder();
    navigationRow.addComponents(new ButtonBuilder().setCustomId(`shop_skill_paginate_${prevIndex}`).setEmoji('<:left:1439164494759723029>').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId(`shop_skill_paginate_${nextIndex}`).setEmoji('<:right:1439164491072929915>').setStyle(ButtonStyle.Secondary));
    _buildSkillEmbedFields(embed, buttonRow, skillConfig, currentLevel);
    const components = [buttonRow, navigationRow].filter(r => r.components.length > 0);
    return { embeds: [embed], components: components };
}

function _buildSkillEmbedFields(embed, buttonRow, skillConfig, currentLevel) {
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
}

async function _handleRodSelect(i, client, db) {
    if(i.replied || i.deferred) await i.editReply("جاري التحميل..."); else await i.deferReply({ flags: MessageFlags.Ephemeral });
    let userDataRes;
    try { userDataRes = await db.query(`SELECT "rodLevel" FROM levels WHERE "user" = $1 AND "guild" = $2`, [i.user.id, i.guild.id]); }
    catch(e) { userDataRes = await db.query(`SELECT rodlevel FROM levels WHERE userid = $1 AND guildid = $2`, [i.user.id, i.guild.id]).catch(()=>({rows:[]})); }
    
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
    let userDataRes;
    try { userDataRes = await db.query(`SELECT "boatLevel" FROM levels WHERE "user" = $1 AND "guild" = $2`, [i.user.id, i.guild.id]); }
    catch(e) { userDataRes = await db.query(`SELECT boatlevel FROM levels WHERE userid = $1 AND guildid = $2`, [i.user.id, i.guild.id]).catch(()=>({rows:[]})); }
    
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
    
    let userDataRes;
    try { userDataRes = await db.query(`SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2`, [i.user.id, i.guild.id]); }
    catch(e) { userDataRes = await db.query(`SELECT * FROM levels WHERE userid = $1 AND guildid = $2`, [i.user.id, i.guild.id]).catch(()=>({rows:[]})); }
    let userData = userDataRes.rows[0];

    if (!userData) {
        return i.editReply('❌ لا توجد بيانات مسجلة لك.');
    }

    // 🔥 حماية: فحص الحد الأقصى للمخزن للطعوم 🔥
    let invCheckRes = await db.query(`SELECT "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [i.user.id, i.guild.id, baitId]).catch(()=>({rows:[]}));
    let currQty = invCheckRes.rows[0] ? Number(invCheckRes.rows[0].quantity) : 0;
    if (currQty + qty > MAX_FARM_LIMIT) {
        return await i.editReply({ content: `🚫 **لا يمكنك شراء الطعوم!**\nمخزن الصيد ممتلئ، الحد الأقصى هو **${MAX_FARM_LIMIT}**.` });
    }
    
    if (Number(userData.mora) < cost) {
        const userBank = Number(userData.bank) || 0;
        let msg = `❌ رصيدك غير كافي.`;
        if (userBank >= cost) msg += `\n💡 لديك في البنك **${userBank.toLocaleString()}** مورا، اسحب منها.`;
        return i.editReply(msg);
    }
    
    userData.mora = Number(userData.mora) - cost; 
    
    try { await db.query(`UPDATE levels SET "mora" = $1 WHERE "user" = $2 AND "guild" = $3`, [userData.mora, i.user.id, i.guild.id]); }
    catch(e) { await db.query(`UPDATE levels SET mora = $1 WHERE userid = $2 AND guildid = $3`, [userData.mora, i.user.id, i.guild.id]).catch(()=>{}); }
    
    try { await db.query(`INSERT INTO user_inventory ("guildID", "userID", "itemID", "quantity") VALUES ($1, $2, $3, $4) ON CONFLICT("guildID", "userID", "itemID") DO UPDATE SET "quantity" = LEAST(user_inventory."quantity" + $5, $6)`, [i.guild.id, i.user.id, baitId, qty, qty, MAX_FARM_LIMIT]); }
    catch(e) { await db.query(`INSERT INTO user_inventory (guildid, userid, itemid, quantity) VALUES ($1, $2, $3, $4) ON CONFLICT(guildid, userid, itemid) DO UPDATE SET quantity = LEAST(user_inventory.quantity + $5, $6)`, [i.guild.id, i.user.id, baitId, qty, qty, MAX_FARM_LIMIT]).catch(()=>{}); }
    
    await i.editReply({ content: `✅ تم شراء **${qty}x ${bait.name}** بنجاح!` });
    sendShopLog(client, i.guild.id, i.member, `طعم: ${bait.name} (x${qty})`, cost, "شراء");
}

async function _handleFarmTransaction(i, client, db, isBuy) {
    await i.deferReply({ ephemeral: false }); 
    try {
        const quantityString = i.fields.getTextInputValue('quantity_input');
        const quantity = parseInt(quantityString.trim().replace(/,/g, ''));
        if (isNaN(quantity) || quantity <= 0 || !Number.isInteger(quantity)) return await i.editReply({ content: '❌ كمية غير صالحة.' });
        
        const animalId = i.customId.replace(isBuy ? 'buy_animal_' : 'sell_animal_', '');
        const animal = farmAnimals.find(a => String(a.id) === String(animalId));
        if (!animal) return await i.editReply({ content: '❌ حيوان غير موجود.' });

        let userDataRes;
        try { userDataRes = await db.query(`SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2`, [i.user.id, i.guild.id]); }
        catch(e) { userDataRes = await db.query(`SELECT * FROM levels WHERE userid = $1 AND guildid = $2`, [i.user.id, i.guild.id]).catch(()=>({rows:[]})); }
        let userData = userDataRes.rows[0] || { user: i.user.id, guild: i.guild.id, mora: 0, bank: 0 };
        let userMora = Number(userData.mora) || 0; 
        const userBank = Number(userData.bank) || 0;

        if (isBuy) {
            // 🔥 حماية: فحص الحد الأقصى للمزرعة للحيوانات 🔥
            let farmCountRes;
            try { farmCountRes = await db.query(`SELECT SUM("quantity") as count FROM user_farm WHERE "userID" = $1 AND "guildID" = $2 AND "animalID" = $3`, [i.user.id, i.guild.id, animal.id]); }
            catch(e) { farmCountRes = await db.query(`SELECT SUM(quantity) as count FROM user_farm WHERE userid = $1 AND guildid = $2 AND animalid = $3`, [i.user.id, i.guild.id, animal.id]).catch(()=>({rows:[{count:0}]})); }
            const farmCount = Number(farmCountRes.rows[0]?.count || 0);
            
            if (farmCount + quantity > MAX_FARM_LIMIT) {
                return await i.editReply({ content: `🚫 **مزرعتك لا تتسع!**\nالحد الأقصى لتربية هذا الحيوان هو **${MAX_FARM_LIMIT}**.` });
            }

            const totalCost = Math.floor(animal.price * quantity);
            if (userMora < totalCost) {
                let msg = `❌ رصيدك غير كافي! تحتاج: **${totalCost.toLocaleString()}** ${EMOJI_MORA}`;
                if (userBank >= totalCost) msg += `\n💡 لديك في البنك **${userBank.toLocaleString()}**، اسحب منها.`;
                return await i.editReply({ content: msg });
            }
            
            const now = Date.now();
            try {
                await db.query("BEGIN");
                try { await db.query(`UPDATE levels SET "mora" = "mora" - $1, "shop_purchases" = COALESCE("shop_purchases", 0) + 1 WHERE "user" = $2 AND "guild" = $3`, [totalCost, i.user.id, i.guild.id]); }
                catch(e) { await db.query(`UPDATE levels SET mora = mora - $1, shop_purchases = COALESCE(shop_purchases, 0) + 1 WHERE userid = $2 AND guildid = $3`, [totalCost, i.user.id, i.guild.id]).catch(()=>{}); }
                
                try { await db.query(`INSERT INTO user_farm ("guildID", "userID", "animalID", "quantity", "purchaseTimestamp", "lastCollected") VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT("guildID", "userID", "animalID") DO UPDATE SET "quantity" = user_farm."quantity" + $4`, [i.guild.id, i.user.id, animal.id, quantity, now, now]); }
                catch(e) { await db.query(`INSERT INTO user_farm (guildid, userid, animalid, quantity, purchasetimestamp, lastcollected) VALUES ($1, $2, $3, $4, $5, $6)`, [i.guild.id, i.user.id, animal.id, quantity, now, now]).catch(()=>{}); }
                
                await db.query("COMMIT");
            } catch (txErr) {
                await db.query("ROLLBACK");
                throw txErr;
            }
            
            const embed = new EmbedBuilder().setTitle('✅ تم الشراء').setColor(Colors.Green).setDescription(`📦 **${quantity}** × ${animal.name}\n💵 التكلفة: **${totalCost.toLocaleString()}** ${EMOJI_MORA}`).setAuthor({ name: i.user.username, iconURL: i.user.displayAvatarURL() });
            return await i.editReply({ embeds: [embed] });
        } else {
            let farmCountRes;
            try { farmCountRes = await db.query(`SELECT SUM("quantity") as count FROM user_farm WHERE "userID" = $1 AND "guildID" = $2 AND "animalID" = $3`, [i.user.id, i.guild.id, animal.id]); }
            catch(e) { farmCountRes = await db.query(`SELECT SUM(quantity) as count FROM user_farm WHERE userid = $1 AND guildid = $2 AND animalid = $3`, [i.user.id, i.guild.id, animal.id]).catch(()=>({rows:[{count:0}]})); }
            const farmCount = Number(farmCountRes.rows[0]?.count || 0);
            if (farmCount < quantity) return await i.editReply({ content: `❌ لا تملك هذه الكمية.` });
            
            const totalGain = Math.floor(animal.price * 0.70 * quantity); 
            
            try {
                await db.query("BEGIN");
                
                try { await db.query(`UPDATE user_farm SET "quantity" = "quantity" - $1 WHERE "userID" = $2 AND "guildID" = $3 AND "animalID" = $4`, [quantity, i.user.id, i.guild.id, animal.id]); }
                catch(e) { await db.query(`UPDATE user_farm SET quantity = quantity - $1 WHERE userid = $2 AND guildid = $3 AND animalid = $4`, [quantity, i.user.id, i.guild.id, animal.id]).catch(()=>{}); }
                
                // حذف السجلات التي أصبحت كميتها صفر أو أقل
                try { await db.query(`DELETE FROM user_farm WHERE "userID" = $1 AND "guildID" = $2 AND "animalID" = $3 AND "quantity" <= 0`, [i.user.id, i.guild.id, animal.id]); }
                catch(e) { await db.query(`DELETE FROM user_farm WHERE userid = $1 AND guildid = $2 AND animalid = $3 AND quantity <= 0`, [i.user.id, i.guild.id, animal.id]).catch(()=>{}); }

                try { await db.query(`UPDATE levels SET "mora" = "mora" + $1 WHERE "user" = $2 AND "guild" = $3`, [totalGain, i.user.id, i.guild.id]); }
                catch(e) { await db.query(`UPDATE levels SET mora = mora + $1 WHERE userid = $2 AND guildid = $3`, [totalGain, i.user.id, i.guild.id]).catch(()=>{}); }
                await db.query("COMMIT");
            } catch (txErr) {
                await db.query("ROLLBACK");
                throw txErr;
            }
            
            const embed = new EmbedBuilder().setTitle('✅ تم البيع').setColor(Colors.Green).setDescription(`📦 **${quantity}** × ${animal.name}\n💵 الربح: **${totalGain.toLocaleString()}** ${EMOJI_MORA}`).setAuthor({ name: i.user.username, iconURL: i.user.displayAvatarURL() });
            return await i.editReply({ embeds: [embed] });
        }
    } catch (e) { console.error(e); await i.editReply("❌ حدث خطأ."); }
}

function calculateSlippage(currentPrice, quantity, isBuy) {
    const slippageRate = 0.001; 
    let avgPrice = currentPrice;
    
    if (quantity > 1) {
        if (isBuy) {
            avgPrice = currentPrice * (1 + (slippageRate * quantity / 2));
        } else {
            avgPrice = currentPrice * (1 - (slippageRate * quantity / 2));
        }
    }
    
    return Math.max(1, avgPrice);
}

async function _handleMarketTransaction(i, client, db, isBuy) {
    await i.deferReply({ ephemeral: false }); 
    try {
        const quantityString = i.fields.getTextInputValue('quantity_input');
        const quantity = parseInt(quantityString.trim().replace(/,/g, ''));
        if (isNaN(quantity) || quantity <= 0 || !Number.isInteger(quantity)) return await i.editReply({ content: '❌ كمية غير صالحة.' });

        const assetId = i.customId.replace(isBuy ? 'buy_modal_' : 'sell_modal_', '');
        
        if (isBuy && client.marketLocks && client.marketLocks.has(assetId)) {
            return await i.editReply({ content: `🚫 **السهم في حالة انهيار وإعادة هيكلة!**\nيرجى الانتظار قليلاً حتى يتم طرحه بالسعر الجديد.` });
        }

        let itemRes;
        try { itemRes = await db.query(`SELECT * FROM market_items WHERE "id" = $1`, [assetId]); }
        catch(e) { itemRes = await db.query(`SELECT * FROM market_items WHERE id = $1`, [assetId]).catch(()=>({rows:[]})); }
        const item = itemRes.rows[0];
        if (!item) return await i.editReply({ content: '❌ الأصل غير موجود.' });

        let userDataRes;
        try { userDataRes = await db.query(`SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2`, [i.user.id, i.guild.id]); }
        catch(e) { userDataRes = await db.query(`SELECT * FROM levels WHERE userid = $1 AND guildid = $2`, [i.user.id, i.guild.id]).catch(()=>({rows:[]})); }
        let userData = userDataRes.rows[0] || { user: i.user.id, guild: i.guild.id, mora: 0, bank: 0 };
        let userMora = Number(userData.mora) || 0; 
        const userBank = Number(userData.bank) || 0;

        if (isBuy) {
            const avgPrice = calculateSlippage(Number(item.currentPrice || item.currentprice), quantity, true);
            const totalCost = Math.floor(avgPrice * quantity);
            if (userMora < totalCost) {
                let msg = `❌ رصيدك غير كافي!`;
                if (userBank >= totalCost) msg += `\n💡 لديك في البنك **${userBank.toLocaleString()}**، اسحب منها.`;
                if (totalCost > (Number(item.currentPrice || item.currentprice) * quantity)) msg += `\n⚠️ السعر ارتفع بسبب الانزلاق السعري (الكمية الكبيرة). التكلفة الحالية: **${totalCost.toLocaleString()}**`;
                return await i.editReply({ content: msg });
            }
            
            try {
                await db.query("BEGIN");
                try { await db.query(`UPDATE levels SET "mora" = "mora" - $1, "shop_purchases" = COALESCE("shop_purchases", 0) + 1 WHERE "user" = $2 AND "guild" = $3`, [totalCost, i.user.id, i.guild.id]); }
                catch(e) { await db.query(`UPDATE levels SET mora = mora - $1, shop_purchases = COALESCE(shop_purchases, 0) + 1 WHERE userid = $2 AND guildid = $3`, [totalCost, i.user.id, i.guild.id]).catch(()=>{}); }
                
                let pfItemRes;
                try { pfItemRes = await db.query(`SELECT * FROM user_portfolio WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [i.user.id, i.guild.id, item.id]); }
                catch(e) { pfItemRes = await db.query(`SELECT * FROM user_portfolio WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [i.user.id, i.guild.id, item.id]).catch(()=>({rows:[]})); }
                let pfItem = pfItemRes.rows[0];
                
                if (pfItem) {
                    try { await db.query(`UPDATE user_portfolio SET "quantity" = "quantity" + $1 WHERE "id" = $2`, [quantity, pfItem.id]); }
                    catch(e) { await db.query(`UPDATE user_portfolio SET quantity = quantity + $1 WHERE id = $2`, [quantity, pfItem.id]).catch(()=>{}); }
                } else {
                    try { await db.query(`INSERT INTO user_portfolio ("guildID", "userID", "itemID", "quantity", "purchasePrice") VALUES ($1, $2, $3, $4, $5)`, [i.guild.id, i.user.id, item.id, quantity, avgPrice]); }
                    catch(e) { await db.query(`INSERT INTO user_portfolio (guildid, userid, itemid, quantity, purchaseprice) VALUES ($1, $2, $3, $4, $5)`, [i.guild.id, i.user.id, item.id, quantity, avgPrice]).catch(()=>{}); }
                }
                await db.query("COMMIT");
            } catch (txErr) {
                await db.query("ROLLBACK");
                throw txErr;
            }
            
            const embed = new EmbedBuilder().setTitle('✅ تم الشراء').setColor(Colors.Green).setDescription(`📦 **${quantity}** × ${item.name}\n💵 التكلفة: **${totalCost.toLocaleString()}** ${EMOJI_MORA}`).setAuthor({ name: i.user.username, iconURL: i.user.displayAvatarURL() });
            await i.editReply({ embeds: [embed] });
        } else {
            let pfItemRes;
            try { pfItemRes = await db.query(`SELECT * FROM user_portfolio WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [i.user.id, i.guild.id, item.id]); }
            catch(e) { pfItemRes = await db.query(`SELECT * FROM user_portfolio WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [i.user.id, i.guild.id, item.id]).catch(()=>({rows:[]})); }
            let pfItem = pfItemRes.rows[0];
            const userQty = pfItem ? Number(pfItem.quantity) : 0;
            if (userQty < quantity) return await i.editReply({ content: `❌ لا تملك الكمية.` });
            
            const avgPrice = calculateSlippage(Number(item.currentPrice || item.currentprice), quantity, false);
            const totalGain = Math.floor(avgPrice * quantity);
            
            try {
                await db.query("BEGIN");
                try { await db.query(`UPDATE levels SET "mora" = "mora" + $1 WHERE "user" = $2 AND "guild" = $3`, [totalGain, i.user.id, i.guild.id]); }
                catch(e) { await db.query(`UPDATE levels SET mora = mora + $1 WHERE userid = $2 AND guildid = $3`, [totalGain, i.user.id, i.guild.id]).catch(()=>{}); }
                
                if (userQty - quantity > 0) {
                    try { await db.query(`UPDATE user_portfolio SET "quantity" = $1 WHERE "id" = $2`, [userQty - quantity, pfItem.id]); }
                    catch(e) { await db.query(`UPDATE user_portfolio SET quantity = $1 WHERE id = $2`, [userQty - quantity, pfItem.id]).catch(()=>{}); }
                } else {
                    try { await db.query(`DELETE FROM user_portfolio WHERE "id" = $1`, [pfItem.id]); }
                    catch(e) { await db.query(`DELETE FROM user_portfolio WHERE id = $1`, [pfItem.id]).catch(()=>{}); }
                }
                await db.query("COMMIT");
            } catch (txErr) {
                await db.query("ROLLBACK");
                throw txErr;
            }
            
            const embed = new EmbedBuilder().setTitle('✅ تم البيع').setColor(Colors.Green).setDescription(`📦 **${quantity}** × ${item.name}\n💵 الربح: **${totalGain.toLocaleString()}** ${EMOJI_MORA}`).setAuthor({ name: i.user.username, iconURL: i.user.displayAvatarURL() });
            await i.editReply({ embeds: [embed] });
        }
    } catch (e) { console.error(e); await i.editReply("❌ حدث خطأ."); }
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
             const embed = new EmbedBuilder().setTitle('تبديل الخبرة').setDescription(`السعر: ${XP_EXCHANGE_RATE} مورا = 1 XP`).setColor(Colors.Blue).setImage(BANNER_URL).setThumbnail(THUMBNAILS.get('exchange_xp'));
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

async function handleShopInteractions(i, client, db) {
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
    handleSkillSelectMenu
};
