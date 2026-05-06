const { EmbedBuilder } = require("discord.js");

function recalculateLevelFromTotalXP(totalXP) {
    let level = 1;
    let xp = totalXP;
    let xpNeeded = 5 * (level ** 2) + (50 * level) + 100;

    while (xp >= xpNeeded) {
        xp -= xpNeeded;
        level++;
        xpNeeded = 5 * (level ** 2) + (50 * level) + 100;
    }

    return { level, xp };
}

async function checkLevelUp(client, levelData, guild, channel, winnerID, oldLevel) {
    let nextXP = 5 * (levelData.level ** 2) + (50 * levelData.level) + 100;
    while (levelData.xp >= nextXP) {
        levelData.level++;
        levelData.xp -= nextXP;
        nextXP = 5 * (levelData.level ** 2) + (50 * levelData.level) + 100;
    }

    if (levelData.level > oldLevel) {
        try {
            const member = await guild.members.fetch(winnerID);
            const fakeInteraction = { guild: guild, channel: channel, members: { me: guild.members.me } };
            await client.sendLevelUpMessage(fakeInteraction, member, levelData.level, oldLevel, levelData);
        } catch (lvlErr) {
            console.error(`[Reroll LevelUp] فشل في إرسال رسالة الترقية: ${lvlErr.message}`);
        }
    }
}

async function handleReroll(i, client, db) {
    await i.deferReply({ ephemeral: true });

    const messageID = i.values[0];
    const guild = i.guild;

    const giveawayDataRes = await db.query("SELECT * FROM active_giveaways WHERE messageid = $1", [messageID]);
    const giveawayData = giveawayDataRes.rows[0];

    if (!giveawayData || giveawayData.isfinished === 0) {
        return i.editReply("❌ هذا القيفاواي غير منتهي أو لم يعد موجوداً.");
    }

    let originalChannel;
    let originalMessage;
    try {
        originalChannel = await client.channels.fetch(giveawayData.channelid);
        originalMessage = await originalChannel.messages.fetch(messageID);
    } catch (err) {
        return i.editReply("❌ لم أتمكن من العثور على القناة الأصلية أو الرسالة الأصلية للقيفاواي.");
    }

    const originalEmbed = originalMessage.embeds[0];

    const oldWinnerRegex = /<@!?(\d+)>/g;
    const winnerLineRegex = /\n\n\*\*الـفـائـز(ون)?:\*\* (.*)/i;
    const winnerLineMatch = originalEmbed.description.match(winnerLineRegex);

    let specificOldWinnerIDs = [];
    if (winnerLineMatch && winnerLineMatch[2]) {
         const winnerMentions = winnerLineMatch[2].match(oldWinnerRegex);
         if (winnerMentions) {
            specificOldWinnerIDs = winnerMentions.map(m => m.replace(/<@!?|>/g, ''));
         }
    }

    const moraReward = giveawayData.morareward || 0;
    const xpReward = giveawayData.xpreward || 0;
    const prize = giveawayData.prize;

    if ((moraReward > 0 || xpReward > 0) && specificOldWinnerIDs.length > 0) {
        for (const oldWinnerID of specificOldWinnerIDs) {
            try {
                const levelDataRes = await db.query("SELECT * FROM levels WHERE userid = $1 AND guildid = $2", [oldWinnerID, guild.id]);
                let levelData = levelDataRes.rows[0];
                
                if (levelData) {
                    levelData.mora = (levelData.mora || 0) - moraReward;
                    if (levelData.mora < 0) levelData.mora = 0;

                    levelData.totalxp = (levelData.totalxp || 0) - xpReward;
                    if (levelData.totalxp < 0) levelData.totalxp = 0;

                    const { level: newLevel, xp: newXP } = recalculateLevelFromTotalXP(levelData.totalxp);
                    levelData.level = newLevel;
                    levelData.xp = newXP;

                    await db.query("UPDATE levels SET mora = $1, totalxp = $2, level = $3, xp = $4 WHERE userid = $5 AND guildid = $6", [levelData.mora, levelData.totalxp, levelData.level, levelData.xp, oldWinnerID, guild.id]);
                    console.log(`[Reroll] تم سحب ${moraReward} مورا و ${xpReward} اكس بي من ${oldWinnerID}. المستوى الجديد: ${newLevel}, الاكس بي الجديد: ${newXP}`);
                }
            } catch (err) {
                console.error(`[Reroll] فشل في سحب الجوائز من ${oldWinnerID}:`, err);
            }
        }
    }

    const allEntriesRes = await db.query("SELECT * FROM giveaway_entries WHERE giveawayid = $1", [messageID]);
    const allEntries = allEntriesRes.rows;

    if (!allEntries || allEntries.length === 0) {
        return i.editReply("❌ لا يوجد أي مشاركين في قاعدة البيانات لهذا القيفاواي.");
    }

    const eligibleEntries = allEntries.filter(entry => !specificOldWinnerIDs.includes(entry.userid));
    if (eligibleEntries.length === 0) {
        return i.editReply("❌ كل المشاركين قد فازوا بالفعل، لا يمكن اختيار فائز جديد.");
    }

    const pool = [];
    for (const entry of eligibleEntries) {
        for (let j = 0; j < entry.weight; j++) {
            pool.push(entry.userid);
        }
    }

    const winners = new Set();
    let attempts = 0;
    const winnerCount = giveawayData.winnercount; 

    while (winners.size < winnerCount && winners.size < eligibleEntries.length && attempts < 50) {
        const randomWinnerID = pool[Math.floor(Math.random() * pool.length)];
        winners.add(randomWinnerID);
        attempts++;
    }

    const newWinnerIDs = Array.from(winners);
    const newWinnerString = newWinnerIDs.map(id => `<@${id}>`).join(', ');

    if (moraReward > 0 || xpReward > 0) {
        for (const newWinnerID of newWinnerIDs) {
            try {
                const levelDataRes = await db.query("SELECT * FROM levels WHERE userid = $1 AND guildid = $2", [newWinnerID, guild.id]);
                let levelData = levelDataRes.rows[0];
                
                if (!levelData) {
                    levelData = { userid: newWinnerID, guildid: guild.id, xp: 0, totalxp: 0, level: 0, mora: 0 };
                    await db.query("INSERT INTO levels (userid, guildid, xp, totalxp, level, mora) VALUES ($1, $2, $3, $4, $5, $6)", [newWinnerID, guild.id, 0, 0, 0, 0]);
                }
                const oldLevel = levelData.level;

                levelData.mora = (levelData.mora || 0) + moraReward;
                levelData.xp = (levelData.xp || 0) + xpReward;
                levelData.totalxp = (levelData.totalxp || 0) + xpReward;

                await checkLevelUp(client, levelData, guild, originalChannel, newWinnerID, oldLevel);

                await db.query("UPDATE levels SET mora = $1, xp = $2, totalxp = $3, level = $4 WHERE userid = $5 AND guildid = $6", [levelData.mora, levelData.xp, levelData.totalxp, levelData.level, newWinnerID, guild.id]);
                console.log(`[Reroll] تم منح ${moraReward} مورا و ${xpReward} اكس بي للفائز الجديد ${newWinnerID}`);
            } catch (err) {
                console.error(`[Reroll] فشل في منح الجوائز للفائز الجديد ${newWinnerID}:`, err);
            }
        }
    }

    const announcementEmbed = new EmbedBuilder()
        .setTitle(`✥ انـتـهى الـقـيفـاواي (Reroll) ✥`)
        .setColor("DarkGrey");

    const winnerLabel = giveawayData.winnercount > 1 ? "الـفـائـزون:" : "الـفـائـز:";
    let winDescription = `✦ ${winnerLabel} ${newWinnerString}\n✦ الـجـائـزة: **${prize}**`;

    const fields = [];
    if (moraReward > 0) {
        fields.push({ name: '✦ مـورا', value: `${moraReward} <:mora:1435647151349698621>`, inline: true });
    }
    if (xpReward > 0) {
        fields.push({ name: '✬ اكس بي', value: `${xpReward} <a:levelup:1437805366048985290>`, inline: true });
    }

    if (fields.length > 0) {
        announcementEmbed.setFields(fields);
    }
    announcementEmbed.setDescription(winDescription);

    await originalChannel.send({
        content: newWinnerString,
        embeds: [announcementEmbed]
    });

    let newDesc = originalEmbed.description;

    const timeRegex = /✦ ينتهي بعـد: <t:\d+:R>\n?/i;
    newDesc = newDesc.replace(timeRegex, "");

    newDesc = newDesc.replace(winnerLineRegex, "");

    const winnerLabelEmbed = giveawayData.winnercount > 1 ? "الـفـائـزون:" : "الـفـائـز:";
    newDesc += `\n\n**${winnerLabelEmbed}** ${newWinnerString} (Rerolled)`;

    const newEmbed = new EmbedBuilder(originalEmbed.toJSON());

    newEmbed
        .setDescription(newDesc)
        .setFooter({ text: "انتهى (Rerolled)" });

    await originalMessage.edit({ embeds: [newEmbed] });

    await i.editReply("✅ تم عمل الريرول بنجاح.");
}

module.exports = {
    handleReroll
};
