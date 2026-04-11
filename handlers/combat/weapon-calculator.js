const { cleanDisplayName } = require('../dungeon/utils');

function getName(entity) {
    if (entity.isMonster) return entity.name;
    if (entity.member) return cleanDisplayName(entity.member.user.displayName);
    return entity.name || "Unknown";
}

// 🔥 دالة التوحيد والنمو اللانهائي (مفتوحة الكاب لما بعد 30) 🔥
function getWeaponRawDamage(weaponConfig, level) {
    if (!weaponConfig || level < 1) return 15;
    
    const base = weaponConfig.base_damage;
    const inc = weaponConfig.damage_increment;

    if (level <= 15) {
        // من مستوى 1 إلى 15: قوة متباينة تعتمد على قوة العرق الأساسية
        return Math.floor(base + (inc * (level - 1)));
    } else {
        // من مستوى 16 فما فوق: نمو متصاعد لجميع الأعراق
        const damageAt15 = base + (inc * 14); 
        const targetDamageAt30 = 1000; 
        const levelsRemaining = 15; 
        const dynamicIncrement = (targetDamageAt30 - damageAt15) / levelsRemaining;
        
        let finalDamage = damageAt15 + (dynamicIncrement * (level - 15));
        
        // 🔥 تم إزالة الكاب (السقف) بناءً على خططك المستقبلية! 🔥
        // السلاح سيستمر بالزيادة حتى ليفل 100 وأكثر.
        
        return Math.floor(finalDamage);
    }
}

function executeWeaponAttack(attacker, defender, isOwner = false) {
    const result = {
        damage: 0,          
        shieldDamage: 0,
        lifestealAmount: 0, // إضافة اللايف ستيل للضربات العادية
        isCrit: false,
        isMiss: false,
        log: ""
    };

    const attackerName = getName(attacker);
    const defenderName = getName(defender);

    // 🔥 الاعتماد على النظام الجديد (damage) بدلاً من atk القديم 🔥
    let rawDmg = attacker.damage || (attacker.weapon && attacker.weapon.currentDamage) || attacker.atk || 15;

    let multiplier = 1.0;

    if (attacker.effects && !Array.isArray(attacker.effects)) {
        if (attacker.effects.buff > 0) multiplier += attacker.effects.buff;
        if (attacker.effects.weaken > 0) multiplier -= attacker.effects.weaken;
    }

    if (attacker.effects && Array.isArray(attacker.effects)) {
        attacker.effects.forEach(eff => {
            if (eff.type === 'atk_buff' || eff.type === 'buff') multiplier += eff.val;
            if (eff.type === 'weaken') multiplier -= eff.val;
        });
    }

    if (multiplier < 0.1) multiplier = 0.1;
    rawDmg = Math.floor(rawDmg * multiplier);

    let isBlind = false;
    if (attacker.effects && !Array.isArray(attacker.effects) && attacker.effects.blind > 0) isBlind = true;
    if (attacker.effects && Array.isArray(attacker.effects) && attacker.effects.some(e => e.type === 'blind')) isBlind = true;

    if (isBlind && Math.random() < 0.5) {
        result.isMiss = true;
        result.log = `☁️ **${attackerName}** هاجم وأخطأ الهدف بسبب العمى!`;
        return result;
    }

    let isEvasion = false;
    if (defender.effects && !Array.isArray(defender.effects) && defender.effects.evasion > 0) isEvasion = true;
    if (defender.effects && Array.isArray(defender.effects) && defender.effects.some(e => e.type === 'evasion')) isEvasion = true;

    if (isEvasion) {
        result.isMiss = true;
        result.log = `👻 **${defenderName}** تفادى الهجوم ببراعة!`;
        return result;
    }

    // 🔥 نظام الكريت المحدث (يعتمد على critChance من العتاد والبفات) 🔥
    let critBonus = 0;
    if (attacker.effects && Array.isArray(attacker.effects)) {
        if (attacker.effects.some(e => e.type === 'crit_buff')) critBonus += 10.0; 
        if (attacker.effects.some(e => e.type === 'luck_buff')) critBonus += 20.0;
    }
    
    let baseCrit = attacker.critChance !== undefined ? (attacker.critChance / 100) : 0.15;
    let finalCritRate = baseCrit + (critBonus / 100);
    if (finalCritRate > 0.75) finalCritRate = 0.75; // سقف الكريت

    if (Math.random() < finalCritRate) {
        result.isCrit = true;
        rawDmg = Math.floor(rawDmg * 1.5);
    }

    if (isOwner) rawDmg *= 5;

    const variance = (Math.random() * 0.2) + 0.9; // تباين بين 90% و 110%
    rawDmg = Math.floor(rawDmg * variance);

    // 🔥 نظام الدفاع الحقيقي (Armor Mitigation) 🔥
    let damageReduction = 0;
    const defenderDef = defender.defense || 0;
    let defMitigation = Math.min(0.60, defenderDef / (defenderDef + 300));
    damageReduction += defMitigation;

    if (defender.defending) damageReduction += 0.4; 
    
    if (defender.effects) {
        if (Array.isArray(defender.effects)) {
            defender.effects.forEach(eff => {
                if (eff.type === 'def_buff' || eff.type === 'dmg_reduce') damageReduction += eff.val;
            });
        } else {
            if (defender.effects.dmg_reduce > 0) damageReduction += defender.effects.dmg_reduce;
        }
    }
    
    if (damageReduction > 0.9) damageReduction = 0.9; // أقصى حد للتخفيف 90%
    rawDmg = Math.floor(rawDmg * (1 - damageReduction));

    if (rawDmg < 1) rawDmg = 1;

    let currentShield = 0;
    if (defender.shield && defender.shield > 0) currentShield = defender.shield; 
    else if (defender.effects && defender.effects.shield > 0) currentShield = defender.effects.shield; 

    let hpDmg = 0;
    let shieldDmg = 0;

    if (currentShield > 0) {
        if (currentShield >= rawDmg) {
            shieldDmg = rawDmg;
            if (defender.shield) defender.shield -= rawDmg;
            else defender.effects.shield -= rawDmg;
            hpDmg = 0;
        } else {
            shieldDmg = currentShield;
            hpDmg = rawDmg - currentShield;
            if (defender.shield) defender.shield = 0;
            else defender.effects.shield = 0;
        }
    } else {
        hpDmg = rawDmg;
        shieldDmg = 0;
    }

    if (hpDmg > 0) {
        defender.hp -= hpDmg;
        if (defender.hp < 0) defender.hp = 0;
    }

    result.damage = hpDmg;
    result.shieldDamage = shieldDmg;

    // 🔥 تطبيق اللايف ستيل (سرقة الحياة) للضربات العادية 🔥
    if (attacker.lifesteal > 0 && hpDmg > 0) {
        result.lifestealAmount = Math.floor(hpDmg * (attacker.lifesteal / 100));
        attacker.hp = Math.min(attacker.maxHp || attacker.hp, (attacker.hp || 0) + result.lifestealAmount);
    }

    if (attacker.totalDamage !== undefined) attacker.totalDamage += hpDmg;

    let logMsg = "";
    const critText = result.isCrit ? "🔥 **CRIT!** " : "";
    const lifestealText = result.lifestealAmount > 0 ? ` [شفى ${result.lifestealAmount}❤️]` : "";

    if (hpDmg === 0 && shieldDmg > 0) {
        logMsg = `🛡️ **${defenderName}** لم يتضرر! الدرع امتص الهجوم (${shieldDmg}).`;
    } 
    else if (hpDmg > 0 && shieldDmg > 0) {
        logMsg = `${critText}⚔️ **${attackerName}** حطم الدرع (-${shieldDmg}) وسبب **${hpDmg}** ضرر!${lifestealText}`;
    } 
    else {
        logMsg = `${critText}🗡️ **${attackerName}** هاجم وسبب **${hpDmg}** ضرر.${lifestealText}`;
        if (defender.defending) logMsg += ` (دفاع)`;
    }

    result.log = logMsg;
    return result;
}

module.exports = { getWeaponRawDamage, executeWeaponAttack };
