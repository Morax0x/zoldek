const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Colors } = require('discord.js');
const { EMOJI_MORA, EMOJI_XP, EMOJI_BUFF, EMOJI_NERF } = require('./constants'); 

function getRandomColor() {
    const colors = [Colors.Red, Colors.Blue, Colors.Green, Colors.Gold, Colors.Purple, Colors.Aqua];
    return colors[Math.floor(Math.random() * colors.length)];
}

async function triggerMimicChest(thread, players) {
    return new Promise(async (resolve) => {
        const alivePlayers = players.filter(p => !p.isDead);
        
        if (alivePlayers.length === 0) {
            resolve();
            return;
        }

        const openedPlayers = new Set();

        const embed = new EmbedBuilder()
            .setTitle('★ غرفـة مخفيـة ...')
            .setDescription(`✶ عثرتـم عـلى غرفـة مخفية في أعمـاق الدانجون يوجـد 3 صناديق القرار لكـم المخاطـرة وفتـح الصناديـق أم تخطيها ..\n\n✶ لديكـم **60 ثانيـة** قبل ان يبتلع الدانجـون غرفة الصناديق اختـر او دع !`)
            .setImage('https://i.postimg.cc/jdXLq52j/cges.png')
            .setColor(getRandomColor())
            .setFooter({ text: '⚠️ انتبه: بعض الصناديق قد تكون فخاخاً!' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('chest_1').setEmoji('<a:chest:1453751227664826450>').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('chest_2').setEmoji('<a:chest:1453751227664826450>').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('chest_3').setEmoji('<a:chest:1453751227664826450>').setStyle(ButtonStyle.Success)
        );

        const message = await thread.send({ embeds: [embed], components: [row] });

        const collector = message.createMessageComponentCollector({ time: 60000 });

        collector.on('collect', async (i) => {
            if (!i.deferred && !i.replied) await i.deferUpdate().catch(() => {});

            const player = players.find(p => p.id === i.user.id);
            if (!player || player.isDead) {
                return i.followUp({ content: '🚫 أنت لست مشاركاً أو أنك ميت!', ephemeral: true });
            }

            if (openedPlayers.has(player.id)) {
                return i.followUp({ content: '🔒 لقد فتحت صندوقاً بالفعل! اترك الباقي لزملائك.', ephemeral: true });
            }

            openedPlayers.add(player.id);

            // 🛡️ حماية وتهيئة المتغيرات لمنع الكراش (Crash Prevention) 🛡️
            if (!player.effects) player.effects = [];
            if (!player.loot) player.loot = { mora: 0, xp: 0 };
            if (isNaN(player.shield)) player.shield = 0;
            if (isNaN(player.critRate)) player.critRate = 0.1;

            const roll = Math.random() * 100;
            let resultMsg = "";

            if (roll < 15) { 
                const amount = Math.floor(Math.random() * (1500 - 800 + 1)) + 800;
                player.loot.mora += amount;
                resultMsg = `💰 **${player.name}** فتح صندوقاً ووجـد **${amount}** مورا!`;
            
            } else if (roll < 25) { 
                const amount = Math.floor(Math.random() * (500 - 50 + 1)) + 50;
                player.loot.xp += amount;
                resultMsg = `✨ **${player.name}** وجـد مخطوطـات قديمة وحصل على **${amount}** XP!`;

            } else if (roll < 35) { 
                const shieldVal = Math.floor(Math.random() * (250 - 50 + 1)) + 50;
                player.shield += shieldVal;
                player.shieldPersistent = true;
                player.shieldFloorsCount = 0;
                resultMsg = `🛡️ **${player.name}** عثر على درع سحري متهالك! (+${shieldVal} درع)`;

            } else if (roll < 40) { 
                player.special_cooldown = 0;
                player.skillCooldowns = {}; 
                resultMsg = `⚡ **${player.name}** لمس بلورة طاقة! (تم شحن جميع المهارات)`;

            } else if (roll < 48) { 
                const healAmount = Math.floor(player.maxHp * 0.40);
                if (player.hp >= player.maxHp * 0.9) {
                    player.shield += healAmount;
                    resultMsg = `🛡️ **${player.name}** وجد جرعة شفاء وهو بكامل عافيته، فتحولت الطاقة السحرية إلى **${healAmount}** درع!`;
                } else {
                    player.hp = Math.min(player.maxHp, player.hp + healAmount);
                    resultMsg = `💖 **${player.name}** وجـد زجاجة شفاء واستعاد **${healAmount}** من صحته!`;
                }

            } else if (roll < 55) { 
                // منع تكرار البف بشكل لا نهائي (Stacking fix)
                const existingBuff = player.effects.find(e => e.type === 'atk_buff');
                if (existingBuff) {
                    existingBuff.turns = 5;
                    existingBuff.val = Math.max(existingBuff.val, 0.2);
                } else {
                    player.effects.push({ type: 'atk_buff', val: 0.2, turns: 5 });
                }
                resultMsg = `💪 **${player.name}** حصل على بركة القوة! (+20% هجوم لـ 5 جولات) ${EMOJI_BUFF}`;

            } else if (roll < 60) {
                player.critRate = Math.min(1.0, player.critRate + 0.2); 
                resultMsg = `🎯 **${player.name}** وجد نظارة القناص! (زادت نسبة الضربة الحرجة)`;

            } else if (roll < 70) {
                const potionRoll = Math.random();
                if (potionRoll < 0.5) {
                    if (!player.effects.some(e => e.type === 'titan')) {
                        player.maxHp *= 2;
                        player.hp = player.maxHp;
                        player.effects.push({ type: 'titan', floors: 3 });
                        resultMsg = `🍷 **${player.name}** وجد **جرعة العملاق** وشربها فوراً! (تضاعفت الصحة لـ 3 طوابق)`;
                    } else {
                        player.hp = player.maxHp; // إذا كان عملاقاً سلفاً، اشفِه فقط لمنع ثغرة الـ HP اللانهائي
                        resultMsg = `🍷 **${player.name}** وجد جرعة العملاق لكنه عملاق بالفعل! (تم استعادة الصحة بالكامل)`;
                    }
                } else {
                    // 🔥 التصحيح الأهم: تغيير الاسم إلى reflect ليتعرف عليها المحرك 🔥
                    player.effects.push({ type: 'reflect', val: 0.3, turns: 3 });
                    resultMsg = `🌵 **${player.name}** وجد **جرعة الأشواك** وشربها! (يعكس 30% ضرر لـ 3 جولات)`;
                }

            } else if (roll < 78) { 
                const dmg = Math.floor(player.maxHp * 0.25);
                player.hp = Math.max(1, player.hp - dmg); 
                resultMsg = `👹 **${player.name}** الصنـدوق كـان ميميـك! قام بعضـه وسبب **${dmg}** ضرر!`;

            } else if (roll < 83) { 
                player.effects.push({ type: 'stun', val: 1, turns: 1 }); // توحيد القيم لتجنب الأعطال الحسابية
                resultMsg = `❄️ **${player.name}** فتح فخاً جليدياً! (تجميد للدور القادم)`;

            } else if (roll < 88) { 
                const burnDmg = Math.floor(player.maxHp * 0.05);
                player.effects.push({ type: 'burn', val: burnDmg, turns: 3 });
                resultMsg = `🔥 **${player.name}** انفجر في وجهه لهب سحري! (حرق لـ 3 جولات)`;

            } else if (roll < 93) { 
                const stealAmount = Math.floor(Math.random() * (200 - 50 + 1)) + 50;
                const actualSteal = Math.min(player.loot.mora || 0, stealAmount);
                player.loot.mora = Math.max(0, (player.loot.mora || 0) - actualSteal);
                
                if (actualSteal > 0) {
                    resultMsg = `👺 **${player.name}** ظهر عفريت وسرق منه **${actualSteal}** مورا وهرب!`;
                } else {
                    resultMsg = `👺 **${player.name}** ظهر عفريت ليحاول سرقته لكن جيبه كان فارغاً!`;
                }

            } else if (roll < 97) { 
                player.effects.push({ type: 'poison', val: Math.floor(player.maxHp * 0.05), turns: 5 });
                resultMsg = `☠️ **${player.name}** استنشق غازاً ساماً من الصندوق! (تسمم لـ 5 جولات) ${EMOJI_NERF}`;

            } else { 
                const pityShield = Math.floor(Math.random() * 50) + 10;
                player.shield += pityShield;
                resultMsg = `💨 **${player.name}** الصندوق كان فارغاً... لكنه وجد قطعة خشبية استخدمها كدرع (+${pityShield} درع).`;
            }

            await thread.send(resultMsg);

            embed.setColor(getRandomColor());
            await message.edit({ embeds: [embed] }).catch(() => {});

            if (openedPlayers.size >= alivePlayers.length) {
                collector.stop('all_opened');
            }
        });

        collector.on('end', async () => {
            const disabledRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('chest_1').setEmoji('<a:chest:1453751227664826450>').setStyle(ButtonStyle.Secondary).setDisabled(true),
                new ButtonBuilder().setCustomId('chest_2').setEmoji('<a:chest:1453751227664826450>').setStyle(ButtonStyle.Secondary).setDisabled(true),
                new ButtonBuilder().setCustomId('chest_3').setEmoji('<a:chest:1453751227664826450>').setStyle(ButtonStyle.Secondary).setDisabled(true)
            );
            
            embed.setDescription(`🔒 **أبتلع الدانجـون غـرفة الصـناديـق...** تابعوا طريقكم!`);
            embed.setColor(Colors.Grey);
            
            await message.edit({ embeds: [embed], components: [disabledRow] }).catch(() => {});
            
            await thread.send("🌪️ تلاشت الصناديق في الظلام... الفريق يكمل مسيره.");
            resolve();
        });
    });
}

module.exports = { triggerMimicChest };
