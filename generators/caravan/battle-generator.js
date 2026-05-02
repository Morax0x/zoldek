'use strict';

const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');
const fs   = require('fs');

try {
    GlobalFonts.registerFromPath(path.join(process.cwd(), 'fonts', 'bein-ar-normal.ttf'), 'Bein');
} catch (e) {}

const R2_BASE = 'https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev';
const R2_PVP  = `${R2_BASE}/images/pvp`;
const R2_VFX  = `${R2_BASE}/images/vfx`;

const IMAGE_TIMEOUT = 6000;
const staticImageCache = new Map();

async function loadImageSafe(url) {
    if (!url) return null;
    if (staticImageCache.has(url)) return staticImageCache.get(url);
    try {
        const img = await Promise.race([
            loadImage(url),
            new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), IMAGE_TIMEOUT)),
        ]);
        staticImageCache.set(url, img);
        return img;
    } catch { return null; }
}

async function loadAvatar(member) {
    if (!member) return null;
    try {
        const url = member.user?.displayAvatarURL({ extension: 'png', size: 256, forceStatic: true });
        if (url) return await loadImageSafe(url);
    } catch {}
    return null;
}

// ─── Drawing Helpers ───────────────────────────────────────────────────────────

function rr(ctx, x, y, w, h, r = 12) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y,     x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x,     y + h, r);
    ctx.arcTo(x,     y + h, x,     y,     r);
    ctx.arcTo(x,     y,     x + w, y,     r);
    ctx.closePath();
}

function panel(ctx, x, y, w, h, border, opacity = 0.82, radius = 14) {
    ctx.save();
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, `rgba(10,10,30,${opacity})`);
    g.addColorStop(1, `rgba(4,4,14,${opacity + 0.05})`);
    rr(ctx, x, y, w, h, radius);
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = border; ctx.stroke();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    rr(ctx, x + 3, y + 3, w - 6, h - 6, radius - 2); ctx.stroke();
    ctx.restore();
}

function hpBar(ctx, x, y, w, h, pct, r1, r2, radius = 6, rtl = false) {
    ctx.save();
    rr(ctx, x - 3, y - 3, w + 6, h + 6, radius + 2);
    ctx.fillStyle = '#08080f'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#1e1e30'; ctx.stroke();

    rr(ctx, x, y, w, h, radius);
    ctx.fillStyle = '#020207'; ctx.fill();

    const fw = Math.max(0, w * Math.min(1, pct));
    if (fw > 0) {
        ctx.save();
        rr(ctx, x, y, w, h, radius); ctx.clip();
        const grad = ctx.createLinearGradient(x, y, x, y + h);
        grad.addColorStop(0, r1); grad.addColorStop(0.5, r2); grad.addColorStop(1, r1);
        ctx.fillStyle = grad;
        const fx = rtl ? x + w - fw : x;
        rr(ctx, fx, y, fw, h, radius); ctx.fill();
        const gloss = ctx.createLinearGradient(x, y, x, y + h * 0.4);
        gloss.addColorStop(0, 'rgba(255,255,255,0.35)');
        gloss.addColorStop(1, 'rgba(255,255,255,0.04)');
        ctx.fillStyle = gloss; ctx.fillRect(fx, y, fw, h * 0.4);
        ctx.restore();
    }
    ctx.restore();
}

function circleAvatar(ctx, img, cx, cy, r, border, isDead = false) {
    ctx.save();
    // glow ring for alive
    if (!isDead) {
        ctx.shadowColor = border; ctx.shadowBlur = 28;
        ctx.beginPath(); ctx.arc(cx, cy, r + 7, 0, Math.PI * 2);
        ctx.fillStyle = border + '33'; ctx.fill();
        ctx.shadowBlur = 0;
    }
    // outer ring
    ctx.beginPath(); ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
    const bg = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    if (isDead) {
        bg.addColorStop(0, '#444'); bg.addColorStop(1, '#222');
    } else {
        bg.addColorStop(0, '#c9a84c'); bg.addColorStop(0.4, '#fff9a0');
        bg.addColorStop(1, '#8b6914');
    }
    ctx.fillStyle = bg; ctx.fill();
    // clip & draw avatar
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
    if (img) {
        if (isDead) ctx.filter = 'grayscale(100%) brightness(45%)';
        const asp = img.width / img.height;
        let dw = r * 2, dh = r * 2;
        if (asp > 1) { dw = r * 2 * asp; } else { dh = r * 2 / asp; }
        ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);
        ctx.filter = 'none';
    } else {
        ctx.fillStyle = '#1a1a2e'; ctx.fill();
    }
    ctx.restore();
}

function text(ctx, txt, x, y, size, color, align = 'center') {
    ctx.save();
    ctx.font = `bold ${size}px "Bein"`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillText(String(txt || ''), x, y);
    ctx.restore();
}

function hpColors(pct) {
    if (pct > 0.6) return ['#2ecc71', '#1a8a44'];
    if (pct > 0.3) return ['#f39c12', '#b06a00'];
    return ['#e74c3c', '#8b1a1a'];
}

const CLASS_ICONS = {
    Leader: '👑', Tank: '🛡️', Priest: '✨', Mage: '🔮', Summoner: '🐺',
};

// ─── Main Generator ────────────────────────────────────────────────────────────

/**
 * Generates a caravan battle image.
 * @param {Object[]} players    - Array of player objects (max 3)
 * @param {Object}   enemy      - Enemy object { name, hp, maxHp, isBoss }
 * @param {Object}   caravan    - Caravan object { hp, maxHp }
 * @param {number}   waveNum    - Current wave number (1-5)
 * @param {string[]} log        - Battle log lines
 * @param {string[]} actedIds   - Player IDs that already acted this round
 * @param {string}   hostId     - Owner's Discord user ID
 * @param {Object}   guild      - Discord guild object (to fetch avatars)
 */
async function generateCaravanBattleImage(players, enemy, caravan, waveNum, log, actedIds = [], hostId = null, guild = null) {
    try {
        const W = 1200, H = 800;
        const canvas = createCanvas(W, H);
        const ctx = canvas.getContext('2d');

        // ── Background ────────────────────────────────────────────────────────
        const bgImg = await loadImageSafe(`${R2_PVP}/pvp_arena_bg.png`);
        if (bgImg) {
            ctx.drawImage(bgImg, 0, 0, W, H);
            ctx.fillStyle = 'rgba(4,4,18,0.72)'; ctx.fillRect(0, 0, W, H);
        } else {
            const bg = ctx.createLinearGradient(0, 0, 0, H);
            bg.addColorStop(0, '#060818'); bg.addColorStop(0.5, '#0e1220'); bg.addColorStop(1, '#060810');
            ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
        }
        // vignette
        const vig = ctx.createRadialGradient(W / 2, H / 2, W / 4, W / 2, H / 2, W / 1.1);
        vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(0,0,0,0.82)');
        ctx.fillStyle = vig; ctx.fillRect(0, 0, W, H);

        // ── Top colour bar ────────────────────────────────────────────────────
        const topBar = ctx.createLinearGradient(0, 0, W, 0);
        topBar.addColorStop(0,   'rgba(255,100,0,0)');
        topBar.addColorStop(0.3, 'rgba(255,100,0,0.8)');
        topBar.addColorStop(0.7, 'rgba(255,100,0,0.8)');
        topBar.addColorStop(1,   'rgba(255,100,0,0)');
        ctx.fillStyle = topBar;
        ctx.fillRect(0, 0, W, 5);
        ctx.fillRect(0, H - 5, W, 5);

        // ── Enemy Panel (right side) ──────────────────────────────────────────
        const ePanelX = W - 370, ePanelY = 30, ePanelW = 330, ePanelH = 300;
        const enemyBorder = enemy.isBoss ? '#FF4444' : '#CC3300';
        panel(ctx, ePanelX, ePanelY, ePanelW, ePanelH, enemyBorder);

        // enemy avatar placeholder (skull/boss icon)
        const enemyImg = await loadImageSafe(`${R2_PVP}/monster.png`);
        const eCX = ePanelX + ePanelW / 2;
        const eCY = ePanelY + 90;
        circleAvatar(ctx, enemyImg, eCX, eCY, 65, enemyBorder, enemy.hp <= 0);

        // enemy name
        ctx.save();
        ctx.font = 'bold 20px "Bein"'; ctx.textAlign = 'center';
        let eName = enemy.name || 'عدو';
        while (ctx.measureText(eName).width > ePanelW - 30 && eName.length > 4) eName = eName.slice(0, -1);
        ctx.fillStyle = enemy.hp <= 0 ? '#666' : (enemy.isBoss ? '#FF6666' : '#FFCCAA');
        ctx.textBaseline = 'middle';
        ctx.fillText(eName, eCX, ePanelY + 175);
        if (enemy.isBoss) text(ctx, '👹 زعيم', eCX, ePanelY + 200, 16, '#FF4444');
        if (enemy.enraged) text(ctx, '💢 مشتعل', eCX, ePanelY + 220, 15, '#FF6600');
        ctx.restore();

        // enemy HP bar
        const eBarX = ePanelX + 20, eBarY = ePanelY + 240, eBarW = ePanelW - 40, eBarH = 22;
        const ePct = Math.max(0, Math.min(1, (enemy.hp || 0) / Math.max(1, enemy.maxHp)));
        const [ec1, ec2] = hpColors(ePct);
        hpBar(ctx, eBarX, eBarY, eBarW, eBarH, ePct, ec1, ec2, 6, true);
        text(ctx, `${enemy.hp || 0} / ${enemy.maxHp}`, eCX, eBarY + eBarH / 2 + 1, 14, '#fff');

        // ── Caravan Panel (center-bottom) ─────────────────────────────────────
        const cvPanelX = 40, cvPanelY = 340, cvPanelW = W - 80, cvPanelH = 70;
        const cvBorder = caravan.hp < caravan.maxHp * 0.3 ? '#FF4444' : '#C87533';
        panel(ctx, cvPanelX, cvPanelY, cvPanelW, cvPanelH, cvBorder, 0.85, 10);

        text(ctx, '🐪 صحة القافلة', cvPanelX + 90, cvPanelY + 22, 18, cvBorder, 'left');
        const cvPct = Math.max(0, Math.min(1, caravan.hp / Math.max(1, caravan.maxHp)));
        const [cc1, cc2] = hpColors(cvPct);
        const cvBarX = cvPanelX + 20, cvBarY = cvPanelY + 38, cvBarW = cvPanelW - 40, cvBarH = 20;
        hpBar(ctx, cvBarX, cvBarY, cvBarW, cvBarH, cvPct, cc1, cc2, 5);
        text(ctx, `${caravan.hp} / ${caravan.maxHp}`, cvPanelX + cvPanelW / 2, cvBarY + cvBarH / 2 + 1, 13, '#fff');

        // penalty indicator
        if (caravan.lootPenalty > 0) {
            text(ctx, `⚠️ غرامة البضاعة: ${(caravan.lootPenalty * 100).toFixed(0)}%`, cvPanelX + cvPanelW - 20, cvPanelY + 20, 14, '#FFA500', 'right');
        }

        // ── Team Panels (left side) ────────────────────────────────────────────
        const teamCount = Math.min(players.length, 3);
        const tPanelW = 310, tPanelH = 280;
        const tStartY = 30;
        const tGap    = (330 - tStartY) / Math.max(teamCount, 1);

        for (let i = 0; i < teamCount; i++) {
            const p      = players[i];
            const tpX    = 30;
            const tpY    = tStartY + i * (tPanelH / teamCount + 8);
            const tpH    = Math.min(tPanelH / teamCount, 95);
            const isHost = p.id === hostId;
            const isDead = p.isDead || p.hp <= 0;
            const acted  = actedIds.includes(p.id);
            const border = isDead ? '#444' : (isHost ? '#FFD700' : '#4fc3f7');

            panel(ctx, tpX, tpY, tPanelW, tpH, border, 0.8, 10);

            // mini avatar
            let avatarImg = null;
            if (guild) {
                try {
                    const mem = guild.members.cache.get(p.id);
                    if (mem) avatarImg = await loadAvatar(mem);
                } catch {}
            }
            const avR = 28;
            const avCX = tpX + avR + 10;
            const avCY = tpY + tpH / 2;
            circleAvatar(ctx, avatarImg, avCX, avCY, avR, border, isDead);

            // name + class
            const pName = p.name || 'لاعب';
            const classIcon = CLASS_ICONS[p.class] || '⚔️';
            const statusDot = isDead ? '💀' : (acted ? '🔴' : '🟢');

            text(ctx, `${statusDot} ${isHost ? '👑' : ''} ${pName}`, tpX + avR * 2 + 22, tpY + tpH * 0.28, 15, isDead ? '#666' : '#fff', 'left');
            text(ctx, `${classIcon} ${p.class || ''}`, tpX + avR * 2 + 22, tpY + tpH * 0.52, 13, border, 'left');

            // HP bar
            const pPct = isDead ? 0 : Math.max(0, Math.min(1, p.hp / Math.max(1, p.maxHp)));
            const [pc1, pc2] = hpColors(pPct);
            const pbX = tpX + avR * 2 + 22, pbY = tpY + tpH * 0.70, pbW = tPanelW - avR * 2 - 40, pbH = 13;
            hpBar(ctx, pbX, pbY, pbW, pbH, pPct, pc1, pc2, 4);
            text(ctx, isDead ? 'سقط' : `${p.hp}/${p.maxHp}`, pbX + pbW / 2, pbY + pbH / 2 + 1, 11, '#fff');

            // shield
            if (!isDead && p.shield > 0) {
                text(ctx, `🔷 ${p.shield}`, tpX + tPanelW - 12, tpY + 14, 13, '#80CFFF', 'right');
            }
        }

        // ── Wave Title ─────────────────────────────────────────────────────────
        const wavePanelX = W / 2 - 120, wavePanelY = 30;
        panel(ctx, wavePanelX, wavePanelY, 240, 52, '#FF6600', 0.9, 10);
        text(ctx, `⚔️ الموجة ${waveNum} / 5`, W / 2, wavePanelY + 27, 20, '#FFCCAA');

        // ── Battle Log Panel ──────────────────────────────────────────────────
        const logY = 430, logH = H - logY - 20;
        panel(ctx, 40, logY, W - 80, logH, '#3a3a5a', 0.88, 10);

        // log title
        ctx.save();
        rr(ctx, W / 2 - 90, logY - 18, 180, 36, 10);
        ctx.fillStyle = '#0a0a22'; ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = '#C87533'; ctx.stroke();
        text(ctx, '📜 سجل المعركة', W / 2, logY + 0, 17, '#C87533');
        ctx.restore();

        const lines = (log || []).slice(-8);
        const lh    = Math.min(36, (logH - 30) / Math.max(lines.length, 1));
        ctx.font = 'bold 16px "Bein"';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        lines.forEach((line, idx) => {
            const alpha = lines.length > 1 ? 0.35 + (idx / (lines.length - 1)) * 0.65 : 1;
            ctx.fillStyle = `rgba(230,225,255,${alpha})`;
            let clean = line.replace(/\*\*/g, '').trim();
            let chars = Array.from(clean);
            while (chars.length > 0 && ctx.measureText(chars.join('') + '…').width > W - 120) chars.pop();
            if (chars.length < Array.from(clean).length) clean = chars.join('') + '…';
            ctx.fillText(clean, W / 2, logY + 24 + idx * lh);
        });

        // ── Encode ────────────────────────────────────────────────────────────
        const buf = await (canvas.encode ? canvas.encode('png') : canvas.toBuffer('image/png'));
        canvas.width = 0; canvas.height = 0;
        return buf;
    } catch (err) {
        console.error('[CaravanBattleGenerator]', err);
        return null;
    }
}

module.exports = { generateCaravanBattleImage };
