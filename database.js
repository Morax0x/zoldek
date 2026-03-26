require('dotenv').config();
const { Pool } = require('pg');

// 👑 الاعتماد الكلي على المتغيرات (أأمن وأفضل طريقة)
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    console.error("❌ [Database Error]: الرابط غير موجود! تأكد من إضافة DATABASE_URL في متغيرات Railway.");
    process.exit(1); // يوقف البوت فوراً عشان ما يخرب البيانات
}

const db = new Pool({
    connectionString: connectionString,
    // فعلنا الـ SSL تجنباً لأي مشاكل عند استخدام الرابط الخارجي
    ssl: { rejectUnauthorized: false },
    max: 50, 
    idleTimeoutMillis: 30000, 
    connectionTimeoutMillis: 2000, 
    maxUses: 7500 
});

db.on('error', (err, client) => {
    console.error('❌ [Database Pool Error]:', err.message);
});

db.connect()
    .then(() => console.log("✅ تم الاتصال بقاعدة البيانات بنجاح! 🚀"))
    .catch(err => console.error("❌ خطأ في الاتصال بقاعدة البيانات:", err.message));

module.exports = db;
