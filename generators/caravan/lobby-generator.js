const {
    createCanvas, W, H, C, FE,
    drawBg, drawHeader, drawCornerAccents,
    fetchImageSafe, toBuf,
    M, rr, divLine
} = require('./shared');

// ============================================================================
// 1. مولد صورة إشعار الكمين (تصميم سينمائي فخم باللون الأحمر)
// ============================================================================
async function generateAmbushAlertImage(dest) {
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');
    
    // 1. رسم الخلفية الأساسية الخاصة بالمعارك
    try {
        await drawBg(ctx, 'banditattack');
    } catch(e) {
        ctx.fillStyle = '#05050A';
        ctx.fillRect(0, 0, W, H);
    }
    
    // 2. تظليل إضافي بصورة المدينة إن وجدت (دمج سينمائي)
    let destImg = null;
    try {
        destImg = await fetchImageSafe(dest.id);
    } catch(e) {}
    
    if (destImg) {
        ctx.save();
        ctx.globalAlpha = 0.4;
        const imgRatio = destImg.width / destImg.height;
        let drawW = W, drawH = W / imgRatio;
        if (drawH < H) { drawH = H; drawW = H * imgRatio; }
        ctx.drawImage(destImg, -(drawW - W)/2, -(drawH - H)/2, drawW, drawH);
        ctx.restore();
    }
    
    // تظليل أحمر مرعب للكمين
    const grad = ctx.createRadialGradient(W/2, H/2, H/4, W/2, H/2, W);
    grad.addColorStop(0, 'rgba(231, 76, 60, 0.2)');
    grad.addColorStop(1, 'rgba(231, 76, 60, 0.8)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    await drawHeader(ctx, 'تحذير — القافلة في خطر!', `الوجهة: ${dest.name}`);
    drawCornerAccents(ctx);
    
    // النصوص والتحذير
    M(ctx, '⚔️ قطاع الطرق يحاصرون القافلة ⚔️', W / 2, H / 2 - 80, 55, C.red);
    M(ctx, 'تحتاج إلى حراس للنجاة، أو دفع الرشوة لفقدان جزء من المكافأة!', W / 2, H / 2, 36, '#FFFFFF');
    
    // رسم مربعات توضيحية لخيارات الأزرار أسفل الصورة
    const boxW = 400, boxH = 120, gap = 60;
    const startX = (W - (2 * boxW + gap)) / 2;
    
    // مربع الحماية
    ctx.fillStyle = 'rgba(46, 204, 113, 0.15)';
    rr(ctx, startX, H / 2 + 100, boxW, boxH, 20); ctx.fill();
    ctx.strokeStyle = '#2ECC71'; ctx.lineWidth = 3;
    rr(ctx, startX, H / 2 + 100, boxW, boxH, 20); ctx.stroke();
    M(ctx, '🛡️ حماية القافلة', startX + boxW / 2, H / 2 + 165, 40, '#2ECC71');
    
    // مربع الرشوة
    ctx.fillStyle = 'rgba(231, 76, 60, 0.15)';
    rr(ctx, startX + boxW + gap, H / 2 + 100, boxW, boxH, 20); ctx.fill();
    ctx.strokeStyle = '#E74C3C'; ctx.lineWidth = 3;
    rr(ctx, startX + boxW + gap, H / 2 + 100, boxW, boxH, 20); ctx.stroke();
    M(ctx, '💰 دفع رشوة', startX + boxW + gap + boxW / 2, H / 2 + 165, 40, '#E74C3C');
    
    return toBuf(canvas);
}

// ============================================================================
// 2. مولد اللوبي وتأمين الطريق (تصميم فخم يعرض الفريق)
// ============================================================================
async function generateLobbyImage(hostId, party, partyClasses, destConfig, isAmbush, guild) {
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');
    
    // 1. رسم الخلفية
    try {
        await drawBg(ctx, isAmbush ? 'banditattack' : 'journeymap');
    } catch(e) {
        ctx.fillStyle = '#05050A';
        ctx.fillRect(0, 0, W, H);
    }
    
    // 2. دمج صورة المدينة مع الخلفية
    let destImg = null;
    try {
        destImg = await fetchImageSafe(destConfig.id);
    } catch(e) {}
    
    if (destImg) {
        ctx.save();
        ctx.globalAlpha = 0.25;
        const imgRatio = destImg.width / destImg.height;
        let drawW = W, drawH = W / imgRatio;
        if (drawH < H) { drawH = H; drawW = H * imgRatio; }
        ctx.drawImage(destImg, -(drawW - W)/2, -(drawH - H)/2, drawW, drawH);
        ctx.restore();
    }
    
    // إشراقة لونية حسب الحالة (أحمر للكمين، ذهبي للتأمين العادي)
    const tintColor = isAmbush ? 'rgba(231, 76, 60, 0.2)' : 'rgba(241, 196, 15, 0.1)';
    const grad = ctx.createRadialGradient(W/2, H/2, H/4, W/2, H/2, W);
    grad.addColorStop(0, 'transparent');
    grad.addColorStop(1, tintColor);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    await drawHeader(ctx, isAmbush ? 'الدفاع عن القافلة' : 'تأمين مسار القافلة', `الوجهة: ${destConfig.name}`);
    drawCornerAccents(ctx);

    const contentY = 180;
    
    if (isAmbush) {
        M(ctx, '⚠️ قطاع الطرق يقتربون! استعد للقتال! ⚠️', W / 2, contentY + 30, 40, C.red);
    } else {
        M(ctx, 'تجمع الحراس لتأمين الرحلة', W / 2, contentY + 30, 36, C.gold);
    }
    divLine(ctx, 300, contentY + 60, W - 600, C.gold + '55');

    // 3. رسم بطاقات اللاعبين الثلاثة (Party Slots)
    const boxW = 380, boxH = 440, gap = 50;
    const totalW = (3 * boxW) + (2 * gap);
    const startX = (W - totalW) / 2;
    const boxY = contentY + 120;

    const CLASS_OPTIONS = [
        { v: 'Tank',     l: 'الطليعة',  e: '🛡️', color: '#3498DB' },
        { v: 'Priest',   l: 'الكاهن',   e: '✨', color: '#F1C40F' },
        { v: 'Mage',     l: 'الساحر',   e: '🔮', color: '#9B59B6' },
        { v: 'Summoner', l: 'المستدعي', e: '🐺', color: '#2ECC71' },
    ];

    const members = await Promise.all(party.map(uid => guild.members.fetch(uid).catch(() => null)));

    for (let i = 0; i < 3; i++) {
        const cx = startX + i * (boxW + gap);
        
        ctx.fillStyle = 'rgba(10, 14, 28, 0.85)';
        rr(ctx, cx, boxY, boxW, boxH, 24); ctx.fill();
        
        ctx.strokeStyle = i < party.length ? C.gold : '#555';
        ctx.lineWidth = i < party.length ? 3 : 2;
        rr(ctx, cx, boxY, boxW, boxH, 24); ctx.stroke();

        if (i < party.length) {
            const uid = party[i];
            const mem = members[i];
            const clsVal = partyClasses.get(uid);
            let clsObj = CLASS_OPTIONS.find(c => c.v === clsVal);
            const isLeader = (i === 0);
            
            if (isLeader && !clsObj) clsObj = { l: 'قائد القافلة', e: '👑', color: C.gold };

            // جلب الأفاتار
            let avatarImg = null;
            if (mem) {
                const avaUrl = mem.user.displayAvatarURL({ extension: 'png', size: 256 });
                avatarImg = await fetchImageSafe(avaUrl);
            }

            const avaSize = 160;
            const avaX = cx + boxW / 2;
            const avaY = boxY + 130;

            if (avatarImg) {
                ctx.save();
                ctx.beginPath(); ctx.arc(avaX, avaY, avaSize / 2, 0, Math.PI * 2); ctx.clip();
                ctx.drawImage(avatarImg, avaX - avaSize / 2, avaY - avaSize / 2, avaSize, avaSize);
                ctx.restore();
                
                // إطار الأفاتار الملون حسب التخصص
                ctx.beginPath(); ctx.arc(avaX, avaY, avaSize / 2, 0, Math.PI * 2);
                ctx.strokeStyle = clsObj.color || C.gold; ctx.lineWidth = 4; ctx.stroke();
            } else {
                ctx.fillStyle = '#222';
                ctx.beginPath(); ctx.arc(avaX, avaY, avaSize / 2, 0, Math.PI * 2); ctx.fill();
                ctx.font = `60px ${FE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillStyle = '#555'; ctx.fillText('👤', avaX, avaY);
            }

            // الاسم
            const name = mem ? (mem.displayName || mem.user.username) : 'غير معروف';
            M(ctx, name, cx + boxW / 2, boxY + 260, 34, '#FFFFFF');

            // شارة التخصص (Class Badge)
            rr(ctx, cx + 60, boxY + 310, boxW - 120, 50, 25);
            ctx.fillStyle = (clsObj.color || C.gold) + '33'; ctx.fill();
            ctx.strokeStyle = clsObj.color || C.gold; ctx.lineWidth = 2;
            rr(ctx, cx + 60, boxY + 310, boxW - 120, 50, 25); ctx.stroke();
            
            M(ctx, `${clsObj.e} ${clsObj.l}`, cx + boxW / 2, boxY + 343, 28, clsObj.color || C.gold);

            if (isLeader) {
                ctx.font = `50px ${FE}`;
                ctx.fillText('👑', cx + boxW / 2, boxY + 20);
            }
        } else {
            // خانة فارغة
            ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
            rr(ctx, cx + 40, boxY + 40, boxW - 80, boxW - 80, 24); ctx.fill();
            
            ctx.font = `80px ${FE}`; 
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillStyle = '#555'; ctx.fillText('➕', cx + boxW / 2, boxY + boxH / 2 - 20);
            M(ctx, 'بانتظار حارس...', cx + boxW / 2, boxY + boxH / 2 + 60, 30, '#777');
        }
    }

    return toBuf(canvas);
}

module.exports = { generateAmbushAlertImage, generateLobbyImage };
