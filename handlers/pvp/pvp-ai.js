async function processTestingBotTurn(battleState, db, core, calculateMoraBuff) {
    try {
        if (!battleState || !battleState.turn || !battleState.players) return;

        const botId = battleState.turn[0];
        const playerId = battleState.turn[1];
        
        const bot = battleState.players.get(botId);
        const player = battleState.players.get(playerId);
        if (!bot || !player) return;

        await new Promise(r => setTimeout(r, 2000)); 

        // 🔥 تهيئة وقائية للكائنات لتجنب الكراش (Null-check) 🔥
        if (!battleState.log) battleState.log = [];
        if (!bot.effects) bot.effects = {};
        if (!player.effects) player.effects = {};
        if (!battleState.skillCooldowns) battleState.skillCooldowns = {};
        if (!battleState.skillCooldowns[botId]) battleState.skillCooldowns[botId] = {};
        if (!battleState.stats) battleState.stats = { actions: 0 };
        if (!battleState.stats[botId]) battleState.stats[botId] = { skillsUsed: 0, damageDealt: 0 };

        let persistentResult;
        try {
            persistentResult = core.applyPersistentEffects(battleState, botId);
        } catch (e) {
            persistentResult = { logEntries: [], skipTurn: false };
        }
        
        const logEntries = persistentResult.logEntries || [];
        const skipTurn = persistentResult.skipTurn || false;

        if (logEntries.length > 0) battleState.log.push(...logEntries);

        if ((bot.hp || 0) <= 0) {
            bot.hp = 0;
            try { await core.endBattle(battleState, playerId, db, "win", calculateMoraBuff); } catch(e){}
            return;
        }

        // 🔥 زيادة عداد الجولات 🔥
        battleState.stats.actions = (battleState.stats.actions || 0) + 1;

        if (skipTurn) {
            battleState.log.push(`⚡ **${bot.name || 'الزعيم'}** مشلول ولا يستطيع الحركة!`);
            let triggerAnnouncer;
            try { ({ triggerAnnouncer } = require('./pvp-announcer.js')); } catch(e){}
            if(triggerAnnouncer) triggerAnnouncer(battleState, `الزعيم موركس مشلول كالصخرة العظيمة! لا يستطيع الحراك!`);
        } else {
            Object.keys(battleState.skillCooldowns[botId]).forEach(s => {
                if (battleState.skillCooldowns[botId][s] > 0) battleState.skillCooldowns[botId][s]--;
            });

            const botSkills = bot.skills || {};
            const availableSkills = Object.values(botSkills).filter(s => (battleState.skillCooldowns[botId][s.id] || 0) === 0);
            let chosenSkill = null;

            const botMaxHp = bot.maxHp || 1;
            if ((bot.hp || 0) / botMaxHp < 0.4 && availableSkills.find(s => s.id === 'skill_healing')) {
                chosenSkill = availableSkills.find(s => s.id === 'skill_healing');
            } else if ((bot.effects.shield || 0) === 0 && availableSkills.find(s => s.id === 'skill_shielding')) {
                chosenSkill = availableSkills.find(s => s.id === 'skill_shielding');
            } else if (Math.random() < 0.7 && availableSkills.length > 0) {
                const attackSkills = availableSkills.filter(s => s.id !== 'skill_healing' && s.id !== 'skill_shielding');
                if (attackSkills.length > 0) chosenSkill = attackSkills[Math.floor(Math.random() * attackSkills.length)];
            }

            if (chosenSkill) {
                battleState.skillCooldowns[botId][chosenSkill.id] = chosenSkill.cooldown || 3;
                try {
                    const actionLog = core.applySkillEffect(battleState, botId, chosenSkill);
                    battleState.log.push(actionLog);
                    battleState.stats[botId].skillsUsed += 1;
                    
                    let triggerAnnouncer;
                    try { ({ triggerAnnouncer } = require('./pvp-announcer.js')); } catch(e){}
                    if(triggerAnnouncer) triggerAnnouncer(battleState, `الزعيم موركس أطلق مهارته المدمرة: "${chosenSkill.name}"!`);
                } catch (e) {
                    console.error("AI Skill Execution Error:", e);
                }
            } else {
                let result = { finalDmg: 0, isCrit: false, lifestealAmount: 0, isEvasion: false };
                try {
                    // تحديث لحساب الضرر متوافق مع النظام الجديد 
                    result = core.calculateDamage(bot, player);
                } catch (e) { console.error("AI Calc Damage Error:", e); }
                
                if (result.isEvasion || (player.effects.evasion || 0) > 0) {
                    battleState.log.push(`👻 **${bot.name || 'الزعيم'}** هاجم، لكنك راوغت ببراعة!`);
                    let triggerAnnouncer;
                    try { ({ triggerAnnouncer } = require('./pvp-announcer.js')); } catch(e){}
                    if(triggerAnnouncer) triggerAnnouncer(battleState, `يا لها من خفة! راوغت ضربة الزعيم موركس بأعجوبة!`);
                } else {
                    if (result.lifestealAmount > 0) {
                        bot.hp = Math.min(botMaxHp, bot.hp + result.lifestealAmount);
                    }

                    player.hp = Math.max(0, (player.hp || 0) - result.finalDmg);
                    battleState.stats[botId].damageDealt += result.finalDmg;

                    if (result.finalDmg > 0) {
                        let logText = `⚔️ **${bot.name || 'الزعيم'}** سدد ضربة أسطورية وألحق **${result.finalDmg}** ضرر!`;
                        if (result.isCrit) logText += ` (كريت!)`;
                        if (result.lifestealAmount > 0) logText += ` [شفى ${result.lifestealAmount}❤️]`;
                        battleState.log.push(logText);
                        
                        let triggerAnnouncer;
                        try { ({ triggerAnnouncer } = require('./pvp-announcer.js')); } catch(e){}
                        if(triggerAnnouncer) {
                            if (result.finalDmg > player.maxHp * 0.2) {
                                triggerAnnouncer(battleState, `ضربة قاصمة من الزعيم أفقدتك ${result.finalDmg} من صحتك! انتبه!`);
                            }
                        }
                    }
                    else {
                        battleState.log.push(`🛡️ درعك أو دفاعك امتص ضربة الزعيم بالكامل!`);
                    }
                }
            }
        }

        if ((player.hp || 0) <= 0) {
            player.hp = 0;
            try { await core.endBattle(battleState, botId, db, "win", calculateMoraBuff); } catch(e){}
            return;
        }

        battleState.turn = [playerId, botId];
        
        try {
            // استخدام البيلدر الآمن إذا كان متوفراً لمنع التايم آوت
            let safeBuildBattleEmbed;
            try { 
                const pvpHandler = require('./pvp-handler.js'); 
                // We'll use a local fallback if safeBuild isn't exported
                safeBuildBattleEmbed = async (bs) => {
                    const result = await Promise.race([
                        core.buildBattleEmbed(bs),
                        new Promise((_, reject) => setTimeout(() => reject(new Error("Canvas_Timeout")), 6000))
                    ]);
                    return result;
                };
            } catch(e) {}

            const { embeds, components, files } = await safeBuildBattleEmbed(battleState);
            if (battleState.message) await battleState.message.edit({ embeds, components, files }).catch(() => {});
        } catch (e) {
            console.error("AI UI Update Error:", e);
        }
        
        battleState.processingTurn = false;
    } catch (criticalError) {
        console.error("[CRITICAL] processTestingBotTurn Error:", criticalError);
        if (battleState) battleState.processingTurn = false;
    }
}

module.exports = { processTestingBotTurn };
