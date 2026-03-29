const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, Colors, AttachmentBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const weaponsConfig = require('../../json/weapons-config.json');
const skillsConfig = require('../../json/skills-config.json');
const upgradeMats = require('../../json/upgrade-materials.json');

let generateForgeUI;
try {
    ({ generateForgeUI } = require('../../generators/forge-generator.js'));
} catch (e) {
    generateForgeUI = null;
}

let addXPAndCheckLevel;
try { ({ addXPAndCheckLevel } = require('../handler-utils.js')); } 
catch (e) { try { ({ addXPAndCheckLevel } = require('./handler-utils.js')); } catch (e2) {} }

const R2_URL = 'https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev';
const SMELT_XP_RATES = { 'Common': 10, 'Uncommon': 20, 'Rare': 30, 'Epic': 100, 'Legendary': 1000 };
const SYNTHESIS_FEE = 999;

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

const RARITY_ARABIC = { 'Common': 'شائع', 'Uncommon': 'شائع', 'Rare': 'نادر', 'Epic': 'ملحمي', 'Legendary': 'أسطوري' };

function translateRarity(rarity) { return RARITY_ARABIC[rarity] || rarity; }

function resolveText(val) {
    if (val == null) return '';
    if (typeof val === 'object') return val.ar || val.en || val.name || JSON.stringify(val);
    return String(val);
}

const safeQuery = async (db, qPg, qLite, params) => {
    try { return await db.query(qPg, params); } 
    catch(e) { return await db.query(qLite, params).catch(()=>({rows:[]})); }
};

// 🔥 دالة حساب الضرر للعرض في الكانفاس (نفس دالة المعارك لضمان التطابق) 🔥
function getWeaponDisplayDamage(weaponConfig, level) {
    if (!weaponConfig || level < 1) return 15;
    const base = weaponConfig.base_damage;
    const inc = weaponConfig.damage_increment;

    if (level <= 15) {
        return Math.floor(base + (inc * (level - 1)));
    } else {
        const damageAt15 = base + (inc * 14);
        const targetDamageAt30 = 800;
        const levelsRemaining = 15; 
        const dynamicIncrement = (targetDamageAt30 - damageAt15) / levelsRemaining;
        let finalDamage = damageAt15 + (dynamicIncrement * (level - 15));
        if (level >= 30) return targetDamageAt30;
        return Math.floor(finalDamage);
    }
}

// 🔥 دالة حساب قوة المهارات للعرض في الكانفاس 🔥
function getSkillDisplayValue(skillConfig, currentLevel) {
    if (!skillConfig) return 0;
    const level = Math.max(1, currentLevel || 1);
    const base = skillConfig.base_value;
    const inc = skillConfig.value_increment;
    const isPercentage = skillConfig.stat_type === '%' || skillConfig.id.includes('heal') || skillConfig.id.includes('shield');

    if (level <= 15) {
        return base + (inc * (level - 1));
    } else {
        const valueAt15 = base + (inc * 14);
        const targetValueAt30 = isPercentage ? 50 : 200; 
        const levelsRemaining = 15;
        const dynamicIncrement = (targetValueAt30 - valueAt15) / levelsRemaining;
        let finalValue = valueAt15 + (dynamicIncrement * (level - 15));
        if (level >= 30) return targetValueAt30;
        return Math.floor(finalValue);
    }
}

function getUpgradeRequirements(currentLevel, isSkill = false) {
    if (currentLevel >= 30) return null;
    let reqs = [], moraCost = 0;
    const currentTier = Math.floor((currentLevel - 1) / 5); 
    const primaryTier = Math.min(currentTier, 4);

    moraCost = currentLevel * 1500 * (primaryTier + 1);

    if (primaryTier === 0) {
        reqs.push({ tier: 0, count: Math.floor(currentLevel * 1.5) + 2 });
    } else {
        const prevTier = primaryTier - 1;
        reqs.push({ tier: prevTier, count: Math.floor(currentLevel * 2.5) + 5 });
        reqs.push({ tier: primaryTier, count: Math.floor(currentLevel * 1.2) + 2 });
    }

    let finalReqs = [];
    for (let r of reqs) {
        if (!isSkill) finalReqs.push({ type: 'material', tier: r.tier, count: r.count });
        else {
            finalReqs.push({ type: 'book', tier: r.tier, count: r.count });
            finalReqs.push({ type: 'material', tier: r.tier, count: Math.max(1, Math.floor(r.count * 0.6)) });
        }
    }
    return { moraCost, materials: finalReqs };
}

function getItemInfo(itemId) {
    if(!itemId) return null;
    for (const r of upgradeMats.weapon_materials) {
        const mat = r.materials.find(m => m.id === itemId);
        if (mat) {
            const raceFolder = r.race.toLowerCase().replace(' ', '_');
            const imgName = ID_TO_IMAGE[mat.id] || `${mat.id}.png`;
            return { ...mat, type: 'material', race: r.race, name: resolveText(mat.name), iconUrl: `${R2_URL}/images/materials/${raceFolder}/${imgName}`, rarity: mat.rarity };
        }
    }
    for (const c of upgradeMats.skill_books) {
        const book = c.books.find(b => b.id === itemId);
        if (book) {
            const typeFolder = c.category === 'General_Skills' ? 'general' : 'race';
            const imgName = ID_TO_IMAGE[book.id] || `${book.id}.png`;
            return { ...book, type: 'book', name: resolveText(book.name), iconUrl: `${R2_URL}/images/materials/${typeFolder}/${imgName}`, rarity: book.rarity };
        }
    }
    return null;
}

function aggregateInventory(rows) {
    const map = {};
    for (const r of rows) {
        const id = r.itemID || r.itemid;
        const qty = Number(r.quantity || r.Quantity);
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

async function replyWithCanvas(i, user, view, data, components, isInitial = false) {
    let returnMessage = null;
    try {
        if (generateForgeUI) {
            const buffer = await generateForgeUI(user, view, data);
            if (buffer) {
                const filename = `forge_${Date.now()}.png`; 
                const attachment = new AttachmentBuilder(buffer, { name: filename });
                
                if (typeof i.editReply === 'function') {
                    returnMessage = await i.editReply({ content: null, embeds: [], components, files: [attachment] }).catch(()=>{});
                } else if (typeof i.reply === 'function') {
                    returnMessage = await i.reply({ content: null, embeds: [], components, files: [attachment], fetchReply: true }).catch(()=>{});
                }
                return returnMessage || i; 
            }
        }
    } catch (e) {
        console.error("Canvas Error in Forge:", e);
    }
    return i;
}

async function buildMainUI(i, user, guildId, db, isInitial = false) {
    let userDataRes = await safeQuery(db, `SELECT "mora" FROM levels WHERE "user" = $1 AND "guild" = $2`, `SELECT mora FROM levels WHERE userid = $1 AND guildid = $2`, [user.id, guildId]);
    const userMora = Number(userDataRes?.rows?.[0]?.mora || userDataRes?.rows?.[0]?.Mora || 0);
    return await replyWithCanvas(i, user, 'main', { mora: userMora, title: 'المجمع الإمبراطوري للتطوير' }, getMainMenuRows(), isInitial);
}

module.exports = {
    data: new SlashCommandBuilder().setName('حدادة').setDescription('الدخول إلى المجمع الإمبراطوري لتطوير الأسلحة وصقل المهارات'),
    name: 'حدادة',
    aliases: ['forge', 'تطوير', 'صقل', 'دمج', 'صهر', 'حداده', 'أكاديمية', 'اكاديمية'],
    category: 'Economy',
    
    async execute(interactionOrMessage) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        const client = interactionOrMessage.client;
        const db = client.sql;
        
        let user = null;
        if (isSlash) user = interactionOrMessage.user;
        else if (interactionOrMessage.author) user = interactionOrMessage.author;
        else if (interactionOrMessage.user) user = interactionOrMessage.user;
        
        const guildId = interactionOrMessage.guild?.id || interactionOrMessage.guildId;

        let sentMsg = null;
        if (isSlash && !interactionOrMessage.preselectedItem) {
            await interactionOrMessage.deferReply().catch(()=>{});
        } else if (!isSlash && !interactionOrMessage.preselectedItem && interactionOrMessage.channel) {
            interactionOrMessage.channel.sendTyping().catch(()=>{});
        }

        const fakeInteraction = isSlash ? interactionOrMessage : {
            replied: interactionOrMessage.preselectedItem ? true : false, 
            deferred: interactionOrMessage.preselectedItem ? true : false,
            reply: async (p) => { 
                if (interactionOrMessage.reply && typeof interactionOrMessage.reply === 'function') {
                    return await interactionOrMessage.reply(p).catch(()=>{});
                } else {
                    p.fetchReply = true; 
                    sentMsg = await interactionOrMessage.channel?.send(p).catch(()=>{}); 
                    return sentMsg; 
                }
            },
            editReply: async (p) => { 
                if (interactionOrMessage.editReply && typeof interactionOrMessage.editReply === 'function') {
                    return await interactionOrMessage.editReply(p).catch(()=>{});
                } else if (sentMsg) {
                    return await sentMsg.edit(p).catch(()=>{}); 
                } else {
                    return await interactionOrMessage.channel?.send(p).catch(()=>{}); 
                }
            },
            followUp: async (p) => interactionOrMessage.channel?.send(p).catch(()=>{})
        };

        let commandTrigger = "";
        if (!isSlash && interactionOrMessage.content) {
            commandTrigger = interactionOrMessage.content.trim().split(/ +/)[0].toLowerCase().replace(/^[^\w\s\u0600-\u06FF]/, ''); 
        } else if (isSlash) {
            commandTrigger = interactionOrMessage.commandName;
        }

        let synthesisState = { sacrificeItem: null, targetItem: null };
        let smeltState = { item: null };

        if (interactionOrMessage.preselectedItem) {
            if (interactionOrMessage.preselectedAction === 'smelt') {
                smeltState.item = interactionOrMessage.preselectedItem;
                commandTrigger = 'صهر';
            } else if (interactionOrMessage.preselectedAction === 'synth') {
                synthesisState.sacrificeItem = interactionOrMessage.preselectedItem;
                commandTrigger = 'دمج';
            }
        }

        let userDataRes = await safeQuery(db, `SELECT "level" FROM levels WHERE "user" = $1 AND "guild" = $2`, `SELECT level FROM levels WHERE userid = $1 AND guildid = $2`, [user.id, guildId]);
        if (!userDataRes?.rows?.[0]) return fakeInteraction.editReply({ content: "❌ لم يتم العثور على بياناتك." }).catch(()=>{});

        let replyObj;

        if (commandTrigger.includes('صقل') || commandTrigger.includes('اكاديمية') || commandTrigger === 'ms') {
            replyObj = await buildAcademyMenuUI(fakeInteraction, user, guildId, db, !isSlash && !interactionOrMessage.preselectedItem);
        } else if (commandTrigger.includes('دمج')) {
            replyObj = await buildSynthesisUI(fakeInteraction, user, guildId, db, synthesisState, !isSlash && !interactionOrMessage.preselectedItem);
        } else if (commandTrigger.includes('صهر')) {
            replyObj = await buildSmeltingUI(fakeInteraction, user, guildId, db, smeltState, !isSlash && !interactionOrMessage.preselectedItem);
        } else {
            replyObj = await buildMainUI(fakeInteraction, user, guildId, db, !isSlash && !interactionOrMessage.preselectedItem);
        }

        if (isSlash && !replyObj?.createMessageComponentCollector) {
            replyObj = await interactionOrMessage.fetchReply().catch(()=>{});
        }
        
        if (!replyObj || !replyObj.createMessageComponentCollector) return;

        const filter = i => i.user.id === user.id && i.customId.startsWith('forge_');
        const collector = replyObj.createMessageComponentCollector({ filter, time: 300000 });

        collector.on('collect', async (i) => {
            try { if (!i.customId.startsWith('forge_smelt_multi_') && !i.deferred && !i.replied) await i.deferUpdate(); } catch(e) {}

            try {
                if (i.customId === 'forge_return_main') {
                    synthesisState = { sacrificeItem: null, targetItem: null };
                    smeltState = { item: null };
                    await buildMainUI(i, user, guildId, db, false);
                }
                else if (i.isStringSelectMenu()) {
                    if (i.customId === 'forge_skill_select') await buildSkillUpgradeUI(i, user, guildId, db, i.values[0]);
                    else if (i.customId === 'forge_synth_sacrifice') {
                        synthesisState.sacrificeItem = i.values[0];
                        synthesisState.targetItem = null; 
                        await buildSynthesisUI(i, user, guildId, db, synthesisState);
                    }
                    else if (i.customId === 'forge_synth_target') {
                        synthesisState.targetItem = i.values[0];
                        await buildSynthesisUI(i, user, guildId, db, synthesisState);
                    }
                    else if (i.customId === 'forge_smelt_select') {
                        smeltState.item = i.values[0];
                        await buildSmeltingUI(i, user, guildId, db, smeltState);
                    }
                }
                else if (i.isButton()) {
                    if (i.customId === 'forge_weapon') await buildWeaponForgeUI(i, user, guildId, db);
                    else if (i.customId === 'forge_skill_menu') await buildAcademyMenuUI(i, user, guildId, db);
                    else if (i.customId === 'forge_synthesis') { 
                        synthesisState = { sacrificeItem: null, targetItem: null }; 
                        await buildSynthesisUI(i, user, guildId, db, synthesisState); 
                    }
                    else if (i.customId === 'forge_smelting') { 
                        smeltState = { item: null }; 
                        await buildSmeltingUI(i, user, guildId, db, smeltState); 
                    }
                    else if (i.customId === 'forge_upgrade_weapon') await handleWeaponUpgrade(i, user, guildId, db);
                    else if (i.customId.startsWith('forge_upgrade_skill_')) await handleSkillUpgrade(i, user, guildId, db, i.customId.replace('forge_upgrade_skill_', ''));
                    else if (i.customId === 'forge_execute_synth') {
                        await handleSynthesis(i, user, guildId, db, synthesisState);
                        synthesisState = { sacrificeItem: null, targetItem: null };
                    }
                    else if (i.customId === 'forge_execute_smelt_1') {
                        await handleSmelting(i, user, guildId, db, smeltState, client, 1);
                        smeltState = { item: null };
                    }
                    else if (i.customId.startsWith('forge_smelt_multi_')) {
                        await handleSmeltingMultiModal(i, user, guildId, db, smeltState, client);
                    }
                }
            } catch (innerError) {
                console.error("Collector Action Error:", innerError);
            }
        });

        collector.on('end', () => {
            try { 
                const disabledRows = getMainMenuRows();
                disabledRows.forEach(row => row.components.forEach(c => c.setDisabled(true))); 
                replyObj.edit({ components: disabledRows }).catch(()=>{}); 
            } catch(e) {}
        });
    }
};

// ------------------- السلاح -------------------
async function buildWeaponForgeUI(i, user, guildId, db) {
    const [userMoraRes, weaponRes, lvlRes] = await Promise.all([
        safeQuery(db, `SELECT "mora" FROM levels WHERE "user" = $1 AND "guild" = $2`, `SELECT mora FROM levels WHERE userid = $1 AND guildid = $2`, [user.id, guildId]),
        safeQuery(db, `SELECT "raceName", "weaponLevel" FROM user_weapons WHERE "userID" = $1 AND "guildID" = $2`, `SELECT racename, weaponlevel FROM user_weapons WHERE userid = $1 AND guildid = $2`, [user.id, guildId]),
        safeQuery(db, `SELECT "level" FROM levels WHERE "user" = $1 AND "guild" = $2`, `SELECT level FROM levels WHERE userid = $1 AND guildid = $2`, [user.id, guildId])
    ]);

    const userMora = userMoraRes?.rows?.[0] ? Number(userMoraRes.rows[0].mora) : 0;
    const wData = weaponRes?.rows?.[0];
    
    if (!wData) {
        return await replyWithCanvas(i, user, 'weapon_error', { mora: userMora, title: 'الحدادة', hasError: true, errorMsg: 'أنت لا تملك أي سلاح! احصل على رتبة عرق أولاً.' }, [getReturnRow()]);
    }

    const currentLevel = Number(wData.weaponLevel || wData.weaponlevel);
    const weaponConfig = weaponsConfig.find(w => w.race === (wData.raceName || wData.racename));
    
    if (currentLevel >= 30) {
        return await replyWithCanvas(i, user, 'weapon_error', { mora: userMora, title: `تطوير ${resolveText(weaponConfig.name)}`, hasError: true, errorMsg: '✨ سلاحك وصل للحد الأقصى (Lv.30)!' }, [getReturnRow()]);
    }

    const playerServerLevel = Number(lvlRes?.rows?.[0]?.level || lvlRes?.rows?.[0]?.Level || 1);
    if (currentLevel >= 15 && playerServerLevel < 30) {
        return await replyWithCanvas(i, user, 'weapon_error', { mora: userMora, title: `تطوير ${resolveText(weaponConfig.name)}`, hasError: true, errorMsg: 'قفل المستوى: يجب أن تصل إلى المستوى 30 في السيرفر لتتمكن من تطوير عتادك فوق المستوى 15.' }, [getReturnRow()]);
    }

    const reqs = getUpgradeRequirements(currentLevel, false);
    const raceMats = upgradeMats.weapon_materials.find(m => m.race === (wData.raceName || wData.racename));
    
    const matPromises = reqs.materials.map(async (r) => {
        let matId = raceMats.materials[r.tier].id;
        let invRes = await safeQuery(db, `SELECT "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, `SELECT quantity FROM user_inventory WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [user.id, guildId, matId]);
        const userMatCount = invRes?.rows?.[0] ? Number(invRes.rows[0].quantity || invRes.rows[0].Quantity) : 0;
        let matInfo = getItemInfo(matId);
        
        return { 
            id: matId, count: r.count, userCount: userMatCount,
            name: matInfo.name, rarity: matInfo.rarity, iconUrl: matInfo.iconUrl
        };
    });

    const detailedReqs = await Promise.all(matPromises);
    const hasAllMats = detailedReqs.every(r => r.userCount >= r.count);
    const canUpgrade = userMora >= reqs.moraCost && hasAllMats;

    // 🔥 استخدام الدالة الجديدة لعرض الضرر المتوازن بدلاً من المعادلة الخطية 🔥
    const currentDmg = getWeaponDisplayDamage(weaponConfig, currentLevel);
    const nextDmg = getWeaponDisplayDamage(weaponConfig, currentLevel + 1);

    const btnRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`forge_upgrade_weapon`).setLabel('تـطـويـر السـلاح').setStyle(canUpgrade ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(!canUpgrade),
        getReturnRow().components[0]
    );
    
    return await replyWithCanvas(i, user, 'weapon', {
        mora: userMora, title: `تطوير ${resolveText(weaponConfig.name)}`,
        currentLevel, nextLevel: currentLevel + 1,
        currentStat: `${currentDmg} DMG`, nextStat: `${nextDmg} DMG`,
        reqMora: reqs.moraCost, detailedReqs: detailedReqs 
    }, [btnRow], []);
}

async function handleWeaponUpgrade(i, user, guildId, db) {
    const [weaponRes, lvlRes] = await Promise.all([
        safeQuery(db, `SELECT "raceName", "weaponLevel" FROM user_weapons WHERE "userID" = $1 AND "guildID" = $2`, `SELECT racename, weaponlevel FROM user_weapons WHERE userid = $1 AND guildid = $2`, [user.id, guildId]),
        safeQuery(db, `SELECT "level" FROM levels WHERE "user" = $1 AND "guild" = $2`, `SELECT level FROM levels WHERE userid = $1 AND guildid = $2`, [user.id, guildId])
    ]);

    const wData = weaponRes?.rows?.[0];
    const currentLevel = Number(wData.weaponLevel || wData.weaponlevel);
    const playerServerLevel = Number(lvlRes?.rows?.[0]?.level || lvlRes?.rows?.[0]?.Level || 1);
    
    if (currentLevel >= 15 && playerServerLevel < 30) return; 

    const reqs = getUpgradeRequirements(currentLevel, false);
    const weaponConfig = weaponsConfig.find(w => w.race === (wData.raceName || wData.racename));
    const raceMats = upgradeMats.weapon_materials.find(m => m.race === (wData.raceName || wData.racename));

    let detailedReqs = reqs.materials.map(r => ({ id: raceMats.materials[r.tier].id, count: r.count }));

    await db.query('BEGIN').catch(()=>{}); 
    try {
        await db.query(`UPDATE levels SET "mora" = GREATEST(CAST("mora" AS INTEGER) - $1, 0) WHERE "user" = $2 AND "guild" = $3`, [reqs.moraCost, user.id, guildId]).catch(()=> db.query(`UPDATE levels SET mora = MAX(CAST(mora AS INTEGER) - $1, 0) WHERE userid = $2 AND guildid = $3`, [reqs.moraCost, user.id, guildId]));
        
        for (let r of detailedReqs) {
            await db.query(`UPDATE user_inventory SET "quantity" = GREATEST(CAST("quantity" AS INTEGER) - $1, 0) WHERE "userID" = $2 AND "guildID" = $3 AND "itemID" = $4`, [r.count, user.id, guildId, r.id]).catch(()=> db.query(`UPDATE user_inventory SET quantity = MAX(CAST(quantity AS INTEGER) - $1, 0) WHERE userid = $2 AND guildid = $3 AND itemid = $4`, [r.count, user.id, guildId, r.id]));
        }
        
        await db.query(`DELETE FROM user_inventory WHERE "quantity" <= 0 AND "userID" = $1`, [user.id]).catch(()=> db.query(`DELETE FROM user_inventory WHERE quantity <= 0 AND userid = $1`, [user.id]));
        await db.query(`UPDATE user_weapons SET "weaponLevel" = "weaponLevel" + 1 WHERE "userID" = $1 AND "guildID" = $2 AND "raceName" = $3`, [user.id, guildId, wData.raceName || wData.racename]).catch(()=> db.query(`UPDATE user_weapons SET weaponlevel = weaponlevel + 1 WHERE userid = $1 AND guildid = $2 AND racename = $3`, [user.id, guildId, wData.raceName || wData.racename]));
        await db.query('COMMIT').catch(()=>{}); 
        
        const nextLevel = currentLevel + 1;
        // 🔥 استخدام الدالة الجديدة هنا أيضاً 🔥
        const nextStat = `${getWeaponDisplayDamage(weaponConfig, nextLevel)} DMG`;

        await replyWithCanvas(i, user, 'success_weapon', {
            title: `تطوير ${resolveText(weaponConfig.name)}`,
            currentLevel: currentLevel,
            nextLevel: nextLevel,
            nextStat: nextStat
        }, [getReturnRow()], []);
    } catch (err) {
        await db.query('ROLLBACK').catch(()=>{});
        let userMoraRes = await safeQuery(db, `SELECT "mora" FROM levels WHERE "user" = $1 AND "guild" = $2`, `SELECT mora FROM levels WHERE userid = $1 AND guildid = $2`, [user.id, guildId]);
        const userMora = userMoraRes?.rows?.[0] ? Number(userMoraRes.rows[0].mora) : 0;
        await replyWithCanvas(i, user, 'weapon_error', { mora: userMora, title: 'الحدادة', hasError: true, errorMsg: 'حدث خطأ أثناء الحفظ!' }, [getReturnRow()]);
    }
}

// ------------------- المهارات -------------------
async function buildAcademyMenuUI(i, user, guildId, db, isInitial = false) {
    const [userMoraRes, skillsRes] = await Promise.all([
        safeQuery(db, `SELECT "mora" FROM levels WHERE "user" = $1 AND "guild" = $2`, `SELECT mora FROM levels WHERE userid = $1 AND guildid = $2`, [user.id, guildId]),
        safeQuery(db, `SELECT * FROM user_skills WHERE "userID" = $1 AND "guildID" = $2`, `SELECT * FROM user_skills WHERE userid = $1 AND guildid = $2`, [user.id, guildId])
    ]);

    const userMora = userMoraRes?.rows?.[0] ? Number(userMoraRes.rows[0].mora) : 0;
    const userSkills = skillsRes?.rows || [];

    if (userSkills.length === 0) {
        return await replyWithCanvas(i, user, 'skill_home', { mora: userMora, title: 'أكاديمية السحر', hasError: true, errorMsg: 'أنت لا تملك أي مهارات لتصقلها!' }, [getReturnRow()], [], isInitial);
    }

    const skillOptions = userSkills.map(s => {
        const configSkill = skillsConfig.find(sc => sc.id === (s.skillID || s.skillid));
        if (!configSkill) return null;
        return { label: resolveText(configSkill.name).substring(0, 100), value: configSkill.id.substring(0, 100), description: `Lv.${s.skillLevel || s.skilllevel}`.substring(0, 100) };
    }).filter(Boolean);

    if(skillOptions.length === 0) {
        return await replyWithCanvas(i, user, 'skill_home', { mora: userMora, title: 'أكاديمية السحر', hasError: true, errorMsg: 'لا يمكن جلب بيانات المهارات حالياً.' }, [getReturnRow()], [], isInitial);
    }

    const skillSelectRow = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('forge_skill_select').setPlaceholder('اختر المهارة...').addOptions(skillOptions.slice(0, 25)));
    return await replyWithCanvas(i, user, 'skill_home', { mora: userMora, title: 'أكاديمية السحر' }, [skillSelectRow, getReturnRow()], [], isInitial);
}

async function buildSkillUpgradeUI(i, user, guildId, db, skillId) {
    const [userMoraRes, skillRes, lvlRes, wRes] = await Promise.all([
        safeQuery(db, `SELECT "mora" FROM levels WHERE "user" = $1 AND "guild" = $2`, `SELECT mora FROM levels WHERE userid = $1 AND guildid = $2`, [user.id, guildId]),
        safeQuery(db, `SELECT * FROM user_skills WHERE "userID" = $1 AND "guildID" = $2 AND "skillID" = $3`, `SELECT * FROM user_skills WHERE userid = $1 AND guildid = $2 AND skillid = $3`, [user.id, guildId, skillId]),
        safeQuery(db, `SELECT "level" FROM levels WHERE "user" = $1 AND "guild" = $2`, `SELECT level FROM levels WHERE userid = $1 AND guildid = $2`, [user.id, guildId]),
        safeQuery(db, `SELECT "raceName" FROM user_weapons WHERE "userID" = $1 AND "guildID" = $2`, `SELECT racename FROM user_weapons WHERE userid = $1 AND guildid = $2`, [user.id, guildId])
    ]);

    const userMora = userMoraRes?.rows?.[0] ? Number(userMoraRes.rows[0].mora) : 0;
    const sData = skillRes?.rows?.[0];
    const currentLevel = Number(sData.skillLevel || sData.skilllevel);
    const configSkill = skillsConfig.find(sc => sc.id === skillId);
    
    if (currentLevel >= (configSkill.max_level || 30)) {
        return await replyWithCanvas(i, user, 'skill_error', { mora: userMora, title: `صقل ${resolveText(configSkill.name)}`, hasError: true, errorMsg: '✨ المهارة وصلت للحد الأقصى!' }, [getReturnRow()]);
    }

    const playerServerLevel = Number(lvlRes?.rows?.[0]?.level || lvlRes?.rows?.[0]?.Level || 1);
    if (currentLevel >= 15 && playerServerLevel < 30) {
        return await replyWithCanvas(i, user, 'skill_error', { mora: userMora, title: `صقل ${resolveText(configSkill.name)}`, hasError: true, errorMsg: 'قفل المستوى: يجب أن تصل إلى المستوى 30 في السيرفر لتتمكن من صقل المهارات فوق المستوى 15.' }, [getReturnRow()]);
    }

    const reqs = getUpgradeRequirements(currentLevel, true);
    const categoryName = skillId.startsWith('race_') ? 'Race_Skills' : 'General_Skills';
    const bookCat = upgradeMats.skill_books.find(c => c.category === categoryName);
    
    const userRace = wRes?.rows?.[0]?.raceName || wRes?.rows?.[0]?.racename;
    const raceMats = upgradeMats.weapon_materials.find(m => m.race === userRace);

    const matPromises = reqs.materials.map(async (r) => {
        let itemId = r.type === 'book' ? bookCat.books[r.tier].id : raceMats.materials[r.tier].id;
        let invRes = await safeQuery(db, `SELECT "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, `SELECT quantity FROM user_inventory WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [user.id, guildId, itemId]);
        const userMatCount = invRes?.rows?.[0] ? Number(invRes.rows[0].quantity || invRes.rows[0].Quantity) : 0;
        let matInfo = getItemInfo(itemId);
        
        return { 
            id: itemId, count: r.count, userCount: userMatCount,
            name: matInfo.name, rarity: matInfo.rarity, iconUrl: matInfo.iconUrl
        };
    });

    const detailedReqs = await Promise.all(matPromises);
    const hasAllMats = detailedReqs.every(r => r.userCount >= r.count);
    const canUpgrade = userMora >= reqs.moraCost && hasAllMats;

    const statSymbol = configSkill.stat_type === '%' ? '%' : '';
    // 🔥 استخدام الدالة الجديدة لقوة المهارة 🔥
    const currentVal = getSkillDisplayValue(configSkill, currentLevel);
    const nextVal = getSkillDisplayValue(configSkill, currentLevel + 1);

    const btnRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`forge_upgrade_skill_${skillId}`).setLabel('صقل المهارة 📜').setStyle(canUpgrade ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(!canUpgrade),
        getReturnRow().components[0]
    );
    
    await replyWithCanvas(i, user, 'skill', {
        mora: userMora, title: `صقل ${resolveText(configSkill.name)}`,
        currentLevel, nextLevel: currentLevel + 1,
        currentStat: `${currentVal}${statSymbol}`, nextStat: `${nextVal}${statSymbol}`,
        reqMora: reqs.moraCost, detailedReqs: detailedReqs
    }, [btnRow], []);
}

async function handleSkillUpgrade(i, user, guildId, db, skillId) {
    const [skillRes, lvlRes, wRes] = await Promise.all([
        safeQuery(db, `SELECT * FROM user_skills WHERE "userID" = $1 AND "guildID" = $2 AND "skillID" = $3`, `SELECT * FROM user_skills WHERE userid = $1 AND guildid = $2 AND skillid = $3`, [user.id, guildId, skillId]),
        safeQuery(db, `SELECT "level" FROM levels WHERE "user" = $1 AND "guild" = $2`, `SELECT level FROM levels WHERE userid = $1 AND guildid = $2`, [user.id, guildId]),
        safeQuery(db, `SELECT "raceName" FROM user_weapons WHERE "userID" = $1 AND "guildID" = $2`, `SELECT racename FROM user_weapons WHERE userid = $1 AND guildid = $2`, [user.id, guildId])
    ]);

    const currentLevel = Number(skillRes.rows[0].skillLevel || skillRes.rows[0].skilllevel);
    const playerServerLevel = Number(lvlRes?.rows?.[0]?.level || lvlRes?.rows?.[0]?.Level || 1);
    if (currentLevel >= 15 && playerServerLevel < 30) return; 

    const reqs = getUpgradeRequirements(currentLevel, true);
    const categoryName = skillId.startsWith('race_') ? 'Race_Skills' : 'General_Skills';
    const configSkill = skillsConfig.find(sc => sc.id === skillId);
    const bookCat = upgradeMats.skill_books.find(c => c.category === categoryName);
    
    const userRace = wRes?.rows?.[0]?.raceName || wRes?.rows?.[0]?.racename;
    const raceMats = upgradeMats.weapon_materials.find(m => m.race === userRace);

    let detailedReqs = [];
    for (let r of reqs.materials) {
        let itemId = r.type === 'book' ? bookCat.books[r.tier].id : raceMats.materials[r.tier].id;
        detailedReqs.push({ id: itemId, count: r.count });
    }

    await db.query('BEGIN').catch(()=>{}); 
    try {
        await db.query(`UPDATE levels SET "mora" = GREATEST(CAST("mora" AS INTEGER) - $1, 0) WHERE "user" = $2 AND "guild" = $3`, [reqs.moraCost, user.id, guildId]).catch(()=> db.query(`UPDATE levels SET mora = MAX(CAST(mora AS INTEGER) - $1, 0) WHERE userid = $2 AND guildid = $3`, [reqs.moraCost, user.id, guildId]));
        
        for (let r of detailedReqs) {
            await db.query(`UPDATE user_inventory SET "quantity" = GREATEST(CAST("quantity" AS INTEGER) - $1, 0) WHERE "userID" = $2 AND "guildID" = $3 AND "itemID" = $4`, [r.count, user.id, guildId, r.id]).catch(()=> db.query(`UPDATE user_inventory SET quantity = MAX(CAST(quantity AS INTEGER) - $1, 0) WHERE userid = $2 AND guildid = $3 AND itemid = $4`, [r.count, user.id, guildId, r.id]));
        }

        await db.query(`DELETE FROM user_inventory WHERE "quantity" <= 0 AND "userID" = $1`, [user.id]).catch(()=> db.query(`DELETE FROM user_inventory WHERE quantity <= 0 AND userid = $1`, [user.id]));
        await db.query(`UPDATE user_skills SET "skillLevel" = "skillLevel" + 1 WHERE "userID" = $1 AND "guildID" = $2 AND "skillID" = $3`, [user.id, guildId, skillId]).catch(()=> db.query(`UPDATE user_skills SET skilllevel = skilllevel + 1 WHERE userid = $1 AND guildid = $2 AND skillid = $3`, [user.id, guildId, skillId]));
        await db.query('COMMIT').catch(()=>{}); 
        
        const nextLevel = currentLevel + 1;
        const statSymbol = configSkill.stat_type === '%' ? '%' : '';
        // 🔥 استخدام الدالة الجديدة هنا أيضاً 🔥
        const nextStat = `${getSkillDisplayValue(configSkill, nextLevel)}${statSymbol}`;

        await replyWithCanvas(i, user, 'success_skill', {
            title: `صقل ${resolveText(configSkill.name)}`,
            currentLevel: currentLevel,
            nextLevel: nextLevel,
            nextStat: nextStat
        }, [getReturnRow()], []);
    } catch (err) {
        await db.query('ROLLBACK').catch(()=>{});
        let userMoraRes = await safeQuery(db, `SELECT "mora" FROM levels WHERE "user" = $1 AND "guild" = $2`, `SELECT mora FROM levels WHERE userid = $1 AND guildid = $2`, [user.id, guildId]);
        const userMora = userMoraRes?.rows?.[0] ? Number(userMoraRes.rows[0].mora) : 0;
        await replyWithCanvas(i, user, 'skill_error', { mora: userMora, title: 'أكاديمية السحر', hasError: true, errorMsg: 'حدث خطأ أثناء الحفظ!' }, [getReturnRow()]);
    }
}

// ------------------- الدمج (Synthesis) -------------------
async function buildSynthesisUI(i, user, guildId, db, state, isInitial = false) {
    const [moraRes, invRes, wRes] = await Promise.all([
        safeQuery(db, `SELECT "mora" FROM levels WHERE "user" = $1 AND "guild" = $2`, `SELECT mora FROM levels WHERE userid = $1 AND guildid = $2`, [user.id, guildId]),
        safeQuery(db, `SELECT "itemID", "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2`, `SELECT itemid, quantity FROM user_inventory WHERE userid = $1 AND guildid = $2`, [user.id, guildId]),
        safeQuery(db, `SELECT "raceName" FROM user_weapons WHERE "userID" = $1 AND "guildID" = $2`, `SELECT racename FROM user_weapons WHERE userid = $1 AND guildid = $2`, [user.id, guildId])
    ]);

    const userMora = moraRes?.rows?.[0] ? Number(moraRes.rows[0].mora || moraRes.rows[0].Mora) : 0;
    const inventory = aggregateInventory(invRes?.rows || []);
    const userRace = wRes?.rows?.[0]?.raceName || wRes?.rows?.[0]?.racename;

    const availableSacrifices = inventory.filter(row => {
        if (row.quantity < 4) return false;
        const info = getItemInfo(row.itemID);
        if (!info) return false;
        if (info.type === 'material' && info.race !== userRace) return false;
        return true;
    });

    if (availableSacrifices.length === 0) {
        return await replyWithCanvas(i, user, 'synthesis_home', { mora: userMora, title: 'فرن الدمج الكيميائي', hasError: true, errorMsg: 'لا تملك 4 عناصر متشابهة من مواد عرقك أو مخطوطات السحر لدمجها.' }, [getReturnRow()], [], isInitial);
    }

    let components = [];
    let payloadData = { mora: userMora, title: 'فرن الدمج السحري', fee: SYNTHESIS_FEE };

    if (!state.sacrificeItem) {
        const sacrificeOptions = availableSacrifices.map(row => {
            const info = getItemInfo(row.itemID);
            return { label: info.name.substring(0, 100), value: info.id.substring(0, 100), description: `الكمية: ${row.quantity} | الندرة: ${translateRarity(info.rarity)}`.substring(0, 100) };
        }).slice(0, 25);
        components.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('forge_synth_sacrifice').setPlaceholder('1. اختر العنصر الذي ستضحي به (سيخصم 4)').addOptions(sacrificeOptions)));
    } else {
        const sacInfo = getItemInfo(state.sacrificeItem);
        if(!sacInfo) { state.sacrificeItem = null; return buildSynthesisUI(i, user, guildId, db, state, isInitial); }

        payloadData.sacMatName = sacInfo.name;
        payloadData.reqMatIcon = sacInfo.iconUrl;

        let targetOptions = [];
        const rMats = upgradeMats.weapon_materials.find(m => m.race === userRace);
        if (rMats) {
            const matMatch = rMats.materials.find(m => m.rarity === sacInfo.rarity);
            if (matMatch && matMatch.id !== sacInfo.id) {
                targetOptions.push({ label: resolveText(matMatch.name).substring(0, 100), value: matMatch.id.substring(0, 100), description: 'مورد سلاح' });
            }
        }
        
        upgradeMats.skill_books.forEach(cat => {
            const bookMatch = cat.books.find(b => b.rarity === sacInfo.rarity);
            if (bookMatch && bookMatch.id !== sacInfo.id) {
                targetOptions.push({ label: resolveText(bookMatch.name).substring(0, 100), value: bookMatch.id.substring(0, 100), description: 'مخطوطة سحر' });
            }
        });

        const uniqueTargetsMap = new Map();
        targetOptions.forEach(opt => uniqueTargetsMap.set(opt.value, opt));
        const uniqueTargets = Array.from(uniqueTargetsMap.values());

        if (!state.targetItem && uniqueTargets.length > 0) {
            components.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('forge_synth_target').setPlaceholder('2. اختر العنصر المطلوب...').addOptions(uniqueTargets.slice(0, 25))));
        }

        if (state.targetItem) {
            const targetInfo = getItemInfo(state.targetItem);
            if(targetInfo) {
                payloadData.targetMatName = targetInfo.name;
                payloadData.targetMatIcon = targetInfo.iconUrl;
                
                const btnStyle = userMora >= SYNTHESIS_FEE ? ButtonStyle.Success : ButtonStyle.Secondary;
                components.push(new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('forge_execute_synth').setLabel(`دمــج`).setStyle(btnStyle).setEmoji('🔨').setDisabled(userMora < SYNTHESIS_FEE)
                ));
            }
        }
    }

    components.push(getReturnRow());
    return await replyWithCanvas(i, user, 'synthesis', payloadData, components, [], isInitial);
}

async function handleSynthesis(i, user, guildId, db, state) {
    if (!state.sacrificeItem || !state.targetItem) return;
    
    let moraRes = await safeQuery(db, `SELECT "mora" FROM levels WHERE "user" = $1 AND "guild" = $2`, `SELECT mora FROM levels WHERE userid = $1 AND guildid = $2`, [user.id, guildId]);
    const userMora = moraRes?.rows?.[0] ? Number(moraRes.rows[0].mora || moraRes.rows[0].Mora) : 0;
    
    if (userMora < SYNTHESIS_FEE) {
        return await replyWithCanvas(i, user, 'synthesis_error', { mora: userMora, title: 'فرن الدمج السحري', hasError: true, errorMsg: `لا تملك المورا الكافية للدمج (المطلوب: ${SYNTHESIS_FEE} 🪙).` }, [getReturnRow()]);
    }

    let invRes = await safeQuery(db, `SELECT "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, `SELECT quantity FROM user_inventory WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [user.id, guildId, state.sacrificeItem]);
    let sacQty = 0;
    if (invRes?.rows) invRes.rows.forEach(r => sacQty += Number(r.quantity || r.Quantity));

    if (sacQty < 4) {
        return await replyWithCanvas(i, user, 'synthesis_error', { mora: userMora, title: 'فرن الدمج السحري', hasError: true, errorMsg: 'لا تملك 4 حبات من العنصر المطلوب للتضحية.' }, [getReturnRow()]);
    }

    await db.query('BEGIN').catch(()=>{}); 
    try {
        await db.query(`UPDATE levels SET "mora" = GREATEST(CAST("mora" AS INTEGER) - $1, 0) WHERE "user" = $2 AND "guild" = $3`, [SYNTHESIS_FEE, user.id, guildId]).catch(()=> db.query(`UPDATE levels SET mora = MAX(CAST(mora AS INTEGER) - $1, 0) WHERE userid = $2 AND guildid = $3`, [SYNTHESIS_FEE, user.id, guildId]));

        let remainingToDeduct = 4;
        let updateRes = await safeQuery(db, `SELECT "id", "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, `SELECT id, quantity FROM user_inventory WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [user.id, guildId, state.sacrificeItem]);
        for (const r of updateRes.rows) {
            if (remainingToDeduct <= 0) break;
            const q = Number(r.quantity || r.Quantity);
            const deduct = Math.min(q, remainingToDeduct);
            await db.query(`UPDATE user_inventory SET "quantity" = "quantity" - $1 WHERE "id" = $2`, [deduct, r.id || r.ID]).catch(()=> db.query(`UPDATE user_inventory SET quantity = quantity - $1 WHERE id = $2`, [deduct, r.id || r.ID]));
            remainingToDeduct -= deduct;
        }

        await db.query(`DELETE FROM user_inventory WHERE "quantity" <= 0 AND "userID" = $1`, [user.id]).catch(()=> db.query(`DELETE FROM user_inventory WHERE quantity <= 0 AND userid = $1`, [user.id]));
        
        let targetCheck = await safeQuery(db, `SELECT "id" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, `SELECT id FROM user_inventory WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [user.id, guildId, state.targetItem]);
        if (targetCheck?.rows?.[0]) await db.query(`UPDATE user_inventory SET "quantity" = "quantity" + 1 WHERE "id" = $1`, [targetCheck.rows[0].id]).catch(()=> db.query(`UPDATE user_inventory SET quantity = quantity + 1 WHERE id = $1`, [targetCheck.rows[0].id || targetCheck.rows[0].ID]));
        else await db.query(`INSERT INTO user_inventory ("guildID", "userID", "itemID", "quantity") VALUES ($1, $2, $3, 1)`, [guildId, user.id, state.targetItem]).catch(()=> db.query(`INSERT INTO user_inventory (guildid, userid, itemid, quantity) VALUES ($1, $2, $3, 1)`, [guildId, user.id, state.targetItem]));
        
        await db.query('COMMIT').catch(()=>{}); 
        
        const targetInfo = getItemInfo(state.targetItem);
        await replyWithCanvas(i, user, 'success_synthesis', {
            title: 'فرن الدمج السحري',
            targetMatName: targetInfo.name,
            targetMatIcon: targetInfo.iconUrl,
            targetMatRarity: targetInfo.rarity
        }, [getReturnRow()]);
    } catch (err) {
        await db.query('ROLLBACK').catch(()=>{});
        await replyWithCanvas(i, user, 'synthesis_error', { mora: userMora, title: 'فرن الدمج السحري', hasError: true, errorMsg: 'حدث خطأ أثناء الدمج!' }, [getReturnRow()]);
    }
}

// ------------------- الصهر (Smelting) -------------------
async function buildSmeltingUI(i, user, guildId, db, state, isInitial = false) {
    const [moraRes, invRes] = await Promise.all([
        safeQuery(db, `SELECT "mora" FROM levels WHERE "user" = $1 AND "guild" = $2`, `SELECT mora FROM levels WHERE userid = $1 AND guildid = $2`, [user.id, guildId]),
        safeQuery(db, `SELECT "itemID", "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2`, `SELECT itemid, quantity FROM user_inventory WHERE userid = $1 AND guildid = $2`, [user.id, guildId])
    ]);

    const userMora = moraRes?.rows?.[0] ? Number(moraRes.rows[0].mora) : 0;
    const inventory = aggregateInventory(invRes?.rows || []);

    const smeltableItems = inventory.filter(row => getItemInfo(row.itemID) !== null);

    if (smeltableItems.length === 0) {
        return await replyWithCanvas(i, user, 'smelting_home', { mora: userMora, title: 'محرقة التفكيك', hasError: true, errorMsg: 'لا تملك عناصر قابلة للصهر.' }, [getReturnRow()], [], isInitial);
    }

    let payloadData = { mora: userMora, title: 'محرقة التفكيك' };
    let components = [];

    if (!state.item) {
        const smeltOptions = smeltableItems.map(row => {
            const info = getItemInfo(row.itemID);
            const xpGain = SMELT_XP_RATES[info.rarity] || 0;
            return { label: info.name.substring(0, 100), value: info.id.substring(0, 100), description: `المخزون: ${row.quantity} | يعطي: ${xpGain} XP | الندرة: ${translateRarity(info.rarity)}`.substring(0, 100) };
        }).slice(0, 25);
        components.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('forge_smelt_select').setPlaceholder('اختر العنصر الذي تريد صهره...').addOptions(smeltOptions)));
    } else {
        const itemInfo = getItemInfo(state.item);
        if(!itemInfo) { state.item = null; return buildSmeltingUI(i, user, guildId, db, state, isInitial); }

        payloadData.sacMatName = itemInfo.name;
        payloadData.reqMatIcon = itemInfo.iconUrl;
        payloadData.xpGain = SMELT_XP_RATES[itemInfo.rarity] || 10;
        
        const rowData = smeltableItems.find(r => r.itemID === state.item);
        const itemQty = rowData ? rowData.quantity : 0;

        const actionRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('forge_execute_smelt_1').setLabel(`صـهـر`).setStyle(ButtonStyle.Danger)
        );

        if (itemQty > 1) {
            actionRow.addComponents(new ButtonBuilder().setCustomId(`forge_smelt_multi_${state.item}`).setLabel(`صـهـر متعـدد`).setStyle(ButtonStyle.Primary));
        }

        components.push(actionRow);
    }

    components.push(getReturnRow());
    return await replyWithCanvas(i, user, 'smelting', payloadData, components, [], isInitial);
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

    let moraRes = await safeQuery(db, `SELECT "mora" FROM levels WHERE "user" = $1 AND "guild" = $2`, `SELECT mora FROM levels WHERE userid = $1 AND guildid = $2`, [user.id, guildId]);
    const userMora = moraRes?.rows?.[0] ? Number(moraRes.rows[0].mora || moraRes.rows[0].Mora) : 0;

    let invRes = await safeQuery(db, `SELECT "quantity", "id" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, `SELECT quantity, id FROM user_inventory WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [user.id, guildId, itemIdToSmelt]);
    
    let totalQty = 0;
    if (invRes?.rows) invRes.rows.forEach(r => totalQty += Number(r.quantity || r.Quantity));

    if (totalQty < qtyToSmelt) {
        if (isModal) {
            await replyWithCanvas({
                replied: false, deferred: false,
                editReply: async (p) => i.editReply(p) 
            }, user, 'smelting_error', { mora: userMora, title: 'محرقة التفكيك', hasError: true, errorMsg: `لا تملك ${qtyToSmelt} حبة من هذا العنصر لصهره.` }, [getReturnRow()]);
            return;
        } else {
            return await replyWithCanvas(i, user, 'smelting_error', { mora: userMora, title: 'محرقة التفكيك', hasError: true, errorMsg: `لا تملك ${qtyToSmelt} حبة من هذا العنصر لصهره.` }, [getReturnRow()]);
        }
    }

    const itemInfo = getItemInfo(itemIdToSmelt);
    const xpReward = (SMELT_XP_RATES[itemInfo.rarity] || 10) * qtyToSmelt;

    await db.query('BEGIN').catch(()=>{}); 
    try {
        let remainingToDeduct = qtyToSmelt;
        for (const r of invRes.rows) {
            if (remainingToDeduct <= 0) break;
            const q = Number(r.quantity || r.Quantity);
            const deduct = Math.min(q, remainingToDeduct);
            await db.query(`UPDATE user_inventory SET "quantity" = "quantity" - $1 WHERE "id" = $2`, [deduct, r.id || r.ID]).catch(()=> db.query(`UPDATE user_inventory SET quantity = quantity - $1 WHERE id = $2`, [deduct, r.id || r.ID]));
            remainingToDeduct -= deduct;
        }

        await db.query(`DELETE FROM user_inventory WHERE "quantity" <= 0 AND "userID" = $1`, [user.id]).catch(()=> db.query(`DELETE FROM user_inventory WHERE quantity <= 0 AND userid = $1`, [user.id]));
        await db.query('COMMIT').catch(()=>{}); 

        const memberObj = await i.guild?.members?.fetch(user.id).catch(()=>{});
        if (addXPAndCheckLevel && memberObj) {
            await addXPAndCheckLevel(client, memberObj, db, xpReward, 0, false).catch(()=>{});
        } else {
            await db.query(`UPDATE levels SET "xp" = "xp" + $1, "totalXP" = "totalXP" + $1 WHERE "user" = $2 AND "guild" = $3`, [xpReward, user.id, guildId]).catch(()=> db.query(`UPDATE levels SET xp = xp + $1, totalxp = totalxp + $1 WHERE userid = $2 AND guildid = $3`, [xpReward, user.id, guildId]).catch(()=>{}));
            let cacheData = await client.getLevel(user.id, guildId);
            if(cacheData) { cacheData.xp += xpReward; cacheData.totalXP += xpReward; await client.setLevel(cacheData); }
        }
        
        const successData = {
            title: 'محرقة التفكيك',
            xpGain: xpReward
        };
        
        if (isModal) {
            await replyWithCanvas({
                replied: false, deferred: false,
                editReply: async (p) => i.editReply(p) 
            }, user, 'success_smelting', successData, [getReturnRow()]);
            state.item = null;
        } else {
            await replyWithCanvas(i, user, 'success_smelting', successData, [getReturnRow()]);
        }
    } catch (err) {
        await db.query('ROLLBACK').catch(()=>{});
        isModal ? await i.followUp({ content: "❌ حدث خطأ أثناء الصهر!", flags: MessageFlags.Ephemeral }) : await replyWithCanvas(i, user, 'smelting_error', { mora: userMora, title: 'محرقة التفكيك', hasError: true, errorMsg: 'حدث خطأ أثناء الصهر!' }, [getReturnRow()]);
    }
}
