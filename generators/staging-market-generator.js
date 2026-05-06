const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');
const fs = require('fs');

// Register fonts
try {
    const fontsDir = path.join(process.cwd(), 'fonts');
    const beinPath = path.join(fontsDir, 'bein-ar-normal.ttf');
    const emojiPath = path.join(fontsDir, 'NotoEmoj.ttf');
    if (fs.existsSync(beinPath)) GlobalFonts.registerFromPath(beinPath, 'Bein');
    if (fs.existsSync(emojiPath)) GlobalFonts.registerFromPath(emojiPath, 'Emoji');
} catch (e) {}

const R2_URL = 'https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev';
const RARITY_COLORS = {
    'Common': '#A8B8D0',
    'Uncommon': '#2ECC71',
    'Rare': '#00C3FF',
    'Epic': '#B968FF',
    'Legendary': '#FFD700'
};

const ID_TO_IMAGE = {
    'mat_dragon_1': 'dragon_ash.png', 'mat_dragon_2': 'dragon_scale.png', 'mat_dragon_3': 'dragon_claw.png', 'mat_dragon_4': 'dragon_heart.png', 'mat_dragon_5': 'dragon_core.png',
    'mat_human_1': 'human_iron.png', 'mat_human_2': 'human_steel.png', 'mat_human_3': 'human_meteor.png', 'mat_human_4': 'human_seal.png', 'mat_human_5': 'human_crown.png',
    'mat_elf_1': 'elf_branch.png', 'mat_elf_2': 'elf_bark.png', 'mat_elf_3': 'elf_flower.png', 'mat_elf_4': 'elf_crystal.png', 'mat_elf_5': 'elf_tear.png',
    'mat_darkelf_1': 'darkelf_obsidian.png', 'mat_darkelf_2': 'darkelf_glass.png', 'mat_darkelf_3': 'darkelf_crystal.png', 'mat_darkelf_4': 'darkelf_void.png', 'mat_darkelf_5': 'darkelf_ash.png',
    'mat_seraphim_1': 'seraphim_feathe.png', 'mat_seraphim_2': 'seraphim_halo.png', 'mat_seraphim_3': 'seraphim_crystal.png', 'mat_seraphim_4': 'seraphim_core.png', 'mat_seraphim_5': 'seraphim_chalice.png',
    'mat_demon_1': 'demon_ember.png', 'mat_demon_2': 'demon_horn.png', 'mat_demon_3': 'demon_crystal.png', 'mat_demon_4': 'demon_flame.png', 'mat_demon_5': 'demon_crown.png',
    'mat_vampire_1': 'vampire_blood.png', 'mat_vampire_2': 'vampire_vial.png', 'mat_vampire_3': 'vampire_fang.png', 'mat_vampire_4': 'vampire_moon.png', 'mat_vampire_5': 'vampire_chalice.png',
    'mat_spirit_1': 'spirit_dust.png', 'mat_spirit_2': 'spirit_remnant.png', 'mat_spirit_3': 'spirit_crystal.png', 'mat_spirit_4': 'spirit_core.png', 'mat_spirit_5': 'spirit_pulse.png',
    'mat_hybrid_1': 'hybrid_claw.png', 'mat_hybrid_2': 'hybrid_fur.png', 'mat_hybrid_3': 'hybrid_bone.png', 'mat_hybrid_4': 'hybrid_crystal.png', 'mat_hybrid_5': 'hybrid_soul.png',
    'mat_dwarf_1': 'dwarf_copper.png', 'mat_dwarf_2': 'dwarf_bronze.png', 'mat_dwarf_3': 'dwarf_mithril.png', 'mat_dwarf_4': 'dwarf_heart.png', 'mat_dwarf_5': 'dwarf_hammer.png',
    'mat_ghoul_1': 'ghoul_bone.png', 'mat_ghoul_2': 'ghoul_remains.png', 'mat_ghoul_3': 'ghoul_skull.png', 'mat_ghoul_4': 'ghoul_crystal.png', 'mat_ghoul_5': 'ghoul_core.png',
    'book_general_1': 'gen_book_tactic.png', 'book_general_2': 'gen_book_combat.png', 'book_general_3': 'gen_book_arts.png', 'book_general_4': 'gen_book_war.png', 'book_general_5': 'gen_book_wisdom.png',
    'book_race_1': 'race_book_stone.png', 'book_race_2': 'race_book_ancestor.png', 'book_race_3': 'race_book_secrets.png', 'book_race_4': 'race_book_covenant.png', 'book_race_5': 'race_book_pact.png'
};

const upgradeMats = require('../json/upgrade-materials.json');
let farmSeeds = []; try { farmSeeds = require('../json/seeds.json'); } catch(e) {}
let farmFeeds = []; try { farmFeeds = require('../json/feed-items.json'); } catch(e) {}
let potionItems = []; try { potionItems = require('../json/potions.json'); } catch(e) {}
let marketItems = []; try { marketItems = require('../json/market-items.json'); } catch(e) {}

const imageCache = new Map();
const ITEM_DICTIONARY = new Map();

function buildItemDictionary() {
    if (upgradeMats?.weapon_materials) {
        for (const race of upgradeMats.weapon_materials) {
            for (const mat of race.materials) {
                const info = { name: mat.name, emoji: mat.emoji, rarity: mat.rarity, imgPath: `${R2_URL}/images/materials/${race.race.toLowerCase().replace(' ', '_')}/${ID_TO_IMAGE[mat.id] || mat.id + '.png'}` };
                ITEM_DICTIONARY.set(mat.id, info);
                ITEM_DICTIONARY.set(mat.id.toLowerCase(), info);
            }
        }
    }
    if (upgradeMats?.skill_books) {
        for (const cat of upgradeMats.skill_books) {
            for (const book of cat.books) {
                const typeFolder = cat.category === 'General_Skills' ? 'general' : 'race';
                const info = { name: book.name, emoji: book.emoji, rarity: book.rarity, imgPath: `${R2_URL}/images/materials/${typeFolder}/${ID_TO_IMAGE[book.id] || book.id + '.png'}` };
                ITEM_DICTIONARY.set(book.id, info);
                ITEM_DICTIONARY.set(book.id.toLowerCase(), info);
            }
        }
    }
    if (farmSeeds?.length) {
        for (const s of farmSeeds) {
            const info = { name: s.name, emoji: s.emoji || '🌾', rarity: 'Common', imgPath: `${R2_URL}/images/farm/seeds/${s.id}.png` };
            ITEM_DICTIONARY.set(s.id, info);
        }
    }
    if (potionItems?.length) {
        for (const p of potionItems) {
            const info = { name: p.name, emoji: p.emoji || '🧪', rarity: 'Rare', imgPath: `${R2_URL}/images/potions/${p.id}.png` };
            ITEM_DICTIONARY.set(p.id, info);
        }
    }
    if (marketItems?.length) {
        for (const m of marketItems) {
            const info = { name: m.name, emoji: '📈', rarity: 'Epic', imgPath: `${R2_URL}/images/market/${String(m.id).toLowerCase()}.png` };
            ITEM_DICTIONARY.set(m.id, info);
        }
    }
}
buildItemDictionary();

function getItemInfo(itemId) {
    if (!itemId) return { name: 'عنصر مجهول', emoji: '📦', rarity: 'Common', imgPath: null };
    return ITEM_DICTIONARY.get(itemId) || ITEM_DICTIONARY.get(String(itemId).toLowerCase()) || { name: String(itemId).replace(/_/g, ' '), emoji: '📦', rarity: 'Common', imgPath: null };
}

async function getCachedImage(url) {
    if (!url) return null;
    const encoded = encodeURI(url);
    if (imageCache.has(encoded)) return imageCache.get(encoded);
    try {
        const img = await loadImage(encoded);
        imageCache.set(encoded, img);
        return img;
    } catch { return null; }
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

function drawFrame(ctx, x, y, w, h, color) {
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, 'rgba(15,20,30,0.9)');
    g.addColorStop(1, 'rgba(5,10,15,0.95)');
    ctx.fillStyle = g;
    roundRect(ctx, x, y, w, h, 12);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0;
}

function drawRibbon(ctx, x, y, w, h, color) {
    const ext = 10;
    ctx.fillStyle = 'rgba(5,5,8,0.95)';
    ctx.beginPath();
    ctx.moveTo(x - ext, y);
    ctx.lineTo(x + w + ext, y);
    ctx.lineTo(x + w + ext - 8, y + h / 2);
    ctx.lineTo(x + w + ext, y + h);
    ctx.lineTo(x - ext, y + h);
    ctx.lineTo(x - ext + 8, y + h / 2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
}

function autoText(ctx, text, x, y, maxW, maxFs, minFs = 10) {
    let fs = maxFs;
    ctx.font = `bold ${fs}px "Bein", "Arial"`;
    while (ctx.measureText(text).width > maxW && fs > minFs) { fs--; ctx.font = `bold ${fs}px "Bein", "Arial"`; }
    ctx.fillText(text, x, y);
}

/**
 * Generate staging market canvas (inventory-style grid)
 * @param {string} userName - Display name
 * @param {Array} items - Array of { id, name, emoji, rarity, imgPath, quantity, pricePerUnit }
 * @param {number} page - Current page (1-based)
 * @param {number} totalPages - Total pages
 * @param {number} mora - User's mora balance
 * @param {number} stagedCount - How many items already staged
 */
async function generateStagingCanvas(userName, items, page, totalPages, mora, stagedCount) {
    const W = 1200, H = 900;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    // Background
    const bg = ctx.createRadialGradient(W/2, H/2, 100, W/2, H/2, 900);
    bg.addColorStop(0, '#1a1025');
    bg.addColorStop(1, '#050508');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Stars
    ctx.fillStyle = '#FFF';
    for (let i = 0; i < 150; i++) {
        ctx.globalAlpha = Math.random() * 0.5 + 0.1;
        ctx.beginPath();
        ctx.arc(Math.random() * W, Math.random() * H, Math.random() * 2.5, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Header
    const headerH = 140;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, W, headerH);
    const goldG = ctx.createLinearGradient(0, 0, W, 0);
    goldG.addColorStop(0, 'rgba(255,215,0,0)');
    goldG.addColorStop(0.5, 'rgba(255,215,0,0.8)');
    goldG.addColorStop(1, 'rgba(255,215,0,0)');
    ctx.fillStyle = goldG;
    ctx.fillRect(0, headerH - 3, W, 3);
    ctx.fillRect(0, 3, W, 1);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 44px "Bein"';
    ctx.shadowColor = '#FFD700';
    ctx.shadowBlur = 25;
    ctx.fillText(`✦ متجر القافلة — ${userName} ✦`, W/2, 55);
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#E0E0E0';
    ctx.font = '22px "Bein"';
    ctx.fillText(`⟫ بضائعك المعروضة للبيع ⟪`, W/2, 100);

    ctx.textAlign = 'right';
    ctx.font = 'bold 16px "Bein"';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText(`[ ${page} / ${totalPages || 1} ]`, W - 30, 45);
    ctx.fillText(`💰 ${mora?.toLocaleString() || 0} مورا`, W - 30, 70);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#B968FF';
    ctx.fillText(`📦 مرحّلة: ${stagedCount || 0}`, 30, 45);

    // Grid: 5 cols, 3 rows
    const cols = 5, rows = 3, slotSize = 175, gapX = 45, gapY = 55;
    const startX = (W - (cols * slotSize + (cols - 1) * gapX)) / 2;
    const startY = 180;

    if (!items || items.length === 0) {
        for (let i = 0; i < 15; i++) {
            const c = i % cols, r = Math.floor(i / cols);
            drawFrame(ctx, startX + c * (slotSize + gapX), startY + r * (slotSize + gapY), slotSize, slotSize, 'rgba(255,255,255,0.05)');
        }
        const bw = 600, bh = 120, bx = (W - bw) / 2, by = (H + headerH - bh) / 2 - 20;
        ctx.fillStyle = 'rgba(10,10,15,0.95)';
        roundRect(ctx, bx, by, bw, bh, 20); ctx.fill();
        ctx.strokeStyle = '#B968FF'; ctx.lineWidth = 3; ctx.stroke();
        ctx.shadowColor = '#B968FF'; ctx.shadowBlur = 20;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FFF';
        ctx.font = 'bold 36px "Bein"';
        ctx.fillText('لا توجد عناصر متاحة', W/2, by + bh/2);
        ctx.shadowBlur = 0;
        return await canvas.encode ? canvas.encode('png') : canvas.toBuffer('image/png');
    }

    for (let i = 0; i < 15; i++) {
        const c = i % cols, r = Math.floor(i / cols);
        const x = startX + c * (slotSize + gapX);
        const y = startY + r * (slotSize + gapY);
        const item = items[i] || null;
        if (!item) {
            drawFrame(ctx, x, y, slotSize, slotSize, 'rgba(255,255,255,0.05)');
            continue;
        }

        const rc = item.rarity ? (RARITY_COLORS[item.rarity] || '#777') : '#A8B8D0';
        drawFrame(ctx, x, y, slotSize, slotSize, rc);

        // Aura
        const aura = ctx.createRadialGradient(x + slotSize/2, y + slotSize/2, 10, x + slotSize/2, y + slotSize/2, slotSize/1.2);
        aura.addColorStop(0, rc + '60');
        aura.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = aura;
        ctx.fillRect(x, y, slotSize, slotSize);

        // Image
        let imgDrawn = false;
        if (item.imgPath) {
            const img = await getCachedImage(item.imgPath);
            if (img) {
                const pad = 25;
                ctx.shadowColor = rc;
                ctx.shadowBlur = 40;
                ctx.drawImage(img, x + pad, y + pad - 15, slotSize - pad * 2, slotSize - pad * 2);
                ctx.shadowBlur = 0;
                imgDrawn = true;
            }
        }
        if (!imgDrawn) {
            ctx.fillStyle = '#FFF';
            ctx.font = '60px "Emoji", "Arial"';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = rc;
            ctx.shadowBlur = 30;
            ctx.fillText(item.emoji || '📦', x + slotSize/2, y + slotSize/2 - 15);
            ctx.shadowBlur = 0;
        }

        // Ribbon with name + price
        const ribbonH = 40;
        const ribbonY = y + slotSize - 20;
        drawRibbon(ctx, x, ribbonY, slotSize, ribbonH, rc);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#FFF';
        const cleanName = (item.name || '').replace(/[\u{1F600}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F300}-\u{1F5FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FAFF}₿🪙]/gu, '').trim();
        autoText(ctx, cleanName, x + slotSize/2, ribbonY + ribbonH/2 - 8, slotSize - 20, 15, 10);

        ctx.fillStyle = '#2ECC71';
        ctx.font = 'bold 11px "Bein"';
        ctx.fillText(`${item.pricePerUnit?.toLocaleString() || 0} 🪙`, x + slotSize/2, ribbonY + ribbonH/2 + 10);

        // Qty badge
        const qtyText = item.quantity > 999 ? '999+' : String(item.quantity);
        ctx.font = 'bold 13px "Arial"';
        const tw = ctx.measureText(qtyText).width;
        const br = Math.max(14, tw/2 + 5);
        const bx = x + slotSize, by2 = y;
        ctx.beginPath(); ctx.arc(bx, by2, br, 0, Math.PI * 2);
        ctx.fillStyle = rc; ctx.fill();
        ctx.beginPath(); ctx.arc(bx, by2, br - 2, 0, Math.PI * 2);
        ctx.fillStyle = '#111'; ctx.fill();
        ctx.fillStyle = '#FFF'; ctx.font = 'bold 12px "Arial"';
        ctx.fillText(qtyText, bx, by2 + 1);
    }

    return await canvas.encode ? canvas.encode('png') : canvas.toBuffer('image/png');
}

module.exports = { generateStagingCanvas, getItemInfo };
