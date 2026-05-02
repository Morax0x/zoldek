const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const db = require('../database');

const getRandomColor = () => `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`;

const isValidDate = (d, m) => {
    if (m < 1 || m > 12 || d < 1 || d > 31) return false;
    if (m === 2 && d > 29) return false;
    if ([4, 6, 9, 11].includes(m) && d > 30) return false;
    return true;
};

async function sendBirthdayView(targetUser, guildId, interactionOrMessage, isPrefix = false) {
    const serverIcon = interactionOrMessage.guild?.iconURL({ dynamic: true }) || undefined;
    const result = await db.query('SELECT "day", "month", "year" FROM user_birthdays WHERE "userID" = $1 AND "guildID" = $2', [targetUser.id, guildId]);

    if (result.rows.length === 0 || !result.rows[0].day) {
        const msg = `❌ لم يتم توثيق تاريخ الميلاد في سجلات الإمبراطورية بعد.`;
        if (isPrefix) return interactionOrMessage.reply(msg);
        return interactionOrMessage.reply({ content: msg, flags: MessageFlags.Ephemeral });
    }

    const { day: bDay, month: bMonth, year: bYear } = result.rows[0];
    const today = new Date();
    const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    
    let nextBirthday = new Date(today.getFullYear(), bMonth - 1, bDay);
    if (todayDateOnly > nextBirthday) {
        nextBirthday.setFullYear(today.getFullYear() + 1);
    }

    const diffTime = nextBirthday - todayDateOnly;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    // حساب العمر الدقيق والتاريخ الهجري 👑
    let ageText = '';
    let exactYears = 0, exactMonths = 0, exactDays = 0;
    let hijriDateStr = 'غير معروف';
    let hijriAge = 0;

    if (bYear) {
        const birthDate = new Date(bYear, bMonth - 1, bDay);
        
        exactYears = today.getFullYear() - birthDate.getFullYear();
        exactMonths = today.getMonth() - birthDate.getMonth();
        exactDays = today.getDate() - birthDate.getDate();

        if (exactDays < 0) {
            exactMonths--;
            const prevMonth = new Date(today.getFullYear(), today.getMonth(), 0);
            exactDays += prevMonth.getDate();
        }
        if (exactMonths < 0) {
            exactYears--;
            exactMonths += 12;
        }
        
        ageText = `\n✶ الـعـمـر: ${exactYears} عـام ⭐`;
        
        // التحويل للهجري
        try {
            hijriDateStr = new Intl.DateTimeFormat('ar-SA-u-ca-islamic', { day: 'numeric', month: 'long', year: 'numeric' }).format(birthDate);
            const tHijriYear = parseInt(new Intl.DateTimeFormat('en-US-u-ca-islamic', { year: 'numeric' }).format(today));
            const bHijriYear = parseInt(new Intl.DateTimeFormat('en-US-u-ca-islamic', { year: 'numeric' }).format(birthDate));
            hijriAge = tHijriYear - bHijriYear;
        } catch (e) {
            hijriDateStr = 'تعذر الحساب';
        }
    } else {
        try {
            const dummyBirthDate = new Date(today.getFullYear(), bMonth - 1, bDay);
            hijriDateStr = new Intl.DateTimeFormat('ar-SA-u-ca-islamic', { day: 'numeric', month: 'long' }).format(dummyBirthDate);
        } catch (e) {}
    }

    const displayYear = bYear ? `/${bYear}` : '';
    const dateString = `${String(bDay).padStart(2, '0')}/${String(bMonth).padStart(2, '0')}${displayYear}`;

    // 1️⃣ الوصف للواجهة الرئيسية (الميلادي)
    const viewDesc = `✶ تـاريـخ ميلاد: ${targetUser}\n` +
                     `✶ يصـادف: ${dateString}${ageText}\n` +
                     `✶ متبقـي عليه: ${diffDays} يـوم 🪄`;

    // 2️⃣ الوصف للواجهة الهجرية
    const hijriAgeText = bYear ? `\n✶ الـعـمـر (بالهجري): ${hijriAge} عـام 🌙` : '';
    const hDesc = `✶ تـاريـخ ميلاد: ${targetUser}\n` +
                  `✶ بالهجري: ${hijriDateStr}${hijriAgeText}\n` +
                  `✶ متبقـي عليه (بالميلادي): ${diffDays} يـوم 🪄`;

    // 3️⃣ الوصف لواجهة التفاصيل والأيام
    const daysOfWeek = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const nextDayName = daysOfWeek[nextBirthday.getDay()];
    const nextDateFmt = `${nextBirthday.getFullYear()}-${String(bMonth).padStart(2, '0')}-${String(bDay).padStart(2, '0')}`;
    
    let detailsText = '';
    if (bYear) {
        detailsText = `\n\n**العمر بالتفصيل:** ${exactYears} سنة و ${exactMonths} شهر و ${exactDays} يوم\n`;
    }
    detailsText += `سيكون عيد ميلادك يوم **${nextDayName}** الموافق ${nextDateFmt}`;
    const dDesc = viewDesc + detailsText;

    // تجهيز الإمبيدات مسبقاً
    const mainEmbed = new EmbedBuilder()
        .setColor(getRandomColor())
        .setTitle('✥ سجل مولـيـد الامبراطوريـة 👑')
        .setDescription(viewDesc)
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
        .setFooter({ text: 'Empire | الامبراطورية ™', iconURL: serverIcon });

    const hijriEmbed = EmbedBuilder.from(mainEmbed).setDescription(hDesc);
    const detailsEmbed = EmbedBuilder.from(mainEmbed).setDescription(dDesc);

    // دالة ذكية لتحديث حالة الأزرار
    const getRow = (activeView) => {
        return new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_main').setEmoji('🎂').setStyle(ButtonStyle.Secondary).setDisabled(activeView === 'main'),
            new ButtonBuilder().setCustomId('btn_hijri').setEmoji('🌙').setStyle(ButtonStyle.Secondary).setDisabled(activeView === 'hijri'),
            new ButtonBuilder().setCustomId('btn_details').setEmoji('🍀').setStyle(ButtonStyle.Secondary).setDisabled(activeView === 'details')
        );
    };

    let sentMsg;
    if (isPrefix) {
        sentMsg = await interactionOrMessage.reply({ embeds: [mainEmbed], components: [getRow('main')] });
    } else {
        if (interactionOrMessage.deferred || interactionOrMessage.replied) {
            sentMsg = await interactionOrMessage.followUp({ embeds: [mainEmbed], components: [getRow('main')], fetchReply: true });
        } else {
            sentMsg = await interactionOrMessage.reply({ embeds: [mainEmbed], components: [getRow('main')], fetchReply: true });
        }
    }

    const collector = sentMsg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 120000 });

    collector.on('collect', async i => {
        if (i.user.id !== (isPrefix ? interactionOrMessage.author.id : interactionOrMessage.user.id)) {
            return i.reply({ content: '❌ هذه الأزرار مخصصة لصاحب الأمر فقط.', flags: MessageFlags.Ephemeral });
        }

        // التحديث السلس لنفس الرسالة 👑
        if (i.customId === 'btn_main') {
            await i.update({ embeds: [mainEmbed], components: [getRow('main')] });
        } 
        else if (i.customId === 'btn_hijri') {
            await i.update({ embeds: [hijriEmbed], components: [getRow('hijri')] });
        } 
        else if (i.customId === 'btn_details') {
            await i.update({ embeds: [detailsEmbed], components: [getRow('details')] });
        }
    });

    collector.on('end', () => {
        sentMsg.edit({ components: [getRow('disabled')] }).catch(()=>{});
    });
}

module.exports = {
    name: 'ميلاد',
    aliases: ['عمر', 'عمري', 'ميلادي', 'عيد_ميلاد'], // 👑 تمت إضافة الاختصارات هنا
    description: '🎂 أوامر أعياد الميلاد',
    
    data: new SlashCommandBuilder()
        .setName('birthday')
        .setDescription('🎂 أوامر أعياد الميلاد والإعدادات')
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('تعيين تاريخ ميلادك (لا يمكنك تغييره لاحقاً)')
                .addIntegerOption(option => 
                    option.setName('day').setDescription('يوم الميلاد (1-31)').setRequired(true).setMinValue(1).setMaxValue(31))
                .addIntegerOption(option => 
                    option.setName('month').setDescription('شهر الميلاد (1-12)').setRequired(true).setMinValue(1).setMaxValue(12))
                .addIntegerOption(option => 
                    // 👑 تحديد الحد الأدنى للسنة 1950
                    option.setName('year').setDescription('عام الميلاد (اختياري، لحساب العمر)').setRequired(false).setMinValue(1950).setMaxValue(new Date().getFullYear()))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('عرض تاريخ الميلاد')
                .addUserOption(option => 
                    option.setName('user').setDescription('المستخدم المراد عرض تاريخ ميلاده').setRequired(false))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('admin_set')
                .setDescription('تعديل تاريخ ميلاد لاعب (للإدارة فقط)')
                .addUserOption(option => option.setName('user').setDescription('المستخدم المراد تعديله').setRequired(true))
                .addIntegerOption(option => option.setName('day').setDescription('يوم الميلاد').setRequired(true).setMinValue(1).setMaxValue(31))
                .addIntegerOption(option => option.setName('month').setDescription('شهر الميلاد').setRequired(true).setMinValue(1).setMaxValue(12))
                .addIntegerOption(option => option.setName('year').setDescription('عام الميلاد (اختياري)').setRequired(false).setMinValue(1950).setMaxValue(new Date().getFullYear()))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('admin_setup')
                .setDescription('إعداد قناة الاحتفال ورتبة أمير الميلاد (للإدارة فقط)')
                .addChannelOption(option => option.setName('channel').setDescription('القناة التي سيتم إرسال التهنئة فيها').setRequired(true))
                .addRoleOption(option => option.setName('role').setDescription('رتبة أمير الميلاد').setRequired(false))
        ),

    async execute(interaction, arg2, arg3) {
        if (!interaction.options || typeof interaction.options.getSubcommand !== 'function') {
            const message = interaction.content !== undefined ? interaction : arg2;
            const args = interaction.content !== undefined ? arg2 : arg3;
            if (this.executePrefix) return this.executePrefix(message.client, message, args);
            return;
        }

        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;
        const serverIcon = interaction.guild.iconURL({ dynamic: true }) || undefined;

        if (subcommand === 'set') {
            const day = interaction.options.getInteger('day');
            const month = interaction.options.getInteger('month');
            const year = interaction.options.getInteger('year') || null;

            if (!isValidDate(day, month)) {
                return interaction.reply({ content: '❌ تاريخ غير صالح! يرجى التأكد من الأيام.', flags: MessageFlags.Ephemeral });
            }

            try {
                const checkUser = await db.query('SELECT "day" FROM user_birthdays WHERE "userID" = $1 AND "guildID" = $2', [interaction.user.id, guildId]);
                if (checkUser.rows.length > 0 && checkUser.rows[0].day) {
                    return interaction.reply({ content: '❌ **لقد قمت بتعيين تاريخ ميلادك مسبقاً!**\nإذا كان هناك خطأ، تواصل مع الإدارة.', flags: MessageFlags.Ephemeral });
                }

                let confirmDateStr = year ? `عـام ${year} / شـهـر ${month} / يـوم ${day}` : `شـهـر ${month} / يـوم ${day}`;
                const displayYear = year ? `/${year}` : '';
                const normalDateString = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}${displayYear}`;
                
                const today = new Date();
                const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                
                let ageText = '';
                if (year) {
                    const birthDate = new Date(year, month - 1, day);
                    let exactYears = today.getFullYear() - birthDate.getFullYear();
                    let exactMonths = today.getMonth() - birthDate.getMonth();
                    let exactDays = today.getDate() - birthDate.getDate();

                    if (exactDays < 0) {
                        exactMonths--;
                        const prevMonth = new Date(today.getFullYear(), today.getMonth(), 0);
                        exactDays += prevMonth.getDate();
                    }
                    if (exactMonths < 0) {
                        exactYears--;
                        exactMonths += 12;
                    }
                    ageText = `\n✶ عـمرك الان: ${exactYears} عـام ⭐`;
                }

                let nextBirthday = new Date(today.getFullYear(), month - 1, day);
                if (todayDateOnly > nextBirthday) nextBirthday.setFullYear(today.getFullYear() + 1);
                
                const diffTime = nextBirthday - todayDateOnly;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                const confirmDesc = `✬ هـل انـت متأكد من المعلومات التالية؟ - لا يمكنك تغييرها لاحقًا\n\n` +
                                    `✶ تـاريـخ: ${confirmDateStr}\n` +
                                    (ageText ? `${ageText.trim()}\n` : '') +
                                    `✶ يـوم ميلادك القـادم: ${diffDays} يـوم 🪄`;

                const confirmEmbed = new EmbedBuilder()
                    .setColor(getRandomColor())
                    .setDescription(confirmDesc)
                    .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
                    .setFooter({ text: 'Empire | الامبراطورية ™', iconURL: serverIcon });

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('confirm_bday_sl').setLabel('تـأكيـد').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('cancel_bday_sl').setLabel('رفـض').setStyle(ButtonStyle.Danger)
                );

                const response = await interaction.reply({ embeds: [confirmEmbed], components: [row] });
                const collector = response.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });

                collector.on('collect', async i => {
                    if (i.user.id !== interaction.user.id) {
                        return i.reply({ content: '❌ هذه الأزرار مخصصة لصاحب الأمر فقط.', flags: MessageFlags.Ephemeral });
                    }

                    if (i.customId === 'confirm_bday_sl') {
                        await db.query(`INSERT INTO user_birthdays ("userID", "guildID", "day", "month", "year") VALUES ($1, $2, $3, $4, $5) ON CONFLICT ("userID", "guildID") DO UPDATE SET "day" = EXCLUDED."day", "month" = EXCLUDED."month", "year" = EXCLUDED."year"`, [interaction.user.id, guildId, day, month, year]);
                        
                        const successEmbed = new EmbedBuilder()
                            .setColor(getRandomColor())
                            .setTitle('✥ سـُجـل تـاريـخ ميلادك في سجلات الامبراطوريـة 👑')
                            .setDescription(`✶ تـم تعييـن: ${normalDateString} كـ تاريـخ ميـلادك\n` + (ageText ? `${ageText.trim()}\n` : '') + `✶ يـوم ميلادك القـادم: ${diffDays} يـوم 🪄`)
                            .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
                            .setFooter({ text: 'Empire | الامبراطورية ™', iconURL: serverIcon });

                        await i.update({ embeds: [successEmbed], components: [] });
                    } else {
                        await i.update({ content: '❌ تم رفض عملية التسجيل.', embeds: [], components: [] });
                    }
                });

                collector.on('end', collected => {
                    if (collector.endReason === 'time' && collected.size === 0) {
                        interaction.editReply({ content: '⏱️ انتهى وقت التأكيد وتم الإلغاء.', embeds: [], components: [] }).catch(()=>{});
                    }
                });

            } catch (error) {
                await interaction.followUp({ content: '❌ حدث خطأ داخلي.', flags: MessageFlags.Ephemeral });
            }

        } else if (subcommand === 'admin_set') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return interaction.reply({ content: '.', flags: MessageFlags.Ephemeral }).then(msg => msg.delete().catch(() => {}));
            }

            const targetUser = interaction.options.getUser('user');
            const day = interaction.options.getInteger('day');
            const month = interaction.options.getInteger('month');
            const year = interaction.options.getInteger('year') || null;

            if (!isValidDate(day, month)) return interaction.reply({ content: '❌ تاريخ غير صالح!', flags: MessageFlags.Ephemeral });

            await db.query(`INSERT INTO user_birthdays ("userID", "guildID", "day", "month", "year") VALUES ($1, $2, $3, $4, $5) ON CONFLICT ("userID", "guildID") DO UPDATE SET "day" = EXCLUDED."day", "month" = EXCLUDED."month", "year" = EXCLUDED."year"`, [targetUser.id, guildId, day, month, year]);
            const displayYear = year ? `/${year}` : '';
            await interaction.reply({ content: `✅ تم تعديل ميلاد **${targetUser.username}** إدارياً إلى: **${day}/${month}${displayYear}** 🎂`, flags: MessageFlags.Ephemeral });
            
        } else if (subcommand === 'admin_setup') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return interaction.reply({ content: '.', flags: MessageFlags.Ephemeral }).then(msg => msg.delete().catch(() => {}));
            }

            const channel = interaction.options.getChannel('channel');
            const role = interaction.options.getRole('role');
            await db.query(`INSERT INTO birthday_settings ("guildID", "channelID", "roleID") VALUES ($1, $2, $3) ON CONFLICT ("guildID") DO UPDATE SET "channelID" = EXCLUDED."channelID", "roleID" = EXCLUDED."roleID"`, [guildId, channel.id, role ? role.id : null]);
            await interaction.reply({ content: `✅ تم تحديد قناة الاحتفالات: ${channel}` + (role ? `\n✅ وتم تحديد رتبة أمير الميلاد: ${role}` : ''), flags: MessageFlags.Ephemeral });

        } else if (subcommand === 'view') {
            const targetUser = interaction.options.getUser('user') || interaction.user;
            await sendBirthdayView(targetUser, guildId, interaction, false);
        }
    },

    async executePrefix(client, message, args) {
        const guildId = message.guild.id;
        const serverIcon = message.guild.iconURL({ dynamic: true }) || undefined;

        if (message.mentions.users.size > 0) {
            const targetUser = message.mentions.users.first();
            return await sendBirthdayView(targetUser, guildId, message, true);
        }

        const checkUser = await db.query('SELECT "day" FROM user_birthdays WHERE "userID" = $1 AND "guildID" = $2', [message.author.id, guildId]);
        if (checkUser.rows.length > 0 && checkUser.rows[0].day) {
            return await sendBirthdayView(message.author, guildId, message, true);
        }

        const setupEmbed = new EmbedBuilder()
            .setColor(getRandomColor())
            .setTitle('✥ وثـق ميلادك في سجلات الامبراطوريـة')
            .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
            .setFooter({ text: 'Empire | الامبراطورية ™', iconURL: serverIcon });

        const setupBtn = new ButtonBuilder()
            .setCustomId(`open_bday_modal_${message.author.id}`)
            .setLabel('تعيين تاريخ الميلاد')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📅');

        const setupRow = new ActionRowBuilder().addComponents(setupBtn);

        const setupMsg = await message.reply({ embeds: [setupEmbed], components: [setupRow] });

        const setupCollector = setupMsg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 120000 });

        setupCollector.on('collect', async i => {
            if (i.user.id !== message.author.id) {
                return i.reply({ content: '❌ هذه الأزرار مخصصة لصاحب الأمر فقط.', flags: MessageFlags.Ephemeral });
            }

            const modal = new ModalBuilder()
                .setCustomId(`bday_modal_${message.author.id}`)
                .setTitle('تعيين تاريخ الميلاد');

            const dayInput = new TextInputBuilder()
                .setCustomId('bday_day')
                .setLabel('اليـوم')
                .setPlaceholder('مثال: 15')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(2);

            const monthInput = new TextInputBuilder()
                .setCustomId('bday_month')
                .setLabel('الشـهـر')
                .setPlaceholder('مثال: 8')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(2);

            const yearInput = new TextInputBuilder()
                .setCustomId('bday_year')
                .setLabel('السنـة - اختـياري')
                .setPlaceholder('مثال: 2001')
                .setStyle(TextInputStyle.Short)
                .setRequired(false)
                .setMaxLength(4);

            modal.addComponents(
                new ActionRowBuilder().addComponents(dayInput),
                new ActionRowBuilder().addComponents(monthInput),
                new ActionRowBuilder().addComponents(yearInput)
            );

            await i.showModal(modal);

            try {
                const modalSubmit = await i.awaitModalSubmit({
                    filter: mi => mi.customId === `bday_modal_${message.author.id}`,
                    time: 120000
                });

                const day = parseInt(modalSubmit.fields.getTextInputValue('bday_day'));
                const month = parseInt(modalSubmit.fields.getTextInputValue('bday_month'));
                const yearStr = modalSubmit.fields.getTextInputValue('bday_year');
                const year = yearStr ? parseInt(yearStr) : null;

                if (isNaN(day) || isNaN(month) || !isValidDate(day, month)) {
                    return modalSubmit.reply({ content: '❌ تاريخ غير صالح! يرجى التأكد من الأيام.', flags: MessageFlags.Ephemeral });
                }

                // 👑 حماية العمر (السنوات)
                if (year && (isNaN(year) || year < 1950 || year > new Date().getFullYear())) {
                    return modalSubmit.reply({ content: '❌ عام غير صالح! يرجى إدخال سنة ميلاد صحيحة (مثال: 2001).', flags: MessageFlags.Ephemeral });
                }

                let confirmDateStr = year ? `عـام ${year} / شـهـر ${month} / يـوم ${day}` : `شـهـر ${month} / يـوم ${day}`;
                const displayYear = year ? `/${year}` : '';
                const normalDateString = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}${displayYear}`;
                
                const today = new Date();
                const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                
                let ageText = '';
                if (year) {
                    const birthDate = new Date(year, month - 1, day);
                    let exactYears = today.getFullYear() - birthDate.getFullYear();
                    let exactMonths = today.getMonth() - birthDate.getMonth();
                    let exactDays = today.getDate() - birthDate.getDate();

                    if (exactDays < 0) {
                        exactMonths--;
                        const prevMonth = new Date(today.getFullYear(), today.getMonth(), 0);
                        exactDays += prevMonth.getDate();
                    }
                    if (exactMonths < 0) {
                        exactYears--;
                        exactMonths += 12;
                    }
                    
                    ageText = `\n✶ عـمرك الان: ${exactYears} عـام ⭐`;
                }

                let nextBirthday = new Date(today.getFullYear(), month - 1, day);
                if (todayDateOnly > nextBirthday) nextBirthday.setFullYear(today.getFullYear() + 1);
                
                const diffTime = nextBirthday - todayDateOnly;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                const confirmDesc = `✬ هـل انـت متأكد من المعلومات التالية؟ - لا يمكنك تغييرها لاحقًا\n\n` +
                                    `✶ تـاريـخ: ${confirmDateStr}\n` +
                                    (ageText ? `${ageText.trim()}\n` : '') +
                                    `✶ يـوم ميلادك القـادم: ${diffDays} يـوم 🪄`;

                const confirmEmbed = new EmbedBuilder()
                    .setColor(getRandomColor())
                    .setDescription(confirmDesc)
                    .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
                    .setFooter({ text: 'Empire | الامبراطورية ™', iconURL: serverIcon });

                const confirmRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`confirm_bday_pf_${message.author.id}`).setLabel('تـأكيـد').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId(`cancel_bday_pf_${message.author.id}`).setLabel('رفـض').setStyle(ButtonStyle.Danger)
                );

                await modalSubmit.reply({ embeds: [confirmEmbed], components: [confirmRow] });
                setupMsg.delete().catch(()=>{});

                const confirmMsg = await modalSubmit.fetchReply();
                const confirmCollector = confirmMsg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });

                confirmCollector.on('collect', async ci => {
                    if (ci.user.id !== message.author.id) {
                        return ci.reply({ content: '❌ هذه الأزرار مخصصة لصاحب الأمر فقط.', flags: MessageFlags.Ephemeral });
                    }

                    if (ci.customId.startsWith('confirm_bday_pf')) {
                        await db.query(`INSERT INTO user_birthdays ("userID", "guildID", "day", "month", "year") VALUES ($1, $2, $3, $4, $5) ON CONFLICT ("userID", "guildID") DO UPDATE SET "day" = EXCLUDED."day", "month" = EXCLUDED."month", "year" = EXCLUDED."year"`, [message.author.id, guildId, day, month, year]);
                        
                        const successEmbed = new EmbedBuilder()
                            .setColor(getRandomColor())
                            .setTitle('✥ سـُجـل تـاريـخ ميلادك في سجلات الامبراطوريـة 👑')
                            .setDescription(`✶ تـم تعييـن: ${normalDateString} كـ تاريـخ ميـلادك\n` + (ageText ? `${ageText.trim()}\n` : '') + `✶ يـوم ميلادك القـادم: ${diffDays} يـوم 🪄`)
                            .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
                            .setFooter({ text: 'Empire | الامبراطورية ™', iconURL: serverIcon });

                        await ci.update({ embeds: [successEmbed], components: [] });
                    } else {
                        await ci.update({ content: '❌ تم رفض عملية التسجيل.', embeds: [], components: [] });
                    }
                });

                confirmCollector.on('end', collected => {
                    if (confirmCollector.endReason === 'time' && collected.size === 0) {
                        confirmMsg.edit({ content: '⏱️ انتهى وقت التأكيد وتم الإلغاء.', embeds: [], components: [] }).catch(()=>{});
                    }
                });

            } catch (e) {
            }
        });
    }
};
