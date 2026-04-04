const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, Colors, AttachmentBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

// 🛡️ نظام استيراد محمي بمسارات معدلة لتناسب مجلد handlers 🛡️
let weaponsConfig = [];
let skillsConfig = [];
let upgradeMats = { weapon_materials: [], skill_books: [] };
let generateForgeUI = null;

try { weaponsConfig = require('../json/weapons-config.json'); } catch (e) { console.error("⚠️ لم يتم العثور على weapons-config.json"); }
try { skillsConfig = require('../json/skills-config.json'); } catch (e) { console.error("⚠️ لم يتم العثور على skills-config.json"); }
try { upgradeMats = require('../json/upgrade-materials.json'); } catch (e) { console.error("⚠️ لم يتم العثور على upgrade-materials.json"); }
try { ({ generateForgeUI } = require('../generators/forge-generator.js')); } catch (e) { console.error("⚠️ لم يتم العثور على forge-generator.js"); }

let addXPAndCheckLevel;
try { ({ addXPAndCheckLevel } = require('./handler-utils.js')); } 
catch (e) { try { ({ addXPAndCheckLevel } = require('../handler-utils.js')); } catch (e2) {} }

const R2_URL = 'https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev';
const SMELT_XP_RATES = { 'Common': 10, 'Uncommon': 20, 'Rare': 30, 'Epic': 100, 'Legendary': 1000 };
const SYNTHESIS_FEE = 999;
const LEARN_FEE = 250;

const ID_TO_IMAGE = {
    'mat_dragon_1': 'dragon_ash.png', 'mat_dragon_2': 'dragon_scale.png', 'mat_dragon_3': 'dragon_claw.png', 'mat_dragon_4': 'dragon_heart.png', 'mat_dragon_5': 'dragon_core.png',
    'mat_human_1': 'human_iron.png', 'mat_human_2': 'human_steel.png', 'mat_human_3': 'human_meteor.png', 'mat_human_4': 'human_seal.png', 'mat_human_5': 'human_crown.png',
    'mat_elf_1': 'elf_branch.png', 'mat_elf_2': 'elf_bark.png', 'mat_elf_3': 'elf_flower.png', 'mat_elf_4': 'elf_crystal.png', 'mat_elf_5': 'elf_tear.png',
    'mat_darkelf_1': 'darkelf_obsidian.png', 'mat_darkelf_2': 'darkelf_glass.png', 'mat_darkelf_3': 'darkelf_crystal.png', 'mat_darkelf_4': 'darkelf_void.png', 'mat_darkelf_5': 'darkelf_ash.png',
    'mat_seraphim_1': 'seraphim_feathe.png', 'mat_seraphim_2': 'seraphim_halo.png', 'mat_seraphim_3': 'seraphim_crystal.png', 'mat_seraphim_4': 'seraphim_core.png', 'mat_seraphim_5': 'seraphim_chalice.png',
    'demon_1': 'demon_ember.png', 'mat_demon_2': 'demon_horn.png', 'mat_demon_3': 'demon_crystal.png', 'mat_demon_4': 'demon_flame.png', 'mat_demon_5': 'demon_crown.png',
    'mat_vampire_1': 'vampire_blood.png', 'mat_vampire_2': 'vampire_vial.png', 'mat_vampire_3': 'vampire_fang.png', 'mat_vampire_4': 'vampire_moon.png', 'mat_vampire_5': 'vampire_chalice.png',
    'mat_spirit_1': 'spirit_dust.png', 'mat_spirit_2': 'spirit_remnant.png', 'mat_spirit_3': 'spirit_crystal.png', 'mat_spirit_4': 'spirit_core.png', 'mat_spirit_5': 'spirit_pulse.png',
    'mat_hybrid_1': 'hybrid_claw.png', 'mat_hybrid_2': 'hybrid_fur.png', 'mat_hybrid_3': 'hybrid_bone.png', 'mat_hybrid_4': 'hybrid_crystal.png', 'mat_hybrid_5': 'hybrid_soul.png',
    'mat_dwarf_1': 'dwarf_copper.png', 'mat_dwarf_2': 'dwarf_bronze.png', 'mat_dwarf_3': 'dwarf_mithril.png', 'mat_dwarf_4': 'dwarf_heart.png', 'mat_dwarf_5': 'dwarf_hammer.png',
    'mat_ghoul_1': 'ghoul_bone.png', 'mat_ghoul_2': 'ghoul_remains.png', 'mat_ghoul_3': 'ghoul_skull.png', 'mat_ghoul_4': 'ghoul_crystal.png', 'mat_ghoul_5': 'ghoul_core.png',
    'book_general_1': 'gen_book_tactic.png', 'book_general_2': 'gen_book_combat.png', 'book_general_3': 'gen_book_arts.png', 'book_general_4': 'gen_book_war.png', 'book_general_5': 'gen_book_wisdom.png',
    'book_race_1': 'race_book_stone.png', 'book_race_2': 'race_book_ancestor.png', 'book_race_3': 'race_book_secrets.png', 'book_race_4': 'race_book_covenant.png', 'book_race_5': 'race_book_pact.png'
};

const RARITY_ARABIC = { 'Common': 'شائع', 'Uncommon': 'غير شائع', 'Rare': 'نادر', 'Epic': 'ملحمي', 'Legendary': 'أسطوري' };

const RACE_MAPPING = [
    { keys: ['dragon', 'تنين', 'تنانين', 'دراجون', 'دراغون'], race: 'Dragon' },
    { keys: ['human', 'بشري', 'انسان', 'بشر', 'إنسان'], race: 'Human' },
    { keys: ['dark elf', 'ظلام', 'دارك', 'مظلم'], race: 'Dark Elf' },
    { keys: ['elf', 'الف', 'آلف', 'ايلف', 'إلف', 'جان'], race: 'Elf' },
    { keys: ['seraphim', 'سيرافيم', 'سماوي', 'ملائكة', 'ملاك', 'سرافيم'], race: 'Seraphim' },
    { keys: ['demon', 'شيطان', 'شياطين', 'ديمون'], race: 'Demon' },
    { keys: ['vampire', 'مصاص', 'فامباير', 'دماء'], race: 'Vampire' },
    { keys: ['spirit', 'روح', 'ارواح', 'أرواح', 'شبح'], race: 'Spirit' },
    { keys: ['dwarf', 'قزم', 'اقزام', 'أقزام', 'دوارف'], race: 'Dwarf' },
    { keys: ['ghoul', 'غول', 'غيلان', 'غُول'], race: 'Ghoul' },
    { keys: ['hybrid', 'نصف', 'هجين', 'هجناء', 'هايبرد'], race: 'Hybrid' }
];

function getSafeVal(row, keyName, fallback) {
    if (!row) return fallback;
    const key = Object.keys(row).find(k => k.toLowerCase() === keyName.toLowerCase());
    return key && row[key] !== null && row[key] !== undefined ? row[key] : fallback;
}

function getStandardRaceName(rawName) {
    if (!rawName) return null;
    const name = rawName.toLowerCase().trim();
    for (const group of RACE_MAPPING) {
        for (const key of group.keys) {
            if (key === 'الف' && (name.includes('مخالف') || name.includes('تحالف'))) continue;
            if (name.includes(key)) return group.race;
        }
    }
    if(weaponsConfig && weaponsConfig.length > 0) {
        return weaponsConfig.find(w => w.race.toLowerCase() === name)?.race || null;
    }
    return null;
}

function getSafeWeaponConfig(raceName) {
    if (!raceName || !weaponsConfig || weaponsConfig.length === 0) return { name: "غير معروف", base_damage: 15, damage_increment: 5 };
    return weaponsConfig.find(w => w.race.toLowerCase() === raceName.toLowerCase()) || weaponsConfig[0];
}

function getSafeRaceMats(raceName) {
    if (!raceName || !upgradeMats || !upgradeMats.weapon_materials || upgradeMats.weapon_materials.length === 0) return { materials: [] };
    return upgradeMats.weapon_materials.find(m => m.race.toLowerCase() === raceName.toLowerCase()) || upgradeMats.weapon_materials[0];
}

function getSafeBookCat(categoryName) {
    if (!categoryName || !upgradeMats || !upgradeMats.skill_books || upgradeMats.skill_books.length === 0) return { books: [] };
    return upgradeMats.skill_books.find(c => c.category.toLowerCase() === categoryName.toLowerCase()) || upgradeMats.skill_books[0];
}

function translateRarity(rarity) { return RARITY_ARABIC[rarity] || rarity; }

function resolveText(val) {
    if (val == null) return '';
    if (typeof val === 'object') return val.ar || val.en || val.name || JSON.stringify(val);
    return String(val);
}

const safeQuery = async (db, qPg, params) => {
    try { 
        let res = await db.query(qPg, params); 
        return { rows: Array.isArray(res) ? res : (res?.rows || []) };
    } catch(e) { 
        let fallbackQuery = qPg.replace(/"userID"/gi, "userid").replace(/"guildID"/gi, "guildid").replace(/"itemID"/gi, "itemid").replace(/"skillID"/gi, "skillid").replace(/"skillLevel"/gi, "skilllevel").replace(/"raceName"/gi, "racename").replace(/"weaponLevel"/gi, "weaponlevel").replace(/"quantity"/gi, "quantity").replace(/"mora"/gi, "mora").replace(/"bank"/gi, "bank").replace(/"level"/gi, "level").replace(/"id"/gi, "id").replace(/"user"/gi, "userid").replace(/"guild"/gi, "guildid");
        if (fallbackQuery !== qPg) {
            try { 
                let res2 = await db.query(fallbackQuery, params); 
                return { rows: Array.isArray(res2) ? res2 : (res2?.rows || []) };
            } catch(e2) { }
        }
        return { rows: [] };
    }
};

async function checkMora(db, userId, guildId, amount) {
    if (amount <= 0) return true;
    let res = await safeQuery(db, `SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2`, [userId, guildId]);
    if (!res || !res.rows || res.rows.length === 0) return false;

    let mora = Number(getSafeVal(res.rows[0], 'mora', 0));
    let bank = Number(getSafeVal(res.rows[0], 'bank', 0));
    return (mora + bank) >= amount;
}

async function checkItems(db, userId, guildId, itemsArray) {
    if (!itemsArray || itemsArray.length === 0) return true;
    let res = await safeQuery(db, `SELECT * FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId]);
    if(!res || !res.rows) return false;

    let requiredMap = {};
    for (let item of itemsArray) {
        if (!item || !item.id) continue;
        const reqId = String(item.id).toLowerCase().trim();
        requiredMap[reqId] = (requiredMap[reqId] || 0) + Number(item.count);
    }

    let userMap = {};
    res.rows.forEach(r => {
        const dbItemId = getSafeVal(r, 'itemid', '').toString().toLowerCase().trim();
        const dbQty = Number(getSafeVal(r, 'quantity', 0)); 
        if (dbItemId) userMap[dbItemId] = (userMap[dbItemId] || 0) + dbQty;
    });

    for (let reqId in requiredMap) {
        if ((userMap[reqId] || 0) < requiredMap[reqId]) return false;
    }
    return true;
}

async function deductMora(db, userId, guildId, amount) {
    if (amount <= 0) return true;
    let res = await safeQuery(db, `SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2`, [userId, guildId]);
    if (!res || !res.rows || res.rows.length === 0) return false;

    let mora = Number(getSafeVal(res.rows[0], 'mora', 0));
    let bank = Number(getSafeVal(res.rows[0], 'bank', 0));

    if (mora + bank < amount) return false;
    if (mora >= amount) mora -= amount;
    else { let diff = amount - mora; mora = 0; bank -= diff; }

    await safeQuery(db, `UPDATE levels SET "mora" = $1, "bank" = $2 WHERE "user" = $3 AND "guild" = $4`, [mora, bank, userId, guildId]);
    return true;
}

async function deductItems(db, userId, guildId, itemsArray) {
    if (!itemsArray || itemsArray.length === 0) return true;
    let res = await safeQuery(db, `SELECT * FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId]);
    
    let requiredMap = {};
    for (let item of itemsArray) {
        if (!item || !item.id) continue;
        const reqId = String(item.id).toLowerCase().trim();
        requiredMap[reqId] = (requiredMap[reqId] || 0) + Number(item.count);
    }

    for (let reqId in requiredMap) {
        let remainingToDeduct = requiredMap[reqId];
        for (let r of res.rows) {
            const dbItemId = getSafeVal(r, 'itemid', '').toString().toLowerCase().trim();
            if (dbItemId !== reqId) continue;
            if (remainingToDeduct <= 0) break;

            const q = Number(getSafeVal(r, 'quantity', 0));
            if (q <= 0) continue;
            
            const deduct = Math.min(q, remainingToDeduct);
            const rowId = getSafeVal(r, 'id', null);
            
            try { await db.query(`UPDATE user_inventory SET "quantity" = CAST(COALESCE("quantity", '0') AS INTEGER) - $1 WHERE "id" = $2`, [deduct, rowId]); } 
            catch(e) { await db.query(`UPDATE user_inventory SET quantity = CAST(COALESCE(quantity, '0') AS INTEGER) - $1 WHERE id = $2`, [deduct, rowId]).catch(()=>{}); }
            
            remainingToDeduct -= deduct;
        }
    }
    try { await db.query(`DELETE FROM user_inventory WHERE CAST(COALESCE("quantity", '0') AS INTEGER) <= 0 AND "userID" = $1 AND "guildID" = $2`, [userId, guildId]); } 
    catch(e) { await db.query(`DELETE FROM user_inventory WHERE CAST(COALESCE(quantity, '0') AS INTEGER) <= 0 AND userid = $1 AND guildid = $2`, [userId, guildId]).catch(()=>{}); }
    return true;
}

async function getUserRaceName(user, guild, db) {
    if (!guild) return null;
    const member = guild.members.cache.get(user.id) || await guild.members.fetch({ user: user.id, force: true }).catch(() => null);
    if (!member) return null;

    for (const role of member.roles.cache.values()) {
        const foundRace = getStandardRaceName(role.name);
        if (foundRace) return foundRace;
    }

    let raceRolesRes = await safeQuery(db, `SELECT * FROM race_roles WHERE "guildID" = $1`, [guild.id]);
    if (raceRolesRes && raceRolesRes.rows.length > 0) {
        const userRoleIDs = member.roles.cache.map(r => String(r.id).trim());
        const matched = raceRolesRes.rows.find(r => userRoleIDs.includes(String(getSafeVal(r, 'roleid', '')).trim()));
        if (matched) return getStandardRaceName(getSafeVal(matched, 'racename', ''));
    }
    return null;
}

function getWeaponDisplayDamage(weaponConfig, level) {
    if (!weaponConfig || level < 1) return 15;
    const base = weaponConfig.base_damage;
    const inc = weaponConfig.damage_increment;

    if (level <= 15) return Math.floor(base + (inc * (level - 1)));
    
    const damageAt15 = base + (inc * 14);
    const targetDamageAt30 = 800;
    const levelsRemaining = 15; 
    if (damageAt15 >= targetDamageAt30) return Math.floor(base + (inc * (level - 1)));
    const dynamicIncrement = (targetDamageAt30 - damageAt15) / levelsRemaining;
    let finalDamage = damageAt15 + (dynamicIncrement * (level - 15));
    if (level >= 30) return targetDamageAt30;
    return Math.floor(finalDamage);
}

function getSkillDisplayValue(skillConfig, currentLevel) {
    if (!skillConfig) return 0;
    const level = Math.max(1, currentLevel || 1);
    const base = skillConfig.base_value;
    const inc = skillConfig.value_increment;
    const isPercentage = skillConfig.stat_type === '%' || skillConfig.id.includes('heal') || skillConfig.id.includes('shield');

    let finalValue = 0;
    if (level <= 15) finalValue = base + (inc * (level - 1));
    else {
        const valueAt15 = base + (inc * 14);
        const targetValueAt30 = isPercentage ? 50 : 200; 
        const levelsRemaining = 15;
        if (valueAt15 >= targetValueAt30) finalValue = base + (inc * (level - 1));
        else {
             const dynamicIncrement = (targetValueAt30 - valueAt15) / levelsRemaining;
             finalValue = valueAt15 + (dynamicIncrement * (level - 15));
             if (level >= 30) finalValue = targetValueAt30;
        }
    }
    return isPercentage ? Number(finalValue.toFixed(1)) : Math.floor(finalValue);
}

// 🔥 التعديل الجذري والأسطوري لتسهيل حياة المبتدئين 🔥
function getUpgradeRequirements(currentLevel, isSkill = false) {
    if (currentLevel >= 30 || currentLevel === 0) return null;
    let reqs = [], moraCost = 0;
    const currentTier = Math.floor((currentLevel - 1) / 5); 
    const primaryTier = Math.min(currentTier, 4);

    // 1. نظام المورا المتدرج
    if (currentLevel < 5) {
        moraCost = currentLevel * 300; 
    } else if (currentLevel < 10) {
        moraCost = currentLevel * 600; 
    } else {
        moraCost = currentLevel * 800 * (primaryTier + 1); 
    }

    // 2. نظام الموارد المتدرج
    if (currentLevel < 5) {
        // المستويات 1 إلى 5: مورا فقط، بدون أي موارد أو كتب!
        // reqs يبقى فارغاً
    } else if (currentLevel >= 5 && currentLevel < 10) {
        // المستويات 6 إلى 10: يطلب من 1 إلى 3 حبات من نفس النوع فقط!
        let count = 1;
        if (currentLevel >= 7) count = 2;
        if (currentLevel >= 9) count = 3;
        
        reqs.push({ tier: primaryTier, count: count });
    } else {
        // النظام القديم الصعب للمستويات 11 فما فوق (يطلب نوعين بكميات أكبر)
        if (primaryTier === 0) {
            reqs.push({ tier: 0, count: currentLevel + 2 }); 
        } else {
            const prevTier = primaryTier - 1;
            reqs.push({ tier: prevTier, count: Math.floor(currentLevel * 0.8) + 3 });
            reqs.push({ tier: primaryTier, count: Math.floor(currentLevel * 0.5) + 2 });
        }
    }

    let finalReqs = [];
    for (let r of reqs) {
        if (!isSkill) {
            finalReqs.push({ type: 'material', tier: r.tier, count: r.count });
        } else {
            finalReqs.push({ type: 'book', tier: r.tier, count: r.count });
            
            // إعفاء تام من الموارد للمهارات حتى مستوى 10!
            if (currentLevel >= 10) {
                finalReqs.push({ type: 'material', tier: r.tier, count: Math.max(1, Math.floor(r.count * 0.5)) });
            }
        }
    }
    return { moraCost, materials: finalReqs };
}

function getItemInfo(itemId) {
    if(!itemId) return null;
    const lowerId = itemId.toLowerCase();
    if (upgradeMats.weapon_materials) {
        for (const r of upgradeMats.weapon_materials) {
            const mat = r.materials.find(m => m.id.toLowerCase() === lowerId);
            if (mat) {
                const raceFolder = r.race.toLowerCase().replace(' ', '_');
                const imgName = ID_TO_IMAGE[mat.id] || `${mat.id}.png`;
                return { ...mat, type: 'material', race: r.race, name: resolveText(mat.name), iconUrl: `${R2_URL}/images/materials/${raceFolder}/${imgName}`, rarity: mat.rarity };
            }
        }
    }
    if (upgradeMats.skill_books) {
        for (const c of upgradeMats.skill_books) {
            const book = c.books.find(b => b.id.toLowerCase() === lowerId);
            if (book) {
                const typeFolder = c.category === 'General_Skills' ? 'general' : 'race';
                const imgName = ID_TO_IMAGE[book.id] || `${book.id}.png`;
                return { ...book, type: 'book', name: resolveText(book.name), iconUrl: `${R2_URL}/images/materials/${typeFolder}/${imgName}`, rarity: book.rarity };
            }
        }
    }
    return null;
}

function aggregateInventory(rows) {
    const map = {};
    for (const r of rows) {
        const id = getSafeVal(r, 'itemid', '').toString().toLowerCase().trim(); 
        const qty = Number(getSafeVal(r, 'quantity', 0));
        
        if (!id) continue;
        if (!map[id]) map[id] = 0;
        map[id] += qty;
    }
    return Object.keys(map).map(id => ({ itemID: id, quantity: map[id] }));
}

const getMainMenuRows = () => [
    new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('forge_weapon').setLabel('الحـدادة').setStyle(ButtonStyle.Secondary).setEmoji('⚒️'),
        new ButtonBuilder().setCustomId('forge_skill_menu').setLabel('الاكادمـيـة').setStyle(ButtonStyle.Primary).setEmoji('🔮')
    ),
    new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('forge_synthesis').setLabel('فـرن الـدمـج').setStyle(ButtonStyle.Success).setEmoji('⚗️'),
        new ButtonBuilder().setCustomId('forge_smelting').setLabel('المـصـهـر').setStyle(ButtonStyle.Danger).setEmoji('🌋')
    )
];

const getReturnRow = () => new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('forge_return_main').setEmoji('↩️').setStyle(ButtonStyle.Secondary)
);

async function getUpgradeState(db, userId, guildId, currentLevel, isSkill, skillId, roleRaceName, wData) {
    const dbRaceName = getSafeVal(wData, 'racename', null);
    const raceName = dbRaceName ? (getStandardRaceName(dbRaceName) || roleRaceName) : roleRaceName;
    if (!raceName) return null;

    const reqs = getUpgradeRequirements(currentLevel, isSkill);
    if (!reqs) return null;

    const raceMats = getSafeRaceMats(raceName);
    let bookCat = null;
    if (isSkill) {
        const categoryName = skillId.startsWith('race_') ? 'Race_Skills' : 'General_Skills';
        bookCat = getSafeBookCat(categoryName);
    }

    let reqMap = {};
    reqs.materials.forEach(r => {
        let itemId = isSkill ? (r.type === 'book' ? bookCat.books[r.tier]?.id : raceMats.materials[r.tier]?.id) : raceMats.materials[r.tier]?.id;
        if (itemId) {
            reqMap[itemId] = (reqMap[itemId] || 0) + r.count;
        }
    });

    let detailedReqs = Object.keys(reqMap).map(id => ({ id: id, count: reqMap[id] }));

    const hasMora = await checkMora(db, userId, guildId, reqs.moraCost);
    
    let invRes = await safeQuery(db, `SELECT * FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId]);
    
    let uiReqs = detailedReqs.map(r => {
        let userMatCount = 0;
        if (invRes?.rows) {
            invRes.rows.forEach(row => {
                const dbItemId = getSafeVal(row, 'itemid', '').toString().toLowerCase().trim();
                if (dbItemId === String(r.id).toLowerCase().trim()) userMatCount += Number(getSafeVal(row, 'quantity', 0));
            });
        }
        let matInfo = getItemInfo(r.id);
        return { id: r.id, count: r.count, userCount: userMatCount, name: matInfo?.name || "مجهول", rarity: matInfo?.rarity || "Common", iconUrl: matInfo?.iconUrl };
    });

    const hasItems = uiReqs.every(r => r.userCount >= r.count);

    return { canUpgrade: hasMora && hasItems, hasMora, hasItems, reqMora: reqs.moraCost, uiReqs, detailedReqs, raceName };
}

async function replyWithCanvas(i, user, view, data, components, isInitial = false) {
    let returnMessage = null;
    try {
        if (!generateForgeUI) {
            const fbEmbed = new EmbedBuilder().setTitle(data.title || "النظام").setDescription("❌ عذراً، محرك الرسم متوقف حالياً. يرجى التأكد من مسار `forge-generator.js`.").setColor(Colors.Red);
            if (i.deferred || i.replied) returnMessage = await i.editReply({ content: null, embeds: [fbEmbed], components }).catch(()=>{});
            else if (typeof i.reply === 'function') returnMessage = await i.reply({ content: null, embeds: [fbEmbed], components, fetchReply: true }).catch(()=>{});
            return returnMessage || i;
        }

        const buffer = await generateForgeUI(user, view, data);
        if (buffer) {
            const filename = `forge_${Date.now()}.png`; 
            const attachment = new AttachmentBuilder(buffer, { name: filename });
            if (i.deferred || i.replied) returnMessage = await i.editReply({ content: null, embeds: [], components, files: [attachment] }).catch(()=>{});
            else if (typeof i.reply === 'function') returnMessage = await i.reply({ content: null, embeds: [], components, files: [attachment], fetchReply: true }).catch(()=>{});
            return returnMessage || i; 
        }
    } catch (e) {
        console.error("[Forge Core Error]", e);
    }
    return i;
}

async function buildMainUI(i, user, guildId, db, isInitial = false) {
    let userDataRes = await safeQuery(db, `SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2`, [user.id, guildId]);
    const userMora = Number(getSafeVal(userDataRes?.rows?.[0], 'mora', 0)) + Number(getSafeVal(userDataRes?.rows?.[0], 'bank', 0));
    return await replyWithCanvas(i, user, 'main', { mora: userMora, title: 'المجمع الإمبراطوري للتطوير' }, getMainMenuRows(), isInitial);
}

async function buildWeaponForgeUI(i, user, guildId, db) {
    const roleRaceName = await getUserRaceName(user, i.guild, db);
    const [userMoraRes, weaponRes, lvlRes] = await Promise.all([
        safeQuery(db, `SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2`, [user.id, guildId]),
        safeQuery(db, `SELECT * FROM user_weapons WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guildId]),
        safeQuery(db, `SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2`, [user.id, guildId])
    ]);

    const wData = weaponRes?.rows?.[0];
    const userMora = Number(getSafeVal(userMoraRes?.rows?.[0], 'mora', 0)) + Number(getSafeVal(userMoraRes?.rows?.[0], 'bank', 0));
    const currentLevel = Number(getSafeVal(wData, 'weaponlevel', 0));
    
    const dbRaceName = getSafeVal(wData, 'racename', null);
    const fallbackRaceName = dbRaceName ? (getStandardRaceName(dbRaceName) || roleRaceName) : roleRaceName;
    const weaponConfig = getSafeWeaponConfig(fallbackRaceName);

    if (!fallbackRaceName) return await replyWithCanvas(i, user, 'weapon_error', { mora: 0, title: 'الحدادة', hasError: true, errorMsg: 'يجب اختيار عرقك أولاً من القائمة الرئيسية للحدادة!' }, [getReturnRow()]);

    if (currentLevel === 0) {
        const btnRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`forge_buy_weapon`)
                .setLabel(`صناعة السلاح الأساسي (${LEARN_FEE} مورا)`)
                .setStyle(userMora >= LEARN_FEE ? ButtonStyle.Success : ButtonStyle.Secondary)
                .setDisabled(userMora < LEARN_FEE),
            getReturnRow().components[0]
        );
        return await replyWithCanvas(i, user, 'weapon', { mora: userMora, title: `صناعة ${resolveText(weaponConfig.name)}`, currentLevel: 0, nextLevel: 1, currentStat: `0 DMG`, nextStat: `${getWeaponDisplayDamage(weaponConfig, 1)} DMG`, reqMora: LEARN_FEE, detailedReqs: [{ id: 'mora_fee', count: LEARN_FEE, userCount: userMora, name: 'رسوم الصناعة', rarity: 'Common', iconUrl: 'https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev/images/mora.png' }] }, [btnRow]);
    }
    
    if (currentLevel >= 30) return await replyWithCanvas(i, user, 'weapon_error', { mora: userMora, title: `تطوير ${resolveText(weaponConfig.name)}`, hasError: true, errorMsg: '✨ سلاحك وصل للحد الأقصى (Lv.30)!' }, [getReturnRow()]);

    const playerServerLevel = Number(getSafeVal(lvlRes?.rows?.[0], 'level', 1));
    if (currentLevel >= 15 && playerServerLevel < 30) return await replyWithCanvas(i, user, 'weapon_error', { mora: userMora, title: `تطوير ${resolveText(weaponConfig.name)}`, hasError: true, errorMsg: 'قفل المستوى: يجب أن تصل إلى المستوى 30 في السيرفر.' }, [getReturnRow()]);

    const state = await getUpgradeState(db, user.id, guildId, currentLevel, false, null, roleRaceName, wData);
    if (!state) return await replyWithCanvas(i, user, 'weapon_error', { mora: userMora, title: 'الحدادة', hasError: true, errorMsg: 'حدث خطأ في قراءة موارد التطوير.' }, [getReturnRow()]);

    const btnRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`forge_upgrade_weapon`)
            .setLabel('تـطـويـر السـلاح')
            .setStyle(state.canUpgrade ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setDisabled(!state.canUpgrade),
        getReturnRow().components[0]
    );
    
    return await replyWithCanvas(i, user, 'weapon', { mora: userMora, title: `تطوير ${resolveText(weaponConfig.name)}`, currentLevel, nextLevel: currentLevel + 1, currentStat: `${getWeaponDisplayDamage(weaponConfig, currentLevel)} DMG`, nextStat: `${getWeaponDisplayDamage(weaponConfig, currentLevel + 1)} DMG`, reqMora: state.reqMora, detailedReqs: state.uiReqs }, [btnRow]);
}

async function handleWeaponBuy(i, user, guildId, db) {
    const raceName = await getUserRaceName(user, i.guild, db);
    const hasMora = await checkMora(db, user.id, guildId, LEARN_FEE);
    if (!hasMora) return await replyWithCanvas(i, user, 'weapon_error', { mora: 0, title: 'الحدادة', hasError: true, errorMsg: `لا تملك ${LEARN_FEE} مورا لصناعة السلاح!` }, [getReturnRow()]);

    await deductMora(db, user.id, guildId, LEARN_FEE);
    await safeQuery(db, `DELETE FROM user_weapons WHERE "userID" = $1 AND "guildID" = $2 AND "raceName" = $3`, [user.id, guildId, raceName]);
    await safeQuery(db, `INSERT INTO user_weapons ("userID", "guildID", "raceName", "weaponLevel") VALUES ($1, $2, $3, 1)`, [user.id, guildId, raceName]);
    
    await buildWeaponForgeUI(i, user, guildId, db); 
}

async function handleWeaponUpgrade(i, user, guildId, db) {
    const roleRaceName = await getUserRaceName(user, i.guild, db);
    const [weaponRes, lvlRes] = await Promise.all([
        safeQuery(db, `SELECT * FROM user_weapons WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guildId]),
        safeQuery(db, `SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2`, [user.id, guildId])
    ]);

    const wData = weaponRes?.rows?.[0];
    if (!wData) return await replyWithCanvas(i, user, 'weapon_error', { mora: 0, title: 'الحدادة', hasError: true, errorMsg: 'يجب صناعة السلاح الأساسي أولاً!' }, [getReturnRow()]);

    const currentLevel = Number(getSafeVal(wData, 'weaponlevel', 0));
    const playerServerLevel = Number(getSafeVal(lvlRes?.rows?.[0], 'level', 1));
    if (currentLevel >= 15 && playerServerLevel < 30) return; 

    const state = await getUpgradeState(db, user.id, guildId, currentLevel, false, null, roleRaceName, wData);
    if (!state) return;

    if (!state.hasMora) return await replyWithCanvas(i, user, 'weapon_error', { mora: 0, title: 'الحدادة', hasError: true, errorMsg: 'لا تملك المورا الكافية للتطوير!' }, [getReturnRow()]);
    if (!state.hasItems) return await replyWithCanvas(i, user, 'weapon_error', { mora: 0, title: 'الحدادة', hasError: true, errorMsg: 'لا تملك الموارد الكافية للتطوير!' }, [getReturnRow()]);

    await deductMora(db, user.id, guildId, state.reqMora);
    await deductItems(db, user.id, guildId, state.detailedReqs);

    const dbRaceName = getSafeVal(wData, 'racename', state.raceName);

    try { await db.query(`UPDATE user_weapons SET "weaponLevel" = "weaponLevel" + 1 WHERE "userID" = $1 AND "guildID" = $2 AND "raceName" = $3`, [user.id, guildId, dbRaceName]); } 
    catch(e) { await db.query(`UPDATE user_weapons SET weaponlevel = weaponlevel + 1 WHERE userid = $1 AND guildid = $2 AND racename = $3`, [user.id, guildId, dbRaceName]).catch(()=>{}); }
    
    const weaponConfig = getSafeWeaponConfig(state.raceName);
    const nextLevel = currentLevel + 1;
    await replyWithCanvas(i, user, 'success_weapon', { title: `تطوير ${resolveText(weaponConfig.name)}`, currentLevel: currentLevel, nextLevel: nextLevel, nextStat: `${getWeaponDisplayDamage(weaponConfig, nextLevel)} DMG` }, [getReturnRow()]);
}

async function buildAcademyMenuUI(i, user, guildId, db, isInitial = false) {
    const raceName = await getUserRaceName(user, i.guild, db);
    if (!raceName) return await replyWithCanvas(i, user, 'skill_home', { mora: 0, title: 'أكاديمية السحر', hasError: true, errorMsg: 'يجب اختيار عرقك أولاً!' }, [getReturnRow()], isInitial);
    
    const raceSkillId = `race_${raceName.toLowerCase().replace(/\s+/g, '_')}_skill`;
    const [userMoraRes, skillsRes] = await Promise.all([
        safeQuery(db, `SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2`, [user.id, guildId]),
        safeQuery(db, `SELECT * FROM user_skills WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guildId])
    ]);

    const userMora = Number(getSafeVal(userMoraRes?.rows?.[0], 'mora', 0)) + Number(getSafeVal(userMoraRes?.rows?.[0], 'bank', 0));
    const userSkills = skillsRes?.rows || [];
    const skillMap = {};
    userSkills.forEach(s => skillMap[getSafeVal(s, 'skillid', '')] = Number(getSafeVal(s, 'skilllevel', 0)));

    const availableSkills = skillsConfig.filter(sc => sc.id.startsWith('skill_') || sc.id === raceSkillId);
    const skillOptions = availableSkills.map(sc => {
        const lvl = skillMap[sc.id] || 0;
        return { label: resolveText(sc.name).substring(0, 100), value: sc.id.substring(0, 100), description: `Lv.${lvl}`.substring(0, 100) };
    });

    const skillSelectRow = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('forge_skill_select').setPlaceholder('اختر مهارة للتعلم أو الصقل...').addOptions(skillOptions.slice(0, 25)));
    return await replyWithCanvas(i, user, 'skill_home', { mora: userMora, title: 'أكاديمية السحر' }, [skillSelectRow, getReturnRow()], isInitial);
}

async function buildSkillUpgradeUI(i, user, guildId, db, skillId) {
    const roleRaceName = await getUserRaceName(user, i.guild, db);
    const [userMoraRes, skillRes, lvlRes, wpnRes] = await Promise.all([
        safeQuery(db, `SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2`, [user.id, guildId]),
        safeQuery(db, `SELECT * FROM user_skills WHERE "userID" = $1 AND "guildID" = $2 AND "skillID" = $3`, [user.id, guildId, skillId]),
        safeQuery(db, `SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2`, [user.id, guildId]),
        safeQuery(db, `SELECT * FROM user_weapons WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guildId])
    ]);

    const userMora = Number(getSafeVal(userMoraRes?.rows?.[0], 'mora', 0)) + Number(getSafeVal(userMoraRes?.rows?.[0], 'bank', 0));
    const currentLevel = Number(getSafeVal(skillRes?.rows?.[0], 'skilllevel', 0));
    const configSkill = skillsConfig.find(sc => sc.id === skillId) || skillsConfig[0];
    const statSymbol = configSkill?.stat_type === '%' ? '%' : '';
    
    if (currentLevel === 0) {
        const btnRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`forge_learn_skill_${skillId}`)
                .setLabel(`تعلم المهارة (${LEARN_FEE} مورا)`)
                .setStyle(userMora >= LEARN_FEE ? ButtonStyle.Success : ButtonStyle.Secondary)
                .setDisabled(userMora < LEARN_FEE),
            getReturnRow().components[0]
        );
        return await replyWithCanvas(i, user, 'skill', {
            mora: userMora, title: `تعلم ${resolveText(configSkill.name)}`, currentLevel: 0, nextLevel: 1, currentStat: `0${statSymbol}`, nextStat: `${getSkillDisplayValue(configSkill, 1)}${statSymbol}`, reqMora: LEARN_FEE, 
            detailedReqs: [{ id: 'mora_fee', count: LEARN_FEE, userCount: userMora, name: 'رسوم التعلم', rarity: 'Common', iconUrl: 'https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev/images/mora.png' }]
        }, [btnRow]);
    }

    if (currentLevel >= (configSkill.max_level || 30)) return await replyWithCanvas(i, user, 'skill_error', { mora: userMora, title: `صقل ${resolveText(configSkill.name)}`, hasError: true, errorMsg: '✨ المهارة وصلت للحد الأقصى!' }, [getReturnRow()]);

    const playerServerLevel = Number(getSafeVal(lvlRes?.rows?.[0], 'level', 1));
    if (currentLevel >= 15 && playerServerLevel < 30) return await replyWithCanvas(i, user, 'skill_error', { mora: userMora, title: `صقل ${resolveText(configSkill.name)}`, hasError: true, errorMsg: 'قفل المستوى: يجب أن تصل لـ Lv 30 أولاً.' }, [getReturnRow()]);

    const wData = wpnRes?.rows?.[0] || null;
    
    const state = await getUpgradeState(db, user.id, guildId, currentLevel, true, skillId, roleRaceName, wData);
    if (!state) return await replyWithCanvas(i, user, 'skill_error', { mora: userMora, title: 'أكاديمية السحر', hasError: true, errorMsg: 'يجب اختيار عرقك أولاً!' }, [getReturnRow()]);

    const btnRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`forge_upgrade_skill_${skillId}`)
            .setLabel('صقل المهارة 📜')
            .setStyle(state.canUpgrade ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setDisabled(!state.canUpgrade),
        getReturnRow().components[0]
    );
    
    return await replyWithCanvas(i, user, 'skill', { mora: userMora, title: `صقل ${resolveText(configSkill.name)}`, currentLevel, nextLevel: currentLevel + 1, currentStat: `${getSkillDisplayValue(configSkill, currentLevel)}${statSymbol}`, nextStat: `${getSkillDisplayValue(configSkill, currentLevel + 1)}${statSymbol}`, reqMora: state.reqMora, detailedReqs: state.uiReqs }, [btnRow]);
}

async function handleSkillLearn(i, user, guildId, db, skillId) {
    const hasMora = await checkMora(db, user.id, guildId, LEARN_FEE);
    if (!hasMora) return await replyWithCanvas(i, user, 'skill_error', { mora: 0, title: 'أكاديمية السحر', hasError: true, errorMsg: `لا تملك ${LEARN_FEE} مورا لتعلم المهارة!` }, [getReturnRow()]);

    await deductMora(db, user.id, guildId, LEARN_FEE);
    try {
        await db.query(`DELETE FROM user_skills WHERE "userID" = $1 AND "guildID" = $2 AND "skillID" = $3`, [user.id, guildId, skillId]);
        await db.query(`INSERT INTO user_skills ("userID", "guildID", "skillID", "skillLevel") VALUES ($1, $2, $3, 1)`, [user.id, guildId, skillId]);
    } catch(e) {
        await db.query(`DELETE FROM user_skills WHERE userid = $1 AND guildid = $2 AND skillid = $3`, [user.id, guildId, skillId]).catch(()=>{});
        await db.query(`INSERT INTO user_skills (userid, guildid, skillid, skilllevel) VALUES ($1, $2, $3, 1)`, [user.id, guildId, skillId]).catch(()=>{});
    }
    await buildSkillUpgradeUI(i, user, guildId, db, skillId);
}

async function handleSkillUpgrade(i, user, guildId, db, skillId) {
    const roleRaceName = await getUserRaceName(user, i.guild, db);
    const [skillRes, lvlRes, wpnRes] = await Promise.all([
        safeQuery(db, `SELECT * FROM user_skills WHERE "userID" = $1 AND "guildID" = $2 AND "skillID" = $3`, [user.id, guildId, skillId]),
        safeQuery(db, `SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2`, [user.id, guildId]),
        safeQuery(db, `SELECT * FROM user_weapons WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guildId])
    ]);

    if (!skillRes?.rows?.[0]) return;
    const currentLevel = Number(getSafeVal(skillRes.rows[0], 'skilllevel', 0));
    const playerServerLevel = Number(getSafeVal(lvlRes?.rows?.[0], 'level', 1));
    if (currentLevel >= 15 && playerServerLevel < 30) return; 

    const wData = wpnRes?.rows?.[0] || null;

    const state = await getUpgradeState(db, user.id, guildId, currentLevel, true, skillId, roleRaceName, wData);
    if (!state) return;

    if (!state.hasMora) return await replyWithCanvas(i, user, 'skill_error', { mora: 0, title: 'أكاديمية السحر', hasError: true, errorMsg: 'لا تملك المورا الكافية للترقية!' }, [getReturnRow()]);
    if (!state.hasItems) return await replyWithCanvas(i, user, 'skill_error', { mora: 0, title: 'أكاديمية السحر', hasError: true, errorMsg: 'لا تملك الموارد الكافية للترقية!' }, [getReturnRow()]);

    await deductMora(db, user.id, guildId, state.reqMora);
    await deductItems(db, user.id, guildId, state.detailedReqs);

    try { await db.query(`UPDATE user_skills SET "skillLevel" = "skillLevel" + 1 WHERE "userID" = $1 AND "guildID" = $2 AND "skillID" = $3`, [user.id, guildId, skillId]); } 
    catch(e) { await db.query(`UPDATE user_skills SET skilllevel = skilllevel + 1 WHERE userid = $1 AND guildid = $2 AND skillid = $3`, [user.id, guildId, skillId]).catch(()=>{}); }
    
    const configSkill = skillsConfig.find(sc => sc.id === skillId) || skillsConfig[0];
    const statSymbol = configSkill.stat_type === '%' ? '%' : '';
    await replyWithCanvas(i, user, 'success_skill', { title: `صقل ${resolveText(configSkill.name)}`, currentLevel: currentLevel, nextLevel: currentLevel + 1, nextStat: `${getSkillDisplayValue(configSkill, currentLevel + 1)}${statSymbol}` }, [getReturnRow()]);
}

async function buildSynthesisUI(i, user, guildId, db, state, isInitial = false) {
    const [moraRes, invRes, wRes] = await Promise.all([
        safeQuery(db, `SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2`, [user.id, guildId]),
        safeQuery(db, `SELECT * FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guildId]),
        safeQuery(db, `SELECT * FROM user_weapons WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guildId])
    ]);

    const userMora = Number(getSafeVal(moraRes?.rows?.[0], 'mora', 0)) + Number(getSafeVal(moraRes?.rows?.[0], 'bank', 0));
    const inventory = aggregateInventory(invRes?.rows || []);
    
    let userRace = null;
    if (wRes.rows[0]) {
        userRace = getStandardRaceName(getSafeVal(wRes.rows[0], 'racename', ''));
    }

    const availableSacrifices = inventory.filter(row => {
        if (row.quantity < 4) return false;
        const info = getItemInfo(row.itemID);
        if (!info) return false;
        return true;
    });

    if (availableSacrifices.length === 0) return await replyWithCanvas(i, user, 'synthesis_home', { mora: userMora, title: 'فرن الدمج', hasError: true, errorMsg: 'لا تملك 4 عناصر متشابهة.' }, [getReturnRow()], isInitial);

    let components = [];
    let payloadData = { mora: userMora, title: 'فرن الدمج', fee: SYNTHESIS_FEE };

    if (!state.sacrificeItem) {
        const sacrificeOptions = availableSacrifices.map(row => {
            const info = getItemInfo(row.itemID);
            return { label: info.name.substring(0, 100), value: info.id.substring(0, 100), description: `الكمية: ${row.quantity} | الندرة: ${translateRarity(info.rarity)}`.substring(0, 100) };
        }).slice(0, 25);
        components.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('forge_synth_sacrifice').setPlaceholder('1. اختر العنصر الذي ستضحي به').addOptions(sacrificeOptions)));
    } else {
        const sacInfo = getItemInfo(state.sacrificeItem);
        if(!sacInfo) { state.sacrificeItem = null; return buildSynthesisUI(i, user, guildId, db, state, isInitial); }

        payloadData.sacMatName = sacInfo.name; payloadData.reqMatIcon = sacInfo.iconUrl;

        let targetOptions = [];
        const rMats = getSafeRaceMats(userRace);
        if (rMats && rMats.materials) {
            const matMatch = rMats.materials.find(m => m.rarity === sacInfo.rarity);
            if (matMatch && matMatch.id !== sacInfo.id) targetOptions.push({ label: resolveText(matMatch.name).substring(0, 100), value: matMatch.id.substring(0, 100) });
        }
        if (upgradeMats.skill_books) {
            upgradeMats.skill_books.forEach(cat => {
                const bookMatch = cat.books.find(b => b.rarity === sacInfo.rarity);
                if (bookMatch && bookMatch.id !== sacInfo.id) targetOptions.push({ label: resolveText(bookMatch.name).substring(0, 100), value: bookMatch.id.substring(0, 100) });
            });
        }

        const uniqueTargetsMap = new Map(); targetOptions.forEach(opt => uniqueTargetsMap.set(opt.value, opt));
        const uniqueTargets = Array.from(uniqueTargetsMap.values());

        if (!state.targetItem && uniqueTargets.length > 0) {
            components.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('forge_synth_target').setPlaceholder('2. اختر العنصر المطلوب...').addOptions(uniqueTargets.slice(0, 25))));
        }

        if (state.targetItem) {
            const targetInfo = getItemInfo(state.targetItem);
            if(targetInfo) {
                payloadData.targetMatName = targetInfo.name; payloadData.targetMatIcon = targetInfo.iconUrl;
                
                const userQty = inventory.find(r => r.itemID === state.sacrificeItem)?.quantity || 0;
                const maxSynth = Math.floor(userQty / 4);

                const actionRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('forge_execute_synth')
                        .setLabel(`دمــج`)
                        .setStyle(userMora >= SYNTHESIS_FEE ? ButtonStyle.Success : ButtonStyle.Secondary)
                        .setDisabled(userMora < SYNTHESIS_FEE)
                );
                
                if (maxSynth > 1) {
                    actionRow.addComponents(
                        new ButtonBuilder()
                            .setCustomId(`forge_synth_multi_${state.targetItem}`)
                            .setLabel(`دمـج متعـدد`)
                            .setStyle(userMora >= (SYNTHESIS_FEE * 2) ? ButtonStyle.Primary : ButtonStyle.Secondary)
                    );
                }
                
                components.push(actionRow);
            }
        }
    }
    components.push(getReturnRow());
    return await replyWithCanvas(i, user, 'synthesis', payloadData, components, isInitial);
}

async function handleSynthesisMultiModal(i, user, guildId, db, state, client) {
    const targetId = i.customId.replace('forge_synth_multi_', '');
    state.targetItem = targetId;
    const modal = new ModalBuilder().setCustomId(`modal_synth_${targetId}`).setTitle('فرن الدمج - دمج متعدد');
    const input = new TextInputBuilder().setCustomId('synth_qty').setLabel('كم عنصر تبي تدمج؟').setStyle(TextInputStyle.Short).setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    await i.showModal(modal);
    try {
        const submit = await i.awaitModalSubmit({ time: 60000, filter: s => s.user.id === user.id });
        const qtyToSynth = parseInt(submit.fields.getTextInputValue('synth_qty'));
        if (isNaN(qtyToSynth) || qtyToSynth <= 0) return submit.reply({ content: '❌ رقم غير صالح.', flags: MessageFlags.Ephemeral });
        await handleSynthesis(submit, user, guildId, db, state, qtyToSynth, true);
    } catch(e) {}
}

async function handleSynthesis(i, user, guildId, db, state, qtyToSynth = 1, isModal = false) {
    if (!state.sacrificeItem || !state.targetItem) return;
    if (isModal) await i.deferUpdate().catch(()=>{});

    const totalFee = SYNTHESIS_FEE * qtyToSynth;
    const hasMora = await checkMora(db, user.id, guildId, totalFee);
    
    const synthReturnRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('forge_synthesis').setEmoji('↩️').setStyle(ButtonStyle.Secondary)
    );

    if (!hasMora) {
        const payload = { mora: 0, title: 'فرن الدمج السحري', hasError: true, errorMsg: `لا تملك ${totalFee} مورا للدمج!` };
        if (isModal) return await replyWithCanvas({ replied: false, deferred: false, editReply: async (p) => i.editReply(p) }, user, 'synthesis_error', payload, [synthReturnRow]);
        else return await replyWithCanvas(i, user, 'synthesis_error', payload, [synthReturnRow]);
    }

    const totalSacrifice = 4 * qtyToSynth;
    const hasItems = await checkItems(db, user.id, guildId, [{ id: state.sacrificeItem, count: totalSacrifice }]);
    
    if (!hasItems) {
        const payload = { mora: 0, title: 'فرن الدمج السحري', hasError: true, errorMsg: `لا تملك ${totalSacrifice} عناصر متشابهة!` };
        if (isModal) return await replyWithCanvas({ replied: false, deferred: false, editReply: async (p) => i.editReply(p) }, user, 'synthesis_error', payload, [synthReturnRow]);
        else return await replyWithCanvas(i, user, 'synthesis_error', payload, [synthReturnRow]);
    }

    await deductMora(db, user.id, guildId, totalFee);
    await deductItems(db, user.id, guildId, [{ id: state.sacrificeItem, count: totalSacrifice }]);

    const invRes = await safeQuery(db, `SELECT * FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guildId]);
    let targetRow = null;
    if (invRes.rows) {
        targetRow = invRes.rows.find(r => {
            const dbItemId = getSafeVal(r, 'itemid', '').toString().toLowerCase().trim();
            return dbItemId === String(state.targetItem).toLowerCase().trim();
        });
    }

    if (targetRow) {
        const rowId = getSafeVal(targetRow, 'id', null);
        try { await db.query(`UPDATE user_inventory SET "quantity" = "quantity" + $1 WHERE "id" = $2`, [qtyToSynth, rowId]); } 
        catch(e) { await db.query(`UPDATE user_inventory SET quantity = quantity + $1 WHERE id = $2`, [qtyToSynth, rowId]).catch(()=>{}); }
    } else {
        try { await db.query(`INSERT INTO user_inventory ("guildID", "userID", "itemID", "quantity") VALUES ($1, $2, $3, $4)`, [guildId, user.id, state.targetItem, qtyToSynth]); } 
        catch(e) { await db.query(`INSERT INTO user_inventory (guildid, userid, itemid, quantity) VALUES ($1, $2, $3, $4)`, [guildId, user.id, state.targetItem, qtyToSynth]).catch(()=>{}); }
    }
    
    const targetInfo = getItemInfo(state.targetItem);
    const payloadData = { title: 'فرن الدمج السحري', targetMatName: targetInfo.name, targetMatIcon: targetInfo.iconUrl, targetMatRarity: targetInfo.rarity, quantity: qtyToSynth };
    
    if (isModal) {
        await replyWithCanvas({ replied: false, deferred: false, editReply: async (p) => i.editReply(p) }, user, 'success_synthesis', payloadData, [synthReturnRow]);
        state.sacrificeItem = null; state.targetItem = null;
    } else {
        await replyWithCanvas(i, user, 'success_synthesis', payloadData, [synthReturnRow]);
    }
}

async function buildSmeltingUI(i, user, guildId, db, state, isInitial = false) {
    const [moraRes, invRes] = await Promise.all([
        safeQuery(db, `SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2`, [user.id, guildId]),
        safeQuery(db, `SELECT * FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guildId])
    ]);
    const userMora = Number(getSafeVal(moraRes?.rows?.[0], 'mora', 0)) + Number(getSafeVal(moraRes?.rows?.[0], 'bank', 0));
    const inventory = aggregateInventory(invRes?.rows || []);
    const smeltableItems = inventory.filter(row => getItemInfo(row.itemID) !== null);

    if (smeltableItems.length === 0) return await replyWithCanvas(i, user, 'smelting_home', { mora: userMora, title: 'محرقة التفكيك', hasError: true, errorMsg: 'لا تملك عناصر قابلة للصهر.' }, [getReturnRow()], isInitial);

    let payloadData = { mora: userMora, title: 'محرقة التفكيك' };
    let components = [];

    if (!state.item) {
        const smeltOptions = smeltableItems.map(row => {
            const info = getItemInfo(row.itemID);
            const xpGain = SMELT_XP_RATES[info.rarity] || 0;
            return { label: info.name.substring(0, 100), value: info.id.substring(0, 100), description: `المخزون: ${row.quantity} | يعطي: ${xpGain} XP` };
        }).slice(0, 25);
        components.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('forge_smelt_select').setPlaceholder('اختر العنصر الذي تريد صهره...').addOptions(smeltOptions)));
    } else {
        const itemInfo = getItemInfo(state.item);
        if(!itemInfo) { state.item = null; return buildSmeltingUI(i, user, guildId, db, state, isInitial); }

        payloadData.sacMatName = itemInfo.name; payloadData.reqMatIcon = itemInfo.iconUrl; payloadData.xpGain = SMELT_XP_RATES[itemInfo.rarity] || 10;
        const rowData = smeltableItems.find(r => String(r.itemID).toLowerCase() === String(state.item).toLowerCase());
        const itemQty = rowData ? rowData.quantity : 0;
        const actionRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('forge_execute_smelt_1').setLabel(`صـهـر`).setStyle(ButtonStyle.Danger));
        if (itemQty > 1) actionRow.addComponents(new ButtonBuilder().setCustomId(`forge_smelt_multi_${state.item}`).setLabel(`صـهـر متعـدد`).setStyle(ButtonStyle.Primary));
        components.push(actionRow);
    }
    components.push(getReturnRow());
    return await replyWithCanvas(i, user, 'smelting', payloadData, components, isInitial);
}

async function handleSmeltingMultiModal(i, user, guildId, db, state, client) {
    const itemId = i.customId.replace('forge_smelt_multi_', '');
    const modal = new ModalBuilder().setCustomId(`modal_smelt_${itemId}`).setTitle('محرقة التفكيك - صهر متعدد');
    const input = new TextInputBuilder().setCustomId('smelt_qty').setLabel('كم حبة تبي تصهر؟').setStyle(TextInputStyle.Short).setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    await i.showModal(modal);
    try {
        const submit = await i.awaitModalSubmit({ time: 60000, filter: s => s.user.id === user.id });
        const qtyToSmelt = parseInt(submit.fields.getTextInputValue('smelt_qty'));
        if (isNaN(qtyToSmelt) || qtyToSmelt <= 0) return submit.reply({ content: '❌ رقم غير صالح.', flags: MessageFlags.Ephemeral });
        await handleSmelting(submit, user, guildId, db, state, client, qtyToSmelt, true);
    } catch(e) {}
}

async function handleSmelting(i, user, guildId, db, state, client, qtyToSmelt = 1, isModal = false) {
    const itemIdToSmelt = state.item || (isModal ? i.customId.replace('modal_smelt_', '') : null);
    if (!itemIdToSmelt) return;
    if (isModal) await i.deferUpdate().catch(()=>{});

    const hasItems = await checkItems(db, user.id, guildId, [{ id: itemIdToSmelt, count: qtyToSmelt }]);
    if (!hasItems) {
        const payload = { mora: 0, title: 'محرقة التفكيك', hasError: true, errorMsg: `لا تملك ${qtyToSmelt} حبة للصهر.` };
        if (isModal) return await replyWithCanvas({ replied: false, deferred: false, editReply: async (p) => i.editReply(p) }, user, 'smelting_error', payload, [getReturnRow()]);
        else return await replyWithCanvas(i, user, 'smelting_error', payload, [getReturnRow()]);
    }

    await deductItems(db, user.id, guildId, [{ id: itemIdToSmelt, count: qtyToSmelt }]);

    const itemInfo = getItemInfo(itemIdToSmelt);
    const xpReward = (SMELT_XP_RATES[itemInfo.rarity] || 10) * qtyToSmelt;

    const memberObj = await i.guild?.members?.fetch(user.id).catch(()=>{});
    if (addXPAndCheckLevel && memberObj) await addXPAndCheckLevel(client, memberObj, db, xpReward, 0, false).catch(()=>{});
    else {
        try { await db.query(`UPDATE levels SET "xp" = "xp" + $1, "totalXP" = "totalXP" + $1 WHERE "user" = $2 AND "guild" = $3`, [xpReward, user.id, guildId]); }
        catch(e) { await db.query(`UPDATE levels SET xp = xp + $1, totalxp = totalxp + $1 WHERE userid = $2 AND guildid = $3`, [xpReward, user.id, guildId]).catch(()=>{}); }
    }
        
    const successData = { title: 'محرقة التفكيك', xpGain: xpReward, sacMatName: itemInfo.name, reqMatIcon: itemInfo.iconUrl };
    
    if (isModal) { 
        await replyWithCanvas({ replied: false, deferred: false, editReply: async (p) => i.editReply(p) }, user, 'success_smelting', successData, [getReturnRow()]); 
        state.item = null; 
    } else { 
        await replyWithCanvas(i, user, 'success_smelting', successData, [getReturnRow()]); 
    }
}

module.exports = {
    LEARN_FEE,
    safeQuery,
    getStandardRaceName,
    getUserRaceName,
    getMainMenuRows,
    buildMainUI,
    buildWeaponForgeUI,
    buildAcademyMenuUI,
    buildSkillUpgradeUI,
    buildSynthesisUI,
    buildSmeltingUI,
    handleWeaponBuy,
    handleWeaponUpgrade,
    handleSkillLearn,
    handleSkillUpgrade,
    handleSynthesis,
    handleSynthesisMultiModal,
    handleSmeltingMultiModal,
    handleSmelting
};
