const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const TIERS = {
    bronze: { id: 'bronze', name: 'تذكرة المغامر', price: 100, color: 0xcd7f32, label: '100' },
    silver: { id: 'silver', name: 'تذكرة النبلاء', price: 500, color: 0xc0c0c0, label: '500' },
    gold:   { id: 'gold',   name: 'تذكرة الإمبراطور', price: 1000, color: 0xffd700, label: '1000' }
};

const SYMBOLS = {
    CROWN: { emoji: '👑', multi: 10 },
    SWORD: { emoji: '⚔️', multi: 3 },
    FISH:  { emoji: '🐟', multi: 1.5 },
    JOKER: { emoji: '🧚‍♀️', multi: 0 }, 
    MIMIC: { emoji: '👹', multi: 0 },  
    JUNK:  ['🪨', '🪵', '🍄', '☁️', '🦴', '🍎', '🧩'] 
};

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
            if (r < 2) grid.push(SYMBOLS.JOKER.emoji);
            else if (r < 5) grid.push(SYMBOLS.CROWN.emoji);
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
    
    let others = revealedSymbols.filter(s => 
        s !== SYMBOLS.JOKER.emoji && 
        s !== SYMBOLS.MIMIC.emoji && 
        !SYMBOLS.JUNK.includes(s)
    );

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
            
            const btn = new ButtonBuilder()
                .setCustomId(`scratch_${index}`)
                .setDisabled(isRevealed || disableAll);

            if (isRevealed) {
                btn.setStyle(symbol === '👹' ? ButtonStyle.Danger : (SYMBOLS.JUNK.includes(symbol) ? ButtonStyle.Secondary : ButtonStyle.Primary))
                   .setLabel(symbol);
            } else {
                btn.setStyle(ButtonStyle.Secondary)
                   .setLabel('❓'); 
            }
            row.addComponents(btn);
        }
        rows.push(row);
    }
    return rows;
}

module.exports = {
    name: 'scratch',
    description: '🎟️ جرب حظك في بطاقات الخدش الإمبراطورية',
    aliases: ['كرت', 'خدش'],
    category: 'Economy',
    cooldown: 5,

    async execute(message, args) {
        const db = message.client.sql; 
        if (!db) return message.reply("⚠️ قنوات الاتصال بالخزينة الملكية معطلة حالياً.");

        const author = message.author;

        const chooseEmbed = new EmbedBuilder()
            .setTitle('🎪 طاولة الحظ الإمبراطورية')
            .setDescription('أهلاً بك في مائدة المخاطرة.\nاختر قيمة تذكرتك بالأسفل.. المجازفات الكبرى تجذب **الجنية 🧚‍♀️** التي تحقق لك الفوز، ولكنها قد توقظ **الميميك 👹** من سباته!')
            .setColor(0x2b2d31)
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

            if (i.customId.startsWith('buy_')) {
                const tierId = i.customId.split('_')[1];
                currentTier = TIERS[tierId];

                try {
                    let userRes;
                    try { userRes = await db.query(`SELECT "mora" FROM levels WHERE "user" = $1 AND "guild" = $2`, [author.id, message.guild.id]); }
                    catch(e) { userRes = await db.query(`SELECT mora FROM levels WHERE userid = $1 AND guildid = $2`, [author.id, message.guild.id]).catch(()=>({rows:[]})); }
                    
                    const balance = userRes && userRes.rows[0] ? (Number(userRes.rows[0].mora) || 0) : 0;

                    if (balance < currentTier.price) {
                        return i.reply({ content: `❌ جيوبك فارغة! تحتاج إلى **${currentTier.price} مورا** للجلوس على هذه الطاولة.`, ephemeral: true });
                    }

                    try { await db.query(`UPDATE levels SET "mora" = "mora" - $1 WHERE "user" = $2 AND "guild" = $3`, [currentTier.price, author.id, message.guild.id]); }
                    catch(e) { await db.query(`UPDATE levels SET mora = mora - $1 WHERE userid = $2 AND guildid = $3`, [currentTier.price, author.id, message.guild.id]).catch(()=>{}); }

                } catch (err) {
                    return i.reply({ content: `⚠️ خلل في النظام المصرفي.`, ephemeral: true });
                }

                gameActive = true;
                grid = generateGrid(tierId);

                const gameEmbed = new EmbedBuilder()
                    .setTitle(currentTier.name)
                    .setDescription(`لقد رميت **${currentTier.price} مورا** على الطاولة.\n\nاكشف المربعات لجمع **3 رموز متطابقة**.\n(تذكر: الجنية 🧚‍♀️ تسد أي فراغ، والميميك 👹 ينهي مسيرتك فجأة!)`)
                    .setColor(currentTier.color);

                await i.update({ embeds: [gameEmbed], components: buildGridComponents(revealed, grid, false) });
            } 
            
            else if (i.customId.startsWith('scratch_') && gameActive) {
                const index = parseInt(i.customId.split('_')[1]);
                revealed[index] = true;

                const revealedSymbols = grid.filter((_, idx) => revealed[idx]);
                let gameOver = false;
                let finalEmbed = new EmbedBuilder().setTitle(currentTier.name).setColor(currentTier.color);

                if (grid[index] === SYMBOLS.MIMIC.emoji) {
                    gameOver = true;
                    finalEmbed.setDescription(`💥 **تمزقت البطاقة!**\nلقد أيقظت الميميك الجائع 👹 والتهم أموالك.\nخسرت **${currentTier.price} مورا**.`);
                    finalEmbed.setColor(0xE74C3C);
                } 
                else {
                    const winStatus = checkWin(revealedSymbols);
                    
                    if (winStatus.win) {
                        gameOver = true;
                        const prize = currentTier.price * winStatus.multi;
                        
                        if (prize > 0) {
                            try {
                                try { await db.query(`UPDATE levels SET "mora" = "mora" + $1 WHERE "user" = $2 AND "guild" = $3`, [prize, author.id, message.guild.id]); }
                                catch(e) { await db.query(`UPDATE levels SET mora = mora + $1 WHERE userid = $2 AND guildid = $3`, [prize, author.id, message.guild.id]).catch(()=>{}); }
                            } catch (err) {}
                        }

                        finalEmbed.setDescription(`🎉 **ابتسم لك الحظ!**\nلقد جمعت 3 رموز (${winStatus.symbol}) بنجاح.\nغادرت الطاولة بـ **${prize} مورا**! 💰`);
                        finalEmbed.setColor(0x2ECC71);
                    } 
                    else if (revealedSymbols.length === 9) {
                        gameOver = true;
                        finalEmbed.setDescription(`🗑️ **بطاقة خاسرة..**\nامتلأت الساحة بالخردة ولم تجمع شيئاً مفيداً.\nخسرت **${currentTier.price} مورا**.`);
                        finalEmbed.setColor(0x95A5A6);
                    }
                    else {
                        finalEmbed.setDescription(`استمر في الكشف.. متبقي لك **${9 - revealedSymbols.length}** فرص.`);
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
        });

        collector.on('end', (collected, reason) => {
            if (reason === 'time' && initialMsg) {
                const timeoutEmbed = new EmbedBuilder()
                    .setDescription('⏳ نفد الوقت، غادرت طاولة الحظ.')
                    .setColor(0x2b2d31);
                initialMsg.edit({ embeds: [timeoutEmbed], components: [] }).catch(() => {});
            }
        });
    }
};
