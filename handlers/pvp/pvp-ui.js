const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, EmbedBuilder, Colors, AttachmentBuilder } = require("discord.js");
const { cleanDisplayName, buildHpBar, buildEffectsString } = require('./pvp-utils.js');
const { EMOJI_MORA } = require('./pvp-state.js');

let generatePvPImage;
try {
    ({ generatePvPImage } = require('../../generators/pvp-generator.js'));
} catch (e) {
    generatePvPImage = null;
}

function buildPvpSkillSelector(battleState) {
    const attackerId = battleState.turn[0];
    const attacker = battleState.players.get(attackerId);
    
    if (!attacker || attacker.isMonster || attacker.isBot) return null;

    const userSkills = attacker.skills || {};
    const availableSkills = Object.values(userSkills).filter(s => s.currentLevel > 0 || s.id.startsWith('race_'));
    if (availableSkills.length === 0) return null;

    const cooldowns = battleState.skillCooldowns[attackerId] || {};
    const options = [];

    availableSkills.forEach(skill => {
        const cd = cooldowns[skill.id] || 0;
        const cdText = cd > 0 ? `⏳ انتظار: ${cd} جولات` : `${skill.description || skill.name}`;

        options.push(new StringSelectMenuOptionBuilder()
            .setLabel(skill.name)
            .setValue(skill.id)
            .setDescription(cdText.substring(0, 100))
            .setEmoji(skill.emoji || '✨')
        );
    });

    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('pvp_skill_select_menu')
            .setPlaceholder('✨ اختر مهارة قتالية...')
            .addOptions(options.slice(0, 25))
    );
}

async function buildBattleEmbed(battleState) {
    const [attackerId, defenderId] = battleState.turn;
    const attacker = battleState.players.get(attackerId);
    const defender = battleState.players.get(defenderId);

    if (!attacker || !defender) return { embeds: [], components: [], files: [] };

    const attackerName = attacker.isMonster || attacker.isBot ? attacker.name : cleanDisplayName(attacker.member?.displayName || attacker.member?.user?.username || 'مقاتل');
    const defenderName = defender.isMonster || defender.isBot ? defender.name : cleanDisplayName(defender.member?.displayName || defender.member?.user?.username || 'مقاتل');

    let components = [];

    if (!attacker.isMonster && !attacker.isBot) {
        const mainButtons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('pvp_action_attack').setLabel('هـجـوم').setStyle(ButtonStyle.Danger).setEmoji('⚔️'),
            new ButtonBuilder().setCustomId('pvp_action_skill').setLabel('مـهــارات').setStyle(ButtonStyle.Primary).setEmoji('✨'),
            new ButtonBuilder().setCustomId('pvp_action_forfeit').setLabel('انسحاب').setStyle(ButtonStyle.Secondary).setEmoji('🏳️')
        );
        components = [mainButtons];
    }

    let files = [];
    let embeds = [];

    if (generatePvPImage) {
        try {
            const buffer = await generatePvPImage(battleState);
            if (buffer) {
                const attachment = new AttachmentBuilder(buffer, { name: 'pvp_battle.png' });
                files.push(attachment);
            }
        } catch (err) {
            console.error("[PvP Canvas Generation Error]:", err);
        }
    }

    if (files.length === 0) {
        const embed = new EmbedBuilder().setTitle(`⚔️ ${attackerName} 🆚 ${defenderName} ⚔️`).setColor(Colors.Red);
        embed.addFields(
            { name: `${attackerName}`, value: `صحة: ${buildHpBar(attacker.hp, attacker.maxHp)}\nتأثيرات: ${buildEffectsString(attacker.effects)}`, inline: true },
            { name: `${defenderName}`, value: `صحة: ${buildHpBar(defender.hp, defender.maxHp)}\nتأثيرات: ${buildEffectsString(defender.effects)}`, inline: true }
        );

        if (battleState.isPvE) {
            embed.setDescription(`🦑 **معركة صيد ملحمية!**\nالدور الآن: **${attackerName}**`);
        } else {
            const turnMention = attacker.isBot ? attackerName : `<@${attacker.member?.id}>`;
            embed.setDescription(`الرهان: **${(battleState.bet * 2).toLocaleString()}** ${EMOJI_MORA}\n\n**الدور الآن لـ:** ${turnMention}`);
        }

        if (battleState.log.length > 0) embed.addFields({ name: "📝 السجل:", value: battleState.log.slice(-3).join('\n'), inline: false });
        embeds.push(embed);
    }

    return { embeds, components, files };
}

async function updateSpectatorEmbed(battleState) {
    if (!battleState.spectatorMessage) return;

    const p1Id = Array.from(battleState.players.keys())[0];
    const p2Id = Array.from(battleState.players.keys())[1];
    
    const p1 = battleState.players.get(p1Id);
    const p2 = battleState.players.get(p2Id);

    const p1Name = p1?.isBot ? p1.name : cleanDisplayName(p1?.member?.displayName || p1?.member?.user?.username || 'اللاعب 1');
    const p2Name = p2?.isBot ? p2.name : cleanDisplayName(p2?.member?.displayName || p2?.member?.user?.username || 'اللاعب 2');

    const totalP1 = battleState.bettingPool?.totalP1 || 0;
    const totalP2 = battleState.bettingPool?.totalP2 || 0;
    const totalPool = totalP1 + totalP2;

    let p1Odds = "1.00x";
    let p2Odds = "1.00x";

    if (totalPool > 0) {
        const netPool = totalPool * 0.95; 
        if (totalP1 > 0) p1Odds = (netPool / totalP1).toFixed(2) + "x";
        if (totalP2 > 0) p2Odds = (netPool / totalP2).toFixed(2) + "x";
    }

    const embed = new EmbedBuilder()
        .setTitle('✥ شـبـاك المـراهنـات')
        .setColor(0x795199);

    if (battleState.bettingPool?.isOpen) {
        embed.setDescription(
            `✦ راهـن على الفـائز … فإما مجدٌ أو الخسارة!\n` +
            `✦ صـنـدوق الرهـان: **${totalPool.toLocaleString()}** ${EMOJI_MORA}\n\n` +
            `✶ **${p1Name}**: **${totalP1.toLocaleString()}** ${EMOJI_MORA} (المضاعف: **${p1Odds}**)\n` +
            `✶ **${p2Name}**: **${totalP2.toLocaleString()}** ${EMOJI_MORA} (المضاعف: **${p2Odds}**)`
        )
        .setImage('https://i.postimg.cc/pXqkJWpP/1.png');
    } else {
        embed.setDescription(
            `🔒 **أُغلقت شباك التذاكر!**\n` +
            `✦ صـنـدوق الرهـان النهائـي: **${totalPool.toLocaleString()}** ${EMOJI_MORA}\n\n` +
            `✶ **${p1Name}**: **${totalP1.toLocaleString()}** ${EMOJI_MORA} (المضاعف: **${p1Odds}**)\n` +
            `✶ **${p2Name}**: **${totalP2.toLocaleString()}** ${EMOJI_MORA} (المضاعف: **${p2Odds}**)`
        )
        .setImage('https://i.postimg.cc/L6Nv39nM/2.png');
    }

    const threadIdStr = battleState.thread?.id || 'unknown_thread';

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`pvp_bet_${p1Id}_${threadIdStr}`).setLabel(`أراهن على ${p1Name}`).setStyle(ButtonStyle.Primary).setDisabled(!battleState.bettingPool?.isOpen),
        new ButtonBuilder().setCustomId(`pvp_bet_${p2Id}_${threadIdStr}`).setLabel(`أراهن على ${p2Name}`).setStyle(ButtonStyle.Danger).setDisabled(!battleState.bettingPool?.isOpen)
    );

    try {
        await battleState.spectatorMessage.edit({ embeds: [embed], components: [row] });
    } catch (e) {
        console.error("[Spectator Embed Edit Error]:", e.message);
    }
}

module.exports = {
    buildPvpSkillSelector,
    buildBattleEmbed,
    updateSpectatorEmbed
};
