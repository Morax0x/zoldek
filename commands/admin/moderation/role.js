const { PermissionsBitField } = require('discord.js');

module.exports = {
    name: 'role',
    description: 'إعطاء أو إزالة رتبة من عضو',
    aliases: ['ر', 'رول', 'رتبة'], 
    category: 'Admin',
    usage: 'role <@user> <role name/id> أو بالرد على رسالته',

    async execute(message, args) {
        // 1. التحقق من صلاحيات العضو
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
            return message.reply('❌ **ليس لديك صلاحية التحكم بالرتب (Manage Roles).**');
        }

        // 2. التحقق من صلاحيات البوت
        if (!message.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
            return message.reply('❌ **لا أملك صلاحية التحكم بالرتب.**');
        }

        let targetMember;
        let roleQueryStartIndex = 1;

        // 3. جلب العضو المستهدف (عبر الرد على رسالة أو المنشن/الآيدي)
        if (message.reference && message.reference.messageId) {
            try {
                const repliedMsg = await message.channel.messages.fetch(message.reference.messageId);
                targetMember = await message.guild.members.fetch(repliedMsg.author.id);
                // إذا تم تحديد العضو بالرد، فإن الرتبة ستكون الكلمة الأولى في الـ args
                roleQueryStartIndex = 0; 
            } catch (err) {}
        }

        if (!targetMember) {
            const targetArg = args[0];
            if (!targetArg) return message.reply('❓ **منشن العضو، ضع الآيدي، أو رد على رسالته.**');

            // تنظيف الآيدي من أي أقواس منشن لتجنب الكراش
            const targetId = targetArg.replace(/[<@!>]/g, '');
            try {
                targetMember = await message.guild.members.fetch(targetId);
            } catch (err) {
                return message.reply('❌ **لم يتم العثور على العضو.**');
            }
        }

        // 4. جلب الرتبة (بحث ذكي)
        const roleQuery = args.slice(roleQueryStartIndex).join(" "); 
        if (!roleQuery) return message.reply('❓ **حدد الرتبة: بالاسم، المنشن، أو الآيدي.**');

        // تنظيف آيدي الرتبة في حال كان منشن
        const roleId = args[roleQueryStartIndex].replace(/[<@&>]/g, '');

        // البحث: منشن > آيدي > تطابق الاسم الدقيق > جزء من الاسم
        let role = message.mentions.roles.first() || 
                   message.guild.roles.cache.get(roleId) || 
                   message.guild.roles.cache.find(r => r.name.toLowerCase() === roleQuery.toLowerCase()) ||
                   message.guild.roles.cache.find(r => r.name.toLowerCase().includes(roleQuery.toLowerCase()));

        if (!role) {
            return message.reply('❌ **لم يتم العثور على الرتبة.**');
        }

        // 5. التحقق من الهرمية (Hierarchy) والخصائص
        if (role.managed) {
            return message.reply('❌ **لا يمكنك تعديل هذه الرتبة لأنها خاصة بنظام أو بوت (Managed).**');
        }

        // التأكد أن رتبة البوت أعلى من الرتبة المراد إعطاؤها
        if (role.position >= message.guild.members.me.roles.highest.position) {
            return message.reply('❌ **لا يمكنني التحكم بهذه الرتبة لأنها أعلى مني أو مساوية لي.**');
        }
        
        // التأكد أن رتبة المشرف أعلى من الرتبة المراد إعطاؤها (إلا إذا كان المالك)
        if (message.author.id !== message.guild.ownerId && role.position >= message.member.roles.highest.position) {
            return message.reply('❌ **لا يمكنك التحكم برتبة أعلى من رتبتك أو مساوية لها.**');
        }

        // 6. التنفيذ (إعطاء أو إزالة)
        try {
            if (targetMember.roles.cache.has(role.id)) {
                // العضو يملك الرتبة -> إزالة
                await targetMember.roles.remove(role);
                message.reply({ 
                    content: `✅ **تـم ازالـة الرتـبـة \`${role.name}\` من ${targetMember.user.username}**`, 
                    allowedMentions: { repliedUser: false } 
                });
            } else {
                // العضو لا يملك الرتبة -> منح
                await targetMember.roles.add(role);
                message.reply({ 
                    content: `✅ **تـم منـح رتـبـة \`${role.name}\` الى ${targetMember.user.username}**`, 
                    allowedMentions: { repliedUser: false } 
                });
            }
        } catch (error) {
            console.error("[Role Command Error]:", error);
            message.reply('❌ **حدث خطأ أثناء تعديل الرتب (تأكد من صلاحياتي وترتيب الرتب).**');
        }
    }
};
