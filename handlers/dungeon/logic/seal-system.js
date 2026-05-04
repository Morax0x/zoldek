function getFloorCaps(floor) {
    let damageCap = Infinity; 
    let levelCap = 30;        

    if (floor >= 1 && floor <= 5) {
        damageCap = 50;
    } 
    else if (floor >= 6 && floor <= 10) {
        damageCap = 90;
    }
    else if (floor >= 11 && floor <= 14) {
        damageCap = 120;
    }
    else if (floor >= 15 && floor <= 18) {
        levelCap = 10;
    }
    else if (floor >= 19 && floor <= 50) {
        levelCap = 20;
    }
    else {
        levelCap = 30; 
    }

    return { damageCap, levelCap };
}

async function checkSealMessages(floor, players, threadChannel) {
    if (floor === 1) {
        players.forEach(p => {
            threadChannel.send(`✶ <@${p.id}> تـم ختـم قوتك! لن تتمكن من تجاوز حدود معينة للدمج مهما كانت قوتك.`).catch(() => {});
        });
    }

    if (floor === 15) {
        players.forEach(p => {
            if (!p.isDead) { 
                threadChannel.send(`✶ <@${p.id}> كسرت الختم بشكل جزئي.. يمكنك الآن استخدام قوتك حتى (Level 10)!`).catch(() => {});
            }
        });
    }
    
    if (floor === 19) {
        players.forEach(p => {
            if (!p.isDead) { 
                threadChannel.send(`✶ <@${p.id}> تـم كـسـر الخـتم وأطلق العنان لقوتك حتى (Level 20)!`).catch(() => {});
            }
        });
    }
}

module.exports = { getFloorCaps, checkSealMessages };
