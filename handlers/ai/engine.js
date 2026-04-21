const { getEmojiContext } = require('./emojis'); 
const aiActionHandler = require('../../utils/aiActionHandler'); 
require('dotenv').config();

// 🚀 أذكى النماذج المجانية المفتوحة (لن تكلفك قرشاً واحداً)
const OPENROUTER_MODELS = [
    "meta-llama/llama-3-8b-instruct:free", // سريع وذكي جداً في المحادثات
    "google/gemma-2-9b-it:free",           // نموذج جوجل المفتوح (كبديل)
    "mistralai/mistral-7b-instruct:free"   // احتياطي ثالث
];

const chatSessions = {}; 
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function getAllowedEmojiIds() {
    const context = getEmojiContext(); 
    const matches = context.match(/:(\d+)>/g); 
    if (!matches) return [];
    return matches.map(m => m.replace(/[:>]/g, '')); 
}

const ALLOWED_EMOJI_IDS = getAllowedEmojiIds();

function enforceSingleEmoji(text) {
    if (!text) return "";
    let cleanText = text.replace(/(\p{Emoji_Presentation}|\p{Extended_Pictographic})/gu, '');

    const customEmojiRegex = /<a?:\w+:(\d+)>/g;
    const foundEmojis = [];
    let match;
    
    while ((match = customEmojiRegex.exec(text)) !== null) {
        const fullEmoji = match[0];
        const emojiId = match[1];
        
        if (ALLOWED_EMOJI_IDS.includes(emojiId)) {
            foundEmojis.push(fullEmoji);
        }
    }

    cleanText = cleanText.replace(customEmojiRegex, '').trim();

    if (foundEmojis.length > 0) {
        const lastValidEmoji = foundEmojis[foundEmojis.length - 1];
        return `${cleanText} ${lastValidEmoji}`;
    }

    return cleanText;
}

async function processAiActions(responseText, messageObject) {
    if (!responseText) return "";
    const actionRegex = /\[ACTION:([A-Z_]+)(?::(\w+))?\]/g;
    let match;
    let cleanText = responseText;

    while ((match = actionRegex.exec(responseText)) !== null) {
        const fullTag = match[0]; 
        await aiActionHandler.executeActions(messageObject, fullTag);
        cleanText = cleanText.replace(fullTag, '');
    }

    return cleanText.trim();
}

async function generateResponse(apiKey, systemInstruction, userMessage, userData, userId, username, imageAttachment, isNsfw, messageObject, channelId) {
    // استخدام مفتاح OpenRouter بدلاً من Gemini
    const openRouterKey = process.env.OPENROUTER_API_KEY;
    if (!openRouterKey) return "⚠️ مفتاح OpenRouter (OPENROUTER_API_KEY) مفقود في ملف .env!";

    const sessionKey = `${channelId}-SFW`; 
    const totalWealth = (userData.balance || 0) + (userData.bank || 0);

    const contextInfo = `
    [Current Speaker Stats]:
    - User ID: ${userId}
    - Name: ${username}
    - Cash: ${userData.balance || 0} Mora
    - Bank: ${userData.bank || 0} Mora
    - Total Wealth: ${totalWealth} Mora
    - Level: ${userData.level || 1}
    - Streak: ${userData.streak || 0}
    `;

    // 🧠 بناء السجل السحري للمحادثة
    if (!chatSessions[sessionKey]) {
        chatSessions[sessionKey] = [
            { role: "system", content: systemInstruction || "أنت مساعد ذكي." },
            { role: "user", content: "[SYSTEM: GROUP CHAT STARTED] Mode: SFW. Treat users based on their ID. Multiple users may speak." },
            { role: "assistant", content: "همم.. أنا أستمع لكم جميعاً. 👑" }
        ];
    }

    // تنظيف الذاكرة إذا طالت المحادثة (حفظ التوكنات)
    if (chatSessions[sessionKey].length > 15) {
        chatSessions[sessionKey].splice(3, 2); 
    }

    const fullMessage = `${contextInfo}\n\n[User: ${username} | ID: ${userId}]: ${userMessage || "مرحباً"}`;
    
    let userMessageContent = fullMessage;
    // دعم الصور في حال كان النموذج المفتوح يدعمها (الرؤية)
    if (imageAttachment) {
        userMessageContent = [
            { type: "text", text: fullMessage },
            { type: "image_url", image_url: { url: imageAttachment.url } }
        ];
    }

    chatSessions[sessionKey].push({ role: "user", content: userMessageContent });

    // 🚀 الإطلاق نحو نماذج OpenRouter
    for (const modelName of OPENROUTER_MODELS) {
        try {
            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${openRouterKey}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: modelName,
                    messages: chatSessions[sessionKey],
                    max_tokens: 500 // للحد من الإطالة
                })
            });

            if (!response.ok) {
                const errorData = await response.text();
                throw new Error(`[${response.status}] ${errorData}`);
            }

            const data = await response.json();
            let responseText = data.choices[0].message.content;

            // حفظ رد البوت في الذاكرة لفهم السياق في الرسائل القادمة
            chatSessions[sessionKey].push({ role: "assistant", content: responseText });

            responseText = await processAiActions(responseText, messageObject);
            return enforceSingleEmoji(responseText);

        } catch (error) {
            console.warn(`⚠️ [OpenRouter] ${modelName} failed: ${error.message.split('\n')[0]}`);
            
            if (modelName === OPENROUTER_MODELS[OPENROUTER_MODELS.length - 1]) {
                if (chatSessions[sessionKey]) delete chatSessions[sessionKey];
                return "🌑 ... ";
            }
            await sleep(2000); 
        }
    }
}

// تنظيف الجلسات لتخفيف الذاكرة
setInterval(() => {
    const keys = Object.keys(chatSessions);
    if (keys.length > 0) {
        console.log(`[AI Engine] Cleaning ${keys.length} OpenRouter sessions...`);
        keys.forEach(key => delete chatSessions[key]);
    }
}, 3600000); 

module.exports = { generateResponse };
