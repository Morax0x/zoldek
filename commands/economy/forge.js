const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const core = require('./forge-core.js'); // 🔥 استدعاء المحرك الأساسي

module.exports = {
    data: new SlashCommandBuilder().setName('حدادة').setDescription('الدخول إلى المجمع الإمبراطوري لتطوير الأسلحة وصقل المهارات'),
    name: 'حدادة',
    aliases: ['forge', 'تطوير', 'صقل', 'دمج', 'صهر', 'حداده', 'أكاديمية', 'اكاديمية'],
    category: 'Economy',
    
    async execute(interactionOrMessage) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        const client = interactionOrMessage.client;
        const db = client.sql;
        
        let user = null;
        if (isSlash) user = interactionOrMessage.user;
        else if (interactionOrMessage.author) user = interactionOrMessage.author;
        else if (interactionOrMessage.user) user = interactionOrMessage.user;
        
        const guildId = interactionOrMessage.guild?.id || interactionOrMessage.guildId;
        const guild = interactionOrMessage.guild; 

        let sentMsg = null;
        if (isSlash && !interactionOrMessage.preselectedItem) {
            await interactionOrMessage.deferReply().catch(()=>{});
        } else if (!isSlash && !interactionOrMessage.preselectedItem && interactionOrMessage.channel) {
            interactionOrMessage.channel.sendTyping().catch(()=>{});
        }

        const fakeInteraction = isSlash ? interactionOrMessage : {
            guild: guild,
            client: client,
            replied: interactionOrMessage.preselectedItem ? true : false, 
            deferred: interactionOrMessage.preselectedItem ? true : false,
            reply: async (p) => { 
                if (interactionOrMessage.reply && typeof interactionOrMessage.reply === 'function') {
                    return await interactionOrMessage.reply(p).catch(()=>{});
                } else {
                    p.fetchReply = true; 
                    sentMsg = await interactionOrMessage.channel?.send(p).catch(()=>{}); 
                    return sentMsg; 
                }
            },
            editReply: async (p) => { 
                if (interactionOrMessage.editReply && typeof interactionOrMessage.editReply === 'function') {
                    return await interactionOrMessage.editReply(p).catch(()=>{});
                } else if (sentMsg) {
                    return await sentMsg.edit(p).catch(()=>{}); 
                } else {
                    return await interactionOrMessage.channel?.send(p).catch(()=>{}); 
                }
            },
            followUp: async (p) => interactionOrMessage.channel?.send(p).catch(()=>{})
        };

        let commandTrigger = "";
        if (!isSlash && interactionOrMessage.content) {
            commandTrigger = interactionOrMessage.content.trim().split(/ +/)[0].toLowerCase().replace(/^[^\w\s\u0600-\u06FF]/, ''); 
        } else if (isSlash) {
            commandTrigger = interactionOrMessage.commandName;
        }

        let synthesisState = { sacrificeItem: null, targetItem: null };
        let smeltState = { item: null };

        if (interactionOrMessage.preselectedItem) {
            if (interactionOrMessage.preselectedAction === 'smelt') {
                smeltState.item = interactionOrMessage.preselectedItem;
                commandTrigger = 'صهر';
            } else if (interactionOrMessage.preselectedAction === 'synth') {
                synthesisState.sacrificeItem = interactionOrMessage.preselectedItem;
                commandTrigger = 'دمج';
            }
        }

        let userDataRes = await core.safeQuery(db, `SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2`, [user.id, guildId]);
        if (!userDataRes?.rows?.[0]) return fakeInteraction.editReply({ content: "❌ لم يتم العثور على بياناتك في البنك." }).catch(()=>{});

        const currentRace = await core.getUserRaceName(user, guild, db);
        let replyObj;

        if (!currentRace) {
            // ... (بقاء كود اختيار العرق الأول كما هو لكن بتوجيهات core.safeQuery)
            let allRaces = await core.safeQuery(db, `SELECT * FROM race_roles WHERE "guildID" = $1`, [guildId]);
            if (!allRaces || allRaces.rows.length === 0) {
                return fakeInteraction.editReply({ content: "❌ الإدارة لم تقم بإعداد رتب الأعراق في هذا السيرفر بعد." }).catch(()=>{});
            }

            const embed = new require('discord.js').EmbedBuilder()
                .setTitle("✨ اختيار المصير")
                .setDescription("اختر العِرق الذي يُجسّد جوهرك وهويتك ، فكل اختيار يرسم مصيرك القادم\n\n⚠️ **عند تحديد عِرقك، لا يمكنك تغييره لاحقًا — فاختَر بحكمة.**")
                .setColor(require('discord.js').Colors.DarkPurple);

            const options = allRaces.rows.slice(0, 25).map(r => ({
                label: r.raceName || r.racename,
                value: r.roleID || r.roleid,
                description: `الانضمام إلى عرق ${r.raceName || r.racename}`,
                emoji: '🎭'
            }));

            const row = new require('discord.js').ActionRowBuilder().addComponents(
                new require('discord.js').StringSelectMenuBuilder().setCustomId('forge_starter_race').setPlaceholder('اضغط هنا لاختيار عرقك...').addOptions(options)
            );

            replyObj = await fakeInteraction.editReply({ content: null, embeds: [embed], components: [row] });
        } else {
            if (commandTrigger.includes('صقل') || commandTrigger.includes('اكاديمية') || commandTrigger === 'ms') {
                replyObj = await core.buildAcademyMenuUI(fakeInteraction, user, guildId, db, !isSlash && !interactionOrMessage.preselectedItem);
            } else if (commandTrigger.includes('دمج')) {
                replyObj = await core.buildSynthesisUI(fakeInteraction, user, guildId, db, synthesisState, !isSlash && !interactionOrMessage.preselectedItem);
            } else if (commandTrigger.includes('صهر')) {
                replyObj = await core.buildSmeltingUI(fakeInteraction, user, guildId, db, smeltState, !isSlash && !interactionOrMessage.preselectedItem);
            } else {
                replyObj = await core.buildMainUI(fakeInteraction, user, guildId, db, !isSlash && !interactionOrMessage.preselectedItem);
            }
        }

        if (isSlash && !replyObj?.createMessageComponentCollector) {
            replyObj = await interactionOrMessage.fetchReply().catch(()=>{});
        }
        
        if (!replyObj || !replyObj.createMessageComponentCollector) return;

        const filter = i => i.user.id === user.id && i.customId.startsWith('forge_');
        const collector = replyObj.createMessageComponentCollector({ filter, time: 300000 });

        collector.on('collect', async (i) => {
            try { if (!i.customId.startsWith('forge_smelt_multi_') && !i.deferred && !i.replied) await i.deferUpdate(); } catch(e) {}

            try {
                if (i.isStringSelectMenu() && i.customId === 'forge_starter_race') {
                    const roleId = i.values[0];
                    let raceRolesRes = await core.safeQuery(db, `SELECT * FROM race_roles WHERE "guildID" = $1`, [guildId]);
                    const matched = raceRolesRes.rows.find(r => (r.roleID || r.roleid) === roleId);
                    if(!matched) return i.followUp({ content: "❌ خطأ في العثور على العرق المختار.", flags: [MessageFlags.Ephemeral] });

                    const selectedRaceName = core.getStandardRaceName(matched.raceName || matched.racename);
                    const targetRole = i.guild.roles.cache.get(roleId);
                    
                    const memberObj = i.guild.members.cache.get(user.id) || await i.guild.members.fetch(user.id).catch(()=>null);
                    if (memberObj && targetRole) await memberObj.roles.add(targetRole).catch(()=>{});

                    await i.followUp({ content: `🎉 **مرحباً بك في عالمنا!**\nأنت الآن تنتمي رسمياً إلى عرق **(${selectedRaceName})**.\nافتح الحدادة الآن واصنع سلاحك أو تعلم مهاراتك الأولى مقابل ${core.LEARN_FEE} مورا!`, flags: [MessageFlags.Ephemeral] });
                    synthesisState = { sacrificeItem: null, targetItem: null }; smeltState = { item: null };
                    await core.buildMainUI(i, user, guildId, db, false);
                }
                else if (i.customId === 'forge_return_main') {
                    synthesisState = { sacrificeItem: null, targetItem: null }; smeltState = { item: null };
                    await core.buildMainUI(i, user, guildId, db, false);
                }
                else if (i.isStringSelectMenu()) {
                    if (i.customId === 'forge_skill_select') {
                        await core.buildSkillUpgradeUI(i, user, guildId, db, i.values[0]);
                    }
                    else if (i.customId === 'forge_synth_sacrifice') {
                        synthesisState.sacrificeItem = i.values[0]; synthesisState.targetItem = null; 
                        await core.buildSynthesisUI(i, user, guildId, db, synthesisState);
                    }
                    else if (i.customId === 'forge_synth_target') {
                        synthesisState.targetItem = i.values[0];
                        await core.buildSynthesisUI(i, user, guildId, db, synthesisState);
                    }
                    else if (i.customId === 'forge_smelt_select') {
                        smeltState.item = i.values[0];
                        await core.buildSmeltingUI(i, user, guildId, db, smeltState);
                    }
                }
                else if (i.isButton()) {
                    if (i.customId === 'forge_weapon') await core.buildWeaponForgeUI(i, user, guildId, db);
                    else if (i.customId === 'forge_buy_weapon') await core.handleWeaponBuy(i, user, guildId, db);
                    else if (i.customId === 'forge_skill_menu') await core.buildAcademyMenuUI(i, user, guildId, db);
                    else if (i.customId.startsWith('forge_learn_skill_')) await core.handleSkillLearn(i, user, guildId, db, i.customId.replace('forge_learn_skill_', ''));
                    else if (i.customId === 'forge_synthesis') { synthesisState = { sacrificeItem: null, targetItem: null }; await core.buildSynthesisUI(i, user, guildId, db, synthesisState); }
                    else if (i.customId === 'forge_smelting') { smeltState = { item: null }; await core.buildSmeltingUI(i, user, guildId, db, smeltState); }
                    else if (i.customId === 'forge_upgrade_weapon') await core.handleWeaponUpgrade(i, user, guildId, db);
                    else if (i.customId.startsWith('forge_upgrade_skill_')) await core.handleSkillUpgrade(i, user, guildId, db, i.customId.replace('forge_upgrade_skill_', ''));
                    else if (i.customId === 'forge_execute_synth') { await core.handleSynthesis(i, user, guildId, db, synthesisState); synthesisState = { sacrificeItem: null, targetItem: null }; }
                    else if (i.customId === 'forge_execute_smelt_1') { await core.handleSmelting(i, user, guildId, db, smeltState, client, 1); smeltState = { item: null }; }
                    else if (i.customId.startsWith('forge_smelt_multi_')) await core.handleSmeltingMultiModal(i, user, guildId, db, smeltState, client);
                }
            } catch (innerError) {}
        });

        collector.on('end', () => {
            try { 
                const disabledRows = core.getMainMenuRows();
                disabledRows.forEach(row => row.components.forEach(c => c.setDisabled(true))); 
                replyObj.edit({ components: disabledRows }).catch(()=>{}); 
            } catch(e) {}
        });
    }
};
