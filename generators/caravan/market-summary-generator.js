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

async function generateMarketSummaryCanvas({
    destName, destId = null, destColor = '#FFD700', ownerName, avatarUrl = null,
    soldItems, unsoldItems, totalEarned, journeyRewards = [],
}) {
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');
    const TC = destColor;

    await drawBg(ctx, 'marketbg');
    ctx.fillStyle = 'rgba(6, 10, 18, 0.90)';
    ctx.fillRect(0, 0, W, H);

    const destImg = await fetchImageSafe(destId || destName || '');
    if (destImg) {
        ctx.save();
        ctx.globalAlpha = 0.20;
        const scale = Math.max(W / destImg.width, H / destImg.height);
        const dx = (W - destImg.width * scale) / 2;
        const dy = (H - destImg.height * scale) / 2;
        ctx.drawImage(destImg, dx, dy, destImg.width * scale, destImg.height * scale);
        ctx.restore();
    }

    const glowC = ctx.createRadialGradient(W / 2, H / 3, 0, W / 2, H / 3, 700);
    glowC.addColorStop(0, hexToRgba(TC, 0.18));
    glowC.addColorStop(1, 'transparent');
    ctx.fillStyle = glowC;
    ctx.fillRect(0, 0, W, H);

    drawCornerAccents(ctx);

    const headG = ctx.createLinearGradient(0, 0, 0, 180);
    headG.addColorStop(0, 'rgba(0,0,0,0.98)');
    headG.addColorStop(1, 'transparent');
    ctx.fillStyle = headG;
    ctx.fillRect(0, 0, W, 180);

    const lineG = ctx.createLinearGradient(0, 0, W, 0);
    lineG.addColorStop(0, 'transparent');
    lineG.addColorStop(0.2, hexToRgba(TC, 0.4));
    lineG.addColorStop(0.5, TC);
    lineG.addColorStop(0.8, hexToRgba(TC, 0.4));
    lineG.addColorStop(1, 'transparent');
    ctx.fillStyle = lineG;
    ctx.fillRect(0, 150, W, 3);

    drawTextExact(ctx, `التقرير الإمبراطوري الشامل — ${destName}`, W / 2, 50, `42px ${FONT_WORD}`, TC, 'center', 20);

    let avatarImg = null;
    if (avatarUrl) {
        try { avatarImg = await loadImage(avatarUrl); } catch {}
    }

    const avR = 40;
    const avX = W / 2 + 180;
    const avY = 115;
    
    ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
    rr(ctx, W / 2 - 240, avY - avR, 480, avR * 2, avR);
    ctx.fill();

    if (avatarImg) {
        ctx.save();
        ctx.beginPath(); ctx.arc(avX, avY, avR - 3, 0, Math.PI * 2); ctx.clip();
        ctx.drawImage(avatarImg, avX - avR, avY - avR, avR * 2, avR * 2);
        ctx.restore();
        ctx.beginPath(); ctx.arc(avX, avY, avR - 3, 0, Math.PI * 2);
        ctx.strokeStyle = TC; ctx.lineWidth = 3; ctx.stroke();
    }

    drawTextExact(ctx, truncate(ownerName, 22), avX - 60, avY, `32px ${FONT_WORD}`, '#FFF', 'right');
    drawTextExact(ctx, 'التاجر:', W / 2 - 200, avY, `22px ${FONT_WORD}`, '#AAA', 'left');

    const HAS_JOURNEY = journeyRewards && journeyRewards.length > 0;
    const boxY = 185;
    const boxH = 140;

    if (HAS_JOURNEY) {
        const half = W / 2;
        drawJourneySection(ctx, half + 15, boxY, half - 45, boxH, journeyRewards, TC);
        
        rr(ctx, 30, boxY, half - 45, boxH, 24);
        ctx.fillStyle = hexToRgba(TC, 0.15); ctx.fill();
        ctx.strokeStyle = hexToRgba(TC, 0.7); ctx.lineWidth = 2.5; ctx.stroke();
        
        drawTextExact(ctx, 'مبيعات السوق الكلية', 30 + (half - 45) / 2, boxY + 40, `30px ${FONT_WORD}`, '#EEE', 'center');
        
        ctx.font = `54px ${FONT_NUM}`;
        const earnedStr = totalEarned.toLocaleString();
        const eW = ctx.measureText(earnedStr).width;
        const centerX = 30 + (half - 45) / 2;
        drawTextExact(ctx, earnedStr, centerX - 35, boxY + 95, `54px ${FONT_NUM}`, TC, 'center', 20);
        drawTextExact(ctx, 'مورا', centerX + eW / 2 + 10, boxY + 95, `26px ${FONT_WORD}`, TC, 'left');
    } else {
        const earnW = 700;
        const earnX = (W - earnW) / 2;
        rr(ctx, earnX, boxY, earnW, boxH, 24);
        ctx.fillStyle = hexToRgba(TC, 0.15); ctx.fill();
        ctx.strokeStyle = hexToRgba(TC, 0.7); ctx.lineWidth = 2.5; ctx.stroke();
        
        drawTextExact(ctx, 'مبيعات السوق الكلية', W / 2, boxY + 40, `30px ${FONT_WORD}`, '#EEE', 'center');
        
        ctx.font = `54px ${FONT_NUM}`;
        const earnedStr = totalEarned.toLocaleString();
        const eW = ctx.measureText(earnedStr).width;
        drawTextExact(ctx, earnedStr, W / 2 - 35, boxY + 95, `54px ${FONT_NUM}`, TC, 'center', 20);
        drawTextExact(ctx, 'مورا', W / 2 + eW / 2 + 10, boxY + 95, `26px ${FONT_WORD}`, TC, 'left');
    }

    const colY = boxY + boxH + 30;
    const colH = H - colY - 35;
    const colW = W / 2 - 40;

    drawColumnData(ctx, W / 2 + 15, colY, colW, colH, soldItems, 'البضائع المباعة بنجاح', '#2ECC71', true);
    drawColumnData(ctx, 25, colY, colW, colH, unsoldItems, 'البضائع المرتجعة للمخزن', '#E74C3C', false);

    return toBuf(canvas);
}

function drawJourneySection(ctx, x, y, w, h, rewards, themeColor) {
    rr(ctx, x, y, w, h, 24);
    ctx.fillStyle = 'rgba(15, 22, 35, 0.85)'; ctx.fill();
    ctx.strokeStyle = hexToRgba(themeColor, 0.6); ctx.lineWidth = 2.5; ctx.stroke();
    
    rr(ctx, x, y, w, 55, [24, 24, 0, 0]);
    ctx.fillStyle = hexToRgba(themeColor, 0.25); ctx.fill();
    
    drawTextExact(ctx, 'ما تم كسبه خلال الرحلة', x + w / 2, y + 28, `28px ${FONT_WORD}`, themeColor, 'center', 15);
    
    const cleaned = rewards.map(cleanStr).filter(Boolean);
    if(cleaned.length === 0) {
        drawTextExact(ctx, 'لا يوجد غنائم', x + w / 2, y + h / 2 + 20, `28px ${FONT_WORD}`, '#888', 'center');
        return;
    }

    ctx.save();
    ctx.direction = 'rtl';
    const startY = y + h / 2 + 20;
    const stepX = w / 2;
    
    for (let i = 0; i < cleaned.length; i++) {
        if (i >= 4) {
            drawTextExact(ctx, `+ و المزيد`, x + w / 2, y + h - 20, `22px ${FONT_WORD}`, '#AAA', 'center');
            break;
        }
        const row = Math.floor(i / 2);
        const col = i % 2;
        const cx = x + w - (col * stepX) - (stepX / 2); 
        const cy = startY + row * 40 - (cleaned.length > 2 ? 20 : 0);
        
        ctx.font = `26px ${FONT_WORD}`;
        ctx.fillStyle = '#FFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(cleaned[i], cx, cy);
    }
    ctx.restore();
}

function drawColumnData(ctx, x, y, w, h, items, title, color, isSold) {
    rr(ctx, x, y, w, h, 24);
    ctx.fillStyle = 'rgba(8, 12, 20, 0.90)'; ctx.fill();
    ctx.strokeStyle = hexToRgba(color, 0.5); ctx.lineWidth = 3; ctx.stroke();
    
    ctx.fillStyle = hexToRgba(color, 0.3);
    rr(ctx, x, y, w, 70, [24, 24, 0, 0]); ctx.fill();
    
    drawTextExact(ctx, title, x + w / 2, y + 35, `32px ${FONT_WORD}`, color, 'center', 18);
    
    if (!items || !items.length) {
        drawTextExact(ctx, 'لا توجد بضائع', x + w / 2, y + h / 2, `28px ${FONT_WORD}`, '#777', 'center');
        return;
    }

    const rH = 85;
    const startY = y + 80;
    const limit = Math.floor((h - 100) / rH);
    const vis = items.slice(0, limit);

    for (let i = 0; i < vis.length; i++) {
        const it = vis[i];
        const cY = startY + i * rH + rH / 2;
        
        if (i % 2 === 0) {
            ctx.fillStyle = 'rgba(255,255,255,0.05)';
            rr(ctx, x + 15, cY - rH / 2 + 2, w - 30, rH - 4, 16); ctx.fill();
        }

        const e = it.itemEmoji || '📦';
        const n = truncate(it.itemName || it.itemId || '?', 16);
        const p = Number(it.pricePerUnit || 0);
        const q = isSold ? Number(it.quantitySold || 0) : (Number(it.quantity || 0) - Number(it.quantitySold || 0));
        
        drawTextExact(ctx, e, x + w - 30, cY, `36px ${FONT_EMOJI}`, '#FFF', 'right');
        drawTextExact(ctx, n, x + w - 85, cY - 14, `28px ${FONT_WORD}`, '#FFF', 'right');
        
        ctx.fillStyle = itemColor(it.rarity);
        ctx.beginPath(); ctx.arc(x + w - 95 - ctx.measureText(n).width - 15, cY - 14, 7, 0, Math.PI*2); ctx.fill();

        drawTextExact(ctx, 'الكمية:', x + w - 85, cY + 22, `20px ${FONT_WORD}`, '#AAA', 'right');
        drawTextExact(ctx, q.toString(), x + w - 140, cY + 22, `24px ${FONT_NUM}`, '#FFF', 'right');

        if (isSold) {
            const tot = (q * p).toLocaleString();
            drawTextExact(ctx, tot, x + 35, cY - 10, `28px ${FONT_NUM}`, color, 'left');
            drawTextExact(ctx, 'مورا', x + 35, cY + 20, `20px ${FONT_WORD}`, color, 'left');
        } else {
            drawTextExact(ctx, 'مرتجعة', x + 35, cY, `26px ${FONT_WORD}`, color, 'left');
        }
    }

    if (items.length > limit) {
        drawTextExact(ctx, `... و ${items.length - limit} بضائع أخرى`, x + w / 2, y + h - 25, `24px ${FONT_WORD}`, '#888', 'center');
    }
}

module.exports = { generateMarketSummaryCanvas };
