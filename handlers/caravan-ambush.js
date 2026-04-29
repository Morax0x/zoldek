'use strict';

const {
    EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
    StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
    ChannelType, ComponentType, MessageFlags
} = require('discord.js');

const { safeQuery, safeExecute, caravanConfig, EMOJI_MORA } = require('./caravan-core.js');
const { setupPlayers } = require('./dungeon/core/setup.js');
const { buildHpBar, applyDamageToPlayer, getSaudiDateIso } = require('./dungeon/utils.js');
const { handleSkillUsage } = require('./dungeon/skills.js');
const weaponCalculator = require('./combat/weapon-calculator.js');
const { buildSkillSelector, buildPotionSelector } = require('./dungeon/ui.js');

// ─── Constants ────────────────────────────────────────────────────────────────
const CARAVAN_HP_MAX   = 1000;
const GUARD_DAILY_LIMIT = 3;
const LOBBY_TIMEOUT_MS  = 5 * 60 * 1000;
const TURN_TIMEOUT_MS   = 45_000;
const AMBUSH_WINDOW_MS  = 30 * 60 * 1000;

const WAVE_ENEMIES = [
    { name: 'لصوص الطريق',       hp: 800,  atk: 30,  isBoss: false },
    { name: 'سراق محترفون',       hp: 1200, atk: 50,  isBoss: false },
    { name: 'محاربون متمردون',    hp: 1800, atk: 75,  isBoss: false },
    { name: 'قائد الغزاة',        hp: 2800, atk: 100, isBoss: false },
    { name: 'آسر القوافل',        hp: 5000, atk: 150, isBoss: true  },
];

// Cumulative: each wave entry is the DELTA reward for clearing that wave
const WAVE_REWARD_DELTAS = [
    { mora: 500,  chests: 1,  rep: 0 },
    { mora: 1000, chests: 2,  rep: 0 },
    { mora: 1500, chests: 3,  rep: 0 },
    { mora: 0,    chests: 4,  rep: 0 },
    { mora: 5000, chests: 10, rep: 2 },
];

// ─── Guard Daily Limit ────────────────────────────────────────────────────────
async function initGuardTable(db) {
    await safeExecute(db, `
        CREATE TABLE IF NOT EXISTS caravan_guard_logs (
            "userID"    TEXT NOT NULL,
            "guildID"   TEXT NOT NULL,
            "guardDate" TEXT NOT NULL,
            "count"     INTEGER DEFAULT 0,
            PRIMARY KEY ("userID","guildID","guardDate")
        )`, []);
}

async function checkGuardLimit(db, userId, guildId) {
    await initGuardTable(db);
    const today = getSaudiDateIso();
    const res = await safeQuery(db,
        `SELECT "count" FROM caravan_guard_logs WHERE "userID"=$1 AND "guildID"=$2 AND "guardDate"=$3`,
        [userId, guildId, today]);
    const count = Number(res.rows[0]?.count || 0);
    return { count, canJoin: count < GUARD_DAILY_LIMIT };
}

async function consumeGuardSlot(db, userId, guildId) {
    const today = getSaudiDateIso();
    await safeExecute(db, `
        INSERT INTO caravan_guard_logs ("userID","guildID","guardDate","count")
        VALUES ($1,$2,$3,1)
        ON CONFLICT ("userID","guildID","guardDate")
        DO UPDATE SET "count"=caravan_guard_logs.count+1`,
        [userId, guildId, today]);
}

// ─── UI ───────────────────────────────────────────────────────────────────────
function generateCaravanBattleEmbed(players, enemy, caravan, waveNum, log, actedPlayers = []) {
    const embed = new EmbedBuilder()
        .setColor('#FF6600')
        .setTitle(`⚔️ كمين القافلة | الموجة ${waveNum}/5`);

    const eBar = buildHpBar(enemy.hp, enemy.maxHp);
    embed.addFields({ name: `👹 **${enemy.name}**`, value: eBar, inline: false });

    const cvBar = buildHpBar(caravan.hp, caravan.maxHp);
    embed.addFields({ name: '🐪 **صحة القافلة**', value: cvBar, inline: false });

    const CLASS_MAP = {
        Leader: '👑 قائد', Tank: '🛡️ مدرع',
        Priest: '✨ كاهن', Mage: '🔮 ساحر', Summoner: '🐺 مستدعٍ'
    };
    const teamLines = players.map(p => {
        const acted  = actedPlayers.includes(p.id);
        const circle = p.isDead ? '💀' : acted ? '🔴' : '🟢';
        const cls    = CLASS_MAP[p.class] || p.class;
        const name   = p.isDead || acted ? `**${p.name}**` : `<@${p.id}>`;
        const hpLine = p.isDead ? 'سقط' : buildHpBar(p.hp, p.maxHp, p.shield);
        return `${circle} ${name} [${cls}]\n${hpLine}`;
    }).join('\n\n');
    embed.addFields({ name: '🛡️ فريق الحراسة', value: teamLines || '—', inline: false });

    const logText = log.slice(-6).join('\n') || 'بانتظار بدء المعركة...';
    embed.addFields({ name: '📜 أحداث المعركة', value: logText, inline: false });

    return embed;
}

function makeBattleRows(disabled = false) {
    const d = disabled;
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('cvb_atk').setLabel('هجوم').setEmoji('⚔️').setStyle(ButtonStyle.Danger).setDisabled(d),
            new ButtonBuilder().setCustomId('cvb_skill').setLabel('مهارة').setEmoji('✨').setStyle(ButtonStyle.Primary).setDisabled(d)
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('cvb_def').setLabel('دفاع').setEmoji('🛡️').setStyle(ButtonStyle.Secondary).setDisabled(d),
            new ButtonBuilder().setCustomId('cvb_heal').setLabel('جرعة').setEmoji('🧪').setStyle(ButtonStyle.Success).setDisabled(d)
        ),
    ];
}

// ─── Enemy AI ─────────────────────────────────────────────────────────────────
function selectEnemyTarget(enemy, players, caravan) {
    const alive = players.filter(p => !p.isDead);

    // Provoke / Taunt: Tank's "استفزاز" sets targetFocusId AND adds taunt effect
    const taunter = alive.find(p => p.effects.some(e => e.type === 'taunt' || e.type === 'titan'));
    if (taunter) return { type: 'player', target: taunter };

    if (enemy.targetFocusId) {
        const forced = alive.find(p => p.id === enemy.targetFocusId);
        if (forced) return { type: 'player', target: forced };
        enemy.targetFocusId = null;
    }

    // 30% chance to attack caravan
    if (caravan.hp > 0 && Math.random() < 0.30) {
        return { type: 'caravan', target: caravan };
    }

    if (!alive.length) return { type: 'caravan', target: caravan };

    // Priority: nearly-killable > priests > highest HP loss
    const sorted = [...alive].sort((a, b) => {
        const aScore = (a.class === 'Priest' ? 5 : 0) + (a.hp <= enemy.atk * 1.5 ? 10 : 0);
        const bScore = (b.class === 'Priest' ? 5 : 0) + (b.hp <= enemy.atk * 1.5 ? 10 : 0);
        return bScore - aScore;
    });
    return { type: 'player', target: sorted[0] };
}

// ─── Enemy Turn ───────────────────────────────────────────────────────────────
async function processEnemyTurn(enemy, players, caravan, waveNum, log, battleMsg, thread) {
    if (enemy.hp <= 0) return;
    if (!enemy.effects) enemy.effects = [];

    // DOT effects on enemy
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

    // Boss enrage at ≤30% HP
    if (enemy.isBoss && !enemy.enraged && enemy.hp < enemy.maxHp * 0.30) {
        enemy.enraged = true;
        enemy.atk = Math.floor(enemy.atk * 1.5);
        log.push(`💢 **${enemy.name}** غضب! (+50% هجوم)`);
    }

    const sel = selectEnemyTarget(enemy, players, caravan);
    const dmg = Math.floor(enemy.atk * (1 + waveNum * 0.03));

    if (sel.type === 'caravan') {
        caravan.hp = Math.max(0, caravan.hp - dmg);
        log.push(`🐪 **${enemy.name}** ضرب القافلة! (-${dmg} HP)`);
    } else {
        const t = sel.target;
        if (t && !t.isDead) {
            const finalDmg = t.defending ? Math.floor(dmg * 0.5) : dmg;
            const taken    = applyDamageToPlayer(t, finalDmg);
            log.push(`⚔️ **${enemy.name}** ضرب **${t.name}** (-${taken})`);
            if (t.hp <= 0 && !t.isDead) {
                t.hp = 0; t.isDead = true;
                log.push(`💀 **${t.name}** سقط!`);
                if (t.class === 'Priest') {
                    players.forEach(a => {
                        if (!a.isDead) a.hp = Math.min(a.maxHp, a.hp + Math.floor(a.maxHp * 0.20));
                    });
                    if (thread) await thread.send('✨ **سقط الكاهن وعالج الفريق (+20% HP)**').catch(() => {});
                }
            }
        }
    }

    if (enemy.targetFocusId) enemy.targetFocusId = null;
}

// ─── Guard Rewards ────────────────────────────────────────────────────────────
async function distributeGuardRewards(db, guards, guildId, wavesCleared) {
    let totalMora = 0, totalChests = 0, totalRep = 0;
    for (let w = 0; w < Math.min(wavesCleared, WAVE_REWARD_DELTAS.length); w++) {
        totalMora   += WAVE_REWARD_DELTAS[w].mora;
        totalChests += WAVE_REWARD_DELTAS[w].chests;
        totalRep    += WAVE_REWARD_DELTAS[w].rep;
    }

    const summary = [];
    for (const gid of guards) {
        if (totalMora > 0)
            await safeExecute(db,
                `UPDATE levels SET "mora"=CAST(COALESCE("mora",'0') AS BIGINT)+$1 WHERE "user"=$2 AND "guild"=$3`,
                [totalMora, gid, guildId]);
        if (totalChests > 0)
            await safeExecute(db,
                `INSERT INTO user_inventory ("guildID","userID","itemID","quantity") VALUES ($1,$2,'gacha_chest',$3)
                 ON CONFLICT ("guildID","userID","itemID") DO UPDATE SET "quantity"=user_inventory.quantity+$3`,
                [guildId, gid, totalChests]);
        if (totalRep > 0)
            await safeExecute(db,
                `INSERT INTO user_reputation ("userID","guildID","rep_points") VALUES ($1,$2,$3)
                 ON CONFLICT ("userID","guildID") DO UPDATE SET "rep_points"=user_reputation.rep_points+$3`,
                [gid, guildId, totalRep]);

        const parts = [];
        if (totalMora > 0)   parts.push(`${totalMora.toLocaleString()} ${EMOJI_MORA}`);
        if (totalChests > 0) parts.push(`${totalChests} 🎁`);
        if (totalRep > 0)    parts.push(`${totalRep} 🌟`);
        summary.push(`<@${gid}>: ${parts.join(' | ')}`);
    }
    return { totalMora, totalChests, totalRep, summary };
}

// ─── Core 5-Wave Battle ───────────────────────────────────────────────────────
async function runCaravanBattle(thread, party, partyClasses, db, hostId, client, guild) {
    const players = await setupPlayers(guild, party, partyClasses, db, null, null);
    if (!players.length) {
        await thread.send('❌ فشل في تحميل بيانات اللاعبين.').catch(() => {});
        return { result: 'error', wavesCleared: 0 };
    }

    const caravan = { hp: CARAVAN_HP_MAX, maxHp: CARAVAN_HP_MAX };
    let wavesCleared = 0;

    for (let w = 0; w < WAVE_ENEMIES.length; w++) {
        const def     = WAVE_ENEMIES[w];
        const waveNum = w + 1;
        const enemy   = {
            name: def.name, hp: def.hp, maxHp: def.hp,
            atk: def.atk, isBoss: def.isBoss,
            enraged: false, effects: [], frozen: false, targetFocusId: null,
        };

        // Reset per-wave player state
        players.forEach(p => {
            if (p.isDead) return;
            p.defending   = false;
            p.summon      = null;
            p.shield      = p.startingShield || 0;
            p.effects     = p.effects.filter(e =>
                ['poison','atk_buff','def_buff','burn','stun','taunt','titan','evasion','reflect','bleed'].includes(e.type)
            );
            for (const sid in p.skillCooldowns) if (p.skillCooldowns[sid] > 0) p.skillCooldowns[sid]--;
            if (p.special_cooldown > 0) p.special_cooldown--;
        });

        const log = [`⚔️ **الموجة ${waveNum}/5** — ظهر **${enemy.name}**! (HP: ${enemy.hp} | ATK: ${enemy.atk})`];
        let battleMsg;
        try {
            battleMsg = await thread.send({
                embeds: [generateCaravanBattleEmbed(players, enemy, caravan, waveNum, log)],
                components: makeBattleRows()
            });
        } catch { break; }

        let waveActive = true;
        let turnCount  = 0;

        while (waveActive) {
            const actedPlayers  = [];
            const processingSet = new Set();
            const ongoingRef    = { value: true };

            const collector = battleMsg.createMessageComponentCollector({
                filter: i => party.includes(i.user.id),
                time: 24 * 60 * 60 * 1000,
            });

            await new Promise(resolve => {
                const turnTimeout = setTimeout(async () => {
                    const afk = players.filter(p => !p.isDead && !actedPlayers.includes(p.id));
                    for (const p of afk) {
                        p.skipCount = (p.skipCount || 0) + 1;
                        if (p.skipCount >= 5) {
                            p.hp = 0; p.isDead = true;
                            log.push(`☠️ **${p.name}** ابتلعه الكمين بسبب الخمول!`);
                        } else {
                            actedPlayers.push(p.id);
                            log.push(`⏩ تخطي دور **${p.name}** (تحذير ${p.skipCount}/5)`);
                        }
                    }
                    if (players.every(p => p.isDead)) { ongoingRef.value = false; collector.stop('all_dead'); return; }
                    collector.stop('turn_end');
                }, TURN_TIMEOUT_MS);

                collector.on('collect', async i => {
                    const pid = i.user.id;
                    const p   = players.find(pl => pl.id === pid);
                    if (!p || p.isDead || actedPlayers.includes(pid)) {
                        return i.deferUpdate().catch(() => {});
                    }
                    if (processingSet.has(pid)) return i.deferUpdate().catch(() => {});
                    processingSet.add(pid);
                    await i.deferUpdate().catch(() => {});

                    try {
                        const cid = i.customId;

                        if (cid === 'cvb_atk') {
                            const res    = weaponCalculator.executeWeaponAttack(p, enemy, false);
                            const dmgDlt = Math.max(0, res.damage || 0);
                            p.totalDamage = (p.totalDamage || 0) + dmgDlt;
                            log.push(res.log || `⚔️ **${p.name}** هاجم (-${dmgDlt})`);
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
                            let   skillObj = { id: skillId, name: 'مهارة', effectValue: 0, level: 1 };
                            if (p.skills?.[skillId]) skillObj = { ...p.skills[skillId] };

                            const hpBefore = enemy.hp;
                            const res = handleSkillUsage(p, { ...skillObj, id: skillId }, enemy, log, thread, players);
                            const dmgDlt = Math.max(0, hpBefore - enemy.hp);
                            if (dmgDlt > 0) p.totalDamage = (p.totalDamage || 0) + dmgDlt;

                            if (res?.error) {
                                await sel.followUp({ content: res.error, flags: [MessageFlags.Ephemeral] }).catch(() => {});
                                processingSet.delete(pid); return;
                            }
                            await sel.editReply({ content: `✅ تم: ${res?.name || skillObj.name}`, components: [] }).catch(() => {});
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
                                let actionMsg = '';
                                if (potId === 'potion_heal') {
                                    p.hp = Math.min(p.maxHp, p.hp + Math.floor(p.maxHp * 0.5));
                                    actionMsg = '🧪 استعاد 50% HP!';
                                } else if (potId === 'potion_time') {
                                    p.special_cooldown = 0; p.skillCooldowns = {};
                                    actionMsg = '⏳ أعاد شحن مهاراته!';
                                } else if (potId === 'potion_titan') {
                                    p.maxHp *= 2; p.hp = p.maxHp;
                                    p.effects.push({ type: 'titan', floors: 5 });
                                    enemy.targetFocusId = p.id;
                                    actionMsg = '🔥 تحول لعملاق!';
                                }
                                if (actionMsg) log.push(`**${p.name}**: ${actionMsg}`);
                            }
                            await pSel.editReply({ content: '✅ تم', components: [] }).catch(() => {});
                            actedPlayers.push(pid); p.skipCount = 0;
                        }

                        // Check immediate win/loss after player action
                        if (enemy.hp <= 0) {
                            enemy.hp = 0; ongoingRef.value = false;
                            clearTimeout(turnTimeout); collector.stop('enemy_dead'); return;
                        }
                        if (players.every(p2 => p2.isDead)) {
                            ongoingRef.value = false;
                            clearTimeout(turnTimeout); collector.stop('all_dead'); return;
                        }

                        await battleMsg.edit({
                            embeds: [generateCaravanBattleEmbed(players, enemy, caravan, waveNum, log, actedPlayers)],
                            components: makeBattleRows()
                        }).catch(() => {});

                        const aliveCount = players.filter(pl => !pl.isDead).length;
                        if (actedPlayers.length >= aliveCount) {
                            clearTimeout(turnTimeout); collector.stop('turn_end');
                        }
                    } catch (err) {
                        console.error('[CVBattle player]', err);
                    } finally {
                        processingSet.delete(pid);
                    }
                });

                collector.on('end', () => { clearTimeout(turnTimeout); resolve(); });
            });

            // Post-player-turn checks
            if (!ongoingRef.value || enemy.hp <= 0) {
                waveActive = false;
                await battleMsg.edit({
                    content: `**💀 سقط ${enemy.name}!**`,
                    embeds: [generateCaravanBattleEmbed(players, enemy, caravan, waveNum, log)],
                    components: []
                }).catch(() => {});
                break;
            }
            if (players.every(p => p.isDead)) {
                await battleMsg.edit({ content: '☠️ سقط الفريق بالكامل!', components: [] }).catch(() => {});
                return { result: 'lose_players', wavesCleared };
            }

            // Enemy turn
            turnCount++;
            await processEnemyTurn(enemy, players, caravan, waveNum, log, battleMsg, thread);

            if (caravan.hp <= 0) {
                await battleMsg.edit({ content: '🐪 **دُمِّرت القافلة!**', components: [] }).catch(() => {});
                return { result: 'lose_caravan', wavesCleared };
            }
            if (players.every(p => p.isDead)) {
                await battleMsg.edit({ content: '☠️ سقط الفريق!', components: [] }).catch(() => {});
                return { result: 'lose_players', wavesCleared };
            }
            if (enemy.hp <= 0) {
                waveActive = false;
                await battleMsg.edit({
                    content: `**💀 سقط ${enemy.name}!**`,
                    embeds: [generateCaravanBattleEmbed(players, enemy, caravan, waveNum, log)],
                    components: []
                }).catch(() => {});
                break;
            }

            await battleMsg.edit({
                embeds: [generateCaravanBattleEmbed(players, enemy, caravan, waveNum, log)],
                components: makeBattleRows()
            }).catch(() => {});
        }

        wavesCleared = waveNum;
        if (waveNum < WAVE_ENEMIES.length) {
            await thread.send(`✅ **الموجة ${waveNum} انتهت!** استعدوا للموجة القادمة...`).catch(() => {});
            await new Promise(r => setTimeout(r, 2500));
        }
    }

    return { result: 'win', wavesCleared };
}

// ─── Class options helper ─────────────────────────────────────────────────────
const CLASS_OPTIONS = [
    { v: 'Tank',     l: 'المدرع',   e: '🛡️' },
    { v: 'Priest',   l: 'الكاهن',   e: '✨' },
    { v: 'Mage',     l: 'الساحر',   e: '🔮' },
    { v: 'Summoner', l: 'المستدعي', e: '🐺' },
];

function buildLobbyEmbed(host, party, partyClasses, destConfig) {
    const CLASS_MAP = { Leader:'👑 قائد', Tank:'🛡️ مدرع', Priest:'✨ كاهن', Mage:'🔮 ساحر', Summoner:'🐺 مستدعٍ' };
    const memberList = party.map((id, i) =>
        `\`${i+1}.\` <@${id}> — **${CLASS_MAP[partyClasses.get(id)] || partyClasses.get(id)}**`
    ).join('\n');
    return new EmbedBuilder()
        .setColor('#FFD700')
        .setTitle(`🛡️ لوبي تأمين القافلة — ${destConfig.emoji} ${destConfig.name}`)
        .setDescription(
            `القائد: <@${host.id}>\n` +
            `عليكم تصفية **5 موجات** من قطاع الطرق قبل انطلاق القافلة!\n\n` +
            `👥 **الفريق (${party.length}/3):**\n${memberList}\n\n` +
            `⚠️ الحراس (غير المالك) محدودون بـ **${GUARD_DAILY_LIMIT} مرات يومياً**`
        );
}

// ─── Direct Escort Lobby ──────────────────────────────────────────────────────
async function startCaravanEscortLobby(channel, host, guild, db, client, destConfig) {
    const guildId       = guild.id;
    const partyClasses  = new Map([[host.id, 'Leader']]);
    const party         = [host.id];

    const lobbyRow = () => new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('cvl_join').setLabel('انضمام كحارس').setStyle(ButtonStyle.Success).setEmoji('➕'),
        new ButtonBuilder().setCustomId('cvl_start').setLabel('انطلاق').setStyle(ButtonStyle.Primary).setEmoji('⚔️'),
        new ButtonBuilder().setCustomId('cvl_cancel').setLabel('إلغاء').setStyle(ButtonStyle.Danger).setEmoji('✖️')
    );

    const msg = await channel.send({
        embeds: [buildLobbyEmbed(host, party, partyClasses, destConfig)],
        components: [lobbyRow()]
    }).catch(() => null);
    if (!msg) return { success: false, cancelled: true };

    const collector = msg.createMessageComponentCollector({ time: LOBBY_TIMEOUT_MS });

    const reason = await new Promise(res => {
        collector.on('collect', async i => {
            try {
                if (i.customId === 'cvl_join') {
                    if (i.user.id === host.id)
                        return i.reply({ content: '👑 أنت القائد بالفعل.', flags: [MessageFlags.Ephemeral] });
                    if (party.length >= 3)
                        return i.reply({ content: '🚫 الفريق ممتلئ (3 كحد أقصى).', flags: [MessageFlags.Ephemeral] });
                    if (party.includes(i.user.id))
                        return i.reply({ content: '✅ أنت منضم بالفعل.', flags: [MessageFlags.Ephemeral] });

                    const lim = await checkGuardLimit(db, i.user.id, guildId);
                    if (!lim.canJoin)
                        return i.reply({ content: `🚫 بلغت الحد اليومي (${GUARD_DAILY_LIMIT} مرات). حاول غداً!`, flags: [MessageFlags.Ephemeral] });

                    const taken = Array.from(partyClasses.values()).filter(c => c !== 'Leader');
                    const opts  = CLASS_OPTIONS.filter(o => !taken.includes(o.v));
                    if (!opts.length)
                        return i.reply({ content: '🚫 جميع التخصصات مأخوذة.', flags: [MessageFlags.Ephemeral] });

                    const sRow = new ActionRowBuilder().addComponents(
                        new StringSelectMenuBuilder().setCustomId('cvl_cls').setPlaceholder('اختر تخصصك...')
                            .addOptions(opts.map(o => new StringSelectMenuOptionBuilder().setLabel(o.l).setValue(o.v).setEmoji(o.e)))
                    );
                    const sMsg = await i.reply({ content: '🛡️ اختر تخصصك:', components: [sRow], flags: [MessageFlags.Ephemeral], fetchReply: true });
                    const sI   = await sMsg.awaitMessageComponent({ filter: x => x.user.id === i.user.id, time: 20000, componentType: ComponentType.StringSelect }).catch(() => null);
                    if (!sI) return;
                    await sI.deferUpdate().catch(() => {});
                    const chosen = sI.values[0];
                    if (Array.from(partyClasses.values()).includes(chosen))
                        return sI.editReply({ content: '🚫 سبقك به غيرك!', components: [] }).catch(() => {});
                    partyClasses.set(i.user.id, chosen);
                    if (!party.includes(i.user.id)) party.push(i.user.id);
                    await sI.editReply({ content: `✅ انضممت كـ **${chosen}**`, components: [] }).catch(() => {});
                    await msg.edit({ embeds: [buildLobbyEmbed(host, party, partyClasses, destConfig)] }).catch(() => {});

                } else if (i.customId === 'cvl_start') {
                    if (i.user.id !== host.id)
                        return i.reply({ content: '⛔ القائد فقط.', flags: [MessageFlags.Ephemeral] });
                    await i.deferUpdate().catch(() => {});
                    collector.stop('start');

                } else if (i.customId === 'cvl_cancel') {
                    if (i.user.id !== host.id)
                        return i.reply({ content: '⛔ القائد فقط.', flags: [MessageFlags.Ephemeral] });
                    await i.deferUpdate().catch(() => {});
                    collector.stop('cancel');
                }
            } catch (err) { console.error('[EscortLobby]', err); }
        });
        collector.on('end', (_, r) => res(r));
    });

    if (reason !== 'start') {
        await msg.edit({ content: '❌ تم إلغاء لوبي التأمين.', embeds: [], components: [] }).catch(() => {});
        return { success: false, cancelled: true };
    }

    // Consume guard slots for non-owners
    const guards = party.filter(id => id !== host.id);
    for (const gid of guards) await consumeGuardSlot(db, gid, guildId).catch(() => {});

    await msg.edit({ content: `✅ الفريق جاهز! جاري فتح ساحة المعركة...`, embeds: [], components: [] }).catch(() => {});

    let thread;
    try {
        thread = await channel.threads.create({
            name: `🛡️-تأمين-${destConfig.name.replace(/ /g, '-')}`,
            autoArchiveDuration: 60,
            type: ChannelType.PublicThread,
        });
        for (const uid of party) await thread.members.add(uid).catch(() => {});
        await thread.send(`🔔 **انتبهوا!** قطاع الطرق يكمنون! صفّوا 5 موجات لإيصال القافلة بسلام.`).catch(() => {});
    } catch (err) {
        console.error('[EscortThread]', err);
        return { success: false, cancelled: false };
    }

    const { result, wavesCleared } = await runCaravanBattle(thread, party, partyClasses, db, host.id, client, guild);

    if (result === 'win') {
        const rewardRes = await distributeGuardRewards(db, guards, guild.id, wavesCleared);
        await thread.send({
            embeds: [new EmbedBuilder()
                .setColor('#00FF88')
                .setTitle('🎉 انتصار! الطريق آمن!')
                .setDescription(
                    `**مكافآت الحراس (${wavesCleared} موجة):**\n` +
                    (rewardRes.summary.join('\n') || '— لا يوجد حراس خارجيون —') +
                    `\n\n🐪 ستنطلق القافلة الآن بأمان!`
                )
            ]
        }).catch(() => {});
        setTimeout(() => thread.delete().catch(() => {}), 12000);
        return { success: true };
    } else {
        const reason2 = result === 'lose_caravan' ? '🐪 دُمِّرت القافلة!' : '☠️ سقط كل الحراس!';
        await thread.send({
            embeds: [new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('💀 فشل التأمين!')
                .setDescription(`**${reason2}**\nلم تُرسَل القافلة. لن يُخصَم منك شيء.`)
            ]
        }).catch(() => {});
        setTimeout(() => thread.delete().catch(() => {}), 12000);
        return { success: false, cancelled: false };
    }
}

// ─── Surprise Ambush Notification ────────────────────────────────────────────
async function sendAmbushNotification(client, db, caravan) {
    const userId    = caravan.userid  || caravan.userID;
    const guildId   = caravan.guildid || caravan.guildID;
    const caravanId = caravan.id;
    const destId    = caravan.destinationid || caravan.destinationId;
    const dest      = caravanConfig.destinations.find(d => d.id === destId);
    if (!dest) return;

    const settingsRes = await safeQuery(db, `SELECT "casinoChannelID" FROM settings WHERE "guild"=$1`, [guildId]);
    const casinoId    = settingsRes.rows[0]?.casinochannelid || settingsRes.rows[0]?.casinoChannelID;
    if (!casinoId) return;

    const guild   = client.guilds.cache.get(guildId);
    const channel = guild?.channels.cache.get(casinoId);
    if (!channel) return;

    const embed = new EmbedBuilder()
        .setColor('#FF4444')
        .setTitle('⚔️ تحذير — قافلتك تتعرض للكمين!')
        .setDescription(
            `<@${userId}>\n\n` +
            `🗺️ **الوجهة:** ${dest.emoji} ${dest.name}\n\n` +
            `قطاع الطرق يكمنون لقافلتك الآن!\n\n` +
            `🛡️ **تنظيم حراسة** — قاتل 5 موجات وأنقذ البضاعة كاملةً\n` +
            `💰 **دفع رشوة** — ادفع واحتفظ بـ**15%** فقط من المكافآت\n\n` +
            `⏳ لديك **30 دقيقة** للرد — وإلا ستُدمَّر القافلة!`
        ).setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`cv_amb_guard_${caravanId}`).setLabel('🛡️ تنظيم حراسة').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`cv_amb_bribe_${caravanId}`).setLabel('💰 دفع رشوة للهروب').setStyle(ButtonStyle.Danger)
    );

    let attackMsg;
    try { attackMsg = await channel.send({ content: `<@${userId}>`, embeds: [embed], components: [row] }); }
    catch { return; }

    await safeExecute(db,
        `UPDATE user_caravans SET "guardMessageId"=$1,"attackChannelId"=$2 WHERE "id"=$3`,
        [attackMsg.id, casinoId, caravanId]);

    const collector = attackMsg.createMessageComponentCollector({
        filter: i => [`cv_amb_guard_${caravanId}`, `cv_amb_bribe_${caravanId}`].includes(i.customId),
        time: AMBUSH_WINDOW_MS,
        max: 1,
    });

    if (!client.caravanAttackCollectors) client.caravanAttackCollectors = new Map();
    client.caravanAttackCollectors.set(String(caravanId), collector);

    collector.on('collect', async interaction => {
        // ── Bribe (owner only) ──────────────────────────────────────────────
        if (interaction.customId === `cv_amb_bribe_${caravanId}`) {
            if (interaction.user.id !== userId)
                return interaction.reply({ content: '⛔ فقط مالك القافلة يستطيع الرشوة!', flags: [MessageFlags.Ephemeral] });

            await interaction.deferUpdate().catch(() => {});
            await safeExecute(db,
                `UPDATE user_caravans SET "attackResolved"=1,"rewardMultiplier"=0.15 WHERE "id"=$1`,
                [caravanId]);
            await attackMsg.edit({
                content: `💰 <@${userId}> دفعت الرشوة! ستصل قافلتك بـ **15%** فقط من المكافآت.`,
                embeds: [], components: []
            }).catch(() => {});
            collector.stop('bribed');
            return;
        }

        // ── Guard Lobby ─────────────────────────────────────────────────────
        await interaction.deferUpdate().catch(() => {});
        await attackMsg.edit({ components: [] }).catch(() => {});

        const partyClasses = new Map([[userId, 'Leader']]);
        const party        = [userId];

        const getLobbyEmbed = () => new EmbedBuilder()
            .setColor('#FF6600')
            .setTitle('⚔️ لوبي الدفاع عن القافلة!')
            .setDescription(
                `القائد: <@${userId}>\n` +
                `**5 موجات** من اللصوص تنتظركم!\n\n` +
                `👥 **الفريق (${party.length}/3):**\n` +
                party.map((id, i) => {
                    const m = { Leader:'👑 قائد', Tank:'🛡️ مدرع', Priest:'✨ كاهن', Mage:'🔮 ساحر', Summoner:'🐺 مستدعٍ' };
                    return `\`${i+1}.\` <@${id}> — **${m[partyClasses.get(id)] || '?'}**`;
                }).join('\n')
            );

        const lRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`cva_join_${caravanId}`).setLabel('انضمام').setStyle(ButtonStyle.Success).setEmoji('➕'),
            new ButtonBuilder().setCustomId(`cva_start_${caravanId}`).setLabel('انطلاق').setStyle(ButtonStyle.Primary).setEmoji('⚔️'),
            new ButtonBuilder().setCustomId(`cva_cancel_${caravanId}`).setLabel('إلغاء').setStyle(ButtonStyle.Danger).setEmoji('✖️')
        );

        const lobbyMsg = await channel.send({ content: `<@${userId}>`, embeds: [getLobbyEmbed()], components: [lRow] }).catch(() => null);
        if (!lobbyMsg) {
            await safeExecute(db,
                `UPDATE user_caravans SET "attackResolved"=-1,"rewardMultiplier"=0,"status"='completed' WHERE "id"=$1`,
                [caravanId]);
            return;
        }

        const lCollector = lobbyMsg.createMessageComponentCollector({ time: 5 * 60 * 1000 });
        const lReason    = await new Promise(res => {
            lCollector.on('collect', async li => {
                try {
                    if (li.customId === `cva_join_${caravanId}`) {
                        if (li.user.id === userId)
                            return li.reply({ content: '👑 أنت القائد.', flags: [MessageFlags.Ephemeral] });
                        if (party.length >= 3)
                            return li.reply({ content: '🚫 الفريق ممتلئ.', flags: [MessageFlags.Ephemeral] });
                        if (party.includes(li.user.id))
                            return li.reply({ content: '✅ أنت منضم.', flags: [MessageFlags.Ephemeral] });

                        const lim = await checkGuardLimit(db, li.user.id, guildId);
                        if (!lim.canJoin)
                            return li.reply({ content: `🚫 بلغت الحد اليومي (${GUARD_DAILY_LIMIT} مرات).`, flags: [MessageFlags.Ephemeral] });

                        const taken = Array.from(partyClasses.values()).filter(c => c !== 'Leader');
                        const opts  = CLASS_OPTIONS.filter(o => !taken.includes(o.v));
                        if (!opts.length)
                            return li.reply({ content: '🚫 جميع التخصصات مأخوذة.', flags: [MessageFlags.Ephemeral] });

                        const sRow = new ActionRowBuilder().addComponents(
                            new StringSelectMenuBuilder().setCustomId('cva_cls').setPlaceholder('اختر تخصصك...')
                                .addOptions(opts.map(o => new StringSelectMenuOptionBuilder().setLabel(o.l).setValue(o.v).setEmoji(o.e)))
                        );
                        const sMsg = await li.reply({ content: '🛡️ اختر تخصصك:', components: [sRow], flags: [MessageFlags.Ephemeral], fetchReply: true });
                        const sI   = await sMsg.awaitMessageComponent({ filter: x => x.user.id === li.user.id, time: 20000, componentType: ComponentType.StringSelect }).catch(() => null);
                        if (!sI) return;
                        await sI.deferUpdate().catch(() => {});
                        const chosen = sI.values[0];
                        if (Array.from(partyClasses.values()).includes(chosen))
                            return sI.editReply({ content: '🚫 التخصص أُخذ!', components: [] }).catch(() => {});
                        partyClasses.set(li.user.id, chosen);
                        if (!party.includes(li.user.id)) party.push(li.user.id);
                        await sI.editReply({ content: `✅ انضممت كـ **${chosen}**`, components: [] }).catch(() => {});
                        await lobbyMsg.edit({ embeds: [getLobbyEmbed()] }).catch(() => {});

                    } else if (li.customId === `cva_start_${caravanId}`) {
                        if (li.user.id !== userId)
                            return li.reply({ content: '⛔ القائد فقط.', flags: [MessageFlags.Ephemeral] });
                        await li.deferUpdate().catch(() => {});
                        lCollector.stop('start');

                    } else if (li.customId === `cva_cancel_${caravanId}`) {
                        if (li.user.id !== userId)
                            return li.reply({ content: '⛔ القائد فقط.', flags: [MessageFlags.Ephemeral] });
                        await li.deferUpdate().catch(() => {});
                        lCollector.stop('cancel');
                    }
                } catch (err) { console.error('[AmbushLobby]', err); }
            });
            lCollector.on('end', (_, r) => res(r));
        });

        if (lReason !== 'start') {
            await lobbyMsg.edit({ content: '❌ لم يتم تنظيم حراسة — القافلة نُهبت!', embeds: [], components: [] }).catch(() => {});
            await safeExecute(db,
                `UPDATE user_caravans SET "attackResolved"=-1,"rewardMultiplier"=0,"status"='completed' WHERE "id"=$1`,
                [caravanId]);
            await channel.send(`💔 <@${userId}> **نُهبت قافلتك!** لم يُنظَّم دفاع في الوقت المحدد.`).catch(() => {});
            return;
        }

        // Consume guard slots
        const guards = party.filter(id => id !== userId);
        for (const gid of guards) await consumeGuardSlot(db, gid, guildId).catch(() => {});
        await lobbyMsg.edit({ content: '✅ الفريق جاهز! جاري فتح ساحة المعركة...', embeds: [], components: [] }).catch(() => {});

        // Create thread and run battle
        let thread;
        try {
            thread = await channel.threads.create({
                name: `⚔️-دفاع-عن-القافلة`,
                autoArchiveDuration: 60,
                type: ChannelType.PublicThread,
            });
            for (const uid of party) await thread.members.add(uid).catch(() => {});
            await thread.send('⚔️ **قطاع الطرق شنوا هجومهم! قاتلوا لإنقاذ القافلة!**').catch(() => {});
        } catch (err) {
            console.error('[AmbushThread]', err);
            await safeExecute(db,
                `UPDATE user_caravans SET "attackResolved"=-1,"rewardMultiplier"=0,"status"='completed' WHERE "id"=$1`,
                [caravanId]);
            await channel.send(`❌ <@${userId}> فشل في إنشاء غرفة المعركة — القافلة ضاعت.`).catch(() => {});
            return;
        }

        const { result, wavesCleared } = await runCaravanBattle(thread, party, partyClasses, db, userId, client, guild);

        if (result === 'win') {
            await safeExecute(db,
                `UPDATE user_caravans SET "attackResolved"=1 WHERE "id"=$1`,
                [caravanId]);
            const rewardRes = await distributeGuardRewards(db, guards, guildId, wavesCleared);
            await thread.send({
                embeds: [new EmbedBuilder()
                    .setColor('#00FF88')
                    .setTitle('🎉 نجحت الحراسة! القافلة آمنة!')
                    .setDescription(
                        `**مكافآت الحراس (${wavesCleared} موجة):**\n` +
                        (rewardRes.summary.join('\n') || '— لا حراس خارجيون —') +
                        `\n\n🐪 ستكمل القافلة رحلتها بمكافآت كاملة.`
                    )
                ]
            }).catch(() => {});
        } else {
            // Caravan destroyed — delete record immediately
            await safeExecute(db,
                `UPDATE user_caravan_stats SET "total_trips"="total_trips"+1 WHERE "userID"=$1 AND "guildID"=$2`,
                [userId, guildId]);
            await safeExecute(db, `DELETE FROM user_caravans WHERE "id"=$1`, [caravanId]);

            const reason3 = result === 'lose_caravan' ? '🐪 دُمِّرت القافلة!' : '☠️ سقط كل الحراس!';
            await thread.send({
                embeds: [new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('💀 فشلت الحراسة — القافلة نُهبت!')
                    .setDescription(`**${reason3}**\nضاعت جميع البضائع. انتهت الرحلة.`)
                ]
            }).catch(() => {});
            await channel.send(`💔 <@${userId}> **نُهبت قافلتك** وأُعلن عن خسارة الرحلة!`).catch(() => {});
        }

        setTimeout(() => thread.delete().catch(() => {}), 12000);
        collector.stop('user');
    });

    collector.on('end', async (_, reason) => {
        client.caravanAttackCollectors?.delete(String(caravanId));
        if (['user', 'bribed'].includes(reason)) return;
        // Timeout — caravan destroyed
        await safeExecute(db,
            `UPDATE user_caravan_stats SET "total_trips"="total_trips"+1 WHERE "userID"=$1 AND "guildID"=$2`,
            [userId, guildId]);
        await safeExecute(db, `DELETE FROM user_caravans WHERE "id"=$1 AND "attackResolved"=0`, [caravanId]);
        await attackMsg.edit({
            content: `💀 <@${userId}> لم تستجب! القطاع دمروا قافلتك بالكامل.`,
            embeds: [], components: []
        }).catch(() => {});
    });
}

// ─── Final Exports ────────────────────────────────────────────────────────────
module.exports = {
    initGuardTable,
    checkGuardLimit,
    consumeGuardSlot,
    generateCaravanBattleEmbed,
    makeBattleRows,
    selectEnemyTarget,
    processEnemyTurn,
    distributeGuardRewards,
    runCaravanBattle,
    startCaravanEscortLobby,
    sendAmbushNotification,
    WAVE_ENEMIES,
    WAVE_REWARD_DELTAS,
    CARAVAN_HP_MAX,
    GUARD_DAILY_LIMIT,
};
