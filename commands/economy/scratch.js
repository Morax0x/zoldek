const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const TIERS = {
    bronze: { id: 'bronze', name: 'نحاسية', price: 100, color: 0xcd7f32, label: '100 نحاسية' },
    silver: { id: 'silver', name: 'فضية', price: 500, color: 0xc0c0c0, label: '500 فضية' },
    gold:   { id: 'gold',   name: 'ذهبية', price: 1000, color: 0xffd700, label: '1000 ذهبية' }
};

const SYMBOLS = {
    CROWN: { emoji: '👑', multi: 10 },
    SWORD: { emoji: '⚔️', multi: 3 },
    FISH:  { emoji: '🐟', multi: 1.5 },
    JOKER: { emoji: '🧚‍♀️', multi: 0 }, 
    MIMIC: { emoji: '👹', multi: 0 },  
    JUNK:  ['🪨', '🪵', '🍄', '☁️', '🦴', '🍎', '🧩'] 
};

const activeProcesses = new Set();
const BANNER_IMAGE = 'https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev/images/img/sk.png'; // 🖼️ رابط البانر الخاص بك

function getRandomColor() {
    return Math.floor(Math.random() * 16777215);
}

function generateGrid(tierId) {
    const grid = [];
    for (let i = 0; i < 9; i++) {
        let r = Math.random() * 100;
        let randomJunk = SYMBOLS.JUNK[Math.floor(Math.random() * SYMBOLS.JUNK.length)];

        if (tierId === 'gold') {
            if (r < 8) grid.push(SYMBOLS.MIMIC.emoji);
            else if (r < 11) grid.push(SYMBOLS.JOKER.emoji);
            else if (r < 15) grid.push(SYMBOLS.CROWN.emoji);
            else if (r < 25) grid.push(SYMBOLS.SWORD.emoji);
            else if (r < 45) grid.push(SYMBOLS.FISH.emoji);
            else grid.push(randomJunk);
        } else if (tierId === 'silver') {
            if (r < 4) grid.push(SYMBOLS.JOKER.emoji);
            else if (r < 8) grid.push(SYMBOLS.CROWN.emoji);
            else if (r < 14) grid.push(SYMBOLS.SWORD.emoji);
            else if (r < 30) grid.push(SYMBOLS.FISH.emoji);
            else grid.push(randomJunk);
        } else {
            if (r < 2) grid.push(SYMBOLS.CROWN.emoji);
            else if (r < 10) grid.push(SYMBOLS.SWORD.emoji);
            else if (r < 25) grid.push(SYMBOLS.FISH.emoji);
            else grid.push(randomJunk);
        }
    }
    return grid;
}

function checkWin(revealedSymbols) {
    let jokerCount = revealedSymbols.filter(s => s === SYMBOLS.JOKER.emoji).length;
    let others = revealedSymbols.filter(s => s !== SYMBOLS.JOKER.emoji && s !== SYMBOLS.MIMIC.emoji && !SYMBOLS.JUNK.includes(s));
    let counts = {};
    for (let s of others) counts[s] = (counts[s] || 0) + 1;

    if ((counts[SYMBOLS.CROWN.emoji] || 0) + jokerCount >= 3) return { win: true, symbol: SYMBOLS.CROWN.emoji, multi: SYMBOLS.CROWN.multi };
    if ((counts[SYMBOLS.SWORD.emoji] || 0) + jokerCount >= 3) return { win: true, symbol: SYMBOLS.SWORD.emoji, multi: SYMBOLS.SWORD.multi };
    if ((counts[SYMBOLS.FISH.emoji]  || 0) + jokerCount >= 3) return { win: true, symbol: SYMBOLS.FISH.emoji, multi: SYMBOLS.FISH.multi };

    return { win: false };
}

function buildGridComponents(revealedArray, gridArray, disableAll) {
    const rows = [];
    for (let i = 0; i < 3; i++) {
        const row = new ActionRowBuilder();
        for (let j = 0; j < 3; j++) {
            const index = i * 3 + j;
            const isRevealed = revealedArray[index];
            const symbol = gridArray[index];
            const btn = new ButtonBuilder().setCustomId(`scratch_${index}`).setDisabled(isRevealed || disableAll);

            if (isRevealed) {
                btn.setStyle(symbol === '👹' ? ButtonStyle.Danger : (SYMBOLS.JUNK.includes(symbol) ? ButtonStyle.Secondary : ButtonStyle.Primary)).setLabel(symbol);
            } else {
                btn.setStyle(ButtonStyle.Secondary).setLabel('❓'); 
            }
            row.addComponents(btn);
        }
        rows.push(row);
    }
    return rows;
}

module.exports = {
    name: 'scratch',
    description: '✥ اشـتـري بـطـاقـة اليانـصيـب🎟️',
    aliases: ['يانصيب', 'يا نصيب', 'تذكرة', 'حظ', 'كرت', 'خدش'],
    category: 'Economy',
    cooldown: 5,

    async execute(message, args) {
        const client = message.client;
        const author = message.author;
        const guild = message.guild;

        const chooseEmbed = new EmbedBuilder()
            .setTitle('✥ اشـتـري بـطـاقـة اليانـصيـب🎟️')
            .setDescription('✶ جـرب حـظـك باليانصيـب واشتري تذكرتك\n\n✦ اجـمـع 3 رمـوز مشـابهـة لمضاعفـة ربحـك <a:mTrophy:1438797228826300518>\n✦ رمـز الحـظ «🧚‍♀️» يكـمـل اي رمـز آخـر <a:6aMoney:1439572832219693116>')
            .setColor(getRandomColor())
            .setImage(BANNER_IMAGE) // 🖼️ البانر
            .setFooter({ text: `المقامر: ${author.username}`, iconURL: author.displayAvatarURL() });

        const chooseRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('buy_bronze').setLabel(TIERS.bronze.label).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('buy_silver').setLabel(TIERS.silver.label).setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('buy_gold').setLabel(TIERS.gold.label).setStyle(ButtonStyle.Success)
        );

        const initialMsg = await message.reply({ embeds: [chooseEmbed], components: [chooseRow] });

        const filter = i => i.user.id === author.id;
        const collector = initialMsg.createMessageComponentCollector({ filter, time: 120000 });

        let gameActive = false;
        let currentTier = null;
        let grid = [];
        let revealed = Array(9).fill(false);

        collector.on('collect', async (i) => {
            if (activeProcesses.has(i.user.id)) return i.reply({ content: "⚠️ هدي اللعب! جاري معالجة طلبك السابق.", ephemeral: true });
            activeProcesses.add(i.user.id);

            if (i.customId.startsWith('buy_')) {
                const tierId = i.customId.split('_')[1];
                currentTier = TIERS[tierId];

                let data = await client.getLevel(author.id, guild.id);
                if (!data) {
                    data = { ...(client.defaultData || {}), user: author.id, guild: guild.id, mora: 0 };
                }

                let balance = Number(data.mora) || 0;

                if (balance < currentTier.price) {
                    activeProcesses.delete(i.user.id);
                    return i.reply({ content: `❌ رصيدك لا يكفي! تحتاج إلى **${currentTier.price}** <:mora:1435647151349698621> لشراء التذكرة.`, ephemeral: true });
                }

                data.mora = balance - currentTier.price;
                await client.setLevel(data);

                gameActive = true;
                grid = generateGrid(tierId);

                const gameEmbed = new EmbedBuilder()
                    .setTitle(`✶ بطـاقـة يانصيـب ${currentTier.name}`)
                    .setDescription(`✦ اشتـريـت تذكـرة ${currentTier.price} ${currentTier.name} <:mora:1435647151349698621>\n✦ اكشـط بطاقة اليانصيـب \n✦ حـاول جـمع 3 رمـوز مشابهـة <:2BCrikka:1437806481071411391>`)
                    .setColor(getRandomColor())
                    .setImage(BANNER_IMAGE) // 🖼️ البانر
                    .setFooter({ text: `المقامر: ${author.username}`, iconURL: author.displayAvatarURL() });

                await i.update({ embeds: [gameEmbed], components: buildGridComponents(revealed, grid, false) });
            } 
            
            else if (i.customId.startsWith('scratch_') && gameActive) {
                const index = parseInt(i.customId.split('_')[1]);
                revealed[index] = true;

                const revealedSymbols = grid.filter((_, idx) => revealed[idx]);
                let gameOver = false;
                let finalEmbed = new EmbedBuilder()
                    .setFooter({ text: `المقامر: ${author.username}`, iconURL: author.displayAvatarURL() })
                    .setColor(getRandomColor())
                    .setImage(BANNER_IMAGE); // 🖼️ البانر مستمر حتى النهاية

                const baseDesc = `✦ اشتـريـت تذكـرة ${currentTier.price} ${currentTier.name} <:mora:1435647151349698621>\n✦ اكشـط بطاقة اليانصيـب \n✦ حـاول جـمع 3 رمـوز مشابهـة <:2BCrikka:1437806481071411391>`;

                if (grid[index] === SYMBOLS.MIMIC.emoji) {
                    gameOver = true;
                    finalEmbed.setTitle(`✶ خـسـرت .. Gg`).setColor(0xE74C3C)
                    finalEmbed.setDescription(`✶ **تمزقت بطاقـة اليانصيـب !**\nلقد أيقظت الميميك والتهـم اموالـك👹\nخسرت **${currentTier.price}** 💥`);
                } 
                else {
                    const winStatus = checkWin(revealedSymbols);
                    if (winStatus.win) {
                        gameOver = true;
                        const prize = Math.floor(currentTier.price * winStatus.multi);
                        finalEmbed.setTitle(`✶ كـفـوو علـيـك ~`).setColor(0x2ECC71);
                        
                        let winData = await client.getLevel(author.id, guild.id);
                        if (!winData) winData = { ...(client.defaultData || {}), user: author.id, guild: guild.id, mora: 0 };
                        winData.mora = (Number(winData.mora) || 0) + prize;
                        await client.setLevel(winData);

                        finalEmbed.setDescription(`✦ ضـربـة حـظ ! <a:mTrophy:1438797228826300518>\n✦ جـمعـت 3 رمـوز «${winStatus.symbol}»\n✦ ربـحـت **${prize}** <:mora:1435647151349698621>`);
                    } 
                    else if (revealedSymbols.length === 9) {
                        gameOver = true;
                        finalEmbed.setTitle(`✶ خـسـرت .. Gg`).setColor(0x95A5A6);
                        finalEmbed.setDescription(`✶ بـطاقـة يـانصـيب خـاسـرة امتلأت الساحة بالخردة ~\n✶ خـسـرت **${currentTier.price}** <:mora:1435647151349698621>`);
                    }
                    else {
                        finalEmbed.setTitle(`✶ بطـاقـة يانصيـب ${currentTier.name}`).setDescription(`${baseDesc}\n\n✦ استمر.. متبقي لك **${9 - revealedSymbols.length}** فـرص`);
                    }
                }

                if (gameOver) {
                    gameActive = false;
                    collector.stop('finished');
                    await i.update({ embeds: [finalEmbed], components: buildGridComponents(Array(9).fill(true), grid, true) });
                } else {
                    await i.update({ embeds: [finalEmbed], components: buildGridComponents(revealed, grid, false) });
                }
            }
            activeProcesses.delete(i.user.id);
        });

        collector.on('end', async (collected, reason) => {
            if (reason === 'time' && initialMsg) {
                await initialMsg.edit({ components: gameActive ? buildGridComponents(revealed, grid, true) : [] }).catch(() => {});
            }
        });
    }
};
