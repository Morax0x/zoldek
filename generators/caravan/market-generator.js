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

const RARITY_AR = {
    'Common': 'عادي', 'Uncommon': 'شائع', 'Rare': 'نادر', 'Epic': 'ملحمي', 'Legendary': 'أسطوري',
};

// Cache for item images
const imgCache = new Map();
async function loadCachedImg(url) {
    if (!url) return null;
    if (imgCache.has(url)) return imgCache.get(url);
    try {
        const img = await loadImage(url);
        imgCache.set(url, img);
        return img;
    } catch { return null; }
}

// Grid layout (4 cols × 2 rows, bigger cards, less empty space)
const MARGIN_X   = 20;
const MARGIN_TOP  = 140;
const CARD_W     = 378;
const CARD_H     = 344;
const GAP_X      = 16;
const GAP_Y      = 12;
const FOOTER_H   = 60;

function cardX(col) { return MARGIN_X + col * (CARD_W + GAP_X); }
function cardY(row) { return MARGIN_TOP + row * (CARD_H + GAP_Y); }

async function drawItemCard(ctx, listing, info, x, y) {
    const available   = Number(listing.quantity) - Number(listing.quantitysold || listing.quantitySold || 0);
    const price       = Number(listing.priceperunit || listing.pricePerUnit);
    const rarity      = info.rarity || 'Common';
    const rarityColor = RARITY_COLORS[rarity] || C.textD;
    const rarityAr    = RARITY_AR[rarity] || rarity;

    // Panel base (clipped)
    ctx.save();
    rr(ctx, x, y, CARD_W, CARD_H, 20);
    ctx.clip();

    const bg = ctx.createLinearGradient(x, y, x, y + CARD_H);
    bg.addColorStop(0, 'rgba(14,18,38,0.82)');
    bg.addColorStop(0.6, 'rgba(8,12,26,0.90)');
    bg.addColorStop(1, 'rgba(4,6,16,0.96)');
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, CARD_W, CARD_H);

    // Subtle rarity tint at top
    const tint = ctx.createLinearGradient(x, y, x, y + 80);
    tint.addColorStop(0, rarityColor + '1A');
    tint.addColorStop(1, 'transparent');
    ctx.fillStyle = tint; ctx.fillRect(x, y, CARD_W, 80);
    ctx.restore();

    // Rarity glow border
    ctx.save();
    ctx.shadowColor = rarityColor + 'AA'; ctx.shadowBlur = 22;
    rr(ctx, x, y, CARD_W, CARD_H, 20);
    ctx.strokeStyle = rarityColor + '77'; ctx.lineWidth = 2; ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();

    // Inner highlight
    rr(ctx, x + 2, y + 2, CARD_W - 4, CARD_H - 4, 19);
    ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1; ctx.stroke();

    // Top accent bar
    ctx.save();
    rr(ctx, x, y, CARD_W, 5, [20, 20, 0, 0]);
    const barG = ctx.createLinearGradient(x, y, x + CARD_W, y);
    barG.addColorStop(0, rarityColor + '44');
    barG.addColorStop(0.5, rarityColor);
    barG.addColorStop(1, rarityColor + '44');
    ctx.fillStyle = barG; ctx.fill();
    ctx.restore();

    // ── Item image (130×130) ──
    const imgSize = 130;
    const imgX = x + (CARD_W - imgSize) / 2;
    const imgY = y + 14;

    const itemImg = await loadCachedImg(info.imgPath);
    if (itemImg) {
        ctx.save();
        // Glow behind image
        ctx.shadowColor = rarityColor + '66'; ctx.shadowBlur = 20;
        ctx.beginPath(); ctx.arc(imgX + imgSize / 2, imgY + imgSize / 2, imgSize / 2 + 4, 0, Math.PI * 2);
        ctx.fillStyle = rarityColor + '15'; ctx.fill(); ctx.shadowBlur = 0;
        // Circular clip
        ctx.beginPath(); ctx.arc(imgX + imgSize / 2, imgY + imgSize / 2, imgSize / 2, 0, Math.PI * 2); ctx.clip();
        ctx.drawImage(itemImg, imgX, imgY, imgSize, imgSize);
        ctx.restore();
        // Ring around image
        ctx.beginPath(); ctx.arc(imgX + imgSize / 2, imgY + imgSize / 2, imgSize / 2, 0, Math.PI * 2);
        ctx.strokeStyle = rarityColor + '66'; ctx.lineWidth = 2; ctx.stroke();
    } else {
        ctx.save();
        ctx.shadowColor = rarityColor + '55'; ctx.shadowBlur = 18;
        ctx.font = `62px ${FE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(info.emoji || '📦', x + CARD_W / 2, imgY + imgSize / 2);
        ctx.shadowBlur = 0; ctx.restore();
    }

    // Rarity badge (top-right)
    const badgeW = 80, badgeH = 24;
    const badgeX = x + CARD_W - badgeW - 6, badgeY = y + 8;
    rr(ctx, badgeX, badgeY, badgeW, badgeH, 8);
    ctx.fillStyle = rarityColor + '22'; ctx.fill();
    ctx.strokeStyle = rarityColor + '66'; ctx.lineWidth = 1; ctx.stroke();
    ctx.font = `bold 13px ${FA}`; ctx.direction = 'rtl';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = rarityColor;
    ctx.shadowColor = rarityColor; ctx.shadowBlur = 6;
    ctx.fillText(rarityAr, badgeX + badgeW / 2, badgeY + badgeH / 2);
    ctx.shadowBlur = 0;

    // Divider after image
    divLine(ctx, x + 14, y + 152, CARD_W - 28, 'rgba(255,255,255,0.10)');

    // ── Item name ──
    ctx.font = `bold 24px ${FA}`; ctx.direction = 'rtl';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = C.text;
    ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 8;
    const nameStr = truncate(info.name || (listing.itemid || listing.itemID || '?'), 18);
    ctx.fillText(nameStr, x + CARD_W / 2, y + 178);
    ctx.shadowBlur = 0;

    // ── Quantity bar ──
    const qtyBarX = x + 18, qtyBarY = y + 218, qtyBarW = CARD_W - 36, qtyBarH = 28;
    rr(ctx, qtyBarX, qtyBarY, qtyBarW, qtyBarH, 8);
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1; ctx.stroke();

    const totalQty  = Number(listing.quantity);
    const fraction  = totalQty > 0 ? Math.max(0, Math.min(1, available / totalQty)) : 0;
    if (fraction > 0) {
        const fillW = Math.max(qtyBarH, Math.floor(fraction * qtyBarW));
        ctx.save();
        rr(ctx, qtyBarX, qtyBarY, qtyBarW, qtyBarH, 8); ctx.clip();
        const qg = ctx.createLinearGradient(qtyBarX, qtyBarY, qtyBarX + fillW, qtyBarY);
        qg.addColorStop(0, C.blue + '88'); qg.addColorStop(1, C.blue);
        rr(ctx, qtyBarX, qtyBarY, fillW, qtyBarH, 8);
        ctx.fillStyle = qg;
        ctx.shadowColor = C.blue; ctx.shadowBlur = 10;
        ctx.fill(); ctx.shadowBlur = 0;
        ctx.restore();
    }
    ctx.font = `bold 15px ${FA}`; ctx.direction = 'rtl';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 4;
    ctx.fillText(`متبقي: ${available}`, qtyBarX + qtyBarW / 2, qtyBarY + qtyBarH / 2 + 1);
    ctx.shadowBlur = 0;

    // ── Price ──
    const priceLabelY = y + 260;
    ctx.font = `18px ${FA}`; ctx.direction = 'rtl';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = C.textD;
    ctx.fillText('السعر / وحدة', x + CARD_W / 2, priceLabelY);

    ctx.font = `bold 28px ${FA}`; ctx.direction = 'rtl';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = C.green;
    ctx.shadowColor = C.green + '77'; ctx.shadowBlur = 14;
    ctx.fillText(`${price.toLocaleString()} مورا`, x + CARD_W / 2, priceLabelY + 36);
    ctx.shadowBlur = 0;

    // Listing ID (small, bottom)
    ctx.font = `13px ${FA}`; ctx.direction = 'ltr';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = C.textD + '77';
    ctx.fillText(`#${listing.id}`, x + CARD_W / 2, y + CARD_H - 14);
}

// ── Main export ────────────────────────────────────────────────────────────────

async function generateMarketCanvas(listings, dest, page = 0) {
    const canvas = createCanvas(W, H);
    const ctx    = canvas.getContext('2d');

    await drawBg(ctx, 'marketbg');

    // Dark overlay
    ctx.fillStyle = 'rgba(4,6,15,0.42)';
    ctx.fillRect(0, 0, W, H);

    drawCornerAccents(ctx);

    const destColor = dest?.color || C.gold;
    const destEmoji = dest?.emoji || '🏪';
    const destName  = dest?.name  || 'سوق القافلة';

    // ── Header ────────────────────────────────────────────────────────────────
    const headerGrad = ctx.createLinearGradient(0, 0, 0, 148);
    headerGrad.addColorStop(0, 'rgba(0,0,0,0.90)');
    headerGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = headerGrad; ctx.fillRect(0, 0, W, 148);

    const lineG = ctx.createLinearGradient(0, 0, W, 0);
    lineG.addColorStop(0,    'transparent');
    lineG.addColorStop(0.15, destColor + '66');
    lineG.addColorStop(0.35, destColor);
    lineG.addColorStop(0.65, destColor);
    lineG.addColorStop(0.85, destColor + '66');
    lineG.addColorStop(1,    'transparent');
    ctx.fillStyle = lineG; ctx.fillRect(0, 132, W, 2);

    // Diamond ornament
    ctx.save();
    ctx.fillStyle = destColor; ctx.shadowColor = destColor; ctx.shadowBlur = 16;
    ctx.translate(W / 2, 133); ctx.rotate(Math.PI / 4); ctx.fillRect(-6, -6, 12, 12);
    ctx.restore();

    ctx.shadowColor = destColor + '66'; ctx.shadowBlur = 24;
    M(ctx, `${destEmoji} سوق القافلة — ${destName}`, W / 2, 52, 44, C.text);
    ctx.shadowBlur = 0;

    const activeListings = listings.filter(l =>
        (Number(l.quantity) - Number(l.quantitysold || l.quantitySold || 0)) > 0
    );

    // Count badge
    const countBadgeW = 280, countBadgeH = 32, countBadgeX = W / 2 - countBadgeW / 2, countBadgeY = 100;
    rr(ctx, countBadgeX, countBadgeY, countBadgeW, countBadgeH, 12);
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fill();
    ctx.strokeStyle = destColor + '33'; ctx.lineWidth = 1; ctx.stroke();
    M(ctx, `${activeListings.length} عنصر معروض في السوق`, W / 2, countBadgeY + 16, 18, C.textD);

    if (activeListings.length === 0) {
        ctx.shadowColor = C.red + '88'; ctx.shadowBlur = 20;
        M(ctx, '🛒 لا توجد بضائع متاحة حالياً', W / 2, H / 2, 42, C.red);
        ctx.shadowBlur = 0;
        return toBuf(canvas);
    }

    const totalPages = Math.max(1, Math.ceil(activeListings.length / ITEMS_PER_PAGE));
    const safePage   = Math.max(0, Math.min(page, totalPages - 1));
    const pageItems  = activeListings.slice(safePage * ITEMS_PER_PAGE, (safePage + 1) * ITEMS_PER_PAGE);

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
        const footerGrad = ctx.createLinearGradient(0, footerY - 20, 0, H);
        footerGrad.addColorStop(0, 'rgba(0,0,0,0)');
        footerGrad.addColorStop(0.3, 'rgba(0,0,0,0.75)');
        footerGrad.addColorStop(1, 'rgba(0,0,0,0.92)');
        ctx.fillStyle = footerGrad; ctx.fillRect(0, footerY - 20, W, FOOTER_H + 20);

        divLine(ctx, 80, footerY + 2, W - 160, destColor + '44');

        M(ctx, `صفحة ${safePage + 1} من ${totalPages}`, W / 2, footerY + FOOTER_H / 2, 24, C.textD);

        if (safePage > 0) {
            ctx.font = `bold 32px ${FE}`; ctx.direction = 'ltr';
            ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
            ctx.fillStyle = destColor; ctx.shadowColor = destColor; ctx.shadowBlur = 12;
            ctx.fillText('◄', 52, footerY + FOOTER_H / 2); ctx.shadowBlur = 0;
        }
        if (safePage < totalPages - 1) {
            ctx.font = `bold 32px ${FE}`; ctx.direction = 'ltr';
            ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
            ctx.fillStyle = destColor; ctx.shadowColor = destColor; ctx.shadowBlur = 12;
            ctx.fillText('►', W - 52, footerY + FOOTER_H / 2); ctx.shadowBlur = 0;
        }
    }

    return toBuf(canvas);
}

module.exports = { generateMarketCanvas, ITEMS_PER_PAGE };
