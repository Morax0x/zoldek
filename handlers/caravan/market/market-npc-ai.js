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

// 👑 دالة الاتصال المباشر بـ Gemini 👑
async function callGeminiDirect(apiKey, systemPrompt, userMessage, jsonMode = false) {
    try {
        const payload = {
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: 'user', parts: [{ text: userMessage }] }],
            generationConfig: { temperature: 0.85 },
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

// 👑 دالة الاتصال المباشر بـ OpenAI 👑
async function callOpenAIDirect(apiKey, systemPrompt, userMessage, jsonMode = false) {
    try {
        const payload = {
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMessage },
            ],
            temperature: 0.85,
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

// 👑 المحرك الرئيسي للذكاء الاصطناعي 👑
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

// 👑 التقاط الأوامر السرية من الذكاء الاصطناعي 👑
function parseNpcAction(text) {
    const buyMatch = text.match(/\[BUY_ITEM:\s*(\d+)\s*:\s*(\d+)\s*:\s*(\d+)\s*\]/);
    if (buyMatch) {
        return {
            action: 'buy',
            listingId: parseInt(buyMatch[1]),
            quantity: parseInt(buyMatch[2]),
            offeredPrice: parseInt(buyMatch[3]),
        };
    }
    if (text.includes('[LEAVE]')) return { action: 'leave' };
    return null;
}

// 👑 توليد شخصية التاجر الآلي 👑
async function generateDynamicNPC(destName, listingsContext) {
    const systemPrompt = `
أنت تلعب دور زائر خيالي (NPC) في لعبة RPG، وتزور سوق قوافل يقع في منطقة تسمى "${destName}".
المطلوب منك:
1. اختراع اسم خيالي مناسب لك كشخصية.
2. اختيار إيموجي واحد فقط يمثل مظهرك.
3. اختراع شخصية وأسلوب كلام فريد (مثلاً: عجوز بخيل، نبيل مغرور، محارب أحمق، ساحر غامض).
4. كتابة رسالة افتتاحية قصيرة باللغة العربية للبائع (اللاعب)، اذكر فيها عنصراً لفت انتباهك من القائمة، وقدم له عرضاً بسعر أقل من المعروض للمفاوضة.

البضائع المتاحة أمامي الآن:
${listingsContext}

يجب أن يكون ردك حصراً بصيغة JSON متوافقة، كالتالي:
{
  "name": "اسمك",
  "emoji": "إيموجي",
  "persona": "وصف دقيق لأسلوبك في التفاوض وطريقة كلامك",
  "message": "رسالتك الافتتاحية للاعب"
}`;

    const response = await callAI(systemPrompt, "ابدأ بتوليد الشخصية.", true);
    if (!response) return null;

    try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) return JSON.parse(jsonMatch[0]);
        return JSON.parse(response);
    } catch (e) {
        return null;
    }
}

// 👑 معالجة مفاوضات الـ AI 👑
async function handleNpcHaggle(client, db, thread, conv, userMessageStr, ownerId) {
    const availableListings = conv.listings.filter(l => (Number(l.quantity) - Number(l.quantitysold || l.quantitySold || 0)) > 0);

    if (availableListings.length === 0) return { message: 'لقد نفذت جميع البضائع التي أردتها!', action: { action: 'leave' } };

    const listingsContext = availableListings.map(l => {
        const info = getItemInfo(l.itemid || l.itemID);
        const avail = Number(l.quantity) - Number(l.quantitysold || l.quantitySold || 0);
        const price = Number(l.priceperunit || l.pricePerUnit);
        return `- ${info.name} (رقم السلعة: ${l.id}): متوفر ${avail} حبة | السعر المعروض: ${price} مورا`;
    }).join('\n');

    const lastExchange = conv.history.slice(-4).map(e => `${e.role === 'assistant' ? conv.name : 'البائع'}: ${e.content}`).join('\n');

    const systemPrompt = `
أنت تلعب دور شخصية في سوق قوافل. 
اسمك: ${conv.name}
شخصيتك وأسلوبك: ${conv.persona}
المنطقة: ${conv.destName}

قواعد صارمة:
- ممنوع ذكر أنك ذكاء اصطناعي أو AI، تصرف كشخصية حقيقية تتنفس.
- تفاوض بذكاء. البائع أرسل لك رسالة، رد عليه برد مناسب (جملتين كحد أقصى).
- إذا وافق البائع على سعرك أو اقتنعت أنت وقررت الشراء، يجب أن تنهي رسالتك بهذا الكود بالضبط لإنهاء الصفقة برمجياً:
[BUY_ITEM:رقم_السلعة:الكمية:السعر_للوحدة]
- إذا أغضبك البائع وقررت الرحيل وعدم الشراء، أنهِ رسالتك بهذا الكود:
[LEAVE]

البضائع المتاحة للبيع الآن:
${listingsContext}
`;

    const aiMessage = `الرسائل السابقة:\n${lastExchange}\n\nرد البائع الآن:\n${userMessageStr}\n\nما هو ردك؟`;

    const response = await callAI(systemPrompt, aiMessage, false);
    if (!response) return { message: '...', action: null };

    const action = parseNpcAction(response);
    const cleanMessage = response.replace(/\[BUY_ITEM:.*?\]/g, '').replace(/\[LEAVE\]/g, '').trim();

    if (action?.action === 'buy') {
        const listing = availableListings.find(l => l.id === action.listingId);
        if (!listing) return { message: cleanMessage || 'أردت الشراء لكن السلعة اختفت!', action: null };

        const npcMoraBudget = 20000 + Math.floor(Math.random() * 300000); 
        const totalPrice = action.quantity * action.offeredPrice;

        if (totalPrice > npcMoraBudget) {
            return {
                message: cleanMessage || `اللعنة، لا أملك سوى **${npcMoraBudget.toLocaleString()}** مورا! سأنسحب.`,
                action: { action: 'leave' },
            };
        }

        return {
            message: cleanMessage || `اتفقنا! سآخذ ${action.quantity} بسعر ${action.offeredPrice} للواحدة.`,
            action: {
                type: 'purchase',
                listingId: action.listingId,
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

// 👑 معالجة التفاعل الحي وتحديث نفس الإمبيد 👑
async function processNpcTurn(conv, userMessage, interaction, client, db) {
    conv.history.push({ role: 'user', content: userMessage });

    // 1. تحديث الإمبيد ليظهر رسالة اللاعب وحالة تفكير البوت
    const embed = new EmbedBuilder()
        .setColor('#3498DB')
        .setTitle(`${conv.emoji} مفاوضة مع: ${conv.name}`)
        .setDescription(`🗣️ **أنت:** "${userMessage}"\n\n💭 **${conv.name}** يقرأ كلامك ويفكر...`);
        
    await conv.message.edit({ embeds: [embed] }).catch(()=>{});

    const thread = interaction.channel;
    conv.listings = await getListingsBySession(db, thread.id);

    // 2. إرسال المحادثة للذكاء الاصطناعي
    const result = await handleNpcHaggle(client, db, thread, conv, userMessage, conv.ownerId);

    if (!result) {
        embed.setColor('#E74C3C').setDescription(`🗣️ **أنت:** "${userMessage}"\n\n⚠️ غادر **${conv.name}** بسبب صمت مفاجئ!`).setFooter({text:'انتهت المحادثة'});
        await conv.message.edit({ embeds: [embed], components: [] }).catch(()=>{});
        conv.active = false;
        return;
    }

    conv.history.push({ role: 'assistant', content: result.message });

    // 3. تحديث الإمبيد برد الذكاء الاصطناعي النهائي
    embed.setColor('#9B59B6').setDescription(`🗣️ **أنت:** "${userMessage}"\n\n**${conv.name}:** "${result.message}"`);

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
                 .setTitle(`🤝 اتفقنا! صفقة ناجحة!`)
                 .setFooter({ text: `💰 تم بيع ${a.quantity} من ${itemInfo.name} بـ ${(a.quantity * a.pricePerUnit).toLocaleString()} مورا`});
            
            await conv.message.edit({ embeds: [embed], components: [] }).catch(()=>{});

            // تحديث واجهة السوق الفخمة بصورة Canvas
            const freshListings = await getListingsBySession(db, thread.id);
            const session = await getSessionByThread(db, thread.id);
            const dest = caravanConfig.destinations.find(d => d.id === (session?.destinationid || session?.destinationId));
            
            await updateMarketMessage(thread, freshListings, dest);
            
            // إرسال رد مخفي للاعب لتأكيد استلام الأموال
            if (interaction.isModalSubmit && interaction.isModalSubmit()) {
                await interaction.followUp({ content: `✅ كفو! كسبت **${(a.quantity * a.pricePerUnit).toLocaleString()}** مورا من التاجر!`, flags: [MessageFlags.Ephemeral] }).catch(()=>{});
            }
        } else {
             embed.setColor('#E74C3C').setFooter({ text: `❌ فشلت الصفقة: ${purchaseResult.error}` });
             await conv.message.edit({ embeds: [embed], components: [] }).catch(()=>{});
        }
        conv.active = false;
    }
    else {
        // إذا كان تفاوض عادي، نترك الأزرار
        embed.setFooter({ text: 'استخدم الأزرار بالأسفل لإكمال التفاوض أو الرد.' });
        await conv.message.edit({ embeds: [embed] }).catch(()=>{});
    }
}

// 👑 إطلاق الـ NPC في السوق مع رسالة المنشن 👑
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
            return `- ${info.name} (رقم السلعة: ${l.id}): السعر المعروض: ${price} مورا`;
        }).join('\n');

        const npcData = await generateDynamicNPC(destName, listingsContext);
        if (!npcData || !npcData.name) return;

        await incrementNpcSpawn(db, thread.id);

        const convId = `conv_${thread.id}_${Date.now()}`;
        
        // الرسالة الافتتاحية للمحادثة
        const embed = new EmbedBuilder()
            .setColor('#9B59B6')
            .setTitle(`${npcData.emoji} زائر يقترب من بضاعتك: ${npcData.name}`)
            .setDescription(`**${npcData.name}:** "${npcData.message}"`)
            .setFooter({ text: 'استخدم الأزرار للرد عليه أو طرده' });

        const npcMsg = await thread.send({
            content: `يا <@${ownerId}>، هنالك مشترٍ يريد التحدث معك! 🔔`,
            embeds: [embed]
        }).catch(() => null);

        if (!npcMsg) return;

        NpcConversations.set(convId, {
            id: convId, name: npcData.name, emoji: npcData.emoji || '👤',
            persona: npcData.persona, destId, destName, ownerId, guildId, listings,
            message: npcMsg, // 👑 حفظ الرسالة الأصلية للتعديل عليها لاحقاً
            history: [{ role: 'assistant', content: npcData.message }],
            active: true,
        });

        const negotiateBtn = new ButtonBuilder().setCustomId(`mkt_npc_talk_${convId}`).setLabel('💬 فاوض / تحدث').setStyle(ButtonStyle.Primary);
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
                // إرسال رسالة خفية للذكاء الاصطناعي للموافقة وإتمام البيع تلقائياً
                await processNpcTurn(conv, "أنا موافق على سعرك، تفضل البضاعة وأتمم الشراء.", i, client, db);
            }

            if (i.customId === `mkt_npc_talk_${convId}`) {
                const modal = new ModalBuilder().setCustomId(`mkt_npc_modal_${convId}`).setTitle(`التحدث مع: ${npcData.name}`.substring(0, 45));
                const replyInput = new TextInputBuilder().setCustomId('user_reply').setLabel('ماذا تريد أن تقول له؟').setPlaceholder('اكتب ردك ومفاوضتك هنا...').setStyle(TextInputStyle.Paragraph).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(replyInput));
                await i.showModal(modal);
            }
        });

    } catch (err) {
        console.error('[spawnNpc Error]', err);
    }
}

// 👑 التقاط ردود المودل من ملف التفاعل الرئيسي 👑
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
    
    // تشغيل نظام التحديث الحي على الإمبيد
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
