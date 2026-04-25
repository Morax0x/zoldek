const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder } = require('discord.js');

// إعدادات البطاقات والأسعار
const TIERS = {
    bronze: { id: 'bronze', name: 'البطاقة النحاسية', price: 100, color: 0xcd7f32, label: 'نحاسية (100 مورا)' },
    silver: { id: 'silver', name: 'البطاقة الفضية', price: 500, color: 0xc0c0c0, label: 'فضية (500 مورا)' },
    gold: { id: 'gold', name: 'البطاقة الإمبراطورية', price: 1000, color: 0xffd700, label: 'إمبراطورية (1000 مورا)' }
};

// الرموز ونسبة ظهورها ومضاعفات الربح
const SYMBOLS = {
    CROWN: { emoji: '👑', multi: 10 },
    SWORD: { emoji: '⚔️', multi: 2 },
    FISH:  { emoji: '🐟', multi: 1 },
    SKULL: { emoji: '💀', multi: 0 },
    JOKER: { emoji: '🧚‍♀️', multi: 0 }, // الجوكر يكمل أي رمزين
    MIMIC: { emoji: '👹', multi: 0 }  // فخ الميميك يخسرك فوراً
};

// دالة لتوليد شبكة البطاقة (9 رموز) بشكل عشوائي بناءً على نوع البطاقة
function generateGrid(tierId) {
    const grid = [];
    for (let i = 0; i < 9; i++) {
        let r = Math.random() * 100;
        if (tierId === 'gold') {
            if (r < 3) grid.push(SYMBOLS.MIMIC.emoji);
            else if (r < 8) grid.push(SYMBOLS.JOKER.emoji);
            else if (r < 18) grid.push(SYMBOLS.CROWN.emoji);
            else if (r < 35) grid.push(SYMBOLS.SKULL.emoji);
            else if (r < 65) grid.push(SYMBOLS.SWORD.emoji);
            else grid.push(SYMBOLS.FISH.emoji);
        } else if (tierId === 'silver') {
            if (r < 3) grid.push(SYMBOLS.JOKER.emoji);
            else if (r < 8) grid.push(SYMBOLS.CROWN.emoji);
            else if (r < 30) grid.push(SYMBOLS.SKULL.emoji);
            else if (r < 60) grid.push(SYMBOLS.SWORD.emoji);
            else grid.push(SYMBOLS.FISH.emoji);
        } else {
            if (r < 3) grid.push(SYMBOLS.CROWN.emoji);
            else if (r < 25) grid.push(SYMBOLS.SKULL.emoji);
            else if (r < 55) grid.push(SYMBOLS.SWORD.emoji);
            else grid.push(SYMBOLS.FISH.emoji);
        }
    }
    return grid;
}

// دالة فحص الفوز
function checkWin(revealedSymbols) {
    let jokerCount = revealedSymbols.filter(s => s === SYMBOLS.JOKER.emoji).length;
    let others = revealedSymbols.filter(s => s !== SYMBOLS.JOKER.emoji && s !== SYMBOLS.SKULL.emoji && s !== SYMBOLS.MIMIC.emoji);

    let counts = {};
    for (let s of others) counts[s] = (counts[s] || 0) + 1;

    // فحص الفوز بالترتيب من الأغلى للأرخص
    if ((counts[SYMBOLS.CROWN.emoji] || 0) + jokerCount >= 3) return { win: true, symbol: SYMBOLS.CROWN.emoji, multi: SYMBOLS.CROWN.multi };
    if ((counts[SYMBOLS.SWORD.emoji] || 0) + jokerCount >= 3) return { win: true, symbol: SYMBOLS.SWORD.emoji, multi: SYMBOLS.SWORD.multi };
    if ((counts[SYMBOLS.FISH.emoji]  || 0) + jokerCount >= 3) return { win: true, symbol: SYMBOLS.FISH.emoji, multi: SYMBOLS.FISH.multi };

    return { win: false };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('scratch')
        .setDescription('🎟️ اشترِ بطاقة خدش وجرب حظك!'),
    name: 'scratch',
    aliases: ['كرت', 'بطاقة', 'خدش'],
    category: 'Economy',
    cooldown: 5,

    async execute(messageOrInteraction) {
        const isSlash = typeof messageOrInteraction.isChatInputCommand === 'function' && messageOrInteraction.isChatInputCommand();
        const author = isSlash ? messageOrInteraction.user : messageOrInteraction.author;
        const db = messageOrInteraction.client.sql; // استدعاء قاعدة البيانات

        // --- 1. واجهة اختيار البطاقة ---
        const chooseEmbed = new EmbedBuilder()
            .setTitle('🎟️ متجر بطاقات الخدش הסحرية')
            .setDescription('اختر نوع البطاقة التي تود شراءها. البطاقات الأغلى تحتوي على جوائز أضخم (وفرصة للجوكر 🧚‍♀️ أو الميميك القاتل 👹)!')
            .setColor(0x9b59b6);

        const chooseRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('buy_bronze').setLabel(TIERS.bronze.label).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('buy_silver').setLabel(TIERS.silver.label).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('buy_gold').setLabel(TIERS.gold.label).setStyle(ButtonStyle.Primary)
        );

        let initialMsg;
        if (isSlash) {
            initialMsg = await messageOrInteraction.reply({ embeds: [chooseEmbed], components: [chooseRow], fetchReply: true });
        } else {
            initialMsg = await messageOrInteraction.reply({ embeds: [chooseEmbed], components: [chooseRow] });
        }

        const filter = i => i.user.id === author.id;
        const collector = initialMsg.createMessageComponentCollector({ filter, time: 60000 });

        let gameActive = false;
        let currentTier = null;
        let grid = [];
        let revealed = Array(9).fill(false);

        collector.on('collect', async (i) => {
            // --- 2. معالجة الشراء ---
            if (i.customId.startsWith('buy_')) {
                const tierId = i.customId.split('_')[1];
                currentTier = TIERS[tierId];

                /* =====================================================
                ⚠️ منطقة خصم الأموال من قاعدة البيانات ⚠️
                قم بتعديل هذا الاستعلام ليتطابق مع اسم جدول العملات لديك
                =====================================================
                */
                try {
                    // مثال لجلب الرصيد (عدله حسب جدولك، مثلاً users أو levels)
                    const userRes = await db.query(`SELECT balance FROM users WHERE id = $1`, [author.id]);
                    const balance = userRes.rows[0] ? userRes.rows[0].balance : 0;

                    if (balance < currentTier.price) {
                        return i.reply({ content: `❌ لا تملك مورا كافية لشراء هذه البطاقة! تحتاج إلى **${currentTier.price} مورا**.`, ephemeral: true });
                    }

                    // خصم المبلغ
                    await db.query(`UPDATE users SET balance = balance - $1 WHERE id = $2`, [currentTier.price, author.id]);
                } catch (err) {
                    console.error(err);
                    return i.reply({ content: `⚠️ حدث خطأ أثناء الاتصال بالبنك.`, ephemeral: true });
                }
                // =====================================================

                gameActive = true;
                grid = generateGrid(tierId);

                const gameEmbed = new EmbedBuilder()
                    .setTitle(currentTier.name)
                    .setDescription(`لقد دفعت **${currentTier.price} مورا**. ابدأ بخدش المربعات بالأسفل!\n(ابحث عن 3 رموز متطابقة للفوز)`)
                    .setColor(currentTier.color);

                await i.update({ embeds: [gameEmbed], components: buildGridComponents(revealed, grid, false) });
            } 
            
            // --- 3. معالجة الخدش ---
            else if (i.customId.startsWith('scratch_') && gameActive) {
                const index = parseInt(i.customId.split('_')[1]);
                revealed[index] = true;

                const revealedSymbols = grid.filter((_, idx) => revealed[idx]);
                let gameOver = false;
                let finalEmbed = new EmbedBuilder().setTitle(currentTier.name).setColor(currentTier.color);

                // فحص فخ الميميك
                if (grid[index] === SYMBOLS.MIMIC.emoji) {
                    gameOver = true;
                    finalEmbed.setDescription(`💥 **كارثــة!** لقد أيقظت الميميك المخفي 👹 وقام بتمزيق بطاقتك!\nخسرت **${currentTier.price} مورا**.`);
                    finalEmbed.setColor(0xE74C3C);
                } 
                else {
                    const winStatus = checkWin(revealedSymbols);
                    
                    // حالة الفوز
                    if (winStatus.win) {
                        gameOver = true;
                        const prize = currentTier.price * winStatus.multi;
                        
                        /* إضافة الجائزة لقاعدة البيانات */
                        try {
                            await db.query(`UPDATE users SET balance = balance + $1 WHERE id = $2`, [prize, author.id]);
                        } catch (err) { console.error(err); }

                        finalEmbed.setDescription(`🎉 **يا للـحـظ!** لقد عثرت على 3 رموز (${winStatus.symbol}).\nلقد فزت بـ **${prize} مورا**! 💰`);
                        finalEmbed.setColor(0x2ECC71);
                    } 
                    // حالة انتهاء المربعات بدون فوز
                    else if (revealedSymbols.length === 9) {
                        gameOver = true;
                        finalEmbed.setDescription(`😢 حظ أوفر.. لم تتمكن من جمع 3 رموز متطابقة.\nخسرت **${currentTier.price} مورا**.`);
                        finalEmbed.setColor(0x95A5A6);
                    }
                    // الاستمرار في اللعب
                    else {
                        finalEmbed.setDescription(`استمر في الخدش.. متبقي لك ${9 - revealedSymbols.length} مربعات.`);
                    }
                }

                // تحديث الواجهة
                if (gameOver) {
                    gameActive = false;
                    collector.stop();
                    // كشف باقي المربعات مع تعطيلها
                    await i.update({ embeds: [finalEmbed], components: buildGridComponents(Array(9).fill(true), grid, true) });
                } else {
                    await i.update({ embeds: [finalEmbed], components: buildGridComponents(revealed, grid, false) });
                }
            }
        });

        collector.on('end', (collected, reason) => {
            if (reason === 'time' && !gameActive && !currentTier) {
                initialMsg.edit({ content: '⏳ انتهى وقت شراء البطاقة.', embeds: [], components: [] }).catch(() => {});
            }
        });
    }
};

// دالة مساعدة لبناء شبكة الأزرار 3x3
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
                // إذا كان الرمز ميميك أو جمجمة نجعله أحمر، غير ذلك أزرق
                btn.setStyle(symbol === '👹' || symbol === '💀' ? ButtonStyle.Danger : ButtonStyle.Primary)
                   .setLabel(symbol);
            } else {
                btn.setStyle(ButtonStyle.Secondary)
                   .setLabel('❓'); // أو يمكن استخدام إيموجي خدش ⬛
            }
            row.addComponents(btn);
        }
        rows.push(row);
    }
    return rows;
}
