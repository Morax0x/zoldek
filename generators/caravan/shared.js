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
        .replace(/[ً-ٰٟ]/g, '')
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

function loadImageSafe(url, timeoutMs = 8000) {
    return Promise.race([
        loadImage(url).then(img => ({ ok: true, img })),
        new Promise(res => setTimeout(() => res({ ok: false, timeout: true }), timeoutMs)),
    ]).catch(() => ({ ok: false }));
}

const _imgCache = new Map();
async function loadCached(url) {
    if (!url) return null;
    if (_imgCache.has(url)) return _imgCache.get(url);
    const result = await loadImageSafe(url);
    if (!result.ok) { console.error(`[Canvas] Failed: ${url}`); return null; }
    _imgCache.set(url, result.img);
    return result.img;
}

async function fetchImageSafe(imgName) {
    if (!imgName) return null;
    const url = `${BASE_IMG_URL}${imgName}.png`;
    if (_imgCache.has(url)) return _imgCache.get(url);
    const first = await loadImageSafe(url);
    if (first.ok) { _imgCache.set(url, first.img); return first.img; }
    const alt = imgName.replace(/_/g, '');
    if (alt !== imgName) {
        const altUrl = `${BASE_IMG_URL}${alt}.png`;
        const second = await loadImageSafe(altUrl);
        if (second.ok) { _imgCache.set(url, second.img); _imgCache.set(altUrl, second.img); return second.img; }
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

    // Outer glow
    ctx.shadowColor = accent + '22';
    ctx.shadowBlur  = 24;
    rr(ctx, x, y, w, h, radius);
    ctx.strokeStyle = 'transparent';
    ctx.lineWidth = 0;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Panel body
    const bg = ctx.createLinearGradient(x, y, x, y + h);
    bg.addColorStop(0, 'rgba(12,16,32,0.62)');
    bg.addColorStop(0.5, 'rgba(8,11,22,0.72)');
    bg.addColorStop(1, 'rgba(4,6,14,0.82)');
    rr(ctx, x, y, w, h, radius);
    ctx.fillStyle = bg; ctx.fill();

    // Outer border
    rr(ctx, x, y, w, h, radius);
    ctx.strokeStyle = accent + '55';
    ctx.lineWidth   = 2;
    ctx.stroke();

    // Inner highlight line (top edge)
    rr(ctx, x + 2, y + 2, w - 4, h - 4, radius - 1);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth   = 1;
    ctx.stroke();

    // Top accent bar (4px strip)
    ctx.save();
    rr(ctx, x, y, w, 4, [radius, radius, 0, 0]);
    ctx.fillStyle = accent + '66';
    ctx.fill();
    ctx.restore();
}

function drawBar(ctx, x, y, w, h, pct, color, showLabel = true) {
    if (isNaN(pct) || pct < 0) pct = 0;
    if (pct > 1) pct = 1;

    // Track background
    rr(ctx, x, y, w, h, h / 2);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fill();
    rr(ctx, x, y, w, h, h / 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1;
    ctx.stroke();

    const filled = pct * w;
    if (filled > 0) {
        ctx.save();
        rr(ctx, x, y, w, h, h / 2);
        ctx.clip();

        const grad = ctx.createLinearGradient(x, y, x + filled, y);
        grad.addColorStop(0, color + 'AA');
        grad.addColorStop(1, color);
        rr(ctx, x, y, Math.max(h, filled), h, h / 2);
        ctx.fillStyle   = grad;
        ctx.shadowColor = color;
        ctx.shadowBlur  = 14;
        ctx.fill();
        ctx.shadowBlur  = 0;

        // Gloss highlight on filled part
        const gloss = ctx.createLinearGradient(x, y, x, y + h * 0.5);
        gloss.addColorStop(0, 'rgba(255,255,255,0.22)');
        gloss.addColorStop(1, 'rgba(255,255,255,0.02)');
        rr(ctx, x, y, Math.max(h, filled), h * 0.5, h / 2);
        ctx.fillStyle = gloss;
        ctx.fill();

        ctx.restore();
    }

    if (showLabel && h >= 16) {
        ctx.font         = `bold ${Math.max(14, h - 8)}px ${FA}`;
        ctx.fillStyle    = '#FFFFFF';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.direction    = 'ltr';
        ctx.shadowColor  = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur   = 4;
        ctx.fillText(`${(pct * 100).toFixed(0)}%`, x + w / 2, y + h / 2 + 1);
        ctx.shadowBlur   = 0;
    }
}

function R(ctx, txt, x, y, size, color = C.text) {
    ctx.font = `bold ${size}px ${FA}`; ctx.fillStyle = color;
    ctx.direction = 'rtl';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(cleanText(txt), x, y);
}
function M(ctx, txt, x, y, size, color = C.text) {
    ctx.font = `bold ${size}px ${FA}`; ctx.fillStyle = color;
    ctx.direction = 'rtl';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(cleanText(txt), x, y);
}
function L(ctx, txt, x, y, size, color = C.text) {
    ctx.font = `bold ${size}px ${FA}`; ctx.fillStyle = color;
    ctx.direction = 'rtl';
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
    M(ctx, `${(pct * 100).toFixed(1)}%`, cx, cy - 2, labelSize, color);
    if (subLabel) M(ctx, subLabel, cx, cy + r + 16, Math.max(13, labelSize - 9), '#8A9AAA');
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
    const fontSize = parseInt(ctx.font) || 20;
    const fillColor = ctx.fillStyle;
    let line = ''; let currentY = y;
    for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && n > 0) {
            if(align === 'center') M(ctx, line.trim(), x, currentY, fontSize, fillColor);
            else if(align === 'right') R(ctx, line.trim(), x, currentY, fontSize, fillColor);
            else L(ctx, line.trim(), x, currentY, fontSize, fillColor);
            line = words[n] + ' ';
            currentY += lineHeight;
        } else { line = testLine; }
    }
    if(align === 'center') M(ctx, line.trim(), x, currentY, fontSize, fillColor);
    else if(align === 'right') R(ctx, line.trim(), x, currentY, fontSize, fillColor);
    else L(ctx, line.trim(), x, currentY, fontSize, fillColor);
}

async function drawHeader(ctx, title, subtitle = '') {
    // Header gradient overlay
    const hg = ctx.createLinearGradient(0, 0, 0, 145);
    hg.addColorStop(0, 'rgba(0,0,0,0.90)');
    hg.addColorStop(0.7, 'rgba(0,0,0,0.60)');
    hg.addColorStop(1, 'transparent');
    ctx.fillStyle = hg; ctx.fillRect(0, 0, W, 145);

    // Gold separator line with wider gradient
    const lineG = ctx.createLinearGradient(0, 0, W, 0);
    lineG.addColorStop(0,    'transparent');
    lineG.addColorStop(0.15, C.gold + '66');
    lineG.addColorStop(0.35, C.gold);
    lineG.addColorStop(0.65, C.gold);
    lineG.addColorStop(0.85, C.gold + '66');
    lineG.addColorStop(1,    'transparent');
    ctx.fillStyle = lineG; ctx.fillRect(0, 131, W, 2);

    // Center diamond ornament
    ctx.save();
    ctx.fillStyle = C.gold; ctx.shadowColor = C.gold; ctx.shadowBlur = 16;
    ctx.translate(W / 2, 132); ctx.rotate(Math.PI / 4);
    ctx.fillRect(-6, -6, 12, 12);
    ctx.restore();

    // Side ornament lines
    ctx.strokeStyle = C.gold + '33'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(W / 2 - 300, 132); ctx.lineTo(W / 2 - 20, 132); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W / 2 + 20, 132); ctx.lineTo(W / 2 + 300, 132); ctx.stroke();

    // Title with strong glow
    ctx.shadowColor = C.gold + '55'; ctx.shadowBlur = 28;
    M(ctx, title, W / 2, subtitle ? 50 : 65, subtitle ? 46 : 52, C.text);
    ctx.shadowBlur = 0;

    if (subtitle) {
        ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 6;
        M(ctx, subtitle, W / 2, 100, 26, C.textD);
        ctx.shadowBlur = 0;
    }
}

function drawStars(ctx, n, max, x, y, size, color = C.gold) {
    ctx.font = `bold ${size}px ${FA}`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 8;
    ctx.fillText('★'.repeat(Math.min(n, max)) + '☆'.repeat(Math.max(0, max - n)), x, y);
    ctx.shadowBlur = 0;
}

function caravanRank(trips) {
    if (trips >= 1000) return { name: 'عظيم الجزيرة',      color: '#FF0000' };
    if (trips >= 600)  return { name: 'مجير القوافل',       color: '#D4006E' };
    if (trips >= 500)  return { name: 'كسرى التجار',        color: '#B800D4' };
    if (trips >= 400)  return { name: 'خازن الاقليم',       color: '#8B00FF' };
    if (trips >= 300)  return { name: 'سيد البر والبحر',    color: '#4B0082' };
    if (trips >= 200)  return { name: 'ملك طريق الحرير',   color: '#C49A10' };
    if (trips >= 150)  return { name: 'ملك التجار',         color: '#FFD700' };
    if (trips >= 100)  return { name: 'اعجوبة التجار',      color: '#FF8C00' };
    if (trips >= 90)   return { name: 'طواف الصحراء',       color: '#E67E22' };
    if (trips >= 75)   return { name: 'سيد الركائب',        color: '#D35400' };
    if (trips >= 50)   return { name: 'جواب الافق',         color: '#3498DB' };
    if (trips >= 40)   return { name: 'عقيد التجار',        color: '#2ECC71' };
    if (trips >= 30)   return { name: 'صاحب العير',         color: '#1ABC9C' };
    if (trips >= 10)   return { name: 'تاجر الأسواق',       color: '#F39C12' };
    return                     { name: 'تاجر متجول',        color: '#8A9AAA' };
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

module.exports = {
    createCanvas,
    W, H, FA, FE, BASE_IMG_URL, C, allGameItems,
    cleanText, formatArabicTime, getItemNameSafe,
    rr, fetchImageSafe, loadCached, drawBg, drawPanel, drawBar,
    R, M, L,
    drawArcProgress, drawCornerAccents, divLine, wrapText,
    drawHeader, drawStars, caravanRank, getRepRankInfo,
    truncate, toBuf, parseSafeArray,
};
