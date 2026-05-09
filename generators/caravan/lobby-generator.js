const { createCanvas, loadImage } = require('@napi-rs/canvas');

// دالة مساعدة لرسم الزوايا الدائرية
function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

// دالة آمنة لجلب الصور
async function fetchImageSafe(url) {
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const buf = await res.arrayBuffer();
        return await loadImage(Buffer.from(buf));
    } catch { return null; }
}

// 1. مولد صورة الكمين
async function generateAmbushAlertImage(dest) {
    const W = 1200, H = 500;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');
    
    const bgUrl = `https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev/images/destinations/${dest.id}.png`;
    let bg = await fetchImageSafe(bgUrl);
    if (!bg) bg = await fetchImageSafe('https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev/images/dungeon/desert_ambush.jpg');

    if (bg) ctx.drawImage(bg, 0, 0, W, H);
    else { ctx.fillStyle = '#111'; ctx.fillRect(0, 0, W, H); }
    
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, 'rgba(40, 0, 0, 0.85)');
    grad.addColorStop(1, 'rgba(10, 0, 0, 0.95)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    
    ctx.textAlign = 'center';
    ctx.fillStyle = '#E74C3C';
    ctx.font = 'bold 70px "Arial", sans-serif';
    ctx.fillText('⚔️ تحذير — القافلة تتعرض لكمين! ⚔️', W / 2, 120);
    
    ctx.fillStyle = '#F1C40F';
    ctx.font = 'bold 45px "Arial", sans-serif';
    ctx.fillText(`الوجهة: ${dest.name} ${dest.emoji}`, W / 2, 220);
    
    ctx.fillStyle = '#BDC3C7';
    ctx.font = '35px "Arial", sans-serif';
    ctx.fillText('قطاع الطرق يهاجمون القافلة! تحتاج إلى حراس للنجاة أو دفع فدية.', W / 2, 300);
    
    ctx.fillStyle = 'rgba(46, 204, 113, 0.15)';
    ctx.strokeStyle = '#2ECC71'; ctx.lineWidth = 3;
    rr(ctx, 150, 360, 400, 100, 15); ctx.fill(); ctx.stroke();
    
    ctx.fillStyle = '#2ECC71';
    ctx.font = 'bold 32px "Arial", sans-serif';
    ctx.fillText('🛡️ حماية القافلة', 350, 420);
    
    ctx.fillStyle = 'rgba(231, 76, 60, 0.15)';
    ctx.strokeStyle = '#E74C3C';
    rr(ctx, 650, 360, 400, 100, 15); ctx.fill(); ctx.stroke();
    
    ctx.fillStyle = '#E74C3C';
    ctx.fillText('💰 دفع الرشوة', 850, 420);
    
    return canvas.toBuffer('image/png');
}

// 2. مولد صورة اللوبي
async function generateLobbyImage(hostId, party, partyClasses, destConfig, isAmbush, guild) {
    const W = 1200, H = 550;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    const bgUrl = `https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev/images/destinations/${destConfig.id}.png`;
    const bg = await fetchImageSafe(bgUrl);
    
    if (bg) ctx.drawImage(bg, 0, 0, W, H);
    else { ctx.fillStyle = '#05050A'; ctx.fillRect(0, 0, W, H); }

    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, 'rgba(10, 15, 30, 0.85)');
    grad.addColorStop(1, 'rgba(5, 7, 15, 0.98)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = 'center';
    ctx.fillStyle = isAmbush ? '#E74C3C' : '#3498DB';
    ctx.font = 'bold 65px "Arial", sans-serif';
    ctx.fillText(isAmbush ? '⚔️ الدفاع عن القافلة ⚔️' : '🛡️ تأمين مسار القافلة 🛡️', W / 2, 100);

    ctx.fillStyle = '#F1C40F';
    ctx.font = 'bold 40px "Arial", sans-serif';
    ctx.fillText(`الوجهة: ${destConfig.name} ${destConfig.emoji}`, W / 2, 170);

    const members = await Promise.all(party.map(uid => guild.members.fetch(uid).catch(() => null)));
    
    const boxW = 340, boxH = 250, gap = 40;
    const totalW = (3 * boxW) + (2 * gap);
    const startX = (W - totalW) / 2;
    const boxY = 240;

    const CLASS_OPTIONS = [
        { v: 'Tank',     l: 'الطليعة',  e: '🛡️' },
        { v: 'Priest',   l: 'الكاهن',   e: '✨' },
        { v: 'Mage',     l: 'الساحر',   e: '🔮' },
        { v: 'Summoner', l: 'المستدعي', e: '🐺' },
    ];

    for (let i = 0; i < 3; i++) {
        const cx = startX + i * (boxW + gap);
        
        rr(ctx, cx, boxY, boxW, boxH, 20);
        ctx.fillStyle = 'rgba(20, 25, 35, 0.7)';
        ctx.fill();
        ctx.strokeStyle = i < party.length ? '#F1C40F' : '#555';
        ctx.lineWidth = 3;
        ctx.stroke();

        if (i < party.length) {
            const uid = party[i];
            const mem = members[i];
            const clsVal = partyClasses.get(uid);
            let clsObj = CLASS_OPTIONS.find(c => c.v === clsVal) || { l: 'قائد القافلة', e: '👑' };

            let avatarImg = null;
            if (mem) {
                const avaUrl = mem.user.displayAvatarURL({ extension: 'png', size: 128 });
                avatarImg = await fetchImageSafe(avaUrl);
            }

            if (avatarImg) {
                ctx.save();
                ctx.beginPath();
                ctx.arc(cx + boxW / 2, boxY + 80, 50, 0, Math.PI * 2);
                ctx.clip();
                ctx.drawImage(avatarImg, cx + boxW / 2 - 50, boxY + 30, 100, 100);
                ctx.restore();
            } else {
                ctx.fillStyle = '#555';
                ctx.beginPath();
                ctx.arc(cx + boxW / 2, boxY + 80, 50, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.fillStyle = '#FFF';
            ctx.font = 'bold 30px "Arial", sans-serif';
            ctx.fillText(mem ? (mem.displayName || mem.user.username) : 'غير معروف', cx + boxW / 2, boxY + 175);

            ctx.fillStyle = '#F1C40F';
            ctx.font = 'bold 26px "Arial", sans-serif';
            ctx.fillText(`${clsObj.e} ${clsObj.l}`, cx + boxW / 2, boxY + 220);

        } else {
            ctx.fillStyle = '#7F8C8D';
            ctx.font = 'bold 35px "Arial", sans-serif';
            ctx.fillText('➕', cx + boxW / 2, boxY + 110);
            ctx.font = '26px "Arial", sans-serif';
            ctx.fillText('بانتظار حارس...', cx + boxW / 2, boxY + 170);
        }
    }

    return canvas.toBuffer('image/png');
}

module.exports = { generateAmbushAlertImage, generateLobbyImage };
