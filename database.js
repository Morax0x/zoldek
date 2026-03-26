require('dotenv').config();
const { Pool } = require('pg');

// نقرأ الرابط من Railway مباشرة، وإذا لم يجده يستخدم الرابط الداخلي كاحتياط
const connectionString = process.env.DATABASE_URL || "postgresql://postgres:jbfhGDzgPCLLhOiilJPYEFVyiFHHEOwq@postgres.railway.internal:5432/railway";

// ⚡ إعدادات الاتصال السريع (Turbo Pool)
const db = new Pool({
    connectionString: connectionString,
    ssl: false, // الاتصال الداخلي في ريلواي آمن ولا يحتاج SSL (يجعل الاتصال أسرع)
    max: 50, 
    idleTimeoutMillis: 30000, 
    connectionTimeoutMillis: 2000, 
    maxUses: 7500 
});

db.on('error', (err, client) => {
    console.error('❌ [Database Pool Error]:', err.message);
});

db.connect()
    .then(() => console.log("✅ تم الاتصال بقاعدة البيانات (Railway) بنجاح! 🚀"))
    .catch(err => console.error("❌ خطأ في الاتصال بقاعدة البيانات:", err.message));

module.exports = db;
