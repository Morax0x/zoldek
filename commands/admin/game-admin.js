const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Colors, PermissionsBitField, ChannelType } = require('discord.js');
const dungeonConfig = require('../../json/dungeon-config.json');

function createProgressBar(current, max, length, fillChar, emptyChar) {
    const percent = Math.max(0, Math.min(1, current / max));
    const filled = Math.floor(percent * length);
    const empty = length - filled;
    return fillChar.repeat(filled) + emptyChar.repeat(empty);
}

function getStatIcon(stat) {
    switch (stat) {
        case 'atk': return '⚔️';
        case 'hp': return '❤️';
        case 'def': return '🛡️';
        case 'shield': return '💠';
        case 'crit': return '✨';
        case 'lifesteal': return '🩸';
        default: return '🔹';
    }
}

const SETTINGS_MAP = new Map([
    ['title', 'dropTitle'],
    ['description', 'dropDescription'],
    ['color', 'dropColor'],
    ['footer', 'dropFooter'],
    ['button_label', 'dropButtonLabel'],
    ['button_emoji', 'dropButtonEmoji'],
    ['content', 'dropMessageContent']
]);

const SETTINGS_CHOICES = Array.from(SETTINGS_MAP.keys()).map(key => ({ name: key, value: key }));

const DEFAULTS = {
    dropTitle: "🎉 قيفاواي مفاجئ! 🎉",
    dropDescription: "تفاعلكم رائع! إليكم قيفاواي سريع:\n\n✦ الـجـائـزة: **{prize}**\n✦ الـفـائـزون: `{winners}`\n✦ ينتهي بعـد: {time}",
    dropColor: "Gold",
    dropFooter: "اضغط الزر للدخول!",
    dropButtonLabel: "ادخل السحب!",
    dropButtonEmoji: "🎁",
    dropMessageContent: "✨ **قيفاواي مفاجئ ظهر!** ✨"
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('gameadmin')
        .setDescription('إدارة ألعاب واقتصاد الإمبراطورية')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        
        .addSubcommandGroup(group => group.setName('boss').setDescription('إدارة وحش العالم')
            .addSubcommand(sub => sub.setName('spawn').setDescription('استدعاء وحش العالم')
                .addStringOption(opt => opt.setName('name').setDescription('اسم الوحش').setRequired(true))
                .addIntegerOption(opt => opt.setName('hp').setDescription('نقاط حياة الوحش').setRequired(true))
                .addStringOption(opt => opt.setName('image').setDescription('رابط الصورة الكبيرة').setRequired(false))
                .addStringOption(opt => opt.setName('thumbnail').setDescription('رابط الصورة المصغرة').setRequired(false)))
            .addSubcommand(sub => sub.setName('control').setDescription('التحكم بوحش العالم النشط')
                .addStringOption(opt => opt.setName('action').setDescription('الإجراء').setRequired(true)
                    .addChoices({name: 'قتل الوحش', value: 'kill'}, {name: 'حذف الحدث', value: 'delete'}, {name: 'تغيير الصحة', value: 'set-hp'}, {name: 'تعديل البيانات', value: 'edit'}))
                .addIntegerOption(opt => opt.setName('amount').setDescription('نقاط الصحة الجديدة').setRequired(false))
                .addStringOption(opt => opt.setName('name').setDescription('الاسم الجديد').setRequired(false))
                .addStringOption(opt => opt.setName('image').setDescription('الصورة الجديدة').setRequired(false)))
        )

        .addSubcommandGroup(group => group.setName('casino').setDescription('إدارة قنوات الكازينو')
            .addSubcommand(sub => sub.setName('main').setDescription('تحديد روم الكازينو الأساسي')
                .addChannelOption(opt => opt.setName('channel').setDescription('القناة').setRequired(true).addChannelTypes(ChannelType.GuildText)))
            .addSubcommand(sub => sub.setName('extra').setDescription('تحديد روم كازينو إضافي')
                .addChannelOption(opt => opt.setName('channel').setDescription('القناة').setRequired(true).addChannelTypes(ChannelType.GuildText)))
        )

        .addSubcommandGroup(group => group.setName('drop').setDescription('إدارة القيفاواي المفاجئ')
            .addSubcommand(sub => sub.setName('channel').setDescription('تعيين قناة الدروب')
                .addChannelOption(opt => opt.setName('channel').setDescription('القناة').setRequired(true).addChannelTypes(ChannelType.GuildText)))
            .addSubcommand(sub => sub.setName('style').setDescription('تخصيص شكل الدروب')
                .addStringOption(opt => opt.setName('action').setDescription('الإجراء').setRequired(true)
                    .addChoices({name: 'عرض', value: 'show'}, {name: 'إعادة ضبط', value: 'reset'}, {name: 'تعديل', value: 'edit'}))
                .addStringOption(opt => opt.setName('option').setDescription('الخيار').setRequired(false).addChoices(...SETTINGS_CHOICES))
                .addStringOption(opt => opt.setName('value').setDescription('القيمة الجديدة').setRequired(false)))
        )

        .addSubcommandGroup(group => group.setName('buffs').setDescription('إدارة بفات الرتب')
            .addSubcommand(sub => sub.setName('mora').setDescription('تحديد تعزيز مورا لرتبة')
                .addRoleOption(opt => opt.setName('role').setDescription('الرتبة').setRequired(true))
                .addIntegerOption(opt => opt.setName('percent').setDescription('النسبة (0 للإلغاء)').setRequired(true)))
            .addSubcommand(sub => sub.setName('race').setDescription('تعيين ميزة عرق لدانجون')
                .addStringOption(opt => opt.setName('action').setDescription('الإجراء').setRequired(true)
                    .addChoices({name: 'عرض القائمة', value: 'list'}, {name: 'تعيين ميزة', value: 'set'}))
                .addRoleOption(opt => opt.setName('role').setDescription('الرتبة').setRequired(false))
                .addStringOption(opt => opt.setName('dungeon').setDescription('معرف الدانجون (اكتب "الكل" للجميع)').setRequired(false))
                .addStringOption(opt => opt.setName('stat').setDescription('النوع').setRequired(false)
                    .addChoices({name: 'هجوم', value: 'atk'}, {name: 'صحة', value: 'hp'}, {name: 'دفاع', value: 'def'}, {name: 'درع', value: 'shield'}, {name: 'شفاء', value: 'lifesteal'}, {name: 'كريت', value: 'crit'}))
                .addIntegerOption(opt => opt.setName('percent').setDescription('النسبة').setRequired(false)))
        ),

    name: 'gameadmin',
    aliases: ['spawn-boss', 'boss-control', 'set-casino-room', 'set-extra-casino', 'setdropchannel', 'setdropstyle', 'set-mora-buff', 'set-race-buff', 'كازينو', 'كازينو2', 'دروب', 'تصميم-المفاجآت', 'تعيين-تعزيز-الرول', 'ميزة', 'بفات'],
    category: "Admin",

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        const client = interactionOrMessage.client;
        const db = client.sql;
        const guild = interactionOrMessage.guild;

        const member = isSlash ? interactionOrMessage.member : interactionOrMessage.member;
        if (!member.permissions.has(PermissionsBitField.Flags.Administrator) && !member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            const err = '❌ ليس لديك صلاحية الإدارة!';
            return isSlash ? interactionOrMessage.reply({ content: err, ephemeral: true }) : interactionOrMessage.reply(err);
        }

        try {
            await db.query(`CREATE TABLE IF NOT EXISTS world_boss ("guildID" TEXT PRIMARY KEY, "currentHP" BIGINT, "maxHP" BIGINT, "name" TEXT, "image" TEXT, "active" INTEGER, "messageID" TEXT, "channelID" TEXT, "lastLog" TEXT)`);
            await db.query(`CREATE TABLE IF NOT EXISTS role_mora_buffs ("guildID" TEXT, "roleID" TEXT PRIMARY KEY, "buffPercent" INTEGER)`);
            await db.query(`CREATE TABLE IF NOT EXISTS race_dungeon_buffs ("guildID" TEXT, "roleID" TEXT, "dungeonKey" TEXT, "statType" TEXT, "buffValue" INTEGER, PRIMARY KEY ("guildID", "roleID", "dungeonKey"))`);
        } catch(e) {}

        let route = '';
        
        if (isSlash) {
            const group = interactionOrMessage.options.getSubcommandGroup();
            const sub = interactionOrMessage.options.getSubcommand();
            route = `${group}_${sub}`;
            await interactionOrMessage.deferReply({ ephemeral: route !== 'boss_spawn' });
        } else {
            const cmd = interactionOrMessage.content.split(' ')[0].toLowerCase().slice(1);
            if (cmd.includes('spawn')) route = 'boss_spawn';
            else if (cmd.includes('boss-control')) route = 'boss_control';
            else if (cmd === 'كازينو' || cmd === 'set-casino-room') route = 'casino_main';
            else if (cmd === 'كازينو2' || cmd === 'set-extra-casino') route = 'casino_extra';
            else if (cmd === 'دروب' || cmd === 'setdropchannel') route = 'drop_channel';
            else if (cmd.includes('setdropstyle') || cmd.includes('تصميم')) route = 'drop_style';
            else if (cmd.includes('mora') || cmd.includes('تعيين-تعزيز')) route = 'buffs_mora';
            else if (cmd.includes('race') || cmd === 'ميزة' || cmd === 'بفات') route = 'buffs_race';
        }

        const reply = async (payload) => {
            if (isSlash) return interactionOrMessage.editReply(payload);
            return interactionOrMessage.reply(payload);
        };

        try {
            if (route === 'boss_spawn') {
                const name = isSlash ? interactionOrMessage.options.getString('name') : args.slice(0, -1).join(' ') || 'Unknown';
                const hp = isSlash ? interactionOrMessage.options.getInteger('hp') : parseInt(args[args.length - 1]) || 10000;
                const image = isSlash ? interactionOrMessage.options.getString('image') : null;
                const thumbnail = isSlash ? interactionOrMessage.options.getString('thumbnail') : null;

                const activeRes = await db.query(`SELECT * FROM world_boss WHERE "guildID" = $1 AND "active" = 1`, [guild.id]);
                if (activeRes.rows.length > 0) return reply('❌ يوجد وحش نشط بالفعل!');

                const progressBar = createProgressBar(hp, hp, 12, '█', '░'); 
                
                const embed = new EmbedBuilder()
                    .setTitle(`مـعـركـة ضــد الزعــيـم ${name}`)
                    .setColor(Colors.DarkRed)
                    .setDescription(
                        `✬ ظـهـر زعـيـم في السـاحـة تـعانـوا عـلـى قتاله واكسبوا الجوائـز !\n\n` +
                        `✬ **نـقـاط صـحـة الزعـيـم:**\n` +
                        `${progressBar} **100%**\n` +
                        `╰ **${hp.toLocaleString()}** / ${hp.toLocaleString()} HP\n\n` +
                        `✬ **سـجـل الـمـعـركـة:**\n` +
                        `╰ بانتظار الهجوم الأول...`
                    );

                if (image) embed.setImage(image);
                if (thumbnail) embed.setThumbnail(thumbnail);

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('boss_attack').setLabel('هـجـوم').setStyle(ButtonStyle.Danger).setEmoji('⚔️'),
                    new ButtonBuilder().setCustomId('boss_skill_menu').setLabel('مـهـارة').setStyle(ButtonStyle.Primary).setEmoji('✨'),
                    new ButtonBuilder().setCustomId('boss_status').setStyle(ButtonStyle.Secondary).setEmoji('❗')
                );

                const sentMsg = isSlash ? await interactionOrMessage.channel.send({ embeds: [embed], components: [row] }) : await interactionOrMessage.reply({ embeds: [embed], components: [row] });
                
                await db.query(`
                    INSERT INTO world_boss ("guildID", "currentHP", "maxHP", "name", "image", "active", "messageID", "channelID", "lastLog") 
                    VALUES ($1, $2, $3, $4, $5, 1, $6, $7, '[]') 
                    ON CONFLICT ("guildID") DO UPDATE SET 
                        "currentHP"=EXCLUDED."currentHP", 
                        "maxHP"=EXCLUDED."maxHP", 
                        "name"=EXCLUDED."name", 
                        "image"=EXCLUDED."image", 
                        "active"=1, 
                        "messageID"=EXCLUDED."messageID", 
                        "channelID"=EXCLUDED."channelID"
                `, [guild.id, hp, hp, name, image || thumbnail, sentMsg.id, sentMsg.channel.id]);

                await db.query(`DELETE FROM boss_cooldowns WHERE "guildID" = $1`, [guild.id]);
                await db.query(`DELETE FROM boss_leaderboard WHERE "guildID" = $1`, [guild.id]);

                if (isSlash) return reply('✅ تم الاستدعاء.');
                return;
            }

            if (route === 'boss_control') {
                const action = isSlash ? interactionOrMessage.options.getString('action') : args[0];
                const bossRes = await db.query(`SELECT * FROM world_boss WHERE "guildID" = $1 AND "active" = 1`, [guild.id]);
                if (bossRes.rows.length === 0) return reply("❌ لا يوجد وحش نشط حالياً للتحكم به.");
                const boss = bossRes.rows[0];

                let bossMsg;
                try {
                    const channel = await guild.channels.fetch(boss.channelID || boss.channelid);
                    bossMsg = await channel.messages.fetch(boss.messageID || boss.messageid);
                } catch (e) {
                    if (action === 'delete' || action === 'kill') {
                        await db.query(`UPDATE world_boss SET "active" = 0 WHERE "guildID" = $1`, [guild.id]);
                        return reply("⚠️ لم يتم العثور على رسالة الوحش، ولكن تم إغلاق الحدث في قاعدة البيانات.");
                    }
                    return reply("❌ لا يمكن العثور على رسالة الوحش الأصلية.");
                }

                if (action === 'kill') {
                    const killEmbed = EmbedBuilder.from(bossMsg.embeds[0])
                        .setTitle(`💀 **تم القضاء على ${boss.name} بأمر إداري!**`)
                        .setDescription(`🎉 **النصر!**\nتدخلت القوى العليا وقضت على الوحش.\nتم إنهاء المعركة فوراً.`)
                        .setColor(Colors.Gold)
                        .setFields([]); 

                    await bossMsg.edit({ embeds: [killEmbed], components: [] });
                    await db.query(`UPDATE world_boss SET "currentHP" = 0, "active" = 0 WHERE "guildID" = $1`, [guild.id]);
                    await db.query(`DELETE FROM boss_leaderboard WHERE "guildID" = $1`, [guild.id]);
                    return reply("✅ تم قتل الوحش وإنهاء الحدث.");
                }

                if (action === 'delete') {
                    try { await bossMsg.delete(); } catch(e) {}
                    await db.query(`UPDATE world_boss SET "active" = 0 WHERE "guildID" = $1`, [guild.id]);
                    await db.query(`DELETE FROM boss_cooldowns WHERE "guildID" = $1`, [guild.id]);
                    await db.query(`DELETE FROM boss_leaderboard WHERE "guildID" = $1`, [guild.id]);
                    return reply("✅ تم حذف الوحش وإلغاء الحدث.");
                }

                if (action === 'set-hp') {
                    let newHP = isSlash ? interactionOrMessage.options.getInteger('amount') : parseInt(args[1]);
                    if (isNaN(newHP) || newHP < 0) newHP = 0;
                    const maxHP = Number(boss.maxHP || boss.maxhp);
                    if (newHP > maxHP) newHP = maxHP; 

                    await db.query(`UPDATE world_boss SET "currentHP" = $1 WHERE "guildID" = $2`, [newHP, guild.id]);

                    const hpPercent = Math.floor((newHP / maxHP) * 100);
                    const progressBar = createProgressBar(newHP, maxHP, 18, '🟥', '⬛');
                    
                    const newEmbed = EmbedBuilder.from(bossMsg.embeds[0])
                        .setDescription(bossMsg.embeds[0].description.replace(/📊 \*\*الحالة:\*\*.*?\n.*/s, `📊 **الحالة:** ${hpPercent}% متبقي\n${progressBar}`));
                    
                    const fields = newEmbed.data.fields;
                    if (fields && fields[0]) {
                        fields[0].value = `**${newHP.toLocaleString()}** / ${maxHP.toLocaleString()} HP`;
                    }
                    newEmbed.setFields(fields);

                    await bossMsg.edit({ embeds: [newEmbed] });
                    return reply(`✅ تم تغيير صحة الوحش إلى **${newHP}**.`);
                }

                if (action === 'edit') {
                    const newName = isSlash ? interactionOrMessage.options.getString('name') : args[1] || boss.name;
                    const newImage = isSlash ? interactionOrMessage.options.getString('image') : args[2] || boss.image;

                    await db.query(`UPDATE world_boss SET "name" = $1, "image" = $2 WHERE "guildID" = $3`, [newName, newImage, guild.id]);

                    const newEmbed = EmbedBuilder.from(bossMsg.embeds[0]).setTitle(`👹 **WORLD BOSS: ${newName}**`);
                    if (newImage) newEmbed.setImage(newImage);

                    await bossMsg.edit({ embeds: [newEmbed] });
                    return reply("✅ تم تحديث بيانات الوحش.");
                }
            }

            if (route === 'casino_main') {
                const channel = isSlash ? interactionOrMessage.options.getChannel('channel') : interactionOrMessage.mentions.channels.first();
                if (!channel || channel.type !== ChannelType.GuildText) return reply("الرجاء تحديد قناة كتابية صالحة.");
                
                await db.query(`INSERT INTO settings ("guild", "casinoChannelID") VALUES ($1, $2) ON CONFLICT("guild") DO UPDATE SET "casinoChannelID" = EXCLUDED."casinoChannelID"`, [guild.id, channel.id]);
                return reply(`✅ | تم تحديد روم الكازينو بنجاح إلى: ${channel}.`);
            }

            if (route === 'casino_extra') {
                const channel = isSlash ? interactionOrMessage.options.getChannel('channel') : interactionOrMessage.mentions.channels.first();
                if (!channel || channel.type !== ChannelType.GuildText) return reply("الرجاء تحديد قناة كتابية صالحة.");
                
                await db.query(`INSERT INTO settings ("guild", "casinoChannelID2") VALUES ($1, $2) ON CONFLICT("guild") DO UPDATE SET "casinoChannelID2" = EXCLUDED."casinoChannelID2"`, [guild.id, channel.id]);
                return reply(`✅ | تم تحديد روم الكازينو **الإضافي** بنجاح: ${channel}\n(ستعمل فيه الأوامر بدون بريفكس، لكن الإشعارات ستبقى في الروم الأساسي).`);
            }

            if (route === 'drop_channel') {
                const channel = isSlash ? interactionOrMessage.options.getChannel('channel') : interactionOrMessage.mentions.channels.first();
                if (!channel || channel.type !== ChannelType.GuildText) return reply("الرجاء تحديد قناة كتابية صالحة.");
                
                await db.query(`INSERT INTO settings ("guild", "dropGiveawayChannelID") VALUES ($1, $2) ON CONFLICT("guild") DO UPDATE SET "dropGiveawayChannelID" = EXCLUDED."dropGiveawayChannelID"`, [guild.id, channel.id]);
                return reply(`✅ تم تعيين قناة القيفاوايات المفاجئة لتكون ${channel}`);
            }

            if (route === 'drop_style') {
                let action = ''; let option = ''; let value = '';
                if (isSlash) {
                    action = interactionOrMessage.options.getString('action');
                    option = interactionOrMessage.options.getString('option');
                    value = interactionOrMessage.options.getString('value');
                } else {
                    action = args[0]?.toLowerCase() === 'show' || args[0]?.toLowerCase() === 'view' ? 'show' : (args[0]?.toLowerCase() === 'reset' ? 'reset' : 'edit');
                    option = action === 'reset' ? args[1] : args[0];
                    value = args.slice(1).join(' ');
                }

                if (action === 'show' || action === 'عرض') {
                    const res = await db.query(`SELECT * FROM settings WHERE "guild" = $1`, [guild.id]);
                    const settings = res.rows[0] || {};
                    const displayEmbed = new EmbedBuilder()
                        .setTitle("🎨 إعدادات تصميم القيفاواي المفاجئ")
                        .setColor(settings.dropColor || settings.dropcolor || DEFAULTS.dropColor)
                        .addFields(
                            { name: "1. النص العلوي (content)", value: `\`\`\`${settings.dropMessageContent || settings.dropmessagecontent || DEFAULTS.dropMessageContent}\`\`\`` },
                            { name: "2. عنوان الإمبد (title)", value: `\`\`\`${settings.dropTitle || settings.droptitle || DEFAULTS.dropTitle}\`\`\`` },
                            { name: "3. الوصف (description)", value: `\`\`\`${settings.dropDescription || settings.dropdescription || DEFAULTS.dropDescription}\`\`\`` },
                            { name: "4. اللون (color)", value: `\`${settings.dropColor || settings.dropcolor || DEFAULTS.dropColor}\``, inline: true },
                            { name: "5. الفوتر (footer)", value: `\`${settings.dropFooter || settings.dropfooter || DEFAULTS.dropFooter}\``, inline: true },
                            { name: "6. نص الزر (button_label)", value: `\`${settings.dropButtonLabel || settings.dropbuttonlabel || DEFAULTS.dropButtonLabel}\``, inline: true },
                            { name: "7. إيموجي الزر (button_emoji)", value: `\`${settings.dropButtonEmoji || settings.dropbuttonemoji || DEFAULTS.dropButtonEmoji}\``, inline: true }
                        )
                        .setFooter({ text: "المتغيرات المتاحة: {prize}, {winners}, {time} (فقط للوصف)" });
                    return reply({ embeds: [displayEmbed] });
                }

                if (action === 'reset' || action === 'اعادة-ضبط') {
                    const col = SETTINGS_MAP.get(option);
                    if (col) {
                        await db.query(`UPDATE settings SET "${col}" = NULL WHERE "guild" = $1`, [guild.id]);
                        return reply(`✅ تم إعادة تعيين \`${option}\` إلى الإعداد الافتراضي.`);
                    }
                    await db.query(`UPDATE settings SET "dropTitle" = NULL, "dropDescription" = NULL, "dropColor" = NULL, "dropFooter" = NULL, "dropButtonLabel" = NULL, "dropButtonEmoji" = NULL, "dropMessageContent" = NULL WHERE "guild" = $1`, [guild.id]);
                    return reply(`✅ تم إعادة تعيين **جميع** إعدادات تصميم القيفاواي إلى الافتراضي.`);
                }

                if (action === 'edit' || action === 'تعديل') {
                    const col = SETTINGS_MAP.get(option);
                    if (!col || !value) return reply("❌ خيار غير صالح أو القيمة مفقودة.");
                    await db.query(`UPDATE settings SET "${col}" = $1 WHERE "guild" = $2`, [value, guild.id]);
                    const successEmbed = new EmbedBuilder().setColor(0x57F287).setTitle('✅ تم تحديث التصميم').setDescription(`**تم تغيير \`${option}\` بنجاح إلى:**\n\`\`\`${value}\`\`\``);
                    return reply({ embeds: [successEmbed] });
                }
            }

            if (route === 'buffs_mora') {
                const role = isSlash ? interactionOrMessage.options.getRole('role') : interactionOrMessage.mentions.roles.first();
                const percent = isSlash ? interactionOrMessage.options.getInteger('percent') : parseInt(args[1]);
                
                if (!role || isNaN(percent)) return reply("❌ يرجى إدخال الرتبة والنسبة المئوية.");

                if (percent === 0) {
                    await db.query(`DELETE FROM role_mora_buffs WHERE "roleID" = $1 AND "guildID" = $2`, [role.id, guild.id]).catch(()=>{});
                    return reply(`✅ تم إزالة تعزيز المورا لرتبة ${role}.`);
                } else {
                    await db.query(`DELETE FROM role_mora_buffs WHERE "roleID" = $1 AND "guildID" = $2`, [role.id, guild.id]).catch(()=>{});
                    await db.query(`INSERT INTO role_mora_buffs ("guildID", "roleID", "buffPercent") VALUES ($1, $2, $3)`, [guild.id, role.id, percent]).catch(()=>{});
                    
                    const actionWord = percent > 0 ? "تعزيز (Buff)" : "إضعاف (Debuff)";
                    return reply(`✅ تم تعيين ${actionWord} المورا لرتبة ${role} لتصبح **${percent}%**.`);
                }
            }

            if (route === 'buffs_race') {
                let action = ''; let role = null; let inputDungeon = ''; let inputStat = ''; let percent = 0;
                
                if (isSlash) {
                    action = interactionOrMessage.options.getString('action');
                    if (action === 'set') {
                        role = interactionOrMessage.options.getRole('role');
                        inputDungeon = interactionOrMessage.options.getString('dungeon');
                        inputStat = interactionOrMessage.options.getString('stat');
                        percent = interactionOrMessage.options.getInteger('percent');
                    }
                } else {
                    action = (!args[0] || ['list', 'قائمة', 'الكل'].includes(args[0].toLowerCase())) ? 'list' : 'set';
                    if (action === 'set') {
                        role = interactionOrMessage.mentions.roles.first();
                        inputDungeon = args[1] ? args[1].toLowerCase() : "";
                        // هنا نعتمد القيمة الخام ونترك الترجمة للـ statMap
                        inputStat = args[2] ? args[2].toLowerCase() : null; 
                        percent = args[3] ? parseInt(args[3].replace('%', '')) : null;
                    }
                }

                if (action === 'list') {
                    const res = await db.query(`SELECT * FROM information_schema.tables WHERE table_name = 'race_dungeon_buffs'`);
                    if (res.rows.length === 0) return reply("ℹ️ **لا توجد أي ميزات مسجلة حتى الآن.**");

                    const allBuffsRes = await db.query(`SELECT * FROM race_dungeon_buffs WHERE "guildID" = $1`, [guild.id]);
                    const allBuffs = allBuffsRes.rows;
                    if (allBuffs.length === 0) return reply("ℹ️ **لا توجد ميزات نشطة حالياً في السيرفر.**");

                    const groupedBuffs = {};
                    allBuffs.forEach(buff => {
                        const roleID = buff.roleID || buff.roleid;
                        if (!groupedBuffs[roleID]) groupedBuffs[roleID] = [];
                        const dKey = buff.dungeonKey || buff.dungeonkey;
                        const sType = buff.statType || buff.stattype;
                        const bVal = buff.buffValue || buff.buffvalue;
                        const dungeonName = dungeonConfig.themes[dKey]?.name || dKey;
                        groupedBuffs[roleID].push(`**${dungeonName}:** ${getStatIcon(sType)} ${sType.toUpperCase()} +${bVal}%`);
                    });

                    const embed = new EmbedBuilder().setTitle(`📜 قائمة ميزات الأعراق المفعلة`).setColor(Colors.Blue).setFooter({ text: `عدد الرتب المفعلة: ${Object.keys(groupedBuffs).length}` });
                    let description = "";
                    for (const [roleID, buffs] of Object.entries(groupedBuffs)) {
                        const r = guild.roles.cache.get(roleID);
                        description += `### 🎭 ${r ? r.name : "رتبة محذوفة"}\n`;
                        description += buffs.map(b => `> ${b}`).join('\n') + "\n\n";
                    }
                    if (description.length > 4000) description = description.substring(0, 4000) + "...";
                    embed.setDescription(description || "لا يوجد بيانات.");
                    return reply({ embeds: [embed] });
                }

                if (action === 'set') {
                    if (!role) return reply("❌ **طريقة الاستخدام:** يرجى تحديد الرتبة.");
                    
                    // 🔥 تصحيح الـ stat: أخذنا الإدخال وترجمناه بشكل موحد وآمن 🔥
                    const statMap = { 'هجوم': 'atk', 'atk': 'atk', 'attack': 'atk', 'قوة': 'atk', 'اتش_بي': 'hp', 'hp': 'hp', 'صحة': 'hp', 'health': 'hp', 'حيوية': 'hp', 'دفاع': 'def', 'def': 'def', 'defense': 'def', 'صلابة': 'def', 'درع': 'shield', 'shield': 'shield', 'شفاء': 'lifesteal', 'lifesteal': 'lifesteal', 'امتصاص': 'lifesteal', 'كريت': 'crit', 'crit': 'crit', 'مهارة': 'crit', 'حرجة': 'crit' };
                    const stat = statMap[inputStat];
                    if (!stat) return reply("❌ **نوع الميزة غير صحيح!** الأنواع المتاحة (بالسلاش أو بالأمر العادي): هجوم، صحة، دفاع، درع، شفاء، كريت");
                    
                    if (percent === undefined || percent === null || isNaN(percent)) return reply("❌ **النسبة غير صحيحة أو مفقودة!**");

                    if (inputDungeon === 'الكل' || inputDungeon === 'all') {
                        const allDungeons = Object.keys(dungeonConfig.themes);
                        for (const dKey of allDungeons) {
                            await db.query(`DELETE FROM race_dungeon_buffs WHERE "guildID" = $1 AND "roleID" = $2 AND "dungeonKey" = $3`, [guild.id, role.id, dKey]).catch(()=>{});
                            if(percent !== 0) await db.query(`INSERT INTO race_dungeon_buffs ("guildID", "roleID", "dungeonKey", "statType", "buffValue") VALUES ($1, $2, $3, $4, $5)`, [guild.id, role.id, dKey, stat, percent]).catch(()=>{});
                        }
                        
                        if (percent === 0) return reply(`✅ تم إزالة ميزة ${stat.toUpperCase()} من رتبة ${role} في جميع الدانجونات.`);
                        
                        const embed = new EmbedBuilder().setTitle("✅ تم تفعيل ميزة العرق الشاملة").setColor(Colors.Gold).setDescription(`تم تخصيص الميزة لحاملي رتبة ${role} في **جـمـيـع الدانـجـونـات** 🌍!`)
                            .addFields({ name: '📈 الميزة (Stat)', value: `${getStatIcon(stat)} ${stat.toUpperCase()} +${percent}%`, inline: true })
                            .setFooter({ text: "نظام تعزيز الأعراق - EMorax" }).setTimestamp();
                        return reply({ embeds: [embed] });
                    }

                    const dungeonKey = Object.keys(dungeonConfig.themes).find(key => key === inputDungeon || dungeonConfig.themes[key].name.toLowerCase().includes(inputDungeon));
                    if (!dungeonKey) {
                        const valid = Object.keys(dungeonConfig.themes).map(k => dungeonConfig.themes[k].name).join('، ');
                        return reply(`❌ **اسم الدانجون غير صحيح!** المتاح: ${valid}، أو اكتب "الكل" لجميع الدانجونات.`);
                    }

                    await db.query(`DELETE FROM race_dungeon_buffs WHERE "guildID" = $1 AND "roleID" = $2 AND "dungeonKey" = $3`, [guild.id, role.id, dungeonKey]).catch(()=>{});
                    
                    if (percent === 0) return reply(`✅ تم إزالة ميزة ${stat.toUpperCase()} من رتبة ${role} في دانجون ${dungeonConfig.themes[dungeonKey].name}.`);
                    
                    await db.query(`INSERT INTO race_dungeon_buffs ("guildID", "roleID", "dungeonKey", "statType", "buffValue") VALUES ($1, $2, $3, $4, $5)`, [guild.id, role.id, dungeonKey, stat, percent]).catch(()=>{});
                    
                    const dungeonName = dungeonConfig.themes[dungeonKey]?.name || dungeonKey;
                    const embed = new EmbedBuilder().setTitle("✅ تم تفعيل ميزة العرق").setColor(Colors.Gold).setDescription(`تم تخصيص ميزة خاصة لحاملي رتبة ${role}`)
                        .addFields({ name: '🗺️ المكان (Dungeon)', value: `${dungeonName}`, inline: true }, { name: '📈 الميزة (Stat)', value: `${getStatIcon(stat)} ${stat.toUpperCase()} +${percent}%`, inline: true })
                        .setFooter({ text: "نظام تعزيز الأعراق - EMorax" }).setTimestamp();
                    return reply({ embeds: [embed] });
                }
            }
        } catch (err) {
            console.error("Game Admin Error:", err);
            return reply("❌ حدث خطأ داخلي.");
        }
    }
};
