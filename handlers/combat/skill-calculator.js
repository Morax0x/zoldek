const { cleanDisplayName } = require('../dungeon/utils');

const GLOBAL_SKILL_MULTIPLIER = 5.0;

// 🔥 دالة الصحوة المتأخرة لمهارات الدانجون 🔥
function calculateSkillRawValue(skillConfig, currentLevel) {
    if (!skillConfig) return 0;
    const level = Math.max(1, currentLevel || 1);
    
    const base = skillConfig.base_value;
    const inc = skillConfig.value_increment;
    const isPercentage = skillConfig.stat_type === '%' || skillConfig.id.includes('heal') || skillConfig.id.includes('shield');

    if (level <= 15) {
        // الحساب الطبيعي للفل 1 إلى 15
        return base + (inc * (level - 1));
    } else {
        // الحساب الموازن (Endgame Convergence) من 16 إلى 30
        const valueAt15 = base + (inc * 14);
        
        // الهدف النهائي الموحد عند لفل 30 
        // إذا كانت مهارة نسبة مئوية (زي الهيل والدرع) الهدف يكون 50%
        // وإذا كانت ضرر (رقم ثابت) الهدف يكون 200 (لأنه بينضرب بـ 5.0 تحت فيصير 1000)
        const targetValueAt30 = isPercentage ? 50 : 200; 
        
        const levelsRemaining = 15; // المسافة بين 15 و 30
        
        const valueNeeded = targetValueAt30 - valueAt15;
        const dynamicIncrement = valueNeeded / levelsRemaining;
        
        let finalValue = valueAt15 + (dynamicIncrement * (level - 15));
        
        if (level >= 30) return targetValueAt30;
        
        return Math.floor(finalValue);
    }
}

function getName(entity) {
    if (entity.isMonster) return entity.name;
    if (entity.member) return cleanDisplayName(entity.member.user.displayName);
    return entity.name || "Unknown";
}

function executeSkill(attacker, defender, skill, isOwner = false) {
    const result = {
        damage: 0, 
        heal: 0, 
        shield: 0, 
        selfDamage: 0,
        effectsApplied: [], 
        selfEffects: [],    
        log: ""
    };

    const multiplier = isOwner ? 10 : 1;
      
    const rawValue = calculateSkillRawValue(skill, skill.currentLevel);
      
    let skillPower = 0;

    const hpBasedSkills = ['Reflect_Tank', 'Cleanse_Buff_Shield'];
      
    if (skill.id.includes('heal') || skill.id.includes('shield') || hpBasedSkills.includes(skill.stat_type)) {
        skillPower = Math.floor(attacker.maxHp * (rawValue / 100));
    } else {
        skillPower = Math.floor(rawValue * GLOBAL_SKILL_MULTIPLIER);
    }

    if (!skill.id.includes('heal') && !skill.id.includes('shield')) {
        let buffMultiplier = 1.0;

        if (attacker.effects && Array.isArray(attacker.effects)) {
            attacker.effects.forEach(e => {
                if (e.type === 'atk_buff' || e.type === 'buff') buffMultiplier += e.val;
                if (e.type === 'weaken') buffMultiplier -= e.val;
            });
        }
        
        skillPower = Math.floor(skillPower * buffMultiplier);
    }
      
    skillPower = Math.floor(skillPower * multiplier);

    switch (skill.stat_type) {
        
        case 'Gamble_Dmg': {
            if (Math.random() < 0.5) {
                const minDmg = 777;
                const maxDmg = 2222;
                const dmgAmount = Math.floor(Math.random() * (maxDmg - minDmg + 1)) + minDmg;
                
                result.damage = dmgAmount;
                result.log = `🎲 **${getName(attacker)}** نجحت مقامرته! الأرقام تطابقت بضرر **${dmgAmount}**!`;
            } else {
                const minFail = 100;
                const maxFail = 200;
                const failDmg = Math.floor(Math.random() * (maxFail - minFail + 1)) + minFail;
                
                result.damage = failDmg;
                
                const selfDmgAmount = Math.floor(attacker.hp * 0.03);
                result.selfDamage = selfDmgAmount;
                
                result.log = `🎲 **${getName(attacker)}** خسر الرهان... خدش الخصم بـ **${failDmg}** وأذى نفسه بـ **${selfDmgAmount}**!`;
            }
            break;
        }

        case 'Buff_All': {
            const buffVal = rawValue / 100;
            result.selfEffects.push({ type: 'atk_buff', val: buffVal, turns: 3 });
            result.log = `📢 **${getName(attacker)}** أطلق صيحة الحرب! زاد هـجومـه ${rawValue}%!`;
            break;
        }

        case '%': 
        case 'TrueDMG_Burn':        
        case 'Stun_Vulnerable':     
        case 'Confusion':           
        case 'Sacrifice_Crit':      
        case 'Scale_MissingHP_Heal': 
        case 'Execute_Heal':        
        case 'Chaos_RNG':           
        case 'Spirit_RNG':          
        case 'Dmg_Evasion':         
        case 'Poison_Blade': 
            
            if (skill.id === 'skill_shielding') {
                result.shield = skillPower;
                result.log = `🛡️ **${getName(attacker)}** رفع درعه (${result.shield})!`;
            } 
            else if (skill.id === 'skill_healing') {
                result.heal = skillPower;
                result.log = `💖 **${getName(attacker)}** استعاد ${result.heal} HP!`;
            }
            else if (skill.id === 'skill_buffing') {
                let buffPercent = rawValue / 100;
                if (buffPercent > 1.0) buffPercent = 1.0; 
                result.selfEffects.push({ type: 'atk_buff', val: buffPercent, turns: 3 });
                result.log = `💪 **${getName(attacker)}** غضب ورفع قوته بنسبة ${rawValue}%!`;
            }
            else if (skill.id === 'skill_poison') {
                result.damage = skillPower;
                result.effectsApplied.push({ type: 'poison', val: 100, turns: 3 });
                result.log = `☠️ **${getName(attacker)}** سمم خصمه!`;
            }
            else if (skill.id === 'skill_rebound') {
                const reboundVal = rawValue / 100;
                result.selfEffects.push({ type: 'reflect', val: reboundVal, turns: 3 });
                result.log = `🔄 **${getName(attacker)}** جهز درع الانعكاس (${rawValue}%)!`;
            }
            else if (skill.id === 'skill_weaken') {
                const weakenVal = rawValue / 100;
                result.effectsApplied.push({ type: 'weaken', val: weakenVal, turns: 3 });
                result.log = `📉 **${getName(attacker)}** أضعف هجوم خصمه بنسبة ${rawValue}%!`;
            }
            else if (skill.id === 'skill_dispel') {
                result.effectsApplied.push({ type: 'dispel' });
                result.log = `💨 **${getName(attacker)}** بدد كل سحر الخصم!`;
            }
            else if (skill.id === 'skill_cleanse') {
                result.selfEffects.push({ type: 'cleanse' });
                result.heal = Math.floor(attacker.maxHp * 0.1);
                result.log = `✨ **${getName(attacker)}** طهر نفسه من اللعنات!`;
            }
            else if (skill.stat_type === 'TrueDMG_Burn') { 
                result.damage = skillPower;
                result.effectsApplied.push({ type: 'burn', val: 100, turns: 3 });
                
                if (Math.random() < 0.10) { 
                    result.effectsApplied.push({ type: 'stun', val: true, turns: 1 });
                    result.log = `🐲 **${getName(attacker)}** أطلق ${skill.name} وشـل الخصم!`;
                } else {
                    result.log = `🐲 **${getName(attacker)}** أطلق ${skill.name}!`;
                }
            }
            else if (skill.stat_type === 'Stun_Vulnerable') { 
                result.damage = Math.floor(skillPower * 0.7); 
                result.effectsApplied.push({ type: 'weaken', val: 0.3, turns: 2 });
                
                let stunMsg = " (قاوم الشلل)";
                if (Math.random() < 0.50) {
                    result.effectsApplied.push({ type: 'stun', val: true, turns: 1 });
                    stunMsg = " 😵 وتم شل حركته!";
                }
                result.log = `🏹 **${getName(attacker)}** أطلق وابل السهام بضرر (${result.damage})${stunMsg}!`;
            }
            else if (skill.stat_type === 'Confusion') { 
                result.damage = Math.floor(skillPower * 0.85);
                result.effectsApplied.push({ type: 'confusion', val: true, turns: 2 });
                result.log = `🗡️ **${getName(attacker)}** سبب ضرراً وأربك الخصم!`;
            }
            else if (skill.stat_type === 'Sacrifice_Crit') { 
                result.selfDamage = Math.floor(attacker.maxHp * 0.10);
                result.damage = Math.floor(skillPower * 1.2); 
                result.log = `👹 **${getName(attacker)}** ضحى بدمه لضربة مدمرة (${result.damage})!`;
            }
            else if (skill.stat_type === 'Scale_MissingHP_Heal') { 
                const missingHpPercent = (attacker.maxHp - attacker.hp) / attacker.maxHp;
                const bonusDmg = Math.floor(skillPower * missingHpPercent * 0.8);
                
                result.damage = skillPower + bonusDmg;
                result.heal = Math.floor(skillPower * 0.4); 
                
                result.log = `⚖️ **${getName(attacker)}** عاقب بـ ${skill.name} (${result.damage}) واستعاد عافيته!`;
            }
            else if (skill.stat_type === 'Spirit_RNG') { 
                const spiritDmg = Math.floor(skillPower * 1.3);
                result.damage = spiritDmg;
                const roll = Math.random() * 100;
                let effectMsg = "";

                if (roll < 2) { 
                    result.effectsApplied.push({ type: 'stun', val: true, turns: 1 });
                    effectMsg = "😱 **لعنة الرعب!** (شلل)";
                } 
                else if (roll < 7) { 
                    result.selfEffects.push({ type: 'reflect', val: 1.0, turns: 2 });
                    effectMsg = "👻 **تلبس!** (عكس الضرر 100%)";
                } 
                else if (roll < 57) { 
                    result.selfEffects.push({ type: 'atk_buff', val: 0.15, turns: 3 });
                    result.effectsApplied.push({ type: 'weaken', val: 0.15, turns: 3 });
                    effectMsg = "💀 **سرقة الروح!** (امتصاص القوة)";
                } 
                else {
                    effectMsg = "(هجوم طيفي)";
                }
                result.log = `👻 **${getName(attacker)}** أطلق طيفاً! سبب **${spiritDmg}** ضرر + ${effectMsg}`;
            }
            else if (skill.stat_type === 'Chaos_RNG') { 
                const variance = (Math.random() * 0.4) + 0.8;
                result.damage = Math.floor(skillPower * variance);
                const rand = Math.random();
                let msg = "سم";
                if (rand < 0.25) { result.effectsApplied.push({ type: 'burn', val: 100, turns: 3 }); msg="حرق"; }
                else if (rand < 0.50) { result.effectsApplied.push({ type: 'weaken', val: 0.3, turns: 2 }); msg="إضعاف"; }
                else if (rand < 0.75) { result.effectsApplied.push({ type: 'confusion', val: true, turns: 2 }); msg="ارتباك"; }
                else { result.effectsApplied.push({ type: 'poison', val: 100, turns: 3 }); }
                result.log = `🌀 **${getName(attacker)}** أطلق فوضى (${msg})!`;
            }
            else if (skill.stat_type === 'Execute_Heal') { 
                result.damage = skillPower;
                result.effectsApplied.push({ type: 'poison', val: 100, turns: 3 });
                
                if (defender.hp < defender.maxHp * 0.20) {
                    result.damage *= 2; 
                    result.heal = Math.floor(attacker.maxHp * 0.25);
                    result.log = `🧟 **${getName(attacker)}** شم رائحة الموت ونهش خصمه! (ضرر مضاعف)`;
                } else {
                    result.log = `🧟 **${getName(attacker)}** مزق خصمه وسبب نزيفاً!`;
                }
            }
            else if (skill.stat_type === 'Dmg_Evasion') { 
                const dmg = Math.floor(skillPower * 1.3);
                result.damage = dmg;
                result.selfEffects.push({ type: 'evasion', val: true, turns: 1 });
                result.log = `👻 **${getName(attacker)}** ضرب واختفى (مراوغة تامة)!`;
            }
            else if (skill.stat_type === 'Poison_Blade') {
                const directDmg = Math.floor(skillPower * 1.2); 
                result.damage = directDmg;
                
                const poisonVal = Math.floor(skillPower * 0.4);
                result.effectsApplied.push({ type: 'poison', val: poisonVal, turns: 3 });
                
                result.log = `🐍 **${getName(attacker)}** غرز نصل السموم! (${directDmg} ضرر + سم)`;
            }
            else {
                result.damage = skillPower;
                result.log = `💥 **${getName(attacker)}** استخدم ${skill.name} وسبب ${result.damage} ضرر!`;
            }
            break;

        case 'Cleanse_Buff_Shield': {
            result.selfEffects.push({ type: 'cleanse' });
            
            const buffPercent = rawValue / 100;
            result.selfEffects.push({ type: 'atk_buff', val: buffPercent, turns: 2 });
            
            const shieldAmount = Math.floor((attacker.maxHp * 0.15) + (skillPower * 0.2)); 
            result.shield = shieldAmount;
            
            result.log = `⚔️ **${getName(attacker)}** استخدم تكتيك القائد (تطهير + درع + تعزيز)!`;
            break;
        }

        case 'Lifesteal_Overheal': {
            result.damage = Math.floor(skillPower * 1.15);
            
            const bleedDmg = Math.floor(result.damage * 0.2); 
            const finalBleed = Math.max(50, bleedDmg);
            result.effectsApplied.push({ type: 'burn', val: finalBleed, turns: 2 });

            const potentialHeal = Math.floor(result.damage * 0.5); 
            const currentHp = attacker.hp || 0;
            const maxHp = attacker.maxHp || 100;
            const missingHp = maxHp - currentHp;

            if (potentialHeal > missingHp) {
                result.heal = missingHp;
                const overflow = potentialHeal - missingHp;
                result.shield = Math.floor(overflow * 0.5); 
                result.log = `🩸 **${getName(attacker)}** مزق جسد الخصم وسبب نزيفاً! (شفاء +${result.heal} | درع +${result.shield})`;
            } else {
                result.heal = potentialHeal;
                result.log = `🩸 **${getName(attacker)}** نهش الخصم وسبب نزيفاً! (+${potentialHeal} HP)`;
            }
            break;
        }
        
        case 'Reflect_Tank': {
            const tankPower = Math.floor(attacker.maxHp * 0.2); 
            result.shield = tankPower;
            result.selfEffects.push({ type: 'tank_reflect', val: 0.4, turns: 2 });
            result.log = `🛡️ **${getName(attacker)}** تحصن بالجبل!`;
            break;
        }

        default:
            result.damage = skillPower;
            result.log = `💥 **${getName(attacker)}** استخدم ${skill.name} وسبب ${result.damage} ضرر!`;
            break;
    }

    return result;
}

module.exports = { calculateSkillRawValue, executeSkill };
