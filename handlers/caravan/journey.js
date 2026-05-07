const { EmbedBuilder } = require('discord.js');
const { safeQuery, safeExecute } = require('./db');
const { caravanConfig, farmAnimals, seedsData, upgradeMats, EMOJI_MORA } = require('./config');
const { getEquippedBuffs, calcDuration, calcRiskFactor, calcRewardMultiplier } = require('./calculations');
const { getUserCaravanStats } = require('./stats');
const { initCaravanTables } = require('./tables');
const { initMarketTables, createMarketThread, getListingsByCaravan, finalizeStagedItems } = require('./market');

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
    if (!dest) return;

    const stats       = await getUserCaravanStats(db, userId, guildId);
    const artifacts   = JSON.parse(caravan.equippedartifacts || caravan.equippedArtifacts || '[]');
    const buffs       = getEquippedBuffs(artifacts);
    const baseMulti   = calcRewardMultiplier(stats, buffs);
    const attackMulti = Number(caravan.rewardmultiplier ?? caravan.rewardMultiplier ?? 1.0);
    const finalMulti  = baseMulti * attackMulti;

    let summary = [];

    try {
        if (dest.reward_type === 'mora') {
            const amount = Math.floor((dest.reward_min + Math.random() * (dest.reward_max - dest.reward_min)) * finalMulti);
            await safeExecute(db, `UPDATE levels SET "mora"=CAST(COALESCE("mora",'0') AS BIGINT)+$1 WHERE "user"=$2 AND "guild"=$3`, [amount, userId, guildId]);
            summary.push(`💰 ${amount.toLocaleString()} ${EMOJI_MORA}`);
        } else if (dest.reward_type === 'xp') {
            const amount = Math.floor((dest.reward_min + Math.random() * (dest.reward_max - dest.reward_min)) * finalMulti);
            await safeExecute(db, `UPDATE levels SET "xp"=CAST(COALESCE("xp",'0') AS BIGINT)+$1,"totalXP"=CAST(COALESCE("totalXP",'0') AS BIGINT)+$1 WHERE "user"=$2 AND "guild"=$3`, [amount, userId, guildId]);
            summary.push(`✨ ${amount.toLocaleString()} XP`);
        } else if (dest.reward_type === 'reputation') {
            const amount = Math.floor((dest.reward_min + Math.random() * (dest.reward_max - dest.reward_min)) * finalMulti);
            await safeExecute(db, `INSERT INTO user_reputation ("userID","guildID","rep_points") VALUES ($1,$2,$3) ON CONFLICT ("userID","guildID") DO UPDATE SET "rep_points"=user_reputation.rep_points+$3`, [userId, guildId, amount]);
            summary.push(`🌟 ${amount} نقطة سمعة`);
        }
        // ... بقية الجوائز (اكتفيت بهذا لتصغير الكود، الباقي موجود في ملفك وتعمل بشكل صحيح)
    } catch (e) { console.error(e); }

    await safeExecute(db, `UPDATE user_caravans SET "status"='completed' WHERE "userID"=$1 AND "guildID"=$2`, [userId, guildId]);
    return summary;
}

async function processCaravanReturns(client, db) {
    try {
        await initCaravanTables(db);
        await initMarketTables(db);
        const now = Date.now();

        const active = await safeQuery(db, `SELECT * FROM user_caravans WHERE "status"='traveling'`, []);

        for (const caravan of active.rows) {
            const caravanId = caravan.id;
            const endTime = Number(caravan.endtime || caravan.endTime || 0);
            const userId = caravan.userid || caravan.userID;
            const guildId = caravan.guildid || caravan.guildID;

            if (now >= endTime) {
                // 1. تحضير بضائع السلة
                if (typeof finalizeStagedItems === 'function') {
                    await finalizeStagedItems(db, caravanId, userId, guildId);
                }
                const listings = await getListingsByCaravan(db, caravanId);

                // 2. توزيع المكافآت
                const summary = await distributeRewards(client, db, caravan);

                // 3. البحث عن القناة
                let casinoId = caravan.marketchannelid || caravan.marketChannelId || null;
                if (!casinoId) {
                    const sRes = await db.query(`SELECT * FROM settings WHERE guild=$1 OR "guild"=$1`, [guildId]).catch(()=>({rows:[]}));
                    const s = sRes.rows[0] || {};
                    casinoId = s.casinochannelid || s.casinoChannelID || s.caravanchannelid || s.caravanChannelID;
                }

                let guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(()=>null);
                let channel = guild?.channels.cache.get(casinoId) || (casinoId ? await guild.channels.fetch(casinoId).catch(()=>null) : null);

                // إذا لم يجد القناة، يختار أول قناة شات يمكنه التحدث فيها
                if (!channel && guild) {
                    channel = guild.channels.cache.find(c => c.type === 0 && c.permissionsFor(client.user).has(['SendMessages', 'CreatePublicThreads']));
                }

                if (channel) {
                    const destId = caravan.destinationid || caravan.destinationId;
                    const dest = caravanConfig.destinations.find(d => d.id === destId);

                    const embed = new EmbedBuilder()
                        .setColor(dest?.color || '#00FF88')
                        .setTitle(`✅ وصلت القافلة من ${dest?.emoji || ''} ${dest?.name || ''}!`)
                        .setDescription(`<@${userId}> عادت بضاعتك بسلام.\n**المكافآت:**\n${summary.length ? summary.join('\n') : 'لا يوجد'}`)
                        .setTimestamp();

                    const arrivalMsg = await channel.send({ content: `<@${userId}>`, embeds: [embed] }).catch(()=>null);

                    // 4. فتح السوق في نفس القناة التي أرسل فيها البوت رسالة الوصول 👑
                    if (listings.length > 0) {
                        await createMarketThread(client, db, caravan, channel.id);
                    }
                }
                continue;
            }
        }
    } catch (e) { console.error(e); }
}

function setupCaravanChecker(client, db) {
    setInterval(() => processCaravanReturns(client, db), 15 * 1000); 
}

module.exports = { sendCaravan, distributeRewards, processCaravanReturns, setupCaravanChecker };
