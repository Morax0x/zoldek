const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, AttachmentBuilder } = require('discord.js');

let generateGachaCard, generateGachaHub, generateGachaInventory;
try {
    ({ generateGachaCard, generateGachaHub, generateGachaInventory } = require('../../generators/gacha-generator.js'));
} catch (e) {
    generateGachaCard = null; generateGachaHub = null; generateGachaInventory = null;
}

const upgradeMats = require('../../json/upgrade-materials.json');

const PULL_PRICE = 1000;
const R2_URL = 'https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev';

// 🔥 نظام القفل الشامل لمنع السبام والتعليق 🔥
const activeGachaUsers = new Set();

const FLAVOR_TEXTS = [
    "قدم المورا ودع النجوم ترسم لك مسارا جديدا",
    "بين يديك مفتاح الابعاد اكسر الختم لترى اي اسطورة ستستجيب",
    "النجوم تنتظر من يوقظها ادفع المورا وابدا طقوس الاستدعاء",
    "مقابل المورا قد تبتسم لك الاقدار او تدير لك ظهرها جرب حظك",
    "اكسر قيود الزمن واستحضر القوة المنسية الى قبضتك",
    "خلف هذا الختم ترقد كنوز الامبراطورية افتحه واصنع مجدك",
    "ايقظ التح التحف النادرة من سباتها الابدي المورا هي الثمن",
    "طريق العظمة محفوف بالمخاطر والمكافات اكشف غنيمتك",
    "همسات الاقدار تناديك استخدم المورا لفك طلاسم الصندوق",
    "تذكرة عبورك لعالم الاسرار اكشف ما يختبئ في الظلام",
    "بوابات الحظ لا تفتح للجبناء الق المورا وانتظر المعجزة",
    "قرابين المورا هي مفتاحك للاسطورة",
    "اكسر الختم واقطف نجمتك الساطعة",
    "ضح بالمورا وعانق المجهول",
    "حظوظك مكتوبة بين النجوم افتح الصندوق لتقراها"
];

const ID_TO_IMAGE = {
    'mat_dragon_1': 'dragon_ash.png', 'mat_dragon_2': 'dragon_scale.png', 'mat_dragon_3': 'dragon_claw.png', 'mat_dragon_4': 'dragon_heart.png', 'mat_dragon_5': 'dragon_core.png',
    'mat_human_1': 'human_iron.png', 'mat_human_2': 'human_steel.png', 'mat_human_3': 'human_meteor.png', 'mat_human_4': 'human_seal.png', 'mat_human_5': 'human_crown.png',
    'mat_elf_1': 'elf_branch.png', 'mat_elf_2': 'elf_bark.png', 'mat_elf_3': 'elf_flower.png', 'mat_elf_4': 'elf_crystal.png', 'mat_elf_5': 'elf_tear.png',
    'mat_darkelf_1': 'darkelf_obsidian.png', 'mat_darkelf_2': 'darkelf_glass.png', 'mat_darkelf_3': 'darkelf_crystal.png', 'mat_darkelf_4': 'darkelf_void.png', 'mat_darkelf_5': 'darkelf_ash.png',
    'mat_seraphim_1': 'seraphim_feathe.png', 'mat_seraphim_2': 'seraphim_halo.png', 'mat_seraphim_3': 'seraphim_crystal.png', 'mat_seraphim_4': 'seraphim_core.png', 'mat_seraphim_5': 'seraphim_chalice.png',
    'demon_1': 'demon_ember.png', 'mat_demon_2': 'demon_horn.png', 'mat_demon_3': 'demon_crystal.png', 'mat_demon_4': 'demon_flame.png', 'mat_demon_5': 'demon_crown.png',
    'mat_vampire_1': 'vampire_blood.png', 'mat_vampire_2': 'vampire_vial.png', 'mat_vampire_3': 'vampire_fang.png', 'mat_vampire_4': 'vampire_moon.png', 'mat_vampire_5': 'vampire_chalice.png',
    'mat_spirit_1': 'spirit_dust.png', 'mat_spirit_2': 'spirit_remnant.png', 'mat_spirit_3': 'spirit_crystal.png', 'mat_spirit_4': 'spirit_core.png', 'mat_spirit_5': 'spirit_pulse.png',
    'mat_hybrid_1': 'hybrid_claw.png', 'mat_hybrid_2': 'hybrid_fur.png', 'mat_hybrid_3': 'hybrid_bone.png', 'mat_hybrid_4': 'hybrid_crystal.png', 'mat_hybrid_5': 'hybrid_soul.png',
    'mat_dwarf_1': 'dwarf_copper.png', 'mat_dwarf_2': 'dwarf_bronze.png', 'mat_dwarf_3': 'dwarf_mithril.png', 'mat_dwarf_4': 'dwarf_heart.png', 'mat_dwarf_5': 'dwarf_hammer.png',
    'mat_ghoul_1': 'ghoul_bone.png', 'mat_ghoul_2': 'ghoul_remains.png', 'mat_ghoul_3': 'ghoul_skull.png', 'mat_ghoul_4': 'ghoul_crystal.png', 'mat_ghoul_5': 'ghoul_core.png',
    'book_general_1': 'gen_book_tactic.png', 'book_general_2': 'gen_book_combat.png', 'book_general_3': 'gen_book_arts.png', 'book_general_4': 'gen_book_war.png', 'book_general_5': 'gen_book_wisdom.png',
    'book_race_1': 'race_book_stone.png', 'book_race_2': 'race_book_ancestor.png', 'book_race_3': 'race_book_secrets.png', 'book_race_4': 'race_book_covenant.png', 'book_race_5': 'race_book_pact.png'
};

const LOOT_POOL = { Common: [], Uncommon: [], Rare: [], Epic: [], Legendary: [] };

if (upgradeMats && upgradeMats.weapon_materials) {
    upgradeMats.weapon_materials.forEach(race => {
        race.materials.forEach(m => {
            const raceFolder = race.race.toLowerCase().replace(' ', '_');
            const imgName = ID_TO_IMAGE[m.id] || `${m.id}.png`;
            LOOT_POOL[m.rarity].push({ ...m, type: 'material', race: race.race, imgPath: `${R2_URL}/images/materials/${raceFolder}/${imgName}` });
        });
    });
}

if (upgradeMats && upgradeMats.skill_books) {
    upgradeMats.skill_books.forEach(cat => {
        cat.books.forEach(b => {
            const typeFolder = cat.category === 'General_Skills' ? 'general' : 'race';
            const imgName = ID_TO_IMAGE[b.id] || `${b.id}.png`;
            LOOT_POOL[b.rarity].push({ ...b, type: 'book', category: cat.category, imgPath: `${R2_URL}/images/materials/${typeFolder}/${imgName}` });
        });
    });
}

// 🔥 نظام استعلام فولاذي للحماية من الفشل 🔥
const safeQuery = async (db, qPg, params) => {
    try { 
        let res = await db.query(qPg, params); 
        return { rows: Array.isArray(res) ? res : (res?.rows || []) };
    } catch(e) { 
        let fallbackQuery = qPg
            .replace(/"userID"/gi, "userid")
            .replace(/"guildID"/gi, "guildid")
            .replace(/"itemID"/gi, "itemid")
            .replace(/"skillID"/gi, "skillid")
            .replace(/"skillLevel"/gi, "skilllevel")
            .replace(/"raceName"/gi, "racename")
            .replace(/"weaponLevel"/gi, "weaponlevel")
            .replace(/"quantity"/gi, "quantity")
            .replace(/"mora"/gi, "mora")
            .replace(/"bank"/gi, "bank")
            .replace(/"level"/gi, "level")
            .replace(/"id"/gi, "id")
            .replace(/"user"/gi, "userid")
            .replace(/"guild"/gi, "guildid")
            .replace(/"epic_pity"/gi, "epic_pity")
            .replace(/"legendary_pity"/gi, "legendary_pity")
            .replace(/"last_free_claim"/gi, "last_free_claim");
        
        if (fallbackQuery !== qPg) {
            try { 
                let res2 = await db.query(fallbackQuery, params); 
                return { rows: Array.isArray(res2) ? res2 : (res2?.rows || []) };
            } catch(e2) { }
        }
        return { rows: [] };
    }
};

const safeExecute = async (db, qPg, params) => {
    try { await db.query(qPg, params); return true; } catch(e) { 
        let fallbackQuery = qPg
            .replace(/"userID"/gi, "userid")
            .replace(/"guildID"/gi, "guildid")
            .replace(/"itemID"/gi, "itemid")
            .replace(/"skillID"/gi, "skillid")
            .replace(/"skillLevel"/gi, "skilllevel")
            .replace(/"quantity"/gi, "quantity")
            .replace(/"mora"/gi, "mora")
            .replace(/"bank"/gi, "bank")
            .replace(/"user"/gi, "userid")
            .replace(/"guild"/gi, "guildid")
            .replace(/"epic_pity"/gi, "epic_pity")
            .replace(/"legendary_pity"/gi, "legendary_pity")
            .replace(/"last_free_claim"/gi, "last_free_claim");

        if (fallbackQuery !== qPg) {
            try { await db.query(fallbackQuery, params); return true; } catch(e2) { return false; }
        }
        return false;
    }
};

async function deductMora(client, db, userId, guildId, amount) {
    if (amount <= 0) return true;
    let res = await safeQuery(db, `SELECT "mora", "bank" FROM levels WHERE "user" = $1 AND "guild" = $2`, [userId, guildId]);
    if (!res || !res.rows || res.rows.length === 0) return false;

    let mora = Number(res.rows[0].mora || res.rows[0].Mora || 0);
    let bank = Number(res.rows[0].bank || res.rows[0].Bank || 0);

    if (mora + bank < amount) return false;

    if (mora >= amount) {
        mora -= amount;
    } else {
        let diff = amount - mora;
        mora = 0;
        bank -= diff;
    }

    if (client && typeof client.getLevel === 'function') {
        let u = await client.getLevel(userId, guildId);
        if (u) {
            u.mora = String(mora);
            u.bank = String(bank);
            if (typeof client.setLevel === 'function') await client.setLevel(u);
        }
    }

    await safeExecute(db, `UPDATE levels SET "mora" = $1, "bank" = $2 WHERE "user" = $3 AND "guild" = $4`, [mora, bank, userId, guildId]);
    return true;
}

async function ensurePityTable(db) {
    await safeExecute(db, `
        CREATE TABLE IF NOT EXISTS user_gacha_pity (
            "userID" TEXT, 
            "guildID" TEXT, 
            "epic_pity" INTEGER DEFAULT 0, 
            "legendary_pity" INTEGER DEFAULT 0, 
            "last_free_claim" TEXT DEFAULT '', 
            PRIMARY KEY ("userID", "guildID")
        )
    `, []);
}

function performPull(pityData, userRace) {
    pityData.epic_pity++;
    pityData.legendary_pity++;

    let rarity = 'Common';
    const rand = Math.random();

    if (pityData.legendary_pity >= 90) rarity = 'Legendary';
    else if (pityData.epic_pity >= 10) rarity = 'Epic';
    else {
        if (rand <= 0.006) rarity = 'Legendary';
        else if (rand <= 0.051) rarity = 'Epic';
        else if (rand <= 0.18) rarity = 'Rare';
        else if (rand <= 0.48) rarity = 'Uncommon';
        else rarity = 'Common';
    }

    if (rarity === 'Legendary') { pityData.legendary_pity = 0; pityData.epic_pity = 0; }
    else if (rarity === 'Epic') pityData.epic_pity = 0;

    let pool = LOOT_POOL[rarity] && LOOT_POOL[rarity].length > 0 ? [...LOOT_POOL[rarity]] : [...LOOT_POOL['Common']];

    if (pool.length === 0) pool = [...LOOT_POOL['Common']]; 

    if (userRace && (rarity === 'Epic' || rarity === 'Legendary')) {
        if (Math.random() < 0.75) {
            const racePool = pool.filter(item => item.race === userRace || (item.type === 'book' && item.category === 'race'));
            if (racePool.length > 0) pool = racePool;
        }
    }

    const item = pool[Math.floor(Math.random() * pool.length)];
    return { item, rarity };
}

async function maintainChestInventory(db, userId, guildId) {
    const invRes = await safeQuery(db, `SELECT "id", "ID", "itemID", "itemid", "quantity", "Quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId]);
    
    let freeCount = 0;
    let paidCount = 0;
    
    if (invRes.rows) {
        for (const row of invRes.rows) {
            const id = String(row.itemID || row.itemid || '').toLowerCase().trim();
            const qty = Number(row.quantity || row.Quantity || 0);
            if (id === 'free_gacha_chest') freeCount += qty;
            if (id === 'gacha_chest') paidCount += qty;
        }
    }
    
    await safeExecute(db, `DELETE FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND LOWER("itemID") IN ('free_gacha_chest', 'gacha_chest')`, [userId, guildId]);
    
    if (freeCount > 0) await safeExecute(db, `INSERT INTO user_inventory ("guildID", "userID", "itemID", "quantity") VALUES ($1, $2, 'free_gacha_chest', $3)`, [guildId, userId, freeCount]);
    if (paidCount > 0) await safeExecute(db, `INSERT INTO user_inventory ("guildID", "userID", "itemID", "quantity") VALUES ($1, $2, 'gacha_chest', $3)`, [guildId, userId, paidCount]);
    
    return { freeChests: freeCount, paidChests: paidCount };
}

module.exports = {
    data: new SlashCommandBuilder().setName('صندوق').setDescription('صناديق سحرية تستدعي الارتيفاكت لتطوير عتادك'),
    name: 'صندوق',
    aliases: ['gacha', 'صناديق', 'صندوق', 'غاتشا', 'قاتشا', 'pull'],
    category: 'Economy',

    async execute(interactionOrMessage) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        const client = interactionOrMessage.client;
        const db = client.sql;
        const user = isSlash ? interactionOrMessage.user : interactionOrMessage.author;
        const guildId = interactionOrMessage.guild.id;
        const member = isSlash ? interactionOrMessage.member : interactionOrMessage.member;

        const reply = async (payload) => isSlash ? interactionOrMessage.editReply(payload).catch(()=>{}) : interactionOrMessage.reply(payload).catch(()=>{});

        if (activeGachaUsers.has(user.id)) {
            const msgPayload = { content: '⏳ **الرجاء إنهاء الصناديق الحالية أو انتظار فك القفل...**', flags: [MessageFlags.Ephemeral] };
            if (isSlash) {
                if(!interactionOrMessage.deferred && !interactionOrMessage.replied) await interactionOrMessage.reply(msgPayload).catch(()=>{});
                else await interactionOrMessage.followUp(msgPayload).catch(()=>{});
            } else {
                await interactionOrMessage.reply(msgPayload).catch(()=>{});
            }
            return;
        }

        if (isSlash) await interactionOrMessage.deferReply().catch(()=>{});
        if (!db) return reply({ content: "خطأ في قاعدة البيانات" });
        
        activeGachaUsers.add(user.id);

        let initialMsg;
        try {
            await ensurePityTable(db);

            let userMora = 0;
            let userBank = 0;
            let freeChests = 0;
            let paidChests = 0;
            let totalChests = 0;
            let pityData = { epic_pity: 0, legendary_pity: 0, last_free_claim: '' };
            let userRace = null;

            // 🔥 تم نقل متغيرات الصفحة لتكون في المتناول دائماً
            let currentResults = [];
            let currentPullCount = 0;
            let currentImageIndex = 0;

            const fetchUserData = async () => {
                let cacheMora = null;
                let cacheBank = null;
                try {
                    if (client.getLevel) {
                        let u = await client.getLevel(user.id, guildId);
                        if (u) {
                            cacheMora = Number(u.mora || u.Mora || 0);
                            cacheBank = Number(u.bank || u.Bank || 0);
                        }
                    }
                } catch(e) {}

                const [lvlRes, wepRes] = await Promise.all([
                    safeQuery(db, `SELECT "mora", "bank" FROM levels WHERE "user" = $1 AND "guild" = $2`, [user.id, guildId]),
                    safeQuery(db, `SELECT "raceName", "racename" FROM user_weapons WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guildId])
                ]);

                userMora = cacheMora !== null ? cacheMora : (lvlRes.rows[0] ? Number(lvlRes.rows[0].mora || lvlRes.rows[0].Mora || 0) : 0);
                userBank = cacheBank !== null ? cacheBank : (lvlRes.rows[0] ? Number(lvlRes.rows[0].bank || lvlRes.rows[0].Bank || 0) : 0);
                
                const chestCounts = await maintainChestInventory(db, user.id, guildId);
                freeChests = chestCounts.freeChests;
                paidChests = chestCounts.paidChests;
                totalChests = freeChests + paidChests;
                
                if (wepRes.rows[0]) userRace = wepRes.rows[0].raceName || wepRes.rows[0].racename;
            };

            await fetchUserData();
            const pityRes = await safeQuery(db, `SELECT * FROM user_gacha_pity WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guildId]);
            if (pityRes.rows[0]) {
                pityData.epic_pity = pityRes.rows[0].epic_pity || 0;
                pityData.legendary_pity = pityRes.rows[0].legendary_pity || 0;
                pityData.last_free_claim = pityRes.rows[0].last_free_claim || '';
            } else {
                await safeExecute(db, `INSERT INTO user_gacha_pity ("userID", "guildID", "last_free_claim") VALUES ($1, $2, '')`, [user.id, guildId]);
            }

            let dailyLimit = 0;
            if (member && member.roles && member.roles.cache.has('1422160802416164885')) dailyLimit = 20;
            else if (member && member.roles && member.roles.cache.has('1395674235002945636')) dailyLimit = 10;

            const todaySaudi = new Date().toLocaleString('en-US', { timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit' });

            if (dailyLimit > 0 && pityData.last_free_claim !== todaySaudi) {
                await safeExecute(db, `DELETE FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND LOWER("itemID") = 'free_gacha_chest'`, [user.id, guildId]);
                await safeExecute(db, `INSERT INTO user_inventory ("guildID", "userID", "itemID", "quantity") VALUES ($1, $2, 'free_gacha_chest', $3)`, [guildId, user.id, dailyLimit]);
                
                freeChests = dailyLimit;
                totalChests = freeChests + paidChests;
                
                await safeExecute(db, `UPDATE user_gacha_pity SET "last_free_claim" = $1 WHERE "userID" = $2 AND "guildID" = $3`, [todaySaudi, user.id, guildId]);
                pityData.last_free_claim = todaySaudi;

                (isSlash ? interactionOrMessage.channel : interactionOrMessage.channel).send({ content: `🎁 <@${user.id}> **مكافأة يومية!** لقد تم تجديد صناديقك المجانية لليوم لتصبح **${dailyLimit}** صناديق.` }).catch(()=>{});
            }

            const getPullButtons = (totalBalance) => {
                return new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('gacha_1').setLabel('سحب x1').setEmoji('🎁').setStyle(ButtonStyle.Primary).setDisabled(totalBalance < PULL_PRICE),
                    new ButtonBuilder().setCustomId('gacha_10').setLabel('سحب x10').setEmoji('🌟').setStyle(ButtonStyle.Success).setDisabled(totalBalance < PULL_PRICE * 10),
                    new ButtonBuilder().setCustomId('gacha_inventory').setLabel('صناديقي').setEmoji('🎒').setStyle(ButtonStyle.Secondary)
                );
            };

            const getReturnButton = () => {
                return new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('gacha_return_hub').setLabel('الرئيسية').setEmoji('↩️').setStyle(ButtonStyle.Secondary)
                );
            };

            const getPagePayload = async (idx) => {
                if (idx >= currentResults.length) idx = currentResults.length - 1;
                if (idx < 0) idx = 0;

                const res = currentResults[idx];
                let files = [];
                if (generateGachaCard && res.item) {
                    try {
                        const buffer = await generateGachaCard(res.item, res.rarity);
                        if (buffer) files.push(new AttachmentBuilder(buffer, { name: `gacha_${idx}.png` }));
                    } catch(e){}
                }

                const row = new ActionRowBuilder();
                if (idx < currentPullCount - 1) {
                    row.addComponents(
                        new ButtonBuilder().setCustomId('gacha_next').setLabel('التالي').setEmoji('➡️').setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId('gacha_skip').setLabel('تخطي').setEmoji('⏭️').setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId('gacha_return_hub').setLabel('الرئيسية').setEmoji('↩️').setStyle(ButtonStyle.Danger)
                    );
                } else {
                    row.addComponents(
                        new ButtonBuilder().setCustomId('gacha_return_hub').setLabel('الرئيسية').setEmoji('↩️').setStyle(ButtonStyle.Success)
                    );
                }
                return { embeds: [], components: [row], files, content: files.length > 0 ? '' : '\u200B' };
            };

            const generateAndSendHub = async (targetMsg) => {
                await fetchUserData(); 
                const summaryRandomText = FLAVOR_TEXTS[Math.floor(Math.random() * FLAVOR_TEXTS.length)];
                let files = [];
                let totalBal = userMora + userBank; 
                
                if (generateGachaHub) {
                    try {
                        const hubBuffer = await generateGachaHub(user, totalBal, summaryRandomText, totalChests);
                        if (hubBuffer) files.push(new AttachmentBuilder(hubBuffer, { name: 'gacha_hub.png' }));
                    } catch(e){}
                }
                
                const safeContent = files.length > 0 ? '' : '\u200B';

                if (targetMsg) {
                    await targetMsg.edit({ components: [getPullButtons(totalBal)], files, embeds: [], content: safeContent }).catch(()=>{});
                } else {
                    return { components: [getPullButtons(totalBal)], files, embeds: [], content: safeContent };
                }
            };

            const showInventoryMenu = async (targetMsg) => {
                await fetchUserData();
                let files = [];
                
                if (generateGachaInventory) {
                    try {
                        const invBuffer = await generateGachaInventory(user, freeChests, paidChests);
                        if (invBuffer) files.push(new AttachmentBuilder(invBuffer, { name: 'gacha_inventory.png' }));
                    } catch(e){}
                }

                const row = new ActionRowBuilder();
                if (totalChests >= 1) row.addComponents(new ButtonBuilder().setCustomId('open_chest_1').setLabel('فتح 1').setEmoji('🎁').setStyle(ButtonStyle.Primary));
                if (totalChests >= 10) row.addComponents(new ButtonBuilder().setCustomId('open_chest_10').setLabel('فتح 10').setEmoji('🌟').setStyle(ButtonStyle.Success));
                
                row.addComponents(new ButtonBuilder().setCustomId('gacha_return_hub').setLabel('رجوع').setEmoji('↩️').setStyle(ButtonStyle.Secondary));
                
                await targetMsg.edit({ embeds: [], components: [row], files, content: files.length > 0 ? '' : '\u200B' }).catch(()=>{});
            };

            const executePulls = async (pCount, isBuying, cost) => {
                try {
                    if (isBuying) {
                        let deducted = await deductMora(client, db, user.id, guildId, cost);
                        if (!deducted) return null;
                    } else {
                        let remainingFree = Math.min(freeChests, pCount);
                        let remainingPaid = Math.min(paidChests, pCount - remainingFree);
                        
                        if (remainingFree > 0) {
                            await safeExecute(db, `UPDATE user_inventory SET "quantity" = CAST(COALESCE("quantity", '0') AS INTEGER) - $1 WHERE "userID" = $2 AND "guildID" = $3 AND LOWER("itemID") = 'free_gacha_chest'`, [remainingFree, user.id, guildId]);
                        }
                        if (remainingPaid > 0) {
                            await safeExecute(db, `UPDATE user_inventory SET "quantity" = CAST(COALESCE("quantity", '0') AS INTEGER) - $1 WHERE "userID" = $2 AND "guildID" = $3 AND LOWER("itemID") = 'gacha_chest'`, [remainingPaid, user.id, guildId]);
                        }
                        
                        freeChests -= remainingFree;
                        paidChests -= remainingPaid;
                        totalChests = freeChests + paidChests;
                        
                        await safeExecute(db, `DELETE FROM user_inventory WHERE CAST(COALESCE("quantity", '0') AS INTEGER) <= 0 AND "userID" = $1 AND "guildID" = $2`, [user.id, guildId]);
                    }

                    const resArr = [];
                    let highestRarityVal = 0;
                    const rarityOrder = { Common: 0, Uncommon: 1, Rare: 2, Epic: 3, Legendary: 4 };
                    let bestResult = null;

                    const itemsToAdd = {};

                    for (let k = 0; k < pCount; k++) {
                        const { item, rarity } = performPull(pityData, userRace);
                        
                        if (rarityOrder[rarity] > highestRarityVal) {
                            highestRarityVal = rarityOrder[rarity];
                            bestResult = { item, rarity };
                        }

                        if (item) {
                            if (!itemsToAdd[item.id]) itemsToAdd[item.id] = 0;
                            itemsToAdd[item.id]++;
                        }
                        
                        if (item) resArr.push({ item, rarity });
                    }

                    const updatePromises = [];

                    for (const [itemId, qty] of Object.entries(itemsToAdd)) {
                        updatePromises.push((async () => {
                            let existingItemRes = await safeQuery(db, `SELECT "id", "ID" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND LOWER("itemID") = LOWER($3)`, [user.id, guildId, itemId]);
                            if (existingItemRes.rows[0]) {
                                await safeExecute(db, `UPDATE user_inventory SET "quantity" = CAST(COALESCE("quantity", '0') AS INTEGER) + $1 WHERE "id" = $2`, [qty, existingItemRes.rows[0].id || existingItemRes.rows[0].ID]);
                            } else {
                                await safeExecute(db, `INSERT INTO user_inventory ("guildID", "userID", "itemID", "quantity") VALUES ($1, $2, $3, $4)`, [guildId, user.id, itemId, qty]);
                            }
                        })());
                    }

                    updatePromises.push(safeExecute(db, `UPDATE user_gacha_pity SET "epic_pity" = $1, "legendary_pity" = $2 WHERE "userID" = $3 AND "guildID" = $4`, [pityData.epic_pity, pityData.legendary_pity, user.id, guildId]));

                    await Promise.all(updatePromises);

                    return { bestResult, resArr };
                } catch (e) {
                    return null;
                }
            };

            const initialPayload = await generateAndSendHub();
            initialMsg = await reply(initialPayload).catch(()=>{});
            
            if (!initialMsg) {
                activeGachaUsers.delete(user.id);
                return;
            }
            
            let isProcessing = false;

            // 🔥 استخدام מجمع أحداث واحد فولاذي لجميع العمليات 🔥
            const channelCollector = (isSlash ? interactionOrMessage.channel : interactionOrMessage.channel).createMessageComponentCollector({
                filter: i => i.user.id === user.id && ['gacha_1', 'gacha_10', 'gacha_inventory', 'gacha_return_hub', 'open_chest_1', 'open_chest_10', 'gacha_next', 'gacha_skip'].includes(i.customId),
                time: 300000 
            });

            channelCollector.on('collect', async (i) => {
                if (isProcessing) {
                    return i.reply({ content: '⏳ يرجى الانتظار...', flags: [MessageFlags.Ephemeral] }).catch(()=>{});
                }
                isProcessing = true;

                try {
                    try { await i.deferUpdate().catch(()=>{}); } catch (err) { return; }

                    if (i.customId === 'gacha_inventory') {
                        await showInventoryMenu(initialMsg);
                        isProcessing = false;
                        return;
                    }

                    if (i.customId === 'gacha_return_hub') {
                        await generateAndSendHub(initialMsg);
                        isProcessing = false;
                        return;
                    }

                    if (i.customId === 'gacha_skip') {
                        currentImageIndex = currentPullCount - 1; 
                        await initialMsg.edit(await getPagePayload(currentImageIndex)).catch(()=>{});
                        isProcessing = false;
                        return;
                    }

                    if (i.customId === 'gacha_next') {
                        if (currentImageIndex < currentPullCount - 1) {
                            currentImageIndex++;
                            await initialMsg.edit(await getPagePayload(currentImageIndex)).catch(()=>{});
                        }
                        isProcessing = false;
                        return;
                    }

                    // إجراء عملية شراء أو فتح
                    await fetchUserData();
                    
                    let isBuying = i.customId.startsWith('gacha_');
                    currentPullCount = (i.customId === 'gacha_10' || i.customId === 'open_chest_10') ? 10 : 1;
                    let cost = 0;
                    let totalBal = userMora + userBank; 

                    if (isBuying) {
                        cost = currentPullCount * PULL_PRICE;
                        if (totalBal < cost) {
                            await i.followUp({ content: "❌ لا تملك المورا الكافية!", flags: [MessageFlags.Ephemeral] }).catch(()=>{});
                            isProcessing = false;
                            return;
                        }
                    } else {
                        if (totalChests < currentPullCount) {
                            await i.followUp({ content: "❌ لا تملك صناديق كافية", flags: [MessageFlags.Ephemeral] }).catch(()=>{});
                            isProcessing = false;
                            return;
                        }
                    }

                    await initialMsg.edit({ components: [], embeds: [], content: '' }).catch(()=>{});

                    const pullsData = await executePulls(currentPullCount, isBuying, cost);
                    if (!pullsData) {
                        await i.followUp({ content: "❌ فشل خصم الموارد! يرجى المحاولة لاحقاً.", flags: [MessageFlags.Ephemeral] }).catch(()=>{});
                        isProcessing = false;
                        return;
                    }

                    const { bestResult, resArr } = pullsData;
                    currentResults = resArr;
                    currentImageIndex = 0;

                    if (!bestResult || !bestResult.item) {
                        await generateAndSendHub(initialMsg);
                        isProcessing = false;
                        return;
                    }

                    const prefix = currentPullCount > 1 ? 'ten_' : 'single_';
                    const meteorFileName = `${prefix}${bestResult.rarity}.png`;
                    const meteorUrl = `${R2_URL}/images/gacha/${meteorFileName}`;
                    let meteorFiles = [new AttachmentBuilder(meteorUrl, { name: meteorFileName })];
                    
                    await initialMsg.edit({ files: meteorFiles, components: [], embeds: [], content: '' }).catch(()=>{});
                    await new Promise(r => setTimeout(r, 1000));

                    if (currentPullCount > 10) {
                        let files = [];
                        if (generateGachaCard && bestResult.item) {
                            try {
                                const buffer = await generateGachaCard(bestResult.item, bestResult.rarity);
                                if (buffer) files.push(new AttachmentBuilder(buffer, { name: `gacha_best.png` }));
                            } catch(e){}
                        }
                        await initialMsg.edit({ embeds: [], files, components: [getReturnButton()], content: files.length > 0 ? '' : '\u200B' }).catch(()=>{});
                    } else if (currentPullCount > 1) {
                        await initialMsg.edit(await getPagePayload(0)).catch(()=>{});
                    } else {
                        // سحب مفرد: عرض زر العودة المفقود
                        let files = [];
                        if (generateGachaCard && bestResult.item) {
                            try {
                                const buffer = await generateGachaCard(bestResult.item, bestResult.rarity);
                                if (buffer) files.push(new AttachmentBuilder(buffer, { name: `gacha_0.png` }));
                            } catch(e){}
                        }
                        await initialMsg.edit({ embeds: [], files, components: [getReturnButton()], content: files.length > 0 ? '' : '\u200B' }).catch(()=>{});
                    }

                } catch (e) {
                } finally {
                    isProcessing = false;
                }
            });

            channelCollector.on('end', () => { 
                activeGachaUsers.delete(user.id); 
                if (initialMsg && initialMsg.editable) initialMsg.edit({ components: [] }).catch(() => {}); 
            });

        } catch (err) {
            activeGachaUsers.delete(user.id);
        }
    }
};
