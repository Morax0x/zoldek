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

function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}

function stripRarity(str) {
    return String(str).replace(/\s*\((Common|Uncommon|Rare|Epic|Legendary)\)/gi, '');
}

function formatReward(str) {
    let s = String(str)
        .replace(/<a?:mora:\d+>/gi, 'مورا')
        .replace(/<a?:[^:]+:\d+>/g, '');
    s = stripRarity(s);
    return s.trim();
}

async function generateMarketSummaryCanvas({
    destName, destId = null, destColor = '#FFD700', ownerName, avatarUrl = null,
    soldItems, unsoldItems, totalEarned, journeyRewards = [],
}) {
    const canvas = createCanvas(W, H);
    const ctx    = canvas.getContext('2d');
    const TC = destColor;
    const HAS_MARKET = Number(totalEarned) > 0 || (soldItems && soldItems.length > 0);
    const MARGIN = 40;

    let avatarImg = null;
    if (avatarUrl) {
        try { avatarImg = await loadImage(avatarUrl); } catch {}
    }

    const destImg = await fetchImageSafe(destId || destName || '');
    await drawBg(ctx, 'marketbg');
    ctx.fillStyle = 'rgba(6,8,15,0.82)'; ctx.fillRect(0, 0, W, H);

    if (destImg) {
        ctx.save();
        ctx.globalAlpha = 0.12;
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

    // ═══════════════ HEADER ═══════════════
    const HEADER_H = 155;
    const hGrad = ctx.createLinearGradient(0, 0, 0, HEADER_H);
    hGrad.addColorStop(0, 'rgba(0,0,0,0.95)');
    hGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = hGrad; ctx.fillRect(0, 0, W, HEADER_H);

    const lineG = ctx.createLinearGradient(0, 0, W, 0);
    lineG.addColorStop(0,    'transparent');
    lineG.addColorStop(0.15, hexToRgba(TC, 0.3));
    lineG.addColorStop(0.35, TC);
    lineG.addColorStop(0.65, TC);
    lineG.addColorStop(0.85, hexToRgba(TC, 0.3));
    lineG.addColorStop(1,    'transparent');
    ctx.fillStyle = lineG; ctx.fillRect(0, HEADER_H - 16, W, 2);
    ctx.shadowColor = hexToRgba(TC, 0.5); ctx.shadowBlur = 30;
    ctx.fillRect(0, HEADER_H - 16, W, 2);
    ctx.shadowBlur = 0;

    ctx.save();
    ctx.fillStyle = TC; ctx.shadowColor = TC; ctx.shadowBlur = 20;
    ctx.translate(W / 2, HEADER_H - 15); ctx.rotate(Math.PI / 4); ctx.fillRect(-5, -5, 10, 10);
    ctx.restore();

    ctx.shadowColor = hexToRgba(TC, 0.4); ctx.shadowBlur = 25;
    M(ctx, `📋 ${destName}`, W / 2, 38, 34, C.text);

    ctx.font = `16px ${FA}`; ctx.direction = 'rtl';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = hexToRgba(TC, 0.7);
    ctx.shadowBlur = 0;
    ctx.fillText('تقرير الرحلة النهائي', W / 2, 66);

    const AVT_R  = 32;
    const AVT_CY = 110;
    const AVT_CX = MARGIN + AVT_R + 10;

    if (avatarImg) {
        ctx.save();
        ctx.shadowColor = hexToRgba(TC, 0.5); ctx.shadowBlur = 14;
        ctx.beginPath(); ctx.arc(AVT_CX, AVT_CY, AVT_R + 2, 0, Math.PI * 2);
        ctx.strokeStyle = hexToRgba(TC, 0.5); ctx.lineWidth = 2; ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.beginPath(); ctx.arc(AVT_CX, AVT_CY, AVT_R, 0, Math.PI * 2); ctx.clip();
        ctx.drawImage(avatarImg, AVT_CX - AVT_R, AVT_CY - AVT_R, AVT_R * 2, AVT_R * 2);
        ctx.restore();
    } else {
        ctx.beginPath(); ctx.arc(AVT_CX, AVT_CY, AVT_R, 0, Math.PI * 2);
        ctx.fillStyle = hexToRgba(TC, 0.15); ctx.fill();
        ctx.font = `${AVT_R}px ${FE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = TC; ctx.fillText('👤', AVT_CX, AVT_CY);
    }

    ctx.font = `13px ${FA}`; ctx.direction = 'rtl';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillStyle = C.textD;
    ctx.fillText('التاجر', AVT_CX + AVT_R + 12, AVT_CY - 10);

    ctx.font = `bold 19px ${FA}`; ctx.direction = 'rtl';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillStyle = C.text;
    ctx.fillText(truncate(ownerName, 18), AVT_CX + AVT_R + 12, AVT_CY + 11);

    // ═══════════════ STATS CARDS ═══════════════
    let yPos = HEADER_H + 18;
    const HAS_JOURNEY = journeyRewards && journeyRewards.length > 0;

    if (HAS_MARKET) {
        const soldCount = soldItems ? soldItems.reduce((s, i) => s + Number(i.quantitySold || 0), 0) : 0;
        const unsoldCount = unsoldItems ? unsoldItems.reduce((s, i) => s + (Number(i.quantity) - Number(i.quantitySold || 0)), 0) : 0;

        const cards = [
            { icon: '💰', label: 'اجمالي الربح', value: `${totalEarned.toLocaleString()}`, unit: 'مورا', color: TC },
            { icon: '✅', label: 'بضائع مباعة',  value: String(soldCount),   unit: 'قطعة', color: '#2ECC71' },
            { icon: '📦', label: 'بضائع مرتجعة', value: String(unsoldCount), unit: 'قطعة', color: '#8A9AAA' },
        ];

        const CARD_W = 340;
        const CARD_H = 95;
        const totalW = cards.length * CARD_W + (cards.length - 1) * 20;
        const startX = (W - totalW) / 2;
        const glowA = hexToRgba(TC, 0.25);

        for (let i = 0; i < cards.length; i++) {
            const cx = startX + i * (CARD_W + 20);
            const cardData = cards[i];
            const cc = cardData.color;

            ctx.shadowColor = cc + '33'; ctx.shadowBlur = 20;
            rr(ctx, cx, yPos, CARD_W, CARD_H, 18);
            const cGrad = ctx.createLinearGradient(cx, yPos, cx + CARD_W, yPos + CARD_H);
            cGrad.addColorStop(0, hexToRgba(cc, 0.10));
            cGrad.addColorStop(0.5, hexToRgba(cc, 0.18));
            cGrad.addColorStop(1, hexToRgba(cc, 0.10));
            ctx.fillStyle = cGrad; ctx.fill();
            ctx.shadowBlur = 0;
            ctx.strokeStyle = hexToRgba(cc, 0.3); ctx.lineWidth = 1.5;
            rr(ctx, cx, yPos, CARD_W, CARD_H, 18); ctx.stroke();

            ctx.font = `28px ${FE}`; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
            ctx.fillStyle = cc; ctx.shadowColor = cc; ctx.shadowBlur = 10;
            ctx.fillText(cardData.icon, cx + CARD_W - 18, yPos + 14);
            ctx.shadowBlur = 0;

            ctx.font = `14px ${FA}`; ctx.direction = 'rtl';
            ctx.textAlign = 'right'; ctx.fillStyle = C.textD;
            ctx.fillText(cardData.label, cx + CARD_W - 50, yPos + 16);

            ctx.font = `bold 30px ${FA}`; ctx.direction = 'rtl';
            ctx.textAlign = 'right'; ctx.fillStyle = C.text;
            ctx.fillText(cardData.value, cx + CARD_W - 50, yPos + 44);

            ctx.font = `14px ${FA}`; ctx.direction = 'rtl';
            ctx.textAlign = 'right'; ctx.fillStyle = hexToRgba(cc, 0.7);
            ctx.fillText(cardData.unit, cx + CARD_W - 50, yPos + 74);
        }
        yPos += CARD_H + 20;
    }

    // ═══════════════ JOURNEY REWARDS ═══════════════
    if (HAS_JOURNEY) {
        const JR_PAD = 32;
        const JR_X = MARGIN;
        const JR_W = W - MARGIN * 2;
        const JR_H = HAS_MARKET ? 125 : Math.min(125 + Math.ceil(journeyRewards.length / 5) * 32, 200);

        rr(ctx, JR_X, yPos, JR_W, JR_H, 16);
        const jGrad = ctx.createLinearGradient(JR_X, yPos, JR_X + JR_W, yPos + JR_H);
        jGrad.addColorStop(0,   hexToRgba(TC, 0.10));
        jGrad.addColorStop(0.5, hexToRgba(TC, 0.18));
        jGrad.addColorStop(1,   hexToRgba(TC, 0.10));
        ctx.fillStyle = jGrad; ctx.fill();
        ctx.strokeStyle = hexToRgba(TC, 0.25); ctx.lineWidth = 1.5;
        rr(ctx, JR_X, yPos, JR_W, JR_H, 16); ctx.stroke();

        ctx.save();
        rr(ctx, JR_X, yPos, JR_W, 4, [16, 16, 0, 0]);
        ctx.fillStyle = hexToRgba(TC, 0.5); ctx.fill();
        ctx.restore();

        ctx.font = `bold 16px ${FA}`; ctx.direction = 'rtl';
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        ctx.fillStyle = hexToRgba(TC, 0.85); ctx.shadowColor = TC; ctx.shadowBlur = 8;
        ctx.fillText('🎒 مكافآت الرحلة', JR_X + JR_W - 16, yPos + 22);
        ctx.shadowBlur = 0;

        divLine(ctx, JR_X + 16, yPos + 40, JR_W - 32, hexToRgba(TC, 0.2));

        const cleaned = journeyRewards.map(formatReward).filter(Boolean);
        const PILL_H = 26;
        const PILL_GAP = 8;
        const ROW_GAP = 10;
        const maxPillW = 220;
        const pillsPerRow = 5;
        let px = JR_X + 16;
        let py = yPos + 52;

        for (let i = 0; i < cleaned.length; i++) {
            const label = cleaned[i];
            ctx.font = `bold 14px ${FA}`;
            const tw = ctx.measureText(label.replace(/[\u{1F000}-\u{1FFFF}]/gu, '')).width + 30;
            const pw = Math.min(tw, maxPillW);

            if (px + pw > JR_X + JR_W - 16) {
                px = JR_X + 16;
                py += PILL_H + ROW_GAP;
                if (py + PILL_H > yPos + JR_H - 8) break;
            }

            rr(ctx, px, py, pw, PILL_H, 13);
            ctx.fillStyle = hexToRgba(TC, 0.15); ctx.fill();
            ctx.strokeStyle = hexToRgba(TC, 0.25); ctx.lineWidth = 1; ctx.stroke();

            ctx.direction = 'ltr'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
            ctx.fillStyle = hexToRgba(TC, 0.9); ctx.font = `bold 13px ${FA}`;
            ctx.fillText(label, px + pw - 10, py + PILL_H / 2);

            px += pw + PILL_GAP;
        }

        yPos += JR_H + 16;
    }

    // ═══════════════ MARKET COLUMNS ═══════════════
    if (HAS_MARKET) {
        const COL_Y = yPos;
        const COL_H = H - COL_Y - 20;
        const HALF_W = (W - MARGIN * 2 - 20) / 2;

        drawColumn(ctx, MARGIN, COL_Y, HALF_W, COL_H, unsoldItems, '📦 البضائع المرتجعة', '#8A9AAA', TC);
        drawColumn(ctx, MARGIN + HALF_W + 20, COL_Y, HALF_W, COL_H, soldItems, '✅ البضائع المباعة', '#2ECC71', TC);
    }

    return toBuf(canvas);
}

function drawColumn(ctx, x, y, w, h, items, title, accentColor, themeColor) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 16;
    rr(ctx, x, y, w, h, 16);
    const bg = ctx.createLinearGradient(x, y, x, y + h);
    bg.addColorStop(0, 'rgba(10,14,28,0.85)');
    bg.addColorStop(1, 'rgba(4,6,14,0.95)');
    ctx.fillStyle = bg; ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = accentColor + '44'; ctx.lineWidth = 1.5;
    rr(ctx, x, y, w, h, 16); ctx.stroke();
    ctx.restore();

    ctx.save();
    rr(ctx, x, y, w, 4, [16, 16, 0, 0]);
    ctx.fillStyle = accentColor + '77'; ctx.fill();
    ctx.restore();

    ctx.font = `bold 19px ${FA}`; ctx.direction = 'rtl';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = accentColor; ctx.shadowColor = accentColor + '33'; ctx.shadowBlur = 10;
    ctx.fillText(title, x + w / 2, y + 26);
    ctx.shadowBlur = 0;

    divLine(ctx, x + 14, y + 48, w - 28, accentColor + '22');

    if (!items || items.length === 0) {
        ctx.font = `18px ${FA}`; ctx.direction = 'rtl';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = C.textD;
        ctx.fillText('—', x + w / 2, y + h / 2);
        return;
    }

    const rowH = 48;
    const maxRows = Math.max(1, Math.floor((h - 60) / rowH));
    const visible = items.slice(0, maxRows);
    const startY = y + 58;

    for (let i = 0; i < visible.length; i++) {
        const item  = visible[i];
        const rowY  = startY + i * rowH;
        const midY  = rowY + rowH / 2;
        const color = itemColor(item.rarity);
        const sold  = Number(item.quantitySold || 0);
        const avail = Number(item.quantity) - sold;
        const price = Number(item.pricePerUnit || 0);
        const name  = truncate(item.itemName || item.itemId || '?', 18);
        const emoji = item.itemEmoji || '📦';

        if (i % 2 === 0) {
            ctx.fillStyle = hexToRgba(themeColor, 0.025);
            ctx.fillRect(x + 4, rowY + 1, w - 8, rowH - 2);
        }

        ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 6;
        ctx.beginPath(); ctx.arc(x + 16, midY, 4, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;

        ctx.font = `18px ${FE}`; ctx.direction = 'ltr';
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#FFF';
        ctx.fillText(emoji, x + 26, midY);

        ctx.font = `bold 15px ${FA}`; ctx.direction = 'rtl';
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = C.text;
        ctx.fillText(name, x + 48, midY - 9);

        ctx.font = `12px ${FA}`; ctx.direction = 'rtl'; ctx.fillStyle = C.textD;
        if (sold > 0) {
            ctx.fillText(`×${sold} — ${(sold * price).toLocaleString()} مورا`, x + 48, midY + 10);
        } else {
            ctx.fillText(`×${avail} مرتجعة`, x + 48, midY + 10);
        }

        ctx.font = `bold 13px ${FA}`; ctx.direction = 'rtl';
        ctx.textAlign = 'left'; ctx.fillStyle = accentColor;
        ctx.fillText(`${price.toLocaleString()}/وحدة`, x + w - 14, midY);
    }

    if (items.length > maxRows) {
        ctx.font = `13px ${FA}`; ctx.direction = 'rtl';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = C.textD;
        ctx.fillText(`+ ${items.length - maxRows} عنصر آخر`, x + w / 2, y + h - 12);
    }
}

module.exports = { generateMarketSummaryCanvas };
