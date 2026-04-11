const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas'); 
const path = require('path');

try {
    GlobalFonts.registerFromPath(path.join(__dirname, '../fonts/bein-ar-normal.ttf'), 'Bein');
} catch (e) {
    console.log("⚠️ لم يتم العثور على خط Bein.");
}

function drawRandomPolygon(ctx, cx, cy, radius, sides) {
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
        const angle = (i * 2 * Math.PI) / sides + (Math.random() * 0.5);
        const r = radius * (0.5 + Math.random() * 0.5);
        const x = cx + r * Math.cos(angle);
        const y = cy + r * Math.sin(angle);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();
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

async function generateEpicAnnouncement(user, mainTitle, subTitle, description, value, themeColor = '#FFD700', oldUser = null, isTakeover = false) {
    const width = 1200;
    const height = 400; 
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const bgBase = ctx.createLinearGradient(0, 0, width, height);
    bgBase.addColorStop(0, '#050508'); 
    bgBase.addColorStop(1, '#151520');
    ctx.fillStyle = bgBase;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    for (let i = 0; i < 200; i++) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        const radius = Math.random() * 80 + 20;
        const sides = Math.floor(Math.random() * 3) + 3;

        const shardGrad = ctx.createRadialGradient(x, y, 0, x, y, radius);
        shardGrad.addColorStop(0, themeColor); 
        shardGrad.addColorStop(1, 'rgba(0,0,0,0.9)'); 

        drawRandomPolygon(ctx, x, y, radius, sides);
        ctx.globalAlpha = 0.35; 
        ctx.fillStyle = shardGrad;
        ctx.fill();
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#000000'; 
        ctx.stroke();
    }
    ctx.restore();

    const vignette = ctx.createRadialGradient(width/2, height/2, 150, width/2, height/2, 700);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.95)'); 
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);

    ctx.lineWidth = 6;
    ctx.strokeStyle = themeColor;
    ctx.strokeRect(3, 3, width - 6, height - 6);

    let textRightLimit = width - 50;

    if (isTakeover) {
        textRightLimit = 1150; 

        const oldX = 170;
        const oldY = 200;
        const oldRadius = 65;
        
        ctx.save();
        ctx.globalAlpha = 0.7; 
        ctx.beginPath();
        ctx.arc(oldX, oldY, oldRadius, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        try {
            if (oldUser && oldUser !== 'EMPTY') {
                const oldAvatarUrl = oldUser.displayAvatarURL({ extension: 'png', size: 256 });
                const oldImg = await loadImage(oldAvatarUrl);
                ctx.filter = 'grayscale(60%) brightness(75%)'; 
                ctx.drawImage(oldImg, oldX - oldRadius, oldY - oldRadius, oldRadius * 2, oldRadius * 2);
                ctx.filter = 'none';
            } else {
                ctx.fillStyle = '#222'; ctx.fill();
            }
        } catch (e) { ctx.fillStyle = '#222'; ctx.fill(); }
        ctx.restore();

        ctx.beginPath();
        ctx.arc(oldX, oldY, oldRadius, 0, Math.PI * 2);
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.stroke();

        ctx.save();
        const startArrowX = 250;
        const endArrowX = 400;
        const arrowY = 200;

        const arrowGradient = ctx.createLinearGradient(startArrowX, arrowY, endArrowX, arrowY);
        arrowGradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
        arrowGradient.addColorStop(0.5, themeColor);
        arrowGradient.addColorStop(1, '#ffffff');
        
        ctx.shadowColor = themeColor;
        ctx.shadowBlur = 20; 
        
        ctx.beginPath();
        ctx.moveTo(startArrowX, arrowY);
        ctx.lineTo(endArrowX, arrowY);
        ctx.lineWidth = 6;
        ctx.strokeStyle = arrowGradient;
        ctx.lineCap = 'round';
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(endArrowX - 25, arrowY - 20);
        ctx.lineTo(endArrowX + 5, arrowY);
        ctx.lineTo(endArrowX - 25, arrowY + 20);
        
        ctx.moveTo(endArrowX - 45, arrowY - 20);
        ctx.lineTo(endArrowX - 15, arrowY);
        ctx.lineTo(endArrowX - 45, arrowY + 20);
        
        ctx.lineWidth = 5;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = themeColor;
        ctx.stroke();
        ctx.restore();

        const newX = 520;
        const newY = 200;
        const newRadius = 100;

        ctx.save();
        ctx.shadowColor = themeColor;
        ctx.shadowBlur = 50; 
        ctx.beginPath();
        ctx.arc(newX, newY, newRadius + 5, 0, Math.PI * 2);
        ctx.fillStyle = themeColor;
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.beginPath();
        ctx.arc(newX, newY, newRadius, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        try {
            const avatarUrl = user.displayAvatarURL({ extension: 'png', size: 256 });
            const avatarImage = await loadImage(avatarUrl);
            ctx.drawImage(avatarImage, newX - newRadius, newY - newRadius, newRadius * 2, newRadius * 2);
        } catch (e) { ctx.fillStyle = '#333'; ctx.fill(); }
        ctx.restore();

        ctx.beginPath();
        ctx.arc(newX, newY, newRadius, 0, Math.PI * 2);
        ctx.lineWidth = 6;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
        ctx.lineWidth = 3;
        ctx.strokeStyle = themeColor;
        ctx.stroke();

    } else {
        const avatarSize = 220;
        const avatarX = width - avatarSize - 50; 
        const avatarY = (height - avatarSize) / 2; 
        textRightLimit = avatarX - 40;

        ctx.save();
        ctx.shadowColor = themeColor;
        ctx.shadowBlur = 60; 
        ctx.beginPath();
        ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, (avatarSize / 2) + 5, 0, Math.PI * 2);
        ctx.fillStyle = themeColor;
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.beginPath();
        ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        try {
            const avatarUrl = user.displayAvatarURL({ extension: 'png', size: 256 });
            const avatarImage = await loadImage(avatarUrl);
            ctx.drawImage(avatarImage, avatarX, avatarY, avatarSize, avatarSize);
        } catch (e) { ctx.fillStyle = '#333'; ctx.fill(); }
        ctx.restore();

        ctx.beginPath();
        ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
        ctx.lineWidth = 6; ctx.strokeStyle = '#ffffff'; ctx.stroke();
    }
    
    ctx.fillStyle = themeColor;
    ctx.font = 'bold 45px "Bein", sans-serif';
    ctx.textAlign = 'right';
    ctx.shadowColor = themeColor;
    ctx.shadowBlur = 20;
    ctx.fillText(mainTitle, textRightLimit, 90);
    ctx.shadowBlur = 0;

    ctx.beginPath();
    const titleWidth = ctx.measureText(mainTitle).width;
    ctx.moveTo(textRightLimit, 110);
    ctx.lineTo(textRightLimit - titleWidth - 50, 110);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 65px "Bein", sans-serif';
    ctx.shadowColor = 'rgba(0,0,0,1)';
    ctx.shadowBlur = 10;
    let dName = user.displayName || user.username;
    if (dName.length > 14) dName = dName.substring(0, 14) + '..';
    ctx.fillText(dName, textRightLimit, 185);
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#e0e0e0';
    ctx.font = 'bold 35px "Bein", sans-serif';
    ctx.fillText(subTitle, textRightLimit, 245);

    ctx.fillStyle = '#aaaaaa';
    ctx.font = '24px "Bein", sans-serif';
    ctx.fillText(description, textRightLimit, 290);

    if (value) {
        ctx.font = 'bold 28px "Bein", sans-serif';
        const valueWidth = ctx.measureText(value).width + 60;
        
        ctx.fillStyle = 'rgba(10, 10, 15, 0.9)';
        ctx.beginPath();
        roundRect(ctx, textRightLimit - valueWidth, 315, valueWidth, 50, 10);
        ctx.fill();
        
        ctx.lineWidth = 2;
        ctx.strokeStyle = themeColor;
        ctx.stroke();

        ctx.fillStyle = themeColor;
        ctx.textAlign = 'center';
        ctx.fillText(value, (textRightLimit - valueWidth) + (valueWidth / 2), 350);
    }

    return await canvas.encode('image/png');
}

module.exports = { generateEpicAnnouncement };
