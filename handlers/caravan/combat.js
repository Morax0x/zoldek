'use strict';

const {
    ComponentType, MessageFlags,
    EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');

const { safeExecute, safeQuery } = require('./db');
const { caravanConfig, EMOJI_MORA } = require('./config');
const { setCaravanCooldown } = require('./tables');
const { setupPlayers }       = require('../dungeon/core/setup.js');
const { buildHpBar, applyDamageToPlayer } = require('../dungeon/utils.js');
const { handleSkillUsage }   = require('../dungeon/skills.js');
const { executeWeaponAttack } = require('../combat/weapon-calculator.js');
const { buildSkillSelector, buildPotionSelector } = require('../dungeon/ui.js');

async function buildBattlePayload(players, enemy, caravan, waveNum, log, actedIds, hostId, guild) {
    return { files: [], embeds: [generateBattleEmbed(players, enemy, caravan, waveNum, log, actedIds)] };
}

async function buildRestPayload(players, caravan, waveNum, guild) {
    return { files: [], embeds: [generateRestEmbed(players, caravan, waveNum)] };
}

async function buildResultPayload(result, players, caravan, wavesCleared, rewards, guild) {
    return { files: [], embeds: [generateResultEmbed(result, players, caravan, wavesCleared, rewards, guild)] };
}

// ─── Constants ────────────────────────────────────────────────────────────────
const CARAVAN_HP_MAX   = 1000;
const TURN_TIMEOUT_MS  = 45_000;
const REST_TIMEOUT_MS  = 90_000;   // 90 s between waves; timeout = loss

const WAVE_ENEMIES = [
    { name: 'لصوص الطريق',        hp: 800,  atk: 30,  isBoss: false },
    { name: 'سراق محترفون',       hp: 1200, atk: 50,  isBoss: false },
    { name: 'محاربون متمردون',    hp: 1800, atk: 75,  isBoss: false },
    { name: 'قائد الغزاة',        hp: 2800, atk: 100, isBoss: false },
    { name: 'آسر القوافل',        hp: 5000, atk: 150, isBoss: true  },
];

// Delta reward per wave (cumulative for guards — owner gets nothing)
const WAVE_REWARD_DELTAS = [
    { mora: 500,  chests: 1,  rep: 0 },
    { mora: 1000, chests: 2,  rep: 0 },
    { mora: 1500, chests: 3,  rep: 0 },
    { mora: 0,    chests: 4,  rep: 0 },
    { mora: 5000, chests: 10, rep: 2 },
];

// ─── Player Death Safety ──────────────────────────────────────────────────────
// Catches any edge-case where HP hits 0/negative but isDead wasn't set
function ensureDeadMarked(players) {
    for (const p of players) {
        if (!p.isDead && p.hp <= 0) { p.hp = 0; p.isDead = true; }
    }
}

// ─── Enemy AI ─────────────────────────────────────────────────────────────────
// Tank Provoke (taunt/titan effect) → 100% hits that Tank
// Otherwise 30% caravan / 70% players
function selectEnemyTarget(enemy, players, caravan) {
    const alive = players.filter(p => !p.isDead);

    // Provoke / Taunt wins over everything
    const taunter = alive.find(p => p.effects.some(e => e.type === 'taunt' || e.type === 'titan'));
    if (taunter) return { type: 'player', target: taunter };

    // targetFocusId set by some skills/potions
    if (enemy.targetFocusId) {
        const forced = alive.find(p => p.id === enemy.targetFocusId);
        if (forced) return { type: 'player', target: forced };
        enemy.targetFocusId = null;
    }

    // 30 % → attack caravan
    if (caravan.hp > 0 && Math.random() < 0.30)
        return { type: 'caravan', target: caravan };

    if (!alive.length) return { type: 'caravan', target: caravan };

    // 70 % → highest-threat player (priests & near-death prioritised)
    const sorted = [...alive].sort((a, b) => {
        const score = p =>
            (p.class === 'Priest' ? 5 : 0) +
            (p.hp <= enemy.atk * 1.5 ? 10 : 0);
        return score(b) - score(a);
    });
    return { type: 'player', target: sorted[0] };
}

// ─── Enemy Turn ───────────────────────────────────────────────────────────────
async function processEnemyTurn(enemy, players, caravan, waveNum, log, thread) {
    if (enemy.hp <= 0) return;
    if (!enemy.effects) enemy.effects = [];

    // DoT ticks
    enemy.effects = enemy.effects.filter(e => {
        if (['burn', 'poison', 'bleed'].includes(e.type)) {
            const raw = e.val >= 1 ? e.val : Math.floor(enemy.maxHp * e.val);
            const dmg = Math.floor(raw);
            if (dmg > 0) {
                enemy.hp = Math.max(0, enemy.hp - dmg);
                const icon = e.type === 'burn' ? '🔥' : e.type === 'poison' ? '☠️' : '🩸';
                log.push(`${icon} **${enemy.name}** تأثر (-${dmg})`);
            }
        }
        if (e.turns !== undefined) { e.turns--; return e.turns > 0; }
        return false;
    });
    if (enemy.hp <= 0) return;

    // Stun / freeze
    if (enemy.frozen || enemy.effects.some(e => e.type === 'stun')) {
        log.push(`😵 **${enemy.name}** مشلول، خسر دوره!`);
        enemy.frozen = false;
        return;
    }

    // Summon pet attacks
    for (const p of players) {
        if (!p.isDead && p.summon?.active) {
            const petDmg = Math.floor(p.atk * (p.summon.atkRatio || 0.7));
            enemy.hp = Math.max(0, enemy.hp - petDmg);
            p.totalDamage = (p.totalDamage || 0) + petDmg;
            log.push(`🐺 **${p.summon.name}** هاجم (-${petDmg})`);
            p.summon.turns--;
            if (p.summon.turns <= 0) {
                const exDmg = Math.floor(p.atk * (p.summon.explodeRatio || 1.2));
                enemy.hp = Math.max(0, enemy.hp - exDmg);
                p.totalDamage += exDmg;
                log.push(`💥 **${p.summon.name}** انفجر (-${exDmg})`);
                p.summon = null;
            }
        }
    }
    if (enemy.hp <= 0) return;

    // Boss enrages at ≤ 30 % HP
    if (enemy.isBoss && !enemy.enraged && enemy.hp < enemy.maxHp * 0.30) {
        enemy.enraged = true;
        enemy.atk     = Math.floor(enemy.atk * 1.5);
        log.push(`💢 **${enemy.name}** اشتعل غضباً! (+50% هجوم)`);
    }

    // Mechanic 4: Sacrifice — owner burned 15% loot to skip this turn
    if (caravan.skipNextEnemyTurn) {
        caravan.skipNextEnemyTurn = false;
        log.push(`🥩 العدو أُشغل بالبضاعة — أضاع دوره!`);
        return;
    }

    const sel = selectEnemyTarget(enemy, players, caravan);
    const dmg = Math.floor(enemy.atk * (1 + waveNum * 0.03));

    if (sel.type === 'caravan') {
        // Mechanic 3: Boss/enemy can crit the caravan (20% chance)
        const isCritHit = Math.random() < 0.20;
        const finalDmg  = isCritHit ? Math.floor(dmg * 1.5) : dmg;
        caravan.hp = Math.max(0, caravan.hp - finalDmg);
        if (isCritHit) {
            log.push(`💥 **${enemy.name}** ضرب القافلة بضربة حاسمة! (-${finalDmg} HP) 📦 بضاعة تساقطت!`);
            caravan.pendingLootDrop = true;   // flag picked up in battle loop
        } else {
            log.push(`🐪 **${enemy.name}** ضرب القافلة! (-${finalDmg} HP)`);
        }
    } else {
        const t = sel.target;
        if (t && !t.isDead) {
            const finalDmg = t.defending ? Math.floor(dmg * 0.5) : dmg;
            const hpBefore = t.hp;
            const taken    = applyDamageToPlayer(t, finalDmg);
            // Force death — no 1 HP protection in caravan combat
            if (hpBefore - taken <= 0) { t.hp = 0; t.isDead = true; }
            log.push(`⚔️ **${enemy.name}** ضرب **${t.name}** (-${taken})`);
            if (t.isDead) {
                log.push(`💀 **${t.name}** سقط!`);
                // Priest death aura
                if (t.class === 'Priest') {
                    players.forEach(a => {
                        if (!a.isDead) a.hp = Math.min(a.maxHp, a.hp + Math.floor(a.maxHp * 0.20));
                    });
                    if (thread) thread.send('✨ **سقط الكاهن — عالج الفريق (+20% HP)**').catch(() => {});
                }
            }
        }
    }

    enemy.targetFocusId = null;
}

// ─── Battle UI ────────────────────────────────────────────────────────────────
const CLASS_LABELS = {
    Leader: '👑 قائد', Tank: '🛡️ طليعة',
    Priest: '✨ كاهن', Mage: '🔮 ساحر', Summoner: '🐺 مستدعٍ',
};

function generateBattleEmbed(players, enemy, caravan, waveNum, log, actedPlayers = []) {
    const embed = new EmbedBuilder()
        .setColor('#FF6600')
        .setTitle(`⚔️ كمين القافلة | الموجة ${waveNum}/5`);

    embed.addFields({
        name:   `👹 **${enemy.name}**`,
        value:  `${buildHpBar(enemy.hp, enemy.maxHp)} \`[${enemy.hp}/${enemy.maxHp}]\``,
        inline: false,
    });
    embed.addFields({
        name:   '🐪 **صحة القافلة**',
        value:  `${buildHpBar(caravan.hp, caravan.maxHp)} \`[${caravan.hp}/${caravan.maxHp}]\``,
        inline: false,
    });

    const teamLines = players.map(p => {
        const acted  = actedPlayers.includes(p.id);
        const circle = p.isDead ? '💀' : (acted ? '🔴' : '🟢');
        const name   = (p.isDead || acted) ? `**${p.name}**` : `<@${p.id}>`;
        const hpBar  = p.isDead ? 'سقط' : buildHpBar(p.hp, p.maxHp, p.shield);
        return `${circle} ${name} [${CLASS_LABELS[p.class] || p.class}]\n${hpBar}`;
    }).join('\n\n');
    embed.addFields({ name: '🛡️ فريق الحراسة', value: teamLines || '—', inline: false });

    const logText = log.slice(-6).join('\n') || 'بانتظار بدء المعركة...';
    embed.addFields({ name: '📜 أحداث المعركة', value: logText, inline: false });
    return embed;
}

// hostId passed to show the [Sacrifice] button only for the owner row
function makeBattleRows(disabled = false, hostId = null, currentPlayerId = null) {
    const rows = [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('cvb_atk').setLabel('هجوم').setEmoji('⚔️').setStyle(ButtonStyle.Danger).setDisabled(disabled),
            new ButtonBuilder().setCustomId('cvb_skill').setLabel('مهارة').setEmoji('✨').setStyle(ButtonStyle.Primary).setDisabled(disabled),
            new ButtonBuilder().setCustomId('cvb_repair').setLabel('إصلاح').setEmoji('🧰').setStyle(ButtonStyle.Secondary).setDisabled(disabled)
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('cvb_def').setLabel('دفاع').setEmoji('🛡️').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
            new ButtonBuilder().setCustomId('cvb_heal').setLabel('جرعة').setEmoji('🧪').setStyle(ButtonStyle.Success).setDisabled(disabled),
            new ButtonBuilder().setCustomId('cvb_sacrifice').setLabel('رمي بضاعة').setEmoji('🥩').setStyle(ButtonStyle.Danger).setDisabled(disabled)
        ),
    ];
    return rows;
}

function generateRestEmbed(players, caravan, waveNum) {
    const teamLines = players.map(p => {
        const hpBar = p.isDead ? '💀 سقط' : buildHpBar(p.hp, p.maxHp, p.shield);
        return `**${p.name}** [${CLASS_LABELS[p.class] || p.class}]\n${hpBar}`;
    }).join('\n\n');

    return new EmbedBuilder()
        .setColor('#4CAF50')
        .setTitle(`☕ استراحة — الموجة ${waveNum}/5 منتهية!`)
        .setDescription(
            `**الموجة القادمة ستبدأ عند الضغط على "استمرار"**\n` +
            `⚠️ لو انتهى الوقت قبل الضغط ستُعتبر القافلة مفقودة!\n`
        )
        .addFields(
            { name: '🐪 صحة القافلة', value: `${buildHpBar(caravan.hp, caravan.maxHp)} \`[${caravan.hp}/${caravan.maxHp}]\``, inline: false },
            { name: '🛡️ حالة الفريق', value: teamLines || '—', inline: false }
        );
}

function generateResultEmbed(result, players, caravan, wavesCleared, rewards, guild) {
    const isWin = result === 'win' || result === 'escape';
    const isEscape = result === 'escape';
    const color = isWin ? '#00FF88' : '#FF4444';
    const title = isWin
        ? (isEscape ? '🐪 استكمال الرحلة — نجاة بصعوبة' : '🎉 انتصار! الطريق آمن!')
        : '💀 فشل الحراسة — القافلة نُهبت!';

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(title);

    const alive = players.filter(p => !p.isDead);
    const dead = players.filter(p => p.isDead);

    let teamStatus = players.map(p => {
        const icon = p.isDead ? '💀' : '✅';
        const dmg = p.totalDamage ? ` | ضرر: ${p.totalDamage}` : '';
        return `${icon} **${p.name}** [${CLASS_LABELS[p.class] || p.class}]${dmg}`;
    }).join('\n');
    embed.addFields({ name: '🛡️ حالة الفريق', value: teamStatus || '—', inline: false });

    embed.addFields({
        name: '🐪 صحة القافلة',
        value: `${buildHpBar(caravan.hp, caravan.maxHp)} \`[${caravan.hp}/${caravan.maxHp}]\``,
        inline: false,
    });

    if (isWin) {
        const rewardLines = (rewards?.summary || []).map(s => `✶ ${s}`).join('\n');
        const waveText = `✅ تم اجتياز ${wavesCleared} من 5 موجات`;
        embed.addFields({ name: '⚔️ الموجات', value: waveText, inline: false });
        if (rewardLines) embed.addFields({ name: '🎁 المكافآت', value: rewardLines, inline: false });
    } else {
        const reason = result === 'lose_caravan' ? '🐪 دُمِّرت القافلة!'
                     : result === 'lose_timeout' ? '⏰ انتهى وقت الاستراحة!'
                     : '☠️ سقط كل الحراس!';
        embed.addFields({ name: '❌ سبب الفشل', value: reason, inline: false });
    }

    return embed;
}

// isEscort=true shows the [استكمال الرحلة] escape button (pre-emptive escort only)
function makeRestRows(isEscort = false) {
    const btns = [
        new ButtonBuilder().setCustomId('cvr_continue').setLabel('استمرار').setEmoji('▶️').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('cvr_potion').setLabel('جرعة').setEmoji('🧪').setStyle(ButtonStyle.Secondary),
    ];
    if (isEscort) {
        btns.push(
            new ButtonBuilder().setCustomId('cvr_escape').setLabel('استكمال الرحلة').setEmoji('🐪').setStyle(ButtonStyle.Primary)
        );
    }
    return [new ActionRowBuilder().addComponents(...btns)];
}

// ─── Rest Phase ───────────────────────────────────────────────────────────────
// Returns 'continue' | 'timeout' | 'escape'
async function doRestPhase(thread, players, caravan, waveNum, hostId, db, guild, isEscort = false) {
    const restPayload = await buildRestPayload(players, caravan, waveNum, guild);
    const restMsg = await thread.send({ ...restPayload, components: makeRestRows(isEscort) }).catch(() => null);
    if (!restMsg) return 'timeout';

    const collector = restMsg.createMessageComponentCollector({
        filter: i => players.some(p => p.id === i.user.id && !p.isDead),
        time:   REST_TIMEOUT_MS,
    });

    const outcome = await new Promise(resolve => {
        collector.on('collect', async i => {
            try {
                if (i.customId === 'cvr_escape') {
                    if (i.user.id !== hostId)
                        return i.reply({ content: '⛔ القائد فقط يستطيع استكمال الرحلة.', flags: [MessageFlags.Ephemeral] });
                    await i.deferUpdate().catch(() => {});
                    collector.stop('escape');

                } else if (i.customId === 'cvr_continue') {
                    if (i.user.id !== hostId)
                        return i.reply({ content: '⛔ القائد فقط يستطيع المتابعة.', flags: [MessageFlags.Ephemeral] });
                    await i.deferUpdate().catch(() => {});
                    collector.stop('continue');

                } else if (i.customId === 'cvr_potion') {
                    const p = players.find(pl => pl.id === i.user.id);
                    if (!p) return i.deferUpdate().catch(() => {});
                    const potRow = await buildPotionSelector(p, db, guild.id).catch(() => null);
                    if (!potRow)
                        return i.reply({ content: '❌ لا توجد جرعات.', flags: [MessageFlags.Ephemeral] });

                    const pMsg = await i.reply({
                        content:    '🧪 اختر جرعة:',
                        components: [potRow],
                        flags:      [MessageFlags.Ephemeral],
                        fetchReply: true,
                    });
                    const pSel = await pMsg.awaitMessageComponent({
                        filter:        x => x.user.id === i.user.id,
                        time:          15000,
                        componentType: ComponentType.StringSelect,
                    }).catch(() => null);
                    if (!pSel) return;
                    await pSel.deferUpdate().catch(() => {});

                    const potId = pSel.values[0].replace('use_potion_', '');
                    if (potId !== 'no_potions' && potId !== 'buy_potions_action') {
                        await safeExecute(db,
                            `UPDATE user_inventory SET "quantity"="quantity"-1 WHERE "userID"=$1 AND "guildID"=$2 AND "itemID"=$3 AND "quantity">0`,
                            [i.user.id, guild.id, potId]);
                        if (potId === 'potion_heal') {
                            p.hp = Math.min(p.maxHp, p.hp + Math.floor(p.maxHp * 0.5));
                            await pSel.editReply({ content: `✅ **${p.name}** استعاد 50% HP!`, components: [] }).catch(() => {});
                        } else if (potId === 'potion_time') {
                            p.special_cooldown = 0; p.skillCooldowns = {};
                            await pSel.editReply({ content: `✅ **${p.name}** أعاد شحن مهاراته!`, components: [] }).catch(() => {});
                        } else {
                            await pSel.editReply({ content: '✅ استُخدمت الجرعة.', components: [] }).catch(() => {});
                        }
                        // Refresh rest embed with updated HP
                        const updatedRestPayload = await buildRestPayload(players, caravan, waveNum, guild);
                        await restMsg.edit({ ...updatedRestPayload }).catch(() => {});
                    }
                }
            } catch (err) { console.error('[RestPhase]', err); }
        });
        collector.on('end', (_, r) => resolve(r === 'continue' ? 'continue' : r === 'escape' ? 'escape' : 'timeout'));
    });

    await restMsg.edit({ components: [] }).catch(() => {});
    return outcome;
}

// ─── Party Rewards (owner + guards all receive same cumulative rewards) ───────
// lootPenalty: 0.0–1.0 fraction lost (from Sacrifice + uncollected loot drops)
async function distributePartyRewards(db, party, guildId, wavesCleared, lootPenalty = 0) {
    const multiplier = Math.max(0, 1 - lootPenalty);
    let totalMora = 0, totalChests = 0, totalRep = 0;
    for (let w = 0; w < Math.min(wavesCleared, WAVE_REWARD_DELTAS.length); w++) {
        totalMora   += WAVE_REWARD_DELTAS[w].mora;
        totalChests += WAVE_REWARD_DELTAS[w].chests;
        totalRep    += WAVE_REWARD_DELTAS[w].rep;
    }
    totalMora   = Math.floor(totalMora   * multiplier);
    totalChests = Math.floor(totalChests * multiplier);

    const summary = [];
    for (const uid of party) {
        if (totalMora > 0)
            await safeExecute(db,
                `UPDATE levels SET "mora"=CAST(COALESCE("mora",'0') AS BIGINT)+$1 WHERE "user"=$2 AND "guild"=$3`,
                [totalMora, uid, guildId]);
        if (totalChests > 0)
            await safeExecute(db,
                `INSERT INTO user_inventory ("guildID","userID","itemID","quantity") VALUES ($1,$2,'gacha_chest',$3)
                 ON CONFLICT ("guildID","userID","itemID") DO UPDATE SET "quantity"=user_inventory.quantity+$3`,
                [guildId, uid, totalChests]);
        if (totalRep > 0)
            await safeExecute(db,
                `INSERT INTO user_reputation ("userID","guildID","rep_points") VALUES ($1,$2,$3)
                 ON CONFLICT ("userID","guildID") DO UPDATE SET "rep_points"=user_reputation.rep_points+$3`,
                [uid, guildId, totalRep]);

        const parts = [];
        if (totalMora   > 0) parts.push(`${totalMora.toLocaleString()} ${EMOJI_MORA}`);
        if (totalChests > 0) parts.push(`${totalChests} 🎁`);
        if (totalRep    > 0) parts.push(`${totalRep} 🌟`);
        summary.push(`<@${uid}>: ${parts.join(' | ')}`);
    }
    return { totalMora, totalChests, totalRep, summary };
}

// ─── Core 5-Wave Battle ───────────────────────────────────────────────────────
// result: 'win'|'escape'|'lose_players'|'lose_caravan'|'lose_timeout'|'error'
// isEscort=true → shows escape button in rest phases (pre-emptive escort only)
async function runCaravanBattle(thread, party, partyClasses, db, guild, hostId, isEscort = false) {
    const players = await setupPlayers(guild, party, partyClasses, db, null, null);
    if (!players.length) {
        await thread.send('❌ فشل في تحميل بيانات اللاعبين.').catch(() => {});
        return { result: 'error', wavesCleared: 0 };
    }

    // 👑 حساب قوة الفريق للموازنة الديناميكية (Dynamic Scaling) 👑
    let totalPlayerHP = 0;
    let totalPlayerATK = 0;
    players.forEach(p => {
        totalPlayerHP += (p.maxHp || 100);
        totalPlayerATK += (p.atk || 10);
    });
    const averageHP = Math.floor(totalPlayerHP / players.length);
    const averageATK = Math.floor(totalPlayerATK / players.length);

    // 👑 رفع صحة القافلة لتتحمل ضربات الأعداء وتناسب قوة الفريق (تمنع التدمير الفوري)
    const { getUserCaravanStats } = require('./stats');
    const cvOwnerStats   = await getUserCaravanStats(db, hostId, guild.id);
    const hpRank         = Number(cvOwnerStats.capacity_rank || 1);
    const hpPerLevel     = caravanConfig.upgrades.capacity.hp_per_level || 100;
    const baseHP         = caravanConfig.upgrades.capacity.base_hp || 500;
    const hpBonus        = baseHP + (hpRank - 1) * hpPerLevel;
    const dynamicCaravanHP = Math.max(CARAVAN_HP_MAX, Math.floor(totalPlayerHP * 0.8)) + hpBonus;

    const caravan = {
        hp: dynamicCaravanHP, maxHp: dynamicCaravanHP,
        lootPenalty: 0, skipNextEnemyTurn: false, pendingLootDrop: false,
    };
    
    let wavesCleared = 0;

    for (let w = 0; w < WAVE_ENEMIES.length; w++) {
        const def     = WAVE_ENEMIES[w];
        const waveNum = w + 1;
        
        // 👑 تطبيق الموازنة الذكية على الأعداء 👑
        const waveDifficulty = 1 + (w * 0.25); // الصعوبة تزيد مع كل موجة
        const roundsToSurvive = def.isBoss ? 10 : 5; // عدد الضربات الجماعية التقريبية المطلوبة لهزيمته
        const hitsToKillPlayer = def.isBoss ? 4 : 7; // عدد ضربات الخصم المطلوبة لقتل لاعب متوسط

        // حساب الدم والضرر بناءً على قوة الفريق
        let dynamicHP = Math.floor(totalPlayerATK * roundsToSurvive * waveDifficulty);
        let dynamicATK = Math.floor(averageHP / hitsToKillPlayer * waveDifficulty);

        // إضافة عامل المفاجأة (RNG ±15%)
        const rngHP = 0.85 + (Math.random() * 0.30);
        const rngATK = 0.85 + (Math.random() * 0.30);

        dynamicHP = Math.floor(dynamicHP * rngHP);
        dynamicATK = Math.floor(dynamicATK * rngATK);

        // ضمان أن الخصم لن يكون أضعف من القيمة الأساسية (لحماية اللعبة من اللاعبين الجدد جداً)
        dynamicHP = Math.max(def.hp, dynamicHP);
        dynamicATK = Math.max(def.atk, dynamicATK);

        const enemy   = {
            name: def.name, hp: dynamicHP, maxHp: dynamicHP,
            atk: dynamicATK, isBoss: def.isBoss,
            enraged: false, effects: [], frozen: false, targetFocusId: null,
        };

        // Per-wave player reset
        players.forEach(p => {
            if (p.isDead) return;
            p.defending = false;
            p.summon    = null;
            p.shield    = p.startingShield || 0;
            p.effects   = p.effects.filter(e =>
                ['poison','atk_buff','def_buff','burn','stun','taunt','titan','evasion','reflect','bleed'].includes(e.type)
            );
            for (const sid in (p.skillCooldowns || {})) if (p.skillCooldowns[sid] > 0) p.skillCooldowns[sid]--;
            if (p.special_cooldown > 0) p.special_cooldown--;
        });

        const log = [`⚔️ **الموجة ${waveNum}/5** — ظهر **${enemy.name}**! (HP: ${enemy.hp} | ATK: ${enemy.atk})`];

        let battleMsg;
        try {
            const initPayload = await buildBattlePayload(players, enemy, caravan, waveNum, log, [], hostId, guild);
            battleMsg = await thread.send({ ...initPayload, components: makeBattleRows() });
        } catch {
            await thread.send('❌ فشل إرسال رسالة المعركة. إلغاء...').catch(() => {});
            return { result: 'error', wavesCleared };
        }

        // ── Round loop for this wave ──────────────────────────────────────
        let waveWon = false;
        while (!waveWon) {
            const actedPlayers  = [];
            const processingSet = new Set();
            let   earlyEnd      = null;   // 'enemy_dead' | 'all_dead'

            const collector = battleMsg.createMessageComponentCollector({
                filter: i => {
                    const p = players.find(pl => pl.id === i.user.id);
                    return p && !p.isDead && party.includes(i.user.id);
                },
                time:   24 * 60 * 60 * 1000,
            });

            await new Promise(resolve => {
                const turnTimer = setTimeout(async () => {
                    const afk = players.filter(p => !p.isDead && !actedPlayers.includes(p.id));
                    for (const p of afk) {
                        p.skipCount = (p.skipCount || 0) + 1;
                        if (p.skipCount >= 5) {
                            p.hp = 0; p.isDead = true;
                            log.push(`☠️ **${p.name}** أُقصي بسبب الخمول!`);
                        } else {
                            actedPlayers.push(p.id);
                            log.push(`⏩ تخطي دور **${p.name}** (${p.skipCount}/5)`);
                        }
                    }
                    if (players.every(p => p.isDead)) earlyEnd = 'all_dead';
                    await battleMsg.edit({ ...(await buildBattlePayload(players, enemy, caravan, waveNum, log, actedPlayers, hostId, guild)), components: [] }).catch(() => {});
                    collector.stop('turn_end');
                }, TURN_TIMEOUT_MS);

                collector.on('collect', async i => {
                    const pid = i.user.id;
                    const p   = players.find(pl => pl.id === pid);
                    if (!p || p.isDead || actedPlayers.includes(pid) || processingSet.has(pid))
                        return i.deferUpdate().catch(() => {});
                    processingSet.add(pid);
                    await i.deferUpdate().catch(() => {});

                    try {
                        const cid = i.customId;

                        if (cid === 'cvb_atk') {
                            const inPanic = caravan.hp < caravan.maxHp * 0.30;
                            if (inPanic && pid !== hostId && Math.random() < 0.15) {
                                log.push(`😰 **${p.name}** ذعر وأخطأ ضربته! (وضع الذعر)`);
                                actedPlayers.push(pid); p.skipCount = 0;
                                processingSet.delete(pid);
                                await battleMsg.edit({ ...(await buildBattlePayload(players, enemy, caravan, waveNum, log, actedPlayers, hostId, guild)), components: makeBattleRows() }).catch(() => {});
                                if (actedPlayers.length >= players.filter(pl => !pl.isDead).length) { clearTimeout(turnTimer); collector.stop('turn_end'); }
                                return;
                            }
                            const res  = executeWeaponAttack(p, enemy, false);
                            let   dmgD = Math.max(0, res.damage || 0);
                            if (inPanic && pid !== hostId) {
                                const bonusDmg = Math.floor(dmgD * 0.20);
                                enemy.hp = Math.max(0, enemy.hp - bonusDmg);
                                dmgD += bonusDmg;
                            }
                            p.totalDamage = (p.totalDamage || 0) + dmgD;
                            const panicTag = (inPanic && pid !== hostId) ? ' 😰(ذعر+20%)' : '';
                            log.push((res.log || `⚔️ **${p.name}** هاجم (-${dmgD})`) + panicTag);
                            actedPlayers.push(pid); p.skipCount = 0;

                        } else if (cid === 'cvb_def') {
                            p.defending = true;
                            log.push(`🛡️ **${p.name}** يتخذ موقفاً دفاعياً!`);
                            actedPlayers.push(pid); p.skipCount = 0;

                        } else if (cid === 'cvb_skill') {
                            const skillRow = buildSkillSelector(p);
                            if (!skillRow) {
                                await i.followUp({ content: '❌ لا توجد مهارات.', flags: [MessageFlags.Ephemeral] }).catch(() => {});
                                processingSet.delete(pid); return;
                            }
                            const sMsg = await i.followUp({ content: '✨ اختر مهارة:', components: [skillRow], flags: [MessageFlags.Ephemeral] }).catch(() => null);
                            if (!sMsg) { processingSet.delete(pid); return; }
                            const sel = await sMsg.awaitMessageComponent({ filter: x => x.user.id === pid, time: 15000 }).catch(() => null);
                            if (!sel) { processingSet.delete(pid); return; }
                            await sel.deferUpdate().catch(() => {});

                            const skillId  = sel.values[0];
                            const skillObj = p.skills?.[skillId]
                                ? { ...p.skills[skillId] }
                                : { id: skillId, name: 'مهارة', effectValue: 0, level: 1 };

                            const hpBefore = enemy.hp;
                            const res = handleSkillUsage(p, { ...skillObj, id: skillId }, enemy, log, thread, players);
                            const dmgD = Math.max(0, hpBefore - enemy.hp);
                            if (dmgD > 0) p.totalDamage = (p.totalDamage || 0) + dmgD;
                            if (res?.error) {
                                await sel.followUp({ content: res.error, flags: [MessageFlags.Ephemeral] }).catch(() => {});
                                processingSet.delete(pid); return;
                            }
                            await sel.editReply({ content: `✅ ${res?.name || skillObj.name}`, components: [] }).catch(() => {});
                            actedPlayers.push(pid); p.skipCount = 0;

                        } else if (cid === 'cvb_heal') {
                            const potRow = await buildPotionSelector(p, db, guild.id).catch(() => null);
                            if (!potRow) {
                                await i.followUp({ content: '❌ لا توجد جرعات.', flags: [MessageFlags.Ephemeral] }).catch(() => {});
                                processingSet.delete(pid); return;
                            }
                            const pMsg = await i.followUp({ content: '🧪 اختر جرعة:', components: [potRow], flags: [MessageFlags.Ephemeral] }).catch(() => null);
                            if (!pMsg) { processingSet.delete(pid); return; }
                            const pSel = await pMsg.awaitMessageComponent({ filter: x => x.user.id === pid, time: 15000 }).catch(() => null);
                            if (!pSel) { processingSet.delete(pid); return; }
                            await pSel.deferUpdate().catch(() => {});

                            const potId = pSel.values[0].replace('use_potion_', '');
                            if (potId !== 'no_potions' && potId !== 'buy_potions_action') {
                                await safeExecute(db,
                                    `UPDATE user_inventory SET "quantity"="quantity"-1 WHERE "userID"=$1 AND "guildID"=$2 AND "itemID"=$3 AND "quantity">0`,
                                    [pid, guild.id, potId]);
                                if (potId === 'potion_heal') {
                                    p.hp = Math.min(p.maxHp, p.hp + Math.floor(p.maxHp * 0.5));
                                    log.push(`🧪 **${p.name}** شرب جرعة (+50% HP)`);
                                } else if (potId === 'potion_time') {
                                    p.special_cooldown = 0; p.skillCooldowns = {};
                                    log.push(`⏳ **${p.name}** أعاد شحن مهاراته!`);
                                } else if (potId === 'potion_titan') {
                                    p.maxHp *= 2; p.hp = p.maxHp;
                                    p.effects.push({ type: 'titan', floors: 5 });
                                    enemy.targetFocusId = p.id;
                                    log.push(`🔥 **${p.name}** تحول لعملاق!`);
                                }
                            }
                            await pSel.editReply({ content: '✅ تم', components: [] }).catch(() => {});
                            actedPlayers.push(pid); p.skipCount = 0;

                        // ── Mechanic 1: Repair ────────────────────────────────
                        } else if (cid === 'cvb_repair') {
                            if (pid === hostId) {
                                // Owner: sacrifices 25% of own HP to heal caravan
                                const sacrifice = Math.floor(p.hp * 0.25);
                                if (sacrifice < 1) {
                                    await i.followUp({ content: '❌ صحتك منخفضة جداً للتضحية!', flags: [MessageFlags.Ephemeral] }).catch(() => {});
                                    processingSet.delete(pid); return;
                                }
                                p.hp = Math.max(0, p.hp - sacrifice);
                                caravan.hp = Math.min(caravan.maxHp, caravan.hp + sacrifice);
                                log.push(`💉 **${p.name}** ضحّى بـ${sacrifice} HP لإصلاح القافلة (+${sacrifice} 🐪)`);
                            } else {
                                // Guard: skip turn, repair +300 caravan HP
                                const repair = 300;
                                caravan.hp = Math.min(caravan.maxHp, caravan.hp + repair);
                                log.push(`🧰 **${p.name}** أصلح القافلة (+${repair} HP 🐪)`);
                            }
                            actedPlayers.push(pid); p.skipCount = 0;

                        // ── Mechanic 4: Sacrifice (owner only) ────────────────
                        } else if (cid === 'cvb_sacrifice') {
                            if (pid !== hostId) {
                                await i.followUp({ content: '⛔ هذا الزر للمالك فقط.', flags: [MessageFlags.Ephemeral] }).catch(() => {});
                                processingSet.delete(pid); return;
                            }
                            caravan.lootPenalty = Math.min(1, (caravan.lootPenalty || 0) + 0.15);
                            caravan.skipNextEnemyTurn = true;
                            log.push(`🥩 **${p.name}** رمى البضاعة — العدو مشتت! (دوره القادم يُهدر | -15% مكافآت)`);
                            actedPlayers.push(pid); p.skipCount = 0;
                        }

                        // Ensure any 0-HP player is marked dead
                        ensureDeadMarked(players);

                        // Immediate win check — update embed before stopping
                        if (enemy.hp <= 0) {
                            enemy.hp  = 0;
                            earlyEnd  = 'enemy_dead';
                            const winPayload = await buildBattlePayload(players, enemy, caravan, waveNum, log, actedPlayers, hostId, guild);
                            await battleMsg.edit({ ...winPayload, content: `✅ **سقط ${enemy.name}!**`, components: [] }).catch(() => {});
                            clearTimeout(turnTimer);
                            collector.stop('enemy_dead');
                            return;
                        }
                        if (players.every(p2 => p2.isDead)) {
                            earlyEnd = 'all_dead';
                            await battleMsg.edit({ content: '☠️ **سقط الفريق بالكامل!**', components: [] }).catch(() => {});
                            clearTimeout(turnTimer);
                            collector.stop('all_dead');
                            return;
                        }

                        await battleMsg.edit({
                            ...(await buildBattlePayload(players, enemy, caravan, waveNum, log, actedPlayers, hostId, guild)),
                            components: makeBattleRows(),
                        }).catch(() => {});

                        if (actedPlayers.length >= players.filter(pl => !pl.isDead).length) {
                            clearTimeout(turnTimer);
                            collector.stop('turn_end');
                        }
                    } catch (err) {
                        console.error('[CVBattle player]', err);
                    } finally {
                        processingSet.delete(pid);
                    }
                });

                collector.on('end', () => { clearTimeout(turnTimer); resolve(); });
            });

            // ── Post-player-turn checks ───────────────────────────────────
            if (earlyEnd === 'all_dead' || players.every(p => p.isDead)) {
                return { result: 'lose_players', wavesCleared };
            }

            if (earlyEnd === 'enemy_dead' || enemy.hp <= 0) {
                waveWon = true;
                break;
            }

            // ── Enemy turn — buttons stay visible but disabled ────────────
            await battleMsg.edit({ components: makeBattleRows(true) }).catch(() => {});

            // ── Enemy turn ────────────────────────────────────────────────
            await processEnemyTurn(enemy, players, caravan, waveNum, log, thread);
            ensureDeadMarked(players);

            // ── Mechanic 3: Loot Drop — deduct from staging, then pickup window ──
            if (caravan.pendingLootDrop) {
                caravan.pendingLootDrop = false;

                // Deduct real items from owner's staging area
                const { stagingLootItems } = require('./market/market-db');
                const looted = await stagingLootItems(db, hostId, guild.id, 0.10);
                if (looted.length > 0) {
                    log.push(`💀 سُرقت ${looted.length} بضاعة من سلّة التاجر!`);
                }

                const lootMsg = await thread.send({
                    content: looted.length > 0
                        ? `📦 **سقطت ${looted.length} بضاعة من القافلة!** أول حارس يضغط ينقذها (15 ثانية).`
                        : '📦 **بضاعة تساقطت من القافلة!** أول حارس يضغط ينقذها (15 ثانية).',
                    components: [new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('cvb_loot').setLabel('التقاط البضاعة').setEmoji('📦').setStyle(ButtonStyle.Success)
                    )],
                }).catch(() => null);

                if (lootMsg) {
                    const lootCollector = lootMsg.createMessageComponentCollector({
                        filter: i => {
                            const p = players.find(pl => pl.id === i.user.id);
                            return p && !p.isDead && party.includes(i.user.id);
                        },
                        time: 15000, max: 1,
                    });
                    await new Promise(res => {
                        lootCollector.on('collect', async li => {
                            await li.deferUpdate().catch(() => {});
                            const savior = players.find(pl => pl.id === li.user.id);
                            if (savior) {
                                log.push(`📦 **${savior.name}** التقط البضاعة وأنقذها!`);
                            }
                            lootCollector.stop('saved');
                        });
                        lootCollector.on('end', async (_, r) => {
                            if (r !== 'saved') {
                                caravan.lootPenalty = Math.min(1, (caravan.lootPenalty || 0) + 0.10);
                                log.push(`❌ لم يلتقط أحد البضاعة! (-10% مكافآت المالك)`);
                            }
                            await lootMsg.edit({ components: [] }).catch(() => {});
                            res();
                        });
                    });
                }
            }

            // Refresh board with buttons re-enabled for next round
            await battleMsg.edit({
                ...(await buildBattlePayload(players, enemy, caravan, waveNum, log, [], hostId, guild)),
                components: makeBattleRows(),
            }).catch(() => {});

            // Post-enemy loss checks
            if (caravan.hp <= 0) {
                await battleMsg.edit({ content: '🐪 **دُمِّرت القافلة!**', components: [] }).catch(() => {});
                return { result: 'lose_caravan', wavesCleared };
            }
            if (players.every(p => p.isDead)) {
                await battleMsg.edit({ content: '☠️ **سقط الفريق!**', components: [] }).catch(() => {});
                return { result: 'lose_players', wavesCleared };
            }
            if (enemy.hp <= 0) {
                waveWon = true;
                await battleMsg.edit({ content: `✅ **سقط ${enemy.name}!**`, components: [] }).catch(() => {});
                break;
            }
        } // end round loop

        wavesCleared = waveNum;

        // ── Rest Phase (between waves, not after last) ────────────────────
        if (waveNum < WAVE_ENEMIES.length) {
            const restResult = await doRestPhase(thread, players, caravan, waveNum, hostId, db, guild, isEscort);
            if (restResult === 'escape') {
                await thread.send('🐪 **القائد قرر استكمال الرحلة — المعركة توقفت والقافلة واصلة!**').catch(() => {});
                return { result: 'escape', wavesCleared };
            }
            if (restResult === 'timeout') {
                await thread.send('⏰ **انتهى وقت الاستراحة! القافلة دُمِّرت.**').catch(() => {});
                return { result: 'lose_timeout', wavesCleared };
            }
        }
    } // end wave loop

    return { result: 'win', wavesCleared, lootPenalty: caravan.lootPenalty || 0 };
}

// ─── Escort Event Handler ─────────────────────────────────────────────────────
// Fires after caravan-lobby emits 'caravan_escort_ready'
async function handleEscortReady(data) {
    const { thread, party, partyClasses, guild, dest, destId, hostId, channel, hubMsg, db, getMora, showHub } = data;
    const guards = party.filter(id => id !== hostId);

    const { result, wavesCleared, lootPenalty = 0 } = await runCaravanBattle(thread, party, partyClasses, db, guild, hostId, true).catch(err => {
        console.error('[EscortCombat]', err);
        return { result: 'error', wavesCleared: 0, lootPenalty: 0 };
    });

    let escortListings = [];
    let cvResult = null;

    if (result === 'win' || result === 'escape') {
        // Everyone in the party (owner + guards) gets cumulative rewards
        const rewardRes = await distributePartyRewards(db, party, guild.id, wavesCleared, lootPenalty);

        // Deduct cost and dispatch caravan
        const mora = await getMora(db, hostId, guild.id);
        if (mora < dest.cost) {
            await thread.send(`❌ <@${hostId}> رصيدك غير كافٍ لإرسال القافلة!`).catch(() => {});
        } else {
            const { sendCaravan } = require('./journey');
            await safeExecute(db,
                `UPDATE levels SET "mora"=CAST(COALESCE("mora",'0') AS BIGINT)-$1 WHERE "user"=$2 AND "guild"=$3`,
                [dest.cost, hostId, guild.id]);
            // Pass channel.id so the arrival checker knows where to open the market thread
            cvResult = await sendCaravan(db, hostId, guild.id, destId, [], channel?.id || null);
            // Mark route as permanently secured — no ambush will fire
            await safeExecute(db,
                `UPDATE user_caravans SET "attackScheduledAt"=0,"attackResolved"=1 WHERE "userID"=$1 AND "guildID"=$2`,
                [hostId, guild.id]);

            // Finalize staged market items into caravan listings
            try {
                const marketSetup = require('./market/market-setup');
                const marketDb    = require('./market/market-db');
                if (cvResult?.caravanId) {
                    await marketSetup.finalizeStagedItems(db, cvResult.caravanId, hostId, guild.id);
                    escortListings = await marketDb.getListingsByCaravan(db, cvResult.caravanId);
                }
            } catch(e) { console.error('[FinalizeStagedEscort]', e); }

            const eta = Math.floor((cvResult.endTime || 0) / 1000);

            const escortEmbed = new EmbedBuilder()
                .setColor('#00FF88')
                .setTitle('🎉 انتصار! الطريق آمن!')
                .setDescription(`🐪 ستنطلق القافلة إلى **${dest.emoji} ${dest.name}**!\n📅 **وقت الوصول:** <t:${eta}:R>\n${result === 'escape' ? '⚠️ الطريق غير مؤمَّن تماماً — قد يحدث كمين.\n' : '✅ الطريق مؤمَّن!\n'}`)
                .addFields(
                    { name: '⚔️ الموجات', value: `${wavesCleared}/5`, inline: true },
                    { name: '🎁 المكافآت', value: rewardRes.summary.map(s => `✶ ${s}`).join('\n') || '—', inline: false }
                );
            await thread.send({ embeds: [escortEmbed] }).catch(() => {});
        }
    } else {
        // Apply 1-hour cooldown to owner on any loss
        await setCaravanCooldown(db, hostId, guild.id).catch(() => {});
        const reason = result === 'lose_caravan' ? '🐪 دُمِّرت القافلة!'
                     : result === 'lose_timeout' ? '⏰ انتهى وقت الاستراحة!'
                     : '☠️ سقط كل الحراس!';
        const failEmbed = new EmbedBuilder()
            .setColor('#FF4444')
            .setTitle('💀 فشل التأمين!')
            .setDescription(`${reason}\nلم تُرسَل القافلة. لم يُخصَم منك شيء.\n⏳ كولداون ساعة واحدة قبل إرسال قافلة جديدة.`);
        await thread.send({ embeds: [failEmbed] }).catch(() => {});
    }

    setTimeout(() => thread.delete().catch(() => {}), 30000);

    if (typeof showHub === 'function') await showHub(hubMsg).catch(() => {});

    // Open a separate market thread on the hub message if items were staged
    try {
        const { client: _client } = data;
        const marketThread = require('./market/market-thread');
        if (_client && hubMsg && escortListings && escortListings.length > 0 && cvResult?.caravanId) {
            const dispatchNow = Date.now();
            const caravanObj = {
                userid: hostId,     userID: hostId,
                guildid: guild.id,  guildID: guild.id,
                destinationid: destId, destinationId: destId,
                id: cvResult.caravanId,
                starttime: dispatchNow, startTime: dispatchNow,
                endtime: cvResult.endTime, endTime: cvResult.endTime,
            };
            await marketThread.createMarketThread(_client, db, caravanObj, channel?.id, hubMsg);
        }
    } catch(e) { console.error('[EscortMarketThread]', e); }
}

// ─── Ambush Event Handler ─────────────────────────────────────────────────────
// Fires after caravan-lobby emits 'caravan_ambush_ready'
async function handleAmbushReady(data) {
    const { thread, party, partyClasses, guild, guildId, userId, caravanId, channel, db } = data;
    const guards = party.filter(id => id !== userId);

    const { result, wavesCleared, lootPenalty = 0 } = await runCaravanBattle(thread, party, partyClasses, db, guild, userId).catch(err => {
        console.error('[AmbushCombat]', err);
        return { result: 'error', wavesCleared: 0, lootPenalty: 0 };
    });

    if (result === 'win') {
        // Mark caravan as survived — trip continues with full rewards
        await safeExecute(db, `UPDATE user_caravans SET "attackResolved"=1 WHERE "id"=$1`, [caravanId]);
        await safeExecute(db,
            `UPDATE user_caravan_stats SET "ambush_survived"="ambush_survived"+1 WHERE "userID"=$1 AND "guildID"=$2`,
            [userId, guildId]);
        // Everyone (owner + guards) gets cumulative rewards
        const rewardRes = await distributePartyRewards(db, party, guildId, wavesCleared, lootPenalty);

        const winEmbed = new EmbedBuilder()
            .setColor('#00FF88')
            .setTitle('🎉 نجحت الحراسة! القافلة آمنة!')
            .setDescription('🐪 ستكمل القافلة رحلتها بمكافآت كاملة!')
            .addFields(
                { name: '⚔️ الموجات', value: `${wavesCleared}/5`, inline: true },
                { name: '🎁 المكافآت', value: rewardRes.summary.map(s => `✶ ${s}`).join('\n') || '—', inline: false }
            );
        await thread.send({ embeds: [winEmbed] }).catch(() => {});

        await channel.send(`✅ <@${userId}> **نجح الدفاع عن قافلتك!** تكمل رحلتها بسلام.`).catch(() => {});
    } else {
        // Battle lost → loot staging market, delete caravan + apply 1-hour cooldown to owner
        const { stagingLootItems } = require('./market/market-db');
        await stagingLootItems(db, userId, guildId, caravanConfig.attack.market_loot_defeat || 0.05);
        await setCaravanCooldown(db, userId, guildId).catch(() => {});
        await safeExecute(db,
            `UPDATE user_caravan_stats SET "total_trips"="total_trips"+1 WHERE "userID"=$1 AND "guildID"=$2`,
            [userId, guildId]);
        await safeExecute(db, `DELETE FROM user_caravans WHERE "id"=$1`, [caravanId]);

        const reason = result === 'lose_caravan' ? '🐪 دُمِّرت القافلة!'
                     : result === 'lose_timeout' ? '⏰ انتهى وقت الاستراحة!'
                     : '☠️ سقط كل الحراس!';
        const loseEmbed = new EmbedBuilder()
            .setColor('#FF4444')
            .setTitle('💀 فشلت الحراسة — القافلة نُهبت!')
            .setDescription(`${reason}\nضاعت جميع البضائع. انتهت الرحلة.\n⏳ كولداون ساعة واحدة قبل إرسال قافلة جديدة.`);
        await thread.send({ embeds: [loseEmbed] }).catch(() => {});
        await channel.send(`💔 <@${userId}> **نُهبت قافلتك!** تم الغاء الرحلة.`).catch(() => {});
    }

    setTimeout(() => thread.delete().catch(() => {}), 30000);
}

// ─── Register Listeners (call once on bot ready) ──────────────────────────────
let _registered = false;
function registerCombatListeners(client) {
    if (_registered) return;
    _registered = true;
    client.on('caravan_escort_ready', handleEscortReady);
    client.on('caravan_ambush_ready', handleAmbushReady);
}

module.exports = {
    CARAVAN_HP_MAX,
    WAVE_ENEMIES,
    WAVE_REWARD_DELTAS,
    selectEnemyTarget,
    processEnemyTurn,
    generateBattleEmbed,
    makeBattleRows,
    generateRestEmbed,
    generateResultEmbed,
    makeRestRows,
    doRestPhase,
    distributePartyRewards,
    runCaravanBattle,
    registerCombatListeners,
};
