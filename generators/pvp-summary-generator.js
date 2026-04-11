const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');
const fs = require('fs');

try {
    GlobalFonts.registerFromPath(path.join(process.cwd(), 'fonts', 'bein-ar-normal.ttf'), 'Bein');
} catch (e) {}

const R2_BASE = 'https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev';
const R2_URL = `${R2_BASE}/images/pvp`;
const R2_VFX = `${R2_BASE}/images/vfx`;
const EMOJI_MORA = '💰'; 

const RACE_AR = {
    'Human': 'بشري', 'Dragon': 'تنين', 'Elf': 'آلف', 'Dark Elf': 'آلف الظلام',
    'Seraphim': 'سيرافيم', 'Demon': 'شيطان', 'Vampire': 'مصاص دماء',
    'Spirit': 'روح', 'Dwarf': 'قزم', 'Ghoul': 'غول', 'Hybrid': 'نصف وحش'
};

// 🛡️ تحميل الصور بأمان بدون تخزينها في RAM
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

function drawOrnatePanel(ctx, x, y, w, h, opacity, borderColor) {
    ctx.save();
    const panelGrad = ctx.createLinearGradient(x, y, x, y + h);
    panelGrad.addColorStop(0, `rgba(10, 10, 25, ${opacity})`);
    panelGrad.addColorStop(1, `rgba(5, 5, 15, ${opacity + 0.05})`);
    
    roundRect(ctx, x, y, w, h, 16);
    ctx.fillStyle = panelGrad;
    ctx.fill();
    
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = borderColor || '#3d3d5c';
    ctx.stroke();
    
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    roundRect(ctx, x+3, y+3, w-6, h-6, 13);
    ctx.stroke();
    ctx.restore();
}

function drawCircularAvatar(ctx, img, cx, cy, radius, borderColor, isDead = false, deathImg = null) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 4, 0, Math.PI * 2);
    ctx.fillStyle = isDead ? '#444444' : borderColor;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();

    if (img) {
        const aspect = img.width / img.height;
        let drawW = radius * 2, drawH = radius * 2, drawX = cx - radius, drawY = cy - radius;
        if (aspect > 1) { drawW = radius * 2 * aspect; drawX = cx - drawW / 2; } 
        else if (aspect < 1) { drawH = radius * 2 / aspect; drawY = cy - drawH / 2; }
        
        if (isDead) ctx.filter = 'grayscale(100%) brightness(40%)';
        ctx.drawImage(img, drawX, drawY, drawW, drawH);
        ctx.filter = 'none';
    } else {
        ctx.fillStyle = '#1a1a2e'; ctx.fill();
    }

    if (isDead && deathImg) {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 0.75;
        const imgAspect = deathImg.width / deathImg.height;
        let vfxW = radius * 2.8;
        let vfxH = vfxW / imgAspect;
        
        if (vfxH > radius * 2.8) {
            vfxH = radius * 2.8;
            vfxW = vfxH * imgAspect;
        }

        ctx.drawImage(deathImg, cx - (vfxW / 2), cy - (vfxH / 2), vfxW, vfxH);
    }
    
    ctx.restore();
}

async function generatePvPChallengeImage(challenger, opponent, bet, totalPot, status = 'pending') {
    try {
        const W = 1200, H = 760;
        const canvas = createCanvas(W, H);
        const ctx = canvas.getContext('2d');

        const bgImg = await getSafeImage(`${R2_URL}/pvp_arena_bg.png`, 'pvp_arena_bg.png');
        if (bgImg) {
            ctx.drawImage(bgImg, 0, 0, W, H);
            ctx.fillStyle = 'rgba(5, 5, 15, 0.75)';
            ctx.fillRect(0, 0, W, H);
        } else {
            ctx.fillStyle = '#0a0a14'; ctx.fillRect(0, 0, W, H);
        }

        const panelW = 460, panelH = 260; 
        const p1PanelX = 35, panelY = 40;
        const p2PanelX = W - panelW - 35;

        drawOrnatePanel(ctx, p1PanelX, panelY, panelW, panelH, 0.55, '#4fc3f7');
        drawOrnatePanel(ctx, p2PanelX, panelY, panelW, panelH, 0.55, '#ef5350');

        const [p1Img, p2Img, vsImg] = await Promise.all([
            getSafeImage(challenger?.avatar, null),
            getSafeImage(opponent?.avatar, null),
            getSafeImage('https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev/images/pvp/pvp_log_panel.png', 'pvp_log_panel.png')
        ]);

        drawCircularAvatar(ctx, p1Img, p1PanelX + panelW/2, panelY + 100, 70, '#4fc3f7');
        drawCircularAvatar(ctx, p2Img, p2PanelX + panelW/2, panelY + 100, 70, '#ef5350');

        ctx.fillStyle = '#ffffff'; ctx.font = 'bold 26px "Bein"'; ctx.textAlign = 'center';
        ctx.fillText((challenger?.name || "مقاتل").replace(/[!.]/g, ''), p1PanelX + panelW/2, panelY + 210);
        ctx.fillText((opponent?.name || "مقاتل").replace(/[!.]/g, ''), p2PanelX + panelW/2, panelY + 210);

        ctx.fillStyle = '#c9a84c'; ctx.font = 'bold 18px "Bein"';
        ctx.fillText(`مستوى: ${challenger?.level || 1} | عرق: ${RACE_AR[challenger?.race] || challenger?.race || "مجهول"}`, p1PanelX + panelW/2, panelY + 240);
        ctx.fillText(`مستوى: ${opponent?.level || 1} | عرق: ${RACE_AR[opponent?.race] || opponent?.race || "مجهول"}`, p2PanelX + panelW/2, panelY + 240);

        if (vsImg) ctx.drawImage(vsImg, W/2 - 60, panelY + 70, 120, 120);

        const logPanelY = 340;
        const logPanelH = H - logPanelY - 30;
        drawOrnatePanel(ctx, 30, logPanelY, W - 60, logPanelH, 0.65, '#c9a84c');

        ctx.save();
        roundRect(ctx, W/2 - 140, logPanelY - 20, 280, 40, 12);
        ctx.fillStyle = '#0a0a19'; 
        ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = '#c9a84c'; ctx.stroke();
        ctx.fillStyle = '#c9a84c'; ctx.font = 'bold 22px "Bein"'; ctx.textAlign = 'center';
        ctx.fillText('⚔️ تحدي حلبة النزاع ⚔️', W/2, logPanelY + 10);
        ctx.restore();

        const cleanChallengerName = (challenger?.name || "مقاتل").replace(/[!.]/g, '');
        ctx.font = 'bold 34px "Bein"';
        const nameWidth = ctx.measureText(cleanChallengerName).width;
        const nameBoxW = Math.max(nameWidth + 80, 240);
        
        ctx.save();
        const nameGrad = ctx.createLinearGradient(W/2 - nameBoxW/2, logPanelY + 45, W/2 + nameBoxW/2, logPanelY + 100);
        nameGrad.addColorStop(0, 'rgba(10, 15, 30, 0.4)');
        nameGrad.addColorStop(0.5, 'rgba(30, 45, 80, 0.6)');
        nameGrad.addColorStop(1, 'rgba(10, 15, 30, 0.4)');
        
        roundRect(ctx, W/2 - nameBoxW/2, logPanelY + 45, nameBoxW, 55, 20);
        ctx.fillStyle = nameGrad;
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(79, 195, 247, 0.5)';
        ctx.stroke();
        ctx.fillStyle = '#ffffff'; 
        ctx.fillText(cleanChallengerName, W/2, logPanelY + 84);
        ctx.restore();

        if (status === 'pending') {
            ctx.fillStyle = '#aaaaac'; ctx.font = 'bold 28px "Bein"';
            ctx.fillText('يطلب مواجهتك في تحدي', W/2, logPanelY + 145);

            const bottomBoxesY = logPanelY + 190;
            const boxWidth = 340;
            const boxHeight = 110;
            
            ctx.save();
            const betGrad = ctx.createLinearGradient(W/2 - boxWidth - 25, bottomBoxesY, W/2 - 25, bottomBoxesY + boxHeight);
            betGrad.addColorStop(0, 'rgba(15, 25, 40, 0.5)');
            betGrad.addColorStop(1, 'rgba(25, 40, 60, 0.6)');
            roundRect(ctx, W/2 - boxWidth - 25, bottomBoxesY, boxWidth, boxHeight, 16);
            ctx.fillStyle = betGrad;
            ctx.fill();
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = 'rgba(79, 195, 247, 0.4)';
            ctx.stroke();
            ctx.fillStyle = '#b3e5fc';
            ctx.font = 'bold 22px "Bein"';
            ctx.fillText('الرهان المطلوب', W/2 - boxWidth/2 - 25, bottomBoxesY + 40);
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 42px "Bein"';
            ctx.fillText((bet || 0).toLocaleString(), W/2 - boxWidth/2 - 25, bottomBoxesY + 95);
            ctx.restore();

            ctx.save();
            const prizeGrad = ctx.createLinearGradient(W/2 + 25, bottomBoxesY, W/2 + boxWidth + 25, bottomBoxesY + boxHeight);
            prizeGrad.addColorStop(0, 'rgba(35, 30, 15, 0.5)');
            prizeGrad.addColorStop(1, 'rgba(55, 45, 20, 0.6)');
            roundRect(ctx, W/2 + 25, bottomBoxesY, boxWidth, boxHeight, 16);
            ctx.fillStyle = prizeGrad;
            ctx.fill();
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = 'rgba(201, 168, 76, 0.5)';
            ctx.stroke();
            ctx.fillStyle = '#fbe9e7';
            ctx.font = 'bold 22px "Bein"';
            ctx.fillText('الجائزة الكبرى', W/2 + boxWidth/2 + 25, bottomBoxesY + 40);
            ctx.fillStyle = '#c9a84c';
            ctx.font = 'bold 48px "Bein"';
            ctx.fillText((totalPot || 0).toLocaleString(), W/2 + boxWidth/2 + 25, bottomBoxesY + 95);
            ctx.restore();
        } else {
            let statusText = "";
            let statusColor = "";
            let subText = "";

            if (status === 'declined') { 
                statusText = "تــم رفــض الـتـحــدي 🛡️"; 
                statusColor = "#ef5350"; 
                subText = "لم يمتلك الخصم الشجاعة الكافية لقبول المواجهة!";
            } else if (status === 'canceled') { 
                statusText = "تــم إلـغــاء الـتـحــدي 🛑"; 
                statusColor = "#95a5a6"; 
                subText = "تم التراجع عن طلب المواجهة.";
            } else if (status === 'timeout') { 
                statusText = "انـتـهــى وقــت الـتـحــدي ⏳"; 
                statusColor = "#95a5a6"; 
                subText = "نفد الوقت المخصص لقبول المواجهة.";
            }

            ctx.fillStyle = statusColor;
            ctx.font = 'bold 45px "Bein"';
            ctx.fillText(statusText, W/2, logPanelY + 190);

            ctx.fillStyle = '#aaaaac';
            ctx.font = 'bold 24px "Bein"';
            ctx.fillText(subText, W/2, logPanelY + 250);
        }

        return await canvas.encode('image/png');
    } catch (e) { return null; }
}

async function generatePvPResultImage(battleState, winnerId, gradeText, finalMora, chestsEarned) {
    try {
        if (!battleState || !battleState.players || battleState.players.size < 2) return null;

        const W = 1200, H = 900; 
        const canvas = createCanvas(W, H);
        const ctx = canvas.getContext('2d');

        const p1Id = Array.from(battleState.players.keys())[0];
        const p2Id = Array.from(battleState.players.keys())[1];
        const p1 = battleState.players.get(p1Id);
        const p2 = battleState.players.get(p2Id);

        if (!p1 || !p2) return null; // حماية إضافية ضد الـ Crash

        const p1Dead = p1.hp <= 0;
        const p2Dead = p2.hp <= 0;
        const isP1Winner = p1Id === winnerId;
        const isP2Winner = p2Id === winnerId;

        const fallback = 'https://i.postimg.cc/WzRGhgJ9/mwraks.png';
        const p1Url = p1.isMonster ? (p1.image || fallback) : (p1.member?.user?.displayAvatarURL({ extension: 'png', size: 512, forceStatic: true }) || fallback);
        const p2Url = p2.isMonster ? (p2.image || fallback) : (p2.member?.user?.displayAvatarURL({ extension: 'png', size: 512, forceStatic: true }) || fallback);

        const [bgImg, p1Img, p2Img, deathImg] = await Promise.all([
            getSafeImage(`${R2_URL}/pvp_arena_bg.png`, 'pvp_arena_bg.png'),
            getSafeImage(p1Url, null),
            getSafeImage(p2Url, null),
            getSafeImage(`${R2_VFX}/vfx_death.png`, 'vfx_death.png') 
        ]);

        if (bgImg) {
            ctx.drawImage(bgImg, 0, 0, W, H);
            ctx.fillStyle = 'rgba(5, 5, 20, 0.75)'; ctx.fillRect(0, 0, W, H);
        } else { ctx.fillStyle = '#0a0a14'; ctx.fillRect(0, 0, W, H); }

        const panelW = 460, panelH = 340; 
        const p1PanelX = 35, panelY = 40;
        const p2PanelX = W - panelW - 35;

        drawOrnatePanel(ctx, p1PanelX, panelY, panelW, panelH, 0.6, isP1Winner ? '#c9a84c' : '#2a2a4a');
        drawOrnatePanel(ctx, p2PanelX, panelY, panelW, panelH, 0.6, isP2Winner ? '#c9a84c' : '#2a2a4a');

        drawCircularAvatar(ctx, p1Img, p1PanelX + panelW/2, panelY + 110, 80, isP1Winner ? '#c9a84c' : '#ef5350', p1Dead, deathImg);
        drawCircularAvatar(ctx, p2Img, p2PanelX + panelW/2, panelY + 110, 80, isP2Winner ? '#c9a84c' : '#ef5350', p2Dead, deathImg);

        const p1Name = p1.isMonster ? (p1.name || "وحش") : (p1.member?.user?.displayName || p1.member?.user?.username || "مقاتل");
        const p2Name = p2.isMonster ? (p2.name || "وحش") : (p2.member?.user?.displayName || p2.member?.user?.username || "مقاتل");

        ctx.textAlign = 'center'; ctx.fillStyle = '#ffffff'; ctx.font = 'bold 28px "Bein"';
        ctx.fillText(p1Name.replace(/[!.]/g, ''), p1PanelX + panelW/2, panelY + 230);
        ctx.fillText(p2Name.replace(/[!.]/g, ''), p2PanelX + panelW/2, panelY + 230);

        ctx.fillStyle = p1Dead ? '#ef5350' : '#2ecc71'; ctx.font = 'bold 22px "Bein"';
        ctx.fillText(`HP: ${Math.floor(p1.hp || 0)} / ${p1.maxHp || 0}`, p1PanelX + panelW/2, panelY + 270);
        ctx.fillStyle = p2Dead ? '#ef5350' : '#2ecc71';
        ctx.fillText(`HP: ${Math.floor(p2.hp || 0)} / ${p2.maxHp || 0}`, p2PanelX + panelW/2, panelY + 270);

        ctx.fillStyle = '#aaaaac'; ctx.font = 'bold 18px "Bein"';
        ctx.fillText(`الضرر الكلي: ${battleState.stats?.[p1Id]?.damageDealt || 0}`, p1PanelX + panelW/2, panelY + 310);
        ctx.fillText(`الضرر الكلي: ${battleState.stats?.[p2Id]?.damageDealt || 0}`, p2PanelX + panelW/2, panelY + 310);

        ctx.fillStyle = '#c9a84c'; ctx.font = 'bold 45px "Bein"';
        if (isP1Winner) ctx.fillText('👑', p1PanelX + panelW/2, panelY + 20);
        if (isP2Winner) ctx.fillText('👑', p2PanelX + panelW/2, panelY + 20);

        const logPanelY = 410;
        const logPanelH = 460; 
        const isGradeF = gradeText && gradeText.includes('[ F ]');
        drawOrnatePanel(ctx, 30, logPanelY, W - 60, logPanelH, 0.7, isGradeF ? '#ef5350' : '#c9a84c');

        ctx.save();
        roundRect(ctx, W/2 - 140, logPanelY - 20, 280, 40, 12);
        ctx.fillStyle = '#0a0a19'; 
        ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = isGradeF ? '#ef5350' : '#c9a84c'; ctx.stroke();
        ctx.fillStyle = isGradeF ? '#ef5350' : '#c9a84c'; ctx.font = 'bold 22px "Bein"'; ctx.textAlign = 'center';
        ctx.fillText('النتـائـج والجـوائـز', W/2, logPanelY + 10);
        ctx.restore();

        ctx.fillStyle = '#ffffff'; ctx.font = 'bold 26px "Bein"'; ctx.textAlign = 'center';
        let displayGrade = (gradeText || "تقييم غير متوفر").replace(/[!.]/g, '');
        if (displayGrade.includes('-')) {
            const parts = displayGrade.split('-');
            displayGrade = `${parts[1].trim()} - ${parts[0].trim()}`;
        }
        ctx.fillText(displayGrade, W/2, logPanelY + 70);

        const p1CX = p1PanelX + panelW/2;
        const p2CX = p2PanelX + panelW/2;

        const winnerCX = isP1Winner ? p1CX : p2CX;
        const loserCX = isP1Winner ? p2CX : p1CX;

        ctx.textAlign = 'center'; 
        
        ctx.fillStyle = '#4fc3f7'; ctx.font = 'bold 22px "Bein"';
        ctx.fillText('✦ غنائم المنتصر ✦', winnerCX, logPanelY + 125);
        
        ctx.fillStyle = '#ef5350'; ctx.font = 'bold 22px "Bein"';
        ctx.fillText('✦ حالة المهزوم ✦', loserCX, logPanelY + 125);

        ctx.fillStyle = '#ffffff'; ctx.font = 'bold 20px "Bein"';
        
        if (isGradeF) {
            ctx.fillStyle = '#ef5350';
            ctx.fillText('إلغاء المعركة ومصادرة الجوائز', winnerCX, logPanelY + 175);
            ctx.fillText('استرجاع مبلغ الرهان فقط', winnerCX, logPanelY + 220);
            ctx.fillText('لا يوجد فائز في هذا النزال', loserCX, logPanelY + 175);
        } else {
            ctx.fillText(`مورا: ${(finalMora || 0).toLocaleString()} 💰`, winnerCX, logPanelY + 175);
            if (chestsEarned > 0) ctx.fillText(`صناديق: ${chestsEarned} 🎁`, winnerCX, logPanelY + 220);
            let buffTextCount = (chestsEarned > 0) ? 265 : 220;
            if (gradeText && (gradeText.includes('S') || gradeText.includes('A') || gradeText.includes('B'))) {
                ctx.fillText(`تعزيز: 15% مورا وخبرة ⚡`, winnerCX, logPanelY + buffTextCount);
            }

            ctx.fillText(`خسارة مبلغ الرهان بالكامل 💸`, loserCX, logPanelY + 175);
            ctx.fillText(`لعنة -15% لـ 15د 🤕`, loserCX, logPanelY + 220);
            ctx.fillText(`سيدخل المعارك بنصف صحته ⚠️`, loserCX, logPanelY + 265);
        }

        const betAreaY = logPanelY + 310;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(60, betAreaY);
        ctx.lineTo(W - 60, betAreaY);
        ctx.strokeStyle = 'rgba(201, 168, 76, 0.3)';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#c9a84c';
        ctx.font = 'bold 24px "Bein"';
        ctx.textAlign = 'center';
        ctx.fillText('✶ توزيع أربـاح المـراهنـات ✶', W/2, betAreaY + 40);

        if (isGradeF) {
            ctx.fillStyle = '#aaaaac';
            ctx.fillText('تمت إعادة جميع الرهانات لأصحابها بسبب جودة المعركة', W/2, betAreaY + 80);
        } else {
            const pool = battleState.bettingPool;
            const totalBetPool = (pool?.totalP1 || 0) + (pool?.totalP2 || 0);
            
            if (totalBetPool > 0) {
                ctx.font = '18px "Bein"';
                ctx.fillStyle = '#ffffff';
                ctx.fillText(`إجمالي الصندوق: ${totalBetPool.toLocaleString()} 💰 | الضريبة: 5%`, W/2, betAreaY + 75);

                let winnersList = [];
                let totalWinnerBet = 0;
                
                if (pool && pool.bets) {
                    for (const [uid, betObj] of pool.bets.entries()) {
                        if (betObj.targetId === winnerId) {
                            let bettorName = betObj.name;
                            if (!bettorName && battleState.message) {
                                const member = battleState.message.guild?.members?.cache.get(uid);
                                const user = battleState.message.client?.users?.cache.get(uid);
                                bettorName = member?.displayName || user?.username || "مقاتل";
                            } else if (!bettorName) {
                                bettorName = "مقاتل";
                            }
                            
                            bettorName = bettorName.replace(/[!.]/g, '').substring(0, 12);
                            winnersList.push({ id: uid, amount: betObj.amount, name: bettorName });
                            totalWinnerBet += betObj.amount;
                        }
                    }
                }

                if (winnersList.length > 0) {
                    const netPot = Math.floor(totalBetPool * 0.95);
                    let startY = betAreaY + 115;
                    ctx.font = '16px "Bein"';
                    ctx.fillStyle = '#2ecc71';
                    
                    let lines = [];
                    let currentLine = "";
                    
                    winnersList.forEach((win, idx) => {
                        const payout = Math.floor(netPot * (win.amount / totalWinnerBet));
                        const entry = `${win.name} (${payout.toLocaleString()})`;
                        
                        if (ctx.measureText(currentLine + " | " + entry).width > W - 150) {
                            lines.push(currentLine);
                            currentLine = entry;
                        } else {
                            currentLine += currentLine === "" ? entry : `  |  ${entry}`;
                        }
                    });
                    if (currentLine !== "") lines.push(currentLine);

                    lines.forEach((line, i) => {
                        ctx.fillText(line, W/2, startY + (i * 28));
                    });

                } else {
                    ctx.fillStyle = '#ef5350';
                    ctx.fillText('لم يراهن أحد على الفائز.. صودرت المبالغ!', W/2, betAreaY + 110);
                }
            } else {
                ctx.fillStyle = '#aaaaac';
                ctx.fillText('لا توجد مراهنات في هذه المعركة', W/2, betAreaY + 80);
            }
        }
        ctx.restore();

        return await canvas.encode('image/png');
    } catch (e) { 
        console.error("Generator Error PvP Result:", e);
        return null; 
    }
}

module.exports = { generatePvPChallengeImage, generatePvPResultImage };
