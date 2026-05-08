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

// ============================================================================
// محركات الذكاء الاصطناعي
// ============================================================================
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

// ============================================================================
// توليد الزبون
// ============================================================================
async function generateDynamicCustomer(itemName, askingPrice, jonesPrice, maxAvailableQty) {
    const isCheap = askingPrice <= jonesPrice;
    
    let npcInitialOffer = askingPrice;
    if (!isCheap) {
        npcInitialOffer = Math.floor(jonesPrice * (0.6 + Math.random() * 0.4)); 
    }

    const requestedQty = Math.floor(Math.random() * Math.min(5, maxAvailableQty)) + 1;

    const systemPrompt = `أنت زبون في سوق قوافل لعبة فانتازيا RPG.
البائع يعرض سلعة باسم "${itemName}" وسعر الحبة الواحدة هو ${askingPrice} مورا. 
السعر العادل والمعروف في السوق هو ${jonesPrice} مورا.
أنت تريد شراء (${requestedQty}) حبة. وستفتتح كلامك وتعرض دفع ${npcInitialOffer} مورا للحبة الواحدة.

يجب أن ترجع كائن JSON حصراً:
{
  "name": "ابتكر لنفسك اسماً خيالياً أو لقباً (كلمة أو كلمتين كحد أقصى، كن مبدعاً ولا تعتمد على أسماء شائعة جداً)",
  "openingLine": "الجملة الافتتاحية التي ستخاطب بها البائع، تقترح فيها سعرك (${npcInitialOffer} مورا للحبة) وتذكر أنك تريد ${requestedQty} حبة."
}

قواعد الجملة الافتتاحية:
1. كن طبيعياً جداً، ممنوع مصطلحات البوتات.
2. إذا كان السعر المعروض (${askingPrice}) أقل من أو يساوي السعر المعروف (${jonesPrice}): قل أن السعر ممتاز وستشتري.
3. إذا كان أعلى: صرح بأن السعر مبالغ فيه واقترح سعرك المخفض.
لا تضف أي نص خارج الـ JSON.`;

    try {
        const aiResponse = await callAI(systemPrompt, [], true);
        if (aiResponse) {
            const cleanStr = aiResponse.replace(/```json/gi, '').replace(/```/g, '').trim();
            const data = JSON.parse(cleanStr);
            if (data.name && data.openingLine) {
                return { name: data.name, openingLine: data.openingLine, offer: npcInitialOffer, requestedQty };
            }
        }
    } catch(e) {}
    
    const suggestedPrice = Math.floor(jonesPrice * 0.8);
    return {
        name: 'زبون المجهول',
        offer: npcInitialOffer,
        requestedQty,
        openingLine: isCheap 
            ? `أرى أنك تبيع ${itemName} بـ ${askingPrice}، هذا سعر مناسب! أريد ${requestedQty} لو سمحت.`
            : `أرى أنك تعرض ${itemName} بسعر غالي. السعر العادل هو ${jonesPrice}، سأدفع لك ${suggestedPrice} للحبة وأريد ${requestedQty}.`
    };
}

// ============================================================================
// معالجة التفاوض (تقييم رد اللاعب والمنطق الصحيح للمشتري) 👑
// ============================================================================
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
        return { message: 'لن نصل لاتفاق، سأبحث في مكان آخر. وداعاً!', action: { action: 'leave' } };
    }

    const conversationHistory = conv.history.map(e => ({ role: e.role, content: e.role === 'assistant' ? `${conv.name}: ${e.content}` : `البائع: ${e.content}` }));

    const systemPrompt = `أنت الزبون "${conv.name}". تتفاوض لشراء عدد (${conv.requestedQty}) من "${conv.targetItemName}".
السعر المعروف والعادل في السوق للحبة هو: ${conv.jonesPrice} مورا. 
آخر سعر اقترحته أنت هو: ${conv.currentOffer} مورا للحبة.

قواعدك كمشتري ذكي (صارمة جداً لمنع الغباء الاصطناعي):
1. 🛑 اقرأ رد البائع بعناية لتقييم أسلوبه: تفاعل معه، إذا كان حاداً أو مرناً رد عليه بأسلوب مناسب لشخصيتك.
2. 🛑 لكي تقنعه بالبيع إذا رفض سعرك، يجب أن **ترفع** عرضك قليلاً لتقترب من سعره. من الغباء أن تقوم بخفض سعرك أثناء التفاوض لإقناع بائع!
3. إذا وافق البائع على السعر الذي طرحته، أو طرح سعراً أقل من أو يساوي السعر المعروف، استخدم الكود فوراً لإنهاء الصفقة: [BUY_ITEM:${conv.targetListingId}:${conv.requestedQty}:السعر_المتفق_عليه]
4. إذا لم يوافق، اقترح سعراً جديداً أعلى من السعر الذي اقترحته سابقاً (ولكن لا يتجاوز ${conv.jonesPrice}) باستخدام الكود: [OFFER:سعرك_الجديد]
5. 🛑 لا توافق أبداً على دفع أكثر من ${conv.jonesPrice} مورا للحبة الواحدة!
6. إذا لم تتفقا أو غضبت، انسحب باستخدام: [LEAVE]
7. رد بجملة واحدة فقط طبيعية.`;

    const messages = [...conversationHistory, { role: 'user', content: `البائع: ${userMessageStr}` }];
    const response = await callAI(systemPrompt, messages, false);
    
    if (!response) return { message: '...', action: null };

    const action = parseNpcAction(response);
    const cleanMessage = response.replace(/\[BUY_ITEM:.*?\]/gi, '').replace(/\[OFFER:.*?\]/gi, '').replace(/\[LEAVE\]/gi, '').trim();

    if (action?.action === 'buy') {
        let finalPrice = action.offeredPrice;
        if (finalPrice > conv.askingPrice) finalPrice = conv.askingPrice;

        if (finalPrice > conv.jonesPrice * 1.5) {
            return {
                message: `السعر العادل هو ${conv.jonesPrice} ولن أدفع أكثر. وداعاً!`,
                action: { action: 'leave' },
            };
        }

        return {
            message: cleanMessage || 'تم، سأشتري.',
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

    return { message: cleanMessage, action };
}

// ============================================================================
// واجهة التفاعل 
// ============================================================================
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
            updatedEmbed.setFooter({ text: `❌ فشلت الصفقة: ${purchaseResult.error}` });
            await conv.message.edit({ embeds: [updatedEmbed], components: [] }).catch(() => {});
        }
        conv.active = false;
        NpcConversations.delete(conv.id);
    } else {
        await conv.message.edit({ embeds: [updatedEmbed] }).catch(() => {});
    }
}

// ============================================================================
// جدولة الإنتاج (شخص واحد فقط في كل مرة) 
// ============================================================================
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
        const maxTurns = Math.floor(Math.random() * 3) + 1; // حد الصبر مخفي (1 إلى 3 محاولات)

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

            // 👑 تجاوز الذكاء الاصطناعي وتنفيذ الشراء الفوري عند ضغط (موافق) 👑
            if (i.customId === `mkt_npc_accept_${convId}`) {
                await i.deferUpdate().catch(() => {});
                const finalPrice = conv.currentOffer; // يأخذ آخر سعر معروض من الزبون

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
                    updatedEmbed.setFooter({ text: `❌ فشلت الصفقة: ${purchaseResult.error}` });
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
    const maxNpcs = 5 + Math.floor(Math.random() * 3); 

    const interval = setInterval(async () => {
        try {
            const session = await getSessionByThread(db, thread.id);
            if (!session || session.status !== 'open') {
                clearInterval(interval);
                return;
            }

            const npcSpawnCount = await getNpcSpawnCount(db, thread.id);
            if (npcSpawnCount >= maxNpcs) {
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

            if (!isBusy && Math.random() < 0.60) {
                await spawnNpc(client, db, thread, destId, ownerId, guildId);
            }
        } catch (err) { console.error('[scheduleNpcSpawn Interval Error]', err); }
    }, 15000);

    NpcSpawnIntervals.set(thread.id, interval);
}

function cleanupNpcConversations() { NpcConversations.clear(); }
setInterval(cleanupNpcConversations, 3600000);

module.exports = {
    spawnNpc, scheduleNpcSpawn, handleNpcHaggle, handleNpcModalSubmit,
    NpcConversations, cleanupNpcConversations, getJonesPrice,
};
