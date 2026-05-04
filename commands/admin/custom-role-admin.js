const { PermissionsBitField, SlashCommandBuilder, EmbedBuilder, Colors, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require("discord.js");

function isValidHexColor(hex) {
    if (!hex) return false;
    return /^#[0-9A-F]{6}$/i.test(hex);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('custom-role-admin')
        .setDescription('إدارة وتكوين نظام الرتب المخصصة')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addSubcommandGroup(group => group.setName('setup').setDescription('إعدادات نظام الرتب المخصصة')
            .addSubcommand(sub => sub.setName('anchor').setDescription('تحديد الرتبة التي ستوضع الرتب الجديدة تحتها (عادة رتبة البوت).')
                .addRoleOption(opt => opt.setName('role').setDescription('الرتبة الثابتة').setRequired(true)))
            .addSubcommand(sub => sub.setName('add_allowed').setDescription('إضافة رتبة (مثل VIP) للسماح لأصحابها بإنشاء رتب.')
                .addRoleOption(opt => opt.setName('role').setDescription('الرتبة المسموحة').setRequired(true)))
            .addSubcommand(sub => sub.setName('remove_allowed').setDescription('إزالة رتبة من قائمة الرتب المسموحة.')
                .addRoleOption(opt => opt.setName('role').setDescription('الرتبة المراد إزالتها').setRequired(true)))
            .addSubcommand(sub => sub.setName('list_allowed').setDescription('عرض جميع الرتب المسموح لها بإنشاء رتب مخصصة.'))
        )
        .addSubcommandGroup(group => group.setName('register').setDescription('إدارة تسجيل الرتب الخاصة للأعضاء')
            .addSubcommand(sub => sub.setName('mass').setDescription('يسجل رتبة معينة لجميع الأعضاء الذين يملكونها حالياً.')
                .addRoleOption(opt => opt.setName('role').setDescription('الرتبة التي تريد تسجيلها للأعضاء').setRequired(true)))
            .addSubcommand(sub => sub.setName('single').setDescription('ربط رتبة بعضو محدد (يدوياً).')
                .addUserOption(opt => opt.setName('user').setDescription('العضو المالك للرتبة').setRequired(true))
                .addRoleOption(opt => opt.setName('role').setDescription('الرتبة المراد تسجيلها').setRequired(true)))
            .addSubcommand(sub => sub.setName('remove').setDescription('إلغاء ربط رتبة خاصة بعضو (لا يحذف الرتبة من السيرفر).')
                .addUserOption(opt => opt.setName('user').setDescription('العضو المراد إلغاء رتبته').setRequired(true)))
            .addSubcommand(sub => sub.setName('list').setDescription('عرض قائمة الرتب الخاصة المسجلة.'))
        )
        .addSubcommandGroup(group => group.setName('panel').setDescription('تخصيص ونشر لوحة الرتب المخصصة')
            .addSubcommand(sub => sub.setName('send').setDescription('ينشر لوحة إنشاء الرتب المخصصة بناءً على الإعدادات المحفوظة.'))
            .addSubcommand(sub => sub.setName('title').setDescription('تحديد عنوان اللوحة.')
                .addStringOption(opt => opt.setName('text').setDescription('نص العنوان الجديد').setRequired(true)))
            .addSubcommand(sub => sub.setName('desc').setDescription('تحديد الوصف (المحتوى الرئيسي) للوحة.')
                .addStringOption(opt => opt.setName('text').setDescription('اكتب الوصف كاملاً (استخدم \\n لسطر جديد)').setRequired(true)))
            .addSubcommand(sub => sub.setName('copy_desc').setDescription('نسخ محتوى رسالة موجودة واستخدامه كوصف للوحة.')
                .addStringOption(opt => opt.setName('link').setDescription('رابط الرسالة التي تريد نسخ محتواها').setRequired(true)))
            .addSubcommand(sub => sub.setName('image').setDescription('تحديد رابط الصورة (البانر) للوحة.')
                .addStringOption(opt => opt.setName('link').setDescription('رابط الصورة (يجب أن يبدأ بـ https://)').setRequired(true)))
            .addSubcommand(sub => sub.setName('color').setDescription('تحديد لون الشريط الجانبي للوحة.')
                .addStringOption(opt => opt.setName('hex').setDescription('كود اللون (مثل #FF0000)').setRequired(true)))
            .addSubcommand(sub => sub.setName('view_settings').setDescription('عرض الإعدادات الحالية للوحة.'))
        ),

    name: 'custom-role-admin',
    aliases: ['cradmin', 'scr', 'rcr', 'scrp', 'scps'],
    category: "Admin",

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        const client = interactionOrMessage.client;
        const db = client.sql;
        const guild = interactionOrMessage.guild;

        const member = interactionOrMessage.member;
        const user = isSlash ? interactionOrMessage.user : interactionOrMessage.author;

        if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            const err = '❌ ليس لديك صلاحية الإدارة!';
            return isSlash ? interactionOrMessage.reply({ content: err, ephemeral: true }) : interactionOrMessage.reply(err);
        }

        try {
            await db.query(`CREATE TABLE IF NOT EXISTS custom_role_permissions ("guildID" TEXT, "roleID" TEXT, PRIMARY KEY ("guildID", "roleID"))`);
            await db.query(`CREATE TABLE IF NOT EXISTS custom_roles ("id" TEXT PRIMARY KEY, "guildID" TEXT, "userID" TEXT, "roleID" TEXT)`);
            await db.query(`CREATE TABLE IF NOT EXISTS settings ("guild" TEXT PRIMARY KEY, "customRoleAnchorID" TEXT, "customRolePanelTitle" TEXT, "customRolePanelDescription" TEXT, "customRolePanelImage" TEXT, "customRolePanelColor" TEXT)`);
            await db.query(`INSERT INTO settings ("guild") VALUES ($1) ON CONFLICT ("guild") DO NOTHING`, [guild.id]);
        } catch(e) {}

        let group = '';
        let sub = '';

        if (isSlash) {
            group = interactionOrMessage.options.getSubcommandGroup();
            sub = interactionOrMessage.options.getSubcommand();
            await interactionOrMessage.deferReply({ ephemeral: true });
        } else {
            return interactionOrMessage.reply("هذا الأمر معقد ويحتاج إلى مدخلات دقيقة، يرجى استخدام أمر السلاش `/custom-role-admin`.");
        }

        const reply = async (payload) => interactionOrMessage.editReply(payload);

        try {
            if (group === 'setup') {
                if (sub === 'anchor') {
                    const role = interactionOrMessage.options.getRole('role');
                    await db.query(`UPDATE settings SET "customRoleAnchorID" = $1 WHERE "guild" = $2`, [role.id, guild.id]);
                    return reply(`✅ تم تحديد الرتبة الثابتة. جميع الرتب الجديدة ستكون تحت ${role}.`);
                }
                if (sub === 'add_allowed') {
                    const role = interactionOrMessage.options.getRole('role');
                    await db.query(`INSERT INTO custom_role_permissions ("guildID", "roleID") VALUES ($1, $2) ON CONFLICT DO NOTHING`, [guild.id, role.id]);
                    return reply(`✅ تم إضافة ${role} إلى الرتب المسموحة بإنشاء رتب مخصصة.`);
                }
                if (sub === 'remove_allowed') {
                    const role = interactionOrMessage.options.getRole('role');
                    const res = await db.query(`DELETE FROM custom_role_permissions WHERE "guildID" = $1 AND "roleID" = $2`, [guild.id, role.id]);
                    if (res.rowCount > 0) return reply(`✅ تم إزالة ${role} من الرتب المسموحة.`);
                    return reply("❌ هذه الرتبة غير موجودة في القائمة أصلاً.");
                }
                if (sub === 'list_allowed') {
                    const res = await db.query(`SELECT "roleID" FROM custom_role_permissions WHERE "guildID" = $1`, [guild.id]);
                    if (res.rows.length === 0) return reply("لا توجد رتب مسموحة محددة حالياً.");
                    const roleList = res.rows.map(r => `<@&${r.roleID || r.roleid}>`).join('\n');
                    const embed = new EmbedBuilder().setTitle("📜 الرتب المسموح لها بإنشاء رتب مخصصة").setColor(Colors.Blue).setDescription(roleList);
                    return reply({ embeds: [embed] });
                }
            }

            if (group === 'register') {
                if (sub === 'mass') {
                    const role = interactionOrMessage.options.getRole('role');
                    await guild.members.fetch(); 
                    const membersWithRole = role.members.filter(m => !m.user.bot); 
                    if (membersWithRole.size === 0) return reply(`⚠️ لا يوجد أي أعضاء (بشر) يمتلكون الرتبة ${role} حالياً.`);

                    let successCount = 0;
                    await db.query("BEGIN");
                    for (const [, mem] of membersWithRole) {
                        await db.query(`INSERT INTO custom_roles ("id", "guildID", "userID", "roleID") VALUES ($1, $2, $3, $4) ON CONFLICT ("id") DO UPDATE SET "roleID" = EXCLUDED."roleID"`, [`${guild.id}-${mem.id}`, guild.id, mem.id, role.id]);
                        successCount++;
                    }
                    await db.query("COMMIT");
                    return reply({ embeds: [new EmbedBuilder().setTitle("✅ تم التسجيل الجماعي بنجاح").setDescription(`تم تسجيل الرتبة ${role} لـ **${successCount}** عضو.\nالآن يمكنهم جميعاً التحكم بهذه الرتبة من خلال اللوحة.`).setColor(Colors.Green)] });
                }

                if (sub === 'single') {
                    const targetUser = interactionOrMessage.options.getUser('user');
                    const targetRole = interactionOrMessage.options.getRole('role');
                    await db.query(`INSERT INTO custom_roles ("id", "guildID", "userID", "roleID") VALUES ($1, $2, $3, $4) ON CONFLICT ("id") DO UPDATE SET "roleID" = EXCLUDED."roleID"`, [`${guild.id}-${targetUser.id}`, guild.id, targetUser.id, targetRole.id]);
                    return reply(`✅ تم تسجيل الرتبة ${targetRole} للعضو ${targetUser} بنجاح.`);
                }

                if (sub === 'remove') {
                    const targetUser = interactionOrMessage.options.getUser('user');
                    const res = await db.query(`DELETE FROM custom_roles WHERE "guildID" = $1 AND "userID" = $2`, [guild.id, targetUser.id]);
                    if (res.rowCount > 0) return reply(`✅ تم إلغاء تسجيل الرتبة الخاصة للعضو ${targetUser}.`);
                    return reply(`❌ هذا العضو ليس لديه رتبة مسجلة.`);
                }

                if (sub === 'list') {
                    const res = await db.query(`SELECT "userID", "roleID" FROM custom_roles WHERE "guildID" = $1`, [guild.id]);
                    if (res.rows.length === 0) return reply("📭 لا توجد أي رتب خاصة مسجلة.");

                    let currentPage = 1;
                    const itemsPerPage = 10;
                    const totalPages = Math.ceil(res.rows.length / itemsPerPage);

                    const generateEmbed = (page) => {
                        const startIndex = (page - 1) * itemsPerPage;
                        const pageItems = res.rows.slice(startIndex, startIndex + itemsPerPage);
                        const description = pageItems.map((item, index) => `**${startIndex + index + 1}.** <@${item.userID || item.userid}> : <@&${item.roleID || item.roleid}>`).join('\n');
                        return new EmbedBuilder().setTitle(`📜 الرتب المسجلة (${res.rows.length})`).setDescription(description || "لا يوجد").setFooter({ text: `صفحة ${page} من ${totalPages}` }).setColor(Colors.Blue);
                    };

                    const getButtons = (page) => {
                        return new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId('prev_page').setEmoji('<:left:1439164494759723029>').setStyle(ButtonStyle.Secondary).setDisabled(page === 1),
                            new ButtonBuilder().setCustomId('next_page').setEmoji('<:right:1439164491072929915>').setStyle(ButtonStyle.Secondary).setDisabled(page === totalPages)
                        );
                    };

                    const msg = await interactionOrMessage.editReply({ embeds: [generateEmbed(currentPage)], components: [getButtons(currentPage)] });

                    if (totalPages > 1) {
                        const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });
                        collector.on('collect', async i => {
                            if (i.user.id !== user.id) return i.reply({ content: "هذه القائمة ليست لك.", ephemeral: true });
                            if (i.customId === 'prev_page' && currentPage > 1) currentPage--;
                            if (i.customId === 'next_page' && currentPage < totalPages) currentPage++;
                            await i.update({ embeds: [generateEmbed(currentPage)], components: [getButtons(currentPage)] });
                        });
                        collector.on('end', () => msg.edit({ components: [] }).catch(() => {}));
                    }
                    return;
                }
            }

            if (group === 'panel') {
                if (sub === 'send') {
                    const res = await db.query(`SELECT * FROM settings WHERE "guild" = $1`, [guild.id]);
                    const settings = res.rows[0] || {};

                    const title = settings.customRolePanelTitle || settings.customrolepaneltitle || '✶ انـشـاء رتـبـة خـاصـة';
                    const description = settings.customRolePanelDescription || settings.customrolepaneldescription || `**✥ هنا يمكنك انشاء رتبتك الخاصة والتعديل عليها**\n- استخدم الأزرار أدناه لإنشاء رتبتك، تغيير اسمها، لونها، أو أيقونتها.\n- يجب أن تمتلك إحدى الرتب المسموحة لاستخدام هذه الميزة.`;
                    
                    const colorHex = settings.customRolePanelColor || settings.customrolepanelcolor;
                    const color = colorHex ? parseInt(colorHex.replace('#', ''), 16) : 0x5d92ff;
                    const image = settings.customRolePanelImage || settings.customrolepanelimage || null;

                    const embed = new EmbedBuilder().setTitle(title).setDescription(description).setColor(color);
                    if (image) embed.setImage(image);

                    const row1 = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('customrole_create').setLabel('انـشـاء رتـبـة').setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId('customrole_change_name').setLabel('تـغـييـر الاسـم').setStyle(ButtonStyle.Secondary)
                    );
                    const row2 = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('customrole_change_color').setLabel('تغـييـر اللـون').setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId('customrole_change_icon').setLabel('تغييـر الصـورة').setStyle(ButtonStyle.Secondary)
                    );
                    const row3 = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('customrole_add_self').setLabel('اضـافــة').setStyle(ButtonStyle.Success),
                        new ButtonBuilder().setCustomId('customrole_remove_self').setLabel('ازالـــة').setStyle(ButtonStyle.Danger)
                    );

                    try {
                        await interactionOrMessage.channel.send({ embeds: [embed], components: [row1, row2, row3] });
                        return reply({ content: '✅ تم نشر اللوحة.', ephemeral: true });
                    } catch (e) {
                        return reply("فشل نشر اللوحة. تأكد من أن البوت لديه صلاحية `Embed Links` و `Send Messages`.");
                    }
                }

                if (sub === 'title') {
                    const value = interactionOrMessage.options.getString('text');
                    await db.query(`UPDATE settings SET "customRolePanelTitle" = $1 WHERE "guild" = $2`, [value, guild.id]);
                    return reply(`✅ تم تحديث **العنوان** بنجاح.`);
                }

                if (sub === 'desc') {
                    const value = interactionOrMessage.options.getString('text');
                    await db.query(`UPDATE settings SET "customRolePanelDescription" = $1 WHERE "guild" = $2`, [value, guild.id]);
                    return reply(`✅ تم تحديث **الوصف** بنجاح.`);
                }

                if (sub === 'copy_desc') {
                    const link = interactionOrMessage.options.getString('link');
                    const match = link.match(/discord\.com\/channels\/(\d+)\/(\d+)\/(\d+)/);
                    if (!match) return reply("الرابط غير صالح. الرجاء نسخ رابط الرسالة (Message Link).");
                    
                    const [, guildId, channelId, messageId] = match;
                    if (guildId !== guild.id) return reply("هذه الرسالة من سيرفر آخر.");

                    try {
                        const fetchedChannel = await client.channels.fetch(channelId);
                        if (!fetchedChannel || !fetchedChannel.isTextBased()) return reply("القناة الموجودة في الرابط غير صالحة.");
                        const fetchedMessage = await fetchedChannel.messages.fetch(messageId);
                        if (!fetchedMessage || !fetchedMessage.content) return reply("لم أتمكن من العثور على محتوى في هذه الرسالة.");

                        await db.query(`UPDATE settings SET "customRolePanelDescription" = $1 WHERE "guild" = $2`, [fetchedMessage.content, guild.id]);
                        return reply(`✅ تم نسخ الوصف بنجاح من الرسالة.`);
                    } catch (e) {
                        return reply("فشل في جلب الرسالة. تأكد من الرابط والصلاحيات.");
                    }
                }

                if (sub === 'image') {
                    const value = interactionOrMessage.options.getString('link');
                    if (!value.startsWith('https://')) return reply("الرابط غير صالح، يجب أن يبدأ بـ `https://`.");
                    await db.query(`UPDATE settings SET "customRolePanelImage" = $1 WHERE "guild" = $2`, [value, guild.id]);
                    return reply(`✅ تم تحديث **الصورة** بنجاح.`);
                }

                if (sub === 'color') {
                    const value = interactionOrMessage.options.getString('hex');
                    if (!isValidHexColor(value)) return reply("كود اللون غير صالح. يجب أن يكون بصيغة HEX (مثل #FFFFFF).");
                    await db.query(`UPDATE settings SET "customRolePanelColor" = $1 WHERE "guild" = $2`, [value, guild.id]);
                    return reply(`✅ تم تحديث **اللون** بنجاح.`);
                }

                if (sub === 'view_settings') {
                    const res = await db.query(`SELECT * FROM settings WHERE "guild" = $1`, [guild.id]);
                    const settings = res.rows[0] || {};
                    const colorHex = settings.customRolePanelColor || settings.customrolepanelcolor;
                    
                    const embed = new EmbedBuilder()
                        .setTitle("الإعدادات الحالية للوحة الرتب المخصصة")
                        .setColor(colorHex ? parseInt(colorHex.replace('#', ''), 16) : Colors.Blue)
                        .addFields(
                            { name: "العنوان", value: settings.customRolePanelTitle || settings.customrolepaneltitle || "*(لم يحدد)*" },
                            { name: "الوصف", value: (settings.customRolePanelDescription || settings.customrolepaneldescription || "*(لم يحدد)*").substring(0, 1020) + "..." },
                            { name: "اللون", value: colorHex || "*(لم يحدد)*" }
                        )
                        .setImage(settings.customRolePanelImage || settings.customrolepanelimage || null);
                    return reply({ embeds: [embed] });
                }
            }

        } catch (err) {
            console.error("Custom Role Admin Error:", err);
            return reply("❌ حدث خطأ داخلي أثناء حفظ الإعدادات.");
        }
    }
};
