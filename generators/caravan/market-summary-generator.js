const {
    createCanvas, W, H, FA, FE, C,
    rr, drawBg, drawCornerAccents, divLine, M, R, L, truncate, toBuf,
} = require('./shared');

const RARITY_COLORS = {
    'Common':    '#A8B8D0',
    'Uncommon':  '#2ECC71',
    'Rare':      '#00C3FF',
    'Epic':      '#B968FF',
    'Legendary': '#FFD700',
};

function itemColor(rarity) {
    return RARITY_COLORS[rarity] || C.textD;
}

/**
 * @param {object} opts
 * @param {string}  opts.destName
 * @param {string}  opts.ownerName
 * @param {Array}   opts.soldItems    — [{itemId, itemName, itemEmoji, quantity, quantitySold, pricePerUnit, rarity}]
 * @param {Array}   opts.unsoldItems  — same shape, quantity - quantitySold > 0
 * @param {number}  opts.totalEarned
 * @returns {Promise<Buffer>}
 */
async function generateMarketSummaryCanvas({ destName, ownerName, soldItems, unsoldItems, totalEarned }) {
    const canvas = createCanvas(W, H);
    const ctx    = canvas.getContext('2d');

    await drawBg(ctx, 'marketbg');

    // Dark overlay
    ctx.fillStyle = 'rgba(4,6,15,0.60)';
    ctx.fillRect(0, 0, W, H);

    drawCornerAccents(ctx);

    // ── Header ──
    const headerGrad = ctx.createLinearGradient(0, 0, 0, 155);
    headerGrad.addColorStop(0, 'rgba(0,0,0,0.95)');
    headerGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = headerGrad;
    ctx.fillRect(0, 0, W, 155);

    // Gold separator line
    const lineG = ctx.createLinearGradient(0, 0, W, 0);
    lineG.addColorStop(0,    'transparent');
    lineG.addColorStop(0.15, C.gold + '66');
    lineG.addColorStop(0.35, C.gold);
    lineG.addColorStop(0.65, C.gold);
    lineG.addColorStop(0.85, C.gold + '66');
    lineG.addColorStop(1,    'transparent');
    ctx.fillStyle = lineG;
    ctx.fillRect(0, 138, W, 2);

    // Diamond ornament
    ctx.save();
    ctx.fillStyle = C.gold; ctx.shadowColor = C.gold; ctx.shadowBlur = 16;
    ctx.translate(W / 2, 139); ctx.rotate(Math.PI / 4);
    ctx.fillRect(-6, -6, 12, 12);
    ctx.restore();

    // Title
    ctx.shadowColor = C.gold + '55'; ctx.shadowBlur = 24;
    M(ctx, `📋 تقرير السوق النهائي — ${destName}`, W / 2, 52, 40, C.text);
    ctx.shadowBlur = 0;
    M(ctx, `التاجر: ${ownerName}`, W / 2, 104, 24, C.textD);

    // ── Total Earned panel (prominent) ──
    const earnW = 700, earnH = 96;
    const earnX = W / 2 - earnW / 2;
    const earnY = 160;

    ctx.save();
    rr(ctx, earnX, earnY, earnW, earnH, 20);
    const earnGrad = ctx.createLinearGradient(earnX, earnY, earnX + earnW, earnY + earnH);
    earnGrad.addColorStop(0, 'rgba(245,197,24,0.14)');
    earnGrad.addColorStop(0.5, 'rgba(245,197,24,0.28)');
    earnGrad.addColorStop(1, 'rgba(245,197,24,0.14)');
    ctx.fillStyle = earnGrad;
    ctx.fill();

    ctx.shadowColor = C.gold + '44'; ctx.shadowBlur = 20;
    rr(ctx, earnX, earnY, earnW, earnH, 20);
    ctx.strokeStyle = C.gold + '66'; ctx.lineWidth = 2;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Top accent bar
    rr(ctx, earnX, earnY, earnW, 4, [20, 20, 0, 0]);
    ctx.fillStyle = C.gold + '88';
    ctx.fill();
    ctx.restore();

    M(ctx, '💰 إجمالي الأرباح', W / 2, earnY + 26, 20, C.textD);
    ctx.shadowColor = C.gold + 'AA'; ctx.shadowBlur = 18;
    M(ctx, `${totalEarned.toLocaleString()} مورا`, W / 2, earnY + 64, 38, C.gold);
    ctx.shadowBlur = 0;

    // ── Two-column layout ──
    const COL_Y   = earnY + earnH + 24;
    const COL_H   = H - COL_Y - 32;
    const LEFT_X  = 36;
    const LEFT_W  = W / 2 - 52;
    const RIGHT_X = W / 2 + 16;
    const RIGHT_W = W / 2 - 52;

    // Left column — Sold items
    drawColumn(ctx, LEFT_X, COL_Y, LEFT_W, COL_H, soldItems, '✅ البضائع المباعة', C.green);
    // Right column — Unsold items
    drawColumn(ctx, RIGHT_X, COL_Y, RIGHT_W, COL_H, unsoldItems, '📦 البضائع المُرجعة', '#8A9AAA');

    return toBuf(canvas);
}

function drawColumn(ctx, x, y, w, h, items, title, accentColor) {
    // Panel background
    rr(ctx, x, y, w, h, 18);
    const panelBg = ctx.createLinearGradient(x, y, x, y + h);
    panelBg.addColorStop(0, 'rgba(12,16,32,0.75)');
    panelBg.addColorStop(1, 'rgba(4,6,14,0.90)');
    ctx.fillStyle = panelBg;
    ctx.fill();

    rr(ctx, x, y, w, h, 18);
    ctx.strokeStyle = accentColor + '55';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Inner highlight
    rr(ctx, x + 2, y + 2, w - 4, h - 4, 17);
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Accent bar at top
    ctx.save();
    rr(ctx, x, y, w, 4, [18, 18, 0, 0]);
    ctx.fillStyle = accentColor + '88';
    ctx.fill();
    ctx.restore();

    // Column title
    ctx.font = `bold 24px ${FA}`;
    ctx.direction = 'rtl';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = accentColor;
    ctx.shadowColor  = accentColor + '44';
    ctx.shadowBlur   = 12;
    ctx.fillText(title, x + w / 2, y + 30);
    ctx.shadowBlur   = 0;

    divLine(ctx, x + 16, y + 54, w - 32, accentColor + '33');

    if (!items || items.length === 0) {
        ctx.font      = `20px ${FA}`;
        ctx.direction = 'rtl';
        ctx.fillStyle = C.textD;
        ctx.fillText('لا يوجد', x + w / 2, y + h / 2);
        return;
    }

    const rowH    = 52;
    const maxRows = Math.floor((h - 76) / rowH);
    const visible = items.slice(0, maxRows);
    const startY  = y + 68;

    for (let i = 0; i < visible.length; i++) {
        const item   = visible[i];
        const rowY   = startY + i * rowH;
        const midY   = rowY + rowH / 2;
        const color  = itemColor(item.rarity);
        const sold   = Number(item.quantitySold || 0);
        const avail  = Number(item.quantity) - sold;
        const price  = Number(item.pricePerUnit || 0);
        const name   = truncate(item.itemName || item.itemId || '?', 20);
        const emoji  = item.itemEmoji || '📦';

        // Row background (alternating)
        if (i % 2 === 0) {
            ctx.fillStyle = 'rgba(255,255,255,0.03)';
            ctx.fillRect(x + 6, rowY + 2, w - 12, rowH - 4);
        }

        // Rarity dot
        ctx.fillStyle = color;
        ctx.shadowColor = color; ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(x + 20, midY, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Emoji
        ctx.font = `20px ${FE}`;
        ctx.direction = 'ltr';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(emoji, x + 32, midY);

        // Item name
        ctx.font = `bold 18px ${FA}`;
        ctx.direction = 'rtl';
        ctx.textAlign = 'left';
        ctx.fillStyle = C.text;
        ctx.fillText(name, x + 58, midY - 9);

        // Qty / value line
        ctx.font = `14px ${FA}`;
        ctx.direction = 'rtl';
        ctx.fillStyle = C.textD;
        if (sold > 0) {
            ctx.fillText(`×${sold} — ${(sold * price).toLocaleString()} مورا`, x + 58, midY + 10);
        } else {
            ctx.fillText(`×${avail} مرتجعة`, x + 58, midY + 10);
        }

        // Price per unit (right-aligned)
        ctx.font = `bold 16px ${FA}`;
        ctx.direction = 'rtl';
        ctx.textAlign = 'right';
        ctx.fillStyle = accentColor;
        ctx.fillText(`${price.toLocaleString()}/وحدة`, x + w - 14, midY);
    }

    if (items.length > maxRows) {
        ctx.font = `15px ${FA}`;
        ctx.direction = 'rtl';
        ctx.textAlign = 'center';
        ctx.fillStyle = C.textD;
        ctx.fillText(`... و ${items.length - maxRows} عنصر آخر`, x + w / 2, y + h - 16);
    }
}

module.exports = { generateMarketSummaryCanvas };
