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
    ctx.fillStyle = 'rgba(4,6,15,0.55)';
    ctx.fillRect(0, 0, W, H);

    drawCornerAccents(ctx);

    // ── Header gradient ──
    const headerGrad = ctx.createLinearGradient(0, 0, 0, 150);
    headerGrad.addColorStop(0, 'rgba(0,0,0,0.90)');
    headerGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = headerGrad;
    ctx.fillRect(0, 0, W, 150);

    // Gold separator line
    const lineG = ctx.createLinearGradient(0, 0, W, 0);
    lineG.addColorStop(0,    'transparent');
    lineG.addColorStop(0.15, C.gold);
    lineG.addColorStop(0.85, C.gold);
    lineG.addColorStop(1,    'transparent');
    ctx.fillStyle = lineG;
    ctx.fillRect(0, 138, W, 2.5);

    // Title
    ctx.shadowColor = C.gold + '88';
    ctx.shadowBlur  = 22;
    M(ctx, `📋 تقرير السوق النهائي — ${destName}`, W / 2, 52, 42, C.text);
    ctx.shadowBlur = 0;
    M(ctx, `التاجر: ${ownerName}`, W / 2, 104, 24, C.textD);

    // ── Total Earned panel ──
    const panelX = W / 2 - 320;
    const panelY = 158;
    const panelW = 640;
    const panelH = 80;

    const panelGrad = ctx.createLinearGradient(panelX, panelY, panelX + panelW, panelY);
    panelGrad.addColorStop(0, 'rgba(245,197,24,0.08)');
    panelGrad.addColorStop(0.5, 'rgba(245,197,24,0.18)');
    panelGrad.addColorStop(1, 'rgba(245,197,24,0.08)');
    rr(ctx, panelX, panelY, panelW, panelH, 14);
    ctx.fillStyle = panelGrad;
    ctx.fill();
    rr(ctx, panelX, panelY, panelW, panelH, 14);
    ctx.strokeStyle = C.gold + '55';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    M(ctx, `💰 إجمالي الأرباح`, W / 2, panelY + 22, 20, C.textD);
    ctx.shadowColor = C.gold + '99';
    ctx.shadowBlur  = 14;
    M(ctx, `${totalEarned.toLocaleString()} مورا`, W / 2, panelY + 56, 34, C.gold);
    ctx.shadowBlur = 0;

    // ── Two-column layout ──
    const COL_Y     = panelY + panelH + 28;
    const COL_H     = H - COL_Y - 36;
    const LEFT_X    = 40;
    const LEFT_W    = W / 2 - 60;
    const RIGHT_X   = W / 2 + 20;
    const RIGHT_W   = W / 2 - 60;

    // Left column — Sold items
    drawColumn(ctx, LEFT_X, COL_Y, LEFT_W, COL_H, soldItems, '✅ البضائع المباعة', C.green);
    // Right column — Unsold items
    drawColumn(ctx, RIGHT_X, COL_Y, RIGHT_W, COL_H, unsoldItems, '📦 البضائع المُرجعة', C.textD);

    return toBuf(canvas);
}

function drawColumn(ctx, x, y, w, h, items, title, accentColor) {
    // Panel background
    rr(ctx, x, y, w, h, 16);
    ctx.fillStyle = 'rgba(8,12,28,0.70)';
    ctx.fill();
    rr(ctx, x, y, w, h, 16);
    ctx.strokeStyle = accentColor + '44';
    ctx.lineWidth   = 1.5;
    ctx.stroke();

    // Accent bar at top
    rr(ctx, x, y, w, 4, [16, 16, 0, 0]);
    ctx.fillStyle = accentColor;
    ctx.fill();

    // Column title
    ctx.font = `bold 22px ${FA}`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = accentColor;
    ctx.fillText(title, x + w / 2, y + 28);

    divLine(ctx, x + 16, y + 50, w - 32, 'rgba(255,255,255,0.10)');

    if (!items || items.length === 0) {
        ctx.font      = `18px ${FA}`;
        ctx.fillStyle = C.textD;
        ctx.fillText('—', x + w / 2, y + h / 2);
        return;
    }

    const rowH     = 48;
    const maxRows  = Math.floor((h - 70) / rowH);
    const visible  = items.slice(0, maxRows);
    const startY   = y + 64;

    for (let i = 0; i < visible.length; i++) {
        const item   = visible[i];
        const rowY   = startY + i * rowH;
        const midY   = rowY + rowH / 2;
        const color  = itemColor(item.rarity);
        const sold   = Number(item.quantitySold || 0);
        const avail  = Number(item.quantity) - sold;
        const price  = Number(item.pricePerUnit || 0);
        const name   = truncate(item.itemName || item.itemId || '?', 16);
        const emoji  = item.itemEmoji || '📦';

        // Row subtle background on even rows
        if (i % 2 === 0) {
            ctx.fillStyle = 'rgba(255,255,255,0.03)';
            ctx.fillRect(x + 8, rowY, w - 16, rowH - 2);
        }

        // Rarity dot
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x + 22, midY, 5, 0, Math.PI * 2);
        ctx.fill();

        // Emoji + name
        ctx.font      = `18px ${FE}`;
        ctx.textAlign = 'left';
        ctx.fillStyle = C.text;
        ctx.fillText(emoji, x + 34, midY);

        ctx.font      = `bold 17px ${FA}`;
        ctx.textAlign = 'left';
        ctx.fillStyle = C.text;
        ctx.fillText(name, x + 62, midY - 8);

        // Qty sold / qty unsold
        ctx.font      = `14px ${FA}`;
        ctx.fillStyle = C.textD;
        if (sold > 0) {
            ctx.fillText(`×${sold} — ${(sold * price).toLocaleString()} مورا`, x + 62, midY + 10);
        } else {
            ctx.fillText(`×${avail} مرتجعة`, x + 62, midY + 10);
        }

        // Price per unit (right-aligned)
        ctx.font      = `bold 15px ${FA}`;
        ctx.textAlign = 'right';
        ctx.fillStyle = accentColor;
        ctx.fillText(`${price.toLocaleString()}/وحدة`, x + w - 14, midY);
    }

    if (items.length > maxRows) {
        ctx.font      = `15px ${FA}`;
        ctx.textAlign = 'center';
        ctx.fillStyle = C.textD;
        ctx.fillText(`... و ${items.length - maxRows} عنصر آخر`, x + w / 2, y + h - 16);
    }
}

module.exports = { generateMarketSummaryCanvas };
