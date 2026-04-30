const { loadImage } = require('@napi-rs/canvas');
const {
    createCanvas, W, H, C, FA, FE,
    drawBg, drawHeader, drawCornerAccents, drawPanel,
    drawBar, drawArcProgress, drawStars, divLine,
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

    const repText = `‫${repRank.name}‬`;
    ctx.font = `bold 20px ${FA}`;
    const txtWidth = ctx.measureText(repText).width;
    const ptsText = repPts.toLocaleString();
    ctx.font = `bold 16px Arial, sans-serif`;
    const ptsWidth = ctx.measureText(ptsText).width;

    const pillW = Math.max(50, ptsWidth + 20);
    const pillH = 34;
    const totalWidth = txtWidth + 16 + pillW;
    const startX = LX + LW / 2 + totalWidth / 2;

    ctx.font = `bold 20px ${FA}`;
    R(ctx, repText, startX, LY + 270, 20, repRank.color);

    const pillX = startX - txtWidth - 16 - pillW;
    rr(ctx, pillX, LY + 270 - pillH / 2, pillW, pillH, pillH / 2);
    ctx.fillStyle = repRank.color + '22'; ctx.fill();
    ctx.strokeStyle = repRank.color + '77'; ctx.lineWidth = 2;
    rr(ctx, pillX, LY + 270 - pillH / 2, pillW, pillH, pillH / 2); ctx.stroke();
    ctx.font = `bold 16px Arial, sans-serif`;
    M(ctx, ptsText, pillX + pillW / 2, LY + 270 + 2, 16, repRank.color);

    divLine(ctx, LX + 30, LY + 310, LW - 60, rank.color + '44');

    const statItems = [
        { label: 'اجمالي الرحلات',  val: String(trips)   },
        { label: 'الرحلات الناجحة', val: String(success)  },
        { label: 'نسبة النجاح',     val: trips ? `${((success / trips) * 100).toFixed(0)}%` : '—' },
    ];
    let sy = LY + 332;
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
    drawArcProgress(ctx, LX + LW / 2, sy + 45, 42, successRate, arcCol, 22, 'معدل النجاح');

    const moraBoxY = LY + LH - 62;
    rr(ctx, LX + 18, moraBoxY, LW - 36, 48, 12);
    ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fill();
    ctx.strokeStyle = C.gold + '77'; ctx.lineWidth = 1.5;
    rr(ctx, LX + 18, moraBoxY, LW - 36, 48, 12); ctx.stroke();
    M(ctx, `رصيدك: ${Number(mora).toLocaleString()} مورا`, LX + LW / 2, moraBoxY + 24, 20, C.gold);

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

        drawPanel(ctx, MX, MY, MW, MH, acc);

        const oX = MX + 100,       oY = MY + MH - 220;
        const dX = MX + MW - 100,  dY = MY + 150;
        const cpX = (oX + dX) / 2, cpY = (oY + dY) / 2 - 140;

        const t  = prog;
        const cX = (1 - t) * (1 - t) * oX + 2 * (1 - t) * t * cpX + t * t * dX;
        const cY = (1 - t) * (1 - t) * oY + 2 * (1 - t) * t * cpY + t * t * dY;

        ctx.setLineDash([14, 12]);
        ctx.strokeStyle = acc + '33'; ctx.lineWidth = 8;
        ctx.beginPath(); ctx.moveTo(oX, oY); ctx.quadraticCurveTo(cpX, cpY, dX, dY); ctx.stroke();
        ctx.setLineDash([]);

        const pathG = ctx.createLinearGradient(oX, oY, cX, cY);
        pathG.addColorStop(0, acc + '66'); pathG.addColorStop(1, acc);
        ctx.strokeStyle = pathG; ctx.lineWidth = 10;
        ctx.shadowColor = acc; ctx.shadowBlur = 20;
        ctx.beginPath(); ctx.moveTo(oX, oY); ctx.quadraticCurveTo(cpX, cpY, cX, cY); ctx.stroke();
        ctx.shadowBlur  = 0;

        ctx.fillStyle = C.green; ctx.shadowColor = C.green; ctx.shadowBlur = 15;
        ctx.beginPath(); ctx.arc(oX, oY, 18, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        M(ctx, '🏠', oX, oY - 35, 34, C.text);

        ctx.fillStyle = acc; ctx.shadowColor = acc; ctx.shadowBlur = 25;
        ctx.beginPath(); ctx.arc(dX, dY, 20, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.font = `46px ${FE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(dest?.emoji || '📍', dX, dY - 45);

        const camelImg = await fetchImageSafe('camel');
        if (camelImg) {
            ctx.drawImage(camelImg, cX - 60, cY - 70, 120, 120);
        } else {
            const camelEmoji = hasAtk ? '⚔️' : '🐪';
            ctx.font = `80px ${FE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(camelEmoji, cX, cY - 14);
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
        M(ctx, `${(prog * 100).toFixed(1)}%`, MX + MW / 2, barY2 - 25, 24, acc);
        drawBar(ctx, MX + 50, barY2, MW - 100, 40, prog, acc);
        M(ctx, `في الطريق الى ${dest?.name || ''}`, MX + MW / 2, MY + 50, 26, acc);

        drawPanel(ctx, RX, RY, RW, RH, acc);

        const destImg = await fetchImageSafe(destId);
        if (destImg) {
            ctx.save();
            rr(ctx, RX, RY, RW, RH, 24); ctx.clip();
            ctx.globalAlpha = 0.22;
            const imgRatio = destImg.width / destImg.height;
            const drawW = RW;
            const drawH = RW / imgRatio;
            ctx.drawImage(destImg, RX, RY + (RH - drawH)/2, drawW, drawH);
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
            ctx.fillStyle = 'rgba(0,0,0,0.52)'; ctx.fill();
            R(ctx, row.label, RX + RW - 26, rpy + 4, 20, C.textD);
            L(ctx, row.val,   RX + 26,      rpy + 4, 22, row.vc);
            rpy += 68;
        }

        drawArcProgress(ctx, RX + RW / 2, rpy + 45, 42, prog, acc, 22, 'نسبة التقدم');

    } else {
        drawPanel(ctx, MX, MY, MW, MH, C.gold);
        const camelImg = await fetchImageSafe('camel');
        if(camelImg) {
            ctx.drawImage(camelImg, MX + MW / 2 - 150, MY + MH * 0.45 - 150, 300, 300);
        } else {
            ctx.font = `200px ${FE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('🐪', MX + MW / 2, MY + MH * 0.45);
        }

        ctx.save();
        const glowR = ctx.createRadialGradient(MX+MW/2, MY+MH*0.45, 80, MX+MW/2, MY+MH*0.45, 240);
        glowR.addColorStop(0, C.gold + '22'); glowR.addColorStop(1, 'transparent');
        ctx.fillStyle = glowR;
        ctx.beginPath(); ctx.arc(MX+MW/2, MY+MH*0.45, 240, 0, Math.PI*2); ctx.fill();
        ctx.restore();

        ctx.shadowColor = C.gold + '77'; ctx.shadowBlur = 18;
        M(ctx, 'القوافل مستعدة للانطلاق', MX + MW / 2, MY + MH - 120, 32, C.gold);
        ctx.shadowBlur = 0;
        M(ctx, 'جهز قافلتك وابدأ رحلتك', MX + MW / 2, MY + MH - 68, 24, C.textD);

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
            rowBg.addColorStop(0, u.col + '18'); rowBg.addColorStop(1, 'rgba(4,6,12,0.55)');
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
        M(ctx, `${success} رحلة ناجحة من ${trips}`, RX + RW / 2, rpy + 8, 20, C.text);
        rpy += 36;
        drawBar(ctx, RX + 36, rpy, RW - 72, 26, pct, C.gold, false);
        M(ctx, `معدل النجاح ${(pct * 100).toFixed(0)}%`, RX + RW / 2, rpy + 42, 17, C.textD);
    }

    return toBuf(canvas);
}

module.exports = { generateCaravanHub };
