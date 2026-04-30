const { loadImage } = require('@napi-rs/canvas');
const {
    createCanvas, W, H, C, FA, FE,
    drawBg, drawHeader, drawCornerAccents, drawPanel,
    drawBar, drawStars, divLine,
    fetchImageSafe, toBuf,
    R, M, L, rr,
    truncate, caravanRank, getRepRankInfo,
    formatArabicTime,
} = require('./shared');

async function generateCaravanHub(user, stats, active, mora, profExtra = {}) {
    const cfg = require('../../json/caravan-config.json');
    const canvas = createCanvas(W, H);
    const ctx    = canvas.getContext('2d');
    await drawBg(ctx, 'hubbg');
    await drawHeader(ctx, 'مركز القوافل');
    drawCornerAccents(ctx);

    const trips   = Number(stats.total_trips      || 0);
    const success = Number(stats.successful_trips || 0);
    const rank    = caravanRank(success);
    const level   = Number(profExtra.level    || 1);
    const repPts  = Number(profExtra.repPoints || 0);
    const repRank = getRepRankInfo(repPts);

    const LX = 40, LY = 150, LW = 420, LH = 710;
    drawPanel(ctx, LX, LY, LW, LH, rank.color);

    try {
        const av = await loadImage(user.displayAvatarURL({ extension: 'png', size: 256 }));
        ctx.save();
        ctx.beginPath(); ctx.arc(LX + LW / 2, LY + 90, 65, 0, Math.PI * 2); ctx.clip();
        ctx.drawImage(av, LX + LW / 2 - 65, LY + 25, 130, 130);
        ctx.restore();
        ctx.strokeStyle = rank.color; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(LX + LW / 2, LY + 90, 65, 0, Math.PI * 2); ctx.stroke();
    } catch {}

    rr(ctx, LX + 20, LY + 20, 80, 40, 12);
    ctx.fillStyle = 'rgba(0,0,0,0.60)'; ctx.fill();
    ctx.strokeStyle = C.gold + '88'; ctx.lineWidth = 1.5;
    rr(ctx, LX + 20, LY + 20, 80, 40, 12); ctx.stroke();
    M(ctx, `م.${level}`, LX + 60, LY + 40, 20, C.gold);

    M(ctx, truncate(user.username, 18), LX + LW / 2, LY + 185, 28, C.text);
    M(ctx, rank.name, LX + LW / 2, LY + 225, 22, rank.color);

    const repText = `\u200F${repRank.name}\u200F`; 
    ctx.font = `bold 20px ${FA}`;
    const txtWidth = ctx.measureText(repRank.name).width;

    let ptsText = repPts.toString();
    if (repPts >= 1000000) {
        ptsText = (repPts / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    } else if (repPts >= 1000) {
        ptsText = (repPts / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    }

    ctx.font = `bold 15px Arial, sans-serif`;
    const ptsWidth = ctx.measureText(ptsText).width;

    const boxW = Math.max(130, txtWidth + 50); 
    const boxH = 42;
    const boxX = LX + LW / 2 - boxW / 2;
    const boxY = LY + 250;

    rr(ctx, boxX, boxY, boxW, boxH, 12);
    ctx.fillStyle = repRank.color + '1A';
    ctx.fill();
    ctx.strokeStyle = repRank.color + '88'; 
    ctx.lineWidth = 2;
    rr(ctx, boxX, boxY, boxW, boxH, 12);
    ctx.stroke();

    ctx.font = `bold 20px ${FA}`;
    M(ctx, repText, LX + LW / 2, boxY + boxH / 2 + 2, 20, repRank.color);

    const circleR = Math.max(16, ptsWidth / 2 + 8); 
    const circleX = boxX + boxW; 
    const circleY = boxY;        

    ctx.beginPath();
    ctx.arc(circleX, circleY, circleR, 0, Math.PI * 2);
    ctx.fillStyle = repRank.color; 
    ctx.fill();
    
    ctx.strokeStyle = 'rgba(10, 14, 28, 1)'; 
    ctx.lineWidth = 4;
    ctx.stroke();
    
    ctx.font = `bold 15px Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(ptsText, circleX, circleY + 1); 

    divLine(ctx, LX + 30, LY + 320, LW - 60, rank.color + '44');

    const statItems = [
        { label: 'اجمالي الرحلات',  val: String(trips)   },
        { label: 'الرحلات الناجحة', val: String(success)  },
        { label: 'نسبة النجاح',     val: trips ? `${((success / trips) * 100).toFixed(0)}%` : '—' },
    ];
    let sy = LY + 342;
    for (const s of statItems) {
        rr(ctx, LX + 18, sy - 17, LW - 36, 40, 10);
        ctx.fillStyle = 'rgba(255,255,255,0.03)'; ctx.fill();
        R(ctx, s.label, LX + LW - 28, sy + 3, 18, C.textD);
        L(ctx, s.val,   LX + 28,      sy + 3, 20, C.gold);
        sy += 48;
    }

    divLine(ctx, LX + 25, sy + 8, LW - 50, rank.color + '33');
    sy += 50;

    const successRate = trips > 0 ? success / trips : 0;
    const arcCol = successRate >= 0.7 ? C.green : successRate >= 0.4 ? C.gold : C.red;
    
    // ==========================================
    // 📊 رسم دائرة معدل النجاح والنص بداخلها
    // ==========================================
    const arcX1 = LX + LW / 2, arcY1 = sy + 45, arcR1 = 48;
    ctx.beginPath(); ctx.arc(arcX1, arcY1, arcR1, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 8; ctx.stroke();
    
    ctx.beginPath(); ctx.arc(arcX1, arcY1, arcR1, -Math.PI/2, -Math.PI/2 + (Math.PI * 2 * Math.max(0.001, successRate)));
    ctx.strokeStyle = arcCol; ctx.lineWidth = 8; ctx.lineCap = 'round';
    ctx.shadowColor = arcCol; ctx.shadowBlur = 12; ctx.stroke(); ctx.shadowBlur = 0;
    
    ctx.font = `bold 18px Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FFFFFF'; ctx.fillText(`${(successRate * 100).toFixed(1)}%`, arcX1, arcY1 - 8);
    
    ctx.font = `11px "Bein", "Arial", sans-serif`; ctx.fillStyle = C.textD;
    ctx.fillText('معدل النجاح', arcX1, arcY1 + 14);
    // ==========================================

    const moraBoxY = LY + LH - 62;
    rr(ctx, LX + 18, moraBoxY, LW - 36, 48, 12);
    ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fill();
    ctx.strokeStyle = C.gold + '77'; ctx.lineWidth = 1.5;
    rr(ctx, LX + 18, moraBoxY, LW - 36, 48, 12); ctx.stroke();
    // إزالة كلمة "رصيدك:" وترك الرقم والمورا فقط
    M(ctx, `${Number(mora).toLocaleString()} مورا`, LX + LW / 2, moraBoxY + 24, 22, C.gold);

    const MX = 480, MY = 150, MW = 630, MH = 710;
    const RX = 1130, RY = 150, RW = 440, RH = 710;

    if (active) {
        const destId = active.destinationid || active.destinationId || '';
        const dest   = cfg.destinations.find(d => d.id === destId) || {};
        const acc    = dest.color || C.gold;
        const now    = Date.now();
        const start  = Number(active.starttime  || active.startTime  || now);
        const end    = Number(active.endtime    || active.endTime    || now);
        const prog   = (end <= start) ? 1 : Math.min(1, Math.max(0, (now - start) / (end - start)));
        const atkRes = Number(active.attackresolved || active.attackResolved || 0);
        const hasAtk = atkRes === 0 && (active.guardmessageid || active.guardMessageId);
        const rm     = Number(active.rewardmultiplier || active.rewardMultiplier || 1);

        ctx.save();
        rr(ctx, MX, MY, MW, MH, 28);
        ctx.clip();
        
        const minimapImg = await fetchImageSafe('minimap');
        if (minimapImg) {
            const imgRatio = minimapImg.width / minimapImg.height;
            const boxRatio = MW / MH;
            let drawW = MW, drawH = MH;
            let offsetX = 0, offsetY = 0;

            if (imgRatio > boxRatio) {
                drawH = MH; drawW = MH * imgRatio;
                offsetX = (MW - drawW) / 2;
            } else {
                drawW = MW; drawH = MW / imgRatio;
                offsetY = (MH - drawH) / 2;
            }

            ctx.globalAlpha = 0.85; 
            ctx.drawImage(minimapImg, MX + offsetX, MY + offsetY, drawW, drawH);
            ctx.globalAlpha = 1.0;
        } else {
            ctx.fillStyle = 'rgba(10,14,28,0.85)';
            ctx.fillRect(MX, MY, MW, MH);
        }
        
        const gradient = ctx.createLinearGradient(MX, MY + MH - 180, MX, MY + MH);
        gradient.addColorStop(0, 'rgba(0,0,0,0)');
        gradient.addColorStop(1, 'rgba(0,0,0,0.95)');
        ctx.fillStyle = gradient;
        ctx.fillRect(MX, MY + MH - 180, MW, 180);
        
        ctx.restore();

        ctx.strokeStyle = acc + '44'; 
        ctx.lineWidth = 3;
        rr(ctx, MX, MY, MW, MH, 28); 
        ctx.stroke();

        const oX = MX + (MW * 0.48); 
        const oY = MY + (MH * 0.45);

        const miniMapCoords = {
            "gold_city":        { x: 0.15, y: 0.38 }, 
            "magic_academy":    { x: 0.50, y: 0.15 }, 
            "imperial_capital": { x: 0.85, y: 0.50 }, 
            "ancient_ruins":    { x: 0.25, y: 0.75 }, 
            "nature_valley":    { x: 0.75, y: 0.75 }  
        };

        const relCoords = miniMapCoords[destId] || { x: 0.5, y: 0.2 }; 
        
        const dX = MX + (relCoords.x * MW);
        const dY = MY + (relCoords.y * MH);

        const cpX = (oX + dX) / 2; 
        const cpY = Math.min(oY, dY) - Math.abs(dX - oX) * 0.15; 

        const t  = prog;
        const cX = (1 - t) * (1 - t) * oX + 2 * (1 - t) * t * cpX + t * t * dX;
        const cY = (1 - t) * (1 - t) * oY + 2 * (1 - t) * t * cpY + t * t * dY;

        ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.lineWidth = 10;
        ctx.beginPath(); ctx.moveTo(oX, oY); ctx.quadraticCurveTo(cpX, cpY, dX, dY); ctx.stroke();

        ctx.setLineDash([10, 10]);
        ctx.strokeStyle = acc + '99'; 
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(oX, oY); ctx.quadraticCurveTo(cpX, cpY, dX, dY); ctx.stroke();
        ctx.setLineDash([]);

        if (prog > 0) {
            const pathG = ctx.createLinearGradient(oX, oY, cX, cY);
            pathG.addColorStop(0, acc + 'AA'); 
            pathG.addColorStop(0.7, acc); 
            pathG.addColorStop(1, '#FFFFFF'); 

            ctx.shadowColor = acc; 
            ctx.shadowBlur = 15; 
            ctx.strokeStyle = pathG; 
            ctx.lineWidth = 8; 
            ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(oX, oY); ctx.quadraticCurveTo(cpX, cpY, cX, cY); ctx.stroke();
            
            ctx.shadowBlur = 0;
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)'; 
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(oX, oY); ctx.quadraticCurveTo(cpX, cpY, cX, cY); ctx.stroke();
        }

        ctx.fillStyle = C.green; ctx.shadowColor = C.green; ctx.shadowBlur = 15;
        ctx.beginPath(); ctx.arc(oX, oY, 14, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2; 
        ctx.beginPath(); ctx.arc(oX, oY, 14, 0, Math.PI * 2); ctx.stroke();

        ctx.fillStyle = acc; ctx.shadowColor = acc; ctx.shadowBlur = 20;
        ctx.beginPath(); ctx.arc(dX, dY, 14, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2; 
        ctx.beginPath(); ctx.arc(dX, dY, 14, 0, Math.PI * 2); ctx.stroke();

        const camelImg = await fetchImageSafe('camel');
        if (camelImg) {
            ctx.drawImage(camelImg, cX - 45, cY - 50, 90, 90);
        } else {
            const camelEmoji = hasAtk ? '⚔️' : '🐪';
            ctx.font = `60px ${FE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.shadowColor = hasAtk ? C.red : acc; ctx.shadowBlur = 20;
            ctx.fillText(camelEmoji, cX, cY - 10);
            ctx.shadowBlur = 0;
        }

        if (hasAtk) {
            const bw2 = 260, bx2 = cX - 130, by2 = cY - 100;
            rr(ctx, bx2, by2, bw2, 46, 12);
            ctx.fillStyle = 'rgba(231,76,60,0.95)'; ctx.fill();
            ctx.strokeStyle = C.red; ctx.lineWidth = 2;
            rr(ctx, bx2, by2, bw2, 46, 12); ctx.stroke();
            M(ctx, 'القافلة تتعرض لهجوم', cX, by2 + 23, 20, '#FFFFFF');
        }

        const barY2 = MY + MH - 80;
        
        // ==========================================
        // 📉 رسم شريط التقدم بداخلة النسبة المئوية
        // ==========================================
        drawBar(ctx, MX + 50, barY2, MW - 100, 40, prog, acc, false); // إخفاء النص الافتراضي
        
        ctx.font = `bold 18px Arial, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#FFFFFF';
        ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 4;
        // وضع النسبة المئوية في منتصف شريط التقدم تماماً
        ctx.fillText(`${(prog * 100).toFixed(1)}%`, MX + MW / 2, barY2 + 20); 
        ctx.shadowBlur = 0;
        // ==========================================
        
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        const titleW = ctx.measureText(`في الطريق الى ${dest?.name || ''}`).width + 60;
        rr(ctx, MX + MW / 2 - titleW / 2, MY + 25, titleW, 45, 12);
        ctx.fill();
        M(ctx, `في الطريق الى ${dest?.name || ''}`, MX + MW / 2, MY + 53, 26, acc);

        drawPanel(ctx, RX, RY, RW, RH, acc);

        const destImg = await fetchImageSafe(destId);
        if (destImg) {
            ctx.save();
            rr(ctx, RX, RY, RW, RH, 24); ctx.clip();
            ctx.globalAlpha = 1.0; 
            const imgRatio = destImg.width / destImg.height;
            const drawW = RW;
            const drawH = RW / imgRatio;
            ctx.drawImage(destImg, RX, RY + (RH - drawH)/2, drawW, drawH);
            
            const fadeBg = ctx.createLinearGradient(RX, RY, RX, RY + RH);
            fadeBg.addColorStop(0, 'rgba(10,14,28,0.4)');
            fadeBg.addColorStop(1, 'rgba(10,14,28,0.85)');
            ctx.fillStyle = fadeBg;
            ctx.fillRect(RX, RY, RW, RH);
            
            ctx.restore();
        }

        let rpy = RY + 56;
        ctx.shadowColor = acc + '66'; ctx.shadowBlur = 14;
        M(ctx, 'تقرير الرحلة', RX + RW / 2, rpy, 28, acc);
        ctx.shadowBlur = 0;
        rpy += 46; divLine(ctx, RX + 26, rpy, RW - 52, acc + '55'); rpy += 36;

        const tleft  = Math.max(0, end - Date.now());
        const stMap2 = {
            'ok':  { t: 'تتقدم بامان',   c: C.green  },
            'atk': { t: 'تحت الهجوم',    c: C.red    },
            '1':   { t: 'نجحت الحراسة',  c: C.blue   },
            '2':   { t: 'خسائر فادحة',   c: '#FFA500'},
            '-1':  { t: 'نهبت بالكامل',  c: '#FF2222'},
        };
        const stk2 = hasAtk ? 'atk' : atkRes !== 0 ? String(atkRes) : 'ok';
        const st2  = stMap2[stk2] || stMap2['ok'];
        const rmC  = rm >= 1 ? C.green : rm >= 0.6 ? C.gold : C.red;

        const infoRows = [
            { label: 'الوجهة',          val: truncate(dest?.name || '', 14), vc: acc },
            { label: 'الحالة',          val: st2.t,                            vc: st2.c },
            { label: 'الوقت المتبقي',   val: formatArabicTime(tleft),          vc: tleft <= 0 ? C.green : C.text },
            { label: 'المكافات',        val: `× ${rm.toFixed(2)}`,             vc: rmC },
        ];
        for (const row of infoRows) {
            rr(ctx, RX + 18, rpy - 22, RW - 36, 52, 12);
            ctx.fillStyle = 'rgba(0,0,0,0.65)';
            ctx.fill();
            R(ctx, row.label, RX + RW - 26, rpy + 4, 20, C.textD);
            L(ctx, row.val,   RX + 26,      rpy + 4, 22, row.vc);
            rpy += 68;
        }

        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath(); ctx.arc(RX + RW / 2, rpy + 45, 60, 0, Math.PI * 2); ctx.fill();

        // ==========================================
        // 📊 رسم دائرة نسبة التقدم والنص بداخلها
        // ==========================================
        const arcX2 = RX + RW / 2, arcY2 = rpy + 45, arcR2 = 48;
        ctx.beginPath(); ctx.arc(arcX2, arcY2, arcR2, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 8; ctx.stroke();
        
        ctx.beginPath(); ctx.arc(arcX2, arcY2, arcR2, -Math.PI/2, -Math.PI/2 + (Math.PI * 2 * Math.max(0.001, prog)));
        ctx.strokeStyle = acc; ctx.lineWidth = 8; ctx.lineCap = 'round';
        ctx.shadowColor = acc; ctx.shadowBlur = 12; ctx.stroke(); ctx.shadowBlur = 0;
        
        ctx.font = `bold 18px Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#FFFFFF'; ctx.fillText(`${(prog * 100).toFixed(1)}%`, arcX2, arcY2 - 8);
        
        ctx.font = `11px "Bein", "Arial", sans-serif`; ctx.fillStyle = C.textD;
        ctx.fillText('نسبة التقدم', arcX2, arcY2 + 14);
        // ==========================================

    } else {
        ctx.save();
        rr(ctx, MX, MY, MW, MH, 28);
        ctx.clip();
        
        const minimapImg = await fetchImageSafe('minimap');
        if (minimapImg) {
            const imgRatio = minimapImg.width / minimapImg.height;
            const boxRatio = MW / MH;
            let drawW = MW, drawH = MH;
            let offsetX = 0, offsetY = 0;

            if (imgRatio > boxRatio) {
                drawH = MH; drawW = MH * imgRatio;
                offsetX = (MW - drawW) / 2;
            } else {
                drawW = MW; drawH = MW / imgRatio;
                offsetY = (MH - drawH) / 2;
            }

            ctx.globalAlpha = 0.95;
            ctx.drawImage(minimapImg, MX + offsetX, MY + offsetY, drawW, drawH);
            ctx.globalAlpha = 1.0;
        } else {
            ctx.fillStyle = 'rgba(10,14,28,0.85)';
            ctx.fillRect(MX, MY, MW, MH);
        }

        const gradient = ctx.createLinearGradient(MX, MY + MH - 180, MX, MY + MH);
        gradient.addColorStop(0, 'rgba(0,0,0,0)');
        gradient.addColorStop(1, 'rgba(0,0,0,0.95)');
        ctx.fillStyle = gradient;
        ctx.fillRect(MX, MY + MH - 180, MW, 180);
        
        ctx.restore();

        ctx.strokeStyle = C.gold + '44'; 
        ctx.lineWidth = 3;
        rr(ctx, MX, MY, MW, MH, 28); 
        ctx.stroke();

        ctx.shadowColor = C.gold + 'BB'; ctx.shadowBlur = 20;
        
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        rr(ctx, MX + MW / 2 - 180, MY + MH - 135, 360, 100, 16);
        ctx.fill();
        
        M(ctx, 'القوافل مستعدة للانطلاق', MX + MW / 2, MY + MH - 100, 32, C.gold);
        ctx.shadowBlur = 0;
        
        ctx.shadowColor = '#000000'; ctx.shadowBlur = 10;
        M(ctx, 'جهز قافلتك وابدأ رحلتك الآن...', MX + MW / 2, MY + MH - 55, 22, '#EEEEEE');
        ctx.shadowBlur = 0;

        drawPanel(ctx, RX, RY, RW, RH, C.gold);
        let rpy = RY + 52;
        ctx.shadowColor = C.gold + '77'; ctx.shadowBlur = 16;
        M(ctx, 'مستوى الترقيات', RX + RW / 2, rpy, 28, C.gold);
        ctx.shadowBlur = 0;
        rpy += 44; divLine(ctx, RX + 26, rpy, RW - 52, C.gold + '44'); rpy += 24;

        const upgCfg = [
            { key: 'capacity_rank', emoji: '📦', name: 'سعة الحمولة',  col: '#FF9933' },
            { key: 'speed_rank',    emoji: '⚡', name: 'سرعة القافلة', col: '#00C3FF' },
            { key: 'defense_rank',  emoji: '🛡️', name: 'درع القافلة',  col: '#8888FF' },
            { key: 'luck_rank',     emoji: '🍀', name: 'حظ القافلة',   col: '#2ECC71' },
        ];
        for (const u of upgCfg) {
            const lvl2 = Number(stats[u.key] || 1);
            rr(ctx, RX + 14, rpy, RW - 28, 90, 14);
            const rowBg = ctx.createLinearGradient(RX + 14, rpy, RX + RW - 14, rpy + 90);
            rowBg.addColorStop(0, u.col + '18'); rowBg.addColorStop(1, 'rgba(4,6,12,0.85)'); 
            ctx.fillStyle = rowBg; ctx.fill();
            ctx.strokeStyle = u.col + '33'; ctx.lineWidth = 1.5;
            rr(ctx, RX + 14, rpy, RW - 28, 90, 14); ctx.stroke();

            ctx.font = `28px ${FE}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
            ctx.fillText(u.emoji, RX + 26, rpy + 30);
            L(ctx, u.name, RX + 68, rpy + 22, 20, C.text);
            drawStars(ctx, lvl2, 5, RX + RW - 22, rpy + 22, 20, u.col);
            drawBar(ctx, RX + 68, rpy + 50, RW - 106, 16, lvl2 / 5, u.col, false);
            L(ctx, `المستوى ${lvl2}/5`, RX + 68, rpy + 76, 14, u.col);
            rpy += 100;
        }
        divLine(ctx, RX + 26, rpy + 6, RW - 52, C.gold + '33'); rpy += 34;
        const pct = trips > 0 ? success / trips : 0;
        
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        rr(ctx, RX + 20, rpy - 10, RW - 40, 90, 12);
        ctx.fill();
        
        M(ctx, `${success} رحلة ناجحة من ${trips}`, RX + RW / 2, rpy + 8, 20, C.text);
        rpy += 36;
        drawBar(ctx, RX + 36, rpy, RW - 72, 26, pct, C.gold, false);
        M(ctx, `معدل النجاح ${(pct * 100).toFixed(0)}%`, RX + RW / 2, rpy + 42, 17, C.textD);
    }

    return toBuf(canvas);
}

module.exports = { generateCaravanHub };
