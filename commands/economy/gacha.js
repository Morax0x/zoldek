const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, AttachmentBuilder, EmbedBuilder } = require('discord.js');

let generateGachaCard, generateGachaHub, generateGachaInventory, generateGachaSummary;
try {
    ({ generateGachaCard, generateGachaHub, generateGachaInventory, generateGachaSummary } = require('../../generators/gacha-generator.js'));
} catch (e) {
    generateGachaCard = null; generateGachaHub = null; generateGachaInventory = null; generateGachaSummary = null;
}

const upgradeMats = require('../../json/upgrade-materials.json');

const PULL_PRICE = 1000;
const R2_URL = 'https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev';

const activeGachaUsers = new Map();

const FLAVOR_TEXTS = [
    "قدم المورا ودع النجوم ترسم لك مسارا جديدا",
    "بين يديك مفتاح الابعاد اكسر الختم لترى اي اسطورة ستستجيب",
    "النجوم تنتظر من يوقظها ادفع المورا وابدا طقوس الاستدعاء",
    "مقابل المورا قد تبتسم لك الاقدار او تدير لك ظهرها جرب حظك",
    "اكسر قيود الزمن واستحضر القوة المنسية الى قبضتك",
    "خلف هذا الختم ترقد كنوز الامبراطورية افتحه واصنع مجدك",
    "ايقظ التحف النادرة من سباتها الابدي المورا هي الثمن",
    "طريق العظمة محفوف بالمخاطر والمكافات اكشف غنيمتك",
    "همسات الاقدار تناديك استخدم المورا لفك طلاسم الصندوق"
];

const ID_TO_IMAGE = {
    'mat_dragon_1': 'dragon_ash.png', 'mat_dragon_2': 'dragon_scale.png', 'mat_dragon_3': 'dragon_claw.png', 'mat_dragon_4': 'dragon_heart.png', 'mat_dragon_5': 'dragon_core.png',
    'mat_human_1': 'human_iron.png', 'mat_human_2': 'human_steel.png', 'mat_human_3': 'human_meteor.png', 'mat_human_4': 'human_seal.png', 'mat_human_5': 'human_crown.png',
    'mat_elf_1': 'elf_branch.png', 'mat_elf_2': 'elf_bark.png', 'mat_elf_3': 'elf_flower.png', 'mat_elf_4': 'elf_crystal.png', 'mat_elf_5': 'elf_tear.png',
    'mat_darkelf_1': 'darkelf_obsidian.png', 'mat_darkelf_2': 'darkelf_glass.png', 'mat_darkelf_3': 'darkelf_crystal.png', 'mat_darkelf_4': 'darkelf_void.png', 'mat_darkelf_5': 'darkelf_ash.png',
    'mat_seraphim_1': 'seraphim_feathe.png', 'mat_seraphim_2': 'seraphim_halo.png', 'mat_seraphim_3': 'seraphim_crystal.png', 'mat_seraphim_4': 'seraphim_core.png', 'mat_seraphim_5': 'seraphim_chalice.png',
    'mat_demon_1': 'demon_ember.png', 'mat_demon_2': 'demon_horn.png', 'mat_demon_3': 'demon_crystal.png', 'mat_demon_4': 'demon_flame.png', 'mat_demon_5': 'demon_crown.png',
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

const safeQuery = async (db, qPg, params) => {
    try { 
        let res = await db.query(qPg, params); 
        return { rows: Array.isArray(res) ? res : (res?.rows || []) };
    } catch(e) { 
        let fallbackQuery = qPg.replace(/"userID"/gi, "userid").replace(/"guildID"/gi, "guildid").replace(/"itemID"/gi, "itemid").replace(/"quantity"/gi, "quantity").replace(/"mora"/gi, "mora").replace(/"bank"/gi, "bank").replace(/"user"/gi, "userid").replace(/"guild"/gi, "guildid").replace(/"id"/gi, "id");
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
        let fallbackQuery = qPg.replace(/"userID"/gi, "userid").replace(/"guildID"/gi, "guildid").replace(/"itemID"/gi, "itemid").replace(/"quantity"/gi, "quantity").replace(/"mora"/gi, "mora").replace(/"bank"/gi, "bank").replace(/"user"/gi, "userid").replace(/"guild"/gi, "guildid").replace(/"id"/gi, "id");
        if (fallbackQuery !== qPg) {
            try { await db.query(fallbackQuery, params); return true; } catch(e2) { return false; }
        }
        return false;
    }
};

async function deductMora(client, db, userId, guildId, amount) {
    if (amount <= 0) return true;
    let res = await safeQuery(db, `SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2`, [userId, guildId]);
    if (!res || !res.rows || res.rows.length === 0) return false;

    const row = res.rows[0];
    const moraKey = Object.keys(row).find(k => k.toLowerCase() === 'mora');
    const bankKey = Object.keys(row).find(k => k.toLowerCase() === 'bank');

    let mora = moraKey ? Number(row[moraKey]) : 0;
    let bank = bankKey ? Number(row[bankKey]) : 0;

    if (mora + bank < amount) return false;

    let moraDeduct = 0, bankDeduct = 0;
    if (mora >= amount) { moraDeduct = amount; }
    else { moraDeduct = mora; bankDeduct = amount - mora; }

    let newMora = Math.max(0, mora - moraDeduct);
    let newBank = Math.max(0, bank - bankDeduct);

    try {
        await db.query(`UPDATE levels SET "mora" = $1, "bank" = $2 WHERE "user" = $3 AND "guild" = $4`, [newMora, newBank, userId, guildId]);
    } catch(e) {
        await db.query(`UPDATE levels SET mora = $1, bank = $2 WHERE userid = $3 AND guildid = $4`, [newMora, newBank, userId, guildId]).catch(()=>{});
    }

    if (client && typeof client.getLevel === 'function') {
        let u = await client.getLevel(userId, guildId);
        if (u) {
            u.mora = String(newMora);
            u.bank = String(newBank);
            if (typeof client.setLevel === 'function') await client.setLevel(u);
        }
    }

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
    const consolidate = async (itemId) => {
        // Step 1: Get all rows (read-only, never loses data)
        let rows = [];
        try {
            const r = await db.query(
                `SELECT "id", GREATEST(0, CAST(COALESCE("quantity"::TEXT, '0') AS INTEGER)) AS qty FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND LOWER(CAST("itemID" AS TEXT)) = $3 ORDER BY "id"`,
                [userId, guildId, itemId]
            );
            rows = r.rows || [];
        } catch(e) {
            try {
                const r2 = await db.query(
                    `SELECT id, GREATEST(0, CAST(COALESCE(quantity::TEXT, '0') AS INTEGER)) AS qty FROM user_inventory WHERE userid = $1 AND guildid = $2 AND LOWER(CAST(itemid AS TEXT)) = $3 ORDER BY id`,
                    [userId, guildId, itemId]
                );
                rows = r2.rows || [];
            } catch(e2) { return 0; }
        }

        if (rows.length === 0) return 0;

        const total = rows.reduce((sum, r) => sum + Number(r.qty || 0), 0);

        // Single row: already consolidated, no DB modification needed
        if (rows.length === 1) return total;

        // Multiple rows: update first as keeper, delete/zero-out the rest
        // IMPORTANT: never delete BEFORE the keeper has the total (prevents data loss)
        const keeperId = rows[0].id;
        const otherIds = rows.slice(1).map(r => r.id);

        let keeperUpdated = false;
        try {
            await db.query(`UPDATE user_inventory SET "quantity" = $1 WHERE "id" = $2`, [total, keeperId]);
            keeperUpdated = true;
        } catch(e) {
            try {
                await db.query(`UPDATE user_inventory SET quantity = $1 WHERE id = $2`, [total, keeperId]);
                keeperUpdated = true;
            } catch(e2) {}
        }

        // If keeper update failed, leave DB untouched and return the total we calculated
        if (!keeperUpdated) return total;

        // Keeper has total now; safe to remove (or zero-out) other rows
        for (const otherId of otherIds) {
            let removed = false;
            try {
                await db.query(`DELETE FROM user_inventory WHERE "id" = $1`, [otherId]);
                removed = true;
            } catch(e) {
                try {
                    await db.query(`DELETE FROM user_inventory WHERE id = $1`, [otherId]);
                    removed = true;
                } catch(e2) {}
            }
            if (!removed) {
                // Fallback: zero out the row to prevent double-counting on next consolidation
                try {
                    await db.query(`UPDATE user_inventory SET "quantity" = 0 WHERE "id" = $1`, [otherId]);
                } catch(e) {
                    try { await db.query(`UPDATE user_inventory SET quantity = 0 WHERE id = $1`, [otherId]); } catch(e2) {}
                }
            }
        }

        return total;
    };

    const freeCount = await consolidate('free_gacha_chest');
    const paidCount = await consolidate('gacha_chest');
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
            const oldSession = activeGachaUsers.get(user.id);
            try {
                if (oldSession.collector) oldSession.collector.stop('override');
                if (oldSession.msg && oldSession.msg.deletable) await oldSession.msg.delete().catch(()=>{});
            } catch(e) {}
        }

        if (isSlash) await interactionOrMessage.deferReply().catch(()=>{});
        if (!db) return reply({ content: "خطأ في قاعدة البيانات" });

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
                    safeQuery(db, `SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2`, [user.id, guildId]),
                    safeQuery(db, `SELECT * FROM user_weapons WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guildId])
                ]);

                if (lvlRes.rows[0]) {
                    const moraKey = Object.keys(lvlRes.rows[0]).find(k => k.toLowerCase() === 'mora');
                    const bankKey = Object.keys(lvlRes.rows[0]).find(k => k.toLowerCase() === 'bank');
                    userMora = cacheMora !== null ? cacheMora : (moraKey ? Number(lvlRes.rows[0][moraKey]) : 0);
                    userBank = cacheBank !== null ? cacheBank : (bankKey ? Number(lvlRes.rows[0][bankKey]) : 0);
                }
                
                const chestCounts = await maintainChestInventory(db, user.id, guildId);
                freeChests = chestCounts.freeChests;
                paidChests = chestCounts.paidChests;
                totalChests = freeChests + paidChests;
                
                if (wepRes.rows[0]) {
                    const wRaceKey = Object.keys(wepRes.rows[0]).find(k => k.toLowerCase() === 'racename');
                    userRace = wRaceKey ? wepRes.rows[0][wRaceKey] : null;
                }
            };

            await fetchUserData();
            const pityRes = await safeQuery(db, `SELECT * FROM user_gacha_pity WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guildId]);
            if (pityRes.rows[0]) {
                const epicKey = Object.keys(pityRes.rows[0]).find(k => k.toLowerCase() === 'epic_pity');
                const legKey = Object.keys(pityRes.rows[0]).find(k => k.toLowerCase() === 'legendary_pity');
                const freeKey = Object.keys(pityRes.rows[0]).find(k => k.toLowerCase() === 'last_free_claim');
                
                pityData.epic_pity = epicKey ? Number(pityRes.rows[0][epicKey]) : 0;
                pityData.legendary_pity = legKey ? Number(pityRes.rows[0][legKey]) : 0;
                pityData.last_free_claim = freeKey ? pityRes.rows[0][freeKey] : '';
            } else {
                await safeExecute(db, `INSERT INTO user_gacha_pity ("userID", "guildID", "last_free_claim") VALUES ($1, $2, '')`, [user.id, guildId]);
            }

            let dailyLimit = 0;
            if (member && member.roles && member.roles.cache.has('1422160802416164885')) dailyLimit = 30; 
            else if (member && member.roles && member.roles.cache.has('1395674235002945636')) dailyLimit = 15; 

            const todaySaudi = new Date().toLocaleString('en-US', { timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit' });

            if (dailyLimit > 0 && pityData.last_free_claim !== todaySaudi) {
                await safeExecute(db, `UPDATE user_gacha_pity SET "last_free_claim" = $1 WHERE "userID" = $2 AND "guildID" = $3`, [todaySaudi, user.id, guildId]);
                pityData.last_free_claim = todaySaudi;

                // حاول تحديث صف واحد موجود (LIMIT 1 للسلامة)، وإلا أدرج صفاً جديداً
                // الاعتماد على LIMIT 1 يمنع تضاعف الإضافة عند وجود صفوف متعددة (فشل الدمج)
                let dailyUpdated = false;
                try {
                    const updRes = await db.query(
                        `UPDATE user_inventory SET "quantity" = CAST(COALESCE("quantity"::TEXT,'0') AS INTEGER) + $1 WHERE "id" = (SELECT "id" FROM user_inventory WHERE "userID" = $2 AND "guildID" = $3 AND LOWER(CAST("itemID" AS TEXT)) = 'free_gacha_chest' ORDER BY "id" LIMIT 1) RETURNING "quantity"`,
                        [dailyLimit, user.id, guildId]
                    );
                    dailyUpdated = updRes && updRes.rows && updRes.rows.length > 0;
                } catch(e) {
                    try {
                        const updRes2 = await db.query(
                            `UPDATE user_inventory SET quantity = CAST(COALESCE(quantity::TEXT,'0') AS INTEGER) + $1 WHERE id = (SELECT id FROM user_inventory WHERE userid = $2 AND guildid = $3 AND LOWER(CAST(itemid AS TEXT)) = 'free_gacha_chest' ORDER BY id LIMIT 1) RETURNING quantity`,
                            [dailyLimit, user.id, guildId]
                        );
                        dailyUpdated = updRes2 && updRes2.rows && updRes2.rows.length > 0;
                    } catch(e2) {}
                }

                if (!dailyUpdated) {
                    try { await db.query(`INSERT INTO user_inventory ("guildID", "userID", "itemID", "quantity") VALUES ($1, $2, 'free_gacha_chest', $3)`, [guildId, user.id, dailyLimit]); }
                    catch(e) { await db.query(`INSERT INTO user_inventory (guildid, userid, itemid, quantity) VALUES ($1, $2, 'free_gacha_chest', $3)`, [guildId, user.id, dailyLimit]).catch(()=>{}); }
                }
                
                freeChests += dailyLimit;
                totalChests = freeChests + paidChests;

                (isSlash ? interactionOrMessage.channel : interactionOrMessage.channel).send({ 
                    content: `❖ <@${user.id}>\n✦ لأنك احد داعمي الامبراطوريـة حـصـلـت عـلـى  «${dailyLimit}»  صندوق <:gboost:1439665966354268201>` 
                }).catch(()=>{});
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
                let fallbackEmbeds = [];

                if (generateGachaCard && res.item) {
                    try {
                        const buffer = await generateGachaCard(res.item, res.rarity);
                        if (buffer) {
                            files.push(new AttachmentBuilder(buffer, { name: `gacha_${idx}.png` }));
                        } else {
                            fallbackEmbeds.push(new EmbedBuilder().setTitle(`🎁 حصلت على: ${res.item.name || res.item.id}`).setDescription(`الندرة: **${res.rarity}**`).setColor(res.rarity === 'Legendary' ? '#F1C40F' : '#3498DB'));
                        }
                    } catch(e) {
                        fallbackEmbeds.push(new EmbedBuilder().setTitle(`🎁 حصلت على: ${res.item.name || res.item.id}`).setDescription(`الندرة: **${res.rarity}**`).setColor(res.rarity === 'Legendary' ? '#F1C40F' : '#3498DB'));
                    }
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
                return { embeds: fallbackEmbeds, components: [row], files, content: (files.length > 0 || fallbackEmbeds.length > 0) ? '' : '\u200B' };
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
                        
                        // خصم من صف واحد (LIMIT 1) مع GREATEST(0,...) لمنع القيم السالبة
                        // بعد الدمج هناك صف واحد فقط لكل نوع، وإن لم يكن نختار الأكبر
                        if (remainingFree > 0) {
                            try { await db.query(`UPDATE user_inventory SET "quantity" = GREATEST(0, CAST(COALESCE("quantity"::TEXT,'0') AS INTEGER) - $1) WHERE "id" = (SELECT "id" FROM user_inventory WHERE "userID" = $2 AND "guildID" = $3 AND LOWER(CAST("itemID" AS TEXT)) = 'free_gacha_chest' ORDER BY CAST(COALESCE("quantity"::TEXT,'0') AS INTEGER) DESC LIMIT 1)`, [remainingFree, user.id, guildId]); }
                            catch(e) { await db.query(`UPDATE user_inventory SET quantity = GREATEST(0, CAST(COALESCE(quantity::TEXT,'0') AS INTEGER) - $1) WHERE id = (SELECT id FROM user_inventory WHERE userid = $2 AND guildid = $3 AND LOWER(CAST(itemid AS TEXT)) = 'free_gacha_chest' ORDER BY CAST(COALESCE(quantity::TEXT,'0') AS INTEGER) DESC LIMIT 1)`, [remainingFree, user.id, guildId]).catch(()=>{}); }
                        }
                        if (remainingPaid > 0) {
                            try { await db.query(`UPDATE user_inventory SET "quantity" = GREATEST(0, CAST(COALESCE("quantity"::TEXT,'0') AS INTEGER) - $1) WHERE "id" = (SELECT "id" FROM user_inventory WHERE "userID" = $2 AND "guildID" = $3 AND LOWER(CAST("itemID" AS TEXT)) = 'gacha_chest' ORDER BY CAST(COALESCE("quantity"::TEXT,'0') AS INTEGER) DESC LIMIT 1)`, [remainingPaid, user.id, guildId]); }
                            catch(e) { await db.query(`UPDATE user_inventory SET quantity = GREATEST(0, CAST(COALESCE(quantity::TEXT,'0') AS INTEGER) - $1) WHERE id = (SELECT id FROM user_inventory WHERE userid = $2 AND guildid = $3 AND LOWER(CAST(itemid AS TEXT)) = 'gacha_chest' ORDER BY CAST(COALESCE(quantity::TEXT,'0') AS INTEGER) DESC LIMIT 1)`, [remainingPaid, user.id, guildId]).catch(()=>{}); }
                        }

                        freeChests -= remainingFree;
                        paidChests -= remainingPaid;
                        totalChests = freeChests + paidChests;

                        try { await db.query(`DELETE FROM user_inventory WHERE CAST(COALESCE("quantity"::TEXT, '0') AS INTEGER) <= 0 AND "userID" = $1 AND "guildID" = $2`, [user.id, guildId]); }
                        catch(e) { await db.query(`DELETE FROM user_inventory WHERE CAST(COALESCE(quantity::TEXT, '0') AS INTEGER) <= 0 AND userid = $1 AND guildid = $2`, [user.id, guildId]).catch(()=>{}); }
                    }

                    const resArr = [];
                    let highestRarityVal = -1;
                    const rarityOrder = { Common: 0, Uncommon: 1, Rare: 2, Epic: 3, Legendary: 4 };
                    let bestResult = null;

                    const itemsToAdd = {};

                    for (let k = 0; k < pCount; k++) {
                        const { item, rarity } = performPull(pityData, userRace);
                        
                        if (bestResult === null || rarityOrder[rarity] > highestRarityVal) {
                            highestRarityVal = rarityOrder[rarity];
                            bestResult = { item, rarity };
                        }

                        if (item) {
                            if (!itemsToAdd[item.id]) itemsToAdd[item.id] = 0;
                            itemsToAdd[item.id]++;
                        }
                        
                        if (item) resArr.push({ item, rarity });
                    }

                    for (const [itemId, qty] of Object.entries(itemsToAdd)) {
                        const safeItemId = itemId.toLowerCase();
                        // تحديث صف واحد فقط (LIMIT 1) مع RETURNING لمعرفة نجاح العملية
                        // وإلا إدراج صف جديد - هذا يمنع تضاعف الكمية على صفوف متعددة
                        let itemUpdated = false;
                        try {
                            const updRes = await db.query(
                                `UPDATE user_inventory SET "quantity" = CAST(COALESCE("quantity"::TEXT,'0') AS INTEGER) + $1 WHERE "id" = (SELECT "id" FROM user_inventory WHERE "userID" = $2 AND "guildID" = $3 AND LOWER(CAST("itemID" AS TEXT)) = $4 LIMIT 1) RETURNING "quantity"`,
                                [qty, user.id, guildId, safeItemId]
                            );
                            itemUpdated = updRes && updRes.rows && updRes.rows.length > 0;
                        } catch(e) {
                            try {
                                const updRes2 = await db.query(
                                    `UPDATE user_inventory SET quantity = CAST(COALESCE(quantity::TEXT,'0') AS INTEGER) + $1 WHERE id = (SELECT id FROM user_inventory WHERE userid = $2 AND guildid = $3 AND LOWER(CAST(itemid AS TEXT)) = $4 LIMIT 1) RETURNING quantity`,
                                    [qty, user.id, guildId, safeItemId]
                                );
                                itemUpdated = updRes2 && updRes2.rows && updRes2.rows.length > 0;
                            } catch(e2) {}
                        }

                        if (!itemUpdated) {
                            try { await db.query(`INSERT INTO user_inventory ("guildID", "userID", "itemID", "quantity") VALUES ($1, $2, $3, $4)`, [guildId, user.id, safeItemId, qty]); }
                            catch(e) { await db.query(`INSERT INTO user_inventory (guildid, userid, itemid, quantity) VALUES ($1, $2, $3, $4)`, [guildId, user.id, safeItemId, qty]).catch(()=>{}); }
                        }
                    }

                    await safeExecute(db, `UPDATE user_gacha_pity SET "epic_pity" = $1, "legendary_pity" = $2 WHERE "userID" = $3 AND "guildID" = $4`, [pityData.epic_pity, pityData.legendary_pity, user.id, guildId]);

                    return { bestResult, resArr };
                } catch (e) {
                    return null;
                }
            };

            const initialPayload = await generateAndSendHub();
            initialMsg = await reply(initialPayload).catch(()=>{});
            
            if (!initialMsg) {
                return;
            }
            
            const channelCollector = (isSlash ? interactionOrMessage.channel : interactionOrMessage.channel).createMessageComponentCollector({
                filter: i => i.user.id === user.id && ['gacha_1', 'gacha_10', 'gacha_inventory', 'gacha_return_hub', 'open_chest_1', 'open_chest_10', 'gacha_next', 'gacha_skip'].includes(i.customId),
                time: 300000 
            });

            activeGachaUsers.set(user.id, { msg: initialMsg, collector: channelCollector });
            
            let isProcessing = false;

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
                        if (generateGachaSummary && currentResults.length > 1) {
                            try {
                                const summaryBuffer = await generateGachaSummary(user, currentResults);
                                if (summaryBuffer) {
                                    const attachment = new AttachmentBuilder(summaryBuffer, { name: 'gacha_summary.png' });
                                    await initialMsg.edit({ embeds: [], files: [attachment], components: [getReturnButton()], content: '' }).catch(()=>{});
                                    isProcessing = false;
                                    return;
                                }
                            } catch(e) {}
                        }
                        
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

                    if (currentPullCount > 1) {
                        await initialMsg.edit(await getPagePayload(0)).catch(()=>{});
                    } else {
                        let files = [];
                        let fallbackEmbeds = [];
                        if (generateGachaCard && bestResult.item) {
                            try {
                                const buffer = await generateGachaCard(bestResult.item, bestResult.rarity);
                                if (buffer) {
                                    files.push(new AttachmentBuilder(buffer, { name: `gacha_0.png` }));
                                } else {
                                    fallbackEmbeds.push(new EmbedBuilder().setTitle(`🎁 حصلت على: ${bestResult.item.name || bestResult.item.id}`).setDescription(`الندرة: **${bestResult.rarity}**`).setColor(bestResult.rarity === 'Legendary' ? '#F1C40F' : '#3498DB'));
                                }
                            } catch(e){
                                fallbackEmbeds.push(new EmbedBuilder().setTitle(`🎁 حصلت على: ${bestResult.item.name || bestResult.item.id}`).setDescription(`الندرة: **${bestResult.rarity}**`).setColor(bestResult.rarity === 'Legendary' ? '#F1C40F' : '#3498DB'));
                            }
                        }
                        
                        await fetchUserData(); 
                        
                        await initialMsg.edit({ embeds: fallbackEmbeds, files, components: [getReturnButton()], content: (files.length > 0 || fallbackEmbeds.length > 0) ? '' : '\u200B' }).catch(()=>{});
                    }

                } catch (e) {
                } finally {
                    isProcessing = false;
                }
            });

            channelCollector.on('end', (collected, reason) => { 
                if (reason !== 'override') {
                    activeGachaUsers.delete(user.id); 
                    if (initialMsg && initialMsg.editable) initialMsg.edit({ components: [] }).catch(() => {}); 
                }
            });

        } catch (err) {
            activeGachaUsers.delete(user.id);
        }
    }
};
