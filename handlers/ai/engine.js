const { getEmojiContext } = require('./emojis');
const aiActionHandler = require('../../utils/aiActionHandler');
require('dotenv').config();

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4o-mini"; // نموذج سريع جداً ورخيص ويدعم العربية بقوة

const chatSessions = {};
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const messageQueue = [];
let isProcessingQueue = false;
const userCooldowns = new Map();

// قللت وقت الطابور لأن OpenAI سريع جداً ويتحمل ضغط السيرفرات الكبيرة
const QUEUE_DELAY = 1000; 
const USER_COOLDOWN = 5000; 

function getAllowedEmojiIds() {
    const context = getEmojiContext();
    const matches = context.match(/:(\d+)>/g);
    if (!matches) return [];
    return matches.map(m => m.replace(/[:>]/g, ''));
}

const ALLOWED_EMOJI_IDS = getAllowedEmojiIds();

function enforceSingleEmoji(text) {
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

async function callOpenAI(apiKey, messages) {
    const response = await fetch(OPENAI_API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: MODEL,
            messages: messages,
            max_tokens: 1500,
            temperature: 0.7
        })
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`OpenAI API error ${response.status}: ${errText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content ?? "";
}

async function executeAI(passedApiKey, systemInstruction, userMessage, userData, userId, username, imageAttachment, isNsfw, messageObject, channelId) {
    // يسحب المفتاح تلقائياً من ريلواي عشان ما تضطر تعدل ملفات ثانية
    const apiKey = process.env.OPENAI_API_KEY || passedApiKey;
    
    if (!apiKey) return "⚠️ مفتاح الخزينة (OpenAI API Key) مفقود!";

    const sessionKey = `${channelId}-SFW`;
    const totalWealth = (userData.balance || 0) + (userData.bank || 0);

    const contextInfo = `
    [Current Speaker Stats]:
    - User ID: ${userId}
    - Name: ${username}
    - Cash: ${userData.balance} Mora
    - Bank: ${userData.bank || 0} Mora
    - Total Wealth: ${totalWealth} Mora
    - Level: ${userData.level}
    - Streak: ${userData.streak}
    `;

    // تجهيز الذاكرة إذا كانت محادثة جديدة
    if (!chatSessions[sessionKey]) {
        chatSessions[sessionKey] = [
            { role: "system", content: systemInstruction + "\n[SYSTEM: GROUP CHAT STARTED] Mode: SFW. Treat users based on their ID. Multiple users may speak." },
            { role: "assistant", content: "همم.. أنا أستمع لكم جميعاً. 👑" }
        ];
    }

    const currentHistory = [...chatSessions[sessionKey]];
    let messageContent = [];

    // إضافة النص للرسالة
    messageContent.push({
        type: "text",
        text: `${contextInfo}\n\n[User: ${username} | ID: ${userId}]: ${userMessage || (imageAttachment ? "ما رأيك في هذه الصورة؟" : "")}`
    });

    // معالجة الصور بطريقة OpenAI (تحويلها إلى Base64)
    if (imageAttachment) {
        try {
            const imageResponse = await fetch(imageAttachment.url);
            if (!imageResponse.ok) throw new Error("Failed to fetch image");
            const arrayBuffer = await imageResponse.arrayBuffer();
            const base64Image = Buffer.from(arrayBuffer).toString('base64');
            const mimeType = imageAttachment.mimeType || "image/png";
            
            messageContent.push({
                type: "image_url",
                image_url: { url: `data:${mimeType};base64,${base64Image}` }
            });
        } catch (error) {
            console.error("[Image Error] Failed to process image attachment:", error.message);
        }
    }

    currentHistory.push({ role: "user", content: messageContent });

    // تقليل الذاكرة إذا طالت (يحفظ آخر 15 رسالة عشان يركز أكثر)
    if (currentHistory.length > 15) {
        currentHistory.splice(2, currentHistory.length - 15);
    }

    try {
        let responseText = await callOpenAI(apiKey, currentHistory);

        chatSessions[sessionKey] = currentHistory;
        chatSessions[sessionKey].push({ role: "assistant", content: responseText });

        responseText = await processAiActions(responseText, messageObject);
        return enforceSingleEmoji(responseText);

    } catch (error) {
        console.error(`[OpenAI Engine Error]: ${error.message.split('\n')[0]}`);
        return "🌑 .. واجهت مشكلة في التفكير، حاول مرة أخرى.";
    }
}

async function processQueue() {
    isProcessingQueue = true;

    while (messageQueue.length > 0) {
        const job = messageQueue.shift();

        try {
            if (job.args.messageObject && job.args.messageObject.channel) {
                await job.args.messageObject.channel.sendTyping().catch(() => {});
            }

            const reply = await executeAI(...Object.values(job.args));
            job.resolve(reply);
        } catch (error) {
            console.error("[Queue Error] Fatal error during queue processing:", error.message);
            job.resolve("حدث خطأ غير متوقع.");
        }

        await sleep(QUEUE_DELAY); 
    }

    isProcessingQueue = false;
}

function generateResponse(apiKey, systemInstruction, userMessage, userData, userId, username, imageAttachment, isNsfw, messageObject, channelId) {
    return new Promise((resolve) => {
        const now = Date.now();

        if (userCooldowns.has(userId)) {
            const lastTime = userCooldowns.get(userId);
            if (now - lastTime < USER_COOLDOWN) {
                return resolve(null); 
            }
        }
        userCooldowns.set(userId, now);

        messageQueue.push({
            args: { apiKey, systemInstruction, userMessage, userData, userId, username, imageAttachment, isNsfw, messageObject, channelId },
            resolve
        });

        if (!isProcessingQueue) {
            processQueue();
        }
    });
}

setInterval(() => {
    const keys = Object.keys(chatSessions);
    if (keys.length > 0) {
        keys.forEach(key => delete chatSessions[key]);
    }
    userCooldowns.clear(); 
}, 3600000);

module.exports = { generateResponse };
