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

    ctx.fillStyle = 'rgba(4, 6, 15, 0.70)'; 
    ctx.fillRect(0, 0, W, H);

    drawCornerAccents(ctx);

    const headerGrad = ctx.createLinearGradient(0, 0, 0, 180);
    headerGrad.addColorStop(0, 'rgba(0,0,0,0.95)');
    headerGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = headerGrad;
    ctx.fillRect(0, 0, W, 180);

    const lineG = ctx.createLinearGradient(0, 0, W, 0);
    lineG.addColorStop(0,    'transparent');
    lineG.addColorStop(0.2, C.gold);
    lineG.addColorStop(0.5, '#FFF6CC'); 
    lineG.addColorStop(0.8, C.gold);
    lineG.addColorStop(1,    'transparent');
    ctx.fillStyle = lineG;
    ctx.fillRect(0, 158, W, 3);

    ctx.shadowColor = C.gold;
    ctx.shadowBlur  = 25;
    M(ctx, `📋 التقرير النهائي لسوق — ${destName}`, W / 2, 58, 46, C.gold); 
    ctx.shadowBlur = 0;
    
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    rr(ctx, W / 2 - 150, 98, 300, 36, 18);
    ctx.fill();
    M(ctx, `التاجر: ${ownerName}`, W / 2, 116, 22, '#E0E0E0');

    const panelX = W / 2 - 340; 
    const panelY = 180;
    const panelW = 680;
    const panelH = 90;

    const panelGrad = ctx.createLinearGradient(panelX, panelY, panelX, panelY + panelH);
    panelGrad.addColorStop(0, 'rgba(245, 197, 24, 0.15)');
    panelGrad.addColorStop(1, 'rgba(245, 197, 24, 0.05)');
    
    rr(ctx, panelX, panelY, panelW, panelH, 20);
    ctx.fillStyle = panelGrad;
    ctx.fill();
    
    rr(ctx, panelX, panelY, panelW, panelH, 20);
    ctx.strokeStyle = C.gold + 'AA'; 
    ctx.lineWidth = 2;
    ctx.stroke();

    M(ctx, `إجمالي الإيرادات الصافية`, W / 2, panelY + 28, 22, '#CCCCCC');
    ctx.shadowColor = C.gold;
    ctx.shadowBlur  = 18;
    M(ctx, `💰 ${totalEarned.toLocaleString()} مورا`, W / 2, panelY + 64, 40, C.gold);
    ctx.shadowBlur = 0;

    const COL_Y     = panelY + panelH + 35;
    const COL_H     = H - COL_Y - 40;
    const LEFT_X    = 45;
    const LEFT_W    = W / 2 - 65;
    const RIGHT_X   = W / 2 + 20;
    const RIGHT_W   = W / 2 - 65;

    drawColumn(ctx, LEFT_X, COL_Y, LEFT_W, COL_H, soldItems, '✅ البضائع المُباعة', C.green, true);
    drawColumn(ctx, RIGHT_X, COL_Y, RIGHT_W, COL_H, unsoldItems, '📦 البضائع المُرتجعة (لم تُباع)', '#E74C3C', false);

    return toBuf(canvas);
}

function drawColumn(ctx, x, y, w, h, items, title, accentColor, isSoldColumn) {
    rr(ctx, x, y, w, h, 20);
    ctx.fillStyle = 'rgba(10, 15, 30, 0.85)'; 
    ctx.fill();
    
    rr(ctx, x, y, w, h, 20);
    ctx.strokeStyle = accentColor + '66';
    ctx.lineWidth   = 2;
    ctx.stroke();

    rr(ctx, x, y, w, 6, [20, 20, 0, 0]); 
    ctx.fillStyle = accentColor;
    ctx.fill();

    const titleGrad = ctx.createLinearGradient(x, y, x, y + 45);
    titleGrad.addColorStop(0, accentColor + '22');
    titleGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = titleGrad;
    ctx.fillRect(x, y + 6, w, 45);

    ctx.font = `bold 24px ${FA}`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = accentColor;
    ctx.shadowColor = accentColor;
    ctx.shadowBlur = 10;
    ctx.fillText(title, x + w / 2, y + 32);
    ctx.shadowBlur = 0;

    divLine(ctx, x + 20, y + 55, w - 40, 'rgba(255,255,255,0.15)');

    if (!items || items.length === 0) {
        ctx.font      = `20px ${FA}`;
        ctx.fillStyle = '#888888';
        ctx.fillText(isSoldColumn ? 'لم يتم بيع أي بضاعة' : 'تم بيع جميع البضائع بالكامل!', x + w / 2, y + h / 2);
        return;
    }

    const rowH     = 55; 
    const maxRows  = Math.floor((h - 80) / rowH);
    const visible  = items.slice(0, maxRows);
    const startY   = y + 70;

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

        if (i % 2 === 0) {
            rr(ctx, x + 10, rowY, w - 20, rowH - 4, 8);
            ctx.fillStyle = 'rgba(255,255,255,0.04)';
            ctx.fill();
        }

        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x + 28, midY, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.font      = `22px ${FE}`;
        ctx.textAlign = 'left';
        ctx.fillStyle = C.text;
        ctx.fillText(emoji, x + 42, midY);

        ctx.font      = `bold 18px ${FA}`;
        ctx.textAlign = 'left';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(name, x + 75, midY - 10);

        ctx.font      = `15px ${FA}`;
        if (isSoldColumn) {
            ctx.fillStyle = '#A0D468'; 
            ctx.fillText(`الكمية: ${sold} | الإجمالي: ${(sold * price).toLocaleString()}`, x + 75, midY + 12);
        } else {
            ctx.fillStyle = '#E74C3C'; 
            ctx.fillText(`باقي بالمخزن: ${avail}`, x + 75, midY + 12);
        }

        ctx.font      = `bold 16px ${FA}`;
        ctx.textAlign = 'right';
        ctx.fillStyle = C.gold;
        ctx.fillText(`${price.toLocaleString()} / للحبة`, x + w - 20, midY);
    }

    if (items.length > maxRows) {
        ctx.font      = `16px ${FA}`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#999999';
        ctx.fillText(`... وهناك ${items.length - maxRows} بضائع أخرى`, x + w / 2, y + h - 20);
    }
}

module.exports = { generateMarketSummaryCanvas };
