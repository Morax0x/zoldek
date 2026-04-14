const { AttachmentBuilder, EmbedBuilder } = require('discord.js');
const { generateRepCard } = require('../generators/rep-card-generator.js'); 

const OWNER_ID = "1145327691772481577";

const getRandomColor = () => Math.floor(Math.random() * 16777215);

function getRepRank(points) {
    if (points >= 9999) return { rank: 'SSS', name: '🎇 مغامـر رتبـة SSS', color: '#FFD700', next: 'الحد الأقصى' };
    if (points >= 1000) return { rank: 'SS', name: '👑 مغامـر رتبـة SS', color: '#FF00FF', next: 9999 };
    if (points >= 500)  return { rank: 'S',  name: '💎 مغامـر رتبـة S', color: '#00FFFF', next: 1000 };
    if (points >= 250)  return { rank: 'A',  name: '🥇 مغامـر رتبـة A', color: '#FFD700', next: 500 };
    if (points >= 100)  return { rank: 'B',  name: '🥈 مغامـر رتبـة B', color: '#C0C0C0', next: 250 };
    if (points >= 50)   return { rank: 'C',  name: '🥉 مغامـر رتبـة C', color: '#CD7F32', next: 100 };
    if (points >= 25)   return { rank: 'D',  name: '⚔️ مغامـر رتبـة D', color: '#2E8B57', next: 50 };
    if (points >= 10)   return { rank: 'E',  name: '🛡️ مغامـر رتبـة E', color: '#8B4513', next: 25 };
    return { rank: 'F', name: '🪵 مغامـر رتبـة F', color: '#A0522D', next: 10 };
}

function getNextResetTime() {
    const now = new Date();
    const options = { timeZone: 'Asia/Riyadh', year: 'numeric', month: 'numeric', day: 'numeric' };
    const rsaDateString = now.toLocaleDateString('en-US', options);
    const resetDate = new Date(rsaDateString + ' 23:59:59 GMT+0300'); 
    
    if (resetDate.getTime() < now.getTime()) {
        resetDate.setDate(resetDate.getDate() + 1);
    }
    
    return Math.floor(resetDate.getTime() / 1000);
}

function getTodayDateString() { 
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date());
}

module.exports = {
    name: 'rep',
    description: 'منح نقطة سمعة لمغامر آخر',
    usage: 'rep <@user>',
    aliases: ['سمعة', 'reputation', 'سمعه', 'تزكية', 'تزكيه', 'شهادة'],

    async execute(message, args) {
        const db = message.client.sql;
        const senderId = message.author.id;
        const guildId = message.guild.id;
        const todayStr = getTodayDateString();

        try {
            await db.query(`CREATE TABLE IF NOT EXISTS user_reputation ("userID" TEXT, "guildID" TEXT, "rep_points" INTEGER DEFAULT 0, "last_rep_given" TEXT, "daily_reps_given" INTEGER DEFAULT 0, "weekly_reps_given" INTEGER DEFAULT 0, PRIMARY KEY ("userID", "guildID"))`);
        } catch (e) {}

        let maxVotes = 1;
        if (message.member) {
            if (message.member.roles.cache.has('1422160802416164885')) {
                maxVotes = 3;
            } else if (message.member.roles.cache.has('1395674235002945636')) {
                maxVotes = 2;
            }
        }

        try {
            const yesterdayKSA = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Riyadh" }));
            yesterdayKSA.setDate(yesterdayKSA.getDate() - 1);
            const yesterdayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(yesterdayKSA);

            let voiceKingRes;
            try { 
                voiceKingRes = await db.query(`SELECT "userID" FROM kings_board_tracker WHERE "guildID" = $1 AND "date" = $2 AND "userID" != $3 GROUP BY "userID" HAVING SUM(COALESCE("vc_minutes", 0)) > 0 ORDER BY SUM(COALESCE("vc_minutes", 0)) DESC LIMIT 1`, [guildId, yesterdayStr, OWNER_ID]); 
            } catch(e) { 
                voiceKingRes = await db.query(`SELECT userid as "userID" FROM kings_board_tracker WHERE guildid = $1 AND date = $2 AND userid != $3 GROUP BY userid HAVING SUM(COALESCE(vc_minutes, 0)) > 0 ORDER BY SUM(COALESCE(vc_minutes, 0)) DESC LIMIT 1`, [guildId, yesterdayStr, OWNER_ID]).catch(()=>({rows:[]})); 
            }
            
            const voiceKingId = voiceKingRes.rows[0]?.userID || voiceKingRes.rows[0]?.userid;

            if (voiceKingId === senderId) {
                maxVotes += 3;
            }
        } catch (err) {}

        let senderRep;
        try {
            const senderRepRes = await db.query(`SELECT * FROM user_reputation WHERE "userID" = $1 AND "guildID" = $2`, [senderId, guildId]);
            senderRep = senderRepRes.rows[0];
        } catch(e) {
            const senderRepRes = await db.query(`SELECT * FROM user_reputation WHERE userid = $1 AND guildid = $2`, [senderId, guildId]).catch(()=>({rows:[]}));
            senderRep = senderRepRes.rows[0];
        }
        
        if (!senderRep) {
            try { await db.query(`INSERT INTO user_reputation ("userID", "guildID") VALUES ($1, $2)`, [senderId, guildId]); }
            catch(e) { await db.query(`INSERT INTO user_reputation (userid, guildid) VALUES ($1, $2)`, [senderId, guildId]).catch(()=>{}); }
            
            try {
                const newSenderRepRes = await db.query(`SELECT * FROM user_reputation WHERE "userID" = $1 AND "guildID" = $2`, [senderId, guildId]);
                senderRep = newSenderRepRes.rows[0];
            } catch(e) {
                const newSenderRepRes = await db.query(`SELECT * FROM user_reputation WHERE userid = $1 AND guildid = $2`, [senderId, guildId]).catch(()=>({rows:[]}));
                senderRep = newSenderRepRes.rows[0];
            }
        }

        let currentDailyReps = 0;
        if (senderRep && (senderRep.last_rep_given === todayStr || senderRep.last_rep_given === todayStr)) {
            currentDailyReps = parseInt(senderRep.daily_reps_given || senderRep.daily_reps_given, 10) || 0;
        }

        let remainingVotes = maxVotes - currentDailyReps;
        if (remainingVotes < 0) remainingVotes = 0;
        let displayRemaining = senderId === OWNER_ID ? 'غير محدود' : remainingVotes;

        const targetMember = message.mentions.members.first();
        
        if (!targetMember || targetMember.user.bot) {
            const usageEmbed = new EmbedBuilder()
                .setDescription(`✶ طريـقـة التزكيـة الصحيحة:\nتزكية @منشن\n\nتمـلـك « ${displayRemaining} » شـهـادة تزكيـة لهـذا اليـوم`)
                .setThumbnail('https://i.postimg.cc/zG4FYy12/ayqwnt-(4).png')
                .setColor(getRandomColor());
            return message.reply({ embeds: [usageEmbed] });
        }

        const targetId = targetMember.id;

        if (targetId === senderId) {
            const selfEmbed = new EmbedBuilder()
                .setDescription('حـاول مجـددًا ولـكن منشن شخـص آخـر .. لا يمكنـك الشهـادة لنفسـك <:FBI:1439666820016508929>!')
                .setThumbnail('https://i.postimg.cc/qRnVwHM6/ayqwnt-(1).png')
                .setColor(getRandomColor());
            return message.reply({ embeds: [selfEmbed] });
        }

        if (senderId !== OWNER_ID && remainingVotes <= 0) {
            const nextRepTime = getNextResetTime();
            const cooldownEmbed = new EmbedBuilder()
                .setTitle('✥ استفـدت صـوتـك لهـذا اليـوم .. ⏳')
                .setDescription(`✦ يمـكنـك التـزكيـة مـجـددًا:\n ✦<t:${nextRepTime}:R>`)
                .setThumbnail('https://i.postimg.cc/66YzP12B/ayqwnt-(2).png')
                .setColor(getRandomColor());
            return message.reply({ embeds: [cooldownEmbed] });
        }

        let senderLevel = 1;
        try {
            const senderLevelRes = await db.query(`SELECT "level" FROM levels WHERE "user" = $1 AND "guild" = $2`, [senderId, guildId]);
            senderLevel = senderLevelRes.rows.length > 0 ? Number(senderLevelRes.rows[0].level) : 1;
        } catch(e) {
            const senderLevelRes = await db.query(`SELECT level FROM levels WHERE userid = $1 AND guildid = $2`, [senderId, guildId]).catch(()=>({rows:[]}));
            senderLevel = senderLevelRes.rows.length > 0 ? Number(senderLevelRes.rows[0].level) : 1;
        }

        if (senderId !== OWNER_ID && senderLevel < 10) {
            const lvlEmbed = new EmbedBuilder()
                .setTitle('✥ لا تسـتوفـي شـروط التزكيـة ..')
                .setDescription('✦ يجـب ان يـكـون مستـواك 10 عـلى الاقـل لتزكـي أحدهـم')
                .setThumbnail('https://i.postimg.cc/mrLwL056/ayqwnt-(3).png')
                .setColor(getRandomColor());
            return message.reply({ embeds: [lvlEmbed] });
        }
        
        if (senderId !== OWNER_ID) {
            try {
                let todayMessages = 0;
                
                try {
                    const msgStatRes = await db.query(`SELECT SUM(COALESCE("messages", 0)) as total_msgs FROM kings_board_tracker WHERE "userID" = $1 AND "guildID" = $2 AND "date" = $3`, [senderId, guildId, todayStr]);
                    todayMessages = msgStatRes.rows.length > 0 ? (Number(msgStatRes.rows[0].total_msgs) || 0) : 0;
                } catch(e) {
                    const msgStatRes = await db.query(`SELECT SUM(COALESCE(messages, 0)) as total_msgs FROM kings_board_tracker WHERE userid = $1 AND guildid = $2 AND date = $3`, [senderId, guildId, todayStr]).catch(()=>({rows:[]}));
                    todayMessages = msgStatRes.rows.length > 0 ? (Number(msgStatRes.rows[0].total_msgs) || 0) : 0;
                }

                if (todayMessages < 20) {
                    const msgEmbed = new EmbedBuilder()
                        .setTitle('✥ لا تسـتوفـي شـروط التزكيـة ..')
                        .setDescription(`✦ يجـب ان تكـون متفـاعـل بالدردشـة لهـذا اليوم\n(أرسلت ${todayMessages} / 20 رسالة)`)
                        .setThumbnail('https://i.postimg.cc/mrLwL056/ayqwnt-(3).png')
                        .setColor(getRandomColor());
                    return message.reply({ embeds: [msgEmbed] });
                }
            } catch (e) {}
        }

        const currentSenderPoints = parseInt(senderRep ? (senderRep.rep_points || senderRep.rep_points) : 0, 10) || 0;
        const senderRankData = getRepRank(currentSenderPoints);
        
        let repToAdd = 1;
        let isEliteVouch = false;
        let isMythicVouch = false;
        
        if (senderRankData.rank === 'SSS') {
            repToAdd = 3;
            isMythicVouch = true;
        } else if (['S', 'SS'].includes(senderRankData.rank)) {
            repToAdd = 2;
            isEliteVouch = true;
        }

        let targetRep;
        try {
            const targetRepRes = await db.query(`SELECT * FROM user_reputation WHERE "userID" = $1 AND "guildID" = $2`, [targetId, guildId]);
            targetRep = targetRepRes.rows[0];
        } catch(e) {
            const targetRepRes = await db.query(`SELECT * FROM user_reputation WHERE userid = $1 AND guildid = $2`, [targetId, guildId]).catch(()=>({rows:[]}));
            targetRep = targetRepRes.rows[0];
        }
        
        if (!targetRep) {
            try { await db.query(`INSERT INTO user_reputation ("userID", "guildID") VALUES ($1, $2)`, [targetId, guildId]); }
            catch(e) { await db.query(`INSERT INTO user_reputation (userid, guildid) VALUES ($1, $2)`, [targetId, guildId]).catch(()=>{}); }
            
            try {
                const newTargetRepRes = await db.query(`SELECT * FROM user_reputation WHERE "userID" = $1 AND "guildID" = $2`, [targetId, guildId]);
                targetRep = newTargetRepRes.rows[0];
            } catch(e) {
                const newTargetRepRes = await db.query(`SELECT * FROM user_reputation WHERE userid = $1 AND guildid = $2`, [targetId, guildId]).catch(()=>({rows:[]}));
                targetRep = newTargetRepRes.rows[0];
            }
        }

        const currentTargetPoints = parseInt(targetRep ? (targetRep.rep_points || targetRep.rep_points) : 0, 10) || 0;
        const newTargetPoints = currentTargetPoints + repToAdd;
        const newDailyRepsGiven = currentDailyReps + 1;
        
        try {
            await db.query("BEGIN");
            try {
                await db.query(`UPDATE user_reputation SET "rep_points" = "rep_points" + $1 WHERE "userID" = $2 AND "guildID" = $3`, [repToAdd, targetId, guildId]);
                await db.query(`UPDATE user_reputation SET "last_rep_given" = $1, "daily_reps_given" = $2, "weekly_reps_given" = "weekly_reps_given" + 1 WHERE "userID" = $3 AND "guildID" = $4`, [todayStr, newDailyRepsGiven, senderId, guildId]);
            } catch(e) {
                await db.query(`UPDATE user_reputation SET rep_points = rep_points + $1 WHERE userid = $2 AND guildid = $3`, [repToAdd, targetId, guildId]);
                await db.query(`UPDATE user_reputation SET last_rep_given = $1, daily_reps_given = $2, weekly_reps_given = weekly_reps_given + 1 WHERE userid = $3 AND guildid = $4`, [todayStr, newDailyRepsGiven, senderId, guildId]);
            }
            await db.query("COMMIT");
        } catch (e) {
            await db.query("ROLLBACK").catch(()=>{});
            throw e;
        }

        const targetRankData = getRepRank(newTargetPoints);
        const oldRankData = getRepRank(currentTargetPoints); 
        const isRankUp = targetRankData.rank !== oldRankData.rank;

        message.channel.sendTyping();

        try {
            const senderAvatar = message.author.displayAvatarURL({ extension: 'png', size: 128 });
            const senderName = message.member ? message.member.displayName : message.author.username;
            const receiverAvatar = targetMember.user.displayAvatarURL({ extension: 'png', size: 256 });
            const receiverName = targetMember.displayName || targetMember.user.username;

            const imageBuffer = await generateRepCard(senderAvatar, senderName, receiverAvatar, receiverName, newTargetPoints, targetRankData, isRankUp);
            const attachment = new AttachmentBuilder(imageBuffer, { name: 'reputation.png' });

            let extraMsg = '';
            if (isMythicVouch) {
                extraMsg = `\n✨ **تزكية أسطورية!** شهادة من مغامر في القمة (**SSS**) تعادل 3 شهادات! (+3 🌟)`;
            } else if (isEliteVouch) {
                extraMsg = `\n👑 **تزكية النخبة!** لأنك مغامر من الرتبة المرموقة (**${senderRankData.rank}**)، تزكيتك تعادل شهادتين! (+2 🌟)`;
            }

            await message.reply({ content: `<@${targetId}>${extraMsg}`, files: [attachment] });
            
        } catch (error) {
            let extraMsg = '';
            if (isMythicVouch) extraMsg = `\n✨ **تزكية أسطورية!** شهادتك تعادل 3 أصوات (+3 🌟)`;
            else if (isEliteVouch) extraMsg = `\n👑 **تزكية النخبة!** شهادتك تعادل صوتين (+2 🌟)`;
            
            const errorEmbed = new EmbedBuilder()
                .setDescription(`✅ **تم منح السمعة بنجاح!**${extraMsg}`)
                .setColor(getRandomColor());
            message.reply({ embeds: [errorEmbed] });
        }
    }
};
