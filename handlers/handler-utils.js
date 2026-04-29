const { EmbedBuilder, PermissionsBitField } = require("discord.js");
let generateLevelUpCard;
try {
    ({ generateLevelUpCard } = require('../generators/levelup-card-generator.js'));
} catch (e) {
    console.error("Error loading levelup-card-generator:", e);
}

function calculateRequiredXP(level) {
    const lvl = Number(level) || 0;
    return Math.floor(5 * (lvl ** 2) + 50 * lvl + 100);
}

async function getFreeBalance(member, db) {
    if (!db) return 0;
    
    let levelDataRes;
    try { levelDataRes = await db.query(`SELECT "mora", "bank" FROM levels WHERE "user" = $1 AND "guild" = $2`, [member.id, member.guild.id]); }
    catch(e) { levelDataRes = await db.query(`SELECT mora, bank FROM levels WHERE userid = $1 AND guildid = $2`, [member.id, member.guild.id]).catch(()=>({rows:[]})); }
    
    const levelData = levelDataRes.rows[0];
    const currentMora = levelData ? (Number(levelData.mora) || 0) : 0;
    const currentBank = levelData ? (Number(levelData.bank) || 0) : 0;
    
    const totalWealth = currentMora + currentBank;

    let loanDataRes;
    try { loanDataRes = await db.query(`SELECT "remainingAmount" FROM user_loans WHERE "userID" = $1 AND "guildID" = $2`, [member.id, member.guild.id]); }
    catch(e) { loanDataRes = await db.query(`SELECT remainingamount as "remainingAmount" FROM user_loans WHERE userid = $1 AND guildid = $2`, [member.id, member.guild.id]).catch(()=>({rows:[]})); }
    
    const loanData = loanDataRes.rows[0];
    const debt = loanData ? Number(loanData.remainingAmount) : 0;

    const freeBalance = totalWealth - debt;
    
    return Math.max(0, freeBalance);
}

async function addXPAndCheckLevel(client, member, db, xpToAdd, moraToAdd = 0, isMessageEvent = false, messageChannel = null) {
    if (!member || !db) return;
    const userId = member.id;
    const guildId = member.guild.id;

    try {
        xpToAdd = Number(xpToAdd) || 0;
        moraToAdd = Number(moraToAdd) || 0;

        // 🔥 [1] إضافة وتصحيح منطق معزز الخبرة (XP Buff) وحذفه عند الانتهاء الفعلي 🔥
        try {
            let buffRes = await db.query(`SELECT "multiplier", "expiresAt" FROM user_buffs WHERE "userID" = $1 AND "guildID" = $2 AND "buffType" = 'xp'`, [userId, guildId])
                .catch(() => db.query(`SELECT multiplier, expiresat as "expiresAt" FROM user_buffs WHERE userid = $1 AND guildid = $2 AND bufftype = 'xp'`, [userId, guildId]).catch(()=>({rows:[]})));
            
            if (buffRes && buffRes.rows.length > 0) {
                const activeBuff = buffRes.rows[0];
                const expiresAt = Number(activeBuff.expiresAt || activeBuff.expiresat || 0);
                
                if (Date.now() > expiresAt) {
                    // المعزز انتهى وقته الفعلي، يتم حذفه الآن
                    await db.query(`DELETE FROM user_buffs WHERE "userID" = $1 AND "guildID" = $2 AND "buffType" = 'xp'`, [userId, guildId])
                        .catch(() => db.query(`DELETE FROM user_buffs WHERE userid = $1 AND guildid = $2 AND bufftype = 'xp'`, [userId, guildId]).catch(()=>{}));
                } else {
                    // المعزز ما زال فعالاً، نطبق نسبة المضاعف على الـ XP
                    const multiplier = Number(activeBuff.multiplier || 0);
                    if (multiplier > 0) {
                        xpToAdd = Math.floor(xpToAdd * (1 + multiplier));
                    }
                }
            }
        } catch(e) { console.error("[Buff Check Error]:", e); }

        // 🔥 [2] إضافة وتصحيح تأثير معزز الرتب (Role Buffs / VIP) على الإكس بي 🔥
        try {
            let roleBuffsRes = await db.query(`SELECT "roleID", "buffPercent" FROM role_buffs WHERE "guildID" = $1`, [guildId])
                .catch(() => db.query(`SELECT roleid as "roleID", buffpercent as "buffPercent" FROM role_buffs WHERE guildid = $1`, [guildId]).catch(()=>({rows:[]})));
            
            if (roleBuffsRes && roleBuffsRes.rows.length > 0) {
                let maxRoleMultiplier = 0;
                for (const rBuff of roleBuffsRes.rows) {
                    const rId = rBuff.roleID || rBuff.roleid;
                    if (member.roles.cache.has(rId)) {
                        const rPercent = Number(rBuff.buffPercent || rBuff.buffpercent || 0);
                        const rMult = rPercent / 100;
                        if (rMult > maxRoleMultiplier) maxRoleMultiplier = rMult;
                    }
                }
                if (maxRoleMultiplier > 0) {
                    xpToAdd = Math.floor(xpToAdd * (1 + maxRoleMultiplier));
                }
            }
        } catch(e) {}

        let userData = null;
        if (client.getLevel) userData = await client.getLevel(userId, guildId);

        if (!userData) {
            let res;
            try { res = await db.query(`SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2`, [userId, guildId]); }
            catch(e) { res = await db.query(`SELECT *, userid as "user" FROM levels WHERE guildid = $1 AND userid = $2`, [userId, guildId]).catch(()=>({rows:[]})); }
            userData = res.rows[0] || { user: userId, guild: guildId, xp: 0, totalXP: 0, level: 1, mora: 0, bank: 0 };
        }

        userData.xp = (Number(userData.xp) || 0) + xpToAdd;
        userData.totalXP = (Number(userData.totalXP || userData.totalxp) || 0) + xpToAdd;
        userData.mora = (Number(userData.mora) || 0) + moraToAdd;
        userData.level = Number(userData.level) || 1;

        let leveledUp = false;
        let oldLevel = userData.level;

        let nextXP = calculateRequiredXP(userData.level);
        while (userData.xp >= nextXP) {
            userData.xp -= nextXP;
            userData.level++;
            leveledUp = true;
            nextXP = calculateRequiredXP(userData.level);
        }

        try {
            await db.query(`
                INSERT INTO levels ("user", "guild", "xp", "totalXP", "level", "mora") 
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT ("user", "guild") DO UPDATE SET 
                "xp" = EXCLUDED."xp", 
                "level" = EXCLUDED."level", 
                "totalXP" = CAST(COALESCE(levels."totalXP", '0') AS BIGINT) + $7, 
                "mora" = CAST(COALESCE(levels."mora", '0') AS BIGINT) + $8
            `, [userId, guildId, userData.xp, userData.totalXP, userData.level, userData.mora, xpToAdd, moraToAdd]);
        } catch(e) {
            await db.query(`
                INSERT INTO levels (userid, guildid, xp, totalxp, level, mora) 
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (userid, guildid) DO UPDATE SET 
                xp = EXCLUDED.xp, 
                level = EXCLUDED.level, 
                totalxp = CAST(COALESCE(levels.totalxp, '0') AS BIGINT) + $7, 
                mora = CAST(COALESCE(levels.mora, '0') AS BIGINT) + $8
            `, [userId, guildId, userData.xp, userData.totalXP, userData.level, userData.mora, xpToAdd, moraToAdd]).catch(()=>{});
        }

        if (client.setLevel) await client.setLevel(userData);

        if (leveledUp && isMessageEvent) {
            const mockInteraction = { guild: member.guild, channel: messageChannel || member.guild.channels.cache.first() };
            if (generateLevelUpCard) {
                await sendLevelUpMessage(mockInteraction, member, userData.level, oldLevel, userData, db).catch(console.error);
            }
        }
    } catch (e) {
        console.error("[addXPAndCheckLevel Error]:", e);
    }
}

async function sendLevelUpMessage(interaction, member, newLevel, oldLevel, xpData, db) {
     let channelToSend = null;
     
     // 🔥 [3] إعطاء رتبة المستوى الجديد للاعب عند الترقية (الرتبة) 🔥
     try {
         let lvlRoleRes = await db.query(`SELECT "roleID" FROM level_roles WHERE "guildID" = $1 AND "level" = $2`, [interaction.guild.id, newLevel])
             .catch(() => db.query(`SELECT roleid as "roleID" FROM level_roles WHERE guildid = $1 AND level = $2`, [interaction.guild.id, newLevel]).catch(()=>({rows:[]})));
         
         if (lvlRoleRes && lvlRoleRes.rows.length > 0) {
             const roleIdToGive = lvlRoleRes.rows[0].roleID || lvlRoleRes.rows[0].roleid;
             const roleToGive = interaction.guild.roles.cache.get(roleIdToGive);
             if (roleToGive) {
                 await member.roles.add(roleToGive).catch(()=>{});
             }
         }
     } catch(e) {}
     
     try {
         let savedChannelId = null;
         try {
             let channelRes = await db.query(`SELECT "levelChannel" FROM settings WHERE "guild" = $1`, [interaction.guild.id]);
             if (!channelRes || channelRes.rows.length === 0) channelRes = await db.query(`SELECT levelchannel FROM settings WHERE guild = $1`, [interaction.guild.id]).catch(()=>({rows:[]}));
             if (!channelRes || channelRes.rows.length === 0) channelRes = await db.query(`SELECT "levelChannel" FROM settings WHERE "guildID" = $1`, [interaction.guild.id]).catch(()=>({rows:[]}));
             if (!channelRes || channelRes.rows.length === 0) channelRes = await db.query(`SELECT levelchannel FROM settings WHERE guildid = $1`, [interaction.guild.id]).catch(()=>({rows:[]}));
             
             savedChannelId = channelRes.rows[0]?.levelChannel || channelRes.rows[0]?.levelchannel;
         } catch(e) {}

         if (savedChannelId && savedChannelId !== "Default") {
               channelToSend = interaction.guild.channels.cache.get(savedChannelId)
                             || await interaction.guild.channels.fetch(savedChannelId).catch(() => null);
               
               if (!channelToSend) return; 
         } else {
             channelToSend = interaction.channel;
         }

         if (!channelToSend) return;

         if (interaction.guild?.systemChannelId && channelToSend.id === interaction.guild.systemChannelId) return;

         const permissionFlags = channelToSend.permissionsFor(interaction.guild.members.me);
         if (!permissionFlags || !permissionFlags.has(PermissionsBitField.Flags.SendMessages) || !permissionFlags.has(PermissionsBitField.Flags.ViewChannel)) return;

         let isMentionOn = 1;
         try {
             let notifDataRes;
             try { notifDataRes = await db.query(`SELECT "levelNotif" FROM quest_notifications WHERE "id" = $1`, [`${member.id}-${interaction.guild.id}`]); }
             catch(e) { notifDataRes = await db.query(`SELECT levelnotif as "levelNotif" FROM quest_notifications WHERE id = $1`, [`${member.id}-${interaction.guild.id}`]).catch(()=>({rows:[]})); }
             
             if (notifDataRes.rows.length > 0) isMentionOn = Number(notifDataRes.rows[0].levelNotif || notifDataRes.rows[0].levelnotif);
         } catch(e) {}

         const userReference = isMentionOn ? member.toString() : `**${member.displayName}**`;
         
         let rawDesc = null;
         try {
             let customDescRes = await db.query(`SELECT "lvlUpDesc" FROM settings WHERE "guild" = $1`, [interaction.guild.id]);
             if (!customDescRes || customDescRes.rows.length === 0) customDescRes = await db.query(`SELECT lvlupdesc FROM settings WHERE guild = $1`, [interaction.guild.id]).catch(()=>({rows:[]}));
             if (!customDescRes || customDescRes.rows.length === 0) customDescRes = await db.query(`SELECT "lvlUpDesc" FROM settings WHERE "guildID" = $1`, [interaction.guild.id]).catch(()=>({rows:[]}));
             if (!customDescRes || customDescRes.rows.length === 0) customDescRes = await db.query(`SELECT lvlupdesc FROM settings WHERE guildid = $1`, [interaction.guild.id]).catch(()=>({rows:[]}));
             rawDesc = customDescRes.rows[0]?.lvlUpDesc || customDescRes.rows[0]?.lvlupdesc;
         } catch(e) {}
         
         let contentMsg = "";

         if (rawDesc) {
             contentMsg = rawDesc
                .replace(/{member}/gi, userReference)
                .replace(/{level}/gi, newLevel)
                .replace(/{level_old}/gi, oldLevel)
                .replace(/\\n/g, '\n');
         } else {
             contentMsg = `╭⭒★︰ <a:wi:1435572304988868769> ${userReference} <a:wii:1435572329039007889>\n` +
                          `✶ مبارك صعودك في سُلّم الإمبراطورية\n` +
                          `★ فقد كـسرت حـاجـز الـمستوى〃${oldLevel}〃وبلغـت المسـتـوى الـ 〃${newLevel}〃 <a:MugiStronk:1438795606872166462> وتعاظم شأنك بين جموع الرعية فامضِ قُدمًا نحو المجد  <:2KazumaSalut:1437129108806176768>`;
         }
         
         const milestones = [5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 99];
         if (milestones.includes(Number(newLevel))) {
             contentMsg += `\n★  فتـحـت ميزة جديـدة راجع قنـاة المستويات !`;
         }

         let card = null;
         try {
             if (generateLevelUpCard) {
                 const cardPromise = generateLevelUpCard(member, oldLevel, newLevel);
                 cardPromise.catch(() => {});
                 card = await Promise.race([
                     cardPromise,
                     new Promise((_, reject) => setTimeout(() => reject(new Error('CardTimeout')), 15000))
                 ]);
             }
         } catch(e) {
             console.error('[LevelUp] Card generation failed:', e.message);
         }

         // 🔥 الحماية الفولاذية الجديدة: التأكد من أن الصورة بصيغة Buffer صحيحة لتجنب انهيار البوت 🔥
         if (card && Buffer.isBuffer(card)) {
             await channelToSend.send({ content: contentMsg, files: [card] });
         } else {
             await channelToSend.send({ content: contentMsg });
         }

    } catch (err) {
         console.error(`[LevelUp Error]: ${err.message}`);
         try {
             let backupMsg = `╭⭒★︰ <a:wi:1435572304988868769> ${member} <a:wii:1435572329039007889>\n` +
                             `✶ مبارك صعودك في سُلّم الإمبراطورية\n` +
                             `★ فقد كـسرت حـاجـز الـمستوى〃${oldLevel}〃وبلغـت المسـتـوى الـ 〃${newLevel}〃`;
             const fallback = channelToSend || interaction.channel;
             if (!fallback) return;
             if (interaction.guild?.systemChannelId && fallback.id === interaction.guild.systemChannelId) return;
             await fallback.send(backupMsg).catch(()=>{});
         } catch(e) {}
    }
}

module.exports = {
    sendLevelUpMessage,
    getFreeBalance,
    calculateRequiredXP,
    addXPAndCheckLevel 
};
