const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
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

function drawStainedGlassBackground(ctx, width, height, primaryColor, secondaryColor) {
    ctx.fillStyle = '#050508';
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    for (let i = 0; i < 500; i++) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        const radius = Math.random() * 100 + 30;
        const sides = Math.floor(Math.random() * 3) + 3;

        const shardGrad = ctx.createRadialGradient(x, y, 0, x, y, radius);
        const isPrimary = Math.random() > 0.4;
        shardGrad.addColorStop(0, isPrimary ? primaryColor : secondaryColor); 
        shardGrad.addColorStop(1, 'rgba(0,0,0,0.9)'); 

        drawRandomPolygon(ctx, x, y, radius, sides);

        ctx.globalAlpha = 0.4; 
        ctx.fillStyle = shardGrad;
        ctx.fill();

        ctx.globalAlpha = 1.0;
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = '#0a0a0a'; 
        ctx.stroke();

        ctx.save();
        ctx.translate(-1, -1);
        ctx.globalAlpha = 0.3;
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.stroke();
        ctx.restore();
    }
    ctx.restore();

    const vignette = ctx.createRadialGradient(width/2, height/2, width/4, width/2, height/2, width/1.1);
    vignette.addColorStop(0, 'rgba(0,0,0,0.2)'); 
    vignette.addColorStop(1, 'rgba(0,0,0,0.95)'); 
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
}

function drawOrnateBorder(ctx, width, height) {
    const borderGradient = ctx.createLinearGradient(0, 0, width, height);
    borderGradient.addColorStop(0, '#bf953f');   
    borderGradient.addColorStop(0.25, '#fcf6ba'); 
    borderGradient.addColorStop(0.5, '#b38728');  
    borderGradient.addColorStop(0.75, '#fcf6ba'); 
    borderGradient.addColorStop(1, '#bf953f');    

    ctx.lineWidth = 12;
    ctx.strokeStyle = borderGradient;
    ctx.strokeRect(6, 6, width - 12, height - 12);

    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.5)';
    ctx.strokeRect(18, 18, width - 36, height - 36);
    
    ctx.fillStyle = borderGradient;
    const cornerSize = 15;
    ctx.beginPath(); ctx.arc(12, 12, cornerSize, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(width-12, 12, cornerSize, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(12, height-12, cornerSize, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(width-12, height-12, cornerSize, 0, Math.PI*2); ctx.fill();
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';
    let lineArray = [];
    for(let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        if (ctx.measureText(fixAr(testLine)).width > maxWidth && n > 0) {
            lineArray.push(line);
            line = words[n] + ' ';
        } else {
            line = testLine;
        }
    }
    lineArray.push(line);
    for(let k = 0; k < lineArray.length; k++) {
        ctx.fillText(fixAr(lineArray[k]), x, y + (k * lineHeight));
    }
}

async function generateMainQuestBoardImage() {
    const width = 1200; 
    const height = 850; 
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    ctx.direction = 'rtl';

    drawStainedGlassBackground(ctx, width, height, '#0047AB', '#8A2BE2'); 
    drawOrnateBorder(ctx, width, height);

    ctx.textAlign = 'center';
    
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 75px "Bein", sans-serif';
    ctx.shadowColor = '#00BFFF'; 
    ctx.shadowBlur = 35;
    ctx.fillText(fixAr("✥ نقابة المغامرين ✥"), width / 2, 120);
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#cccccc';
    ctx.font = '32px "Bein", sans-serif';
    ctx.fillText(fixAr("حيث تكتب الأساطير وتصنع الأمجاد"), width / 2, 180);

    function drawInnerPanel(x, y, w, h, title, text) {
        ctx.fillStyle = 'rgba(5, 5, 10, 0.7)';
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, 15);
        ctx.fill();
        
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(0, 191, 255, 0.4)';
        ctx.stroke();

        ctx.fillStyle = '#00BFFF';
        ctx.font = 'bold 42px "Bein", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(fixAr(title), x + w / 2, y + 65);

        ctx.beginPath();
        ctx.moveTo(x + 40, y + 95);
        ctx.lineTo(x + w - 40, y + 95);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.stroke();

        ctx.fillStyle = '#e0e0e0';
        ctx.font = '32px "Bein", sans-serif';
        wrapText(ctx, text, x + w / 2, y + 160, w - 60, 48);
    }

    const rightText = "لا مجد بلا تضحية اقبل المهام الصعبة اجمع ثروتك من المورا وارفع رتبتك هنا تقاس قيمتك بأفعالك لا بأقوالك اصنع اسما يهابه الجميع في الامبراطورية";
    drawInnerPanel(620, 220, 540, 380, "📜 ميثاق الشرف", rightText);

    const leftText = "اللفيفة السفلية هي مفتاحك استخدم القائمة لاستلام مهامك اليومية تتبع أوسمتك وإنجازاتك واستعراض بطاقتك الشخصية لا تنس تفقد ترتيبك بين الأساطير";
    drawInnerPanel(40, 220, 540, 380, "🧭 دليل المغامر", leftText);

    const barY = 630;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.beginPath();
    ctx.roundRect(40, barY, 1120, 180, 20);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.5)';
    ctx.stroke();

    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 42px "Bein", sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#FFD700';
    ctx.shadowBlur = 15;
    ctx.fillText(fixAr("✨ سجلات وأقسام النقابة ✨"), width / 2, barY + 65);
    ctx.shadowBlur = 0;

    ctx.font = 'bold 30px "Bein", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    
    const sectionW = 1120 / 4; 
    ctx.fillText(fixAr("⚔️ لوحة المهام"), 40 + sectionW * 3.5, barY + 130);
    ctx.fillText(fixAr("🏅 الأوسمة"), 40 + sectionW * 2.5, barY + 130);
    ctx.fillText(fixAr("🪪 الهوية والرتبة"), 40 + sectionW * 1.5, barY + 130);
    ctx.fillText(fixAr("📜 أدلة السمعة"), 40 + sectionW * 0.5, barY + 130);

    return await canvas.encode ? canvas.encode('png') : canvas.toBuffer('image/png');
}

async function generateKingsBoardImage(kingsArray) {
    const width = 1200; 
    const height = 850; 
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    ctx.direction = 'rtl';

    drawStainedGlassBackground(ctx, width, height, '#FFD700', '#DC143C');
    drawOrnateBorder(ctx, width, height);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 65px "Bein", sans-serif';
    ctx.shadowColor = '#FFD700';
    ctx.shadowBlur = 30;
    ctx.fillText(fixAr("✥ لوحة الملوك والصدارة ✥"), width / 2, 90);
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#ffd700';
    ctx.font = '28px "Bein", sans-serif';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 10;
    ctx.fillText(fixAr("أصحاب الألقاب التنافسية لليوم"), width / 2, 145);
    ctx.shadowBlur = 0;

    const startY = 190;
    const boxW = 540;
    const boxH = 130;
    const gapY = 145;

    const colRightX = 620;
    const colLeftX = 40;

    for (let i = 0; i < kingsArray.length; i++) {
        const king = kingsArray[i];
        
        const isRightCol = i % 2 === 0; 
        const rowIdx = Math.floor(i / 2); 
        
        const x = isRightCol ? colRightX : colLeftX;
        const y = startY + (rowIdx * gapY);

        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.beginPath();
        ctx.roundRect(x, y, boxW, boxH, 15);
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(255, 215, 0, 0.5)'; 
        ctx.stroke();

        const avatarX = x + boxW - 70;
        const avatarY = y + boxH / 2;
        const avatarRadius = 45;
        
        ctx.save();
        ctx.beginPath();
        ctx.arc(avatarX, avatarY, avatarRadius, 0, Math.PI * 2);
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#FFD700';
        ctx.stroke();
        ctx.clip();
        if (king.avatarUrl) {
            try {
                const img = await loadImage(king.avatarUrl);
                ctx.drawImage(img, avatarX - avatarRadius, avatarY - avatarRadius, avatarRadius*2, avatarRadius*2);
            } catch(e) {
                ctx.fillStyle = '#333'; ctx.fill();
            }
        } else {
            ctx.fillStyle = '#333'; ctx.fill();
        }
        ctx.restore();

        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 30px "Bein", sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(fixAr(`${king.emoji} ${king.title}`), avatarX - 70, y + 55);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 26px "Bein", sans-serif';
        ctx.textAlign = 'right';
        let dName = king.displayName;
        if (dName.length > 18) dName = dName.substring(0, 18) + '..';
        ctx.fillText(fixAr(dName), avatarX - 70, y + 100);

        ctx.fillStyle = '#00FF88'; 
        ctx.textAlign = 'left';
        ctx.font = 'bold 30px "Bein", sans-serif';
        ctx.fillText(fixAr(king.valueText), x + 30, y + 75);
    }

    return await canvas.encode ? canvas.encode('png') : canvas.toBuffer('image/png');
}

module.exports = { generateMainQuestBoardImage, generateKingsBoardImage };
