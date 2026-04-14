const { OWNER_ID } = require('./constants');

function calculatePlayerDamage(player, monster) {
    // 🔥 تم الإصلاح هنا: نجمع الهجوم الأساسي (المشبع ببفات العرق) مع قوة السلاح، بدلاً من استبداله 🔥
    let baseAtk = Number(player.atk) || 10;
    let weaponDmg = 0;
    
    if (player.weapon && player.weapon.currentDamage) {
        weaponDmg = Number(player.weapon.currentDamage);
    }
    
    let damage = baseAtk + weaponDmg;

    let multiplier = 1.0;
    if (player.effects) {
        const buff = Array.isArray(player.effects) ? player.effects.find(e => e.type === 'atk_buff' || e.type === 'buff') : null;
        const weaken = Array.isArray(player.effects) ? player.effects.find(e => e.type === 'weaken') : null;
        
        if (!Array.isArray(player.effects)) {
            if (player.effects.buff > 0) multiplier += player.effects.buff;
            if (player.effects.weaken > 0) multiplier -= player.effects.weaken;
        } else {
            if (buff) multiplier += Number(buff.val) || 0;
            if (weaken) multiplier -= Number(weaken.val) || 0;
        }
    }

    if (player.isSealed) {
        multiplier *= (player.sealMultiplier || 0.5);
    }

    if (multiplier < 0.1) multiplier = 0.1;
    damage = Math.floor(damage * multiplier);

    // 🔥 استغلال نسبة الكريت المدعومة ببفات الرتب والأعراق 🔥
    let isCrit = false;
    let critChance = 0.15; // النسبة الأساسية
    
    if (player.critRate) {
        critChance += (Number(player.critRate) / 100); 
    } else if (player.critChance !== undefined) {
        critChance += (Number(player.critChance) / 100);
    }
    
    if (critChance > 0.75) critChance = 0.75; 

    if (Math.random() < critChance) {
        isCrit = true;
        damage = Math.floor(damage * 1.5); 
    }

    const variance = (Math.random() * 0.1) + 0.95;
    damage = Math.floor(damage * variance);

    if (player.id === OWNER_ID) {
        damage = Math.floor(damage * 2.0); 
    }
    
    if (monster.effects && Array.isArray(monster.effects) && monster.effects.some(e => e.type === 'weakness')) {
        damage = Math.floor(damage * 1.5); 
    }

    if (damage < 1) damage = 1;

    return { damage, isCrit };
}

function calculateMonsterDamage(monster, player) {
    let damage = monster.damage || monster.atk || 10;

    damage = Math.floor(damage * ((Math.random() * 0.2) + 0.9));

    // 🔥 تم الإصلاح هنا: نستخدم defense أو def (حسب ما تم تجميعه في setup.js) 🔥
    const playerDef = Number(player.defense) || Number(player.def) || 0;
    
    let defMitigation = Math.min(0.60, playerDef / (playerDef + 300)); 
    let damageReduction = defMitigation;
    
    if (player.effects) {
        if (Array.isArray(player.effects)) {
            const reductionBuff = player.effects.find(e => e.type === 'dmg_reduce');
            if (reductionBuff) damageReduction += Number(reductionBuff.val) || 0;
            
            const defBuff = player.effects.find(e => e.type === 'def_buff');
            if (defBuff) damageReduction += Number(defBuff.val) || 0;
        }
    }

    if (player.defending) {
        damageReduction += 0.5; 
    }

    if (damageReduction > 0.9) damageReduction = 0.9; 
    
    damage = Math.floor(damage * (1 - damageReduction));

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
        damage = 1; 
    }

    return { damage, isMiss };
}

module.exports = { calculatePlayerDamage, calculateMonsterDamage };
