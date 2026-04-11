const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');

const ROWS_PER_PAGE = 10; 

let arabicReshaper;
try { arabicReshaper = require('arabic-reshaper'); } catch (e) {}

function fixAr(text) {
    if (!arabicReshaper || typeof text !== 'string') return text;
    try {
        if (typeof arabicReshaper.reshape === 'function') return arabicReshaper.reshape(text);
        return text;
    } catch (err) { return text; }
}

try { 
    GlobalFonts.registerFromPath(path.join(process.cwd(), 'fonts', 'bein-ar-normal.ttf'), 'Bein'); 
} catch (e) { console.error("Canvas Font Error:", e); }

function getRankInfo(points) {
    if (points >= 1000) return { letter: 'SS', color: '#FF0055' };
    if (points >= 500)  return { letter: 'S',  color: '#00FFFF' };
    if (points >= 250)  return { letter: 'A',  color: '#FFD700' };
    if (points >= 100)  return { letter: 'B',  color: '#C0C0C0' };
    if (points >= 50)   return { letter: 'C',  color: '#CD7F32' };
    if (points >= 25)   return { letter: 'D',  color: '#2E8B57' };
    if (points >= 10)   return { letter: 'E',  color: '#8B4513' };
    return { letter: 'F', color: '#A0522D' };
}

const THEMES = {
    rep: { title: "قـاعـة الـمـغـامـريـن", color: "#FFD700", icon: "🌟", unit: "رتبة" }, 
    mora: { title: "أثـريـاء الإمـبـراطـوريـة", color: "#F1C40F", icon: "💰", unit: "مورا" },
    level: { title: "أعـلـى الـمـسـتـويـات", color: "#C266FF", icon: "🏆", unit: "Lv." },
    strongest: { title: "الأقـوى فـي الـسـيـرفـر", color: "#FF3366", icon: "⚔️", unit: "⚡" },
    achievements: { title: "قـاعـة الإنـجـازات والأوسـمـة", color: "#FF8C00", icon: "🎖️", unit: "وسام" },
    streak: { title: "مـلـوك الـسـتـريـك الـيـومـي", color: "#FF5500", icon: "🔥", unit: "يوم" },
    media_streak: { title: "مـلـوك الـمـيـديـا", color: "#00E5FF", icon: "📸", unit: "يوم" },
    daily_xp: { title: "نـجـوم الـتـفـاعـل (الـيـوم)", color: "#00FF88", icon: "☀️", unit: "نقطة" },
    weekly_xp: { title: "نـجـوم الـتـفـاعـل (الأسـبـوع)", color: "#1E90FF", icon: "📅", unit: "نقطة" },
    monthly_xp: { title: "نـجـوم الـتـفـاعـل (الـشـهـر)", color: "#9932CC", icon: "🌙", unit: "نقطة" }
};

function drawRankShield(ctx, x, y, width, height, color) {
    ctx.save();
    
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    
    const shieldGrad = ctx.createLinearGradient(x, y, x, y + height);
    shieldGrad.addColorStop(0, 'rgba(30, 30, 35, 0.9)');
    shieldGrad.addColorStop(1, 'rgba(10, 10, 15, 0.9)');
    ctx.fillStyle = shieldGrad;

    ctx.beginPath();
    ctx.moveTo(x, y - height/2); 
    ctx.lineTo(x + width/2, y - height/3.5); 
    ctx.lineTo(x + width/2, y + height/8); 
    ctx.quadraticCurveTo(x + width/2, y + height/2.2, x, y + height/2); 
    ctx.quadraticCurveTo(x - width/2, y + height/2.2, x - width/2, y + height/8); 
    ctx.lineTo(x - width/2, y - height/3.5); 
    ctx.closePath();
    
    ctx.fill();
    ctx.stroke();
    
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    
    ctx.beginPath();
    ctx.moveTo(x, y - height/2 + 4); 
    ctx.lineTo(x + width/2 - 4, y - height/3.5 + 2); 
    ctx.lineTo(x + width/2 - 4, y + height/8 - 2); 
    ctx.quadraticCurveTo(x + width/2 - 4, y + height/2.2 - 4, x, y + height/2 - 4); 
    ctx.quadraticCurveTo(x - width/2 + 4, y + height/2.2 - 4, x - width/2 + 4, y + height/8 - 2); 
    ctx.lineTo(x - width/2 + 4, y - height/3.5 + 2); 
    ctx.closePath();
    
    ctx.stroke();
    ctx.restore();
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

async function generateTopImage(pageData, type, page, totalPages, targetUserId, extraData = {}) {
    const width = 950;
    const height = 1150; 
    
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.direction = 'rtl';

    const theme = THEMES[type] || { title: "لـوحـة الـصـدارة", color: "#FFFFFF", icon: "📜", unit: "" };

    ctx.fillStyle = '#0a0a10';
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    for (let i = 0; i < 200; i++) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        const radius = Math.random() * 80 + 20;
        const sides = Math.floor(Math.random() * 3) + 3;

        const shardGrad = ctx.createRadialGradient(x, y, 0, x, y, radius);
        shardGrad.addColorStop(0, theme.color); 
        shardGrad.addColorStop(1, 'rgba(0,0,0,0.8)');

        drawRandomPolygon(ctx, x, y, radius, sides);

        ctx.globalAlpha = 0.08;
        ctx.fillStyle = shardGrad;
        ctx.fill();

        ctx.globalAlpha = 0.3;
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#050505'; 
        ctx.stroke();
    }
    ctx.restore();

    const vignette = ctx.createRadialGradient(width/2, height/2, 200, width/2, height/2, 900);
    vignette.addColorStop(0, 'rgba(0,0,0,0.2)'); 
    vignette.addColorStop(1, 'rgba(0,0,0,0.98)'); 
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);

    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.strokeRect(15, 15, width - 30, height - 30);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 50px "Bein", sans-serif';
    ctx.textAlign = 'center';
    
    ctx.shadowColor = theme.color;
    ctx.shadowBlur = 15;
    ctx.fillText(fixAr(`${theme.icon} ${theme.title}`), width / 2, 80);
    ctx.shadowBlur = 0; 

    const lineGrad = ctx.createLinearGradient(width / 2 - 250, 0, width / 2 + 250, 0);
    lineGrad.addColorStop(0, 'rgba(0,0,0,0)');
    lineGrad.addColorStop(0.5, theme.color);
    lineGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = lineGrad;
    ctx.fillRect(width / 2 - 250, 115, 500, 2);

    if (pageData.length === 0) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = 'bold 35px "Bein", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(fixAr('لا يـوجـد بـيـانـات لـعـرضـهـا حـالـيـاً ...'), width / 2, height / 2);
        return await canvas.encode('image/png');
    }

    let startY = 160;
    const cardHeight = 80;
    const spacing = 12;

    for (let i = 0; i < pageData.length; i++) {
        const item = pageData[i];
        const rank = (page - 1) * ROWS_PER_PAGE + i + 1;
        const isMe = item.uid === targetUserId;

        let cardBg = 'rgba(0, 0, 0, 0.6)';
        let borderColor = 'rgba(255, 255, 255, 0.05)';
        let rankColor = '#888888';

        if (rank === 1) { borderColor = '#FFD700'; rankColor = '#FFD700'; cardBg = 'rgba(255, 215, 0, 0.08)'; }
        else if (rank === 2) { borderColor = '#C0C0C0'; rankColor = '#C0C0C0'; cardBg = 'rgba(192, 192, 192, 0.08)'; }
        else if (rank === 3) { borderColor = '#CD7F32'; rankColor = '#CD7F32'; cardBg = 'rgba(205, 127, 50, 0.08)'; }

        if (isMe) { borderColor = '#00FF88'; cardBg = 'rgba(0, 255, 136, 0.1)'; rankColor = '#00FF88'; }

        ctx.fillStyle = cardBg;
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(40, startY, width - 80, cardHeight, 15);
        ctx.fill();
        if (rank <= 3 || isMe) ctx.stroke(); 

        ctx.fillStyle = rankColor;
        ctx.font = 'bold 35px "Arial", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`#${rank}`, 90, startY + 52);

        const avatarSize = 56;
        const avatarX = width - 140;
        const avatarY = startY + 12;
        try {
            ctx.save();
            ctx.beginPath();
            ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
            ctx.closePath();
            ctx.clip();
            const avatarImage = await loadImage(item.avatar);
            ctx.drawImage(avatarImage, avatarX, avatarY, avatarSize, avatarSize);
            ctx.restore();

            if (rank <= 3 || isMe) {
                ctx.strokeStyle = borderColor;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
                ctx.stroke();
            }
        } catch (e) { }

        ctx.fillStyle = isMe ? '#00FF88' : '#FFFFFF';
        ctx.font = 'bold 26px "Bein", sans-serif';
        ctx.textAlign = 'right';
        const displayName = item.name.length > 15 ? item.name.substring(0, 15) + '..' : item.name;
        ctx.fillText(fixAr(displayName), avatarX - 20, startY + 40);

        let statVal = "";
        let statLabel = "";
        let subStat = "";
        let rankInfo = null;

        if (type === 'rep') {
            statVal = item.db.rp.toLocaleString();
            rankInfo = getRankInfo(item.db.rp);
        } 
        else if (type === 'mora') {
            // 🔥 الإصلاح الجوهري: نستخدم النص المنسق الجاهز من السحابة مباشرة
            // نأخذ القيمة المنسقة التي جهزناها في ملف top.js (تجنب الحساب هنا)
            statVal = item.db.total_wealth_formatted || (BigInt(item.db.total_wealth || 0).toLocaleString());
            statLabel = theme.unit;
        } 
        else if (type === 'level') {
            statVal = `${item.db.level}`;
            statLabel = theme.unit; 
            subStat = `XP: ${item.db.totalXP.toLocaleString()}`;
        } 
        else if (type === 'strongest') {
            statVal = item.db.powerScore.toLocaleString();
            statLabel = theme.unit;
            subStat = `DMG: ${item.db.damage} | HP: ${item.db.hp}`;
        } 
        else if (type === 'achievements') {
            statVal = `${item.db.count}`;
            statLabel = theme.unit;
        } 
        else if (type === 'streak' || type === 'media_streak') {
            statVal = `${item.db.streakCount}`;
            statLabel = theme.unit;
        } 
        else if (type.includes('xp')) { 
            statVal = item.db.score.toLocaleString();
            statLabel = theme.unit;
            const msgs = item.db.messages || item.db.total_messages || 0;
            const vc = item.db.vc_minutes || item.db.total_vc || 0;
            subStat = `💬 ${msgs.toLocaleString()} | 🎙️ ${vc.toLocaleString()} د`;
        }

        if (type === 'rep' && rankInfo) {
            const shieldW = 60;
            const shieldH = 65;
            const shieldX = 260; 
            const shieldY = startY + cardHeight / 2;

            drawRankShield(ctx, shieldX, shieldY, shieldW, shieldH, rankInfo.color);

            ctx.fillStyle = rankInfo.color;
            ctx.font = 'bold 24px "Arial", sans-serif'; 
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle'; 
            ctx.fillText(rankInfo.letter, shieldX, shieldY + 5);
            ctx.textBaseline = 'alphabetic'; 

            ctx.fillStyle = theme.color;
            ctx.font = 'bold 32px "Arial", sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(statVal, 140, startY + 52);

        } else {
            ctx.fillStyle = theme.color;
            ctx.font = 'bold 32px "Arial", sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(statVal, 140, startY + 52);

            const valWidth = ctx.measureText(statVal).width;

            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 22px "Bein", sans-serif';
            ctx.fillText(fixAr(statLabel), 140 + valWidth + 8, startY + 50);
        }

        if (subStat) {
            ctx.fillStyle = '#AAAAAA';
            ctx.font = '18px "Arial", sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(fixAr(subStat), avatarX - 20, startY + 68);
        }

        startY += cardHeight + spacing;
    }

    const footerY = height - 30;
    ctx.fillStyle = '#666677';
    ctx.font = '22px "Bein", sans-serif';
    ctx.textAlign = 'center';
    
    let footerText = `الـصـفـحـة ${page} مـن ${totalPages}`;
    // 🔥 إصلاح المجموع الكلي أسفل الصورة ليدعم الترليونات
    if (extraData.totalMora) {
        footerText += `   |   إجـمـالـي ثـروة الـسـيـرفـر: ${extraData.totalMora} 💰`;
    }
    
    ctx.fillText(fixAr(footerText), width / 2, footerY);

    return await canvas.encode('image/png');
}

module.exports = { generateTopImage };
