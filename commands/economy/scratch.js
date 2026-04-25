const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// ─── إعدادات البطاقات والأسعار ──────────────────────────────────────────
const TIERS = {
    bronze: { id: 'bronze', name: 'البطاقة النحاسية', price: 100, color: 0xcd7f32, label: 'نحاسية (100 مورا)' },
    silver: { id: 'silver', name: 'البطاقة الفضية', price: 500, color: 0xc0c0c0, label: 'فضية (500 مورا)' },
    gold:   { id: 'gold',   name: 'البطاقة الإمبراطورية', price: 1000, color: 0xffd700, label: 'إمبراطورية (1000 مورا)' }
};

// ─── الرموز ونسبة ظهورها ومضاعفات الربح ─────────────────────────────────
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
            if (r < 4) grid.push(SYMBOLS.MIMIC.emoji);
            else if (r < 10) grid.push(SYMBOLS.JOKER.emoji);
            else if (r < 20) grid.push(SYMBOLS.CROWN.emoji);
            else if (r < 35) grid.push(SYMBOLS.SKULL.emoji);
            else if (r < 65) grid.push(SYMBOLS.SWORD.emoji);
            else grid.push(SYMBOLS.FISH.emoji);
        } else if (tierId === 'silver') {
            if (r < 4) grid.push(SYMBOLS.JOKER.emoji);
            else if (r < 10) grid.push(SYMBOLS.CROWN.emoji);
            else if (r < 30) grid.push(SYMBOLS.SKULL.emoji);
            else if (r < 60) grid.push(SYMBOLS.SWORD.emoji);
            else grid.push(SYMBOLS.FISH.emoji);
        } else {
            if (r < 5) grid.push(SYMBOLS.CROWN.emoji);
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

    // فحص الفوز بالترتيب من الأغلى للأرخص (الجنية تكمل الناقص)
    if ((counts[SYMBOLS.CROWN.emoji] || 0) + jokerCount >= 3) return { win: true, symbol: SYMBOLS.CROWN.emoji, multi: SYMBOLS.CROWN.multi };
    if ((counts[SYMBOLS.SWORD.emoji] || 0) + jokerCount >= 3) return { win: true, symbol: SYMBOLS.SWORD.emoji, multi: SYMBOLS.SWORD.multi };
    if ((counts[SYMBOLS.FISH.emoji]  || 0) + jokerCount >= 3) return { win: true, symbol: SYMBOLS.FISH.emoji, multi: SYMBOLS.FISH.multi };

    return { win: false };
}

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
                btn.setStyle(symbol === '👹' || symbol === '💀' ? ButtonStyle.Danger : ButtonStyle.Primary)
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
    description: '🎟️ اشترِ بطاقة خدش وجرب حظك!',
    aliases: ['كرت', 'بطاقة', 'خدش'],
    category: 'Economy',
    cooldown: 5,

    async execute(message, args) {
        const db = message.client.sql; // استدعاء قاعدة البيانات
        if (!db) return message.reply("⚠️ لا يوجد اتصال بقاعدة البيانات حالياً.");

        const author = message.author;

        // ─── 1. واجهة اختيار البطاقة ──────────────────────────────────────────
        const chooseEmbed = new EmbedBuilder()
            .setTitle('🎟️ متجر بطاقات الخدش הסحرية')
            .setDescription('اختر نوع البطاقة التي تود شراءها.\nكلما زاد السعر، زادت فرصة ظهور (الجوكر 🧚‍♀️) أو الجوائز الضخمة، ولكن احذر من (الميميك 👹)!')
            .setColor(0x9b59b6)
            .setFooter({ text: `مطلوب بواسطة: ${author.username}`, iconURL: author.displayAvatarURL() });

        const chooseRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('buy_bronze').setLabel(TIERS.bronze.label).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('buy_silver').setLabel(TIERS.silver.label).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('buy_gold').setLabel(TIERS.gold.label).setStyle(ButtonStyle.Primary)
        );

        const initialMsg = await message.reply({ embeds: [chooseEmbed], components: [chooseRow] });

        // إنشاء الـ Collector المخصص لصاحب الأمر فقط (لمدة دقيقتين)
        const filter = i => i.user.id === author.id;
        const collector = initialMsg.createMessageComponentCollector({ filter, time: 120000 });

        let gameActive = false;
        let currentTier = null;
        let grid = [];
        let revealed = Array(9).fill(false);

        collector.on('collect', async (i) => {

            // ─── 2. معالجة عملية الشراء ──────────────────────────────────────
            if (i.customId.startsWith('buy_')) {
                const tierId = i.customId.split('_')[1];
                currentTier = TIERS[tierId];

                /* =====================================================
                   ⚠️ منطقة الخصم من قاعدة البيانات ⚠️
                   تأكد من اسم جدول الاقتصاد لديك (هنا استخدمنا levels وعمود balance كمثال)
                   =====================================================
                */
                try {
                    // سحب الرصيد الحالي
                    let userRes;
                    try { userRes = await db.query(`SELECT balance FROM levels WHERE "user" = $1 AND "guild" = $2`, [author.id, message.guild.id]); }
                    catch(e) { userRes = await db.query(`SELECT balance FROM levels WHERE userid = $1 AND guildid = $2`, [author.id, message.guild.id]).catch(()=>({rows:[]})); }
                    
                    const balance = userRes && userRes.rows[0] ? (Number(userRes.rows[0].balance) || 0) : 0;

                    if (balance < currentTier.price) {
                        return i.reply({ content: `❌ رصيدك لا يكفي! تحتاج إلى **${currentTier.price} مورا** لشراء هذه البطاقة.`, ephemeral: true });
                    }

                    // خصم المبلغ
                    try { await db.query(`UPDATE levels SET balance = balance - $1 WHERE "user" = $2 AND "guild" = $3`, [currentTier.price, author.id, message.guild.id]); }
                    catch(e) { await db.query(`UPDATE levels SET balance = balance - $1 WHERE userid = $2 AND guildid = $3`, [currentTier.price, author.id, message.guild.id]).catch(()=>{}); }

                } catch (err) {
                    console.error(err);
                    return i.reply({ content: `⚠️ حدث خطأ أثناء الاتصال بالبنك المركزي.`, ephemeral: true });
                }
                // =====================================================

                gameActive = true;
                grid = generateGrid(tierId);

                const gameEmbed = new EmbedBuilder()
                    .setTitle(currentTier.name)
                    .setDescription(`لقد دفعت **${currentTier.price} مورا** 💸\n\nابحث عن **3 رموز متطابقة** للفوز، الجنية 🧚‍♀️ تحسب كأي رمز!\n**احذر من فخ الميميك 👹!**`)
                    .setColor(currentTier.color);

                await i.update({ embeds: [gameEmbed], components: buildGridComponents(revealed, grid, false) });
            } 
            
            // ─── 3. معالجة أثناء اللعب (الخدش) ───────────────────────────────
            else if (i.customId.startsWith('scratch_') && gameActive) {
                const index = parseInt(i.customId.split('_')[1]);
                revealed[index] = true;

                const revealedSymbols = grid.filter((_, idx) => revealed[idx]);
                let gameOver = false;
                let finalEmbed = new EmbedBuilder().setTitle(currentTier.name).setColor(currentTier.color);

                // أ- فحص فخ الميميك (خسارة فورية)
                if (grid[index] === SYMBOLS.MIMIC.emoji) {
                    gameOver = true;
                    finalEmbed.setDescription(`💥 **كارثــة!** لقد أيقظت الميميك المخفي 👹 وقام بتمزيق بطاقتك!\nخسرت **${currentTier.price} مورا**.`);
                    finalEmbed.setColor(0xE74C3C);
                } 
                else {
                    const winStatus = checkWin(revealedSymbols);
                    
                    // ب- حالة الفوز
                    if (winStatus.win) {
                        gameOver = true;
                        const prize = currentTier.price * winStatus.multi;
                        
                        /* إضافة الجائزة لقاعدة البيانات */
                        if (prize > 0) {
                            try {
                                try { await db.query(`UPDATE levels SET balance = balance + $1 WHERE "user" = $2 AND "guild" = $3`, [prize, author.id, message.guild.id]); }
                                catch(e) { await db.query(`UPDATE levels SET balance = balance + $1 WHERE userid = $2 AND guildid = $3`, [prize, author.id, message.guild.id]).catch(()=>{}); }
                            } catch (err) { console.error(err); }
                        }

                        finalEmbed.setDescription(`🎉 **يا للـحـظ!** لقد جمعت 3 رموز (${winStatus.symbol}).\nلقد فزت بـ **${prize} مورا**! 💰`);
                        finalEmbed.setColor(0x2ECC71);
                    } 
                    // ج- حالة انتهاء المربعات بدون فوز
                    else if (revealedSymbols.length === 9) {
                        gameOver = true;
                        finalEmbed.setDescription(`😢 حظ أوفر.. لم تتمكن من جمع 3 رموز متطابقة.\nخسرت **${currentTier.price} مورا**.`);
                        finalEmbed.setColor(0x95A5A6);
                    }
                    // د- الاستمرار في اللعب
                    else {
                        finalEmbed.setDescription(`استمر في الخدش.. متبقي لك **${9 - revealedSymbols.length}** مربعات.`);
                    }
                }

                // تحديث الواجهة بناءً على حالة اللعبة
                if (gameOver) {
                    gameActive = false;
                    collector.stop('finished');
                    // كشف باقي المربعات مع تعطيلها ليرى اللاعب حظه
                    await i.update({ embeds: [finalEmbed], components: buildGridComponents(Array(9).fill(true), grid, true) });
                } else {
                    await i.update({ embeds: [finalEmbed], components: buildGridComponents(revealed, grid, false) });
                }
            }
        });

        // ─── 4. إنهاء الـ Collector في حال عدم التفاعل ────────────────────────
        collector.on('end', (collected, reason) => {
            if (reason === 'time' && initialMsg) {
                const timeoutEmbed = new EmbedBuilder()
                    .setDescription('⏳ انتهى الوقت المخصص لهذه البطاقة.')
                    .setColor(0x95A5A6);
                initialMsg.edit({ embeds: [timeoutEmbed], components: [] }).catch(() => {});
            }
        });
    }
};
