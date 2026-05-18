const {
    EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
    StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
    ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags, AttachmentBuilder
} = require('discord.js');
const { safeQuery, safeExecute } = require('../db');
const { EMOJI_MORA } = require('../config');
const { createListing, lockItemsFromInventory } = require('./market-db');

let INVENTORY_GEN;
try { INVENTORY_GEN = require('../../../generators/inventory-generator.js'); } catch (e) { INVENTORY_GEN = null; }

let STAGING_GEN;
try { STAGING_GEN = require('../../../generators/staging-market-generator.js'); } catch (e) { STAGING_GEN = null; }

const resolveItemInfo = INVENTORY_GEN ? INVENTORY_GEN.resolveItemInfo : (id) => ({ name: id, emoji: '📦', rarity: 'Common', category: 'أخرى', imgPath: null });
const getItemInfo = resolveItemInfo;

const CATEGORY_NAMES = {
    'موارد': '💎 قسم الموارد والتطوير',
    'صيد': '🪱 قسم الصيد والطعوم',
    'مزرعة': '🌾 قسم المزرعة',
    'staged': '🛒 سلة البضائع (جاهزة للبيع)'
};

const SHORT_CAT_NAMES = {
    'موارد': 'الموارد',
    'صيد': 'الصيد',
    'مزرعة': 'المزرعة',
    'staged': 'سلة العربة'
};

const RARITY_AR = { 'Common': 'عادي', 'Uncommon': 'شائع', 'Rare': 'نادر', 'Epic': 'ملحمي', 'Legendary': 'أسطوري' };

// ============================================================================
// [1] جلب المخزون وتجميعه
// ============================================================================
async function getFilteredInventoryCategories(db, userId, guildId) {
    let inventory = [];
    try {
        const res = await safeQuery(db, `SELECT * FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId]);
        inventory = res?.rows || [];
        if (inventory.length === 0) {
            const res2 = await safeQuery(db, `SELECT * FROM user_inventory WHERE userid = $1 AND guildid = $2`, [userId, guildId]);
            inventory = res2?.rows || [];
        }
    } catch(e) {}

    const categories = { 'موارد': [], 'صيد': [], 'مزرعة': [], 'أخرى': [] };
    
    let aggregatedInv = new Map();
    for (const row of inventory) {
        const idKey = Object.keys(row).find(k => k.toLowerCase() === 'itemid');
        const qtyKey = Object.keys(row).find(k => k.toLowerCase() === 'quantity' || k.toLowerCase() === 'qty');
        
        const itemId = idKey ? String(row[idKey]).trim() : null;
        if (!itemId || itemId === 'gacha_chest' || itemId === 'free_gacha_chest') continue;
        
        const quantity = qtyKey ? Number(row[qtyKey]) : 0;
        if (quantity <= 0) continue;
        
        aggregatedInv.set(itemId, (aggregatedInv.get(itemId) || 0) + quantity);
    }

    aggregatedInv.forEach((qty, itemId) => {
        const itemInfo = resolveItemInfo(itemId);
        if (categories[itemInfo.category]) {
            categories[itemInfo.category].push({ ...itemInfo, quantity: qty, id: itemId });
        }
    });

    const rarityWeights = { 'Legendary': 5, 'Epic': 4, 'Rare': 3, 'Uncommon': 2, 'Common': 1 };
    const filtered = {
        'موارد': categories['موارد'] || [],
        'صيد': categories['صيد'] || [],
        'مزرعة': categories['مزرعة'] || []
    };
    
    Object.keys(filtered).forEach(cat => {
        filtered[cat].sort((a, b) => (rarityWeights[b.rarity] || 1) - (rarityWeights[a.rarity] || 1));
    });

    return filtered;
}

// ============================================================================
// [2] الخصم الذكي من المخزون (بالضبط كما طلبته من الكود الخاص بك)
// ============================================================================
async function safeDeductFromInventory(db, userId, guildId, itemId, quantityToDeduct) {
    let res = await safeQuery(db, `SELECT * FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId]);
    if (!res || !res.rows || res.rows.length === 0) {
        res = await safeQuery(db, `SELECT * FROM user_inventory WHERE userid = $1 AND guildid = $2`, [userId, guildId]);
        if (!res || !res.rows) return false;
    }

    const targetId = String(itemId).toLowerCase().trim();
    
    let itemRows = res.rows.filter(r => {
        const idKey = Object.keys(r).find(k => k.toLowerCase() === 'itemid');
        return idKey && String(r[idKey]).toLowerCase().trim() === targetId;
    });

    let totalAvailable = itemRows.reduce((sum, r) => {
        const qtyKey = Object.keys(r).find(k => k.toLowerCase() === 'quantity');
        return sum + (qtyKey ? Number(r[qtyKey]) : 0);
    }, 0);

    if (totalAvailable < quantityToDeduct) return false;

    let remaining = quantityToDeduct;

    for (let r of itemRows) {
        if (remaining <= 0) break;
        const qtyKey = Object.keys(r).find(k => k.toLowerCase() === 'quantity');
        const rowIdKey = Object.keys(r).find(k => k.toLowerCase() === 'id');
        const q = qtyKey ? Number(r[qtyKey]) : 0;
        if (q <= 0) continue;
        
        const deduct = Math.min(q, remaining);
        const rowId = rowIdKey ? r[rowIdKey] : null;
        
        if (rowId) {
            try { 
                await db.query(`UPDATE user_inventory SET "quantity" = CAST(COALESCE("quantity", '0') AS INTEGER) - $1 WHERE "id" = $2`, [deduct, rowId]); 
            } catch(e) { 
                await db.query(`UPDATE user_inventory SET quantity = CAST(COALESCE(quantity, '0') AS INTEGER) - $1 WHERE id = $2`, [deduct, rowId]).catch(()=>{}); 
            }
        } else {
            await safeExecute(db, `UPDATE user_inventory SET quantity = quantity - $1 WHERE "userID"=$2 AND "guildID"=$3 AND "itemID"=$4`, [deduct, userId, guildId, itemId]);
        }
        remaining -= deduct;
    }

    try { await db.query(`DELETE FROM user_inventory WHERE CAST(COALESCE("quantity", '0') AS INTEGER) <= 0 AND "userID" = $1 AND "guildID" = $2`, [userId, guildId]); } 
    catch(e) { await db.query(`DELETE FROM user_inventory WHERE CAST(COALESCE(quantity, '0') AS INTEGER) <= 0 AND userid = $1 AND guildid = $2`, [userId, guildId]).catch(()=>{}); }
    
    return remaining === 0;
}

// ============================================================================
// [3] دوال المتجر والعربة (تم زرع التنظيف القهري هنا) 👑
// ============================================================================
async function getStagedItemsSafe(db, userId, guildId) {
    try {
        // تنظيف الأشباح: مسح أي غرض رقمه 0 أو أقل من السلة قبل جلبها للواجهة
        await db.query(`DELETE FROM caravan_staging_market WHERE CAST(COALESCE("quantity", '0') AS INTEGER) <= 0`).catch(()=>{});
        await db.query(`DELETE FROM caravan_staging_market WHERE CAST(COALESCE(quantity, '0') AS INTEGER) <= 0`).catch(()=>{});

        // جلب العناصر اللي كميتها أكبر من صفر فقط
        let res = await safeQuery(db, `SELECT * FROM caravan_staging_market WHERE "userID"=$1 AND "guildID"=$2 AND CAST(COALESCE("quantity", '0') AS INTEGER) > 0`, [userId, guildId]);
        if (!res || !res.rows || res.rows.length === 0) {
            res = await safeQuery(db, `SELECT * FROM caravan_staging_market WHERE userid=$1 AND guildid=$2 AND CAST(COALESCE(quantity, '0') AS INTEGER) > 0`, [userId, guildId]);
        }
        return res?.rows || [];
    } catch { return []; }
}

async function stagingAddItemSafe(db, userId, guildId, itemId, quantity, price, member = null) {
    const [limits, currentStaged] = await Promise.all([
        getMarketSlotLimits(db, userId, guildId, member),
        getStagedItemsSafe(db, userId, guildId),
    ]);

    const normalizedId = String(itemId).toLowerCase().trim();
    const existingRow = currentStaged.find(s => {
        const idKey = Object.keys(s).find(k => k.toLowerCase() === 'itemid');
        return idKey && String(s[idKey]).toLowerCase().trim() === normalizedId;
    });

    if (existingRow) {
        const qtyKey = Object.keys(existingRow).find(k => k.toLowerCase() === 'quantity');
        const alreadyStaged = Number(existingRow[qtyKey] || 0);
        if (alreadyStaged + quantity > limits.sameType) {
            return { ok: false, error: `✶ تـجـاوزت حد الكميـة من نفس النوع الحد الاقصى **${limits.sameType}**\n- جرب تجهيـز عنـصـر آخر في قافلتـك !` };
        }
    } else {
        if (currentStaged.length >= limits.general) {
            return { ok: false, error: `✥ لا تـمـلك مساحـة كافيـة في قافلتـك\n✶ لـديـك **${Math.max(0, limits.general - currentStaged.length)}** مساحـة فارغـة\n✶ اجمـالـي المساحـة: **${limits.general}**\n- زد سمعـتـك لترقيـة مساحـة القافلـة او كن من معززين الامبراطوريـة !` };
        }
    }

    const deducted = await safeDeductFromInventory(db, userId, guildId, itemId, quantity);
    if (!deducted) return { ok: false, error: 'الكمية غير كافية في مخزونك.' };

    let updated = false;
    try {
        const upd1 = await db.query(
            `UPDATE caravan_staging_market SET "quantity" = "quantity" + $1, "pricePerUnit" = $5
             WHERE "userID"=$2 AND "guildID"=$3 AND ("itemID"=$4 OR itemid=$4) RETURNING *`,
            [quantity, userId, guildId, itemId, price]);
        if (upd1 && upd1.rowCount > 0) updated = true;
    } catch(e) {}

    if (!updated) {
        try {
            const upd2 = await db.query(
                `UPDATE caravan_staging_market SET quantity = quantity + $1, priceperunit = $5
                 WHERE userid=$2 AND guildid=$3 AND (itemid=$4 OR "itemID"=$4) RETURNING *`,
                [quantity, userId, guildId, itemId, price]);
            if (upd2 && upd2.rowCount > 0) updated = true;
        } catch(e) {}
    }

    if (updated) return { ok: true };

    try {
        await db.query(`INSERT INTO caravan_staging_market ("userID", "guildID", "itemID", "quantity", "pricePerUnit") VALUES ($1, $2, $3, $4, $5) ON CONFLICT ("userID","guildID","itemID") DO UPDATE SET "quantity" = EXCLUDED."quantity"`, [userId, guildId, itemId, quantity, price]);
    } catch(e) {
        await db.query(`INSERT INTO caravan_staging_market (userid, guildid, itemid, quantity, priceperunit) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (userid, guildid, itemid) DO UPDATE SET quantity = EXCLUDED.quantity`, [userId, guildId, itemId, quantity, price]).catch(()=>{});
    }
    return { ok: true };
}

async function stagingRemoveItemSafe(db, userId, guildId, itemId, removeQty) {
    try {
        let stagedRes = await safeQuery(db,
            `SELECT * FROM caravan_staging_market WHERE "userID"=$1 AND "guildID"=$2 AND "itemID"=$3`,
            [userId, guildId, itemId]
        );
        if (!stagedRes || !stagedRes.rows || stagedRes.rows.length === 0) {
            stagedRes = await safeQuery(db,
                `SELECT * FROM caravan_staging_market WHERE userid=$1 AND guildid=$2 AND itemid=$3`,
                [userId, guildId, itemId]
            );
        }
        if (!stagedRes || !stagedRes.rows || stagedRes.rows.length === 0) {
            return { ok: false, error: 'لم يتم العثور على البضاعة في العربة.' };
        }

        const row = stagedRes.rows[0];
        const qtyKey = Object.keys(row).find(k => k.toLowerCase() === 'quantity');
        const totalStaged = Number(row[qtyKey] || 0);

        if (removeQty > totalStaged) {
            return { ok: false, error: `الكمية المراد إزالتها (${removeQty}) أكبر من الموجودة (${totalStaged}).` };
        }

        if (removeQty >= totalStaged) {
            const deleted = await safeExecute(db,
                `DELETE FROM caravan_staging_market WHERE "userID"=$1 AND "guildID"=$2 AND "itemID"=$3`,
                [userId, guildId, itemId]
            );
            if (!deleted) {
                await safeExecute(db,
                    `DELETE FROM caravan_staging_market WHERE userid=$1 AND guildid=$2 AND itemid=$3`,
                    [userId, guildId, itemId]
                );
            }
        } else {
            const updated = await safeExecute(db,
                `UPDATE caravan_staging_market SET "quantity" = "quantity" - $4 WHERE "userID"=$1 AND "guildID"=$2 AND "itemID"=$3`,
                [userId, guildId, itemId, removeQty]
            );
            if (!updated) {
                await safeExecute(db,
                    `UPDATE caravan_staging_market SET quantity = quantity - $4 WHERE userid=$1 AND guildid=$2 AND itemid=$3`,
                    [userId, guildId, itemId, removeQty]
                );
            }
        }

        const refunded = await safeExecute(db,
            `INSERT INTO user_inventory ("userID","guildID","itemID","quantity") VALUES ($1,$2,$3,$4)
             ON CONFLICT ("userID","guildID","itemID") DO UPDATE SET "quantity" = COALESCE(user_inventory."quantity",0) + $4`,
            [userId, guildId, itemId, removeQty]
        );
        if (!refunded) {
            await safeExecute(db,
                `INSERT INTO user_inventory (userid,guildid,itemid,quantity) VALUES ($1,$2,$3,$4)
                 ON CONFLICT (userid,guildid,itemid) DO UPDATE SET quantity = COALESCE(user_inventory.quantity,0) + $4`,
                [userId, guildId, itemId, removeQty]
            );
        }

        // 👑 تنظيف إضافي لضمان مسح أي بقايا أصفار بعد الإزالة
        await db.query(`DELETE FROM caravan_staging_market WHERE CAST(COALESCE("quantity", '0') AS INTEGER) <= 0`).catch(()=>{});
        await db.query(`DELETE FROM caravan_staging_market WHERE CAST(COALESCE(quantity, '0') AS INTEGER) <= 0`).catch(()=>{});

        return { ok: true };
    } catch(e) {
        console.error('[stagingRemoveItemSafe]', e);
        return { ok: false, error: 'حدث خطأ أثناء الإرجاع.' };
    }
}

function getMarketListingsCache(client, userId, guildId) {
    const key = `market_listings_${userId}_${guildId}`;
    if (!client.marketListings) client.marketListings = new Map();
    if (!client.marketListings.has(key)) client.marketListings.set(key, []);
    return client.marketListings.get(key);
}

function clearMarketListingsCache(client, userId, guildId) {
    const key = `market_listings_${userId}_${guildId}`;
    if (client.marketListings) client.marketListings.delete(key);
}

// ============================================================================
// [نظام الـ Slots] حدود الإدراج في السوق
// ============================================================================
async function getMarketSlotLimits(db, userId, guildId, member) {
    let general = 3, sameType = 3;

    if (member?.roles?.cache?.has('1395674235002945636')) { general += 20; sameType += 20; }
    if (member?.roles?.cache?.has('1422160802416164885')) { general += 15; sameType += 15; }

    const [repResult, levelResult] = await Promise.all([
        safeQuery(db, `SELECT rep_points FROM user_reputation WHERE "userID"=$1 AND "guildID"=$2`, [userId, guildId]).catch(() => null),
        safeQuery(db, `SELECT level FROM levels WHERE "user"=$1 AND "guild"=$2`, [userId, guildId]).catch(() => null),
    ]);

    const repPts = Number(repResult?.rows?.[0]?.rep_points || 0);
    const level  = Number(levelResult?.rows?.[0]?.level    || 0);

    if (repPts >= 100) { general += 2; sameType += 2; }
    if (repPts >= 500) { general += 3; sameType += 3; }

    if (level >= 30) { general += 1; sameType += 1; }
    if (level >= 50) { general += 2; sameType += 2; }
    if (level >= 80) { general += 3; sameType += 3; }
    if (level >= 99) { general += 5; sameType += 5; }

    return { general, sameType };
}

async function finalizeListings(client, db, caravanId, userId, guildId) {
    const listings = getMarketListingsCache(client, userId, guildId);
    if (!listings || listings.length === 0) return { ok: true, listings: [] };

    const dbListings = [];
    for (const listing of listings) {
        const listingId = await createListing(db, caravanId, userId, guildId, listing);
        if (listingId) dbListings.push({ ...listing, listingId });
    }
    if (dbListings.length > 0) await lockItemsFromInventory(db, guildId, userId, dbListings);
    clearMarketListingsCache(client, userId, guildId);
    return { ok: true, listings: dbListings };
}

async function finalizeStagedItems(db, caravanId, userId, guildId, member = null) {
    if (!caravanId) {
        console.warn('[finalizeStagedItems] caravanId is null/undefined — skipping');
        return { ok: false, moved: 0 };
    }

    const existCheck = await safeQuery(db,
        `SELECT 1 FROM caravan_market_listings WHERE "caravanId"=$1 AND "status"='active' LIMIT 1`,
        [caravanId]);
    if (existCheck.rows.length > 0) {
        console.log(`[finalizeStagedItems] caravanId=${caravanId} already has listings — skipped`);
        return { ok: true, moved: 0, skipped: true };
    }

    const staged = await getStagedItemsSafe(db, userId, guildId);
    console.log(`[finalizeStagedItems] caravanId=${caravanId} userId=${userId} staged items: ${staged.length}`);

    let moved = 0;
    for (const st of staged) {
        const idKey    = Object.keys(st).find(k => k.toLowerCase() === 'itemid');
        const qtyKey   = Object.keys(st).find(k => k.toLowerCase() === 'quantity');
        const priceKey = Object.keys(st).find(k => k.toLowerCase() === 'priceperunit');

        const itemId = idKey    ? st[idKey]            : null;
        const qty    = qtyKey   ? Number(st[qtyKey])   : 0;
        const price  = priceKey ? Number(st[priceKey]) : 0;

        if (!itemId || qty <= 0) continue;

        const itemInfo = resolveItemInfo(itemId);
        const now = Date.now();

        const ok = await safeExecute(db,
            `INSERT INTO caravan_market_listings
                ("caravanId","ownerID","guildID","itemID","itemName","itemEmoji",
                 "quantity","pricePerUnit","quantitySold","status","createdAt")
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,'active',$9)`,
            [caravanId, userId, guildId, itemId, itemInfo.name || itemId, itemInfo.emoji || '📦', qty, price, now]);

        console.log(`[finalizeStagedItems] INSERT itemId=${itemId} qty=${qty} price=${price} ok=${ok}`);
        if (ok !== false) moved++;
    }

    return { ok: true, moved };
}

// ============================================================================
// [الواجهة الرئيسية] متجر القافلة 
// ============================================================================
async function showStagingUI(interaction, db, user, guild, forceEdit = false) {
    const stateKey = `mkt_state_${user.id}_${guild.id}`;
    
    if (!interaction.client[stateKey] || interaction.customId === 'cv_market_staging') {
        interaction.client[stateKey] = { category: 'موارد', page: 1, selectedIndex: 0 };
    }
    
    const state = interaction.client[stateKey];

    if (!CATEGORY_NAMES[state.category]) state.category = 'موارد';

    const [staged, categoriesData] = await Promise.all([
        getStagedItemsSafe(db, user.id, guild.id),
        getFilteredInventoryCategories(db, user.id, guild.id)
    ]);

    const isCart = state.category === 'staged';
    let currentItems = [];

    if (isCart) {
        currentItems = staged.map(s => {
            const idKey = Object.keys(s).find(k => k.toLowerCase() === 'itemid');
            const qtyKey = Object.keys(s).find(k => k.toLowerCase() === 'quantity');
            const priceKey = Object.keys(s).find(k => k.toLowerCase() === 'priceperunit');
            
            const itemId = idKey ? s[idKey] : null;
            const quantity = qtyKey ? s[qtyKey] : 0;
            const pricePerUnit = priceKey ? s[priceKey] : 0;
            
            const info = resolveItemInfo(itemId);
            return { id: itemId, name: info.name, emoji: info.emoji, rarity: info.rarity, quantity, pricePerUnit, imgPath: info.imgPath, fullImage: info.fullImage };
        });
    } else {
        currentItems = categoriesData[state.category] || [];
    }

    const ITEMS_PER_PAGE = 15;
    const totalPages = Math.max(1, Math.ceil(currentItems.length / ITEMS_PER_PAGE));
    if (state.page > totalPages) state.page = totalPages;

    const pageItems = currentItems.slice((state.page - 1) * ITEMS_PER_PAGE, state.page * ITEMS_PER_PAGE);
    
    if (state.selectedIndex >= pageItems.length && pageItems.length > 0) state.selectedIndex = pageItems.length - 1;
    else if (pageItems.length === 0) state.selectedIndex = 0;

    interaction.client[stateKey].pageItems = pageItems;

    const expectedProfit = staged.reduce((acc, curr) => {
        const qtyKey = Object.keys(curr).find(k => k.toLowerCase() === 'quantity');
        const priceKey = Object.keys(curr).find(k => k.toLowerCase() === 'priceperunit');
        return acc + (Number(curr[qtyKey] || 0) * Number(curr[priceKey] || 0));
    }, 0);

    let buffer = null;
    if (STAGING_GEN && STAGING_GEN.generateStagingCanvas) {
        try {
            const canvasItems = pageItems.map(item => ({
                id:          item.id,
                name:        item.name   || String(item.id),
                emoji:       item.emoji  || '📦',
                rarity:      item.rarity || 'Common',
                imgPath:     item.imgPath || null,
                quantity:    item.quantity || 0,
                pricePerUnit: isCart ? (Number(item.pricePerUnit) || 0) : undefined,
                fullImage:   item.fullImage === true,
            }));
            buffer = await STAGING_GEN.generateStagingCanvas(
                user.displayName || user.username,
                canvasItems,
                state.page,
                totalPages,
                0,
                staged.length,
                state.selectedIndex,
                isCart,
                isCart ? 'cart' : 'inventory'
            );
        } catch (e) {
            console.error('[showStagingUI] canvas error:', e?.message);
            buffer = null;
        }
    }

    const embed = new EmbedBuilder()
        .setColor('#F1C40F')
        .setAuthor({ name: `سوق القافلة لـ ${user.displayName || user.username}`, iconURL: user.displayAvatarURL() })
        .setDescription(
            `🛒 **إعداد البضائع للرحلة**\nاستخدم أزرار التحكم لتحديد العنصر، ثم اضغط 💠 للتحضير أو الإزالة.\n\n` +
            `📦 **البضائع المحملة:** \`${staged.length}\` | 💰 **الأرباح المتوقعة:** \`${expectedProfit.toLocaleString()}\` ${EMOJI_MORA}`
        );

    let itemsText = '';
    if (pageItems.length > 0) {
        pageItems.forEach((it, idx) => {
            const marker = idx === state.selectedIndex ? '🔹' : '🔸';
            if (isCart) {
                itemsText += `\`${idx + 1}.\` ${marker} ${it.emoji} **${it.name}** (x${it.quantity}) — **${(it.pricePerUnit).toLocaleString()}** للواحدة\n`;
            } else {
                const rarityTxt = it.rarity ? `[${RARITY_AR[it.rarity] || it.rarity}]` : '';
                itemsText += `\`${idx + 1}.\` ${marker} ${it.emoji} **${it.name}** ${rarityTxt} — تملك: **${it.quantity}**\n`;
            }
        });
    } else {
        itemsText = isCart ? '*سلة البضائع فارغة حالياً.*' : '*لا يوجد شيء هنا في المخزون.*';
    }
    embed.addFields({ name: `📂 ${CATEGORY_NAMES[state.category]} (صفحة ${state.page}/${totalPages})`, value: itemsText.substring(0, 1024), inline: false });

    const aId = user.id;
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`stg_l2_${aId}`).setEmoji('⏪').setStyle(ButtonStyle.Secondary).setDisabled(pageItems.length === 0),
        new ButtonBuilder().setCustomId(`stg_u1_${aId}`).setEmoji('⬆️').setStyle(ButtonStyle.Primary).setDisabled(pageItems.length === 0),
        new ButtonBuilder().setCustomId(`stg_r2_${aId}`).setEmoji('⏩').setStyle(ButtonStyle.Secondary).setDisabled(pageItems.length === 0)
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`stg_l1_${aId}`).setEmoji('⬅️').setStyle(ButtonStyle.Primary).setDisabled(pageItems.length === 0),
        new ButtonBuilder().setCustomId(`stg_ok_${aId}`).setEmoji('💠').setStyle(ButtonStyle.Success).setDisabled(pageItems.length === 0),
        new ButtonBuilder().setCustomId(`stg_r1_${aId}`).setEmoji('➡️').setStyle(ButtonStyle.Primary).setDisabled(pageItems.length === 0)
    );
    const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`stg_u2_${aId}`).setEmoji('⏫').setStyle(ButtonStyle.Secondary).setDisabled(pageItems.length === 0),
        new ButtonBuilder().setCustomId(`stg_d1_${aId}`).setEmoji('⬇️').setStyle(ButtonStyle.Primary).setDisabled(pageItems.length === 0),
        new ButtonBuilder().setCustomId(`stg_d2_${aId}`).setEmoji('⏬').setStyle(ButtonStyle.Secondary).setDisabled(pageItems.length === 0)
    );

    const cycleBtn = new ButtonBuilder()
        .setCustomId(isCart ? 'cv_back' : `stg_cycle_${aId}`)
        .setEmoji(isCart ? '🚀' : '🔄')
        .setStyle(isCart ? ButtonStyle.Danger : ButtonStyle.Primary);

    const row4 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`stg_prev_${aId}`).setEmoji('<:left:1439164494759723029>').setStyle(ButtonStyle.Secondary).setDisabled(state.page <= 1),
        cycleBtn, 
        new ButtonBuilder().setCustomId(`stg_next_${aId}`).setEmoji('<:right:1439164491072929915>').setStyle(ButtonStyle.Secondary).setDisabled(state.page >= totalPages)
    );

    const contentText = `**${CATEGORY_NAMES[state.category]}**`;

    const payload = { 
        embeds: buffer ? [] : [embed], 
        components: [row1, row2, row3, row4], 
        files: buffer ? [new AttachmentBuilder(buffer, { name: 'market.png' })] : [], 
        content: buffer ? contentText : contentText + '\n(تعذر تحميل الصورة)' 
    };

    if (forceEdit || interaction.deferred || interaction.replied) {
        await interaction.editReply(payload).catch(() => {});
    } else {
        await interaction.reply(payload).catch(() => {});
    }
}

// ============================================================================
// [الأحداث]
// ============================================================================
async function handleStagingInteraction(interaction, db, user, guild) {
    const id = interaction.customId;
    const authorId = user.id;

    if (!id.endsWith(`_${authorId}`) && id !== 'cv_back') {
        if (id.includes('_') && !id.startsWith('cv_')) {
           return interaction.reply({ content: '❌ هذا المتجر لا يخصك!', flags: [MessageFlags.Ephemeral] });
        }
    }

    const stateKey = `mkt_state_${user.id}_${guild.id}`;
    if (!interaction.client[stateKey]) {
        interaction.client[stateKey] = { category: 'موارد', page: 1, selectedIndex: 0 };
    }
    const state = interaction.client[stateKey];

    if (id.startsWith('stg_cycle_')) {
        const cats = ['موارد', 'صيد', 'مزرعة', 'staged'];
        let idx = cats.indexOf(state.category);
        if (idx === -1) idx = 0;
        
        state.category = cats[(idx + 1) % cats.length];
        state.page = 1;
        state.selectedIndex = 0;
        
        await interaction.deferUpdate().catch(()=>{});
        return await showStagingUI(interaction, db, user, guild, true);
    }

    if (id.startsWith('stg_ok_')) {
        const activeRes = await safeQuery(db, `SELECT 1 FROM user_caravans WHERE "userID"=$1 AND "guildID"=$2 AND "status"!='completed'`, [user.id, guild.id]);
        if (activeRes && activeRes.rows && activeRes.rows.length > 0) {
            await interaction.deferUpdate().catch(()=>{});
            return interaction.followUp({ content: '❌ القافلة في رحلة حالياً! لا يمكنك إضافة أو إزالة البضائع حتى تعود.', flags: [MessageFlags.Ephemeral] });
        }

        const pageItems = state.pageItems || [];
        const selectedItem = pageItems[state.selectedIndex];

        if (!selectedItem) {
             await interaction.deferUpdate();
             return interaction.followUp({ content: "❌ المربع المحدد فارغ.", flags: [MessageFlags.Ephemeral] });
        }
        
        if (state.category === 'staged') {
            const modal = new ModalBuilder().setCustomId(`stg_rmv_modal_${selectedItem.id}`).setTitle(`إزالة البضاعة`);
            modal.addComponents(new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('rmv_qty').setLabel(`الكمية (الحد الأقصى ${selectedItem.quantity})`).setStyle(TextInputStyle.Short).setValue(String(selectedItem.quantity)).setRequired(true)
            ));
            return await interaction.showModal(modal).catch(()=>{});
        } else {
            const modal = new ModalBuilder().setCustomId(`stg_add_modal_${selectedItem.id}`).setTitle(`تسعير: ${selectedItem.name}`.substring(0, 45));
            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('add_qty').setLabel(`الكمية (لديك: ${selectedItem.quantity})`).setStyle(TextInputStyle.Short).setValue(String(selectedItem.quantity)).setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('add_price').setLabel(`سعر الحبة (مورا)`).setStyle(TextInputStyle.Short).setRequired(true)
                )
            );
            return await interaction.showModal(modal).catch(()=>{});
        }
    }

    await interaction.deferUpdate().catch(()=>{});

    if (id.startsWith('stg_prev_')) { state.page = Math.max(1, state.page - 1); state.selectedIndex = 0; }
    else if (id.startsWith('stg_next_')) { state.page += 1; state.selectedIndex = 0; }
    else {
        const moveType = id.split('_')[1]; 
        const col = state.selectedIndex % 5;
        const row = Math.floor(state.selectedIndex / 5);

        if (moveType === 'r1') { state.selectedIndex = row * 5 + ((col + 1) % 5); } 
        else if (moveType === 'l1') { state.selectedIndex = row * 5 + ((col - 1 + 5) % 5); }
        else if (moveType === 'd1') { state.selectedIndex = ((row + 1) % 3) * 5 + col; }
        else if (moveType === 'u1') { state.selectedIndex = ((row - 1 + 3) % 3) * 5 + col; }
        else if (moveType === 'r2') { state.selectedIndex = row * 5 + ((col + 2) % 5); }
        else if (moveType === 'l2') { state.selectedIndex = row * 5 + ((col - 2 + 5) % 5); }
        else if (moveType === 'd2') { state.selectedIndex = ((row + 2) % 3) * 5 + col; }
        else if (moveType === 'u2') { state.selectedIndex = ((row - 2 + 3) % 3) * 5 + col; }
    }

    await showStagingUI(interaction, db, user, guild, true);
}

async function handleStageModalSubmit(modalSubmit, db, user, guild) {
    const id = modalSubmit.customId;
    
    if (id.startsWith('stg_add_modal_')) {
        const itemId = id.replace('stg_add_modal_', '');
        const qty = parseInt(modalSubmit.fields.getTextInputValue('add_qty'));
        const price = parseInt(modalSubmit.fields.getTextInputValue('add_price'));

        if (isNaN(qty) || qty < 1) return modalSubmit.reply({ content: '❌ كمية غير صالحة.', flags: [MessageFlags.Ephemeral] });
        if (isNaN(price) || price < 1 || price > 999999999) return modalSubmit.reply({ content: '❌ سعر غير صالح.', flags: [MessageFlags.Ephemeral] });

        const [limits, currentStaged] = await Promise.all([
            getMarketSlotLimits(db, user.id, guild.id, modalSubmit.member),
            getStagedItemsSafe(db, user.id, guild.id),
        ]);

        const normalizedId = String(itemId).toLowerCase().trim();
        const existingRow = currentStaged.find(s => {
            const idKey = Object.keys(s).find(k => k.toLowerCase() === 'itemid');
            return idKey && String(s[idKey]).toLowerCase().trim() === normalizedId;
        });

        if (existingRow) {
            const qtyKey = Object.keys(existingRow).find(k => k.toLowerCase() === 'quantity');
            const alreadyStaged = Number(existingRow[qtyKey] || 0);
            if (alreadyStaged + qty > limits.sameType) {
                const free = Math.max(0, limits.sameType - alreadyStaged);
                return modalSubmit.reply({
                    content: `✥ لا تـمـلك مساحـة كافيـة في قافلتـك\n✶ لـديـك **${free}** مساحـة فارغـة\n✶ اجمـالـي المساحـة: **${limits.sameType}**\n- زد سمعـتـك لترقيـة مساحـة القافلـة او كن من معززين الامبراطوريـة !`,
                    flags: [MessageFlags.Ephemeral],
                });
            }
        } else {
            if (currentStaged.length >= limits.general) {
                const free = Math.max(0, limits.general - currentStaged.length);
                return modalSubmit.reply({
                    content: `✥ لا تـمـلك مساحـة كافيـة في قافلتـك\n✶ لـديـك **${free}** مساحـة فارغـة\n✶ اجمـالـي المساحـة: **${limits.general}**\n- زد سمعـتـك لترقيـة مساحـة القافلـة او كن من معززين الامبراطوريـة !`,
                    flags: [MessageFlags.Ephemeral],
                });
            }
        }

        await modalSubmit.deferUpdate().catch(() => {});
        const result = await stagingAddItemSafe(db, user.id, guild.id, itemId, qty, price, modalSubmit.member);
        if (!result.ok) return modalSubmit.followUp({ content: `❌ ${result.error}`, flags: [MessageFlags.Ephemeral] });
        
        await showStagingUI(modalSubmit, db, user, guild, true);
        
    } else if (id.startsWith('stg_rmv_modal_')) {
        const prefixLen = 'stg_rmv_modal_'.length;
        const pipeIdx = id.indexOf('|', prefixLen);
        const itemId = pipeIdx > 0 ? id.substring(prefixLen, pipeIdx) : id.substring(prefixLen);
        const qty = parseInt(modalSubmit.fields.getTextInputValue('rmv_qty'));
        
        if (isNaN(qty) || qty < 1) return modalSubmit.reply({ content: '❌ كمية غير صالحة.', flags: [MessageFlags.Ephemeral] });
        
        await modalSubmit.deferUpdate().catch(() => {});
        const result = await stagingRemoveItemSafe(db, user.id, guild.id, itemId, qty);
        if (!result.ok) return modalSubmit.followUp({ content: `❌ ${result.error}`, flags: [MessageFlags.Ephemeral] });
        
        await showStagingUI(modalSubmit, db, user, guild, true);
    }
}

module.exports = {
    resolveItemInfo,
    getItemInfo,
    getMarketListingsCache,
    clearMarketListingsCache,
    getFilteredInventoryCategories,
    getStagedItemsSafe,
    finalizeStagedItems,
    showStagingUI,
    handleStagingInteraction,
    handleStageModalSubmit,
    finalizeListings,
    getMarketSlotLimits,
};
