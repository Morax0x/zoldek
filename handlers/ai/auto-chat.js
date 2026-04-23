const config = require('../../config.json');
const { buildSystemPrompt } = require('./persona');
const { generateResponse } = require('./engine');
const { getLeaderboardKnowledge } = require('./serverLore');

const CHAT_CHANNEL_ID = '1478254814973395055'; 
const GUILD_ID = '848921014141845544'; 

async function triggerAutoChat(client) {
    try {
        const channel = client.channels.cache.get(CHAT_CHANNEL_ID);
        if (!channel) return;

        const apiKey = process.env.GROQ_API_KEY;
        const db = client.sql;

        const leaderboardInfo = await getLeaderboardKnowledge(db, GUILD_ID);
        const systemInstruction = buildSystemPrompt(false, leaderboardInfo, false);

        // 🔥 نظام اختيار عشوائي: 50% أذكار، 50% سوالف خفيفة 🔥
        const isAthkarMode = Math.random() < 0.5;
        
        let hiddenPrompt = "";
        let serverContext = "";

        if (isAthkarMode) {
            // 🛑 وضع الأذكار فقط 🛑
            hiddenPrompt = `أنتِ الآن تبادرين بالحديث في الدردشة العامة.
المطلوب منكِ كتابة ذكر واحد مجرد فقط لا غير (من أنواع التسبيح، التحميد، التهليل، التكبير، الاستغفار، الحوقلة، أو الصلاة على النبي).

شروط صارمة جداً:
- اكتبي كلمات الذكر فقط بدون أي حرف إضافي، بدون مقدمات، وبدون التحدث مع الأعضاء (مثلاً لا تقولي "أذكركم بـ" أو "قولوا").
- يمنع منعاً باتاً ربط الذكر بأي وقت (لا تذكري الصباح أو المساء أو الليل نهائياً).
- يمنع منعاً باتاً الإشارة للصلوات (يمنع ذكر صلاة الوتر، الفجر، أو غيرها).
- يمنع السوالف أو الطقطقة في هذه الرسالة، فقط الذكر الصافي المجرد.
- رسالة قصيرة جداً عبارة عن بضع كلمات فقط.`;
            
            serverContext = "أنتِ تذكرين الله في الدردشة بكلمات قصيرة ومجردة.";
        } else {
            // 🛑 وضع السوالف وكسر الهدوء فقط 🛑
            hiddenPrompt = `أنتِ الآن تبادرين بالحديث في الدردشة العامة لكسر الهدوء.
المطلوب منكِ فتح سالفة خفيفة، أو طرح سؤال ممتع على الأعضاء، أو الطقطقة بشكل لطيف، أو الحديث عن الأجواء.

شروط صارمة جداً:
- يمنع منعاً باتاً كتابة أدعية أو أذكار في هذه الرسالة. فقط سوالف ودردشة عادية.
- تحدثي بأسلوب خليجي عفوي، مرح، وفيه ثقة "الإمبراطورة المحبوبة".
- رسالة قصيرة جداً (لا تتعدى 10 إلى 15 كلمة).
- لا توجهي الكلام لشخص معين، بل للجميع في الروم.
- اطرحي سؤالاً أو افتحي موضوعاً خفيفاً يشجع الأعضاء على الرد والتفاعل معكِ.`;
            
            serverContext = "أنتِ تشعرين بالملل وتريدين فتح نقاش أو سالفة ممتعة مع الرعية.";
        }

        const dummyUserData = {
            level: 99, 
            total_wealth: 999999, 
            serverContext: serverContext
        };

        const response = await generateResponse(
            apiKey,
            systemInstruction,
            hiddenPrompt,
            dummyUserData,
            client.user.id, 
            "System",
            null,
            false,
            null
        );

        if (response) {
            let finalMessage = response.replace(/\[ACTION:[^\]]+\]/g, '').trim();
            if (finalMessage) {
                await channel.send(finalMessage);
            }
        }

    } catch (error) {
        console.error("[Auto-Chat Error]:", error);
    }
}

function startAutoChat(client) {
    setInterval(() => {
        triggerAutoChat(client);
    }, 1000 * 60 * 40); 
}

module.exports = { startAutoChat, triggerAutoChat };
