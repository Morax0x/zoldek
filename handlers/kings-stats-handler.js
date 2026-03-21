const { AttachmentBuilder, PermissionsBitField } = require("discord.js");
const { generateKingsBoardImage } = require('../generators/guild-boards-generator.js');
const { generateEpicAnnouncement } = require('../generators/announcement-generator.js');
const announcementsTexts = require('../json/announcements-texts.js');

let generateKingsAnnouncementImage;
try {
    generateKingsAnnouncementImage = require('../generators/kings-reward-generator.js').generateKingsAnnouncementImage;
} catch (e) {
    console.error("يرجى التأكد من إضافة ملف kings-reward-generator.js");
}

const OWNER_ID = "1145327691772481577"; // 👑 الإمبراطور مستثنى من المنافسة

function getTodayDateString() { 
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date());
}

async function ensureKingTrackerTable(db) {
    try {
        await db.query(`CREATE TABLE IF NOT EXISTS kings_board_tracker (
            "id" TEXT PRIMARY KEY,
            "userID" TEXT,
            "guildID" TEXT,
            "date" TEXT,
            "casino_profit" BIGINT DEFAULT 0,
            "mora_earned" BIGINT DEFAULT 0,
            "messages" BIGINT DEFAULT 0,
            "mora_donated" BIGINT DEFAULT 0,
            "vc_minutes" BIGINT DEFAULT 0,
            "fish_caught" BIGINT DEFAULT 0,
            "pvp_wins" BIGINT DEFAULT 0,
            "mora_stolen" BIGINT DEFAULT 0,
            "dungeon_floor" BIGINT DEFAULT 0
        )`);
        try { await db.query(`ALTER TABLE kings_board_tracker ADD COLUMN IF NOT EXISTS "dungeon_floor" BIGINT DEFAULT 0`); } catch(e){}
        try { await db.query(`ALTER TABLE kings_board_tracker ADD COLUMN IF NOT EXISTS "vc_minutes" BIGINT DEFAULT 0`); } catch(e){}
        try { await db.query(`ALTER TABLE kings_board_tracker ADD COLUMN IF NOT EXISTS "mora_stolen" BIGINT DEFAULT 0`); } catch(e){}
        try { await db.query(`CREATE TABLE IF NOT EXISTS kings_daily_payout ("dateStr" TEXT PRIMARY KEY)`); } catch(e){}
    } catch (e) {}
}

const lastKingsHash = new Map();

async function autoUpdateKingsBoard(client, db) {
    if (!db) return;

    for (const guild of client.guilds.cache.values()) {
        const guildId = guild.id;
        try {
            let settingsRes;
            try { settingsRes = await db.query(`SELECT * FROM settings WHERE "guild" = $1`, [guildId]); }
            catch(e) { settingsRes = await db.query(`SELECT * FROM settings WHERE guild = $1`, [guildId]); }
            const settings = settingsRes.rows[0];
            if (!settings || !settings.guildBoardChannelID || !settings.kingsBoardMessageID) continue; 

            const todayStr = getTodayDateString();

            // 🔥 استعلامات الملوك مع نظام فك التعادل (Tie-Breaker) وحماية السحابة 🔥
            let casinoDataRes;
            try { casinoDataRes = await db.query(`SELECT "userID", SUM(COALESCE("casino_profit", 0) + COALESCE("mora_earned", 0)) as val FROM kings_board_tracker WHERE "guildID" = $1 AND "date" = $2 AND "userID" != $3 GROUP BY "userID" HAVING SUM(COALESCE("casino_profit", 0) + COALESCE("mora_earned", 0)) > 0 ORDER BY val DESC, "userID" ASC LIMIT 1`, [guildId, todayStr, OWNER_ID]); }
            catch(e) { casinoDataRes = await db.query(`SELECT userid as "userID", SUM(COALESCE(casino_profit, 0) + COALESCE(mora_earned, 0)) as val FROM kings_board_tracker WHERE guildid = $1 AND date = $2 AND userid != $3 GROUP BY userid HAVING SUM(COALESCE(casino_profit, 0) + COALESCE(mora_earned, 0)) > 0 ORDER BY val DESC, userid ASC LIMIT 1`, [guildId, todayStr, OWNER_ID]); }
            const casinoData = casinoDataRes.rows[0];
            
            let abyssDataRes;
            try { abyssDataRes = await db.query(`SELECT "userID", "dungeon_floor" as val FROM kings_board_tracker WHERE "guildID" = $1 AND "date" = $2 AND "userID" != $3 AND "dungeon_floor" > 0 ORDER BY "dungeon_floor" DESC, "userID" ASC LIMIT 1`, [guildId, todayStr, OWNER_ID]); }
            catch(e) { abyssDataRes = await db.query(`SELECT userid as "userID", dungeon_floor as val FROM kings_board_tracker WHERE guildid = $1 AND date = $2 AND userid != $3 AND dungeon_floor > 0 ORDER BY dungeon_floor DESC, userid ASC LIMIT 1`, [guildId, todayStr, OWNER_ID]); }
            const abyssData = abyssDataRes.rows[0];
            
            let chatterDataRes;
            try { chatterDataRes = await db.query(`SELECT "userID", SUM(COALESCE("messages", 0)) as val FROM kings_board_tracker WHERE "guildID" = $1 AND "date" = $2 AND "userID" != $3 GROUP BY "userID" HAVING SUM(COALESCE("messages", 0)) > 0 ORDER BY val DESC, "userID" ASC LIMIT 1`, [guildId, todayStr, OWNER_ID]); }
            catch(e) { chatterDataRes = await db.query(`SELECT userid as "userID", SUM(COALESCE(messages, 0)) as val FROM kings_board_tracker WHERE guildid = $1 AND date = $2 AND userid != $3 GROUP BY userid HAVING SUM(COALESCE(messages, 0)) > 0 ORDER BY val DESC, userid ASC LIMIT 1`, [guildId, todayStr, OWNER_ID]); }
            const chatterData = chatterDataRes.rows[0];
            
            let philanDataRes;
            try { philanDataRes = await db.query(`SELECT "userID", SUM(COALESCE("mora_donated", 0)) as val FROM kings_board_tracker WHERE "guildID" = $1 AND "date" = $2 AND "userID" != $3 GROUP BY "userID" HAVING SUM(COALESCE("mora_donated", 0)) > 0 ORDER BY val DESC, "userID" ASC LIMIT 1`, [guildId, todayStr, OWNER_ID]); }
            catch(e) { philanDataRes = await db.query(`SELECT userid as "userID", SUM(COALESCE(mora_donated, 0)) as val FROM kings_board_tracker WHERE guildid = $1 AND date = $2 AND userid != $3 GROUP BY userid HAVING SUM(COALESCE(mora_donated, 0)) > 0 ORDER BY val DESC, userid ASC LIMIT 1`, [guildId, todayStr, OWNER_ID]); }
            const philanData = philanDataRes.rows[0];
            
            let voiceDataRes;
            try { voiceDataRes = await db.query(`SELECT "userID", SUM(COALESCE("vc_minutes", 0)) as val FROM kings_board_tracker WHERE "guildID" = $1 AND "date" = $2 AND "userID" != $3 GROUP BY "userID" HAVING SUM(COALESCE("vc_minutes", 0)) > 0 ORDER BY val DESC, "userID" ASC LIMIT 1`, [guildId, todayStr, OWNER_ID]); }
            catch(e) { voiceDataRes = await db.query(`SELECT userid as "userID", SUM(COALESCE(vc_minutes, 0)) as val FROM kings_board_tracker WHERE guildid = $1 AND date = $2 AND userid != $3 GROUP BY userid HAVING SUM(COALESCE(vc_minutes, 0)) > 0 ORDER BY val DESC, userid ASC LIMIT 1`, [guildId, todayStr, OWNER_ID]); }
            const voiceData = voiceDataRes.rows[0];
            
            let fisherDataRes;
            try { fisherDataRes = await db.query(`SELECT "userID", SUM(COALESCE("fish_caught", 0)) as val FROM kings_board_tracker WHERE "guildID" = $1 AND "date" = $2 AND "userID" != $3 GROUP BY "userID" HAVING SUM(COALESCE("fish_caught", 0)) > 0 ORDER BY val DESC, "userID" ASC LIMIT 1`, [guildId, todayStr, OWNER_ID]); }
            catch(e) { fisherDataRes = await db.query(`SELECT userid as "userID", SUM(COALESCE(fish_caught, 0)) as val FROM kings_board_tracker WHERE guildid = $1 AND date = $2 AND userid != $3 GROUP BY userid HAVING SUM(COALESCE(fish_caught, 0)) > 0 ORDER BY val DESC, userid ASC LIMIT 1`, [guildId, todayStr, OWNER_ID]); }
            const fisherData = fisherDataRes.rows[0];
            
            let pvpDataRes;
            try { pvpDataRes = await db.query(`SELECT "userID", SUM(COALESCE("pvp_wins", 0)) as val FROM kings_board_tracker WHERE "guildID" = $1 AND "date" = $2 AND "userID" != $3 GROUP BY "userID" HAVING SUM(COALESCE("pvp_wins", 0)) > 0 ORDER BY val DESC, "userID" ASC LIMIT 1`, [guildId, todayStr, OWNER_ID]); }
            catch(e) { pvpDataRes = await db.query(`SELECT userid as "userID", SUM(COALESCE(pvp_wins, 0)) as val FROM kings_board_tracker WHERE guildid = $1 AND date = $2 AND userid != $3 GROUP BY userid HAVING SUM(COALESCE(pvp_wins, 0)) > 0 ORDER BY val DESC, userid ASC LIMIT 1`, [guildId, todayStr, OWNER_ID]); }
            const pvpData = pvpDataRes.rows[0];
            
            let thiefDataRes;
            try { thiefDataRes = await db.query(`SELECT "userID", SUM(COALESCE("mora_stolen", 0)) as val FROM kings_board_tracker WHERE "guildID" = $1 AND "date" = $2 AND "userID" != $3 GROUP BY "userID" HAVING SUM(COALESCE("mora_stolen", 0)) > 0 ORDER BY val DESC, "userID" ASC LIMIT 1`, [guildId, todayStr, OWNER_ID]); }
            catch(e) { thiefDataRes = await db.query(`SELECT userid as "userID", SUM(COALESCE(mora_stolen, 0)) as val FROM kings_board_tracker WHERE guildid = $1 AND date = $2 AND userid != $3 GROUP BY userid HAVING SUM(COALESCE(mora_stolen, 0)) > 0 ORDER BY val DESC, userid ASC LIMIT 1`, [guildId, todayStr, OWNER_ID]); }
            const thiefData = thiefDataRes.rows[0];

            const currentHashArray = [
                casinoData ? `${casinoData.userID}:${casinoData.val}` : 'none',
                abyssData ? `${abyssData.userID}:${abyssData.val}` : 'none',
                chatterData ? `${chatterData.userID}:${chatterData.val}` : 'none',
                philanData ? `${philanData.userID}:${philanData.val}` : 'none',
                voiceData ? `${voiceData.userID}:${voiceData.val}` : 'none',
                fisherData ? `${fisherData.userID}:${fisherData.val}` : 'none',
                pvpData ? `${pvpData.userID}:${pvpData.val}` : 'none',
                thiefData ? `${thiefData.userID}:${thiefData.val}` : 'none'
            ];
            
            const currentHash = currentHashArray.join('|');
            const oldHash = lastKingsHash.get(guildId);

            if (oldHash === currentHash) continue; 

            const boardChannel = guild.channels.cache.get(settings.guildBoardChannelID);
            const announceChannel = settings.guildAnnounceChannelID ? guild.channels.cache.get(settings.guildAnnounceChannelID) : null;

            if (boardChannel) {
                try {
                    const kingsMsg = await boardChannel.messages.fetch(settings.kingsBoardMessageID);
                    
                    async function getKingInfo(dataObj, suffix, title, emoji) {
                        if (!dataObj) return { title, emoji, displayName: 'لا أحد حتى الآن', avatarUrl: null, valueText: `0 ${suffix}` };
                        try {
                            const uID = dataObj.userID || dataObj.userid;
                            let member = await guild.members.fetch(uID).catch(()=>null);
                            let user = member ? member.user : await client.users.fetch(uID).catch(()=>null);
                            if (user) {
                                return {
                                    title, emoji,
                                    displayName: member ? member.displayName : user.username,
                                    avatarUrl: user.displayAvatarURL({ extension: 'png', size: 128 }),
                                    valueText: `${parseInt(dataObj.val).toLocaleString()} ${suffix}`
                                };
                            }
                        } catch (e) {}
                        return { title, emoji, displayName: 'مغامر مجهول', avatarUrl: null, valueText: `${parseInt(dataObj.val).toLocaleString()} ${suffix}` };
                    }

                    const kingsArray = [
                        await getKingInfo(casinoData, 'مورا', 'ملك الكازينو', '🎰'),
                        await getKingInfo(abyssData, 'طابق', 'ملك الهاوية', '🌑'),
                        await getKingInfo(chatterData, 'رسالة', 'ملك البلاغة', '🗣️'), 
                        await getKingInfo(philanData, 'مورا', 'ملك الكرم', '🤝'),
                        await getKingInfo(voiceData, 'دقيقة', 'ملك الصوت', '🎙️'),
                        await getKingInfo(fisherData, 'سمكة', 'ملك القنص', '🎣'),
                        await getKingInfo(pvpData, 'انتصار', 'ملك النزاع', '⚔️'),
                        await getKingInfo(thiefData, 'مورا', 'ملك اللصوص', '🥷')
                    ];

                    const kingsBoardBuffer = await generateKingsBoardImage(kingsArray);
                    const kingsBoardAttachment = new AttachmentBuilder(kingsBoardBuffer, { name: `kings-board-${Date.now()}.png` });
                    await kingsMsg.edit({ files: [kingsBoardAttachment] }).catch(()=>{});

                    if (oldHash) {
                        const oldParts = oldHash.split('|');
                        const titles = ['ملك الكازينو', 'ملك الهاوية', 'ملك البلاغة', 'ملك الكرم', 'ملك الصوت', 'ملك القنص', 'ملك النزاع', 'ملك اللصوص'];
                        const suffixes = ['مورا', 'طابق', 'رسالة', 'مورا', 'دقيقة', 'سمكة', 'انتصار', 'مورا'];
                        const colors = ['#FFD700', '#9D00FF', '#00BFFF', '#FF8C00', '#00FF88', '#00CED1', '#DC143C', '#32CD32'];
                        const roleCols = ['roleCasinoKing', 'roleAbyss', 'roleChatter', 'rolePhilanthropist', 'roleVoice', 'roleFisherKing', 'rolePvPKing', 'roleThief'];

                        for (let i = 0; i < 8; i++) {
                            // 🛡️ درع منع السبام: لن يرسل إشعاراً إذا كانت الحالة القديمة "none" لعدم إزعاج الرومات عند التشغيل الأول
                            if (oldParts[i] !== currentHashArray[i] && currentHashArray[i] !== 'none' && oldParts[i] !== 'none') {
                                const [newUserId, newVal] = currentHashArray[i].split(':');
                                const [oldUserId] = oldParts[i].split(':');

                                if (newUserId !== oldUserId && newUserId !== 'none') {
                                    
                                    const roleId = settings[roleCols[i]];
                                    if (roleId) {
                                        const targetRole = guild.roles.cache.get(roleId);
                                        if (targetRole) {
                                            targetRole.members.forEach(async (member) => {
                                                if (member.id !== newUserId) await member.roles.remove(targetRole).catch(() => {});
                                            });
                                            const newKingMem = await guild.members.fetch(newUserId).catch(() => null);
                                            if (newKingMem && !newKingMem.roles.cache.has(roleId)) await newKingMem.roles.add(targetRole).catch(() => {});
                                        }
                                    }

                                    let notifDataRes;
                                    try { notifDataRes = await db.query(`SELECT "kingsNotif" FROM quest_notifications WHERE "id" = $1`, [`${newUserId}-${guildId}`]); }
                                    catch(e) { notifDataRes = await db.query(`SELECT kingsnotif as "kingsNotif" FROM quest_notifications WHERE id = $1`, [`${newUserId}-${guildId}`]).catch(()=>({rows:[]})); }
                                    
                                    const notifData = notifDataRes.rows[0];
                                    if (!notifData || Number(notifData.kingsNotif) !== 0) {
                                        const kingMsgContent = announcementsTexts.getKingMessage(`<@${newUserId}>`, titles[i], `${parseInt(newVal).toLocaleString()} ${suffixes[i]}`, client);
                                        
                                        if (announceChannel) {
                                            let files = [];
                                            if (announceChannel.permissionsFor(guild.members.me)?.has(PermissionsBitField.Flags.AttachFiles)) {
                                                try {
                                                    const newKingUser = await client.users.fetch(newUserId).catch(()=>null);
                                                    let oldUserObj = 'EMPTY';
                                                    if (oldUserId) {
                                                        const oldMem = await guild.members.fetch(oldUserId).catch(()=>null);
                                                        if (oldMem) oldUserObj = oldMem.user;
                                                    }
                                                    
                                                    const description = oldUserObj === 'EMPTY' ? `اعتلى العرش بكل جدارة!` : `انتزع التاج بقوة واعتلى القمة!`;

                                                    if (newKingUser) {
                                                        const buffer = await generateEpicAnnouncement(newKingUser, '👑 انـتـزاع عـرش 👑', titles[i], description, `الرقم القياسي: ${parseInt(newVal).toLocaleString()} ${suffixes[i]}`, colors[i], oldUserObj, true);
                                                        files.push(new AttachmentBuilder(buffer, { name: `new-king-${Date.now()}.png` }));
                                                    }
                                                } catch(e) {}
                                            }
                                            await announceChannel.send({ content: kingMsgContent, files: files }).catch(()=>{});
                                        }
                                    }
                                }
                            }
                        }
                    } 
                } catch (err) {}
                
                lastKingsHash.set(guildId, currentHash);
            } 
        } catch (err) {} 
    }
}

async function rewardDailyKings(client, db) {
    if (!db) return;
    try {
        await ensureKingTrackerTable(db); 

        // نحسب تاريخ الأمس بتوقيت السعودية لأن دالة التوزيع تعمل في الساعة 00:00 لليوم الجديد
        const yesterdayKSA = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Riyadh" }));
        yesterdayKSA.setDate(yesterdayKSA.getDate() - 1);
        const targetDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(yesterdayKSA);

        let isPaidRes;
        try { isPaidRes = await db.query(`SELECT * FROM kings_daily_payout WHERE "dateStr" = $1`, [targetDateStr]); }
        catch(e) { isPaidRes = await db.query(`SELECT * FROM kings_daily_payout WHERE datestr = $1`, [targetDateStr]).catch(()=>({rows:[]})); }
        
        if (isPaidRes.rows.length > 0) return; 

        for (const guild of client.guilds.cache.values()) {
            const guildId = guild.id;
            try {
                let settingsRes;
                try { settingsRes = await db.query(`SELECT * FROM settings WHERE "guild" = $1`, [guildId]); }
                catch(e) { settingsRes = await db.query(`SELECT * FROM settings WHERE guild = $1`, [guildId]); }
                
                const settings = settingsRes.rows[0];
                if (!settings || (!settings.guildAnnounceChannelID && !settings.guildannouncechannelid)) continue;

                let casinoDataRes;
                try { casinoDataRes = await db.query(`SELECT "userID" FROM kings_board_tracker WHERE "guildID" = $1 AND "date" = $2 AND "userID" != $3 GROUP BY "userID" HAVING SUM(COALESCE("casino_profit", 0) + COALESCE("mora_earned", 0)) > 0 ORDER BY SUM(COALESCE("casino_profit", 0) + COALESCE("mora_earned", 0)) DESC, "userID" ASC LIMIT 1`, [guildId, targetDateStr, OWNER_ID]); }
                catch(e) { casinoDataRes = await db.query(`SELECT userid as "userID" FROM kings_board_tracker WHERE guildid = $1 AND date = $2 AND userid != $3 GROUP BY userid HAVING SUM(COALESCE(casino_profit, 0) + COALESCE(mora_earned, 0)) > 0 ORDER BY SUM(COALESCE(casino_profit, 0) + COALESCE(mora_earned, 0)) DESC, userid ASC LIMIT 1`, [guildId, targetDateStr, OWNER_ID]); }
                const casinoData = casinoDataRes.rows[0];
                
                let abyssDataRes;
                try { abyssDataRes = await db.query(`SELECT "userID" FROM kings_board_tracker WHERE "guildID" = $1 AND "date" = $2 AND "userID" != $3 AND "dungeon_floor" > 0 ORDER BY "dungeon_floor" DESC, "userID" ASC LIMIT 1`, [guildId, targetDateStr, OWNER_ID]); }
                catch(e) { abyssDataRes = await db.query(`SELECT userid as "userID" FROM kings_board_tracker WHERE guildid = $1 AND date = $2 AND userid != $3 AND dungeon_floor > 0 ORDER BY dungeon_floor DESC, userid ASC LIMIT 1`, [guildId, targetDateStr, OWNER_ID]); }
                const abyssData = abyssDataRes.rows[0];
                
                let chatterDataRes;
                try { chatterDataRes = await db.query(`SELECT "userID" FROM kings_board_tracker WHERE "guildID" = $1 AND "date" = $2 AND "userID" != $3 GROUP BY "userID" HAVING SUM(COALESCE("messages", 0)) > 0 ORDER BY SUM(COALESCE("messages", 0)) DESC, "userID" ASC LIMIT 1`, [guildId, targetDateStr, OWNER_ID]); }
                catch(e) { chatterDataRes = await db.query(`SELECT userid as "userID" FROM kings_board_tracker WHERE guildid = $1 AND date = $2 AND userid != $3 GROUP BY userid HAVING SUM(COALESCE(messages, 0)) > 0 ORDER BY SUM(COALESCE(messages, 0)) DESC, userid ASC LIMIT 1`, [guildId, targetDateStr, OWNER_ID]); }
                const chatterData = chatterDataRes.rows[0];
                
                let philanDataRes;
                try { philanDataRes = await db.query(`SELECT "userID" FROM kings_board_tracker WHERE "guildID" = $1 AND "date" = $2 AND "userID" != $3 GROUP BY "userID" HAVING SUM(COALESCE("mora_donated", 0)) > 0 ORDER BY SUM(COALESCE("mora_donated", 0)) DESC, "userID" ASC LIMIT 1`, [guildId, targetDateStr, OWNER_ID]); }
                catch(e) { philanDataRes = await db.query(`SELECT userid as "userID" FROM kings_board_tracker WHERE guildid = $1 AND date = $2 AND userid != $3 GROUP BY userid HAVING SUM(COALESCE(mora_donated, 0)) > 0 ORDER BY SUM(COALESCE(mora_donated, 0)) DESC, userid ASC LIMIT 1`, [guildId, targetDateStr, OWNER_ID]); }
                const philanData = philanDataRes.rows[0];
                
                let voiceDataRes;
                try { voiceDataRes = await db.query(`SELECT "userID" FROM kings_board_tracker WHERE "guildID" = $1 AND "date" = $2 AND "userID" != $3 GROUP BY "userID" HAVING SUM(COALESCE("vc_minutes", 0)) > 0 ORDER BY SUM(COALESCE("vc_minutes", 0)) DESC, "userID" ASC LIMIT 1`, [guildId, targetDateStr, OWNER_ID]); }
                catch(e) { voiceDataRes = await db.query(`SELECT userid as "userID" FROM kings_board_tracker WHERE guildid = $1 AND date = $2 AND userid != $3 GROUP BY userid HAVING SUM(COALESCE(vc_minutes, 0)) > 0 ORDER BY SUM(COALESCE(vc_minutes, 0)) DESC, userid ASC LIMIT 1`, [guildId, targetDateStr, OWNER_ID]); }
                const voiceData = voiceDataRes.rows[0];
                
                let fisherDataRes;
                try { fisherDataRes = await db.query(`SELECT "userID" FROM kings_board_tracker WHERE "guildID" = $1 AND "date" = $2 AND "userID" != $3 GROUP BY "userID" HAVING SUM(COALESCE("fish_caught", 0)) > 0 ORDER BY SUM(COALESCE("fish_caught", 0)) DESC, "userID" ASC LIMIT 1`, [guildId, targetDateStr, OWNER_ID]); }
                catch(e) { fisherDataRes = await db.query(`SELECT userid as "userID" FROM kings_board_tracker WHERE guildid = $1 AND date = $2 AND userid != $3 GROUP BY userid HAVING SUM(COALESCE(fish_caught, 0)) > 0 ORDER BY SUM(COALESCE(fish_caught, 0)) DESC, userid ASC LIMIT 1`, [guildId, targetDateStr, OWNER_ID]); }
                const fisherData = fisherDataRes.rows[0];
                
                let pvpDataRes;
                try { pvpDataRes = await db.query(`SELECT "userID" FROM kings_board_tracker WHERE "guildID" = $1 AND "date" = $2 AND "userID" != $3 GROUP BY "userID" HAVING SUM(COALESCE("pvp_wins", 0)) > 0 ORDER BY SUM(COALESCE("pvp_wins", 0)) DESC, "userID" ASC LIMIT 1`, [guildId, targetDateStr, OWNER_ID]); }
                catch(e) { pvpDataRes = await db.query(`SELECT userid as "userID" FROM kings_board_tracker WHERE guildid = $1 AND date = $2 AND userid != $3 GROUP BY userid HAVING SUM(COALESCE(pvp_wins, 0)) > 0 ORDER BY SUM(COALESCE(pvp_wins, 0)) DESC, userid ASC LIMIT 1`, [guildId, targetDateStr, OWNER_ID]); }
                const pvpData = pvpDataRes.rows[0];
                
                let thiefDataRes;
                try { thiefDataRes = await db.query(`SELECT "userID" FROM kings_board_tracker WHERE "guildID" = $1 AND "date" = $2 AND "userID" != $3 GROUP BY "userID" HAVING SUM(COALESCE("mora_stolen", 0)) > 0 ORDER BY SUM(COALESCE("mora_stolen", 0)) DESC, "userID" ASC LIMIT 1`, [guildId, targetDateStr, OWNER_ID]); }
                catch(e) { thiefDataRes = await db.query(`SELECT userid as "userID" FROM kings_board_tracker WHERE guildid = $1 AND date = $2 AND userid != $3 GROUP BY userid HAVING SUM(COALESCE(mora_stolen, 0)) > 0 ORDER BY SUM(COALESCE(mora_stolen, 0)) DESC, userid ASC LIMIT 1`, [guildId, targetDateStr, OWNER_ID]); }
                const thiefData = thiefDataRes.rows[0];

                const winnersRaw = [
                    { id: casinoData?.userID, title: 'ملك الكازينو', rep: 5, roleCol: 'roleCasinoKing' },
                    { id: abyssData?.userID, title: 'ملك الهاوية', rep: 4, roleCol: 'roleAbyss' },
                    { id: chatterData?.userID, title: 'ملك البلاغة', rep: 7, roleCol: 'roleChatter' },
                    { id: philanData?.userID, title: 'ملك الكرم', rep: 1, roleCol: 'rolePhilanthropist' },
                    { id: voiceData?.userID, title: 'ملك الصوت', rep: 4, roleCol: 'roleVoice' },
                    { id: fisherData?.userID, title: 'ملك القنص', rep: 2, roleCol: 'roleFisherKing' },
                    { id: pvpData?.userID, title: 'ملك النزاع', rep: 3, roleCol: 'rolePvPKing' },
                    { id: thiefData?.userID, title: 'ملك اللصوص', rep: 3, roleCol: 'roleThief' }
                ].filter(w => w.id && w.id !== 'none');

                if (winnersRaw.length === 0) continue;

                let kingsToAnnounce = [];

                for (const w of winnersRaw) {
                    const targetRoleCol = settings[w.roleCol] || settings[w.roleCol.toLowerCase()];
                    if (targetRoleCol) {
                        const oldRole = guild.roles.cache.get(targetRoleCol);
                        if (oldRole) {
                            for (const member of oldRole.members.values()) {
                                await member.roles.remove(oldRole, "تجريد العرش اليومي").catch(()=>{});
                            }
                        }
                    }

                    const member = await guild.members.fetch(w.id).catch(()=>null);
                    const user = member ? member.user : await client.users.fetch(w.id).catch(()=>null);
                    
                    if (member && targetRoleCol) {
                        member.roles.add(targetRoleCol, `تتويج بلقب ${w.title}`).catch(()=>{});
                    }

                    if (user) {
                        try {
                            await db.query(`INSERT INTO user_reputation ("userID", "guildID", "rep_points") VALUES ($1, $2, $3) ON CONFLICT("userID", "guildID") DO UPDATE SET "rep_points" = user_reputation."rep_points" + $4`, [w.id, guildId, w.rep, w.rep]);
                        } catch(e) {
                            await db.query(`INSERT INTO user_reputation (userid, guildid, rep_points) VALUES ($1, $2, $3) ON CONFLICT(userid, guildid) DO UPDATE SET rep_points = user_reputation.rep_points + $4`, [w.id, guildId, w.rep, w.rep]).catch(()=>{});
                        }
                        kingsToAnnounce.push({
                            title: w.title,
                            name: member ? member.displayName : user.username,
                            rep: w.rep
                        });
                    }
                }

                const announceChannelId = settings.guildAnnounceChannelID || settings.guildannouncechannelid;
                const announceChannel = guild.channels.cache.get(announceChannelId);
                
                if (announceChannel && kingsToAnnounce.length > 0) {
                    const perms = announceChannel.permissionsFor(guild.members.me);
                    if (perms && perms.has(PermissionsBitField.Flags.SendMessages) && perms.has(PermissionsBitField.Flags.AttachFiles)) {
                        try {
                            if (generateKingsAnnouncementImage) {
                                const buffer = await generateKingsAnnouncementImage(kingsToAnnounce, targetDateStr);
                                const attachment = new AttachmentBuilder(buffer, { name: 'kings-board.png' });
                                
                                await announceChannel.send({
                                    content: `👑 تـتـويـج مـلـوك الإمـبـراطـوريـة 👑`,
                                    files: [attachment]
                                }).catch(()=>{});
                            }
                        } catch(e) {}
                    }
                }
            } catch (err) {} 
        }

        try { await db.query(`INSERT INTO kings_daily_payout ("dateStr") VALUES ($1)`, [targetDateStr]); }
        catch(e) { await db.query(`INSERT INTO kings_daily_payout (datestr) VALUES ($1)`, [targetDateStr]).catch(()=>{}); }

    } catch (e) { console.error("Reward Daily Kings Error:", e); }
}

const statsQueue = new Map();
let isProcessingQueue = false;

async function processStatsQueue(client) {
    const db = client.sql;
    if (!db || isProcessingQueue || statsQueue.size === 0) return;
    isProcessingQueue = true;

    const currentBatch = new Map(statsQueue);
    statsQueue.clear();

    try {
        await ensureKingTrackerTable(db);
        
        const queries = [];

        for (const [key, stats] of currentBatch.entries()) {
            const [userId, guildId, todayStr] = key.split('|');
            const dailyID = `${userId}-${guildId}-${todayStr}`;

            for (const [statName, addedVal] of Object.entries(stats)) {
                if (statName === 'max_dungeon_floor') {
                    queries.push((async () => {
                        try {
                            const rowRes = await db.query(`SELECT "max_dungeon_floor" FROM levels WHERE "user" = $1 AND "guild" = $2`, [userId, guildId]);
                            const row = rowRes.rows[0];
                            if (row) {
                                if (addedVal > (Number(row.max_dungeon_floor) || 0)) {
                                    await db.query(`UPDATE levels SET "max_dungeon_floor" = $1 WHERE "user" = $2 AND "guild" = $3`, [addedVal, userId, guildId]);
                                }
                            } else {
                                await db.query(`INSERT INTO levels ("user", "guild", "xp", "level", "totalXP", "mora", "max_dungeon_floor") VALUES ($1, $2, 0, 1, 0, 0, $3)`, [userId, guildId, addedVal]);
                            }
                        } catch(e){}

                        try {
                            await db.query(`
                                INSERT INTO kings_board_tracker ("id", "userID", "guildID", "date", "dungeon_floor") 
                                VALUES ($1, $2, $3, $4, $5)
                                ON CONFLICT("id") DO UPDATE SET "dungeon_floor" = GREATEST(COALESCE(kings_board_tracker."dungeon_floor", 0), $6)
                            `, [dailyID, userId, guildId, todayStr, addedVal, addedVal]);
                        } catch(e){}
                    })());
                } else {
                    queries.push((async () => {
                        try {
                            await db.query(`
                                INSERT INTO kings_board_tracker ("id", "userID", "guildID", "date", "${statName}") 
                                VALUES ($1, $2, $3, $4, $5)
                                ON CONFLICT("id") DO UPDATE SET "${statName}" = COALESCE(kings_board_tracker."${statName}", 0) + $6
                            `, [dailyID, userId, guildId, todayStr, addedVal, addedVal]);
                        } catch(e) {
                            try {
                                await db.query(`
                                    INSERT INTO kings_board_tracker (id, userid, guildid, date, ${statName}) 
                                    VALUES ($1, $2, $3, $4, $5)
                                    ON CONFLICT(id) DO UPDATE SET ${statName} = COALESCE(kings_board_tracker.${statName}, 0) + $6
                                `, [dailyID, userId, guildId, todayStr, addedVal, addedVal]);
                            } catch(e2) {}
                        }

                        try {
                            await db.query(`
                                INSERT INTO user_daily_stats ("id", "userID", "guildID", "date", "${statName}") 
                                VALUES ($1, $2, $3, $4, $5)
                                ON CONFLICT("id") DO UPDATE SET "${statName}" = COALESCE(user_daily_stats."${statName}", 0) + $6
                            `, [dailyID, userId, guildId, todayStr, addedVal, addedVal]);
                        } catch(e) {
                            try {
                                await db.query(`
                                    INSERT INTO user_daily_stats (id, userid, guildid, date, ${statName}) 
                                    VALUES ($1, $2, $3, $4, $5)
                                    ON CONFLICT(id) DO UPDATE SET ${statName} = COALESCE(user_daily_stats.${statName}, 0) + $6
                                `, [dailyID, userId, guildId, todayStr, addedVal, addedVal]);
                            } catch(e2) {}
                        }
                    })());
                }
            }
        }

        await Promise.allSettled(queries);
        await autoUpdateKingsBoard(client, db).catch(()=>{});

    } catch (error) {
        console.error("❌ [Stats Processor DB Error]:", error.message);
    } finally {
        isProcessingQueue = false;
    }
}

async function updateGuildStat(client, guildId, userId, statName, valueToAdd) {
    try {
        const db = client.sql; 
        if (!db) return;
        await ensureKingTrackerTable(db);

        const todayStr = getTodayDateString(); 
        const addedVal = parseInt(valueToAdd) || 0;
        
        if (addedVal === 0 && statName !== 'max_dungeon_floor') return;

        if (statName === 'max_dungeon_floor') {
            const rowRes = await db.query(`SELECT "max_dungeon_floor" FROM levels WHERE "user" = $1 AND "guild" = $2`, [userId, guildId]);
            const row = rowRes.rows[0];
            if (row) {
                if (addedVal > (Number(row.max_dungeon_floor) || 0)) {
                    await db.query(`UPDATE levels SET "max_dungeon_floor" = $1 WHERE "user" = $2 AND "guild" = $3`, [addedVal, userId, guildId]);
                }
            } else {
                await db.query(`INSERT INTO levels ("user", "guild", "xp", "level", "totalXP", "mora", "max_dungeon_floor") VALUES ($1, $2, 0, 1, 0, 0, $3)`, [userId, guildId, addedVal]);
            }

            const dailyID = `${userId}-${guildId}-${todayStr}`;
            await db.query(`
                INSERT INTO kings_board_tracker ("id", "userID", "guildID", "date", "dungeon_floor") 
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT("id") DO UPDATE SET "dungeon_floor" = GREATEST(COALESCE(kings_board_tracker."dungeon_floor", 0), $6)
            `, [dailyID, userId, guildId, todayStr, addedVal, addedVal]);

        } else {
            const dailyID = `${userId}-${guildId}-${todayStr}`;
            const colName = statName;
            
            await db.query(`
                INSERT INTO kings_board_tracker ("id", "userID", "guildID", "date", "${colName}") 
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT("id") DO UPDATE SET "${colName}" = COALESCE(kings_board_tracker."${colName}", 0) + $6
            `, [dailyID, userId, guildId, todayStr, addedVal, addedVal]);

            try {
                await db.query(`
                    INSERT INTO user_daily_stats ("id", "userID", "guildID", "date", "${colName}") 
                    VALUES ($1, $2, $3, $4, $5)
                    ON CONFLICT("id") DO UPDATE SET "${colName}" = COALESCE(user_daily_stats."${colName}", 0) + $6
                `, [dailyID, userId, guildId, todayStr, addedVal, addedVal]);
            } catch(e){}
        }
    } catch (error) {
        console.error("[Guild Stat Update Error]:", error);
    }
}

module.exports = { autoUpdateKingsBoard, updateGuildStat, rewardDailyKings, processStatsQueue };
