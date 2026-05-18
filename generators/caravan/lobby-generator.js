const {
    createCanvas, loadImage, W, H, C, FA, FE,
    drawBg, drawHeader, drawCornerAccents, drawPanel,
    fetchImageSafe, toBuf, R, M, L, rr, divLine
} = require('./shared');

const { DESTINATION_ENEMIES, DEFAULT_ENEMIES } = require('../../handlers/caravan/combat');
const { BANDIT_SKILLS } = require('../../handlers/caravan/bandit-skills');

const _absImgCache = new Map();
async function fetchAbsoluteImage(url) {
    if (!url) return null;
    if (_absImgCache.has(url)) return _absImgCache.get(url);
    try {
        const res = await fetch(url);
        if (!res.ok) { _absImgCache.set(url, null); return null; }
        const buf = await res.arrayBuffer();
        const img = await loadImage(Buffer.from(buf));
        _absImgCache.set(url, img);
        return img;
    } catch { _absImgCache.set(url, null); return null; }
}

// ============================================================================
// 1. مولد صورة إشعار الكمين 
// ============================================================================
async function generateAmbushAlertImage(dest) {
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');
    
    try { 
        await drawBg(ctx, 'banditattack'); 
    } catch { 
        ctx.fillStyle = '#05050A'; ctx.fillRect(0, 0, W, H); 
    }

    await drawHeader(ctx, 'تحذير أمني عاجل', `القافلة المتجهة إلى ${dest.name} تتعرض لهجوم`);
    drawCornerAccents(ctx);

    const PX = 80, PY = 180, PW = W - 160, PH = H - 280;
    drawPanel(ctx, PX, PY, PW, PH, C.red, { radius: 32 });
    
    rr(ctx, PX, PY, PW, PH, 32);
    ctx.fillStyle = 'rgba(231,76,60,0.08)'; ctx.fill();

    ctx.font = `80px ${FE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('⚔️', W / 2, PY + 70);

    M(ctx, 'قطاع الطرق يحاصرون القافلة!', W / 2, PY + 160, 45, C.red);
    M(ctx, 'لديك وقت محدود لإرسال الفزعة أو دفع الرشوة.', W / 2, PY + 215, 30, C.textD);

    divLine(ctx, PX + 60, PY + 255, PW - 120, C.red + '44');

    M(ctx, 'قطاع الطرق يتربصون بالقافلة في انتظار قرارك.', W / 2, PY + 310, 32, C.textD);
    M(ctx, 'اختر أحد الخيارات أدناه:', W / 2, PY + 360, 28, C.text);

    const by = PY + PH - 130;
    const bx1 = PX + 50, bx2 = PX + PW / 2 + 10, bw = PW / 2 - 60, bh = 80;

    rr(ctx, bx1, by, bw, bh, 16); ctx.fillStyle = 'rgba(46,204,113,0.15)'; ctx.fill();
    ctx.strokeStyle = C.green; ctx.lineWidth = 2.5; rr(ctx, bx1, by, bw, bh, 16); ctx.stroke();
    M(ctx, '🛡️ حماية القافلة', bx1 + bw / 2, by + 40, 32, C.green);

    rr(ctx, bx2, by, bw, bh, 16); ctx.fillStyle = 'rgba(231,76,60,0.15)'; ctx.fill();
    ctx.strokeStyle = C.red; ctx.lineWidth = 2.5; rr(ctx, bx2, by, bw, bh, 16); ctx.stroke();
    M(ctx, '💰 دفع رشوة', bx2 + bw / 2, by + 40, 32, C.red);
    
    return toBuf(canvas);
}

// ============================================================================
// 2. مولد اللوبي (تجمع الحراس)
// ============================================================================
async function generateLobbyImage(hostId, party, partyClasses, destConfig, isAmbush, guild) {
    const canvas = createCanvas(W, H); // 1600x900
    const ctx = canvas.getContext('2d');
    
    try { 
        await drawBg(ctx, isAmbush ? 'banditattack' : 'journeymap'); 
    } catch { 
        ctx.fillStyle = '#05050A'; ctx.fillRect(0, 0, W, H); 
    }

    const title = isAmbush ? 'الدفاع عن القافلة' : 'تأمين مسار القافلة';
    const subtitle = `الوجهة: ${destConfig.name}`;
    await drawHeader(ctx, title, subtitle);
    drawCornerAccents(ctx);

    const PX = 100, PY = 180, PW = W - 200, PH = H - 250;
    drawPanel(ctx, PX, PY, PW, PH, isAmbush ? C.red : C.gold, { radius: 32 });

    if (isAmbush) {
        M(ctx, '⚠️ قطاع الطرق يقتربون! الفريق يتجهز للقتال ⚠️', W / 2, PY + 70, 45, C.red);
    } else {
        M(ctx, 'تجمع الحراس لتأمين الرحلة', W / 2, PY + 70, 45, C.gold);
    }
    divLine(ctx, PX + 200, PY + 120, PW - 400, (isAmbush ? C.red : C.gold) + '55');

    const boxW = 380, boxH = 420, gap = 60;
    const totalW = (3 * boxW) + (2 * gap);
    const startX = (W - totalW) / 2;
    const boxY = PY + 160;

    const CLASS_OPTIONS = [
        { v: 'Tank',     l: 'الطليعة',  e: '🛡️', color: C.blue },
        { v: 'Priest',   l: 'الكاهن',   e: '✨', color: C.gold },
        { v: 'Mage',     l: 'الساحر',   e: '🔮', color: C.purple },
        { v: 'Summoner', l: 'المستدعي', e: '🐺', color: C.green },
    ];

    const members = await Promise.all(party.map(uid => guild.members.fetch(uid).catch(() => null)));

    // Preload all avatar images in parallel
    const avatarImgs = await Promise.allSettled(members.map(mem =>
        mem ? fetchAbsoluteImage(mem.user.displayAvatarURL({ extension: 'png', size: 256 })) : Promise.resolve(null)
    ));

    for (let i = 0; i < 3; i++) {
        const cx = startX + i * (boxW + gap);
        const isFilled = i < party.length;
        
        drawPanel(ctx, cx, boxY, boxW, boxH, isFilled ? C.gold : '#555', { radius: 24 });

        if (isFilled) {
            const uid = party[i];
            const mem = members[i];
            const clsVal = partyClasses.get(uid);
            let clsObj = CLASS_OPTIONS.find(c => c.v === clsVal);
            const isLeader = (i === 0);
            
            if (isLeader && !clsObj) clsObj = { l: 'قائد القافلة', e: '👑', color: C.gold };

            let avatarImg = null;
            if (mem) {
                const avaResult = avatarImgs[i];
                if (avaResult.status === 'fulfilled') avatarImg = avaResult.value;
            }

            const avaSize = 160;
            const avaX = cx + boxW / 2;
            const avaY = boxY + 120;

            if (avatarImg) {
                ctx.save();
                ctx.beginPath(); ctx.arc(avaX, avaY, avaSize / 2, 0, Math.PI * 2); ctx.clip();
                ctx.drawImage(avatarImg, avaX - avaSize / 2, avaY - avaSize / 2, avaSize, avaSize);
                ctx.restore();
                
                ctx.beginPath(); ctx.arc(avaX, avaY, avaSize / 2, 0, Math.PI * 2);
                ctx.strokeStyle = clsObj.color || C.gold; ctx.lineWidth = 4; ctx.stroke();
            } else {
                ctx.fillStyle = '#222';
                ctx.beginPath(); ctx.arc(avaX, avaY, avaSize / 2, 0, Math.PI * 2); ctx.fill();
                ctx.font = `60px ${FE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillStyle = '#555'; ctx.fillText('👤', avaX, avaY);
            }

            const name = mem ? (mem.displayName || mem.user.username) : 'غير معروف';
            M(ctx, name, cx + boxW / 2, boxY + 250, 36, '#FFFFFF');

            rr(ctx, cx + 60, boxY + 300, boxW - 120, 60, 30);
            ctx.fillStyle = (clsObj.color || C.gold) + '33'; ctx.fill();
            ctx.strokeStyle = clsObj.color || C.gold; ctx.lineWidth = 2;
            rr(ctx, cx + 60, boxY + 300, boxW - 120, 60, 30); ctx.stroke();
            
            M(ctx, `${clsObj.e} ${clsObj.l}`, cx + boxW / 2, boxY + 333, 30, clsObj.color || C.gold);

            if (isLeader) {
                ctx.font = `50px ${FE}`;
                ctx.fillText('👑', cx + boxW / 2, boxY + 20);
            }
        } else {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
            rr(ctx, cx + 40, boxY + 40, boxW - 80, boxW - 80, 24); ctx.fill();
            
            ctx.font = `100px ${FE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillStyle = '#555'; ctx.fillText('➕', cx + boxW / 2, boxY + boxH / 2 - 30);
            M(ctx, 'بانتظار حارس...', cx + boxW / 2, boxY + boxH / 2 + 70, 32, '#777');
        }
    }

    return toBuf(canvas);
}

// ============================================================================
// 3. مولد صورة تأكيد الوجهة (تأمين الطريق أو التخطي) 👑
// ============================================================================
async function generateDestChoiceImage(dest, mora) {
    const canvas = createCanvas(W, H); // 1600x900
    const ctx = canvas.getContext('2d');

    // Parallel preload: bg + destination image at the same time
    const destUrl = `https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev/images/destinations/${dest.id}.png`;
    await Promise.allSettled([
        fetchImageSafe('journeymap'),
        fetchAbsoluteImage(destUrl),
    ]);

    try {
        await drawBg(ctx, 'journeymap');
    } catch(e) {
        ctx.fillStyle = '#05050A'; ctx.fillRect(0, 0, W, H);
    }

    await drawHeader(ctx, 'تأكيد مسار القافلة', `الوجهة المختارة: ${dest.name}`);
    drawCornerAccents(ctx);

    const acc = dest.color || C.gold;

    // ── القسم الأيسر: معلومات المدينة ──
    const LX = 80, LY = 180, LW = 650, LH = 640;
    drawPanel(ctx, LX, LY, LW, LH, acc, { radius: 32 });

    const destImg = await fetchAbsoluteImage(destUrl);

    if (destImg) {
        ctx.save();
        rr(ctx, LX + 20, LY + 20, LW - 40, LH - 40, 24);
        ctx.clip();
        const imgRatio = destImg.width / destImg.height;
        const drawW = (LH - 40) * imgRatio;
        ctx.drawImage(destImg, LX + 20 - (drawW - (LW - 40))/2, LY + 20, drawW, LH - 40);
        
        const imgFade = ctx.createLinearGradient(LX + 20, LY + 20, LX + 20, LY + LH - 20);
        imgFade.addColorStop(0.3, 'transparent');
        imgFade.addColorStop(1, 'rgba(4,6,14,0.95)');
        ctx.fillStyle = imgFade; 
        ctx.fillRect(LX + 20, LY + 20, LW - 40, LH - 40);
        ctx.restore();
    } else {
        const bg = ctx.createLinearGradient(LX, LY, LX, LY + LH);
        bg.addColorStop(0, acc + '33'); 
        bg.addColorStop(1, 'rgba(4,6,14,0.95)');
        ctx.fillStyle = bg; 
        rr(ctx, LX + 20, LY + 20, LW - 40, LH - 40, 24); ctx.fill();
    }

    ctx.font = `140px ${FE}`; 
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(dest.emoji, LX + LW / 2, LY + 160);

    M(ctx, dest.name, LX + LW / 2, LY + 300, 55, acc);
    divLine(ctx, LX + 80, LY + 350, LW - 160, acc + '44');

    const canAfford = Number(mora) >= dest.cost;
    const riskC = dest.risk_factor >= 0.35 ? C.red : dest.risk_factor >= 0.25 ? '#FFA500' : C.green;

    const rows = [
        { label: 'المدة الزمنية', val: `${dest.duration_hours} ساعة`, vc: C.text },
        { label: 'نسبة الخطر', val: `%${(dest.risk_factor * 100).toFixed(0)}`, vc: riskC },
        { label: 'تكلفة الرحلة', val: `${dest.cost.toLocaleString()} مورا`, vc: canAfford ? C.gold : C.red },
    ];

    let py = LY + 420;
    for (const row of rows) {
        rr(ctx, LX + 40, py - 30, LW - 80, 60, 16);
        ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill();
        R(ctx, row.label, LX + LW - 60, py, 28, C.textD);
        L(ctx, row.val, LX + 60, py, 28, row.vc);
        py += 75;
    }

    if (!canAfford) {
        rr(ctx, LX + LW / 2 - 150, LY + LH - 90, 300, 60, 20);
        ctx.fillStyle = 'rgba(231,76,60,0.40)'; ctx.fill();
        ctx.strokeStyle = C.red + '88'; ctx.lineWidth = 2.5;
        rr(ctx, LX + LW / 2 - 150, LY + LH - 90, 300, 60, 20); ctx.stroke();
        M(ctx, 'رصيد غير كاف', LX + LW / 2, LY + LH - 60, 28, C.red);
    }

    // ── القسم الأيمن: التحذير والأزرار ──
    const RX = LX + LW + 60;
    const RY = LY;
    const RW = W - RX - 80;
    const RH = LH;

    drawPanel(ctx, RX, RY, RW, RH, C.blue, { radius: 32 });

    M(ctx, '⚠️ تحذير: مسار محفوف بالمخاطر ⚠️', RX + RW / 2, RY + 80, 48, C.red);
    divLine(ctx, RX + 80, RY + 140, RW - 160, C.red + '55');

    const banditCount = 5;
    M(ctx, `تم رصد ${banditCount} أوكار لقطاع الطرق على هذا المسار.`, RX + RW / 2, RY + 220, 34, C.text);
    M(ctx, 'هل تفضل تأمين الطريق مسبقاً وتجميع حراس لحماية بضاعتك،', RX + RW / 2, RY + 280, 30, C.textD);
    M(ctx, 'أم أنك ستجازف وترسل القافلة دون حماية؟', RX + RW / 2, RY + 330, 30, C.textD);

    const actionY = RY + 420;
    
    rr(ctx, RX + 80, actionY, RW - 160, 90, 20);
    ctx.fillStyle = 'rgba(231,76,60,0.15)'; ctx.fill();
    ctx.strokeStyle = C.red; ctx.lineWidth = 3;
    rr(ctx, RX + 80, actionY, RW - 160, 90, 20); ctx.stroke();
    M(ctx, '⚔️ هجوم وتأمين الطريق', RX + RW / 2, actionY + 45, 36, C.red);

    rr(ctx, RX + 80, actionY + 120, RW - 160, 90, 20);
    ctx.fillStyle = 'rgba(52,152,219,0.15)'; ctx.fill();
    ctx.strokeStyle = C.blue; ctx.lineWidth = 3;
    rr(ctx, RX + 80, actionY + 120, RW - 160, 90, 20); ctx.stroke();
    M(ctx, '🐫 تخطي الحماية', RX + RW / 2, actionY + 165, 36, C.blue);

    return toBuf(canvas);
}

// ============================================================================
// 4. مولد نتيجة الكمين (الموت المهلة / النهب)
// ============================================================================
async function generateAmbushResultImage(dest, type) {
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    try {
        await drawBg(ctx, 'banditattack');
    } catch {
        ctx.fillStyle = '#05050A'; ctx.fillRect(0, 0, W, H);
    }

    const isTimeout = type === 'timeout';
    const title = isTimeout ? 'انتهت المهلة!' : 'فشل الدفاع';
    const subtitle = isTimeout
        ? 'لم يستجب أحد لنداء الاستغاثة'
        : 'لم يتم تنظيم الدفاع في الوقت المحدد';
    await drawHeader(ctx, title, subtitle);
    drawCornerAccents(ctx);

    const PX = 80, PY = 180, PW = W - 160, PH = H - 280;
    drawPanel(ctx, PX, PY, PW, PH, C.red, { radius: 32 });
    rr(ctx, PX, PY, PW, PH, 32);
    ctx.fillStyle = 'rgba(231,76,60,0.12)'; ctx.fill();

    ctx.font = `100px ${FE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('💀', W / 2, PY + 80);

    M(ctx, `نُهبت قافلة ${dest.name}!`, W / 2, PY + 170, 45, C.red);
    M(ctx, 'قطاع الطرق استولوا على البضائع', W / 2, PY + 220, 30, C.textD);

    divLine(ctx, PX + 60, PY + 255, PW - 120, C.red + '44');

    const enemies = (dest.id && DESTINATION_ENEMIES[dest.id]) ? DESTINATION_ENEMIES[dest.id] : DEFAULT_ENEMIES;
    const ey2 = PY + 285;
    M(ctx, 'قطاع الطرق الذين هاجموا القافلة:', W / 2, ey2, 26, C.textD);

    for (let i = 0; i < enemies.length; i++) {
        const enemy = enemies[i];
        const ey = ey2 + 50 + i * 40;
        const skill = BANDIT_SKILLS[enemy.name];
        const skillStr = skill ? `${skill.emoji} ${skill.name}` : '';
        const isBoss = enemy.isBoss;

        ctx.font = isBoss ? `bold 20px ${FA}` : `17px ${FA}`;
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        ctx.direction = 'rtl';
        ctx.fillStyle = isBoss ? C.red : C.text;
        ctx.fillText(isBoss ? `👑 ${enemy.name}` : `◈ ${enemy.name}`, PX + PW - 40, ey);

        if (skillStr) {
            ctx.font = `15px ${FA}`;
            ctx.textAlign = 'left';
            ctx.direction = 'ltr';
            ctx.fillStyle = C.textD;
            ctx.fillText(skillStr, PX + 40, ey);
        }
    }

    const details = isTimeout
        ? '❌ انتهت مهلة الـ 30 دقيقة دون رد من مالك القافلة'
        : '❌ فشل تجميع الحراس للدفاع عن القافلة';

    const summaryY = ey2 + 50 + enemies.length * 40 + 20;
    divLine(ctx, PX + 60, summaryY, PW - 120, C.red + '44');
    M(ctx, details, W / 2, summaryY + 45, 28, '#FF6666');
    M(ctx, '⏳ قافلتك قيد الصيانة — لا يمكنك إرسال رحلة الآن', W / 2, summaryY + 95, 26, C.textD);

    return toBuf(canvas);
}

// ============================================================================
// 5. مولد صورة دفع الرشوة
// ============================================================================
async function generateBribeSuccessImage(dest, looted, remainingMin) {
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    try {
        await drawBg(ctx, 'banditattack');
    } catch {
        ctx.fillStyle = '#05050A'; ctx.fillRect(0, 0, W, H);
    }

    await drawHeader(ctx, '💰 تم دفع الرشوة', `قطاع الطرق أخذوا حصتهم`);
    drawCornerAccents(ctx);

    const PX = 80, PY = 180, PW = W - 160, PH = H - 280;
    drawPanel(ctx, PX, PY, PW, PH, C.gold, { radius: 32 });
    rr(ctx, PX, PY, PW, PH, 32);
    ctx.fillStyle = 'rgba(241,196,15,0.08)'; ctx.fill();

    ctx.font = `90px ${FE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('💰', W / 2, PY + 70);

    M(ctx, 'قطاع الطرق قبلوا الرشوة وتركون القافلة', W / 2, PY + 160, 38, C.gold);
    M(ctx, `تستمر رحلتك إلى ${dest.emoji} ${dest.name}`, W / 2, PY + 210, 30, C.text);

    divLine(ctx, PX + 60, PY + 255, PW - 120, C.gold + '44');

    let currentY = PY + 300;

    if (looted && looted.length > 0) {
        M(ctx, '💀 البضائع التي نُهبت:', W / 2, currentY, 28, C.red);
        currentY += 45;
        for (const item of looted) {
            const raw = String(item.itemId || 'عنصر');
            const displayName = raw.replace(/_/g, ' ');
            const itemQty = item.quantity || 1;
            M(ctx, `✗ ${itemQty}x ${displayName}`, W / 2, currentY, 24, C.textD);
            currentY += 35;
        }
    } else {
        M(ctx, 'لم يتم نهب أي بضائع — لا توجد بضائع معروضة', W / 2, currentY, 26, C.textD);
    }

    const eta = Math.max(1, remainingMin);
    currentY = Math.max(currentY + 40, PY + PH - 80);
    divLine(ctx, PX + 60, currentY - 10, PW - 120, C.gold + '44');
    M(ctx, `✅ القافلة ستصل بعد ${eta} دقيقة`, W / 2, currentY + 35, 28, C.green);

    return toBuf(canvas);
}

module.exports = { generateAmbushAlertImage, generateLobbyImage, generateDestChoiceImage, generateAmbushResultImage, generateBribeSuccessImage };
