const { EmbedBuilder, Colors, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags, AttachmentBuilder, PermissionsBitField } = require("discord.js");
const { buildAchievementsEmbed, buildDailyEmbed, buildWeeklyEmbed } = require('../commands/achievements.js');
const { fetchLeaderboardData } = require('../commands/top.js'); 
const questsConfig = require('../json/quests-config.json');
const weaponsConfig = require('../json/weapons-config.json');

const { generateAdventurerCard } = require('../generators/adventurer-card-generator.js'); 
const { generateHallOfFame } = require('../generators/hall-of-fame-generator.js');
const { generateGuideImage } = require('../generators/guide-generator.js'); 
const { generateNotificationControlPanel } = require('../generators/notification-generator.js');
const { generateAchievementCard } = require('../generators/achievement-card-generator.js');

const { GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');

try { GlobalFonts.registerFromPath(path.join(__dirname, '../fonts/bein-ar-normal.ttf'), 'Bein'); } catch (e) {}

const EMOJI_MORA = '<:mora:1435647151349698621>';
const EMOJI_STAR = '⭐';
const OWNER_ID = "1145327691772481577"; 

const RACE_TRANSLATIONS = new Map([
    ['Human', 'بشري'], ['Dragon', 'تنين'], ['Elf', 'آلف'], ['Dark Elf', 'آلف الظلام'],
    ['Seraphim', 'سيرافيم'], ['Demon', 'شيطان'], ['Vampire', 'مصاص دماء'], 
    ['Spirit', 'روح'], ['Dwarf', 'قزم'], ['Ghoul', 'غول'], ['Hybrid', 'نصف وحش']
]);

function getTodayDateString() { 
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date());
}

function getWeekStartDateString() {
    const ksaTime = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Riyadh" }));
    const diff = ksaTime.getDate() - (ksaTime.getDay() + 2) % 7; 
    const friday = new Date(ksaTime.setDate(diff));
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(friday);
}

function createNotifButton(label, customId, currentStatus) {
    const isEnabled = Number(currentStatus) === 1;
    return new ButtonBuilder()
        .setCustomId(customId)
        .setLabel(`${label}: ${isEnabled ? 'مفعل ✅' : 'معطل ❌'}`)
        .setStyle(isEnabled ? ButtonStyle.Success : ButtonStyle.Danger);
}

function getRotatedQuests(pool, countNormal, countElite, seedStr) {
    const normalPool = pool.filter(q => !q.repReward || q.repReward === 0);
    const elitePool = pool.filter(q => q.repReward && q.repReward > 0);
    let hash = 0;
    for (let i = 0; i < seedStr.length; i++) hash = seedStr.charCodeAt(i) + ((hash << 5) - hash);
    hash = Math.abs(hash);
    let selected = []; let nPool = [...normalPool];
    for(let i=0; i<countNormal; i++) { if(nPool.length === 0) break; let index = (hash + i) % nPool.length; selected.push(nPool[index]); nPool.splice(index, 1); }
    let ePool = [...elitePool];
    for(let i=0; i<countElite; i++) { if(ePool.length === 0) break; let index = (hash + i) % ePool.length; selected.push(ePool[index]); ePool.splice(index, 1); }
    return selected;
}

async function getUserStat(userId, guildId, statName, db) {
    let val = 0;
    try {
        const lvlRes = await db.query(`SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2`, [userId, guildId]);
        const lvlData = lvlRes.rows[0];
        if (lvlData && lvlData[statName] !== undefined) return Number(lvlData[statName]) || 0;
        
        const totalRes = await db.query(`SELECT * FROM user_total_stats WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId]);
        const totalData = totalRes.rows[0];
        if (totalData && totalData[statName] !== undefined) return Number(totalData[statName]) || 0;
        
        if (statName === 'highestStreak') {
             const streakRes = await db.query(`SELECT "highestStreak" FROM streaks WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId]);
             const streakData = streakRes.rows[0];
             return streakData ? (Number(streakData.highestStreak) || 0) : 0;
        }
    } catch (e) {} return val;
}

function getRepRankInfo(points) {
    if (points >= 1000) return { name: '👑 رتبة SS', color: '#FF0055' }; 
    if (points >= 500)  return { name: '💎 رتبة S', color: '#9D00FF' }; 
    if (points >= 250)  return { name: '🥇 رتبة A', color: '#FFD700' }; 
    if (points >= 100)  return { name: '🥈 رتبة B', color: '#00FF88' }; 
    if (points >= 50)   return { name: '🥉 رتبة C', color: '#00BFFF' }; 
    if (points >= 25)   return { name: '⚔️ رتبة D', color: '#A9A9A9' }; 
    if (points >= 10)   return { name: '🛡️ رتبة E', color: '#B87333' }; 
    return { name: '🪵 رتبة F', color: '#654321' }; 
}

async function calculateStrongestRank(db, guildID, targetUserID) {
    if (targetUserID === OWNER_ID) return 0;
    const weaponsRes = await db.query(`SELECT "userID", "raceName", "weaponLevel" FROM user_weapons WHERE "guildID" = $1 AND "userID" != $2`, [guildID, OWNER_ID]);
    const weapons = weaponsRes.rows;

    let stats = [];
    for (const w of weapons) {
        const conf = weaponsConfig.find(c => c.race === w.raceName);
        if(!conf) continue;
        const dmg = conf.base_damage + (conf.damage_increment * (Number(w.weaponLevel) - 1));
        
        const lvlRes = await db.query(`SELECT "level" FROM levels WHERE "guild" = $1 AND "user" = $2`, [guildID, w.userID]);
        const lvlData = lvlRes.rows[0];
        const playerLevel = lvlData ? Number(lvlData.level) : 1;
        
        const hp = 100 + (playerLevel * 4);
        
        const skillRes = await db.query(`SELECT SUM("skillLevel") as totallevels FROM user_skills WHERE "guildID" = $1 AND "userID" = $2`, [guildID, w.userID]);
        const skillData = skillRes.rows[0];
        const skillLevelsTotal = skillData ? (Number(skillData.totallevels) || 0) : 0;
        
        const powerScore = Math.floor(dmg + (hp * 0.5) + (playerLevel * 10) + (skillLevelsTotal * 20));
        stats.push({ userID: w.userID, powerScore });
    }
    stats.sort((a, b) => b.powerScore - a.powerScore);
    return stats.findIndex(s => s.userID === targetUserID) + 1; 
}

function chunkButtons(buttons) {
    const rows = [];
    for (let i = 0; i < buttons.length; i += 5) rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
    return rows;
}

// 🔥 تم إصلاح هذه الدالة لتقرأ الإنجازات من الداتابيز بأمان، وتدعم التقليب 🔥
async function buildMyAchievementsEmbed(interaction, db, page = 1) {
    try {
        let completedRes;
        try { 
            completedRes = await db.query(`SELECT * FROM user_achievements WHERE "userID" = $1 AND "guildID" = $2`, [interaction.user.id, interaction.guild.id]); 
        } catch(e) { 
            completedRes = await db.query(`SELECT * FROM user_achievements WHERE userid = $1 AND guildid = $2`, [interaction.user.id, interaction.guild.id]).catch(()=>({rows:[]})); 
        }
        
        const completed = completedRes.rows;
        if (completed.length === 0) {
            return { 
                embed: new EmbedBuilder().setTitle('🎖️ إنجازاتي').setColor(Colors.DarkRed).setDescription('لم تقم بإكمال أي إنجازات بعد.').setImage('https://i.postimg.cc/L4Yb4zHw/almham_alywmyt-2.png'), 
                components: [], 
                totalPages: 1 
            };
        }

        const completedIDs = new Set(completed.map(c => c.achievementID || c.achievementid));
        const completedDetails = questsConfig.achievements.filter(ach => completedIDs.has(ach.id)); 
        const perPage = 10;
        const totalPages = Math.ceil(completedDetails.length / perPage) || 1;
        page = Math.max(1, Math.min(page, totalPages)); 
        const start = (page - 1) * perPage; 
        const end = start + perPage;
        const achievementsToShow = completedDetails.slice(start, end); 

        const embed = new EmbedBuilder()
            .setTitle('🎖️ إنجازاتي المكتملة') 
            .setColor(Colors.DarkRed)
            .setAuthor({ name: interaction.member.displayName || interaction.user.username, iconURL: interaction.user.displayAvatarURL() })
            .setFooter({ text: `صفحة ${page} / ${totalPages} (الإجمالي: ${completedDetails.length})` }) 
            .setTimestamp()
            .setImage('https://i.postimg.cc/L4Yb4zHw/almham_alywmyt-2.png');

        let description = '';
        for (const ach of achievementsToShow) {
            description += `${ach.emoji || '🏆'} **${ach.name}**\n> ${ach.description}\n> *المكافأة: ${EMOJI_MORA} \`${ach.reward.mora}\` | ${EMOJI_STAR}XP: \`${ach.reward.xp}\`*\n\n`;
        }
        embed.setDescription(description);
        
        return { embed: embed, totalPages: totalPages, currentPage: page }; 
    } catch (err) {
        console.error("MyAchievements Error:", err);
        return { embed: new EmbedBuilder().setTitle(' خطأ').setDescription('حدث خطأ.').setColor(Colors.Red), totalPages: 1 };
    }
}

async function handleQuestPanel(i, client, db) {
    const userId = i.user.id;
    const guildId = i.guild.id;
    const id = `${userId}-${guildId}`;
    const todayStr = getTodayDateString();
    const weekStr = getWeekStartDateString();
    
    let rawId = i.isStringSelectMenu() ? i.values[0] : i.customId;

    if (rawId === 'panel_reputation_guide' || rawId.startsWith('panel_guide_')) {
        let isInitialMenuRequest = (rawId === 'panel_reputation_guide');
        let guideType = 'rep';
        if (rawId.includes('kings')) guideType = rawId.includes('kings_2') ? 'kings_2' : 'kings_1';
        else if (rawId.includes('ach')) guideType = 'ach';

        try {
            const buffer = await generateGuideImage(guideType);
            const attachment = new AttachmentBuilder(buffer, { name: 'guide.png' });

            const guideButtons = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('panel_guide_rep').setLabel('السمعة والرتب').setEmoji('📜').setStyle(guideType === 'rep' ? ButtonStyle.Primary : ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('panel_guide_kings_tab').setLabel('ألقاب الملوك').setEmoji('👑').setStyle(guideType.startsWith('kings') ? ButtonStyle.Primary : ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('panel_guide_ach').setLabel('الأوسمة التفاعلية').setEmoji('🎖️').setStyle(guideType === 'ach' ? ButtonStyle.Primary : ButtonStyle.Secondary)
            );

            let componentsToSend = [guideButtons];

            if (guideType.startsWith('kings')) {
                componentsToSend.push(new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('panel_guide_kings_1').setEmoji('<:left:1439164494759723029>').setStyle(ButtonStyle.Secondary).setDisabled(guideType === 'kings_1'),
                    new ButtonBuilder().setCustomId('panel_guide_kings_2').setEmoji('<:right:1439164491072929915>').setStyle(ButtonStyle.Secondary).setDisabled(guideType === 'kings_2')
                ));
            }

            if (isInitialMenuRequest) {
                await i.deferReply({ flags: [MessageFlags.Ephemeral] }).catch(()=>{});
                return await i.editReply({ files: [attachment], components: componentsToSend }).catch(()=>{});
            } else {
                return await i.update({ files: [attachment], components: componentsToSend, embeds: [], content: null }).catch(()=>{});
            }
        } catch (err) { return; }
    }

    if (i.isStringSelectMenu()) await i.deferReply({ flags: [MessageFlags.Ephemeral] }).catch(()=>{}); 
    else if (i.isButton()) await i.deferUpdate().catch(()=>{}); 

    let currentPage = 1;
    let section = "unknown";

    if (rawId.includes('_prev_')) {
        let parts = rawId.split('_prev_');
        section = parts[0].replace('panel_', '');
        currentPage = parseInt(parts[1]) - 1;
    } else if (rawId.includes('_next_')) {
        let parts = rawId.split('_next_');
        section = parts[0].replace('panel_', '');
        currentPage = parseInt(parts[1]) + 1;
    } else {
        section = rawId.replace('panel_', '');
    }

    if (section === 'daily_quests') section = 'daily';
    if (section === 'weekly_quests') section = 'weekly';
    if (section.includes('notif')) section = 'notifications';

    if (section === 'empire') {
         return i.editReply({ content: "🚧 **قسم مهام الإمبراطورية قيد التطوير حاليا!**", embeds: [], components: [] }).catch(()=>{});
    }

    if (section === 'notifications') {
        const notifDataRes = await db.query(`SELECT * FROM quest_notifications WHERE "id" = $1`, [id]).catch(()=>({rows:[]}));
        let notifData = notifDataRes.rows[0];

        if (!notifData) {
            notifData = { id: id, userID: userId, guildID: guildId, dailyNotif: 1, weeklyNotif: 1, achievementsNotif: 1, levelNotif: 1, kingsNotif: 1, badgesNotif: 1 };
            try { 
                await db.query(`INSERT INTO quest_notifications ("id", "userID", "guildID", "dailyNotif", "weeklyNotif", "achievementsNotif", "levelNotif", "kingsNotif", "badgesNotif") VALUES ($1, $2, $3, 1, 1, 1, 1, 1, 1)`).catch(()=>{});
            } catch(e) {}
        }

        let dNotif = Number(notifData.dailyNotif ?? notifData.dailynotif ?? 1);
        let wNotif = Number(notifData.weeklyNotif ?? notifData.weeklynotif ?? 1);
        let aNotif = Number(notifData.achievementsNotif ?? notifData.achievementsnotif ?? 1);
        let lNotif = Number(notifData.levelNotif ?? notifData.levelnotif ?? 1);
        let kNotif = Number(notifData.kingsNotif ?? notifData.kingsnotif ?? 1);
        let bNotif = Number(notifData.badgesNotif ?? notifData.badgesnotif ?? 1);

        if (rawId.includes('toggle_notif')) {
            if (rawId.includes('daily')) dNotif = dNotif === 1 ? 0 : 1;
            else if (rawId.includes('weekly')) wNotif = wNotif === 1 ? 0 : 1;
            else if (rawId.includes('ach')) aNotif = aNotif === 1 ? 0 : 1;
            else if (rawId.includes('level')) lNotif = lNotif === 1 ? 0 : 1;
            else if (rawId.includes('kings')) kNotif = kNotif === 1 ? 0 : 1;
            else if (rawId.includes('badges')) bNotif = bNotif === 1 ? 0 : 1;
            
            try { 
                await db.query(`
                    INSERT INTO quest_notifications ("id", "userID", "guildID", "dailyNotif", "weeklyNotif", "achievementsNotif", "levelNotif", "kingsNotif", "badgesNotif") 
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                    ON CONFLICT("id") DO UPDATE SET 
                    "dailyNotif" = EXCLUDED."dailyNotif", 
                    "weeklyNotif" = EXCLUDED."weeklyNotif", 
                    "achievementsNotif" = EXCLUDED."achievementsNotif", 
                    "levelNotif" = EXCLUDED."levelNotif", 
                    "kingsNotif" = EXCLUDED."kingsNotif", 
                    "badgesNotif" = EXCLUDED."badgesNotif"
                `, [id, userId, guildId, dNotif, wNotif, aNotif, lNotif, kNotif, bNotif]);
            } catch(e) {
                await db.query(`
                    UPDATE quest_notifications 
                    SET dailynotif=$1, weeklynotif=$2, achievementsnotif=$3, levelnotif=$4, kingsnotif=$5, badgesnotif=$6 
                    WHERE id=$7
                `, [dNotif, wNotif, aNotif, lNotif, kNotif, bNotif, id]).catch(()=>{});
            }
        }

        const buffer = await generateNotificationControlPanel(i.member);
        const attachment = new AttachmentBuilder(buffer, { name: 'notification-panel.png' });

        const notifButtonsRow1 = new ActionRowBuilder().addComponents(
            createNotifButton('المـهـام اليـوميـة', 'panel_toggle_notif_daily', dNotif),
            createNotifButton('المـهـام الاسـبوعيـة', 'panel_toggle_notif_weekly', wNotif),
            createNotifButton('اشعـارات اللفـل', 'panel_toggle_notif_level', lNotif)
        );
        
        const notifButtonsRow2 = new ActionRowBuilder().addComponents(
            createNotifButton('اشعـارات الانجـازات', 'panel_toggle_notif_ach', aNotif),
            createNotifButton('اشعـارات الاوسـمـة', 'panel_toggle_notif_badges', bNotif),
            createNotifButton('اشعـارات الملـوك', 'panel_toggle_notif_kings', kNotif)
        );

        return i.editReply({ embeds: [], components: [notifButtonsRow1, notifButtonsRow2], files: [attachment] }).catch(()=>{});
    }

    const levelDataRes = await db.query(`SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2`, [userId, guildId]).catch(()=>({rows:[]}));
    let levelData = levelDataRes.rows[0] || { user: userId, guild: guildId, level: 1, mora: 0, bank: 0, xp: 0 };

    const dailyStatsRes = await db.query(`SELECT * FROM user_daily_stats WHERE "id" = $1`, [`${userId}-${guildId}-${todayStr}`]).catch(()=>({rows:[]}));
    let dailyStats = dailyStatsRes.rows[0] || {};
    
    const weeklyStatsRes = await db.query(`SELECT * FROM user_weekly_stats WHERE "id" = $1`, [`${userId}-${guildId}-${weekStr}`]).catch(()=>({rows:[]}));
    let weeklyStats = weeklyStatsRes.rows[0] || {};
    
    const totalStatsRes = await db.query(`SELECT * FROM user_total_stats WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId]).catch(()=>({rows:[]}));
    let totalStats = totalStatsRes.rows[0] || {};
    
    const completedAchievementsRes = await db.query(`SELECT * FROM user_achievements WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId]).catch(()=>({rows:[]}));
    const completedAchievements = completedAchievementsRes.rows;

    let embeds = []; let files = []; let totalPages = 1; let data; let buttons = [];

    if (section === 'daily') {
        data = await buildDailyEmbed(db, i.member, dailyStats, currentPage);
    } 
    else if (section === 'weekly') {
        data = await buildWeeklyEmbed(db, i.member, weeklyStats, currentPage);
    } 
    else if (section === 'achievements') { 
        data = await buildAchievementsEmbed(db, i.member, levelData, totalStats, completedAchievements, currentPage);
    } 
    else if (section === 'my_achievements') {
        data = await buildMyAchievementsEmbed(i, db, currentPage);
    } 
    else if (section === 'top_achievements') {
        const lbData = await fetchLeaderboardData(client, db, i.guild, 'achievements', currentPage, null);
        if (lbData && lbData.imageBuffer) {
            const attachment = new AttachmentBuilder(lbData.imageBuffer, { name: 'top_achievements.png' });
            data = { embeds: [], files: [attachment], totalPages: lbData.totalPages };
        } else {
            data = { embeds: [new EmbedBuilder().setTitle('خطأ').setDescription('❌ لا توجد بيانات لعرضها.').setColor(Colors.Red)], files: [], totalPages: 1 };
        }
    } 
    else if (section === 'adventurer_card') {
        try {
            const pvpCore = require('./pvp-core.js'); 
            const repDataRes = await db.query(`SELECT "rep_points" FROM user_reputation WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId]).catch(()=>({rows:[]}));
            const repData = repDataRes.rows[0] || { rep_points: 0 };
            const points = Number(repData.rep_points) || 0;
            const rankInfo = getRepRankInfo(points);

            const userRaceData = await pvpCore.getUserRace(i.member, db);
            const raceName = userRaceData ? (RACE_TRANSLATIONS.get(userRaceData.raceName) || userRaceData.raceName) : "مجهول";
            const weaponData = await pvpCore.getWeaponData(db, i.member);
            const weaponName = weaponData ? weaponData.name : "بدون سلاح";
            const weaponDmg = weaponData ? weaponData.currentDamage : 0;
            const maxHp = 100 + (Number(levelData.level) * 4);

            const { calculateBuffMultiplier, calculateMoraBuff } = require("../streak-handler.js");
            const streakDataRes = await db.query(`SELECT * FROM streaks WHERE "guildID" = $1 AND "userID" = $2`, [guildId, userId]).catch(()=>({rows:[]}));
            const streakData = streakDataRes.rows[0];
            const streakCount = streakData ? (Number(streakData.streakCount) || 0) : 0;
            let hasItemShields = streakData ? (Number(streakData.hasItemShield) || 0) : 0;
            let hasGraceShield = (streakData && Number(streakData.hasGracePeriod) === 1) ? 1 : 0;
            const totalShields = hasItemShields + hasGraceShield;

            const xpBuffPercent = Math.floor((await calculateBuffMultiplier(i.member, db) - 1) * 100);
            const moraBuffPercent = Math.floor((await calculateMoraBuff(i.member, db) - 1) * 100);

            const totalMora = (Number(levelData.mora) || 0) + (Number(levelData.bank) || 0);
            let displayMora = totalMora.toLocaleString();
            if (userId === OWNER_ID) displayMora = "👁️";

            let ranks = { level: "0", mora: "0", streak: "0", power: "0" };
            if (userId !== OWNER_ID) {
                const allScoresRes = await db.query(`SELECT "user" as userID FROM levels WHERE "guild" = $1 AND "user" != $2 ORDER BY "totalXP" DESC`, [guildId, OWNER_ID]).catch(()=>({rows:[]}));
                const allScores = allScoresRes.rows;
                let rLvl = allScores.findIndex(s => s.userid === userId || s.userID === userId) + 1;
                ranks.level = rLvl > 0 ? rLvl.toString() : "0";

                const allMoraRes = await db.query(`SELECT "user" as userID FROM levels WHERE "guild" = $1 AND "user" != $2 ORDER BY ("mora" + "bank") DESC`, [guildId, OWNER_ID]).catch(()=>({rows:[]}));
                const allMora = allMoraRes.rows;
                let rMora = allMora.findIndex(s => s.userid === userId || s.userID === userId) + 1;
                ranks.mora = rMora > 0 ? rMora.toString() : "0";

                const allStreaksRes = await db.query(`SELECT "userID" FROM streaks WHERE "guildID" = $1 AND "userID" != $2 ORDER BY "streakCount" DESC`, [guildId, OWNER_ID]).catch(()=>({rows:[]}));
                const allStreaks = allStreaksRes.rows;
                let rStreak = allStreaks.findIndex(s => s.userID === userId || s.userid === userId) + 1;
                ranks.streak = rStreak > 0 ? rStreak.toString() : "0";

                let rPower = await calculateStrongestRank(db, guildId, userId);
                ranks.power = rPower > 0 ? rPower.toString() : "0";
            }

            const currentXP = Number(levelData.xp) || 0;
            const requiredXP = 5 * (Number(levelData.level) ** 2) + (50 * Number(levelData.level)) + 100;

            const profileData = {
                user: i.user,
                displayName: i.member.displayName || i.user.username,
                rankInfo: rankInfo,
                repPoints: points,
                level: Number(levelData.level),
                currentXP: currentXP,
                requiredXP: requiredXP,
                mora: displayMora,
                raceName: raceName,
                weaponName: weaponName,
                weaponDmg: weaponDmg,
                maxHp: maxHp,
                streakCount: streakCount,
                xpBuff: xpBuffPercent,
                moraBuff: moraBuffPercent,
                shields: totalShields,
                ranks: ranks
            };

            const buffer = await generateAdventurerCard(profileData);
            const attachment = new AttachmentBuilder(buffer, { name: 'adventurer_card.png' });
            data = { embeds: [], files: [attachment], totalPages: 1 };
        } catch (err) {
            return i.editReply({ content: "❌ حدث خطأ أثناء إنشاء البطاقة." }).catch(()=>{});
        }
    } 
    else if (section === 'hall_of_fame') {
        try {
            let topUsersRes;
            try { topUsersRes = await db.query(`SELECT "userID", "rep_points" as rp FROM user_reputation WHERE "guildID" = $1 AND "rep_points" > 0 AND "userID" != $2 ORDER BY rp DESC LIMIT 10`, [guildId, OWNER_ID]); }
            catch(e) { topUsersRes = await db.query(`SELECT userid as "userID", rep_points as rp FROM user_reputation WHERE guildid = $1 AND rep_points > 0 AND userid != $2 ORDER BY rp DESC LIMIT 10`, [guildId, OWNER_ID]).catch(()=>({rows:[]})); }
            
            const topUsers = topUsersRes.rows;
            
            let topUsersData = [];
            for (const u of topUsers) {
                try {
                    const member = await i.guild.members.fetch(u.userID).catch(()=>null);
                    let displayName = "مغامر مجهول"; let avatarUrl = null;
                    if (member) {
                        displayName = member.displayName; avatarUrl = member.user.displayAvatarURL({ extension: 'png', size: 128 });
                    } else {
                        const fetchedUser = await client.users.fetch(u.userID).catch(()=>null);
                        if (fetchedUser) { displayName = fetchedUser.username; avatarUrl = fetchedUser.displayAvatarURL({ extension: 'png', size: 128 }); }
                    }
                    const rankInfo = getRepRankInfo(u.rp);
                    const rankLetter = rankInfo.name.match(/[A-Z]+/) ? rankInfo.name.match(/[A-Z]+/)[0] : 'F';
                    topUsersData.push({ displayName: displayName, avatarUrl: avatarUrl, repPoints: u.rp, rankLetter: rankLetter });
                } catch (err) {}
            }

            const buffer = await generateHallOfFame(topUsersData);
            const attachment = new AttachmentBuilder(buffer, { name: 'hall_of_fame.png' });
            data = { embeds: [], files: [attachment], totalPages: 1 };
        } catch (error) {
            return i.editReply({ content: "❌ حدث خطأ أثناء تجهيز قاعة الأساطير.", flags: [MessageFlags.Ephemeral] }).catch(()=>{});
        }
    } 
    else {
        return i.editReply({ content: `❌ القسم غير معروف.` }).catch(()=>{});
    }

    if (data) {
        if (data.embeds) {
            embeds = Array.isArray(data.embeds) ? data.embeds : [data.embeds];
        } else if (data.embed) {
            embeds = [data.embed];
        } else {
            embeds = [];
        }
        
        files = data.files || [];
        totalPages = data.totalPages || 1;
        currentPage = data.currentPage || Math.max(1, Math.min(currentPage, totalPages)); 
    }

    let components = [];
    if (buttons.length > 0) {
        components.push(...chunkButtons(buttons.slice(0, 20))); 
    }

    if (totalPages > 1 && !['adventurer_card', 'hall_of_fame', 'top_achievements'].includes(section)) {
        if (components.length < 5) {
            const pageRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`panel_${section}_prev_${currentPage}`)
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('<:left:1439164494759723029>')
                    .setDisabled(currentPage === 1),
                new ButtonBuilder()
                    .setCustomId(`panel_${section}_next_${currentPage}`)
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('<:right:1439164491072929915>')
                    .setDisabled(currentPage === totalPages)
            );
            components.push(pageRow);
        }
    }

    await i.editReply({ content: embeds.length === 0 && files.length === 0 ? "❌ لا توجد بيانات." : null, embeds: embeds, files: files, components: components }).catch(()=>{});
}

const { autoUpdateKingsBoard, updateGuildStat, rewardDailyKings, processStatsQueue } = require('./kings-stats-handler.js');

module.exports = { handleQuestPanel, handleGuildBoard: handleQuestPanel, updateGuildStat, processStatsQueue };
