const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, SlashCommandBuilder, AttachmentBuilder } = require("discord.js");
const path = require('path');

const { generateTopImage } = require('../generators/top-image-generator.js');
const weaponsConfig = require('../json/weapons-config.json');
const { OWNER_ID } = require('../handlers/dungeon/constants.js'); 

const PROFILE_BASE_HP = 100;
const PROFILE_HP_PER_LEVEL = 4;
const ROWS_PER_PAGE = 10; 

function getWeekStartDateString() {
    const now = new Date(); const diff = now.getUTCDate() - (now.getUTCDay() + 2) % 7;
    const friday = new Date(now.setUTCDate(diff)); friday.setUTCHours(0, 0, 0, 0); return friday.toISOString().split('T')[0];
}
function getTodayDateString() { return new Date().toISOString().split('T')[0]; }
function getMonthStartDateString() {
    const now = new Date(); return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().split('T')[0];
}

// 🔥 دوال الحماية المطلقة لتحويل النصوص إلى أرقام بدون أخطاء (تمنع انهيار اللوحة) 🔥
function safeNum(val) {
    if (!val) return 0;
    const n = Number(val);
    return isNaN(n) ? 0 : Math.floor(n);
}

function safeBigInt(val) {
    if (!val) return 0n;
    let str = val.toString().trim().split('.')[0]; 
    if (!str || str === 'NaN' || str === 'null' || str === 'undefined') return 0n;
    try {
        return BigInt(str);
    } catch {
        return 0n;
    }
}

async function fetchLeaderboardData(client, sql, guild, type, page, targetUserId = null) {
    let allUsers = [];
    let res;
    
    try {
        // 🔥 الحل الجذري: جلب البيانات وترتيبها برمجياً بدروع الحماية لتجاوز أخطاء قاعدة البيانات 🔥
        if (type === 'level') {
            try { res = await sql.query(`SELECT * FROM levels WHERE "guild" = $1 AND "user" != $2`, [guild.id, OWNER_ID]); }
            catch(e) { res = await sql.query(`SELECT *, userid as "user" FROM levels WHERE guildid = $1 AND userid != $2`, [guild.id, OWNER_ID]).catch(()=>({rows:[]})); }
            
            allUsers = res.rows.sort((a, b) => {
                const xpA = safeBigInt(a.totalXP || a.totalxp);
                const xpB = safeBigInt(b.totalXP || b.totalxp);
                return xpA < xpB ? 1 : (xpA > xpB ? -1 : 0);
            });
        } 
        else if (type === 'rep') {
            try { res = await sql.query(`SELECT * FROM user_reputation WHERE "guildID" = $1 AND "userID" != $2`, [guild.id, OWNER_ID]); }
            catch(e) { res = await sql.query(`SELECT *, userid as "userID" FROM user_reputation WHERE guildid = $1 AND userid != $2`, [guild.id, OWNER_ID]).catch(()=>({rows:[]})); }
            
            allUsers = res.rows.map(r => ({ ...r, user: r.userID || r.userid, rp: safeNum(r.rep_points) }))
                              .filter(r => r.rp > 0)
                              .sort((a, b) => b.rp - a.rp);
        } 
        else if (type === 'weekly_xp') {
            const weekStart = getWeekStartDateString();
            try { res = await sql.query(`SELECT * FROM user_weekly_stats WHERE "guildID" = $1 AND "userID" != $2 AND "weekStartDate" = $3`, [guild.id, OWNER_ID, weekStart]); }
            catch(e) { res = await sql.query(`SELECT *, userid as "userID" FROM user_weekly_stats WHERE guildid = $1 AND userid != $2 AND weekstartdate = $3`, [guild.id, OWNER_ID, weekStart]).catch(()=>({rows:[]})); }
            
            allUsers = res.rows.map(r => {
                const score = (safeNum(r.messages) * 15) + (safeNum(r.vc_minutes) * 10);
                return { ...r, user: r.userID || r.userid, score };
            }).filter(r => r.score > 0).sort((a, b) => b.score - a.score);
        } 
        else if (type === 'daily_xp') {
            const today = getTodayDateString();
            try { res = await sql.query(`SELECT * FROM user_daily_stats WHERE "guildID" = $1 AND "userID" != $2 AND "date" = $3`, [guild.id, OWNER_ID, today]); }
            catch(e) { res = await sql.query(`SELECT *, userid as "userID" FROM user_daily_stats WHERE guildid = $1 AND userid != $2 AND date = $3`, [guild.id, OWNER_ID, today]).catch(()=>({rows:[]})); }
            
            allUsers = res.rows.map(r => {
                const score = (safeNum(r.messages) * 15) + (safeNum(r.vc_minutes) * 10);
                return { ...r, user: r.userID || r.userid, score };
            }).filter(r => r.score > 0).sort((a, b) => b.score - a.score);
        } 
        else if (type === 'monthly_xp') {
            const monthStart = getMonthStartDateString();
            try { res = await sql.query(`SELECT * FROM user_daily_stats WHERE "guildID" = $1 AND "userID" != $2 AND "date" >= $3`, [guild.id, OWNER_ID, monthStart]); }
            catch(e) { res = await sql.query(`SELECT *, userid as "userID" FROM user_daily_stats WHERE guildid = $1 AND userid != $2 AND date >= $3`, [guild.id, OWNER_ID, monthStart]).catch(()=>({rows:[]})); }
            
            const grouped = new Map();
            res.rows.forEach(r => {
                const uid = r.userID || r.userid;
                const msgs = safeNum(r.messages);
                const vcs = safeNum(r.vc_minutes);
                const score = (msgs * 15) + (vcs * 10);
                if (!grouped.has(uid)) grouped.set(uid, { user: uid, score: 0, messages: 0, vc_minutes: 0 });
                grouped.get(uid).score += score;
                grouped.get(uid).messages += msgs;
                grouped.get(uid).vc_minutes += vcs;
            });
            
            allUsers = Array.from(grouped.values()).filter(r => r.score > 0).sort((a, b) => b.score - a.score);
        } 
        else if (type === 'mora') {
            try { res = await sql.query(`SELECT * FROM levels WHERE "guild" = $1 AND "user" != $2`, [guild.id, OWNER_ID]); }
            catch(e) { res = await sql.query(`SELECT *, userid as "user" FROM levels WHERE guildid = $1 AND userid != $2`, [guild.id, OWNER_ID]).catch(()=>({rows:[]})); }
            
            allUsers = res.rows.map(r => {
                const moraVal = safeBigInt(r.mora);
                const bankVal = safeBigInt(r.bank);
                const totalWealth = moraVal + bankVal;
                return { ...r, user: r.user || r.userid, total_wealth_num: totalWealth, total_wealth: totalWealth.toString() };
            }).filter(r => r.total_wealth_num > 0n).sort((a, b) => a.total_wealth_num < b.total_wealth_num ? 1 : (a.total_wealth_num > b.total_wealth_num ? -1 : 0));
        } 
        else if (type === 'streak') {
            try { res = await sql.query(`SELECT * FROM streaks WHERE "guildID" = $1 AND "userID" != $2`, [guild.id, OWNER_ID]); }
            catch(e) { res = await sql.query(`SELECT *, userid as "userID" FROM streaks WHERE guildid = $1 AND userid != $2`, [guild.id, OWNER_ID]).catch(()=>({rows:[]})); }
            
            allUsers = res.rows.map(r => ({ ...r, user: r.userID || r.userid, streakCount: safeNum(r.streakCount || r.streakcount) }))
                              .filter(r => r.streakCount > 0)
                              .sort((a, b) => b.streakCount - a.streakCount);
        } 
        else if (type === 'media_streak') {
            try { res = await sql.query(`SELECT * FROM media_streaks WHERE "guildID" = $1 AND "userID" != $2`, [guild.id, OWNER_ID]); }
            catch(e) { res = await sql.query(`SELECT *, userid as "userID" FROM media_streaks WHERE guildid = $1 AND userid != $2`, [guild.id, OWNER_ID]).catch(()=>({rows:[]})); }
            
            allUsers = res.rows.map(r => ({ ...r, user: r.userID || r.userid, streakCount: safeNum(r.streakCount || r.streakcount) }))
                              .filter(r => r.streakCount > 0)
                              .sort((a, b) => b.streakCount - a.streakCount);
        } 
        else if (type === 'achievements') {
            try { res = await sql.query(`SELECT "userID" FROM user_achievements WHERE "guildID" = $1 AND "userID" != $2`, [guild.id, OWNER_ID]); }
            catch(e) { res = await sql.query(`SELECT userid as "userID" FROM user_achievements WHERE guildid = $1 AND userid != $2`, [guild.id, OWNER_ID]).catch(()=>({rows:[]})); }
            
            const counts = new Map();
            res.rows.forEach(r => {
                const uid = r.userID || r.userid;
                counts.set(uid, (counts.get(uid) || 0) + 1);
            });
            
            allUsers = Array.from(counts.entries()).map(([user, count]) => ({ user, count })).sort((a, b) => b.count - a.count);
        } 
        else if (type === 'strongest') {
            let weaponsRes, lvlRes, skillsRes;
            try { weaponsRes = await sql.query(`SELECT * FROM user_weapons WHERE "guildID" = $1 AND "userID" != $2`, [guild.id, OWNER_ID]); }
            catch(e) { weaponsRes = await sql.query(`SELECT * FROM user_weapons WHERE guildid = $1 AND userid != $2`, [guild.id, OWNER_ID]).catch(()=>({rows:[]})); }
            
            try { lvlRes = await sql.query(`SELECT "user", "level" FROM levels WHERE "guild" = $1`, [guild.id]); }
            catch(e) { lvlRes = await sql.query(`SELECT userid as "user", level FROM levels WHERE guildid = $1`, [guild.id]).catch(()=>({rows:[]})); }
            
            try { skillsRes = await sql.query(`SELECT * FROM user_skills WHERE "guildID" = $1`, [guild.id]); }
            catch(e) { skillsRes = await sql.query(`SELECT * FROM user_skills WHERE guildid = $1`, [guild.id]).catch(()=>({rows:[]})); }
            
            const weapons = weaponsRes.rows;
            const levelsMap = new Map(lvlRes.rows.map(r => [r.user, safeNum(r.level) || 1]));
            
            const skillsMap = new Map();
            skillsRes.rows.forEach(r => {
                const uid = r.userID || r.userid;
                skillsMap.set(uid, (skillsMap.get(uid) || 0) + safeNum(r.skillLevel || r.skilllevel));
            });
            
            let stats = [];
            for (const w of weapons) {
                const conf = weaponsConfig.find(c => c.race === (w.raceName || w.racename));
                if(!conf) continue;
                const dmg = conf.base_damage + (conf.damage_increment * (safeNum(w.weaponLevel || w.weaponlevel) - 1));
                const uid = w.userID || w.userid;
                const playerLevel = levelsMap.get(uid) || 1;
                const hp = PROFILE_BASE_HP + (playerLevel * PROFILE_HP_PER_LEVEL);
                const skillLevelsTotal = skillsMap.get(uid) || 0;
                const powerScore = Math.floor(dmg + (hp * 0.5) + (playerLevel * 10) + (skillLevelsTotal * 20));
                stats.push({ user: uid, damage: dmg, hp, level: playerLevel, skillLevels: skillLevelsTotal, powerScore });
            }
            allUsers = stats.sort((a, b) => b.powerScore - a.powerScore);
        }

        if (targetUserId && targetUserId !== OWNER_ID) {
            const index = allUsers.findIndex(u => (u.user || u.userID || u.userid) === targetUserId);
            if (index !== -1) page = Math.ceil((index + 1) / ROWS_PER_PAGE);
        } else if (targetUserId === OWNER_ID) {
            page = 1;
        }

        const totalPages = Math.ceil(allUsers.length / ROWS_PER_PAGE) || 1;
        page = Math.max(1, Math.min(page, totalPages));

        let totalMora = 0n;
        if (type === 'mora') {
            allUsers.forEach(u => {
                totalMora += safeBigInt(u.total_wealth);
            });
        }

        const pageDataRaw = allUsers.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE);
        
        const enrichedData = await Promise.all(pageDataRaw.map(async (u) => {
            const uid = u.user || u.userID || u.userid;
            let dUser = client.users.cache.get(uid);
            if (!dUser) { 
                try { dUser = await client.users.fetch(uid); } catch(e){} 
            }
            
            if (type === 'mora' && u.total_wealth) {
                u.total_wealth_formatted = safeBigInt(u.total_wealth).toLocaleString();
            }

            return {
                uid: uid,
                db: u,
                name: dUser ? dUser.username : "مغامر مجهول",
                avatar: dUser ? dUser.displayAvatarURL({ extension: 'png', size: 128 }) : 'https://i.postimg.cc/7PMn1v8v/discord-avatar.png'
            };
        }));

        const imageBuffer = await generateTopImage(enrichedData, type, page, totalPages, targetUserId, { totalMora: type === 'mora' ? totalMora.toLocaleString() : null });

        return { imageBuffer, totalPages, currentPage: page };

    } catch (err) {
        console.error(`[Leaderboard Error] ${type}:`, err);
        return { imageBuffer: null, totalPages: 1, currentPage: 1 };
    }
}

function createButtons(activeId, page, totalPages) {
    const rowCat = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('top_level').setEmoji('<a:levelup:1437805366048985290>').setStyle(activeId === 'level' ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('top_mora').setEmoji('<:mora:1435647151349698621>').setStyle(activeId === 'mora' ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('top_streak').setEmoji('🔥').setStyle((activeId === 'streak' || activeId === 'media_streak') ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('top_strongest').setEmoji('⚔️').setStyle(activeId === 'strongest' ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('top_trophy').setEmoji('<a:mTrophy:1438797228826300518>').setStyle((activeId === 'rep' || activeId === 'achievements') ? ButtonStyle.Primary : ButtonStyle.Secondary)
    );

    const rowNav = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('leaderboard_prev').setEmoji('<:left:1439164494759723029>').setStyle(ButtonStyle.Secondary).setDisabled(page <= 1),
        new ButtonBuilder().setCustomId('leaderboard_find_me').setEmoji('📍').setStyle(ButtonStyle.Success), 
        new ButtonBuilder().setCustomId('leaderboard_next').setEmoji('<:right:1439164491072929915>').setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages)
    );
    
    return [rowCat, rowNav];
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('توب')
        .setDescription('عرض لوحات الصدارة كصورة احترافية.')
        .addStringOption(opt => opt.setName('التصنيف').setDescription('نوع الترتيب').addChoices(
            { name: 'Level', value: 'level' }, { name: 'Mora', value: 'mora' },
            { name: 'Streak', value: 'streak' }, { name: 'Strongest', value: 'strongest' },
            { name: 'Reputation', value: 'rep' }, { name: 'Achievements', value: 'achievements' }, 
            { name: 'Weekly', value: 'weekly_xp' }, { name: 'Daily', value: 'daily_xp' }, { name: 'Monthly', value: 'monthly_xp' }
        ))
        .addIntegerOption(opt => opt.setName('صفحة').setDescription('رقم الصفحة')),

    name: "top",
    aliases: ["توب", "المتصدرين", "topmora", "topstreak", "اغنى", "اقوى", "topweek", "توب-الاسبوع", "t", "lb"],
    category: "Leveling",
    cooldown: 10,
    description: "يعرض لوحات الصدارة",

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, guild, client, user, channelId;
        let currentPage = 1;
        let argType = 'level'; 

        if (isSlash) {
            interaction = interactionOrMessage;
            guild = interaction.guild;
            client = interaction.client;
            user = interaction.user;
            channelId = interaction.channelId;
            currentPage = interaction.options.getInteger('صفحة') || 1;
            argType = interaction.options.getString('التصنيف') || 'level';
            await interaction.deferReply();
        } else {
            message = interactionOrMessage;
            guild = message.guild;
            client = message.client;
            user = message.author;
            channelId = message.channel.id;
            
            let settingsRes;
            try { settingsRes = await client.sql.query(`SELECT "casinoChannelID" FROM settings WHERE "guild" = $1`, [guild.id]); }
            catch(e) { settingsRes = await client.sql.query(`SELECT casinochannelid as "casinoChannelID" FROM settings WHERE guild = $1`, [guild.id]).catch(()=>({rows:[]})); }
            
            const settings = settingsRes.rows[0];
            if (settings && (settings.casinoChannelID || settings.casinochannelid) === channelId) argType = 'mora'; 

            const cmd = message.content.split(' ')[0].slice(1).toLowerCase(); 
            if (cmd.includes('mora') || cmd.includes('اغنى')) argType = 'mora';
            else if (cmd.includes('streak')) argType = 'streak';
            else if (cmd.includes('week') || cmd.includes('اسبوع')) argType = 'weekly_xp';
            else if (cmd.includes('month') || cmd.includes('شهر')) argType = 'monthly_xp';
            else if (cmd.includes('daily') || cmd.includes('يومي')) argType = 'daily_xp';
            else if (cmd.includes('اقوى')) argType = 'strongest';
            else if (cmd.includes('achievements') || cmd.includes('انجازات')) argType = 'achievements';
            else if (cmd.includes('rep') || cmd.includes('سمعة')) argType = 'rep';
            
            if (args && args.length > 0) {
                const firstArg = args[0].toLowerCase();
                if (['week', 'weekly', 'w', 'اسبوع', 'اسبوعي'].includes(firstArg)) argType = 'weekly_xp';
                else if (['month', 'monthly', 'm', 'شهر', 'شهري'].includes(firstArg)) argType = 'monthly_xp';
                else if (['day', 'daily', 'd', 'يومي', 'يوم'].includes(firstArg)) argType = 'daily_xp';
                else if (['mora', 'money', 'coins', 'مورا', 'فلوس'].includes(firstArg)) argType = 'mora';
                else if (['streak', 'st', 'ستريك'].includes(firstArg)) argType = 'streak';
                else if (['achievements', 'ach', 'انجازات'].includes(firstArg)) argType = 'achievements';
                else if (['rep', 'reputation', 'سمعة', 'السمعة'].includes(firstArg)) argType = 'rep';
                
                const potentialPage = parseInt(firstArg);
                if (!isNaN(potentialPage)) currentPage = potentialPage;
                else if (args[1] && !isNaN(parseInt(args[1]))) currentPage = parseInt(args[1]);
            }
            
            message.channel.sendTyping();
        }

        const sql = client.sql;

        const data = await fetchLeaderboardData(client, sql, guild, argType, currentPage);
        currentPage = data.currentPage;
        
        let payload = { components: createButtons(argType, currentPage, data.totalPages) };
        if (data.imageBuffer) {
            payload.files = [new AttachmentBuilder(data.imageBuffer, { name: 'leaderboard.png' })];
        } else {
            payload.content = "❌ لا يـوجـد بـيـانـات لـعـرضـهـا حـالـيـاً ...";
        }

        let msg;
        if (isSlash) {
            msg = await interaction.editReply(payload);
        } else {
            msg = await message.reply(payload);
        }

        const collector = msg.createMessageComponentCollector({ 
            componentType: ComponentType.Button, 
            idle: 60000 
        });

        collector.on('collect', async i => {
            if (i.user.id !== user.id) return i.reply({ content: "هذه القائمة ليست لك.", ephemeral: true });
            
            await i.deferUpdate(); 

            let shouldFetchData = false;

            if (i.customId === 'leaderboard_next') {
                currentPage++;
                shouldFetchData = true;
            }
            else if (i.customId === 'leaderboard_prev') {
                currentPage--;
                shouldFetchData = true;
            }
            else if (i.customId === 'leaderboard_find_me') {
                const findData = await fetchLeaderboardData(client, sql, guild, argType, 1, user.id);
                if (findData.totalPages === 0) return i.followUp({ content: "لست موجوداً في هذا التصنيف!", ephemeral: true });
                currentPage = findData.currentPage; 
                shouldFetchData = true;
            } 
            else if (i.customId.startsWith('top_')) {
                const clicked = i.customId.replace('top_', '');
                
                if (clicked === 'level') {
                    if (argType === 'level') argType = 'weekly_xp';
                    else if (argType === 'weekly_xp') argType = 'monthly_xp';
                    else if (argType === 'monthly_xp') argType = 'daily_xp';
                    else argType = 'level';
                } else if (clicked === 'streak') {
                    argType = (argType === 'streak') ? 'media_streak' : 'streak';
                } else if (clicked === 'trophy') {
                    argType = (argType === 'rep') ? 'achievements' : 'rep';
                } else {
                    argType = clicked;
                }
                currentPage = 1;
                shouldFetchData = true;
            }

            if (shouldFetchData) {
                const newData = await fetchLeaderboardData(client, sql, guild, argType, currentPage, (i.customId === 'leaderboard_find_me' ? user.id : null));
                
                let updatePayload = { components: createButtons(argType, newData.currentPage, newData.totalPages), content: '' };
                if (newData.imageBuffer) {
                    updatePayload.files = [new AttachmentBuilder(newData.imageBuffer, { name: 'leaderboard.png' })];
                } else {
                    updatePayload.content = "❌ لا يـوجـد بـيـانـات لـعـرضـهـا حـالـيـاً ...";
                    updatePayload.files = [];
                }

                await i.editReply(updatePayload);
                currentPage = newData.currentPage; 
            }
        });

        collector.on('end', () => msg.edit({ components: [] }).catch(() => {}));
    },
    fetchLeaderboardData
};
