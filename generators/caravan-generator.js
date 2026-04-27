const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');
const fs   = require('fs');

try {
    const d = path.join(process.cwd(), 'fonts');
    const b = path.join(d, 'bein-ar-normal.ttf');
    const e = path.join(d, 'NotoEmoj.ttf');
    if (fs.existsSync(b)) GlobalFonts.registerFromPath(b, 'Bein');
    if (fs.existsSync(e)) GlobalFonts.registerFromPath(e, 'Emoji');
} catch {}

const W  = 1400;
const H  = 800;
const FA = '"Bein","Arial",sans-serif';
const FE = '"Emoji","Arial",sans-serif';

const C = {
    bg:      '#04060F',
    panel:   'rgba(10,14,28,0.94)',
    panelL:  'rgba(16,22,42,0.90)',
    gold:    '#F5C518',
    goldD:   '#C49A10',
    copper:  '#C87533',
    text:    '#EDE8D0',
    textD:   '#8A9AAA',
    green:   '#2ECC71',
    blue:    '#00BFFF',
    red:     '#E74C3C',
    purple:  '#9B59FF',
};

const DEST_ACCENT = {
    gold_city:        '#F5C518',
    magic_academy:    '#9B59FF',
    imperial_capital: '#E74C3C',
    ancient_ruins:    '#C87533',
    nature_valley:    '#2ECC71',
};

function rr(ctx, x, y, w, h, r = 14) {
    if (w < 0 || h < 0) return;
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y,     x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x,     y + h, r);
    ctx.arcTo(x,     y + h, x,     y,     r);
    ctx.arcTo(x,     y,     x + w, y,     r);
    ctx.closePath();
}

function drawBg(ctx) {
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0,    '#020408');
    sky.addColorStop(0.5,  '#06091A');
    sky.addColorStop(0.78, '#0D0804');
    sky.addColorStop(1,    '#160A02');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    for (let i = 0; i < 200; i++) {
        const sx = Math.random() * W;
        const sy = Math.random() * H * 0.72;
        const sr = Math.random() * 1.5 + 0.2;
        const sa = Math.random() * 0.6 + 0.1;
        ctx.globalAlpha = sa;
        ctx.fillStyle   = Math.random() > 0.85 ? '#FFF9C4' : '#FFFFFF';
        ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    const mx = W - 140, my = 180, mr = 46;
    const moon = ctx.createRadialGradient(mx - 10, my - 10, 5, mx, my, mr);
    moon.addColorStop(0,   '#FFFDE0');
    moon.addColorStop(0.5, '#FFE566');
    moon.addColorStop(1,   'rgba(255,220,50,0)');
    ctx.fillStyle   = moon;
    ctx.shadowColor = '#FFE566';
    ctx.shadowBlur  = 40;
    ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur  = 0;

    ctx.fillStyle = 'rgba(20,10,2,0.7)';
    ctx.beginPath();
    ctx.moveTo(0, H);
    ctx.bezierCurveTo(W * .10, H - 90,  W * .25, H - 145, W * .42, H - 110);
    ctx.bezierCurveTo(W * .58, H - 78,  W * .72, H - 130, W * .88, H - 95);
    ctx.bezierCurveTo(W * .94, H - 80,  W,       H - 60,  W,       H);
    ctx.closePath(); ctx.fill();

    ctx.fillStyle = '#100800';
    ctx.beginPath();
    ctx.moveTo(0, H);
    ctx.bezierCurveTo(W * .15, H - 55,  W * .35, H - 85,  W * .55, H - 55);
    ctx.bezierCurveTo(W * .70, H - 32,  W * .85, H - 70,  W,       H - 38);
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
}

function drawPanel(ctx, x, y, w, h, accent = C.gold, opts = {}) {
    const radius = opts.radius || 16;
    ctx.shadowColor = accent + '33';
    ctx.shadowBlur  = 20;

    const bg = ctx.createLinearGradient(x, y, x, y + h);
    bg.addColorStop(0, 'rgba(14,20,40,0.95)');
    bg.addColorStop(1, 'rgba(6,8,18,0.97)');
    rr(ctx, x, y, w, h, radius);
    ctx.fillStyle = bg; ctx.fill();
    ctx.shadowBlur = 0;

    rr(ctx, x, y, w, h, radius);
    ctx.strokeStyle = accent + '55';
    ctx.lineWidth   = 1.5;
    ctx.stroke();

    if (!opts.noCorners) {
        const cl = 20;
        ctx.strokeStyle = accent;
        ctx.lineWidth   = 2.5;
        ctx.shadowColor = accent;
        ctx.shadowBlur  = 10;
        ctx.beginPath();
        [
            [x, y + cl, x, y, x + cl, y],
            [x + w - cl, y, x + w, y, x + w, y + cl],
            [x + w, y + h - cl, x + w, y + h, x + w - cl, y + h],
            [x + cl, y + h, x, y + h, x, y + h - cl],
        ].forEach(([ax, ay, bx, by, cx2, cy2]) => {
            ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(cx2, cy2);
        });
        ctx.stroke();
        ctx.shadowBlur = 0;
    }
}

function drawBar(ctx, x, y, w, h, pct, color, showLabel = true) {
    if (isNaN(pct) || pct < 0) pct = 0;
    if (pct > 1) pct = 1;
    
    rr(ctx, x, y, w, h, h / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fill();

    const filled = Math.max(4, pct * w);
    const grad = ctx.createLinearGradient(x, 0, x + w, 0);
    grad.addColorStop(0, color + 'AA');
    grad.addColorStop(1, color);
    rr(ctx, x, y, filled, h, h / 2);
    ctx.fillStyle   = grad;
    ctx.shadowColor = color;
    ctx.shadowBlur  = 14;
    ctx.fill();
    ctx.shadowBlur  = 0;

    if (showLabel && h >= 16) {
        ctx.font         = `bold ${Math.max(11, h - 4)}px ${FA}`;
        ctx.fillStyle    = '#FFFFFF';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${(pct * 100).toFixed(0)}%`, x + w / 2, y + h / 2);
    }
}

function R(ctx, txt, x, y, size, color = C.text, bold = false) {
    ctx.font         = `${bold ? 'bold ' : ''}${size}px ${FA}`;
    ctx.fillStyle    = color;
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(txt, x, y);
}
function M(ctx, txt, x, y, size, color = C.text, bold = false) {
    ctx.font         = `${bold ? 'bold ' : ''}${size}px ${FA}`;
    ctx.fillStyle    = color;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(txt, x, y);
}
function L(ctx, txt, x, y, size, color = C.text, bold = false) {
    ctx.font         = `${bold ? 'bold ' : ''}${size}px ${FA}`;
    ctx.fillStyle    = color;
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(txt, x, y);
}

function divLine(ctx, x, y, w, color = 'rgba(255,255,255,0.12)') {
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0,   'transparent');
    g.addColorStop(0.15, color);
    g.addColorStop(0.85, color);
    g.addColorStop(1,   'transparent');
    ctx.strokeStyle = g; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.stroke();
}

async function drawHeader(ctx, user, title, subtitle = '') {
    const hg = ctx.createLinearGradient(0, 0, 0, 108);
    hg.addColorStop(0, 'rgba(0,0,0,0.80)');
    hg.addColorStop(1, 'rgba(0,0,0,0.50)');
    ctx.fillStyle = hg;
    ctx.fillRect(0, 0, W, 108);

    const lineG = ctx.createLinearGradient(0, 0, W, 0);
    lineG.addColorStop(0,   'transparent');
    lineG.addColorStop(0.3, C.gold);
    lineG.addColorStop(0.7, C.gold);
    lineG.addColorStop(1,   'transparent');
    ctx.fillStyle = lineG;
    ctx.fillRect(0, 106, W, 2);

    try {
        const av = await loadImage(user.displayAvatarURL({ extension: 'png', size: 128 }));
        ctx.save();
        ctx.beginPath(); ctx.arc(56, 54, 40, 0, Math.PI * 2); ctx.clip();
        ctx.drawImage(av, 16, 14, 80, 80);
        ctx.restore();
        ctx.strokeStyle = C.gold; ctx.lineWidth = 2.5;
        ctx.shadowColor = C.gold; ctx.shadowBlur  = 12;
        ctx.beginPath(); ctx.arc(56, 54, 40, 0, Math.PI * 2); ctx.stroke();
        ctx.shadowBlur  = 0;
    } catch {}

    L(ctx, truncate(user.username, 20), 108, subtitle ? 40 : 54, 22, C.gold, true);
    if (subtitle) L(ctx, subtitle, 108, 68, 15, C.textD);

    ctx.shadowColor = C.gold + '66'; ctx.shadowBlur = 16;
    M(ctx, title, W / 2, 54, 30, C.text, true);
    ctx.shadowBlur = 0;
}

function drawStars(ctx, n, max, x, y, size, color = C.gold) {
    ctx.font         = `bold ${size}px ${FA}`;
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = color;
    ctx.shadowColor  = color; ctx.shadowBlur = 8;
    ctx.fillText('★'.repeat(Math.min(n, max)) + '☆'.repeat(Math.max(0, max - n)), x, y);
    ctx.shadowBlur   = 0;
}

function caravanRank(trips) {
    if (trips >= 51) return { name: 'أسطورة التجارة', color: '#FFD700' };
    if (trips >= 21) return { name: 'سيد القوافل',    color: '#C49A10' };
    if (trips >= 11) return { name: 'تاجر مشهور',    color: '#C87533' };
    if (trips >=  6) return { name: 'تاجر ماهر',     color: '#8888FF' };
    if (trips >=  3) return { name: 'تاجر محلي',     color: '#2ECC71' };
    return               { name: 'تاجر مبتدئ',        color: '#8A9AAA' };
}

function getRepRankInfo(points) {
    if (points >= 9999) return { name: '🎇 رتبة SSS', color: '#FFD700' };
    if (points >= 1000) return { name: '👑 رتبة SS',  color: '#FF00FF' };
    if (points >= 500)  return { name: '💎 رتبة S',   color: '#00FFFF' };
    if (points >= 250)  return { name: '🥇 رتبة A',   color: '#FFD700' };
    if (points >= 100)  return { name: '🥈 رتبة B',   color: '#C0C0C0' };
    if (points >= 50)   return { name: '🥉 رتبة C',   color: '#CD7F32' };
    if (points >= 25)   return { name: '⚔️ رتبة D',   color: '#2E8B57' };
    if (points >= 10)   return { name: '🛡️ رتبة E',   color: '#8B4513' };
    return                     { name: '🪵 رتبة F',   color: '#A0522D' };
}

function truncate(txt, maxChars) {
    if (!txt) return '';
    const str = String(txt);
    return str.length > maxChars ? str.substring(0, maxChars - 1) + '…' : str;
}

async function toBuf(canvas) {
    return await (canvas.encode ? canvas.encode('png') : canvas.toBuffer('image/png'));
}

function parseSafeArray(data) {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    try { return JSON.parse(data); } catch { return []; }
}

async function generateCaravanHub(user, stats, active, mora, profExtra = {}) {
    const cfg = require('../json/caravan-config.json');
    const canvas = createCanvas(W, H);
    const ctx    = canvas.getContext('2d');
    drawBg(ctx);
    await drawHeader(ctx, user, '✦ نظام القوافل الإمبراطوري ✦');

    const trips   = Number(stats.total_trips      || 0);
    const success = Number(stats.successful_trips || 0);
    const rank    = caravanRank(success);
    const level   = Number(profExtra.level    || 1);
    const repPts  = Number(profExtra.repPoints || 0);
    const repRank = getRepRankInfo(repPts);

    const LX = 22, LY = 118, LW = 340, LH = 600;
    drawPanel(ctx, LX, LY, LW, LH, rank.color);

    try {
        const av = await loadImage(user.displayAvatarURL({ extension: 'png', size: 256 }));
        ctx.save();
        ctx.beginPath(); ctx.arc(LX + LW / 2, LY + 66, 52, 0, Math.PI * 2); ctx.clip();
        ctx.drawImage(av, LX + LW / 2 - 52, LY + 14, 104, 104);
        ctx.restore();
        ctx.strokeStyle = rank.color; ctx.lineWidth = 3;
        ctx.shadowColor = rank.color; ctx.shadowBlur = 14;
        ctx.beginPath(); ctx.arc(LX + LW / 2, LY + 66, 52, 0, Math.PI * 2); ctx.stroke();
        ctx.shadowBlur  = 0;
    } catch {}

    rr(ctx, LX + 14, LY + 14, 52, 24, 8);
    ctx.fillStyle = 'rgba(0,0,0,0.70)'; ctx.fill();
    ctx.strokeStyle = C.gold + '99'; ctx.lineWidth = 1;
    rr(ctx, LX + 14, LY + 14, 52, 24, 8); ctx.stroke();
    M(ctx, `لv.${level}`, LX + 40, LY + 26, 13, C.gold, true);

    M(ctx, truncate(user.username, 18), LX + LW / 2, LY + 136, 19, C.text, true);

    ctx.shadowColor = rank.color; ctx.shadowBlur = 10;
    M(ctx, `✦ ${rank.name} ✦`, LX + LW / 2, LY + 160, 15, rank.color, true);
    ctx.shadowBlur = 0;

    const repBadgeW = Math.min(220, LW - 40);
    rr(ctx, LX + (LW - repBadgeW) / 2, LY + 176, repBadgeW, 22, 6);
    ctx.fillStyle = repRank.color + '22'; ctx.fill();
    ctx.strokeStyle = repRank.color + '77'; ctx.lineWidth = 1;
    rr(ctx, LX + (LW - repBadgeW) / 2, LY + 176, repBadgeW, 22, 6); ctx.stroke();
    M(ctx, `${repRank.name}  •  ${repPts.toLocaleString()} نقطة`, LX + LW / 2, LY + 187, 13, repRank.color, true);

    divLine(ctx, LX + 20, LY + 207, LW - 40, rank.color + '44');

    const statItems = [
        { label: 'إجمالي الرحلات', val: String(trips) },
        { label: 'الناجحة',        val: String(success) },
        { label: 'نسبة النجاح',    val: trips ? `${((success / trips) * 100).toFixed(0)}%` : '—' },
    ];
    let sy = LY + 228;
    for (const s of statItems) {
        rr(ctx, LX + 16, sy - 11, LW - 32, 24, 6);
        ctx.fillStyle = 'rgba(255,255,255,0.03)'; ctx.fill();
        R(ctx, s.label,    LX + LW - 18, sy + 1, 14, C.textD);
        ctx.shadowColor = C.gold; ctx.shadowBlur = 5;
        L(ctx, s.val,      LX + 18,       sy + 1, 14, C.gold, true);
        ctx.shadowBlur = 0;
        sy += 28;
    }

    divLine(ctx, LX + 20, sy + 4, LW - 40, rank.color + '44');
    sy += 20;

    M(ctx, '— مستوى الترقيات —', LX + LW / 2, sy, 13, C.textD);
    sy += 24;

    const upgCfg = [
        { key: 'capacity_rank', emoji: '📦', name: 'الحمولة', col: '#FF9933' },
        { key: 'speed_rank',    emoji: '⚡', name: 'السرعة',  col: '#00C3FF' },
        { key: 'defense_rank',  emoji: '🛡️', name: 'الدرع',   col: '#8888FF' },
        { key: 'luck_rank',     emoji: '🍀', name: 'الحظ',    col: '#2ECC71' },
    ];
    for (const u of upgCfg) {
        const lvl2 = Number(stats[u.key] || 1);
        rr(ctx, LX + 14, sy - 8, LW - 28, 38, 7);
        ctx.fillStyle = 'rgba(255,255,255,0.03)'; ctx.fill();
        ctx.font = `18px ${FE}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(u.emoji, LX + 18, sy + 11);
        L(ctx, u.name, LX + 42, sy + 11, 14, C.text);
        drawStars(ctx, lvl2, 5, LX + LW - 16, sy + 11, 16, u.col);
        drawBar(ctx, LX + 16, sy + 25, LW - 32, 7, lvl2 / 5, u.col, false);
        sy += 42;
    }

    divLine(ctx, LX + 20, sy + 2, LW - 40, C.gold + '44');
    sy += 16;
    ctx.shadowColor = C.gold; ctx.shadowBlur = 8;
    M(ctx, `💰 ${Number(mora).toLocaleString()} مورا`, LX + LW / 2, sy + 12, 17, C.gold, true);
    ctx.shadowBlur = 0;

    const MX = 374, MY = 118, MW = 650, MH = 600;

    const halo = ctx.createRadialGradient(MX + MW / 2, MY + MH * 0.6, 30, MX + MW / 2, MY + MH * 0.6, 240);
    halo.addColorStop(0, 'rgba(245,197,24,0.10)');
    halo.addColorStop(1, 'transparent');
    ctx.fillStyle = halo;
    ctx.fillRect(MX, MY, MW, MH);

    const starX = MX + MW / 2, starY = MY + MH * 0.55;
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 6) {
        ctx.strokeStyle = C.gold + '18'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(starX, starY);
        ctx.lineTo(starX + Math.cos(angle) * 200, starY + Math.sin(angle) * 200);
        ctx.stroke();
    }

    ctx.font = `190px ${FE}`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor  = C.gold; ctx.shadowBlur = 50;
    ctx.fillText('🐪', MX + MW / 2, MY + MH * 0.55);
    ctx.shadowBlur   = 0;

    ctx.shadowColor = C.gold + '88'; ctx.shadowBlur = 12;
    M(ctx, '✦ قافلتك الإمبراطورية ✦', MX + MW / 2, MY + MH - 55, 20, C.gold, true);
    ctx.shadowBlur = 0;
    M(ctx, 'شاشة الإدارة المركزية', MX + MW / 2, MY + MH - 26, 15, C.textD);

    const RX = 1036, RY = 118, RW = 342, RH = 600;

    if (active) {
        const destId = active.destinationid || active.destinationId;
        const dest   = cfg.destinations.find(d => d.id === destId) || {};
        const acc    = dest.color || C.gold;
        const now    = Date.now();
        const start  = Number(active.starttime  || active.startTime  || now);
        const end    = Number(active.endtime    || active.endTime    || now);
        
        const prog   = (end <= start) ? 1 : Math.min(1, Math.max(0, (now - start) / (end - start)));
        const tleft  = Math.max(0, end - now);
        const hrs    = Math.floor(tleft / 3600000);
        const mns    = Math.floor((tleft % 3600000) / 60000);
        const atkRes = Number(active.attackresolved || active.attackResolved || 0);
        const hasAtk = atkRes === 0 && (active.guardmessageid || active.guardMessageId);

        drawPanel(ctx, RX, RY, RW, RH, acc);

        M(ctx, '🗺️ رحلة نشطة', RX + RW / 2, RY + 30, 20, acc, true);
        divLine(ctx, RX + 18, RY + 50, RW - 36, acc + '55');

        ctx.font = `68px ${FE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.shadowColor = acc; ctx.shadowBlur = 22;
        ctx.fillText(dest.emoji || '🚀', RX + RW / 2, RY + 110);
        ctx.shadowBlur = 0;

        M(ctx, dest.name || destId,    RX + RW / 2, RY + 158, 20, acc,    true);
        M(ctx, dest.description || '', RX + RW / 2, RY + 182, 13, C.textD);

        divLine(ctx, RX + 18, RY + 204, RW - 36, acc + '44');

        const stMap = {
            'ok':  { t: '🟢 في الطريق',    c: C.green },
            'atk': { t: '⚔️ تحت الهجوم!', c: C.red   },
            '1':   { t: '🛡️ نجحت الحراسة', c: C.blue  },
            '2':   { t: '😔 فشلت الحراسة', c: '#FFA500' },
            '-1':  { t: '💀 تم النهب',     c: '#FF2222' },
        };
        const stk = hasAtk ? 'atk' : atkRes !== 0 ? String(atkRes) : 'ok';
        const st  = stMap[stk] || stMap['ok'];
        ctx.shadowColor = st.c; ctx.shadowBlur = 8;
        M(ctx, st.t, RX + RW / 2, RY + 228, 18, st.c, true);
        ctx.shadowBlur = 0;

        M(ctx, `${(prog * 100).toFixed(1)}%`, RX + RW / 2, RY + 260, 22, acc, true);
        drawBar(ctx, RX + 18, RY + 278, RW - 36, 22, prog, acc);

        M(ctx, `الوصول المتوقع بعد ${hrs} ساعة و ${mns} دقيقة`, RX + RW / 2, RY + 330, 15, C.textD);

        divLine(ctx, RX + 18, RY + 368, RW - 36, acc + '44');

        const rm   = Number(active.rewardmultiplier || active.rewardMultiplier || 1);
        const rmC  = rm >= 1 ? C.green : rm >= 0.6 ? C.gold : C.red;
        M(ctx, 'معامل المكافأة', RX + RW / 2, RY + 392, 15, C.textD);
        ctx.shadowColor = rmC; ctx.shadowBlur = 10;
        M(ctx, `× ${rm.toFixed(2)}`, RX + RW / 2, RY + 416, 26, rmC, true);
        ctx.shadowBlur = 0;

        divLine(ctx, RX + 18, RY + 444, RW - 36, acc + '44');

        const rawArts = active.equippedartifacts || active.equippedArtifacts;
        const arts = parseSafeArray(rawArts);
        M(ctx, `الأدوات المجهزة ${arts.length} من 3`, RX + RW / 2, RY + 468, 15, C.textD);

    } else {
        drawPanel(ctx, RX, RY, RW, RH, '#334455');

        M(ctx, '📭 لا رحلة نشطة', RX + RW / 2, RY + 30, 20, '#556677', true);
        divLine(ctx, RX + 18, RY + 50, RW - 36, '#33445566');

        ctx.globalAlpha = 0.18;
        ctx.font = `100px ${FE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('🏜️', RX + RW / 2, RY + 180);
        ctx.globalAlpha = 1;

        M(ctx, 'أرسل قافلتك الآن', RX + RW / 2, RY + 270, 22, '#5A6A7A', true);
        M(ctx, 'واجمع الثروات والمكافآت', RX + RW / 2, RY + 298, 15, '#3A4A5A');

        divLine(ctx, RX + 18, RY + 330, RW - 36, '#22334455');

        M(ctx, `الرحلات الناجحة ${success} من أصل ${trips}`, RX + RW / 2, RY + 362, 16, '#445566');
        const pct = trips > 0 ? ((success / trips) * 100).toFixed(0) : 0;
        drawBar(ctx, RX + 18, RY + 386, RW - 36, 16, pct / 100, '#445566', false);
        M(ctx, `نسبة النجاح ${pct}%`, RX + RW / 2, RY + 416, 14, '#556677');
    }

    const barY = H - 82;
    ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(0, barY, W, 82);
    divLine(ctx, 0, barY, W, C.gold + '55');

    const btns = [
        { label: '📤 إرسال رحلة', col: C.gold },
        { label: '🗺️ حالة الرحلة', col: C.blue },
        { label: '🏗️ الترقيات',   col: C.purple },
        { label: '🔮 التجهيز',    col: C.green },
    ];
    const bw = 290, bg = 26, bstart = (W - (btns.length * bw + (btns.length - 1) * bg)) / 2;
    btns.forEach((b, i) => {
        const bx = bstart + i * (bw + bg), by = barY + 14, bh = 46;
        const gr = ctx.createLinearGradient(bx, by, bx + bw, by + bh);
        gr.addColorStop(0, b.col + '25'); gr.addColorStop(1, b.col + '10');
        rr(ctx, bx, by, bw, bh, 10);
        ctx.fillStyle = gr; ctx.fill();
        ctx.strokeStyle = b.col + '99'; ctx.lineWidth = 1.5;
        rr(ctx, bx, by, bw, bh, 10); ctx.stroke();
        M(ctx, b.label, bx + bw / 2, by + bh / 2, 18, b.col, true);
    });

    return toBuf(canvas);
}
module.exports.generateCaravanHub = generateCaravanHub;

async function generateSendMap(user, stats, mora) {
    const cfg  = require('../json/caravan-config.json');
    const core = require('../handlers/caravan-core.js');
    const canvas = createCanvas(W, H);
    const ctx    = canvas.getContext('2d');
    drawBg(ctx);
    await drawHeader(ctx, user, '🗺️ خريطة الوجهات', `رصيدك ${Number(mora).toLocaleString()} مورا`);

    const DESTS = cfg.destinations;
    const cw = 252, ch = 318, cgap = 12;
    const totalW = DESTS.length * cw + (DESTS.length - 1) * cgap;
    const startX = (W - totalW) / 2;
    const cardY  = 118;

    DESTS.forEach((d, i) => {
        const cx   = startX + i * (cw + cgap);
        const acc  = d.color || C.gold;
        const canAfford = Number(mora) >= d.cost;

        const bg = ctx.createLinearGradient(cx, cardY, cx, cardY + ch);
        bg.addColorStop(0, acc + '22'); bg.addColorStop(1, 'rgba(4,6,14,0.97)');
        rr(ctx, cx, cardY, cw, ch, 16);
        ctx.fillStyle = bg; ctx.fill();
        ctx.strokeStyle = acc + (canAfford ? 'CC' : '44');
        ctx.lineWidth   = canAfford ? 2 : 1;
        ctx.shadowColor = canAfford ? acc : 'transparent';
        ctx.shadowBlur  = canAfford ? 14 : 0;
        rr(ctx, cx, cardY, cw, ch, 16); ctx.stroke();
        ctx.shadowBlur  = 0;

        ctx.font = `58px ${FE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.shadowColor = acc; ctx.shadowBlur = 20;
        ctx.fillText(d.emoji, cx + cw / 2, cardY + 60);
        ctx.shadowBlur = 0;

        ctx.shadowColor = acc; ctx.shadowBlur = 8;
        M(ctx, d.name, cx + cw / 2, cardY + 106, 19, acc, true);
        ctx.shadowBlur = 0;

        divLine(ctx, cx + 16, cardY + 124, cw - 32, acc + '44');

        const desc = d.description || '';
        const words = desc.split(' ');
        let line = '', lines = [];
        ctx.font = `13px ${FA}`;
        for (const w2 of words) {
            const test = line ? line + ' ' + w2 : w2;
            if (ctx.measureText(test).width > cw - 28) { lines.push(line); line = w2; }
            else line = test;
        }
        if (line) lines.push(line);
        lines.slice(0, 2).forEach((ln, li) => {
            M(ctx, ln, cx + cw / 2, cardY + 144 + li * 18, 13, C.textD);
        });

        const adjDur  = core.calcDuration(d, { speed_rank: Number(stats.speed_rank || 1) }, { speedBuff: 0 });
        const adjRisk = core.calcRiskFactor(d, { defense_rank: Number(stats.defense_rank || 1) });
        const hrs     = Math.floor(adjDur / 3600000);
        const mns     = Math.floor((adjDur % 3600000) / 60000);
        const riskC   = adjRisk >= 0.35 ? C.red : adjRisk >= 0.25 ? '#FFA500' : C.green;

        const rows = [
            { label: '⏱ المدة',    val: `${hrs}س و ${mns}د`,                    vc: C.text    },
            { label: '⚠️ الخطر',   val: `${(adjRisk * 100).toFixed(0)}%`,       vc: riskC     },
            { label: '💰 التكلفة', val: `${d.cost.toLocaleString()} مورا`,     vc: canAfford ? C.gold : C.red },
        ];
        let ry = cardY + 192;
        for (const row of rows) {
            rr(ctx, cx + 12, ry - 12, cw - 24, 26, 6);
            ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fill();
            R(ctx, row.label, cx + cw - 16,  ry, 13, C.textD);
            L(ctx, row.val,   cx + 16,        ry, 14, row.vc, true);
            ry += 34;
        }

        divLine(ctx, cx + 16, ry - 2, cw - 32, acc + '44');
        const typeMap = { mora: '🟡 مورا', xp: '✨ خبرة', reputation: '🌟 سمعة', artifact: '📦 تحفة', nature: '🌱 طبيعة' };
        M(ctx, typeMap[d.reward_type] || '?', cx + cw / 2, ry + 18, 15, acc, true);

        if (!canAfford) {
            rr(ctx, cx + cw / 2 - 55, cardY + ch - 34, 110, 26, 8);
            ctx.fillStyle = 'rgba(231,76,60,0.30)'; ctx.fill();
            ctx.strokeStyle = C.red + '88'; ctx.lineWidth = 1;
            rr(ctx, cx + cw / 2 - 55, cardY + ch - 34, 110, 26, 8); ctx.stroke();
            M(ctx, '❌ رصيد غير كافٍ', cx + cw / 2, cardY + ch - 21, 13, C.red, true);
        }
    });

    const fy = cardY + ch + 16;
    divLine(ctx, 30, fy, W - 60, C.gold + '33');
    M(ctx, 'اختر وجهتك من القائمة أدناه', W / 2, fy + 24, 17, C.textD);
    M(ctx, `إجمالي رصيدك ${Number(mora).toLocaleString()} مورا`, W / 2, fy + 50, 16, C.gold, true);

    return toBuf(canvas);
}
module.exports.generateSendMap = generateSendMap;

async function generateCaravanStatus(user, caravan, stats, dest) {
    const canvas = createCanvas(W, H);
    const ctx    = canvas.getContext('2d');
    const now    = Date.now();
    const start  = Number(caravan.starttime || caravan.startTime || now);
    const end    = Number(caravan.endtime   || caravan.endTime   || now);
    
    const prog   = (end <= start) ? 1 : Math.min(1, Math.max(0, (now - start) / (end - start)));
    const tleft  = Math.max(0, end - now);
    const hrs    = Math.floor(tleft / 3600000);
    const mns    = Math.floor((tleft % 3600000) / 60000);
    const secs   = Math.floor((tleft % 60000) / 1000);
    const acc    = dest?.color || C.gold;
    const atkRes = Number(caravan.attackresolved || caravan.attackResolved || 0);
    const hasAtk = atkRes === 0 && (caravan.guardmessageid || caravan.guardMessageId);
    const rm     = Number(caravan.rewardmultiplier || caravan.rewardMultiplier || 1);

    drawBg(ctx);
    const subTitle = tleft <= 0 ? '✅ وصلت الوجهة' : `⏳ متبقي ${hrs}س و ${mns}د`;
    await drawHeader(ctx, user, `${dest?.emoji || ''} ${dest?.name || 'رحلة'}`, subTitle);

    const MX = 22, MY = 118, MW = 740, MH = 570;
    drawPanel(ctx, MX, MY, MW, MH, acc);

    ctx.strokeStyle = 'rgba(255,255,255,0.025)'; ctx.lineWidth = 1;
    for (let gx = MX + 50; gx < MX + MW; gx += 70) { ctx.beginPath(); ctx.moveTo(gx, MY); ctx.lineTo(gx, MY + MH); ctx.stroke(); }
    for (let gy = MY + 50; gy < MY + MH; gy += 70) { ctx.beginPath(); ctx.moveTo(MX, gy); ctx.lineTo(MX + MW, gy); ctx.stroke(); }

    const oX = MX + 80,       oY = MY + MH - 80;
    const dX = MX + MW - 80,  dY = MY + 90;
    const cpX = (oX + dX) / 2, cpY = (oY + dY) / 2 - 80;

    const t  = prog;
    const cX = (1 - t) * (1 - t) * oX + 2 * (1 - t) * t * cpX + t * t * dX;
    const cY = (1 - t) * (1 - t) * oY + 2 * (1 - t) * t * cpY + t * t * dY;

    ctx.setLineDash([10, 8]);
    ctx.strokeStyle = acc + '28'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(oX, oY); ctx.quadraticCurveTo(cpX, cpY, dX, dY); ctx.stroke();
    ctx.setLineDash([]);

    const pathG = ctx.createLinearGradient(oX, oY, cX, cY);
    pathG.addColorStop(0, acc + '55'); pathG.addColorStop(1, acc);
    ctx.strokeStyle = pathG; ctx.lineWidth = 6;
    ctx.shadowColor = acc; ctx.shadowBlur = 20;
    ctx.beginPath(); ctx.moveTo(oX, oY); ctx.quadraticCurveTo(cpX, cpY, cX, cY); ctx.stroke();
    ctx.shadowBlur  = 0;

    ctx.fillStyle = C.green; ctx.shadowColor = C.green; ctx.shadowBlur = 16;
    ctx.beginPath(); ctx.arc(oX, oY, 12, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    M(ctx, '🏠', oX, oY - 28, 22, C.text);
    M(ctx, 'المدينة', oX, oY + 28, 14, C.green);

    ctx.fillStyle = acc; ctx.shadowColor = acc; ctx.shadowBlur = 22;
    ctx.beginPath(); ctx.arc(dX, dY, 14, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.font = `32px ${FE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(dest?.emoji || '📍', dX, dY - 44);
    M(ctx, dest?.name || '', dX, dY + 30, 14, acc, true);

    const camelEmoji = hasAtk ? '⚔️' : '🐪';
    ctx.font = `52px ${FE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = hasAtk ? C.red : acc; ctx.shadowBlur = 30;
    ctx.fillText(camelEmoji, cX, cY - 6);
    ctx.shadowBlur = 0;

    if (hasAtk) {
        const bw2 = 200, bx2 = cX - 100, by2 = cY - 72;
        rr(ctx, bx2, by2, bw2, 34, 10);
        ctx.fillStyle = 'rgba(231,76,60,0.88)'; ctx.fill();
        ctx.strokeStyle = C.red; ctx.lineWidth = 1.5;
        rr(ctx, bx2, by2, bw2, 34, 10); ctx.stroke();
        M(ctx, '⚔️ تحت الهجوم', cX, by2 + 17, 15, '#FFFFFF', true);
    }

    const barY2 = MY + MH - 44;
    M(ctx, `${(prog * 100).toFixed(1)}%`, MX + MW / 2, barY2 - 18, 17, acc, true);
    drawBar(ctx, MX + 22, barY2, MW - 44, 28, prog, acc);

    const RX = 774, RY = 118, RW = 604, RH = 570;
    drawPanel(ctx, RX, RY, RW, RH, acc);

    let py = RY + 28;
    M(ctx, '📊 تفاصيل الرحلة', RX + RW / 2, py, 22, acc, true);
    py += 34; divLine(ctx, RX + 20, py, RW - 40, acc + '55'); py += 22;

    ctx.font = `56px ${FE}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.shadowColor = acc; ctx.shadowBlur = 18;
    ctx.fillText(dest?.emoji || '📍', RX + 22, py + 26);
    ctx.shadowBlur = 0;
    R(ctx, dest?.name || '',        RX + RW - 18, py + 10, 22, acc, true);
    R(ctx, dest?.description || '', RX + RW - 18, py + 36, 13, C.textD);
    py += 64; divLine(ctx, RX + 20, py, RW - 40); py += 18;

    const stMap2 = {
        'ok':  { t: '🟢 في الطريق',    c: C.green },
        'atk': { t: '⚔️ تحت الهجوم', c: C.red   },
        '1':   { t: '🛡️ نجحت الحراسة', c: C.blue  },
        '2':   { t: '😔 فشلت الحراسة', c: '#FFA500' },
        '-1':  { t: '💀 تم النهب',     c: '#FF2222' },
    };
    const stk2 = hasAtk ? 'atk' : atkRes !== 0 ? String(atkRes) : 'ok';
    const st2  = stMap2[stk2] || stMap2['ok'];
    const rmC  = rm >= 1 ? C.green : rm >= 0.6 ? C.gold : C.red;
    
    const rawArts = caravan.equippedartifacts || caravan.equippedArtifacts;
    const arts = parseSafeArray(rawArts);

    const infoRows = [
        { label: 'الحالة',          val: st2.t,                                    vc: st2.c   },
        { label: 'التقدم',          val: `${(prog * 100).toFixed(1)}%`,             vc: acc     },
        { label: 'الوقت المتبقي',   val: tleft <= 0 ? 'وصلت' : `${hrs}س ${mns}د ${secs}ث`, vc: tleft <= 0 ? C.green : C.text },
        { label: 'معامل المكافأة',  val: `× ${rm.toFixed(2)}`,                    vc: rmC     },
        { label: 'الأدوات المجهزة', val: `${arts.length} من 3`,                    vc: C.purple },
    ];

    for (const row of infoRows) {
        rr(ctx, RX + 18, py - 14, RW - 36, 32, 8);
        ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fill();
        R(ctx, row.label,    RX + RW - 22, py + 2, 15, C.textD);
        ctx.shadowColor = row.vc; ctx.shadowBlur = 6;
        L(ctx, row.val,            RX + 22,       py + 2, 16, row.vc, true);
        ctx.shadowBlur = 0;
        py += 36;
    }

    divLine(ctx, RX + 20, py, RW - 40); py += 18;

    M(ctx, 'تقدم الرحلة', RX + RW / 2, py + 10, 15, C.textD);
    py += 26; drawBar(ctx, RX + 22, py, RW - 44, 20, prog, acc); py += 32;

    if (tleft > 0) {
        M(ctx, `الوصول المتوقع بعد ${hrs} ساعة و ${mns} دقيقة`, RX + RW / 2, py + 14, 15, C.textD);
        py += 36;
    }

    if (arts.length > 0) {
        divLine(ctx, RX + 20, py, RW - 40); py += 16;
        M(ctx, '🔮 الأدوات المجهزة', RX + RW / 2, py + 10, 15, C.purple, true);
        py += 28;
        arts.forEach(a => {
            M(ctx, `• ${a}`, RX + RW / 2, py, 13, C.textD);
            py += 20;
        });
    }

    return toBuf(canvas);
}
module.exports.generateCaravanStatus = generateCaravanStatus;

async function generateUpgradePanel(user, stats, mora) {
    const cfg    = require('../json/caravan-config.json');
    const canvas = createCanvas(W, H);
    const ctx    = canvas.getContext('2d');
    drawBg(ctx);
    await drawHeader(ctx, user, '🏗️ ترقية القافلة', `رصيدك ${Number(mora).toLocaleString()} مورا`);

    const upgList = [
        { key: 'capacity_rank', name: cfg.upgrades.capacity.name, emoji: cfg.upgrades.capacity.emoji,
          max_level: cfg.upgrades.capacity.max_level, costs: cfg.upgrades.capacity.costs,
          effectLabel: `زيادة المكافآت بنسبة ${(cfg.upgrades.capacity.bonus_per_level * 100).toFixed(0)}% لكل مستوى`,
          col: '#FF9933' },
        { key: 'speed_rank',    name: cfg.upgrades.speed.name,    emoji: cfg.upgrades.speed.emoji,
          max_level: cfg.upgrades.speed.max_level,    costs: cfg.upgrades.speed.costs,
          effectLabel: `تقليل المدة بنسبة ${(cfg.upgrades.speed.time_reduction * 100).toFixed(0)}% لكل مستوى`,
          col: '#00C3FF' },
        { key: 'defense_rank',  name: cfg.upgrades.defense.name,  emoji: cfg.upgrades.defense.emoji,
          max_level: cfg.upgrades.defense.max_level,  costs: cfg.upgrades.defense.costs,
          effectLabel: `تقليل الخطر بنسبة ${(cfg.upgrades.defense.risk_reduction * 100).toFixed(0)}% لكل مستوى`,
          col: '#8888FF' },
        { key: 'luck_rank',     name: cfg.upgrades.luck.name,     emoji: cfg.upgrades.luck.emoji,
          max_level: cfg.upgrades.luck.max_level,     costs: cfg.upgrades.luck.costs,
          effectLabel: `زيادة فرص الحظ بنسبة ${(cfg.upgrades.luck.bonus_per_level * 100).toFixed(0)}% لكل مستوى`,
          col: '#2ECC71' },
    ];

    const cw = 640, ch = 278, gap = 16;
    const gx0 = (W - (2 * cw + gap)) / 2; 
    const gy0 = 120;

    upgList.forEach((u, i) => {
        const col   = u.col;
        const rank  = Number(stats[u.key] || 1);
        const maxed = rank >= u.max_level;
        const cost  = maxed ? 0 : (u.costs[rank] || 0);
        const canAf = !maxed && Number(mora) >= cost;
        const cx    = gx0 + (i % 2) * (cw + gap);
        const cy    = gy0 + Math.floor(i / 2) * (ch + gap);

        drawPanel(ctx, cx, cy, cw, ch, col);

        if (maxed) {
            rr(ctx, cx + 16, cy + 16, 68, 26, 8);
            ctx.fillStyle   = col + 'CC'; ctx.fill();
            ctx.shadowColor = col; ctx.shadowBlur = 10;
            M(ctx, '✦ MAX ✦', cx + 50, cy + 29, 13, '#FFF', true);
            ctx.shadowBlur  = 0;
        } else {
            rr(ctx, cx + 16, cy + 16, 62, 26, 8);
            ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fill();
            ctx.strokeStyle = col + '88'; ctx.lineWidth = 1;
            rr(ctx, cx + 16, cy + 16, 62, 26, 8); ctx.stroke();
            M(ctx, `${rank} من ${u.max_level}`, cx + 47, cy + 29, 13, col, true);
        }

        ctx.shadowColor  = col; ctx.shadowBlur = 8;
        R(ctx, u.name, cx + cw - 20, cy + 34, 24, col, true);
        ctx.shadowBlur   = 0;

        R(ctx, u.effectLabel, cx + cw - 20, cy + 64, 15, C.textD);

        ctx.font = `54px ${FE}`;
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'middle';
        ctx.shadowColor  = col; ctx.shadowBlur = 20;
        ctx.fillText(u.emoji, cx + 20, cy + 74);
        ctx.shadowBlur   = 0;

        divLine(ctx, cx + 20, cy + 100, cw - 40, col + '44');

        ctx.font         = `bold 24px Arial, sans-serif`;
        ctx.textAlign    = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillStyle    = col;
        ctx.shadowColor  = col; ctx.shadowBlur = 10;
        ctx.fillText('★'.repeat(rank) + '☆'.repeat(Math.max(0, u.max_level - rank)), cx + cw - 20, cy + 124);
        ctx.shadowBlur   = 0;

        L(ctx, `المستوى ${rank} من ${u.max_level}`, cx + 20, cy + 124, 15, C.textD);

        drawBar(ctx, cx + 20, cy + 144, cw - 40, 18, rank / u.max_level, col, false);

        divLine(ctx, cx + 20, cy + 180, cw - 40, col + '33');

        if (maxed) {
            ctx.shadowColor = col; ctx.shadowBlur = 14;
            M(ctx, '✅ تم الوصول للحد الأقصى', cx + cw / 2, cy + 210, 18, col, true);
            ctx.shadowBlur  = 0;
            const pgx = cx + 20, pgy = cy + 230, pgw = cw - 40, pgh = 30;
            const pg = ctx.createLinearGradient(pgx, 0, pgx + pgw, 0);
            pg.addColorStop(0,   col + '00');
            pg.addColorStop(0.4, col + 'AA');
            pg.addColorStop(0.6, col + 'AA');
            pg.addColorStop(1,   col + '00');
            rr(ctx, pgx, pgy, pgw, pgh, 8);
            ctx.fillStyle = pg; ctx.fill();
            M(ctx, `تأثير تراكمي نشط بنسبة ${((rank - 1) * 25).toFixed(0)}%`, cx + cw / 2, cy + 245, 14, '#FFF', true);
        } else {
            R(ctx, `التكلفة`, cx + cw - 20, cy + 204, 14, C.textD);
            ctx.shadowColor = canAf ? C.gold : C.red; ctx.shadowBlur = 6;
            R(ctx, `💰 ${cost.toLocaleString()} مورا`, cx + cw - 20, cy + 228, 16, canAf ? C.gold : C.red, true);
            ctx.shadowBlur  = 0;

            const btnW = 200, btnX = cx + 20, btnY = cy + 204;
            const btnG = ctx.createLinearGradient(btnX, btnY, btnX + btnW, btnY + 36);
            btnG.addColorStop(0, canAf ? col + '44' : 'rgba(120,40,40,0.40)');
            btnG.addColorStop(1, canAf ? col + '20' : 'rgba(80,20,20,0.25)');
            rr(ctx, btnX, btnY, btnW, 36, 8);
            ctx.fillStyle   = btnG; ctx.fill();
            ctx.strokeStyle = canAf ? col + 'BB' : C.red + '66'; ctx.lineWidth = 1.5;
            ctx.shadowColor = canAf ? col : C.red; ctx.shadowBlur = canAf ? 8 : 0;
            rr(ctx, btnX, btnY, btnW, 36, 8); ctx.stroke();
            ctx.shadowBlur  = 0;
            M(ctx, canAf ? `⬆️ ترقية القافلة` : '❌ رصيد غير كافٍ', cx + 120, cy + 222, 15, canAf ? '#FFF' : C.red, true);
        }
    });

    return toBuf(canvas);
}
module.exports.generateUpgradePanel = generateUpgradePanel;

async function generateEquipPanel(user, equipped, invRows, allItems, mora) {
    const core   = require('../handlers/caravan-core.js');
    const canvas = createCanvas(W, H);
    const ctx    = canvas.getContext('2d');
    drawBg(ctx);
    await drawHeader(ctx, user, '🔮 تجهيز أدوات القافلة', `الحد الأقصى 3 أدوات`);

    const RARITY_COL = {
        Common: '#A8B8D0', Uncommon: '#2ECC71', Rare: '#00C3FF',
        Epic: '#B968FF',   Legendary: '#FFD700',
    };

    const sw = 420, sh = 155, sgap = 20;
    const sx0 = (W - (3 * sw + 2 * sgap)) / 2;
    const sy0 = 120;

    for (let s = 0; s < 3; s++) {
        const sx  = sx0 + s * (sw + sgap);
        const id  = equipped[s] || null;
        const itm = id ? allItems.find(x => x.id === id) : null;
        const col = itm ? (RARITY_COL[itm.rarity] || C.textD) : '#2A3A4A';

        drawPanel(ctx, sx, sy0, sw, sh, col, { noCorners: !itm });

        rr(ctx, sx + 8, sy0 + 8, 30, 22, 6);
        ctx.fillStyle = col + '44'; ctx.fill();
        M(ctx, String(s + 1), sx + 23, sy0 + 19, 14, col, true);

        if (itm) {
            ctx.font = `40px ${FE}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
            ctx.shadowColor = col; ctx.shadowBlur = 14;
            ctx.fillText(itm.type === 'book' ? '📖' : '⚙️', sx + 14, sy0 + 72);
            ctx.shadowBlur = 0;

            R(ctx, itm.name,   sx + sw - 14, sy0 + 48, 17, col, true);
            R(ctx, itm.rarity, sx + sw - 14, sy0 + 72, 14, C.textD);

            const isMat = itm.type === 'material' || !itm.type?.includes('book');
            const bPct  = { Common:.03, Uncommon:.05, Rare:.08, Epic:.12, Legendary:.20 }[itm.rarity] || .03;
            const bLabel = isMat ? `⚡ سرعة إضافية ${(bPct*100).toFixed(0)}%` : `🍀 حظ إضافي ${(bPct*100).toFixed(0)}%`;
            ctx.shadowColor = col; ctx.shadowBlur = 6;
            R(ctx, bLabel, sx + sw - 14, sy0 + 96, 14, col, true);
            ctx.shadowBlur = 0;

            divLine(ctx, sx + 12, sy0 + 118, sw - 24, col + '44');
            M(ctx, '✅ مجهّزة اضغط للخلع', sx + sw / 2, sy0 + 138, 13, '#4A7A4A');
        } else {
            ctx.globalAlpha = 0.20;
            ctx.font = `50px ${FE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('➕', sx + sw / 2, sy0 + sh / 2 + 8);
            ctx.globalAlpha = 1;
            M(ctx, `فتحة رقم ${s + 1} فارغة`, sx + sw / 2, sy0 + sh - 22, 14, '#334455');
        }
    }

    const buffs = core.getEquippedBuffs(equipped);
    const sumY  = sy0 + sh + 14;
    const sbg   = ctx.createLinearGradient(30, sumY, W - 30, sumY + 46);
    sbg.addColorStop(0, 'rgba(0,195,255,0.08)');
    sbg.addColorStop(1, 'rgba(46,204,113,0.08)');
    rr(ctx, 30, sumY, W - 60, 46, 10);
    ctx.fillStyle = sbg; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
    rr(ctx, 30, sumY, W - 60, 46, 10); ctx.stroke();

    const bText = `⚡ إجمالي السرعة ${(buffs.speedBuff * 100).toFixed(0)}%   |   🍀 إجمالي الحظ ${(buffs.luckBuff * 100).toFixed(0)}%`;
    M(ctx, bText, W / 2, sumY + 23, 19, C.text, true);

    const gridY = sumY + 60;
    divLine(ctx, 30, gridY, W - 60, C.gold + '33');
    M(ctx, '📦 مخزنك اختر أداة للتبديل', W / 2, gridY + 20, 17, C.gold, true);

    const iw = 190, ih = 112, igap = 12, cols = 6;
    const igw = cols * iw + (cols - 1) * igap;
    const igx = (W - igw) / 2;
    const igy = gridY + 44;
    
    const safeRows = invRows || [];
    const maxShow = Math.min(safeRows.length, 18);

    for (let i = 0; i < maxShow; i++) {
        const row  = safeRows[i];
        const id   = row.itemid || row.itemID;
        const itm  = allItems.find(x => x.id === id);
        const col  = itm ? (RARITY_COL[itm.rarity] || C.textD) : '#334455';
        const isEq = equipped.includes(id);
        const ix   = igx + (i % cols) * (iw + igap);
        const iy   = igy + Math.floor(i / cols) * (ih + igap);

        const ibg = ctx.createLinearGradient(ix, iy, ix, iy + ih);
        ibg.addColorStop(0, col + (isEq ? '33' : '14'));
        ibg.addColorStop(1, 'rgba(4,6,14,0.95)');
        rr(ctx, ix, iy, iw, ih, 10);
        ctx.fillStyle = ibg; ctx.fill();
        ctx.strokeStyle = isEq ? col : col + '44';
        ctx.lineWidth   = isEq ? 2 : 1;
        if (isEq) { ctx.shadowColor = col; ctx.shadowBlur = 10; }
        rr(ctx, ix, iy, iw, ih, 10); ctx.stroke();
        ctx.shadowBlur = 0;

        if (isEq) { L(ctx, '✅', ix + 8, iy + 16, 14, C.green); }

        ctx.font = `30px ${FE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(itm?.type === 'book' ? '📖' : '⚙️', ix + iw / 2, iy + 42);

        M(ctx, (itm?.name || id).substring(0, 12), ix + iw / 2, iy + 76, 13, col, true);
        M(ctx, itm?.rarity || '',                 ix + iw / 2, iy + 96, 11, C.textD);
    }

    return toBuf(canvas);
}
module.exports.generateEquipPanel = generateEquipPanel;
