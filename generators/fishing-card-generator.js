const { createCanvas, loadImage } = require('@napi-rs/canvas'); // استخدام @napi-rs/canvas لأنه أسرع بكثير من canvas العادي
const path = require('path');
const fs = require('fs');

const THEME = {
    TEXT: "#FFFFFF",
    TENSION_LOW: "#00FF88",
    TENSION_MID: "#FFD700",
    TENSION_HIGH: "#FF3333",
    BAR_BG: "rgba(0, 0, 0, 0.6)"
};

const BASE_IMG_PATH = path.join(process.cwd(), 'images', 'fish');

// 🔥 الذاكرة العشوائية لتخزين الصور لضمان سرعة 0 تأخير 🔥
const imageCache = new Map();

// 🚀 دالة التحميل المسبق (تعمل تلقائياً عند التشغيل)
async function preloadAssets() {
    console.log("[Fishing Generator] Starting asset preload into RAM...");
    
    const foldersToLoad = [
        { folder: 'beach', files: ['beach.png', 'shallow.png', 'deep.png', 'bermuda.png', 'trench.png', 'atlantis.png', 'dark_sea.png'] },
        { folder: '', files: ['fish.png'] } // فقط fish.png
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

// دالة سريعة لجلب الصور من الكاش
function getCachedImage(folder, imageName) {
    const fullPath = path.join(BASE_IMG_PATH, folder, imageName);
    return imageCache.get(fullPath) || null;
}

// الدالة الرئيسية (مُحسنة للسرعة)
async function generateFishingCard(tension, distance, statusText, locationId = 'beach', boatLevel = 1, rodLevel = 1) {
    const canvasWidth = 800;
    const canvasHeight = 400;
    const canvas = createCanvas(canvasWidth, canvasHeight);
    const ctx = canvas.getContext('2d');

    const bgImage = getCachedImage('beach', `${locationId}.png`);
    const boatImage = getCachedImage('ships', `boat_${boatLevel}.png`) || getCachedImage('ships', 'boat_1.png');
    const rodImage = getCachedImage('fishing', `rod_${rodLevel}.png`) || getCachedImage('fishing', 'rod_1.png');
    const fishImage = getCachedImage('', 'fish.png');

    // 1. رسم الخلفية
    if (bgImage) {
        ctx.drawImage(bgImage, 0, 0, canvasWidth, canvasHeight);
    } else {
        ctx.fillStyle = "#1A3B5C";
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    }

    let tensionColor = THEME.TENSION_LOW;
    if (tension > 50) tensionColor = THEME.TENSION_MID;
    if (tension > 80) tensionColor = THEME.TENSION_HIGH;

    // 2. رسم العداد الخارجي
    const tensionBarX = 730;
    const tensionBarY = 50;
    const tensionBarW = 30;
    const tensionBarH = 250;

    ctx.fillStyle = THEME.BAR_BG;
    // استخدام fillRect بدلاً من roundRect لأنه أسرع للمعالج
    ctx.fillRect(tensionBarX, tensionBarY, tensionBarW, tensionBarH);

    // 3. رسم الحشوة الداخلية للعداد
    const fillHeight = (tension / 100) * tensionBarH;
    const fillY = tensionBarY + (tensionBarH - fillHeight);
    
    ctx.fillStyle = tensionColor;
    ctx.fillRect(tensionBarX, fillY, tensionBarW, fillHeight);

    // 4. نصوص العداد
    ctx.fillStyle = THEME.TEXT;
    ctx.font = 'bold 16px "Arial"';
    ctx.textAlign = 'center';
    ctx.fillText('توتر الخيط', tensionBarX + 15, tensionBarY - 15);
    ctx.fillText(`${Math.floor(tension)}%`, tensionBarX + 15, tensionBarY + tensionBarH + 25);

    // ==========================================
    // الوزنية السريعة للأحجام والمواقع
    // ==========================================
    const boatWidth = 260;
    const boatHeight = 160;
    const boatX = 30; 
    const boatY = 180; 

    const rodWidth = 70;
    const rodHeight = 70;
    const rodX = boatX + 160; 
    const rodY = boatY + 10;  

    const fishWidth = 80;
    const fishHeight = 60;
    // السمكة تتحرك من اليمين لليسار
    const fishX = 320 + ((distance / 100) * 350);
    const fishY = 260;

    // رسم الخيط (أسرع بدون LineDash)
    ctx.beginPath();
    const lineStartX = rodX + (rodWidth * 0.85); 
    const lineStartY = rodY + (rodHeight * 0.15);
    ctx.moveTo(lineStartX, lineStartY); 
    ctx.lineTo(fishX + 10, fishY + 20);
    ctx.lineWidth = tension > 80 ? 4 : 2;
    ctx.strokeStyle = tensionColor;
    ctx.stroke();

    // رسم الصور (بدون انتظار وبدون تحقق متكرر لأنها بالكاش)
    if (boatImage) ctx.drawImage(boatImage, boatX, boatY, boatWidth, boatHeight);
    if (rodImage) ctx.drawImage(rodImage, rodX, rodY, rodWidth, rodHeight);
    if (fishImage) ctx.drawImage(fishImage, fishX, fishY, fishWidth, fishHeight);

    // ==========================================

    // 5. رسم شريط المسافة
    const distBarX = 50;
    const distBarY = 350;
    const distBarW = 600;
    const distBarH = 15;

    ctx.fillStyle = THEME.BAR_BG;
    ctx.fillRect(distBarX, distBarY, distBarW, distBarH);

    const distFillW = ((100 - Math.min(distance, 100)) / 100) * distBarW;
    ctx.fillStyle = "#00a8ff"; 
    ctx.fillRect(distBarX, distBarY, distFillW, distBarH);

    ctx.fillStyle = THEME.TEXT;
    ctx.textAlign = 'left';
    ctx.fillText(`المسافة المتبقية: ${Math.floor(distance)}m`, distBarX, distBarY - 10);

    // 6. طباعة النص العلوي (مع تحديد النص الأسود ليكون واضحاً بأسرع طريقة)
    ctx.textAlign = 'center';
    ctx.font = 'bold 24px "Arial"';
    
    // طريقة الـ Stroke أسرع من الظل للكمبيوتر (CPU)
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#000000';
    ctx.strokeText(statusText, canvasWidth / 2, 40);
    
    ctx.fillStyle = THEME.TEXT;
    ctx.fillText(statusText, canvasWidth / 2, 40);

    // تحويل الكانفاس إلى بايتات صورة
    return canvas.toBuffer('image/png');
}

module.exports = { generateFishingCard };
