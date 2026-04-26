const caravanConfig = require('../json/caravan-config.json');
const farmAnimals  = require('../json/farm-animals.json');
const seedsData    = require('../json/seeds.json');
const upgradeMats  = require('../json/upgrade-materials.json');

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

const EMOJI_MORA = '<:mora:1435647151349698621>';

/* ─────────────────── safeQuery / safeExecute ─────────────────── */
const safeQuery = async (db, q, p) => {
    try {
        const r = await db.query(q, p);
        return { rows: Array.isArray(r) ? r : (r?.rows || []) };
    } catch (e) {
        const q2 = q.replace(/"([a-zA-Z]+)"/g, (_, c) => c.toLowerCase());
        if (q2 === q) return { rows: [] };
        try {
            const r2 = await db.query(q2, p);
            return { rows: Array.isArray(r2) ? r2 : (r2?.rows || []) };
        } catch { return { rows: [] }; }
    }
};

const safeExecute = async (db, q, p) => {
    try { await db.query(q, p); return true; }
    catch (e) {
        const q2 = q.replace(/"([a-zA-Z]+)"/g, (_, c) => c.toLowerCase());
        if (q2 === q) return false;
        try { await db.query(q2, p); return true; } catch { return false; }
    }
};

/* ─────────────────── إنشاء الجداول ─────────────────── */
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
            "rewardMultiplier"  REAL DEFAULT 1.0,
            UNIQUE("userID","guildID")
        )`, []);

    await safeExecute(db, `
        CREATE TABLE IF NOT EXISTS user_caravan_stats (
            "userID"          TEXT NOT NULL,
            "guildID"         TEXT NOT NULL,
            "capacity_rank"   BIGINT DEFAULT 1,
            "speed_rank"      BIGINT DEFAULT 1,
            "defense_rank"    BIGINT DEFAULT 1,
            "luck_rank"       BIGINT DEFAULT 1,
            "total_trips"     BIGINT DEFAULT 0,
            "successful_trips" BIGINT DEFAULT 0,
            PRIMARY KEY ("userID","guildID")
        )`, []);
}

/* ─────────────────── قراءة إحصائيات اليوزر ─────────────────── */
async function getUserCaravanStats(db, userId, guildId) {
    const res = await safeQuery(db,
        `SELECT * FROM user_caravan_stats WHERE "userID"=$1 AND "guildID"=$2`,
        [userId, guildId]);
    if (res.rows.length) return res.rows[0];

    await safeExecute(db,
        `INSERT INTO user_caravan_stats ("userID","guildID") VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [userId, guildId]);
    return { userid: userId, guildid: guildId,
             capacity_rank:1, speed_rank:1, defense_rank:1, luck_rank:1,
             total_trips:0, successful_trips:0 };
}

/* ─────────────────── قراءة القافلة النشطة ─────────────────── */
async function getActiveCaravan(db, userId, guildId) {
    const res = await safeQuery(db,
        `SELECT * FROM user_caravans WHERE "userID"=$1 AND "guildID"=$2 AND "status"!='completed'`,
        [userId, guildId]);
    return res.rows[0] || null;
}

/* ─────────────────── حساب بافات الأدوات المجهزة ─────────────────── */
function getEquippedBuffs(equippedArtifacts) {
    let speedBuff = 0, luckBuff = 0;
    if (!equippedArtifacts || !equippedArtifacts.length) return { speedBuff, luckBuff };

    const allItems = [];
    if (upgradeMats?.weapon_materials)
        upgradeMats.weapon_materials.forEach(race => race.materials.forEach(m => allItems.push(m)));
    if (upgradeMats?.skill_books)
        upgradeMats.skill_books.forEach(cat => cat.books.forEach(b => allItems.push(b)));

    const artifactBufCfg = caravanConfig.artifact_buffs;

    for (const itemId of equippedArtifacts) {
        const item = allItems.find(i => i.id === itemId);
        if (!item) continue;
        const rarity = item.rarity || 'Common';
        const isMat  = !!upgradeMats.weapon_materials?.some(race => race.materials.some(m => m.id === itemId));
        if (isMat) speedBuff += (artifactBufCfg.material[rarity] || 0);
        else       luckBuff  += (artifactBufCfg.book[rarity]     || 0);
    }
    return { speedBuff, luckBuff };
}

/* ─────────────────── حساب مدة الرحلة بعد الترقيات ─────────────────── */
function calcDuration(destConfig, stats, equippedBuffs) {
    const speedRank  = Number(stats.speed_rank || 1);
    const speedCfg   = caravanConfig.upgrades.speed;
    const reduction  = Math.min((speedRank - 1) * speedCfg.time_reduction + equippedBuffs.speedBuff, 0.70);
    const baseMs     = destConfig.duration_hours * 3600 * 1000;
    return Math.floor(baseMs * (1 - reduction));
}

/* ─────────────────── حساب نسبة الخطر بعد الترقيات ─────────────────── */
function calcRiskFactor(destConfig, stats) {
    const defRank   = Number(stats.defense_rank || 1);
    const defCfg    = caravanConfig.upgrades.defense;
    const reduction = (defRank - 1) * defCfg.risk_reduction;
    return Math.max(destConfig.risk_factor - reduction, 0.03);
}

/* ─────────────────── حساب مضاعف المكافآت النهائية ─────────────────── */
function calcRewardMultiplier(stats, equippedBuffs) {
    const capRank  = Number(stats.capacity_rank || 1);
    const luckRank = Number(stats.luck_rank     || 1);
    const capCfg   = caravanConfig.upgrades.capacity;
    const luckCfg  = caravanConfig.upgrades.luck;
    return 1
        + (capRank  - 1) * capCfg.bonus_per_level
        + (luckRank - 1) * luckCfg.bonus_per_level
        + equippedBuffs.luckBuff;
}

/* ─────────────────── إرسال القافلة ─────────────────── */
async function sendCaravan(db, userId, guildId, destId, equippedArtifacts = []) {
    const dest  = caravanConfig.destinations.find(d => d.id === destId);
    if (!dest) return { error: 'وجهة غير موجودة.' };

    const stats        = await getUserCaravanStats(db, userId, guildId);
    const buffs        = getEquippedBuffs(equippedArtifacts);
    const durationMs   = calcDuration(dest, stats, buffs);
    const riskFactor   = calcRiskFactor(dest, stats);
    const now          = Date.now();
    const startTime    = now;
    const endTime      = now + durationMs;

    // هل سيحدث هجوم؟ نحدده مسبقاً
    const willBeAttacked = Math.random() < riskFactor;
    let attackScheduledAt = 0;
    if (willBeAttacked) {
        const attackOffset = durationMs * (0.35 + Math.random() * 0.30);
        attackScheduledAt  = Math.floor(startTime + attackOffset);
    }

    await safeExecute(db, `
        INSERT INTO user_caravans
            ("userID","guildID","destinationId","startTime","endTime","status",
             "equippedArtifacts","attackScheduledAt","attackResolved","rewardMultiplier")
        VALUES ($1,$2,$3,$4,$5,'traveling',$6,$7,0,1.0)
        ON CONFLICT ("userID","guildID") DO UPDATE SET
            "destinationId"=$3,"startTime"=$4,"endTime"=$5,"status"='traveling',
            "equippedArtifacts"=$6,"attackScheduledAt"=$7,"attackResolved"=0,
            "guardMessageId"=NULL,"attackChannelId"=NULL,"rewardMultiplier"=1.0`,
        [userId, guildId, destId, startTime, endTime,
         JSON.stringify(equippedArtifacts), attackScheduledAt]);

    // قفل الأدوات المجهزة (تخزين مؤقت في جدول القافلة كافي)
    return { ok: true, dest, durationMs, endTime, riskFactor, willBeAttacked };
}

/* ─────────────────── توزيع المكافآت ─────────────────── */
async function distributeRewards(client, db, caravan) {
    const userId  = caravan.userid  || caravan.userID;
    const guildId = caravan.guildid || caravan.guildID;
    const destId  = caravan.destinationid || caravan.destinationId;
    const dest    = caravanConfig.destinations.find(d => d.id === destId);
    if (!dest) return;

    const stats        = await getUserCaravanStats(db, userId, guildId);
    const artifacts    = JSON.parse(caravan.equippedartifacts || caravan.equippedArtifacts || '[]');
    const buffs        = getEquippedBuffs(artifacts);
    const baseMulti    = calcRewardMultiplier(stats, buffs);
    const attackMulti  = Number(caravan.rewardmultiplier ?? caravan.rewardMultiplier ?? 1.0);
    const finalMulti   = baseMulti * attackMulti;

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
            // البذور
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
            // الحيوانات
            if (Math.random() < (dest.reward_animal_chance || 0.30)) {
                const animal = farmAnimals[Math.floor(Math.random() * farmAnimals.length)];
                if (animal) {
                    const { getUsedCapacity, getPlayerCapacity } = require('../utils/farmUtils.js');
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
                }
            }
        }
    } catch (e) {
        console.error('[Caravan distributeRewards]', e);
    }

    // تحديث الإحصائيات
    await safeExecute(db,
        `UPDATE user_caravan_stats SET "total_trips"="total_trips"+1, "successful_trips"="successful_trips"+$3
         WHERE "userID"=$1 AND "guildID"=$2`,
        [userId, guildId, attackMulti >= 0.5 ? 1 : 0]);

    // حذف سجل القافلة
    await safeExecute(db,
        `DELETE FROM user_caravans WHERE "userID"=$1 AND "guildID"=$2`,
        [userId, guildId]);

    return summary;
}

/* ─────────────────── إرسال إشعار الهجوم ─────────────────── */
async function sendAttackNotification(client, db, caravan) {
    const userId  = caravan.userid  || caravan.userID;
    const guildId = caravan.guildid || caravan.guildID;
    const caravanId = caravan.id;
    const destId  = caravan.destinationid || caravan.destinationId;
    const dest    = caravanConfig.destinations.find(d => d.id === destId);
    if (!dest) return;

    const settingsRes = await safeQuery(db,
        `SELECT "casinoChannelID" FROM settings WHERE "guild"=$1`, [guildId]);
    const casinoId = settingsRes.rows[0]?.casinochannelid
                  || settingsRes.rows[0]?.casinoChannelID;
    if (!casinoId) return;

    const guild   = client.guilds.cache.get(guildId);
    const channel = guild?.channels.cache.get(casinoId);
    if (!channel) return;

    // تكلفة الحراسة: 10% من متوسط المكافأة المتوقعة
    let guardCost = 200;
    if (dest.reward_type === 'mora')
        guardCost = Math.floor(((dest.reward_min + dest.reward_max) / 2) * caravanConfig.attack.guard_cost_percent);

    const embed = new EmbedBuilder()
        .setColor('#FF4444')
        .setTitle('⚔️ تحذير — قافلتك تتعرض للهجوم!')
        .setDescription(
            `<@${userId}>\n\n` +
            `🗺️ **الوجهة:** ${dest.emoji} ${dest.name}\n` +
            `⚠️ قطاع الطرق يحاصرون قافلتك الآن!\n\n` +
            `💂 **إرسال حراسة** يكلف **${guardCost.toLocaleString()}** ${EMOJI_MORA}\n` +
            `✅ نسبة النجاح: **${(caravanConfig.attack.guard_success_rate * 100).toFixed(0)}%**\n` +
            `⏳ لديك **30 دقيقة** للرد — وإلا ستخسر جزءاً كبيراً من البضاعة!`
        )
        .setFooter({ text: 'نظام القوافل' })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`caravan_guards_${caravanId}`)
            .setLabel(`إرسال الحراسة (${guardCost.toLocaleString()} مورا)`)
            .setStyle(ButtonStyle.Danger)
            .setEmoji('💂')
    );

    let attackMsg;
    try {
        attackMsg = await channel.send({ content: `<@${userId}>`, embeds: [embed], components: [row] });
    } catch { return; }

    // تحديث DB
    await safeExecute(db,
        `UPDATE user_caravans SET "guardMessageId"=$1,"attackChannelId"=$2 WHERE "id"=$3`,
        [attackMsg.id, casinoId, caravanId]);

    // Collector: ينتهي بعد 30 دقيقة أو عند الضغط
    const collector = attackMsg.createMessageComponentCollector({
        filter: i => i.customId === `caravan_guards_${caravanId}` && i.user.id === userId,
        time:   caravanConfig.attack.guard_timeout_ms,
        max:    1,
    });

    if (!client.caravanAttackCollectors) client.caravanAttackCollectors = new Map();
    client.caravanAttackCollectors.set(String(caravanId), collector);

    collector.on('collect', async interaction => {
        await interaction.deferUpdate().catch(() => {});
        const userData = await safeQuery(db,
            `SELECT "mora" FROM levels WHERE "user"=$1 AND "guild"=$2`, [userId, guildId]);
        const mora = Number(userData.rows[0]?.mora || 0);

        if (mora < guardCost) {
            await interaction.followUp({
                content: `❌ <@${userId}> ليس لديك ما يكفي من المورا لإرسال الحراسة! خسرت نصف البضاعة.`,
                ephemeral: true
            }).catch(() => {});
            await safeExecute(db,
                `UPDATE user_caravans SET "attackResolved"=2,"rewardMultiplier"=$1 WHERE "id"=$2`,
                [1 - caravanConfig.attack.guard_fail_loss, caravanId]);
        } else {
            await safeExecute(db,
                `UPDATE levels SET "mora"=CAST(COALESCE("mora",'0') AS BIGINT)-$1 WHERE "user"=$2 AND "guild"=$3`,
                [guardCost, userId, guildId]);
            const success = Math.random() < caravanConfig.attack.guard_success_rate;
            if (success) {
                await safeExecute(db,
                    `UPDATE user_caravans SET "attackResolved"=1,"rewardMultiplier"=$1 WHERE "id"=$2`,
                    [1 - caravanConfig.attack.guard_success_loss, caravanId]);
                await attackMsg.edit({
                    content: `✅ <@${userId}> نجحت الحراسة في صد الهجوم! خسارة طفيفة فقط.`,
                    embeds: [], components: []
                }).catch(() => {});
            } else {
                await safeExecute(db,
                    `UPDATE user_caravans SET "attackResolved"=2,"rewardMultiplier"=$1 WHERE "id"=$2`,
                    [1 - caravanConfig.attack.guard_fail_loss, caravanId]);
                await attackMsg.edit({
                    content: `😔 <@${userId}> الحراسة فشلت في الدفاع! خسرت نصف البضاعة.`,
                    embeds: [], components: []
                }).catch(() => {});
            }
        }
        collector.stop('user');
    });

    collector.on('end', async (collected, reason) => {
        client.caravanAttackCollectors?.delete(String(caravanId));
        if (reason === 'user') return;
        // انتهت المهلة بدون رد → تطبيق العقوبة عبر processCaravanReturns
        const lossMin = caravanConfig.attack.ignored_loss_min;
        const lossMax = caravanConfig.attack.ignored_loss_max;
        const loss    = lossMin + Math.random() * (lossMax - lossMin);
        await safeExecute(db,
            `UPDATE user_caravans SET "attackResolved"=-1,"rewardMultiplier"=$1 WHERE "id"=$2 AND "attackResolved"=0`,
            [Math.max(0, 1 - loss), caravanId]);
        await attackMsg.edit({
            content: `💀 <@${userId}> لم ترسل حراسة! القطاع نهبوا بضاعتك بالكامل تقريباً.`,
            embeds: [], components: []
        }).catch(() => {});
    });
}

/* ─────────────────── الفاحص التلقائي الدوري ─────────────────── */
const pendingAttacks = new Set();

async function processCaravanReturns(client, db) {
    try {
        await initCaravanTables(db);
        const now = Date.now();

        const active = await safeQuery(db,
            `SELECT * FROM user_caravans WHERE "status"='traveling'`, []);

        for (const caravan of active.rows) {
            const caravanId       = caravan.id;
            const attackAt        = Number(caravan.attackscheduledat || caravan.attackScheduledAt || 0);
            const endTime         = Number(caravan.endtime           || caravan.endTime           || 0);
            const attackResolved  = Number(caravan.attackresolved    || caravan.attackResolved    || 0);
            const guardMsgId      = caravan.guardmessageid           || caravan.guardMessageId;
            const userId          = caravan.userid                   || caravan.userID;
            const guildId         = caravan.guildid                  || caravan.guildID;

            // A. إرسال إشعار الهجوم إذا حان وقته
            if (attackAt > 0 && now >= attackAt && attackResolved === 0 && !guardMsgId) {
                if (!pendingAttacks.has(caravanId)) {
                    pendingAttacks.add(caravanId);
                    sendAttackNotification(client, db, caravan)
                        .finally(() => pendingAttacks.delete(caravanId));
                }
                continue;
            }

            // B. انتهاء الرحلة (بعد حل الهجوم أو بدون هجوم)
            if (now >= endTime && attackResolved !== 0 || (now >= endTime && attackAt === 0)) {
                const summary = await distributeRewards(client, db, caravan);
                // إشعار في قناة الكازينو
                try {
                    const settingsRes = await safeQuery(db,
                        `SELECT "casinoChannelID" FROM settings WHERE "guild"=$1`, [guildId]);
                    const casinoId = settingsRes.rows[0]?.casinochannelid
                                  || settingsRes.rows[0]?.casinoChannelID;
                    const guild   = client.guilds.cache.get(guildId);
                    const channel = guild?.channels.cache.get(casinoId);
                    if (channel && summary?.length) {
                        const destId = caravan.destinationid || caravan.destinationId;
                        const dest   = caravanConfig.destinations.find(d => d.id === destId);
                        await channel.send({
                            content: `<@${userId}>`,
                            embeds: [new EmbedBuilder()
                                .setColor(dest?.color || '#00FF88')
                                .setTitle(`✅ عادت قافلتك من ${dest?.emoji || ''} ${dest?.name || ''}!`)
                                .setDescription(`**المكافآت:**\n${summary.map(s => `✶ ${s}`).join('\n')}`)
                                .setTimestamp()]
                        }).catch(() => {});
                    }
                } catch {}
            }
        }
    } catch (e) {
        console.error('[processCaravanReturns]', e);
    }
}

/* ─────────────────── ترقية القافلة ─────────────────── */
async function upgradeCaravan(db, userId, guildId, upgradeType) {
    const upgCfg = caravanConfig.upgrades[upgradeType];
    if (!upgCfg) return { error: 'نوع الترقية غير صالح.' };

    const stats   = await getUserCaravanStats(db, userId, guildId);
    const rankKey = `${upgradeType}_rank`;
    const current = Number(stats[rankKey] || stats[rankKey.toLowerCase()] || 1);

    if (current >= upgCfg.max_level) return { error: `وصلت للمستوى الأقصى (${upgCfg.max_level})!` };

    const cost = upgCfg.costs[current]; // current هو المستوى الحالي = index التكلفة التالي
    const userData = await safeQuery(db,
        `SELECT "mora" FROM levels WHERE "user"=$1 AND "guild"=$2`, [userId, guildId]);
    const mora = Number(userData.rows[0]?.mora || 0);

    if (mora < cost) return { error: `تحتاج ${cost.toLocaleString()} ${EMOJI_MORA} للترقية. رصيدك: ${mora.toLocaleString()}` };

    await safeExecute(db,
        `UPDATE levels SET "mora"=CAST(COALESCE("mora",'0') AS BIGINT)-$1 WHERE "user"=$2 AND "guild"=$3`,
        [cost, userId, guildId]);

    await safeExecute(db,
        `UPDATE user_caravan_stats SET "${rankKey}"="${rankKey}"+1 WHERE "userID"=$1 AND "guildID"=$2`,
        [userId, guildId]);

    return { ok: true, newLevel: current + 1, cost, upgCfg };
}

/* ─────────────────── بدء الفحص التلقائي (تُستدعى مرة واحدة) ─────────────────── */
let _checkerStarted = false;
function setupCaravanChecker(client, db) {
    if (_checkerStarted) return;
    _checkerStarted = true;
    setInterval(() => processCaravanReturns(client, db), 5 * 60 * 1000);
    processCaravanReturns(client, db);
}

module.exports = {
    caravanConfig,
    initCaravanTables,
    getUserCaravanStats,
    getActiveCaravan,
    getEquippedBuffs,
    calcDuration,
    calcRiskFactor,
    calcRewardMultiplier,
    sendCaravan,
    distributeRewards,
    sendAttackNotification,
    processCaravanReturns,
    upgradeCaravan,
    setupCaravanChecker,
    safeQuery,
    safeExecute,
    EMOJI_MORA,
};
