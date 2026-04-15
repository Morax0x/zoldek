const { cleanDisplayName } = require('../dungeon/utils');

const GLOBAL_SKILL_MULTIPLIER = 5.0;

/** إرجاع True بناءً على النسبة المئوية (0 - 1) */
function roll(probability) {
    return Math.random() < probability;
}

/** اختيار عنصر عشوائي من مصفوفة */
function pickOne(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

// ── قاموس التأثيرات (للسجلات الديناميكية) ───────────────────────────────

const EFFECT_LABELS = {
    burn:       '🔥 حرق',
    silence:    '🔇 صمت',
    vulnerable: '🎯 هشاشة',
    weaken:     '📉 إضعاف',
    stun:       '😵 شلل',
    confusion:  '🌀 ارتباك',
    poison:     '☠️ تسمم',
    bleed:      '🩸 نزيف',
    blind:      '👁️ عمى',
    bat:        '🦇 خفاش طفيلي',
    taunt:      '🤬 استفزاز',
    thorns:     '🌵 أشواك',
    reflect:    '🔄 انعكاس',
    evasion:    '👻 مراوغة',
    cleanse:    '✨ تطهير',
    atk_buff:   '💪 تعزيز هجوم',
};

function label(type) {
    return EFFECT_LABELS[type] || type;
}

// ── مصنع التأثيرات على الخصم ───────────────────────

function makeTargetEffect(type) {
    switch (type) {
        case 'burn':       return { type: 'burn',        val: 100,  turns: 3 };
        case 'silence':    return { type: 'silence',     val: true, turns: 2 };
        case 'vulnerable': return { type: 'vulnerable', val: 0.3,  turns: 2 };
        case 'weaken':     return { type: 'weaken',      val: 0.3,  turns: 2 };
        case 'stun':       return { type: 'stun',        val: true, turns: 1 };
        case 'confusion':  return { type: 'confusion',  val: true, turns: 2 };
        case 'poison':     return { type: 'poison',      val: 100,  turns: 3 };
        case 'bleed':      return { type: 'bleed',       val: 100,  turns: 3 };
        case 'blind':      return { type: 'blind',       val: true, turns: 2 };
        case 'bat':        return { type: 'bat',         val: 0.05, turns: 5 };
        default:           return null;
    }
}

// ── حساب قوة المهارة ───────────────────────────────────────────────────

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

// ── الدالة الرئيسية لتنفيذ المهارات ─────────────────────────────────────

function executeSkill(attacker, defender, skill, isOwner = false) {
    const result = {
        damage:         0,
        heal:           0,
        shield:         0,   
        selfDamage:     0,
        effectsApplied: [],  
        selfEffects:    [],  
        log:            '',
        trueDamage:     false, 
    };

    const multiplier = isOwner ? 10 : 1;
    const rawValue   = calculateSkillRawValue(skill, skill.currentLevel);

    // 🐾 غريزة نصف الوحش: نسخ عشوائي لأي مهارة عرق أخرى
    let activeStatType = skill.stat_type;
    let isHybrid = false;

    if (activeStatType === 'Chaos_RNG') {
        isHybrid = true;
        const allRaceSkills = [
            'TrueDMG_Burn', 'Stun_Vulnerable', 'Confusion', 'Sacrifice_Crit',
            'Scale_MissingHP_Heal', 'Spirit_RNG', 'Execute_Heal', 'Lifesteal_Overheal',
            'Reflect_Tank', 'Cleanse_Buff_Shield'
        ];
        activeStatType = pickOne(allRaceSkills);
    }

    let skillPower = 0;
    const hpBasedSkills = ['Reflect_Tank', 'Cleanse_Buff_Shield'];

    if (skill.id.includes('heal') || skill.id.includes('shield') || hpBasedSkills.includes(activeStatType)) {
        skillPower = Math.floor(attacker.maxHp * (rawValue / 100));
    } else {
        skillPower = Math.floor(rawValue * GLOBAL_SKILL_MULTIPLIER);
    }

    // 🔥 فرز المهارات الهجومية عن السلمية لمنع الكريت الخاطئ 🔥
    const nonAttackSkills = ['skill_healing', 'skill_shielding', 'skill_buffing', 'skill_rebound', 'skill_weaken', 'skill_dispel', 'skill_cleanse'];
    const isAttackSkill = !nonAttackSkills.includes(skill.id) && !hpBasedSkills.includes(activeStatType);

    let isCritSkill = false;
    let critChance = 0.05; 

    if (isAttackSkill) {
        let buffMultiplier = 1.0;
        if (attacker.effects && Array.isArray(attacker.effects)) {
            attacker.effects.forEach(e => {
                if (e.type === 'atk_buff' || e.type === 'buff') buffMultiplier += e.val;
                if (e.type === 'weaken') buffMultiplier -= e.val;
            });
        }
        
        if (attacker.critRate) critChance += (Number(attacker.critRate) / 100);
        if (critChance > 0.75) critChance = 0.75;
        
        if (roll(critChance)) {
            buffMultiplier *= 1.5;
            isCritSkill = true;
        }

        skillPower = Math.floor(skillPower * buffMultiplier);
    }

    skillPower = Math.floor(skillPower * multiplier);

    switch (activeStatType) {

    // ── مهارات الأعراق النظيفة 100% ──────────────────────────────────────────

    // 🐲 التنين
    case 'TrueDMG_Burn': {
        result.damage = Math.floor(skillPower * 1.2);
        const fx = [];

        if (roll(0.50)) { result.effectsApplied.push(makeTargetEffect('burn'));       fx.push(label('burn')); }
        if (roll(0.30)) { result.effectsApplied.push(makeTargetEffect('vulnerable')); fx.push(label('vulnerable')); }

        result.log = `🐲 **${getName(attacker)}** نفـث النـيران! سبب **${result.damage}** ضرر` + (fx.length > 0 ? ` [${fx.join(' · ')}]` : '');
        break;
    }

    // 🧝‍♂️ الآلف
    case 'Stun_Vulnerable': {
        const agile = roll(0.20);
        result.damage = agile ? Math.floor(skillPower * 1.5) : skillPower;
        const fx = agile ? ['⚡ ضربة خارقة'] : [];

        if (roll(0.40)) { result.effectsApplied.push(makeTargetEffect('stun'));    fx.push(label('stun')); }
        if (roll(0.40)) { result.effectsApplied.push(makeTargetEffect('blind'));   fx.push(label('blind')); }

        result.log = `🏹 **${getName(attacker)}** أطلق سهام الرياح! سبب **${result.damage}** ضرر` + (fx.length > 0 ? ` [${fx.join(' · ')}]` : '');
        break;
    }

    // 🧝‍♀️ آلف الظلام
    case 'Confusion': {
        const isConfused = defender.effects && defender.effects.some(e => e.type === 'confusion');
        result.damage = isConfused ? Math.floor(skillPower * 1.5) : skillPower;
        const fx = isConfused ? ['🎯 اغتيال'] : [];

        if (roll(0.50)) { result.effectsApplied.push(makeTargetEffect('confusion')); fx.push(label('confusion')); }
        if (roll(0.40)) { result.effectsApplied.push(makeTargetEffect('poison'));    fx.push(label('poison')); }

        result.log = `🗡️ **${getName(attacker)}** طعن من الظلام! سبب **${result.damage}** ضرر` + (fx.length > 0 ? ` [${fx.join(' · ')}]` : '');
        break;
    }

    // 👹 الشيطان
    case 'Sacrifice_Crit': {
        result.damage     = Math.floor(skillPower * 1.3);
        result.selfDamage = Math.floor(attacker.maxHp * 0.10);
        const fx = [];

        if (roll(0.50)) { result.effectsApplied.push(makeTargetEffect('vulnerable')); fx.push(label('vulnerable')); }
        if (roll(0.40)) { result.effectsApplied.push(makeTargetEffect('burn'));        fx.push(label('burn')); }

        result.log = `👹 **${getName(attacker)}** فجّر طاقته الشيطانية! سبب **${result.damage}** ضرر (وخسر **${result.selfDamage}** HP)` + (fx.length > 0 ? ` [${fx.join(' · ')}]` : '');
        break;
    }

    // 🦅 السيرافيم
    case 'Scale_MissingHP_Heal': {
        const missingPct = Math.max(0, (attacker.maxHp - attacker.hp) / attacker.maxHp);
        result.damage = Math.floor(skillPower * (1 + missingPct * 0.8));
        const fx = [];

        if (roll(0.50)) {
            result.heal = Math.floor(attacker.maxHp * 0.25);
            fx.push(`💚 شفاء (+${result.heal})`);
        }
        if (roll(0.50)) { result.effectsApplied.push(makeTargetEffect('silence')); fx.push(label('silence')); }

        result.log = `⚖️ **${getName(attacker)}** أنزل عقاب السماء! سبب **${result.damage}** ضرر` + (fx.length > 0 ? ` [${fx.join(' · ')}]` : '');
        break;
    }

    // 👻 الروح
    case 'Spirit_RNG': {
        result.damage = Math.floor(skillPower * 1.15);
        const fx = [];

        if (roll(0.40)) { result.selfEffects.push({ type: 'evasion', val: true, turns: 1 }); fx.push(label('evasion')); }
        if (roll(0.40)) { result.effectsApplied.push(makeTargetEffect('confusion'));         fx.push(label('confusion')); }

        result.log = `👻 **${getName(attacker)}** أرسل طيفاً مريباً! سبب **${result.damage}** ضرر` + (fx.length > 0 ? ` [${fx.join(' · ')}]` : '');
        break;
    }

    // 🧟 الغول
    case 'Execute_Heal': {
        const isExecute = defender.hp < defender.maxHp * 0.20;
        result.damage = isExecute ? Math.floor(skillPower * 2) : skillPower;
        const fx = isExecute ? ['💀 إعدام'] : [];

        if (roll(0.60)) { result.effectsApplied.push(makeTargetEffect('poison'));  fx.push(label('poison')); }
        if (roll(0.40)) { result.effectsApplied.push(makeTargetEffect('weaken'));  fx.push(label('weaken')); }

        result.log = `🧟 **${getName(attacker)}** نهش الخصم بتعفن! سبب **${result.damage}** ضرر` + (fx.length > 0 ? ` [${fx.join(' · ')}]` : '');
        break;
    }

    // 🧛 مصاص الدماء
    case 'Lifesteal_Overheal': {
        result.damage = skillPower;
        result.heal   = Math.floor(skillPower * 0.25); 
        const fx = [];

        if (roll(0.60)) { result.effectsApplied.push(makeTargetEffect('bat'));   fx.push(label('bat')); }
        if (roll(0.40)) { result.effectsApplied.push(makeTargetEffect('bleed')); fx.push(label('bleed')); }

        result.log = `🦇 **${getName(attacker)}** مص الدماء! سبب **${result.damage}** ضرر وامتص **${result.heal}** HP` + (fx.length > 0 ? ` [${fx.join(' · ')}]` : '');
        break;
    }

    // 🛡️ القزم
    case 'Reflect_Tank': {
        result.damage = Math.floor(skillPower * 1.4);
        const fx = [];

        if (roll(0.60)) { result.selfEffects.push({ type: 'taunt',  val: true, turns: 2 }); fx.push(label('taunt')); }
        if (roll(0.60)) { result.selfEffects.push({ type: 'thorns', val: 0.3,  turns: 2 }); fx.push(label('thorns')); }

        result.log = `⚒️ **${getName(attacker)}** زأر وهوى بمطرقته! سبب **${result.damage}** ضرر` + (fx.length > 0 ? ` [${fx.join(' · ')}]` : '');
        break;
    }

    // ⚔️ البشري
    case 'Cleanse_Buff_Shield': {
        let dmg = Math.floor(skillPower * 1.2);
        result.trueDamage = true;   
        const fx = ['⚔️ ضرر حقيقي'];

        if (roll(0.30)) {
            dmg = Math.floor(dmg * 1.5);
            fx.push('💥 نصل الإعدام');
        }
        
        result.damage = dmg;

        if (roll(0.50)) { result.selfEffects.push({ type: 'cleanse' });                         fx.push(label('cleanse')); }
        if (roll(0.50)) { result.selfEffects.push({ type: 'atk_buff', val: 0.4, turns: 3 });    fx.push(label('atk_buff')); }

        result.log = `👑 **${getName(attacker)}** قاد بتكتيك متقن! سبب **${result.damage}**` + (fx.length > 0 ? ` [${fx.join(' · ')}]` : '');
        break;
    }

    // ── المهارات العامة (أكاديمية السحر) ─────────────────────────
    
    case 'RNG':
    case 'Gamble_Dmg': {
        if (Math.random() < 0.5) {
            const dmg = Math.floor(Math.random() * (2222 - 777 + 1)) + 777;
            result.damage = isCritSkill ? Math.floor(dmg * 1.5) : dmg;
            result.log = `🎲 **${getName(attacker)}** نجحت مقامرته! الأرقام تطابقت بضرر **${result.damage}**!`;
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
    case 'Utility':
    case '%': {
        if (skill.id === 'skill_shielding') {
            result.shield = Math.floor(attacker.maxHp * (rawValue / 100));
            result.log = `🛡️ **${getName(attacker)}** رفع درعه (+${result.shield})!`;
        } else if (skill.id === 'skill_healing') {
            result.heal = Math.floor(attacker.maxHp * (rawValue / 100));
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
            result.heal = Math.floor(attacker.maxHp * (rawValue / 100));
            result.log = `✨ **${getName(attacker)}** طهر نفسه من اللعنات!`;
        } else {
            result.damage = skillPower;
            result.log = `💥 **${getName(attacker)}** استخدم ${skill.name} وسبب ${result.damage} ضرر!`;
        }
        break;
    }
    default:
        result.damage = skillPower;
        result.log = `💥 **${getName(attacker)}** استخدم ${skill.name} وسبب ${result.damage} ضرر!`;
        break;
    }

    // تطبيق الضربة الحرجة على النصوص لو حدثت
    if (isCritSkill && result.damage > 0) {
        result.log = result.log.replace(/سبب \*\*([0-9]+)\*\* ضرر/g, `سدد ضربة حرجة بـ **$1** ضرر ✨`);
        result.log = result.log.replace(/وسبب ([0-9]+) ضرر/g, `وسدد ضربة حرجة بـ **$1** ضرر ✨`);
    }

    // إضافة نص الغريزة للهجناء فقط
    if (isHybrid) {
        result.log = `🐾 **(غريزة الوحش)** ` + result.log;
    }

    return result;
}

module.exports = { calculateSkillRawValue, executeSkill };
