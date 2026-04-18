const { SlashCommandBuilder, PermissionsBitField, EmbedBuilder, Colors, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('fix-buffs')
        .setDescription('كشف وتحليل ومسح التعزيزات واللعنات المؤقتة العالقة')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addUserOption(option => 
            option.setName('user')
            .setDescription('العضو المراد فحصه وتطهير حسابه')
            .setRequired(true)), // جعلناه إجبارياً هنا لعمل الكشف الدقيق
    
    name: 'fix-buffs',
    aliases: ['كشف-البفات', 'فحص-اللعنات', 'تطهير'],
    category: 'Admin',
    
    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        const client = interactionOrMessage.client;
        const db = client.sql;
        const guildId = interactionOrMessage.guild.id;

        const member = isSlash ? interactionOrMessage.member : interactionOrMessage.member;
        if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return isSlash ? interactionOrMessage.reply({ content: '❌ صلاحياتك لا تسمح.', flags: [MessageFlags.Ephemeral] }) : interactionOrMessage.reply('❌ صلاحياتك لا تسمح.');
        }

        let targetUser = null;
        if (isSlash) {
            targetUser = interactionOrMessage.options.getUser('user');
        } else {
            targetUser = interactionOrMessage.mentions.users.first();
            if (!targetUser && args && args[0]) {
                try { targetUser = await client.users.fetch(args[0].replace(/[<@!>]/g, '')); } catch(e){}
            }
        }

        if (!targetUser) return interactionOrMessage.reply("⚠️ يرجى تحديد العضو (منشن أو آيدي).");

        if (isSlash) await interactionOrMessage.deferReply({ flags: [MessageFlags.Ephemeral] });

        try {
            // 🔍 1. مرحلة الكشف والتحليل
            const checkQuery = `SELECT * FROM user_buffs WHERE "guildID" = $1 AND "userID" = $2`;
            let results;
            try {
                const res = await db.query(checkQuery, [guildId, targetUser.id]);
                results = res.rows || [];
            } catch (e) {
                const fallbackCheck = checkQuery.replace(/"guildID"/g, "guildid").replace(/"userID"/g, "userid");
                const res = await db.query(fallbackCheck, [guildId, targetUser.id]);
                results = res.rows || [];
            }

            let reportLogs = [];
            if (results.length === 0) {
                reportLogs.push("✅ لا توجد أي بيانات بفات مسجلة حالياً في الداتابيز.");
            } else {
                results.forEach(row => {
                    const type = row.buffType || row.bufftype;
                    const percent = row.buffPercent || row.buffpercent || 0;
                    const multiplier = row.multiplier || 0;
                    
                    let source = "❓ مصدر مجهول";
                    if (type === 'xp') {
                        if (percent === -100 || percent === -50) source = "💀 لعنة الخمول (الدانجون)";
                        else if (percent === 15) source = "✨ جائزة (نجم الدانجون) أو (فوز PvP)";
                        else source = "🧪 جرعة خبرة من المتجر";
                    } else if (type === 'mora') {
                        if (percent === -15) source = "📉 لعنة الهزيمة (دانجون/PvP)";
                        else source = "💰 تعزيز مورا (متجر/جوائز)";
                    } else if (type === 'pvp_wounded') {
                        source = "🩸 جرح قتال (لعنة نزاع PvP)";
                    } else if (type === 'farm_worker') {
                        source = "👨‍🌾 عقد عمل (مزارع)";
                    } else if (type.startsWith('hidden_')) {
                        source = "🕵️ تعزيز إمبراطوري مخفي (Admin)";
                    }

                    reportLogs.push(`🔹 **النوع:** \`${type}\` | **القيمة:** \`${percent}%\`\n**السبب المرجح:** ${source}\n**المضاعف التقني:** \`${multiplier}\``);
                });
            }

            // 🧹 2. مرحلة التطهير (Wipe)
            // نمسح كل شيء ما عدا المزارع والمخفي
            const deleteQuery = `DELETE FROM user_buffs WHERE "guildID" = $1 AND "userID" = $2 AND "buffType" NOT LIKE 'hidden_%' AND "buffType" != 'farm_worker'`;
            try {
                await db.query(deleteQuery, [guildId, targetUser.id]);
            } catch (e) {
                const fallbackDel = deleteQuery.replace(/"guildID"/g, "guildid").replace(/"userID"/g, "userid").replace(/"buffType"/g, "bufftype");
                await db.query(fallbackDel, [guildId, targetUser.id]);
            }

            const embed = new EmbedBuilder()
                .setColor(Colors.Blue)
                .setTitle(`🕵️ تقرير فحص وتطهير: ${targetUser.username}`)
                .setThumbnail(targetUser.displayAvatarURL())
                .setDescription(`**[ السجلات المكتشفة قبل المسح ]**\n\n${reportLogs.join('\n\n')}\n\n---`)
                .addFields({ 
                    name: '✨ النتيجة النهائية', 
                    value: `تم تصفير جميع التعزيزات واللعنات المؤقتة المذكورة أعلاه. اللاعب الآن سيعتمد على **رتبه فقط** في حساب الحوافز.` 
                })
                .setFooter({ text: 'نظام كشف الخلل - الإمبراطورية' })
                .setTimestamp();

            if (isSlash) await interactionOrMessage.editReply({ embeds: [embed] });
            else await interactionOrMessage.reply({ embeds: [embed] });

        } catch (err) {
            console.error("[Fix Buffs Error]:", err);
            if (isSlash) await interactionOrMessage.editReply('❌ فشل الفحص، تأكد من إعدادات قاعدة البيانات.');
            else await interactionOrMessage.reply('❌ فشل الفحص.');
        }
    }
};
