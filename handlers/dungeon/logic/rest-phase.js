const { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    Colors,
    ComponentType,
    MessageFlags 
} = require('discord.js');

const { EMOJI_MORA, EMOJI_XP } = require('../constants');
const { getBaseFloorMora, manageCampfires } = require('../utils');
const { snapshotLootAtFloor20, handleMemberRetreat, safeUpdateRepAndChests } = require('../core/rewards');
const { handleLeaderSuccession } = require('../core/battle-utils');

async function applyPostBattleUpdates(players, floor, threadChannel, totals) {
    let baseMora = Math.floor(getBaseFloorMora(floor));
    let floorXp = Math.floor(baseMora * 0.03); 
      
    players.forEach(p => { 
        if (!p.isDead) { 
            p.loot.mora += baseMora; 
            p.loot.xp += floorXp; 
        } 
    });

    totals.coins += baseMora;
    totals.xp += floorXp;

    if (floor === 20 || floor === 50) {
        snapshotLootAtFloor20(players);
        await threadChannel.send(`🛡️ **نـقـــطـــة أمـــــان!** - تم حفظ الغنائم`).catch(()=>{});
    }

    players.forEach(p => {
        if (!p.isDead) {
            const healAmount = Math.floor(p.maxHp * 0.30);
            p.hp = Math.min(p.maxHp, Math.floor(p.hp + healAmount));
            if (isNaN(p.hp)) p.hp = p.maxHp;

            p.effects = p.effects.filter(e => {
                if (e.floors) {
                    e.floors--;
                    if (e.floors <= 0) {
                        if (e.type === 'titan') {
                            p.maxHp = Math.floor(p.maxHp / 2);
                            if (p.hp > p.maxHp) p.hp = p.maxHp;
                            threadChannel.send(`✨ **${p.name}** عاد لحجمه الطبيعي وتلاشى مفعول العملاق.`).catch(()=>{});
                        }
                        return false; 
                    }
                }
                return true;
            });
        }
    });
}

// الدالة الآن تحسب من الطابق 1 دائماً فقط للعرض البصري عشان اللاعب يشوف إنجازه الكلي
function calculateTotalLootForDisplay(currentFloor) {
    const repMilestones = {
        20: 1, 30: 1, 35: 1, 40: 1, 45: 1, 50: 1,
        55: 2, 60: 2, 65: 3, 70: 3, 75: 4, 
        80: 5, 85: 5, 90: 5, 95: 5, 100: 5
    };

    let totalRep = 0;
    let totalChests = Math.floor(currentFloor / 10);

    for (let f = 1; f <= currentFloor; f++) {
        if (repMilestones[f]) totalRep += repMilestones[f];
    }
    
    return { rep: totalRep, chests: totalChests };
}

async function handleRestMenu(context) {
    const { 
        floor, players, retreatState, retreatedPlayers, 
        totalAccumulatedCoins, totalAccumulatedXP, 
        threadChannel, db, guild, log,
        theme, 
        restImage,
        sessionStartFloor 
    } = context;

    const startFloor = sessionStartFloor || 1;
    const totalDisplayLoot = calculateTotalLootForDisplay(floor);
    
    let restDesc = `✶ نجحتـم في تصفية الطابق الـ: **${floor}**\n✶ تم استعادة صحة المغامرين بنسبة **%30**\n\n**✶ الغنـائـم المتراكمة لرحلتكم:**\n✬ Mora: **${totalAccumulatedCoins.toLocaleString()}** ${EMOJI_MORA}\n✬ XP: **${totalAccumulatedXP.toLocaleString()}** ${EMOJI_XP}`;
    
    if (totalDisplayLoot.rep > 0) {
        restDesc += `\n🌟 REP: **${totalDisplayLoot.rep}**`;
    }
    if (totalDisplayLoot.chests > 0) {
        restDesc += `\n🎁 Box: **${totalDisplayLoot.chests}**`;
    }

    const restRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('continue').setLabel('الاستمرار').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('camp').setLabel('نصب خيمة').setStyle(ButtonStyle.Secondary).setEmoji('⛺'),
        new ButtonBuilder().setCustomId('retreat').setLabel('انسـحـاب').setStyle(ButtonStyle.Danger)
    );

    restDesc += `\n\n- القرار بيد **القائد** للاستمرار، نصب خيمة، أو الانسحاب.`;

    if (floor === 99) {
        restDesc += `\n\n⚠️💀 **تحذيـــر نهائـــي** 💀⚠️\nأنتم على أعتاب العرش... **الإمبراطور موراكس** بانتظاركم في الطابق القادم! لا تراجع بعد الآن!`;
    }

    const finalImage = restImage || theme?.rest_image || 'https://i.postimg.cc/KcJ6gtzV/22.jpg';

    const restEmbed = new EmbedBuilder()
        .setTitle(`❖ استـراحـة بيـن الطـوابـق: ${theme?.name || 'مجهول'}`)
        .setDescription(restDesc)
        .setColor(theme?.color || Colors.Red)
        .setImage(finalImage);

    let restMsg;
    try {
        restMsg = await threadChannel.send({ 
            content: '', 
            embeds: [restEmbed], 
            components: [restRow] 
        });
    } catch (err) { return 'end_error'; }

    const warningTimeout = setTimeout(() => {
        threadChannel.send("✶ الدانجـون سيبتلـعـكم بسبب الخمـول امام القائد 60 ثانية للاستمرار").catch(()=>{});
    }, 60000); 
      
    const decision = await new Promise(res => {
        const decCollector = restMsg.createMessageComponentCollector({ time: 120000 });
        
        decCollector.on('collect', async i => {
            clearTimeout(warningTimeout); 

            if (i.customId === 'continue') {
                let p = players.find(pl => pl.id === i.user.id);
                if (!p || p.class !== 'Leader') return i.reply({ content: "🚫 **فقط القائد يمكنه اختيار الاستمرار!**", flags: [MessageFlags.Ephemeral] });
                await i.deferUpdate(); 
                return decCollector.stop('continue');
            }

            if (i.customId === 'camp') {
                let p = players.find(pl => pl.id === i.user.id);
                if (!p || p.class !== 'Leader') return i.reply({ content: "⛺ **فقط القائد يمكنه نصب الخيمة!**", flags: [MessageFlags.Ephemeral] });
                
                const member = guild.members.cache.get(p.id);
                const campResult = await manageCampfires(p.id, guild.id, db, 'consume', member);

                if (!campResult.success) {
                    return i.reply({ 
                        content: `⛺ **عذراً، نفذت خيامك لهذا اليوم!**\nرصيدك الحالي: \`0 / ${campResult.max}\`\nيتم تجديد الخيم يومياً او عزز السيرفر بـ بوست لزيادة عدد الخيم.`, 
                        flags: [MessageFlags.Ephemeral] 
                    });
                }

                const nextFloor = floor + 1;
                
                try {
                    await db.query(`
                        INSERT INTO dungeon_saves ("hostID", "guildID", "floor", "timestamp") 
                        VALUES ($1, $2, $3, $4) 
                        ON CONFLICT("hostID") 
                        DO UPDATE SET "floor" = EXCLUDED.floor, "timestamp" = EXCLUDED.timestamp, "guildID" = EXCLUDED."guildID"
                    `, [p.id, guild.id, nextFloor, Date.now()]);
                } catch (e) {
                    await db.query(`
                        INSERT INTO dungeon_saves (hostid, guildid, floor, timestamp) 
                        VALUES ($1, $2, $3, $4) 
                        ON CONFLICT(hostid) 
                        DO UPDATE SET floor = EXCLUDED.floor, timestamp = EXCLUDED.timestamp, guildid = EXCLUDED.guildid
                    `, [p.id, guild.id, nextFloor, Date.now()]).catch(console.error);
                }
                
                await i.deferUpdate(); 
                return decCollector.stop('camp'); 
            }

            if (i.customId === 'retreat') {
                let p = players.find(pl => pl.id === i.user.id);
                
                if (p && p.class === 'Leader') {
                    await i.deferUpdate();
                    return decCollector.stop('retreat');
                } 
                else {
                    const pIndex = players.findIndex(pl => pl.id === i.user.id);
                    if (pIndex > -1) {
                        const leavingPlayer = players[pIndex];
                        leavingPlayer.retreatFloor = floor;
                        // نمرر startFloor عشان نعطيه جوائزه فقط للجلسة اللي لعبها الآن
                        const rewards = await handleMemberRetreat(leavingPlayer, floor, db, guild.id, threadChannel, startFloor);
                        retreatedPlayers.push(leavingPlayer);
                        players.splice(pIndex, 1); 
                        
                        let extraMsg = "";
                        // العرض البصري للرسالة هنا نحسبها من نقطة البداية
                        let pRepReward = 0; let pChests = 0;
                        const repM = { 20: 1, 30: 1, 35: 1, 40: 1, 45: 1, 50: 1, 55: 2, 60: 2, 65: 3, 70: 3, 75: 4, 80: 5, 85: 5, 90: 5, 95: 5, 100: 5 };
                        for(let x = startFloor; x <= floor; x++) { if(repM[x]) pRepReward+=repM[x]; if(x%10===0) pChests++; }

                        if (pRepReward > 0) extraMsg += ` و **${pRepReward}** 🌟 REP`;
                        if (pChests > 0) extraMsg += ` و **${pChests}** 🎁 Box`;

                        await i.reply({ content: `👋 **انسحبت!** وحصلت على: **${rewards.mora}** مورا و **${rewards.xp}** XP${extraMsg}.`, flags: [MessageFlags.Ephemeral] });
                        await threadChannel.send(`💨 **${leavingPlayer.name}** انسحب واكتفى بغنائمه!`).catch(()=>{});
                        
                        if (players.length === 0) decCollector.stop('retreat');
                        if (leavingPlayer.class === 'Leader') handleLeaderSuccession(players, log);
                    }
                }
            }
        });
        
        decCollector.on('end', (c, reason) => { clearTimeout(warningTimeout); res(reason); });
    });

    await restMsg.edit({ components: [] }).catch(()=>{});
    return decision;
}

module.exports = { applyPostBattleUpdates, handleRestMenu };
