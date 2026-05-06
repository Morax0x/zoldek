const { PermissionsBitField, ChannelType, SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('cmd-security')
        .setDescription('إدارة صلاحيات الأوامر والاختصارات في السيرفر.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
        
        .addSubcommandGroup(group => group.setName('perms').setDescription('إدارة صلاحيات الأوامر في القنوات')
            .addSubcommand(sub => sub.setName('allow').setDescription('يسمح بتشغيل أمر معين في قناة أو كاتاغوري معينة.')
                .addStringOption(option => option.setName('command').setDescription('اسم الأمر البرمجي').setRequired(true))
                .addChannelOption(option => option.setName('channel').setDescription('القناة أو الكاتاغوري').setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildCategory)))
            .addSubcommand(sub => sub.setName('deny').setDescription('يمنع تشغيل أمر معين في قناة أو كاتاغوري معينة.')
                .addStringOption(option => option.setName('command').setDescription('اسم الأمر البرمجي').setRequired(true))
                .addChannelOption(option => option.setName('channel').setDescription('القناة أو الكاتاغوري').setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildCategory)))
            .addSubcommand(sub => sub.setName('list').setDescription('يعرض قائمة بجميع الأوامر المسموحة وأماكنها.'))
        )
        
        .addSubcommandGroup(group => group.setName('shortcut').setDescription('إدارة اختصارات الأوامر (بدون بريفكس)')
            .addSubcommand(sub => sub.setName('add').setDescription('يضيف اختصارات لتشغيل أمر في قناة معينة.')
                .addChannelOption(option => option.setName('channel').setDescription('القناة').setRequired(true).addChannelTypes(ChannelType.GuildText))
                .addStringOption(option => option.setName('words').setDescription('الكلمات (مفصولة بمسافة)').setRequired(true))
                .addStringOption(option => option.setName('command').setDescription('اسم الأمر البرمجي').setRequired(true)))
            .addSubcommand(sub => sub.setName('remove').setDescription('يحذف اختصاراً من قناة معينة.')
                .addChannelOption(option => option.setName('channel').setDescription('القناة').setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildCategory))
                .addStringOption(option => option.setName('word').setDescription('الكلمة التي تريد حذفها').setRequired(true)))
            .addSubcommand(sub => sub.setName('list').setDescription('يعرض قائمة بجميع الاختصارات المفعلة.'))
        ),

    name: 'cmd-security',
    aliases: ['سماح-امر', 'allow-command', 'منع-امر', 'deny-command', 'صلاحيات-الاوامر', 'list-command-perms', 'اختصار', 'شورتكت', 'add-shortcut', 'حذف-اختصار', 'remove-shortcut', 'الاختصارات', 'list-shortcuts'],
    category: "Admin",
    description: 'إدارة صلاحيات الأوامر والاختصارات.',

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        const client = interactionOrMessage.client;
        const db = client.sql;
        const guild = interactionOrMessage.guild;

        const member = isSlash ? interactionOrMessage.member : interactionOrMessage.member;
        if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            const err = '❌ | أنت بحاجة إلى صلاحية `ManageGuild`.';
            return isSlash ? interactionOrMessage.reply({ content: err, ephemeral: true }) : interactionOrMessage.reply(err);
        }

        try {
            await db.query(`CREATE TABLE IF NOT EXISTS command_permissions ("guildID" TEXT, "channelID" TEXT, "commandName" TEXT, PRIMARY KEY ("guildID", "channelID", "commandName"))`);
            await db.query(`CREATE TABLE IF NOT EXISTS command_shortcuts ("guildID" TEXT, "channelID" TEXT, "shortcutWord" TEXT, "commandName" TEXT, PRIMARY KEY ("guildID", "channelID", "shortcutWord"))`);
        } catch(e) {}

        let route = '';
        let targetChannel = null;
        let commandName = '';
        let inputWordsString = '';

        if (isSlash) {
            const group = interactionOrMessage.options.getSubcommandGroup();
            const sub = interactionOrMessage.options.getSubcommand();
            route = `${group}_${sub}`;
            
            if (route === 'perms_allow' || route === 'perms_deny') {
                commandName = interactionOrMessage.options.getString('command').toLowerCase();
                targetChannel = interactionOrMessage.options.getChannel('channel');
            } else if (route === 'shortcut_add') {
                targetChannel = interactionOrMessage.options.getChannel('channel');
                inputWordsString = interactionOrMessage.options.getString('words');
                commandName = interactionOrMessage.options.getString('command').toLowerCase();
            } else if (route === 'shortcut_remove') {
                targetChannel = interactionOrMessage.options.getChannel('channel');
                inputWordsString = interactionOrMessage.options.getString('word').toLowerCase();
            }
            
            await interactionOrMessage.deferReply({ ephemeral: route.includes('list') ? false : true });
        } else {
            const cmd = interactionOrMessage.content.split(' ')[0].toLowerCase().slice(1);
            if (cmd === 'allow-command' || cmd === 'سماح-امر') {
                route = 'perms_allow';
                commandName = args[0]?.toLowerCase();
                targetChannel = interactionOrMessage.mentions.channels.first() || guild.channels.cache.get(args[1]) || interactionOrMessage.channel;
            } else if (cmd === 'deny-command' || cmd === 'منع-امر') {
                route = 'perms_deny';
                commandName = args[0]?.toLowerCase();
                targetChannel = interactionOrMessage.mentions.channels.first() || guild.channels.cache.get(args[1]) || interactionOrMessage.channel;
            } else if (cmd === 'list-command-perms' || cmd === 'صلاحيات-الاوامر') {
                route = 'perms_list';
            } else if (cmd === 'add-shortcut' || cmd === 'اختصار' || cmd === 'شورتكت') {
                route = 'shortcut_add';
                targetChannel = interactionOrMessage.mentions.channels.first();
                if (targetChannel && args.length >= 3) {
                    commandName = args[args.length - 1]?.toLowerCase();
                    const wordsStart = args.findIndex(arg => arg.includes(targetChannel.id));
                    if (wordsStart !== -1) inputWordsString = args.slice(wordsStart + 1, -1).join(' ');
                }
            } else if (cmd === 'remove-shortcut' || cmd === 'حذف-اختصار') {
                route = 'shortcut_remove';
                targetChannel = interactionOrMessage.mentions.channels.first();
                inputWordsString = args[1]?.toLowerCase();
            } else if (cmd === 'list-shortcuts' || cmd === 'الاختصارات') {
                route = 'shortcut_list';
            }
        }

        const reply = async (payload) => {
            if (typeof payload === 'string') payload = { content: payload };
            if (isSlash) return interactionOrMessage.editReply(payload);
            return interactionOrMessage.reply(payload);
        };

        try {
            if (route === 'perms_allow') {
                if (!commandName || !targetChannel) return reply('**الاستخدام:** `-allow-command <command_name> <#channel/category>`');
                if (targetChannel.type !== ChannelType.GuildText && targetChannel.type !== ChannelType.GuildCategory) return reply('❌ | يرجى عمل منشن لروم كتابي أو كاتاغوري.');

                const command = client.commands.get(commandName) || client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));
                if (!command) return reply(`❌ | لم يتم العثور على أمر باسم \`${commandName}\`.`);

                await db.query(`INSERT INTO command_permissions ("guildID", "channelID", "commandName") VALUES ($1, $2, $3) ON CONFLICT ("guildID", "channelID", "commandName") DO NOTHING`, [guild.id, targetChannel.id, command.name]);
                return reply(`✅ | تم السماح لأمر \`${command.name}\` بالعمل في: ${targetChannel}.`);
            }

            if (route === 'perms_deny') {
                if (!commandName || !targetChannel) return reply('**الاستخدام:** `-deny-command <command_name> <#channel/category>`');
                
                const command = client.commands.get(commandName) || client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));
                if (!command) return reply(`❌ | لم يتم العثور على أمر باسم \`${commandName}\`.`);

                const res = await db.query(`DELETE FROM command_permissions WHERE "guildID" = $1 AND "channelID" = $2 AND "commandName" = $3`, [guild.id, targetChannel.id, command.name]);
                if (res.rowCount > 0) return reply(`✅ | تم إزالة أمر \`${command.name}\` من ${targetChannel}.`);
                return reply(`ℹ️ | أمر \`${command.name}\` لم يكن مسموحاً في ${targetChannel} أصلاً.`);
            }

            if (route === 'perms_list') {
                const permsRes = await db.query(`SELECT * FROM command_permissions WHERE "guildID" = $1 ORDER BY "channelID", "commandName"`, [guild.id]);
                const settingsRes = await db.query(`SELECT "casinoChannelID" FROM settings WHERE "guild" = $1`, [guild.id]);
                
                let description = "**القنوات المسموحة (Whitelist):**\n";
                if (permsRes.rows.length > 0) {
                    description += permsRes.rows.map(p => `• في <#${p.channelID || p.channelid}> ➔ مسموح أمر: \`${p.commandName || p.commandname}\``).join('\n');
                } else {
                    description += "لم يتم تحديد أي صلاحيات (سيتم تجاهل الأعضاء العاديين).\n";
                }

                description += "\n**إعدادات خاصة:**\n";
                if (settingsRes.rows.length > 0 && (settingsRes.rows[0].casinoChannelID || settingsRes.rows[0].casinochannelid)) {
                    description += `- **روم الكازينو (بدون بريفكس):** <#${settingsRes.rows[0].casinoChannelID || settingsRes.rows[0].casinochannelid}>`;
                } else {
                    description += "- لم يتم تحديد روم كازينو.\n";
                }

                description += "\n\n*(ملاحظة: الإداريون يمكنهم استخدام الأوامر في كل مكان)*";
                return reply({ embeds: [new EmbedBuilder().setTitle('⚙️ إعدادات صلاحيات الأوامر').setColor('Blue').setDescription(description)] });
            }

            if (route === 'shortcut_add') {
                if (!targetChannel || !inputWordsString || !commandName) return reply('❌ | البيانات ناقصة.\nمثال: `-اختصار #الروم كلمة1 كلمة2 daily`');

                const shortcutWords = inputWordsString.split(/\s+/).map(w => w.trim().toLowerCase()).filter(w => w.length > 0);
                const command = client.commands.get(commandName) || client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));
                if (!command) return reply(`❌ | لم يتم العثور على أمر باسم \`${commandName}\`.`);

                await db.query("BEGIN");
                for (const word of shortcutWords) {
                    await db.query(`INSERT INTO command_shortcuts ("guildID", "channelID", "shortcutWord", "commandName") VALUES ($1, $2, $3, $4) ON CONFLICT ("guildID", "channelID", "shortcutWord") DO UPDATE SET "commandName" = EXCLUDED."commandName"`, [guild.id, targetChannel.id, word, command.name]);
                }
                await db.query("COMMIT");

                return reply(`✅ | تم إضافة **${shortcutWords.length}** اختصار في ${targetChannel}.\nالكلمات: \`${shortcutWords.join('`, `')}\`\nسوف تقوم بتشغيل الأمر: \`${command.name}\``);
            }

            if (route === 'shortcut_remove') {
                if (!targetChannel || !inputWordsString) return reply('**الاستخدام:** `-remove-shortcut <#channel> <الكلمة>`');

                const res = await db.query(`DELETE FROM command_shortcuts WHERE "guildID" = $1 AND "channelID" = $2 AND "shortcutWord" = $3`, [guild.id, targetChannel.id, inputWordsString]);
                if (res.rowCount > 0) return reply(`✅ | تم حذف اختصار \`${inputWordsString}\` من ${targetChannel}.`);
                return reply(`ℹ️ | لم يتم العثور على اختصار بهذا الاسم في تلك القناة.`);
            }

            if (route === 'shortcut_list') {
                const res = await db.query(`SELECT * FROM command_shortcuts WHERE "guildID" = $1`, [guild.id]);
                if (res.rows.length === 0) return reply("ℹ️ | لا توجد أي اختصارات مفعلة في هذا السيرفر.");

                const description = res.rows.map(s => `• في <#${s.channelID || s.channelid}>: \`${s.shortcutWord || s.shortcutword}\` ➔ \`-${s.commandName || s.commandname}\``).join('\n');
                return reply({ embeds: [new EmbedBuilder().setTitle('⚙️ قائمة الاختصارات المفعلة').setColor('Blue').setDescription(description)] });
            }

        } catch (err) {
            console.error("Cmd Security Error:", err);
            return reply('❌ | حدث خطأ داخلي أثناء تحديث قاعدة البيانات.');
        }
    }
};
