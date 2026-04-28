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
const BASE_IMG_URL = 'https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev/images/caravan/';

const C = {
    bg:      '#04060F',
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

function cleanText(str) {
    if (!str) return '';
    return String(str)
        .replace(/[\u064B-\u065F\u0670]/g, '') 
        .replace(/[✦•]/g, '') 
        .trim();
}

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
    if (itm && itm.name) return cleanText(itm.name);
    return cleanText(String(id).replace(/_/g, ' '));
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

async function fetchImageSafe(imgName) {
    if (!imgName) return null;
    try { return await loadImage(`${BASE_IMG_URL}${imgName}.png`); } catch {}
    const alt = imgName.replace(/_/g, '');
    if (alt !== imgName) {
        try { return await loadImage(`${BASE_IMG_URL}${alt}.png`); } catch {}
    }
    return null;
}

async function drawBg(ctx, bgImageName = 'hubbg', cw = W, ch = H) {
    const img = await fetchImageSafe(bgImageName);
    if (img) {
        ctx.drawImage(img, 0, 0, cw, ch);
        ctx.fillStyle = 'rgba(4,6,15,0.45)';
        ctx.fillRect(0, 0, cw, ch);
    } else {
        const sky = ctx.createLinearGradient(0, 0, 0, ch);
        sky.addColorStop(0,    '#020408');
        sky.addColorStop(0.5,  '#06091A');
        sky.addColorStop(1,    '#1A0A01');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, cw, ch);

        ctx.save();
        for (let i = 0; i < 200; i++) {
            const sx = Math.random() * cw;
            const sy = Math.random() * ch * 0.7;
            const sr = Math.random() * 1.5 + 0.2;
            ctx.globalAlpha = Math.random() * 0.6 + 0.1;
            ctx.fillStyle = Math.random() > 0.8 ? '#FFF9C4' : '#FFFFFF';
            ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();

        const dune = ctx.createLinearGradient(0, ch - 120, 0, ch);
        dune.addColorStop(0, '#1E0E02'); dune.addColorStop(1, '#0D0600');
        ctx.fillStyle = dune;
        ctx.beginPath();
        ctx.moveTo(0, ch);
        ctx.bezierCurveTo(cw*.2, ch-150, cw*.5, ch-100, cw*.8, ch-140);
        ctx.lineTo(cw, ch); ctx.closePath(); ctx.fill();
    }
}

function drawPanel(ctx, x, y, w, h, accent = C.gold, opts = {}) {
    const radius = opts.radius || 24;
    ctx.shadowColor = accent + '11';
    ctx.shadowBlur  = 15;

    const bg = ctx.createLinearGradient(x, y, x, y + h);
    bg.addColorStop(0, 'rgba(10,14,28,0.55)'); 
    bg.addColorStop(1, 'rgba(4,6,12,0.70)');
    rr(ctx, x, y, w, h, radius);
    ctx.fillStyle = bg; ctx.fill();
    ctx.shadowBlur = 0;

    rr(ctx, x, y, w, h, radius);
    ctx.strokeStyle = accent + '44';
    ctx.lineWidth   = 2;
    ctx.stroke();
}

function drawBar(ctx, x, y, w, h, pct, color, showLabel = true) {
    if (isNaN(pct) || pct < 0) pct = 0;
    if (pct > 1) pct = 1;
    
    rr(ctx, x, y, w, h, h / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fill();

    const filled = Math.max(h, pct * w);
    const grad = ctx.createLinearGradient(x, 0, x + w, 0);
    grad.addColorStop(0, color + 'AA');
    grad.addColorStop(1, color);
    rr(ctx, x, y, filled, h, h / 2);
    ctx.fillStyle   = grad;
    ctx.shadowColor = color;
    ctx.shadowBlur  = 12;
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

function R(ctx, txt, x, y, size, color = C.text) {
    ctx.font = `bold ${size}px ${FA}`; ctx.fillStyle = color;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(cleanText(txt), x, y);
}
function M(ctx, txt, x, y, size, color = C.text) {
    ctx.font = `bold ${size}px ${FA}`; ctx.fillStyle = color;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(cleanText(txt), x, y);
}
function L(ctx, txt, x, y, size, color = C.text) {
    ctx.font = `bold ${size}px ${FA}`; ctx.fillStyle = color;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(cleanText(txt), x, y);
}

function drawArcProgress(ctx, cx, cy, r, pct, color, labelSize = 26, subLabel = '') {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 12;
    ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI * 0.75, Math.PI * 0.75); ctx.stroke();
    const ag = ctx.createLinearGradient(cx - r, cy, cx + r, cy);
    ag.addColorStop(0, color + '88'); ag.addColorStop(1, color);
    ctx.strokeStyle = ag; ctx.lineWidth = 12;
    ctx.shadowColor = color; ctx.shadowBlur = 20;
    const end = -Math.PI * 0.75 + Math.max(0.01, Math.min(1, pct)) * Math.PI * 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI * 0.75, end); ctx.stroke();
    ctx.restore();
    M(ctx, `${(pct * 100).toFixed(1)}%`, cx, cy - 10, labelSize, color);
    
    if (subLabel) {
        const subSize = Math.max(12, labelSize - 10); 
        M(ctx, subLabel, cx, cy + r - 16, subSize, '#8A9AAA');
    }
}

function drawCornerAccents(ctx, cw = W, ch = H, color = '#F5C51855', size = 55, r = 18) {
    ctx.strokeStyle = color; ctx.lineWidth = 2.5;
    [[0, 0, 1, 1], [cw, 0, -1, 1], [0, ch, 1, -1], [cw, ch, -1, -1]].forEach(([x, y, sx, sy]) => {
        ctx.beginPath();
        ctx.moveTo(x + sx * size, y);
        ctx.lineTo(x + sx * r, y);
        ctx.arcTo(x, y, x, y + sy * r, r);
        ctx.lineTo(x, y + sy * size);
        ctx.stroke();
    });
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
    const words = cleanText(text).split(' ');
    let line = ''; let currentY = y;
    for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && n > 0) {
            if(align === 'center') M(ctx, line.trim(), x, currentY, parseInt(ctx.font), ctx.fillStyle);
            else if(align === 'right') R(ctx, line.trim(), x, currentY, parseInt(ctx.font), ctx.fillStyle);
            else L(ctx, line.trim(), x, currentY, parseInt(ctx.font), ctx.fillStyle);
            line = words[n] + ' ';
            currentY += lineHeight;
        } else { line = testLine; }
    }
    if(align === 'center') M(ctx, line.trim(), x, currentY, parseInt(ctx.font), ctx.fillStyle);
    else if(align === 'right') R(ctx, line.trim(), x, currentY, parseInt(ctx.font), ctx.fillStyle);
    else L(ctx, line.trim(), x, currentY, parseInt(ctx.font), ctx.fillStyle);
}

async function drawHeader(ctx, title, subtitle = '') {
    const hg = ctx.createLinearGradient(0, 0, 0, 130);
    hg.addColorStop(0, 'rgba(0,0,0,0.85)');
    hg.addColorStop(1, 'transparent');
    ctx.fillStyle = hg; ctx.fillRect(0, 0, W, 130);

    const lineG = ctx.createLinearGradient(0, 0, W, 0);
    lineG.addColorStop(0,   'transparent');
    lineG.addColorStop(0.3, C.gold);
    lineG.addColorStop(0.7, C.gold);
    lineG.addColorStop(1,   'transparent');
    ctx.fillStyle = lineG; ctx.fillRect(0, 128, W, 2.5);

    ctx.save();
    ctx.fillStyle = C.gold; ctx.shadowColor = C.gold; ctx.shadowBlur = 14;
    ctx.translate(W / 2, 129.5); ctx.rotate(Math.PI / 4);
    ctx.fillRect(-5, -5, 10, 10);
    ctx.restore();

    ctx.shadowColor = C.gold + '66'; ctx.shadowBlur = 20;
    M(ctx, title, W / 2, 50, 48, C.text);
    ctx.shadowBlur = 0;
    if (subtitle) M(ctx, subtitle, W / 2, 100, 26, C.textD);
}

function drawStars(ctx, n, max, x, y, size, color = C.gold) {
    ctx.font = `bold ${size}px ${FA}`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 8;
    ctx.fillText('★'.repeat(Math.min(n, max)) + '☆'.repeat(Math.max(0, max - n)), x, y);
    ctx.shadowBlur = 0;
}

function caravanRank(trips) {
    if (trips >= 51) return { name: 'اسطورة التجارة', color: '#FFD700' };
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

function truncate(str, max) {
    const s = cleanText(String(str || ''));
    return s.length > max ? s.slice(0, max) + '…' : s;
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
    await drawBg(ctx, 'hubbg');
    await drawHeader(ctx, 'مركز القوافل');

    const trips   = Number(stats.total_trips      || 0);
    const success = Number(stats.successful_trips || 0);
    const rank    = caravanRank(success);
    const level   = Number(profExtra.level    || 1);
    const repPts  = Number(profExtra.repPoints || 0);
    const repRank = getRepRankInfo(repPts);

    const LX = 40, LY = 150, LW = 420, LH = 710;
    drawPanel(ctx, LX, LY, LW, LH, rank.color);

    try {
        const av = await loadImage(user.displayAvatarURL({ extension: 'png', size: 256 }));
        ctx.save();
        ctx.beginPath(); ctx.arc(LX + LW / 2, LY + 90, 65, 0, Math.PI * 2); ctx.clip();
        ctx.drawImage(av, LX + LW / 2 - 65, LY + 25, 130, 130);
        ctx.restore();
        ctx.strokeStyle = rank.color; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(LX + LW / 2, LY + 90, 65, 0, Math.PI * 2); ctx.stroke();
    } catch {}

    rr(ctx, LX + 20, LY + 20, 80, 40, 12);
    ctx.fillStyle = 'rgba(0,0,0,0.60)'; ctx.fill();
    ctx.strokeStyle = C.gold + '88'; ctx.lineWidth = 1.5;
    rr(ctx, LX + 20, LY + 20, 80, 40, 12); ctx.stroke();
    M(ctx, `م.${level}`, LX + 60, LY + 40, 20, C.gold);

    M(ctx, truncate(user.username, 18), LX + LW / 2, LY + 185, 28, C.text);

    // تصميم الرتبة والسمعة المدمج
    const repText = `\u202B${cleanText(repRank.name)}\u202C`;
    ctx.font = `bold 22px ${FA}`;
    const txtWidth = ctx.measureText(repText).width;
    const ptsText = repPts.toLocaleString();
    ctx.font = `bold 16px Arial, sans-serif`;
    const ptsWidth = ctx.measureText(ptsText).width;
    
    const pillW = Math.max(50, ptsWidth + 20);
    const pillH = 34;
    const totalWidth = txtWidth + 16 + pillW + 40; // مسافة إضافية للإطار الخارجي
    const startX = LX + LW / 2 - totalWidth / 2; 

    // الإطار الخارجي المدمج
    rr(ctx, startX, LY + 215, totalWidth, pillH + 10, (pillH + 10) / 2);
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fill();
    ctx.strokeStyle = rank.color + '66'; ctx.lineWidth = 1.5;
    rr(ctx, startX, LY + 215, totalWidth, pillH + 10, (pillH + 10) / 2); ctx.stroke();

    // كبسولة السمعة (يمين الإطار الداخلي)
    const pillX = startX + totalWidth - pillW - 5;
    rr(ctx, pillX, LY + 220, pillW, pillH, pillH / 2);
    ctx.fillStyle = repRank.color + '22'; ctx.fill();
    ctx.strokeStyle = repRank.color + '77'; ctx.lineWidth = 1.5;
    rr(ctx, pillX, LY + 220, pillW, pillH, pillH / 2); ctx.stroke();
    
    ctx.font = `bold 16px Arial, sans-serif`;
    M(ctx, ptsText, pillX + pillW / 2, LY + 220 + pillH / 2, 16, repRank.color);

    // نص الرتبة (يسار الإطار الداخلي)
    ctx.font = `bold 22px ${FA}`;
    M(ctx, repText, startX + (totalWidth - pillW) / 2, LY + 220 + pillH / 2, 20, rank.color);

    divLine(ctx, LX + 30, LY + 280, LW - 60, rank.color + '44');

    const statItems = [
        { label: 'اجمالي الرحلات',  val: String(trips)   },
        { label: 'الرحلات الناجحة', val: String(success)  },
        { label: 'نسبة النجاح',     val: trips ? `${((success / trips) * 100).toFixed(0)}%` : '—' },
    ];
    let sy = LY + 300;
    for (const s of statItems) {
        rr(ctx, LX + 18, sy - 17, LW - 36, 40, 10);
        ctx.fillStyle = 'rgba(255,255,255,0.03)'; ctx.fill();
        R(ctx, s.label, LX + LW - 28, sy + 3, 18, C.textD);
        L(ctx, s.val,   LX + 28,      sy + 3, 20, C.gold);
        sy += 48;
    }

    divLine(ctx, LX + 25, sy + 8, LW - 50, rank.color + '33');
    sy += 45;

    const successRate = trips > 0 ? success / trips : 0;
    const arcCol = successRate >= 0.7 ? C.green : successRate >= 0.4 ? C.gold : C.red;
    drawArcProgress(ctx, LX + LW / 2, sy + 45, 42, successRate, arcCol, 22, 'معدل النجاح');

    const moraBoxY = LY + LH - 62;
    rr(ctx, LX + 18, moraBoxY, LW - 36, 48, 12);
    ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fill();
    ctx.strokeStyle = C.gold + '77'; ctx.lineWidth = 1.5;
    rr(ctx, LX + 18, moraBoxY, LW - 36, 48, 12); ctx.stroke();
    M(ctx, `رصيدك: ${Number(mora).toLocaleString()} مورا`, LX + LW / 2, moraBoxY + 24, 20, C.gold);

    const MX = 480, MY = 150, MW = 630, MH = 710;
    const RX = 1130, RY = 150, RW = 440, RH = 710;

    if (active) {
        const destId = active.destinationid || active.destinationId || '';
        const dest   = cfg.destinations.find(d => d.id === destId) || {};
        const acc    = dest.color || C.gold;
        const now    = Date.now();
        const start  = Number(active.starttime  || active.startTime  || now);
        const end    = Number(active.endtime    || active.endTime    || now);
        const prog   = (end <= start) ? 1 : Math.min(1, Math.max(0, (now - start) / (end - start)));
        const atkRes = Number(active.attackresolved || active.attackResolved || 0);
        const hasAtk = atkRes === 0 && (active.guardmessageid || active.guardMessageId);
        const rm     = Number(active.rewardmultiplier || active.rewardMultiplier || 1);

        drawPanel(ctx, MX, MY, MW, MH, acc);

        const oX = MX + 100,       oY = MY + MH - 220;
        const dX = MX + MW - 100,  dY = MY + 150;
        const cpX = (oX + dX) / 2, cpY = (oY + dY) / 2 - 140;

        const t  = prog;
        const cX = (1 - t) * (1 - t) * oX + 2 * (1 - t) * t * cpX + t * t * dX;
        const cY = (1 - t) * (1 - t) * oY + 2 * (1 - t) * t * cpY + t * t * dY;

        ctx.setLineDash([14, 12]);
        ctx.strokeStyle = acc + '33'; ctx.lineWidth = 8;
        ctx.beginPath(); ctx.moveTo(oX, oY); ctx.quadraticCurveTo(cpX, cpY, dX, dY); ctx.stroke();
        ctx.setLineDash([]);

        const pathG = ctx.createLinearGradient(oX, oY, cX, cY);
        pathG.addColorStop(0, acc + '66'); pathG.addColorStop(1, acc);
        ctx.strokeStyle = pathG; ctx.lineWidth = 10;
        ctx.shadowColor = acc; ctx.shadowBlur = 20;
        ctx.beginPath(); ctx.moveTo(oX, oY); ctx.quadraticCurveTo(cpX, cpY, cX, cY); ctx.stroke();
        ctx.shadowBlur  = 0;

        ctx.fillStyle = C.green; ctx.shadowColor = C.green; ctx.shadowBlur = 15;
        ctx.beginPath(); ctx.arc(oX, oY, 18, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        M(ctx, '🏠', oX, oY - 35, 34, C.text);

        ctx.fillStyle = acc; ctx.shadowColor = acc; ctx.shadowBlur = 25;
        ctx.beginPath(); ctx.arc(dX, dY, 20, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.font = `46px ${FE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(dest?.emoji || '📍', dX, dY - 45);

        const camelImg = await fetchImageSafe('camel');
        if (camelImg) {
            ctx.drawImage(camelImg, cX - 60, cY - 70, 120, 120);
        } else {
            const camelEmoji = hasAtk ? '⚔️' : '🐪';
            ctx.font = `80px ${FE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(camelEmoji, cX, cY - 14);
        }

        if (hasAtk) {
            const bw2 = 260, bx2 = cX - 130, by2 = cY - 100;
            rr(ctx, bx2, by2, bw2, 46, 12);
            ctx.fillStyle = 'rgba(231,76,60,0.95)'; ctx.fill();
            ctx.strokeStyle = C.red; ctx.lineWidth = 2;
            rr(ctx, bx2, by2, bw2, 46, 12); ctx.stroke();
            M(ctx, 'القافلة تتعرض لهجوم', cX, by2 + 23, 20, '#FFFFFF');
        }

        const barY2 = MY + MH - 80;
        M(ctx, `${(prog * 100).toFixed(1)}%`, MX + MW / 2, barY2 - 25, 24, acc);
        drawBar(ctx, MX + 50, barY2, MW - 100, 40, prog, acc);
        M(ctx, `في الطريق الى ${dest?.name || ''}`, MX + MW / 2, MY + 50, 26, acc);

        // --- اللوحة اليمنى (التقرير) مع صورة البطاقة ---
        drawPanel(ctx, RX, RY, RW, RH, acc);
        
        const destImg = await fetchImageSafe(destId.replace(/_/g, ''));
        if (destImg) {
            ctx.save();
            rr(ctx, RX, RY, RW, RH, 24);
            ctx.clip();
            ctx.globalAlpha = 0.25; 
            ctx.drawImage(destImg, RX, RY, RW, RH);
            ctx.restore();
        }

        let rpy = RY + 60;
        M(ctx, 'تقرير الرحلة', RX + RW / 2, rpy, 28, acc);
        rpy += 50; divLine(ctx, RX + 30, rpy, RW - 60, acc + '55'); rpy += 40;

        const tleft  = Math.max(0, end - now);
        const stMap2 = {
            'ok':  { t: 'تتقدم بامان',    c: C.green },
            'atk': { t: 'تحت الهجوم', c: C.red   },
            '1':   { t: 'نجحت الحراسة', c: C.blue  },
            '2':   { t: 'خسائر فادحة', c: '#FFA500' },
            '-1':  { t: 'نهبت بالكامل',     c: '#FF2222' },
        };
        const stk2 = hasAtk ? 'atk' : atkRes !== 0 ? String(atkRes) : 'ok';
        const st2  = stMap2[stk2] || stMap2['ok'];
        const rmC  = rm >= 1 ? C.green : rm >= 0.6 ? C.gold : C.red;

        const infoRows = [
            { label: 'الوجهة',          val: truncate(dest?.name || '', 14),           vc: acc   },
            { label: 'الحالة',          val: st2.t,                                    vc: st2.c   },
            { label: 'الوقت المتبقي',   val: formatArabicTime(tleft),                  vc: tleft <= 0 ? C.green : C.text },
            { label: 'المكافات',        val: `× ${rm.toFixed(2)}`,                    vc: rmC     },
        ];

        for (const row of infoRows) {
            rr(ctx, RX + 20, rpy - 24, RW - 40, 56, 12);
            ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fill(); 
            R(ctx, row.label,    RX + RW - 36, rpy + 4, 20, C.textD);
            L(ctx, row.val,      RX + 36,      rpy + 4, 22, row.vc);
            rpy += 75;
        }

    } else {
        drawPanel(ctx, MX, MY, MW, MH, C.gold);
        const camelImg = await fetchImageSafe('camel');
        if(camelImg) {
            ctx.drawImage(camelImg, MX + MW / 2 - 150, MY + MH * 0.45 - 150, 300, 300);
        } else {
            ctx.font = `200px ${FE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('🐪', MX + MW / 2, MY + MH * 0.45);
        }

        M(ctx, 'القوافل مستعدة للانطلاق', MX + MW / 2, MY + MH - 130, 34, C.gold);
        M(ctx, 'قم بتجهيز القافلة وارسلها', MX + MW / 2, MY + MH - 70, 24, C.textD);
        
        drawPanel(ctx, RX, RY, RW, RH, C.gold);
        let rpy = RY + 60;
        M(ctx, 'احصائياتك العامة', RX + RW / 2, rpy, 28, C.gold);
        rpy += 50; divLine(ctx, RX + 30, rpy, RW - 60, C.gold + '55'); rpy += 80;
        
        ctx.font = `140px ${FE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('🏜️', RX + RW / 2, rpy + 50);
        rpy += 180;
        
        M(ctx, `رحلاتك الناجحة: ${success} من ${trips}`, RX + RW / 2, rpy + 40, 24, C.text);
        const pct = trips > 0 ? ((success / trips) * 100).toFixed(0) : 0;
        rpy += 90; drawBar(ctx, RX + 40, rpy, RW - 80, 40, pct / 100, C.gold, false);
        M(ctx, `نسبة النجاح الاجمالية ${pct}%`, RX + RW / 2, rpy + 60, 20, C.textD);
    }

    return toBuf(canvas);
}
module.exports.generateCaravanHub = generateCaravanHub;

// ══════════════════════════════════════════════
//  2. SEND MAP — تحديد مسار القافلة
// ══════════════════════════════════════════════
async function generateSendMap(user, stats, mora) {
    const cfg  = require('../json/caravan-config.json');
    const core = require('../handlers/caravan-core.js');
    const canvas = createCanvas(W, H);
    const ctx    = canvas.getContext('2d');
    await drawBg(ctx, 'worldmap');
    await drawHeader(ctx, 'تحديد مسار القافلة');

    const DESTS = cfg.destinations;
    const cw = 290, ch = 540, cgap = 24;
    const totalW = DESTS.length * cw + (DESTS.length - 1) * cgap;
    const startX = (W - totalW) / 2;
    const cardY  = 180;

    for (let i=0; i<DESTS.length; i++) {
        const d = DESTS[i];
        const cx   = startX + i * (cw + cgap);
        const acc  = d.color || C.gold;
        const canAfford = Number(mora) >= d.cost;

        const destImg = await fetchImageSafe(d.id.replace(/_/g, ''));
        
        rr(ctx, cx, cardY, cw, ch, 24);
        if(destImg) {
            ctx.save(); ctx.clip();
            ctx.drawImage(destImg, cx, cardY, cw, ch);
            const bgGrad = ctx.createLinearGradient(cx, cardY, cx, cardY + ch);
            bgGrad.addColorStop(0, 'rgba(0,0,0,0.4)');
            bgGrad.addColorStop(0.5, 'rgba(10,14,28,0.85)');
            bgGrad.addColorStop(1, 'rgba(5,7,16,0.95)');
            ctx.fillStyle = bgGrad; ctx.fillRect(cx, cardY, cw, ch);
            ctx.restore();
        } else {
            const bg = ctx.createLinearGradient(cx, cardY, cx, cardY + ch);
            bg.addColorStop(0, acc + '33'); bg.addColorStop(1, 'rgba(4,6,14,0.95)');
            ctx.fillStyle = bg; ctx.fill();
        }
        
        ctx.strokeStyle = acc + (canAfford ? 'CC' : '44');
        ctx.lineWidth   = canAfford ? 3 : 1.5;
        rr(ctx, cx, cardY, cw, ch, 24); ctx.stroke();

        ctx.font = `80px ${FE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(d.emoji, cx + cw / 2, cardY + 80);

        M(ctx, d.name, cx + cw / 2, cardY + 170, 30, acc);

        divLine(ctx, cx + 20, cardY + 210, cw - 40, acc + '44');

        ctx.font = `20px ${FA}`; ctx.fillStyle = C.textD;
        wrapText(ctx, d.description || '', cx + cw / 2, cardY + 250, cw - 40, 36);

        const adjDur  = core.calcDuration(d, { speed_rank: Number(stats.speed_rank || 1) }, { speedBuff: 0 });
        const adjRisk = core.calcRiskFactor(d, { defense_rank: Number(stats.defense_rank || 1) });
        const riskC   = adjRisk >= 0.35 ? C.red : adjRisk >= 0.25 ? '#FFA500' : C.green;

        const rows = [
            { label: 'المدة',    val: formatArabicTime(adjDur),              vc: C.text    },
            { label: 'الخطر',   val: `${(adjRisk * 100).toFixed(0)}%`,       vc: riskC     },
            { label: 'التكلفة', val: `${d.cost.toLocaleString()}`,     vc: canAfford ? C.gold : C.red },
        ];
        let ry = cardY + 360;
        for (const row of rows) {
            rr(ctx, cx + 16, ry - 20, cw - 32, 44, 10);
            ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill();
            R(ctx, row.label, cx + cw - 28,  ry + 3, 22, C.textD);
            L(ctx, row.val,   cx + 28,        ry + 3, 22, row.vc);
            ry += 52;
        }

        if (!canAfford) {
            rr(ctx, cx + cw / 2 - 90, cardY + ch - 60, 180, 48, 12);
            ctx.fillStyle = 'rgba(231,76,60,0.40)'; ctx.fill();
            ctx.strokeStyle = C.red + '88'; ctx.lineWidth = 1.5;
            rr(ctx, cx + cw / 2 - 90, cardY + ch - 60, 180, 48, 12); ctx.stroke();
            M(ctx, 'رصيد غير كاف', cx + cw / 2, cardY + ch - 35, 22, C.red);
        }
    }

    const fy = cardY + ch + 40;
    divLine(ctx, 60, fy, W - 120, C.gold + '33');
    M(ctx, `اجمالي رصيدك المتوفر: ${Number(mora).toLocaleString()}`, W / 2, fy + 45, 28, C.gold);

    return toBuf(canvas);
}
module.exports.generateSendMap = generateSendMap;

// ══════════════════════════════════════════════
//  3. STATUS — متابعة القافلة
// ══════════════════════════════════════════════
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
    
    const destId = caravan?.destinationid || caravan?.destinationId || '';

    let bgName = 'journeymap';
    if (hasAtk || atkRes === 2 || atkRes === -1) bgName = 'banditattack';
    await drawBg(ctx, bgName);

    const subTitle = tleft <= 0 ? 'وصلت القافلة' : `متبقي ${formatArabicTime(tleft)}`;
    await drawHeader(ctx, `متابعة قافلة ${dest?.name || ''}`, subTitle);

    if (mode === 'map') {
        const MX = 80, MY = 160, MW = 1440, MH = 680;
        drawPanel(ctx, MX, MY, MW, MH, acc, { radius: 32 });

        const oX = MX + 200,       oY = MY + MH - 220;
        const dX = MX + MW - 200,  dY = MY + 200;
        const cpX = (oX + dX) / 2, cpY = (oY + dY) / 2 - 220;
        const t  = prog;
        const cX = (1 - t) * (1 - t) * oX + 2 * (1 - t) * t * cpX + t * t * dX;
        const cY = (1 - t) * (1 - t) * oY + 2 * (1 - t) * t * cpY + t * t * dY;

        ctx.setLineDash([25, 20]);
        ctx.strokeStyle = acc + '33'; ctx.lineWidth = 14;
        ctx.beginPath(); ctx.moveTo(oX, oY); ctx.quadraticCurveTo(cpX, cpY, dX, dY); ctx.stroke();
        ctx.setLineDash([]);

        const pathG = ctx.createLinearGradient(oX, oY, cX, cY);
        pathG.addColorStop(0, acc + '55'); pathG.addColorStop(0.6, acc + 'BB'); pathG.addColorStop(1, acc);
        ctx.strokeStyle = pathG; ctx.lineWidth = 20;
        ctx.shadowColor = acc; ctx.shadowBlur = 28;
        ctx.beginPath(); ctx.moveTo(oX, oY); ctx.quadraticCurveTo(cpX, cpY, cX, cY); ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = acc + '66'; ctx.lineWidth = 8;
        ctx.beginPath(); ctx.moveTo(oX, oY); ctx.quadraticCurveTo(cpX, cpY, cX, cY); ctx.stroke();

        ctx.fillStyle = C.green;
        ctx.beginPath(); ctx.arc(oX, oY, 35, 0, Math.PI * 2); ctx.fill();
        M(ctx, '🏠', oX, oY - 70, 70, C.text);
        M(ctx, 'المدينة', oX, oY + 70, 32, C.green);

        ctx.fillStyle = acc;
        ctx.beginPath(); ctx.arc(dX, dY, 35, 0, Math.PI * 2); ctx.fill();
        ctx.font = `90px ${FE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(dest?.emoji || '📍', dX, dY - 90);
        M(ctx, dest?.name || '', dX, dY + 80, 32, acc);

        const camelImg = await fetchImageSafe('camel');
        if (camelImg) {
            ctx.drawImage(camelImg, cX - 100, cY - 120, 200, 200);
        } else {
            const camelEmoji = hasAtk ? '⚔️' : '🐪';
            ctx.font = `160px ${FE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(camelEmoji, cX, cY - 30);
        }

        if (hasAtk) {
            const bw2 = 450, bx2 = cX - 225, by2 = cY - 180;
            rr(ctx, bx2, by2, bw2, 80, 16);
            ctx.fillStyle = 'rgba(231,76,60,0.95)'; ctx.fill();
            ctx.strokeStyle = C.red; ctx.lineWidth = 4;
            rr(ctx, bx2, by2, bw2, 80, 16); ctx.stroke();
            M(ctx, 'القافلة تتعرض لهجوم', cX, by2 + 40, 38, '#FFFFFF');
        }

        const barY2 = MY + MH - 120;
        M(ctx, `${(prog * 100).toFixed(1)}%`, MX + MW / 2, barY2 - 45, 42, acc);
        drawBar(ctx, MX + 150, barY2, MW - 300, 70, prog, acc);

        return toBuf(canvas);
    }

    // شاشة التقرير التفصيلي
    const RX = 80, RY = 180, RW = 1440, RH = 700;
    drawPanel(ctx, RX, RY, RW, RH, acc, { radius: 32 });

    const destImg = destId ? await fetchImageSafe(destId.replace(/_/g, '')) : null;
    if (destImg) {
        ctx.save();
        rr(ctx, RX + 40, RY + 40, 450, 620, 24);
        ctx.clip();
        const imgRatio = destImg.width / destImg.height;
        const drawH = 620;
        const drawW = 620 * imgRatio; 
        ctx.drawImage(destImg, RX + 40 - (drawW - 450)/2, RY + 40, drawW, drawH);
        ctx.restore();
    }

    const textStartX = RX + 530; 
    const textW = RW - 580;

    let py = RY + 80;
    M(ctx, 'التقرير التفصيلي للرحلة', textStartX + textW / 2, py, 50, acc);
    py += 80; divLine(ctx, textStartX, py, textW, acc + '55'); py += 60;

    R(ctx, dest?.name || '', textStartX + textW, py, 50, acc);
    ctx.font = `32px ${FA}`; ctx.fillStyle = C.textD;
    wrapText(ctx, dest?.description || '', textStartX + textW, py + 65, textW - 20, 45, 'right');
    
    py += 170; divLine(ctx, textStartX, py, textW); py += 60;

    const stMap2 = {
        'ok':  { t: 'تتقدم بامان',    c: C.green },
        'atk': { t: 'تتعرض لهجوم', c: C.red   },
        '1':   { t: 'نجحت الحراسة', c: C.blue  },
        '2':   { t: 'خسائر فادحة', c: '#FFA500' },
        '-1':  { t: 'نهبت بالكامل',     c: '#FF2222' },
    };
    const stk2 = hasAtk ? 'atk' : atkRes !== 0 ? String(atkRes) : 'ok';
    const st2  = stMap2[stk2] || stMap2['ok'];
    const rmC  = rm >= 1 ? C.green : rm >= 0.6 ? C.gold : C.red;
    
    const rawArts = caravan.equippedartifacts || caravan.equippedArtifacts;
    const arts = parseSafeArray(rawArts);

    const infoRows = [
        { label: 'حالة القافلة',    val: st2.t,                                    vc: st2.c   },
        { label: 'الوقت المتبقي',   val: tleft <= 0 ? 'وصلت الوجهة' : formatArabicTime(tleft), vc: tleft <= 0 ? C.green : C.text },
        { label: 'المكافات',  val: `× ${rm.toFixed(2)}`,                    vc: rmC     },
        { label: 'الادوات المجهزة', val: `${arts.length} اداة نشطة`,               vc: C.purple },
    ];

    for (const row of infoRows) {
        rr(ctx, textStartX, py - 35, textW, 75, 16);
        ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fill();
        R(ctx, row.label,    textStartX + textW - 30, py + 5, 34, C.textD);
        L(ctx, row.val,      textStartX + 30,      py + 5, 34, row.vc);
        py += 90;
    }

    return toBuf(canvas);
}
module.exports.generateCaravanStatus = generateCaravanStatus;

async function generateUpgradePanel(user, stats, mora) {
    const cfg    = require('../json/caravan-config.json');
    const canvas = createCanvas(W, H);
    const ctx    = canvas.getContext('2d');
    await drawBg(ctx, 'hubbg');
    await drawHeader(ctx, 'مركز تطوير القوافل');

    const upgList = [
        { key: 'capacity_rank', name: cfg.upgrades.capacity.name, emoji: '📦',
          max_level: cfg.upgrades.capacity.max_level, costs: cfg.upgrades.capacity.costs,
          effectLabel: `زيادة الغنائم ${(cfg.upgrades.capacity.bonus_per_level * 100).toFixed(0)}% للمستوى`,
          col: '#FF9933' },
        { key: 'speed_rank',    name: cfg.upgrades.speed.name,    emoji: '⚡',
          max_level: cfg.upgrades.speed.max_level,    costs: cfg.upgrades.speed.costs,
          effectLabel: `تقليص الوقت ${(cfg.upgrades.speed.time_reduction * 100).toFixed(0)}% للمستوى`,
          col: '#00C3FF' },
        { key: 'defense_rank',  name: cfg.upgrades.defense.name,  emoji: '🛡️',
          max_level: cfg.upgrades.defense.max_level,  costs: cfg.upgrades.defense.costs,
          effectLabel: `تخفيض الخطر ${(cfg.upgrades.defense.risk_reduction * 100).toFixed(0)}% للمستوى`,
          col: '#8888FF' },
        { key: 'luck_rank',     name: cfg.upgrades.luck.name,     emoji: '🍀',
          max_level: cfg.upgrades.luck.max_level,     costs: cfg.upgrades.luck.costs,
          effectLabel: `مضاعفة الحظ ${(cfg.upgrades.luck.bonus_per_level * 100).toFixed(0)}% للمستوى`,
          col: '#2ECC71' },
    ];

    const cw = 720, ch = 330, gap = 40;
    const gx0 = (W - (2 * cw + gap)) / 2; 
    const gy0 = 180;

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
            rr(ctx, cx + 30, cy + 30, 96, 44, 12);
            ctx.fillStyle   = col + 'CC'; ctx.fill();
            M(ctx, 'MAX', cx + 78, cy + 52, 22, '#FFF');
        } else {
            rr(ctx, cx + 30, cy + 30, 90, 44, 12);
            ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fill();
            ctx.strokeStyle = col + '88'; ctx.lineWidth = 2;
            rr(ctx, cx + 30, cy + 30, 90, 44, 12); ctx.stroke();
            M(ctx, `${rank} / ${u.max_level}`, cx + 75, cy + 52, 22, col);
        }

        R(ctx, u.name, cx + cw - 30, cy + 50, 36, col);
        R(ctx, u.effectLabel, cx + cw - 30, cy + 95, 26, C.textD);

        ctx.font = `80px ${FE}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(u.emoji, cx + 30, cy + 110);

        divLine(ctx, cx + 30, cy + 145, cw - 60, col + '44');

        drawStars(ctx, rank, u.max_level, cx + cw - 30, cy + 180, 40, col);
        L(ctx, `المستوى ${rank}`, cx + 30, cy + 180, 28, C.textD);

        drawBar(ctx, cx + 30, cy + 215, cw - 60, 32, rank / u.max_level, col, false);

        divLine(ctx, cx + 30, cy + 265, cw - 60, col + '33');

        if (maxed) {
            M(ctx, 'تم الوصول للحد الاقصى', cx + cw / 2, cy + 295, 28, col);
        } else {
            R(ctx, `التكلفة: ${cost.toLocaleString()}`, cx + cw - 30, cy + 295, 28, canAf ? C.gold : C.red);

            const btnW = 280, btnX = cx + 30, btnY = cy + 270;
            const btnG = ctx.createLinearGradient(btnX, btnY, btnX + btnW, btnY + 54);
            btnG.addColorStop(0, canAf ? col + '44' : 'rgba(120,40,40,0.40)');
            btnG.addColorStop(1, canAf ? col + '20' : 'rgba(80,20,20,0.25)');
            rr(ctx, btnX, btnY, btnW, 54, 14);
            ctx.fillStyle   = btnG; ctx.fill();
            ctx.strokeStyle = canAf ? col + 'BB' : C.red + '66'; ctx.lineWidth = 2.5;
            rr(ctx, btnX, btnY, btnW, 54, 14); ctx.stroke();
            M(ctx, canAf ? `متوفر للترقية` : 'رصيد غير كاف', cx + 170, cy + 297, 24, canAf ? '#FFF' : C.red);
        }
    });

    return toBuf(canvas);
}
module.exports.generateUpgradePanel = generateUpgradePanel;

async function generateEquipPanel(user, equipped, invRows, allItems, mora) {
    const core   = require('../handlers/caravan-core.js');
    const canvas = createCanvas(W, H);
    const ctx    = canvas.getContext('2d');
    await drawBg(ctx, 'hubbg');
    await drawHeader(ctx, 'تجهيز القافلة', 'الحد الاقصى 3 ادوات فقط');

    const RARITY_COL = {
        Common: '#A8B8D0', Uncommon: '#2ECC71', Rare: '#00C3FF',
        Epic: '#B968FF',   Legendary: '#FFD700',
    };

    const sw = 480, sh = 220, sgap = 30;
    const sx0 = (W - (3 * sw + 2 * sgap)) / 2;
    const sy0 = 160;

    for (let s = 0; s < 3; s++) {
        const sx  = sx0 + s * (sw + sgap);
        const id  = equipped[s] || null;
        const itm = id ? allItems.find(x => x.id === id) : null;
        const col = itm ? (RARITY_COL[itm.rarity] || C.textD) : '#2A3A4A';

        drawPanel(ctx, sx, sy0, sw, sh, col, { noCorners: !itm, radius: 24 });

        rr(ctx, sx + 20, sy0 + 20, 48, 36, 10);
        ctx.fillStyle = col + '44'; ctx.fill();
        M(ctx, String(s + 1), sx + 44, sy0 + 38, 24, col);

        if (itm) {
            ctx.font = `70px ${FE}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
            ctx.fillText(itm.type === 'book' ? '📖' : '⚙️', sx + 30, sy0 + 105);

            R(ctx, getItemNameSafe(id).substring(0, 18), sx + sw - 20, sy0 + 55, 30, col);
            R(ctx, itm.rarity, sx + sw - 20, sy0 + 95, 24, C.textD);

            const isMat = itm.type === 'material' || !itm.type?.includes('book');
            const bPct  = { Common:.03, Uncommon:.05, Rare:.08, Epic:.12, Legendary:.20 }[itm.rarity] || .03;
            const bLabel = isMat ? `سرعة اضافية ${(bPct*100).toFixed(0)}%` : `حظ اضافي ${(bPct*100).toFixed(0)}%`;
            R(ctx, bLabel, sx + sw - 20, sy0 + 135, 24, col);

            divLine(ctx, sx + 20, sy0 + 175, sw - 40, col + '44');
            M(ctx, 'مجهزة بالقافلة', sx + sw / 2, sy0 + 195, 22, '#4A7A4A');
        } else {
            ctx.globalAlpha = 0.20;
            ctx.font = `80px ${FE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('➕', sx + sw / 2, sy0 + sh / 2 + 10);
            ctx.globalAlpha = 1;
            M(ctx, `الفتحة فارغة`, sx + sw / 2, sy0 + sh - 35, 26, '#334455');
        }
    }

    const buffs = core.getEquippedBuffs(equipped);
    const sumY  = sy0 + sh + 35;
    const sbg   = ctx.createLinearGradient(60, sumY, W - 60, sumY + 70);
    sbg.addColorStop(0, 'rgba(0,195,255,0.08)');
    sbg.addColorStop(1, 'rgba(46,204,113,0.08)');
    rr(ctx, 60, sumY, W - 120, 70, 16);
    ctx.fillStyle = sbg; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 2;
    rr(ctx, 60, sumY, W - 120, 70, 16); ctx.stroke();

    const bText = `اجمالي السرعة ${(buffs.speedBuff * 100).toFixed(0)}%   |   اجمالي الحظ ${(buffs.luckBuff * 100).toFixed(0)}%`;
    M(ctx, bText, W / 2, sumY + 35, 30, C.text);

    const gridY = sumY + 95;
    divLine(ctx, 60, gridY, W - 120, C.gold + '33');
    M(ctx, 'الادوات المتوفرة في المخزن', W / 2, gridY + 40, 30, C.gold);

    const iw = 235, ih = 150, igap = 20, cols = 6;
    const igw = cols * iw + (cols - 1) * igap;
    const igx = (W - igw) / 2;
    const igy = gridY + 80;
    
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
        rr(ctx, ix, iy, iw, ih, 16);
        ctx.fillStyle = ibg; ctx.fill();
        ctx.strokeStyle = isEq ? col : col + '44';
        ctx.lineWidth   = isEq ? 3 : 1.5;
        rr(ctx, ix, iy, iw, ih, 16); ctx.stroke();

        if (isEq) { L(ctx, '✅', ix + 12, iy + 26, 24, C.green); }

        ctx.font = `50px ${FE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(itm?.type === 'book' ? '📖' : '⚙️', ix + iw / 2, iy + 55);

        M(ctx, truncate(getItemNameSafe(id), 12), ix + iw / 2, iy + 105, 24, col);
        M(ctx, itm?.rarity || '',                 ix + iw / 2, iy + 130, 18, C.textD);
    }

    return toBuf(canvas);
}
module.exports.generateEquipPanel = generateEquipPanel;
