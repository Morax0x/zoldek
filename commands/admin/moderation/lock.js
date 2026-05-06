const { PermissionsBitField, SlashCommandBuilder } = require("discord.js");

module.exports = {
    // --- إعدادات Slash Command ---
    data: new SlashCommandBuilder()
        .setName('lock')
        .setDescription('🔒 يقفل القناة (يمنع الكل من الكتابة).')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels)
        .addChannelOption(option => 
            option.setName('channel')
                .setDescription('القناة المراد قفلها')
                .setRequired(false)
        ),

    // --- إعدادات Prefix Command ---
    name: 'lock',
    aliases: ['قفل', 'close'],
    description: "يقفل القناة المحددة أو الحالية.",
    category: "Moderation",

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let member = interactionOrMessage.member;

        // تحديد القناة المستهدفة سواء كان سلاش أو أمر عادي
        let targetChannel = isSlash 
            ? (interactionOrMessage.options.getChannel('channel') || interactionOrMessage.channel) 
            : (interactionOrMessage.mentions.channels.first() || interactionOrMessage.channel);

        // دالة رد ذكية تتعامل مع السلاش والرسائل العادية بأمان (حذف ephemeral للرسائل العادية)
        const replyFunc = async (msgObj) => {
            if (isSlash) {
                return interactionOrMessage.reply(msgObj);
            } else {
                const { ephemeral, ...safeMsgObj } = msgObj; 
                return interactionOrMessage.reply(safeMsgObj);
            }
        };

        // التحقق من صلاحيات العضو
        if (!member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
            return replyFunc({ content: "⛔️ **لا تملك صلاحية `Manage Channels`!**", ephemeral: true });
        }

        // 🔥 فحص مهم: التحقق من صلاحيات البوت نفسه لكي لا يحدث كراش
        if (!interactionOrMessage.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
            return replyFunc({ content: "⛔️ **أنا لا أملك صلاحية `Manage Channels` لقفل القناة! يرجى التحقق من رتبتي.**", ephemeral: true });
        }

        try {
            // قفل القناة بمنع الإرسال لـ everyone
            await targetChannel.permissionOverwrites.edit(interactionOrMessage.guild.roles.everyone, {
                SendMessages: false,
                SendMessagesInThreads: false
            });

            await replyFunc({ content: `✅ **تـم قـفـل ${targetChannel}** <a:MugiStronk:1438795606872166462>` });

        } catch (error) {
            console.error("[Lock Command Error]:", error);
            await replyFunc({ content: "❌ **حدث خطأ أثناء محاولة قفل القناة. تأكد أن رتبتي أعلى من إعدادات القناة.**", ephemeral: true });
        }
    }
};
