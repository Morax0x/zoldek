const { EmbedBuilder } = require("discord.js");
const { getFloorCaps } = require('./seal-system'); 
const { applyDamageToPlayer } = require('../utils'); 
const { MONSTER_SKILLS, GENERIC_MONSTER_SKILLS } = require('../monsters');
const { generateBattleEmbed, generateBattleRows } = require('../ui');

function getTacticalTargets(players, count, monster) {
    let alive = players.filter(p => !p.isDead && !p.isPermDead);
    if (alive.length === 0) return [];

    if (monster.targetFocusId) {
        const tauntedTarget = alive.find(p => p.id === monster.targetFocusId);
        if (tauntedTarget) {
            return [tauntedTarget]; 
        }
    }

    let prioritized = alive.sort((a, b) => {
        const aKillable = a.hp <= monster.atk * 1.5 ? 20 : 0;
        const bKillable = b.hp <= monster.atk * 1.5 ? 20 : 0;
        
        const aIsPriest = a.class === 'Priest' ? 10 : 0;
        const bIsPriest = b.class === 'Priest' ? 10 : 0;

        const aThreat = a.atk * (a.effects.some(e => e.type === 'atk_buff') ? 1.5 : 1);
        const bThreat = b.atk * (b.effects.some(e => e.type === 'atk_buff') ? 1.5 : 1);
        const threatScore = (bThreat - aThreat) / 1000; 

        const aReflect = a.effects.some(e => e.type === 'reflect' || e.type === 'tank_reflect') ? -100 : 0;
        const bReflect = b.effects.some(e => e.type === 'reflect' || e.type === 'tank_reflect') ? -100 : 0;

        const aInvisible = a.effects.some(e => e.type === 'evasion' || e.type === 'invisibility') ? -5000 : 0;
        const bInvisible = b.effects.some(e => e.type === 'evasion' || e.type === 'invisibility') ? -5000 : 0;

        const aTaunt = a.effects.some(e => e.type === 'titan') ? 50 : 0;
        const bTaunt = b.effects.some(e => e.type === 'titan') ? 50 : 0;

        const scoreA = aKillable + aIsPriest + aReflect + aTaunt + aInvisible;
        const scoreB = bKillable + bIsPriest + bReflect + bTaunt + bInvisible;

        return (scoreB + threatScore) - (scoreA);
    });

    return prioritized.slice(0, count);
}

function applyLocalCap(value, cap) {
    if (cap !== Infinity && value > cap) return cap;
    return value;
}

async function processMonsterTurn(monster, players, log, turnCount, battleMsg, floor, theme, threadChannel) {
    if (isNaN(monster.hp) || monster.hp === null) monster.hp = monster.maxHp || 1000;
    if (isNaN(monster.shield) || monster.shield === null) monster.shield = 0;
    if (isNaN(monster.atk)) monster.atk = 50;

    monster.hp = Math.floor(monster.hp);
    monster.shield = Math.floor(monster.shield);
    monster.atk = Math.floor(monster.atk);

    if (!monster.memory) monster.memory = { comboStep: 0, lastMove: null, healsUsed: 0 };

    const { damageCap } = getFloorCaps(floor);

    const activeLightning = monster.effects.find(e => e.type === 'lightning_weaken');
    const lightningVal = activeLightning ? activeLightning.val : 0;

    // 🔥 1. فحص حالات السيطرة (CC) قبل الخصم من عداد الأدوار لضمان عملها 🔥
    let skipTurn = false;
    let skipReason = "";

    if (monster.frozen) { 
        skipTurn = true;
        skipReason = `❄️ **${monster.name}** متجمد، خسر دوره!`;
        monster.frozen = false; 
    } else if (monster.effects && monster.effects.some(e => (e.type || "").toLowerCase() === 'stun')) {
        skipTurn = true;
        skipReason = `😵 **${monster.name}** مشلول، لا يستطيع الحراك!`;
    } else if (monster.effects && monster.effects.some(e => (e.type || "").toLowerCase() === 'confusion')) {
        const conf = monster.effects.find(e => (e.type || "").toLowerCase() === 'confusion');
        const confChance = conf.val === true ? 0.5 : (conf.val || 0.5);
        if (Math.random() < confChance) {
            const selfDmg = Math.floor(monster.atk * 0.5) || 1;
            monster.hp = Math.max(0, monster.hp - selfDmg);
            skipTurn = true;
            skipReason = `🌀 **${monster.name}** في حالة فوضى وارتباك وضرب نفسه! (-${selfDmg})`;
        }
    }

    // 🔥 2. المحرك الفولاذي لمعالجة تأثيرات الضرر والنزيف 🔥
    if (monster.effects) {
        monster.effects = monster.effects.filter(e => {
            let dmgVal = 0;
            let effectName = "";
            let icon = "";
            const safeType = (e.type || "").toLowerCase();

            if (safeType === 'burn' || safeType === 'poison' || safeType === 'bleed') {
                let rawVal = e.val || e.damage || e.value || 0; 
                
                if (rawVal >= 1) {
                    dmgVal = Math.floor(rawVal);
                } else if (rawVal > 0 && rawVal < 1) {
                    dmgVal = Math.floor(monster.maxHp * rawVal);
                }
                
                dmgVal = applyLocalCap(dmgVal, damageCap);
                
                if (dmgVal > 0) {
                    monster.hp = Math.max(0, monster.hp - dmgVal);

                    if (safeType === 'burn') { effectName = "يحترق"; icon = "🔥"; }
                    if (safeType === 'poison') { effectName = "يتألم من السم"; icon = "☠️"; }
                    if (safeType === 'bleed') { effectName = "ينزف بشدة"; icon = "🩸"; }

                    let msg = `${icon} **${monster.name}** ${effectName}! (-${dmgVal})`;
                    if (dmgVal === damageCap) msg += " (مختوم)";
                    log.push(msg);
                }
            }
            
            if (e.turns !== undefined && e.turns !== null) {
                e.turns--;
                return e.turns > 0;
            } else {
                return false;
            }
        });
    }

    if (monster.hp <= 0) { monster.hp = 0; return false; }

    // 🔥 3. هجوم المرافقين (Summons) 🔥
    players.forEach(p => {
        if (!p.isDead && !p.isPermDead && p.summon && p.summon.active) {
            const atkRatio = p.summon.atkRatio || 0.7;
            let petDmg = Math.floor(p.atk * atkRatio) || 1;
            petDmg = applyLocalCap(petDmg, damageCap);

            monster.hp = Math.max(0, Math.floor(monster.hp - petDmg));
            p.totalDamage += petDmg;
            
            log.push(`🐺 **${p.summon.name}** هاجم ${monster.name} وسبب **${petDmg}** ضرر!`);
            p.summon.turns--;

            if (p.summon.turns <= 0) {
                p.summon.active = false; 
                const explodeRatio = p.summon.explodeRatio || 1.2;
                let explosionDmg = Math.floor(p.atk * explodeRatio) || 1;
                explosionDmg = applyLocalCap(explosionDmg, damageCap);
                monster.hp = Math.max(0, Math.floor(monster.hp - explosionDmg));
                p.totalDamage += explosionDmg;
                log.push(`💥 **${p.summon.name}** انفجر عند الموت مسبباً **${explosionDmg}** ضرر!`);
                p.summon = null; 
            }
        }
    });

    if (monster.hp <= 0) { monster.hp = 0; return false; }

    // 🔥 4. تطبيق تخطي الدور إذا كان الوحش مصاباً بالشلل أو الارتباك 🔥
    if (skipTurn) {
        log.push(skipReason);
        monster.memory.comboStep = 0;
        try {
            await battleMsg.edit({ embeds: [generateBattleEmbed(players, monster, floor, theme, log, [])], components: generateBattleRows() });
        } catch(e){}
        return true;
    }

    // 🔥 5. منطق هجوم الوحش الطبيعي 🔥
    const alive = players.filter(p => !p.isDead && !p.isPermDead);
    if (alive.length === 0) return false;

    let skillUsed = false;

    const cleanName = monster.name.split(' (')[0]; 
    const specialSkill = MONSTER_SKILLS[cleanName];
    if (specialSkill) {
        let chance = specialSkill.chance;
        if (monster.hp < monster.maxHp * 0.5) chance += 0.2; 
        if (Math.random() < chance) {
            specialSkill.execute(monster, players, log);
            skillUsed = true;
        }
    }

    if (!skillUsed && !specialSkill) {
        let allowSkills = false;
        if (floor < 20) allowSkills = false;
        else if (floor < 40) { if (Math.random() < 0.15) allowSkills = true; }
        else { if (Math.random() < 0.30) allowSkills = true; }

        if (allowSkills) {
            const randomGeneric = GENERIC_MONSTER_SKILLS[Math.floor(Math.random() * GENERIC_MONSTER_SKILLS.length)];
            if (randomGeneric) {
                randomGeneric.execute(monster, players, log);
                if (isNaN(monster.shield)) monster.shield = 0;
                monster.shield = Math.floor(monster.shield);
                skillUsed = true;
            }
        }
    }

    if (!skillUsed && monster.memory.comboStep === 1) {
        if (monster.memory.lastMove === 'oil') {
            alive.forEach(p => {
                if (p.effects.some(e => e.type === 'evasion' || e.type === 'invisibility')) return;
                const dmg = Math.floor(monster.atk * 2.0); 
                applyDamageToPlayer(p, dmg);
                p.effects.push({ type: 'burn', val: Math.floor(monster.atk * 0.4), turns: 3 });
            });
            log.push(`🔥 **${monster.name}** فجر الزيت! (COMBO FINISH)`);
            skillUsed = true;
        } else if (monster.memory.lastMove === 'charge') {
            const target = getTacticalTargets(players, 1, monster)[0];
            if (target && !target.effects.some(e => e.type === 'evasion' || e.type === 'invisibility')) {
                const dmg = Math.floor(monster.atk * 3.5); 
                applyDamageToPlayer(target, dmg);
                target.effects.push({ type: 'stun', val: 1, turns: 2 }); 
                log.push(`🔨 **${monster.name}** سحق **${target.name}**! (COMBO FINISH)`);
                skillUsed = true;
            } else {
                log.push(`💨 **${monster.name}** هاجم بكل قوته لكن الهدف اختفى!`);
                skillUsed = true; 
            }
        }
        monster.memory.comboStep = 0;
        monster.memory.lastMove = null;
    }

    if (!skillUsed && floor >= 25 && monster.hp < monster.maxHp * 0.25 && monster.memory.healsUsed < 2) {
        if (Math.random() < 0.5) {
            let healPercent = 0.02 + ((floor - 20) * 0.001);
            healPercent = Math.min(healPercent, 0.10); 
            const healAmount = Math.floor(monster.maxHp * healPercent) || 1;
            monster.hp = Math.floor(monster.hp + healAmount);
            monster.memory.healsUsed++;
            log.push(`💚 **${monster.name}** استعاد عافيته! (+${healAmount})`);
            skillUsed = true;
        }
    }

    if (!skillUsed) {
        let targetCount = 1;
        if (floor >= 30) targetCount = 2;
        if (floor >= 60) targetCount = 3;
        if (floor >= 90) targetCount = 4;
        if (monster.targetFocusId) targetCount = 1;

        const targets = getTacticalTargets(players, targetCount, monster);

        if (targets.length > 0) {
            let hitLog = [];
            
            targets.forEach(target => {
                if (target.effects.some(e => e.type === 'evasion' || e.type === 'invisibility')) {
                    hitLog.push(`${target.name}: 👻 اختفاء (Miss)`);
                    return; 
                }

                let dmg = Math.floor(monster.atk * (1 + turnCount * 0.01));
                
                if (lightningVal > 0) dmg = Math.floor(dmg * (1 - lightningVal)); 
                
                const weakenEffect = monster.effects.find(e => e.type === 'weaken');
                if (weakenEffect) {
                    const weakenVal = weakenEffect.val || 0.3;
                    dmg = Math.floor(dmg * (1 - weakenVal));
                }

                if (target.defending) dmg = Math.floor(dmg * 0.5);
                
                const reflectEffect = target.effects.find(e => e.type === 'reflect' || e.type === 'tank_reflect');
                let reflectedDmg = 0;
                
                if (reflectEffect) {
                    reflectedDmg = Math.floor(dmg * (reflectEffect.val || 0.5)); 
                    dmg = Math.floor(dmg - reflectedDmg);
                    monster.hp = Math.max(0, Math.floor(monster.hp - reflectedDmg));
                }

                const takenDmg = applyDamageToPlayer(target, dmg);
                
                let status = `-${takenDmg}`;
                if (takenDmg === 0 && dmg > 0) status = "🛡️ صد كامل";
                
                if (lightningVal > 0) status += " (⚡ضعف)";
                if (weakenEffect) status += " (📉مُضعف)";
                if (reflectedDmg > 0) status += ` (عكس ${reflectedDmg})`;

                hitLog.push(`${target.name}: ${status}`);
            });

            if (hitLog.length > 0) {
                log.push(`⚔️ **${monster.name}** هاجم: [ ${hitLog.join(' | ')} ]`);
            } else {
                log.push(`⚔️ **${monster.name}** هاجم لكن لم يصب أحداً!`);
            }
        }
    }

    if (monster.targetFocusId) monster.targetFocusId = null;

    if (monster.hp < 0) monster.hp = 0;
    if (isNaN(monster.hp)) monster.hp = 0;

    const deadJustNow = players.filter(p => p.hp <= 0 && !p.isDead && !p.isPermDead);
    
    for (const p of deadJustNow) {
        p.deathCount = (p.deathCount || 0) + 1;
        
        p.isDead = true; 
        p.hp = 0;

        if (p.deathCount >= 3) {
            p.isPermDead = true; 
            p.status = 'decomposed'; 

            const rotEmbed = new EmbedBuilder()
                .setTitle('💀 تحللت الجثة!')
                .setDescription(`**${p.name}** سقط للمرة الثالثة والأخيرة.\nتلاشت روحه وتحللت جثته فوراً.. لا يمكن إنعاشه بعد الآن!`)
                .setColor('DarkRed')
                .setThumbnail('https://i.postimg.cc/QtMZBt18/skull.png');

            await threadChannel.send({ embeds: [rotEmbed] }).catch(()=>{});

        } else {
            const remainingLives = 3 - p.deathCount;
            
            const deathEmbed = new EmbedBuilder()
                .setTitle('🩸 سقوط محارب')
                .setDescription(`**${p.name}** سقط في أرض المعركة! (الموتة رقم **${p.deathCount}**)\nمتبقي له **${remainingLives}** فرصة للعودة قبل التحلل.\n🚑 **الكاهن يمكنه الإنعاش الآن.**`)
                .setColor('Red');

            await threadChannel.send({ embeds: [deathEmbed] }).catch(()=>{});
        }

        if (p.class === 'Priest') {
             players.forEach(ally => {
                if (!ally.isDead && !ally.isPermDead && ally.id !== p.id) {
                    const healAmt = Math.floor(ally.maxHp * 0.20);
                    ally.hp = Math.min(ally.maxHp, ally.hp + healAmt);
                }
            });
            await threadChannel.send(`✨ **سقوط الكاهن منح الأمل الأخير للفريق (+20% HP)** ✨`).catch(()=>{});
        }
    }

    if (players.every(p => p.isDead || p.isPermDead)) {
        return false; 
    }

    if (log.length > 6) log = log.slice(-6);
    
    try {
        await battleMsg.edit({ embeds: [generateBattleEmbed(players, monster, floor, theme, log, [])], components: generateBattleRows() });
    } catch (e) {
        console.log("Error updating battle message:", e.message);
    }
    
    return true;
}

module.exports = { processMonsterTurn };
