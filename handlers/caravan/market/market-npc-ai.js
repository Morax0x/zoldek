const {
    EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
    MessageFlags,
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
const { buildMarketEmbed, buildMarketComponents } = require('./market-ui');

const NPC_NAMES = [
    '\u063a\u0631\u064a\u0628 \u0645\u0631\u0645\u0648\u0632',
    '\u062a\u0627\u062c\u0631 \u0645\u062a\u062c\u0648\u0644',
    '\u062c\u0627\u0645\u0639 \u062a\u062d\u0641',
    '\u0633\u0645\u0633\u0627\u0631 \u0645\u062d\u0646\u0643',
    '\u0645\u063a\u0627\u0645\u0631 \u062b\u0631\u064a',
    '\u0634\u064a\u062e \u0627\u0644\u062a\u062c\u0627\u0631',
    '\u0648\u0627\u0644\u064a \u0627\u0644\u0633\u0648\u0642',
    '\u0641\u062a\u0627\u0629 \u0627\u0644\u0642\u0635\u0631',
    '\u062d\u0643\u064a\u0645 \u0627\u0644\u0642\u0628\u064a\u0644\u0629',
    '\u0642\u0627\u0626\u062f \u0627\u0644\u0642\u0635\u062f',
];

const NPC_EMOJIS = ['\ud83d\udd74\ufe0f', '\ud83e\uddd9', '\ud83d\udc8e', '\ud83c\udfad', '\u2694\ufe0f', '\ud83d\udd4c', '\ud83d\udc51', '\ud83c\udf39', '\ud83e\uddd3', '\ud83c\udfdb\ufe0f'];

const DESTINATION_PERSONAS = {
    gold_city: {
        name: '\u0645\u062f\u064a\u0646\u0629 \u0627\u0644\u0630\u0647\u0628',
        systemPrompt: (
            '\u0623\u0646\u062a \u062a\u0627\u062c\u0631 \u0637\u0645\u0648\u0639 \u0648\u0630\u0643\u064a \u0645\u0646 \u0645\u062f\u064a\u0646\u0629 \u0627\u0644\u0630\u0647\u0628. ' +
            '\u0623\u0646\u062a \u062a\u0641\u0647\u0645 \u0642\u064a\u0645\u0629 \u0627\u0644\u0623\u0634\u064a\u0627\u0621 \u0648\u062a\u0633\u0639\u0649 \u062f\u0627\u0626\u0645\u0627\u064b \u0644\u0644\u062d\u0635\u0648\u0644 \u0639\u0644\u0649 \u0623\u0641\u0636\u0644 \u0635\u0641\u0642\u0629. ' +
            '\u0627\u0633\u062a\u062e\u062f\u0645 \u0623\u0633\u0644\u0648\u0628\u0627\u064b \u0641\u0627\u062e\u0631\u0627\u064b \u0644\u0643\u0646\u0647 \u062d\u0627\u062f \u0641\u064a \u0627\u0644\u0645\u0641\u0627\u0648\u0636\u0629. ' +
            '\u062a\u062d\u0628 \u0627\u0644\u0627\u0633\u062a\u0639\u0631\u0627\u0636 \u0628\u062b\u0631\u0648\u062a\u0643 \u0644\u0643\u0646\u0643 \u0628\u062e\u064a\u0644 \u0641\u064a \u0627\u0644\u062f\u0641\u0639. ' +
            '\u0631\u062f\u0643 \u064a\u062c\u0628 \u0623\u0646 \u064a\u0643\u0648\u0646 \u0642\u0635\u064a\u0631\u0627\u064b (\u062c\u0645\u0644\u062a\u064a\u0646 \u0643\u062d\u062f \u0623\u0642\u0635\u0649).'
        ),
    },
    magic_academy: {
        name: '\u0623\u0643\u0627\u062f\u064a\u0645\u064a\u0629 \u0627\u0644\u0633\u062d\u0631',
        systemPrompt: (
            '\u0623\u0646\u062a \u0639\u0627\u0644\u0645 \u0633\u062d\u0631 \u062d\u0643\u064a\u0645 \u0645\u0646 \u0623\u0643\u0627\u062f\u064a\u0645\u064a\u0629 \u0627\u0644\u0633\u062d\u0631. ' +
            '\u0623\u0646\u062a \u062a\u0647\u062a\u0645 \u0628\u0627\u0644\u0639\u0646\u0627\u0635\u0631 \u0627\u0644\u0646\u0627\u062f\u0631\u0629 \u0648\u0627\u0644\u062a\u062d\u0641 \u0627\u0644\u0642\u062f\u064a\u0645\u0629. ' +
            '\u062a\u062a\u062d\u062f\u062b \u0628\u0623\u0633\u0644\u0648\u0628 \u0641\u0644\u0633\u0641\u064a \u0648\u063a\u0627\u0645\u0636\u060c \u0648\u062a\u0631\u0649 \u0627\u0644\u0642\u064a\u0645\u0629 \u0641\u064a \u0627\u0644\u0645\u0639\u0631\u0641\u0629 \u0644\u0627 \u0641\u064a \u0627\u0644\u0645\u0627\u0644. ' +
            '\u0639\u0646\u062f \u0627\u0644\u0645\u0641\u0627\u0648\u0636\u0629\u060c \u062a\u0633\u062a\u062e\u062f\u0645 \u062d\u0643\u0645\u062a\u0643 \u0644\u062a\u0642\u062f\u064a\u0631 \u0627\u0644\u0623\u0634\u064a\u0627\u0621 \u0628\u0639\u062f\u0627\u0644\u0629. ' +
            '\u0631\u062f\u0643 \u064a\u062c\u0628 \u0623\u0646 \u064a\u0643\u0648\u0646 \u0642\u0635\u064a\u0631\u0627\u064b (\u062c\u0645\u0644\u062a\u064a\u0646 \u0643\u062d\u062f \u0623\u0642\u0635\u0649).'
        ),
    },
    imperial_capital: {
        name: '\u0627\u0644\u0639\u0627\u0635\u0645\u0629 \u0627\u0644\u0625\u0645\u0628\u0631\u0627\u0637\u0648\u0631\u064a\u0629',
        systemPrompt: (
            '\u0623\u0646\u062a \u0646\u0628\u064a\u0644 \u0625\u0645\u0628\u0631\u0627\u0637\u0648\u0631\u064a \u0645\u0646 \u0627\u0644\u0639\u0627\u0635\u0645\u0629. ' +
            '\u0623\u0646\u062a \u0645\u062a\u0643\u0628\u0631 \u0644\u0643\u0646\u0643 \u0645\u0647\u0630\u0628\u060c \u0648\u062a\u0646\u0638\u0631 \u0644\u0644\u062a\u062c\u0627\u0631\u0629 \u0645\u0646 \u0645\u0646\u0638\u0648\u0631 \u0627\u0644\u0645\u0643\u0627\u0646\u0629 \u0627\u0644\u0627\u062c\u062a\u0645\u0627\u0639\u064a\u0629. ' +
            '\u062a\u0641\u0636\u0644 \u0627\u0644\u0639\u0646\u0627\u0635\u0631 \u0627\u0644\u0646\u0627\u062f\u0631\u0629 \u0648\u0627\u0644\u0641\u0627\u062e\u0631\u0629\u060c \u0648\u062a\u0633\u062a\u062e\u062f\u0645 \u0644\u063a\u0629 \u0631\u0633\u0645\u064a\u0629 \u0641\u064a \u0643\u0644\u0627\u0645\u0643. ' +
            '\u0641\u064a \u0627\u0644\u0645\u0641\u0627\u0648\u0636\u0629\u060c \u0623\u0646\u062a \u062d\u0627\u0633\u0645 \u0648\u0644\u0627 \u062a\u062a\u0631\u062f\u062f \u0641\u064a \u0625\u0638\u0647\u0627\u0631 \u0642\u0648\u0629 \u0645\u0648\u0642\u0641\u0643. ' +
            '\u0631\u062f\u0643 \u064a\u062c\u0628 \u0623\u0646 \u064a\u0643\u0648\u0646 \u0642\u0635\u064a\u0631\u0627\u064b (\u062c\u0645\u0644\u062a\u064a\u0646 \u0643\u062d\u062f \u0623\u0642\u0635\u0649).'
        ),
    },
    ancient_ruins: {
        name: '\u0627\u0644\u0623\u0637\u0644\u0627\u0644 \u0627\u0644\u0642\u062f\u064a\u0645\u0629',
        systemPrompt: (
            '\u0623\u0646\u062a \u0645\u063a\u0627\u0645\u0631 \u0642\u062f\u064a\u0645 \u0639\u0627\u0634 \u0641\u064a \u0627\u0644\u0623\u0637\u0644\u0627\u0644 \u0648\u0627\u0644\u0623\u0633\u0631\u0627\u0631. ' +
            '\u0623\u0646\u062a \u063a\u0627\u0645\u0636 \u0648\u0645\u062a\u0648\u062d\u0634 \u0628\u0627\u0644\u0645\u0639\u0631\u0641\u0629\u060c \u062a\u0639\u0631\u0641 \u0642\u064a\u0645\u0629 \u0627\u0644\u062a\u062d\u0641 \u0627\u0644\u0642\u062f\u064a\u0645\u0629 \u0623\u0643\u062b\u0631 \u0645\u0646 \u0623\u064a \u0634\u062e\u0635. ' +
            '\u062a\u062a\u062d\u062f\u062b \u0628\u0623\u0633\u0644\u0648\u0628 \u0642\u062f\u064a\u0645 \u0648\u0645\u0644\u0626\u0648\u0628 \u0628\u0627\u0644\u0623\u0633\u0631\u0627\u0631. ' +
            '\u0641\u064a \u0627\u0644\u0645\u0641\u0627\u0648\u0636\u0629\u060c \u0623\u0646\u062a \u0635\u0628\u0648\u0631 \u0648\u0644\u0627 \u062a\u062a\u0639\u062c\u0644\u060c \u0644\u0643\u0646\u0643 \u0642\u0627\u0633\u064d \u0641\u064a \u0627\u0644\u0633\u0639\u0631. ' +
            '\u0631\u062f\u0643 \u064a\u062c\u0628 \u0623\u0646 \u064a\u0643\u0648\u0646 \u0642\u0635\u064a\u0631\u0627\u064b (\u062c\u0645\u0644\u062a\u064a\u0646 \u0643\u062d\u062f \u0623\u0642\u0635\u0649).'
        ),
    },
    nature_valley: {
        name: '\u0648\u0627\u062f\u064a \u0627\u0644\u0637\u0628\u064a\u0639\u0629',
        systemPrompt: (
            '\u0623\u0646\u062a \u0631\u0627\u0639\u064a \u0637\u0628\u064a\u0639\u0629 \u0648\u062f\u0648\u062f \u0645\u0646 \u0648\u0627\u062f\u064a \u0627\u0644\u0637\u0628\u064a\u0639\u0629. ' +
            '\u0623\u0646\u062a \u0637\u064a\u0628 \u0627\u0644\u0642\u0644\u0628 \u0648\u062a\u062d\u0628 \u0627\u0644\u0637\u0628\u064a\u0639\u0629 \u0648\u0627\u0644\u062d\u064a\u0648\u0627\u0646\u0627\u062a \u0648\u0627\u0644\u0646\u0628\u0627\u062a\u0627\u062a. ' +
            '\u062a\u062a\u062d\u062f\u062b \u0628\u062f\u0641\u0621 \u0648\u0644\u0637\u0641\u060c \u0648\u062a\u0647\u062a\u0645 \u0628\u0627\u0644\u0628\u0636\u0627\u0626\u0639 \u0627\u0644\u0637\u0628\u064a\u0639\u064a\u0629 \u0648\u0627\u0644\u0628\u0630\u0648\u0631. ' +
            '\u0641\u064a \u0627\u0644\u0645\u0641\u0627\u0648\u0636\u0629\u060c \u0623\u0646\u062a \u0639\u0627\u062f\u0644 \u0648\u0645\u0633\u062a\u0639\u062f \u0644\u0644\u0648\u0635\u0648\u0644 \u0625\u0644\u0649 \u062d\u0644 \u0648\u0633\u0637. ' +
            '\u0631\u062f\u0643 \u064a\u062c\u0628 \u0623\u0646 \u064a\u0643\u0648\u0646 \u0642\u0635\u064a\u0631\u0627\u064b (\u062c\u0645\u0644\u062a\u064a\u0646 \u0643\u062d\u062f \u0623\u0642\u0635\u0649).'
        ),
    },
};

const NpcConversations = new Map();

function getNpcPersona(destId) {
    const persona = DESTINATION_PERSONAS[destId];
    if (!persona) {
        return {
            systemPrompt: (
                '\u0623\u0646\u062a \u062a\u0627\u062c\u0631 \u0645\u062a\u062c\u0648\u0644 \u0639\u0627\u0645. ' +
                '\u0623\u0646\u062a \u062a\u062d\u0627\u0648\u0644 \u0634\u0631\u0627\u0621 \u0628\u0636\u0627\u0626\u0639 \u0628\u0623\u0641\u0636\u0644 \u0633\u0639\u0631 \u0645\u0645\u0643\u0646. ' +
                '\u0643\u0646 \u0648\u062f\u0648\u062f\u0627\u064b \u0644\u0643\u0646\u0643 \u062d\u0627\u062f \u0641\u064a \u0627\u0644\u0645\u0641\u0627\u0648\u0636\u0629. ' +
                '\u0631\u062f\u0643 \u064a\u062c\u0628 \u0623\u0646 \u064a\u0643\u0648\u0646 \u0642\u0635\u064a\u0631\u0627\u064b (\u062c\u0645\u0644\u062a\u064a\u0646 \u0643\u062d\u062f \u0623\u0642\u0635\u0649).'
            ),
            name: '\u0627\u0644\u0645\u062f\u064a\u0646\u0629 \u0627\u0644\u0645\u062c\u0647\u0648\u0644\u0629',
        };
    }
    return persona;
}

async function callGeminiDirect(apiKey, systemPrompt, userMessage) {
    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    system_instruction: { parts: [{ text: systemPrompt }] },
                    contents: [{ role: 'user', parts: [{ text: userMessage }] }],
                    generationConfig: { maxOutputTokens: 300, temperature: 0.8 },
                }),
            }
        );

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Gemini API error ${response.status}: ${errText}`);
        }

        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    } catch (err) {
        console.error('[NPC Gemini Error]', err.message);
        return null;
    }
}

async function callOpenAIDirect(apiKey, systemPrompt, userMessage) {
    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userMessage },
                ],
                max_tokens: 300,
                temperature: 0.8,
            }),
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`OpenAI API error ${response.status}: ${errText}`);
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content?.trim() || '';
    } catch (err) {
        console.error('[NPC OpenAI Error]', err.message);
        return null;
    }
}

async function callAI(systemPrompt, userMessage) {
    const geminiKey = process.env.GEMINI_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    if (geminiKey) {
        const result = await callGeminiDirect(geminiKey, systemPrompt, userMessage);
        if (result) return result;
    }

    if (openaiKey) {
        const result = await callOpenAIDirect(openaiKey, systemPrompt, userMessage);
        if (result) return result;
    }

    return null;
}

function parseNpcAction(text) {
    const buyMatch = text.match(/\[BUY_ITEM:(\d+):(\d+):(\d+)\]/);
    if (buyMatch) {
        return {
            action: 'buy',
            listingId: parseInt(buyMatch[1]),
            quantity: parseInt(buyMatch[2]),
            offeredPrice: parseInt(buyMatch[3]),
        };
    }

    const acceptMatch = text.match(/\[ACCEPT_OFFER:(\d+)\]/);
    if (acceptMatch) {
        return {
            action: 'accept',
            price: parseInt(acceptMatch[1]),
        };
    }

    return null;
}

function generateNpcOpeningMessage(destId, listings) {
    const persona = getNpcPersona(destId);
    const availableListings = listings.filter(l => {
        const avail = Number(l.quantity) - Number(l.quantitysold || l.quantitySold || 0);
        return avail > 0;
    });

    if (availableListings.length === 0) return null;

    const randomListing = availableListings[Math.floor(Math.random() * availableListings.length)];
    const info = getItemInfo(randomListing.itemid || randomListing.itemID);
    const price = Number(randomListing.priceperunit || randomListing.pricePerUnit);
    const offerPrice = Math.floor(price * (0.5 + Math.random() * 0.3));

    const openings = {
        gold_city: [
            `\ud83d\udcb0 \u0647\u0627\u0647! \u0645\u0627 \u0647\u0630\u0627 \u0627\u0644\u0645\u0639\u0631\u0648\u0636 \u0627\u0644\u0630\u064a \u0623\u0631\u0627\u0647\u061f **${info.name}** \u0628\u0633\u0639\u0631 **${price}** ${EMOJI_MORA}\u061f \u0623\u0646\u0627 \u0623\u0639\u0631\u0636 عليك **${offerPrice}** ${EMOJI_MORA} \u0644\u0644\u0648\u0627\u062d\u062f\u0629. \u0642\u0628\u0648\u0644 \u0623\u0645 \u0631\u0641\u0636\u061f`,
            `\u2728 \u0623\u0631\u0649 \u0623\u0646\u0643 \u062a\u0628\u064a\u0639 **${info.name}**. \u0633\u0644\u0639\u0629 \u062c\u064a\u062f\u0629 \u0644\u0643\u0646 \u0627\u0644\u0633\u0639\u0631 \u0645\u0628\u0627\u0644\u063a \u0641\u064a\u0647. \u0623\u0646\u0627 \u0623\u0639\u0637\u064a\u0643 **${offerPrice}** ${EMOJI_MORA} \u0643\u0633\u0639\u0631 \u0639\u0627\u062f\u0644.`,
        ],
        magic_academy: [
            `\ud83d\udd2e \u0627\u0644\u0646\u062c\u0648\u0645 \u0623\u0631\u062a\u0646\u064a \u0623\u0646 \u0647\u0646\u0627\u0643 **${info.name}** \u0645\u0639\u0631\u0648\u0636\u0629... \u0644\u0643\u0646 \u0627\u0644\u0643\u0648\u0646 \u064a\u0642\u0648\u0644 \u0623\u0646 \u0633\u0639\u0631\u0647\u0627 \u064a\u062c\u0628 \u0623\u0646 \u064a\u0643\u0648\u0646 **${offerPrice}** ${EMOJI_MORA}. \u0647\u0644 \u062a\u0633\u062a\u0645\u0639 \u0644\u062d\u0643\u0645\u0629 \u0627\u0644\u0646\u062c\u0648\u0645\u061f`,
            `\u2697\ufe0f \u0648\u0627\u0632\u0646\u062a \u0642\u064a\u0645\u0629 **${info.name}** \u0628\u0645\u064a\u0632\u0627\u0646 \u0627\u0644\u062d\u0643\u0645\u0629... \u0627\u0644\u0646\u062a\u064a\u062c\u0629: **${offerPrice}** ${EMOJI_MORA}. \u0647\u0644 \u062a\u0642\u0628\u0644 \u0628\u062d\u0643\u0645 \u0627\u0644\u0645\u064a\u0632\u0627\u0646\u061f`,
        ],
        imperial_capital: [
            `\ud83d\udc51 \u0628\u0627\u0633\u0645 \u0627\u0644\u0625\u0645\u0628\u0631\u0627\u0637\u0648\u0631\u064a\u0629\u060c \u0623\u0631\u063a\u0628 \u0641\u064a \u0634\u0631\u0627\u0621 **${info.name}**. \u0627\u0644\u0633\u0639\u0631 \u0627\u0644\u0645\u0637\u0644\u0648\u0628 \u0645\u0628\u0627\u0644\u063a \u0641\u064a\u0647. \u0639\u0631\u0636\u064a \u0627\u0644\u0646\u0647\u0627\u0626\u064a: **${offerPrice}** ${EMOJI_MORA}.`,
            `\ud83c\udfdb\ufe0f \u0627\u0644\u0646\u0628\u0644\u0629 \u062a\u062a\u0637\u0644\u0628 \u0635\u0641\u0642\u0627\u062a \u0645\u062a\u0648\u0627\u0632\u0646\u0629. \u0644\u0642\u062f \u0642\u0627\u0645\u062a \u0628\u062a\u0642\u064a\u064a\u0645 **${info.name}** \u0648\u0648\u062c\u062f\u062a \u0642\u064a\u0645\u062a\u0647\u0627 \u0627\u0644\u062d\u0642\u064a\u0642\u064a\u0629 **${offerPrice}** ${EMOJI_MORA}.`,
        ],
        ancient_ruins: [
            `\ud83c\udff4 \u0647\u0645\u0645... **${info.name}**\u061f \u0631\u0623\u064a\u062a \u0645\u062b\u0644\u0647\u0627 \u0641\u064a \u0627\u0644\u0623\u0637\u0644\u0627\u0644 \u0645\u0646\u0630 \u0642\u0631\u0648\u0646. \u0633\u0639\u0631\u0643 \u0639\u0627\u0644\u064d \u062c\u062f\u0627\u064b. \u0623\u0646\u0627 \u0623\u0639\u0631\u0636 **${offerPrice}** ${EMOJI_MORA} \u2014 \u0633\u0639\u0631 \u0627\u0644\u0632\u0645\u0646.`,
            `\ud83d\uddff \u0627\u0644\u0623\u0637\u0644\u0627\u0644 \u0639\u0644\u0645\u062a\u0646\u064a \u0623\u0646 \u0643\u0644 \u0634\u064a\u0621 \u0644\u0647 \u062b\u0645\u0646\u0647... \u0648\u062b\u0645\u0646 **${info.name}** \u0644\u062f\u064a\u0651 \u0647\u0648 **${offerPrice}** ${EMOJI_MORA}.`,
        ],
        nature_valley: [
            `\ud83c\udf3f \u0645\u0631\u062d\u0628\u0627\u064b \u064a\u0627 \u0635\u062f\u064a\u0642\u064a! \u0648\u0627\u0648\u060c **${info.name}** \u062c\u0645\u064a\u0644\u0629! \u0644\u0643\u0646 \u0647\u0644 \u064a\u0645\u0643\u0646\u0646\u0627 \u0627\u0644\u062a\u0641\u0627\u0647\u0645 \u0639\u0644\u0649 **${offerPrice}** ${EMOJI_MORA}\u061f \u0633\u0648\u0641 \u0623\u0639\u062a\u0646\u064a \u0628\u0647\u0627 \u062c\u064a\u062f\u0627\u064b!`,
            `\ud83c\udf3b \u0627\u0644\u0637\u0628\u064a\u0639\u0629 \u062a\u0639\u0644\u0645\u0646\u0627 \u0627\u0644\u0639\u062f\u0627\u0644\u0629. \u0623\u0639\u0631\u0636 عليك **${offerPrice}** ${EMOJI_MORA} \u0644\u0640 **${info.name}**. \u0647\u0644 \u0646\u062a\u0641\u0642\u061f`,
        ],
    };

    const destOpenings = openings[destId] || openings.gold_city;
    return destOpenings[Math.floor(Math.random() * destOpenings.length)];
}

async function handleNpcHaggle(client, db, thread, npcName, listings, destId, ownerId, conversationHistory) {
    const persona = getNpcPersona(destId);
    const availableListings = listings.filter(l => {
        const avail = Number(l.quantity) - Number(l.quantitysold || l.quantitySold || 0);
        return avail > 0;
    });

    if (availableListings.length === 0) return null;

    const lastExchange = conversationHistory.slice(-2).map(e => e.content).join('\n');

    const listingsContext = availableListings.map(l => {
        const info = getItemInfo(l.itemid || l.itemID);
        const avail = Number(l.quantity) - Number(l.quantitysold || l.quantitySold || 0);
        const price = Number(l.priceperunit || l.pricePerUnit);
        return `- ${info.name} (ID:${l.id}): ${avail} units available, asking ${price} mora each`;
    }).join('\n');

    const userMessage = (
        `Here are the available items:\n${listingsContext}\n\n` +
        `The conversation so far:\n${lastExchange}\n\n` +
        `Respond as the NPC. You can:\n` +
        `1. Make a counter-offer for an item\n` +
        `2. Accept the seller's price and buy: [BUY_ITEM:listingId:quantity:pricePerUnit]\n` +
        `3. Decline and leave politely\n` +
        `Keep your response short (max 2 sentences) and in Arabic.`
    );

    const response = await callAI(persona.systemPrompt, userMessage);
    if (!response) return null;

    const action = parseNpcAction(response);

    if (action?.action === 'buy') {
        const listing = availableListings.find(l => l.id === action.listingId);
        if (!listing) return { message: response, action: null };

        const npcMoraBudget = 50000 + Math.floor(Math.random() * 200000);
        const totalPrice = action.quantity * action.offeredPrice;

        if (totalPrice > npcMoraBudget) {
            return {
                message: response.replace(/\[BUY_ITEM:\d+:\d+:\d+\]/, '').trim() || (
                    `\u0622\u0633\u0641\u060c \u0645\u0639\u064a \u0641\u0642\u0637 **${npcMoraBudget.toLocaleString()}** ${EMOJI_MORA}. \u0644\u0627 \u0623\u0633\u062a\u0637\u064a\u0639 \u0627\u0644\u062f\u0641\u0627\u0639.`
                ),
                action: null,
            };
        }

        const cleanMessage = response.replace(/\[BUY_ITEM:\d+:\d+:\d+\]/, '').trim();

        return {
            message: cleanMessage || `\u0633\u0622\u062e\u0630 ${action.quantity} \u0648\u062d\u062f\u0629 \u0628\u0633\u0639\u0631 ${action.offeredPrice.toLocaleString()} \u0644\u0644\u0648\u0627\u062d\u062f\u0629!`,
            action: {
                type: 'purchase',
                listingId: action.listingId,
                quantity: Math.min(action.quantity, Number(listing.quantity) - Number(listing.quantitysold || listing.quantitySold || 0)),
                pricePerUnit: action.offeredPrice,
                buyerId: 'npc_' + destId,
                sellerId: ownerId,
                guildId: listing.guildid || listing.guildID,
                itemId: listing.itemid || listing.itemID,
            },
        };
    }

    return { message: response, action: null };
}

async function spawnNpc(client, db, thread, destId, ownerId, guildId) {
    try {
        const npcSpawnCount = await getNpcSpawnCount(db, thread.id);
        if (npcSpawnCount >= 2) return;

        const listings = await getListingsBySession(db, thread.id);
        const availableListings = listings.filter(l => {
            const avail = Number(l.quantity) - Number(l.quantitysold || l.quantitySold || 0);
            return avail > 0;
        });

        if (availableListings.length === 0) return;

        await incrementNpcSpawn(db, thread.id);

        const npcNameIdx = Math.floor(Math.random() * NPC_NAMES.length);
        const npcName = NPC_NAMES[npcNameIdx];
        const npcEmoji = NPC_EMOJIS[npcNameIdx];

        const openingMessage = generateNpcOpeningMessage(destId, availableListings);
        if (!openingMessage) return;

        const npcMsg = await thread.send({
            embeds: [new EmbedBuilder()
                .setColor('#FF69B4')
                .setTitle(`${npcEmoji} ${npcName} \u2014 \u0632\u0627\u0626\u0631 \u062c\u062f\u064a\u062f!`)
                .setDescription(openingMessage)
                .addFields({
                    name: '\ud83e\udd14 \u0643\u064a\u0641 \u062a\u062a\u0641\u0627\u0639\u0644\u061f',
                    value: (
                        `\u2022 \u0627\u0636\u063a\u0637 **\u0641\u0627\u0648\u0636** \u0644\u0644\u0645\u0641\u0627\u0648\u0636\u0629 \u0645\u0639\u0647\n` +
                        `\u2022 \u0627\u0636\u063a\u0637 **\u0642\u0628\u0648\u0644 \u0627\u0644\u0639\u0631\u0636** \u0644\u0644\u0645\u0648\u0627\u0641\u0642\u0629 \u0639\u0644\u0649 \u0633\u0639\u0631\u0647\n` +
                        `\u2022 \u0627\u0636\u063a\u0637 **\u0631\u0641\u0636** \u0644\u0637\u0631\u062f\u0647 \u0645\u0646 \u0627\u0644\u0633\u0648\u0642`
                    ),
                    inline: false,
                })
                .setFooter({ text: '\u0627\u0644\u0645\u0641\u0627\u0648\u0636\u0629 \u0645\u0639 \u0627\u0644\u0630\u0643\u0627\u0621 \u0627\u0644\u0627\u0635\u0637\u0646\u0627\u0639\u064a \ud83e\udd16' })]
        }).catch(() => null);

        if (!npcMsg) return;

        const convKey = `npc_conv_${thread.id}_${npcNameIdx}`;
        NpcConversations.set(convKey, {
            npcName,
            npcEmoji,
            destId,
            ownerId,
            guildId,
            listings,
            message: npcMsg,
            history: [],
            active: true,
        });

        const negotiateBtn = new ButtonBuilder()
            .setCustomId(`mkt_npc_negotiate_${npcNameIdx}`)
            .setLabel('\ud83e\udd14 \u0641\u0627\u0648\u0636')
            .setStyle(ButtonStyle.Primary);

        const acceptBtn = new ButtonBuilder()
            .setCustomId(`mkt_npc_accept_${npcNameIdx}`)
            .setLabel('\u2705 \u0642\u0628\u0648\u0644 \u0627\u0644\u0639\u0631\u0636')
            .setStyle(ButtonStyle.Success);

        const declineBtn = new ButtonBuilder()
            .setCustomId(`mkt_npc_decline_${npcNameIdx}`)
            .setLabel('\u274c \u0631\u0641\u0636')
            .setStyle(ButtonStyle.Danger);

        await npcMsg.edit({
            components: [
                new ActionRowBuilder().addComponents(negotiateBtn, acceptBtn, declineBtn)
            ]
        }).catch(() => {});

        const collector = npcMsg.createMessageComponentCollector({
            filter: i => i.user.id === ownerId,
            time: 5 * 60 * 1000,
            max: 3,
        });

        collector.on('collect', async i => {
            if (i.customId === `mkt_npc_negotiate_${npcNameIdx}`) {
                await i.deferUpdate().catch(() => {});

                const conv = NpcConversations.get(convKey);
                if (!conv || !conv.active) return;

                const updatedListings = await getListingsBySession(db, thread.id);
                const result = await handleNpcHaggle(
                    client, db, thread, npcName, updatedListings, destId, ownerId, conv.history
                );

                if (!result) {
                    await thread.send({
                        content: `${npcEmoji} \u0627\u0644\u062a\u0627\u062c\u0631 \u063a\u0627\u0645\u0636... \u0644\u0645 \u064a\u062a\u0645\u0643\u0646 \u0645\u0646 \u0627\u0644\u0631\u062f.`,
                    }).catch(() => {});
                    collector.stop();
                    return;
                }

                conv.history.push(
                    { role: 'assistant', content: result.message },
                    { role: 'user', content: '\u0627\u0644\u0628\u0627\u0626\u0639 \u064a\u0637\u0644\u0628 \u0627\u0644\u0645\u0632\u064a\u062f \u0645\u0646 \u0627\u0644\u0645\u0641\u0627\u0648\u0636\u0629.' }
                );

                await thread.send({
                    embeds: [new EmbedBuilder()
                        .setColor('#FF69B4')
                        .setDescription(`${npcEmoji} **${npcName}:** ${result.message}`)]
                }).catch(() => {});

                if (result.action?.type === 'purchase') {
                    const a = result.action;
                    const purchaseResult = await buyItem(
                        db, a.listingId, a.buyerId, a.sellerId, a.guildId,
                        a.itemId, a.quantity, a.pricePerUnit, 'npc'
                    );

                    if (purchaseResult.ok) {
                        const itemInfo = getItemInfo(a.itemId);
                        await thread.send({
                            embeds: [new EmbedBuilder()
                                .setColor('#00FF88')
                                .setTitle(`\ud83c\udf89 \u0635\u0641\u0642\u0629 \u0646\u0627\u062c\u062d\u0629!`)
                                .setDescription(
                                    `${npcEmoji} **${npcName}** \u0627\u0634\u062a\u0631\u0649 **${a.quantity}x ${itemInfo.name}**\n` +
                                    `\u0627\u0644\u0633\u0639\u0631: **${(a.quantity * a.pricePerUnit).toLocaleString()}** ${EMOJI_MORA}\n` +
                                    `\u0623\u0636\u064a\u0641 \u0627\u0644\u0645\u0628\u0644\u063a \u0625\u0644\u0649 \u0631\u0635\u064a\u062f <@${ownerId}>`
                                )]
                        }).catch(() => {});

                        const freshListings = await getListingsBySession(db, thread.id);
                        const session = await getSessionByThread(db, thread.id);
                        const dest = caravanConfig.destinations.find(d =>
                            d.id === (session?.destinationid || session?.destinationId)
                        );

                        await thread.send({
                            embeds: [await buildMarketEmbed(freshListings, dest)],
                            components: buildMarketComponents(freshListings),
                        }).catch(() => {});
                    }
                }

            } else if (i.customId === `mkt_npc_accept_${npcNameIdx}`) {
                await i.deferUpdate().catch(() => {});

                const conv = NpcConversations.get(convKey);
                if (!conv || !conv.active) return;

                const updatedListings = await getListingsBySession(db, thread.id);
                const randomListing = updatedListings.filter(l => {
                    const avail = Number(l.quantity) - Number(l.quantitysold || l.quantitySold || 0);
                    return avail > 0;
                })[0];

                if (!randomListing) {
                    await thread.send(`${npcEmoji} \u0644\u0627 \u062a\u0648\u062c\u062f \u0628\u0636\u0627\u0626\u0639 \u0645\u062a\u0627\u062d\u0629!`).catch(() => {});
                    collector.stop();
                    return;
                }

                const price = Number(randomListing.priceperunit || randomListing.pricePerUnit);
                const available = Number(randomListing.quantity) - Number(randomListing.quantitysold || randomListing.quantitySold || 0);
                const buyQty = Math.min(1 + Math.floor(Math.random() * 2), available);

                const purchaseResult = await buyItem(
                    db,
                    randomListing.id,
                    'npc_' + destId,
                    ownerId,
                    guildId,
                    randomListing.itemid || randomListing.itemID,
                    buyQty,
                    price,
                    'npc'
                );

                if (purchaseResult.ok) {
                    const itemInfo = getItemInfo(randomListing.itemid || randomListing.itemID);
                    await thread.send({
                        embeds: [new EmbedBuilder()
                            .setColor('#00FF88')
                            .setTitle(`\ud83c\udf89 \u0642\u0628\u0644\u062a \u0627\u0644\u0639\u0631\u0636! \u0635\u0641\u0642\u0629 \u0646\u0627\u062c\u062d\u0629!`)
                            .setDescription(
                                `${npcEmoji} **${npcName}:** \u0645\u0645\u062a\u0627\u0632! \u0633\u0639\u064a\u062f \u0628\u0627\u0644\u062a\u0639\u0627\u0645\u0644 \u0645\u0639\u0643.\n\n` +
                                `\u0627\u0634\u062a\u0631\u064a\u062a **${buyQty}x ${itemInfo.name}** \u0628\u0633\u0639\u0631 **${price.toLocaleString()}** ${EMOJI_MORA}/\u0648\u0627\u062d\u062f\u0629\n` +
                                `\u0627\u0644\u0625\u062c\u0645\u0627\u0644\u064a: **${(buyQty * price).toLocaleString()}** ${EMOJI_MORA}`
                            )]
                    }).catch(() => {});

                    const freshListings = await getListingsBySession(db, thread.id);
                    const session = await getSessionByThread(db, thread.id);
                    const dest = caravanConfig.destinations.find(d =>
                        d.id === (session?.destinationid || session?.destinationId)
                    );

                    await thread.send({
                        embeds: [await buildMarketEmbed(freshListings, dest)],
                        components: buildMarketComponents(freshListings),
                    }).catch(() => {});
                }

                conv.active = false;
                collector.stop();

            } else if (i.customId === `mkt_npc_decline_${npcNameIdx}`) {
                await i.deferUpdate().catch(() => {});

                const farewells = [
                    `${npcEmoji} **${npcName}:** \u062d\u0633\u0646\u0627\u064b... \u0633\u0623\u0628\u062d\u062b \u0639\u0646 \u0628\u0636\u0627\u0626\u0639 \u0623\u0641\u0636\u0644. \u0645\u0639 \u0627\u0644\u0633\u0644\u0627\u0645\u0629!`,
                    `${npcEmoji} **${npcName}:** \u0644\u0627 \u0645\u0634\u0643\u0644\u0629. \u0627\u0644\u0633\u0648\u0642 \u0643\u0628\u064a\u0631 \u0648\u0627\u0644\u0641\u0631\u0635 \u0643\u062b\u064a\u0631\u0629. \u0625\u0644\u0649 \u0627\u0644\u0644\u0642\u0627\u0621!`,
                    `${npcEmoji} **${npcName}:** \u0623\u0646\u062a \u062a\u062e\u0633\u0631 \u0635\u0641\u0642\u0629 \u0631\u0627\u0626\u0639\u0629! \u0644\u0643\u0646 \u0644\u0627 \u0628\u0623\u0633... \u0645\u0639 \u0627\u0644\u0633\u0644\u0627\u0645\u0629.`,
                ];

                await thread.send({
                    content: farewells[Math.floor(Math.random() * farewells.length)],
                }).catch(() => {});

                const conv = NpcConversations.get(convKey);
                if (conv) conv.active = false;
                collector.stop();
            }
        });

        collector.on('end', async () => {
            await npcMsg.edit({ components: [] }).catch(() => {});
            NpcConversations.delete(convKey);
        });

    } catch (err) {
        console.error('[spawnNpc]', err);
    }
}

function scheduleNpcSpawn(client, db, thread, dest, ownerId, guildId, marketDurationMs) {
    const destId = dest.id;

    const npcCount = 1 + Math.floor(Math.random() * 2);

    for (let i = 0; i < npcCount; i++) {
        const minDelay = marketDurationMs * 0.1;
        const maxDelay = marketDurationMs * 0.85;
        const delay = minDelay + Math.random() * (maxDelay - minDelay);

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
    getNpcPersona,
    parseNpcAction,
    NpcConversations,
    DESTINATION_PERSONAS,
    cleanupNpcConversations,
};
