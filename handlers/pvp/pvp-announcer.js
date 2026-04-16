const { EmbedBuilder, Colors } = require("discord.js");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const ANNOUNCER_COLORS = [Colors.Red, Colors.Gold, Colors.Orange, Colors.Purple, Colors.Blue, Colors.Green, Colors.DarkVividPink];

const PERSONALITIES = [
    "معلق ملحمي يتحدث باللغة العربية الفصحى الراقية ويصف القتال كأنه معركة أسطورية وتاريخية.",
    "معلق مجنون ودموي، يعشق رؤية الدمار والضربات القوية ويبالغ في ردود فعله بشكل حماسي جداً.",
    "معلق ساخر ومتهكم، يسخر من حركات المقاتلين بكلمات لاذعة ومضحكة ويستخف بضعفهم.",
    "عجوز حكيم وهادئ، يصف المعركة وكأنها قصة تاريخية تُكتب وتُروى عبر الأجيال بمصطلحات عميقة.",
    "معلق متحمس جداً وسريع الكلام، يستخدم تشبيهات غريبة وغير متوقعة ومضحكة لوصف الضربات.",
    "معلق درامي، يتعامل مع كل ضربة يتلقاها المقاتلون وكأنها مأساة أو نهاية العالم بأسلوب مسرحي."
];

// قائمة أسماء احتياطية في حال أخطأ الذكاء الاصطناعي
const FALLBACK_NAMES = ["المرعب", "الهائج", "السفاح", "الصياد", "الجزار", "الأسطورة", "الكابوس", "البرق"];

// دالة لتنظيف النص من التشكيل (الحركات) نهائياً
function removeTashkeel(text) {
    if (!text) return text;
    return text.replace(/[\u064B-\u065F]/g, '');
}

// دالة لمعرفة نوع المعركة الحالي ليتفاعل المعلق معها بذكاء
function getBattleContext(battleState) {
    if (battleState.isGuardBattle || battleState.isGuardBattle === true) {
        return "المعركة تدور في قلعة الإمبراطور! لص يحاول سرقة الخزينة وفارس الإمبراطور يحاول منعه من ذلك!";
    } else if (battleState.isPvE) {
        return "هذه رحلة صيد بحرية خطيرة! صياد شجاع يواجه وحشاً مرعباً ظهر من أعماق المحيط!";
    } else {
        return "هذه معركة تحدي (PvP) طاحنة بين مقاتلين في حلبة الموت والمراهنات!";
    }
}

async function askGemini(prompt) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GEMINI_KEY;
    if (!apiKey) return null;
    
    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        
        const result = await model.generateContent(prompt);
        const text = result.response.text().trim();
        
        if (text) return removeTashkeel(text);
    } catch (e) {
        try {
            const genAI = new GoogleGenerativeAI(apiKey);
            const fallbackModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            const result = await fallbackModel.generateContent(prompt);
            const text = result.response.text().trim();
            return removeTashkeel(text);
        } catch (fallbackError) {}
    }
    return null;
}

async function updateAnnouncerMessage(battleState) {
    if (!battleState.announcerMessage) return;
    try {
        const annEmbed = new EmbedBuilder()
            .setDescription(battleState.announcerText || "🎙️ المعلق يراقب بصمت...")
            .setColor(battleState.announcerColor || Colors.Gold);
        
        await battleState.announcerMessage.edit({ embeds: [annEmbed] }).catch(()=>{});
    } catch (e) {}
}

async function initAnnouncer(battleState, p1Name, p2Name) {
    if (battleState.isAnnouncing) return;
    battleState.isAnnouncing = true;
    battleState.announcerColor = ANNOUNCER_COLORS[Math.floor(Math.random() * ANNOUNCER_COLORS.length)];
    
    const selectedPersonality = PERSONALITIES[Math.floor(Math.random() * PERSONALITIES.length)];
    battleState.announcerPersonality = selectedPersonality;
    const battleContext = getBattleContext(battleState);

    // 🔥 التعديل هنا: توجيهات صارمة جداً لمنع الردود الطويلة (الجرائد) والالتزام بسطر واحد فقط 🔥
    const prompt = `أنت الآن تلعب دور: ${selectedPersonality}
سياق الحدث: ${battleContext}

المطلوب منك أمران فقط، ولا تزد عليهما شيئاً:
1. ابتكر لنفسك اسماً عشوائياً من كلمة واحدة فقط (كن مبدعاً، ولا تكتب كلمة المعلق في اسمك أبداً).
2. رحب بالجمهور وأعلن دخول المقاتلين (${p1Name} ضد ${p2Name}) إلى الساحة بأسلوبك الخاص.

**قواعد صارمة جداً (إن خالفتها ستفشل المعركة):**
- المعركة لم تبدأ بعد، هم فقط دخلوا الساحة الآن! لا تؤلف أحداثاً، لا تخترع ضربات، لا تقل من فاز أو خسر. فقط صف وقوفهم أمام بعضهم.
- يجب أن يكون الترحيب في سطر واحد قصير جداً (جملتين كحد أقصى).
- اكتب بنص صافٍ بدون تشكيل (حركات).

يجب أن يكون ردك حصراً بهذه الصيغة (بدون أي إضافات أو شروحات):
اسمك_من_كلمة_واحدة|ترحيبك_القصير_في_سطر_واحد`;

    try {
        const res = await askGemini(prompt);
        let name = FALLBACK_NAMES[Math.floor(Math.random() * FALLBACK_NAMES.length)]; 
        let welcome = `الميدان يشتعل! ${p1Name} يقف وجهاً لوجه أمام ${p2Name} في معركة لا ترحم!`;
        
        if (res && res.includes('|')) {
            const parts = res.split('|');
            let extractedName = parts[0].replace(/[\*🎙️:\-]/g, '').replace(/المعلق/g, '').trim(); 
            if (extractedName && !extractedName.includes(' ') && extractedName.length < 15) {
                name = extractedName;
            }
            welcome = parts.slice(1).join('|').trim(); 
        } else if (res) {
            welcome = res.replace(/\*/g, '');
        }

        // قص أي استرسال زائد في حال تجاهل الجيميني الأوامر 
        if (welcome.length > 200) {
            welcome = welcome.substring(0, 197) + '...';
        }

        battleState.announcerName = name;
        battleState.announcerText = `🎙️ **المعلق ${name}:** ${welcome}`;
        
        await updateAnnouncerMessage(battleState);
    } finally {
        battleState.isAnnouncing = false; 
    }
}

async function triggerAnnouncer(battleState, eventText) {
    if (battleState.isAnnouncing) return;
    
    battleState.isAnnouncing = true;
    const name = battleState.announcerName || FALLBACK_NAMES[Math.floor(Math.random() * FALLBACK_NAMES.length)];
    const personality = battleState.announcerPersonality || PERSONALITIES[0];
    const battleContext = getBattleContext(battleState);

    const prompt = `أنت معلق المعركة واسمك "${name}".
شخصيتك هي: ${personality}
سياق الحدث: ${battleContext}

الحدث الذي حصل للتو في المعركة: ${eventText}

المطلوب:
علق على هذا الحدث بأسلوبك الخاص وحسب شخصيتك في سطر واحد قصير ومثير جداً.
لا ترحب بالجمهور ولا تذكر اسمك، ولا تضف أي ضربات من خيالك، علق فقط على ما حدث أمامك الآن!
اكتب بنص صافٍ بدون تشكيل.`;
    
    try {
        const comment = await askGemini(prompt);
        if (comment) {
            battleState.announcerColor = ANNOUNCER_COLORS[Math.floor(Math.random() * ANNOUNCER_COLORS.length)];
            let finalComment = comment.replace(/[\*🎙️]/g, '').trim();
            
            // قص التعليق لو كان طويلاً جداً
            if (finalComment.length > 200) {
                finalComment = finalComment.substring(0, 197) + '...';
            }

            battleState.announcerText = `🎙️ **المعلق ${name}:** ${finalComment}`; 
            await updateAnnouncerMessage(battleState);
        }
    } finally {
        battleState.isAnnouncing = false;
    }
}

module.exports = { initAnnouncer, triggerAnnouncer };
