const {
    createCanvas, W, H, FA, FE, C,
    rr, fetchImageSafe, drawBg, drawPanel, drawHeader,
    drawCornerAccents, divLine, M, R, L, truncate, toBuf,
} = require('./shared');
const { loadImage } = require('@napi-rs/canvas');

const ITEMS_PER_PAGE = 8; // 4 cols × 2 rows

const RARITY_COLORS = {
    'Common':    '#A8B8D0',
    'Uncommon':  '#2ECC71',
    'Rare':      '#00C3FF',
    'Epic':      '#B968FF',
    'Legendary': '#FFD700',
};

// Cache for item images
const imgCache = new Map();
async function loadCached(url) {
    if (!url) return null;
    if (imgCache.has(url)) return imgCache.get(url);
    try {
        const img = await loadImage(url);
        imgCache.set(url, img);
        return img;
    } catch {
        return null;
    }
}

// Grid layout constants
const MARGIN_X  = 40;
const MARGIN_TOP = 148;  // below header
const CARD_W    = 350;
const CARD_H    = 320;
const GAP_X     = 40;
const GAP_Y     = 28;
const FOOTER_H  = 80;    // bottom pagination bar

function cardX(col) { return MARGIN_X + col * (CARD_W + GAP_X); }
function cardY(row) { return MARGIN_TOP + row * (CARD_H + GAP_Y); }

async function drawItemCard(ctx, listing, info, x, y) {
    const available = Number(listing.quantity) - Number(listing.quantitysold || listing.quantitySold || 0);
    const price     = Number(listing.priceperunit || listing.pricePerUnit);
    const rarity    = info.rarity || 'Common';
    const rarityColor = RARITY_COLORS[rarity] || C.textD;

    // Clip card area so nothing bleeds outside
    ctx.save();
    rr(ctx, x, y, CARD_W, CARD_H, 18);
    ctx.clip();

    // Card background
    const bg = ctx.createLinearGradient(x, y, x, y + CARD_H);
    bg.addColorStop(0, 'rgba(12,16,34,0.78)');
    bg.addColorStop(1, 'rgba(4,6,15,0.90)');
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, CARD_W, CARD_H);

    ctx.restore(); // end clip

    // Rarity glow border
    ctx.save();
    ctx.shadowColor = rarityColor;
    ctx.shadowBlur  = 18;
    rr(ctx, x, y, CARD_W, CARD_H, 18);
    ctx.strokeStyle = rarityColor + '88';
    ctx.lineWidth   = 2.5;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();

    // Rarity accent bar at top of card (4px)
    ctx.fillStyle = rarityColor;
    ctx.beginPath();
    ctx.roundRect(x, y, CARD_W, 4, [18, 18, 0, 0]);
    ctx.fill();

    // ── Item image (80×80) centered horizontally, upper area ──
    const imgY = y + 22;
    const imgSize = 80;
    const imgX = x + (CARD_W - imgSize) / 2;

    const itemImg = await loadCached(info.imgPath);
    if (itemImg) {
        // Circular clip for image
        ctx.save();
        ctx.beginPath();
        ctx.arc(imgX + imgSize / 2, imgY + imgSize / 2, imgSize / 2, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(itemImg, imgX, imgY, imgSize, imgSize);
        ctx.restore();
    } else {
        // Emoji fallback
        ctx.font = `52px ${FE}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(info.emoji || '📦', x + CARD_W / 2, imgY + imgSize / 2);
    }

    // Rarity label badge (top-right corner)
    const badgeX = x + CARD_W - 6;
    const badgeY = y + 10;
    ctx.font = `bold 15px ${FA}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = rarityColor;
    ctx.shadowColor = rarityColor;
    ctx.shadowBlur = 8;
    ctx.fillText(rarity, badgeX, badgeY);
    ctx.shadowBlur = 0;

    // Divider
    divLine(ctx, x + 16, y + 114, CARD_W - 32, 'rgba(255,255,255,0.10)');

    // ── Item name ──
    ctx.font = `bold 22px ${FA}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = C.text;
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 6;
    const nameStr = truncate(info.name || (listing.itemid || listing.itemID), 18);
    ctx.fillText(nameStr, x + CARD_W / 2, y + 142);
    ctx.shadowBlur = 0;

    // ── Quantity bar ──
    const qtyBarX  = x + 20;
    const qtyBarY  = y + 178;
    const qtyBarW  = CARD_W - 40;
    const qtyBarH  = 28;

    // Background track
    rr(ctx, qtyBarX, qtyBarY, qtyBarW, qtyBarH, 8);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fill();

    // Fill — cyan for available qty (as fraction of original)
    const totalQty = Number(listing.quantity);
    const fraction = totalQty > 0 ? Math.max(0, Math.min(1, available / totalQty)) : 0;
    if (fraction > 0) {
        const fillW = Math.max(qtyBarH, Math.floor(fraction * qtyBarW));
        rr(ctx, qtyBarX, qtyBarY, fillW, qtyBarH, 8);
        ctx.fillStyle = C.blue + 'BB';
        ctx.fill();
    }

    // Qty text inside bar
    ctx.font = `bold 15px ${FA}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(`متبقي: ${available}`, qtyBarX + qtyBarW / 2, qtyBarY + qtyBarH / 2 + 1);

    // ── Price ──
    const priceAreaY = y + 232;
    ctx.font = `bold 18px ${FA}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = C.textD;
    ctx.fillText('السعر / وحدة', x + CARD_W / 2, priceAreaY);

    ctx.font = `bold 28px ${FA}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = C.green;
    ctx.shadowColor = C.green + '66';
    ctx.shadowBlur = 10;
    ctx.fillText(`${price.toLocaleString()} مورا`, x + CARD_W / 2, priceAreaY + 38);
    ctx.shadowBlur = 0;

    // ── Seller tag (seller ID shown as listing ID for privacy) ──
    ctx.font = `15px ${FA}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = C.textD + 'AA';
    ctx.fillText(`#${listing.id}`, x + CARD_W / 2, y + CARD_H - 18);
}

// Main export
async function generateMarketCanvas(listings, dest, page = 0) {
    const canvas = createCanvas(W, H);
    const ctx    = canvas.getContext('2d');

    await drawBg(ctx, 'marketbg');

    // Tint overlay
    ctx.fillStyle = 'rgba(4,6,15,0.40)';
    ctx.fillRect(0, 0, W, H);

    drawCornerAccents(ctx);

    const destColor   = dest?.color || C.gold;
    const destEmoji   = dest?.emoji || '🏪';
    const destName    = dest?.name  || 'سوق القافلة';

    // Header
    const headerGrad = ctx.createLinearGradient(0, 0, 0, 140);
    headerGrad.addColorStop(0, 'rgba(0,0,0,0.85)');
    headerGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = headerGrad;
    ctx.fillRect(0, 0, W, 140);

    const lineG = ctx.createLinearGradient(0, 0, W, 0);
    lineG.addColorStop(0,    'transparent');
    lineG.addColorStop(0.15, destColor);
    lineG.addColorStop(0.85, destColor);
    lineG.addColorStop(1,    'transparent');
    ctx.fillStyle = lineG;
    ctx.fillRect(0, 130, W, 2.5);

    ctx.shadowColor = destColor + '88';
    ctx.shadowBlur  = 20;
    M(ctx, `${destEmoji} سوق القافلة — ${destName}`, W / 2, 52, 46, C.text);
    ctx.shadowBlur = 0;

    const activeListings = listings.filter(l =>
        (Number(l.quantity) - Number(l.quantitysold || l.quantitySold || 0)) > 0
    );

    if (activeListings.length === 0) {
        ctx.shadowColor = C.red + '88';
        ctx.shadowBlur  = 20;
        M(ctx, '🛒 لا توجد بضائع متاحة للبيع حالياً', W / 2, H / 2, 44, C.red);
        ctx.shadowBlur = 0;
        return toBuf(canvas);
    }

    const totalPages = Math.max(1, Math.ceil(activeListings.length / ITEMS_PER_PAGE));
    const safePage   = Math.max(0, Math.min(page, totalPages - 1));
    const pageItems  = activeListings.slice(safePage * ITEMS_PER_PAGE, (safePage + 1) * ITEMS_PER_PAGE);

    // Draw item cards
    for (let i = 0; i < pageItems.length; i++) {
        const col  = i % 4;
        const row  = Math.floor(i / 4);
        const x    = cardX(col);
        const y    = cardY(row);
        const listing = pageItems[i];

        let info;
        try {
            const { getItemInfo } = require('../../handlers/caravan/market/market-setup');
            info = getItemInfo(listing.itemid || listing.itemID);
        } catch {
            info = { name: listing.itemname || listing.itemId || '?', emoji: '📦', rarity: 'Common', imgPath: null };
        }

        await drawItemCard(ctx, listing, info, x, y);
    }

    // Pagination footer
    if (totalPages > 1) {
        const footerY = H - FOOTER_H;
        const footerGrad = ctx.createLinearGradient(0, footerY, 0, H);
        footerGrad.addColorStop(0, 'rgba(0,0,0,0.70)');
        footerGrad.addColorStop(1, 'rgba(0,0,0,0.90)');
        ctx.fillStyle = footerGrad;
        ctx.fillRect(0, footerY, W, FOOTER_H);

        divLine(ctx, 0, footerY, W, 'rgba(255,255,255,0.15)');

        // Page indicator
        M(ctx, `صفحة ${safePage + 1} من ${totalPages}`, W / 2, footerY + FOOTER_H / 2, 26, C.textD);

        // Arrow hints (decorative — actual buttons are Discord components)
        if (safePage > 0) {
            ctx.font = `bold 30px ${FE}`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = destColor;
            ctx.fillText('◄', 60, footerY + FOOTER_H / 2);
        }
        if (safePage < totalPages - 1) {
            ctx.font = `bold 30px ${FE}`;
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = destColor;
            ctx.fillText('►', W - 60, footerY + FOOTER_H / 2);
        }
    }

    // Sub-header: count summary
    M(ctx, `${activeListings.length} عنصر معروض`, W / 2, 104, 24, C.textD);

    return toBuf(canvas);
}

module.exports = { generateMarketCanvas, ITEMS_PER_PAGE };
