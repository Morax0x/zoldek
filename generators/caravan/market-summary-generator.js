const { loadImage } = require('@napi-rs/canvas');
const {
    createCanvas, W, H, FA, FE, C,
    rr, drawBg, drawCornerAccents, divLine, M, truncate, toBuf, fetchImageSafe,
} = require('./shared');

const RARITY_COLORS = {
    'Common':    '#A8B8D0',
    'Uncommon':  '#2ECC71',
    'Rare':      '#00C3FF',
    'Epic':      '#B968FF',
    'Legendary': '#FFD700',
};

function itemColor(rarity) { return RARITY_COLORS[rarity] || C.textD; }

function cleanForCanvas(str) {
    return String(str)
        .replace(/<a?:mora:\d+>/gi, 'مورا')
        .replace(/<a?:[^:]+:\d+>/g, '');
}

function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}

async function generateMarketSummaryCanvas({
    destName, destId = null, destColor = '#FFD700', ownerName, avatarUrl = null,
    soldItems, unsoldItems, totalEarned, journeyRewards = [],
}) {
    const canvas = createCanvas(W, H);
    const ctx    = canvas.getContext('2d');

    const TC = destColor;

    let avatarImg = null;
    if (avatarUrl) {
        try { avatarImg = await loadImage(avatarUrl); } catch {}
    }

    const destImg = await fetchImageSafe(destId || destName || '');
    await drawBg(ctx, 'marketbg');
    ctx.fillStyle = 'rgba(6,8,15,0.82)'; ctx.fillRect(0, 0, W, H);

    if (destImg) {
        ctx.save();
        ctx.globalAlpha = 0.15;
        const scale = Math.max(W / destImg.width, H / destImg.height);
        const dx = (W - destImg.width * scale) / 2;
        const dy = (H - destImg.height * scale) / 2;
        ctx.drawImage(destImg, dx, dy, destImg.width * scale, destImg.height * scale);
        ctx.restore();
    }

    const glowG = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 700);
    glowG.addColorStop(0, hexToRgba(TC, 0.06));
    glowG.addColorStop(1, 'transparent');
    ctx.fillStyle = glowG; ctx.fillRect(0, 0, W, H);

    drawCornerAccents(ctx);

    // ── Header ──
    const HEADER_H = 178;
    const headerGrad = ctx.createLinearGradient(0, 0, 0, HEADER_H);
    headerGrad.addColorStop(0, 'rgba(0,0,0,0.96)');
    headerGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = headerGrad; ctx.fillRect(0, 0, W, HEADER_H);

    const lineG = ctx.createLinearGradient(0, 0, W, 0);
    lineG.addColorStop(0,    'transparent');
    lineG.addColorStop(0.15, hexToRgba(TC, 0.4));
    lineG.addColorStop(0.35, TC);
    lineG.addColorStop(0.65, TC);
    lineG.addColorStop(0.85, hexToRgba(TC, 0.4));
    lineG.addColorStop(1,    'transparent');
    ctx.fillStyle = lineG; ctx.fillRect(0, HEADER_H - 18, W, 2);

    ctx.save();
    ctx.fillStyle = TC; ctx.shadowColor = TC; ctx.shadowBlur = 16;
    ctx.translate(W / 2, HEADER_H - 17); ctx.rotate(Math.PI / 4); ctx.fillRect(-6, -6, 12, 12);
    ctx.restore();

    ctx.shadowColor = hexToRgba(TC, 0.35); ctx.shadowBlur = 22;
    M(ctx, `📋 تقرير الرحلة النهائي — ${destName}`, W / 2, 46, 36, C.text);
    ctx.shadowBlur = 0;

    // ── Avatar + Name ──
    const AVT_R  = 36;
    const GRP_CY = 116;
    const AVT_CX = W / 2 - 150;

    if (avatarImg) {
        ctx.save();
        ctx.shadowColor = hexToRgba(TC, 0.6); ctx.shadowBlur = 18;
        ctx.beginPath(); ctx.arc(AVT_CX, GRP_CY, AVT_R + 3, 0, Math.PI * 2);
        ctx.strokeStyle = hexToRgba(TC, 0.55); ctx.lineWidth = 2.5; ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.beginPath(); ctx.arc(AVT_CX, GRP_CY, AVT_R, 0, Math.PI * 2); ctx.clip();
        ctx.drawImage(avatarImg, AVT_CX - AVT_R, GRP_CY - AVT_R, AVT_R * 2, AVT_R * 2);
        ctx.restore();
        ctx.beginPath(); ctx.arc(AVT_CX, GRP_CY, AVT_R, 0, Math.PI * 2);
        ctx.strokeStyle = hexToRgba(TC, 0.75); ctx.lineWidth = 2; ctx.stroke();
    } else {
        ctx.beginPath(); ctx.arc(AVT_CX, GRP_CY, AVT_R, 0, Math.PI * 2);
        ctx.fillStyle = hexToRgba(TC, 0.1); ctx.fill();
        ctx.strokeStyle = hexToRgba(TC, 0.35); ctx.lineWidth = 2; ctx.stroke();
        ctx.font = `${AVT_R}px ${FE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = TC; ctx.fillText('👤', AVT_CX, GRP_CY);
    }

    const pillX = AVT_CX + AVT_R + 18;
    const pillW = 360;
    const pillH = 56;
    rr(ctx, pillX, GRP_CY - pillH / 2, pillW, pillH, 16);
    ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fill();
    ctx.strokeStyle = hexToRgba(TC, 0.2); ctx.lineWidth = 1; ctx.stroke();

    ctx.font = `13px ${FA}`; ctx.direction = 'rtl';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillStyle = C.textD;
    ctx.fillText('التاجر', pillX + pillW - 16, GRP_CY - 11);

    ctx.font = `bold 22px ${FA}`; ctx.direction = 'rtl';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillStyle = C.text;
    ctx.fillText(truncate(ownerName, 20), pillX + pillW - 16, GRP_CY + 13);

    // ── Total Earned panel ──
    const earnW = 700, earnH = 100;
    const earnX = W / 2 - earnW / 2;
    const earnY = HEADER_H + 12;

    ctx.save();
    rr(ctx, earnX, earnY, earnW, earnH, 22);
    const earnGrad = ctx.createLinearGradient(earnX, earnY, earnX + earnW, earnY + earnH);
    earnGrad.addColorStop(0,   hexToRgba(TC, 0.12));
    earnGrad.addColorStop(0.5, hexToRgba(TC, 0.26));
    earnGrad.addColorStop(1,   hexToRgba(TC, 0.12));
    ctx.fillStyle = earnGrad; ctx.fill();
    ctx.shadowColor = hexToRgba(TC, 0.25); ctx.shadowBlur = 24;
    rr(ctx, earnX, earnY, earnW, earnH, 22);
    ctx.strokeStyle = hexToRgba(TC, 0.4); ctx.lineWidth = 2; ctx.stroke();
    ctx.shadowBlur = 0;
    rr(ctx, earnX, earnY, earnW, 4, [22, 22, 0, 0]);
    ctx.fillStyle = hexToRgba(TC, 0.55); ctx.fill();
    ctx.restore();

    M(ctx, '💰 إجمالي ارباح السوق', W / 2, earnY + 28, 19, C.textD);
    ctx.shadowColor = hexToRgba(TC, 0.65); ctx.shadowBlur = 20;
    M(ctx, `${totalEarned.toLocaleString()} مورا`, W / 2, earnY + 68, 40, TC);
    ctx.shadowBlur = 0;

    // ── Columns ──
    const HAS_JOURNEY = journeyRewards && journeyRewards.length > 0;
    const JRY_H  = HAS_JOURNEY ? 130 : 0;
    const COL_Y  = earnY + earnH + 16;
    const COL_H  = H - COL_Y - JRY_H - (HAS_JOURNEY ? 14 : 0) - 28;
    const LEFT_X  = 34;
    const LEFT_W  = W / 2 - 50;
    const RIGHT_X = W / 2 + 16;
    const RIGHT_W = W / 2 - 50;

    drawColumn(ctx, RIGHT_X, COL_Y, RIGHT_W, COL_H, soldItems,   '✅ البضائع المباعة',   '#2ECC71', TC);
    drawColumn(ctx, LEFT_X,  COL_Y, LEFT_W,  COL_H, unsoldItems, '📦 البضائع المرتجعة', '#8A9AAA', TC);

    if (HAS_JOURNEY) {
        drawJourneyRewards(ctx, LEFT_X, COL_Y + COL_H + 14, W - LEFT_X * 2, JRY_H, journeyRewards, TC);
    }

    return toBuf(canvas);
}

function drawColumn(ctx, x, y, w, h, items, title, accentColor, themeColor) {
    rr(ctx, x, y, w, h, 18);
    const panelBg = ctx.createLinearGradient(x, y, x, y + h);
    panelBg.addColorStop(0, 'rgba(12,16,32,0.78)');
    panelBg.addColorStop(1, 'rgba(4,6,14,0.92)');
    ctx.fillStyle = panelBg; ctx.fill();

    rr(ctx, x, y, w, h, 18);
    ctx.strokeStyle = accentColor + '55'; ctx.lineWidth = 1.5; ctx.stroke();

    rr(ctx, x + 2, y + 2, w - 4, h - 4, 17);
    ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 1; ctx.stroke();

    ctx.save();
    rr(ctx, x, y, w, 4, [18, 18, 0, 0]);
    ctx.fillStyle = accentColor + '88'; ctx.fill();
    ctx.restore();

    ctx.font = `bold 22px ${FA}`; ctx.direction = 'rtl';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = accentColor;
    ctx.shadowColor = accentColor + '44'; ctx.shadowBlur = 12;
    ctx.fillText(title, x + w / 2, y + 28);
    ctx.shadowBlur = 0;

    divLine(ctx, x + 16, y + 52, w - 32, accentColor + '33');

    if (!items || items.length === 0) {
        ctx.font = `20px ${FA}`; ctx.direction = 'rtl';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = C.textD; ctx.fillText('لا يوجد', x + w / 2, y + h / 2);
        return;
    }

    const rowH    = 52;
    const maxRows = Math.floor((h - 68) / rowH);
    const visible = items.slice(0, maxRows);
    const startY  = y + 64;

    for (let i = 0; i < visible.length; i++) {
        const item  = visible[i];
        const rowY  = startY + i * rowH;
        const midY  = rowY + rowH / 2;
        const color = itemColor(item.rarity);
        const sold  = Number(item.quantitySold || 0);
        const avail = Number(item.quantity) - sold;
        const price = Number(item.pricePerUnit || 0);
        const name  = truncate(item.itemName || item.itemId || '?', 20);
        const emoji = item.itemEmoji || '📦';

        if (i % 2 === 0) {
            ctx.fillStyle = hexToRgba(themeColor, 0.028);
            ctx.fillRect(x + 6, rowY + 2, w - 12, rowH - 4);
        }

        ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.arc(x + 20, midY, 5, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;

        ctx.font = `20px ${FE}`; ctx.direction = 'ltr';
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#FFFFFF';
        ctx.fillText(emoji, x + 32, midY);

        ctx.font = `bold 17px ${FA}`; ctx.direction = 'rtl';
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = C.text;
        ctx.fillText(name, x + 56, midY - 10);

        ctx.font = `13px ${FA}`; ctx.direction = 'rtl'; ctx.fillStyle = C.textD;
        if (sold > 0) {
            ctx.fillText(`×${sold} — ${(sold * price).toLocaleString()} مورا`, x + 56, midY + 10);
        } else {
            ctx.fillText(`×${avail} مرتجعة`, x + 56, midY + 10);
        }

        ctx.font = `bold 15px ${FA}`; ctx.direction = 'rtl';
        ctx.textAlign = 'right'; ctx.fillStyle = accentColor;
        ctx.fillText(`${price.toLocaleString()}/وحدة`, x + w - 12, midY);
    }

    if (items.length > maxRows) {
        ctx.font = `14px ${FA}`; ctx.direction = 'rtl';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = C.textD;
        ctx.fillText(`... و ${items.length - maxRows} عنصر آخر`, x + w / 2, y + h - 14);
    }
}

function drawJourneyRewards(ctx, x, y, w, h, rewards, themeColor) {
    rr(ctx, x, y, w, h, 16);
    const jg = ctx.createLinearGradient(x, y, x + w, y + h);
    jg.addColorStop(0,   hexToRgba(themeColor, 0.18));
    jg.addColorStop(0.5, hexToRgba(themeColor, 0.25));
    jg.addColorStop(1,   hexToRgba(themeColor, 0.18));
    ctx.fillStyle = jg; ctx.fill();
    ctx.strokeStyle = hexToRgba(themeColor, 0.35); ctx.lineWidth = 1.5; ctx.stroke();

    ctx.save();
    rr(ctx, x, y, w, 4, [16, 16, 0, 0]);
    ctx.fillStyle = hexToRgba(themeColor, 0.65); ctx.fill();
    ctx.restore();

    ctx.font = `bold 18px ${FA}`; ctx.direction = 'rtl';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillStyle = hexToRgba(themeColor, 0.9);
    ctx.shadowColor = themeColor; ctx.shadowBlur = 10;
    ctx.fillText('🎒 مكافآت الرحلة', x + w - 18, y + 23);
    ctx.shadowBlur = 0;

    divLine(ctx, x + 16, y + 42, w - 32, hexToRgba(themeColor, 0.25));

    const cleaned  = rewards.map(cleanForCanvas).filter(Boolean);
    const COLS     = 3;
    const cellW    = Math.floor((w - 32) / COLS);
    const rowStartY = y + 54;
    const rowH      = 26;

    for (let i = 0; i < cleaned.length; i++) {
        const col  = i % COLS;
        const row  = Math.floor(i / COLS);
        const cx   = x + 16 + col * cellW;
        const cy   = rowStartY + row * rowH;

        if (cy + rowH > y + h - 4) break;

        const label = cleaned[i];
        ctx.font = `bold 15px ${FA}`; ctx.direction = 'ltr';
        const tw = ctx.measureText(label).width;
        const pw = Math.min(tw + 24, cellW - 8);
        const ph = 22;
        const px = cx + (cellW - pw) / 2;

        rr(ctx, px, cy, pw, ph, 9);
        ctx.fillStyle = hexToRgba(themeColor, 0.22); ctx.fill();
        ctx.strokeStyle = hexToRgba(themeColor, 0.35); ctx.lineWidth = 1; ctx.stroke();

        ctx.direction = 'ltr'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = hexToRgba(themeColor, 0.9);
        ctx.fillText(label, px + pw / 2, cy + ph / 2);
    }
}

module.exports = { generateMarketSummaryCanvas };
