const { EmbedBuilder, Colors } = require('discord.js');
const { getRandomImage } = require('../utils'); 
const { EMOJI_MORA, EMOJI_XP, EMOJI_BUFF, EMOJI_NERF, WIN_IMAGES, LOSE_IMAGES } = require('../constants'); 
const { safeUpdateRepAndChests } = require('./rewards');

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
            if (p.pendingWipeSave || p.pendingRetreatSave) {
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
            }
            
            try {
                const guildObj = client.guilds.cache.get(guildId);
                const member = guildObj ? await guildObj.members.fetch(p.id).catch(()=>null) : null;
                
                if (member && addXPAndCheckLevel) {
                    await addXPAndCheckLevel(client, member, sql, finalXp, finalMora, false);
                } else {
                    try {
                        await sql.query(`UPDATE levels SET "mora" = CAST(COALESCE("mora", '0') AS BIGINT) + $1, "xp" = CAST(COALESCE("xp", '0') AS BIGINT) + $2, "totalXP" = CAST(COALESCE("totalXP", '0') AS BIGINT) + $3 WHERE "user" = $4 AND "guild" = $5`, [finalMora, finalXp, finalXp, p.id, guildId]);
                    } catch(e) {
                        await sql.query(`UPDATE levels SET mora = CAST(COALESCE(mora, '0') AS BIGINT) + $1, xp = CAST(COALESCE(xp, '0') AS BIGINT) + $2, totalxp = CAST(COALESCE(totalxp, '0') AS BIGINT) + $3 WHERE userid = $4 AND guildid = $5`, [finalMora, finalXp, finalXp, p.id, guildId]).catch(()=>{});
                    }

                    if (client && typeof client.getLevel === 'function') {
                        let cache = await client.getLevel(p.id, guildId);
                        if (cache) {
                            cache.mora = String(BigInt(cache.mora || 0) + BigInt(finalMora));
                            cache.xp = String(BigInt(cache.xp || 0) + BigInt(finalXp));
                            cache.totalXP = String(BigInt(cache.totalXP || cache.totalxp || 0) + BigInt(finalXp));
                            if (typeof client.setLevel === 'function') await client.setLevel(cache);
                        }
                    }
                }
            } catch(e) {}
            
            p.rewardsClaimed = true;
        }

        let effectiveEndFloor = floor;
        if (p.pendingWipeSave) effectiveEndFloor = p.deathFloor || Math.max(1, floor - 1);
        else if (status === 'lose') effectiveEndFloor = Math.max(1, floor - 1); 
        else if (p.retreatFloor) effectiveEndFloor = p.retreatFloor; 
        else if (p.isDead && p.deathFloor) effectiveEndFloor = p.deathFloor; 

        let sessionRep = 0;
        let sessionChests = 0;
        let displayRep = 0;
        let displayChests = 0;

        for (let f = 1; f <= effectiveEndFloor; f++) {
            if (repMilestones[f]) displayRep += repMilestones[f];
            if (f % 10 === 0) displayChests++;

            if (f >= sessionStartFloor) {
                if (repMilestones[f]) sessionRep += repMilestones[f];
                if (f % 10 === 0) sessionChests++;
            }
        }

        // 🔥 تم دمج الصناديق لتضاف رسمياً للغاتشا 🔥
        if (!p.repAndChestsClaimed && (sessionRep > 0 || sessionChests > 0)) {
            await safeUpdateRepAndChests(sql, p.id, guildId, sessionRep, sessionChests);
            
            // 🎁 تم تغيير free_gacha_chest إلى gacha_chest لضمان عدم ضياع الصناديق مع التجديد اليومي
            if (sessionChests > 0) {
                try {
                    let invRes = await sql.query(`SELECT "id", "ID" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND LOWER("itemID") = 'gacha_chest'`, [p.id, guildId]).catch(()=>({rows:[]}));
                    if (!invRes.rows || invRes.rows.length === 0) {
                        invRes = await sql.query(`SELECT id, ID FROM user_inventory WHERE userid = $1 AND guildid = $2 AND LOWER(itemid) = 'gacha_chest'`, [p.id, guildId]).catch(()=>({rows:[]}));
                    }
                    
                    if (invRes.rows && invRes.rows.length > 0) {
                        const rowId = invRes.rows[0].id || invRes.rows[0].ID;
                        await sql.query(`UPDATE user_inventory SET "quantity" = CAST(COALESCE("quantity", '0') AS INTEGER) + $1 WHERE "id" = $2`, [sessionChests, rowId])
                        .catch(() => sql.query(`UPDATE user_inventory SET quantity = CAST(COALESCE(quantity, '0') AS INTEGER) + $1 WHERE id = $2`, [sessionChests, rowId]).catch(()=>{}));
                    } else {
                        await sql.query(`INSERT INTO user_inventory ("guildID", "userID", "itemID", "quantity") VALUES ($1, $2, 'gacha_chest', $3)`, [guildId, p.id, sessionChests])
                        .catch(() => sql.query(`INSERT INTO user_inventory (guildid, userid, itemid, quantity) VALUES ($1, $2, 'gacha_chest', $3)`, [guildId, p.id, sessionChests]).catch(()=>{}));
                    }
                } catch(e) { console.error("Error adding gacha chests", e); }
            }

            p.repAndChestsClaimed = true;
        }

        if (updateGuildStat && client) {
            await updateGuildStat(client, guildId, p.id, 'max_dungeon_floor', effectiveEndFloor).catch(()=>{});
        }
        
        let statusEmoji = p.isDead ? `💀 ${p.deathFloor ? `(مات في ${p.deathFloor})` : ""}` : p.retreatFloor ? `🏃‍♂️ (انسحب في ${p.retreatFloor})` : status === 'camp' ? "⛺ (مخيم)" : "✅";
        
        let repString = displayRep > 0 ? ` | 🌟 سمعة: **${displayRep}**` : "";
        let chestString = displayChests > 0 ? ` | 🎁 صناديق: **${displayChests}**` : "";
        
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
                const mvpMem = guildObj ? await guildObj.members.fetch(mvpPlayer.id).catch(()=>null) : null;
                if (mvpMem && addXPAndCheckLevel) {
                    await addXPAndCheckLevel(client, mvpMem, sql, 0, 500, false);
                } else {
                    try {
                        await sql.query(`UPDATE levels SET "mora" = CAST(COALESCE("mora", '0') AS BIGINT) + 500 WHERE "user" = $1 AND "guild" = $2`, [mvpPlayer.id, guildId]);
                    } catch (e) {
                        await sql.query(`UPDATE levels SET mora = CAST(COALESCE(mora, '0') AS BIGINT) + 500 WHERE userid = $1 AND guildid = $2`, [mvpPlayer.id, guildId]).catch(()=>{});
                    }

                    if (client && typeof client.getLevel === 'function') {
                        let cache = await client.getLevel(mvpPlayer.id, guildId);
                        if (cache) {
                            cache.mora = String(BigInt(cache.mora || 0) + 500n);
                            if (typeof client.setLevel === 'function') await client.setLevel(cache);
                        }
                    }
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
