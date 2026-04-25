const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const TIERS = {
    bronze: { id: 'bronze', name: '100 نحاسية', price: 100, color: 0xcd7f32, label: '100 نحاسية' },
    silver: { id: 'silver', name: '500 فضية', price: 500, color: 0xc0c0c0, label: '500 فضية' },
    gold:   { id: 'gold',   name: '1000 ذهبية', price: 1000, color: 0xffd700, label: '1000 ذهبية' }
};

const SYMBOLS = {
    CROWN: { emoji: '👑', multi: 10 },
    SWORD: { emoji: '⚔️', multi: 3 },
    FISH:  { emoji: '🐟', multi: 1.5 },
    JOKER: { emoji: '🧚‍♀️', multi: 0 }, 
    MIMIC: { emoji: '👹', multi: 0 },  
    JUNK:  ['🪨', '🪵', '🍄', '☁️', '🦴', '🍎', '🧩'] 
};

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

// دالة آمنة 100% لتحديث الرصيد في قاعدة البيانات والكاش
async function updateMora(client, userId, guildId, amount) {
    const db = client.sql;
    if (!db) return false;
    
    try {
        try { 
            await db.query(`UPDATE levels SET "mora" = COALESCE("mora", 0) + $1 WHERE "user" = $2 AND "guild" = $3`, [amount, userId, guildId]); 
        } catch (e1) { 
            await db.query(`UPDATE levels SET mora = COALESCE(mora, 0) + $1 WHERE userid = $2 AND guildid = $3`, [amount, userId, guildId]); 
        }

        // تحديث الكاش لكي ينعكس فوراً في أمر الرصيد
        if (client.levels && typeof client.levels.get === 'function') {
            let cacheData = client.levels.get(`${userId}-${guildId}`);
            if (cacheData) cacheData.mora = (cacheData.mora || 0) + amount;
        }
        return true;
    } catch (error) {
        console.error("[Mora Update Error]:", error);
        return false;
    }
}

module.exports = {
    name: 'scratch',
    description: '✥ اشـتـري بـطـاقـة اليانـصيـب🎟️',
    aliases: ['يانصيب', 'يا نصيب', 'تذكرة', 'حظ', 'كرت', 'خدش'],
    category: 'Economy',
    cooldown: 5,

    async execute(message, args) {
        const db = message.client.sql; 
        if (!db) return message.reply("⚠️ قنوات الاتصال بالخزينة الملكية معطلة حالياً.");

        const author = message.author;

        const chooseEmbed = new EmbedBuilder()
            .setTitle('✥ اشـتـري بـطـاقـة اليانـصيـب🎟️')
            .setDescription('✶ جـرب حـظـك باليانصيـب واشتري تذكرتك\n\n✦ اجـمـع 3 رمـوز مشـابهـة لمضاعفـة ربحـك <a:mTrophy:1438797228826300518>\n✦ رمـز الحـظ «🧚‍♀️» يكـمـل اي رمـز آخـر <a:6aMoney:1439572832219693116>')
            .setColor(getRandomColor())
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

                // التحقق من الرصيد
                let balance = 0;
                try {
                    let userRes;
                    try { userRes = await db.query(`SELECT "mora" FROM levels WHERE "user" = $1 AND "guild" = $2`, [author.id, message.guild.id]); }
                    catch(e) { userRes = await db.query(`SELECT mora FROM levels WHERE userid = $1 AND guildid = $2`, [author.id, message.guild.id]).catch(()=>({rows:[]})); }
                    balance = userRes && userRes.rows[0] ? (Number(userRes.rows[0].mora) || 0) : 0;
                } catch(e) {}

                if (balance < currentTier.price) {
                    return i.reply({ content: `❌ رصيدك لا يكفي! تحتاج إلى **${currentTier.price}** <:mora:1435647151349698621> لشراء التذكرة.`, ephemeral: true });
                }

                // خصم سعر التذكرة (بإرسال القيمة بالسالب)
                const deducted = await updateMora(message.client, author.id, message.guild.id, -currentTier.price);
                if (!deducted) {
                    return i.reply({ content: `⚠️ خلل في النظام المصرفي، لم نتمكن من خصم المبلغ.`, ephemeral: true });
                }

                gameActive = true;
                grid = generateGrid(tierId);

                const gameEmbed = new EmbedBuilder()
                    .setTitle(`✶ بطـاقـة يانصيـب ${currentTier.name}`)
                    .setDescription(`✦ اشتـريـت تذكـرة ${currentTier.price} ${currentTier.name} <:mora:1435647151349698621>\n✦ اكشـط بطاقة اليانصيـب \n✦ حـاول جـمع 3 رمـوز مشابهـة <:2BCrikka:1437806481071411391>`)
                    .setColor(getRandomColor())
                    .setFooter({ text: `المقامر: ${author.username}`, iconURL: author.displayAvatarURL() });

                await i.update({ embeds: [gameEmbed], components: buildGridComponents(revealed, grid, false) });
            } 
            
            else if (i.customId.startsWith('scratch_') && gameActive) {
                const index = parseInt(i.customId.split('_')[1]);
                revealed[index] = true;

                const revealedSymbols = grid.filter((_, idx) => revealed[idx]);
                let gameOver = false;
                let finalEmbed = new EmbedBuilder().setFooter({ text: `المقامر: ${author.username}`, iconURL: author.displayAvatarURL() });
                finalEmbed.setColor(getRandomColor());

                const baseDesc = `✦ اشتـريـت تذكـرة ${currentTier.price} ${currentTier.name} <:mora:1435647151349698621>\n✦ اكشـط بطاقة اليانصيـب \n✦ حـاول جـمع 3 رمـوز مشابهـة <:2BCrikka:1437806481071411391>`;

                if (grid[index] === SYMBOLS.MIMIC.emoji) {
                    gameOver = true;
                    finalEmbed.setTitle(`✶ خـسـرت .. Gg`)
                    finalEmbed.setDescription(`✶ **تمزقت بطاقـة اليانصيـب !**\nلقد أيقظت الميميك والتهـم اموالـك👹\nخسرت **${currentTier.price}** 💥`);
                    finalEmbed.setColor(0xE74C3C);
                } 
                else {
                    const winStatus = checkWin(revealedSymbols);
                    
                    if (winStatus.win) {
                        gameOver = true;
                        const prize = currentTier.price * winStatus.multi;
                        finalEmbed.setTitle(`✶ كـفـوو علـيـك ~`);
                        
                        if (prize > 0) {
                            // إضافة الجائزة للرصيد
                            await updateMora(message.client, author.id, message.guild.id, prize);
                        }

                        finalEmbed.setDescription(`✦ ضـربـة حـظ ! <a:mTrophy:1438797228826300518>\n✦ جـمعـت 3 رمـوز «${winStatus.symbol}»\n✦ ربـحـت **${prize}** <:mora:1435647151349698621>`);
                        finalEmbed.setColor(0x2ECC71);
                    } 
                    else if (revealedSymbols.length === 9) {
                        gameOver = true;
                        finalEmbed.setTitle(`✶ خـسـرت .. Gg`)
                        finalEmbed.setDescription(`✶ بـطاقـة يـانصـيب خـاسـرة امتلأت الساحة بالخردة ~\n✶ خـسـرت **${currentTier.price}** <:mora:1435647151349698621>`);
                        finalEmbed.setColor(0x95A5A6);
                    }
                    else {
                        finalEmbed.setTitle(`✶ بطـاقـة يانصيـب ${currentTier.name}`)
                        finalEmbed.setDescription(`${baseDesc}\n\n✦ استمر.. متبقي لك **${9 - revealedSymbols.length}** فـرص`);
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

        collector.on('end', async (collected, reason) => {
            if (reason === 'time' && initialMsg) {
                await initialMsg.edit({ components: gameActive ? buildGridComponents(revealed, grid, true) : [] }).catch(() => {});
            }
        });
    }
};
