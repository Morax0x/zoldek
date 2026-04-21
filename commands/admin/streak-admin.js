const { PermissionsBitField, SlashCommandBuilder, EmbedBuilder, Colors, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require("discord.js");
const { updateNickname } = require("../../streak-handler.js"); 

// دالة المعالجة الآمنة للبيانات
const safeQuery = async (db, qPg, params) => {
    let res;
    try { 
        res = await db.query(qPg, params); 
    } catch(e) { 
        res = { rows: [] }; 
    }

    const rows1 = Array.isArray(res) ? res : (res?.rows || []);
    if (rows1.length > 0) return { rows: rows1 };

    let fallbackQuery = qPg
        .replace(/"userID"/g, "userid")
        .replace(/"guildID"/g, "guildid")
        .replace(/"channelID"/g, "channelid")
        .replace(/"streakCount"/g, "streakcount")
        .replace(/"lastMessageTimestamp"/g, "lastmessagetimestamp")
        .replace(/"hasGracePeriod"/g, "hasgraceperiod")
        .replace(/"hasItemShield"/g, "hasitemshield")
        .replace(/"streakEmoji"/g, "streakemoji")
        .replace(/"id"/g, "id");
    
    if (fallbackQuery !== qPg) {
        try { 
            let res2 = await db.query(fallbackQuery, params); 
            const rows2 = Array.isArray(res2) ? res2 : (res2?.rows || []);
            return { rows: rows2 };
        } catch(e2) { }
    }
    
    return { rows: [] };
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('streak-admin')
        .setDescription('إدارة نظام الستريك (الرومات، الإيموجي، تحديد الستريك يدوياً)')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addSubcommand(sub => sub
            .setName('set')
            .setDescription('يفتح نافذة لتحديد ستريك (عادي أو ميديا) لعضو معين يدوياً.')
            .addUserOption(option => option.setName('user').setDescription('المستخدم الذي تريد تعديل الستريك له').setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName('emoji')
            .setDescription('يغير الإيموجي المستخدم في ستريك اللقب.')
            .addStringOption(option => option.setName('emoji').setDescription('الإيموجي الجديد').setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName('panel')
            .setDescription('ينشر لوحة التحكم بالستريك (للأعضاء).')
        )
        .addSubcommandGroup(group => group
            .setName('media')
            .setDescription('إدارة رومات ستريك الميديا')
            .addSubcommand(sub => sub.setName('add').setDescription('إضافة قناة إلى رومات ستريك الميديا')
                .addChannelOption(opt => opt.setName('channel').setDescription('القناة').setRequired(true).addChannelTypes(ChannelType.GuildText)))
            .addSubcommand(sub => sub.setName('remove').setDescription('إزالة قناة من رومات ستريك الميديا')
                .addChannelOption(opt => opt.setName('channel').setDescription('القناة').setRequired(true).addChannelTypes(ChannelType.GuildText)))
            .addSubcommand(sub => sub.setName('list').setDescription('عرض جميع رومات ستريك الميديا المسجلة'))
        ),

    name: 'streak-admin',
    aliases: ['تحديد-الستريك', 'setstreak', 'set-streak-emoji', 'تغيير-ايموجي-الستريك', 'setup-streak-panel', 'نشر-لوحة-الستريك', 'set-media-streak', 'ستريك-ميديا', 'روم-الميديا'],
    category: "Admin",
    description: "إدارة شاملة لنظام الستريك.",

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        const client = interactionOrMessage.client;
        const db = client.sql;
        const guild = interactionOrMessage.guild;

        const member = isSlash ? interactionOrMessage.member : interactionOrMessage.member;
        
        if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild) && !member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            const err = '❌ | ليس لديك صلاحية الإدارة!';
            return isSlash ? interactionOrMessage.reply({ content: err, flags: [MessageFlags.Ephemeral] }) : interactionOrMessage.reply(err);
        }

        try {
            await safeQuery(db, `CREATE TABLE IF NOT EXISTS streaks ("id" TEXT PRIMARY KEY, "guildID" TEXT, "userID" TEXT, "streakCount" BIGINT, "lastMessageTimestamp" BIGINT, "hasGracePeriod" BIGINT, "hasItemShield" BIGINT)`);
            await safeQuery(db, `CREATE TABLE IF NOT EXISTS media_streaks ("id" TEXT PRIMARY KEY, "guildID" TEXT, "userID" TEXT, "streakCount" BIGINT, "lastMessageTimestamp" BIGINT, "hasGracePeriod" BIGINT, "hasItemShield" BIGINT)`);
            await safeQuery(db, `CREATE TABLE IF NOT EXISTS media_streak_channels ("guildID" TEXT, "channelID" TEXT, PRIMARY KEY ("guildID", "channelID"))`);
            await safeQuery(db, `CREATE TABLE IF NOT EXISTS settings ("guild" TEXT PRIMARY KEY, "streakEmoji" TEXT)`);
            await safeQuery(db, `INSERT INTO settings ("guild") VALUES ($1) ON CONFLICT ("guild") DO NOTHING`, [guild.id]);
        } catch(e) {
            console.error("Streak Admin Setup DB Error:", e);
        }

        let route = '';
        let targetUser = null;
        let emojiStr = '';
        let targetChannel = null;

        if (isSlash) {
            const group = interactionOrMessage.options.getSubcommandGroup();
            const sub = interactionOrMessage.options.getSubcommand();
            route = group ? `${group}_${sub}` : sub;
            
            if (route !== 'set' && route !== 'panel') {
                await interactionOrMessage.deferReply({ flags: [MessageFlags.Ephemeral] });
            }
        } else {
            const cmd = interactionOrMessage.content.split(' ')[0].toLowerCase().slice(1);
            if (cmd === 'setstreak' || cmd === 'تحديد-الستريك') {
                route = 'set';
                targetUser = interactionOrMessage.mentions.members.first() || guild.members.cache.get(args[0]);
            } else if (cmd === 'set-streak-emoji' || cmd === 'تغيير-ايموجي-الستريك' || cmd === 'setstreakemoji') {
                route = 'emoji';
                emojiStr = args[0];
            } else if (cmd === 'setup-streak-panel' || cmd === 'نشر-لوحة-الستريك' || cmd === 'stp') {
                route = 'panel';
            } else if (cmd === 'set-media-streak' || cmd === 'ستريك-ميديا' || cmd === 'روم-الميديا') {
                const action = args[0] ? args[0].toLowerCase() : 'list';
                if (action === 'add' || action === 'اضافة') route = 'media_add';
                else if (action === 'remove' || action === 'حذف') route = 'media_remove';
                else route = 'media_list';
                targetChannel = interactionOrMessage.mentions.channels.first() || guild.channels.cache.get(args[1]);
            }
        }

        const reply = async (payload) => {
            if (typeof payload === 'string') payload = { content: payload };
            if (isSlash && (route !== 'set' && route !== 'panel')) return interactionOrMessage.editReply(payload);
            return interactionOrMessage.reply(payload);
        };

        try {
            if (route === 'set') {
                if (isSlash) {
                    targetUser = interactionOrMessage.options.getUser('user');
                } else {
                    targetUser = interactionOrMessage.mentions.users.first();
                    if (!targetUser && args[0]) {
                        try { targetUser = await client.users.fetch(args[0].replace(/[<@!>]/g, '')); } catch(e){}
                    }
                }
                
                if (!targetUser) {
                    return isSlash ? interactionOrMessage.reply({ content: "❌ | يرجى تحديد العضو المطلوب.", flags: [MessageFlags.Ephemeral] }) : interactionOrMessage.reply("❌ | يرجى تحديد العضو المطلوب.");
                }

                const modalId = `str_set_${Date.now()}`;
                const modal = new ModalBuilder().setCustomId(modalId).setTitle(`تعديل ستريك ${targetUser.username}`);
                
                const typeInput = new TextInputBuilder()
                    .setCustomId('streak_type')
                    .setLabel('النوع (اكتب: عادي أو ميديا)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('عادي / ميديا')
                    .setRequired(true);
                    
                const amountInput = new TextInputBuilder()
                    .setCustomId('streak_amount')
                    .setLabel('العدد الجديد (أرقام فقط)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('مثال: 50')
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(typeInput), new ActionRowBuilder().addComponents(amountInput));
                
                if (isSlash) {
                    await interactionOrMessage.showModal(modal);
                } else {
                    const msg = await interactionOrMessage.reply("اكتب الآن `عادي <الرقم>` لتعديل ستريك الشات، أو `ميديا <الرقم>` لتعديل الميديا. (مثال: `ميديا 50`):");
                    const filter = m => m.author.id === interactionOrMessage.author.id;
                    try {
                        const collected = await interactionOrMessage.channel.awaitMessages({ filter, max: 1, time: 60000, errors: ['time'] });
                        const content = collected.first().content;
                        const [type, amountStr] = content.split(' ');
                        const amount = parseInt(amountStr);
                        
                        if (isNaN(amount) || amount < 0) return msg.edit("❌ عدد غير صالح.");
                        
                        // الفحص الذكي للكلمة
                        const isMedia = type.includes('ميديا') || type.includes('صورة') || type.includes('فيديو') || type.includes('media');
                        const tableName = isMedia ? 'media_streaks' : 'streaks';
                        const streakId = `${guild.id}-${targetUser.id}`;
                        
                        await safeQuery(db, `
                            INSERT INTO ${tableName} ("id", "guildID", "userID", "streakCount", "lastMessageTimestamp", "hasGracePeriod", "hasItemShield") 
                            VALUES ($1, $2, $3, $4, $5, 1, 0)
                            ON CONFLICT("id") DO UPDATE SET 
                            "streakCount" = EXCLUDED."streakCount",
                            "lastMessageTimestamp" = EXCLUDED."lastMessageTimestamp"
                        `, [streakId, guild.id, targetUser.id, amount, Date.now()]);

                        if (!isMedia) {
                            const memberTarget = await guild.members.fetch(targetUser.id).catch(()=>null);
                            if(memberTarget) await updateNickname(memberTarget, db).catch(()=>{});
                        }

                        return msg.edit(`✅ | تم تحديد ستريك (${isMedia ? 'الميديا 📸' : 'العادي 💬'}) لـ ${targetUser.username} ليصبح **${amount}🔥**.`);
                    } catch (e) {
                        return msg.edit("⏳ انتهى الوقت. تم إلغاء التعديل.");
                    }
                }

                if (isSlash) {
                    try {
                        const submitted = await interactionOrMessage.awaitModalSubmit({ filter: sub => sub.customId === modalId && sub.user.id === interactionOrMessage.user.id, time: 120000 });
                        await submitted.deferReply({ flags: [MessageFlags.Ephemeral] });

                        const typeStr = submitted.fields.getTextInputValue('streak_type').toLowerCase();
                        const amount = parseInt(submitted.fields.getTextInputValue('streak_amount'));

                        if (isNaN(amount) || amount < 0) return submitted.editReply("❌ يرجى إدخال عدد صحيح.");

                        // الفحص الذكي للكلمة
                        const isMedia = typeStr.includes('ميديا') || typeStr.includes('صور') || typeStr.includes('فيديو') || typeStr.includes('media');
                        const tableName = isMedia ? 'media_streaks' : 'streaks';
                        const streakId = `${guild.id}-${targetUser.id}`;

                        await safeQuery(db, `
                            INSERT INTO ${tableName} ("id", "guildID", "userID", "streakCount", "lastMessageTimestamp", "hasGracePeriod", "hasItemShield") 
                            VALUES ($1, $2, $3, $4, $5, 1, 0)
                            ON CONFLICT("id") DO UPDATE SET 
                            "streakCount" = EXCLUDED."streakCount",
                            "lastMessageTimestamp" = EXCLUDED."lastMessageTimestamp"
                        `, [streakId, guild.id, targetUser.id, amount, Date.now()]);

                        if (!isMedia) {
                            const memberTarget = await guild.members.fetch(targetUser.id).catch(()=>null);
                            if(memberTarget) await updateNickname(memberTarget, db).catch(()=>{});
                        }

                        await submitted.editReply(`✅ | تم تحديد ستريك (${isMedia ? 'الميديا 📸' : 'العادي 💬'}) لـ ${targetUser.username} ليصبح **${amount}🔥**.`);
                    } catch (e) {}
                }
                return;
            }

            if (route === 'emoji') {
                if (isSlash) emojiStr = interactionOrMessage.options.getString('emoji');
                
                if (!emojiStr) return reply("الاستخدام: يرجى إدخال الإيموجي الجديد.");

                await safeQuery(db, `UPDATE settings SET "streakEmoji" = $1 WHERE "guild" = $2`, [emojiStr, guild.id]);
                return reply(`✅ | تم تغيير إيموجي الستريك بنجاح إلى ${emojiStr}.`);
            }

            if (route === 'panel') {
                const channel = interactionOrMessage.channel;
                if (channel.type !== ChannelType.GuildText) return reply('❌ يجب أن تكون القناة نصية.');

                const description = [
                    "- استعمل اللوحـة للتحـكم بالستريك ومـزايـاه <a:streak:1437152181018034206>",
                    "",
                    "- يمـكنك اظـهار واخفـاء الستريك او تغيير مظهره وحتى ايقاف اشعـاراتـه"
                ].join('\n');

                const embed = new EmbedBuilder()
                    .setColor(0xFF0000) 
                    .setTitle('✶ لـوحـة السـتريـك')
                    .setDescription(description)
                    .setImage('https://i.postimg.cc/NfLYXwD5/123.jpg');

                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId(`streak_panel_menu`)
                    .setPlaceholder('- افتح القـائمـة للتحـكم بالستريك')
                    .addOptions(
                        new StringSelectMenuOptionBuilder()
                            .setLabel('اخـفـاء / اظـهـار')
                            .setDescription('يخفي او يظهر الستريك في اسمك')
                            .setValue('streak_panel_toggle')
                            .setEmoji('1435572391190204447'),
                        new StringSelectMenuOptionBuilder()
                            .setLabel('تغـييـر')
                            .setDescription('يغير ايقونـة الفـاصلـة')
                            .setValue('streak_panel_change_sep')
                            .setEmoji('1436297148894412862'),
                        new StringSelectMenuOptionBuilder()
                            .setLabel('تـوب')
                            .setDescription('يظهـر اعـلى مستعملي الستريك')
                            .setValue('streak_panel_top')
                            .setEmoji('1435572459276337245'),
                        new StringSelectMenuOptionBuilder()
                            .setLabel('اشـعـارات')
                            .setDescription('ايـقـاف او تشغيل تلقي اشعارات الستريك بالخاص')
                            .setValue('streak_panel_notifications')
                            .setEmoji('🔔')
                    );

                const row = new ActionRowBuilder().addComponents(selectMenu);

                await channel.send({ embeds: [embed], components: [row] });

                if (isSlash) return interactionOrMessage.reply({ content: '✅ تم نشر لوحة الستريك.', flags: [MessageFlags.Ephemeral] });
                else return interactionOrMessage.delete().catch(() => {});
            }

            if (route === 'media_add') {
                if (isSlash) targetChannel = interactionOrMessage.options.getChannel('channel');
                if (!targetChannel) return reply({ content: `❌ يجب تحديد القناة.` });

                await safeQuery(db, `INSERT INTO media_streak_channels ("guildID", "channelID") VALUES ($1, $2) ON CONFLICT ("guildID", "channelID") DO NOTHING`, [guild.id, targetChannel.id]);
                return reply({ embeds: [new EmbedBuilder().setColor(Colors.Green).setDescription(`✅ تم إضافة روم ${targetChannel} إلى رومات ستريك الميديا.`)] });
            }

            if (route === 'media_remove') {
                if (isSlash) targetChannel = interactionOrMessage.options.getChannel('channel');
                if (!targetChannel) return reply({ content: `❌ يجب تحديد القناة.` });

                const res = await safeQuery(db, `DELETE FROM media_streak_channels WHERE "guildID" = $1 AND "channelID" = $2`, [guild.id, targetChannel.id]);
                if (res.rows.length > 0 || !res.error) return reply({ embeds: [new EmbedBuilder().setColor(Colors.Green).setDescription(`✅ تم إزالة روم ${targetChannel} من رومات ستريك الميديا.`)] });
                return reply({ embeds: [new EmbedBuilder().setColor(Colors.Red).setDescription(`❌ روم ${targetChannel} غير موجود في القائمة أصلاً.`)] });
            }

            if (route === 'media_list') {
                const res = await safeQuery(db, `SELECT * FROM media_streak_channels WHERE "guildID" = $1`, [guild.id]);
                const channels = res.rows;

                if (channels.length === 0) return reply({ embeds: [new EmbedBuilder().setColor(Colors.Yellow).setDescription("ℹ️ لا توجد أي رومات مخصصة لستريك الميديا حالياً.")] });
                
                const channelList = channels.map(c => `<#${c.channelID || c.channelid}>`).join('\n');
                return reply({ embeds: [new EmbedBuilder().setColor(Colors.Green).setTitle('📸 رومات ستريك الميديا المسجلة').setDescription(channelList)] });
            }

        } catch (err) {
            console.error("Streak Admin Error:", err);
            return reply("❌ | حدث خطأ أثناء التنفيذ.");
        }
    }
};
