const { loadImage } = require('@napi-rs/canvas');
const {
    createCanvas, C, FE, drawBg, drawCornerAccents, divLine, truncate, toBuf, fetchImageSafe
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

function itemColor(rarity) { return RARITY_COLORS[rarity] || '#8A9AAA'; }

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

function drawRoundRect(ctx, x, y, w, h, r, fillColor, strokeColor, lineWidth = 0) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    if (fillColor) {
        ctx.fillStyle = fillColor;
        ctx.fill();
    }
    if (strokeColor && lineWidth > 0) {
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
    }
}

async function generateMarketSummaryCanvas({
    destName, destId = null, destColor = '#FFD700', ownerName, avatarUrl = null,
    soldItems, unsoldItems, totalEarned, journeyRewards = [],
}) {
    const canvas = createCanvas(CW, CH);
    const ctx = canvas.getContext('2d');
    const TC = destColor || '#FFD700';

    await drawBg(ctx, 'marketbg');
    ctx.fillStyle = 'rgba(6, 10, 18, 0.88)';
    ctx.fillRect(0, 0, CW, CH);

    const destImg = await fetchImageSafe(destId || destName || '');
    if (destImg) {
        ctx.save();
        ctx.globalAlpha = 0.35;
        const scale = Math.max(CW / destImg.width, CH / destImg.height);
        const dx = (CW - destImg.width * scale) / 2;
        const dy = (CH - destImg.height * scale) / 2;
        ctx.drawImage(destImg, dx, dy, destImg.width * scale, destImg.height * scale);
        ctx.restore();
    }

    const glowC = ctx.createRadialGradient(CW / 2, CH / 3, 0, CW / 2, CH / 3, 800);
    glowC.addColorStop(0, hexToRgba(TC, 0.18));
    glowC.addColorStop(1, 'transparent');
    ctx.fillStyle = glowC;
    ctx.fillRect(0, 0, CW, CH);

    drawCornerAccents(ctx);

    const headG = ctx.createLinearGradient(0, 0, 0, 180);
    headG.addColorStop(0, 'rgba(0,0,0,0.98)');
    headG.addColorStop(1, 'transparent');
    ctx.fillStyle = headG;
    ctx.fillRect(0, 0, CW, 180);

    const lineG = ctx.createLinearGradient(0, 0, CW, 0);
    lineG.addColorStop(0, 'transparent');
    lineG.addColorStop(0.2, hexToRgba(TC, 0.4));
    lineG.addColorStop(0.5, TC);
    lineG.addColorStop(0.8, hexToRgba(TC, 0.4));
    lineG.addColorStop(1, 'transparent');
    ctx.fillStyle = lineG;
    ctx.fillRect(0, 160, CW, 3);

    drawTextExact(ctx, `التقرير الشامل للرحلة والسوق — ${destName}`, CW / 2, 55, `bold 46px ${FONT_WORD}`, TC, 'center', 20);

    let avatarImg = null;
    if (avatarUrl) {
        try { avatarImg = await loadImage(avatarUrl); } catch {}
    }

    const avR = 45;
    const avX = CW / 2 + 180;
    const avY = 120;
    
    drawRoundRect(ctx, CW / 2 - 250, avY - avR + 5, 500, avR * 2 - 10, avR - 5, 'rgba(255, 255, 255, 0.08)');

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
        drawTextExact(ctx, '👤', avX, avY, `40px ${FONT_EMOJI}`, '#FFF', 'center');
    }

    drawTextExact(ctx, truncate(ownerName, 20), avX - 65, avY, `32px ${FONT_WORD}`, '#FFF', 'right');
    drawTextExact(ctx, 'التاجر:', CW / 2 - 220, avY, `24px ${FONT_WORD}`, '#AAA', 'left');

    const HAS_JOURNEY = journeyRewards && journeyRewards.length > 0;
    let currentY = 195;
    
    if (HAS_JOURNEY) {
        const jHeight = 220;
        drawJourneySection(ctx, 80, currentY, CW - 160, jHeight, journeyRewards, TC);
        currentY += jHeight + 25;
    }

    const earnW = 600, earnH = 90;
    const earnX = (CW - earnW) / 2;
    
    drawRoundRect(ctx, earnX, currentY, earnW, earnH, 20, hexToRgba(TC, 0.15), hexToRgba(TC, 0.6), 2);
    
    drawTextExact(ctx, 'إيرادات السوق الصافية:', earnX + earnW - 30, currentY + earnH / 2, `28px ${FONT_WORD}`, '#DDD', 'right');
    
    const earnedStr = totalEarned.toLocaleString();
    ctx.font = `bold 42px ${FONT_NUM}`;
    const eW = ctx.measureText(earnedStr).width;
    drawTextExact(ctx, earnedStr, earnX + 30, currentY + earnH / 2, `bold 42px ${FONT_NUM}`, TC, 'left', 15);
    drawTextExact(ctx, 'مورا', earnX + 45 + eW, currentY + earnH / 2, `24px ${FONT_WORD}`, TC, 'left');

    currentY += earnH + 30;

    const colY = currentY;
    const colH = CH - colY - 40;
    const colW = CW / 2 - 60;

    drawColumnData(ctx, CW / 2 + 20, colY, colW, colH, soldItems, 'البضائع المباعة بنجاح', '#2ECC71', true);
    drawColumnData(ctx, 40, colY, colW, colH, unsoldItems, 'البضائع المرتجعة للمخزن', '#E74C3C', false);

    return toBuf(canvas);
}

function drawJourneySection(ctx, x, y, w, h, rewards, themeColor) {
    drawRoundRect(ctx, x, y, w, h, 25, 'rgba(15, 22, 36, 0.75)', hexToRgba(themeColor, 0.4), 2);
    
    ctx.beginPath();
    ctx.roundRect(x, y, w, 55, [25, 25, 0, 0]);
    ctx.fillStyle = hexToRgba(themeColor, 0.25);
    ctx.fill();
    
    drawTextExact(ctx, 'غنائم الرحلة המكتسبة', x + w / 2, y + 27, `28px ${FONT_WORD}`, themeColor, 'center', 10);
    
    const cleaned = rewards.map(cleanStr).filter(Boolean);
    if (cleaned.length === 0) {
        drawTextExact(ctx, 'لا توجد غنائم إضافية لهذه الرحلة', x + w / 2, y + h / 2 + 15, `26px ${FONT_WORD}`, '#888', 'center');
        return;
    }

    const cols = Math.min(cleaned.length, 3);
    const rows = Math.ceil(cleaned.length / cols);
    const cellW = (w - 40) / cols;
    const cellH = 65;
    const startX = x + w - 20;
    const startY = y + 75;

    for (let i = 0; i < cleaned.length; i++) {
        const str = cleaned[i];
        const cRow = Math.floor(i / cols);
        const cCol = i % cols;
        const bX = startX - (cCol * cellW) - cellW;
        const bY = startY + cRow * (cellH + 10);

        drawRoundRect(ctx, bX + 10, bY, cellW - 20, cellH, 15, 'rgba(255,255,255,0.04)', hexToRgba(themeColor, 0.3), 1);

        const firstSpace = str.indexOf(' ');
        let emoji = '🎁', text = str;
        if (firstSpace !== -1 && firstSpace < 6) {
            emoji = str.substring(0, firstSpace);
            text = str.substring(firstSpace + 1);
        }

        const isNumRegex = /^[0-9xX,+-\s]+$/;
        let pText = text, pNum = '';
        const txtParts = text.split(' ');
        if (txtParts.length > 1 && isNumRegex.test(txtParts[0])) {
            pNum = txtParts[0];
            pText = txtParts.slice(1).join(' ');
        } else if (txtParts.length > 1 && isNumRegex.test(txtParts[txtParts.length - 1])) {
            pNum = txtParts[txtParts.length - 1];
            pText = txtParts.slice(0, txtParts.length - 1).join(' ');
        }

        drawTextExact(ctx, emoji, bX + cellW - 25, bY + cellH / 2, `28px ${FONT_EMOJI}`, '#FFF', 'center');
        drawTextExact(ctx, pText, bX + cellW - 55, bY + cellH / 2, `24px ${FONT_WORD}`, '#FFF', 'right');
        if (pNum) {
            drawTextExact(ctx, pNum, bX + 25, bY + cellH / 2 + 2, `26px ${FONT_NUM}`, themeColor, 'left');
        }
    }
}

function drawColumnData(ctx, x, y, w, h, items, title, color, isSold) {
    drawRoundRect(ctx, x, y, w, h, 25, 'rgba(12, 16, 26, 0.85)', hexToRgba(color, 0.5), 2);
    
    ctx.beginPath();
    ctx.roundRect(x, y, w, 65, [25, 25, 0, 0]);
    ctx.fillStyle = hexToRgba(color, 0.25);
    ctx.fill();
    
    drawTextExact(ctx, title, x + w / 2, y + 32, `bold 28px ${FONT_WORD}`, color, 'center', 15);
    
    if (!items || !items.length) {
        drawTextExact(ctx, 'القائمة فارغة', x + w / 2, y + h / 2, `26px ${FONT_WORD}`, '#666', 'center');
        return;
    }

    const rH = 75;
    const startY = y + 80;
    const limit = Math.floor((h - 95) / rH);
    const vis = items.slice(0, limit);

    for (let i = 0; i < vis.length; i++) {
        const it = vis[i];
        const cY = startY + i * rH + rH / 2;
        
        if (i % 2 === 0) {
            drawRoundRect(ctx, x + 15, cY - rH / 2, w - 30, rH - 5, 12, 'rgba(255,255,255,0.04)');
        }

        const e = it.itemEmoji || '📦';
        const n = truncate(it.itemName || it.itemId || '?', 16);
        const p = Number(it.pricePerUnit || 0);
        const q = isSold ? Number(it.quantitySold || 0) : (Number(it.quantity || 0) - Number(it.quantitySold || 0));
        
        drawTextExact(ctx, e, x + w - 30, cY, `32px ${FONT_EMOJI}`, '#FFF', 'right');
        drawTextExact(ctx, n, x + w - 75, cY - 12, `24px ${FONT_WORD}`, '#FFF', 'right');
        
        ctx.fillStyle = itemColor(it.rarity);
        ctx.beginPath(); 
        ctx.arc(x + w - 85 - ctx.measureText(n).width - 15, cY - 12, 6, 0, Math.PI*2); 
        ctx.fill();

        drawTextExact(ctx, 'x', x + 160, cY, `20px ${FONT_WORD}`, '#888', 'right');
        drawTextExact(ctx, q.toString(), x + 170, cY, `26px ${FONT_NUM}`, '#FFF', 'left');

        if (isSold) {
            const tot = (q * p).toLocaleString();
            drawTextExact(ctx, tot, x + 30, cY, `26px ${FONT_NUM}`, color, 'left');
            const tw = ctx.measureText(tot).width;
            drawTextExact(ctx, 'مورا', x + 35 + tw, cY, `18px ${FONT_WORD}`, color, 'left');
        } else {
            drawTextExact(ctx, 'أُعيد للمخزن', x + 30, cY, `20px ${FONT_WORD}`, color, 'left');
        }
    }

    if (items.length > limit) {
        drawTextExact(ctx, `... وهناك ${items.length - limit} أصناف أخرى`, x + w / 2, y + h - 25, `20px ${FONT_WORD}`, '#888', 'center');
    }
}

module.exports = { generateMarketSummaryCanvas };
