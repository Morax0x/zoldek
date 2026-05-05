const {
    EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
    MessageFlags,
} = require('discord.js');
const { safeQuery } = require('../db');
const { caravanConfig, EMOJI_MORA } = require('../config');
const {
    buyItem,
    getListingsBySession,
    getSessionByThread,
    incrementNpcSpawn,
    getNpcSpawnCount,
} = require('./market-db');
const { getItemInfo } = require('./market-setup');
const { buildMarketEmbed, buildMarketComponents } = require('./market-ui');

const NPC_NAMES = [
    'غريب مرموز',
    'تاجر متجول',
    'جامع تحف',
    'سمسار محنك',
    'مغامر ثري',
    'شيخ التجار',
    'والي السوق',
    'فتاة القصر',
    'حكيم القبيلة',
    'قائد الحرس',
];

const NPC_EMOJIS = ['🕴️', '🧙', '💎', '🎭', '⚔️', '🕌', '👑', '🌹', '🧓', '🏛️'];

const DESTINATION_PERSONAS = {
    gold_city: {
        name: 'مدينة الذهب',
        systemPrompt: (
            'أنت تاجر طموع وذكي من مدينة الذهب. ' +
            'أنت تفهم قيمة الأشياء وتسعى دائماً للحصول على أفضل صفقة. ' +
            'استخدم أسلوباً فاخراً لكنه حاد في المفاوضة. ' +
            'تحب الاستعراض بثروتك لكنك بخيل في الدفع. ' +
            'ردك يجب أن يكون قصيراً (جملتين كحد أقصى).'
        ),
    },
    magic_academy: {
        name: 'أكاديمية السحر',
        systemPrompt: (
            'أنت عالم سحر حكيم من أكاديمية السحر. ' +
            'أنت تهتم بالعناصر النادرة والتحف القديمة. ' +
            'تتحدث بأسلوب فلسفي وغامض، وترى القيمة في المعرفة لا في المال. ' +
            'عند المفاوضة، تستخدم حكمتك لتقدير الأشياء بعدالة. ' +
            'ردك يجب أن يكون قصيراً (جملتين كحد أقصى).'
        ),
    },
    imperial_capital: {
        name: 'العاصمة الإمبراطورية',
        systemPrompt: (
            'أنت نبيل إمبراطوري من العاصمة. ' +
            'أنت متكبر لكنك مهذب، وتنظر للتجارة من منظور المكانة الاجتماعية. ' +
            'تفضل العناصر النادرة والفاخرة، وتستخدم لغة رسمية في كلامك. ' +
            'في المفاوضة، أنت حاسم ولا تتردد في إظهار قوة موقفك. ' +
            'ردك يجب أن يكون قصيراً (جملتين كحد أقصى).'
        ),
    },
    ancient_ruins: {
        name: 'الأطلال القديمة',
        systemPrompt: (
            'أنت مغامر قديم عاش في الأطلال والأسرار. ' +
            'أنت غامض ومتوحش بالمعرفة، تعرف قيمة التحف القديمة أكثر من أي شخص. ' +
            'تتحدث بأسلوب قديم ومليئ بالأسرار. ' +
            'في المفاوضة، أنت صبور ولا تتعجل، لكنك قاسٍ في السعر. ' +
            'ردك يجب أن يكون قصيراً (جملتين كحد أقصى).'
        ),
    },
    nature_valley: {
        name: 'وادي الطبيعة',
        systemPrompt: (
            'أنت راعي طبيعة ودود من وادي الطبيعة. ' +
            'أنت طيب القلب وتحب الطبيعة والحيوانات والنباتات. ' +
            'تتحدث بدفء ولطف، وتهتم بالبضائع الطبيعية والبذور. ' +
            'في المفاوضة، أنت عادل ومستعد للوصول إلى حل وسط. ' +
            'ردك يجب أن يكون قصيراً (جملتين كحد أقصى).'
        ),
    },
};

const NpcConversations = new Map();

function getNpcPersona(destId) {
    const persona = DESTINATION_PERSONAS[destId];
    if (!persona) {
        return {
            systemPrompt: (
                'أنت تاجر متجول عام. ' +
                'أنت تحاول شراء بضائع بأفضل سعر ممكن. ' +
                'كن ودوداً لكنك حاد في المفاوضة. ' +
                'ردك يجب أن يكون قصيراً (جملتين كحد أقصى).'
            ),
            name: 'المدينة المجهولة',
        };
    }
    return persona;
}

async function callGeminiDirect(apiKey, systemPrompt, userMessage) {
    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    system_instruction: { parts: [{ text: systemPrompt }] },
                    contents: [{ role: 'user', parts: [{ text: userMessage }] }],
                    generationConfig: { maxOutputTokens: 300, temperature: 0.8 },
                }),
            }
        );

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Gemini API error ${response.status}: ${errText}`);
        }

        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    } catch (err) {
        console.error('[NPC Gemini Error]', err.message);
        return null;
    }
}

async function callOpenAIDirect(apiKey, systemPrompt, userMessage) {
    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userMessage },
                ],
                max_tokens: 300,
                temperature: 0.8,
            }),
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`OpenAI API error ${response.status}: ${errText}`);
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content?.trim() || '';
    } catch (err) {
        console.error('[NPC OpenAI Error]', err.message);
        return null;
    }
}

async function callAI(systemPrompt, userMessage) {
    const geminiKey = process.env.GEMINI_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    if (geminiKey) {
        const result = await callGeminiDirect(geminiKey, systemPrompt, userMessage);
        if (result) return result;
    }

    if (openaiKey) {
        const result = await callOpenAIDirect(openaiKey, systemPrompt, userMessage);
        if (result) return result;
    }

    return null;
}

function parseNpcAction(text) {
    // 👑 تعديل السحر: السماح بالمسافات حتى لو الـ AI أخطأ في تنسيق الكود 👑
    const buyMatch = text.match(/\[BUY_ITEM:\s*(\d+)\s*:\s*(\d+)\s*:\s*(\d+)\s*\]/);
    if (buyMatch) {
        return {
            action: 'buy',
            listingId: parseInt(buyMatch[1]),
            quantity: parseInt(buyMatch[2]),
            offeredPrice: parseInt(buyMatch[3]),
        };
    }

    const acceptMatch = text.match(/\[ACCEPT_OFFER:\s*(\d+)\s*\]/);
    if (acceptMatch) {
        return {
            action: 'accept',
            price: parseInt(acceptMatch[1]),
        };
    }

    return null;
}

function generateNpcOpeningMessage(destId, listings) {
    const persona = getNpcPersona(destId);
    const availableListings = listings.filter(l => {
        const avail = Number(l.quantity) - Number(l.quantitysold || l.quantitySold || 0);
        return avail > 0;
    });

    if (availableListings.length === 0) return null;

    const randomListing = availableListings[Math.floor(Math.random() * availableListings.length)];
    const info = getItemInfo(randomListing.itemid || randomListing.itemID);
    const price = Number(randomListing.priceperunit || randomListing.pricePerUnit);
    const offerPrice = Math.floor(price * (0.5 + Math.random() * 0.3));

    const openings = {
        gold_city: [
            `💰 هاه! ما هذا المعروض الذي أراه؟ **${info.name}** بسعر **${price}** ${EMOJI_MORA}؟ أنا أعرض عليك **${offerPrice}** ${EMOJI_MORA} للواحدة. قبول أم رفض؟`,
            `✨ أرى أنك تبيع **${info.name}**. سلعة جيدة لكن السعر مبالغ فيه. أنا أعطيك **${offerPrice}** ${EMOJI_MORA} كسعر عادل.`,
        ],
        magic_academy: [
            `🔮 النجوم أرتني أن هناك **${info.name}** معروضة... لكن الكون يقول أن سعرها يجب أن يكون **${offerPrice}** ${EMOJI_MORA}. هل تستمع لحكمة النجوم؟`,
            `⚖️ وازنت قيمة **${info.name}** بميزان الحكمة... النتيجة: **${offerPrice}** ${EMOJI_MORA}. هل تقبل بحكم الميزان؟`,
        ],
        imperial_capital: [
            `👑 باسم الإمبراطورية، أرغب في شراء **${info.name}**. السعر المطلوب مبالغ فيه. عرضي النهائي: **${offerPrice}** ${EMOJI_MORA}.`,
            `🏛️ النبلة تتطلب صفقات متوازنة. لقد قمت بتقييم **${info.name}** ووجدت قيمتها الحقيقية **${offerPrice}** ${EMOJI_MORA}.`,
        ],
        ancient_ruins: [
            `🏴 همم... **${info.name}**؟ رأيت مثلها في الأطلال منذ قرون. سعرك عالٍ جداً. أنا أعرض **${offerPrice}** ${EMOJI_MORA} — سعر الزمن.`,
            `🗿 الأطلال علمتني أن كل شيء له ثمنه... وثمن **${info.name}** لديّ هو **${offerPrice}** ${EMOJI_MORA}.`,
        ],
        nature_valley: [
            `🌿 مرحباً يا صديقي! واو، **${info.name}** جميلة! لكن هل يمكننا التفاهم على **${offerPrice}** ${EMOJI_MORA}؟ سوف أعتني بها جيداً!`,
            `🌻 الطبيعة تعلمنا العدالة. أعرض عليك **${offerPrice}** ${EMOJI_MORA} لـ **${info.name}**. هل نتفق؟`,
        ],
    };

    const destOpenings = openings[destId] || openings.gold_city;
    return destOpenings[Math.floor(Math.random() * destOpenings.length)];
}

async function handleNpcHaggle(client, db, thread, npcName, listings, destId, ownerId, conversationHistory) {
    const persona = getNpcPersona(destId);
    const availableListings = listings.filter(l => {
        const avail = Number(l.quantity) - Number(l.quantitysold || l.quantitySold || 0);
        return avail > 0;
    });

    if (availableListings.length === 0) return null;

    const lastExchange = conversationHistory.slice(-2).map(e => e.content).join('\n');

    const listingsContext = availableListings.map(l => {
        const info = getItemInfo(l.itemid || l.itemID);
        const avail = Number(l.quantity) - Number(l.quantitysold || l.quantitySold || 0);
        const price = Number(l.priceperunit || l.pricePerUnit);
        return `- ${info.name} (ID:${l.id}): ${avail} units available, asking ${price} mora each`;
    }).join('\n');

    const userMessage = (
        `Here are the available items:\n${listingsContext}\n\n` +
        `The conversation so far:\n${lastExchange}\n\n` +
        `Respond as the NPC. You can:\n` +
        `1. Make a counter-offer for an item\n` +
        `2. Accept the seller's price and buy: [BUY_ITEM:listingId:quantity:pricePerUnit]\n` +
        `3. Decline and leave politely\n` +
        `Keep your response short (max 2 sentences) and in Arabic.`
    );

    const response = await callAI(persona.systemPrompt, userMessage);
    if (!response) return null;

    const action = parseNpcAction(response);

    if (action?.action === 'buy') {
        const listing = availableListings.find(l => l.id === action.listingId);
        if (!listing) return { message: response, action: null };

        const npcMoraBudget = 50000 + Math.floor(Math.random() * 200000);
        const totalPrice = action.quantity * action.offeredPrice;

        if (totalPrice > npcMoraBudget) {
            return {
                message: response.replace(/\[BUY_ITEM:.*?\]/, '').trim() || (
                    `آسف، معي فقط **${npcMoraBudget.toLocaleString()}** ${EMOJI_MORA}. لا أستطيع الدفع.`
                ),
                action: null,
            };
        }

        const cleanMessage = response.replace(/\[BUY_ITEM:.*?\]/, '').trim();

        return {
            message: cleanMessage || `سآخذ ${action.quantity} وحدة بسعر ${action.offeredPrice.toLocaleString()} للواحدة!`,
            action: {
                type: 'purchase',
                listingId: action.listingId,
                quantity: Math.min(action.quantity, Number(listing.quantity) - Number(listing.quantitysold || listing.quantitySold || 0)),
                pricePerUnit: action.offeredPrice,
                buyerId: 'npc_' + destId,
                sellerId: ownerId,
                guildId: listing.guildid || listing.guildID,
                itemId: listing.itemid || listing.itemID,
            },
        };
    }

    return { message: response, action: null };
}

async function spawnNpc(client, db, thread, destId, ownerId, guildId) {
    try {
        const npcSpawnCount = await getNpcSpawnCount(db, thread.id);
        if (npcSpawnCount >= 2) return;

        const listings = await getListingsBySession(db, thread.id);
        const availableListings = listings.filter(l => {
            const avail = Number(l.quantity) - Number(l.quantitysold || l.quantitySold || 0);
            return avail > 0;
        });

        if (availableListings.length === 0) return;

        await incrementNpcSpawn(db, thread.id);

        const npcNameIdx = Math.floor(Math.random() * NPC_NAMES.length);
        const npcName = NPC_NAMES[npcNameIdx];
        const npcEmoji = NPC_EMOJIS[npcNameIdx];

        const openingMessage = generateNpcOpeningMessage(destId, availableListings);
        if (!openingMessage) return;

        const npcMsg = await thread.send({
            embeds: [new EmbedBuilder()
                .setColor('#FF69B4')
                .setTitle(`${npcEmoji} ${npcName} — زائر جديد!`)
                .setDescription(openingMessage)
                .addFields({
                    name: '🤔 كيف تتفاعل؟',
                    value: (
                        `• اضغط **فاوض** للمفاوضة معه\n` +
                        `• اضغط **قبول العرض** للموافقة على سعره\n` +
                        `• اضغط **رفض** لطرده من السوق`
                    ),
                    inline: false,
                })
                .setFooter({ text: 'المفاوضة مع الذكاء الاصطناعي 🤖' })]
        }).catch(() => null);

        if (!npcMsg) return;

        const convKey = `npc_conv_${thread.id}_${npcNameIdx}`;
        NpcConversations.set(convKey, {
            npcName,
            npcEmoji,
            destId,
            ownerId,
            guildId,
            listings,
            message: npcMsg,
            history: [],
            active: true,
        });

        const negotiateBtn = new ButtonBuilder()
            .setCustomId(`mkt_npc_negotiate_${npcNameIdx}`)
            .setLabel('🤔 فاوض')
            .setStyle(ButtonStyle.Primary);

        const acceptBtn = new ButtonBuilder()
            .setCustomId(`mkt_npc_accept_${npcNameIdx}`)
            .setLabel('✅ قبول العرض')
            .setStyle(ButtonStyle.Success);

        const declineBtn = new ButtonBuilder()
            .setCustomId(`mkt_npc_decline_${npcNameIdx}`)
            .setLabel('❌ رفض')
            .setStyle(ButtonStyle.Danger);

        await npcMsg.edit({
            components: [
                new ActionRowBuilder().addComponents(negotiateBtn, acceptBtn, declineBtn)
            ]
        }).catch(() => {});

        const collector = npcMsg.createMessageComponentCollector({
            filter: i => i.user.id === ownerId,
            time: 5 * 60 * 1000,
            max: 3,
        });

        collector.on('collect', async i => {
            if (i.customId === `mkt_npc_negotiate_${npcNameIdx}`) {
                await i.deferUpdate().catch(() => {});

                const conv = NpcConversations.get(convKey);
                if (!conv || !conv.active) return;

                const updatedListings = await getListingsBySession(db, thread.id);
                const result = await handleNpcHaggle(
                    client, db, thread, npcName, updatedListings, destId, ownerId, conv.history
                );

                if (!result) {
                    await thread.send({
                        content: `${npcEmoji} التاجر غامض... لم يتمكن من الرد.`,
                    }).catch(() => {});
                    collector.stop();
                    return;
                }

                conv.history.push(
                    { role: 'assistant', content: result.message },
                    { role: 'user', content: 'البائع يطلب المزيد من المفاوضة.' }
                );

                await thread.send({
                    embeds: [new EmbedBuilder()
                        .setColor('#FF69B4')
                        .setDescription(`${npcEmoji} **${npcName}:** ${result.message}`)]
                }).catch(() => {});

                if (result.action?.type === 'purchase') {
                    const a = result.action;
                    const purchaseResult = await buyItem(
                        db, a.listingId, a.buyerId, a.sellerId, a.guildId,
                        a.itemId, a.quantity, a.pricePerUnit, 'npc'
                    );

                    if (purchaseResult.ok) {
                        const itemInfo = getItemInfo(a.itemId);
                        await thread.send({
                            embeds: [new EmbedBuilder()
                                .setColor('#00FF88')
                                .setTitle(`🎉 صفقة ناجحة!`)
                                .setDescription(
                                    `${npcEmoji} **${npcName}** اشترى **${a.quantity}x ${itemInfo.name}**\n` +
                                    `السعر: **${(a.quantity * a.pricePerUnit).toLocaleString()}** ${EMOJI_MORA}\n` +
                                    `أضيف المبلغ إلى رصيد <@${ownerId}>`
                                )]
                        }).catch(() => {});

                        const freshListings = await getListingsBySession(db, thread.id);
                        const session = await getSessionByThread(db, thread.id);
                        const dest = caravanConfig.destinations.find(d =>
                            d.id === (session?.destinationid || session?.destinationId)
                        );

                        await thread.send({
                            embeds: [await buildMarketEmbed(freshListings, dest)],
                            components: buildMarketComponents(freshListings),
                        }).catch(() => {});
                    }
                }

            } else if (i.customId === `mkt_npc_accept_${npcNameIdx}`) {
                await i.deferUpdate().catch(() => {});

                const conv = NpcConversations.get(convKey);
                if (!conv || !conv.active) return;

                const updatedListings = await getListingsBySession(db, thread.id);
                const randomListing = updatedListings.filter(l => {
                    const avail = Number(l.quantity) - Number(l.quantitysold || l.quantitySold || 0);
                    return avail > 0;
                })[0];

                if (!randomListing) {
                    await thread.send(`${npcEmoji} لا توجد بضائع متاحة!`).catch(() => {});
                    collector.stop();
                    return;
                }

                const price = Number(randomListing.priceperunit || randomListing.pricePerUnit);
                const available = Number(randomListing.quantity) - Number(randomListing.quantitysold || randomListing.quantitySold || 0);
                const buyQty = Math.min(1 + Math.floor(Math.random() * 2), available);

                const purchaseResult = await buyItem(
                    db,
                    randomListing.id,
                    'npc_' + destId,
                    ownerId,
                    guildId,
                    randomListing.itemid || randomListing.itemID,
                    buyQty,
                    price,
                    'npc'
                );

                if (purchaseResult.ok) {
                    const itemInfo = getItemInfo(randomListing.itemid || randomListing.itemID);
                    await thread.send({
                        embeds: [new EmbedBuilder()
                            .setColor('#00FF88')
                            .setTitle(`🎉 قبلت العرض! صفقة ناجحة!`)
                            .setDescription(
                                `${npcEmoji} **${npcName}:** ممتاز! سعيد بالتعامل معك.\n\n` +
                                `اشتريت **${buyQty}x ${itemInfo.name}** بسعر **${price.toLocaleString()}** ${EMOJI_MORA}/واحدة\n` +
                                `الإجمالي: **${(buyQty * price).toLocaleString()}** ${EMOJI_MORA}`
                            )]
                    }).catch(() => {});

                    const freshListings = await getListingsBySession(db, thread.id);
                    const session = await getSessionByThread(db, thread.id);
                    const dest = caravanConfig.destinations.find(d =>
                        d.id === (session?.destinationid || session?.destinationId)
                    );

                    await thread.send({
                        embeds: [await buildMarketEmbed(freshListings, dest)],
                        components: buildMarketComponents(freshListings),
                    }).catch(() => {});
                }

                conv.active = false;
                collector.stop();

            } else if (i.customId === `mkt_npc_decline_${npcNameIdx}`) {
                await i.deferUpdate().catch(() => {});

                const farewells = [
                    `${npcEmoji} **${npcName}:** حسناً... سأبحث عن بضائع أفضل. مع السلامة!`,
                    `${npcEmoji} **${npcName}:** لا مشكلة. السوق كبير والفرص كثيرة. إلى اللقاء!`,
                    `${npcEmoji} **${npcName}:** أنت تخسر صفقة رائعة! لكن لا بأس... مع السلامة.`,
                ];

                await thread.send({
                    content: farewells[Math.floor(Math.random() * farewells.length)],
                }).catch(() => {});

                const conv = NpcConversations.get(convKey);
                if (conv) conv.active = false;
                collector.stop();
            }
        });

        collector.on('end', async () => {
            await npcMsg.edit({ components: [] }).catch(() => {});
            NpcConversations.delete(convKey);
        });

    } catch (err) {
        console.error('[spawnNpc]', err);
    }
}

function scheduleNpcSpawn(client, db, thread, dest, ownerId, guildId, marketDurationMs) {
    const destId = dest.id;

    const npcCount = 1 + Math.floor(Math.random() * 2);

    for (let i = 0; i < npcCount; i++) {
        const minDelay = marketDurationMs * 0.1;
        const maxDelay = marketDurationMs * 0.85;
        const delay = minDelay + Math.random() * (maxDelay - minDelay);

        setTimeout(async () => {
            const session = await getSessionByThread(db, thread.id);
            if (!session || session.status !== 'open') return;

            await spawnNpc(client, db, thread, destId, ownerId, guildId);
        }, delay);
    }
}

function cleanupNpcConversations() {
    NpcConversations.clear();
}

setInterval(cleanupNpcConversations, 3600000);

module.exports = {
    spawnNpc,
    scheduleNpcSpawn,
    handleNpcHaggle,
    getNpcPersona,
    parseNpcAction,
    NpcConversations,
    DESTINATION_PERSONAS,
    cleanupNpcConversations,
};
