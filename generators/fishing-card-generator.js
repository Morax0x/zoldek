const { createCanvas, loadImage } = require('@napi-rs/canvas');
const path = require('path');
const fs = require('fs');

const THEME = {
    TEXT: "#FFFFFF",
    TENSION_LOW: "#2ecc71",   // أخضر مريح
    TENSION_MID: "#f1c40f",   // أصفر تحذيري
    TENSION_HIGH: "#e74c3c",  // أحمر خطر
    BAR_BG: "rgba(15, 20, 25, 0.75)", // خلفية زجاجية أنيقة
    UI_PANEL: "rgba(0, 0, 0, 0.5)"
};

const BASE_IMG_PATH = path.join(process.cwd(), 'images', 'fish');
const imageCache = new Map();

// 🚀 دالة التحميل المسبق (تعمل تلقائياً عند التشغيل)
async function preloadAssets() {
    console.log("[Fishing Generator] Starting asset preload into RAM...");
    
    const foldersToLoad = [
        { folder: 'beach', files: ['beach.png', 'shallow.png', 'deep.png', 'bermuda.png', 'trench.png', 'atlantis.png', 'dark_sea.png'] },
        { folder: '', files: ['fish.png'] }
    ];

    const shipFiles = [];
    const rodFiles = [];
    for(let i = 1; i <= 10; i++) {
        if(i <= 7) shipFiles.push(`boat_${i}.png`);
        rodFiles.push(`rod_${i}.png`);
    }
    
    foldersToLoad.push({ folder: 'ships', files: shipFiles });
    foldersToLoad.push({ folder: 'fishing', files: rodFiles });

    let loadedCount = 0;
    for (const group of foldersToLoad) {
        for (const file of group.files) {
            const fullPath = path.join(BASE_IMG_PATH, group.folder, file);
            if (fs.existsSync(fullPath)) {
                try {
                    const img = await loadImage(fullPath);
                    imageCache.set(fullPath, img);
                    loadedCount++;
                } catch (e) {
                    console.error(`[Fishing] ❌ خطأ في قراءة الصورة: ${fullPath}`);
                }
            }
        }
    }
    console.log(`[Fishing Generator] ✅ Successfully loaded ${loadedCount} assets into RAM.`);
}

preloadAssets();

function getCachedImage(folder, imageName) {
    const fullPath = path.join(BASE_IMG_PATH, folder, imageName);
    return imageCache.get(fullPath) || null;
}

// 🎨 دالة مساعدة لرسم مستطيلات بحواف دائرية (شكل احترافي)
function roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.closePath();
}

// 🔥 الدالة الرئيسية (مُحسنة للتصميم والفيزياء) 🔥
async function generateFishingCard(tension, distance, statusText, locationId = 'beach', boatLevel = 1, rodLevel = 1) {
    const canvasWidth = 800;
    const canvasHeight = 400;
    const canvas = createCanvas(canvasWidth, canvasHeight);
    const ctx = canvas.getContext('2d');

    const bgImage = getCachedImage('beach', `${locationId}.png`);
    const boatImage = getCachedImage('ships', `boat_${boatLevel}.png`) || getCachedImage('ships', 'boat_1.png');
    const rodImage = getCachedImage('fishing', `rod_${rodLevel}.png`) || getCachedImage('fishing', 'rod_1.png');
    const fishImage = getCachedImage('', 'fish.png');

    // 1. رسم الخلفية + طبقة تظليل خفيفة لإبراز العناصر
    if (bgImage) {
        ctx.drawImage(bgImage, 0, 0, canvasWidth, canvasHeight);
    } else {
        ctx.fillStyle = "#1A3B5C";
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    }
    ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // ==========================================
    // 📏 وزنية المواقع والأحجام (احترافية ومدروسة)
    // ==========================================
    const boatWidth = 280;
    const boatHeight = 180;
    const boatX = 20; 
    const boatY = 160; 

    // السنارة تكون بيد اللاعب فوق القارب
    const rodWidth = 100;
    const rodHeight = 100;
    const rodX = boatX + 150; 
    const rodY = boatY - 20;  

    // حساب موقع السمكة (تتحرك من اليمين لليسار حسب المسافة)
    // أقصى مسافة هي 150، وأدنى مسافة 0 (عند القارب)
    const safeDistance = Math.max(0, Math.min(distance, 150));
    const fishWidth = 70;
    const fishHeight = 50;
    
    // السمكة تبدأ من يمين الشاشة وتقترب للقارب (كلما قلت المسافة)
    const fishX = (boatX + boatWidth - 50) + ((safeDistance / 150) * 400);
    // إضافة حركة "طفو" بسيطة للسمكة لجعلها حيوية
    const fishBobbing = Math.sin(safeDistance) * 15; 
    const fishY = 240 + fishBobbing;

    // 2. رسم خيط السنارة (بفيزياء التوتر)
    const lineStartX = rodX + (rodWidth * 0.9); // رأس السنارة
    const lineStartY = rodY + (rodHeight * 0.1);
    const fishMouthX = fishX;
    const fishMouthY = fishY + (fishHeight / 2);

    ctx.beginPath();
    ctx.moveTo(lineStartX, lineStartY);

    // إذا كان التوتر ضعيف الخيط يرتخي (ينحني لأسفل)، وإذا انشد يصير مستقيم
    const sag = Math.max(0, 80 - tension); 
    const controlX = (lineStartX + fishMouthX) / 2;
    const controlY = Math.min(lineStartY, fishMouthY) + sag;

    ctx.quadraticCurveTo(controlX, controlY, fishMouthX, fishMouthY);
    
    // تحديد لون وسماكة الخيط حسب التوتر
    ctx.lineWidth = tension > 85 ? 4 : 2;
    ctx.strokeStyle = tension > 85 ? THEME.TENSION_HIGH : (tension > 50 ? THEME.TENSION_MID : THEME.TEXT);
    ctx.stroke();

    // 3. رسم الصور (القارب، السنارة، السمكة)
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 15;
    if (boatImage) ctx.drawImage(boatImage, boatX, boatY, boatWidth, boatHeight);
    if (rodImage) ctx.drawImage(rodImage, rodX, rodY, rodWidth, rodHeight);
    
    // رسم السمكة وإلغاء الظل بعدها
    if (fishImage) ctx.drawImage(fishImage, fishX, fishY, fishWidth, fishHeight);
    ctx.shadowBlur = 0;

    // ==========================================
    // 📊 واجهة المستخدم (العدادات والنصوص)
    // ==========================================

    // --- أ. عداد التوتر (يمين الشاشة) ---
    let tensionColor = THEME.TENSION_LOW;
    if (tension > 50) tensionColor = THEME.TENSION_MID;
    if (tension > 85) tensionColor = THEME.TENSION_HIGH;

    const tensionBarW = 25;
    const tensionBarH = 220;
    const tensionBarX = canvasWidth - 50;
    const tensionBarY = (canvasHeight - tensionBarH) / 2 - 20;

    // خلفية العداد
    ctx.fillStyle = THEME.BAR_BG;
    roundRect(ctx, tensionBarX, tensionBarY, tensionBarW, tensionBarH, 12);
    ctx.fill();

    // حشوة التوتر
    const safeTension = Math.min(Math.max(tension, 0), 100);
    const fillHeight = (safeTension / 100) * tensionBarH;
    const fillY = tensionBarY + (tensionBarH - fillHeight);
    
    ctx.fillStyle = tensionColor;
    ctx.save();
    roundRect(ctx, tensionBarX, fillY, tensionBarW, fillHeight, 12);
    ctx.clip();
    ctx.fillRect(tensionBarX, fillY, tensionBarW, fillHeight);
    ctx.restore();

    // إطار العداد
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    roundRect(ctx, tensionBarX, tensionBarY, tensionBarW, tensionBarH, 12);
    ctx.stroke();

    // نصوص التوتر
    ctx.fillStyle = THEME.TEXT;
    ctx.font = 'bold 16px "Arial"';
    ctx.textAlign = 'center';
    ctx.fillText('توتر', tensionBarX + (tensionBarW/2), tensionBarY - 10);
    ctx.fillStyle = tensionColor;
    ctx.fillText(`${Math.floor(safeTension)}%`, tensionBarX + (tensionBarW/2), tensionBarY + tensionBarH + 20);

    // --- ب. شريط المسافة والتقدم (أسفل الشاشة) ---
    const distBarW = 500;
    const distBarH = 20;
    const distBarX = (canvasWidth - distBarW) / 2 - 20;
    const distBarY = canvasHeight - 45;

    ctx.fillStyle = THEME.BAR_BG;
    roundRect(ctx, distBarX, distBarY, distBarW, distBarH, 10);
    ctx.fill();

    // إصلاح مشكلة "المشي بالعكس": الآن كلما قلت المسافة (اقتربت للصفر)، يمتلئ الشريط!
    const progressPercent = ((150 - safeDistance) / 150);
    const distFillW = progressPercent * distBarW;
    
    // تدرج لوني جميل لشريط السحب
    const progGrad = ctx.createLinearGradient(distBarX, 0, distBarX + distBarW, 0);
    progGrad.addColorStop(0, '#3498db');
    progGrad.addColorStop(1, '#00d2ff');
    
    ctx.fillStyle = progGrad;
    ctx.save();
    roundRect(ctx, distBarX, distBarY, Math.max(10, distFillW), distBarH, 10);
    ctx.clip();
    ctx.fillRect(distBarX, distBarY, distFillW, distBarH);
    ctx.restore();

    // نصوص المسافة
    ctx.fillStyle = THEME.TEXT;
    ctx.textAlign = 'left';
    ctx.font = 'bold 18px "Arial"';
    ctx.fillText(`المسافة: ${Math.floor(safeDistance)}m`, distBarX, distBarY - 10);
    
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.floor(progressPercent * 100)}%`, distBarX + distBarW, distBarY - 10);

    // --- ج. لوحة النص العلوي (الحالة) ---
    ctx.fillStyle = THEME.UI_PANEL;
    roundRect(ctx, canvasWidth/2 - 200, 15, 400, 50, 25);
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 22px "Arial"';
    
    // جعل النص يرتجف ويكون لونه أحمر إذا التوتر عالي جداً!
    if (tension > 85) {
        ctx.fillStyle = THEME.TENSION_HIGH;
        const shakeX = (Math.random() - 0.5) * 4;
        const shakeY = (Math.random() - 0.5) * 4;
        ctx.fillText(statusText, (canvasWidth / 2) + shakeX, 40 + shakeY);
    } else {
        ctx.fillStyle = THEME.TEXT;
        ctx.fillText(statusText, canvasWidth / 2, 40);
    }

    return await canvas.encode ? canvas.encode('png') : canvas.toBuffer('image/png');
}

module.exports = { generateFishingCard };
