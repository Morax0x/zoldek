const { EmbedBuilder, PermissionsBitField } = require("discord.js");
let generateLevelUpCard;
try {
    ({ generateLevelUpCard } = require('../generators/levelup-card-generator.js'));
} catch (e) {
    console.error("Error loading levelup-card-generator:", e);
}

// 🔥 1. الدالة المركزية لحساب الـ XP (معادلة MEE6 / ProBot القياسية) 🔥
function calculateRequiredXP(level) {
    const lvl = Number(level) || 0;
    // معادلة التلفيل الموحدة والناعمة لجميع المستويات
    return Math.floor(5 * (lvl ** 2) + 50 * lvl + 100);
}

// 🔥 2. دالة حساب رصيد المورا الحر (بدون القروض) 🔥
async function getFreeBalance(member, db) {
    if (!db) return 0;
    
    const levelDataRes = await db.query(`SELECT "mora", "bank" FROM levels WHERE "user" = $1 AND "guild" = $2`, [member.id, member.guild.id]);
    const levelData = levelDataRes.rows[0];
    const currentMora = levelData ? (Number(levelData.mora) || 0) : 0;
    const currentBank = levelData ? (Number(levelData.bank) || 0) : 0;
    
    const totalWealth = currentMora + currentBank;

    const loanDataRes = await db.query(`SELECT "remainingAmount" FROM user_loans WHERE "userID" = $1 AND "guildID" = $2`, [member.id, member.guild.id]);
    const loanData = loanDataRes.rows[0];
    const debt = loanData ? Number(loanData.remainingAmount) : 0;

    const freeBalance = totalWealth - debt;
    
    return Math.max(0, freeBalance);
}

// 🔥 3. الدالة السحرية المركزية 🔥
async function addXPAndCheckLevel(client, member, db, xpToAdd, moraToAdd = 0, isMessageEvent = false) {
    if (!member || !db) return;
    const userId = member.id;
    const guildId = member.guild.id;

    try {
        let userData = null;
        if (client.getLevel) userData = await client.getLevel(userId, guildId);

        if (!userData) {
            let res;
            try { res = await db.query(`SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2`, [userId, guildId]); }
            catch(e) { res = await db.query(`SELECT *, userid as "user" FROM levels WHERE guildid = $1 AND userid = $2`, [userId, guildId]).catch(()=>({rows:[]})); }
            userData = res.rows[0] || { user: userId, guild: guildId, xp: 0, totalXP: 0, level: 1, mora: 0, bank: 0 };
        }

        userData.xp = (Number(userData.xp) || 0) + Number(xpToAdd);
        userData.totalXP = (Number(userData.totalXP || userData.totalxp) || 0) + Number(xpToAdd);
        userData.mora = (Number(userData.mora) || 0) + Number(moraToAdd);
        userData.level = Number(userData.level) || 1;

        let leveledUp = false;
        let oldLevel = userData.level;

        // 🔥 التعديل: السماح بحساب التلفيل دائماً حتى لو كانت الخبرة من إنجاز أو مهمة 🔥
        let nextXP = calculateRequiredXP(userData.level);
        while (userData.xp >= nextXP) {
            userData.xp -= nextXP;
            userData.level++;
            leveledUp = true;
            nextXP = calculateRequiredXP(userData.level);
        }

        // 🔥 التحديث الآمن: جمع المورا والاكس بي مباشرة في قاعدة البيانات لمنع مسح المكافآت 🔥
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

        // 🔥 لن نزعج اللاعب بصورة التلفيل إلا إذا كان يتحدث في الشات 🔥
        if (leveledUp && isMessageEvent) {
            const mockInteraction = { guild: member.guild, channel: member.guild.systemChannel || member.guild.channels.cache.first() };
            if (generateLevelUpCard) {
                await sendLevelUpMessage(mockInteraction, member, userData.level, oldLevel, userData, db).catch(console.error);
            }
        }
    } catch (e) {
        console.error("[addXPAndCheckLevel Error]:", e);
    }
}

// 🔥 4. دالة إرسال التلفيل بالصورة الفخمة 🔥
async function sendLevelUpMessage(interaction, member, newLevel, oldLevel, xpData, db) {
     try {
         let channelRes;
         try { channelRes = await db.query(`SELECT * FROM channel WHERE "guild" = $1`, [interaction.guild.id]); }
         catch(e) { channelRes = await db.query(`SELECT * FROM channel WHERE guild = $1`, [interaction.guild.id]).catch(()=>({rows:[]})); }
         
         let channelLevel = channelRes.rows[0];

         let channelToSend = null;
         if (channelLevel && channelLevel.channel !== "Default") {
               channelToSend = interaction.guild.channels.cache.get(channelLevel.channel)
                             || await interaction.guild.channels.fetch(channelLevel.channel).catch(() => null);
         }
         if (!channelToSend) {
             const fallback = interaction.channel;
             // Never fall back to system channel (boost notifications channel)
             if (interaction.guild?.systemChannelId && fallback?.id === interaction.guild.systemChannelId) return;
             channelToSend = fallback;
         }
         if (!channelToSend) return;

         const permissionFlags = channelToSend.permissionsFor(interaction.guild.members.me);
         if (!permissionFlags || !permissionFlags.has(PermissionsBitField.Flags.SendMessages) || !permissionFlags.has(PermissionsBitField.Flags.ViewChannel)) return;

         let card = null;
         try {
             const cardPromise = generateLevelUpCard(member, oldLevel, newLevel, { mora: 0, hp: 0 });
             cardPromise.catch(() => {});
             card = await Promise.race([
                 cardPromise,
                 new Promise((_, reject) => setTimeout(() => reject(new Error('CardTimeout')), 15000))
             ]);
         } catch(e) {
             console.error('[LevelUp] Card generation failed:', e.message);
         }

         let isMentionOn = 1;
         try {
             let notifDataRes;
             try { notifDataRes = await db.query(`SELECT "levelNotif" FROM quest_notifications WHERE "id" = $1`, [`${member.id}-${interaction.guild.id}`]); }
             catch(e) { notifDataRes = await db.query(`SELECT levelnotif as "levelNotif" FROM quest_notifications WHERE id = $1`, [`${member.id}-${interaction.guild.id}`]).catch(()=>({rows:[]})); }
             
             if (notifDataRes.rows.length > 0) isMentionOn = Number(notifDataRes.rows[0].levelNotif || notifDataRes.rows[0].levelnotif);
         } catch(e) {}

         const userReference = isMentionOn ? member.toString() : `**${member.displayName}**`;
         
         let contentMsg = `╭⭒★︰ <a:wi:1435572304988868769> ${userReference} <a:wii:1435572329039007889>\n` +
                          `✶ مبارك صعودك في سُلّم الإمبراطورية\n` +
                          `★ فقد كـسرت حـاجـز الـمستوى〃${oldLevel}〃وبلغـت المسـتـوى الـ 〃${newLevel}〃 <a:MugiStronk:1438795606872166462> وتعاظم شأنك بين جموع الرعية فامضِ قُدمًا نحو المجد  <:2KazumaSalut:1437129108806176768>`;
         
         const milestones = [5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 99];
         if (milestones.includes(Number(newLevel))) {
             contentMsg += `\n★  فتـحـت ميزة جديـدة راجع قنـاة المستويات !`;
         }

         if (card) {
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
             const fallback = interaction.channel;
             if (interaction.guild?.systemChannelId && fallback?.id === interaction.guild.systemChannelId) return;
             await fallback?.send(backupMsg).catch(()=>{});
         } catch(e) {}
    }
}

module.exports = {
    sendLevelUpMessage,
    getFreeBalance,
    calculateRequiredXP,
    addXPAndCheckLevel 
};
