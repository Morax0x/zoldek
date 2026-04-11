const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');

try { GlobalFonts.registerFromPath(path.join(__dirname, '../fonts/bein-ar-normal.ttf'), 'Bein'); } catch (e) {}

async function generateNotificationControlPanel(member) {
    const width = 800;
    const height = 300;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, '#0a0a14');
    grad.addColorStop(1, '#1c1c36');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = '#5c5cff';
    ctx.lineWidth = 4;
    ctx.strokeRect(10, 10, width - 20, height - 20);

    ctx.fillStyle = 'rgba(92, 92, 255, 0.1)';
    ctx.fillRect(15, 15, width - 30, height - 30);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 45px "Bein", sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#5c5cff';
    ctx.shadowBlur = 15;
    ctx.fillText('🔔 مـركـز تـحـكـم الإشـعـارات 🔔', width / 2, 70);
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#cccccc';
    ctx.font = '22px "Bein", sans-serif';
    ctx.fillText('قـم بـتـفـعـيـل أو تـعـطـيـل الإشـعـارات الـتـي تـرغـب بـهـا مـن الأزرار أسـفـلـه', width / 2, 130);

    const avatarSize = 100;
    const avatarX = width / 2;
    const avatarY = 210;
    
    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    try {
        const img = await loadImage(member.user.displayAvatarURL({ extension: 'png', size: 128 }));
        ctx.drawImage(img, avatarX - avatarSize / 2, avatarY - avatarSize / 2, avatarSize, avatarSize);
    } catch(e) {}
    ctx.restore();
    
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarSize / 2, 0, Math.PI * 2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    return await canvas.encode('image/png');
}

module.exports = { generateNotificationControlPanel };
