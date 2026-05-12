const { loadImage } = require('@napi-rs/canvas');
const {
    createCanvas, W, H, FA, FE, C,
    rr, drawBg, drawCornerAccents, divLine, truncate, toBuf, fetchImageSafe,
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

// دالة مخصصة للرسم الاحترافي للكلمات بدون انعكاس
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

async function generateMarketSummaryCanvas({
    destName, destId = null, destColor = '#FFD700', ownerName, avatarUrl = null,
    soldItems, unsoldItems, totalEarned, journeyRewards = [],
}) {
    const canvas = createCanvas(W, H);
    const ctx    = canvas.getContext('2d');
    const TC = destColor;
    const HAS_MARKET = Number(totalEarned) > 0 || (soldItems && soldItems.length > 0) || (unsoldItems && unsoldItems.length > 0);
    const MARGIN = 50;

    let avatarImg = null;
    if (avatarUrl) {
        try { avatarImg = await loadImage(avatarUrl); } catch {}
    }

    // 1. الخلفية السينمائية
    const destImg = await fetchImageSafe(destId || destName || '');
    await drawBg(ctx, 'marketbg');
    ctx.fillStyle = 'rgba(6, 9, 16, 0.88)'; 
    ctx.fillRect(0, 0, W, H);

    if (destImg) {
        ctx.save();
        ctx.globalAlpha = 0.15;
        const scale = Math.max(W / destImg.width, H / destImg.height);
        const dx = (W - destImg.width * scale) / 2;
        const dy = (H - destImg.height * scale) / 2;
        ctx.drawImage(destImg, dx, dy, destImg.width * scale, destImg.height * scale);
        ctx.restore();
    }

    const glowG = ctx.createRadialGradient(W / 2, 200, 0, W / 2, 200, 800);
    glowG.addColorStop(0, hexToRgba(TC, 0.12));
    glowG.addColorStop(1, 'transparent');
    ctx.fillStyle = glowG; ctx.fillRect(0, 0, W, H);

    drawCornerAccents(ctx);

    // 2. الهيدر (العنوان ومعلومات اللاعب)
    drawText(ctx, `تقرير السوق النهائي — ${destName}`, W / 2, 60, `bold 36px ${FA}`, TC, 'center', 20);
    
    // شريط معلومات التاجر في الأعلى يمين
    const topBoxY = 40;
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    rr(ctx, W - MARGIN - 300, topBoxY, 300, 60, 30); ctx.fill();
    ctx.strokeStyle = hexToRgba(TC, 0.3); ctx.lineWidth = 1.5;
    rr(ctx, W - MARGIN - 300, topBoxY, 300, 60, 30); ctx.stroke();

    if (avatarImg) {
        ctx.save();
        ctx.beginPath(); ctx.arc(W - MARGIN - 30, topBoxY + 30, 24, 0, Math.PI * 2); ctx.clip();
        ctx.drawImage(avatarImg, W - MARGIN - 54, topBoxY + 6, 48, 48);
        ctx.restore();
        ctx.beginPath(); ctx.arc(W - MARGIN - 30, topBoxY + 30, 24, 0, Math.PI * 2);
        ctx.strokeStyle = TC; ctx.lineWidth = 2; ctx.stroke();
    }
    
    drawText(ctx, "التاجر", W - MARGIN - 70, topBoxY + 20, `14px ${FA}`, C.textD, 'right');
    drawText(ctx, truncate(ownerName, 16), W - MARGIN - 70, topBoxY + 42, `bold 18px ${FA}`, '#FFF', 'right');

    // 3. بطاقات الإحصائيات (Stats Cards)
    let yPos = 140;
    
    if (HAS_MARKET) {
        const soldCount = soldItems ? soldItems.reduce((s, i) => s + Number(i.quantitySold || 0), 0) : 0;
        const unsoldCount = unsoldItems ? unsoldItems.reduce((s, i) => s + (Number(i.quantity) - Number(i.quantitySold || 0)), 0) : 0;

        const cards = [
            { icon: '📦', label: 'مرتجعات', value: String(unsoldCount), color: '#E74C3C' },
            { icon: '✅', label: 'مبيعات', value: String(soldCount), color: '#2ECC71' },
            { icon: '💰', label: 'صافي الأرباح', value: `${totalEarned.toLocaleString()}`, color: TC }
        ];

        const CARD_W = (W - (MARGIN * 2) - 40) / 3; // 3 بطاقات متساوية
        const CARD_H = 100;
        
        for (let i = 0; i < cards.length; i++) {
            const cx = MARGIN + i * (CARD_W + 20);
            const cc = cards[i].color;

            // خلفية البطاقة
            ctx.fillStyle = 'rgba(10, 15, 25, 0.7)';
            rr(ctx, cx, yPos, CARD_W, CARD_H, 20); ctx.fill();
            
            // إطار وتوهج سفلي
            ctx.strokeStyle = hexToRgba(cc, 0.4); ctx.lineWidth = 2;
            rr(ctx, cx, yPos, CARD_W, CARD_H, 20); ctx.stroke();
            
            rr(ctx, cx, yPos + CARD_H - 6, CARD_W, 6, [0, 0, 20, 20]);
            ctx.fillStyle = cc; ctx.fill();

            drawText(ctx, cards[i].icon, cx + 25, yPos + CARD_H / 2, `40px ${FE}`, '#FFF', 'left');
            drawText(ctx, cards[i].label, cx + CARD_W - 25, yPos + 35, `16px ${FA}`, C.textD, 'right');
            drawText(ctx, cards[i].value, cx + CARD_W - 25, yPos + 65, `bold 28px ${FA}`, cc, 'right', 10);
        }
        yPos += CARD_H + 30;
    }

    // 4. مكافآت الرحلة الأساسية (Journey Rewards)
    const HAS_JOURNEY = journeyRewards && journeyRewards.length > 0;
    if (HAS_JOURNEY) {
        const JR_H = HAS_MARKET ? 100 : Math.min(100 + Math.ceil(journeyRewards.length / 4) * 45, 250);
        
        ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
        rr(ctx, MARGIN, yPos, W - (MARGIN * 2), JR_H, 16); ctx.fill();
        ctx.strokeStyle = hexToRgba(TC, 0.2); ctx.lineWidth = 1.5;
        rr(ctx, MARGIN, yPos, W - (MARGIN * 2), JR_H, 16); ctx.stroke();

        drawText(ctx, '🎒 غنائم الرحلة المكتسبة', W - MARGIN - 20, yPos + 30, `bold 18px ${FA}`, TC, 'right');
        divLine(ctx, MARGIN + 20, yPos + 50, W - (MARGIN * 2) - 40, 'rgba(255,255,255,0.08)');

        const cleaned = journeyRewards.map(formatReward).filter(Boolean);
        let px = W - MARGIN - 30;
        let py = yPos + 75;

        for (let i = 0; i < cleaned.length; i++) {
            const label = cleaned[i];
            ctx.font = `bold 14px ${FA}`;
            const tw = ctx.measureText(label.replace(/[\u{1F000}-\u{1FFFF}]/gu, '')).width + 50;
            const pw = Math.min(tw, 240);

            if (px - pw < MARGIN + 20) {
                px = W - MARGIN - 30;
                py += 40;
                if (py > yPos + JR_H - 10) break; // منع تجاوز الإطار
            }

            rr(ctx, px - pw, py - 18, pw, 36, 18);
            ctx.fillStyle = hexToRgba(TC, 0.15); ctx.fill();
            ctx.strokeStyle = hexToRgba(TC, 0.4); ctx.stroke();

            drawText(ctx, label, px - 15, py, `bold 14px ${FA}`, '#FFF', 'right');
            px -= (pw + 15);
        }
        yPos += JR_H + 30;
    }

    // 5. أعمدة السوق (تفصيل المبيعات والمرتجعات)
    if (HAS_MARKET) {
        const COL_Y = yPos;
        const COL_H = H - COL_Y - MARGIN;
        const COL_W = (W - (MARGIN * 2) - 30) / 2;

        // العمود الأيمن (المباعة) والعمود الأيسر (المرتجعة) - لتوافق القراءة العربية
        drawColumn(ctx, W - MARGIN - COL_W, COL_Y, COL_W, COL_H, soldItems, 'البضائع المُباعة ✅', '#2ECC71', true);
        drawColumn(ctx, MARGIN, COL_Y, COL_W, COL_H, unsoldItems, 'البضائع المُرتجعة 📦', '#E74C3C', false);
    }

    return toBuf(canvas);
}

function drawColumn(ctx, x, y, w, h, items, title, accentColor, isSold) {
    // خلفية العمود
    ctx.fillStyle = 'rgba(10, 14, 25, 0.8)';
    rr(ctx, x, y, w, h, 20); ctx.fill();
    ctx.strokeStyle = hexToRgba(accentColor, 0.3); ctx.lineWidth = 2;
    rr(ctx, x, y, w, h, 20); ctx.stroke();

    // الترويسة الملونة
    ctx.fillStyle = accentColor;
    rr(ctx, x, y, w, 6, [20, 20, 0, 0]); ctx.fill();
    
    const titleBg = ctx.createLinearGradient(x, y, x, y + 50);
    titleBg.addColorStop(0, hexToRgba(accentColor, 0.15));
    titleBg.addColorStop(1, 'transparent');
    ctx.fillStyle = titleBg; ctx.fillRect(x, y + 6, w, 50);

    drawText(ctx, title, x + w / 2, y + 35, `bold 22px ${FA}`, accentColor, 'center', 10);
    divLine(ctx, x + 20, y + 65, w - 40, 'rgba(255,255,255,0.05)');

    if (!items || items.length === 0) {
        drawText(ctx, isSold ? 'لم يتم بيع أي بضاعة' : 'تم بيع كل شيء بنجاح!', x + w / 2, y + h / 2, `18px ${FA}`, C.textD, 'center');
        return;
    }

    const rowH = 65;
    const maxRows = Math.floor((h - 90) / rowH);
    const visible = items.slice(0, maxRows);
    const startY = y + 80;

    for (let i = 0; i < visible.length; i++) {
        const item = visible[i];
        const rowY = startY + i * rowH;
        const midY = rowY + rowH / 2;

        const color = itemColor(item.rarity);
        const price = Number(item.pricePerUnit || 0);
        const sold = Number(item.quantitySold || 0);
        const avail = Number(item.quantity) - sold;
        const name = truncate(item.itemName || item.itemId || '?', 16);
        const emoji = item.itemEmoji || '📦';

        // تظليل صفوف متبادل
        if (i % 2 === 0) {
            ctx.fillStyle = 'rgba(255,255,255,0.02)';
            rr(ctx, x + 10, rowY, w - 20, rowH - 5, 10); ctx.fill();
        }

        // 1. الإيموجي والاسم (مثبت على اليمين)
        const rightEdge = x + w - 20;
        drawText(ctx, emoji, rightEdge, midY, `24px ${FE}`, '#FFF', 'right');
        drawText(ctx, name, rightEdge - 40, midY - 12, `bold 17px ${FA}`, '#FFF', 'right');

        // 2. تفاصيل الكمية تحت الاسم
        const qtyText = isSold ? `الكمية المباعة: ${sold}` : `الباقي بالمخزن: ${avail}`;
        drawText(ctx, qtyText, rightEdge - 40, midY + 12, `14px ${FA}`, C.textD, 'right');

        // 3. السعر الإجمالي (مثبت على اليسار) لمنع دخول الأرقام في الحروف
        const leftEdge = x + 20;
        if (isSold) {
            const total = sold * price;
            drawText(ctx, total.toLocaleString(), leftEdge, midY - 10, `bold 18px ${FA}`, '#A0D468', 'left');
            drawText(ctx, "مورا", leftEdge, midY + 12, `13px ${FA}`, '#A0D468', 'left');
        } else {
            drawText(ctx, "مُرتجع", leftEdge, midY, `16px ${FA}`, '#E74C3C', 'left');
        }

        // نقطة لون الندرة
        ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.arc(leftEdge + 60, midY, 5, 0, Math.PI*2); ctx.fill();
        ctx.shadowBlur = 0;
    }

    if (items.length > maxRows) {
        drawText(ctx, `+ ${items.length - maxRows} بضائع أخرى...`, x + w / 2, y + h - 20, `14px ${FA}`, C.textD, 'center');
    }
}

module.exports = { generateMarketSummaryCanvas };
