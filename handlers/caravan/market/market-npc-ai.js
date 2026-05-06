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

const NpcConversations = new Map();

// ============================================================================
// [1] نظام التسعير والحماية من النصب
// ============================================================================
function getBasePrice(itemId, info) {
    if (info.price) return info.price;
    if (info.sell_price) return info.sell_price;

    const prices = {
        // البذور
        'seed_wheat': 50, 'seed_strawberry': 80, 'seed_carrot': 120, 'seed_potato': 150,
        'seed_tomato': 180, 'seed_corn': 250, 'seed_eggplant': 300, 'seed_rice': 350,
        'seed_pumpkin': 500, 'seed_watermelon': 600, 'seed_pineapple': 800, 'seed_dates': 1000,
        // الجرعات
        'potion_heal': 100, 'potion_stealth': 100, 'potion_reflect': 150,
        'potion_time': 500, 'potion_titan': 999, 'potion_sacrifice': 3000,
        // الأسماك ومعدات الصيد
        'fish_trash': 5, 'fish_boot': 10, 'fish_seaweed': 20, 'fish_branch': 20, 'fish_sock': 30,
        'fish_sardine': 100, 'fish_shrimp': 115, 'fish_goldfish': 150, 'fish_tuna': 170,
        'fish_squid': 180, 'fish_mackerel': 70, 'fish_salmon': 200, 'fish_lobster': 220,
        'fish_clown': 250, 'fish_octopus': 300, 'fish_puffer': 400, 'fish_turtle': 700,
        'fish_ray': 750, 'fish_shark': 777, 'fish_dolphin': 790, 'fish_whale': 800,
        'fish_treasure': 900, 'fish_kraken': 900, 'fish_golden_whale': 1000,
        // الطعوم
        'worm': 50, 'cricket': 150, 'shrimp': 500, 'squid': 1200, 'magic': 3000,
        // السنارات
        'rod_1': 100, 'rod_2': 2000, 'rod_3': 5000, 'rod_4': 10000, 'rod_5': 25000, 
        'rod_6': 50000, 'rod_7': 120000, 'rod_8': 200000, 'rod_9': 350000, 'rod_10': 500000,
        // القوارب
        'boat_1': 500, 'boat_2': 5000, 'boat_3': 10000, 'boat_4': 50000, 'boat_5': 100000,
        'boat_6': 150000, 'boat_7': 300000
    };

    if (prices[itemId]) return prices[itemId];

    if (info.rarity) {
        switch (info.rarity.toLowerCase()) {
            case 'common': return 250;
            case 'uncommon': return 550;
            case 'rare': return 800;
            case 'epic': return 950;
            case 'legendary': return 50000;
        }
    }

    return 500; // سعر افتراضي آمن
}

// ============================================================================
// [2] محركات الذكاء الاصطناعي (API Calls)
// ============================================================================
async function callGeminiDirect(apiKey, systemPrompt, userMessage, jsonMode = false) {
    try {
        const payload = {
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: 'user', parts: [{ text: userMessage }] }],
            generationConfig: { temperature: 0.7 }, // تم تقليل الحرارة لردود أكثر منطقية
        };
        if (jsonMode) payload.generationConfig.responseMimeType = "application/json";

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            }
        );
        if (!response.ok) return null;
        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
    } catch (err) {
        return null;
    }
}

async function callOpenAIDirect(apiKey, systemPrompt, userMessage, jsonMode = false) {
    try {
        const payload = {
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMessage },
            ],
            temperature: 0.7,
        };
        if (jsonMode) payload.response_format = { type: "json_object" };

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify(payload),
        });
        if (!response.ok) return null;
        const data = await response.json();
        return data.choices?.[0]?.message?.content?.trim() || null;
    } catch (err) {
        return null;
    }
}

async function callAI(systemPrompt, userMessage, jsonMode = false) {
    const openaiKey = process.env.OPENAI_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;

    if (openaiKey) {
        const result = await callOpenAIDirect(openaiKey, systemPrompt, userMessage, jsonMode);
        if (result) return result;
    }
    if (geminiKey) {
        const result = await callGeminiDirect(geminiKey, systemPrompt, userMessage, jsonMode);
        if (result) return result;
    }
    return null;
}

// ============================================================================
// [3] معالجة النصوص وردود الأفعال
// ============================================================================
function parseNpcAction(text) {
    // التقاط كود الشراء حتى لو كان فيه مسافات بالغلط
    const buyMatch = text.match(/\[BUY_ITEM:\s*(\d+)\s*:\s*(\d+)\s*:\s*(\d+)\s*\]/i);
    if (buyMatch) {
        return {
            action: 'buy',
            listingId: parseInt(buyMatch[1]),
            quantity: parseInt(buyMatch[2]),
            offeredPrice: parseInt(buyMatch[3]),
        };
    }
    if (text.toUpperCase().includes('[LEAVE]')) return { action: 'leave' };
    return null;
}

async function generateDynamicNPC(destName, listingsContext) {
    const systemPrompt = `
أنت زائر خيالي (NPC) في سوق قوافل يقع في "${destName}".
المطلوب إرجاع JSON فقط:
{
  "name": "اسم خيالي لك",
  "emoji": "إيموجي يمثلك",
  "persona": "وصف لطبيعتك (كريم، بخيل، خبيث، الخ)",
  "message": "جملة واحدة فقط (مختصرة جداً) تفتتح بها المفاوضة على أحد هذه العناصر."
}

السلع المتاحة:
${listingsContext}
`;

    const response = await callAI(systemPrompt, "توليد", true);
    if (!response) return null;

    try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) return JSON.parse(jsonMatch[0]);
        return JSON.parse(response);
    } catch (e) {
        return null;
    }
}

async function handleNpcHaggle(client, db, thread, conv, userMessageStr, ownerId) {
    const availableListings = conv.listings.filter(l => (Number(l.quantity) - Number(l.quantitysold || l.quantitySold || 0)) > 0);

    if (availableListings.length === 0) return { message: 'نفذت بضائعك! لا يوجد ما يستحق الشراء.', action: { action: 'leave' } };

    const listingsContext = availableListings.map(l => {
        const info = getItemInfo(l.itemid || l.itemID);
        const avail = Number(l.quantity) - Number(l.quantitysold || l.quantitySold || 0);
        const price = Number(l.priceperunit || l.pricePerUnit);
        const basePrice = getBasePrice(l.itemid || l.itemID, info);
        return `- ${info.name} (رقمها: ${l.id}) | متوفر: ${avail} | طلب اللاعب: ${price} مورا | السعر الأصلي: ${basePrice} مورا`;
    }).join('\n');

    const lastExchange = conv.history.slice(-4).map(e => `${e.role === 'assistant' ? conv.name : 'البائع'}: ${e.content}`).join('\n');

    const systemPrompt = `
أنت: ${conv.name} (${conv.persona}) في ${conv.destName}.
قواعد عسكرية صارمة (الالتزام بها إجباري):
1. أجب بجملة واحدة فقط! (أقل من 15 كلمة). ممنوع منعاً باتاً كتابة فقرات أو جرائد.
2. لا تشتري إذا كان السعر المطلوب من اللاعب أعلى من (السعر الأصلي) بضعفين. افضحه أو كاسره.
3. إذا وافقت على السعر وأردت الشراء، يجب أن تضع هذا الكود في نهاية رسالتك:
[BUY_ITEM:رقم_السلعة:الكمية:السعر_النهائي]
4. إذا غضبت وقررت الرحيل، ضع: [LEAVE]

البضائع المتوفرة:
${listingsContext}
`;

    const aiMessage = `سياق الحديث:\n${lastExchange}\n\nالبائع يقول:\n${userMessageStr}\n\nرد بجملة واحدة فقط:`;

    const response = await callAI(systemPrompt, aiMessage, false);
    if (!response) return { message: '...', action: null };

    const action = parseNpcAction(response);
    const cleanMessage = response.replace(/\[BUY_ITEM:.*?\]/gi, '').replace(/\[LEAVE\]/gi, '').trim();

    if (action?.action === 'buy') {
        // حماية ذكية: إذا أخطأ الذكاء الاصطناعي برقم السلعة وهناك سلعة واحدة فقط، نختارها تلقائياً!
        let listing = availableListings.find(l => Number(l.id) === Number(action.listingId));
        if (!listing && availableListings.length === 1) listing = availableListings[0];

        if (!listing) {
            return { message: cleanMessage || 'يبدو أنني أخطأت في رقم السلعة، هل بعتها؟', action: null };
        }

        const npcMoraBudget = 50000 + Math.floor(Math.random() * 500000); 
        const totalPrice = action.quantity * action.offeredPrice;

        if (totalPrice > npcMoraBudget) {
            return {
                message: cleanMessage || `ميزانيتي لا تسمح بهذا المبلغ الخيالي! إلى اللقاء.`,
                action: { action: 'leave' },
            };
        }

        return {
            message: cleanMessage || `تم الاتفاق.`,
            action: {
                type: 'purchase',
                listingId: listing.id,
                quantity: Math.min(action.quantity, Number(listing.quantity) - Number(listing.quantitysold || listing.quantitySold || 0)),
                pricePerUnit: action.offeredPrice,
                buyerId: 'npc_' + conv.destId,
                sellerId: ownerId,
                guildId: listing.guildid || listing.guildID,
                itemId: listing.itemid || listing.itemID,
            },
        };
    }

    return { message: cleanMessage, action };
}

// ============================================================================
// [4] واجهة التفاعل (UI/UX)
// ============================================================================
async function processNpcTurn(conv, userMessage, interaction, client, db) {
    conv.history.push({ role: 'user', content: userMessage });

    // تصميم التحديث الحي للمفاوضة
    const embed = new EmbedBuilder()
        .setColor('#E67E22') // لون برتقالي يميل للـ RPG
        .setAuthor({ name: `مفاوضة نشطة مع ${conv.name}`, iconURL: 'https://cdn.discordapp.com/emojis/1150000000000000000.png' }) // اترك الأيقونة فارغة أو ضع رابط أيقونة مناسبة
        .setDescription(
            `🗣️ **أنت:**\n> ${userMessage}\n\n` +
            `💭 **${conv.name}** يقرأ كلامك ويفكر...`
        );
        
    await conv.message.edit({ embeds: [embed] }).catch(()=>{});

    const thread = interaction.channel;
    conv.listings = await getListingsBySession(db, thread.id);

    const result = await handleNpcHaggle(client, db, thread, conv, userMessage, conv.ownerId);

    if (!result) {
        embed.setColor('#E74C3C').setDescription(`🗣️ **أنت:**\n> ${userMessage}\n\n⚠️ غادر **${conv.name}** بسبب صمت مفاجئ!`).setFooter({text:'انتهت المحادثة'});
        await conv.message.edit({ embeds: [embed], components: [] }).catch(()=>{});
        conv.active = false;
        return;
    }

    conv.history.push({ role: 'assistant', content: result.message });

    embed.setColor('#2980B9')
         .setDescription(
             `🗣️ **أنت:**\n> ${userMessage}\n\n` +
             `${conv.emoji} **${conv.name}:**\n> ${result.message}`
         );

    if (result.action?.action === 'leave') {
        embed.setColor('#E74C3C').setFooter({ text: '🏃 غادر المشتري السوق ولم تكتمل الصفقة.' });
        await conv.message.edit({ embeds: [embed], components: [] }).catch(()=>{});
        conv.active = false;
    }
    else if (result.action?.type === 'purchase') {
        const a = result.action;
        const purchaseResult = await buyItem(
            db, a.listingId, a.buyerId, a.sellerId, a.guildId,
            a.itemId, a.quantity, a.pricePerUnit, 'npc', client
        );

        if (purchaseResult.ok) {
            const itemInfo = getItemInfo(a.itemId);
            embed.setColor('#2ECC71')
                 .setTitle(`🤝 صفقة ناجحة!`)
                 .setFooter({ text: `💰 بعت ${a.quantity}x ${itemInfo.name} بـ ${(a.quantity * a.pricePerUnit).toLocaleString()} مورا` });
            
            await conv.message.edit({ embeds: [embed], components: [] }).catch(()=>{});

            // تحديث لوحة السوق الرئيسية (Canvas)
            const freshListings = await getListingsBySession(db, thread.id);
            const session = await getSessionByThread(db, thread.id);
            const dest = caravanConfig.destinations.find(d => d.id === (session?.destinationid || session?.destinationId));
            
            await updateMarketMessage(thread, freshListings, dest);
            
            if (interaction.isModalSubmit && interaction.isModalSubmit()) {
                await interaction.followUp({ content: `✅ مبروك! كسبت **${(a.quantity * a.pricePerUnit).toLocaleString()}** مورا!`, flags: [MessageFlags.Ephemeral] }).catch(()=>{});
            } else {
                await thread.send({ content: `✅ <@${conv.ownerId}> كسبت **${(a.quantity * a.pricePerUnit).toLocaleString()}** مورا من التاجر!`, flags: [MessageFlags.Ephemeral] }).catch(()=>{});
            }
        } else {
             embed.setColor('#E74C3C').setFooter({ text: `❌ فشلت الصفقة: ${purchaseResult.error}` });
             await conv.message.edit({ embeds: [embed], components: [] }).catch(()=>{});
        }
        conv.active = false;
    }
    else {
        embed.setFooter({ text: 'استخدم الأزرار لإكمال التفاوض أو الموافقة.' });
        await conv.message.edit({ embeds: [embed] }).catch(()=>{});
    }
}

// ============================================================================
// [5] نظام التشغيل والإدارة
// ============================================================================
async function spawnNpc(client, db, thread, destId, ownerId, guildId) {
    try {
        const npcSpawnCount = await getNpcSpawnCount(db, thread.id);
        if (npcSpawnCount >= 3) return; 

        const listings = await getListingsBySession(db, thread.id);
        const availableListings = listings.filter(l => (Number(l.quantity) - Number(l.quantitysold || l.quantitySold || 0)) > 0);

        if (availableListings.length === 0) return;

        const destName = caravanConfig.destinations.find(d => d.id === destId)?.name || 'سوق القوافل';
        const listingsContext = availableListings.map(l => {
            const info = getItemInfo(l.itemid || l.itemID);
            const price = Number(l.priceperunit || l.pricePerUnit);
            const basePrice = getBasePrice(l.itemid || l.itemID, info);
            return `- ${info.name} (رقم السلعة: ${l.id}): السعر المعروض: ${price} | السعر الأساسي: ${basePrice}`;
        }).join('\n');

        const npcData = await generateDynamicNPC(destName, listingsContext);
        if (!npcData || !npcData.name) return;

        await incrementNpcSpawn(db, thread.id);

        const convId = `conv_${thread.id}_${Date.now()}`;
        
        const embed = new EmbedBuilder()
            .setColor('#2980B9')
            .setTitle(`${npcData.emoji} زائر يقترب من بضاعتك: ${npcData.name}`)
            .setDescription(`> "${npcData.message}"\n\n— *${npcData.persona}*`)
            .setFooter({ text: 'استخدم الأزرار للرد عليه أو الموافقة' });

        const npcMsg = await thread.send({
            content: `يا <@${ownerId}>، هنالك مشترٍ يريد التحدث معك! 🔔`,
            embeds: [embed]
        }).catch(() => null);

        if (!npcMsg) return;

        NpcConversations.set(convId, {
            id: convId, name: npcData.name, emoji: npcData.emoji || '👤',
            persona: npcData.persona, destId, destName, ownerId, guildId, listings,
            message: npcMsg, 
            history: [{ role: 'assistant', content: npcData.message }],
            active: true,
        });

        const negotiateBtn = new ButtonBuilder().setCustomId(`mkt_npc_talk_${convId}`).setLabel('💬 فاوض').setStyle(ButtonStyle.Primary);
        const acceptBtn = new ButtonBuilder().setCustomId(`mkt_npc_accept_${convId}`).setLabel('✅ موافق، اشترِ').setStyle(ButtonStyle.Success);
        const declineBtn = new ButtonBuilder().setCustomId(`mkt_npc_reject_${convId}`).setLabel('❌ طرد المشتري').setStyle(ButtonStyle.Danger);

        await npcMsg.edit({ components: [new ActionRowBuilder().addComponents(negotiateBtn, acceptBtn, declineBtn)] }).catch(() => {});

        const collector = npcMsg.createMessageComponentCollector({
            filter: i => i.user.id === ownerId,
            time: 15 * 60 * 1000, 
        });

        collector.on('collect', async i => {
            if (i.customId === `mkt_npc_reject_${convId}`) {
                await i.deferUpdate().catch(() => {});
                const rejectEmbed = new EmbedBuilder().setColor('#E74C3C').setDescription(`🏃 قمت بطرد **${npcData.name}** من السوق.`);
                await npcMsg.edit({ embeds: [rejectEmbed], components: [] }).catch(()=>{});
                NpcConversations.delete(convId);
                collector.stop();
                return;
            }

            const conv = NpcConversations.get(convId);
            if (!conv || !conv.active) return i.reply({ content: '❌ لقد غادر هذا المشتري.', flags: [MessageFlags.Ephemeral] });

            if (i.customId === `mkt_npc_accept_${convId}`) {
                await i.deferUpdate().catch(() => {});
                await processNpcTurn(conv, "أنا موافق على سعرك! قم بإنهاء الصفقة حالاً باستخدام كود الشراء.", i, client, db);
            }

            if (i.customId === `mkt_npc_talk_${convId}`) {
                const modal = new ModalBuilder().setCustomId(`mkt_npc_modal_${convId}`).setTitle(`التحدث مع: ${npcData.name}`.substring(0, 45));
                const replyInput = new TextInputBuilder().setCustomId('user_reply').setLabel('ردك (جملة قصيرة):').setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(replyInput));
                await i.showModal(modal);
            }
        });

    } catch (err) {
        console.error('[spawnNpc Error]', err);
    }
}

async function handleNpcModalSubmit(interaction, client, db) {
    if (!interaction.customId.startsWith('mkt_npc_modal_')) return false;

    const convId = interaction.customId.replace('mkt_npc_modal_', '');
    const conv = NpcConversations.get(convId);
    
    if (!conv || !conv.active) {
        await interaction.reply({ content: '❌ المحادثة انتهت أو المشتري غادر.', flags: [MessageFlags.Ephemeral] });
        return true;
    }

    await interaction.deferUpdate().catch(() => {});
    const userMessage = interaction.fields.getTextInputValue('user_reply');
    
    await processNpcTurn(conv, userMessage, interaction, client, db);

    return true;
}

function scheduleNpcSpawn(client, db, thread, dest, ownerId, guildId, marketDurationMs) {
    const destId = dest.id;
    const npcCount = 1 + Math.floor(Math.random() * 2);

    for (let i = 0; i < npcCount; i++) {
        const delay = (marketDurationMs * 0.1) + Math.random() * (marketDurationMs * 0.7);
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
    handleNpcModalSubmit, 
    NpcConversations,
    cleanupNpcConversations,
};
