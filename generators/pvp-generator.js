const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');
const fs = require('fs');

try {
    GlobalFonts.registerFromPath(path.join(process.cwd(), 'fonts', 'bein-ar-normal.ttf'), 'Bein');
} catch (e) {}

const R2_BASE = 'https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev';
const R2_URL = `${R2_BASE}/images/pvp`;
const R2_SKILLS = `${R2_BASE}/images/skills`;
const R2_VFX = `${R2_BASE}/images/vfx`;
const R2_WEAPON = `${R2_BASE}/images/weapon`;

const SKILL_IMAGES = {
    'skill_healing': 'heal.png', 'skill_shielding': 'shield.png', 'skill_buffing': 'buff.png',
    'skill_rebound': 'rebound.png', 'skill_weaken': 'weaken.png', 'skill_dispel': 'dispel.png',
    'skill_cleanse': 'cleanse.png', 'skill_poison': 'poison.png', 'skill_gamble': 'gamble.png',
    'race_dragon_skill': 'dragon.png', 'race_human_skill': 'human.png', 'race_seraphim_skill': 'seraphim.png',
    'race_demon_skill': 'demon.png', 'race_elf_skill': 'elf.png', 'race_dark_elf_skill': 'darkelf.png',
    'race_vampire_skill': 'vampire.png', 'race_hybrid_skill': 'hybrid.png', 'race_spirit_skill': 'spirit.png',
    'race_dwarf_skill': 'dwarf.png', 'race_ghoul_skill': 'ghoul.png'
};

const VFX_FILES = {
    'attack': 'vfx_attack.png',
    'skill_fire': 'vfx_fire.png',
    'skill_heal': 'vfx_heal.png',
    'skill_shield': 'vfx_shield.png',
    'skill_poison': 'vfx_poison.png',
    'skill_dark': 'vfx_dark.png',
    'skill_ice': 'vfx_ice.png',
    'death': 'vfx_death.png'
};

const WEAPON_FILES = {
    'Dragon': 'skill_dragon_magma_focus.png',
    'Human': 'weapon_human_royal_greatsword.png',
    'Elf': 'weapon_elf_verdant_longbow.png',
    'Dark Elf': 'weapon_darkelf_obsidian_stiletto.png',
    'Seraphim': 'weapon_seraphim_divine_partisan.png',
    'Demon': 'weapon_demon_inferno_waraxe.png',
    'Vampire': 'weapon_vampire_sanguine_reaper.png',
    'Spirit': 'weapon_spirit_astral_codex.png',
    'Hybrid': 'weapon_hybrid_fang_blades.png',
    'Dwarf': 'weapon_dwarf_ancestral_maul.png',
    'Ghoul': 'weapon_ghoul_plague_crusher.png'
};

const RACE_AR = {
    'Human': 'بشري', 'Dragon': 'تنين', 'Elf': 'آلف', 'Dark Elf': 'آلف الظلام',
    'Seraphim': 'سيرافيم', 'Demon': 'شيطان', 'Vampire': 'مصاص دماء',
    'Spirit': 'روح', 'Dwarf': 'قزم', 'Ghoul': 'غول', 'Hybrid': 'نصف وحش',
    'Monster': 'وحش أعماق', 'Beast': 'وحش كاسر', 'Boss': 'زعيم', 'Kraken': 'كراكن'
};

const shieldCache = new Map();

// 🛡️ تحميل الصور بأمان بدون تخزينها في RAM للوقاية من الانفجار 🛡️
async function getSafeImage(url, fileName) {
    if (!url) return null;
    try {
        if (fileName) {
            const localPath = path.join(process.cwd(), 'images', 'pvp', fileName);
            if (fs.existsSync(localPath)) return await loadImage(localPath);
            const uiPath = path.join(process.cwd(), 'images', 'ui', fileName);
            if (fs.existsSync(uiPath)) return await loadImage(uiPath);
        }
        return await loadImage(url);
    } catch (e) { return null; }
}

function cleanText(text) {
    if (!text) return "";
    return text.replace(/\*\*/g, '').replace(/`/g, '').replace(/<a?:.+?:\d+>/g, '').trim();
}

function roundRect(ctx, x, y, w, h, r) {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

function drawInfoBadge(ctx, x, y, text, color, isRight) {
    ctx.font = 'bold 13px "Bein"';
    const tw = ctx.measureText(text).width;
    const px = isRight ? x - tw - 20 : x;
    
    ctx.save();
    roundRect(ctx, px, y, tw + 20, 24, 6);
    ctx.fillStyle = 'rgba(5, 5, 15, 0.7)';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = isRight ? 'right' : 'left';
    ctx.fillText(text, isRight ? x - 10 : x + 10, y + 17);
    ctx.restore();
    
    return tw + 25;
}

function drawHPBar(ctx, x, y, width, height, percent, color1, color2, radius, isRight) {
    ctx.save();
    
    roundRect(ctx, x - 4, y - 4, width + 8, height + 8, radius + 2);
    ctx.fillStyle = '#0a0a14';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#2b2b40';
    ctx.stroke();

    roundRect(ctx, x, y, width, height, radius);
    ctx.fillStyle = '#030308';
    ctx.fill();

    const hpWidth = Math.max(0, width * Math.min(1, percent));
    if (hpWidth > 0) {
        ctx.save();
        roundRect(ctx, x, y, width, height, radius);
        ctx.clip();

        const grad = ctx.createLinearGradient(x, y, x, y + height);
        grad.addColorStop(0, color1);
        grad.addColorStop(0.5, color2);
        grad.addColorStop(1, color1);
        ctx.fillStyle = grad;
        
        const fx = isRight ? x + width - hpWidth : x;

        roundRect(ctx, fx, y, hpWidth, height, radius);
        ctx.fill();

        const glossGrad = ctx.createLinearGradient(x, y, x, y + height * 0.4);
        glossGrad.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
        glossGrad.addColorStop(1, 'rgba(255, 255, 255, 0.05)');
        ctx.fillStyle = glossGrad;
        ctx.fillRect(fx, y, hpWidth, height * 0.4);

        ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.lineWidth = 1.5;
        for(let i=1; i<4; i++) {
            ctx.beginPath();
            ctx.moveTo(x + (width * 0.25 * i), y);
            ctx.lineTo(x + (width * 0.25 * i), y + height);
            ctx.stroke();
        }
        ctx.restore();
    }
    
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, width, height, radius);
    ctx.stroke();
    
    ctx.restore();
}

function drawStatusBar(ctx, x, y, width, height, percent, color1, color2, radius, isRight) {
    ctx.save();
    
    roundRect(ctx, x, y, width, height, radius);
    ctx.fillStyle = '#0a0a14';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#2b2b40';
    ctx.stroke();

    const fw = Math.max(0, width * Math.min(1, percent));
    if (fw > 0) {
        ctx.save();
        const fx = isRight ? x + width - fw : x;
        
        roundRect(ctx, x, y, width, height, radius);
        ctx.clip();

        const grad = ctx.createLinearGradient(x, y, x, y + height);
        grad.addColorStop(0, color1);
        grad.addColorStop(0.5, color2);
        grad.addColorStop(1, color1);
        ctx.fillStyle = grad;
        
        roundRect(ctx, fx, y, fw, height, radius);
        ctx.fill();
        
        const gloss = ctx.createLinearGradient(x, y, x, y + height * 0.4);
        gloss.addColorStop(0, 'rgba(255,255,255,0.4)');
        gloss.addColorStop(1, 'rgba(255,255,255,0.05)');
        ctx.fillStyle = gloss;
        ctx.fillRect(fx, y, fw, height * 0.4);

        ctx.restore();
    }
    
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, width, height, radius);
    ctx.stroke();
    
    ctx.restore();
}

function drawCircularAvatar(ctx, img, cx, cy, radius, borderColor, borderWidth, isActive, isDead) {
    ctx.save();

    if (isActive && !isDead) {
        ctx.shadowColor = borderColor;
        ctx.shadowBlur = 40;
        ctx.beginPath();
        ctx.arc(cx, cy, radius + borderWidth + 6, 0, Math.PI * 2);
        ctx.fillStyle = borderColor;
        ctx.fill();
        ctx.shadowBlur = 0;
    }

    ctx.beginPath();
    ctx.arc(cx, cy, radius + borderWidth, 0, Math.PI * 2);
    const borderGrad = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
    if (isDead) {
        borderGrad.addColorStop(0, '#555555');
        borderGrad.addColorStop(1, '#222222');
    } else {
        borderGrad.addColorStop(0, '#c9a84c');
        borderGrad.addColorStop(0.3, '#fffac1');
        borderGrad.addColorStop(0.5, '#f5e6a3');
        borderGrad.addColorStop(1, '#8b6914');
    }
    ctx.fillStyle = borderGrad;
    ctx.fill();
    ctx.strokeStyle = isDead ? '#111111' : '#6d5510';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();

    if (img) {
        const aspect = img.width / img.height;
        let drawW = radius * 2;
        let drawH = radius * 2;
        let drawX = cx - radius;
        let drawY = cy - radius;

        if (aspect > 1) {
            drawW = radius * 2 * aspect;
            drawX = cx - drawW / 2;
        } else if (aspect < 1) {
            drawH = radius * 2 / aspect;
            drawY = cy - drawH / 2;
        }
        
        if (isDead) {
            ctx.filter = 'grayscale(100%) brightness(50%)';
        }
        ctx.drawImage(img, drawX, drawY, drawW, drawH);
        ctx.filter = 'none';
    } else {
        ctx.fillStyle = '#1a1a2e';
        ctx.fill();
    }
    ctx.restore();
}

function drawOrnatePanel(ctx, x, y, w, h, opacity, borderColor) {
    ctx.save();
    const panelGrad = ctx.createLinearGradient(x, y, x, y + h);
    panelGrad.addColorStop(0, `rgba(10, 10, 35, ${opacity || 0.8})`);
    panelGrad.addColorStop(1, `rgba(5, 5, 15, ${opacity || 0.85})`);
    
    roundRect(ctx, x, y, w, h, 14);
    ctx.fillStyle = panelGrad;
    ctx.fill();
    
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = borderColor || '#3d3d5c';
    ctx.stroke();
    
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    roundRect(ctx, x+3, y+3, w-6, h-6, 11);
    ctx.stroke();
    
    ctx.restore();
}

function drawFittedText(ctx, text, x, y, maxWidth, maxSize, minSize) {
    let size = maxSize;
    ctx.font = `bold ${size}px "Bein"`;
    while (ctx.measureText(text).width > maxWidth && size > (minSize || 10)) {
        size--;
        ctx.font = `bold ${size}px "Bein"`;
    }
    ctx.fillText(text, x, y);
}

function getActiveEffects(player) {
    const effects = [];
    const effs = player.effects;
    if (!effs) return effects;

    if (effs.stun || effs.freeze) effects.push({ icon: 'شلل', color: '#f1c40f' });
    if (effs.poison > 0) effects.push({ icon: 'تسمم', color: '#9b59b6' });
    if (effs.burn > 0) effects.push({ icon: 'حرق', color: '#e67e22' });
    if (effs.weaken > 0) effects.push({ icon: 'ضعف', color: '#e74c3c' });
    if (effs.buff > 0) effects.push({ icon: 'قوة', color: '#2ecc71' });
    if (effs.rebound_active > 0) effects.push({ icon: 'عاكس', color: '#3498db' });
    if (effs.confusion) effects.push({ icon: 'ارتباك', color: '#e056a0' });
    if (effs.blind > 0) effects.push({ icon: 'عمى', color: '#95a5a6' });
    if (effs.evasion > 0) effects.push({ icon: 'مراوغة', color: '#1abc9c' });
    return effects;
}

function detectActionVFX(logLine) {
    if (!logLine || logLine.length === 0) return null;
    if (logLine.includes('مات') || logLine.includes('هزم') || logLine.includes('قضى') || logLine.includes('قتل')) return 'death';
    if (logLine.includes('حرق') || logLine.includes('أحرق') || logLine.includes('ناري')) return 'skill_fire';
    if (logLine.includes('سم') || logLine.includes('تسمم') || logLine.includes('نزيف') || logLine.includes('مسموم')) return 'skill_poison';
    if (logLine.includes('درع') || logLine.includes('تحصن') || logLine.includes('دفاع') || logLine.includes('تحصين') || logLine.includes('امتص')) return 'skill_shield';
    if (logLine.includes('شفى') || logLine.includes('استعاد') || logLine.includes('عالج')) return 'skill_heal';
    if (logLine.includes('جليد') || logLine.includes('تجمد') || logLine.includes('شلل') || logLine.includes('تجميد')) return 'skill_ice';
    if (logLine.includes('ارتباك') || logLine.includes('طيف') || logLine.includes('فوضى') || logLine.includes('مراوغة') || logLine.includes('أربك') || logLine.includes('عمى') || logLine.includes('ظلام')) return 'skill_dark';
    if (logLine.includes('قوة') || logLine.includes('رفع') || logLine.includes('تعزيز') || logLine.includes('طهر') || logLine.includes('إزالة') || logLine.includes('تطهير') || logLine.includes('نظف')) return 'use_skill_icon';
    if (logLine.includes('ضرر') || logLine.includes('هاجم') || logLine.includes('سهم') || logLine.includes('ضرب') || logLine.includes('عاقب')) return 'attack';
    return null;
}

async function getSkillIdFromLog(logLine, players) {
    if (!logLine) return null;
    
    for (const id of Object.keys(SKILL_IMAGES)) {
        if (logLine.includes('🔥') || logLine.includes('🐲') || logLine.includes('ناري') || logLine.includes('أحرق')) { return 'race_dragon_skill'; }
        if (logLine.includes('🛡️') || logLine.includes('درع') || logLine.includes('تحصن')) { return 'skill_shielding'; }
        if (logLine.includes('❤️') || logLine.includes('💖') || logLine.includes('عالج') || logLine.includes('استعاد') || logLine.includes('شفى')) { return 'skill_healing'; }
        if (logLine.includes('☠️') || logLine.includes('سم') || logLine.includes('نزيف') || logLine.includes('تسمم')) { return 'skill_poison'; }
        if (logLine.includes('😵') || logLine.includes('ارتباك') || logLine.includes('فوضى') || logLine.includes('طيف')) { return 'skill_dark'; }
        if (logLine.includes('💪') || logLine.includes('قوة') || logLine.includes('تعزيز') || logLine.includes('رفع')) { return 'skill_buffing'; }
        if (logLine.includes('✨') || logLine.includes('طهر') || logLine.includes('نظف') || logLine.includes('تطهير')) { return 'skill_cleanse'; }
        if (logLine.includes('💨') || logLine.includes('بدد') || logLine.includes('إزالة')) { return 'skill_dispel'; }
        if (logLine.includes('🔄') || logLine.includes('انعكاس') || logLine.includes('ارتداد') || logLine.includes('عكس')) { return 'skill_rebound'; }
        if (logLine.includes('👻') || logLine.includes('مراوغة') || logLine.includes('اختفى')) { return 'skill_dark'; }
    }

    if (players) {
        for (const p of players) {
            if (p.skills) {
                for (const s of Object.values(p.skills)) {
                    if (logLine.includes(s.name)) return s.id;
                }
            }
        }
    }

    if (logLine.includes('ضرر') || logLine.includes('هاجم') || logLine.includes('سهم') || logLine.includes('ضرب') || logLine.includes('عاقب')) {
        return 'attack';
    }

    return null;
}

function getRawRace(player) {
    if (player.isMonster) return player.raceName || player.race || 'Monster';
    return player.raceName || player.race || player.weapon?.raceName || 'Human';
}

function getRaceName(player) {
    const rawRace = getRawRace(player);
    return RACE_AR[rawRace] || rawRace;
}

async function generatePvPImage(battleState) {
    try {
        const W = 1200, H = 760;
        const canvas = createCanvas(W, H);
        const ctx = canvas.getContext('2d');

        const players = Array.from(battleState.players.values());
        if (players.length < 2) return null;

        const p1 = players[0];
        const p2 = players[1];
        const activeTurnId = battleState.turn ? battleState.turn[0] : null;
        const p1Id = p1.isMonster ? "monster" : (p1.member?.user?.id || "p1");
        const p2Id = p2.isMonster ? "monster" : (p2.member?.user?.id || "p2");
        const isP1Active = (p1Id === activeTurnId);
        const isP2Active = (p2Id === activeTurnId);
        const p1Dead = p1.hp <= 0;
        const p2Dead = p2.hp <= 0;

        let p1MaxShield = shieldCache.get(p1Id) || 0;
        if (p1.effects?.shield > p1MaxShield) p1MaxShield = p1.effects.shield;
        if (!p1.effects?.shield || p1.effects.shield <= 0) p1MaxShield = 0;
        shieldCache.set(p1Id, p1MaxShield);

        let p2MaxShield = shieldCache.get(p2Id) || 0;
        if (p2.effects?.shield > p2MaxShield) p2MaxShield = p2.effects.shield;
        if (!p2.effects?.shield || p2.effects.shield <= 0) p2MaxShield = 0;
        shieldCache.set(p2Id, p2MaxShield);

        const fallbackPlayer = 'https://i.postimg.cc/WzRGhgJ9/mwraks.png';
        const fallbackMonster = `${R2_URL}/monster.png`;

        const p1Url = p1.isMonster ? (p1.image || fallbackMonster) : (p1.member?.user?.displayAvatarURL({ extension: 'png', size: 512, forceStatic: true }) || fallbackPlayer);
        const p2Url = p2.isMonster ? (p2.image || fallbackMonster) : (p2.member?.user?.displayAvatarURL({ extension: 'png', size: 512, forceStatic: true }) || fallbackPlayer);

        // تحميل الصور بأمان وبدون كاش لتجنب الانفجار (OOM)
        const [bgImg, p1Avatar, p2Avatar, vsPanelImg] = await Promise.all([
            getSafeImage(`${R2_URL}/pvp_arena_bg.png`, 'pvp_arena_bg.png'),
            getSafeImage(p1Url, null),
            getSafeImage(p2Url, null),
            getSafeImage('https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev/images/pvp/pvp_log_panel.png', 'pvp_log_panel.png')
        ]);

        if (bgImg) {
            ctx.drawImage(bgImg, 0, 0, W, H);
            ctx.fillStyle = 'rgba(5, 5, 20, 0.65)';
            ctx.fillRect(0, 0, W, H);
        } else {
            const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
            bgGrad.addColorStop(0, '#0a0a1e');
            bgGrad.addColorStop(0.5, '#12122e');
            bgGrad.addColorStop(1, '#0a0a14');
            ctx.fillStyle = bgGrad;
            ctx.fillRect(0, 0, W, H);
        }
        
        const vignette = ctx.createRadialGradient(W/2, H/2, W/4, W/2, H/2, W/1.1);
        vignette.addColorStop(0, 'rgba(0,0,0,0)');
        vignette.addColorStop(1, 'rgba(0,0,0,0.85)');
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, W, H);

        const panelW = 460, panelH = 370; 
        const p1PanelX = 35, panelY = 40;
        const p2PanelX = W - panelW - 35;

        drawOrnatePanel(ctx, p1PanelX, panelY, panelW, panelH, 0.8, isP1Active ? '#4fc3f7' : '#2a2a4a');
        drawOrnatePanel(ctx, p2PanelX, panelY, panelW, panelH, 0.8, isP2Active ? '#ef5350' : '#2a2a4a');

        const avatarRadius = 65;
        const p1AvatarCX = p1PanelX + 90;
        const p1AvatarCY = panelY + 95;
        const p2AvatarCX = p2PanelX + panelW - 90;
        const p2AvatarCY = panelY + 95;

        ctx.save();
        const infoW = 280;
        const infoH = 96;
        
        const infoX1 = p1AvatarCX + 10;
        const infoY1 = p1AvatarCY - infoH / 2;
        const panelGrad1 = ctx.createLinearGradient(infoX1, infoY1, infoX1, infoY1 + infoH);
        panelGrad1.addColorStop(0, 'rgba(10, 10, 35, 0.85)');
        panelGrad1.addColorStop(1, 'rgba(5, 5, 15, 0.95)');
        roundRect(ctx, infoX1, infoY1, infoW, infoH, 12);
        ctx.fillStyle = panelGrad1;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = isP1Active ? '#4fc3f7' : '#3d3d5c';
        ctx.stroke();

        const infoX2 = p2AvatarCX - 10 - infoW;
        const infoY2 = p2AvatarCY - infoH / 2;
        const panelGrad2 = ctx.createLinearGradient(infoX2, infoY2, infoX2, infoY2 + infoH);
        panelGrad2.addColorStop(0, 'rgba(10, 10, 35, 0.85)');
        panelGrad2.addColorStop(1, 'rgba(5, 5, 15, 0.95)');
        roundRect(ctx, infoX2, infoY2, infoW, infoH, 12);
        ctx.fillStyle = panelGrad2;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = isP2Active ? '#ef5350' : '#3d3d5c';
        ctx.stroke();
        ctx.restore();

        drawCircularAvatar(ctx, p1Avatar, p1AvatarCX, p1AvatarCY, avatarRadius, '#4fc3f7', 5, isP1Active, p1Dead);
        drawCircularAvatar(ctx, p2Avatar, p2AvatarCX, p2AvatarCY, avatarRadius, '#ef5350', 5, isP2Active, p2Dead);

        const p1Name = p1.isMonster ? (p1.name || 'وحش أعماق') : (p1.member?.user?.displayName || p1.member?.user?.username || 'مقاتل');
        const p2Name = p2.isMonster ? (p2.name || 'وحش أعماق') : (p2.member?.user?.displayName || p2.member?.user?.username || 'مقاتل');
        const p1RaceText = getRaceName(p1);
        const p2RaceText = getRaceName(p2);

        const p1WeaponText = p1.isMonster ? (p1.weapon?.name || 'مخالب وأنياب') : (p1.weapon?.name || 'بدون سلاح');
        const p2WeaponText = p2.isMonster ? (p2.weapon?.name || 'مخالب وأنياب') : (p2.weapon?.name || 'بدون سلاح');

        ctx.textAlign = 'left';
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 4;
        drawFittedText(ctx, p1Name, p1AvatarCX + 85, p1AvatarCY - 18, 190, 24, 14);
        ctx.shadowBlur = 0;
        
        ctx.fillStyle = '#f1c40f';
        ctx.font = 'bold 15px "Bein"';
        ctx.fillText(`المستوى: ${p1.level || '؟'} | العرق: ${p1RaceText}`, p1AvatarCX + 85, p1AvatarCY + 8);
        
        ctx.fillStyle = '#aaaaac';
        ctx.font = 'bold 14px "Bein"';
        ctx.fillText(`🗡️ ${p1WeaponText}`, p1AvatarCX + 85, p1AvatarCY + 32);

        ctx.textAlign = 'right';
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 4;
        drawFittedText(ctx, p2Name, p2AvatarCX - 85, p2AvatarCY - 18, 190, 24, 14);
        ctx.shadowBlur = 0;
        
        ctx.fillStyle = '#f1c40f';
        ctx.font = 'bold 15px "Bein"';
        ctx.fillText(`المستوى: ${p2.level || '؟'} | العرق: ${p2RaceText}`, p2AvatarCX - 85, p2AvatarCY + 8);
        
        ctx.fillStyle = '#aaaaac';
        ctx.font = 'bold 14px "Bein"';
        ctx.fillText(`${p2WeaponText} 🗡️`, p2AvatarCX - 85, p2AvatarCY + 32);

        const barW = 390, hpBarH = 26, shBarH = 14;
        const p1BarX = p1PanelX + 35;
        const p1BarY = panelY + 185;
        const p2BarX = p2PanelX + panelW - 35 - barW;
        const p2BarY = panelY + 185;

        const p1Pct = Math.max(0, Math.min(1, p1.hp / Math.max(1, p1.maxHp)));
        const p2Pct = Math.max(0, Math.min(1, p2.hp / Math.max(1, p2.maxHp)));

        const getHPColors = (pct) => {
            if (pct > 0.6) return ['#2ecc71', '#1e8449'];
            if (pct > 0.3) return ['#f39c12', '#b7760b'];
            return ['#e74c3c', '#922b21'];
        };

        const [p1c1, p1c2] = getHPColors(p1Pct);
        const [p2c1, p2c2] = getHPColors(p2Pct);

        drawHPBar(ctx, p1BarX, p1BarY, barW, hpBarH, p1Pct, p1c1, p1c2, 6, false);
        ctx.fillStyle = '#ffffff'; ctx.font = 'bold 16px "Bein"'; ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 3;
        ctx.fillText(`${Math.floor(p1.hp)} / ${p1.maxHp}`, p1BarX + barW / 2, p1BarY + hpBarH - 5);
        ctx.shadowBlur = 0;

        drawHPBar(ctx, p2BarX, p2BarY, barW, hpBarH, p2Pct, p2c1, p2c2, 6, true);
        ctx.fillStyle = '#ffffff'; ctx.font = 'bold 16px "Bein"'; ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 3;
        ctx.fillText(`${Math.floor(p2.hp)} / ${p2.maxHp}`, p2BarX + barW / 2, p2BarY + hpBarH - 5);
        ctx.shadowBlur = 0;

        const p1ShieldVal = p1.effects && p1.effects.shield ? p1.effects.shield : 0;
        const p2ShieldVal = p2.effects && p2.effects.shield ? p2.effects.shield : 0;
        
        if (p1ShieldVal > 0) {
            const p1SPct = Math.min(1, p1ShieldVal / Math.max(1, p1MaxShield));
            drawStatusBar(ctx, p1BarX, p1BarY + hpBarH + 12, barW * 0.65, shBarH, p1SPct, '#3498db', '#1c6ca1', 4, false);
            ctx.fillStyle = '#aaddff'; ctx.font = 'bold 13px "Bein"'; ctx.textAlign = 'left';
            ctx.fillText(`${Math.floor(p1ShieldVal)}`, p1BarX + barW * 0.65 + 8, p1BarY + hpBarH + 24);
        }
        if (p2ShieldVal > 0) {
            const p2SPct = Math.min(1, p2ShieldVal / Math.max(1, p2MaxShield));
            drawStatusBar(ctx, p2BarX + barW - (barW * 0.65), p2BarY + hpBarH + 12, barW * 0.65, shBarH, p2SPct, '#3498db', '#1c6ca1', 4, true);
            ctx.fillStyle = '#aaddff'; ctx.font = 'bold 13px "Bein"'; ctx.textAlign = 'right';
            ctx.fillText(`${Math.floor(p2ShieldVal)}`, p2BarX + barW - (barW * 0.65) - 8, p2BarY + hpBarH + 24);
        }

        const drawEffectBadges = (effects, startX, y, alignRight) => {
            if (effects.length === 0) return;
            const badgeW = 65, badgeH = 28, gap = 8, radius = 6;
            let x = alignRight ? startX - (effects.length * (badgeW + gap)) : startX;

            effects.forEach(eff => {
                ctx.save();
                roundRect(ctx, x, y, badgeW, badgeH, radius);
                ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
                ctx.fill();
                ctx.lineWidth = 1.5;
                ctx.strokeStyle = eff.color;
                ctx.stroke();

                ctx.shadowColor = eff.color;
                ctx.shadowBlur = 4;

                ctx.textAlign = 'center';
                ctx.font = 'bold 15px "Bein"';
                ctx.fillStyle = eff.color;
                ctx.fillText(eff.icon, x + badgeW / 2, y + badgeH - 7);
                ctx.restore();

                x += badgeW + gap;
            });
        };

        const effectsY = panelY + 265;
        const p1Effects = getActiveEffects(p1);
        const p2Effects = getActiveEffects(p2);
        drawEffectBadges(p1Effects, p1PanelX + 30, effectsY, false);
        drawEffectBadges(p2Effects, p2PanelX + panelW - 30, effectsY, true);

        const drawMiniStats = (player, x, y, align) => {
            ctx.textAlign = align;
            ctx.font = 'bold 16px "Bein"';
            const dmg = player.weapon?.currentDamage || 0;
            ctx.fillStyle = '#e74c3c';
            ctx.fillText(`هجوم ${dmg}`, x, y);
        };

        drawMiniStats(p1, p1PanelX + 30, panelY + 325, 'left');
        drawMiniStats(p2, p2PanelX + panelW - 30, panelY + 325, 'right');

        const lastLogLine = (battleState.log || []).slice(-1)[0] || '';
        let vfxType = detectActionVFX(lastLogLine);
        
        let casterIsP1 = true;
        const p1NameIndex = lastLogLine.indexOf(p1Name);
        const p2NameIndex = lastLogLine.indexOf(p2Name);
        if (p1NameIndex !== -1 && p2NameIndex !== -1) {
            casterIsP1 = p1NameIndex < p2NameIndex;
        } else if (p2NameIndex !== -1) {
            casterIsP1 = false;
        } else if (p1NameIndex !== -1) {
            casterIsP1 = true;
        } else {
            casterIsP1 = !isP1Active;
        }

        let targetPanelX = p1PanelX;
        if (p1Dead) { vfxType = 'death'; targetPanelX = p1PanelX; }
        else if (p2Dead) { vfxType = 'death'; targetPanelX = p2PanelX; }
        else if (vfxType) {
            if (['skill_heal', 'skill_shield', 'use_skill_icon'].includes(vfxType)) {
                targetPanelX = casterIsP1 ? p1PanelX : p2PanelX;
            } else {
                targetPanelX = casterIsP1 ? p2PanelX : p1PanelX;
            }
        }

        if (vfxType) {
            if (vfxType === 'use_skill_icon') {
                const logSkillId = await getSkillIdFromLog(lastLogLine, players);
                if (logSkillId && SKILL_IMAGES[logSkillId]) {
                    const skillVfxImg = await getSafeImage(`${R2_SKILLS}/${SKILL_IMAGES[logSkillId]}`, SKILL_IMAGES[logSkillId]);
                    if (skillVfxImg) {
                        ctx.save();
                        const vfxShift = targetPanelX === p1PanelX ? 40 : -40;
                        const vfxCX = targetPanelX + panelW / 2 + vfxShift;
                        const vfxCY = panelY + panelH / 2 + 10;
                        
                        ctx.shadowColor = '#f1c40f';
                        ctx.shadowBlur = 50;
                        ctx.globalAlpha = 0.95;
                        const drawW = 220; 
                        const drawH = 220;
                        ctx.drawImage(skillVfxImg, vfxCX - drawW / 2, vfxCY - drawH / 2, drawW, drawH);
                        ctx.restore();
                    }
                }
            } else if (VFX_FILES[vfxType]) {
                const vfxImg = await getSafeImage(`${R2_VFX}/${VFX_FILES[vfxType]}`, VFX_FILES[vfxType]);
                if (vfxImg) {
                    ctx.save();
                    ctx.globalCompositeOperation = 'screen';
                    const vfxShift = targetPanelX === p1PanelX ? 40 : -40;
                    const vfxCX = targetPanelX + panelW / 2 + vfxShift;
                    const vfxCY = panelY + panelH / 2 + 10;
                    
                    const aspect = vfxImg.width / vfxImg.height;
                    let drawW = 380; 
                    let drawH = drawW / aspect;
                    
                    ctx.drawImage(vfxImg, vfxCX - drawW / 2, vfxCY - drawH / 2, drawW, drawH);
                    ctx.restore();
                }
            }

            const numMatch = lastLogLine.match(/\d+/);
            if (numMatch) {
                const val = numMatch[0];
                let isHeal = false;
                if (['skill_heal', 'use_skill_icon', 'skill_shield'].includes(vfxType)) isHeal = true;
                if (lastLogLine.includes('حرق') || lastLogLine.includes('سم') || lastLogLine.includes('ضرر') || lastLogLine.includes('هاجم')) isHeal = false;
                if (lastLogLine.includes('استعاد') || lastLogLine.includes('عالج') || lastLogLine.includes('رفع')) isHeal = true;

                const floatText = isHeal ? `+${val}` : `-${val}`;
                const floatColor = isHeal ? '#2ecc71' : '#e74c3c';
                
                const floatCX = targetPanelX + panelW / 2 + (targetPanelX === p1PanelX ? 40 : -40);
                const floatCY = panelY + panelH / 2 - 80;
                
                ctx.save();
                ctx.font = 'bold 50px "Bein"';
                ctx.textAlign = 'center';
                ctx.fillStyle = floatColor;
                ctx.shadowColor = 'rgba(0,0,0,0.9)';
                ctx.shadowBlur = 12;
                ctx.strokeStyle = '#050510';
                ctx.lineWidth = 6;
                ctx.strokeText(floatText, floatCX, floatCY);
                ctx.fillText(floatText, floatCX, floatCY);
                ctx.restore();
            }
        }

        const centerX = W / 2;
        const vsCenterY = 110; 

        if (vsPanelImg) {
            ctx.save();
            const aspect = vsPanelImg.width / vsPanelImg.height;
            const vsW = 125;
            const vsH = vsW / aspect;
            ctx.drawImage(vsPanelImg, centerX - vsW / 2, vsCenterY - vsH / 2, vsW, vsH);
            ctx.restore();
        }

        const turnColor = isP1Active ? '#4fc3f7' : '#ef5350';
        const turnName = isP1Active ? p1Name : p2Name;
        
        const turnBoxY = vsCenterY + 75;
        drawOrnatePanel(ctx, centerX - 80, turnBoxY, 160, 38, 0.9, turnColor);
        ctx.fillStyle = '#aaaaac';
        ctx.font = 'bold 12px "Bein"';
        ctx.textAlign = 'center';
        ctx.fillText('الدور', centerX, turnBoxY + 14);
        ctx.fillStyle = turnColor;
        drawFittedText(ctx, turnName, centerX, turnBoxY + 31, 140, 16, 12);

        if (!battleState.isPvE && battleState.bet) {
            const betBoxY = turnBoxY + 46;
            drawOrnatePanel(ctx, centerX - 80, betBoxY, 160, 38, 0.9, '#f1c40f');
            ctx.fillStyle = '#aaaaac';
            ctx.font = 'bold 12px "Bein"';
            ctx.textAlign = 'center';
            ctx.fillText('الرهان', centerX, betBoxY + 14);
            ctx.fillStyle = '#f1c40f';
            drawFittedText(ctx, (battleState.bet * 2).toLocaleString(), centerX, betBoxY + 31, 140, 18, 12);
        }

        const logPanelY = 430;
        const logPanelH = H - logPanelY - 20;

        drawOrnatePanel(ctx, 30, logPanelY, W - 60, logPanelH, 0.85, '#2a2a4a');

        ctx.save();
        roundRect(ctx, W/2 - 100, logPanelY - 18, 200, 36, 12);
        ctx.fillStyle = '#0a0a25';
        ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = '#c9a84c'; ctx.stroke();
        
        ctx.textAlign = 'center';
        ctx.font = 'bold 20px "Bein"';
        const logTitleGrad = ctx.createLinearGradient(0, logPanelY - 18, 0, logPanelY + 18);
        logTitleGrad.addColorStop(0, '#fffac1'); logTitleGrad.addColorStop(1, '#c9a84c');
        ctx.fillStyle = logTitleGrad;
        ctx.fillText('سجل المعركة', W/2, logPanelY + 9);
        ctx.restore();

        const p1Logs = (battleState.log || []).filter(l => l.includes(p1Name) || (!l.includes(p2Name) && isP1Active)).slice(-6);
        const p2Logs = (battleState.log || []).filter(l => l.includes(p2Name) || (!l.includes(p1Name) && isP2Active)).slice(-6);
        
        const drawLogs = async (logs, xCenter, maxW, nameToRemove) => {
            let logY = logPanelY + 50;
            const logLineHeight = 38;
            ctx.textAlign = 'center';
            
            for (let idx = 0; idx < logs.length; idx++) {
                const logLine = logs[idx];
                let clean = cleanText(logLine);
                clean = clean.replace(new RegExp(nameToRemove, 'g'), '').trim();

                const alpha = logs.length > 1 ? 0.4 + (idx / (logs.length - 1)) * 0.6 : 1;
                ctx.font = 'bold 22px "Bein"';
                ctx.fillStyle = `rgba(240, 240, 255, ${alpha})`;
                
                let displayText = clean;
                while (ctx.measureText(displayText).width > maxW - 50 && displayText.length > 10) {
                    displayText = displayText.substring(0, displayText.length - 2) + '..';
                }

                const logSkillId = await getSkillIdFromLog(logLine, players);
                
                let iconToDraw = null;
                if (logSkillId === 'attack') {
                    let attacker = null;
                    if (logLine.includes(p1Name) && !logLine.includes(p2Name)) attacker = p1;
                    else if (logLine.includes(p2Name) && !logLine.includes(p1Name)) attacker = p2;
                    else attacker = isP1Active ? p1 : p2;
                    
                    if (attacker) {
                        const rawRace = getRawRace(attacker);
                        if (WEAPON_FILES[rawRace]) {
                            iconToDraw = await getSafeImage(`${R2_WEAPON}/${WEAPON_FILES[rawRace]}`, WEAPON_FILES[rawRace]);
                        }
                    }
                } else if (logSkillId && SKILL_IMAGES[logSkillId]) {
                    iconToDraw = await getSafeImage(`${R2_SKILLS}/${SKILL_IMAGES[logSkillId]}`, SKILL_IMAGES[logSkillId]);
                }
                
                if (iconToDraw) {
                    const iconSize = 42;
                    const textWidth = ctx.measureText(displayText).width;
                    const totalWidth = textWidth + iconSize + 12;
                    const startX = xCenter - totalWidth / 2;
                    
                    ctx.drawImage(iconToDraw, startX, logY - 30, iconSize, iconSize);
                    ctx.fillText(displayText, startX + iconSize + 12 + textWidth/2, logY);
                } else {
                    ctx.fillText(displayText, xCenter, logY);
                }
                logY += logLineHeight;
            }
        };

        const leftCenter = 30 + panelW / 2;
        const rightCenter = (W - 30 - panelW) + panelW / 2;

        await drawLogs(p1Logs, leftCenter, panelW, p1Name);
        await drawLogs(p2Logs, rightCenter, panelW, p2Name);

        const bigSkillId = await getSkillIdFromLog(lastLogLine, players);
        if (bigSkillId) {
            let bigImgToDraw = null;
            if (bigSkillId === 'attack') {
                const attacker = casterIsP1 ? p1 : p2;
                const rawRace = getRawRace(attacker);
                if (WEAPON_FILES[rawRace]) {
                    bigImgToDraw = await getSafeImage(`${R2_WEAPON}/${WEAPON_FILES[rawRace]}`, WEAPON_FILES[rawRace]);
                }
            } else if (SKILL_IMAGES[bigSkillId]) {
                bigImgToDraw = await getSafeImage(`${R2_SKILLS}/${SKILL_IMAGES[bigSkillId]}`, SKILL_IMAGES[bigSkillId]);
            }

            if (bigImgToDraw) {
                const iconRadius = 100;
                const iconCY = logPanelY + logPanelH / 2 + 10;
                ctx.save();
                
                ctx.beginPath();
                ctx.arc(centerX, iconCY, iconRadius + 4, 0, Math.PI * 2);
                ctx.strokeStyle = '#c9a84c';
                ctx.lineWidth = 4;
                ctx.stroke();
                
                ctx.beginPath();
                ctx.arc(centerX, iconCY, iconRadius, 0, Math.PI * 2);
                ctx.clip();
                
                ctx.globalAlpha = 1.0;
                ctx.drawImage(bigImgToDraw, centerX - iconRadius, iconCY - iconRadius, iconRadius * 2, iconRadius * 2);
                ctx.restore();
            }
        }

        const activeColor = isP1Active ? 'rgba(79, 195, 247,' : 'rgba(239, 83, 80,';
        const topBar = ctx.createLinearGradient(0, 0, W, 0);
        
        topBar.addColorStop(0, `${activeColor} 0)`);
        topBar.addColorStop(0.3, `${activeColor} 0.7)`);
        topBar.addColorStop(0.5, `${activeColor} 1)`);
        topBar.addColorStop(0.7, `${activeColor} 0.7)`);
        topBar.addColorStop(1, `${activeColor} 0)`);
        
        ctx.fillStyle = topBar;
        ctx.fillRect(0, 0, W, 6);
        ctx.fillRect(0, H - 6, W, 6);

        return canvas.toBuffer('image/png');
    } catch (error) {
        return null;
    }
}

module.exports = { generatePvPImage };
