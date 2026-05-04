require('dotenv').config();
const { Pool } = require('pg');

// 👑 يسحب الرابط من المتغيرات مباشرة
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    console.error("❌ [Database Error]: الرابط غير موجود! تأكد من إضافة DATABASE_URL في متغيرات Railway.");
    process.exit(1); 
}

const db = new Pool({
    connectionString: connectionString,
    // فعلنا الـ SSL عشان الرابط الخارجي يشتغل بأعلى حماية وبدون أخطاء
    ssl: { rejectUnauthorized: false },
    max: 50,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000, // ✅ زيادة من 2000 إلى 5000ms لتجنب الأخطاء تحت الضغط
    maxUses: 7500
});

db.on('error', (err, client) => {
    console.error('❌ [Database Pool Error]:', err.message);
});

db.connect()
    .then(() => console.log("✅ تم الاتصال بقاعدة البيانات بنجاح! 🚀"))
    .catch(err => console.error("❌ خطأ في الاتصال بقاعدة البيانات:", err.message));

module.exports = db;
