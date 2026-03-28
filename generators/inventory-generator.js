const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

// تسجيل الخطوط
try {
    GlobalFonts.registerFromPath('fonts/bein-ar-normal.ttf', 'Bein');
    GlobalFonts.registerFromPath('efonts/NotoEmoj.ttf', 'Emoji');
} catch (e) {}

const R2_URL = 'https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev';

let itemLore = {};
try { itemLore = require('../json/item-descriptions.json'); } catch (e) {}

const upgradeMats = require('../json/upgrade-materials.json');
const weaponsConfig = require('../json/weapons-config.json'); 
let skillsConfig = []; try { skillsConfig = require('../json/skills-config.json'); } catch(e) {}

let fishData = { fishItems: [], baits: [], rods: [], boats: [] };
let rodsConfig = [], boatsConfig = [];
try { 
    const fishJson = require('../json/fishing-config.json') || require('../json/fish.json'); 
    fishData = fishJson;
    rodsConfig = fishJson.rods || [];
    boatsConfig = fishJson.boats || [];
} catch(e) {}

let farmSeeds = []; try { farmSeeds = require('../json/seeds.json'); } catch(e) {}
let farmFeeds = []; try { farmFeeds = require('../json/feed-items.json'); } catch(e) {}
let potionItems = []; try { potionItems = require('../json/potions.json'); } catch(e) {}
let marketItems = []; try { marketItems = require('../json/market-items.json'); } catch(e) {}

const imageCache = new Map();
const ITEM_DICTIONARY = new Map();

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

function addItemToDict(id, name, emoji, category, rarity, imgPath, fullImage = false) {
    if (!id) return;
    const cleanId = String(id).trim();
    const data = {
        name: name || cleanId,
        emoji: emoji || '📦',
        category: category || 'أخرى',
        rarity: rarity || 'Common',
        imgPath: imgPath ? `${R2_URL}/${imgPath.replace(/^\/+/, '')}` : null,
        fullImage: fullImage
    };
    ITEM_DICTIONARY.set(cleanId, data);
    ITEM_DICTIONARY.set(cleanId.toLowerCase(), data);
}

function buildItemDictionary() {
    if (upgradeMats && upgradeMats.weapon_materials) {
        for (const race of upgradeMats.weapon_materials) {
            for (const mat of race.materials) {
                addItemToDict(mat.id, mat.name, mat.emoji, 'موارد', mat.rarity, `images/materials/${race.race.toLowerCase().replace(' ', '_')}/${ID_TO_IMAGE[mat.id] || mat.id + '.png'}`, false);
            }
        }
    }
    if (upgradeMats && upgradeMats.skill_books) {
        for (const cat of upgradeMats.skill_books) {
            const typeFolder = cat.category === 'General_Skills' ? 'general' : 'race';
            for (const book of cat.books) {
                addItemToDict(book.id, book.name, book.emoji, 'موارد', book.rarity, `images/materials/${typeFolder}/${ID_TO_IMAGE[book.id] || book.id + '.png'}`, false);
            }
        }
    }
    if (fishData && fishData.fishItems) {
        for (const fish of fishData.fishItems) {
            addItemToDict(fish.id, fish.name, fish.emoji, 'صيد', fish.rarity > 3 ? 'Epic' : 'Common', `images/fish/${fish.id}.png`, true);
        }
    }
    if (fishData && fishData.baits) {
        for (const bait of fishData.baits) {
            addItemToDict(bait.id, bait.name, bait.emoji, 'صيد', 'Common', `images/fish/baits/${bait.id}.png`, true);
        }
    }
    if (farmSeeds && farmSeeds.length > 0) {
        for (const seed of farmSeeds) {
            addItemToDict(seed.id, seed.name, seed.emoji, 'مزرعة', 'Common', `images/farm/seeds/${seed.id}.png`, true);
        }
    }
    if (farmFeeds && farmFeeds.length > 0) {
        for (const feed of farmFeeds) {
            addItemToDict(feed.id, feed.name, feed.emoji, 'مزرعة', 'Common', `images/feeds/${feed.id}.png`, true);
        }
    }
    if (potionItems && potionItems.length > 0) {
        for (const pot of potionItems) {
            addItemToDict(pot.id, pot.name, pot.emoji, 'أخرى', 'Rare', `images/potions/${pot.id}.png`, false);
        }
    }
    if (marketItems && marketItems.length > 0) {
        for (const market of marketItems) {
            addItemToDict(market.id, market.name, '📈', 'أخرى', 'Epic', `images/market/${String(market.id).toLowerCase()}.png`, false);
        }
    }
}

buildItemDictionary();

async function getCachedImage(imageUrl) {
    if (!imageUrl) return null;
    const encodedUrl = encodeURI(imageUrl);

    if (imageCache.has(encodedUrl)) return imageCache.get(encodedUrl);
    try {
        const img = await loadImage(encodedUrl);
        imageCache.set(encodedUrl, img);
        return img;
    } catch (e) {
        console.log(`[Canvas] Missing Image URL: ${encodedUrl}`);
        return null;
    }
}

function resolveItemInfo(itemId) {
    if (!itemId) return { name: 'عنصر مجهول', emoji: '📦', category: 'أخرى', rarity: 'Common', imgPath: null, fullImage: false };
    const cleanId = String(itemId).trim();
    let baseInfo = ITEM_DICTIONARY.get(cleanId) || ITEM_DICTIONARY.get(cleanId.toLowerCase());

    if (!baseInfo) {
        baseInfo = { name: cleanId, emoji: '📦', category: 'أخرى', rarity: 'Common', imgPath: null, fullImage: false };
    }

    baseInfo.description = itemLore[cleanId] || itemLore[cleanId.toLowerCase()] || null;
    return { ...baseInfo };
}

async function getInventoryCategories(db, userId, guildId) {
    let inventory = [];
    const categories = { 'موارد': [], 'صيد': [], 'مزرعة': [], 'أخرى': [] };
    
    try {
        const res = await db.query(`SELECT * FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId]);
        inventory = res.rows;
    } catch(e) {
        try {
            const res = await db.query(`SELECT * FROM user_inventory WHERE userid = $1 AND guildid = $2`, [userId, guildId]);
            inventory = res.rows;
        } catch(err) {}
    }
    
    for (const row of inventory) {
        const itemId = row.itemID || row.itemid || row.item_id;
        if (!itemId) continue;
        const quantity = Number(row.quantity || row.qty) || 0;
        if (quantity <= 0) continue;
        
        const itemInfo = resolveItemInfo(itemId);
        if (categories[itemInfo.category]) {
            categories[itemInfo.category].push({ ...itemInfo, quantity, id: itemId });
        } else {
            categories['أخرى'].push({ ...itemInfo, quantity, id: itemId });
        }
    }

    try {
        let userData = null;
        try {
            const res = await db.query(`SELECT "rodLevel", "boatLevel" FROM levels WHERE "user" = $1 AND "guild" = $2`, [userId, guildId]);
            if (res.rows.length > 0) userData = res.rows[0];
        } catch(e) {
            const res = await db.query(`SELECT rodlevel, boatlevel FROM levels WHERE userid = $1 AND guildid = $2`, [userId, guildId]).catch(()=>({rows:[]}));
            if (res.rows.length > 0) userData = res.rows[0];
        }

        if (userData) {
            const rodLvl = Number(userData.rodLevel || userData.rodlevel) || 1;
            const boatLvl = Number(userData.boatLevel || userData.boatlevel) || 1;

            for (let i = 1; i <= rodLvl; i++) {
                const rod = rodsConfig.find(r => r.level === i);
                if (rod) {
                    categories['صيد'].push({
                        name: rod.name,
                        emoji: '🎣',
                        category: 'صيد',
                        rarity: i >= 8 ? 'Legendary' : (i >= 5 ? 'Epic' : (i >= 3 ? 'Rare' : 'Common')),
                        imgPath: `${R2_URL}/images/fish/fishing/rod_${i}.png`,
                        quantity: 1,
                        id: `rod_${i}`,
                        fullImage: true,
                        description: `سنارة صيد بمستوى ${i}\nتزيد الحظ بنسبة ${rod.luck_bonus}%`
                    });
                }
            }

            for (let i = 1; i <= boatLvl; i++) {
                const boat = boatsConfig.find(b => b.level === i);
                if (boat) {
                    categories['صيد'].push({
                        name: boat.name,
                        emoji: '🚤',
                        category: 'صيد',
                        rarity: i >= 6 ? 'Legendary' : (i >= 4 ? 'Epic' : (i >= 2 ? 'Rare' : 'Common')),
                        imgPath: `${R2_URL}/images/fish/ships/boat_${i}.png`,
                        quantity: 1,
                        id: `boat_${i}`,
                        fullImage: true,
                        description: `قارب يفتح موقع: ${boat.location_id}`
                    });
                }
            }
        }
    } catch(e) {}
    
    return categories;
}

function drawAutoScaledText(ctx, text, x, y, maxWidth, maxFontSize, minFontSize = 10) {
    let currentFontSize = maxFontSize;
    ctx.font = `bold ${currentFontSize}px "Bein", "Emoji"`;
    while (ctx.measureText(text).width > maxWidth && currentFontSize > minFontSize) {
        currentFontSize--;
        ctx.font = `bold ${currentFontSize}px "Bein", "Emoji"`;
    }
    ctx.fillText(text, x, y);
}

function wrapText(ctx, text, maxWidth) {
    const words = text.split(' ');
    let lines = [];
    let currentLine = words[0];

    for (let i = 1; i < words.length; i++) {
        const word = words[i];
        const width = ctx.measureText(currentLine + " " + word).width;
        if (width < maxWidth) {
            currentLine += " " + word;
        } else {
            lines.push(currentLine);
            currentLine = word;
        }
    }
    lines.push(currentLine);
    return lines;
}

function drawOrnateFrame(ctx, x, y, w, h, color) {
    const bgGrad = ctx.createLinearGradient(x, y, x, y + h);
    bgGrad.addColorStop(0, 'rgba(15, 20, 30, 0.9)');
    bgGrad.addColorStop(1, 'rgba(5, 10, 15, 0.95)');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
    const cl = 20; 
    ctx.lineWidth = 3;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(x, y + cl); ctx.lineTo(x, y); ctx.lineTo(x + cl, y);
    ctx.moveTo(x + w - cl, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + cl);
    ctx.moveTo(x + w, y + h - cl); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - cl, y + h);
    ctx.moveTo(x + cl, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - cl);
    ctx.stroke();
    ctx.shadowBlur = 0;
}

function drawRibbon(ctx, x, y, w, h, color) {
    const ext = 10; 
    ctx.fillStyle = 'rgba(5, 5, 8, 0.95)';
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

function roundRect(ctx, x, y, width, height, radius) {
    if (width < 2 * radius) radius = width / 2;
    if (height < 2 * radius) radius = height / 2;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.closePath();
}

function drawShield(ctx, x, y, w, h) {
    ctx.beginPath();
    ctx.moveTo(x, y - h/2); 
    ctx.lineTo(x + w/2, y - h/4); 
    ctx.lineTo(x + w/2, y + h/5); 
    ctx.quadraticCurveTo(x + w/2, y + h/2, x, y + h/2); 
    ctx.quadraticCurveTo(x - w/2, y + h/2, x - w/2, y + h/5); 
    ctx.lineTo(x - w/2, y - h/4); 
    ctx.closePath();
}

async function generateInventoryCard(userDisplayName, categoryTitle, items, page, totalPages, selectedIndex = 0) {
    const width = 1200; 
    const height = 900; 
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    const bgGrad = ctx.createRadialGradient(width/2, height/2, 100, width/2, height/2, 900);
    bgGrad.addColorStop(0, '#1a1025'); 
    bgGrad.addColorStop(1, '#050508');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#FFFFFF';
    for(let i=0; i<150; i++) {
        const px = Math.random() * width;
        const py = Math.random() * height;
        const pSize = Math.random() * 2.5;
        ctx.globalAlpha = Math.random() * 0.5 + 0.1;
        ctx.beginPath(); ctx.arc(px, py, pSize, 0, Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha = 1.0;
    const headerH = 140;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, width, headerH);
    const goldGrad = ctx.createLinearGradient(0, 0, width, 0);
    goldGrad.addColorStop(0, 'rgba(255, 215, 0, 0)');
    goldGrad.addColorStop(0.5, 'rgba(255, 215, 0, 0.8)');
    goldGrad.addColorStop(1, 'rgba(255, 215, 0, 0)');
    ctx.fillStyle = goldGrad;
    ctx.fillRect(0, headerH - 3, width, 3);
    ctx.fillRect(0, 3, width, 1);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FFD700'; 
    ctx.font = 'bold 55px "Bein"';
    ctx.shadowColor = '#FFD700';
    ctx.shadowBlur = 25;
    ctx.fillText(`✦ خـزائـن ${userDisplayName} ✦`, width / 2, 60);
    ctx.fillStyle = '#E0E0E0';
    ctx.font = '26px "Bein"';
    ctx.shadowBlur = 0;
    ctx.letterSpacing = "3px";
    ctx.fillText(`⟪ ${categoryTitle} ⟫`, width / 2, 110);
    ctx.textAlign = 'right';
    ctx.font = 'bold 18px "Bein"';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.fillText(`[ ${page} / ${totalPages || 1} ]`, width - 30, 70);
    const cols = 5;
    const rows = 3;
    const slotSize = 175; 
    const gapX = 45;      
    const gapY = 55;      
    const startX = (width - ((cols * slotSize) + ((cols - 1) * gapX))) / 2;
    const startY = 180; 

    if (!items || items.length === 0) {
        for (let i = 0; i < 15; i++) {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const x = startX + col * (slotSize + gapX);
            const y = startY + row * (slotSize + gapY);
            
            if (i === selectedIndex) {
                ctx.save();
                ctx.shadowColor = '#00FFFF';
                ctx.shadowBlur = 25;
                ctx.fillStyle = 'rgba(0, 255, 255, 0.8)';
                const p = 4;
                ctx.beginPath();
                roundRect(ctx, x - p, y - p, slotSize + (p * 2), slotSize + (p * 2), 15 + p);
                ctx.fill();
                ctx.restore();
            }
            drawOrnateFrame(ctx, x, y, slotSize, slotSize, 'rgba(255,255,255,0.05)');
        }
        const emptyBoxW = 600;
        const emptyBoxH = 120;
        const emptyBoxX = (width - emptyBoxW) / 2;
        const emptyBoxY = (height + headerH - emptyBoxH) / 2 - 20;
        ctx.fillStyle = 'rgba(10, 10, 15, 0.95)';
        ctx.beginPath(); roundRect(ctx, emptyBoxX, emptyBoxY, emptyBoxW, emptyBoxH, 20); ctx.fill();
        ctx.strokeStyle = '#B968FF'; ctx.lineWidth = 3; ctx.stroke();
        ctx.shadowColor = '#B968FF'; ctx.shadowBlur = 20;
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 40px "Bein", "Emoji"'; 
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('❌ هذا القسم فارغ تماماً', width / 2, emptyBoxY + emptyBoxH / 2);
        ctx.shadowBlur = 0;
        return canvas.toBuffer('image/png', { compressionLevel: 1, filters: canvas.PNG_FILTER_NONE });
    }

    for (let i = 0; i < 15; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = startX + col * (slotSize + gapX);
        const y = startY + row * (slotSize + gapY);
        const item = items && items[i] ? items[i] : null;
        const isSelected = (i === selectedIndex);

        const ribbonH = 35;
        const ribbonY = y + slotSize - 20;
        let qtyText = '';
        let badgeRadius = 0;
        let badgeX = x + slotSize;
        let badgeY = y;

        if (item) {
            qtyText = item.quantity > 999 ? '999+' : item.quantity.toString();
            ctx.font = 'bold 15px "Arial"';
            const textW = ctx.measureText(qtyText).width;
            badgeRadius = Math.max(16, textW / 2 + 6);
        }

        if (isSelected) {
            ctx.save();
            ctx.shadowColor = '#00FFFF';
            ctx.shadowBlur = 25;
            ctx.fillStyle = 'rgba(0, 255, 255, 0.8)';
            const p = 5;

            ctx.beginPath();
            roundRect(ctx, x - p, y - p, slotSize + (p * 2), slotSize + (p * 2), 15 + p);
            ctx.fill();

            if (item) {
                const ext = 10 + p;
                ctx.beginPath();
                ctx.moveTo(x - ext, ribbonY - p);
                ctx.lineTo(x + slotSize + ext, ribbonY - p);
                ctx.lineTo(x + slotSize + ext - 8, ribbonY + ribbonH / 2);
                ctx.lineTo(x + slotSize + ext, ribbonY + ribbonH + p);
                ctx.lineTo(x - ext, ribbonY + ribbonH + p);
                ctx.lineTo(x - ext + 8, ribbonY + ribbonH / 2);
                ctx.closePath();
                ctx.fill();

                ctx.beginPath();
                ctx.arc(badgeX, badgeY, badgeRadius + p, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.shadowBlur = 50;
            ctx.fillStyle = 'rgba(0, 255, 255, 0.4)';
            ctx.beginPath();
            roundRect(ctx, x - p, y - p, slotSize + (p * 2), slotSize + (p * 2), 15 + p);
            ctx.fill();

            ctx.restore();
        }

        if (!item) {
            drawOrnateFrame(ctx, x, y, slotSize, slotSize, 'rgba(255,255,255,0.05)');
        } else {
            const rarityColor = item.rarity ? (RARITY_COLORS[item.rarity] || '#777777') : '#222';
            drawOrnateFrame(ctx, x, y, slotSize, slotSize, rarityColor);
            const aura = ctx.createRadialGradient(x + slotSize/2, y + slotSize/2, 10, x + slotSize/2, y + slotSize/2, slotSize/1.2);
            aura.addColorStop(0, `${rarityColor}60`); 
            aura.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = aura;
            ctx.fillRect(x, y, slotSize, slotSize);
            
            let imgDrawn = false;
            if (item.imgPath) {
                const img = await getCachedImage(item.imgPath);
                if (img) {
                    if (item.fullImage) {
                        ctx.save();
                        ctx.beginPath();
                        roundRect(ctx, x + 2, y + 2, slotSize - 4, slotSize - 4, 15);
                        ctx.clip();
                        ctx.drawImage(img, x + 2, y + 2, slotSize - 4, slotSize - 4);
                        ctx.restore();
                    } else {
                        const padding = 25; 
                        const imgSize = slotSize - (padding * 2);
                        ctx.shadowColor = rarityColor;
                        ctx.shadowBlur = 40;
                        ctx.drawImage(img, x + padding, y + padding - 15, imgSize, imgSize);
                        ctx.shadowBlur = 0; 
                    }
                    imgDrawn = true;
                }
            }
            if (!imgDrawn) {
                ctx.fillStyle = '#FFFFFF';
                ctx.font = '65px "Emoji", "Arial"';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.shadowColor = rarityColor;
                ctx.shadowBlur = 30;
                ctx.fillText(item.emoji || '📦', x + slotSize / 2, y + slotSize / 2 - 15);
                ctx.shadowBlur = 0;
            }
            
            drawRibbon(ctx, x, ribbonY, slotSize, ribbonH, rarityColor);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#FFFFFF';
            drawAutoScaledText(ctx, item.name.replace(/[\u{1F600}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F300}-\u{1F5FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FADF}\u{1F004}-\u{1F0CF}\u{2B00}-\u{2BFF}₿🪙]/gu, '').trim(), x + slotSize / 2, ribbonY + ribbonH / 2, slotSize - 20, 16, 10);
            ctx.beginPath(); ctx.arc(badgeX, badgeY, badgeRadius, 0, Math.PI*2);
            ctx.fillStyle = rarityColor;
            ctx.shadowColor = '#000'; ctx.shadowBlur = 10; ctx.fill();
            ctx.beginPath(); ctx.arc(badgeX, badgeY, badgeRadius - 2, 0, Math.PI*2);
            ctx.fillStyle = '#111'; ctx.shadowBlur = 0; ctx.fill();
            ctx.fillStyle = '#FFF';
            ctx.fillText(qtyText, badgeX, badgeY + 1);
        }
    }
    return canvas.toBuffer('image/png', { compressionLevel: 1, filters: canvas.PNG_FILTER_NONE });
}

async function generateMainHub(arg1, arg2, arg3, arg4, arg5, arg6) {
    let userObj, displayName, moraBalance, finalRank = 'D', finalRace = 'مواطن', finalWeapon = 'قبضة اليد';

    if (arg1 && arg1.roles && arg2 && typeof arg2.query === 'function') {
        const member = arg1;
        const db = arg2;
        moraBalance = arg3 || 0;
        userObj = member.user;
        displayName = member.displayName || userObj.username;
        const guildId = member.guild.id;
        const userId = userObj.id;

        try {
            const repRes = await db.query(`SELECT "rep_points" FROM user_reputation WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId]);
            const points = Number(repRes.rows[0]?.rep_points || 0);
            if (points >= 1000) finalRank = 'SS'; 
            else if (points >= 500) finalRank = 'S'; 
            else if (points >= 250) finalRank = 'A'; 
            else if (points >= 100) finalRank = 'B'; 
            else if (points >= 50) finalRank = 'C'; 
            else if (points >= 25) finalRank = 'D'; 
            else if (points >= 10) finalRank = 'E';
            else finalRank = 'F';
        } catch(e) {}

        try {
            const res = await db.query(`SELECT "roleID", "raceName" FROM race_roles WHERE "guildID" = $1`, [guildId]);
            const userRoleIDs = member.roles.cache.map(r => r.id);
            const userRace = res.rows.find(r => userRoleIDs.includes(r.roleID));
            const RACE_TRANSLATIONS = { 'Human': 'بشري', 'Dragon': 'تنين', 'Elf': 'آلف', 'Dark Elf': 'آلف الظلام', 'Seraphim': 'سيرافيم', 'Demon': 'شيطان', 'Vampire': 'مصاص دماء', 'Spirit': 'روح', 'Dwarf': 'قزم', 'Ghoul': 'غول', 'Hybrid': 'نصف وحش' };
            finalRace = userRace ? (RACE_TRANSLATIONS[userRace.raceName] || userRace.raceName) : "مواطن";
        } catch(e) {}

        try {
            const wRes = await db.query(`SELECT "raceName", "weaponLevel" FROM user_weapons WHERE "userID" = $1 AND "guildID" = $2 ORDER BY "weaponLevel" DESC LIMIT 1`, [userId, guildId]);
            if (wRes.rows.length > 0) {
                const raceN = wRes.rows[0].raceName;
                const wpLvl = wRes.rows[0].weaponLevel;
                const wpConf = weaponsConfig.find(w => w.race.toLowerCase() === raceN.toLowerCase());
                const wpName = wpConf ? wpConf.name : raceN;
                finalWeapon = `${wpName} (Lv.${wpLvl})`;
            } else {
                finalWeapon = "قبضة اليد";
            }
        } catch(e) {}

    } else {
        userObj = arg1;
        displayName = arg2;
        moraBalance = arg3;
        finalRank = String(arg4).trim();
        finalRace = String(arg5).trim();
        finalWeapon = String(arg6).trim();

        if (finalRank.includes('رتبة') || !finalRank || finalRank === 'undefined') finalRank = 'D';
        if (finalRace.includes('عرق') || !finalRace || finalRace === 'undefined') finalRace = 'مواطن';
        if (finalWeapon.includes('سلاح') || !finalWeapon || finalWeapon === 'undefined') finalWeapon = 'قبضة اليد';
    }

    const width = 1100;
    const height = 650;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    const primaryColor = '#FFD700'; 
    const bgUrl = `${R2_URL}/images/inventory/desk_bg.png`;
    const bgImg = await getCachedImage(bgUrl);
    if (bgImg) {
        ctx.drawImage(bgImg, 0, 0, width, height);
        const vignette = ctx.createRadialGradient(width/2, height/2, 100, width/2, height/2, 800);
        vignette.addColorStop(0, 'rgba(0,0,0,0.2)');
        vignette.addColorStop(1, 'rgba(0,0,0,0.98)'); 
        ctx.fillStyle = vignette;
        ctx.fillRect(0,0,width,height);
    } else {
        ctx.fillStyle = '#050508'; ctx.fillRect(0, 0, width, height);
    }
    const idX = 60, idY = 60, idW = 380, idH = 530;
    ctx.fillStyle = 'rgba(10, 10, 15, 0.9)';
    ctx.shadowColor = '#000'; ctx.shadowBlur = 50;
    ctx.beginPath(); roundRect(ctx, idX, idY, idW, idH, 20); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = primaryColor; ctx.lineWidth = 2;
    ctx.strokeRect(idX + 15, idY + 15, idW - 30, idH - 30);
    const cl = 30; ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(idX+15, idY+15+cl); ctx.lineTo(idX+15, idY+15); ctx.lineTo(idX+15+cl, idY+15);
    ctx.moveTo(idX+idW-15-cl, idY+15); ctx.lineTo(idX+idW-15, idY+15); ctx.lineTo(idX+idW-15, idY+15+cl);
    ctx.moveTo(idX+idW-15, idY+idH-15-cl); ctx.lineTo(idX+idW-15, idY+idH-15); ctx.lineTo(idX+idW-15-cl, idY+idH-15);
    ctx.moveTo(idX+15+cl, idY+idH-15); ctx.lineTo(idX+15, idY+idH-15); ctx.lineTo(idX+15, idY+idH-15-cl);
    ctx.stroke();
    const avatarSize = 160;
    const avatarX = idX + idW / 2; 
    const avatarY = idY + 130; 
    const glowAv = ctx.createRadialGradient(avatarX, avatarY, 10, avatarX, avatarY, 120);
    glowAv.addColorStop(0, 'rgba(255, 215, 0, 0.4)'); glowAv.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glowAv; ctx.fillRect(avatarX-120, avatarY-120, 240, 240);
    ctx.save();
    ctx.beginPath(); ctx.arc(avatarX, avatarY, avatarSize / 2, 0, Math.PI * 2); ctx.clip();
    try {
        const avatarUrl = userObj.displayAvatarURL({ extension: 'png', size: 256 });
        const avatarImage = await loadImage(avatarUrl);
        ctx.drawImage(avatarImage, avatarX - avatarSize/2, avatarY - avatarSize/2, avatarSize, avatarSize);
    } catch (e) { ctx.fillStyle = '#333'; ctx.fill(); }
    ctx.restore();
    const borderAvGrad = ctx.createLinearGradient(avatarX - avatarSize/2, avatarY - avatarSize/2, avatarX + avatarSize/2, avatarY + avatarSize/2);
    borderAvGrad.addColorStop(0, primaryColor); borderAvGrad.addColorStop(0.5, '#ffffff'); borderAvGrad.addColorStop(1, primaryColor);
    ctx.beginPath(); ctx.arc(avatarX, avatarY, avatarSize / 2, 0, Math.PI * 2); ctx.lineWidth = 5; ctx.strokeStyle = borderAvGrad; ctx.stroke();
    
    const badgeW = 75, badgeH = 85;
    const badgeX = avatarX;
    const badgeY = avatarY + (avatarSize / 2) + 5; 
    ctx.save();
    drawShield(ctx, badgeX, badgeY, badgeW, badgeH);
    ctx.fillStyle = 'rgba(10, 10, 15, 0.98)';
    ctx.shadowColor = primaryColor; ctx.shadowBlur = 20; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = primaryColor; ctx.stroke();
    ctx.lineWidth = 1; ctx.strokeStyle = '#fff'; ctx.stroke();
    ctx.fillStyle = primaryColor; ctx.font = 'bold 36px "Arial"';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = primaryColor; ctx.shadowBlur = 10;
    ctx.fillText(finalRank.replace(/[\u{1F600}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F300}-\u{1F5FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FADF}\u{1F004}-\u{1F0CF}\u{2B00}-\u{2BFF}₿🪙]/gu, '').trim(), badgeX, badgeY + 6);
    ctx.restore();
    
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = primaryColor; ctx.shadowBlur = 15;
    drawAutoScaledText(ctx, displayName, avatarX, badgeY + 75, idW - 60, 45, 20); 
    ctx.shadowBlur = 0;
    const tagX = idX + 40, tagY = badgeY + 115, tagW = idW - 80, tagH = 45;
    ctx.fillStyle = 'rgba(255, 215, 0, 0.08)';
    ctx.beginPath(); roundRect(ctx, tagX, tagY, tagW, tagH, 10); ctx.fill();
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.3)'; ctx.lineWidth = 1;
    roundRect(ctx, tagX, tagY, tagW, tagH, 10); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(tagX + tagW/2, tagY + 5); ctx.lineTo(tagX + tagW/2, tagY + tagH - 5);
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.5)'; ctx.stroke();
    const halfTagW = (tagW / 2) - 10; 
    ctx.fillStyle = '#E0E0E0';
    drawAutoScaledText(ctx, finalRace.replace(/[\u{1F600}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F300}-\u{1F5FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FADF}\u{1F004}-\u{1F0CF}\u{2B00}-\u{2BFF}₿🪙]/gu, '').trim(), tagX + tagW/4, tagY + tagH/2, halfTagW, 18, 12);
    ctx.fillStyle = '#F1C40F';
    drawAutoScaledText(ctx, finalWeapon.replace(/[\u{1F600}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F300}-\u{1F5FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FADF}\u{1F004}-\u{1F0CF}\u{2B00}-\u{2BFF}₿🪙]/gu, '').trim(), tagX + (tagW * 0.75), tagY + tagH/2, halfTagW, 18, 12);
    
    const moraX = idX + 60, moraY = tagY + 65, moraW = idW - 120, moraH = 55;
    const goldGradBox = ctx.createLinearGradient(moraX, moraY, moraX + moraW, moraY);
    goldGradBox.addColorStop(0, 'rgba(255, 215, 0, 0.2)'); goldGradBox.addColorStop(0.5, 'rgba(255, 215, 0, 0)'); goldGradBox.addColorStop(1, 'rgba(255, 215, 0, 0.2)');
    ctx.fillStyle = goldGradBox;
    ctx.beginPath(); roundRect(ctx, moraX, moraY, moraW, moraH, 15); ctx.fill();
    ctx.strokeStyle = primaryColor; ctx.lineWidth = 2;
    ctx.beginPath(); roundRect(ctx, moraX, moraY, moraW, moraH, 15); ctx.stroke();
    ctx.fillStyle = '#FFD700';
    ctx.shadowColor = '#000'; ctx.shadowBlur = 5;
    const moraText = `${moraBalance.toLocaleString()} مورا`;
    drawAutoScaledText(ctx, moraText, idX + idW/2, moraY + moraH/2 + 2, moraW - 20, 30, 16);
    ctx.shadowBlur = 0;
    const bagX = 780, bagY = 320;
    ctx.save();
    ctx.translate(bagX, bagY + 120);
    ctx.scale(1, 0.35); 
    const hGlow = ctx.createRadialGradient(0, 0, 20, 0, 0, 250);
    hGlow.addColorStop(0, 'rgba(185, 104, 255, 0.6)'); hGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = hGlow;
    ctx.beginPath(); ctx.arc(0, 0, 250, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#B968FF'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(0, 0, 200, 0, Math.PI*2); ctx.stroke();
    ctx.strokeStyle = 'rgba(185, 104, 255, 0.5)'; ctx.lineWidth = 1;
    ctx.setLineDash([15, 10]);
    ctx.beginPath(); ctx.arc(0, 0, 220, 0, Math.PI*2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    const beam = ctx.createLinearGradient(0, bagY + 120, 0, bagY - 200);
    beam.addColorStop(0, 'rgba(185, 104, 255, 0.3)');
    beam.addColorStop(1, 'rgba(185, 104, 255, 0)');
    ctx.fillStyle = beam;
    ctx.beginPath(); ctx.moveTo(bagX - 200, bagY + 120); ctx.lineTo(bagX + 200, bagY + 120); ctx.lineTo(bagX + 100, bagY - 200); ctx.lineTo(bagX - 100, bagY - 200); ctx.fill();
    const bagUrl = `${R2_URL}/images/inventory/main_bag.png`;
    const bagImg = await getCachedImage(bagUrl);
    if (bagImg) {
        ctx.shadowColor = '#B968FF'; ctx.shadowBlur = 60; 
        ctx.drawImage(bagImg, bagX - 225, bagY - 225, 450, 450); 
        ctx.shadowBlur = 0;
    }
    return canvas.toBuffer('image/png', { compressionLevel: 1, filters: canvas.PNG_FILTER_NONE });
}

async function generateItemDetailsCard(userDisplayName, item) {
    const width = 1000; 
    const height = 600; 
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const rarityColor = item.rarity ? (RARITY_COLORS[item.rarity] || '#A8B8D0') : '#A8B8D0';

    const bgGrad = ctx.createRadialGradient(width/2, height/2, 100, width/2, height/2, 800);
    bgGrad.addColorStop(0, '#151520'); 
    bgGrad.addColorStop(1, '#05050A');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    const auraGrad = ctx.createRadialGradient(300, height/2, 50, 300, height/2, 400);
    auraGrad.addColorStop(0, `${rarityColor}40`); 
    auraGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = auraGrad;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = rarityColor;
    ctx.lineWidth = 4;
    ctx.strokeRect(10, 10, width - 20, height - 20);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(15, 15, width - 30, height - 30);

    const imgSize = 350;
    const imgX = 100;
    const imgY = (height - imgSize) / 2;

    drawOrnateFrame(ctx, imgX, imgY, imgSize, imgSize, rarityColor);
    
    const innerAura = ctx.createRadialGradient(imgX + imgSize/2, imgY + imgSize/2, 10, imgX + imgSize/2, imgY + imgSize/2, imgSize/1.5);
    innerAura.addColorStop(0, `${rarityColor}80`);
    innerAura.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = innerAura;
    ctx.fillRect(imgX, imgY, imgSize, imgSize);

    let imgDrawn = false;
    if (item.imgPath) {
        const img = await getCachedImage(item.imgPath);
        if (img) {
            if (item.fullImage) {
                ctx.save();
                ctx.beginPath();
                roundRect(ctx, imgX + 4, imgY + 4, imgSize - 8, imgSize - 8, 20);
                ctx.clip();
                ctx.drawImage(img, imgX + 4, imgY + 4, imgSize - 8, imgSize - 8);
                ctx.restore();
            } else {
                const padding = 40;
                const finalImgSize = imgSize - (padding * 2);
                ctx.shadowColor = rarityColor;
                ctx.shadowBlur = 60;
                ctx.drawImage(img, imgX + padding, imgY + padding - 20, finalImgSize, finalImgSize);
                ctx.shadowBlur = 0;
            }
            imgDrawn = true;
        }
    }

    if (!imgDrawn) {
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '150px "Emoji", "Segoe UI Emoji", "Arial"';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = rarityColor;
        ctx.shadowBlur = 50;
        ctx.fillText('📦', imgX + imgSize / 2, imgY + imgSize / 2 - 20);
        ctx.shadowBlur = 0;
    }

    const textX = width - 80; 
    let textY = 120;

    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillStyle = rarityColor;
    ctx.font = 'bold 60px "Bein"';
    ctx.shadowColor = rarityColor;
    ctx.shadowBlur = 15;
    ctx.fillText(item.name.replace(/[\u{1F600}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F300}-\u{1F5FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FADF}\u{1F004}-\u{1F0CF}\u{2B00}-\u{2BFF}₿🪙]/gu, '').trim(), textX, textY);
    ctx.shadowBlur = 0;

    textY += 90;

    ctx.beginPath();
    ctx.moveTo(textX, textY);
    ctx.lineTo(imgX + imgSize + 50, textY);
    const lineGrad = ctx.createLinearGradient(textX, textY, imgX + imgSize + 50, textY);
    lineGrad.addColorStop(0, rarityColor);
    lineGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.strokeStyle = lineGrad;
    ctx.lineWidth = 3;
    ctx.stroke();

    textY += 30;

    ctx.fillStyle = '#E0E0E0';
    ctx.font = '28px "Bein"';
    ctx.fillText(`الـنـدرة:  ${item.rarity || 'عادي'}`, textX, textY);
    textY += 45;
    
    ctx.fillStyle = '#FFD700';
    ctx.fillText(`الـكـمـيـة الـمـتـوفـرة:  ${item.quantity.toLocaleString()}`, textX, textY);
    textY += 60;

    const descBoxX = imgX + imgSize + 50;
    const descBoxY = textY;
    const descBoxW = textX - descBoxX;
    const descBoxH = height - textY - 60;

    ctx.fillStyle = 'rgba(15, 20, 30, 0.7)';
    ctx.beginPath(); roundRect(ctx, descBoxX, descBoxY, descBoxW, descBoxH, 15); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1; ctx.stroke();

    ctx.fillStyle = '#A8B8D0';
    ctx.font = '24px "Bein", "Emoji"';
    
    const description = item.description ? item.description.replace(/[\u{1F600}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F300}-\u{1F5FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FADF}\u{1F004}-\u{1F0CF}\u{2B00}-\u{2BFF}₿🪙]/gu, '').trim() : "عنصر غامض لا يُعرف عنه الكثير.. قد يكون له استخدام سري في الإمبراطورية!";
    const lines = wrapText(ctx, description, descBoxW - 40);
    
    for (let j = 0; j < lines.length; j++) {
        ctx.fillText(lines[j], textX - 20, descBoxY + 20 + (j * 40));
    }

    return canvas.toBuffer('image/png', { compressionLevel: 1, filters: canvas.PNG_FILTER_NONE });
}

// 🌟 دالة رسم الممتلكات المحدثة 🌟
async function generatePortfolioCard(userDisplayName, items, page, totalPages, totalValue) {
    const width = 1200; 
    const height = 900; 
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    
    // خلفية راقية بستايل التداول والشاشات
    const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
    bgGrad.addColorStop(0, '#0f172a'); 
    bgGrad.addColorStop(1, '#020617'); 
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // إضافة شبكة خفيفة (Grid) لتعطي طابع الأسواق
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    for (let i = 0; i < width; i += 40) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, height); ctx.stroke();
    }
    for (let i = 0; i < height; i += 40) {
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(width, i); ctx.stroke();
    }

    // جزيئات خفيفة في الخلفية
    ctx.fillStyle = '#FFFFFF';
    for(let i=0; i<100; i++) {
        const px = Math.random() * width;
        const py = Math.random() * height;
        const pSize = Math.random() * 2;
        ctx.globalAlpha = Math.random() * 0.3 + 0.1;
        ctx.beginPath(); ctx.arc(px, py, pSize, 0, Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha = 1.0;
    
    const headerH = 140;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, width, headerH);
    
    const goldGrad = ctx.createLinearGradient(0, 0, width, 0);
    goldGrad.addColorStop(0, 'rgba(255, 215, 0, 0)');
    goldGrad.addColorStop(0.5, 'rgba(255, 215, 0, 0.9)');
    goldGrad.addColorStop(1, 'rgba(255, 215, 0, 0)');
    ctx.fillStyle = goldGrad;
    ctx.fillRect(0, headerH - 3, width, 3);
    ctx.fillRect(0, 3, width, 1);
    
    ctx.fillStyle = '#FFD700'; 
    ctx.font = 'bold 50px "Bein"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#FFD700';
    ctx.shadowBlur = 15;
    ctx.fillText(`✦ محفظة استثمارات ${userDisplayName} ✦`, width / 2, 50);
    ctx.shadowBlur = 0;
    
    ctx.fillStyle = '#00FF88';
    ctx.font = '30px "Bein"';
    ctx.fillText(`إجمالي القيمة: ${totalValue.toLocaleString()} مورا`, width / 2, 105);
    
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = 'bold 20px "Bein"';
    ctx.textAlign = 'right';
    ctx.fillText(`[ ${page} / ${totalPages || 1} ]`, width - 30, 70);

    const cols = 3;
    const rows = 3;
    const cardW = 350;
    const cardH = 220;
    const gapX = 45;
    const gapY = 30;
    const startX = (width - ((cols * cardW) + ((cols - 1) * gapX))) / 2;
    const startY = 170; 

    if (!items || items.length === 0) {
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 40px "Bein"'; 
        ctx.textAlign = 'center';
        ctx.fillText('المحفظة فارغة حالياً', width / 2, height / 2);
        return canvas.toBuffer('image/png', { compressionLevel: 1, filters: canvas.PNG_FILTER_NONE });
    }

    for (let i = 0; i < items.length; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = startX + col * (cardW + gapX);
        const y = startY + row * (cardH + gapY);
        const item = items[i];

        ctx.fillStyle = 'rgba(15, 20, 30, 0.85)';
        ctx.beginPath(); roundRect(ctx, x, y, cardW, cardH, 15); ctx.fill();
        drawOrnateFrame(ctx, x, y, cardW, cardH, 'rgba(255, 215, 0, 0.5)');

        const cleanName = item.name.replace(/[\u{1F600}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F300}-\u{1F5FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FADF}\u{1F004}-\u{1F0CF}\u{2B00}-\u{2BFF}₿🪙]/gu, '').trim();

        const imgSize = 65; 
        const imgX = x + cardW - imgSize - 15;
        const imgY = y + 12; 

        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.beginPath(); roundRect(ctx, imgX, imgY, imgSize, imgSize, 10); ctx.fill();
        ctx.strokeStyle = 'rgba(255, 215, 0, 0.4)'; ctx.lineWidth = 1.5; ctx.stroke();

        if (item.imgPath) {
            const img = await getCachedImage(item.imgPath);
            if (img) {
                const padding = 8; 
                const drawSize = imgSize - (padding * 2);
                ctx.save();
                ctx.beginPath();
                roundRect(ctx, imgX, imgY, imgSize, imgSize, 10);
                ctx.clip();
                ctx.drawImage(img, imgX + padding, imgY + padding, drawSize, drawSize);
                ctx.restore();
            } else {
                ctx.fillStyle = '#fff';
                ctx.font = '28px "Emoji", "Arial"';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('📈', imgX + imgSize/2, imgY + imgSize/2);
            }
        }

        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        drawAutoScaledText(ctx, cleanName, imgX - 15, imgY + imgSize/2, cardW - imgSize - 45, 24, 14);

        const sepY = imgY + imgSize + 12; 
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.beginPath(); ctx.moveTo(x + 15, sepY); ctx.lineTo(x + cardW - 15, sepY); ctx.stroke();

        let textY = sepY + 22; 
        const spacing = 26; 
        const textRightX = x + cardW - 20;
        const textLeftX = x + 20;

        const profit = (item.currentPrice - item.purchasePrice) * item.quantity;
        const isProfit = profit >= 0;
        const profitStr = isProfit ? `+${profit.toLocaleString()}` : profit.toLocaleString();

        const rowsData = [
            { label: 'الكمية', val: item.quantity.toLocaleString(), color: '#FFFFFF' }, 
            { label: 'سعر الشراء', val: item.purchasePrice.toLocaleString(), color: '#FFD700' }, 
            { label: 'السعر الحالي', val: item.currentPrice.toLocaleString(), color: '#00FF88' }, 
            { label: 'الأرباح', val: profitStr, color: isProfit ? '#00FF88' : '#FF4444' } 
        ];

        for (const r of rowsData) {
            ctx.font = '20px "Bein"';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#A8B8D0';
            ctx.fillText(r.label, textRightX, textY);

            ctx.textAlign = 'left';
            ctx.fillStyle = r.color;
            ctx.fillText(r.val, textLeftX, textY);

            textY += spacing;
        }
    }

    return canvas.toBuffer('image/png', { compressionLevel: 1, filters: canvas.PNG_FILTER_NONE });
}

module.exports = { resolveItemInfo, getInventoryCategories, generateInventoryCard, generateMainHub, generateItemDetailsCard, generatePortfolioCard };
