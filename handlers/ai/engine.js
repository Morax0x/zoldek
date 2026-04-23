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

async function generateResponse(apiKey, systemInstruction, userMessage, userData, userId, username, imageAttachment, isNsfw, messageObject, channelId) {
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
                        { text: `[User: ${username} | ID: ${userId}]: ${userMessage || "ما رأيك في هذه الصورة؟"}` },
                        imagePart
                    ]
                }];

                let responseText = await callGeminiAPI(apiKey, modelName, systemInstruction, contents);

                responseText = await processAiActions(responseText, messageObject);

                return enforceSingleEmoji(responseText);

            } catch (error) {
                console.warn(`⚠️ [Image AI] ${modelName} failed, trying next...`);
                if (modelName === MODELS[MODELS.length - 1]) return "عذراً، لم أتمكن من رؤية الصورة بوضوح.";
                await sleep(2000);
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

            const fullMessage = `${contextInfo}\n\n[User: ${username} | ID: ${userId}]: ${userMessage}`;
            chatSessions[sessionKey].push({ role: "user", parts: [{ text: fullMessage }] });

            let responseText = await callGeminiAPI(apiKey, modelName, systemInstruction, chatSessions[sessionKey]);

            chatSessions[sessionKey].push({ role: "model", parts: [{ text: responseText }] });

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

            if (modelName === MODELS[MODELS.length - 1]) {
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
