const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');
const fs = require('fs');

try { GlobalFonts.registerFromPath(path.join(process.cwd(), 'fonts', 'bein-ar-normal.ttf'), 'Bein'); } catch (e) {}

const FONT_MAIN = '"Cairo", "Bein", "Tahoma", sans-serif'; 
const FONT_EMOJI = '"Noto Color Emoji", "Apple Color Emoji", sans-serif';

const BASE_URL = 'https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev/images/ui';
const ASSETS = {
    // 🔥 تم تصحيح رابط الخلفية هنا 🔥
    bg: `${BASE_URL}/wallpaper.png`,
    mora: `${BASE_URL}/icon_mora.png`,
    xp: `${BASE_URL}/icon_xp.png`,
    rep: `${BASE_URL}/icon_rep.png`,
    common: `${BASE_URL}/Uncommon.png`,
    uncommon: `${BASE_URL}/Uncommon.png`,
    rare: `${BASE_URL}/Rare.png`,
    epic: `${BASE_URL}/Epic.png`,
    legendary: `${BASE_URL}/Legendary.png`
};

const RARITIES = {
    common: { color: '#B0BEC5', imgKey: 'common' },
    uncommon: { color: '#00FF66', imgKey: 'uncommon' },
    rare: { color: '#00E5FF', imgKey: 'rare' },
    epic: { color: '#B530FF', imgKey: 'epic' },
    legendary: { color: '#FFD700', imgKey: 'legendary' }
};

let cachedAssets = null;

async function loadSafeImage(fileName, url) {
    try {
        const localPath = path.join(process.cwd(), 'images', 'ui', fileName);
        if (fs.existsSync(localPath)) return await loadImage(localPath);
        return await loadImage(url);
    } catch (e) {
        return null;
    }
}

function hexToRgba(hex, alpha) {
    if (!hex) return `rgba(255, 255, 255, ${alpha})`;
    let r = parseInt(hex.slice(1, 3), 16) || 0;
    let g = parseInt(hex.slice(3, 5), 16) || 0;
    let b = parseInt(hex.slice(5, 7), 16) || 0;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

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

async function loadAssets() {
    if (cachedAssets) return cachedAssets;
    const [bg, mora, xp, rep, common, uncommon, rare, epic, legendary] = await Promise.all([
        loadSafeImage('wallpaper.png', ASSETS.bg),
        loadSafeImage('icon_mora.png', ASSETS.mora),
        loadSafeImage('icon_xp.png', ASSETS.xp),
        loadSafeImage('icon_rep.png', ASSETS.rep),
        loadSafeImage('Uncommon.png', ASSETS.common),
        loadSafeImage('Uncommon.png', ASSETS.uncommon),
        loadSafeImage('Rare.png', ASSETS.rare),
        loadSafeImage('Epic.png', ASSETS.epic),
        loadSafeImage('Legendary.png', ASSETS.legendary)
    ]);
    cachedAssets = { bg, mora, xp, rep, common, uncommon, rare, epic, legendary };
    return cachedAssets;
}

async function generateAchievementCard(userAvatar, userName, achName, achDesc, rewardMora, rewardXp, repReward, rarity = 'legendary') {
    const assets = await loadAssets();
    const WIDTH = 950;
    const HEIGHT = 450;
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');

    const rarityInfo = RARITIES[rarity.toLowerCase()] || RARITIES['legendary'];
    const cardColor = rarityInfo.color;
    const bgImage = assets[rarityInfo.imgKey];

    if (assets.bg) {
        ctx.drawImage(assets.bg, 0, 0, WIDTH, HEIGHT);
        ctx.fillStyle = 'rgba(4, 5, 8, 0.7)';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
    } else {
        const bgGradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
        bgGradient.addColorStop(0, '#040508');
        bgGradient.addColorStop(1, '#0d1326');
        ctx.fillStyle = bgGradient;
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }

    const cardX = 30;
    const cardY = 30;
    const cardW = WIDTH - 60;
    const cardH = HEIGHT - 60;

    ctx.save();
    drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 25);
    ctx.clip();

    if (bgImage) {
        ctx.drawImage(bgImage, cardX, cardY, cardW, cardH);
        ctx.fillStyle = 'rgba(10, 12, 20, 0.75)';
        ctx.fillRect(cardX, cardY, cardW, cardH);
    } else {
        ctx.fillStyle = 'rgba(20, 24, 38, 0.9)';
        ctx.fillRect(cardX, cardY, cardW, cardH);
    }

    ctx.fillStyle = hexToRgba(cardColor, 0.1);
    ctx.beginPath(); ctx.arc(WIDTH / 2, HEIGHT / 2, 200, 0, Math.PI * 2); ctx.fill();

    ctx.restore();

    ctx.save();
    drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 25);
    ctx.shadowBlur = 20;
    ctx.shadowColor = hexToRgba(cardColor, 0.8);
    ctx.strokeStyle = cardColor;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = cardColor;
    ctx.font = `bold 38px ${FONT_MAIN}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = cardColor;
    ctx.shadowBlur = 15;
    ctx.fillText("🎉 إنجـاز جـديـد مـفـتـوح 🎉", WIDTH / 2, 75);
    ctx.shadowBlur = 0;

    const avatarSize = 110;
    const avatarX = (WIDTH / 2) - (avatarSize / 2);
    const avatarY = 120;

    try {
        if (userAvatar) {
            const img = await loadImage(userAvatar);
            ctx.save();
            ctx.beginPath();
            ctx.arc(WIDTH / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
            ctx.closePath();
            ctx.clip();
            ctx.drawImage(img, avatarX, avatarY, avatarSize, avatarSize);
            ctx.restore();
        }
    } catch (e) {}

    ctx.beginPath();
    ctx.arc(WIDTH / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.strokeStyle = cardColor;
    ctx.lineWidth = 4;
    ctx.shadowColor = cardColor;
    ctx.shadowBlur = 15;
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 36px ${FONT_MAIN}`;
    ctx.fillText(achName || 'إنجاز', WIDTH / 2, 275);

    ctx.fillStyle = '#c2cadb';
    ctx.font = `20px ${FONT_MAIN}`;
    ctx.fillText(achDesc || '', WIDTH / 2, 320);

    const chips = [];
    if (rewardMora > 0) chips.push({ text: `${rewardMora.toLocaleString()}`, color: '#FFD700', icon: assets.mora });
    if (rewardXp > 0) chips.push({ text: `${rewardXp.toLocaleString()}`, color: '#00E5FF', icon: assets.xp });
    if (repReward > 0) chips.push({ text: `+${repReward.toLocaleString()}`, color: '#B530FF', icon: assets.rep });

    let totalChipsWidth = 0;
    ctx.font = `bold 18px ${FONT_MAIN}`;
    
    chips.forEach(chip => {
        chip.textWidth = ctx.measureText(chip.text).width;
        chip.fullWidth = chip.textWidth + (chip.icon ? 28 : 0) + 24;
        totalChipsWidth += chip.fullWidth + 15;
    });
    totalChipsWidth -= 15; 

    let currentX = (WIDTH / 2) - (totalChipsWidth / 2);
    const chipsY = 360;

    chips.forEach(chip => {
        const chipH = 36;
        
        ctx.shadowBlur = 8;
        ctx.shadowColor = hexToRgba(chip.color, 0.4);
        ctx.fillStyle = hexToRgba(chip.color, 0.15);
        drawRoundedRect(ctx, currentX, chipsY, chip.fullWidth, chipH, chipH / 2);
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.strokeStyle = hexToRgba(chip.color, 0.7);
        ctx.lineWidth = 1.5;
        ctx.stroke();

        const iconSize = 22;
        const iconX = currentX + 10;
        const iconY = chipsY + (chipH - iconSize) / 2;
        
        if (chip.icon) {
            ctx.drawImage(chip.icon, iconX, iconY, iconSize, iconSize);
        }

        ctx.fillStyle = chip.color;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(chip.text, chip.icon ? iconX + iconSize + 8 : currentX + 12, chipsY + (chipH / 2));

        currentX += chip.fullWidth + 15;
    });

    return await canvas.encode ? canvas.encode('png') : canvas.toBuffer('image/png');
}

module.exports = { generateAchievementCard };
