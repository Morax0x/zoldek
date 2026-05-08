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

// ============================================================================
// بيانات أسعار جونس (المرجع الرسمي للأسعار)
// ============================================================================
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
// [2] محركات الذكاء الاصطناعي
// ============================================================================
async function callGeminiDirect(apiKey, systemPrompt, messages, jsonMode = false) {
    try {
        let contents = messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
        if (contents.length === 0) contents = [{ role: 'user', parts: [{ text: 'ابدأ' }] }];

        const payload = {
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents,
            generationConfig: { temperature: 0.85, maxOutputTokens: 250 },
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

        const payload = { model: 'gpt-4o-mini', messages: apiMessages, temperature: 0.85, max_tokens: 250 };
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
// [3] توليد الزبون (أسماء عادية وجمل نظيفة من البوتات) 👑
// ============================================================================
async function generateDynamicCustomer(itemName, askingPrice, jonesPrice) {
    const isCheap = askingPrice <= jonesPrice;
    
    let npcInitialOffer = askingPrice;
    if (!isCheap) {
        npcInitialOffer = Math.floor(jonesPrice * (0.6 + Math.random() * 0.4)); 
    }

    const systemPrompt = `أنت زبون في سوق قوافل لعبة فانتازيا RPG.
البائع يعرض سلعة باسم "${itemName}" ووضع لها سعر ${askingPrice} مورا. السعر المعروف والعادل في السوق هو ${jonesPrice} مورا.
أنت ستفتتح كلامك وتعرض دفع ${npcInitialOffer} مورا لشراء السلعة.

يجب أن ترجع كائن JSON حصراً:
{
  "name": "اسمك كزبون (يجب أن يكون كلمة أو كلمتين كحد أقصى، أي اسم عادي أو لقب فانتازيا مثل: جاك، طارق، التاجر، غريب، سام، آرثر، الظل)",
  "openingLine": "الجملة الافتتاحية التي ستخاطب بها البائع، تقترح فيها سعرك (${npcInitialOffer} مورا)."
}

قواعد الجملة الافتتاحية (إجبارية جداً):
1. ممنوع منعاً باتاً استخدام أي مصطلح يظهرك كروبوت (مثل: "كعرض أول"، "بداية"، "كعرض افتتاحي"، "مبدئياً"). كن طبيعياً جداً.
2. إذا كان السعر المعروض (${askingPrice}) أقل من أو يساوي السعر المعروف (${jonesPrice}): قل أن السعر ممتاز ومغري وأنك ستشتريه فوراً.
3. إذا كان السعر المعروض (${askingPrice}) أعلى: صرح بأن السعر مبالغ فيه واقترح سعرك المخفض.
لا تضف أي نص خارج الـ JSON.`;

    try {
        const aiResponse = await callAI(systemPrompt, [], true);
        if (aiResponse) {
            const cleanStr = aiResponse.replace(/```json/gi, '').replace(/```/g, '').trim();
            const data = JSON.parse(cleanStr);
            if (data.name && data.openingLine) {
                return { name: data.name, openingLine: data.openingLine, offer: npcInitialOffer };
            }
        }
    } catch(e) {}
    
    const isCheapFallback = askingPrice <= jonesPrice;
    const suggestedPrice = Math.floor(jonesPrice * 0.8);
    return {
        name: ['جاك', 'آرثر', 'الظل', 'تاجر شرقي', 'سام', 'طارق', 'الغريب'][Math.floor(Math.random() * 7)],
        offer: npcInitialOffer,
        openingLine: isCheapFallback 
            ? `يا بلاش! تبيع ${itemName} بـ ${askingPrice} بس؟ هذي صفقة ما تتفوت، باخذها.`
            : `أرى أنك تعرض ${itemName} بسعر مبالغ فيه.. سعره بالسوق ${jonesPrice}. وش رأيك تبيعني إياه بـ ${suggestedPrice}؟`
    };
}

// ============================================================================
// [4] معالجة التفاوض 
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
    const availableListings = conv.listings.filter(l => (Number(l.quantity) - Number(l.quantitysold || l.quantitySold || 0)) > 0);
    if (availableListings.length === 0) return { message: 'نفذت البضاعة! لا يوجد شيء لأشتريه.', action: { action: 'leave' } };

    conv.haggleTurns = (conv.haggleTurns || 0) + 1;

    // طرد إجباري لو استنفد صبره
    if (conv.haggleTurns >= conv.maxTurns && !userMessageStr.includes('موافق')) {
        return { message: 'لم نصل لاتفاق ولن أضيع وقتي أكثر من هذا. وداعاً!', action: { action: 'leave' } };
    }

    const conversationHistory = conv.history.map(e => ({ role: e.role, content: e.role === 'assistant' ? `${conv.name}: ${e.content}` : `البائع: ${e.content}` }));

    const systemPrompt = `أنت الزبون "${conv.name}". تتفاوض لشراء "${conv.targetItemName}".
السعر المعروف في السوق: ${conv.jonesPrice} مورا. السعر الذي طلبه البائع في البداية: ${conv.askingPrice} مورا.
آخر سعر اقترحته أنت هو: ${conv.currentOffer} مورا.

قواعدك (صارمة جداً لمنع الغباء):
1. 🛑 ممنوع منعاً باتاً استخدام عبارات مثل "كعرض أول"، "بدايةً"، "كعرض أخير".
2. إذا البائع وافق صراحة على سعرك (مثلاً قال "موافق"، "تم"، "مبروك"، "خذها")، انسخ هذا الكود فوراً لإنهاء الصفقة: [BUY_ITEM:${conv.targetListingId}:1:${conv.currentOffer}]
3. إذا رفض البائع وطلب سعراً أعلى من السعر المعروف (${conv.jonesPrice})، ارفض واقترح سعراً أقل أو غادر بكتابة [LEAVE].
4. إذا البائع خفض سعره لسعر مناسب لك، يمكنك كتابة: [BUY_ITEM:${conv.targetListingId}:1:السعر_الجديد]
5. لا توافق أبداً على أي سعر أعلى من ${conv.jonesPrice} مورا!
6. إذا أردت اقتراح سعر جديد، أضف هذا الكود: [OFFER:سعرك_الجديد]
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
                message: `هذا استغلال! السعر العادل هو ${conv.jonesPrice}. وداعاً!`,
                action: { action: 'leave' },
            };
        }

        return {
            message: cleanMessage || 'اتفقنا.',
            action: {
                type: 'purchase',
                listingId: conv.targetListingId,
                quantity: 1,
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
// واجهة التفاعل (إيمبد نظيف وعشوائي اللون + سجل محادثة) 👑
// ============================================================================
function generateMarketEmbed(conv) {
    const baseDesc = `✶ **الاسـم:** ${conv.name}\n` +
                     `✶ **العنـصر:** ${conv.targetItemName}\n` +
                     `✶ **السـعـر المعروض:** ${conv.currentOffer} \n\n`;

    return new EmbedBuilder()
        .setColor(conv.color)
        .setTitle('✥ زبـون يقترب من قافلتـك')
        .setDescription(baseDesc + conv.chatLog.join('\n\n'));
}

async function processNpcTurn(conv, userMessage, interaction, client, db) {
    conv.history.push({ role: 'user', content: userMessage });
    conv.chatLog.push(`✦ **أنت:** ${userMessage}`);

    await conv.message.edit({ embeds: [generateMarketEmbed(conv)] }).catch(() => {});

    const thread = interaction.channel;
    conv.listings = await getListingsBySession(db, thread.id);

    const result = await handleNpcHaggle(client, db, thread, conv, userMessage, conv.ownerId);

    if (!result) {
        conv.chatLog.push(`✦ **${conv.name}:** ⚠️ *نفد صبره وغادر السوق.*`);
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

            await thread.send({ content: `✅ <@${conv.ownerId}> أتممت صفقة بـ **${earned}** مورا مع المشتري ${conv.name}!` }).catch(() => {});
        } else {
            updatedEmbed.setFooter({ text: `❌ فشلت الصفقة: ${purchaseResult.error}` });
            await conv.message.edit({ embeds: [updatedEmbed], components: [] }).catch(() => {});
        }
        conv.active = false;
        NpcConversations.delete(conv.id);
    } else {
        updatedEmbed.setFooter({ text: `استخدم الأزرار للرد أو الموافقة` });
        await conv.message.edit({ embeds: [updatedEmbed] }).catch(() => {});
    }
}

// ============================================================================
// جدولة الإنتاج (شخص واحد فقط في كل مرة) 👑
// ============================================================================
async function spawnNpc(
