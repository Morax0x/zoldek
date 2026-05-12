const { loadImage } = require('@napi-rs/canvas');
const {
    createCanvas, drawBg, drawCornerAccents, truncate, toBuf, fetchImageSafe
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

function drawPanelWithHeader(ctx, x, y, w, h, radius, headerH, mainColor, headerColor, strokeColor) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.fillStyle = mainColor;
    ctx.fill();
    ctx.clip();

    ctx.fillStyle = headerColor;
    ctx.fillRect(x, y, w, headerH);
    ctx.restore();

    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2;
    ctx.stroke();
}

async function generateMarketSummaryCanvas({
    destName, destId = null, destColor = '#FFD700', ownerName, avatarUrl = null,
    soldItems, unsoldItems, totalEarned, journeyRewards = [],
}) {
    const canvas = createCanvas(CW, CH);
    const ctx = canvas.getContext('2d');
    const TC = destColor || '#FFD700';

    await drawBg(ctx, 'marketbg');
    ctx.fillStyle = 'rgba(4, 6, 12, 0.90)';
    ctx.fillRect(0, 0, CW, CH);

    const destImg = await fetchImageSafe(destId || destName || '');
    if (destImg) {
        ctx.save();
        ctx.globalAlpha = 0.25;
        const scale = Math.max(CW / destImg.width, CH / destImg.height);
        const dx = (CW - destImg.width * scale) / 2;
        const dy = (CH - destImg.height * scale) / 2;
        ctx.drawImage(destImg, dx, dy, destImg.width * scale, destImg.height * scale);
        ctx.restore();
    }

    const glowC = ctx.createRadialGradient(CW / 2, CH / 3, 0, CW / 2, CH / 3, 900);
    glowC.addColorStop(0, hexToRgba(TC, 0.22));
    glowC.addColorStop(1, 'transparent');
    ctx.fillStyle = glowC;
    ctx.fillRect(0, 0, CW, CH);

    drawCornerAccents(ctx);

    const headG = ctx.createLinearGradient(0, 0, 0, 200);
    headG.addColorStop(0, 'rgba(0,0,0,0.95)');
    headG.addColorStop(1, 'transparent');
    ctx.fillStyle = headG;
    ctx.fillRect(0, 0, CW, 200);

    const lineG = ctx.createLinearGradient(0, 0, CW, 0);
    lineG.addColorStop(0, 'transparent');
    lineG.addColorStop(0.2, hexToRgba(TC, 0.5));
    lineG.addColorStop(0.5, TC);
    lineG.addColorStop(0.8, hexToRgba(TC, 0.5));
    lineG.addColorStop(1, 'transparent');
    ctx.fillStyle = lineG;
    ctx.fillRect(0, 180, CW, 3);

    drawTextExact(ctx, `التقرير الشامل للرحلة والسوق — ${destName}`, CW / 2, 60, `bold 48px ${FONT_WORD}`, TC, 'center', 25);

    let avatarImg = null;
    if (avatarUrl) {
        try { avatarImg = await loadImage(avatarUrl); } catch {}
    }

    const avR = 48;
    const avX = CW / 2 + 200;
    const avY = 135;
    
    ctx.beginPath();
    ctx.roundRect(CW / 2 - 280, avY - avR + 5, 560, avR * 2 - 10, avR - 5);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fill();

    if (avatarImg) {
        ctx.save();
        ctx.beginPath(); ctx.arc(avX, avY, avR - 2, 0, Math.PI * 2); ctx.clip();
        ctx.drawImage(avatarImg, avX - avR, avY - avR, avR * 2, avR * 2);
        ctx.restore();
        ctx.beginPath(); ctx.arc(avX, avY, avR - 2, 0, Math.PI * 2);
        ctx.strokeStyle = TC; ctx.lineWidth = 3; ctx.stroke();
    } else {
        ctx.beginPath(); ctx.arc(avX, avY, avR - 2, 0, Math.PI * 2);
        ctx.fillStyle = '#222'; ctx.fill();
        ctx.strokeStyle = TC; ctx.lineWidth = 3; ctx.stroke();
        drawTextExact(ctx, '👤', avX, avY, `45px ${FONT_EMOJI}`, '#FFF', 'center');
    }

    drawTextExact(ctx, truncate(ownerName, 20), avX - 70, avY, `36px ${FONT_WORD}`, '#FFF', 'right');
    drawTextExact(ctx, 'التاجر:', CW / 2 - 240, avY, `26px ${FONT_WORD}`, '#AAA', 'left');

    const HAS_JOURNEY = journeyRewards && journeyRewards.length > 0;
    let currentY = 220;
    
    if (HAS_JOURNEY) {
        const jHeight = 200;
        drawJourneySection(ctx, 80, currentY, CW - 160, jHeight, journeyRewards, TC);
        currentY += jHeight + 35;
    }

    const earnW = 680, earnH = 100;
    const earnX = (CW - earnW) / 2;
    
    ctx.beginPath();
    ctx.roundRect(earnX, currentY, earnW, earnH, 25);
    ctx.fillStyle = hexToRgba(TC, 0.15);
    ctx.fill();
    ctx.strokeStyle = hexToRgba(TC, 0.7);
    ctx.lineWidth = 2;
    ctx.stroke();
    
    drawTextExact(ctx, 'إيرادات السوق الصافية:', earnX + earnW - 40, currentY + earnH / 2, `32px ${FONT_WORD}`, '#DDD', 'right');
    
    const earnedStr = totalEarned.toLocaleString();
    ctx.font = `bold 50px ${FONT_NUM}`;
    const eW = ctx.measureText(earnedStr).width;
    drawTextExact(ctx, earnedStr, earnX + 40, currentY + earnH / 2, `bold 50px ${FONT_NUM}`, TC, 'left', 18);
    drawTextExact(ctx, 'مورا', earnX + 60 + eW, currentY + earnH / 2, `28px ${FONT_WORD}`, TC, 'left');

    currentY += earnH + 35;

    const colY = currentY;
    const colH = CH - colY - 40;
    const colW = 600;

    const gap = 40;
    const leftColX = 80;
    const rightColX = leftColX + colW + gap;

    drawColumnData(ctx, rightColX, colY, colW, colH, soldItems, 'البضائع المباعة بنجاح', '#2ECC71', true);
    drawColumnData(ctx, leftColX, colY, colW, colH, unsoldItems, 'البضائع المرتجعة للمخزن', '#E74C3C', false);

    return toBuf(canvas);
}

function drawJourneySection(ctx, x, y, w, h, rewards, themeColor) {
    const headH = 55;
    drawPanelWithHeader(ctx, x, y, w, h, 25, headH, 'rgba(15, 22, 36, 0.75)', hexToRgba(themeColor, 0.25), hexToRgba(themeColor, 0.5));
    
    drawTextExact(ctx, 'غنائم الرحلة', x + w / 2, y + 27, `30px ${FONT_WORD}`, themeColor, 'center', 10);
    
    const cleaned = rewards.map(cleanStr).filter(Boolean);
    if (cleaned.length === 0) {
        drawTextExact(ctx, 'لا توجد غنائم إضافية لهذه الرحلة', x + w / 2, y + headH + (h - headH) / 2, `28px ${FONT_WORD}`, '#888', 'center');
        return;
    }

    const cols = Math.min(cleaned.length, 3);
    const cellW = Math.floor((w - 60) / cols);
    const cellH = 65;
    const startX = x + w - 30;
    const startY = y + headH + 25;

    for (let i = 0; i < cleaned.length; i++) {
        const str = cleaned[i];
        const cRow = Math.floor(i / cols);
        const cCol = i % cols;
        const bX = startX - (cCol * cellW) - cellW;
        const bY = startY + cRow * (cellH + 15);

        if (bY + cellH > y + h - 10) break; 

        ctx.beginPath();
        ctx.roundRect(bX + 15, bY, cellW - 30, cellH, 18);
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fill();
        ctx.strokeStyle = hexToRgba(themeColor, 0.4);
        ctx.lineWidth = 1;
        ctx.stroke();

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

        drawTextExact(ctx, emoji, bX + cellW - 30, bY + cellH / 2, `34px ${FONT_EMOJI}`, '#FFF', 'center');
        drawTextExact(ctx, pText, bX + cellW - 65, bY + cellH / 2 - 2, `26px ${FONT_WORD}`, '#FFF', 'right');
        if (pNum) {
            drawTextExact(ctx, pNum, bX + 35, bY + cellH / 2, `30px ${FONT_NUM}`, themeColor, 'left');
        }
    }
}

function drawColumnData(ctx, x, y, w, h, items, title, color, isSold) {
    const headH = 70;
    drawPanelWithHeader(ctx, x, y, w, h, 25, headH, 'rgba(12, 16, 26, 0.85)', hexToRgba(color, 0.25), hexToRgba(color, 0.6));
    
    drawTextExact(ctx, title, x + w / 2, y + 35, `bold 32px ${FONT_WORD}`, color, 'center', 15);
    
    if (!items || !items.length) {
        drawTextExact(ctx, 'القائمة فارغة', x + w / 2, y + headH + (h - headH) / 2, `28px ${FONT_WORD}`, '#666', 'center');
        return;
    }

    const rH = 80;
    const startY = y + headH + 15;
    const limit = Math.floor((h - headH - 40) / rH);
    const vis = items.slice(0, limit);

    for (let i = 0; i < vis.length; i++) {
        const it = vis[i];
        const cY = startY + i * rH + rH / 2;
        
        if (i % 2 === 0) {
            ctx.beginPath();
            ctx.roundRect(x + 15, cY - rH / 2, w - 30, rH - 6, 15);
            ctx.fillStyle = 'rgba(255,255,255,0.04)';
            ctx.fill();
        }

        const e = it.itemEmoji || '📦';
        const n = truncate(it.itemName || it.itemId || '?', 16);
        const p = Number(it.pricePerUnit || 0);
        const q = isSold ? Number(it.quantitySold || 0) : (Number(it.quantity || 0) - Number(it.quantitySold || 0));
        
        drawTextExact(ctx, e, x + w - 30, cY, `38px ${FONT_EMOJI}`, '#FFF', 'right');
        drawTextExact(ctx, n, x + w - 85, cY - 12, `26px ${FONT_WORD}`, '#FFF', 'right');
        
        ctx.fillStyle = itemColor(it.rarity);
        ctx.beginPath(); 
        ctx.arc(x + w - 95 - ctx.measureText(n).width - 15, cY - 12, 6, 0, Math.PI*2); 
        ctx.fill();

        drawTextExact(ctx, 'x', x + 195, cY, `22px ${FONT_WORD}`, '#888', 'right');
        drawTextExact(ctx, q.toString(), x + 210, cY, `30px ${FONT_NUM}`, '#FFF', 'left');

        if (isSold) {
            const tot = (q * p).toLocaleString();
            drawTextExact(ctx, tot, x + 30, cY, `30px ${FONT_NUM}`, color, 'left');
            const tw = ctx.measureText(tot).width;
            drawTextExact(ctx, 'مورا', x + 35 + tw, cY, `20px ${FONT_WORD}`, color, 'left');
        } else {
            drawTextExact(ctx, 'أُعيد للمخزن', x + 30, cY, `22px ${FONT_WORD}`, color, 'left');
        }
    }

    if (items.length > limit) {
        drawTextExact(ctx, `... وهناك ${items.length - limit} أصناف أخرى`, x + w / 2, y + h - 25, `22px ${FONT_WORD}`, '#888', 'center');
    }
}

module.exports = { generateMarketSummaryCanvas };
