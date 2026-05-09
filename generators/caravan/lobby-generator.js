const { loadImage } = require('@napi-rs/canvas');
const {
    createCanvas, W, H, FA, FE, C,
    rr, drawBg, drawCornerAccents, divLine, M, R, L, truncate, toBuf,
} = require('./shared');

const CLASS_ICONS = {
    'Tank':     '🛡️',
    'Priest':   '✨',
    'Mage':     '🔮',
    'Summoner': '🐺',
    'Leader':   '👑',
};

const CLASS_AR = {
    'Tank':     'الطليعة',
    'Priest':   'الكاهن',
    'Mage':     'الساحر',
    'Summoner': 'المستدعي',
    'Leader':   'القائد',
};

/**
 * @param {string}  hostId
 * @param {string[]} party        — array of user IDs
 * @param {Map}     partyClasses  — Map<userId, className>
 * @param {object}  destConfig    — { name, emoji, color, cost }
 * @param {boolean} isAmbush
 * @param {Guild}   guild         — Discord.js Guild object (for member fetching)
 * @returns {Promise<Buffer>}
 */
async function generateLobbyImage(hostId, party, partyClasses, destConfig, isAmbush, guild) {
    const canvas = createCanvas(W, H);
    const ctx    = canvas.getContext('2d');

    const bgName = isAmbush ? 'banditattack' : 'hubbg';
    await drawBg(ctx, bgName);

    // Dark tint
    ctx.fillStyle = isAmbush ? 'rgba(30,0,0,0.55)' : 'rgba(4,6,15,0.50)';
    ctx.fillRect(0, 0, W, H);

    drawCornerAccents(ctx);

    const acc = isAmbush ? C.red : (destConfig?.color || C.gold);

    // Header gradient
    const hg = ctx.createLinearGradient(0, 0, 0, 160);
    hg.addColorStop(0, 'rgba(0,0,0,0.90)');
    hg.addColorStop(1, 'transparent');
    ctx.fillStyle = hg;
    ctx.fillRect(0, 0, W, 160);

    // Header separator
    const lineG = ctx.createLinearGradient(0, 0, W, 0);
    lineG.addColorStop(0,    'transparent');
    lineG.addColorStop(0.15, acc);
    lineG.addColorStop(0.85, acc);
    lineG.addColorStop(1,    'transparent');
    ctx.fillStyle = lineG;
    ctx.fillRect(0, 148, W, 2.5);

    // Title
    const title = isAmbush
        ? `⚔️ تحذير — قافلتك تتعرض لكمين!`
        : `🛡️ لوبي الحراسة — ${destConfig?.emoji || ''} ${destConfig?.name || 'رحلة'}`;
    ctx.shadowColor = acc + '88';
    ctx.shadowBlur  = 20;
    M(ctx, title, W / 2, 56, 44, C.text);
    ctx.shadowBlur = 0;

    const subtitle = isAmbush
        ? `قطاع الطرق يهاجمون! تحتاج إلى حراس لإنقاذ بضاعتك.`
        : `انتظر الحراس وابدأ الرحلة — بحد أقصى 3 أعضاء`;
    M(ctx, subtitle, W / 2, 106, 22, C.textD);

    // ── Party panel ──
    const PARTY_X = 80;
    const PARTY_Y = 178;
    const PARTY_W = W - 160;
    const PARTY_H = 240;

    rr(ctx, PARTY_X, PARTY_Y, PARTY_W, PARTY_H, 20);
    ctx.fillStyle = 'rgba(8,12,28,0.72)';
    ctx.fill();
    rr(ctx, PARTY_X, PARTY_Y, PARTY_W, PARTY_H, 20);
    ctx.strokeStyle = acc + '55';
    ctx.lineWidth   = 1.5;
    ctx.stroke();

    // Accent top bar
    rr(ctx, PARTY_X, PARTY_Y, PARTY_W, 4, [20, 20, 0, 0]);
    ctx.fillStyle = acc;
    ctx.fill();

    M(ctx, '👥 الفريق الحالي', W / 2, PARTY_Y + 28, 22, acc);
    divLine(ctx, PARTY_X + 20, PARTY_Y + 50, PARTY_W - 40, 'rgba(255,255,255,0.10)');

    // Member slots (3 max)
    const SLOT_W  = Math.floor((PARTY_W - 80) / 3);
    const SLOT_X0 = PARTY_X + 40;
    const SLOT_Y  = PARTY_Y + 66;
    const SLOT_H  = PARTY_H - 90;

    for (let i = 0; i < 3; i++) {
        const slotX   = SLOT_X0 + i * (SLOT_W + 20);
        const memberId = party[i];
        const cls      = memberId ? (partyClasses.get(memberId) || 'Leader') : null;

        rr(ctx, slotX, SLOT_Y, SLOT_W, SLOT_H, 14);
        ctx.fillStyle = memberId ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)';
        ctx.fill();
        rr(ctx, slotX, SLOT_Y, SLOT_W, SLOT_H, 14);
        ctx.strokeStyle = memberId ? (acc + '66') : 'rgba(255,255,255,0.10)';
        ctx.lineWidth   = 1.5;
        ctx.stroke();

        if (memberId && guild) {
            // Try to draw member avatar
            try {
                const member = guild.members.cache.get(memberId);
                const avatarUrl = member?.user?.displayAvatarURL({ extension: 'png', size: 64 });
                if (avatarUrl) {
                    const av = await loadImage(avatarUrl).catch(() => null);
                    if (av) {
                        const avSize = 56;
                        const avX    = slotX + (SLOT_W - avSize) / 2;
                        const avY    = SLOT_Y + 10;
                        ctx.save();
                        ctx.beginPath();
                        ctx.arc(avX + avSize / 2, avY + avSize / 2, avSize / 2, 0, Math.PI * 2);
                        ctx.clip();
                        ctx.drawImage(av, avX, avY, avSize, avSize);
                        ctx.restore();
                        ctx.strokeStyle = acc;
                        ctx.lineWidth   = 2;
                        ctx.beginPath();
                        ctx.arc(avX + avSize / 2, avY + avSize / 2, avSize / 2, 0, Math.PI * 2);
                        ctx.stroke();
                    }
                }
            } catch {}

            const displayName = guild.members.cache.get(memberId)?.displayName
                             || guild.members.cache.get(memberId)?.user?.username
                             || memberId;

            ctx.font      = `bold 16px ${FA}`;
            ctx.textAlign = 'center';
            ctx.fillStyle = C.text;
            ctx.fillText(truncate(displayName, 10), slotX + SLOT_W / 2, SLOT_Y + 80);

            const clsIcon = CLASS_ICONS[cls] || '⚔️';
            const clsAr   = CLASS_AR[cls]    || cls;
            ctx.font = `18px ${FE}`;
            ctx.fillText(clsIcon, slotX + SLOT_W / 2, SLOT_Y + 106);
            ctx.font      = `bold 14px ${FA}`;
            ctx.fillStyle = acc;
            ctx.fillText(clsAr, slotX + SLOT_W / 2, SLOT_Y + 130);
        } else {
            // Empty slot
            ctx.font      = `32px ${FE}`;
            ctx.textAlign = 'center';
            ctx.fillStyle = 'rgba(255,255,255,0.15)';
            ctx.fillText('➕', slotX + SLOT_W / 2, SLOT_Y + SLOT_H / 2);
            ctx.font      = `16px ${FA}`;
            ctx.fillStyle = 'rgba(255,255,255,0.25)';
            ctx.fillText('مكان شاغر', slotX + SLOT_W / 2, SLOT_Y + SLOT_H / 2 + 30);
        }
    }

    // ── Info panel (destination info or ambush notice) ──
    const INFO_Y = PARTY_Y + PARTY_H + 24;
    const INFO_H = 220;

    rr(ctx, PARTY_X, INFO_Y, PARTY_W, INFO_H, 20);
    ctx.fillStyle = 'rgba(8,12,28,0.72)';
    ctx.fill();
    rr(ctx, PARTY_X, INFO_Y, PARTY_W, INFO_H, 20);
    ctx.strokeStyle = acc + '44';
    ctx.lineWidth   = 1.5;
    ctx.stroke();

    rr(ctx, PARTY_X, INFO_Y, PARTY_W, 4, [20, 20, 0, 0]);
    ctx.fillStyle = acc;
    ctx.fill();

    if (isAmbush) {
        M(ctx, '⚠️ كيفية إنقاذ القافلة', W / 2, INFO_Y + 28, 22, acc);
        divLine(ctx, PARTY_X + 20, INFO_Y + 48, PARTY_W - 40, 'rgba(255,255,255,0.10)');

        const lines = [
            { icon: '🛡️', color: C.blue,  text: 'طلب فزعة — قاتل 5 موجات لإنقاذ بضاعتك بالكامل (تذكرة للحراس)' },
            { icon: '💰', color: C.gold,  text: 'دفع رشوة — استسلم وادفع للنجاة بـ 15% فقط من المكافآت' },
        ];
        let ly = INFO_Y + 72;
        for (const ln of lines) {
            ctx.font      = `28px ${FE}`;
            ctx.textAlign = 'right';
            ctx.fillStyle = ln.color;
            ctx.fillText(ln.icon, PARTY_X + PARTY_W - 40, ly);

            ctx.font      = `bold 20px ${FA}`;
            ctx.textAlign = 'right';
            ctx.fillStyle = C.text;
            ctx.fillText(ln.text, PARTY_X + PARTY_W - 80, ly);
            ly += 60;
        }
    } else {
        M(ctx, `${destConfig?.emoji || '🗺️'} الوجهة: ${destConfig?.name || '—'}`, W / 2, INFO_Y + 28, 22, acc);
        divLine(ctx, PARTY_X + 20, INFO_Y + 48, PARTY_W - 40, 'rgba(255,255,255,0.10)');

        const cost = destConfig?.cost?.toLocaleString?.() || '—';
        const details = [
            { label: 'تكلفة الرحلة', value: `${cost} مورا`, color: C.gold },
            { label: 'الحد الأقصى للفريق', value: '3 أعضاء', color: C.blue },
            { label: 'الموجات', value: '5 موجات قتال', color: C.green },
        ];

        const colW = Math.floor((PARTY_W - 80) / details.length);
        let dx = PARTY_X + 40;
        const dy = INFO_Y + 80;

        for (const d of details) {
            ctx.font      = `bold 24px ${FA}`;
            ctx.textAlign = 'center';
            ctx.fillStyle = d.color;
            ctx.fillText(d.value, dx + colW / 2, dy);
            ctx.font      = `17px ${FA}`;
            ctx.fillStyle = C.textD;
            ctx.fillText(d.label, dx + colW / 2, dy + 34);
            dx += colW;
        }

        // Waiting indicator
        M(ctx, `⏳ في انتظار ${3 - party.length} عضو إضافي...`, W / 2, INFO_Y + 160, 20, C.textD);
    }

    return toBuf(canvas);
}

module.exports = { generateLobbyImage };
