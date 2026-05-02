const { caravanConfig, upgradeMats } = require('./config');

function getEquippedBuffs(equippedArtifacts) {
    let speedBuff = 0, luckBuff = 0;
    if (!equippedArtifacts || !equippedArtifacts.length) return { speedBuff, luckBuff };

    const allItems = [];
    if (upgradeMats?.weapon_materials)
        upgradeMats.weapon_materials.forEach(race => race.materials.forEach(m => allItems.push(m)));
    if (upgradeMats?.skill_books)
        upgradeMats.skill_books.forEach(cat => cat.books.forEach(b => allItems.push(b)));

    const artifactBufCfg = caravanConfig.artifact_buffs;

    // 👑 التعديل الجديد: قراءة كائنات الارتيفاكت مع حساب الكمية (Count)
    for (const art of equippedArtifacts) {
        // إذا كان النظام القديم لا يزال موجوداً بالخطأ كنصوص، نتفاداه
        const itemId = typeof art === 'string' ? art : art.id;
        const count  = typeof art === 'object' && art.count ? Number(art.count) : 1;

        const item = allItems.find(i => i.id === itemId);
        if (!item) continue;

        const rarity = item.rarity || 'Common';
        const isMat  = !!upgradeMats.weapon_materials?.some(race => race.materials.some(m => m.id === itemId));
        
        // ضرب تأثير الارتيفاكت الواحد في الكمية المجهزة
        if (isMat) {
            speedBuff += (artifactBufCfg.material[rarity] || 0) * count;
        } else {
            luckBuff  += (artifactBufCfg.book[rarity]     || 0) * count;
        }
    }
    return { speedBuff, luckBuff };
}

function calcDuration(destConfig, stats, equippedBuffs) {
    const speedRank = Number(stats.speed_rank || 1);
    const speedCfg  = caravanConfig.upgrades.speed;
    // تم رفع سقف تخفيض الوقت بناءً على كمية الارتيفاكت المضافة، أو تركه كما تشاء (حالياً 70% كحد أقصى)
    const reduction = Math.min((speedRank - 1) * speedCfg.time_reduction + equippedBuffs.speedBuff, 0.70);
    const baseMs    = destConfig.duration_hours * 3600 * 1000;
    return Math.floor(baseMs * (1 - reduction));
}

function calcRiskFactor(destConfig, stats) {
    const defRank   = Number(stats.defense_rank || 1);
    const defCfg    = caravanConfig.upgrades.defense;
    const reduction = (defRank - 1) * defCfg.risk_reduction;
    return Math.max(destConfig.risk_factor - reduction, 0.03);
}

function calcRewardMultiplier(stats, equippedBuffs) {
    const capRank  = Number(stats.capacity_rank || 1);
    const luckRank = Number(stats.luck_rank     || 1);
    const capCfg   = caravanConfig.upgrades.capacity;
    const luckCfg  = caravanConfig.upgrades.luck;
    
    // البف الخاص بالحظ الآن يتضاعف مع الكمية (مثال: 5 كتب نادرة تعطي 5 أضعاف التأثير)
    return 1
        + (capRank  - 1) * capCfg.bonus_per_level
        + (luckRank - 1) * luckCfg.bonus_per_level
        + equippedBuffs.luckBuff;
}

module.exports = { getEquippedBuffs, calcDuration, calcRiskFactor, calcRewardMultiplier };
