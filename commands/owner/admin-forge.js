const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, Colors, AttachmentBuilder, MessageFlags } = require('discord.js');
const weaponsConfig = require('../../json/weapons-config.json');
const skillsConfig = require('../../json/skills-config.json');
const upgradeMats = require('../../json/upgrade-materials.json');

let generateForgeUI;
try {
    ({ generateForgeUI } = require('../../generators/forge-generator.js'));
} catch (e) {
    generateForgeUI = null;
}

const R2_URL = 'https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev';
const OWNER_ID = '1145327691772481577';

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

function getSafeWeaponConfig(raceName) {
    if (!raceName) return weaponsConfig[0];
    return weaponsConfig.find(w => w.race.toLowerCase() === raceName.toLowerCase()) || weaponsConfig[0];
}

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
        let fallbackQuery = qPg
            .replace(/"userID"/gi, "userid").replace(/"guildID"/gi, "guildid")
            .replace(/"itemID"/gi, "itemid").replace(/"skillID"/gi, "skillid")
            .replace(/"skillLevel"/gi, "skilllevel").replace(/"raceName"/gi, "racename")
            .replace(/"weaponLevel"/gi, "weaponlevel").replace(/"quantity"/gi, "quantity")
            .replace(/"mora"/gi, "mora").replace(/"bank"/gi, "bank")
            .replace(/"level"/gi, "level").replace(/"id"/gi, "id")
            .replace(/"user"/gi, "userid").replace(/"guild"/gi, "guildid");
        if (fallbackQuery !== qPg) {
            try { 
                let res2 = await db.query(fallbackQuery, params); 
                return { rows: Array.isArray(res2) ? res2 : (res2?.rows || []) };
            } catch(e2) { }
        }
        return { rows: [] };
    }
};

// 🔥 هنا السحر: الفحوصات دائماً ترجع true للإمبراطور، والخصومات لا تفعل شيئاً 🔥
async function checkMora() { return true; }
async function checkItems() { return true; }
async function deductMora() { return true; }
async function deductItems() { return true; }

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
        const matched = raceRolesRes.rows.find(r => userRoleIDs.includes(String(r.roleID || r.roleid).trim()));
        if (matched) return getStandardRaceName(matched.raceName || matched.racename);
    }
    return null;
}

function getWeaponDisplayDamage(weaponConfig, level) {
    if (!weaponConfig || level < 1) return 15;
    const base = weaponConfig.base_damage;
    const inc = weaponConfig.damage_increment;

    if (level <= 15) return Math.floor(base + (inc * (level - 1)));
    else {
        const damageAt15 = base + (inc * 14);
        const targetDamageAt30 = 800;
        const dynamicIncrement = (targetDamageAt30 - damageAt15) / 15;
        if (level >= 30) return targetDamageAt30;
        return Math.floor(damageAt15 + (dynamicIncrement * (level - 15)));
    }
}

function getSkillDisplayValue(skillConfig, currentLevel) {
    if (!skillConfig) return 0;
    const level = Math.max(1, currentLevel || 1);
    const base = skillConfig.base_value;
    const inc = skillConfig.value_increment;
    const isPercentage = skillConfig.stat_type === '%' || skillConfig.id.includes('heal') || skillConfig.id.includes('shield');

    if (level <= 15) return Math.floor(base + (inc * (level - 1)));
    else {
        const valueAt15 = base + (inc * 14);
        const targetValueAt30 = isPercentage ? 50 : 200; 
        const dynamicIncrement = (targetValueAt30 - valueAt15) / 15;
        if (level >= 30) return targetValueAt30;
        return Math.floor(valueAt15 + (dynamicIncrement * (level - 15)));
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

const getMainMenuRows = () => [
    new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('admin_forge_weapon').setLabel('تطوير السلاح (مجاني)').setStyle(ButtonStyle.Danger).setEmoji('⚒️'),
        new ButtonBuilder().setCustomId('admin_forge_skill_menu').setLabel('تطوير المهارات (مجاني)').setStyle(ButtonStyle.Primary).setEmoji('🔮')
    )
];

const getReturnRow = () => new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('admin_forge_return_main').setEmoji('↩️').setStyle(ButtonStyle.Secondary)
);

async function replyWithCanvas(i, targetUser, view, data, components) {
    let returnMessage = null;
    try {
        if (generateForgeUI) {
            const buffer = await generateForgeUI(targetUser, view, data);
            if (buffer) {
                const filename = `admin_forge_${Date.now()}.png`; 
                const attachment = new AttachmentBuilder(buffer, { name: filename });
                
                if (i.deferred || i.replied) {
                    returnMessage = await i.editReply({ content: null, embeds: [], components, files: [attachment] }).catch(()=>{});
                } else if (typeof i.reply === 'function') {
                    // استخدمنا withResponse للامتثال لتحديثات ديسكورد الجديدة بدلاً من fetchReply
                    returnMessage = await i.reply({ content: null, embeds: [], components, files: [attachment], withResponse: true }).catch(()=>{});
                }
                
                // إذا لم يتم جلب الرسالة، نكتفي بالتفاعل فقط لمنع تحطم الكود
                return returnMessage ? (returnMessage.resource?.message || returnMessage) : i; 
            }
        }
    } catch (e) {}
    return i;
}

async function buildMainUI(i, targetUser, guildId, db) {
    let userDataRes = await safeQuery(db, `SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2`, [targetUser.id, guildId]);
    const userMora = Number(userDataRes?.rows?.[0]?.mora || userDataRes?.rows?.[0]?.Mora || 0) + Number(userDataRes?.rows?.[0]?.bank || userDataRes?.rows?.[0]?.Bank || 0);
    return await replyWithCanvas(i, targetUser, 'main', { mora: userMora, title: '🔧 حدادة الإمبراطور (مسؤول)' }, getMainMenuRows());
}

module.exports = {
    name: 'af',
    aliases: ['adminforge', 'حا', 'حدادة-ادمن'],
    description: 'أمر الإمبراطور لتطوير عتاد ومهارات اللاعبين مجاناً (للأونر فقط - بريفكس)',
    category: 'Owner',
    
    // تم التعديل لمنع خطأ TypeError: Cannot read properties of undefined (reading 'users')
    async execute(message, args) {
        if (message.author.id !== OWNER_ID) return;
        
        const client = message.client;
        const db = client.sql;
        const guildId = message.guild.id; 

        // قراءة المنشن بأمان
        const targetUser = message.mentions.users.first() || client.users.cache.get(args[0]);
        if (!targetUser || targetUser.bot) {
            return message.reply({ content: "❌ الرجاء منشن لاعب صحيح (أو وضع الآيدي حقه)." });
        }

        const fakeInteraction = {
            guild: message.guild,
            client: client,
            replied: false, 
            deferred: false,
            reply: async (p) => { 
                return await message.channel.send(p).catch(()=>{}); 
            },
            editReply: async (p) => { 
                return await message.channel.send(p).catch(()=>{}); 
            },
            followUp: async (p) => message.channel.send(p).catch(()=>{})
        };

        let userDataRes = await safeQuery(db, `SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2`, [targetUser.id, guildId]);
        if (!userDataRes?.rows?.[0]) return fakeInteraction.reply({ content: `❌ لم يتم العثور على بيانات لـ ${targetUser.username} في البنك.` });

        const currentRace = await getUserRaceName(targetUser, message.guild, db);
        if (!currentRace) {
            return fakeInteraction.reply({ content: `❌ اللاعب ${targetUser.username} لم يقم باختيار عرق بعد، لا يمكنك التعديل على حدادته.` });
        }

        let replyObj = await buildMainUI(fakeInteraction, targetUser, guildId, db);

        // الحماية من الـ TypeError إذا لم يرجع الرسالة الصحيحة
        if (!replyObj || !replyObj.createMessageComponentCollector) return;

        // 🔥 الكولكتر يستجيب فقط للأونر 🔥
        const filter = i => i.user.id === message.author.id && i.customId.startsWith('admin_forge_');
        const collector = replyObj.createMessageComponentCollector({ filter, time: 300000 });

        collector.on('collect', async (i) => {
            try { if (!i.deferred && !i.replied) await i.deferUpdate(); } catch(e) {}

            try {
                if (i.isStringSelectMenu()) {
                    if (i.customId === 'admin_forge_skill_select') {
                        await buildSkillUpgradeUI(i, targetUser, guildId, db, i.values[0]);
                    }
                }
                else if (i.isButton()) {
                    if (i.customId === 'admin_forge_return_main') await buildMainUI(i, targetUser, guildId, db);
                    else if (i.customId === 'admin_forge_weapon') await buildWeaponForgeUI(i, targetUser, guildId, db);
                    else if (i.customId === 'admin_forge_buy_weapon') await handleWeaponBuy(i, targetUser, guildId, db);
                    else if (i.customId === 'admin_forge_skill_menu') await buildAcademyMenuUI(i, targetUser, guildId, db);
                    else if (i.customId.startsWith('admin_forge_learn_skill_')) await handleSkillLearn(i, targetUser, guildId, db, i.customId.replace('admin_forge_learn_skill_', ''));
                    else if (i.customId === 'admin_forge_upgrade_weapon') await handleWeaponUpgrade(i, targetUser, guildId, db);
                    else if (i.customId.startsWith('admin_forge_upgrade_skill_')) await handleSkillUpgrade(i, targetUser, guildId, db, i.customId.replace('admin_forge_upgrade_skill_', ''));
                }
            } catch (innerError) {
                console.error(innerError);
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

async function buildWeaponForgeUI(i, targetUser, guildId, db) {
    const roleRaceName = await getUserRaceName(targetUser, i.guild, db);
    const [userMoraRes, weaponRes] = await Promise.all([
        safeQuery(db, `SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2`, [targetUser.id, guildId]),
        safeQuery(db, `SELECT * FROM user_weapons WHERE "userID" = $1 AND "guildID" = $2`, [targetUser.id, guildId])
    ]);

    const userMora = Number(userMoraRes?.rows?.[0]?.mora || 0) + Number(userMoraRes?.rows?.[0]?.bank || 0);
    const wData = weaponRes?.rows?.[0];
    const currentLevel = wData ? Number(wData.weaponLevel || wData.weaponlevel) : 0;
    const raceName = wData ? getStandardRaceName(wData.raceName || wData.racename) : roleRaceName;
    const weaponConfig = getSafeWeaponConfig(raceName);

    if (currentLevel === 0) {
        const btnRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`admin_forge_buy_weapon`).setLabel(`صناعة السلاح الأساسي (مجاني للأونر)`).setStyle(ButtonStyle.Success),
            getReturnRow().components[0]
        );
        return await replyWithCanvas(i, targetUser, 'weapon', {
            mora: userMora, title: `صناعة ${resolveText(weaponConfig.name)} (مسؤول)`,
            currentLevel: 0, nextLevel: 1, currentStat: `0 DMG`, nextStat: `${getWeaponDisplayDamage(weaponConfig, 1)} DMG`, reqMora: 0, 
            detailedReqs: [{ id: 'mora_fee', count: 0, userCount: 99999, name: 'تطوير مسؤول مجاني', rarity: 'Legendary', iconUrl: 'https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev/images/mora.png' }] 
        }, [btnRow]);
    }
    
    if (currentLevel >= 30) return await replyWithCanvas(i, targetUser, 'weapon_error', { mora: userMora, title: `تطوير ${resolveText(weaponConfig.name)}`, hasError: true, errorMsg: '✨ سلاح اللاعب وصل للحد الأقصى (Lv.30)!' }, [getReturnRow()]);

    const reqs = getUpgradeRequirements(currentLevel, false);
    
    // متطلبات وهمية ممتلئة للـ UI فقط
    const detailedReqs = reqs.materials.map(r => {
        return { id: r.tier, count: 0, userCount: 9999, name: 'موارد الأونر اللانهائية', rarity: 'Legendary', iconUrl: 'https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev/images/mora.png' };
    });

    const btnRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`admin_forge_upgrade_weapon`).setLabel('تـطـويـر السـلاح (مجاني)').setStyle(ButtonStyle.Success),
        getReturnRow().components[0]
    );
    
    return await replyWithCanvas(i, targetUser, 'weapon', {
        mora: userMora, title: `تطوير ${resolveText(weaponConfig.name)} (مسؤول)`,
        currentLevel, nextLevel: currentLevel + 1, currentStat: `${getWeaponDisplayDamage(weaponConfig, currentLevel)} DMG`, nextStat: `${getWeaponDisplayDamage(weaponConfig, currentLevel + 1)} DMG`, reqMora: 0, detailedReqs: detailedReqs 
    }, [btnRow]);
}

async function handleWeaponBuy(i, targetUser, guildId, db) {
    const raceName = await getUserRaceName(targetUser, i.guild, db);
    await safeQuery(db, `DELETE FROM user_weapons WHERE "userID" = $1 AND "guildID" = $2 AND "raceName" = $3`, [targetUser.id, guildId, raceName]);
    await safeQuery(db, `INSERT INTO user_weapons ("userID", "guildID", "raceName", "weaponLevel") VALUES ($1, $2, $3, 1)`, [targetUser.id, guildId, raceName]);
    await buildWeaponForgeUI(i, targetUser, guildId, db); 
}

async function handleWeaponUpgrade(i, targetUser, guildId, db) {
    const [weaponRes] = await Promise.all([
        safeQuery(db, `SELECT * FROM user_weapons WHERE "userID" = $1 AND "guildID" = $2`, [targetUser.id, guildId])
    ]);

    const wData = weaponRes?.rows?.[0];
    const currentLevel = Number(wData.weaponLevel || wData.weaponlevel);
    
    try {
        await db.query(`UPDATE user_weapons SET "weaponLevel" = "weaponLevel" + 1 WHERE "userID" = $1 AND "guildID" = $2 AND "raceName" = $3`, [targetUser.id, guildId, wData.raceName || wData.racename]);
    } catch(e) {
        await db.query(`UPDATE user_weapons SET weaponlevel = weaponlevel + 1 WHERE userid = $1 AND guildid = $2 AND racename = $3`, [targetUser.id, guildId, wData.raceName || wData.racename]).catch(()=>{});
    }
    
    const standardizedRace = getStandardRaceName(wData.raceName || wData.racename);
    const weaponConfig = getSafeWeaponConfig(standardizedRace);
    const nextLevel = currentLevel + 1;

    await replyWithCanvas(i, targetUser, 'success_weapon', { title: `تطوير ${resolveText(weaponConfig.name)}`, currentLevel: currentLevel, nextLevel: nextLevel, nextStat: `${getWeaponDisplayDamage(weaponConfig, nextLevel)} DMG` }, [getReturnRow()]);
}

async function buildAcademyMenuUI(i, targetUser, guildId, db) {
    const raceName = await getUserRaceName(targetUser, i.guild, db);
    const raceSkillId = `race_${raceName.toLowerCase().replace(/\s+/g, '_')}_skill`;

    const [userMoraRes, skillsRes] = await Promise.all([
        safeQuery(db, `SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2`, [targetUser.id, guildId]),
        safeQuery(db, `SELECT * FROM user_skills WHERE "userID" = $1 AND "guildID" = $2`, [targetUser.id, guildId])
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

    const skillSelectRow = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('admin_forge_skill_select').setPlaceholder('اختر مهارة لترقيتها للاعب...').addOptions(skillOptions.slice(0, 25)));
    return await replyWithCanvas(i, targetUser, 'skill_home', { mora: userMora, title: 'أكاديمية السحر (مسؤول)' }, [skillSelectRow, getReturnRow()]);
}

async function buildSkillUpgradeUI(i, targetUser, guildId, db, skillId) {
    const [userMoraRes, skillRes] = await Promise.all([
        safeQuery(db, `SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2`, [targetUser.id, guildId]),
        safeQuery(db, `SELECT * FROM user_skills WHERE "userID" = $1 AND "guildID" = $2 AND "skillID" = $3`, [targetUser.id, guildId, skillId])
    ]);

    const userMora = Number(userMoraRes?.rows?.[0]?.mora || 0) + Number(userMoraRes?.rows?.[0]?.bank || 0);
    const currentLevel = skillRes.rows.length > 0 ? Number(skillRes.rows[0].skillLevel || skillRes.rows[0].skilllevel) : 0;
    const configSkill = skillsConfig.find(sc => sc.id === skillId) || skillsConfig[0];
    const statSymbol = configSkill.stat_type === '%' ? '%' : '';
    
    if (currentLevel === 0) {
        const btnRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`admin_forge_learn_skill_${skillId}`).setLabel(`تعلم المهارة (مجاني للأونر)`).setStyle(ButtonStyle.Success),
            getReturnRow().components[0]
        );
        return await replyWithCanvas(i, targetUser, 'skill', {
            mora: userMora, title: `تعلم ${resolveText(configSkill.name)} (مسؤول)`,
            currentLevel: 0, nextLevel: 1, currentStat: `0${statSymbol}`, nextStat: `${getSkillDisplayValue(configSkill, 1)}${statSymbol}`, reqMora: 0, 
            detailedReqs: [{ id: 'mora_fee', count: 0, userCount: 9999, name: 'تعلم مسؤول', rarity: 'Legendary', iconUrl: 'https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev/images/mora.png' }]
        }, [btnRow]);
    }

    if (currentLevel >= (configSkill.max_level || 30)) return await replyWithCanvas(i, targetUser, 'skill_error', { mora: userMora, title: `صقل ${resolveText(configSkill.name)}`, hasError: true, errorMsg: '✨ المهارة وصلت للحد الأقصى عند اللاعب!' }, [getReturnRow()]);

    const reqs = getUpgradeRequirements(currentLevel, true);
    
    const detailedReqs = reqs.materials.map(r => {
        return { id: r.tier, count: 0, userCount: 9999, name: 'موارد الأونر اللانهائية', rarity: 'Legendary', iconUrl: 'https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev/images/mora.png' };
    });

    const btnRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`admin_forge_upgrade_skill_${skillId}`).setLabel('صقل المهارة 📜 (مجاني)').setStyle(ButtonStyle.Success),
        getReturnRow().components[0]
    );
    
    return await replyWithCanvas(i, targetUser, 'skill', {
        mora: userMora, title: `صقل ${resolveText(configSkill.name)} (مسؤول)`, currentLevel, nextLevel: currentLevel + 1, currentStat: `${getSkillDisplayValue(configSkill, currentLevel)}${statSymbol}`, nextStat: `${getSkillDisplayValue(configSkill, currentLevel + 1)}${statSymbol}`, reqMora: 0, detailedReqs: detailedReqs
    }, [btnRow]);
}

async function handleSkillLearn(i, targetUser, guildId, db, skillId) {
    try {
        await db.query(`DELETE FROM user_skills WHERE "userID" = $1 AND "guildID" = $2 AND "skillID" = $3`, [targetUser.id, guildId, skillId]);
        await db.query(`INSERT INTO user_skills ("userID", "guildID", "skillID", "skillLevel") VALUES ($1, $2, $3, 1)`, [targetUser.id, guildId, skillId]);
    } catch(e) {
        await db.query(`DELETE FROM user_skills WHERE userid = $1 AND guildid = $2 AND skillid = $3`, [targetUser.id, guildId, skillId]).catch(()=>{});
        await db.query(`INSERT INTO user_skills (userid, guildid, skillid, skilllevel) VALUES ($1, $2, $3, 1)`, [targetUser.id, guildId, skillId]).catch(()=>{});
    }
    
    await buildSkillUpgradeUI(i, targetUser, guildId, db, skillId);
}

async function handleSkillUpgrade(i, targetUser, guildId, db, skillId) {
    const [skillRes] = await Promise.all([
        safeQuery(db, `SELECT * FROM user_skills WHERE "userID" = $1 AND "guildID" = $2 AND "skillID" = $3`, [targetUser.id, guildId, skillId])
    ]);

    const currentLevel = Number(skillRes.rows[0].skillLevel || skillRes.rows[0].skilllevel);
    const configSkill = skillsConfig.find(sc => sc.id === skillId) || skillsConfig[0];

    try {
        await db.query(`UPDATE user_skills SET "skillLevel" = "skillLevel" + 1 WHERE "userID" = $1 AND "guildID" = $2 AND "skillID" = $3`, [targetUser.id, guildId, skillId]);
    } catch(e) {
        await db.query(`UPDATE user_skills SET skilllevel = skilllevel + 1 WHERE userid = $1 AND guildid = $2 AND skillid = $3`, [targetUser.id, guildId, skillId]).catch(()=>{});
    }
    
    const statSymbol = configSkill.stat_type === '%' ? '%' : '';
    await replyWithCanvas(i, targetUser, 'success_skill', { title: `صقل ${resolveText(configSkill.name)}`, currentLevel: currentLevel, nextLevel: currentLevel + 1, nextStat: `${getSkillDisplayValue(configSkill, currentLevel + 1)}${statSymbol}` }, [getReturnRow()]);
}
