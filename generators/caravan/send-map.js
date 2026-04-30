const {
    createCanvas, W, H, C, FE,
    drawBg, drawHeader, drawCornerAccents,
    fetchImageSafe, toBuf,
    M, L, R, rr, divLine, wrapText,
    formatArabicTime,
} = require('./shared');

async function generateSendMap(user, stats, mora) {
    const cfg  = require('../../json/caravan-config.json');
    const core = require('../../handlers/caravan-core.js');
    const canvas = createCanvas(W, H);
    const ctx    = canvas.getContext('2d');
    await drawBg(ctx, 'journeymap');
    await drawHeader(ctx, 'تحديد مسار القافلة');
    drawCornerAccents(ctx);

    // 🧭 البوصلة في الزاوية اليمنى العلوية 🧭
    const compassX = W - 150; // إزاحة البوصلة لليمين
    const compassY = 120;     // الارتفاع المناسب
    
    // رسم الإيموجي (البوصلة)
    ctx.font = `60px ${FE}`; 
    ctx.textAlign = 'center'; 
    ctx.textBaseline = 'middle';
    ctx.fillText('🧭', compassX, compassY);

    // رسم حرف N فوق البوصلة مع ضبط المسافة حتى لا يتداخل
    ctx.font = `bold 24px "Bein", "Arial", sans-serif`;
    ctx.fillStyle = C.gold;
    // تم رفع حرف N للأعلى بمقدار 45 بيكسل لينفصل عن الإيموجي
    ctx.fillText('N', compassX, compassY - 45); 


    const DESTS = cfg.destinations;
    const cw = 280, ch = 540, cgap = 25;
    const totalW = DESTS.length * cw + (DESTS.length - 1) * cgap;
    const startX = (W - totalW) / 2;
    const cardY  = 180;

    for (let i=0; i<DESTS.length; i++) {
        const d = DESTS[i];
        const cx   = startX + i * (cw + cgap);
        const acc  = d.color || C.gold;
        const canAfford = Number(mora) >= d.cost;

        const destImg = await fetchImageSafe(d.id);

        rr(ctx, cx, cardY, cw, ch, 24);
        if(destImg) {
            ctx.save(); ctx.clip();
            const imgRatio = destImg.width / destImg.height;
            const drawH = ch;
            const drawW = ch * imgRatio;
            ctx.drawImage(destImg, cx - (drawW - cw)/2, cardY, drawW, drawH);
            const bgGrad = ctx.createLinearGradient(cx, cardY, cx, cardY + ch);
            bgGrad.addColorStop(0, 'rgba(0,0,0,0.4)');
            bgGrad.addColorStop(0.5, 'rgba(10,14,28,0.85)');
            bgGrad.addColorStop(1, 'rgba(5,7,16,0.95)');
            ctx.fillStyle = bgGrad; ctx.fillRect(cx, cardY, cw, ch);
            ctx.restore();
        } else {
            const bg = ctx.createLinearGradient(cx, cardY, cx, cardY + ch);
            bg.addColorStop(0, acc + '33'); bg.addColorStop(1, 'rgba(4,6,14,0.95)');
            ctx.fillStyle = bg; ctx.fill();
        }

        ctx.strokeStyle = acc + (canAfford ? 'CC' : '44');
        ctx.lineWidth   = canAfford ? 3 : 1.5;
        rr(ctx, cx, cardY, cw, ch, 24); ctx.stroke();

        ctx.font = `80px ${FE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(d.emoji, cx + cw / 2, cardY + 80);

        M(ctx, d.name, cx + cw / 2, cardY + 170, 26, acc);

        divLine(ctx, cx + 20, cardY + 210, cw - 40, acc + '44');

        ctx.font = `20px ${"\"Bein\",\"Arial\",sans-serif"}`; ctx.fillStyle = C.textD;
        wrapText(ctx, d.description || '', cx + cw / 2, cardY + 250, cw - 40, 32);

        let adjDur, adjRisk;
        try { adjDur  = core.calcDuration(d, { speed_rank: Number(stats.speed_rank || 1) }, { speedBuff: 0 }); }
        catch { adjDur = d.duration || 3600000; }
        try { adjRisk = core.calcRiskFactor(d, { defense_rank: Number(stats.defense_rank || 1) }); }
        catch { adjRisk = d.risk || 0.3; }
        const riskC   = adjRisk >= 0.35 ? C.red : adjRisk >= 0.25 ? '#FFA500' : C.green;

        const rows = [
            { label: 'المدة',    val: formatArabicTime(adjDur),            vc: C.text    },
            { label: 'الخطر',   val: `${(adjRisk * 100).toFixed(0)}%`,       vc: riskC     },
            { label: 'التكلفة', val: `${d.cost.toLocaleString()}`,            vc: canAfford ? C.gold : C.red },
        ];
        let ry = cardY + 350;
        for (const row of rows) {
            rr(ctx, cx + 16, ry - 18, cw - 32, 42, 10);
            ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill();
            R(ctx, row.label, cx + cw - 28,  ry + 3, 20, C.textD);
            L(ctx, row.val,   cx + 28,       ry + 3, 20, row.vc);
            ry += 50;
        }

        if (!canAfford) {
            rr(ctx, cx + cw / 2 - 90, cardY + ch - 60, 180, 48, 12);
            ctx.fillStyle = 'rgba(231,76,60,0.40)'; ctx.fill();
            ctx.strokeStyle = C.red + '88'; ctx.lineWidth = 1.5;
            rr(ctx, cx + cw / 2 - 90, cardY + ch - 60, 180, 48, 12); ctx.stroke();
            M(ctx, 'رصيد غير كاف', cx + cw / 2, cardY + ch - 35, 20, C.red);
        }
    }

    const fy = cardY + ch + 35;
    divLine(ctx, 60, fy, W - 120, C.gold + '33');
    M(ctx, `اجمالي رصيدك المتوفر: ${Number(mora).toLocaleString()}`, W / 2, fy + 45, 26, C.gold);

    return toBuf(canvas);
}

module.exports = { generateSendMap };
