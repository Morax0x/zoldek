function cleanDisplayName(name) {
    if (!name) return "لاعب";
    let clean = name.replace(/<a?:.+?:\d+>/g, '');
    clean = clean.replace(/[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD00-\uDFFF]/g, '');
    return clean.trim();
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

module.exports = {
    cleanDisplayName,
    buildHpBar,
    buildEffectsString,
    getBalancedPvPMultiplier
};
