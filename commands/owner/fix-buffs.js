const { SlashCommandBuilder, PermissionsBitField, EmbedBuilder, Colors, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('fix-buffs')
        .setDescription('كشف وتحليل ومسح التعزيزات واللعنات المؤقتة العالقة')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addUserOption(option =>
            option.setName('user')
            .setDescription('العضو المراد فحصه وتطهير حسابه')
            .setRequired(true))
        .addBooleanOption(option =>
            option.setName('show-only')
            .setDescription('عرض البفات فقط دون حذف')
            .setRequired(false)),

    name: 'fix-buffs',
    aliases: ['كشف-البفات', 'فحص-اللعنات', 'تطهير'],
    category: 'Admin',

    async execute(interactionOrMessage, args) {
        const isSlash = typeof interactionOrMessage.isChatInputCommand === 'function'
            && interactionOrMessage.isChatInputCommand();
        const client = interactionOrMessage.client;
        const db = client.sql;
        const guild = interactionOrMessage.guild;
        const guildId = guild.id;

        const member = interactionOrMessage.member;
        if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            const msg = '❌ صلاحياتك لا تسمح.';
            return isSlash
                ? interactionOrMessage.reply({ content: msg, flags: [MessageFlags.Ephemeral] })
                : interactionOrMessage.reply(msg);
        }

        let targetUser = null;
        let showOnly = false;

        if (isSlash) {
            targetUser = interactionOrMessage.options.getUser('user');
            showOnly = interactionOrMessage.options.getBoolean('show-only') ?? false;
        } else {
            targetUser = interactionOrMessage.mentions.users.first();
            if (!targetUser && args?.[0]) {
                try { targetUser = await client.users.fetch(args[0].replace(/[<@!>]/g, '')); } catch (e) {}
            }
            if (args?.includes('--show')) showOnly = true;
        }

        if (!targetUser) {
            return interactionOrMessage.reply('⚠️ يرجى تحديد العضو (منشن أو آيدي).');
        }

        if (isSlash) await interactionOrMessage.deferReply({ flags: [MessageFlags.Ephemeral] });

        try {
            // جلب بيانات العضو للوصول إلى رتبه
            let targetMember = null;
            try { targetMember = await guild.members.fetch(targetUser.id); } catch (e) {}

            // ── 1. جلب كل بفات user_buffs بدون فلتر انتهاء الصلاحية ──
            const userBuffsRes = await db.query(
                `SELECT * FROM user_buffs WHERE "guildID" = $1 AND "userID" = $2 ORDER BY "buffType", "expiresAt"`,
                [guildId, targetUser.id]
            );
            const userBuffs = userBuffsRes.rows;

            // ── 2. جلب بفات الرتب (XP و Mora) بناءً على رتب العضو ──
            let roleXpBuffs = [];
            let roleMoraBuffs = [];

            if (targetMember) {
                const userRoles = targetMember.roles.cache.map(r => r.id);
                if (userRoles.length > 0) {
                    const ph = userRoles.map((_, i) => `$${i + 1}`).join(',');
                    try {
                        const xpRes = await db.query(
                            `SELECT * FROM role_buffs WHERE "roleID" IN (${ph})`,
                            userRoles
                        );
                        roleXpBuffs = xpRes.rows;
                    } catch (e) {}
                    try {
                        const moraRes = await db.query(
                            `SELECT * FROM role_mora_buffs WHERE "roleID" IN (${ph})`,
                            userRoles
                        );
                        roleMoraBuffs = moraRes.rows;
                    } catch (e) {}
                }
            }

            // ── 3. بناء جدول user_buffs ──
            const now = Date.now();
            let userBuffTable = '';
            if (userBuffs.length === 0) {
                userBuffTable = '> لا توجد بيانات مؤقتة مسجلة.';
            } else {
                const lines = userBuffs.map(row => {
                    const type    = row.buffType    ?? row.bufftype    ?? '?';
                    const pct     = row.buffPercent ?? row.buffpercent ?? 0;
                    const mult    = row.multiplier  != null ? row.multiplier : '-';
                    const exp     = row.expiresAt   ?? row.expiresat;
                    const expStr  = exp
                        ? (Number(exp) < now ? '⛔ منتهي' : `<t:${Math.floor(Number(exp) / 1000)}:R>`)
                        : '♾️ دائم';
                    const multStr = mult !== '-' ? `\`${(Number(mult) * 100).toFixed(0)}%\`` : `\`${pct}%\``;
                    return `> \`${type.padEnd(14)}\` ${multStr.padEnd(8)} ${expStr}`;
                });
                userBuffTable = lines.join('\n');
            }

            // ── 4. بناء جدول بفات الرتب (XP) ──
            let roleXpTable = '';
            if (roleXpBuffs.length === 0) {
                roleXpTable = '> لا توجد رتب مرتبطة ببفات XP.';
            } else {
                const lines = roleXpBuffs.map(row => {
                    const roleId = row.roleID ?? row.roleid;
                    const pct    = row.buffPercent ?? row.buffpercent ?? 0;
                    const role   = guild.roles.cache.get(roleId);
                    const name   = role ? role.name : roleId;
                    return `> \`${name.substring(0, 18).padEnd(18)}\` \`+${pct}%\``;
                });
                roleXpTable = lines.join('\n');
            }

            // ── 5. بناء جدول بفات الرتب (Mora) ──
            let roleMoraTable = '';
            if (roleMoraBuffs.length === 0) {
                roleMoraTable = '> لا توجد رتب مرتبطة ببفات Mora.';
            } else {
                const lines = roleMoraBuffs.map(row => {
                    const roleId = row.roleID ?? row.roleid;
                    const pct    = row.buffPercent ?? row.buffpercent ?? 0;
                    const role   = guild.roles.cache.get(roleId);
                    const name   = role ? role.name : roleId;
                    return `> \`${name.substring(0, 18).padEnd(18)}\` \`+${pct}%\``;
                });
                roleMoraTable = lines.join('\n');
            }

            // ── 6. حساب الإجماليات المتوقعة بعد الحذف ──
            const totalRoleXp   = roleXpBuffs.reduce((s, r) => s + Number(r.buffPercent ?? r.buffpercent ?? 0), 0);
            const totalRoleMora = roleMoraBuffs.reduce((s, r) => s + Number(r.buffPercent ?? r.buffpercent ?? 0), 0);
            const isWeekend     = [0, 5, 6].includes(new Date().getUTCDay());
            const weekendBonus  = isWeekend ? 10 : 0;
            const finalXp       = 100 + totalRoleXp + weekendBonus;
            const finalMora     = 100 + totalRoleMora + weekendBonus;

            // ── 7. حذف كل بفات user_buffs (إجباري ما لم يكن show-only) ──
            let deletedCount = 0;
            if (!showOnly && userBuffs.length > 0) {
                const delRes = await db.query(
                    `DELETE FROM user_buffs WHERE "guildID" = $1 AND "userID" = $2`,
                    [guildId, targetUser.id]
                );
                deletedCount = delRes.rowCount ?? userBuffs.length;
            }

            // ── 8. بناء الـ Embed ──
            const actionLabel = showOnly
                ? '🔍 وضع العرض فقط — لم يُحذف شيء'
                : (deletedCount > 0
                    ? `🧹 تم حذف **${deletedCount}** بفة/لعنة من قاعدة البيانات`
                    : '✅ لا توجد بفات مؤقتة لحذفها');

            const embed = new EmbedBuilder()
                .setColor(showOnly ? Colors.Blue : Colors.Orange)
                .setTitle(`🕵️ تقرير البفات — ${targetUser.username}`)
                .setThumbnail(targetUser.displayAvatarURL())
                .addFields(
                    {
                        name: '📋 البفات المؤقتة (user_buffs) — قبل الحذف',
                        value: `\`النوع          \` \`القيمة\` الانتهاء\n${userBuffTable}`,
                    },
                    {
                        name: '🎯 بفات الرتب — تعزيز XP',
                        value: `\`الرتبة            \` \`القيمة\`\n${roleXpTable}`,
                    },
                    {
                        name: '💰 بفات الرتب — تعزيز Mora',
                        value: `\`الرتبة            \` \`القيمة\`\n${roleMoraTable}`,
                    },
                    {
                        name: '📊 التوقع بعد التطهير',
                        value: [
                            `> **XP الفعلي:** \`${finalXp}%\` (رتب: +${totalRoleXp}%${isWeekend ? ' + عطلة: +10%' : ''})`,
                            `> **Mora الفعلي:** \`${finalMora}%\` (رتب: +${totalRoleMora}%${isWeekend ? ' + عطلة: +10%' : ''})`,
                        ].join('\n'),
                    },
                    {
                        name: '⚡ النتيجة',
                        value: actionLabel,
                    }
                )
                .setFooter({ text: 'نظام كشف الخلل — الإمبراطورية' })
                .setTimestamp();

            if (isSlash) await interactionOrMessage.editReply({ embeds: [embed] });
            else await interactionOrMessage.reply({ embeds: [embed] });

        } catch (err) {
            console.error('[Fix Buffs Error]:', err);
            const errMsg = '❌ فشل الفحص، تأكد من إعدادات قاعدة البيانات.';
            if (isSlash) await interactionOrMessage.editReply(errMsg).catch(() => {});
            else await interactionOrMessage.reply(errMsg).catch(() => {});
        }
    }
};
