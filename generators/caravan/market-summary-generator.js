const { loadImage } = require('@napi-rs/canvas');
const {
    createCanvas, W, H, FA, FE, C,
    rr, drawBg, drawCornerAccents, divLine, M, truncate, toBuf,
} = require('./shared');

const RARITY_COLORS = {
    'Common':    '#A8B8D0',
    'Uncommon':  '#2ECC71',
    'Rare':      '#00C3FF',
    'Epic':      '#B968FF',
    'Legendary': '#FFD700',
};

function itemColor(rarity) { return RARITY_COLORS[rarity] || C.textD; }

// Strip Discord custom emoji syntax (<:name:id> / <a:name:id>) so canvas can render
function cleanForCanvas(str) {
    return String(str)
        .replace(/<a?:mora:\d+>/gi, 'مورا')
        .replace(/<a?:[^:]+:\d+>/g, '');
}

/**
 * @param {object} opts
 * @param {string}   opts.destName
 * @param {string}   opts.ownerName       — guild display name (nickname)
 * @param {string}   [opts.avatarUrl]     — Discord CDN avatar URL (png, 128px)
 * @param {Array}    opts.soldItems
 * @param {Array}    opts.unsoldItems
 * @param {number}   opts.totalEarned
 * @param {string[]} [opts.journeyRewards] — reward strings from distributeRewards()
 */
async function generateMarketSummaryCanvas({
    destName, ownerName, avatarUrl = null,
    soldItems, unsoldItems, totalEarned, journeyRewards = [],
}) {
    const canvas = createCanvas(W, H);
    const ctx    = canvas.getContext('2d');

    // Load avatar (best-effort; null is fine)
    let avatarImg = null;
    if (avatarUrl) {
        try { avatarImg = await loadImage(avatarUrl); } catch {}
    }

    await drawBg(ctx, 'marketbg');

    ctx.fillStyle = 'rgba(6,8,15,0.82)'; ctx.fillRect(0, 0, W, H);

    const glowG = ctx.createRadialGradient(W / 2, H / 3, 0, W / 2, H / 3, 500);
    glowG.addColorStop(0, 'rgba(245,197,24,0.10)'); glowG.addColorStop(1, 'transparent');
    ctx.fillStyle = glowG; ctx.fillRect(0, 0, W, H);

    drawCornerAccents(ctx);

    // ── Header (178px tall to hold avatar + name) ──
    const HEADER_H = 178;
    const headerGrad = ctx.createLinearGradient(0, 0, 0, HEADER_H);
    headerGrad.addColorStop(0, 'rgba(0,0,0,0.96)');
    headerGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = headerGrad; ctx.fillRect(0, 0, W, HEADER_H);

    // Gold separator line
    const lineG = ctx.createLinearGradient(0, 0, W, 0);
    lineG.addColorStop(0,    'transparent');
    lineG.addColorStop(0.15, C.gold + '66');
    lineG.addColorStop(0.35, C.gold);
    lineG.addColorStop(0.65, C.gold);
    lineG.addColorStop(0.85, C.gold + '66');
    lineG.addColorStop(1,    'transparent');
    ctx.fillStyle = lineG; ctx.fillRect(0, HEADER_H - 18, W, 2);

    ctx.save();
    ctx.fillStyle = C.gold; ctx.shadowColor = C.gold; ctx.shadowBlur = 16;
    ctx.translate(W / 2, HEADER_H - 17); ctx.rotate(Math.PI / 4); ctx.fillRect(-6, -6, 12, 12);
    ctx.restore();

    // Title
    ctx.shadowColor = C.gold + '55'; ctx.shadowBlur = 22;
    M(ctx, `📋 تقرير الرحلة النهائي — ${destName}`, W / 2, 46, 36, C.text);
    ctx.shadowBlur = 0;

    // ── Avatar + Name group (centred in lower header) ──
    const AVT_R  = 36;        // radius
    const GRP_CY = 116;       // vertical centre of the avatar+name row
    // We anchor the group so avatar+name sit around W/2
    const AVT_CX = W / 2 - 150;

    if (avatarImg) {
        ctx.save();
        // Outer glow ring
        ctx.shadowColor = C.gold + '99'; ctx.shadowBlur = 18;
        ctx.beginPath(); ctx.arc(AVT_CX, GRP_CY, AVT_R + 3, 0, Math.PI * 2);
        ctx.strokeStyle = C.gold + '88'; ctx.lineWidth = 2.5; ctx.stroke();
        ctx.shadowBlur = 0;
        // Circular clip for avatar image
        ctx.beginPath(); ctx.arc(AVT_CX, GRP_CY, AVT_R, 0, Math.PI * 2); ctx.clip();
        ctx.drawImage(avatarImg, AVT_CX - AVT_R, GRP_CY - AVT_R, AVT_R * 2, AVT_R * 2);
        ctx.restore();
        // Crisp ring on top
        ctx.beginPath(); ctx.arc(AVT_CX, GRP_CY, AVT_R, 0, Math.PI * 2);
        ctx.strokeStyle = C.gold + 'BB'; ctx.lineWidth = 2; ctx.stroke();
    } else {
        // Placeholder
        ctx.beginPath(); ctx.arc(AVT_CX, GRP_CY, AVT_R, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,215,0,0.10)'; ctx.fill();
        ctx.strokeStyle = C.gold + '55'; ctx.lineWidth = 2; ctx.stroke();
        ctx.font = `${AVT_R}px ${FE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = C.gold; ctx.fillText('👤', AVT_CX, GRP_CY);
    }

    // Name pill to the right of the avatar
    const pillX = AVT_CX + AVT_R + 18;
    const pillW = 360;
    const pillH = 56;
    rr(ctx, pillX, GRP_CY - pillH / 2, pillW, pillH, 16);
    ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fill();
    ctx.strokeStyle = C.gold + '33'; ctx.lineWidth = 1; ctx.stroke();

    // Label "التاجر" small
    ctx.font = `13px ${FA}`; ctx.direction = 'rtl';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillStyle = C.textD;
    ctx.fillText('التاجر', pillX + pillW - 16, GRP_CY - 11);

    // Display name (nickname)
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
    earnGrad.addColorStop(0,   'rgba(245,197,24,0.12)');
    earnGrad.addColorStop(0.5, 'rgba(245,197,24,0.26)');
    earnGrad.addColorStop(1,   'rgba(245,197,24,0.12)');
    ctx.fillStyle = earnGrad; ctx.fill();
    ctx.shadowColor = C.gold + '44'; ctx.shadowBlur = 24;
    rr(ctx, earnX, earnY, earnW, earnH, 22);
    ctx.strokeStyle = C.gold + '66'; ctx.lineWidth = 2; ctx.stroke();
    ctx.shadowBlur = 0;
    rr(ctx, earnX, earnY, earnW, 4, [22, 22, 0, 0]);
    ctx.fillStyle = C.gold + '88'; ctx.fill();
    ctx.restore();

    M(ctx, '💰 إجمالي أرباح السوق', W / 2, earnY + 28, 19, C.textD);
    ctx.shadowColor = C.gold + 'AA'; ctx.shadowBlur = 20;
    M(ctx, `${totalEarned.toLocaleString()} مورا`, W / 2, earnY + 68, 40, C.gold);
    ctx.shadowBlur = 0;

    // ── Column + Journey layout ──
    const HAS_JOURNEY = journeyRewards && journeyRewards.length > 0;
    const JRY_H  = HAS_JOURNEY ? 112 : 0;
    const COL_Y  = earnY + earnH + 16;
    const COL_H  = H - COL_Y - JRY_H - (HAS_JOURNEY ? 14 : 0) - 28;
    const LEFT_X  = 34;
    const LEFT_W  = W / 2 - 50;
    const RIGHT_X = W / 2 + 16;
    const RIGHT_W = W / 2 - 50;

    drawColumn(ctx, RIGHT_X, COL_Y, RIGHT_W, COL_H, soldItems,   '✅ البضائع المباعة',   C.green);
    drawColumn(ctx, LEFT_X,  COL_Y, LEFT_W,  COL_H, unsoldItems, '📦 البضائع المُرجعة', '#8A9AAA');

    if (HAS_JOURNEY) {
        drawJourneyRewards(ctx, LEFT_X, COL_Y + COL_H + 14, W - LEFT_X * 2, JRY_H, journeyRewards);
    }

    return toBuf(canvas);
}

// ── Column helper ──────────────────────────────────────────────────────────────

function drawColumn(ctx, x, y, w, h, items, title, accentColor) {
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
            ctx.fillStyle = 'rgba(255,255,255,0.028)';
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

// ── Journey Rewards Strip ──────────────────────────────────────────────────────

function drawJourneyRewards(ctx, x, y, w, h, rewards) {
    // Panel
    rr(ctx, x, y, w, h, 16);
    const jg = ctx.createLinearGradient(x, y, x + w, y + h);
    jg.addColorStop(0,   'rgba(80,40,190,0.18)');
    jg.addColorStop(0.5, 'rgba(110,55,230,0.25)');
    jg.addColorStop(1,   'rgba(80,40,190,0.18)');
    ctx.fillStyle = jg; ctx.fill();
    ctx.strokeStyle = '#8B5CF6' + '55'; ctx.lineWidth = 1.5; ctx.stroke();

    ctx.save();
    rr(ctx, x, y, w, 4, [16, 16, 0, 0]);
    ctx.fillStyle = '#8B5CF6' + 'AA'; ctx.fill();
    ctx.restore();

    // Title
    ctx.font = `bold 18px ${FA}`; ctx.direction = 'rtl';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#C4B5FD';
    ctx.shadowColor = '#8B5CF6'; ctx.shadowBlur = 10;
    ctx.fillText('🎒 مكافآت الرحلة', x + w - 18, y + 23);
    ctx.shadowBlur = 0;

    divLine(ctx, x + 16, y + 42, w - 32, '#8B5CF6' + '44');

    // Clean strings and lay them out in a 3-column grid
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

        if (cy + rowH > y + h - 4) break; // clip guard

        // Small pill background
        const label = cleaned[i];
        ctx.font = `bold 15px ${FA}`; ctx.direction = 'ltr';
        const tw = ctx.measureText(label).width;
        const pw = Math.min(tw + 24, cellW - 8);
        const ph = 22;
        const px = cx + (cellW - pw) / 2;

        rr(ctx, px, cy, pw, ph, 9);
        ctx.fillStyle = 'rgba(139,92,246,0.22)'; ctx.fill();
        ctx.strokeStyle = '#8B5CF6' + '55'; ctx.lineWidth = 1; ctx.stroke();

        ctx.direction = 'ltr'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#EDE9FE';
        ctx.fillText(label, px + pw / 2, cy + ph / 2);
    }
}

module.exports = { generateMarketSummaryCanvas };
