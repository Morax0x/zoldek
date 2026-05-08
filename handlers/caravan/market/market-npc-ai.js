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
// محركات الذكاء الاصطناعي
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
// توليد الزبون (أسماء فانتازيا وتحديد السعر المبدئي الذكي) 👑
// ============================================================================
async function generateDynamicCustomer(itemName, askingPrice, jonesPrice) {
    const isCheap = askingPrice <= jonesPrice;
    
    // الزبون يقترح سعر مبدئي (لا يتجاوز السعر المطلوب أبداً)
    let npcInitialOffer = askingPrice;
    if (!isCheap) {
        npcInitialOffer = Math.floor(jonesPrice * (0.6 + Math.random() * 0.4)); // يعرض 60% إلى 100% من السعر العادل
    }

    const systemPrompt = `أنت زبون في سوق قوافل لعبة فانتازيا RPG.
البائع يعرض سلعة باسم "${itemName}" ووضع لها سعر ${askingPrice} مورا. السعر المعروف والعادل في السوق هو ${jonesPrice} مورا.
أنت ستفتتح كلامك وتعرض دفع ${npcInitialOffer} مورا كبداية للتفاوض أو لشراء السلعة.

يجب أن ترجع كائن JSON حصراً:
{
  "name": "اسمك كزبون (نوّع! استخدم أسماء فانتازيا، يابانية، أجنبية، ألقاب غامضة، أو عربية. كلمة أو كلمتين فقط كحد أقصى مثل: Kael، رورونوا، تاجر الشرق، آرثر، الظل)",
  "openingLine": "الجملة الافتتاحية التي ستخاطب بها البائع، تعرض فيها رغبتك بالسلعة وتقترح الدفع (${npcInitialOffer} مورا) بأسلوبك."
}`;

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
    
    return {
        name: ['Zoro', 'Arthur', 'الظل', 'تاجر شرقي', 'Jin', 'Kael', 'الغريب'][Math.floor(Math.random() * 7)],
        offer: npcInitialOffer,
        openingLine: isCheap 
            ? `يا للروعة! تبيع ${itemName} بـ ${askingPrice} مورا فقط؟ صفقة ممتازة، سأشتريها.`
            : `مرحباً، أرى أنك تعرض ${itemName} بسعر مبالغ فيه. سعره المعروف هو ${jonesPrice}، ما رأيك أن تبيعني إياه بـ ${npcInitialOffer} مورا؟`
    };
}

// ============================================================================
// معالجة التفاوض (حد الصبر والمكاسرة الذكية) 👑
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
    if (availableListings.length === 0) return { message: 'لا يوجد شيء لأشتريه هنا.', action: { action: 'leave' } };

    // زيادة عداد التفاوض
    conv.haggleTurns = (conv.haggleTurns || 0) + 1;

    const conversationHistory = conv.history.map(e => ({ role: e.role, content: e.role === 'assistant' ? `${conv.name}: ${e.content}` : `البائع: ${e.content}` }));

    const systemPrompt = `أنت الزبون "${conv.name}". تتفاوض لشراء "${conv.targetItemName}".
السعر العادل المعروف: ${conv.jonesPrice} مورا. السعر الذي يطلبه البائع: ${conv.askingPrice} مورا.
أنت اقترحت سابقاً سعر: ${conv.currentOffer} مورا.

أنت في الجولة ${conv.haggleTurns} من أصل ${conv.maxTurns} من التفاوض.

قواعدك (صارمة ومهمة لمنع الغباء):
1. كن ذكياً ووفر مالك! لا تقم بتاتاً بعرض سعر أعلى من السعر الذي عارضه البائع أساساً (${conv.askingPrice}).
2. إذا اقترح البائع سعراً أقل من أو يساوي السعر المعروف (${conv.jonesPrice})، وافق فوراً ولا ترفع السعر!
3. إذا أردت اقتراح سعر جديد للمكاسرة، يجب أن تضيف نصياً في نهاية ردك: [OFFER:السعر_الذي_تقترحه]
4. إذا وافقتم على السعر لإنهاء الصفقة، أضف نصياً: [BUY_ITEM:${conv.targetListingId}:الكمية_المطلوبة:السعر_المتفق_عليه]
5. إذا طفح الكيل والمبلغ غالي جداً أو لم تتفقا، أضف نصياً للانسحاب: [LEAVE]
6. رد بجملة قصيرة واحدة فقط.`;

    const messages = [...conversationHistory, { role: 'user', content: `البائع: ${userMessageStr}` }];
    const response = await callAI(systemPrompt, messages, false);
    
    if (!response) return { message: '...', action: null };

    const action = parseNpcAction(response);
    const cleanMessage = response.replace(/\[BUY_ITEM:.*?\]/gi, '').replace(/\[OFFER:.*?\]/gi, '').replace(/\[LEAVE\]/gi, '').trim();

    // إذا استنفد الزبون صبره (وصل للحد الأقصى) وما تمت الصفقة، يمشي إجبارياً
    if (conv.haggleTurns >= conv.maxTurns && action?.action !== 'buy') {
        return { message: cleanMessage || 'لم نصل لاتفاق ولن أضيع وقتي أكثر من هذا. وداعاً!', action: { action: 'leave' } };
    }

    if (action?.action === 'buy') {
        let finalPrice = action.offeredPrice;

        // حماية برمجية قسوى: الزبون مستحيل يدفع أكثر من السعر المطلوب
        if (finalPrice > conv.askingPrice) finalPrice = conv.askingPrice;

        // حماية ضد الأسعار الخيالية
        if (finalPrice > conv.jonesPrice * 1.5) {
            return {
                message: `السعر العادل هو ${conv.jonesPrice}. لن أدفع أكثر من هذا. وداعاً!`,
                action: { action: 'leave' },
            };
        }

        const maxQty = Number(conv.targetListingQty) - Number(conv.targetListingSold);
        const qtyToBuy = Math.min(action.quantity, maxQty);

        return {
            message: cleanMessage || 'اتفقنا على الشراء.',
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
// واجهة التفاعل (إيمبد نظيف وعشوائي اللون + سجل محادثة) 👑
// ============================================================================
function generateMarketEmbed(conv) {
    const baseDesc = `✶ **الاسـم:** ${conv.name}\n` +
                     `✶ **العنـصر:** ${conv.targetItemName}\n` +
                     `✶ **السـعـر المعروض:** ${conv.currentOffer} مورا\n\n`;

    return new EmbedBuilder()
        .setColor(conv.color)
        .setTitle('✥ زبـون يقترب من قافلتـك')
        .setDescription(baseDesc + conv.chatLog.join('\n\n'));
}

async function processNpcTurn(conv, userMessage, interaction, client, db) {
    // إضافة رسالة اللاعب للسجل
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

    // تحديث السعر المعروض إذا الزبون كاسر واقترح سعر جديد
    if (result.action && result.action.action === 'haggle') {
        conv.currentOffer = result.action.newOffer;
    }

    conv.history.push({ role: 'assistant', content: result.message });
    conv.chatLog.push(`✦ **${conv.name}:** ${result.message}`);

    const updatedEmbed = generateMarketEmbed(conv);

    if (result.action?.action === 'leave') {
        updatedEmbed.setFooter({ text: '🏃 غادر المشتري السوق ولم تكتمل الصفقة.' });
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

            await thread.send({ content: `✅ <@${conv.ownerId}> كسبت **${earned}** مورا من المشتري ${conv.name}!` }).catch(() => {});
        } else {
            updatedEmbed.setFooter({ text: `❌ فشلت الصفقة: ${purchaseResult.error}` });
            await conv.message.edit({ embeds: [updatedEmbed], components: [] }).catch(() => {});
        }
        conv.active = false;
        NpcConversations.delete(conv.id);
    } else {
        updatedEmbed.setFooter({ text: `(الفرصة: الجولة ${conv.haggleTurns} من ${conv.maxTurns}) - استخدم الأزرار للرد` });
        await conv.message.edit({ embeds: [updatedEmbed] }).catch(() => {});
    }
}

// ============================================================================
// جدولة الإنتاج (شخص واحد فقط في كل مرة) 👑
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

        const npcData = await generateDynamicCustomer(itemName, askingPrice, jonesPrice);
        const convId = `conv_${thread.id}_${Date.now()}`;
        
        // توليد لون عشوائي مميز لكل زبون
        const randomColor = `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`;
        
        // مزاج الزبون (الصبر: من جولة إلى 3 جولات كحد أقصى)
        const maxTurns = Math.floor(Math.random() * 3) + 1;

        const chatLog = [`✦ **${npcData.name}:** ${npcData.openingLine}`];
        
        const baseDesc = `✶ **الاسـم:** ${npcData.name}\n` +
                         `✶ **العنـصر:** ${itemName}\n` +
                         `✶ **السـعـر المعروض:** ${npcData.offer} مورا\n\n`;

        const embed = new EmbedBuilder()
            .setColor(randomColor)
            .setTitle('✥ زبـون يقترب من قافلتـك')
            .setDescription(baseDesc + chatLog[0]);

        const npcMsg = await thread.send({ content: `<@${ownerId}>`, embeds: [embed] }).catch(() => null);
        if (!npcMsg) return null;

        NpcConversations.set(convId, {
            id: convId, 
            name: npcData.name,
            color: randomColor,
            threadId: thread.id,
            ownerId, guildId, listings,
            targetListingId: targetListing.id,
            targetItemId: targetListing.itemid || targetListing.itemID,
            targetItemName: itemName,
            targetListingQty: targetListing.quantity,
            targetListingSold: targetListing.quantitysold || targetListing.quantitySold || 0,
            askingPrice, jonesPrice,
            currentOffer: npcData.offer,
            haggleTurns: 0, 
            maxTurns, // حد الصبر
            message: npcMsg,
            history: [{ role: 'assistant', content: npcData.openingLine }], 
            chatLog, // لحفظ شكل السوالف
            active: true,
        });

        const negotiateBtn = new ButtonBuilder().setCustomId(`mkt_npc_talk_${convId}`).setLabel('💬 فاوض').setStyle(ButtonStyle.Primary);
        const acceptBtn = new ButtonBuilder().setCustomId(`mkt_npc_accept_${convId}`).setLabel('✅ موافق على سعره').setStyle(ButtonStyle.Success);
        const declineBtn = new ButtonBuilder().setCustomId(`mkt_npc_reject_${convId}`).setLabel('❌ طرده').setStyle(ButtonStyle.Danger);

        await npcMsg.edit({ components: [new ActionRowBuilder().addComponents(negotiateBtn, acceptBtn, declineBtn)] }).catch(() => {});

        const collector = npcMsg.createMessageComponentCollector({ filter: i => i.user.id === ownerId, time: 10 * 60 * 1000 });

        collector.on('collect', async i => {
            if (i.customId === `mkt_npc_reject_${convId}`) {
                await i.deferUpdate().catch(() => {});
                const conv = NpcConversations.get(convId);
                const rejectEmbed = new EmbedBuilder().setColor('#E74C3C').setTitle('✥ زبـون يقترب من قافلتـك').setDescription(`**الاسـم:** ${conv.name}\n\n⚠️ تم طرد الزبون من المتجر.`);
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
                const timeoutEmbed = new EmbedBuilder().setColor('#78909C').setTitle('✥ زبـون يقترب من قافلتـك').setDescription(`**الاسـم:** ${conv.name}\n\n⚠️ غادر الزبون لتأخرك في الرد.`);
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

// مُجدول الزوار: يفحص السوق كل 15 ثانية، ولن يُنزل زبوناً جديداً طالما هناك زبون واقف!
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

            // إذا كان السوق فاضي، ينزل زبون جديد فوراً (نسبة ظهور 60% كل 15 ثانية)
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
