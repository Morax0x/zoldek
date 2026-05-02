const { loadImage } = require('@napi-rs/canvas'); // 👑 سحب مباشر من المكتبة القوية

const {
    createCanvas, W, H, C, FE,
    drawBg, drawHeader, drawCornerAccents, drawPanel,
    divLine, toBuf,
    M, L, R, rr,
    getItemNameSafe, truncate,
} = require('./shared');

// 👑 نظام الكاش الخاص بك لسحب الصور السحابية بدون فشل 👑
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
    const core   = require('../../handlers/caravan-core.js');
    const canvas = createCanvas(W, H);
    const ctx    = canvas.getContext('2d');
    await drawBg(ctx, 'hubbg');
    await drawHeader(ctx, 'تجهيز القافلة', 'الحد الاقصى 3 ادوات (بحد أقصى 20 حبة لكل أداة)');
    drawCornerAccents(ctx);

    const RARITY_COL = {
        Common: '#A8B8D0', Uncommon: '#2ECC71', Rare: '#00C3FF',
        Epic: '#B968FF',   Legendary: '#FFD700',
    };

    const sw = 480, sh = 220, sgap = 30;
    const sx0 = (W - (3 * sw + sgap * 2)) / 2;
    const sy0 = 160;

    // 1️⃣ الخانات العلوية
    for (let s = 0; s < 3; s++) {
        const sx  = sx0 + s * (sw + sgap);
        
        const eqObj = equipped[s] || null;
        let id = null, count = 0;
        if (eqObj) {
            if (typeof eqObj === 'string') { id = eqObj; count = 1; }
            else { id = eqObj.id; count = eqObj.count; }
        }
        
        const itm = id ? allItems.find(x => x.id === id) : null;
        const col = itm ? (RARITY_COL[itm.rarity] || C.textD) : '#2A3A4A';

        drawPanel(ctx, sx, sy0, sw, sh, col, { noCorners: !itm, radius: 24 });

        rr(ctx, sx + 20, sy0 + 20, 48, 36, 10);
        ctx.fillStyle = col + '44'; ctx.fill();
        M(ctx, String(s + 1), sx + 44, sy0 + 38, 24, col);

        if (itm) {
            let hasImage = false;
            if (itm.imgPath) {
                // 👑 استخدام الدالة الجديدة الأكيدة 👑
                const img = await getCachedImage(itm.imgPath);
                if (img) {
                    ctx.drawImage(img, sx + 25, sy0 + 65, 80, 80);
                    hasImage = true;
                }
            }

            if (!hasImage) {
                ctx.font = `70px ${FE}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
                ctx.fillText(itm.emoji || (itm.type === 'book' ? '📖' : '⚙️'), sx + 30, sy0 + 105);
            }

            const rarityArabic = RARITY_AR[itm.rarity] || itm.rarity;
            R(ctx, (itm.name || getItemNameSafe(id)).substring(0, 18), sx + sw - 20, sy0 + 55, 30, col);
            R(ctx, `${rarityArabic} | الكمية: ${count}`, sx + sw - 20, sy0 + 95, 24, C.textD);

            const isMat = itm.type === 'material' || !itm.type?.includes('book');
            const bPct  = { Common:.03, Uncommon:.05, Rare:.08, Epic:.12, Legendary:.20 }[itm.rarity] || .03;
            const totalPct = (bPct * count * 100).toFixed(0); 
            const bLabel = isMat ? `سرعة اضافية ${totalPct}%` : `حظ اضافي ${totalPct}%`;
            R(ctx, bLabel, sx + sw - 20, sy0 + 135, 24, col);

            divLine(ctx, sx + 20, sy0 + 175, sw - 40, col + '44');
            M(ctx, 'مجهزة بالقافلة (اضغط للإزالة)', sx + sw / 2, sy0 + 195, 22, '#4A7A4A');
        } else {
            ctx.globalAlpha = 0.20;
            ctx.font = `80px ${FE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('➕', sx + sw / 2, sy0 + sh / 2 + 10);
            ctx.globalAlpha = 1;
            M(ctx, `الفتحة فارغة`, sx + sw / 2, sy0 + sh - 35, 26, '#334455');
        }
    }

    // 2️⃣ شريط التأثيرات الإجمالية
    const buffs = core.getEquippedBuffs(equipped);
    const sumY  = sy0 + sh + 35; // 415
    const sbg   = ctx.createLinearGradient(60, sumY, W - 60, sumY + 70);
    sbg.addColorStop(0, 'rgba(0,195,255,0.08)');
    sbg.addColorStop(1, 'rgba(46,204,113,0.08)');
    rr(ctx, 60, sumY, W - 120, 70, 16);
    ctx.fillStyle = sbg; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 2;
    rr(ctx, 60, sumY, W - 120, 70, 16); ctx.stroke();

    const bText = `اجمالي السرعة ${(buffs.speedBuff * 100).toFixed(0)}%   |   اجمالي الحظ ${(buffs.luckBuff * 100).toFixed(0)}%`;
    M(ctx, bText, W / 2, sumY + 35, 30, C.text);

    // 3️⃣ المخزن
    const gridY = sumY + 90; // 505
    divLine(ctx, 60, gridY, W - 120, C.gold + '33');
    M(ctx, 'الادوات المتوفرة في المخزن', W / 2, gridY + 40, 30, C.gold);

    const iw = 220, ih = 140, igap = 20, cols = 6;
    const igw = cols * iw + (cols - 1) * igap;
    const igx = (W - igw) / 2;
    const igy = gridY + 70;

    const safeRows = invRows || [];
    
    // ترتيب تنازلي
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
        
        const eqObj = equipped.find(x => {
            if (typeof x === 'string') return x === id;
            return x.id === id;
        });
        const isEq = !!eqObj;
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
            // 👑 استخدام الدالة الجديدة الأكيدة للمخزن 👑
            const img = await getCachedImage(itm.imgPath);
            if (img) {
                ctx.drawImage(img, ix + iw / 2 - 30, iy + 15, 60, 60);
                hasGridImage = true;
            }
        }

        if (!hasGridImage) {
            ctx.font = `50px ${FE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(itm?.emoji || (itm?.type === 'book' ? '📖' : '⚙️'), ix + iw / 2, iy + 45);
        }

        const rarityArabic = RARITY_AR[itm?.rarity] || itm?.rarity || '';
        M(ctx, truncate(itm?.name || getItemNameSafe(id), 14), ix + iw / 2, iy + 100, 22, col);
        M(ctx, `${rarityArabic} | المتوفر: ${availableQty}`, ix + iw / 2, iy + 125, 16, C.textD);
    }

    return await canvas.encode ? canvas.encode('png') : canvas.toBuffer('image/png');
}

module.exports = { generateEquipPanel };
