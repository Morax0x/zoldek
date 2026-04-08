const { EmbedBuilder, Colors } = require("discord.js");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const ANNOUNCER_COLORS = [Colors.Red, Colors.Gold, Colors.Orange, Colors.Purple, Colors.Blue, Colors.Green, Colors.DarkVividPink];

async function askGemini(prompt) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GEMINI_KEY;
    if (!apiKey) {
        console.error("[Announcer API Error]: ❌ مفتاح GEMINI_API_KEY غير موجود في ملف .env!");
        return null;
    }
    
    try {
        console.log(`[Announcer] ⏳ جاري طلب تعليق من الذكاء الاصطناعي...`);
        
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        
        const result = await model.generateContent(prompt);
        const text = result.response.text().trim();
        
        if (text) {
            console.log(`[Announcer] ✅ تم استلام التعليق.`);
            return text;
        } else {
            console.error(`[Announcer API Error]: ⚠️ استجابة فارغة أو غير متوقعة.`);
        }
    } catch (e) {
        console.error(`[Announcer API Error]: ⚠️ الموديل الأساسي فشل، محاولة الموديل البديل... (${e.message})`);
        try {
            const genAI = new GoogleGenerativeAI(apiKey);
            const fallbackModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            const result = await fallbackModel.generateContent(prompt);
            const text = result.response.text().trim();
            console.log(`[Announcer] ✅ تم استلام التعليق من الموديل البديل.`);
            return text;
        } catch (fallbackError) {
             console.error("[Announcer API Catch Error]: ❌ حدث خطأ فادح في الاتصال:", fallbackError.message);
        }
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
    } catch (e) {
        console.error("[Announcer Update Error]: ❌ فشل تعديل رسالة الديسكورد:", e.message);
    }
}

async function initAnnouncer(battleState, p1Name, p2Name) {
    if (battleState.isAnnouncing) return;
    battleState.isAnnouncing = true;
    battleState.announcerColor = ANNOUNCER_COLORS[Math.floor(Math.random() * ANNOUNCER_COLORS.length)];
    
    const prompt = `أنت معلق مجنون ودموي في حلبة معارك (RPG).
المطلوب منك:
1. ابتكر لنفسك اسماً عشوائياً من كلمة واحدة (كن مبدعاً ولا تكتب كلمة المعلق في اسمك).
2. رحب بالجمهور والمقاتلين (${p1Name} ضد ${p2Name}) بأسلوب حماسي جداً في سطر واحد.
اكتب ردك بصيغة:
الاسم|الترحيب`;

    try {
        const res = await askGemini(prompt);
        let name = "المرعب"; 
        let welcome = `أهلاً بكم في هذه المعركة الطاحنة بين ${p1Name} و ${p2Name}!`;
        
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

    const prompt = `أنت معلق المعركة واسمك "${name}".
الحدث الذي حصل للتو: ${eventText}
علق على هذا الحدث بأسلوبك الجنوني في سطر واحد قصير ومثير. لا ترحب ولا تذكر اسمك، اصرخ بالتعليق مباشرة!`;
    
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
