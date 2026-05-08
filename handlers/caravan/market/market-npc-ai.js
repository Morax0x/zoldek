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

// بناء خريطة سريعة لأسعار جونس
const JONES_PRICES = new Map();

for (const s of SEEDS_DATA) {
    JONES_PRICES.set(s.id, { buy: s.price, sell: s.sell_price || s.price, name: s.name, emoji: s.emoji });
}
for (const f of (FISHING_DATA.fishItems || [])) {
    JONES_PRICES.set(f.id, { buy: f.price, sell: f.price, name: f.name, emoji: f.emoji });
}
for (const r of (FISHING_DATA.rods || [])) {
    JONES_PRICES.set(r.id, { buy: r.price, sell: Math.floor(r.price * 0.6), name: r.name, emoji: '🎣' });
}
for (const b of (FISHING_DATA.boats || [])) {
    JONES_PRICES.set(b.id, { buy: b.price, sell: Math.floor(b.price * 0.6), name: b.name, emoji: '🚤' });
}
for (const bt of (FISHING_DATA.baits || [])) {
    JONES_PRICES.set(bt.id, { buy: bt.price, sell: Math.floor(bt.price * 0.7), name: bt.name, emoji: '🪱' });
}
for (const p of POTIONS_DATA) {
    JONES_PRICES.set(p.id, { buy: p.price, sell: Math.floor(p.price * 0.8), name: p.name, emoji: p.emoji });
}

const NpcConversations = new Map();

// ============================================================================
// [1] أنماط شخصيات NPC الأساسية (تستخدم كمرجع للميزانية والاهتمامات فقط)
// ============================================================================
const BASE_ARCHETYPES = [
    { id: 'fish_merchant', preferredIds: ['fish_', 'worm', 'cricket', 'shrimp', 'squid', 'magic', 'rod_', 'boat_'], budgetMin: 30000, budgetMax: 200000, color: '#1A6B8A' },
    { id: 'rich_farmer', preferredIds: ['seed_'], budgetMin: 80000, budgetMax: 500000, color: '#2E7D32' },
    { id: 'traveling_trader', preferredIds: [], budgetMin: 50000, budgetMax: 350000, color: '#F57F17' },
    { id: 'night_smuggler', preferredIds: ['potion_'], budgetMin: 100000, budgetMax: 600000, color: '#37474F' },
    { id: 'noble_collector', preferredIds: ['fish_shark', 'fish_dolphin', 'fish_whale', 'fish_treasure', 'fish_kraken', 'fish_golden_whale', 'rod_8', 'rod_9', 'rod_10', 'boat_6', 'boat_7'], budgetMin: 200000, budgetMax: 2000000, color: '#7B1FA2' },
];

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
// [2] محركات الذكاء الاصطناعي (API Calls)
// ============================================================================
async function callGeminiDirect(apiKey, systemPrompt, messages, jsonMode = false) {
    try {
        const contents = messages.map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
        }));

        const payload = {
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents,
            generationConfig: { temperature: 0.85, maxOutputTokens: 250 },
        };
        if (jsonMode) payload.generationConfig.responseMimeType = 'application/json';

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
        );
        if (!response.ok) return null;
        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
    } catch { return null; }
}

async function callOpenAIDirect(apiKey, systemPrompt, messages, jsonMode = false) {
    try {
        const payload = {
            model: 'gpt-4o-mini',
            messages: [{ role: 'system', content: systemPrompt }, ...messages],
            temperature: 0.85,
            max_tokens: 250,
        };
        if (jsonMode) payload.response_format = { type: 'json_object' };

        const response = await fetch('[https://api.openai.com/v1/chat/completions](https://api.openai.com/v1/chat/completions)', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify(payload),
        });
        if (!response.ok) return null;
        const data = await response.json();
        return data.choices?.[0]?.message?.content?.trim() || null;
    } catch { return null; }
}

async function callAI(systemPrompt, messages, jsonMode = false) {
    const openaiKey = process.env.OPENAI_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;

    if (openaiKey) {
        const result = await callOpenAIDirect(openaiKey, systemPrompt, messages, jsonMode);
        if (result) return result;
    }
    if (geminiKey) {
        const result = await callGeminiDirect(geminiKey, systemPrompt, messages, jsonMode);
        if (result) return result;
    }
    return null;
}

// ============================================================================
// [3] توليد شخصيات (NPCs) ديناميكية وفريدة 👑
// ============================================================================
async function generateDynamicArchetype(availableListings, usedIds) {
    const itemIds = availableListings.map(l => l.itemid || l.itemID || '');
    
    // اختيار القاعدة المرجعية للميزانية
    const scored = BASE_ARCHETYPES.map(a => {
        let score = a.preferredIds.length === 0 ? 5 : 0;
        for (const itemId of itemIds) {
            for (const pref of a.preferredIds) {
                if (itemId.startsWith(pref) || itemId === pref) score += 2;
            }
        }
        return { archetype: a, score };
    }).sort((a, b) => b.score - a.score);

    const baseArchetype = scored[0].archetype;
    
    // سياق البضائع للذكاء الاصطناعي
    const itemSummary = availableListings.slice(0, 5).map(l => getItemInfo(l.itemid || l.itemID).name).join('، ');

    const systemPrompt = `أنت مصمم شخصيات (NPC Generator) للعبة RPG عربية.
قم بتوليد شخصية مشتري (NPC) يريد شراء بعض هذه البضائع المتوفرة في السوق: ${itemSummary}.

يجب أن تعيد كائن JSON حصراً بالصيغة التالية (بدون أي نصوص إضافية):
{
  "name": "اسم عربي خيالي للمشتري (مثل: جابر الساحر، هند الثرية، قاسم الرحال)",
  "emoji": "إيموجي واحد يعبر عن وظيفته أو شخصيته",
  "persona": "وصف دقيق لشخصيته وأسلوبه في التفاوض (مثل: تاجر عجوز بخيل يجادل على كل قرش، أو شاب ثري متهور يدفع بدون تفكير)",
  "openingLine": "جملة حوارية واحدة قصيرة يقولها المشتري عندما يصل للسوق مبدياً اهتمامه بالبضائع، يجب أن تكون باللهجة العربية المناسبة لأسلوبه."
}`;

    try {
        const aiResponse = await callAI(systemPrompt, [], true);
        if (aiResponse) {
            const data = JSON.parse(aiResponse);
            if (data.name && data.openingLine) {
                return {
                    id: `dyn_${Date.now()}`,
                    name: data.name,
                    emoji: data.emoji || '👤',
                    persona: data.persona,
                    haggleStyle: data.persona,
                    flavorLines: [data.openingLine],
                    budgetMin: baseArchetype.budgetMin,
                    budgetMax: baseArchetype.budgetMax,
                    color: baseArchetype.color
                };
            }
        }
    } catch(e) { console.error('Dynamic NPC Error:', e); }

    // Fallback في حال فشل الذكاء الاصطناعي
    return {
        id: `fallback_${Date.now()}`,
        name: 'تاجر مجهول',
        emoji: '🐪',
        persona: 'تاجر عابر يبحث عن صفقات سريعة.',
        haggleStyle: 'سريع ومرن.',
        flavorLines: ['رأيت بضاعتك من بعيد، هل نتبادل التجارة؟'],
        budgetMin: baseArchetype.budgetMin,
        budgetMax: baseArchetype.budgetMax,
        color: baseArchetype.color
    };
}

// ============================================================================
// [4] معالجة النصوص وردود الأفعال
// ============================================================================
function parseNpcAction(text) {
    const buyMatch = text.match(/\[BUY_ITEM:\s*(\d+)\s*:\s*(\d+)\s*:\s*(\d+)\s*\]/i);
    if (buyMatch) {
        return { action: 'buy', listingId: parseInt(buyMatch[1]), quantity: parseInt(buyMatch[2]), offeredPrice: parseInt(buyMatch[3]) };
    }
    if (/\[LEAVE\]/i.test(text)) return { action: 'leave' };
    return null;
}

async function handleNpcHaggle(client, db, thread, conv, userMessageStr, ownerId) {
    const availableListings = conv.listings.filter(l => (Number(l.quantity) - Number(l.quantitysold || l.quantitySold || 0)) > 0);

    if (availableListings.length === 0) {
        return { message: 'نفذت البضاعة! لا يوجد ما يستحق الشراء هنا.', action: { action: 'leave' } };
    }

    const archetype = conv.archetype;

    const listingsContext = availableListings.map(l => {
        const info = getItemInfo(l.itemid || l.itemID);
        const avail = Number(l.quantity) - Number(l.quantitysold || l.quantitySold || 0);
        const askPrice = Number(l.priceperunit || l.pricePerUnit);
        const jonesPrice = getJonesPrice(l.itemid || l.itemID, info);
        const isGreedy = askPrice > jonesPrice * 1.5;
        return `- ${info.name} (رقم: ${l.id}) | متوفر: ${avail} | طلب البائع: ${askPrice.toLocaleString()} مورا | السعر العادل: ${jonesPrice.toLocaleString()} مورا${isGreedy ? ' ⚠️ سعر مبالغ فيه!' : ''}`;
    }).join('\n');

    const conversationHistory = conv.history.map(e => ({
        role: e.role,
        content: e.role === 'assistant' ? `${conv.name}: ${e.content}` : `البائع: ${e.content}`,
    }));

    const systemPrompt = `أنت: ${archetype.emoji} ${archetype.name}
الشخصية: ${archetype.persona}
أسلوب التفاوض: ${archetype.haggleStyle}

=== قواعد التفاوض (إلزامية وصارمة جداً) ===
1. رد بجملة واحدة مختصرة جداً (لا تطل بالكلام).
2. السعر العادل لأي سلعة = "السعر العادل" الموضح في القائمة. أنت خبير وتعرف هذا السعر جيداً ولن يتم النصب عليك.
3. 🛑 يمنع منعاً باتاً أن توافق على شراء أي سلعة بسعر يتجاوز (السعر العادل + 50%).
4. إذا طلب البائع سعراً مبالغاً فيه (أكثر من السعر العادل بـ 50%)، ارفض بقوة وساومه لخفض السعر، أو غادر فوراً.
5. إذا وافقت على السعر بعد التفاوض، أضف في نهاية ردك هذا الكود نصياً: [BUY_ITEM:رقم_السلعة:الكمية:السعر_النهائي]
6. إذا قررت المغادرة ورفض الصفقة، أضف هذا الكود نصياً: [LEAVE]

=== البضائع المتاحة للبيع ===
${listingsContext}`;

    const messages = [...conversationHistory, { role: 'user', content: `البائع: ${userMessageStr}` }];

    const response = await callAI(systemPrompt, messages, false);
    if (!response) return { message: '...', action: null };

    const action = parseNpcAction(response);
    const cleanMessage = response.replace(/\[BUY_ITEM:.*?\]/gi, '').replace(/\[LEAVE\]/gi, '').trim();

    if (action?.action === 'buy') {
        let listing = availableListings.find(l => Number(l.id) === Number(action.listingId));
        if (!listing && availableListings.length === 1) listing = availableListings[0];
        if (!listing) return { message: cleanMessage || 'يبدو أنني أخطأت في السلعة!', action: null };

        const info = getItemInfo(listing.itemid || listing.itemID);
        const jonesPrice = getJonesPrice(listing.itemid || listing.itemID, info);
        const finalPrice = action.offeredPrice;

        // 👑 حماية برمجية تمنع الذكاء الاصطناعي من دفع مبالغ خيالية 👑
        if (finalPrice > jonesPrice * 1.5) {
            return {
                message: `هل تستغفلني؟ السعر العادل هو ${jonesPrice.toLocaleString()} مورا. لن أشتري بهذا السعر المبالغ فيه!`,
                action: { action: 'leave' },
            };
        }

        const totalCost = action.quantity * finalPrice;
        if (totalCost > conv.budget) {
            return {
                message: cleanMessage || `ميزانيتي لا تكفي هذا المبلغ الضخم. وداعاً.`,
                action: { action: 'leave' },
            };
        }

        const maxQty = Number(listing.quantity) - Number(listing.quantitysold || listing.quantitySold || 0);

        return {
            message: cleanMessage || 'اتفقنا.',
            action: {
                type: 'purchase',
                listingId: listing.id,
                quantity: Math.min(action.quantity, maxQty),
                pricePerUnit: finalPrice,
                buyerId: 'npc_' + conv.archetype.id,
                sellerId: ownerId,
                guildId: listing.guildid || listing.guildID,
                itemId: listing.itemid || listing.itemID,
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
        .setColor(conv.archetype.color)
        .setAuthor({ name: `${conv.archetype.emoji} ${conv.archetype.name} — جارٍ التفكير...` })
        .setDescription(`🗣️ **أنت:**\n> ${userMessage}\n\n*${conv.archetype.name} يتأمل ما قلته...*`);

    await conv.message.edit({ embeds: [thinkingEmbed] }).catch(() => {});

    const thread = interaction.channel;
    conv.listings = await getListingsBySession(db, thread.id);

    const result = await handleNpcHaggle(client, db, thread, conv, userMessage, conv.ownerId);

    if (!result) {
        const leaveEmbed = new EmbedBuilder()
            .setColor('#E74C3C')
            .setAuthor({ name: `${conv.archetype.emoji} ${conv.archetype.name} — غادر` })
            .setDescription(`🗣️ **أنت:**\n> ${userMessage}\n\n⚠️ غادر بشكل مفاجئ.`)
            .setFooter({ text: 'انتهت المحادثة' });
        await conv.message.edit({ embeds: [leaveEmbed], components: [] }).catch(() => {});
        conv.active = false;
        NpcConversations.delete(conv.id);
        return;
    }

    conv.history.push({ role: 'assistant', content: result.message });

    const responseEmbed = new EmbedBuilder()
        .setColor(conv.archetype.color)
        .setAuthor({ name: `${conv.archetype.emoji} ${conv.archetype.name}` })
        .setDescription(`🗣️ **أنت:**\n> ${userMessage}\n\n${conv.archetype.emoji} **${conv.archetype.name}:**\n> ${result.message}`);

    if (result.action?.action === 'leave') {
        responseEmbed.setColor('#E74C3C').setFooter({ text: '🏃 غادر المشتري السوق ولم تكتمل الصفقة.' });
        await conv.message.edit({ embeds: [responseEmbed], components: [] }).catch(() => {});
        conv.active = false;
        NpcConversations.delete(conv.id);

    } else if (result.action?.type === 'purchase') {
        const a = result.action;
        const purchaseResult = await buyItem(db, a.listingId, a.buyerId, a.sellerId, a.guildId, a.itemId, a.quantity, a.pricePerUnit, 'npc', client);

        if (purchaseResult.ok) {
            const itemInfo = getItemInfo(a.itemId);
            const earned = (a.quantity * a.pricePerUnit).toLocaleString();
            responseEmbed.setColor('#2ECC71').setTitle(`🤝 صفقة ناجحة!`).setFooter({ text: `💰 بعت ${a.quantity}x ${itemInfo.name} بـ ${earned} مورا` });
            await conv.message.edit({ embeds: [responseEmbed], components: [] }).catch(() => {});

            const freshListings = await getListingsBySession(db, thread.id);
            const session = await getSessionByThread(db, thread.id);
            const dest = caravanConfig.destinations.find(d => d.id === (session?.destinationid || session?.destinationId));
            await updateMarketMessage(thread, freshListings, dest);

            await thread.send({ content: `✅ <@${conv.ownerId}> كسبت **${earned}** مورا من ${conv.archetype.emoji} ${conv.archetype.name}!` }).catch(() => {});
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
// [6] إنتاج الزوار وجدولتهم
// ============================================================================
async function spawnNpc(client, db, thread, destId, ownerId, guildId, usedArchetypeIds = []) {
    try {
        const npcSpawnCount = await getNpcSpawnCount(db, thread.id);
        if (npcSpawnCount >= 7) return null; // رفعنا الحد الأقصى للمشترين

        const listings = await getListingsBySession(db, thread.id);
        const availableListings = listings.filter(l => (Number(l.quantity) - Number(l.quantitysold || l.quantitySold || 0)) > 0);
        if (availableListings.length === 0) return null;

        // توليد شخصية بالذكاء الاصطناعي بدلاً من الاعتماد على قائمة ثابتة
        const archetype = await generateDynamicArchetype(availableListings, usedArchetypeIds);
        await incrementNpcSpawn(db, thread.id);

        const destName = caravanConfig.destinations.find(d => d.id === destId)?.name || 'سوق القوافل';
        const convId = `conv_${thread.id}_${Date.now()}`;
        
        const openingLine = archetype.flavorLines[0];
        const itemSummary = availableListings.slice(0, 5).map(l => getItemInfo(l.itemid || l.itemID).name).join('، ');

        const embed = new EmbedBuilder()
            .setColor(archetype.color)
            .setTitle(`${archetype.emoji} ${archetype.name} يقترب من بضاعتك`)
            .setDescription(`> *"${openingLine}"*\n\n**الشخصية:** ${archetype.persona}\n**اهتمامه:** ${itemSummary}`)
            .setFooter({ text: `ميزانيته: حتى ${archetype.budgetMax.toLocaleString()} مورا • متاح 15 دقيقة` });

        const npcMsg = await thread.send({ content: `يا <@${ownerId}>، مشترٍ مهتم ببضاعتك! 🛎️`, embeds: [embed] }).catch(() => null);
        if (!npcMsg) return null;

        NpcConversations.set(convId, {
            id: convId, archetype, name: archetype.name, emoji: archetype.emoji, persona: archetype.persona,
            destId, destName, ownerId, guildId, listings, budget: archetype.budgetMax, message: npcMsg,
            history: [{ role: 'assistant', content: openingLine }], active: true,
        });

        const negotiateBtn = new ButtonBuilder().setCustomId(`mkt_npc_talk_${convId}`).setLabel('💬 فاوض').setStyle(ButtonStyle.Primary);
        const acceptBtn = new ButtonBuilder().setCustomId(`mkt_npc_accept_${convId}`).setLabel('✅ موافق على سعرك').setStyle(ButtonStyle.Success);
        const declineBtn = new ButtonBuilder().setCustomId(`mkt_npc_reject_${convId}`).setLabel('❌ طرده').setStyle(ButtonStyle.Danger);

        await npcMsg.edit({ components: [new ActionRowBuilder().addComponents(negotiateBtn, acceptBtn, declineBtn)] }).catch(() => {});

        const collector = npcMsg.createMessageComponentCollector({ filter: i => i.user.id === ownerId, time: 15 * 60 * 1000 });

        collector.on('collect', async i => {
            if (i.customId === `mkt_npc_reject_${convId}`) {
                await i.deferUpdate().catch(() => {});
                const rejectEmbed = new EmbedBuilder().setColor('#E74C3C').setAuthor({ name: `${archetype.emoji} ${archetype.name} — طُرد` }).setDescription(`طردته من السوق قبل أن تتم الصفقة.`);
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
                const modal = new ModalBuilder().setCustomId(`mkt_npc_modal_${convId}`).setTitle(`حديث مع ${archetype.name}`.substring(0, 45));
                const replyInput = new TextInputBuilder().setCustomId('user_reply').setLabel('ردك على المشتري:').setStyle(TextInputStyle.Short).setMaxLength(200).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(replyInput));
                await i.showModal(modal).catch(() => {});
            }
        });

        collector.on('end', () => {
            const conv = NpcConversations.get(convId);
            if (conv?.active) {
                NpcConversations.delete(convId);
                const timeoutEmbed = new EmbedBuilder().setColor('#78909C').setAuthor({ name: `${archetype.emoji} ${archetype.name} — انتهى الوقت` }).setDescription(`انتهى وقت هذا المشتري وغادر السوق.`);
                npcMsg.edit({ embeds: [timeoutEmbed], components: [] }).catch(() => {});
            }
        });

        return archetype.id;
    } catch (err) { console.error('[spawnNpc Error]', err); return null; }
}

async function handleNpcModalSubmit(interaction, client, db) {
    if (!interaction.customId.startsWith('mkt_npc_modal_')) return false;
    const convId = interaction.customId.replace('mkt_npc_modal_', '');
    const conv = NpcConversations.get(convId);
    if (!conv?.active) {
        await interaction.reply({ content: '❌ المحادثة انتهت أو المشتري غادر.', flags: [MessageFlags.Ephemeral] }).catch(() => {});
        return true;
    }
    await interaction.deferUpdate().catch(() => {});
    const userMessage = interaction.fields.getTextInputValue('user_reply');
    await processNpcTurn(conv, userMessage, interaction, client, db);
    return true;
}

function scheduleNpcSpawn(client, db, thread, dest, ownerId, guildId, marketDurationMs) {
    const destId = dest.id;
    // 👑 رفع عدد الزوار إلى (5 - 7 زوار) عشان تختبرهم براحتك 👑
    const npcCount = 5 + Math.floor(Math.random() * 3); 
    const usedArchetypeIds = [];

    const slots = [];
    for (let i = 0; i < npcCount; i++) {
        // 👑 تظهيرهم بشكل سريع جداً في أول دقائق السوق (أول 15% من الوقت) 👑
        const position = 0.01 + (Math.random() * 0.14);
        slots.push(Math.min(position, 0.90));
    }
    slots.sort((a, b) => a - b);

    for (const pos of slots) {
        const delay = Math.floor(marketDurationMs * pos);
        setTimeout(async () => {
            try {
                const session = await getSessionByThread(db, thread.id);
                if (!session || session.status !== 'open') return;
                const archetypeId = await spawnNpc(client, db, thread, destId, ownerId, guildId, usedArchetypeIds);
                if (archetypeId) usedArchetypeIds.push(archetypeId);
            } catch (err) { console.error('[scheduleNpcSpawn Error]', err); }
        }, delay);
    }
}

function cleanupNpcConversations() { NpcConversations.clear(); }
setInterval(cleanupNpcConversations, 3600000);

module.exports = {
    spawnNpc, scheduleNpcSpawn, handleNpcHaggle, handleNpcModalSubmit,
    NpcConversations, cleanupNpcConversations, getJonesPrice,
};
