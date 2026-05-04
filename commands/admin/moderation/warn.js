const { PermissionsBitField, EmbedBuilder, Colors } = require('discord.js');

module.exports = {
    name: 'warn',
    description: 'توجيه تحذير رسمي لعضو',
    aliases: ['ت', 'تحذير', 'انذار'],
    category: 'Admin',
    usage: 'warn <@user> [reason]',
    
    async execute(message, args) {
        const db = message.client.sql;

        if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers)) return;

        let targetMember;
        if (message.reference && message.reference.messageId) {
            try {
                const repliedMsg = await message.channel.messages.fetch(message.reference.messageId);
                targetMember = await message.guild.members.fetch(repliedMsg.author.id);
            } catch (err) {}
        }

        if (!targetMember) {
            const targetArg = args[0];
            if (!targetArg) return message.reply('❓ **الرجاء تحديد العضـو أو الرد على رسالته.**');
            
            try {
                targetMember = message.mentions.members.first() || await message.guild.members.fetch(targetArg);
            } catch (err) {
                return message.reply('❌ **لم يتم العثور على العضو.**');
            }
        }

        if (targetMember.user.bot) return message.reply('❌ **لا يمكنك تحذير البوتات.**');
        if (targetMember.id === message.author.id) return message.reply('❌ **لا يمكنك تحذير نفسك.**');
        
        if (message.author.id !== message.guild.ownerId && targetMember.roles.highest.position >= message.member.roles.highest.position) {
            return message.reply('❌ **لا يمكنك تحذير شخص رتبته أعلى منك.**');
        }

        const reason = (message.reference ? args.join(" ") : args.slice(1).join(" ")) || "مخالفة القوانين";

        let dmSent = false;
        try {
            const dmEmbed = new EmbedBuilder()
                .setTitle('✥ تـلـقـيت تـحذيـر')
                .setColor(Colors.Red)
                .setDescription(`**✶ السبب:** ${reason}\n**✶ السيرفر:** ${message.guild.name}\n**✶ بواسـطـة:** <@${message.author.id}>`)
                .setImage('https://i.postimg.cc/VkD37Gqk/a5d06761d4d3fed9158d034359c934b4.gif');

            await targetMember.send({ embeds: [dmEmbed] });
            dmSent = true;
        } catch (e) { dmSent = false; }

        const successEmbed = new EmbedBuilder()
            .setColor(Colors.Red)
            .setDescription(`⚠️ **تم تحذير ${targetMember.user.tag}**\n📝 **السبب:** ${reason}`)
            .setFooter({ text: dmSent ? 'تم إشعاره بالخاص' : 'لم يتم إشعاره (الخاص مغلق)' });
        
        message.reply({ embeds: [successEmbed], allowedMentions: { repliedUser: false } });

        await sendModLog(message, targetMember, reason, db);
    }
};

async function sendModLog(message, targetMember, reason, db) {
    if (!db) return;
    try {
        // 🔥 تم الإصلاح هنا: وضع أسماء الأعمدة بين "" لكي تقبلها PostgreSQL
        const settingsRes = await db.query(`SELECT "modLogChannelID" FROM settings WHERE "guild" = $1`, [message.guild.id]);
        const settings = settingsRes.rows[0];
        
        if (settings && (settings.modlogchannelid || settings.modLogChannelID)) {
            const logChannel = message.guild.channels.cache.get(settings.modlogchannelid || settings.modLogChannelID);
            if (logChannel) {
                const logEmbed = new EmbedBuilder()
                    .setTitle(`⚠️ New Warning Issued`)
                    .setColor(Colors.Yellow)
                    .setThumbnail(targetMember.user.displayAvatarURL())
                    .addFields(
                        { name: '👤 العضو', value: `${targetMember.user.tag} (${targetMember.id})`, inline: true },
                        { name: '👮 المشرف', value: `${message.author.tag} (${message.author.id})`, inline: true },
                        { name: '📝 السبب', value: reason },
                        { name: '⏰ الوقت', value: `<t:${Math.floor(Date.now() / 1000)}:F>` }
                    )
                    .setFooter({ text: `EMorax Security System` });
                logChannel.send({ embeds: [logEmbed] }).catch(() => {});
            }
        }
    } catch (error) {
        console.error("[Warn Command] ModLog Error:", error);
    }
}
