const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder } = require('discord.js');
const db = require('../database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('birthday')
        .setDescription('🎂 تعيين أو عرض تاريخ ميلادك')
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('تعيين تاريخ ميلادك')
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
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('عرض تاريخ ميلاد شخص معين (أو أنت)')
                .addUserOption(option => 
                    option.setName('user')
                        .setDescription('المستخدم المراد عرض تاريخ ميلاده')
                        .setRequired(false))
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'set') {
            const day = interaction.options.getInteger('day');
            const month = interaction.options.getInteger('month');

            // تحقق بسيط من صحة التاريخ (مثلاً شهر 2 لا يتعدى 29)
            if (month === 2 && day > 29) {
                return interaction.reply({ content: '❌ تاريخ غير صالح! شهر فبراير لا يحتوي على أكثر من 29 يوماً.', ephemeral: true });
            }
            if ([4, 6, 9, 11].includes(month) && day > 30) {
                 return interaction.reply({ content: '❌ تاريخ غير صالح! هذا الشهر لا يحتوي على 31 يوماً.', ephemeral: true });
            }

            try {
                // حفظ في قاعدة البيانات (تحديث أو إدخال جديد)
                await db.query(
                    `INSERT INTO user_profiles (user_id, birthday_day, birthday_month) 
                     VALUES ($1, $2, $3)
                     ON CONFLICT (user_id) 
                     DO UPDATE SET birthday_day = EXCLUDED.birthday_day, birthday_month = EXCLUDED.birthday_month`,
                    [interaction.user.id, day, month]
                );

                const embed = new EmbedBuilder()
                    .setColor('#FF69B4') // لون وردي احتفالي
                    .setTitle('🎉 تم تعيين تاريخ الميلاد!')
                    .setDescription(`تم حفظ تاريخ ميلادك بنجاح: **${day}/${month}** 🎂\n\nسنحتفل بك في هذا اليوم! 🥳`)
                    .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }));

                await interaction.reply({ embeds: [embed] });

            } catch (error) {
                console.error("Error setting birthday:", error);
                await interaction.reply({ content: '❌ حدث خطأ أثناء حفظ تاريخ ميلادك. يرجى المحاولة لاحقاً.', ephemeral: true });
            }

        } else if (subcommand === 'view') {
            const targetUser = interaction.options.getUser('user') || interaction.user;

            try {
                const result = await db.query(
                    'SELECT birthday_day, birthday_month FROM user_profiles WHERE user_id = $1',
                    [targetUser.id]
                );

                if (result.rows.length === 0 || !result.rows[0].birthday_day) {
                    const msg = targetUser.id === interaction.user.id 
                        ? '❌ لم تقم بتعيين تاريخ ميلادك بعد! استخدم أمر `/birthday set`.' 
                        : `❌ المستخدم ${targetUser.username} لم يقم بتعيين تاريخ ميلاده.`;
                    return interaction.reply({ content: msg, ephemeral: true });
                }

                const bDay = result.rows[0].birthday_day;
                const bMonth = result.rows[0].birthday_month;

                // حساب كم تبقى لعيد الميلاد
                const today = new Date();
                let nextBirthday = new Date(today.getFullYear(), bMonth - 1, bDay);
                
                // إذا كان عيد الميلاد قد مر هذا العام، احسب للعام القادم
                if (today > nextBirthday) {
                    nextBirthday.setFullYear(today.getFullYear() + 1);
                }

                const diffTime = Math.abs(nextBirthday - today);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                let remainingText = '';
                if (bDay === today.getDate() && bMonth === (today.getMonth() + 1)) {
                    remainingText = '🎈 **عيد ميلاده اليوم! كل عام وهو بخير!** 🎈';
                } else {
                    remainingText = `يصادف يوم **${bDay}/${bMonth}**\n⏳ متبقي عليه: **${diffDays}** يوم`;
                }

                const embed = new EmbedBuilder()
                    .setColor('#FFD700') // لون ذهبي
                    .setTitle(`🎂 تاريخ ميلاد ${targetUser.username}`)
                    .setDescription(remainingText)
                    .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }));

                await interaction.reply({ embeds: [embed] });

            } catch (error) {
                console.error("Error fetching birthday:", error);
                await interaction.reply({ content: '❌ حدث خطأ أثناء جلب البيانات.', ephemeral: true });
            }
        }
    },
};
