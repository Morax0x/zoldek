const { EmbedBuilder, Colors } = require('discord.js');
const { triggerMimicChest } = require('../mimic-chest');
const { triggerMysteryMerchant } = require('../mystery-merchant');

async function applyFloorBuffs(floor, players, threadChannel) {
    
    if (floor >= 51) {
        let buffApplied = false;
        let showMessage = (floor === 51); 

        players.forEach(p => {
            if (!p.isDead && !p.isPermDead && !p.hasFloor51Buff) {
                p.maxHp = Math.floor(p.maxHp * 2.0); 
                p.hp = p.maxHp; 
                p.effects.push({ type: 'atk_buff', val: 0.70, floors: 100 }); 
                
                p.hasFloor51Buff = true; 
                buffApplied = true;
            }
        });
        
        if (showMessage && buffApplied) {
            const buffEmbed = new EmbedBuilder()
                .setTitle('⚡ فـرسـان الدانـجون!')
                .setDescription(`**حـصـلتـم علـى اعتـراف الامبراطـور بسبب وصولكم لمنتصف الدانجـون:**\n\n🩸 **نقاط الصحة +100%** \n⚔️ **ضرر +70%** `)
                .setColor(Colors.Gold)
                .setImage('https://i.postimg.cc/PJSQZfwh/75.png'); 
            await threadChannel.send({ embeds: [buffEmbed] }).catch(()=>{});
        }
    }

    if (floor >= 75) {
        let buffApplied = false;
        let showMessage = (floor === 75);

        players.forEach(p => {
            if (!p.isDead && !p.isPermDead && !p.hasFloor75Buff) {
                p.maxHp = Math.floor(p.maxHp * 2.0); 
                p.hp = p.maxHp; 
                p.effects.push({ type: 'atk_buff', val: 0.80, floors: 100 }); 
                
                p.hasFloor75Buff = true; 
                buffApplied = true;
            }
        });

        if (showMessage && buffApplied) {
            const eliteEmbed = new EmbedBuilder()
                .setTitle('🔥 أسـيـاد الدانـجـون!')
                .setDescription(`**لقد تجاوزتم حدود البشر ووصلتم للأعماق السحيقة!**\nتعـزيـز تراكـمي:\n\n🩸 **نقاط الصحة +100%** \n⚔️ **ضرر +80%** `)
                .setColor(Colors.Red)
                .setImage('https://i.postimg.cc/PJSQZfwh/75.png'); 
            await threadChannel.send({ embeds: [eliteEmbed] }).catch(()=>{});
        }
    }

    if (floor >= 71 && floor <= 80) {
        let debuffApplied = false;
        players.forEach(p => {
            if (!p.isDead && !p.isPermDead && !p.effects.some(e => e.type === 'water_pressure')) {
                p.effects.push({ type: 'water_pressure', val: 0.15, turns: 1 });
                debuffApplied = true;
            }
        });
        if (debuffApplied && floor === 71) {
            await threadChannel.send(`🌊 **ضغط الأعماق يسحق أجسادكم!** (الدفاع انخفض بنسبة 15%)`).catch(()=>{});
        }
    }

    if (floor >= 81 && floor <= 90) {
        let debuffApplied = false;
        players.forEach(p => {
            if (!p.isDead && !p.isPermDead) {
                if (!p.originalCrit) p.originalCrit = p.critRate || 0.1;
                p.critRate = Math.max(0, (p.critRate || 0.1) - 0.10);
                debuffApplied = true;
            }
        });
        if (debuffApplied && floor === 81) {
            await threadChannel.send(`⚙️ **دخان المصانع يعيق الرؤية!** (انخفضت دقة الضربات الحرجة)`).catch(()=>{});
        }
    }
}

async function handleTrapEvent(floor, players, threadChannel, isTrapActive) {
    if (floor > 10 && floor < 90 && !isTrapActive && Math.random() < 0.001) { 
        const trapStartFloor = floor;
        const minTarget = floor + 2;
        const maxTarget = 90; 
        const targetFloor = Math.floor(Math.random() * (maxTarget - minTarget + 1)) + minTarget;
        
        const trapEmbed = new EmbedBuilder()
            .setTitle('⚠️ انـذار: شـذوذ زمـكـانـي!')
            .setDescription(`🌀 **لقد وقعتم في فخ الأبعاد!**\nتم قذفكم قسراً للأمام إلى الطابق **${targetFloor}**!\n\n☠️ الوحوش هنا لا ترحم...!`)
            .setColor(Colors.DarkRed)
            .setImage('https://i.postimg.cc/sxT4SfhV/bla.png'); 
        
        await threadChannel.send({ content: `**🌀 شذوذ زمكاني!**`, embeds: [trapEmbed] }).catch(()=>{});

        return { triggered: true, newFloor: targetFloor, trapStartFloor: trapStartFloor };
    }
    
    return { triggered: false };
}

async function handleRandomEvents(floor, lastEventFloor, lastEventType, threadChannel, players, db, guildId, merchantState, isTrapActive) {
    const canTriggerEvent = (floor - lastEventFloor) > 4;
    
    if (canTriggerEvent && floor > 5 && !isTrapActive && Math.random() < 0.30) {
        let eventToTrigger = '';
        if (lastEventType === 'merchant') eventToTrigger = 'chest'; 
        else if (lastEventType === 'chest') eventToTrigger = 'merchant'; 
        else eventToTrigger = Math.random() < 0.5 ? 'merchant' : 'chest';

        if (eventToTrigger === 'merchant') {
            await triggerMysteryMerchant(threadChannel, players, db, guildId, merchantState);
            return { type: 'merchant', floor: floor };
        } else {
            await triggerMimicChest(threadChannel, players);
            return { type: 'chest', floor: floor };
        }
    }
    
    return { type: lastEventType, floor: lastEventFloor };
}

module.exports = { applyFloorBuffs, handleTrapEvent, handleRandomEvents };
