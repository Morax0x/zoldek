const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, StringSelectMenuBuilder, ButtonStyle, ComponentType, Colors } = require('discord.js');
const { EMOJI_MORA } = require('./constants');

const QUOTES = [
    "«المورا تشتري السلاح… وما أملكه يشتري نجاتك.»",
    "«قد تمشي حيًّا بلا صفقة… لكنك لن تعود.»",
    "«ما أقدّمه ليس رحمة… بل فرصة أخيرة.»",
    "«الدانجون لا يرحم… وأنا لا أبيع إلا لمن يجرؤ.»",
    "«سلاحٌ واحد مني… قد يختصر عمرك أو يطيله.»",
    "«الكنوز تُغريك… أما بضاعتي فتنقذك.»",
    "«من دوني أنت شجاع… ومعي أنت حي.»",
    "«الظلام يساومك بالموت… وأنا أساومك بالمورا.»",
    "«ليس كل من اشترى نجا… لكن كل ناجٍ اشترى.»",
    "«إن كنت تبحث عن الأمل… فهو ليس مجانيًا.»",
    "«الموت مجاني… أما النجاة فلها ثمن.»",
    "«ادخل الدانجون بثقة… واخرج إن دفعت.»",
    "«عناصري لا تلمع… لكنها تبقيك حيًّا.»",
    "«الجبن يقتلك أسرع من الوحوش.»",
    "«الصفقة الآن… أو العظام لاحقًا.»",
    "«الكنز ينتظر الشجعان… وأنا أنتظر المورا.»",
    "«الخطوة الخاطئة تكلف روحك… إلا إن اشتريت.»",
    "«ليست بضاعة… إنها فرصة للعودة.»",
    "«الوحوش لا تفاوض… أنا أفعل.»"
];

const SHOP_ITEMS = [
    { id: 'buy_elixir', name: 'إكسيـر الحيـاة', price: 1800, desc: 'يعيد إحياءك بـ 100% HP (أو يعالجك بالكامل).', emoji: '🩸' },
    { id: 'buy_blood', name: 'عقـد الـدم', price: 1500, desc: 'خصم 50% من صحتك القصوى مقابل +60% هجوم دائم.', emoji: '📜' },
    { id: 'buy_map', name: 'خريطـة مختصـرة', price: 800, desc: 'تخطي 3 طوابق فوراً (حد أقصى 3 مرات بالغارة).', emoji: '🗺️' },
    { id: 'buy_shield', name: 'درع المرتزقـة', price: 2000, desc: 'يمنحك درعاً بـ 2500 نقطة يستمر حتى ينكسر أو لمدة 5 طوابق (مرة واحدة فقط).', emoji: '🛡️' },
    { id: 'buy_eye', name: 'عين البصيـرة', price: 800, desc: 'كشف نقطة ضعف وحش الطابق القادم (ضرر +50%).', emoji: '👁️' },
    { id: 'buy_instant_elder', name: 'شراب العمالقة العتيق', price: 1333, desc: 'تأثير فوري: يضاعف الصحة لمدة 8 طوابق!', emoji: '🍷' },
    { id: 'buy_instant_assassin', name: 'سم التخفي', price: 500, desc: 'تأثير فوري: يجعلك خفياً لـ 3 جولات قادمة.', emoji: '🌫️' }
];

function triggerMysteryMerchant(thread, players, db, guildId, merchantState) {
    return new Promise(async (resolve) => {
        const randomQuote = QUOTES[Math.floor(Math.random() * QUOTES.length)];
        let attackers = new Set();

        const embed = new EmbedBuilder()
            .setTitle('★ التـاجـر المتجـول ظهـر !')
            .setDescription(`> **"${randomQuote}"**\n\nيَعرض بضائع نادرة بأسعار سوق سوداء.. هل تجرؤ على الشراء؟\n\n⏳ **يغادر بعد 45 ثانية...**`)
            .setImage('https://i.postimg.cc/DypZtNmr/00000.png')
            .setColor(Colors.Grey);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('merchant_view')
                .setLabel('القـاء نظـرة')
                .setEmoji('🛒')
                .setStyle(ButtonStyle.Secondary),
            
            new ButtonBuilder()
                .setCustomId('merchant_attack')
                .setLabel('اضـربــه')
                .setEmoji('⚔️')
                .setStyle(ButtonStyle.Danger)
        );

        const msg = await thread.send({ embeds: [embed], components: [row] });

        const buttonCollector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 45000 });

        buttonCollector.on('collect', async (i) => {
            const player = players.find(p => p.id === i.user.id);
            if (!player) return i.reply({ content: '🚫 أنت لست في الفريق.', ephemeral: true });

            if (i.customId === 'merchant_attack') {
                if (player.isDead) return i.reply({ content: '💀 الموتى لا يمكنهم القتال!', ephemeral: true });

                if (attackers.has(i.user.id)) {
                    return i.reply({ content: '😤 لقد ضربته بالفعل! انتظر بقية الفريق.', ephemeral: true });
                }

                attackers.add(i.user.id);
                const alivePlayersCount = players.filter(p => !p.isDead).length;
                const neededVotes = alivePlayersCount > 0 ? alivePlayersCount : 1;

                if (attackers.size >= neededVotes) {
                    await i.update({ content: `👊 **(${attackers.size}/${neededVotes}) ضرب مبـرح!** فرّ التاجر مذعوراً وتناثرت بضاعته...`, components: [] });
                    buttonCollector.stop('attacked');
                } else {
                    await i.reply({ content: `⚔️ **${player.name}** ضرب التاجر! (${attackers.size}/${neededVotes} للطرد)`, ephemeral: false }); 
                }
                return;
            }

            if (!i.deferred && !i.replied) await i.deferUpdate().catch(() => {});

            // 🔥 التعديل هنا: جلب الرصيد بالاسم الصحيح للعمود ("user" و "guild")
            let currentMora = 0;
            try {
                const userBalanceRes = await db.query(`SELECT "mora" FROM levels WHERE "user" = $1 AND "guild" = $2`, [i.user.id, guildId]);
                currentMora = userBalanceRes.rows[0] ? parseInt(userBalanceRes.rows[0].mora) : 0;
            } catch(e) {
                // محاولة احتياطية إذا فشل الأول
                const userBalanceRes2 = await db.query(`SELECT mora FROM levels WHERE userid = $1 AND guildid = $2`, [i.user.id, guildId]).catch(()=>({rows:[]}));
                currentMora = userBalanceRes2.rows[0] ? parseInt(userBalanceRes2.rows[0].mora) : 0;
            }

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('merchant_select')
                .setPlaceholder('اختر سلعة للشراء...')
                .addOptions(
                    SHOP_ITEMS.map(item => ({
                        label: item.name,
                        description: `${item.desc} | السعر: ${item.price}`,
                        value: item.id,
                        emoji: item.emoji
                    }))
                );

            const selectRow = new ActionRowBuilder().addComponents(selectMenu);

            const reply = await i.followUp({ 
                content: `💰 **رصيدك الحالي:** ${currentMora.toLocaleString()} ${EMOJI_MORA}\nاختر ما تريد شراءه بعناية:`, 
                components: [selectRow], 
                ephemeral: true,
                fetchReply: true 
            });

            const selectCollector = reply.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 30000 });

            selectCollector.on('collect', async (si) => {
                const selectedId = si.values[0];
                const item = SHOP_ITEMS.find(it => it.id === selectedId);

                if (selectedId === 'buy_map') {
                    if (merchantState.skipFloors > 0) {
                        return si.reply({ content: `🚫 **هناك خريطة مفعلة بالفعل! لا يمكن تكديس الخرائط.**`, ephemeral: true });
                    }

                    merchantState.mapBuyCount = merchantState.mapBuyCount || 0;
                    if (merchantState.mapBuyCount >= 3) {
                        return si.reply({ content: `🚫 **لقد وصلتم للحد الأقصى (3 مرات) لشراء الخريطة في هذه الغارة!**`, ephemeral: true });
                    }
                }

                if (selectedId === 'buy_shield') {
                    if (player.hasBoughtMercenaryShield) {
                        return si.reply({ content: `🚫 **لا يمكنك شراء درع المرتزقة أكثر من مرة واحدة في هذه الغارة!**`, ephemeral: true });
                    }
                }

                // 🔥 التعديل هنا أيضاً: جلب وتحديث الرصيد بالاسم الصحيح للعمود
                let actualMora = 0;
                try {
                    const freshBalanceRes = await db.query(`SELECT "mora" FROM levels WHERE "user" = $1 AND "guild" = $2`, [si.user.id, guildId]);
                    actualMora = freshBalanceRes.rows[0] ? parseInt(freshBalanceRes.rows[0].mora) : 0;
                } catch (e) {
                    const freshBalanceRes2 = await db.query(`SELECT mora FROM levels WHERE userid = $1 AND guildid = $2`, [si.user.id, guildId]).catch(()=>({rows:[]}));
                    actualMora = freshBalanceRes2.rows[0] ? parseInt(freshBalanceRes2.rows[0].mora) : 0;
                }

                if (actualMora < item.price) {
                    return si.reply({ content: `❌ **لا تملك مورا كافية!** تحتاج ${item.price} مورا.`, ephemeral: true });
                }

                // ✅ GREATEST لمنع الرصيد السالب + RETURNING لتحديث الكاش فوراً
                try {
                    const deductRes = await db.query(`UPDATE levels SET "mora" = GREATEST(0, "mora" - $1) WHERE "user" = $2 AND "guild" = $3 RETURNING "mora"`, [item.price, si.user.id, guildId]);
                    if (si.client?.updateLevelField && deductRes.rows[0]) si.client.updateLevelField(si.user.id, guildId, { mora: Number(deductRes.rows[0].mora) });
                } catch(e) {
                    await db.query(`UPDATE levels SET mora = GREATEST(0, mora - $1) WHERE userid = $2 AND guildid = $3`, [item.price, si.user.id, guildId]).catch(()=>{});
                }

                let effectMsg = "";

                if (selectedId === 'buy_elixir') {
                    if (!player.isDead) { player.hp = player.maxHp; effectMsg = "شرب إكسير الحياة وشعر بقوة الخلود (100% HP)!"; } 
                    else { player.isDead = false; player.isPermDead = false; player.hp = player.maxHp; player.reviveCount = 0; effectMsg = "عاد من الموت بكامل قوته بفضل إكسير الحياة!"; }
                } 
                else if (selectedId === 'buy_blood') {
                    player.maxHp = Math.floor(player.maxHp * 0.5); 
                    if (player.hp > player.maxHp) player.hp = player.maxHp;
                    player.effects.push({ type: 'atk_buff', val: 0.6, turns: 999 }); 
                    effectMsg = "وقّع عقد الدم! (انخفضت الصحة للنصف، وزاد هجومه 60% لنهاية الرحلة)";
                }
                else if (selectedId === 'buy_shield') {
                    player.shield = (player.shield || 0) + 2500;
                    player.startingShield = 2500; 
                    player.shieldPersistent = true; 
                    player.shieldFloorsCount = 0; 
                    player.hasBoughtMercenaryShield = true; 
                    effectMsg = "تجهز بدرع المرتزقة الصلب! (2500 درع يستمر حتى ينكسر أو لمدة 5 طوابق)";
                }
                else if (selectedId === 'buy_map') {
                    merchantState.skipFloors += 3;
                    merchantState.mapBuyCount = (merchantState.mapBuyCount || 0) + 1;
                    effectMsg = `اشترى خريطة سرية! سيتم تخطي 3 طوابق قادمة. (استخدام ${merchantState.mapBuyCount}/3)`;
                }
                else if (selectedId === 'buy_eye') {
                    merchantState.weaknessActive = true;
                    effectMsg = "حصل على عين البصيرة! وحش الطابق القادم سيتلقى 50% ضرر إضافي.";
                }
                else if (selectedId === 'buy_instant_elder') {
                    player.maxHp *= 2; 
                    player.hp = player.maxHp;
                    player.effects.push({ type: 'titan', floors: 8, turns: 99 }); 
                    effectMsg = "تجرع شراب العمالقة العتيق! تضاعفت صحته لمدة 8 طوابق!";
                }
                else if (selectedId === 'buy_instant_assassin') {
                    player.effects.push({ type: 'evasion', turns: 3 }); 
                    effectMsg = "شرب سم التخفي! اختفى عن الأنظار لمدة 3 جولات.";
                }

                await si.update({ content: `✅ **تم الشراء بنجاح!** خصم ${item.price} مورا.\nالمتبقي: ${(actualMora - item.price).toLocaleString()}`, components: [] });
                await thread.send(`🤝 **أبـرم ${player.name} صفـقـة رابحة مع التاجر واشتـرى ${item.name} مقابل ${item.price} ${EMOJI_MORA}**\n*${effectMsg}*`);
            });
        });

        buttonCollector.on('end', async (collected, reason) => {
            const disabledRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('merchant_view').setLabel('القـاء نظـرة').setEmoji('🛒').setStyle(ButtonStyle.Secondary).setDisabled(true),
                new ButtonBuilder().setCustomId('merchant_attack').setLabel('اضـربــه').setEmoji('⚔️').setStyle(ButtonStyle.Danger).setDisabled(true)
            );
            await msg.edit({ components: [disabledRow] }).catch(() => {});
            
            if (reason !== 'attacked') {
                await thread.send("🌑 **اختفى التاجر في الظلال كما ظهر...**");
            }
            
            resolve();
        });
    });
}

module.exports = { triggerMysteryMerchant };
