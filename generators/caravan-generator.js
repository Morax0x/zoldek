const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');
const fs   = require('fs');

/* ─── تسجيل الخطوط ─── */
try {
    const fontsDir = path.join(process.cwd(), 'fonts');
    const beinPath = path.join(fontsDir, 'bein-ar-normal.ttf');
    const emojiPath= path.join(fontsDir, 'NotoEmoj.ttf');
    if (fs.existsSync(beinPath))  GlobalFonts.registerFromPath(beinPath,  'Bein');
    if (fs.existsSync(emojiPath)) GlobalFonts.registerFromPath(emojiPath, 'Emoji');
} catch {}

const FONT  = '"Bein","Arial",sans-serif';
const W = 1200, H = 660;

/* ─── ألوان الندرة ─── */
const RARITY_COLOR = {
    Common: '#A8B8D0', Uncommon: '#2ECC71', Rare: '#00C3FF',
    Epic: '#B968FF',   Legendary: '#FFD700'
};

/* ─── رسم مستطيل بزوايا دائرية ─── */
function roundRect(ctx, x, y, w, h, r) {
    if (w < 2*r) r = w/2;
    if (h < 2*r) r = h/2;
    ctx.beginPath();
    ctx.moveTo(x+r, y);
    ctx.arcTo(x+w, y,   x+w, y+h, r);
    ctx.arcTo(x+w, y+h, x,   y+h, r);
    ctx.arcTo(x,   y+h, x,   y,   r);
    ctx.arcTo(x,   y,   x+w, y,   r);
    ctx.closePath();
}

/* ─── لوحة معلومات بإطار ذهبي ─── */
function drawPanel(ctx, x, y, w, h, accentColor = '#FFD700') {
    const grad = ctx.createLinearGradient(x, y, x, y+h);
    grad.addColorStop(0, 'rgba(20,25,40,0.92)');
    grad.addColorStop(1, 'rgba(8,10,18,0.96)');
    roundRect(ctx, x, y, w, h, 14);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = accentColor;
    ctx.lineWidth   = 1.5;
    ctx.stroke();
    // زوايا مزخرفة
    const cl = 14;
    ctx.lineWidth   = 2.5;
    ctx.strokeStyle = accentColor;
    ctx.shadowColor = accentColor;
    ctx.shadowBlur  = 8;
    ctx.beginPath();
    [[x,y+cl,x,y,x+cl,y],[x+w-cl,y,x+w,y,x+w,y+cl],
     [x+w,y+h-cl,x+w,y+h,x+w-cl,y+h],[x+cl,y+h,x,y+h,x,y+h-cl]]
        .forEach(([x1,y1,x2,y2,x3,y3]) => {
            ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.lineTo(x3,y3);
        });
    ctx.stroke();
    ctx.shadowBlur = 0;
}

/* ─── نص عربي محاذٍ لليمين ─── */
function rtlText(ctx, text, x, y, size, color = '#FFFFFF', bold = false) {
    ctx.font      = `${bold ? 'bold ' : ''}${size}px ${FONT}`;
    ctx.fillStyle = color;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
}

/* ─── شريط التقدم ─── */
function drawProgressBar(ctx, x, y, w, h, pct, color) {
    roundRect(ctx, x, y, w, h, h/2);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fill();

    const filled = Math.max(0, Math.min(1, pct)) * w;
    if (filled > 0) {
        const grad = ctx.createLinearGradient(x, y, x+w, y);
        grad.addColorStop(0, color + 'AA');
        grad.addColorStop(1, color);
        roundRect(ctx, x, y, filled, h, h/2);
        ctx.fillStyle = grad;
        ctx.shadowColor = color;
        ctx.shadowBlur  = 10;
        ctx.fill();
        ctx.shadowBlur = 0;
    }
}

/* ════════════════════════════════════════════════════════
   الدالة الرئيسية
   ════════════════════════════════════════════════════════ */
async function generateCaravanCard(targetUser, caravan, stats, destConfig) {
    const canvas = createCanvas(W, H);
    const ctx    = canvas.getContext('2d');
    const now    = Date.now();

    const startTime = Number(caravan.starttime || caravan.startTime || now);
    const endTime   = Number(caravan.endtime   || caravan.endTime   || now);
    const progress  = Math.min(1, Math.max(0, (now - startTime) / (endTime - startTime)));
    const timeLeftMs= Math.max(0, endTime - now);
    const hoursLeft = Math.floor(timeLeftMs / 3600000);
    const minsLeft  = Math.floor((timeLeftMs % 3600000) / 60000);
    const accentColor = destConfig.color || '#FFD700';
    const attackResolved = Number(caravan.attackresolved || caravan.attackResolved || 0);

    /* ── خلفية ── */
    const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, '#08091A');
    bgGrad.addColorStop(0.6, '#0D1228');
    bgGrad.addColorStop(1, '#1A0A04');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    /* ── نجوم ── */
    ctx.fillStyle = '#FFFFFF';
    for (let i = 0; i < 120; i++) {
        const px = Math.random() * W;
        const py = Math.random() * H * 0.65;
        const ps = Math.random() * 1.8;
        ctx.globalAlpha = Math.random() * 0.5 + 0.1;
        ctx.beginPath(); ctx.arc(px, py, ps, 0, Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    /* ── كثبان رملية (سيلويت) ── */
    ctx.fillStyle = '#1C0E04';
    ctx.beginPath();
    ctx.moveTo(0, H);
    ctx.bezierCurveTo(W*0.15, H-80,  W*0.3,  H-130, W*0.5,  H-90);
    ctx.bezierCurveTo(W*0.65, H-55,  W*0.8,  H-110, W, H-70);
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();

    ctx.fillStyle = '#120A02';
    ctx.beginPath();
    ctx.moveTo(0, H);
    ctx.bezierCurveTo(W*0.2, H-50, W*0.45, H-80, W*0.6, H-55);
    ctx.bezierCurveTo(W*0.75, H-35, W*0.9,  H-65, W, H-40);
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();

    /* ── خط فاصل أعلى ── */
    const headerH = 110;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, W, headerH);
    const hLine = ctx.createLinearGradient(0, 0, W, 0);
    hLine.addColorStop(0,   'rgba(255,215,0,0)');
    hLine.addColorStop(0.5, 'rgba(255,215,0,0.9)');
    hLine.addColorStop(1,   'rgba(255,215,0,0)');
    ctx.fillStyle = hLine;
    ctx.fillRect(0, headerH-2, W, 2);

    /* ── صورة المستخدم ── */
    try {
        const avatarImg = await loadImage(targetUser.displayAvatarURL({ extension: 'png', size: 128 }));
        ctx.save();
        ctx.beginPath(); ctx.arc(60, 55, 38, 0, Math.PI*2); ctx.clip();
        ctx.drawImage(avatarImg, 22, 17, 76, 76);
        ctx.restore();
        ctx.strokeStyle = accentColor;
        ctx.lineWidth   = 2.5;
        ctx.shadowColor = accentColor; ctx.shadowBlur = 12;
        ctx.beginPath(); ctx.arc(60, 55, 38, 0, Math.PI*2); ctx.stroke();
        ctx.shadowBlur = 0;
    } catch {}

    /* ── اسم المستخدم والوجهة ── */
    rtlText(ctx, `القائد: ${targetUser.username}`, W-30, 35, 26, '#FFD700', true);
    rtlText(ctx, `الوجهة: ${destConfig.emoji} ${destConfig.name}`, W-30, 70, 22, '#FFFFFF');

    /* ── حالة القافلة ── */
    let statusText = '🟢 في الطريق';
    let statusColor = '#00FF88';
    if (attackResolved === 0 && caravan.guardmessageid) { statusText = '⚔️ تحت الهجوم!'; statusColor = '#FF4444'; }
    else if (attackResolved === 1)  { statusText = '🛡️ نجت الحراسة'; statusColor = '#00BFFF'; }
    else if (attackResolved === 2)  { statusText = '😔 فشلت الحراسة'; statusColor = '#FFA500'; }
    else if (attackResolved === -1) { statusText = '💀 تم النهب'; statusColor = '#FF2222'; }

    ctx.font      = `bold 20px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = statusColor;
    ctx.shadowColor = statusColor; ctx.shadowBlur = 8;
    ctx.fillText(statusText, 115, 55);
    ctx.shadowBlur = 0;

    /* ════════════════ خريطة المسار (المنتصف) ════════════════ */
    const mapX = 0, mapY = headerH, mapW = W * 0.52, mapH = H - headerH - 120;

    // خلفية الخريطة
    const mapGrad = ctx.createRadialGradient(mapW/2, mapY+mapH/2, 30, mapW/2, mapY+mapH/2, mapW*0.7);
    mapGrad.addColorStop(0, 'rgba(20,35,55,0.5)');
    mapGrad.addColorStop(1, 'rgba(5,8,15,0.2)');
    ctx.fillStyle = mapGrad;
    ctx.fillRect(mapX, mapY, mapW, mapH);

    // شبكة خفيفة
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (let gx = 0; gx < mapW; gx += 60) { ctx.beginPath(); ctx.moveTo(mapX+gx, mapY); ctx.lineTo(mapX+gx, mapY+mapH); ctx.stroke(); }
    for (let gy = 0; gy < mapH; gy += 60) { ctx.beginPath(); ctx.moveTo(mapX, mapY+gy); ctx.lineTo(mapX+mapW, mapY+gy); ctx.stroke(); }

    // نقطة البداية (البيت)
    const originX = 80, originY = mapY + mapH - 60;
    // نقطة الوجهة
    const destX = mapW - 70, destY = mapY + 80;

    // منحنى المسار (Bezier)
    const cpX = (originX + destX) / 2 + 40;
    const cpY = (originY + destY) / 2 - 80;

    // مسار باهت (الكامل)
    ctx.strokeStyle = 'rgba(180,160,100,0.25)';
    ctx.lineWidth   = 3;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(originX, originY);
    ctx.quadraticCurveTo(cpX, cpY, destX, destY);
    ctx.stroke();
    ctx.setLineDash([]);

    // المسار المقطوع (حتى موقع القافلة الآن)
    const caravanX = originX + (destX-originX)*progress + 2*(cpX-originX-progress*(cpX-originX))*progress*(1-progress);
    const caravanY = originY + (destY-originY)*progress + 2*(cpY-originY-progress*(cpY-originY))*progress*(1-progress);

    ctx.strokeStyle = accentColor;
    ctx.lineWidth   = 4;
    ctx.shadowColor = accentColor; ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(originX, originY);
    ctx.quadraticCurveTo(cpX, cpY, caravanX, caravanY);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // نقطة البداية
    ctx.fillStyle   = '#00FF88';
    ctx.shadowColor = '#00FF88'; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(originX, originY, 8, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.font = `16px ${FONT}`; ctx.fillStyle = '#AAFFCC'; ctx.textAlign = 'center';
    ctx.fillText('🏠 البيت', originX, originY+22);

    // نقطة الوجهة
    ctx.fillStyle   = accentColor;
    ctx.shadowColor = accentColor; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.arc(destX, destY, 10, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.font = `16px ${FONT}`; ctx.fillStyle = accentColor; ctx.textAlign = 'center';
    ctx.fillText(`${destConfig.emoji} ${destConfig.name}`, destX, destY-22);

    // أيقونة القافلة على المسار
    ctx.font = `34px ${FONT}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = accentColor; ctx.shadowBlur = 18;
    ctx.fillText('🐪', caravanX, caravanY - 5);
    ctx.shadowBlur = 0;

    /* ════════════════ اللوحة اليمنى ════════════════ */
    const panelX = W*0.54, panelY = headerH + 10, panelW = W*0.44, panelH = H - headerH - 130;
    drawPanel(ctx, panelX, panelY, panelW, panelH, accentColor);

    const pRight = panelX + panelW - 20;
    let py = panelY + 36;

    // الوجهة
    rtlText(ctx, `${destConfig.emoji} ${destConfig.name}`, pRight, py, 26, accentColor, true);
    py += 36;
    rtlText(ctx, destConfig.description, pRight, py, 16, '#9AAABB');
    py += 30;

    // فاصل
    ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(panelX+20, py); ctx.lineTo(panelX+panelW-20, py); ctx.stroke();
    py += 18;

    // الوقت المتبقي
    const timeStr = timeLeftMs <= 0 ? 'وصلت!' : `${hoursLeft}س ${minsLeft}د`;
    rtlText(ctx, `⏳ الوقت المتبقي: ${timeStr}`, pRight, py, 20, '#FFFFFF');
    py += 30;

    // نسبة الإنجاز
    rtlText(ctx, `📊 التقدم: ${(progress*100).toFixed(1)}%`, pRight, py, 20, '#FFFFFF');
    py += 22;
    drawProgressBar(ctx, panelX+20, py, panelW-40, 16, progress, accentColor);
    py += 30;

    // فاصل
    ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(panelX+20, py); ctx.lineTo(panelX+panelW-20, py); ctx.stroke();
    py += 18;

    // ترقيات القافلة
    rtlText(ctx, '🏗️ مستوى الترقيات:', pRight, py, 18, '#FFD700', true);
    py += 28;
    const upgs = [
        { emoji: '📦', label: 'الحمولة', val: stats.capacity_rank || 1 },
        { emoji: '⚡', label: 'السرعة',  val: stats.speed_rank    || 1 },
        { emoji: '🛡️', label: 'الدرع',   val: stats.defense_rank  || 1 },
        { emoji: '🍀', label: 'الحظ',    val: stats.luck_rank     || 1 },
    ];
    const starBar = (n, max=5) => '★'.repeat(n) + '☆'.repeat(max-n);
    const colW = (panelW - 40) / 2;
    for (let i = 0; i < upgs.length; i++) {
        const u = upgs[i];
        const col = i % 2;
        const ux  = col === 0 ? pRight : panelX + colW + 20;
        rtlText(ctx, `${u.emoji} ${u.label}: ${starBar(u.val)}`, ux, py, 16, '#CCDDEE');
        if (col === 1) py += 26;
    }
    py += 30;

    // الأدوات المجهزة
    const artifacts = JSON.parse(caravan.equippedartifacts || caravan.equippedArtifacts || '[]');
    rtlText(ctx, `🔮 الأدوات المجهزة: ${artifacts.length}/3`, pRight, py, 18, '#FFD700', true);
    py += 26;
    if (artifacts.length === 0) {
        rtlText(ctx, 'لا يوجد أدوات مجهزة', pRight, py, 15, '#556677');
    } else {
        const allItems = [];
        const upgMats = require('../json/upgrade-materials.json');
        if (upgMats?.weapon_materials)
            upgMats.weapon_materials.forEach(r => r.materials.forEach(m => allItems.push(m)));
        if (upgMats?.skill_books)
            upgMats.skill_books.forEach(c => c.books.forEach(b => allItems.push(b)));
        artifacts.slice(0,3).forEach(id => {
            const item  = allItems.find(x => x.id === id);
            const color = item ? (RARITY_COLOR[item.rarity] || '#AABBCC') : '#AABBCC';
            rtlText(ctx, `• ${item?.name || id}`, pRight, py, 15, color);
            py += 22;
        });
    }

    /* ════════════════ شريط التقدم السفلي ════════════════ */
    const barY = H - 100;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, barY, W, 100);
    ctx.strokeStyle = 'rgba(255,215,0,0.3)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, barY); ctx.lineTo(W, barY); ctx.stroke();

    rtlText(ctx, 'تقدم الرحلة', W-30, barY+22, 18, '#FFD700', true);
    drawProgressBar(ctx, 30, barY+38, W-60, 22, progress, accentColor);
    const etaText = timeLeftMs <= 0 ? '✅ وصلت — جارٍ توزيع المكافآت...' : `⏱ الوصول المتوقع: <t:${Math.floor(endTime/1000)}:R>`;
    ctx.font = `17px ${FONT}`; ctx.fillStyle = '#AABBCC';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(etaText, 30, barY+75);
    rtlText(ctx, `${(progress*100).toFixed(0)}%`, W-30, barY+75, 17, accentColor, true);

    const buffer = await (canvas.encode ? canvas.encode('png') : canvas.toBuffer('image/png'));
    canvas.width = 0; canvas.height = 0;
    return buffer;
}

module.exports = { generateCaravanCard };
