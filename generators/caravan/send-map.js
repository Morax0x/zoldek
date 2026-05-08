const {
    createCanvas, W, H, C, FE,
    drawBg, drawHeader, drawCornerAccents,
    fetchImageSafe, toBuf,
    M, L, R, rr, divLine, wrapText,
    formatArabicTime,
} = require('./shared');

// 👑 دالة مساعدة لقلب ترتيب الكلمات عشان تطلع صح بالكانفاس (حل مشكلة النصوص المعكوسة مع الأرقام) 👑
function fixRtl(text) {
    if (!text) return '';
    return text.toString().split(' ').reverse().join(' ');
}

async function generateSendMap(user, stats, mora) {
    const cfg  = require('../../json/caravan-config.json');
    const core = require('../../handlers/caravan/index.js');
    
    const canvas = createCanvas(W, H);
    const ctx    = canvas.getContext('2d');

    // حماية الخلفية
    try {
        await drawBg(ctx, 'journeymap');
    } catch(e) {
        ctx.fillStyle = '#05050A';
        ctx.fillRect(0, 0, W, H);
    }

    await drawHeader(ctx, 'تحديد مسار القافلة');
    drawCornerAccents(ctx);

    const DESTS = cfg.destinations;
    
    // 👑 حساب ديناميكي يوزع البطاقات على كامل عرض الصورة باستغلال كامل للمساحة 👑
    const sideMargin = 80; // هامش من اليمين واليسار
    const availableWidth = W - (sideMargin * 2);
    // عرض البطاقة يتأقلم تلقائياً مع المساحة المتاحة وعدد المدن
    const cw = Math.min(360, Math.floor((availableWidth - (DESTS.length - 1) * 30) / DESTS.length));
    const cgap = DESTS.length > 1 ? (availableWidth - (DESTS.length * cw)) / (DESTS.length - 1) : 0;
    
    const ch = 540;
    const startX = sideMargin;
    const cardY  = 180;

    for (let i=0; i<DESTS.length; i++) {
        const d = DESTS[i];
        const cx   = startX + i * (cw + cgap);
        const acc  = d.color || C.gold;
        const canAfford = Number(mora) >= d.cost;

        let destImg = null;
        try {
            destImg = await fetchImageSafe(d.id).catch(() => null);
        } catch(e) { destImg = null; }

        rr(ctx, cx, cardY, cw, ch, 24);
        if(destImg) {
            ctx.save(); 
            ctx.clip();
            const imgRatio = destImg.width / destImg.height;
            let drawH = ch;
            let drawW = ch * imgRatio;
            
            // 👑 ضمان تغطية الصورة للبطاقة بالكامل (Cover)
            if (drawW < cw) {
                drawW = cw;
                drawH = cw / imgRatio;
            }
            
            ctx.drawImage(destImg, cx - (drawW - cw)/2, cardY - (drawH - ch)/2, drawW, drawH);
            
            const bgGrad = ctx.createLinearGradient(cx, cardY, cx, cardY + ch);
            bgGrad.addColorStop(0, 'rgba(0,0,0,0.4)');
            bgGrad.addColorStop(0.5, 'rgba(10,14,28,0.85)');
            bgGrad.addColorStop(1, 'rgba(5,7,16,0.95)');
            ctx.fillStyle = bgGrad; 
            ctx.fillRect(cx, cardY, cw, ch);
            ctx.restore();
        } else {
            const bg = ctx.createLinearGradient(cx, cardY, cx, cardY + ch);
            bg.addColorStop(0, acc + '33'); 
            bg.addColorStop(1, 'rgba(4,6,14,0.95)');
            ctx.fillStyle = bg; 
            ctx.fill();
            
            ctx.font = `60px ${FE}`; 
            ctx.textAlign = 'center';
            ctx.fillText('🏰', cx + cw / 2, cardY + ch / 2);
        }

        ctx.strokeStyle = acc + (canAfford ? 'CC' : '44');
        ctx.lineWidth   = canAfford ? 3 : 1.5;
        rr(ctx, cx, cardY, cw, ch, 24); 
        ctx.stroke();

        ctx.font = `80px ${FE}`; 
        ctx.textAlign = 'center'; 
        ctx.textBaseline = 'middle';
        ctx.fillText(d.emoji, cx + cw / 2, cardY + 80);

        // تكبير النص وتوسيطه
        M(ctx, d.name, cx + cw / 2, cardY + 170, 28, acc);

        divLine(ctx, cx + 20, cardY + 210, cw - 40, acc + '44');

        ctx.font = `22px "Bein","Arial",sans-serif`; 
        ctx.fillStyle = C.textD;
        wrapText(ctx, d.description || '', cx + cw / 2, cardY + 250, cw - 40, 34);

        let adjDur, adjRisk;
        try { 
            adjDur  = core.calcDuration(d, { speed_rank: Number(stats.speed_rank || 1) }, { speedBuff: 0 }); 
        } catch { adjDur = (d.duration_hours * 3600000) || 3600000; }
        
        try { 
            adjRisk = core.calcRiskFactor(d, { defense_rank: Number(stats.defense_rank || 1) }); 
        } catch { adjRisk = d.risk_factor || 0.3; }
        
        const riskC   = adjRisk >= 0.35 ? C.red : adjRisk >= 0.25 ? '#FFA500' : C.green;

        // 👑 إصلاح الوقت المعكوس بالـ Canvas باستخدام دالة fixRtl
        const timeStr = formatArabicTime(adjDur);

        const rows = [
            { label: 'المدة',    val: fixRtl(timeStr),                  vc: C.text    },
            { label: 'الخطر',   val: `%${(adjRisk * 100).toFixed(0)}`, vc: riskC     },
            { label: 'التكلفة', val: `${d.cost.toLocaleString()}`,     vc: canAfford ? C.gold : C.red },
        ];
        
        let ry = cardY + 350;
        for (const row of rows) {
            rr(ctx, cx + 16, ry - 18, cw - 32, 44, 10);
            ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill();
            R(ctx, row.label, cx + cw - 28,  ry + 4, 22, C.textD);
            L(ctx, row.val,   cx + 28,       ry + 4, 22, row.vc);
            ry += 52;
        }

        if (!canAfford) {
            rr(ctx, cx + cw / 2 - 90, cardY + ch - 65, 180, 50, 12);
            ctx.fillStyle = 'rgba(231,76,60,0.40)'; ctx.fill();
            ctx.strokeStyle = C.red + '88'; ctx.lineWidth = 1.5;
            rr(ctx, cx + cw / 2 - 90, cardY + ch - 65, 180, 50, 12); ctx.stroke();
            M(ctx, 'رصيد غير كاف', cx + cw / 2, cardY + ch - 40, 22, C.red);
        }
    }

    const fy = cardY + ch + 40;
    divLine(ctx, 60, fy, W - 120, C.gold + '33');
    M(ctx, `اجمالي رصيدك المتوفر: ${Number(mora).toLocaleString()}`, W / 2, fy + 45, 28, C.gold);

    const compassX = W - 120;
    const compassY = fy + 45;
    
    ctx.font = `60px ${FE}`; 
    ctx.textAlign = 'center'; 
    ctx.textBaseline = 'middle';
    ctx.fillText('🧭', compassX, compassY);
    // تم إزالة حرف الـ N كما طلبت

    return toBuf(canvas);
}

module.exports = { generateSendMap };
