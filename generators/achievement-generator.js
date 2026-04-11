const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const { AttachmentBuilder } = require('discord.js');
const path = require('path');
const fs = require('fs');

try { GlobalFonts.registerFromPath(path.join(process.cwd(), 'fonts', 'bein-ar-normal.ttf'), 'Bein'); } catch (e) {}

const FONT_MAIN = '"Cairo", "Bein", "Tahoma", sans-serif'; 
const FONT_EMOJI = '"Noto Color Emoji", "Apple Color Emoji", sans-serif';

const COLORS = {
    bgDark: '#040508',         
    bgLight: '#0d1326',        
    textMain: '#ffffff',       
    textMuted: '#9aa5c7',      
};

const BASE_URL = 'https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev/images/ui';
const ASSETS = {
    // 🔥 تم تصحيح رابط الخلفية لسحب الصورة من مجلد images/ui السحابي 🔥
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

const PAGE_WIDTH = 950;
const TIMELINE_X = 860; 
const CARD_WIDTH = 750;
const CARD_HEIGHT = 170;
const CARD_X = 50; 
const PADDING = 25;
const PAGE_MARGIN = 40;

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

function drawRewardChip(ctx, x, y, text, color, iconImg, isAlert = false) {
    ctx.font = `bold ${isAlert ? 20 : 16}px ${FONT_MAIN}`;
    const textWidth = ctx.measureText(text).width;
    const iconSpace = iconImg ? (isAlert ? 34 : 28) : 0;
    const chipWidth = textWidth + iconSpace + (isAlert ? 30 : 24);
    const chipHeight = isAlert ? 40 : 30;

    ctx.shadowBlur = 8;
    ctx.shadowColor = hexToRgba(color, 0.4);
    ctx.fillStyle = hexToRgba(color, 0.15); 
    drawRoundedRect(ctx, x, y, chipWidth, chipHeight, chipHeight / 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = hexToRgba(color, 0.7);
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const iconSize = isAlert ? 26 : 20;
    const iconX = x + (isAlert ? 10 : 8);
    const iconY = y + (chipHeight - iconSize) / 2;
    
    if (iconImg) ctx.drawImage(iconImg, iconX, iconY, iconSize, iconSize);

    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, iconImg ? iconX + iconSize + (isAlert ? 8 : 6) : x + (isAlert ? 16 : 12), y + (chipHeight / 2) + 1);

    return chipWidth + (isAlert ? 16 : 12); 
}

function getEmojiUrl(emoji) {
    if (!emoji) return null;
    const customMatch = emoji.match(/<?(a)?:?(\w{2,32}):(\d{17,19})>?/);
    if (customMatch) {
        const ext = customMatch[1] ? 'gif' : 'png';
        return `https://cdn.discordapp.com/emojis/${customMatch[3]}.${ext}`;
    }
    try {
        if (/^[a-zA-Z0-9\s]+$/.test(emoji)) return null;
        const codePoints = [...emoji].map(c => c.codePointAt(0).toString(16)).filter(cp => cp !== 'fe0f').join('-');
        return `https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/${codePoints}.png`;
    } catch (e) { return null; }
}

async function loadAssets() {
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
    return { bg, mora, xp, rep, common, uncommon, rare, epic, legendary };
}

// 🎨 رسم البطاقة للقائمة الأساسية
async function drawAchievementNode(ctx, centerY, achData, index, assets) {
    const achievement = achData?.achievement || {};
    const progressVal = Number(achData?.progress) || 0;
    const goalVal = Number(achievement?.goal) || 1;
    const isDone = progressVal >= goalVal;
    const percent = Math.min(1, Math.max(0, progressVal / goalVal));
    
    const rarityInfo = RARITIES[(achievement.rarity || 'common').toLowerCase()] || RARITIES['common'];
    const cardColor = rarityInfo.color;
    const cardBgImage = assets[rarityInfo.imgKey];

    const cardY = centerY - (CARD_HEIGHT / 2);

    ctx.save();

    ctx.beginPath();
    ctx.moveTo(TIMELINE_X, centerY);
    ctx.lineTo(CARD_X + CARD_WIDTH, centerY);
    ctx.strokeStyle = hexToRgba(cardColor, 0.4);
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.shadowBlur = 15;
    ctx.shadowColor = cardColor;
    ctx.beginPath();
    ctx.arc(TIMELINE_X, centerY, 14, 0, Math.PI * 2);
    ctx.fillStyle = '#06080F';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = cardColor;
    ctx.stroke();

    if (isDone) {
        ctx.beginPath();
        ctx.arc(TIMELINE_X, centerY, 6, 0, Math.PI * 2);
        ctx.fillStyle = cardColor;
        ctx.fill();
    }
    ctx.shadowBlur = 0;

    ctx.save(); 
    drawRoundedRect(ctx, CARD_X, cardY, CARD_WIDTH, CARD_HEIGHT, 18);
    ctx.clip(); 

    if (cardBgImage) {
        ctx.drawImage(cardBgImage, CARD_X, cardY, CARD_WIDTH, CARD_HEIGHT);
        ctx.fillStyle = isDone ? 'rgba(26, 22, 12, 0.4)' : 'rgba(10, 12, 20, 0.7)';
        ctx.fillRect(CARD_X, cardY, CARD_WIDTH, CARD_HEIGHT);
    } else {
        const cardGradient = ctx.createLinearGradient(CARD_X, cardY, CARD_X, cardY + CARD_HEIGHT);
        cardGradient.addColorStop(0, 'rgba(28, 34, 56, 0.95)'); 
        cardGradient.addColorStop(1, 'rgba(16, 20, 32, 0.95)');
        ctx.fillStyle = cardGradient;
        ctx.fill();
    }
    
    ctx.fillStyle = hexToRgba(cardColor, 0.08);
    ctx.beginPath(); ctx.arc(CARD_X + CARD_WIDTH, cardY, 150, 0, Math.PI * 2); ctx.fill();
    ctx.restore(); 

    ctx.save();
    drawRoundedRect(ctx, CARD_X, cardY, CARD_WIDTH, CARD_HEIGHT, 18);
    ctx.strokeStyle = isDone ? cardColor : hexToRgba(cardColor, 0.5);
    ctx.lineWidth = isDone ? 2.5 : 1.5;
    if (isDone) {
        ctx.shadowBlur = 25;
        ctx.shadowColor = hexToRgba(cardColor, 0.8);
    }
    ctx.stroke();
    ctx.restore();

    const iconRadius = 38;
    const iconX = CARD_X + CARD_WIDTH - PADDING - iconRadius;
    const iconY = cardY + PADDING + iconRadius - 5;

    ctx.shadowBlur = 15;
    ctx.shadowColor = cardColor;
    ctx.beginPath();
    ctx.arc(iconX, iconY, iconRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#0a0d16'; 
    ctx.fill();
    
    ctx.shadowBlur = 0;
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = cardColor;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(iconX, iconY, iconRadius - 6, 0, Math.PI * 2);
    ctx.strokeStyle = hexToRgba(cardColor, 0.4);
    ctx.lineWidth = 1.5;
    ctx.stroke();

    try {
        const emojiUrl = getEmojiUrl(achievement.emoji);
        if (emojiUrl) {
            const img = await loadImage(emojiUrl);
            ctx.drawImage(img, iconX - 24, iconY - 24, 48, 48); 
        } else {
            ctx.font = `34px ${FONT_EMOJI}`; 
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#ffffff';
            ctx.fillText(achievement.emoji || '🏆', iconX, iconY + 3);
        }
    } catch (err) {}

    const textRightEdge = iconX - iconRadius - PADDING;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';

    ctx.fillStyle = isDone ? cardColor : '#ffffff';
    ctx.font = `bold 24px ${FONT_MAIN}`;
    ctx.fillText(achievement.name || 'مهمة مجهولة', textRightEdge, cardY + PADDING);

    if (achievement.description) {
        ctx.fillStyle = '#c2cadb';
        ctx.font = `16px ${FONT_MAIN}`;
        ctx.fillText(achievement.description, textRightEdge, cardY + PADDING + 34); 
    }

    const rewardsY = cardY + PADDING + 64;
    let currentChipLeft = CARD_X + PADDING; 

    const moraReward = Number(achievement?.reward?.mora) || 0;
    const xpReward = Number(achievement?.reward?.xp) || 0;
    const repReward = Number(achievement?.repReward) || 0;

    if (moraReward > 0) {
        currentChipLeft += drawRewardChip(ctx, currentChipLeft, rewardsY, `${moraReward.toLocaleString()}`, '#FFD700', assets.mora);
    }
    if (xpReward > 0) {
        currentChipLeft += drawRewardChip(ctx, currentChipLeft, rewardsY, `${xpReward.toLocaleString()}`, '#00E5FF', assets.xp);
    }
    if (repReward > 0) {
        currentChipLeft += drawRewardChip(ctx, currentChipLeft, rewardsY, `+${repReward.toLocaleString()}`, '#B530FF', assets.rep);
    }

    const barHeight = 12;
    const barWidth = CARD_WIDTH - (PADDING * 2);
    const barX = CARD_X + PADDING;
    const barY = cardY + CARD_HEIGHT - PADDING - barHeight + 8;

    ctx.fillStyle = '#c2cadb';
    ctx.font = `bold 14px ${FONT_MAIN}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${progressVal.toLocaleString()} / ${goalVal.toLocaleString()}`, barX + barWidth, barY - 6);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'; 
    drawRoundedRect(ctx, barX, barY, barWidth, barHeight, barHeight/2);
    ctx.fill();

    if (percent > 0) {
        ctx.shadowBlur = 10;
        ctx.shadowColor = cardColor;
        ctx.fillStyle = cardColor;
        drawRoundedRect(ctx, barX, barY, barWidth * percent, barHeight, barHeight/2);
        ctx.fill();
        
        ctx.beginPath();
        ctx.arc(barX + (barWidth * percent), barY + (barHeight/2), 7, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.shadowBlur = 0;
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = percent > 0.5 ? '#ffffff' : cardColor;
    ctx.font = `bold 11px ${FONT_MAIN}`;
    ctx.fillText(`${Math.floor(percent * 100)}%`, barX + (barWidth / 2), barY + (barHeight / 2) + 1);

    ctx.restore();
}

// 🚀 رسم البطاقة الكبيرة للإشعارات
async function drawAlertNode(ctx, canvasW, canvasH, achData, assets) {
    const achievement = achData.achievement;
    const rarityInfo = RARITIES[(achievement.rarity || 'common').toLowerCase()] || RARITIES['common'];
    const cardColor = rarityInfo.color;
    const cardBgImage = assets[rarityInfo.imgKey];

    const padding = 35;
    const cardX = padding;
    const cardY = padding;
    const cardW = canvasW - (padding * 2);
    const cardH = canvasH - (padding * 2);

    ctx.save(); 
    drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 14);
    ctx.clip(); 

    if (cardBgImage) {
        ctx.drawImage(cardBgImage, cardX, cardY, cardW, cardH);
        ctx.fillStyle = 'rgba(10, 12, 20, 0.4)'; 
        ctx.fillRect(cardX, cardY, cardW, cardH);
    } else {
        const cardGradient = ctx.createLinearGradient(cardX, cardY, cardX, cardY + cardH);
        cardGradient.addColorStop(0, 'rgba(28, 34, 56, 0.95)'); 
        cardGradient.addColorStop(1, 'rgba(16, 20, 32, 0.95)');
        ctx.fillStyle = cardGradient;
        ctx.fillRect(cardX, cardY, cardW, cardH);
    }
    
    ctx.fillStyle = hexToRgba(cardColor, 0.15);
    ctx.beginPath(); ctx.arc(cardX + cardW, cardY, 250, 0, Math.PI * 2); ctx.fill();
    ctx.restore(); 

    ctx.save();
    drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 14);
    ctx.strokeStyle = cardColor;
    ctx.lineWidth = 3;
    ctx.shadowBlur = 30;
    ctx.shadowColor = hexToRgba(cardColor, 1);
    ctx.stroke();
    ctx.restore();

    const iconRadius = 45;
    const iconX = cardX + cardW - 35 - iconRadius;
    const iconY = cardY + (cardH / 2);

    ctx.shadowBlur = 20;
    ctx.shadowColor = cardColor;
    ctx.beginPath();
    ctx.arc(iconX, iconY, iconRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#0a0d16'; 
    ctx.fill();
    
    ctx.shadowBlur = 0;
    ctx.lineWidth = 3;
    ctx.strokeStyle = cardColor;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(iconX, iconY, iconRadius - 8, 0, Math.PI * 2);
    ctx.strokeStyle = hexToRgba(cardColor, 0.4);
    ctx.lineWidth = 2;
    ctx.stroke();

    try {
        const emojiUrl = getEmojiUrl(achievement.emoji);
        if (emojiUrl) {
            const img = await loadImage(emojiUrl);
            ctx.drawImage(img, iconX - 30, iconY - 30, 60, 60); 
        } else {
            ctx.font = `40px ${FONT_EMOJI}`; 
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#ffffff';
            ctx.fillText(achievement.emoji || '🏆', iconX, iconY + 5);
        }
    } catch (err) {}

    const textRightEdge = iconX - iconRadius - 30;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';

    ctx.fillStyle = cardColor;
    ctx.font = `bold 20px ${FONT_MAIN}`;
    ctx.textAlign = 'left';
    ctx.fillText(`✨ اكـتـمـلـت بـنـجـاح`, cardX + 30, cardY + 25);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 32px ${FONT_MAIN}`;
    ctx.fillText(achievement.name || 'مهمة مجهولة', textRightEdge, cardY + 30);

    if (achievement.description) {
        ctx.fillStyle = '#e2e8f5';
        ctx.font = `20px ${FONT_MAIN}`;
        ctx.fillText(achievement.description, textRightEdge, cardY + 75); 
    }

    const rewardsY = cardY + cardH - 35 - 38; 
    let currentChipLeft = cardX + 30; 

    const moraReward = Number(achievement?.reward?.mora) || 0;
    const xpReward = Number(achievement?.reward?.xp) || 0;
    const repReward = Number(achievement?.repReward) || 0;

    if (moraReward > 0) {
        currentChipLeft += drawRewardChip(ctx, currentChipLeft, rewardsY, `${moraReward.toLocaleString()}`, '#FFD700', assets.mora, true);
    }
    if (xpReward > 0) {
        currentChipLeft += drawRewardChip(ctx, currentChipLeft, rewardsY, `${xpReward.toLocaleString()}`, '#00E5FF', assets.xp, true);
    }
    if (repReward > 0) {
        currentChipLeft += drawRewardChip(ctx, currentChipLeft, rewardsY, `+${repReward.toLocaleString()}`, '#B530FF', assets.rep, true);
    }
}

async function generateAchievementPageImage(member, achievementsData, stats) {
    const assets = await loadAssets();

    const pageHeight = Math.max(180 + (CARD_HEIGHT + 30) * achievementsData.length, 450);
    const canvas = createCanvas(PAGE_WIDTH, pageHeight);
    const ctx = canvas.getContext('2d');

    if (assets.bg) {
        ctx.drawImage(assets.bg, 0, 0, PAGE_WIDTH, pageHeight);
        ctx.fillStyle = 'rgba(4, 5, 8, 0.5)'; 
        ctx.fillRect(0, 0, PAGE_WIDTH, pageHeight);
    } else {
        const bgGradient = ctx.createLinearGradient(0, 0, PAGE_WIDTH, pageHeight);
        bgGradient.addColorStop(0, '#040508');
        bgGradient.addColorStop(1, '#0d1326');
        ctx.fillStyle = bgGradient;
        ctx.fillRect(0, 0, PAGE_WIDTH, pageHeight);
    }

    const headerY = 60;
    const mName = member?.displayName || member?.user?.username || 'مغامر';
    
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 38px ${FONT_MAIN}`; 
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(`إنجـازات ${mName}`, PAGE_WIDTH - PAGE_MARGIN, headerY);

    ctx.fillStyle = '#c2cadb';
    ctx.font = `18px ${FONT_MAIN}`; 
    ctx.textAlign = 'left';
    ctx.fillText(`[ المهام المكتملة: ${stats.completed}/${stats.total}  |  صفحة ${stats.page}/${stats.totalPages} ]`, PAGE_MARGIN, headerY);

    const startTimelineY = headerY + 60;
    const endTimelineY = pageHeight - 40;
    
    ctx.beginPath();
    ctx.moveTo(TIMELINE_X, startTimelineY);
    ctx.lineTo(TIMELINE_X, endTimelineY);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 4;
    ctx.stroke();

    let currentCenterY = startTimelineY + (CARD_HEIGHT / 2) + 10;
    
    for (let i = 0; i < achievementsData.length; i++) { 
        await drawAchievementNode(ctx, currentCenterY, achievementsData[i], i, assets);
        currentCenterY += CARD_HEIGHT + 30; 
    }

    return new AttachmentBuilder(await canvas.encode ? canvas.encode('png') : canvas.toBuffer('image/png'), { name: `achievements-page-${member.id}-${stats.page}.png` });
}

async function generateSingleAchievementAlert(member, achievement) {
    const assets = await loadAssets();
    const canvasW = 920;
    const canvasH = 260;
    const canvas = createCanvas(canvasW, canvasH); 
    const ctx = canvas.getContext('2d');
    
    const data = { achievement: achievement, progress: achievement.goal, isDone: true };
    await drawAlertNode(ctx, canvasW, canvasH, data, assets);
    
    return new AttachmentBuilder(await canvas.encode ? canvas.encode('png') : canvas.toBuffer('image/png'), { name: `achievement-unlocked-${member.id}-${achievement.id}.png` });
}

async function generateQuestAlert(member, quest, questType) {
    const assets = await loadAssets();
    const canvasW = 920;
    const canvasH = 260;
    const canvas = createCanvas(canvasW, canvasH); 
    const ctx = canvas.getContext('2d');
    
    const data = { achievement: quest, progress: quest.goal, isDone: true };
    await drawAlertNode(ctx, canvasW, canvasH, data, assets);
    
    return new AttachmentBuilder(await canvas.encode ? canvas.encode('png') : canvas.toBuffer('image/png'), { name: `quest-unlocked-${member.id}-${quest.id}.png` });
}

module.exports = {
    generateAchievementPageImage,
    generateSingleAchievementAlert,
    generateQuestAlert,
    drawAchievementCard: drawAchievementNode 
};
