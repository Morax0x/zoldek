const { EmbedBuilder, SlashCommandBuilder } = require("discord.js");

function formatUptime(ms) {
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const parts = [];
    if (d > 0)   parts.push(`${d} يوم`);
    if (h > 0)   parts.push(`${h} ساعة`);
    if (m > 0)   parts.push(`${m} دقيقة`);
    parts.push(`${sec} ثانية`);
    return parts.join(' ، ');
}

function buildBar(ping) {
    // 10 blocks — filled proportional to quality (inverse of ping)
    const quality = ping <= 0 ? 0 : ping < 80 ? 10 : ping < 150 ? 8 : ping < 300 ? 5 : 2;
    return '█'.repeat(quality) + '░'.repeat(10 - quality);
}

function getStatus(ping) {
    if (ping < 80)  return { label: 'ممتـاز 🟢',  color: 0x2ECC71 };
    if (ping < 150) return { label: 'جيـد 🟡',     color: 0xF1C40F };
    if (ping < 300) return { label: 'متوسـط 🟠',   color: 0xE67E22 };
    return             { label: 'ضعيـف 🔴',    color: 0xE74C3C };
}

function fmtMemory(bytes) {
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

function ping_label(ms) {
    return ms < 0 ? '— ms' : `${ms} ms`;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('🏓 قياس سرعة استجابة البوت والشبكة'),

    name: 'ping',
    description: 'قياس سرعة استجابة البوت',
    aliases: ['بينق', 'استجابة', 'وقت', 'لايتنسي'],
    category: 'Utility',
    cooldown: 5,

    async execute(interactionOrMessage, args) {
        const isSlash = typeof interactionOrMessage.isChatInputCommand === 'function'
            && interactionOrMessage.isChatInputCommand();
        const client = interactionOrMessage.client;

        // ── المرحلة الأولى: إرسال رسالة "جاري القياس" ──────────────────────
        const loadingEmbed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setDescription(
                '```ansi\n[2;34m⏱️  جاري قياس سرعة الاستجابة...[0m\n```'
            );

        const sentAt = Date.now();
        let sentMsg = null;

        if (isSlash) {
            await interactionOrMessage.reply({ embeds: [loadingEmbed] });
        } else {
            sentMsg = await interactionOrMessage.reply({ embeds: [loadingEmbed] });
        }

        // ── حساب الإحصائيات ───────────────────────────────────────────────
        const apiLatency = Date.now() - sentAt;
        const wsLatency  = Math.round(client.ws.ping);
        const displayPing = wsLatency >= 0 ? wsLatency : apiLatency;

        const status    = getStatus(displayPing);
        const bar       = buildBar(displayPing);
        const mem       = process.memoryUsage();
        const uptime    = formatUptime(client.uptime ?? process.uptime() * 1000);
        const guilds    = client.guilds.cache.size;
        const users     = client.guilds.cache.reduce((n, g) => n + (g.memberCount ?? 0), 0);
        const nodeVer   = process.version;
        const djsVer    = require('discord.js').version;

        const nowKSA = new Intl.DateTimeFormat('ar-SA', {
            timeZone: 'Asia/Riyadh',
            dateStyle: 'short',
            timeStyle: 'medium'
        }).format(new Date());

        // ── بناء الإمبد النهائي ───────────────────────────────────────────
        const resultEmbed = new EmbedBuilder()
            .setColor(status.color)
            .setAuthor({
                name: `${client.user.username}  •  لوحة الاستجابة`,
                iconURL: client.user.displayAvatarURL({ dynamic: true })
            })
            .setDescription(
                `## 🏓  بـونـج!\n` +
                `\`\`\`\n${bar}\n\`\`\`` +
                `> الحالة :  **${status.label}**`
            )
            .addFields(
                {
                    name: '📡  بينج WebSocket',
                    value: `\`\`\`fix\n${ping_label(wsLatency)}\`\`\``,
                    inline: true
                },
                {
                    name: '⚡  وقت الاستجابة',
                    value: `\`\`\`fix\n${apiLatency} ms\`\`\``,
                    inline: true
                },
                {
                    name: '🧠  استهلاك الذاكرة',
                    value: `\`\`\`fix\n${fmtMemory(mem.heapUsed)} / ${fmtMemory(mem.rss)}\`\`\``,
                    inline: true
                },
                {
                    name: '⏳  وقت التشغيل',
                    value: `> ${uptime}`,
                    inline: false
                },
                {
                    name: '🌐  السيرفرات',
                    value: `\`${guilds.toLocaleString('ar-EG')}\``,
                    inline: true
                },
                {
                    name: '👥  المستخدمون',
                    value: `\`${users.toLocaleString('ar-EG')}\``,
                    inline: true
                },
                {
                    name: '🛠️  الإصدارات',
                    value: `Node.js \`${nodeVer}\`  •  discord.js \`v${djsVer}\``,
                    inline: true
                }
            )
            .setFooter({
                text: `🕌  ${nowKSA}`,
                iconURL: client.user.displayAvatarURL({ dynamic: true })
            })
            .setTimestamp();

        // ── تحديث الرسالة بالنتائج الحقيقية ────────────────────────────────
        if (isSlash) {
            await interactionOrMessage.editReply({ embeds: [resultEmbed] });
        } else {
            await sentMsg.edit({ embeds: [resultEmbed] });
        }
    }
};
