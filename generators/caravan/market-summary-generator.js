const {
    createCanvas, W, H, C, FE,
    rr, drawBg, drawCornerAccents, divLine, truncate, toBuf
} = require('./shared');

// خطوط الإمبراطورية المعتمدة
const FONT_WORD  = '"aaa"';
const FONT_NUM   = '"ReemKufi-Regular"';
const FONT_EMOJI = '"Emoji"';

// دالة مساعدة للرسم الدقيق مع الظلال
function drawText(ctx, text, x, y, font, color, align = 'center', glow = 0) {
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

/**
 * @param {object} opts
 * @param {string}  opts.destName
 * @param {string}  opts.ownerName
 * @param {Array}   opts.soldItems    
 * @param {Array}   opts.unsoldItems  
 * @param {number}  opts.totalEarned
 * @returns {Promise<Buffer>}
 */
async function generateMarketSummaryCanvas({ destName, ownerName, soldItems, unsoldItems, totalEarned }) {
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    // 1. الخلفية الأساسية والتأثيرات السينمائية
    await drawBg(ctx, 'marketbg');

    // تغشية داكنة فاخرة
    ctx.fillStyle = 'rgba(6, 8, 15, 0.88)';
    ctx.fillRect(0, 0, W, H);

    // إضاءة مركزية خلف الأرباح
    const glowG = ctx.createRadialGradient(W / 2, H / 3, 0, W / 2, H / 3, 450);
    glowG.addColorStop(0, 'rgba(255, 215, 0, 0.12)');
    glowG.addColorStop(1, 'transparent');
    ctx.fillStyle = glowG;
    ctx.fillRect(0, 0, W, H);

    drawCornerAccents(ctx);

    // 2. ترويسة التقرير (Header)
    drawText(ctx, `تقرير السوق النهائي — ${destName}`, W / 2, 55, `36px ${FONT_WORD}`, C.gold, 'center', 20);
    
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    rr(ctx, W / 2 - 160, 85, 320, 36, 18); ctx.fill();
    drawText(ctx, `التاجر: ${ownerName}`, W / 2, 103, `20px ${FONT_WORD}`, '#E0E0E0', 'center');

    // 3. لوحة الأرباح الإجمالية (Center Glassmorphism Panel)
    const panelW = 540;
    const panelH = 115;
    const panelX = (W - panelW) / 2;
    const panelY = 145;

    ctx.fillStyle = 'rgba(20, 25, 35, 0.75)';
    rr(ctx, panelX, panelY, panelW, panelH, 20); ctx.fill();

    const pBorder = ctx.createLinearGradient(panelX, panelY, panelX + panelW, panelY + panelH);
    pBorder.addColorStop(0, '#FFD700');
    pBorder.addColorStop(0.5, '#FFF6CC');
    pBorder.addColorStop(1, '#B8860B');
    ctx.strokeStyle = pBorder;
    ctx.lineWidth = 2;
    rr(ctx, panelX, panelY, panelW, panelH, 20); ctx.stroke();

    drawText(ctx, "إجمالي الأرباح الصافية", W / 2, panelY + 32, `22px ${FONT_WORD}`, '#CCCCCC', 'center');

    // دمج الأرقام بخطها الخاص مع العملة بخطها الخاص
    const earnedStr = totalEarned.toLocaleString();
    ctx.font = `44px ${FONT_NUM}`;
    const numWidth = ctx.measureText(earnedStr).width;
    
    // رسم الرقم
    drawText(ctx, earnedStr, W / 2 - 20, panelY + 78, `44px ${FONT_NUM}`, C.gold, 'center', 18);
    // رسم العملة بجانبه
    drawText(ctx, "مورا", W / 2 + (numWidth / 2), panelY + 78, `22px ${FONT_WORD}`, C.gold, 'left', 10);

    // 4. الأعمدة (Columns)
    const colY = 285;
    const colH = H - colY - 35;
    const colW = (W / 2) - 45;

    // تم وضع عمود "المباعة" على اليمين لتوافق القراءة العربية
    const rightColX = W / 2 + 15;
    drawColumn(ctx, rightColX, colY, colW, colH, soldItems, "البضائع المُباعة ✅", '#2ECC71', true);

    const leftColX = 30;
    drawColumn(ctx, leftColX, colY, colW, colH, unsoldItems, "البضائع المُرتجعة 📦", '#E74C3C', false);

    return toBuf(canvas);
}

function drawColumn(ctx, x, y, w, h, items, titleText, accentColor, isSoldColumn) {
    // خلفية العمود
    ctx.fillStyle = 'rgba(10, 15, 26, 0.65)';
    rr(ctx, x, y, w, h, 20); ctx.fill();

    ctx.strokeStyle = accentColor + '55';
    ctx.lineWidth = 2;
    rr(ctx, x, y, w, h, 20); ctx.stroke();

    // شريط الترويسة الملون
    ctx.fillStyle = accentColor + '22';
    rr(ctx, x, y, w, 60, [20, 20, 0, 0]); ctx.fill();
    
    ctx.fillStyle = accentColor;
    rr(ctx, x, y, w, 5, [20, 20, 0, 0]); ctx.fill();

    drawText(ctx, titleText, x + w / 2, y + 33, `22px ${FONT_WORD}`, accentColor, 'center', 12);
    divLine(ctx, x + 25, y + 60, w - 50, 'rgba(255,255,255,0.1)');

    if (!items || items.length === 0) {
        const msg = isSoldColumn ? "لم يتم بيع أي بضاعة" : "تم بيع جميع البضائع بالكامل!";
        drawText(ctx, msg, x + w / 2, y + h / 2, `20px ${FONT_WORD}`, '#888888', 'center');
        return;
    }

    const rowH = 65;
    const startY = y + 70;
    const maxRows = Math.floor((h - 90) / rowH);
    const visible = items.slice(0, maxRows);

    for (let i = 0; i < visible.length; i++) {
        const item = visible[i];
        const rowY = startY + i * rowH;
        const midY = rowY + rowH / 2;

        // تظليل صفوف متبادل
        if (i % 2 === 0) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
            rr(ctx, x + 12, rowY, w - 24, rowH - 6, 12); ctx.fill();
        }

        const name = truncate(item.itemName || item.itemId || '?', 14);
        const emoji = item.itemEmoji || '📦';
        const price = Number(item.pricePerUnit || 0);
        const sold = Number(item.quantitySold || 0);
        const avail = Number(item.quantity) - sold;

        // 1. الإيموجي والاسم (أقصى اليمين)
        const rightEdge = x + w - 25;
        drawText(ctx, emoji, rightEdge, midY, `26px ${FONT_EMOJI}`, '#FFFFFF', 'right');
        drawText(ctx, name, rightEdge - 40, midY - 2, `18px ${FONT_WORD}`, '#FFFFFF', 'right');

        // 2. الكمية (الوسط)
        const qtyX = x + 145;
        const qtyVal = isSoldColumn ? sold.toString() : avail.toString();
        drawText(ctx, "x", qtyX, midY, `16px ${FONT_WORD}`, '#AAAAAA', 'right');
        drawText(ctx, qtyVal, qtyX + 6, midY, `18px ${FONT_NUM}`, '#FFFFFF', 'left');

        // 3. الإجمالي / الحالة (أقصى اليسار)
        const leftEdge = x + 25;
        if (isSoldColumn) {
            const totalVal = sold * price;
            drawText(ctx, totalVal.toLocaleString(), leftEdge, midY, `18px ${FONT_NUM}`, '#A0D468', 'left');
            
            ctx.font = `18px ${FONT_NUM}`;
            const valW = ctx.measureText(totalVal.toLocaleString()).width;
            drawText(ctx, "مورا", leftEdge + valW + 6, midY, `14px ${FONT_WORD}`, '#A0D468', 'left');
        } else {
            drawText(ctx, "مُرتجع", leftEdge, midY, `16px ${FONT_WORD}`, '#E74C3C', 'left');
        }
    }

    // رسالة الفائض
    if (items.length > maxRows) {
        drawText(ctx, `... وهناك ${items.length - maxRows} بضائع أخرى`, x + w / 2, y + h - 22, `16px ${FONT_WORD}`, '#999999', 'center');
    }
}

module.exports = { generateMarketSummaryCanvas };
