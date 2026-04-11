const { createCanvas, loadImage } = require('canvas'); 
const { AttachmentBuilder } = require('discord.js');
const path = require('path');
const fs = require('fs');

const FONT_MAIN = '"Cairo", "Tahoma", sans-serif'; 
const FONT_EMOJI = '"Noto Color Emoji", "Apple Color Emoji", sans-serif';

const COLORS = {
    bgDark: '#040508',         
    bgLight: '#0d1326',        
    textMain: '#ffffff',       
    textMuted: '#9aa5c7',      
};

const BASE_URL = 'https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev/images/ui';
const ASSETS = {
    bg: 'https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev/wallpaper.png', 
    mora: `${BASE_URL}/icon_mora.png`,
    xp: `${BASE_URL}/icon_xp.png`,
    rep: `${BASE_URL}/icon_rep.png`,
    uncommon: `${BASE_URL}/Uncommon.png`,
    rare: `${BASE_URL}/Rare.png`,
    epic: `${BASE_URL}/Epic.png`,
    legendary: `${BASE_URL}/Legendary.png`
};

const RARITIES = [
    { name: 'uncommon', color: '#00FF66', imgKey: 'uncommon' }, 
    { name: 'rare', color: '#00E5FF', imgKey: 'rare' },         
    { name: 'epic', color: '#B530FF', imgKey: 'epic' },         
    { name: 'legendary', color: '#FFD700', imgKey: 'legendary' }
];

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
        console.error(`[Canvas Error] Failed to load ${fileName}:`, e.message);
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

function getWeeklyResetCountdown() {
    const KSA_TIMEZONE_OFFSET = 3 * 60; 
    const now = new Date();
    const nowUTC = now.getTime() + (now.getTimezoneOffset() * 60000);
    const nowKSA = new Date(nowUTC + (KSA_TIMEZONE_OFFSET * 60000));
    
    const dayOfWeek = nowKSA.getDay(); 
    const daysUntilFriday = (5 - dayOfWeek + 7) % 7;
    
    const nextFriday = new Date(nowKSA);
    nextFriday.setDate(nowKSA.getDate() + daysUntilFriday);
    nextFriday.setHours(0, 0, 0, 0); 
    
    if (daysUntilFriday === 0 && nowKSA.getTime() > nextFriday.getTime()) {
        nextFriday.setDate(nextFriday.getDate() + 7);
    }
    
    const msRemaining = nextFriday.getTime() - nowKSA.getTime();
    const days = Math.floor(msRemaining / (1000 * 60 * 60 * 24));
    const hours = Math.floor((msRemaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    return `تتجدد خلال: ${days}ي و ${hours}س`;
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

function drawRewardChip(ctx, x, y, text, color, iconImg) {
    ctx.font = `bold 16px ${FONT_MAIN}`;
    const textWidth = ctx.measureText(text).width;
    const iconSpace = iconImg ? 28 : 0;
    const chipWidth = textWidth + iconSpace + 24;
    const chipHeight = 30;

    ctx.shadowBlur = 8;
    ctx.shadowColor = hexToRgba(color, 0.4);
    ctx.fillStyle = hexToRgba(color, 0.15); 
    drawRoundedRect(ctx, x, y, chipWidth, chipHeight, chipHeight / 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = hexToRgba(color, 0.7);
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const iconSize = 20;
    const iconX = x + 8;
    const iconY = y + (chipHeight - iconSize) / 2;
    
    if (iconImg) ctx.drawImage(iconImg, iconX, iconY, iconSize, iconSize);

    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, iconImg ? iconX + iconSize + 6 : x + 12, y + (chipHeight / 2) + 1);

    return chipWidth + 12; 
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

async function drawQuestNode(ctx, centerY, questData, index, assets) {
    const quest = questData?.quest || {};
    const progressVal = Number(questData?.progress) || 0;
    const goalVal = Number(quest?.goal) || 1;
    const isDone = progressVal >= goalVal;
    const percent = Math.min(1, Math.max(0, progressVal / goalVal));
    
    const rarityInfo = RARITIES[index % RARITIES.length];
    const cardColor = quest.color || rarityInfo.color;
    const cardBgImage = assets[quest.rarity || rarityInfo.imgKey] || assets[rarityInfo.imgKey]; 

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
        const emojiUrl = getEmojiUrl(quest.emoji);
        if (emojiUrl) {
            const img = await loadImage(emojiUrl);
            ctx.drawImage(img, iconX - 24, iconY - 24, 48, 48); 
        } else {
            ctx.font = `34px ${FONT_EMOJI}`; 
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#ffffff';
            ctx.fillText(quest.emoji || '📅', iconX, iconY + 3);
        }
    } catch (err) {}

    const textRightEdge = iconX - iconRadius - PADDING;

    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';

    ctx.fillStyle = isDone ? cardColor : '#ffffff';
    ctx.font = `bold 24px ${FONT_MAIN}`;
    ctx.fillText(quest.name || 'مهمة مجهولة', textRightEdge, cardY + PADDING);

    if (quest.description) {
        ctx.fillStyle = '#c2cadb';
        ctx.font = `16px ${FONT_MAIN}`;
        ctx.fillText(quest.description, textRightEdge, cardY + PADDING + 34); 
    }

    const rewardsY = cardY + PADDING + 64;
    let currentChipLeft = CARD_X + PADDING; 

    const moraReward = Number(quest?.reward?.mora) || 0;
    const xpReward = Number(quest?.reward?.xp) || 0;
    const repReward = Number(quest?.repReward) || 0;

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

async function loadAssets() {
    const [bg, mora, xp, rep, uncommon, rare, epic, legendary] = await Promise.all([
        loadSafeImage('wallpaper.png', ASSETS.bg),
        loadSafeImage('icon_mora.png', ASSETS.mora),
        loadSafeImage('icon_xp.png', ASSETS.xp),
        loadSafeImage('icon_rep.png', ASSETS.rep),
        loadSafeImage('Uncommon.png', ASSETS.uncommon),
        loadSafeImage('Rare.png', ASSETS.rare),
        loadSafeImage('Epic.png', ASSETS.epic),
        loadSafeImage('Legendary.png', ASSETS.legendary)
    ]);

    return { bg, mora, xp, rep, uncommon, rare, epic, legendary };
}

async function generateWeeklyQuestsImage(member, questsData, page = 1) {
    try {
        const assets = await loadAssets();

        const perPage = 4; 
        const totalPages = Math.ceil(questsData.length / perPage) || 1;
        page = Math.max(1, Math.min(page, totalPages)); 

        const start = (page - 1) * perPage;
        const end = start + perPage;
        const questsToShow = questsData.slice(start, end); 

        const pageHeight = Math.max(180 + (CARD_HEIGHT + 30) * questsToShow.length, 450);

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
        ctx.fillText(`المهام الأسبوعية لـ ${mName}`, PAGE_WIDTH - PAGE_MARGIN, headerY);

        ctx.fillStyle = '#c2cadb';
        ctx.font = `18px ${FONT_MAIN}`; 
        ctx.textAlign = 'left';
        const countdownText = getWeeklyResetCountdown();
        ctx.fillText(`[ ${countdownText}  |  صفحة ${page}/${totalPages} ]`, PAGE_MARGIN, headerY);

        const startTimelineY = headerY + 60;
        const endTimelineY = pageHeight - 40;
        
        ctx.beginPath();
        ctx.moveTo(TIMELINE_X, startTimelineY);
        ctx.lineTo(TIMELINE_X, endTimelineY);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 4;
        ctx.stroke();

        let currentCenterY = startTimelineY + (CARD_HEIGHT / 2) + 10;
        
        for (let i = 0; i < questsToShow.length; i++) { 
            await drawQuestNode(ctx, currentCenterY, questsToShow[i], i, assets);
            currentCenterY += CARD_HEIGHT + 30; 
        }

        const attachment = new AttachmentBuilder(canvas.toBuffer(), { name: `weekly-quests-${member?.id || 'user'}-p${page}.png` });

        return { attachment, totalPages };
    } catch (err) {
        console.error("[generateWeeklyQuestsImage Error]:", err);
        throw err;
    }
}

module.exports = {
    generateWeeklyQuestsImage
};
