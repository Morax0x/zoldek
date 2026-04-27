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

let allGameItems = [];
try {
    const shopItems = require(path.join(process.cwd(), 'json', 'shop-items.json')) || [];
    const wepItems = require(path.join(process.cwd(), 'json', 'weapons-config.json'));
    allGameItems = [...shopItems];
    if (wepItems && wepItems.weapons) {
        Object.keys(wepItems.weapons).forEach(k => {
            wepItems.weapons[k].forEach(w => allGameItems.push({ id: w.id, name: w.name, rarity: w.rarity }));
        });
    }
} catch(e) {}

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

function formatArabicTime(ms) {
    if (ms <= 0) return 'وصلت الوجهة';
    let t = Math.max(0, ms);
    let h = Math.floor(t / 3600000);
    let m = Math.floor((t % 3600000) / 60000);

    function pluralizeHours(hours) {
        if (hours === 1) return 'ساعة';
        if (hours === 2) return 'ساعتان';
        if (hours >= 3 && hours <= 10) return `${hours} ساعات`;
        return `${hours} ساعة`;
    }

    function pluralizeMins(mins) {
        if (mins === 1) return 'دقيقة';
        if (mins === 2) return 'دقيقتان';
        if (mins >= 3 && mins <= 10) return `${mins} دقائق`;
        return `${mins} دقيقة`;
    }

    let parts = [];
    if (h > 0) parts.push(pluralizeHours(h));
    if (m > 0) parts.push(pluralizeMins(m));

    if (parts.length === 0) return 'أقل من دقيقة';
    return parts.join(' و ');
}

function getItemNameSafe(id) {
    const itm = allGameItems.find(x => x.id === id);
    if (itm && itm.name) return itm.name;
    let clean = String(id).replace(/_/g, ' ');
    return clean;
}

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
        ctx.font         = `bold ${Math.max(14, h - 4)}px ${FA}`;
        ctx.fillStyle    = '#FFFFFF';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${(pct * 100).toFixed(0)}%`, x + w / 2, y + h / 2 + 1);
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

    L(ctx, truncate(user.username, 20), 108, subtitle ? 40 : 54, 26, C.gold, true);
    if (subtitle) L(ctx, subtitle, 108, 70, 18, C.textD);

    ctx.shadowColor = C.gold + '66'; ctx.shadowBlur = 16;
    M(ctx, title, W / 2, 54, 34, C.text, true);
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

    rr(ctx, LX + 14, LY + 14, 60, 28, 8);
    ctx.fillStyle = 'rgba(0,0,0,0.70)'; ctx.fill();
    ctx.strokeStyle = C.gold + '99'; ctx.lineWidth = 1;
    rr(ctx, LX + 14, LY + 14, 60, 28, 8); ctx.stroke();
    M(ctx, `م.${level}`, LX + 44, LY + 28, 16, C.gold, true);

    M(ctx, truncate(user.username, 18), LX + LW / 2, LY + 140, 24, C.text, true);

    ctx.shadowColor = rank.color; ctx.shadowBlur = 10;
    M(ctx, `✦ ${rank.name} ✦`, LX + LW / 2, LY + 168, 18, rank.color, true);
    ctx.shadowBlur = 0;

    const repBadgeW = Math.min(260, LW - 30);
    rr(ctx, LX + (LW - repBadgeW) / 2, LY + 188, repBadgeW, 28, 6);
    ctx.fillStyle = repRank.color + '22'; ctx.fill();
    ctx.strokeStyle = repRank.color + '77'; ctx.lineWidth = 1;
    rr(ctx, LX + (LW - repBadgeW) / 2, LY + 188, repBadgeW, 28, 6); ctx.stroke();
    M(ctx, `${repRank.name}  •  ${repPts.toLocaleString()} نقطة`, LX + LW / 2, LY + 202, 15, repRank.color, true);

    divLine(ctx, LX + 20, LY + 230, LW - 40, rank.color + '44');

    const statItems = [
        { label: 'إجمالي الرحلات', val: String(trips) },
        { label: 'الرحلات الناجحة', val: String(success) },
        { label: 'نسبة النجاح',    val: trips ? `${((success / trips) * 100).toFixed(0)}%` : '—' },
    ];
    let sy = LY + 245;
    for (const s of statItems) {
        rr(ctx, LX + 16, sy - 12, LW - 32, 30, 6);
        ctx.fillStyle = 'rgba(255,255,255,0.03)'; ctx.fill();
        R(ctx, s.label,    LX + LW - 18, sy + 3, 17, C.textD);
        ctx.shadowColor = C.gold; ctx.shadowBlur = 5;
        L(ctx, s.val,      LX + 18,       sy + 3, 17, C.gold, true);
        ctx.shadowBlur = 0;
        sy += 36;
    }

    divLine(ctx, LX + 20, sy + 6, LW - 40, rank.color + '44');
    sy += 24;

    M(ctx, '— مستوى الترقيات —', LX + LW / 2, sy, 16, C.textD);
    sy += 28;

    const upgCfg = [
        { key: 'capacity_rank', emoji: '📦', name: 'الحمولة', col: '#FF9933' },
        { key: 'speed_rank',    emoji: '⚡', name: 'السرعة',  col: '#00C3FF' },
        { key: 'defense_rank',  emoji: '🛡️', name: 'الدرع',   col: '#8888FF' },
        { key: 'luck_rank',     emoji: '🍀', name: 'الحظ',    col: '#2ECC71' },
    ];
    for (const u of upgCfg) {
        const lvl2 = Number(stats[u.key] || 1);
        rr(ctx, LX + 14, sy - 8, LW - 28, 40, 7);
        ctx.fillStyle = 'rgba(255,255,255,0.03)'; ctx.fill();
        ctx.font = `20px ${FE}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(u.emoji, LX + 18, sy + 12);
        L(ctx, u.name, LX + 48, sy + 12, 17, C.text);
        drawStars(ctx, lvl2, 5, LX + LW - 16, sy + 12, 18, u.col);
        drawBar(ctx, LX + 16, sy + 27, LW - 32, 8, lvl2 / 5, u.col, false);
        sy += 46;
    }

    divLine(ctx, LX + 20, sy, LW - 40, C.gold + '44');
    sy += 18;
    ctx.shadowColor = C.gold; ctx.shadowBlur = 8;
    M(ctx, `💰 ${Number(mora).toLocaleString()} مورا`, LX + LW / 2, sy + 12, 22, C.gold, true);
    ctx.shadowBlur = 0;

    const MX = 374, MY = 118, MW = 650, MH = 600;

    if (active) {
        const destId = active.destinationid || active.destinationId;
        const dest   = cfg.destinations.find(d => d.id === destId) || {};
        const acc    = dest.color || C.gold;
        const now    = Date.now();
        const start  = Number(active.starttime  || active.startTime  || now);
        const end    = Number(active.endtime    || active.endTime    || now);
        const prog   = (end <= start) ? 1 : Math.min(1, Math.max(0, (now - start) / (end - start)));
        const atkRes = Number(active.attackresolved || active.attackResolved || 0);
        const hasAtk = atkRes === 0 && (active.guardmessageid || active.guardMessageId);

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
        ctx.beginPath(); ctx.arc(oX, oY, 14, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        M(ctx, '🏠', oX, oY - 30, 26, C.text);
        M(ctx, 'المدينة', oX, oY + 30, 16, C.green);

        ctx.fillStyle = acc; ctx.shadowColor = acc; ctx.shadowBlur = 22;
        ctx.beginPath(); ctx.arc(dX, dY, 16, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.font = `36px ${FE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(dest?.emoji || '📍', dX, dY - 48);
        M(ctx, dest?.name || '', dX, dY + 36, 18, acc, true);

        const camelEmoji = hasAtk ? '⚔️' : '🐪';
        ctx.font = `60px ${FE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.shadowColor = hasAtk ? C.red : acc; ctx.shadowBlur = 30;
        ctx.fillText(camelEmoji, cX, cY - 10);
        ctx.shadowBlur = 0;

        if (hasAtk) {
            const bw2 = 220, bx2 = cX - 110, by2 = cY - 80;
            rr(ctx, bx2, by2, bw2, 38, 10);
            ctx.fillStyle = 'rgba(231,76,60,0.88)'; ctx.fill();
            ctx.strokeStyle = C.red; ctx.lineWidth = 1.5;
            rr(ctx, bx2, by2, bw2, 38, 10); ctx.stroke();
            M(ctx, '⚔️ تحت الهجوم', cX, by2 + 19, 18, '#FFFFFF', true);
        }
    } else {
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

        ctx.font = `200px ${FE}`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor  = C.gold; ctx.shadowBlur = 50;
        ctx.fillText('🐪', MX + MW / 2, MY + MH * 0.55);
        ctx.shadowBlur   = 0;

        ctx.shadowColor = C.gold + '88'; ctx.shadowBlur = 12;
        M(ctx, '✦ قافلتك الإمبراطورية ✦', MX + MW / 2, MY + MH - 65, 26, C.gold, true);
        ctx.shadowBlur = 0;
        M(ctx, 'لا توجد رحلة نشطة حالياً', MX + MW / 2, MY + MH - 30, 18, C.textD);
    }

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
        const atkRes = Number(active.attackresolved || active.attackResolved || 0);
        const hasAtk = atkRes === 0 && (active.guardmessageid || active.guardMessageId);

        drawPanel(ctx, RX, RY, RW, RH, acc);

        M(ctx, '🗺️ تفاصيل الرحلة', RX + RW / 2, RY + 35, 24, acc, true);
        divLine(ctx, RX + 18, RY + 60, RW - 36, acc + '55');

        ctx.font = `72px ${FE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.shadowColor = acc; ctx.shadowBlur = 22;
        ctx.fillText(dest.emoji || '🚀', RX + RW / 2, RY + 130);
        ctx.shadowBlur = 0;

        M(ctx, dest.name || destId,    RX + RW / 2, RY + 185, 24, acc,    true);
        M(ctx, dest.description || '', RX + RW / 2, RY + 215, 16, C.textD);

        divLine(ctx, RX + 18, RY + 240, RW - 36, acc + '44');

        const stMap = {
            'ok':  { t: '🟢 في الطريق',    c: C.green },
            'atk': { t: '⚔️ تحت الهجوم', c: C.red   },
            '1':   { t: '🛡️ نجحت الحراسة', c: C.blue  },
            '2':   { t: '😔 فشلت الحراسة', c: '#FFA500' },
            '-1':  { t: '💀 تم النهب',     c: '#FF2222' },
        };
        const stk = hasAtk ? 'atk' : atkRes !== 0 ? String(atkRes) : 'ok';
        const st  = stMap[stk] || stMap['ok'];
        ctx.shadowColor = st.c; ctx.shadowBlur = 8;
        M(ctx, st.t, RX + RW / 2, RY + 270, 22, st.c, true);
        ctx.shadowBlur = 0;

        M(ctx, `${(prog * 100).toFixed(1)}%`, RX + RW / 2, RY + 310, 24, acc, true);
        drawBar(ctx, RX + 18, RY + 335, RW - 36, 26, prog, acc);

        M(ctx, formatArabicTime(tleft), RX + RW / 2, RY + 380, 20, C.text);

        divLine(ctx, RX + 18, RY + 410, RW - 36, acc + '44');

        const rm   = Number(active.rewardmultiplier || active.rewardMultiplier || 1);
        const rmC  = rm >= 1 ? C.green : rm >= 0.6 ? C.gold : C.red;
        M(ctx, 'معامل المكافأة', RX + RW / 2, RY + 435, 18, C.textD);
        ctx.shadowColor = rmC; ctx.shadowBlur = 10;
        M(ctx, `× ${rm.toFixed(2)}`, RX + RW / 2, RY + 465, 32, rmC, true);
        ctx.shadowBlur = 0;

        divLine(ctx, RX + 18, RY + 500, RW - 36, acc + '44');

        const rawArts = active.equippedartifacts || active.equippedArtifacts;
        const arts = parseSafeArray(rawArts);
        M(ctx, `🔮 تم تجهيز ${arts.length} من 3 أدوات`, RX + RW / 2, RY + 530, 16, C.textD);

    } else {
        drawPanel(ctx, RX, RY, RW, RH, '#334455');

        M(ctx, '📭 لا توجد رحلة نشطة', RX + RW / 2, RY + 35, 24, '#556677', true);
        divLine(ctx, RX + 18, RY + 60, RW - 36, '#33445566');

        ctx.globalAlpha = 0.18;
        ctx.font = `110px ${FE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('🏜️', RX + RW / 2, RY + 200);
        ctx.globalAlpha = 1;

        M(ctx, 'أرسل قافلتك الآن', RX + RW / 2, RY + 300, 26, '#5A6A7A', true);
        M(ctx, 'واجمع الثروات والمكافآت', RX + RW / 2, RY + 335, 18, '#3A4A5A');

        divLine(ctx, RX + 18, RY + 370, RW - 36, '#22334455');

        M(ctx, `الرحلات الناجحة ${success} من أصل ${trips}`, RX + RW / 2, RY + 410, 18, '#445566');
        const pct = trips > 0 ? ((success / trips) * 100).toFixed(0) : 0;
        drawBar(ctx, RX + 18, RY + 440, RW - 36, 20, pct / 100, '#445566', false);
        M(ctx, `نسبة النجاح ${pct}%`, RX + RW / 2, RY + 475, 16, '#556677');
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
        M(ctx, b.label, bx + bw / 2, by + bh / 2, 20, b.col, true);
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
    const cw = 252, ch = 340, cgap = 12;
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

        ctx.font = `64px ${FE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.shadowColor = acc; ctx.shadowBlur = 20;
        ctx.fillText(d.emoji, cx + cw / 2, cardY + 65);
        ctx.shadowBlur = 0;

        ctx.shadowColor = acc; ctx.shadowBlur = 8;
        M(ctx, d.name, cx + cw / 2, cardY + 120, 22, acc, true);
        ctx.shadowBlur = 0;

        divLine(ctx, cx + 16, cardY + 140, cw - 32, acc + '44');

        const desc = d.description || '';
        const words = desc.split(' ');
        let line = '', lines = [];
        ctx.font = `16px ${FA}`;
        for (const w2 of words) {
            const test = line ? line + ' ' + w2 : w2;
            if (ctx.measureText(test).width > cw - 28) { lines.push(line); line = w2; }
            else line = test;
        }
        if (line) lines.push(line);
        lines.slice(0, 2).forEach((ln, li) => {
            M(ctx, ln, cx + cw / 2, cardY + 165 + li * 22, 16, C.textD);
        });

        const adjDur  = core.calcDuration(d, { speed_rank: Number(stats.speed_rank || 1) }, { speedBuff: 0 });
        const adjRisk = core.calcRiskFactor(d, { defense_rank: Number(stats.defense_rank || 1) });
        const riskC   = adjRisk >= 0.35 ? C.red : adjRisk >= 0.25 ? '#FFA500' : C.green;

        const rows = [
            { label: 'المدة',    val: formatArabicTime(adjDur),              vc: C.text    },
            { label: 'الخطر',   val: `${(adjRisk * 100).toFixed(0)}%`,       vc: riskC     },
            { label: 'التكلفة', val: `${d.cost.toLocaleString()} مورا`,     vc: canAfford ? C.gold : C.red },
        ];
        let ry = cardY + 225;
        for (const row of rows) {
            rr(ctx, cx + 12, ry - 14, cw - 24, 30, 6);
            ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fill();
            R(ctx, row.label, cx + cw - 16,  ry + 1, 16, C.textD);
            L(ctx, row.val,   cx + 16,        ry + 1, 16, row.vc, true);
            ry += 38;
        }

        if (!canAfford) {
            rr(ctx, cx + cw / 2 - 65, cardY + ch - 40, 130, 32, 8);
            ctx.fillStyle = 'rgba(231,76,60,0.30)'; ctx.fill();
            ctx.strokeStyle = C.red + '88'; ctx.lineWidth = 1;
            rr(ctx, cx + cw / 2 - 65, cardY + ch - 40, 130, 32, 8); ctx.stroke();
            M(ctx, '❌ رصيد غير كافٍ', cx + cw / 2, cardY + ch - 24, 16, C.red, true);
        }
    });

    const fy = cardY + ch + 20;
    divLine(ctx, 30, fy, W - 60, C.gold + '33');
    M(ctx, 'اختر وجهتك من القائمة أدناه', W / 2, fy + 30, 20, C.textD);
    M(ctx, `إجمالي رصيدك ${Number(mora).toLocaleString()} مورا`, W / 2, fy + 60, 20, C.gold, true);

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
    const acc    = dest?.color || C.gold;
    const atkRes = Number(caravan.attackresolved || caravan.attackResolved || 0);
    const hasAtk = atkRes === 0 && (caravan.guardmessageid || caravan.guardMessageId);
    const rm     = Number(caravan.rewardmultiplier || caravan.rewardMultiplier || 1);

    drawBg(ctx);
    const subTitle = tleft <= 0 ? '✅ وصلت الوجهة' : `⏳ متبقي ${formatArabicTime(tleft)}`;
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
    ctx.beginPath(); ctx.arc(oX, oY, 14, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    M(ctx, '🏠', oX, oY - 32, 26, C.text);
    M(ctx, 'المدينة', oX, oY + 32, 16, C.green);

    ctx.fillStyle = acc; ctx.shadowColor = acc; ctx.shadowBlur = 22;
    ctx.beginPath(); ctx.arc(dX, dY, 16, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.font = `36px ${FE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(dest?.emoji || '📍', dX, dY - 48);
    M(ctx, dest?.name || '', dX, dY + 36, 16, acc, true);

    const camelEmoji = hasAtk ? '⚔️' : '🐪';
    ctx.font = `60px ${FE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = hasAtk ? C.red : acc; ctx.shadowBlur = 30;
    ctx.fillText(camelEmoji, cX, cY - 10);
    ctx.shadowBlur = 0;

    if (hasAtk) {
        const bw2 = 220, bx2 = cX - 110, by2 = cY - 80;
        rr(ctx, bx2, by2, bw2, 38, 10);
        ctx.fillStyle = 'rgba(231,76,60,0.88)'; ctx.fill();
        ctx.strokeStyle = C.red; ctx.lineWidth = 1.5;
        rr(ctx, bx2, by2, bw2, 38, 10); ctx.stroke();
        M(ctx, '⚔️ تحت الهجوم', cX, by2 + 19, 18, '#FFFFFF', true);
    }

    const barY2 = MY + MH - 50;
    M(ctx, `${(prog * 100).toFixed(1)}%`, MX + MW / 2, barY2 - 20, 19, acc, true);
    drawBar(ctx, MX + 22, barY2, MW - 44, 30, prog, acc);

    const RX = 774, RY = 118, RW = 604, RH = 570;
    drawPanel(ctx, RX, RY, RW, RH, acc);

    let py = RY + 30;
    M(ctx, '📊 تفاصيل الرحلة', RX + RW / 2, py, 26, acc, true);
    py += 40; divLine(ctx, RX + 20, py, RW - 40, acc + '55'); py += 26;

    ctx.font = `64px ${FE}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.shadowColor = acc; ctx.shadowBlur = 18;
    ctx.fillText(dest?.emoji || '📍', RX + 24, py + 30);
    ctx.shadowBlur = 0;
    R(ctx, dest?.name || '',        RX + RW - 20, py + 14, 26, acc, true);
    R(ctx, dest?.description || '', RX + RW - 20, py + 44, 16, C.textD);
    py += 80; divLine(ctx, RX + 20, py, RW - 40); py += 22;

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
        { label: 'الوقت المتبقي',   val: tleft <= 0 ? 'وصلت' : formatArabicTime(tleft), vc: tleft <= 0 ? C.green : C.text },
        { label: 'معامل المكافأة',  val: `× ${rm.toFixed(2)}`,                    vc: rmC     },
        { label: 'الأدوات المجهزة', val: `${arts.length} من 3`,                    vc: C.purple },
    ];

    for (const row of infoRows) {
        rr(ctx, RX + 20, py - 16, RW - 40, 36, 8);
        ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fill();
        R(ctx, row.label,    RX + RW - 26, py + 2, 17, C.textD);
        ctx.shadowColor = row.vc; ctx.shadowBlur = 6;
        L(ctx, row.val,            RX + 26,       py + 2, 18, row.vc, true);
        ctx.shadowBlur = 0;
        py += 40;
    }

    divLine(ctx, RX + 20, py, RW - 40); py += 22;

    M(ctx, 'تقدم الرحلة', RX + RW / 2, py + 12, 17, C.textD);
    py += 30; drawBar(ctx, RX + 24, py, RW - 48, 22, prog, acc); py += 36;

    if (tleft > 0) {
        M(ctx, `الوصول المتوقع في: <t:${Math.floor(end / 1000)}:R>`, RX + RW / 2, py + 16, 17, C.textD);
        py += 40;
    }

    if (arts.length > 0) {
        divLine(ctx, RX + 20, py, RW - 40); py += 18;
        M(ctx, '🔮 الأدوات المجهزة', RX + RW / 2, py + 12, 18, C.purple, true);
        py += 32;
        arts.forEach(a => {
            const cleanName = getItemNameSafe(a);
            M(ctx, `• ${cleanName}`, RX + RW / 2, py, 16, C.textD);
            py += 24;
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
          effectLabel: `زيادة الغنائم ${(cfg.upgrades.capacity.bonus_per_level * 100).toFixed(0)}% لكل ترقية`,
          col: '#FF9933' },
        { key: 'speed_rank',    name: cfg.upgrades.speed.name,    emoji: cfg.upgrades.speed.emoji,
          max_level: cfg.upgrades.speed.max_level,    costs: cfg.upgrades.speed.costs,
          effectLabel: `تقليص الوقت ${(cfg.upgrades.speed.time_reduction * 100).toFixed(0)}% لكل ترقية`,
          col: '#00C3FF' },
        { key: 'defense_rank',  name: cfg.upgrades.defense.name,  emoji: cfg.upgrades.defense.emoji,
          max_level: cfg.upgrades.defense.max_level,  costs: cfg.upgrades.defense.costs,
          effectLabel: `خفض الخطر ${(cfg.upgrades.defense.risk_reduction * 100).toFixed(0)}% لكل ترقية`,
          col: '#8888FF' },
        { key: 'luck_rank',     name: cfg.upgrades.luck.name,     emoji: cfg.upgrades.luck.emoji,
          max_level: cfg.upgrades.luck.max_level,     costs: cfg.upgrades.luck.costs,
          effectLabel: `فرص مضاعفة ${(cfg.upgrades.luck.bonus_per_level * 100).toFixed(0)}% لكل ترقية`,
          col: '#2ECC71' },
    ];

    const cw = 650, ch = 285, gap = 20;
    const gx0 = (W - (2 * cw + gap)) / 2; 
    const gy0 = 124;

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
            rr(ctx, cx + 20, cy + 20, 80, 32, 8);
            ctx.fillStyle   = col + 'CC'; ctx.fill();
            ctx.shadowColor = col; ctx.shadowBlur = 10;
            M(ctx, '✦ MAX ✦', cx + 60, cy + 36, 16, '#FFF', true);
            ctx.shadowBlur  = 0;
        } else {
            rr(ctx, cx + 20, cy + 20, 75, 32, 8);
            ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fill();
            ctx.strokeStyle = col + '88'; ctx.lineWidth = 1;
            rr(ctx, cx + 20, cy + 20, 75, 32, 8); ctx.stroke();
            M(ctx, `${rank} / ${u.max_level}`, cx + 57, cy + 36, 16, col, true);
        }

        ctx.shadowColor  = col; ctx.shadowBlur = 8;
        R(ctx, u.name, cx + cw - 24, cy + 38, 28, col, true);
        ctx.shadowBlur   = 0;

        R(ctx, u.effectLabel, cx + cw - 24, cy + 70, 18, C.textD);

        ctx.font = `64px ${FE}`;
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'middle';
        ctx.shadowColor  = col; ctx.shadowBlur = 20;
        ctx.fillText(u.emoji, cx + 24, cy + 84);
        ctx.shadowBlur   = 0;

        divLine(ctx, cx + 20, cy + 105, cw - 40, col + '44');

        ctx.font         = `bold 32px Arial, sans-serif`;
        ctx.textAlign    = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillStyle    = col;
        ctx.shadowColor  = col; ctx.shadowBlur = 10;
        ctx.fillText('★'.repeat(rank) + '☆'.repeat(Math.max(0, u.max_level - rank)), cx + cw - 24, cy + 135);
        ctx.shadowBlur   = 0;

        L(ctx, `المستوى ${rank} من ${u.max_level}`, cx + 24, cy + 135, 18, C.textD);

        drawBar(ctx, cx + 24, cy + 158, cw - 48, 22, rank / u.max_level, col, false);

        divLine(ctx, cx + 20, cy + 195, cw - 40, col + '33');

        if (maxed) {
            ctx.shadowColor = col; ctx.shadowBlur = 14;
            M(ctx, '✅ تم الوصول للحد الأقصى', cx + cw / 2, cy + 225, 22, col, true);
            ctx.shadowBlur  = 0;
            const pgx = cx + 24, pgy = cy + 245, pgw = cw - 48, pgh = 34;
            const pg = ctx.createLinearGradient(pgx, 0, pgx + pgw, 0);
            pg.addColorStop(0,   col + '00');
            pg.addColorStop(0.4, col + 'AA');
            pg.addColorStop(0.6, col + 'AA');
            pg.addColorStop(1,   col + '00');
            rr(ctx, pgx, pgy, pgw, pgh, 8);
            ctx.fillStyle = pg; ctx.fill();
            M(ctx, `تأثير تراكمي نشط بنسبة ${((rank - 1) * 25).toFixed(0)}%`, cx + cw / 2, cy + 262, 17, '#FFF', true);
        } else {
            R(ctx, `التكلفة المادية`, cx + cw - 24, cy + 225, 17, C.textD);
            ctx.shadowColor = canAf ? C.gold : C.red; ctx.shadowBlur = 6;
            R(ctx, `💰 ${cost.toLocaleString()} مورا`, cx + cw - 24, cy + 252, 20, canAf ? C.gold : C.red, true);
            ctx.shadowBlur  = 0;

            const btnW = 240, btnX = cx + 24, btnY = cy + 225;
            const btnG = ctx.createLinearGradient(btnX, btnY, btnX + btnW, btnY + 44);
            btnG.addColorStop(0, canAf ? col + '44' : 'rgba(120,40,40,0.40)');
            btnG.addColorStop(1, canAf ? col + '20' : 'rgba(80,20,20,0.25)');
            rr(ctx, btnX, btnY, btnW, 44, 8);
            ctx.fillStyle   = btnG; ctx.fill();
            ctx.strokeStyle = canAf ? col + 'BB' : C.red + '66'; ctx.lineWidth = 1.5;
            ctx.shadowColor = canAf ? col : C.red; ctx.shadowBlur = canAf ? 8 : 0;
            rr(ctx, btnX, btnY, btnW, 44, 8); ctx.stroke();
            ctx.shadowBlur  = 0;
            M(ctx, canAf ? `⬆️ ترقية القافلة` : '❌ رصيد غير كافٍ', cx + 144, cy + 247, 18, canAf ? '#FFF' : C.red, true);
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

    const sw = 430, sh = 175, sgap = 22;
    const sx0 = (W - (3 * sw + 2 * sgap)) / 2;
    const sy0 = 120;

    for (let s = 0; s < 3; s++) {
        const sx  = sx0 + s * (sw + sgap);
        const id  = equipped[s] || null;
        const itm = id ? allItems.find(x => x.id === id) : null;
        const col = itm ? (RARITY_COL[itm.rarity] || C.textD) : '#2A3A4A';

        drawPanel(ctx, sx, sy0, sw, sh, col, { noCorners: !itm });

        rr(ctx, sx + 12, sy0 + 12, 34, 26, 6);
        ctx.fillStyle = col + '44'; ctx.fill();
        M(ctx, String(s + 1), sx + 29, sy0 + 25, 16, col, true);

        if (itm) {
            ctx.font = `50px ${FE}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
            ctx.shadowColor = col; ctx.shadowBlur = 14;
            ctx.fillText(itm.type === 'book' ? '📖' : '⚙️', sx + 18, sy0 + 80);
            ctx.shadowBlur = 0;

            R(ctx, getItemNameSafe(id),   sx + sw - 18, sy0 + 54, 20, col, true);
            R(ctx, itm.rarity, sx + sw - 18, sy0 + 82, 16, C.textD);

            const isMat = itm.type === 'material' || !itm.type?.includes('book');
            const bPct  = { Common:.03, Uncommon:.05, Rare:.08, Epic:.12, Legendary:.20 }[itm.rarity] || .03;
            const bLabel = isMat ? `⚡ سرعة إضافية ${(bPct*100).toFixed(0)}%` : `🍀 حظ إضافي ${(bPct*100).toFixed(0)}%`;
            ctx.shadowColor = col; ctx.shadowBlur = 6;
            R(ctx, bLabel, sx + sw - 18, sy0 + 110, 16, col, true);
            ctx.shadowBlur = 0;

            divLine(ctx, sx + 14, sy0 + 135, sw - 28, col + '44');
            M(ctx, '✅ مجهّزة بالقافلة', sx + sw / 2, sy0 + 155, 16, '#4A7A4A');
        } else {
            ctx.globalAlpha = 0.20;
            ctx.font = `60px ${FE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('➕', sx + sw / 2, sy0 + sh / 2 + 8);
            ctx.globalAlpha = 1;
            M(ctx, `فتحة رقم ${s + 1} فارغة`, sx + sw / 2, sy0 + sh - 26, 17, '#334455');
        }
    }

    const buffs = core.getEquippedBuffs(equipped);
    const sumY  = sy0 + sh + 20;
    const sbg   = ctx.createLinearGradient(30, sumY, W - 30, sumY + 54);
    sbg.addColorStop(0, 'rgba(0,195,255,0.08)');
    sbg.addColorStop(1, 'rgba(46,204,113,0.08)');
    rr(ctx, 30, sumY, W - 60, 54, 10);
    ctx.fillStyle = sbg; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
    rr(ctx, 30, sumY, W - 60, 54, 10); ctx.stroke();

    const bText = `⚡ إجمالي السرعة ${(buffs.speedBuff * 100).toFixed(0)}%   |   🍀 إجمالي الحظ ${(buffs.luckBuff * 100).toFixed(0)}%`;
    M(ctx, bText, W / 2, sumY + 27, 22, C.text, true);

    const gridY = sumY + 70;
    divLine(ctx, 30, gridY, W - 60, C.gold + '33');
    M(ctx, '📦 مخزنك الخاص', W / 2, gridY + 24, 20, C.gold, true);

    const iw = 210, ih = 125, igap = 16, cols = 6;
    const igw = cols * iw + (cols - 1) * igap;
    const igx = (W - igw) / 2;
    const igy = gridY + 55;
    
    const safeRows = invRows || [];
    const maxShow = Math.min(safeRows.length, 12);

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

        if (isEq) { L(ctx, '✅', ix + 10, iy + 20, 16, C.green); }

        ctx.font = `36px ${FE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(itm?.type === 'book' ? '📖' : '⚙️', ix + iw / 2, iy + 45);

        M(ctx, truncate(getItemNameSafe(id), 12), ix + iw / 2, iy + 85, 16, col, true);
        M(ctx, itm?.rarity || '',                 ix + iw / 2, iy + 108, 14, C.textD);
    }

    return toBuf(canvas);
}
module.exports.generateEquipPanel = generateEquipPanel;
