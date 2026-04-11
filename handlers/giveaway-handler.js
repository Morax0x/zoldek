const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Colors, MessageFlags } = require("discord.js");

let addXPAndCheckLevel;
try { ({ addXPAndCheckLevel } = require('./handler-utils.js')); } catch (e) {
    try { ({ addXPAndCheckLevel } = require('../handlers/handler-utils.js')); } catch(e2) {}
}

// =================================================================================
// 🚀 نظام استعلامات مطابق 100% لتصميم جداول الإمبراطورية (مستحيل يفشل) 🚀
// =================================================================================
async function getUserWeight(member, db) {
    if (!member || !db || !member.guild) return 1;
    const userRoles = member.roles?.cache ? member.roles.cache.map(r => r.id) : (Array.isArray(member.roles) ? member.roles : []);
    if (userRoles.length === 0) return 1;

    const placeholders = userRoles.map((_, i) => `$${i + 2}`).join(',');
    try {
        const res = await db.query(`SELECT MAX("weight") as maxweight FROM giveaway_weights WHERE "guildID" = $1 AND "roleID" IN (${placeholders})`, [member.guild.id, ...userRoles]);
        return res.rows[0]?.maxweight ? Number(res.rows[0].maxweight) : 1;
    } catch (e) { return 1; }
}

async function startGiveaway(client, interaction, channel, duration, winnerCount, prize, xpReward, moraReward) {
    const db = client.sql; 
    if (!db) return;

    const endsAt = Date.now() + duration;
    
    // الإيمبد كما صممته أنت
    const embed = new EmbedBuilder()
        .setTitle("✥ قـيـفـاواي عـلـى:")
        .setDescription(`**${prize}**\n\n✶ عـدد الـمـشاركـيـن: 0\n✶ ينتـهـى بعـد: <t:${Math.floor(endsAt / 1000)}:R>`)
        .setColor(Colors.Blue)
        .setTimestamp(endsAt);

    if (moraReward > 0 || xpReward > 0) {
        embed.addFields(
            { name: "✬ اكس بي", value: `${xpReward.toLocaleString()}`, inline: true },
            { name: "✬ مـورا", value: `${moraReward.toLocaleString()}`, inline: true }
        );
    }

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('g_enter').setLabel('مشاركة (0)').setEmoji('🎉').setStyle(ButtonStyle.Primary)
    );

    const message = await channel.send({ embeds: [embed], components: [row] });

    // إدخال البيانات في الجدول (مطابق لأسماء العواميد في database-setup.js)
    await db.query(`
        INSERT INTO active_giveaways ("messageID", "guildID", "channelID", "prize", "endsAt", "winnerCount", "xpReward", "moraReward", "isFinished")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0)
    `, [message.id, interaction.guild.id, channel.id, prize, endsAt, winnerCount, xpReward, moraReward]).catch(e => console.error("Start GW DB Error:", e.message));

    const safeDuration = Math.min(duration, 2147483647); 
    setTimeout(() => { endGiveaway(client, message.id); }, safeDuration);
    return message;
}

async function handleGiveawayInteraction(client, interaction) {
    try {
        const db = client.sql; 
        if (!db) return interaction.reply({ content: "❌ خطأ في الاتصال بقاعدة البيانات.", flags: [MessageFlags.Ephemeral] });

        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const messageID = interaction.message.id;
        const userID = interaction.user.id;

        // التحقق من صحة القيفاواي
        const gwRes = await db.query(`SELECT * FROM active_giveaways WHERE "messageID" = $1`, [messageID]).catch(()=>({rows:[]}));
        const giveaway = gwRes.rows[0];
        
        if (!giveaway) return interaction.editReply({ content: "❌ هذا القيفاواي غير موجود." });
        if (Number(giveaway.isFinished) === 1) return interaction.editReply({ content: "❌ هذا القيفاواي انتهى بالفعل." });
        if (Date.now() > Number(giveaway.endsAt)) return interaction.editReply({ content: "⏰ لقد انتهى وقت المشاركة!" });

        // التحقق من المشاركة والإضافة أو الحذف
        const entryRes = await db.query(`SELECT * FROM giveaway_entries WHERE "giveawayID" = $1 AND "userID" = $2`, [messageID, userID]).catch(()=>({rows:[]}));
        const isParticipating = entryRes.rows.length > 0;
        
        let replyMessage = "";

        if (isParticipating) {
            await db.query(`DELETE FROM giveaway_entries WHERE "giveawayID" = $1 AND "userID" = $2`, [messageID, userID]).catch(()=>{});
            replyMessage = "✅ تـم الـغـاء الـمـشاركـة";
        } else {
            const weight = await getUserWeight(interaction.member, db);
            await db.query(`INSERT INTO giveaway_entries ("giveawayID", "userID", "weight") VALUES ($1, $2, $3)`, [messageID, userID, weight]).catch(()=>{});
            replyMessage = `✅ تـمـت الـمـشاركـة بنـجـاح! (وزنك: **${weight}**)`;
        }

        // تحديث العداد في الرسالة
        const countRes = await db.query(`SELECT COUNT(*) as count FROM giveaway_entries WHERE "giveawayID" = $1`, [messageID]).catch(()=>({rows:[{count:0}]}));
        const totalParticipants = Number(countRes.rows[0].count);

        const embed = EmbedBuilder.from(interaction.message.embeds[0]);
        if (embed.data.description) {
            const newDesc = embed.data.description.replace(/✶ عـدد الـمـشاركـيـن: \d+/g, `✶ عـدد الـمـشاركـيـن: ${totalParticipants}`);
            embed.setDescription(newDesc);
        }

        const oldButton = interaction.message.components[0].components[0];
        const newButton = ButtonBuilder.from(oldButton).setLabel(`مشاركة (${totalParticipants})`);
        const newRow = new ActionRowBuilder().addComponents(newButton);
        
        await interaction.message.edit({ embeds: [embed], components: [newRow] }).catch(()=>{});

        return interaction.editReply({ content: replyMessage });
    } catch (err) {
        return interaction.editReply({ content: "❌ حدث خطأ، يرجى المحاولة لاحقاً." }).catch(()=>{});
    }
}

async function endGiveaway(client, messageID, force = false) {
    try {
        const db = client.sql; 
        if (!db) return;

        const gwRes = await db.query(`SELECT * FROM active_giveaways WHERE "messageID" = $1`, [messageID]).catch(()=>({rows:[]}));
        const giveaway = gwRes.rows[0];

        if (!giveaway) return;

        const endsAt = Number(giveaway.endsAt);
        const isFinished = Number(giveaway.isFinished);

        if (!force && endsAt > Date.now() && isFinished === 0) {
            const timeLeft = endsAt - Date.now();
            setTimeout(() => endGiveaway(client, messageID), Math.min(timeLeft, 2147483647));
            return;
        }

        if (!force && isFinished === 1) return;

        await db.query(`UPDATE active_giveaways SET "isFinished" = 1 WHERE "messageID" = $1`, [messageID]).catch(()=>{});

        const entriesRes = await db.query(`SELECT "userID", "weight" FROM giveaway_entries WHERE "giveawayID" = $1`, [messageID]).catch(()=>({rows:[]}));
        const entries = entriesRes.rows;

        let channel;
        try {
            const guild = await client.guilds.fetch(giveaway.guildID);
            channel = await guild.channels.fetch(giveaway.channelID);
        } catch (e) { return; } 

        const originalMessage = await channel.messages.fetch(messageID).catch(() => null);

        if (entries.length === 0) {
            if (originalMessage) {
                const originalEmbed = originalMessage.embeds[0];
                const newEmbed = new EmbedBuilder(originalEmbed.toJSON()); 
                newEmbed.setTitle(`[انـتـهـى] ✥ قـيـفـاواي عـلـى:`).setColor(Colors.Red);
                newEmbed.setDescription(`**${giveaway.prize}**\n\n✦ الـفـائـز: لا يوجد\n✶ عـدد الـمـشاركـيـن: 0`);
                
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
            for (let i = 0; i < (Number(entry.weight) || 1); i++) pool.push(entry.userID);
        }

        for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pool[i], pool[j]] = [pool[j], pool[i]];
        }

        const winners = new Set();
        const countToWin = Math.min(Number(giveaway.winnerCount), entries.length);
        let attempts = 0;

        while (winners.size < countToWin && attempts < 1000 && pool.length > 0) {
            const randomIndex = Math.floor(Math.random() * pool.length);
            winners.add(pool[randomIndex]);
            attempts++;
        }

        const winnerIDs = Array.from(winners);
        const winnerString = winnerIDs.map(id => `<@${id}>`).join(', ');
        const moraReward = Number(giveaway.moraReward || 0);
        const xpReward = Number(giveaway.xpReward || 0);

        if (moraReward > 0 || xpReward > 0) {
            for (const winnerID of winnerIDs) {
                try {
                    const member = await channel.guild.members.fetch(winnerID).catch(() => null);
                    if (member && addXPAndCheckLevel) {
                        await addXPAndCheckLevel(client, member, db, xpReward, moraReward, false);
                    } else {
                        await db.query(`UPDATE levels SET "mora" = CAST(COALESCE("mora", '0') AS BIGINT) + $1, "xp" = CAST(COALESCE("xp", '0') AS BIGINT) + $2, "totalXP" = CAST(COALESCE("totalXP", '0') AS BIGINT) + $2 WHERE "user" = $3 AND "guild" = $4`, [moraReward, xpReward, winnerID, giveaway.guildID]).catch(()=>{});
                    }
                } catch (err) { }
            }
        }

        const announcementEmbed = new EmbedBuilder().setTitle(`✥ انـتـهى الـقـيفـاواي`).setColor(Colors.DarkGrey);
        const winnerLabel = winnerIDs.length > 1 ? "✦ الـفـائـزون:" : "✦ الـفـائـز:";
        announcementEmbed.setDescription(`${winnerLabel} ${winnerString}\n✦ الـجـائـزة: **${giveaway.prize}**`);

        if (moraReward > 0 || xpReward > 0) {
            announcementEmbed.addFields(
                { name: "✬ اكس بي", value: `${xpReward.toLocaleString()}`, inline: true },
                { name: "✬ مـورا", value: `${moraReward.toLocaleString()}`, inline: true }
            );
        }
        
        await channel.send({ content: `مبروك ${winnerString}! 🎉`, embeds: [announcementEmbed] }).catch(()=>{});

        if (originalMessage) {
            const originalEmbed = originalMessage.embeds[0];
            const newEmbed = new EmbedBuilder(originalEmbed.toJSON()); 
            newEmbed.setTitle(`[انـتـهـى] ✥ قـيـفـاواي عـلـى:`).setColor(Colors.DarkGrey);
            newEmbed.setDescription(`**${giveaway.prize}**\n\n${winnerLabel} ${winnerString}\n✶ عـدد الـمـشاركـيـن: ${entries.length}`);

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

    const gwRes = await db.query(`SELECT * FROM active_giveaways WHERE "messageID" = $1`, [messageID]).catch(()=>({rows:[]}));
    const giveaway = gwRes.rows[0];
    
    if (!giveaway) return interaction.editReply({ content: "❌ لم يتم العثور على قيف اواي بهذا الآيدي." });
    if (Number(giveaway.isFinished) === 0) return interaction.editReply({ content: "⚠️ هذا القيف اواي لا يزال جارياً!" });

    const entriesRes = await db.query(`SELECT "userID", "weight" FROM giveaway_entries WHERE "giveawayID" = $1`, [messageID]).catch(()=>({rows:[]}));
    const entries = entriesRes.rows;
    
    if (entries.length === 0) return interaction.editReply({ content: "❌ لا يوجد مشاركين لعمل سحب عليهم." });

    const pool = [];
    for (const entry of entries) {
        for (let i = 0; i < (Number(entry.weight) || 1); i++) pool.push(entry.userID);
    }
    const winner = pool[Math.floor(Math.random() * pool.length)];
    await interaction.editReply(`🎉 **الري-رول الجديد!** الفائز هو: <@${winner}>! 🥳`);
}

async function createRandomDropGiveaway(client, guild) {
    try {
        const db = client.sql; 
        if (!db) return false;

        const settingsRes = await db.query(`SELECT * FROM settings WHERE "guild" = $1`, [guild.id]).catch(()=>({rows:[]}));
        const settings = settingsRes.rows[0];

        if (!settings || !settings.dropGiveawayChannelID) return false;
        
        const channel = guild.channels.cache.get(settings.dropGiveawayChannelID);
        if (!channel) return false;

        const moraReward = Math.floor(Math.random() * 3001) + 500; 
        const xpReward = Math.floor(Math.random() * 1201) + 300;     
        
        const winnerCount = Math.floor(Math.random() * 3) + 1;        
        const durationMs = 5 * 60 * 1000; 
        const endsAt = Date.now() + durationMs;
        const prize = `جوائز عشوائية`;

        const embed = new EmbedBuilder()
            .setTitle("🎉 **GIVEAWAY DROP** 🎉")
            .setDescription(`**${prize}**\n\n✶ عـدد الـمـشاركـيـن: 0\n✶ ينتـهـى بعـد: <t:${Math.floor(endsAt / 1000)}:R>\n\nاضغط على الزر بالأسفل للمشاركة! ⤵️`)
            .setColor(settings.dropColor || "Gold")
            .setImage("https://i.postimg.cc/mgffs90m/giv.png")  
            .setTimestamp(endsAt)
            .addFields(
                { name: "✬ اكس بي", value: `${xpReward.toLocaleString()}`, inline: true },
                { name: "✬ مـورا", value: `${moraReward.toLocaleString()}`, inline: true }
            );

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('g_enter').setLabel("مشاركة (0)").setStyle(ButtonStyle.Primary).setEmoji("🎉")
        );

        const message = await channel.send({ content: "✥ **قيـفاواي سـريـع!** ✨", embeds: [embed], components: [row] }).catch(() => null);
        if (!message) return false;

        await db.query(`
            INSERT INTO active_giveaways ("messageID", "guildID", "channelID", "prize", "endsAt", "winnerCount", "xpReward", "moraReward", "isFinished") 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0)
        `, [message.id, guild.id, channel.id, prize, endsAt, winnerCount, xpReward, moraReward]).catch(()=>{});

        setTimeout(() => { endGiveaway(client, message.id); }, Math.min(durationMs, 2147483647)); 
        return true; 
    } catch (e) {
        return false;
    }
}

async function initGiveaways(client) {
    const db = client.sql; 
    if (!db) return;

    try {
        const activeGiveawaysRes = await db.query(`SELECT * FROM active_giveaways WHERE "isFinished" = 0`).catch(()=>({rows:[]}));
        const activeGiveaways = activeGiveawaysRes.rows;

        for (const giveaway of activeGiveaways) {
            const messageID = giveaway.messageID;
            const endsAt = Number(giveaway.endsAt);
            const timeLeft = endsAt - Date.now();

            if (timeLeft <= 0) {
                endGiveaway(client, messageID);
            } else {
                setTimeout(() => { endGiveaway(client, messageID); }, Math.min(timeLeft, 2147483647));
            }
        }
    } catch (e) {}
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
