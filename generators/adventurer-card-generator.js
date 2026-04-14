const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas'); 
const path = require('path');

try {
    GlobalFonts.registerFromPath(path.join(__dirname, '../fonts/bein-ar-normal.ttf'), 'Bein');
} catch (e) {
    console.log("⚠️ لم يتم العثور على خط Bein، سيتم استخدام الخط الافتراضي.");
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

function drawShield(ctx, x, y, width, height) {
    ctx.beginPath();
    ctx.moveTo(x, y - height/2); 
    ctx.lineTo(x + width/2, y - height/3.5); 
    ctx.lineTo(x + width/2, y + height/8); 
    ctx.quadraticCurveTo(x + width/2, y + height/2.2, x, y + height/2); 
    ctx.quadraticCurveTo(x - width/2, y + height/2.2, x - width/2, y + height/8); 
    ctx.lineTo(x - width/2, y - height/3.5); 
    ctx.closePath();
}

async function generateAdventurerCard(data) {
    const width = 1100;
    const height = 650;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const primaryColor = data.rankInfo.color || '#555555';

    const bgBase = ctx.createLinearGradient(0, 0, width, height);
    bgBase.addColorStop(0, '#050508'); 
    bgBase.addColorStop(1, '#11111a');
    ctx.fillStyle = bgBase;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    for (let i = 0; i < 200; i++) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        const radius = Math.random() * 80 + 30;
        const sides = Math.floor(Math.random() * 3) + 3;

        const shardGrad = ctx.createRadialGradient(x, y, 0, x, y, radius);
        shardGrad.addColorStop(0, primaryColor); 
        shardGrad.addColorStop(1, 'rgba(0,0,0,0.9)'); 

        drawRandomPolygon(ctx, x, y, radius, sides);
        ctx.globalAlpha = 0.35; 
        ctx.fillStyle = shardGrad;
        ctx.fill();
        ctx.globalAlpha = 0.6;
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#000000'; 
        ctx.stroke();
    }
    ctx.restore();

    const vignette = ctx.createRadialGradient(width/2, height/2, 200, width/2, height/2, 750);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.95)'); 
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);

    const borderGradient = ctx.createLinearGradient(0, 0, width, height);
    borderGradient.addColorStop(0, primaryColor);
    borderGradient.addColorStop(0.5, '#ffffff');
    borderGradient.addColorStop(1, primaryColor);

    ctx.lineWidth = 8;
    ctx.strokeStyle = borderGradient;
    ctx.strokeRect(4, 4, width - 8, height - 8);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.strokeRect(12, 12, width - 24, height - 24);

    const avatarSize = 180;
    const avatarX = 160; 
    const avatarY = 130; 
    
    ctx.save();
    ctx.shadowColor = primaryColor;
    ctx.shadowBlur = 40; 
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, (avatarSize / 2) + 6, 0, Math.PI * 2);
    ctx.fillStyle = primaryColor;
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    try {
        const avatarUrl = data.user.displayAvatarURL({ extension: 'png', size: 256 });
        const avatarImage = await loadImage(avatarUrl);
        ctx.drawImage(avatarImage, avatarX - avatarSize/2, avatarY - avatarSize/2, avatarSize, avatarSize);
    } catch (e) {
        ctx.fillStyle = '#333'; ctx.fill();
    }
    ctx.restore();

    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarSize / 2, 0, Math.PI * 2);
    ctx.lineWidth = 5;
    ctx.strokeStyle = borderGradient;
    ctx.stroke();

    const rankMatch = data.rankInfo.name.match(/[A-Z]+/);
    const rankLetter = rankMatch ? rankMatch[0] : 'F'; 
    const badgeX = 940;
    const badgeY = 110;
    const badgeW = 120;
    const badgeH = 140;

    ctx.save();
    drawShield(ctx, badgeX, badgeY, badgeW, badgeH);
    ctx.fillStyle = 'rgba(10, 10, 15, 0.9)';
    ctx.shadowColor = primaryColor;
    ctx.shadowBlur = 25;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = primaryColor;
    ctx.stroke();

    drawShield(ctx, badgeX, badgeY + 5, badgeW - 20, badgeH - 25);
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.restore();

    // 🔥 التصحيح الذكي لحجم الرتبة SSS داخل الدرع 🔥
    ctx.fillStyle = primaryColor;
    ctx.textAlign = 'center';
    ctx.shadowColor = primaryColor;
    ctx.shadowBlur = 15;
    
    if (rankLetter === 'SSS') {
        ctx.font = 'bold 36px "Arial", sans-serif';
        ctx.fillText(rankLetter, badgeX, badgeY + 14);
    } else if (rankLetter === 'SS') {
        ctx.font = 'bold 45px "Arial", sans-serif';
        ctx.fillText(rankLetter, badgeX, badgeY + 18);
    } else {
        ctx.font = 'bold 55px "Arial", sans-serif';
        ctx.fillText(rankLetter, badgeX, badgeY + 20);
    }
    
    ctx.shadowBlur = 0;

    const textRightX = 850; 
    
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'right';
    ctx.font = 'bold 50px "Bein", sans-serif';
    ctx.shadowColor = 'rgba(0,0,0,1)';
    ctx.shadowBlur = 10;
    let dName = data.displayName;
    if (dName.length > 15) dName = dName.substring(0, 15) + '..';
    ctx.fillText(dName, textRightX, 85);
    ctx.shadowBlur = 0;

    const drawTag = (text, y) => {
        ctx.font = 'bold 24px "Bein", sans-serif'; 
        const tagW = ctx.measureText(text).width + 60; 
        ctx.fillStyle = 'rgba(20, 20, 25, 0.85)';
        ctx.beginPath(); 
        roundRect(ctx, textRightX - tagW, y, tagW, 45, 10); 
        ctx.fill();
        ctx.lineWidth = 2; 
        ctx.strokeStyle = primaryColor; 
        ctx.stroke();
        ctx.fillStyle = '#e0e0e0';
        ctx.textAlign = 'center';
        ctx.fillText(text, textRightX - (tagW / 2), y + 31); 
    };

    drawTag(`🩸 ${data.raceName}   |   ⚔️ ${data.weaponName}`, 115); 

    const col4X = 830;
    const col3X = 590;
    const col2X = 350;
    const col1X = 50; 
    const boxW = 220;
    const boxH = 95;
    const row1Y = 240;
    const row2Y = 355;
    const row3Y = 470;

    const drawStatBox = (title, value, x, y, isHighlight = false) => {
        ctx.fillStyle = 'rgba(15, 15, 20, 0.8)';
        ctx.beginPath(); roundRect(ctx, x, y, boxW, boxH, 12); ctx.fill();
        ctx.lineWidth = isHighlight ? 3 : 1.5; 
        ctx.strokeStyle = primaryColor; 
        ctx.stroke();

        if (isHighlight) {
            const grad = ctx.createLinearGradient(x, y, x, y+boxH);
            grad.addColorStop(0, 'rgba(255,255,255,0.1)');
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grad;
            ctx.fill();
        }

        ctx.fillStyle = '#cccccc';
        ctx.font = '20px "Bein", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(title, x + (boxW / 2), y + 35);

        ctx.fillStyle = '#ffffff';
        let fontSize = 32;
        ctx.font = `bold ${fontSize}px "Bein", sans-serif`;
        while (ctx.measureText(value).width > boxW - 20 && fontSize > 15) {
            fontSize--;
            ctx.font = `bold ${fontSize}px "Bein", sans-serif`;
        }
        ctx.shadowColor = isHighlight ? primaryColor : 'transparent';
        ctx.shadowBlur = isHighlight ? 10 : 0;
        ctx.fillText(value, x + (boxW / 2), y + 75);
        ctx.shadowBlur = 0;
    };

    drawStatBox('💰 الثروة', data.mora, col4X, row1Y, true);
    drawStatBox('🌟 السمعة', data.repPoints.toString(), col3X, row1Y, true);
    drawStatBox('📈 المستوى', data.level.toString(), col2X, row1Y, true);

    drawStatBox('❤️ الصحة', data.maxHp.toString(), col4X, row2Y);
    drawStatBox('⚔️ الدمج', data.weaponDmg.toString(), col3X, row2Y);
    drawStatBox('🔥 الستريك', data.streakCount.toString(), col2X, row2Y);

    drawStatBox('🛡️ الدروع', data.shields.toString(), col4X, row3Y);
    drawStatBox('✨ تعزيز خبرة', `+${data.xpBuff}%`, col3X, row3Y);
    drawStatBox('🪙 تعزيز المورا', `+${data.moraBuff}%`, col2X, row3Y);

    ctx.fillStyle = 'rgba(15, 15, 20, 0.8)';
    ctx.beginPath(); roundRect(ctx, col1X, row1Y, boxW, 325, 15); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = primaryColor; ctx.stroke();

    ctx.fillStyle = primaryColor;
    ctx.font = 'bold 24px "Bein", sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = primaryColor;
    ctx.shadowBlur = 10;
    ctx.fillText('🏆 التصنيف', col1X + (boxW / 2), row1Y + 45);
    ctx.shadowBlur = 0;

    ctx.beginPath();
    ctx.moveTo(col1X + 30, row1Y + 65);
    ctx.lineTo(col1X + boxW - 30, row1Y + 65);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.stroke();

    const drawRankRow = (label, value, yOffset) => {
        ctx.fillStyle = '#ffffff';
        ctx.font = '20px "Bein", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(label, col1X + 20, row1Y + yOffset);
        
        ctx.fillStyle = '#FFAA40';
        ctx.textAlign = 'right';
        ctx.font = 'bold 22px "Bein", sans-serif';
        // 🔥 إخفاء الإمبراطور من التصنيف وعرض ??? 🔥
        const displayValue = (value === "0" || value === 0) ? "???" : `#${value}`;
        ctx.fillText(displayValue, col1X + boxW - 20, row1Y + yOffset + 2);
    };

    drawRankRow('المستوى:', data.ranks.level, 115);
    drawRankRow('الثروة:', data.ranks.mora, 175);
    drawRankRow('القوة:', data.ranks.power, 235);
    drawRankRow('الستريك:', data.ranks.streak, 295);

    const barW = 1000;
    const barH = 30;
    const barX = 50;
    const barY = 585;
    const barRadius = 15;

    let percentage = data.requiredXP > 0 ? Math.max(0, Math.min(1, data.currentXP / data.requiredXP)) : 0;

    ctx.save();
    ctx.fillStyle = 'rgba(20, 20, 25, 0.9)';
    ctx.beginPath(); roundRect(ctx, barX, barY, barW, barH, barRadius); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'; ctx.stroke();
    ctx.restore();

    if (percentage > 0) {
        ctx.save();
        ctx.beginPath(); roundRect(ctx, barX, barY, barW, barH, barRadius); ctx.clip();
        
        const xpGrad = ctx.createLinearGradient(barX, barY, barX + barW * percentage, barY);
        xpGrad.addColorStop(0, primaryColor); 
        xpGrad.addColorStop(1, '#ffffff'); 
        
        ctx.fillStyle = xpGrad;
        ctx.fillRect(barX, barY, barW * percentage, barH);
        
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.fillRect(barX, barY, barW * percentage, barH / 2.5);
        ctx.restore();
    }

    ctx.shadowColor = '#000000';
    ctx.shadowBlur = 5;
    const xpText = `الخبرة: ${data.currentXP.toLocaleString()} / ${data.requiredXP.toLocaleString()}`;
    ctx.font = 'bold 18px "Bein", sans-serif'; 
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(xpText, barX + (barW / 2), barY + 21);
    ctx.shadowBlur = 0;

    return await canvas.encode ? canvas.encode('png') : canvas.toBuffer('image/png');
}

module.exports = { generateAdventurerCard };
