const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Colors, MessageFlags } = require("discord.js");

let addXPAndCheckLevel;
try {
    ({ addXPAndCheckLevel } = require('./handler-utils.js'));
} catch (e) {
    try {
        ({ addXPAndCheckLevel } = require('../handlers/handler-utils.js'));
    } catch(e2) {}
}

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

// 🔥 إصلاح جذري لدوال سحب وإضافة المشاركين لجعلها Bulletproof 🔥
async function getGiveawayEntries(db, msgId) {
    let res = await safeQuery(db, 'SELECT * FROM giveaway_entries WHERE "giveawayID" = $1', [msgId]);
    if (res.rows.length > 0) return res.rows;
    
    res = await safeQuery(db, 'SELECT * FROM giveaway_entries WHERE "messageID" = $1', [msgId]);
    return res.rows;
}

async function addGiveawayEntry(db, msgId, userId, weight) {
    let w = Number(weight) || 1;

    // 1. المحاولة المباشرة مع الوزن
    let success = await safeExecute(db, `INSERT INTO giveaway_entries ("giveawayID", "userID", "weight") VALUES ($1, $2, $3)`, [msgId, userId, w]);
    if (success) return true;

    success = await safeExecute(db, `INSERT INTO giveaway_entries ("messageID", "userID", "weight") VALUES ($1, $2, $3)`, [msgId, userId, w]);
    if (success) return true;

    // 2. ترقيع الجداول في حال كانت الأعمدة ناقصة أو كان المفتاح الأساسي مكسور
    try { await db.query(`CREATE TABLE IF NOT EXISTS giveaway_entries ("giveawayID" TEXT, "userID" TEXT, "weight" INTEGER DEFAULT 1)`); } catch(e) {}
    try { await db.query(`ALTER TABLE giveaway_entries ADD COLUMN "weight" INTEGER DEFAULT 1`); } catch(e) {}
    try { await db.query(`ALTER TABLE giveaway_entries ADD COLUMN "giveawayID" TEXT`); } catch(e) {}

    // إعادة المحاولة بعد الترقيع (مع توليد ID عشوائي لتجاوز خطأ Primary Key القديم)
    const fallbackId = Math.floor(Math.random() * 1000000000);
    success = await safeExecute(db, `INSERT INTO giveaway_entries ("id", "giveawayID", "userID", "weight") VALUES ($4, $1, $2, $3)`, [msgId, userId, w, fallbackId]);
    if (success) return true;

    success = await safeExecute(db, `INSERT INTO giveaway_entries ("id", "messageID", "userID", "weight") VALUES ($4, $1, $2, $3)`, [msgId, userId, w, fallbackId]);
    if (success) return true;

    // 3. المحاولة كحل أخير بدون عمود الوزن (Fallback)
    success = await safeExecute(db, `INSERT INTO giveaway_entries ("giveawayID", "userID") VALUES ($1, $2)`, [msgId, userId]);
    if (success) return true;

    success = await safeExecute(db, `INSERT INTO giveaway_entries ("messageID", "userID") VALUES ($1, $2)`, [msgId, userId]);
    return success;
}

async function removeGiveawayEntry(db, msgId, userId) {
    let success = await safeExecute(db, `DELETE FROM giveaway_entries WHERE "giveawayID" = $1 AND "userID" = $2`, [msgId, userId]);
    if (success) return true;
    
    success = await safeExecute(db, `DELETE FROM giveaway_entries WHERE "messageID" = $1 AND "userID" = $2`, [msgId, userId]);
    return success;
}

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
        
        return Number(res.rows[0]?.maxweight || res.rows[0]?.MAXWEIGHT || 1);
    } catch (e) {
        return 1;
    }
}

async function startGiveaway(client, interaction, channel, duration, winnerCount, prize, xpReward, moraReward, image = null, color = null, customDesc = null) {
    const db = client.sql; 
    if (!db) return;

    await db.query(`CREATE TABLE IF NOT EXISTS active_giveaways ("messageID" TEXT PRIMARY KEY, "guildID" TEXT, "channelID" TEXT, "prize" TEXT, "endsAt" BIGINT, "winnerCount" INTEGER, "xpReward" INTEGER, "moraReward" INTEGER, "isFinished" INTEGER DEFAULT 0)`).catch(()=>{});
    await db.query(`CREATE TABLE IF NOT EXISTS giveaway_entries ("giveawayID" TEXT, "userID" TEXT, "weight" INTEGER)`).catch(()=>{});

    const endsAt = Date.now() + duration;
    
    let descText = "";
    if (customDesc) {
        descText += `${customDesc}\n\n`;
    }
    descText += `✶ عـدد الـمـشاركـيـن: 0\n✶ ينتـهـى بعـد: <t:${Math.floor(endsAt / 1000)}:R>`;

    const embed = new EmbedBuilder()
        .setTitle(`✥ قـيـفـاواي عـلـى: ${prize}`)
        .setDescription(descText)
        .setTimestamp(endsAt);

    try { embed.setColor(color || Colors.Blue); } catch (e) { embed.setColor(Colors.Blue); }

    if (moraReward > 0 || xpReward > 0) {
        embed.addFields(
            { name: "✬ اكس بي", value: `${xpReward.toLocaleString()}`, inline: true },
            { name: "✬ مـورا", value: `${moraReward.toLocaleString()}`, inline: true }
        );
    }

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

    const safeDuration = Math.min(duration, 2147483647); 
    setTimeout(() => {
        endGiveaway(client, message.id);
    }, safeDuration);

    return message;
}

// 🔥 نظام المشاركة المتين ضد أخطاء قاعدة البيانات 🔥
async function handleGiveawayInteraction(client, interaction) {
    try {
        const db = client.sql; 
        if (!db) return interaction.reply({ content: "❌ خطأ في الاتصال بقاعدة البيانات.", flags: [MessageFlags.Ephemeral] });

        // الرد الصامت والسريع جداً لتجنب أخطاء Timeout
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] }).catch(()=>{});

        const messageID = interaction.message.id;
        const userID = interaction.user.id;

        // دعم وإنشاء الجداول بحال غيابها
        await db.query(`CREATE TABLE IF NOT EXISTS giveaway_entries ("giveawayID" TEXT, "userID" TEXT, "weight" INTEGER DEFAULT 1)`).catch(()=>{});

        const giveawayRes = await safeQuery(db, 'SELECT * FROM active_giveaways WHERE "messageID" = $1 AND "isFinished" = 0', [messageID]);
        const giveaway = giveawayRes.rows[0];
        
        if (!giveaway) {
            return interaction.editReply({ content: "❌ هذا القيف اواي منتهي أو غير موجود." }).catch(()=>{});
        }

        if (Date.now() > Number(giveaway.endsAt || giveaway.endsat)) {
            return interaction.editReply({ content: "⏰ لقد انتهى وقت المشاركة!" }).catch(()=>{});
        }

        const entries = await getGiveawayEntries(db, messageID);
        const existingEntry = entries.find(e => e.userID === userID || e.userid === userID);
        let replyMessage = "";

        if (existingEntry) {
            await removeGiveawayEntry(db, messageID, userID);
            replyMessage = "✅ تـم الـغـاء الـمـشاركـة.. حظاً أوفر في المرات القادمة!";
        } else {
            const weight = await getUserWeight(interaction.member, db);
            const isSuccess = await addGiveawayEntry(db, messageID, userID, weight);
            
            if (!isSuccess) {
                // الفحص التأكيدي بحال حدوث تعارض (Race Condition)
                const checkAgain = await getGiveawayEntries(db, messageID);
                const stillExists = checkAgain.find(e => e.userID === userID || e.userid === userID);
                if (!stillExists) {
                    return interaction.editReply({ content: "❌ حدث خطأ داخلي في قاعدة البيانات أثناء تسجيلك، يرجى المحاولة مرة أخرى." }).catch(()=>{});
                }
            }
            replyMessage = `✅ تـمـت الـمـشاركـة بنـجـاح! دخـلت بـ: **${weight}** تذكـرة 🎟️`;
        }

        // تحديث رسالة القيفاواي مع العدد الجديد بأمان
        try {
            const newEntries = await getGiveawayEntries(db, messageID);
            const count = newEntries.length;

            const originalEmbed = interaction.message.embeds[0];
            const newEmbed = new EmbedBuilder(originalEmbed.toJSON());
            
            if (newEmbed.data.description) {
                const regex = /✶ عـدد الـمـشاركـيـن:\s*\d+/;
                if (regex.test(newEmbed.data.description)) {
                    newEmbed.setDescription(newEmbed.data.description.replace(regex, `✶ عـدد الـمـشاركـيـن: ${count}`));
                } else {
                    newEmbed.setDescription(newEmbed.data.description + `\n✶ عـدد الـمـشاركـيـن: ${count}`);
                }
            }

            const newRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(interaction.customId) // استخدام نفس الآيدي (عادي أو دروب)
                    .setLabel(`مشاركة (${count})`)
                    .setEmoji('🎉')
                    .setStyle(ButtonStyle.Primary)
            );
            
            await interaction.message.edit({ embeds: [newEmbed], components: [newRow] }).catch(()=>{});
        } catch(e) {
            console.error("Button Update Error:", e);
        }

        return interaction.editReply({ content: replyMessage }).catch(()=>{});
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

        const entries = await getGiveawayEntries(db, messageID);

        let channel;
        try {
            const guild = await client.guilds.fetch(giveaway.guildID || giveaway.guildid);
            channel = await guild.channels.fetch(giveaway.channelID || giveaway.channelid);
        } catch (e) { return; } 

        const originalMessage = await channel.messages.fetch(messageID).catch(() => null);

        if (entries.length === 0) {
            if (originalMessage) {
                const originalEmbed = originalMessage.embeds[0];
                const newEmbed = new EmbedBuilder(originalEmbed.toJSON()); 
                
                let oldDesc = originalEmbed.description || "";
                let cleanDesc = oldDesc.split('✶ عـدد الـمـشاركـيـن:')[0].trim();
                let newDesc = cleanDesc ? `${cleanDesc}\n\n` : "";
                newDesc += `✦ الـفـائـز: لا يوجد\n✶ عـدد الـمـشاركـيـن: 0`;
                
                newEmbed.setTitle(`[انـتـهـى] ✥ قـيـفـاواي عـلـى: ${giveaway.prize || ''}`).setColor(Colors.Red);
                newEmbed.setDescription(newDesc);
                
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
            const uid = entry.userid || entry.userID || entry.user_id;
            for (let i = 0; i < (Number(entry.weight) || 1); i++) {
                pool.push(uid);
            }
        }

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

        const announcementEmbed = new EmbedBuilder().setTitle(`✥ انـتـهى الـقـيفـاواي`).setColor(Colors.DarkGrey);
        const winnerLabel = winnerIDs.length > 1 ? "✦ الـفـائـزون:" : "✦ الـفـائـز:";
        
        let winDescription = `${winnerLabel} ${winnerString}\n✦ الـجـائـزة: **${giveaway.prize}**`;
        announcementEmbed.setDescription(winDescription);

        if (moraReward > 0 || xpReward > 0) {
            announcementEmbed.addFields(
                { name: "✬ اكس بي", value: `${xpReward.toLocaleString()}`, inline: true },
                { name: "✬ مـورا", value: `${moraReward.toLocaleString()}`, inline: true }
            );
        }
        
        await channel.send({ content: winnerString, embeds: [announcementEmbed] }).catch(()=>{});

        if (originalMessage) {
            const originalEmbed = originalMessage.embeds[0];
            const newEmbed = new EmbedBuilder(originalEmbed.toJSON()); 
            
            let oldDesc = originalEmbed.description || "";
            let cleanDesc = oldDesc.split('✶ عـدد الـمـشاركـيـن:')[0].trim();
            let newDesc = cleanDesc ? `${cleanDesc}\n\n` : "";
            newDesc += `${winnerLabel} ${winnerString}\n✶ عـدد الـمـشاركـيـن: ${entries.length}`;
            
            newEmbed.setTitle(`[انـتـهـى] ✥ قـيـفـاواي عـلـى: ${giveaway.prize || ''}`).setColor(Colors.DarkGrey);
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

// 🔥 نظام الريرول (إعادة السحب) مع الحماية المتكاملة ضد الأخطاء 🔥
async function rerollGiveaway(client, interaction, messageID) {
    const db = client.sql; 
    if (!db) return;

    const safeReply = async (msg) => {
        if (interaction.isCommand && interaction.isCommand()) {
            if (interaction.deferred || interaction.replied) return interaction.editReply(msg).catch(()=>{});
            return interaction.reply(msg).catch(()=>{});
        }
        if (interaction.deferred || interaction.replied) return interaction.editReply(msg).catch(()=>{});
        return interaction.reply(msg).catch(()=>{});
    };

    const giveawayRes = await safeQuery(db, 'SELECT * FROM active_giveaways WHERE "messageID" = $1', [messageID]);
    const giveaway = giveawayRes.rows[0];
    
    if (!giveaway) return safeReply({ content: "❌ لم يتم العثور على قيف اواي بهذا الآيدي.", flags: [MessageFlags.Ephemeral] });
    
    const isFinished = Number(giveaway.isFinished || giveaway.isfinished);
    if (isFinished === 0) return safeReply({ content: "⚠️ هذا القيف اواي لا يزال جارياً!", flags: [MessageFlags.Ephemeral] });

    const entries = await getGiveawayEntries(db, messageID);
    if (entries.length === 0) return safeReply({ content: "❌ لا يوجد مشاركين لعمل سحب عليهم.", flags: [MessageFlags.Ephemeral] });

    const pool = [];
    for (const entry of entries) {
        const uid = entry.userid || entry.userID || entry.user_id;
        for (let i = 0; i < (Number(entry.weight) || 1); i++) {
            pool.push(uid);
        }
    }
    const winner = pool[Math.floor(Math.random() * pool.length)];
    await safeReply({ content: `🎉 **الري-رول الجديد!** الفائز هو: <@${winner}>! 🥳`});
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

        const moraReward = Math.floor(Math.random() * 3001) + 500; 
        const xpReward = Math.floor(Math.random() * 1201) + 300;      
        
        const winnerCount = Math.floor(Math.random() * 3) + 1;        
        const durationMs = 5 * 60 * 1000; 
        const endsAt = Date.now() + durationMs;

        const prize = `جوائز عشوائية`;

        const description = `اضغط على الزر بالأسفل للمشاركة! ⤵️\n\n` +
                            `✶ عـدد الـمـشاركـيـن: 0\n` +
                            `✶ ينتـهـى بعـد: <t:${Math.floor(endsAt / 1000)}:R>`;

        const embed = new EmbedBuilder()
            .setTitle(`🎉 **DROP: ${prize}** 🎉`)
            .setDescription(description)
            .setColor(settings.dropColor || settings.dropcolor || "Gold")
            .setImage("https://i.postimg.cc/mgffs90m/giv.png")  
            .setTimestamp(endsAt)
            .addFields(
                { name: "✬ اكس بي", value: `${xpReward.toLocaleString()}`, inline: true },
                { name: "✬ مـورا", value: `${moraReward.toLocaleString()}`, inline: true }
            );

        const row = new ActionRowBuilder().addComponents(
            // 🔥 تعديل ليوافق تحديثات الـ ID لكي يعمل الزر بأمان 🔥
            new ButtonBuilder()
                .setCustomId('g_enter_drop') 
                .setLabel("مشاركة (0)")
                .setStyle(ButtonStyle.Primary)
                .setEmoji("🎉")
        );

        const message = await channel.send({ 
            content: "✥ **قيـفاواي سـريـع!** ✨",
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
                const safeTimeLeft = Math.min(timeLeft, 2147483647); 
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
