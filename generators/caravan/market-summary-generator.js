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

function drawPanelWithHeader(ctx, x, y, w, h, radius, headerH, mainColor, headerColor, strokeColor) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.fillStyle = mainColor;
    ctx.fill();

    ctx.beginPath();
    ctx.roundRect(x, y, w, headerH, [radius, radius, 0, 0]);
    ctx.fillStyle = headerColor;
    ctx.fill();

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
    ctx.fillStyle = 'rgba(6, 9, 16, 0.94)';
    ctx.fillRect(0, 0, CW, CH);

    const destImg = await fetchImageSafe(destId || destName || '');
    if (destImg) {
        ctx.save();
        ctx.globalAlpha = 0.3;
        const scale = Math.max(CW / destImg.width, CH / destImg.height);
        const dx = (CW - destImg.width * scale) / 2;
        const dy = (CH - destImg.height * scale) / 2;
        ctx.drawImage(destImg, dx, dy, destImg.width * scale, destImg.height * scale);
        ctx.restore();
    }

    const glowC = ctx.createRadialGradient(CW / 2, CH / 4, 0, CW / 2, CH / 4, 1000);
    glowC.addColorStop(0, hexToRgba(TC, 0.2));
    glowC.addColorStop(1, 'transparent');
    ctx.fillStyle = glowC;
    ctx.fillRect(0, 0, CW, CH);

    const headG = ctx.createLinearGradient(0, 0, 0, 250);
    headG.addColorStop(0, 'rgba(0,0,0,1)');
    headG.addColorStop(1, 'transparent');
    ctx.fillStyle = headG;
    ctx.fillRect(0, 0, CW, 250);

    drawTextExact(ctx, `عادت قافلتك من - ${destName}`, CW / 2, 70, `bold 58px ${FONT_WORD}`, TC, 'center', 30);

    const pillW = 500;
    const pillH = 90;
    const pillX = (CW - pillW) / 2;
    const pillY = 150;

    const lineY = pillY + pillH / 2;
    const lineG = ctx.createLinearGradient(0, 0, CW, 0);
    lineG.addColorStop(0, 'transparent');
    lineG.addColorStop(0.3, TC);
    lineG.addColorStop(0.7, TC);
    lineG.addColorStop(1, 'transparent');
    ctx.strokeStyle = lineG;
    ctx.lineWidth = 3;

    ctx.beginPath();
    ctx.moveTo(50, lineY);
    ctx.lineTo(pillX - 20, lineY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(pillX + pillW + 20, lineY);
    ctx.lineTo(CW - 50, lineY);
    ctx.stroke();

    ctx.beginPath();
    ctx.roundRect(pillX, pillY, pillW, pillH, pillH / 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fill();
    ctx.strokeStyle = hexToRgba(TC, 0.6);
    ctx.lineWidth = 2;
    ctx.stroke();

    let avatarImg = null;
    if (avatarUrl) { try { avatarImg = await loadImage(avatarUrl); } catch {} }

    const avR = 36;
    const avX = pillX + pillW - avR - 10;
    const avY = pillY + pillH / 2;

    if (avatarImg) {
        ctx.save();
        ctx.beginPath(); ctx.arc(avX, avY, avR, 0, Math.PI * 2); ctx.clip();
        ctx.drawImage(avatarImg, avX - avR, avY - avR, avR * 2, avR * 2);
        ctx.restore();
        ctx.beginPath(); ctx.arc(avX, avY, avR, 0, Math.PI * 2);
        ctx.strokeStyle = TC; ctx.lineWidth = 3; ctx.stroke();
    }

    let fontSize = 42;
    ctx.font = `${fontSize}px ${FONT_WORD}`;
    while (ctx.measureText(ownerName).width > (pillW - 140) && fontSize > 20) {
        fontSize -= 2;
        ctx.font = `${fontSize}px ${FONT_WORD}`;
    }
    drawTextExact(ctx, ownerName, pillX + 25, avY, ctx.font, '#FFF', 'left');

    const HAS_JOURNEY = journeyRewards && journeyRewards.length > 0;
    let currentY = 280;
    
    if (HAS_JOURNEY) {
        const jHeight = 220;
        drawJourneySection(ctx, 100, currentY, CW - 200, jHeight, journeyRewards, TC);
        currentY += jHeight + 40;
    }

    const earnW = 750, earnH = 110;
    const earnX = (CW - earnW) / 2;
    
    ctx.beginPath();
    ctx.roundRect(earnX, currentY, earnW, earnH, 30);
    ctx.fillStyle = hexToRgba(TC, 0.12);
    ctx.fill();
    ctx.strokeStyle = hexToRgba(TC, 0.8);
    ctx.lineWidth = 3;
    ctx.stroke();
    
    drawTextExact(ctx, 'إيرادات بضاعة القافلة', earnX + earnW - 40, currentY + earnH / 2, `34px ${FONT_WORD}`, '#EEE', 'right');
    
    const earnedStr = totalEarned.toLocaleString();
    ctx.font = `bold 64px ${FONT_NUM}`;
    const eW = ctx.measureText(earnedStr).width;
    drawTextExact(ctx, earnedStr, earnX + 40, currentY + earnH / 2, `bold 64px ${FONT_NUM}`, TC, 'left', 20);
    drawTextExact(ctx, 'مورا', earnX + 60 + eW, currentY + earnH / 2 + 6, `32px ${FONT_WORD}`, TC, 'left');

    currentY += earnH + 50;

    const colH = CH - currentY - 50;
    const colW = 580;
    const gap = 60;
    const leftColX = 90;
    const rightColX = leftColX + colW + gap;

    drawColumnData(ctx, rightColX, currentY, colW, colH, soldItems, 'البضائع المباعة', '#2ECC71', true);
    drawColumnData(ctx, leftColX, currentY, colW, colH, unsoldItems, 'البضائع المرتجعة', '#E74C3C', false);

    return toBuf(canvas);
}

function drawJourneySection(ctx, x, y, w, h, rewards, themeColor) {
    const headH = 65;
    drawPanelWithHeader(ctx, x, y, w, h, 30, headH, 'rgba(15, 22, 36, 0.88)', hexToRgba(themeColor, 0.3), hexToRgba(themeColor, 0.6));
    
    drawTextExact(ctx, 'غنائم الرحلة المكتسبة', x + w / 2, y + 32, `38px ${FONT_WORD}`, themeColor, 'center', 15);
    
    const cleaned = rewards.map(cleanStr).filter(Boolean);
    if (cleaned.length === 0) {
        drawTextExact(ctx, 'لم يتم كسب موارد إضافية', x + w / 2, y + headH + (h - headH) / 2, `32px ${FONT_WORD}`, '#888', 'center');
        return;
    }

    const cols = 3;
    const cellW = Math.floor((w - 60) / cols);
    const cellH = 80;
    const startX = x + w - 30;
    const startY = y + headH + 35;

    for (let i = 0; i < cleaned.length; i++) {
        const str = cleaned[i];
        const cRow = Math.floor(i / cols);
        const cCol = i % cols;
        const bX = startX - (cCol * cellW) - cellW;
        const bY = startY + cRow * (cellH + 20);

        if (bY + cellH > y + h - 10) break; 

        ctx.beginPath();
        ctx.roundRect(bX + 15, bY, cellW - 30, cellH, 20);
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fill();
        ctx.strokeStyle = hexToRgba(themeColor, 0.5);
        ctx.lineWidth = 1.5;
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

        drawTextExact(ctx, emoji, bX + cellW - 40, bY + cellH / 2, `42px ${FONT_EMOJI}`, '#FFF', 'center');
        drawTextExact(ctx, pText, bX + cellW - 85, bY + cellH / 2 - 2, `30px ${FONT_WORD}`, '#FFF', 'right');
        if (pNum) {
            drawTextExact(ctx, pNum, bX + 40, bY + cellH / 2 + 2, `36px ${FONT_NUM}`, themeColor, 'left');
        }
    }
}

function drawColumnData(ctx, x, y, w, h, items, title, color, isSold) {
    const headH = 85;
    drawPanelWithHeader(ctx, x, y, w, h, 30, headH, 'rgba(12, 16, 26, 0.92)', hexToRgba(color, 0.25), hexToRgba(color, 0.7));
    
    drawTextExact(ctx, title, x + w / 2, y + 42, `bold 42px ${FONT_WORD}`, color, 'center', 15);
    
    if (!items || !items.length) {
        drawTextExact(ctx, 'لا توجد بضائع', x + w / 2, y + headH + (h - headH) / 2, `34px ${FONT_WORD}`, '#666', 'center');
        return;
    }

    const rH = 100;
    const startY = y + headH + 25;
    const limit = Math.floor((h - headH - 50) / rH);
    const vis = items.slice(0, limit);

    for (let i = 0; i < vis.length; i++) {
        const it = vis[i];
        const cY = startY + i * rH + rH / 2;
        
        if (i % 2 === 0) {
            ctx.beginPath();
            ctx.roundRect(x + 20, cY - rH / 2, w - 40, rH - 10, 20);
            ctx.fillStyle = 'rgba(255,255,255,0.04)';
            ctx.fill();
        }

        const e = it.itemEmoji || '📦';
        const n = truncate(it.itemName || it.itemId || '?', 16);
        const p = Number(it.pricePerUnit || 0);
        const q = isSold ? Number(it.quantitySold || 0) : (Number(it.quantity || 0) - Number(it.quantitySold || 0));
        
        drawTextExact(ctx, e, x + w - 35, cY, `52px ${FONT_EMOJI}`, '#FFF', 'right');
        drawTextExact(ctx, n, x + w - 110, cY - 18, `36px ${FONT_WORD}`, '#FFF', 'right');
        
        ctx.fillStyle = itemColor(it.rarity);
        ctx.beginPath(); 
        ctx.arc(x + w - 120 - ctx.measureText(n).width - 15, cY - 18, 9, 0, Math.PI*2); 
        ctx.fill();

        drawTextExact(ctx, 'x', x + 260, cY, `32px ${FONT_WORD}`, '#888', 'right');
        drawTextExact(ctx, q.toString(), x + 275, cY, `46px ${FONT_NUM}`, '#FFF', 'left');

        if (isSold) {
            const tot = (q * p).toLocaleString();
            drawTextExact(ctx, tot, x + 35, cY, `42px ${FONT_NUM}`, color, 'left');
            const tw = ctx.measureText(tot).width;
            drawTextExact(ctx, 'مورا', x + 45 + tw, cY + 8, `28px ${FONT_WORD}`, color, 'left');
        } else {
            drawTextExact(ctx, 'أُعيدت', x + 35, cY, `32px ${FONT_WORD}`, color, 'left');
        }
    }

    if (items.length > limit) {
        drawTextExact(ctx, `... و ${items.length - limit} أصناف إضافية`, x + w / 2, y + h - 30, `28px ${FONT_WORD}`, '#888', 'center');
    }
}

module.exports = { generateMarketSummaryCanvas };
