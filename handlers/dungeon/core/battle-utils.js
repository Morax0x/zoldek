const { EmbedBuilder } = require('discord.js');

function cleanName(name) {
    if (!name) return "Unknown";
    const separators = ['»', '•', '✦', '★', '❖', '✧', '✬', '〢', '┇', '\\|', '~', '⚡'];
    const regex = new RegExp(`\\s*([${separators.join('')}]).*`, 'g');
    return name.replace(regex, '').trim();
}

function handleLeaderSuccession(players, log) {
    const currentLiveLeader = players.find(p => p.class === 'Leader' && !p.isDead);

    if (currentLiveLeader) {
        players.forEach(p => {
            if (!p.isDead && p.class === 'Former Leader') {
                p.class = p.originalClass || 'Adventurer';
            }
        });
        return; 
    }
     
    const deadLeader = players.find(p => p.class === 'Leader' && p.isDead);

    if (!deadLeader) {
        return;
    }

    deadLeader.class = 'Former Leader';

    let successor = players.find(p => !p.isDead && p.class !== 'Leader' && p.class !== 'Former Leader' && p.class !== 'Priest');
     
    if (!successor) {
        successor = players.find(p => !p.isDead && p.class !== 'Leader');
    }

    if (successor) {
        const oldClass = successor.class;
        
        successor.class = 'Leader'; 
        
        log.push(`⚠️ **نظـام الوراثـة:** سقط القائد **${deadLeader.name}**!`);

        if (oldClass === 'Priest' || successor.isHybridPriest) {
            successor.isHybridPriest = true;
            log.push(`🚩✨ **${successor.name}** حمل الراية وأصبح **القائـد الكاهـن**! (جمع بين القيادة والشفاء)`);
        } else {
            log.push(`🚩 **${successor.name}** حمل الراية وأصبح **القائد الجديد**!`);
        }
    } else {
        log.push(`☠️ **سقط القائد** ولا يوجد من يحمل الراية...`);
    }
}

function checkDeaths(players, floor, log, threadChannel) {
    let someoneDied = false;

    players.forEach(p => {
        if (!p.isDead && p.hp <= 0) {
            p.hp = 0;
            p.isDead = true;
            p.deathFloor = floor;
            someoneDied = true;
            
            if ((p.class === 'Priest' || p.isHybridPriest) && !p.isPermDead) {
                players.forEach(m => { 
                    if(!m.isDead) m.hp = Math.min(m.maxHp, m.hp + Math.floor(m.maxHp * 0.4)); 
                });
                log.push(`⚰️ **سقـط الكـاهـن** - قـام بعلاج الفريق على الرمق الاخـير!`);
                threadChannel.send(`✨⚰️ **${p.name}** سقـط الكـاهـن - قـام بعلاج الفريق على الرمق الاخـير!`).catch(()=>{});
            }

            if (p.reviveCount >= 1) {
                p.isPermDead = true;
                log.push(`💀 **${p.name}** سقط وتحللت جثته!`);
                threadChannel.send(`💀 **${p.name}** سقط وتحللت جثته - لا يمكن إحياؤه!`).catch(()=>{});
            } else {
                log.push(`💀 **${p.name}** سقط!`);
                threadChannel.send(`💀 **${p.name}** سقط في أرض المعركة!`).catch(()=>{});
            }
        }
    });

    if (someoneDied) {
        handleLeaderSuccession(players, log);
    }
}

module.exports = { cleanName, checkDeaths, handleLeaderSuccession };
