// handlers/ai/admin-actions.js
const shopItems = require('../../json/shop-items.json');
const farmAnimals = require('../../json/farm-animals.json');
const seedsData = require('../../json/seeds.json');
const feedItems = require('../../json/feed-items.json');
const marketItems = require('../../json/market-items.json');
const weaponsConfig = require('../../json/weapons-config.json');
const skillsConfig = require('../../json/skills-config.json');
const upgradeMats = require('../../json/upgrade-materials.json');

function normalize(str) {
    if (!str) return "";
    return str.toString().toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ي/g, 'ى').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').trim();
}

const findUniversalItem = (searchQuery) => {
    const input = normalize(searchQuery);
    let found = null;

    found = shopItems.find(i => normalize(i.name).includes(input) || i.id.toLowerCase() === input);
    if (found && !marketItems.some(m => m.id === found.id) && !farmAnimals.some(f => f.id === found.id)) return { ...found, type: 'inventory' };

    found = marketItems.find(i => normalize(i.name).includes(input) || i.id.toLowerCase() === input);
    if (found) return { ...found, type: 'market' };

    found = farmAnimals.find(i => normalize(i.name).includes(input) || String(i.id).toLowerCase() === input);
    if (found) return { ...found, type: 'farm' };

    found = seedsData.find(i => normalize(i.name).includes(input) || String(i.id).toLowerCase() === input);
    if (found) return { ...found, type: 'inventory' };

    found = feedItems.find(i => normalize(i.name).includes(input) || String(i.id).toLowerCase() === input);
    if (found) return { ...found, type: 'inventory' };

    if (upgradeMats && upgradeMats.weapon_materials) {
        for (const race of upgradeMats.weapon_materials) {
            const mat = race.materials.find(m => normalize(m.name).includes(input) || m.id.toLowerCase() === input);
            if (mat) return { ...mat, type: 'inventory' };
        }
    }
    
    if (upgradeMats && upgradeMats.skill_books) {
        for (const cat of upgradeMats.skill_books) {
            const book = cat.books.find(b => normalize(b.name).includes(input) || b.id.toLowerCase() === input);
            if (book) return { ...book, type: 'inventory' };
        }
    }

    return null;
};

async function executeAdminAction(message, targetUser, amount, text, db) {
    const guildID = message.guild.id;
    const userID = targetUser.id;
    let feedback = "";
    const isGive = !text.includes('سحب') && !text.includes('اسحب') && !text.includes('خصم') && !text.includes('نقص') && !text.includes('شيل'); 

    try {
        // 1. إدارة الخيم (الدانجون)
        if (text.includes('خيم') || text.includes('طابق')) {
            if (amount > 0) {
                await db.query(`
                    INSERT INTO dungeon_saves ("hostID", "guildID", "floor", "timestamp") VALUES ($1, $2, $3, $4)
                    ON CONFLICT("hostID") DO UPDATE SET "floor" = $3, "timestamp" = $4
                `, [userID, guildID, amount, Date.now()]);
                await message.react('⛺').catch(()=>{});
                return `\n\n⛺ **تم التنفيذ:** تم منح **${targetUser.username}** خيمة حفظ في الدانجون عند الطابق **${amount}**.`;
            }
        }

        // 2. إدارة التذاكر (الدانجون)
        if (text.includes('تذكر') || text.includes('تذاكر')) {
            if (amount > 0) {
                const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' });
                await db.query(`
                    INSERT INTO dungeon_stats ("guildID", "userID", "tickets", "last_reset") VALUES ($1, $2, $3, $4)
                    ON CONFLICT("guildID", "userID") DO UPDATE SET "tickets" = COALESCE(dungeon_stats."tickets", 0) + $3
                `, [guildID, userID, amount, todayStr]);
                await message.react('🎟️').catch(()=>{});
                return `\n\n🎟️ **تم التنفيذ:** تم إضافة **${amount}** تذكرة دانجون لـ **${targetUser.username}**.`;
            }
        }

        // 3. إدارة السمعة (التزكية)
        if (text.includes('سمع') || text.includes('زكي') || text.includes('نقاط')) {
            if (amount > 0) {
                if (isGive) {
                    await db.query('INSERT INTO user_reputation ("userID", "guildID", "rep_points") VALUES ($1, $2, $3) ON CONFLICT("userID", "guildID") DO UPDATE SET "rep_points" = COALESCE(user_reputation."rep_points", 0) + $3', [userID, guildID, amount]);
                    await message.react('🌟').catch(()=>{});
                    return `\n\n🌟 **تم التنفيذ:** تم إضافة **${amount}** نقطة سمعة إلى **${targetUser.username}**.`;
                } else {
                    await db.query('UPDATE user_reputation SET "rep_points" = GREATEST(0, COALESCE("rep_points", 0) - $1) WHERE "userID" = $2 AND "guildID" = $3', [amount, userID, guildID]);
                    await message.react('💔').catch(()=>{});
                    return `\n\n💔 **تم التنفيذ:** تم خصم **${amount}** نقطة سمعة من **${targetUser.username}**.`;
                }
            }
        }

        // 4. إدارة العناصر (صناديق، موارد، بذور، إلخ)
        if (text.includes('عنصر') || text.includes('صندوق') || text.includes('سلاح') || text.includes('كتاب') || text.includes('اعطيه')) {
            // محاولة العثور على اسم العنصر من النص
            const words = text.split(' ');
            let foundItem = null;
            
            // نبحث في الكلمات اللي بعد الرقم أو في النص كامل
            for (let word of words) {
                if (word.length < 3) continue;
                let check = findUniversalItem(word);
                if (check) { foundItem = check; break; }
            }

            // حالات خاصة للكلمات الشائعة
            if (!foundItem && text.includes('صندوق')) foundItem = { id: 'gacha_chest', name: 'صندوق غاتشا', type: 'inventory' };
            if (!foundItem && text.includes('مجاني')) foundItem = { id: 'free_gacha_chest', name: 'صندوق مجاني', type: 'inventory' };

            if (foundItem && amount > 0) {
                if (isGive) {
                    if (foundItem.type === 'market') {
                        await db.query(`INSERT INTO user_portfolio ("guildID", "userID", "itemID", "quantity") VALUES ($1, $2, $3, $4) ON CONFLICT DO UPDATE SET "quantity" = user_portfolio."quantity" + $4`, [guildID, userID, foundItem.id, amount]).catch(()=>{});
                    } else if (foundItem.type === 'farm') {
                        await db.query(`INSERT INTO user_farm ("guildID", "userID", "animalID", "quantity", "purchaseTimestamp", "lastFedTimestamp") VALUES ($1, $2, $3, $4, $5, $6)`, [guildID, userID, foundItem.id, amount, Date.now(), Date.now()]).catch(()=>{});
                    } else {
                        await db.query(`INSERT INTO user_inventory ("guildID", "userID", "itemID", "quantity") VALUES ($1, $2, $3, $4) ON CONFLICT DO UPDATE SET "quantity" = user_inventory."quantity" + $4`, [guildID, userID, foundItem.id, amount]).catch(()=>{});
                    }
                    await message.react('🎒').catch(()=>{});
                    return `\n\n🎒 **تم التنفيذ:** تم إضافة **${amount}** × **${foundItem.name}** إلى حقيبة **${targetUser.username}**.`;
                } else {
                    if (foundItem.type === 'market') {
                        await db.query(`UPDATE user_portfolio SET "quantity" = GREATEST(0, "quantity" - $1) WHERE "userID" = $2 AND "guildID" = $3 AND "itemID" = $4`, [amount, userID, guildID, foundItem.id]).catch(()=>{});
                    } else if (foundItem.type === 'farm') {
                        await db.query(`UPDATE user_farm SET "quantity" = GREATEST(0, "quantity" - $1) WHERE "userID" = $2 AND "guildID" = $3 AND "animalID" = $4`, [amount, userID, guildID, foundItem.id]).catch(()=>{});
                    } else {
                        await db.query(`UPDATE user_inventory SET "quantity" = GREATEST(0, "quantity" - $1) WHERE "userID" = $2 AND "guildID" = $3 AND "itemID" = $4`, [amount, userID, guildID, foundItem.id]).catch(()=>{});
                    }
                    await message.react('🗑️').catch(()=>{});
                    return `\n\n🗑️ **تم التنفيذ:** تم سحب **${amount}** × **${foundItem.name}** من حقيبة **${targetUser.username}**.`;
                }
            }
        }

        // 5. الميوت وفك الميوت
        if (text.includes('تايم') || text.includes('سكت') || text.includes('اصمت') || text.includes('ميوت') || text.includes('فك') || text.includes('سامح')) {
            const targetMemberObj = await message.guild.members.fetch(userID).catch(()=>null);
            if (targetMemberObj) {
                if (text.includes('فك') || text.includes('شيل') || text.includes('سامح')) {
                    if (targetMemberObj.isCommunicationDisabled()) {
                        await targetMemberObj.timeout(null, "أمر من السكرتيرة (AI)");
                        await message.react('✅').catch(()=>{});
                        return `\n\n✅ **تم التنفيذ:** تم رفع العقوبة عن **${targetMemberObj.user.username}**.`;
                    }
                } else {
                    let minutes = amount > 0 ? amount : 5; 
                    if (targetMemberObj.manageable) {
                        await targetMemberObj.timeout(minutes * 60 * 1000, "أمر من السكرتيرة (AI)");
                        await message.react('🤐').catch(()=>{});
                        return `\n\n✅ **تم التنفيذ:** تم إسكات **${targetMemberObj.user.username}** لمدة **${minutes}** دقيقة.`;
                    } else {
                        return `\n\n❌ لا يمكنني إسكاته (رتبته أعلى مني).`;
                    }
                }
            }
        }

        // 6. المورا (الإعداد الافتراضي إذا تم ذكر رقم ولم يتطابق مع شيء آخر)
        if (amount > 0 && (text.includes('مورا') || text.includes('فلوس') || text.includes('حول') || text.includes('هاتي'))) {
            await db.query('INSERT INTO levels ("user", "guild", "xp", "level", "totalXP", "mora") VALUES ($1, $2, 0, 1, 0, 0) ON CONFLICT ("user", "guild") DO NOTHING', [userID, guildID]);
            if (isGive) {
                await db.query('UPDATE levels SET "mora" = CAST("mora" AS BIGINT) + CAST($1 AS BIGINT) WHERE "user" = $2 AND "guild" = $3', [String(amount), userID, guildID]);
                await message.react('💸').catch(()=>{});
                feedback = `\n\n✅ **تم التنفيذ:** تم تحويل **${amount}** مورا إلى **${targetUser.username}**.`;
            } else {
                await db.query('UPDATE levels SET "mora" = GREATEST(0, CAST("mora" AS BIGINT) - CAST($1 AS BIGINT)) WHERE "user" = $2 AND "guild" = $3', [String(amount), userID, guildID]);
                await message.react('📉').catch(()=>{});
                feedback = `\n\n✅ **تم التنفيذ:** تم سحب **${amount}** مورا من **${targetUser.username}**.`;
            }
            
            if (message.client.getLevel) {
                let cache = await message.client.getLevel(userID, guildID);
                if (cache) {
                    if (isGive) cache.mora = String(BigInt(cache.mora || 0) + BigInt(amount));
                    else {
                        let newMora = BigInt(cache.mora || 0) - BigInt(amount);
                        cache.mora = newMora > 0n ? String(newMora) : "0";
                    }
                    await message.client.setLevel(cache);
                }
            }
            return feedback;
        }

    } catch (err) {
        console.error("[AI Admin Action Error]", err);
        return `\n\n❌ حدث خطأ تقني أثناء تنفيذ الطلب.`;
    }

    return "";
}

module.exports = { executeAdminAction };
