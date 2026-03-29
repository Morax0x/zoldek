const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Colors, MessageFlags, AttachmentBuilder, EmbedBuilder } = require('discord.js');

let generateGachaCard, generateGachaHub;
try {
    ({ generateGachaCard, generateGachaHub } = require('../../generators/gacha-generator.js'));
} catch (e) {
    generateGachaCard = null; generateGachaHub = null;
}

const skillsConfig = require('../../json/skills-config.json');
const upgradeMats = require('../../json/upgrade-materials.json');

const PULL_PRICE = 1000;
const R2_URL = 'https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev';

const FLAVOR_TEXTS = [
    "قدم المورا ودع النجوم ترسم لك مسارا جديدا",
    "بين يديك مفتاح الابعاد اكسر الختم لترى اي اسطورة ستستجيب",
    "النجوم تنتظر من يوقظها ادفع المورا وابدا طقوس الاستدعاء",
    "مقابل المورا قد تبتسم لك الاقدار او تدير لك ظهرها جرب حظك",
    "اكسر قيود الزمن واستحضر القوة المنسية الى قبضتك",
    "خلف هذا الختم ترقد كنوز الامبراطورية افتحه واصنع مجدك",
    "ايقظ التحف النادرة من سباتها الابدي المورا هي الثمن",
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

if (upgradeMats.weapon_materials) {
    upgradeMats.weapon_materials.forEach(race => {
        race.materials.forEach(m => {
            const raceFolder = race.race.toLowerCase().replace(' ', '_');
            const imgName = ID_TO_IMAGE[m.id] || `${m.id}.png`;
            LOOT_POOL[m.rarity].push({ ...m, type: 'material', race: race.race, imgPath: `${R2_URL}/images/materials/${raceFolder}/${imgName}` });
        });
    });
}

if (upgradeMats.skill_books) {
    upgradeMats.skill_books.forEach(cat => {
        cat.books.forEach(b => {
            const typeFolder = cat.category === 'General_Skills' ? 'general' : 'race';
            const imgName = ID_TO_IMAGE[b.id] || `${b.id}.png`;
            LOOT_POOL[b.rarity].push({ ...b, type: 'book', category: cat.category, imgPath: `${R2_URL}/images/materials/${typeFolder}/${imgName}` });
        });
    });
}

if (skillsConfig) {
    skillsConfig.forEach(s => {
        const isLegendary = s.id.startsWith('race_') || s.id === 'skill_gamble' || s.id === 'skill_dispel';
        const rarity = isLegendary ? 'Legendary' : 'Epic';
        LOOT_POOL[rarity].push({ ...s, type: 'skill', rarity: rarity, imgPath: null });
    });
}

async function ensurePityTable(db) {
    await db.query(`CREATE TABLE IF NOT EXISTS user_gacha_pity ("userID" TEXT, "guildID" TEXT, "epic_pity" INTEGER DEFAULT 0, "legendary_pity" INTEGER DEFAULT 0, "last_free_claim" TEXT DEFAULT '', PRIMARY KEY ("userID", "guildID"))`).catch(()=>{});
    try { await db.query(`ALTER TABLE user_gacha_pity ADD COLUMN "last_free_claim" TEXT DEFAULT ''`); } catch(e){}
}

function performPull(pityData, userRace, ownedSkills) {
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

    let pool = LOOT_POOL[rarity] ? [...LOOT_POOL[rarity]] : [...LOOT_POOL['Common']];

    pool = pool.filter(item => !(item.type === 'skill' && ownedSkills.includes(item.id)));
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

module.exports = {
    data: new SlashCommandBuilder().setName('صندوق').setDescription('صناديق سحرية تستدعي الارتيفاكت لتطوير عتادك'),
    name: 'صندوق',
    aliases: ['gacha', 'صناديق', 'صندوق', 'غاتشا', 'قاتشا', 'pull'],
    category: 'RPG',

    async execute(interactionOrMessage) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        const client = interactionOrMessage.client;
        const db = client.sql;
        const user = isSlash ? interactionOrMessage.user : interactionOrMessage.author;
        const guildId = interactionOrMessage.guild.id;
        const member = isSlash ? interactionOrMessage.member : interactionOrMessage.member;

        if (isSlash) await interactionOrMessage.deferReply();
        const reply = async (payload) => isSlash ? interactionOrMessage.editReply(payload) : interactionOrMessage.reply(payload);

        if (!db) return reply({ content: "خطأ في قاعدة البيانات" }).catch(()=>{});
        await ensurePityTable(db);

        let userMora = 0;
        let freeChests = 0;
        let paidChests = 0;
        let totalChests = 0;
        let pityData = { epic_pity: 0, legendary_pity: 0, last_free_claim: '' };
        let ownedSkills = [];
        let userRace = null;
        let activePageCollector = null;

        const fetchUserData = async () => {
            const [lvlRes, invRes, skillRes, wepRes] = await Promise.all([
                db.query(`SELECT "mora" FROM levels WHERE "user" = $1 AND "guild" = $2`, [user.id, guildId]).catch(() => db.query(`SELECT mora FROM levels WHERE userid = $1 AND guildid = $2`, [user.id, guildId])),
                db.query(`SELECT "itemID", "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" IN ('gacha_chest', 'free_gacha_chest')`, [user.id, guildId]).catch(()=> db.query(`SELECT itemid, quantity FROM user_inventory WHERE userid = $1 AND guildid = $2 AND itemid IN ('gacha_chest', 'free_gacha_chest')`, [user.id, guildId])),
                db.query(`SELECT "skillID" FROM user_skills WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guildId]).catch(()=> db.query(`SELECT skillid FROM user_skills WHERE userid = $1 AND guildid = $2`, [user.id, guildId])),
                db.query(`SELECT "raceName" FROM user_weapons WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guildId]).catch(()=> db.query(`SELECT racename FROM user_weapons WHERE userid = $1 AND guildid = $2`, [user.id, guildId]))
            ]);

            userMora = lvlRes?.rows[0] ? Number(lvlRes.rows[0].mora) : 0;
            freeChests = 0;
            paidChests = 0;
            if (invRes?.rows) {
                invRes.rows.forEach(r => {
                    const id = r.itemID || r.itemid;
                    const qty = Number(r.quantity || r.Quantity);
                    if (id === 'free_gacha_chest') freeChests = qty;
                    if (id === 'gacha_chest') paidChests = qty;
                });
            }
            totalChests = freeChests + paidChests;
            if (skillRes?.rows) ownedSkills = skillRes.rows.map(r => r.skillID || r.skillid);
            if (wepRes?.rows[0]) userRace = wepRes.rows[0].raceName || wepRes.rows[0].racename;
        };

        try {
            await fetchUserData();
            const pityRes = await db.query(`SELECT * FROM user_gacha_pity WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guildId]).catch(() => db.query(`SELECT * FROM user_gacha_pity WHERE userid = $1 AND guildid = $2`, [user.id, guildId]));
            if (pityRes?.rows[0]) {
                pityData.epic_pity = pityRes.rows[0].epic_pity || 0;
                pityData.legendary_pity = pityRes.rows[0].legendary_pity || 0;
                pityData.last_free_claim = pityRes.rows[0].last_free_claim || '';
            } else {
                await db.query(`INSERT INTO user_gacha_pity ("userID", "guildID", "last_free_claim") VALUES ($1, $2, '')`, [user.id, guildId]).catch(() => db.query(`INSERT INTO user_gacha_pity (userid, guildid, last_free_claim) VALUES ($1, $2, '')`, [user.id, guildId]).catch(()=>{}));
            }

            let dailyLimit = 0;
            if (member.roles.cache.has('1422160802416164885')) dailyLimit = 20;
            else if (member.roles.cache.has('1395674235002945636')) dailyLimit = 10;

            const todaySaudi = new Date().toLocaleString('en-US', { timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit' });

            if (dailyLimit > 0 && pityData.last_free_claim !== todaySaudi) {
                if (freeChests === 0) {
                    freeChests = dailyLimit;
                    totalChests = freeChests + paidChests;
                    
                    let checkFreeRes = await db.query(`SELECT "id" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = 'free_gacha_chest'`, [user.id, guildId]).catch(()=> db.query(`SELECT id FROM user_inventory WHERE userid = $1 AND guildid = $2 AND itemid = 'free_gacha_chest'`, [user.id, guildId]));
                    if (checkFreeRes?.rows?.[0]) {
                        await db.query(`UPDATE user_inventory SET "quantity" = $1 WHERE "id" = $2`, [freeChests, checkFreeRes.rows[0].id]).catch(()=> db.query(`UPDATE user_inventory SET quantity = $1 WHERE id = $2`, [freeChests, checkFreeRes.rows[0].id || checkFreeRes.rows[0].ID]));
                    } else {
                        await db.query(`INSERT INTO user_inventory ("guildID", "userID", "itemID", "quantity") VALUES ($1, $2, 'free_gacha_chest', $3)`, [guildId, user.id, freeChests]).catch(()=> db.query(`INSERT INTO user_inventory (guildid, userid, itemid, quantity) VALUES ($1, $2, 'free_gacha_chest', $3)`, [guildId, user.id, freeChests]));
                    }
                    
                    await db.query(`UPDATE user_gacha_pity SET "last_free_claim" = $1 WHERE "userID" = $2 AND "guildID" = $3`, [todaySaudi, user.id, guildId]).catch(()=> db.query(`UPDATE user_gacha_pity SET last_free_claim = $1 WHERE userid = $2 AND guildid = $3`, [todaySaudi, user.id, guildId]));
                    pityData.last_free_claim = todaySaudi;

                    (isSlash ? interactionOrMessage.channel : interactionOrMessage.channel).send({ content: `🎁 <@${user.id}> **مكافأة يومية!** لقد استلمت **${dailyLimit}** صناديق مجانية.` }).catch(()=>{});
                }
            }
        } catch (e) { console.error(e); }

        const getPullButtons = (moraBalance) => {
            return new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('gacha_1').setLabel('سحب x1').setEmoji('🎁').setStyle(ButtonStyle.Primary).setDisabled(moraBalance < PULL_PRICE),
                new ButtonBuilder().setCustomId('gacha_10').setLabel('سحب x10').setEmoji('🌟').setStyle(ButtonStyle.Success).setDisabled(moraBalance < PULL_PRICE * 10),
                new ButtonBuilder().setCustomId('gacha_inventory').setLabel('صناديقي').setEmoji('🎒').setStyle(ButtonStyle.Secondary)
            );
        };

        const getReturnButton = () => {
            return new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('gacha_return_hub').setLabel('الرئيسية').setEmoji('↩️').setStyle(ButtonStyle.Secondary)
            );
        };

        const generateAndSendHub = async (targetMsg) => {
            await fetchUserData();
            const summaryRandomText = FLAVOR_TEXTS[Math.floor(Math.random() * FLAVOR_TEXTS.length)];
            let files = [];
            if (generateGachaHub) {
                try {
                    const hubBuffer = await generateGachaHub(user, userMora, summaryRandomText, totalChests);
                    if (hubBuffer) files.push(new AttachmentBuilder(hubBuffer, { name: 'gacha_hub.png' }));
                } catch(e){}
            }
            if (targetMsg) {
                await targetMsg.edit({ components: [getPullButtons(userMora)], files, embeds: [] }).catch(()=>{});
            } else {
                return { components: [getPullButtons(userMora)], files };
            }
        };

        const showInventoryMenu = async (targetMsg) => {
            await fetchUserData();
            let files = [];
            
            if (global.generateGachaInventory || (typeof require !== 'undefined')) {
                try {
                    const { generateGachaInventory } = require('../../generators/gacha-generator.js');
                    if (generateGachaInventory) {
                        const invBuffer = await generateGachaInventory(user, freeChests, paidChests);
                        if (invBuffer) files.push(new AttachmentBuilder(invBuffer, { name: 'gacha_inventory.png' }));
                    }
                } catch(e){}
            }

            const row = new ActionRowBuilder();
            
            if (totalChests >= 1) {
                row.addComponents(new ButtonBuilder().setCustomId('open_chest_1').setLabel('فتح 1').setEmoji('🎁').setStyle(ButtonStyle.Primary));
            }
            if (totalChests >= 10) {
                row.addComponents(new ButtonBuilder().setCustomId('open_chest_10').setLabel('فتح 10').setEmoji('🌟').setStyle(ButtonStyle.Success));
            }
            if (totalChests > 1) {
                row.addComponents(new ButtonBuilder().setCustomId('open_chest_all').setLabel('فتح الكل').setEmoji('🔥').setStyle(ButtonStyle.Danger));
            }
            
            row.addComponents(new ButtonBuilder().setCustomId('gacha_return_hub').setLabel('رجوع').setEmoji('↩️').setStyle(ButtonStyle.Secondary));
            
            await targetMsg.edit({ embeds: [], components: [row], files }).catch(()=>{});
        };

        // 🔥 نظام التسريع الصاروخي للـ PULLS (التجميع والتنفيذ دفعة واحدة) 🔥
        const executePulls = async (pullCount, isBuying, cost) => {
            if (isBuying) {
                userMora -= cost;
                await db.query(`UPDATE levels SET "mora" = "mora" - $1 WHERE "user" = $2 AND "guild" = $3`, [cost, user.id, guildId]).catch(() => db.query(`UPDATE levels SET mora = mora - $1 WHERE userid = $2 AND guildid = $3`, [cost, user.id, guildId]).catch(()=>{}));
            } else {
                let remaining = pullCount;
                let consumeFree = Math.min(freeChests, remaining);
                remaining -= consumeFree;
                let consumePaid = Math.min(paidChests, remaining);
                
                if (consumeFree > 0) {
                    await db.query(`UPDATE user_inventory SET "quantity" = "quantity" - $1 WHERE "userID" = $2 AND "guildID" = $3 AND "itemID" = 'free_gacha_chest'`, [consumeFree, user.id, guildId]).catch(() => db.query(`UPDATE user_inventory SET quantity = quantity - $1 WHERE userid = $2 AND guildid = $3 AND itemid = 'free_gacha_chest'`, [consumeFree, user.id, guildId]).catch(()=>{}));
                }
                if (consumePaid > 0) {
                    await db.query(`UPDATE user_inventory SET "quantity" = "quantity" - $1 WHERE "userID" = $2 AND "guildID" = $3 AND "itemID" = 'gacha_chest'`, [consumePaid, user.id, guildId]).catch(() => db.query(`UPDATE user_inventory SET quantity = quantity - $1 WHERE userid = $2 AND guildid = $3 AND itemid = 'gacha_chest'`, [consumePaid, user.id, guildId]).catch(()=>{}));
                }
                
                freeChests -= consumeFree;
                paidChests -= consumePaid;
                totalChests = freeChests + paidChests;
            }

            const results = [];
            let highestRarityVal = 0;
            const rarityOrder = { Common: 0, Uncommon: 1, Rare: 2, Epic: 3, Legendary: 4 };
            let bestResult = null;

            // متغيرات التجميع
            const itemsToAdd = {};
            const skillsToAdd = [];

            await db.query('BEGIN').catch(()=>{});
            
            for (let k = 0; k < pullCount; k++) {
                const { item, rarity } = performPull(pityData, userRace, ownedSkills);
                
                if (rarityOrder[rarity] > highestRarityVal) {
                    highestRarityVal = rarityOrder[rarity];
                    bestResult = { item, rarity };
                }

                if (item.type === 'skill') {
                    ownedSkills.push(item.id);
                    skillsToAdd.push(item.id);
                } else {
                    if (!itemsToAdd[item.id]) itemsToAdd[item.id] = 0;
                    itemsToAdd[item.id]++;
                }
                results.push({ item, rarity });
            }

            // تنفيذ التحديثات بقاعدة البيانات بشكل متوازي (Parallel) لسرعة البرق!
            const dbPromises = [];

            for (const skillId of skillsToAdd) {
                dbPromises.push(db.query(`INSERT INTO user_skills ("userID", "guildID", "skillID", "skillLevel") VALUES ($1, $2, $3, 1)`, [user.id, guildId, skillId]).catch(() => db.query(`INSERT INTO user_skills (userid, guildid, skillid, skilllevel) VALUES ($1, $2, $3, 1)`, [user.id, guildId, skillId]).catch(()=>{})));
            }

            for (const [itemId, qty] of Object.entries(itemsToAdd)) {
                dbPromises.push((async () => {
                    let existingItemRes = await db.query(`SELECT "id" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [user.id, guildId, itemId]).catch(()=> db.query(`SELECT id FROM user_inventory WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [user.id, guildId, itemId]).catch(()=>({rows:[]})));
                    if (existingItemRes?.rows?.[0]) {
                        await db.query(`UPDATE user_inventory SET "quantity" = "quantity" + $1 WHERE "id" = $2`, [qty, existingItemRes.rows[0].id]).catch(()=> db.query(`UPDATE user_inventory SET quantity = quantity + $1 WHERE id = $2`, [qty, existingItemRes.rows[0].id || existingItemRes.rows[0].ID]).catch(()=>{}));
                    } else {
                        await db.query(`INSERT INTO user_inventory ("guildID", "userID", "itemID", "quantity") VALUES ($1, $2, $3, $4)`, [guildId, user.id, itemId, qty]).catch(()=> db.query(`INSERT INTO user_inventory (guildid, userid, itemid, quantity) VALUES ($1, $2, $3, $4)`, [guildId, user.id, itemId, qty]).catch(()=>{}));
                    }
                })());
            }

            await Promise.all(dbPromises);
            await db.query(`UPDATE user_gacha_pity SET "epic_pity" = $1, "legendary_pity" = $2 WHERE "userID" = $3 AND "guildID" = $4`, [pityData.epic_pity, pityData.legendary_pity, user.id, guildId]).catch(()=>{});
            await db.query('COMMIT').catch(()=>{});

            return { bestResult, results };
        };

        const initialPayload = await generateAndSendHub();
        const initialMsg = await reply(initialPayload).catch(()=>{});
        if (!initialMsg) return;
        
        const channelCollector = (isSlash ? interactionOrMessage.channel : interactionOrMessage.channel).createMessageComponentCollector({
            filter: i => i.user.id === user.id && ['gacha_1', 'gacha_10', 'gacha_inventory', 'gacha_return_hub', 'open_chest_1', 'open_chest_10', 'open_chest_all'].includes(i.customId),
            time: 300000 
        });

        channelCollector.on('collect', async (i) => {
            try { await i.deferUpdate(); } catch (err) { return; }

            if (i.customId === 'gacha_inventory') {
                await showInventoryMenu(initialMsg);
                return;
            }

            if (i.customId === 'gacha_return_hub') {
                if (activePageCollector) {
                    activePageCollector.stop('return_hub');
                    activePageCollector = null;
                }
                await generateAndSendHub(initialMsg);
                return;
            }

            await fetchUserData();
            
            let isBuying = i.customId.startsWith('gacha_');
            let pullCount = 1;
            let cost = 0;

            if (isBuying) {
                pullCount = i.customId === 'gacha_10' ? 10 : 1;
                cost = pullCount * PULL_PRICE;
                if (userMora < cost) return i.followUp({ content: "❌ لا تملك المورا الكافية", flags: [MessageFlags.Ephemeral] }).catch(()=>{});
            } else {
                if (i.customId === 'open_chest_10') pullCount = 10;
                else if (i.customId === 'open_chest_all') pullCount = Math.min(totalChests, 50); 
                if (totalChests < pullCount) return i.followUp({ content: "❌ لا تملك صناديق كافية", flags: [MessageFlags.Ephemeral] }).catch(()=>{});
            }

            await initialMsg.edit({ components: [], embeds: [] }).catch(()=>{});

            const { bestResult, results } = await executePulls(pullCount, isBuying, cost);

            const prefix = pullCount > 1 ? 'ten_' : 'single_';
            const meteorFileName = `${prefix}${bestResult.rarity}.png`;
            const meteorUrl = `${R2_URL}/images/gacha/${meteorFileName}`;
            let meteorFiles = [new AttachmentBuilder(meteorUrl, { name: meteorFileName })];
            
            await initialMsg.edit({ files: meteorFiles, components: [], embeds: [] }).catch(()=>{});
            
            // 🔥 تقليل وقت الانتظار لزيادة الحماس والسرعة (700 ملي ثانية فقط بدلاً من 1200) 🔥
            await new Promise(r => setTimeout(r, 700));

            if (pullCount > 10) {
                let files = [];
                if (generateGachaCard && bestResult.item.imgPath) {
                    try {
                        const buffer = await generateGachaCard(bestResult.item, bestResult.rarity);
                        if (buffer) files.push(new AttachmentBuilder(buffer, { name: `gacha_best.png` }));
                    } catch(e){}
                }
                
                const summaryEmbed = new EmbedBuilder()
                    .setTitle(`📦 تم فتح ${pullCount} صندوق`)
                    .setColor(Colors.Green)
                    .setDescription(`**أفضل عنصر حصلت عليه:**\n✨ ${bestResult.item.emoji} ${bestResult.item.name} (${bestResult.rarity})\n\n> تم إضافة جميع العناصر المتبقية إلى حقيبتك بنجاح.`);

                await initialMsg.edit({ embeds: [summaryEmbed], files, components: [getReturnButton()] }).catch(()=>{});

            } else if (pullCount > 1) {
                let currentIndex = 0;
                const getPagePayload = async (idx) => {
                    const res = results[idx];
                    let files = [];
                    if (generateGachaCard && res.item.imgPath) {
                        try {
                            const buffer = await generateGachaCard(res.item, res.rarity);
                            if (buffer) files.push(new AttachmentBuilder(buffer, { name: `gacha_${idx}.png` }));
                        } catch(e){}
                    }

                    const row = new ActionRowBuilder();
                    if (idx < pullCount - 1) {
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
                    return { components: [row], files };
                };

                await initialMsg.edit(await getPagePayload(0)).catch(()=>{});

                activePageCollector = initialMsg.createMessageComponentCollector({
                    filter: btn => btn.user.id === user.id && ['gacha_next', 'gacha_skip'].includes(btn.customId),
                    time: 120000 
                });

                activePageCollector.on('collect', async btn => {
                    try { await btn.deferUpdate(); } catch(e) { return; }
                    
                    if (btn.customId === 'gacha_skip') {
                        currentIndex = pullCount - 1; 
                        await initialMsg.edit(await getPagePayload(currentIndex)).catch(()=>{});
                    } else if (btn.customId === 'gacha_next') {
                        currentIndex++;
                        await initialMsg.edit(await getPagePayload(currentIndex)).catch(()=>{});
                    }
                });

            } else {
                let files = [];
                if (generateGachaCard && bestResult && bestResult.item.imgPath) {
                    try {
                        const buffer = await generateGachaCard(bestResult.item, bestResult.rarity);
                        if (buffer) files.push(new AttachmentBuilder(buffer, { name: 'gacha_best.png' }));
                    } catch(e){}
                }
                await initialMsg.edit({ components: [getReturnButton()], files }).catch(()=>{});
            }
        });
    }
};
