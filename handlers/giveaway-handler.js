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

// =========================================================================
// 🛡️ دوال استعلام ذكية لا تعتمد على الـ COUNT لتفادي أعطال قواعد البيانات 🛡️
// =========================================================================

async function getActiveGiveaway(db, messageID) {
    try {
        let res = await db.query(`SELECT * FROM active_giveaways WHERE "messageID" = $1`, [messageID]);
        let rows = res.rows ? res.rows : (Array.isArray(res) ? res : []);
        if (rows.length > 0) return rows[0];
    } catch(e) {
        try {
            let res = await db.query(`SELECT * FROM active_giveaways WHERE messageid = $1`, [messageID]);
            let rows = res.rows ? res.rows : (Array.isArray(res) ? res : []);
            if (rows.length > 0) return rows[0];
        } catch(e2) {}
    }
    return null;
}

async function getGiveawayEntries(db, messageID) {
    try {
        // نحاول جلب القائمة باستخدام giveawayID أو messageID
        let res = await db.query(`SELECT * FROM giveaway_entries WHERE "giveawayID" = $1 OR "messageID" = $1`, [messageID]);
        return res.rows ? res.rows : (Array.isArray(res) ? res : []);
    } catch (e1) {
        try {
            // في حال كانت الداتابيز بحروف صغيرة (SQLite)
            let res = await db.query(`SELECT * FROM giveaway_entries WHERE giveawayid = $1 OR messageid = $1`, [messageID]);
            return res.rows ? res.rows : (Array.isArray(res) ? res : []);
        } catch (e2) {
            return [];
        }
    }
}

async function insertGiveawayEntry(db, messageID, userID, weight) {
    try {
        await db.query(`INSERT INTO giveaway_entries ("giveawayID", "userID", "weight") VALUES ($1, $2, $3)`, [messageID, userID, weight]);
        return true;
    } catch (e1) {
        try {
            await db.query(`INSERT INTO giveaway_entries (giveawayid, userid, weight) VALUES ($1, $2, $3)`, [messageID, userID, weight]);
            return true;
        } catch (e2) {
            console.error("[Giveaway Insert Error]:", e2.message);
            return false;
        }
    }
}

async function deleteGiveawayEntry(db, messageID, userID) {
    try {
        await db.query(`DELETE FROM giveaway_entries WHERE "giveawayID" = $1 AND "userID" = $2`, [messageID, userID]);
        return true;
    } catch(e1) {
        try {
            await db.query(`DELETE FROM giveaway_entries WHERE giveawayid = $1 AND userid = $2`, [messageID, userID]);
            return true;
        } catch(e2) {
            return false;
        }
    }
}

async function markGiveawayFinished(db, messageID) {
    try {
        await db.query(`UPDATE active_giveaways SET "isFinished" = 1 WHERE "messageID" = $1`, [messageID]);
    } catch(e) {
        try {
            await db.query(`UPDATE active_giveaways SET isfinished = 1 WHERE messageid = $1`, [messageID]);
        } catch(e2) {}
    }
}

// =========================================================================

async function getUserWeight(member, db) {
    if (!member || !db || !member.guild) return 1;
    const guildId = member.guild.id;

    const userRoles = member.roles?.cache ? member.roles.cache.map(r => r.id) : (Array.isArray(member.roles) ? member.roles : []);
    if (userRoles.length === 0) return 1;

    const placeholders = userRoles.map((_, i) => `$${i + 2}`).join(',');
    
    try {
        let res = await db.query(`SELECT MAX(weight) as maxweight FROM giveaway_weights WHERE "guildID" = $1 AND "roleID" IN (${placeholders})`, [guildId, ...userRoles]);
        let rows = res.rows ? res.rows : (Array.isArray(res) ? res : []);
        return rows[0]?.maxweight || rows[0]?.MAXWEIGHT || 1;
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
        .setTitle("✥ قـيـفـاواي عـلـى:")
        .setDescription(
            `**${prize}**\n\n` +
            `✶ عـدد الـمـشاركـيـن: 0\n` +
            `✶ ينتـهـى بعـد: <t:${Math.floor(endsAt / 1000)}:R>`
        )
        .setColor(Colors.Blue)
        .setTimestamp(endsAt);

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

    try {
        await db.query(`
            INSERT INTO active_giveaways ("messageID", "guildID", "channelID", "prize", "endsAt", "winnerCount", "xpReward", "moraReward", "isFinished")
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0)
        `, [message.id, interaction.guild.id, channel.id, prize, endsAt, winnerCount, xpReward, moraReward]);
    } catch(e) {
        await db.query(`
            INSERT INTO active_giveaways (messageid, guildid, channelid, prize, endsat, winnercount, xpreward, morareward, isfinished)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0)
        `, [message.id, interaction.guild.id, channel.id, prize, endsAt, winnerCount, xpReward, moraReward]).catch(()=>{});
    }

    const safeDuration = Math.min(duration, 2147483647); 
    setTimeout(() => {
        endGiveaway(client, message.id);
    }, safeDuration);

    return message;
}

async function handleGiveawayInteraction(client, interaction) {
    try {
        const db = client.sql; 
        if (!db) return interaction.reply({ content: "❌ خطأ في الاتصال بقاعدة البيانات.", flags: [MessageFlags.Ephemeral] });

        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const messageID = interaction.message.id;
        const userID = interaction.user.id;

        // تأمين وجود الجدول
        await db.query(`CREATE TABLE IF NOT EXISTS giveaway_entries ("giveawayID" TEXT, "userID" TEXT, "weight" INTEGER)`).catch(()=>{});

        const giveaway = await getActiveGiveaway(db, messageID);
        if (!giveaway) {
            return interaction.editReply({ content: "❌ هذا القيف اواي منتهي أو غير موجود." });
        }

        const endsAt = Number(giveaway.endsAt || giveaway.endsat || 0);
        if (Date.now() > endsAt) {
            return interaction.editReply({ content: "⏰ لقد انتهى وقت المشاركة!" });
        }

        // جلب جميع المشاركين لمعرفة ما إذا كان العضو مشاركاً بالفعل وتحديث العداد بذكاء
        let entries = await getGiveawayEntries(db, messageID);
        const existingEntry = entries.find(e => e.userID === userID || e.userid === userID);
        
        let replyMessage = "";

        if (existingEntry) {
            await deleteGiveawayEntry(db, messageID, userID);
            replyMessage = "✅ تـم الـغـاء الـمـشاركـة";
            // تحديث القائمة الوهمية لتحديث العداد فوراً
            entries = entries.filter(e => e.userID !== userID && e.userid !== userID);
        } else {
            const weight = await getUserWeight(interaction.member, db);
            const isSuccess = await insertGiveawayEntry(db, messageID, userID, weight);
            if (!isSuccess) {
                return interaction.editReply({ content: "❌ فشل في حفظ المشاركة بسبب مشكلة في جداول البيانات القديمة، الرجاء التواصل مع الدعم." });
            }
            replyMessage = `✅ تـمـت الـمـشاركـة بنـجـاح! دخـلت بـ: **${weight}** تذكـرة`;
            // تحديث القائمة الوهمية
            entries.push({ userID: userID, weight: weight });
        }

        // تحديث الزر والإيمبد بناءً على العدد الفعلي
        try {
            const count = entries.length;
            const embed = EmbedBuilder.from(interaction.message.embeds[0]);
            
            if (embed.data.description) {
                const newDesc = embed.data.description.replace(/✶ عـدد الـمـشاركـيـن: \d+/g, `✶ عـدد الـمـشاركـيـن: ${count}`);
                embed.setDescription(newDesc);
            }

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

        const giveaway = await getActiveGiveaway(db, messageID);
        if (!giveaway) return;

        const endsAt = Number(giveaway.endsAt || giveaway.endsat || 0);
        const isFinished = Number(giveaway.isFinished || giveaway.isfinished || 0);

        if (!force && endsAt > Date.now() && isFinished === 0) {
            const timeLeft = endsAt - Date.now();
            const safeTimeLeft = Math.min(timeLeft, 2147483647);
            setTimeout(() => endGiveaway(client, messageID), safeTimeLeft);
            return;
        }

        if (!force && isFinished === 1) return;

        await markGiveawayFinished(db, messageID);

        const entries = await getGiveawayEntries(db, messageID);
        const prizeName = giveaway.prize || giveaway.PRIZE || "جائزة مجهولة";

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
                newEmbed.setTitle(`[انـتـهـى] ✥ قـيـفـاواي عـلـى:`).setColor(Colors.Red);
                
                let newDesc = `**${prizeName}**\n\n✦ الـفـائـز: لا يوجد\n✶ عـدد الـمـشاركـيـن: 0`;
                newEmbed.setDescription(newDesc);
                
                const disabledRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('g_ended').setLabel('انتهى').setStyle(ButtonStyle.Secondary).setDisabled(true).setEmoji('🏁')
                );
                await originalMessage.edit({ embeds: [newEmbed], components: [disabledRow] }).catch(()=>{});
                await channel.send({ content: `⚠️ القيفاواي (**${prizeName}**) انتهى ولم يشارك أحد.` }).catch(()=>{});
            }
            return; 
        }

        const pool = [];
        for (const entry of entries) {
            const uid = entry.userID || entry.userid || entry.user_id;
            for (let i = 0; i < (Number(entry.weight) || 1); i++) {
                pool.push(uid);
            }
        }

        // خلط المصفوفة
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
                        try {
                            await db.query(`UPDATE levels SET "mora" = CAST(COALESCE("mora", '0') AS BIGINT) + $1, "xp" = CAST(COALESCE("xp", '0') AS BIGINT) + $2, "totalXP" = CAST(COALESCE("totalXP", '0') AS BIGINT) + $2 WHERE "user" = $3 AND "guild" = $4`, [moraReward, xpReward, winnerID, guildId]);
                        } catch(e) {
                            await db.query(`UPDATE levels SET mora = CAST(COALESCE(mora, '0') AS BIGINT) + $1, xp = CAST(COALESCE(xp, '0') AS BIGINT) + $2, totalxp = CAST(COALESCE(totalxp, '0') AS BIGINT) + $2 WHERE userid = $3 AND guildid = $4`, [moraReward, xpReward, winnerID, guildId]).catch(()=>{});
                        }
                    }
                } catch (err) { }
            }
        }

        const announcementEmbed = new EmbedBuilder().setTitle(`✥ انـتـهى الـقـيفـاواي`).setColor(Colors.DarkGrey);
        const winnerLabel = winnerIDs.length > 1 ? "✦ الـفـائـزون:" : "✦ الـفـائـز:";
        
        let winDescription = `${winnerLabel} ${winnerString}\n✦ الـجـائـزة: **${prizeName}**`;
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
            newEmbed.setTitle(`[انـتـهـى] ✥ قـيـفـاواي عـلـى:`).setColor(Colors.Red);
            
            let newDesc = `**${prizeName}**\n\n${winnerLabel} ${winnerString}\n✶ عـدد الـمـشاركـيـن: ${entries.length}`;
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

    const giveaway = await getActiveGiveaway(db, messageID);
    if (!giveaway) return interaction.reply({ content: "❌ لم يتم العثور على قيف اواي بهذا الآيدي.", flags: [MessageFlags.Ephemeral] });
    
    const isFinished = Number(giveaway.isFinished || giveaway.isfinished || 0);
    if (isFinished === 0) return interaction.reply({ content: "⚠️ هذا القيف اواي لا يزال جارياً!", flags: [MessageFlags.Ephemeral] });

    const entries = await getGiveawayEntries(db, messageID);
    if (entries.length === 0) return interaction.reply({ content: "❌ لا يوجد مشاركين لعمل سحب عليهم.", flags: [MessageFlags.Ephemeral] });

    const pool = [];
    for (const entry of entries) {
        const uid = entry.userID || entry.userid || entry.user_id;
        for (let i = 0; i < (Number(entry.weight) || 1); i++) {
            pool.push(uid);
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

        let settingsRes;
        try { settingsRes = await db.query('SELECT * FROM settings WHERE "guild" = $1', [guild.id]); } catch(e) { settingsRes = await db.query('SELECT * FROM settings WHERE guild = $1', [guild.id]); }
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

        const description = `**${prize}**\n\n` +
                            `✶ عـدد الـمـشاركـيـن: 0\n` +
                            `✶ ينتـهـى بعـد: <t:${Math.floor(endsAt / 1000)}:R>\n\n` +
                            `اضغط على الزر بالأسفل للمشاركة! ⤵️`;

        const embed = new EmbedBuilder()
            .setTitle("🎉 **GIVEAWAY DROP** 🎉")
            .setDescription(description)
            .setColor(settings.dropColor || settings.dropcolor || "Gold")
            .setImage("https://i.postimg.cc/mgffs90m/giv.png")  
            .setTimestamp(endsAt)
            .addFields(
                { name: "✬ اكس بي", value: `${xpReward.toLocaleString()}`, inline: true },
                { name: "✬ مـورا", value: `${moraReward.toLocaleString()}`, inline: true }
            );

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('g_enter') 
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

        try {
            await db.query(`
                INSERT INTO active_giveaways ("messageID", "guildID", "channelID", "prize", "endsAt", "winnerCount", "xpReward", "moraReward", "isFinished") 
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0)
            `, [message.id, guild.id, channel.id, prize, endsAt, winnerCount, xpReward, moraReward]);
        } catch(e) {
            await db.query(`
                INSERT INTO active_giveaways (messageid, guildid, channelid, prize, endsat, winnercount, xpreward, morareward, isfinished) 
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0)
            `, [message.id, guild.id, channel.id, prize, endsAt, winnerCount, xpReward, moraReward]).catch(()=>{});
        }

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
        let activeGiveaways = [];
        try {
            let res = await db.query('SELECT * FROM active_giveaways WHERE "isFinished" = 0', []);
            activeGiveaways = res.rows;
        } catch(e) {
            let res = await db.query('SELECT * FROM active_giveaways WHERE isfinished = 0', []);
            activeGiveaways = res.rows;
        }

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
