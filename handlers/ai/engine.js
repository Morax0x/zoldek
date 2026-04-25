const { getEmojiContext } = require('./emojis');
const aiActionHandler = require('../../utils/aiActionHandler');
require('dotenv').config();

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

const MODELS = [
    "gemini-2.0-flash",
    "gemini-1.5-flash",
    "gemini-1.5-pro"
];

const chatSessions = {};
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ==========================================
// أنظمة الحماية: الطابور والتبريد
// ==========================================
const messageQueue = [];
let isProcessingQueue = false;
const userCooldowns = new Map();

const QUEUE_DELAY = 4000; // 4 ثواني بين كل طلب للـ API (يضمن لك 15 طلب بالدقيقة فقط كحد أقصى)
const USER_COOLDOWN = 10000; // 10 ثواني منع لكل مستخدم لتقليل السبام
// ==========================================

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
        console.error("Error processing image:", error);
        throw error;
    }
}

async function callGeminiAPI(apiKey, modelName, systemInstruction, contents) {
    const url = `${GEMINI_API_BASE}/${modelName}:generateContent?key=${apiKey}`;

    const body = {
        system_instruction: {
            parts: [{ text: systemInstruction }]
        },
        contents
    };

    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const errText = await response.text();
        const err = new Error(`Gemini API error ${response.status}: ${errText}`);
        err.status = response.status;
        throw err;
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
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

// الدالة الأساسية تم نقلها للعمل كعنصر داخل الطابور
async function executeAI(apiKey, systemInstruction, userMessage, userData, userId, username, imageAttachment, isNsfw, messageObject, channelId) {
    if (!apiKey) return "⚠️ مفتاح الخزينة (API Key) مفقود!";

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

    if (imageAttachment) {
        for (const modelName of MODELS) {
            try {
                const imagePart = await urlToGenerativePart(imageAttachment.url, imageAttachment.mimeType);

                const contents = [{
                    role: "user",
                    parts: [
                        { text: contextInfo },
                        { text: `[User: ${username} | ID: ${userId}]: ${userMessage || "علق على هذه الصورة؟"}` },
                        imagePart
                    ]
                }];

                let responseText = await callGeminiAPI(apiKey, modelName, systemInstruction, contents);
                responseText = await processAiActions(responseText, messageObject);
                return enforceSingleEmoji(responseText);

            } catch (error) {
                console.warn(`⚠️ [Image AI] ${modelName} failed, trying next...`);
                if (modelName === MODELS[MODELS.length - 1]) return "عذراً، لم أتمكن من رؤية الصورة بوضوح.";
                await sleep(1500);
            }
        }
    }

    for (const modelName of MODELS) {
        try {
            if (!chatSessions[sessionKey]) {
                chatSessions[sessionKey] = [
                    {
                        role: "user",
                        parts: [{ text: `[SYSTEM: GROUP CHAT STARTED] Mode: SFW. Treat users based on their ID. Multiple users may speak.` }]
                    },
                    {
                        role: "model",
                        parts: [{ text: "همم.. أنا أستمع لكم جميعاً. 👑" }]
                    }
                ];
            }

            const currentHistory = [...chatSessions[sessionKey]];
            const fullMessage = `${contextInfo}\n\n[User: ${username} | ID: ${userId}]: ${userMessage}`;
            currentHistory.push({ role: "user", parts: [{ text: fullMessage }] });

            if (currentHistory.length > 10) {
                currentHistory.splice(2, currentHistory.length - 10);
            }

            let responseText = await callGeminiAPI(apiKey, modelName, systemInstruction, currentHistory);

            chatSessions[sessionKey] = currentHistory;
            chatSessions[sessionKey].push({ role: "model", parts: [{ text: responseText }] });

            responseText = await processAiActions(responseText, messageObject);
            return enforceSingleEmoji(responseText);

        } catch (error) {
            console.warn(`⚠️ [Text AI] ${modelName} failed: ${error.message.split('[')[0]}`);

            if (error.message.includes("429") || error.status === 429) {
                await sleep(1000);
                continue;
            }
            if (error.message.includes("503") || error.status === 503) {
                await sleep(500);
                continue;
            }

            if (modelName === MODELS[MODELS.length - 1]) {
                return "🌑 .. ";
            }
        }
    }
}

// دالة معالجة الطابور (Worker)
async function processQueue() {
    isProcessingQueue = true;

    while (messageQueue.length > 0) {
        const job = messageQueue.shift();

        try {
            // إظهار حالة يكتب الآن في الديسكورد أثناء معالجة الطلب
            if (job.args.messageObject && job.args.messageObject.channel) {
                await job.args.messageObject.channel.sendTyping().catch(() => {});
            }

            const reply = await executeAI(...Object.values(job.args));
            job.resolve(reply);
        } catch (error) {
            console.error("Queue process error:", error);
            job.resolve("حدث خطأ أثناء معالجة رسالتك.");
        }

        // إجبار النظام على الانتظار قبل سحب الطلب التالي لحماية الـ API من الـ 429
        await sleep(QUEUE_DELAY); 
    }

    isProcessingQueue = false;
}

// هذه هي الدالة التي سيستدعيها ملف البوت الرئيسي
function generateResponse(apiKey, systemInstruction, userMessage, userData, userId, username, imageAttachment, isNsfw, messageObject, channelId) {
    return new Promise((resolve) => {
        const now = Date.now();

        // 1. فحص التبريد (Cooldown) للمستخدم
        if (userCooldowns.has(userId)) {
            const lastTime = userCooldowns.get(userId);
            if (now - lastTime < USER_COOLDOWN) {
                console.log(`[RateLimit] User ${username} is spamming. Ignored.`);
                // نُرجع null حتى لا يرد البوت على رسائل السبام
                return resolve(null); 
            }
        }
        userCooldowns.set(userId, now);

        // 2. إضافة الطلب إلى طابور الانتظار
        messageQueue.push({
            args: { apiKey, systemInstruction, userMessage, userData, userId, username, imageAttachment, isNsfw, messageObject, channelId },
            resolve
        });

        // 3. تشغيل معالج الطابور إذا كان متوقفاً
        if (!isProcessingQueue) {
            processQueue();
        }
    });
}

setInterval(() => {
    const keys = Object.keys(chatSessions);
    if (keys.length > 0) {
        console.log(`[AI Engine] Cleaning ${keys.length} cached sessions...`);
        keys.forEach(key => delete chatSessions[key]);
    }
    
    // تنظيف كاش التبريد للمستخدمين لتفريغ الذاكرة
    userCooldowns.clear(); 
}, 3600000);

module.exports = { generateResponse };
