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

const safeQuery = async (db, qPg, params) => {
    try { 
        let res = await db.query(qPg, params); 
        return { rows: Array.isArray(res) ? res : (res?.rows || []) }; 
    } catch(e) { 
        let fallbackQuery = qPg.replace(/"userID"/gi, "userid").replace(/"guildID"/gi, "guildid").replace(/"itemID"/gi, "itemid").replace(/"quantity"/gi, "quantity").replace(/"mora"/gi, "mora").replace(/"bank"/gi, "bank").replace(/"rep_points"/gi, "rep_points").replace(/"user"/gi, "userid").replace(/"guild"/gi, "guildid").replace(/"id"/gi, "id");
        if (fallbackQuery !== qPg) {
            try { 
                let res2 = await db.query(fallbackQuery, params); 
                return { rows: Array.isArray(res2) ? res2 : (res2?.rows || []) }; 
            } catch(e2) { }
        }
        return { rows: [] };
    }
};

const safeExecute = async (db, qPg, params) => {
    try { await db.query(qPg, params); return true; } catch(e) { 
        let fallbackQuery = qPg.replace(/"userID"/gi, "userid").replace(/"guildID"/gi, "guildid").replace(/"itemID"/gi, "itemid").replace(/"quantity"/gi, "quantity").replace(/"mora"/gi, "mora").replace(/"bank"/gi, "bank").replace(/"rep_points"/gi, "rep_points").replace(/"user"/gi, "userid").replace(/"guild"/gi, "guildid").replace(/"id"/gi, "id");
        if (fallbackQuery !== qPg) {
            try { await db.query(fallbackQuery, params); return true; } catch(e2) { return false; }
        }
        return false;
    }
};

// 🔥 دالة الدفع النهائية والمعدلة لتسليم كل الجوائز (الكاش، البنك، الصناديق والسمعة) بأمان تام 🔥
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

    let sessionStartFloor = 1;
    if (activeDungeonRequests && activeDungeonRequests.has(hostId)) {
        const sessionData = activeDungeonRequests.get(hostId);
        if (sessionData && sessionData.startFloor) sessionStartFloor = sessionData.startFloor;
    }

    let lootString = "";
    
    for (const p of allParticipants) {
        let finalMora = 0;
        let finalXp = 0;
        let finalChests = 0;
        let finalRep = 0;

        if (p.rewardsClaimed) {
            finalMora = p.finalMora || 0;
            finalXp = p.finalXp || 0;
            finalChests = p.finalChests || 0;
            finalRep = p.finalRep || 0;
        } else {
            if (p.pendingWipeSave || p.pendingRetreatSave) {
                finalMora = p.finalMora || 0;
                finalXp = p.finalXp || 0;
                finalChests = p.finalChests || 0;
                finalRep = p.finalRep || 0;
            } else {
                if (status === 'lose' && floor > 20) {
                    finalMora = 1000;
                    finalXp = 100;
                    finalChests = 0;
                    finalRep = 0;
                } else {
                    finalMora = Math.floor(p.loot?.mora || 0);
                    finalXp = Math.floor(p.loot?.xp || 0);
                    finalChests = Math.floor(p.loot?.chests || 0);
                    finalRep = Math.floor(p.loot?.rep || 0);
                    
                    if (p.isDead && status === 'lose') { 
                        finalMora = Math.floor(finalMora * 0.5); 
                        finalXp = Math.floor(finalXp * 0.5);
                        finalChests = 0;
                        finalRep = 0;
                    }
                }
            }
            
            // 🔥 الدفع الحقيقي للمورا والاكس بي 🔥
            try {
                const guildObj = client.guilds.cache.get(guildId);
                const member = guildObj ? await guildObj.members.fetch(p.id).catch(()=>null) : null;
                
                if (member && addXPAndCheckLevel) {
                    await addXPAndCheckLevel(client, member, sql, finalXp, finalMora, false);
                } else {
                    await safeExecute(sql, `UPDATE levels SET "mora" = CAST(COALESCE("mora", '0') AS BIGINT) + $1, "xp" = CAST(COALESCE("xp", '0') AS BIGINT) + $2, "totalXP" = CAST(COALESCE("totalXP", '0') AS BIGINT) + $3 WHERE "user" = $4 AND "guild" = $5`, [finalMora, finalXp, finalXp, p.id, guildId]);

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

            // 🔥 الدفع الحقيقي للصناديق والسمعة باستخدام الدالة الآمنة 🔥
            if (finalChests > 0 || finalRep > 0) {
                await safeUpdateRepAndChests(sql, p.id, guildId, finalRep, finalChests);
            }
            
            p.rewardsClaimed = true;
        }

        let effectiveEndFloor = floor;
        if (p.pendingWipeSave) effectiveEndFloor = p.deathFloor || Math.max(1, floor - 1);
        else if (status === 'lose') effectiveEndFloor = Math.max(1, floor - 1); 
        else if (p.retreatFloor) effectiveEndFloor = p.retreatFloor; 
        else if (p.isDead && p.deathFloor) effectiveEndFloor = p.deathFloor; 

        if (updateGuildStat && client) {
            await updateGuildStat(client, guildId, p.id, 'max_dungeon_floor', effectiveEndFloor).catch(()=>{});
        }
        
        let statusEmoji = p.isDead ? `💀 ${p.deathFloor ? `(مات في ${p.deathFloor})` : ""}` : p.retreatFloor ? `🏃‍♂️ (انسحب في ${p.retreatFloor})` : status === 'camp' ? "⛺ (مخيم)" : "✅";
        
        let repString = finalRep > 0 ? ` | ✬ REP: **${finalRep}** 🌟` : "";
        let chestString = finalChests > 0 ? ` | ✬ BOX: **${finalChests}** 🎁` : "";
        
        let pName = p.name ? p.name.replace(/[!.]/g, '') : "مقاتل";
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
                    await safeExecute(sql, `UPDATE levels SET "mora" = CAST(COALESCE("mora", '0') AS BIGINT) + 500 WHERE "user" = $1 AND "guild" = $2`, [mvpPlayer.id, guildId]);
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
            await safeExecute(sql, `DELETE FROM user_buffs WHERE "userID" = $1 AND "guildID" = $2 AND "buffType" = 'mora'`, [p.id, guildId]);
            await safeExecute(sql, `INSERT INTO user_buffs ("guildID", "userID", "buffPercent", "expiresAt", "buffType", "multiplier") VALUES ($1, $2, $3, $4, $5, $6)`, [guildId, p.id, -15, expiresAt, 'mora', -0.15]);
            await safeExecute(sql, `DELETE FROM user_buffs WHERE "userID" = $1 AND "guildID" = $2 AND "buffType" = 'xp'`, [p.id, guildId]);
            await safeExecute(sql, `INSERT INTO user_buffs ("guildID", "userID", "buffPercent", "expiresAt", "buffType", "multiplier") VALUES ($1, $2, $3, $4, $5, $6)`, [guildId, p.id, -15, expiresAt, 'xp', -0.15]);
        }
    }

    if (floor >= 10 && status !== 'lose' && status !== 'camp' && mvpPlayer) {
        const buffDuration = 15 * 60 * 1000;
        const expiresAt = Date.now() + buffDuration;
        await safeExecute(sql, `DELETE FROM user_buffs WHERE "userID" = $1 AND "guildID" = $2 AND "buffType" = 'mora'`, [mvpPlayer.id, guildId]);
        await safeExecute(sql, `INSERT INTO user_buffs ("guildID", "userID", "buffPercent", "expiresAt", "buffType", "multiplier") VALUES ($1, $2, $3, $4, $5, $6)`, [guildId, mvpPlayer.id, 15, expiresAt, 'mora', 0.15]);
        await safeExecute(sql, `DELETE FROM user_buffs WHERE "userID" = $1 AND "guildID" = $2 AND "buffType" = 'xp'`, [mvpPlayer.id, guildId]);
        await safeExecute(sql, `INSERT INTO user_buffs ("guildID", "userID", "buffPercent", "expiresAt", "buffType", "multiplier") VALUES ($1, $2, $3, $4, $5, $6)`, [guildId, mvpPlayer.id, 15, expiresAt, 'xp', 0.15]);
    }

    let reportMsg = "";
    if (status === 'camp') reportMsg = `⛺ تم حفظ التقدم وإغلاق البوابة مؤقتاً.`;
    else reportMsg = `**✶ التقرير النهائي للدانجون...**`;

    const embed = new EmbedBuilder().setTitle(title).setDescription(description).setColor(color).setImage(randomImage).setTimestamp();
    await mainChannel.send({ content: reportMsg, embeds: [embed] }).catch(()=>{});
    
    if (activeDungeonRequests && activeDungeonRequests.has(hostId)) activeDungeonRequests.delete(hostId);
    
    try {
        if (status === 'camp') await thread.send({ content: `**⛺ تم حفظ التقدم وإغلاق البوابة مؤقتاً. نراكم قريباً!**` });
        else await thread.send({ content: `**✶ انتهت الرحلة، سيتم إغلاق البوابة غـادروا بسرعة <:emoji_69:1451172248173023263> ...**` });
        setTimeout(() => { thread.delete().catch(()=>{}); }, 10000); 
    } catch(e) { }
}

module.exports = { sendEndMessage };
