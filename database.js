const { Pool } = require('pg');

// الرابط الصحيح والمضمون للـ Pooler
const connectionString = "postgresql://postgres:jbfhGDzgPCLLhOiilJPYEFVyiFHHEOwq@postgres.railway.internal:5432/railway";

// هذا السطر السحري يجبر الاستضافة تتصل بشكل صحيح (IPv4) لتجنب أخطاء الشبكة
const pg = require('pg');
if (pg.defaults) {
    pg.defaults.family = 4;
}

// ⚡ إعدادات الاتصال السريع (Turbo Pool)
const db = new Pool({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false },
    max: 50, // 🚀 السماح بـ 50 اتصال متزامن في نفس اللحظة لإنهاء طابور الانتظار
    idleTimeoutMillis: 30000, // إغلاق الاتصالات الخاملة بعد 30 ثانية لتوفير الذاكرة
    connectionTimeoutMillis: 2000, // البوت لن ينتظر أكثر من ثانيتين للاتصال
    maxUses: 7500 // تجديد الاتصال بعد 7500 استخدام لضمان بقائه في أعلى سرعة
});

db.on('error', (err, client) => {
    console.error('❌ [Database Pool Error]:', err.message);
});

db.connect()
    .then(() => console.log("✅ تم الاتصال بالبنك المركزي (Supabase) السريع بنجاح! 🚀"))
    .catch(err => console.error("❌ خطأ في الاتصال بقاعدة البيانات:", err.message));

module.exports = db;
