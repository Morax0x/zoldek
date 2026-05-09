const { loadImage } = require('@napi-rs/canvas');
const {
    createCanvas, W, H, C, FA, FE,
    drawBg, drawHeader, drawCornerAccents, drawPanel,
    divLine, fetchImageSafe, toBuf,
    R, M, L, rr, truncate, parseSafeArray
} = require('./shared');

async function generateCaravanEvent(user, dest, eventType, data = {}) {
    const canvas = createCanvas(W, H);
    const ctx    = canvas.getContext('2d');
    
    // إعدادات البطاقة بناءً على نوع الحدث
    const eventConfig = {
        'dispatch':    { title: 'انطلاق القافلة',         color: C.gold,   icon: '🐪', desc: 'بدأت القافلة رحلتها متجهة نحو' },
        'arrive':      { title: 'وصول القافلة بسلام',    color: C.green,  icon: '🎉', desc: 'عادت القافلة محملة بالغنائم من' },
        'guard_ok':    { title: 'حماية ناجحة',            color: C.blue,   icon: '🛡️', desc: 'تم صد الهجوم بنجاح وحماية البضائع في' },
        'guard_bad':   { title: 'خسائر فادحة',            color: C.red,    icon: '🔥', desc: 'تعرضت القافلة للنهب وفقدت حمولتها في' },
        'escort_win':  { title: 'انتصار! الطريق آمن!',   color: C.green,  icon: '🎉', desc: 'تأمين ناجح وانطلاق القافلة نحو' },
        'escort_fail': { title: 'فشل التأمين!',           color: C.red,    icon: '💀', desc: 'فشلت الحراسة في حماية القافلة نحو' },
        'ambush_win':  { title: 'نجاح الدفاع! القافلة آمنة', color: C.blue, icon: '🛡️', desc: 'تم صد الكمين بنجاح في الطريق إلى' },
        'ambush_fail': { title: 'فشلت الحراسة — القافلة نُهبت!', color: C.red, icon: '💀', desc: 'الكمين اخترق دفاعات القافلة في الطريق إلى' },
    };
    
    const cfg = eventConfig[eventType] || eventConfig['dispatch'];
    const acc = cfg.color;

    // رسم الخلفية الأساسية
    const isGuardType = eventType.includes('guard') || eventType.includes('escort') || eventType.includes('ambush');
    let bgName = isGuardType ? 'banditattack' : 'hubbg';
    await drawBg(ctx, bgName);
    drawCornerAccents(ctx);
    
    // رسم الهيدر
    await drawHeader(ctx, cfg.title);

    // اللوحة الرئيسية
    const PX = 100, PY = 180, PW = 1400, PH = 600;
    drawPanel(ctx, PX, PY, PW, PH, acc, { radius: 32 });

    // ==========================================
    // 🖼️ رسم صورة الوجهة (في الجهة اليمنى)
    // ==========================================
    const RX = 900, RY = 220, RW = 550, RH = 520;
    const destImg = await fetchImageSafe(dest?.id || '');
    if (destImg) {
        ctx.save();
        rr(ctx, RX, RY, RW, RH, 24); ctx.clip();
        const imgRatio = destImg.width / destImg.height;
        const drawH = RH;
        const drawW = RH * imgRatio;
        ctx.globalAlpha = 0.85;
        ctx.drawImage(destImg, RX - (drawW - RW)/2, RY, drawW, drawH);
        
        // تدرج لوني لتغطية حواف الصورة ودمجها مع اللوحة
        const imgFade = ctx.createLinearGradient(RX, RY, RX, RY + RH);
        imgFade.addColorStop(0, 'rgba(10,14,28,0.2)');
        imgFade.addColorStop(1, 'rgba(10,14,28,0.9)');
        ctx.fillStyle = imgFade; ctx.fillRect(RX, RY, RW, RH);
        ctx.restore();
    } else {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        rr(ctx, RX, RY, RW, RH, 24); ctx.fill();
    }
    
    // إطار ذهبي أو ملون حول الصورة
    ctx.strokeStyle = acc + '66'; ctx.lineWidth = 4;
    rr(ctx, RX, RY, RW, RH, 24); ctx.stroke();
    
    // اسم الوجهة فوق الصورة
    ctx.shadowColor = '#000'; ctx.shadowBlur = 15;
    M(ctx, dest?.name || 'وجهة مجهولة', RX + RW / 2, RY + RH - 40, 42, acc);
    ctx.shadowBlur = 0;

    // ==========================================
    // 📜 رسم التفاصيل والغنائم (في الجهة اليسرى)
    // ==========================================
    const LX = 140;
    let textY = PY + 80;

    // رسم أفاتار التاجر واسمه
    try {
        const av = await loadImage(user.displayAvatarURL({ extension: 'png', size: 128 }));
        ctx.save();
        ctx.beginPath(); ctx.arc(LX + 50, textY, 40, 0, Math.PI * 2); ctx.clip();
        ctx.drawImage(av, LX + 10, textY - 40, 80, 80);
        ctx.restore();
        ctx.strokeStyle = acc; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(LX + 50, textY, 40, 0, Math.PI * 2); ctx.stroke();
    } catch {}

    L(ctx, `التاجر: ${truncate(user.username, 16)}`, LX + 110, textY - 10, 26, C.text);
    L(ctx, cfg.desc, LX + 110, textY + 25, 20, C.textD);
    
    textY += 90;
    divLine(ctx, LX, textY, 700, acc + '44');
    textY += 50;

    // 🎁 رسم الغنائم والمكافآت (إذا كان الحدث وصول أو تجهيز)
    if (eventType === 'arrive' || eventType === 'dispatch') {
        ctx.shadowColor = acc + '55'; ctx.shadowBlur = 10;
        L(ctx, eventType === 'arrive' ? 'حصيلة الرحلة:' : 'التكاليف المتوقعة:', LX, textY, 32, acc);
        ctx.shadowBlur = 0;
        textY += 60;

        const rewards = [
            { icon: '💰', label: 'المورا', val: data.mora ? `+${data.mora.toLocaleString()}` : '0', color: C.gold },
            { icon: '🔮', label: 'الخبرة', val: data.xp ? `+${data.xp.toLocaleString()}` : '0', color: '#8A2BE2' },
            { icon: '🛡️', label: 'السمعة', val: data.reputation ? `+${data.reputation}` : '0', color: '#3498DB' }
        ];

        // رسم صناديق الغنائم بشكل أنيق
        for (const r of rewards) {
            if (r.val !== '0') {
                rr(ctx, LX, textY, 340, 50, 12);
                ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fill();
                ctx.strokeStyle = r.color + '44'; ctx.lineWidth = 2;
                rr(ctx, LX, textY, 340, 50, 12); ctx.stroke();

                ctx.font = `24px ${FE}`; ctx.textAlign = 'right';
                ctx.fillText(r.icon, LX + 325, textY + 28);
                R(ctx, r.label, LX + 280, textY + 28, 22, C.textD);
                L(ctx, r.val, LX + 20, textY + 28, 22, r.color);
                
                textY += 65;
            }
        }

        // إذا كان هناك أدوات (Items)
        const items = parseSafeArray(data.items);
        if (items.length > 0) {
            textY += 10;
            L(ctx, 'الأدوات المكتسبة:', LX, textY, 26, C.purple);
            textY += 40;
            
            rr(ctx, LX, textY, 700, 60, 12);
            ctx.fillStyle = 'rgba(138, 43, 226, 0.1)'; ctx.fill();
            ctx.strokeStyle = 'rgba(138, 43, 226, 0.4)'; ctx.lineWidth = 2;
            rr(ctx, LX, textY, 700, 60, 12); ctx.stroke();
            
            M(ctx, items.join(' • '), LX + 350, textY + 34, 22, C.text);
        }
    }
    // ⚔️ رسم تقرير الاشتباك (الحراسة، الإرشاد، الكمين)
    else if (isGuardType) {
        ctx.shadowColor = acc + '55'; ctx.shadowBlur = 10;
        L(ctx, 'تقرير الاشتباك:', LX, textY, 32, acc);
        ctx.shadowBlur = 0;
        textY += 60;

        rr(ctx, LX, textY, 700, 120, 16);
        ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fill();
        ctx.strokeStyle = acc + '66'; ctx.lineWidth = 2;
        rr(ctx, LX, textY, 700, 120, 16); ctx.stroke();

        ctx.font = `80px ${FE}`; ctx.textAlign = 'center';
        ctx.fillText(cfg.icon, LX + 100, textY + 70);

        const isWin = eventType === 'guard_ok' || eventType === 'escort_win' || eventType === 'ambush_win';
        if (isWin) {
            L(ctx, 'تم إبادة قطاع الطرق!', LX + 180, textY + 45, 26, C.green);
            if (data.eta) {
                L(ctx, `وقت الوصول: <t:${data.eta}:R>`, LX + 180, textY + 85, 20, C.textD);
            } else {
                L(ctx, 'بضائعك ومواردك في أمان تام.', LX + 180, textY + 85, 20, C.textD);
            }
        } else {
            L(ctx, 'تم اختراق دفاعات القافلة!', LX + 180, textY + 45, 26, C.red);
            if (data.lost_percentage != null) {
                L(ctx, `الخسائر المقدرة: -${(data.lost_percentage * 100).toFixed(0)}% من الحمولة`, LX + 180, textY + 85, 22, C.gold);
            } else {
                L(ctx, 'ضاعت جميع البضائع. انتهت الرحلة.', LX + 180, textY + 85, 20, C.textD);
            }
        }

        // Reward summary if provided
        if (data.rewards && data.rewards.length > 0) {
            textY += 140;
            L(ctx, 'مكافآت الفريق:', LX, textY, 26, C.gold);
            textY += 40;
            const rewardText = data.rewards.slice(0, 3).join('  •  ');
            rr(ctx, LX, textY, 700, 50, 10);
            ctx.fillStyle = 'rgba(245,197,24,0.08)'; ctx.fill();
            ctx.strokeStyle = C.gold + '44'; ctx.lineWidth = 1.5;
            rr(ctx, LX, textY, 700, 50, 10); ctx.stroke();
            M(ctx, rewardText, LX + 350, textY + 26, 18, C.text);
        }
    }

    return toBuf(canvas);
}

module.exports = { generateCaravanEvent };
