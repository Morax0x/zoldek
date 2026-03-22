const { Events, ChannelType, PermissionsBitField, EmbedBuilder, Colors, Collection, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../config.json');
const { handleStreakMessage, handleMediaStreakMessage, calculateBuffMultiplier } = require("../streak-handler.js");
const { checkPermissions, checkCooldown } = require("../permission-handler.js");
const { processReportLogic, sendReportError } = require("../handlers/report-handler.js");
const { askMorax } = require('../handlers/ai-handler');
const aiConfig = require('../utils/aiConfig'); 
const aiLimitHandler = require('../utils/aiLimitHandler');

// 🔥 تصحيح مسار استدعاء الملوك إلى الملف الجديد 🔥
const { updateGuildStat } = require('../handlers/kings-stats-handler.js');

let addXPAndCheckLevel;
try {
    ({ addXPAndCheckLevel } = require('../handlers/handler-utils.js'));
} catch (e) {}

let handleNewSuggestion;
try { ({ handleNewSuggestion } = require('../handlers/suggestion-handler.js')); } catch (e) { }

const DISBOARD_BOT_ID = '302050872383242240'; 
const autoResponderCooldowns = new Collection();
const treeCooldowns = new Set();
const paymentCooldowns = new Set();

const ghostModeUsers = new Set();
const chatterBadgeCache = new Set();

const settingsCache = new Map();
let lastSettingsUpdate = 0;

if (!global.afkMessagesCache) global.afkMessagesCache = new Collection();

function getTodayDateString() { 
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date());
}

function getWeekStartDateString() {
    const ksaTime = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Riyadh" }));
    const diff = ksaTime.getDate() - (ksaTime.getDay() + 2) % 7; 
    const friday = new Date(ksaTime.setDate(diff));
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(friday);
}

async function safeReply(message, options) {
    try {
        return await message.reply(options);
    } catch (error) {
        if (error.code === 10008 || error.code === 50035) {
            const { allowedMentions, ...newOptions } = options;
            return await message.channel.send(newOptions).catch(() => null);
        }
        throw error;
    }
}

async function getSettings(db, guildId) {
    const now = Date.now();
    if (settingsCache.has(guildId) && now - lastSettingsUpdate < 300000) {
        return settingsCache.get(guildId);
    }
    try {
        let res;
        try { res = await db.query(`SELECT * FROM settings WHERE "guild" = $1`, [guildId]); }
        catch(e) { res = await db.query(`SELECT * FROM settings WHERE guild = $1`, [guildId]).catch(()=>({rows:[]})); }
        
        const data = res.rows[0];
        if (data) {
            settingsCache.set(guildId, data);
            lastSettingsUpdate = now;
        }
        return data;
    } catch (e) { return null; }
}

async function recordBump(client, guildID, userID) {
    const db = client.sql;
    if (!db) return;
      
    const dateStr = getTodayDateString();
    const weekStr = getWeekStartDateString();
    const dailyID = `${userID}-${guildID}-${dateStr}`;
    const weeklyID = `${userID}-${guildID}-${weekStr}`;
    const totalID = `${userID}-${guildID}`;
    
    try {
        await db.query(`INSERT INTO user_daily_stats ("id", "userID", "guildID", "date", "disboard_bumps", "boost_channel_reactions") VALUES ($1,$2,$3,$4,1,0) ON CONFLICT("id") DO UPDATE SET "disboard_bumps" = COALESCE(user_daily_stats."disboard_bumps", 0) + 1`, [dailyID, userID, guildID, dateStr]).catch(()=>{});
        await db.query(`INSERT INTO user_weekly_stats ("id", "userID", "guildID", "weekStartDate", "disboard_bumps") VALUES ($1,$2,$3,$4,1) ON CONFLICT("id") DO UPDATE SET "disboard_bumps" = COALESCE(user_weekly_stats."disboard_bumps", 0) + 1`, [weeklyID, userID, guildID, weekStr]).catch(()=>{});
        await db.query(`INSERT INTO user_total_stats ("id", "userID", "guildID", "total_disboard_bumps") VALUES ($1,$2,$3,1) ON CONFLICT("id") DO UPDATE SET "total_disboard_bumps" = COALESCE(user_total_stats."total_disboard_bumps", 0) + 1`, [totalID, userID, guildID]).catch(()=>{});
        
        const member = await client.guilds.cache.get(guildID)?.members.fetch(userID).catch(() => null);
        if (member && client.checkQuests) {
            const updatedDailyRes = await db.query(`SELECT * FROM user_daily_stats WHERE "id" = $1`, [dailyID]);
            const updatedTotalRes = await db.query(`SELECT * FROM user_total_stats WHERE "id" = $1`, [totalID]);
            if (updatedDailyRes.rows[0]) client.checkQuests(client, member, updatedDailyRes.rows[0], 'daily', dateStr).catch(()=>{});
            if (updatedTotalRes.rows[0]) client.checkAchievements(client, member, null, updatedTotalRes.rows[0]).catch(()=>{});
        }
    } catch (e) {}
}

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        const client = message.client;
        const db = client.sql;
        if (!db || !message.guild) return; 

        if (!client.talkedRecently) client.talkedRecently = new Collection(); 

        if (message.author.bot && message.author.id !== DISBOARD_BOT_ID) return;

        const settings = await getSettings(db, message.guild.id);
        let Prefix = settings?.prefix || "-";

        if (!message.author.bot && settings && (settings.suggestionChannelID || settings.suggestionchannelid) && message.channel.id === (settings.suggestionChannelID || settings.suggestionchannelid)) {
            if (handleNewSuggestion) {
                await handleNewSuggestion(message, client, db);
            }
            return; 
        }

        try {
            if (message.member) {
                let conflictRulesRes;
                try { conflictRulesRes = await db.query(`SELECT "role_id", "anti_roles" FROM role_settings WHERE "anti_roles" IS NOT NULL AND "anti_roles" != ''`); }
                catch(e) { conflictRulesRes = await db.query(`SELECT role_id, anti_roles FROM role_settings WHERE anti_roles IS NOT NULL AND anti_roles != ''`).catch(()=>({rows:[]})); }
                
                const conflictRules = conflictRulesRes.rows;
                if (conflictRules && conflictRules.length > 0) {
                    const memberRoleIds = message.member.roles.cache.map(r => r.id);
                    for (const rule of conflictRules) {
                        if (memberRoleIds.includes(rule.role_id)) {
                            const prohibitedRoles = rule.anti_roles.split(',');
                            const hasForbidden = prohibitedRoles.filter(id => memberRoleIds.includes(id));
                            if (hasForbidden.length > 0) {
                                message.member.roles.remove(hasForbidden).catch(() => {});
                            }
                        }
                    }
                }
            }
        } catch (error) {}

        try {
            let afkDataRes;
            try { afkDataRes = await db.query(`SELECT * FROM afk WHERE "userID" = $1 AND "guildID" = $2`, [message.author.id, message.guild.id]); }
            catch(e) { afkDataRes = await db.query(`SELECT * FROM afk WHERE userid = $1 AND guildid = $2`, [message.author.id, message.guild.id]).catch(()=>({rows:[]})); }
            
            const afkData = afkDataRes.rows ? afkDataRes.rows[0] : null;

            if (afkData) {
                const content = message.content.trim();
                const ghostKey = `${message.author.id}-${message.guild.id}`;
                const isGhostMessage = content.startsWith('(') && content.endsWith(')');
                
                const allowGhost = isGhostMessage && !ghostModeUsers.has(ghostKey);

                if (!allowGhost) {
                    const now = Math.floor(Date.now() / 1000);
                    const diffSeconds = now - Number(afkData.timestamp);
                    const minutes = Math.floor(diffSeconds / 60); 
                    const cappedMinutes = Math.min(minutes, 720); 
                    const reward = (minutes >= 60) ? (cappedMinutes * 1) : 0;

                    if (reward > 0) {
                        try { await db.query(`UPDATE levels SET "mora" = "mora" + $1 WHERE "user" = $2 AND "guild" = $3`, [reward, message.author.id, message.guild.id]); }
                        catch(e) { await db.query(`UPDATE levels SET mora = mora + $1 WHERE userid = $2 AND guildid = $3`, [reward, message.author.id, message.guild.id]).catch(()=>{}); }
                    }

                    let storedMessages = [];
                    try {
                        storedMessages = JSON.parse(afkData.messages || '[]');
                    } catch (e) {
                        storedMessages = [];
                    }

                    let msgBtnRow = null;
                    if (storedMessages.length > 0) {
                        global.afkMessagesCache.set(message.author.id, storedMessages);
                        setTimeout(() => global.afkMessagesCache.delete(message.author.id), 5 * 60 * 1000);

                        msgBtnRow = new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId('show_afk_msgs')
                                .setLabel(`عرض الرسائل (${storedMessages.length})`)
                                .setEmoji('📩')
                                .setStyle(ButtonStyle.Primary)
                        );
                    }

                    try { await db.query(`DELETE FROM afk WHERE "userID" = $1 AND "guildID" = $2`, [message.author.id, message.guild.id]); }
                    catch(e) { await db.query(`DELETE FROM afk WHERE userid = $1 AND guildid = $2`, [message.author.id, message.guild.id]).catch(()=>{}); }
                    
                    ghostModeUsers.delete(ghostKey);

                    try {
                        const currentName = message.member?.displayName;
                        if (currentName && currentName.includes("[AFK] ")) {
                            message.member.setNickname(currentName.replace("[AFK] ", "")).catch(()=>{});
                        }
                    } catch (e) {}

                    const timeAgo = `<t:${afkData.timestamp}:R>`;
                    let replyContent = `👋 **✶أهلاً بعودتك يا ${message.author}!**\n⏱️ **✶مدة الغياب:** ${timeAgo}\n🔔 **✶تم منشنتك:** ${afkData.mentionsCount || afkData.mentionscount} مرة أثناء غيابك`;
                    
                    if (reward > 0) {
                        replyContent += `\n💰 **✶مكافأة الراحة:** حصلت على **${reward}** <:mora:1435647151349698621> لأنك كنت غائباً ${timeAgo}`;
                    }

                    const welcomeMsg = await safeReply(message, { 
                        content: replyContent,
                        components: msgBtnRow ? [msgBtnRow] : [] 
                    });
                    
                    if (welcomeMsg) {
                        const deleteTime = msgBtnRow ? 120000 : 60000;
                        setTimeout(() => welcomeMsg.delete().catch(() => {}), deleteTime);
                    }

                    let subscribers = [];
                    try { subscribers = JSON.parse(afkData.subscribers || '[]'); } catch(e) {}
                    
                    if (subscribers.length > 0) {
                        const everyoneRole = message.guild.roles.everyone;
                        const perms = message.channel.permissionsFor(everyoneRole);
                        if (perms && perms.has(PermissionsBitField.Flags.ViewChannel)) {
                            const pings = subscribers.map(id => `<@${id}>`).join(' ');
                            message.channel.send(`🔔 **✶ تنبيـه:** ${message.author} عاد من وضع  الغيـاب المؤقـت!\n${pings}`).catch(()=>{});
                        } 
                    }
                } else {
                    ghostModeUsers.add(ghostKey);
                    setTimeout(() => {
                        ghostModeUsers.delete(ghostKey);
                    }, 2 * 60 * 60 * 1000); 
                } 
            }

            if (message.mentions.members.size > 0) {
                const mentionedIds = new Set(message.mentions.members.map(m => m.id));

                mentionedIds.forEach(async targetID => {
                    if (targetID === message.author.id) return;

                    let targetAfkDataRes;
                    try { targetAfkDataRes = await db.query(`SELECT * FROM afk WHERE "userID" = $1 AND "guildID" = $2`, [targetID, message.guild.id]); }
                    catch(e) { targetAfkDataRes = await db.query(`SELECT * FROM afk WHERE userid = $1 AND guildid = $2`, [targetID, message.guild.id]).catch(()=>({rows:[]})); }
                    
                    const targetAfkData = targetAfkDataRes.rows ? targetAfkDataRes.rows[0] : null;

                    if (targetAfkData) {
                        try { await db.query(`UPDATE afk SET "mentionsCount" = "mentionsCount" + 1 WHERE "userID" = $1 AND "guildID" = $2`, [targetID, message.guild.id]); }
                        catch(e) { await db.query(`UPDATE afk SET mentionscount = mentionscount + 1 WHERE userid = $1 AND guildid = $2`, [targetID, message.guild.id]).catch(()=>{}); }

                        const member = message.guild.members.cache.get(targetID);
                        const timeAgo = `<t:${targetAfkData.timestamp}:R>`;

                        const embed = new EmbedBuilder()
                            .setColor("Random")
                            .setThumbnail(member ? member.user.displayAvatarURL() : null)
                            .setDescription(
                                `😴 **${member ? member.displayName : 'العضو'}**\n ✶ في وضع الغيـاب المؤقـت(AFK)\n📝 **السبب:** ${targetAfkData.reason}\n⏳ **منـذ:** ${timeAgo}`
                            );

                        const row = new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId(`notify_afk_${targetID}`)
                                .setLabel('نبهني عند عودتـه 🔔')
                                .setStyle(ButtonStyle.Secondary),
                            new ButtonBuilder()
                                .setCustomId(`leave_msg_afk_${targetID}`)
                                .setLabel('اترك رسالـة 📩')
                                .setStyle(ButtonStyle.Primary)
                        );

                        const replyMsg = await safeReply(message, {
                            embeds: [embed],
                            components: [row],
                            allowedMentions: { repliedUser: true }
                        });

                        if (replyMsg) setTimeout(() => replyMsg.delete().catch(() => {}), 60000);
                    }
                });
            }
        } catch (err) {}

        if (message.author.id === DISBOARD_BOT_ID) {
            if (settings && (settings.bumpChannelID || settings.bumpchannelid) && message.channel.id !== (settings.bumpChannelID || settings.bumpchannelid)) return;

            let bumperID = null;
            if (message.interaction && message.interaction.commandName === 'bump') bumperID = message.interaction.user.id;
            else if (message.embeds.length > 0) {
                const desc = message.embeds[0].description || "";
                if (desc.includes('Bump done') || desc.includes('Bump successful') || desc.includes('بومب')) {
                    const match = desc.match(/<@!?(\d+)>/); 
                    if (match && match[1]) bumperID = match[1];
                }
            }

            if (bumperID) {
                recordBump(client, message.guild.id, bumperID); 
                message.react('👊').catch(() => {});
                const nextBumpTime = Date.now() + 7200000;
                const nextBumpTimeSec = Math.floor(nextBumpTime / 1000);
                message.channel.send({
                    content: `بُورك النشــر، وسُمــع الــنداء \nعــدّاد المــجد بدأ مــن جــديــد <:2cenema:1428340793676009502>\n\n- النشر التالي بعد: <t:${nextBumpTimeSec}:R>`,
                    files: ["https://i.postimg.cc/1XTvpgMV/image.gif"]
                }).catch(() => {});
                message.channel.setName('˖✶⁺〢🍀・الـنـشـر').catch(err => {});
            }
            return;
        }

        const mentionRegex = new RegExp(`^<@!?${client.user.id}>( |)$`);
        if (mentionRegex.test(message.content)) {
            return message.reply("نـعـم .. ؟").catch(() => {});
        }

        // 🔥 احتكار الذكاء الاصطناعي لك فقط أو للقنوات المسموحة 🔥
        if (message.mentions.has(client.user) && !message.author.bot && !message.content.startsWith(Prefix)) {
            
            if (message.reference) {
                if (message.client.ignoredTreeMessages && message.client.ignoredTreeMessages.has(message.reference.messageId)) {
                    return; 
                }
            }

            const argsRaw = message.content.trim().split(/ +/);
            const firstWord = argsRaw[0].toLowerCase();
            const isCommand = client.commands.find(cmd => (cmd.name && cmd.name === firstWord) || (cmd.aliases && cmd.aliases.includes(firstWord)));
            let isShortcut = false;
            
            try {
                let scRes;
                try { scRes = await db.query(`SELECT 1 FROM command_shortcuts WHERE "guildID" = $1 AND "channelID" = $2 AND "shortcutWord" = $3`, [message.guild.id, message.channel.id, firstWord]); }
                catch(e) { scRes = await db.query(`SELECT 1 FROM command_shortcuts WHERE guildid = $1 AND channelid = $2 AND shortcutword = $3`, [message.guild.id, message.channel.id, firstWord]).catch(()=>({rows:[]})); }
                
                if(scRes && scRes.rows.length > 0) isShortcut = true;
            } catch(e) {}

            if (!isCommand && !isShortcut) {
                if (message.reference) {
                    try {
                        const repliedMsg = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
                        if (repliedMsg && repliedMsg.author.id === client.user.id) {
                            if (repliedMsg.embeds.length > 0 || repliedMsg.interaction) return;
                        }
                    } catch (e) {}
                }

                if (message.content.includes("@everyone") || message.content.includes("@here")) return;

                let aiChannelData = aiConfig.getChannelSettings(message.channel.id);
                const OWNER_ID = "1145327691772481577"; 
                const isOwnerMentioning = message.author.id === OWNER_ID;

                // 👑 قاعدة الإمبراطور للذكاء الاصطناعي:
                if (!aiChannelData) {
                    if (message.channel.parentId && aiConfig.isRestrictedCategory(message.channel.parentId)) {
                        const paidStatus = aiConfig.getPaidChannelStatus(message.channel.id);
                        if (paidStatus) {
                            aiChannelData = { nsfw: paidStatus.mode === 'NSFW' ? 1 : 0 };
                        } else {
                            if (isOwnerMentioning) {
                                aiChannelData = { nsfw: 0 };
                            } else {
                                if (paymentCooldowns.has(message.channel.id)) return; 
                                paymentCooldowns.add(message.channel.id);
                                setTimeout(() => paymentCooldowns.delete(message.channel.id), 60000); 
                                const payBtn = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ai_pay_category_1000').setLabel('فتح الشات (1000 مورا)').setEmoji('🔓').setStyle(ButtonStyle.Primary));
                                return message.reply({ content: `🚫 **هذه الدردشة خارج نطاق صلاحياتي..**\nلفتح ميزة الدردشة معي هنا لمدة **يوم كامل (24 ساعة)**، عليك دفع **1000 مـورا**.`, components: [payBtn] }).catch(()=>{});
                            }
                        }
                    } else {
                        // قناة عادية جداً ليست مخصصة للذكاء
                        if (!isOwnerMentioning) return; // يتم تجاهل العضو العادي بصمت
                        aiChannelData = { nsfw: 0 }; // السماح للإمبراطور
                    }
                }

                let canChat = true;
                let isTrackedUser = !isOwnerMentioning;

                if (isTrackedUser) {
                    const usageStatus = await aiLimitHandler.checkUserUsage(message.member);
                    if (usageStatus && usageStatus.canChat === false) {
                        const daily = usageStatus.dailyUsage || 0;
                        const limit = usageStatus.roleLimit || 0;
                        const bal = usageStatus.purchasedBalance || 0;
                        if (limit === 0 && bal === 0 && daily < 10) {
                            canChat = true;
                        } else {
                            canChat = false;
                        }
                    }
                }

                if (!canChat) {
                    if (paymentCooldowns.has(message.author.id)) return; 
                    paymentCooldowns.add(message.author.id);
                    setTimeout(() => paymentCooldowns.delete(message.author.id), 5 * 60 * 1000);
                    const payButton = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ai_topup_2500').setLabel('ادفـع 2500 مورا').setEmoji(client.EMOJI_MORA || '💰').setStyle(ButtonStyle.Success));
                    return message.reply({ content: `✶ نـفـد وقـتي معـك ... \n✶ ان اردت استكمال محادثتنا ارفع مستواك او ادفـع مـورا لتجديد رصيـد محادثتنـا`, components: [payButton] }).catch(()=>{});
                }

                if (paymentCooldowns.has(message.author.id)) paymentCooldowns.delete(message.author.id);

                const isNsfw = aiChannelData ? Boolean(aiChannelData.nsfw) : false; 

                try {
                    await message.channel.sendTyping();
                    const cleanContent = message.content.replace(/<@!?[0-9]+>/g, "").trim();
                    
                    let imageAttachment = null;
                    
                    if (message.attachments.size > 0) {
                        const attachment = message.attachments.first();
                        if (attachment.contentType && attachment.contentType.startsWith('image/')) {
                            imageAttachment = { url: attachment.url, mimeType: attachment.contentType };
                        }
                    } 
                    else if (message.stickers.size > 0) {
                        const sticker = message.stickers.first();
                        if (sticker.format === 1 || sticker.format === 2) { 
                             imageAttachment = { url: sticker.url, mimeType: 'image/png' };
                        }
                    }

                    if (!cleanContent && !imageAttachment) {
                        if (isTrackedUser) aiLimitHandler.releasePendingUsage(message.author.id);
                        return message.reply("نـعـم .. ؟");
                    }

                    const reply = await askMorax(
                        message.author.id, 
                        message.guild.id, 
                        message.channel.id, 
                        cleanContent, 
                        message.member?.displayName || message.author.username,
                        imageAttachment, 
                        isNsfw,
                        message 
                    );
                    
                    if (!reply) {
                        if (isTrackedUser) aiLimitHandler.releasePendingUsage(message.author.id);
                        return;
                    }

                    if (isTrackedUser) {
                        await aiLimitHandler.incrementUsage(message.author.id, db);
                    }

                    const safeReplyMsg = reply.replace(/@everyone/g, '@\u200beveryone').replace(/@here/g, '@\u200bhere');
                    const replyOptions = { repliedUser: true, parse: ['users'] };

                    if (safeReplyMsg.length > 2000) {
                        const chunks = safeReplyMsg.match(/[\s\S]{1,1950}/g) || [];
                        for (const chunk of chunks) {
                            await safeReply(message, { content: chunk, allowedMentions: replyOptions });
                        }
                    } else {
                        await safeReply(message, { content: safeReplyMsg, allowedMentions: replyOptions });
                    }

                } catch (err) {
                    if (isTrackedUser) aiLimitHandler.releasePendingUsage(message.author.id);
                }
                return; 
            }
        }

        if (message.author.bot && settings && (settings.treeChannelID || settings.treechannelid) && message.channel.id === (settings.treeChannelID || settings.treechannelid)) {
             const fullContent = (message.content || "") + " " + (message.embeds[0]?.description || "") + " " + (message.embeds[0]?.title || "");
             const lowerContent = fullContent.toLowerCase();
             const validPhrases = ["watered the tree", "سقى الشجرة", "has watered", "قام بسقاية"];
             if (validPhrases.some(p => lowerContent.includes(p))) {
                 const match = fullContent.match(/<@!?(\d+)>/);
                 if (match && match[1]) {
                     const userID = match[1];
                     if (userID !== client.user.id && !treeCooldowns.has(userID)) {
                         treeCooldowns.add(userID);
                         setTimeout(() => treeCooldowns.delete(userID), 60000);
                         if (client.incrementQuestStats) {
                             client.incrementQuestStats(userID, message.guild.id, 'water_tree', 1).catch(()=>{});
                             message.react('💧').catch(() => {});
                         }
                     }
                 }
             }
        }

        if (message.author.bot) return;

        if (db) {
            try {
                let isChannelIgnoredRes;
                try { isChannelIgnoredRes = await db.query(`SELECT * FROM xp_ignore WHERE "guildID" = $1 AND "id" = $2`, [message.guild.id, message.channel.id]); }
                catch(e) { isChannelIgnoredRes = await db.query(`SELECT * FROM xp_ignore WHERE guildid = $1 AND id = $2`, [message.guild.id, message.channel.id]).catch(()=>({rows:[]})); }
                
                if (isChannelIgnoredRes.rows && isChannelIgnoredRes.rows.length > 0) return; 
            } catch (e) {}
        }

        try {
            const userID = message.author.id;
            const guildID = message.guild.id;

            updateGuildStat(client, guildID, userID, 'messages', 1).catch(e => {});

            if (settings && (settings.chatterChannelID || settings.chatterchannelid) && message.channel.id === (settings.chatterChannelID || settings.chatterchannelid)) {
                const todayDate = getTodayDateString();
                const dailyIdForBadge = `${userID}-${guildID}-${todayDate}`;
                
                try {
                    await db.query(`
                        INSERT INTO user_daily_stats ("id", "userID", "guildID", "date", "main_chat_messages") 
                        VALUES ($1, $2, $3, $4, 1) 
                        ON CONFLICT("id") DO UPDATE SET "main_chat_messages" = COALESCE(user_daily_stats."main_chat_messages", 0) + 1
                    `, [dailyIdForBadge, userID, guildID, todayDate]);
                } catch(e) {
                    await db.query(`
                        INSERT INTO user_daily_stats (id, userid, guildid, date, main_chat_messages) 
                        VALUES ($1, $2, $3, $4, 1) 
                        ON CONFLICT(id) DO UPDATE SET main_chat_messages = COALESCE(user_daily_stats.main_chat_messages, 0) + 1
                    `, [dailyIdForBadge, userID, guildID, todayDate]).catch(()=>{});
                }

                if (!chatterBadgeCache.has(dailyIdForBadge)) {
                    chatterBadgeCache.add(dailyIdForBadge); 
                    
                    let dailyDataCheckRes;
                    try { dailyDataCheckRes = await db.query(`SELECT "main_chat_messages", "chatter_badge_given" FROM user_daily_stats WHERE "id" = $1`, [dailyIdForBadge]); }
                    catch(e) { dailyDataCheckRes = await db.query(`SELECT main_chat_messages, chatter_badge_given FROM user_daily_stats WHERE id = $1`, [dailyIdForBadge]).catch(()=>({rows:[]})); }
                    
                    const dailyDataCheck = dailyDataCheckRes.rows ? dailyDataCheckRes.rows[0] : null;
                    
                    if (dailyDataCheck && Number(dailyDataCheck.main_chat_messages) >= 100 && Number(dailyDataCheck.chatter_badge_given || 0) === 0) {
                        try { await db.query(`ALTER TABLE user_daily_stats ADD COLUMN IF NOT EXISTS "chatter_badge_given" INTEGER DEFAULT 0`); } catch(e){}

                        try { await db.query(`UPDATE user_daily_stats SET "chatter_badge_given" = 1 WHERE "id" = $1`, [dailyIdForBadge]); }
                        catch(e) { await db.query(`UPDATE user_daily_stats SET chatter_badge_given = 1 WHERE id = $1`, [dailyIdForBadge]).catch(()=>{}); }
                        
                        let roleToGive = settings.roleChatterBadge || settings.rolechatterbadge || settings.roleChatter || settings.rolechatter;
                        if (roleToGive && message.member) message.member.roles.add(roleToGive).catch(()=>{});

                        if (settings.questChannelID || settings.questchannelid) {
                            const announceChannel = message.guild.channels.cache.get(settings.questChannelID || settings.questchannelid);
                            if (announceChannel) {
                                const badgeEmbed = new EmbedBuilder()
                                    .setTitle('🗣️ انـجـاز يـومـي: ثـرثـار الـحـانـة!')
                                    .setDescription(`🎉 <@${userID}> \n\nلقد أرسل **100 رسالة** في الشات الرئيسي اليوم واستحق وسام الشرف بجدارة!`)
                                    .setColor('#F1C40F')
                                    .setThumbnail(message.author.displayAvatarURL());
                                announceChannel.send({ content: `<@${userID}>`, embeds: [badgeEmbed] }).catch(()=>{});
                            }
                        } else {
                            message.channel.send(`🗣️ **وســام جديــد!**\n<@${userID}> أرسل 100 رسالة وحصل على وسام **🗣️ ثرثار الحانة**!`).catch(()=>{});
                        }
                    } else {
                        chatterBadgeCache.delete(dailyIdForBadge);
                    }
                }
            }

            if (client.incrementQuestStats) {
                client.incrementQuestStats(userID, guildID, 'messages', 1).catch(()=>{});
                if (message.attachments.size > 0) client.incrementQuestStats(userID, guildID, 'images', 1).catch(()=>{});
                if (message.stickers.size > 0) client.incrementQuestStats(userID, guildID, 'stickers', message.stickers.size).catch(()=>{});
                const emojiRegex = /<a?:\w+:\d+>|[\u{1F300}-\u{1F9FF}]/gu;
                const emojis = message.content.match(emojiRegex);
                if (emojis) client.incrementQuestStats(userID, guildID, 'emojis_sent', emojis.length).catch(()=>{});
            }
            if (message.mentions.users.size > 0) {
                message.mentions.users.forEach(async (user) => {
                    if (user.id !== message.author.id && !user.bot) {
                        if (client.incrementQuestStats) client.incrementQuestStats(user.id, guildID, 'mentions_received', 1).catch(()=>{});
                    }
                });
            }
            if (message.reference && message.reference.messageId) {
                try {
                    const repliedMsg = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
                    if (repliedMsg && repliedMsg.author.id !== message.author.id) {
                        if (client.incrementQuestStats) client.incrementQuestStats(userID, guildID, 'replies_sent', 1).catch(()=>{});
                    }
                } catch(e) {}
            }
            if (settings && (settings.countingChannelID || settings.countingchannelid) && message.channel.id === (settings.countingChannelID || settings.countingchannelid)) {
                if (!isNaN(message.content.trim())) {
                    if (client.incrementQuestStats) client.incrementQuestStats(userID, guildID, 'counting_channel', 1).catch(()=>{});
                }
            }
            
            let isMediaChannelRes;
            try { isMediaChannelRes = await db.query(`SELECT * FROM media_streak_channels WHERE "guildID" = $1 AND "channelID" = $2`, [guildID, message.channel.id]); }
            catch(e) { isMediaChannelRes = await db.query(`SELECT * FROM media_streak_channels WHERE guildid = $1 AND channelid = $2`, [guildID, message.channel.id]).catch(()=>({rows:[]})); }
            
            if (isMediaChannelRes.rows && isMediaChannelRes.rows.length > 0) {
                if (message.attachments.size > 0 || message.content.includes('http')) {
                    handleMediaStreakMessage(message).catch(()=>{}); 
                }
            }
            handleStreakMessage(message).catch(()=>{}); 

            let getXpfromDB = settings?.customXP || settings?.customxp || 25;
            let getCooldownfromDB = settings?.customCooldown || settings?.customcooldown || 60000;

            if (!client.talkedRecently.get(message.author.id)) {
                
                if (message.content.toLowerCase().includes('مياو') || message.content.toLowerCase().includes('meow')) {
                    if (client.incrementQuestStats) client.incrementQuestStats(userID, guildID, 'meow_count', 1).catch(()=>{});
                    try { await db.query(`INSERT INTO levels ("user", "guild", "total_meow_count") VALUES ($1, $2, 1) ON CONFLICT ("user", "guild") DO UPDATE SET "total_meow_count" = COALESCE(levels."total_meow_count", 0) + 1`, [userID, guildID]); }
                    catch(e) { await db.query(`INSERT INTO levels (userid, guildid, total_meow_count) VALUES ($1, $2, 1) ON CONFLICT (userid, guildid) DO UPDATE SET total_meow_count = COALESCE(levels.total_meow_count, 0) + 1`, [userID, guildID]).catch(()=>{}); }
                    
                    if (client.checkAchievements) {
                        let updatedLevelRes;
                        try { updatedLevelRes = await db.query(`SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2`, [userID, guildID]); }
                        catch(e) { updatedLevelRes = await db.query(`SELECT * FROM levels WHERE userid = $1 AND guildid = $2`, [userID, guildID]).catch(()=>({rows:[]})); }
                        client.checkAchievements(client, message.member, updatedLevelRes.rows ? updatedLevelRes.rows[0] : null, null).catch(()=>{});
                    }
                }

                let buff = await calculateBuffMultiplier(message.member, db);

                if (settings && (settings.roleChatter || settings.rolechatter) && message.member?.roles.cache.has(settings.roleChatter || settings.rolechatter)) {
                    buff += 0.50; 
                }

                const xpGained = Math.floor((Math.random() * Number(getXpfromDB) + 1) * buff);
                
                if (addXPAndCheckLevel) {
                    await addXPAndCheckLevel(client, message.member, db, xpGained, 0, true);
                }

                client.talkedRecently.set(message.author.id, Date.now() + Number(getCooldownfromDB));
                setTimeout(() => client.talkedRecently.delete(message.author.id), Number(getCooldownfromDB));
            }
            
            try {
                let currentLevelData = await client.getLevel(userID, guildID);
                if (currentLevelData) {
                    const finalLvl = Number(currentLevelData.level) || 1;
                    let currentLevelRoleRes;
                    try { currentLevelRoleRes = await db.query(`SELECT * FROM level_roles WHERE "guildID" = $1 AND "level" <= $2 ORDER BY "level" DESC LIMIT 1`, [message.guild.id, finalLvl]); }
                    catch(e) { currentLevelRoleRes = await db.query(`SELECT * FROM level_roles WHERE guildid = $1 AND level <= $2 ORDER BY level DESC LIMIT 1`, [message.guild.id, finalLvl]).catch(()=>({rows:[]})); }
                    
                    let currentLevelRole = currentLevelRoleRes && currentLevelRoleRes.rows ? currentLevelRoleRes.rows[0] : null;
                    
                    if (currentLevelRole && message.member) {
                        const targetRoleID = currentLevelRole.roleID || currentLevelRole.roleid;
                        if (!message.member.roles.cache.has(targetRoleID)) {
                            message.member.roles.add(targetRoleID).catch(e => {});
                        }
                        
                        const currentRoleReqLevel = currentLevelRole.level;
                        let oldRolesRes;
                        try { oldRolesRes = await db.query(`SELECT "roleID" FROM level_roles WHERE "guildID" = $1 AND "level" < $2`, [message.guild.id, currentRoleReqLevel]); }
                        catch(e) { oldRolesRes = await db.query(`SELECT roleid FROM level_roles WHERE guildid = $1 AND level < $2`, [message.guild.id, currentRoleReqLevel]).catch(()=>({rows:[]})); }
                        
                        if(oldRolesRes && oldRolesRes.rows) {
                            for (const roleData of oldRolesRes.rows) {
                                const oldRoleID = roleData.roleID || roleData.roleid;
                                if (oldRoleID !== targetRoleID && message.member.roles.cache.has(oldRoleID)) {
                                    message.member.roles.remove(oldRoleID).catch(e => {});
                                }
                            }
                        }
                    }
                }
            } catch (e) { }

        } catch (err) {}

        // 🔥 احتكار أوامر البريفكس للإمبراطور أو للقنوات المسموحة 🔥
        if (message.content.startsWith(Prefix)) {
            const args = message.content.slice(Prefix.length).trim().split(/ +/);
            const commandName = args.shift().toLowerCase();
            if (commandName.length > 0) {
                const command = client.commands.find(cmd => (cmd.name && cmd.name.toLowerCase() === commandName) || (cmd.aliases && cmd.aliases.includes(commandName)));
                if (command) {
                    args.prefix = Prefix;
                    let isAllowed = false;
                    const OWNER_ID = "1145327691772481577";

                    // 👑 قاعدة الإمبراطور للأوامر:
                    if (message.author.id === OWNER_ID) { 
                        isAllowed = true; 
                    } else if (settings && ((settings.casinoChannelID || settings.casinochannelid) === message.channel.id || (settings.casinoChannelID2 || settings.casinochannelid2) === message.channel.id) && command.category === 'Economy') { 
                        isAllowed = true; // السماح في الكازينو
                    } else {
                        try {
                            // التحقق مما إذا كانت القناة مسموحة يدوياً
                            let channelPermRes;
                            try { channelPermRes = await db.query(`SELECT 1 FROM command_permissions WHERE "guildID" = $1 AND "commandName" = $2 AND "channelID" = $3`, [message.guild.id, command.name, message.channel.id]); }
                            catch(e) { channelPermRes = await db.query(`SELECT 1 FROM command_permissions WHERE guildid = $1 AND commandname = $2 AND channelid = $3`, [message.guild.id, command.name, message.channel.id]).catch(()=>({rows:[]})); }
                            
                            let categoryPermRes = {rows: []};
                            if (message.channel.parentId) {
                                try { categoryPermRes = await db.query(`SELECT 1 FROM command_permissions WHERE "guildID" = $1 AND "commandName" = $2 AND "channelID" = $3`, [message.guild.id, command.name, message.channel.parentId]); }
                                catch(e) { categoryPermRes = await db.query(`SELECT 1 FROM command_permissions WHERE guildid = $1 AND commandname = $2 AND channelid = $3`, [message.guild.id, command.name, message.channel.parentId]).catch(()=>({rows:[]})); }
                            }

                            if ((channelPermRes && channelPermRes.rows.length > 0) || (categoryPermRes && categoryPermRes.rows.length > 0)) { 
                                isAllowed = true; // السماح إذا تمت إضافتها عبر الصلاحيات
                            }
                        } catch (err) {}
                    }

                    if (isAllowed) {
                        try {
                            let isBlacklistedRes;
                            try { isBlacklistedRes = await db.query(`SELECT 1 FROM blacklistTable WHERE "id" = $1`, [message.author.id]); }
                            catch(e) { isBlacklistedRes = await db.query(`SELECT 1 FROM blacklistTable WHERE id = $1`, [message.author.id]).catch(()=>({rows:[]})); }
                            if (isBlacklistedRes && isBlacklistedRes.rows.length > 0) return; 
                        } catch(e) {}
                        
                        if (await checkPermissions(message, command)) {
                            const cooldownMsg = await checkCooldown(message, command);
                            if (cooldownMsg) { 
                                if (typeof cooldownMsg === 'string') message.reply(cooldownMsg); 
                            } else { 
                                try { await command.execute(message, args); } catch (error) { console.error(error); } 
                            }
                        }
                    } else {
                        // التجاهل الصامت التام لأي عضو يحاول استخدام الأوامر (لا يوجد رسالة رفض)
                        return; 
                    }
                    return; 
                }
            }
        }

        try {
            const argsRaw = message.content.trim().split(/ +/);
            const shortcutWord = argsRaw[0].toLowerCase().trim();
            
            let shortcutRes;
            try { shortcutRes = await db.query(`SELECT "commandName" FROM command_shortcuts WHERE "guildID" = $1 AND "channelID" = $2 AND "shortcutWord" = $3`, [message.guild.id, message.channel.id, shortcutWord]); }
            catch(e) { shortcutRes = await db.query(`SELECT commandname as "commandName" FROM command_shortcuts WHERE guildid = $1 AND channelid = $2 AND shortcutword = $3`, [message.guild.id, message.channel.id, shortcutWord]).catch(()=>({rows:[]})); }
            
            let shortcut = shortcutRes && shortcutRes.rows ? shortcutRes.rows[0] : null;
            if (!shortcut) {
                 try { shortcutRes = await db.query(`SELECT "commandName" FROM command_shortcuts WHERE "guildID" = $1 AND "shortcutWord" = $2 AND ("channelID" IS NULL OR "channelID" = 'null' OR "channelID" = '')`, [message.guild.id, shortcutWord]); }
                 catch(e) { shortcutRes = await db.query(`SELECT commandname as "commandName" FROM command_shortcuts WHERE guildid = $1 AND shortcutword = $2 AND (channelid IS NULL OR channelid = 'null' OR channelid = '')`, [message.guild.id, shortcutWord]).catch(()=>({rows:[]})); }
                 shortcut = shortcutRes && shortcutRes.rows ? shortcutRes.rows[0] : null;
            }
            
            if (shortcut) {
                const targetName = (shortcut.commandName || shortcut.commandname).toLowerCase();
                const cmd = client.commands.find(c => (c.name && c.name.toLowerCase() === targetName) || (c.aliases && c.aliases.includes(targetName)));
                if (cmd) {
                    if (await checkPermissions(message, cmd)) {
                        const cooldownMsg = await checkCooldown(message, cmd);
                        if (cooldownMsg) { if (typeof cooldownMsg === 'string') message.reply(cooldownMsg); return; }
                        try {
                            const finalArgs = argsRaw.slice(1);
                            finalArgs.prefix = ""; 
                            await cmd.execute(message, finalArgs); 
                        } catch (e) {}
                    }
                    return; 
                }
            }
        } catch (err) {}

        if (settings && (((settings.casinoChannelID || settings.casinochannelid) && message.channel.id === (settings.casinoChannelID || settings.casinochannelid)) || ((settings.casinoChannelID2 || settings.casinochannelid2) && message.channel.id === (settings.casinoChannelID2 || settings.casinochannelid2)))) {
            const args = message.content.trim().split(/ +/);
            const commandName = args.shift().toLowerCase();
            const command = client.commands.find(cmd => (cmd.name && cmd.name.toLowerCase() === commandName) || (cmd.aliases && cmd.aliases.includes(commandName)));
            if (command && command.category === "Economy") {
                if (!(await checkPermissions(message, command))) return;
                try { await command.execute(message, args); } catch (error) {}
                return;
            }
        }

        try {
            const content = message.content.trim();
            let autoReplyRes;
            try { autoReplyRes = await db.query(`SELECT * FROM auto_responses WHERE "guildID" = $1 AND "trigger" = $2`, [message.guild.id, content]); }
            catch(e) { autoReplyRes = await db.query(`SELECT * FROM auto_responses WHERE guildid = $1 AND trigger = $2`, [message.guild.id, content]).catch(()=>({rows:[]})); }
            
            const autoReply = autoReplyRes && autoReplyRes.rows ? autoReplyRes.rows[0] : null;
            if (autoReply) {
                const expires = autoReply.expiresAt || autoReply.expiresat;
                if (expires && Date.now() > Number(expires)) {
                    try { await db.query(`DELETE FROM auto_responses WHERE "id" = $1`, [autoReply.id]); }
                    catch(e) { await db.query(`DELETE FROM auto_responses WHERE id = $1`, [autoReply.id]).catch(()=>{}); }
                } 
                else {
                    let isAllowedChannel = true;
                    try {
                        const allowC = autoReply.allowedChannels || autoReply.allowedchannels;
                        if (allowC) {
                            const allowed = JSON.parse(allowC);
                            if (allowed.length > 0 && !allowed.includes(message.channel.id)) isAllowedChannel = false;
                        }
                        const ignoreC = autoReply.ignoredChannels || autoReply.ignoredchannels;
                        if (ignoreC) {
                            const ignored = JSON.parse(ignoreC);
                            if (ignored.length > 0 && ignored.includes(message.channel.id)) isAllowedChannel = false;
                        }
                    } catch (e) {} 
                    
                    if (isAllowedChannel) {
                        const cooldownKey = `ar_${autoReply.id}_${message.channel.id}`;
                        const cooldownTime = (Number(autoReply.cooldown) || 600) * 1000;
                        const now = Date.now();
                        if (message.author.id === message.guild.ownerId || !autoResponderCooldowns.has(cooldownKey) || now > autoResponderCooldowns.get(cooldownKey)) {
                            const files = autoReply.images ? JSON.parse(autoReply.images) : [];
                            safeReply(message, { content: autoReply.response, files: files, allowedMentions: { repliedUser: false } }).catch(() => {});
                            autoResponderCooldowns.set(cooldownKey, now + cooldownTime);
                            setTimeout(() => autoResponderCooldowns.delete(cooldownKey), cooldownTime);
                        }
                    }
                }
            }
        } catch (err) {}
    },
};
