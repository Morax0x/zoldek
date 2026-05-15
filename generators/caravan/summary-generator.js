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

const staticImageCache = new Map();
const IMAGE_TIMEOUT = 5000;

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

function rr(ctx, x, y, w, h, r = 12) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

function panel(ctx, x, y, w, h, border, opacity = 0.88, radius = 14) {
    ctx.save();
    // Glow
    ctx.shadowColor = border + '33'; ctx.shadowBlur = 22;
    rr(ctx, x, y, w, h, radius); ctx.strokeStyle = 'transparent'; ctx.lineWidth = 0; ctx.stroke();
    ctx.shadowBlur = 0;

    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, `rgba(12,12,32,${opacity})`);
    g.addColorStop(1, `rgba(4,4,14,${opacity + 0.08})`);
    rr(ctx, x, y, w, h, radius); ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = border + '88'; ctx.stroke();

    // Inner highlight
    rr(ctx, x + 2, y + 2, w - 4, h - 4, radius - 1);
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.stroke();

    // Top accent bar
    rr(ctx, x, y, w, 4, [radius, radius, 0, 0]);
    ctx.fillStyle = border + '66'; ctx.fill();
    ctx.restore();
}

function circleAvatar(ctx, img, cx, cy, r, border, isDead = false, deathImg = null) {
    ctx.save();
    if (!isDead) {
        ctx.shadowColor = border; ctx.shadowBlur = 24;
        ctx.beginPath(); ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
        ctx.fillStyle = border + '22'; ctx.fill(); ctx.shadowBlur = 0;
    }
    ctx.beginPath(); ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
    const ringG = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    if (isDead) { ringG.addColorStop(0, '#3a3a3a'); ringG.addColorStop(1, '#1a1a1a'); }
    else { ringG.addColorStop(0, '#d4a843'); ringG.addColorStop(0.4, '#ffe878'); ringG.addColorStop(1, '#8b6914'); }
    ctx.fillStyle = ringG; ctx.fill();

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
    if (isDead && deathImg) {
        ctx.globalAlpha = 0.65;
        ctx.drawImage(deathImg, cx - r * 1.3, cy - r * 1.3, r * 2.6, r * 2.6);
    }
    ctx.restore();
}

function txt(ctx, t, x, y, size, color, align = 'center') {
    ctx.save();
    ctx.font = `bold ${size}px "Bein"`;
    ctx.fillStyle = color;
    ctx.direction = 'rtl';
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillText(String(t || ''), x, y);
    ctx.restore();
}

function hpBar(ctx, x, y, w, h, pct, color1, color2, radius = 5) {
    // Outer track
    rr(ctx, x - 2, y - 2, w + 4, h + 4, radius + 1);
    ctx.fillStyle = '#040410'; ctx.fill();

    rr(ctx, x, y, w, h, radius);
    ctx.fillStyle = '#020208'; ctx.fill();

    if (pct > 0) {
        const fw = pct * w;
        ctx.save();
        rr(ctx, x, y, w, h, radius); ctx.clip();
        const g = ctx.createLinearGradient(x, y, x, y + h);
        g.addColorStop(0, color1); g.addColorStop(0.5, color2); g.addColorStop(1, color1);
        rr(ctx, x, y, Math.max(radius * 2, fw), h, radius);
        ctx.fillStyle = g;
        ctx.shadowColor = color1; ctx.shadowBlur = 10;
        ctx.fill(); ctx.shadowBlur = 0;
        // Gloss
        const gloss = ctx.createLinearGradient(x, y, x, y + h * 0.45);
        gloss.addColorStop(0, 'rgba(255,255,255,0.28)');
        gloss.addColorStop(1, 'rgba(255,255,255,0.02)');
        ctx.fillStyle = gloss; ctx.fillRect(x, y, Math.max(radius * 2, fw), h * 0.45);
        ctx.restore();
    }
}

// ─── Battle Rest Screen ────────────────────────────────────────────────────────

async function generateCaravanRestImage(players, caravan, waveNum, guild = null) {
    try {
        const W = 1200, H = 600;
        const canvas = createCanvas(W, H);
        const ctx = canvas.getContext('2d');

        const bgImg = await loadImageSafe(`${R2_PVP}/pvp_arena_bg.png`);
        if (bgImg) {
            ctx.drawImage(bgImg, 0, 0, W, H);
            ctx.fillStyle = 'rgba(2,6,18,0.80)'; ctx.fillRect(0, 0, W, H);
        } else {
            ctx.fillStyle = '#03060f'; ctx.fillRect(0, 0, W, H);
        }

        // Vignette
        const vig = ctx.createRadialGradient(W/2, H/2, W/5, W/2, H/2, W/1.1);
        vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(0,0,0,0.7)');
        ctx.fillStyle = vig; ctx.fillRect(0, 0, W, H);

        // Top accent bar (green = rest/safe)
        const tb = ctx.createLinearGradient(0, 0, W, 0);
        tb.addColorStop(0, 'rgba(46,204,113,0)');
        tb.addColorStop(0.5, 'rgba(46,204,113,0.85)');
        tb.addColorStop(1, 'rgba(46,204,113,0)');
        ctx.fillStyle = tb; ctx.fillRect(0, 0, W, 5);
        ctx.fillRect(0, H - 5, W, 5);

        // Title panel
        panel(ctx, W / 2 - 230, 18, 460, 64, '#4CAF50', 0.92, 12);
        txt(ctx, `☕ استراحة — الموجة ${waveNum}/5 انتهت!`, W / 2, 52, 22, '#a5d6a7');

        // Caravan HP bar
        panel(ctx, 36, 100, W - 72, 68, '#C87533', 0.88, 10);
        txt(ctx, '🐪 صحة القافلة', 80, 120, 16, '#C87533', 'left');
        const cvPct = Math.max(0, Math.min(1, caravan.hp / Math.max(1, caravan.maxHp)));
        const cvColor = cvPct > 0.5 ? '#C87533' : (cvPct > 0.25 ? '#f39c12' : '#e74c3c');
        hpBar(ctx, 52, 142, W - 104, 18, cvPct, cvColor, cvColor, 5);
        txt(ctx, `${caravan.hp} / ${caravan.maxHp}`, W / 2, 151, 13, '#fff');

        // Player cards
        const teamCount = Math.min(players.length, 3);
        const gap = 18;
        const cardW = Math.floor((W - 72 - (teamCount - 1) * gap) / teamCount);
        const cardH = 340;
        const cardY = 185;

        const deathImg = await loadImageSafe(`${R2_VFX}/vfx_death.png`);

        for (let i = 0; i < teamCount; i++) {
            const p = players[i];
            const isDead = p.isDead || p.hp <= 0;
            const border = isDead ? '#666' : '#4fc3f7';
            const cardX = 36 + i * (cardW + gap);

            panel(ctx, cardX, cardY, cardW, cardH, border, 0.84, 14);

            // Avatar
            let avatarImg = null;
            if (guild) {
                try {
                    const mem = guild.members.cache.get(p.id);
                    if (mem) {
                        const url = mem.user?.displayAvatarURL({ extension: 'png', size: 256, forceStatic: true });
                        if (url) avatarImg = await loadImageSafe(url);
                    }
                } catch {}
            }
            const avCX = cardX + cardW / 2;
            const avCY = cardY + 92;
            circleAvatar(ctx, avatarImg, avCX, avCY, 60, border, isDead, deathImg);

            txt(ctx, p.name || 'لاعب', avCX, cardY + 168, 18, isDead ? '#666' : '#fff');
            txt(ctx, p.class || '', avCX, cardY + 194, 14, border);

            // HP bar
            const pPct = isDead ? 0 : Math.max(0, Math.min(1, p.hp / Math.max(1, p.maxHp)));
            const pColor = pPct > 0.5 ? '#2ecc71' : (pPct > 0.25 ? '#f39c12' : '#e74c3c');
            hpBar(ctx, cardX + 18, cardY + 220, cardW - 36, 20, pPct, pColor, pColor, 5);
            txt(ctx, isDead ? '💀 سقط' : `${p.hp} / ${p.maxHp}`, avCX, cardY + 230, 13, '#fff');

            if (!isDead && p.shield > 0) {
                txt(ctx, `🔷 ${p.shield}`, avCX, cardY + 268, 14, '#80CFFF');
            }

            // Status badge
            const badgeColor = isDead ? '#EF5350' : '#4CAF50';
            const badgeText  = isDead ? '💀 سقط' : '✅ يقاتل';
            rr(ctx, cardX + cardW / 2 - 80, cardY + cardH - 58, 160, 38, 10);
            ctx.fillStyle = badgeColor + '22'; ctx.fill();
            ctx.strokeStyle = badgeColor + '66'; ctx.lineWidth = 1.5;
            rr(ctx, cardX + cardW / 2 - 80, cardY + cardH - 58, 160, 38, 10); ctx.stroke();
            txt(ctx, badgeText, avCX, cardY + cardH - 39, 16, badgeColor);
        }

        const buf = await (canvas.encode ? canvas.encode('png') : canvas.toBuffer('image/png'));
        canvas.width = 0; canvas.height = 0;
        return buf;
    } catch (err) {
        console.error('[CaravanRestGenerator]', err);
        return null;
    }
}

// ─── Battle Result Screen ──────────────────────────────────────────────────────

async function generateCaravanResultImage(result, players, caravan, wavesCleared, rewards, guild = null) {
    try {
        const W = 1200, H = 760;
        const canvas = createCanvas(W, H);
        const ctx = canvas.getContext('2d');

        const isWin = result === 'win' || result === 'escape';

        const bgImg   = await loadImageSafe(`${R2_PVP}/pvp_arena_bg.png`);
        const deathVfx = await loadImageSafe(`${R2_VFX}/vfx_death.png`);

        if (bgImg) {
            ctx.drawImage(bgImg, 0, 0, W, H);
            ctx.fillStyle = isWin ? 'rgba(2,10,4,0.78)' : 'rgba(14,2,2,0.82)';
            ctx.fillRect(0, 0, W, H);
        } else {
            ctx.fillStyle = isWin ? '#020a04' : '#0e0202'; ctx.fillRect(0, 0, W, H);
        }

        // Vignette
        const vig = ctx.createRadialGradient(W/2, H/2, W/6, W/2, H/2, W/1.15);
        vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(0,0,0,0.8)');
        ctx.fillStyle = vig; ctx.fillRect(0, 0, W, H);

        // Accent bars
        const accentColor = isWin ? '#4CAF50' : '#ef5350';
        const tBar = ctx.createLinearGradient(0, 0, W, 0);
        tBar.addColorStop(0, `${accentColor}00`); tBar.addColorStop(0.5, `${accentColor}CC`); tBar.addColorStop(1, `${accentColor}00`);
        ctx.fillStyle = tBar; ctx.fillRect(0, 0, W, 6); ctx.fillRect(0, H - 6, W, 6);

        // Result title
        const titleMap = {
            'win':          { text: '🎉 انتصار! الطريق آمن!',     color: '#4CAF50' },
            'escape':       { text: '🐪 هرب القائد بالقافلة!',      color: '#F5A623' },
            'lose_players': { text: '☠️ سقط الجميع! القافلة نهبت!', color: '#ef5350' },
            'lose_caravan': { text: '🐪 دمرت القافلة!',           color: '#ef5350' },
            'lose_timeout': { text: '⏰ انتهى الوقت! هزيمة!',       color: '#ef5350' },
        };
        const titleInfo = titleMap[result] || { text: 'نهاية المعركة', color: '#fff' };

        panel(ctx, W / 2 - 300, 18, 600, 68, titleInfo.color, 0.92, 14);
        ctx.shadowColor = titleInfo.color + '66'; ctx.shadowBlur = 24;
        txt(ctx, titleInfo.text, W / 2, 54, 26, titleInfo.color);
        ctx.shadowBlur = 0;

        // Player cards
        const teamCount = Math.min(players.length, 3);
        const gap = 18;
        const cardW = Math.floor((W - 72 - (teamCount - 1) * gap) / teamCount);
        const cardH = 240;
        const cardY = 104;

        for (let i = 0; i < teamCount; i++) {
            const p = players[i];
            const isDead = p.isDead || p.hp <= 0;
            const border = isDead ? '#555' : (isWin ? '#4CAF50' : '#ef5350');
            const cardX = 36 + i * (cardW + gap);

            panel(ctx, cardX, cardY, cardW, cardH, border, 0.85, 12);

            let avatarImg = null;
            if (guild) {
                try {
                    const mem = guild.members.cache.get(p.id);
                    if (mem) {
                        const url = mem.user?.displayAvatarURL({ extension: 'png', size: 256, forceStatic: true });
                        if (url) avatarImg = await loadImageSafe(url);
                    }
                } catch {}
            }
            circleAvatar(ctx, avatarImg, cardX + cardW / 2, cardY + 58, 42, border, isDead, deathVfx);

            txt(ctx, p.name || 'لاعب', cardX + cardW / 2, cardY + 115, 16, isDead ? '#888' : '#fff');

            // Status badge
            const sColor = isDead ? '#EF5350' : '#4CAF50';
            rr(ctx, cardX + cardW / 2 - 60, cardY + 135, 120, 30, 8);
            ctx.fillStyle = sColor + '22'; ctx.fill();
            ctx.strokeStyle = sColor + '66'; ctx.lineWidth = 1.5;
            rr(ctx, cardX + cardW / 2 - 60, cardY + 135, 120, 30, 8); ctx.stroke();
            txt(ctx, isDead ? '💀 سقط' : '✅ نجا', cardX + cardW / 2, cardY + 150, 14, sColor);

            // HP bar
            const pPct = isDead ? 0 : Math.max(0, Math.min(1, p.hp / Math.max(1, p.maxHp)));
            const pColor = pPct > 0.5 ? '#2ecc71' : (pPct > 0.25 ? '#f39c12' : '#e74c3c');
            hpBar(ctx, cardX + 18, cardY + 176, cardW - 36, 14, pPct, pColor, pColor, 4);
            txt(ctx, `${p.hp || 0} / ${p.maxHp}`, cardX + cardW / 2, cardY + 183, 11, '#ccc');

            txt(ctx, `⚔️ ضرر: ${p.totalDamage || 0}`, cardX + cardW / 2, cardY + 215, 13, '#f39c12');
        }

        // Caravan HP
        const cvY = cardY + cardH + 18;
        panel(ctx, 36, cvY, W - 72, 58, caravan.hp > 0 ? '#C87533' : '#555', 0.88, 10);
        txt(ctx, '🐪 القافلة', 75, cvY + 30, 16, '#C87533', 'left');
        const cvPct = Math.max(0, Math.min(1, caravan.hp / Math.max(1, caravan.maxHp)));
        const cvColor = cvPct > 0.5 ? '#C87533' : (cvPct > 0.25 ? '#f39c12' : '#e74c3c');
        hpBar(ctx, 168, cvY + 16, W - 212, 22, cvPct, cvColor, cvColor, 5);
        txt(ctx, `${caravan.hp} / ${caravan.maxHp}`, W / 2, cvY + 27, 13, '#fff');

        // Waves cleared
        const waveY = cvY + 78;
        panel(ctx, 36, waveY, W - 72, 52, '#3a3a6a', 0.82, 10);
        txt(ctx, `موجات مكتملة: ${wavesCleared} / 5`, W / 2, waveY + 27, 20, '#aac');

        // Rewards (win only)
        if (isWin && rewards) {
            const rewY = waveY + 72;
            const rewH = H - rewY - 18;
            panel(ctx, 36, rewY, W - 72, rewH, '#c9a84c', 0.90, 12);

            ctx.save();
            rr(ctx, W / 2 - 120, rewY - 17, 240, 34, 10);
            ctx.fillStyle = '#07071a'; ctx.fill();
            ctx.lineWidth = 1.5; ctx.strokeStyle = '#c9a84c'; ctx.stroke();
            ctx.restore();
            txt(ctx, '🏆 المكافآت والجوائز', W / 2, rewY + 4, 18, '#c9a84c');

            const rewardY = rewY + 40;
            const items = [];
            if (rewards.totalMora   > 0) items.push({ label: `💰 مورا: ${rewards.totalMora.toLocaleString()}`,  color: '#ffe082' });
            if (rewards.totalChests > 0) items.push({ label: `🎁 صناديق: ${rewards.totalChests}`,               color: '#80deea' });
            if (rewards.totalRep    > 0) items.push({ label: `🌟 سمعة: ${rewards.totalRep}`,                    color: '#ef9a9a' });

            const itemW = Math.min(360, (W - 80) / Math.max(items.length, 1));
            const startX = W / 2 - (items.length * itemW) / 2;
            items.forEach((it, idx) => {
                const bx = startX + idx * itemW;
                rr(ctx, bx + 8, rewardY, itemW - 16, 50, 10);
                ctx.fillStyle = it.color + '18'; ctx.fill();
                ctx.strokeStyle = it.color + '44'; ctx.lineWidth = 1.5;
                rr(ctx, bx + 8, rewardY, itemW - 16, 50, 10); ctx.stroke();
                ctx.shadowColor = it.color + '66'; ctx.shadowBlur = 10;
                txt(ctx, it.label, bx + itemW / 2, rewardY + 26, 20, it.color);
                ctx.shadowBlur = 0;
            });

            if (caravan.lootPenalty > 0) {
                txt(ctx, `⚠️ خسارة بضاعة: ${(caravan.lootPenalty * 100).toFixed(0)}%`, W / 2, rewardY + 70, 16, '#FFA500');
            }
        }

        const buf = await (canvas.encode ? canvas.encode('png') : canvas.toBuffer('image/png'));
        canvas.width = 0; canvas.height = 0;
        return buf;
    } catch (err) {
        console.error('[CaravanSummaryGenerator]', err);
        return null;
    }
}

module.exports = { generateCaravanRestImage, generateCaravanResultImage };
