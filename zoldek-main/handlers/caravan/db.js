const safeQuery = async (db, q, p) => {
    try {
        const r = await db.query(q, p);
        return { rows: Array.isArray(r) ? r : (r?.rows || []) };
    } catch (e) {
        const q2 = q.replace(/"([a-zA-Z]+)"/g, (_, c) => c.toLowerCase());
        if (q2 === q) return { rows: [] };
        try {
            const r2 = await db.query(q2, p);
            return { rows: Array.isArray(r2) ? r2 : (r2?.rows || []) };
        } catch { return { rows: [] }; }
    }
};

const safeExecute = async (db, q, p) => {
    try { await db.query(q, p); return true; }
    catch (e) {
        const q2 = q.replace(/"([a-zA-Z]+)"/g, (_, c) => c.toLowerCase());
        if (q2 === q) return false;
        try { await db.query(q2, p); return true; } catch { return false; }
    }
};

module.exports = { safeQuery, safeExecute };
