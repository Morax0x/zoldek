const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');

try {
    GlobalFonts.registerFromPath(path.join(process.cwd(), 'fonts/bein-ar-normal.ttf'), 'Bein');
} catch (e) {
    console.warn("⚠️ لم يتم العثور على خط Bein.");
}

const imageCache = new Map();
const R2_URL = 'https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev';

const RARITY_COLORS = {
    'Common': '#B0BEC5',
    'Uncommon': '#2ECC71',
    'Rare': '#3498DB',
    'Epic': '#9B59B6',
    'Legendary': '#F1C40F'
};

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

function roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.closePath();
}

function resolveText(val) {
    if (val == null) return '';
    if (typeof val === 'object') return val.ar || val.en || val.name || JSON.stringify(val);
    return String(val);
}

function drawFantasyArrow(ctx, x, y, width, color) {
    ctx.save();
    ctx.translate(x, y);
    
    const grad = ctx.createLinearGradient(0, -10, width, 10);
    grad.addColorStop(0, 'rgba(255,255,255,0.4)');
    grad.addColorStop(0.5, color);
    grad.addColorStop(1, color);

    ctx.fillStyle = grad;
    ctx.shadowColor = color;
    ctx.shadowBlur = 15;
    
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(width - 35, -6);
    ctx.lineTo(width - 35, -20);
    ctx.lineTo(width, 0); 
    ctx.lineTo(width - 35, 20);
    ctx.lineTo(width - 35, 6);
    ctx.lineTo(0, 6);
    ctx.closePath();
    
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#FFFFFF';
    ctx.shadowBlur = 0;
    ctx.stroke();

    ctx.restore();
}

function drawAutoScaledArabicText(ctx, text, x, y, maxWidth, maxFontSize, minFontSize = 12) {
    const safeText = resolveText(text);
    let currentFontSize = maxFontSize;
    ctx.font = `bold ${currentFontSize}px "Bein"`;
    while (ctx.measureText(safeText).width > maxWidth && currentFontSize > minFontSize) {
        currentFontSize--;
        ctx.font = `bold ${currentFontSize}px "Bein"`;
    }
    ctx.fillText(safeText, x, y);
}

function drawAutoScaledText(ctx, text, x, y, maxWidth, maxFontSize, minFontSize = 12) {
    const safeText = resolveText(text);
    let currentFontSize = maxFontSize;
    ctx.font = `bold ${currentFontSize}px "Arial"`;
    while (ctx.measureText(safeText).width > maxWidth && currentFontSize > minFontSize) {
        currentFontSize--;
        ctx.font = `bold ${currentFontSize}px "Arial"`;
    }
    ctx.fillText(safeText, x, y);
}

function drawItemBox(ctx, x, y, size, img, rarity = 'Common', label = null, reqCount = null, userCount = null) {
    const color = RARITY_COLORS[rarity] || RARITY_COLORS['Common'];
    
    ctx.fillStyle = 'rgba(12, 16, 24, 0.95)';
    ctx.beginPath(); roundRect(ctx, x, y, size, size, 20); ctx.fill();

    ctx.shadowColor = color;
    ctx.shadowBlur = 20;
    ctx.lineWidth = 4;
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.shadowBlur = 0;

    if (img) {
        const padding = 15;
        const innerSize = size - (padding * 2);
        ctx.drawImage(img, x + padding, y + padding, innerSize, innerSize);
    } else {
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.font = 'bold 50px "Arial"';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('❓', x + size/2, y + size/2);
    }

    if (reqCount !== null) {
        const hasEnough = userCount >= reqCount;
        const boxColor = hasEnough ? '#2ECC71' : '#E74C3C';
        
        ctx.fillStyle = boxColor;
        ctx.beginPath(); roundRect(ctx, x + size/2 - 45, y - 25, 90, 45, 12); ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 22px "Arial"';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(`${userCount}/${reqCount}`, x + size/2, y - 2);
    }

    if (label) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)'; 
        ctx.beginPath(); roundRect(ctx, x - 10, y + size + 10, size + 20, 36, 12); ctx.fill();
        
        ctx.fillStyle = '#E0E0E0';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        drawAutoScaledArabicText(ctx, label, x + size/2, y + size + 28, size + 15, 20, 11);
    }
}

async function generateForgeUI(userObj, view, data) {
    const width = 1200;
    const height = 675; 
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    let activeView = view.replace('success_', '');
    const isSuccess = view.startsWith('success_');
    
    if (!isSuccess && !data.hasError) {
        if (activeView === 'main' && data.title?.includes('أكاديمية')) activeView = 'skill_home';
        if (activeView === 'synthesis' && !data.sacMatName) activeView = 'synthesis_home';
        if (activeView === 'smelting' && !data.sacMatName) activeView = 'smelting_home';
    }

    let bgUrl, emblemUrl, sparkColor, accentColor;
    
    if (activeView === 'weapon' || activeView === 'weapon_error') {
        bgUrl = 'images/forge/bg_forge.png';
        emblemUrl = 'images/forge/emblem_forge.png';
        sparkColor = '#FF8800'; accentColor = '#E74C3C';
    } else if (activeView.includes('skill')) {
        bgUrl = 'images/forge/bg_academy.png';
        emblemUrl = 'images/forge/emblem_magic.png';
        sparkColor = '#DDAAFF'; accentColor = '#9B59B6';
    } else if (activeView.includes('synthesis')) {
        bgUrl = 'images/forge/bg_synthesis.png';
        emblemUrl = 'images/forge/emblem_main_hub.png'; 
        sparkColor = '#55FF88'; accentColor = '#2ECC71';
    } else if (activeView.includes('smelting')) {
        bgUrl = 'images/forge/bg_smelting.png';
        emblemUrl = 'images/forge/emblem_smelt.png';
        sparkColor = '#FF4400'; accentColor = '#FF4400';
    } else { 
        bgUrl = 'images/forge/bg_main_hub.png';
        emblemUrl = 'images/forge/emblem_main_hub.png';
        sparkColor = '#00AAFF'; accentColor = '#3498DB';
    }

    let reqMatImg1 = null, reqMatImg2 = null, targetMatImg = null;
    
    if (!data.hasError) {
        if (activeView === 'weapon' || activeView === 'skill') {
            if (data.detailedReqs && data.detailedReqs.length > 0) {
                reqMatImg1 = await getCachedImage(data.detailedReqs[0].iconUrl);
                if (data.detailedReqs.length > 1) {
                    reqMatImg2 = await getCachedImage(data.detailedReqs[1].iconUrl);
                }
            }
        } 
        else if (activeView === 'synthesis' || activeView === 'smelting') {
            if (data.reqMatIcon) reqMatImg1 = await getCachedImage(data.reqMatIcon);
            if (data.targetMatIcon) targetMatImg = await getCachedImage(data.targetMatIcon);
        }
    }

    const [bgImage, emblemImg, avatarImage] = await Promise.all([
        getCachedImage(bgUrl),
        emblemUrl ? getCachedImage(emblemUrl) : null,
        loadImage(userObj.displayAvatarURL({ extension: 'png', size: 256 })).catch(() => null)
    ]);

    ctx.fillStyle = '#050608';
    ctx.fillRect(0, 0, width, height);
    if (bgImage) {
        ctx.drawImage(bgImage, 0, 0, width, height);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(0, 0, width, height);
    } else {
        const fallbackGrad = ctx.createRadialGradient(width/2, height/2, 50, width/2, height/2, 900);
        fallbackGrad.addColorStop(0, 'rgba(50, 50, 50, 0.5)');
        fallbackGrad.addColorStop(1, 'rgba(10, 10, 10, 0.95)');
        ctx.fillStyle = fallbackGrad;
        ctx.fillRect(0, 0, width, height);
    }

    ctx.fillStyle = sparkColor;
    ctx.beginPath();
    const pCount = activeView.includes('smelting') || activeView === 'weapon' ? 120 : 80;
    for(let i=0; i<pCount; i++) {
        const px = Math.random() * width;
        const py = Math.random() * height;
        const pSize = Math.random() * 3;
        ctx.globalAlpha = Math.random() * 0.7 + 0.1;
        ctx.moveTo(px, py); ctx.arc(px, py, pSize, 0, Math.PI*2);
    }
    ctx.fill(); ctx.globalAlpha = 1.0;

    const headerH = 100;
    ctx.fillStyle = 'rgba(5, 8, 12, 0.9)';
    ctx.fillRect(0, 0, width, headerH);
    
    const goldGrad = ctx.createLinearGradient(0, 0, width, 0);
    goldGrad.addColorStop(0, 'rgba(200, 150, 0, 0)');
    goldGrad.addColorStop(0.5, 'rgba(255, 215, 0, 1)');
    goldGrad.addColorStop(1, 'rgba(200, 150, 0, 0)');
    ctx.fillStyle = goldGrad;
    ctx.fillRect(0, headerH - 3, width, 3);

    const avatarSize = 70;
    const avatarX = 50 + avatarSize/2;
    const avatarY = headerH / 2;

    ctx.save();
    ctx.beginPath(); ctx.arc(avatarX, avatarY, avatarSize / 2, 0, Math.PI * 2); ctx.clip();
    if (avatarImage) ctx.drawImage(avatarImage, avatarX - avatarSize/2, avatarY - avatarSize/2, avatarSize, avatarSize);
    ctx.restore();
    
    ctx.beginPath(); ctx.arc(avatarX, avatarY, avatarSize / 2, 0, Math.PI * 2);
    ctx.lineWidth = 3; ctx.strokeStyle = '#FFD700'; ctx.stroke();

    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 6;
    drawAutoScaledArabicText(ctx, userObj.displayName || userObj.username, avatarX + 50, avatarY, 250, 26, 14);
    ctx.shadowBlur = 0;

    ctx.fillStyle = 'rgba(15, 20, 25, 0.9)';
    ctx.beginPath(); roundRect(ctx, width - 280, 25, 240, 50, 15); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255, 215, 0, 0.5)'; ctx.stroke();
    
    ctx.textAlign = 'right'; ctx.fillStyle = '#FFD700';
    drawAutoScaledText(ctx, (data.mora || 0).toLocaleString(), width - 80, 50, 160, 24, 12);
    ctx.font = '24px "Arial"'; ctx.fillText('🪙', width - 45, 50);

    ctx.textAlign = 'center'; ctx.fillStyle = '#F1C40F';
    ctx.font = 'bold 45px "Bein"';
    ctx.shadowColor = '#F1C40F'; ctx.shadowBlur = 15;
    ctx.fillText(resolveText(data.title || 'المجمع الإمبراطوري'), width / 2, 160);
    ctx.shadowBlur = 0;

    const panelY = 210;
    const panelW = 1100;
    const panelH = 430;
    const panelX = (width - panelW) / 2;

    ctx.fillStyle = 'rgba(8, 12, 16, 0.80)'; 
    ctx.beginPath(); roundRect(ctx, panelX, panelY, panelW, panelH, 25); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'; ctx.stroke();

    // 🔥 نظام رسم رسائل الخطأ داخل الكانفاس 🔥
    if (data.hasError) {
        ctx.fillStyle = '#E74C3C'; 
        ctx.font = 'bold 55px "Bein"';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.shadowColor = '#E74C3C'; ctx.shadowBlur = 20;
        ctx.fillText('تــنــبــيــه', width/2, panelY + 120);
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#E0E0E0'; 
        ctx.font = 'bold 38px "Bein"';
        drawAutoScaledArabicText(ctx, data.errorMsg, width/2, panelY + 250, panelW - 100, 38, 18);
        
        return canvas.toBuffer('image/png');
    }

    if (isSuccess) {
        ctx.fillStyle = '#2ECC71'; ctx.font = 'bold 50px "Bein"';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.shadowColor = '#2ECC71'; ctx.shadowBlur = 20;
        
        let msg = "";
        if (activeView === 'weapon') msg = "✨ تمت عملية صقل السلاح بنجاح! ✨";
        else if (activeView === 'skill') msg = "✨ تم استيعاب حكمة المهارة بنجاح! ✨";
        else if (activeView === 'synthesis') msg = "🔄 تمت عملية دمج العناصر بنجاح! 🔄";
        else if (activeView === 'smelting') msg = "🔥 تمت عملية الصهر بنجاح! 🔥";

        ctx.fillText(msg, width/2, panelY + 80);
        ctx.shadowBlur = 0;

        if (activeView === 'weapon' || activeView === 'skill') {
            ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 50px "Arial"';
            ctx.fillText(`المستوى الجديد: Lv.${data.nextLevel}`, width/2, panelY + 200);
            ctx.fillStyle = accentColor; ctx.font = 'bold 45px "Arial"';
            ctx.fillText(resolveText(data.nextStat), width/2, panelY + 280);
        }
        else if (activeView === 'synthesis') {
            drawItemBox(ctx, width/2 - 90, panelY + 140, 180, targetMatImg, data.targetMatRarity);
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.beginPath(); roundRect(ctx, width/2 - 200, panelY + 360, 400, 45, 15); ctx.fill();
            ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 30px "Bein"'; ctx.textBaseline = 'middle';
            drawAutoScaledArabicText(ctx, `حصلت على: ${resolveText(data.targetMatName)}`, width/2, panelY + 382, 360, 30, 16);
        }
        else if (activeView === 'smelting') {
            ctx.fillStyle = '#2ECC71'; ctx.font = 'bold 100px "Arial"';
            ctx.shadowColor = '#2ECC71'; ctx.shadowBlur = 30;
            ctx.fillText(`+${data.xpGain} XP`, width/2, panelY + 220);
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#E0E0E0'; ctx.font = 'bold 30px "Bein"';
            ctx.fillText('تمت إضافتها إلى خبرتك الشخصية', width/2, panelY + 320);
        }
        return canvas.toBuffer('image/png');
    }

    if (activeView === 'main' || activeView.endsWith('_home')) {
        if (emblemImg) {
            ctx.save();
            ctx.shadowColor = accentColor;
            ctx.shadowBlur = 30; 
            ctx.drawImage(emblemImg, width/2 - 90, panelY + 30, 180, 180);
            ctx.restore();
        } else {
            let emoji = '🏛️';
            if(activeView === 'skill_home') emoji = '🔮';
            else if(activeView === 'synthesis_home') emoji = '⚗️';
            else if(activeView === 'smelting_home') emoji = '🌋';
            
            ctx.save();
            ctx.translate(width/2, panelY + 120);
            ctx.beginPath(); ctx.arc(0, 0, 80, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(10, 15, 20, 0.9)'; ctx.fill();
            ctx.lineWidth = 5; ctx.strokeStyle = accentColor; ctx.shadowColor = accentColor; ctx.shadowBlur = 40; ctx.stroke();
            ctx.font = '70px "Arial"'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.shadowBlur = 0;
            ctx.fillText(emoji, 0, 5);
            ctx.restore();
        }

        ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 42px "Bein"'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        
        if (activeView === 'main') {
            ctx.fillText('مرحباً بك في المجمع الإمبراطوري', width/2, panelY + 270);
            ctx.fillStyle = '#AAAAAA'; ctx.font = 'bold 26px "Bein"';
            ctx.fillText('الرجاء اختيار القسم الذي تود زيارته من الأزرار بالأسفل', width/2, panelY + 330);
        }
        else if (activeView === 'skill_home') {
            ctx.fillText('أكاديمية السحر', width/2, panelY + 270);
            ctx.fillStyle = '#AAAAAA'; ctx.font = 'bold 26px "Bein"';
            ctx.fillText('الرفوف مليئة بالمخطوطات... اختر المهارة المراد صقلها من القائمة', width/2, panelY + 330);
        }
        else if (activeView === 'synthesis_home') {
            ctx.fillText('فرن الدمج الكيميائي', width/2, panelY + 270);
            ctx.fillStyle = '#AAAAAA'; ctx.font = 'bold 26px "Bein"';
            ctx.fillText('قانون التبادل: ضع 4 عناصر متطابقة لاستخلاص عنصر جديد', width/2, panelY + 330);
        }
        else if (activeView === 'smelting_home') {
            ctx.fillText('محرقة التفكيك', width/2, panelY + 270);
            ctx.fillStyle = '#AAAAAA'; ctx.font = 'bold 26px "Bein"';
            ctx.fillText('ألقِ بعتادك الزائد في النار المشتعلة لتحصل على خبرة خالصة', width/2, panelY + 330);
        }
    }

    else if (activeView === 'weapon' || activeView === 'skill') {
        const isWeapon = activeView === 'weapon';
        const midX = panelX + 500; 

        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#FFD700'; ctx.font = 'bold 34px "Bein"';
        ctx.fillText(isWeapon ? 'التطوير القادم' : 'الصقل القادم', panelX + 250, panelY + 60);

        const statsY_Level = panelY + 170;
        const statsY_Value = panelY + 300;
        
        const oldX = panelX + 60;   
        const arrowX = panelX + 180; 
        const newX = panelX + 340;  

        ctx.save(); ctx.globalAlpha = 0.4;
        ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 40px "Arial"'; ctx.textAlign = 'left';
        ctx.fillText(`Lv.${data.currentLevel}`, oldX, statsY_Level);
        ctx.restore();

        drawFantasyArrow(ctx, arrowX, statsY_Level, 130, '#FFD700');

        ctx.save();
        ctx.fillStyle = '#2ECC71'; ctx.font = 'bold 45px "Arial"'; ctx.textAlign = 'left';
        ctx.shadowColor = '#2ECC71'; ctx.shadowBlur = 15;
        ctx.fillText(`Lv.${data.nextLevel}`, newX, statsY_Level);
        ctx.restore();

        ctx.save(); ctx.globalAlpha = 0.4;
        ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 34px "Arial"'; ctx.textAlign = 'left';
        drawAutoScaledText(ctx, data.currentStat, oldX, statsY_Value, 110, 34, 14);
        ctx.restore();

        drawFantasyArrow(ctx, arrowX, statsY_Value, 130, accentColor);

        ctx.save();
        ctx.fillStyle = accentColor; ctx.font = 'bold 38px "Arial"'; ctx.textAlign = 'left';
        ctx.shadowColor = accentColor; ctx.shadowBlur = 15;
        drawAutoScaledText(ctx, data.nextStat, newX, statsY_Value, 150, 38, 14);
        ctx.restore();

        const lineGrad = ctx.createLinearGradient(0, panelY + 40, 0, panelY + panelH - 40);
        lineGrad.addColorStop(0, 'rgba(255,215,0,0)');
        lineGrad.addColorStop(0.5, 'rgba(255,215,0,0.3)');
        lineGrad.addColorStop(1, 'rgba(255,215,0,0)');
        ctx.fillStyle = lineGrad; ctx.fillRect(midX - 1, panelY + 40, 3, panelH - 80);

        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#FFD700'; ctx.font = 'bold 34px "Bein"';
        ctx.fillText('المتطلبات', panelX + 800, panelY + 60);

        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.beginPath(); roundRect(ctx, panelX + 610, panelY + 95, 380, 55, 15); ctx.fill();
        const moraColor = data.mora >= data.reqMora ? '#2ECC71' : '#E74C3C';
        ctx.fillStyle = moraColor; ctx.font = 'bold 28px "Arial"';
        ctx.fillText(`${data.mora.toLocaleString()} / ${data.reqMora.toLocaleString()} 🪙`, panelX + 800, panelY + 122);

        ctx.textBaseline = 'alphabetic';
        const reqItemY = panelY + 200;

        if (data.detailedReqs && data.detailedReqs.length > 1) {
            const req1 = data.detailedReqs[0];
            const req2 = data.detailedReqs[1];
            
            drawItemBox(ctx, panelX + 600, reqItemY, 140, reqMatImg1, req1.rarity || 'Rare', req1.name, req1.count, req1.userCount);
            ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 50px "Arial"'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('+', panelX + 800, reqItemY + 70);
            drawItemBox(ctx, panelX + 860, reqItemY, 140, reqMatImg2, req2.rarity || 'Rare', req2.name, req2.count, req2.userCount);

        } else {
            const req = data.detailedReqs ? data.detailedReqs[0] : { name: data.reqMatName, rarity: data.reqMatRarity, count: data.reqMatCount, userCount: data.userMatCount };
            drawItemBox(ctx, panelX + 715, reqItemY, 170, reqMatImg1, req.rarity || 'Rare', req.name, req.count, req.userCount);
        }
    }
    
    else if (activeView === 'synthesis') {
        const itemSize = 180;
        const leftItemX = panelX + 160;
        const rightItemX = panelX + panelW - 340;
        const itemY = panelY + 150; 

        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath(); roundRect(ctx, leftItemX - 20, itemY - 70, itemSize + 40, 45, 12); ctx.fill();
        ctx.fillStyle = '#E74C3C'; ctx.font = 'bold 28px "Bein"'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('عنصر الدمج (4x)', leftItemX + itemSize/2, itemY - 45);
        drawItemBox(ctx, leftItemX, itemY, itemSize, reqMatImg1, data.sacMatRarity || 'Rare', data.sacMatName, 4, 4); 
        drawFantasyArrow(ctx, width/2 - 70, panelY + 220, 140, '#F1C40F');

        if (data.targetMatName) {
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.beginPath(); roundRect(ctx, rightItemX - 20, itemY - 70, itemSize + 40, 45, 12); ctx.fill();
            ctx.fillStyle = '#2ECC71'; ctx.font = 'bold 28px "Bein"'; ctx.textBaseline = 'middle';
            ctx.fillText('النتيجة (1x)', rightItemX + itemSize/2, itemY - 45);
            drawItemBox(ctx, rightItemX, itemY, itemSize, targetMatImg, data.targetMatRarity || 'Rare', data.targetMatName, null, null); 
            
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.beginPath(); roundRect(ctx, width/2 - 200, panelY + 360, 400, 45, 15); ctx.fill();
            ctx.fillStyle = data.mora >= data.fee ? '#2ECC71' : '#E74C3C';
            ctx.font = 'bold 26px "Bein"'; ctx.textBaseline = 'middle';
            ctx.fillText(`رسوم الدمج: ${data.fee?.toLocaleString()} 🪙`, width/2, panelY + 382);
        } else {
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.beginPath(); roundRect(ctx, rightItemX - 20, itemY - 70, itemSize + 40, 45, 12); ctx.fill();
            ctx.fillStyle = '#AAAAAA'; ctx.font = 'bold 28px "Bein"'; ctx.textBaseline = 'middle';
            ctx.fillText('النتيجة (1x)', rightItemX + itemSize/2, itemY - 45);
            ctx.fillStyle = 'rgba(255,255,255,0.05)';
            ctx.beginPath(); roundRect(ctx, rightItemX, itemY, itemSize, itemSize, 20); ctx.fill();
            ctx.fillStyle = '#777777'; ctx.font = 'bold 26px "Bein"'; ctx.textBaseline = 'middle';
            ctx.fillText('بانتظار تحديد', rightItemX + itemSize/2, itemY + itemSize/2 - 15);
            ctx.fillText('العنصر المطلوب', rightItemX + itemSize/2, itemY + itemSize/2 + 20);
        }
    }
    
    else if (activeView === 'smelting') {
        const itemSize = 200;
        const leftItemX = panelX + 180;
        const itemY = panelY + 150; 

        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath(); roundRect(ctx, leftItemX - 20, itemY - 70, itemSize + 40, 45, 12); ctx.fill();
        ctx.fillStyle = '#FF4400'; ctx.font = 'bold 28px "Bein"'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('العنصر المراد صهره', leftItemX + itemSize/2, itemY - 45);
        drawItemBox(ctx, leftItemX, itemY, itemSize, reqMatImg1, data.sacMatRarity || 'Uncommon', data.sacMatName, null, null);
        drawFantasyArrow(ctx, width/2 - 75, panelY + 230, 150, '#FF3300');

        const xpBoxW = 340, xpBoxH = 160;
        const xpBoxX = panelX + panelW - 480, xpBoxY = panelY + 150;

        ctx.fillStyle = 'rgba(46, 204, 113, 0.1)';
        ctx.beginPath(); roundRect(ctx, xpBoxX, xpBoxY, xpBoxW, xpBoxH, 20); ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = '#2ECC71'; ctx.shadowColor = 'rgba(46, 204, 113, 0.4)'; ctx.shadowBlur = 20; ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#2ECC71'; ctx.font = 'bold 65px "Arial"'; ctx.textBaseline = 'middle';
        ctx.shadowColor = '#2ECC71'; ctx.shadowBlur = 10;
        ctx.fillText(`+${data.xpGain} XP`, xpBoxX + xpBoxW/2, xpBoxY + xpBoxH/2);
        ctx.shadowBlur = 0;
        
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.beginPath(); roundRect(ctx, xpBoxX + 20, xpBoxY + xpBoxH + 10, xpBoxW - 40, 45, 12); ctx.fill();
        ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 26px "Bein"'; ctx.textBaseline = 'middle';
        ctx.fillText('خبرة شخصية خالصة', xpBoxX + xpBoxW/2, xpBoxY + xpBoxH + 32);
    }

    return canvas.toBuffer('image/png');
}

module.exports = { generateForgeUI };
