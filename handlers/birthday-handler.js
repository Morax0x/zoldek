// handlers/birthday-handler.js
const { EmbedBuilder } = require('discord.js');

async function checkAndAnnounceBirthdays(client, db) {
    const KSA_TIMEZONE = 'Asia/Riyadh';
    const nowKSA = new Date(new Date().toLocaleString('en-US', { timeZone: KSA_TIMEZONE }));
    
    const currentHour = nowKSA.getHours();
    const currentDay = nowKSA.getDate();
    const currentMonth = nowKSA.getMonth() + 1; // الأشهر تبدأ من 0
    const currentYear = nowKSA.getFullYear();
    
    const todayStr = `${currentYear}-${currentMonth}-${currentDay}`;

    try {
        // 1. تنظيف رتب أعياد الميلاد القديمة (أمس)
        let activeBirthdaysRes = await db.query(`SELECT * FROM active_birthdays WHERE "dateAdded" != $1`, [todayStr]).catch(() => db.query(`SELECT * FROM active_birthdays WHERE dateAdded != $1`, [todayStr]));
        
        for (const record of (activeBirthdaysRes?.rows || [])) {
            const guild = client.guilds.cache.get(record.guildID || record.guildid);
            if (guild) {
                const member = await guild.members.fetch(record.userID || record.userid).catch(() => null);
                if (member) await member.roles.remove(record.roleID || record.roleid).catch(() => {});
            }
            await db.query(`DELETE FROM active_birthdays WHERE "userID" = $1 AND "guildID" = $2`, [record.userID || record.userid, record.guildID || record.guildid]).catch(()=>{});
        }

        // 2. التحقق مما إذا كانت الساعة 3 العصر (15:00) بتوقيت السعودية
        if (currentHour !== 15) return;

        // 3. جلب سيرفرات الإمبراطورية المفعلة للخاصية
        let settingsRes = await db.query(`SELECT * FROM birthday_settings WHERE "lastAnnouncedDate" IS NULL OR "lastAnnouncedDate" != $1`, [todayStr]).catch(() => db.query(`SELECT * FROM birthday_settings WHERE lastAnnouncedDate IS NULL OR lastAnnouncedDate != $1`, [todayStr]));
        
        if (!settingsRes || !settingsRes.rows || settingsRes.rows.length === 0) return;

        for (const setting of settingsRes.rows) {
            const guildId = setting.guildID || setting.guildid;
            const guild = client.guilds.cache.get(guildId);
            if (!guild) continue;

            const channel = guild.channels.cache.get(setting.channelID || setting.channelid);
            const roleId = setting.roleID || setting.roleid;
            if (!channel) continue;

            // البحث عن أصحاب الميلاد اليوم
            let bdayRes = await db.query(`SELECT * FROM user_birthdays WHERE "guildID" = $1 AND "day" = $2 AND "month" = $3`, [guildId, currentDay, currentMonth]).catch(() => db.query(`SELECT * FROM user_birthdays WHERE guildID = $1 AND day = $2 AND month = $3`, [guildId, currentDay, currentMonth]));
            
            const birthdayUsers = bdayRes?.rows || [];
            if (birthdayUsers.length === 0) continue;

            for (const userRow of birthdayUsers) {
                const member = await guild.members.fetch(userRow.userID || userRow.userid).catch(() => null);
                if (!member) continue;

                // حساب العمر
                let ageText = "";
                if (userRow.year && userRow.year > 0) {
                    ageText = `اصبح عمره ${currentYear - userRow.year}`;
                }

                // إرسال التهنئة
                const msgContent = `الـيـوم هـو عيد ميلاد ${member} ${ageText}!\n🎂 تمنـوا لـه/ـا سنـة سعيـدة يا رعايـا الامبراطـوريـة\nكـل عـام وانـت بخـير <:2Salute:1428340456856490074>`;
                
                await channel.send({ content: msgContent, files: ["https://i.postimg.cc/85z1DkS6/birthday.gif"] }).catch(()=>{});

                // إعطاء الرتبة وتخزينها لكي تسحب غداً
                if (roleId) {
                    const bRole = guild.roles.cache.get(roleId);
                    if (bRole) {
                        await member.roles.add(bRole).catch(()=>{});
                        await db.query(`INSERT INTO active_birthdays ("userID", "guildID", "roleID", "dateAdded") VALUES ($1, $2, $3, $4)`, [member.id, guildId, roleId, todayStr]).catch(()=>{});
                    }
                }
            }

            // تسجيل أنه تم الإعلان لهذا السيرفر اليوم لمنع التكرار
            await db.query(`UPDATE birthday_settings SET "lastAnnouncedDate" = $1 WHERE "guildID" = $2`, [todayStr, guildId]).catch(()=>{});
        }

    } catch (e) {
        console.error("[Birthday System Error]:", e.message);
    }
}

module.exports = { checkAndAnnounceBirthdays };
