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
const IMAGE_TIMEOUT = 6000;

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

function panel(ctx, x, y, w, h, border, opacity = 0.85, radius = 14) {
    ctx.save();
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, `rgba(10,10,30,${opacity})`);
    g.addColorStop(1, `rgba(4,4,14,${opacity + 0.05})`);
    rr(ctx, x, y, w, h, radius); ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = border; ctx.stroke();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    rr(ctx, x + 3, y + 3, w - 6, h - 6, radius - 2); ctx.stroke();
    ctx.restore();
}

function circleAvatar(ctx, img, cx, cy, r, border, isDead = false, deathImg = null) {
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
    ctx.fillStyle = isDead ? '#444' : border; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
    if (img) {
        if (isDead) ctx.filter = 'grayscale(100%) brightness(40%)';
        const asp = img.width / img.height;
        let dw = r * 2, dh = r * 2;
        if (asp > 1) { dw = r * 2 * asp; } else { dh = r * 2 / asp; }
        ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);
        ctx.filter = 'none';
    } else {
        ctx.fillStyle = '#1a1a2e'; ctx.fill();
    }
    if (isDead && deathImg) {
        ctx.globalAlpha = 0.7;
        ctx.drawImage(deathImg, cx - r * 1.3, cy - r * 1.3, r * 2.6, r * 2.6);
    }
    ctx.restore();
}

function txt(ctx, t, x, y, size, color, align = 'center') {
    ctx.save();
    ctx.font = `bold ${size}px "Bein"`;
    ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle';
    ctx.fillText(String(t || ''), x, y);
    ctx.restore();
}

// ─── Battle Rest Screen ────────────────────────────────────────────────────────

/**
 * Shows the rest screen between waves.
 * @param {Object[]} players   - All player objects
 * @param {Object}   caravan   - Caravan { hp, maxHp }
 * @param {number}   waveNum   - Wave just completed
 * @param {Object}   guild     - Discord guild (for avatars)
 */
async function generateCaravanRestImage(players, caravan, waveNum, guild = null) {
    try {
        const W = 1200, H = 600;
        const canvas = createCanvas(W, H);
        const ctx = canvas.getContext('2d');

        const bgImg = await loadImageSafe(`${R2_PVP}/pvp_arena_bg.png`);
        if (bgImg) {
            ctx.drawImage(bgImg, 0, 0, W, H);
            ctx.fillStyle = 'rgba(4,6,20,0.78)'; ctx.fillRect(0, 0, W, H);
        } else {
            ctx.fillStyle = '#060a18'; ctx.fillRect(0, 0, W, H);
        }

        // top bar
        const tb = ctx.createLinearGradient(0, 0, W, 0);
        tb.addColorStop(0, 'rgba(76,175,80,0)');
        tb.addColorStop(0.5, 'rgba(76,175,80,0.8)');
        tb.addColorStop(1, 'rgba(76,175,80,0)');
        ctx.fillStyle = tb; ctx.fillRect(0, 0, W, 5);

        // title panel
        panel(ctx, W / 2 - 200, 20, 400, 60, '#4CAF50', 0.9, 12);
        txt(ctx, `☕ استراحة — الموجة ${waveNum}/5 انتهت!`, W / 2, 52, 22, '#a5d6a7');

        // caravan bar
        panel(ctx, 40, 100, W - 80, 65, '#C87533', 0.85, 10);
        txt(ctx, '🐪 صحة القافلة', 75, 118, 16, '#C87533', 'left');
        const cvPct = Math.max(0, Math.min(1, caravan.hp / Math.max(1, caravan.maxHp)));
        const cvW = W - 120;
        const cvBarX = 55, cvBarY = 138, cvBarH = 18;
        rr(ctx, cvBarX - 2, cvBarY - 2, cvW + 4, cvBarH + 4, 5);
        ctx.fillStyle = '#0a0a1a'; ctx.fill();
        rr(ctx, cvBarX, cvBarY, cvW, cvBarH, 4); ctx.fillStyle = '#030308'; ctx.fill();
        if (cvPct > 0) {
            const cvFW = cvPct * cvW;
            const cvG = ctx.createLinearGradient(cvBarX, cvBarY, cvBarX, cvBarY + cvBarH);
            cvG.addColorStop(0, cvPct > 0.3 ? '#C87533' : '#e74c3c');
            cvG.addColorStop(1, cvPct > 0.3 ? '#8B4513' : '#922b21');
            ctx.save(); rr(ctx, cvBarX, cvBarY, cvW, cvBarH, 4); ctx.clip();
            ctx.fillStyle = cvG; ctx.fillRect(cvBarX, cvBarY, cvFW, cvBarH);
            ctx.restore();
        }
        txt(ctx, `${caravan.hp} / ${caravan.maxHp}`, W / 2, cvBarY + cvBarH / 2, 13, '#fff');

        // player cards
        const teamCount = Math.min(players.length, 3);
        const cardW = Math.floor((W - 80 - (teamCount - 1) * 20) / teamCount);
        const cardH = 320;
        const cardY = 185;

        const deathImg = await loadImageSafe(`${R2_VFX}/vfx_death.png`);

        for (let i = 0; i < teamCount; i++) {
            const p = players[i];
            const isDead = p.isDead || p.hp <= 0;
            const isHost = guild && p.id === guild.ownerId;
            const border = isDead ? '#555' : '#4fc3f7';
            const cardX = 40 + i * (cardW + 20);

            panel(ctx, cardX, cardY, cardW, cardH, border, 0.82, 12);

            // avatar
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
            const avCY = cardY + 80;
            circleAvatar(ctx, avatarImg, avCX, avCY, 55, border, isDead, deathImg);

            // name
            txt(ctx, p.name || 'لاعب', avCX, cardY + 155, 18, isDead ? '#666' : '#fff');
            txt(ctx, p.class || '', avCX, cardY + 178, 14, border);

            // HP bar
            const pPct = isDead ? 0 : Math.max(0, Math.min(1, p.hp / Math.max(1, p.maxHp)));
            const pbX = cardX + 20, pbY = cardY + 200, pbW = cardW - 40, pbH = 18;
            rr(ctx, pbX - 2, pbY - 2, pbW + 4, pbH + 4, 5);
            ctx.fillStyle = '#080812'; ctx.fill();
            rr(ctx, pbX, pbY, pbW, pbH, 4); ctx.fillStyle = '#020207'; ctx.fill();
            if (pPct > 0) {
                const pFW = pPct * pbW;
                const pG = ctx.createLinearGradient(pbX, pbY, pbX, pbY + pbH);
                pG.addColorStop(0, pPct > 0.3 ? '#2ecc71' : '#e74c3c');
                pG.addColorStop(1, pPct > 0.3 ? '#1a8a44' : '#8b1a1a');
                ctx.save(); rr(ctx, pbX, pbY, pbW, pbH, 4); ctx.clip();
                ctx.fillStyle = pG; ctx.fillRect(pbX, pbY, pFW, pbH);
                ctx.restore();
            }
            txt(ctx, isDead ? '💀 سقط' : `${p.hp} / ${p.maxHp}`, avCX, pbY + pbH / 2, 13, '#fff');

            // shield
            if (!isDead && p.shield > 0) {
                txt(ctx, `🔷 ${p.shield}`, avCX, cardY + 235, 14, '#80CFFF');
            }

            // death overlay text
            if (isDead) {
                txt(ctx, '💀 سقط في المعركة', avCX, cardY + cardH - 30, 15, '#EF5350');
            } else {
                txt(ctx, '✅ ما زال يقاتل', avCX, cardY + cardH - 30, 15, '#4CAF50');
            }
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

/**
 * Generates the final battle result image.
 * @param {string}   result        - 'win'|'escape'|'lose_players'|'lose_caravan'|'lose_timeout'
 * @param {Object[]} players       - All player objects
 * @param {Object}   caravan       - Caravan { hp, maxHp }
 * @param {number}   wavesCleared  - How many waves completed
 * @param {Object}   rewards       - { totalMora, totalChests, totalRep, summary[] }
 * @param {Object}   guild         - Discord guild
 */
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
            ctx.fillStyle = isWin ? 'rgba(2,10,4,0.75)' : 'rgba(14,2,2,0.78)';
            ctx.fillRect(0, 0, W, H);
        } else {
            ctx.fillStyle = isWin ? '#020a04' : '#0e0202';
            ctx.fillRect(0, 0, W, H);
        }

        // top accent bar
        const accentColor = isWin ? '#4CAF50' : '#ef5350';
        const tBar = ctx.createLinearGradient(0, 0, W, 0);
        tBar.addColorStop(0, `${accentColor}00`);
        tBar.addColorStop(0.5, `${accentColor}CC`);
        tBar.addColorStop(1, `${accentColor}00`);
        ctx.fillStyle = tBar; ctx.fillRect(0, 0, W, 6);
        ctx.fillRect(0, H - 6, W, 6);

        // ── Result title ──────────────────────────────────────────────────────
        const titleMap = {
            'win':          { text: '🎉 انتصار! الطريق آمن!',     color: '#4CAF50' },
            'escape':       { text: '🐪 هرب القائد بالقافلة!',      color: '#F5A623' },
            'lose_players': { text: '☠️ سقط الجميع! القافلة نُهبت!', color: '#ef5350' },
            'lose_caravan': { text: '🐪 دُمِّرت القافلة!',           color: '#ef5350' },
            'lose_timeout': { text: '⏰ انتهى الوقت! هزيمة!',       color: '#ef5350' },
        };
        const titleInfo = titleMap[result] || { text: 'نهاية المعركة', color: '#fff' };

        panel(ctx, W / 2 - 280, 20, 560, 65, titleInfo.color, 0.9, 14);
        txt(ctx, titleInfo.text, W / 2, 53, 26, titleInfo.color);

        // ── Player cards (top row) ─────────────────────────────────────────────
        const teamCount = Math.min(players.length, 3);
        const cardW = Math.floor((W - 80 - (teamCount - 1) * 20) / teamCount);
        const cardH = 230;
        const cardY = 105;

        for (let i = 0; i < teamCount; i++) {
            const p = players[i];
            const isDead = p.isDead || p.hp <= 0;
            const border = isDead ? '#555' : (isWin ? '#4CAF50' : '#ef5350');
            const cardX = 40 + i * (cardW + 20);

            panel(ctx, cardX, cardY, cardW, cardH, border, 0.82, 12);

            // avatar
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
            circleAvatar(ctx, avatarImg, cardX + cardW / 2, cardY + 52, 38, border, isDead, deathVfx);

            txt(ctx, p.name || 'لاعب', cardX + cardW / 2, cardY + 105, 16, isDead ? '#888' : '#fff');
            txt(ctx, isDead ? '💀 سقط' : '✅ نجا', cardX + cardW / 2, cardY + 128, 14, isDead ? '#ef5350' : '#4CAF50');

            // HP
            const pPct = isDead ? 0 : Math.max(0, Math.min(1, p.hp / Math.max(1, p.maxHp)));
            const pbX = cardX + 20, pbY = cardY + 150, pbW = cardW - 40, pbH = 14;
            rr(ctx, pbX, pbY, pbW, pbH, 4); ctx.fillStyle = '#030308'; ctx.fill();
            if (pPct > 0) {
                const pFW = pPct * pbW;
                ctx.save(); rr(ctx, pbX, pbY, pbW, pbH, 4); ctx.clip();
                ctx.fillStyle = '#2ecc71'; ctx.fillRect(pbX, pbY, pFW, pbH);
                ctx.restore();
            }
            txt(ctx, `${p.hp || 0} / ${p.maxHp}`, cardX + cardW / 2, pbY + 7, 11, '#ccc');

            // damage dealt
            txt(ctx, `⚔️ ضرر: ${p.totalDamage || 0}`, cardX + cardW / 2, cardY + 195, 13, '#f39c12');
        }

        // ── Caravan status ────────────────────────────────────────────────────
        const cvY = cardY + cardH + 20;
        panel(ctx, 40, cvY, W - 80, 55, caravan.hp > 0 ? '#C87533' : '#555', 0.85, 10);
        txt(ctx, '🐪 القافلة', 75, cvY + 28, 16, '#C87533', 'left');
        const cvPct = Math.max(0, Math.min(1, caravan.hp / Math.max(1, caravan.maxHp)));
        const cvBarX = 170, cvBarY = cvY + 18, cvBarW = W - 230, cvBarH = 20;
        rr(ctx, cvBarX, cvBarY, cvBarW, cvBarH, 4); ctx.fillStyle = '#030308'; ctx.fill();
        if (cvPct > 0) {
            ctx.save(); rr(ctx, cvBarX, cvBarY, cvBarW, cvBarH, 4); ctx.clip();
            ctx.fillStyle = cvPct > 0.3 ? '#C87533' : '#ef5350';
            ctx.fillRect(cvBarX, cvBarY, cvPct * cvBarW, cvBarH);
            ctx.restore();
        }
        txt(ctx, `${caravan.hp} / ${caravan.maxHp}`, cvBarX + cvBarW / 2, cvBarY + 10, 13, '#fff');

        // ── Waves cleared ─────────────────────────────────────────────────────
        const waveY = cvY + 75;
        panel(ctx, 40, waveY, W - 80, 50, '#3a3a6a', 0.8, 10);
        txt(ctx, `موجات مكتملة: ${wavesCleared} / 5`, W / 2, waveY + 26, 20, '#aac');

        // ── Rewards panel ─────────────────────────────────────────────────────
        if (isWin && rewards) {
            const rewY = waveY + 70;
            const rewH = H - rewY - 20;
            panel(ctx, 40, rewY, W - 80, rewH, '#c9a84c', 0.88, 12);

            ctx.save();
            rr(ctx, W / 2 - 110, rewY - 18, 220, 36, 10);
            ctx.fillStyle = '#090918'; ctx.fill();
            ctx.lineWidth = 1.5; ctx.strokeStyle = '#c9a84c'; ctx.stroke();
            txt(ctx, '🏆 المكافآت والجوائز', W / 2, rewY + 1, 18, '#c9a84c');
            ctx.restore();

            if (rewards.totalMora > 0)
                txt(ctx, `💰 مورا: ${rewards.totalMora.toLocaleString()}`, W / 2, rewY + 40, 22, '#ffe082');
            if (rewards.totalChests > 0)
                txt(ctx, `🎁 صناديق: ${rewards.totalChests}`, W / 2, rewY + 70, 20, '#80deea');
            if (rewards.totalRep > 0)
                txt(ctx, `🌟 سمعة: ${rewards.totalRep}`, W / 2, rewY + 95, 18, '#ef9a9a');

            // loot penalty note
            if (caravan.lootPenalty > 0) {
                txt(ctx, `⚠️ خسارة بضاعة: ${(caravan.lootPenalty * 100).toFixed(0)}% مما قُلِّلت المكافآت`, W / 2, rewY + 120, 16, '#FFA500');
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
