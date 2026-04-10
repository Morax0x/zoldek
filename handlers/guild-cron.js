const cron = require('node-cron');
const { EmbedBuilder, Colors } = require('discord.js');

function startGuildCrons(client, db) {
    if (!db) return;

    // 🔥 التصفير اليومي (الساعة 23:59 بتوقيت السعودية) 🔥
    cron.schedule('59 23 * * *', async () => {
        console.log("[Guild Cron] Starting Daily Reset for Kings & Badges...");
        const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date());
        const guilds = client.guilds.cache;

        guilds.forEach(async (guild) => {
            let settingsRes;
            try { settingsRes = await db.query(`SELECT * FROM settings WHERE "guild" = $1`, [guild.id]); }
            catch(e) { settingsRes = await db.query(`SELECT * FROM settings WHERE guild = $1`, [guild.id]).catch(()=>({rows:[]})); }
            const settings = settingsRes.rows[0];
            
            if (!settings) return;

            // 🛡️ سحب رتبة الختم اليومي من جميع الأعضاء بصمت 🛡️
            const roleDailyBadgeId = settings.roleDailyBadge || settings.roledailybadge;
            if (roleDailyBadgeId) {
                try {
                    const role = guild.roles.cache.get(roleDailyBadgeId);
                    if (role && guild.members.me.permissions.has('ManageRoles')) {
                        const membersWithRole = role.members;
                        for (const [memberId, member] of membersWithRole) {
                            member.roles.remove(roleDailyBadgeId).catch(()=>{});
                        }
                    }
                } catch (err) { console.error("[Guild Cron] Failed to remove daily badges:", err); }
            }

            const announceChannelId = settings.guildAnnounceChannelID || settings.guildannouncechannelid;
            if (!announceChannelId) return;

            const announceChannel = guild.channels.cache.get(announceChannelId);
            if (!announceChannel) return;

            const getId = (row) => row ? (row.userID || row.userid || row.user) : null;

            // 🎰 Casino & Mora
            let casinoDataRes;
            try { casinoDataRes = await db.query(`SELECT "userID" FROM kings_board_tracker WHERE "guildID" = $1 AND "date" = $2 AND (COALESCE("casino_profit", 0) + COALESCE("mora_earned", 0)) > 0 ORDER BY (COALESCE("casino_profit", 0) + COALESCE("mora_earned", 0)) DESC LIMIT 1`, [guild.id, todayStr]); }
            catch(e) { casinoDataRes = await db.query(`SELECT userid as "userID" FROM kings_board_tracker WHERE guildid = $1 AND date = $2 AND (COALESCE(casino_profit, 0) + COALESCE(mora_earned, 0)) > 0 ORDER BY (COALESCE(casino_profit, 0) + COALESCE(mora_earned, 0)) DESC LIMIT 1`, [guild.id, todayStr]).catch(()=>({rows:[]})); }
            const casinoData = casinoDataRes.rows[0];
            
            // ⚔️ Abyss (ملاحظة: هذا الجدول يستخدم user و guild بدلا من userID)
            let abyssDataRes;
            try { abyssDataRes = await db.query(`SELECT "user" as "userID" FROM levels WHERE "guild" = $1 AND "max_dungeon_floor" > 0 ORDER BY "max_dungeon_floor" DESC LIMIT 1`, [guild.id]); }
            catch(e) { abyssDataRes = await db.query(`SELECT userid as "userID" FROM levels WHERE guildid = $1 AND max_dungeon_floor > 0 ORDER BY max_dungeon_floor DESC LIMIT 1`, [guild.id]).catch(()=>({rows:[]})); }
            const abyssData = abyssDataRes.rows[0];
            
            // 🗣️ Chatter
            let chatterDataRes;
            try { chatterDataRes = await db.query(`SELECT "userID" FROM kings_board_tracker WHERE "guildID" = $1 AND "date" = $2 AND COALESCE("messages", 0) > 0 ORDER BY COALESCE("messages", 0) DESC LIMIT 1`, [guild.id, todayStr]); }
            catch(e) { chatterDataRes = await db.query(`SELECT userid as "userID" FROM kings_board_tracker WHERE guildid = $1 AND date = $2 AND COALESCE(messages, 0) > 0 ORDER BY COALESCE(messages, 0) DESC LIMIT 1`, [guild.id, todayStr]).catch(()=>({rows:[]})); }
            const chatterData = chatterDataRes.rows[0];
            
            // 🤝 Philanthropist
            let philanDataRes;
            try { philanDataRes = await db.query(`SELECT "userID" FROM kings_board_tracker WHERE "guildID" = $1 AND "date" = $2 AND COALESCE("mora_donated", 0) > 0 ORDER BY COALESCE("mora_donated", 0) DESC LIMIT 1`, [guild.id, todayStr]); }
            catch(e) { philanDataRes = await db.query(`SELECT userid as "userID" FROM kings_board_tracker WHERE guildid = $1 AND date = $2 AND COALESCE(mora_donated, 0) > 0 ORDER BY COALESCE(mora_donated, 0) DESC LIMIT 1`, [guild.id, todayStr]).catch(()=>({rows:[]})); }
            const philanData = philanDataRes.rows[0];
            
            // 🧠 Advisor
            let advisorDataRes;
            try { advisorDataRes = await db.query(`SELECT "userID" FROM kings_board_tracker WHERE "guildID" = $1 AND "date" = $2 AND COALESCE("ai_interactions", 0) > 0 ORDER BY COALESCE("ai_interactions", 0) DESC LIMIT 1`, [guild.id, todayStr]); }
            catch(e) { advisorDataRes = await db.query(`SELECT userid as "userID" FROM kings_board_tracker WHERE guildid = $1 AND date = $2 AND COALESCE(ai_interactions, 0) > 0 ORDER BY COALESCE(ai_interactions, 0) DESC LIMIT 1`, [guild.id, todayStr]).catch(()=>({rows:[]})); }
            const advisorData = advisorDataRes.rows[0];
            
            // 🎣 Fisher
            let fisherDataRes;
            try { fisherDataRes = await db.query(`SELECT "userID" FROM kings_board_tracker WHERE "guildID" = $1 AND "date" = $2 AND COALESCE("fish_caught", 0) > 0 ORDER BY COALESCE("fish_caught", 0) DESC LIMIT 1`, [guild.id, todayStr]); }
            catch(e) { fisherDataRes = await db.query(`SELECT userid as "userID" FROM kings_board_tracker WHERE guildid = $1 AND date = $2 AND COALESCE(fish_caught, 0) > 0 ORDER BY COALESCE(fish_caught, 0) DESC LIMIT 1`, [guild.id, todayStr]).catch(()=>({rows:[]})); }
            const fisherData = fisherDataRes.rows[0];
            
            // 🛡️ PVP
            let pvpDataRes;
            try { pvpDataRes = await db.query(`SELECT "userID" FROM kings_board_tracker WHERE "guildID" = $1 AND "date" = $2 AND COALESCE("pvp_wins", 0) > 0 ORDER BY COALESCE("pvp_wins", 0) DESC LIMIT 1`, [guild.id, todayStr]); }
            catch(e) { pvpDataRes = await db.query(`SELECT userid as "userID" FROM kings_board_tracker WHERE guildid = $1 AND date = $2 AND COALESCE(pvp_wins, 0) > 0 ORDER BY COALESCE(pvp_wins, 0) DESC LIMIT 1`, [guild.id, todayStr]).catch(()=>({rows:[]})); }
            const pvpData = pvpDataRes.rows[0];
            
            // 🌾 Farm
            let farmDataRes;
            try { farmDataRes = await db.query(`SELECT "userID" FROM kings_board_tracker WHERE "guildID" = $1 AND "date" = $2 AND COALESCE("crops_harvested", 0) > 0 ORDER BY COALESCE("crops_harvested", 0) DESC LIMIT 1`, [guild.id, todayStr]); }
            catch(e) { farmDataRes = await db.query(`SELECT userid as "userID" FROM kings_board_tracker WHERE guildid = $1 AND date = $2 AND COALESCE(crops_harvested, 0) > 0 ORDER BY COALESCE(crops_harvested, 0) DESC LIMIT 1`, [guild.id, todayStr]).catch(()=>({rows:[]})); }
            const farmData = farmDataRes.rows[0];

            const userRewards = {};
            
            const chatterId = getId(chatterData); if (chatterId) userRewards[chatterId] = (userRewards[chatterId] || 0) + 7; 
            const casinoId = getId(casinoData); if (casinoId) userRewards[casinoId] = (userRewards[casinoId] || 0) + 5; 
            const abyssId = getId(abyssData); if (abyssId) userRewards[abyssId] = (userRewards[abyssId] || 0) + 4; 
            const pvpId = getId(pvpData); if (pvpId) userRewards[pvpId] = (userRewards[pvpId] || 0) + 3; 
            const advisorId = getId(advisorData); if (advisorId) userRewards[advisorId] = (userRewards[advisorId] || 0) + 2; 
            const fisherId = getId(fisherData); if (fisherId) userRewards[fisherId] = (userRewards[fisherId] || 0) + 2; 
            const farmId = getId(farmData); if (farmId) userRewards[farmId] = (userRewards[farmId] || 0) + 2; 
            const philanId = getId(philanData); if (philanId) userRewards[philanId] = (userRewards[philanId] || 0) + 1; 

            if (Object.keys(userRewards).length > 0) {
                let kingsMentions = [];
                let success = false;
                
                try {
                    await db.query("BEGIN");
                    for (const [kingId, reward] of Object.entries(userRewards)) {
                        try {
                            await db.query(`INSERT INTO user_reputation ("userID", "guildID", "rep_points") VALUES ($1, $2, $3) ON CONFLICT("userID", "guildID") DO UPDATE SET "rep_points" = COALESCE(user_reputation."rep_points", 0) + $4`, [kingId, guild.id, reward, reward]);
                        } catch(e) {
                            await db.query(`INSERT INTO user_reputation (userid, guildid, rep_points) VALUES ($1, $2, $3) ON CONFLICT(userid, guildid) DO UPDATE SET rep_points = COALESCE(user_reputation.rep_points, 0) + $4`, [kingId, guild.id, reward, reward]).catch(()=>{});
                        }
                        kingsMentions.push(`🎖️ <@${kingId}> (**+${reward}** سمعة)`);
                    }
                    await db.query("COMMIT");
                    success = true;
                } catch (e) {
                    await db.query("ROLLBACK");
                    console.error("[Guild Cron] Daily Reset DB Error:", e);
                }

                if (success && kingsMentions.length > 0) {
                    const embed = new EmbedBuilder()
                        .setTitle('🌙 انتهى اليوم بسلام!')
                        .setDescription(`تمت مكافأة ملوك اليوم بنقاط سمعة متفاوتة حسب قوة وثقل ألقابهم، لصمودهم حتى النهاية!\n\n👑 **ملوك اليوم العظماء ومكافآتهم:**\n${kingsMentions.join('\n')}`)
                        .setColor(Colors.Gold);
                    
                    await announceChannel.send({ embeds: [embed] }).catch(()=>{});
                }
            }
        });
    }, { timezone: "Asia/Riyadh" });

    // 🔥 التصفير الأسبوعي (يوم الجمعة الساعة 23:59 بتوقيت السعودية) 🔥
    cron.schedule('59 23 * * 5', async () => {
        console.log("[Guild Cron] Starting Silent Weekly Elite Tax & Badges Reset...");
        
        const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Riyadh" }));
        const diff = now.getDate() - (now.getDay() + 2) % 7; 
        const friday = new Date(now.setDate(diff)); 
        const weekStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(friday);

        const guilds = client.guilds.cache;

        guilds.forEach(async (guild) => {
            let settingsRes;
            try { settingsRes = await db.query(`SELECT * FROM settings WHERE "guild" = $1`, [guild.id]); }
            catch(e) { settingsRes = await db.query(`SELECT * FROM settings WHERE guild = $1`, [guild.id]).catch(()=>({rows:[]})); }
            const settings = settingsRes.rows[0];

            // 🛡️ سحب رتبة الختم الأسبوعي من جميع الأعضاء بصمت 🛡️
            if (settings) {
                const roleWeeklyBadgeId = settings.roleWeeklyBadge || settings.roleweeklybadge;
                if (roleWeeklyBadgeId) {
                    try {
                        const role = guild.roles.cache.get(roleWeeklyBadgeId);
                        if (role && guild.members.me.permissions.has('ManageRoles')) {
                            const membersWithRole = role.members;
                            for (const [memberId, member] of membersWithRole) {
                                member.roles.remove(roleWeeklyBadgeId).catch(()=>{});
                            }
                        }
                    } catch (err) { console.error("[Guild Cron] Failed to remove weekly badges:", err); }
                }
            }

            let elitesRes;
            try { elitesRes = await db.query(`SELECT * FROM user_reputation WHERE "guildID" = $1 AND "rep_points" >= 100`, [guild.id]); }
            catch(e) { elitesRes = await db.query(`SELECT * FROM user_reputation WHERE guildid = $1 AND rep_points >= 100`, [guild.id]).catch(()=>({rows:[]})); }
            
            const elites = elitesRes.rows;
            if (elites.length === 0) return;

            try {
                await db.query("BEGIN");
                for (const elite of elites) {
                    const points = parseInt(elite.rep_points || elite.rep_points) || 0;
                    const userId = elite.userID || elite.userid;
                    const repsGiven = parseInt(elite.weekly_reps_given || elite.weekly_reps_given) || 0;

                    let weeklyStatsRes;
                    try { weeklyStatsRes = await db.query(`SELECT "messages" FROM user_weekly_stats WHERE "userID" = $1 AND "guildID" = $2 AND "weekStartDate" = $3`, [userId, guild.id, weekStr]); }
                    catch(e) { weeklyStatsRes = await db.query(`SELECT messages FROM user_weekly_stats WHERE userid = $1 AND guildid = $2 AND weekstartdate = $3`, [userId, guild.id, weekStr]).catch(()=>({rows:[]})); }
                    
                    const msgs = weeklyStatsRes.rows[0] ? (parseInt(weeklyStatsRes.rows[0].messages) || 0) : 0;

                    let penalty = 0;

                    if (points >= 1000) { 
                        if (msgs < 1000 || repsGiven < 5) penalty = 10;
                    } else if (points >= 500) { 
                        if (msgs < 800 || repsGiven < 3) penalty = 5;
                    } else if (points >= 250) { 
                        if (msgs < 400) penalty = 3;
                    } else if (points >= 100) { 
                        if (msgs < 150) penalty = 1;
                    }

                    if (penalty > 0) {
                        const newPoints = Math.max(0, points - penalty);
                        try { await db.query(`UPDATE user_reputation SET "rep_points" = $1 WHERE "userID" = $2 AND "guildID" = $3`, [newPoints, userId, guild.id]); }
                        catch(e) { await db.query(`UPDATE user_reputation SET rep_points = $1 WHERE userid = $2 AND guildid = $3`, [newPoints, userId, guild.id]).catch(()=>{}); }
                    }
                }

                try { await db.query(`UPDATE user_reputation SET "weekly_reps_given" = 0 WHERE "guildID" = $1`, [guild.id]); }
                catch(e) { await db.query(`UPDATE user_reputation SET weekly_reps_given = 0 WHERE guildid = $1`, [guild.id]).catch(()=>{}); }
                
                await db.query("COMMIT");
            } catch (e) {
                await db.query("ROLLBACK");
                console.error("[Guild Cron] Weekly Elite Tax DB Error:", e);
            }
            
            console.log(`[Guild Cron] Weekly Elite Tax completed silently for guild: ${guild.id}`);
        });
    }, { timezone: "Asia/Riyadh" });
}

module.exports = { startGuildCrons };
