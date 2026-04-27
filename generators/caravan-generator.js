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

const W  = 1600;
const H  = 900;
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

    if (h > 0 && m > 0) return `${h} ساعة و ${m} دقيقة`;
    if (h > 0) return `${h} ساعة`;
    if (m > 0) return `${m} دقيقة`;
    return 'أقل من دقيقة';
}

function getItemNameSafe(id) {
    const itm = allGameItems.find(x => x.id === id);
    if (itm && itm.name) return itm.name;
    let clean = String(id).replace(/_/g, ' ');
    return clean;
}

function rr(ctx, x, y, w, h, r = 24) {
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

function drawBg(ctx, cw = W, ch = H) {
    const sky = ctx.createLinearGradient(0, 0, 0, ch);
    sky.addColorStop(0,    '#010306');
    sky.addColorStop(0.35, '#050A1E');
    sky.addColorStop(0.65, '#0A0B1A');
    sky.addColorStop(0.82, '#120804');
    sky.addColorStop(1,    '#1A0A01');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, cw, ch);

    ctx.save();
    [
        { x: cw * 0.20, y: ch * 0.18, r: 180, c: 'rgba(40,30,120,0.06)' },
        { x: cw * 0.65, y: ch * 0.12, r: 220, c: 'rgba(80,20,80,0.05)'  },
        { x: cw * 0.85, y: ch * 0.30, r: 150, c: 'rgba(20,60,100,0.07)' },
    ].forEach(n => {
        const ng = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
        ng.addColorStop(0, n.c); ng.addColorStop(1, 'transparent');
        ctx.fillStyle = ng; ctx.fillRect(0, 0, cw, ch);
    });

    for (let i = 0; i < 220; i++) {
        const sx = Math.random() * cw;
        const sy = Math.random() * ch * 0.70;
        const sr = Math.random() * 1.4 + 0.2;
        ctx.globalAlpha = Math.random() * 0.55 + 0.08;
        ctx.fillStyle   = Math.random() > 0.88 ? '#FFF9C4' : '#FFFFFF';
        ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
    }

    for (let i = 0; i < 12; i++) {
        const sx = Math.random() * cw;
        const sy = Math.random() * ch * 0.60;
        const sr = Math.random() * 1.0 + 1.4;
        ctx.globalAlpha = Math.random() * 0.4 + 0.3;
        ctx.fillStyle = '#FFFFFF';
        ctx.shadowColor = '#AAD4FF'; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    const mx = cw - 140, my = 120, mr = 50; 
    
    const haloG = ctx.createRadialGradient(mx, my, mr, mx, my, mr + 60);
    haloG.addColorStop(0, 'rgba(255,220,80,0.15)');
    haloG.addColorStop(1, 'transparent');
    ctx.fillStyle = haloG; ctx.fillRect(0, 0, cw, ch);
    
    const moon = ctx.createRadialGradient(mx - 15, my - 15, 5, mx, my, mr);
    moon.addColorStop(0,   '#FFFEF0');
    moon.addColorStop(0.6, '#FFE566');
    moon.addColorStop(1,   'rgba(255,210,40,0)');
    ctx.fillStyle   = moon;
    ctx.shadowColor = '#FFD700'; ctx.shadowBlur = 45;
    ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur  = 0;
    
    ctx.strokeStyle = 'rgba(255,220,80,0.20)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(mx, my, mr + 12, 0, Math.PI * 2); ctx.stroke();

    const dune1 = ctx.createLinearGradient(0, ch - 140, 0, ch);
    dune1.addColorStop(0, '#1E0E02'); dune1.addColorStop(1, '#0D0600');
    ctx.fillStyle = dune1;
    ctx.beginPath();
    ctx.moveTo(0, ch);
    ctx.bezierCurveTo(cw*.08, ch-110,  cw*.22, ch-160, cw*.40, ch-125);
    ctx.bezierCurveTo(cw*.55, ch-95,   cw*.70, ch-155, cw*.86, ch-115);
    ctx.bezierCurveTo(cw*.93, ch-95,   cw,      ch-75,  cw,      ch);
    ctx.closePath(); ctx.fill();

    const dune2 = ctx.createLinearGradient(0, ch - 80, 0, ch);
    dune2.addColorStop(0, '#140900'); dune2.addColorStop(1, '#0A0500');
    ctx.fillStyle = dune2;
    ctx.beginPath();
    ctx.moveTo(0, ch);
    ctx.bezierCurveTo(cw*.12, ch-65,  cw*.30, ch-105,  cw*.52, ch-70);
    ctx.bezierCurveTo(cw*.68, ch-45,  cw*.82, ch-85,  cw,      ch-50);
    ctx.lineTo(cw, ch); ctx.closePath(); ctx.fill();

    ctx.strokeStyle = 'rgba(80,40,10,0.35)'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, ch - 35);
    ctx.bezierCurveTo(cw*.20, ch-55, cw*.45, ch-45, cw*.70, ch-60);
    ctx.bezierCurveTo(cw*.85, ch-70, cw*.95, ch-50, cw, ch-40);
    ctx.stroke();
}

function drawPanel(ctx, x, y, w, h, accent = C.gold, opts = {}) {
    const radius = opts.radius || 24;

    ctx.shadowColor = accent + '33';
    ctx.shadowBlur  = 20;

    const bg = ctx.createLinearGradient(x, y, x, y + h);
    bg.addColorStop(0,    'rgba(18,24,48,0.97)');
    bg.addColorStop(0.5,  'rgba(10,14,30,0.97)');
    bg.addColorStop(1,    'rgba(5,7,16,0.98)');
    rr(ctx, x, y, w, h, radius);
    ctx.fillStyle = bg; ctx.fill();
    ctx.shadowBlur = 0;

    const topG = ctx.createLinearGradient(x + 30, 0, x + w - 30, 0);
    topG.addColorStop(0,   'transparent');
    topG.addColorStop(0.3, accent + '55');
    topG.addColorStop(0.7, accent + '55');
    topG.addColorStop(1,   'transparent');
    ctx.fillStyle = topG;
    ctx.fillRect(x + radius, y + 1, w - radius * 2, 2);

    rr(ctx, x, y, w, h, radius);
    ctx.strokeStyle = accent + '60';
    ctx.lineWidth   = 2.5;
    ctx.stroke();

    if (!opts.noCorners) {
        const cl = 28;
        ctx.strokeStyle = accent;
        ctx.lineWidth   = 3.5;
        ctx.shadowColor = accent;
        ctx.shadowBlur  = 12;
        ctx.beginPath();
        [
            [x,         y + cl, x,     y,     x + cl,     y    ],
            [x+w-cl,    y,      x + w, y,     x + w,      y+cl ],
            [x+w,       y+h-cl, x + w, y + h, x+w-cl,     y+h  ],
            [x+cl,      y+h,    x,     y + h, x,          y+h-cl],
        ].forEach(([ax,ay,bx,by,cx2,cy2]) => {
            ctx.moveTo(ax,ay); ctx.lineTo(bx,by); ctx.lineTo(cx2,cy2);
        });
        ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.fillStyle = accent; ctx.shadowColor = accent; ctx.shadowBlur = 8;
        [[x, y],[x+w, y],[x+w, y+h],[x, y+h]].forEach(([px,py]) => {
            ctx.beginPath();
            ctx.moveTo(px, py - 6); ctx.lineTo(px + 6, py);
            ctx.lineTo(px, py + 6); ctx.lineTo(px - 6, py);
            ctx.closePath(); ctx.fill();
        });
        ctx.shadowBlur = 0;
    }
}

function drawBar(ctx, x, y, w, h, pct, color, showLabel = true) {
    if (isNaN(pct) || pct < 0) pct = 0;
    if (pct > 1) pct = 1;
    
    rr(ctx, x, y, w, h, h / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fill();

    const filled = Math.max(h, pct * w);
    const grad = ctx.createLinearGradient(x, 0, x + w, 0);
    grad.addColorStop(0, color + 'AA');
    grad.addColorStop(1, color);
    rr(ctx, x, y, filled, h, h / 2);
    ctx.fillStyle   = grad;
    ctx.shadowColor = color;
    ctx.shadowBlur  = 16;
    ctx.fill();
    ctx.shadowBlur  = 0;

    if (showLabel && h >= 16) {
        ctx.font         = `bold ${Math.max(16, h - 8)}px ${FA}`;
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
    ctx.strokeStyle = g; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.stroke();
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, align = 'center') {
    const words = text.split(' ');
    let line = '';
    let currentY = y;
    for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && n > 0) {
            if(align === 'center') M(ctx, line.trim(), x, currentY, parseInt(ctx.font), ctx.fillStyle, false);
            else if(align === 'right') R(ctx, line.trim(), x, currentY, parseInt(ctx.font), ctx.fillStyle, false);
            else L(ctx, line.trim(), x, currentY, parseInt(ctx.font), ctx.fillStyle, false);
            line = words[n] + ' ';
            currentY += lineHeight;
        } else {
            line = testLine;
        }
    }
    if(align === 'center') M(ctx, line.trim(), x, currentY, parseInt(ctx.font), ctx.fillStyle, false);
    else if(align === 'right') R(ctx, line.trim(), x, currentY, parseInt(ctx.font), ctx.fillStyle, false);
    else L(ctx, line.trim(), x, currentY, parseInt(ctx.font), ctx.fillStyle, false);
}

async function drawHeader(ctx, title, subtitle = '') {
    const hg = ctx.createLinearGradient(0, 0, 0, 130);
    hg.addColorStop(0, 'rgba(0,0,0,0.85)');
    hg.addColorStop(1, 'rgba(0,0,0,0.50)');
    ctx.fillStyle = hg;
    ctx.fillRect(0, 0, W, 130);

    const lineG = ctx.createLinearGradient(0, 0, W, 0);
    lineG.addColorStop(0,   'transparent');
    lineG.addColorStop(0.3, C.gold);
    lineG.addColorStop(0.7, C.gold);
    lineG.addColorStop(1,   'transparent');
    ctx.fillStyle = lineG;
    ctx.fillRect(0, 128, W, 2.5);

    ctx.shadowColor = C.gold + '66'; ctx.shadowBlur = 18;
    M(ctx, title, W / 2, 44, 46, C.text, true);
    ctx.shadowBlur = 0;
    if (subtitle) M(ctx, subtitle, W / 2, 98, 24, C.textD);
}

function drawStars(ctx, n, max, x, y, size, color = C.gold) {
    ctx.font         = `bold ${size}px ${FA}`;
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = color;
    ctx.shadowColor  = color; ctx.shadowBlur = 10;
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
    if (points >= 9999) return { name: 'الرتبة SSS', color: '#FFD700' };
    if (points >= 1000) return { name: 'الرتبة SS',  color: '#FF00FF' };
    if (points >= 500)  return { name: 'الرتبة S',   color: '#00FFFF' };
    if (points >= 250)  return { name: 'الرتبة A',   color: '#FFD700' };
    if (points >= 100)  return { name: 'الرتبة B',   color: '#C0C0C0' };
    if (points >= 50)   return { name: 'الرتبة C',   color: '#CD7F32' };
    if (points >= 25)   return { name: 'الرتبة D',   color: '#2E8B57' };
    if (points >= 10)   return { name: 'الرتبة E',   color: '#8B4513' };
    return                     { name: 'الرتبة F',   color: '#A0522D' };
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
    await drawHeader(ctx, '✦ مركز القوافل ✦');

    const trips   = Number(stats.total_trips      || 0);
    const success = Number(stats.successful_trips || 0);
    const rank    = caravanRank(success);
    const level   = Number(profExtra.level    || 1);
    const repPts  = Number(profExtra.repPoints || 0);
    const repRank = getRepRankInfo(repPts);

    const LX = 40, LY = 160, LW = 440, LH = 610;
    drawPanel(ctx, LX, LY, LW, LH, rank.color, { radius: 24 });

    try {
        const av = await loadImage(user.displayAvatarURL({ extension: 'png', size: 256 }));
        ctx.save();
        ctx.beginPath(); ctx.arc(LX + LW / 2, LY + 90, 70, 0, Math.PI * 2); ctx.clip();
        ctx.drawImage(av, LX + LW / 2 - 70, LY + 20, 140, 140);
        ctx.restore();
        ctx.strokeStyle = rank.color; ctx.lineWidth = 4;
        ctx.shadowColor = rank.color; ctx.shadowBlur = 20;
        ctx.beginPath(); ctx.arc(LX + LW / 2, LY + 90, 70, 0, Math.PI * 2); ctx.stroke();
        ctx.shadowBlur  = 0;
    } catch {}

    rr(ctx, LX + 20, LY + 20, 80, 40, 12);
    ctx.fillStyle = 'rgba(0,0,0,0.70)'; ctx.fill();
    ctx.strokeStyle = C.gold + '99'; ctx.lineWidth = 1.5;
    rr(ctx, LX + 20, LY + 20, 80, 40, 12); ctx.stroke();
    M(ctx, `م.${level}`, LX + 60, LY + 41, 22, C.gold, true);

    M(ctx, truncate(user.username, 18), LX + LW / 2, LY + 190, 30, C.text, true);

    ctx.shadowColor = rank.color; ctx.shadowBlur = 12;
    M(ctx, `✦ ${rank.name} ✦`, LX + LW / 2, LY + 230, 24, rank.color, true);
    ctx.shadowBlur = 0;

    const repText = `\u202B${repRank.name}\u202C`;
    ctx.font = `bold 22px ${FA}`;
    const txtWidth = ctx.measureText(repText).width;
    
    const ptsText = repPts.toLocaleString();
    ctx.font = `bold 18px Arial, sans-serif`;
    const ptsWidth = ctx.measureText(ptsText).width;
    
    const pillW = Math.max(50, ptsWidth + 24);
    const pillH = 38;
    const totalWidth = txtWidth + 20 + pillW;
    const startX = LX + LW / 2 + totalWidth / 2; 
    
    ctx.font = `bold 22px ${FA}`;
    R(ctx, repText, startX, LY + 275, 22, repRank.color, true);
    
    const pillX = startX - txtWidth - 20 - pillW;
    rr(ctx, pillX, LY + 275 - pillH / 2, pillW, pillH, pillH / 2);
    ctx.fillStyle = repRank.color + '22';
    ctx.fill();
    ctx.strokeStyle = repRank.color + '77';
    ctx.lineWidth = 2;
    rr(ctx, pillX, LY + 275 - pillH / 2, pillW, pillH, pillH / 2);
    ctx.stroke();
    
    ctx.font = `bold 18px Arial, sans-serif`;
    M(ctx, ptsText, pillX + pillW / 2, LY + 275 + 2, 18, repRank.color, true);

    divLine(ctx, LX + 30, LY + 315, LW - 60, rank.color + '44');

    const upgCfg = [
        { key: 'capacity_rank', emoji: '📦', name: 'سعة الحمولة', col: '#FF9933' },
        { key: 'speed_rank',    emoji: '⚡', name: 'سرعة القافلة',  col: '#00C3FF' },
        { key: 'defense_rank',  emoji: '🛡️', name: 'درع القافلة',   col: '#8888FF' },
        { key: 'luck_rank',     emoji: '🍀', name: 'حظ القافلة',    col: '#2ECC71' },
    ];
    let sy = LY + 340;
    for (const u of upgCfg) {
        const lvl2 = Number(stats[u.key] || 1);
        ctx.font = `28px ${FE}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(u.emoji, LX + 30, sy);
        L(ctx, u.name, LX + 75, sy, 22, C.text);
        drawStars(ctx, lvl2, 5, LX + LW - 30, sy, 24, u.col);
        sy += 48;
    }

    rr(ctx, LX + 20, LY + LH - 65, LW - 40, 50, 12);
    ctx.fillStyle = 'rgba(0,0,0,0.50)'; ctx.fill();
    ctx.strokeStyle = C.gold + '66'; ctx.lineWidth = 1.5;
    rr(ctx, LX + 20, LY + LH - 65, LW - 40, 50, 12); ctx.stroke();
    ctx.shadowColor = C.gold; ctx.shadowBlur = 10;
    M(ctx, `💰 رصيدك: ${Number(mora).toLocaleString()}`, LX + LW / 2, LY + LH - 39, 24, C.gold, true);
    ctx.shadowBlur = 0;

    const MX = 510, MY = 160, MW = 600, MH = 610;
    
    const RX = 1140, RY = 160, RW = 420, RH = 610;

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
        const rm     = Number(active.rewardmultiplier || active.rewardMultiplier || 1);

        drawPanel(ctx, MX, MY, MW, MH, acc, { radius: 24 });

        const oX = MX + 80,       oY = MY + MH - 100;
        const dX = MX + MW - 80,  dY = MY + 100;
        const cpX = (oX + dX) / 2, cpY = (oY + dY) / 2 - 160;

        const t  = prog;
        const cX = (1 - t) * (1 - t) * oX + 2 * (1 - t) * t * cpX + t * t * dX;
        const cY = (1 - t) * (1 - t) * oY + 2 * (1 - t) * t * cpY + t * t * dY;

        ctx.save();
        const roadGrad = ctx.createLinearGradient(MX + MW / 2, MY + MH * 0.35, MX + MW / 2, MY + MH);
        roadGrad.addColorStop(0, 'rgba(80,55,20,0)');
        roadGrad.addColorStop(0.4, 'rgba(60,40,10,0.30)');
        roadGrad.addColorStop(1, 'rgba(30,18,4,0.55)');
        ctx.fillStyle = roadGrad;
        ctx.beginPath();
        ctx.moveTo(MX + MW / 2 - 8, MY + MH * 0.42);
        ctx.lineTo(MX + MW / 2 + 8, MY + MH * 0.42);
        ctx.lineTo(MX + MW / 2 + 140, MY + MH);
        ctx.lineTo(MX + MW / 2 - 140, MY + MH);
        ctx.closePath(); ctx.fill();
        
        ctx.strokeStyle = 'rgba(200,160,60,0.20)'; ctx.lineWidth = 2;
        ctx.setLineDash([18, 22]);
        ctx.beginPath();
        ctx.moveTo(MX + MW / 2, MY + MH * 0.45);
        ctx.lineTo(MX + MW / 2, MY + MH);
        ctx.stroke(); ctx.setLineDash([]);
        ctx.restore();

        ctx.save();
        for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 9) {
            const len = 180 + Math.sin(angle * 3) * 40;
            ctx.strokeStyle = C.gold + '14'; ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(MX + MW / 2, MY + MH * 0.54);
            ctx.lineTo(MX + MW / 2 + Math.cos(angle) * len, MY + MH * 0.54 + Math.sin(angle) * len);
            ctx.stroke();
        }
        ctx.restore();

        [100, 160, 220].forEach((r, idx) => {
            ctx.strokeStyle = `rgba(245,197,24,${0.06 - idx * 0.015})`;
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(MX + MW / 2, MY + MH * 0.54, r, 0, Math.PI * 2); ctx.stroke();
        });

        ctx.setLineDash([14, 12]);
        ctx.strokeStyle = acc + '33'; ctx.lineWidth = 8;
        ctx.beginPath(); ctx.moveTo(oX, oY); ctx.quadraticCurveTo(cpX, cpY, dX, dY); ctx.stroke();
        ctx.setLineDash([]);

        const pathG = ctx.createLinearGradient(oX, oY, cX, cY);
        pathG.addColorStop(0, acc + '66'); pathG.addColorStop(1, acc);
        ctx.strokeStyle = pathG; ctx.lineWidth = 10;
        ctx.shadowColor = acc; ctx.shadowBlur = 24;
        ctx.beginPath(); ctx.moveTo(oX, oY); ctx.quadraticCurveTo(cpX, cpY, cX, cY); ctx.stroke();
        ctx.shadowBlur  = 0;

        ctx.fillStyle = C.green; ctx.shadowColor = C.green; ctx.shadowBlur = 20;
        ctx.beginPath(); ctx.arc(oX, oY, 20, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        M(ctx, '🏠', oX, oY - 40, 36, C.text);

        ctx.fillStyle = acc; ctx.shadowColor = acc; ctx.shadowBlur = 28;
        ctx.beginPath(); ctx.arc(dX, dY, 22, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.font = `50px ${FE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(dest?.emoji || '📍', dX, dY - 50);

        const camelEmoji = hasAtk ? '⚔️' : '🐪';
        ctx.font = `80px ${FE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.shadowColor = hasAtk ? C.red : acc; ctx.shadowBlur = 40;
        ctx.fillText(camelEmoji, cX, cY - 14);
        ctx.shadowBlur = 0;

        drawPanel(ctx, RX, RY, RW, RH, acc, { radius: 24 });
        
        let rpy = RY + 50;
        M(ctx, '📊 تقرير الرحلة', RX + RW / 2, rpy, 28, acc, true);
        rpy += 50; divLine(ctx, RX + 30, rpy, RW - 60, acc + '55'); rpy += 40;

        const tleft  = Math.max(0, end - now);
        const stMap2 = {
            'ok':  { t: '🟢 تتقدم بأمان',    c: C.green },
            'atk': { t: '⚔️ تحت الهجوم!', c: C.red   },
            '1':   { t: '🛡️ نجحت الحراسة', c: C.blue  },
            '2':   { t: '😔 خسائر فادحة', c: '#FFA500' },
            '-1':  { t: '💀 نُهبت بالكامل',     c: '#FF2222' },
        };
        const stk2 = hasAtk ? 'atk' : atkRes !== 0 ? String(atkRes) : 'ok';
        const st2  = stMap2[stk2] || stMap2['ok'];
        const rmC  = rm >= 1 ? C.green : rm >= 0.6 ? C.gold : C.red;

        const infoRows = [
            { label: 'الوجهة',          val: truncate(dest?.name || '', 14),           vc: acc   },
            { label: 'الحالة',          val: st2.t,                                    vc: st2.c   },
            { label: 'الوقت المتبقي',   val: formatArabicTime(tleft),                  vc: tleft <= 0 ? C.green : C.text },
            { label: 'المكافآت',        val: `× ${rm.toFixed(2)}`,                    vc: rmC     },
        ];

        for (const row of infoRows) {
            rr(ctx, RX + 20, rpy - 24, RW - 40, 52, 12);
            ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fill();
            R(ctx, row.label,    RX + RW - 36, rpy + 3, 20, C.textD);
            ctx.shadowColor = row.vc; ctx.shadowBlur = 8;
            L(ctx, row.val,      RX + 36,      rpy + 3, 22, row.vc, true);
            ctx.shadowBlur = 0;
            rpy += 64;
        }

        divLine(ctx, RX + 30, rpy + 10, RW - 60); rpy += 40;

        M(ctx, 'نسبة الإنجاز', RX + RW / 2, rpy + 16, 20, C.textD);
        rpy += 40; drawBar(ctx, RX + 30, rpy, RW - 60, 36, prog, acc); rpy += 60;

    } else {
        drawPanel(ctx, MX, MY, MW, MH, C.gold, { radius: 24 });
        
        ctx.save();
        const roadGrad = ctx.createLinearGradient(MX + MW / 2, MY + MH * 0.35, MX + MW / 2, MY + MH);
        roadGrad.addColorStop(0, 'rgba(80,55,20,0)');
        roadGrad.addColorStop(0.4, 'rgba(60,40,10,0.30)');
        roadGrad.addColorStop(1, 'rgba(30,18,4,0.55)');
        ctx.fillStyle = roadGrad;
        ctx.beginPath();
        ctx.moveTo(MX + MW / 2 - 8, MY + MH * 0.42);
        ctx.lineTo(MX + MW / 2 + 8, MY + MH * 0.42);
        ctx.lineTo(MX + MW / 2 + 140, MY + MH);
        ctx.lineTo(MX + MW / 2 - 140, MY + MH);
        ctx.closePath(); ctx.fill();
        
        ctx.strokeStyle = 'rgba(200,160,60,0.20)'; ctx.lineWidth = 2;
        ctx.setLineDash([18, 22]);
        ctx.beginPath();
        ctx.moveTo(MX + MW / 2, MY + MH * 0.45);
        ctx.lineTo(MX + MW / 2, MY + MH);
        ctx.stroke(); ctx.setLineDash([]);
        ctx.restore();

        ctx.save();
        for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 9) {
            const len = 180 + Math.sin(angle * 3) * 40;
            ctx.strokeStyle = C.gold + '14'; ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(MX + MW / 2, MY + MH * 0.54);
            ctx.lineTo(MX + MW / 2 + Math.cos(angle) * len, MY + MH * 0.54 + Math.sin(angle) * len);
            ctx.stroke();
        }
        ctx.restore();

        [100, 160, 220].forEach((r, idx) => {
            ctx.strokeStyle = `rgba(245,197,24,${0.06 - idx * 0.015})`;
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(MX + MW / 2, MY + MH * 0.54, r, 0, Math.PI * 2); ctx.stroke();
        });
        
        ctx.font = `200px ${FE}`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor  = C.gold; ctx.shadowBlur = 60;
        ctx.fillText('🐪', MX + MW / 2, MY + MH * 0.45);
        ctx.shadowBlur   = 0;

        ctx.shadowColor = C.gold + '88'; ctx.shadowBlur = 14;
        M(ctx, 'القوافل مستعدة للإنطلاق', MX + MW / 2, MY + MH - 110, 36, C.gold, true);
        ctx.shadowBlur = 0;
        M(ctx, 'قم بتجهيز القافلة وأرسلها', MX + MW / 2, MY + MH - 55, 24, C.textD);
        
        drawPanel(ctx, RX, RY, RW, RH, C.gold, { radius: 24 });
        let rpy = RY + 50;
        M(ctx, '📊 إحصائياتك العامة', RX + RW / 2, rpy, 28, C.gold, true);
        rpy += 50; divLine(ctx, RX + 30, rpy, RW - 60, C.gold + '55'); rpy += 60;
        
        ctx.font = `140px ${FE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('🏜️', RX + RW / 2, rpy + 50);
        rpy += 150;
        
        M(ctx, `رحلاتك الناجحة: ${success} من ${trips}`, RX + RW / 2, rpy + 40, 24, C.text, true);
        const pct = trips > 0 ? ((success / trips) * 100).toFixed(0) : 0;
        rpy += 80; drawBar(ctx, RX + 40, rpy, RW - 80, 32, pct / 100, C.gold, false);
        M(ctx, `نسبة النجاح الإجمالية ${pct}%`, RX + RW / 2, rpy + 50, 20, C.textD);
    }

    const barY = H - 100;
    ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(0, barY, W, 100);
    divLine(ctx, 0, barY, W, C.gold + '55');

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
    const cw = 280, ch = 480, cgap = 25;
    const totalW = DESTS.length * cw + (DESTS.length - 1) * cgap;
    const startX = (W - totalW) / 2;
    const cardY  = 160;

    DESTS.forEach((d, i) => {
        const cx   = startX + i * (cw + cgap);
        const acc  = d.color || C.gold;
        const canAfford = Number(mora) >= d.cost;

        const bg = ctx.createLinearGradient(cx, cardY, cx, cardY + ch);
        bg.addColorStop(0, acc + '22'); bg.addColorStop(1, 'rgba(4,6,14,0.97)');
        rr(ctx, cx, cardY, cw, ch, 20);
        ctx.fillStyle = bg; ctx.fill();
        ctx.strokeStyle = acc + (canAfford ? 'CC' : '44');
        ctx.lineWidth   = canAfford ? 3 : 1.5;
        ctx.shadowColor = canAfford ? acc : 'transparent';
        ctx.shadowBlur  = canAfford ? 20 : 0;
        rr(ctx, cx, cardY, cw, ch, 20); ctx.stroke();
        ctx.shadowBlur  = 0;

        ctx.font = `80px ${FE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.shadowColor = acc; ctx.shadowBlur = 24;
        ctx.fillText(d.emoji, cx + cw / 2, cardY + 80);
        ctx.shadowBlur = 0;

        ctx.shadowColor = acc; ctx.shadowBlur = 10;
        M(ctx, d.name, cx + cw / 2, cardY + 160, 26, acc, true);
        ctx.shadowBlur = 0;

        divLine(ctx, cx + 20, cardY + 195, cw - 40, acc + '44');

        ctx.font = `20px ${FA}`; ctx.fillStyle = C.textD;
        wrapText(ctx, d.description || '', cx + cw / 2, cardY + 235, cw - 40, 32);

        const adjDur  = core.calcDuration(d, { speed_rank: Number(stats.speed_rank || 1) }, { speedBuff: 0 });
        const adjRisk = core.calcRiskFactor(d, { defense_rank: Number(stats.defense_rank || 1) });
        const riskC   = adjRisk >= 0.35 ? C.red : adjRisk >= 0.25 ? '#FFA500' : C.green;

        const rows = [
            { label: 'المدة',    val: formatArabicTime(adjDur),              vc: C.text    },
            { label: 'الخطر',   val: `${(adjRisk * 100).toFixed(0)}%`,       vc: riskC     },
            { label: 'التكلفة', val: `${d.cost.toLocaleString()}`,     vc: canAfford ? C.gold : C.red },
        ];
        let ry = cardY + 310;
        for (const row of rows) {
            rr(ctx, cx + 16, ry - 18, cw - 32, 40, 8);
            ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fill();
            R(ctx, row.label, cx + cw - 28,  ry + 3, 20, C.textD);
            L(ctx, row.val,   cx + 28,        ry + 3, 20, row.vc, true);
            ry += 48;
        }

        if (!canAfford) {
            rr(ctx, cx + cw / 2 - 80, cardY + ch - 54, 160, 44, 10);
            ctx.fillStyle = 'rgba(231,76,60,0.30)'; ctx.fill();
            ctx.strokeStyle = C.red + '88'; ctx.lineWidth = 1.5;
            rr(ctx, cx + cw / 2 - 80, cardY + ch - 54, 160, 44, 10); ctx.stroke();
            M(ctx, '❌ رصيد غير كافٍ', cx + cw / 2, cardY + ch - 30, 20, C.red, true);
        }
    });

    const fy = cardY + ch + 35;
    divLine(ctx, 60, fy, W - 120, C.gold + '33');
    M(ctx, `إجمالي رصيدك المتوفر: ${Number(mora).toLocaleString()}`, W / 2, fy + 45, 26, C.gold, true);

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
    const subTitle = tleft <= 0 ? '✅ القافلة وصلت بسلام' : `⏳ متبقي ${formatArabicTime(tleft)}`;
    await drawHeader(ctx, `متابعة قافلة ${dest?.name || ''}`, subTitle);

    if (mode === 'map') {
        const MX = 60, MY = 150, MW = 1480, MH = 620;
        drawPanel(ctx, MX, MY, MW, MH, acc, { radius: 28 });

        const oX = MX + 180,       oY = MY + MH - 140;
        const dX = MX + MW - 180,  dY = MY + 180;
        const cpX = (oX + dX) / 2, cpY = (oY + dY) / 2 - 200;

        const t  = prog;
        const cX = (1 - t) * (1 - t) * oX + 2 * (1 - t) * t * cpX + t * t * dX;
        const cY = (1 - t) * (1 - t) * oY + 2 * (1 - t) * t * cpY + t * t * dY;

        ctx.save();
        const roadGrad = ctx.createLinearGradient(MX + MW / 2, MY + MH * 0.35, MX + MW / 2, MY + MH);
        roadGrad.addColorStop(0, 'rgba(80,55,20,0)');
        roadGrad.addColorStop(0.4, 'rgba(60,40,10,0.30)');
        roadGrad.addColorStop(1, 'rgba(30,18,4,0.55)');
        ctx.fillStyle = roadGrad;
        ctx.beginPath();
        ctx.moveTo(MX + MW / 2 - 8, MY + MH * 0.42);
        ctx.lineTo(MX + MW / 2 + 8, MY + MH * 0.42);
        ctx.lineTo(MX + MW / 2 + 140, MY + MH);
        ctx.lineTo(MX + MW / 2 - 140, MY + MH);
        ctx.closePath(); ctx.fill();
        
        ctx.strokeStyle = 'rgba(200,160,60,0.20)'; ctx.lineWidth = 2;
        ctx.setLineDash([18, 22]);
        ctx.beginPath();
        ctx.moveTo(MX + MW / 2, MY + MH * 0.45);
        ctx.lineTo(MX + MW / 2, MY + MH);
        ctx.stroke(); ctx.setLineDash([]);
        ctx.restore();

        ctx.save();
        for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 9) {
            const len = 180 + Math.sin(angle * 3) * 40;
            ctx.strokeStyle = C.gold + '14'; ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(MX + MW / 2, MY + MH * 0.54);
            ctx.lineTo(MX + MW / 2 + Math.cos(angle) * len, MY + MH * 0.54 + Math.sin(angle) * len);
            ctx.stroke();
        }
        ctx.restore();

        [100, 160, 220].forEach((r, idx) => {
            ctx.strokeStyle = `rgba(245,197,24,${0.06 - idx * 0.015})`;
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(MX + MW / 2, MY + MH * 0.54, r, 0, Math.PI * 2); ctx.stroke();
        });

        ctx.setLineDash([20, 16]);
        ctx.strokeStyle = acc + '33'; ctx.lineWidth = 14;
        ctx.beginPath(); ctx.moveTo(oX, oY); ctx.quadraticCurveTo(cpX, cpY, dX, dY); ctx.stroke();
        ctx.setLineDash([]);

        const pathG = ctx.createLinearGradient(oX, oY, cX, cY);
        pathG.addColorStop(0, acc + '66'); pathG.addColorStop(1, acc);
        ctx.strokeStyle = pathG; ctx.lineWidth = 16;
        ctx.shadowColor = acc; ctx.shadowBlur = 30;
        ctx.beginPath(); ctx.moveTo(oX, oY); ctx.quadraticCurveTo(cpX, cpY, cX, cY); ctx.stroke();
        ctx.shadowBlur  = 0;

        ctx.fillStyle = C.green; ctx.shadowColor = C.green; ctx.shadowBlur = 30;
        ctx.beginPath(); ctx.arc(oX, oY, 30, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        M(ctx, '🏠', oX, oY - 60, 60, C.text);
        M(ctx, 'المدينة الرئيسية', oX, oY + 60, 28, C.green, true);

        ctx.fillStyle = acc; ctx.shadowColor = acc; ctx.shadowBlur = 40;
        ctx.beginPath(); ctx.arc(dX, dY, 32, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.font = `80px ${FE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(dest?.emoji || '📍', dX, dY - 80);
        M(ctx, dest?.name || '', dX, dY + 65, 30, acc, true);

        const camelEmoji = hasAtk ? '⚔️' : '🐪';
        ctx.font = `140px ${FE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.shadowColor = hasAtk ? C.red : acc; ctx.shadowBlur = 50;
        ctx.fillText(camelEmoji, cX, cY - 25);
        ctx.shadowBlur = 0;

        if (hasAtk) {
            const bw2 = 400, bx2 = cX - 200, by2 = cY - 180;
            rr(ctx, bx2, by2, bw2, 70, 16);
            ctx.fillStyle = 'rgba(231,76,60,0.95)'; ctx.fill();
            ctx.strokeStyle = C.red; ctx.lineWidth = 4;
            rr(ctx, bx2, by2, bw2, 70, 16); ctx.stroke();
            M(ctx, '⚔️ القافلة تتعرض لهجوم!', cX, by2 + 35, 32, '#FFFFFF', true);
        }

        const barY2 = MY + MH - 100;
        M(ctx, `${(prog * 100).toFixed(1)}%`, MX + MW / 2, barY2 - 40, 36, acc, true);
        drawBar(ctx, MX + 120, barY2, MW - 240, 60, prog, acc);

        return toBuf(canvas);
    }

    const RX = 60, RY = 150, RW = 1480, RH = 620;
    drawPanel(ctx, RX, RY, RW, RH, acc, { radius: 28 });

    let py = RY + 70;
    M(ctx, '📊 التقرير التفصيلي والمباشر للرحلة', RX + RW / 2, py, 46, acc, true);
    py += 80; divLine(ctx, RX + 80, py, RW - 160, acc + '55'); py += 60;

    ctx.font = `120px ${FE}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.shadowColor = acc; ctx.shadowBlur = 30;
    ctx.fillText(dest?.emoji || '📍', RX + 100, py + 30);
    ctx.shadowBlur = 0;
    R(ctx, dest?.name || '',        RX + RW - 100, py, 46, acc, true);
    ctx.font = `28px ${FA}`; ctx.fillStyle = C.textD;
    wrapText(ctx, dest?.description || '', RX + RW - 100, py + 55, RW - 300, 42, 'right');
    
    py += 140; divLine(ctx, RX + 80, py, RW - 160); py += 50;

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
        rr(ctx, RX + 80, py - 30, RW - 160, 68, 16);
        ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fill();
        R(ctx, row.label,    RX + RW - 120, py + 5, 30, C.textD);
        ctx.shadowColor = row.vc; ctx.shadowBlur = 8;
        L(ctx, row.val,      RX + 120,      py + 5, 30, row.vc, true);
        ctx.shadowBlur = 0;
        py += 84;
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

    const cw = 720, ch = 310, gap = 40;
    const gx0 = (W - (2 * cw + gap)) / 2; 
    const gy0 = 150;

    upgList.forEach((u, i) => {
        const col   = u.col;
        const rank  = Number(stats[u.key] || 1);
        const maxed = rank >= u.max_level;
        const cost  = maxed ? 0 : (u.costs[rank] || 0);
        const canAf = !maxed && Number(mora) >= cost;
        const cx    = gx0 + (i % 2) * (cw + gap);
        const cy    = gy0 + Math.floor(i / 2) * (ch + gap);

        drawPanel(ctx, cx, cy, cw, ch, col, { radius: 24 });

        if (maxed) {
            rr(ctx, cx + 30, cy + 30, 96, 40, 12);
            ctx.fillStyle   = col + 'CC'; ctx.fill();
            ctx.shadowColor = col; ctx.shadowBlur = 12;
            M(ctx, '✦ MAX ✦', cx + 78, cy + 50, 20, '#FFF', true);
            ctx.shadowBlur  = 0;
        } else {
            rr(ctx, cx + 30, cy + 30, 90, 40, 12);
            ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fill();
            ctx.strokeStyle = col + '88'; ctx.lineWidth = 2;
            rr(ctx, cx + 30, cy + 30, 90, 40, 12); ctx.stroke();
            M(ctx, `${rank} / ${u.max_level}`, cx + 75, cy + 50, 20, col, true);
        }

        ctx.shadowColor  = col; ctx.shadowBlur = 10;
        R(ctx, u.name, cx + cw - 30, cy + 46, 32, col, true);
        ctx.shadowBlur   = 0;

        R(ctx, u.effectLabel, cx + cw - 30, cy + 86, 22, C.textD);

        ctx.font = `76px ${FE}`;
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'middle';
        ctx.shadowColor  = col; ctx.shadowBlur = 24;
        ctx.fillText(u.emoji, cx + 30, cy + 100);
        ctx.shadowBlur   = 0;

        divLine(ctx, cx + 30, cy + 130, cw - 60, col + '44');

        ctx.font         = `bold 38px Arial, sans-serif`;
        ctx.textAlign    = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillStyle    = col;
        ctx.shadowColor  = col; ctx.shadowBlur = 12;
        ctx.fillText('★'.repeat(rank) + '☆'.repeat(Math.max(0, u.max_level - rank)), cx + cw - 30, cy + 165);
        ctx.shadowBlur   = 0;

        L(ctx, `المستوى ${rank}`, cx + 30, cy + 165, 24, C.textD);

        drawBar(ctx, cx + 30, cy + 195, cw - 60, 28, rank / u.max_level, col, false);

        divLine(ctx, cx + 30, cy + 240, cw - 60, col + '33');

        if (maxed) {
            ctx.shadowColor = col; ctx.shadowBlur = 16;
            M(ctx, '✅ تم الوصول للحد الأقصى', cx + cw / 2, cy + 270, 26, col, true);
            ctx.shadowBlur  = 0;
            const pgx = cx + 28, pgy = cy + 260, pgw = cw - 56, pgh = 38;
            const pg = ctx.createLinearGradient(pgx, 0, pgx + pgw, 0);
            pg.addColorStop(0,   col + '00');
            pg.addColorStop(0.4, col + 'AA');
            pg.addColorStop(0.6, col + 'AA');
            pg.addColorStop(1,   col + '00');
            rr(ctx, pgx, pgy, pgw, pgh, 10);
            ctx.fillStyle = pg; ctx.fill();
            M(ctx, `تأثير تراكمي نشط بنسبة ${((rank - 1) * 25).toFixed(0)}%`, cx + cw / 2, cy + 279, 18, '#FFF', true);
        } else {
            R(ctx, `💰 ${cost.toLocaleString()}`, cx + cw - 30, cy + 275, 24, canAf ? C.gold : C.red, true);

            const btnW = 280, btnX = cx + 30, btnY = cy + 250;
            const btnG = ctx.createLinearGradient(btnX, btnY, btnX + btnW, btnY + 50);
            btnG.addColorStop(0, canAf ? col + '44' : 'rgba(120,40,40,0.40)');
            btnG.addColorStop(1, canAf ? col + '20' : 'rgba(80,20,20,0.25)');
            rr(ctx, btnX, btnY, btnW, 50, 12);
            ctx.fillStyle   = btnG; ctx.fill();
            ctx.strokeStyle = canAf ? col + 'BB' : C.red + '66'; ctx.lineWidth = 2.5;
            ctx.shadowColor = canAf ? col : C.red; ctx.shadowBlur = canAf ? 10 : 0;
            rr(ctx, btnX, btnY, btnW, 50, 12); ctx.stroke();
            ctx.shadowBlur  = 0;
            M(ctx, canAf ? `متوفر للترقية` : 'رصيد غير كافٍ', cx + 170, cy + 276, 22, canAf ? '#FFF' : C.red, true);
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

    const sw = 480, sh = 200, sgap = 30;
    const sx0 = (W - (3 * sw + 2 * sgap)) / 2;
    const sy0 = 140;

    for (let s = 0; s < 3; s++) {
        const sx  = sx0 + s * (sw + sgap);
        const id  = equipped[s] || null;
        const itm = id ? allItems.find(x => x.id === id) : null;
        const col = itm ? (RARITY_COL[itm.rarity] || C.textD) : '#2A3A4A';

        drawPanel(ctx, sx, sy0, sw, sh, col, { noCorners: !itm, radius: 20 });

        rr(ctx, sx + 16, sy0 + 16, 42, 32, 8);
        ctx.fillStyle = col + '44'; ctx.fill();
        M(ctx, String(s + 1), sx + 37, sy0 + 32, 20, col, true);

        if (itm) {
            ctx.font = `60px ${FE}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
            ctx.shadowColor = col; ctx.shadowBlur = 16;
            ctx.fillText(itm.type === 'book' ? '📖' : '⚙️', sx + 24, sy0 + 95);
            ctx.shadowBlur = 0;

            R(ctx, getItemNameSafe(id).substring(0, 18), sx + sw - 20, sy0 + 50, 26, col, true);
            R(ctx, itm.rarity, sx + sw - 20, sy0 + 86, 20, C.textD);

            const isMat = itm.type === 'material' || !itm.type?.includes('book');
            const bPct  = { Common:.03, Uncommon:.05, Rare:.08, Epic:.12, Legendary:.20 }[itm.rarity] || .03;
            const bLabel = isMat ? `⚡ سرعة إضافية ${(bPct*100).toFixed(0)}%` : `🍀 حظ إضافي ${(bPct*100).toFixed(0)}%`;
            ctx.shadowColor = col; ctx.shadowBlur = 8;
            R(ctx, bLabel, sx + sw - 20, sy0 + 120, 20, col, true);
            ctx.shadowBlur = 0;

            divLine(ctx, sx + 20, sy0 + 155, sw - 40, col + '44');
            M(ctx, '✅ مجهّزة بالقافلة', sx + sw / 2, sy0 + 175, 18, '#4A7A4A');
        } else {
            ctx.globalAlpha = 0.20;
            ctx.font = `70px ${FE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('➕', sx + sw / 2, sy0 + sh / 2 + 10);
            ctx.globalAlpha = 1;
            M(ctx, `الفتحة فارغة`, sx + sw / 2, sy0 + sh - 30, 22, '#334455');
        }
    }

    const buffs = core.getEquippedBuffs(equipped);
    const sumY  = sy0 + sh + 30;
    const sbg   = ctx.createLinearGradient(50, sumY, W - 50, sumY + 65);
    sbg.addColorStop(0, 'rgba(0,195,255,0.08)');
    sbg.addColorStop(1, 'rgba(46,204,113,0.08)');
    rr(ctx, 50, sumY, W - 100, 65, 14);
    ctx.fillStyle = sbg; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 2;
    rr(ctx, 50, sumY, W - 100, 65, 14); ctx.stroke();

    const bText = `⚡ إجمالي السرعة ${(buffs.speedBuff * 100).toFixed(0)}%   |   🍀 إجمالي الحظ ${(buffs.luckBuff * 100).toFixed(0)}%`;
    M(ctx, bText, W / 2, sumY + 33, 26, C.text, true);

    const gridY = sumY + 85;
    divLine(ctx, 50, gridY, W - 100, C.gold + '33');
    M(ctx, '📦 الأدوات المتوفرة في المخزن', W / 2, gridY + 35, 26, C.gold, true);

    const iw = 230, ih = 140, igap = 20, cols = 6;
    const igw = cols * iw + (cols - 1) * igap;
    const igx = (W - igw) / 2;
    const igy = gridY + 75;
    
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
        rr(ctx, ix, iy, iw, ih, 14);
        ctx.fillStyle = ibg; ctx.fill();
        ctx.strokeStyle = isEq ? col : col + '44';
        ctx.lineWidth   = isEq ? 3 : 1.5;
        if (isEq) { ctx.shadowColor = col; ctx.shadowBlur = 12; }
        rr(ctx, ix, iy, iw, ih, 14); ctx.stroke();
        ctx.shadowBlur = 0;

        if (isEq) { L(ctx, '✅', ix + 12, iy + 24, 20, C.green); }

        ctx.font = `44px ${FE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(itm?.type === 'book' ? '📖' : '⚙️', ix + iw / 2, iy + 50);

        M(ctx, truncate(getItemNameSafe(id), 12), ix + iw / 2, iy + 95, 20, col, true);
        M(ctx, itm?.rarity || '',                 ix + iw / 2, iy + 120, 16, C.textD);
    }

    return toBuf(canvas);
}
module.exports.generateEquipPanel = generateEquipPanel;
