const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');

try {
    GlobalFonts.registerFromPath(path.join(process.cwd(), 'fonts/bein-ar-normal.ttf'), 'Bein');
} catch (e) {}

const imageCache = new Map();
const R2_URL = 'https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev';

async function getCachedImage(imageUrl) {
    if (!imageUrl) return null;
    let finalUrl = imageUrl;
    if (!finalUrl.startsWith('http')) finalUrl = `${R2_URL}/${finalUrl.replace(/\\/g, '/')}`;
    const encodedUrl = encodeURI(finalUrl);

    if (imageCache.has(encodedUrl)) return imageCache.get(encodedUrl);
    try {
        const img = await loadImage(encodedUrl);
        imageCache.set(encodedUrl, img);
        return img;
    } catch (e) { return null; }
}

const RARITY_INFO = {
    'Common': { text: 'عادي', color: '#B0BEC5', stars: '★' },
    'Uncommon': { text: 'غير شائع', color: '#2ECC71', stars: '★★' },
    'Rare': { text: 'نادر', color: '#3498DB', stars: '★★★' },
    'Epic': { text: 'ملحمي', color: '#9B59B6', stars: '★★★★' },
    'Legendary': { text: 'اسطوري', color: '#F1C40F', stars: '★★★★★' }
};

function roundRect(ctx, x, y, width, height, radius) {
    if (width < 2 * radius) radius = width / 2;
    if (height < 2 * radius) radius = height / 2;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.closePath();
}

function drawAutoScaledText(ctx, text, x, y, maxWidth, maxFontSize, minFontSize = 10) {
    let currentFontSize = maxFontSize;
    ctx.font = `bold ${currentFontSize}px "Arial"`;
    while (ctx.measureText(text).width > maxWidth && currentFontSize > minFontSize) {
        currentFontSize--;
        ctx.font = `bold ${currentFontSize}px "Arial"`;
    }
    ctx.fillText(text, x, y);
}

function drawAutoScaledArabicText(ctx, text, x, y, maxWidth, maxFontSize, minFontSize = 10) {
    let currentFontSize = maxFontSize;
    ctx.font = `bold ${currentFontSize}px "Bein"`;
    while (ctx.measureText(text).width > maxWidth && currentFontSize > minFontSize) {
        currentFontSize--;
        ctx.font = `bold ${currentFontSize}px "Bein"`;
    }
    ctx.fillText(text, x, y);
}

// 1. الشاشة الرئيسية (الصندوق) - نسخة محسنة السرعة 🚀
async function generateGachaHub(userObj, moraBalance, flavorText, chestCount = 0) {
    const width = 1200;
    const height = 675; 
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // 🔥 تحميل الصورتين في نفس الوقت (Parallel) لتسريع العملية للضعف 🔥
    const chestUrl = `${R2_URL}/images/gacha/main_chest.png`;
    const avatarUrl = userObj.displayAvatarURL({ extension: 'png', size: 256 });
    
    const [chestImg, avatarImage] = await Promise.all([
        getCachedImage(chestUrl),
        loadImage(avatarUrl).catch(() => null)
    ]);

    if (chestImg) {
        ctx.drawImage(chestImg, 0, 0, width, height);
    } else {
        ctx.fillStyle = '#0f1420';
        ctx.fillRect(0, 0, width, height);
    }

    const vignette = ctx.createRadialGradient(width/2, height/2, 200, width/2, height/2, 800);
    vignette.addColorStop(0, 'rgba(0,0,0,0.15)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.9)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    for(let i=0; i<80; i++) {
        const px = Math.random() * width;
        const py = Math.random() * height;
        const pSize = Math.random() * 2.5;
        ctx.globalAlpha = Math.random() * 0.4 + 0.1;
        ctx.moveTo(px, py);
        ctx.arc(px, py, pSize, 0, Math.PI*2);
    }
    ctx.fill();
    ctx.globalAlpha = 1.0;

    const headerH = 110;
    ctx.fillStyle = 'rgba(5, 10, 15, 0.7)';
    ctx.fillRect(0, 0, width, headerH);
    
    const goldGrad = ctx.createLinearGradient(0, 0, width, 0);
    goldGrad.addColorStop(0, 'rgba(255, 215, 0, 0)');
    goldGrad.addColorStop(0.5, 'rgba(255, 215, 0, 0.8)');
    goldGrad.addColorStop(1, 'rgba(255, 215, 0, 0)');
    ctx.fillStyle = goldGrad;
    ctx.fillRect(0, headerH - 2, width, 2);

    const avatarSize = 75;
    const avatarX = 50 + avatarSize/2;
    const avatarY = headerH / 2;

    ctx.save();
    ctx.beginPath(); ctx.arc(avatarX, avatarY, avatarSize / 2, 0, Math.PI * 2); ctx.clip();
    if (avatarImage) ctx.drawImage(avatarImage, avatarX - avatarSize/2, avatarY - avatarSize/2, avatarSize, avatarSize);
    ctx.restore();
    
    ctx.beginPath(); ctx.arc(avatarX, avatarY, avatarSize / 2, 0, Math.PI * 2);
    ctx.lineWidth = 3; ctx.strokeStyle = '#FFD700'; ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = '#000'; ctx.shadowBlur = 5;
    let dName = userObj.displayName || userObj.username;
    drawAutoScaledArabicText(ctx, dName, avatarX + 55, avatarY, 200, 28, 14);
    ctx.shadowBlur = 0;

    const boxW = 200;
    const boxH = 50;
    const moraX = width - boxW - 40;
    const chestX = moraX - boxW - 20;
    const boxY = (headerH - boxH) / 2;

    ctx.fillStyle = 'rgba(20, 25, 30, 0.8)';
    ctx.beginPath(); roundRect(ctx, chestX, boxY, boxW, boxH, 12); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(185, 104, 255, 0.6)'; ctx.stroke();
    
    ctx.textAlign = 'right';
    ctx.fillStyle = '#E0E0E0';
    drawAutoScaledText(ctx, chestCount.toString(), chestX + boxW - 45, boxY + boxH/2 + 2, boxW - 120, 24, 12);
    ctx.font = '24px "Arial"';
    ctx.fillText('📦', chestX + boxW - 10, boxY + boxH/2 + 2);
    
    ctx.textAlign = 'left';
    ctx.fillStyle = '#B968FF';
    ctx.font = 'bold 18px "Bein"';
    ctx.fillText("صناديقك", chestX + 15, boxY + boxH/2 + 2);

    ctx.fillStyle = 'rgba(20, 25, 30, 0.8)';
    ctx.beginPath(); roundRect(ctx, moraX, boxY, boxW, boxH, 12); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255, 215, 0, 0.6)'; ctx.stroke();
    
    ctx.textAlign = 'right';
    ctx.fillStyle = '#FFD700';
    drawAutoScaledText(ctx, moraBalance.toLocaleString(), moraX + boxW - 45, boxY + boxH/2 + 2, boxW - 70, 24, 12);
    ctx.font = '24px "Arial"';
    ctx.fillText('🪙', moraX + boxW - 10, boxY + boxH/2 + 2);

    const bottomGrad = ctx.createLinearGradient(0, height - 220, 0, height);
    bottomGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    bottomGrad.addColorStop(0.5, 'rgba(0, 0, 0, 0.85)');
    bottomGrad.addColorStop(1, 'rgba(0, 0, 0, 0.98)');
    ctx.fillStyle = bottomGrad;
    ctx.fillRect(0, height - 220, width, 220);

    const pricePanelW = 550;
    const pricePanelH = 60;
    const pricePanelX = (width - pricePanelW) / 2;
    const pricePanelY = height - 150;

    ctx.fillStyle = 'rgba(10, 15, 20, 0.8)';
    ctx.beginPath(); roundRect(ctx, pricePanelX, pricePanelY, pricePanelW, pricePanelH, 15); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255, 215, 0, 0.5)'; ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 22px "Bein"';
    ctx.fillText("عشر صناديق = 10000", width/2 - 130, pricePanelY + 35);
    
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.fillRect(width/2 - 1, pricePanelY + 10, 2, 40);
    
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText("صندوق = 1000", width/2 + 130, pricePanelY + 35);

    ctx.fillStyle = '#E0E0E0';
    ctx.font = 'bold 26px "Bein"';
    ctx.shadowColor = '#B968FF'; 
    ctx.shadowBlur = 15;
    ctx.fillText(flavorText, width/2, height - 45);
    ctx.shadowBlur = 0;

    return canvas.toBuffer('image/png');
}

// 2. شاشة المخزن (المربعات) - نسخة محسنة السرعة 🚀
async function generateGachaInventory(userObj, freeChests, paidChests) {
    const width = 1200;
    const height = 675; 
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // 🔥 تحميل الصور بالتوازي للتسريع 🔥
    const chestUrl = `${R2_URL}/images/gacha/chest.png`;
    const avatarUrl = userObj.displayAvatarURL({ extension: 'png', size: 256 });

    const [chestImg, avatarImage] = await Promise.all([
        getCachedImage(chestUrl),
        loadImage(avatarUrl).catch(() => null)
    ]);

    ctx.fillStyle = '#0f1420';
    ctx.fillRect(0, 0, width, height);

    const vignette = ctx.createRadialGradient(width/2, height/2, 200, width/2, height/2, 800);
    vignette.addColorStop(0, 'rgba(0,0,0,0.15)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.9)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    for(let i=0; i<80; i++) {
        const px = Math.random() * width;
        const py = Math.random() * height;
        const pSize = Math.random() * 2.5;
        ctx.globalAlpha = Math.random() * 0.4 + 0.1;
        ctx.moveTo(px, py);
        ctx.arc(px, py, pSize, 0, Math.PI*2);
    }
    ctx.fill();
    ctx.globalAlpha = 1.0;

    const headerH = 110;
    ctx.fillStyle = 'rgba(5, 10, 15, 0.7)';
    ctx.fillRect(0, 0, width, headerH);
    
    const goldGrad = ctx.createLinearGradient(0, 0, width, 0);
    goldGrad.addColorStop(0, 'rgba(255, 215, 0, 0)');
    goldGrad.addColorStop(0.5, 'rgba(255, 215, 0, 0.8)');
    goldGrad.addColorStop(1, 'rgba(255, 215, 0, 0)');
    ctx.fillStyle = goldGrad;
    ctx.fillRect(0, headerH - 2, width, 2);

    const avatarSize = 75;
    const avatarX = 50 + avatarSize/2;
    const avatarY = headerH / 2;

    ctx.save();
    ctx.beginPath(); ctx.arc(avatarX, avatarY, avatarSize / 2, 0, Math.PI * 2); ctx.clip();
    if (avatarImage) ctx.drawImage(avatarImage, avatarX - avatarSize/2, avatarY - avatarSize/2, avatarSize, avatarSize);
    ctx.restore();
    
    ctx.beginPath(); ctx.arc(avatarX, avatarY, avatarSize / 2, 0, Math.PI * 2);
    ctx.lineWidth = 3; ctx.strokeStyle = '#FFD700'; ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = '#000'; ctx.shadowBlur = 5;
    let dName = userObj.displayName || userObj.username;
    drawAutoScaledArabicText(ctx, dName, avatarX + 55, avatarY, 200, 28, 14);
    ctx.shadowBlur = 0;

    ctx.textAlign = 'center';
    ctx.fillStyle = '#E0E0E0';
    ctx.font = 'bold 45px "Bein"';
    ctx.fillText('مخزن الصناديق السحرية', width/2, headerH + 60);

    const boxW = 300;
    const boxH = 350;
    const startY = 220;
    const gap = 150;
    const totalW = (boxW * 2) + gap;
    const startX = (width - totalW) / 2;

    // المربع الأول: المجاني
    const freeX = startX;
    ctx.fillStyle = 'rgba(20, 25, 30, 0.8)';
    ctx.beginPath(); roundRect(ctx, freeX, startY, boxW, boxH, 20); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(46, 204, 113, 0.6)'; ctx.stroke(); 

    if(chestImg) ctx.drawImage(chestImg, freeX + 50, startY + 20, 200, 200);

    ctx.fillStyle = '#2ECC71';
    ctx.font = 'bold 30px "Bein"';
    ctx.fillText('المجانية', freeX + boxW/2, startY + 260); 
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 40px "Arial"';
    ctx.fillText(freeChests.toString(), freeX + boxW/2, startY + 310);

    // المربع الثاني: المدفوع
    const paidX = startX + boxW + gap;
    ctx.fillStyle = 'rgba(20, 25, 30, 0.8)';
    ctx.beginPath(); roundRect(ctx, paidX, startY, boxW, boxH, 20); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(241, 196, 15, 0.6)'; ctx.stroke(); 

    if(chestImg) ctx.drawImage(chestImg, paidX + 50, startY + 20, 200, 200);

    ctx.fillStyle = '#F1C40F';
    ctx.font = 'bold 30px "Bein"';
    ctx.fillText('صناديقك', paidX + boxW/2, startY + 260); 
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 40px "Arial"';
    ctx.fillText(paidChests.toString(), paidX + boxW/2, startY + 310);

    ctx.fillStyle = '#B968FF';
    ctx.font = 'bold 35px "Bein"';
    ctx.fillText(`إجمالي الصناديق المتوفرة: ${freeChests + paidChests}`, width/2, height - 50);

    return canvas.toBuffer('image/png');
}

// 3. شاشة العنصر المستخرج
async function generateGachaCard(item, rarity) {
    const width = 800;
    const height = 800;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const rInfo = RARITY_INFO[rarity] || RARITY_INFO['Common'];
    const auraUrl = `${R2_URL}/images/materials/auras/${rarity}.png`;
    const auraImg = await getCachedImage(auraUrl);
    
    if (auraImg) {
        ctx.drawImage(auraImg, 0, 0, width, height);
    } else {
        const grad = ctx.createRadialGradient(width / 2, height / 2, 50, width / 2, height / 2, 500);
        grad.addColorStop(0, rInfo.color);
        grad.addColorStop(1, '#050505');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
    }

    const centerGlow = ctx.createRadialGradient(width/2, height/2 - 60, 20, width/2, height/2 - 60, 350);
    centerGlow.addColorStop(0, `${rInfo.color}60`);
    centerGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = centerGlow;
    ctx.fillRect(0, 0, width, height);

    let itemDrawn = false;
    if (item.imgPath) {
        const itemImg = await getCachedImage(item.imgPath);
        if (itemImg) {
            const itemSize = 380; 
            const ix = (width - itemSize) / 2;
            const iy = (height - itemSize) / 2 - 80;
            ctx.shadowColor = rInfo.color;
            ctx.shadowBlur = 100;
            ctx.drawImage(itemImg, ix, iy, itemSize, itemSize);
            ctx.shadowBlur = 0; 
            itemDrawn = true;
        }
    }

    if (!itemDrawn) {
        const cx = width / 2;
        const cy = height / 2 - 80;
        ctx.shadowColor = rInfo.color;
        ctx.shadowBlur = 120;
        ctx.fillStyle = rInfo.color;
        ctx.beginPath();
        ctx.moveTo(cx, cy - 120); ctx.lineTo(cx + 80, cy); ctx.lineTo(cx, cy + 120); ctx.lineTo(cx - 80, cy);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.beginPath();
        ctx.moveTo(cx, cy - 120); ctx.lineTo(cx + 80, cy); ctx.lineTo(cx, cy + 120);
        ctx.closePath(); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.font = '90px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText('✨', cx, cy + 10);
    }

    const bottomGrad = ctx.createLinearGradient(0, height - 350, 0, height);
    bottomGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    bottomGrad.addColorStop(0.5, 'rgba(0, 0, 0, 0.85)');
    bottomGrad.addColorStop(1, 'rgba(0, 0, 0, 0.98)');
    ctx.fillStyle = bottomGrad;
    ctx.fillRect(0, height - 350, width, 350);

    ctx.textAlign = 'center';
    ctx.font = '50px Arial';
    ctx.fillStyle = '#F1C40F';
    ctx.shadowColor = '#D4AC0D';
    ctx.shadowBlur = 20;
    ctx.fillText(rInfo.stars, width / 2, height - 200);
    ctx.shadowBlur = 0;

    ctx.lineWidth = 10;
    ctx.strokeStyle = 'rgba(0, 0, 0, 1)';
    const textGrad = ctx.createLinearGradient(0, height - 180, 0, height - 100);
    textGrad.addColorStop(0, '#FFFFFF');
    textGrad.addColorStop(1, '#D0D0D0');
    
    let fontSize = 75;
    ctx.font = `bold ${fontSize}px "Bein"`;
    while (ctx.measureText(item.name).width > width - 40 && fontSize > 20) {
        fontSize--;
        ctx.font = `bold ${fontSize}px "Bein"`;
    }
    
    ctx.strokeText(item.name, width / 2, height - 100);
    ctx.fillStyle = textGrad;
    ctx.fillText(item.name, width / 2, height - 100);

    let typeText = "اداة غامضة";
    if (item.type === 'material') typeText = "مورد تصنيع عتيق";
    if (item.type === 'book') typeText = "مخطوطة سحرية";
    if (item.type === 'skill') typeText = "مهارة خارقة";

    ctx.font = 'bold 32px "Bein"';
    ctx.fillStyle = rInfo.color; 
    ctx.fillText(`✦ ${typeText} ✦`, width / 2, height - 40);

    ctx.strokeStyle = `rgba(255, 255, 255, 0.08)`;
    ctx.lineWidth = 2;
    ctx.strokeRect(15, 15, width - 30, height - 30);

    return canvas.toBuffer('image/png');
}

module.exports = { generateGachaCard, generateGachaHub, generateGachaInventory };
