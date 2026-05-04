const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '../../');

function loadJsonData(fileName) {
    try {
        const filePath = path.join(rootDir, 'json', fileName);
        if (fs.existsSync(filePath)) return fs.readFileSync(filePath, 'utf8');
        return "{}"; 
    } catch (e) { return "{}"; }
}

const staticKnowledge = {
    adventurer_ranks: `
    [رتب المغامرين بناءً على نقاط السمعة (التزكية)]:
    - 1000 نقطة فما فوق: رتبة SS 👑
    - 500 نقطة فما فوق: رتبة S 💎
    - 250 نقطة فما فوق: رتبة A 🥇
    - 100 نقطة فما فوق: رتبة B 🥈
    - 50 نقطة فما فوق: رتبة C 🥉
    - 25 نقطة فما فوق: رتبة D ⚔️
    - 10 نقاط فما فوق: رتبة E 🛡️
    - أقل من 10 نقاط: رتبة F 🪵
    ملاحظة: السمعة هي مقياس لاحترام وثقة الإمبراطورية في المغامر، ويمكن للأعضاء تزكية بعضهم يومياً لرفع هذه النقاط.
    `,

    ranks: `
    [سلم النبالة والمكافآت - باللفل]:
    - المستوى 5 (رحال Traveler): فتح الوسائط (صور/فيديو)، الدعوات، والخاص.
    - المستوى 10 (مغامر Adventurer): إضافة صوت مخصص، قيادة الدنجن.
    - المستوى 20 (فارس Knight): إضافة إيموجي خاص للسيرفر.
    - المستوى 30 (بارون Baron): إضافة ستيكر خاص.
    - المستوى 40 (كونت Count): إنشاء رتبة خاصة بك.
    - المستوى 50 (دوق Duke): نيترو كلاسيك (أو قيمته).
    - المستوى 60 (أمير Prince): إطار ديسكورد (أو قيمته).
    - المستوى 70 (ملك King): لوحة اسم البروفايل (أو قيمته).
    - المستوى 80 (سلطان Sultan): نيترو جيمنج (أو قيمته).
    - المستوى 90 (قيصر Kaiser): إفكت بروفايل (أو قيمته).
    - المستوى 99 (إمبراطور Emperor): أي عنصر من المتجر أو نيترو جيمنج.
      
    [رتب النخبة VIP]:
    - المُعزّز (Booster): له كل المميزات.
    - القيصر (EM Ceasar): مشترك العضوية (2.99$)، له كل المميزات.
    `,
      
    laws: `
    [المرسوم الإمبراطوري]:
    1. الامتثال لقوانين ديسكورد الرسمية.
    2. يُمنع نشر المحتوى المخالف و المخلّ بالذوق العام.
    3. يُمنع الخوض في السياسة أو الدين.
    4. التزام حسن الخلق ومنع الألفاظ السيئة.
    (لا توجد قوانين أخرى غير هذه).
    `,

    shop: loadJsonData('shop-items.json').substring(0, 800),
    dungeon: loadJsonData('dungeon-config.json').substring(0, 800),
};

async function getDynamicServerData(guildId, db) {
    if (!db) return null;
    try {
        const topLevelsRes = await db.query('SELECT "user", "level" FROM levels WHERE "guild" = $1 ORDER BY "totalXP" DESC LIMIT 3', [guildId]);
        const topLevels = topLevelsRes.rows;
        
        const topRichRes = await db.query('SELECT "user", ("mora" + "bank") as total FROM levels WHERE "guild" = $1 ORDER BY total DESC LIMIT 3', [guildId]);
        const topRich = topRichRes.rows;

        const bossRes = await db.query('SELECT "name", "currentHP", "maxHP", "active" FROM world_boss WHERE "guildID" = $1', [guildId]);
        const boss = bossRes.rows[0];

        return { topLevels, topRich, boss };
    } catch (error) {
        console.error("[AI Dynamic Data Error]", error.message);
        return null;
    }
}

async function getUserData(userId, guildId, db) {
    if (!db) return { level: 0, total_wealth: 0, bank_balance: 0, wallet_cash: 0, streak: 0, reputation: 0, dungeon_floor: 0 };
    try {
        // ⚠️ تم تعديل الاستعلامات هنا لتقرأ الجداول بأسمائها المحمية 100%
        const levelRes = await db.query('SELECT "level", "xp", "mora", "bank" FROM levels WHERE "user" = $1 AND "guild" = $2', [userId, guildId]);
        const levelRow = levelRes.rows[0];
        
        const streakRes = await db.query('SELECT "streakCount" FROM streaks WHERE "userID" = $1 AND "guildID" = $2', [userId, guildId]);
        const streakRow = streakRes.rows[0];
        
        const repRes = await db.query('SELECT "rep_points" FROM user_reputation WHERE "userID" = $1 AND "guildID" = $2', [userId, guildId]);
        const repRow = repRes.rows[0];
        
        const dungeonRes = await db.query('SELECT "floor" as current_floor FROM dungeon_saves WHERE "hostID" = $1 AND "guildID" = $2', [userId, guildId]);
        const dungeonRow = dungeonRes.rows[0];
        
        const cash = levelRow ? (parseInt(levelRow.mora) || 0) : 0;
        const bank = levelRow ? (parseInt(levelRow.bank) || 0) : 0;

        return {
            level: levelRow ? parseInt(levelRow.level) : 1,
            xp: levelRow ? parseInt(levelRow.xp) : 0,
            
            wallet_cash: cash,            
            bank_balance: bank,          
            total_wealth: cash + bank,   
            
            streak: streakRow ? parseInt(streakRow.streakCount || streakRow.streakcount) : 0,
            reputation: repRow ? (parseInt(repRow.rep_points) || 0) : 0,            
            dungeon_floor: dungeonRow ? (parseInt(dungeonRow.current_floor) || 0) : 0 
        };
    } catch (error) {
        console.error("[User Data Fetch Error]", error.message);
        return { level: 0, total_wealth: 0, bank_balance: 0, wallet_cash: 0, streak: 0, reputation: 0, dungeon_floor: 0 };
    }
}

module.exports = { staticKnowledge, getUserData, getDynamicServerData };
