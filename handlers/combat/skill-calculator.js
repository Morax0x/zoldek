const { cleanDisplayName } = require('../dungeon/utils');

const GLOBAL_SKILL_MULTIPLIER = 5.0;

// ── Probability helpers ───────────────────────────────────────────────────────

/** Returns true with the given probability (0–1). */
function roll(probability) {
    return Math.random() < probability;
}

/** Picks one element at random from an array. */
function pickOne(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

// ── Effect label map (for dynamic log messages) ───────────────────────────────

const EFFECT_LABELS = {
    burn:       '🔥 حرق',
    silence:    '🔇 صمت',
    vulnerable: '💔 هشاشة',
    weaken:     '📉 إضعاف',
    stun:       '😵 شلل',
    confusion:  '🌀 ارتباك',
    poison:     '☠️ تسمم',
    bleed:      '🩸 نزيف',
    blind:      '🙈 عمى',
    bat:        '🦇 شفط الدم',
    taunt:      '😤 استفزاز',
    thorns:     '🌵 أشواك',
    reflect:    '🔄 انعكاس',
    evasion:    '👻 مراوغة',
    cleanse:    '✨ تطهير',
    atk_buff:   '💪 تعزيز',
};

function label(type) {
    return EFFECT_LABELS[type] || type;
}

// ── Target-effect factory (guarantees consistent shape) ───────────────────────

function makeTargetEffect(type) {
    switch (type) {
        case 'burn':       return { type: 'burn',       val: 100,  turns: 3 };
        case 'silence':    return { type: 'silence',    val: true, turns: 2 };
        case 'vulnerable': return { type: 'vulnerable', val: 0.3,  turns: 2 };
        case 'weaken':     return { type: 'weaken',     val: 0.3,  turns: 2 };
        case 'stun':       return { type: 'stun',       val: true, turns: 1 };
        case 'confusion':  return { type: 'confusion',  val: true, turns: 2 };
        case 'poison':     return { type: 'poison',     val: 100,  turns: 3 };
        case 'bleed':      return { type: 'bleed',      val: 100,  turns: 3 };
        case 'blind':      return { type: 'blind',      val: true, turns: 2 };
        case 'bat':        return { type: 'bat',        val: 0.05, turns: 5 };
        default:           return null;
    }
}

// General pool used as the Hybrid fail-safe source
const GENERAL_FALLBACK_POOL = ['burn', 'poison', 'confusion', 'weaken', 'silence', 'vulnerable', 'blind'];

/**
 * Fail-safe: pick one effect from `pool`, push it to result.effectsApplied,
 * and return a label string to append to the log (marked with ✦).
 */
function applyFailSafe(result, pool) {
    const chosen = pickOne(pool);
    const effect = makeTargetEffect(chosen);
    if (effect) result.effectsApplied.push(effect);
    return `${label(chosen)} ✦`;
}

// ── Skill power calculation ───────────────────────────────────────────────────

function calculateSkillRawValue(skillConfig, currentLevel) {
    if (!skillConfig) return 0;
    const level = Math.max(1, currentLevel || 1);

    const base = skillConfig.base_value;
    const inc  = skillConfig.value_increment;
    const isPercentage = skillConfig.stat_type === '%'
        || skillConfig.id.includes('heal')
        || skillConfig.id.includes('shield');

    if (level <= 15) {
        return Math.floor(base + (inc * (level - 1)));
    } else {
        const valueAt15        = base + (inc * 14);
        const targetValueAt30  = isPercentage ? 70 : 200;
        const dynamicIncrement = (targetValueAt30 - valueAt15) / 15;
        if (level >= 30) return targetValueAt30;
        return Math.floor(valueAt15 + (dynamicIncrement * (level - 15)));
    }
}

function getName(entity) {
    if (entity.isMonster) return entity.name;
    if (entity.member)    return cleanDisplayName(entity.member.user.displayName);
    return entity.name || 'Unknown';
}

// ── executeSkill ──────────────────────────────────────────────────────────────

function executeSkill(attacker, defender, skill, isOwner = false) {
    const result = {
        damage:         0,
        heal:           0,
        shield:         0,   // kept for generic utility skills (skill_shielding etc.)
        selfDamage:     0,
        effectsApplied: [],  // debuffs / effects applied TO the target
        selfEffects:    [],  // buffs / effects applied TO the attacker
        log:            '',
        trueDamage:     false, // Human True Blade flag — bypass defence in caller
    };

    const multiplier = isOwner ? 10 : 1;
    const rawValue   = calculateSkillRawValue(skill, skill.currentLevel);

    // Skill-power base: HP-based only for heal/shield utility skills
    let skillPower = 0;
    if (skill.id.includes('heal') || skill.id.includes('shield')) {
        skillPower = Math.floor(attacker.maxHp * (rawValue / 100));
    } else {
        skillPower = Math.floor(rawValue * GLOBAL_SKILL_MULTIPLIER);
    }

    // Apply attacker ATK-buff / weaken modifiers (not on heal/shield utilities)
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

    // ─────────────────────────────────────────────────────────────────────────
    switch (skill.stat_type) {

    // ── Non-race utility skills ───────────────────────────────────────────────

    case 'Gamble_Dmg': {
        if (Math.random() < 0.5) {
            const dmg = Math.floor(Math.random() * (2222 - 777 + 1)) + 777;
            result.damage = dmg;
            result.log = `🎲 **${getName(attacker)}** نجحت مقامرته! الأرقام تطابقت بضرر **${dmg}**!`;
        } else {
            const fail    = Math.floor(Math.random() * (200 - 100 + 1)) + 100;
            const selfDmg = Math.floor(attacker.hp * 0.03);
            result.damage     = fail;
            result.selfDamage = selfDmg;
            result.log = `🎲 **${getName(attacker)}** خسر الرهان... خدش الخصم بـ **${fail}** وأذى نفسه بـ **${selfDmg}**!`;
        }
        break;
    }

    case 'Buff_All': {
        result.selfEffects.push({ type: 'atk_buff', val: rawValue / 100, turns: 3 });
        result.log = `📢 **${getName(attacker)}** أطلق صيحة الحرب! زاد هجومه ${rawValue}%!`;
        break;
    }

    case 'Dmg_Evasion': {
        result.damage = Math.floor(skillPower * 1.3);
        result.selfEffects.push({ type: 'evasion', val: true, turns: 1 });
        result.log = `👻 **${getName(attacker)}** ضرب واختفى! (${result.damage} ضرر + مراوغة)`;
        break;
    }

    case 'Poison_Blade': {
        result.damage = Math.floor(skillPower * 1.2);
        result.effectsApplied.push({ type: 'poison', val: Math.floor(skillPower * 0.4), turns: 3 });
        result.log = `🐍 **${getName(attacker)}** غرز نصل السموم! (${result.damage} ضرر + سم)`;
        break;
    }

    // ── Generic skill-ID router ('%' stat_type) ───────────────────────────────

    case '%': {
        if (skill.id === 'skill_shielding') {
            result.shield = skillPower;
            result.log = `🛡️ **${getName(attacker)}** رفع درعه (+${result.shield})!`;
        } else if (skill.id === 'skill_healing') {
            result.heal = skillPower;
            result.log = `💖 **${getName(attacker)}** استعاد ${result.heal} HP!`;
        } else if (skill.id === 'skill_buffing') {
            const buffPct = Math.min(rawValue / 100, 1.0);
            result.selfEffects.push({ type: 'atk_buff', val: buffPct, turns: 3 });
            result.log = `💪 **${getName(attacker)}** غضب ورفع قوته ${rawValue}%!`;
        } else if (skill.id === 'skill_poison') {
            result.damage = skillPower;
            result.effectsApplied.push({ type: 'poison', val: 100, turns: 3 });
            result.log = `☠️ **${getName(attacker)}** سمم خصمه!`;
        } else if (skill.id === 'skill_rebound') {
            result.selfEffects.push({ type: 'reflect', val: rawValue / 100, turns: 3 });
            result.log = `🔄 **${getName(attacker)}** جهز درع الانعكاس (${rawValue}%)!`;
        } else if (skill.id === 'skill_weaken') {
            result.effectsApplied.push({ type: 'weaken', val: rawValue / 100, turns: 3 });
            result.log = `📉 **${getName(attacker)}** أضعف هجوم خصمه ${rawValue}%!`;
        } else if (skill.id === 'skill_dispel') {
            result.effectsApplied.push({ type: 'dispel' });
            result.log = `💨 **${getName(attacker)}** بدد كل سحر الخصم!`;
        } else if (skill.id === 'skill_cleanse') {
            result.selfEffects.push({ type: 'cleanse' });
            result.heal = Math.floor(attacker.maxHp * 0.1);
            result.log = `✨ **${getName(attacker)}** طهر نفسه من اللعنات!`;
        } else {
            result.damage = skillPower;
            result.log = `💥 **${getName(attacker)}** استخدم ${skill.name} وسبب ${result.damage} ضرر!`;
        }
        break;
    }

    // ── RACE SKILLS ───────────────────────────────────────────────────────────
    // Each race:
    //   1. Calculates damage using its unique trait.
    //   2. Rolls each Special Effect independently.
    //   3. If effectsApplied is still empty → applyFailSafe() guarantees at
    //      least one target debuff (the Fail-Safe Mechanic).
    //   4. Builds a dynamic log that names every effect that fired.
    // ─────────────────────────────────────────────────────────────────────────

    // ── Dragon — Massive Direct DMG ───────────────────────────────────────────
    // Special Effects: Burn 50% | Silence 30% | Vulnerable 20%
    // Fallback: Weaken OR Stun
    case 'TrueDMG_Burn': {
        result.damage = Math.floor(skillPower * 1.2);
        const fx = [];

        if (roll(0.50)) { result.effectsApplied.push(makeTargetEffect('burn'));       fx.push(label('burn')); }
        if (roll(0.30)) { result.effectsApplied.push(makeTargetEffect('silence'));    fx.push(label('silence')); }
        if (roll(0.20)) { result.effectsApplied.push(makeTargetEffect('vulnerable')); fx.push(label('vulnerable')); }

        if (result.effectsApplied.length === 0) fx.push(applyFailSafe(result, ['weaken', 'stun']));

        result.log = `🐲 **${getName(attacker)}** نفـث النـيران! سبب **${result.damage}** ضرر [${fx.join(' · ')}]`;
        break;
    }

    // ── Elf — Agile DMG (20% chance for 1.5x) ────────────────────────────────
    // Special Effects: Stun 40% | Weaken 50% | Silence 30%
    // Fallback: Confusion OR Blind
    case 'Stun_Vulnerable': {
        const agile = roll(0.20);
        result.damage = agile ? Math.floor(skillPower * 1.5) : skillPower;
        const fx = agile ? ['⚡ ضربة خارقة'] : [];

        if (roll(0.40)) { result.effectsApplied.push(makeTargetEffect('stun'));    fx.push(label('stun')); }
        if (roll(0.50)) { result.effectsApplied.push(makeTargetEffect('weaken'));  fx.push(label('weaken')); }
        if (roll(0.30)) { result.effectsApplied.push(makeTargetEffect('silence')); fx.push(label('silence')); }

        if (result.effectsApplied.length === 0) fx.push(applyFailSafe(result, ['confusion', 'blind']));

        result.log = `🏹 **${getName(attacker)}** انطلق كالريح! سبب **${result.damage}** ضرر [${fx.join(' · ')}]`;
        break;
    }

    // ── Dark Elf — Assassination DMG (1.5x if target is Confused) ────────────
    // Special Effects: Confusion 50% | Silence 40% | Poison 40%
    // Fallback: Stun OR Bleed
    case 'Confusion': {
        const isConfused = defender.effects && defender.effects.some(e => e.type === 'confusion');
        result.damage = isConfused ? Math.floor(skillPower * 1.5) : skillPower;
        const fx = isConfused ? ['🎯 اغتيال'] : [];

        if (roll(0.50)) { result.effectsApplied.push(makeTargetEffect('confusion')); fx.push(label('confusion')); }
        if (roll(0.40)) { result.effectsApplied.push(makeTargetEffect('silence'));   fx.push(label('silence')); }
        if (roll(0.40)) { result.effectsApplied.push(makeTargetEffect('poison'));    fx.push(label('poison')); }

        if (result.effectsApplied.length === 0) fx.push(applyFailSafe(result, ['stun', 'bleed']));

        result.log = `🗡️ **${getName(attacker)}** طعن من الظلام! سبب **${result.damage}** ضرر [${fx.join(' · ')}]`;
        break;
    }

    // ── Demon — Explosive DMG (attacker loses 10% MaxHP) ─────────────────────
    // Special Effects: Vulnerable 50% | Burn 50% | Silence 30%
    // Fallback: Poison OR Confusion
    case 'Sacrifice_Crit': {
        result.damage     = Math.floor(skillPower * 1.2);
        result.selfDamage = Math.floor(attacker.maxHp * 0.10);
        const fx = [];

        if (roll(0.50)) { result.effectsApplied.push(makeTargetEffect('vulnerable')); fx.push(label('vulnerable')); }
        if (roll(0.50)) { result.effectsApplied.push(makeTargetEffect('burn'));        fx.push(label('burn')); }
        if (roll(0.30)) { result.effectsApplied.push(makeTargetEffect('silence'));     fx.push(label('silence')); }

        if (result.effectsApplied.length === 0) fx.push(applyFailSafe(result, ['poison', 'confusion']));

        result.log = `👹 **${getName(attacker)}** فجّر طاقته الشيطانية! سبب **${result.damage}** ضرر (وأذى نفسه **${result.selfDamage}**) [${fx.join(' · ')}]`;
        break;
    }

    // ── Seraphim — Vengeful DMG (scales on attacker's missing HP) ────────────
    // Special Effects: Heal Self 50% | Silence 40% | Vulnerable 30%
    // Fallback: Burn OR Weaken
    case 'Scale_MissingHP_Heal': {
        const missingPct = Math.max(0, (attacker.maxHp - attacker.hp) / attacker.maxHp);
        result.damage = Math.floor(skillPower * (1 + missingPct * 0.8));
        const fx = [];

        if (roll(0.50)) {
            result.heal = Math.floor(attacker.maxHp * 0.25);
            fx.push(`💚 شفاء (+${result.heal})`);
        }
        if (roll(0.40)) { result.effectsApplied.push(makeTargetEffect('silence'));    fx.push(label('silence')); }
        if (roll(0.30)) { result.effectsApplied.push(makeTargetEffect('vulnerable')); fx.push(label('vulnerable')); }

        if (result.effectsApplied.length === 0) fx.push(applyFailSafe(result, ['burn', 'weaken']));

        result.log = `⚖️ **${getName(attacker)}** انتقم بقوة الجراح! سبب **${result.damage}** ضرر [${fx.join(' · ')}]`;
        break;
    }

    // ── Spirit — Ethereal DMG (x1.15, ignores 15% def) ──────────────────────
    // Special Effects: Evasion (self) 30% | Silence 50% | Reflect (self) 30%
    // Fallback: Confusion OR Stun
    case 'Spirit_RNG': {
        result.damage = Math.floor(skillPower * 1.15);
        const fx = [];

        if (roll(0.30)) { result.selfEffects.push({ type: 'evasion', val: true, turns: 1 }); fx.push(label('evasion')); }
        if (roll(0.50)) { result.effectsApplied.push(makeTargetEffect('silence'));              fx.push(label('silence')); }
        if (roll(0.30)) { result.selfEffects.push({ type: 'reflect', val: 0.3,  turns: 2 });   fx.push(label('reflect')); }

        if (result.effectsApplied.length === 0) fx.push(applyFailSafe(result, ['confusion', 'stun']));

        result.log = `👻 **${getName(attacker)}** أرسل روحاً شبحية! سبب **${result.damage}** ضرر [${fx.join(' · ')}]`;
        break;
    }

    // ── Hybrid — Primal Chaos (random 0.8x–1.2x DMG) ─────────────────────────
    // Special Effects: Stun 30% | Confusion 40% | Bleed 40%
    // Fallback: Any 1 Random from General Pool
    case 'Chaos_RNG': {
        const variance = 0.8 + Math.random() * 0.4;
        result.damage = Math.floor(skillPower * variance);
        const fx = [];

        if (roll(0.30)) { result.effectsApplied.push(makeTargetEffect('stun'));      fx.push(label('stun')); }
        if (roll(0.40)) { result.effectsApplied.push(makeTargetEffect('confusion')); fx.push(label('confusion')); }
        if (roll(0.40)) { result.effectsApplied.push(makeTargetEffect('bleed'));     fx.push(label('bleed')); }

        if (result.effectsApplied.length === 0) fx.push(applyFailSafe(result, GENERAL_FALLBACK_POOL));

        result.log = `🌀 **${getName(attacker)}** أطلق فوضى عارمة! سبب **${result.damage}** ضرر [${fx.join(' · ')}]`;
        break;
    }

    // ── Ghoul — Execute DMG (x2 if target HP < 20%) ──────────────────────────
    // Special Effects: Poison 50% | Weaken 50% | Silence 30%
    // Fallback: Confusion OR Bleed
    case 'Execute_Heal': {
        const isExecute = defender.hp < defender.maxHp * 0.20;
        result.damage = isExecute ? Math.floor(skillPower * 2) : skillPower;
        const fx = isExecute ? ['💀 إعدام'] : [];

        if (roll(0.50)) { result.effectsApplied.push(makeTargetEffect('poison'));  fx.push(label('poison')); }
        if (roll(0.50)) { result.effectsApplied.push(makeTargetEffect('weaken'));  fx.push(label('weaken')); }
        if (roll(0.30)) { result.effectsApplied.push(makeTargetEffect('silence')); fx.push(label('silence')); }

        if (result.effectsApplied.length === 0) fx.push(applyFailSafe(result, ['confusion', 'bleed']));

        result.log = `🧟 **${getName(attacker)}** هاجم بشراسة! سبب **${result.damage}** ضرر [${fx.join(' · ')}]`;
        break;
    }

    // ── Vampire — Drain DMG (always heals 25% of DMG dealt) ──────────────────
    // Special Effects: Bat 50% | Bleed 50% | Silence 20%
    // Fallback: Weaken OR Confusion
    case 'Lifesteal_Overheal': {
        result.damage = skillPower;
        result.heal   = Math.floor(skillPower * 0.25);   // always drains
        const fx = [];

        if (roll(0.50)) { result.effectsApplied.push(makeTargetEffect('bat'));     fx.push(label('bat')); }
        if (roll(0.50)) { result.effectsApplied.push(makeTargetEffect('bleed'));   fx.push(label('bleed')); }
        if (roll(0.20)) { result.effectsApplied.push(makeTargetEffect('silence')); fx.push(label('silence')); }

        if (result.effectsApplied.length === 0) fx.push(applyFailSafe(result, ['weaken', 'confusion']));

        result.log = `🦇 **${getName(attacker)}** مص دماء خصمه! سبب **${result.damage}** ضرر وامتص **${result.heal}** HP [${fx.join(' · ')}]`;
        break;
    }

    // ── Dwarf — Hammer DMG (x1.4 skill power) ────────────────────────────────
    // Special Effects: Taunt (self) 50% | Thorns (self) 50% | Reflect (self) 40%
    // Fallback: Stun OR Weaken (applied to target)
    case 'Reflect_Tank': {
        result.damage = Math.floor(skillPower * 1.4);
        const fx = [];

        if (roll(0.50)) { result.selfEffects.push({ type: 'taunt',  val: true, turns: 2 }); fx.push(label('taunt')); }
        if (roll(0.50)) { result.selfEffects.push({ type: 'thorns', val: 0.3,  turns: 2 }); fx.push(label('thorns')); }
        if (roll(0.40)) { result.selfEffects.push({ type: 'reflect', val: 0.4, turns: 2 }); fx.push(label('reflect')); }

        // Fail-safe always checks effectsApplied (target debuffs), not selfEffects
        if (result.effectsApplied.length === 0) fx.push(applyFailSafe(result, ['stun', 'weaken']));

        result.log = `⚒️ **${getName(attacker)}** هوى بمطرقته! سبب **${result.damage}** ضرر [${fx.join(' · ')}]`;
        break;
    }

    // ── Human — True Blade (True DMG, bypasses defender's armour) ────────────
    // Special Effects: Cleanse Self 50% | Atk Buff Self 50% | Silence 40%
    // Fallback: Vulnerable OR Weaken (applied to target)
    case 'Cleanse_Buff_Shield': {
        result.damage    = skillPower;
        result.trueDamage = true;   // signal to caller: skip defence reduction
        const fx = [];

        if (roll(0.50)) { result.selfEffects.push({ type: 'cleanse' });                          fx.push(label('cleanse')); }
        if (roll(0.50)) { result.selfEffects.push({ type: 'atk_buff', val: 0.3, turns: 3 });    fx.push(label('atk_buff')); }
        if (roll(0.40)) { result.effectsApplied.push(makeTargetEffect('silence'));               fx.push(`${label('silence')} (خصم)`); }

        if (result.effectsApplied.length === 0) fx.push(applyFailSafe(result, ['vulnerable', 'weaken']));

        result.log = `⚔️ **${getName(attacker)}** شقّ الدفاعات بضربة الحقيقة! سبب **${result.damage}** ضرر حقيقي [${fx.join(' · ')}]`;
        break;
    }

    // ── Default fallback ──────────────────────────────────────────────────────

    default:
        result.damage = skillPower;
        result.log = `💥 **${getName(attacker)}** استخدم ${skill.name} وسبب ${result.damage} ضرر!`;
        break;

    } // end switch

    return result;
}

module.exports = { calculateSkillRawValue, executeSkill };
