exports.drawFarmAnimalsGrid = async function(targetUser, animals, page, totalPages, maxCap, currCap, totalIncome) {
    const width = 1350;
    const height = 900;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // خلفية متدرجة فخمة
    const bgGrad = ctx.createRadialGradient(width/2, height/2, 100, width/2, height/2, 900);
    bgGrad.addColorStop(0, '#1a1025');
    bgGrad.addColorStop(1, '#050508');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // إضافة نجوم خفيفة في الخلفية
    ctx.fillStyle = '#FFFFFF';
    for(let i=0; i<150; i++) {
        const px = Math.random() * width;
        const py = Math.random() * height;
        const pSize = Math.random() * 2;
        ctx.globalAlpha = Math.random() * 0.4 + 0.1;
        ctx.beginPath(); ctx.arc(px, py, pSize, 0, Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha = 1.0;

    // رأس الصفحة (Header)
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
    ctx.fillText(`الحظيرة الملكية`, width - 40, 50);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = `28px ${FONT_MAIN}`;
    ctx.fillText(`المالك: ${cleanEmojis(targetUser.username)}`, width - 40, 95);

    ctx.textAlign = 'left';
    ctx.font = `24px ${FONT_MAIN}`;
    ctx.fillStyle = currCap >= maxCap ? '#FF4444' : '#00FF88';
    ctx.fillText(`السعة: [ ${currCap} / ${maxCap} ]`, avatarX + avatarSize + 30, 55);
    
    ctx.fillStyle = '#FFD700';
    ctx.fillText(`الدخل اليومي: ${totalIncome.toLocaleString()} مورا`, avatarX + avatarSize + 30, 95);

    // 🔥 الحسبة الجديدة للأحجام الديناميكية 🔥
    let cols, slotW, slotH, iconSize, fontTitle, fontText, gapX, gapY;

    if (animals.length === 1) {
        cols = 1; slotW = 900; slotH = 450; iconSize = 280; fontTitle = 45; fontText = 35; gapX = 0; gapY = 0;
    } else if (animals.length === 2) {
        cols = 2; slotW = 580; slotH = 400; iconSize = 200; fontTitle = 35; fontText = 28; gapX = 40; gapY = 0;
    } else if (animals.length <= 4) {
        cols = 2; slotW = 550; slotH = 280; iconSize = 150; fontTitle = 28; fontText = 22; gapX = 50; gapY = 40;
    } else {
        cols = 3; slotW = 400; slotH = 230; iconSize = 110; fontTitle = 22; fontText = 18; gapX = 30; gapY = 30;
    }

    const actualCols = Math.min(animals.length, cols);
    const actualRows = Math.ceil(animals.length / cols);
    
    const startX = (width - ((actualCols * slotW) + ((actualCols - 1) * gapX))) / 2;
    const gridTotalHeight = (actualRows * slotH) + ((actualRows - 1) * gapY);
    const startY = headerH + 30 + ((height - headerH - 80 - gridTotalHeight) / 2);

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

        // رسم الإطار الخارجي
        drawOrnateFrame(ctx, x, y, slotW, slotH, color);

        // وهج خلف الأيقونة
        const aura = ctx.createRadialGradient(x + slotW - iconSize/2 - 30, y + iconSize/2 + 30, 10, x + slotW - iconSize/2 - 30, y + iconSize/2 + 30, iconSize);
        aura.addColorStop(0, `${color}33`);
        aura.addColorStop(1, 'transparent');
        ctx.fillStyle = aura;
        ctx.fillRect(x, y, slotW, slotH);
        
        const iconX = x + slotW - iconSize - 30;
        const iconY = y + (slotH - iconSize) / 2 - 20;

        const img = preloadedImages[i];
        if (img) {
            ctx.save();
            ctx.shadowColor = color; ctx.shadowBlur = 20;
            ctx.drawImage(img, iconX, iconY, iconSize, iconSize);
            ctx.restore();
        } else {
            ctx.fillStyle = '#FFFFFF';
            ctx.font = `${iconSize * 0.7}px ${FONT_EMOJI}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(animal.emoji || '📦', iconX + iconSize / 2, iconY + iconSize / 2);
        }

        // شريط العنوان
        const ribbonH = fontTitle + 20;
        const ribbonY = y + slotH - ribbonH - 25;
        drawRibbon(ctx, x + 25, ribbonY, slotW - 50, ribbonH, color);
        
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#FFFFFF';
        drawAutoScaledText(ctx, cleanEmojis(animal.name), x + slotW / 2, ribbonY + ribbonH / 2, slotW - 80, fontTitle, 14);

        // البيانات النصية الجانبية
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        const textX = iconX - 30;
        let textY = y + 40;
        const spacing = fontText + 15;

        ctx.fillStyle = '#00FF88';
        ctx.font = `bold ${fontText + 6}px ${FONT_MAIN}`;
        ctx.fillText(`الكمية: ${animal.quantity.toLocaleString()}`, textX, textY);

        textY += spacing;
        ctx.fillStyle = '#A8B8D0';
        ctx.font = `${fontText}px ${FONT_MAIN}`;
        ctx.fillText(`العائد: +${animal.income} مورا`, textX, textY);
        
        textY += spacing;
        ctx.fillStyle = animal.isHungry ? '#FF4444' : '#00FF88';
        ctx.font = `bold ${fontText - 2}px ${FONT_MAIN}`;
        ctx.fillText(`الحالة: ${cleanEmojis(animal.hungerText)}`, textX, textY);
    }

    // تذييل الصفحة
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = `20px ${FONT_MAIN}`;
    ctx.fillText(`صفحة [ ${page + 1} / ${totalPages} ]`, width / 2, height - 35);

    return canvas.toBuffer('image/png');
};
