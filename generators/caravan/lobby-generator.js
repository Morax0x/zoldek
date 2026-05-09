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
    
    // محاولة استخدام الخلفية الأساسية للهجمات
    try {
        await drawBg(ctx, 'banditattack');
    } catch(e) {
        ctx.fillStyle = '#05050A';
        ctx.fillRect(0, 0, W, H);
    }
    
    // سحب صورة المدينة للدمج
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
    
    const grad = ctx.createRadialGradient(W/2, H/2, H/4, W/2, H/2, W);
    grad.addColorStop(0, 'rgba(231, 76, 60, 0.2)');
    grad.addColorStop(1, 'rgba(231, 76, 60, 0.8)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    await drawHeader(ctx, 'تحذير — القافلة في خطر!', `الوجهة: ${dest.name}`);
    drawCornerAccents(ctx);
    
    M(ctx, '⚔️ قطاع الطرق يحاصرون القافلة ⚔️', W / 2, H / 2 - 80, 55, C.red);
    M(ctx, 'تحتاج إلى حراس للنجاة، أو دفع الرشوة لفقدان جزء من المكافأة!', W / 2, H / 2, 36, '#FFFFFF');
    
    const boxW = 400;
    const boxH = 120;
    const gap = 60;
    const startX = (W - (2 * boxW + gap)) / 2;
    
    ctx.fillStyle = 'rgba(46, 204, 113, 0.15)';
    rr(ctx, startX, H / 2 + 100, boxW, boxH, 20); 
    ctx.fill();
    ctx.strokeStyle = '#2ECC71'; 
    ctx.lineWidth = 3;
    rr(ctx, startX, H / 2 + 100, boxW, boxH, 20); 
    ctx.stroke();
    M(ctx, '🛡️ حماية القافلة', startX + boxW / 2, H / 2 + 165, 40, '#2ECC71');
    
    ctx.fillStyle = 'rgba(231, 76, 60, 0.15)';
    rr(ctx, startX + boxW + gap, H / 2 + 100, boxW, boxH, 20); 
    ctx.fill();
    ctx.strokeStyle = '#E74C3C'; 
    ctx.lineWidth = 3;
    rr(ctx, startX + boxW + gap, H / 2 + 100, boxW, boxH, 20); 
    ctx.stroke();
    M(ctx, '💰 دفع رشوة', startX + boxW + gap + boxW / 2, H / 2 + 165, 40, '#E74C3C');
    
    return toBuf(canvas);
}

// ============================================================================
// 2. مولد اللوبي (تجمع الحراس)
// ============================================================================
async function generateLobbyImage(hostId, party, partyClasses, destConfig, isAmbush, guild) {
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');
    
    try {
        await drawBg(ctx, isAmbush ? 'banditattack' : 'journeymap');
    } catch(e) {
        ctx.fillStyle = '#05050A';
        ctx.fillRect(0, 0, W, H);
    }
    
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

    const boxW = 380;
    const boxH = 440;
    const gap = 50;
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
        rr(ctx, cx, boxY, boxW, boxH, 24); 
        ctx.fill();
        
        ctx.strokeStyle = i < party.length ? C.gold : '#555';
        ctx.lineWidth = i < party.length ? 3 : 2;
        rr(ctx, cx, boxY, boxW, boxH, 24); 
        ctx.stroke();

        if (i < party.length) {
            const uid = party[i];
            const mem = members[i];
            const clsVal = partyClasses.get(uid);
            let clsObj = CLASS_OPTIONS.find(c => c.v === clsVal);
            const isLeader = (i === 0);
            
            if (isLeader && !clsObj) {
                clsObj = { l: 'قائد القافلة', e: '👑', color: C.gold };
            }

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
                ctx.beginPath(); 
                ctx.arc(avaX, avaY, avaSize / 2, 0, Math.PI * 2); 
                ctx.clip();
                ctx.drawImage(avatarImg, avaX - avaSize / 2, avaY - avaSize / 2, avaSize, avaSize);
                ctx.restore();
                
                ctx.beginPath(); 
                ctx.arc(avaX, avaY, avaSize / 2, 0, Math.PI * 2);
                ctx.strokeStyle = clsObj.color || C.gold; 
                ctx.lineWidth = 4; 
                ctx.stroke();
            } else {
                ctx.fillStyle = '#222';
                ctx.beginPath(); 
                ctx.arc(avaX, avaY, avaSize / 2, 0, Math.PI * 2); 
                ctx.fill();
                ctx.font = `60px ${FE}`; 
                ctx.textAlign = 'center'; 
                ctx.textBaseline = 'middle';
                ctx.fillStyle = '#555'; 
                ctx.fillText('👤', avaX, avaY);
            }

            const name = mem ? (mem.displayName || mem.user.username) : 'غير معروف';
            M(ctx, name, cx + boxW / 2, boxY + 260, 34, '#FFFFFF');

            rr(ctx, cx + 60, boxY + 310, boxW - 120, 50, 25);
            ctx.fillStyle = (clsObj.color || C.gold) + '33'; 
            ctx.fill();
            ctx.strokeStyle = clsObj.color || C.gold; 
            ctx.lineWidth = 2;
            rr(ctx, cx + 60, boxY + 310, boxW - 120, 50, 25); 
            ctx.stroke();
            
            M(ctx, `${clsObj.e} ${clsObj.l}`, cx + boxW / 2, boxY + 343, 28, clsObj.color || C.gold);

            if (isLeader) {
                ctx.font = `50px ${FE}`;
                ctx.fillText('👑', cx + boxW / 2, boxY + 20);
            }
        } else {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
            rr(ctx, cx + 40, boxY + 40, boxW - 80, boxW - 80, 24); 
            ctx.fill();
            
            ctx.font = `80px ${FE}`; 
            ctx.textAlign = 'center'; 
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#555'; 
            ctx.fillText('➕', cx + boxW / 2, boxY + boxH / 2 - 20);
            M(ctx, 'بانتظار حارس...', cx + boxW / 2, boxY + boxH / 2 + 60, 30, '#777');
        }
    }

    return toBuf(canvas);
}

// ============================================================================
// 3. مولد صورة تأكيد الوجهة (تأمين الطريق أو التخطي) 👑
// ============================================================================
async function generateDestChoiceImage(dest, mora) {
    const canvas = createCanvas(W, H); 
    const ctx = canvas.getContext('2d');
    const FONT = '"Bein", "Arial"';

    const bgUrl = `https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev/images/destinations/${dest.id}.png`;
    let bgImg = await fetchImageSafe(bgUrl);
    if (!bgImg) bgImg = await fetchImageSafe('https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev/images/dungeon/desert_caravan.jpg');

    if (bgImg) {
        ctx.save();
        ctx.globalAlpha = 0.35;
        const imgRatio = bgImg.width / bgImg.height;
        let drawW = W, drawH = W / imgRatio;
        if (drawH < H) { drawH = H; drawW = H * imgRatio; }
        ctx.drawImage(bgImg, -(drawW - W)/2, -(drawH - H)/2, drawW, drawH);
        ctx.restore();
    } else {
        ctx.fillStyle = '#0a0a0f'; ctx.fillRect(0, 0, W, H);
    }
    
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, 'rgba(10, 15, 30, 0.85)');
    grad.addColorStop(1, 'rgba(5, 7, 15, 0.98)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    const destColor = dest.color || '#FFD700';

    const panelW = 400, panelH = 430, panelX = 50, panelY = 60;
    
    ctx.shadowColor = destColor; ctx.shadowBlur = 25;
    rr(ctx, panelX, panelY, panelW, panelH, 24);
    ctx.fillStyle = 'rgba(15, 20, 35, 0.85)'; ctx.fill();
    ctx.shadowBlur = 0;
    
    ctx.strokeStyle = destColor; ctx.lineWidth = 3; ctx.stroke();

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `100px "Emoji", "Arial"`;
    ctx.fillText(dest.emoji || '🗺️', panelX + panelW / 2, panelY + 100);

    ctx.fillStyle = destColor; ctx.font = `bold 38px ${FONT}`;
    ctx.fillText(dest.name, panelX + panelW / 2, panelY + 190);

    ctx.beginPath(); ctx.moveTo(panelX + 40, panelY + 230); ctx.lineTo(panelX + panelW - 40, panelY + 230);
    ctx.strokeStyle = destColor + '55'; ctx.lineWidth = 2; ctx.stroke();

    const riskPercent = (dest.risk_factor * 100).toFixed(0);
    const stats = [
        { icon: '⏱️', text: `${dest.duration_hours} ساعة`, color: '#FFFFFF' },
        { icon: '💰', text: `${dest.cost.toLocaleString()} مورا`, color: '#F1C40F' },
        { icon: '⚠️', text: `خطر ${riskPercent}%`, color: dest.risk_factor > 0.4 ? '#E74C3C' : '#F39C12' },
    ];
    
    ctx.font = `24px ${FONT}`;
    stats.forEach((s, idx) => {
        const sy = panelY + 280 + idx * 45;
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        rr(ctx, panelX + 30, sy - 20, panelW - 60, 40, 10); ctx.fill();
        ctx.fillStyle = s.color; ctx.textAlign = 'right'; ctx.fillText(s.text, panelX + panelW - 45, sy + 2);
        ctx.textAlign = 'left'; ctx.fillText(s.icon, panelX + 45, sy + 2);
    });

    const canAfford = mora >= dest.cost;
    const badgeW = 240, badgeH = 45;
    ctx.fillStyle = canAfford ? 'rgba(46, 204, 113, 0.95)' : 'rgba(231, 76, 60, 0.95)';
    rr(ctx, panelX + (panelW - badgeW)/2, panelY + panelH - 22, badgeW, badgeH, 14); ctx.fill();
    ctx.fillStyle = '#FFFFFF'; ctx.font = `bold 22px ${FONT}`; ctx.textAlign = 'center';
    ctx.fillText(canAfford ? '✅ رصيدك كافٍ' : '❌ رصيدك غير كافٍ', panelX + panelW / 2, panelY + panelH + 3);

    const rx = panelX + panelW + 60, rw = W - rx - 50;

    ctx.textAlign = 'center'; ctx.fillStyle = '#FFFFFF'; ctx.font = `bold 45px ${FONT}`;
    ctx.fillText('تأكيد مسار القافلة', rx + rw / 2, 90);

    ctx.beginPath(); ctx.moveTo(rx + 100, 130); ctx.lineTo(rx + rw - 100, 130);
    ctx.strokeStyle = '#FFFFFF33'; ctx.lineWidth = 2; ctx.stroke();

    const banditCount = Math.max(2, Math.round(dest.risk_factor * 12));
    ctx.fillStyle = '#E74C3C'; ctx.font = `bold 30px ${FONT}`;
    ctx.fillText(`⚠️ الطريق محفوف بالمخاطر! (${banditCount} أوكار)`, rx + rw / 2, 190);

    ctx.fillStyle = '#BDC3C7'; ctx.font = `26px ${FONT}`;
    ctx.fillText('هل ترغب في تأمين الطريق مسبقاً لحماية بضاعتك،', rx + rw / 2, 240);
    ctx.fillText('أم أنك تفضل المجازفة وإرسال القافلة فوراً؟', rx + rw / 2, 280);

    ctx.fillStyle = 'rgba(231, 76, 60, 0.15)'; 
    rr(ctx, rx + 30, 340, rw - 60, 75, 16); ctx.fill();
    ctx.strokeStyle = '#E74C3C'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#E74C3C'; ctx.font = `bold 28px ${FONT}`;
    ctx.fillText('⚔️ هجوم وتأمين الطريق (ينصح به)', rx + rw / 2, 385);

    ctx.fillStyle = 'rgba(52, 152, 219, 0.15)'; 
    rr(ctx, rx + 30, 435, rw - 60, 75, 16); ctx.fill();
    ctx.strokeStyle = '#3498DB'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#3498DB'; ctx.font = `bold 28px ${FONT}`;
    ctx.fillText('🐫 تخطي الحماية والمجازفة', rx + rw / 2, 480);

    return toBuf(canvas);
}

module.exports = { generateAmbushAlertImage, generateLobbyImage, generateDestChoiceImage };
