const { PermissionsBitField, SlashCommandBuilder, ChannelType } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup-channels')
        .setDescription('إعداد وتحديد قنوات البوت الأساسية (بومب، تعزيز، لوجات، لفل، اقتراحات)')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
        .addSubcommand(subcommand => subcommand
            .setName('boost')
            .setDescription('يحدد القناة المخصصة للتعزيز (Boost) لحساب مهام الرياكشن.')
            .addChannelOption(option => option.setName('channel').setDescription('القناة المخصصة للتعزيز').setRequired(true).addChannelTypes(ChannelType.GuildText))
        )
        .addSubcommand(subcommand => subcommand
            .setName('bump')
            .setDescription('يحدد القناة التي يتم فيها تتبع رسائل Disboard (البومب).')
            .addChannelOption(option => option.setName('channel').setDescription('القناة المخصصة للبومب').setRequired(true).addChannelTypes(ChannelType.GuildText))
        )
        .addSubcommand(subcommand => subcommand
            .setName('modlog')
            .setDescription('تعيين قناة سجلات الإشراف.')
            .addChannelOption(option => option.setName('channel').setDescription('قناة سجلات الإشراف').setRequired(true).addChannelTypes(ChannelType.GuildText))
        )
        .addSubcommand(subcommand => subcommand
            .setName('shoplog')
            .setDescription('تعيين قناة سجلات المتجر.')
            .addChannelOption(option => option.setName('channel').setDescription('قناة سجلات المتجر').setRequired(true).addChannelTypes(ChannelType.GuildText))
        )
        .addSubcommand(subcommand => subcommand
            .setName('suggestions')
            .setDescription('تعيين قناة الاقتراحات (أي رسالة فيها ستتحول لاقتراح تلقائياً).')
            .addChannelOption(option => option.setName('channel').setDescription('قناة الاقتراحات').setRequired(true).addChannelTypes(ChannelType.GuildText))
        )
        .addSubcommand(subcommand => subcommand
            .setName('timers')
            .setDescription('إنشاء قنوات صوتية تعرض الوقت المتبقي للستريك والمهام.')
        )
        .addSubcommand(subcommand => subcommand
            .setName('xp-ignore')
            .setDescription('منع/تفعيل احتساب اللفل في قناة أو كاتيغوري معين.')
            .addChannelOption(option => option.setName('target').setDescription('القناة أو الكاتيغوري').setRequired(true))
        ),

    name: 'setup-channels',
    aliases: ['setboost', 'setbump', 'setmodlog', 'setshoplog', 'setsuggestions', 'تحديد-التعزيز', 'تحديد-قناة-البومب'],
    category: "Admin",
    description: "إعداد وتحديد قنوات البوت (مجمع للإدارة)",

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        const client = interactionOrMessage.client;
        const db = client.sql;
        const guild = interactionOrMessage.guild;

        const member = isSlash ? interactionOrMessage.member : interactionOrMessage.member;
        if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            const err = 'ليس لديك صلاحية الإدارة!';
            return isSlash ? interactionOrMessage.reply({ content: err, ephemeral: true }) : interactionOrMessage.reply(err);
        }

        try {
            await db.query(`CREATE TABLE IF NOT EXISTS xp_ignore ("guildID" TEXT, "id" TEXT, "type" TEXT)`);
            await db.query(`CREATE TABLE IF NOT EXISTS settings (
                "guild" TEXT PRIMARY KEY, 
                "boostChannelID" TEXT, 
                "bumpChannelID" TEXT, 
                "modLogChannelID" TEXT, 
                "shopLogChannelID" TEXT, 
                "streakTimerChannelID" TEXT, 
                "dailyTimerChannelID" TEXT, 
                "weeklyTimerChannelID" TEXT,
                "suggestionChannelID" TEXT
            )`);
            // 🔥 إضافة العمود تلقائياً في حال كان الجدول موجوداً مسبقاً
            await db.query(`ALTER TABLE settings ADD COLUMN IF NOT EXISTS "suggestionChannelID" TEXT`).catch(() => {});
            
            await db.query(`INSERT INTO settings ("guild") VALUES ($1) ON CONFLICT ("guild") DO NOTHING`, [guild.id]);
        } catch(e) {
            console.error("Error creating tables in setup-channels:", e);
        }

        let subcommand = '';
        let targetChannel = null;

        if (isSlash) {
            subcommand = interactionOrMessage.options.getSubcommand();
            targetChannel = interactionOrMessage.options.getChannel('channel') || interactionOrMessage.options.getChannel('target');
            await interactionOrMessage.deferReply({ ephemeral: subcommand !== 'modlog' && subcommand !== 'shoplog' && subcommand !== 'suggestions' }); 
        } else {
            const cmdName = interactionOrMessage.content.split(' ')[0].toLowerCase().slice(1);
            if (cmdName.includes('setboost') || cmdName.includes('تحديد-التعزيز')) subcommand = 'boost';
            else if (cmdName.includes('setbump') || cmdName.includes('تحديد-قناة-البومب')) subcommand = 'bump';
            else if (cmdName.includes('setmodlog')) subcommand = 'modlog';
            else if (cmdName.includes('setshoplog') || cmdName.includes('set-shop-log')) subcommand = 'shoplog';
            else if (cmdName.includes('setsuggestions')) subcommand = 'suggestions';
            else if (cmdName.includes('setup-timer-channels') || cmdName.includes('تثبيت-قنوات-التوقيت')) subcommand = 'timers';
            else if (cmdName.includes('xp-ignore')) subcommand = 'xp-ignore';

            targetChannel = interactionOrMessage.mentions.channels.first() || guild.channels.cache.get(args[0]);
        }

        const reply = async (payload) => {
            if (isSlash) return interactionOrMessage.editReply(payload);
            return interactionOrMessage.reply(payload);
        };

        try {
            if (subcommand === 'boost') {
                if (!targetChannel || targetChannel.type !== ChannelType.GuildText) return reply("الرجاء تحديد قناة نصية فقط.");
                await db.query(`UPDATE settings SET "boostChannelID" = $1 WHERE "guild" = $2`, [targetChannel.id, guild.id]);
                return reply(`✅ تم تحديد قناة التعزيز بنجاح: ${targetChannel}\nالآن سيتم احتساب مهمة الرياكشن في هذه القناة.`);
            }

            if (subcommand === 'bump') {
                if (!targetChannel || targetChannel.type !== ChannelType.GuildText) return reply("الرجاء تحديد قناة نصية فقط.");
                await db.query(`UPDATE settings SET "bumpChannelID" = $1 WHERE "guild" = $2`, [targetChannel.id, guild.id]);
                return reply(`✅ تم تحديد قناة البومب (Disboard) بنجاح إلى ${targetChannel}.`);
            }

            if (subcommand === 'modlog') {
                targetChannel = targetChannel || interactionOrMessage.channel;
                await db.query(`UPDATE settings SET "modLogChannelID" = $1 WHERE "guild" = $2`, [targetChannel.id, guild.id]);
                return reply(`✅ **تم تعيين قناة سجلات الإشراف إلى:** ${targetChannel}`);
            }

            if (subcommand === 'shoplog') {
                if (!targetChannel || targetChannel.type !== ChannelType.GuildText) return reply("الرجاء تحديد قناة نصية فقط.");
                await db.query(`UPDATE settings SET "shopLogChannelID" = $1 WHERE "guild" = $2`, [targetChannel.id, guild.id]);
                return reply(`✅ تم تعيين قناة سجلات المتجر: ${targetChannel}`);
            }

            // 💡 نظام الاقتراحات الجديد
            if (subcommand === 'suggestions') {
                if (!targetChannel || targetChannel.type !== ChannelType.GuildText) return reply("الرجاء تحديد قناة نصية فقط.");
                try {
                    await db.query(`UPDATE settings SET "suggestionChannelID" = $1 WHERE "guild" = $2`, [targetChannel.id, guild.id]);
                } catch(e) {
                    await db.query(`UPDATE settings SET suggestionchannelid = $1 WHERE guild = $2`, [targetChannel.id, guild.id]).catch(()=>{});
                }
                return reply(`✅ تم تعيين قناة الاقتراحات: ${targetChannel}\n💡 *(الآن أي رسالة تُرسل في تلك القناة سيتم تحويلها تلقائياً لاقتراح احترافي!)*`);
            }

            if (subcommand === 'timers') {
                if (!isSlash) return interactionOrMessage.reply("هذا الأمر يفضل تشغيله كسلاش كوماند.");
                const category = await guild.channels.create({
                    name: '⌚ التوقيت والمهام',
                    type: ChannelType.GuildCategory,
                });
                const streakChannel = await guild.channels.create({
                    name: '🔥〢الـستـريـك: جارِ الحساب...',
                    type: ChannelType.GuildVoice,
                    parent: category.id,
                    permissionOverwrites: [{ id: guild.id, deny: [PermissionsBitField.Flags.Connect] }],
                });
                const dailyChannel = await guild.channels.create({
                    name: '🏆〢مهام يومية: جارِ الحساب...',
                    type: ChannelType.GuildVoice,
                    parent: category.id,
                    permissionOverwrites: [{ id: guild.id, deny: [PermissionsBitField.Flags.Connect] }],
                });
                const weeklyChannel = await guild.channels.create({
                    name: '🔮〢مهام اسبوعية: جارِ الحساب...',
                    type: ChannelType.GuildVoice,
                    parent: category.id,
                    permissionOverwrites: [{ id: guild.id, deny: [PermissionsBitField.Flags.Connect] }],
                });

                await db.query(`UPDATE settings SET "streakTimerChannelID" = $1, "dailyTimerChannelID" = $2, "weeklyTimerChannelID" = $3 WHERE "guild" = $4`, [streakChannel.id, dailyChannel.id, weeklyChannel.id, guild.id]);
                return reply('✅ تم إنشاء القنوات بنجاح! سيتم تحديث أسمائها تلقائياً كل 5 دقائق.');
            }

            if (subcommand === 'xp-ignore') {
                if (!interactionOrMessage.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                    return reply("❌ هذا الأمر للمسؤولين فقط.");
                }

                if (!targetChannel) return reply("يرجى تحديد القناة.");

                const res = await db.query(`SELECT * FROM xp_ignore WHERE "guildID" = $1 AND "id" = $2`, [guild.id, targetChannel.id]);
                
                if (res.rows.length > 0) {
                    await db.query(`DELETE FROM xp_ignore WHERE "guildID" = $1 AND "id" = $2`, [guild.id, targetChannel.id]);
                    return reply(`✅ **تم تفعيل** احتساب اللفل في ${targetChannel.name} مرة أخرى.`);
                } else {
                    let type = targetChannel.type === ChannelType.GuildCategory ? 'category' : 'channel';
                    await db.query(`INSERT INTO xp_ignore ("guildID", "id", "type") VALUES ($1, $2, $3)`, [guild.id, targetChannel.id, type]);
                    
                    if (type === 'category') {
                        return reply(`🚫 **تم تعطيل** احتساب اللفل في الكاتيغوري **${targetChannel.name}** وجميع القنوات داخله.`);
                    } else {
                        return reply(`🚫 **تم تعطيل** احتساب اللفل في القناة **${targetChannel.name}**.`);
                    }
                }
            }

        } catch (err) {
            console.error("Setup Channels Error:", err);
            return reply("❌ حدث خطأ داخلي أثناء حفظ الإعدادات.");
        }
    }
};
