const { cleanDisplayName, getBalancedPvPMultiplier } = require('./pvp-utils.js');

/** إرجاع True بناءً على النسبة المئوية (0 - 1) */
function roll(probability) {
    return Math.random() < probability;
}

/** اختيار عنصر عشوائي من مصفوفة */
function pickOne(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function calculateDamage(attacker, defender, multiplier = 1, isTrueDamage = false) {
    if (!attacker || !defender) return { finalDmg: 0, isCrit: false, lifestealAmount: 0 };
    if (!attacker.effects) attacker.effects = {};
    if (!defender.effects) defender.effects = {};

    // 1. حساب الضرر الأساسي
    let baseDmg = attacker.damage || attacker.atk || (attacker.weapon ? attacker.weapon.currentDamage : 15);
    
    if (attacker.effects.buff > 0) baseDmg *= (1 + attacker.effects.buff);
    if (attacker.effects.weaken > 0) baseDmg *= (1 - attacker.effects.weaken);
    if (defender.effects.vulnerable > 0) baseDmg *= (1 + defender.effects.vulnerable);

    // 2. حساب الكريت
    let isCrit = false;
    let critChance = attacker.critChance !== undefined ? (attacker.critChance / 100) : 0.15;
    if (critChance > 0.75) critChance = 0.75; 

    if (Math.random() < critChance) {
        isCrit = true;
        baseDmg = Math.floor(baseDmg * 1.5);
    }

    // 3. تخفيف الضرر (Armor Mitigation)
    const defenderDef = defender.defense || 0;
    let defMitigation = Math.min(0.60, defenderDef / (defenderDef + 300)); 
    let damageReduction = isTrueDamage ? 0 : defMitigation; // الضرر الحقيقي يتجاهل الدروع

    if (defender.defending && !isTrueDamage) damageReduction += 0.4;
    if (damageReduction > 0.9) damageReduction = 0.9;

    let rawDmg = Math.floor((baseDmg * multiplier) * (1 - damageReduction));

    // 4. المراوغة أو العمى
    const isBlinded = defender.effects.blind && Math.random() < 0.5;
    if (!isTrueDamage && (isBlinded || defender.effects.evasion > 0 || (defender.effects && Array.isArray(defender.effects) && defender.effects.some(e => e.type === 'evasion')))) {
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

    finalDmg = Math.max(1, finalDmg); 

    // 7. حساب سرقة الحياة الأساسية (Lifesteal)
    let lifestealAmount = 0;
    if (attacker.lifesteal > 0 && finalDmg > 0) {
        lifestealAmount = Math.floor(finalDmg * (attacker.lifesteal / 100));
    }

    return { finalDmg, isCrit, lifestealAmount };
}

function applySkillEffect(battleState, attackerId, skill, isHybridCall = false) {
    if (!skill || !skill.id) return "⚠️ مهارة غير صالحة!";
    
    // تسجيل الكولداون (لا نسجله إذا كان استدعاء داخلي من الهجين)
    if (!isHybridCall) {
        const cooldownDuration = skill.id.startsWith('race_') ? 5 : 3;
        if (!battleState.skillCooldowns[attackerId]) battleState.skillCooldowns[attackerId] = {};
        battleState.skillCooldowns[attackerId][skill.id] = cooldownDuration;
    }

    const attacker = battleState.players.get(attackerId);
    const defenderId = battleState.turn.find(id => id !== attackerId);
    const defender = battleState.players.get(defenderId);

    if (!attacker || !defender) return "⚠️ حدث خطأ: تعذر العثور على بيانات الخصم!";
    if (!attacker.effects) attacker.effects = {};
    if (!defender.effects) defender.effects = {};

    const attackerName = attacker.isMonster ? attacker.name : cleanDisplayName(attacker.member?.displayName || attacker.member?.user?.username || 'مقاتل');

    let statType = skill.stat_type;
    const skillLevel = skill.currentLevel || 1;
    const attackerMaxHp = attacker.maxHp || 100;
    const baseAtk = attacker.damage || attacker.atk || (attacker.weapon ? attacker.weapon.currentDamage : 15);

    // 🐾 غريزة نصف الوحش: نسخ عشوائي لأي مهارة عرق أخرى (متطابق مع الدانجون)
    let isHybrid = false;
    if (statType === 'Chaos_RNG' && !isHybridCall) {
        isHybrid = true;
        const allRaceSkills = [
            'TrueDMG_Burn', 'Stun_Vulnerable', 'Confusion', 'Sacrifice_Crit',
            'Scale_MissingHP_Heal', 'Spirit_RNG', 'Execute_Heal', 'Lifesteal_Overheal',
            'Reflect_Tank', 'Cleanse_Buff_Shield'
        ];
        statType = pickOne(allRaceSkills);
        // نمرر المهارة الجديدة المنسوخة
        const fakeSkill = { ...skill, stat_type: statType };
        let resultLog = applySkillEffect(battleState, attackerId, fakeSkill, true);
        return `🐾 **(غريزة الوحش)** ` + resultLog;
    }

    const dotDamage = Math.floor(baseAtk * 0.4) + (skillLevel * 2); // ضرر السم/الحرق متوازن للـ PvP

    switch (statType) {
        // ── مهارات الأعراق النظيفة 100% (متطابقة مع الدانجون) ──────────────────

        // 🐲 التنين
        case 'TrueDMG_Burn': {
            const multi = getBalancedPvPMultiplier(1.2, skillLevel);
            const { finalDmg } = calculateDamage(attacker, defender, multi);
            defender.hp -= finalDmg;
            const fx = [];

            if (roll(0.50)) { defender.effects.burn = dotDamage; defender.effects.burn_turns = 3; fx.push('🔥 حرق'); }
            if (roll(0.30)) { defender.effects.vulnerable = 0.3; defender.effects.vulnerable_turns = 2; fx.push('🎯 هشاشة'); }

            return `🐲 **${attackerName}** نفـث النـيران! سبب **${finalDmg}** ضرر` + (fx.length > 0 ? ` [${fx.join(' · ')}]` : '');
        }

        // 🧝‍♂️ الآلف
        case 'Stun_Vulnerable': {
            const agile = roll(0.20);
            const baseMulti = agile ? 1.5 : 1.0;
            const multi = getBalancedPvPMultiplier(baseMulti, skillLevel);
            const { finalDmg } = calculateDamage(attacker, defender, multi);
            defender.hp -= finalDmg;
            const fx = agile ? ['⚡ ضربة خارقة'] : [];

            if (roll(0.40)) { defender.effects.stun = true; defender.effects.stun_turns = 1; fx.push('😵 شلل'); }
            if (roll(0.40)) { defender.effects.blind = true; defender.effects.blind_turns = 2; fx.push('👁️ عمى'); }

            return `🏹 **${attackerName}** أطلق سهام الرياح! سبب **${finalDmg}** ضرر` + (fx.length > 0 ? ` [${fx.join(' · ')}]` : '');
        }

        // 🧝‍♀️ آلف الظلام
        case 'Confusion': {
            const isConfused = defender.effects.confusion;
            const baseMulti = isConfused ? 1.5 : 1.0;
            const multi = getBalancedPvPMultiplier(baseMulti, skillLevel);
            const { finalDmg } = calculateDamage(attacker, defender, multi);
            defender.hp -= finalDmg;
            const fx = isConfused ? ['🎯 اغتيال'] : [];

            if (roll(0.50)) { defender.effects.confusion = true; defender.effects.confusion_turns = 2; fx.push('🌀 ارتباك'); }
            if (roll(0.40)) { defender.effects.poison = dotDamage; defender.effects.poison_turns = 3; fx.push('☠️ تسمم'); }

            return `🗡️ **${attackerName}** طعن من الظلام! سبب **${finalDmg}** ضرر` + (fx.length > 0 ? ` [${fx.join(' · ')}]` : '');
        }

        // 👹 الشيطان
        case 'Sacrifice_Crit': {
            const multi = getBalancedPvPMultiplier(1.3, skillLevel);
            const { finalDmg } = calculateDamage(attacker, defender, multi);
            const selfDmg = Math.floor(attackerMaxHp * 0.10);
            
            attacker.hp -= selfDmg;
            defender.hp -= finalDmg;
            const fx = [];

            if (roll(0.50)) { defender.effects.vulnerable = 0.3; defender.effects.vulnerable_turns = 2; fx.push('🎯 هشاشة'); }
            if (roll(0.40)) { defender.effects.burn = dotDamage; defender.effects.burn_turns = 3; fx.push('🔥 حرق'); }

            return `👹 **${attackerName}** فجّر طاقته الشيطانية! سبب **${finalDmg}** ضرر (وخسر **${selfDmg}** HP)` + (fx.length > 0 ? ` [${fx.join(' · ')}]` : '');
        }

        // 🦅 السيرافيم
        case 'Scale_MissingHP_Heal': {
            const missingPct = Math.max(0, (attackerMaxHp - (attacker.hp || 0)) / attackerMaxHp);
            const baseMulti = 1 + (missingPct * 0.8);
            const multi = getBalancedPvPMultiplier(baseMulti, skillLevel);
            const { finalDmg } = calculateDamage(attacker, defender, multi);
            
            defender.hp -= finalDmg;
            const fx = [];

            if (roll(0.50)) { 
                const heal = Math.floor(attackerMaxHp * 0.25);
                attacker.hp = Math.min(attackerMaxHp, (attacker.hp || 0) + heal);
                fx.push(`💚 شفاء (+${heal})`); 
            }
            if (roll(0.50)) { defender.effects.silence = true; defender.effects.silence_turns = 2; fx.push('🔇 صمت'); }

            return `⚖️ **${attackerName}** أنزل عقاب السماء! سبب **${finalDmg}** ضرر` + (fx.length > 0 ? ` [${fx.join(' · ')}]` : '');
        }

        // 👻 الروح
        case 'Spirit_RNG': {
            const multi = getBalancedPvPMultiplier(1.15, skillLevel);
            const { finalDmg } = calculateDamage(attacker, defender, multi);
            defender.hp -= finalDmg;
            const fx = [];

            if (roll(0.40)) { attacker.effects.evasion = 1; attacker.effects.evasion_turns = 1; fx.push('👻 مراوغة'); }
            if (roll(0.40)) { defender.effects.confusion = true; defender.effects.confusion_turns = 2; fx.push('🌀 ارتباك'); }

            return `👻 **${attackerName}** أرسل طيفاً مريباً! سبب **${finalDmg}** ضرر` + (fx.length > 0 ? ` [${fx.join(' · ')}]` : '');
        }

        // 🧟 الغول
        case 'Execute_Heal': {
            const isExecute = defender.hp < (defender.maxHp || 1000) * 0.20;
            const baseMulti = isExecute ? 2.0 : 1.0;
            const multi = getBalancedPvPMultiplier(baseMulti, skillLevel);
            const { finalDmg } = calculateDamage(attacker, defender, multi);
            
            defender.hp -= finalDmg;
            const fx = isExecute ? ['💀 إعدام'] : [];

            if (roll(0.60)) { defender.effects.poison = dotDamage; defender.effects.poison_turns = 3; fx.push('☠️ تسمم'); }
            if (roll(0.40)) { defender.effects.weaken = 0.3; defender.effects.weaken_turns = 2; fx.push('📉 إضعاف'); }

            return `🧟 **${attackerName}** نهش الخصم بتعفن! سبب **${finalDmg}** ضرر` + (fx.length > 0 ? ` [${fx.join(' · ')}]` : '');
        }

        // 🧛 مصاص الدماء
        case 'Lifesteal_Overheal': {
            const multi = getBalancedPvPMultiplier(1.0, skillLevel);
            const { finalDmg } = calculateDamage(attacker, defender, multi);
            defender.hp -= finalDmg;
            
            const healVal = Math.floor(finalDmg * 0.25);
            attacker.hp = Math.min(attackerMaxHp, (attacker.hp || 0) + healVal);
            const fx = [];

            if (roll(0.60)) { defender.effects.bat = Math.floor(dotDamage * 0.5); defender.effects.bat_turns = 5; fx.push('🦇 خفاش طفيلي'); }
            if (roll(0.40)) { defender.effects.bleed = dotDamage; defender.effects.bleed_turns = 3; fx.push('🩸 نزيف'); }

            return `🦇 **${attackerName}** مص الدماء! سبب **${finalDmg}** ضرر وامتص **${healVal}** HP` + (fx.length > 0 ? ` [${fx.join(' · ')}]` : '');
        }

        // 🛡️ القزم
        case 'Reflect_Tank': {
            const multi = getBalancedPvPMultiplier(1.4, skillLevel);
            const { finalDmg } = calculateDamage(attacker, defender, multi);
            defender.hp -= finalDmg;
            const fx = [];

            // Taunt يستبدل بالدرع في الـ PvP لأنه 1v1
            if (roll(0.60)) { attacker.effects.shield += Math.floor(attackerMaxHp * 0.20); fx.push('🛡️ درع'); } 
            if (roll(0.60)) { attacker.effects.rebound_active = 0.3; attacker.effects.rebound_turns = 2; fx.push('🌵 أشواك'); }

            return `⚒️ **${attackerName}** زأر وهوى بمطرقته! سبب **${finalDmg}** ضرر` + (fx.length > 0 ? ` [${fx.join(' · ')}]` : '');
        }

        // ⚔️ البشري
        case 'Cleanse_Buff_Shield': {
            let baseMulti = 1.2;
            const fx = ['⚔️ ضرر حقيقي'];
            
            if (roll(0.30)) { baseMulti = 1.5; fx.push('💥 نصل الإعدام'); }
            
            const multi = getBalancedPvPMultiplier(baseMulti, skillLevel);
            const { finalDmg } = calculateDamage(attacker, defender, multi, true); // trueDamage = true (يتجاهل الدروع)
            defender.hp -= finalDmg;

            if (roll(0.50)) { 
                attacker.effects = { ...attacker.effects, poison:0, poison_turns:0, burn:0, burn_turns:0, weaken:0, weaken_turns:0, stun:false, stun_turns:0, confusion:false, confusion_turns:0, blind:false, blind_turns:0, silence:false, silence_turns:0, bleed:0, bleed_turns:0, bat:0, bat_turns:0, vulnerable:0, vulnerable_turns:0 };
                fx.push('✨ تطهير'); 
            }
            if (roll(0.50)) { attacker.effects.buff = 0.4; attacker.effects.buff_turns = 3; fx.push('💪 تعزيز هجوم'); }

            return `👑 **${attackerName}** قاد بتكتيك متقن! سبب **${finalDmg}** ضرر` + (fx.length > 0 ? ` [${fx.join(' · ')}]` : '');
        }

        // ── المهارات العامة (أكاديمية السحر) متطابقة مع الدانجون ────────

        case 'Gamble_Dmg':
        case 'RNG': {
            if (Math.random() < 0.5) {
                const dmg = Math.floor(Math.random() * (2222 - 777 + 1)) + 777;
                // تعديل توازن الـ PvP للمقامرة لكي لا تقتل بضربة واحدة
                const balancedDmg = Math.floor(dmg * getBalancedPvPMultiplier(1.0, skillLevel));
                defender.hp -= balancedDmg;
                return `🎲 **${attackerName}** نجحت مقامرته! الأرقام تطابقت بضرر **${balancedDmg}**!`;
            } else {
                const failDmg = Math.floor(Math.random() * (200 - 100 + 1)) + 100;
                const selfDmg = Math.floor(attackerMaxHp * 0.03); 
                defender.hp -= failDmg;
                attacker.hp -= selfDmg;
                return `🎲 **${attackerName}** خسر الرهان... خدش الخصم بـ **${failDmg}** وأذى نفسه بـ **${selfDmg}**!`;
            }
        }
        case 'Buff_All': {
            attacker.effects.buff = (skill.effectValue || 30) / 100; attacker.effects.buff_turns = 3;
            return `📢 **${attackerName}** أطلق صيحة الحرب! زاد هجومه!`;
        }
        case 'Dmg_Evasion': {
            const multi = getBalancedPvPMultiplier(1.3, skillLevel);
            const { finalDmg } = calculateDamage(attacker, defender, multi);
            defender.hp -= finalDmg;
            attacker.effects.evasion = 1; attacker.effects.evasion_turns = 1;
            return `👻 **${attackerName}** ضرب واختفى! (${finalDmg} ضرر + مراوغة)`;
        }
        case 'Poison_Blade': {
            const multi = getBalancedPvPMultiplier(1.2, skillLevel);
            const { finalDmg } = calculateDamage(attacker, defender, multi);
            defender.hp -= finalDmg;
            defender.effects.poison = dotDamage; defender.effects.poison_turns = 3;
            return `🐍 **${attackerName}** غرز نصل السموم! (${finalDmg} ضرر + سم)`;
        }
        case 'Utility':
        case '%': {
            if (skill.id === 'skill_shielding') {
                const shieldVal = Math.floor(attackerMaxHp * ((skill.effectValue || 20) / 100));
                attacker.effects.shield += shieldVal;
                return `🛡️ **${attackerName}** رفع درعه (+${shieldVal})!`;
            } else if (skill.id === 'skill_healing') {
                const healVal = Math.floor(attackerMaxHp * ((skill.effectValue || 20) / 100));
                attacker.hp = Math.min(attackerMaxHp, (attacker.hp || 0) + healVal);
                return `💖 **${attackerName}** استعاد ${healVal} HP!`;
            } else if (skill.id === 'skill_buffing') {
                attacker.effects.buff = (skill.effectValue || 20) / 100; attacker.effects.buff_turns = 3;
                return `💪 **${attackerName}** غضب ورفع قوته!`;
            } else if (skill.id === 'skill_poison') {
                defender.effects.poison = dotDamage * 1.5; defender.effects.poison_turns = 3;
                return `☠️ **${attackerName}** سمم خصمه!`;
            } else if (skill.id === 'skill_rebound') {
                attacker.effects.rebound_active = (skill.effectValue || 30) / 100; attacker.effects.rebound_turns = 3;
                return `🔄 **${attackerName}** جهز درع الانعكاس!`;
            } else if (skill.id === 'skill_weaken') {
                defender.effects.weaken = (skill.effectValue || 30) / 100; defender.effects.weaken_turns = 3;
                return `📉 **${attackerName}** أضعف هجوم خصمه!`;
            } else if (skill.id === 'skill_dispel') {
                defender.effects = { shield: 0, buff: 0, buff_turns: 0, weaken: 0, weaken_turns: 0, poison: 0, poison_turns: 0, rebound_active: 0, rebound_turns: 0, penetrate: 0, burn: 0, burn_turns: 0, stun: false, stun_turns: 0, confusion: false, confusion_turns: 0, evasion: 0, evasion_turns: 0, blind: 0, blind_turns: 0, silence: 0, silence_turns: 0, bleed: 0, bleed_turns: 0, bat: 0, bat_turns: 0, vulnerable: 0, vulnerable_turns: 0 };
                return `💨 **${attackerName}** بدد كل سحر الخصم!`;
            } else if (skill.id === 'skill_cleanse') {
                attacker.effects = { ...attacker.effects, poison:0, poison_turns:0, burn:0, burn_turns:0, weaken:0, weaken_turns:0, stun:false, stun_turns:0, confusion:false, confusion_turns:0, blind:false, blind_turns:0, silence:false, silence_turns:0, bleed:0, bleed_turns:0, bat:0, bat_turns:0, vulnerable:0, vulnerable_turns:0 };
                return `✨ **${attackerName}** طهر نفسه من اللعنات!`;
            } else {
                const { finalDmg, isCrit } = calculateDamage(attacker, defender, 1.2);
                defender.hp -= finalDmg;
                return `💥 **${attackerName}** استخدم ${skill.name} وسبب ${finalDmg} ضرر!`;
            }
        }
        default: {
            const { finalDmg, isCrit } = calculateDamage(attacker, defender, 1.0);
            defender.hp -= finalDmg;
            let logMsg = `💥 **${attackerName}** استخدم ${skill.name} وسبب ${finalDmg} ضرر!`;
            if (isCrit) logMsg = logMsg.replace(/سبب ([0-9]+) ضرر!/g, `سدد ضربة حرجة بـ **$1** ضرر ✨!`);
            return logMsg;
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

    // إدارة تناقص العدادات
    const effectsList = ['buff', 'weaken', 'rebound_active', 'stun', 'confusion', 'evasion', 'blind', 'silence', 'vulnerable'];
    effectsList.forEach(eff => {
        if (attacker.effects[eff + '_turns'] > 0) {
            attacker.effects[eff + '_turns']--;
            if (attacker.effects[eff + '_turns'] <= 0) {
                if (typeof attacker.effects[eff] === 'boolean') attacker.effects[eff] = false;
                else attacker.effects[eff] = 0;
            }
        }
    });

    // إدارة أضرار اللعنات (DoTs)
    const dotEffects = [
        { key: 'poison', emoji: '☠️', msg: 'يتألم من السم' },
        { key: 'burn', emoji: '🔥', msg: 'يحترق' },
        { key: 'bleed', emoji: '🩸', msg: 'ينزف بشدة' },
        { key: 'bat', emoji: '🦇', msg: 'يُمتص دمه بواسطة الخفاش' }
    ];

    dotEffects.forEach(dot => {
        if (attacker.effects[dot.key] > 0) {
            attacker.hp -= attacker.effects[dot.key];
            logEntries.push(`${dot.emoji} **${attackerName}** ${dot.msg} (-${attacker.effects[dot.key]})!`);
            attacker.effects[dot.key + '_turns']--;
            if (attacker.effects[dot.key + '_turns'] <= 0) attacker.effects[dot.key] = 0;
        }
    });

    return { logEntries, skipTurn };
}

module.exports = {
    calculateDamage,
    applySkillEffect,
    applyPersistentEffects
};
