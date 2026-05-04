const { EmbedBuilder } = require('discord.js');
const dungeonConfig = require('../../../json/dungeon-config.json'); 
const { applyDamageToPlayer } = require('../utils'); 
const { generateBattleEmbed, generateBattleRows } = require('../ui');

function getMoraxData() {
    const bossConfig = dungeonConfig.final_boss || {};
    
    return {
        isMonster: true,
        isFinalBoss: true, 
        name: bossConfig.name || "الامبراطور موراكس",
        image: bossConfig.image || "https://i.postimg.cc/WzRGhgJ9/mwraks.png",
        level: 100,
        hp: 1500000,      
        maxHp: 1500000,
        atk: 10000,       
        shield: 50000,    
        enraged: false,
        effects: [],
        targetFocusId: null, 
        frozen: false,
        memory: { 
            healsUsed: 0, 
            comboStep: 0, 
            turnCounter: 0 
        }
    };
}

// دالة تحديد الأهداف بذكاء للزعيم موراكس (تشمل خاصية الاستفزاز الجديدة)
function getMoraxTacticalTargets(players, count, monster) {
    let alive = players.filter(p => !p.isDead && !p.isPermDead);
    if (alive.length === 0) return [];

    // 1. إجبار استهداف من فعل الاستفزاز (Taunt)
    const tauntingPlayers = alive.filter(p => p.effects.some(e => e.type === 'taunt' || e.type === 'titan'));
    if (tauntingPlayers.length > 0) {
        return [tauntingPlayers[Math.floor(Math.random() * tauntingPlayers.length)]];
    }

    // 2. الهدف المثبت مسبقاً
    if (monster.targetFocusId) {
        const tauntedTarget = alive.find(p => p.id === monster.targetFocusId);
        if (tauntedTarget) return [tauntedTarget];
    }

    // 3. الذكاء الاصطناعي لموراكس: يكره المعالجين ويستهدف المتهورين
    let prioritized = alive.sort((a, b) => {
        const aIsPriest = a.class === 'Priest' ? 50 : 0;
        const bIsPriest = b.class === 'Priest' ? 50 : 0;
        
        const aThreat = a.atk * (a.effects.some(e => e.type === 'atk_buff') ? 1.5 : 1);
        const bThreat = b.atk * (b.effects.some(e => e.type === 'atk_buff') ? 1.5 : 1);
        const threatScore = (bThreat - aThreat) / 1000; 

        const aInvisible = a.effects.some(e => e.type === 'evasion' || e.type === 'invisibility') ? -5000 : 0;
        const bInvisible = b.effects.some(e => e.type === 'evasion' || e.type === 'invisibility') ? -5000 : 0;

        const scoreA = aIsPriest + aInvisible;
        const scoreB = bIsPriest + bInvisible;

        return (scoreB + threatScore) - scoreA;
    });

    return prioritized.slice(0, count);
}

function applyLocalCap(value, cap) {
    if (cap !== Infinity && value > cap) return cap;
    return value;
}

async function processMoraxTurn(monster, players, log, turnCount, battleMsg, floor, theme, threadChannel) {
    monster.memory.turnCounter++;
    
    const damageCap = 50000; // حد الضرر الخاص بالزعيم موراكس للتأثيرات المستمرة

    // فحص الهشاشة (Vulnerable) لزيادة ضرر السم والحرق وغيرها على الزعيم
    const isVulnerable = monster.effects.some(e => e.type === 'vulnerable');
    const vulnMultiplier = isVulnerable ? 1.3 : 1.0;

    let skipTurn = false;

    if (monster.frozen) {
        monster.frozen = false;
        skipTurn = true;
        log.push(`❄️ **${monster.name}** متجمد هذا الدور! (تأثير ضعيف على هيبته)`);
    } else if (monster.effects && monster.effects.some(e => (e.type || "").toLowerCase() === 'stun')) {
        skipTurn = true;
        log.push(`😵 **${monster.name}** مذهول من قوة الضربة! (خسر هذا الدور)`);
    } else if (monster.effects && monster.effects.some(e => (e.type || "").toLowerCase() === 'confusion')) {
        const conf = monster.effects.find(e => (e.type || "").toLowerCase() === 'confusion');
        const confChance = conf.val === true ? 0.3 : (conf.val || 0.3); // موراكس يقاوم الارتباك بشكل أفضل
        if (Math.random() < confChance) {
            let selfDmg = Math.floor(monster.atk * 0.5) || 1;
            selfDmg = Math.floor(selfDmg * vulnMultiplier);
            monster.hp = Math.max(0, monster.hp - selfDmg);
            skipTurn = true;
            log.push(`🌀 **${monster.name}** اختل توازنه وضرب نفسه برمحه! (-${selfDmg})`);
        }
    }

    // فحص الصمت (يمنع موراكس من استخدام المهارات الجماعية الكارثية)
    const isSilenced = monster.effects && monster.effects.some(e => e.type === 'silence');

    // 🔥 المحرك الفولاذي لمعالجة التأثيرات المستمرة (DOT) للزعيم 🔥
    if (monster.effects) {
        monster.effects = monster.effects.filter(e => {
            let dmgVal = 0;
            let effectName = "";
            let icon = "";
            const safeType = (e.type || "").toLowerCase();

            if (safeType === 'burn' || safeType === 'poison' || safeType === 'bleed') {
                let rawVal = e.val || e.damage || e.value || 0; 
                if (rawVal >= 1) dmgVal = Math.floor(rawVal);
                else if (rawVal > 0 && rawVal < 1) dmgVal = Math.floor(monster.maxHp * rawVal);
                
                dmgVal = Math.floor(dmgVal * vulnMultiplier);
                dmgVal = applyLocalCap(dmgVal, damageCap);
                
                if (dmgVal > 0) {
                    monster.hp = Math.max(0, monster.hp - dmgVal);
                    if (safeType === 'burn') { effectName = "يحترق"; icon = "🔥"; }
                    if (safeType === 'poison') { effectName = "يتألم من السم"; icon = "☠️"; }
                    if (safeType === 'bleed') { effectName = "ينزف بشدة"; icon = "🩸"; }
                    
                    let msg = `${icon} **${monster.name}** ${effectName}: -${dmgVal}`;
                    if (dmgVal === damageCap) msg += " (الحد الأقصى للنزيف)";
                    log.push(msg);
                }
            }

            // خفاش مصاص الدماء 🦇
            if (safeType === 'bat') {
                let batDmg = Math.floor(monster.maxHp * (e.val || 0.05));
                batDmg = Math.floor(batDmg * vulnMultiplier);
                batDmg = applyLocalCap(batDmg, damageCap);

                if (batDmg > 0) {
                    monster.hp = Math.max(0, monster.hp - batDmg);
                    let vampirePlayer = players.find(p => !p.isDead && !p.isPermDead && p.race === 'vampire');
                    if (vampirePlayer) {
                        vampirePlayer.hp = Math.min(vampirePlayer.maxHp, vampirePlayer.hp + batDmg);
                        log.push(`🦇 طفيليات مصاص الدماء تمتص طاقة **${monster.name}** (-${batDmg}) وتغذي ${vampirePlayer.name}!`);
                    } else {
                        log.push(`🦇 طفيليات مصاص الدماء تنهش جسد **${monster.name}** (-${batDmg})!`);
                    }
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

    if (skipTurn) {
        monster.memory.comboStep = 0;
        try {
            await battleMsg.edit({ embeds: [generateBattleEmbed(players, monster, floor, theme, log, [])] }).catch(()=>{});
        } catch(e){}
        return true;
    }

    if (monster.memory.turnCounter % 3 === 0) {
        monster.shield += 15000;
        log.push(`🛡️ **${monster.name}** يجمع الصخور حوله ويجدد درعه الأسطوري! (+15,000)`);
    }

    const alive = players.filter(p => !p.isDead && !p.isPermDead);
    if (alive.length === 0) return false;

    let targets = getMoraxTacticalTargets(players, 1, monster);
    let skillUsed = false;
    const rand = Math.random();

    // إذا كان موراكس صامتاً، لن يستطيع استخدام المهارات العنيفة!
    if (!isSilenced) {
        if (!skillUsed && rand < 0.25) {
            let hitLog = [];
            alive.forEach(p => {
                if (p.effects.some(e => e.type === 'evasion')) return; // المراوغة التامة تنجيك
                let dmg = Math.floor(monster.atk * 1.8);
                if (p.defending) dmg = Math.floor(dmg * 0.6); 
                
                applyDamageToPlayer(p, dmg);
                p.effects.push({ type: 'weakness', val: 0.5, turns: 2 });
                hitLog.push(`${p.name}: -${dmg}`);
            });
            log.push(`☄️ **${monster.name}**: "سأريكم النظام!" (Planet Befall) - نيزك ساحق ضرب الجميع! [ ${hitLog.join(' | ')} ]`);
            skillUsed = true;
        }
        else if (!skillUsed && rand < 0.45) {
            const weakTarget = alive.sort((a, b) => a.hp - b.hp)[0]; // يستهدف الأضعف
            if (weakTarget && !weakTarget.effects.some(e => e.type === 'evasion')) {
                let dmg = Math.floor(monster.atk * 4.5); 
                
                // فحص الانعكاس (Reflect)
                const reflect = weakTarget.effects.find(e => e.type === 'reflect' || e.type === 'tank_reflect');
                if (reflect) {
                    let reflected = Math.floor(dmg * (reflect.val || 0.4));
                    reflected = Math.floor(reflected * vulnMultiplier);
                    monster.hp -= reflected;
                    dmg -= reflected;
                    log.push(`↩️ **${weakTarget.name}** عكس جزءاً من الإعدام! (-${reflected} للزعيم)`);
                }

                const taken = applyDamageToPlayer(weakTarget, dmg);
                log.push(`🗡️ **${monster.name}** وجه رمحه الذهبي نحو قلب **${weakTarget.name}**! (-${taken})`);
                skillUsed = true;
            }
        }
        else if (!skillUsed && rand < 0.65) {
            let hitLog = [];
            alive.forEach(p => {
                if (p.effects.some(e => e.type === 'evasion')) return;
                const dmg = Math.floor(monster.atk * 1.2);
                applyDamageToPlayer(p, dmg);
                // تدمير دفاعات اللاعبين
                p.effects = p.effects.filter(e => !['atk_buff', 'def_buff', 'shield', 'reflect', 'tank_reflect'].includes(e.type));
                hitLog.push(`${p.name}: -${dmg}`);
            });
            log.push(`🌋 **${monster.name}** ضرب الأرض بقوة! (زلزال) - تحطيم جميع الدفاعات! [ ${hitLog.join(' | ')} ]`);
            skillUsed = true;
        }
    } else {
        log.push(`🔇 صمت السحر منع الإمبراطور من إلقاء نيزكه!`);
    }

    // الهجوم العادي (Basic Attack) - يعمل دائماً إذا لم تُستخدم مهارة أو كان صامتاً
    if (!skillUsed) {
        // موراكس يضرب ضربة أو ضربتين عاديتين
        const attackCount = Math.random() < 0.5 ? 2 : 1;
        const attackTargets = getMoraxTacticalTargets(players, attackCount, monster);
        
        let hitLog = [];
        
        attackTargets.forEach(t => {
            if (t.effects.some(e => e.type === 'evasion')) {
                hitLog.push(`${t.name}: 👻 مراوغة`);
                return;
            }

            let dmg = Math.floor(monster.atk * 1.0);
            const weaken = monster.effects.find(e => e.type === 'lightning_weaken' || e.type === 'weaken');
            if (weaken) {
                const weakenVal = weaken.val || 0.3;
                dmg = Math.floor(dmg * (1 - weakenVal)); 
            }

            if (t.defending) dmg = Math.floor(dmg * 0.5);

            // 🌵 فحص الأشواك (Thorns)
            const thornsEffect = t.effects.find(e => e.type === 'thorns');
            let thornsDmg = 0;
            if (thornsEffect) {
                thornsDmg = Math.floor(dmg * (thornsEffect.val || 0.3));
                thornsDmg = Math.floor(thornsDmg * vulnMultiplier); 
                monster.hp = Math.max(0, Math.floor(monster.hp - thornsDmg));
            }

            // 🔄 فحص الانعكاس (Reflect)
            const reflectEffect = t.effects.find(e => e.type === 'reflect' || e.type === 'tank_reflect');
            let reflectedDmg = 0;
            if (reflectEffect) {
                reflectedDmg = Math.floor(dmg * (reflectEffect.val || 0.5)); 
                reflectedDmg = Math.floor(reflectedDmg * vulnMultiplier); 
                dmg = Math.floor(dmg - reflectedDmg); 
                monster.hp = Math.max(0, Math.floor(monster.hp - reflectedDmg));
            }

            const taken = applyDamageToPlayer(t, dmg);
            
            let status = `-${taken}`;
            if (taken === 0 && dmg > 0) status = "🛡️ صد كامل";
            if (reflectedDmg > 0) status += ` (عكس ${reflectedDmg})`;
            if (thornsDmg > 0) status += ` (أشواك 🌵 ${thornsDmg})`;

            hitLog.push(`${t.name}: ${status}`);
        });

        if (hitLog.length > 0) {
            log.push(`⚔️ **${monster.name}** يهاجم برمحه الثقيل: [ ${hitLog.join(' | ')} ]`);
        } else {
            log.push(`⚔️ **${monster.name}** ضرب الهواء بغضب!`);
        }
    }

    if (monster.targetFocusId) monster.targetFocusId = null;

    // معالجة الوفيات
    const deadJustNow = players.filter(p => p.hp <= 0 && !p.isDead && !p.isPermDead);
    for (const p of deadJustNow) {
        p.deathCount = (p.deathCount || 0) + 1;
        p.isDead = true;
        p.hp = 0;

        if (p.deathCount >= 3 || (p.reviveCount && p.reviveCount >= 1)) {
            p.isPermDead = true;
            p.status = 'decomposed';
            await threadChannel.send(`☠️ **${p.name}** سحقه الإمبراطور تماماً... تحللت جثته ولا أمل لعودته!`).catch(()=>{});
        } else {
            const remainingLives = 3 - p.deathCount;
            await threadChannel.send(`💀 **${p.name}** لم يستطع تحمل هيبة الإمبراطور وسقط! (متبقي **${remainingLives}** فرصة قبل التحلل التام)`).catch(()=>{});
        }
        
        if (p.class === 'Priest') {
             players.forEach(ally => {
                if (!ally.isDead && !ally.isPermDead && ally.id !== p.id) {
                    const healAmt = Math.floor(ally.maxHp * 0.30);
                    ally.hp = Math.min(ally.maxHp, ally.hp + healAmt);
                }
            });
            await threadChannel.send(`✨ **تضحية الكاهن الأخيرة!** تم شفاء الناجين بنسبة 30%.`).catch(()=>{});
        }
    }

    if (players.every(p => p.isDead || p.isPermDead)) {
        return false; 
    }

    if (log.length > 6) log.splice(0, log.length - 6);

    try {
        await battleMsg.edit({ 
            embeds: [generateBattleEmbed(players, monster, floor, theme, log, [])],
            components: generateBattleRows() 
        }); 
    } catch (e) { 
        console.log("Error updating Morax embed:", e.message); 
    }

    return true;
}

module.exports = { getMoraxData, processMoraxTurn };
