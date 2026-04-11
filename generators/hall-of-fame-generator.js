const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');

try {
    GlobalFonts.registerFromPath(path.join(__dirname, '../fonts/bein-ar-normal.ttf'), 'Bein');
} catch (e) {
    console.log("⚠️ لم يتم العثور على خط Bein، سيتم استخدام الخط الافتراضي.");
}

function getRankColor(points) {
    if (points >= 1000) return '#FF0055'; 
    if (points >= 500)  return '#9D00FF'; 
    if (points >= 250)  return '#FFD700'; 
    if (points >= 100)  return '#00FF88'; 
    if (points >= 50)   return '#00BFFF'; 
    if (points >= 25)   return '#A9A9A9'; 
    if (points >= 10)   return '#B87333'; 
    return '#654321'; 
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

async function generateHallOfFame(topUsersData) {
    const canvasWidth = 900;
    const canvasHeight = 1000;
    const canvas = createCanvas(canvasWidth, canvasHeight);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#0a0a10';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    ctx.save();
    for (let i = 0; i < 300; i++) {
        const x = Math.random() * canvasWidth;
        const y = Math.random() * canvasHeight;
        const radius = Math.random() * 90 + 30;
        const sides = Math.floor(Math.random() * 3) + 3;

        const shardGrad = ctx.createRadialGradient(x, y, 0, x, y, radius);
        const isGold = Math.random() > 0.5;
        shardGrad.addColorStop(0, isGold ? '#FFD700' : '#9D00FF'); 
        shardGrad.addColorStop(1, 'rgba(0,0,0,0.8)');

        drawRandomPolygon(ctx, x, y, radius, sides);

        ctx.globalAlpha = 0.2; 
        ctx.fillStyle = shardGrad;
        ctx.fill();

        ctx.globalAlpha = 0.8;
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#050505'; 
        ctx.stroke();

        ctx.save();
        ctx.translate(-1, -1);
        ctx.globalAlpha = 0.3;
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.stroke();
        ctx.restore();
    }
    ctx.restore();

    const vignette = ctx.createRadialGradient(canvasWidth/2, canvasHeight/2, 200, canvasWidth/2, canvasHeight/2, 800);
    vignette.addColorStop(0, 'rgba(0,0,0,0.3)'); 
    vignette.addColorStop(1, 'rgba(0,0,0,0.95)'); 
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    const borderGradient = ctx.createLinearGradient(0, 0, canvasWidth, canvasHeight);
    borderGradient.addColorStop(0, '#bf953f');
    borderGradient.addColorStop(0.5, '#fcf6ba');
    borderGradient.addColorStop(1, '#b38728');

    ctx.lineWidth = 10;
    ctx.strokeStyle = borderGradient;
    ctx.strokeRect(5, 5, canvasWidth - 10, canvasHeight - 10);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,215,0,0.5)';
    ctx.strokeRect(20, 20, canvasWidth - 40, canvasHeight - 40);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 55px "Bein", sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#FFD700';
    ctx.shadowBlur = 20;
    ctx.fillText('🏰 قـاعـة الـمـغـامـريـن 🏰', canvasWidth / 2, 80); 
    
    ctx.font = '25px "Bein", sans-serif';
    ctx.fillStyle = '#cccccc';
    ctx.shadowBlur = 5;
    ctx.fillText('أعظم 10 مغامرين في تاريخ النقابة', canvasWidth / 2, 130);
    ctx.shadowBlur = 0; 

    ctx.beginPath();
    ctx.moveTo(150, 150);
    ctx.lineTo(canvasWidth - 150, 150);
    ctx.strokeStyle = borderGradient;
    ctx.lineWidth = 3;
    ctx.stroke();

    if (topUsersData.length === 0) {
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 35px "Bein", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('العرش بانتظارك... لم يصل أحد للنخبة بعد!', canvasWidth / 2, canvasHeight / 2);
        return await canvas.encode ? canvas.encode('image/png') : Promise.resolve(canvas.toBuffer('image/png'));
    }

    let startY = 190;
    const rowHeight = 75;

    for (let i = 0; i < topUsersData.length; i++) {
        const user = topUsersData[i];
        const isTop3 = i < 3;
        const y = startY + (i * rowHeight);

        ctx.fillStyle = isTop3 ? 'rgba(255, 215, 0, 0.15)' : 'rgba(0, 0, 0, 0.6)';
        ctx.beginPath();
        ctx.roundRect(40, y, canvasWidth - 80, 65, 10);
        ctx.fill();

        if (isTop3) {
            ctx.lineWidth = 2;
            const colors = ['#FFD700', '#C0C0C0', '#CD7F32']; 
            ctx.strokeStyle = colors[i];
            ctx.stroke();
        }

        ctx.fillStyle = isTop3 ? '#ffffff' : '#aaaaaa';
        ctx.font = 'bold 35px "Arial", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`#${i + 1}`, 80, y + 45);

        if (user.avatarUrl) {
            try {
                ctx.save();
                ctx.beginPath();
                ctx.arc(160, y + 32.5, 25, 0, Math.PI * 2, true);
                ctx.closePath();
                ctx.clip();
                const avatarImg = await loadImage(user.avatarUrl);
                ctx.drawImage(avatarImg, 135, y + 7.5, 50, 50);
                ctx.restore();
                
                ctx.beginPath();
                ctx.arc(160, y + 32.5, 25, 0, Math.PI * 2, true);
                ctx.lineWidth = 2;
                ctx.strokeStyle = getRankColor(user.repPoints);
                ctx.stroke();
            } catch (e) { }
        }

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 30px "Bein", sans-serif';
        ctx.textAlign = 'left';
        let displayName = user.displayName;
        if (ctx.measureText(displayName).width > 350) {
            displayName = displayName.substring(0, 15) + '...';
        }
        ctx.fillText(displayName, 205, y + 43);

        ctx.fillStyle = '#FFD700'; 
        ctx.font = 'bold 28px "Bein", sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`🌟 ${user.repPoints.toLocaleString()}`, canvasWidth - 160, y + 43);

        const rankColor = getRankColor(user.repPoints);
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.beginPath();
        ctx.roundRect(canvasWidth - 120, y + 10, 50, 45, 8);
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = rankColor;
        ctx.stroke();

        ctx.fillStyle = rankColor;
        ctx.textAlign = 'center';
        ctx.font = 'bold 30px "Arial", sans-serif';
        ctx.shadowColor = rankColor;
        ctx.shadowBlur = 10;
        ctx.fillText(user.rankLetter, canvasWidth - 95, y + 42);
        ctx.shadowBlur = 0;
    }

    return await canvas.encode ? canvas.encode('image/png') : Promise.resolve(canvas.toBuffer('image/png'));
}

module.exports = { generateHallOfFame };
