// utils/aiActionHandler.js

const path = require('path');

// 🎨 استدعاء ملف الألوان لتنفيذه مباشرة
const colorsCommand = require('../commands/colors.js'); 

let tableCreated = false;

module.exports = {
    /**
     * تنفيذ الأوامر المرفقة في رد الذكاء الاصطناعي
     * الصيغ المدعومة:
     * - [ACTION:GIVE_MORA]
     * - [ACTION:TIMEOUT]
     * - [ACTION:SHOW_COLORS]
     * - [ACTION:SET_COLOR:5]
     */
    executeActions: async (message, actionString) => {
        const userID = message.author.id;
        const guildID = message.guild.id;
        const db = message.client.sql; // استخدام قاعدة بيانات PostgreSQL

        // التأكد من إنشاء الجدول في PostgreSQL مرة واحدة فقط
        if (!tableCreated && db) {
            try {
                await db.query(`CREATE TABLE IF NOT EXISTS ai_cooldowns ("userID" TEXT PRIMARY KEY, "lastMoraTime" BIGINT)`);
                tableCreated = true;
            } catch (err) {
                console.error("[AI Action] Error creating table:", err);
            }
        }

        // تنظيف النص واستخراج البيانات
        // مثال: [ACTION:SET_COLOR:5] -> Type: SET_COLOR, Value: 5
        const cleanAction = actionString.replace('[', '').replace(']', '').replace('ACTION:', '');
        const parts = cleanAction.split(':');
        const actionCode = parts[0]; 
        const actionValue = parts[1]; // قد يكون غير موجود في بعض الأوامر

        console.log(`[AI Action] Received request: ${actionCode} (Value: ${actionValue}) for user: ${message.author.tag}`);

        // =========================================================
        // 1. 🎨 نظام الألوان (Colors System)
        // =========================================================
        
        // أ) عرض اللوحة
        if (actionCode === 'SHOW_COLORS') {
            try {
                // نمرر مصفوفة فارغة في args ليفهم الكود أنه طلب عرض القائمة
                if (colorsCommand && colorsCommand.execute) {
                    await colorsCommand.execute(message, []);
                    return true;
                }
            } catch (e) {
                console.error("[AI Action Error] Show Colors:", e);
            }
        }

        // ب) تعيين لون محدد
        if (actionCode === 'SET_COLOR') {
            try {
                if (actionValue) {
                    // نمرر الرقم كـ args ليفهم الكود أنه طلب تغيير لون
                    if (colorsCommand && colorsCommand.execute) {
                        await colorsCommand.execute(message, [actionValue]);
                        return true;
                    }
                } else {
                    console.log("[AI Action] Set Color Rejected: No color number provided.");
                }
            } catch (e) {
                console.error("[AI Action Error] Set Color:", e);
            }
        }

        // =========================================================
        // 2. 💰 أمر إعطاء المورا (معدل + كولداون)
        // =========================================================
        if (actionCode === 'GIVE_MORA') {
            try {
                if (!db) return false;

                // أ) فحص الكولداون (ساعة واحدة) 🕒
                const oneHour = 60 * 60 * 1000;
                const now = Date.now();
                
                // 🔥 تم الإصلاح هنا: وضع أسماء الأعمدة بين "" 
                const cdRes = await db.query(`SELECT "lastMoraTime" FROM ai_cooldowns WHERE "userID" = $1`, [userID]);
                const cooldownData = cdRes.rows[0];
                const lastMoraTime = cooldownData ? (parseInt(cooldownData.lastmoratime || cooldownData.lastMoraTime) || 0) : 0;

                if (cooldownData && (now - lastMoraTime < oneHour)) {
                    console.log(`[AI Action] Give Mora Rejected: Cooldown active for ${message.author.tag}`);
                    return false;
                }

                // ب) فحص الثروة (الحد الأقصى 10,000) 💰
                // 🔥 تم الإصلاح هنا للبحث عن اليوزر والجلد بالأعمدة الصحيحة 
                const udRes = await db.query(`SELECT "mora", "bank" FROM levels WHERE "user" = $1 AND "guild" = $2`, [userID, guildID]);
                const userData = udRes.rows[0];
                
                const currentMora = userData ? (parseInt(userData.mora) || 0) : 0;
                const currentBank = userData ? (parseInt(userData.bank) || 0) : 0;
                const totalWealth = currentMora + currentBank;
                
                if (totalWealth >= 10000) {
                    console.log("[AI Action] Give Mora Rejected: User is too rich (>10k).");
                    return false; 
                }

                // 🔥 ج) التنفيذ: إعطاء مبلغ عشوائي بين 100 و 1000 🔥
                const amount = Math.floor(Math.random() * (1000 - 100 + 1)) + 100;

                // 🔥 تم الإصلاح هنا لاستخدام "user" و "guild" بدلاً من "userid"
                await db.query(`
                    INSERT INTO levels ("user", "guild", "mora", "bank", "xp", "level") 
                    VALUES ($1, $2, $3, 0, 0, 1) 
                    ON CONFLICT("user", "guild") 
                    DO UPDATE SET "mora" = COALESCE(levels."mora", 0) + $4
                `, [userID, guildID, amount, amount]);
                
                // د) تسجيل الكولداون
                // 🔥 تم الإصلاح بوضع الأعمدة بين ""
                await db.query(`
                    INSERT INTO ai_cooldowns ("userID", "lastMoraTime") 
                    VALUES ($1, $2) 
                    ON CONFLICT ("userID") 
                    DO UPDATE SET "lastMoraTime" = EXCLUDED."lastMoraTime"
                `, [userID, now]);

                await message.react('💸').catch(e => console.error("Failed to react:", e));

                console.log(`[AI Action] Give Mora Success (${amount} added).`);
                return true;
            } catch (e) {
                console.error("[AI Action Error] Give Mora:", e);
            }
        }

        // =========================================================
        // 3. 🚫 أمر التايم أوت (معدل لدقيقة واحدة)
        // =========================================================
        if (actionCode === 'TIMEOUT' || actionCode === 'TIMEOUT_5M') {
            try {
                // 🛑 فحص الأمان 1: هل العضو موجود؟
                if (!message.member) {
                    console.log("[AI Timeout] Failed: Member object not found.");
                    return false;
                }

                // 🛑 فحص الأمان 2: هل البوت يقدر عليه؟
                if (!message.member.moderatable) {
                    console.log(`[AI Timeout] Failed: Bot cannot punish ${message.author.tag}.`);
                    return false;
                }

                // المدة دقيقة واحدة (60 ثانية)
                await message.member.timeout(60 * 1000, "بأمر من الإمبراطورة (إزعاج/تطاول)");
                
                await message.react('🤐').catch(() => {});
                console.log(`[AI Timeout] Success: ${message.author.tag} muted for 1 min.`);
                return true;

            } catch (e) {
                console.error("[AI Action Error] Timeout:", e);
                if (e.code === 50013) {
                    console.log("⚠️ Missing Permissions: Please give the bot 'Moderate Members' permission.");
                }
            }
        }

        return false;
    }
};
