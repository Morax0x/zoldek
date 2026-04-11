const { cleanDisplayName, getBalancedPvPMultiplier } = require('./pvp-utils.js');

function calculateDamage(attacker, defender, multiplier = 1) {
    if (!attacker || !defender) return { finalDmg: 0, isCrit: false, lifestealAmount: 0 };
    if (!attacker.effects) attacker.effects = {};
    if (!defender.effects) defender.effects = {};

    // 1. حساب الضرر الأساسي
    let baseDmg = attacker.damage || attacker.atk || (attacker.weapon ? attacker.weapon.currentDamage : 15);
    
    if (attacker.effects.buff > 0) baseDmg *= (1 + attacker.effects.buff);
    if (attacker.effects.weaken > 0) baseDmg *= (1 - attacker.effects.weaken);

    // 2. حساب الكريت
    let isCrit = false;
    let critChance = attacker.critChance !== undefined ? (attacker.critChance / 100) : 0.15;
    if (critChance > 0.75) critChance = 0.75; // سقف الكريت

    if (Math.random() < critChance) {
        isCrit = true;
        baseDmg = Math.floor(baseDmg * 1.5);
    }

    // 3. تخفيف الضرر بناءً على دفاع الخصم (Armor Mitigation)
    const defenderDef = defender.defense || 0;
    let defMitigation = Math.min(0.60, defenderDef / (defenderDef + 300)); 
    let damageReduction = defMitigation;

    if (defender.effects.shield > 0) {
        // الدرع المؤقت من المهارات يمتص الضرر
    }
    // وضعية الدفاع اليدوي
    if (defender.defending) damageReduction += 0.4;
    if (damageReduction > 0.9) damageReduction = 0.9;

    let rawDmg = Math.floor((baseDmg * multiplier) * (1 - damageReduction));

    // 4. المراوغة
    if (defender.effects.evasion > 0 || (defender.effects && Array.isArray(defender.effects) && defender.effects.some(e => e.type === 'evasion'))) {
        return { finalDmg: 0, isCrit: false, lifestealAmount: 0, isEvasion: true };
    }

    let finalDmg = rawDmg;

    // 5. استهلاك الدرع المؤقت
    if (defender.effects.shield > 0) {
        if (defender.effects.shield >= finalDmg) {
            defender.effects.shield -= finalDmg;
            finalDmg = 0;
        } else {
            finalDmg -= defender.effects.shield;
            defender.effects.shield = 0;
        }
    }

    // 6. الانعكاس (Rebound)
    if (defender.effects.rebound_active > 0) {
        const reflectedDmg = Math.floor(finalDmg * defender.effects.rebound_active);
        attacker.hp -= reflectedDmg;
        finalDmg -= reflectedDmg;
    }

    finalDmg = Math.max(1, finalDmg); // أقل ضرر هو 1 إذا لم يراوغ

    // 7. حساب سرقة الحياة (Lifesteal)
    let lifestealAmount = 0;
    if (attacker.lifesteal > 0 && finalDmg > 0) {
        lifestealAmount = Math.floor(finalDmg * (attacker.lifesteal / 100));
    }

    return { finalDmg, isCrit, lifestealAmount };
}

function applySkillEffect(battleState, attackerId, skill) {
    if (!skill || !skill.id) return "⚠️ مهارة غير صالحة!";
    
    const cooldownDuration = skill.id.startsWith('race_') ? 5 : 3;
    if (!battleState.skillCooldowns[attackerId]) battleState.skillCooldowns[attackerId] = {};
    battleState.skillCooldowns[attackerId][skill.id] = cooldownDuration;

    const attacker = battleState.players.get(attackerId);
    const defenderId = battleState.turn.find(id => id !== attackerId);
    const defender = battleState.players.get(defenderId);

    if (!attacker || !defender) return "⚠️ حدث خطأ: تعذر العثور على بيانات الخصم!";
    if (!attacker.effects) attacker.effects = {};
    if (!defender.effects) defender.effects = {};

    const attackerName = attacker.isMonster ? attacker.name : cleanDisplayName(attacker.member?.displayName || attacker.member?.user?.username || 'مقاتل');

    const effectValue = skill.effectValue || 0;
    const statType = skill.stat_type;
    const skillLevel = skill.currentLevel || 1;

    let baseAtk = attacker.damage || attacker.atk || (attacker.weapon ? attacker.weapon.currentDamage : 15);
    if (attacker.effects.buff > 0) baseAtk *= (1 + attacker.effects.buff);
    if (attacker.effects.weaken > 0) baseAtk *= (1 - attacker.effects.weaken);

    const attackerMaxHp = attacker.maxHp || 100;

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
                const selfDmg = Math.floor((attacker.hp || 100) * 0.03); 
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
            
            const shieldVal = Math.floor(attackerMaxHp * shieldPercent);
            attacker.effects.shield += shieldVal;
            attacker.effects.buff = 0.2;
            attacker.effects.buff_turns = 2;
            return `⚔️ **${attackerName}** طهر نفسه واكتسب درعاً وقوة!`;
        }
        case 'Scale_MissingHP_Heal': {
            const missingHpPercent = Math.max(0, (attackerMaxHp - (attacker.hp || 0)) / attackerMaxHp);
            const extraDmg = Math.floor(baseAtk * missingHpPercent * 2);
            const multi = getBalancedPvPMultiplier(1.2, skillLevel);
            const dmg = Math.floor(baseAtk * multi) + extraDmg;
            defender.hp -= dmg;
            
            let healPercent = 0.15;
            if(skillLevel > 15) healPercent += ((0.25 - 0.15) / 15) * (skillLevel - 15);
            if(skillLevel >= 30) healPercent = 0.25;
            
            const healVal = Math.floor(attackerMaxHp * healPercent);
            attacker.hp = Math.min(attackerMaxHp, (attacker.hp || 0) + healVal);
            return `⚖️ **${attackerName}** عاقب خصمه بضرر متصاعد (${dmg}) وشفى نفسه!`;
        }
        case 'Sacrifice_Crit': {
            const selfDmg = Math.floor(attackerMaxHp * 0.10);
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
                const missingHp = attackerMaxHp - currentHp;

                if (healVal > missingHp) {
                    attacker.hp = attackerMaxHp;
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
            
            attacker.effects.shield += Math.floor(attackerMaxHp * shieldPercent);
            attacker.effects.rebound_active = 0.4; attacker.effects.rebound_turns = 2;
            return `🔨 **${attackerName}** تحصن بالجبل (دفاع وعكس ضرر)!`;
        }
        case 'Execute_Heal': { 
            const multi = getBalancedPvPMultiplier(1.6, skillLevel);
            const dmg = Math.floor(baseAtk * multi);
            
            const ghoulPoison = 50 + (skillLevel * 25);
            defender.effects.poison = ghoulPoison;
            defender.effects.poison_turns = 3;

            if ((defender.hp || 0) - dmg <= 0) {
                defender.hp = 0;
                attacker.hp = Math.min(attackerMaxHp, (attacker.hp || 0) + Math.floor(attackerMaxHp * 0.25));
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
                    attacker.effects.shield += Math.floor(attackerMaxHp * (effectValue / 100));
                    return `🛡️ **${attackerName}** اكتسب درعاً!`;
                case 'skill_buffing':
                    attacker.effects.buff = effectValue / 100; attacker.effects.buff_turns = 3;
                    return `💪 **${attackerName}** رفع قوته!`;
                case 'skill_rebound':
                    attacker.effects.rebound_active = effectValue / 100; attacker.effects.rebound_turns = 3;
                    return `🔄 **${attackerName}** جهز الانعكاس!`;
                case 'skill_healing':
                    const heal = Math.floor(attackerMaxHp * (effectValue / 100));
                    attacker.hp = Math.min(attackerMaxHp, (attacker.hp || 0) + heal);
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
                        shield: 0, buff: 0, buff_turns: 0, weaken: 0, weaken_turns: 0, 
                        poison: 0, poison_turns: 0, rebound_active: 0, rebound_turns: 0, 
                        penetrate: 0, burn: 0, burn_turns: 0, stun: false, stun_turns: 0, 
                        confusion: false, confusion_turns: 0, evasion: 0, evasion_turns: 0, blind: 0, blind_turns: 0 
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
                    const { finalDmg, isCrit } = calculateDamage(attacker, defender, skill.stat_type === '%' ? 1.5 : 1);
                    defender.hp -= finalDmg;
                    return `💥 **${attackerName}** استخدم ${skill.name} وسبب ${finalDmg} ضرر${isCrit ? ' (كريت!)' : ''}!`;
            }
    }
}

function applyPersistentEffects(battleState, attackerId) {
    let logEntries = [];
    let skipTurn = false;

    const attacker = battleState.players.get(attackerId);
    if (!attacker) return { logEntries, skipTurn };
    if (!attacker.effects) attacker.effects = {};

    const attackerName = attacker.isMonster ? attacker.name : cleanDisplayName(attacker.member?.displayName || attacker.member?.user?.username || 'مقاتل');

    if (attacker.effects.stun) {
        logEntries.push(`⚡ **${attackerName}** مشلول ولا يستطيع الحركة!`);
        skipTurn = true;
    }

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

    return { logEntries, skipTurn };
}

module.exports = {
    calculateDamage,
    applySkillEffect,
    applyPersistentEffects
};
