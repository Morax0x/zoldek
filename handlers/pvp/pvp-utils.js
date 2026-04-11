function cleanDisplayName(name) {
    if (!name) return "مقاتل";
    let clean = name.replace(/<a?:.+?:\d+>/g, '');
    clean = clean.replace(/[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD00-\uDFFF]/g, '');
    return clean.trim() || "مقاتل";
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
    if (!effects) return 'لا توجد تأثيرات';
    
    if (effects.shield > 0) arr.push(`🛡️ درع (${effects.shield})`);
    if (effects.buff > 0) arr.push(`💪 قوة (+${Math.round(effects.buff * 100)}%)`);
    if (effects.weaken > 0) arr.push(`📉 ضعف (-${Math.round(effects.weaken * 100)}%)`);
    if (effects.poison > 0) arr.push(`☠️ سم (${effects.poison})`);
    if (effects.burn > 0) arr.push(`🔥 حرق (${effects.burn})`);
    if (effects.stun) arr.push(`⚡ مشلول`);
    if (effects.confusion) arr.push(`😵 مرتبك`);
    if (effects.rebound_active > 0) arr.push(`🔄 عكس (${Math.round(effects.rebound_active * 100)}%)`);
    if (effects.evasion > 0) arr.push(`👻 مراوغة`);
    if (effects.blind > 0) arr.push(`🌫️ أعمى`);
    
    return arr.length > 0 ? arr.join(' | ') : 'لا توجد تأثيرات';
}

function getBalancedPvPMultiplier(baseMultiplier, currentLevel) {
    if (currentLevel <= 15) return baseMultiplier;
    
    // 🔥 إصلاح الثغرة: ضمان أن المضاعف يرتفع ولا ينخفض للأسلحة القوية 🔥
    // نرفع قوة المهارة بمقدار +0.3 إضافي عند الوصول للمستوى 30
    const targetMultiplierAt30 = Math.max(1.5, baseMultiplier + 0.3); 
    const levelsRemaining = 15; // من ليفل 16 إلى 30
    const diff = targetMultiplierAt30 - baseMultiplier;
    const incrementPerLevel = diff / levelsRemaining;
    
    let finalMulti = baseMultiplier + (incrementPerLevel * (currentLevel - 15));
    
    if (currentLevel >= 30) return targetMultiplierAt30;
    return finalMulti;
}

module.exports = {
    cleanDisplayName,
    buildHpBar,
    buildEffectsString,
    getBalancedPvPMultiplier
};
