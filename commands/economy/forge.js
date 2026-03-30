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

const RARITY_ARABIC = { 'Common': 'شائع', 'Uncommon': 'شائع', 'Rare': 'نادر', 'Epic': 'ملحمي', 'Legendary': 'أسطوري' };

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

function getStandardRaceName(rawName) {
    if (!rawName) return null;
    const name = rawName.toLowerCase().trim();
    for (const group of RACE_MAPPING) {
        for (const key of group.keys) {
            if (key === 'الف' && (name.includes('مخالف') || name.includes('تحالف'))) continue;
            if (name.includes(key)) return group.race;
        }
    }
    return weaponsConfig.find(w => w.race.toLowerCase() === name)?.race || null;
}

function translateRarity(rarity) { return RARITY_ARABIC[rarity] || rarity; }

function resolveText(val) {
    if (val == null) return '';
    if (typeof val === 'object') return val.ar || val.en || val.name || JSON.stringify(val);
    return String(val);
}

// 🔥 نظام المعالجة الذاتية لقاعدة البيانات (نظيف وبدون رسائل الكونسول) 🔥
const safeQuery = async (db, qPg, params) => {
    try { 
        return await db.query(qPg, params); 
    } catch(e) { 
        if (e.message && e.message.includes('violates unique constraint') && e.message.includes('_pkey')) {
            try {
                const match = e.message.match(/"([a-zA-Z0-9_]+)_pkey"/);
                if (match && match[1]) {
                    const tableName = match[1];
                    await db.query(`SELECT setval('${tableName}_id_seq', COALESCE((SELECT MAX(id) FROM ${tableName}), 0) + 1, false)`);
                    return await db.query(qPg, params); 
                }
            } catch(fixErr) {}
        }
        return {rows:[]};
    }
};

async function deductMora(db, userId, guildId, amount) {
    if (amount <= 0) return true;
    let res = await safeQuery(db, `SELECT "mora", "bank" FROM levels WHERE "user" = $1 AND "guild" = $2`, [userId, guildId]);
    if (!res || !res.rows || res.rows.length === 0) return false;

    let mora = Number(res.rows[0].mora || res.rows[0].Mora || 0);
    let bank = Number(res.rows[0].bank || res.rows[0].Bank || 0);

    if (mora + bank < amount) return false;

    if (mora >= amount) {
        mora -= amount;
    } else {
        let diff = amount - mora;
        mora = 0;
        bank -= diff;
    }

    await safeQuery(db, `UPDATE levels SET "mora" = $1, "bank" = $2 WHERE "user" = $3 AND "guild" = $4`, [mora, bank, userId, guildId]);
    return true;
}

async function deductItems(db, userId, guildId, itemsArray) {
    if (!itemsArray || itemsArray.length === 0) return true;

    for (let item of itemsArray) {
        let res = await safeQuery(db, `SELECT "id", "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [userId, guildId, item.id]);
        if(!res || !res.rows || res.rows.length === 0) return false;
        let currentQty = 0;
        res.rows.forEach(r => currentQty += Number(r.quantity || r.Quantity || 0));
        if(currentQty < item.count) return false;
    }

    for (let item of itemsArray) {
        let res = await safeQuery(db, `SELECT "id", "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [userId, guildId, item.id]);
        let remainingToDeduct = item.count;
        for (let r of res.rows) {
            if (remainingToDeduct <= 0) break;
            const q = Number(r.quantity || r.Quantity);
            const deduct = Math.min(q, remainingToDeduct);
            await safeQuery(db, `UPDATE user_inventory SET "quantity" = CAST("quantity" AS INTEGER) - $1 WHERE "id" = $2`, [deduct, r.id || r.ID]);
            remainingToDeduct -= deduct;
        }
    }
    
    await safeQuery(db, `DELETE FROM user_inventory WHERE "quantity" <= 0 AND "userID" = $1`, [userId]);
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

    let raceRolesRes = await safeQuery(db, `SELECT "roleID", "raceName" FROM race_roles WHERE "guildID" = $1`, [guild.id]);
    if (raceRolesRes && raceRolesRes.rows.length > 0) {
        const userRoleIDs = member.roles.cache.map(r => String(r.id).trim());
        const matched = raceRolesRes.rows.find(r => userRoleIDs.includes(String(r.roleID || r.roleid).trim()));
        if (matched) return getStandardRaceName(matched.raceName || matched.racename);
    }
    return null;
}

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
    if (currentLevel >= 30 || currentLevel === 0) return null;
    let reqs = [], moraCost = 0;
    const currentTier = Math.floor((currentLevel - 1) / 5); 
    const primaryTier = Math.min(currentTier, 4);

    moraCost = currentLevel * 800 * (primaryTier + 1);

    if (primaryTier === 0) {
        reqs.push({ tier: 0, count: currentLevel + 2 }); 
    } else {
        const prevTier = primaryTier - 1;
        reqs.push({ tier: prevTier, count: Math.floor(currentLevel * 0.8) + 3 });
        reqs.push({ tier: primaryTier, count: Math.floor(currentLevel * 0.5) + 2 });
    }

    let finalReqs = [];
    for (let r of reqs) {
        if (!isSkill) {
            finalReqs.push({ type: 'material', tier: r.tier, count: r.count });
        } else {
            finalReqs.push({ type: 'book', tier: r.tier, count: r.count });
            finalReqs.push({ type: 'material', tier: r.tier, count: Math.max(1, Math.floor(r.count * 0.5)) });
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
                
                if (i.deferred || i.replied) {
                    returnMessage = await i.editReply({ content: null, embeds: [], components, files: [attachment] }).catch(()=>{});
                } else if (typeof i.reply === 'function') {
                    returnMessage = await i.reply({ content: null, embeds: [], components, files: [attachment], fetchReply: true }).catch(()=>{});
                }
                return returnMessage || i; 
            }
        }
    } catch (e) {}
    return i;
}

async function buildMainUI(i, user, guildId, db, isInitial = false) {
    let userDataRes = await safeQuery(db, `SELECT "mora", "bank" FROM levels WHERE "user" = $1 AND "guild" = $2`, [user.id, guildId]);
    const userMora = Number(userDataRes?.rows?.[0]?.mora || userDataRes?.rows?.[0]?.Mora || 0) + Number(userDataRes?.rows?.[0]?.bank || userDataRes?.rows?.[0]?.Bank || 0);
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
        const guild = interactionOrMessage.guild; 

        let sentMsg = null;
        if (isSlash && !interactionOrMessage.preselectedItem) {
            await interactionOrMessage.deferReply().catch(()=>{});
        } else if (!isSlash && !interactionOrMessage.preselectedItem && interactionOrMessage.channel) {
            interactionOrMessage.channel.sendTyping().catch(()=>{});
        }

        const fakeInteraction = isSlash ? interactionOrMessage : {
            guild: guild,
            client: client,
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

        let userDataRes = await safeQuery(db, `SELECT "level" FROM levels WHERE "user" = $1 AND "guild" = $2`, [user.id, guildId]);
        if (!userDataRes?.rows?.[0]) return fakeInteraction.editReply({ content: "❌ لم يتم العثور على بياناتك في البنك." }).catch(()=>{});

        const currentRace = await getUserRaceName(user, guild, db);
        let replyObj;

        if (!currentRace) {
            let allRaces = await safeQuery(db, `SELECT "roleID", "raceName" FROM race_roles WHERE "guildID" = $1`, [guildId]);
            if (!allRaces || allRaces.rows.length === 0) {
                return fakeInteraction.editReply({ content: "❌ الإدارة لم تقم بإعداد رتب الأعراق في هذا السيرفر بعد. (يرجى إبلاغ الإدارة لاستخدام أمر الإعداد)" }).catch(()=>{});
            }

            const embed = new EmbedBuilder()
                .setTitle("✨ اختيار المصير")
                .setDescription("اختر العِرق الذي يُجسّد جوهرك وهويتك ، فكل اختيار يرسم مصيرك القادم\n\n⚠️ **عند تحديد عِرقك، لا يمكنك تغييره لاحقًا — فاختَر بحكمة.**")
                .setColor(Colors.DarkPurple);

            const options = allRaces.rows.slice(0, 25).map(r => ({
                label: r.raceName || r.racename,
                value: r.roleID || r.roleid,
                description: `الانضمام إلى عرق ${r.raceName || r.racename}`,
                emoji: '🎭'
            }));

            const row = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('forge_starter_race')
                    .setPlaceholder('اضغط هنا لاختيار عرقك...')
                    .addOptions(options)
            );

            replyObj = await fakeInteraction.editReply({ content: null, embeds: [embed], components: [row] });
        } else {
            if (commandTrigger.includes('صقل') || commandTrigger.includes('اكاديمية') || commandTrigger === 'ms') {
                replyObj = await buildAcademyMenuUI(fakeInteraction, user, guildId, db, !isSlash && !interactionOrMessage.preselectedItem);
            } else if (commandTrigger.includes('دمج')) {
                replyObj = await buildSynthesisUI(fakeInteraction, user, guildId, db, synthesisState, !isSlash && !interactionOrMessage.preselectedItem);
            } else if (commandTrigger.includes('صهر')) {
                replyObj = await buildSmeltingUI(fakeInteraction, user, guildId, db, smeltState, !isSlash && !interactionOrMessage.preselectedItem);
            } else {
                replyObj = await buildMainUI(fakeInteraction, user, guildId, db, !isSlash && !interactionOrMessage.preselectedItem);
            }
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
                if (i.isStringSelectMenu() && i.customId === 'forge_starter_race') {
                    const roleId = i.values[0];
                    let raceRolesRes = await safeQuery(db, `SELECT "roleID", "raceName" FROM race_roles WHERE "guildID" = $1`, [guildId]);
                    const matched = raceRolesRes.rows.find(r => (r.roleID || r.roleid) === roleId);
                    if(!matched) return i.followUp({ content: "❌ خطأ في العثور على العرق المختار.", flags: [MessageFlags.Ephemeral] });

                    const selectedRaceName = getStandardRaceName(matched.raceName || matched.racename);
                    const targetRole = i.guild.roles.cache.get(roleId);
                    
                    const memberObj = i.guild.members.cache.get(user.id) || await i.guild.members.fetch(user.id).catch(()=>null);
                    if (memberObj && targetRole) await memberObj.roles.add(targetRole).catch(()=>{});

                    await i.followUp({ content: `🎉 **مرحباً بك في عالمنا!**\nأنت الآن تنتمي رسمياً إلى عرق **(${selectedRaceName})**.\nافتح الحدادة الآن واصنع سلاحك أو تعلم مهاراتك الأولى مقابل ${LEARN_FEE} مورا!`, flags: [MessageFlags.Ephemeral] });
                    synthesisState = { sacrificeItem: null, targetItem: null }; smeltState = { item: null };
                    await buildMainUI(i, user, guildId, db, false);
                }
                else if (i.customId === 'forge_return_main') {
                    synthesisState = { sacrificeItem: null, targetItem: null }; smeltState = { item: null };
                    await buildMainUI(i, user, guildId, db, false);
                }
                else if (i.isStringSelectMenu()) {
                    if (i.customId === 'forge_skill_select') {
                        await buildSkillUpgradeUI(i, user, guildId, db, i.values[0]);
                    }
                    else if (i.customId === 'forge_synth_sacrifice') {
                        synthesisState.sacrificeItem = i.values[0]; synthesisState.targetItem = null; 
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
                    else if (i.customId === 'forge_buy_weapon') await handleWeaponBuy(i, user, guildId, db);
                    else if (i.customId === 'forge_skill_menu') await buildAcademyMenuUI(i, user, guildId, db);
                    else if (i.customId.startsWith('forge_learn_skill_')) await handleSkillLearn(i, user, guildId, db, i.customId.replace('forge_learn_skill_', ''));
                    else if (i.customId === 'forge_synthesis') { synthesisState = { sacrificeItem: null, targetItem: null }; await buildSynthesisUI(i, user, guildId, db, synthesisState); }
                    else if (i.customId === 'forge_smelting') { smeltState = { item: null }; await buildSmeltingUI(i, user, guildId, db, smeltState); }
                    else if (i.customId === 'forge_upgrade_weapon') await handleWeaponUpgrade(i, user, guildId, db);
                    else if (i.customId.startsWith('forge_upgrade_skill_')) await handleSkillUpgrade(i, user, guildId, db, i.customId.replace('forge_upgrade_skill_', ''));
                    else if (i.customId === 'forge_execute_synth') { await handleSynthesis(i, user, guildId, db, synthesisState); synthesisState = { sacrificeItem: null, targetItem: null }; }
                    else if (i.customId === 'forge_execute_smelt_1') { await handleSmelting(i, user, guildId, db, smeltState, client, 1); smeltState = { item: null }; }
                    else if (i.customId.startsWith('forge_smelt_multi_')) await handleSmeltingMultiModal(i, user, guildId, db, smeltState, client);
                }
            } catch (innerError) {}
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

async function buildWeaponForgeUI(i, user, guildId, db) {
    const raceName = await getUserRaceName(user, i.guild, db);
    if (!raceName) return await replyWithCanvas(i, user, 'weapon_error', { mora: 0, title: 'الحدادة', hasError: true, errorMsg: 'يجب اختيار عرقك أولاً من القائمة الرئيسية للحدادة!' }, [getReturnRow()]);

    const [userMoraRes, weaponRes, lvlRes] = await Promise.all([
        safeQuery(db, `SELECT "mora", "bank" FROM levels WHERE "user" = $1 AND "guild" = $2`, [user.id, guildId]),
        safeQuery(db, `SELECT "weaponLevel" FROM user_weapons WHERE "userID" = $1 AND "guildID" = $2 AND "raceName" = $3`, [user.id, guildId, raceName]),
        safeQuery(db, `SELECT "level" FROM levels WHERE "user" = $1 AND "guild" = $2`, [user.id, guildId])
    ]);

    const userMora = Number(userMoraRes?.rows?.[0]?.mora || userMoraRes?.rows?.[0]?.Mora || 0) + Number(userMoraRes?.rows?.[0]?.bank || userMoraRes?.rows?.[0]?.Bank || 0);
    const weaponConfig = weaponsConfig.find(w => w.race === raceName) || weaponsConfig[0];
    const currentLevel = weaponRes.rows.length > 0 ? Number(weaponRes.rows[0].weaponLevel || weaponRes.rows[0].weaponlevel) : 0;

    if (currentLevel === 0) {
        const btnRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`forge_buy_weapon`).setLabel(`صناعة السلاح الأساسي (${LEARN_FEE} مورا)`).setStyle(userMora >= LEARN_FEE ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(userMora < LEARN_FEE),
            getReturnRow().components[0]
        );
        return await replyWithCanvas(i, user, 'weapon', {
            mora: userMora, title: `صناعة ${resolveText(weaponConfig.name)}`,
            currentLevel: 0, nextLevel: 1, currentStat: `0 DMG`, nextStat: `${getWeaponDisplayDamage(weaponConfig, 1)} DMG`, reqMora: LEARN_FEE, 
            detailedReqs: [{ id: 'mora_fee', count: LEARN_FEE, userCount: userMora, name: 'رسوم الصناعة', rarity: 'Common', iconUrl: 'https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev/images/mora.png' }] 
        }, [btnRow], false);
    }
    
    if (currentLevel >= 30) return await replyWithCanvas(i, user, 'weapon_error', { mora: userMora, title: `تطوير ${resolveText(weaponConfig.name)}`, hasError: true, errorMsg: '✨ سلاحك وصل للحد الأقصى (Lv.30)!' }, [getReturnRow()]);

    const playerServerLevel = Number(lvlRes?.rows?.[0]?.level || lvlRes?.rows?.[0]?.Level || 1);
    if (currentLevel >= 15 && playerServerLevel < 30) return await replyWithCanvas(i, user, 'weapon_error', { mora: userMora, title: `تطوير ${resolveText(weaponConfig.name)}`, hasError: true, errorMsg: 'قفل المستوى: يجب أن تصل إلى المستوى 30 في السيرفر.' }, [getReturnRow()]);

    const reqs = getUpgradeRequirements(currentLevel, false);
    const raceMats = upgradeMats.weapon_materials.find(m => m.race === raceName) || upgradeMats.weapon_materials[0];
    
    const matPromises = reqs.materials.map(async (r) => {
        let matId = raceMats.materials[r.tier].id;
        let invRes = await safeQuery(db, `SELECT "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [user.id, guildId, matId]);
        const userMatCount = invRes?.rows?.[0] ? Number(invRes.rows[0].quantity || invRes.rows[0].Quantity) : 0;
        let matInfo = getItemInfo(matId);
        return { id: matId, count: r.count, userCount: userMatCount, name: matInfo.name, rarity: matInfo.rarity, iconUrl: matInfo.iconUrl };
    });

    const detailedReqs = await Promise.all(matPromises);
    const hasAllMats = detailedReqs.every(r => r.userCount >= r.count);
    const canUpgrade = userMora >= reqs.moraCost && hasAllMats;

    const btnRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`forge_upgrade_weapon`).setLabel('تـطـويـر السـلاح').setStyle(canUpgrade ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(!canUpgrade),
        getReturnRow().components[0]
    );
    
    return await replyWithCanvas(i, user, 'weapon', {
        mora: userMora, title: `تطوير ${resolveText(weaponConfig.name)}`,
        currentLevel, nextLevel: currentLevel + 1, currentStat: `${getWeaponDisplayDamage(weaponConfig, currentLevel)} DMG`, nextStat: `${getWeaponDisplayDamage(weaponConfig, currentLevel + 1)} DMG`, reqMora: reqs.moraCost, detailedReqs: detailedReqs 
    }, [btnRow], []);
}

async function handleWeaponBuy(i, user, guildId, db) {
    const raceName = await getUserRaceName(user, i.guild, db);
    const hasDeducted = await deductMora(db, user.id, guildId, LEARN_FEE);
    if (!hasDeducted) return await replyWithCanvas(i, user, 'weapon_error', { mora: 0, title: 'الحدادة', hasError: true, errorMsg: `لا تملك ${LEARN_FEE} مورا لصناعة السلاح!` }, [getReturnRow()]);

    await safeQuery(db, `DELETE FROM user_weapons WHERE "userID" = $1 AND "guildID" = $2 AND "raceName" = $3`, [user.id, guildId, raceName]);
    await safeQuery(db, `INSERT INTO user_weapons ("userID", "guildID", "raceName", "weaponLevel") VALUES ($1, $2, $3, 1)`, [user.id, guildId, raceName]);
    
    await buildWeaponForgeUI(i, user, guildId, db); 
}

async function handleWeaponUpgrade(i, user, guildId, db) {
    const [weaponRes, lvlRes] = await Promise.all([
        safeQuery(db, `SELECT "raceName", "weaponLevel" FROM user_weapons WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guildId]),
        safeQuery(db, `SELECT "level" FROM levels WHERE "user" = $1 AND "guild" = $2`, [user.id, guildId])
    ]);

    const wData = weaponRes?.rows?.[0];
    const currentLevel = Number(wData.weaponLevel || wData.weaponlevel);
    const playerServerLevel = Number(lvlRes?.rows?.[0]?.level || lvlRes?.rows?.[0]?.Level || 1);
    
    if (currentLevel >= 15 && playerServerLevel < 30) return; 

    const reqs = getUpgradeRequirements(currentLevel, false);
    const standardizedRace = getStandardRaceName(wData.raceName || wData.racename);
    const weaponConfig = weaponsConfig.find(w => w.race === standardizedRace) || weaponsConfig[0];
    const raceMats = upgradeMats.weapon_materials.find(m => m.race === standardizedRace) || upgradeMats.weapon_materials[0];
    let detailedReqs = reqs.materials.map(r => ({ id: raceMats.materials[r.tier].id, count: r.count }));

    const hasDeductedMora = await deductMora(db, user.id, guildId, reqs.moraCost);
    if (!hasDeductedMora) return await replyWithCanvas(i, user, 'weapon_error', { mora: 0, title: 'الحدادة', hasError: true, errorMsg: 'لا تملك المورا الكافية للتطوير!' }, [getReturnRow()]);
    
    const hasDeductedItems = await deductItems(db, user.id, guildId, detailedReqs);
    if (!hasDeductedItems) return await replyWithCanvas(i, user, 'weapon_error', { mora: 0, title: 'الحدادة', hasError: true, errorMsg: 'لا تملك الموارد الكافية!' }, [getReturnRow()]);

    await safeQuery(db, `UPDATE user_weapons SET "weaponLevel" = "weaponLevel" + 1 WHERE "userID" = $1 AND "guildID" = $2 AND "raceName" = $3`, [user.id, guildId, wData.raceName || wData.racename]);
    
    const nextLevel = currentLevel + 1;
    await replyWithCanvas(i, user, 'success_weapon', { title: `تطوير ${resolveText(weaponConfig.name)}`, currentLevel: currentLevel, nextLevel: nextLevel, nextStat: `${getWeaponDisplayDamage(weaponConfig, nextLevel)} DMG` }, [getReturnRow()], []);
}

async function buildAcademyMenuUI(i, user, guildId, db, isInitial = false) {
    const raceName = await getUserRaceName(user, i.guild, db);
    if (!raceName) return await replyWithCanvas(i, user, 'skill_home', { mora: 0, title: 'أكاديمية السحر', hasError: true, errorMsg: 'يجب اختيار عرقك أولاً!' }, [getReturnRow()], [], isInitial);
    
    const raceSkillId = `race_${raceName.toLowerCase().replace(/\s+/g, '_')}_skill`;

    const [userMoraRes, skillsRes] = await Promise.all([
        safeQuery(db, `SELECT "mora", "bank" FROM levels WHERE "user" = $1 AND "guild" = $2`, [user.id, guildId]),
        safeQuery(db, `SELECT * FROM user_skills WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guildId])
    ]);

    const userMora = Number(userMoraRes?.rows?.[0]?.mora || 0) + Number(userMoraRes?.rows?.[0]?.bank || 0);
    const userSkills = skillsRes?.rows || [];
    
    const skillMap = {};
    userSkills.forEach(s => skillMap[s.skillID || s.skillid] = Number(s.skillLevel || s.skilllevel));

    const availableSkills = skillsConfig.filter(sc => sc.id.startsWith('skill_') || sc.id === raceSkillId);
    const skillOptions = availableSkills.map(sc => {
        const lvl = skillMap[sc.id] || 0;
        return { label: resolveText(sc.name).substring(0, 100), value: sc.id.substring(0, 100), description: `Lv.${lvl}`.substring(0, 100) };
    });

    const skillSelectRow = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('forge_skill_select').setPlaceholder('اختر مهارة للتعلم أو الصقل...').addOptions(skillOptions.slice(0, 25)));
    return await replyWithCanvas(i, user, 'skill_home', { mora: userMora, title: 'أكاديمية السحر' }, [skillSelectRow, getReturnRow()], [], isInitial);
}

async function buildSkillUpgradeUI(i, user, guildId, db, skillId) {
    const raceName = await getUserRaceName(user, i.guild, db);
    const [userMoraRes, skillRes, lvlRes] = await Promise.all([
        safeQuery(db, `SELECT "mora", "bank" FROM levels WHERE "user" = $1 AND "guild" = $2`, [user.id, guildId]),
        safeQuery(db, `SELECT "skillLevel" FROM user_skills WHERE "userID" = $1 AND "guildID" = $2 AND "skillID" = $3`, [user.id, guildId, skillId]),
        safeQuery(db, `SELECT "level" FROM levels WHERE "user" = $1 AND "guild" = $2`, [user.id, guildId])
    ]);

    const userMora = Number(userMoraRes?.rows?.[0]?.mora || 0) + Number(userMoraRes?.rows?.[0]?.bank || 0);
    const currentLevel = skillRes.rows.length > 0 ? Number(skillRes.rows[0].skillLevel || skillRes.rows[0].skilllevel) : 0;
    const configSkill = skillsConfig.find(sc => sc.id === skillId) || skillsConfig[0];
    const statSymbol = configSkill.stat_type === '%' ? '%' : '';
    
    if (currentLevel === 0) {
        const btnRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`forge_learn_skill_${skillId}`).setLabel(`تعلم المهارة (${LEARN_FEE} مورا)`).setStyle(userMora >= LEARN_FEE ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(userMora < LEARN_FEE),
            getReturnRow().components[0]
        );
        return await replyWithCanvas(i, user, 'skill', {
            mora: userMora, title: `تعلم ${resolveText(configSkill.name)}`,
            currentLevel: 0, nextLevel: 1, currentStat: `0${statSymbol}`, nextStat: `${getSkillDisplayValue(configSkill, 1)}${statSymbol}`, reqMora: LEARN_FEE, 
            detailedReqs: [{ id: 'mora_fee', count: LEARN_FEE, userCount: userMora, name: 'رسوم التعلم', rarity: 'Common', iconUrl: 'https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev/images/mora.png' }]
        }, [btnRow], false);
    }

    if (currentLevel >= (configSkill.max_level || 30)) return await replyWithCanvas(i, user, 'skill_error', { mora: userMora, title: `صقل ${resolveText(configSkill.name)}`, hasError: true, errorMsg: '✨ المهارة وصلت للحد الأقصى!' }, [getReturnRow()]);

    const playerServerLevel = Number(lvlRes?.rows?.[0]?.level || lvlRes?.rows?.[0]?.Level || 1);
    if (currentLevel >= 15 && playerServerLevel < 30) return await replyWithCanvas(i, user, 'skill_error', { mora: userMora, title: `صقل ${resolveText(configSkill.name)}`, hasError: true, errorMsg: 'قفل المستوى: يجب أن تصل لـ Lv 30 أولاً.' }, [getReturnRow()]);

    const reqs = getUpgradeRequirements(currentLevel, true);
    const categoryName = skillId.startsWith('race_') ? 'Race_Skills' : 'General_Skills';
    const bookCat = upgradeMats.skill_books.find(c => c.category === categoryName) || upgradeMats.skill_books[0];
    const raceMats = upgradeMats.weapon_materials.find(m => m.race === raceName) || upgradeMats.weapon_materials[0];

    const matPromises = reqs.materials.map(async (r) => {
        let itemId = r.type === 'book' ? bookCat.books[r.tier].id : raceMats.materials[r.tier].id;
        let invRes = await safeQuery(db, `SELECT "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [user.id, guildId, itemId]);
        const userMatCount = invRes?.rows?.[0] ? Number(invRes.rows[0].quantity || invRes.rows[0].Quantity) : 0;
        let matInfo = getItemInfo(itemId);
        return { id: itemId, count: r.count, userCount: userMatCount, name: matInfo.name, rarity: matInfo.rarity, iconUrl: matInfo.iconUrl };
    });

    const detailedReqs = await Promise.all(matPromises);
    const hasAllMats = detailedReqs.every(r => r.userCount >= r.count);
    const canUpgrade = userMora >= reqs.moraCost && hasAllMats;

    const btnRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`forge_upgrade_skill_${skillId}`).setLabel('صقل المهارة 📜').setStyle(canUpgrade ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(!canUpgrade),
        getReturnRow().components[0]
    );
    
    return await replyWithCanvas(i, user, 'skill', {
        mora: userMora, title: `صقل ${resolveText(configSkill.name)}`, currentLevel, nextLevel: currentLevel + 1, currentStat: `${getSkillDisplayValue(configSkill, currentLevel)}${statSymbol}`, nextStat: `${getSkillDisplayValue(configSkill, currentLevel + 1)}${statSymbol}`, reqMora: reqs.moraCost, detailedReqs: detailedReqs
    }, [btnRow], []);
}

async function handleSkillLearn(i, user, guildId, db, skillId) {
    const hasDeducted = await deductMora(db, user.id, guildId, LEARN_FEE);
    if (!hasDeducted) {
        return await replyWithCanvas(i, user, 'skill_error', { mora: 0, title: 'أكاديمية السحر', hasError: true, errorMsg: `لا تملك ${LEARN_FEE} مورا لتعلم المهارة!` }, [getReturnRow()]);
    }

    await safeQuery(db, `DELETE FROM user_skills WHERE "userID" = $1 AND "guildID" = $2 AND "skillID" = $3`, [user.id, guildId, skillId]);
    await safeQuery(db, `INSERT INTO user_skills ("userID", "guildID", "skillID", "skillLevel") VALUES ($1, $2, $3, 1)`, [user.id, guildId, skillId]);
    
    await buildSkillUpgradeUI(i, user, guildId, db, skillId);
}

async function handleSkillUpgrade(i, user, guildId, db, skillId) {
    const [skillRes, lvlRes, wRes] = await Promise.all([
        safeQuery(db, `SELECT * FROM user_skills WHERE "userID" = $1 AND "guildID" = $2 AND "skillID" = $3`, [user.id, guildId, skillId]),
        safeQuery(db, `SELECT "level" FROM levels WHERE "user" = $1 AND "guild" = $2`, [user.id, guildId]),
        safeQuery(db, `SELECT "raceName" FROM user_weapons WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guildId])
    ]);

    const currentLevel = Number(skillRes.rows[0].skillLevel || skillRes.rows[0].skilllevel);
    const playerServerLevel = Number(lvlRes?.rows?.[0]?.level || lvlRes?.rows?.[0]?.Level || 1);
    if (currentLevel >= 15 && playerServerLevel < 30) return; 

    const reqs = getUpgradeRequirements(currentLevel, true);
    const categoryName = skillId.startsWith('race_') ? 'Race_Skills' : 'General_Skills';
    const configSkill = skillsConfig.find(sc => sc.id === skillId) || skillsConfig[0];
    const bookCat = upgradeMats.skill_books.find(c => c.category === categoryName) || upgradeMats.skill_books[0];
    const userRace = getStandardRaceName(wRes?.rows?.[0]?.raceName || wRes?.rows?.[0]?.racename);
    const raceMats = upgradeMats.weapon_materials.find(m => m.race === userRace) || upgradeMats.weapon_materials[0];

    let detailedReqs = reqs.materials.map(r => {
        return { id: r.type === 'book' ? bookCat.books[r.tier].id : raceMats.materials[r.tier].id, count: r.count };
    });

    const hasDeductedMora = await deductMora(db, user.id, guildId, reqs.moraCost);
    if (!hasDeductedMora) return await replyWithCanvas(i, user, 'skill_error', { mora: 0, title: 'أكاديمية السحر', hasError: true, errorMsg: 'لا تملك المورا الكافية للترقية!' }, [getReturnRow()]);
    
    const hasDeductedItems = await deductItems(db, user.id, guildId, detailedReqs);
    if (!hasDeductedItems) return await replyWithCanvas(i, user, 'skill_error', { mora: 0, title: 'أكاديمية السحر', hasError: true, errorMsg: 'لا تملك الموارد الكافية للترقية!' }, [getReturnRow()]);

    await safeQuery(db, `UPDATE user_skills SET "skillLevel" = "skillLevel" + 1 WHERE "userID" = $1 AND "guildID" = $2 AND "skillID" = $3`, [user.id, guildId, skillId]);
    
    const statSymbol = configSkill.stat_type === '%' ? '%' : '';
    await replyWithCanvas(i, user, 'success_skill', { title: `صقل ${resolveText(configSkill.name)}`, currentLevel: currentLevel, nextLevel: currentLevel + 1, nextStat: `${getSkillDisplayValue(configSkill, currentLevel + 1)}${statSymbol}` }, [getReturnRow()], []);
}

async function buildSynthesisUI(i, user, guildId, db, state, isInitial = false) {
    const [moraRes, invRes, wRes] = await Promise.all([
        safeQuery(db, `SELECT "mora", "bank" FROM levels WHERE "user" = $1 AND "guild" = $2`, [user.id, guildId]),
        safeQuery(db, `SELECT "itemID", "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guildId]),
        safeQuery(db, `SELECT "raceName" FROM user_weapons WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guildId])
    ]);

    const userMora = Number(moraRes?.rows?.[0]?.mora || 0) + Number(moraRes?.rows?.[0]?.bank || 0);
    const inventory = aggregateInventory(invRes?.rows || []);
    const userRace = getStandardRaceName(wRes?.rows?.[0]?.raceName || wRes?.rows?.[0]?.racename);

    const availableSacrifices = inventory.filter(row => {
        if (row.quantity < 4) return false;
        const info = getItemInfo(row.itemID);
        if (!info) return false;
        if (info.type === 'material' && info.race !== userRace) return false;
        return true;
    });

    if (availableSacrifices.length === 0) return await replyWithCanvas(i, user, 'synthesis_home', { mora: userMora, title: 'فرن الدمج', hasError: true, errorMsg: 'لا تملك 4 عناصر متشابهة.' }, [getReturnRow()], [], isInitial);

    let components = [];
    let payloadData = { mora: userMora, title: 'فرن الدمج', fee: SYNTHESIS_FEE };

    if (!state.sacrificeItem) {
        const sacrificeOptions = availableSacrifices.map(row => {
            const info = getItemInfo(row.itemID);
            return { label: info.name.substring(0, 100), value: info.id.substring(0, 100), description: `الكمية: ${row.quantity}`.substring(0, 100) };
        }).slice(0, 25);
        components.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('forge_synth_sacrifice').setPlaceholder('1. اختر العنصر الذي ستضحي به').addOptions(sacrificeOptions)));
    } else {
        const sacInfo = getItemInfo(state.sacrificeItem);
        if(!sacInfo) { state.sacrificeItem = null; return buildSynthesisUI(i, user, guildId, db, state, isInitial); }

        payloadData.sacMatName = sacInfo.name; payloadData.reqMatIcon = sacInfo.iconUrl;

        let targetOptions = [];
        const rMats = upgradeMats.weapon_materials.find(m => m.race === userRace);
        if (rMats) {
            const matMatch = rMats.materials.find(m => m.rarity === sacInfo.rarity);
            if (matMatch && matMatch.id !== sacInfo.id) targetOptions.push({ label: resolveText(matMatch.name).substring(0, 100), value: matMatch.id.substring(0, 100) });
        }
        upgradeMats.skill_books.forEach(cat => {
            const bookMatch = cat.books.find(b => b.rarity === sacInfo.rarity);
            if (bookMatch && bookMatch.id !== sacInfo.id) targetOptions.push({ label: resolveText(bookMatch.name).substring(0, 100), value: bookMatch.id.substring(0, 100) });
        });

        const uniqueTargetsMap = new Map(); targetOptions.forEach(opt => uniqueTargetsMap.set(opt.value, opt));
        const uniqueTargets = Array.from(uniqueTargetsMap.values());

        if (!state.targetItem && uniqueTargets.length > 0) {
            components.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('forge_synth_target').setPlaceholder('2. اختر العنصر المطلوب...').addOptions(uniqueTargets.slice(0, 25))));
        }

        if (state.targetItem) {
            const targetInfo = getItemInfo(state.targetItem);
            if(targetInfo) {
                payloadData.targetMatName = targetInfo.name; payloadData.targetMatIcon = targetInfo.iconUrl;
                components.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('forge_execute_synth').setLabel(`دمــج`).setStyle(userMora >= SYNTHESIS_FEE ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(userMora < SYNTHESIS_FEE)));
            }
        }
    }
    components.push(getReturnRow());
    return await replyWithCanvas(i, user, 'synthesis', payloadData, components, [], isInitial);
}

async function handleSynthesis(i, user, guildId, db, state) {
    if (!state.sacrificeItem || !state.targetItem) return;
    
    const hasDeductedMora = await deductMora(db, user.id, guildId, SYNTHESIS_FEE);
    if (!hasDeductedMora) return await replyWithCanvas(i, user, 'synthesis_error', { mora: 0, title: 'فرن الدمج السحري', hasError: true, errorMsg: `لا تملك المورا الكافية للدمج!` }, [getReturnRow()]);

    const hasDeductedItems = await deductItems(db, user.id, guildId, [{ id: state.sacrificeItem, count: 4 }]);
    if (!hasDeductedItems) return await replyWithCanvas(i, user, 'synthesis_error', { mora: 0, title: 'فرن الدمج السحري', hasError: true, errorMsg: 'لا تملك 4 عناصر متشابهة!' }, [getReturnRow()]);

    let targetCheck = await safeQuery(db, `SELECT "id" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [user.id, guildId, state.targetItem]);
    if (targetCheck?.rows?.[0]) await safeQuery(db, `UPDATE user_inventory SET "quantity" = "quantity" + 1 WHERE "id" = $1`, [targetCheck.rows[0].id || targetCheck.rows[0].ID]);
    else await safeQuery(db, `INSERT INTO user_inventory ("guildID", "userID", "itemID", "quantity") VALUES ($1, $2, $3, 1)`, [guildId, user.id, state.targetItem]);
    
    const targetInfo = getItemInfo(state.targetItem);
    await replyWithCanvas(i, user, 'success_synthesis', { title: 'فرن الدمج السحري', targetMatName: targetInfo.name, targetMatIcon: targetInfo.iconUrl, targetMatRarity: targetInfo.rarity }, [getReturnRow()]);
}

async function buildSmeltingUI(i, user, guildId, db, state, isInitial = false) {
    const [moraRes, invRes] = await Promise.all([
        safeQuery(db, `SELECT "mora", "bank" FROM levels WHERE "user" = $1 AND "guild" = $2`, [user.id, guildId]),
        safeQuery(db, `SELECT "itemID", "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guildId])
    ]);
    const userMora = Number(moraRes?.rows?.[0]?.mora || 0) + Number(moraRes?.rows?.[0]?.bank || 0);
    const inventory = aggregateInventory(invRes?.rows || []);
    const smeltableItems = inventory.filter(row => getItemInfo(row.itemID) !== null);

    if (smeltableItems.length === 0) return await replyWithCanvas(i, user, 'smelting_home', { mora: userMora, title: 'محرقة التفكيك', hasError: true, errorMsg: 'لا تملك عناصر قابلة للصهر.' }, [getReturnRow()], [], isInitial);

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
        const rowData = smeltableItems.find(r => r.itemID === state.item);
        const itemQty = rowData ? rowData.quantity : 0;
        const actionRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('forge_execute_smelt_1').setLabel(`صـهـر`).setStyle(ButtonStyle.Danger));
        if (itemQty > 1) actionRow.addComponents(new ButtonBuilder().setCustomId(`forge_smelt_multi_${state.item}`).setLabel(`صـهـر متعـدد`).setStyle(ButtonStyle.Primary));
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

    const hasDeductedItems = await deductItems(db, user.id, guildId, [{ id: itemIdToSmelt, count: qtyToSmelt }]);
    if (!hasDeductedItems) {
        if (isModal) {
            return await replyWithCanvas({ replied: false, deferred: false, editReply: async (p) => i.editReply(p) }, user, 'smelting_error', { mora: 0, title: 'محرقة التفكيك', hasError: true, errorMsg: `لا تملك ${qtyToSmelt} حبة للصهر.` }, [getReturnRow()]);
        } else {
            return await replyWithCanvas(i, user, 'smelting_error', { mora: 0, title: 'محرقة التفكيك', hasError: true, errorMsg: `لا تملك ${qtyToSmelt} حبة للصهر.` }, [getReturnRow()]);
        }
    }

    const itemInfo = getItemInfo(itemIdToSmelt);
    const xpReward = (SMELT_XP_RATES[itemInfo.rarity] || 10) * qtyToSmelt;

    const memberObj = await i.guild?.members?.fetch(user.id).catch(()=>{});
    if (addXPAndCheckLevel && memberObj) await addXPAndCheckLevel(client, memberObj, db, xpReward, 0, false).catch(()=>{});
    else await safeQuery(db, `UPDATE levels SET "xp" = "xp" + $1, "totalXP" = "totalXP" + $1 WHERE "user" = $2 AND "guild" = $3`, [xpReward, user.id, guildId]);
        
    const successData = { title: 'محرقة التفكيك', xpGain: xpReward };
    if (isModal) { await replyWithCanvas({ replied: false, deferred: false, editReply: async (p) => i.editReply(p) }, user, 'success_smelting', successData, [getReturnRow()]); state.item = null; } 
    else { await replyWithCanvas(i, user, 'success_smelting', successData, [getReturnRow()]); }
}
