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

// 👑 استدعاء نظام التحديث بالصور بدال القديم 👑
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

// 👑 دالة التقاط الأوامر السرية من الذكاء الاصطناعي 👑
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

// 👑 توليد شخصية عشوائية وتفاعلية بالكامل 👑
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
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        return JSON.parse(response);
    } catch (e) {
        return null;
    }
}

// 👑 معالجة مفاوضات الـ AI 👑
async function handleNpcHaggle(client, db, thread, conv, userMessageStr, ownerId) {
    const availableListings = conv.listings.filter(l => {
        const avail = Number(l.quantity) - Number(l.quantitysold || l.quantitySold || 0);
        return avail > 0;
    });

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
- ممنوع منعاً باتاً أن تذكر أنك ذكاء اصطناعي أو AI، تصرف كشخصية حقيقية تتنفس.
- تفاوض بذكاء وواقعية بناءً على شخصيتك. إذا كنت بخيلاً، كاسر بشراسة. إذا كنت نبيلاً، ادفع لكن بتكبر.
- البائع الآن أرسل لك رسالة، رد عليه برد مناسب (جملتين كحد أقصى).
- إذا اقتنعت بالسعر وقررت الشراء، يجب أن تنهي رسالتك بهذا الكود بالضبط (استبدل القيم بالأرقام):
[BUY_ITEM:رقم_السلعة:الكمية:السعر_للوحدة]
- إذا أغضبك البائع أو رفضت إكمال التفاوض وقررت الرحيل، أنهِ رسالتك بهذا الكود:
[LEAVE]

البضائع المتاحة للبيع الآن:
${listingsContext}
`;

    const aiMessage = `الرسائل السابقة:\n${lastExchange}\n\nرد البائع الآن:\n${userMessageStr}\n\nما هو ردك؟`;

    const response = await callAI(systemPrompt, aiMessage, false);
    if (!response) return { message: 'يبدو أن التاجر يفكر بعمق ولم ينطق بحرف...', action: null };

    const action = parseNpcAction(response);
    const cleanMessage = response.replace(/\[BUY_ITEM:.*?\]/g, '').replace(/\[LEAVE\]/g, '').trim();

    if (action?.action === 'buy') {
        const listing = availableListings.find(l => l.id === action.listingId);
        if (!listing) return { message: cleanMessage || 'أردت الشراء لكن السلعة اختفت!', action: null };

        const npcMoraBudget = 20000 + Math.floor(Math.random() * 300000); 
        const totalPrice = action.quantity * action.offeredPrice;

        if (totalPrice > npcMoraBudget) {
            return {
                message: cleanMessage || `اللعنة، لقد تحمست، لا أملك سوى **${npcMoraBudget.toLocaleString()}** مورا! سأنسحب.`,
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

// 👑 إطلاق الـ NPC في السوق مع المنشن 👑
async function spawnNpc(client, db, thread, destId, ownerId, guildId) {
    try {
        const npcSpawnCount = await getNpcSpawnCount(db, thread.id);
        if (npcSpawnCount >= 3) return; 

        const listings = await getListingsBySession(db, thread.id);
        const availableListings = listings.filter(l => {
            const avail = Number(l.quantity) - Number(l.quantitysold || l.quantitySold || 0);
            return avail > 0;
        });

        if (availableListings.length === 0) return;

        const destName = caravanConfig.destinations.find(d => d.id === destId)?.name || 'سوق القوافل';

        const listingsContext = availableListings.map(l => {
            const info = getItemInfo(l.itemid || l.itemID);
            const avail = Number(l.quantity) - Number(l.quantitysold || l.quantitySold || 0);
            const price = Number(l.priceperunit || l.pricePerUnit);
            return `- ${info.name} (رقم السلعة: ${l.id}): متوفر ${avail} حبة | السعر المعروض: ${price} مورا`;
        }).join('\n');

        const npcData = await generateDynamicNPC(destName, listingsContext);
        if (!npcData || !npcData.name) return;

        await incrementNpcSpawn(db, thread.id);

        const convId = `conv_${thread.id}_${Date.now()}`;
        NpcConversations.set(convId, {
            id: convId,
            name: npcData.name,
            emoji: npcData.emoji || '👤',
            persona: npcData.persona,
            destId,
            destName,
            ownerId,
            guildId,
            listings,
            history: [{ role: 'assistant', content: npcData.message }],
            active: true,
        });

        // 👑 وضع المنشن مع الإشعار 👑
        const npcMsg = await thread.send({
            content: `يا <@${ownerId}>، هنالك مشترٍ يريد التحدث معك! 🔔`,
            embeds: [new EmbedBuilder()
                .setColor('#9B59B6')
                .setTitle(`${npcData.emoji} زائر يقترب من بضاعتك: ${npcData.name}`)
                .setDescription(`**${npcData.name}:** "${npcData.message}"`)
                .setFooter({ text: 'استخدم زر المفاوضة للرد عليه أو طرده' })]
        }).catch(() => null);

        if (!npcMsg) return;

        const negotiateBtn = new ButtonBuilder()
            .setCustomId(`mkt_npc_talk_${convId}`)
            .setLabel('💬 فاوض / رد عليه')
            .setStyle(ButtonStyle.Primary);

        const declineBtn = new ButtonBuilder()
            .setCustomId(`mkt_npc_reject_${convId}`)
            .setLabel('❌ طرد المشتري')
            .setStyle(ButtonStyle.Danger);

        await npcMsg.edit({
            components: [new ActionRowBuilder().addComponents(negotiateBtn, declineBtn)]
        }).catch(() => {});

        const collector = npcMsg.createMessageComponentCollector({
            filter: i => i.user.id === ownerId,
            time: 15 * 60 * 1000, 
        });

        collector.on('collect', async i => {
            if (i.customId === `mkt_npc_reject_${convId}`) {
                await i.deferUpdate().catch(() => {});
                await thread.send(`🏃 غادر **${npcData.name}** السوق مستاءً.`).catch(()=>{});
                NpcConversations.delete(convId);
                collector.stop();
                return;
            }

            if (i.customId === `mkt_npc_talk_${convId}`) {
                const conv = NpcConversations.get(convId);
                if (!conv || !conv.active) {
                    return i.reply({ content: '❌ لقد غادر هذا المشتري.', flags: [MessageFlags.Ephemeral] });
                }

                const modal = new ModalBuilder()
                    .setCustomId(`mkt_npc_modal_${convId}`)
                    .setTitle(`التحدث مع: ${npcData.name}`.substring(0, 45));

                const replyInput = new TextInputBuilder()
                    .setCustomId('user_reply')
                    .setLabel('ماذا تريد أن تقول له؟')
                    .setPlaceholder('اكتب ردك ومفاوضتك هنا...')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true);

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
    conv.history.push({ role: 'user', content: userMessage });

    const thread = interaction.channel;
    
    const thinkingMsg = await thread.send({
        embeds: [new EmbedBuilder().setColor('#3498DB').setDescription(`💭 **${conv.name}** يقرأ كلامك ويفكر...`)]
    }).catch(()=>{});

    const updatedListings = await getListingsBySession(db, thread.id);
    conv.listings = updatedListings;

    const result = await handleNpcHaggle(client, db, thread, conv, userMessage, conv.ownerId);

    if (thinkingMsg) await thinkingMsg.delete().catch(()=>{});

    if (!result) {
        await thread.send(`⚠️ غادر **${conv.name}** بسبب صمت مفاجئ!`);
        conv.active = false;
        return true;
    }

    conv.history.push({ role: 'assistant', content: result.message });

    await thread.send({
        embeds: [new EmbedBuilder()
            .setColor('#9B59B6')
            .setDescription(`**${conv.name}:** "${result.message}"`)]
    }).catch(() => {});

    if (result.action?.action === 'leave') {
        await thread.send(`🏃 غادر **${conv.name}** السوق.`).catch(()=>{});
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
            await thread.send({
                embeds: [new EmbedBuilder()
                    .setColor('#00FF88')
                    .setTitle(`🤝 اتفقنا! صفقة ناجحة!`)
                    .setDescription(
                        `${conv.emoji} **${conv.name}** اشترى **${a.quantity}x ${itemInfo.name}**\n` +
                        `بمبلغ إجمالي: **${(a.quantity * a.pricePerUnit).toLocaleString()}** ${EMOJI_MORA}\n` +
                        `تم تحويل المبلغ لـ <@${conv.ownerId}>`
                    )]
            }).catch(() => {});

            const freshListings = await getListingsBySession(db, thread.id);
            const session = await getSessionByThread(db, thread.id);
            const dest = caravanConfig.destinations.find(d => d.id === (session?.destinationid || session?.destinationId));

            // 👑 استخدام الدالة الجديدة لتحديث صورة السوق 👑
            await updateMarketMessage(thread, freshListings, dest);
        }
        conv.active = false;
    }

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
