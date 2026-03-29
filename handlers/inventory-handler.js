const upgradeMats = require('../json/upgrade-materials.json');
let fishData = [], farmSeeds = [], farmFeeds = [], potionsData = [], marketData = [];

// استيراد جميع الملفات بأمان
try { 
    const fishJson = require('../json/fishing-config.json') || require('../json/fish.json');
    fishData = fishJson.fishItems || fishJson; 
} catch(e) {}
try { farmSeeds = require('../json/seeds.json'); } catch(e) {}
try { farmFeeds = require('../json/feed-items.json'); } catch(e) {}
try { potionsData = require('../json/potions.json'); } catch(e) {}
try { marketData = require('../json/market-items.json'); } catch(e) {}

// 🔥 القاموس السريع جداً (لزيادة سرعة قراءة المخزن بنسبة 99%) 🔥
const ITEM_DICTIONARY = new Map();

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

// بناء القاموس مرة واحدة فقط عند بدء التشغيل
function buildDictionary() {
    if (upgradeMats && upgradeMats.weapon_materials) {
        for (const race of upgradeMats.weapon_materials) {
            for (const mat of race.materials) {
                ITEM_DICTIONARY.set(mat.id, { name: mat.name, emoji: mat.emoji, category: 'materials', rarity: mat.rarity, imgPath: `images/materials/${race.race.toLowerCase().replace(' ', '_')}/${ID_TO_IMAGE[mat.id] || mat.id + '.png'}` });
            }
        }
    }
    if (upgradeMats && upgradeMats.skill_books) {
        for (const cat of upgradeMats.skill_books) {
            const typeFolder = cat.category === 'General_Skills' ? 'general' : 'race';
            for (const book of cat.books) {
                ITEM_DICTIONARY.set(book.id, { name: book.name, emoji: book.emoji, category: 'materials', rarity: book.rarity, imgPath: `images/materials/${typeFolder}/${ID_TO_IMAGE[book.id] || book.id + '.png'}` });
            }
        }
    }
    if (fishData && Array.isArray(fishData)) {
        for (const fish of fishData) {
            ITEM_DICTIONARY.set(fish.id, { name: fish.name, emoji: fish.emoji || '🐟', category: 'fishing', rarity: fish.rarity > 3 ? 'Epic' : 'Common', imgPath: fish.image || null });
        }
    }
    if (farmSeeds && Array.isArray(farmSeeds)) {
        for (const seed of farmSeeds) {
            ITEM_DICTIONARY.set(seed.id, { name: seed.name, emoji: seed.emoji || '🌾', category: 'farming', rarity: 'Common', imgPath: seed.image || `images/farm/seeds/${seed.id}.png` });
        }
    }
    if (farmFeeds && Array.isArray(farmFeeds)) {
        for (const feed of farmFeeds) {
            ITEM_DICTIONARY.set(feed.id, { name: feed.name, emoji: feed.emoji || '🌾', category: 'farming', rarity: 'Common', imgPath: feed.image || `images/feeds/${feed.id}.png` });
        }
    }
    if (potionsData && Array.isArray(potionsData)) {
        for (const potion of potionsData) {
            ITEM_DICTIONARY.set(potion.id, { name: potion.name, emoji: potion.emoji || '🧪', category: 'potions', rarity: 'Rare', imgPath: potion.image || `images/potions/${potion.id}.png` });
        }
    }
    if (marketData && Array.isArray(marketData)) {
        for (const market of marketData) {
            ITEM_DICTIONARY.set(market.id, { name: market.name, emoji: '📈', category: 'market', rarity: 'Epic', imgPath: market.image || `images/market/${market.id.toLowerCase()}.png` });
        }
    }
}

// تنفيذ البناء فوراً
buildDictionary();

function resolveItemInfo(itemId) {
    // جلب العنصر من القاموس بسرعة البرق (O(1))
    if (ITEM_DICTIONARY.has(itemId)) {
        return ITEM_DICTIONARY.get(itemId);
    }
    // عنصر غير معروف
    return { name: itemId, emoji: '📦', category: 'others', rarity: 'Common', imgPath: null };
}

async function getInventoryCategories(db, userId, guildId) {
    let inventory = [];
    let portfolio = [];
    
    // 🚀 جلب بيانات المخزن العادي ومحفظة الاستثمارات بالتوازي لسرعة خارقة 🚀
    try {
        const [invRes, portRes] = await Promise.all([
            db.query(`SELECT * FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId]),
            db.query(`SELECT * FROM user_portfolio WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId])
        ]);
        inventory = invRes.rows;
        portfolio = portRes.rows;
    } catch(e) {
        try {
            const [invRes, portRes] = await Promise.all([
                db.query(`SELECT * FROM user_inventory WHERE userid = $1 AND guildid = $2`, [userId, guildId]),
                db.query(`SELECT * FROM user_portfolio WHERE userid = $1 AND guildid = $2`, [userId, guildId])
            ]);
            inventory = invRes.rows;
            portfolio = portRes.rows;
        } catch(err) {
            console.error("❌ Inventory/Portfolio Fetch Error:", err);
            return { materials: [], fishing: [], farming: [], potions: [], market: [], others: [] };
        }
    }

    const categories = { materials: [], fishing: [], farming: [], potions: [], market: [], others: [] };
    
    // 📦 فرز عناصر المخزن العادي
    for (const row of inventory) {
        const itemId = row.itemID || row.itemid;
        const quantity = Number(row.quantity) || 0;
        
        if (quantity <= 0) continue;
        
        const itemInfo = resolveItemInfo(itemId);
        
        if (categories[itemInfo.category]) {
            categories[itemInfo.category].push({ ...itemInfo, quantity, id: itemId });
        } else {
            categories.others.push({ ...itemInfo, quantity, id: itemId });
        }
    }

    // 💼 فرز عناصر المحفظة الاستثمارية (السوق/الممتلكات)
    for (const row of portfolio) {
        const itemId = row.itemID || row.itemid;
        const quantity = Number(row.quantity) || 0;
        const purchasePrice = Number(row.purchasePrice || row.purchaseprice) || 0;

        if (quantity <= 0) continue;

        const itemInfo = resolveItemInfo(itemId);
        
        // دمجها بقسم السوق ليتم عرضها في الحقيبة
        categories.market.push({ ...itemInfo, quantity, id: itemId, purchasePrice });
    }
    
    return categories;
}

module.exports = { resolveItemInfo, getInventoryCategories };
