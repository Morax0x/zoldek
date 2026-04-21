const { GoogleGenerativeAI } = require("@google/generative-ai");
const { getEmojiContext } = require('./emojis'); 
const aiActionHandler = require('../../utils/aiActionHandler'); 
require('dotenv').config();

const MODELS = [
    "gemini-2.0-flash",        
    "gemini-1.5-flash",        
    "gemini-1.5-pro"
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

async function urlToGenerativePart(url, mimeType) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
        const arrayBuffer = await response.arrayBuffer();
        return {
            inlineData: {
                data: Buffer.from(arrayBuffer).toString("base64"),
                mimeType
            }
        };
    } catch (error) {
        console.error("Error processing image:", error.message);
        throw error; 
    }
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
    if (!apiKey) return "⚠️ مفتاح الخزينة (API Key) مفقود!";

    const genAI = new GoogleGenerativeAI(apiKey);
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

    // معالجة الصور
    if (imageAttachment) {
        for (const modelName of MODELS) {
            try {
                const model = genAI.getGenerativeModel({ 
                    model: modelName,
                    systemInstruction: { parts: [{ text: systemInstruction || "أنت مساعد ذكي." }], role: "model" }
                });

                const imagePart = await urlToGenerativePart(imageAttachment.url, imageAttachment.mimeType);
                
                const result = await model.generateContent([
                    contextInfo,
                    `[User: ${username} | ID: ${userId}]: ${userMessage || "ما رأيك في هذه الصورة؟"}`,
                    imagePart
                ]);

                let responseText = result.response.text();
                responseText = await processAiActions(responseText, messageObject);
                return enforceSingleEmoji(responseText);

            } catch (error) {
                console.warn(`⚠️ [Image AI] ${modelName} failed: ${error.message}`);
                if (modelName === MODELS[MODELS.length - 1]) return "عذراً، لم أتمكن من رؤية الصورة بوضوح.";
                await sleep(2000);
            }
        }
    }

    // معالجة النصوص والمحادثات المستمرة
    for (const modelName of MODELS) {
        try {
            const model = genAI.getGenerativeModel({ 
                model: modelName,
                systemInstruction: { parts: [{ text: systemInstruction || "أنت مساعد ذكي." }], role: "model" }
            });

            if (!chatSessions[sessionKey]) {
                chatSessions[sessionKey] = model.startChat({
                    history: [
                        { 
                            role: "user", 
                            parts: [{ text: `[SYSTEM: GROUP CHAT STARTED] Mode: SFW. Treat users based on their ID. Multiple users may speak.` }] 
                        },
                        { 
                            role: "model", 
                            parts: [{ text: "همم.. أنا أستمع لكم جميعاً. 👑" }] 
                        }
                    ],
                });
            }

            const fullMessage = `${contextInfo}\n\n[User: ${username} | ID: ${userId}]: ${userMessage || "مرحباً"}`;
            const result = await chatSessions[sessionKey].sendMessage(fullMessage);
            
            let responseText = result.response.text();
            responseText = await processAiActions(responseText, messageObject);
            return enforceSingleEmoji(responseText);

        } catch (error) {
            if (chatSessions[sessionKey]) delete chatSessions[sessionKey];
            
            // تم إصلاح السطر أدناه لإظهار الخطأ الحقيقي
            console.warn(`⚠️ [Text AI] ${modelName} failed: ${error.message}`);

            if (error.message.includes("429")) { // Rate Limit
                await sleep(4000); 
                continue; 
            }
            if (error.message.includes("503")) { // Service Unavailable
                await sleep(2000); 
                continue;
            }

            if (modelName === MODELS[MODELS.length - 1]) {
                return "🌑 عـذرًا مـاذا قلـت؟ لم اسمعـك جيـدًا (خطأ في الاتصال)";
            }
        }
    }
}

// تنظيف الجلسات لتخفيف الذاكرة
setInterval(() => {
    const keys = Object.keys(chatSessions);
    if (keys.length > 0) {
        console.log(`[AI Engine] Cleaning ${keys.length} cached sessions...`);
        keys.forEach(key => delete chatSessions[key]);
    }
}, 3600000); 

module.exports = { generateResponse };
