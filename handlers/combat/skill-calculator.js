const { cleanDisplayName } = require('../dungeon/utils');

const GLOBAL_SKILL_MULTIPLIER = 5.0;

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
        // حساب مقدار الزيادة الثابت لكل ليفل
        const dynamicIncrement = Math.max((targetValueAt30 - valueAt15) / levelsRemaining, (isPercentage ? 0.5 : 5));
        
        let finalValue = valueAt15 + (dynamicIncrement * (level - 15));
        
        // 🔥 تم فك الحصار! سقف الكاب ملغى لكي تستمر المهارات بالتطور إلى الأبد 🔥
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
        skillPower = Math.floor((attacker.maxHp || 100) * (rawValue / 100));
    } else {
        // 🔥 توحيد القوة: المهارة الهجومية تعتمد على قوة السلاح والعتاد الحالية + المهارة 🔥
        const baseAttackPower = attacker.damage || attacker.atk || (attacker.weapon ? attacker.weapon.currentDamage : 15);
        skillPower = Math.floor((baseAttackPower * 0.5) + (rawValue * GLOBAL_SKILL_MULTIPLIER));
    }

    if (!skill.id.includes('heal') && !skill.id.includes('shield')) {
        let buffMultiplier = 1.0;

        if (attacker.effects && Array.isArray(attacker.effects)) {
            attacker.effects.forEach(e => {
                if (e.type === 'atk_buff' || e.type === 'buff') buffMultiplier += e.val;
                if (e.type === 'weaken') buffMultiplier -= e.val;
            });
        } else if (attacker.effects && !Array.isArray(attacker.effects)) {
            if (attacker.effects.buff > 0) buffMultiplier += attacker.effects.buff;
            if (attacker.effects.weaken > 0) buffMultiplier -= attacker.effects.weaken;
        }
        
        skillPower = Math.floor(skillPower * buffMultiplier);
    }
      
    skillPower = Math.floor(skillPower * multiplier);

    // 🔥 نظام التخفيف الدفاعي ضد مهارات الخصم (Armor Mitigation) 🔥
    let defMitigation = 0;
    if (!skill.id.includes('heal') && !skill.id.includes('shield') && !skill.id.includes('buff') && !skill.id.includes('cleanse')) {
        const defenderDef = defender.defense || 0;
        defMitigation = Math.min(0.60, defenderDef / (defenderDef + 300));
        
        let extraReduction = 0;
        if (defender.defending) extraReduction += 0.4;
        
        if (defender.effects && Array.isArray(defender.effects)) {
            defender.effects.forEach(e => { if (e.type === 'def_buff' || e.type === 'dmg_reduce') extraReduction += e.val; });
        } else if (defender.effects && !Array.isArray(defender.effects)) {
            if (defender.effects.dmg_reduce > 0) extraReduction += defender.effects.dmg_reduce;
        }
        
        let totalReduction = Math.min(0.9, defMitigation + extraReduction);
        skillPower = Math.floor(skillPower * (1 - totalReduction));
        if (skillPower < 1) skillPower = 1;
    }

    switch (skill.stat_type) {
        
        case 'Gamble_Dmg': {
            if (Math.random() < 0.5) {
                const minDmg = 777;
                const maxDmg = 2222;
                let dmgAmount = Math.floor(Math.random() * (maxDmg - minDmg + 1)) + minDmg;
                dmgAmount = Math.floor(dmgAmount * (1 - defMitigation)); // يتأثر بالدفاع
                
                result.damage = dmgAmount;
                result.log = `🎲 **${getName(attacker)}** نجحت مقامرته! الأرقام تطابقت بضرر **${dmgAmount}**!`;
            } else {
                const minFail = 100;
                const maxFail = 200;
                let failDmg = Math.floor(Math.random() * (maxFail - minFail + 1)) + minFail;
                failDmg = Math.floor(failDmg * (1 - defMitigation));
                
                result.damage = failDmg;
                
                const selfDmgAmount = Math.floor((attacker.hp || 100) * 0.03);
                result.selfDamage = selfDmgAmount;
                
                result.log = `🎲 **${getName(attacker)}** خسر الرهان... خدش الخصم بـ **${failDmg}** وأذى نفسه بـ **${selfDmgAmount}**!`;
            }
            break;
        }

        case 'Buff_All': {
            let buffVal = rawValue / 100;
            if (buffVal > 1.0) buffVal = 1.0; 
            result.selfEffects.push({ type: 'atk_buff', val: buffVal, turns: 3 });
            result.log = `📢 **${getName(attacker)}** أطلق صيحة الحرب! زاد هـجومـه ${Math.floor(buffVal*100)}%!`;
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
                result.log = `💪 **${getName(attacker)}** غضب ورفع قوته بنسبة ${Math.floor(buffPercent*100)}%!`;
            }
            else if (skill.id === 'skill_poison') {
                result.damage = skillPower;
                result.effectsApplied.push({ type: 'poison', val: 100 + Math.floor(skill.currentLevel * 10), turns: 3 });
                result.log = `☠️ **${getName(attacker)}** سمم خصمه!`;
            }
            else if (skill.id === 'skill_rebound') {
                let reboundVal = rawValue / 100;
                if (reboundVal > 1.0) reboundVal = 1.0;
                result.selfEffects.push({ type: 'reflect', val: reboundVal, turns: 3 });
                result.log = `🔄 **${getName(attacker)}** جهز درع الانعكاس (${Math.floor(reboundVal*100)}%)!`;
            }
            else if (skill.id === 'skill_weaken') {
                let weakenVal = rawValue / 100;
                if (weakenVal > 0.8) weakenVal = 0.8;
                result.effectsApplied.push({ type: 'weaken', val: weakenVal, turns: 3 });
                result.log = `📉 **${getName(attacker)}** أضعف هجوم خصمه بنسبة ${Math.floor(weakenVal*100)}%!`;
            }
            else if (skill.id === 'skill_dispel') {
                result.effectsApplied.push({ type: 'dispel' });
                result.log = `💨 **${getName(attacker)}** بدد كل سحر الخصم!`;
            }
            else if (skill.id === 'skill_cleanse') {
                result.selfEffects.push({ type: 'cleanse' });
                result.heal = Math.floor((attacker.maxHp || 100) * 0.1);
                result.log = `✨ **${getName(attacker)}** طهر نفسه من اللعنات!`;
            }
            else if (skill.stat_type === 'TrueDMG_Burn') { 
                result.damage = skillPower;
                result.effectsApplied.push({ type: 'burn', val: 100 + Math.floor(skill.currentLevel * 5), turns: 3 });
                
                if (Math.random() < 0.10) { 
                    result.effectsApplied.push({ type: 'stun', val: true, turns: 1 });
                    result.log = `🐲 **${getName(attacker)}** أطلق ${skill.name} وشـل الخصم!`;
                } else {
                    result.log = `🐲 **${getName(attacker)}** أطلق ${skill.name}!`;
                }
            }
            else if (skill.stat_type === 'Stun_Vulnerable') { 
                let finalDmg = Math.floor(skillPower * 0.7); 
                result.effectsApplied.push({ type: 'weaken', val: 0.3, turns: 2 });
                
                let msgDetails = [];

                if (Math.random() < 0.20) {
                    finalDmg = Math.floor(finalDmg * 1.5); 
                    msgDetails.push("💘 سهم خارق");
                }

                result.damage = finalDmg;

                if (Math.random() < 0.50) {
                    result.effectsApplied.push({ type: 'stun', val: true, turns: 1 });
                    msgDetails.push("😵 شلل");
                } else {
                    msgDetails.push("قاوم الشلل");
                }

                if (Math.random() < 0.20) {
                    if (Math.random() < 0.5) {
                        result.effectsApplied.push({ type: 'poison', val: Math.floor((skillPower*2) * 0.3), turns: 3 });
                        msgDetails.push("☠️ تسمم");
                    } else {
                        result.effectsApplied.push({ type: 'confusion', val: 0.5, turns: 2 });
                        msgDetails.push("🌀 ارتباك");
                    }
                }

                result.log = `🏹 **${getName(attacker)}** أطلق وابل السهام بضرر (${result.damage}) [${msgDetails.join(" | ")}]!`;
            }
            else if (skill.stat_type === 'Confusion') { 
                result.damage = Math.floor(skillPower * 0.85);
                result.effectsApplied.push({ type: 'confusion', val: true, turns: 2 });
                result.log = `🗡️ **${getName(attacker)}** سبب ضرراً وأربك الخصم!`;
            }
            else if (skill.stat_type === 'Sacrifice_Crit') { 
                result.selfDamage = Math.floor((attacker.maxHp || 100) * 0.10);
                result.damage = Math.floor(skillPower * 1.2); 
                result.log = `👹 **${getName(attacker)}** ضحى بدمه لضربة مدمرة (${result.damage})!`;
            }
            else if (skill.stat_type === 'Scale_MissingHP_Heal') { 
                const maxHp = attacker.maxHp || 100;
                const missingHpPercent = Math.max(0, (maxHp - (attacker.hp || 0))) / maxHp;
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
                if (rand < 0.25) { result.effectsApplied.push({ type: 'burn', val: 100 + Math.floor(skill.currentLevel * 5), turns: 3 }); msg="حرق"; }
                else if (rand < 0.50) { result.effectsApplied.push({ type: 'weaken', val: 0.3, turns: 2 }); msg="إضعاف"; }
                else if (rand < 0.75) { result.effectsApplied.push({ type: 'confusion', val: true, turns: 2 }); msg="ارتباك"; }
                else { result.effectsApplied.push({ type: 'poison', val: 100 + Math.floor(skill.currentLevel * 5), turns: 3 }); }
                result.log = `🌀 **${getName(attacker)}** أطلق فوضى (${msg})!`;
            }
            else if (skill.stat_type === 'Execute_Heal') { 
                result.damage = skillPower;
                result.effectsApplied.push({ type: 'poison', val: 100 + Math.floor(skill.currentLevel * 5), turns: 3 });
                
                if ((defender.hp || 0) < (defender.maxHp || 100) * 0.20) {
                    result.damage *= 2; 
                    result.heal = Math.floor((attacker.maxHp || 100) * 0.25);
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
            
            let buffPercent = rawValue / 100;
            if (buffPercent > 1.0) buffPercent = 1.0;
            result.selfEffects.push({ type: 'atk_buff', val: buffPercent, turns: 2 });
            
            const shieldAmount = Math.floor(((attacker.maxHp || 100) * 0.15) + (skillPower * 0.2)); 
            result.shield = shieldAmount;
            
            result.log = `⚔️ **${getName(attacker)}** استخدم تكتيك القائد (تطهير + درع + تعزيز)!`;
            break;
        }

        case 'Lifesteal_Overheal': {
            result.damage = Math.floor(skillPower * 1.15);
            
            if (Math.random() < 0.60) {
                const bleedDmg = Math.floor(result.damage * 0.15); 
                const finalBleed = Math.max(30, bleedDmg);
                result.effectsApplied.push({ type: 'burn', val: finalBleed, turns: 2 });

                const potentialHeal = Math.floor(result.damage * 0.25); 
                const currentHp = attacker.hp || 0;
                const maxHp = attacker.maxHp || 100;
                const missingHp = maxHp - currentHp;

                if (potentialHeal > missingHp) {
                    result.heal = missingHp;
                    const overflow = potentialHeal - missingHp;
                    result.shield = Math.floor(overflow * 0.15); 
                    result.log = `🩸 **${getName(attacker)}** مزق جسد الخصم! (شفاء +${result.heal} | درع +${result.shield} | نزيف)`;
                } else {
                    result.heal = potentialHeal;
                    result.log = `🩸 **${getName(attacker)}** نهش الخصم! (+${potentialHeal} HP | نزيف)`;
                }
            } else {
                result.log = `🦇 **${getName(attacker)}** ضرب الخصم بشراسة، لكنه فشل في امتصاص دمه! (${result.damage} ضرر فقط)`;
            }
            break;
        }
        
        case 'Reflect_Tank': {
            const tankPower = Math.floor((attacker.maxHp || 100) * 0.2); 
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
