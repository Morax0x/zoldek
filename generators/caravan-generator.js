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
        if (hours === 1) return 'ساعة واحدة';
        if (hours === 2) return 'ساعتان';
        if (hours >= 3 && hours <= 10) return `${hours} ساعات`;
        return `${hours} ساعة`;
    }

    function pluralizeMins(mins) {
        if (mins === 1) return 'دقيقة واحدة';
        if (mins === 2) return 'دقيقتان';
        if (mins >= 3 && mins <= 10) return `${mins} دقائق`;
        return `${mins} دقيقة`;
    }

    let parts = [];
    if (h > 0) parts.push(pluralizeHours(h));
    if (m > 0) parts.push(pluralizeMins(m));

    if (parts.length === 0) return 'أقل من دقيقة';
    return '\u202B' + parts.join(' و ') + '\u202C';
}

function getItemNameSafe(id) {
    const itm = allGameItems.find(x => x.id === id);
    if (itm && itm.name) return itm.name;
    let clean = String(id).replace(/_/g, ' ');
    return clean;
}

function rr(ctx, x, y, w, h, r = 16) {
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
    for (let i = 0; i < 150; i++) {
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

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';
    let currentY = y;
    for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && n > 0) {
            M(ctx, line.trim(), x, currentY, parseInt(ctx.font), ctx.fillStyle, false);
            line = words[n] + ' ';
            currentY += lineHeight;
        } else {
            line = testLine;
        }
    }
    M(ctx, line.trim(), x, currentY, parseInt(ctx.font), ctx.fillStyle, false);
}

async function drawHeader(ctx, title, subtitle = '') {
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

    ctx.shadowColor = C.gold + '66'; ctx.shadowBlur = 16;
    M(ctx, title, W / 2, 44, 38, C.text, true);
    ctx.shadowBlur = 0;
    if (subtitle) M(ctx, subtitle, W / 2, 82, 20, C.textD);
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
    if (points >= 9999) return { name: 'رتبة SSS', color: '#FFD700' };
    if (points >= 1000) return { name: 'رتبة SS',  color: '#FF00FF' };
    if (points >= 500)  return { name: 'رتبة S',   color: '#00FFFF' };
    if (points >= 250)  return { name: 'رتبة A',   color: '#FFD700' };
    if (points >= 100)  return { name: 'رتبة B',   color: '#C0C0C0' };
    if (points >= 50)   return { name: 'رتبة C',   color: '#CD7F32' };
    if (points >= 25)   return { name: 'رتبة D',   color: '#2E8B57' };
    if (points >= 10)   return { name: 'رتبة E',   color: '#8B4513' };
    return                     { name: 'رتبة F',   color: '#A0522D' };
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
    await drawHeader(ctx, '✦ نظام القوافل الإمبراطوري ✦');

    const trips   = Number(stats.total_trips      || 0);
    const success = Number(stats.successful_trips || 0);
    const rank    = caravanRank(success);
    const level   = Number(profExtra.level    || 1);
    const repPts  = Number(profExtra.repPoints || 0);
    const repRank = getRepRankInfo(repPts);

    const LX = 22, LY = 120, LW = 380, LH = 560;
    drawPanel(ctx, LX, LY, LW, LH, rank.color);

    try {
        const av = await loadImage(user.displayAvatarURL({ extension: 'png', size: 256 }));
        ctx.save();
        ctx.beginPath(); ctx.arc(LX + LW / 2, LY + 80, 60, 0, Math.PI * 2); ctx.clip();
        ctx.drawImage(av, LX + LW / 2 - 60, LY + 20, 120, 120);
        ctx.restore();
        ctx.strokeStyle = rank.color; ctx.lineWidth = 3.5;
        ctx.shadowColor = rank.color; ctx.shadowBlur = 18;
        ctx.beginPath(); ctx.arc(LX + LW / 2, LY + 80, 60, 0, Math.PI * 2); ctx.stroke();
        ctx.shadowBlur  = 0;
    } catch {}

    rr(ctx, LX + 18, LY + 18, 64, 32, 8);
    ctx.fillStyle = 'rgba(0,0,0,0.70)'; ctx.fill();
    ctx.strokeStyle = C.gold + '99'; ctx.lineWidth = 1;
    rr(ctx, LX + 18, LY + 18, 64, 32, 8); ctx.stroke();
    M(ctx, `م.${level}`, LX + 50, LY + 34, 18, C.gold, true);

    M(ctx, user.username.substring(0, 18), LX + LW / 2, LY + 165, 26, C.text, true);

    ctx.shadowColor = rank.color; ctx.shadowBlur = 12;
    M(ctx, `✦ ${rank.name} ✦`, LX + LW / 2, LY + 195, 20, rank.color, true);
    ctx.shadowBlur = 0;

    const repText = `\u202B${repRank.name}\u202C`;
    ctx.font = `bold 18px ${FA}`;
    const txtWidth = ctx.measureText(repText).width;
    
    const ptsText = repPts.toLocaleString();
    ctx.font = `bold 15px Arial, sans-serif`;
    const ptsWidth = ctx.measureText(ptsText).width;
    
    const pillW = Math.max(34, ptsWidth + 18);
    const pillH = 30;
    const totalWidth = txtWidth + 16 + pillW;
    
    const startX = LX + LW / 2 + totalWidth / 2; 
    ctx.font = `bold 18px ${FA}`;
    R(ctx, repText, startX, LY + 235, 18, repRank.color, true);
    
    const pillX = startX - txtWidth - 16 - pillW;
    rr(ctx, pillX, LY + 235 - pillH / 2, pillW, pillH, pillH / 2);
    ctx.fillStyle = repRank.color + '22';
    ctx.fill();
    ctx.strokeStyle = repRank.color + '77';
    ctx.lineWidth = 1.5;
    rr(ctx, pillX, LY + 235 - pillH / 2, pillW, pillH, pillH / 2);
    ctx.stroke();
    
    ctx.font = `bold 15px Arial, sans-serif`;
    M(ctx, ptsText, pillX + pillW / 2, LY + 235 + 2, 15, repRank.color, true);

    divLine(ctx, LX + 20, LY + 265, LW - 40, rank.color + '44');

    const statItems = [
        { label: 'إجمالي الرحلات', val: String(trips) },
        { label: 'الرحلات الناجحة', val: String(success) },
        { label: 'نسبة النجاح',    val: trips ? `${((success / trips) * 100).toFixed(0)}%` : '—' },
    ];
    let sy = LY + 285;
    for (const s of statItems) {
        rr(ctx, LX + 20, sy - 14, LW - 40, 36, 8);
        ctx.fillStyle = 'rgba(255,255,255,0.03)'; ctx.fill();
        R(ctx, s.label,    LX + LW - 30, sy + 4, 18, C.textD);
        ctx.shadowColor = C.gold; ctx.shadowBlur = 5;
        L(ctx, s.val,      LX + 30,       sy + 4, 18, C.gold, true);
        ctx.shadowBlur = 0;
        sy += 44;
    }

    divLine(ctx, LX + 20, sy + 6, LW - 40, rank.color + '44');
    sy += 28;

    M(ctx, 'مستوى الترقيات', LX + LW / 2, sy, 18, C.textD);
    sy += 32;

    const upgCfg = [
        { key: 'capacity_rank', emoji: '📦', name: 'الحمولة', col: '#FF9933' },
        { key: 'speed_rank',    emoji: '⚡', name: 'السرعة',  col: '#00C3FF' },
        { key: 'defense_rank',  emoji: '🛡️', name: 'الدرع',   col: '#8888FF' },
        { key: 'luck_rank',     emoji: '🍀', name: 'الحظ',    col: '#2ECC71' },
    ];
    for (const u of upgCfg) {
        const lvl2 = Number(stats[u.key] || 1);
        ctx.font = `24px ${FE}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(u.emoji, LX + 20, sy);
        L(ctx, u.name, LX + 56, sy, 18, C.text);
        drawStars(ctx, lvl2, 5, LX + LW - 20, sy, 20, u.col);
        sy += 32;
    }

    rr(ctx, LX + 20, LY + LH - 50, LW - 40, 40, 8);
    ctx.fillStyle = 'rgba(0,0,0,0.40)'; ctx.fill();
    ctx.strokeStyle = C.gold + '66'; ctx.lineWidth = 1;
    rr(ctx, LX + 20, LY + LH - 50, LW - 40, 40, 8); ctx.stroke();
    ctx.shadowColor = C.gold; ctx.shadowBlur = 8;
    M(ctx, `💰 رصيدك: ${Number(mora).toLocaleString()} مورا`, LX + LW / 2, LY + LH - 30, 20, C.gold, true);
    ctx.shadowBlur = 0;

    const MX = 422, MY = 120, MW = 956, MH = 560;
    drawPanel(ctx, MX, MY, MW, MH, C.gold);

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

        const oX = MX + 100,       oY = MY + MH - 100;
        const dX = MX + MW - 100,  dY = MY + 120;
        const cpX = (oX + dX) / 2, cpY = (oY + dY) / 2 - 120;

        const t  = prog;
        const cX = (1 - t) * (1 - t) * oX + 2 * (1 - t) * t * cpX + t * t * dX;
        const cY = (1 - t) * (1 - t) * oY + 2 * (1 - t) * t * cpY + t * t * dY;

        ctx.setLineDash([12, 10]);
        ctx.strokeStyle = acc + '33'; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(oX, oY); ctx.quadraticCurveTo(cpX, cpY, dX, dY); ctx.stroke();
        ctx.setLineDash([]);

        const pathG = ctx.createLinearGradient(oX, oY, cX, cY);
        pathG.addColorStop(0, acc + '66'); pathG.addColorStop(1, acc);
        ctx.strokeStyle = pathG; ctx.lineWidth = 8;
        ctx.shadowColor = acc; ctx.shadowBlur = 24;
        ctx.beginPath(); ctx.moveTo(oX, oY); ctx.quadraticCurveTo(cpX, cpY, cX, cY); ctx.stroke();
        ctx.shadowBlur  = 0;

        ctx.fillStyle = C.green; ctx.shadowColor = C.green; ctx.shadowBlur = 18;
        ctx.beginPath(); ctx.arc(oX, oY, 16, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        M(ctx, '🏠', oX, oY - 36, 32, C.text);
        M(ctx, 'مدينتك', oX, oY + 36, 20, C.green);

        ctx.fillStyle = acc; ctx.shadowColor = acc; ctx.shadowBlur = 28;
        ctx.beginPath(); ctx.arc(dX, dY, 18, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.font = `44px ${FE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(dest?.emoji || '📍', dX, dY - 54);
        M(ctx, dest?.name || '', dX, dY + 42, 22, acc, true);

        const camelEmoji = hasAtk ? '⚔️' : '🐪';
        ctx.font = `76px ${FE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.shadowColor = hasAtk ? C.red : acc; ctx.shadowBlur = 36;
        ctx.fillText(camelEmoji, cX, cY - 14);
        ctx.shadowBlur = 0;

        if (hasAtk) {
            const bw2 = 240, bx2 = cX - 120, by2 = cY - 90;
            rr(ctx, bx2, by2, bw2, 42, 10);
            ctx.fillStyle = 'rgba(231,76,60,0.92)'; ctx.fill();
            ctx.strokeStyle = C.red; ctx.lineWidth = 2;
            rr(ctx, bx2, by2, bw2, 42, 10); ctx.stroke();
            M(ctx, '⚔️ تحت الهجوم', cX, by2 + 21, 20, '#FFFFFF', true);
        }

        const barY2 = MY + MH - 60;
        M(ctx, `${(prog * 100).toFixed(1)}%`, MX + MW / 2, barY2 - 24, 22, acc, true);
        drawBar(ctx, MX + 40, barY2, MW - 80, 34, prog, acc);

        M(ctx, `القافلة في طريقها إلى ${dest?.name || ''}`, MX + MW / 2, MY + 50, 26, acc, true);
    } else {
        const halo = ctx.createRadialGradient(MX + MW / 2, MY + MH * 0.6, 30, MX + MW / 2, MY + MH * 0.6, 300);
        halo.addColorStop(0, 'rgba(245,197,24,0.15)');
        halo.addColorStop(1, 'transparent');
        ctx.fillStyle = halo;
        ctx.fillRect(MX, MY, MW, MH);

        ctx.font = `220px ${FE}`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor  = C.gold; ctx.shadowBlur = 60;
        ctx.fillText('🐪', MX + MW / 2, MY + MH * 0.55);
        ctx.shadowBlur   = 0;

        ctx.shadowColor = C.gold + '88'; ctx.shadowBlur = 14;
        M(ctx, '✦ القافلة مستعدة للإنطلاق ✦', MX + MW / 2, MY + MH - 80, 32, C.gold, true);
        ctx.shadowBlur = 0;
        M(ctx, 'اضغط على زر الإرسال لبدء المغامرة وجمع الثروات', MX + MW / 2, MY + MH - 35, 20, C.textD);
    }

    return toBuf(canvas);
}
module.exports.generateCaravanHub = generateCaravanHub;

async function generateSendMap(user, stats, mora) {
    const cfg  = require('../json/caravan-config.json');
    const core = require('../handlers/caravan-core.js');
    const canvas = createCanvas(W, H);
    const ctx    = canvas.getContext('2d');
    drawBg(ctx);
    await drawHeader(ctx, '🗺️ تحديد مسار القافلة');

    const DESTS = cfg.destinations;
    const cw = 256, ch = 400, cgap = 16;
    const totalW = DESTS.length * cw + (DESTS.length - 1) * cgap;
    const startX = (W - totalW) / 2;
    const cardY  = 140;

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

        ctx.font = `68px ${FE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.shadowColor = acc; ctx.shadowBlur = 20;
        ctx.fillText(d.emoji, cx + cw / 2, cardY + 70);
        ctx.shadowBlur = 0;

        ctx.shadowColor = acc; ctx.shadowBlur = 8;
        M(ctx, d.name, cx + cw / 2, cardY + 135, 24, acc, true);
        ctx.shadowBlur = 0;

        divLine(ctx, cx + 16, cardY + 160, cw - 32, acc + '44');

        ctx.font = `18px ${FA}`; ctx.fillStyle = C.textD;
        wrapText(ctx, d.description || '', cx + cw / 2, cardY + 190, cw - 30, 26);

        const adjDur  = core.calcDuration(d, { speed_rank: Number(stats.speed_rank || 1) }, { speedBuff: 0 });
        const adjRisk = core.calcRiskFactor(d, { defense_rank: Number(stats.defense_rank || 1) });
        const riskC   = adjRisk >= 0.35 ? C.red : adjRisk >= 0.25 ? '#FFA500' : C.green;

        const rows = [
            { label: 'المدة',    val: formatArabicTime(adjDur),              vc: C.text    },
            { label: 'الخطر',   val: `${(adjRisk * 100).toFixed(0)}%`,       vc: riskC     },
            { label: 'التكلفة', val: `${d.cost.toLocaleString()}`,     vc: canAfford ? C.gold : C.red },
        ];
        let ry = cardY + 265;
        for (const row of rows) {
            rr(ctx, cx + 12, ry - 16, cw - 24, 32, 6);
            ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fill();
            R(ctx, row.label, cx + cw - 16,  ry, 17, C.textD);
            L(ctx, row.val,   cx + 16,        ry, 17, row.vc, true);
            ry += 40;
        }

        if (!canAfford) {
            rr(ctx, cx + cw / 2 - 70, cardY + ch - 44, 140, 36, 8);
            ctx.fillStyle = 'rgba(231,76,60,0.30)'; ctx.fill();
            ctx.strokeStyle = C.red + '88'; ctx.lineWidth = 1;
            rr(ctx, cx + cw / 2 - 70, cardY + ch - 44, 140, 36, 8); ctx.stroke();
            M(ctx, '❌ رصيد غير كافٍ', cx + cw / 2, cardY + ch - 26, 17, C.red, true);
        }
    });

    return toBuf(canvas);
}
module.exports.generateSendMap = generateSendMap;

async function generateCaravanStatus(user, caravan, stats, dest, mode = 'details') {
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
    const subTitle = tleft <= 0 ? '✅ القافلة وصلت بسلام' : `⏳ ${formatArabicTime(tleft)}`;
    await drawHeader(ctx, `تفاصيل رحلة ${dest?.name || 'القافلة'}`, subTitle);

    const RX = 250, RY = 120, RW = 900, RH = 600;
    drawPanel(ctx, RX, RY, RW, RH, acc);

    let py = RY + 45;
    M(ctx, '📊 التقرير المباشر للرحلة', RX + RW / 2, py, 30, acc, true);
    py += 50; divLine(ctx, RX + 40, py, RW - 80, acc + '55'); py += 35;

    ctx.font = `80px ${FE}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.shadowColor = acc; ctx.shadowBlur = 24;
    ctx.fillText(dest?.emoji || '📍', RX + 50, py + 30);
    ctx.shadowBlur = 0;
    R(ctx, dest?.name || '',        RX + RW - 50, py, 32, acc, true);
    ctx.font = `18px ${FA}`; ctx.fillStyle = C.textD;
    wrapText(ctx, dest?.description || '', RX + RW - 50, py + 40, RW - 180, 28, 'right');
    
    py += 90; divLine(ctx, RX + 40, py, RW - 80); py += 30;

    const stMap2 = {
        'ok':  { t: '🟢 تتقدم بأمان',    c: C.green },
        'atk': { t: '⚔️ تتعرض لهجوم!', c: C.red   },
        '1':   { t: '🛡️ الحراسة أنقذت الموقف', c: C.blue  },
        '2':   { t: '😔 خسائر فادحة بالطريق', c: '#FFA500' },
        '-1':  { t: '💀 نُهبت بالكامل',     c: '#FF2222' },
    };
    const stk2 = hasAtk ? 'atk' : atkRes !== 0 ? String(atkRes) : 'ok';
    const st2  = stMap2[stk2] || stMap2['ok'];
    const rmC  = rm >= 1 ? C.green : rm >= 0.6 ? C.gold : C.red;
    
    const rawArts = caravan.equippedartifacts || caravan.equippedArtifacts;
    const arts = parseSafeArray(rawArts);

    const infoRows = [
        { label: 'حالة القافلة',    val: st2.t,                                    vc: st2.c   },
        { label: 'الوقت المتبقي',   val: tleft <= 0 ? 'وصلت الوجهة' : formatArabicTime(tleft), vc: tleft <= 0 ? C.green : C.text },
        { label: 'معامل المكافآت',  val: `× ${rm.toFixed(2)}`,                    vc: rmC     },
        { label: 'الأدوات المجهزة', val: `${arts.length} أداة نشطة`,               vc: C.purple },
    ];

    for (const row of infoRows) {
        rr(ctx, RX + 40, py - 20, RW - 80, 48, 10);
        ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fill();
        R(ctx, row.label,    RX + RW - 60, py + 4, 22, C.textD);
        ctx.shadowColor = row.vc; ctx.shadowBlur = 8;
        L(ctx, row.val,      RX + 60,      py + 4, 24, row.vc, true);
        ctx.shadowBlur = 0;
        py += 56;
    }

    divLine(ctx, RX + 40, py + 10, RW - 80); py += 30;

    M(ctx, 'نسبة الإنجاز', RX + RW / 2, py + 16, 20, C.textD);
    py += 40; drawBar(ctx, RX + 50, py, RW - 100, 32, prog, acc); py += 50;

    if (arts.length > 0) {
        divLine(ctx, RX + 40, py, RW - 80); py += 24;
        M(ctx, '🔮 الأدوات الفعالة في هذه الرحلة', RX + RW / 2, py + 16, 22, C.purple, true);
        py += 44;
        arts.forEach(a => {
            const cleanName = getItemNameSafe(a);
            M(ctx, `• ${cleanName}`, RX + RW / 2, py, 20, C.textD);
            py += 32;
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
    await drawHeader(ctx, '🏗️ مركز تطوير القوافل');

    const upgList = [
        { key: 'capacity_rank', name: cfg.upgrades.capacity.name, emoji: cfg.upgrades.capacity.emoji,
          max_level: cfg.upgrades.capacity.max_level, costs: cfg.upgrades.capacity.costs,
          effectLabel: `زيادة الغنائم بنسبة ${(cfg.upgrades.capacity.bonus_per_level * 100).toFixed(0)}% لكل مستوى`,
          col: '#FF9933' },
        { key: 'speed_rank',    name: cfg.upgrades.speed.name,    emoji: cfg.upgrades.speed.emoji,
          max_level: cfg.upgrades.speed.max_level,    costs: cfg.upgrades.speed.costs,
          effectLabel: `تقليص مدة السفر ${(cfg.upgrades.speed.time_reduction * 100).toFixed(0)}% لكل مستوى`,
          col: '#00C3FF' },
        { key: 'defense_rank',  name: cfg.upgrades.defense.name,  emoji: cfg.upgrades.defense.emoji,
          max_level: cfg.upgrades.defense.max_level,  costs: cfg.upgrades.defense.costs,
          effectLabel: `تخفيض نسبة الخطر ${(cfg.upgrades.defense.risk_reduction * 100).toFixed(0)}% لكل مستوى`,
          col: '#8888FF' },
        { key: 'luck_rank',     name: cfg.upgrades.luck.name,     emoji: cfg.upgrades.luck.emoji,
          max_level: cfg.upgrades.luck.max_level,     costs: cfg.upgrades.luck.costs,
          effectLabel: `مضاعفة الحظ بنسبة ${(cfg.upgrades.luck.bonus_per_level * 100).toFixed(0)}% لكل مستوى`,
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

        L(ctx, `المستوى ${rank}`, cx + 24, cy + 135, 20, C.textD);

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
            R(ctx, `💰 ${cost.toLocaleString()}`, cx + cw - 24, cy + 252, 20, canAf ? C.gold : C.red, true);
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
            M(ctx, canAf ? `متوفر للترقية` : 'رصيد غير كافٍ', cx + 144, cy + 247, 18, canAf ? '#FFF' : C.red, true);
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
    await drawHeader(ctx, '🔮 تجهيز أدوات القافلة', `الحد الأقصى 3 أدوات فقط`);

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

            R(ctx, getItemNameSafe(id).substring(0, 18), sx + sw - 18, sy0 + 44, 22, col, true);
            R(ctx, itm.rarity, sx + sw - 18, sy0 + 74, 18, C.textD);

            const isMat = itm.type === 'material' || !itm.type?.includes('book');
            const bPct  = { Common:.03, Uncommon:.05, Rare:.08, Epic:.12, Legendary:.20 }[itm.rarity] || .03;
            const bLabel = isMat ? `⚡ سرعة إضافية ${(bPct*100).toFixed(0)}%` : `🍀 حظ إضافي ${(bPct*100).toFixed(0)}%`;
            ctx.shadowColor = col; ctx.shadowBlur = 6;
            R(ctx, bLabel, sx + sw - 18, sy0 + 104, 18, col, true);
            ctx.shadowBlur = 0;

            divLine(ctx, sx + 14, sy0 + 135, sw - 28, col + '44');
            M(ctx, '✅ مجهّزة بالقافلة', sx + sw / 2, sy0 + 155, 16, '#4A7A4A');
        } else {
            ctx.globalAlpha = 0.20;
            ctx.font = `60px ${FE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('➕', sx + sw / 2, sy0 + sh / 2 + 8);
            ctx.globalAlpha = 1;
            M(ctx, `فتحة فارغة`, sx + sw / 2, sy0 + sh - 26, 18, '#334455');
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
    M(ctx, bText, W / 2, sumY + 27, 24, C.text, true);

    const gridY = sumY + 70;
    divLine(ctx, 30, gridY, W - 60, C.gold + '33');
    M(ctx, '📦 الأدوات المتوفرة في المخزن', W / 2, gridY + 24, 22, C.gold, true);

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

        M(ctx, truncate(getItemNameSafe(id), 12), ix + iw / 2, iy + 85, 18, col, true);
        M(ctx, itm?.rarity || '',                 ix + iw / 2, iy + 108, 14, C.textD);
    }

    return toBuf(canvas);
}
module.exports.generateEquipPanel = generateEquipPanel;
