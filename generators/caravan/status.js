const {
    createCanvas, W, H, C, FA, FE,
    drawBg, drawHeader, drawCornerAccents, drawPanel,
    drawBar, drawArcProgress,
    fetchImageSafe, toBuf,
    R, M, L, rr, divLine, wrapText,
    formatArabicTime, truncate, parseSafeArray,
} = require('./shared');

async function generateCaravanStatus(user, caravan, stats, dest, mode = 'details') {
    const canvas = createCanvas(W, H);
    const ctx    = canvas.getContext('2d');
    const now    = Date.now();
    const start  = Number(caravan.starttime || caravan.startTime || now);
    const end    = Number(caravan.endtime   || caravan.endTime   || now);

    const prog   = (end <= start) ? 1 : Math.min(1, Math.max(0, (now - start) / (end - start)));
    const tleft  = Math.max(0, end - now);
    const acc    = dest?.color || C.gold;
    const atkRes = Number(caravan.attackresolved || caravan.attackResolved || 0);
    const hasAtk = atkRes === 0 && (caravan.guardmessageid || caravan.guardMessageId);
    const rm     = Number(caravan.rewardmultiplier || caravan.rewardMultiplier || 1);

    const destId = caravan?.destinationid || caravan?.destinationId || '';

    let bgName = 'journeymap';
    if (hasAtk || atkRes === 2 || atkRes === -1) bgName = 'banditattack';
    await drawBg(ctx, bgName);
    drawCornerAccents(ctx);

    const subTitle = tleft <= 0 ? 'وصلت القافلة' : `متبقي ${formatArabicTime(tleft)}`;
    await drawHeader(ctx, `متابعة قافلة ${dest?.name || ''}`, subTitle);

    if (mode === 'map') {
        const MX = 80, MY = 160, MW = 1440, MH = 680;

        ctx.save();
        rr(ctx, MX, MY, MW, MH, 32);
        ctx.clip();

        const mapImg = await fetchImageSafe('worldmap');
        if (mapImg) {
            const imgRatio = mapImg.width / mapImg.height;
            const boxRatio = MW / MH;
            let drawW = MW;
            let drawH = MH;
            let offsetX = 0;
            let offsetY = 0;

            if (imgRatio > boxRatio) {
                drawH = MH;
                drawW = MH * imgRatio;
                offsetX = (MW - drawW) / 2;
            } else {
                drawW = MW;
                drawH = MW / imgRatio;
                offsetY = (MH - drawH) / 2;
            }

            ctx.drawImage(mapImg, MX + offsetX, MY + offsetY, drawW, drawH);
            ctx.fillStyle = 'rgba(4,6,12,0.60)';
            ctx.fillRect(MX, MY, MW, MH);
        } else {
            ctx.fillStyle = 'rgba(10,14,28,0.8)';
            ctx.fillRect(MX, MY, MW, MH);
        }
        ctx.restore();

        ctx.strokeStyle = acc + '44';
        ctx.lineWidth = 3;
        rr(ctx, MX, MY, MW, MH, 32);
        ctx.stroke();

        const oX = MX + 200,       oY = MY + MH - 220;
        const dX = MX + MW - 200,  dY = MY + 200;
        const cpX = (oX + dX) / 2, cpY = (oY + dY) / 2 - 220;
        const t  = prog;
        const cX = (1 - t) * (1 - t) * oX + 2 * (1 - t) * t * cpX + t * t * dX;
        const cY = (1 - t) * (1 - t) * oY + 2 * (1 - t) * t * cpY + t * t * dY;

        const bpt = (bt) => ({
            x: (1-bt)*(1-bt)*oX + 2*(1-bt)*bt*cpX + bt*bt*dX,
            y: (1-bt)*(1-bt)*oY + 2*(1-bt)*bt*cpY + bt*bt*dY,
        });

        // ===============================================
        // 🧭 تعديل البوصلة: النقل للزاوية اليمنى السفلية وإصلاح حرف N
        // ===============================================
        const compX = MX + MW - 130; // زاوية يمنى
        const compY = MY + MH - 150; // زاوية سفلية
        const compR = 55;
        
        ctx.save();
        const compBg = ctx.createRadialGradient(compX, compY, 0, compX, compY, compR);
        compBg.addColorStop(0, 'rgba(18,26,55,0.88)'); compBg.addColorStop(1, 'rgba(4,6,14,0.60)');
        ctx.fillStyle = compBg;
        ctx.beginPath(); ctx.arc(compX, compY, compR, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = acc + '55'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(compX, compY, compR, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = acc + '22'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(compX, compY, compR - 12, 0, Math.PI * 2); ctx.stroke();
        [0, Math.PI / 2, Math.PI, Math.PI * 3 / 2].forEach((angle, ai) => {
            const ex = compX + Math.sin(angle) * (compR - 8);
            const ey = compY - Math.cos(angle) * (compR - 8);
            ctx.fillStyle = ai === 0 ? '#E74C3C' : acc + '99';
            ctx.shadowColor = ai === 0 ? '#E74C3C' : acc; ctx.shadowBlur = ai === 0 ? 14 : 6;
            ctx.beginPath();
            ctx.moveTo(ex, ey);
            ctx.lineTo(compX + Math.sin(angle + 0.28) * 12, compY - Math.cos(angle + 0.28) * 12);
            ctx.lineTo(compX, compY);
            ctx.lineTo(compX + Math.sin(angle - 0.28) * 12, compY - Math.cos(angle - 0.28) * 12);
            ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0;
        });
        
        // إصلاح حرف N ليصبح منفصلاً تماماً عن رأس النجمة ومرفوع للأعلى
        ctx.font = `bold 22px "Arial", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#E74C3C'; 
        ctx.fillText('N', compX, compY - compR - 16); 
        ctx.restore();
        // ===============================================

        ctx.setLineDash([25, 20]);
        ctx.strokeStyle = acc + '22'; ctx.lineWidth = 14;
        ctx.beginPath(); ctx.moveTo(oX, oY); ctx.quadraticCurveTo(cpX, cpY, dX, dY); ctx.stroke();
        ctx.setLineDash([]);

        if (prog > 0.05) {
            for (let ti = 0.03; ti < prog - 0.05; ti += 0.04) {
                const tp = bpt(ti);
                ctx.globalAlpha = Math.min(0.60, 0.08 + ti * 0.65);
                ctx.fillStyle = acc; ctx.shadowColor = acc; ctx.shadowBlur = 5;
                ctx.beginPath(); ctx.arc(tp.x, tp.y, 4 + ti * 5, 0, Math.PI * 2); ctx.fill();
                ctx.shadowBlur = 0;
            }
            ctx.globalAlpha = 1;
        }

        const pathG = ctx.createLinearGradient(oX, oY, cX, cY);
        pathG.addColorStop(0, acc + '55'); pathG.addColorStop(0.6, acc + 'BB'); pathG.addColorStop(1, acc);
        ctx.strokeStyle = pathG; ctx.lineWidth = 20;
        ctx.shadowColor = acc; ctx.shadowBlur = 28;
        ctx.beginPath(); ctx.moveTo(oX, oY); ctx.quadraticCurveTo(cpX, cpY, cX, cY); ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = acc + '66'; ctx.lineWidth = 8;
        ctx.beginPath(); ctx.moveTo(oX, oY); ctx.quadraticCurveTo(cpX, cpY, cX, cY); ctx.stroke();

        [0.25, 0.5, 0.75].forEach(mt => {
            const mp = bpt(mt);
            const passed = prog >= mt;
            if (passed) {
                const mh = ctx.createRadialGradient(mp.x, mp.y, 4, mp.x, mp.y, 30);
                mh.addColorStop(0, acc + '55'); mh.addColorStop(1, 'transparent');
                ctx.fillStyle = mh; ctx.beginPath(); ctx.arc(mp.x, mp.y, 30, 0, Math.PI * 2); ctx.fill();
            }
            ctx.fillStyle   = passed ? acc : 'rgba(255,255,255,0.22)';
            ctx.shadowColor = passed ? acc : 'transparent'; ctx.shadowBlur = passed ? 18 : 0;
            ctx.beginPath(); ctx.arc(mp.x, mp.y, passed ? 12 : 9, 0, Math.PI * 2); ctx.fill();
            ctx.shadowBlur  = 0;
            ctx.strokeStyle = passed ? acc + 'BB' : acc + '33'; ctx.lineWidth = 2.5;
            ctx.beginPath(); ctx.arc(mp.x, mp.y, 20, 0, Math.PI * 2); ctx.stroke();
            ctx.font = `bold 20px ${FA}`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
            ctx.fillStyle = passed ? acc : acc + '55';
            ctx.fillText(`${(mt * 100).toFixed(0)}%`, mp.x, mp.y - 26);
        });

        const startH = ctx.createRadialGradient(oX, oY, 8, oX, oY, 50);
        startH.addColorStop(0, C.green + '55'); startH.addColorStop(1, 'transparent');
        ctx.fillStyle = startH; ctx.beginPath(); ctx.arc(oX, oY, 50, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = C.green; ctx.shadowColor = C.green; ctx.shadowBlur = 24;
        ctx.beginPath(); ctx.arc(oX, oY, 35, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        M(ctx, '🏠', oX, oY - 52, 52, C.text);
        M(ctx, 'المدينة', oX, oY - 96, 24, C.green);

        const destP = ctx.createRadialGradient(dX, dY, 8, dX, dY, 55);
        destP.addColorStop(0, acc + 'CC'); destP.addColorStop(1, acc + '00');
        ctx.fillStyle = destP; ctx.beginPath(); ctx.arc(dX, dY, 55, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = acc; ctx.shadowColor = acc; ctx.shadowBlur = 32;
        ctx.beginPath(); ctx.arc(dX, dY, 35, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.font = `80px ${FE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(dest?.emoji || '📍', dX, dY - 90);
        M(ctx, dest?.name || '', dX, dY + 70, 28, acc);

        const camH = ctx.createRadialGradient(cX, cY, 14, cX, cY, 90);
        camH.addColorStop(0, (hasAtk ? C.red : acc) + '66'); camH.addColorStop(1, 'transparent');
        ctx.fillStyle = camH; ctx.beginPath(); ctx.arc(cX, cY, 90, 0, Math.PI * 2); ctx.fill();

        const camelImg = await fetchImageSafe('camel');
        if (camelImg) {
            ctx.drawImage(camelImg, cX - 100, cY - 120, 200, 200);
        } else {
            const camelEmoji = hasAtk ? '⚔️' : '🐪';
            ctx.font = `140px ${FE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.shadowColor = hasAtk ? C.red : acc; ctx.shadowBlur = 40;
            ctx.fillText(camelEmoji, cX, cY - 30);
            ctx.shadowBlur = 0;
        }

        if (hasAtk) {
            const bw2 = 440;
            const bx2 = Math.max(MX + 12, Math.min(MX + MW - bw2 - 12, cX - bw2 / 2));
            const by2 = Math.max(MY + 12, cY - 155);
            rr(ctx, bx2, by2, bw2, 66, 16);
            ctx.fillStyle = 'rgba(200,30,30,0.92)'; ctx.fill();
            ctx.strokeStyle = C.red; ctx.lineWidth = 2.5;
            ctx.shadowColor = C.red; ctx.shadowBlur = 14;
            rr(ctx, bx2, by2, bw2, 66, 16); ctx.stroke();
            ctx.shadowBlur = 0;
            M(ctx, 'القافلة تتعرض لهجوم', bx2 + bw2 / 2, by2 + 33, 28, '#FFFFFF');
        }

        const barY2 = MY + MH - 95;
        drawBar(ctx, MX + 240, barY2 + 6, MW - 480, 50, prog, acc);

        return toBuf(canvas);
    }

    const RX = 80, RY = 158, RW = 1440, RH = 684;
    drawPanel(ctx, RX, RY, RW, RH, acc, { radius: 32 });

    if (tleft <= 0) {
        const bannerG = ctx.createLinearGradient(RX, RY, RX + RW, RY);
        bannerG.addColorStop(0, 'rgba(0,0,0,0)');
        bannerG.addColorStop(0.2, C.gold + '44');
        bannerG.addColorStop(0.8, C.gold + '44');
        bannerG.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = bannerG; ctx.fillRect(RX, RY, RW, 48);
        ctx.shadowColor = C.gold; ctx.shadowBlur = 18;
        M(ctx, 'وصلت القافلة بسلام', W / 2, RY + 24, 28, C.gold);
        ctx.shadowBlur = 0;
    }

    const destImg = destId ? await fetchImageSafe(destId) : null;
    if (destImg) {
        ctx.save();
        rr(ctx, RX + 40, RY + 52, 500, 590, 24); ctx.clip();
        const imgRatio = destImg.width / destImg.height;
        const drawH = 590;
        const drawW = 590 * imgRatio;
        ctx.globalAlpha = 1.0;
        ctx.drawImage(destImg, RX + 40 - (drawW - 500)/2, RY + 52, drawW, drawH);

        const imgFade = ctx.createLinearGradient(RX + 40, RY + 52, RX + 40, RY + 642);
        imgFade.addColorStop(0.6, 'transparent');
        imgFade.addColorStop(1, 'rgba(4,6,14,0.90)');
        ctx.fillStyle = imgFade; ctx.fillRect(RX + 40, RY + 52, 500, 590);
        ctx.restore();
    }

    const textStartX = RX + 578;
    const textW = RW - 636;

    let py = RY + (tleft <= 0 ? 76 : 66);
    ctx.shadowColor = acc + '66'; ctx.shadowBlur = 16;
    M(ctx, 'التقرير التفصيلي للرحلة', textStartX + textW / 2, py, 40, acc);
    ctx.shadowBlur = 0;
    py += 66; divLine(ctx, textStartX, py, textW, acc + '55'); py += 46;

    ctx.shadowColor = acc + '44'; ctx.shadowBlur = 10;
    R(ctx, dest?.name || '', textStartX + textW, py, 40, acc);
    ctx.shadowBlur = 0;
    ctx.font = `24px ${FA}`; ctx.fillStyle = C.textD;
    wrapText(ctx, dest?.description || '', textStartX + textW, py + 55, textW - 20, 40, 'right');

    py += 155; divLine(ctx, textStartX, py, textW); py += 50;

    const stMap2 = {
        'ok':  { t: 'تتقدم بامان',   c: C.green  },
        'atk': { t: 'تتعرض لهجوم',  c: C.red    },
        '1':   { t: 'نجحت الحراسة', c: C.blue   },
        '2':   { t: 'خسائر فادحة',  c: '#FFA500' },
        '-1':  { t: 'نهبت بالكامل',  c: '#FF2222' },
    };
    const stk2 = hasAtk ? 'atk' : atkRes !== 0 ? String(atkRes) : 'ok';
    const st2  = stMap2[stk2] || stMap2['ok'];
    const rmC  = rm >= 1 ? C.green : rm >= 0.6 ? C.gold : C.red;

    const rawArts = caravan.equippedartifacts || caravan.equippedArtifacts;
    const arts = parseSafeArray(rawArts);

    const infoRows = [
        { label: 'حالة القافلة',    val: st2.t,                                      vc: st2.c    },
        { label: 'الوقت المتبقي',   val: tleft <= 0 ? 'وصلت الوجهة' : formatArabicTime(tleft), vc: tleft <= 0 ? C.green : C.text },
        { label: 'المكافات',        val: `× ${rm.toFixed(2)}`,                      vc: rmC      },
        { label: 'الادوات المجهزة', val: `${arts.length} اداة نشطة`,                 vc: C.purple },
    ];
    for (const row of infoRows) {
        rr(ctx, textStartX, py - 33, textW, 66, 16);
        ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fill();
        R(ctx, row.label, textStartX + textW - 28, py + 2, 26, C.textD);
        L(ctx, row.val,   textStartX + 28,         py + 2, 26, row.vc);
        py += 80;
    }

    return toBuf(canvas);
}

module.exports = { generateCaravanStatus };
