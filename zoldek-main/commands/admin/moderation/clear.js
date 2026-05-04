const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');

module.exports = {
    // --- إعدادات Slash Command ---
    data: new SlashCommandBuilder()
        .setName('clear')
        .setDescription('🧹 أدوات تنظيف ومسح الرسائل المتطورة.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages)
        .addSubcommand(sub => 
            sub.setName('amount')
                .setDescription('مسح عدد معين من الرسائل (الافتراضي 100).')
                .addIntegerOption(opt => opt.setName('count').setDescription('العدد').setMinValue(1).setMaxValue(100))
        )
        .addSubcommand(sub => 
            sub.setName('user')
                .setDescription('مسح رسائل عضو معين في هذه القناة.')
                .addUserOption(opt => opt.setName('target').setDescription('العضو').setRequired(true))
                .addIntegerOption(opt => opt.setName('count').setDescription('العدد (الافتراضي 30)').setMinValue(1).setMaxValue(100))
        )
        .addSubcommand(sub => 
            sub.setName('global')
                .setDescription('⚠ مسح رسائل عضو من كل القنوات (مسح شامل).')
                .addUserOption(opt => opt.setName('target').setDescription('العضو').setRequired(true))
                .addIntegerOption(opt => opt.setName('count').setDescription('العدد لكل قناة (الافتراضي 30)').setMinValue(1).setMaxValue(50))
        ),

    // --- إعدادات Prefix Command ---
    name: 'clear',
    aliases: ['مسح', 'تنظيف', 'د'], 
    description: "نظام مسح الرسائل",
    category: "Moderation",

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let subcommand, amount, targetUser;

        // 🛡️ دالة الرد الآمنة (تعالج مشكلة الـ Ephemeral في الرسائل العادية)
        const replyFunc = async (payload) => {
            if (isSlash) {
                if (interactionOrMessage.deferred || interactionOrMessage.replied) return interactionOrMessage.editReply(payload);
                return interactionOrMessage.reply(payload);
            } else {
                const safePayload = { ...payload };
                delete safePayload.ephemeral; // منع الخطأ في رسائل البريفكس
                
                try { await interactionOrMessage.delete().catch(() => {}); } catch(e) {}
                const msg = await interactionOrMessage.channel.send(safePayload).catch(() => null);
                if (msg) setTimeout(() => msg.delete().catch(() => {}), 5000);
                return msg;
            }
        };

        // 1. التحقق من صلاحيات العضو
        const member = interactionOrMessage.member;
        if (!member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
            return replyFunc({ content: "⛔ **ليس لديك صلاحية `Manage Messages`!**", ephemeral: true });
        }

        // 2. 🔥 التحقق من صلاحيات البوت (لحماية البوت من الانهيار)
        if (!interactionOrMessage.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
            return replyFunc({ content: "❌ **أنا لا أملك صلاحية `Manage Messages` لمسح الرسائل!**", ephemeral: true });
        }

        // 3. معالجة المدخلات (Slash vs Prefix)
        if (isSlash) {
            await interactionOrMessage.deferReply({ ephemeral: true });
            subcommand = interactionOrMessage.options.getSubcommand();
            targetUser = interactionOrMessage.options.getUser('target');
            amount = interactionOrMessage.options.getInteger('count') || (subcommand === 'amount' ? 100 : 30);
        } else {
            const firstArg = args[0] ? args[0].toLowerCase() : null;
            const secondArg = args[1];
            const thirdArg = args[2];
            const mention = interactionOrMessage.mentions.users.first();

            if (!firstArg) {
                subcommand = 'amount';
                amount = 100;
            } else if (!isNaN(firstArg)) {
                subcommand = 'amount';
                amount = parseInt(firstArg);
            } else if (mention && args[0].includes(mention.id)) {
                subcommand = 'user';
                targetUser = mention;
                amount = !isNaN(secondArg) ? parseInt(secondArg) : 30;
            } else if (['global', 'شامل', 'عام'].includes(firstArg)) {
                subcommand = 'global';
                targetUser = mention;
                
                // إذا لم يمنشن، يحاول سحب الآيدي
                if (!targetUser && secondArg) {
                    try { targetUser = await interactionOrMessage.client.users.fetch(secondArg.replace(/[<@!>]/g, '')); } catch(e) {}
                }

                if (!targetUser) return replyFunc({ content: "❌ **يرجى منشن العضو أو وضع الآيدي للمسح الشامل.**", ephemeral: true });
                amount = !isNaN(thirdArg) ? parseInt(thirdArg) : 30;
            } else {
                return replyFunc({ content: "❌ **صيغة الأمر غير صحيحة.**", ephemeral: true });
            }
        }

        // تأمين حدود الحذف
        if (amount > 100) amount = 100; 
        if (amount < 1) amount = 1;

        // ============================
        // 🔹 1. المسح العادي (الكل)
        // ============================
        if (subcommand === 'amount') {
            try {
                const deleted = await interactionOrMessage.channel.bulkDelete(amount, true);
                return replyFunc({ content: `🧹 **تم كنس ${deleted.size} رسالة بنجاح!**` });
            } catch (err) {
                console.error("[Clear Command Error]:", err);
                return replyFunc({ content: "❌ **حدث خطأ! تأكد أن الرسائل لم يمر عليها أكثر من 14 يومًا.**", ephemeral: true });
            }
        }

        // ============================
        // 🔹 2. مسح رسائل عضو (قناة)
        // ============================
        else if (subcommand === 'user') {
            const channel = interactionOrMessage.channel;
            
            try {
                const messages = await channel.messages.fetch({ limit: 100 });
                const userMessages = messages.filter(m => m.author.id === targetUser.id).first(amount);

                if (userMessages.length === 0) {
                    return replyFunc({ content: `⚠️ **لم يتم العثور على رسائل حديثة للعضو ${targetUser} في هذه القناة.**`, ephemeral: true });
                }

                // 🔥 إصلاح كراش الرسالة الواحدة
                if (userMessages.length === 1) {
                    await userMessages[0].delete();
                    return replyFunc({ content: `👤 **تم مسح رسالة واحدة للعضو ${targetUser}.**` });
                }

                await channel.bulkDelete(userMessages, true);
                return replyFunc({ content: `👤 **تم مسح ${userMessages.length} رسالة للعضو ${targetUser}.**` });
            } catch (err) {
                console.error("[Clear User Error]:", err);
                return replyFunc({ content: "❌ **خطأ أثناء الحذف (ربما الرسائل قديمة جداً).**", ephemeral: true });
            }
        }

        // ============================
        // 🔹 3. المسح الشامل (كل القنوات)
        // ============================
        else if (subcommand === 'global') {
            const guild = interactionOrMessage.guild;
            
            let progressMsg;
            if (isSlash) {
                await interactionOrMessage.editReply({ content: `🔄 **جاري المسح الشامل لرسائل ${targetUser}... يرجى الانتظار.**` });
            } else {
                progressMsg = await interactionOrMessage.channel.send(`🔄 **جاري المسح الشامل لرسائل ${targetUser}... يرجى الانتظار.**`);
            }

            let totalDeleted = 0;
            let channelsChecked = 0;
            const textChannels = guild.channels.cache.filter(c => c.isTextBased() && !c.isVoiceBased());

            for (const [id, channel] of textChannels) {
                // تخطي القنوات التي لا يملك البوت صلاحية فيها
                if (!channel.permissionsFor(guild.members.me).has(PermissionsBitField.Flags.ManageMessages)) continue;

                try {
                    const messages = await channel.messages.fetch({ limit: 50 }).catch(() => null);
                    if (!messages) continue;

                    const userMessages = messages.filter(m => m.author.id === targetUser.id).first(amount);
                    
                    if (userMessages.length > 0) {
                        // 🔥 إصلاح كراش الرسالة الواحدة في كل قناة
                        if (userMessages.length === 1) {
                            await userMessages[0].delete().catch(() => {});
                            totalDeleted += 1;
                        } else {
                            const deleted = await channel.bulkDelete(userMessages, true).catch(() => null);
                            if (deleted) totalDeleted += deleted.size;
                        }
                    }
                } catch (e) {}
                channelsChecked++;
            }

            const finalMsg = `🌍 **انتـهى المسح الشامل!**\nتم حذف **${totalDeleted}** رسالة للعضو ${targetUser} من **${channelsChecked}** قناة.`;
            
            if (isSlash) {
                return interactionOrMessage.editReply({ content: finalMsg });
            } else {
                if (progressMsg) {
                    progressMsg.edit(finalMsg).then(m => setTimeout(() => m.delete().catch(()=>null), 10000));
                } else {
                    interactionOrMessage.channel.send(finalMsg).then(m => setTimeout(() => m.delete().catch(()=>null), 10000));
                }
            }
        }
    }
};
