const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, AttachmentBuilder, MessageFlags } = require('discord.js');

// 🔥 آيدي الإمبراطور الوحيد المسموح له باستخدام الأمر 🔥
const EMPEROR_ID = "1145327691772481577";

module.exports = {
    data: new SlashCommandBuilder()
        .setName('قول')
        .setDescription('أداة الإمبراطور الخاصة للتحدث عبر البوت (مخفية)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) // إخفاء مبدئي
        .addStringOption(opt => opt.setName('text').setDescription('النص الذي تريد من البوت قوله').setRequired(false))
        .addChannelOption(opt => opt.setName('channel').setDescription('القناة الهدف (اختياري)').setRequired(false))
        .addStringOption(opt => opt.setName('copy_url').setDescription('رابط أو آيدي رسالة لنسخها بالكامل (نص، إمبد، صور)').setRequired(false))
        .addStringOption(opt => opt.setName('reply_to').setDescription('آيدي الرسالة التي تريد من البوت الرد عليها').setRequired(false))
        .addStringOption(opt => opt.setName('json_embed').setDescription('كود JSON لإرسال إمبد مخصص').setRequired(false))
        .addAttachmentOption(opt => opt.setName('file').setDescription('إرفاق ملف أو صورة').setRequired(false)),

    name: 'قول',
    aliases: ['say', 'تحدث', 'انطق', 'echo'],
    category: 'Owner',

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        const client = interactionOrMessage.client;
        
        // 🛡️ حماية فولاذية: التحقق من أن المستخدم هو الإمبراطور فقط 🛡️
        const user = isSlash ? interactionOrMessage.user : interactionOrMessage.author;
        if (user.id !== EMPEROR_ID) {
            if (isSlash) return interactionOrMessage.reply({ content: "❌ هذا الأمر محرم على الرعية، مخصص للإمبراطور فقط.", flags: [MessageFlags.Ephemeral] });
            return; // تجاهل صامت في حال كان أمراً نصياً
        }

        // وضع الشبح للأمر النصي (حذف رسالة الإمبراطور فوراً)
        if (!isSlash && interactionOrMessage.deletable) {
            interactionOrMessage.delete().catch(() => {});
        }

        if (isSlash) await interactionOrMessage.deferReply({ flags: [MessageFlags.Ephemeral] }).catch(()=>{});

        try {
            let targetChannel = isSlash ? interactionOrMessage.options.getChannel('channel') : interactionOrMessage.channel;
            let textContent = isSlash ? interactionOrMessage.options.getString('text') : null;
            let copySource = isSlash ? interactionOrMessage.options.getString('copy_url') : null;
            let replyToId = isSlash ? interactionOrMessage.options.getString('reply_to') : null;
            let jsonEmbed = isSlash ? interactionOrMessage.options.getString('json_embed') : null;
            let attachmentOpt = isSlash ? interactionOrMessage.options.getAttachment('file') : null;

            // --- معالجة الأمر النصي (!قول) ---
            if (!isSlash) {
                if (!args || args.length === 0) return;
                
                // التحقق إذا كان أول معامل هو منشن لقناة
                const channelMention = interactionOrMessage.mentions.channels.first();
                if (channelMention && args[0].includes(channelMention.id)) {
                    targetChannel = channelMention;
                    args.shift(); // إزالة منشن القناة من النص
                }

                // التحقق إذا كان النص يحتوي على رابط رسالة ديسكورد للنسخ
                const linkMatch = args.find(a => a.includes('discord.com/channels/'));
                if (linkMatch) {
                    copySource = linkMatch;
                    args = args.filter(a => a !== linkMatch);
                }

                textContent = args.length > 0 ? args.join(' ') : null;
            }

            if (!targetChannel) targetChannel = interactionOrMessage.channel;

            let payload = {
                content: textContent || undefined,
                embeds: [],
                files: []
            };

            // 1. إضافة المرفقات إن وجدت
            if (attachmentOpt) {
                payload.files.push(attachmentOpt.url);
            } else if (!isSlash && interactionOrMessage.attachments.size > 0) {
                interactionOrMessage.attachments.forEach(att => payload.files.push(att.url));
            }

            // 2. نظام النسخ الاستنساخي (Clone System) عبر الرابط أو الآيدي
            if (copySource) {
                let msgToCopy = null;
                const urlMatch = copySource.match(/channels\/(\d+)\/(\d+)\/(\d+)/);
                
                if (urlMatch) {
                    // إذا كان رابط رسالة
                    const sourceGuildId = urlMatch[1];
                    const sourceChannelId = urlMatch[2];
                    const sourceMessageId = urlMatch[3];
                    
                    try {
                        const sourceGuild = client.guilds.cache.get(sourceGuildId);
                        const sourceChannel = sourceGuild?.channels.cache.get(sourceChannelId) || await client.channels.fetch(sourceChannelId).catch(()=>null);
                        if (sourceChannel) {
                            msgToCopy = await sourceChannel.messages.fetch(sourceMessageId).catch(()=>null);
                        }
                    } catch (e) {}
                } else {
                    // إذا كان آيدي رسالة فقط، نبحث في نفس القناة
                    try {
                        msgToCopy = await targetChannel.messages.fetch(copySource).catch(()=>null);
                    } catch (e) {}
                }

                if (msgToCopy) {
                    if (msgToCopy.content && !textContent) payload.content = msgToCopy.content;
                    if (msgToCopy.embeds && msgToCopy.embeds.length > 0) payload.embeds = msgToCopy.embeds.map(e => EmbedBuilder.from(e));
                    if (msgToCopy.attachments && msgToCopy.attachments.size > 0) {
                        msgToCopy.attachments.forEach(att => payload.files.push(att.url));
                    }
                } else {
                    if (isSlash) return interactionOrMessage.editReply("❌ لم أتمكن من العثور على الرسالة المراد نسخها. تأكد من الرابط أو الآيدي.");
                }
            }

            // 3. نظام صانع الإمبد (JSON Embed)
            if (jsonEmbed) {
                try {
                    const parsedData = JSON.parse(jsonEmbed);
                    const customEmbed = new EmbedBuilder(parsedData);
                    payload.embeds.push(customEmbed);
                } catch (e) {
                    if (isSlash) return interactionOrMessage.editReply("❌ خطأ في كود الـ JSON للإمبد.");
                }
            }

            // 4. نظام الرد (Reply)
            if (replyToId) {
                payload.reply = { messageReference: replyToId, failIfNotExists: false };
            }

            // التحقق النهائي قبل الإرسال
            if (!payload.content && payload.embeds.length === 0 && payload.files.length === 0) {
                if (isSlash) return interactionOrMessage.editReply("❌ لا يوجد شيء لأرسله! يرجى توفير نص، رابط للنسخ، أو مرفق.");
                return;
            }

            // الإرسال الفعلي
            const sentMsg = await targetChannel.send(payload);

            // تأكيد العملية للإمبراطور بصمت
            if (isSlash) {
                await interactionOrMessage.editReply({ content: `✅ تم تنفيذ الأمر بنجاح في قناة <#${targetChannel.id}>.\n[رابط الرسالة](${sentMsg.url})` });
            }

        } catch (error) {
            console.error("[Say Command Error]", error);
            if (isSlash) await interactionOrMessage.editReply("❌ حدث خطأ غير متوقع أثناء محاولة الإرسال.").catch(()=>{});
        }
    }
};
