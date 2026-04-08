async function processTestingBotTurn(battleState, db, core, calculateMoraBuff) {
    const botId = battleState.turn[0];
    const playerId = battleState.turn[1];
    const bot = battleState.players.get(botId);
    const player = battleState.players.get(playerId);
    if (!bot || !player) return;

    await new Promise(r => setTimeout(r, 2000)); 

    const { logEntries, skipTurn } = core.applyPersistentEffects(battleState, botId);
    battleState.log.push(...logEntries);

    if (bot.hp <= 0) {
        await core.endBattle(battleState, playerId, db, "win", calculateMoraBuff);
        return;
    }

    // 🔥 زيادة عداد الجولات 🔥
    battleState.stats.actions += 1;

    if (skipTurn) {
        battleState.log.push(`⚡ **${bot.name}** مشلول ولا يستطيع الحركة!`);
    } else {
        Object.keys(battleState.skillCooldowns[botId]).forEach(s => {
            if (battleState.skillCooldowns[botId][s] > 0) battleState.skillCooldowns[botId][s]--;
        });

        const availableSkills = Object.values(bot.skills).filter(s => (battleState.skillCooldowns[botId][s.id] || 0) === 0);
        let chosenSkill = null;

        if (bot.hp / bot.maxHp < 0.4 && availableSkills.find(s => s.id === 'skill_healing')) {
            chosenSkill = availableSkills.find(s => s.id === 'skill_healing');
        } else if (bot.effects.shield === 0 && availableSkills.find(s => s.id === 'skill_shielding')) {
            chosenSkill = availableSkills.find(s => s.id === 'skill_shielding');
        } else if (Math.random() < 0.7 && availableSkills.length > 0) {
            const attackSkills = availableSkills.filter(s => s.id !== 'skill_healing' && s.id !== 'skill_shielding');
            if (attackSkills.length > 0) chosenSkill = attackSkills[Math.floor(Math.random() * attackSkills.length)];
        }

        if (chosenSkill) {
            battleState.skillCooldowns[botId][chosenSkill.id] = chosenSkill.cooldown || 3;
            const actionLog = core.applySkillEffect(battleState, botId, chosenSkill);
            battleState.log.push(actionLog);
            
            // 🔥 زيادة عداد المهارات للبوت 🔥
            battleState.stats[botId].skillsUsed += 1;
        } else {
            const dmg = core.calculateDamage(bot, player);
            if (player.effects.evasion > 0) {
                battleState.log.push(`👻 **${bot.name}** هاجم، لكنك راوغت ببراعة!`);
            } else {
                player.hp -= dmg;
                
                // 🔥 زيادة عداد الضرر للبوت 🔥
                battleState.stats[botId].damageDealt += dmg;

                if (dmg > 0) battleState.log.push(`⚔️ **${bot.name}** سدد ضربة أسطورية وألحق **${dmg}** ضرر!`);
                else battleState.log.push(`🛡️ درعك امتص الضربة بالكامل!`);
            }
        }
    }

    if (player.hp <= 0) {
        player.hp = 0;
        await core.endBattle(battleState, botId, db, "win", calculateMoraBuff);
        return;
    }

    battleState.turn = [playerId, botId];
    const { embeds, components, files } = await core.buildBattleEmbed(battleState);
    if (battleState.message) await battleState.message.edit({ embeds, components, files }).catch(() => {});
    battleState.processingTurn = false;
}

module.exports = { processTestingBotTurn };
