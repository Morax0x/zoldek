require('dotenv').config();
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    console.error("❌ [Database Error]: الرابط غير موجود! تأكد من إضافة DATABASE_URL في متغيرات Railway.");
    process.exit(1); 
}

// 🔥 فحص ذكي: إذا كان الرابط داخلي (internal) نوقف التشفير لجعله بسرعة البرق 🔥
const isInternal = connectionString.includes('.internal');

const db = new Pool({
    connectionString: connectionString,
    // إيقاف الـ SSL للاتصال الداخلي يسرع نقل البيانات بشكل هائل
    ssl: isInternal ? false : { rejectUnauthorized: false },
    max: 50, 
    idleTimeoutMillis: 30000, 
    connectionTimeoutMillis: 2000, 
    maxUses: 7500 
});

db.on('error', (err, client) => {
    console.error('❌ [Database Pool Error]:', err.message);
});

db.connect()
    .then(() => console.log(`✅ تم الاتصال بقاعدة البيانات (${isInternal ? 'الداخلية الصاروخية ⚡' : 'الخارجية 🌐'}) بنجاح! 🚀`))
    .catch(err => console.error("❌ خطأ في الاتصال بقاعدة البيانات:", err.message));

module.exports = db;
