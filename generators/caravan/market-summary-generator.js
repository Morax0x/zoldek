const { loadImage } = require('@napi-rs/canvas');
const {
    createCanvas, W, H, C, FE,
    rr, drawBg, drawCornerAccents, divLine, truncate, toBuf, fetchImageSafe,
} = require('./shared');

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
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}

function cleanStr(str) {
    return String(str).replace(/<a?:mora:\d+>/gi, 'مورا').replace(/<a?:[^:]+:\d+>/g, '');
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

function drawMixedLine(ctx, emoji, label, value, x, y, w, color) {
    drawTextExact(ctx, emoji, x + w - 10, y, `20px ${FONT_EMOJI}`, '#FFF', 'right');
    drawTextExact(ctx, label, x + w - 40, y, `18px ${FONT_WORD}`, '#CCC', 'right');
    drawTextExact(ctx, value.toString(), x + 10, y, `20px ${FONT_NUM}`, color, 'left');
}

async function generateMarketSummaryCanvas({
    destName, destId = null, destColor = '#FFD700', ownerName, avatarUrl = null,
    soldItems, unsoldItems, totalEarned, journeyRewards = [],
}) {
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');
    const TC = destColor;

    await drawBg(ctx, 'marketbg');
    ctx.fillStyle = 'rgba(4, 6, 12, 0.88)';
    ctx.fillRect(0, 0, W, H);

    const destImg = await fetchImageSafe(destId || destName || '');
    if (destImg) {
        ctx.save();
        ctx.globalAlpha = 0.25;
        const scale = Math.max(W / destImg.width, H / destImg.height);
        const dx = (W - destImg.width * scale) / 2;
        const dy = (H - destImg.height * scale) / 2;
        ctx.drawImage(destImg, dx, dy, destImg.width * scale, destImg.height * scale);
        ctx.restore();
    }

    const glowC = ctx.createRadialGradient(W / 2, H / 3, 0, W / 2, H / 3, 600);
    glowC.addColorStop(0, hexToRgba(TC, 0.15));
    glowC.addColorStop(1, 'transparent');
    ctx.fillStyle = glowC;
    ctx.fillRect(0, 0, W, H);

    drawCornerAccents(ctx);

    const headG = ctx.createLinearGradient(0, 0, 0, 160);
    headG.addColorStop(0, 'rgba(0,0,0,0.95)');
    headG.addColorStop(1, 'transparent');
    ctx.fillStyle = headG;
    ctx.fillRect(0, 0, W, 160);

    const lineG = ctx.createLinearGradient(0, 0, W, 0);
    lineG.addColorStop(0, 'transparent');
    lineG.addColorStop(0.2, hexToRgba(TC, 0.3));
    lineG.addColorStop(0.5, TC);
    lineG.addColorStop(0.8, hexToRgba(TC, 0.3));
    lineG.addColorStop(1, 'transparent');
    ctx.fillStyle = lineG;
    ctx.fillRect(0, 135, W, 2);

    drawTextExact(ctx, `التقرير الإمبراطوري الشامل — ${destName}`, W / 2, 45, `34px ${FONT_WORD}`, TC, 'center', 15);

    let avatarImg = null;
    if (avatarUrl) {
        try { avatarImg = await loadImage(avatarUrl); } catch {}
    }

    const avR = 30;
    const avX = W / 2 + 130;
    const avY = 100;
    
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    rr(ctx, W / 2 - 180, avY - avR, 360, avR * 2, avR);
    ctx.fill();

    if (avatarImg) {
        ctx.save();
        ctx.beginPath(); ctx.arc(avX, avY, avR - 2, 0, Math.PI * 2); ctx.clip();
        ctx.drawImage(avatarImg, avX - avR, avY - avR, avR * 2, avR * 2);
        ctx.restore();
        ctx.beginPath(); ctx.arc(avX, avY, avR - 2, 0, Math.PI * 2);
        ctx.strokeStyle = TC; ctx.lineWidth = 2; ctx.stroke();
    }

    drawTextExact(ctx, truncate(ownerName, 20), avX - 45, avY, `22px ${FONT_WORD}`, '#FFF', 'right');
    drawTextExact(ctx, 'التاجر:', W / 2 - 150, avY, `16px ${FONT_WORD}`, '#AAA', 'left');

    const HAS_JOURNEY = journeyRewards && journeyRewards.length > 0;
    let earnY = 165;
    
    if (HAS_JOURNEY) {
        drawJourneySection(ctx, W / 2 - 400, earnY, 800, 100, journeyRewards, TC);
        earnY += 115;
    }

    const earnW = 500, earnH = 80;
    const earnX = (W - earnW) / 2;
    
    rr(ctx, earnX, earnY, earnW, earnH, 15);
    ctx.fillStyle = hexToRgba(TC, 0.1); ctx.fill();
    ctx.strokeStyle = hexToRgba(TC, 0.5); ctx.lineWidth = 1.5; ctx.stroke();
    
    drawTextExact(ctx, 'مبيعات السوق:', earnX + earnW - 20, earnY + earnH / 2, `20px ${FONT_WORD}`, '#CCC', 'right');
    
    const earnedStr = totalEarned.toLocaleString();
    ctx.font = `32px ${FONT_NUM}`;
    const eW = ctx.measureText(earnedStr).width;
    drawTextExact(ctx, earnedStr, earnX + 20, earnY + earnH / 2, `32px ${FONT_NUM}`, TC, 'left', 12);
    drawTextExact(ctx, 'مورا', earnX + 30 + eW, earnY + earnH / 2, `18px ${FONT_WORD}`, TC, 'left');

    const colY = earnY + earnH + 20;
    const colH = H - colY - 25;
    const colW = W / 2 - 30;

    drawColumnData(ctx, W / 2 + 10, colY, colW, colH, soldItems, 'البضائع المباعة', '#2ECC71', true);
    drawColumnData(ctx, 20, colY, colW, colH, unsoldItems, 'البضائع المرتجعة', '#E74C3C', false);

    return toBuf(canvas);
}

function drawJourneySection(ctx, x, y, w, h, rewards, themeColor) {
    rr(ctx, x, y, w, h, 15);
    ctx.fillStyle = 'rgba(15, 20, 30, 0.6)'; ctx.fill();
    ctx.strokeStyle = hexToRgba(themeColor, 0.4); ctx.lineWidth = 1.5; ctx.stroke();
    
    rr(ctx, x, y, w, 40, [15, 15, 0, 0]);
    ctx.fillStyle = hexToRgba(themeColor, 0.15); ctx.fill();
    
    drawTextExact(ctx, 'الغنائم والموارد המكتسبة', x + w / 2, y + 20, `20px ${FONT_WORD}`, themeColor, 'center');
    
    const cleaned = rewards.map(cleanStr).filter(Boolean);
    const cellW = w / 3;
    
    let mora = '0', xp = '0', others = [];
    cleaned.forEach(r => {
        if (r.includes('مورا')) mora = r.replace(/[^0-9,]/g, '');
        else if (r.includes('XP')) xp = r.replace(/[^0-9,]/g, '');
        else others.push(r.substring(0, 15));
    });

    drawMixedLine(ctx, '💰', 'المورا:', mora, x + cellW * 2 + 10, y + 65, cellW - 20, C.gold);
    drawMixedLine(ctx, '✨', 'الخبرة:', xp, x + cellW + 10, y + 65, cellW - 20, '#9B59B6');
    
    const oText = others.length > 0 ? others[0] : 'لا يوجد';
    drawTextExact(ctx, '📦', x + cellW - 10, y + 65, `20px ${FONT_EMOJI}`, '#FFF', 'right');
    drawTextExact(ctx, oText, x + cellW - 40, y + 65, `16px ${FONT_WORD}`, '#CCC', 'right');
}

function drawColumnData(ctx, x, y, w, h, items, title, color, isSold) {
    rr(ctx, x, y, w, h, 20);
    ctx.fillStyle = 'rgba(10, 14, 22, 0.8)'; ctx.fill();
    ctx.strokeStyle = hexToRgba(color, 0.4); ctx.lineWidth = 2; ctx.stroke();
    
    ctx.fillStyle = hexToRgba(color, 0.2);
    rr(ctx, x, y, w, 50, [20, 20, 0, 0]); ctx.fill();
    
    drawTextExact(ctx, title, x + w / 2, y + 25, `22px ${FONT_WORD}`, color, 'center', 10);
    
    if (!items || !items.length) {
        drawTextExact(ctx, 'قائمة فارغة', x + w / 2, y + h / 2, `18px ${FONT_WORD}`, '#777', 'center');
        return;
    }

    const rH = 55;
    const startY = y + 60;
    const limit = Math.floor((h - 80) / rH);
    const vis = items.slice(0, limit);

    for (let i = 0; i < vis.length; i++) {
        const it = vis[i];
        const cY = startY + i * rH + rH / 2;
        
        if (i % 2 === 0) {
            ctx.fillStyle = 'rgba(255,255,255,0.03)';
            rr(ctx, x + 10, cY - rH / 2, w - 20, rH - 4, 10); ctx.fill();
        }

        const e = it.itemEmoji || '📦';
        const n = truncate(it.itemName || it.itemId || '?', 16);
        const p = Number(it.pricePerUnit || 0);
        const q = isSold ? Number(it.quantitySold || 0) : (Number(it.quantity || 0) - Number(it.quantitySold || 0));
        
        drawTextExact(ctx, e, x + w - 20, cY, `22px ${FONT_EMOJI}`, '#FFF', 'right');
        drawTextExact(ctx, n, x + w - 55, cY - 8, `18px ${FONT_WORD}`, '#FFF', 'right');
        
        ctx.fillStyle = itemColor(it.rarity);
        ctx.beginPath(); ctx.arc(x + w - 60 - ctx.measureText(n).width - 15, cY - 8, 4, 0, Math.PI*2); ctx.fill();

        drawTextExact(ctx, 'x', x + 120, cY, `14px ${FONT_WORD}`, '#888', 'right');
        drawTextExact(ctx, q.toString(), x + 125, cY, `18px ${FONT_NUM}`, '#FFF', 'left');

        if (isSold) {
            const tot = (q * p).toLocaleString();
            drawTextExact(ctx, tot, x + 20, cY, `18px ${FONT_NUM}`, color, 'left');
        } else {
            drawTextExact(ctx, 'لم تباع', x + 20, cY, `16px ${FONT_WORD}`, color, 'left');
        }
    }

    if (items.length > limit) {
        drawTextExact(ctx, `... و ${items.length - limit} أخرى`, x + w / 2, y + h - 15, `14px ${FONT_WORD}`, '#888', 'center');
    }
}

module.exports = { generateMarketSummaryCanvas };
