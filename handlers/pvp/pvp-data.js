const path = require('path');
const rootDir = process.cwd();
const weaponsConfig = require(path.join(rootDir, 'json', 'weapons-config.json'));
const skillsConfig = require(path.join(rootDir, 'json', 'skills-config.json'));

async function getUserRace(member, db) {
    if (!member || !member.guild) return null;
    const res = await db.query(`SELECT "roleID", "raceName" FROM race_roles WHERE "guildID" = $1`, [member.guild.id]);
    const allRaceRoles = res.rows;
    if (!member.roles || !member.roles.cache) return null;
    const userRoleIDs = member.roles.cache.map(r => r.id);
    return allRaceRoles.find(r => userRoleIDs.includes(r.roleID || r.roleid)) || null;
}

function calculateSkillRawValue(skillConfig, currentLevel) {
    if (!skillConfig) return 0;
    const level = Math.max(1, currentLevel || 1);
    
    const base = skillConfig.base_value;
    const inc = skillConfig.value_increment;
    const isPercentage = skillConfig.stat_type === '%' || skillConfig.id.includes('heal') || skillConfig.id.includes('shield');

    if (level <= 15) {
        return Math.floor(base + (inc * (level - 1)));
    } else {
        const valueAt15 = base + (inc * 14);
        const targetValueAt30 = isPercentage ? 70 : 200; 
        const levelsRemaining = 15;
        const dynamicIncrement = (targetValueAt30 - valueAt15) / levelsRemaining;
        
        let finalValue = valueAt15 + (dynamicIncrement * (level - 15));
        if (level >= 30) return targetValueAt30;
        return Math.floor(finalValue);
    }
}

async function getWeaponData(db, member) {
    const userRace = await getUserRace(member, db);
    if (!userRace) return null;
    const raceName = userRace.raceName || userRace.racename;
    const weaponConfig = weaponsConfig.find(w => w.race.toLowerCase() === raceName.toLowerCase());
    if (!weaponConfig) return null;
    
    const res = await db.query(`SELECT * FROM user_weapons WHERE "userID" = $1 AND "guildID" = $2 AND LOWER("raceName") = LOWER($3)`, [member.id, member.guild.id, raceName]);
    let userWeapon = res.rows[0];
    if (!userWeapon || Number(userWeapon.weaponLevel || userWeapon.weaponlevel) <= 0) return null;
    
    let level = Number(userWeapon.weaponLevel || userWeapon.weaponlevel);
    const base = weaponConfig.base_damage;
    const inc = weaponConfig.damage_increment;
    let damage = 15;

    try {
        let buffRes = await db.query(`SELECT "multiplier" FROM user_buffs WHERE "userID" = $1 AND "guildID" = $2 AND "buffType" = 'hidden_weapon'`, [member.id, member.guild.id]);
        if (buffRes.rows.length === 0) {
            buffRes = await db.query(`SELECT multiplier FROM user_buffs WHERE userid = $1 AND guildid = $2 AND bufftype = 'hidden_weapon'`, [member.id, member.guild.id]).catch(()=>({rows:[]}));
        }
        
        if (buffRes.rows.length > 0) {
            const hiddenLevel = Number(buffRes.rows[0].multiplier || buffRes.rows[0].Multiplier);
            if (hiddenLevel > 0) {
                level = hiddenLevel; 
            }
        }
    } catch(e) {}

    if (level <= 15) {
        damage = Math.floor(base + (inc * (level - 1)));
    } else {
        const damageAt15 = base + (inc * 14);
        const targetDamageAt30 = 800;
        const levelsRemaining = 15; 
        const dynamicIncrement = (targetDamageAt30 - damageAt15) / levelsRemaining;
        let finalDamage = damageAt15 + (dynamicIncrement * (level - 15));
        damage = level >= 30 ? targetDamageAt30 : Math.floor(finalDamage);
    }

    return { ...weaponConfig, currentDamage: damage, currentLevel: level };
}

async function getAllSkillData(db, member) {
    const userRace = await getUserRace(member, db);
    const skillsOutput = {};
    
    const res = await db.query(`SELECT * FROM user_skills WHERE "userID" = $1 AND "guildID" = $2`, [member.id, member.guild.id]);
    const userSkillsData = res.rows;
        
    let currentRaceSkillId = null;
    if (userRace) {
        const raceName = userRace.raceName || userRace.racename;
        currentRaceSkillId = `race_${raceName.toLowerCase().replace(/\s+/g, '_')}_skill`;
    }

    if (userSkillsData) {
        for (const userSkill of userSkillsData) {
            const skillId = userSkill.skillID || userSkill.skillid;
            const skillConfig = skillsConfig.find(s => s.id === skillId);
            let skillLvl = Number(userSkill.skillLevel || userSkill.skilllevel);
            
            if (skillConfig && skillLvl > 0) {
                if (skillId.startsWith('race_') && skillId !== currentRaceSkillId) continue; 

                try {
                    let sBuffRes = await db.query(`SELECT "multiplier" FROM user_buffs WHERE "userID" = $1 AND "guildID" = $2 AND "buffType" = $3`, [member.id, member.guild.id, `hidden_skill_${skillId}`]);
                    if (sBuffRes.rows.length === 0) {
                        sBuffRes = await db.query(`SELECT multiplier FROM user_buffs WHERE userid = $1 AND guildid = $2 AND bufftype = $3`, [member.id, member.guild.id, `hidden_skill_${skillId}`]).catch(()=>({rows:[]}));
                    }
                    
                    if (sBuffRes.rows.length > 0) {
                        const hiddenSkillLevel = Number(sBuffRes.rows[0].multiplier || sBuffRes.rows[0].Multiplier);
                        if (hiddenSkillLevel > 0) skillLvl = hiddenSkillLevel; 
                    }
                } catch(e) {}
                
                const effectValue = calculateSkillRawValue(skillConfig, skillLvl);
                skillsOutput[skillConfig.id] = { ...skillConfig, currentLevel: skillLvl, effectValue: effectValue };
            }
        }
    }

    if (currentRaceSkillId) {
        const raceSkillConfig = skillsConfig.find(s => s.id === currentRaceSkillId);
        if (raceSkillConfig && !skillsOutput[currentRaceSkillId]) {
            skillsOutput[currentRaceSkillId] = { ...raceSkillConfig, currentLevel: 1, effectValue: raceSkillConfig.base_value };
        }
    }
    
    return skillsOutput;
}

async function getUserActiveSkill(db, userId, guildId) {
    const res = await db.query(`SELECT * FROM user_skills WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId]);
    const userSkills = res.rows;
    
    if (userSkills.length > 0) {
        let validSkills = userSkills.filter(s => {
            const sId = s.skillID || s.skillid;
            return !sId.startsWith('race_'); 
        });

        if (validSkills.length === 0) validSkills = userSkills;

        const randomSkillData = validSkills[Math.floor(Math.random() * validSkills.length)];
        const skillConfig = skillsConfig.find(s => s.id === (randomSkillData.skillID || randomSkillData.skillid));
        if (skillConfig) {
            const level = Number(randomSkillData.skillLevel || randomSkillData.skilllevel);
            const power = calculateSkillRawValue(skillConfig, level);
            return { name: skillConfig.name, level: level, damage: power };
        }
    }
    return null;
}

module.exports = {
    getUserRace,
    getWeaponData,
    getAllSkillData,
    getUserActiveSkill
};
