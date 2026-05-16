'use strict';

const { applyDamageToPlayer } = require('../dungeon/utils.js');

function getAlive(players) {
    return players.filter(p => !p.isDead);
}

function getLowestHp(players) {
    const alive = getAlive(players);
    if (!alive.length) return null;
    return alive.sort((a, b) => a.hp - b.hp)[0];
}

function getHighestAtk(players) {
    const alive = getAlive(players);
    if (!alive.length) return null;
    return alive.sort((a, b) => (b.atk || 0) - (a.atk || 0))[0];
}

function getRandomTarget(players) {
    const alive = getAlive(players);
    if (!alive.length) return null;
    return alive[Math.floor(Math.random() * alive.length)];
}

function dealDamage(target, amount) {
    if (!target) return 0;
    const hpBefore = target.hp;
    const taken = applyDamageToPlayer(target, Math.floor(amount));
    if (hpBefore - taken <= 0) { target.hp = 0; target.isDead = true; }
    return taken;
}

const BANDIT_SKILLS = {

    // ======================================================================
    // 🏜️ Gold City — قطاع طرق الصحراء
    // ======================================================================

    'صعلوك البيداء': {
        name: 'زوبعة رملية',
        emoji: '🌪️',
        chance: 0.25,
        execute: (enemy, players, caravan, log) => {
            players.forEach(p => {
                if (!p.isDead) {
                    dealDamage(p, enemy.atk * 0.8);
                    if (Math.random() < 0.5) p.effects.push({ type: 'blind', val: 0.3, turns: 2 });
                }
            });
            log.push(`🌪️ **${enemy.name}** أثار زوبعة رملية! (ضرر + عمى)`);
        }
    },

    'مرتزق الرمال': {
        name: 'انقضاض الكمين',
        emoji: '⚡',
        chance: 0.3,
        execute: (enemy, players, caravan, log) => {
            const target = getLowestHp(players);
            if (target) {
                const dmg = dealDamage(target, enemy.atk * 1.5);
                log.push(`⚡ **${enemy.name}** انقض على **${target.name}**! (-${dmg})`);
            }
        }
    },

    'عقرب الكثبان': {
        name: 'سم قاتل',
        emoji: '🦂',
        chance: 0.3,
        execute: (enemy, players, caravan, log) => {
            const target = getRandomTarget(players);
            if (target) {
                dealDamage(target, enemy.atk * 0.8);
                target.effects.push({ type: 'poison', val: Math.floor(enemy.atk * 0.3), turns: 3 });
                log.push(`🦂 **${enemy.name}** حقن **${target.name}** بسم قاتل!`);
            }
        }
    },

    'سفاح القوافل': {
        name: 'نهب الحمولة',
        emoji: '💰',
        chance: 0.25,
        execute: (enemy, players, caravan, log) => {
            if (caravan.hp > 0) {
                const dmg = Math.floor(enemy.atk * 1.2);
                caravan.hp = Math.max(0, caravan.hp - dmg);
                const heal = Math.floor(enemy.maxHp * 0.05);
                enemy.hp = Math.min(enemy.maxHp, enemy.hp + heal);
                log.push(`💰 **${enemy.name}** نهب القافلة! (-${dmg} القافلة، +${heal} استرداد)`);
            }
        }
    },

    'طاغية المهجر': {
        name: 'لهيب الصحراء',
        emoji: '🔥',
        chance: 0.2,
        execute: (enemy, players, caravan, log) => {
            players.forEach(p => {
                if (!p.isDead) {
                    dealDamage(p, enemy.atk * 1.3);
                    if (Math.random() < 0.6) p.effects.push({ type: 'burn', val: Math.floor(enemy.atk * 0.2), turns: 3 });
                }
            });
            log.push(`🔥 **${enemy.name}** أطلق لهيب الصحراء الحارق!`);
        }
    },

    // ======================================================================
    // 🏛️ Imperial Capital — قطاع طرق المدينة
    // ======================================================================

    'لص الازقة': {
        name: 'هجوم مباغت',
        emoji: '🗡️',
        chance: 0.3,
        execute: (enemy, players, caravan, log) => {
            const target = getRandomTarget(players);
            if (target) {
                dealDamage(target, enemy.atk * 1.2);
                target.effects.push({ type: 'stun', val: 1, turns: 1 });
                log.push(`🗡️ **${enemy.name}** باغت **${target.name}** وشل حركته!`);
            }
        }
    },

    'خنجر غادر': {
        name: 'جرح نازف',
        emoji: '🩸',
        chance: 0.3,
        execute: (enemy, players, caravan, log) => {
            const target = getRandomTarget(players);
            if (target) {
                const bleedVal = Math.floor(enemy.atk * 0.5);
                dealDamage(target, enemy.atk);
                target.effects.push({ type: 'bleed', val: bleedVal, turns: 3 });
                log.push(`🩸 **${enemy.name}** شق **${target.name}** بجرح عميق! (نزيف ${bleedVal}/دور)`);
            }
        }
    },

    'فارس ساقط': {
        name: 'درع مثلم',
        emoji: '🛡️',
        chance: 0.25,
        execute: (enemy, players, caravan, log) => {
            const heal = Math.floor(enemy.maxHp * 0.08);
            enemy.hp = Math.min(enemy.maxHp, enemy.hp + heal);
            enemy.atk = Math.floor(enemy.atk * 1.1);
            log.push(`🛡️ **${enemy.name}** رفع درعه المعدني! (+${heal} HP، +10% هجوم)`);
        }
    },

    'قاطع الطريق': {
        name: 'قطع الطريق',
        emoji: '🔪',
        chance: 0.25,
        execute: (enemy, players, caravan, log) => {
            const target = getHighestAtk(players);
            if (target) {
                const dmg = dealDamage(target, enemy.atk * 1.6);
                log.push(`🔪 **${enemy.name}** استهدف **${target.name}** بضربة قاضية! (-${dmg})`);
            }
        }
    },

    'سيد الظلال': {
        name: 'خنجر مسموم',
        emoji: '☠️',
        chance: 0.2,
        execute: (enemy, players, caravan, log) => {
            const target = getHighestAtk(players);
            if (target) {
                const dmg = dealDamage(target, enemy.atk * 2.0);
                target.effects.push({ type: 'poison', val: Math.floor(enemy.atk * 0.3), turns: 3 });
                log.push(`☠️ **سيد الظلال** طعن **${target.name}** بخنجر مسموم! (-${dmg})`);
            }
        }
    },

    // ======================================================================
    // 🔮 Magic Academy — قطاع طرق السحر
    // ======================================================================

    'تلميذ مارق': {
        name: 'قذيفة سحرية',
        emoji: '🔮',
        chance: 0.3,
        execute: (enemy, players, caravan, log) => {
            const target = getRandomTarget(players);
            if (target) {
                dealDamage(target, enemy.atk * 1.3);
                if (Math.random() < 0.4) target.effects.push({ type: 'burn', val: Math.floor(enemy.atk * 0.1), turns: 2 });
                log.push(`🔮 **${enemy.name}** أطلق قذيفة سحرية على **${target.name}**!`);
            }
        }
    },

    'ناثر الوهم': {
        name: 'وهم مخيف',
        emoji: '👻',
        chance: 0.25,
        execute: (enemy, players, caravan, log) => {
            const target = getRandomTarget(players);
            if (target) {
                target.effects.push({ type: 'confusion', val: 0.4, turns: 2 });
                log.push(`👻 **${enemy.name}** بث وهماً مخيفاً في عقل **${target.name}**!`);
            }
        }
    },

    'سالب الارواح': {
        name: 'امتصاص الروح',
        emoji: '💀',
        chance: 0.25,
        execute: (enemy, players, caravan, log) => {
            const target = getRandomTarget(players);
            if (target) {
                const taken = dealDamage(target, enemy.atk * 1.3);
                const heal = Math.floor(taken * 0.5);
                enemy.hp = Math.min(enemy.maxHp, enemy.hp + heal);
                log.push(`💀 **${enemy.name}** امتص روح **${target.name}**! (+${heal} HP)`);
            }
        }
    },

    'كاهن الخراب': {
        name: 'لعنة الخراب',
        emoji: '🧿',
        chance: 0.25,
        execute: (enemy, players, caravan, log) => {
            players.forEach(p => {
                if (!p.isDead) {
                    p.effects.push({ type: 'weakness', val: 0.3, turns: 2 });
                    if (Math.random() < 0.4) p.effects.push({ type: 'blind', val: 0.3, turns: 2 });
                }
            });
            log.push(`🧿 **${enemy.name}** صب لعنة الخراب على الفريق! (ضعف + عمى)`);
        }
    },

    'عراب الظلام': {
        name: 'ظلام الجحيم',
        emoji: '🌑',
        chance: 0.2,
        execute: (enemy, players, caravan, log) => {
            players.forEach(p => {
                if (!p.isDead) {
                    dealDamage(p, enemy.atk * 1.2);
                    p.effects.push({ type: 'blind', val: 0.5, turns: 2 });
                }
            });
            log.push(`🌑 **عراب الظلام** أطلق ظلام الجحيم على الجميع!`);
        }
    },

    // ======================================================================
    // 🏚️ Ancient Ruins — قطاع طرق الأطلال
    // ======================================================================

    'نباش القبور': {
        name: 'مساحيق سامة',
        emoji: '🧪',
        chance: 0.3,
        execute: (enemy, players, caravan, log) => {
            const target = getRandomTarget(players);
            if (target) {
                dealDamage(target, enemy.atk * 0.8);
                target.effects.push({ type: 'poison', val: Math.floor(enemy.atk * 0.2), turns: 3 });
                log.push(`🧪 **${enemy.name}** رمى مساحيق سامة على **${target.name}**!`);
            }
        }
    },

    'طيف ملعون': {
        name: 'لمسة شبحية',
        emoji: '👻',
        chance: 0.3,
        execute: (enemy, players, caravan, log) => {
            const target = getRandomTarget(players);
            if (target) {
                dealDamage(target, enemy.atk * 0.8);
                target.effects.push({ type: 'weakness', val: 0.3, turns: 2 });
                log.push(`👻 **${enemy.name}** لمس **${target.name}** بلمسة شبحية موهنة!`);
            }
        }
    },

    'حارس المقبرة': {
        name: 'صلابة القبور',
        emoji: '💀',
        chance: 0.25,
        execute: (enemy, players, caravan, log) => {
            enemy.effects = enemy.effects.filter(e => !['burn', 'poison', 'bleed', 'weakness', 'blind', 'stun'].includes(e.type));
            const heal = Math.floor(enemy.maxHp * 0.08);
            enemy.hp = Math.min(enemy.maxHp, enemy.hp + heal);
            log.push(`💀 **${enemy.name}** تسلّح بصلابة القبور! (تطهير +${heal} HP)`);
        }
    },

    'صدى الهاوية': {
        name: 'همس الجنون',
        emoji: '🌀',
        chance: 0.25,
        execute: (enemy, players, caravan, log) => {
            players.forEach(p => {
                if (!p.isDead && Math.random() < 0.6) {
                    p.effects.push({ type: 'confusion', val: 0.5, turns: 2 });
                }
            });
            log.push(`🌀 **${enemy.name}** همس بوساوس الهاوية في عقول الفريق!`);
        }
    },

    'سيد اللعنات': {
        name: 'اللعنة الشاملة',
        emoji: '⚠️',
        chance: 0.2,
        execute: (enemy, players, caravan, log) => {
            players.forEach(p => {
                if (!p.isDead) {
                    p.effects.push({ type: 'poison', val: Math.floor(enemy.atk * 0.2), turns: 3 });
                    p.effects.push({ type: 'weakness', val: 0.2, turns: 2 });
                    p.effects.push({ type: 'blind', val: 0.3, turns: 2 });
                }
            });
            log.push(`⚠️ **سيد اللعنات** أطلق اللعنة الشاملة! (سم + ضعف + عمى)`);
        }
    },

    // ======================================================================
    // 🌲 Nature Valley — قطاع طرق الغابة
    // ======================================================================

    'صياد جشع': {
        name: 'فخ الدب',
        emoji: '🪤',
        chance: 0.3,
        execute: (enemy, players, caravan, log) => {
            const target = getRandomTarget(players);
            if (target) {
                dealDamage(target, enemy.atk);
                target.effects.push({ type: 'stun', val: 1, turns: 1 });
                log.push(`🪤 **${enemy.name}** نصب فخاً أوقع **${target.name}**! (شلل)`);
            }
        }
    },

    'همجي الغابة': {
        name: 'هوجة وحشية',
        emoji: '🐻',
        chance: 0.25,
        execute: (enemy, players, caravan, log) => {
            let totalDmg = 0;
            for (let i = 0; i < 2; i++) {
                const target = getRandomTarget(players);
                if (target) totalDmg += dealDamage(target, enemy.atk * 0.7);
            }
            log.push(`🐻 **${enemy.name}** هاجم بهوجة وحشية! (-${totalDmg} ضرر إجمالي)`);
        }
    },

    'قناص الادغال': {
        name: 'سهم مسموم',
        emoji: '🏹',
        chance: 0.25,
        execute: (enemy, players, caravan, log) => {
            const target = getLowestHp(players);
            if (target) {
                const dmg = dealDamage(target, enemy.atk * 1.4);
                target.effects.push({ type: 'poison', val: Math.floor(enemy.atk * 0.25), turns: 4 });
                log.push(`🏹 **${enemy.name}** أطلق سهماً مسموماً على **${target.name}**! (-${dmg})`);
            }
        }
    },

    'مروض الضواري': {
        name: 'كلاب الصيد',
        emoji: '🐕',
        chance: 0.25,
        execute: (enemy, players, caravan, log) => {
            const parts = [];
            if (caravan.hp > 0) {
                const cDmg = Math.floor(enemy.atk * 0.8);
                caravan.hp = Math.max(0, caravan.hp - cDmg);
                parts.push(`القافلة (-${cDmg})`);
            }
            const target = getRandomTarget(players);
            if (target) {
                const dmg = dealDamage(target, enemy.atk * 0.8);
                parts.push(`${target.name} (-${dmg})`);
            }
            if (parts.length) log.push(`🐕 **${enemy.name}** أطلق كلاب الصيد! (${parts.join('، ')})`);
        }
    },

    'طاغية الوادي': {
        name: 'زئير الطاغية',
        emoji: '🦁',
        chance: 0.2,
        execute: (enemy, players, caravan, log) => {
            players.forEach(p => {
                if (!p.isDead) {
                    dealDamage(p, enemy.atk * 1.1);
                    p.effects.push({ type: 'weakness', val: 0.2, turns: 2 });
                }
            });
            enemy.atk = Math.floor(enemy.atk * 1.15);
            log.push(`🦁 **طاغية الوادي** زأر بقوة! (ضرر + ضعف + زيادة هجوم)`);
        }
    },
};

const GENERIC_BANDIT_SKILLS = [
    { name: 'ضربة مسرعة', emoji: '👊', chance: 0.3, execute: (enemy, players, caravan, log) => {
        const target = getRandomTarget(players);
        if (target) {
            const dmg = dealDamage(target, enemy.atk * 1.2);
            if (dmg) log.push(`👊 **${enemy.name}** سدد ضربة مسرعة لـ **${target.name}**! (-${dmg})`);
        }
    }},
    { name: 'هجوم جماعي', emoji: '🗣️', chance: 0.2, execute: (enemy, players, caravan, log) => {
        let totalDmg = 0;
        players.forEach(p => { if (!p.isDead) totalDmg += dealDamage(p, enemy.atk * 0.7); });
        if (totalDmg) log.push(`🗣️ **${enemy.name}** شن هجوماً جماعياً! (-${totalDmg})`);
    }},
    { name: 'مراوغة', emoji: '💨', chance: 0.2, execute: (enemy, players, caravan, log) => {
        enemy.effects.push({ type: 'evasion', val: 0.3, turns: 2 });
        log.push(`💨 **${enemy.name}** أصبح مراوغاً! (فرصة تفادٍ)`);
    }},
];

function getBanditSkill(enemyName) {
    return BANDIT_SKILLS[enemyName] || null;
}

function getRandomGenericSkill() {
    const totalChance = GENERIC_BANDIT_SKILLS.reduce((s, sk) => s + sk.chance, 0);
    let roll = Math.random() * totalChance;
    for (const sk of GENERIC_BANDIT_SKILLS) {
        roll -= sk.chance;
        if (roll <= 0) return sk;
    }
    return GENERIC_BANDIT_SKILLS[0];
}

module.exports = {
    BANDIT_SKILLS,
    GENERIC_BANDIT_SKILLS,
    getBanditSkill,
    getRandomGenericSkill,
};
