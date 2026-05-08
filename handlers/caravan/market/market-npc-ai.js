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
        if (contents.length === 0) contents = [{ role: 'user', parts: [{ text: 'ابدأ الإنشاء' }] }];

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
        if (messages.length === 0) apiMessages.push({ role: 'user', content: 'ابدأ الإنشاء' });

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
// [3] توليد بيانات الزبون (الاسم النظيف والجملة الافتتاحية الذكية) 👑
// ============================================================================
async function generateDynamicCustomer(itemName, askingPrice, jonesPrice) {
    const systemPrompt = `أنت زبون في سوق تجاري.
البائع يعرض سلعة باسم "${itemName}" ووضع لها سعر ${askingPrice} مورا.
أنت كزبون تعرف أن سعرها المعتاد في السوق هو ${jonesPrice} مورا.

يجب أن ترجع كائن JSON حصراً بالصيغة التالية:
{
  "name": "اسمك كزبون (يجب أن يكون كلمة أو كلمتين كحد أقصى، أي اسم عادي مثل: جاك، طارق، التاجر، غريب، سام)",
  "openingLine": "الجملة الافتتاحية التي ستقولها للبائع"
}

قواعد الجملة الافتتاحية (إجبارية جداً لتبدو كشخص ذكي):
1. إذا كان السعر المعروض (${askingPrice}) **أقل من أو يساوي** السعر المعروف (${jonesPrice}): قل جملة تفيد أن السعر ممتاز ومغري وأنك ستشتريه فوراً بهذا السعر لتوفير المال. (لا تعرض سعراً أعلى من سعره أبداً).
2. إذا كان السعر المعروض (${askingPrice}) **أعلى** من السعر المعروف (${jonesPrice}): قل جملة مشابهة لهذه: "مرحباً أيها الرحال، أرى أنك قد حططت في سوقنا، لفت انتباهي ${itemName} ولكن أرى أن سعره المعروف هو ${jonesPrice}، ما رأيك أن تبيعني إياه بهذا السعر؟"
لا تضف أي نص خارج الـ JSON.`;

    try {
        const aiResponse = await callAI(systemPrompt, [], true);
        if (aiResponse) {
            const cleanStr = aiResponse.replace(/```json/gi, '').replace(/```/g, '').trim();
            const data = JSON.parse(cleanStr);
            if (data.name && data.openingLine) {
                return { name: data.name, openingLine: data.openingLine };
            }
        }
    } catch(e) {}
    
    // الفولباك الذكي لو تعطل الذكاء الاصطناعي
    const isCheap = askingPrice <= jonesPrice;
    return {
        name: 'زبون عابر',
        openingLine: isCheap 
            ? `مرحباً، أرى أنك تبيع ${itemName} بسعر ممتاز (${askingPrice} مورا). صفقة رابحة لي، أريد شراءه!`
            : `مرحباً أيها الرحال، لفت انتباهي ${itemName} ولكن سعره المعروف هو ${jonesPrice} مورا. ما رأيك أن تبيعني إياه بهذا السعر؟`
    };
}

// ============================================================================
// [4] معالجة التفاوض والشراء (الزبون الذكي مستحيل ينضحك عليه) 👑
// ============================================================================
function parseNpcAction(text) {
    const buyMatch = text.match(/\[BUY_ITEM:\s*(\d+)\s*:\s*(\d+)\s*:\s*(\d+)\s*\]/i);
    if (buyMatch) return { action: 'buy', listingId: parseInt(buyMatch[1]), quantity: parseInt(buyMatch[2]), offeredPrice: parseInt(buyMatch[3]) };
    if (/\[LEAVE\]/i.test(text)) return { action: 'leave' };
    return null;
}

async function handleNpcHaggle(client, db, thread, conv, userMessageStr, ownerId) {
    const availableListings = conv.listings.filter(l => (Number(l.quantity) - Number(l.quantitysold || l.quantitySold || 0)) > 0);
    if (availableListings.length === 0) return { message: 'نفذت البضاعة! لا يوجد شيء لأشتريه.', action: { action: 'leave' } };

    const conversationHistory = conv.history.map(e => ({ role: e.role, content: e.role === 'assistant' ? `${conv.name}: ${e.content}` : `البائع: ${e.content}` }));

    const systemPrompt = `أنت الزبون "${conv.name}".
أنت ترغب بشراء "${conv.targetItemName}".
السعر المعروف للسوق هو ${conv.jonesPrice} مورا. والبائع يعرضه حالياً بسعر ${conv.askingPrice} مورا.

قواعدك (مهمة جداً لكي لا يتم النصب عليك):
1. كن ذكياً ووفر مالك! لا تقم بتاتاً بعرض سعر أعلى من السعر الذي عرضه البائع.
2. إذا كان السعر المعروض (${conv.askingPrice}) أو السعر الذي اقترحه البائع الآن أقل من أو يساوي السعر المعروف (${conv.jonesPrice})، وافق فوراً ولا ترفع السعر!
3. إذا طلب البائع أكثر من السعر المعروف، فاوض بحزم لإنزاله، أو غادر.
4. رد بجملة واحدة فقط.
5. للاتفاق، أضف نصياً: [BUY_ITEM:${conv.targetListingId}:الكمية_المطلوبة:السعر_المتفق_عليه]
6. للرفض والمغادرة، أضف نصياً: [LEAVE]`;

    const messages = [...conversationHistory, { role: 'user', content: `البائع: ${userMessageStr}` }];
    const response = await callAI(systemPrompt, messages, false);
    
    if (!response) return { message: '...', action: null };

    const action = parseNpcAction(response);
    const cleanMessage = response.replace(/\[BUY_ITEM:.*?\]/gi, '').replace(/\[LEAVE\]/gi, '').trim();

    if (action?.action === 'buy') {
        let finalPrice = action.offeredPrice;

        // 👑 حماية برمجية قسوى: الزبون مستحيل يدفع أكثر من السعر اللي طالبه اللاعب 👑
        if (finalPrice > conv.askingPrice) {
            finalPrice = conv.askingPrice;
        }

        // حماية برمجية: مستحيل يدفع سعر خيالي يتجاوز السوق بكثير
        if (finalPrice > conv.jonesPrice * 1.5) {
            return {
                message: `هل تمازحني؟ لن أدفع هذا السعر! السعر العادل هو ${conv.jonesPrice}. وداعاً!`,
                action: { action: 'leave' },
            };
        }

        const maxQty = Number(conv.targetListingQty) - Number(conv.targetListingSold);
        const qtyToBuy = Math.min(action.quantity, maxQty);

        return {
            message: cleanMessage || 'اتفقنا.',
            action: {
                type: 'purchase',
                listingId: conv.targetListingId,
                quantity: qtyToBuy,
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
// [5] واجهة التفاعل (UI/UX)
// ============================================================================
async function processNpcTurn(conv, userMessage, interaction, client, db) {
    conv.history.push({ role: 'user', content: userMessage });

    const thinkingEmbed = new EmbedBuilder()
        .setColor('#2B2D31')
        .setDescription(`**اسم الزبون:** ${conv.name}\n\n🗣️ **أنت:**\n> ${userMessage}\n\n*يفكر في ردك...*`);

    await conv.message.edit({ embeds: [thinkingEmbed] }).catch(() => {});

    const thread = interaction.channel;
    conv.listings = await getListingsBySession(db, thread.id);

    const result = await handleNpcHaggle(client, db, thread, conv, userMessage, conv.ownerId);

    if (!result) {
        const leaveEmbed = new EmbedBuilder()
            .setColor('#E74C3C')
            .setDescription(`**اسم الزبون:** ${conv.name}\n\n🗣️ **أنت:**\n> ${userMessage}\n\n⚠️ *غادر السوق فجأة.*`);
        await conv.message.edit({ embeds: [leaveEmbed], components: [] }).catch(() => {});
        conv.active = false;
        NpcConversations.delete(conv.id);
        return;
    }

    conv.history.push({ role: 'assistant', content: result.message });

    const responseEmbed = new EmbedBuilder()
        .setColor('#2B2D31')
        .setDescription(`**اسم الزبون:** ${conv.name}\n\n🗣️ **أنت:**\n> ${userMessage}\n\n👤 **رد الزبون:**\n> "${result.message}"`);

    if (result.action?.action === 'leave') {
        responseEmbed.setColor('#E74C3C').setFooter({ text: '🏃 غادر المشتري السوق ولم تكتمل الصفقة.' });
        await conv.message.edit({ embeds: [responseEmbed], components: [] }).catch(() => {});
        conv.active = false;
        NpcConversations.delete(conv.id);

    } else if (result.action?.type === 'purchase') {
        const a = result.action;
        const purchaseResult = await buyItem(db, a.listingId, a.buyerId, a.sellerId, a.guildId, a.itemId, a.quantity, a.pricePerUnit, 'npc', client);

        if (purchaseResult.ok) {
            const earned = (a.quantity * a.pricePerUnit).toLocaleString();
            responseEmbed.setColor('#2ECC71').setFooter({ text: `💰 تم بيع ${a.quantity} من ${conv.targetItemName} بـ ${earned} مورا` });
            await conv.message.edit({ embeds: [responseEmbed], components: [] }).catch(() => {});

            const freshListings = await getListingsBySession(db, thread.id);
            const session = await getSessionByThread(db, thread.id);
            const dest = caravanConfig.destinations.find(d => d.id === (session?.destinationid || session?.destinationId));
            await updateMarketMessage(thread, freshListings, dest);

            await thread.send({ content: `✅ <@${conv.ownerId}> كسبت **${earned}** مورا من المشتري ${conv.name}!` }).catch(() => {});
        } else {
            responseEmbed.setColor('#E74C3C').setFooter({ text: `❌ فشلت الصفقة: ${purchaseResult.error}` });
            await conv.message.edit({ embeds: [responseEmbed], components: [] }).catch(() => {});
        }
        conv.active = false;
        NpcConversations.delete(conv.id);
    } else {
        responseEmbed.setFooter({ text: 'استخدم الأزرار للرد أو الموافقة على الصفقة.' });
        await conv.message.edit({ embeds: [responseEmbed] }).catch(() => {});
    }
}

// ============================================================================
// [6] جدولة الإنتاج (شخص واحد فقط في كل مرة) 👑
// ============================================================================
async function spawnNpc(client, db, thread, destId, ownerId, guildId) {
    try {
        const listings = await getListingsBySession(db, thread.id);
        const availableListings = listings.filter(l => (Number(l.quantity) - Number(l.quantitysold || l.quantitySold || 0)) > 0);
        if (availableListings.length === 0) return null;

        await incrementNpcSpawn(db, thread.id);

        // يختار الزبون بضاعة معينة يركز عليها
        const targetListing = availableListings[Math.floor(Math.random() * availableListings.length)];
        const itemInfo = getItemInfo(targetListing.itemid || targetListing.itemID);
        const itemName = itemInfo.name || targetListing.itemid;
        const askingPrice = Number(targetListing.priceperunit || targetListing.pricePerUnit);
        const jonesPrice = getJonesPrice(targetListing.itemid || targetListing.itemID, itemInfo);

        // جلب تفاصيل الزبون الذكي
        const npcData = await generateDynamicCustomer(itemName, askingPrice, jonesPrice);
        
        const convId = `conv_${thread.id}_${Date.now()}`;
        
        const embed = new EmbedBuilder()
            .setColor('#2B2D31')
            .setDescription(`**اسم الزبون:** ${npcData.name}\n\n> "${npcData.openingLine}"`);

        const npcMsg = await thread.send({ content: `يا <@${ownerId}>، زبون يقف عند بسطتك! 🛎️`, embeds: [embed] }).catch(() => null);
        if (!npcMsg) return null;

        NpcConversations.set(convId, {
            id: convId, 
            name: npcData.name,
            threadId: thread.id,
            ownerId, guildId, listings,
            targetListingId: targetListing.id,
            targetItemId: targetListing.itemid || targetListing.itemID,
            targetItemName: itemName,
            targetListingQty: targetListing.quantity,
            targetListingSold: targetListing.quantitysold || targetListing.quantitySold || 0,
            askingPrice, jonesPrice,
            message: npcMsg,
            history: [{ role: 'assistant', content: npcData.openingLine }], 
            active: true,
        });

        const negotiateBtn = new ButtonBuilder().setCustomId(`mkt_npc_talk_${convId}`).setLabel('💬 فاوض').setStyle(ButtonStyle.Primary);
        const acceptBtn = new ButtonBuilder().setCustomId(`mkt_npc_accept_${convId}`).setLabel('✅ موافق على سعره').setStyle(ButtonStyle.Success);
        const declineBtn = new ButtonBuilder().setCustomId(`mkt_npc_reject_${convId}`).setLabel('❌ رفض ومغادرة').setStyle(ButtonStyle.Danger);

        await npcMsg.edit({ components: [new ActionRowBuilder().addComponents(negotiateBtn, acceptBtn, declineBtn)] }).catch(() => {});

        const collector = npcMsg.createMessageComponentCollector({ filter: i => i.user.id === ownerId, time: 10 * 60 * 1000 });

        collector.on('collect', async i => {
            if (i.customId === `mkt_npc_reject_${convId}`) {
                await i.deferUpdate().catch(() => {});
                const rejectEmbed = new EmbedBuilder().setColor('#E74C3C').setDescription(`**اسم الزبون:** ${npcData.name}\n\n⚠️ طردت الزبون من متجرك.`);
                await npcMsg.edit({ embeds: [rejectEmbed], components: [] }).catch(() => {});
                NpcConversations.delete(convId);
                collector.stop();
                return;
            }

            const conv = NpcConversations.get(convId);
            if (!conv?.active) return i.reply({ content: '❌ لقد غادر هذا المشتري.', flags: [MessageFlags.Ephemeral] }).catch(() => {});

            if (i.customId === `mkt_npc_accept_${convId}`) {
                await i.deferUpdate().catch(() => {});
                await processNpcTurn(conv, 'أنا موافق على سعرك الحالي، اشترِ الآن.', i, client, db);
            }

            if (i.customId === `mkt_npc_talk_${convId}`) {
                const modal = new ModalBuilder().setCustomId(`mkt_npc_modal_${convId}`).setTitle(`حديث مع ${npcData.name}`);
                const replyInput = new TextInputBuilder().setCustomId('user_reply').setLabel('ردك على المشتري:').setStyle(TextInputStyle.Short).setMaxLength(200).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(replyInput));
                await i.showModal(modal).catch(() => {});
            }
        });

        collector.on('end', () => {
            const conv = NpcConversations.get(convId);
            if (conv?.active) {
                NpcConversations.delete(convId);
                const timeoutEmbed = new EmbedBuilder().setColor('#78909C').setDescription(`**اسم الزبون:** ${npcData.name}\n\n⚠️ غادر الزبون لتأخرك في الرد.`);
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

// 👑 المُجدول الذكي: يفحص السوق كل فترة ولا ينزل زبون إذا فيه زبون ثاني موجود 👑
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

            // التحقق من وجود زبون نشط حالياً في هذا السوق
            let isBusy = false;
            for (const conv of NpcConversations.values()) {
                if (conv.threadId === thread.id && conv.active) {
                    isBusy = true;
                    break;
                }
            }

            // إذا كان السوق فاضي، نسبة 40% ينزل زبون جديد
            if (!isBusy && Math.random() < 0.40) {
                await spawnNpc(client, db, thread, destId, ownerId, guildId);
            }
        } catch (err) { console.error('[scheduleNpcSpawn Interval Error]', err); }
    }, 15000); // يفحص كل 15 ثانية

    NpcSpawnIntervals.set(thread.id, interval);
}

function cleanupNpcConversations() { 
    NpcConversations.clear(); 
}
setInterval(cleanupNpcConversations, 3600000);

module.exports = {
    spawnNpc, scheduleNpcSpawn, handleNpcHaggle, handleNpcModalSubmit,
    NpcConversations, cleanupNpcConversations, getJonesPrice,
};
