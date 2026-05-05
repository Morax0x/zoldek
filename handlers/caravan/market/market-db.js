const { safeQuery, safeExecute } = require('../db');

async function initMarketTables(db) {
    await safeExecute(db, `
        CREATE TABLE IF NOT EXISTS caravan_market_listings (
            "id"              BIGSERIAL PRIMARY KEY,
            "caravanId"       BIGINT NOT NULL,
            "ownerID"         TEXT NOT NULL,
            "guildID"         TEXT NOT NULL,
            "itemID"          TEXT NOT NULL,
            "itemName"        TEXT NOT NULL,
            "itemEmoji"       TEXT DEFAULT '📦',
            "quantity"        BIGINT NOT NULL,
            "pricePerUnit"    BIGINT NOT NULL,
            "quantitySold"    BIGINT DEFAULT 0,
            "status"          TEXT DEFAULT 'active',
            "threadId"        TEXT DEFAULT NULL,
            "createdAt"       BIGINT DEFAULT 0
        )
    `);

    await safeExecute(db, `
        CREATE TABLE IF NOT EXISTS caravan_market_sessions (
            "id"              BIGSERIAL PRIMARY KEY,
            "caravanId"       BIGINT NOT NULL,
            "ownerID"         TEXT NOT NULL,
            "guildID"         TEXT NOT NULL,
            "destinationId"   TEXT NOT NULL,
            "threadId"        TEXT NOT NULL,
            "channelId"       TEXT NOT NULL,
            "createdAt"       BIGINT DEFAULT 0,
            "expiresAt"       BIGINT DEFAULT 0,
            "status"          TEXT DEFAULT 'open',
            "npcSpawnCount"   BIGINT DEFAULT 0,
            "totalSales"      BIGINT DEFAULT 0,
            "totalRevenue"    BIGINT DEFAULT 0
        )
    `);

    await safeExecute(db, `
        CREATE TABLE IF NOT EXISTS caravan_market_transactions (
            "id"              BIGSERIAL PRIMARY KEY,
            "listingId"       BIGINT NOT NULL,
            "buyerID"         TEXT NOT NULL,
            "sellerID"        TEXT NOT NULL,
            "guildID"         TEXT NOT NULL,
            "itemID"          TEXT NOT NULL,
            "quantity"        BIGINT NOT NULL,
            "pricePerUnit"    BIGINT NOT NULL,
            "totalPrice"      BIGINT NOT NULL,
            "buyerType"       TEXT DEFAULT 'player',
            "createdAt"       BIGINT DEFAULT 0
        )
    `);
}

async function createListing(db, caravanId, ownerId, guildId, item) {
    const now = Date.now();
    const result = await safeQuery(db, `
        INSERT INTO caravan_market_listings
            ("caravanId","ownerID","guildID","itemID","itemName","itemEmoji",
             "quantity","pricePerUnit","quantitySold","status","createdAt")
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,'active',$9)
        RETURNING "id"
    `, [caravanId, ownerId, guildId, item.itemId, item.itemName, item.itemEmoji || '📦',
        item.quantity, item.pricePerUnit, now]);

    return result.rows[0]?.id || null;
}

async function lockItemsFromInventory(db, guildId, userId, listings) {
    for (const listing of listings) {
        await safeExecute(db, `
            UPDATE user_inventory
            SET "quantity" = GREATEST(0, CAST(COALESCE("quantity",'0') AS BIGINT) - $1)
            WHERE "guildID"=$2 AND "userID"=$3 AND ("itemID"=$4 OR "itemid"=$4)
              AND CAST(COALESCE("quantity",'0') AS BIGINT) >= $1
        `, [listing.quantity, guildId, userId, listing.itemId]);
    }
}

async function getListingsByCaravan(db, caravanId) {
    const result = await safeQuery(db, `
        SELECT * FROM caravan_market_listings
        WHERE "caravanId"=$1 AND "status"='active'
        ORDER BY "id" ASC
    `, [caravanId]);
    return result.rows || [];
}

async function getListingsBySession(db, threadId) {
    const result = await safeQuery(db, `
        SELECT l.* FROM caravan_market_listings l
        INNER JOIN caravan_market_sessions s ON l."caravanId" = s."caravanId"
        WHERE s."threadId"=$1 AND l."status"='active' AND s."status"='open'
        ORDER BY l."id" ASC
    `, [threadId]);
    return result.rows || [];
}

async function getSessionByThread(db, threadId) {
    const result = await safeQuery(db, `
        SELECT * FROM caravan_market_sessions WHERE "threadId"=$1
    `, [threadId]);
    return result.rows[0] || null;
}

async function getSessionByCaravan(db, caravanId) {
    const result = await safeQuery(db, `
        SELECT * FROM caravan_market_sessions WHERE "caravanId"=$1
    `, [caravanId]);
    return result.rows[0] || null;
}

async function createMarketSession(db, caravanId, ownerId, guildId, destId, threadId, channelId, durationMs) {
    const now = Date.now();
    const result = await safeQuery(db, `
        INSERT INTO caravan_market_sessions
            ("caravanId","ownerID","guildID","destinationId","threadId","channelId",
             "createdAt","expiresAt","status","npcSpawnCount","totalSales","totalRevenue")
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'open',0,0,0)
        RETURNING "id"
    `, [caravanId, ownerId, guildId, destId, threadId, channelId, now, now + durationMs]);

    await safeExecute(db, `
        UPDATE caravan_market_listings SET "threadId"=$1
        WHERE "caravanId"=$2
    `, [threadId, caravanId]);

    return result.rows[0]?.id || null;
}

// 👑 دالة الشراء الفولاذية الجديدة: تفحص الداتابيس بدقة وتحدّث الكاش 👑
async function buyItem(db, listingId, buyerId, sellerId, guildId, itemId, quantity, pricePerUnit, buyerType = 'player', client = null) {
    const totalPrice = quantity * pricePerUnit;
    const now = Date.now();

    const listingRes = await safeQuery(db, `
        SELECT * FROM caravan_market_listings WHERE "id"=$1 AND "status"='active'
    `, [listingId]);

    if (!listingRes.rows.length) return { error: 'السلعة غير موجودة أو تم بيعها بالكامل.' };

    const listing = listingRes.rows[0];
    const available = Number(listing.quantity) - Number(listing.quantitysold || listing.quantitySold || 0);

    if (quantity > available) return { error: 'الكمية المطلوبة غير متوفرة حالياً في المتجر.' };
    if (totalPrice <= 0) return { error: 'السعر المدخل غير صالح.' };

    // 1️⃣ خصم المورا من المشتري الحقيقي وتحديث كاشه
    if (buyerType === 'player') {
        let buyerMora = 0;
        try {
            const bLevel = await db.query(`SELECT "mora" FROM levels WHERE "user"=$1 AND "guild"=$2`, [buyerId, guildId]);
            buyerMora = Number(bLevel.rows[0]?.mora || 0);
        } catch(e) {
            const bLevel2 = await db.query(`SELECT mora FROM levels WHERE userid=$1 AND guildid=$2`, [buyerId, guildId]).catch(()=>({rows:[]}));
            buyerMora = Number(bLevel2.rows[0]?.mora || 0);
        }

        if (buyerMora < totalPrice && client && typeof client.getLevel === 'function') {
            const u = await client.getLevel(buyerId, guildId);
            buyerMora = Number(u?.mora || 0);
        }

        if (buyerMora < totalPrice) return { error: 'رصيدك من المورا غير كافٍ لإتمام الشراء.' };

        let dbUpdated = false;
        try {
            let r = await db.query(`UPDATE levels SET "mora" = CAST(COALESCE("mora",'0') AS BIGINT) - $1 WHERE "user"=$2 AND "guild"=$3 RETURNING *`, [totalPrice, buyerId, guildId]);
            if (r.rowCount > 0) dbUpdated = true;
        } catch(e) {}
        if (!dbUpdated) {
            await db.query(`UPDATE levels SET mora = CAST(COALESCE(mora,'0') AS BIGINT) - $1 WHERE userid=$2 AND guildid=$3`).catch(()=>{});
        }
        
        if (client && typeof client.getLevel === 'function') {
            try {
                let u = await client.getLevel(buyerId, guildId);
                if (u) { u.mora = String(Number(u.mora || 0) - totalPrice); await client.setLevel(u); }
            } catch(e) {}
        }
    }

    // 2️⃣ إضافة المورا للبائع وتحديث كاشه
    let sDbUpdated = false;
    try {
        let r = await db.query(`UPDATE levels SET "mora" = CAST(COALESCE("mora",'0') AS BIGINT) + $1 WHERE "user"=$2 AND "guild"=$3 RETURNING *`, [totalPrice, sellerId, guildId]);
        if (r.rowCount > 0) sDbUpdated = true;
    } catch(e) {}
    if (!sDbUpdated) {
        await db.query(`UPDATE levels SET mora = CAST(COALESCE(mora,'0') AS BIGINT) + $1 WHERE userid=$2 AND guildid=$3`).catch(()=>{});
    }

    if (client && typeof client.getLevel === 'function') {
        try {
            let s = await client.getLevel(sellerId, guildId);
            if (s) { s.mora = String(Number(s.mora || 0) + totalPrice); await client.setLevel(s); }
        } catch(e) {}
    }

    // 3️⃣ تحديث البضائع والمبيعات في السوق
    await safeExecute(db, `
        UPDATE caravan_market_listings SET "quantitySold" = COALESCE("quantitySold", 0) + $1
        WHERE "id"=$2
    `, [quantity, listingId]);

    if (available - quantity <= 0) {
        await safeExecute(db, `
            UPDATE caravan_market_listings SET "status"='sold_out' WHERE "id"=$1
        `, [listingId]);
    }

    await safeExecute(db, `
        INSERT INTO caravan_market_transactions
            ("listingId","buyerID","sellerID","guildID","itemID","quantity",
             "pricePerUnit","totalPrice","buyerType","createdAt")
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    `, [listingId, buyerId, sellerId, guildId, itemId, quantity, pricePerUnit, totalPrice, buyerType, now]);

    await safeExecute(db, `
        UPDATE caravan_market_sessions
        SET "totalSales" = COALESCE("totalSales", 0) + 1, "totalRevenue" = COALESCE("totalRevenue", 0) + $1
        WHERE "caravanId" = (SELECT "caravanId" FROM caravan_market_listings WHERE "id"=$2)
    `, [totalPrice, listingId]);

    // 4️⃣ نقل المشتريات للمخزون
    if (buyerType === 'player') {
        try {
            await db.query(`
                INSERT INTO user_inventory ("guildID","userID","itemID","quantity")
                VALUES ($1,$2,$3,$4)
                ON CONFLICT ("guildID","userID","itemID")
                DO UPDATE SET "quantity" = COALESCE(user_inventory.quantity, 0) + $4
            `, [guildId, buyerId, itemId, quantity]);
        } catch(e) {
            await db.query(`
                INSERT INTO user_inventory (guildid,userid,itemid,quantity)
                VALUES ($1,$2,$3,$4)
                ON CONFLICT (guildid,userid,itemid)
                DO UPDATE SET quantity = COALESCE(user_inventory.quantity, 0) + $4
            `, [guildId, buyerId, itemId, quantity]).catch(()=>{});
        }
    }

    return { ok: true, totalPrice, remaining: available - quantity };
}

async function closeSession(db, threadId) {
    await safeExecute(db, `
        UPDATE caravan_market_sessions SET "status"='closed'
        WHERE "threadId"=$1 AND "status"='open'
    `, [threadId]);
}

async function returnUnsoldItems(db, ownerId, guildId) {
    const listings = await safeQuery(db, `
        SELECT * FROM caravan_market_listings
        WHERE "ownerID"=$1 AND "guildID"=$2 AND "status" IN ('active','sold_out')
          AND CAST("quantity" AS BIGINT) > CAST(COALESCE("quantitySold", '0') AS BIGINT)
    `, [ownerId, guildId]);

    const returned = [];
    for (const listing of (listings.rows || [])) {
        const qty = Number(listing.quantity) - Number(listing.quantitysold || listing.quantitySold || 0);
        if (qty > 0) {
            try {
                await db.query(`
                    INSERT INTO user_inventory ("guildID","userID","itemID","quantity")
                    VALUES ($1,$2,$3,$4)
                    ON CONFLICT ("guildID","userID","itemID")
                    DO UPDATE SET "quantity" = COALESCE(user_inventory.quantity, 0) + $4
                `, [guildId, ownerId, listing.itemid || listing.itemID, qty]);
            } catch(e) {
                await db.query(`
                    INSERT INTO user_inventory (guildid,userid,itemid,quantity)
                    VALUES ($1,$2,$3,$4)
                    ON CONFLICT (guildid,userid,itemid)
                    DO UPDATE SET quantity = COALESCE(user_inventory.quantity, 0) + $4
                `, [guildId, ownerId, listing.itemid || listing.itemID, qty]).catch(()=>{});
            }
            returned.push({ itemId: listing.itemid || listing.itemID, quantity: qty, name: listing.itemname || listing.itemName });
        }
    }

    await safeExecute(db, `
        UPDATE caravan_market_listings SET "status"='returned'
        WHERE "ownerID"=$1 AND "guildID"=$2 AND "status" IN ('active','sold_out')
    `, [ownerId, guildId]);

    return returned;
}

async function incrementNpcSpawn(db, threadId) {
    await safeExecute(db, `
        UPDATE caravan_market_sessions SET "npcSpawnCount" = COALESCE("npcSpawnCount", 0) + 1
        WHERE "threadId"=$1
    `, [threadId]);
}

async function getNpcSpawnCount(db, threadId) {
    const result = await safeQuery(db, `
        SELECT "npcSpawnCount" FROM caravan_market_sessions WHERE "threadId"=$1
    `, [threadId]);
    return Number(result.rows[0]?.npcspawncount || result.rows[0]?.npcSpawnCount || 0);
}

async function getActiveSessions(db) {
    const result = await safeQuery(db, `
        SELECT * FROM caravan_market_sessions
        WHERE "status"='open' AND "expiresAt" > $1
    `, [Date.now()]);
    return result.rows || [];
}

async function getExpiredSessions(db) {
    const result = await safeQuery(db, `
        SELECT * FROM caravan_market_sessions
        WHERE "status"='open' AND "expiresAt" <= $1
    `, [Date.now()]);
    return result.rows || [];
}

async function updateListingPrice(db, listingId, newPrice) {
    await safeExecute(db, `
        UPDATE caravan_market_listings SET "pricePerUnit"=$1
        WHERE "id"=$2 AND "status"='active'
    `, [newPrice, listingId]);
}

async function getListingById(db, listingId) {
    const result = await safeQuery(db, `
        SELECT * FROM caravan_market_listings WHERE "id"=$1
    `, [listingId]);
    return result.rows[0] || null;
}

module.exports = {
    initMarketTables,
    createListing,
    lockItemsFromInventory,
    getListingsByCaravan,
    getListingsBySession,
    getSessionByThread,
    getSessionByCaravan,
    createMarketSession,
    buyItem,
    closeSession,
    returnUnsoldItems,
    incrementNpcSpawn,
    getNpcSpawnCount,
    getActiveSessions,
    getExpiredSessions,
    updateListingPrice,
    getListingById,
};
