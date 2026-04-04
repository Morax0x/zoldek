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

function checkBossPhase(monster, log) {
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
    { name: "عضة سامة", emoji: "🤮", chance: 0.3, execute: (m, p, l) => { 
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
        p.forEach(pl=>{if(!pl.isDead && Math.random()<0.5) {
            pl.effects.push({type:'weakness',val:0.3,turns:2});
            pl.threat = Math.floor((pl.threat || 0) * 0.5); 
        }}); 
        l.push(`🗣️ **${m.name}** أطلق صرخة مرعبة قللت عزيمة (وتهديد) الفريق!`);
    }},
    { name: "هجوم متوحش", emoji: "🐾", chance: 0.3, execute: (m, p, l, currentFloor) => { 
        p.forEach(pl=>{if(!pl.isDead) {
            let dmg = Math.floor(m.atk*0.8);
            if (currentFloor <= 18) {
                dmg = Math.min(dmg, 60); 
            }
            applyDamageToPlayer(pl, dmg);
        }}); 
        l.push(`🐾 **${m.name}** هاجم الجميع بوحشية!`);
    }},
    { name: "تصلب", emoji: "🛡️", chance: 0.15, execute: (m, p, l, currentFloor) => { 
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
    "تنين الأرض": { name: "هزة أرضية", emoji: "🌍", chance: 0.3, execute: (m,p,l) => { p.forEach(pl=>{if(!pl.isDead) applyDamageToPlayer(pl, Math.floor(m.atk*0.8))}); l.push(`🌍 **تنين الأرض** ضرب الأرض بقوة مسبباً زلزالاً!`); }},
    "طاغية الجبال": { name: "رمي الصخور", emoji: "🪨", chance: 0.3, execute: (m,p,l) => { const t=getSmartTarget(p, m); if(t){applyDamageToPlayer(t, m.atk*1.8); l.push(`🪨 **الطاغية** رمى صخرة عملاقة على **${t.name}**!`);} }},
    "العملاق الفولاذي": { name: "درع اللهب", emoji: "🔥", chance: 0.25, execute: (m,p,l) => { m.effects.push({type:'reflect', val:0.3, turns:2}); l.push(`🔥 **العملاق** أحاط نفسه بهالة نارية عاكسة!`); }},
    "سيد المعارك": { name: "غضب المحارب", emoji: "💢", chance: 0.3, execute: (m,p,l) => { m.atk = Math.floor(m.atk * 1.2); l.push(`💢 **سيد المعارك** دخل في حالة هيجان وزاد هجومه!`); }},
    "قرش الرمال": { name: "كمين رملي", emoji: "🦈", chance: 0.3, execute: (m,p,l) => { const t=getSmartTarget(p, m); if(t){applyDamageToPlayer(t, m.atk*1.5); t.effects.push({type:'stun',val:1,turns:1}); l.push(`🦈 **القرش** باغث **${t.name}** من تحت الرمال!`);} }},
    "عفريت النار": { name: "كرة اللهب", emoji: "☄️", chance: 0.3, execute: (m,p,l) => { p.forEach(pl=>{if(!pl.isDead && Math.random()<0.6) pl.effects.push({type:'burn',val:Math.floor(m.atk*0.2),turns:3})}); l.push(`☄️ **العفريت** أطلق كرات نارية حارقة!`); }},

    // ========================
    // ❄️ وحوش النخبة: الجليد
    // ========================
    "عملاق الصقيع": { name: "نفس متجمد", emoji: "❄️", chance: 0.3, execute: (m,p,l) => { const t=getSmartTarget(p, m); if(t){applyDamageToPlayer(t, m.atk); t.effects.push({type:'stun',val:1,turns:1}); l.push(`❄️ **العملاق** جمد **${t.name}** بأنفاسه!`);} }},
    "الدب الفولاذي": { name: "تمزيق", emoji: "🐾", chance: 0.3, execute: (m,p,l) => { const t=getSmartTarget(p, m); if(t){applyDamageToPlayer(t, m.atk*1.2); t.effects.push({type:'poison',val:Math.floor(m.atk*0.1),turns:3}); l.push(`🐾 **الدب** مزق **${t.name}** (نزيف)!`);} }},
    "التنين اليافع": { name: "عاصفة ثلجية", emoji: "🌨️", chance: 0.25, execute: (m,p,l) => { p.forEach(pl=>{if(!pl.isDead) applyDamageToPlayer(pl, Math.floor(m.atk*0.7))}); l.push(`🌨️ **التنين** استدعى عاصفة ثلجية!`); }},
    "فارس الغسق": { name: "سيف الظلام", emoji: "🌑", chance: 0.3, execute: (m,p,l) => { const t=getSmartTarget(p, m); if(t){applyDamageToPlayer(t, m.atk*1.6); l.push(`🌑 **فارس الغسق** وجه ضربة مشبعة بالظلام لـ **${t.name}**!`);} }},
    "الحرس الملكي": { name: "تشكيل دفاعي", emoji: "🛡️", chance: 0.25, execute: (m,p,l) => { m.hp += Math.floor(m.maxHp * 0.1); l.push(`🛡️ **الحرس الملكي** استعاد ترتيب صفوفه وترمم!`); }},
    "ذئب القطب": { name: "عواء القطيع", emoji: "🐺", chance: 0.3, execute: (m,p,l) => { m.atk = Math.floor(m.atk*1.15); l.push(`🐺 **الذئب** عوى لرفع معنوياته القتالية!`); }},

    // ========================
    // 🌲 وحوش النخبة: الغابة
    // ========================
    "حارس اللعنة القديمة": { name: "أمر بالهجوم", emoji: "🧿", chance: 0.3, execute: (m,p,l) => { const t=getSmartTarget(p, m); if(t){applyDamageToPlayer(t, m.atk*1.4); l.push(`🧿 **الحارس** أطلق لعنته لنهش **${t.name}**!`);} }},
    "العملاق المتجذر": { name: "سحق العظام", emoji: "🪵", chance: 0.3, execute: (m,p,l) => { const t=getSmartTarget(p, m); if(t){applyDamageToPlayer(t, m.atk*1.3); t.effects.push({type:'weakness',val:0.2,turns:2}); l.push(`🪵 **العملاق** حطم دفاعات **${t.name}** بجذوره!`);} }},
    "سيد الأدغال المتوحش": { name: "سرعة خاطفة", emoji: "⚡", chance: 0.3, execute: (m,p,l) => { m.effects.push({type:'evasion',val:0.3,turns:2}); const t=getSmartTarget(p, m); if(t) applyDamageToPlayer(t, m.atk); l.push(`⚡ **سيد الأدغال** هاجم بسرعة خيالية تزيد مراوغته!`); }},
    "تنين الغابة الزمردي": { name: "عصر مميت", emoji: "🐉", chance: 0.3, execute: (m,p,l) => { const t=getSmartTarget(p, m); if(t){applyDamageToPlayer(t, m.atk); t.effects.push({type:'stun',val:1,turns:1}); l.push(`🐉 **التنين** اعتصر **${t.name}** وشل حركته!`);} }},
    "كاهن الطبيعة المظلم": { name: "لعنة الطبيعة", emoji: "🧙‍♂️", chance: 0.3, execute: (m,p,l) => { const t=p.sort((a,b)=>a.hp-b.hp)[0]; if(t){applyDamageToPlayer(t, m.atk*2.0); l.push(`🧙‍♂️ **الكاهن** صب غضب الطبيعة على الأضعف **${t.name}**!`);} }},
    "وحش المستنقع الآسن": { name: "تعفن", emoji: "🦠", chance: 0.3, execute: (m,p,l) => { const t=getSmartTarget(p, m); if(t){applyDamageToPlayer(t, m.atk); t.effects.push({type:'poison',val:Math.floor(m.atk*0.15),turns:3}); l.push(`🦠 **وحش المستنقع** لوث جروح **${t.name}**!`);} }},
    "كاسر العظام": { name: "ضربة ساحقة", emoji: "🔨", chance: 0.3, execute: (m,p,l) => { const t=getSmartTarget(p, m); if(t){applyDamageToPlayer(t, m.atk*1.5); l.push(`🔨 **كاسر العظام** سدد ضربة مهشمة لـ **${t.name}**!`);} }},

    // ========================
    // 🌑 وحوش النخبة: الظلام
    // ========================
    "قائد الفيالق": { name: "صرخة الحرب", emoji: "📢", chance: 0.25, execute: (m,p,l) => { p.forEach(pl=>{if(!pl.isDead) pl.effects.push({type:'weakness',val:0.2,turns:2})}); l.push(`📢 **القائد** أرهب الجميع بصرخته!`); }},
    "ساحر الظلمات": { name: "كرة الظل", emoji: "🔮", chance: 0.3, execute: (m,p,l) => { const t=getSmartTarget(p, m); if(t){applyDamageToPlayer(t, m.atk*1.2); t.effects.push({type:'blind',val:0.5,turns:2}); l.push(`🔮 **الساحر** أعمى بصيرة **${t.name}**!`);} }},
    "عقرب الموت": { name: "إبرة الموت", emoji: "🦂", chance: 0.3, execute: (m,p,l) => { const t=getSmartTarget(p, m); if(t){applyDamageToPlayer(t, m.atk); t.effects.push({type:'poison',val:Math.floor(m.atk*0.3),turns:3}); l.push(`🦂 **العقرب** حقن سماً قاتلاً في **${t.name}**!`);} }},
    "الجزار المدرع": { name: "ساطور الجزار", emoji: "🔪", chance: 0.3, execute: (m,p,l) => { const t=getSmartTarget(p, m); if(t){applyDamageToPlayer(t, m.atk*1.7); l.push(`🔪 **الجزار** هوى بساطوره على **${t.name}**!`);} }},
    "زعيم العصيان": { name: "غدر", emoji: "🗡️", chance: 0.3, execute: (m,p,l) => { const t=getSmartTarget(p, m); if(t){applyDamageToPlayer(t, m.atk*1.5); l.push(`🗡️ **الزعيم** طعن **${t.name}** غدراً!`);} }},
    "الفارس الأسود": { name: "اختراق", emoji: "⚔️", chance: 0.3, execute: (m,p,l) => { const t=getSmartTarget(p, m); if(t){applyDamageToPlayer(t, m.atk*1.3); l.push(`⚔️ **الفارس الأسود** اخترق دفاع **${t.name}**!`);} }},
    "مسخ الكيميرا": { name: "هجوم ثلاثي", emoji: "🐉", chance: 0.25, execute: (m,p,l) => { const targets=p.filter(pl=>!pl.isDead).slice(0,3); targets.forEach(t=>applyDamageToPlayer(t, m.atk)); l.push(`🐉 **الكيميرا** هاجمت برؤوسها الثلاثة!`); }},
    "سيد السهام": { name: "مطر السهام", emoji: "🏹", chance: 0.3, execute: (m,p,l) => { p.forEach(pl=>{if(!pl.isDead) applyDamageToPlayer(pl, Math.floor(m.atk*0.6))}); l.push(`🏹 **سيد السهام** أمطر الفريق بوابل من الأسهم!`); }},
    "حارس النخبة": { name: "صد", emoji: "🛡️", chance: 0.3, execute: (m,p,l) => { m.hp += Math.floor(m.maxHp * 0.08); l.push(`🛡️ **الحارس** اتخذ وضعية دفاعية!`); }},
    "السفاح الهائج": { name: "هيجان دموية", emoji: "🩸", chance: 0.25, execute: (m,p,l) => { m.atk = Math.floor(m.atk*1.3); applyDamageToPlayer(m, Math.floor(m.maxHp*0.05)); l.push(`🩸 **السفاح** جرح نفسه ليزداد جنوناً وقوة!`); }},
    "متلاعب العناصر": { name: "انفجار عنصري", emoji: "🌀", chance: 0.3, execute: (m,p,l) => { p.forEach(pl=>{if(!pl.isDead) { applyDamageToPlayer(pl, Math.floor(m.atk*0.8)); pl.effects.push({type:'burn',val:Math.floor(m.atk*0.1),turns:2}); }}); l.push(`🌀 **المتلاعب** فجر طاقة العناصر!`); }},
    "خنجر الظلال": { name: "اغتيال الظل", emoji: "👤", chance: 0.3, execute: (m,p,l) => { const t=p.sort((a,b)=>a.hp-b.hp)[0]; if(t){applyDamageToPlayer(t, m.atk*1.8); l.push(`👤 **الخنجر** ظهر خلف **${t.name}** وطعنه!`);} }},
    "سيد السموم": { name: "سحابة سامة", emoji: "🌫️", chance: 0.3, execute: (m,p,l) => { p.forEach(pl=>{if(!pl.isDead) pl.effects.push({type:'poison',val:Math.floor(m.atk*0.25),turns:4})}); l.push(`🌫️ **سيد السموم** نشر وباءً في الهواء!`); }},

    // ========================
    // 🌊 وحوش النخبة: أطلانتس
    // ========================
    "تنين الأمواج": { name: "تسونامي", emoji: "🌊", chance: 0.3, execute: (m,p,l) => { p.forEach(pl=>{if(!pl.isDead) { applyDamageToPlayer(pl, m.atk); pl.effects.push({type:'stun',val:1,turns:1}); }}); l.push(`🌊 **تنين الأمواج** أغرق الفريق بموجة عملاقة!`); }},
    "حارس المعبد": { name: "درع المرجان", emoji: "🛡️", chance: 0.25, execute: (m,p,l) => { m.shield += Math.floor(m.maxHp * 0.15); l.push(`🛡️ **حارس المعبد** احتمى بدرع مرجاني صلب!`); }},
    "سيد اللجة": { name: "ضغط الأعماق", emoji: "⚓", chance: 0.3, execute: (m,p,l) => { const t=getSmartTarget(p, m); if(t){applyDamageToPlayer(t, m.atk*1.5); t.effects.push({type:'weakness',val:0.4,turns:2}); l.push(`⚓ **سيد اللجة** سحق **${t.name}** بضغط الماء!`);} }},
    "ليفايثان": { name: "دوامة", emoji: "🌀", chance: 0.25, execute: (m,p,l) => { p.forEach(pl=>{if(!pl.isDead) applyDamageToPlayer(pl, Math.floor(m.atk*0.9))}); l.push(`🌀 **ليفايثان** خلق دوامة مدمرة!`); }},
    "المدرع المائي": { name: "قوقعة صلبة", emoji: "🐢", chance: 0.3, execute: (m,p,l) => { m.effects.push({type:'reflect', val:0.4, turns:2}); l.push(`🐢 **المدرع المائي** اختبأ في قوقعته العاكسة!`); }},
    "حارس الكنز": { name: "لعنة الذهب", emoji: "💰", chance: 0.3, execute: (m,p,l) => { const t=getSmartTarget(p, m); if(t){applyDamageToPlayer(t, m.atk); t.effects.push({type:'stun',val:1,turns:1}); l.push(`💰 **حارس الكنز** لعن **${t.name}** بسبب طمعه!`);} }},

    // ========================
    // ⚙️ وحوش النخبة: الأطلال المنسية
    // ========================
    "غولم الفولاذ": { name: "لكمة هيدروليكية", emoji: "🦾", chance: 0.3, execute: (m,p,l) => { const t=getSmartTarget(p, m); if(t){applyDamageToPlayer(t, m.atk*2.0); l.push(`🦾 **الغولم** سدد لكمة تسحق العظام لـ **${t.name}**!`);} }},
    "سايبورغ": { name: "ليزر مركز", emoji: "🔴", chance: 0.3, execute: (m,p,l) => { const t=getSmartTarget(p, m); if(t){applyDamageToPlayer(t, m.atk*1.6); t.effects.push({type:'burn',val:Math.floor(m.atk*0.2),turns:2}); l.push(`🔴 **السايبورغ** حرق **${t.name}** بالليزر!`);} }},
    "سيد التروس": { name: "طحن", emoji: "⚙️", chance: 0.3, execute: (m,p,l) => { p.forEach(pl=>{if(!pl.isDead) applyDamageToPlayer(pl, Math.floor(m.atk*0.7))}); l.push(`⚙️ **سيد التروس** شغل الآلات لطحن الفريق!`); }},
    "الدبابة": { name: "قصف مدفعي", emoji: "💣", chance: 0.25, execute: (m,p,l) => { p.forEach(pl=>{if(!pl.isDead) applyDamageToPlayer(pl, m.atk)}); l.push(`💣 **الدبابة** قصفت الموقع بالكامل!`); }},
    "المحرقة": { name: "حرق شامل", emoji: "🔥", chance: 0.3, execute: (m,p,l) => { p.forEach(pl=>{if(!pl.isDead) pl.effects.push({type:'burn',val:Math.floor(m.atk*0.3),turns:4})}); l.push(`🔥 **المحرقة** فتحت أبواب الجحيم!`); }},
    "المدمر": { name: "تدمير ذاتي", emoji: "💥", chance: 0.1, execute: (m,p,l) => { if(m.hp < m.maxHp*0.2) { p.forEach(pl=>{if(!pl.isDead) applyDamageToPlayer(pl, m.atk*3)}); m.hp = 0; l.push(`💥 **المدمر** فجر نفسه محاولاً أخذكم معه!`); } else { m.atk = Math.floor(m.atk*1.2); l.push(`🤖 **المدمر** بدأ شحن طاقته القصوى!`); } }},

    // ========================
    // 👑 الزعماء (Bosses)
    // ========================
    "كراكن": {
        name: "عصر المجسات", emoji: "🦑", chance: 0.25,
        execute: (monster, players, log) => {
            const target = getSmartTarget(players, monster);
            if(target) {
                applyDamageToPlayer(target, Math.floor(monster.atk * 1.5));
                target.effects.push({type:'stun', val:1, turns:2});
                log.push(`🦑 **كراكن** لف مجساته حول **${target.name}** وعصره! (شلل)`);
            }
        }
    },
    "أوميغا": {
        name: "شعاع الإبادة", emoji: "☢️", chance: 0.20,
        execute: (monster, players, log) => {
            players.forEach(p => { if(!p.isDead) applyDamageToPlayer(p, Math.floor(monster.atk * 1.8)); });
            log.push(`☢️ **أوميغا** أطلق شعاع الإبادة الجماعية!`);
        }
    },
    "مالينيا، نصل ميكيلا": {
        name: "رقصة الموت (Dance of Death)", emoji: "🌸", chance: 0.25,
        execute: (monster, players, log) => {
            let totalDmg = 0;
            players.forEach(p => {
                if (!p.isDead) {
                    const dmg = Math.floor(monster.atk * 1.5);
                    const actualDmg = applyDamageToPlayer(p, dmg);
                    totalDmg += actualDmg;
                    monster.hp = Math.min(monster.maxHp, monster.hp + Math.floor(actualDmg * 0.5));
                }
            });
            log.push(`🌸 **مالينيا** حلقت ونفذت **رقصة الموت**! (امتصاص صحة الفريق)`);
        }
    },
    "الجنرال رادان": {
        name: "نجمة القهر", emoji: "☄️", chance: 0.20,
        execute: (monster, players, log) => {
            const target = getSmartTarget(players, monster);
            if (target) {
                applyDamageToPlayer(target, Math.floor(monster.atk * 2.5));
                target.effects.push({ type: 'weakness', val: 0.5, turns: 2 });
                log.push(`☄️ **رادان** سحق **${target.name}** بقوة النجوم!`);
            }
        }
    },
    "ماليكيث، النصل الأسود": {
        name: "الموت المقدر", emoji: "🗡️", chance: 0.30,
        execute: (monster, players, log) => {
            players.forEach(p => { if (!p.isDead) { p.hp -= Math.floor(p.hp * 0.20); p.effects.push({ type: 'burn', val: Math.floor(monster.atk * 0.2), turns: 3 }); } });
            log.push(`🗡️ **ماليكيث** أطلق العنان للموت المقدر! (HP Cut + Burn)`);
        }
    },
    "غودفري، الإلدن لورد": {
        name: "زلزال هورا لوكس", emoji: "🌋", chance: 0.25,
        execute: (monster, players, log) => {
            players.forEach(p => { 
                if (!p.isDead) { 
                    applyDamageToPlayer(p, Math.floor(monster.atk * 0.9)); 
                    if (Math.random() < 0.5) p.effects.push({ type: 'stun', val: 1, turns: 1 }); 
                } 
            });
            log.push(`🌋 **غودفري** مزق الأرض! (ضرر + طرح أرضاً "شلل")`);
        }
    },
    "الساحرة راني": {
        name: "قمر الظلام البارد", emoji: "🌕", chance: 0.25,
        execute: (monster, players, log) => {
            players.forEach(p => { if(!p.isDead) { applyDamageToPlayer(p, monster.atk); p.effects.push({type:'weakness', val:0.3, turns:2}); } });
            log.push(`🌕 **راني** أطلقت سحر القمر المظلم! (تجميد/ضعف)`);
        }
    },
    "إيشين قديس السيف": {
        name: "تقنية البرق", emoji: "⚡", chance: 0.30,
        execute: (monster, players, log) => {
            const target = getSmartTarget(players, monster);
            if(target) { 
                applyDamageToPlayer(target, Math.floor(monster.atk * 2.2)); 
                target.effects.push({ type: 'stun', val: 1, turns: 1 }); 
                log.push(`⚡ **إيشين** صعق **${target.name}** بالبرق وشل حركته!`); 
            }
        }
    },
    "النامليس كينج": {
        name: "عاصفة الرعد", emoji: "🌩️", chance: 0.25,
        execute: (monster, players, log) => {
            players.forEach(p => { if(!p.isDead) applyDamageToPlayer(p, Math.floor(monster.atk * 1.1)); });
            log.push(`🌩️ **الملك المجهول** استدعى العاصفة!`);
        }
    },
    "أرتورياس، سائر الهاوية": {
        name: "شقلبة الهاوية", emoji: "🤸", chance: 0.30,
        execute: (monster, players, log) => {
            const target = getSmartTarget(players, monster);
            if(target) { applyDamageToPlayer(target, Math.floor(monster.atk * 1.8)); monster.atk = Math.floor(monster.atk * 1.1); log.push(`🌑 **أرتورياس** سحق **${target.name}** وازداد غضباً!`); }
        }
    },
    "سول أوف سيندر": {
        name: "كومبو السيف الملتوي", emoji: "🔥", chance: 0.25,
        execute: (monster, players, log) => {
            const target = getSmartTarget(players, monster);
            if(target) { applyDamageToPlayer(target, Math.floor(monster.atk * 1.5)); target.effects.push({type:'burn', val: Math.floor(monster.atk*0.3), turns:2}); log.push(`🔥 **روح الرماد** أحرق **${target.name}**!`); }
        }
    },
    "مانوس أبو الهاوية": {
        name: "وابل الظلام (Dark Bead)", emoji: "⚫", chance: 0.25,
        execute: (monster, players, log) => {
            players.forEach(p => { if (!p.isDead) { applyDamageToPlayer(p, Math.floor(monster.atk * 1.6)); p.effects.push({ type: 'blind', val: 0.5, turns: 2 }); } });
            log.push(`⚫ **مانوس** أطلق سحر **وابل الظلام**! (ضرر + عمى)`);
        }
    },
    "سيفيروث": {
        name: "سوبر نوفا", emoji: "🌌", chance: 0.15,
        execute: (monster, players, log) => {
            players.forEach(p => { if (!p.isDead) { const dmg = Math.floor(p.hp * 0.5); applyDamageToPlayer(p, dmg); p.effects.push({ type: 'confusion', val: 0.5, turns: 2 }); } });
            log.push(`🌌 **سيفيروث** دمر النظام الشمسي بـ **سوبر نوفا**! (HP -50%)`);
        }
    },
    "فيرجل، العاصفة المقتربة": {
        name: "Judgment Cut End", emoji: "⚔️", chance: 0.20,
        execute: (monster, players, log) => {
            players.forEach(p => { if(!p.isDead) applyDamageToPlayer(p, Math.floor(monster.atk * 1.3)); });
            log.push(`⚔️ **فيرجل** قطع الزمان والمكان!`);
        }
    },
    // 🔥 تم النيرف بنجاح لزعيمك المفضل 🔥
    "دانتي صائد الشياطين": {
        name: "Devil Trigger", emoji: "😈", chance: 0.20,
        execute: (monster, players, log) => {
            const healAmount = Math.floor(monster.maxHp * 0.05); // 5% فقط علاج بدل 15%
            monster.hp = Math.min(monster.maxHp, monster.hp + healAmount);
            monster.atk = Math.floor(monster.atk * 1.10); // 10% زيادة هجوم بدل 25%
            log.push(`😈 **دانتي** فعل **Devil Trigger**! (استعاد ${healAmount} HP + زيادة طفيفة للهجوم)`);
        }
    },
    "نيمسيس": {
        name: "قاذف الصواريخ", emoji: "🚀", chance: 0.25,
        execute: (monster, players, log) => {
            const target = getSmartTarget(players, monster);
            if(target) { applyDamageToPlayer(target, Math.floor(monster.atk * 2.0)); log.push(`🚀 **نيمسيس** أطلق صاروخاً على **${target.name}**!`); }
        }
    },
    "ويسكر المتحول": {
        name: "انتقال فوري", emoji: "🕶️", chance: 0.30,
        execute: (monster, players, log) => {
            const alive = players.filter(p => !p.isDead);
            if(alive.length === 0) return;
            const target = alive.sort((a,b) => b.atk - a.atk)[0]; 
            if(target) { 
                applyDamageToPlayer(target, Math.floor(monster.atk * 1.5)); 
                target.effects.push({ type: 'stun', val: 1, turns: 1 });
                log.push(`🕶️ **ويسكر** باغث **${target.name}** وشل حركته!`); 
            }
        }
    },
    "بيراميد هيد": {
        name: "حكم الإعدام", emoji: "🔪", chance: 0.25,
        execute: (monster, players, log) => {
            const target = getSmartTarget(players, monster);
            if(target) { applyDamageToPlayer(target, Math.floor(monster.atk * 2.0)); target.effects.push({type:'burn', val: Math.floor(monster.atk*0.2), turns:3}); log.push(`🔪 **بيراميد هيد** شق **${target.name}** بسكينه العظيم! (نزيف)`); }
        }
    },
    "آرثاس، الليتش كينج": {
        name: "غضب فروستمورن", emoji: "❄️", chance: 0.25,
        execute: (monster, players, log) => {
            const target = getSmartTarget(players, monster);
            if(target) { 
                applyDamageToPlayer(target, Math.floor(monster.atk * 1.5)); 
                target.effects.push({ type: 'stun', val: 1, turns: 1 }); 
                log.push(`❄️ **آرثاس** جمد **${target.name}** بالكامل!`); 
            }
        }
    },
    "إليدان ستورمريج": {
        name: "أشعة العين (Eye Beam)", emoji: "🟢", chance: 0.25,
        execute: (monster, players, log) => {
            players.forEach(p => { if(!p.isDead) applyDamageToPlayer(p, Math.floor(monster.atk * 1.2)); });
            log.push(`🟢 **إليدان** أحرق الجميع بأشعة الفيل!`);
        }
    },
    "ديث وينج المدمر": {
        name: "كتاكليزم", emoji: "🔥", chance: 0.10,
        execute: (monster, players, log) => {
            players.forEach(p => { if(!p.isDead) { applyDamageToPlayer(p, Math.floor(monster.atk * 2)); p.effects.push({ type: 'burn', val: Math.floor(monster.atk * 0.3), turns: 5 }); } });
            log.push(`🔥 **ديث وينج** أحرق العالم! (ضرر هائل + حرق)`);
        }
    },
    "ديابلو سيد الرعب": {
        name: "برق الجحيم الأحمر", emoji: "🔴", chance: 0.30,
        execute: (monster, players, log) => {
            players.forEach(p => { if(!p.isDead) { applyDamageToPlayer(p, monster.atk); p.effects.push({type:'confusion', val:0.3, turns:2}); } });
            log.push(`🔴 **ديابلو** بث الرعب في القلوب!`);
        }
    },
    "باعل سيد الدمار": {
        name: "نسخة الظل", emoji: "👥", chance: 0.20,
        execute: (monster, players, log) => {
            monster.effects.push({ type: 'evasion', val: 0.5, turns: 2 }); 
            log.push(`👥 **باعل** استدعى نسخة، مما جعل إصابته صعبة!`);
        }
    },
    "ميفيستو سيد الكراهية": {
        name: "نوفا السموم", emoji: "☠️", chance: 0.30,
        execute: (monster, players, log) => {
            players.forEach(p => { if(!p.isDead) p.effects.push({type:'poison', val: Math.floor(monster.atk*0.4), turns:3}); });
            log.push(`☠️ **ميفيستو** أطلق موجة سموم قاتلة!`);
        }
    },
    "الملك تيرانيوس": {
        name: "زئير مرعب", emoji: "🦖", chance: 0.30,
        execute: (monster, players, log) => {
            players.forEach(p => { 
                if(!p.isDead && Math.random()<0.5) p.effects.push({ type: 'stun', val: 1, turns: 1 });
            });
            log.push(`🦖 **تيرانيوس** زأر بقوة مرعبة! (شلل بسبب الخوف)`);
        }
    },
    "زيوس جبار الصواعق": {
        name: "غضب الأولمب", emoji: "⚡", chance: 0.30,
        execute: (monster, players, log) => {
            players.forEach(t => { if(!t.isDead) applyDamageToPlayer(t, Math.floor(monster.atk * 1.2)); });
            log.push(`⚡ **زيوس** ألقى الصواعق على الجميع!`);
        }
    },
    "كريتوس شبح إسبارطة": {
        name: "غضب إسبارطة", emoji: "😡", chance: 0.25,
        execute: (monster, players, log) => {
            const target = getSmartTarget(players, monster);
            if(target) { applyDamageToPlayer(target, Math.floor(monster.atk * 3.0)); log.push(`😡 **كريتوس** فقد أعصابه وانهال بالضرب على **${target.name}**!`); }
        }
    },

    // ========================
    // 🛡️ الحراس (Guardians)
    // ========================
    "حارس البوابة الأخير": { name: "الدرع العظيم", emoji: "🛡️", chance: 0.3, execute: (m,p,l) => { m.hp += Math.floor(m.maxHp * 0.1); l.push(`🛡️ **الحارس** رفع درعه وترمم!`); } },
    "درع العرش المنيع": { name: "عكس الضرر", emoji: "🔄", chance: 0.3, execute: (m,p,l) => { m.effects.push({type:'reflect', val:0.5, turns:2}); l.push(`🔄 **درع العرش** فعل وضعية الانعكاس!`); } },
    "حامي الختم المقدس": { name: "تطهير", emoji: "✨", chance: 0.3, execute: (m,p,l) => { m.effects = []; m.hp += Math.floor(m.maxHp*0.05); l.push(`✨ **الحامي** طهر نفسه من اللعنات!`); } },
    "ظل الملك القاتل": { name: "اغتيال", emoji: "🗡️", chance: 0.3, execute: (m,p,l) => { const t=p.filter(x=>!x.isDead).sort((a,b)=>a.hp-b.hp)[0]; if(t){applyDamageToPlayer(t, Math.floor(m.atk*2)); l.push(`🗡️ **الظل** اغتال أضعف حلقة: **${t.name}**!`);} } },
    "الجنرال الذي لا يقهر": { name: "هجوم كاسح", emoji: "⚔️", chance: 0.3, execute: (m,p,l) => { p.forEach(pl=>{if(!pl.isDead) applyDamageToPlayer(pl, Math.floor(m.atk*1.2))}); l.push(`⚔️ **الجنرال** نفذ هجوماً كاسحاً!`); } },
    "المدرع الأسطوري": { name: "تحطيم الأرض", emoji: "🔨", chance: 0.3, execute: (m,p,l) => { p.forEach(pl=>{if(!pl.isDead) applyDamageToPlayer(pl, m.atk)}); l.push(`🔨 **المدرع** حطم الأرض تحتكم!`); } },
    "كابوس الأبعاد": { name: "رعب", emoji: "👻", chance: 0.3, execute: (m,p,l) => { p.forEach(pl=>{if(!pl.isDead) pl.effects.push({type:'confusion',val:0.5,turns:2})}); l.push(`👻 **الكابوس** بث الرعب في القلوب!`); } },
    "حارس الجحيم الأزلي": { name: "نفس اللهب", emoji: "🔥", chance: 0.3, execute: (m,p,l) => { p.forEach(pl=>{if(!pl.isDead) pl.effects.push({type:'burn',val:Math.floor(m.atk*0.2),turns:3})}); l.push(`🔥 **الحارس** نفث نيران الجحيم!`); } }
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

    return { name, emoji: theme.emoji, image };
}

module.exports = {
    getSmartTarget,
    checkBossPhase,
    GENERIC_MONSTER_SKILLS,
    MONSTER_SKILLS,
    getRandomMonster
};
