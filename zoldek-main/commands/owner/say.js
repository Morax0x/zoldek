const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, AttachmentBuilder, MessageFlags } = require('discord.js');

const EMPEROR_ID = "1145327691772481577";

module.exports = {
    data: new SlashCommandBuilder()
        .setName('قول')
        .setDescription('خـاص بالامبراطـور')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(opt => opt.setName('text').setDescription('النص أو الرابط (تينور/فيديو) الذي تريد إرساله').setRequired(false))
        .addChannelOption(opt => opt.setName('channel').setDescription('القناة الهدف (اختياري)').setRequired(false))
        .addStringOption(opt => opt.setName('copy_url').setDescription('رابط أو آيدي رسالة لنسخها بالكامل (نص، إمبد، صور)').setRequired(false))
        .addStringOption(opt => opt.setName('reply_to').setDescription('رابط الرسالة (أو الآيدي) التي تريد من البوت الرد عليها').setRequired(false))
        .addStringOption(opt => opt.setName('json_embed').setDescription('كود JSON لإرسال إمبد مخصص').setRequired(false))
        .addAttachmentOption(opt => opt.setName('file').setDescription('إرفاق ملف أو صورة').setRequired(false)),

    name: 'قول',
    aliases: ['say', 'تحدث', 'انطق', 'echo'],
    category: 'Owner',

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        const client = interactionOrMessage.client;
        
        const user = isSlash ? interactionOrMessage.user : interactionOrMessage.author;
        if (user.id !== EMPEROR_ID) {
            if (isSlash) return interactionOrMessage.reply({ content: "❌ هذا الأمر محرم على الرعية، مخصص للإمبراطور فقط.", flags: [MessageFlags.Ephemeral] });
            return;
        }

        if (!isSlash && interactionOrMessage.deletable) {
            interactionOrMessage.delete().catch(() => {});
        }

        if (isSlash) await interactionOrMessage.deferReply({ flags: [MessageFlags.Ephemeral] }).catch(()=>{});

        try {
            let targetChannel = isSlash ? interactionOrMessage.options.getChannel('channel') : interactionOrMessage.channel;
            let textContent = isSlash ? interactionOrMessage.options.getString('text') : null;
            let copySource = isSlash ? interactionOrMessage.options.getString('copy_url') : null;
            let replyToInput = isSlash ? interactionOrMessage.options.getString('reply_to') : null;
            let jsonEmbed = isSlash ? interactionOrMessage.options.getString('json_embed') : null;
            let attachmentOpt = isSlash ? interactionOrMessage.options.getAttachment('file') : null;
            let replyToId = null;

            if (!isSlash) {
                if (!args || args.length === 0) return;
                
                const channelMention = interactionOrMessage.mentions.channels.first();
                if (channelMention && args[0].includes(channelMention.id)) {
                    targetChannel = channelMention;
                    args.shift();
                }

                const linkMatch = args.find(a => a.includes('discord.com/channels/'));
                if (linkMatch) {
                    copySource = linkMatch;
                    args = args.filter(a => a !== linkMatch);
                }

                textContent = args.length > 0 ? args.join(' ') : null;
            }

            // 🧠 التوجيه الذكي للردود عبر الرابط (Smart Reply Routing)
            if (replyToInput) {
                const urlMatch = replyToInput.match(/channels\/(\d+)\/(\d+)\/(\d+)/);
                if (urlMatch) {
                    const sourceChannelId = urlMatch[2];
                    replyToId = urlMatch[3]; // الآيدي الصافي للرسالة
                    
                    try {
                        // إجبار البوت على التوجه لقناة الرسالة المطلوبة للرد عليها
                        const foundChannel = await client.channels.fetch(sourceChannelId).catch(() => null);
                        if (foundChannel) targetChannel = foundChannel; 
                    } catch (e) {}
                } else {
                    replyToId = replyToInput; // إذا كان المكتوب آيدي فقط
                }
            }

            if (!targetChannel) targetChannel = interactionOrMessage.channel;

            let payload = {
                content: textContent || undefined,
                embeds: [],
                files: []
            };

            if (attachmentOpt) {
                payload.files.push(attachmentOpt.url);
            } else if (!isSlash && interactionOrMessage.attachments.size > 0) {
                interactionOrMessage.attachments.forEach(att => payload.files.push(att.url));
            }

            if (textContent) {
                const urlRegex = /(https?:\/\/[^\s]+)/g;
                const urls = textContent.match(urlRegex);
                
                if (urls) {
                    for (const url of urls) {
                        let mediaUrl = null;
                        const isTenor = url.includes('tenor.com/view/');

                        if (isTenor) {
                            try {
                                const response = await fetch(url);
                                const html = await response.text();
                                const match = html.match(/<meta property="og:image" content="([^"]+)"/i);
                                if (match) mediaUrl = match[1];
                            } catch (err) {}
                        } else if (url.match(/\.(gif|png|jpg|jpeg|webp|mp4|mov|webm)(\?.*)?$/i)) {
                            mediaUrl = url;
                        }

                        if (mediaUrl) {
                            const extMatch = mediaUrl.match(/\.(gif|png|jpg|jpeg|webp|mp4|mov|webm)/i);
                            const ext = extMatch ? extMatch[1] : (isTenor ? 'gif' : 'png');
                            
                            payload.files.push(new AttachmentBuilder(mediaUrl, { name: `emperor_media.${ext}` }));
                            
                            textContent = textContent.replace(url, '').trim();
                        }
                    }
                    payload.content = textContent === '' ? undefined : textContent;
                }
            }

            if (copySource) {
                let msgToCopy = null;
                const urlMatch = copySource.match(/channels\/(\d+)\/(\d+)\/(\d+)/);
                
                if (urlMatch) {
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
                    try {
                        msgToCopy = await targetChannel.messages.fetch(copySource).catch(()=>null);
                    } catch (e) {}
                }

                if (msgToCopy) {
                    if (msgToCopy.content && !payload.content) payload.content = msgToCopy.content;
                    if (msgToCopy.embeds && msgToCopy.embeds.length > 0) payload.embeds = msgToCopy.embeds.map(e => EmbedBuilder.from(e));
                    if (msgToCopy.attachments && msgToCopy.attachments.size > 0) {
                        msgToCopy.attachments.forEach(att => payload.files.push(att.url));
                    }
                } else {
                    if (isSlash) return interactionOrMessage.editReply("❌ لم أتمكن من العثور على الرسالة المراد نسخها. تأكد من الرابط أو الآيدي.");
                }
            }

            if (jsonEmbed) {
                try {
                    const parsedData = JSON.parse(jsonEmbed);
                    const customEmbed = new EmbedBuilder(parsedData);
                    payload.embeds.push(customEmbed);
                } catch (e) {
                    if (isSlash) return interactionOrMessage.editReply("❌ خطأ في كود الـ JSON للإمبد.");
                }
            }

            if (replyToId) {
                payload.reply = { messageReference: replyToId, failIfNotExists: false };
            }

            if (!payload.content && payload.embeds.length === 0 && payload.files.length === 0) {
                if (isSlash) return interactionOrMessage.editReply("❌ لا يوجد شيء لأرسله! يرجى توفير نص، رابط للنسخ، أو مرفق.");
                return;
            }

            const sentMsg = await targetChannel.send(payload);

            if (isSlash) {
                await interactionOrMessage.editReply({ content: `✅ تم تنفيذ الأمر بنجاح في قناة <#${targetChannel.id}>.\n[رابط الرسالة](${sentMsg.url})` });
            }

        } catch (error) {
            if (isSlash) await interactionOrMessage.editReply("❌ حدث خطأ غير متوقع أثناء محاولة الإرسال.").catch(()=>{});
        }
    }
};
