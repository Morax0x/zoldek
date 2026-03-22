const { createRandomDropGiveaway } = require('./giveaway-handler.js');
const { autoUpdateKingsBoard, rewardDailyKings } = require('./kings-stats-handler.js'); 
const { checkLoanPayments } = require('./loan-handler.js'); 
const { checkFarmIncome } = require('./farm-income.js'); 
const handleMarketCrash = require('./market-crash-handler.js');
const { checkDailyStreaks, checkDailyMediaStreaks, sendMediaStreakReminders, sendDailyMediaUpdate, sendStreakWarnings } = require("../streak-handler.js");
const { checkUnjailTask } = require('./report-handler.js'); 
const marketConfig = require('../json/market-items.json');

const RECENT_MESSAGE_WINDOW = 2 * 60 * 60 * 1000; 

module.exports = (client, db) => {
    // 1. تحديث أسعار السوق
    async function updateMarketPrices() {
        try {
            if (!client.marketLocks) client.marketLocks = new Set();
            let res;
            try { res = await db.query('SELECT * FROM market_items'); }
            catch(e) { return; }
            
            const allItems = res.rows;
            if (allItems.length === 0) return;

            // 🔥 سحب حالة السوق من الإعدادات 🔥
            let marketStatus = 'normal';
            try {
                let statusRes = await db.query(`SELECT "marketStatus" FROM settings WHERE "marketStatus" IS NOT NULL LIMIT 1`).catch(() => db.query(`SELECT marketstatus as "marketStatus" FROM settings WHERE marketstatus IS NOT NULL LIMIT 1`));
                if (statusRes && statusRes.rows[0]) {
                    marketStatus = statusRes.rows[0].marketStatus || 'normal';
                }
            } catch(e) {}

            await db.query('BEGIN');
            const CRASH_PRICE = 10; 

            for (const item of allItems) {
                const itemId = item.id || item.itemID;
                if (client.marketLocks.has(itemId)) continue;

                let resOwned;
                try { resOwned = await db.query(`SELECT SUM(quantity) as total FROM user_portfolio WHERE "itemID" = $1`, [itemId]); }
                catch(e) { resOwned = await db.query(`SELECT SUM(quantity) as total FROM user_portfolio WHERE itemid = $1`, [itemId]).catch(()=>({rows:[{total: 0}]})); }
                
                const totalOwned = (resOwned && resOwned.rows && resOwned.rows[0] && resOwned.rows[0].total) ? Number(resOwned.rows[0].total) : 0;

                let randomPercent = (Math.random() * 0.20) - 0.10;
                
                // 🔥 تطبيق تأثير حالة السوق 🔥
                if (marketStatus === 'boom') {
                    randomPercent = (Math.random() * 0.20) - 0.05; 
                } else if (marketStatus === 'recession') {
                    randomPercent = (Math.random() * 0.20) - 0.15; 
                }

                const saturationPenalty = (totalOwned / 2000) * 0.02;
                let finalChangePercent = randomPercent - saturationPenalty;

                const oldPrice = Number(item.currentPrice || item.currentprice || 0);
                if (oldPrice > 5000 && finalChangePercent > 0) finalChangePercent /= 2;
                if (finalChangePercent < -0.30) finalChangePercent = -0.30;

                let newPrice = Math.floor(oldPrice * (1 + finalChangePercent));

                if (newPrice <= CRASH_PRICE) {
                    setTimeout(() => handleMarketCrash(client, db, item), 0); 
                    continue; 
                }
                
                if (newPrice > 50000) newPrice = 50000;

                const changeAmount = newPrice - oldPrice;
                const displayPercent = oldPrice > 0 ? ((changeAmount / oldPrice) * 100).toFixed(2) : 0;
                
                try { await db.query(`UPDATE market_items SET "currentPrice" = $1, "lastChangePercent" = $2, "lastChange" = $3 WHERE "id" = $4`, [newPrice, displayPercent, changeAmount, itemId]); }
                catch(e) { await db.query(`UPDATE market_items SET currentprice = $1, lastchangepercent = $2, lastchange = $3 WHERE id = $4`, [newPrice, displayPercent, changeAmount, itemId]).catch(()=>{}); }
            }
            await db.query('COMMIT');
        } catch (err) {
            await db.query('ROLLBACK').catch(()=>{});
        }
    }

    // 2. فحص الرتب المؤقتة المنتهية 
    async function checkTemporaryRoles() {
        const now = Date.now();
        try {
            let expiredRolesRes;
            try { expiredRolesRes = await db.query(`SELECT * FROM temporary_roles WHERE "expiresAt" <= $1`, [now]); }
            catch(e) { expiredRolesRes = await db.query(`SELECT * FROM temporary_roles WHERE expiresat <= $1`, [now]).catch(()=>({rows:[]})); }
            
            const expiredRoles = expiredRolesRes.rows;
            if (expiredRoles.length === 0) return;

            await db.query('BEGIN');
            for (const record of expiredRoles) {
                const uId = record.userID || record.userid;
                const gId = record.guildID || record.guildid;
                const rId = record.roleID || record.roleid;
                try { await db.query(`DELETE FROM temporary_roles WHERE "userID" = $1 AND "guildID" = $2 AND "roleID" = $3`, [uId, gId, rId]); }
                catch(e) { await db.query(`DELETE FROM temporary_roles WHERE userid = $1 AND guildid = $2 AND roleid = $3`, [uId, gId, rId]).catch(()=>{}); }
            }
            await db.query('COMMIT');

            for (const record of expiredRoles) {
                const gId = record.guildID || record.guildid;
                const uId = record.userID || record.userid;
                const rId = record.roleID || record.roleid;

                const guild = client.guilds.cache.get(gId);
                if (!guild) continue;
                const member = await guild.members.fetch(uId).catch(() => null);
                const role = guild.roles.cache.get(rId);
                if (member && role) {
                    member.roles.remove(role).catch(() => {});
                }
            }
        } catch (err) {
            await db.query('ROLLBACK').catch(()=>{});
        }
    }

    // 3. حساب فوائد البنك 
    const calculateInterest = async () => {
        const now = Date.now();
        const INTEREST_RATE = 0.0005; 
        const COOLDOWN = 24 * 60 * 60 * 1000; 
        const INACTIVITY_LIMIT = 7 * 24 * 60 * 60 * 1000; 
        
        try {
            let allUsersRes;
            try { allUsersRes = await db.query(`SELECT "user", "guild", "bank", "lastInterest", "lastDaily", "lastWork" FROM levels WHERE "bank" > 0`); }
            catch(e) { allUsersRes = await db.query(`SELECT userid as "user", guildid as "guild", bank, lastinterest as "lastInterest", lastdaily as "lastDaily", lastwork as "lastWork" FROM levels WHERE bank > 0`).catch(()=>({rows:[]})); }
            
            const allUsers = allUsersRes.rows;
            if (allUsers.length === 0) return;

            const batchSize = 100; 
            for (let i = 0; i < allUsers.length; i += batchSize) {
                const batch = allUsers.slice(i, i + batchSize);
                await db.query('BEGIN');
                
                for (const user of batch) {
                    const lastInterest = Number(user.lastInterest || 0);
                    const lastDaily = Number(user.lastDaily || 0);
                    const lastWork = Number(user.lastWork || 0);
                    const userId = user.user;
                    const guildId = user.guild;

                    if ((now - lastInterest) >= COOLDOWN) {
                        const timeSinceDaily = now - lastDaily;
                        const timeSinceWork = now - lastWork;
                        
                        if (timeSinceDaily > INACTIVITY_LIMIT && timeSinceWork > INACTIVITY_LIMIT) {
                            try { await db.query(`UPDATE levels SET "lastInterest" = $1 WHERE "user" = $2 AND "guild" = $3`, [now, userId, guildId]); }
                            catch(e) { await db.query(`UPDATE levels SET lastinterest = $1 WHERE userid = $2 AND guildid = $3`, [now, userId, guildId]).catch(()=>{}); }
                        } else {
                            const bankBalance = Number(user.bank || 0);
                            const interestAmount = Math.floor(bankBalance * INTEREST_RATE);
                            if (interestAmount > 0) {
                                try { await db.query(`UPDATE levels SET "bank" = "bank" + $1, "lastInterest" = $2, "totalInterestEarned" = COALESCE("totalInterestEarned", 0) + $3 WHERE "user" = $4 AND "guild" = $5`, [interestAmount, now, interestAmount, userId, guildId]); }
                                catch(e) { await db.query(`UPDATE levels SET bank = bank + $1, lastinterest = $2, totalinterestearned = COALESCE(totalinterestearned, 0) + $3 WHERE userid = $4 AND guildid = $5`, [interestAmount, now, interestAmount, userId, guildId]).catch(()=>{}); }
                            } else {
                                try { await db.query(`UPDATE levels SET "lastInterest" = $1 WHERE "user" = $2 AND "guild" = $3`, [now, userId, guildId]); }
                                catch(e) { await db.query(`UPDATE levels SET lastinterest = $1 WHERE userid = $2 AND guildid = $3`, [now, userId, guildId]).catch(()=>{}); }
                            }
                        }
                    }
                }
                await db.query('COMMIT');
                if (i + batchSize < allUsers.length) await new Promise(r => setTimeout(r, 500)); 
            }
        } catch (err) {
            await db.query('ROLLBACK').catch(()=>{});
        }
    };

    // 4. تحديث قنوات الوقت
    async function updateTimerChannels() {
        const guilds = Array.from(client.guilds.cache.values());
        const KSA_OFFSET = 3 * 60 * 60 * 1000; 
        for (const guild of guilds) {
            try {
                let settingsRes;
                try { settingsRes = await db.query(`SELECT * FROM settings WHERE "guild" = $1`, [guild.id]); }
                catch(e) { settingsRes = await db.query(`SELECT * FROM settings WHERE guild = $1`, [guild.id]).catch(()=>({rows:[]})); }
                
                const settings = settingsRes.rows[0];
                if (!settings) continue;

                const now = new Date();
                const nowKSA = new Date(now.getTime() + (now.getTimezoneOffset() * 60000) + KSA_OFFSET);

                const endOfDay = new Date(nowKSA); endOfDay.setHours(24, 0, 0, 0);
                const msUntilDaily = endOfDay - nowKSA;
                const hDaily = Math.floor(msUntilDaily / (1000 * 60 * 60));
                const mDaily = Math.floor((msUntilDaily % (1000 * 60 * 60)) / (1000 * 60));
                const dailyText = `${hDaily} سـ ${mDaily} د`;

                const dayOfWeek = nowKSA.getDay(); 
                const daysUntilFriday = (5 + 7 - dayOfWeek) % 7; 
                const endOfWeek = new Date(nowKSA);
                endOfWeek.setDate(nowKSA.getDate() + daysUntilFriday + (daysUntilFriday === 0 && nowKSA.getHours() >= 0 ? 7 : 0));
                endOfWeek.setHours(24, 0, 0, 0); 
                const msUntilWeekly = endOfWeek - nowKSA;
                const dWeekly = Math.floor(msUntilWeekly / (1000 * 60 * 60 * 24));
                const hWeekly = Math.floor((msUntilWeekly % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                const weeklyText = `${dWeekly} يـ ${hWeekly} سـ`;

                const updateChannel = async (channelId, prefix, timeText) => {
                    if (!channelId) return;
                    try {
                        const channel = guild.channels.cache.get(channelId);
                        if (channel) {
                            const newName = `${prefix} ${timeText}`;
                            if (channel.name !== newName) await channel.setName(newName);
                        }
                    } catch (e) {}
                };

                const sTimer = settings.streaktimerchannelid || settings.streakTimerChannelID;
                const dTimer = settings.dailytimerchannelid || settings.dailyTimerChannelID;
                const wTimer = settings.weeklytimerchannelid || settings.weeklyTimerChannelID;

                await updateChannel(sTimer, '🔥〢الـستـريـك:', dailyText);
                await updateChannel(dTimer, '🏆〢مهام اليومية:', dailyText);
                await updateChannel(wTimer, '🔮〢مهام اسبوعية:', weeklyText);
            } catch (err) {}
        }
    }

    // 5. تحديث ألوان رتب قوس قزح
    async function updateRainbowRoles() {
        try {
            const rainbowRoles = (await db.query('SELECT * FROM rainbow_roles')).rows;
            if (rainbowRoles.length === 0) return;
            const randomColor = Math.floor(Math.random() * 16777215);
            for (const record of rainbowRoles) {
                const gId = record.guildid || record.guildID;
                const rId = record.roleid || record.roleID;
                const guild = client.guilds.cache.get(gId);
                if (!guild) continue;
                const role = guild.roles.cache.get(rId);
                if (role) await role.edit({ color: randomColor }).catch(() => {});
                else await db.query(`DELETE FROM rainbow_roles WHERE "roleID" = $1`, [rId]).catch(()=>{});
            }
        } catch (e) {}
    }

    // --- تسجيل وإطلاق جميع المهام (Timers) ---

    setInterval(calculateInterest, 60 * 60 * 1000); 
    calculateInterest(); 

    setInterval(updateMarketPrices, 60 * 60 * 1000); 
    updateMarketPrices(); 
      
    setInterval(() => checkLoanPayments(client, db), 60 * 60 * 1000); 
    
    if (checkFarmIncome) {
        setInterval(() => checkFarmIncome(client, db), 60 * 60 * 1000); 
        checkFarmIncome(client, db); 
    }

    setInterval(() => checkDailyStreaks(client, db), 3600000); 
    checkDailyStreaks(client, db);
    setInterval(() => checkDailyMediaStreaks(client, db), 3600000); 
    checkDailyMediaStreaks(client, db);

    setInterval(() => checkUnjailTask(client, db), 5 * 60 * 1000); 
    checkUnjailTask(client, db);
    setInterval(() => checkTemporaryRoles(), 60000); 
    checkTemporaryRoles();

    setInterval(() => updateTimerChannels(), 5 * 60 * 1000); 
    updateTimerChannels(); 
    setInterval(() => updateRainbowRoles(), 180000); 

    // إشعار النشر
    setInterval(async () => {
        const now = Date.now();
        try {
            let guildsToNotifyRes;
            try { guildsToNotifyRes = await db.query(`SELECT * FROM settings WHERE "nextBumpTime" > 0 AND "nextBumpTime" <= $1`, [now]); }
            catch(e) { guildsToNotifyRes = await db.query(`SELECT * FROM settings WHERE nextbumptime > 0 AND nextbumptime <= $1`, [now]).catch(()=>({rows:[]})); }
            
            const guildsToNotify = guildsToNotifyRes.rows;
            for (const row of guildsToNotify) {
                const guild = client.guilds.cache.get(row.guild);
                const bChannel = row.bumpchannelid || row.bumpChannelID;
                if (guild && bChannel) {
                    const channel = guild.channels.cache.get(bChannel);
                    if (channel) {
                        const bRole = row.bumpnotifyroleid || row.bumpNotifyRoleID;
                        const lBumper = row.lastbumperid || row.lastBumperID;
                        const roleMention = bRole ? `<@&${bRole}>` : "";
                        const userMention = lBumper ? `<@${lBumper}>` : " "; 
                        channel.send({
                            content: `✥ ${roleMention} | ${userMention}\n\n❖ أيّها الموقر، <:2Salute:1428340456856490074> \n✶ آن أوان رفع راية الإمبراطورية من جديد السيرفر جاهز للنشر.\nأرسل الأمر التالي:\n/bump`,
                            files: ["https://i.postimg.cc/KYZ5Ktj6/ump.jpg"]
                        }).catch(() => {});
                        channel.setName('˖✶⁺〢🔥・انشر・الان').catch(()=>{});
                    }
                }
                try { await db.query(`UPDATE settings SET "nextBumpTime" = 0 WHERE "guild" = $1`, [row.guild]); }
                catch(e) { await db.query(`UPDATE settings SET nextbumptime = 0 WHERE guild = $1`, [row.guild]).catch(()=>{}); }
            }
        } catch(e) {}
    }, 60 * 1000); 

    setInterval(async () => {
        const now = Date.now();
        try {
            let expiredRes;
            try { expiredRes = await db.query(`SELECT * FROM auto_responses WHERE "expiresAt" < $1`, [now]); }
            catch(e) { expiredRes = await db.query(`SELECT * FROM auto_responses WHERE expiresat < $1`, [now]).catch(()=>({rows:[]})); }
            
            const expired = expiredRes.rows;
            for (const reply of expired) {
                try { await db.query(`DELETE FROM auto_responses WHERE "id" = $1`, [reply.id]); }
                catch(e) { await db.query(`DELETE FROM auto_responses WHERE id = $1`, [reply.id]).catch(()=>{}); }
            }
        } catch (err) {}
    }, 60 * 60 * 1000);

    // ⌚ نظام التوقيت السعودي الدقيق للمهام اليومية 
    setInterval(() => { 
        const KSA_TIMEZONE = 'Asia/Riyadh'; 
        const nowKSA = new Date().toLocaleString('en-US', { timeZone: KSA_TIMEZONE }); 
        const ksaDate = new Date(nowKSA); 
        const ksaHour = ksaDate.getHours(); 
        
        // التوزيع في الساعة 00:00 منتصف الليل بتوقيت السعودية
        if (ksaHour === 0 && client.lastUpdateSentHour !== ksaHour) { 
            sendDailyMediaUpdate(client, db); 
            
            // 🔥 توزيع الملوك 
            if (rewardDailyKings) rewardDailyKings(client, db);
            
            client.lastUpdateSentHour = ksaHour; 
        } else if (ksaHour !== 0) client.lastUpdateSentHour = -1; 
        
        if (ksaHour === 12 && client.lastWarningSentHour !== ksaHour) { 
            sendStreakWarnings(client, db); 
            client.lastWarningSentHour = ksaHour; 
        } else if (ksaHour !== 12) client.lastWarningSentHour = -1; 
        
        if (ksaHour === 15 && client.lastReminderSentHour !== ksaHour) { 
            sendMediaStreakReminders(client, db); 
            client.lastReminderSentHour = ksaHour; 
        } else if (ksaHour !== 15) client.lastReminderSentHour = -1; 
    }, 60000); 
      
    // مسابقات الدروب العشوائية
    setInterval(async () => { 
        const today = new Date().toISOString().split('T')[0]; 
        const now = Date.now(); 
        if (!client.lastRandomGiveawayDate) client.lastRandomGiveawayDate = new Map();

        for (const guild of client.guilds.cache.values()) { 
            const guildID = guild.id; 
            if (client.lastRandomGiveawayDate.get(guildID) === today) continue; 
            
            if (!client.recentMessageTimestamps) client.recentMessageTimestamps = new Map();
            const guildTimestamps = client.recentMessageTimestamps.get(guildID) || []; 
            while (guildTimestamps.length > 0 && guildTimestamps[0] < (now - RECENT_MESSAGE_WINDOW)) { guildTimestamps.shift(); } 
            
            const totalMessagesLast2Hours = guildTimestamps.length; 
            if (totalMessagesLast2Hours < 200) continue; 
            if (Math.random() < 0.10) { 
                try { 
                    const success = await createRandomDropGiveaway(client, guild); 
                    if (success) { client.lastRandomGiveawayDate.set(guildID, today); } 
                } catch (err) {} 
            } 
        } 
    }, 30 * 60 * 1000); 
      
    // تنظيف الميموري لتخفيف استهلاك الرام
    setInterval(() => {
        try {
            if (client.activePlayers) client.activePlayers.clear();
            if (client.activeGames) client.activeGames.clear();
            if (client.raceTimestamps) client.raceTimestamps.clear();
            if (client.marketLocks) client.marketLocks.clear();
        } catch (e) {}
    }, 30 * 60 * 1000); 

    // 🔥 تحديث لوحة الملوك بشكل سليم كل دقيقة
    setInterval(() => {
        if (autoUpdateKingsBoard) autoUpdateKingsBoard(client, db).catch(() => {});
    }, 60 * 1000);

    sendDailyMediaUpdate(client, db);
};
