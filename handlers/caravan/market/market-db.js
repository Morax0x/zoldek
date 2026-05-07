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

    await safeExecute(db, `
        CREATE TABLE IF NOT EXISTS caravan_staging_market (
            "userID" TEXT NOT NULL,
            "guildID" TEXT NOT NULL,
            "itemID" TEXT NOT NULL,
            "quantity" BIGINT NOT NULL,
            "pricePerUnit" BIGINT NOT NULL,
            "createdAt" BIGINT DEFAULT 0,
            PRIMARY KEY ("userID","guildID","itemID")
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

async function stagingAddItem(db, userId, guildId, itemId, quantity, pricePerUnit) {
    const now = Date.now();
    const deductResult = await safeQuery(db, `
        UPDATE user_inventory
        SET "quantity" = CAST(COALESCE("quantity",'0') AS BIGINT) - $4
        WHERE ("userID"=$1 AND "guildID"=$2 AND "itemID"=$3 OR userid=$1 AND guildid=$2 AND itemid=$3)
          AND CAST(COALESCE("quantity",'0') AS BIGINT) >= $4
        RETURNING 1
    `, [userId, guildId, itemId, quantity]);

    if (!deductResult || !deductResult.rows || deductResult.rows.length === 0) {
        return { ok: false, error: 'الكمية غير متوفرة في المخزون' };
    }

    await safeExecute(db, `
        INSERT INTO caravan_staging_market ("userID","guildID","itemID","quantity","pricePerUnit","createdAt")
        VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT ("userID","guildID","itemID")
        DO UPDATE SET "quantity" = caravan_staging_market."quantity" + EXCLUDED."quantity",
                      "pricePerUnit" = EXCLUDED."pricePerUnit"
    `, [userId, guildId, itemId, quantity, pricePerUnit, now]);

    return { ok: true };
}

async function stagingRemoveItem(db, userId, guildId, itemId, quantity) {
    const stagedCheck = await safeQuery(db, `
        SELECT "quantity" FROM caravan_staging_market
        WHERE "userID"=$1 AND "guildID"=$2 AND "itemID"=$3
    `, [userId, guildId, itemId]);

    if (!stagedCheck || !stagedCheck.rows || stagedCheck.rows.length === 0) {
        return { ok: false, error: 'العنصر غير موجود في البضائع المرحّلة' };
    }

    const stagedQty = Number(stagedCheck.rows[0].quantity || 0);
    if (quantity > stagedQty) {
        return { ok: false, error: 'الكمية المطلوبة أكبر من المرحّلة' };
    }

    if (quantity >= stagedQty) {
        await safeExecute(db, `
            DELETE FROM caravan_staging_market
            WHERE "userID"=$1 AND "guildID"=$2 AND "itemID"=$3
        `, [userId, guildId, itemId]);
    } else {
        await safeExecute(db, `
            UPDATE caravan_staging_market SET "quantity" = "quantity" - $4
            WHERE "userID"=$1 AND "guildID"=$2 AND "itemID"=$3
        `, [userId, guildId, itemId, quantity]);
    }

    await safeExecute(db, `
        INSERT INTO user_inventory ("userID","guildID","itemID","quantity")
        VALUES ($1,$2,$3,$4)
        ON CONFLICT ("userID","guildID","itemID")
        DO UPDATE SET "quantity" = COALESCE(user_inventory."quantity", 0) + $4
    `, [userId, guildId, itemId, quantity]);

    await safeExecute(db, `
        INSERT INTO user_inventory (userid, guildid, itemid, quantity)
        VALUES ($1,$2,$3,$4)
        ON CONFLICT (userid, guildid, itemid)
        DO UPDATE SET quantity = COALESCE(user_inventory.quantity, 0) + $4
    `, [userId, guildId, itemId, quantity]);

    return { ok: true };
}

async function getStagedItems(db, userId, guildId) {
    const res = await safeQuery(db, `SELECT * FROM caravan_staging_market WHERE "userID"=$1 AND "guildID"=$2`, [userId, guildId]);
    return res?.rows || [];
}

// 👑 الدالة التي تنقل الأغراض للسوق بدون أن تحذفها من السلة الدائمة 👑
async function finalizeStagedItems(db, caravanId, userId, guildId) {
    if (!caravanId) return { ok: false, error: 'caravanId is null' };

    console.log(`[MarketDB] Finalizing staged items for caravan ${caravanId}, user ${userId}...`);

    const existing = await getListingsByCaravan(db, caravanId);
    const existingItemIds = new Set(existing.map(e => e.itemID || e.itemid));


    // Use a safe fallback-enabled fetch for staged items
    let stagedRes = await safeQuery(db, `SELECT * FROM caravan_staging_market WHERE "userID"=$1 AND "guildID"=$2`, [userId, guildId]);
    if (!stagedRes || !stagedRes.rows || stagedRes.rows.length === 0) {
        stagedRes = await safeQuery(db, `SELECT * FROM caravan_staging_market WHERE userid=$1 AND guildid=$2`, [userId, guildId]);
    }
    const staged = stagedRes?.rows || [];

    if (staged.length === 0) {
        console.log(`[MarketDB] No staged items found for user ${userId}.`);
        return { ok: true, moved: 0 };
    }

    const { resolveItemInfo } = require('./market-setup');

    let moved = 0;
    for (const s of staged) {
        const idKey    = Object.keys(s).find(k => k.toLowerCase() === 'itemid');
        const qtyKey   = Object.keys(s).find(k => k.toLowerCase() === 'quantity');
        const priceKey = Object.keys(s).find(k => k.toLowerCase() === 'priceperunit');

        const itemId       = idKey    ? s[idKey]            : null;
        const quantity     = qtyKey   ? Number(s[qtyKey])   : 0;
        const pricePerUnit = priceKey ? Number(s[priceKey]) : 0;

        if (!itemId || quantity <= 0) continue;

        if (existingItemIds.has(itemId)) continue;

        const itemInfo = resolveItemInfo(itemId);

        const listingId = await createListing(db, caravanId, userId, guildId, {
            itemId,
            itemName: itemInfo.name || itemId,
            itemEmoji: itemInfo.emoji || '📦',
            quantity,
            pricePerUnit,
        });
        if (listingId) moved++;
    }

    console.log(`[MarketDB] Successfully created ${moved} listings for caravan ${caravanId}. Staging cart NOT wiped.`);
    return { ok: true, moved };
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
    let result = await safeQuery(db, `
        SELECT * FROM caravan_market_listings
        WHERE ("caravanId"=$1 OR "caravanID"=$1) AND "status"='active'
        ORDER BY "id" ASC
    `, [caravanId]);
    return result.rows || [];
}

async function getListingsBySession(db, threadId) {
    let result = await safeQuery(db, `
        SELECT l.* FROM caravan_market_listings l
        INNER JOIN caravan_market_sessions s ON (l."caravanId" = s."caravanId" OR l."caravanID" = s."caravanId")
        WHERE s."threadId"=$1 AND l."status"='active' AND s."status"='open'
        ORDER BY l."id" ASC
    `, [threadId]);
    if (!result || !result.rows || result.rows.length === 0) {
        result = await safeQuery(db, `
            SELECT l.* FROM caravan_market_listings l
            INNER JOIN caravan_market_sessions s ON (l.caravanid = s.caravanid)
            WHERE s.threadid=$1 AND l.status='active' AND s.status='open'
            ORDER BY l.id ASC
        `, [threadId]);
    }
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

    await safeExecute(db, `
        UPDATE caravan_market_listings SET "quantitySold" = COALESCE("quantitySold", 0) + $1
        WHERE "id"=$2
    `, [quantity, listingId]);

    if (available - quantity <= 0) {
        await safeExecute(db, `
            UPDATE caravan_market_listings SET "status"='sold_out' WHERE "id"=$1
        `, [listingId]);
    }

    // 👑 الخصم المباشر من السلة الدائمة (Staging) لكي ينعكس البيع على البضائع المعروضة 👑
    const stagingDeducted = await safeExecute(db, `
        UPDATE caravan_staging_market
        SET "quantity" = GREATEST(0, "quantity" - $1)
        WHERE "userID"=$2 AND "guildID"=$3 AND "itemID"=$4
    `, [quantity, sellerId, guildId, itemId]);
    if (!stagingDeducted) {
        await safeExecute(db, `
            UPDATE caravan_staging_market
            SET quantity = GREATEST(0, quantity - $1)
            WHERE userid=$2 AND guildid=$3 AND itemid=$4
        `, [quantity, sellerId, guildId, itemId]);
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

// 👑 إرجاع البضائع للمخزن صار يُقرأ مباشرة من السلة بدون مسحها لأن السلة دائمية 👑
async function returnUnsoldItems(db, ownerId, guildId) {
    await safeExecute(db, `
        UPDATE caravan_market_listings SET "status"='returned'
        WHERE "ownerID"=$1 AND "guildID"=$2 AND "status" IN ('active','sold_out')
    `, [ownerId, guildId]);

    const stagingRes = await safeQuery(db, `
        SELECT * FROM caravan_staging_market WHERE "userID"=$1 AND "guildID"=$2
    `, [ownerId, guildId]);

    const returned = [];
    for (const s of (stagingRes?.rows || [])) {
        const idKey  = Object.keys(s).find(k => k.toLowerCase() === 'itemid');
        const qtyKey = Object.keys(s).find(k => k.toLowerCase() === 'quantity');
        const itemId = idKey  ? s[idKey]          : null;
        const qty    = qtyKey ? Number(s[qtyKey]) : 0;
        if (itemId && qty > 0) returned.push({ itemId, quantity: qty, name: itemId });
    }

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
    stagingAddItem,
    stagingRemoveItem,
    getStagedItems,
    finalizeStagedItems,
};
