const { dungeonConfig } = require('./constants');
const { applyDamageToPlayer } = require('./utils');

function getSmartTarget(players, monster) {
    let alive = players.filter(p => !p.isDead && !p.effects.some(e => e.type === 'stealth'));

    if (alive.length === 0) {
        alive = players.filter(p => !p.isDead);
    }

    if (alive.length === 0) return null;

    const topThreat = alive.sort((a, b) => (b.threat || 0) - (a.threat || 0))[0];

    if (topThreat && topThreat.threat > 100) { 
        return topThreat;
    }

    const ccTarget = alive.find(p => p.effects.some(e => ['stun', 'freeze'].includes(e.type)));
    if (ccTarget && Math.random() < 0.6) return ccTarget;

    const priest = alive.find(p => p.class === 'Priest');
    if (priest && Math.random() < 0.6) return priest; 

    const lowestHp = alive.sort((a, b) => a.hp - b.hp)[0];
    if (lowestHp && lowestHp.hp < lowestHp.maxHp * 0.3 && Math.random() < 0.8) return lowestHp;

    return alive[Math.floor(Math.random() * alive.length)];
}

// 🔥 نظام التهدئة (Cooldown) لمنع الوحوش من السبام 🔥
function handleCooldown(monster, skillId, turns, players, log, normalAtkMsg) {
    if (!monster.skillCooldowns) monster.skillCooldowns = {};
    if (monster.skillCooldowns[skillId] > 0) {
        const target = getSmartTarget(players, monster);
        if(target) {
            applyDamageToPlayer(target, monster.atk);
            log.push(`⚔️ **${monster.name}** ${normalAtkMsg} **${target.name}**! (المهارة قيد التجهيز)`);
        }
        return true; 
    }
    monster.skillCooldowns[skillId] = turns;
    return false; 
}

function checkBossPhase(monster, log) {
    // ⏳ تنقيص عداد التهدئة (Cooldowns) كل دور ⏳
    if (!monster.skillCooldowns) monster.skillCooldowns = {};
    for (let skill in monster.skillCooldowns) {
        if (monster.skillCooldowns[skill] > 0) monster.skillCooldowns[skill]--;
    }

    if ((monster.maxHp > 10000) && !monster.enraged && monster.hp <= monster.maxHp * 0.5) {
        monster.enraged = true;
        monster.atk = Math.floor(monster.atk * 1.3); 
        
        log.push(`\n🔴🔴 **تحذير: ${monster.name} دخل مرحلة الهيـجان (Enrage)!** 🔴🔴`);
        log.push(`⚠️ **ازداد الهجوم بنسبة 30% وأصبحت المهارات أكثر فتكاً!**\n`);
        
        const heal = Math.floor(monster.maxHp * 0.1);
        monster.hp += heal;
        log.push(`🩸 **${monster.name}** استعاد ${heal} من صحته بسبب الغضب!`);
        
        return true; 
    }
    return false;
}

const GENERIC_MONSTER_SKILLS = [
    { name: "ضربة قاصمة", emoji: "🔨", chance: 0.3, execute: (m, p, l, currentFloor) => { 
        if (handleCooldown(m, 'generic_smash', 2, p, l, "هاجم بقوة نحو")) return;
        const target = getSmartTarget(p, m); 
        if(target){ 
            let dmg = Math.floor(m.atk * 1.5);
            if (currentFloor <= 18) {
                dmg = Math.min(dmg, 140); 
            }
            applyDamageToPlayer(target, dmg); 
            l.push(`🔨 **${m.name}** رصد نقطة ضعف **${target.name}** وسدد ضربة قاصمة!`); 
        }
    }},
    { name: "عضة سامة", emoji: "🤮", chance: 0.25, execute: (m, p, l) => { 
        if (handleCooldown(m, 'generic_poison', 3, p, l, "عض بقوة")) return;
        const alive = p.filter(pl => !pl.isDead && !pl.effects.some(e => e.type === 'stealth'));
        if (alive.length === 0) return;
        const target = alive[Math.floor(Math.random()*alive.length)];
        if(target){ 
            let poisonDmg = Math.floor(m.atk*0.2);
            if (m.atk < 50) poisonDmg = Math.max(5, poisonDmg); 
            
            target.effects.push({type:'poison', val: poisonDmg, turns:3}); 
            l.push(`🤮 **${m.name}** نفث سماً على **${target.name}**!`); 
        }
    }},
    { name: "صرخة مرعبة", emoji: "🗣️", chance: 0.2, execute: (m, p, l) => { 
        if (handleCooldown(m, 'generic_shout', 4, p, l, "هاجم بضراوة")) return;
        p.forEach(pl=>{if(!pl.isDead && Math.random()<0.5) {
            pl.effects.push({type:'weakness',val:0.3,turns:2});
            pl.threat = Math.floor((pl.threat || 0) * 0.5); 
        }}); 
        l.push(`🗣️ **${m.name}** أطلق صرخة مرعبة قللت عزيمة (وتهديد) الفريق!`);
    }},
    { name: "هجوم متوحش", emoji: "🐾", chance: 0.25, execute: (m, p, l, currentFloor) => { 
        if (handleCooldown(m, 'generic_aoe', 3, p, l, "انقض على")) return;
        p.forEach(pl=>{if(!pl.isDead) {
            let dmg = Math.floor(m.atk*0.7);
            if (currentFloor <= 18) {
                dmg = Math.min(dmg, 60); 
            }
            applyDamageToPlayer(pl, dmg);
        }}); 
        l.push(`🐾 **${m.name}** هاجم الجميع بوحشية!`);
    }},
    { name: "تصلب", emoji: "🛡️", chance: 0.15, execute: (m, p, l, currentFloor) => { 
        if (handleCooldown(m, 'generic_harden', 4, p, l, "وجه ضربة قوية إلى")) return;
        if (currentFloor < 21) {
            const target = getSmartTarget(p, m);
            if(target) {
                applyDamageToPlayer(target, Math.floor(m.atk * 0.8));
                l.push(`⚔️ **${m.name}** حاول التصلب لكنه فشل وهاجم بدلاً من ذلك!`);
            }
            return;
        }

        let healPercent = 0.02 + ((currentFloor - 20) * 0.001);
        healPercent = Math.min(healPercent, 0.10);

        const healAmount = Math.floor(m.maxHp * healPercent); 
        m.hp += healAmount; 
        l.push(`🛡️ **${m.name}** صلب جلده واستعاد عافيته (+${healAmount} HP)!`);
    }}
];

const MONSTER_SKILLS = {
    // ========================
    // 🔥 وحوش النخبة: النار
    // ========================
    "تنين الأرض": { name: "هزة أرضية", emoji: "🌍", chance: 0.25, execute: (m,p,l) => { if (handleCooldown(m,'e_quake',3,p,l,"ضرب")) return; p.forEach(pl=>{if(!pl.isDead) applyDamageToPlayer(pl, Math.floor(m.atk*0.8))}); l.push(`🌍 **تنين الأرض** ضرب الأرض بقوة مسبباً زلزالاً!`); }},
    "طاغية الجبال": { name: "رمي الصخور", emoji: "🪨", chance: 0.25, execute: (m,p,l) => { if (handleCooldown(m,'e_rock',2,p,l,"لكم")) return; const t=getSmartTarget(p, m); if(t){applyDamageToPlayer(t, m.atk*1.8); l.push(`🪨 **الطاغية** رمى صخرة عملاقة على **${t.name}**!`);} }},
    "العملاق الفولاذي": { name: "درع اللهب", emoji: "🔥", chance: 0.25, execute: (m,p,l) => { if (handleCooldown(m,'e_shield',4,p,l,"سحق")) return; m.effects.push({type:'reflect', val:0.3, turns:2}); l.push(`🔥 **العملاق** أحاط نفسه بهالة نارية عاكسة!`); }},
    "سيد المعارك": { name: "غضب المحارب", emoji: "💢", chance: 0.25, execute: (m,p,l) => { if (handleCooldown(m,'e_rage',4,p,l,"طعن")) return; m.atk = Math.floor(m.atk * 1.2); l.push(`💢 **سيد المعارك** دخل في حالة هيجان وزاد هجومه!`); }},
    "قرش الرمال": { name: "كمين رملي", emoji: "🦈", chance: 0.25, execute: (m,p,l) => { if (handleCooldown(m,'e_ambush',3,p,l,"عض")) return; const t=getSmartTarget(p, m); if(t){applyDamageToPlayer(t, m.atk*1.4); t.effects.push({type:'stun',val:1,turns:1}); l.push(`🦈 **القرش** باغث **${t.name}** من تحت الرمال! (شلل)`);} }},
    "عفريت النار": { name: "كرة اللهب", emoji: "☄️", chance: 0.25, execute: (m,p,l) => { if (handleCooldown(m,'e_fireball',3,p,l,"حرق")) return; p.forEach(pl=>{if(!pl.isDead && Math.random()<0.5) pl.effects.push({type:'burn',val:Math.floor(m.atk*0.2),turns:2})}); l.push(`☄️ **العفريت** أطلق كرات نارية حارقة!`); }},

    // ========================
    // ❄️ وحوش النخبة: الجليد
    // ========================
    "عملاق الصقيع": { name: "نفس متجمد", emoji: "❄️", chance: 0.25, execute: (m,p,l) => { if (handleCooldown(m,'e_frost',3,p,l,"ضرب")) return; const t=getSmartTarget(p, m); if(t){applyDamageToPlayer(t, m.atk); t.effects.push({type:'stun',val:1,turns:1}); l.push(`❄️ **العملاق** جمد **${t.name}** بأنفاسه!`);} }},
    "الدب الفولاذي": { name: "تمزيق", emoji: "🐾", chance: 0.25, execute: (m,p,l) => { if (handleCooldown(m,'e_tear',3,p,l,"خدش")) return; const t=getSmartTarget(p, m); if(t){applyDamageToPlayer(t, m.atk*1.2); t.effects.push({type:'poison',val:Math.floor(m.atk*0.1),turns:3}); l.push(`🐾 **الدب** مزق **${t.name}** (نزيف)!`);} }},
    "التنين اليافع": { name: "عاصفة ثلجية", emoji: "🌨️", chance: 0.25, execute: (m,p,l) => { if (handleCooldown(m,'e_blizzard',3,p,l,"هاجم")) return; p.forEach(pl=>{if(!pl.isDead) applyDamageToPlayer(pl, Math.floor(m.atk*0.7))}); l.push(`🌨️ **التنين** استدعى عاصفة ثلجية!`); }},
    "فارس الغسق": { name: "سيف الظلام", emoji: "🌑", chance: 0.25, execute: (m,p,l) => { if (handleCooldown(m,'e_darksword',2,p,l,"طعن")) return; const t=getSmartTarget(p, m); if(t){applyDamageToPlayer(t, m.atk*1.5); l.push(`🌑 **فارس الغسق** وجه ضربة مشبعة بالظلام لـ **${t.name}**!`);} }},
    "الحرس الملكي": { name: "تشكيل دفاعي", emoji: "🛡️", chance: 0.25, execute: (m,p,l) => { if (handleCooldown(m,'e_formation',4,p,l,"صد وهاجم")) return; m.hp += Math.floor(m.maxHp * 0.1); l.push(`🛡️ **الحرس الملكي** استعاد ترتيب صفوفه وترمم!`); }},
    "ذئب القطب": { name: "عواء القطيع", emoji: "🐺", chance: 0.25, execute: (m,p,l) => { if (handleCooldown(m,'e_howl',4,p,l,"عض")) return; m.atk = Math.floor(m.atk*1.15); l.push(`🐺 **الذئب** عوى لرفع معنوياته القتالية!`); }},

    // ========================
    // 👑 الزعماء (Bosses)
    // ========================
    "كراكن": {
        name: "عصر المجسات", emoji: "🦑", chance: 0.25,
        execute: (monster, players, log) => {
            if (handleCooldown(monster, 'boss_kraken', 3, players, log, "ضرب بأحد مجساته")) return;
            let alive = players.filter(p => !p.isDead && !p.effects.some(e => e.type === 'stun'));
            if (alive.length === 0) alive = players.filter(p => !p.isDead);
            const target = alive[Math.floor(Math.random() * alive.length)];
            if(target) {
                applyDamageToPlayer(target, Math.floor(monster.atk * 1.3));
                target.effects.push({type:'stun', val:1, turns:1}); // الشلل لدور واحد فقط
                log.push(`🦑 **كراكن** لف مجساته حول **${target.name}** وعصره! (شلل)`);
            }
        }
    },
    "أوميغا": {
        name: "شعاع الإبادة", emoji: "☢️", chance: 0.20,
        execute: (monster, players, log) => {
            if (handleCooldown(monster, 'boss_omega', 4, players, log, "أطلق صواريخ مدمجة نحو")) return;
            players.forEach(p => { if(!p.isDead) applyDamageToPlayer(p, Math.floor(monster.atk * 1.5)); }); // تم تخفيض الضرر من 1.8 لـ 1.5
            log.push(`☢️ **أوميغا** أطلق شعاع الإبادة الجماعية!`);
        }
    },
    "مالينيا، نصل ميكيلا": {
        name: "رقصة الموت (Dance of Death)", emoji: "🌸", chance: 0.25,
        execute: (monster, players, log) => {
            if (handleCooldown(monster, 'boss_malenia', 3, players, log, "وجهت طعنة سريعة لـ")) return;
            let totalDmg = 0;
            players.forEach(p => {
                if (!p.isDead) {
                    const dmg = Math.floor(monster.atk * 1.2); // تم تخفيض الضرر من 1.5 لـ 1.2
                    const actualDmg = applyDamageToPlayer(p, dmg);
                    totalDmg += actualDmg;
                }
            });
            // الشفاء صار 30% من الضرر الفعلي بدل 50%
            monster.hp = Math.min(monster.maxHp, monster.hp + Math.floor(totalDmg * 0.3));
            log.push(`🌸 **مالينيا** حلقت ونفذت **رقصة الموت**! (ألحقت ضرراً بالجميع وامتصت جزءاً كصحة)`);
        }
    },
    "الجنرال رادان": {
        name: "نجمة القهر", emoji: "☄️", chance: 0.20,
        execute: (monster, players, log) => {
            if (handleCooldown(monster, 'boss_radahn', 4, players, log, "هوى بسيفه العملاق على")) return;
            const target = getSmartTarget(players, monster);
            if (target) {
                applyDamageToPlayer(target, Math.floor(monster.atk * 2.0)); // من 2.5 لـ 2.0
                target.effects.push({ type: 'weakness', val: 0.4, turns: 2 });
                log.push(`☄️ **رادان** سحق **${target.name}** بقوة النجوم!`);
            }
        }
    },
    "ماليكيث، النصل الأسود": {
        name: "الموت المقدر", emoji: "🗡️", chance: 0.25,
        execute: (monster, players, log) => {
            if (handleCooldown(monster, 'boss_maliketh', 4, players, log, "طعن بخنجره الأسود")) return;
            players.forEach(p => { if (!p.isDead) { p.hp -= Math.floor(p.hp * 0.15); p.effects.push({ type: 'burn', val: Math.floor(monster.atk * 0.2), turns: 2 }); } });
            log.push(`🗡️ **ماليكيث** أطلق العنان للموت المقدر! (HP Cut -15% + نزيف)`);
        }
    },
    "غودفري، الإلدن لورد": {
        name: "زلزال هورا لوكس", emoji: "🌋", chance: 0.25,
        execute: (monster, players, log) => {
            if (handleCooldown(monster, 'boss_godfrey', 3, players, log, "ركل بقوة هائلة")) return;
            players.forEach(p => { 
                if (!p.isDead) { 
                    applyDamageToPlayer(p, Math.floor(monster.atk * 0.9)); 
                    if (Math.random() < 0.3) p.effects.push({ type: 'stun', val: 1, turns: 1 }); // خفضنا نسبة الشلل للكل لـ 30%
                } 
            });
            log.push(`🌋 **غودفري** مزق الأرض! (ضرر + فرصة طرح أرضاً)`);
        }
    },
    "الساحرة راني": {
        name: "قمر الظلام البارد", emoji: "🌕", chance: 0.25,
        execute: (monster, players, log) => {
            if (handleCooldown(monster, 'boss_ranni', 3, players, log, "أطلقت رمحاً سحرياً نحو")) return;
            players.forEach(p => { if(!p.isDead) { applyDamageToPlayer(p, monster.atk); p.effects.push({type:'weakness', val:0.3, turns:2}); } });
            log.push(`🌕 **راني** أطلقت سحر القمر المظلم! (تجميد/ضعف)`);
        }
    },
    "إيشين قديس السيف": {
        name: "تقنية البرق", emoji: "⚡", chance: 0.30,
        execute: (monster, players, log) => {
            if (handleCooldown(monster, 'boss_isshin', 3, players, log, "ضرب بمهارة ساموراي مذهلة")) return;
            const target = getSmartTarget(players, monster);
            if(target) { 
                applyDamageToPlayer(target, Math.floor(monster.atk * 1.8)); 
                target.effects.push({ type: 'stun', val: 1, turns: 1 }); 
                log.push(`⚡ **إيشين** صعق **${target.name}** بالبرق وشل حركته!`); 
            }
        }
    },
    "النامليس كينج": {
        name: "عاصفة الرعد", emoji: "🌩️", chance: 0.25,
        execute: (monster, players, log) => {
            if (handleCooldown(monster, 'boss_nameless', 3, players, log, "طعن برمحه الصاعق")) return;
            players.forEach(p => { if(!p.isDead) applyDamageToPlayer(p, Math.floor(monster.atk * 1.1)); });
            log.push(`🌩️ **الملك المجهول** استدعى العاصفة!`);
        }
    },
    "أرتورياس، سائر الهاوية": {
        name: "شقلبة الهاوية", emoji: "🤸", chance: 0.30,
        execute: (monster, players, log) => {
            if (handleCooldown(monster, 'boss_artorias', 3, players, log, "ضرب بسيفه الملوث")) return;
            const target = getSmartTarget(players, monster);
            if(target) { applyDamageToPlayer(target, Math.floor(monster.atk * 1.6)); monster.atk = Math.floor(monster.atk * 1.05); log.push(`🌑 **أرتورياس** سحق **${target.name}** وازداد غضباً!`); }
        }
    },
    "سول أوف سيندر": {
        name: "كومبو السيف الملتوي", emoji: "🔥", chance: 0.25,
        execute: (monster, players, log) => {
            if (handleCooldown(monster, 'boss_cinder', 3, players, log, "وجه ضربة نارية نحو")) return;
            const target = getSmartTarget(players, monster);
            if(target) { applyDamageToPlayer(target, Math.floor(monster.atk * 1.5)); target.effects.push({type:'burn', val: Math.floor(monster.atk*0.2), turns:2}); log.push(`🔥 **روح الرماد** أحرق **${target.name}**!`); }
        }
    },
    "مانوس أبو الهاوية": {
        name: "وابل الظلام (Dark Bead)", emoji: "⚫", chance: 0.25,
        execute: (monster, players, log) => {
            if (handleCooldown(monster, 'boss_manus', 3, players, log, "ضرب بذراعه المظلمة")) return;
            players.forEach(p => { if (!p.isDead) { applyDamageToPlayer(p, Math.floor(monster.atk * 1.4)); p.effects.push({ type: 'blind', val: 0.5, turns: 2 }); } });
            log.push(`⚫ **مانوس** أطلق سحر **وابل الظلام**! (ضرر + عمى)`);
        }
    },
    "سيفيروث": {
        name: "سوبر نوفا", emoji: "🌌", chance: 0.20,
        execute: (monster, players, log) => {
            if (handleCooldown(monster, 'boss_sephiroth', 4, players, log, "لوح بسيف الماساموني نحو")) return;
            players.forEach(p => { if (!p.isDead) { const dmg = Math.floor(p.hp * 0.35); applyDamageToPlayer(p, dmg); p.effects.push({ type: 'confusion', val: 0.5, turns: 2 }); } });
            log.push(`🌌 **سيفيروث** دمر النظام بـ **سوبر نوفا**! (HP Cut -35%)`);
        }
    },
    "فيرجل، العاصفة المقتربة": {
        name: "Judgment Cut End", emoji: "⚔️", chance: 0.25,
        execute: (monster, players, log) => {
            if (handleCooldown(monster, 'boss_vergil', 3, players, log, "ضرب بسرعة البرق")) return;
            players.forEach(p => { if(!p.isDead) applyDamageToPlayer(p, Math.floor(monster.atk * 1.3)); });
            log.push(`⚔️ **فيرجل** قطع الزمان والمكان (Judgment Cut End)!`);
        }
    },
    "دانتي صائد الشياطين": {
        name: "Devil Trigger", emoji: "😈", chance: 0.25,
        execute: (monster, players, log) => {
            if (handleCooldown(monster, 'boss_dante', 4, players, log, "أطلق النار من مسدسيه نحو")) return;
            
            // 🛡️ ترويض دانتي لمنع التضخم اللانهائي 🛡️
            if (!monster.originalAtk) monster.originalAtk = monster.atk;
            monster.hp = Math.min(monster.maxHp, monster.hp + Math.floor(monster.maxHp * 0.08)); // شفاء 8% فقط بدل 15%
            
            if (monster.atk < monster.originalAtk * 1.5) { // الحد الأقصى للهجوم 150%
                monster.atk = Math.floor(monster.atk * 1.15); // زيادة 15% بدل 25%
            }
            
            log.push(`😈 **دانتي** فعل **Devil Trigger**! (استعاد 8% صحة + زاد هجومه 15%)`);
        }
    },
    "نيمسيس": {
        name: "قاذف الصواريخ", emoji: "🚀", chance: 0.25,
        execute: (monster, players, log) => {
            if (handleCooldown(monster, 'boss_nemesis', 3, players, log, "لكم بقوة هائلة")) return;
            const target = getSmartTarget(players, monster);
            if(target) { applyDamageToPlayer(target, Math.floor(monster.atk * 1.8)); log.push(`🚀 **نيمسيس** أطلق صاروخاً على **${target.name}**!`); }
        }
    },
    "ويسكر المتحول": {
        name: "انتقال فوري", emoji: "🕶️", chance: 0.30,
        execute: (monster, players, log) => {
            if (handleCooldown(monster, 'boss_wesker', 3, players, log, "ركل بسرعة خاطفة")) return;
            let alive = players.filter(p => !p.isDead && !p.effects.some(e => e.type === 'stun'));
            if(alive.length === 0) alive = players.filter(p => !p.isDead);
            
            const target = alive.sort((a,b) => b.atk - a.atk)[0]; 
            if(target) { 
                applyDamageToPlayer(target, Math.floor(monster.atk * 1.4)); 
                target.effects.push({ type: 'stun', val: 1, turns: 1 });
                log.push(`🕶️ **ويسكر** باغث **${target.name}** وشل حركته!`); 
            }
        }
    },
    "بيراميد هيد": {
        name: "حكم الإعدام", emoji: "🔪", chance: 0.25,
        execute: (monster, players, log) => {
            if (handleCooldown(monster, 'boss_pyramid', 3, players, log, "ضرب ببطء ولكن بقوة")) return;
            const target = getSmartTarget(players, monster);
            if(target) { applyDamageToPlayer(target, Math.floor(monster.atk * 1.8)); target.effects.push({type:'burn', val: Math.floor(monster.atk*0.2), turns:3}); log.push(`🔪 **بيراميد هيد** شق **${target.name}** بسكينه العظيم! (نزيف)`); }
        }
    },
    "آرثاس، الليتش كينج": {
        name: "غضب فروستمورن", emoji: "❄️", chance: 0.25,
        execute: (monster, players, log) => {
            if (handleCooldown(monster, 'boss_arthas', 3, players, log, "لوح بسيف فروستمورن نحو")) return;
            
            // 🛡️ ترويض آرثاس للبحث عن أهداف غير مجمدة فقط 🛡️
            let alive = players.filter(p => !p.isDead && !p.effects.some(e => e.type === 'stun'));
            if (alive.length === 0) alive = players.filter(p => !p.isDead);
            const target = alive[Math.floor(Math.random() * alive.length)];
            
            if(target) { 
                applyDamageToPlayer(target, Math.floor(monster.atk * 1.4)); 
                target.effects.push({ type: 'stun', val: 1, turns: 1 }); // الشلل لدور واحد فقط بدل لا نهائي
                log.push(`❄️ **آرثاس** جمد **${target.name}** بالكامل!`); 
            }
        }
    },
    "إليدان ستورمريج": {
        name: "أشعة العين (Eye Beam)", emoji: "🟢", chance: 0.25,
        execute: (monster, players, log) => {
            if (handleCooldown(monster, 'boss_illidan', 3, players, log, "ضرب بشفرتيه التوأم")) return;
            players.forEach(p => { if(!p.isDead) applyDamageToPlayer(p, Math.floor(monster.atk * 1.2)); });
            log.push(`🟢 **إليدان** أحرق الجميع بأشعة الفيل!`);
        }
    },
    "ديابلو سيد الرعب": {
        name: "برق الجحيم الأحمر", emoji: "🔴", chance: 0.30,
        execute: (monster, players, log) => {
            if (handleCooldown(monster, 'boss_diablo', 3, players, log, "ضرب بيده الشيطانية")) return;
            players.forEach(p => { if(!p.isDead) { applyDamageToPlayer(p, monster.atk); p.effects.push({type:'confusion', val:0.3, turns:2}); } });
            log.push(`🔴 **ديابلو** بث الرعب في القلوب!`);
        }
    },
    "باعل سيد الدمار": {
        name: "نسخة الظل", emoji: "👥", chance: 0.25,
        execute: (monster, players, log) => {
            if (handleCooldown(monster, 'boss_baal', 4, players, log, "هاجم بسحره الأسود")) return;
            monster.effects.push({ type: 'evasion', val: 0.5, turns: 2 }); 
            log.push(`👥 **باعل** استدعى نسخة، مما جعل إصابته صعبة جدًا!`);
        }
    },
    "الملك تيرانيوس": {
        name: "زئير مرعب", emoji: "🦖", chance: 0.25,
        execute: (monster, players, log) => {
            if (handleCooldown(monster, 'boss_trex', 4, players, log, "عض بفكيه القويين")) return;
            players.forEach(p => { 
                if(!p.isDead && !p.effects.some(e => e.type === 'stun') && Math.random()<0.4) {
                    p.effects.push({ type: 'stun', val: 1, turns: 1 });
                }
            });
            log.push(`🦖 **تيرانيوس** زأر بقوة مرعبة! (فرصة شلل بسبب الخوف)`);
        }
    },
    "زيوس جبار الصواعق": {
        name: "غضب الأولمب", emoji: "⚡", chance: 0.30,
        execute: (monster, players, log) => {
            if (handleCooldown(monster, 'boss_zeus', 3, players, log, "ضرب بصاعقة خفيفة")) return;
            players.forEach(t => { if(!t.isDead) applyDamageToPlayer(t, Math.floor(monster.atk * 1.2)); });
            log.push(`⚡ **زيوس** ألقى الصواعق على الجميع!`);
        }
    },
    "كريتوس شبح إسبارطة": {
        name: "غضب إسبارطة", emoji: "😡", chance: 0.25,
        execute: (monster, players, log) => {
            if (handleCooldown(monster, 'boss_kratos', 3, players, log, "لوح بشفرات الفوضى نحو")) return;
            const target = getSmartTarget(players, monster);
            if(target) { applyDamageToPlayer(target, Math.floor(monster.atk * 2.2)); log.push(`😡 **كريتوس** فقد أعصابه وانهال بالضرب الساحق على **${target.name}**!`); }
        }
    }
};

function getRandomMonster(type, theme, currentFloor = 1) {
    if (type === 'morax') return { name: "الامبراطور موراكس", emoji: "👑", image: "https://i.postimg.cc/Hx8d7XpD/morax.jpg" };
    let list = [];
    if (type === 'boss') list = dungeonConfig.monsters.bosses;
    else if (type === 'guardian') list = dungeonConfig.monsters.guardians;
    else {
        let themeKey = 'dark';
        const foundKey = Object.keys(dungeonConfig.themes).find(k => dungeonConfig.themes[k].name === theme.name);
        if (foundKey) themeKey = foundKey;
        if (dungeonConfig.monsters[themeKey]) {
            if (type === 'minion') list = dungeonConfig.monsters[themeKey].minions;
            else if (type === 'elite') list = dungeonConfig.monsters[themeKey].elites;
        }
        if (!list || list.length === 0) list = dungeonConfig.monsters['dark'][type === 'elite' ? 'elites' : 'minions'];
    }

    if (!list || list.length === 0) return { name: "وحش مجهول", hp: 100, atk: 10 };

    const randomIndex = Math.floor(Math.random() * list.length);
    const selection = list[randomIndex];

    let name = selection;
    let image = null;

    if (typeof selection === 'object' && selection !== null) {
        name = selection.name;
        image = selection.image;
    }

    return { name, emoji: theme.emoji, image, skillCooldowns: {} }; // تهيئة عداد التهدئة
}

module.exports = {
    getSmartTarget,
    checkBossPhase,
    GENERIC_MONSTER_SKILLS,
    MONSTER_SKILLS,
    getRandomMonster
};
