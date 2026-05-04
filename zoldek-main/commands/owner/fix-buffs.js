const { SlashCommandBuilder, PermissionsBitField, EmbedBuilder, Colors, MessageFlags } = require('discord.js');

// حد الرقم الفلكي: أي multiplier خارج النطاق [-1, 1] يُعتبر فلكياً
const SANE_MULT_MAX = 1.0;
const SANE_PCT_MAX  = 100;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('fix-buffs')
        .setDescription('كشف وتحليل ومسح التعزيزات واللعنات المؤقتة العالقة')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addUserOption(option =>
            option.setName('user')
            .setDescription('العضو المراد فحصه (اتركه فارغاً لمسح كامل السيرفر)')
            .setRequired(false))
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
            targetUser = interactionOrMessage.options.getUser('user') ?? null;
            showOnly = interactionOrMessage.options.getBoolean('show-only') ?? false;
        } else {
            targetUser = interactionOrMessage.mentions.users.first() ?? null;
            if (!targetUser && args?.[0] && args[0] !== '--show' && args[0] !== '--global') {
                try { targetUser = await client.users.fetch(args[0].replace(/[<@!>]/g, '')); } catch (e) {}
            }
            if (args?.includes('--show')) showOnly = true;
        }

        if (isSlash) await interactionOrMessage.deferReply({ flags: [MessageFlags.Ephemeral] });

        try {
            // ══════════════════════════════════════════
            // وضع المسح الشامل (بدون تحديد عضو)
            // ══════════════════════════════════════════
            if (!targetUser) {
                return await handleGlobalFix(interactionOrMessage, isSlash, db, guild, guildId, showOnly);
            }

            // ══════════════════════════════════════════
            // وضع المسح الفردي
            // ══════════════════════════════════════════
            let targetMember = null;
            try { targetMember = await guild.members.fetch(targetUser.id); } catch (e) {}

            // ── 1. جلب كل بفات user_buffs ──
            const userBuffsRes = await db.query(
                `SELECT * FROM user_buffs WHERE "guildID" = $1 AND "userID" = $2 ORDER BY "buffType", "expiresAt"`,
                [guildId, targetUser.id]
            );
            const userBuffs = userBuffsRes.rows;

            // ── 2. تحليل: كشف التكرار والقيم الفلكية ──
            const typeGroups = {};
            for (const row of userBuffs) {
                const t = row.buffType ?? row.bufftype ?? '?';
                if (!typeGroups[t]) typeGroups[t] = [];
                typeGroups[t].push(row);
            }

            let astronomicalCount = 0;
            let duplicateCount = 0;
            for (const [type, rows] of Object.entries(typeGroups)) {
                if (rows.length > 1) duplicateCount += rows.length - 1;
                for (const r of rows) {
                    const m = Math.abs(Number(r.multiplier ?? 0));
                    const p = Math.abs(Number(r.buffPercent ?? r.buffpercent ?? 0));
                    if (m > SANE_MULT_MAX || p > SANE_PCT_MAX) astronomicalCount++;
                }
            }

            // ── 3. جلب بفات الرتب ──
            let roleXpBuffs = [], roleMoraBuffs = [];
            if (targetMember) {
                const userRoles = targetMember.roles.cache.map(r => r.id);
                if (userRoles.length > 0) {
                    const ph = userRoles.map((_, i) => `$${i + 1}`).join(',');
                    try { roleXpBuffs   = (await db.query(`SELECT * FROM role_buffs WHERE "roleID" IN (${ph})`, userRoles)).rows; } catch (e) {}
                    try { roleMoraBuffs = (await db.query(`SELECT * FROM role_mora_buffs WHERE "roleID" IN (${ph})`, userRoles)).rows; } catch (e) {}
                }
            }

            // ── 4. بناء جدول user_buffs ──
            const now = Date.now();
            let userBuffTable = '';
            if (userBuffs.length === 0) {
                userBuffTable = '> لا توجد بيانات مؤقتة مسجلة.';
            } else {
                const lines = userBuffs.map(row => {
                    const type = row.buffType ?? row.bufftype ?? '?';
                    const mult = Number(row.multiplier ?? 0);
                    const pct  = Number(row.buffPercent ?? row.buffpercent ?? 0);
                    const exp  = row.expiresAt ?? row.expiresat;
                    const expStr = exp
                        ? (Number(exp) < now ? '⛔ منتهي' : `<t:${Math.floor(Number(exp) / 1000)}:R>`)
                        : '♾️ دائم';
                    const isAstro = Math.abs(mult) > SANE_MULT_MAX || Math.abs(pct) > SANE_PCT_MAX;
                    const valStr = `\`${(mult * 100).toFixed(0)}%\`${isAstro ? ' 🚨' : ''}`;
                    return `> \`${type.padEnd(14)}\` ${valStr} ${expStr}`;
                });
                userBuffTable = lines.join('\n');
                if (duplicateCount > 0 || astronomicalCount > 0) {
                    userBuffTable += `\n> ⚠️ **تكرارات:** ${duplicateCount} صف | **فلكية:** ${astronomicalCount} صف`;
                }
            }

            // ── 5. جداول الرتب ──
            const buildRoleTable = (buffs, label) => {
                if (buffs.length === 0) return `> لا توجد رتب مرتبطة ببفات ${label}.`;
                return buffs.map(row => {
                    const roleId = row.roleID ?? row.roleid;
                    const pct    = row.buffPercent ?? row.buffpercent ?? 0;
                    const role   = guild.roles.cache.get(roleId);
                    return `> \`${(role?.name ?? roleId).substring(0, 18).padEnd(18)}\` \`+${pct}%\``;
                }).join('\n');
            };

            // ── 6. حساب الإجماليات ──
            const totalRoleXp   = roleXpBuffs.reduce((s, r)   => s + Number(r.buffPercent ?? r.buffpercent ?? 0), 0);
            const totalRoleMora = roleMoraBuffs.reduce((s, r) => s + Number(r.buffPercent ?? r.buffpercent ?? 0), 0);
            const isWeekend     = [0, 5, 6].includes(new Date().getUTCDay());
            const weekendBonus  = isWeekend ? 10 : 0;

            // ── 7. تنفيذ الحذف ──
            let deletedCount = 0;
            if (!showOnly && userBuffs.length > 0) {
                const delRes = await db.query(
                    `DELETE FROM user_buffs WHERE "guildID" = $1 AND "userID" = $2`,
                    [guildId, targetUser.id]
                );
                deletedCount = delRes.rowCount ?? userBuffs.length;
            }

            // ── 8. Embed ──
            const actionLabel = showOnly
                ? '🔍 وضع العرض فقط — لم يُحذف شيء'
                : (deletedCount > 0
                    ? `🧹 تم حذف **${deletedCount}** صف (منها **${duplicateCount}** تكرار و**${astronomicalCount}** فلكي)`
                    : '✅ لا توجد بفات مؤقتة لحذفها');

            const embed = new EmbedBuilder()
                .setColor(astronomicalCount > 0 ? Colors.Red : showOnly ? Colors.Blue : Colors.Orange)
                .setTitle(`🕵️ تقرير البفات — ${targetUser.username}`)
                .setThumbnail(targetUser.displayAvatarURL())
                .addFields(
                    {
                        name: `📋 البفات المؤقتة (${userBuffs.length} صف) — قبل الحذف`,
                        value: `\`النوع          \` \`القيمة\` الانتهاء\n${userBuffTable}`,
                    },
                    {
                        name: '🎯 بفات الرتب — XP',
                        value: `\`الرتبة            \` \`القيمة\`\n${buildRoleTable(roleXpBuffs, 'XP')}`,
                    },
                    {
                        name: '💰 بفات الرتب — Mora',
                        value: `\`الرتبة            \` \`القيمة\`\n${buildRoleTable(roleMoraBuffs, 'Mora')}`,
                    },
                    {
                        name: '📊 التوقع بعد التطهير',
                        value: [
                            `> **XP:** \`${100 + totalRoleXp + weekendBonus}%\` (رتب: +${totalRoleXp}%${isWeekend ? ' + عطلة: +10%' : ''})`,
                            `> **Mora:** \`${100 + totalRoleMora + weekendBonus}%\` (رتب: +${totalRoleMora}%${isWeekend ? ' + عطلة: +10%' : ''})`,
                        ].join('\n'),
                    },
                    { name: '⚡ النتيجة', value: actionLabel }
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

// ══════════════════════════════════════════════════════════════
// مسح شامل لكامل السيرفر: تكرارات + قيم فلكية
// ══════════════════════════════════════════════════════════════
async function handleGlobalFix(interactionOrMessage, isSlash, db, guild, guildId, showOnly) {
    // جلب كل صفوف user_buffs للسيرفر
    const allRes = await db.query(
        `SELECT * FROM user_buffs WHERE "guildID" = $1 ORDER BY "userID", "buffType", "expiresAt" DESC`,
        [guildId]
    );
    const allRows = allRes.rows;

    if (allRows.length === 0) {
        const msg = '✅ لا توجد أي بفات مسجلة في هذا السيرفر.';
        if (isSlash) return await interactionOrMessage.editReply(msg);
        return await interactionOrMessage.reply(msg);
    }

    // تجميع حسب (userID, buffType)
    const groups = {};
    for (const row of allRows) {
        const uid  = row.userID  ?? row.userid;
        const type = row.buffType ?? row.bufftype ?? '?';
        const key  = `${uid}::${type}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(row);
    }

    // كشف المشكلات
    const toDelete = []; // ids للحذف
    let affectedUsers = new Set();
    let duplicateRows = 0;
    let astronomicalRows = 0;

    for (const [key, rows] of Object.entries(groups)) {
        const [uid] = key.split('::');

        // كشف الصفوف الفلكية (خارج النطاق الطبيعي)
        const astronomicInGroup = rows.filter(r => {
            const m = Math.abs(Number(r.multiplier ?? 0));
            const p = Math.abs(Number(r.buffPercent ?? r.buffpercent ?? 0));
            return m > SANE_MULT_MAX || p > SANE_PCT_MAX;
        });

        if (astronomicInGroup.length > 0) {
            for (const r of astronomicInGroup) toDelete.push(r.id);
            affectedUsers.add(uid);
            astronomicalRows += astronomicInGroup.length;
        }

        // كشف التكرار: أكثر من صف لنفس النوع → احتفظ بالأحدث فقط
        if (rows.length > 1) {
            // الصفوف مرتبة DESC بـ expiresAt، أي rows[0] هو الأحدث
            const extras = rows.slice(1).filter(r => !toDelete.includes(r.id));
            for (const r of extras) toDelete.push(r.id);
            affectedUsers.add(uid);
            duplicateRows += extras.length;
        }
    }

    // تنفيذ الحذف
    let deletedCount = 0;
    if (!showOnly && toDelete.length > 0) {
        const ph = toDelete.map((_, i) => `$${i + 1}`).join(',');
        const delRes = await db.query(
            `DELETE FROM user_buffs WHERE "id" IN (${ph})`,
            toDelete
        );
        deletedCount = delRes.rowCount ?? toDelete.length;
    }

    const actionLabel = showOnly
        ? `🔍 وضع العرض — سيتم حذف **${toDelete.length}** صف لو نُفِّذ الأمر`
        : (deletedCount > 0
            ? `🧹 تم تنظيف **${deletedCount}** صف من **${affectedUsers.size}** عضو`
            : '✅ لا توجد بفات فلكية أو مكررة في السيرفر');

    const embed = new EmbedBuilder()
        .setColor(toDelete.length > 0 ? Colors.Red : Colors.Green)
        .setTitle('🌐 تقرير التنظيف الشامل — كامل السيرفر')
        .addFields(
            {
                name: '🔎 نتائج الفحص',
                value: [
                    `> **إجمالي الصفوف:** \`${allRows.length}\``,
                    `> **صفوف مكررة:** \`${duplicateRows}\` 🔁`,
                    `> **صفوف فلكية** (|mult| > 100%): \`${astronomicalRows}\` 🚨`,
                    `> **أعضاء متأثرون:** \`${affectedUsers.size}\``,
                ].join('\n'),
            },
            { name: '⚡ النتيجة', value: actionLabel }
        )
        .setFooter({ text: 'نظام كشف الخلل — الإمبراطورية' })
        .setTimestamp();

    if (isSlash) await interactionOrMessage.editReply({ embeds: [embed] });
    else await interactionOrMessage.reply({ embeds: [embed] });
}
