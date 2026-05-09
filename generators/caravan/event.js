const { loadImage } = require('@napi-rs/canvas');
const {
    createCanvas, W, H, C, FE,
    drawBg, drawHeader, drawCornerAccents, drawPanel,
    divLine, fetchImageSafe, toBuf,
    M, rr, truncate, parseSafeArray
} = require('./shared');

// خطوط الإمبراطورية المعتمدة
const FONT_WORD = '"aaa"';
const FONT_NUM  = '"ReemKufi-Regular"';
const FONT_EMOJI = '"Emoji"';

// دالة الرسم الدقيق للنصوص المختلطة (فصل الكلمة عن الرقم لمنع الانعكاس)
function drawRewardRow(ctx, icon, label, value, x, y, color) {
    ctx.font = `24px ${FONT_EMOJI}`;
    ctx.textAlign = 'right';
    ctx.fillStyle = '#FFF';
    ctx.fillText(icon, x + 350, y + 32);

    ctx.font = `22px ${FONT_WORD}`;
    ctx.textAlign = 'right';
    ctx.fillStyle = '#BBB';
    ctx.fillText(label, x + 310, y + 32);

    // رسم الرقم بخطه الخاص لمنع انعكاس السطر
    ctx.font = `26px ${FONT_NUM}`;
    ctx.textAlign = 'left';
    ctx.fillStyle = color;
    ctx.fillText(value, x + 20, y + 32);
}

async function generateCaravanEvent(user, dest, eventType, data = {}) {
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    const eventConfig = {
        'dispatch':    { title: 'انطلاق القافلة الملكية',      color: C.gold,   icon: '🐪', desc: 'بدأت القافلة رحلتها متجهة نحو' },
        'arrive':      { title: 'وصول القافلة المظفرة',     color: C.green,  icon: '🎉', desc: 'عادت القافلة محملة بالكنوز من' },
        'guard_ok':    { title: 'تم سحق قطاع الطرق',            color: C.blue,   icon: '🛡️', desc: 'تم صد الهجوم وتأمين الحمولة في' },
        'guard_bad':   { title: 'نكبة في الطريق',            color: C.red,    icon: '🔥', desc: 'تعرضت القافلة للنهب في' },
        'escort_win':  { title: 'الطريق تحت السيطرة',        color: C.green,  icon: '⚔️', desc: 'تأمين كامل وانطلاق الرحلة نحو' },
        'escort_fail': { title: 'سقوط الحراسة',            color: C.red,    icon: '💀', desc: 'فشل التأمين وضاعت القافلة نحو' },
    };

    const cfg = eventConfig[eventType] || eventConfig['dispatch'];
    const acc = cfg.color;

    // 1. الخلفية الاحترافية
    const isGuardType = eventType.includes('guard') || eventType.includes('escort') || eventType.includes('ambush');
    await drawBg(ctx, isGuardType ? 'banditattack' : 'hubbg');
    
    ctx.fillStyle = 'rgba(6, 8, 15, 0.82)';
    ctx.fillRect(0, 0, W, H);
    
    drawCornerAccents(ctx);
    await drawHeader(ctx, cfg.title);

    // 2. اللوحة المركزية (Glassmorphism)
    const PX = 80, PY = 170, PW = W - 160, PH = 620;
    drawPanel(ctx, PX, PY, PW, PH, acc, { radius: 40 });

    // ==========================================
    // 🖼️ معالجة صورة المدينة (الجهة اليسرى للتوازن البصري)
    // ==========================================
    const imgW = 580, imgH = 500;
    const imgX = PX + 50, imgY = PY + 60;
    
    const destImg = await fetchImageSafe(dest?.id || '');
    ctx.save();
    rr(ctx, imgX, imgY, imgW, imgH, 24);
    ctx.clip();
    if (destImg) {
        // حساب الـ Cover للأبعاد لضمان ملء الإطار بالكامل
        const scale = Math.max(imgW / destImg.width, imgH / destImg.height);
        const x = imgX + (imgW - destImg.width * scale) / 2;
        const y = imgY + (imgH - destImg.height * scale) / 2;
        ctx.drawImage(destImg, x, y, destImg.width * scale, destImg.height * scale);
    } else {
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(imgX, imgY, imgW, imgH);
    }
    
    // تدرج دمج احترافي
    const grad = ctx.createLinearGradient(imgX, imgY, imgX, imgY + imgH);
    grad.addColorStop(0, 'transparent');
    grad.addColorStop(1, 'rgba(10,14,28,0.8)');
    ctx.fillStyle = grad; ctx.fillRect(imgX, imgY, imgW, imgH);
    ctx.restore();

    // إطار الصورة
    ctx.strokeStyle = acc; ctx.lineWidth = 3;
    rr(ctx, imgX, imgY, imgW, imgH, 24); ctx.stroke();

    // اسم المدينة بلمسة مذهبة
    ctx.shadowColor = acc; ctx.shadowBlur = 15;
    ctx.font = `bold 42px ${FONT_WORD}`;
    ctx.textAlign = 'center'; ctx.fillStyle = acc;
    ctx.fillText(dest?.name || 'وجهة مجهولة', imgX + imgW / 2, imgY + imgH - 50);
    ctx.shadowBlur = 0;

    // ==========================================
    // 📜 منطقة البيانات (الجهة اليمنى - البداية العربية)
    // ==========================================
    const infoX = PX + PW - 70; // نقطة الارتكاز لليمين
    let textY = PY + 90;

    // رأسية التاجر
    try {
        const av = await loadImage(user.displayAvatarURL({ extension: 'png', size: 128 }));
        ctx.save();
        ctx.beginPath(); ctx.arc(infoX - 45, textY, 45, 0, Math.PI * 2); ctx.clip();
        ctx.drawImage(av, infoX - 90, textY - 45, 90, 90);
        ctx.restore();
        ctx.strokeStyle = acc; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(infoX - 45, textY, 45, 0, Math.PI * 2); ctx.stroke();
    } catch {}

    ctx.textAlign = 'right';
    ctx.font = `32px ${FONT_WORD}`; ctx.fillStyle = '#FFF';
    ctx.fillText(`التاجر: ${truncate(user.displayName || user.globalName || user.username, 14)}`, infoX - 110, textY - 10);
    
    ctx.font = `20px ${FONT_WORD}`; ctx.fillStyle = '#AAA';
    ctx.fillText(cfg.desc, infoX - 110, textY + 30);

    textY += 100;
    divLine(ctx, infoX - 650, textY, 650, acc + '33');
    textY += 60;

    // قسم النتائج / المكافآت
    if (eventType === 'arrive' || eventType === 'dispatch') {
        ctx.font = `bold 28px ${FONT_WORD}`; ctx.fillStyle = acc;
        ctx.fillText(eventType === 'arrive' ? 'حصيلة الغنائم المستلمة:' : 'الاستثمار المطلوب:', infoX, textY);
        textY += 50;

        const rewards = [
            { icon: '💰', label: 'المورا الملكية', val: data.mora ? data.mora.toLocaleString() : '0', color: C.gold },
            { icon: '🔮', label: 'نقاط الخبرة', val: data.xp ? data.xp.toLocaleString() : '0', color: '#B968FF' },
            { icon: '🌟', label: 'نقاط السمعة', val: data.reputation ? data.reputation.toString() : '0', color: '#00C3FF' }
        ];

        for (const r of rewards) {
            if (r.val !== '0') {
                const boxX = infoX - 400;
                ctx.fillStyle = 'rgba(255,255,255,0.03)';
                rr(ctx, boxX, textY, 400, 55, 15); ctx.fill();
                ctx.strokeStyle = r.color + '44';
                rr(ctx, boxX, textY, 400, 55, 15); ctx.stroke();

                drawRewardRow(ctx, r.icon, r.label, r.val, boxX, textY, r.color);
                textY += 70;
            }
        }

        const items = parseSafeArray(data.items);
        if (items.length > 0) {
            textY += 20;
            ctx.font = `22px ${FONT_WORD}`; ctx.fillStyle = '#B968FF';
            ctx.fillText('غنائم أخرى:', infoX, textY);
            textY += 40;

            for (const item of items.slice(0, 3)) {
                const boxX = infoX - 400;
                ctx.fillStyle = 'rgba(185,104,255,0.08)';
                rr(ctx, boxX, textY, 400, 46, 12); ctx.fill();
                ctx.strokeStyle = '#B968FF44';
                rr(ctx, boxX, textY, 400, 46, 12); ctx.stroke();
                ctx.font = `17px ${FONT_WORD}`; ctx.textAlign = 'right';
                ctx.fillStyle = '#EEE';
                ctx.fillText(truncate(String(item), 38), boxX + 390, textY + 26);
                textY += 58;
            }
        }
    } else if (isGuardType) {
        // ... منطق الاشتباك مع مراعاة الخطوط ...
        ctx.font = `bold 32px ${FONT_WORD}`; ctx.fillStyle = acc;
        ctx.fillText('تقرير الميدان:', infoX, textY);
        textY += 60;

        const boxX = infoX - 650;
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        rr(ctx, boxX, textY, 650, 140, 20); ctx.fill();
        ctx.strokeStyle = acc + '66';
        rr(ctx, boxX, textY, 650, 140, 20); ctx.stroke();

        ctx.font = `90px ${FONT_EMOJI}`; ctx.textAlign = 'center';
        ctx.fillText(cfg.icon, boxX + 100, textY + 80);

        ctx.textAlign = 'right';
        ctx.font = `28px ${FONT_WORD}`; ctx.fillStyle = '#FFF';
        const isWin = eventType.includes('win') || eventType === 'guard_ok';
        ctx.fillText(isWin ? 'سُحق المعتدون تماماً!' : 'كُسرت القافلة ونُهبت!', boxX + 620, textY + 50);

        ctx.font = `18px ${FONT_WORD}`; ctx.fillStyle = '#AAA';
        ctx.fillText(isWin ? 'البضائع في طريقها بأمان.' : 'ضاعت الموارد في غبار المعركة.', boxX + 620, textY + 95);
    }

    return toBuf(canvas);
}

module.exports = { generateCaravanEvent };
