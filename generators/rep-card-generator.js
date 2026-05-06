const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');

let arabicReshaper;
try { arabicReshaper = require('arabic-reshaper'); } catch (e) {}

function fixAr(text) {
    if (!arabicReshaper || typeof text !== 'string') return text;
    try { return arabicReshaper.reshape(text); } catch (err) { return text; }
}

try { GlobalFonts.registerFromPath(path.join(process.cwd(), 'fonts', 'bein-ar-normal.ttf'), 'Bein'); } catch (e) {}

// 🔥 تم إضافة رتبة SSS هنا 🔥
function getRepRank(points) {
    if (points >= 9999) return { rank: 'SSS', name: '🎇 مغامـر رتبـة SSS', color: '#FFD700', next: 'الحد الأقصى' };
    if (points >= 5000) return { rank: 'SS', name: '👑 مغامـر رتبـة SS', color: '#FF00FF', next: 9999 };
    if (points >= 1000) return { rank: 'S',  name: '💎 مغامـر رتبـة S', color: '#00FFFF', next: 5000 };
    if (points >= 500)  return { rank: 'A',  name: '🥇 مغامـر رتبـة A', color: '#FFD700', next: 1000 };
    if (points >= 250)  return { rank: 'B',  name: '🥈 مغامـر رتبـة B', color: '#C0C0C0', next: 500 };
    if (points >= 100)  return { rank: 'C',  name: '🥉 مغامـر رتبـة C', color: '#CD7F32', next: 250 };
    if (points >= 50)   return { rank: 'D',  name: '⚔️ مغامـر رتبـة D', color: '#2E8B57', next: 100 };
    if (points >= 10)   return { rank: 'E',  name: '🛡️ مغامـر رتبـة E', color: '#8B4513', next: 50 };
    return { rank: 'F', name: '🪵 مغامـر رتبـة F', color: '#A0522D', next: 10 };
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

function drawRoundRect(ctx, x, y, width, height, radius) {
    if (typeof radius === 'undefined') radius = 5;
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

async function generateRepCard(senderAvatar, senderName, receiverAvatar, receiverName, currentPoints, rankData, isRankUp) {
    const width = 1000;
    const height = 450;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.direction = 'rtl';

    ctx.fillStyle = '#08080c';
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    for (let i = 0; i < 150; i++) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        const radius = Math.random() * 60 + 20;
        const sides = Math.floor(Math.random() * 3) + 3;

        const shardGrad = ctx.createRadialGradient(x, y, 0, x, y, radius);
        shardGrad.addColorStop(0, isRankUp ? '#00FF88' : rankData.color); 
        shardGrad.addColorStop(1, 'rgba(0,0,0,0.8)');

        drawRandomPolygon(ctx, x, y, radius, sides);

        ctx.globalAlpha = 0.08; 
        ctx.fillStyle = shardGrad;
        ctx.fill();

        ctx.globalAlpha = 0.2;
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#050505'; 
        ctx.stroke();
    }
    ctx.restore();

    const vignette = ctx.createRadialGradient(width/2, height/2, 100, width/2, height/2, 700);
    vignette.addColorStop(0, 'rgba(0,0,0,0.2)'); 
    vignette.addColorStop(1, 'rgba(0,0,0,0.95)'); 
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);

    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.strokeRect(15, 15, width - 30, height - 30);

    ctx.lineWidth = 1;
    ctx.strokeStyle = isRankUp ? '#00FF88' : rankData.color;
    ctx.strokeRect(25, 25, width - 50, height - 50);

    ctx.fillStyle = isRankUp ? '#00FF88' : '#FFD700';
    ctx.font = 'bold 50px "Bein", sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 20;
    ctx.fillText(fixAr(isRankUp ? "⚜️ ارتـقـاء فـي الـسـمـعـة ⚜️" : "✨ شـهـادة تـزكـيـة ✨"), width / 2, 85);
    ctx.shadowBlur = 0;

    const lineGrad = ctx.createLinearGradient(width / 2 - 300, 0, width / 2 + 300, 0);
    lineGrad.addColorStop(0, 'rgba(0,0,0,0)');
    lineGrad.addColorStop(0.5, isRankUp ? '#00FF88' : rankData.color);
    lineGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = lineGrad;
    ctx.fillRect(width / 2 - 300, 110, 600, 2);

    const drawCirc = async (url, x, y, size, border, glow) => {
        try {
            if (glow) {
                ctx.beginPath();
                ctx.arc(x + size / 2, y + size / 2, size / 1.8, 0, Math.PI * 2);
                ctx.fillStyle = glow;
                ctx.shadowColor = glow;
                ctx.shadowBlur = 25;
                ctx.fill();
                ctx.shadowBlur = 0;
            }

            ctx.save();
            ctx.beginPath();
            ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
            ctx.closePath();
            ctx.clip();
            const img = await loadImage(url);
            ctx.drawImage(img, x, y, size, size);
            ctx.restore();
            
            ctx.strokeStyle = border;
            ctx.lineWidth = size > 100 ? 5 : 3;
            ctx.beginPath();
            ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
            ctx.stroke();
        } catch (e) {}
    };

    await drawCirc(receiverAvatar, width - 260, 140, 180, isRankUp ? '#00FF88' : rankData.color, isRankUp ? '#00FF8844' : `${rankData.color}44`);
    await drawCirc(senderAvatar, 50, 40, 80, 'rgba(255,255,255,0.4)', null);
    
    ctx.fillStyle = '#888888';
    ctx.font = '18px "Bein", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(fixAr("المـزكـي:"), 140, 70);
    
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 22px "Bein", sans-serif';
    let sName = senderName.length > 12 ? senderName.substring(0, 12) + '..' : senderName;
    ctx.fillText(fixAr(sName), 140, 100);

    ctx.textAlign = 'right';
    
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 45px "Bein", sans-serif';
    let dName = receiverName.length > 20 ? receiverName.substring(0, 20) + '..' : receiverName;
    ctx.fillText(fixAr(dName), width - 300, 190);

    ctx.fillStyle = isRankUp ? '#00FF88' : rankData.color;
    ctx.font = 'bold 38px "Bein", sans-serif';
    ctx.fillText(fixAr(rankData.name), width - 300, 255);

    ctx.fillStyle = '#E0E0E0';
    ctx.font = '32px "Bein", sans-serif';
    ctx.fillText(fixAr(`مجموع السمعة: ${currentPoints.toLocaleString()} 🌟`), width - 300, 315);

    const barW = 600;
    const barH = 35; 
    const barX = width - 300 - barW;
    const barY = 360;

    if (rankData.next !== 'الحد الأقصى') {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 2;
        drawRoundRect(ctx, barX, barY, barW, barH, 15);
        ctx.fill();
        ctx.stroke();

        // 🔥 تم تحديث حدود الشريط (Tiers) لتشمل 5000 🔥
        const tiers = [0, 10, 25, 50, 100, 250, 500, 1000, 5000];
        let currentTierMin = 0;
        for (let i = tiers.length - 1; i >= 0; i--) {
            if (currentPoints >= tiers[i]) {
                currentTierMin = tiers[i];
                break;
            }
        }
        
        let progress = (currentPoints - currentTierMin) / (rankData.next - currentTierMin);
        
        if (progress < 0) progress = 0;
        if (progress > 1) progress = 1;
        if (progress < 0.05 && currentPoints > 0) progress = 0.05; 
        
        const barColor = isRankUp ? '#00FF88' : rankData.color;
        const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
        grad.addColorStop(0, barColor);
        grad.addColorStop(1, '#ffffff');
        
        ctx.fillStyle = grad;
        ctx.shadowColor = barColor;
        ctx.shadowBlur = 15;
        drawRoundRect(ctx, barX, barY, barW * progress, barH, 15);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.textAlign = 'center';
        ctx.font = 'bold 20px "Bein", sans-serif';
        
        if (isRankUp) {
            ctx.fillStyle = '#000000'; 
            ctx.fillText(fixAr("🎉 تـم الارتـقـاء للـرتـبـة الجـديـدة! 🎉"), barX + barW / 2, barY + 25);
        } else {
            const progressText = `${currentPoints} / ${rankData.next}`;
            ctx.fillStyle = '#FFFFFF';
            ctx.shadowColor = '#000000';
            ctx.shadowBlur = 5;
            ctx.fillText(progressText, barX + barW / 2, barY + 25);
            ctx.shadowBlur = 0;
        }

    } else {
        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 35px "Bein", sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#FFD700';
        ctx.shadowBlur = 15;
        ctx.fillText(fixAr("⭐ تـربـع عـلى عـرش الأسـاطـيـر ⭐"), barX + barW / 2, barY + 25);
        ctx.shadowBlur = 0;
    }

    return await canvas.encode ? canvas.encode('png') : canvas.toBuffer('image/png');
}

module.exports = { generateRepCard };
