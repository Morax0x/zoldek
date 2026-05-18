const {
    EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
    ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags,
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
const { updateMarketMessage } = require('./market-ui');

let SEEDS_DATA = [];
let FISHING_DATA = { fishItems: [], rods: [], boats: [], baits: [] };
let POTIONS_DATA = [];

try { SEEDS_DATA = require('../../../json/seeds.json'); } catch(e) {}
try { FISHING_DATA = require('../../../json/fishing-config.json'); } catch(e) {}
try { POTIONS_DATA = require('../../../json/potions.json'); } catch(e) {}

const FALLBACK_NAMES = [
    'سندباد', 'عجيب', 'زعتر', 'كرم', 'درويش', 'مرجان', 'ياقوت', 'عنبر',
    'ميمون', 'زنجبيل', 'بهار', 'عطر', 'سراب', 'غيم', 'حجر', 'سهيل'
];

const JONES_PRICES = new Map();
for (const s of SEEDS_DATA) JONES_PRICES.set(s.id, { buy: s.price, sell: s.sell_price || s.price, name: s.name });
for (const f of (FISHING_DATA.fishItems || [])) JONES_PRICES.set(f.id, { buy: f.price, sell: f.price, name: f.name });
for (const r of (FISHING_DATA.rods || [])) JONES_PRICES.set(r.id, { buy: r.price, sell: Math.floor(r.price * 0.6), name: r.name });
for (const b of (FISHING_DATA.boats || [])) JONES_PRICES.set(b.id, { buy: b.price, sell: Math.floor(b.price * 0.6), name: b.name });
for (const bt of (FISHING_DATA.baits || [])) JONES_PRICES.set(bt.id, { buy: bt.price, sell: Math.floor(bt.price * 0.7), name: bt.name });
for (const p of POTIONS_DATA) JONES_PRICES.set(p.id, { buy: p.price, sell: Math.floor(p.price * 0.8), name: p.name });

const NpcConversations = new Map();
const NpcSpawnIntervals = new Map();

function getJonesPrice(itemId, info) {
    const jonesEntry = JONES_PRICES.get(itemId);
    if (jonesEntry) return jonesEntry.buy;
    if (info?.price) return info.price;
    if (info?.sell_price) return info.sell_price;
    if (info?.rarity) {
        switch (info.rarity.toLowerCase()) {
            case 'common':    return 200;
            case 'uncommon':  return 500;
            case 'rare':      return 1000;
            case 'epic':      return 5000;
            case 'legendary': return 50000;
        }
    }
    return 300;
}

async function callGeminiDirect(apiKey, systemPrompt, messages, jsonMode = false) {
    try {
        let contents = messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
        if (contents.length === 0) contents = [{ role: 'user', parts: [{ text: 'ابدأ' }] }];

        const payload = {
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents,
            generationConfig: { temperature: 0.90, maxOutputTokens: 250 },
        };
        if (jsonMode) payload.generationConfig.responseMimeType = 'application/json';

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!response.ok) return null;
        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
    } catch { return null; }
}

async function callOpenAIDirect(apiKey, systemPrompt, messages, jsonMode = false) {
    try {
        const apiMessages = [{ role: 'system', content: systemPrompt }, ...messages];
        if (messages.length === 0) apiMessages.push({ role: 'user', content: 'ابدأ' });

        const payload = { model: 'gpt-4o-mini', messages: apiMessages, temperature: 0.90, max_tokens: 250 };
        if (jsonMode) payload.response_format = { type: 'json_object' };

        const response = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` }, body: JSON.stringify(payload) });
        if (!response.ok) return null;
        const data = await response.json();
        return data.choices?.[0]?.message?.content?.trim() || null;
    } catch { return null; }
}

async function callAI(systemPrompt, messages, jsonMode = false) {
    const openaiKey = process.env.OPENAI_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;
    if (openaiKey) { const result = await callOpenAIDirect(openaiKey, systemPrompt, messages, jsonMode); if (result) return result; }
    if (geminiKey) { const result = await callGeminiDirect(geminiKey, systemPrompt, messages, jsonMode); if (result) return result; }
    return null;
}

async function generateDynamicCustomer(itemName, askingPrice, jonesPrice, maxAvailableQty) {
    const isCheap = askingPrice <= jonesPrice;

    let npcInitialOffer = askingPrice;
    if (!isCheap) {
        const minBid = Math.floor(jonesPrice * 0.55);
        const maxBid = Math.floor(jonesPrice * 0.90);
        npcInitialOffer = Math.max(minBid, Math.min(maxBid, Math.floor(jonesPrice * (0.6 + Math.random() * 0.3))));
    }

    const requestedQty = Math.max(1, Math.min(Math.floor(Math.random() * Math.min(3, maxAvailableQty)) + 1, 3));

    let generatedName = '';
    let openingLine = '';

    const systemPrompt = `البائع يعرض سلعة باسم "${itemName}" وسعر الحبة الواحدة هو ${askingPrice} مورا
السعر العادل والمعروف في السوق هو ${jonesPrice} مورا.
أنت زبون تتجول في السوق. ابتكر لنفسك اسما (عربي، خيالي، أو من وحي الأسواق القديمة).
افتتح الكلام باقتراح شراء ${requestedQty} حبة.

قواعد صارمة:
1. إذا كان سعر البائع (${askingPrice}) أقل من أو يساوي السعر العادل (${jonesPrice}): وافق فوراً وقل أن السعر ممتاز.
2. إذا كان السعر أعلى: تفاوض واقترح سعراً بين ${npcInitialOffer} و ${jonesPrice}.
3. كن طبيعياً، رد واحد فقط.

أرجع JSON حصراً بالصيغة التالية:
{ "name": "اسمك المبتكر", "openingLine": "جملتك الافتتاحية" }`;

    try {
        const aiResponse = await callAI(systemPrompt, [], true);
        if (aiResponse) {
            const cleanStr = aiResponse.replace(/```json/gi, '').replace(/```/g, '').trim();
            const data = JSON.parse(cleanStr);
            if (data.name) generatedName = data.name;
            if (data.openingLine) openingLine = data.openingLine;
        }
    } catch(e) {}

    if (!generatedName) {
        generatedName = FALLBACK_NAMES[Math.floor(Math.random() * FALLBACK_NAMES.length)];
    }

    if (!openingLine) {
        openingLine = isCheap
            ? `مرحباً! سعر ${itemName} لقطة بـ ${askingPrice}، أعطني ${requestedQty} حبة.`
            : `يا تاجر، ${itemName} غالي جداً عندك. السعر العادل ${jonesPrice}، سأدفع ${npcInitialOffer} للحبة، أريد ${requestedQty}.`;
    }

    return { name: generatedName, openingLine, offer: npcInitialOffer, requestedQty };
}

function parseNpcAction(text) {
    const buyMatch = text.match(/\[BUY_ITEM:\s*(\d+)\s*:\s*(\d+)\s*:\s*(\d+)\s*\]/i);
    if (buyMatch) return { action: 'buy', listingId: parseInt(buyMatch[1]), quantity: parseInt(buyMatch[2]), offeredPrice: parseInt(buyMatch[3]) };
    
    if (/\[LEAVE\]/i.test(text)) return { action: 'leave' };
    
    const offerMatch = text.match(/\[OFFER:\s*(\d+)\s*\]/i);
    if (offerMatch) return { action: 'haggle', newOffer: parseInt(offerMatch[1]) };
    
    return null;
}

async function handleNpcHaggle(client, db, thread, conv, userMessageStr, ownerId) {
    conv.haggleTurns = (conv.haggleTurns || 0) + 1;

    if (conv.haggleTurns >= conv.maxTurns && !userMessageStr.includes('موافق')) {
        return { message: 'يبدو أننا لن نصل لاتفاق، سأحتفظ بمالي. وداعاً!', action: { action: 'leave' } };
    }

    let userOffer = null;
    const offerMatch = userMessageStr.match(/(\d+)/);
    if (offerMatch) {
        userOffer = parseInt(offerMatch[1]);
    }

    const conversationHistory = conv.history.map(e => ({ 
        role: e.role, 
        content: e.role === 'assistant' ? `${conv.name}: ${e.content}` : `البائع: ${e.content}` 
    }));

    let contextNote = '';
    if (userOffer !== null) {
        if (userOffer <= 0) {
            contextNote = '\n⚠️ تنبيه: البائع يعرض سعراً غير منطقي (صفر أو أقل). اغضب وانسحب باستخدام [LEAVE].';
        } else if (userOffer <= conv.currentOffer) {
            contextNote = `\n✅ تنبيه: البائع أعطاك خصماً وقبل بسعر ${userOffer} مورا وهو أقل من أو يساوي عرضك الحالي (${conv.currentOffer}). أنت مشتري ذكي، وافق فوراً واشتر باستخدام [BUY_ITEM:${conv.targetListingId}:${conv.requestedQty}:${userOffer}]. لا ترفع السعر أبداً!`;
        } else if (userOffer <= conv.jonesPrice) {
            contextNote = `\n✅ تنبيه: البائع يطلب ${userOffer} مورا. هذا السعر معقول ومقبول. استخدم [BUY_ITEM:${conv.targetListingId}:${conv.requestedQty}:${userOffer}] للشراء، أو قدم عرضاً أقل إذا أردت بـ [OFFER:سعر].`;
        } else {
            contextNote = `\n❌ تنبيه: البائع يطلب ${userOffer} مورا وهو أعلى من السعر العادل (${conv.jonesPrice}). ارفض السعر واعرض سعراً لا يتجاوز ${conv.jonesPrice} باستخدام [OFFER:سعر]، أو انسحب بـ [LEAVE].`;
        }
    }

    const systemPrompt = `أنت المشتري والزبون واسمك "${conv.name}". تتفاوض لشراء عدد (${conv.requestedQty}) من سلعة "${conv.targetItemName}".
السعر العادل في السوق هو: ${conv.jonesPrice} مورا.
آخر سعر عرضته أنت كان: ${conv.currentOffer} مورا.
${contextNote}

قواعد صارمة لتصرفاتك:
1. أنت تهدف لتقليل السعر قدر الإمكان. إذا وافق البائع على عرضك أو أعطاك خصماً، اقتنص الفرصة واشتر فوراً.
2. للموافقة والشراء استخدم حصراً: [BUY_ITEM:${conv.targetListingId}:${conv.requestedQty}:السعر_النهائي]
3. للمكاسرة وطلب تخفيض استخدم حصراً: [OFFER:سعر_جديد]
4. لرفض جشع البائع والمغادرة استخدم حصراً: [LEAVE]
5. لا توافق أبداً على أي سعر يتجاوز ${conv.jonesPrice}.
6. ردك يجب أن يكون عبارة واحدة طبيعية بلسان زبون شعبي ذكي.`;

    const messages = [...conversationHistory, { role: 'user', content: `البائع: ${userMessageStr}` }];
    const response = await callAI(systemPrompt, messages, false);

    if (!response) return { message: '...', action: null };

    const action = parseNpcAction(response);
    const cleanMessage = response.replace(/\[BUY_ITEM:.*?\]/gi, '').replace(/\[OFFER:.*?\]/gi, '').replace(/\[LEAVE\]/gi, '').trim();

    if (action?.action === 'buy') {
        let finalPrice = action.offeredPrice;
        if (finalPrice > conv.askingPrice) finalPrice = conv.askingPrice;
        if (finalPrice < 1) finalPrice = conv.currentOffer;
        
        if (finalPrice > conv.jonesPrice) {
            return {
                message: `لن أسمح لك باستغلالي، السعر العادل هو ${conv.jonesPrice} فقط. طاب يومك!`,
                action: { action: 'leave' },
            };
        }

        return {
            message: cleanMessage || 'اتفقنا، سأشتري.',
            action: {
                type: 'purchase',
                listingId: conv.targetListingId,
                quantity: conv.requestedQty,
                pricePerUnit: finalPrice,
                buyerId: `npc_${conv.name}`,
                sellerId: ownerId,
                guildId: conv.guildId,
                itemId: conv.targetItemId,
            },
        };
    }

    if (action?.action === 'haggle') {
        if (action.newOffer > conv.jonesPrice) {
            return { message: `هذا مبالغ فيه! لن أدفع أكثر من السعر العادل. وداعاً!`, action: { action: 'leave' } };
        }
    }

    return { message: cleanMessage, action };
}

function generateMarketEmbed(conv) {
    const baseDesc = `✶ **الاسـم:** ${conv.name}\n` +
                     `✶ **العنـصر:** ${conv.targetItemName}\n` +
                     `✶ **السـعـر المعروض:** ${conv.currentOffer} مورا\n` +
                     `✶ **العدد المطلوب:** ${conv.requestedQty}\n\n`;

    const embed = new EmbedBuilder()
        .setColor(conv.color)
        .setTitle('✥ زبـون يقترب من قافلتـك')
        .setDescription(baseDesc + conv.chatLog.join('\n\n'));

    if (conv.imageUrl) embed.setImage(conv.imageUrl);

    return embed;
}

async function processNpcTurn(conv, userMessage, interaction, client, db) {
    conv.history.push({ role: 'user', content: userMessage });
    conv.chatLog.push(`✦ **أنت:** ${userMessage}`);

    await conv.message.edit({ embeds: [generateMarketEmbed(conv)] }).catch(() => {});

    const thread = interaction.channel;
    conv.listings = await getListingsBySession(db, thread.id);

    const result = await handleNpcHaggle(client, db, thread, conv, userMessage, conv.ownerId);

    if (!result) {
        conv.chatLog.push(`✦ **${conv.name}:** ⚠️ *غادر السوق فجأة.*`);
        await conv.message.edit({ embeds: [generateMarketEmbed(conv)], components: [] }).catch(() => {});
        conv.active = false;
        NpcConversations.delete(conv.id);
        return;
    }

    if (result.action && result.action.action === 'haggle') {
        conv.currentOffer = result.action.newOffer;
    }

    conv.history.push({ role: 'assistant', content: result.message });
    conv.chatLog.push(`✦ **${conv.name}:** ${result.message}`);

    const updatedEmbed = generateMarketEmbed(conv);

    if (result.action?.action === 'leave') {
        await conv.message.edit({ embeds: [updatedEmbed], components: [] }).catch(() => {});
        conv.active = false;
        NpcConversations.delete(conv.id);

    } else if (result.action?.type === 'purchase') {
        const a = result.action;
        const purchaseResult = await buyItem(db, a.listingId, a.buyerId, a.sellerId, a.guildId, a.itemId, a.quantity, a.pricePerUnit, 'npc', client);

        if (purchaseResult.ok) {
            const earned = (a.quantity * a.pricePerUnit).toLocaleString();
            updatedEmbed.setFooter({ text: `💰 تم بيع ${a.quantity} من ${conv.targetItemName} بـ ${earned} مورا` });
            await conv.message.edit({ embeds: [updatedEmbed], components: [] }).catch(() => {});

            const freshListings = await getListingsBySession(db, thread.id);
            const session = await getSessionByThread(db, thread.id);
            const dest = caravanConfig.destinations.find(d => d.id === (session?.destinationid || session?.destinationId));
            await updateMarketMessage(thread, freshListings, dest);

            await thread.send({ content: `✅ <@${conv.ownerId}> أتممت صفقة بـ **${earned}** مورا مع ${conv.name}!` }).catch(() => {});
        } else {
            updatedEmbed.setFooter({ text: `❌ فشلت الصفقة.` });
            await conv.message.edit({ embeds: [updatedEmbed], components: [] }).catch(() => {});
        }
        conv.active = false;
        NpcConversations.delete(conv.id);
    } else {
        await conv.message.edit({ embeds: [updatedEmbed] }).catch(() => {});
    }
}

async function spawnNpc(client, db, thread, destId, ownerId, guildId) {
    try {
        const listings = await getListingsBySession(db, thread.id);
        const availableListings = listings.filter(l => (Number(l.quantity) - Number(l.quantitysold || l.quantitySold || 0)) > 0);
        if (availableListings.length === 0) return null;

        await incrementNpcSpawn(db, thread.id);

        const targetListing = availableListings[Math.floor(Math.random() * availableListings.length)];
        const itemInfo = getItemInfo(targetListing.itemid || targetListing.itemID);
        const itemName = itemInfo.name || targetListing.itemid;
        const askingPrice = Number(targetListing.priceperunit || targetListing.pricePerUnit);
        const jonesPrice = getJonesPrice(targetListing.itemid || targetListing.itemID, itemInfo);
        
        const maxQty = Number(targetListing.quantity) - Number(targetListing.quantitysold || targetListing.quantitySold || 0);

        const npcData = await generateDynamicCustomer(itemName, askingPrice, jonesPrice, maxQty);
        const convId = `conv_${thread.id}_${Date.now()}`;
        
        const randomColor = `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`;
        const maxTurns = Math.floor(Math.random() * 3) + 3; 

        const randomImageNumber = Math.floor(Math.random() * 8) + 1;
        const imageUrl = `https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev/images/caravan/cu/customer${randomImageNumber}.png`;

        const chatLog = [`✦ **${npcData.name}:** ${npcData.openingLine}`];
        
        const baseDesc = `✶ **الاسـم:** ${npcData.name}\n` +
                         `✶ **العنـصر:** ${itemName}\n` +
                         `✶ **السـعـر المعروض:** ${npcData.offer} مورا\n` +
                         `✶ **العدد المطلوب:** ${npcData.requestedQty}\n\n`;

        const embed = new EmbedBuilder()
            .setColor(randomColor)
            .setTitle('✥ زبـون يقترب من قافلتـك')
            .setDescription(baseDesc + chatLog[0])
            .setImage(imageUrl); 

        const npcMsg = await thread.send({ content: `<@${ownerId}>`, embeds: [embed] }).catch(() => null);
        if (!npcMsg) return null;

        NpcConversations.set(convId, {
            id: convId, 
            name: npcData.name,
            color: randomColor,
            imageUrl, 
            threadId: thread.id,
            ownerId, guildId, listings,
            targetListingId: targetListing.id,
            targetItemId: targetListing.itemid || targetListing.itemID,
            targetItemName: itemName,
            targetListingQty: targetListing.quantity,
            targetListingSold: targetListing.quantitysold || targetListing.quantitySold || 0,
            requestedQty: npcData.requestedQty,
            askingPrice, jonesPrice,
            currentOffer: npcData.offer,
            haggleTurns: 0, 
            maxTurns, 
            message: npcMsg,
            history: [{ role: 'assistant', content: npcData.openingLine }], 
            chatLog, 
            active: true,
        });

        const negotiateBtn = new ButtonBuilder().setCustomId(`mkt_npc_talk_${convId}`).setLabel('💬 فاوض').setStyle(ButtonStyle.Primary);
        const acceptBtn = new ButtonBuilder().setCustomId(`mkt_npc_accept_${convId}`).setLabel('✅ موافق').setStyle(ButtonStyle.Success);
        const declineBtn = new ButtonBuilder().setCustomId(`mkt_npc_reject_${convId}`).setLabel('❌ طرد').setStyle(ButtonStyle.Danger);

        await npcMsg.edit({ components: [new ActionRowBuilder().addComponents(negotiateBtn, acceptBtn, declineBtn)] }).catch(() => {});

        const collector = npcMsg.createMessageComponentCollector({ filter: i => i.user.id === ownerId, time: 10 * 60 * 1000 });

        collector.on('collect', async i => {
            if (i.customId === `mkt_npc_reject_${convId}`) {
                await i.deferUpdate().catch(() => {});
                const conv = NpcConversations.get(convId);
                const rejectEmbed = new EmbedBuilder().setColor('#E74C3C').setTitle('✥ زبـون يقترب من قافلتـك').setDescription(`**الاسـم:** ${conv.name}\n\n⚠️ تم طرد الزبون من المتجر.`).setImage(conv.imageUrl);
                await npcMsg.edit({ embeds: [rejectEmbed], components: [] }).catch(() => {});
                NpcConversations.delete(convId);
                collector.stop();
                return;
            }

            const conv = NpcConversations.get(convId);
            if (!conv?.active) return i.reply({ content: '❌ لقد غادر هذا المشتري.', flags: [MessageFlags.Ephemeral] }).catch(() => {});

            if (i.customId === `mkt_npc_accept_${convId}`) {
                await i.deferUpdate().catch(() => {});
                let finalPrice = conv.currentOffer;
                if (finalPrice > conv.jonesPrice) finalPrice = conv.jonesPrice;
                if (finalPrice < 1) finalPrice = conv.jonesPrice;

                const purchaseResult = await buyItem(db, conv.targetListingId, `npc_${conv.name}`, ownerId, guildId, conv.targetItemId, conv.requestedQty, finalPrice, 'npc', client);

                const updatedEmbed = generateMarketEmbed(conv);
                if (purchaseResult.ok) {
                    const earned = (conv.requestedQty * finalPrice).toLocaleString();
                    updatedEmbed.setFooter({ text: `💰 تم بيع ${conv.requestedQty} بـ ${earned} مورا` });
                    await conv.message.edit({ embeds: [updatedEmbed], components: [] }).catch(() => {});

                    const freshListings = await getListingsBySession(db, thread.id);
                    const session = await getSessionByThread(db, thread.id);
                    const dest = caravanConfig.destinations.find(d => d.id === (session?.destinationid || session?.destinationId));
                    await updateMarketMessage(thread, freshListings, dest);

                    await thread.send({ content: `✅ <@${conv.ownerId}> أتممت صفقة بـ **${earned}** مورا مع المشتري ${conv.name}!` }).catch(() => {});
                } else {
                    updatedEmbed.setFooter({ text: `❌ فشلت الصفقة.` });
                    await conv.message.edit({ embeds: [updatedEmbed], components: [] }).catch(() => {});
                }
                conv.active = false;
                NpcConversations.delete(conv.id);
                return;
            }

            if (i.customId === `mkt_npc_talk_${convId}`) {
                const modal = new ModalBuilder().setCustomId(`mkt_npc_modal_${convId}`).setTitle(`مكاسرة مع ${conv.name}`);
                const replyInput = new TextInputBuilder().setCustomId('user_reply').setLabel('ردك:').setStyle(TextInputStyle.Short).setMaxLength(200).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(replyInput));
                await i.showModal(modal).catch(() => {});
            }
        });

        collector.on('end', () => {
            const conv = NpcConversations.get(convId);
            if (conv?.active) {
                NpcConversations.delete(convId);
                const timeoutEmbed = new EmbedBuilder().setColor('#78909C').setTitle('✥ زبـون يقترب من قافلتـك').setDescription(`**الاسـم:** ${conv.name}\n\n⚠️ غادر الزبون لتأخرك في الرد.`).setImage(conv.imageUrl);
                npcMsg.edit({ embeds: [timeoutEmbed], components: [] }).catch(() => {});
            }
        });

        return convId;
    } catch (err) { console.error('[spawnNpc Error]', err); return null; }
}

async function handleNpcModalSubmit(interaction, client, db) {
    if (!interaction.customId.startsWith('mkt_npc_modal_')) return false;
    const convId = interaction.customId.replace('mkt_npc_modal_', '');
    const conv = NpcConversations.get(convId);
    if (!conv?.active) {
        await interaction.reply({ content: '❌ المحادثة انتهت أو الزبون غادر.', flags: [MessageFlags.Ephemeral] }).catch(() => {});
        return true;
    }
    await interaction.deferUpdate().catch(() => {});
    const userMessage = interaction.fields.getTextInputValue('user_reply');
    await processNpcTurn(conv, userMessage, interaction, client, db);
    return true;
}

function scheduleNpcSpawn(client, db, thread, dest, ownerId, guildId, marketDurationMs) {
    const destId = dest.id;
    const marketMinutes = marketDurationMs / 60000;
    const totalNpcs = Math.max(2, Math.min(6, Math.floor(marketMinutes / 12)));
    const spawnIntervalMs = Math.max(30000, Math.floor(marketDurationMs / (totalNpcs + 1)));

    let spawned = 0;

    const interval = setInterval(async () => {
        try {
            const session = await getSessionByThread(db, thread.id);
            if (!session || session.status !== 'open') {
                clearInterval(interval);
                return;
            }

            if (spawned >= totalNpcs) {
                clearInterval(interval);
                return;
            }

            let isBusy = false;
            for (const conv of NpcConversations.values()) {
                if (conv.threadId === thread.id && conv.active) {
                    isBusy = true;
                    break;
                }
            }

            if (!isBusy) {
                await spawnNpc(client, db, thread, destId, ownerId, guildId);
                spawned++;
            }
        } catch (err) { console.error('[scheduleNpcSpawn Interval Error]', err); }
    }, spawnIntervalMs);

    NpcSpawnIntervals.set(thread.id, interval);
}

function cleanupNpcConversations() { NpcConversations.clear(); }
setInterval(cleanupNpcConversations, 3600000);

module.exports = {
    spawnNpc, scheduleNpcSpawn, handleNpcHaggle, handleNpcModalSubmit,
    NpcConversations, cleanupNpcConversations, getJonesPrice,
};
