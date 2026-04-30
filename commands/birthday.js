const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags, PermissionFlagsBits } = require('discord.js');
const db = require('../database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('birthday')
        .setDescription('🎂 أوامر أعياد الميلاد')
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('تعيين تاريخ ميلادك (لا يمكنك تغييره لاحقاً)')
                .addIntegerOption(option => 
                    option.setName('day')
                        .setDescription('يوم الميلاد (1-31)')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(31))
                .addIntegerOption(option => 
                    option.setName('month')
                        .setDescription('شهر الميلاد (1-12)')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(12))
                .addIntegerOption(option => 
                    option.setName('year')
                        .setDescription('سنة الميلاد (اختياري، مثلاً: 2005)')
                        .setRequired(false)
                        .setMinValue(1900)
                        .setMaxValue(new Date().getFullYear()))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('عرض تاريخ ميلاد شخص معين (أو أنت)')
                .addUserOption(option => 
                    option.setName('user')
                        .setDescription('المستخدم المراد عرض تاريخ ميلاده')
                        .setRequired(false))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('admin_set')
                .setDescription('تعديل تاريخ ميلاد لاعب (للإدارة فقط)')
                .addUserOption(option => 
                    option.setName('user')
                        .setDescription('المستخدم المراد تعديل بياناته')
                        .setRequired(true))
                .addIntegerOption(option => 
                    option.setName('day')
                        .setDescription('يوم الميلاد')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(31))
                .addIntegerOption(option => 
                    option.setName('month')
                        .setDescription('شهر الميلاد')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(12))
                .addIntegerOption(option => 
                    option.setName('year')
                        .setDescription('سنة الميلاد (اختياري)')
                        .setRequired(false)
                        .setMinValue(1900)
                        .setMaxValue(new Date().getFullYear()))
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;

        // دالة للتحقق من صحة التاريخ
        const isValidDate = (d, m) => {
            if (m === 2 && d > 29) return false;
            if ([4, 6, 9, 11].includes(m) && d > 30) return false;
            return true;
        };

        if (subcommand === 'set') {
            const day = interaction.options.getInteger('day');
            const month = interaction.options.getInteger('month');
            const year = interaction.options.getInteger('year') || null;

            if (!isValidDate(day, month)) {
                return interaction.reply({ content: '❌ تاريخ غير صالح! يرجى التأكد من عدد أيام الشهر.', flags: MessageFlags.Ephemeral });
            }

            try {
                // التحقق مما إذا كان قد عين تاريخ ميلاده مسبقاً
                const checkUser = await db.query(
                    'SELECT "day" FROM user_birthdays WHERE "userID" = $1 AND "guildID" = $2',
                    [interaction.user.id, guildId]
                );

                if (checkUser.rows.length > 0 && checkUser.rows[0].day) {
                    return interaction.reply({ 
                        content: '❌ **لقد قمت بتعيين تاريخ ميلادك مسبقاً!**\nلا يمكنك تغييره لمنع التلاعب بالجوائز. إذا كان هناك خطأ، يرجى التواصل مع الإدارة.', 
                        flags: MessageFlags.Ephemeral 
                    });
                }

                const displayYear = year ? `/${year}` : '';
                const confirmMsg = `⚠️ **تنبيه هام:**\nهل أنت متأكد أن تاريخ ميلادك هو **${day}/${month}${displayYear}**؟\n\n*(لن تتمكن من تعديل هذا التاريخ لاحقاً بعد التأكيد)*`;

                const confirmButton = new ButtonBuilder()
                    .setCustomId('confirm_bday')
                    .setLabel('تأكيد وحفظ')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('✅');

                const cancelButton = new ButtonBuilder()
                    .setCustomId('cancel_bday')
                    .setLabel('إلغاء')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('✖️');

                const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);

                const response = await interaction.reply({
                    content: confirmMsg,
                    components: [row],
                    flags: MessageFlags.Ephemeral
                });

                const collector = response.createMessageComponentCollector({ 
                    componentType: ComponentType.Button, 
                    time: 60000 
                });

                collector.on('collect', async i => {
                    if (i.user.id !== interaction.user.id) return;

                    if (i.customId === 'confirm_bday') {
                        await db.query(
                            `INSERT INTO user_birthdays ("userID", "guildID", "day", "month", "year") 
                             VALUES ($1, $2, $3, $4, $5)
                             ON CONFLICT ("userID", "guildID") 
                             DO UPDATE SET "day" = EXCLUDED."day", "month" = EXCLUDED."month", "year" = EXCLUDED."year"`,
                            [interaction.user.id, guildId, day, month, year]
                        );

                        const embed = new EmbedBuilder()
                            .setColor('#FF69B4')
                            .setTitle('🎉 تم توثيق تاريخ الميلاد!')
                            .setDescription(`تم حفظ تاريخ ميلادك بنجاح: **${day}/${month}${displayYear}** 🎂\n\nسنكون أول من يحتفل بك في هذا اليوم! 🥳`)
                            .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }));

                        await i.update({ content: '', embeds: [embed], components: [] });
                    } else {
                        await i.update({ content: 'تم إلغاء عملية التسجيل.', components: [] });
                    }
                });

                collector.on('end', collected => {
                    if (collector.endReason === 'time' && collected.size === 0) {
                        interaction.editReply({ content: '⏱️ انتهى وقت التأكيد. يرجى إعادة المحاولة.', components: [] }).catch(()=>{});
                    }
                });

            } catch (error) {
                console.error("Error setting birthday:", error);
                await interaction.reply({ content: '❌ حدث خطأ داخلي. يرجى المحاولة لاحقاً.', flags: MessageFlags.Ephemeral });
            }

        } else if (subcommand === 'admin_set') {
            // التحقق من الصلاحيات الإدارية
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return interaction.reply({ content: '❌ هذا الأمر مخصص للإدارة فقط.', flags: MessageFlags.Ephemeral });
            }

            const targetUser = interaction.options.getUser('user');
            const day = interaction.options.getInteger('day');
            const month = interaction.options.getInteger('month');
            const year = interaction.options.getInteger('year') || null;

            if (!isValidDate(day, month)) {
                return interaction.reply({ content: '❌ تاريخ غير صالح! يرجى التأكد من عدد أيام الشهر.', flags: MessageFlags.Ephemeral });
            }

            try {
                await db.query(
                    `INSERT INTO user_birthdays ("userID", "guildID", "day", "month", "year") 
                     VALUES ($1, $2, $3, $4, $5)
                     ON CONFLICT ("userID", "guildID") 
                     DO UPDATE SET "day" = EXCLUDED."day", "month" = EXCLUDED."month", "year" = EXCLUDED."year"`,
                    [targetUser.id, guildId, day, month, year]
                );

                const displayYear = year ? `/${year}` : '';
                await interaction.reply({ 
                    content: `✅ تم تعديل تاريخ ميلاد اللاعب **${targetUser.username}** إدارياً ليصبح: **${day}/${month}${displayYear}** 🎂`, 
                    flags: MessageFlags.Ephemeral 
                });
            } catch (error) {
                console.error("Error admin setting birthday:", error);
                await interaction.reply({ content: '❌ حدث خطأ أثناء تعديل البيانات.', flags: MessageFlags.Ephemeral });
            }

        } else if (subcommand === 'view') {
            const targetUser = interaction.options.getUser('user') || interaction.user;

            try {
                const result = await db.query(
                    'SELECT "day", "month", "year" FROM user_birthdays WHERE "userID" = $1 AND "guildID" = $2',
                    [targetUser.id, guildId]
                );

                if (result.rows.length === 0 || !result.rows[0].day) {
                    const msg = targetUser.id === interaction.user.id 
                        ? '❌ لم تقم بتعيين تاريخ ميلادك بعد! استخدم أمر `/birthday set`.' 
                        : `❌ اللاعب ${targetUser.username} لم يقم بتوثيق تاريخ ميلاده.`;
                    return interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
                }

                const bDay = result.rows[0].day;
                const bMonth = result.rows[0].month;
                const bYear = result.rows[0].year;

                const today = new Date();
                let nextBirthday = new Date(today.getFullYear(), bMonth - 1, bDay);
                
                if (today > nextBirthday) {
                    nextBirthday.setFullYear(today.getFullYear() + 1);
                }

                const diffTime = Math.abs(nextBirthday - today);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                // حساب العمر إذا كانت السنة موجودة
                let ageText = '';
                if (bYear) {
                    let age = today.getFullYear() - bYear;
                    // إذا لم يأتِ عيد الميلاد هذا العام بعد، ننقص سنة من العمر
                    if (today.getMonth() + 1 < bMonth || (today.getMonth() + 1 === bMonth && today.getDate() < bDay)) {
                        age--;
                    }
                    ageText = `\nالعمر: **${age}** سنة 👑`;
                }

                let remainingText = '';
                if (bDay === today.getDate() && bMonth === (today.getMonth() + 1)) {
                    remainingText = `🎈 **عيد ميلاده اليوم! كل عام وهو بخير!** 🎈${ageText}`;
                } else {
                    remainingText = `يصادف يوم **${bDay}/${bMonth}**${ageText}\n⏳ متبقي عليه: **${diffDays}** يوم`;
                }

                const embed = new EmbedBuilder()
                    .setColor('#FFD700') 
                    .setTitle(`🎂 السجل الإمبراطوري لميلاد ${targetUser.username}`)
                    .setDescription(remainingText)
                    .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }));

                await interaction.reply({ embeds: [embed] });

            } catch (error) {
                console.error("Error fetching birthday:", error);
                await interaction.reply({ content: '❌ حدث خطأ أثناء جلب البيانات.', flags: MessageFlags.Ephemeral });
            }
        }
    }
};
