const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');
const fs = require('fs');

try {
    const fontsDir = path.join(process.cwd(), 'fonts');
    const beinPath = path.join(fontsDir, 'bein-ar-normal.ttf');
    const emojiPath = path.join(fontsDir, 'NotoEmoj.ttf');
    
    if (fs.existsSync(beinPath)) GlobalFonts.registerFromPath(beinPath, 'Bein');
    if (fs.existsSync(emojiPath)) GlobalFonts.registerFromPath(emojiPath, 'Emoji');
} catch (e) {}

const FONT_MAIN = '"Bein", "Arial", sans-serif';
const FONT_EMOJI = '"Emoji", "Arial", sans-serif';

const imageCache = new Map();

let resolveItemInfoLocal;
try {
    const invGen = require('./inventory-generator.js');
    resolveItemInfoLocal = invGen.resolveItemInfo;
} catch (e) {
    resolveItemInfoLocal = (id) => ({ imgPath: null });
}

async function getCachedImage(imageUrl) {
    if (!imageUrl || !imageUrl.startsWith('http')) return null;
    const encodedUrl = encodeURI(imageUrl);
    if (imageCache.has(encodedUrl)) return imageCache.get(encodedUrl);
    try {
        const img = await loadImage(encodedUrl);
        imageCache.set(encodedUrl, img);
        return img;
    } catch (e) { return null; }
}

const loadJsonSafe = (fileName) => {
    try {
        const filePath = path.join(process.cwd(), 'json', fileName);
        if (fs.existsSync(filePath)) return require(filePath);
    } catch(e) {}
    return [];
};

setTimeout(async () => {
    const allItems = [
        ...loadJsonSafe('farm-animals.json'),
        ...loadJsonSafe('seeds.json'),
        ...loadJsonSafe('feed-items.json')
    ];
    for (const item of allItems) {
        const itemDict = resolveItemInfoLocal(item.id);
        const url = item.image || itemDict.imgPath;
        if (url) await getCachedImage(url);
    }
}, 1000);

function getRarityAndColor(price) {
    if (price >= 10000) return { rarity: 'Legendary', color: '#FFD700' };
    if (price >= 4000) return { rarity: 'Epic', color: '#B968FF' };
    if (price >= 1500) return { rarity: 'Rare', color: '#00C3FF' };
    if (price >= 800) return { rarity: 'Uncommon', color: '#2ECC71' };
    return { rarity: 'Common', color: '#A8B8D0' };
}

function drawOrnateFrame(ctx, x, y, w, h, color) {
    const bgGrad = ctx.createLinearGradient(x, y, x, y + h);
    bgGrad.addColorStop(0, 'rgba(15, 20, 30, 0.9)');
    bgGrad.addColorStop(1, 'rgba(5, 10, 15, 0.95)');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(x, y, w, h);
    
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
    
    const cl = 20; 
    ctx.lineWidth = 3;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(x, y + cl); ctx.lineTo(x, y); ctx.lineTo(x + cl, y);
    ctx.moveTo(x + w - cl, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + cl);
    ctx.moveTo(x + w, y + h - cl); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - cl, y + h);
    ctx.moveTo(x + cl, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - cl);
    ctx.stroke();
    ctx.shadowBlur = 0;
}

function drawRibbon(ctx, x, y, w, h, color) {
    const ext = 10;
    ctx.fillStyle = 'rgba(5, 5, 8, 0.95)';
    ctx.beginPath();
    ctx.moveTo(x - ext, y);
    ctx.lineTo(x + w + ext, y);
    ctx.lineTo(x + w + ext - 8, y + h / 2);
    ctx.lineTo(x + w + ext, y + h);
    ctx.lineTo(x - ext, y + h);
    ctx.lineTo(x - ext + 8, y + h / 2);
    ctx.closePath();
    ctx.fill();
    
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
}

function drawAutoScaledText(ctx, text, x, y, maxWidth, maxFontSize, minFontSize = 10) {
    let currentFontSize = maxFontSize;
    ctx.font = `bold ${currentFontSize}px ${FONT_MAIN}`;
    while (ctx.measureText(text).width > maxWidth && currentFontSize > minFontSize) {
        currentFontSize--;
        ctx.font = `bold ${currentFontSize}px ${FONT_MAIN}`;
    }
    ctx.fillText(text, x, y);
}

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

function cleanEmojis(text) {
    if (!text) return '';
    return text.replace(/[\u{1F600}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F300}-\u{1F5FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FADF}\u{1F004}-\u{1F0CF}\u{2B00}-\u{2BFF}₿🪙]/gu, '').trim();
}

exports.drawFarmAnimalsGrid = async function(targetUser, animals, page, totalPages, maxCap, currCap, totalIncome) {
    const width = 1350;
    const height = 900;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const bgGrad = ctx.createRadialGradient(width/2, height/2, 100, width/2, height/2, 900);
    bgGrad.addColorStop(0, '#1a1025');
    bgGrad.addColorStop(1, '#050508');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#FFFFFF';
    for(let i=0; i<150; i++) {
        const px = Math.random() * width;
        const py = Math.random() * height;
        const pSize = Math.random() * 2;
        ctx.globalAlpha = Math.random() * 0.4 + 0.1;
        ctx.beginPath(); ctx.arc(px, py, pSize, 0, Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha = 1.0;

    const headerH = 140;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, width, headerH);
    
    const goldGrad = ctx.createLinearGradient(0, 0, width, 0);
    goldGrad.addColorStop(0, 'rgba(255, 215, 0, 0)');
    goldGrad.addColorStop(0.5, 'rgba(255, 215, 0, 0.8)');
    goldGrad.addColorStop(1, 'rgba(255, 215, 0, 0)');
    ctx.fillStyle = goldGrad;
    ctx.fillRect(0, headerH - 3, width, 3);

    const avatarSize = 100;
    const avatarX = 40;
    const avatarY = (headerH - avatarSize) / 2;
    
    ctx.save();
    roundRect(ctx, avatarX, avatarY, avatarSize, avatarSize, 20);
    ctx.clip();
    ctx.fillStyle = '#000000';
    ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
    try {
        const avatarImg = await loadImage(targetUser.displayAvatarURL({ extension: 'png', size: 256 }));
        ctx.drawImage(avatarImg, avatarX, avatarY, avatarSize, avatarSize);
    } catch (e) {}
    ctx.restore();

    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 2;
    ctx.strokeRect(avatarX, avatarY, avatarSize, avatarSize);

    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FFD700';
    ctx.font = `bold 40px ${FONT_MAIN}`;
    ctx.shadowColor = '#FFD700';
    ctx.shadowBlur = 15;
    ctx.fillText(`الحظيرة`, width - 40, 50);
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#FFFFFF';
    ctx.font = `28px ${FONT_MAIN}`;
    ctx.fillText(`العضو: ${cleanEmojis(targetUser.username)}`, width - 40, 95);

    ctx.textAlign = 'left';
    ctx.font = `24px ${FONT_MAIN}`;
    ctx.fillStyle = currCap >= maxCap ? '#FF4444' : '#00FF88';
    ctx.fillText(`سعة الحظيرة: [ ${currCap} / ${maxCap} ]`, avatarX + avatarSize + 30, 55);
    
    ctx.fillStyle = '#FFD700';
    ctx.fillText(`دخل الحظيرة اليومي: ${totalIncome.toLocaleString()} مورا`, avatarX + avatarSize + 30, 95);

    let cols, slotW, slotH, iconSize, fontTitle, fontText, gapX, gapY;

    if (animals.length === 1) {
        cols = 1; slotW = 800; slotH = 400; iconSize = 240; fontTitle = 45; fontText = 24; gapX = 0; gapY = 0;
    } else if (animals.length === 2) {
        cols = 2; slotW = 580; slotH = 360; iconSize = 180; fontTitle = 35; fontText = 20; gapX = 50; gapY = 0;
    } else if (animals.length <= 4) {
        cols = 2; slotW = 540; slotH = 280; iconSize = 140; fontTitle = 28; fontText = 16; gapX = 50; gapY = 40;
    } else {
        cols = 3; slotW = 380; slotH = 220; iconSize = 100; fontTitle = 22; fontText = 14; gapX = 50; gapY = 25;
    }
    
    const actualCols = Math.min(animals.length, cols);
    const actualRows = Math.ceil(animals.length / cols);
    
    const startX = (width - ((actualCols * slotW) + ((actualCols - 1) * gapX))) / 2;
    const gridTotalHeight = (actualRows * slotH) + ((actualRows - 1) * gapY);
    const availableHeight = height - headerH - 50; 
    const startY = headerH + ((availableHeight - gridTotalHeight) / 2);

    const preloadedImages = await Promise.all(animals.map(async animal => {
        const itemDict = resolveItemInfoLocal(animal.id);
        const imgUrl = animal.image || itemDict.imgPath;
        if (imgUrl) return await getCachedImage(imgUrl);
        return null;
    }));

    for (let i = 0; i < animals.length; i++) {
        const animal = animals[i];
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = startX + col * (slotW + gapX);
        const y = startY + row * (slotH + gapY);

        const { color } = getRarityAndColor(animal.price);

        drawOrnateFrame(ctx, x, y, slotW, slotH, color);

        const aura = ctx.createRadialGradient(x + slotW/2, y + slotH/2, 10, x + slotW/2, y + slotH/2, Math.max(slotW, slotH));
        aura.addColorStop(0, `${color}25`); 
        aura.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = aura;
        ctx.fillRect(x, y, slotW, slotH);
        
        const ribbonH = fontTitle + 20;
        const ribbonY = y + slotH - ribbonH - 20;
        drawRibbon(ctx, x + 20, ribbonY, slotW - 40, ribbonH, color);
        
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#FFFFFF';
        drawAutoScaledText(ctx, cleanEmojis(animal.name), x + slotW / 2, ribbonY + ribbonH / 2, slotW - 60, fontTitle, 12);

        const topAreaH = slotH - ribbonH - 30; 
        
        const iconX = x + slotW - iconSize - 25;
        const iconY = y + 15 + (topAreaH - iconSize) / 2;

        const img = preloadedImages[i];
        if (img) {
            ctx.save();
            ctx.shadowColor = color;
            ctx.shadowBlur = 30;
            ctx.drawImage(img, iconX, iconY, iconSize, iconSize);
            ctx.restore();
        } else {
            ctx.fillStyle = '#FFFFFF';
            ctx.font = `${iconSize * 0.6}px ${FONT_EMOJI}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = color;
            ctx.shadowBlur = 30;
            ctx.fillText(animal.emoji || '📦', iconX + iconSize / 2, iconY + iconSize / 2);
            ctx.shadowBlur = 0;
        }

        const lineGap = fontText + 12;
        const totalTextH = (5 * fontText) + (4 * 12); 
        const textStartX = iconX - 25;
        let textStartY = y + 15 + (topAreaH - totalTextH) / 2;

        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';

        ctx.fillStyle = '#00FF88';
        ctx.font = `bold ${fontText + 2}px ${FONT_MAIN}`;
        ctx.fillText(`العدد: ${animal.quantity.toLocaleString()}`, textStartX, textStartY);

        textStartY += lineGap;
        ctx.fillStyle = '#A8B8D0';
        ctx.font = `${fontText}px ${FONT_MAIN}`;
        ctx.fillText(`الدخل: +${animal.income} مورا`, textStartX, textStartY);
        
        textStartY += lineGap;
        const lifespan = animal.lifespan || 30; 
        const currentAge = animal.age || 0;
        const remainingDays = Math.max(0, lifespan - currentAge);
        ctx.fillStyle = '#FFD700';
        ctx.fillText(`العمر: ${currentAge} / ${lifespan} أيام`, textStartX, textStartY);

        textStartY += lineGap;
        ctx.fillStyle = remainingDays <= 3 ? '#FF4444' : '#00FF88';
        ctx.fillText(`متبقي للعمر: ${remainingDays} أيام`, textStartX, textStartY);

        textStartY += lineGap;
        const hungerMs = animal.hungerTimestamp || 0;
        const now = Date.now();
        let hungerStatus = '';
        let hungerColor = '#00FF88';

        if (hungerMs > now) {
            const hoursLeft = Math.floor((hungerMs - now) / (1000 * 60 * 60));
            hungerStatus = `شبعان (${hoursLeft} س)`;
        } else {
            hungerStatus = cleanEmojis(animal.hungerText) || 'جائع';
            hungerColor = '#FF4444';
        }

        ctx.fillStyle = hungerColor;
        ctx.fillText(`الحالة: ${hungerStatus}`, textStartX, textStartY);
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#E0E0E0';
    ctx.font = `20px ${FONT_MAIN}`;
    ctx.fillText(`صفحة ${page + 1} من ${totalPages}`, width / 2, height - 30);

    return canvas.toBuffer('image/png');
};
