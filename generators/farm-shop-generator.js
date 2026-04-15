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

function wrapText(ctx, text, maxWidth) {
    const words = text.split(' ');
    let lines = [];
    let currentLine = words[0];
    for (let i = 1; i < words.length; i++) {
        const word = words[i];
        const width = ctx.measureText(currentLine + " " + word).width;
        if (width < maxWidth) {
            currentLine += " " + word;
        } else {
            lines.push(currentLine);
            currentLine = word;
        }
    }
    lines.push(currentLine);
    return lines;
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

exports.drawFarmShopGrid = async function(items, category, maxCap, currCap) {
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
    for(let i=0; i<200; i++) {
        const px = Math.random() * width;
        const py = Math.random() * height;
        const pSize = Math.random() * 2.5;
        ctx.globalAlpha = Math.random() * 0.5 + 0.1;
        ctx.beginPath(); ctx.arc(px, py, pSize, 0, Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha = 1.0;

    const headerH = 120;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, width, headerH);
    
    const goldGrad = ctx.createLinearGradient(0, 0, width, 0);
    goldGrad.addColorStop(0, 'rgba(255, 215, 0, 0)');
    goldGrad.addColorStop(0.5, 'rgba(255, 215, 0, 0.8)');
    goldGrad.addColorStop(1, 'rgba(255, 215, 0, 0)');
    ctx.fillStyle = goldGrad;
    ctx.fillRect(0, headerH - 3, width, 3);
    ctx.fillRect(0, 3, width, 1);

    const catName = category === 'animals' ? 'قسم الحيوانات' : (category === 'seeds' ? 'قسم البذور' : 'قسم الأعلاف');
    
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FFD700'; 
    ctx.font = `bold 50px ${FONT_MAIN}`;
    ctx.shadowColor = '#FFD700';
    ctx.shadowBlur = 25;
    ctx.fillText(`✦ المتجر الزراعي ✦`, width / 2, 50);

    ctx.fillStyle = '#E0E0E0';
    ctx.font = `24px ${FONT_MAIN}`;
    ctx.shadowBlur = 0;
    ctx.letterSpacing = "3px";
    ctx.fillText(`⟪ ${catName} ⟫`, width / 2, 95);

    if (category === 'animals') {
        ctx.textAlign = 'left';
        ctx.fillStyle = currCap >= maxCap ? '#FF4444' : '#00FF88';
        ctx.fillText(`السعة: [ ${currCap} / ${maxCap} ]`, 40, 60);
    }

    const isSeeds = category === 'seeds';
    const cols = isSeeds ? 4 : 3;
    const rows = 3;
    const slotW = isSeeds ? 290 : 380;
    const slotH = 220;
    const gapX = isSeeds ? 30 : 50;
    const gapY = 25;
    const startX = (width - ((cols * slotW) + ((cols - 1) * gapX))) / 2;
    const startY = 150;

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = startX + col * (slotW + gapX);
        const y = startY + row * (slotH + gapY);

        const { color } = getRarityAndColor(item.price);

        drawOrnateFrame(ctx, x, y, slotW, slotH, color);

        const aura = ctx.createRadialGradient(x + slotW/2, y + slotH/2, 10, x + slotW/2, y + slotH/2, slotW/1.2);
        aura.addColorStop(0, `${color}25`); 
        aura.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = aura;
        ctx.fillRect(x, y, slotW, slotH);
        
        const iconContainerSize = isSeeds ? 80 : 100;
        const iconContainerX = x + slotW - iconContainerSize - 15;
        const iconContainerY = y + (isSeeds ? 15 : 20);

        if (category === 'seeds' || category === 'feed') {
            drawOrnateFrame(ctx, iconContainerX, iconContainerY, iconContainerSize, iconContainerSize, color);
            const innerAura = ctx.createRadialGradient(iconContainerX + iconContainerSize/2, iconContainerY + iconContainerSize/2, 5, iconContainerX + iconContainerSize/2, iconContainerY + iconContainerSize/2, iconContainerSize/1.5);
            innerAura.addColorStop(0, `${color}40`); 
            innerAura.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = innerAura;
            ctx.fillRect(iconContainerX, iconContainerY, iconContainerSize, iconContainerSize);
        }

        const itemDict = resolveItemInfoLocal(item.id);
        const imgUrl = item.image || itemDict.imgPath;
        let imgDrawn = false;
        
        if (imgUrl) {
            const img = await getCachedImage(imgUrl);
            if (img) {
                ctx.save();
                if (category === 'seeds' || category === 'feed') {
                    ctx.beginPath();
                    roundRect(ctx, iconContainerX + 2, iconContainerY + 2, iconContainerSize - 4, iconContainerSize - 4, 10);
                    ctx.clip();
                    ctx.drawImage(img, iconContainerX + 2, iconContainerY + 2, iconContainerSize - 4, iconContainerSize - 4);
                } else {
                    ctx.shadowColor = color;
                    ctx.shadowBlur = 30;
                    ctx.drawImage(img, iconContainerX, iconContainerY, iconContainerSize, iconContainerSize);
                }
                ctx.restore();
                imgDrawn = true;
            }
        }
        
        if (!imgDrawn) {
            ctx.fillStyle = '#FFFFFF';
            ctx.font = `${isSeeds ? 55 : 65}px ${FONT_EMOJI}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = color;
            ctx.shadowBlur = 30;
            ctx.fillText(item.emoji || '📦', iconContainerX + iconContainerSize / 2, iconContainerY + iconContainerSize / 2);
            ctx.shadowBlur = 0;
        }

        ctx.textAlign = 'right';
        ctx.fillStyle = '#FFD700';
        ctx.font = `bold ${isSeeds ? 18 : 22}px ${FONT_MAIN}`;
        ctx.fillText(`${item.price.toLocaleString()} مورا`, iconContainerX - 10, y + (isSeeds ? 40 : 50));

        ctx.fillStyle = '#A8B8D0';
        ctx.font = `${isSeeds ? 16 : 18}px ${FONT_MAIN}`;
        
        if (category === 'animals') {
            ctx.fillText(`الدخل: ${item.income_per_day}`, iconContainerX - 10, y + 80);
            ctx.fillText(`العمر: ${item.lifespan_days} يوم | الحجم: ${item.size}`, iconContainerX - 10, y + 105);
        } else if (category === 'seeds') {
            ctx.fillText(`البيع: ${item.sell_price}`, iconContainerX - 10, y + 70);
            ctx.fillText(`النمو: ${item.growth_time_hours}س`, iconContainerX - 10, y + 95);
        } else {
            const desc = item.description ? item.description.substring(0, 20) + '...' : 'علف مخصص.';
            ctx.fillText(desc, iconContainerX - 10, y + 80);
        }

        const ribbonH = 35;
        const ribbonY = y + slotH - ribbonH - 15;
        drawRibbon(ctx, x + 15, ribbonY, slotW - 30, ribbonH, color);
        
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FFFFFF';
        drawAutoScaledText(ctx, cleanEmojis(item.name), x + slotW / 2, ribbonY + ribbonH / 2, slotW - 40, 18, 10);
    }

    const buffer = await (canvas.encode ? canvas.encode('png') : canvas.toBuffer('image/png'));
    canvas.width = 0;
    canvas.height = 0;
    return buffer;
};

// -------------------------------------------------------------
// بطاقة تفاصيل الشراء المفردة (لكل قسم) 🔥 تم التصميم بالصناديق المرتبة 🔥
// -------------------------------------------------------------
exports.drawFarmShopDetail = async function(item, category, userQty, maxCap, currCap) {
    const width = 1000;
    const height = 600;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const { color } = getRarityAndColor(item.price);

    const bgGrad = ctx.createRadialGradient(width/2, height/2, 100, width/2, height/2, 800);
    bgGrad.addColorStop(0, '#151520');
    bgGrad.addColorStop(1, '#05050A');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    const auraGrad = ctx.createRadialGradient(300, height/2, 50, 300, height/2, 400);
    auraGrad.addColorStop(0, `${color}40`);
    auraGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = auraGrad;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.strokeRect(10, 10, width - 20, height - 20);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(15, 15, width - 30, height - 30);

    const imgSize = 350;
    const imgX = 80;
    const imgY = (height - imgSize) / 2;

    drawOrnateFrame(ctx, imgX, imgY, imgSize, imgSize, color);
    
    const innerAura = ctx.createRadialGradient(imgX + imgSize/2, imgY + imgSize/2, 10, imgX + imgSize/2, imgY + imgSize/2, imgSize/1.5);
    innerAura.addColorStop(0, `${color}80`);
    innerAura.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = innerAura;
    ctx.fillRect(imgX, imgY, imgSize, imgSize);

    const itemDict = resolveItemInfoLocal(item.id);
    const imgUrl = item.image || itemDict.imgPath;

    let imgDrawn = false;
    if (imgUrl) {
        const img = await getCachedImage(imgUrl);
        if (img) {
            ctx.save();
            if (category === 'seeds' || category === 'feed') {
                ctx.beginPath();
                roundRect(ctx, imgX + 4, imgY + 4, imgSize - 8, imgSize - 8, 20);
                ctx.clip();
                ctx.drawImage(img, imgX + 4, imgY + 4, imgSize - 8, imgSize - 8);
            } else {
                const padding = 40;
                const finalImgSize = imgSize - (padding * 2);
                ctx.shadowColor = color;
                ctx.shadowBlur = 60;
                ctx.drawImage(img, imgX + padding, imgY + padding - 20, finalImgSize, finalImgSize);
            }
            ctx.restore();
            imgDrawn = true;
        }
    }

    if (!imgDrawn) {
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `150px ${FONT_EMOJI}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = color;
        ctx.shadowBlur = 50;
        ctx.fillText(item.emoji || '📦', imgX + imgSize / 2, imgY + imgSize / 2 - 20);
        ctx.shadowBlur = 0;
    }

    const startBoxesX = imgX + imgSize + 40;
    const textX = width - 40;
    
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillStyle = color;
    ctx.font = `bold 60px ${FONT_MAIN}`;
    ctx.shadowColor = color;
    ctx.shadowBlur = 15;
    ctx.fillText(cleanEmojis(item.name), textX, 70);
    ctx.shadowBlur = 0;

    ctx.beginPath();
    ctx.moveTo(textX, 150);
    ctx.lineTo(startBoxesX, 150);
    const lineGrad = ctx.createLinearGradient(textX, 150, startBoxesX, 150);
    lineGrad.addColorStop(0, color);
    lineGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.strokeStyle = lineGrad;
    ctx.lineWidth = 3;
    ctx.stroke();

    // 🔥 دالة رسم الصناديق الأنيقة للمعلومات 🔥
    const drawInfoBox = (label, value, icon, x, y, w, h, boxColor) => {
        ctx.fillStyle = 'rgba(15, 20, 30, 0.8)';
        ctx.beginPath(); roundRect(ctx, x, y, w, h, 12); ctx.fill();
        ctx.strokeStyle = boxColor; ctx.lineWidth = 2; ctx.stroke();

        ctx.fillStyle = boxColor;
        ctx.font = `28px ${FONT_EMOJI}`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(icon, x + w - 15, y + h / 2);

        ctx.fillStyle = '#A8B8D0';
        ctx.font = `20px ${FONT_MAIN}`;
        ctx.textAlign = 'right';
        ctx.fillText(label, x + w - 60, y + h / 2 - 12);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = `bold 24px ${FONT_MAIN}`;
        ctx.fillText(value, x + w - 60, y + h / 2 + 15);
    };

    const boxW = 240;
    const boxH = 80;
    const gapX = 20;
    const gapY = 20;

    const col1X = width - 40 - boxW;
    const col2X = col1X - boxW - gapX;
    
    let currentY = 180;

    // صندوق السعر الثابت
    drawInfoBox("السعر (مورا)", item.price.toLocaleString(), "💰", col1X, currentY, boxW, boxH, '#FFD700');

    // صندوق السعة / المخزون
    if (category === 'animals') {
        const capacityText = `${maxCap - currCap} مكان متاح`;
        drawInfoBox("سعة الحظيرة", capacityText, "🏡", col2X, currentY, boxW, boxH, '#00FF88');
    } else {
        drawInfoBox("مخزونك الحالي", userQty.toLocaleString(), "📦", col2X, currentY, boxW, boxH, '#00FF88');
    }

    currentY += boxH + gapY;

    // صناديق التفاصيل حسب النوع
    if (category === 'animals') {
        drawInfoBox("الدخل اليومي", `+${item.income_per_day} مورا`, "💸", col1X, currentY, boxW, boxH, '#2ECC71');
        drawInfoBox("العمر الافتراضي", `${item.lifespan_days} أيام`, "⏳", col2X, currentY, boxW, boxH, '#00C3FF');
        
        currentY += boxH + gapY;
        drawInfoBox("أقصى جوع", `${item.max_hunger_days} أيام`, "🍗", col1X, currentY, boxW, boxH, '#FF4444');
        drawInfoBox("حجم الحيوان", `${item.size} وحدة`, "📏", col2X, currentY, boxW, boxH, '#B968FF');
    } else if (category === 'seeds') {
        drawInfoBox("سعر البيع", `${item.sell_price} مورا`, "🏷️", col1X, currentY, boxW, boxH, '#2ECC71');
        drawInfoBox("وقت النمو", `${item.growth_time_hours} ساعة`, "⏳", col2X, currentY, boxW, boxH, '#00C3FF');
        
        currentY += boxH + gapY;
        drawInfoBox("الخبرة عند الحصاد", `+${item.xp_reward} XP`, "✨", col1X, currentY, boxW, boxH, '#B968FF');
    } else {
        // صندوق كبير لوصف العلف
        const descBoxW = col1X + boxW - col2X;
        const descBoxH = 120;
        ctx.fillStyle = 'rgba(15, 20, 30, 0.8)';
        ctx.beginPath(); roundRect(ctx, col2X, currentY, descBoxW, descBoxH, 12); ctx.fill();
        ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
        
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `24px ${FONT_MAIN}`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        const descText = item.description || 'علف مخصص لحيوانات المزرعة.';
        const lines = wrapText(ctx, descText, descBoxW - 40);
        let dY = currentY + 20;
        for (let j = 0; j < lines.length; j++) {
            ctx.fillText(lines[j], col1X + boxW - 20, dY);
            dY += 35;
        }
    }

    const buffer = await (canvas.encode ? canvas.encode('png') : canvas.toBuffer('image/png'));
    canvas.width = 0;
    canvas.height = 0;
    return buffer;
};

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
    ctx.fillText(`الحظيرة الملكية`, width - 40, 50);
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#FFFFFF';
    ctx.font = `28px ${FONT_MAIN}`;
    ctx.fillText(`المالك: ${cleanEmojis(targetUser.username)}`, width - 40, 95);

    ctx.textAlign = 'left';
    ctx.font = `24px ${FONT_MAIN}`;
    ctx.fillStyle = currCap >= maxCap ? '#FF4444' : '#00FF88';
    ctx.fillText(`السعة: [ ${currCap} / ${maxCap} ]`, avatarX + avatarSize + 30, 55);
    
    ctx.fillStyle = '#FFD700';
    ctx.fillText(`الدخل اليومي: ${totalIncome.toLocaleString()} مورا`, avatarX + avatarSize + 30, 95);

    let cols, slotW, slotH, iconSize, fontTitle, fontText, gapX, gapY;

    if (animals.length === 1) {
        cols = 1; slotW = 900; slotH = 450; iconSize = 250; fontTitle = 50; fontText = 36; gapX = 0; gapY = 0;
    } else if (animals.length === 2) {
        cols = 2; slotW = 580; slotH = 400; iconSize = 190; fontTitle = 38; fontText = 28; gapX = 40; gapY = 0;
    } else if (animals.length <= 4) {
        cols = 2; slotW = 540; slotH = 290; iconSize = 140; fontTitle = 30; fontText = 23; gapX = 50; gapY = 40;
    } else {
        cols = 3; slotW = 410; slotH = 240; iconSize = 110; fontTitle = 24; fontText = 19; gapX = 30; gapY = 30;
    }
    
    const actualCols = Math.min(animals.length, cols);
    const actualRows = Math.ceil(animals.length / cols);
    
    const startX = (width - ((actualCols * slotW) + ((actualCols - 1) * gapX))) / 2;
    const gridTotalHeight = (actualRows * slotH) + ((actualRows - 1) * gapY);
    const availableHeight = height - headerH - 50; 
    const startY = headerH + 30 + ((availableHeight - 60 - gridTotalHeight) / 2);

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

        const topAreaH = slotH - ribbonH - 20; 
        
        const iconX = x + slotW - iconSize - 20;
        const iconY = y + 10 + (topAreaH - iconSize) / 2;

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
        const textStartX = iconX - 15;
        let textStartY = y + 10 + (topAreaH - totalTextH) / 2;

        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';

        ctx.fillStyle = '#00FF88';
        ctx.font = `bold ${fontText + 2}px ${FONT_MAIN}`;
        ctx.fillText(`العدد: ${animal.quantity.toLocaleString()}`, textStartX, textStartY);

        textStartY += lineGap;
        ctx.fillStyle = '#A8B8D0';
        ctx.font = `${fontText}px ${FONT_MAIN}`;
        ctx.fillText(`العائد: +${animal.income} مورا`, textStartX, textStartY);
        
        textStartY += lineGap;
        const lifespan = animal.lifespan_days || animal.lifespan || 30; 
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
            const diffMs = hungerMs - now;
            const hoursLeft = Math.floor(diffMs / (1000 * 60 * 60));
            const minutesLeft = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
            
            if (hoursLeft > 0) {
                hungerStatus = `شبعان (${hoursLeft}س و ${minutesLeft}د)`;
            } else {
                hungerStatus = `شبعان (${minutesLeft} دقيقة)`;
            }
        } else {
            hungerStatus = cleanEmojis(animal.hungerText) || 'جائع';
            hungerColor = '#FF4444';
        }

        ctx.fillStyle = hungerColor;
        ctx.font = `bold ${fontText - 2}px ${FONT_MAIN}`;
        ctx.fillText(`الحالة: ${hungerStatus}`, textStartX, textStartY);
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = `20px ${FONT_MAIN}`;
    ctx.fillText(`صفحة [ ${page + 1} / ${totalPages} ]`, width / 2, height - 35);

    const buffer = await (canvas.encode ? canvas.encode('png') : canvas.toBuffer('image/png'));
    canvas.width = 0;
    canvas.height = 0;
    return buffer;
};
