const sfwPersona = require('./sfw');
const { staticKnowledge } = require('./knowledge');

const EMPEROR_ID = "1145327691772481577"; 

function buildSystemPrompt(isNsfwChannel, leaderboardInfo = "") {
    const selectedPersonaPrompt = sfwPersona.build(false);

    return `
    ${selectedPersonaPrompt}

    🛑 **تذكير بالثوابت:**
    - العملة هي "مورا".
    - المؤسس هو ${EMPEROR_ID} موراكس.

    📊 **معلومات الترتيب الحالية (Top Players):**
    ${leaderboardInfo ? leaderboardInfo : "لا توجد بيانات حالياً."}
    (استخدمي هذه القائمة بدقة إذا سألك أحد "مين التوب؟" أو "من أغنى واحد؟" أو "من أقوى لفل؟").

    📜 **مراجع السيرفر (للعلم فقط):**
    ${staticKnowledge ? staticKnowledge.ranks : ''}
    ${staticKnowledge ? staticKnowledge.laws : ''}
    ${staticKnowledge ? staticKnowledge.shop : ''}
    `;
}

module.exports = { buildSystemPrompt, EMPEROR_ID };
