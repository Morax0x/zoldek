const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Colors, MessageFlags } = require("discord.js");

// 🔥 استيراد الدالة المركزية للتلفيل 🔥
let addXPAndCheckLevel;
try {
    ({ addXPAndCheckLevel } = require('./handler-utils.js'));
} catch (e) {
    try {
        ({ addXPAndCheckLevel } = require('../handlers/handler-utils.js'));
    } catch(e2) {}
}

// 🛡️ نظام معالجة استعلامات فولاذي 🛡️
const safeQuery = async (db, qPg, params) => {
    let res;
    try { 
        res = await db.query(qPg, params); 
    } catch(e) { 
        res = { rows: [] }; 
    }

    const rows1 = Array.isArray(res) ? res : (res?.rows || []);
    if (rows1.length > 0) return { rows: rows1 };

    let fallbackQuery = qPg
        .replace(/"userID"/gi, "userid")
        .replace(/"guildID"/gi, "guildid")
        .replace(/"channelID"/gi, "channelid")
        .replace(/"messageID"/gi, "messageid")
        .replace(/"prize"/gi, "prize")
        .replace(/"endsAt"/gi, "endsat")
        .replace(/"winnerCount"/gi, "winnercount")
        .replace(/"xpReward"/gi, "xpreward")
        .replace(/"moraReward"/gi, "morareward")
        .replace(/"isFinished"/gi, "isfinished")
        .replace(/"giveawayID"/gi, "giveawayid")
        .replace(/"weight"/gi, "weight")
        .replace(/"roleID"/gi, "roleid");

    if (fallbackQuery !== qPg) {
        try { 
            let res2 = await db.query(fallbackQuery, params); 
            const rows2 = Array.isArray(res2) ? res2 : (res2?.rows || []);
            return { rows: rows2 };
        } catch(e2) { }
    }
    
    return { rows: [] };
};

const safeExecute = async (db, qPg, params) => {
    try { await db.query(qPg, params); return true; } catch(e) { 
        let fallbackQuery = qPg
            .replace(/"userID"/gi, "userid")
            .replace(/"guildID"/gi, "guildid")
            .replace(/"channelID"/gi, "channelid")
            .replace(/"messageID"/gi, "messageid")
            .replace(/"prize"/gi, "prize")
            .replace(/"endsAt"/gi, "endsat")
            .replace(/"winnerCount"/gi, "winnercount")
            .replace(/"xpReward"/gi, "xpreward")
            .replace(/"moraReward"/gi, "morareward")
            .replace(/"isFinished"/gi, "isfinished")
            .replace(/"giveawayID"/gi, "giveawayid")
            .replace(/"weight"/gi, "weight")
            .replace(/"roleID"/gi, "roleid");

        if (fallbackQuery !== qPg) {
            try { await db.query(fallbackQuery, params); return true; } catch(e2) { return false; }
        }
        return false;
    }
};

async function getUserWeight(member, db) {
    if (!member || !db || !member.guild) return 1;
    const guildId = member.guild.id;

    const userRoles = member.roles?.cache ? member.roles.cache.map(r => r.id) : (Array.isArray(member.roles) ? member.roles : []);
    if (userRoles.length === 0) return 1;

    const placeholders = userRoles.map((_, i) => `$${i + 2}`).join(',');
    
    try {
        const res = await safeQuery(db, `
            SELECT MAX(weight) as maxweight
            FROM giveaway_weights
            WHERE "guildID" = $1 AND "roleID" IN (${placeholders})
        `, [guildId, ...userRoles]);
        
        return res.rows[0]?.maxweight || 1;
    } catch (e) {
        return 1;
    }
}

async function startGiveaway(client, interaction, channel, duration, winnerCount, prize, xpReward, moraReward, image = null) {
    const db = client.sql; 
    if (!db) return;

    await db.query(`CREATE TABLE IF NOT EXISTS active_giveaways ("messageID" TEXT PRIMARY KEY, "guildID" TEXT, "channelID" TEXT, "prize" TEXT, "endsAt" BIGINT, "winnerCount" INTEGER, "xpReward" INTEGER, "moraReward" INTEGER, "isFinished" INTEGER DEFAULT 0)`).catch(()=>{});
    await db.query(`CREATE TABLE IF NOT EXISTS giveaway_entries ("giveawayID" TEXT, "userID" TEXT, "weight" INTEGER)`).catch(()=>{});

    const endsAt = Date.now() + duration;
    
    const embed = new EmbedBuilder()
        .setTitle("🎉 **GIVEAWAY** 🎉")
        .setDescription(
            `**الجائزة:** ${prize}\n` +
            `**عدد الفائزين:** ${winnerCount}\n` +
            `**ينتهي:** <t:${Math.floor(endsAt / 1000)}:R> (<t:${Math.floor(endsAt / 1000)}:f>)\n\n` +
            `**الجوائز الإضافية:**\n` +
            `💰 مورا: **${moraReward}** | ✨ خبرة: **${xpReward}**\n\n` +
            `اضغط على الزر بالأسفل للمشاركة! ⤵️`
        )
        .setColor(Colors.Blue)
        .setTimestamp(endsAt)
        .setFooter({ text: `ينتهي في` });

    if (image) embed.setImage(image);

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('g_enter') 
            .setLabel('مشاركة (0)')
            .setEmoji('🎉')
            .setStyle(ButtonStyle.Primary)
    );

    const message = await channel.send({ embeds: [embed], components: [row] });

    await safeExecute(db, `
        INSERT INTO active_giveaways ("messageID", "guildID", "channelID", "prize", "endsAt", "winnerCount", "xpReward", "moraReward", "isFinished")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0)
    `, [message.id, interaction.guild.id, channel.id, prize, endsAt, winnerCount, xpReward, moraReward]);

    const safeDuration = Math.min(duration, 2147483647); // حماية من تجاوز حد التايم اوت في Node.js
    setTimeout(() => {
        endGiveaway(client, message.id);
    }, safeDuration);

    return message;
}

// 🛠️ إصلاح التفاعل والرد (تم إضافة deferReply لمنع الزر من التعليق) 🛠️
async function handleGiveawayInteraction(client, interaction) {
    try {
        const db = client.sql; 
        if (!db) return interaction.reply({ content: "❌ خطأ في الاتصال بقاعدة البيانات.", flags: [MessageFlags.Ephemeral] });

        // 🔥 إرسال رد مبدئي مخفي لكي لا يعلق الزر (Interaction Failed) 🔥
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const messageID = interaction.message.id;
        const userID = interaction.user.id;

        await db.query(`CREATE TABLE IF NOT EXISTS giveaway_entries ("giveawayID" TEXT, "userID" TEXT, "weight" INTEGER)`).catch(()=>{});

        const giveawayRes = await safeQuery(db, 'SELECT * FROM active_giveaways WHERE "messageID" = $1 AND "isFinished" = 0', [messageID]);
        const giveaway = giveawayRes.rows[0];
        
        if (!giveaway) {
            return interaction.editReply({ content: "❌ هذا القيف اواي منتهي أو غير موجود." });
        }

        if (Date.now() > Number(giveaway.endsAt || giveaway.endsat)) {
            return interaction.editReply({ content: "⏰ لقد انتهى وقت المشاركة!" });
        }

        const existingEntryRes = await safeQuery(db, 'SELECT * FROM giveaway_entries WHERE "giveawayID" = $1 AND "userID" = $2', [messageID, userID]);
        const existingEntry = existingEntryRes.rows[0];
        
        let replyMessage = "";

        if (existingEntry) {
            await safeExecute(db, 'DELETE FROM giveaway_entries WHERE "giveawayID" = $1 AND "userID" = $2', [messageID, userID]);
            replyMessage = "✅ تـم الـغـاء الـمـشاركـة";
        } else {
            const weight = await getUserWeight(interaction.member, db);
            await safeExecute(db, 'INSERT INTO giveaway_entries ("giveawayID", "userID", "weight") VALUES ($1, $2, $3)', [messageID, userID, weight]);
            replyMessage = `✅ تـمـت الـمـشاركـة بنـجـاح! دخـلت بـ: **${weight}** تذكـرة`;
        }

        // تحديث الزر بعدد المشاركين
        try {
            const countRes = await safeQuery(db, 'SELECT COUNT(*) as count FROM giveaway_entries WHERE "giveawayID" = $1', [messageID]);
            const count = countRes.rows[0]?.count || 0;

            const embed = EmbedBuilder.from(interaction.message.embeds[0]);
            const oldButton = interaction.message.components[0].components[0];
            const newButton = ButtonBuilder.from(oldButton).setLabel(`مشاركة (${count})`);
            const newRow = new ActionRowBuilder().addComponents(newButton);
            
            await interaction.message.edit({ embeds: [embed], components: [newRow] }).catch(()=>{});
        } catch(e) {
            console.error("Button Update Error:", e);
        }

        return interaction.editReply({ content: replyMessage });
    } catch (err) {
        console.error("[Giveaway Interaction Error]:", err);
        return interaction.editReply({ content: "❌ حدث خطأ أثناء معالجة طلبك." }).catch(()=>{});
    }
}

async function endGiveaway(client, messageID, force = false) {
    try {
        const db = client.sql; 
        if (!db) return;

        const giveawayRes = await safeQuery(db, 'SELECT * FROM active_giveaways WHERE "messageID" = $1', [messageID]);
        const giveaway = giveawayRes.rows[0];

        if (!giveaway) return;

        const endsAt = Number(giveaway.endsAt || giveaway.endsat);
        const isFinished = Number(giveaway.isFinished || giveaway.isfinished);

        if (!force && endsAt > Date.now() && isFinished === 0) {
            const timeLeft = endsAt - Date.now();
            const safeTimeLeft = Math.min(timeLeft, 2147483647);
            setTimeout(() => endGiveaway(client, messageID), safeTimeLeft);
            return;
        }

        if (!force && isFinished === 1) return;

        await safeExecute(db, 'UPDATE active_giveaways SET "isFinished" = 1 WHERE "messageID" = $1', [messageID]);

        const entriesRes = await safeQuery(db, 'SELECT * FROM giveaway_entries WHERE "giveawayID" = $1', [messageID]);
        const entries = entriesRes.rows;

        let channel;
        try {
            const guild = await client.guilds.fetch(giveaway.guildID || giveaway.guildid);
            channel = await guild.channels.fetch(giveaway.channelID || giveaway.channelid);
        } catch (e) { return; } // القناة انحذفت

        const originalMessage = await channel.messages.fetch(messageID).catch(() => null);

        if (entries.length === 0) {
            if (originalMessage) {
                const originalEmbed = originalMessage.embeds[0];
                const newEmbed = new EmbedBuilder(originalEmbed.toJSON()); 
                newEmbed.setTitle(`[انـتـهـى] ${originalEmbed.title || "Giveaway"}`).setColor("Red").setFooter({ text: "انتهى (لا مشاركين)" });
                
                const disabledRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('g_ended').setLabel('انتهى').setStyle(ButtonStyle.Secondary).setDisabled(true).setEmoji('🏁')
                );
                await originalMessage.edit({ embeds: [newEmbed], components: [disabledRow] }).catch(()=>{});
                await channel.send({ content: `⚠️ القيفاواي (**${giveaway.prize}**) انتهى ولم يشارك أحد.` }).catch(()=>{});
            }
            return; 
        }

        const pool = [];
        for (const entry of entries) {
            for (let i = 0; i < (Number(entry.weight) || 1); i++) {
                pool.push(entry.userID || entry.userid);
            }
        }

        // خلط المصفوفة (Fisher-Yates Shuffle)
        for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pool[i], pool[j]] = [pool[j], pool[i]];
        }

        const winners = new Set();
        const countToWin = Math.min(Number(giveaway.winnerCount || giveaway.winnercount), entries.length);
        let attempts = 0;

        while (winners.size < countToWin && attempts < 1000 && pool.length > 0) {
            const randomIndex = Math.floor(Math.random() * pool.length);
            const winnerID = pool[randomIndex];
            winners.add(winnerID);
            attempts++;
        }

        const winnerIDs = Array.from(winners);
        const winnerString = winnerIDs.map(id => `<@${id}>`).join(', ');
        const moraReward = Number(giveaway.moraReward || giveaway.morareward || 0);
        const xpReward = Number(giveaway.xpReward || giveaway.xpreward || 0);
        const guildId = giveaway.guildID || giveaway.guildid;

        if (moraReward > 0 || xpReward > 0) {
            for (const winnerID of winnerIDs) {
                try {
                    const guild = channel.guild;
                    const member = await guild.members.fetch(winnerID).catch(() => null);
                    
                    if (member && addXPAndCheckLevel) {
                        await addXPAndCheckLevel(client, member, db, xpReward, moraReward, false);
                    } else {
                        await safeExecute(db, `UPDATE levels SET "mora" = CAST(COALESCE("mora", '0') AS BIGINT) + $1, "xp" = CAST(COALESCE("xp", '0') AS BIGINT) + $2, "totalXP" = CAST(COALESCE("totalXP", '0') AS BIGINT) + $2 WHERE "user" = $3 AND "guild" = $4`, [moraReward, xpReward, winnerID, guildId]);
                    }
                } catch (err) { }
            }
        }

        const announcementEmbed = new EmbedBuilder().setTitle(`✥ انـتـهى الـقـيفـاواي`).setColor("DarkGrey");
        const winnerLabel = winnerIDs.length > 1 ? "الـفـائـزون:" : "الـفـائـز:";
        
        let winDescription = `✦ **${winnerLabel}** ${winnerString}\n✦ الـجـائـزة: **${giveaway.prize}**`;
        if (moraReward > 0) winDescription += `\n✦ مـورا: **${moraReward.toLocaleString()}**`;
        if (xpReward > 0) winDescription += `\n✬ اكس بي: **${xpReward.toLocaleString()}**`;
        
        announcementEmbed.setDescription(winDescription);
        await channel.send({ content: winnerString, embeds: [announcementEmbed] }).catch(()=>{});

        if (originalMessage) {
            const originalEmbed = originalMessage.embeds[0];
            const newEmbed = new EmbedBuilder(originalEmbed.toJSON()); 
            newEmbed.setTitle(`[انـتـهـى] ${originalEmbed.title || "Giveaway"}`).setColor("DarkGrey").setFooter({ text: "انتهى" });
            
            let newDesc = originalEmbed.description.replace(/.*ينتهي.*<t:\d+:R>.*\n?/i, "");
            newDesc += `\n\n**${winnerLabel}** ${winnerString}\n**عدد المشاركين:** ${entries.length}`;
            newEmbed.setDescription(newDesc);

            const disabledRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('g_ended').setLabel(`انتهى (${entries.length})`).setStyle(ButtonStyle.Secondary).setDisabled(true).setEmoji('🏁')
            );
            await originalMessage.edit({ embeds: [newEmbed], components: [disabledRow] }).catch(()=>{});
        }
    } catch (err) {
        console.error("[End Giveaway Error]:", err);
    }
}

async function rerollGiveaway(client, interaction, messageID) {
    const db = client.sql; 
    if (!db) return;

    const giveawayRes = await safeQuery(db, 'SELECT * FROM active_giveaways WHERE "messageID" = $1', [messageID]);
    const giveaway = giveawayRes.rows[0];
    
    if (!giveaway) return interaction.reply({ content: "❌ لم يتم العثور على قيف اواي بهذا الآيدي.", flags: [MessageFlags.Ephemeral] });
    
    const isFinished = Number(giveaway.isFinished || giveaway.isfinished);
    if (isFinished === 0) return interaction.reply({ content: "⚠️ هذا القيف اواي لا يزال جارياً!", flags: [MessageFlags.Ephemeral] });

    const entriesRes = await safeQuery(db, 'SELECT "userID", "weight" FROM giveaway_entries WHERE "giveawayID" = $1', [messageID]);
    const entries = entriesRes.rows;
    if (entries.length === 0) return interaction.reply({ content: "❌ لا يوجد مشاركين لعمل سحب عليهم.", flags: [MessageFlags.Ephemeral] });

    const pool = [];
    for (const entry of entries) {
        for (let i = 0; i < (Number(entry.weight) || 1); i++) {
            pool.push(entry.userID || entry.userid);
        }
    }
    const winner = pool[Math.floor(Math.random() * pool.length)];
    await interaction.reply(`🎉 **الري-رول الجديد!** الفائز هو: <@${winner}>! 🥳`);
}

async function createRandomDropGiveaway(client, guild) {
    try {
        const db = client.sql; 
        if (!db) return false;

        await db.query(`CREATE TABLE IF NOT EXISTS active_giveaways ("messageID" TEXT PRIMARY KEY, "guildID" TEXT, "channelID" TEXT, "prize" TEXT, "endsAt" BIGINT, "winnerCount" INTEGER, "xpReward" INTEGER, "moraReward" INTEGER, "isFinished" INTEGER DEFAULT 0)`).catch(()=>{});
        await db.query(`CREATE TABLE IF NOT EXISTS giveaway_entries ("giveawayID" TEXT, "userID" TEXT, "weight" INTEGER)`).catch(()=>{});

        const settingsRes = await safeQuery(db, 'SELECT * FROM settings WHERE "guild" = $1', [guild.id]);
        const settings = settingsRes.rows[0];

        if (!settings || (!settings.dropGiveawayChannelID && !settings.dropgiveawaychannelid)) return false;
        
        const channel = guild.channels.cache.get(settings.dropGiveawayChannelID || settings.dropgiveawaychannelid);
        if (!channel) return false;

        const DEFAULTS = {
            dropTitle: "🎉 **GIVEAWAY DROP** 🎉",
            dropDescription: `**الجائزة:** جوائز عشوائية قيمة\n` +
                             `**عدد الفائزين:** {winners}\n` +
                             `**ينتهي:** {time} ({time_full})\n\n` +
                             `**الجوائز:**\n` +
                             `💰 مورا: **{mora}** | ✨ خبرة: **{xp}**\n\n` +
                             `اضغط على الزر بالأسفل للمشاركة! ⤵️`,
            dropColor: "Gold",
            dropFooter: "ينتهي في",
            dropButtonLabel: "مشاركة (0)",
            dropButtonEmoji: "🎉",
            dropMessageContent: "✨ **قيفاواي مفاجئ ظهر!** ✨"
        };

        const moraReward = Math.floor(Math.random() * 3001) + 500; 
        const xpReward = Math.floor(Math.random() * 1201) + 300;     
        
        const winnerCount = Math.floor(Math.random() * 3) + 1;        
        const durationMs = 5 * 60 * 1000; 
        const endsAt = Date.now() + durationMs;
        const endsAtTimestamp = Math.floor(endsAt / 1000);

        const prize = `🎁 ${moraReward.toLocaleString()} Mora & ${xpReward.toLocaleString()} XP`;

        const title = settings.dropTitle || settings.droptitle || DEFAULTS.dropTitle;
        
        const description = (settings.dropDescription || settings.dropdescription || DEFAULTS.dropDescription)
            .replace(/{prize}/g, prize)
            .replace(/{winners}/g, winnerCount)
            .replace(/{time}/g, `<t:${endsAtTimestamp}:R>`)
            .replace(/{time_full}/g, `<t:${endsAtTimestamp}:f>`)
            .replace(/{mora}/g, moraReward.toLocaleString())
            .replace(/{xp}/g, xpReward.toLocaleString());

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setColor(settings.dropColor || settings.dropcolor || DEFAULTS.dropColor)
            .setImage("https://i.postimg.cc/mgffs90m/giv.png")  
            .setTimestamp(endsAt)
            .setFooter({ text: settings.dropFooter || settings.dropfooter || DEFAULTS.dropFooter });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('g_enter') 
                .setLabel(settings.dropButtonLabel || settings.dropbuttonlabel || DEFAULTS.dropButtonLabel)
                .setStyle(ButtonStyle.Primary)
                .setEmoji(settings.dropButtonEmoji || settings.dropbuttonemoji || DEFAULTS.dropButtonEmoji)
        );

        const message = await channel.send({ 
            content: settings.dropMessageContent || settings.dropmessagecontent || DEFAULTS.dropMessageContent,
            embeds: [embed], 
            components: [row] 
        }).catch(() => null);
        
        if (!message) return false;

        await safeExecute(db, `
            INSERT INTO active_giveaways ("messageID", "guildID", "channelID", "prize", "endsAt", "winnerCount", "xpReward", "moraReward", "isFinished") 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0)
        `, [message.id, guild.id, channel.id, prize, endsAt, winnerCount, xpReward, moraReward]);

        const safeDuration = Math.min(durationMs, 2147483647);
        setTimeout(() => { endGiveaway(client, message.id); }, safeDuration); 

        return true; 
    } catch (e) {
        console.error("[Drop Giveaway Error]:", e);
        return false;
    }
}

async function initGiveaways(client) {
    const db = client.sql; 
    if (!db) return;

    try {
        const activeGiveawaysRes = await safeQuery(db, 'SELECT * FROM active_giveaways WHERE "isFinished" = 0', []);
        const activeGiveaways = activeGiveawaysRes.rows;

        for (const giveaway of activeGiveaways) {
            const messageID = giveaway.messageID || giveaway.messageid;
            const now = Date.now();
            const endsAt = Number(giveaway.endsAt || giveaway.endsat);
            const timeLeft = endsAt - now;

            if (timeLeft <= 0) {
                endGiveaway(client, messageID);
            } else {
                const safeTimeLeft = Math.min(timeLeft, 2147483647); // حماية التايم اوت
                setTimeout(() => { endGiveaway(client, messageID); }, safeTimeLeft);
            }
        }
    } catch (e) {
        console.error("[Init Giveaways Error]:", e);
    }
}

module.exports = {
    getUserWeight,
    startGiveaway,
    handleGiveawayInteraction,
    endGiveaway,
    rerollGiveaway,
    createRandomDropGiveaway,
    initGiveaways
};
