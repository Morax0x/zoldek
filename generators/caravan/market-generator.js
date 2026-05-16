const {
    createCanvas, W, H, FA, FE, C,
    rr, fetchImageSafe, loadCached, drawBg, drawPanel, drawHeader,
    drawCornerAccents, divLine, wrapText, M, R, L, truncate, toBuf,
} = require('./shared');

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



// Grid layout — dynamic, computed per page
const MARGIN_X   = 15;
const MARGIN_TOP  = 140;
const GAP_X      = 10;
const GAP_Y      = 8;
const FOOTER_H   = 60;

async function drawItemCard(ctx, listing, info, x, y, cardW, cardH) {
    const available   = Number(listing.quantity) - Number(listing.quantitysold || listing.quantitySold || 0);
    const price       = Number(listing.priceperunit || listing.pricePerUnit);
    const rarity      = info.rarity || 'Common';
    const rarityColor = RARITY_COLORS[rarity] || C.textD;
    const rarityAr    = RARITY_AR[rarity] || rarity;

    // Panel base (clipped)
    ctx.save();
    rr(ctx, x, y, cardW, cardH, 20);
    ctx.clip();

    const bg = ctx.createLinearGradient(x, y, x, y + cardH);
    bg.addColorStop(0, 'rgba(14,18,38,0.82)');
    bg.addColorStop(0.6, 'rgba(8,12,26,0.90)');
    bg.addColorStop(1, 'rgba(4,6,16,0.96)');
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, cardW, cardH);

    // Subtle rarity tint at top
    const tint = ctx.createLinearGradient(x, y, x, y + cardH * 0.21);
    tint.addColorStop(0, rarityColor + '1A');
    tint.addColorStop(1, 'transparent');
    ctx.fillStyle = tint; ctx.fillRect(x, y, cardW, cardH * 0.21);
    ctx.restore();

    // Rarity glow border
    ctx.save();
    ctx.shadowColor = rarityColor + 'AA'; ctx.shadowBlur = 22;
    rr(ctx, x, y, cardW, cardH, 20);
    ctx.strokeStyle = rarityColor + '77'; ctx.lineWidth = 2; ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();

    // Inner highlight
    rr(ctx, x + 2, y + 2, cardW - 4, cardH - 4, 19);
    ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1; ctx.stroke();

    // Top accent bar
    ctx.save();
    rr(ctx, x, y, cardW, 5, [20, 20, 0, 0]);
    const barG = ctx.createLinearGradient(x, y, x + cardW, y);
    barG.addColorStop(0, rarityColor + '44');
    barG.addColorStop(0.5, rarityColor);
    barG.addColorStop(1, rarityColor + '44');
    ctx.fillStyle = barG; ctx.fill();
    ctx.restore();

    // ── Item image (proportional) ──
    const imgSize = Math.min(150, cardW * 0.36, cardH * 0.4);
    const imgX = x + (cardW - imgSize) / 2;
    const imgY = y + cardH * 0.04;

    const itemImg = await loadCached(info.imgPath);
    if (itemImg) {
        ctx.save();
        ctx.shadowColor = rarityColor + '66'; ctx.shadowBlur = 20;
        ctx.beginPath(); ctx.arc(imgX + imgSize / 2, imgY + imgSize / 2, imgSize / 2 + 4, 0, Math.PI * 2);
        ctx.fillStyle = rarityColor + '15'; ctx.fill(); ctx.shadowBlur = 0;
        ctx.beginPath(); ctx.arc(imgX + imgSize / 2, imgY + imgSize / 2, imgSize / 2, 0, Math.PI * 2); ctx.clip();
        ctx.drawImage(itemImg, imgX, imgY, imgSize, imgSize);
        ctx.restore();
        ctx.beginPath(); ctx.arc(imgX + imgSize / 2, imgY + imgSize / 2, imgSize / 2, 0, Math.PI * 2);
        ctx.strokeStyle = rarityColor + '66'; ctx.lineWidth = 2; ctx.stroke();
    } else {
        ctx.save();
        ctx.shadowColor = rarityColor + '55'; ctx.shadowBlur = 18;
        ctx.font = `bold ${Math.min(62, imgSize)}px ${FE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(info.emoji || '📦', x + cardW / 2, imgY + imgSize / 2);
        ctx.shadowBlur = 0; ctx.restore();
    }

    // Rarity badge (top-right)
    const badgeW = Math.min(80, cardW * 0.19);
    const badgeH = Math.min(24, cardH * 0.065);
    const badgeX = x + cardW - badgeW - 6;
    const badgeY = y + cardH * 0.022;
    rr(ctx, badgeX, badgeY, badgeW, badgeH, 8);
    ctx.fillStyle = rarityColor + '22'; ctx.fill();
    ctx.strokeStyle = rarityColor + '66'; ctx.lineWidth = 1; ctx.stroke();
    ctx.font = `bold ${Math.min(13, badgeH * 0.55)}px ${FA}`; ctx.direction = 'rtl';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = rarityColor;
    ctx.shadowColor = rarityColor; ctx.shadowBlur = 6;
    ctx.fillText(rarityAr, badgeX + badgeW / 2, badgeY + badgeH / 2);
    ctx.shadowBlur = 0;

    // Divider after image
    const divY = imgY + imgSize + cardH * 0.045;
    divLine(ctx, x + 14, divY, cardW - 28, 'rgba(255,255,255,0.10)');

    // ── Item name ──
    const nameY = divY + cardH * 0.07;
    ctx.font = `bold ${Math.min(24, cardH * 0.065)}px ${FA}`; ctx.direction = 'rtl';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = C.text;
    ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 8;
    const nameStr = truncate(info.name || (listing.itemid || listing.itemID || '?'), 18);
    ctx.fillText(nameStr, x + cardW / 2, nameY);
    ctx.shadowBlur = 0;

    // ── Quantity bar ──
    const qtyBarX = x + 18;
    const qtyBarY = nameY + cardH * 0.125;
    const qtyBarW = cardW - 36;
    const qtyBarH = Math.min(28, cardH * 0.075);
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
    ctx.font = `bold ${Math.min(15, qtyBarH * 0.55)}px ${FA}`; ctx.direction = 'rtl';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 4;
    ctx.fillText(`متبقي: ${available}`, qtyBarX + qtyBarW / 2, qtyBarY + qtyBarH / 2 + 1);
    ctx.shadowBlur = 0;

    // ── Price ──
    const priceLabelY = qtyBarY + qtyBarH + cardH * 0.05;
    ctx.font = `${Math.min(18, cardH * 0.048)}px ${FA}`; ctx.direction = 'rtl';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = C.textD;
    ctx.fillText('السعر / وحدة', x + cardW / 2, priceLabelY);

    ctx.font = `bold ${Math.min(28, cardH * 0.075)}px ${FA}`; ctx.direction = 'rtl';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = C.green;
    ctx.shadowColor = C.green + '77'; ctx.shadowBlur = 14;
    ctx.fillText(`${price.toLocaleString()} مورا`, x + cardW / 2, priceLabelY + cardH * 0.095);
    ctx.shadowBlur = 0;

    // Listing ID (small, bottom)
    ctx.font = `13px ${FA}`; ctx.direction = 'ltr';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = C.textD + '77';
    ctx.fillText(`#${listing.id}`, x + cardW / 2, y + cardH - 14);
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

    if (activeListings.length === 0) {
        ctx.shadowColor = C.red + '88'; ctx.shadowBlur = 20;
        M(ctx, '🛒 لا توجد بضائع متاحة حاليا', W / 2, H / 2, 42, C.red);
        ctx.shadowBlur = 0;
        return toBuf(canvas);
    }

    const totalPages = Math.max(1, Math.ceil(activeListings.length / ITEMS_PER_PAGE));
    const safePage   = Math.max(0, Math.min(page, totalPages - 1));
    const pageItems  = activeListings.slice(safePage * ITEMS_PER_PAGE, (safePage + 1) * ITEMS_PER_PAGE);

    // ── Dynamic grid layout ──────────────────────────────────────────────────
    const itemCount = pageItems.length;
    const cols = Math.min(Math.max(itemCount, 1), 4);
    const rows = Math.ceil(itemCount / cols);

    const availW = W - 2 * MARGIN_X;
    const availH = H - MARGIN_TOP - FOOTER_H - 30;
    const cardW = Math.max(300, Math.min(800, Math.floor((availW - (cols - 1) * GAP_X) / cols)));
    const cardH = Math.max(320, Math.min(560, Math.floor((availH - (rows - 1) * GAP_Y) / rows)));

    const gridW = cols * cardW + (cols - 1) * GAP_X;
    const gridH = rows * cardH + (rows - 1) * GAP_Y;
    const startX = (W - gridW) / 2;
    const startY = MARGIN_TOP + (availH - gridH) / 2;

    // Preload all item images in parallel (3s timeout each) — avoids sequential hangs
    const { getItemInfo } = require('../../handlers/caravan/market/market-setup');
    const pageInfos = pageItems.map(listing => {
        const info = getItemInfo(listing.itemid || listing.itemID);
        return { listing, info };
    });
    await Promise.allSettled(pageInfos.map(({ info }) => loadCached(info?.imgPath)));

    for (let i = 0; i < pageItems.length; i++) {
        const col  = i % cols;
        const row  = Math.floor(i / cols);
        const cx   = startX + col * (cardW + GAP_X);
        const cy   = startY + row * (cardH + GAP_Y);
        const { listing, info } = pageInfos[i];

        await drawItemCard(ctx, listing, info, cx, cy, cardW, cardH);
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

// (RARITY_AR, RARITY_COLORS defined at top of file)

// ── roundRect ──
function rr2(ctx, x, y, width, height, radius = 0) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

// ── drawOrnateFrame ──
function drawOrnateFrame(ctx, x, y, w, h, color) {
    const bgGrad = ctx.createLinearGradient(x, y, x, y + h);
    bgGrad.addColorStop(0, 'rgba(15, 20, 30, 0.9)');
    bgGrad.addColorStop(1, 'rgba(5, 10, 15, 0.95)');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
    const cl = 20;
    ctx.lineWidth = 3;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(x, y + cl); ctx.lineTo(x, y); ctx.lineTo(x + cl, y);
    ctx.moveTo(x + w - cl, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + cl);
    ctx.moveTo(x + w, y + h - cl); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - cl, y + h);
    ctx.moveTo(x + cl, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - cl);
    ctx.stroke();
    ctx.shadowBlur = 0;
}

// ── localWrap (word-aware wrapping for Arabic) ──
function localWrap(ctx, text, maxWidth) {
    const paragraphs = text.split('\n');
    const lines = [];
    for (const para of paragraphs) {
        const words = para.split(/(\s+)/);
        let line = '';
        for (const w of words) {
            const test = line + w;
            if (ctx.measureText(test).width > maxWidth) {
                if (line) lines.push(line);
                // word itself exceeds width → split char by char
                if (!line && ctx.measureText(w).width > maxWidth) {
                    let chunk = '';
                    for (const ch of w) {
                        if (ctx.measureText(chunk + ch).width > maxWidth && chunk) {
                            lines.push(chunk);
                            chunk = ch;
                        } else {
                            chunk += ch;
                        }
                    }
                    if (chunk) line = chunk;
                } else {
                    line = w;
                }
            } else {
                line = test;
            }
        }
        if (line) lines.push(line);
    }
    return lines;
}

async function generateMarketItemCard(info, marketData) {
    const { available, price } = marketData;
    const rarity = info.rarity || 'Common';
    const rarityColor = RARITY_COLORS[rarity] || C.textD;
    const RAR = RARITY_AR[rarity] || rarity;

    const width = 1000, height = 600;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // ── Background ──
    const bgGrad = ctx.createRadialGradient(width/2, height/2, 100, width/2, height/2, 800);
    bgGrad.addColorStop(0, '#151520');
    bgGrad.addColorStop(1, '#05050A');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    const auraGrad = ctx.createRadialGradient(300, height/2, 50, 300, height/2, 400);
    auraGrad.addColorStop(0, `${rarityColor}40`);
    auraGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = auraGrad;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = rarityColor;
    ctx.lineWidth = 4;
    ctx.strokeRect(10, 10, width - 20, height - 20);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(15, 15, width - 30, height - 30);

    // ── Item Image with integrated price crest ──
    const imgSize = 350;
    const imgX = 100;
    const imgY = (height - imgSize) / 2;
    const imgCx = imgX + imgSize / 2;

    // Price crest sitting on top of the frame (integrated)
    const crestW = 220, crestH = 40;
    const cX = imgCx - crestW / 2;
    const cY = imgY - crestH + 4;

    const cGrad = ctx.createLinearGradient(cX, cY, cX, cY + crestH);
    cGrad.addColorStop(0, 'rgba(15, 20, 30, 0.95)');
    cGrad.addColorStop(1, 'rgba(5, 10, 15, 0.95)');
    ctx.fillStyle = cGrad;
    rr2(ctx, cX, cY, crestW, crestH, 8);
    ctx.fill();
    ctx.strokeStyle = rarityColor;
    ctx.lineWidth = 2;
    ctx.shadowColor = rarityColor;
    ctx.shadowBlur = 8;
    rr2(ctx, cX, cY, crestW, crestH, 8);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Corner accents on the crest (matching frame style)
    const cl2 = 12;
    ctx.lineWidth = 2;
    ctx.shadowColor = rarityColor;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(cX, cY + cl2); ctx.lineTo(cX, cY); ctx.lineTo(cX + cl2, cY);
    ctx.moveTo(cX + crestW - cl2, cY); ctx.lineTo(cX + crestW, cY); ctx.lineTo(cX + crestW, cY + cl2);
    ctx.moveTo(cX + crestW, cY + crestH - cl2); ctx.lineTo(cX + crestW, cY + crestH); ctx.lineTo(cX + crestW - cl2, cY + crestH);
    ctx.moveTo(cX + cl2, cY + crestH); ctx.lineTo(cX, cY + crestH); ctx.lineTo(cX, cY + crestH - cl2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = rarityColor;
    ctx.font = `bold 24px ${FA}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`💰 ${price.toLocaleString()}`, imgCx, cY + crestH / 2 + 1);

    drawOrnateFrame(ctx, imgX, imgY, imgSize, imgSize, rarityColor);

    const innerAura = ctx.createRadialGradient(imgX + imgSize/2, imgY + imgSize/2, 10, imgX + imgSize/2, imgY + imgSize/2, imgSize/1.5);
    innerAura.addColorStop(0, `${rarityColor}80`);
    innerAura.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = innerAura;
    ctx.fillRect(imgX, imgY, imgSize, imgSize);

    let imgDrawn = false;
    if (info.imgPath) {
        const img = await loadCached(info.imgPath);
        if (img) {
            if (info.fullImage) {
                ctx.save();
                ctx.beginPath();
                rr2(ctx, imgX + 4, imgY + 4, imgSize - 8, imgSize - 8, 20);
                ctx.clip();
                ctx.drawImage(img, imgX + 4, imgY + 4, imgSize - 8, imgSize - 8);
                ctx.restore();
            } else {
                const s = Math.min(imgSize - 16, 200);
                const ox = imgX + (imgSize - s) / 2;
                const oy = imgY + (imgSize - s) / 2;
                ctx.save();
                ctx.beginPath();
                rr2(ctx, ox, oy, s, s, 20);
                ctx.clip();
                ctx.drawImage(img, ox, oy, s, s);
                ctx.restore();
            }
            imgDrawn = true;
        }
    }
    if (!imgDrawn && info.emoji) {
        ctx.font = `100px ${FE}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#FFFFFF';
        ctx.shadowColor = rarityColor;
        ctx.shadowBlur = 15;
        ctx.fillText(info.emoji, imgX + imgSize / 2, imgY + imgSize / 2);
        ctx.shadowBlur = 0;
    }

    // ── Text Section ──
    const textX = imgX + imgSize + 50;
    let textY = 105;

    // Item name (centered above the underline)
    const nameCenter = (textX + width - 30) / 2;
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `bold 34px ${FA}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(info.name || 'عنصر غير معروف', nameCenter, textY);
    textY += 55;

    // Name underline
    const nameGrad = ctx.createLinearGradient(textX, textY, width - 30, textY);
    nameGrad.addColorStop(0, 'rgba(0,0,0,0)');
    nameGrad.addColorStop(0.3, rarityColor);
    nameGrad.addColorStop(0.7, rarityColor);
    nameGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.strokeStyle = nameGrad;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(width - 30, textY);
    ctx.lineTo(textX, textY);
    ctx.stroke();
    ctx.textAlign = 'right';
    textY += 30;

    // Rarity line
    ctx.fillStyle = '#E0E0E0';
    ctx.font = '28px "Bein"';
    ctx.fillText(`الـنـدرة:  ${RAR}`, width - 30, textY);
    textY += 45;

    // Quantity
    ctx.fillStyle = rarityColor;
    ctx.fillText(`الـمـتـبـقـي:  ${available.toLocaleString()}`, width - 30, textY);
    textY += 60;

    // Description box
    const descBoxX = textX;
    const descBoxY = textY;
    const descBoxW = width - 30 - descBoxX;
    const descBoxH = height - textY - 30;

    ctx.fillStyle = 'rgba(15, 20, 30, 0.7)';
    ctx.beginPath(); rr2(ctx, descBoxX, descBoxY, descBoxW, descBoxH, 15); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1; ctx.stroke();

    ctx.fillStyle = '#A8B8D0';
    ctx.font = '24px "Bein", "Emoji"';
    const description = info.description ? info.description.replace(/[\u{1F600}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F300}-\u{1F5FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FADF}\u{1F004}-\u{1F0CF}\u{2B00}-\u{2BFF}₿🪙]/gu, '').trim() : "عنصر غامض لا يُعرف عنه الكثير.. قد يكون له استخدام سري في الإمبراطورية!";
    const lines = localWrap(ctx, description, descBoxW - 40);

    for (let j = 0; j < lines.length; j++) {
        ctx.fillText(lines[j], width - 30 - 20, descBoxY + 20 + (j * 40));
    }

    return toBuf(canvas);
}

module.exports = { generateMarketCanvas, generateMarketItemCard, ITEMS_PER_PAGE };
