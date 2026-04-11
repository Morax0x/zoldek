const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');

let arabicReshaper;
try {
    arabicReshaper = require('arabic-reshaper');
} catch (e) {}

function fixAr(text) {
    if (!arabicReshaper || typeof text !== 'string') return text;
    try {
        if (typeof arabicReshaper.reshape === 'function') return arabicReshaper.reshape(text);
        if (typeof arabicReshaper.convertArabic === 'function') return arabicReshaper.convertArabic(text);
        if (typeof arabicReshaper === 'function') return arabicReshaper(text);
        return text;
    } catch (err) {
        return text;
    }
}

try {
    GlobalFonts.registerFromPath(path.join(__dirname, '../fonts/bein-ar-normal.ttf'), 'Bein');
} catch (e) {}

async function generateKingsAnnouncementImage(kingsData, dateStr) {
    const width = 1000;
    const padding = 40;
    const boxHeight = 90;
    const spacing = 20;
    
    const totalHeight = 250 + (kingsData.length * (boxHeight + spacing)) + 50;

    const canvas = createCanvas(width, totalHeight);
    const ctx = canvas.getContext('2d');
    ctx.direction = 'rtl';

    const bgGrad = ctx.createLinearGradient(0, 0, 0, totalHeight);
    bgGrad.addColorStop(0, '#0a0a0f');
    bgGrad.addColorStop(1, '#1a1a24');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, totalHeight);

    ctx.lineWidth = 6;
    ctx.strokeStyle = '#D4AF37';
    ctx.strokeRect(15, 15, width - 30, totalHeight - 30);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 55px "Bein", sans-serif';
    ctx.shadowColor = '#FFD700';
    ctx.shadowBlur = 15;
    ctx.fillText(fixAr('👑 مـلـوك الإمـبـراطـوريـة 👑'), width / 2, 90);
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#CCCCCC';
    ctx.font = '30px "Bein", sans-serif';
    ctx.fillText(dateStr, width / 2, 140);

    const gradLine = ctx.createLinearGradient(width / 2 - 300, 0, width / 2 + 300, 0);
    gradLine.addColorStop(0, 'rgba(0,0,0,0)');
    gradLine.addColorStop(0.5, '#D4AF37');
    gradLine.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradLine;
    ctx.fillRect(width / 2 - 300, 170, 600, 3);

    let startY = 210;

    for (const king of kingsData) {
        ctx.fillStyle = 'rgba(255, 215, 0, 0.05)';
        ctx.beginPath();
        ctx.roundRect(padding, startY, width - (padding * 2), boxHeight, 15);
        ctx.fill();
        
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(212, 175, 55, 0.3)';
        ctx.stroke();

        ctx.textAlign = 'right';
        ctx.fillStyle = '#FFD700'; 
        ctx.font = 'bold 35px "Bein", sans-serif';
        ctx.fillText(fixAr(king.title), width - padding - 20, startY + 55);

        ctx.textAlign = 'center';
        ctx.fillStyle = '#FFFFFF'; 
        ctx.font = 'bold 35px "Bein", sans-serif';
        let displayName = king.name;
        if (displayName.length > 15) displayName = displayName.substring(0, 15) + '...';
        ctx.fillText(fixAr(displayName), width / 2, startY + 55);

        ctx.textAlign = 'left';
        ctx.fillStyle = '#00BFFF'; 
        ctx.font = 'bold 30px "Bein", sans-serif';
        ctx.fillText(fixAr(`🌟 +${king.rep} سمعة`), padding + 20, startY + 55);

        startY += boxHeight + spacing;
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = '#888888';
    ctx.font = '25px "Bein", sans-serif';
    ctx.fillText(fixAr('تم توزيع الجوائز والرتب على الملوك تلقائياً'), width / 2, totalHeight - 40);

    return await canvas.encode('image/png');
}

module.exports = { generateKingsAnnouncementImage };
