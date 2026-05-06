const { PermissionsBitField, SlashCommandBuilder } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unlock')
        .setDescription('🔓 يفتح القناة للكتابة.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels)
        .addChannelOption(option => 
            option.setName('channel')
                .setDescription('القناة المراد فتحها')
                .setRequired(false)
        ),

    name: 'unlock',
    aliases: ['فتح', 'open'],
    description: "يفتح القناة المحددة أو الحالية.",
    category: "Moderation",

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let member = interactionOrMessage.member;
        
        // تحديد القناة المستهدفة سواء كان سلاش أو أمر عادي
        let targetChannel = isSlash 
            ? (interactionOrMessage.options.getChannel('channel') || interactionOrMessage.channel) 
            : (interactionOrMessage.mentions.channels.first() || interactionOrMessage.channel);

        // دالة رد ذكية تتعامل مع السلاش والرسائل العادية بأمان
        const replyFunc = async (msgObj) => {
            if (isSlash) {
                return interactionOrMessage.reply(msgObj);
            } else {
                // إزالة ephemeral للرسائل العادية لتجنب الأخطاء
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
            return replyFunc({ content: "⛔️ **أنا لا أملك صلاحية `Manage Channels` لفتح القناة! يرجى التحقق من رتبتي.**", ephemeral: true });
        }

        try {
            // null تعني إرجاع صلاحية القناة للوضع الافتراضي (وهذا هو الصحيح للفتح)
            await targetChannel.permissionOverwrites.edit(interactionOrMessage.guild.roles.everyone, {
                SendMessages: null,
                SendMessagesInThreads: null
            });

            await replyFunc({ content: `✅ **تـم فـتـح ${targetChannel}** <:0Pray:1437067281493524502>` });

        } catch (error) {
            console.error("[Unlock Command Error]:", error);
            await replyFunc({ content: "❌ **حدث خطأ أثناء محاولة فتح القناة. تأكد أن رتبتي أعلى من إعدادات القناة.**", ephemeral: true });
        }
    }
};
