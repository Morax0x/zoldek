const { getEmojiContext } = require('./emojis');
const aiActionHandler = require('../../utils/aiActionHandler');
require('dotenv').config();

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

const TEXT_MODELS = [
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "mixtral-8x7b-32768"
];

const VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

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

async function fetchImageAsBase64(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer).toString("base64");
}

async function callGroqAPI(apiKey, model, messages) {
    const response = await fetch(GROQ_API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model,
            messages,
            max_tokens: 1024,
            temperature: 1
        })
    });

    if (!response.ok) {
        const errText = await response.text();
        const err = new Error(`Groq API error ${response.status}: ${errText}`);
        err.status = response.status;
        throw err;
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content ?? "";
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

async function generateResponse(apiKey, systemInstruction, userMessage, userData, userId, username, imageAttachment, isNsfw, messageObject, channelId) {
    const key = apiKey || process.env.GROQ_API_KEY;
    if (!key) return "⚠️ مفتاح الخزينة (GROQ_API_KEY) مفقود!";

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
        try {
            const base64 = await fetchImageAsBase64(imageAttachment.url);

            const messages = [
                { role: "system", content: systemInstruction },
                {
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text: `${contextInfo}\n[User: ${username} | ID: ${userId}]: ${userMessage || "ما رأيك في هذه الصورة؟"}`
                        },
                        {
                            type: "image_url",
                            image_url: {
                                url: `data:${imageAttachment.mimeType};base64,${base64}`
                            }
                        }
                    ]
                }
            ];

            let responseText = await callGroqAPI(key, VISION_MODEL, messages);
            responseText = await processAiActions(responseText, messageObject);
            return enforceSingleEmoji(responseText);

        } catch (error) {
            console.warn(`⚠️ [Image AI] Vision failed: ${error.message}`);
            return "عذراً، لم أتمكن من رؤية الصورة بوضوح.";
        }
    }

    for (const modelName of TEXT_MODELS) {
        try {
            if (!chatSessions[sessionKey]) {
                chatSessions[sessionKey] = [
                    {
                        role: "user",
                        content: `[SYSTEM: GROUP CHAT STARTED] Mode: SFW. Treat users based on their ID. Multiple users may speak.`
                    },
                    {
                        role: "assistant",
                        content: "همم.. أنا أستمع لكم جميعاً. 👑"
                    }
                ];
            }

            const fullMessage = `${contextInfo}\n\n[User: ${username} | ID: ${userId}]: ${userMessage}`;
            chatSessions[sessionKey].push({ role: "user", content: fullMessage });

            const messages = [
                { role: "system", content: systemInstruction },
                ...chatSessions[sessionKey]
            ];

            let responseText = await callGroqAPI(key, modelName, messages);

            chatSessions[sessionKey].push({ role: "assistant", content: responseText });

            responseText = await processAiActions(responseText, messageObject);
            return enforceSingleEmoji(responseText);

        } catch (error) {
            if (chatSessions[sessionKey]) delete chatSessions[sessionKey];

            console.warn(`⚠️ [Text AI] ${modelName} failed: ${error.message.split('[')[0]}`);

            if (error.message.includes("429") || error.status === 429) {
                await sleep(4000);
                continue;
            }
            if (error.message.includes("503") || error.status === 503) {
                await sleep(2000);
                continue;
            }

            if (modelName === TEXT_MODELS[TEXT_MODELS.length - 1]) {
                return "🌑 ..";
            }
        }
    }
}

setInterval(() => {
    const keys = Object.keys(chatSessions);
    if (keys.length > 0) {
        console.log(`[AI Engine] Cleaning ${keys.length} cached sessions...`);
        keys.forEach(key => delete chatSessions[key]);
    }
}, 3600000);

module.exports = { generateResponse };
