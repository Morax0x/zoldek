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

const IMAGE_TIMEOUT = 1500;
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

function panel(ctx, x, y, w, h, border, opacity = 0.88, radius = 14) {
    ctx.save();
    // Outer glow
    ctx.shadowColor = border + '33'; ctx.shadowBlur = 20;
    rr(ctx, x, y, w, h, radius); ctx.strokeStyle = 'transparent'; ctx.lineWidth = 0; ctx.stroke();
    ctx.shadowBlur = 0;

    // Body gradient
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, `rgba(12,12,32,${opacity})`);
    g.addColorStop(0.5, `rgba(8,8,22,${opacity + 0.04})`);
    g.addColorStop(1, `rgba(4,4,14,${opacity + 0.08})`);
    rr(ctx, x, y, w, h, radius);
    ctx.fillStyle = g; ctx.fill();

    // Outer border
    ctx.lineWidth = 2.5; ctx.strokeStyle = border + '88'; ctx.stroke();

    // Inner highlight
    rr(ctx, x + 2, y + 2, w - 4, h - 4, radius - 1);
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.stroke();

    // Top accent strip
    rr(ctx, x, y, w, 4, [radius, radius, 0, 0]);
    ctx.fillStyle = border + '66'; ctx.fill();

    ctx.restore();
}

function hpBar(ctx, x, y, w, h, pct, r1, r2, radius = 6, rtl = false) {
    ctx.save();
    // Outer shadow track
    rr(ctx, x - 3, y - 3, w + 6, h + 6, radius + 2);
    ctx.fillStyle = '#04040c'; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = '#14142a'; ctx.stroke();

    // Track
    rr(ctx, x, y, w, h, radius);
    ctx.fillStyle = '#020208'; ctx.fill();

    const fw = Math.max(0, w * Math.min(1, pct));
    if (fw > 0) {
        ctx.save();
        rr(ctx, x, y, w, h, radius); ctx.clip();

        // Fill gradient
        const grad = ctx.createLinearGradient(x, y, x, y + h);
        grad.addColorStop(0, r1); grad.addColorStop(0.5, r2); grad.addColorStop(1, r1);
        ctx.fillStyle = grad;
        const fx = rtl ? x + w - fw : x;
        rr(ctx, fx, y, fw, h, radius);
        ctx.shadowColor = r1; ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;

        // Gloss
        const gloss = ctx.createLinearGradient(x, y, x, y + h * 0.45);
        gloss.addColorStop(0, 'rgba(255,255,255,0.32)');
        gloss.addColorStop(1, 'rgba(255,255,255,0.03)');
        ctx.fillStyle = gloss; ctx.fillRect(fx, y, fw, h * 0.45);
        ctx.restore();
    }
    ctx.restore();
}

function circleAvatar(ctx, img, cx, cy, r, border, isDead = false) {
    ctx.save();
    if (!isDead) {
        // Glow ring
        ctx.shadowColor = border; ctx.shadowBlur = 30;
        ctx.beginPath(); ctx.arc(cx, cy, r + 8, 0, Math.PI * 2);
        ctx.fillStyle = border + '22'; ctx.fill();
        ctx.shadowBlur = 0;
    }
    // Gold outer ring
    ctx.beginPath(); ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
    const ringG = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    if (isDead) {
        ringG.addColorStop(0, '#3a3a3a'); ringG.addColorStop(1, '#1a1a1a');
    } else {
        ringG.addColorStop(0, '#d4a843'); ringG.addColorStop(0.4, '#ffe878');
        ringG.addColorStop(1, '#8b6914');
    }
    ctx.fillStyle = ringG; ctx.fill();

    // Avatar clip
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
    if (img) {
        if (isDead) ctx.filter = 'grayscale(100%) brightness(38%)';
        const asp = img.width / img.height;
        let dw = r * 2, dh = r * 2;
        if (asp > 1) { dw = r * 2 * asp; } else { dh = r * 2 / asp; }
        ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);
        ctx.filter = 'none';
    } else {
        ctx.fillStyle = '#12122a'; ctx.fill();
    }
    ctx.restore();
}

function text(ctx, txt, x, y, size, color, align = 'center') {
    ctx.save();
    ctx.font = `bold ${size}px "Bein"`;
    ctx.fillStyle = color;
    ctx.direction = 'rtl';
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

async function generateCaravanBattleImage(players, enemy, caravan, waveNum, log, actedIds = [], hostId = null, guild = null) {
    try {
        const W = 1200, H = 800;
        const canvas = createCanvas(W, H);
        const ctx = canvas.getContext('2d');

        // ── Background ────────────────────────────────────────────────────────
        const bgImg = await loadImageSafe(`${R2_PVP}/pvp_arena_bg.png`);
        if (bgImg) {
            ctx.drawImage(bgImg, 0, 0, W, H);
            ctx.fillStyle = 'rgba(4,4,18,0.70)'; ctx.fillRect(0, 0, W, H);
        } else {
            const bg = ctx.createLinearGradient(0, 0, 0, H);
            bg.addColorStop(0, '#04060e'); bg.addColorStop(0.5, '#080c18'); bg.addColorStop(1, '#04060c');
            ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
        }

        // Vignette
        const vig = ctx.createRadialGradient(W / 2, H / 2, W / 5, W / 2, H / 2, W / 1.2);
        vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(0,0,0,0.78)');
        ctx.fillStyle = vig; ctx.fillRect(0, 0, W, H);

        // ── Edge accent bars ──────────────────────────────────────────────────
        const barG = ctx.createLinearGradient(0, 0, W, 0);
        barG.addColorStop(0, 'rgba(255,80,0,0)');
        barG.addColorStop(0.3, 'rgba(255,80,0,0.85)');
        barG.addColorStop(0.7, 'rgba(255,80,0,0.85)');
        barG.addColorStop(1, 'rgba(255,80,0,0)');
        ctx.fillStyle = barG;
        ctx.fillRect(0, 0, W, 5);
        ctx.fillRect(0, H - 5, W, 5);

        // ── Enemy Panel (right side, larger) ─────────────────────────────────
        const ePanelX = W - 380, ePanelY = 26, ePanelW = 348, ePanelH = 320;
        const enemyBorder = enemy.isBoss ? '#FF3333' : '#CC3300';
        panel(ctx, ePanelX, ePanelY, ePanelW, ePanelH, enemyBorder);

        const enemyImg = await loadImageSafe(`${R2_PVP}/monster.png`);
        const eCX = ePanelX + ePanelW / 2;
        const eCY = ePanelY + 98;
        circleAvatar(ctx, enemyImg, eCX, eCY, 68, enemyBorder, enemy.hp <= 0);

        // Enemy name
        ctx.save();
        ctx.font = 'bold 22px "Bein"'; ctx.direction = 'rtl'; ctx.textAlign = 'center';
        let eName = enemy.name || 'عدو';
        while (ctx.measureText(eName).width > ePanelW - 40 && eName.length > 4) eName = eName.slice(0, -1);
        ctx.fillStyle = enemy.hp <= 0 ? '#555' : (enemy.isBoss ? '#FF7777' : '#FFCCAA');
        ctx.textBaseline = 'middle';
        ctx.fillText(eName, eCX, ePanelY + 188);
        ctx.restore();

        if (enemy.isBoss)  text(ctx, '👹 زعيم',  eCX, ePanelY + 214, 16, '#FF4444');
        if (enemy.enraged) text(ctx, '💢 مشتعل', eCX, ePanelY + 234, 15, '#FF6600');

        // Enemy HP bar
        const eBarX = ePanelX + 20, eBarY = ePanelY + 256, eBarW = ePanelW - 40, eBarH = 26;
        const ePct = Math.max(0, Math.min(1, (enemy.hp || 0) / Math.max(1, enemy.maxHp)));
        const [ec1, ec2] = hpColors(ePct);
        hpBar(ctx, eBarX, eBarY, eBarW, eBarH, ePct, ec1, ec2, 7, true);
        text(ctx, `${enemy.hp || 0} / ${enemy.maxHp}`, eCX, eBarY + eBarH / 2, 14, '#fff');

        // ── Caravan Panel (center strip) ──────────────────────────────────────
        const cvBorder = caravan.hp < caravan.maxHp * 0.3 ? '#FF3333' : '#C87533';
        const cvPanelX = 38, cvPanelY = 350, cvPanelW = W - 76, cvPanelH = 76;
        panel(ctx, cvPanelX, cvPanelY, cvPanelW, cvPanelH, cvBorder, 0.88, 10);

        text(ctx, '🐪 صحة القافلة', cvPanelX + 100, cvPanelY + 24, 18, cvBorder, 'left');
        const cvPct = Math.max(0, Math.min(1, caravan.hp / Math.max(1, caravan.maxHp)));
        const [cc1, cc2] = hpColors(cvPct);
        const cvBarX = cvPanelX + 22, cvBarY = cvPanelY + 42, cvBarW = cvPanelW - 44, cvBarH = 22;
        hpBar(ctx, cvBarX, cvBarY, cvBarW, cvBarH, cvPct, cc1, cc2, 6);
        text(ctx, `${caravan.hp} / ${caravan.maxHp}`, cvPanelX + cvPanelW / 2, cvBarY + cvBarH / 2, 13, '#fff');

        if (caravan.lootPenalty > 0) {
            text(ctx, `⚠️ غرامة: ${(caravan.lootPenalty * 100).toFixed(0)}%`, cvPanelX + cvPanelW - 16, cvPanelY + 22, 14, '#FFA500', 'right');
        }

        // ── Team Panels (left side) ────────────────────────────────────────────
        const teamCount = Math.min(players.length, 3);
        const tPanelW = 320;
        const tGap = 8;
        const totalPlayersH = 320;
        const tPanelH = Math.floor((totalPlayersH - tGap * (teamCount - 1)) / Math.max(teamCount, 1));

        for (let i = 0; i < teamCount; i++) {
            const p     = players[i];
            const tpX   = 26;
            const tpY   = 26 + i * (tPanelH + tGap);
            const isDead  = p.isDead || p.hp <= 0;
            const isHost  = p.id === hostId;
            const acted   = actedIds.includes(p.id);
            const border  = isDead ? '#555' : (isHost ? '#FFD700' : '#4fc3f7');

            panel(ctx, tpX, tpY, tPanelW, tPanelH, border, 0.85, 10);

            // Avatar
            let avatarImg = null;
            if (guild) {
                try {
                    const mem = guild.members.cache.get(p.id);
                    if (mem) avatarImg = await loadAvatar(mem);
                } catch {}
            }
            const avR  = Math.min(30, Math.floor(tPanelH / 3.5));
            const avCX = tpX + avR + 12;
            const avCY = tpY + tPanelH / 2;
            circleAvatar(ctx, avatarImg, avCX, avCY, avR, border, isDead);

            // Status indicator dot
            const dotColor = isDead ? '#666' : (acted ? '#E74C3C' : '#2ECC71');
            ctx.fillStyle = dotColor;
            ctx.shadowColor = dotColor; ctx.shadowBlur = 8;
            ctx.beginPath(); ctx.arc(avCX, avCY - avR, 6, 0, Math.PI * 2); ctx.fill();
            ctx.shadowBlur = 0;

            // Name & class
            const pName = p.name || 'لاعب';
            const classIcon = CLASS_ICONS[p.class] || '⚔️';
            const statusIcon = isDead ? '💀' : (acted ? '🔴' : '🟢');
            const nameX = tpX + avR * 2 + 24;
            const nameMaxW = tPanelW - avR * 2 - 32;

            text(ctx, `${isHost ? '👑' : statusIcon} ${pName}`, nameX, tpY + tPanelH * 0.28, 15, isDead ? '#777' : '#fff', 'left');
            text(ctx, `${classIcon} ${p.class || ''}`, nameX, tpY + tPanelH * 0.52, 13, border, 'left');

            // HP bar
            const pPct = isDead ? 0 : Math.max(0, Math.min(1, p.hp / Math.max(1, p.maxHp)));
            const [pc1, pc2] = hpColors(pPct);
            const pbX = nameX, pbY = tpY + tPanelH * 0.72, pbW = tPanelW - avR * 2 - 44, pbH = 13;
            hpBar(ctx, pbX, pbY, pbW, pbH, pPct, pc1, pc2, 4);
            text(ctx, isDead ? 'سقط' : `${p.hp}/${p.maxHp}`, pbX + pbW / 2, pbY + pbH / 2, 10, '#fff');

            if (!isDead && p.shield > 0) {
                text(ctx, `🔷 ${p.shield}`, tpX + tPanelW - 10, tpY + 14, 12, '#80CFFF', 'right');
            }
        }

        // ── Wave Indicator ─────────────────────────────────────────────────────
        const wavePanelX = W / 2 - 135, wavePanelY = 26;
        panel(ctx, wavePanelX, wavePanelY, 270, 56, '#FF6600', 0.92, 10);

        // Wave pips
        const maxWaves = 5;
        const pipY = wavePanelY + 36;
        const pipSpacing = 38;
        const pipsStartX = W / 2 - (maxWaves * pipSpacing / 2) + pipSpacing / 2;
        for (let w = 1; w <= maxWaves; w++) {
            const px = pipsStartX + (w - 1) * pipSpacing;
            const active = w === waveNum;
            const done   = w < waveNum;
            ctx.fillStyle = done ? '#FF6600' : (active ? '#FFAA66' : 'rgba(255,255,255,0.15)');
            ctx.shadowColor = active ? '#FF6600' : 'transparent'; ctx.shadowBlur = active ? 12 : 0;
            ctx.beginPath(); ctx.arc(px, pipY - 12, active ? 8 : 6, 0, Math.PI * 2); ctx.fill();
            ctx.shadowBlur = 0;
        }
        text(ctx, `⚔️ الموجة ${waveNum} / ${maxWaves}`, W / 2, wavePanelY + 22, 19, '#FFCCAA');

        // ── Battle Log Panel ──────────────────────────────────────────────────
        const logY = 446, logH = H - logY - 18;
        panel(ctx, 38, logY, W - 76, logH, '#3a3a6a', 0.90, 10);

        // Log title badge
        ctx.save();
        rr(ctx, W / 2 - 100, logY - 17, 200, 34, 10);
        ctx.fillStyle = '#08081e'; ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = '#C87533'; ctx.stroke();
        ctx.restore();
        text(ctx, '📜 سجل المعركة', W / 2, logY + 2, 17, '#C87533');

        const lines = (log || []).slice(-8);
        const lh    = Math.min(34, (logH - 30) / Math.max(lines.length, 1));
        ctx.font = 'bold 15px "Bein"'; ctx.direction = 'rtl';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        lines.forEach((line, idx) => {
            const alpha = lines.length > 1 ? 0.3 + (idx / (lines.length - 1)) * 0.7 : 1;
            ctx.fillStyle = `rgba(220,215,245,${alpha})`;
            let clean = line.replace(/\*\*/g, '').trim();
            let chars = Array.from(clean);
            while (chars.length > 0 && ctx.measureText(chars.join('') + '…').width > W - 110) chars.pop();
            if (chars.length < Array.from(clean).length) clean = chars.join('') + '…';
            ctx.fillText(clean, W / 2, logY + 28 + idx * lh);
        });

        const buf = await (canvas.encode ? canvas.encode('png') : canvas.toBuffer('image/png'));
        canvas.width = 0; canvas.height = 0;
        return buf;
    } catch (err) {
        console.error('[CaravanBattleGenerator]', err);
        return null;
    }
}

module.exports = { generateCaravanBattleImage };
