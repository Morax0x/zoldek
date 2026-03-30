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

    // 🔥 المنطق الذكي لتغيير حجم البطاقات والمسافات بناءً على عدد الحيوانات 🔥
    let cols, slotW, slotH, iconSize, fontTitle, fontText;

    if (animals.length === 1) {
        cols = 1; slotW = 800; slotH = 400; iconSize = 220; fontTitle = 35; fontText = 30;
    } else if (animals.length === 2) {
        cols = 2; slotW = 550; slotH = 320; iconSize = 160; fontTitle = 28; fontText = 24;
    } else if (animals.length <= 4) {
        cols = 2; slotW = 500; slotH = 280; iconSize = 130; fontTitle = 24; fontText = 20;
    } else {
        cols = 3; slotW = 380; slotH = 220; iconSize = 100; fontTitle = 20; fontText = 18;
    }

    const gapX = 50;
    const gapY = 30;
    
    // حساب موقع البداية عشان تتوسط الشبكة في الشاشة بشكل مثالي
    const actualCols = Math.min(animals.length, cols);
    const actualRows = Math.ceil(animals.length / cols);
    const startX = (width - ((actualCols * slotW) + ((actualCols - 1) * gapX))) / 2;
    
    const gridTotalHeight = (actualRows * slotH) + ((actualRows - 1) * gapY);
    const availableHeight = height - headerH - 50; // المساحة المتبقية تحت الهيدر وفوق الفوتر
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

        const aura = ctx.createRadialGradient(x + slotW/2, y + slotH/2, 10, x + slotW/2, y + slotH/2, slotW/1.2);
        aura.addColorStop(0, `${color}25`); 
        aura.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = aura;
        ctx.fillRect(x, y, slotW, slotH);
        
        // الأيقونة الديناميكية
        const iconContainerX = x + slotW - iconSize - 20;
        const iconContainerY = y + 25;

        const img = preloadedImages[i];
        let imgDrawn = false;
        
        if (img) {
            ctx.save();
            ctx.shadowColor = color;
            ctx.shadowBlur = 30;
            ctx.drawImage(img, iconContainerX, iconContainerY, iconSize, iconSize);
            ctx.restore();
            imgDrawn = true;
        }
        
        if (!imgDrawn) {
            ctx.fillStyle = '#FFFFFF';
            ctx.font = `${iconSize * 0.6}px ${FONT_EMOJI}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = color;
            ctx.shadowBlur = 30;
            ctx.fillText(animal.emoji || '📦', iconContainerX + iconSize / 2, iconContainerY + iconSize / 2);
            ctx.shadowBlur = 0;
        }

        // الشريط السفلي الديناميكي
        const ribbonH = fontTitle + 20;
        const ribbonY = y + slotH - ribbonH - 20;
        drawRibbon(ctx, x + 20, ribbonY, slotW - 40, ribbonH, color);
        
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#FFFFFF';
        drawAutoScaledText(ctx, cleanEmojis(animal.name), x + slotW / 2, ribbonY + ribbonH / 2, slotW - 60, fontTitle, 12);

        // النصوص تتجاوب مع حجم الخط والمسافات الجديدة
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        const textStartX = iconContainerX - 25;
        let textStartY = y + 40;
        const lineGap = fontText + 15;

        ctx.fillStyle = '#00FF88';
        ctx.font = `bold ${fontText + 4}px ${FONT_MAIN}`;
        ctx.fillText(`العدد: ${animal.quantity.toLocaleString()}`, textStartX, textStartY);

        textStartY += lineGap;
        ctx.fillStyle = '#A8B8D0';
        ctx.font = `${fontText}px ${FONT_MAIN}`;
        ctx.fillText(`الدخل: +${animal.income} مورا`, textStartX, textStartY);
        
        textStartY += lineGap;
        ctx.fillStyle = animal.isHungry ? '#FF4444' : '#00FF88';
        ctx.fillText(`الحالة: ${cleanEmojis(animal.hungerText)}`, textStartX, textStartY);
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#E0E0E0';
    ctx.font = `20px ${FONT_MAIN}`;
    ctx.fillText(`صفحة ${page + 1} من ${totalPages}`, width / 2, height - 25);

    return canvas.toBuffer('image/png');
};
