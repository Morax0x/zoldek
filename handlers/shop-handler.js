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
    ensureInventoryTable, sendShopLog 
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
    try {
        return await db.query(query, params);
    } catch (e) {
        console.error(`[DB Error]: ${e.message} \nQuery: ${query}`);
        throw e; 
    }
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
    
    let bossCouponRes = await executeDB(db, `SELECT * FROM user_coupons WHERE "guildID" = $1 AND "userID" = $2 AND "isUsed" = 0 LIMIT 1`, [guildID, userID]).catch(()=>({rows:[]}));
    const bossCoupon = bossCouponRes?.rows?.[0] || null;
    
    let roleCouponsConfigRes = await executeDB(db, `SELECT * FROM role_coupons_config WHERE "guildID" = $1`, [guildID]).catch(()=>({rows:[]}));
    const roleCouponsConfig = roleCouponsConfigRes?.rows || [];
    
    let bestRoleCoupon = null;
    for (const config of roleCouponsConfig) {
        if (member.roles.cache.has(config.roleID)) {
            if (!bestRoleCoupon || Number(config.discountPercent) > Number(bestRoleCoupon.discountPercent)) bestRoleCoupon = config;
        }
    }
    
    let isRoleCouponReady = false;
    if (bestRoleCoupon) {
        let usageDataRes = await executeDB(db, `SELECT "lastUsedTimestamp" FROM user_role_coupon_usage WHERE "guildID" = $1 AND "userID" = $2`, [guildID, userID]).catch(()=>({rows:[]}));
        const usageData = usageDataRes?.rows?.[0];
        const fifteenDaysMs = 15 * 24 * 60 * 60 * 1000;
        if (!usageData || (Date.now() - Number(usageData.lastUsedTimestamp) > fifteenDaysMs)) isRoleCouponReady = true; else bestRoleCoupon = null; 
    }
    
    if (!bossCoupon && !bestRoleCoupon) return processFinalPurchase(interaction, itemData, quantity, totalPrice, 0, 'none', client, db, callbackType);

    const row = new ActionRowBuilder();
    let couponMessage = "";
    let finalPriceWithBoss = totalPrice;
    let finalPriceWithRole = totalPrice;

    if (bossCoupon) {
        const disCount = Number(bossCoupon.discountPercent);
        finalPriceWithBoss = Math.floor(totalPrice * (1 - (disCount / 100)));
        couponMessage += `✶ لديـك كـوبـون خـصم بقيـمـة: **${disCount}%** هل تريـد استعمـالـه؟\n✬ اذا استعملته ستدفـع: **${finalPriceWithBoss.toLocaleString()}** ${EMOJI_MORA} - بدلاً مـن: **${totalPrice.toLocaleString()}**\n\n`;
        row.addComponents(new ButtonBuilder().setCustomId('use_boss_coupon').setLabel(`استعمـال (${disCount}%)`).setStyle(ButtonStyle.Success).setEmoji('🎫'));
    }
    if (bestRoleCoupon && isRoleCouponReady) {
        const disCount = Number(bestRoleCoupon.discountPercent);
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
        else if (i.customId === 'use_boss_coupon') await processFinalPurchase(i, itemData, quantity, finalPriceWithBoss, Number(bossCoupon.discountPercent), 'boss', client, db, callbackType, bossCoupon.id);
        else if (i.customId === 'use_role_coupon') await processFinalPurchase(i, itemData, quantity, finalPriceWithRole, Number(bestRoleCoupon.discountPercent), 'role', client, db, callbackType);
        collector.stop();
    });
}

async function processFinalPurchase(interaction, itemData, quantity, finalPrice, discountUsed, couponType, client, db, callbackType, couponIdToDelete = null) {
    let userData = await client.getLevel(interaction.user.id, interaction.guild.id);
    if (!userData) {
        userData = { user: interaction.user.id, guild: interaction.guild.id, level: 1, mora: 0, bank: 0, xp: 0, totalXP: 0 };
    }
      
    const errorReply = async (msgContent) => {
        if (interaction.deferred || interaction.replied) return await interaction.followUp({ content: msgContent, flags: MessageFlags.Ephemeral }); 
        else return await interaction.reply({ content: msgContent, flags: MessageFlags.Ephemeral });
    };

    if (Number(userData.mora) < finalPrice) {
        const userBank = Number(userData.bank) || 0; 
        let errorMsg = `❌ **عذراً، لا تملك مورا كافية!**\nالمطلوب بالكاش: **${finalPrice.toLocaleString()}** ${EMOJI_MORA}`;
        if (userBank >= finalPrice) errorMsg += `\n\n💡 **تلميح:** ليس لديك كاش كافٍ، ولكن لديك **${userBank.toLocaleString()}** في البنك. قم بسحبها أولاً.`;
        return await errorReply(errorMsg);
    }

    if (callbackType === 'item') {
        if (itemData.category === 'potions' || itemData.id.startsWith('potion_')) {
            let invCheckRes = await executeDB(db, `SELECT "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [interaction.user.id, interaction.guild.id, itemData.id]).catch(()=>({rows:[]}));
            let currQty = invCheckRes?.rows?.[0] ? Number(invCheckRes.rows[0].quantity) : 0;
            if (currQty + quantity > MAX_POTION_LIMIT) return await errorReply(`🚫 **لا يمكنك الشراء!**\nحقيبتك لا تتسع للمزيد من هذا العنصر. الحد الأقصى هو **${MAX_POTION_LIMIT}**.`);
        } 
    }

    // 💰 خصم المورا وتحديث بيانات اللاعب الأساسية
    userData.mora = Number(userData.mora) - finalPrice;
    userData.shop_purchases = (Number(userData.shop_purchases) || 0) + 1;
    if (callbackType === 'item' && itemData.id === 'personal_guard_1d') {
        userData.hasGuard = Math.min((Number(userData.hasGuard) || 0) + 3, 6);
        userData.guardExpires = 0;
    }
    await client.setLevel(userData);
      
    try {
        if (couponType === 'boss' && couponIdToDelete) {
            await executeDB(db, `DELETE FROM user_coupons WHERE "id" = $1`, [couponIdToDelete]);
        }
        else if (couponType === 'role') {
            let roleUsageRes = await executeDB(db, `SELECT "userID" FROM user_role_coupon_usage WHERE "guildID" = $1 AND "userID" = $2`, [interaction.guild.id, interaction.user.id]).catch(()=>({rows:[]}));
            if (roleUsageRes?.rows?.[0]) {
                await executeDB(db, `UPDATE user_role_coupon_usage SET "lastUsedTimestamp" = $1 WHERE "guildID" = $2 AND "userID" = $3`, [Date.now(), interaction.guild.id, interaction.user.id]);
            } else {
                await executeDB(db, `INSERT INTO user_role_coupon_usage ("guildID", "userID", "lastUsedTimestamp") VALUES ($1, $2, $3)`, [interaction.guild.id, interaction.user.id, Date.now()]);
            }
        }

        if (callbackType === 'item') {
            if (itemData.category === 'potions' || itemData.id.startsWith('potion_')) { 
                if(ensureInventoryTable) await ensureInventoryTable(db); 
                let invCheckRes = await executeDB(db, `SELECT "id", "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [interaction.user.id, interaction.guild.id, itemData.id]).catch(()=>({rows:[]}));
                if (invCheckRes?.rows?.[0]) {
                    const invId = invCheckRes.rows[0].id;
                    let newQty = Math.min(Number(invCheckRes.rows[0].quantity || 0) + 1, MAX_POTION_LIMIT);
                    await executeDB(db, `UPDATE user_inventory SET "quantity" = $1 WHERE "id" = $2`, [newQty, invId]);
                } else {
                    await executeDB(db, `INSERT INTO user_inventory ("guildID", "userID", "itemID", "quantity") VALUES ($1, $2, $3, 1)`, [interaction.guild.id, interaction.user.id, itemData.id]);
                }
            }
            else if (itemData.id === 'streak_shield') {
                let existingStreakRes = await executeDB(db, `SELECT "id" FROM streaks WHERE "userID" = $1 AND "guildID" = $2`, [interaction.user.id, interaction.guild.id]).catch(()=>({rows:[]}));
                if (existingStreakRes?.rows?.[0]) {
                    const strkId = existingStreakRes.rows[0].id;
                    await executeDB(db, `UPDATE streaks SET "hasItemShield" = COALESCE("hasItemShield", 0) + 1 WHERE "id" = $1`, [strkId]);
                } else {
                    const id = `${interaction.guild.id}-${interaction.user.id}`;
                    await executeDB(db, `INSERT INTO streaks ("id", "guildID", "userID", "hasItemShield") VALUES ($1, $2, $3, 1)`, [id, interaction.guild.id, interaction.user.id]);
                }
            }
            else if (itemData.id === 'streak_shield_media') {
                let existingMediaRes = await executeDB(db, `SELECT "id" FROM media_streaks WHERE "userID" = $1 AND "guildID" = $2`, [interaction.user.id, interaction.guild.id]).catch(()=>({rows:[]}));
                if (existingMediaRes?.rows?.[0]) {
                    const medId = existingMediaRes.rows[0].id;
                    await executeDB(db, `UPDATE media_streaks SET "hasItemShield" = COALESCE("hasItemShield", 0) + 1 WHERE "id" = $1`, [medId]);
                } else {
                    const id = `${interaction.guild.id}-${interaction.user.id}`;
                    await executeDB(db, `INSERT INTO media_streaks ("id", "guildID", "userID", "hasItemShield") VALUES ($1, $2, $3, 1)`, [id, interaction.guild.id, interaction.user.id]);
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
                    let buffRes = await executeDB(db, `SELECT "id" FROM user_buffs WHERE "userID" = $1 AND "guildID" = $2 AND "buffType" = 'xp'`, [interaction.user.id, interaction.guild.id]).catch(()=>({rows:[]}));
                    const expiresAt = Date.now() + duration;
                    if (buffRes?.rows?.[0]) {
                        const bfId = buffRes.rows[0].id;
                        await executeDB(db, `UPDATE user_buffs SET "multiplier" = $1, "expiresAt" = $2, "buffPercent" = $3 WHERE "id" = $4`, [multiplier, expiresAt, buffPercent, bfId]);
                    } else {
                        await executeDB(db, `INSERT INTO user_buffs ("userID", "guildID", "buffType", "multiplier", "expiresAt", "buffPercent") VALUES ($1, $2, $3, $4, $5, $6)`, [interaction.user.id, interaction.guild.id, 'xp', multiplier, expiresAt, buffPercent]);
                    }
                }
            }
            else if (itemData.id === 'vip_role_3d') {
                let settingsRes = await executeDB(db, `SELECT "vipRoleID" FROM settings WHERE "guild" = $1`, [interaction.guild.id]).catch(()=>({rows:[]}));
                const settings = settingsRes?.rows?.[0];
                if (settings && settings.vipRoleID) {
                    const member = await interaction.guild.members.fetch(interaction.user.id).catch(()=>{});
                    if (member) await member.roles.add(settings.vipRoleID).catch(()=>{});
                    const expiresAt = Date.now() + (3 * 24 * 60 * 60 * 1000);
                    let roleCheck = await executeDB(db, `SELECT "roleID" FROM temporary_roles WHERE "userID" = $1 AND "guildID" = $2 AND "roleID" = $3`, [interaction.user.id, interaction.guild.id, settings.vipRoleID]).catch(()=>({rows:[]}));
                    if (roleCheck?.rows?.[0]) {
                        await executeDB(db, `UPDATE temporary_roles SET "expiresAt" = $1 WHERE "userID" = $2 AND "guildID" = $3 AND "roleID" = $4`, [expiresAt, interaction.user.id, interaction.guild.id, settings.vipRoleID]);
                    } else {
                        await executeDB(db, `INSERT INTO temporary_roles ("userID", "guildID", "roleID", "expiresAt") VALUES ($1, $2, $3, $4)`, [interaction.user.id, interaction.guild.id, settings.vipRoleID, expiresAt]);
                    }
                }
            }
            else if (itemData.id === 'farm_worker_3d') {
                const duration = 3 * 24 * 60 * 60 * 1000;
                let existingWorkerRes = await executeDB(db, `SELECT "expiresAt", "id" FROM user_buffs WHERE "userID" = $1 AND "guildID" = $2 AND "buffType" = 'farm_worker'`, [interaction.user.id, interaction.guild.id]).catch(()=>({rows:[]}));
                const existingWorker = existingWorkerRes?.rows?.[0];
                let newExpiresAt = Date.now() + duration;
                
                if (existingWorker) {
                    if (Number(existingWorker.expiresAt) > Date.now()) {
                        newExpiresAt = Number(existingWorker.expiresAt) + duration;
                    }
                    const workerId = existingWorker.id;
                    await executeDB(db, `UPDATE user_buffs SET "expiresAt" = $1 WHERE "id" = $2`, [newExpiresAt, workerId]);
                } else {
                    await executeDB(db, `INSERT INTO user_buffs ("userID", "guildID", "buffType", "multiplier", "expiresAt", "buffPercent") VALUES ($1, $2, $3, $4, $5, $6)`, [interaction.user.id, interaction.guild.id, 'farm_worker', 0, newExpiresAt, 0]);
                }
            }
            else if (itemData.id === 'change_race') {
                let allRaceRolesRes = await executeDB(db, `SELECT "roleID", "raceName" FROM race_roles WHERE "guildID" = $1`, [interaction.guild.id]).catch(()=>({rows:[]}));
                const raceRoleIDs = (allRaceRolesRes?.rows || []).map(r => r.roleID);
                const userRaceRole = interaction.member.roles.cache.find(r => raceRoleIDs.includes(r.id));
                if (userRaceRole) { await interaction.member.roles.remove(userRaceRole).catch(()=>{}); }

                await executeDB(db, `DELETE FROM race_dungeon_buffs WHERE "guildID" = $1 AND "roleID" = $2`, [interaction.guild.id, userRaceRole ? userRaceRole.id : 'none']).catch(()=>{});
                
                const expiresAt = Date.now() + (7 * 24 * 60 * 60 * 1000);
                let xpBuffCheck = await executeDB(db, `SELECT "id" FROM user_buffs WHERE "userID" = $1 AND "guildID" = $2 AND "buffType" = 'xp'`, [interaction.user.id, interaction.guild.id]).catch(()=>({rows:[]}));
                if (xpBuffCheck?.rows?.[0]) {
                    const xpId = xpBuffCheck.rows[0].id;
                    await executeDB(db, `UPDATE user_buffs SET "buffPercent" = $1, "expiresAt" = $2, "multiplier" = $3 WHERE "id" = $4`, [-5, expiresAt, -0.05, xpId]);
                }
                else await executeDB(db, `INSERT INTO user_buffs ("guildID", "userID", "buffPercent", "expiresAt", "buffType", "multiplier") VALUES ($1, $2, $3, $4, 'xp', $5)`, [interaction.guild.id, interaction.user.id, -5, expiresAt, -0.05]);
                
                let moraBuffCheck = await executeDB(db, `SELECT "id" FROM user_buffs WHERE "userID" = $1 AND "guildID" = $2 AND "buffType" = 'mora'`, [interaction.user.id, interaction.guild.id]).catch(()=>({rows:[]}));
                if (moraBuffCheck?.rows?.[0]) {
                    const moraId = moraBuffCheck.rows[0].id;
                    await executeDB(db, `UPDATE user_buffs SET "buffPercent" = $1, "expiresAt" = $2, "multiplier" = $3 WHERE "id" = $4`, [-5, expiresAt, -0.05, moraId]);
                }
                else await executeDB(db, `INSERT INTO user_buffs ("guildID", "userID", "buffPercent", "expiresAt", "buffType", "multiplier") VALUES ($1, $2, $3, $4, 'mora', $5)`, [interaction.guild.id, interaction.user.id, -5, expiresAt, -0.05]);
            }
        } 
        
    } catch (e) {
        // إذا فشل حفظ المشتريات، نُعيد الأموال للّاعب فوراً كإجراء أمني
        userData.mora = Number(userData.mora) + finalPrice;
        await client.setLevel(userData);
        return await safeReply({ content: `❌ **حدث خطأ برمجي داخلي!**\nتم إرجاع **${finalPrice.toLocaleString()}** مورا لحسابك لتجنب ضياعها.\n(${e.message})` });
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
    
    if(sendShopLog) sendShopLog(client, interaction.guild.id, interaction.member, itemData.name || "Unknown", finalPrice, `شراء ${discountUsed > 0 ? '(مع كوبون)' : ''}`);
}

async function _handleRodUpgrade(i, client, db) {
    await i.deferUpdate();
    let userData = await client.getLevel(i.user.id, i.guild.id);
    if (!userData) return i.followUp({ content: '❌ لا توجد بيانات مسجلة لك.', flags: MessageFlags.Ephemeral });

    const currentLevel = Number(userData.rodLevel) || 1;
    const nextLevel = currentLevel + 1;
    const nextRod = finalRods.find(r => r.level === nextLevel);

    if (!nextRod) return i.followUp({ content: '❌ لقد وصلت للحد الأقصى للسنارة بالفعل!', flags: MessageFlags.Ephemeral });

    if (Number(userData.mora) < nextRod.price) {
        const userBank = Number(userData.bank) || 0;
        let msg = `❌ رصيدك غير كافي! تحتاج إلى **${nextRod.price.toLocaleString()}** ${EMOJI_MORA}`;
        if (userBank >= nextRod.price) msg += `\n💡 لديك في البنك **${userBank.toLocaleString()}** مورا. اسحبها أولاً.`;
        return i.followUp({ content: msg, flags: MessageFlags.Ephemeral });
    }

    // الدفع والترقية المباشرة
    userData.mora = Number(userData.mora) - nextRod.price;
    userData.rodLevel = nextLevel;
    await client.setLevel(userData);

    const embed = new EmbedBuilder()
        .setTitle('✅ تمت الترقية بنجاح!')
        .setColor(Colors.Green)
        .setDescription(`تم تطوير سنارتك إلى **${nextRod.name}**\n💰 التكلفة: ${nextRod.price.toLocaleString()} ${EMOJI_MORA}`);
    if (nextRod.image) embed.setThumbnail(nextRod.image);

    await i.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
    if(sendShopLog) sendShopLog(client, i.guild.id, i.member, `تطوير سنارة (${nextRod.name})`, nextRod.price, "ترقية");
}

async function _handleBoatUpgrade(i, client, db) {
    await i.deferUpdate();
    let userData = await client.getLevel(i.user.id, i.guild.id);
    if (!userData) return i.followUp({ content: '❌ لا توجد بيانات مسجلة لك.', flags: MessageFlags.Ephemeral });

    const currentLevel = Number(userData.boatLevel) || 1;
    const nextLevel = currentLevel + 1;
    const nextBoat = finalBoats.find(b => b.level === nextLevel);

    if (!nextBoat) return i.followUp({ content: '❌ لقد وصلت للحد الأقصى للقارب بالفعل!', flags: MessageFlags.Ephemeral });

    if (Number(userData.mora) < nextBoat.price) {
        const userBank = Number(userData.bank) || 0;
        let msg = `❌ رصيدك غير كافي! تحتاج إلى **${nextBoat.price.toLocaleString()}** ${EMOJI_MORA}`;
        if (userBank >= nextBoat.price) msg += `\n💡 لديك في البنك **${userBank.toLocaleString()}** مورا. اسحبها أولاً.`;
        return i.followUp({ content: msg, flags: MessageFlags.Ephemeral });
    }

    // الدفع والترقية
    userData.mora = Number(userData.mora) - nextBoat.price;
    userData.boatLevel = nextLevel;
    await client.setLevel(userData);

    const embed = new EmbedBuilder()
        .setTitle('✅ تمت الترقية بنجاح!')
        .setColor(Colors.Green)
        .setDescription(`تم تطوير قاربك إلى **${nextBoat.name}**\n💰 التكلفة: ${nextBoat.price.toLocaleString()} ${EMOJI_MORA}`);
    if (nextBoat.image) embed.setThumbnail(nextBoat.image);

    await i.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
    if(sendShopLog) sendShopLog(client, i.guild.id, i.member, `تطوير قارب (${nextBoat.name})`, nextBoat.price, "ترقية");
}

async function _handleShopButton(i, client, db, explicitItemId = null) {
    try {
        const userId = i.user.id; 
        const guildId = i.guild.id; 
        const boughtItemId = explicitItemId || i.customId.replace('buy_item_', ''); 
          
        let item = shopItems.find(it => it.id === boughtItemId) || finalPotionItems.find(it => it.id === boughtItemId);
        if (!item) return await i.reply({ content: '❌ هذا العنصر غير موجود!', flags: MessageFlags.Ephemeral });
        
        let userData = await client.getLevel(userId, guildId); 
        if (!userData) userData = { mora: 0, bank: 0 };
          
        const NON_DISCOUNTABLE = ['xp_buff_1d_3', 'xp_buff_1d_7', 'xp_buff_2d_10'];
        
        if (!i.replied && !i.deferred) await i.deferReply({ flags: MessageFlags.Ephemeral });

        if (item.id === 'personal_guard_1d') {
            if (Number(userData.hasGuard || 0) >= 6) {
                return await i.editReply({ content: `🚫 **لا يمكنك الشراء!**\nلديك بالفعل أقصى عدد من محاولات حماية الحارس الشخصي (الحد الأقصى 6).` });
            }
        }
        else if (item.id === 'streak_shield') {
            let existingRes = await executeDB(db, `SELECT "hasItemShield" FROM streaks WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId]).catch(()=>({rows:[]}));
            const currentShields = Number(existingRes?.rows?.[0]?.hasItemShield || 0);
            if (currentShields >= 3) {
                return await i.editReply({ content: `🚫 **درعك ممتلئ!**\nلديك **${currentShields}** دروع ستريك نشطة حالياً. لا يمكنك شراء المزيد.` });
            }
        }
        else if (item.id === 'streak_shield_media') {
            let existingRes = await executeDB(db, `SELECT "hasItemShield" FROM media_streaks WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId]).catch(()=>({rows:[]}));
            const currentShields = Number(existingRes?.rows?.[0]?.hasItemShield || 0);
            if (currentShields >= 3) {
                return await i.editReply({ content: `🚫 **درع الميديا ممتلئ!**\nلديك **${currentShields}** دروع نشطة حالياً. لا يمكنك شراء المزيد.` });
            }
        }
        else if (item.id === 'farm_worker_3d') {
            let existingWorkerRes = await executeDB(db, `SELECT "expiresAt" FROM user_buffs WHERE "userID" = $1 AND "guildID" = $2 AND "buffType" = 'farm_worker'`, [userId, guildId]).catch(()=>({rows:[]}));
            const existingWorker = existingWorkerRes?.rows?.[0];
            const expiresAtMs = Number(existingWorker?.expiresAt || 0);
            const remainingDays = Math.ceil((expiresAtMs - Date.now()) / (24 * 60 * 60 * 1000));
            
            if (remainingDays >= 6) {
                return await i.editReply({ content: `🚫 **لا يمكنك توظيف عمال إضافيين!**\nوقت العامل الحالي يتجاوز الحد الأقصى المسموح (يتبقى له ${remainingDays} أيام).` });
            }
        }
        else if (item.id.startsWith('xp_buff_')) {
            let getActiveBuffRes = await executeDB(db, `SELECT * FROM user_buffs WHERE "userID" = $1 AND "guildID" = $2 AND "buffType" = 'xp' AND "expiresAt" > $3`, [userId, guildId, Date.now()]).catch(()=>({rows:[]}));
            const activeBuff = getActiveBuffRes?.rows?.[0];
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
             await processFinalPurchase(i, item, 1, item.price, 0, 'none', client, db, 'item');
             return;
        }
        
        await handlePurchaseWithCoupons(i, item, 1, item.price, client, db, 'item');

    } catch (error) { 
        console.error("Error in shop button:", error); 
        if (i.replied || i.deferred) await i.followUp({ content: '❌ حدث خطأ.', flags: MessageFlags.Ephemeral }); 
        else await i.reply({ content: '❌ حدث خطأ.', flags: MessageFlags.Ephemeral }); 
    }
}

async function _handleReplaceGuard(i, client, db) {
    try {
        await i.deferUpdate();
        const userId = i.user.id; 
        const guildId = i.guild.id; 
        const item = shopItems.find(it => it.id === 'personal_guard_1d');
        
        let userData = await client.getLevel(userId, guildId);
        if (!userData) userData = { mora: 0, bank: 0, hasGuard: 0 };
        
        if (Number(userData.hasGuard || 0) >= 6) {
            return await i.followUp({ content: `🚫 لديك بالفعل أقصى عدد من محاولات الحارس الشخصي.`, flags: MessageFlags.Ephemeral });
        }

        if (Number(userData.mora) < item.price) {
            const userBank = Number(userData.bank) || 0;
            let msg = `❌ رصيدك غير كافي! تحتاج إلى **${item.price.toLocaleString()}** ${EMOJI_MORA}`;
            if (userBank >= item.price) msg += `\n💡 لديك في البنك **${userBank.toLocaleString()}** مورا.`;
            return await i.followUp({ content: msg, flags: MessageFlags.Ephemeral });
        }
        
        userData.mora = Number(userData.mora) - item.price;
        userData.hasGuard = Math.min((Number(userData.hasGuard) || 0) + 3, 6);
        userData.guardExpires = 0;
        await client.setLevel(userData);
        
        const successEmbed = new EmbedBuilder()
            .setTitle('✅ تمت عملية التجديد بنجاح')
            .setColor(Colors.Green)
            .setDescription(`📦 **العنصر:** حارس شخصي\n💰 **التكلفة:** ${item.price.toLocaleString()} ${EMOJI_MORA}`)
            .setAuthor({ name: i.user.username, iconURL: i.user.displayAvatarURL() });

        await i.followUp({ embeds: [successEmbed], flags: MessageFlags.Ephemeral });
        if(sendShopLog) sendShopLog(client, guildId, i.member, "حارس شخصي (تجديد)", item.price, "شراء");
    } catch (error) { console.error(error); }
}

async function _handleReplaceBuffButton(i, client, db) {
    try {
        await i.deferUpdate();
        const userId = i.user.id; 
        const guildId = i.guild.id; 
        const newItemId = i.customId.replace('replace_buff_', '');
        const item = shopItems.find(it => it.id === newItemId);
        
        if (!item) return await i.followUp({ content: '❌ هذا العنصر غير موجود!', flags: MessageFlags.Ephemeral });
        
        let userData = await client.getLevel(userId, guildId);
        if (!userData) userData = { mora: 0, bank: 0 };
        
        if (Number(userData.mora) < item.price) {
            const userBank = Number(userData.bank) || 0;
            let msg = `❌ رصيدك غير كافي! تحتاج إلى **${item.price.toLocaleString()}** ${EMOJI_MORA}`;
            if (userBank >= item.price) msg += `\n💡 لديك في البنك **${userBank.toLocaleString()}** مورا.`;
            return await i.followUp({ content: msg, flags: MessageFlags.Ephemeral });
        }
        
        userData.mora = Number(userData.mora) - item.price;
        await client.setLevel(userData);
        
        await executeDB(db, `DELETE FROM user_buffs WHERE "userID" = $1 AND "guildID" = $2 AND "buffType" = 'xp'`, [userId, guildId]).catch(()=>{});
        
        let expiresAt, multiplier, buffPercent;
        switch (item.id) {
            case 'xp_buff_1d_3': multiplier = 0.45; buffPercent = 45; expiresAt = Date.now() + (24 * 60 * 60 * 1000); break;
            case 'xp_buff_1d_7': multiplier = 0.70; buffPercent = 70; expiresAt = Date.now() + (48 * 60 * 60 * 1000); break;
            case 'xp_buff_2d_10': multiplier = 0.90; buffPercent = 90; expiresAt = Date.now() + (72 * 60 * 60 * 1000); break;
        }
        
        if (multiplier > 0) {
            await executeDB(db, `INSERT INTO user_buffs ("userID", "guildID", "buffType", "multiplier", "expiresAt", "buffPercent") VALUES ($1, $2, $3, $4, $5, $6)`, [userId, guildId, 'xp', multiplier, expiresAt, buffPercent]).catch(()=>{});
        }
        
        const successEmbed = new EmbedBuilder()
            .setTitle('✅ تمت عملية الشراء بنجاح')
            .setColor(Colors.Green)
            .setDescription(`📦 **العنصر:** ${item.name} (استبدال)\n💰 **التكلفة:** ${item.price.toLocaleString()} ${EMOJI_MORA}`)
            .setAuthor({ name: i.user.username, iconURL: i.user.displayAvatarURL() });

        await i.followUp({ embeds: [successEmbed], flags: MessageFlags.Ephemeral });
        if(sendShopLog) sendShopLog(client, guildId, i.member, item.name, item.price, "استبدال/شراء");
        
    } catch (error) { console.error(error); }
}

async function _handlePotionSelect(i, client, db) {
    if(i.replied || i.deferred) await i.followUp({ content: "جاري التحميل...", flags: MessageFlags.Ephemeral });
    else await i.deferReply({ flags: MessageFlags.Ephemeral });
      
    if (finalPotionItems.length === 0) return i.editReply({ content: "❌ لا توجد جرعات متاحة حالياً." });

    const potionOptions = finalPotionItems.slice(0, 25).map(p => {
        return { label: p.name, description: `${p.price.toLocaleString()} مورا | ${p.description.substring(0, 50)}`, value: `buy_item_${p.id}`, emoji: p.emoji };
    });

    const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('shop_buy_potion_menu').setPlaceholder('اختر الجرعة لشرائها...').addOptions(potionOptions));
    const embed = new EmbedBuilder().setTitle('🧪 متجر الجرعات السحرية').setDescription('اختر الجرعة التي تريد شراءها من القائمة بالأسفل.').setColor(Colors.Purple).setImage(BANNER_URL);

    await i.editReply({ embeds: [embed], components: [row] });
}

async function _handleFishingMenu(i, client, db) {
    await i.deferReply({ flags: MessageFlags.Ephemeral }); 
    const embed = new EmbedBuilder().setTitle('🎣 عـدة الـصـيـد').setDescription('اختر القسم الذي تريد تصفحه:').setColor(Colors.Aqua).setImage(BANNER_URL);
    const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('fishing_gear_sub_menu').setPlaceholder('اختر الفئة...').addOptions(
        { label: 'السنارات', value: 'gear_rods', emoji: '🎣' }, { label: 'القوارب', value: 'gear_boats', emoji: '🚤' }, { label: 'الطعوم', value: 'gear_baits', emoji: '🪱' }
    ));
    await i.editReply({ embeds: [embed], components: [row] });
}

async function _handleRodSelect(i, client, db) {
    if(i.replied || i.deferred) await i.editReply("جاري التحميل..."); else await i.deferReply({ flags: MessageFlags.Ephemeral });
    let userDataRes = await executeDB(db, `SELECT "rodLevel" FROM levels WHERE "user" = $1 AND "guild" = $2`, [i.user.id, i.guild.id]).catch(()=>({rows:[]}));
    let userData = userDataRes?.rows?.[0];
    const currentLevel = userData ? (Number(userData.rodLevel) || 1) : 1;
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
    if(i.replied || i.deferred) await i.editReply("جاري التحميل..."); else await i.deferReply({ flags: MessageFlags.Ephemeral });
    let userDataRes = await executeDB(db, `SELECT "boatLevel" FROM levels WHERE "user" = $1 AND "guild" = $2`, [i.user.id, i.guild.id]).catch(()=>({rows:[]}));
    let userData = userDataRes?.rows?.[0];
    const currentLevel = userData ? (Number(userData.boatLevel) || 1) : 1;
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
    if(i.replied || i.deferred) await i.editReply({ content: "جاري التحميل..." }); 
    else await i.deferReply({ flags: MessageFlags.Ephemeral });
    
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

async function _handleBaitBuy(i, client, db, baitId) {
    if(!i.deferred && !i.replied) await i.deferReply({ flags: MessageFlags.Ephemeral });
    const bait = finalBaits.find(b => b.id === baitId);
    if (!bait) return i.editReply({ content: '❌ هذا العنصر غير موجود!' });
    
    const qty = 5; 
    const unitPrice = Math.round(bait.price / 5);
    const cost = unitPrice * qty; 
    
    let userData = await client.getLevel(i.user.id, i.guild.id);
    if (!userData) return i.editReply('❌ لا توجد لك بيانات في النظام.');

    if (Number(userData.mora) < cost) {
        const userBank = Number(userData.bank) || 0;
        let msg = `❌ رصيدك غير كافي لشراء هذه الحزمة! تحتاج إلى **${cost.toLocaleString()}** ${EMOJI_MORA}`;
        if (userBank >= cost) msg += `\n💡 لديك في البنك **${userBank.toLocaleString()}** مورا، اسحب منها.`;
        return i.editReply(msg);
    }
    
    userData.mora = Number(userData.mora) - cost;
    await client.setLevel(userData);
    
    try { 
        let invCheckRes = await executeDB(db, `SELECT "id", "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [i.user.id, i.guild.id, baitId]).catch(()=>({rows:[]}));
        if (invCheckRes?.rows?.[0]) {
            const invId = invCheckRes.rows[0].id;
            let newQty = Math.min(Number(invCheckRes.rows[0].quantity || 0) + qty, MAX_FARM_LIMIT);
            await executeDB(db, `UPDATE user_inventory SET "quantity" = $1 WHERE "id" = $2`, [newQty, invId]);
        } else {
            await executeDB(db, `INSERT INTO user_inventory ("guildID", "userID", "itemID", "quantity") VALUES ($1, $2, $3, $4)`, [i.guild.id, i.user.id, baitId, qty]);
        }
    } catch(e) { 
        userData.mora = Number(userData.mora) + cost;
        await client.setLevel(userData);
        return i.editReply('❌ حدث خطأ أثناء إضافة العنصر لمخزنك. تم استرجاع أموالك.');
    }
    
    const successEmbed = new EmbedBuilder()
        .setTitle('✅ تمت عملية الشراء بنجاح')
        .setColor(Colors.Green)
        .setDescription(`📦 **العنصر:** حزمة (${qty} حبات) من ${bait.name}\n💰 **التكلفة:** ${cost.toLocaleString()} ${EMOJI_MORA}`)
        .setAuthor({ name: i.user.username, iconURL: i.user.displayAvatarURL() });

    await i.editReply({ content: null, embeds: [successEmbed] });
    if(sendShopLog) sendShopLog(client, i.guild.id, i.member, `حزمة طعم: ${bait.name} (x${qty})`, cost, "شراء");
}

async function handleShopModal(i, client, db) {
    if (i.customId === 'exchange_xp_modal') {
        try {
            await i.deferReply({ flags: MessageFlags.Ephemeral });
            const userId = i.user.id; 
            const guildId = i.guild.id;
            
            let userLoanRes = await executeDB(db, `SELECT 1 FROM user_loans WHERE "userID" = $1 AND "guildID" = $2 AND "remainingAmount" > 0`, [userId, guildId]).catch(()=>({rows:[]}));
            if (userLoanRes?.rows?.length > 0) return await i.editReply({ content: `❌ لا يمكنك تبادل الخبرة بينما عليك قرض في البنك.` });
            
            let userData = await client.getLevel(userId, guildId);
            if (!userData) return await i.editReply({ content: `❌ لا توجد لك بيانات في النظام.` });
            
            const userMora = Number(userData.mora) || 0;
            const amountString = i.fields.getTextInputValue('xp_amount_input').trim().toLowerCase();
            let amountToBuy = 0;
            
            if (amountString === 'all') amountToBuy = Math.floor(userMora / CUSTOM_XP_RATE);
            else amountToBuy = parseInt(amountString.replace(/,/g, ''));
            
            if (isNaN(amountToBuy) || amountToBuy <= 0) return await i.editReply({ content: '❌ يرجى إدخال رقم صحيح أو كتابة All.' });
            
            const totalCost = amountToBuy * CUSTOM_XP_RATE;
            
            if (userMora < totalCost) {
                const userBank = Number(userData.bank) || 0;
                let msg = `❌ رصيدك غير كافي. تحتاج إلى **${totalCost.toLocaleString()}** مورا.`;
                if (userBank >= totalCost) msg += `\n💡 لديك في البنك **${userBank.toLocaleString()}** مورا، قم بسحبها أولاً.`;
                return await i.editReply({ content: msg });
            }
            
            // خصم المورا وحفظها فوراً قبل إضافة הـ XP
            userData.mora = userMora - totalCost;
            await client.setLevel(userData);
            
            if (addXPAndCheckLevel) {
                await addXPAndCheckLevel(client, i.member, db, amountToBuy, 0, false).catch(()=>{});
            } else {
                userData.xp = (Number(userData.xp) || 0) + amountToBuy;
                userData.totalXP = (Number(userData.totalXP) || 0) + amountToBuy;
                await client.setLevel(userData);
            }

            const successEmbed = new EmbedBuilder()
                .setTitle('✅ تمت عملية التبادل بنجاح')
                .setColor(Colors.Green)
                .setDescription(`📦 **العنصر:** ${amountToBuy.toLocaleString()} إكس بي (XP)\n💰 **التكلفة:** ${totalCost.toLocaleString()} ${EMOJI_MORA}\n*(التحويل: 1 إكس بي = ${CUSTOM_XP_RATE} مورا)*`)
                .setAuthor({ name: i.user.username, iconURL: i.user.displayAvatarURL() });

            await i.editReply({ content: null, embeds: [successEmbed] });
            if(sendShopLog) sendShopLog(client, guildId, i.member, `شراء ${amountToBuy} XP`, totalCost, "تبادل خبرة");
        } catch (e) { console.error(e); }
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
    else if (i.customId === 'cancel_purchase') { await i.deferUpdate(); await i.editReply({ content: 'تم الإلغاء.', components: [], embeds: [] }); }
    else if (i.customId === 'replace_guard') await _handleReplaceGuard(i, client, db);
}

module.exports = {
    handleShopModal,
    handleShopInteractions
};
