const {
    createCanvas, W, H, C, FA, FE,
    drawBg, drawHeader, drawCornerAccents, drawPanel,
    drawBar, fetchImageSafe, toBuf,
    R, M, L, rr, divLine, wrapText,
    formatArabicTime, parseSafeArray,
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

    // 👑 حماية خلفية الواجهة من الانهيار
    let bgName = 'hubbg'; // استخدام الخلفية الأساسية المضمونة كبديل مبدئي
    try {
        if (hasAtk || atkRes === 2 || atkRes === -1) bgName = 'banditattack';
        await drawBg(ctx, bgName);
    } catch(e) {
        ctx.fillStyle = '#05050A';
        ctx.fillRect(0, 0, W, H);
    }
    
    drawCornerAccents(ctx);

    const subTitle = tleft <= 0 ? 'وصلت القافلة' : `متبقي ${formatArabicTime(tleft)}`;
    await drawHeader(ctx, `متابعة قافلة ${dest?.name || ''}`, subTitle);

    if (mode === 'map') {
        const MX = 80, MY = 160, MW = 1440, MH = 680;

        ctx.save();
        rr(ctx, MX, MY, MW, MH, 32);
        ctx.clip();

        // 👑 حماية خريطة العالم من الانهيار
        try {
            const mapImg = await fetchImageSafe('worldmap').catch(() => null);
            if (mapImg) {
                const imgRatio = mapImg.width / mapImg.height;
                const boxRatio = MW / MH;
                let drawW = MW, drawH = MH, offsetX = 0, offsetY = 0;

                if (imgRatio > boxRatio) {
                    drawW = MH * imgRatio;
                    offsetX = (MW - drawW) / 2;
                } else {
                    drawH = MW / imgRatio;
                    offsetY = (MH - drawH) / 2;
                }
                ctx.drawImage(mapImg, MX + offsetX, MY + offsetY, drawW, drawH);
                ctx.fillStyle = 'rgba(4,6,12,0.30)'; 
                ctx.fillRect(MX, MY, MW, MH);
            } else {
                ctx.fillStyle = 'rgba(10,14,28,0.8)';
                ctx.fillRect(MX, MY, MW, MH);
            }
        } catch(e) {
            ctx.fillStyle = 'rgba(10,14,28,0.8)';
            ctx.fillRect(MX, MY, MW, MH);
        }
        ctx.restore();

        ctx.strokeStyle = acc + '44';
        ctx.lineWidth = 3;
        rr(ctx, MX, MY, MW, MH, 32);
        ctx.stroke();

        const oX = MX + 720; 
        const oY = MY + 340;
        const dX = dest?.map_x ? MX + dest.map_x : MX + MW - 250;
        const dY = dest?.map_y ? MY + dest.map_y : MY + 250;

        const totalDist = Math.hypot(dX - oX, dY - oY);
        const cpX = (oX + dX) / 2; 
        const cpY = Math.min(oY, dY) - Math.abs(dX - oX) * 0.15; 

        const t  = prog;
        const cX = (1 - t) * (1 - t) * oX + 2 * (1 - t) * t * cpX + t * t * dX;
        const cY = (1 - t) * (1 - t) * oY + 2 * (1 - t) * t * cpY + t * t * dY;

        const bpt = (bt) => ({
            x: (1-bt)*(1-bt)*oX + 2*(1-bt)*bt*cpX + bt*bt*dX,
            y: (1-bt)*(1-bt)*oY + 2*(1-bt)*bt*cpY + bt*bt*dY,
        });

        // رسم المسار
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.lineWidth = 14;
        ctx.beginPath(); ctx.moveTo(oX, oY); ctx.quadraticCurveTo(cpX, cpY, dX, dY); ctx.stroke();

        ctx.setLineDash([15, 15]);
        ctx.strokeStyle = acc + '99'; 
        ctx.lineWidth = 8;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(oX, oY); ctx.quadraticCurveTo(cpX, cpY, dX, dY); ctx.stroke();
        ctx.setLineDash([]);

        if (prog > 0) {
            const pathG = ctx.createLinearGradient(oX, oY, cX, cY);
            pathG.addColorStop(0, acc + 'AA'); 
            pathG.addColorStop(0.7, acc); 
            pathG.addColorStop(1, '#FFFFFF'); 

            ctx.shadowColor = acc; 
            ctx.shadowBlur = 20; 
            ctx.strokeStyle = pathG; 
            ctx.lineWidth = 12; 
            ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(oX, oY); ctx.quadraticCurveTo(cpX, cpY, cX, cY); ctx.stroke();
            
            ctx.shadowBlur = 0;
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)'; 
            ctx.lineWidth = 4;
            ctx.beginPath(); ctx.moveTo(oX, oY); ctx.quadraticCurveTo(cpX, cpY, cX, cY); ctx.stroke();
        }

        // رسم محطات النسبة
        let routeMarkers = [];
        if (totalDist >= 380) {
            routeMarkers = [0.25, 0.5, 0.75];
        } else if (totalDist >= 180) {
            routeMarkers = [0.5];
        }

        routeMarkers.forEach(mt => {
            const mp = bpt(mt);
            const passed = prog >= mt;
            if (passed) {
                const mh = ctx.createRadialGradient(mp.x, mp.y, 4, mp.x, mp.y, 30);
                mh.addColorStop(0, acc + '88'); mh.addColorStop(1, 'transparent');
                ctx.fillStyle = mh; ctx.beginPath(); ctx.arc(mp.x, mp.y, 30, 0, Math.PI * 2); ctx.fill();
            }
            ctx.fillStyle   = passed ? acc : 'rgba(20, 20, 20, 0.9)';
            ctx.beginPath(); ctx.arc(mp.x, mp.y, passed ? 10 : 8, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = passed ? '#FFFFFF' : acc + '77'; 
            ctx.lineWidth = passed ? 3 : 2;
            ctx.beginPath(); ctx.arc(mp.x, mp.y, 16, 0, Math.PI * 2); ctx.stroke();
            ctx.font = `bold 18px ${FA}`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
            ctx.fillStyle = passed ? '#FFFFFF' : acc + 'DD';
            ctx.fillText(`${(mt * 100).toFixed(0)}%`, mp.x, mp.y - 22);
        });

        const drawTextWithBg = (text, x, y, color) => {
            ctx.font = `bold 24px "Bein", "Arial", sans-serif`;
            const tW = ctx.measureText(text).width;
            ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
            rr(ctx, x - tW / 2 - 12, y - 18, tW + 24, 36, 8);
            ctx.fill();
            M(ctx, text, x, y + 4, 24, color);
        };

        // نقطة الانطلاق
        const startH = ctx.createRadialGradient(oX, oY, 8, oX, oY, 50);
        startH.addColorStop(0, C.green + '55'); startH.addColorStop(1, 'transparent');
        ctx.fillStyle = startH; ctx.beginPath(); ctx.arc(oX, oY, 50, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = C.green; ctx.beginPath(); ctx.arc(oX, oY, 20, 0, Math.PI * 2); ctx.fill(); 
        ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 3; 
        ctx.beginPath(); ctx.arc(oX, oY, 20, 0, Math.PI * 2); ctx.stroke();
        drawTextWithBg('المركز', oX, oY - 45, '#FFFFFF');

        // الوجهة
        const destP = ctx.createRadialGradient(dX, dY, 8, dX, dY, 55);
        destP.addColorStop(0, acc + 'CC'); destP.addColorStop(1, acc + '00');
        ctx.fillStyle = destP; ctx.beginPath(); ctx.arc(dX, dY, 55, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = acc; ctx.beginPath(); ctx.arc(dX, dY, 20, 0, Math.PI * 2); ctx.fill(); 
        ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 3; 
        ctx.beginPath(); ctx.arc(dX, dY, 20, 0, Math.PI * 2); ctx.stroke();
        drawTextWithBg(dest?.name || 'المدينة', dX, dY - 45, '#FFFFFF');

        // 👑 حماية صورة الجمل (إذا فشل السحب يستخدم الإيموجي فوراً)
        const camH = ctx.createRadialGradient(cX, cY, 14, cX, cY, 90);
        camH.addColorStop(0, (hasAtk ? C.red : acc) + '66'); camH.addColorStop(1, 'transparent');
        ctx.fillStyle = camH; ctx.beginPath(); ctx.arc(cX, cY, 90, 0, Math.PI * 2); ctx.fill();

        try {
            const camelImg = await fetchImageSafe('camel').catch(() => null);
            if (camelImg) {
                ctx.drawImage(camelImg, cX - 75, cY - 90, 150, 150); 
            } else {
                throw new Error("No image");
            }
        } catch (e) {
            const camelEmoji = hasAtk ? '⚔️' : '🐪';
            ctx.font = `80px ${FE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; 
            ctx.shadowColor = hasAtk ? C.red : acc; ctx.shadowBlur = 30;
            ctx.fillText(camelEmoji, cX, cY - 10);
            ctx.shadowBlur = 0;
        }

        if (hasAtk) {
            const bw2 = 440;
            const bx2 = Math.max(MX + 12, Math.min(MX + MW - bw2 - 12, cX - bw2 / 2));
            const by2 = Math.max(MY + 12, cY - 155);
            rr(ctx, bx2, by2, bw2, 66, 16);
            ctx.fillStyle = 'rgba(200,30,30,0.92)'; ctx.fill();
            ctx.strokeStyle = C.red; ctx.lineWidth = 2.5;
            rr(ctx, bx2, by2, bw2, 66, 16); ctx.stroke();
            M(ctx, 'القافلة تتعرض لهجوم', bx2 + bw2 / 2, by2 + 33, 28, '#FFFFFF');
        }

        const barY2 = MY + MH - 95;
        // 👑 إذا ما كانت دالة drawBar شغالة بشكل سليم بنحط لها بديل هنا لضمان عدم الكراش
        try {
            drawBar(ctx, MX + 240, barY2 + 6, MW - 480, 50, prog, acc);
        } catch(e) {
            ctx.fillStyle = '#222'; rr(ctx, MX + 240, barY2 + 6, MW - 480, 50, 25); ctx.fill();
            ctx.fillStyle = acc;    rr(ctx, MX + 240, barY2 + 6, (MW - 480) * prog, 50, 25); ctx.fill();
        }

        return toBuf(canvas);
    }

    // ==========================================
    // واجهة التقرير التفصيلي (Details Mode)
    // ==========================================
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

    // 👑 حماية صورة المدينة إذا ما كانت متوفرة
    try {
        const destImg = destId ? await fetchImageSafe(destId).catch(() => null) : null;
        if (destImg) {
            ctx.save();
            rr(ctx, RX + 40, RY + 52, 500, 590, 24); ctx.clip();
            const imgRatio = destImg.width / destImg.height;
            const drawW = 590 * imgRatio;
            ctx.globalAlpha = 1.0;
            ctx.drawImage(destImg, RX + 40 - (drawW - 500)/2, RY + 52, drawW, 590);
            const imgFade = ctx.createLinearGradient(RX + 40, RY + 52, RX + 40, RY + 642);
            imgFade.addColorStop(0.6, 'transparent');
            imgFade.addColorStop(1, 'rgba(4,6,14,0.90)');
            ctx.fillStyle = imgFade; ctx.fillRect(RX + 40, RY + 52, 500, 590);
            ctx.restore();
        } else {
            // رسم مربع بديل في حال عدم وجود صورة للمدينة
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            rr(ctx, RX + 40, RY + 52, 500, 590, 24); ctx.fill();
            M(ctx, '🏰', RX + 290, RY + 347, 120, '#555');
        }
    } catch(e) {}

    const textStartX = RX + 578;
    const textW = RW - 636;

    let py = RY + (tleft <= 0 ? 76 : 66);
    M(ctx, 'التقرير التفصيلي للرحلة', textStartX + textW / 2, py, 40, acc);
    py += 66; divLine(ctx, textStartX, py, textW, acc + '55'); py += 46;

    R(ctx, dest?.name || 'مدينة مجهولة', textStartX + textW, py, 40, acc);
    ctx.font = `24px ${FA}`; ctx.fillStyle = C.textD;
    
    try {
        wrapText(ctx, dest?.description || 'لا يوجد وصف متاح.', textStartX + textW, py + 55, textW - 20, 40, 'right');
    } catch(e) {
        ctx.fillText(dest?.description || 'لا يوجد وصف متاح.', textStartX + textW, py + 55);
    }

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

    let arts = [];
    try {
        const rawArts = caravan.equippedartifacts || caravan.equippedArtifacts;
        arts = parseSafeArray(rawArts) || [];
    } catch(e) {}

    const infoRows = [
        { label: 'حالة القافلة',    val: st2.t,                                     vc: st2.c    },
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
