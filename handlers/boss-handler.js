const { EmbedBuilder, ActionRowBuilder, Colors, MessageFlags } = require("discord.js");
const { getWeaponData, getUserRace, getAllSkillData } = require('./pvp-core.js');

const OWNER_ID = '1145327691772481577'; 
const HIT_COOLDOWN = 1 * 60 * 60 * 1000; 
const EMOJI_MORA = '<:mora:1435647151349698621>';
const EMOJI_XP = '<a:levelup:1437805366048985290>';

function calculateHit(baseDamage) {
    const isCritical = Math.random() * 100 < 5;
    let finalDamage = baseDamage;
    if (isCritical) {
        finalDamage = Math.floor(baseDamage * 1.5);
    }
    return { damage: finalDamage, isCritical };
}

function createProgressBar(current, max, length = 12) {
    const percent = Math.max(0, Math.min(1, current / max));
    const filled = Math.floor(percent * length);
    const empty = length - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
}

function updateBossLog(boss, username, toolName, damage) {
    let logs = [];
    try { logs = JSON.parse(boss.lastLog || boss.lastlog || '[]'); } catch (e) {}
    const logEntry = `╰ **${username}**: هـاجـم بـ **${toolName}** وتسبب بضرر \`${damage.toLocaleString()}\``;
    logs.unshift(logEntry);
    if (logs.length > 3) logs = logs.slice(0, 3); 
    return JSON.stringify(logs);
}

function getRandomColor() {
    return Math.floor(Math.random() * 16777215);
}

function getRequiredXP(level) {
    return 5 * (level * level) + (50 * level) + 100;
}

function getRandomDuration(minMinutes, maxMinutes) {
    const minMs = minMinutes * 60 * 1000;
    const maxMs = maxMinutes * 60 * 1000;
    return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

function formatDuration(ms) {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    if (hours > 0) return `${hours} س و ${minutes} د`;
    return `${minutes} د`;
}

async function safeReply(interaction, data) {
    try {
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(data).catch(() => {});
        } else {
            await interaction.reply(data).catch(() => {});
        }
    } catch (e) { console.error("[SafeReply Error]", e); }
}

async function handleBossInteraction(interaction, client, db) {
    if (!interaction.isButton()) return;

    if (!db) {
        return safeReply(interaction, { 
            content: "⚠️ **النظام في حالة صيانة مؤقتة (نسخ احتياطي)، يرجى المحاولة بعد دقيقة.**", 
            flags: [MessageFlags.Ephemeral] 
        });
    }

    try {
        await db.query('SELECT "totalHits" FROM world_boss LIMIT 1');
    } catch (err) {
        if (err.message.includes("does not exist") || err.message.includes("undefined column")) {
            await db.query('ALTER TABLE world_boss ADD COLUMN "totalHits" BIGINT DEFAULT 0');
        }
    }
    
    const { customId, guild, user, member } = interaction;
    const guildID = guild.id;
    const userID = user.id;

    const bossRes = await db.query('SELECT * FROM world_boss WHERE "guildID" = $1 AND "active" = 1', [guildID]);
    const boss = bossRes.rows[0];
    if (!boss) return safeReply(interaction, { content: "❌ **الوحش مات!**", flags: [MessageFlags.Ephemeral] });

    if (customId === 'boss_status') {
        const leaderboardRes = await db.query('SELECT "userID", "totalDamage" FROM boss_leaderboard WHERE "guildID" = $1 ORDER BY "totalDamage" DESC LIMIT 3', [guildID]);
        const leaderboard = leaderboardRes.rows;
        let lbText = leaderboard.length > 0 
            ? leaderboard.map((entry, index) => `${index + 1}# <@${entry.userID || entry.userid}> : **${(entry.totalDamage || entry.totaldamage).toLocaleString()}**`).join('\n') 
            : "لا يوجد سجلات.";

        const totalHits = boss.totalHits || boss.totalhits || 0;

        const statusEmbed = new EmbedBuilder()
            .setTitle(`✥ تـقـريـر المعـركـة`)
            .setColor(Colors.Blue)
            .setDescription(
                `✶ **معـلومـات الزعـيـم:**\n` +
                `- الاسـم: **${boss.name}**\n` +
                `- هجمات متلـقـية: **${totalHits}**\n` +
                `- نقـاط الصحـة: **${(boss.currentHP || boss.currenthp).toLocaleString()} / ${(boss.maxHP || boss.maxhp).toLocaleString()}**\n\n` +
                `✶ **اعـلـى ضـرر:**\n${lbText}`
            );
        if (boss.image) statusEmbed.setThumbnail(boss.image);
        return safeReply(interaction, { embeds: [statusEmbed], flags: [MessageFlags.Ephemeral] });
    }

    let isSkill = false;
    let skillData = null;

    if (customId === 'boss_skill_menu') { 
        isSkill = true;
        const userSkills = await getAllSkillData(db, member);
        skillData = Object.values(userSkills).find(s => s.id.startsWith('race_'));
        
        if (!skillData) {
            return safeReply(interaction, { 
                content: "✶ حـدد عرقـك وطور مهارة عرقـك من المتجـر لتوجه ضربات اقوى وتحصل على جوائز قيمة <a:MugiStronk:1438795606872166462>", 
                flags: [MessageFlags.Ephemeral] 
            });
        }
    } else if (customId !== 'boss_attack') return;

    const isOwner = (userID === OWNER_ID); 
    const now = Date.now();
    if (!isOwner) {
        const cooldownDataRes = await db.query('SELECT "lastHit" FROM boss_cooldowns WHERE "guildID" = $1 AND "userID" = $2', [guildID, userID]);
        const cooldownData = cooldownDataRes.rows[0];
        
        if (cooldownData && (now - parseInt(cooldownData.lastHit || cooldownData.lasthit)) < HIT_COOLDOWN) {
            const expiryTime = Math.floor((parseInt(cooldownData.lastHit || cooldownData.lasthit) + HIT_COOLDOWN) / 1000);
            return safeReply(interaction, { 
                content: `⏳ **اسـترح قليلا ايهـا المحـارب <a:MugiStronk:1438795606872166462>!**\nيمكنك الهجوم مجدداً بعـد <t:${expiryTime}:R>`, 
                flags: [MessageFlags.Ephemeral] 
            });
        }
    }

    let baseCalcDamage = 0;
    let toolName = "خنجر";
    let isDefaultWeapon = false;

    if (isSkill && skillData) {
        toolName = skillData.name;
        baseCalcDamage = skillData.effectValue;
    } else {
        const userRace = await getUserRace(member, db);
        if (userRace) {
            const weapon = await getWeaponData(db, member);
            if (weapon && weapon.currentLevel > 0) {
                baseCalcDamage = weapon.currentDamage;
                toolName = weapon.name;
            } else {
                baseCalcDamage = 15; 
                toolName = "خنجر";
                isDefaultWeapon = true;
            }
        } else {
            baseCalcDamage = 15;
            toolName = "خنجر";
            isDefaultWeapon = true;
        }
    }

    const hitResult = calculateHit(baseCalcDamage);
    let finalDamage = hitResult.damage;
    let isCrit = hitResult.isCritical;

    let newHP = (boss.currentHP || boss.currenthp) - finalDamage;
    if (newHP < 0) newHP = 0;

    const newLogStr = updateBossLog(boss, member.user.displayName, toolName, finalDamage);
    await db.query('UPDATE world_boss SET "currentHP" = $1, "lastLog" = $2, "totalHits" = COALESCE("totalHits", 0) + 1 WHERE "guildID" = $3', [newHP, newLogStr, guildID]);
    
    if (!isOwner) {
        await db.query('INSERT INTO boss_cooldowns ("guildID", "userID", "lastHit") VALUES ($1, $2, $3) ON CONFLICT("guildID", "userID") DO UPDATE SET "lastHit" = EXCLUDED."lastHit"', [guildID, userID, now]);
    }

    const userDmgRecordRes = await db.query('SELECT "totalDamage" FROM boss_leaderboard WHERE "guildID" = $1 AND "userID" = $2', [guildID, userID]);
    const userDmgRecord = userDmgRecordRes.rows[0];
    const updatedDamage = (userDmgRecord ? parseInt(userDmgRecord.totalDamage || userDmgRecord.totaldamage) : 0) + finalDamage;
    
    await db.query('INSERT INTO boss_leaderboard ("guildID", "userID", "totalDamage") VALUES ($1, $2, $3) ON CONFLICT("guildID", "userID") DO UPDATE SET "totalDamage" = EXCLUDED."totalDamage"', [guildID, userID, updatedDamage]);

    let rewardString = "";
    const roll = Math.random() * 100;
    
    const userDataRes = await db.query('SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2', [userID, guildID]);
    let userData = userDataRes.rows[0] || { user: userID, guild: guildID, level: 1, xp: 0, mora: 0, totalXP: 0 };
    
    userData.level = parseInt(userData.level) || 1;
    userData.xp = parseInt(userData.xp) || 0;
    userData.mora = parseInt(userData.mora) || 0; 
    userData.totalxp = parseInt(userData.totalXP || userData.totalxp) || 0; 
    
    let xpToAdd = 0;

    let minReward = 20;
    let maxReward = 150;

    if (userData.level > 10) {
        minReward = 50;
        maxReward = 500;
    }

    if (roll > 98) { 
        const existingCouponRes = await db.query('SELECT 1 FROM user_coupons WHERE "userID" = $1 AND "guildID" = $2', [userID, guildID]);
        if (existingCouponRes.rows.length === 0) {
            const discount = Math.floor(Math.random() * 10) + 1;
            await db.query('INSERT INTO user_coupons ("guildID", "userID", "discountPercent") VALUES ($1, $2, $3)', [guildID, userID, discount]);
            rewardString = `${discount}% كـوبـون خـصـم للمتجـر`;
        } else {
            const duration = getRandomDuration(10, 180);
            const percent = Math.floor(Math.random() * 46) + 5;
            const expiresAt = Date.now() + duration;
            await db.query('DELETE FROM user_buffs WHERE "userID" = $1 AND "guildID" = $2 AND "buffType" = \'xp\'', [userID, guildID]).catch(()=>{});
            await db.query('INSERT INTO user_buffs ("guildID", "userID", "buffPercent", "expiresAt", "buffType", "multiplier") VALUES ($1, $2, $3, $4, $5, $6)', [guildID, userID, percent, expiresAt, 'xp', percent / 100]);

            rewardString = `${percent}% تعـزيـز خبرة ${EMOJI_XP} (لمدة ${formatDuration(duration)})`;
        }

    } else if (roll > 90) {
        const duration = getRandomDuration(10, 180);
        const percent = Math.floor(Math.random() * 46) + 5;
        const expiresAt = Date.now() + duration;
        await db.query('DELETE FROM user_buffs WHERE "userID" = $1 AND "guildID" = $2 AND "buffType" = \'xp\'', [userID, guildID]).catch(()=>{});
        await db.query('INSERT INTO user_buffs ("guildID", "userID", "buffPercent", "expiresAt", "buffType", "multiplier") VALUES ($1, $2, $3, $4, $5, $6)', [guildID, userID, percent, expiresAt, 'xp', percent / 100]);

        rewardString = `${percent}% تعـزيـز خبرة${EMOJI_XP} (لمدة ${formatDuration(duration)})`;

    } else if (roll > 80) {
        const duration = getRandomDuration(10, 180);
        const percent = Math.floor(Math.random() * 8) + 1;
        const expiresAt = Date.now() + duration;
        await db.query('DELETE FROM user_buffs WHERE "userID" = $1 AND "guildID" = $2 AND "buffType" = \'mora\'', [userID, guildID]).catch(()=>{});
        await db.query('INSERT INTO user_buffs ("guildID", "userID", "buffPercent", "expiresAt", "buffType", "multiplier") VALUES ($1, $2, $3, $4, $5, $6)', [guildID, userID, percent, expiresAt, 'mora', percent / 100]);
        
        rewardString = `${percent}% تعـزيـز مورا${EMOJI_MORA} (لمدة ${formatDuration(duration)})`;

    } else if (roll > 40) { 
        const amount = Math.floor(Math.random() * (maxReward - minReward + 1)) + minReward;
        userData.mora += amount; 
        rewardString = `${amount} ${EMOJI_MORA}`;

    } else { 
        xpToAdd = Math.floor(Math.random() * (maxReward - minReward + 1)) + minReward;
        rewardString = `${xpToAdd} ${EMOJI_XP}`;
    }

    if (xpToAdd > 0) {
        userData.xp += xpToAdd;
        userData.totalxp += xpToAdd;
        let requiredXP = getRequiredXP(userData.level);
        let leveledUp = false;
        while (userData.xp >= requiredXP) {
            userData.xp -= requiredXP;
            userData.level += 1;
            requiredXP = getRequiredXP(userData.level);
            leveledUp = true;
        }
        if (leveledUp) rewardString += `\n🆙 **Level Up!** -> ${userData.level}`;
    }
    
    if (userDataRes.rows.length > 0) {
        await db.query('UPDATE levels SET "mora" = $1, "xp" = $2, "totalXP" = $3, "level" = $4 WHERE "user" = $5 AND "guild" = $6', [userData.mora, userData.xp, userData.totalxp, userData.level, userID, guildID]);
    } else {
        await db.query('INSERT INTO levels ("user", "guild", "mora", "xp", "totalXP", "level") VALUES ($1, $2, $3, $4, $5, $6)', [userID, guildID, userData.mora, userData.xp, userData.totalxp, userData.level]);
    }

    let weakWeaponWarning = "";
    if (isDefaultWeapon) {
        weakWeaponWarning = "\n✬ استعـمـلت سلاح ضعيف في هجومك هذا حدد عرقك واشتري سلاح من المتجر لتحصل على جوائز قيمة اكثر <a:MugiStronk:1438795606872166462>";
    }

    let critText = isCrit ? " 🔥 **ضربة حرجة!**" : "";

    const bossMsg = await interaction.channel.messages.fetch(boss.messageID || boss.messageid).catch(() => null);
    if (bossMsg) {
        const hpPercent = Math.floor((newHP / (boss.maxHP || boss.maxhp)) * 100);
        const progressBar = createProgressBar(newHP, (boss.maxHP || boss.maxhp), 12); 
        let logsArr = [];
        try { logsArr = JSON.parse(newLogStr); } catch(e){}
        const logDisplay = logsArr.length > 0 ? logsArr.join('\n') : "╰ بانتظار الهجوم الأول...";

        const newEmbed = EmbedBuilder.from(bossMsg.embeds[0])
            .setColor(getRandomColor())
            .setDescription(
                `✬ ظـهـر زعـيـم في السـاحـة تـعاونـوا عـلـى قتاله واكسبوا الجوائـز <:trophy:1438797232458432602>!\n\n` +
                `✬ **نـقـاط صـحـة الزعـيـم <a:Nerf:1438795685280612423>:**\n` +
                `${progressBar} **${hpPercent}%**\n` +
                `╰ **${newHP.toLocaleString()}** / ${(boss.maxHP || boss.maxhp).toLocaleString()} HP\n\n` +
                `✬ **سـجـل الـمـعـركـة ⚔️:**\n` +
                `${logDisplay}`
            ).setFields([]); 

        if (newHP <= 0) {
            const leaderboardResFinal = await db.query('SELECT "userID", "totalDamage" FROM boss_leaderboard WHERE "guildID" = $1 ORDER BY "totalDamage" DESC LIMIT 3', [guildID]);
            const leaderboardFinal = leaderboardResFinal.rows;
            let lbText = "لا يوجد.";
            if (leaderboardFinal.length > 0) {
                lbText = leaderboardFinal.map((entry, index) => `${index + 1}. <@${entry.userID || entry.userid}>: **${parseInt(entry.totalDamage || entry.totaldamage).toLocaleString()}**`).join('\n');
            }
            
            let finalHits = 0;
            try {
                const finalBossDataRes = await db.query('SELECT "totalHits" FROM world_boss WHERE "guildID" = $1', [guildID]);
                const finalBossData = finalBossDataRes.rows[0];
                finalHits = finalBossData ? (parseInt(finalBossData.totalHits || finalBossData.totalhits) + 1) : 1; 
            } catch (e) { finalHits = 1; }

            newEmbed.setTitle(`✥ تـمـت هزيـمـة الزعـيـم ${boss.name}`)
                .setDescription(
                    `✶ **معـلومـات الزعـيـم:**\n` +
                    `- الاسـم: **${boss.name}**\n` +
                    `- هجمات متلـقـية ⚔️: **${finalHits}**\n` +
                    `- نقـاط الصحـة <a:Nerf:1438795685280612423>: **${(boss.maxHP || boss.maxhp).toLocaleString()}**\n\n` +
                    `✶ **اعـلـى ضـرر <a:buff:1438796257522094081>:**\n` +
                    `${lbText}\n\n` +
                    `**صـاحـب الضربـة القاضيـة 🗡️:**\n` +
                    `✬ ${member}`
                )
                .setColor(Colors.Gold);

            await bossMsg.edit({ embeds: [newEmbed], components: [] });
            await db.query('UPDATE world_boss SET "active" = 0 WHERE "guildID" = $1', [guildID]);
            await db.query('DELETE FROM boss_leaderboard WHERE "guildID" = $1', [guildID]);
            
            return safeReply(interaction, { 
                content: `✬ هـاجـمـت الزعـيـم وتسببـت بـ **${finalDamage.toLocaleString()}** ضرر (قاضية!)${critText}\n✶ حـصـلت عـلـى: ${rewardString}${weakWeaponWarning}`, 
                flags: [MessageFlags.Ephemeral] 
            });
        } else {
            await bossMsg.edit({ embeds: [newEmbed] });
        }
    }

    await safeReply(interaction, { 
        content: `✬ هـاجـمـت الزعـيـم وتسببـت بـ **${finalDamage.toLocaleString()}** ضرر${critText}\n✶ حـصـلت عـلـى: ${rewardString}${weakWeaponWarning}`, 
        flags: [MessageFlags.Ephemeral] 
    });
}

module.exports = { handleBossInteraction };
