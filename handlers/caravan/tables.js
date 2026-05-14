const { safeQuery, safeExecute } = require('./db');

async function initCaravanTables(db) {
    await safeExecute(db, `
        CREATE TABLE IF NOT EXISTS user_caravans (
            "id"                BIGSERIAL PRIMARY KEY,
            "userID"            TEXT NOT NULL,
            "guildID"           TEXT NOT NULL,
            "destinationId"     TEXT NOT NULL,
            "startTime"         BIGINT DEFAULT 0,
            "endTime"           BIGINT DEFAULT 0,
            "status"            TEXT DEFAULT 'traveling',
            "equippedArtifacts" TEXT DEFAULT '[]',
            "attackScheduledAt" BIGINT DEFAULT 0,
            "attackResolved"    INTEGER DEFAULT 0,
            "guardMessageId"    TEXT DEFAULT NULL,
            "attackChannelId"   TEXT DEFAULT NULL,
            "rewardMultiplier"  REAL DEFAULT 1.0
        )`, []);

    await safeExecute(db,
        `ALTER TABLE user_caravans DROP CONSTRAINT IF EXISTS user_caravans_userid_guildid_key`, []).catch(() => {});
    await safeExecute(db,
        `ALTER TABLE user_caravans DROP CONSTRAINT IF EXISTS "user_caravans_userID_guildID_key"`, []).catch(() => {});

    await safeExecute(db, `
        CREATE TABLE IF NOT EXISTS user_caravan_stats (
            "userID"           TEXT NOT NULL,
            "guildID"          TEXT NOT NULL,
            "capacity_rank"    BIGINT DEFAULT 1,
            "speed_rank"       BIGINT DEFAULT 1,
            "defense_rank"     BIGINT DEFAULT 1,
            "luck_rank"        BIGINT DEFAULT 1,
            "total_trips"      BIGINT DEFAULT 0,
            "successful_trips" BIGINT DEFAULT 0,
            "cooldown_until"   BIGINT DEFAULT 0,
            PRIMARY KEY ("userID","guildID")
        )`, []);

    await safeExecute(db,
        `ALTER TABLE user_caravan_stats ADD COLUMN IF NOT EXISTS "cooldown_until" BIGINT DEFAULT 0`, []);

    await safeExecute(db,
        `ALTER TABLE user_caravan_stats ADD COLUMN IF NOT EXISTS "best_loot" BIGINT DEFAULT 0`, []);
    await safeExecute(db,
        `ALTER TABLE user_caravan_stats ADD COLUMN IF NOT EXISTS "ambush_survived" BIGINT DEFAULT 0`, []);
    await safeExecute(db,
        `ALTER TABLE user_caravan_stats ADD COLUMN IF NOT EXISTS "last_dest" TEXT DEFAULT NULL`, []);
    await safeExecute(db,
        `ALTER TABLE user_caravan_stats ADD COLUMN IF NOT EXISTS "best_loot_label" TEXT DEFAULT NULL`, []);

    await safeExecute(db,
        `ALTER TABLE user_caravans ADD COLUMN IF NOT EXISTS "marketChannelId" TEXT DEFAULT NULL`, []);

    await safeExecute(db,
        `CREATE INDEX IF NOT EXISTS idx_user_caravans_status ON user_caravans("status")`, []);
}

async function checkCaravanCooldown(db, userId, guildId) {
    const res = await safeQuery(db,
        `SELECT "cooldown_until" FROM user_caravan_stats WHERE "userID"=$1 AND "guildID"=$2`,
        [userId, guildId]);
    const until = Number(res.rows[0]?.cooldown_until || 0);
    return { onCooldown: Date.now() < until, expiresAt: until };
}

async function setCaravanCooldown(db, userId, guildId) {
    const until = Date.now() + 60 * 60 * 1000;
    await safeExecute(db, `
        INSERT INTO user_caravan_stats ("userID","guildID","cooldown_until")
        VALUES ($1,$2,$3)
        ON CONFLICT ("userID","guildID") DO UPDATE SET "cooldown_until"=$3`,
        [userId, guildId, until]);
}

module.exports = { initCaravanTables, checkCaravanCooldown, setCaravanCooldown };
