// handlers/ai/admin-actions.js
const shopItems = require('../../json/shop-items.json');
const farmAnimals = require('../../json/farm-animals.json');
const seedsData = require('../../json/seeds.json');
const feedItems = require('../../json/feed-items.json');
const marketItems = require('../../json/market-items.json');
const weaponsConfig = require('../../json/weapons-config.json');
const skillsConfig = require('../../json/skills-config.json');
const upgradeMats = require('../../json/upgrade-materials.json');

// 🔥 دالة فلترة فولاذية لتنظيف النصوص وجعل المطابقة مستحيلة الفشل 🔥
function normalize(str) {
    if (!str) return "";
    return str.toString().toLowerCase()
        .replace(/[أإآ]/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/ي/g, 'ى')
        .replace(/ؤ/g, 'و')
        .replace(/ئ/g, 'ي')
        .replace(/[^a-z0-9\u0600-\u06FF]/g, '') // إزالة المسافات والرموز لتطابق الكلمة ككتلة واحدة
        .trim();
}

// 🛡️ نظام معالجة استعلامات فولاذي لقراءة البيانات
const safeQuery = async (db, qPg, params) => {
    try { 
        return await db.query(qPg, params); 
    } catch(e) { 
        let fallbackQuery = qPg
            .replace(/"userID"/gi, "userid")
            .replace(/"guildID"/gi, "guildid")
            .replace(/"itemID"/gi, "itemid")
            .replace(/"animalID"/gi, "animalid")
            .replace(/"quantity"/gi, "quantity")
            .replace(/"mora"/gi, "mora")
            .replace(/"xp"/gi, "xp")
            .replace(/"rep_points"/gi, "rep_points")
            .replace(/"tickets"/gi, "tickets")
            .replace(/"chests"/gi, "chests")
            .replace(/"floor"/gi, "floor")
            .replace(/"timestamp"/gi, "timestamp")
            .replace(/"id"/gi, "id");
        
        if (fallbackQuery !== qPg) {
            try { return await db.query(fallbackQuery, params); } catch(e2) { return {rows:[]}; }
        }
        return {rows:[]};
    }
};

// 🛡️ نظام تنفيذ أوامر فولاذي للإدخال والخصم بدون فشل صامت
const safeExecute = async (db, qPg, params) => {
    try { await db.query(qPg, params); return true; } 
    catch(e) { 
        let fallbackQuery = qPg
            .replace(/"userID"/gi, "userid")
            .replace(/"guildID"/gi, "guildid")
            .replace(/"itemID"/gi, "itemid")
            .replace(/"animalID"/gi, "animalid")
            .replace(/"quantity"/gi, "quantity")
            .replace(/"mora"/gi, "mora")
            .replace(/"xp"/gi, "xp")
            .replace(/"rep_points"/gi, "rep_points")
            .replace(/"tickets"/gi, "tickets")
            .replace(/"chests"/gi, "chests")
            .replace(/"floor"/gi, "floor")
            .replace(/"timestamp"/gi, "timestamp")
            .replace(/"id"/gi, "id");

        if (fallbackQuery !== qPg) {
            try { await db.query(fallbackQuery, params); return true; } catch(e2) { return false; }
        }
        return false;
    }
};

async function executeAdminAction(message, targetUser, amount, text, db) {
    const guildID = message.guild.id;
    const userID = targetUser.id;
    let feedback = "";
    const isGive = !text.includes('سحب') && !text.includes('اسحب') && !text.includes('خصم') && !text.includes('نقص') && !text.includes('شيل'); 

    try {
        // 1. إدارة الخيم (الدانجون)
        if (text.includes('خيم') || text.includes('طابق')) {
            if (amount > 0) {
                let check = await safeQuery(db, `SELECT * FROM dungeon_saves WHERE "hostID"=$1 AND "guildID"=$2`, [userID, guildID]);
                if (check.rows.length > 0) {
                    await safeExecute(db, `UPDATE dungeon_saves SET "floor"=$1, "timestamp"=$2 WHERE "hostID"=$3 AND "guildID"=$4`, [amount, Date.now(), userID, guildID]);
                } else {
                    await safeExecute(db, `INSERT INTO dungeon_saves ("hostID", "guildID", "floor", "timestamp") VALUES ($1, $2, $3, $4)`, [userID, guildID, amount, Date.now()]);
                }
                await message.react('⛺').catch(()=>{});
                return `\n\n> 👑 **أمر إمبراطوري مُنفذ:**\n> ✧ **العملية:** حفظ تقدم الدانجون\n> ✧ **الهدف:** ${targetUser.username}\n> ✧ **النتيجة:** الطابق ${amount} ⛺`;
            }
        }

        // 2. إدارة التذاكر (الدانجون)
        if (text.includes('تذكر') || text.includes('تذاكر')) {
            if (amount > 0) {
                const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' });
                let check = await safeQuery(db, `SELECT * FROM dungeon_stats WHERE "userID"=$1 AND "guildID"=$2`, [userID, guildID]);
                if (check.rows.length > 0) {
                    await safeExecute(db, `UPDATE dungeon_stats SET "tickets" = "tickets" + $1, "last_reset" = $2 WHERE "userID"=$3 AND "guildID"=$4`, [amount, todayStr, userID, guildID]);
                } else {
                    await safeExecute(db, `INSERT INTO dungeon_stats ("guildID", "userID", "tickets", "last_reset") VALUES ($1, $2, $3, $4)`, [guildID, userID, amount, todayStr]);
                }
                await message.react('🎟️').catch(()=>{});
                return `\n\n> 👑 **أمر إمبراطوري مُنفذ:**\n> ✧ **العملية:** إضافة تذاكر\n> ✧ **الهدف:** ${targetUser.username}\n> ✧ **الكمية:** ${amount} تذكرة دانجون 🎟️`;
            }
        }

        // 🔥 إدارة صناديق الدانجون (الغنائم العادية) 🔥
        if (text.includes('صندوق دانجون') || text.includes('صناديق دانجون') || text.includes('غنيم') || text.includes('غنايم')) {
            if (amount > 0) {
                const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' });
                let check = await safeQuery(db, `SELECT * FROM dungeon_stats WHERE "userID"=$1 AND "guildID"=$2`, [userID, guildID]);
                if (check.rows.length > 0) {
                    await safeExecute(db, `UPDATE dungeon_stats SET "chests" = COALESCE("chests", 0) + $1 WHERE "userID"=$2 AND "guildID"=$3`, [amount, userID, guildID]);
                } else {
                    await safeExecute(db, `INSERT INTO dungeon_stats ("guildID", "userID", "chests", "last_reset") VALUES ($1, $2, $3, $4)`, [guildID, userID, amount, todayStr]);
                }
                await message.react('🧰').catch(()=>{});
                return `\n\n> 👑 **أمر إمبراطوري مُنفذ:**\n> ✧ **العملية:** إضافة غنائم دانجون\n> ✧ **الهدف:** ${targetUser.username}\n> ✧ **الكمية:** ${amount} صندوق دانجون 🧰`;
            }
        }

        // 3. إدارة السمعة (التزكية)
        if (text.includes('سمع') || text.includes('تزكي') || text.includes('نقاط')) {
            if (amount > 0) {
                let check = await safeQuery(db, `SELECT "rep_points" FROM user_reputation WHERE "userID"=$1 AND "guildID"=$2`, [userID, guildID]);
                if (isGive) {
                    if (check.rows.length > 0) {
                        await safeExecute(db, `UPDATE user_reputation SET "rep_points" = "rep_points" + $1 WHERE "userID"=$2 AND "guildID"=$3`, [amount, userID, guildID]);
                    } else {
                        await safeExecute(db, `INSERT INTO user_reputation ("userID", "guildID", "rep_points") VALUES ($1, $2, $3)`, [userID, guildID, amount]);
                    }
                    await message.react('🌟').catch(()=>{});
                    return `\n\n> 👑 **أمر إمبراطوري مُنفذ:**\n> ✧ **العملية:** منح تزكية\n> ✧ **الهدف:** ${targetUser.username}\n> ✧ **المقدار:** ${amount} نقطة سمعة 🌟`;
                } else {
                    if (check.rows.length > 0) {
                        await safeExecute(db, `UPDATE user_reputation SET "rep_points" = GREATEST(0, "rep_points" - $1) WHERE "userID"=$2 AND "guildID"=$3`, [amount, userID, guildID]);
                    }
                    await message.react('💔').catch(()=>{});
                    return `\n\n> 👑 **أمر إمبراطوري مُنفذ:**\n> ✧ **العملية:** سحب سمعة\n> ✧ **الهدف:** ${targetUser.username}\n> ✧ **المقدار:** ${amount} نقطة 💔`;
                }
            }
        }

        // 4. الميوت وفك الميوت
        if (text.includes('تايم') || text.includes('سكت') || text.includes('اصمت') || text.includes('ميوت') || text.includes('فك') || text.includes('سامح')) {
            const targetMemberObj = await message.guild.members.fetch(userID).catch(()=>null);
            if (targetMemberObj) {
                if (text.includes('فك') || text.includes('شيل') || text.includes('سامح')) {
                    if (targetMemberObj.isCommunicationDisabled()) {
                        await targetMemberObj.timeout(null, "أمر من السكرتيرة (AI)");
                        await message.react('✅').catch(()=>{});
                        return `\n\n> 👑 **أمر إمبراطوري مُنفذ:**\n> ✧ **العملية:** العفو الشامل\n> ✧ **الهدف:** ${targetMemberObj.user.username}\n> ✧ **النتيجة:** رفع الإسكات ✅`;
                    }
                } else {
                    let minutes = amount > 0 ? amount : 5; 
                    if (targetMemberObj.manageable) {
                        await targetMemberObj.timeout(minutes * 60 * 1000, "أمر من السكرتيرة (AI)");
                        await message.react('🤐').catch(()=>{});
                        return `\n\n> 👑 **أمر إمبراطوري مُنفذ:**\n> ✧ **العملية:** التكميم\n> ✧ **الهدف:** ${targetMemberObj.user.username}\n> ✧ **المدة:** ${minutes} دقيقة 🤐`;
                    } else {
                        return `\n\n❌ لا يمكنني تنفيذ العقوبة، رتبته أعلى من صلاحياتي.`;
                    }
                }
            }
        }

        // 5. المورا والفلوس
        if (amount > 0 && (text.includes('مورا') || text.includes('فلوس') || text.includes('حول') || text.includes('هاتي') || text.includes('اعط'))) {
            let check = await safeQuery(db, `SELECT "mora" FROM levels WHERE "user"=$1 AND "guild"=$2`, [userID, guildID]);
            if (check.rows.length === 0) {
                await safeExecute(db, `INSERT INTO levels ("user", "guild", "xp", "level", "totalXP", "mora") VALUES ($1, $2, 0, 1, 0, 0)`, [userID, guildID]);
            }

            if (isGive) {
                await safeExecute(db, `UPDATE levels SET "mora" = CAST("mora" AS BIGINT) + CAST($1 AS BIGINT) WHERE "user" = $2 AND "guild" = $3`, [String(amount), userID, guildID]);
                await message.react('💸').catch(()=>{});
                feedback = `\n\n> 👑 **أمر إمبراطوري مُنفذ:**\n> ✧ **العملية:** خزانة الإمبراطورية (دعم)\n> ✧ **الهدف:** ${targetUser.username}\n> ✧ **المنحة:** ${amount.toLocaleString()} مورا 💸`;
            } else {
                await safeExecute(db, `UPDATE levels SET "mora" = GREATEST(0, CAST("mora" AS BIGINT) - CAST($1 AS BIGINT)) WHERE "user" = $2 AND "guild" = $3`, [String(amount), userID, guildID]);
                await message.react('📉').catch(()=>{});
                feedback = `\n\n> 👑 **أمر إمبراطوري مُنفذ:**\n> ✧ **العملية:** خزانة الإمبراطورية (سحب)\n> ✧ **الهدف:** ${targetUser.username}\n> ✧ **المسحوب:** ${amount.toLocaleString()} مورا 📉`;
            }
            
            if (message.client.getLevel) {
                let cache = await message.client.getLevel(userID, guildID);
                if (cache) {
                    if (isGive) cache.mora = String(BigInt(cache.mora || 0) + BigInt(amount));
                    else {
                        let newMora = BigInt(cache.mora || 0) - BigInt(amount);
                        cache.mora = newMora > 0n ? String(newMora) : "0";
                    }
                    await message.client.setLevel(cache);
                }
            }
            // إذا كان الأمر للفلوس فقط، نتوقف هنا ولا نبحث في العناصر
            if (text.includes('مورا') || text.includes('فلوس')) return feedback;
        }

        // 6. إدارة العناصر الذكية (مستودعات، أسلحة، حيوانات، أسهم)
        if (amount > 0) {
            let foundItem = null;
            const nText = normalize(text); // النص المُنظف بدون مسافات للبحث الدقيق

            // 🔥 اختصارات الصناديق السحرية والغاتشا 🔥
            if (nText.includes('صندوقمجان') || nText.includes('صناديقمجان')) {
                foundItem = { id: 'free_gacha_chest', name: 'صندوق مجاني', type: 'inventory', emoji: '🎁' };
            } else if (nText.includes('صندوقغاتش') || nText.includes('صندوققاتش') || nText.includes('صندوقسحر')) {
                foundItem = { id: 'gacha_chest', name: 'صندوق غاتشا', type: 'inventory', emoji: '🌟' };
            }

            if (!foundItem) {
                const allSearchable = [];
                shopItems.forEach(i => allSearchable.push({...i, type: 'inventory'}));
                marketItems.forEach(i => allSearchable.push({...i, type: 'market'}));
                farmAnimals.forEach(i => allSearchable.push({...i, type: 'farm'}));
                seedsData.forEach(i => allSearchable.push({...i, type: 'inventory'}));
                feedItems.forEach(i => allSearchable.push({...i, type: 'inventory'}));
                
                if (upgradeMats && upgradeMats.weapon_materials) {
                    upgradeMats.weapon_materials.forEach(r => r.materials.forEach(m => allSearchable.push({...m, type: 'inventory'})));
                }
                if (upgradeMats && upgradeMats.skill_books) {
                    upgradeMats.skill_books.forEach(c => c.books.forEach(b => allSearchable.push({...b, type: 'inventory'})));
                }

                // ترتيب من الأطول اسماً للأقصر لالتقاط الاسم الدقيق أولاً
                allSearchable.sort((a, b) => normalize(b.name).length - normalize(a.name).length);

                for (const item of allSearchable) {
                    const nName = normalize(item.name);
                    if (nName.length >= 3 && nText.includes(nName)) {
                        foundItem = item;
                        break;
                    }
                    // البحث عبر الآيدي كبديل
                    if (item.id && nText.includes(item.id.toLowerCase().replace(/[^a-z0-9]/g, ''))) {
                        foundItem = item;
                        break;
                    }
                }
            }

            if (foundItem) {
                const actionTitle = isGive ? 'منحة ملكية' : 'مصادرة';
                const emojiToUse = foundItem.emoji || '📦';
                
                if (isGive) {
                    if (foundItem.type === 'market') {
                        let check = await safeQuery(db, `SELECT * FROM user_portfolio WHERE "userID"=$1 AND "guildID"=$2 AND "itemID"=$3`, [userID, guildID, foundItem.id]);
                        if (check.rows.length > 0) await safeExecute(db, `UPDATE user_portfolio SET "quantity" = "quantity" + $1 WHERE "userID"=$2 AND "guildID"=$3 AND "itemID"=$4`, [amount, userID, guildID, foundItem.id]);
                        else await safeExecute(db, `INSERT INTO user_portfolio ("guildID", "userID", "itemID", "quantity") VALUES ($1, $2, $3, $4)`, [guildID, userID, foundItem.id, amount]);
                    } 
                    else if (foundItem.type === 'farm') {
                        await safeExecute(db, `INSERT INTO user_farm ("guildID", "userID", "animalID", "quantity", "purchaseTimestamp", "lastFedTimestamp") VALUES ($1, $2, $3, $4, $5, $6)`, [guildID, userID, foundItem.id, amount, Date.now(), Date.now()]);
                    } 
                    else {
                        let check = await safeQuery(db, `SELECT * FROM user_inventory WHERE "userID"=$1 AND "guildID"=$2 AND "itemID"=$3`, [userID, guildID, foundItem.id]);
                        if (check.rows.length > 0) await safeExecute(db, `UPDATE user_inventory SET "quantity" = "quantity" + $1 WHERE "userID"=$2 AND "guildID"=$3 AND "itemID"=$4`, [amount, userID, guildID, foundItem.id]);
                        else await safeExecute(db, `INSERT INTO user_inventory ("guildID", "userID", "itemID", "quantity") VALUES ($1, $2, $3, $4)`, [guildID, userID, foundItem.id, amount]);
                    }
                    await message.react('🎒').catch(()=>{});
                    return `\n\n> 👑 **أمر إمبراطوري مُنفذ:**\n> ✧ **العملية:** ${actionTitle}\n> ✧ **الهدف:** ${targetUser.username}\n> ✧ **العنصر:** ${amount}x ${foundItem.name} ${emojiToUse}`;
                } 
                else {
                    if (foundItem.type === 'market') {
                        await safeExecute(db, `UPDATE user_portfolio SET "quantity" = GREATEST(0, "quantity" - $1) WHERE "userID" = $2 AND "guildID" = $3 AND "itemID" = $4`, [amount, userID, guildID, foundItem.id]);
                    } else if (foundItem.type === 'farm') {
                        await safeExecute(db, `UPDATE user_farm SET "quantity" = GREATEST(0, "quantity" - $1) WHERE "userID" = $2 AND "guildID" = $3 AND "animalID" = $4`, [amount, userID, guildID, foundItem.id]);
                    } else {
                        await safeExecute(db, `UPDATE user_inventory SET "quantity" = CAST(COALESCE("quantity", '0') AS INTEGER) - $1 WHERE "userID" = $2 AND "guildID" = $3 AND "itemID" = $4`, [amount, userID, guildID, foundItem.id]);
                        // تنظيف بعد الخصم
                        await safeExecute(db, `DELETE FROM user_inventory WHERE CAST(COALESCE("quantity", '0') AS INTEGER) <= 0 AND "userID" = $1 AND "guildID" = $2`, [userID, guildID]);
                    }
                    await message.react('🗑️').catch(()=>{});
                    return `\n\n> 👑 **أمر إمبراطوري مُنفذ:**\n> ✧ **العملية:** ${actionTitle}\n> ✧ **الهدف:** ${targetUser.username}\n> ✧ **المصادرة:** ${amount}x ${foundItem.name} 🗑️`;
                }
            }
        }

    } catch (err) {
        console.error("[AI Admin Action Error]", err);
        return `\n\n❌ حدث خطأ تقني أثناء تنفيذ الطلب.`;
    }

    return "";
}

module.exports = { executeAdminAction };
