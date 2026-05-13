const { caravanConfig, upgradeMats } = require('./config');

function getEquippedBuffs(equippedArtifacts) {
    let speedBuff = 0, defenseBuff = 0, luckBuff = 0;
    if (!Array.isArray(equippedArtifacts) || equippedArtifacts.length < 3) {
        return { speedBuff, defenseBuff, luckBuff };
    }

    const allItems = [];
    if (upgradeMats?.weapon_materials)
        upgradeMats.weapon_materials.forEach(race => race.materials.forEach(m => allItems.push(m)));
    if (upgradeMats?.skill_books)
        upgradeMats.skill_books.forEach(cat => cat.books.forEach(b => allItems.push(b)));

    const newBuffRatios = {
        Common: 0.005, Uncommon: 0.01, Rare: 0.02, Epic: 0.05, Legendary: 0.10
    };

    const slotTypes = ['speedBuff', 'defenseBuff', 'luckBuff'];
    const buffKeys  = ['speedBuff', 'defenseBuff', 'luckBuff'];

    for (let slotIdx = 0; slotIdx < 3; slotIdx++) {
        const art = equippedArtifacts[slotIdx];
        if (!art) continue;
        const itemId = typeof art === 'string' ? art : art.id;
        const count  = typeof art === 'object' && art.count ? Number(art.count) : 1;
        const item   = allItems.find(i => i.id === itemId);
        if (!item) continue;
        const rarity = item.rarity || 'Common';
        const ratio  = newBuffRatios[rarity] || 0.005;
        const total  = ratio * count;
        if (slotIdx === 0) speedBuff   += total;
        if (slotIdx === 1) defenseBuff += total;
        if (slotIdx === 2) luckBuff    += total;
    }

    speedBuff = Math.min(speedBuff, 0.20); // حد أقصى 20% للسرعة

    return { speedBuff, defenseBuff, luckBuff };
}

function calcDuration(destConfig, stats, equippedBuffs) {
    const speedRank = Number(stats.speed_rank || 1);
    const speedCfg  = caravanConfig.upgrades.speed;
    const reduction = Math.min((speedRank - 1) * speedCfg.time_reduction + (equippedBuffs?.speedBuff || 0), 0.70);
    const baseMs    = destConfig.duration_hours * 3600 * 1000;
    return Math.floor(baseMs * (1 - reduction));
}

function calcRiskFactor(destConfig, stats, equippedBuffs) {
    const defRank   = Number(stats.defense_rank || 1);
    const defCfg    = caravanConfig.upgrades.defense;
    const reduction = (defRank - 1) * defCfg.risk_reduction + (equippedBuffs?.defenseBuff || 0);
    return Math.max(destConfig.risk_factor - reduction, 0.03);
}

module.exports = { getEquippedBuffs, calcDuration, calcRiskFactor };
