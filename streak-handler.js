const { PermissionsBitField, EmbedBuilder, Colors, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

const DAY_MS = 24 * 60 * 60 * 1000;
const KSA_TIMEZONE = 'Asia/Riyadh';

const EMOJI_MEDIA_STREAK = '<a:Streak:1438932297519730808>';
const EMOJI_SHIELD = '<:Shield:1437804676224516146>';

const processingUsers = new Set();

const SEPARATORS_CLEAN_LIST = ['»', '•', '✦', '★', '❖', '✧', '✬', '〢', '┇', '\\|'];
const DEFAULT_SEPARATOR = '»';

function getKSADateString(dateObject) {
    return new Date(dateObject).toLocaleString('en-CA', {
        timeZone: KSA_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
}

function getDayDifference(dateStr1, dateStr2) {
    const date1 = new Date(dateStr1);
    const date2 = new Date(dateStr2);
    date1.setUTCHours(0, 0, 0, 0);
    date2.setUTCHours(0, 0, 0, 0);
    const diffTime = Math.abs(date2.getTime() - date1.getTime());
    return Math.round(diffTime / DAY_MS);
}

async function calculateBuffMultiplier(member, db) {
    if (!db) return 1.0;
    if (!member || !member.roles || !member.roles.cache) return 1.0;
    
    let totalPercent = 0.0;
    
    const day = new Date().getUTCDay();
    if (day === 5 || day === 6 || day === 0) totalPercent += 0.10;
    
    const userRoles = member.roles.cache.map(r => r.id);
    if (userRoles.length > 0) {
        try {
            const placeholders = userRoles.map((_, i) => `$${i + 1}`).join(',');
            const roleBuffsRes = await db.query(`SELECT * FROM role_buffs WHERE "roleID" IN (${placeholders})`, userRoles);
            let rolesTotalBuff = 0;
            for (const buff of roleBuffsRes.rows) {
                rolesTotalBuff += Number(buff.buffPercent || buff.buffpercent);
            }
            totalPercent += (rolesTotalBuff / 100);
        } catch (e) {}
    }
    
    let itemBuffTotal = 0;
    try {
        const userBuffsRes = await db.query(`SELECT * FROM user_buffs WHERE "userID" = $1 AND "guildID" = $2 AND "expiresAt" > $3 AND "buffType" = 'xp'`, [member.id, member.guild.id, Date.now()]);
        for (const buff of userBuffsRes.rows) {
            itemBuffTotal += Number(buff.multiplier);
        }
    } catch (e) {}
    totalPercent += itemBuffTotal;

    if (totalPercent < -1.0) totalPercent = -1.0;
    return 1.0 + totalPercent;
}

async function calculateMoraBuff(member, db) {
    if (!db) return 1.0;
    if (!member || !member.roles || !member.roles.cache) return 1.0;

    let totalBuffPercent = 0;

    const day = new Date().getUTCDay(); 
    if (day === 5 || day === 6 || day === 0) {
        totalBuffPercent += 10; 
    }

    const userRoles = member.roles.cache.map(r => r.id);
    const guildID = member.guild.id;
    try {
        if (userRoles.length > 0) {
            const placeholders = userRoles.map((_, i) => `$${i + 2}`).join(',');
            const allBuffRolesRes = await db.query(`SELECT * FROM role_mora_buffs WHERE "guildID" = $1 AND "roleID" IN (${placeholders})`, [guildID, ...userRoles]);
            let roleBuffSum = 0;
            for (const buffRole of allBuffRolesRes.rows) {
                roleBuffSum += Number(buffRole.buffPercent || buffRole.buffpercent);
            }
            totalBuffPercent += roleBuffSum;
        }
    } catch (e) {}

    try {
        const tempBuffsRes = await db.query(`SELECT * FROM user_buffs WHERE "guildID" = $1 AND "userID" = $2 AND "buffType" = 'mora' AND "expiresAt" > $3`, [guildID, member.id, Date.now()]);
        tempBuffsRes.rows.forEach(buff => {
            totalBuffPercent += Number(buff.buffPercent || buff.buffpercent);
        });
    } catch (e) {}

    let finalMultiplier = 1 + (totalBuffPercent / 100);
    if (finalMultiplier < 0) finalMultiplier = 0;

    return finalMultiplier;
}

async function updateNickname(member, db) {
    if (!member) return;
    if (!db) return;
    
    if (member.id === member.guild.ownerId) return;
    if (!member.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageNicknames)) return;
    if (!member.manageable) return;

    let streakData = null;
    let settings = null;
    try {
        const streakRes = await db.query(`SELECT * FROM streaks WHERE "guildID" = $1 AND "userID" = $2`, [member.guild.id, member.id]);
        streakData = streakRes.rows[0];
        const settingsRes = await db.query(`SELECT "streakEmoji" FROM settings WHERE "guild" = $1`, [member.guild.id]);
        settings = settingsRes.rows[0];
    } catch (e) {}

    const streakEmoji = settings?.streakEmoji || settings?.streakemoji || '🔥';

    let separator = streakData?.separator;
    const checkList = SEPARATORS_CLEAN_LIST.map(s => s.replace('\\', ''));
    if (!checkList.includes(separator)) {
        separator = DEFAULT_SEPARATOR;
    }

    const streakCount = streakData?.streakCount || streakData?.streakcount ? Number(streakData.streakCount || streakData.streakcount) : 0;
    const nicknameActive = streakData?.nicknameActive !== undefined || streakData?.nicknameactive !== undefined ? Number(streakData.nicknameActive || streakData.nicknameactive) : 1;

    let baseName = member.displayName;

    let prefix = "";
    const prefixMatch = baseName.match(/^(\[.*?\]|【.*?】)\s*/);
    if (prefixMatch) {
        prefix = prefixMatch[0];
        baseName = baseName.replace(/^(\[.*?\]|【.*?】)\s*/, '').trim();
    }

    const cleanRegex = new RegExp(`\\s*(${SEPARATORS_CLEAN_LIST.join('|')})\\s*\\d+.*$`, 'i');
    baseName = baseName.replace(cleanRegex, '').trim();
    baseName = baseName.replace(cleanRegex, '').trim();

    let newName;
    if (streakCount > 0 && nicknameActive === 1) {
        newName = `${prefix}${baseName} ${separator} ${streakCount} ${streakEmoji}`;
    } else {
        newName = `${prefix}${baseName}`;
    }

    if (newName.length > 32) {
        const suffix = ` ${separator} ${streakCount} ${streakEmoji}`;
        baseName = baseName.substring(0, 32 - suffix.length - prefix.length);
        newName = `${prefix}${baseName}${suffix}`;
    }

    if (member.displayName !== newName) {
        try {
            await member.setNickname(newName);
        } catch (err) {}
    }
}

async function checkDailyStreaks(client, db) {
    let allStreaks = [];
    try {
        const res = await db.query(`SELECT * FROM streaks WHERE "streakCount" > 0`);
        allStreaks = res.rows;
    } catch (e) {
        return;
    }

    const todayKSA = getKSADateString(Date.now());

    for (const streakData of allStreaks) {
        const lastDateKSA = getKSADateString(Number(streakData.lastMessageTimestamp || streakData.lastmessagetimestamp));
        const diffDays = getDayDifference(todayKSA, lastDateKSA);

        if (diffDays <= 1) continue;

        let member;
        try {
            const guild = await client.guilds.fetch(streakData.guildID || streakData.guildid);
            member = await guild.members.fetch(streakData.userID || streakData.userid);
        } catch (err) { continue; }

        let settings = {};
        try {
            const sRes = await db.query(`SELECT "streakEmoji" FROM settings WHERE "guild" = $1`, [streakData.guildID || streakData.guildid]);
            if (sRes.rows.length > 0) settings = sRes.rows[0];
        } catch (e) {}

        const streakEmoji = settings.streakEmoji || settings.streakemoji || '🔥';
        const sendDM = Number(streakData.dmNotify || streakData.dmnotify) === 1;

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel(`الذهاب إلى: ${member.guild.name}`)
                .setStyle(ButtonStyle.Link)
                .setURL(`https://discord.com/channels/${member.guild.id}`)
        );

        if (diffDays === 2) {
            if (Number(streakData.hasItemShield || streakData.hasitemshield) > 0) {
                streakData.hasItemShield = Number(streakData.hasItemShield || streakData.hasitemshield) - 1;
                streakData.lastMessageTimestamp = Date.now();
                await db.query(`UPDATE streaks SET "streakCount" = $1, "hasGracePeriod" = $2, "hasItemShield" = $3, "lastMessageTimestamp" = $4 WHERE "id" = $5`, [Number(streakData.streakCount || streakData.streakcount), Number(streakData.hasGracePeriod || streakData.hasgraceperiod), streakData.hasItemShield, streakData.lastMessageTimestamp, streakData.id]);
                if (sendDM) {
                    const embed = new EmbedBuilder().setTitle('✶ اشـعـارات الـستريـك').setColor(Colors.Green)
                        .setImage('https://i.postimg.cc/NfLYXwD5/123.jpg')
                        .setDescription(`- 🛡️ **تم تفعيل درع المتجر!**\n- تم حماية الستريك الخاص بك (${streakData.streakCount || streakData.streakcount} ${streakEmoji}) من الضياع.\n- لا تنسَ التفاعل اليوم!`);
                    member.send({ embeds: [embed], components: [row] }).catch(() => {});
                }
            } else if (Number(streakData.hasGracePeriod || streakData.hasgraceperiod) === 1) {
                streakData.hasGracePeriod = 0;
                streakData.lastMessageTimestamp = Date.now(); 
                await db.query(`UPDATE streaks SET "streakCount" = $1, "hasGracePeriod" = $2, "hasItemShield" = $3, "lastMessageTimestamp" = $4 WHERE "id" = $5`, [Number(streakData.streakCount || streakData.streakcount), streakData.hasGracePeriod, Number(streakData.hasItemShield || streakData.hasitemshield), streakData.lastMessageTimestamp, streakData.id]);
                if (sendDM) {
                    const embed = new EmbedBuilder().setTitle('✶ اشـعـارات الـستريـك').setColor(Colors.Green)
                        .setImage('https://i.postimg.cc/NfLYXwD5/123.jpg')
                        .setDescription(`- 🛡️ **تم تفعيل فترة السماح المجانية!**\n- تم حماية الستريك الخاص بك (${streakData.streakCount || streakData.streakcount} ${streakEmoji}).\n- لا تنسَ التفاعل اليوم!`);
                    member.send({ embeds: [embed], components: [row] }).catch(() => {});
                }
            } else {
                const oldStreak = Number(streakData.streakCount || streakData.streakcount);
                streakData.streakCount = 0;
                streakData.hasGracePeriod = 0;
                await db.query(`UPDATE streaks SET "streakCount" = $1, "hasGracePeriod" = $2, "hasItemShield" = $3, "lastMessageTimestamp" = $4 WHERE "id" = $5`, [streakData.streakCount, streakData.hasGracePeriod, Number(streakData.hasItemShield || streakData.hasitemshield), Number(streakData.lastMessageTimestamp || streakData.lastmessagetimestamp), streakData.id]);
                if (sendDM) {
                    const embed = new EmbedBuilder().setTitle('✶ اشـعـارات الـستريـك').setColor(Colors.Red)
                        .setImage('https://i.postimg.cc/NfLYXwD5/123.jpg')
                        .setDescription(`- يؤسـفنـا ابلاغـك بـ انـك قـد فقدت الـستريـك 💔\n- لم تكن تملك اي درع للحماية.\n- كـان ستريـكك: ${oldStreak}`);
                    member.send({ embeds: [embed], components: [row] }).catch(() => {});
                }
                if (Number(streakData.nicknameActive || streakData.nicknameactive) === 1) await updateNickname(member, db);
            }

        } else if (diffDays > 2) {
            const oldStreak = Number(streakData.streakCount || streakData.streakcount);
            streakData.streakCount = 0;
            streakData.hasGracePeriod = 0;
            await db.query(`UPDATE streaks SET "streakCount" = $1, "hasGracePeriod" = $2, "hasItemShield" = $3, "lastMessageTimestamp" = $4 WHERE "id" = $5`, [streakData.streakCount, streakData.hasGracePeriod, Number(streakData.hasItemShield || streakData.hasitemshield), Number(streakData.lastMessageTimestamp || streakData.lastmessagetimestamp), streakData.id]);
            if (sendDM) {
                const embed = new EmbedBuilder().setTitle('✶ اشـعـارات الـستريـك').setColor(Colors.Red)
                    .setImage('https://i.postimg.cc/NfLYXwD5/123.jpg')
                    .setDescription(`- يؤسـفنـا ابلاغـك بـ انـك قـد فقدت الـستريـك 💔\n- لقد انقطعت عن السيرفر مدة طويلة.\n- كـان ستريـكك: ${oldStreak}`);
                member.send({ embeds: [embed], components: [row] }).catch(() => {});
            }
            if (Number(streakData.nicknameActive || streakData.nicknameactive) === 1) await updateNickname(member, db);
        }
    }
}

// 🔥 إضافة الدالة المفقودة التي سببت الخطأ في تشغيل البوت
async function checkDailyMediaStreaks(client, db) {
    let allMediaStreaks = [];
    try {
        const res = await db.query(`SELECT * FROM media_streaks WHERE "streakCount" > 0`);
        allMediaStreaks = res.rows;
    } catch (e) {
        return;
    }

    const todayKSA = getKSADateString(Date.now());

    for (const streakData of allMediaStreaks) {
        const lastDateKSA = getKSADateString(Number(streakData.lastMediaTimestamp || streakData.lastmediatimestamp));
        const diffDays = getDayDifference(todayKSA, lastDateKSA);

        if (diffDays <= 1) continue;

        let member;
        try {
            const guild = await client.guilds.fetch(streakData.guildID || streakData.guildid);
            member = await guild.members.fetch(streakData.userID || streakData.userid);
        } catch (err) { continue; }

        const sendDM = Number(streakData.dmNotify || streakData.dmnotify) === 1;

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel(`الذهاب إلى: ${member.guild.name}`)
                .setStyle(ButtonStyle.Link)
                .setURL(`https://discord.com/channels/${member.guild.id}`)
        );

        if (diffDays === 2) {
            if (Number(streakData.hasItemShield || streakData.hasitemshield) > 0) {
                streakData.hasItemShield = Number(streakData.hasItemShield || streakData.hasitemshield) - 1;
                streakData.lastMediaTimestamp = Date.now();
                await db.query(`UPDATE media_streaks SET "streakCount" = $1, "hasGracePeriod" = $2, "hasItemShield" = $3, "lastMediaTimestamp" = $4 WHERE "id" = $5`, [Number(streakData.streakCount || streakData.streakcount), Number(streakData.hasGracePeriod || streakData.hasgraceperiod), streakData.hasItemShield, streakData.lastMediaTimestamp, streakData.id]);
                if (sendDM) {
                    const embed = new EmbedBuilder().setTitle('✶ اشـعـارات ستـريـك المـيـديـا').setColor(Colors.Green)
                        .setImage('https://i.postimg.cc/NfLYXwD5/123.jpg')
                        .setDescription(`- 🛡️ **تم تفعيل درع المتجر!**\n- تم حماية ستريك الميديا الخاص بك (${streakData.streakCount || streakData.streakcount} ${EMOJI_MEDIA_STREAK}) من الضياع.\n- لا تنسَ الإرسال اليوم!`);
                    member.send({ embeds: [embed], components: [row] }).catch(() => {});
                }
            } else if (Number(streakData.hasGracePeriod || streakData.hasgraceperiod) === 1) {
                streakData.hasGracePeriod = 0;
                streakData.lastMediaTimestamp = Date.now(); 
                await db.query(`UPDATE media_streaks SET "streakCount" = $1, "hasGracePeriod" = $2, "hasItemShield" = $3, "lastMediaTimestamp" = $4 WHERE "id" = $5`, [Number(streakData.streakCount || streakData.streakcount), streakData.hasGracePeriod, Number(streakData.hasItemShield || streakData.hasitemshield), streakData.lastMediaTimestamp, streakData.id]);
                if (sendDM) {
                    const embed = new EmbedBuilder().setTitle('✶ اشـعـارات ستـريـك المـيـديـا').setColor(Colors.Green)
                        .setImage('https://i.postimg.cc/NfLYXwD5/123.jpg')
                        .setDescription(`- 🛡️ **تم تفعيل فترة السماح المجانية!**\n- تم حماية ستريك الميديا الخاص بك (${streakData.streakCount || streakData.streakcount} ${EMOJI_MEDIA_STREAK}).\n- لا تنسَ الإرسال اليوم!`);
                    member.send({ embeds: [embed], components: [row] }).catch(() => {});
                }
            } else {
                const oldStreak = Number(streakData.streakCount || streakData.streakcount);
                streakData.streakCount = 0;
                streakData.hasGracePeriod = 0;
                await db.query(`UPDATE media_streaks SET "streakCount" = $1, "hasGracePeriod" = $2, "hasItemShield" = $3, "lastMediaTimestamp" = $4 WHERE "id" = $5`, [streakData.streakCount, streakData.hasGracePeriod, Number(streakData.hasItemShield || streakData.hasitemshield), Number(streakData.lastMediaTimestamp || streakData.lastmediatimestamp), streakData.id]);
                if (sendDM) {
                    const embed = new EmbedBuilder().setTitle('✶ اشـعـارات ستـريـك المـيـديـا').setColor(Colors.Red)
                        .setImage('https://i.postimg.cc/NfLYXwD5/123.jpg')
                        .setDescription(`- يؤسـفنـا ابلاغـك بـ انـك قـد فقدت ستـريـك المـيـديـا 💔\n- لم تكن تملك اي درع للحماية.\n- كـان ستريـكك: ${oldStreak}`);
                    member.send({ embeds: [embed], components: [row] }).catch(() => {});
                }
            }

        } else if (diffDays > 2) {
            const oldStreak = Number(streakData.streakCount || streakData.streakcount);
            streakData.streakCount = 0;
            streakData.hasGracePeriod = 0;
            await db.query(`UPDATE media_streaks SET "streakCount" = $1, "hasGracePeriod" = $2, "hasItemShield" = $3, "lastMediaTimestamp" = $4 WHERE "id" = $5`, [streakData.streakCount, streakData.hasGracePeriod, Number(streakData.hasItemShield || streakData.hasitemshield), Number(streakData.lastMediaTimestamp || streakData.lastmediatimestamp), streakData.id]);
            if (sendDM) {
                const embed = new EmbedBuilder().setTitle('✶ اشـعـارات ستـريـك المـيـديـا').setColor(Colors.Red)
                    .setImage('https://i.postimg.cc/NfLYXwD5/123.jpg')
                    .setDescription(`- يؤسـفنـا ابلاغـك بـ انـك قـد فقدت ستـريـك المـيـديـا 💔\n- لقد انقطعت عن الإرسال مدة طويلة.\n- كـان ستريـكك: ${oldStreak}`);
                member.send({ embeds: [embed], components: [row] }).catch(() => {});
            }
        }
    }
}

async function handleStreakMessage(message) {
    const db = message.client.sql;
    
    const processId = `${message.guild.id}-${message.author.id}`;
    if (processingUsers.has(processId)) return;
    processingUsers.add(processId);

    try {
        try {
            await db.query(`ALTER TABLE streaks ADD COLUMN IF NOT EXISTS "has12hWarning" BIGINT DEFAULT 0`);
        } catch (e) {}

        const now = Date.now();
        const todayKSA = getKSADateString(now);

        const guildID = message.guild.id;
        const userID = message.author.id;
        const id = `${guildID}-${userID}`;

        const streakRes = await db.query(`SELECT * FROM streaks WHERE "guildID" = $1 AND "userID" = $2`, [guildID, userID]);
        let streakData = streakRes.rows[0];

        if (!streakData) {
            streakData = {
                id: id, guildID, userID,
                streakCount: 1,
                lastMessageTimestamp: now,
                hasGracePeriod: 1,
                hasItemShield: 0,
                nicknameActive: 1,
                hasReceivedFreeShield: 1,
                separator: DEFAULT_SEPARATOR, 
                dmNotify: 1,
                highestStreak: 1,
                has12hWarning: 0
            };
            
            await db.query(`
                INSERT INTO streaks ("id", "guildID", "userID", "streakCount", "lastMessageTimestamp", "hasGracePeriod", "hasItemShield", "nicknameActive", "hasReceivedFreeShield", "separator", "dmNotify", "highestStreak", "has12hWarning") 
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                ON CONFLICT ("id") DO UPDATE SET
                "guildID"=EXCLUDED."guildID", "userID"=EXCLUDED."userID", "streakCount"=EXCLUDED."streakCount", "lastMessageTimestamp"=EXCLUDED."lastMessageTimestamp", "hasGracePeriod"=EXCLUDED."hasGracePeriod", "hasItemShield"=EXCLUDED."hasItemShield", "nicknameActive"=EXCLUDED."nicknameActive", "hasReceivedFreeShield"=EXCLUDED."hasReceivedFreeShield", "separator"=EXCLUDED."separator", "dmNotify"=EXCLUDED."dmNotify", "highestStreak"=EXCLUDED."highestStreak", "has12hWarning"=EXCLUDED."has12hWarning";
            `, [streakData.id, streakData.guildID, streakData.userID, streakData.streakCount, streakData.lastMessageTimestamp, streakData.hasGracePeriod, streakData.hasItemShield, streakData.nicknameActive, streakData.hasReceivedFreeShield, streakData.separator, streakData.dmNotify, streakData.highestStreak, streakData.has12hWarning]);
            
            await updateNickname(message.member, db);

        } else {
            const cleanCheckList = SEPARATORS_CLEAN_LIST.map(s => s.replace('\\', ''));
            if (!cleanCheckList.includes(streakData.separator)) {
                streakData.separator = DEFAULT_SEPARATOR;
                await db.query(`UPDATE streaks SET "separator" = $1 WHERE "id" = $2`, [DEFAULT_SEPARATOR, id]);
            }

            if (Number(streakData.nicknameActive || streakData.nicknameactive) === 1) {
                await updateNickname(message.member, db);
            }

            const lastDateKSA = getKSADateString(Number(streakData.lastMessageTimestamp || streakData.lastmessagetimestamp));
            
            if (todayKSA === lastDateKSA) {
                await db.query(`UPDATE streaks SET "lastMessageTimestamp" = $1, "has12hWarning" = 0 WHERE "id" = $2`, [now, id]);
                return; 
            }

            if (streakData.dmNotify === null || streakData.dmnotify === null || streakData.highestStreak === null || streakData.higheststreak === null) {
                streakData.dmNotify = streakData.dmNotify ?? streakData.dmnotify ?? 1;
                streakData.highestStreak = streakData.highestStreak ?? streakData.higheststreak ?? (streakData.streakCount || streakData.streakcount);
                await db.query(`UPDATE streaks SET "dmNotify" = $1, "highestStreak" = $2 WHERE "id" = $3`, [streakData.dmNotify, streakData.highestStreak, id]);
            }

            if (Number(streakData.streakCount || streakData.streakcount) === 0) {
                streakData.streakCount = 1;
                streakData.lastMessageTimestamp = now;
                streakData.hasGracePeriod = 0;
                streakData.hasItemShield = 0;
                if (Number(streakData.highestStreak || streakData.higheststreak) < 1) streakData.highestStreak = 1;
                streakData.has12hWarning = 0;
                
                await db.query(`
                    INSERT INTO streaks ("id", "guildID", "userID", "streakCount", "lastMessageTimestamp", "hasGracePeriod", "hasItemShield", "nicknameActive", "hasReceivedFreeShield", "separator", "dmNotify", "highestStreak", "has12hWarning") 
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                    ON CONFLICT ("id") DO UPDATE SET
                    "guildID"=EXCLUDED."guildID", "userID"=EXCLUDED."userID", "streakCount"=EXCLUDED."streakCount", "lastMessageTimestamp"=EXCLUDED."lastMessageTimestamp", "hasGracePeriod"=EXCLUDED."hasGracePeriod", "hasItemShield"=EXCLUDED."hasItemShield", "nicknameActive"=EXCLUDED."nicknameActive", "hasReceivedFreeShield"=EXCLUDED."hasReceivedFreeShield", "separator"=EXCLUDED."separator", "dmNotify"=EXCLUDED."dmNotify", "highestStreak"=EXCLUDED."highestStreak", "has12hWarning"=EXCLUDED."has12hWarning";
                `, [streakData.id, streakData.guildID || streakData.guildid, streakData.userID || streakData.userid, streakData.streakCount, streakData.lastMessageTimestamp, streakData.hasGracePeriod, streakData.hasItemShield, Number(streakData.nicknameActive || streakData.nicknameactive), Number(streakData.hasReceivedFreeShield || streakData.hasreceivedfreeshield), streakData.separator, Number(streakData.dmNotify || streakData.dmnotify), streakData.highestStreak, streakData.has12hWarning]);
                
                await updateNickname(message.member, db);
            } else {
                const diffDays = getDayDifference(todayKSA, lastDateKSA);
                if (diffDays === 1) {
                    streakData.streakCount = Number(streakData.streakCount || streakData.streakcount) + 1;
                    streakData.lastMessageTimestamp = now;
                    if (Number(streakData.streakCount) > Number(streakData.highestStreak || streakData.higheststreak)) {
                        streakData.highestStreak = streakData.streakCount;
                    } else {
                        streakData.highestStreak = streakData.highestStreak || streakData.higheststreak;
                    }
                    await db.query(`UPDATE streaks SET "lastMessageTimestamp" = $1, "streakCount" = $2, "highestStreak" = $3, "has12hWarning" = 0 WHERE "id" = $4`, [streakData.lastMessageTimestamp, streakData.streakCount, streakData.highestStreak, streakData.id]);
                    
                    if (Number(streakData.streakCount) > 10) {
                        try {
                            const lvlRes = await db.query(`SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2`, [userID, guildID]);
                            let levelData = lvlRes.rows[0];
                            if (!levelData) levelData = { user: userID, guild: guildID, mora: 0, xp: 0, totalXP: 0, level: 1 };
                            
                            const newMora = (Number(levelData.mora) || 0) + 100;
                            const newXp = (Number(levelData.xp) || 0) + 100;
                            const newTotalXp = (Number(levelData.totalXP || levelData.totalxp) || 0) + 100;
                            
                            await db.query(`
                                INSERT INTO levels ("user", "guild", "mora", "xp", "totalXP", "level") 
                                VALUES ($1, $2, $3, $4, $5, $6) 
                                ON CONFLICT ("user", "guild") DO UPDATE SET 
                                "mora" = EXCLUDED."mora", "xp" = EXCLUDED."xp", "totalXP" = EXCLUDED."totalXP"
                            `, [userID, guildID, newMora, newXp, newTotalXp, levelData.level]);
                        } catch(e) {}
                    }
                    await updateNickname(message.member, db);
                } else {
                    await db.query(`UPDATE streaks SET "lastMessageTimestamp" = $1, "has12hWarning" = 0 WHERE "id" = $2`, [now, id]);
                }
            }
        }
    } catch (err) {
        console.error("Streak Error:", err);
    } finally {
        setTimeout(() => processingUsers.delete(processId), 2000);
    }
}

async function handleMediaStreakMessage(message) {
    const db = message.client.sql;
    try {
        await db.query(`ALTER TABLE media_streaks ADD COLUMN IF NOT EXISTS "lastChannelID" TEXT`);
    } catch (e) {}

    const now = Date.now();
    const todayKSA = getKSADateString(now);
    const guildID = message.guild.id;
    const userID = message.author.id;
    const channelID = message.channel.id;
    const id = `${guildID}-${userID}`;

    let streakData = null;
    try {
        const res = await db.query(`SELECT * FROM media_streaks WHERE "guildID" = $1 AND "userID" = $2`, [guildID, userID]);
        streakData = res.rows[0];
    } catch (e) {}

    let isNewStreakToday = false; 

    if (!streakData) {
        streakData = {
            id: id, guildID, userID,
            streakCount: 1,
            lastMediaTimestamp: now,
            hasGracePeriod: 1,
            hasItemShield: 0,
            hasReceivedFreeShield: 1,
            dmNotify: 1,
            highestStreak: 1,
            lastChannelID: channelID
        };
        
        await db.query(`
            INSERT INTO media_streaks ("id", "guildID", "userID", "streakCount", "lastMediaTimestamp", "hasGracePeriod", "hasItemShield", "hasReceivedFreeShield", "dmNotify", "highestStreak", "lastChannelID") 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT ("id") DO UPDATE SET
            "guildID"=EXCLUDED."guildID", "userID"=EXCLUDED."userID", "streakCount"=EXCLUDED."streakCount", "lastMediaTimestamp"=EXCLUDED."lastMediaTimestamp", "hasGracePeriod"=EXCLUDED."hasGracePeriod", "hasItemShield"=EXCLUDED."hasItemShield", "hasReceivedFreeShield"=EXCLUDED."hasReceivedFreeShield", "dmNotify"=EXCLUDED."dmNotify", "highestStreak"=EXCLUDED."highestStreak", "lastChannelID"=EXCLUDED."lastChannelID";
        `, [streakData.id, streakData.guildID, streakData.userID, streakData.streakCount, streakData.lastMediaTimestamp, streakData.hasGracePeriod, streakData.hasItemShield, streakData.hasReceivedFreeShield, streakData.dmNotify, streakData.highestStreak, streakData.lastChannelID]);
        
        isNewStreakToday = true;
    } else {
        const lastDateKSA = getKSADateString(Number(streakData.lastMediaTimestamp || streakData.lastmediatimestamp));
        
        if ((streakData.lastChannelID || streakData.lastchannelid) !== channelID) {
            await db.query(`UPDATE media_streaks SET "lastChannelID" = $1 WHERE "id" = $2`, [channelID, id]);
            streakData.lastChannelID = channelID;
        }

        if (todayKSA === lastDateKSA) return;

        if (streakData.dmNotify === null || streakData.dmnotify === null || streakData.highestStreak === null || streakData.higheststreak === null) {
            streakData.dmNotify = streakData.dmNotify ?? streakData.dmnotify ?? 1;
            streakData.highestStreak = streakData.highestStreak ?? streakData.higheststreak ?? (streakData.streakCount || streakData.streakcount);
            await db.query(`UPDATE media_streaks SET "dmNotify" = $1, "highestStreak" = $2 WHERE "id" = $3`, [streakData.dmNotify, streakData.highestStreak, id]);
        }

        if (Number(streakData.streakCount || streakData.streakcount) === 0) {
            streakData.streakCount = 1;
            streakData.lastMediaTimestamp = now;
            streakData.hasGracePeriod = 0;
            streakData.hasItemShield = 0;
            streakData.lastChannelID = channelID;
            if (Number(streakData.highestStreak || streakData.higheststreak) < 1) streakData.highestStreak = 1;
            else streakData.highestStreak = streakData.highestStreak || streakData.higheststreak;
            
            await db.query(`
                INSERT INTO media_streaks ("id", "guildID", "userID", "streakCount", "lastMediaTimestamp", "hasGracePeriod", "hasItemShield", "hasReceivedFreeShield", "dmNotify", "highestStreak", "lastChannelID") 
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                ON CONFLICT ("id") DO UPDATE SET
                "guildID"=EXCLUDED."guildID", "userID"=EXCLUDED."userID", "streakCount"=EXCLUDED."streakCount", "lastMediaTimestamp"=EXCLUDED."lastMediaTimestamp", "hasGracePeriod"=EXCLUDED."hasGracePeriod", "hasItemShield"=EXCLUDED."hasItemShield", "hasReceivedFreeShield"=EXCLUDED."hasReceivedFreeShield", "dmNotify"=EXCLUDED."dmNotify", "highestStreak"=EXCLUDED."highestStreak", "lastChannelID"=EXCLUDED."lastChannelID";
            `, [streakData.id, streakData.guildID || streakData.guildid, streakData.userID || streakData.userid, streakData.streakCount, streakData.lastMediaTimestamp, streakData.hasGracePeriod, streakData.hasItemShield, Number(streakData.hasReceivedFreeShield || streakData.hasreceivedfreeshield), Number(streakData.dmNotify || streakData.dmnotify), streakData.highestStreak, streakData.lastChannelID]);
            
            isNewStreakToday = true;
        } else {
            const diffDays = getDayDifference(todayKSA, lastDateKSA);
            if (diffDays === 1) {
                streakData.streakCount = Number(streakData.streakCount || streakData.streakcount) + 1;
                streakData.lastMediaTimestamp = now;
                streakData.lastChannelID = channelID;
                if (Number(streakData.streakCount) > Number(streakData.highestStreak || streakData.higheststreak)) {
                    streakData.highestStreak = streakData.streakCount;
                } else {
                    streakData.highestStreak = streakData.highestStreak || streakData.higheststreak;
                }
                
                await db.query(`UPDATE media_streaks SET "lastMediaTimestamp" = $1, "streakCount" = $2, "highestStreak" = $3, "lastChannelID" = $4 WHERE "id" = $5`, [streakData.lastMediaTimestamp, streakData.streakCount, streakData.highestStreak, streakData.lastChannelID, streakData.id]);
                isNewStreakToday = true;
            } else {
                streakData.streakCount = 1;
                streakData.lastMediaTimestamp = now;
                streakData.hasGracePeriod = 0;
                streakData.hasItemShield = 0;
                streakData.lastChannelID = channelID;
                streakData.highestStreak = streakData.highestStreak || streakData.higheststreak;
                
                await db.query(`
                    INSERT INTO media_streaks ("id", "guildID", "userID", "streakCount", "lastMediaTimestamp", "hasGracePeriod", "hasItemShield", "hasReceivedFreeShield", "dmNotify", "highestStreak", "lastChannelID") 
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                    ON CONFLICT ("id") DO UPDATE SET
                    "guildID"=EXCLUDED."guildID", "userID"=EXCLUDED."userID", "streakCount"=EXCLUDED."streakCount", "lastMediaTimestamp"=EXCLUDED."lastMediaTimestamp", "hasGracePeriod"=EXCLUDED."hasGracePeriod", "hasItemShield"=EXCLUDED."hasItemShield", "hasReceivedFreeShield"=EXCLUDED."hasReceivedFreeShield", "dmNotify"=EXCLUDED."dmNotify", "highestStreak"=EXCLUDED."highestStreak", "lastChannelID"=EXCLUDED."lastChannelID";
                `, [streakData.id, streakData.guildID || streakData.guildid, streakData.userID || streakData.userid, streakData.streakCount, streakData.lastMediaTimestamp, streakData.hasGracePeriod, streakData.hasItemShield, Number(streakData.hasReceivedFreeShield || streakData.hasreceivedfreeshield), Number(streakData.dmNotify || streakData.dmnotify), streakData.highestStreak, streakData.lastChannelID]);
                
                isNewStreakToday = true;
            }
        }
    }

    if (isNewStreakToday) {
        if (Number(streakData.streakCount || streakData.streakcount) > 10) {
            try {
                const lvlRes = await db.query(`SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2`, [userID, guildID]);
                let levelData = lvlRes.rows[0];
                if (!levelData) levelData = { user: userID, guild: guildID, mora: 0, xp: 0, totalXP: 0, level: 1 };
                
                const newMora = (Number(levelData.mora) || 0) + 100;
                const newXp = (Number(levelData.xp) || 0) + 100;
                const newTotalXp = (Number(levelData.totalXP || levelData.totalxp) || 0) + 100;
                
                await db.query(`
                    INSERT INTO levels ("user", "guild", "mora", "xp", "totalXP", "level") 
                    VALUES ($1, $2, $3, $4, $5, $6) 
                    ON CONFLICT ("user", "guild") DO UPDATE SET 
                    "mora" = EXCLUDED."mora", "xp" = EXCLUDED."xp", "totalXP" = EXCLUDED."totalXP"
                `, [userID, guildID, newMora, newXp, newTotalXp, levelData.level]);
            } catch (err) {}
        }
        
        try {
            const reactionEmoji = EMOJI_MEDIA_STREAK.match(/<a?:\w+:(\d+)>/);
            if(reactionEmoji) await message.react(reactionEmoji[1]);
        } catch (e) {}

        try {
            const hasGrace = Number(streakData.hasGracePeriod || streakData.hasgraceperiod) || 0;
            const hasItem = Number(streakData.hasItemShield || streakData.hasitemshield) || 0;
            const totalShields = hasGrace + hasItem;
            const shieldText = totalShields > 0 ? ` | ${totalShields} ${EMOJI_SHIELD}` : '';
            const count = streakData.streakCount || streakData.streakcount;
            const replyMsg = await message.reply({
                content: `✥ تـم تـحديـث ستـريـك الميـديـا: ${count} ${EMOJI_MEDIA_STREAK}${shieldText}`,
                allowedMentions: { repliedUser: false } 
            });
            setTimeout(() => { replyMsg.delete().catch(e => {}); }, 10000);
        } catch (e) {}
    }
}

async function sendMediaStreakReminders(client, db) {
    try {
        await db.query(`ALTER TABLE media_streaks ADD COLUMN IF NOT EXISTS "lastChannelID" TEXT`);
    } catch (e) {}

    const todayKSA = getKSADateString(Date.now());
    let allMediaChannels = [];
    let activeStreaks = [];
    
    try {
        allMediaChannels = (await db.query(`SELECT * FROM media_streak_channels`)).rows;
        activeStreaks = (await db.query(`SELECT * FROM media_streaks WHERE "streakCount" > 0`)).rows;
    } catch(e) { return; }

    const usersToRemind = [];

    for (const streak of activeStreaks) {
        const lastDateKSA = getKSADateString(Number(streak.lastMediaTimestamp || streak.lastmediatimestamp));
        if (lastDateKSA !== todayKSA) {
            usersToRemind.push(streak);
        }
    }

    if (usersToRemind.length === 0) return;

    for (const channelData of allMediaChannels) {
        const guildID = channelData.guildID || channelData.guildid;
        const channelID = channelData.channelID || channelData.channelid;
        const lastReminderMsgID = channelData.lastReminderMessageID || channelData.lastremindermessageid;

        const usersForThisChannel = usersToRemind.filter(streak => 
            (streak.guildID || streak.guildid) === guildID && 
            ((streak.lastChannelID || streak.lastchannelid) === channelID || !(streak.lastChannelID || streak.lastchannelid)) 
        );

        if (usersForThisChannel.length === 0 && !lastReminderMsgID) continue;

        try {
            const channel = await client.channels.fetch(channelID);
            
            if (lastReminderMsgID) {
                try {
                    const oldMessage = await channel.messages.fetch(lastReminderMsgID);
                    if (oldMessage) await oldMessage.delete();
                } catch (e) {}
            }

            if (usersForThisChannel.length > 0) {
                const mentions = usersForThisChannel.map(s => `<@${s.userID || s.userid}>`).join(' ');
                const embed = new EmbedBuilder().setTitle(`🔔 تـذكـيـر ستـريـك المـيـديـا`).setColor(Colors.Yellow)
                    .setDescription(`- نـود تـذكيـركـم بـإرسـال المـيـديـا الخـاصـة بكـم لهـذا اليـوم ${EMOJI_MEDIA_STREAK}\n\n- بـاقـي علـى نهـايـة اليـوم أقـل مـن 9 سـاعـات!`)
                    .setThumbnail('https://i.postimg.cc/8z0Xw04N/attention.png'); 

                const sentMessage = await channel.send({ content: mentions, embeds: [embed] });
                
                await db.query(`UPDATE media_streak_channels SET "lastReminderMessageID" = $1 WHERE "guildID" = $2 AND "channelID" = $3`, [sentMessage.id, guildID, channelID]);
            } else {
                await db.query(`UPDATE media_streak_channels SET "lastReminderMessageID" = NULL WHERE "guildID" = $1 AND "channelID" = $2`, [guildID, channelID]);
            }

        } catch (err) {}
    }
}

async function sendDailyMediaUpdate(client, db) {
    try {
        await db.query(`ALTER TABLE media_streak_channels ADD COLUMN IF NOT EXISTS "lastDailyMsgID" TEXT`);
    } catch (e) {}

    let allMediaChannels = [];
    try {
        allMediaChannels = (await db.query(`SELECT * FROM media_streak_channels`)).rows;
    } catch(e) { return; }

    const guildsStats = {};

    for (const channelData of allMediaChannels) {
        const guildID = channelData.guildID || channelData.guildid;
        const channelID = channelData.channelID || channelData.channelid;
        
        if (!guildsStats[guildID]) {
            let topStreaks = [];
            try {
                topStreaks = (await db.query(`SELECT * FROM media_streaks WHERE "guildID" = $1 AND "streakCount" > 0 ORDER BY "streakCount" DESC LIMIT 3`, [guildID])).rows;
            } catch(e) {}

            let description = `**${EMOJI_MEDIA_STREAK} بـدأ يـوم جـديـد لستريـك الميـديـا! ${EMOJI_MEDIA_STREAK}**\n\n- لا تنسـوا إرسـال المـيـديـا الخـاصـة بكـم لهـذا اليـوم.\n\n`;
            
            const embed = new EmbedBuilder().setTitle("☀️ تـحـديـث ستـريـك المـيـديـا").setColor(Colors.Aqua);

            if (topStreaks.length > 0) {
                description += "**🏆 قـائـمـة الأعـلـى فـي الستـريـك:**\n";
                const leaderboard = topStreaks.map((streak, index) => {
                    const medals = ['🥇', '🥈', '🥉'];
                    const rank = medals[index] || `**${index + 1}.**`;
                    const count = streak.streakCount || streak.streakcount;
                    return `${rank} <@${streak.userID || streak.userid}> - \`${count}\` ${EMOJI_MEDIA_STREAK}`;
                });
                description += leaderboard.join('\n');

                try {
                    const topMember = await client.guilds.cache.get(guildID)?.members.fetch(topStreaks[0].userID || topStreaks[0].userid).catch(() => null);
                    if (topMember) {
                        embed.setThumbnail(topMember.user.displayAvatarURL({ dynamic: true }));
                    } else {
                        embed.setThumbnail('https://i.postimg.cc/mD7Q31TR/New-Day.png');
                    }
                } catch (e) {
                    embed.setThumbnail('https://i.postimg.cc/mD7Q31TR/New-Day.png');
                }

            } else {
                description += "لا يوجـد أحـد لـديـه ستريـك مـيـديـا حـالـيـاً. كـن أول الـمـشاركـيـن!";
                embed.setThumbnail('https://i.postimg.cc/mD7Q31TR/New-Day.png');
            }
            
            embed.setDescription(description).setImage('https://i.postimg.cc/mD7Q31TR/New-Day.png');
            
            guildsStats[guildID] = embed;
        }

        try {
            const channel = await client.channels.fetch(channelID);
            
            const lastDailyMsgID = channelData.lastDailyMsgID || channelData.lastdailymsgid;
            if (lastDailyMsgID) {
                try {
                    const oldMsg = await channel.messages.fetch(lastDailyMsgID);
                    if (oldMsg) await oldMsg.delete();
                } catch (e) {}
            }

            const lastReminderMsgID = channelData.lastReminderMessageID || channelData.lastremindermessageid;
            if (lastReminderMsgID) {
                 try {
                    const oldRemind = await channel.messages.fetch(lastReminderMsgID);
                    if (oldRemind) await oldRemind.delete();
                } catch (e) {}
                await db.query(`UPDATE media_streak_channels SET "lastReminderMessageID" = NULL WHERE "guildID" = $1 AND "channelID" = $2`, [guildID, channelID]);
            }

            const sentMsg = await channel.send({ embeds: [guildsStats[guildID]] });
            await db.query(`UPDATE media_streak_channels SET "lastDailyMsgID" = $1 WHERE "guildID" = $2 AND "channelID" = $3`, [sentMsg.id, guildID, channelID]);

        } catch (err) {}
    }
}

async function sendStreakWarnings(client, db) {
    try {
         await db.query(`ALTER TABLE streaks ADD COLUMN IF NOT EXISTS "has12hWarning" BIGINT DEFAULT 0`);
    } catch (e) {}

    const now = Date.now();
    const twelveHoursAgo = now - (12 * 60 * 60 * 1000);
    const thirtySixHoursAgo = now - (36 * 60 * 60 * 1000);

    let usersToWarn = [];
    try {
        const res = await db.query(`SELECT * FROM streaks WHERE "streakCount" > 0 AND "has12hWarning" = 0 AND "dmNotify" = 1 AND "lastMessageTimestamp" < $1 AND "lastMessageTimestamp" > $2`, [twelveHoursAgo, thirtySixHoursAgo]);
        usersToWarn = res.rows;
    } catch(e) { return; }

    for (const streakData of usersToWarn) {
        let member;
        try {
            const guild = await client.guilds.fetch(streakData.guildID || streakData.guildid);
            member = await guild.members.fetch(streakData.userID || streakData.userid);
        } catch (err) { continue; }

        let settings = {};
        try {
            const sRes = await db.query(`SELECT "streakEmoji" FROM settings WHERE "guild" = $1`, [streakData.guildID || streakData.guildid]);
            if (sRes.rows.length > 0) settings = sRes.rows[0];
        } catch (e) {}

        const streakEmoji = settings.streakEmoji || settings.streakemoji || '🔥';

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel(`الذهاب إلى: ${member.guild.name}`)
                .setStyle(ButtonStyle.Link)
                .setURL(`https://discord.com/channels/${member.guild.id}`)
        );

        const count = streakData.streakCount || streakData.streakcount;
        const embed = new EmbedBuilder().setTitle('✶ تـحـذيـر الـستريـك').setColor(Colors.Yellow)
            .setImage('https://i.postimg.cc/8z0Xw04N/attention.png') 
            .setDescription(`- لـقـد مـضـى أكـثـر مـن 12 سـاعـة عـلـى آخـر رسـالـة لـك\n- سـتريـكك الـحـالي: ${count} ${streakEmoji}\n- سارع بإرسال رسالة قبل أن يضيع الستريك!`);

        await member.send({ embeds: [embed], components: [row] }).then(async () => {
            await db.query(`UPDATE streaks SET "has12hWarning" = 1 WHERE "id" = $1`, [streakData.id]);
        }).catch(() => {});
    }
}

module.exports = {
    calculateBuffMultiplier,
    updateNickname,
    handleStreakMessage,
    handleMediaStreakMessage,
    checkDailyStreaks,
    checkDailyMediaStreaks, // 🔥 تمت إضافتها هنا!
    sendMediaStreakReminders,
    sendDailyMediaUpdate,
    sendStreakWarnings,
    calculateMoraBuff: calculateMoraBuff 
};
