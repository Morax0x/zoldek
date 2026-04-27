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
    gold:    '#F5C518',
    text:    '#EDE8D0',
    textD:   '#8A9AAA',
    green:   '#2ECC71',
    blue:    '#00BFFF',
    red:     '#E74C3C',
    purple:  '#9B59FF',
};

function formatArabicTime(ms) {
    if (ms <= 0) return 'القافلة وصلت للوجهة';
    let t = Math.max(0, ms);
    let h = Math.floor(t / 3600000);
    let m = Math.floor((t % 3600000) / 60000);

    let res = [];
    if (h > 0) res.push(h === 1 ? 'ساعة' : h === 2 ? 'ساعتان' : h <= 10 ? `${h} ساعات` : `${h} ساعة`);
    if (m > 0) res.push(m === 1 ? 'دقيقة' : m === 2 ? 'دقيقتان' : m <= 10 ? `${m} دقائق` : `${m} دقيقة`);
    
    if (res.length === 0) return 'أقل من دقيقة';
    return res.join(' و ');
}

function getItemNameSafe(id) {
    const itm = allGameItems.find(x => x.id === id);
    if (itm && itm.name) return itm.name;
    return String(id).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
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
        const sy = Math.random() * H * 0.8;
        const sr = Math.random() * 2;
        ctx.globalAlpha = Math.random() * 0.5 + 0.1;
        ctx.fillStyle = Math.random() > 0.8 ? '#FFD700' : '#FFFFFF';
        ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    const mx = W - 140, my = 150, mr = 50;
    const moon = ctx.createRadialGradient(mx, my, 5, mx, my, mr);
    moon.addColorStop(0,   '#FFFDE0');
    moon.addColorStop(0.5, '#FFE566');
    moon.addColorStop(1,   'rgba(255,220,50,0)');
    ctx.fillStyle   = moon;
    ctx.shadowColor = '#FFE566';
    ctx.shadowBlur  = 50;
    ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur  = 0;

    ctx.fillStyle = 'rgba(20,10,2,0.8)';
    ctx.beginPath();
    ctx.moveTo(0, H);
    ctx.bezierCurveTo(W * .2, H - 120, W * .4, H - 80, W * .6, H - 140);
    ctx.bezierCurveTo(W * .8, H - 90, W, H - 110, W, H);
    ctx.closePath(); ctx.fill();

    ctx.fillStyle = '#0B0602';
    ctx.beginPath();
    ctx.moveTo(0, H);
    ctx.bezierCurveTo(W * .3, H - 60, W * .7, H - 90, W, H - 40);
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
}

function drawPanel(ctx, x, y, w, h, accent = C.gold) {
    ctx.shadowColor = accent + '33';
    ctx.shadowBlur  = 25;
    const bg = ctx.createLinearGradient(x, y, x, y + h);
    bg.addColorStop(0, 'rgba(14,20,40,0.96)');
    bg.addColorStop(1, 'rgba(6,8,18,0.98)');
    rr(ctx, x, y, w, h, 16);
    ctx.fillStyle = bg; ctx.fill();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = accent + '66';
    ctx.lineWidth   = 2;
    ctx.stroke();

    const cl = 24;
    ctx.strokeStyle = accent;
    ctx.lineWidth   = 3;
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
}

function drawBar(ctx, x, y, w, h, pct, color) {
    if (isNaN(pct) || pct < 0) pct = 0;
    if (pct > 1) pct = 1;
    rr(ctx, x, y, w, h, h / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fill();

    const filled = Math.max(8, pct * w);
    const grad = ctx.createLinearGradient(x, 0, x + w, 0);
    grad.addColorStop(0, color + 'AA');
    grad.addColorStop(1, color);
    rr(ctx, x, y, filled, h, h / 2);
    ctx.fillStyle   = grad;
    ctx.shadowColor = color;
    ctx.shadowBlur  = 15;
    ctx.fill();
    ctx.shadowBlur  = 0;

    if (h >= 18) {
        ctx.font         = `bold ${Math.max(14, h - 6)}px ${FA}`;
        ctx.fillStyle    = '#FFFFFF';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${(pct * 100).toFixed(0)}%`, x + w / 2, y + h / 2 + 2);
    }
}

function R(ctx, txt, x, y, size, color = C.text, bold = false) {
    ctx.font = `${bold ? 'bold ' : ''}${size}px ${FA}`;
    ctx.fillStyle = color; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, x, y);
}
function M(ctx, txt, x, y, size, color = C.text, bold = false) {
    ctx.font = `${bold ? 'bold ' : ''}${size}px ${FA}`;
    ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, x, y);
}
function L(ctx, txt, x, y, size, color = C.text, bold = false) {
    ctx.font = `${bold ? 'bold ' : ''}${size}px ${FA}`;
    ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, x, y);
}

function divLine(ctx, x, y, w, color = 'rgba(255,255,255,0.15)') {
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, 'transparent'); g.addColorStop(0.2, color);
    g.addColorStop(0.8, color); g.addColorStop(1, 'transparent');
    ctx.strokeStyle = g; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.stroke();
}

async function drawHeader(ctx, title, subtitle = '') {
    const hg = ctx.createLinearGradient(0, 0, 0, 110);
    hg.addColorStop(0, 'rgba(0,0,0,0.85)');
    hg.addColorStop(1, 'rgba(0,0,0,0.40)');
    ctx.fillStyle = hg; ctx.fillRect(0, 0, W, 110);

    const lineG = ctx.createLinearGradient(0, 0, W, 0);
    lineG.addColorStop(0, 'transparent'); lineG.addColorStop(0.5, C.gold); lineG.addColorStop(1, 'transparent');
    ctx.fillStyle = lineG; ctx.fillRect(0, 108, W, 2);

    ctx.shadowColor = C.gold + '88'; ctx.shadowBlur = 20;
    M(ctx, title, W / 2, 45, 42, C.text, true);
    ctx.shadowBlur = 0;
    if (subtitle) M(ctx, subtitle, W / 2, 85, 22, C.textD);
}

function drawStars(ctx, n, max, x, y, size, color = C.gold) {
    ctx.font = `bold ${size}px ${FA}`;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.shadowColor = color; ctx.shadowBlur = 10;
    ctx.fillText('★'.repeat(Math.min(n, max)) + '☆'.repeat(Math.max(0, max - n)), x, y);
    ctx.shadowBlur = 0;
}

function getRepRankInfo(points) {
    if (points >= 9999) return { name: 'SSS', color: '#FFD700' };
    if (points >= 1000) return { name: 'SS',  color: '#FF00FF' };
    if (points >= 500)  return { name: 'S',   color: '#00FFFF' };
    if (points >= 250)  return { name: 'A',   color: '#FFD700' };
    if (points >= 100)  return { name: 'B',   color: '#C0C0C0' };
    if (points >= 50)   return { name: 'C',   color: '#CD7F32' };
    if (points >= 25)   return { name: 'D',   color: '#2E8B57' };
    if (points >= 10)   return { name: 'E',   color: '#8B4513' };
    return                     { name: 'F',   color: '#A0522D' };
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

/* ══════════════════════════════════════════════
   1. HUB — الشاشة الرئيسية
══════════════════════════════════════════════ */
async function generateCaravanHub(user, stats, active, mora, profExtra = {}) {
    const cfg = require('../json/caravan-config.json');
    const canvas = createCanvas(W, H);
    const ctx    = canvas.getContext('2d');
    drawBg(ctx);
    await drawHeader(ctx, '✦ نظام القوافل الإمبراطوري ✦');

    const trips   = Number(stats.total_trips      || 0);
    const success = Number(stats.successful_trips || 0);
    const level   = Number(profExtra.level    || 1);
    const repPts  = Number(profExtra.repPoints || 0);
    const repRank = getRepRankInfo(repPts);

    const LX = 30, LY = 130, LW = 380, LH = 640;
    drawPanel(ctx, LX, LY, LW, LH, C.gold);

    try {
        const av = await loadImage(user.displayAvatarURL({ extension: 'png', size: 256 }));
        ctx.save();
        ctx.beginPath(); ctx.arc(LX + LW / 2, LY + 100, 70, 0, Math.PI * 2); ctx.clip();
        ctx.drawImage(av, LX + LW / 2 - 70, LY + 30, 140, 140);
        ctx.restore();
        ctx.strokeStyle = C.gold; ctx.lineWidth = 4;
        ctx.shadowColor = C.gold; ctx.shadowBlur = 20;
        ctx.beginPath(); ctx.arc(LX + LW / 2, LY + 100, 70, 0, Math.PI * 2); ctx.stroke();
        ctx.shadowBlur = 0;
    } catch {}

    rr(ctx, LX + 20, LY + 20, 70, 36, 10);
    ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fill();
    ctx.strokeStyle = C.gold; ctx.lineWidth = 1.5;
    rr(ctx, LX + 20, LY + 20, 70, 36, 10); ctx.stroke();
    M(ctx, `مستوى ${level}`, LX + 55, LY + 38, 16, C.gold, true);

    M(ctx, truncate(user.username, 16), LX + LW / 2, LY + 200, 32, C.text, true);

    // الرتبة والنقاط
    ctx.font = `bold 22px ${FA}`;
    const rankTxt = `رتبة ${repRank.name}`;
    const txtWidth = ctx.measureText(rankTxt).width;
    
    ctx.font = `bold 18px Arial`;
    const ptsTxt = repPts.toLocaleString();
    const ptsWidth = ctx.measureText(ptsTxt).width;
    const pillW = Math.max(50, ptsWidth + 24);
    
    const totalW = txtWidth + 15 + pillW;
    const startX = LX + LW / 2 + totalWidth / 2;
    
    R(ctx, rankTxt, startX, LY + 240, 22, repRank.color, true);
    
    const pillX = startX - txtWidth - 15 - pillW;
    rr(ctx, pillX, LY + 240 - 16, pillW, 32, 16);
    ctx.fillStyle = repRank.color + '22'; ctx.fill();
    ctx.strokeStyle = repRank.color; ctx.lineWidth = 2;
    rr(ctx, pillX, LY + 240 - 16, pillW, 32, 16); ctx.stroke();
    M(ctx, ptsTxt, pillX + pillW / 2, LY + 240 + 2, 18, repRank.color, true);

    divLine(ctx, LX + 25, LY + 280, LW - 50, C.gold + '66');

    const statItems = [
        { label: 'إجمالي الرحلات', val: String(trips) },
        { label: 'رحلات ناجحة', val: String(success) },
    ];
    let sy = LY + 310;
    for (const s of statItems) {
        rr(ctx, LX + 25, sy - 20, LW - 50, 44, 12);
        ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fill();
        R(ctx, s.label, LX + LW - 40, sy + 2, 20, C.textD);
        ctx.shadowColor = C.gold; ctx.shadowBlur = 8;
        L(ctx, s.val,   LX + 40,      sy + 2, 22, C.gold, true);
        ctx.shadowBlur = 0;
        sy += 55;
    }

    divLine(ctx, LX + 25, sy, LW - 50, C.gold + '66');
    sy += 25;

    M(ctx, 'مستويات التطوير', LX + LW / 2, sy, 20, C.textD);
    sy += 40;

    const upgCfg = [
        { key: 'capacity_rank', emoji: '📦', name: 'الحمولة', col: '#FF9933' },
        { key: 'speed_rank',    emoji: '⚡', name: 'السرعة',  col: '#00C3FF' },
        { key: 'defense_rank',  emoji: '🛡️', name: 'الدرع',   col: '#8888FF' },
        { key: 'luck_rank',     emoji: '🍀', name: 'الحظ',    col: '#2ECC71' },
    ];
    for (const u of upgCfg) {
        const lvl2 = Number(stats[u.key] || 1);
        ctx.font = `26px ${FE}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(u.emoji, LX + 30, sy);
        L(ctx, u.name, LX + 70, sy, 20, C.text);
        drawStars(ctx, lvl2, 5, LX + LW - 30, sy, 24, u.col);
        sy += 38;
    }

    rr(ctx, LX + 20, LY + LH - 65, LW - 40, 50, 12);
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fill();
    ctx.strokeStyle = C.gold + '88'; ctx.lineWidth = 1.5;
    rr(ctx, LX + 20, LY + LH - 65, LW - 40, 50, 12); ctx.stroke();
    ctx.shadowColor = C.gold; ctx.shadowBlur = 10;
    M(ctx, `💰 رصيدك: ${Number(mora).toLocaleString()}`, LX + LW / 2, LY + LH - 40, 22, C.gold, true);
    ctx.shadowBlur = 0;

    const MX = 440, MY = 130, MW = 930, MH = 640;
    drawPanel(ctx, MX, MY, MW, MH, C.gold);

    if (active) {
        const destId = active.destinationid || active.destinationId;
        const dest   = cfg.destinations.find(d => d.id === destId) || {};
        const acc    = dest.color || C.gold;
        const now    = Date.now();
        const start  = Number(active.starttime  || active.startTime  || now);
        const end    = Number(active.endtime    || active.endTime    || now);
        const prog   = (end <= start) ? 1 : Math.min(1, Math.max(0, (now - start) / (end - start)));

        const oX = MX + 120,       oY = MY + MH - 120;
        const dX = MX + MW - 120,  dY = MY + 150;
        const cpX = (oX + dX) / 2, cpY = (oY + dY) / 2 - 150;

        const t  = prog;
        const cX = (1 - t) * (1 - t) * oX + 2 * (1 - t) * t * cpX + t * t * dX;
        const cY = (1 - t) * (1 - t) * oY + 2 * (1 - t) * t * cpY + t * t * dY;

        ctx.setLineDash([15, 15]);
        ctx.strokeStyle = acc + '44'; ctx.lineWidth = 8;
        ctx.beginPath(); ctx.moveTo(oX, oY); ctx.quadraticCurveTo(cpX, cpY, dX, dY); ctx.stroke();
        ctx.setLineDash([]);

        const pathG = ctx.createLinearGradient(oX, oY, cX, cY);
        pathG.addColorStop(0, acc + '88'); pathG.addColorStop(1, acc);
        ctx.strokeStyle = pathG; ctx.lineWidth = 10;
        ctx.shadowColor = acc; ctx.shadowBlur = 30;
        ctx.beginPath(); ctx.moveTo(oX, oY); ctx.quadraticCurveTo(cpX, cpY, cX, cY); ctx.stroke();
        ctx.shadowBlur  = 0;

        ctx.fillStyle = C.green; ctx.shadowColor = C.green; ctx.shadowBlur = 20;
        ctx.beginPath(); ctx.arc(oX, oY, 20, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        M(ctx, '🏠', oX, oY - 45, 40, C.text);
        M(ctx, 'المدينة', oX, oY + 45, 24, C.green, true);

        ctx.fillStyle = acc; ctx.shadowColor = acc; ctx.shadowBlur = 30;
        ctx.beginPath(); ctx.arc(dX, dY, 22, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.font = `50px ${FE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(dest?.emoji || '📍', dX, dY - 60);
        M(ctx, dest?.name || '', dX, dY + 50, 26, acc, true);

        ctx.font = `85px ${FE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.shadowColor = acc; ctx.shadowBlur = 40;
        ctx.fillText('🐪', cX, cY - 20);
        ctx.shadowBlur = 0;

        const barY2 = MY + MH - 70;
        M(ctx, `${(prog * 100).toFixed(1)}%`, MX + MW / 2, barY2 - 30, 26, acc, true);
        drawBar(ctx, MX + 60, barY2, MW - 120, 36, prog, acc);
        M(ctx, `القافلة متجهة نحو ${dest?.name || ''}`, MX + MW / 2, MY + 60, 32, acc, true);
    } else {
        ctx.font = `250px ${FE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.shadowColor = C.gold; ctx.shadowBlur = 80;
        ctx.fillText('🐪', MX + MW / 2, MY + MH * 0.5);
        ctx.shadowBlur = 0;
        ctx.shadowColor = C.gold + '99'; ctx.shadowBlur = 20;
        M(ctx, 'القافلة في انتظار أوامرك', MX + MW / 2, MY + MH - 120, 42, C.gold, true);
        ctx.shadowBlur = 0;
        M(ctx, 'اضغط على إرسال رحلة لاكتشاف المجهول', MX + MW / 2, MY + MH - 60, 24, C.textD);
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
    await drawHeader(ctx, '🗺️ خريطة الوجهات المتاحة');

    const DESTS = cfg.destinations;
    const cw = 260, ch = 480, cgap = 15;
    const totalW = DESTS.length * cw + (DESTS.length - 1) * cgap;
    const startX = (W - totalW) / 2;
    const cardY  = 160;

    DESTS.forEach((d, i) => {
        const cx   = startX + i * (cw + cgap);
        const acc  = d.color || C.gold;
        const canAfford = Number(mora) >= d.cost;

        drawPanel(ctx, cx, cardY, cw, ch, acc);
        if (!canAfford) {
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            rr(ctx, cx, cardY, cw, ch, 16); ctx.fill();
        }

        ctx.font = `80px ${FE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.shadowColor = acc; ctx.shadowBlur = 25;
        ctx.fillText(d.emoji, cx + cw / 2, cardY + 80);
        ctx.shadowBlur = 0;

        M(ctx, d.name, cx + cw / 2, cardY + 160, 28, acc, true);
        divLine(ctx, cx + 20, cardY + 190, cw - 40, acc + '55');

        M(ctx, truncate(d.description, 40), cx + cw / 2, cardY + 225, 17, C.textD);

        const adjDur  = core.calcDuration(d, { speed_rank: Number(stats.speed_rank || 1) }, { speedBuff: 0 });
        const adjRisk = core.calcRiskFactor(d, { defense_rank: Number(stats.defense_rank || 1) });
        const riskC   = adjRisk >= 0.35 ? C.red : adjRisk >= 0.25 ? '#FFA500' : C.green;

        let ry = cardY + 280;
        const rows = [
            { l: 'المدة',   v: formatArabicTime(adjDur), c: C.text },
            { l: 'الخطر',  v: `${(adjRisk * 100).toFixed(0)}%`, c: riskC },
            { l: 'السعر', v: `${d.cost.toLocaleString()}`, c: canAfford ? C.gold : C.red },
        ];
        
        for (const row of rows) {
            rr(ctx, cx + 16, ry - 20, cw - 32, 40, 8);
            ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fill();
            R(ctx, row.l, cx + cw - 24, ry, 20, C.textD);
            L(ctx, row.v, cx + 24, ry, 20, row.c, true);
            ry += 50;
        }

        if (!canAfford) {
            rr(ctx, cx + cw / 2 - 80, cardY + ch - 50, 160, 40, 10);
            ctx.fillStyle = 'rgba(231,76,60,0.35)'; ctx.fill();
            ctx.strokeStyle = C.red + '99'; ctx.lineWidth = 2;
            rr(ctx, cx + cw / 2 - 80, cardY + ch - 50, 160, 40, 10); ctx.stroke();
            M(ctx, '❌ رصيد غير كافٍ', cx + cw / 2, cardY + ch - 30, 20, C.red, true);
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

    if (mode === 'map') {
        await drawHeader(ctx, '🗺️ خريطة مسار القافلة');
        const MX = 100, MY = 130, MW = 1200, MH = 640;
        drawPanel(ctx, MX, MY, MW, MH, acc);

        const oX = MX + 150,       oY = MY + MH - 150;
        const dX = MX + MW - 150,  dY = MY + 180;
        const cpX = (oX + dX) / 2, cpY = (oY + dY) / 2 - 200;

        const t  = prog;
        const cX = (1 - t) * (1 - t) * oX + 2 * (1 - t) * t * cpX + t * t * dX;
        const cY = (1 - t) * (1 - t) * oY + 2 * (1 - t) * t * cpY + t * t * dY;

        ctx.setLineDash([20, 20]);
        ctx.strokeStyle = acc + '44'; ctx.lineWidth = 10;
        ctx.beginPath(); ctx.moveTo(oX, oY); ctx.quadraticCurveTo(cpX, cpY, dX, dY); ctx.stroke();
        ctx.setLineDash([]);

        const pathG = ctx.createLinearGradient(oX, oY, cX, cY);
        pathG.addColorStop(0, acc + '88'); pathG.addColorStop(1, acc);
        ctx.strokeStyle = pathG; ctx.lineWidth = 12;
        ctx.shadowColor = acc; ctx.shadowBlur = 40;
        ctx.beginPath(); ctx.moveTo(oX, oY); ctx.quadraticCurveTo(cpX, cpY, cX, cY); ctx.stroke();
        ctx.shadowBlur  = 0;

        ctx.fillStyle = C.green; ctx.shadowColor = C.green; ctx.shadowBlur = 30;
        ctx.beginPath(); ctx.arc(oX, oY, 24, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        M(ctx, '🏠', oX, oY - 50, 45, C.text);
        M(ctx, 'المدينة', oX, oY + 50, 28, C.green, true);

        ctx.fillStyle = acc; ctx.shadowColor = acc; ctx.shadowBlur = 40;
        ctx.beginPath(); ctx.arc(dX, dY, 26, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.font = `60px ${FE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(dest?.emoji || '📍', dX, dY - 70);
        M(ctx, dest?.name || '', dX, dY + 60, 30, acc, true);

        const camelEmoji = hasAtk ? '⚔️' : '🐪';
        ctx.font = `110px ${FE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.shadowColor = hasAtk ? C.red : acc; ctx.shadowBlur = 50;
        ctx.fillText(camelEmoji, cX, cY - 20);
        ctx.shadowBlur = 0;

        if (hasAtk) {
            const bw2 = 300, bx2 = cX - 150, by2 = cY - 110;
            rr(ctx, bx2, by2, bw2, 50, 12);
            ctx.fillStyle = 'rgba(231,76,60,0.92)'; ctx.fill();
            ctx.strokeStyle = C.red; ctx.lineWidth = 2.5;
            rr(ctx, bx2, by2, bw2, 50, 12); ctx.stroke();
            M(ctx, '⚔️ القافلة تحت الهجوم', cX, by2 + 25, 24, '#FFFFFF', true);
        }

        const barY2 = MY + MH - 80;
        M(ctx, `${(prog * 100).toFixed(1)}%`, MX + MW / 2, barY2 - 30, 30, acc, true);
        drawBar(ctx, MX + 100, barY2, MW - 200, 40, prog, acc);

    } else {
        await drawHeader(ctx, `📊 التقرير التفصيلي للرحلة`);
        const RX = 200, RY = 130, RW = 1000, RH = 640;
        drawPanel(ctx, RX, RY, RW, RH, acc);

        let py = RY + 60;
        ctx.font = `100px ${FE}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.shadowColor = acc; ctx.shadowBlur = 30;
        ctx.fillText(dest?.emoji || '📍', RX + 60, py + 20);
        ctx.shadowBlur = 0;
        
        R(ctx, dest?.name || '', RX + RW - 60, py - 10, 42, acc, true);
        R(ctx, truncate(dest?.description || '', 80), RX + RW - 60, py + 40, 22, C.textD);
        
        py += 110; divLine(ctx, RX + 50, py, RW - 100, acc + '55'); py += 30;

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
            { label: 'الوقت المتبقي',   val: formatArabicTime(tleft), vc: tleft <= 0 ? C.green : C.text },
            { label: 'معامل المكافآت',  val: `× ${rm.toFixed(2)}`,                    vc: rmC     },
        ];

        for (const row of infoRows) {
            rr(ctx, RX + 60, py - 25, RW - 120, 56, 12);
            ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fill();
            R(ctx, row.label,    RX + RW - 80, py + 3, 26, C.textD);
            ctx.shadowColor = row.vc; ctx.shadowBlur = 8;
            L(ctx, row.val,      RX + 80,      py + 3, 28, row.vc, true);
            ctx.shadowBlur = 0;
            py += 70;
        }

        divLine(ctx, RX + 50, py + 10, RW - 100, acc + '55'); py += 40;

        if (arts.length > 0) {
            M(ctx, '🔮 الأدوات الفعالة في هذه الرحلة', RX + RW / 2, py + 16, 26, C.purple, true);
            py += 55;
            arts.forEach(a => {
                const cleanName = getItemNameSafe(a);
                M(ctx, `• ${cleanName}`, RX + RW / 2, py, 24, C.textD);
                py += 40;
            });
        } else {
            M(ctx, '⚠️ لا توجد أدوات مجهزة لتعزيز الرحلة', RX + RW / 2, py + 40, 24, C.textD);
        }
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
          effectLabel: `غنائم إضافية ${(cfg.upgrades.capacity.bonus_per_level * 100).toFixed(0)}% للمستوى`,
          col: '#FF9933' },
        { key: 'speed_rank',    name: cfg.upgrades.speed.name,    emoji: cfg.upgrades.speed.emoji,
          max_level: cfg.upgrades.speed.max_level,    costs: cfg.upgrades.speed.costs,
          effectLabel: `تقليص الوقت ${(cfg.upgrades.speed.time_reduction * 100).toFixed(0)}% للمستوى`,
          col: '#00C3FF' },
        { key: 'defense_rank',  name: cfg.upgrades.defense.name,  emoji: cfg.upgrades.defense.emoji,
          max_level: cfg.upgrades.defense.max_level,  costs: cfg.upgrades.defense.costs,
          effectLabel: `تخفيض الخطر ${(cfg.upgrades.defense.risk_reduction * 100).toFixed(0)}% للمستوى`,
          col: '#8888FF' },
        { key: 'luck_rank',     name: cfg.upgrades.luck.name,     emoji: cfg.upgrades.luck.emoji,
          max_level: cfg.upgrades.luck.max_level,     costs: cfg.upgrades.luck.costs,
          effectLabel: `مضاعفة الحظ ${(cfg.upgrades.luck.bonus_per_level * 100).toFixed(0)}% للمستوى`,
          col: '#2ECC71' },
    ];

    const cw = 650, ch = 285, gap = 20;
    const gx0 = (W - (2 * cw + gap)) / 2; 
    const gy0 = 135;

    upgList.forEach((u, i) => {
        const col   = u.col;
        const rank  = Number(stats[u.key] || stats[u.key.toUpperCase()] || 1);
        const maxed = rank >= u.max_level;
        const cost  = maxed ? 0 : (u.costs[rank] || 0);
        const canAf = !maxed && Number(mora) >= cost;
        const cx    = gx0 + (i % 2) * (cw + gap);
        const cy    = gy0 + Math.floor(i / 2) * (ch + gap);

        drawPanel(ctx, cx, cy, cw, ch, col);

        if (maxed) {
            rr(ctx, cx + 24, cy + 24, 85, 36, 12);
            ctx.fillStyle   = col + 'CC'; ctx.fill();
            ctx.shadowColor = col; ctx.shadowBlur = 10;
            M(ctx, 'MAX', cx + 66, cy + 42, 20, '#FFF', true);
            ctx.shadowBlur  = 0;
        } else {
            rr(ctx, cx + 24, cy + 24, 85, 36, 12);
            ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fill();
            ctx.strokeStyle = col + '88'; ctx.lineWidth = 1.5;
            rr(ctx, cx + 24, cy + 24, 85, 36, 12); ctx.stroke();
            M(ctx, `${rank} / ${u.max_level}`, cx + 66, cy + 42, 18, col, true);
        }

        ctx.shadowColor  = col; ctx.shadowBlur = 12;
        R(ctx, u.name, cx + cw - 28, cy + 42, 32, col, true);
        ctx.shadowBlur   = 0;

        R(ctx, u.effectLabel, cx + cw - 28, cy + 80, 20, C.textD);

        ctx.font = `70px ${FE}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.shadowColor = col; ctx.shadowBlur = 25;
        ctx.fillText(u.emoji, cx + 28, cy + 90);
        ctx.shadowBlur = 0;

        divLine(ctx, cx + 24, cy + 120, cw - 48, col + '55');

        ctx.font = `bold 36px Arial`; ctx.textAlign = 'right'; ctx.fillStyle = col;
        ctx.shadowColor = col; ctx.shadowBlur = 12;
        ctx.fillText('★'.repeat(rank) + '☆'.repeat(Math.max(0, u.max_level - rank)), cx + cw - 28, cy + 155);
        ctx.shadowBlur = 0;

        L(ctx, `المستوى ${rank}`, cx + 28, cy + 155, 22, C.textD);
        drawBar(ctx, cx + 28, cy + 185, cw - 56, 24, rank / u.max_level, col, false);

        divLine(ctx, cx + 24, cy + 225, cw - 48, col + '44');

        if (maxed) {
            ctx.shadowColor = col; ctx.shadowBlur = 15;
            M(ctx, '✅ وصلت للحد الأقصى', cx + cw / 2, cy + 255, 24, col, true);
            ctx.shadowBlur  = 0;
        } else {
            R(ctx, `التكلفة`, cx + cw - 28, cy + 255, 20, C.textD);
            ctx.shadowColor = canAf ? C.gold : C.red; ctx.shadowBlur = 8;
            R(ctx, `💰 ${cost.toLocaleString()}`, cx + cw - 100, cy + 255, 24, canAf ? C.gold : C.red, true);
            ctx.shadowBlur  = 0;

            const btnW = 200, btnX = cx + 28, btnY = cy + 235;
            const btnG = ctx.createLinearGradient(btnX, btnY, btnX + btnW, btnY + 40);
            btnG.addColorStop(0, canAf ? col + '55' : 'rgba(231,76,60,0.4)');
            btnG.addColorStop(1, canAf ? col + '22' : 'rgba(231,76,60,0.2)');
            rr(ctx, btnX, btnY, btnW, 40, 12);
            ctx.fillStyle = btnG; ctx.fill();
            ctx.strokeStyle = canAf ? col : C.red; ctx.lineWidth = 2;
            rr(ctx, btnX, btnY, btnW, 40, 12); ctx.stroke();
            M(ctx, canAf ? `متوفر للترقية` : 'رصيد غير كافٍ', cx + 128, cy + 255, 20, canAf ? '#FFF' : C.red, true);
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
    await drawHeader(ctx, '🔮 تجهيز القافلة بالأدوات');

    const RARITY_COL = { Common: '#A8B8D0', Uncommon: '#2ECC71', Rare: '#00C3FF', Epic: '#B968FF', Legendary: '#FFD700' };

    const sw = 430, sh = 185, sgap = 25;
    const sx0 = (W - (3 * sw + 2 * sgap)) / 2;
    const sy0 = 135;

    for (let s = 0; s < 3; s++) {
        const sx  = sx0 + s * (sw + sgap);
        const id  = equipped[s] || null;
        const itm = id ? allItems.find(x => x.id === id) : null;
        const col = itm ? (RARITY_COL[itm.rarity] || C.textD) : '#2A3A4A';

        drawPanel(ctx, sx, sy0, sw, sh, col);

        rr(ctx, sx + 16, sy0 + 16, 40, 30, 10);
        ctx.fillStyle = col + '44'; ctx.fill();
        M(ctx, String(s + 1), sx + 36, sy0 + 31, 18, col, true);

        if (itm) {
            ctx.font = `60px ${FE}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
            ctx.shadowColor = col; ctx.shadowBlur = 20;
            ctx.fillText(itm.type === 'book' ? '📖' : '⚙️', sx + 20, sy0 + 85);
            ctx.shadowBlur = 0;

            R(ctx, getItemNameSafe(id).substring(0, 18), sx + sw - 20, sy0 + 45, 26, col, true);
            R(ctx, itm.rarity, sx + sw - 20, sy0 + 80, 20, C.textD);

            const isMat = itm.type === 'material' || !itm.type?.includes('book');
            const bPct  = { Common:.03, Uncommon:.05, Rare:.08, Epic:.12, Legendary:.20 }[itm.rarity] || .03;
            const bLabel = isMat ? `⚡ سرعة إضافية ${(bPct*100).toFixed(0)}%` : `🍀 حظ إضافي ${(bPct*100).toFixed(0)}%`;
            ctx.shadowColor = col; ctx.shadowBlur = 8;
            R(ctx, bLabel, sx + sw - 20, sy0 + 115, 20, col, true);
            ctx.shadowBlur = 0;

            divLine(ctx, sx + 16, sy0 + 145, sw - 32, col + '55');
            M(ctx, '✅ مجهزة (اضغط للخلع)', sx + sw / 2, sy0 + 165, 18, '#4A7A4A');
        } else {
            ctx.globalAlpha = 0.20;
            ctx.font = `70px ${FE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('➕', sx + sw / 2, sy0 + sh / 2 + 5);
            ctx.globalAlpha = 1;
            M(ctx, `فتحة فارغة`, sx + sw / 2, sy0 + sh - 28, 22, '#334455');
        }
    }

    const buffs = core.getEquippedBuffs(equipped);
    const sumY  = sy0 + sh + 25;
    const sbg   = ctx.createLinearGradient(40, sumY, W - 40, sumY + 60);
    sbg.addColorStop(0, 'rgba(0,195,255,0.1)');
    sbg.addColorStop(1, 'rgba(46,204,113,0.1)');
    rr(ctx, 40, sumY, W - 80, 60, 12);
    ctx.fillStyle = sbg; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1.5;
    rr(ctx, 40, sumY, W - 80, 60, 12); ctx.stroke();

    const bText = `⚡ إجمالي السرعة المكتسبة ${(buffs.speedBuff * 100).toFixed(0)}%   |   🍀 إجمالي الحظ المكتسب ${(buffs.luckBuff * 100).toFixed(0)}%`;
    M(ctx, bText, W / 2, sumY + 30, 24, C.text, true);

    const gridY = sumY + 80;
    divLine(ctx, 40, gridY, W - 80, C.gold + '44');
    M(ctx, '📦 الأدوات المتاحة في المخزن', W / 2, gridY + 25, 24, C.gold, true);

    const iw = 210, ih = 135, igap = 18, cols = 6;
    const igw = cols * iw + (cols - 1) * igap;
    const igx = (W - igw) / 2;
    const igy = gridY + 60;
    
    const safeRows = invRows || [];
    const maxShow = Math.min(safeRows.length, 12);

    for (let i = 0; i < maxShow; i++) {
        const row  = safeRows[i];
        const id   = row.itemid || row.itemID || row.ITEMID;
        const itm  = allItems.find(x => x.id === id);
        const col  = itm ? (RARITY_COL[itm.rarity] || C.textD) : '#334455';
        const isEq = equipped.includes(id);
        const ix   = igx + (i % cols) * (iw + igap);
        const iy   = igy + Math.floor(i / cols) * (ih + igap);

        const ibg = ctx.createLinearGradient(ix, iy, ix, iy + ih);
        ibg.addColorStop(0, col + (isEq ? '33' : '14'));
        ibg.addColorStop(1, 'rgba(4,6,14,0.95)');
        rr(ctx, ix, iy, iw, ih, 12);
        ctx.fillStyle = ibg; ctx.fill();
        ctx.strokeStyle = isEq ? col : col + '55';
        ctx.lineWidth   = isEq ? 2.5 : 1.5;
        if (isEq) { ctx.shadowColor = col; ctx.shadowBlur = 15; }
        rr(ctx, ix, iy, iw, ih, 12); ctx.stroke();
        ctx.shadowBlur = 0;

        if (isEq) { L(ctx, '✅', ix + 12, iy + 24, 18, C.green); }

        ctx.font = `40px ${FE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(itm?.type === 'book' ? '📖' : '⚙️', ix + iw / 2, iy + 50);

        M(ctx, truncate(getItemNameSafe(id), 12), ix + iw / 2, iy + 95, 20, col, true);
        M(ctx, itm?.rarity || '',                 ix + iw / 2, iy + 118, 16, C.textD);
    }

    return toBuf(canvas);
}
module.exports.generateEquipPanel = generateEquipPanel;
