const { ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, MessageFlags, Colors } = require("discord.js");
const { generatePvPImage } = require('../../generators/pvp-generator.js');
const { generatePvPResultImage } = require('../../generators/pvp-summary-generator.js');
const { calculateSkillRawValue } = require('../combat/skill-calculator.js');
const { getWeaponData, getUserRace } = require('./pvp-data.js');
const { cleanDisplayName } = require('./pvp-utils.js');

const KNIGHT_ID = "guard";
const EMOJI_MORA = '<:mora:1435647151349698621>';

async function startKnightBattle(context, client, sql, playerMember, amountToSteal) {
    const guild = context.guild;
    const userId = playerMember.id;

    // جلب بيانات اللاعب
    let pData = await client.getLevel(userId, guild.id);
    const pRace = await getUserRace(playerMember, sql);
    const pWeapon = await getWeaponData(sql, playerMember);
    const pMaxHp = 800 + ((pData.level || 1) * 60);

    // إعداد الفارس (Knight) كخصم PvE
    const knightMaxHp = Math.floor(pMaxHp * 1.5);
    const knightDmg = (pWeapon?.currentDamage || 20) * 1.4;

    const battleState = {
        isPvE: true,
        isEnded: false,
        amountToSteal: amountToSteal,
        turn: [userId, KNIGHT_ID],
        activeTurn: userId,
        log: ["🛡️ فارس الإمبراطور يغلق الأبواب! 'لن تخرج من هنا حياً!'"],
        players: new Map([
            [userId, { 
                id: userId, name: cleanDisplayName(playerMember.displayName), hp: pMaxHp, maxHp: pMaxHp, 
                atk: pWeapon?.currentDamage || 20, def: 10, effects: [], isMonster: false, member: playerMember 
            }],
            [KNIGHT_ID, { 
                id: KNIGHT_ID, name: "فارس الإمبراطور", hp: knightMaxHp, maxHp: knightMaxHp, 
                atk: knightDmg, def: 20, effects: [], isMonster: true, image: 'https://i.postimg.cc/d1ndBX7B/download.gif' 
            }]
        ])
    };

    return await renderBattleFrame(context, battleState);
}

async function renderBattleFrame(context, state) {
    if (state.isEnded) return;

    const imgBuffer = await generatePvPImage(state);
    const attachment = new AttachmentBuilder(imgBuffer, { name: 'knight_battle.png' });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`k_atk`).setLabel('هجوم').setStyle(ButtonStyle.Danger).setEmoji('⚔️'),
        new ButtonBuilder().setCustomId(`k_skill`).setLabel('مهارة').setStyle(ButtonStyle.Primary).setEmoji('✨')
    );

    const payload = {
        content: `**مبارزة الموت: ضد فارس الإمبراطور**`,
        files: [attachment],
        components: [row]
    };

    let msg;
    if (context.deferred || context.replied) msg = await context.editReply(payload);
    else msg = await context.reply(payload);

    const collector = msg.createMessageComponentCollector({ time: 300000 });

    collector.on('collect', async (i) => {
        if (i.user.id !== state.activeTurn) return i.reply({ content: "ليس دورك!", flags: [MessageFlags.Ephemeral] });
        await i.deferUpdate();
        
        // منطق دور اللاعب
        if (i.customId === 'k_atk') {
            const player = state.players.get(state.activeTurn);
            const guard = state.players.get(KNIGHT_ID);
            const dmg = player.atk;
            guard.hp -= dmg;
            state.log.push(`⚔️ **${player.name}** ضرب الفارس بـ **${dmg}** ضرر!`);
        }

        // فحص الفوز
        if (state.players.get(KNIGHT_ID).hp <= 0) {
            state.isEnded = true;
            collector.stop();
            return await endKnightBattle(context, state, state.activeTurn);
        }

        // دور الفارس (تلقائي)
        const guard = state.players.get(KNIGHT_ID);
        const player = state.players.get(userId);
        player.hp -= guard.atk;
        state.log.push(`🛡️ **الفارس** عاقبك بـ **${guard.atk}** ضرر!`);

        // فحص الخسارة
        if (player.hp <= 0) {
            state.isEnded = true;
            collector.stop();
            return await endKnightBattle(context, state, KNIGHT_ID);
        }

        // إعادة الرندرة
        const newImg = await generatePvPImage(state);
        await i.editReply({ files: [new AttachmentBuilder(newImg, { name: 'battle.png' })] });
    });
}

async function endKnightBattle(context, state, winnerId) {
    const isPlayerWinner = winnerId !== KNIGHT_ID;
    const resultImg = await generatePvPResultImage(state, winnerId, isPlayerWinner ? "S" : "F", state.amountToSteal, 0);
    
    await context.editReply({
        content: isPlayerWinner ? "🏆 **لقد هزمت الفارس بنجاح!**" : "💀 **لقد سحقك الفارس!**",
        files: [new AttachmentBuilder(resultImg, { name: 'result.png' })],
        components: []
    });
}

module.exports = { startKnightBattle };
