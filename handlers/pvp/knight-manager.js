const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags, Colors, AttachmentBuilder, ChannelType } = require("discord.js");
const path = require('path');
const { generatePvPImage } = require('../../generators/pvp-generator.js');
const { generatePvPResultImage } = require('../../generators/pvp-summary-generator.js');

let updateGuildStat;
try {
    ({ updateGuildStat } = require('../guild-board-handler.js'));
} catch (e) {}

const rootDir = process.cwd();
const weaponsConfig = require(path.join(rootDir, 'json', 'weapons-config.json'));
const skillsConfig = require(path.join(rootDir, 'json', 'skills-config.json'));

const BASE_HP = 800;       
const HP_PER_LEVEL = 60;   
const EMOJI_MORA = '<:mora:1435647151349698621>';

const KNIGHT_IMAGES = {
    MAIN: 'https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev/images/pvp/knight.png', 
    LOSE: 'https://i.postimg.cc/fb3F8nWQ/crusader-darkest-dungeon.gif'
};

const activePveBattles = new Map();
const activeKnightPlayers = new Set();

function cleanDisplayName(name) {
    if (!name) return "لاعب";
    return name.replace(/<a?:.+?:\d+>/g, '').trim();
}

function calculateSkillRawValue(skillConfig, currentLevel) {
    if (!skillConfig) return 0;
    const level = Math.max(1, currentLevel || 1);
    
    const base = skillConfig.base_value;
    const inc = skillConfig.value_increment;
    const isPercentage = skillConfig.stat_type === '%' || skillConfig.id.includes('heal') || skillConfig.id.includes('shield');

    if (level <= 15) {
        return Math.floor(base + (inc * (level - 1)));
    } else {
        const valueAt15 = base + (inc * 14);
        const targetValueAt30 = isPercentage ? 70 : 200; 
        const levelsRemaining = 15;
        const dynamicIncrement = (targetValueAt30 - valueAt15) / levelsRemaining;
        
        let finalValue = valueAt15 + (dynamicIncrement * (level - 15));
        if (level >= 30) return targetValueAt30;
        return Math.floor(finalValue);
    }
}

async function getUserRace(member, db) {
    if (!member || !member.guild) return null;
    let allRaceRoles = [];
    try {
        const res = await db.query(`SELECT "roleID", "raceName" FROM race_roles WHERE "guildID" = $1`, [member.guild.id]);
        allRaceRoles = res.rows.map(r => ({ roleid: r.roleID, racename: r.raceName }));
    } catch (e) {
        const res = await db.query(`SELECT roleid, racename FROM race_roles WHERE guildid = $1`, [member.guild.id]).catch(()=>({rows:[]}));
        allRaceRoles = res.rows;
    }
    if (!member.roles || !member.roles.cache) return null;
    const userRoleIDs = member.roles.cache.map(r => r.id);
    return allRaceRoles.find(r => userRoleIDs.includes(r.roleid)) || null;
}

async function getWeaponData(db, member) {
    const userRace = await getUserRace(member, db);
    if (!userRace) return null;
    const weaponConfig = weaponsConfig.find(w => w.race === userRace.racename);
    if (!weaponConfig) return null;
    
    let userWeapon;
    try {
        const res = await db.query(`SELECT * FROM user_weapons WHERE "userID" = $1 AND "guildID" = $2 AND "raceName" = $3`, [member.id, member.guild.id, userRace.racename]);
        userWeapon = res.rows[0];
    } catch(e) {
        const res = await db.query(`SELECT * FROM user_weapons WHERE userid = $1 AND guildid = $2 AND racename = $3`, [member.id, member.guild.id, userRace.racename]).catch(()=>({rows:[]}));
        userWeapon = res.rows[0];
    }
    let weaponLevel = userWeapon ? Number(userWeapon.weaponLevel || userWeapon.weaponlevel) : 0;
    if (!weaponLevel || weaponLevel <= 0) return null;

    try {
        const buffRes = await db.query(`SELECT "multiplier" FROM user_buffs WHERE "userID" = $1 AND "guildID" = $2 AND "buffType" = 'hidden_weapon'`, [member.id, member.guild.id]);
        if (buffRes.rows.length > 0) {
            const hiddenLevel = Number(buffRes.rows[0].multiplier || buffRes.rows[0].Multiplier);
            if (hiddenLevel > 0) weaponLevel = hiddenLevel;
        }
    } catch(e) {}

    const base = weaponConfig.base_damage;
    const inc = weaponConfig.damage_increment;
    let damage = 15;

    if (weaponLevel <= 15) {
        damage = Math.floor(base + (inc * (weaponLevel - 1)));
    } else {
        const damageAt15 = base + (inc * 14);
        const targetDamageAt30 = 1000;
        const levelsRemaining = 15; 
        const dynamicIncrement = (targetDamageAt30 - damageAt15) / levelsRemaining;
        let finalDamage = damageAt15 + (dynamicIncrement * (weaponLevel - 15));
        damage = weaponLevel >= 30 ? targetDamageAt30 : Math.floor(finalDamage);
    }

    return { ...weaponConfig, currentDamage: damage, currentLevel: weaponLevel };
}

async function getAllSkillData(db, member) {
    const userRace = await getUserRace(member, db);
    const skillsOutput = {};
    let userSkillsData = [];
    try {
        const res = await db.query(`SELECT * FROM user_skills WHERE "userID" = $1 AND "guildID" = $2`, [member.id, member.guild.id]);
        userSkillsData = res.rows;
    } catch(e) {
        const res = await db.query(`SELECT * FROM user_skills WHERE userid = $1 AND guildid = $2`, [member.id, member.guild.id]).catch(()=>({rows:[]}));
        userSkillsData = res.rows;
    }
      
    if (userSkillsData) {
        for (const userSkill of userSkillsData) {
            const skillId = userSkill.skillID || userSkill.skillid;
            let skillLvl = Number(userSkill.skillLevel || userSkill.skilllevel);
            const skillConfig = skillsConfig.find(s => s.id === skillId);
            
            if (skillConfig && skillLvl > 0) {
                try {
                    const sBuffRes = await db.query(`SELECT "multiplier" FROM user_buffs WHERE "userID" = $1 AND "guildID" = $2 AND "buffType" = $3`, [member.id, member.guild.id, `hidden_skill_${skillId}`]);
                    if (sBuffRes.rows.length > 0) {
                        const hiddenSkillLevel = Number(sBuffRes.rows[0].multiplier || sBuffRes.rows[0].Multiplier);
                        if (hiddenSkillLevel > 0) skillLvl = hiddenSkillLevel;
                    }
                } catch(e) {}

                const effectValue = calculateSkillRawValue(skillConfig, skillLvl);
                skillsOutput[skillConfig.id] = { ...skillConfig, currentLevel: skillLvl, effectValue: effectValue };
            }
        }
    }

    if (userRace) {
        const raceSkillId = `race_${userRace.racename.toLowerCase().replace(/\s+/g, '_')}_skill`;
        const raceSkillConfig = skillsConfig.find(s => s.id === raceSkillId);
        if (raceSkillConfig && !skillsOutput[raceSkillId]) {
            skillsOutput[raceSkillId] = { ...raceSkillConfig, currentLevel: 1, effectValue: raceSkillConfig.base_value };
        }
    }
    return skillsOutput;
}

function calculateDamage(attacker, defender, multiplier = 1) {
    let baseDmg = attacker.weapon ? attacker.weapon.currentDamage : 15;
      
    if (attacker.effects.buff > 0) baseDmg *= (1 + attacker.effects.buff);
    if (attacker.effects.weaken > 0) baseDmg *= (1 - attacker.effects.weaken);

    let finalDmg = Math.floor(baseDmg * multiplier);

    if (defender.effects.evasion > 0) return 0;

    if (defender.effects.shield > 0) {
        if (defender.effects.shield >= finalDmg) {
            defender.effects.shield -= finalDmg;
            finalDmg = 0;
        } else {
            finalDmg -= defender.effects.shield;
            defender.effects.shield = 0;
        }
    }

    if (defender.effects.rebound_active > 0) {
        const reflectedDmg = Math.floor(finalDmg * defender.effects.rebound_active);
        attacker.hp -= reflectedDmg;
        finalDmg -= reflectedDmg;
    }

    return Math.max(0, finalDmg);
}

function checkShieldBreak(battleState, defenderId) {
    const defender = battleState.players.get(defenderId);
      
    if (defender.effects.shield <= 0 && defender.effects.shield_source) {
        const skillId = defender.effects.shield_source;
        const cooldownDuration = defender.effects.shield_cd_duration || 4; 

        if (!battleState.skillCooldowns[defenderId]) battleState.skillCooldowns[defenderId] = {};
        battleState.skillCooldowns[defenderId][skillId] = cooldownDuration;

        defender.effects.shield_source = null;
        defender.effects.shield_cd_duration = 0;
        defender.effects.shield = 0; 

        return `💔 **انكسر درع ${defender.isMonster ? defender.name : cleanDisplayName(defender.member.user.displayName)}**! (بدأ الكولداون)`;
    }
    return null;
}

function applyPersistentEffects(battleState, attackerId) {
    const attacker = battleState.players.get(attackerId);
    let logEntries = [];
    let skipTurn = false;

    const effectsList = ['buff', 'weaken', 'rebound_active', 'stun', 'confusion', 'evasion', 'blind'];
    effectsList.forEach(eff => {
        if (attacker.effects[eff + '_turns'] > 0) {
            attacker.effects[eff + '_turns']--;
            if (attacker.effects[eff + '_turns'] <= 0) {
                if (typeof attacker.effects[eff] === 'boolean') attacker.effects[eff] = false;
                else attacker.effects[eff] = 0;
            }
        }
    });

    if (attacker.effects.poison > 0) {
        attacker.hp -= attacker.effects.poison;
        logEntries.push(`☠️ ${attacker.isMonster ? attacker.name : cleanDisplayName(attacker.member.user.displayName)} يتألم من السم (-${attacker.effects.poison})!`);
        attacker.effects.poison_turns--;
        if (attacker.effects.poison_turns <= 0) attacker.effects.poison = 0;
    }

    if (attacker.effects.burn > 0) {
        attacker.hp -= attacker.effects.burn;
        logEntries.push(`🔥 ${attacker.isMonster ? attacker.name : cleanDisplayName(attacker.member.user.displayName)} يحترق (-${attacker.effects.burn})!`);
        attacker.effects.burn_turns--;
        if (attacker.effects.burn_turns <= 0) attacker.effects.burn = 0;
    }

    if (attacker.effects.stun) {
        logEntries.push(`⚡ ${attacker.isMonster ? attacker.name : cleanDisplayName(attacker.member.user.displayName)} مشلول ولا يستطيع الحركة!`);
        skipTurn = true;
    }

    return { logEntries, skipTurn };
}

function applySkillEffect(battleState, attackerId, skill) {
    const attacker = battleState.players.get(attackerId);
    const defenderId = Array.from(battleState.players.keys()).find(id => id !== attackerId);
    const defender = battleState.players.get(defenderId);

    let cooldownDuration = 3; 
    if (skill.id === 'skill_healing') cooldownDuration = 6;
    else if (skill.id.startsWith('race_')) cooldownDuration = 5;

    const shieldSkills = ['skill_shielding', 'Cleanse_Buff_Shield', 'Reflect_Tank', 'Lifesteal_Overheal'];
    const isShieldSkill = shieldSkills.includes(skill.id) || (skill.id === 'Lifesteal_Overheal' && (attacker.maxHp - attacker.hp) < (attacker.weapon.currentDamage * 0.6));

    if (isShieldSkill && attacker.effects.shield > 0) {
        return `🚫 **${attacker.isMonster ? attacker.name : attacker.member.displayName}** حاول تفعيل درع لكن لديه درع نشط بالفعل!`;
    }

    if (!battleState.skillCooldowns[attackerId]) battleState.skillCooldowns[attackerId] = {};
      
    if (isShieldSkill) {
        attacker.effects.shield_source = skill.id;
        attacker.effects.shield_cd_duration = cooldownDuration;
    } else {
        battleState.skillCooldowns[attackerId][skill.id] = cooldownDuration;
    }

    const effectValue = skill.effectValue;
    const statType = skill.stat_type;
    const skillLevel = skill.currentLevel || 1; 

    let baseAtk = attacker.weapon ? attacker.weapon.currentDamage : 15;
    if (attacker.effects.buff > 0) baseAtk *= (1 + attacker.effects.buff);
    if (attacker.effects.weaken > 0) baseAtk *= (1 - attacker.effects.weaken);

    switch (statType) {
        case 'Gamble_Dmg': {
            if (Math.random() < 0.5) {
                const minDmg = 777;
                const maxDmg = 2222;
                const dmgAmount = Math.floor(Math.random() * (maxDmg - minDmg + 1)) + minDmg;
                defender.hp -= dmgAmount;
                return `🎲 **${attacker.isMonster ? attacker.name : attacker.member.displayName}** غامر وربح! سدد **${dmgAmount}** ضرر!`;
            } else {
                const minFail = 100;
                const maxFail = 200;
                const failDmg = Math.floor(Math.random() * (maxFail - minFail + 1)) + minFail;
                const selfDmg = Math.floor(attacker.hp * 0.03); 
                defender.hp -= failDmg;
                attacker.hp -= selfDmg;
                return `🎲 **${attacker.isMonster ? attacker.name : attacker.member.displayName}** خسر الرهان... خدش الخصم بـ **${failDmg}** وأذى نفسه بـ **${selfDmg}**!`;
            }
        }
        case 'Spirit_RNG': {
            const spiritDmg = Math.floor(baseAtk * 1.3);
            defender.hp -= spiritDmg;
            const roll = Math.random() * 100; 
            let effectMsg = "";
            if (roll < 2) { 
                defender.effects.stun = true; defender.effects.stun_turns = 1; effectMsg = "😱 **لعنة الرعب!** (شلل)";
            } else if (roll < 7) { 
                attacker.effects.rebound_active = 1.0; attacker.effects.rebound_turns = 2; effectMsg = "👻 **تلبس!** (عكس الضرر القادم)";
            } else if (roll < 57) { 
                attacker.effects.buff = (attacker.effects.buff || 0) + 0.15; attacker.effects.buff_turns = 3;
                defender.effects.weaken = (defender.effects.weaken || 0) + 0.15; defender.effects.weaken_turns = 3;
                effectMsg = "💀 **سرقة الروح!** (امتصاص القوة)";
            } else { effectMsg = "(هجوم طيفي)"; }
            return `👻 **${cleanDisplayName(attacker.member.user.displayName)}** أطلق طيفاً! سبب **${spiritDmg}** ضرر + ${effectMsg}`;
        }
        case 'TrueDMG_Burn': {
            const burnDmg = Math.floor(baseAtk * 0.2);
            defender.effects.burn = burnDmg; defender.effects.burn_turns = 3;
            const dmg = Math.floor(baseAtk * 1.4); defender.hp -= dmg;
            return `🐲 **${attacker.isMonster ? attacker.name : attacker.member.displayName}** أحرق خصمه! (${dmg} ضرر + حرق)`;
        }
        case 'Cleanse_Buff_Shield': {
            attacker.effects.poison = 0; attacker.effects.poison_turns = 0;
            attacker.effects.burn = 0; attacker.effects.burn_turns = 0;
            attacker.effects.weaken = 0; attacker.effects.weaken_turns = 0;
            attacker.effects.stun = false; attacker.effects.stun_turns = 0;
            attacker.effects.confusion = false; attacker.effects.confusion_turns = 0;
            attacker.effects.blind = 0; attacker.effects.blind_turns = 0;
            const shieldVal = Math.floor(attacker.maxHp * (effectValue / 100));
            attacker.effects.shield += shieldVal;
            attacker.effects.buff = 0.2; attacker.effects.buff_turns = 2;
            attacker.effects.shield_source = skill.id; 
            attacker.effects.shield_cd_duration = cooldownDuration;
            return `⚔️ **${attacker.isMonster ? attacker.name : attacker.member.displayName}** طهر نفسه واكتسب درعاً وقوة!`;
        }
        case 'Scale_MissingHP_Heal': {
            const missingHpPercent = (attacker.maxHp - attacker.hp) / attacker.maxHp;
            const extraDmg = Math.floor(baseAtk * missingHpPercent * 2);
            const dmg = Math.floor(baseAtk * 1.2) + extraDmg;
            defender.hp -= dmg;
            const healVal = Math.floor(attacker.maxHp * (effectValue / 100));
            attacker.hp = Math.min(attacker.maxHp, attacker.hp + healVal);
            return `⚖️ **${attacker.isMonster ? attacker.name : attacker.member.displayName}** عاقب خصمه بضرر متصاعد (${dmg}) وشفى نفسه!`;
        }
        case 'Sacrifice_Crit': {
            const selfDmg = Math.floor(attacker.maxHp * 0.10);
            attacker.hp -= selfDmg;
            const dmg = Math.floor(baseAtk * 2.0);
            defender.hp -= dmg;
            return `👹 **${attacker.isMonster ? attacker.name : attacker.member.displayName}** ضحى بدمه لتوجيه ضربة مدمرة (${dmg})!`;
        }
        case 'Stun_Vulnerable': {
            const dmg = Math.floor(baseAtk * 1.1);
            defender.hp -= dmg;
            defender.effects.stun = true; defender.effects.stun_turns = 1;
            defender.effects.weaken = 0.5; defender.effects.weaken_turns = 2;
            return `🍃 **${attacker.isMonster ? attacker.name : attacker.member.displayName}** شل حركة الخصم وجعله هشاً!`;
        }
        case 'Confusion': {
            const dmg = Math.floor(baseAtk * 1.2);
            defender.hp -= dmg;
            defender.effects.confusion = true; defender.effects.confusion_turns = 2;
            return `😵 **${attacker.isMonster ? attacker.name : attacker.member.displayName}** أربك خصمه بلعنة الجنون!`;
        }
        case 'Lifesteal_Overheal': {
            const dmg = Math.floor(baseAtk * 1.45); 
            defender.hp -= dmg;

            const bleedDmg = 100 + (skillLevel * 50);
            defender.effects.burn = bleedDmg; 
            defender.effects.burn_turns = 2;

            const healVal = Math.floor(dmg * (effectValue / 100));
            const missingHp = attacker.maxHp - attacker.hp;
            if (healVal > missingHp) {
                attacker.hp = attacker.maxHp;
                const shieldAdd = Math.floor((healVal - missingHp) * 0.5);
                attacker.effects.shield += shieldAdd;
                attacker.effects.shield_source = skill.id;
                attacker.effects.shield_cd_duration = cooldownDuration;
                return `🍷 **${attacker.isMonster ? attacker.name : attacker.member.displayName}** نهش خصمه مسبباً نزيفاً وحول الفائض لدرع!`;
            }
            attacker.hp += healVal;
            battleState.skillCooldowns[attackerId][skill.id] = cooldownDuration;
            attacker.effects.shield_source = null;
            return `🍷 **${attacker.isMonster ? attacker.name : attacker.member.displayName}** امتص ${healVal} HP وسبب نزيفاً للخصم!`;
        }
        case 'Chaos_RNG': {
            const dmg = Math.floor(baseAtk * 1.2);
            defender.hp -= dmg;
            const randomEffect = Math.random();
            let effectMsg = "";
            if (randomEffect < 0.25) { defender.effects.burn = Math.floor(baseAtk * 0.2); defender.effects.burn_turns = 3; effectMsg = "حرق"; }
            else if (randomEffect < 0.50) { defender.effects.weaken = 0.3; defender.effects.weaken_turns = 2; effectMsg = "إضعاف"; }
            else if (randomEffect < 0.75) { defender.effects.confusion = true; defender.effects.confusion_turns = 2; effectMsg = "ارتباك"; }
            else { defender.effects.poison = Math.floor(baseAtk * 0.15); defender.effects.poison_turns = 3; effectMsg = "سم"; }
            return `🌀 **${attacker.isMonster ? attacker.name : attacker.member.displayName}** سبب فوضى (${effectMsg})!`;
        }
        case 'Dmg_Evasion': {
            const dmg = Math.floor(baseAtk * 1.3);
            defender.hp -= dmg;
            attacker.effects.evasion = 1; attacker.effects.evasion_turns = 1;
            return `👻 **${attacker.isMonster ? attacker.name : attacker.member.displayName}** ضرب واختفى (مراوغة تامة)!`;
        }
        case 'Reflect_Tank': {
            attacker.effects.shield += Math.floor(attacker.maxHp * (effectValue / 100));
            attacker.effects.rebound_active = 0.4; attacker.effects.rebound_turns = 2;
            attacker.effects.shield_source = skill.id;
            attacker.effects.shield_cd_duration = cooldownDuration;
            return `🔨 **${attacker.isMonster ? attacker.name : attacker.member.displayName}** تحصن بالجبل (دفاع وعكس ضرر)!`;
        }
        case 'Execute_Heal': {
            const dmg = Math.floor(baseAtk * 1.6);
            if (defender.hp - dmg <= 0) {
                defender.hp = 0;
                attacker.hp = Math.min(attacker.maxHp, attacker.hp + Math.floor(attacker.maxHp * 0.25));
                return `🥩 **${attacker.isMonster ? attacker.name : attacker.member.displayName}** افترس خصمه واستعاد صحته!`;
            }
            defender.hp -= dmg;
            return `🧟 **${attacker.isMonster ? attacker.name : attacker.member.displayName}** نهش خصمه بضرر وحشي!`;
        }
        default:
            switch (skill.id) {
                case 'skill_shielding': 
                    attacker.effects.shield += Math.floor(attacker.maxHp * (effectValue / 100)); 
                    attacker.effects.shield_source = skill.id;
                    attacker.effects.shield_cd_duration = cooldownDuration;
                    return `🛡️ **${attacker.isMonster ? attacker.name : attacker.member.displayName}** اكتسب درعاً!`;
                case 'skill_buffing': attacker.effects.buff = effectValue / 100; attacker.effects.buff_turns = 3; return `💪 **${attacker.isMonster ? attacker.name : attacker.member.displayName}** رفع قوته!`;
                case 'skill_rebound': attacker.effects.rebound_active = effectValue / 100; attacker.effects.rebound_turns = 3; return `🔄 **${attacker.isMonster ? attacker.name : attacker.member.displayName}** جهز الانعكاس!`;
                case 'skill_healing': const heal = Math.floor(attacker.maxHp * (effectValue / 100)); attacker.hp = Math.min(attacker.maxHp, attacker.hp + heal); return `💖 **${attacker.isMonster ? attacker.name : attacker.member.displayName}** استعاد ${heal} HP!`;
                case 'skill_poison': defender.effects.poison = Math.floor(baseAtk * (effectValue / 100)); defender.effects.poison_turns = 3; return `☠️ **${attacker.isMonster ? attacker.name : attacker.member.displayName}** سمم خصمه!`;
                case 'skill_weaken': defender.effects.weaken = effectValue / 100; defender.effects.weaken_turns = 3; return `📉 **${attacker.isMonster ? attacker.name : attacker.member.displayName}** أضعف خصمه!`;
                case 'skill_dispel': defender.effects = { shield: 0, buff: 0, buff_turns: 0, weaken: 0, weaken_turns: 0, poison: 0, poison_turns: 0, rebound_active: 0, rebound_turns: 0, penetrate: 0, burn: 0, burn_turns: 0, stun: false, stun_turns: 0, confusion: false, confusion_turns: 0, evasion: 0, evasion_turns: 0, blind: 0, blind_turns: 0 }; return `💨 **${attacker.isMonster ? attacker.name : attacker.member.displayName}** بدد كل سحر الخصم!`;
                case 'skill_cleanse': 
                    attacker.effects.poison = 0; attacker.effects.poison_turns = 0; attacker.effects.burn = 0; attacker.effects.burn_turns = 0;
                    attacker.effects.weaken = 0; attacker.effects.weaken_turns = 0; attacker.effects.stun = false; attacker.effects.stun_turns = 0;
                    attacker.effects.confusion = false; attacker.effects.confusion_turns = 0; attacker.effects.blind = 0; attacker.effects.blind_turns = 0;
                    return `✨ **${attacker.isMonster ? attacker.name : attacker.member.displayName}** طهر نفسه من اللعنات!`;
                default: const d = calculateDamage(attacker, defender, skill.stat_type === '%' ? 1.5 : 1); defender.hp -= d; return `💥 **${attacker.isMonster ? attacker.name : attacker.member.displayName}** استخدم ${skill.name} وسبب ${d} ضرر!`;
            }
    }
}

function executeGuardLogic(battleState, player, guard, playerId) {
    const playerCooldowns = battleState.skillCooldowns[playerId];
    if (playerCooldowns) {
        for (const skillId in playerCooldowns) {
            if (playerCooldowns[skillId] > 0) playerCooldowns[skillId]--;
        }
    }

    const { logEntries, skipTurn } = applyPersistentEffects(battleState, "guard");
    if (logEntries.length > 0) battleState.log.push(...logEntries);

    if (guard.hp <= 0) return; 

    if (skipTurn) {
        battleState.log.push(`💤 **فارس الإمبراطور** مشلول ولا يستطيع الحركة!`);
        return;
    }

    let actionLog = "";
      
    if (guard.hp < guard.maxHp * 0.30 && guard.effects.blood_liturgy_used < 5) {
        const drainDmg = Math.floor(guard.weapon.currentDamage * 1.5); 
        player.hp -= drainDmg;
        const healAmt = Math.max(Math.floor(drainDmg * 0.8), Math.floor(guard.maxHp * 0.15));
        guard.hp = Math.min(guard.maxHp, guard.hp + healAmt);
        guard.effects.blood_liturgy_used++; 
        actionLog = `🩸 **فارس الإمبراطور** استخدم "قداس الدم"! امتص **${drainDmg}** من صحتك وشفى نفسه (+${healAmt})!`;
        const breakMsg = checkShieldBreak(battleState, playerId);
        if (breakMsg) actionLog += `\n${breakMsg}`;
    }
    else if (guard.hp < guard.maxHp * 0.50 && guard.effects.potions_used < 5) {
        const healAmount = Math.floor(guard.maxHp * 0.25); 
        guard.hp = Math.min(guard.maxHp, guard.hp + healAmount);
        const shieldAmt = Math.floor(guard.maxHp * 0.10);
        guard.effects.shield += shieldAmt;
        guard.effects.potions_used++; 
        actionLog = `🧪 **فارس الإمبراطور** شرب جرعة طوارئ واستعاد **${healAmount}** HP واكتسب درعاً!`;
    }
    else if (player.hp < player.maxHp * 0.20) {
        const dmg = calculateDamage(guard, player, 1.5);
        player.hp -= dmg;
        actionLog = `💀 **فارس الإمبراطور** رأى ضعفك واستخدم "إعدام"! سبب **${dmg}** ضرر!`;
        const breakMsg = checkShieldBreak(battleState, playerId);
        if (breakMsg) actionLog += `\n${breakMsg}`;
    }
    else if (player.effects.shield > 0) {
        const dmg = calculateDamage(guard, player, 1.3); 
        player.hp -= dmg;
        actionLog = `🔨 **فارس الإمبراطور** سدد ضربة ثقيلة لتحطيم درعك! سبب **${dmg}** ضرر!`;
        const breakMsg = checkShieldBreak(battleState, playerId);
        if (breakMsg) actionLog += `\n${breakMsg}`;
    }
    else if (player.effects.buff > 0 && Math.random() < 0.20) {
        guard.effects.rebound_active = 0.5; 
        guard.effects.rebound_turns = 1;
        actionLog = `🛡️ **فارس الإمبراطور** يتخذ وضعية "انعكاس الضرر"!`;
    }
    else {
        let multiplier = player.effects.buff > 0 ? 1.1 : 1.0;
        const dmg = calculateDamage(guard, player, multiplier);
        player.hp -= dmg;
        const breakMsg = checkShieldBreak(battleState, playerId);
        if (breakMsg) actionLog += `${breakMsg}\n`;

        if (Math.random() < 0.2) {
            player.effects.burn = Math.floor(guard.weapon.currentDamage * 0.1);
            player.effects.burn_turns = 2;
            actionLog += `⚔️ **فارس الإمبراطور** جرحك وسـبب نزيفاً! (**${dmg}** ضرر)`;
        } else {
            actionLog += `⚔️ **فارس الإمبراطور** هاجمك وسبب **${dmg}** ضرر!`;
        }
    }

    battleState.log.push(actionLog);
}

async function renderBattleFrame(battleState) {
    const attackerId = battleState.turn[0]; 
    
    const mainButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('knight_attack').setLabel('هـجـوم').setStyle(ButtonStyle.Danger).setEmoji('⚔️'),
        new ButtonBuilder().setCustomId('knight_skill_menu').setLabel('مـهــارات').setStyle(ButtonStyle.Primary).setEmoji('✨')
    );

    const imgBuffer = await generatePvPImage(battleState);
    const attachment = imgBuffer ? new AttachmentBuilder(imgBuffer, { name: 'knight_battle.png' }) : null;

    return { 
        content: `**قـاتـل لتنجـو بحيـاتـك!** <@${attackerId}>`, 
        files: attachment ? [attachment] : [], 
        components: [mainButtons],
        embeds: [] 
    };
}

function setupBattleCollector(battleState) {
    const playerId = battleState.turn[0]; 
    const filter = i => i.user.id === playerId && i.customId.startsWith('knight_');
     
    const collector = battleState.message.createMessageComponentCollector({ 
        filter, 
        componentType: ComponentType.Button, 
        idle: 300000 
    });

    collector.on('collect', async i => {
        if (battleState.processingTurn) {
            return i.reply({ content: '⏳ انتظر دورك...', flags: [MessageFlags.Ephemeral] }).catch(()=>{});
        }

        try {
            const customId = i.customId;
            const player = battleState.players.get(i.user.id);
            const guard = battleState.players.get("guard");

            // 🔥 القائمة المخفية للمهارات 🔥
            if (customId === 'knight_skill_menu') {
                const userSkills = player.skills || {};
                const availableSkills = Object.values(userSkills).filter(s => s.currentLevel > 0 || s.id.startsWith('race_'));
                
                if (availableSkills.length === 0) {
                    return await i.reply({ content: 'لا تمتلك أي مهارات حالياً!', flags: [MessageFlags.Ephemeral] });
                }

                const cooldowns = battleState.skillCooldowns[i.user.id] || {};
                const skillRows = [];
                let currentRow = new ActionRowBuilder();

                availableSkills.forEach((skill, index) => {
                    const isOnCooldown = (cooldowns[skill.id] || 0) > 0;
                    const label = isOnCooldown ? `${skill.name} (${cooldowns[skill.id]})` : skill.name;
                    const btn = new ButtonBuilder()
                        .setCustomId(`knight_skill_use_${skill.id}`)
                        .setLabel(label)
                        .setEmoji(skill.emoji || '✨')
                        .setStyle(isOnCooldown ? ButtonStyle.Secondary : ButtonStyle.Primary)
                        .setDisabled(isOnCooldown);
                    
                    currentRow.addComponents(btn);
                    if (currentRow.components.length === 5 || index === availableSkills.length - 1) {
                        skillRows.push(currentRow);
                        currentRow = new ActionRowBuilder();
                    }
                });

                const skillMsg = await i.reply({ content: '✨ **اختر المهارة التي تريد استخدامها:**', components: skillRows, flags: [MessageFlags.Ephemeral], fetchReply: true });
                
                try {
                    const skillInteraction = await skillMsg.awaitMessageComponent({ filter: btnI => btnI.user.id === i.user.id, time: 30000 });
                    await skillInteraction.update({ content: '⏳ جاري تنفيذ المهارة...', components: [] }).catch(()=>{});
                    
                    battleState.processingTurn = true;
                    
                    const skillId = skillInteraction.customId.replace('knight_skill_use_', '');
                    const skillData = player.skills[skillId];

                    if (skillData) {
                        battleState.log = []; 
                        const { logEntries: pLog, skipTurn: pSkip } = applyPersistentEffects(battleState, playerId);
                        if (pLog.length > 0) battleState.log.push(...pLog);

                        if (player.hp <= 0) {
                            return await handleGuardBattleEnd(battleState, "guard", "lose");
                        }

                        if (pSkip) {
                            battleState.log.push(`⚡ أنت مشلول، لا يمكنك الحركة هذا الدور!`);
                        } else {
                            const logMsg = applySkillEffect(battleState, i.user.id, skillData);
                            battleState.log.push(logMsg);
                            const breakMsg = checkShieldBreak(battleState, "guard");
                            if (breakMsg) battleState.log.push(breakMsg);
                        }

                        if (guard.hp <= 0) {
                            return await handleGuardBattleEnd(battleState, playerId, "win");
                        }

                        executeGuardLogic(battleState, player, guard, playerId);

                        if (player.hp <= 0) {
                            return await handleGuardBattleEnd(battleState, "guard", "lose");
                        }

                        battleState.processingTurn = false;
                        const nextPayload = await renderBattleFrame(battleState);
                        await battleState.message.edit(nextPayload).catch(()=>{});
                    }
                } catch (err) {
                    await i.editReply({ content: '⏱️ انتهى وقت اختيار المهارة.', components: [] }).catch(()=>{});
                }
                return;
            }

            // 🔥 الهجوم العادي 🔥
            if (customId === 'knight_attack') {
                await i.deferUpdate().catch(()=>{});
                battleState.processingTurn = true; 

                battleState.log = []; 
                
                const { logEntries: pLog, skipTurn: pSkip } = applyPersistentEffects(battleState, playerId);
                if (pLog.length > 0) battleState.log.push(...pLog);

                if (player.hp <= 0) {
                    return await handleGuardBattleEnd(battleState, "guard", "lose");
                }

                if (pSkip) {
                    battleState.log.push(`⚡ أنت مشلول، لا يمكنك الحركة هذا الدور!`);
                } else {
                    const dmg = calculateDamage(player, guard);
                    guard.hp -= dmg;
                    battleState.log.push(`⚔️ **${cleanDisplayName(player.member.user.displayName)}** هاجم الفارس وسبب **${dmg}** ضرر!`);
                    const breakMsg = checkShieldBreak(battleState, "guard");
                    if (breakMsg) battleState.log.push(breakMsg);
                }

                if (guard.hp <= 0) {
                    return await handleGuardBattleEnd(battleState, playerId, "win");
                }

                executeGuardLogic(battleState, player, guard, playerId);

                if (player.hp <= 0) {
                    return await handleGuardBattleEnd(battleState, "guard", "lose");
                }

                battleState.processingTurn = false;
                const nextPayload = await renderBattleFrame(battleState);
                await battleState.message.edit(nextPayload).catch(()=>{});
            }

        } catch (error) {
            console.error("Collector Logic Error:", error);
            battleState.processingTurn = false;
        }
    });

    collector.on('end', (collected, reason) => {
        if ((reason === 'time' || reason === 'idle') && !battleState.isEnded) {
            handleGuardBattleEnd(battleState, "guard", "lose");
        }
    });
}

async function startKnightBattle(interaction, client, db, robberMember, amountToSteal) {
    try {
        if (activeKnightPlayers.has(robberMember.id)) {
            const errPayload = { content: "❌ أنت تقاتل الفارس بالفعل! ركز في معركتك!", flags: [MessageFlags.Ephemeral] };
            if (interaction.isRepliable && !interaction.replied) return await interaction.reply(errPayload).catch(()=>{});
            else return await interaction.channel.send(`❌ <@${robberMember.id}> أنت تقاتل الفارس بالفعل!`).catch(()=>{});
        }
        activeKnightPlayers.add(robberMember.id);

        let robberData;
        try {
            const getLevelRes = await db.query(`SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2`, [robberMember.id, interaction.guild.id]);
            robberData = getLevelRes.rows[0];
        } catch(e) {
            const getLevelRes = await db.query(`SELECT * FROM levels WHERE userid = $1 AND guildid = $2`, [robberMember.id, interaction.guild.id]).catch(()=>({rows:[]}));
            robberData = getLevelRes.rows[0];
        }
        if (!robberData) robberData = { user: robberMember.id, guild: interaction.guild.id, level: 0, mora: 0, bank: 0 };
        
        const pMaxHp = BASE_HP + ((Number(robberData.level) || 0) * HP_PER_LEVEL);
        let robberWeapon = await getWeaponData(db, robberMember);
        if (!robberWeapon || robberWeapon.currentLevel === 0) robberWeapon = { name: "قبضة يد", currentDamage: 15 };
        const robberSkills = await getAllSkillData(db, robberMember);
        
        const playerRaceObj = await getUserRace(robberMember, db);
        const pRaceName = playerRaceObj ? (playerRaceObj.raceName || playerRaceObj.racename) : 'بشري';

        const nowKSA = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Riyadh" }));
        const todayInt = parseInt(nowKSA.toLocaleDateString('en-CA').replace(/-/g, ''));
        const userId = robberMember.id;
        const guildId = interaction.guild.id;
        const historyId = `${userId}-${guildId}`;

        await db.query(`CREATE TABLE IF NOT EXISTS knight_history ("id" TEXT PRIMARY KEY, "count" INTEGER, "lastDate" BIGINT)`).catch(()=>{});
        const historyRes = await db.query(`SELECT * FROM knight_history WHERE "id" = $1`, [historyId]);
        let history = historyRes.rows[0];
        let encounterCount = 1; 

        if (history) {
            const dbLastDate = Number(history.lastDate || history.lastdate) || 0;
            if (dbLastDate === todayInt) {
                encounterCount = Number(history.count) + 1; 
                await db.query(`UPDATE knight_history SET "count" = $1 WHERE "id" = $2`, [encounterCount, historyId]);
            } else {
                encounterCount = 1;
                await db.query(`UPDATE knight_history SET "count" = $1, "lastDate" = $2 WHERE "id" = $3`, [1, todayInt, historyId]);
            }
        } else {
            await db.query(`INSERT INTO knight_history ("id", "count", "lastDate") VALUES ($1, $2, $3)`, [historyId, 1, todayInt]);
        }

        const multiplier = encounterCount; 
        const guardMaxHp = Math.floor(pMaxHp * 1.8 * multiplier); 
        const atkMultiplier = 1.4 + ((multiplier - 1) * 0.5); 
        const baseDmg = Math.floor(robberWeapon.currentDamage * atkMultiplier);
        const flatBonus = (multiplier - 1) * 20; 
        const finalGuardDmg = baseDmg + flatBonus;

        const guardWeapon = { name: `نصل الإمبراطور ${multiplier > 1 ? `(غضب x${multiplier})` : ''}`, currentDamage: finalGuardDmg };
        const initialShield = Math.floor(guardMaxHp * 0.1);

        const defEffects = () => ({ 
            shield: 0, buff: 0, buff_turns: 0, weaken: 0, weaken_turns: 0, 
            poison: 0, poison_turns: 0, burn: 0, burn_turns: 0, 
            rebound_active: 0, rebound_turns: 0, stun: false, stun_turns: 0, 
            confusion: false, confusion_turns: 0, evasion: 0, evasion_turns: 0, 
            blind: 0, blind_turns: 0, shield_source: null, shield_cd_duration: 0,
            potions_used: 0,        
            blood_liturgy_used: 0   
        });
        
        const guardEffects = defEffects();
        guardEffects.shield = initialShield;

        let introMsg = `🛡️ **فارس الإمبراطور** يغلق الأبواب! "لن تخرج من هنا حياً!"`;
        if (multiplier > 1) introMsg = `🔥🛡️ **فارس الإمبراطور (غاضب x${multiplier})** يتذكر وجهك! "عدت للموت مجدداً؟ هذه المرة لن أرحمك!"`;

        const playerName = cleanDisplayName(robberMember.displayName || robberMember.user.username);
        const threadName = `🏰-قلعة-الإمبراطور-${playerName}`.substring(0, 100);
        let thread;
        let initMsg;

        const initPayload = { content: `🏰 **حراس القلعة يحاصرونك!** جاري تجهيز الساحة...` };
        
        try {
            if (interaction.isRepliable) {
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply(initPayload);
                    initMsg = await interaction.fetchReply();
                } else {
                    initMsg = await interaction.reply({ ...initPayload, fetchReply: true });
                }
            } else {
                initMsg = await interaction.channel.send(initPayload);
            }
            
            thread = await initMsg.startThread({ name: threadName, autoArchiveDuration: 60 });
        } catch(e) { 
            console.error("Thread Error:", e); 
            thread = interaction.channel;
        }
        
        if (thread.id !== interaction.channel.id) {
            try { await thread.members.add(robberMember.id); } catch(e){}
            await initMsg.edit(`🏰 **حراس القلعة يحاصرونك!** انتقل إلى الساحة: <#${thread.id}>`).catch(()=>{});
        }

        const battleState = {
            isPvE: true, isGuardBattle: true, amountToSteal,
            thread: thread, message: null, turn: [robberMember.id, "guard"], processingTurn: false,
            isEnded: false, log: [introMsg], client: client, guildId: interaction.guild.id,
            skillPage: 0, skillCooldowns: { [robberMember.id]: {}, "guard": {} },
            players: new Map([
                [robberMember.id, { 
                    isMonster: false, member: robberMember, hp: pMaxHp, maxHp: pMaxHp, 
                    weapon: robberWeapon, damage: robberWeapon.currentDamage, skills: robberSkills, effects: defEffects(), raceName: pRaceName 
                }],
                ["guard", { 
                    isMonster: true, name: `فـارس الإمبراطور ${multiplier > 1 ? `(x${multiplier})` : ''}`, 
                    hp: guardMaxHp, maxHp: guardMaxHp, weapon: guardWeapon, damage: guardWeapon.currentDamage, skills: {}, effects: guardEffects, raceName: 'زعيم', image: KNIGHT_IMAGES.MAIN 
                }]
            ])
        };

        activePveBattles.set(thread.id, battleState);
        
        const msgPayload = await renderBattleFrame(battleState);
        const sentMsg = await thread.send(msgPayload);
        
        battleState.message = sentMsg;
        setupBattleCollector(battleState);
        
    } catch (error) {
        console.error("Error starting knight battle:", error);
        activeKnightPlayers.delete(robberMember.id);
    }
}

async function handleGuardBattleEnd(battleState, winnerId, resultType) {
    if (battleState.isEnded) return;
    battleState.isEnded = true;

    try {
        const client = battleState.client;
        const db = client.db || client.sql; 
        const playerMemberId = Array.from(battleState.players.keys()).find(id => id !== "guard");
        const player = battleState.players.get(playerMemberId);
        
        activeKnightPlayers.delete(player.member.id);
        activePveBattles.delete(battleState.thread.id);

        let playerData;
        try {
            const getLevelRes = await db.query(`SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2`, [player.member.id, battleState.guildId]);
            playerData = getLevelRes.rows[0];
        } catch(e) {
            const getLevelRes = await db.query(`SELECT * FROM levels WHERE userid = $1 AND guildid = $2`, [player.member.id, battleState.guildId]).catch(()=>({rows:[]}));
            playerData = getLevelRes.rows[0];
        }
        if (!playerData) playerData = { mora: 0, bank: 0 };
        
        const amount = battleState.amountToSteal;
        let pMora = Number(playerData.mora) || 0;
        let pBank = Number(playerData.bank) || 0;

        if (resultType === "win") {
            try {
                const winRes = await db.query(`UPDATE levels SET "mora" = "mora" + $1 WHERE "user" = $2 AND "guild" = $3 RETURNING "mora"`, [amount, player.member.id, battleState.guildId]);
                pMora = winRes.rows[0] ? Number(winRes.rows[0].mora) : pMora + amount;
            } catch(e) {
                await db.query(`UPDATE levels SET mora = mora + $1 WHERE userid = $2 AND guildid = $3`, [amount, player.member.id, battleState.guildId]).catch(()=>{});
                pMora += amount;
            }

            if (typeof client.getLevel === 'function' && typeof client.setLevel === 'function') {
                let cache = await client.getLevel(player.member.id, battleState.guildId);
                if (cache) { cache.mora = pMora; await client.setLevel(cache); }
            }
            
            try { await db.query(`ALTER TABLE user_daily_stats ADD COLUMN "knights_defeated" INTEGER DEFAULT 0`); } catch(e) {}
            try { await db.query(`ALTER TABLE user_daily_stats ADD COLUMN "knight_badge_given" INTEGER DEFAULT 0`); } catch(e) {}

            const todayStr = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Riyadh" })).toLocaleDateString('en-CA');
            const dailyID = `${player.member.id}-${battleState.guildId}-${todayStr}`;
            
            try {
                await db.query(`
                    INSERT INTO user_daily_stats ("id", "userID", "guildID", "date", "knights_defeated") 
                    VALUES ($1, $2, $3, $4, 1) 
                    ON CONFLICT("id") DO UPDATE SET "knights_defeated" = COALESCE(user_daily_stats."knights_defeated", 0) + 1
                `, [dailyID, player.member.id, battleState.guildId, todayStr]);
            } catch(e) {}

            try {
                const dailyDataRes = await db.query(`SELECT "knights_defeated", "knight_badge_given" FROM user_daily_stats WHERE "id" = $1`, [dailyID]);
                const dailyData = dailyDataRes.rows[0];

                if (dailyData && Number(dailyData.knights_defeated) >= 4 && Number(dailyData.knight_badge_given) === 0) {
                    await db.query(`UPDATE user_daily_stats SET "knight_badge_given" = 1 WHERE "id" = $1`, [dailyID]);
                    
                    let settings;
                    try {
                        const settingsRes = await db.query(`SELECT "guildAnnounceChannelID", "roleKnightSlayer" FROM settings WHERE "guild" = $1`, [battleState.guildId]);
                        settings = settingsRes.rows[0];
                    } catch (e) {
                        const settingsRes = await db.query(`SELECT guildannouncechannelid, roleknightslayer FROM settings WHERE guild = $1`, [battleState.guildId]).catch(()=>({rows:[]}));
                        settings = settingsRes.rows[0];
                    }
                    
                    if (settings && (settings.roleKnightSlayer || settings.roleknightslayer)) {
                        player.member.roles.add(settings.roleKnightSlayer || settings.roleknightslayer).catch(()=>{});
                    }
                }
            } catch(e) {}

        } else {
            if (pMora >= amount) pMora -= amount;
            else {
                const remaining = amount - pMora;
                pMora = 0;
                pBank = Math.max(0, pBank - remaining);
            }

            try {
                const lossRes = await db.query(`UPDATE levels SET "mora" = GREATEST(0, CASE WHEN CAST(COALESCE("mora",'0') AS BIGINT) >= $1 THEN CAST(COALESCE("mora",'0') AS BIGINT) - $1 ELSE 0 END), "bank" = GREATEST(0, CASE WHEN CAST(COALESCE("mora",'0') AS BIGINT) >= $1 THEN CAST(COALESCE("bank",'0') AS BIGINT) ELSE CAST(COALESCE("bank",'0') AS BIGINT) - ($1 - CAST(COALESCE("mora",'0') AS BIGINT)) END) WHERE "user" = $2 AND "guild" = $3 RETURNING "mora", "bank"`, [amount, player.member.id, battleState.guildId]);
                if (lossRes.rows[0]) { pMora = Number(lossRes.rows[0].mora); pBank = Number(lossRes.rows[0].bank); }
            } catch(e) {
                await db.query(`UPDATE levels SET mora = $1, bank = $2 WHERE userid = $3 AND guildid = $4`, [pMora, pBank, player.member.id, battleState.guildId]).catch(()=>{});
            }

            if (typeof client.getLevel === 'function' && typeof client.setLevel === 'function') {
                let cache = await client.getLevel(player.member.id, battleState.guildId);
                if (cache) { cache.mora = pMora; cache.bank = pBank; await client.setLevel(cache); }
            }
        }

        const resultImgBuffer = await generatePvPResultImage(battleState, winnerId, resultType === "win" ? "S" : "F", amount, 0);
        const attachment = resultImgBuffer ? new AttachmentBuilder(resultImgBuffer, { name: 'knight_result.png' }) : null;

        const endContent = resultType === "win" 
            ? `🏆 **تمكنت من هزيمة فارس الإمبراطور والفرار بالغنيمة!** <@${player.member.id}>\n💰 **المبلغ المسروق:** ${amount.toLocaleString()} ${EMOJI_MORA}` 
            : `💀 **لقد سحقك الفارس وتم تغريمك ${amount.toLocaleString()} ${EMOJI_MORA}!** <@${player.member.id}>`;

        await battleState.message.edit({
            content: endContent,
            files: attachment ? [attachment] : [],
            components: [],
            embeds: []
        }).catch(() => {});

        // 🔥 التعديل هنا: يتم الحذف بعد 30 ثانية بالضبط 🔥
        if (battleState.thread && battleState.thread.id !== battleState.message.channel.id) {
            setTimeout(() => {
                try { battleState.thread.delete('انتهت المعركة مع الفارس').catch(()=>{}); } catch(e){}
            }, 30000); 
        }

    } catch (error) {
        console.error("End Game Error:", error);
    }
}

module.exports = { startKnightBattle, activePveBattles, activeKnightPlayers };
