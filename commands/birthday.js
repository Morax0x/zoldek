const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags, PermissionFlagsBits } = require('discord.js');
const db = require('../database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ميلاد') // تم تغييره للعربي
        .setDescription('🎂 أوامر أعياد الميلاد والإعدادات')
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
                        .setDescription('سنة الميلاد (اختياري، لحساب العمر)')
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
                        .setDescription('المستخدم المراد تعديله')
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
        )
        // ⚙️ أمر جديد للإدارة لتحديد القناة والرتبة
        .addSubcommand(subcommand =>
            subcommand
                .setName('admin_setup')
                .setDescription('إعداد قناة الاحتفال ورتبة أمير الميلاد (للإدارة فقط)')
                .addChannelOption(option => 
                    option.setName('channel')
                        .setDescription('القناة التي سيتم إرسال التهنئة فيها (مثل الشات العام)')
                        .setRequired(true))
                .addRoleOption(option => 
                    option.setName('role')
                        .setDescription('رتبة أمير الميلاد (سيأخذها من بداية اليوم)')
                        .setRequired(false))
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;

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
                return interaction.reply({ content: '❌ تاريخ غير صالح! يرجى التأكد من الأيام.', flags: MessageFlags.Ephemeral });
            }

            try {
                const checkUser = await db.query(
                    'SELECT "day" FROM user_birthdays WHERE "userID" = $1 AND "guildID" = $2',
                    [interaction.user.id, guildId]
                );

                if (checkUser.rows.length > 0 && checkUser.rows[0].day) {
                    return interaction.reply({ 
                        content: '❌ **لقد قمت بتعيين تاريخ ميلادك مسبقاً!**\nإذا كان هناك خطأ، تواصل مع الإدارة.', 
                        flags: MessageFlags.Ephemeral 
                    });
                }

                const displayYear = year ? `/${year}` : '';
                const confirmMsg = `⚠️ **تنبيه هام:**\nهل أنت متأكد أن تاريخ ميلادك هو **${day}/${month}${displayYear}**؟\n\n* - لن تتمكن من تعديله لاحقاً!*`;

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('confirm_bday').setLabel('تأكيد').setStyle(ButtonStyle.Success).setEmoji('✅'),
                    new ButtonBuilder().setCustomId('cancel_bday').setLabel('إلغاء').setStyle(ButtonStyle.Danger).setEmoji('✖️')
                );

                const response = await interaction.reply({ content: confirmMsg, components: [row], flags: MessageFlags.Ephemeral });
                const collector = response.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });

                collector.on('collect', async i => {
                    if (i.user.id !== interaction.user.id) return;

                    if (i.customId === 'confirm_bday') {
                        await db.query(
                            `INSERT INTO user_birthdays ("userID", "guildID", "day", "month", "year") VALUES ($1, $2, $3, $4, $5)
                             ON CONFLICT ("userID", "guildID") DO UPDATE SET "day" = EXCLUDED."day", "month" = EXCLUDED."month", "year" = EXCLUDED."year"`,
                            [interaction.user.id, guildId, day, month, year]
                        );

                        const embed = new EmbedBuilder()
                            .setColor('#FF69B4')
                            .setTitle('🎉 تم توثيق الميلاد!')
                            .setDescription(`حُفظ تاريخك: **${day}/${month}${displayYear}** 🎂\nسنحتفل بك في الإمبراطورية!`)
                            .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }));

                        await i.update({ content: '', embeds: [embed], components: [] });
                    } else {
                        await i.update({ content: 'تم الإلغاء.', components: [] });
                    }
                });

                collector.on('end', collected => {
                    if (collector.endReason === 'time' && collected.size === 0) {
                        interaction.editReply({ content: '⏱️ انتهى وقت التأكيد.', components: [] }).catch(()=>{});
                    }
                });

            } catch (error) {
                await interaction.reply({ content: '❌ حدث خطأ داخلي.', flags: MessageFlags.Ephemeral });
            }

        } else if (subcommand === 'admin_set' || subcommand === 'admin_setup') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return interaction.reply({ content: '❌ هذا الأمر للإدارة فقط.', flags: MessageFlags.Ephemeral });
            }

            if (subcommand === 'admin_set') {
                const targetUser = interaction.options.getUser('user');
                const day = interaction.options.getInteger('day');
                const month = interaction.options.getInteger('month');
                const year = interaction.options.getInteger('year') || null;

                if (!isValidDate(day, month)) return interaction.reply({ content: '❌ تاريخ غير صالح!', flags: MessageFlags.Ephemeral });

                await db.query(
                    `INSERT INTO user_birthdays ("userID", "guildID", "day", "month", "year") VALUES ($1, $2, $3, $4, $5)
                     ON CONFLICT ("userID", "guildID") DO UPDATE SET "day" = EXCLUDED."day", "month" = EXCLUDED."month", "year" = EXCLUDED."year"`,
                    [targetUser.id, guildId, day, month, year]
                );

                await interaction.reply({ content: `✅ تم تعديل ميلاد **${targetUser.username}** إلى: **${day}/${month}** 🎂`, flags: MessageFlags.Ephemeral });
            
            } else if (subcommand === 'admin_setup') {
                // حفظ إعدادات القناة والرتبة
                const channel = interaction.options.getChannel('channel');
                const role = interaction.options.getRole('role');
                const roleId = role ? role.id : null;

                await db.query(
                    `INSERT INTO birthday_settings ("guildID", "channelID", "roleID") VALUES ($1, $2, $3)
                     ON CONFLICT ("guildID") DO UPDATE SET "channelID" = EXCLUDED."channelID", "roleID" = EXCLUDED."roleID"`,
                    [guildId, channel.id, roleId]
                );

                let replyMsg = `✅ تم تحديد قناة الاحتفالات: ${channel}`;
                if (role) replyMsg += `\n✅ وتم تحديد رتبة أمير الميلاد: ${role}`;

                await interaction.reply({ content: replyMsg, flags: MessageFlags.Ephemeral });
            }

        } else if (subcommand === 'view') {
            const targetUser = interaction.options.getUser('user') || interaction.user;

            const result = await db.query('SELECT "day", "month", "year" FROM user_birthdays WHERE "userID" = $1 AND "guildID" = $2', [targetUser.id, guildId]);

            if (result.rows.length === 0 || !result.rows[0].day) {
                return interaction.reply({ content: `❌ لم يتم توثيق تاريخ الميلاد بعد.`, flags: MessageFlags.Ephemeral });
            }

            const { day: bDay, month: bMonth, year: bYear } = result.rows[0];
            const today = new Date();
            let nextBirthday = new Date(today.getFullYear(), bMonth - 1, bDay);
            if (today > nextBirthday) nextBirthday.setFullYear(today.getFullYear() + 1);

            const diffDays = Math.ceil(Math.abs(nextBirthday - today) / (1000 * 60 * 60 * 24));
            let ageText = bYear ? `\nالعمر: **${today.getFullYear() - bYear - (today < new Date(today.getFullYear(), bMonth - 1, bDay) ? 1 : 0)}** سنة 👑` : '';

            let remainingText = (bDay === today.getDate() && bMonth === (today.getMonth() + 1))
                ? `🎈 **عيد ميلاده اليوم!** 🎈${ageText}`
                : `يصادف يوم **${bDay}/${bMonth}**${ageText}\n⏳ متبقي عليه: **${diffDays}** يوم`;

            const embed = new EmbedBuilder()
                .setColor('#FFD700') 
                .setTitle(`🎂 السجل الإمبراطوري لميلاد ${targetUser.username}`)
                .setDescription(remainingText);

            await interaction.reply({ embeds: [embed] });
        }
    }
};
