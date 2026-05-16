'use strict';

const path = require('path');
const {
    ComponentType, MessageFlags,
    EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
    StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
} = require('discord.js');

const { safeExecute, safeQuery } = require('./db');
const { caravanConfig, EMOJI_MORA } = require('./config');
const potionItems = require(path.join(process.cwd(), 'json', 'potions.json'));
const { setCaravanCooldown } = require('./tables');
const { setupPlayers }       = require('../dungeon/core/setup.js');
const { buildHpBar, applyDamageToPlayer } = require('../dungeon/utils.js');
const { handleSkillUsage }   = require('../dungeon/skills.js');
const { executeWeaponAttack } = require('../combat/weapon-calculator.js');
const { buildSkillSelector, buildPotionSelector } = require('../dungeon/ui.js');
const { refundGuardTickets } = require('./lobby');
const { getBanditSkill, getRandomGenericSkill } = require('./bandit-skills');

async function buildBattlePayload(players, enemy, caravan, waveNum, log, actedIds, hostId, guild, destId = null) {
    return { files: [], embeds: [generateBattleEmbed(players, enemy, caravan, waveNum, log, actedIds, destId)] };
}

async function buildRestPayload(players, caravan, waveNum, guild, destId = null, party = null) {
    return { files: [], embeds: [generateRestEmbed(players, caravan, waveNum, destId, party)] };
}

async function buildResultPayload(result, players, caravan, wavesCleared, rewards, guild) {
    return { files: [], embeds: [generateResultEmbed(result, players, caravan, wavesCleared, rewards, guild)] };
}

// ─── Constants ────────────────────────────────────────────────────────────────
const CARAVAN_HP_MAX   = 1000;
const TURN_TIMEOUT_MS  = 45_000;
const REST_TIMEOUT_MS  = 90_000;   // 90 s between waves; timeout = loss

const DESTINATION_ENEMIES = {
    'gold_city': [
        { name: 'صعلوك البيداء',        hp: 800,  atk: 30,  isBoss: false },
        { name: 'مرتزق الرمال',         hp: 1200, atk: 50,  isBoss: false },
        { name: 'عقرب الكثبان',        hp: 1800, atk: 75,  isBoss: false },
        { name: 'سفاح القوافل',        hp: 2800, atk: 100, isBoss: false },
        { name: 'طاغية المهجر',         hp: 5000, atk: 150, isBoss: true  },
    ],
    'magic_academy': [
        { name: 'تلميذ مارق',          hp: 800,  atk: 30,  isBoss: false },
        { name: 'ناثر الوهم',           hp: 1200, atk: 50,  isBoss: false },
        { name: 'سالب الارواح',         hp: 1800, atk: 75,  isBoss: false },
        { name: 'كاهن الخراب',          hp: 2800, atk: 100, isBoss: false },
        { name: 'عراب الظلام',          hp: 5000, atk: 150, isBoss: true  },
    ],
    'imperial_capital': [
        { name: 'لص الازقة',           hp: 800,  atk: 30,  isBoss: false },
        { name: 'خنجر غادر',           hp: 1200, atk: 50,  isBoss: false },
        { name: 'فارس ساقط',           hp: 1800, atk: 75,  isBoss: false },
        { name: 'قاطع الطريق',         hp: 2800, atk: 100, isBoss: false },
        { name: 'سيد الظلال',          hp: 5000, atk: 150, isBoss: true  },
    ],
    'ancient_ruins': [
        { name: 'نباش القبور',         hp: 800,  atk: 30,  isBoss: false },
        { name: 'طيف ملعون',           hp: 1200, atk: 50,  isBoss: false },
        { name: 'حارس المقبرة',        hp: 1800, atk: 75,  isBoss: false },
        { name: 'صدى الهاوية',         hp: 2800, atk: 100, isBoss: false },
        { name: 'سيد اللعنات',         hp: 5000, atk: 150, isBoss: true  },
    ],
    'nature_valley': [
        { name: 'صياد جشع',           hp: 800,  atk: 30,  isBoss: false },
        { name: 'همجي الغابة',        hp: 1200, atk: 50,  isBoss: false },
        { name: 'قناص الادغال',        hp: 1800, atk: 75,  isBoss: false },
        { name: 'مروض الضواري',        hp: 2800, atk: 100, isBoss: false },
        { name: 'طاغية الوادي',        hp: 5000, atk: 150, isBoss: true  },
    ],
};

const DEFAULT_ENEMIES = [
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

function processPlayerDoT(players, log) {
    for (const p of players) {
        if (p.isDead) continue;
        if (!p.effects) p.effects = [];
        p.effects = p.effects.filter(e => {
            if (['poison', 'burn', 'bleed'].includes(e.type)) {
                const raw = e.val >= 1 ? e.val : Math.floor(p.maxHp * e.val);
                const dmg = Math.floor(raw);
                if (dmg > 0) {
                    p.hp = Math.max(0, p.hp - dmg);
                    const icon = e.type === 'burn' ? '🔥' : e.type === 'poison' ? '☠️' : '🩸';
                    const txt = e.type === 'burn' ? 'يحترق' : e.type === 'poison' ? 'يتألم من السم' : 'ينزف';
                    log.push(`${icon} **${p.name}** ${txt}! (-${dmg})`);
                }
            }
            if (e.turns !== undefined) { e.turns--; return e.turns > 0; }
            return false;
        });
        if (p.hp <= 0) { p.hp = 0; p.isDead = true; log.push(`💀 **${p.name}** سقط من تأثير الحالة!`); }
    }
}

// ─── Enemy Turn ───────────────────────────────────────────────────────────────
async function processEnemyTurn(enemy, players, caravan, waveNum, log, thread) {
    if (enemy.hp <= 0) return;
    if (!enemy.effects) enemy.effects = [];

    // 1. Stun / freeze — checked BEFORE DoT so a stunned enemy skips damage too
    if (enemy.frozen || enemy.effects.some(e => e.type === 'stun')) {
        log.push(`😵 **${enemy.name}** مشلول، خسر دوره!`);
        enemy.frozen = false;
        // Decrement stun turns so it actually expires
        enemy.effects = enemy.effects.filter(e => {
            if (e.type === 'stun' && e.turns !== undefined) { e.turns--; return e.turns > 0; }
            return true;
        });
        return;
    }

    // 2. DoT ticks (نفس منطق الدانجون)
    enemy.effects = enemy.effects.filter(e => {
        if (['burn', 'poison', 'bleed'].includes(e.type)) {
            const raw = e.val >= 1 ? e.val : Math.floor(enemy.maxHp * e.val);
            const dmg = Math.floor(raw);
            if (dmg > 0) {
                enemy.hp = Math.max(0, enemy.hp - dmg);
                const icon = e.type === 'burn' ? '🔥' : e.type === 'poison' ? '☠️' : '🩸';
                const txt = e.type === 'burn' ? 'يحترق' : e.type === 'poison' ? 'يتألم من السم' : 'ينزف بشدة';
                log.push(`${icon} **${enemy.name}** ${txt}! (-${dmg})`);
            }
        }
        if (e.turns !== undefined) { e.turns--; return e.turns > 0; }
        return false;
    });
    if (enemy.hp <= 0) return;

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

    // ── Bandit Skill Check ───────────────────────────────────────────────
    const banditSkill = getBanditSkill(enemy.name);
    if (banditSkill) {
        let skillChance = banditSkill.chance;
        if (enemy.hp < enemy.maxHp * 0.5) skillChance += 0.15;
        if (Math.random() < skillChance) {
            banditSkill.execute(enemy, players, caravan, log, waveNum);
            enemy.targetFocusId = null;
            return;
        }
    } else if (Math.random() < 0.2) {
        const genericSkill = getRandomGenericSkill();
        if (genericSkill) {
            genericSkill.execute(enemy, players, caravan, log, waveNum);
            enemy.targetFocusId = null;
            return;
        }
    }

    const sel = selectEnemyTarget(enemy, players, caravan);
    const dmg = Math.floor(enemy.atk * (1 + waveNum * 0.03));

    // Calculate multi-target count based on wave number
    const targetCounts = { 1: 1, 2: 2, 3: 2, 4: 2, 5: 3 };
    const numTargets = targetCounts[waveNum] || 1;

    if (sel.type === 'caravan') {
        // Hit the caravan AND also hit targetCount players simultaneously
        const isCritHit = Math.random() < 0.20;
        const finalDmg  = isCritHit ? Math.floor(dmg * 1.5) : dmg;
        caravan.hp = Math.max(0, caravan.hp - finalDmg);
        if (isCritHit) {
            log.push(`💥 **${enemy.name}** ضرب القافلة بضربة حاسمة! (-${finalDmg} HP) 📦 بضاعة تساقطت!`);
            caravan.pendingLootDrop = true;
        } else {
            log.push(`🐪 **${enemy.name}** ضرب القافلة! (-${finalDmg} HP)`);
        }
        // Also hit players (dual attack)
        const aliveTargets = players.filter(p => !p.isDead);
        const hitCount = Math.min(numTargets, aliveTargets.length);
        const shuffled = [...aliveTargets].sort(() => Math.random() - 0.5);
        for (let i = 0; i < hitCount; i++) {
            const t = shuffled[i];
            if (t && !t.isDead) {
                const playerDmg = Math.floor(dmg * 0.5);
                const hpBefore = t.hp;
                const taken    = applyDamageToPlayer(t, playerDmg);
                if (hpBefore - taken <= 0) { t.hp = 0; t.isDead = true; }
                log.push(`⚔️ **${enemy.name}** ضرب **${t.name}** (-${taken})`);
                if (t.isDead) {
                    log.push(`💀 **${t.name}** سقط مع القافلة!`);
                    if (t.class === 'Priest') {
                        players.forEach(a => {
                            if (!a.isDead) a.hp = Math.min(a.maxHp, a.hp + Math.floor(a.maxHp * 0.20));
                        });
                        log.push(`✨ هالة الكاهن المميِّتة: +20% HP للفريق`);
                    }
                }
            }
        }
    } else {
        const aliveTargets = players.filter(p => !p.isDead);
        const hitCount = Math.min(numTargets, aliveTargets.length);
        const shuffled = [...aliveTargets].sort(() => Math.random() - 0.5);
        for (let i = 0; i < hitCount; i++) {
            const t = shuffled[i];
            if (t && !t.isDead) {
                const finalDmg = t.defending ? Math.floor(dmg * 0.5) : dmg;
                const hpBefore = t.hp;
                const taken    = applyDamageToPlayer(t, finalDmg);
                if (hpBefore - taken <= 0) { t.hp = 0; t.isDead = true; }
                log.push(`⚔️ **${enemy.name}** ضرب **${t.name}** (-${taken})`);
                if (t.isDead) {
                    log.push(`💀 **${t.name}** سقط!`);
                    if (t.class === 'Priest') {
                        players.forEach(a => {
                            if (!a.isDead) a.hp = Math.min(a.maxHp, a.hp + Math.floor(a.maxHp * 0.20));
                        });
                        log.push(`✨ هالة الكاهن المميِّتة: +20% HP للفريق`);
                    }
                }
            }
        }
    }
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

const R2_BASE = 'https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev';

const DEST_IMAGE_MAP = {
    'gold_city': 'gold_city/gold_city.png',
    'magic_academy': 'academy/academy.png',
    'imperial_capital': 'capital/capital.png',
    'ancient_ruins': 'ancient_ruins/ancient_ruins.png',
    'nature_valley': 'nature_valley/nature_valley.png',
};

const DEST_COLOR_MAP = {
    'gold_city': '#FFD700',
    'magic_academy': '#8A2BE2',
    'imperial_capital': '#DC143C',
    'ancient_ruins': '#CD853F',
    'nature_valley': '#228B22',
};

function generateBattleEmbed(players, enemy, caravan, waveNum, log, actedPlayers = [], destId = null) {
    const folderPath = DEST_IMAGE_MAP[destId] || 'gold_city/gold_city.png';
    const folderPrefix = folderPath.split('/')[0];
    const enemyImageUrl = `${R2_BASE}/images/caravan/${folderPrefix}/${waveNum}.png`;
    const embedColor = DEST_COLOR_MAP[destId] || '#FF6600';
    
    const embed = new EmbedBuilder()
        .setColor(embedColor)
        .setTitle(`⚔️ كمين القافلّة | الموجة ${waveNum}/5`)
        .setImage(enemyImageUrl);

    let enemyStatus = '';
    if (enemy.effects) {
        if (enemy.effects.some(e => e.type === 'poison'))   enemyStatus += ' ☠️';
        if (enemy.effects.some(e => e.type === 'burn'))     enemyStatus += ' 🔥';
        if (enemy.effects.some(e => e.type === 'bleed'))    enemyStatus += ' 🩸';
        if (enemy.effects.some(e => e.type === 'weakness')) enemyStatus += ' 📉';
        if (enemy.effects.some(e => e.type === 'stun') || enemy.frozen) enemyStatus += ' 💫';
        if (enemy.effects.some(e => e.type === 'confusion')) enemyStatus += ' 😵';
        if (enemy.effects.some(e => e.type === 'blind'))    enemyStatus += ' 🕶️';
        if (enemy.effects.some(e => e.type === 'evasion'))  enemyStatus += ' 💨';
    }
    embed.addFields({
        name:   `👹 **${enemy.name}**${enemyStatus}`,
        value:  `${buildHpBar(enemy.hp, enemy.maxHp)} \`[${enemy.hp}/${enemy.maxHp}]\``,
        inline: false,
    });
    embed.addFields({
        name:   '🐪 **صحة القافلّة**',
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

function generateRestEmbed(players, caravan, waveNum, destId = null, party = null) {
    const folderName = DEST_IMAGE_MAP[destId] || 'gold_city/gold_city.png';
    const destImageUrl = `${R2_BASE}/images/caravan/${folderName}`;
    const embedColor = DEST_COLOR_MAP[destId] || '#4CAF50';
    
    const teamLines = players.map(p => {
        const hpBar = p.isDead ? '💀 سقط' : buildHpBar(p.hp, p.maxHp, p.shield);
        return `**${p.name}** [${CLASS_LABELS[p.class] || p.class}]\n${hpBar}`;
    }).join('\n\n');

    let rewardLine = '';
    if (party && waveNum > 0) {
        let totalMora = 0, totalChests = 0, totalRep = 0;
        for (let w = 0; w < Math.min(waveNum, WAVE_REWARD_DELTAS.length); w++) {
            totalMora   += WAVE_REWARD_DELTAS[w].mora;
            totalChests += WAVE_REWARD_DELTAS[w].chests;
            totalRep    += WAVE_REWARD_DELTAS[w].rep;
        }
        const parts = [];
        if (totalMora   > 0) parts.push(`${totalMora.toLocaleString()} ${EMOJI_MORA}`);
        if (totalChests > 0) parts.push(`${totalChests} 🎁`);
        if (totalRep    > 0) parts.push(`${totalRep} ✨ سمعة`);
        if (parts.length) rewardLine = `🎯 المكافآت المتراكمة: ${parts.join(' | ')}`;
    }

    return new EmbedBuilder()
        .setColor(embedColor)
        .setTitle(`☕ استراحة — الموجة ${waveNum}/5 منتهية!`)
        .setImage(destImageUrl)
        .setDescription(
            `❖ استـراحـة قبل الانتقـال لوكـر قطاع الطـرق التـالي ..\n\n` +
            `✦ القرار بيـد قـائد القافلـة الاستـمرار وتأمين الطريق او الانسحاب\n${rewardLine ? `\n${rewardLine}` : ''}`
        )
        .addFields(
            { name: '🐪 صحة القافلّة', value: `${buildHpBar(caravan.hp, caravan.maxHp)} \`[${caravan.hp}/${caravan.maxHp}]\``, inline: false },
            { name: '🛡️ حالة الفريق', value: teamLines || '—', inline: false }
        );
}

function generateResultEmbed(result, players, caravan, wavesCleared, rewards, guild) {
    const isWin = result === 'win' || result === 'escape';
    const isEscape = result === 'escape';
    const color = isWin ? '#00FF88' : '#FF4444';
    const title = isWin
        ? (isEscape ? '❖ انسـحـاب - نصـف الطريـق مؤمـن' : '❖ تـم تـأمين الطريق بالكامـل')
        : '💀 فشلت الحراسة — القافلة نُهبت!';

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

// isEscort=true shows the [انسحاب] escape button (pre-emptive escort only)
function makeRestRows(isEscort = false) {
    const btns = [
        new ButtonBuilder().setCustomId('cvr_continue').setLabel('استمرار').setEmoji('▶️').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('cvr_potion').setLabel('جرعة').setEmoji('🧪').setStyle(ButtonStyle.Secondary),
    ];
    if (isEscort) {
        btns.push(
            new ButtonBuilder().setCustomId('cvr_escape').setLabel('انسحاب').setEmoji('🏃').setStyle(ButtonStyle.Primary)
        );
    }
    return [new ActionRowBuilder().addComponents(...btns)];
}

// ─── Rest Phase ───────────────────────────────────────────────────────────────
// Returns 'continue' | 'timeout' | 'escape'
async function doRestPhase(thread, players, caravan, waveNum, hostId, db, guild, isEscort = false, destId = null, party = null) {
    const restPayload = await buildRestPayload(players, caravan, waveNum, guild, destId, party);
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
                        return i.reply({ content: '⛔ القائد فقط يستطيع الانسحاب.', flags: [MessageFlags.Ephemeral] });
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
                    const sel = await pMsg.awaitMessageComponent({
                        filter:        x => x.user.id === i.user.id,
                        time:          20000,
                        componentType: ComponentType.StringSelect,
                    }).catch(() => null);
                    if (!sel) return;
                    await sel.deferUpdate().catch(() => {});

                    if (sel.values[0] === 'buy_potions_action') {
                        let currentMora = 0;
                        try {
                            const res = await safeQuery(db, `SELECT "mora" FROM levels WHERE "user"=$1 AND "guild"=$2`, [i.user.id, guild.id]);
                            currentMora = res?.rows?.[0]?.mora || 0;
                        } catch (e) {
                            try {
                                const res2 = await db.query(`SELECT mora FROM levels WHERE "user"=$1 AND "guild"=$2`, [i.user.id, guild.id]);
                                currentMora = res2?.rows?.[0]?.mora || 0;
                            } catch { currentMora = 0; }
                        }

                        const shopOptions = potionItems.map(pot => ({
                            label: `${pot.name} (${pot.price.toLocaleString()} مورا)`,
                            value: pot.id,
                            description: pot.description ? pot.description.substring(0, 50) : 'جرعة مفيدة',
                            emoji: pot.emoji,
                        }));

                        const shopRow = new ActionRowBuilder().addComponents(
                            new StringSelectMenuBuilder()
                                .setCustomId('shop_buy_select')
                                .setPlaceholder('اختر الجرعة للشراء...')
                                .addOptions(shopOptions)
                        );

                        try {
                            const shopMsg = await sel.followUp({
                                content: `💰 **متجر الجرعات السريع**\nرصيدك الحالي: **${Number(currentMora).toLocaleString()}** ${EMOJI_MORA}\nاختر الجرعة التي تريد شراءها:`,
                                components: [shopRow],
                                ephemeral: true,
                            });
                            const buySel = await shopMsg.awaitMessageComponent({ time: 15000 });
                            await buySel.deferUpdate().catch(() => {});
                            const itemID = buySel.values[0];
                            const targetItem = potionItems.find(x => x.id === itemID);
                            if (!targetItem) return;

                            if (Number(currentMora) < targetItem.price) {
                                await buySel.followUp({ content: `❌ **لا تملك مورا كافية!** تحتاج ${targetItem.price.toLocaleString()} مورا.`, ephemeral: true });
                            } else {
                                try {
                                    await db.query(`UPDATE levels SET "mora"=CAST(COALESCE("mora",'0') AS BIGINT)-$1 WHERE "user"=$2 AND "guild"=$3`, [targetItem.price, i.user.id, guild.id]);
                                } catch (e) {
                                    await db.query(`UPDATE levels SET mora=CAST(COALESCE(mora,'0') AS BIGINT)-$1 WHERE "user"=$2 AND "guild"=$3`, [targetItem.price, i.user.id, guild.id]).catch(() => {});
                                }
                                try {
                                    const check = await db.query(`SELECT "quantity" FROM user_inventory WHERE "userID"=$1 AND "guildID"=$2 AND "itemID"=$3`, [i.user.id, guild.id, targetItem.id]);
                                    if (check.rows.length > 0) {
                                        await db.query(`UPDATE user_inventory SET "quantity"="quantity"+1 WHERE "userID"=$1 AND "guildID"=$2 AND "itemID"=$3`, [i.user.id, guild.id, targetItem.id]);
                                    } else {
                                        await db.query(`INSERT INTO user_inventory ("guildID","userID","itemID","quantity") VALUES ($1,$2,$3,1)`, [guild.id, i.user.id, targetItem.id]);
                                    }
                                } catch (e) {
                                    const check2 = await db.query(`SELECT quantity FROM user_inventory WHERE "userID"=$1 AND "guildID"=$2 AND "itemID"=$3`, [i.user.id, guild.id, targetItem.id]).catch(() => ({ rows: [] }));
                                    if (check2.rows.length > 0) {
                                        await db.query(`UPDATE user_inventory SET quantity=quantity+1 WHERE "userID"=$1 AND "guildID"=$2 AND "itemID"=$3`, [i.user.id, guild.id, targetItem.id]).catch(() => {});
                                    } else {
                                        await db.query(`INSERT INTO user_inventory (guildid,userid,itemid,quantity) VALUES ($1,$2,$3,1)`, [guild.id, i.user.id, targetItem.id]).catch(() => {});
                                    }
                                }
                                await buySel.followUp({ content: `✅ **تم شراء ${targetItem.name}!**\nاضغط على 🧪 الجرعات مرة أخرى لاستخدامها.`, ephemeral: true });
                            }
                        } catch (e) {
                            try { await sel.editReply({ content: '⏰ انتهى وقت الشراء.', components: [] }).catch(() => {}); } catch {}
                        }
                    } else if (sel.values[0] === 'no_potions') {
                        await sel.followUp({ content: '🚫 ليس لديك جرعات.', ephemeral: true });
                    } else {
                        const potId = sel.values[0].replace('use_potion_', '');
                        if (potId === 'potion_titan') {
                            const limit = 3;
                            p.titanPotionUses = p.titanPotionUses || 0;
                            if (p.titanPotionUses >= limit) {
                                await sel.followUp({ content: `🚫 **لقد استهلكت الحد الأقصى (${limit}) من جرعة العملاق في هذه الرحلة!**`, ephemeral: true });
                                return;
                            }
                            p.titanPotionUses++;
                        }

                        await safeExecute(db,
                            `UPDATE user_inventory SET "quantity"="quantity"-1 WHERE "userID"=$1 AND "guildID"=$2 AND "itemID"=$3 AND "quantity">0`,
                            [i.user.id, guild.id, potId]);

                        if (potId === 'potion_heal') {
                            p.hp = Math.min(p.maxHp, p.hp + Math.floor(p.maxHp * 0.5));
                            await sel.editReply({ content: `✅ **${p.name}** استعاد 50% HP!`, components: [] }).catch(() => {});
                        } else if (potId === 'potion_time') {
                            p.special_cooldown = 0; p.skillCooldowns = {};
                            await sel.editReply({ content: `✅ **${p.name}** أعاد شحن مهاراته!`, components: [] }).catch(() => {});
                        } else if (potId === 'potion_titan') {
                            p.maxHp *= 2; p.hp = p.maxHp;
                            p.effects.push({ type: 'titan', floors: 5 });
                            await sel.editReply({ content: `🔥 **${p.name}** تحول لعملاق!`, components: [] }).catch(() => {});
                        } else {
                            await sel.editReply({ content: '✅ استُخدمت الجرعة.', components: [] }).catch(() => {});
                        }
                        const updatedRestPayload = await buildRestPayload(players, caravan, waveNum, guild, destId, party);
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
async function runCaravanBattle(thread, party, partyClasses, db, guild, hostId, isEscort = false, destId = null, startWave = 1, resumeData = null, caravanId = null) {
    const WAVE_ENEMIES = (destId && DESTINATION_ENEMIES[destId]) ? DESTINATION_ENEMIES[destId] : DEFAULT_ENEMIES;
    const applyAnomaly = !!resumeData;

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
    
    // Anomaly buffs for resumed battle (time rewind)
    if (applyAnomaly) {
        players.forEach(p => {
            if (!p.isDead) {
                p.shield = (p.shield || 0) + Math.floor(p.maxHp * 0.5);
                if (!p.effects) p.effects = [];
                p.effects.push({ type: 'atk_buff', val: 0.50, turns: 99, anomaly: true });
            }
        });
    }

    let wavesCleared = 0;

    // Save initial state for crash recovery
    if (caravanId) {
        try {
            const { saveCaravanBattle } = require('./caravan-state');
            const initState = {
                wave: 1,
                guardIds: party.filter(id => id !== hostId),
                players: players.map(p => ({
                    id: p.id, name: p.name, class: p.class,
                    hp: p.hp, maxHp: p.maxHp, shield: p.shield,
                    atk: p.atk, isDead: p.isDead,
                    effects: p.effects?.filter(e => !e.anomaly) || [],
                    skillCooldowns: p.skillCooldowns || {},
                    special_cooldown: p.special_cooldown || 0,
                })),
                caravan: { hp: caravan.hp, maxHp: caravan.maxHp, lootPenalty: caravan.lootPenalty || 0 },
                destId,
            };
            await saveCaravanBattle(db, caravanId, guild.id, hostId, thread.id, initState);
        } catch (_) {}
    }

    for (let w = 0; w < WAVE_ENEMIES.length; w++) {
        const def     = WAVE_ENEMIES[w];
        const waveNum = w + 1;

        // Skip waves already cleared (resume from checkpoint)
        if (waveNum < startWave) { wavesCleared = waveNum; continue; }
        
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
            const initPayload = await buildBattlePayload(players, enemy, caravan, waveNum, log, [], hostId, guild, destId);
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
                    await battleMsg.edit({ ...(await buildBattlePayload(players, enemy, caravan, waveNum, log, actedPlayers, hostId, guild, destId)), components: [] }).catch(() => {});
                    collector.stop('turn_end');
                }, TURN_TIMEOUT_MS);

                collector.on('collect', async i => {
                    const pid = i.user.id;
                    const p   = players.find(pl => pl.id === pid);
                    if (!p || p.isDead || actedPlayers.includes(pid) || processingSet.has(pid))
                        return i.deferUpdate().catch(() => {});
                    processingSet.add(pid);
                    await i.deferUpdate().catch(() => {});

                    // ── Player status checks ──────────────────────────────────
                    if (p.effects && p.effects.some(e => e.type === 'stun')) {
                        log.push(`😵 **${p.name}** مشلول، خسر دوره!`);
                        p.effects = p.effects.filter(e => {
                            if (e.type === 'stun' && e.turns !== undefined) { e.turns--; return e.turns > 0; }
                            return true;
                        });
                        actedPlayers.push(pid); p.skipCount = 0;
                        processingSet.delete(pid);
                        await battleMsg.edit({ ...(await buildBattlePayload(players, enemy, caravan, waveNum, log, actedPlayers, hostId, guild, destId)), components: makeBattleRows() }).catch(() => {});
                        if (actedPlayers.length >= players.filter(pl => !pl.isDead).length) { clearTimeout(turnTimer); collector.stop('turn_end'); }
                        return;
                    }
                    if (p.effects && p.effects.some(e => e.type === 'confusion')) {
                        if (Math.random() < 0.5) {
                            log.push(`😵 **${p.name}** مشوش ولا يستطيع التركيز!`);
                            actedPlayers.push(pid); p.skipCount = 0;
                            processingSet.delete(pid);
                            await battleMsg.edit({ ...(await buildBattlePayload(players, enemy, caravan, waveNum, log, actedPlayers, hostId, guild, destId)), components: makeBattleRows() }).catch(() => {});
                            if (actedPlayers.length >= players.filter(pl => !pl.isDead).length) { clearTimeout(turnTimer); collector.stop('turn_end'); }
                            return;
                        }
                    }

                    try {
                        const cid = i.customId;

                        if (cid === 'cvb_atk') {
                            const inPanic = caravan.hp < caravan.maxHp * 0.30;
                            if (inPanic && pid !== hostId && Math.random() < 0.15) {
                                log.push(`😰 **${p.name}** ذعر وأخطأ ضربته! (وضع الذعر)`);
                                actedPlayers.push(pid); p.skipCount = 0;
                                processingSet.delete(pid);
                                await battleMsg.edit({ ...(await buildBattlePayload(players, enemy, caravan, waveNum, log, actedPlayers, hostId, guild, destId)), components: makeBattleRows() }).catch(() => {});
                                if (actedPlayers.length >= players.filter(pl => !pl.isDead).length) { clearTimeout(turnTimer); collector.stop('turn_end'); }
                                return;
                            }
                            const res  = executeWeaponAttack(p, enemy, false);
                            let   dmgD = Math.max(0, res.damage || 0);
                            // Blind check
                            if (p.effects && p.effects.some(e => e.type === 'blind')) {
                                const blindVal = p.effects.find(e => e.type === 'blind').val || 0.3;
                                if (Math.random() < blindVal) {
                                    log.push(`🚫 **${p.name}** أخطأ الهدف! (أعمى)`);
                                    actedPlayers.push(pid); p.skipCount = 0;
                                    processingSet.delete(pid);
                                    await battleMsg.edit({ ...(await buildBattlePayload(players, enemy, caravan, waveNum, log, actedPlayers, hostId, guild, destId)), components: makeBattleRows() }).catch(() => {});
                                    if (actedPlayers.length >= players.filter(pl => !pl.isDead).length) { clearTimeout(turnTimer); collector.stop('turn_end'); }
                                    return;
                                }
                            }
                            // Weakness damage reduction
                            const weaknessDE = p.effects && p.effects.find(e => e.type === 'weakness');
                            if (weaknessDE) dmgD = Math.floor(dmgD * (1 - weaknessDE.val));
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
                            if (!p.skillCooldowns) p.skillCooldowns = {};
                            if (!p.special_cooldown) p.special_cooldown = 0;
                            
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

                            // Manual cooldown check for class skills and regular skills
                            if (skillId === 'class_special_skill' && p.special_cooldown > 0) {
                                await sel.followUp({ content: `⏳ المهارة في وقت انتظار (${p.special_cooldown} جولات)!`, flags: [MessageFlags.Ephemeral] }).catch(() => {});
                                processingSet.delete(pid); return;
                            }
                            if (skillId === 'hybrid_heal' && (p.skillCooldowns['hybrid_heal'] || 0) > 0) {
                                await sel.followUp({ content: `⏳ مهارة الإرث في وقت انتظار (${p.skillCooldowns['hybrid_heal']} جولات)!`, flags: [MessageFlags.Ephemeral] }).catch(() => {});
                                processingSet.delete(pid); return;
                            }
                            // Check regular skills cooldown
                            if (skillId !== 'class_special_skill' && skillId !== 'hybrid_heal' && (p.skillCooldowns[skillId] || 0) > 0) {
                                await sel.followUp({ content: `⏳ المهارة "${skillObj.name}" في وقت انتظار (${p.skillCooldowns[skillId]} جولات)!`, flags: [MessageFlags.Ephemeral] }).catch(() => {});
                                processingSet.delete(pid); return;
                            }

                            const hpBefore = enemy.hp;
                            const res = handleSkillUsage(p, { ...skillObj, id: skillId }, enemy, log, thread, players);
                            let dmgD = Math.max(0, hpBefore - enemy.hp);
                            // Weakness reduces skill damage too
                            const weaknessSE = p.effects && p.effects.find(e => e.type === 'weakness');
                            if (weaknessSE && dmgD > 0) {
                                const reduction = Math.floor(dmgD * weaknessSE.val);
                                enemy.hp = Math.min(enemy.maxHp, enemy.hp + reduction);
                                dmgD = Math.max(0, hpBefore - enemy.hp);
                                log.push(`📉 تأثير الضعف: خفّض ضرر **${p.name}** بمقدار ${reduction}`);
                            }
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
                            const sel = await pMsg.awaitMessageComponent({ filter: x => x.user.id === pid, time: 20000 }).catch(() => null);
                            if (!sel) { processingSet.delete(pid); return; }
                            await sel.deferUpdate().catch(() => {});

                            if (sel.values[0] === 'buy_potions_action') {
                                let currentMora = 0;
                                try {
                                    const res = await safeQuery(db, `SELECT "mora" FROM levels WHERE "user"=$1 AND "guild"=$2`, [pid, guild.id]);
                                    currentMora = res?.rows?.[0]?.mora || 0;
                                } catch { try { const r2 = await db.query(`SELECT mora FROM levels WHERE "user"=$1 AND "guild"=$2`, [pid, guild.id]); currentMora = r2?.rows?.[0]?.mora || 0; } catch { currentMora = 0; } }

                                const shopOptions = potionItems.map(pot => ({
                                    label: `${pot.name} (${pot.price.toLocaleString()} مورا)`,
                                    value: pot.id,
                                    description: (pot.description || '').substring(0, 50),
                                    emoji: pot.emoji || '🧪',
                                }));
                                const shopRow = new ActionRowBuilder().addComponents(
                                    new StringSelectMenuBuilder()
                                        .setCustomId('cvb_potion_buy')
                                        .setPlaceholder('اختر الجرعة للشراء...')
                                        .addOptions(shopOptions)
                                );
                                try {
                                    const shopMsg = await sel.followUp({
                                        content: `💰 **متجر الجرعات السريع**\nرصيدك الحالي: **${Number(currentMora).toLocaleString()}** ${EMOJI_MORA}\nاختر الجرعة التي تريد شراءها:`,
                                        components: [shopRow], ephemeral: true,
                                    });
                                    const buySel = await shopMsg.awaitMessageComponent({ time: 15000 });
                                    await buySel.deferUpdate().catch(() => {});
                                    const itemID = buySel.values[0];
                                    const targetItem = potionItems.find(x => x.id === itemID);
                                    if (targetItem) {
                                        if (Number(currentMora) < targetItem.price) {
                                            await buySel.followUp({ content: `❌ **لا تملك مورا كافية!** تحتاج ${targetItem.price.toLocaleString()} مورا.`, ephemeral: true });
                                        } else {
                                            try { await db.query(`UPDATE levels SET "mora"=CAST(COALESCE("mora",'0') AS BIGINT)-$1 WHERE "user"=$2 AND "guild"=$3`, [targetItem.price, pid, guild.id]); } catch (e) { await db.query(`UPDATE levels SET mora=CAST(COALESCE(mora,'0') AS BIGINT)-$1 WHERE "user"=$2 AND "guild"=$3`, [targetItem.price, pid, guild.id]).catch(() => {}); }
                                            try { const chk = await db.query(`SELECT "quantity" FROM user_inventory WHERE "userID"=$1 AND "guildID"=$2 AND "itemID"=$3`, [pid, guild.id, targetItem.id]); if (chk.rows.length > 0) { await db.query(`UPDATE user_inventory SET "quantity"="quantity"+1 WHERE "userID"=$1 AND "guildID"=$2 AND "itemID"=$3`, [pid, guild.id, targetItem.id]); } else { await db.query(`INSERT INTO user_inventory ("guildID","userID","itemID","quantity") VALUES ($1,$2,$3,1)`, [guild.id, pid, targetItem.id]); } } catch (e) { try { const chk2 = await db.query(`SELECT quantity FROM user_inventory WHERE "userID"=$1 AND "guildID"=$2 AND "itemID"=$3`, [pid, guild.id, targetItem.id]).catch(() => ({ rows: [] })); if (chk2.rows.length > 0) { await db.query(`UPDATE user_inventory SET quantity=quantity+1 WHERE "userID"=$1 AND "guildID"=$2 AND "itemID"=$3`, [pid, guild.id, targetItem.id]).catch(() => {}); } else { await db.query(`INSERT INTO user_inventory (guildid,userid,itemid,quantity) VALUES ($1,$2,$3,1)`, [guild.id, pid, targetItem.id]).catch(() => {}); } } catch {} }
                                            await buySel.followUp({ content: `✅ **تم شراء ${targetItem.name}!**\nاضغط على 🧪 الجرعات مرة أخرى لاستخدامها.`, ephemeral: true });
                                        }
                                    }
                                } catch { try { await sel.editReply({ content: '⏰ انتهى وقت الشراء.', components: [] }).catch(() => {}); } catch {} }
                                processingSet.delete(pid); return;
                            }

                            const potId = sel.values[0].replace('use_potion_', '');
                            if (potId === 'no_potions') { processingSet.delete(pid); return; }

                            if (potId === 'potion_titan') {
                                const limit = 3;
                                p.titanPotionUses = p.titanPotionUses || 0;
                                if (p.titanPotionUses >= limit) {
                                    await sel.followUp({ content: `🚫 **لقد استهلكت الحد الأقصى (${limit}) من جرعة العملاق في هذه الرحلة!**`, ephemeral: true });
                                    processingSet.delete(pid); return;
                                }
                                p.titanPotionUses++;
                            }

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
                            await sel.editReply({ content: `✅ استُخدمت ${potionItems.find(x => x.id === potId)?.name || 'الجرعة'}.`, components: [] }).catch(() => {});
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
                            const winPayload = await buildBattlePayload(players, enemy, caravan, waveNum, log, actedPlayers, hostId, guild, destId);
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
                            ...(await buildBattlePayload(players, enemy, caravan, waveNum, log, actedPlayers, hostId, guild, destId)),
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

            // ── Player DoT ticks ──────────────────────────────────────────
            processPlayerDoT(players, log);
            ensureDeadMarked(players);
            if (players.every(p => p.isDead)) {
                await battleMsg.edit({ content: '☠️ **سقط الفريق بالكامل!**', components: [] }).catch(() => {});
                return { result: 'lose_players', wavesCleared };
            }

            // ── Enemy turn — buttons stay active ────────────
            await processEnemyTurn(enemy, players, caravan, waveNum, log, thread);
            ensureDeadMarked(players);

            // ── Mechanic 3: Loot Drop — pickup window, deduct only if unsaved ──
            if (caravan.pendingLootDrop) {
                caravan.pendingLootDrop = false;

                const lootMsg = await thread.send({
                    content: '📦 **بضاعة تساقطت من القافلة!** أول من يضغط ينقذها (15 ثانية).',
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
                                const { stagingLootItems } = require('./market/market-db');
                                const looted = await stagingLootItems(db, hostId, guild.id, 0.10);
                                if (looted.length > 0) log.push(`💀 سُرقت ${looted.length} بضاعة من سلّة التاجر!`);
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
                ...(await buildBattlePayload(players, enemy, caravan, waveNum, log, [], hostId, guild, destId)),
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

        // Save state after each wave for crash recovery
        if (caravanId) {
            try {
                const { saveCaravanBattle } = require('./caravan-state');
                const state = {
                    wave: waveNum + 1,
                    guardIds: party.filter(id => id !== hostId),
                    players: players.map(p => ({
                        id: p.id, name: p.name, class: p.class,
                        hp: p.hp, maxHp: p.maxHp, shield: p.shield,
                        atk: p.atk, isDead: p.isDead,
                        effects: p.effects?.filter(e => !e.anomaly) || [],
                        skillCooldowns: p.skillCooldowns || {},
                        special_cooldown: p.special_cooldown || 0,
                    })),
                    caravan: { hp: caravan.hp, maxHp: caravan.maxHp, lootPenalty: caravan.lootPenalty || 0 },
                    destId,
                };
                await saveCaravanBattle(db, caravanId, guild.id, hostId, thread.id, state);
            } catch (_) {}
        }

        // ── Rest Phase (between waves, not after last) ────────────────────
        if (waveNum < WAVE_ENEMIES.length) {
            const restResult = await doRestPhase(thread, players, caravan, waveNum, hostId, db, guild, isEscort, destId, party);
            if (restResult === 'escape') {
                await thread.send('🏃 **القائد قرر الانسحاب — المعركة توقفت والقافلة واصلة!**').catch(() => {});
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

    const { result, wavesCleared, lootPenalty = 0 } = await runCaravanBattle(thread, party, partyClasses, db, guild, hostId, true, destId).catch(err => {
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
            for (const uid of party) {
                if (uid !== hostId) await refundGuardTickets(db, uid, guild.id, null).catch(() => {});
            }
            await thread.send(`❌ <@${hostId}> رصيدك غير كافٍ لإرسال القافلة!\n🎟️ تم إرجاع التذاكر للحراس.`).catch(() => {});
        } else {
            const { sendCaravan } = require('./journey');
            await safeExecute(db,
                `UPDATE levels SET "mora"=CAST(COALESCE("mora",'0') AS BIGINT)-$1 WHERE "user"=$2 AND "guild"=$3`,
                [dest.cost, hostId, guild.id]);
            // Pass channel.id so the arrival checker knows where to open the market thread
            cvResult = await sendCaravan(db, hostId, guild.id, destId, [], channel?.id || null);
            // Mark route as permanently secured — no ambush will fire
            if (cvResult?.caravanId) {
                await safeExecute(db,
                    `UPDATE user_caravans SET "attackScheduledAt"=0,"attackResolved"=1 WHERE "id"=$1`,
                    [cvResult.caravanId]);
            }

            // Finalize staged market items into caravan listings
            try {
                const marketSetup = require('./market/market-setup');
                const marketDb    = require('./market/market-db');
                if (cvResult?.caravanId) {
                    const hostMember = await guild.members.fetch(hostId).catch(() => null);
                    await marketSetup.finalizeStagedItems(db, cvResult.caravanId, hostId, guild.id, hostMember);
                    escortListings = await marketDb.getListingsByCaravan(db, cvResult.caravanId);
                }
            } catch(e) { console.error('[FinalizeStagedEscort]', e); }

            const eta = Math.floor((cvResult.endTime || 0) / 1000);

            const folderName = DEST_IMAGE_MAP[dest.id] || 'gold_city/gold_city.png';
            const destImgUrl = `${R2_BASE}/images/caravan/${folderName}`;
            const escortEmbed = new EmbedBuilder()
                .setColor(dest.color || '#00FF88')
                .setTitle(result === 'escape' ? '❖ انسـحـاب - نصـف الطريـق مؤمـن' : '❖ تـم تـأمين الطريق بالكامـل')
                .setDescription(`🐪 ستنطلق القافلة إلى **${dest.emoji} ${dest.name}**!\n📅 **وقت الوصول:** <t:${eta}:R>\n${result === 'escape' ? '⚠️ الطريق غير مؤمَّن تماماً — قد يحدث كمين.\n' : '✅ الطريق مؤمَّن!\n'}`)
                .setImage(destImgUrl)
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
        const folderName2 = DEST_IMAGE_MAP[dest.id] || 'gold_city/gold_city.png';
        const destImgUrl = `${R2_BASE}/images/caravan/${folderName2}`;
        const failEmbed = new EmbedBuilder()
            .setColor(dest.color || '#FF4444')
            .setTitle('💀 فشل التأمين!')
            .setDescription(`${reason}\nتم إنهاء الرحلة.\n⏳ كولداون ساعة واحدة قبل إرسال قافلة جديدة.`)
            .setImage(destImgUrl);
        await thread.send({ embeds: [failEmbed] }).catch(() => {});
    }

    setTimeout(() => thread.delete().catch(() => {}), 30000);

    if (typeof showHub === 'function') await showHub(hubMsg).catch(() => {});

    // Open a separate market thread on the hub message if items were staged
    try {
        const marketThread = require('./market/market-thread');
        if (hubMsg && escortListings && escortListings.length > 0 && cvResult?.caravanId) {
            const dispatchNow = Date.now();
            const caravanObj = {
                userid: hostId,     userID: hostId,
                guildid: guild.id,  guildID: guild.id,
                destinationid: destId, destinationId: destId,
                id: cvResult.caravanId,
                starttime: dispatchNow, startTime: dispatchNow,
                endtime: cvResult.endTime, endTime: cvResult.endTime,
            };
            await marketThread.createMarketThread(this, db, caravanObj, channel?.id, hubMsg);
        }
    } catch(e) { console.error('[EscortMarketThread]', e); }
}

// ─── Ambush Event Handler ─────────────────────────────────────────────────────
// Fires after caravan-lobby emits 'caravan_ambush_ready'
async function handleAmbushReady(data) {
    const { thread, party, partyClasses, guild, guildId, userId, caravanId, channel, db } = data;
    const guards = party.filter(id => id !== userId);

    const cvRes = await safeQuery(db, `SELECT "destinationId" FROM user_caravans WHERE "id"=$1`, [caravanId]);
    const destId = cvRes?.rows?.[0]?.destinationId || cvRes?.rows?.[0]?.destinationid || null;

    const { result, wavesCleared, lootPenalty = 0 } = await runCaravanBattle(thread, party, partyClasses, db, guild, userId, false, destId, 1, null, caravanId).catch(err => {
        console.error('[AmbushCombat]', err);
        return { result: 'error', wavesCleared: 0, lootPenalty: 0 };
    });

    // Delete saved battle state regardless of outcome
    try { require('./caravan-state').deleteCaravanBattle(db, caravanId); } catch (_) {}

    if (result === 'win') {
        // Mark caravan as survived — trip continues with full rewards
        await safeExecute(db, `UPDATE user_caravans SET "attackResolved"=1 WHERE "id"=$1`, [caravanId]);
        await safeExecute(db,
            `UPDATE user_caravan_stats SET "ambush_survived"="ambush_survived"+1 WHERE "userID"=$1 AND "guildID"=$2`,
            [userId, guildId]);
        // Everyone (owner + guards) gets cumulative rewards
        const rewardRes = await distributePartyRewards(db, party, guildId, wavesCleared, lootPenalty);

        const ambDest = caravanConfig.destinations.find(d => d.id === destId) || {};
        const ambFolderName = DEST_IMAGE_MAP[destId] || 'gold_city/gold_city.png';
        const ambDestImgUrl = `${R2_BASE}/images/caravan/${ambFolderName}`;
        const winEmbed = new EmbedBuilder()
            .setColor(ambDest.color || '#00FF88')
            .setTitle('❖ تـم تـأمين الطريق بالكامـل')
            .setDescription('🐪 ستكمل القافلة رحلتها!')
            .setImage(ambDestImgUrl)
            .addFields(
                { name: '⚔️ الموجات', value: `${wavesCleared}/5`, inline: true },
                { name: '🎁 المكافآت', value: rewardRes.summary.map(s => `✶ ${s}`).join('\n') || '—', inline: false }
            );
        await thread.send({ embeds: [winEmbed] }).catch(() => {});

        await channel.send(`✅ <@${userId}> **نجح الدفاع عن قافلتك!** تكمل رحلتها بسلام.`).catch(() => {});
    } else {
        // Battle lost → apply 1-hour cooldown to owner
        await setCaravanCooldown(db, userId, guildId).catch(() => {});
        await safeExecute(db,
            `UPDATE user_caravan_stats SET "total_trips"="total_trips"+1 WHERE "userID"=$1 AND "guildID"=$2`,
            [userId, guildId]);
        await safeExecute(db, `DELETE FROM user_caravans WHERE "id"=$1`, [caravanId]);

        const reason = result === 'lose_caravan' ? '🐪 دُمِّرت القافلة!'
                     : result === 'lose_timeout' ? '⏰ انتهى وقت الاستراحة!'
                     : '☠️ سقط كل الحراس!';
        const ambDest = caravanConfig.destinations.find(d => d.id === destId) || {};
        const ambFolderName2 = DEST_IMAGE_MAP[destId] || 'gold_city/gold_city.png';
        const ambDestImgUrl = `${R2_BASE}/images/caravan/${ambFolderName2}`;
        const loseEmbed = new EmbedBuilder()
            .setColor(ambDest.color || '#FF4444')
            .setTitle('💀 فشلت الحراسة — القافلة نُهبت!')
            .setDescription(`${reason}\nضاعت جميع البضائع. انتهت الرحلة.\n⏳ كولداون ساعة واحدة قبل إرسال قافلة جديدة.`)
            .setImage(ambDestImgUrl);
        await thread.send({ embeds: [loseEmbed] }).catch(() => {});
        await channel.send(`💔 <@${userId}> **نُهبت قافلتك!** تم إلغاء الرحلة.`).catch(() => {});
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
    WAVE_REWARD_DELTAS,
    DESTINATION_ENEMIES,
    DEFAULT_ENEMIES,
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
