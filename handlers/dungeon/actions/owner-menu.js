const { 
    ActionRowBuilder, 
    StringSelectMenuBuilder, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle 
} = require('discord.js');

const { 
    skillsConfig, 
    ownerSkills, 
    OWNER_ID 
} = require('../constants');

const { handleSkillUsage } = require('../skills');
const { generateBattleEmbed } = require('../ui');
const { sendEndMessage } = require('../core/end-game');
const { getRealPlayerData, getBaseFloorMora } = require('../utils'); 
const { cleanName } = require('../core/battle-utils'); 

function getUniqueOptions(items, isDamageDesc = false) {
    const seenIds = new Set();
    const options = [];

    for (const s of items) {
        if (seenIds.has(s.id)) continue;
        seenIds.add(s.id);
        let description = s.description || "لا يوجد وصف";
        if (isDamageDesc) {
            description = `(x10 DMG) ${description}`;
        } else if (!isDamageDesc && description.length < 10) {
            description = `(x10 Effect) ${description}`; 
        }

        options.push({
            label: s.name.substring(0, 100), 
            description: description.substring(0, 100), 
            value: s.id,
            emoji: s.emoji || '🔸'
        });
    }
    return options;
}

async function handleOwnerMenu(i, players, monster, log, threadChannel, sql, guild, hostId, activeDungeonRequests, merchantState, battleMsg, turnTimeout, mainCollector, ongoingRef, retreatedPlayers = []) {
    
    const menu = new StringSelectMenuBuilder()
        .setCustomId('owner_god_menu_category')
        .setPlaceholder('👑 اختر قسم القوة المطلقة')
        .addOptions([
            { label: 'الإمبراطـور', description: 'مهارات الوجود والعدم', value: 'cat_emperor', emoji: '👑' },
            { label: 'الأعـراق', description: 'جميع مهارات الأعراق', value: 'cat_races', emoji: '🧬' },
            { label: 'التصنيفـات', description: 'مهارات الكلاسات الخاصة', value: 'cat_classes', emoji: '⚔️' },
            { label: 'مهـارات عامة', description: 'المهارات الأساسية بقوة مضاعفة', value: 'cat_skills', emoji: '📜' },
        ]);
    
    const ownerMenuMsg = await i.reply({ 
        content: `**👑 مرحباً مولاي الإمبراطور..**\nاختر التصنيف لاستدعاء القوة:`, 
        components: [new ActionRowBuilder().addComponents(menu)], 
        ephemeral: true,
        fetchReply: true 
    });

    const menuCollector = ownerMenuMsg.createMessageComponentCollector({ 
        filter: subI => subI.user.id === i.user.id, 
        time: 60000 
    });

    menuCollector.on('collect', async subI => {
        if (subI.customId === 'owner_god_menu_category') {
            const category = subI.values[0];
            let options = [];

            if (category === 'cat_emperor') {
                options = getUniqueOptions(ownerSkills);
            } else if (category === 'cat_races') {
                const raceSkills = skillsConfig.filter(s => s.id.startsWith('race_'));
                options = getUniqueOptions(raceSkills, true);
            } else if (category === 'cat_classes') {
                const classOptionsRaw = [
                    { name: 'صرخة الحرب', description: 'بفات للفريق', id: 'class_Leader', emoji: '⚔️' },
                    { name: 'استفزاز', description: 'سحب الضرر ودفاع', id: 'class_Tank', emoji: '🛡️' },
                    { name: 'النور المقدس', description: 'إحياء وعلاج', id: 'class_Priest', emoji: '✨' },
                    { name: 'سجن الجليد', description: 'تجميد الوحش', id: 'class_Mage', emoji: '❄️' },
                    { name: 'حارس الظل', description: 'استدعاء وحش', id: 'class_Summoner', emoji: '🐺' }
                ];
                options = classOptionsRaw.map(c => ({
                    label: c.name, description: c.description, value: c.id, emoji: c.emoji
                }));
            } else if (category === 'cat_skills') {
                const generalSkills = skillsConfig.filter(s => !s.id.startsWith('race_') && s.stat_type !== 'Owner');
                options = getUniqueOptions(generalSkills, false);
            }

            if (options.length === 0) return subI.reply({ content: "⚠️ لا توجد مهارات متاحة في هذا القسم.", ephemeral: true });

            const safeOptions = options.slice(0, 25);
            const skillMenu = new StringSelectMenuBuilder()
                .setCustomId('owner_god_menu_execute')
                .setPlaceholder('⚡ اختر المهارة للتنفيذ فوراً')
                .addOptions(safeOptions);

            await subI.update({ 
                content: `**👑 تصنيف: ${category.replace('cat_', '').toUpperCase()}**\nاختر المهارة لإطلاقها:`, 
                components: [new ActionRowBuilder().addComponents(skillMenu)] 
            });
        }

        if (subI.customId === 'owner_god_menu_execute') {
            const skillID = subI.values[0];
            let skillObj = skillsConfig.find(s => s.id === skillID) || ownerSkills.find(s => s.id === skillID);

            if (!skillObj && skillID.startsWith('class_')) {
                skillObj = { id: skillID, name: skillID, base_price: 0 };
            }
            
            let p = players.find(pl => pl.id === subI.user.id);
            if (!p && subI.user.id === OWNER_ID) {
                 const member = await subI.guild.members.fetch(OWNER_ID).catch(() => null);
                 if(member) {
                     const ownerPlayer = getRealPlayerData(member, sql, '???');
                     ownerPlayer.name = cleanName(ownerPlayer.name);
                     players.push(ownerPlayer);
                     p = ownerPlayer;
                     log.push(`👑 **الأمبراطـور انضم للمعركة !**`);
                 }
            }

            if (!p) return;

            const result = handleSkillUsage(p, skillObj, monster, log, threadChannel, players);

            if (result.type === 'dimension_gate_request') {
                const modal = new ModalBuilder().setCustomId('modal_dimension_gate').setTitle('🌌 بوابة الأبعاد');
                const floorInput = new TextInputBuilder().setCustomId('gate_floor_number').setLabel("رقم الطابق الذي تريد الانتقال له؟").setStyle(TextInputStyle.Short).setPlaceholder("مثال: 50").setRequired(true);
                const rewardInput = new TextInputBuilder().setCustomId('gate_rewards_choice').setLabel("هل تريد جوائز الطوابق المتخطاة؟").setStyle(TextInputStyle.Short).setPlaceholder("نعم / لا").setRequired(false);
                
                modal.addComponents(new ActionRowBuilder().addComponents(floorInput), new ActionRowBuilder().addComponents(rewardInput));
                
                await subI.showModal(modal);

                try {
                    const modalInteraction = await subI.awaitModalSubmit({
                        filter: (m) => m.customId === 'modal_dimension_gate' && m.user.id === subI.user.id,
                        time: 30000 
                    });

                    const floorNum = parseInt(modalInteraction.fields.getTextInputValue('gate_floor_number'));
                    const wantRewards = modalInteraction.fields.getTextInputValue('gate_rewards_choice')?.toLowerCase().includes('نعم');

                    if (isNaN(floorNum)) {
                        await modalInteraction.reply({ content: "❌ رقم طابق غير صالح!", ephemeral: true });
                        return;
                    }

                    const currentFloorMatch = monster.name.match(/Lv\.(\d+)/);
                    const currentFloor = currentFloorMatch ? parseInt(currentFloorMatch[1]) : 1;
                    const jumpCount = floorNum - currentFloor;
                    
                    if (jumpCount <= 0) {
                         await modalInteraction.reply({ content: "❌ لا يمكن الانتقال للخلف أو لنفس الطابق!", ephemeral: true });
                         return;
                    }

                    merchantState.skipFloors = floorNum; 
                    merchantState.isGateJump = true; 

                    if (wantRewards) {
                        let totalSkippedMora = 0;
                        for (let f = currentFloor + 1; f < floorNum; f++) {
                            totalSkippedMora += getBaseFloorMora(f);
                        }
                        if (totalSkippedMora > 0) {
                            players.forEach(pl => { if (!pl.isDead) pl.loot.mora += totalSkippedMora; });
                            log.push(`💰 **الإمبراطور** نهب جوائز ${jumpCount - 1} طابق متخطى! (+${totalSkippedMora.toLocaleString()} مورا)`);
                        }
                    }

                    monster.hp = 0; 
                    log.push(`🌌 **بوابة الأبعاد** فُتحت! الانتقال من ${currentFloor} إلى ${floorNum}...`);
                    await modalInteraction.reply({ content: `🌌 جاري الانتقال ${jumpCount} طابق للأمام...`, ephemeral: true });
                    
                    mainCollector.stop('monster_dead');
                    return; 

                } catch (err) { return; }
            }

            if (skillID === 'skill_last_gasp') {
                if (subI.user.id !== OWNER_ID) return;

                monster.hp = 1;

                const playerIndex = players.findIndex(pl => pl.id === subI.user.id);
                if (playerIndex > -1) {
                    const leavingPlayer = players[playerIndex];
                    
                    const currentFloorMatch = monster.name.match(/Lv\.(\d+)/);
                    const currentFloor = currentFloorMatch ? parseInt(currentFloorMatch[1]) : 0;
                    leavingPlayer.retreatFloor = currentFloor;

                    if (retreatedPlayers) retreatedPlayers.push(leavingPlayer);
                    players.splice(playerIndex, 1); 
                }

                await subI.update({ content: "✋ **تم تنفيذ الرمق الأخير!...**", components: [] });
                log.push(`✋ **الإمبراطور** جعل الوحش بـ 1 HP وغادر المعركة!`);
                
                await battleMsg.edit({ embeds: [generateBattleEmbed(players, monster, 0, 'theme', log, [])] }).catch(()=>{});
                return;
            }

            if (result.type === 'owner_leave' || skillID === 'skill_owner_leave') {
                if (subI.user.id !== OWNER_ID) return;

                const currentFloorMatch = monster.name.match(/Lv\.(\d+)/);
                const currentFloor = currentFloorMatch ? parseInt(currentFloorMatch[1]) : 1;

                await subI.update({ content: `💨 **تم تنفيذ شق الزمكان! جاري الانسحاب القسري من الطابق ${currentFloor}...**`, components: [] });
                
                ongoingRef.value = false; 
                monster.hp = 0; 
                mainCollector.stop('owner_force_leave');

                try {
                    const mainChannel = threadChannel.parent || threadChannel; 

                    await sendEndMessage(mainChannel, threadChannel, players, [], currentFloor, "retreat", sql, guild.id, hostId, activeDungeonRequests);
                } catch (err) {
                    console.error("Error inside Force Leave:", err);
                    await threadChannel.send({ content: "⚠️ **حدث خطأ أثناء إنهاء المعركة، ولكن تم إيقاف اللعبة قسرياً.**" }).catch(() => {});
                }

                return;
            }

            if (result.success) {
                await subI.update({ content: "✅ تم التنفيذ!", components: [] });
                
                if (monster.hp <= 0) {
                    monster.hp = 0;
                    ongoingRef.value = false; 
                    mainCollector.stop('monster_dead');
                    return; 
                }
                
                await battleMsg.edit({ embeds: [generateBattleEmbed(players, monster, 0, 'theme', log, [])] }).catch(()=>{});
            }
        }
    });
}

module.exports = { handleOwnerMenu };
