const { caravanConfig, upgradeMats } = require('./config');

function getEquippedBuffs(equippedArtifacts) {
    let speedBuff = 0, luckBuff = 0;
    if (!equippedArtifacts || !equippedArtifacts.length) return { speedBuff, luckBuff };

    const allItems = [];
    if (upgradeMats?.weapon_materials)
        upgradeMats.weapon_materials.forEach(race => race.materials.forEach(m => allItems.push(m)));
    if (upgradeMats?.skill_books)
        upgradeMats.skill_books.forEach(cat => cat.books.forEach(b => allItems.push(b)));

    // 👑 النسب الجديدة المعتمده (تتجاهل الكونفق القديم) 👑
    const newBuffRatios = {
        Common: 0.005,    // عادي 0.5%
        Uncommon: 0.01,   // شائع 1%
        Rare: 0.02,       // نادر 2%
        Epic: 0.05,       // ملحمي 5%
        Legendary: 0.10   // أسطوري 10%
    };

    // قراءة كائنات الارتيفاكت مع حساب الكمية (Count)
    for (const art of equippedArtifacts) {
        // إذا كان النظام القديم لا يزال موجوداً بالخطأ كنصوص، نتفاداه
        const itemId = typeof art === 'string' ? art : art.id;
        const count  = typeof art === 'object' && art.count ? Number(art.count) : 1;

        const item = allItems.find(i => i.id === itemId);
        if (!item) continue;

        const rarity = item.rarity || 'Common';
        const isMat  = !!upgradeMats.weapon_materials?.some(race => race.materials.some(m => m.id === itemId));
        
        // ضرب تأثير الارتيفاكت الواحد في الكمية المجهزة بناءً على النسب الجديدة
        if (isMat) {
            speedBuff += (newBuffRatios[rarity] || 0.005) * count;
        } else {
            luckBuff  += (newBuffRatios[rarity] || 0.005) * count;
        }
    }
    return { speedBuff, luckBuff };
}

function calcDuration(destConfig, stats, equippedBuffs) {
    const speedRank = Number(stats.speed_rank || 1);
    const speedCfg  = caravanConfig.upgrades.speed;
    // تركنا الحد الأقصى لتخفيض الوقت 70% كحد أقصى عشان ما يصير الوقت صفر ⏳
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
    
    // البف الخاص بالحظ يتضاعف مع الكمية بناءً على النسب الجديدة
    return 1
        + (capRank  - 1) * capCfg.bonus_per_level
        + (luckRank - 1) * luckCfg.bonus_per_level
        + equippedBuffs.luckBuff;
}

module.exports = { getEquippedBuffs, calcDuration, calcRiskFactor, calcRewardMultiplier };
