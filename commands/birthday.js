const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags, PermissionFlagsBits } = require('discord.js');
const db = require('../database');

const getRandomColor = () => `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`;

const isValidDate = (d, m) => {
    if (m < 1 || m > 12 || d < 1 || d > 31) return false;
    if (m === 2 && d > 29) return false;
    if ([4, 6, 9, 11].includes(m) && d > 30) return false;
    return true;
};

// الدالة المسؤولة عن عرض الإيمبد الخاص بالميلاد (تستخدم في السلاش والنصي)
async function sendBirthdayView(targetUser, guildId, interactionOrMessage, isPrefix = false) {
    const serverIcon = interactionOrMessage.guild.iconURL({ dynamic: true }) || undefined;
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
    
    let ageText = '';
    if (bYear) {
        let age = today.getFullYear() - bYear;
        if (today.getMonth() + 1 < bMonth || (today.getMonth() + 1 === bMonth && today.getDate() < bDay)) {
            age--;
        }
        ageText = `\n✶ الـعـمـر: ${age} عـام ⭐`;
    }

    const displayYear = bYear ? `/${bYear}` : '';
    const dateString = `${String(bDay).padStart(2, '0')}/${String(bMonth).padStart(2, '0')}${displayYear}`;

    const viewDesc = `✶ تـاريـخ ميلاد: ${targetUser}\n` +
                     `✶ يصـادف: ${dateString}${ageText}\n` +
                     `✶ متبقـي عليه: ${diffDays} يـوم 🪄`;

    const viewEmbed = new EmbedBuilder()
        .setColor(getRandomColor())
        .setTitle('✥ سجل مولـيـد الامبراطوريـة 👑')
        .setDescription(viewDesc)
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
        .setFooter({ text: 'Empire | الامبراطورية ™', iconURL: serverIcon });

    if (isPrefix) return interactionOrMessage.reply({ embeds: [viewEmbed] });
    return interactionOrMessage.reply({ embeds: [viewEmbed] });
}

module.exports = {
    name: 'ميلاد',
    description: '🎂 أوامر أعياد الميلاد',
    
    // ==========================================
    // 1️⃣ إعدادات السلاش (Slash Command)
    // ==========================================
    data: new SlashCommandBuilder()
        .setName('ميلاد')
        .setDescription('🎂 أوامر أعياد الميلاد والإعدادات')
        .addSubcommand(subcommand =>
            subcommand
                .setName('تعيين')
                .setDescription('تعيين تاريخ ميلادك (لا يمكنك تغييره لاحقاً)')
                .addIntegerOption(option => 
                    option.setName('يوم').setDescription('يوم الميلاد (1-31)').setRequired(true).setMinValue(1).setMaxValue(31))
                .addIntegerOption(option => 
                    option.setName('شهر').setDescription('شهر الميلاد (1-12)').setRequired(true).setMinValue(1).setMaxValue(12))
                .addIntegerOption(option => 
                    option.setName('عام').setDescription('عام الميلاد (اختياري، لحساب العمر)').setRequired(false).setMinValue(1900).setMaxValue(new Date().getFullYear()))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('عرض')
                .setDescription('عرض تاريخ ميلاد شخص معين (أو أنت)')
                .addUserOption(option => 
                    option.setName('مستخدم').setDescription('المستخدم المراد عرض تاريخ ميلاده').setRequired(false))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('تعديل_اداري')
                .setDescription('تعديل تاريخ ميلاد لاعب (للإدارة فقط)')
                .addUserOption(option => option.setName('مستخدم').setDescription('المستخدم المراد تعديله').setRequired(true))
                .addIntegerOption(option => option.setName('يوم').setDescription('يوم الميلاد').setRequired(true).setMinValue(1).setMaxValue(31))
                .addIntegerOption(option => option.setName('شهر').setDescription('شهر الميلاد').setRequired(true).setMinValue(1).setMaxValue(12))
                .addIntegerOption(option => option.setName('عام').setDescription('عام الميلاد (اختياري)').setRequired(false).setMinValue(1900).setMaxValue(new Date().getFullYear()))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('اعداد_اداري')
                .setDescription('إعداد قناة الاحتفال ورتبة أمير الميلاد (للإدارة فقط)')
                .addChannelOption(option => option.setName('قناة').setDescription('القناة التي سيتم إرسال التهنئة فيها').setRequired(true))
                .addRoleOption(option => option.setName('رتبة').setDescription('رتبة أمير الميلاد').setRequired(false))
        ),

    // ==========================================
    // 2️⃣ تنفيذ أمر السلاش (Slash Execution)
    // ==========================================
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;
        const serverIcon = interaction.guild.iconURL({ dynamic: true }) || undefined;

        if (subcommand === 'تعيين') {
            const day = interaction.options.getInteger('يوم');
            const month = interaction.options.getInteger('شهر');
            const year = interaction.options.getInteger('عام') || null;

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
                    let age = today.getFullYear() - year;
                    if (today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day)) age--;
                    ageText = `\n✶ عـمرك الان: ${age} عـام ⭐`;
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
                    new ButtonBuilder().setCustomId('confirm_bday').setLabel('تـأكيـد').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('cancel_bday').setLabel('رفـض').setStyle(ButtonStyle.Danger)
                );

                const response = await interaction.reply({ embeds: [confirmEmbed], components: [row], flags: MessageFlags.Ephemeral });
                const collector = response.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });

                collector.on('collect', async i => {
                    if (i.user.id !== interaction.user.id) return;
                    if (i.customId === 'confirm_bday') {
                        await db.query(`INSERT INTO user_birthdays ("userID", "guildID", "day", "month", "year") VALUES ($1, $2, $3, $4, $5) ON CONFLICT ("userID", "guildID") DO UPDATE SET "day" = EXCLUDED."day", "month" = EXCLUDED."month", "year" = EXCLUDED."year"`, [interaction.user.id, guildId, day, month, year]);
                        const successEmbed = new EmbedBuilder().setColor(getRandomColor()).setTitle('✥ سـُجـل تـاريـخ ميلادك في سجلات الامبراطوريـة 👑').setDescription(`✶ تـم تعييـن: ${normalDateString} كـ تاريـخ ميـلادك\n` + (ageText ? `${ageText.trim()}\n` : '') + `✶ يـوم ميلادك القـادم: ${diffDays} يـوم 🪄`).setThumbnail(interaction.user.displayAvatarURL({ dynamic: true })).setFooter({ text: 'Empire | الامبراطورية ™', iconURL: serverIcon });
                        await i.update({ embeds: [successEmbed], components: [] });
                    } else {
                        await i.update({ content: '❌ تم رفض عملية التسجيل.', embeds: [], components: [] });
                    }
                });

                collector.on('end', collected => {
                    if (collector.endReason === 'time' && collected.size === 0) {
                        interaction.editReply({ content: '⏱️ انتهى وقت التأكيد.', embeds: [], components: [] }).catch(()=>{});
                    }
                });

            } catch (error) {
                await interaction.reply({ content: '❌ حدث خطأ داخلي.', flags: MessageFlags.Ephemeral });
            }

        } else if (subcommand === 'تعديل_اداري' || subcommand === 'اعداد_اداري') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return interaction.reply({ content: '.', flags: MessageFlags.Ephemeral }).then(msg => msg.delete().catch(() => {}));
            }

            if (subcommand === 'تعديل_اداري') {
                const targetUser = interaction.options.getUser('مستخدم');
                const day = interaction.options.getInteger('يوم');
                const month = interaction.options.getInteger('شهر');
                const year = interaction.options.getInteger('عام') || null;

                if (!isValidDate(day, month)) return interaction.reply({ content: '❌ تاريخ غير صالح!', flags: MessageFlags.Ephemeral });

                await db.query(`INSERT INTO user_birthdays ("userID", "guildID", "day", "month", "year") VALUES ($1, $2, $3, $4, $5) ON CONFLICT ("userID", "guildID") DO UPDATE SET "day" = EXCLUDED."day", "month" = EXCLUDED."month", "year" = EXCLUDED."year"`, [targetUser.id, guildId, day, month, year]);
                const displayYear = year ? `/${year}` : '';
                await interaction.reply({ content: `✅ تم تعديل ميلاد **${targetUser.username}** إدارياً إلى: **${day}/${month}${displayYear}** 🎂`, flags: MessageFlags.Ephemeral });
            
            } else if (subcommand === 'اعداد_اداري') {
                const channel = interaction.options.getChannel('قناة');
                const role = interaction.options.getRole('رتبة');
                await db.query(`INSERT INTO birthday_settings ("guildID", "channelID", "roleID") VALUES ($1, $2, $3) ON CONFLICT ("guildID") DO UPDATE SET "channelID" = EXCLUDED."channelID", "roleID" = EXCLUDED."roleID"`, [guildId, channel.id, role ? role.id : null]);
                await interaction.reply({ content: `✅ تم تحديد قناة الاحتفالات: ${channel}` + (role ? `\n✅ وتم تحديد رتبة أمير الميلاد: ${role}` : ''), flags: MessageFlags.Ephemeral });
            }

        } else if (subcommand === 'عرض') {
            const targetUser = interaction.options.getUser('مستخدم') || interaction.user;
            await sendBirthdayView(targetUser, guildId, interaction, false);
        }
    },

    // ==========================================
    // 3️⃣ تنفيذ الأمر النصي (Prefix Command)
    // ==========================================
    async executePrefix(client, message, args) {
        const guildId = message.guild.id;
        const serverIcon = message.guild.iconURL({ dynamic: true }) || undefined;

        // إذا كان هناك منشن، نقوم بعرض تاريخ ميلاد الشخص الممنشن
        if (message.mentions.users.size > 0) {
            const targetUser = message.mentions.users.first();
            return await sendBirthdayView(targetUser, guildId, message, true);
        }

        // إذا لم يكن هناك منشن، نتحقق إذا كان اللاعب مسجلاً مسبقاً
        const checkUser = await db.query('SELECT "day" FROM user_birthdays WHERE "userID" = $1 AND "guildID" = $2', [message.author.id, guildId]);
        if (checkUser.rows.length > 0 && checkUser.rows[0].day) {
            return await sendBirthdayView(message.author, guildId, message, true);
        }

        // إذا لم يكن مسجلاً ولم يمنشن أحد، نبدأ نظام الأسئلة التفاعلي
        const filter = m => m.author.id === message.author.id;
        
        await message.reply('🎂 **أهلاً بك! لم تقم بتعيين تاريخ ميلادك بعد.**\nيرجى إرسال **يوم** ميلادك (رقم من 1 إلى 31):');
        
        const collector = message.channel.createMessageCollector({ filter, time: 60000, max: 3 });
        let step = 1;
        let day, month, year = null;

        collector.on('collect', async m => {
            if (step === 1) {
                day = parseInt(m.content);
                if (isNaN(day) || day < 1 || day > 31) {
                    collector.stop('error');
                    return message.reply('❌ رقم اليوم غير صحيح، يرجى إعادة كتابة الأمر والمحاولة من جديد.');
                }
                step = 2;
                await message.reply('رائع! الآن أرسل **شهر** ميلادك (رقم من 1 إلى 12):');
            
            } else if (step === 2) {
                month = parseInt(m.content);
                if (isNaN(month) || month < 1 || month > 12 || !isValidDate(day, month)) {
                    collector.stop('error');
                    return message.reply('❌ رقم الشهر غير صحيح أو لا يتوافق مع اليوم، يرجى إعادة كتابة الأمر والمحاولة.');
                }
                step = 3;
                await message.reply('ممتاز! أخيراً، أرسل **عام** ميلادك (مثال: 2005) أو أرسل كلمة **تخطي** إذا لم ترغب بوضع العام:');
            
            } else if (step === 3) {
                if (m.content.trim() !== 'تخطي') {
                    year = parseInt(m.content);
                    const currentYear = new Date().getFullYear();
                    if (isNaN(year) || year < 1900 || year > currentYear) {
                        collector.stop('error');
                        return message.reply('❌ عام غير صالح، يرجى إعادة كتابة الأمر من البداية.');
                    }
                }

                collector.stop('success');

                // إرسال رسالة التأكيد بعد إتمام الأسئلة
                let confirmDateStr = year ? `عـام ${year} / شـهـر ${month} / يـوم ${day}` : `شـهـر ${month} / يـوم ${day}`;
                const displayYear = year ? `/${year}` : '';
                const normalDateString = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}${displayYear}`;
                
                const today = new Date();
                const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                
                let ageText = '';
                if (year) {
                    let age = today.getFullYear() - year;
                    if (today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day)) age--;
                    ageText = `\n✶ عـمرك الان: ${age} عـام ⭐`;
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

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`confirm_bday_pf_${message.author.id}`).setLabel('تـأكيـد').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId(`cancel_bday_pf_${message.author.id}`).setLabel('رفـض').setStyle(ButtonStyle.Danger)
                );

                const responseMsg = await message.reply({ embeds: [confirmEmbed], components: [row] });

                const btnCollector = responseMsg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });

                btnCollector.on('collect', async i => {
                    if (i.user.id !== message.author.id) {
                        return i.reply({ content: '❌ هذه الأزرار ليست لك.', flags: MessageFlags.Ephemeral });
                    }

                    if (i.customId.startsWith('confirm_bday_pf')) {
                        await db.query(`INSERT INTO user_birthdays ("userID", "guildID", "day", "month", "year") VALUES ($1, $2, $3, $4, $5) ON CONFLICT ("userID", "guildID") DO UPDATE SET "day" = EXCLUDED."day", "month" = EXCLUDED."month", "year" = EXCLUDED."year"`, [message.author.id, guildId, day, month, year]);
                        
                        const successEmbed = new EmbedBuilder()
                            .setColor(getRandomColor())
                            .setTitle('✥ سـُجـل تـاريـخ ميلادك في سجلات الامبراطوريـة 👑')
                            .setDescription(`✶ تـم تعييـن: ${normalDateString} كـ تاريـخ ميـلادك\n` + (ageText ? `${ageText.trim()}\n` : '') + `✶ يـوم ميلادك القـادم: ${diffDays} يـوم 🪄`)
                            .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
                            .setFooter({ text: 'Empire | الامبراطورية ™', iconURL: serverIcon });

                        await i.update({ embeds: [successEmbed], components: [] });
                    } else {
                        await i.update({ content: '❌ تم رفض عملية التسجيل.', embeds: [], components: [] });
                    }
                });

                btnCollector.on('end', collected => {
                    if (btnCollector.endReason === 'time' && collected.size === 0) {
                        responseMsg.edit({ content: '⏱️ انتهى وقت التأكيد.', components: [] }).catch(()=>{});
                    }
                });
            }
        });

        collector.on('end', (collected, reason) => {
            if (reason === 'time') {
                message.reply('⏱️ انتهى وقت الإجابة، يرجى كتابة الأمر مرة أخرى.');
            }
        });
    }
};
