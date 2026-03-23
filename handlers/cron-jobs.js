const { createRandomDropGiveaway } = require('./giveaway-handler.js');
const { autoUpdateKingsBoard, rewardDailyKings } = require('./kings-stats-handler.js'); 
const { checkLoanPayments } = require('./loan-handler.js'); 

// 🔥 تم تصحيح اسم الملف هنا ليتطابق مع ملف المزرعة الفعلي لديك 🔥
const { checkFarmIncome } = require('./farm-handler.js'); 

const handleMarketCrash = require('./market-crash-handler.js');
const { checkDailyStreaks, checkDailyMediaStreaks, sendMediaStreakReminders, sendDailyMediaUpdate, sendStreakWarnings } = require("../streak-handler.js");
const { checkUnjailTask } = require('./report-handler.js'); 

const RECENT_MESSAGE_WINDOW = 2 * 60 * 60 * 1000; 

module.exports = (client, db) => {
    // 1. تحديث أسعار السوق (معزول ومحمي بالكامل)
    async function updateMarketPrices() {
        try {
            if (!client.marketLocks) client.marketLocks = new Set();
            let res = await db.query('SELECT * FROM market_items').catch(() => null);
            if (!res || res.rows.length === 0) return;

            const allItems = res.rows;
            let marketStatus = 'normal';
            
            try {
                let statusRes = await db.query(`SELECT "marketStatus" FROM settings WHERE "marketStatus" IS NOT NULL LIMIT 1`)
                    .catch(() => db.query(`SELECT marketstatus as "marketStatus" FROM settings WHERE marketstatus IS NOT NULL LIMIT 1`));
                if (statusRes && statusRes.rows[0]) marketStatus = statusRes.rows[0].marketStatus || 'normal';
            } catch(e) { console.error("Market Status Read Error:", e); }

            await db.query('BEGIN');
            const CRASH_PRICE = 10; 

            for (const item of allItems) {
                const itemId = item.id || item.itemID;
                if (client.marketLocks.has(itemId)) continue;

                let totalOwned = 0;
                try { 
                    let resOwned = await db.query(`SELECT SUM(quantity) as total FROM user_portfolio WHERE "itemID" = $1`, [itemId])
                        .catch(() => db.query(`SELECT SUM(quantity) as total FROM user_portfolio WHERE itemid = $1`, [itemId]));
                    totalOwned = (resOwned && resOwned.rows[0]?.total) ? Number(resOwned.rows[0].total) : 0;
                } catch(e) {}

                let randomPercent = (Math.random() * 0.20) - 0.10;
                if (marketStatus === 'boom') randomPercent = (Math.random() * 0.20) - 0.05; 
                else if (marketStatus === 'recession') randomPercent = (Math.random() * 0.20) - 0.15; 

                const saturationPenalty = (totalOwned / 2000) * 0.02;
                let finalChangePercent = randomPercent - saturationPenalty;

                const oldPrice = Number(item.currentPrice || item.currentprice || 0);
                if (oldPrice > 5000 && finalChangePercent > 0) finalChangePercent /= 2;
                if (finalChangePercent < -0.30) finalChangePercent = -0.30;

                let newPrice = Math.floor(oldPrice * (1 + finalChangePercent));

                if (newPrice <= CRASH_PRICE) {
                    setTimeout(() => handleMarketCrash(client, db, item).catch(console.error), 0); 
                    continue; 
                }
                
                if (newPrice > 50000) newPrice = 50000;

                const changeAmount = newPrice - oldPrice;
                const displayPercent = oldPrice > 0 ? ((changeAmount / oldPrice) * 100).toFixed(2) : 0;
                
                try { 
                    await db.query(`UPDATE market_items SET "currentPrice" = $1, "lastChangePercent" = $2, "lastChange" = $3 WHERE "id" = $4`, [newPrice, displayPercent, changeAmount, itemId]); 
                } catch(e) { 
                    await db.query(`UPDATE market_items SET currentprice = $1, lastchangepercent = $2, lastchange = $3 WHERE id = $4`, [newPrice, displayPercent, changeAmount, itemId]).catch(()=>{}); 
                }
            }
            await db.query('COMMIT');
        } catch (err) {
            console.error("[CRITICAL] Market Prices Update Failed:", err);
            await db.query('ROLLBACK').catch(()=>{});
        }
    }

    // 2. فحص الرتب المؤقتة المنتهية 
    async function checkTemporaryRoles() {
        const now = Date.now();
        try {
            let expiredRolesRes = await db.query(`SELECT * FROM temporary_roles WHERE "expiresAt" <= $1`, [now])
                .catch(() => db.query(`SELECT * FROM temporary_roles WHERE expiresat <= $1`, [now]));
            
            if (!expiredRolesRes || expiredRolesRes.rows.length === 0) return;

            await db.query('BEGIN');
            for (const record of expiredRolesRes.rows) {
                const uId = record.userID || record.userid;
                const gId = record.guildID || record.guildid;
                const rId = record.roleID || record.roleid;
                await db.query(`DELETE FROM temporary_roles WHERE "userID" = $1 AND "guildID" = $2 AND "roleID" = $3`, [uId, gId, rId])
                    .catch(() => db.query(`DELETE FROM temporary_roles WHERE userid = $1 AND guildid = $2 AND roleid = $3`, [uId, gId, rId]).catch(()=>{}));
            }
            await db.query('COMMIT');

            for (const record of expiredRolesRes.rows) {
                const guild = client.guilds.cache.get(record.guildID || record.guildid);
                if (!guild) continue;
                const member = await guild.members.fetch(record.userID || record.userid).catch(() => null);
                const role = guild.roles.cache.get(record.roleID || record.roleid);
                if (member && role) member.roles.remove(role).catch(() => {});
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
            let allUsersRes = await db.query(`SELECT "user", "guild", "bank", "lastInterest", "lastDaily", "lastWork" FROM levels WHERE "bank" > 0`)
                .catch(() => db.query(`SELECT userid as "user", guildid as "guild", bank, lastinterest as "lastInterest", lastdaily as "lastDaily", lastwork as "lastWork" FROM levels WHERE bank > 0`));
            
            if (!allUsersRes || allUsersRes.rows.length === 0) return;

            const batchSize = 100; 
            for (let i = 0; i < allUsersRes.rows.length; i += batchSize) {
                const batch = allUsersRes.rows.slice(i, i + batchSize);
                await db.query('BEGIN');
                
                for (const user of batch) {
                    const lastInterest = Number(user.lastInterest || 0);
                    if ((now - lastInterest) >= COOLDOWN) {
                        const timeSinceDaily = now - Number(user.lastDaily || 0);
                        const timeSinceWork = now - Number(user.lastWork || 0);
                        
                        if (timeSinceDaily > INACTIVITY_LIMIT && timeSinceWork > INACTIVITY_LIMIT) {
                            await db.query(`UPDATE levels SET "lastInterest" = $1 WHERE "user" = $2 AND "guild" = $3`, [now, user.user, user.guild])
                                .catch(() => db.query(`UPDATE levels SET lastinterest = $1 WHERE userid = $2 AND guildid = $3`, [now, user.user, user.guild]).catch(()=>{}));
                        } else {
                            const interestAmount = Math.floor(Number(user.bank || 0) * INTEREST_RATE);
                            if (interestAmount > 0) {
                                await db.query(`UPDATE levels SET "bank" = "bank" + $1, "lastInterest" = $2, "totalInterestEarned" = COALESCE("totalInterestEarned", 0) + $3 WHERE "user" = $4 AND "guild" = $5`, [interestAmount, now, interestAmount, user.user, user.guild])
                                    .catch(() => db.query(`UPDATE levels SET bank = bank + $1, lastinterest = $2, totalinterestearned = COALESCE(totalinterestearned, 0) + $3 WHERE userid = $4 AND guildid = $5`, [interestAmount, now, interestAmount, user.user, user.guild]).catch(()=>{}));
                            } else {
                                await db.query(`UPDATE levels SET "lastInterest" = $1 WHERE "user" = $2 AND "guild" = $3`, [now, user.user, user.guild])
                                    .catch(() => db.query(`UPDATE levels SET lastinterest = $1 WHERE userid = $2 AND guildid = $3`, [now, user.user, user.guild]).catch(()=>{}));
                            }
                        }
                    }
                }
                await db.query('COMMIT');
                if (i + batchSize < allUsersRes.rows.length) await new Promise(r => setTimeout(r, 500)); 
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
                let settingsRes = await db.query(`SELECT * FROM settings WHERE "guild" = $1`, [guild.id]).catch(() => db.query(`SELECT * FROM settings WHERE guild = $1`, [guild.id]));
                const settings = settingsRes?.rows[0];
                if (!settings) continue;

                const now = new Date();
                const nowKSA = new Date(now.getTime() + (now.getTimezoneOffset() * 60000) + KSA_OFFSET);

                const endOfDay = new Date(nowKSA); endOfDay.setHours(24, 0, 0, 0);
                const msUntilDaily = endOfDay - nowKSA;
                const dailyText = `${Math.floor(msUntilDaily / (1000 * 60 * 60))} سـ ${Math.floor((msUntilDaily % (1000 * 60 * 60)) / (1000 * 60))} د`;

                const daysUntilFriday = (5 + 7 - nowKSA.getDay()) % 7; 
                const endOfWeek = new Date(nowKSA);
                endOfWeek.setDate(nowKSA.getDate() + daysUntilFriday + (daysUntilFriday === 0 && nowKSA.getHours() >= 0 ? 7 : 0));
                endOfWeek.setHours(24, 0, 0, 0); 
                const msUntilWeekly = endOfWeek - nowKSA;
                const weeklyText = `${Math.floor(msUntilWeekly / (1000 * 60 * 60 * 24))} يـ ${Math.floor((msUntilWeekly % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))} سـ`;

                const updateChannel = async (channelId, prefix, timeText) => {
                    if (!channelId) return;
                    const channel = guild.channels.cache.get(channelId);
                    if (channel && channel.name !== `${prefix} ${timeText}`) await channel.setName(`${prefix} ${timeText}`).catch(()=>{});
                };

                await updateChannel(settings.streaktimerchannelid || settings.streakTimerChannelID, '🔥〢الـستـريـك:', dailyText);
                await updateChannel(settings.dailytimerchannelid || settings.dailyTimerChannelID, '🏆〢مهام اليومية:', dailyText);
                await updateChannel(settings.weeklytimerchannelid || settings.weeklyTimerChannelID, '🔮〢مهام اسبوعية:', weeklyText);
            } catch (err) {}
        }
    }

    // 5. تحديث ألوان رتب قوس قزح
    async function updateRainbowRoles() {
        try {
            const rainbowRoles = (await db.query('SELECT * FROM rainbow_roles').catch(()=>({rows:[]})))?.rows;
            if (!rainbowRoles || rainbowRoles.length === 0) return;
            const randomColor = Math.floor(Math.random() * 16777215);
            for (const record of rainbowRoles) {
                const guild = client.guilds.cache.get(record.guildid || record.guildID);
                if (!guild) continue;
                const role = guild.roles.cache.get(record.roleid || record.roleID);
                if (role) await role.edit({ color: randomColor }).catch(() => {});
                else await db.query(`DELETE FROM rainbow_roles WHERE "roleID" = $1`, [record.roleid || record.roleID]).catch(()=>{});
            }
        } catch (e) {}
    }

    // --- المهام الدورية (محمية لتجنب التعطل) ---

    // 1️⃣ البنك (كل ساعة)
    setInterval(() => calculateInterest().catch(e => console.error("Interest Error", e)), 60 * 60 * 1000); 
    setTimeout(() => calculateInterest().catch(()=>{}), 10000); 

    // 2️⃣ السوق (كل ساعة - محمي من الانهيار)
    setInterval(() => updateMarketPrices().catch(e => console.error("Market Error", e)), 60 * 60 * 1000); 
    setTimeout(() => updateMarketPrices().catch(()=>{}), 15000); 
      
    // 3️⃣ سداد القروض (كل ساعة)
    setInterval(() => checkLoanPayments(client, db).catch(()=>{}), 60 * 60 * 1000); 
    
    // 4️⃣ المزرعة (كل ساعة - 🔥 إجبار التشغيل 🔥)
    if (typeof checkFarmIncome === 'function') {
        setInterval(() => checkFarmIncome(client, db).catch(e => console.error("Farm Error", e)), 60 * 60 * 1000); 
        setTimeout(() => checkFarmIncome(client, db).catch(()=>{}), 20000); // يفحص بعد 20 ثانية من التشغيل
    } else {
        console.error("❌ دالة المزرعة غير متصلة بشكل صحيح بـ cron-jobs.js");
    }

    // 5️⃣ الستريكات والإعلانات الدورية
    setInterval(() => checkDailyStreaks(client, db).catch(()=>{}), 3600000); 
    setTimeout(() => checkDailyStreaks(client, db).catch(()=>{}), 25000);
    
    setInterval(() => checkDailyMediaStreaks(client, db).catch(()=>{}), 3600000); 
    setTimeout(() => checkDailyMediaStreaks(client, db).catch(()=>{}), 30000);

    setInterval(() => checkUnjailTask(client, db).catch(()=>{}), 5 * 60 * 1000); 
    setTimeout(() => checkUnjailTask(client, db).catch(()=>{}), 35000);
    
    setInterval(() => checkTemporaryRoles().catch(()=>{}), 60000); 
    setTimeout(() => checkTemporaryRoles().catch(()=>{}), 40000);

    setInterval(() => updateTimerChannels().catch(()=>{}), 5 * 60 * 1000); 
    setTimeout(() => updateTimerChannels().catch(()=>{}), 45000); 
    
    setInterval(() => updateRainbowRoles().catch(()=>{}), 180000); 

    // إشعار النشر للديسبورد
    setInterval(async () => {
        const now = Date.now();
        try {
            let guildsToNotifyRes = await db.query(`SELECT * FROM settings WHERE "nextBumpTime" > 0 AND "nextBumpTime" <= $1`, [now])
                .catch(() => db.query(`SELECT * FROM settings WHERE nextbumptime > 0 AND nextbumptime <= $1`, [now]));
            
            for (const row of (guildsToNotifyRes?.rows || [])) {
                const guild = client.guilds.cache.get(row.guild);
                const bChannel = row.bumpchannelid || row.bumpChannelID;
                if (guild && bChannel) {
                    const channel = guild.channels.cache.get(bChannel);
                    if (channel) {
                        const bRole = row.bumpnotifyroleid || row.bumpNotifyRoleID;
                        const lBumper = row.lastbumperid || row.lastBumperID;
                        channel.send({
                            content: `✥ ${bRole ? `<@&${bRole}>` : ""} | ${lBumper ? `<@${lBumper}>` : " "}\n\n❖ أيّها الموقر، <:2Salute:1428340456856490074> \n✶ آن أوان رفع راية الإمبراطورية من جديد السيرفر جاهز للنشر.\nأرسل الأمر التالي:\n/bump`,
                            files: ["https://i.postimg.cc/KYZ5Ktj6/ump.jpg"]
                        }).catch(() => {});
                        channel.setName('˖✶⁺〢🔥・انشر・الان').catch(()=>{});
                    }
                }
                await db.query(`UPDATE settings SET "nextBumpTime" = 0 WHERE "guild" = $1`, [row.guild])
                    .catch(() => db.query(`UPDATE settings SET nextbumptime = 0 WHERE guild = $1`, [row.guild]).catch(()=>{}));
            }
        } catch(e) {}
    }, 60 * 1000); 

    // مسح الردود التلقائية المنتهية
    setInterval(async () => {
        const now = Date.now();
        try {
            let expiredRes = await db.query(`SELECT * FROM auto_responses WHERE "expiresAt" < $1`, [now])
                .catch(() => db.query(`SELECT * FROM auto_responses WHERE expiresat < $1`, [now]));
            
            for (const reply of (expiredRes?.rows || [])) {
                await db.query(`DELETE FROM auto_responses WHERE "id" = $1`, [reply.id])
                    .catch(() => db.query(`DELETE FROM auto_responses WHERE id = $1`, [reply.id]).catch(()=>{}));
            }
        } catch (err) {}
    }, 60 * 60 * 1000);

    // ⌚ نظام التوقيت السعودي الدقيق للمهام اليومية والملوك 
    setInterval(() => { 
        const KSA_TIMEZONE = 'Asia/Riyadh'; 
        const nowKSA = new Date().toLocaleString('en-US', { timeZone: KSA_TIMEZONE }); 
        const ksaDate = new Date(nowKSA); 
        const ksaHour = ksaDate.getHours(); 
        
        // التوزيع في الساعة 00:00 منتصف الليل بتوقيت السعودية
        if (ksaHour === 0 && client.lastUpdateSentHour !== ksaHour) { 
            sendDailyMediaUpdate(client, db).catch(()=>{}); 
            
            // 🔥 توزيع الملوك محمي من الإيقاف 🔥
            if (typeof rewardDailyKings === 'function') {
                rewardDailyKings(client, db).catch(e => console.error("Reward Kings Daily Error", e));
            } else {
                console.error("❌ دالة توزيع الملوك غير متصلة بشكل صحيح بـ cron-jobs.js");
            }
            
            client.lastUpdateSentHour = ksaHour; 
        } else if (ksaHour !== 0) client.lastUpdateSentHour = -1; 
        
        if (ksaHour === 12 && client.lastWarningSentHour !== ksaHour) { 
            sendStreakWarnings(client, db).catch(()=>{}); 
            client.lastWarningSentHour = ksaHour; 
        } else if (ksaHour !== 12) client.lastWarningSentHour = -1; 
        
        if (ksaHour === 15 && client.lastReminderSentHour !== ksaHour) { 
            sendMediaStreakReminders(client, db).catch(()=>{}); 
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
            
            if (guildTimestamps.length < 200) continue; 
            if (Math.random() < 0.10) { 
                try { 
                    const success = await createRandomDropGiveaway(client, guild); 
                    if (success) client.lastRandomGiveawayDate.set(guildID, today);
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

    // 🔥 تحديث لوحة الملوك بشكل سليم كل دقيقة (محمي من إيقاف الـ Loop) 🔥
    setInterval(() => {
        if (typeof autoUpdateKingsBoard === 'function') {
            autoUpdateKingsBoard(client, db).catch(e => console.error("Kings Board Auto-Update Error:", e));
        }
    }, 60 * 1000);

    // استدعاء أولي لتحديث اللوحة فوراً عند تشغيل البوت
    setTimeout(() => {
        if (typeof autoUpdateKingsBoard === 'function') {
            autoUpdateKingsBoard(client, db).catch(()=>{});
        }
    }, 10000);
};
