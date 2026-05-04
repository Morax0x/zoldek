const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, PermissionsBitField } = require('discord.js');

const EXPLOSION_GIFS = [
    'https://i.postimg.cc/0yKcSPb4/68747470733a2f2f73332e616d617a6f6e6177732e636f6d2f776174747061642d6d656469612d736572766963652f53746f.gif',
    'https://i.postimg.cc/sg0CjVtr/explosion-anime.gif',
    'https://i.postimg.cc/MGCkB963/iron-fortress-anime-explosion-8b0p2mohclh9op37.gif',
    'https://i.postimg.cc/qMkP2hrp/5m3hx4c835i51.gif'
];

const TICKING_GIFS = [
    'https://i.postimg.cc/254GHGd2/10a0d135574b9c9c7071e22a202f28d8.gif',
    'https://i.postimg.cc/fT99jLfR/elmo-fire.gif',
    'https://i.postimg.cc/LsHgpVKf/7bk0Rd.gif',
    'https://i.postimg.cc/FR6Y05fw/JN4CZA.gif',
    'https://i.postimg.cc/SQXr3mGC/ENdh.gif',
    'https://i.postimg.cc/FHxg3zhV/DU7W7i-UU0Gm-Cx2es-Byee-Qxq-Oi-Na-M-HJdauk-Ad3h-XWQUzk9rd-Oj4b1tpg9r-Plz1e6yl-YHBu-OHl4F6jm-Tll-EXcg.gif',
    'https://i.postimg.cc/k51QYH6v/47f13b34c588306cec12449fd49d9293-8514783385207371970.gif'
];

const WIN_GIFS = [
    'https://media1.tenor.com/m/9yX5X5X5X5X5X5X5/anime-victory.gif',
    'https://media1.tenor.com/m/7zX6X6X6X6X6X6X6/anime-celebrate.gif',
    'https://media1.tenor.com/m/PcPcPcPcPcPcPcPc/anime-win-happy.gif'
];

const LOBBY_GIF = 'https://i.postimg.cc/fT99jLfR/elmo-fire.gif';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('bomb-game')
        .setDescription('بدء فعالية القنبلة الموقوتة 💣')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageEvents),

    async execute(interaction) {
        const players = [];
        const hostId = interaction.user.id;

        const lobbyEmbed = new EmbedBuilder()
            .setTitle('💣 فعالية القنبلة الموقـوتــة')
            .setDescription(
                `**المنظم:** <@${hostId}>\n\n` +
                `**📜 طريقة اللعب:**\n` +
                `1️⃣ ستبدأ القنبلة عند لاعب عشوائي.\n` +
                `2️⃣ القنبلة ستنفجر في وقت **عشوائي ومجهول**!\n` +
                `3️⃣ إذا كانت القنبلة معك،اضغط زر **"ارمِ القنبلة"**.\n` +
                `4️⃣ اضغط الزر فوراً لتمرير القنبلة لشخص آخر \n` +
                `5️⃣ اللاعب الذي تنفجر القنبلة بيده **يخرج من اللعبة**.\n\n` +
                `** <a:MugiStronk:1438795606872166462> اضغط "دخول" للمشاركة الآن!**`
            )
            .setColor('DarkRed')
            .setImage(LOBBY_GIF)
            .setFooter({ text: 'Empire | الامبراطورية' });

        const lobbyRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('join_bomb_lobby').setLabel('دخول').setStyle(ButtonStyle.Success).setEmoji('✋'),
            new ButtonBuilder().setCustomId('start_bomb_game').setLabel('ابدأ اللعبة').setStyle(ButtonStyle.Danger).setEmoji('🔥')
        );

        const reply = await interaction.reply({ embeds: [lobbyEmbed], components: [lobbyRow], fetchReply: true });

        const lobbyCollector = reply.createMessageComponentCollector({ 
            componentType: ComponentType.Button, 
            time: 5 * 60 * 1000 
        });

        lobbyCollector.on('collect', async i => {
            if (i.customId === 'join_bomb_lobby') {
                if (players.includes(i.user.id)) {
                    return i.reply({ content: '⚠️ أنت مسجل بالفعل!', ephemeral: true });
                }
                players.push(i.user.id);
                
                const playerList = players.map((id, index) => `${index + 1}. <@${id}>`).join('\n');
                lobbyEmbed.setFields({ name: `👥 اللاعبون المشاركون (${players.length}):`, value: playerList || 'بانتظار اللاعبين...' });
                
                await i.update({ embeds: [lobbyEmbed] });
            } 
            
            else if (i.customId === 'start_bomb_game') {
                if (i.user.id !== hostId) {
                    return i.reply({ content: '🚫 فقط المنظم يمكنه بدء اللعبة!', ephemeral: true });
                }
                if (players.length < 2) {
                    return i.reply({ content: '⚠️ يجب توفر لاعبين اثنين على الأقل!', ephemeral: true });
                }

                lobbyCollector.stop('game_started');
                await i.update({ content: '✅ **تم إغلاق التسجيل! جاري تحضير القنبلة...**', components: [], embeds: [] });
                
                await startGameLoop(interaction.channel, players);
            }
        });
    }
};

async function startGameLoop(channel, players) {
    if (players.length === 1) {
        const winEmbed = new EmbedBuilder()
            .setTitle('🏆 انتــهـت اللعبة!')
            .setDescription(`🎉 **الفائز هو:** <@${players[0]}>\nنجوت من جميع الانفجارات <a:MugiStronk:1438795606872166462>!`)
            .setColor('Gold')
            .setImage(WIN_GIFS[Math.floor(Math.random() * WIN_GIFS.length)]);
        return channel.send({ content: `👑 الفائــز: <@${players[0]}>`, embeds: [winEmbed] });
    }

    const minTime = 8000;
    const maxTime = 25000;
    const explodeTime = Math.floor(Math.random() * (maxTime - minTime + 1)) + minTime; 
    
    let currentHolderIndex = Math.floor(Math.random() * players.length);
    let currentHolderId = players[currentHolderIndex];

    let roundEnded = false;
    let activeCollector = null;
    let activeMessage = null;

    const explosionTimer = setTimeout(async () => {
        roundEnded = true;
        if (activeCollector) activeCollector.stop('exploded');

        if (activeMessage) {
            const disabledRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('disabled').setLabel('💥 انتـهى الوقـت!').setStyle(ButtonStyle.Secondary).setDisabled(true)
            );
            await activeMessage.edit({ components: [disabledRow] }).catch(() => {});
        }

        const explodedEmbed = new EmbedBuilder()
            .setTitle('💥 بـــووم!')
            .setDescription(`انفجرت القنبلة في يد <@${currentHolderId}>!\n\n**تم إقصاؤه من اللعبة!** 💀`)
            .setColor('DarkButNotBlack')
            .setImage(EXPLOSION_GIFS[Math.floor(Math.random() * EXPLOSION_GIFS.length)]) 
            .setFooter({ text: `عدد اللاعبين المتبقين: ${players.length - 1}` });

        await channel.send({ content: `💀 **مات <@${currentHolderId}>**`, embeds: [explodedEmbed] });

        const loserIndex = players.indexOf(currentHolderId);
        if (loserIndex > -1) {
            players.splice(loserIndex, 1);
        }

        setTimeout(() => {
            startGameLoop(channel, players);
        }, 1500);

    }, explodeTime);

    async function sendTurnMessage(holderId) {
        if (roundEnded) return;

        const gameEmbed = new EmbedBuilder()
            .setTitle('💣 القنبلة تكتك...')
            .setDescription(`القنبلة الآن عند: <@${holderId}>\n\n**بسرعة! ارمها لشخص آخر!**`)
            .setColor('Red')
            .setImage(TICKING_GIFS[Math.floor(Math.random() * TICKING_GIFS.length)]); 

        const throwRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('throw_bomb_action')
                .setLabel('ارمِ القنبلة! 🧨')
                .setStyle(ButtonStyle.Danger)
        );

        const msg = await channel.send({ 
            content: `<a:Nerf:1438795685280612423> القنبـلة عنـد <@${holderId}>!`, 
            embeds: [gameEmbed], 
            components: [throwRow] 
        });

        activeMessage = msg;

        const collector = msg.createMessageComponentCollector({ 
            componentType: ComponentType.Button, 
            time: 20000 
        });
        activeCollector = collector;

        collector.on('collect', async i => {
            if (roundEnded) {
                if (!i.replied && !i.deferred) await i.deferUpdate().catch(()=>{});
                return;
            }

            if (i.user.id !== holderId) {
                return i.reply({ content: 'القنبلة مو عندك يا سبـك <:stop:1436337453098340442>', ephemeral: true });
            }

            collector.stop('passed');

            const passedEmbed = new EmbedBuilder()
                .setDescription(`💨 **${i.user.username}** تخلص من القنبلة!`)
                .setColor('Grey');
            
            await i.update({ embeds: [passedEmbed], components: [] });

            let availableTargets = players.filter(id => id !== holderId);
            let newTargetId = availableTargets[Math.floor(Math.random() * availableTargets.length)];
            currentHolderId = newTargetId;

            sendTurnMessage(newTargetId);
        });
    }

    sendTurnMessage(currentHolderId);
}
