const { EmbedBuilder } = require('discord.js');
const { getRandomImage } = require('../utils'); 
const { EMOJI_MORA, EMOJI_XP, EMOJI_BUFF, EMOJI_NERF, WIN_IMAGES, LOSE_IMAGES } = require('../constants'); 

let updateGuildStat, addXPAndCheckLevel;
try { 
    ({ updateGuildStat } = require('../../guild-board-handler.js'));
    ({ addXPAndCheckLevel } = require('../../handler-utils.js')); 
} catch (e) {
    try {
        ({ updateGuildStat } = require('../../../handlers/guild-board-handler.js'));
        ({ addXPAndCheckLevel } = require('../../../handlers/handler-utils.js'));
    } catch(err) {}
}

async function sendEndMessage(mainChannel, thread, activePlayers, retreatedPlayers, floor, status, sql, guildId, hostId, activeDungeonRequests, client) {
    if (!sql) return;
    
    let title = "", color = "", randomImage = null;

    if (status === 'win') { 
        title = "❖ أسطـورة الدانـجون !"; 
        color = `#${Math.floor(Math.random() * 16777215).toString(16)}`; 
        randomImage = getRandomImage(WIN_IMAGES); 
    } 
    else if (status === 'retreat' || status === 'camp') { 
        title = "❖ انـسـحـاب تـكـتيـكـي !"; 
        color = "#FFFF00"; 
        randomImage = getRandomImage(WIN_IMAGES); 
    } 
    else { 
        title = "❖ هزيمـة ساحقـة ..."; 
        color = "#FF0000"; 
        randomImage = getRandomImage(LOSE_IMAGES); 
    }

    const allParticipants = [...activePlayers, ...retreatedPlayers];
    
    let mvpPlayer = allParticipants.length > 0 ? allParticipants.reduce((p, c) => ((p.totalDamage || 0) > (c.totalDamage || 0)) ? p : c) : null;
    if (mvpPlayer && (mvpPlayer.totalDamage || 0) === 0) mvpPlayer = null; 
    
    const repMilestones = {
        20: 1, 30: 1, 35: 1, 40: 1, 45: 1, 50: 1,
        55: 2, 60: 2, 65: 3, 70: 3, 75: 4, 
        80: 5, 85: 5, 90: 5, 95: 5, 100: 5
    };

    let sessionStartFloor = 1;
    if (activeDungeonRequests && activeDungeonRequests.has(hostId)) {
        const sessionData = activeDungeonRequests.get(hostId);
        if (sessionData && sessionData.startFloor) sessionStartFloor = sessionData.startFloor;
    }

    let lootString = "";
    for (const p of allParticipants) {
        let finalMora = 0;
        let finalXp = 0;

        if (p.rewardsClaimed) {
            finalMora = p.finalMora || 0;
            finalXp = p.finalXp || 0;
        } else {
            if (status === 'lose' && floor > 20) {
                finalMora = 1000;
                finalXp = 100;
            } else {
                finalMora = Math.floor(p.loot?.mora || 0);
                finalXp = Math.floor(p.loot?.xp || 0);
                if (p.isDead) { finalMora = Math.floor(finalMora * 0.5); finalXp = Math.floor(finalXp * 0.5); }
            }
            
            try {
                const guildObj = client.guilds.cache.get(guildId);
                const member = await guildObj.members.fetch(p.id).catch(()=>null);
                if (member && addXPAndCheckLevel) {
                    await addXPAndCheckLevel(client, member, sql, finalXp, finalMora, false);
                } else {
                    await sql.query(`UPDATE levels SET "mora" = CAST(COALESCE("mora", '0') AS BIGINT) + $1, "xp" = CAST(COALESCE("xp", '0') AS BIGINT) + $2, "totalXP" = CAST(COALESCE("totalXP", '0') AS BIGINT) + $2 WHERE "user" = $3 AND "guild" = $4`, [finalMora, finalXp, p.id, guildId]).catch(()=>{});
                }
            } catch(e) {}
        }

        let effectiveEndFloor = floor;
        if (status === 'lose') effectiveEndFloor = Math.max(1, floor - 1); 
        else if (p.retreatFloor) effectiveEndFloor = p.retreatFloor; 
        else if (p.isDead && p.deathFloor) effectiveEndFloor = p.deathFloor; 

        let repReward = 0;
        let earnedChests = 0; 

        for (let f = sessionStartFloor; f <= effectiveEndFloor; f++) {
            if (repMilestones[f]) repReward += repMilestones[f];
            // 🔥 كل 10 طوابق مكافأة صندوق 🔥
            if (f % 10 === 0) earnedChests++;
        }

        // 🛡️ نظام الحفظ الفولاذي لنقاط السمعة 🛡️
        if (repReward > 0) {
            let hasRepRecord = false;
            let currentRep = 0;
            try {
                const checkRep = await sql.query(`SELECT "rep_points" FROM user_reputation WHERE "userID" = $1 AND "guildID" = $2`, [p.id, guildId]).catch(()=> sql.query(`SELECT rep_points FROM user_reputation WHERE userid = $1 AND guildid = $2`, [p.id, guildId]));
                if (checkRep && checkRep.rows && checkRep.rows.length > 0) {
                    hasRepRecord = true;
                    currentRep = Number(checkRep.rows[0].rep_points || checkRep.rows[0].rep_Points || 0);
                }
            } catch(e){}

            const newRep = currentRep + repReward;
            if (hasRepRecord) {
                await sql.query(`UPDATE user_reputation SET "rep_points" = $1 WHERE "userID" = $2 AND "guildID" = $3`, [newRep, p.id, guildId]).catch(()=> sql.query(`UPDATE user_reputation SET rep_points = $1 WHERE userid = $2 AND guildid = $3`, [newRep, p.id, guildId]).catch(()=>{}));
            } else {
                await sql.query(`INSERT INTO user_reputation ("userID", "guildID", "rep_points") VALUES ($1, $2, $3)`, [p.id, guildId, newRep]).catch(()=> sql.query(`INSERT INTO user_reputation (userid, guildid, rep_points) VALUES ($1, $2, $3)`, [p.id, guildId, newRep]).catch(()=>{}));
            }
        }

        // 🛡️ نظام الحفظ الفولاذي للصناديق (Gacha Chests) 🛡️
        if (earnedChests > 0) {
            let hasInvRecord = false;
            let currentQty = 0;
            let invRowId = null;
            try {
                const checkInv = await sql.query(`SELECT "id", "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = 'gacha_chest'`, [p.id, guildId]).catch(()=> sql.query(`SELECT id, quantity FROM user_inventory WHERE userid = $1 AND guildid = $2 AND itemid = 'gacha_chest'`, [p.id, guildId]));
                if (checkInv && checkInv.rows && checkInv.rows.length > 0) {
                    hasInvRecord = true;
                    currentQty = Number(checkInv.rows[0].quantity || checkInv.rows[0].Quantity || 0);
                    invRowId = checkInv.rows[0].id || checkInv.rows[0].ID;
                }
            } catch(e){}

            const newQty = Math.min(currentQty + earnedChests, 999);

            if (hasInvRecord) {
                await sql.query(`UPDATE user_inventory SET "quantity" = $1 WHERE "id" = $2`, [newQty, invRowId]).catch(()=> sql.query(`UPDATE user_inventory SET quantity = $1 WHERE id = $2`, [newQty, invRowId]).catch(()=>{}));
            } else {
                await sql.query(`INSERT INTO user_inventory ("guildID", "userID", "itemID", "quantity") VALUES ($1, $2, 'gacha_chest', $3)`, [guildId, p.id, newQty]).catch(()=> sql.query(`INSERT INTO user_inventory (guildid, userid, itemid, quantity) VALUES ($1, $2, 'gacha_chest', $3)`, [guildId, p.id, newQty]).catch(()=>{}));
            }
        }

        if (updateGuildStat && client) {
            await updateGuildStat(client, guildId, p.id, 'max_dungeon_floor', effectiveEndFloor).catch(()=>{});
        }
        
        let statusEmoji = p.isDead ? `💀 ${p.deathFloor ? `(مات في ${p.deathFloor})` : ""}` : p.retreatFloor ? `🏃‍♂️ (انسحب في ${p.retreatFloor})` : status === 'camp' ? "⛺ (مخيم)" : "✅";
        let repString = repReward > 0 ? ` | 🌟 سمعة: **${repReward}**` : "";
        let chestString = earnedChests > 0 ? ` | 🎁 صناديق: **${earnedChests}**` : "";
        
        lootString += `✬ <@${p.id}> ${statusEmoji}: ${finalMora.toLocaleString()} ${EMOJI_MORA} | ${finalXp.toLocaleString()} XP${repString}${chestString}\n`;
    }

    let description = `**الطابق:** ${floor}\n\n**✶ تقـريـر المعـركـة:**\nنجم المعركة: ${mvpPlayer ? `<@${mvpPlayer.id}>` : 'لا يوجد'}\n\n${lootString}`;

    if (status === 'camp') description += `\n**🏕️ تـم نصـب خيمـة وحفـظ التقـدم عنـد الطابـق ${floor + 1}**`;

    if (floor >= 10 && mvpPlayer && status !== 'camp') {
        let extraRewardText = "";
        if (mvpPlayer.totalDamage > 10000) {
            extraRewardText = " + 500 مـورا";
            try {
                const guildObj = client.guilds.cache.get(guildId);
                const mvpMem = await guildObj.members.fetch(mvpPlayer.id).catch(()=>null);
                if (mvpMem && addXPAndCheckLevel) {
                    await addXPAndCheckLevel(client, mvpMem, sql, 0, 500, false);
                } else {
                    await sql.query(`UPDATE levels SET "mora" = CAST(COALESCE("mora", '0') AS BIGINT) + 500 WHERE "user" = $1 AND "guild" = $2`, [mvpPlayer.id, guildId]).catch(()=>{});
                }
            } catch(e) {}
        }
        description += `\n\n<a:mTrophy:1438797228826300518> **نجـم المعركـة:**\n✶ <@${mvpPlayer.id}> (الـضـرر: ${mvpPlayer.totalDamage.toLocaleString()})\nحـصـل عـلى تعـزيـز 15% مورا واكس بي لـ 15د${extraRewardText} <a:buff:1438796257522094081>`;
    }

    if (floor >= 10 && status === 'lose') {
        description += `\n\n**💀 لعنـة الهزيمـة:**\nأصابت اللعنة جميع المشاركين! (-15% مورا واكس بي لـ 15د) ${EMOJI_NERF}`;
        const debuffDuration = 15 * 60 * 1000;
        const expiresAt = Date.now() + debuffDuration;
        
        for (const p of allParticipants) {
            try {
                await sql.query(`INSERT INTO user_buffs ("guildID", "userID", "buffPercent", "expiresAt", "buffType", "multiplier") VALUES ($1, $2, $3, $4, $5, $6)`, [guildId, p.id, -15, expiresAt, 'mora', -0.15]);
                await sql.query(`INSERT INTO user_buffs ("guildID", "userID", "buffPercent", "expiresAt", "buffType", "multiplier") VALUES ($1, $2, $3, $4, $5, $6)`, [guildId, p.id, -15, expiresAt, 'xp', -0.15]);
            } catch(e1) {
                try {
                    await sql.query(`INSERT INTO user_buffs (guildid, userid, buffpercent, expiresat, bufftype, multiplier) VALUES ($1, $2, $3, $4, $5, $6)`, [guildId, p.id, -15, expiresAt, 'mora', -0.15]);
                    await sql.query(`INSERT INTO user_buffs (guildid, userid, buffpercent, expiresat, bufftype, multiplier) VALUES ($1, $2, $3, $4, $5, $6)`, [guildId, p.id, -15, expiresAt, 'xp', -0.15]);
                } catch(e2) {}
            }
        }
    }

    if (floor >= 10 && status !== 'lose' && status !== 'camp' && mvpPlayer) {
        const buffDuration = 15 * 60 * 1000; 
        const expiresAt = Date.now() + buffDuration;
        try {
            await sql.query(`INSERT INTO user_buffs ("guildID", "userID", "buffPercent", "expiresAt", "buffType", "multiplier") VALUES ($1, $2, $3, $4, $5, $6)`, [guildId, mvpPlayer.id, 15, expiresAt, 'mora', 0.15]);
            await sql.query(`INSERT INTO user_buffs ("guildID", "userID", "buffPercent", "expiresAt", "buffType", "multiplier") VALUES ($1, $2, $3, $4, $5, $6)`, [guildId, mvpPlayer.id, 15, expiresAt, 'xp', 0.15]);
        } catch(e1) {
            try {
                await sql.query(`INSERT INTO user_buffs (guildid, userid, buffpercent, expiresat, bufftype, multiplier) VALUES ($1, $2, $3, $4, $5, $6)`, [guildId, mvpPlayer.id, 15, expiresAt, 'mora', 0.15]);
                await sql.query(`INSERT INTO user_buffs (guildid, userid, buffpercent, expiresat, bufftype, multiplier) VALUES ($1, $2, $3, $4, $5, $6)`, [guildId, mvpPlayer.id, 15, expiresAt, 'xp', 0.15]);
            } catch(e2) {}
        }
    }

    const embed = new EmbedBuilder().setTitle(title).setDescription(description).setColor(color).setImage(randomImage).setTimestamp();
    await mainChannel.send({ content: allParticipants.map(p => `<@${p.id}>`).join(' '), embeds: [embed] }).catch(()=>{});
    
    if (activeDungeonRequests && activeDungeonRequests.has(hostId)) activeDungeonRequests.delete(hostId);
    
    try {
        if (status === 'camp') await thread.send({ content: `**⛺ تم حفظ التقدم وإغلاق البوابة مؤقتاً. نراكم قريباً!**` });
        else await thread.send({ content: `**✶ انتهت الرحلة، سيتم إغلاق البوابة غـادروا بسرعة <:emoji_69:1451172248173023263> ...**` });
        setTimeout(() => { thread.delete().catch(()=>{}); }, 10000); 
    } catch(e) { }
}

module.exports = { sendEndMessage };
