const { EmbedBuilder, Colors } = require("discord.js");

const COOLDOWN_DURATION = 86400; 
const JAIL_DURATION = 10800;     

async function getReportSettings(db, guildID) {
    // 🔥 حماية الأسماء المحمية في PostgreSQL
    const res = await db.query(`SELECT * FROM report_settings WHERE "guildID" = $1`, [guildID]);
    return res.rows[0] || {};
}

async function hasReportPermission(db, member) {
    if (member.permissions.has('Administrator') || member.id === member.guild.ownerId) {
        return true;
    }
    const settings = await getReportSettings(db, member.guild.id);
    // التحقق من الحقل سواء كان بحروف صغيرة أو محمية لضمان عدم التعطل
    const logChannelID = settings.logChannelID || settings.logchannelid;
    if (!logChannelID) return false; 

    const allowedRolesRes = await db.query(`SELECT "roleID" FROM report_permissions WHERE "guildID" = $1`, [member.guild.id]);
    const allowedRoles = allowedRolesRes.rows;
    
    if (allowedRoles.length === 0) return true; 

    const allowedRoleIDs = allowedRoles.map(r => r.roleID || r.roleid);
    return member.roles.cache.some(r => allowedRoleIDs.includes(r.id));
}

async function sendReportError(destination, title, description, ephemeral = false) {
    const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(Colors.Red)
        .setImage("https://i.postimg.cc/L5hmJ9nT/h-K6-Ldr-K-1-2.gif");

    if (destination.channel && !destination.isCommand && !destination.isInteraction) { 
        try { await destination.delete(); } catch(e) {} 
        return destination.channel.send({ content: `${destination.author}`, embeds: [embed] });
    }

    try {
        if (destination.replied || destination.deferred) {
            await destination.followUp({ embeds: [embed], ephemeral: ephemeral });
        } else {
            await destination.reply({ embeds: [embed], ephemeral: ephemeral });
        }
    } catch (e) {
        console.error("Failed to send report error:", e);
    }
}

async function processReportLogic(client, interactionOrMessage, targetMember, reason, reportedMessageLink = null) {
    const db = client.sql;
    const guild = interactionOrMessage.guild;
    const reporter = interactionOrMessage.member;
    const settings = await getReportSettings(db, guild.id);

    const LOG_CHANNEL_ID = settings.logChannelID || settings.logchannelid;
    const JAIL_ROLE_ID = settings.jailRoleID || settings.jailroleid;
    const ARENA_ROLE_ID = settings.arenaRoleID || settings.arenaroleid; 
    const UNLIMITED_ROLE_ID = settings.unlimitedRoleID || settings.unlimitedroleid;
    const TEST_ROLE_ID = settings.testRoleID || settings.testroleid;
    const REPORT_CHANNEL_ID = settings.reportChannelID || settings.reportchannelid; 

    const isSlash = !!interactionOrMessage.isChatInputCommand || !!interactionOrMessage.isContextMenuCommand || !!interactionOrMessage.isModalSubmit;
     
    if (targetMember.id === reporter.id) return sendReportError(interactionOrMessage, "❖ بـلاغ مـرفـوض", "متـوحـد انـت؟ تبلغ على نفسـك؟.", true);
    if (targetMember.id === guild.ownerId) return sendReportError(interactionOrMessage, "❖ تـم رفـض بـلاغـك !", "تبلغ على موراكس؟ بتودينا بداهية اذلف.", true);
    if (targetMember.user.bot) return sendReportError(interactionOrMessage, "❖ تـم رفـض بـلاغـك !", "صـاحـي انت؟ تبلغ علـة بوت؟؟.", true);

    const currentTimestamp = Math.floor(Date.now() / 1000);
    const unlimitedRole = UNLIMITED_ROLE_ID ? guild.roles.cache.get(UNLIMITED_ROLE_ID) : null;
    const testRole = TEST_ROLE_ID ? guild.roles.cache.get(TEST_ROLE_ID) : null;

    const isUnlimited = (reporter.permissions.has('Administrator') || reporter.id === guild.ownerId || (unlimitedRole && reporter.roles.cache.has(unlimitedRole.id)) || (testRole && reporter.roles.cache.has(testRole.id)));

    if (!isUnlimited) {
        const cooldownRes = await db.query(`SELECT "timestamp" FROM active_reports WHERE "guildID" = $1 AND "targetID" = $2 AND "reporterID" = $3`, [guild.id, targetMember.id, reporter.id]);
        const cooldownRecord = cooldownRes.rows[0];
        if (cooldownRecord && (currentTimestamp - cooldownRecord.timestamp) < COOLDOWN_DURATION) {
            return sendReportError(interactionOrMessage, "❖ بـلاغ مـكـرر !", "حـلاوة هي؟ كل شوي تبلغ عليـه.", true);
        }
    }

    await db.query(`DELETE FROM active_reports WHERE "timestamp" < $1`, [currentTimestamp - COOLDOWN_DURATION]);
    
    await db.query(`
        INSERT INTO active_reports ("guildID", "targetID", "reporterID", "timestamp") 
        VALUES ($1, $2, $3, $4) 
        ON CONFLICT ("guildID", "targetID", "reporterID") DO UPDATE SET "timestamp" = EXCLUDED."timestamp"
    `, [guild.id, targetMember.id, reporter.id, currentTimestamp]);
    
    const countRes = await db.query(`SELECT COUNT(DISTINCT "reporterID") as count FROM active_reports WHERE "guildID" = $1 AND "targetID" = $2`, [guild.id, targetMember.id]);
    const reportCount = parseInt(countRes.rows[0].count, 10);

    const embedSuccess = new EmbedBuilder()
        .setTitle("❖ تـم تقديـم البلاغ بنـجـاح")
        .setDescription(`✶ متلقي البلاغ: ${targetMember}\n✶ سبب البلاغ: ${reason}\n✶ عدد البلاغات: ${reportCount}`)
        .setColor(Colors.Red) 
        .setImage("https://i.postimg.cc/NGDJd8LZ/image.png");

    if (isSlash) {
        if (interactionOrMessage.replied || interactionOrMessage.deferred) {
            await interactionOrMessage.followUp({ embeds: [embedSuccess], ephemeral: true });
        } else {
            await interactionOrMessage.reply({ embeds: [embedSuccess], ephemeral: true });
        }
        const reportChannel = REPORT_CHANNEL_ID ? guild.channels.cache.get(REPORT_CHANNEL_ID) : null;
        if (reportChannel) {
            const publicEmbed = new EmbedBuilder(embedSuccess.toJSON()).setFooter({ text: "APPS RE" }); 
            await reportChannel.send({ content: `${targetMember}`, embeds: [publicEmbed] });
        }
    } else {
        await interactionOrMessage.channel.send({ content: `${targetMember}`, embeds: [embedSuccess] });
    }

    const logChannel = LOG_CHANNEL_ID ? guild.channels.cache.get(LOG_CHANNEL_ID) : null;
    if (logChannel) {
        const reportLink = reportedMessageLink ? `\n**🔗 رابط الرسالة:** [إضغط هنا](${reportedMessageLink})` : "";
        const logEmbed = new EmbedBuilder()
            .setTitle("📢 بــلاغ جــديــد")
            .setDescription(`✶ المبلغ: ${reporter}\n✶ متلقي البلاغ: ${targetMember}\n✶ سبب البلاغ: ${reason}${reportLink}\n✶ عدد البلاغات: ${reportCount}`)
            .setColor(Colors.Red).setTimestamp();
        await logChannel.send({ embeds: [logEmbed] });
    }

    if (reportCount >= 2) {
        try {
            const jailRole = JAIL_ROLE_ID ? guild.roles.cache.get(JAIL_ROLE_ID) : null;
            const arenaRole = ARENA_ROLE_ID ? guild.roles.cache.get(ARENA_ROLE_ID) : null;
            
            if (arenaRole && targetMember.roles.cache.has(arenaRole.id)) {
                await targetMember.roles.remove(arenaRole, "تلقى بلاغين (سحب رتبة الساحة)");
            }
            
            if (jailRole) {
                await targetMember.roles.add(jailRole, "تلقى بلاغين (إعطاء رتبة السجن)");
            }

            if (targetMember.moderatable) {
                await targetMember.timeout(JAIL_DURATION * 1000, "تلقى بلاغين - سجن تلقائي");
            }

            const unjailTime = currentTimestamp + JAIL_DURATION;
            await db.query(`
                INSERT INTO jailed_members ("guildID", "userID", "unjailTime") 
                VALUES ($1, $2, $3) 
                ON CONFLICT ("guildID", "userID") DO UPDATE SET "unjailTime" = EXCLUDED."unjailTime"
            `, [guild.id, targetMember.id, unjailTime]);
            
            await db.query(`DELETE FROM active_reports WHERE "guildID" = $1 AND "targetID" = $2`, [guild.id, targetMember.id]);

            const jailEmbed = new EmbedBuilder()
                .setTitle("❖ تلقـى بلاغين وتـم سـجـنـه!")
                .setDescription(`✶ المنفي: ${targetMember}\n✶ المدة: 3 ساعات`)
                .setColor(Colors.Blue)
                .setImage("https://i.postimg.cc/L6TpBZMs/image.png");
                
            const reportChannel = REPORT_CHANNEL_ID ? guild.channels.cache.get(REPORT_CHANNEL_ID) : null;
            if (reportChannel) await reportChannel.send({ embeds: [jailEmbed] });

        } catch (e) { 
            console.error("Jail/Timeout Execution Error:", e); 
        }
    }
}

async function checkUnjailTask(client) {
    const db = client.sql;
    if (!db) return;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    // 🔥 حماية "unjailTime" بعلامات التنصيص
    const res = await db.query(`SELECT * FROM jailed_members WHERE "unjailTime" <= $1`, [currentTimestamp]);
    const jailedToRelease = res.rows;
    
    for (const record of jailedToRelease) {
        const guildID = record.guildID || record.guildid;
        const userID = record.userID || record.userid;
        
        const guild = client.guilds.cache.get(guildID);
        if (!guild) { 
            await db.query(`DELETE FROM jailed_members WHERE "guildID" = $1 AND "userID" = $2`, [guildID, userID]); 
            continue; 
        }

        const settings = await getReportSettings(db, guild.id);
        const jailRoleID = settings.jailRoleID || settings.jailroleid;
        if (!jailRoleID) { 
            await db.query(`DELETE FROM jailed_members WHERE "guildID" = $1 AND "userID" = $2`, [guildID, userID]); 
            continue; 
        }

        const jailRole = guild.roles.cache.get(jailRoleID);
        const logChannelID = settings.logChannelID || settings.logchannelid;
        const logChannel = logChannelID ? guild.channels.cache.get(logChannelID) : null;
        
        try {
            const member = await guild.members.fetch(userID);
            if (member) {
                if (jailRole && member.roles.cache.has(jailRole.id)) {
                    await member.roles.remove(jailRole, "انتهاء مدة السجن التلقائي");
                }
                
                if (member.isCommunicationDisabled()) {
                    await member.timeout(null, "انتهاء مدة السجن التلقائي");
                }

                if (logChannel) {
                    await logChannel.send({ 
                        embeds: [new EmbedBuilder()
                            .setTitle("🎉 تـم الإفـراج عن سجين")
                            .setDescription(`المستخدم ${member} تم الإفراج عنه وانتهاء عقوبة التايم أوت.`)
                            .setColor(Colors.Green)
                        ] 
                    });
                }
            }
        } catch (e) {
        }
        
        await db.query(`DELETE FROM jailed_members WHERE "guildID" = $1 AND "userID" = $2`, [guildID, userID]);
    }
}

module.exports = { getReportSettings, hasReportPermission, sendReportError, processReportLogic, checkUnjailTask };
