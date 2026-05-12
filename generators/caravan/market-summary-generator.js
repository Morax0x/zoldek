const { loadImage } = require('@napi-rs/canvas');
const {
    createCanvas, drawBg, truncate, toBuf, fetchImageSafe
} = require('./shared');

const CW = 1400;
const CH = 1050;

const RARITY_COLORS = {
    'Common':    '#A8B8D0',
    'Uncommon':  '#2ECC71',
    'Rare':      '#00C3FF',
    'Epic':      '#B968FF',
    'Legendary': '#FFD700',
};

const FONT_WORD = '"aaa"';
const FONT_NUM  = '"ReemKufi-Regular"';
const FONT_EMOJI = '"Emoji"';

function itemColor(rarity) { 
    return RARITY_COLORS[rarity] || '#8A9AAA'; 
}

function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16) || 255;
    const g = parseInt(hex.slice(3, 5), 16) || 215;
    const b = parseInt(hex.slice(5, 7), 16) || 0;
    return `rgba(${r},${g},${b},${alpha})`;
}

function cleanStr(str) {
    return String(str).replace(/<a?:mora:\d+>/gi, 'مورا').replace(/<a?:[^:]+:\d+>/g, '').trim();
}

function drawTextExact(ctx, text, x, y, font, color, align = 'center', glow = 0) {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    if (glow > 0) {
        ctx.shadowColor = color;
        ctx.shadowBlur = glow;
    } else {
        ctx.shadowBlur = 0;
    }
    ctx.fillText(text, x, y);
    ctx.shadowBlur = 0;
}

async function generateMarketSummaryCanvas({
    destName, destId = null, destColor = '#FFD700', ownerName, avatarUrl = null,
    soldItems, unsoldItems, totalEarned, journeyRewards = [],
}) {
    const canvas = createCanvas(CW, CH);
    const ctx = canvas.getContext('2d');
    const TC = destColor || '#FFD700';

    await drawBg(ctx, 'marketbg');
    ctx.fillStyle = 'rgba(7, 10, 20, 0.94)';
    ctx.fillRect(0, 0, CW, CH);

    const destImg = await fetchImageSafe(destId || destName || '');
    if (destImg) {
        ctx.save();
        ctx.globalAlpha = 0.30;
        const scale = Math.max(CW / destImg.width, CH / destImg.height);
        const dx = (CW - destImg.width * scale) / 2;
        const dy = (CH - destImg.height * scale) / 2;
        ctx.drawImage(destImg, dx, dy, destImg.width * scale, destImg.height * scale);
        
        const maskG = ctx.createLinearGradient(0, 0, 0, CH);
        maskG.addColorStop(0, 'rgba(7, 10, 20, 0.2)');
        maskG.addColorStop(1, 'rgba(7, 10, 20, 1)');
        ctx.globalAlpha = 1.0;
        ctx.fillStyle = maskG;
        ctx.fillRect(0, 0, CW, CH);
        ctx.restore();
    }

    const glowC = ctx.createRadialGradient(CW / 2, CH / 3, 0, CW / 2, CH / 3, 1000);
    glowC.addColorStop(0, hexToRgba(TC, 0.25));
    glowC.addColorStop(1, 'transparent');
    ctx.fillStyle = glowC;
    ctx.fillRect(0, 0, CW, CH);

    const headG = ctx.createLinearGradient(0, 0, 0, 250);
    headG.addColorStop(0, 'rgba(0,0,0,0.98)');
    headG.addColorStop(1, 'transparent');
    ctx.fillStyle = headG;
    ctx.fillRect(0, 0, CW, 250);

    drawTextExact(ctx, `عادت قافلتك من - ${destName}`, CW / 2, 70, `bold 60px ${FONT_WORD}`, TC, 'center', 30);

    const pillW = 600;
    const pillH = 100;
    const pillX = CW / 2 - pillW / 2;
    const pillY = 140;

    const lineY = pillY + pillH / 2;
    const lineG = ctx.createLinearGradient(0, 0, CW, 0);
    lineG.addColorStop(0, 'transparent');
    lineG.addColorStop(0.1, hexToRgba(TC, 0.6));
    lineG.addColorStop(pillX / CW, TC);
    lineG.addColorStop((pillX + pillW) / CW, TC);
    lineG.addColorStop(0.9, hexToRgba(TC, 0.6));
    lineG.addColorStop(1, 'transparent');
    
    ctx.strokeStyle = lineG;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, lineY);
    ctx.lineTo(pillX - 10, lineY);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(pillX + pillW + 10, lineY);
    ctx.lineTo(CW, lineY);
    ctx.stroke();

    ctx.beginPath();
    ctx.roundRect(pillX, pillY, pillW, pillH, pillH / 2);
    ctx.fillStyle = 'rgba(20, 25, 40, 0.95)';
    ctx.fill();
    ctx.strokeStyle = hexToRgba(TC, 0.8);
    ctx.lineWidth = 3;
    ctx.stroke();

    const avR = 42;
    const avX = pillX + avR + 12;
    const avY = pillY + pillH / 2;

    let avatarImg = null;
    if (avatarUrl) { try { avatarImg = await loadImage(avatarUrl); } catch {} }

    if (avatarImg) {
        ctx.save();
        ctx.beginPath(); ctx.arc(avX, avY, avR, 0, Math.PI * 2); ctx.clip();
        ctx.drawImage(avatarImg, avX - avR, avY - avR, avR * 2, avR * 2);
        ctx.restore();
        ctx.beginPath(); ctx.arc(avX, avY, avR, 0, Math.PI * 2);
        ctx.strokeStyle = TC; ctx.lineWidth = 3; ctx.stroke();
    } else {
        ctx.beginPath(); ctx.arc(avX, avY, avR, 0, Math.PI * 2);
        ctx.fillStyle = '#111'; ctx.fill();
        ctx.strokeStyle = TC; ctx.lineWidth = 3; ctx.stroke();
        drawTextExact(ctx, '👤', avX, avY, `45px ${FONT_EMOJI}`, '#FFF', 'center');
    }

    let nameFontSize = 44;
    ctx.font = `bold ${nameFontSize}px ${FONT_WORD}`;
    const maxNameW = pillW - (avR * 2) - 60;
    while (ctx.measureText(ownerName).width > maxNameW && nameFontSize > 24) {
        nameFontSize--;
        ctx.font = `bold ${nameFontSize}px ${FONT_WORD}`;
    }
    drawTextExact(ctx, ownerName, pillX + pillW - 30, avY, `bold ${nameFontSize}px ${FONT_WORD}`, '#FFF', 'right');

    const HAS_JOURNEY = journeyRewards && journeyRewards.length > 0;
    let currentY = 275;
    
    if (HAS_JOURNEY) {
        const jHeight = 240;
        drawJourneySection(ctx, 100, currentY, CW - 200, jHeight, journeyRewards, TC);
        currentY += jHeight + 50;
    }

    const earnW = 850, earnH = 130;
    const earnX = (CW - earnW) / 2;
    
    ctx.beginPath();
    ctx.roundRect(earnX, currentY, earnW, earnH, 35);
    const earnG = ctx.createLinearGradient(earnX, currentY, earnX, currentY + earnH);
    earnG.addColorStop(0, hexToRgba(TC, 0.25));
    earnG.addColorStop(1, hexToRgba(TC, 0.05));
    ctx.fillStyle = earnG; ctx.fill();
    ctx.strokeStyle = hexToRgba(TC, 1.0);
    ctx.lineWidth = 4; ctx.stroke();
    
    drawTextExact(ctx, 'ايرادات بضاعة القافلة', earnX + earnW - 50, currentY + earnH / 2, `42px ${FONT_WORD}`, '#EEE', 'right', 10);
    
    const earnedStr = totalEarned.toLocaleString();
    ctx.font = `bold 68px ${FONT_NUM}`;
    const eW = ctx.measureText(earnedStr).width;
    drawTextExact(ctx, earnedStr, earnX + 50, currentY + earnH / 2, `bold 68px ${FONT_NUM}`, TC, 'left', 25);
    drawTextExact(ctx, 'مورا', earnX + 70 + eW, currentY + earnH / 2 + 8, `36px ${FONT_WORD}`, TC, 'left');

    currentY += earnH + 50;

    const colH = CH - currentY - 50;
    const colW = 620;
    const gap = 60;
    const leftColX = 100;
    const rightColX = leftColX + colW + gap;

    drawColumnData(ctx, rightColX, currentY, colW, colH, soldItems, 'البضائع المباعة', '#2ECC71', true, TC);
    drawColumnData(ctx, leftColX, currentY, colW, colH, unsoldItems, 'البضائع المرتجعة', '#E74C3C', false, TC);

    return toBuf(canvas);
}

function drawJourneySection(ctx, x, y, w, h, rewards, themeColor) {
    const headH = 75;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 35);
    ctx.fillStyle = 'rgba(15, 25, 45, 0.85)'; ctx.fill();
    
    ctx.beginPath();
    ctx.roundRect(x, y, w, headH, [35, 35, 0, 0]);
    ctx.fillStyle = hexToRgba(themeColor, 0.3); ctx.fill();
    
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 35);
    ctx.strokeStyle = hexToRgba(themeColor, 0.6); ctx.lineWidth = 2.5; ctx.stroke();
    
    drawTextExact(ctx, 'الغنائم والمكافآت المكتسبة', x + w / 2, y + headH / 2, `38px ${FONT_WORD}`, themeColor, 'center', 20);
    
    const cleaned = rewards.map(cleanStr).filter(Boolean);
    if (cleaned.length === 0) {
        drawTextExact(ctx, 'لا توجد غنائم لهذه الرحلة', x + w / 2, y + headH + (h - headH) / 2, `34px ${FONT_WORD}`, '#888', 'center');
        return;
    }

    const cols = 3;
    const cellW = Math.floor((w - 80) / cols);
    const cellH = 85;
    const startY = y + headH + 40;

    for (let i = 0; i < cleaned.length; i++) {
        const str = cleaned[i];
        const cRow = Math.floor(i / cols);
        const cCol = i % cols;
        const bX = x + w - 40 - (cCol * cellW) - cellW;
        const bY = startY + cRow * (cellH + 20);

        if (bY + cellH > y + h - 20) break; 

        ctx.beginPath();
        ctx.roundRect(bX + 15, bY, cellW - 30, cellH, 22);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.06)'; ctx.fill();
        ctx.strokeStyle = hexToRgba(themeColor, 0.5); ctx.lineWidth = 2; ctx.stroke();

        const firstSpace = str.indexOf(' ');
        let emoji = '🎁', text = str;
        if (firstSpace !== -1 && firstSpace < 6) {
            emoji = str.substring(0, firstSpace);
            text = str.substring(firstSpace + 1);
        }

        const match = text.match(/[\d,xX.+]+/);
        let pNum = '', pText = text;
        if (match) {
            pNum = match[0];
            pText = text.replace(pNum, '').trim();
        }

        drawTextExact(ctx, emoji, bX + cellW - 40, bY + cellH / 2, `42px ${FONT_EMOJI}`, '#FFF', 'center');
        drawTextExact(ctx, pText, bX + cellW - 85, bY + cellH / 2 - 2, `32px ${FONT_WORD}`, '#FFF', 'right');
        if (pNum) {
            drawTextExact(ctx, pNum, bX + 45, bY + cellH / 2 + 2, `38px ${FONT_NUM}`, themeColor, 'left');
        }
    }
}

function drawColumnData(ctx, x, y, w, h, items, title, color, isSold, themeColor) {
    const headH = 95;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 35);
    ctx.fillStyle = 'rgba(10, 15, 30, 0.92)'; ctx.fill();
    
    ctx.beginPath();
    ctx.roundRect(x, y, w, headH, [35, 35, 0, 0]);
    ctx.fillStyle = hexToRgba(color, 0.3); ctx.fill();
    
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 35);
    ctx.strokeStyle = hexToRgba(color, 0.7); ctx.lineWidth = 3; ctx.stroke();
    
    drawTextExact(ctx, title, x + w / 2, y + headH / 2, `bold 42px ${FONT_WORD}`, color, 'center', 20);
    
    if (!items || !items.length) {
        drawTextExact(ctx, 'القائمة فارغة', x + w / 2, y + headH + (h - headH) / 2, `38px ${FONT_WORD}`, '#666', 'center');
        return;
    }

    const rH = 105;
    const startY = y + headH + 25;
    const limit = Math.floor((h - headH - 60) / rH);
    const vis = items.slice(0, limit);

    for (let i = 0; i < vis.length; i++) {
        const it = vis[i];
        const cY = startY + i * rH + rH / 2;
        
        if (i % 2 === 0) {
            ctx.beginPath();
            ctx.roundRect(x + 20, cY - rH / 2, w - 40, rH - 10, 20);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.05)'; ctx.fill();
        }

        const e = it.itemEmoji || '📦';
        const n = truncate(it.itemName || it.itemId || '?', 16);
        const p = Number(it.pricePerUnit || 0);
        const q = isSold ? Number(it.quantitySold || 0) : (Number(it.quantity || 0) - Number(it.quantitySold || 0));
        
        drawTextExact(ctx, e, x + w - 40, cY, `52px ${FONT_EMOJI}`, '#FFF', 'right');
        drawTextExact(ctx, n, x + w - 110, cY - 18, `36px ${FONT_WORD}`, '#FFF', 'right');
        
        ctx.fillStyle = itemColor(it.rarity);
        ctx.beginPath(); 
        ctx.arc(x + w - 125 - ctx.measureText(n).width - 15, cY - 18, 10, 0, Math.PI*2); ctx.fill();

        drawTextExact(ctx, 'x', x + 280, cY, `32px ${FONT_WORD}`, '#999', 'right');
        drawTextExact(ctx, q.toString(), x + 300, cY, `44px ${FONT_NUM}`, '#FFF', 'left');

        if (isSold) {
            const tot = (q * p).toLocaleString();
            drawTextExact(ctx, tot, x + 40, cY, `40px ${FONT_NUM}`, color, 'left');
            const tw = ctx.measureText(tot).width;
            drawTextExact(ctx, 'مورا', x + 55 + tw, cY + 8, `28px ${FONT_WORD}`, color, 'left');
        } else {
            drawTextExact(ctx, 'لم تبع', x + 40, cY, `32px ${FONT_WORD}`, color, 'left');
        }
    }

    if (items.length > limit) {
        drawTextExact(ctx, `... و ${items.length - limit} أصناف أخرى`, x + w / 2, y + h - 35, `30px ${FONT_WORD}`, '#999', 'center');
    }
}

module.exports = { generateMarketSummaryCanvas };
