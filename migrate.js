require('dotenv').config();
const Database = require('better-sqlite3');
const { Pool } = require('pg');
const path = require('path');

// 1. الاتصال بقاعدة SQLite القديمة
const sqlitePath = path.join(__dirname, 'mainDB.sqlite');
const sqliteDb = new Database(sqlitePath);

// 2. الاتصال بقاعدة PostgreSQL السحابية
const pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// قائمة بجميع الجداول التي تحتوي على بيانات مهمة
const tablesToMigrate = [
    'levels', 'settings', 'streaks', 'media_streaks',
    'user_daily_stats', 'user_weekly_stats', 'user_total_stats',
    'user_inventory', 'user_portfolio', 'user_loans',
    'user_reputation', 'user_weapons', 'user_skills',
    'marriages', 'children', 'quest_notifications',
    'user_quest_claims', 'user_achievements', 'market_items',
    'active_giveaways', 'giveaway_entries', 'race_roles'
];

async function migrate() {
    console.log("🚀 [بدء الهجرة الكبرى] جاري نقل بيانات الإمبراطورية إلى السحابة...\n");

    for (const table of tablesToMigrate) {
        try {
            // التحقق من وجود الجدول في SQLite القديم
            const checkTable = sqliteDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
            if (!checkTable) {
                console.log(`⚠️ الجدول [${table}] غير موجود في SQLite، جاري التخطي...`);
                continue;
            }

            // جلب كل البيانات
            const rows = sqliteDb.prepare(`SELECT * FROM ${table}`).all();
            if (rows.length === 0) {
                console.log(`ℹ️ الجدول [${table}] فارغ.`);
                continue;
            }

            console.log(`⏳ جاري نقل ${rows.length} صف إلى الجدول [${table}]...`);

            // تجهيز أسماء الأعمدة والقيم
            const columns = Object.keys(rows[0]);
            const colsString = columns.map(c => `"${c}"`).join(', ');
            const valsString = columns.map((_, i) => `$${i + 1}`).join(', ');

            let successCount = 0;
            let errorCount = 0;

            for (const row of rows) {
                const values = columns.map(col => row[col]);
                try {
                    // إدخال البيانات في السحابة (تجاهل التكرار إذا كان موجوداً مسبقاً)
                    await pgPool.query(`INSERT INTO "${table}" (${colsString}) VALUES (${valsString})`, values);
                    successCount++;
                } catch (err) {
                    // الكود 23505 يعني أن البيانات موجودة مسبقاً (Unique Violation)، سنتجاهله
                    if (err.code !== '23505') {
                        errorCount++;
                        // console.error(`خطأ في ${table}:`, err.message); // اختياري لعرض الأخطاء
                    } else {
                        // اعتباره ناجحاً إذا كان موجوداً بالفعل
                        successCount++;
                    }
                }
            }

            console.log(`✅ تم نقل [${table}] بنجاح! (${successCount} ناجح / ${errorCount} أخطاء)\n`);

        } catch (error) {
            console.error(`❌ خطأ فادح أثناء نقل الجدول [${table}]:`, error.message);
        }
    }

    console.log("🎉👑 [تمت الهجرة بنجاح!] بيانات الإمبراطورية أصبحت في السحابة الآن!");
    console.log("💡 يمكنك الآن تشغيل البوت (node index.js) بأمان.");
    process.exit(0);
}

migrate();
