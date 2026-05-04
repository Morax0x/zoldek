const farmAnimals = require('../json/farm-animals.json');

async function getPlayerCapacity(client, userId, guildId) {
    const userData = await client.getLevel(userId, guildId) || {};
    const userLevel = userData.level || 0;
    
    if (userLevel <= 5) return 30;
    if (userLevel <= 10) return 80;
    if (userLevel <= 20) return 150;
    if (userLevel <= 30) return 250;
    if (userLevel <= 40) return 350;
    if (userLevel <= 50) return 500;
    if (userLevel <= 60) return 600;
    if (userLevel <= 70) return 700;
    if (userLevel <= 80) return 800;
    return 1000;
}

async function getUsedCapacity(db, userId, guildId) {
    let totalSize = 0;
    try {
        const userFarmRes = await db.query("SELECT animalid, quantity FROM user_farm WHERE userid = $1 AND guildid = $2", [userId, guildId]);
        const userFarmRows = userFarmRes.rows;
        
        for (const row of userFarmRows) {
            const animalIdStr = String(row.animalid);
            const animal = farmAnimals.find(a => String(a.id) === animalIdStr);
            const qty = parseInt(row.quantity) || 1; 

            if (animal) {
                const size = parseInt(animal.size) || 1; 
                totalSize += (qty * size);
            } else {
                totalSize += qty;
            }
        }
    } catch (e) {
        console.error(e);
    }
    return totalSize;
}

async function getLandPlots(client, userId, guildId) {
    const userData = await client.getLevel(userId, guildId) || {};
    const userLevel = userData.level || 0;

    if (userLevel >= 50) return 36;
    if (userLevel >= 45) return 30;
    if (userLevel >= 40) return 25;
    if (userLevel >= 35) return 20;
    if (userLevel >= 30) return 16;
    if (userLevel >= 25) return 12;
    if (userLevel >= 15) return 9;
    if (userLevel >= 5) return 6;
    
    return 3;
}

module.exports = { getPlayerCapacity, getUsedCapacity, getLandPlots };
