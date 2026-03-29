const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

try {
    GlobalFonts.registerFromPath('fonts/bein-ar-normal.ttf', 'Bein');
} catch (e) {
    console.log("[Skills Generator] Warning: Bein font not found.");
}

const R2_URL = 'https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev';
const imageCache = new Map();

async function getCachedImage(imageUrl) {
    if (!imageUrl) return null;
    if (imageCache.has(imageUrl)) return imageCache.get(imageUrl);
    try {
        const img = await loadImage(imageUrl);
        imageCache.set(imageUrl, img);
        return img;
    } catch (e) {
        return null;
    }
}

const SKILL_TO_IMAGE = {
    'skill_healing': 'heal.png',
    'skill_shielding': 'shield.png',
    'skill_buffing': 'buff.png',
    'skill_rebound': 'rebound.png',
    'skill_weaken': 'weaken.png',
    'skill_dispel': 'dispel.png',
    'skill_cleanse': 'cleanse.png',
    'skill_poison': 'poison.png',
    'skill_gamble': 'gamble.png',
    'race_dragon_skill': 'dragon.png',
    'race_human_skill': 'human.png',
    'race_seraphim_skill': 'seraphim.png',
    'race_demon_skill': 'demon.png',
    'race_elf_skill': 'elf.png',
    'race_dark_elf_skill': 'darkelf.png',
    'race_vampire_skill': 'vampire.png',
    'race_hybrid_skill': 'hybrid.png',
    'race_spirit_skill': 'spirit.png',
    'race_dwarf_skill': 'dwarf.png',
    'race_ghoul_skill': 'ghoul.png'
};

function drawAutoScaledText(ctx, text, x, y, maxWidth, maxFontSize, minFontSize = 10) {
    let currentFontSize = maxFontSize;
    ctx.font = `bold ${currentFontSize}px "Bein"`;
    while (ctx.measureText(text).width > maxWidth && currentFontSize > minFontSize) {
        currentFontSize--;
        ctx.font = `bold ${currentFontSize}px "Bein"`;
    }
    ctx.fillText(text, x, y);
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

function wrapText(ctx, text, maxWidth) {
    const words = text.split(' ');
    let lines = [];
    let currentLine = words[0];

    for (let i = 1; i < words.length; i++) {
        const word = words[i];
        const width = ctx.measureText(currentLine + " " + word).width;
        if (width < maxWidth) {
            currentLine += " " + word;
        } else {
            lines.push(currentLine);
            currentLine = word;
        }
    }
    lines.push(currentLine);
    return lines;
}

function drawSpiderChart(ctx, cx, cy, radius, stats, primaryColor) {
    const sides = stats.length;
    const angleStep = (Math.PI * 2) / sides;
    const maxVal = 100; 

    ctx.save();
    ctx.translate(cx, cy);

    const levels = 4;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1.5;
    for (let l = 1; l <= levels; l++) {
        const r = (radius / levels) * l;
        ctx.beginPath();
        for (let i = 0; i <= sides; i++) {
            const angle = i * angleStep - Math.PI / 2;
            const x = r * Math.cos(angle);
            const y = r * Math.sin(angle);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
        const angle = i * angleStep - Math.PI / 2;
        ctx.moveTo(0, 0);
        ctx.lineTo(radius * Math.cos(angle), radius * Math.sin(angle));
    }
    ctx.stroke();

    ctx.beginPath();
    let dataPoints = [];
    for (let i = 0; i < sides; i++) {
        const angle = i * angleStep - Math.PI / 2;
        const percentage = Math.min(Math.max(stats[i].val / maxVal, 0.05), 1); 
        const r = radius * percentage;
        const x = r * Math.cos(angle);
        const y = r * Math.sin(angle);
        dataPoints.push({x, y});
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();

    ctx.fillStyle = `rgba(${parseInt(primaryColor.slice(1,3),16)}, ${parseInt(primaryColor.slice(3,5),16)}, ${parseInt(primaryColor.slice(5,7),16)}, 0.45)`;
    ctx.fill();
    ctx.strokeStyle = primaryColor;
    ctx.lineWidth = 3.5;
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = primaryColor;
    ctx.shadowBlur = 12;
    for (const pt of dataPoints) {
        ctx.beginPath(); ctx.arc(pt.x, pt.y, 4.5, 0, Math.PI*2); ctx.fill();
    }
    ctx.shadowBlur = 0;

    ctx.font = 'bold 18px "Bein"';
    for (let i = 0; i < sides; i++) {
        const angle = i * angleStep - Math.PI / 2;
        const labelRadius = radius + 40; 
        const x = labelRadius * Math.cos(angle);
        const y = labelRadius * Math.sin(angle);

        ctx.fillStyle = '#E0E0E0';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        if (Math.abs(Math.cos(angle)) > 0.1) {
            ctx.textAlign = Math.cos(angle) > 0 ? 'left' : 'right';
        }
        
        ctx.fillText(stats[i].label, x, y);
    }

    ctx.restore();
}

async function generateSkillsCard(data) {
    const width = 1200;
    const height = 800;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const primaryColor = '#B968FF'; 

    const bgGrad = ctx.createRadialGradient(width/2, height/2, 100, width/2, height/2, 900);
    bgGrad.addColorStop(0, '#1a1025'); 
    bgGrad.addColorStop(1, '#050508');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#FFFFFF';
    for(let i=0; i<150; i++) {
        const px = Math.random() * width;
        const py = Math.random() * height;
        const pSize = Math.random() * 2.5;
        ctx.globalAlpha = Math.random() * 0.5 + 0.1;
        ctx.beginPath(); ctx.arc(px, py, pSize, 0, Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha = 1.0;

    const headerH = 120;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, width, headerH);
    
    const goldGrad = ctx.createLinearGradient(0, 0, width, 0);
    goldGrad.addColorStop(0, 'rgba(185, 104, 255, 0)');
    goldGrad.addColorStop(0.5, 'rgba(185, 104, 255, 0.8)');
    goldGrad.addColorStop(1, 'rgba(185, 104, 255, 0)');
    ctx.fillStyle = goldGrad;
    ctx.fillRect(0, headerH - 3, width, 3);
    ctx.fillRect(0, 3, width, 1);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = primaryColor; 
    ctx.font = 'bold 50px "Bein"';
    ctx.shadowColor = primaryColor;
    ctx.shadowBlur = 20;
    ctx.fillText(`✦ مهارات ${data.cleanName} ✦`, width / 2, 60);
    ctx.shadowBlur = 0;

    ctx.textAlign = 'right';
    ctx.font = 'bold 18px "Bein"';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.fillText(`[ ${data.currentPage + 1} / ${data.totalPages || 1} ]`, width - 30, 60);

    const leftPanelW = 450;
    
    ctx.fillStyle = 'rgba(15, 20, 30, 0.8)';
    ctx.beginPath(); roundRect(ctx, 40, 160, leftPanelW, height - 200, 20); ctx.fill();
    ctx.strokeStyle = primaryColor; ctx.lineWidth = 2; ctx.stroke();

    const avatarSize = 130;
    const avatarX = 40 + leftPanelW / 2;
    const avatarY = 250;

    ctx.save();
    ctx.beginPath(); ctx.arc(avatarX, avatarY, avatarSize / 2, 0, Math.PI * 2); ctx.clip();
    try {
        const avatarImage = await loadImage(data.avatarUrl);
        ctx.drawImage(avatarImage, avatarX - avatarSize/2, avatarY - avatarSize/2, avatarSize, avatarSize);
    } catch (e) { ctx.fillStyle = '#333'; ctx.fill(); }
    ctx.restore();

    ctx.beginPath(); ctx.arc(avatarX, avatarY, avatarSize / 2, 0, Math.PI * 2);
    ctx.lineWidth = 4; ctx.strokeStyle = primaryColor; ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#E0E0E0'; ctx.font = 'bold 22px "Bein"';
    ctx.fillText(`🩸 العرق: ${data.raceName}`, avatarX, avatarY + 90);
    
    ctx.fillStyle = '#F1C40F'; ctx.font = 'bold 20px "Bein"';
    const wpName = data.weaponData ? data.weaponData.name : 'بدون سلاح';
    const wpDmg = data.weaponData ? data.weaponData.currentDamage : 0;
    ctx.fillText(`⚔️ السلاح: ${wpName} (ضرر: ${wpDmg})`, avatarX, avatarY + 125);

    const totalSkillsLevel = data.skillsList.reduce((acc, s) => acc + s.level, 0);
    const playerLevel = data.userLevel || 1;
    
    const maxDmg = 300;     
    const maxSkLvl = 100;   
    const maxLvl = 100;     
    const maxSkills = 8;    
    const maxSpent = 250000;

    let chartStats = [
        { label: 'الهجوم', val: (wpDmg / maxDmg) * 100 }, 
        { label: 'المهارة', val: (totalSkillsLevel / maxSkLvl) * 100 }, 
        { label: 'الحيوية', val: (playerLevel / maxLvl) * 100 }, 
        { label: 'السحر', val: (data.skillsList.length / maxSkills) * 100 }, 
        { label: 'الاستثمار', val: (data.totalSpent / maxSpent) * 100 }, 
        { label: 'الدفاع', val: (((playerLevel * 1.5) + wpDmg) / 450) * 100 }
    ];

    drawSpiderChart(ctx, avatarX, avatarY + 310, 100, chartStats, primaryColor);

    const rightPanelX = 530;
    const rightPanelW = 630;
    const startY = 160;
    const slotH = 180;
    const gapY = 25;

    if (data.skillsList.length === 0) {
        ctx.fillStyle = 'rgba(15, 20, 30, 0.8)';
        ctx.beginPath(); roundRect(ctx, rightPanelX, startY, rightPanelW, height - 200, 20); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.stroke();
        
        ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'center'; ctx.font = 'bold 30px "Bein"';
        ctx.fillText('❌ لا يوجد مهارات مسجلة', rightPanelX + rightPanelW/2, startY + 200);
    } else {
        for (let i = 0; i < data.skillsList.length; i++) {
            const skill = data.skillsList[i];
            const y = startY + i * (slotH + gapY);

            ctx.fillStyle = 'rgba(20, 25, 35, 0.8)';
            ctx.beginPath(); roundRect(ctx, rightPanelX, y, rightPanelW, slotH, 15); ctx.fill();
            ctx.strokeStyle = 'rgba(185, 104, 255, 0.5)'; ctx.lineWidth = 2; ctx.stroke();

            const imgBoxSize = 130;
            const imgBoxX = rightPanelX + rightPanelW - imgBoxSize - 25; 
            const imgBoxY = y + 25;

            ctx.fillStyle = 'rgba(10, 10, 15, 0.9)';
            ctx.beginPath(); roundRect(ctx, imgBoxX, imgBoxY, imgBoxSize, imgBoxSize, 15); ctx.fill();
            ctx.strokeStyle = primaryColor; ctx.lineWidth = 2; ctx.stroke();

            let imgDrawn = false;
            if (skill.id && SKILL_TO_IMAGE[skill.id]) {
                const imgUrl = `${R2_URL}/images/skills/${SKILL_TO_IMAGE[skill.id]}`;
                const img = await getCachedImage(imgUrl);
                if (img) {
                    ctx.shadowColor = primaryColor; ctx.shadowBlur = 20;
                    ctx.drawImage(img, imgBoxX + 15, imgBoxY + 15, imgBoxSize - 30, imgBoxSize - 30);
                    ctx.shadowBlur = 0;
                    imgDrawn = true;
                }
            }

            if (!imgDrawn) {
                ctx.fillStyle = '#FFFFFF'; ctx.font = '50px Arial';
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText('📜', imgBoxX + imgBoxSize/2, imgBoxY + imgBoxSize/2);
            }

            const badgeW = 75, badgeH = 28;
            const badgeX = imgBoxX + (imgBoxSize / 2) - (badgeW / 2);
            const badgeY = imgBoxY + imgBoxSize - (badgeH / 2); 

            ctx.fillStyle = '#1a1025'; 
            ctx.beginPath(); roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 10); ctx.fill();
            ctx.strokeStyle = primaryColor; ctx.lineWidth = 2; ctx.stroke();

            ctx.fillStyle = '#FFD700'; ctx.font = 'bold 15px "Arial"'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(`LVL ${skill.level}`, badgeX + badgeW/2, badgeY + badgeH/2 + 2);

            const textStartX = imgBoxX - 25; 
            
            ctx.textAlign = 'right'; ctx.textBaseline = 'top';
            ctx.fillStyle = '#FFD700'; ctx.font = 'bold 32px "Bein"';
            ctx.fillText(skill.name, textStartX, y + 35); 

            ctx.fillStyle = '#A8B8D0'; ctx.font = '22px "Bein"';
            const lines = wrapText(ctx, skill.description, rightPanelW - imgBoxSize - 70);
            for (let j = 0; j < Math.min(lines.length, 3); j++) {
                ctx.fillText(lines[j], textStartX, y + 85 + (j * 35)); 
            }
        }
    }

    return canvas.toBuffer('image/png');
}

module.exports = { generateSkillsCard };
