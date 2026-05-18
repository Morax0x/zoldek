const { safeQuery, safeExecute } = require('./db');
const { caravanConfig, EMOJI_MORA } = require('./config');

async function getUserCaravanStats(db, userId, guildId) {
    const res = await safeQuery(db,
        `SELECT * FROM user_caravan_stats WHERE "userID"=$1 AND "guildID"=$2`,
        [userId, guildId]);
    if (res.rows.length) return res.rows[0];

    await safeExecute(db,
        `INSERT INTO user_caravan_stats ("userID","guildID") VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [userId, guildId]);
    return { userid: userId, guildid: guildId,
             capacity_rank: 1, speed_rank: 1, defense_rank: 1, luck_rank: 1,
             total_trips: 0, successful_trips: 0,
             best_loot: 0, ambush_survived: 0, last_dest: null, best_loot_label: null,
             trip_streak: 0, last_trip_time: 0 };
}

async function getActiveCaravan(db, userId, guildId) {
    const res = await safeQuery(db,
        `SELECT * FROM user_caravans WHERE "userID"=$1 AND "guildID"=$2 AND "status"!='completed'`,
        [userId, guildId]);
    return res.rows[0] || null;
}

async function upgradeCaravan(db, userId, guildId, upgradeType) {
    const upgCfg = caravanConfig.upgrades[upgradeType];
    if (!upgCfg) return { error: 'نوع الترقية غير صالح.' };

    const stats   = await getUserCaravanStats(db, userId, guildId);
    const rankKey = `${upgradeType}_rank`;
    const current = Number(stats[rankKey] || stats[rankKey.toLowerCase()] || 1);

    if (current >= upgCfg.max_level) return { error: `وصلت للمستوى الأقصى (${upgCfg.max_level})!` };

    const cost = upgCfg.costs[current];

    // خصم الموارد بشكل ذري مشروط: يخصم فقط إذا كان الرصيد كافياً ومستوى الترقية لا يزال صحيحاً
    const deductRes = await safeQuery(db,
        `UPDATE levels SET "mora"=CAST(COALESCE("mora",'0') AS BIGINT)-$1
         WHERE "user"=$2 AND "guild"=$3
           AND CAST(COALESCE("mora",'0') AS BIGINT) >= $1
         RETURNING "mora"`,
        [cost, userId, guildId]);

    if (!deductRes?.rows?.length) {
        const userData = await safeQuery(db,
            `SELECT "mora" FROM levels WHERE "user"=$1 AND "guild"=$2`, [userId, guildId]);
        const mora = Number(userData.rows[0]?.mora || 0);
        return { error: `تحتاج ${cost.toLocaleString()} ${EMOJI_MORA} للترقية. رصيدك: ${mora.toLocaleString()}` };
    }

    // ترقية المستوى مشروطة بأن يكون المستوى الحالي لا يزال هو نفسه (يمنع الترقية المزدوجة)
    const upgrRes = await safeQuery(db,
        `UPDATE user_caravan_stats SET "${rankKey}"="${rankKey}"+1
         WHERE "userID"=$1 AND "guildID"=$2 AND "${rankKey}"=$3
         RETURNING "${rankKey}"`,
        [userId, guildId, current]);

    if (!upgrRes?.rows?.length) {
        // المستوى تغيّر في النفس الوقت (race)؛ أعد الموارد
        await safeExecute(db,
            `UPDATE levels SET "mora"=CAST(COALESCE("mora",'0') AS BIGINT)+$1 WHERE "user"=$2 AND "guild"=$3`,
            [cost, userId, guildId]);
        return { error: 'تمت الترقية بالفعل أو حدث خطأ. حاول مرة أخرى.' };
    }

    return { ok: true, newLevel: current + 1, cost, upgCfg };
}

module.exports = { getUserCaravanStats, getActiveCaravan, upgradeCaravan };
