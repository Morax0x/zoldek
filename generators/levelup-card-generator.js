const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');

try {
    GlobalFonts.registerFromPath(path.join(__dirname, '../fonts/bein-ar-normal.ttf'), 'Bein');
} catch (e) {
    console.log("❌ لم يتم العثور على الخط bein-ar-normal.ttf، سيتم استخدام الخط الافتراضي.");
}

const FONT_MAIN = '"Bein", "Arial", sans-serif';

function drawRoundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

function getHarmoniousGradient() {
    const gradients = [
        ['#0f0c29', '#302b63', '#24243e'],
        ['#141E30', '#243B55'],
        ['#232526', '#414345'],
        ['#200122', '#6f0000'],
        ['#000428', '#004e92'],
        ['#16222A', '#3A6073'],
        ['#191654', '#43C6AC'],
        ['#000000', '#434343'],
        ['#1A2980', '#26D0CE'],
        ['#4B1248', '#F0C27B'],
        ['#8E0E00', '#1F1C18'],
        ['#3a1c71', '#d76d77', '#ffaf7b']
    ];
    return gradients[Math.floor(Math.random() * gradients.length)];
}

async function generateLevelUpCard(member, oldLevel, newLevel) {
    const canvas = createCanvas(900, 280);
    const ctx = canvas.getContext('2d');

    const colors = getHarmoniousGradient();
    
    const grd = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    if (colors.length === 2) {
        grd.addColorStop(0, colors[0]);
        grd.addColorStop(1, colors[1]);
    } else if (colors.length === 3) {
        grd.addColorStop(0, colors[0]);
        grd.addColorStop(0.5, colors[1]);
        grd.addColorStop(1, colors[2]);
    } else {
        colors.forEach((color, index) => {
            grd.addColorStop(index / (colors.length - 1), color);
        });
    }
    
    ctx.fillStyle = grd;
    drawRoundedRect(ctx, 0, 0, canvas.width, canvas.height, 20);
    ctx.fill();

    ctx.save();
    drawRoundedRect(ctx, 0, 0, canvas.width, canvas.height, 20);
    ctx.clip();

    for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(0, Math.random() * canvas.height);
        
        ctx.bezierCurveTo(
            canvas.width / 3, Math.random() * canvas.height,
            (canvas.width / 3) * 2, Math.random() * canvas.height,
            canvas.width, Math.random() * canvas.height
        );
        
        ctx.lineTo(canvas.width, canvas.height);
        ctx.lineTo(0, canvas.height);
        ctx.closePath();

        ctx.fillStyle = `rgba(255, 255, 255, ${0.03 + (i * 0.02)})`;
        ctx.fill();
    }
    ctx.restore();

    const glowColor = colors[1] || '#00d2ff';
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 20;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 3;
    drawRoundedRect(ctx, 10, 10, canvas.width - 20, canvas.height - 20, 15);
    ctx.stroke();
    ctx.shadowBlur = 0;

    const avatarX = 50;
    const avatarY = 40;
    const avatarSize = 200;

    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    
    try {
        const avatarURL = member.user.displayAvatarURL({ extension: 'png', size: 256 });
        const avatar = await loadImage(avatarURL);
        ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
    } catch (e) {
        ctx.fillStyle = '#ccc';
        ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
    }
    ctx.restore();

    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.stroke();

    const textX = 280;
    
    ctx.fillStyle = '#ffffff'; 
    ctx.shadowColor = '#000000';
    ctx.shadowBlur = 5;
    ctx.font = `bold 30px ${FONT_MAIN}`;
    ctx.fillText('LEVEL UP!', textX, 70);
    ctx.shadowBlur = 0;

    let displayName = member.user.username;
    if (ctx.measureText(displayName).width > 550) {
        displayName = displayName.substring(0, 15) + '...';
    }
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 50px ${FONT_MAIN}`;
    ctx.fillText(displayName, textX, 130);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = `bold 40px ${FONT_MAIN}`;
    ctx.fillText(`Lvl ${oldLevel}`, textX, 200);

    const oldLevelWidth = ctx.measureText(`Lvl ${oldLevel}`).width;
    const arrowX = textX + oldLevelWidth + 20;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.font = `bold 40px ${FONT_MAIN}`; 
    ctx.fillText('»', arrowX, 200);

    ctx.save();
    ctx.fillStyle = '#FFD700'; 
    ctx.shadowColor = '#FFD700'; 
    ctx.shadowBlur = 25; 
    ctx.font = `bold 65px ${FONT_MAIN}`; 
    ctx.fillText(`${newLevel}`, arrowX + 50, 205);
    ctx.restore();

    // 🔥 الإرجاع كـ Buffer ليتوافق مع حماية التلفيل (AttachmentBuilder سيتم استدعاؤه هناك) 🔥
    return await canvas.encode ? await canvas.encode('png') : await canvas.toBuffer('image/png');
}

module.exports = { generateLevelUpCard };
