const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, Colors, AttachmentBuilder, ChannelType } = require("discord.js");
const path = require('path');

let updateGuildStat;
try {
    ({ updateGuildStat } = require('./guild-board-handler.js'));
} catch (e) {}

let addXPAndCheckLevel;
try {
    ({ addXPAndCheckLevel } = require('./handler-utils.js'));
} catch (e) {}

let generatePvPImage;
try {
    ({ generatePvPImage } = require('../generators/pvp-generator.js'));
} catch (e) {
    generatePvPImage = null;
    console.log("⚠️ لم يتم العثور على محرك رسم الـ PvP. سيتم استخدام الإمبد القديم.");
}

const rootDir = process.cwd();
const weaponsConfig = require(path.join(rootDir, 'json', 'weapons-config.json'));
const skillsConfig = require(path.join(rootDir, 'json', 'skills-config.json'));

const WIN_IMAGES = [
    'https://i.postimg.cc/JhMrnyLd/download-1.gif',
    'https://i.postimg.cc/FHgv29L0/download.gif',
    'https://i.postimg.cc/9MzjRZNy/haru-midoriya.gif',
    'https://i.postimg.cc/4ygk8q3G/tumblr-nmao11Zm-Bx1r3rdh2o2-500-gif-500-281.gif',
    'https://i.postimg.cc/pL6NNpdC/Epic7-Epic-Seven-GIF-Epic7-Epic-Seven-Tensura-Discover-Share-GIFs.gif',
    'https://i.postimg.cc/05dLktNF/download-5.gif',
    'https://i.postimg.cc/sXRVMwhZ/download-2.gif'
];

const LOSE_IMAGES = [
    'https://i.postimg.cc/xd8msjxk/escapar-a-toda-velocidad.gif',
    'https://i.postimg.cc/1zb8JGVC/download.gif',
    'https://i.postimg.cc/rmSwjvkV/download-1.gif',
    'https://i.postimg.cc/8PyPZRqt/download.jpg'
];

const EMOJI_MORA = '<:mora:1435647151349698621>';

const BASE_HP = 800;       
const HP_PER_LEVEL = 60;   
const SKILL_COOLDOWN_TURNS = 3; 

const activePvpChallenges = new Set();
const activePvpBattles = new Map();
const activePveBattles = new Map();

function cleanDisplayName(name) {
    if (!name) return "لاعب";
    let clean = name.replace(/<a?:.+?:\d+>/g, '');
    clean = clean.replace(/[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD00-\uDFFF]/g, '');
    return clean.trim();
}

async function getUserRace(member, db) {
    if (!member || !member.guild) return null;
    const res = await db.query(`SELECT "roleID", "raceName" FROM race_roles WHERE "guildID" = $1`, [member.guild.id]);
    const allRaceRoles = res.rows;
    if (!member.roles || !member.roles.cache) return null;
    const userRoleIDs = member.roles.cache.map(r => r.id);
    return allRaceRoles.find(r => userRoleIDs.includes(r.roleID || r.roleid)) || null;
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

async function getWeaponData(db, member) {
    const userRace = await getUserRace(member, db);
    if (!userRace) return null;
    const raceName = userRace.raceName || userRace.racename;
    const weaponConfig = weaponsConfig.find(w => w.race.toLowerCase() === raceName.toLowerCase());
    if (!weaponConfig) return null;
    
    const res = await db.query(`SELECT * FROM user_weapons WHERE "userID" = $1 AND "guildID" = $2 AND LOWER("raceName") = LOWER($3)`, [member.id, member.guild.id, raceName]);
    let userWeapon = res.rows[0];
    if (!userWeapon || Number(userWeapon.weaponLevel || userWeapon.weaponlevel) <= 0) return null;
    
    let level = Number(userWeapon.weaponLevel || userWeapon.weaponlevel);
    const base = weaponConfig.base_damage;
    const inc = weaponConfig.damage_increment;
    let damage = 15;

    try {
        const buffRes = await db.query(`SELECT "multiplier" FROM user_buffs WHERE "userID" = $1 AND "guildID" = $2 AND "buffType" = 'hidden_weapon'`, [member.id, member.guild.id]);
        if (buffRes.rows.length > 0) {
            const hiddenLevel = Number(buffRes.rows[0].multiplier || buffRes.rows[0].Multiplier);
            if (hiddenLevel > 0) {
                level = hiddenLevel;
            }
        }
    } catch(e) {}

    if (level <= 15) {
        damage = Math.floor(base + (inc * (level - 1)));
    } else {
        const damageAt15 = base + (inc * 14);
        const targetDamageAt30 = 1000;
        const levelsRemaining = 15; 
        const dynamicIncrement = (targetDamageAt30 - damageAt15) / levelsRemaining;
        let finalDamage = damageAt15 + (dynamicIncrement * (level - 15));
        damage = level >= 30 ? targetDamageAt30 : Math.floor(finalDamage);
    }

    return { ...weaponConfig, currentDamage: damage, currentLevel: level };
}

async function getAllSkillData(db, member) {
    const userRace = await getUserRace(member, db);
    const skillsOutput = {};
    
    const res = await db.query(`SELECT * FROM user_skills WHERE "userID" = $1 AND "guildID" = $2`, [member.id, member.guild.id]);
    const userSkillsData = res.rows;
        
    let currentRaceSkillId = null;
    if (userRace) {
        const raceName = userRace.raceName || userRace.racename;
        currentRaceSkillId = `race_${raceName.toLowerCase().replace(/\s+/g, '_')}_skill`;
    }

    if (userSkillsData) {
        for (const userSkill of userSkillsData) {
            const skillId = userSkill.skillID || userSkill.skillid;
            const skillConfig = skillsConfig.find(s => s.id === skillId);
            let skillLvl = Number(userSkill.skillLevel || userSkill.skilllevel);
            
            if (skillConfig && skillLvl > 0) {
                if (skillId.startsWith('race_') && skillId !== currentRaceSkillId) {
                    continue; 
                }

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

    if (currentRaceSkillId) {
        const raceSkillConfig = skillsConfig.find(s => s.id === currentRaceSkillId);
        if (raceSkillConfig && !skillsOutput[currentRaceSkillId]) {
            skillsOutput[currentRaceSkillId] = { ...raceSkillConfig, currentLevel: 1, effectValue: raceSkillConfig.base_value };
        }
    }
    
    return skillsOutput;
}

async function getUserActiveSkill(db, userId, guildId) {
    const res = await db.query(`SELECT * FROM user_skills WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId]);
    const userSkills = res.rows;
    
    if (userSkills.length > 0) {
        let validSkills = userSkills.filter(s => {
            const sId = s.skillID || s.skillid;
            return !sId.startsWith('race_'); 
        });

        if (validSkills.length === 0) validSkills = userSkills;

        const randomSkillData = validSkills[Math.floor(Math.random() * validSkills.length)];
        const skillConfig = skillsConfig.find(s => s.id === (randomSkillData.skillID || randomSkillData.skillid));
        if (skillConfig) {
            const level = Number(randomSkillData.skillLevel || randomSkillData.skilllevel);
            const power = calculateSkillRawValue(skillConfig, level);
            return { name: skillConfig.name, level: level, damage: power };
        }
    }
    return null;
}

function buildHpBar(currentHp, maxHp) {
    currentHp = Math.max(0, currentHp);
    const percentage = (currentHp / Math.max(1, maxHp)) * 10;
    const filled = '█';
    const empty = '░';
    return `[${filled.repeat(Math.max(0, Math.floor(percentage))) + empty.repeat(Math.max(0, 10 - Math.floor(percentage)))}] ${currentHp}/${maxHp}`;
}

function buildEffectsString(effects) {
    let arr = [];
    if (effects.shield > 0) arr.push(`🛡️ (${effects.shield})`);
    if (effects.buff > 0) arr.push(`💪 (+${Math.round(effects.buff * 100)}%)`);
    if (effects.weaken > 0) arr.push(`📉 (-${Math.round(effects.weaken * 100)}%)`);
    if (effects.poison > 0) arr.push(`☠️ (${effects.poison})`);
    if (effects.burn > 0) arr.push(`🔥 (${effects.burn})`);
    if (effects.stun) arr.push(`⚡ (مشلول)`);
    if (effects.confusion) arr.push(`😵 (مرتبك)`);
    if (effects.rebound_active > 0) arr.push(`🔄 (${Math.round(effects.rebound_active * 100)}%)`);
    if (effects.evasion > 0) arr.push(`👻 (مراوغة)`);
    if (effects.blind > 0) arr.push(`🌫️ (أعمى)`);
    return arr.length > 0 ? arr.join(' | ') : 'لا يوجد';
}

function buildPvpSkillSelector(battleState) {
    const attackerId = battleState.turn[0];
    const attacker = battleState.players.get(attackerId);
    if (!attacker || attacker.isMonster) return null;

    const userSkills = attacker.skills || {};
    const availableSkills = Object.values(userSkills).filter(s => s.currentLevel > 0 || s.id.startsWith('race_'));
    if (availableSkills.length === 0) return null;

    const cooldowns = battleState.skillCooldowns[attackerId] || {};
    const options = [];

    availableSkills.forEach(skill => {
        const cd = cooldowns[skill.id] || 0;
        const cdText = cd > 0 ? `كولداون: ${cd} جولات` : `${skill.description || skill.name}`;

        options.push(new StringSelectMenuOptionBuilder()
            .setLabel(skill.name)
            .setValue(skill.id)
            .setDescription(cdText.substring(0, 100))
            .setEmoji(skill.emoji || '✨')
        );
    });

    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('pvp_skill_select_menu')
            .setPlaceholder('اختر مهارة لاستخدامها...')
            .addOptions(options.slice(0, 25))
    );
}

async function buildBattleEmbed(battleState) {
    const [attackerId, defenderId] = battleState.turn;
    const attacker = battleState.players.get(attackerId);
    const defender = battleState.players.get(defenderId);

    if (!attacker || !defender) return { embeds: [], components: [], files: [] };

    const attackerName = attacker.isMonster ? attacker.name : cleanDisplayName(attacker.member?.displayName || attacker.member?.user?.username);
    const defenderName = defender.isMonster ? defender.name : cleanDisplayName(defender.member?.displayName || defender.member?.user?.username);

    let components = [];

    if (!attacker.isMonster) {
        const mainButtons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('pvp_action_attack').setLabel('هـجـوم').setStyle(ButtonStyle.Danger).setEmoji('⚔️'),
            new ButtonBuilder().setCustomId('pvp_action_skill').setLabel('مـهــارات').setStyle(ButtonStyle.Primary).setEmoji('✨')
        );
        
        // إخفاء زر الانسحاب لو كانت معركة ضد وحش (PvE)
        if (!battleState.isPvE) {
            mainButtons.addComponents(
                new ButtonBuilder().setCustomId('pvp_action_forfeit').setLabel('انسحاب').setStyle(ButtonStyle.Secondary).setEmoji('🏳️')
            );
        }
        
        components = [mainButtons];
    }

    let files = [];
    let embeds = [];

    if (generatePvPImage) {
        try {
            const buffer = await generatePvPImage(battleState);
            if (buffer) {
                const attachment = new AttachmentBuilder(buffer, { name: 'pvp_battle.png' });
                files.push(attachment);
            }
        } catch (err) {
            console.error("[PvP Canvas Generation Error]:", err);
        }
    }

    if (files.length === 0) {
        const embed = new EmbedBuilder().setTitle(`⚔️ ${attackerName} 🆚 ${defenderName} ⚔️`).setColor(Colors.Red);
        embed.addFields(
            { name: `${attackerName}`, value: `HP: ${buildHpBar(attacker.hp, attacker.maxHp)}\nتأثيرات: ${buildEffectsString(attacker.effects)}`, inline: true },
            { name: `${defenderName}`, value: `HP: ${buildHpBar(defender.hp, defender.maxHp)}\nتأثيرات: ${buildEffectsString(defender.effects)}`, inline: true }
        );

        if (battleState.isPvE) {
            embed.setDescription(`🦑 **معركة ضد وحش!**\nالدور الآن لـ: **${attackerName}**`);
        } else {
            embed.setDescription(`الرهان: **${(battleState.bet * 2).toLocaleString()}** ${EMOJI_MORA}\n\n**الدور الآن لـ:** ${attacker.member}`);
        }

        if (battleState.log.length > 0) embed.addFields({ name: "📝 السجل:", value: battleState.log.slice(-3).join('\n'), inline: false });
        embeds.push(embed);
    }

    return { embeds, components, files };
}

function getBalancedPvPMultiplier(baseMultiplier, currentLevel) {
    if (currentLevel <= 15) return baseMultiplier;
    
    const targetMultiplierAt30 = 1.5; 
    const levelsRemaining = 15;
    const diff = targetMultiplierAt30 - baseMultiplier;
    const incrementPerLevel = diff / levelsRemaining;
    
    const finalMulti = baseMultiplier + (incrementPerLevel * (currentLevel - 15));
    
    if (currentLevel >= 30) return targetMultiplierAt30;
    return finalMulti;
}

function applySkillEffect(battleState, attackerId, skill) {
    const cooldownDuration = skill.id.startsWith('race_') ? 5 : 3;
    if (!battleState.skillCooldowns[attackerId]) battleState.skillCooldowns[attackerId] = {};
    battleState.skillCooldowns[attackerId][skill.id] = cooldownDuration;

    const attacker = battleState.players.get(attackerId);
    const defenderId = battleState.turn.find(id => id !== attackerId);
    const defender = battleState.players.get(defenderId);

    const attackerName = attacker.isMonster ? attacker.name : cleanDisplayName(attacker.member?.displayName || attacker.member?.user?.username);

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
                return `🎲 **${attackerName}** غامر وربح! سدد **${dmgAmount}** ضرر!`;
            } else {
                const minFail = 100;
                const maxFail = 200;
                const failDmg = Math.floor(Math.random() * (maxFail - minFail + 1)) + minFail;
                const selfDmg = Math.floor(attacker.hp * 0.03); 
                defender.hp -= failDmg;
                attacker.hp -= selfDmg;
                return `🎲 **${attackerName}** خسر الرهان... خدش الخصم بـ **${failDmg}** وأذى نفسه بـ **${selfDmg}**!`;
            }
        }

        case 'Spirit_RNG': {
            const multi = getBalancedPvPMultiplier(1.3, skillLevel);
            const spiritDmg = Math.floor(baseAtk * multi);
            defender.hp -= spiritDmg;
            const roll = Math.random() * 100;
            let effectMsg = "";
            if (roll < 2) { 
                defender.effects.stun = true; defender.effects.stun_turns = 1;
                effectMsg = "😱 **لعنة الرعب!** (شلل)";
            } else if (roll < 7) { 
                attacker.effects.rebound_active = 1.0; attacker.effects.rebound_turns = 2;
                effectMsg = "👻 **تلبس!** (عكس الضرر 100%)";
            } else if (roll < 57) { 
                attacker.effects.buff = (attacker.effects.buff || 0) + 0.15; attacker.effects.buff_turns = 3;
                defender.effects.weaken = (defender.effects.weaken || 0) + 0.15; defender.effects.weaken_turns = 3;
                effectMsg = "💀 **سرقة الروح!** (امتصاص القوة)";
            } else { effectMsg = "(هجوم طيفي)"; }
            return `👻 **${attackerName}** أطلق طيفاً! سبب **${spiritDmg}** ضرر + ${effectMsg}`;
        }

        case 'TrueDMG_Burn': { 
            const burnDmgFixed = 50 + (skillLevel * 25);
            defender.effects.burn = burnDmgFixed;
            defender.effects.burn_turns = 3;
            const multi = getBalancedPvPMultiplier(1.4, skillLevel);
            const dmg = Math.floor(baseAtk * multi); 
            defender.hp -= dmg;
            return `🐲 **${attackerName}** أحرق خصمه! (${dmg} ضرر + حرق ${burnDmgFixed})`;
        }

        case 'Cleanse_Buff_Shield': {
            attacker.effects.poison = 0; attacker.effects.poison_turns = 0;
            attacker.effects.burn = 0; attacker.effects.burn_turns = 0;
            attacker.effects.weaken = 0; attacker.effects.weaken_turns = 0;
            attacker.effects.stun = false; attacker.effects.stun_turns = 0;
            attacker.effects.confusion = false; attacker.effects.confusion_turns = 0;
            attacker.effects.blind = 0; attacker.effects.blind_turns = 0;
            
            let shieldPercent = 0.25;
            if(skillLevel > 15) shieldPercent += ((0.35 - 0.25) / 15) * (skillLevel - 15);
            if(skillLevel >= 30) shieldPercent = 0.35;
            
            const shieldVal = Math.floor(attacker.maxHp * shieldPercent);
            attacker.effects.shield += shieldVal;
            attacker.effects.buff = 0.2;
            attacker.effects.buff_turns = 2;
            return `⚔️ **${attackerName}** طهر نفسه واكتسب درعاً وقوة!`;
        }

        case 'Scale_MissingHP_Heal': {
            const missingHpPercent = (attacker.maxHp - attacker.hp) / attacker.maxHp;
            const extraDmg = Math.floor(baseAtk * missingHpPercent * 2);
            const multi = getBalancedPvPMultiplier(1.2, skillLevel);
            const dmg = Math.floor(baseAtk * multi) + extraDmg;
            defender.hp -= dmg;
            
            let healPercent = 0.15;
            if(skillLevel > 15) healPercent += ((0.25 - 0.15) / 15) * (skillLevel - 15);
            if(skillLevel >= 30) healPercent = 0.25;
            
            const healVal = Math.floor(attacker.maxHp * healPercent);
            attacker.hp = Math.min(attacker.maxHp, attacker.hp + healVal);
            return `⚖️ **${attackerName}** عاقب خصمه بضرر متصاعد (${dmg}) وشفى نفسه!`;
        }

        case 'Sacrifice_Crit': {
            const selfDmg = Math.floor(attacker.maxHp * 0.10);
            attacker.hp -= selfDmg;
            const multi = getBalancedPvPMultiplier(2.0, skillLevel);
            const dmg = Math.floor(baseAtk * multi);
            defender.hp -= dmg;
            return `👹 **${attackerName}** ضحى بدمه لتوجيه ضربة مدمرة (${dmg})!`;
        }

        case 'Stun_Vulnerable': {
            const multi = getBalancedPvPMultiplier(0.7, skillLevel);
            let finalDmg = Math.floor(baseAtk * multi);
            
            defender.effects.weaken = 0.3; 
            defender.effects.weaken_turns = 2;
            
            let msgDetails = [];

            if (Math.random() < 0.20) {
                finalDmg = Math.floor(finalDmg * 1.5); 
                msgDetails.push("💘 سهم خارق");
            }

            defender.hp -= finalDmg;

            if (Math.random() < 0.50) {
                defender.effects.stun = true; 
                defender.effects.stun_turns = 1;
                msgDetails.push("😵 شلل");
            } else {
                msgDetails.push("قاوم الشلل");
            }

            if (Math.random() < 0.20) {
                if (Math.random() < 0.5) {
                    defender.effects.poison = 30 + (skillLevel * 15);
                    defender.effects.poison_turns = 3;
                    msgDetails.push("☠️ تسمم");
                } else {
                    defender.effects.confusion = true; 
                    defender.effects.confusion_turns = 2;
                    msgDetails.push("🌀 ارتباك");
                }
            }

            return `🏹 **${attackerName}** أطلق وابل السهام بضرر (${finalDmg}) [${msgDetails.join(" | ")}]!`;
        }

        case 'Confusion': {
            const multi = getBalancedPvPMultiplier(1.2, skillLevel);
            const dmg = Math.floor(baseAtk * multi);
            defender.hp -= dmg;
            defender.effects.confusion = true; defender.effects.confusion_turns = 2;
            return `😵 **${attackerName}** أربك خصمه بلعنة الجنون!`;
        }

        case 'Lifesteal_Overheal': { 
            const multi = getBalancedPvPMultiplier(1.45, skillLevel);
            const dmg = Math.floor(baseAtk * multi); 
            defender.hp -= dmg;

            if (Math.random() < 0.60) {
                const bleedDmg = 30 + (skillLevel * 15); 
                defender.effects.burn = bleedDmg;
                defender.effects.burn_turns = 2;

                const healVal = Math.floor(dmg * 0.25); 
                const currentHp = attacker.hp || 0;
                const maxHp = attacker.maxHp || 100;
                const missingHp = maxHp - currentHp;

                if (healVal > missingHp) {
                    attacker.hp = maxHp;
                    const overflowShield = Math.floor((healVal - missingHp) * 0.15); 
                    attacker.effects.shield += overflowShield;
                    return `🍷 **${attackerName}** نهش خصمه! (+درع ${overflowShield} | نزيف ${bleedDmg})`;
                } else {
                    attacker.hp += healVal;
                    return `🍷 **${attackerName}** امتص ${healVal} HP وسبب نزيفاً (${bleedDmg})!`;
                }
            } else {
                return `🦇 **${attackerName}** وجه ضربة خاطفة (${dmg} ضرر) دون أن يتمكن من امتصاص الدم!`;
            }
        }

        case 'Chaos_RNG': {
            const multi = getBalancedPvPMultiplier(1.2, skillLevel);
            const dmg = Math.floor(baseAtk * multi);
            defender.hp -= dmg;
            const randomEffect = Math.random();
            let effectMsg = "";
            const chaosVal = 50 + (skillLevel * 25);

            if (randomEffect < 0.25) {
                defender.effects.burn = chaosVal; defender.effects.burn_turns = 3; effectMsg = "حرق";
            } else if (randomEffect < 0.50) {
                defender.effects.weaken = 0.3; defender.effects.weaken_turns = 2; effectMsg = "إضعاف";
            } else if (randomEffect < 0.75) {
                defender.effects.confusion = true; defender.effects.confusion_turns = 2; effectMsg = "ارتباك";
            } else {
                defender.effects.poison = chaosVal; defender.effects.poison_turns = 3; effectMsg = "سم";
            }
            return `🌀 **${attackerName}** سبب فوضى (${effectMsg})!`;
        }

        case 'Dmg_Evasion': { 
            const multi = getBalancedPvPMultiplier(1.3, skillLevel);
            const dmg = Math.floor(baseAtk * multi);
            defender.hp -= dmg;
            attacker.effects.evasion = 1; attacker.effects.evasion_turns = 1;
            return `👻 **${attackerName}** ضرب واختفى (مراوغة تامة)!`;
        }

        case 'Reflect_Tank': {
            let shieldPercent = 0.2;
            if(skillLevel > 15) shieldPercent += ((0.3 - 0.2) / 15) * (skillLevel - 15);
            if(skillLevel >= 30) shieldPercent = 0.3;
            
            attacker.effects.shield += Math.floor(attacker.maxHp * shieldPercent);
            attacker.effects.rebound_active = 0.4; attacker.effects.rebound_turns = 2;
            return `🔨 **${attackerName}** تحصن بالجبل (دفاع وعكس ضرر)!`;
        }

        case 'Execute_Heal': { 
            const multi = getBalancedPvPMultiplier(1.6, skillLevel);
            const dmg = Math.floor(baseAtk * multi);
            
            const ghoulPoison = 50 + (skillLevel * 25);
            defender.effects.poison = ghoulPoison;
            defender.effects.poison_turns = 3;

            if (defender.hp - dmg <= 0) {
                defender.hp = 0;
                attacker.hp = Math.min(attacker.maxHp, attacker.hp + Math.floor(attacker.maxHp * 0.25));
                return `🥩 **${attackerName}** افترس خصمه المسموم واستعاد صحته!`;
            }
            defender.hp -= dmg;
            return `🧟 **${attackerName}** نهش خصمه وترك فيه سمّاً (${ghoulPoison})!`;
        }

        case 'Poison_Blade': { 
            const multi = getBalancedPvPMultiplier(1.2, skillLevel);
            const directDmg = Math.floor(baseAtk * multi); 
            defender.hp -= directDmg;
            
            const poisonDmg = 50 + (skillLevel * 25); 
            defender.effects.poison = poisonDmg;
            defender.effects.poison_turns = 3;

            return `🐍 **${attackerName}** غرز نصل السموم! (${directDmg} ضرر + سم ${poisonDmg})`;
        }

        default:
            switch (skill.id) {
                case 'skill_shielding': 
                    attacker.effects.shield += Math.floor(attacker.maxHp * (effectValue / 100));
                    return `🛡️ **${attackerName}** اكتسب درعاً!`;
                case 'skill_buffing':
                    attacker.effects.buff = effectValue / 100; attacker.effects.buff_turns = 3;
                    return `💪 **${attackerName}** رفع قوته!`;
                case 'skill_rebound':
                    attacker.effects.rebound_active = effectValue / 100; attacker.effects.rebound_turns = 3;
                    return `🔄 **${attackerName}** جهز الانعكاس!`;
                case 'skill_healing':
                    const heal = Math.floor(attacker.maxHp * (effectValue / 100));
                    attacker.hp = Math.min(attacker.maxHp, attacker.hp + heal);
                    return `💖 **${attackerName}** استعاد ${heal} HP!`;
                case 'skill_poison': {
                    const pVal = 50 + (skillLevel * 25);
                    defender.effects.poison = pVal; defender.effects.poison_turns = 3;
                    return `☠️ **${attackerName}** سمم خصمه (-${pVal})!`;
                }
                case 'skill_weaken':
                    defender.effects.weaken = effectValue / 100; defender.effects.weaken_turns = 3;
                    return `📉 **${attackerName}** أضعف خصمه!`;
                case 'skill_dispel':
                    defender.effects = { 
                        shield: 0, buff: 0, buff_turns: 0, 
                        weaken: 0, weaken_turns: 0, 
                        poison: 0, poison_turns: 0, 
                        rebound_active: 0, rebound_turns: 0, 
                        penetrate: 0, burn: 0, burn_turns: 0, 
                        stun: false, stun_turns: 0, 
                        confusion: false, confusion_turns: 0, 
                        evasion: 0, evasion_turns: 0, 
                        blind: 0, blind_turns: 0 
                    };
                    return `💨 **${attackerName}** بدد كل سحر الخصم!`;
                case 'skill_cleanse':
                    attacker.effects.poison = 0; attacker.effects.poison_turns = 0;
                    attacker.effects.burn = 0; attacker.effects.burn_turns = 0;
                    attacker.effects.weaken = 0; attacker.effects.weaken_turns = 0;
                    attacker.effects.stun = false; attacker.effects.stun_turns = 0;
                    attacker.effects.confusion = false; attacker.effects.confusion_turns = 0;
                    attacker.effects.blind = 0; attacker.effects.blind_turns = 0;
                    return `✨ **${attackerName}** طهر نفسه من اللعنات!`;
                default:
                    const d = calculateDamage(attacker, defender, skill.stat_type === '%' ? 1.5 : 1);
                    defender.hp -= d;
                    return `💥 **${attackerName}** استخدم ${skill.name} وسبب ${d} ضرر!`;
            }
    }
}

function calculateDamage(attacker, defender, multiplier = 1) {
    let baseDmg = attacker.weapon ? attacker.weapon.currentDamage : 15;
    
    if (attacker.effects.buff > 0) baseDmg *= (1 + attacker.effects.buff);
    if (attacker.effects.weaken > 0) baseDmg *= (1 - attacker.effects.weaken);

    let finalDmg = Math.floor(baseDmg * multiplier);

    if (defender.effects.evasion > 0) {
        return 0;
    }

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

async function startPvpBattle(i, client, db, challengerMember, opponentMember, bet) {
    const getLevelResChallenger = await db.query(`SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2`, [challengerMember.id, i.guild.id]);
    const getLevelResOpponent = await db.query(`SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2`, [opponentMember.id, i.guild.id]);
    
    let challengerData = getLevelResChallenger.rows[0] || { user: challengerMember.id, guild: i.guild.id, level: 0, mora: 0, bank: 0 };
    let opponentData = getLevelResOpponent.rows[0] || { user: opponentMember.id, guild: i.guild.id, level: 0, mora: 0, bank: 0 };
    
    challengerData.mora = Number(challengerData.mora) - bet; 
    opponentData.mora = Number(opponentData.mora) - bet;
    
    await db.query(`UPDATE levels SET "mora" = $1 WHERE "user" = $2 AND "guild" = $3`, [challengerData.mora, challengerMember.id, i.guild.id]);
    await db.query(`UPDATE levels SET "mora" = $1 WHERE "user" = $2 AND "guild" = $3`, [opponentData.mora, opponentMember.id, i.guild.id]);
    
    const cMaxHp = BASE_HP + (Number(challengerData.level) * HP_PER_LEVEL);
    const oMaxHp = BASE_HP + (Number(opponentData.level) * HP_PER_LEVEL);
    
    const defEffects = () => ({ shield: 0, buff: 0, buff_turns: 0, weaken: 0, weaken_turns: 0, poison: 0, poison_turns: 0, burn: 0, burn_turns: 0, rebound_active: 0, rebound_turns: 0, stun: false, stun_turns: 0, confusion: false, confusion_turns: 0, evasion: 0, evasion_turns: 0, blind: 0, blind_turns: 0 });

    const weaponChallenger = await getWeaponData(db, challengerMember);
    const weaponOpponent = await getWeaponData(db, opponentMember);
    const skillsChallenger = await getAllSkillData(db, challengerMember);
    const skillsOpponent = await getAllSkillData(db, opponentMember);
    
    const userRaceC = await getUserRace(challengerMember, db);
    const raceNameC = userRaceC ? (userRaceC.raceName || userRaceC.racename) : 'Human';

    const userRaceO = await getUserRace(opponentMember, db);
    const raceNameO = userRaceO ? (userRaceO.raceName || userRaceO.racename) : 'Human';

    const challengerName = cleanDisplayName(challengerMember.user.displayName);
    const opponentName = cleanDisplayName(opponentMember.user.displayName);

    let thread;
    try {
        thread = await i.channel.threads.create({
            name: `⚔️-${challengerName}-vs-${opponentName}`.substring(0, 100),
            autoArchiveDuration: 60,
            type: ChannelType.PublicThread,
            reason: 'PvP Battle Thread'
        });
    } catch (e) {
        console.error("[PvP Thread Creation Error]:", e);
        await i.channel.send({ content: "❌ فشل إنشاء ساحة المعركة." });
        await db.query(`UPDATE levels SET "mora" = "mora" + $1 WHERE "user" = $2 AND "guild" = $3`, [bet, challengerMember.id, i.guild.id]);
        await db.query(`UPDATE levels SET "mora" = "mora" + $1 WHERE "user" = $2 AND "guild" = $3`, [bet, opponentMember.id, i.guild.id]);
        return;
    }

    try { await thread.members.add(challengerMember.id); } catch(e) {}
    try { await thread.members.add(opponentMember.id); } catch(e) {}

    await i.channel.send({ content: `⚔️ **بدأ التحدي!** ${challengerMember} 🆚 ${opponentMember} — <#${thread.id}>` });

    const battleState = {
        isPvE: false, message: null, bet: bet, totalPot: bet * 2, turn: [opponentMember.id, challengerMember.id],
        log: [`🔥 بدأ القتال!`], processingTurn: false,
        mainChannel: i.channel, thread: thread,
        skillCooldowns: { [challengerMember.id]: {}, [opponentMember.id]: {} },
        players: new Map([
            [challengerMember.id, { member: challengerMember, hp: cMaxHp, maxHp: cMaxHp, level: Number(challengerData.level), raceName: raceNameC, weapon: weaponChallenger, skills: skillsChallenger, effects: defEffects() }],
            [opponentMember.id, { member: opponentMember, hp: oMaxHp, maxHp: oMaxHp, level: Number(opponentData.level), raceName: raceNameO, weapon: weaponOpponent, skills: skillsOpponent, effects: defEffects() }]
        ])
    };

    activePvpBattles.set(thread.id, battleState);
    const { embeds, components, files } = await buildBattleEmbed(battleState);
    battleState.message = await thread.send({ content: `${challengerMember} 🆚 ${opponentMember}`, embeds, components, files });
}

// 🔥 التعديل الجذري على إنشاء ثريد وحش البحر وربطه بـ thread.id 🔥
async function startPveBattle(interaction, client, db, playerMember, monsterData, playerWeaponOverride) {
    const getLevelRes = await db.query(`SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2`, [playerMember.id, interaction.guild.id]);
    let playerData = getLevelRes.rows[0] || { user: playerMember.id, guild: interaction.guild.id, level: 0, mora: 0, bank: 0 };

    const pMaxHp = BASE_HP + (Number(playerData.level) * HP_PER_LEVEL);
    let finalPlayerWeapon = await getWeaponData(db, playerMember);
    if (!finalPlayerWeapon || finalPlayerWeapon.currentLevel === 0) {
        finalPlayerWeapon = playerWeaponOverride || { name: "سكين صيد", currentDamage: 15 };
    }

    const mMaxHp = Math.floor(pMaxHp * 0.8);
    const mDamage = Math.floor(finalPlayerWeapon.currentDamage * 0.9);
    
    const defEffects = () => ({ shield: 0, buff: 0, buff_turns: 0, weaken: 0, weaken_turns: 0, poison: 0, poison_turns: 0, burn: 0, burn_turns: 0, rebound_active: 0, rebound_turns: 0, stun: false, stun_turns: 0, confusion: false, confusion_turns: 0, evasion: 0, evasion_turns: 0, blind: 0, blind_turns: 0 });

    const skillsPlayer = await getAllSkillData(db, playerMember);
    
    const userRaceP = await getUserRace(playerMember, db);
    const rawRaceP = userRaceP ? (userRaceP.raceName || userRaceP.racename) : 'Human';
    
    // قاموس التعريب
    const RACE_AR = {
        'Human': 'بشري', 'Dragon': 'تنين', 'Elf': 'آلف', 'Dark Elf': 'آلف الظلام',
        'Seraphim': 'سيرافيم', 'Demon': 'شيطان', 'Vampire': 'مصاص دماء',
        'Spirit': 'روح', 'Dwarf': 'قزم', 'Ghoul': 'غول', 'Hybrid': 'نصف وحش'
    };
    const raceNameP = RACE_AR[rawRaceP] || rawRaceP;
    const translatedMonsterRace = RACE_AR[monsterData.race] || monsterData.race || 'وحش أعماق';
    const monsterImage = monsterData.image || 'https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev/images/pvp/monster.png';
    const playerName = cleanDisplayName(playerMember.displayName || playerMember.user.username);

    // إنشاء الثريد الخاص بالمعركة
    let thread;
    try {
        const threadName = `🦑-صيد-${monsterData.name}-${playerName}`.substring(0, 100);
        if (interaction.message && typeof interaction.message.startThread === 'function') {
            thread = await interaction.message.startThread({ name: threadName, autoArchiveDuration: 60, reason: 'PvE Monster Battle' });
        } else if (interaction.channel) {
            thread = await interaction.channel.threads.create({ name: threadName, autoArchiveDuration: 60, type: ChannelType.PublicThread, reason: 'PvE Monster Battle' });
        }
    } catch (e) {
        console.error("Thread creation failed for PvE:", e);
        if (interaction.channel) await interaction.channel.send("❌ فشل إنشاء ساحة المعركة للوحش.").catch(()=>{});
        return;
    }

    if (!thread) return;

    try { await thread.members.add(playerMember.id); } catch(e) {}
    try { 
        if (interaction.editReply) {
            await interaction.editReply({ content: `🦑 **ظهر ${monsterData.name}!** انتقل إلى الساحة: <#${thread.id}>`, embeds: [], components: [] }).catch(()=>{}); 
        }
    } catch(e){}

    const battleState = {
        isPvE: true, monsterData: monsterData, message: null, announcerMessage: null, turn: [playerMember.id, "monster"],
        log: [`🦑 **${monsterData.name}** ظهر من الأعماق!`], processingTurn: false, status: 'active',
        skillCooldowns: { [playerMember.id]: {}, "monster": {} },
        thread: thread, mainChannel: interaction.channel && !interaction.channel.isThread() ? interaction.channel : null,
        players: new Map([
            [playerMember.id, { isMonster: false, member: playerMember, hp: pMaxHp, maxHp: pMaxHp, level: Number(playerData.level), raceName: raceNameP, weapon: finalPlayerWeapon, skills: skillsPlayer, effects: defEffects() }],
            ["monster", { isMonster: true, name: monsterData.name, image: monsterImage, raceName: translatedMonsterRace, hp: mMaxHp, maxHp: mMaxHp, level: monsterData.level || '؟', weapon: { currentDamage: mDamage }, skills: {}, effects: defEffects() }]
        ])
    };

    // 🔥 تسجيل المعركة برقم الثريد لكي تتجاوب الأزرار بشكل صحيح 🔥
    activePveBattles.set(thread.id, battleState);
    
    let initAnnouncer;
    try { ({ initAnnouncer } = require('./pvp-announcer.js')); } catch (e) { initAnnouncer = null; }

    if (initAnnouncer) {
        const annEmbed = new EmbedBuilder().setDescription("🎙️ **المعلق يمسك الميكروفون...**").setColor(Colors.Gold);
        battleState.announcerMessage = await thread.send({ embeds: [annEmbed] });
    }

    const { embeds, components, files } = await buildBattleEmbed(battleState);
    battleState.message = await thread.send({ content: `⚔️ **قتال ضد وحش!** <@${playerMember.id}>`, embeds, components, files });

    if (initAnnouncer) {
        initAnnouncer(battleState, playerName, monsterData.name);
    }

    // مهلة 5 دقائق لوحش البحر
    battleState.timeoutTimer = setTimeout(async () => {
        if (battleState.status === 'active') {
            let triggerAnnouncer;
            try { ({ triggerAnnouncer } = require('./pvp-announcer.js')); } catch(e) {}
            if (triggerAnnouncer) triggerAnnouncer(battleState, `انتهى الوقت! الوحش يغوص في الأعماق مجدداً!`);
            await module.exports.endBattle(battleState, "monster", db, "timeout");
        }
    }, 5 * 60 * 1000); 
}

async function endBattle(battleState, winnerId, db, reason = "win", buffCalculator = null) {
    if (!battleState.message) return;

    const { embeds: finalEmbeds, files: finalFiles } = await buildBattleEmbed(battleState);
    await battleState.message.edit({ embeds: finalEmbeds, components: [], files: finalFiles }).catch(err => console.error("[PvP endBattle Edit Error]:", err.message));

    // حذف المعركة من الذاكرة بناءً على مكان رسالة المعركة (وهو الثريد)
    const channelId = battleState.message.channel.id;
    activePvpBattles.delete(channelId);
    activePveBattles.delete(channelId);

    const winner = battleState.players.get(winnerId);
    const loserId = Array.from(battleState.players.keys()).find(id => id !== winnerId);
    const loser = battleState.players.get(loserId);

    const embed = new EmbedBuilder();
    const BUFF_DURATION_MS = 15 * 60 * 1000;
    const expireTime = Date.now() + BUFF_DURATION_MS;

    if (battleState.isPvE) {
        if (winnerId !== "monster") {
            const monster = battleState.monsterData;
            const rewardMora = Math.floor(Math.random() * (monster.max_reward - monster.min_reward + 1)) + monster.min_reward;
            const rewardXP = Math.floor(Math.random() * (300 - 50 + 1)) + 50;

            const client = battleState.message.client;
            
            if (addXPAndCheckLevel) {
                await addXPAndCheckLevel(client, winner.member, db, rewardXP, rewardMora, false).catch(()=>{});
            } else {
                const userDataRes = await db.query(`SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2`, [winner.member.id, battleState.message.guild.id]);
                let userData = userDataRes.rows[0];
                if(userData) {
                    userData.mora = Number(userData.mora) + rewardMora;
                    userData.xp = Number(userData.xp) + rewardXP;
                    await db.query(`UPDATE levels SET "mora" = $1, "xp" = $2 WHERE "user" = $3 AND "guild" = $4`, [userData.mora, userData.xp, winner.member.id, battleState.message.guild.id]);
                }
            }

            await db.query(`INSERT INTO user_buffs ("guildID", "userID", "buffPercent", "expiresAt", "buffType", "multiplier") VALUES ($1, $2, $3, $4, $5, $6)`, [battleState.message.guild.id, winner.member.id, 15, expireTime, 'xp', 0.15]);
            await db.query(`INSERT INTO user_buffs ("guildID", "userID", "buffPercent", "expiresAt", "buffType", "multiplier") VALUES ($1, $2, $3, $4, $5, $6)`, [battleState.message.guild.id, winner.member.id, 15, expireTime, 'mora', 0.15]);

            const randomWinImage = WIN_IMAGES[Math.floor(Math.random() * WIN_IMAGES.length)];
            embed.setColor(Colors.Gold).setThumbnail(winner.member.displayAvatarURL()).setImage(randomWinImage)
                .setTitle(`🏆 قهرت ${monster.name}!`)
                .setDescription(`💰 **الغنيمة:** ${rewardMora} ${EMOJI_MORA}\n✨ **خبرة:** ${rewardXP} XP\n✦ حصلت على تعزيز +15% لمدة 15د`);
        } else {
            await db.query(`INSERT INTO user_buffs ("guildID", "userID", "buffPercent", "expiresAt", "buffType", "multiplier") VALUES ($1, $2, $3, $4, $5, $6)`, [battleState.message.guild.id, loser.member.id, -15, expireTime, 'mora', -0.15]);
            const randomLoseImage = LOSE_IMAGES[Math.floor(Math.random() * LOSE_IMAGES.length)];
            embed.setColor(Colors.DarkRed).setImage(randomLoseImage)
                .setTitle(`💀 هزمك ${battleState.monsterData.name}...`)
                .setDescription(`✦ حصلت على إضعاف -15% مورا واكس بي لمدة 15د`);
        }
        await battleState.message.channel.send({ embeds: [embed] });
        
        // 🔥 حذف الثريد التلقائي بعد دقيقتين للوحش 🔥
        if (battleState.thread) {
            setTimeout(async () => {
                try { await battleState.thread.delete('انتهت المعركة مع الوحش'); } catch (e) {}
            }, 120000);
        }
        return;
    } else {
        let finalWinnings = battleState.totalPot;
        let kingText = "";
        let casinoTaxText = "";

        const settingsRes = await db.query(`SELECT "rolePvPKing", "roleCasinoKing" FROM settings WHERE "guild" = $1`, [battleState.message.guild.id]);
        const settings = settingsRes.rows[0] || {};

        const winnerDataRes = await db.query(`SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2`, [winnerId, battleState.message.guild.id]);
        let winnerData = winnerDataRes.rows[0] || { user: winnerId, guild: battleState.message.guild.id, mora: 0, bank: 0 };
        
        const loserDataRes = await db.query(`SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2`, [loserId, battleState.message.guild.id]);
        let loserData = loserDataRes.rows[0] || { user: loserId, guild: battleState.message.guild.id, mora: 0, bank: 0 };

        if (settings && (settings.rolePvPKing || settings.rolepvpking) && winner.member.roles.cache.has(settings.rolePvPKing || settings.rolepvpking)) {
            const stealAmount = Math.floor(battleState.bet * 0.10);
            
            loserData.mora = Number(loserData.mora);
            loserData.bank = Number(loserData.bank);

            if (loserData.mora >= stealAmount) {
                loserData.mora -= stealAmount;
            } else if (loserData.bank >= stealAmount) {
                loserData.bank -= stealAmount;
            } else {
                loserData.mora = 0; 
            }
            
            finalWinnings += stealAmount;
            kingText = `\n👑 جلالة ملك النزاع نهب **${stealAmount}** إضافية من ثروة الخصم!`;
            await db.query(`UPDATE levels SET "mora" = $1, "bank" = $2 WHERE "user" = $3 AND "guild" = $4`, [loserData.mora, loserData.bank, loserId, battleState.message.guild.id]);
        }

        if (settings && (settings.roleCasinoKing || settings.rolecasinoking) && !winner.member.roles.cache.has(settings.roleCasinoKing || settings.rolecasinoking)) {
            const kingMembers = battleState.message.guild.roles.cache.get(settings.roleCasinoKing || settings.rolecasinoking)?.members;
            if (kingMembers && kingMembers.size > 0) {
                const king = kingMembers.first();
                const casinoTax = Math.floor(finalWinnings * 0.01);
                if (casinoTax > 0) {
                    finalWinnings -= casinoTax;
                    casinoTaxText = `\n👑 ضريبـة ملـك الكازيـنـو (-1%): **${casinoTax}**-`;
                    await db.query(`UPDATE levels SET "bank" = "bank" + $1 WHERE "user" = $2 AND "guild" = $3`, [casinoTax, king.id, battleState.message.guild.id]);
                }
            }
        }

        winnerData.mora = Number(winnerData.mora) + finalWinnings;
        await db.query(`UPDATE levels SET "mora" = $1 WHERE "user" = $2 AND "guild" = $3`, [winnerData.mora, winnerId, battleState.message.guild.id]);

        // 🔥 نظام تصنيف المعارك وتوزيع النقاط في الخلفية (بدون إظهارها) 🔥
        if (updateGuildStat && reason !== "forfeit") {
            let earnedPoints = 1;
            if (battleState.bet >= 50000) earnedPoints = 3;      // تصنيف S
            else if (battleState.bet >= 20000) earnedPoints = 2; // تصنيف A
            else if (battleState.bet >= 10000) earnedPoints = 2; // تصنيف B
            else if (battleState.bet >= 5000) earnedPoints = 1;  // تصنيف C
            else earnedPoints = 1;                               // تصنيف D
            
            updateGuildStat(battleState.message.client, battleState.message.guild.id, winnerId, 'pvp_wins', earnedPoints);
        }

        await db.query(`INSERT INTO user_buffs ("guildID", "userID", "buffPercent", "expiresAt", "buffType", "multiplier") VALUES ($1, $2, $3, $4, $5, $6)`, [battleState.message.guild.id, winnerId, 15, expireTime, 'mora', 0.15]);
        await db.query(`INSERT INTO user_buffs ("guildID", "userID", "buffPercent", "expiresAt", "buffType", "multiplier") VALUES ($1, $2, $3, $4, $5, $6)`, [battleState.message.guild.id, winnerId, 15, expireTime, 'xp', 0.15]);

        const loserExpiresAt = Date.now() + (15 * 60 * 1000);
        await db.query(`INSERT INTO user_buffs ("guildID", "userID", "buffPercent", "expiresAt", "buffType", "multiplier") VALUES ($1, $2, $3, $4, $5, $6)`, [battleState.message.guild.id, loserId, -15, loserExpiresAt, 'mora', -0.15]);
        await db.query(`INSERT INTO user_buffs ("guildID", "userID", "buffPercent", "expiresAt", "buffType", "multiplier") VALUES ($1, $2, $3, $4, $5, $6)`, [battleState.message.guild.id, loserId, 0, loserExpiresAt, 'pvp_wounded', 0]);

        const randomWinImage = WIN_IMAGES[Math.floor(Math.random() * WIN_IMAGES.length)];
        
        embed.setColor('Random')
            .setThumbnail(winner.member.displayAvatarURL())
            .setImage(randomWinImage)
            .setTitle(`★ الـفـائـز هـو ${cleanDisplayName(winner.member.user.displayName)}`)
            .setDescription(
                `✶ مبـلغ الرهـان: ${battleState.totalPot.toLocaleString()} ${EMOJI_MORA}\n` +
                `✶ إجمالـي الربح: ${finalWinnings.toLocaleString()} ${EMOJI_MORA}${kingText}${casinoTaxText}\n\n` +
                `✶ الـفائـز: ${winner.member} حصل علـى تعزيـز 15% مورا واكس بي لـ 15د <a:buff:1438796257522094081>\n\n` +
                `✶ الـخـاسـر: ${loser.member} اصبح جريح وبطور الشفـاء اصابته لعـنة -15% مورا واكس بي لـ 15د <a:Nerf:1438795685280612423>`
            );
    }

    await battleState.message.channel.send({ embeds: [embed] });

    if (battleState.thread && battleState.mainChannel) {
        try {
            const summaryEmbed = new EmbedBuilder()
                .setColor(embed.data.color || Colors.Gold)
                .setTitle(embed.data.title || '⚔️ انتهت المعركة')
                .setDescription(embed.data.description || '')
                .setThumbnail(embed.data.thumbnail?.url || null);
            if (embed.data.image?.url) summaryEmbed.setImage(embed.data.image.url);
            await battleState.mainChannel.send({ embeds: [summaryEmbed] });
        } catch (e) { console.error("[PvP Summary Send Error]:", e.message); }

        setTimeout(async () => {
            try {
                await battleState.thread.setArchived(true);
            } catch (e) {}
        }, 5000);
    }
}

function applyPersistentEffects(battleState, attackerId) {
    const attacker = battleState.players.get(attackerId);
    let logEntries = [];
    let skipTurn = false;

    const attackerName = attacker.isMonster ? attacker.name : cleanDisplayName(attacker.member?.displayName || attacker.member?.user?.username);

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
        logEntries.push(`☠️ **${attackerName}** يتألم من السم (-${attacker.effects.poison})!`);
        attacker.effects.poison_turns--;
        if (attacker.effects.poison_turns <= 0) attacker.effects.poison = 0;
    }

    if (attacker.effects.burn > 0) {
        attacker.hp -= attacker.effects.burn;
        logEntries.push(`🔥 **${attackerName}** يحترق (-${attacker.effects.burn})!`);
        attacker.effects.burn_turns--;
        if (attacker.effects.burn_turns <= 0) attacker.effects.burn = 0;
    }

    if (attacker.effects.stun) {
        logEntries.push(`⚡ **${attackerName}** مشلول ولا يستطيع الحركة!`);
        skipTurn = true;
    }

    return { logEntries, skipTurn };
}

module.exports = {
    activePvpChallenges, activePvpBattles, activePveBattles,
    BASE_HP, HP_PER_LEVEL, SKILL_COOLDOWN_TURNS,
    cleanDisplayName, getUserRace, getWeaponData, getAllSkillData, getUserActiveSkill,
    buildBattleEmbed, buildPvpSkillSelector, startPvpBattle, startPveBattle, endBattle, applyPersistentEffects,
    applySkillEffect, calculateDamage
};
