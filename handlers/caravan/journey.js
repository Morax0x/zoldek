const { AttachmentBuilder } = require('discord.js');

let _generateCaravanEvent = null;
try { ({ generateCaravanEvent: _generateCaravanEvent } = require('../../generators/caravan/event')); } catch {}
let _generateMarketSummary = null;
try { ({ generateMarketSummaryCanvas: _generateMarketSummary } = require('../../generators/caravan/market-summary-generator')); } catch {}
const { safeQuery, safeExecute } = require('./db');
const { caravanConfig, farmAnimals, seedsData, upgradeMats, EMOJI_MORA } = require('./config');
const { getEquippedBuffs, calcDuration, calcRiskFactor } = require('./calculations');
const { getUserCaravanStats } = require('./stats');
const { initCaravanTables } = require('./tables');
const { initMarketTables } = require('./market');

async function sendCaravan(db, userId, guildId, destId, equippedArtifacts = [], marketChannelId = null) {
    const dest = caravanConfig.destinations.find(d => d.id === destId);
    if (!dest) return { error: 'وجهة غير موجودة.' };

    // Ensure tables exist before any insert
    await initCaravanTables(db);
    await initMarketTables(db);

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
    const riskFactor = calcRiskFactor(dest, stats, buffs);
    const now        = Date.now();
    const startTime  = now;
    const endTime    = now + durationMs;

    const willBeAttacked = Math.random() < riskFactor;
    let attackScheduledAt = 0;
    if (willBeAttacked) {
        const attackOffset = durationMs * (0.35 + Math.random() * 0.30);
        attackScheduledAt  = Math.floor(startTime + attackOffset);
    }

    // Insert WITHOUT marketChannelId to avoid schema issues on existing DBs,
    // then optionally update it separately if the column exists
    const cvRow = await safeQuery(db, `
        INSERT INTO user_caravans
            ("userID","guildID","destinationId","startTime","endTime","status",
             "equippedArtifacts","attackScheduledAt","attackResolved","rewardMultiplier")
        VALUES ($1,$2,$3,$4,$5,'traveling',$6,$7,0,1.0)
        RETURNING "id"`,
        [userId, guildId, destId, startTime, endTime,
         JSON.stringify(equippedArtifacts), attackScheduledAt]);

    let caravanId = cvRow?.rows?.[0]?.id || null;

    // Fallback: fetch id if RETURNING didn't give it (e.g. conflict updated existing row)
    if (!caravanId) {
        const sel = await safeQuery(db,
            `SELECT "id" FROM user_caravans WHERE "userID"=$1 AND "guildID"=$2`,
            [userId, guildId]);
        caravanId = sel?.rows?.[0]?.id || null;
    }

    // Store channel id for arrival notification (best-effort, column may not exist yet)
    if (caravanId && marketChannelId) {
        await safeExecute(db,
            `UPDATE user_caravans SET "marketChannelId"=$1 WHERE "id"=$2`,
            [marketChannelId, caravanId]).catch(() => {});
    }

    console.log(`[sendCaravan] userId=${userId} destId=${destId} caravanId=${caravanId}`);
    return { ok: true, caravanId, dest, durationMs, endTime, riskFactor, willBeAttacked };
}

async function distributeRewards(client, db, caravan) {
    const userId  = caravan.userid  || caravan.userID;
    const guildId = caravan.guildid || caravan.guildID;
    const destId  = caravan.destinationid || caravan.destinationId;
    const dest    = caravanConfig.destinations.find(d => d.id === destId);
    if (!dest) return [];

    const rewardMult = Number(caravan.rewardmultiplier || caravan.rewardMultiplier || 1.0);

    const stats     = await getUserCaravanStats(db, userId, guildId);
    const artifacts = JSON.parse(caravan.equippedartifacts || caravan.equippedArtifacts || '[]');
    const buffs     = getEquippedBuffs(artifacts);
    const luckFactor = (stats.luck_rank || 1) + (buffs.luckBuff || 0);
    const luckCoeff = caravanConfig.upgrades.luck.luck_per_level || 0.002;

    let bestThisTrip = { score: 0, label: '' };
    let summary = [];

    try {
        if (dest.reward_type === 'mora') {
            const base = dest.reward_min + Math.random() * (dest.reward_max - dest.reward_min);
            const luckBonus = (dest.reward_max - dest.reward_min) * (luckFactor - 1) * luckCoeff;
            const amount = Math.floor(Math.min(dest.reward_max, base + luckBonus) * rewardMult);
            if (amount > bestThisTrip.score) bestThisTrip = { score: amount, label: 'مورا' };
            await safeExecute(db,
                `UPDATE levels SET "mora"=CAST(COALESCE("mora",'0') AS BIGINT)+$1 WHERE "user"=$2 AND "guild"=$3`,
                [amount, userId, guildId]);
            summary.push(`💰 ${amount.toLocaleString()} ${EMOJI_MORA}`);

        } else if (dest.reward_type === 'xp') {
            const base = dest.reward_min + Math.random() * (dest.reward_max - dest.reward_min);
            const luckBonus = (dest.reward_max - dest.reward_min) * (luckFactor - 1) * luckCoeff;
            const amount = Math.floor(Math.min(dest.reward_max, base + luckBonus) * rewardMult);
            if (amount > bestThisTrip.score) bestThisTrip = { score: amount, label: 'خبرة' };
            await safeExecute(db,
                `UPDATE levels SET "xp"=CAST(COALESCE("xp",'0') AS BIGINT)+$1,"totalXP"=CAST(COALESCE("totalXP",'0') AS BIGINT)+$1 WHERE "user"=$2 AND "guild"=$3`,
                [amount, userId, guildId]);
            summary.push(`✨ ${amount.toLocaleString()} XP`);

        } else if (dest.reward_type === 'reputation') {
            const base = dest.reward_min + Math.random() * (dest.reward_max - dest.reward_min);
            const luckBonus = (dest.reward_max - dest.reward_min) * (luckFactor - 1) * luckCoeff;
            const amount = Math.floor(Math.min(dest.reward_max, base + luckBonus) * rewardMult);
            if (amount * 100 > bestThisTrip.score) bestThisTrip = { score: amount * 100, label: 'سمعة' };
            await safeExecute(db,
                `INSERT INTO user_reputation ("userID","guildID","rep_points") VALUES ($1,$2,$3)
                 ON CONFLICT ("userID","guildID") DO UPDATE SET "rep_points"=user_reputation.rep_points+$3`,
                [userId, guildId, amount]);
            summary.push(`🌟 ${amount} نقطة سمعة`);

        } else if (dest.reward_type === 'artifact') {
            const pullsMin = Math.max(1, Math.floor((dest.reward_pulls_min || 2) * rewardMult));
            const pullsMax = Math.max(1, Math.floor((dest.reward_pulls_max || 20) * rewardMult));
            const pulls = pullsMin + Math.floor(Math.random() * (pullsMax - pullsMin + 1));
            const allItems = [];
            if (upgradeMats?.weapon_materials)
                upgradeMats.weapon_materials.forEach(r => r.materials.forEach(m => allItems.push(m)));
            if (upgradeMats?.skill_books)
                upgradeMats.skill_books.forEach(c => c.books.forEach(b => allItems.push(b)));
            const rarityWeight = { Legendary: 10000, Epic: 5000, Rare: 2000, Uncommon: 800, Common: 300 };
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
                const w = rarityWeight[item.rarity] || 300;
                if (w > bestThisTrip.score) bestThisTrip = { score: w, label: 'ارتيفاكت' };
                await safeExecute(db,
                    `INSERT INTO user_inventory ("guildID","userID","itemID","quantity") VALUES ($1,$2,$3,1)
                     ON CONFLICT ("guildID","userID","itemID") DO UPDATE SET "quantity"=user_inventory.quantity+1`,
                    [guildId, userId, item.id]);
                summary.push(`📦 ${item.name}`);
            }

        } else if (dest.reward_type === 'nature') {
            const seedMin = Math.max(1, Math.floor((dest.reward_seeds_min || 10) * rewardMult));
            const seedMax = Math.max(1, Math.floor((dest.reward_seeds_max || 30) * rewardMult));
            const seedCount = seedMin + Math.floor(Math.random() * (seedMax - seedMin + 1));
            const seed = seedsData[Math.floor(Math.random() * seedsData.length)];
            if (seed) {
                const seedScore = seedCount * 100;
                if (seedScore > bestThisTrip.score) bestThisTrip = { score: seedScore, label: 'بذور' };
                await safeExecute(db,
                    `INSERT INTO user_inventory ("guildID","userID","itemID","quantity") VALUES ($1,$2,$3,$4)
                     ON CONFLICT ("guildID","userID","itemID") DO UPDATE SET "quantity"=user_inventory.quantity+$4`,
                    [guildId, userId, seed.id, seedCount]);
                summary.push(`🌱 ${seedCount}x ${seed.name}`);
            }
            const maxAnimals = dest.reward_animals_max || 5;
            if (Math.random() < (dest.reward_animal_chance || 0.40)) {
                const animalCount = 1 + Math.floor(Math.random() * Math.min(maxAnimals, 5));
                for (let a = 0; a < animalCount; a++) {
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
                            if (500 > bestThisTrip.score) bestThisTrip = { score: 500, label: 'حيوانات' };
                        } catch (e) { console.error('[Farm animal error]', e); }
                    }
                }
            }
        }
    } catch (e) {
        console.error('[distributeRewards]', e);
    }

    const now = Date.now();
    const lastTrip = Number(stats.last_trip_time || 0);
    const within48h = (now - lastTrip) < 172800000;
    const newStreak = within48h ? Number(stats.trip_streak || 0) + 1 : 1;

    await safeExecute(db,
        `UPDATE user_caravan_stats SET "total_trips"="total_trips"+1, "successful_trips"="successful_trips"+1,
         "last_dest"=$3, "best_loot"=GREATEST("best_loot",$4),
         "best_loot_label"=CASE WHEN $5::BIGINT > "best_loot" THEN $6 ELSE "best_loot_label" END,
         "trip_streak"=$7, "last_trip_time"=$8
         WHERE "userID"=$1 AND "guildID"=$2`,
        [userId, guildId, destId, bestThisTrip.score, bestThisTrip.score, bestThisTrip.label, newStreak, now]);

    await safeExecute(db,
        `UPDATE user_caravans SET "status"='completed' WHERE "id"=$1`,
        [caravan.id]);

    return summary;
}

async function sendAttackNotification(client, db, caravan) {
    const { sendAmbushNotification } = require('./lobby');
    return sendAmbushNotification(client, db, caravan);
}

const pendingAttacks  = new Set();
const pendingReturns  = new Set(); // prevents double reward distribution if checker overlaps

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
                if (pendingReturns.has(caravanId)) continue;
                pendingReturns.add(caravanId);

                // Loot staging market for unresolved ambush
                if (attackAt > 0 && attackResolved === 0) {
                    const { stagingLootItems } = require('./market/market-db');
                    await stagingLootItems(db, userId, guildId, caravanConfig.attack.market_loot_defeat || 0.05, caravanId);
                }

                // Distribute rewards and mark caravan complete
                const summary = await distributeRewards(client, db, caravan);
                pendingReturns.delete(caravanId);

                // Fetch actual market sales data for the report
                let soldItems = [], unsoldItems = [], totalEarned = 0;
                try {
                    const { getMarketReportData } = require('./market/market-db');
                    const marketData = await getMarketReportData(db, caravanId);
                    soldItems    = marketData.soldItems    || [];
                    unsoldItems  = marketData.unsoldItems  || [];
                    totalEarned  = marketData.totalEarned  || 0;
                } catch (e) {
                    console.error('[journey] market report data error:', e?.message);
                }

// Priority 1: channel stored at dispatch time (caravan/guild setting)
                let targetChannelId = caravan.marketchannelid || caravan.marketChannelId || null;

                // Priority 2: check settings table
                if (!targetChannelId) {
                    const sRes = await db.query(
                        `SELECT * FROM settings WHERE "guild"=$1 OR guild=$1`, [guildId]
                    ).catch(() => ({ rows: [] }));
                    const s = sRes.rows[0] || {};
                    targetChannelId = s.casinochannelid || s.casinoChannelID
                                   || s.caravanchannelid || s.caravanChannelID
                                   || s.casinochannelid2 || s.casinoChannelID2
                                   || s.channelid || s.channelID;
                }

                let guild = client.guilds.cache.get(guildId);
                if (!guild) guild = await client.guilds.fetch(guildId).catch(() => null);

                let channel = null;
                if (guild && targetChannelId) {
                    channel = guild.channels.cache.get(targetChannelId)
                           || await guild.channels.fetch(targetChannelId).catch(() => null);
                }

                // If no channel configured → send DM
                if (!channel) {
                    try {
                        const userObj = await client.users.fetch(userId).catch(() => null);
                        if (userObj) {
                            const destId = caravan.destinationid || caravan.destinationId;
                            const dest   = caravanConfig.destinations.find(d => d.id === destId);
                            const destName = dest?.name || 'القافلة';
                            const destEmoji = dest?.emoji || '🐪';
                            const destColor = dest?.color || '#FFD700';

                            let reportBuf = null;
                            if (_generateMarketSummary) {
                                try {
                                    const member = guild ? await guild.members.fetch(userId).catch(() => null) : null;
                                    const ownerName = member?.displayName || member?.user?.globalName || member?.user?.username || 'تاجر';
                                    const avatarUrl = member?.user?.displayAvatarURL({ extension: 'png', size: 128 }) || null;
                                    reportBuf = await _generateMarketSummary({
                                        destName: `${destEmoji} ${destName}`,
                                        destId, destColor, ownerName, avatarUrl,
                                        soldItems, unsoldItems, totalEarned,
                                        journeyRewards: summary || [],
                                    });
                                } catch (e) {}
                            }

                            const rewardText = summary?.length
                                ? `**المكافآت:**\n${summary.map(s => `✶ ${s}`).join('\n')}`
                                : '✅ **عادت القافلة بسلام!**';

                            if (reportBuf) {
                                await userObj.send({
                                    content: `<@${userId}> ✅ **عادت قافلتك من ${destEmoji} ${destName}!**
${rewardText}`,
                                    files: [new AttachmentBuilder(reportBuf, { name: 'journey-report.png' })],
                                }).catch(() => {});
                            } else {
                                await userObj.send({
                                    content: `<@${userId}> ✅ **عادت قافلتك من ${destEmoji} ${destName}!**
${rewardText}`,
                                }).catch(() => {});
                            }
                        }
                    } catch (e) {
                        console.error('[processCaravanReturns] DM notification error:', e?.message);
                    }
                }

                if (channel) {
                    const destId = caravan.destinationid || caravan.destinationId;
                    const dest   = caravanConfig.destinations.find(d => d.id === destId);
                    const destName = dest?.name || 'القافلة';
                    const destColor = dest?.color || '#FFD700';

                    let reportBuf = null;
                    if (_generateMarketSummary) {
                        try {
                            const member = await guild.members.fetch(userId).catch(() => null);
                            const ownerName = member?.displayName || member?.user?.globalName || member?.user?.username || userId;
                            const avatarUrl = member?.user?.displayAvatarURL({ extension: 'png', size: 128 }) || null;

                            reportBuf = await _generateMarketSummary({
                                destName, destId, destColor, ownerName, avatarUrl,
                                soldItems, unsoldItems, totalEarned,
                                journeyRewards: summary || [],
                            });
                        } catch (e) {
                            console.error('[journey] summary canvas error:', e?.message);
                        }
                    }
                    if (reportBuf) {
                        await channel.send({
                            content: `<@${userId}>`,
                            files: [new AttachmentBuilder(reportBuf, { name: 'journey-report.png' })],
                        }).catch(() => {});
                    } else {
                        await channel.send({
                            content: `<@${userId}> ✅ **عادت قافلتك من ${dest?.emoji || ''} ${destName}!**
**المكافآت:**
${summary?.length ? summary.map(s => `✶ ${s}`).join('\n') : 'عادت القافلة بسلام.'}`,
                        }).catch(() => {});
                    }
                }

                // Close open market thread if exists
                try {
                    const { closeMarketThread, getSessionByCaravan: getMarketSession } = require('./market/market-thread');
                    const mktSession = await getMarketSession(db, caravanId);
                    if (mktSession && mktSession.status !== 'closed') {
                        const mktThreadId = mktSession.threadid || mktSession.threadId;
                        const mktGuildId  = mktSession.guildid  || mktSession.guildID;
                        if (mktThreadId) {
                            await closeMarketThread(client, db, mktThreadId, mktGuildId, summary, true);
                        }
                    }
                } catch (e) {
                    console.error('[processCaravanReturns] market integration error:', e?.message);
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
