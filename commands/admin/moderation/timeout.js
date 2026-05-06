const { PermissionsBitField, EmbedBuilder, Colors } = require('discord.js');

module.exports = {
    name: 'timeout',
    description: 'إسكات عضو (تلقائي 30 دقيقة إذا لم يحدد وقت)',

    aliases: ['اوت', 'تايم', 'اسكات', 'انطم', 'اخرس', 'اسكت'],
    category: 'Admin',
    usage: 'timeout <@user> [time] [reason] أو بالرد على رسالته',
    
    async execute(message, args) {
        const db = message.client.sql;

        if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return;

        if (!message.guild.members.me.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
            return message.reply({ content: '❌ **لا أملك صلاحية "Moderate Members".**', allowedMentions: { repliedUser: false } });
        }

        let targetMember;
        let timeArg;
        let reasonArgs;

        if (message.reference && message.reference.messageId) {
            try {
                const repliedMsg = await message.channel.messages.fetch(message.reference.messageId);
                targetMember = await message.guild.members.fetch(repliedMsg.author.id);
                
                if (args[0] && /^(\d+)(s|m|h|d|w)$/.test(args[0])) {
                    timeArg = args[0];
                    reasonArgs = args.slice(1);
                } else {
                    timeArg = '30m';
                    reasonArgs = args;
                }
            } catch (err) {}
        } 
        
        if (!targetMember) {
            const targetArg = args[0];
            if (!targetArg) return message.reply('❓ **منشن العضو أو قم بالرد على رسالته.**');
            
            try {
                targetMember = message.mentions.members.first() || await message.guild.members.fetch(targetArg);
            } catch (err) {
                return message.reply('❌ **لم يتم العثور على العضو.**');
            }

            timeArg = args[1];
            if (timeArg && /^(\d+)(s|m|h|d|w)$/.test(timeArg)) {
                reasonArgs = args.slice(2);
            } else {
                timeArg = '30m';
                reasonArgs = args.slice(1);
            }
        }

        if (targetMember.user.bot) return message.reply('❌ **لا يمكنني إسكات البوتات.**');
        if (targetMember.id === message.author.id) return message.reply('❌ **لا يمكنك إسكات نفسك.**');
        if (targetMember.id === message.guild.ownerId) return message.reply('❌ **لا يمكنك إسكات المالك.**');
        
        if (message.author.id !== message.guild.ownerId && targetMember.roles.highest.position >= message.member.roles.highest.position) {
            return message.reply('❌ **لا يمكنك إسكات شخص رتبته أعلى منك أو مساوية لك.**');
        }
        if (!targetMember.moderatable) {
            return message.reply('❌ **لا يمكنني إسكات هذا العضو (رتبته أعلى مني).**');
        }

        let finalTimeMs = parseDuration(timeArg);
        let reason = reasonArgs.join(" ") || "مخالفة القوانين";

        if (!finalTimeMs || finalTimeMs > 28 * 24 * 60 * 60 * 1000) { 
            return message.reply('❌ **الوقت غير صحيح أو يتجاوز الحد الأقصى (28 يوم).**');
        }

        let arabicTime = timeArg
            .replace('s', ' ثانية').replace('m', ' دقيقة').replace('h', ' ساعة').replace('d', ' يوم').replace('w', ' اسبوع');

        // 🔥 تم إصلاح استعلام قاعدة البيانات ليوافق PostgreSQL
        const lastCaseRes = await db.query(`SELECT "caseID" FROM mod_cases WHERE "guildID" = $1 ORDER BY "caseID" DESC LIMIT 1`, [message.guild.id]);
        let lastCase = lastCaseRes.rows[0];
        let newCaseID = lastCase ? parseInt(lastCase.caseid || lastCase.caseID) + 1 : 1;
        const uniqueID = `${message.guild.id}-${newCaseID}`;

        try {
            const dmEmbed = new EmbedBuilder()
                .setTitle('✥ تـم اسـكـاتـك')
                .setColor('Random')
                .setDescription(`**✶ السبب:** ${reason}\n**✶ المـدة:** ${arabicTime}\n**✶ السيرفر:** ${message.guild.name}\n**✶ بواسـطـة:** <@${message.author.id}>`)
                .setImage('https://tenor.com/view/amagami-amagami-sister-tying-the-knot-with-an-amagami-sister-mahiru-anekouji-gif-17869569217293962202');

            await targetMember.send({ embeds: [dmEmbed] });
        } catch (e) { }

        try {
            await targetMember.timeout(finalTimeMs, `[Timeout by ${message.author.tag}] Reason: ${reason}`);
        } catch (err) {
            return message.reply('❌ **حدث خطأ غير متوقع.**');
        }

        // 🔥 تم إصلاح استعلام الإدخال بوضع أسماء الأعمدة بين تنصيص 
        await db.query(`INSERT INTO mod_cases ("id", "guildID", "caseID", "type", "targetID", "moderatorID", "reason", "timestamp") VALUES ($1, $2, $3, 'TIMEOUT', $4, $5, $6, $7)`, [uniqueID, message.guild.id, newCaseID, targetMember.id, message.author.id, reason, Date.now()]);

        const chatEmbed = new EmbedBuilder()
            .setDescription('✶ تـم الاسـكـات ...')
            .setColor('Random')
            .setImage('https://i.postimg.cc/3rDRFSGW/amagami-amagami-sister.gif');
        
        message.reply({ embeds: [chatEmbed], allowedMentions: { repliedUser: false } });

        await sendModLog(message, targetMember, 'TIMEOUT', reason, newCaseID, arabicTime, db);
    }
};

function parseDuration(str) {
    if (!str) return null;
    const match = str.match(/^(\d+)(s|m|h|d|w)$/);
    if (!match) return null;
    const value = parseInt(match[1]);
    const unit = match[2];
    switch (unit) {
        case 's': return value * 1000;
        case 'm': return value * 60 * 1000;
        case 'h': return value * 60 * 60 * 1000;
        case 'd': return value * 24 * 60 * 60 * 1000;
        case 'w': return value * 7 * 24 * 60 * 60 * 1000;
        default: return null;
    }
}

async function sendModLog(message, targetMember, type, reason, caseID, duration, db) {
    if (!db) return;
    try {
        // 🔥 تم إصلاح هذا الاستعلام أيضاً 
        const settingsRes = await db.query(`SELECT "modLogChannelID" FROM settings WHERE "guild" = $1`, [message.guild.id]);
        const settings = settingsRes.rows[0];
        
        if (settings && (settings.modlogchannelid || settings.modLogChannelID)) {
            const logChannel = message.guild.channels.cache.get(settings.modlogchannelid || settings.modLogChannelID);
            if (logChannel) {
                const logEmbed = new EmbedBuilder()
                    .setTitle(`🟡 New Timeout | Case #${caseID}`)
                    .setColor(Colors.Orange)
                    .setThumbnail(targetMember.user.displayAvatarURL())
                    .addFields(
                        { name: '👤 العضو', value: `${targetMember.user.tag} (${targetMember.id})`, inline: true },
                        { name: '👮 المشرف', value: `${message.author.tag} (${message.author.id})`, inline: true },
                        { name: '⏱️ المدة', value: duration || 'N/A', inline: true },
                        { name: '📝 السبب', value: reason },
                        { name: '⏰ الوقت', value: `<t:${Math.floor(Date.now() / 1000)}:F>` }
                    )
                    .setFooter({ text: `EMorax Security System` });
                logChannel.send({ embeds: [logEmbed] }).catch(() => {});
            }
        }
    } catch (e) {
        console.error("[Timeout Command] ModLog Error:", e);
    }
}
