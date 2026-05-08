const { EmbedBuilder } = require('discord.js');
const { safeQuery, safeExecute } = require('./db');
const { caravanConfig, farmAnimals, seedsData, upgradeMats, EMOJI_MORA } = require('./config');
const { getEquippedBuffs, calcDuration, calcRiskFactor, calcRewardMultiplier } = require('./calculations');
const { getUserCaravanStats } = require('./stats');
const { initCaravanTables } = require('./tables');
const { initMarketTables } = require('./market');

async function sendCaravan(db, userId, guildId, destId, equippedArtifacts = [], marketChannelId = null) {
    const dest = caravanConfig.destinations.find(d => d.id === destId);
    if (!dest) return { error: 'وجهة غير موجودة.' };

    if (equippedArtifacts && equippedArtifacts.length > 0) {
        for (const art of equippedArtifacts) {
            await safeExecute(db,
                `UPDATE user_inventory
                 SET "quantity" = GREATEST(0, CAST(COALESCE("quantity", '0') AS INTEGER) - $1)
                 WHERE "userID"=$2 AND "guildID"=$3 AND ("itemID"=$4 OR "itemid"=$4)`,
                [art.count, userId, guildId, art.id]
            );
        }
    }

    const stats      = await getUserCaravanStats(db, userId, guildId);
    const buffs      = getEquippedBuffs(equippedArtifacts);
    const durationMs = calcDuration(dest, stats, buffs);
    const riskFactor = calcRiskFactor(dest, stats);
    const now        = Date.now();
    const startTime  = now;
    const endTime    = now + durationMs;

    const willBeAttacked = Math.random() < riskFactor;
    let attackScheduledAt = 0;
    if (willBeAttacked) {
        const attackOffset = durationMs * (0.35 + Math.random() * 0.30);
        attackScheduledAt  = Math.floor(startTime + attackOffset);
    }

    const cvRow = await safeQuery(db, `
        INSERT INTO user_caravans
            ("userID","guildID","destinationId","startTime","endTime","status",
             "equippedArtifacts","attackScheduledAt","attackResolved","rewardMultiplier","marketChannelId")
        VALUES ($1,$2,$3,$4,$5,'traveling',$6,$7,0,1.0,$8)
        ON CONFLICT ("userID","guildID") DO UPDATE SET
            "destinationId"=$3,"startTime"=$4,"endTime"=$5,"status"='traveling',
            "equippedArtifacts"=$6,"attackScheduledAt"=$7,"attackResolved"=0,
            "guardMessageId"=NULL,"attackChannelId"=NULL,"rewardMultiplier"=1.0,"marketChannelId"=$8
        RETURNING "id"`,
        [userId, guildId, destId, startTime, endTime,
         JSON.stringify(equippedArtifacts), attackScheduledAt, marketChannelId]);

    const caravanId = cvRow?.rows?.[0]?.id || null;
    return { ok: true, caravanId, dest, durationMs, endTime, riskFactor, willBeAttacked };
}

async function distributeRewards(client, db, caravan) {
    const userId  = caravan.userid  || caravan.userID;
    const guildId = caravan.guildid || caravan.guildID;
    const destId  = caravan.destinationid || caravan.destinationId;
    const dest    = caravanConfig.destinations.find(d => d.id === destId);
    if (!dest) return [];

    const stats       = await getUserCaravanStats(db, userId, guildId);
    const artifacts   = JSON.parse(caravan.equippedartifacts || caravan.equippedArtifacts || '[]');
    const buffs       = getEquippedBuffs(artifacts);
    const baseMulti   = calcRewardMultiplier(stats, buffs);
    const attackMulti = Number(caravan.rewardmultiplier ?? caravan.rewardMultiplier ?? 1.0);
    const finalMulti  = baseMulti * attackMulti;

    let summary = [];

    try {
        if (dest.reward_type === 'mora') {
            const amount = Math.floor(
                (dest.reward_min + Math.random() * (dest.reward_max - dest.reward_min)) * finalMulti);
            await safeExecute(db,
                `UPDATE levels SET "mora"=CAST(COALESCE("mora",'0') AS BIGINT)+$1 WHERE "user"=$2 AND "guild"=$3`,
                [amount, userId, guildId]);
            summary.push(`💰 ${amount.toLocaleString()} ${EMOJI_MORA}`);

        } else if (dest.reward_type === 'xp') {
            const amount = Math.floor(
                (dest.reward_min + Math.random() * (dest.reward_max - dest.reward_min)) * finalMulti);
            await safeExecute(db,
                `UPDATE levels SET "xp"=CAST(COALESCE("xp",'0') AS BIGINT)+$1,"totalXP"=CAST(COALESCE("totalXP",'0') AS BIGINT)+$1 WHERE "user"=$2 AND "guild"=$3`,
                [amount, userId, guildId]);
            summary.push(`✨ ${amount.toLocaleString()} XP`);

        } else if (dest.reward_type === 'reputation') {
            const amount = Math.floor(
                (dest.reward_min + Math.random() * (dest.reward_max - dest.reward_min)) * finalMulti);
            await safeExecute(db,
                `INSERT INTO user_reputation ("userID","guildID","rep_points") VALUES ($1,$2,$3)
                 ON CONFLICT ("userID","guildID") DO UPDATE SET "rep_points"=user_reputation.rep_points+$3`,
                [userId, guildId, amount]);
            summary.push(`🌟 ${amount} نقطة سمعة`);

        } else if (dest.reward_type === 'artifact') {
            const allItems = [];
            if (upgradeMats?.weapon_materials)
                upgradeMats.weapon_materials.forEach(r => r.materials.forEach(m => allItems.push(m)));
            if (upgradeMats?.skill_books)
                upgradeMats.skill_books.forEach(c => c.books.forEach(b => allItems.push(b)));
            const pulls = Math.max(1, Math.floor((dest.reward_pulls || 1) * finalMulti));
            for (let i = 0; i < pulls; i++) {
                const roll = Math.random();
                let pool;
                if (roll < 0.03)       pool = allItems.filter(x => x.rarity === 'Legendary');
                else if (roll < 0.12)  pool = allItems.filter(x => x.rarity === 'Epic');
                else if (roll < 0.32)  pool = allItems.filter(x => x.rarity === 'Rare');
                else if (roll < 0.62)  pool = allItems.filter(x => x.rarity === 'Uncommon');
                else                   pool = allItems.filter(x => x.rarity === 'Common');
                if (!pool.length) pool = allItems;
                const item = pool[Math.floor(Math.random() * pool.length)];
                await safeExecute(db,
                    `INSERT INTO user_inventory ("guildID","userID","itemID","quantity") VALUES ($1,$2,$3,1)
                     ON CONFLICT ("guildID","userID","itemID") DO UPDATE SET "quantity"=user_inventory.quantity+1`,
                    [guildId, userId, item.id]);
                summary.push(`📦 ${item.name} (${item.rarity})`);
            }

        } else if (dest.reward_type === 'nature') {
            const seedCount = Math.floor(
                (dest.reward_seeds_min + Math.random() * (dest.reward_seeds_max - dest.reward_seeds_min + 1)) * finalMulti);
            const seed = seedsData[Math.floor(Math.random() * seedsData.length)];
            if (seed) {
                await safeExecute(db,
                    `INSERT INTO user_inventory ("guildID","userID","itemID","quantity") VALUES ($1,$2,$3,$4)
                     ON CONFLICT ("guildID","userID","itemID") DO UPDATE SET "quantity"=user_inventory.quantity+$4`,
                    [guildId, userId, seed.id, seedCount]);
                summary.push(`🌱 ${seedCount}x ${seed.name}`);
            }
            if (Math.random() < (dest.reward_animal_chance || 0.30)) {
                const animal = farmAnimals[Math.floor(Math.random() * farmAnimals.length)];
                if (animal) {
                    try {
                        const { getUsedCapacity, getPlayerCapacity } = require('../../utils/farmUtils.js');
                        const maxCap  = await getPlayerCapacity(client, userId, guildId);
                        const usedCap = await getUsedCapacity(db, userId, guildId);
                        const lifespan = usedCap >= maxCap
                            ? Math.floor(animal.lifespan_days * 0.5)
                            : animal.lifespan_days;
                        const purchaseTs = Date.now() - ((animal.lifespan_days - lifespan) * 86400000);
                        await safeExecute(db,
                            `INSERT INTO user_farm ("guildID","userID","animalID","purchaseTimestamp","quantity","lastFedTimestamp")
                             VALUES ($1,$2,$3,$4,1,$5)`,
                            [guildId, userId, animal.id, purchaseTs, Date.now()]);
                        summary.push(usedCap >= maxCap
                            ? `🐾 ${animal.name} (عمر مقلص - الحظيرة ممتلئة)`
                            : `🐾 ${animal.name}`);
                    } catch (e) { console.error('[Farm animal error]', e); }
                }
            }
        }
    } catch (e) {
        console.error('[distributeRewards]', e);
    }

    // Update trip counters
    await safeExecute(db,
        `UPDATE user_caravan_stats SET "total_trips"="total_trips"+1, "successful_trips"="successful_trips"+$3
         WHERE "userID"=$1 AND "guildID"=$2`,
        [userId, guildId, attackMulti >= 0.5 ? 1 : 0]);

    // Remove the completed caravan record
    await safeExecute(db,
        `UPDATE user_caravans SET "status"='completed' WHERE "userID"=$1 AND "guildID"=$2`,
        [userId, guildId]);

    return summary;
}

async function sendAttackNotification(client, db, caravan) {
    const { sendAmbushNotification } = require('./lobby');
    return sendAmbushNotification(client, db, caravan);
}

const pendingAttacks = new Set();

async function processCaravanReturns(client, db) {
    try {
        await initCaravanTables(db);
        await initMarketTables(db);
        const now = Date.now();

        const active = await safeQuery(db, `SELECT * FROM user_caravans WHERE "status"='traveling'`, []);

        for (const caravan of active.rows) {
            const caravanId      = caravan.id;
            const attackAt       = Number(caravan.attackscheduledat || caravan.attackScheduledAt || 0);
            const endTime        = Number(caravan.endtime           || caravan.endTime            || 0);
            const attackResolved = Number(caravan.attackresolved    || caravan.attackResolved     || 0);
            const guardMsgId     = caravan.guardmessageid           || caravan.guardMessageId;
            const userId         = caravan.userid                   || caravan.userID;
            const guildId        = caravan.guildid                  || caravan.guildID;

            if (now >= endTime) {
                // Penalize for unresolved ambush
                if (attackAt > 0 && attackResolved === 0) {
                    caravan.rewardmultiplier = 0.5;
                    caravan.rewardMultiplier = 0.5;
                }

                // Distribute rewards and mark caravan complete
                const summary = await distributeRewards(client, db, caravan);

                // --- Locate the announcement channel ---
                // Priority 1: channel stored at dispatch time
                let casinoId = caravan.marketchannelid || caravan.marketChannelId || null;

                // Priority 2: fall back to settings table
                if (!casinoId) {
                    const sRes = await db.query(
                        `SELECT * FROM settings WHERE guild=$1 OR "guild"=$1`, [guildId]
                    ).catch(() => ({ rows: [] }));
                    const s = sRes.rows[0] || {};
                    casinoId = s.casinochannelid  || s.casinoChannelID
                            || s.caravanchannelid || s.caravanChannelID
                            || s.casinochannelid2 || s.casinoChannelID2;
                }

                let guild = client.guilds.cache.get(guildId);
                if (!guild) guild = await client.guilds.fetch(guildId).catch(() => null);

                let channel = null;
                if (guild) {
                    if (casinoId) {
                        channel = guild.channels.cache.get(casinoId)
                               || await guild.channels.fetch(casinoId).catch(() => null);
                    }
                    if (!channel) {
                        await guild.channels.fetch().catch(() => {});
                        const me = guild.members.me ?? await guild.members.fetchMe().catch(() => null);
                        channel = guild.channels.cache.find(c =>
                            c.type === 0 &&
                            me && me.permissionsIn(c).has(['SendMessages'])
                        ) ?? null;
                    }
                }

                if (channel) {
                    const destId = caravan.destinationid || caravan.destinationId;
                    const dest   = caravanConfig.destinations.find(d => d.id === destId);

                    await channel.send({
                        content: `<@${userId}>`,
                        embeds: [new EmbedBuilder()
                            .setColor(dest?.color || '#00FF88')
                            .setTitle(`✅ وصلت القافلة من ${dest?.emoji || ''} ${dest?.name || ''}!`)
                            .setDescription(
                                `<@${userId}> عادت بضاعتك بسلام.\n**المكافآت:**\n` +
                                (summary?.length ? summary.join('\n') : 'لا يوجد')
                            )
                            .setTimestamp()],
                    }).catch(() => {});
                }

                continue;
            }

            // Caravan still traveling — fire ambush notification when the time comes
            if (attackAt > 0 && now >= attackAt && attackResolved === 0 && !guardMsgId) {
                if (!pendingAttacks.has(caravanId)) {
                    pendingAttacks.add(caravanId);
                    sendAttackNotification(client, db, caravan)
                        .finally(() => pendingAttacks.delete(caravanId));
                }
            }
        }
    } catch (e) {
        console.error('[processCaravanReturns]', e);
    }
}

let _checkerStarted = false;
function setupCaravanChecker(client, db) {
    if (_checkerStarted) return;
    _checkerStarted = true;
    // Run immediately so initCaravanTables (adds marketChannelId column) fires at startup
    processCaravanReturns(client, db);
    setInterval(() => processCaravanReturns(client, db), 15 * 1000);
}

module.exports = {
    sendCaravan,
    distributeRewards,
    sendAttackNotification,
    processCaravanReturns,
    setupCaravanChecker,
    pendingAttacks,
};
