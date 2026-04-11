const { OWNER_ID } = require('./constants');

function calculatePlayerDamage(player, monster) {
    // 🔥 نعتمد على damage لأنه يضم الهجوم الأساسي + السلاح + بف العرق 🔥
    let damage = player.damage || player.atk || 10;

    // (تأكيد احتياطي) إذا كان السلاح يعطي ضرراً إضافياً لم يُحسب
    if (player.weapon && player.weapon.currentDamage) {
        damage = Math.max(damage, player.weapon.currentDamage);
    }

    let multiplier = 1.0;
    if (player.effects) {
        // إذا كان هناك بف مؤقت أثناء المعركة
        const buff = Array.isArray(player.effects) ? player.effects.find(e => e.type === 'atk_buff' || e.type === 'buff') : null;
        const weaken = Array.isArray(player.effects) ? player.effects.find(e => e.type === 'weaken') : null;
        
        // أو إذا كان بصيغة كائن (Object) كما بنيناه في التجهيز
        if (!Array.isArray(player.effects)) {
            if (player.effects.buff > 0) multiplier += player.effects.buff;
            if (player.effects.weaken > 0) multiplier -= player.effects.weaken;
        } else {
            if (buff) multiplier += buff.val;
            if (weaken) multiplier -= weaken.val;
        }
    }

    // تأثير ختم الدانجون
    if (player.isSealed) {
        multiplier *= (player.sealMultiplier || 0.5);
    }

    if (multiplier < 0.1) multiplier = 0.1;
    damage = Math.floor(damage * multiplier);

    // 🔥 استغلال نسبة الكريت (الضربة القاضية) الخاصة باللاعب بعد البفات 🔥
    let isCrit = false;
    // نحولها لنسبة مئوية (مثال: 5 يعني 5%)
    let critChance = player.critChance !== undefined ? (player.critChance / 100) : 0.15; 
    
    // سقف الكريت لا يتجاوز 75% لضمان التوازن
    if (critChance > 0.75) critChance = 0.75; 

    if (Math.random() < critChance) {
        isCrit = true;
        damage = Math.floor(damage * 1.5); // الكريت يضرب 1.5 ضعف
    }

    // تذبذب الضرر (RNG) ليكون بين 95% و 105%
    const variance = (Math.random() * 0.1) + 0.95;
    damage = Math.floor(damage * variance);

    // ميزة الإمبراطور (المالك)
    if (player.id === OWNER_ID) {
        damage = Math.floor(damage * 2.0); 
    }
    
    // إذا كان الوحش يعاني من ضعف
    if (monster.effects && Array.isArray(monster.effects) && monster.effects.some(e => e.type === 'weakness')) {
        damage = Math.floor(damage * 1.5); 
    }

    if (damage < 1) damage = 1;

    return { damage, isCrit };
}

function calculateMonsterDamage(monster, player) {
    let damage = monster.damage || monster.atk || 10;

    // تذبذب الضرر
    damage = Math.floor(damage * ((Math.random() * 0.2) + 0.9));

    // 🔥 استغلال نقاط دفاع اللاعب لتقليل الضرر المكتسب (Armor Mitigation) 🔥
    const playerDef = player.defense || 0;
    // معادلة بسيطة: كل 100 نقطة دفاع تقلل الضرر بنسبة معينة (تصل أقصاها لـ 60% تخفيف)
    let defMitigation = Math.min(0.60, playerDef / (playerDef + 300)); 
    
    let damageReduction = defMitigation;
    
    // حساب البفات المؤقتة للدفاع أثناء المعركة
    if (player.effects) {
        if (Array.isArray(player.effects)) {
            const reductionBuff = player.effects.find(e => e.type === 'dmg_reduce');
            if (reductionBuff) damageReduction += reductionBuff.val;
            
            const defBuff = player.effects.find(e => e.type === 'def_buff');
            if (defBuff) damageReduction += defBuff.val;
        }
    }

    // وضعية الدفاع اليدوي
    if (player.defending) {
        damageReduction += 0.5; 
    }

    // سقف تقليل الضرر لا يتجاوز 90% (لكي يتلقى ضرراً دائماً)
    if (damageReduction > 0.9) damageReduction = 0.9; 
    
    damage = Math.floor(damage * (1 - damageReduction));

    // نظام المراوغة (Evasion)
    let isMiss = false;
    if (player.effects) {
        if (Array.isArray(player.effects)) {
            if (player.effects.some(e => e.type === 'evasion')) isMiss = true;
        } else if (player.effects.evasion > 0) {
            isMiss = true;
        }
    }

    if (isMiss) {
        damage = 0;
    } else if (damage < 1 && !isMiss) {
        damage = 1; // أقل ضرر ممكن إذا لم يراوغ
    }

    return { damage, isMiss };
}

module.exports = { calculatePlayerDamage, calculateMonsterDamage };
