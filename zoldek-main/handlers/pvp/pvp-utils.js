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
    
    if (effects.shield > 0) arr.push(`🛡️ درع (${Math.floor(effects.shield)})`);
    if (effects.buff > 0) arr.push(`💪 قوة (+${Math.round(effects.buff * 100)}%)`);
    if (effects.weaken > 0) arr.push(`📉 ضعف (-${Math.round(effects.weaken * 100)}%)`);
    if (effects.poison > 0) arr.push(`☠️ سم (${Math.floor(effects.poison)})`);
    if (effects.burn > 0) arr.push(`🔥 حرق (${Math.floor(effects.burn)})`);
    if (effects.stun) arr.push(`⚡ مشلول`);
    if (effects.confusion) arr.push(`😵 مرتبك`);
    if (effects.rebound_active > 0) arr.push(`🔄 عكس (${Math.round(effects.rebound_active * 100)}%)`);
    if (effects.evasion > 0) arr.push(`👻 مراوغة`);
    if (effects.blind > 0) arr.push(`🌫️ أعمى`);
    
    return arr.length > 0 ? arr.join(' | ') : 'لا توجد تأثيرات';
}

function getBalancedPvPMultiplier(baseMultiplier, currentLevel) {
    // المستوى 1 إلى 15 يعطي الضرر الأساسي دون زيادة
    if (currentLevel <= 15) return baseMultiplier;
    
    // نحسب مقدار الزيادة لكل مستوى (بحيث لا تقل الزيادة الإجمالية عن 0.3 لـ 15 مستوى)
    const diff = Math.max(1.5 - baseMultiplier, 0.3); 
    const incrementPerLevel = diff / 15; 
    
    // نضرب مقدار الزيادة الثابت في عدد المستويات التي تتجاوز 15
    // 🔥 هنا تم إزالة السقف! سيستمر في الزيادة حتى ليفل 100 وأكثر 🔥
    let finalMulti = baseMultiplier + (incrementPerLevel * (currentLevel - 15));
    
    return finalMulti;
}

module.exports = {
    cleanDisplayName,
    buildHpBar,
    buildEffectsString,
    getBalancedPvPMultiplier
};
