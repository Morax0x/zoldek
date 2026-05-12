const { loadImage } = require('@napi-rs/canvas'); 

const {
    createCanvas, W, H, C, FE,
    drawBg, drawHeader, drawCornerAccents, drawPanel,
    divLine, toBuf,
    M, L, R, rr,
    getItemNameSafe, truncate,
} = require('./shared');

const path = require('path');

const imageCache = new Map();
async function getCachedImage(imageUrl) {
    if (!imageUrl) return null;
    const encodedUrl = encodeURI(imageUrl);
    if (imageCache.has(encodedUrl)) return imageCache.get(encodedUrl);
    try {
        const img = await loadImage(encodedUrl);
        imageCache.set(encodedUrl, img);
        return img;
    } catch (e) {
        return null;
    }
}

const RARITY_AR = {
    'Common': 'عادي',
    'Uncommon': 'شائع',
    'Rare': 'نادر',
    'Epic': 'ملحمي',
    'Legendary': 'أسطوري'
};

async function generateEquipPanel(user, equipped, invRows, allItems, mora) {
    const core   = require('../../handlers/caravan/index.js');
    const canvas = createCanvas(W, H);
    const ctx    = canvas.getContext('2d');
    await drawBg(ctx, 'hubbg');
    await drawHeader(ctx, 'تجهيز القافلة', 'الحد الاقصى 3 ادوات (بحد أقصى 20 حبة لكل أداة)');
    drawCornerAccents(ctx);

    const RARITY_COL = {
        Common: '#A8B8D0', Uncommon: '#2ECC71', Rare: '#00C3FF',
        Epic: '#B968FF',   Legendary: '#FFD700',
    };

    const SLOT_NAMES = ['⚡ سرعة القافلة', '🛡️ دفاع القافلة', '🍀 حظ القافلة'];
    const SLOT_COLORS = ['#00C3FF', '#2ECC71', '#FFD700'];

    const sw = 480, sh = 220, sgap = 30;
    const sx0 = (W - (3 * sw + sgap * 2)) / 2;
    const sy0 = 160;

    for (let s = 0; s < 3; s++) {
        const sx  = sx0 + s * (sw + sgap);
        
        const eqObj = equipped ? equipped[s] : null;
        let id = null, count = 0;
        if (eqObj && typeof eqObj === 'object') {
            id = eqObj.id || null;
            count = eqObj.count || 0;
        } else if (typeof eqObj === 'string') {
            id = eqObj; count = 1;
        }
        
        const itm = id ? allItems.find(x => x.id === id) : null;
        const slotColor = SLOT_COLORS[s];
        const col = itm ? (RARITY_COL[itm.rarity] || C.textD) : '#2A3A4A';

        drawPanel(ctx, sx, sy0, sw, sh, itm ? col : slotColor, { noCorners: !itm, radius: 24 });

        // Slot name label at top
        rr(ctx, sx + 20, sy0 + 12, 48, 36, 10);
        ctx.fillStyle = slotColor + '44'; ctx.fill();
        M(ctx, String(['1','2','3'][s]), sx + 44, sy0 + 30, 22, slotColor);
        R(ctx, SLOT_NAMES[s], sx + sw - 20, sy0 + 32, 26, slotColor);

        if (itm) {
            let hasImage = false;
            if (itm.imgPath) {
                const img = await getCachedImage(itm.imgPath);
                if (img) {
                    const imgSize = 90;
                    const imgX = sx + 20;
                    const imgY = sy0 + 60;
                    ctx.save();
                    rr(ctx, imgX, imgY, imgSize, imgSize, 12);
                    ctx.clip();
                    ctx.drawImage(img, imgX, imgY, imgSize, imgSize);
                    ctx.restore();
                    hasImage = true;
                }
            }

            if (!hasImage) {
                ctx.font = `70px ${FE}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
                ctx.fillText(itm.emoji || '⚙️', sx + 30, sy0 + 105);
            }

            const rarityArabic = RARITY_AR[itm.rarity] || itm.rarity;
            R(ctx, (itm.name || getItemNameSafe(id)).substring(0, 18), sx + sw - 20, sy0 + 55, 30, col);
            R(ctx, `${rarityArabic} | الكمية: ${count}`, sx + sw - 20, sy0 + 95, 24, C.textD);

            const bPct = { Common: 0.005, Uncommon: 0.01, Rare: 0.02, Epic: 0.05, Legendary: 0.10 }[itm.rarity] || 0.005;
            const totalPct = (bPct * count * 100).toFixed(1).replace(/\.0$/, '');
            const bLabel = `${['سرعة اضافية', 'دفاع اضافي', 'حظ اضافي'][s]} ${totalPct}%`;
            R(ctx, bLabel, sx + sw - 20, sy0 + 135, 24, col);

            divLine(ctx, sx + 20, sy0 + 175, sw - 40, col + '44');
            M(ctx, 'مجهزة (اضغط الزر للإزالة)', sx + sw / 2, sy0 + 195, 22, '#4A7A4A');
        } else {
            ctx.globalAlpha = 0.20;
            ctx.font = `80px ${FE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('➕', sx + sw / 2, sy0 + sh / 2 + 10);
            ctx.globalAlpha = 1;
            M(ctx, `الفتحة فارغة`, sx + sw / 2, sy0 + sh - 35, 26, '#334455');
        }
    }

    const buffs = core.getEquippedBuffs(equipped || [null, null, null]);
    const sumY  = sy0 + sh + 35;
    const sbg   = ctx.createLinearGradient(60, sumY, W - 60, sumY + 70);
    sbg.addColorStop(0, 'rgba(0,195,255,0.08)');
    sbg.addColorStop(1, 'rgba(46,204,113,0.08)');
    rr(ctx, 60, sumY, W - 120, 70, 16);
    ctx.fillStyle = sbg; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 2;
    rr(ctx, 60, sumY, W - 120, 70, 16); ctx.stroke();

    const fmtPct = (v) => (v * 100).toFixed(1).replace(/\.0$/, '');
    const bText = `⚡ سرعة ${fmtPct(buffs.speedBuff)}%   |   🛡️ دفاع ${fmtPct(buffs.defenseBuff || 0)}%   |   🍀 حظ ${fmtPct(buffs.luckBuff)}%`;
    M(ctx, bText, W / 2, sumY + 35, 30, C.text);

    const gridY = sumY + 90;
    divLine(ctx, 60, gridY, W - 120, C.gold + '33');
    M(ctx, 'الادوات المتوفرة في المخزن', W / 2, gridY + 40, 30, C.gold);

    const iw = 220, ih = 140, igap = 20, cols = 6;
    const igw = cols * iw + (cols - 1) * igap;
    const igx = (W - igw) / 2;
    const igy = gridY + 70;

    const safeRows = invRows || [];
    
    safeRows.sort((a, b) => {
        const qtyA = Number(a.quantity || a.QUANTITY || 0);
        const qtyB = Number(b.quantity || b.QUANTITY || 0);
        return qtyB - qtyA; 
    });

    const maxShow = Math.min(safeRows.length, 12);

    for (let i = 0; i < maxShow; i++) {
        const row  = safeRows[i];
        const id   = row.itemid || row.itemID || row.ITEMID;
        const itm  = allItems.find(x => x.id === id);
        const col  = itm ? (RARITY_COL[itm.rarity] || C.textD) : '#334455';
        
        const eqIdx = Array.isArray(equipped) ? equipped.findIndex(x => x && (typeof x === 'string' ? x === id : x.id === id)) : -1;
        const isEq = eqIdx !== -1;
        const availableQty = Number(row.quantity || row.QUANTITY || 0);
        
        const ix   = igx + (i % cols) * (iw + igap);
        const iy   = igy + Math.floor(i / cols) * (ih + igap);

        const ibg = ctx.createLinearGradient(ix, iy, ix, iy + ih);
        ibg.addColorStop(0, col + (isEq ? '33' : '14'));
        ibg.addColorStop(1, 'rgba(4,6,14,0.95)');
        rr(ctx, ix, iy, iw, ih, 16);
        ctx.fillStyle = ibg; ctx.fill();
        ctx.strokeStyle = isEq ? col : col + '44';
        ctx.lineWidth   = isEq ? 3 : 1.5;
        rr(ctx, ix, iy, iw, ih, 16); ctx.stroke();

        if (isEq) { L(ctx, '✅', ix + 12, iy + 26, 24, C.green); }

        let hasGridImage = false;
        if (itm && itm.imgPath) {
            const img = await getCachedImage(itm.imgPath);
            if (img) {
                const gImgSize = 60;
                const gImgX = ix + iw / 2 - gImgSize / 2;
                const gImgY = iy + 12;
                ctx.save();
                rr(ctx, gImgX, gImgY, gImgSize, gImgSize, 10);
                ctx.clip();
                ctx.drawImage(img, gImgX, gImgY, gImgSize, gImgSize);
                ctx.restore();
                hasGridImage = true;
            }
        }

        if (!hasGridImage) {
            ctx.font = `50px ${FE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(itm?.emoji || '⚙️', ix + iw / 2, iy + 42);
        }

        const rarityArabic = RARITY_AR[itm?.rarity] || itm?.rarity || '';
        M(ctx, truncate(itm?.name || getItemNameSafe(id), 14), ix + iw / 2, iy + 100, 22, col);
        M(ctx, `${rarityArabic} | المتوفر: ${availableQty}`, ix + iw / 2, iy + 125, 16, C.textD);
    }

    return await canvas.encode ? canvas.encode('png') : canvas.toBuffer('image/png');
}

module.exports = { generateEquipPanel };
