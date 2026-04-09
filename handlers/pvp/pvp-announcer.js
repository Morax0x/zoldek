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

// دالة لتنظيف النص من التشكيل (الحركات) نهائياً
function removeTashkeel(text) {
    if (!text) return text;
    return text.replace(/[\u064B-\u065F]/g, '');
}

// دالة لمعرفة نوع المعركة الحالي ليتفاعل المعلق معها بذكاء
function getBattleContext(battleState) {
    if (battleState.isGuardBattle) {
        return "المعركة تدور في قلعة الإمبراطور! لص يحاول سرقة الخزينة وفارس الإمبراطور الأسطوري يحاول القضاء عليه بلا رحمة!";
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
        
        await battleState.announcerMessage.edit({ embeds: [annEmbed] });
    } catch (e) {}
}

async function initAnnouncer(battleState, p1Name, p2Name) {
    if (battleState.isAnnouncing) return;
    battleState.isAnnouncing = true;
    battleState.announcerColor = ANNOUNCER_COLORS[Math.floor(Math.random() * ANNOUNCER_COLORS.length)];
    
    const selectedPersonality = PERSONALITIES[Math.floor(Math.random() * PERSONALITIES.length)];
    battleState.announcerPersonality = selectedPersonality;
    const battleContext = getBattleContext(battleState);

    const prompt = `أنت الآن تلعب دور: ${selectedPersonality}
سياق الحدث: ${battleContext}
المطلوب منك:
1. ابتكر لنفسك اسماً عشوائياً من كلمة واحدة فقط (كن مبدعاً ولا تكتب كلمة المعلق في اسمك أبداً).
2. رحب بالجمهور والمقاتلين (${p1Name} ضد ${p2Name}) بأسلوبك الخاص (حسب شخصيتك وسياق الحدث) في سطر واحد فقط.
3. كن مبدعاً جداً في الوصف، لغتك عربية سليمة وجذابة.
4. تحذير هام جداً: اكتب بنص صافٍ ولا تستخدم التشكيل (الحركات مثل الفتحة والكسرة) على الحروف العربية أبداً.
اكتب ردك بصيغة:
الاسم|الترحيب`;

    try {
        const res = await askGemini(prompt);
        let name = "المرعب"; 
        let welcome = `الميدان يشتعل! ${p1Name} يواجه ${p2Name} في معركة لا ترحم!`;
        
        if (res && res.includes('|')) {
            const parts = res.split('|');
            name = parts[0].replace(/[\*🎙️:\-]/g, '').replace(/المعلق/g, '').trim(); 
            if (name === '') name = 'المرعب';
            welcome = parts[1].trim();
        } else if (res) {
            welcome = res.replace(/\*/g, '');
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
    const name = battleState.announcerName || "المرعب";
    const personality = battleState.announcerPersonality || PERSONALITIES[0];
    const battleContext = getBattleContext(battleState);

    const prompt = `أنت معلق المعركة واسمك "${name}".
شخصيتك هي: ${personality}
سياق الحدث: ${battleContext}
الحدث الذي حصل للتو في المعركة: ${eventText}
المطلوب:
علق على هذا الحدث بأسلوبك الخاص وحسب شخصيتك وسياق المعركة في سطر واحد قصير ومثير جداً. أبدع في الوصف!
لا ترحب بالجمهور ولا تذكر اسمك، ابدأ بالتعليق على الحدث مباشرة!
تحذير هام جداً: اكتب بنص صافٍ ولا تستخدم التشكيل (الحركات مثل الفتحة والكسرة) على الحروف العربية أبداً.`;
    
    try {
        const comment = await askGemini(prompt);
        if (comment) {
            battleState.announcerColor = ANNOUNCER_COLORS[Math.floor(Math.random() * ANNOUNCER_COLORS.length)];
            battleState.announcerText = `🎙️ **المعلق ${name}:** ${comment.replace(/[\*🎙️]/g, '').trim()}`; 
            await updateAnnouncerMessage(battleState);
        }
    } finally {
        battleState.isAnnouncing = false;
    }
}

module.exports = { initAnnouncer, triggerAnnouncer };
