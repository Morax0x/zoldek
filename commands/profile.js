const { EmbedBuilder, SlashCommandBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, UserSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require("discord.js");
const { calculateBuffMultiplier, calculateMoraBuff } = require("../streak-handler.js");
const { getUserRace, getWeaponData, cleanDisplayName } = require('../handlers/pvp-core.js'); 
const { generateAdventurerCard } = require('../generators/adventurer-card-generator.js');

let generateInventoryCard, generateMainHub, generateItemDetailsCard, generateSkillsCard, generatePortfolioCard;
try {
    ({ generateInventoryCard, generateMainHub, generateItemDetailsCard, generatePortfolioCard } = require('../generators/inventory-generator.js'));
    ({ generateSkillsCard } = require('../generators/skills-card-generator.js'));
} catch (e) {
    generateInventoryCard = null; generateMainHub = null; generateItemDetailsCard = null; generateSkillsCard = null; generatePortfolioCard = null;
}

const weaponsConfig = require('../json/weapons-config.json');
const skillsConfig = require('../json/skills-config.json');

let marketConfig = [];
try { marketConfig = require('../json/market-items.json'); } catch(e) {}

let validBaitIDs = ['worm', 'cricket', 'shrimp', 'squid', 'magic'];
try {
    const fishingConf = require('../json/fishing-config.json');
    if (fishingConf.baits) validBaitIDs = fishingConf.baits.map(b => b.id);
} catch(e) {}

let calculateRequiredXP;
try { ({ calculateRequiredXP } = require('../handlers/handler-utils.js')); } 
catch (e) {
    calculateRequiredXP = function(lvl) {
        if (lvl < 35) return 5 * (lvl ** 2) + (50 * lvl) + 100;
        return 15 * (lvl ** 2) + (150 * lvl);
    };
}

const TARGET_OWNER_ID = "1145327691772481577";
const PROFILE_BASE_HP = 100;
const PROFILE_HP_PER_LEVEL = 4;
const ITEMS_PER_PAGE = 15;
const SKILLS_PER_PAGE = 3;
const MAX_INVENTORY_LIMIT = 999; 

const RACE_TRANSLATIONS = new Map([
    ['Human', 'بشري'], ['Dragon', 'تنين'], ['Elf', 'آلف'], ['Dark Elf', 'آلف الظلام'],
    ['Seraphim', 'سيرافيم'], ['Demon', 'شيطان'], ['Vampire', 'مصاص دماء'],
    ['Spirit', 'روح'], ['Dwarf', 'قزم'], ['Ghoul', 'غول'], ['Hybrid', 'نصف وحش']
]);

let resolveItemInfoLocal;
try {
    const invGen = require('../generators/inventory-generator.js');
    resolveItemInfoLocal = invGen.resolveItemInfo;
} catch (e) {
    resolveItemInfoLocal = function(itemId) {
        return { name: itemId, emoji: '📦', category: 'أخرى', rarity: 'Common', imgPath: null, description: "تعذر قراءة التفاصيل" };
    };
}

// 🔥 دالة لتسريع قواعد البيانات 🔥
const safeQuery = async (db, qPg, qLite, params) => {
    try { return await db.query(qPg, params); } 
    catch(e) { return await db.query(qLite, params).catch(()=>({rows:[]})); }
};

// 🔥 فحص ذكي لمعرفة إذا العنصر قابل للصهر والدمج 🔥
const upgradeMats = require('../json/upgrade-materials.json');
function isSmeltable(itemId) {
    if (!itemId) return false;
    for (const r of upgradeMats.weapon_materials) {
        if (r.materials.find(m => m.id === itemId)) return true;
    }
    for (const c of upgradeMats.skill_books) {
        if (c.books.find(b => b.id === itemId)) return true;
    }
    return false;
}

function getRepRankInfo(points) {
    if (points >= 1000) return { name: '👑 رتبة SS', color: '#FF0055' }; 
    if (points >= 500)  return { name: '💎 رتبة S', color: '#9D00FF' }; 
    if (points >= 250)  return { name: '🥇 رتبة A', color: '#FFD700' }; 
    if (points >= 100)  return { name: '🥈 رتبة B', color: '#00FF88' }; 
    if (points >= 50)   return { name: '🥉 رتبة C', color: '#00BFFF' }; 
    if (points >= 25)   return { name: '⚔️ رتبة D', color: '#A9A9A9' }; 
    if (points >= 10)   return { name: '🛡️ رتبة E', color: '#B87333' }; 
    return { name: '🪵 رتبة F', color: '#654321' }; 
}

async function calculateStrongestRank(db, guildID, targetUserID) {
    try {
        if (targetUserID === TARGET_OWNER_ID) return 0;
        let wRes = await safeQuery(db, `SELECT "userID", "raceName", "weaponLevel" FROM user_weapons WHERE "guildID" = $1 AND "userID" != $2`, `SELECT userid as "userID", racename as "raceName", weaponlevel as "weaponLevel" FROM user_weapons WHERE guildid = $1 AND userid != $2`, [guildID, TARGET_OWNER_ID]);
        const weapons = wRes?.rows || [];
        
        let lvlRes = await safeQuery(db, `SELECT "user" as "userID", "level" FROM levels WHERE "guild" = $1`, `SELECT userid as "userID", level FROM levels WHERE guildid = $1`, [guildID]);
        const levelsMap = new Map((lvlRes?.rows || []).map(r => [r.userID, r.level]));
        
        let skillRes = await safeQuery(db, `SELECT "userID", SUM("skillLevel") as "totalLevels" FROM user_skills WHERE "guildID" = $1 GROUP BY "userID"`, `SELECT userid as "userID", SUM(skilllevel) as "totalLevels" FROM user_skills WHERE guildid = $1 GROUP BY userid`, [guildID]);
        const skillsMap = new Map((skillRes?.rows || []).map(r => [r.userID, parseInt(r.totalLevels) || 0]));
        
        let stats = [];
        for (const w of weapons) {
            const conf = weaponsConfig.find(c => c.race === (w.raceName || w.racename));
            if(!conf) continue;
            const wLvl = w.weaponLevel || w.weaponlevel || 1;
            const dmg = conf.base_damage + (conf.damage_increment * (wLvl - 1));
            const playerLevel = levelsMap.get(w.userID) || 1;
            const hp = PROFILE_BASE_HP + (playerLevel * PROFILE_HP_PER_LEVEL);
            const skillLevelsTotal = skillsMap.get(w.userID) || 0;
            const powerScore = Math.floor(dmg + (hp * 0.5) + (playerLevel * 10) + (skillLevelsTotal * 20));
            stats.push({ userID: w.userID, powerScore });
        }
        stats.sort((a, b) => b.powerScore - a.powerScore);
        const index = stats.findIndex(s => s.userID === targetUserID);
        return index !== -1 ? index + 1 : stats.length + 1; 
    } catch (e) { return 1; }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('بروفايل')
        .setDescription('المركز الرئيسي لبياناتك وممتلكاتك.')
        .addUserOption(option => option.setName('user').setDescription('عرض بيانات مستخدم آخر').setRequired(false)),

    name: 'profile',
    aliases: ['p', 'بروفايل', 'بطاقة', 'كارد', 'card', 'inv', 'inventory', 'شنطة', 'اغراض', 'حقيبة', 'مهاراتي', 'skills', 'ms', 'عتاد', 'قدراتي', 'محفظتي', 'استثماراتي', 'ممتلكات', 'portfolio'], 
    category: "Economy", 

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, guild, client, authorUser, targetMember; 

        if (isSlash) {
            interaction = interactionOrMessage; guild = interaction.guild; client = interaction.client;
            authorUser = interaction.user; targetMember = interaction.options.getMember('user') || interaction.member;
            await interaction.deferReply();
        } else {
            message = interactionOrMessage; guild = message.guild; client = message.client;
            authorUser = message.author; targetMember = message.mentions.members.first() || message.guild.members.cache.get(args[0]) || message.member;
        }

        const reply = async (payload) => {
            if (isSlash) return interaction.editReply(payload);
            else return message.channel.send(payload);
        };

        if (!targetMember || targetMember.user.bot) return reply({ content: "❌ لا يمكن عرض بيانات هذا العضو." });

        try {
            const db = client.sql; 
            const targetUser = targetMember.user; 
            const guildId = guild.id;
            const cleanName = cleanDisplayName(targetMember.displayName || targetUser.username);

            let currentView = 'profile'; 
            let invCategory = 'موارد'; 
            let invPage = 1; 
            let skillPage = 0;
            let selectedIndex = 0; 
            let activeItemDetails = null; 

            let commandTrigger = "";
            if (!isSlash) {
                const firstWord = interactionOrMessage.content.trim().split(/ +/)[0].toLowerCase();
                commandTrigger = firstWord.replace(/^[^\w\s\u0600-\u06FF]/, ''); 
            }

            if (['inv', 'inventory', 'شنطة', 'اغراض', 'حقيبة'].includes(commandTrigger)) {
                currentView = 'inventory'; invCategory = 'main';
            } else if (['مهاراتي', 'skills', 'ms', 'عتاد', 'قدراتي'].includes(commandTrigger)) {
                currentView = 'combat';
            } else if (['محفظتي', 'استثماراتي', 'ممتلكات', 'portfolio'].includes(commandTrigger)) {
                currentView = 'inventory'; 
                invCategory = 'market';
            }

            const getNormalInventoryItems = async (cat) => {
                let fetchedItems = [];
                try {
                    const invQuery = await safeQuery(db, `SELECT * FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2`, `SELECT * FROM user_inventory WHERE userid = $1 AND guildid = $2`, [targetUser.id, guildId]);
                    let tempItems = (invQuery?.rows || []).map(row => {
                        const itemId = row.itemID || row.itemid;
                        if (itemId === 'gacha_chest' || itemId === 'free_gacha_chest') return null;

                        let info = resolveItemInfoLocal(itemId);
                        info = { ...info }; 
                        
                        if (itemId.startsWith('fish_')) info.category = 'موارد';
                        else {
                            if (info.category === 'materials') info.category = 'موارد';
                            else if (info.category === 'fishing' || info.category === 'fishing_gear') info.category = 'صيد';
                            else if (info.category === 'farming') info.category = 'مزرعة';
                            else if (info.category === 'potions' || info.category === 'others') info.category = 'أخرى';
                        }

                        if (info.category === 'صيد') {
                            const isBait = validBaitIDs.includes(itemId);
                            const isRod = itemId.startsWith('rod_') || itemId === 'current_rod';
                            const isBoat = itemId.startsWith('boat_') || itemId === 'current_boat';
                            if (!isBait && !isRod && !isBoat) info.category = 'أخرى'; 
                        }

                        return { ...info, quantity: row.quantity, id: itemId };
                    }).filter(item => item !== null); 

                    if (cat === 'صيد') {
                        let fishRes = await safeQuery(db, `SELECT * FROM user_fishing WHERE "userID" = $1 AND "guildID" = $2 LIMIT 1`, `SELECT * FROM user_fishing WHERE userid = $1 AND guildid = $2 LIMIT 1`, [targetUser.id, guildId]);
                        const fishingStats = fishRes?.rows?.[0];
                        if (fishingStats) {
                            const cRod = fishingStats.currentRod || fishingStats.currentrod;
                            const cBoat = fishingStats.currentBoat || fishingStats.currentboat;
                            
                            if (cRod) tempItems.unshift({ id: 'current_rod', name: `سنارة ${cRod}`, emoji: '🎣', category: 'صيد', rarity: 'Rare', quantity: 1, imgPath: `https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev/images/fish/fishing/${cRod.toLowerCase()}.png` });
                            if (cBoat) tempItems.unshift({ id: 'current_boat', name: `قارب ${cBoat}`, emoji: '🚤', category: 'صيد', rarity: 'Epic', quantity: 1, imgPath: `https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev/images/fish/ships/${cBoat.toLowerCase()}.png` });
                        }
                    }
                    fetchedItems = tempItems.filter(it => it.category === cat);
                } catch(e) { console.error(e); }
                return fetchedItems;
            };

            const renderView = async () => {
                const [lvlRes, repRes, raceRes, wpnRes, streakRes] = await Promise.all([
                    safeQuery(db, `SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2`, `SELECT * FROM levels WHERE userid = $1 AND guildid = $2`, [targetUser.id, guildId]),
                    safeQuery(db, `SELECT "rep_points" FROM user_reputation WHERE "userID" = $1 AND "guildID" = $2`, `SELECT rep_points FROM user_reputation WHERE userid = $1 AND guildid = $2`, [targetUser.id, guildId]),
                    getUserRace(targetMember, db).catch(()=>null),
                    getWeaponData(db, targetMember).catch(()=>null),
                    safeQuery(db, `SELECT * FROM streaks WHERE "guildID" = $1 AND "userID" = $2`, `SELECT * FROM streaks WHERE guildid = $1 AND userid = $2`, [guildId, targetUser.id])
                ]);

                const levelData = lvlRes?.rows?.[0] || { xp: 0, level: 1, mora: 0, bank: 0, totalXP: 0 };
                const totalMora = Number(levelData.mora || 0) + Number(levelData.bank || 0);
                const repPoints = repRes?.rows?.[0]?.rep_points || 0;
                const rankInfo = getRepRankInfo(repPoints);

                const raceNameRaw = raceRes?.raceName || null;
                const arabicRaceName = RACE_TRANSLATIONS.get(raceNameRaw) || raceNameRaw || "بشري";
                const weaponName = wpnRes ? wpnRes.name : "بدون سلاح";
                const streakData = streakRes?.rows?.[0] || {};

                if (currentView === 'profile') {
                    let xpBuff = 1, moraBuff = 1;
                    try { xpBuff = await calculateBuffMultiplier(targetMember, db); } catch(e) {}
                    try { moraBuff = await calculateMoraBuff(targetMember, db); } catch(e) {}
                    
                    let ranks = { level: "0", mora: "0", streak: "0", power: "0" };
                    if (targetUser.id !== TARGET_OWNER_ID) {
                        try {
                            const [lvlR, moraR, strkR] = await Promise.all([
                                safeQuery(db, `SELECT COUNT(*) + 1 as rank FROM levels WHERE "guild" = $1 AND "totalXP" > $2`, `SELECT COUNT(*) + 1 as rank FROM levels WHERE guildid = $1 AND totalxp > $2`, [guildId, levelData.totalXP || levelData.totalxp || 0]),
                                safeQuery(db, `SELECT COUNT(*) + 1 as rank FROM levels WHERE "guild" = $1 AND "mora" > $2`, `SELECT COUNT(*) + 1 as rank FROM levels WHERE guildid = $1 AND mora > $2`, [guildId, totalMora]),
                                safeQuery(db, `SELECT COUNT(*) + 1 as rank FROM streaks WHERE "guildID" = $1 AND "streakCount" > $2`, `SELECT COUNT(*) + 1 as rank FROM streaks WHERE guildid = $1 AND streakcount > $2`, [guildId, streakData.streakCount || streakData.streakcount || 0])
                            ]);
                            ranks.level = (lvlR?.rows?.[0]?.rank || 1).toString();
                            ranks.mora = (moraR?.rows?.[0]?.rank || 1).toString();
                            ranks.streak = (strkR?.rows?.[0]?.rank || 1).toString();
                            ranks.power = (await calculateStrongestRank(db, guildId, targetUser.id)).toString();
                        } catch (e) { console.error("Ranks fetch error", e); }
                    }

                    const profData = {
                        user: targetUser, displayName: cleanName, rankInfo, repPoints,
                        level: levelData.level, currentXP: Number(levelData.xp), requiredXP: calculateRequiredXP(levelData.level),
                        mora: (targetUser.id === TARGET_OWNER_ID && authorUser.id !== TARGET_OWNER_ID) ? "???" : totalMora.toLocaleString(),
                        raceName: arabicRaceName, weaponName, weaponDmg: wpnRes?.currentDamage || 0,
                        maxHp: PROFILE_BASE_HP + (levelData.level * PROFILE_HP_PER_LEVEL), streakCount: streakData.streakCount || streakData.streakcount || 0,
                        xpBuff: Math.floor((xpBuff - 1) * 100), moraBuff: Math.floor((moraBuff - 1) * 100),
                        shields: Number(streakData.hasItemShield || 0) + (streakData.hasGracePeriod === 1 ? 1 : 0), ranks
                    };

                    const buffer = await generateAdventurerCard(profData);
                    const nav = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId(`v_inv_${authorUser.id}`).setLabel('حـقـيـبـة').setStyle(ButtonStyle.Primary).setEmoji('💎'),
                        new ButtonBuilder().setCustomId(`v_com_${authorUser.id}`).setLabel('عـتـاد').setStyle(ButtonStyle.Primary).setEmoji('⚔️')
                    );
                    return { content: '', files: [new AttachmentBuilder(buffer, { name: 'p.png' })], components: [nav] };
                }

                if (currentView === 'combat') {
                    let allSkills = [];
                    try {
                        const skillRes = await safeQuery(db, `SELECT * FROM user_skills WHERE "userID" = $1 AND "guildID" = $2 AND "skillLevel" > 0`, `SELECT * FROM user_skills WHERE userid = $1 AND guildid = $2 AND skilllevel > 0`, [targetUser.id, guildId]);
                        allSkills = (skillRes?.rows || []).map(s => {
                            const conf = skillsConfig.find(sc => sc.id === (s.skillID || s.skillid));
                            return conf ? { id: conf.id, name: conf.name, level: s.skillLevel, description: conf.description } : null;
                        }).filter(s => s !== null);
                        allSkills.sort((a,b) => b.level - a.level);
                    } catch(e) {}

                    const totalSkillPages = Math.max(1, Math.ceil(allSkills.length / SKILLS_PER_PAGE));
                    const slice = allSkills.slice(skillPage * SKILLS_PER_PAGE, (skillPage + 1) * SKILLS_PER_PAGE);

                    const cardData = {
                        user: targetUser, avatarUrl: targetUser.displayAvatarURL({ extension: 'png', size: 256 }),
                        cleanName, weaponData: wpnRes, raceName: arabicRaceName, skillsList: slice,
                        totalSpent: 0, userLevel: levelData.level, currentPage: skillPage, totalPages: totalSkillPages
                    };
                    const buffer = await generateSkillsCard(cardData);
                    
                    const nav = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId(`sk_p_${authorUser.id}`).setEmoji('<:left:1439164494759723029>').setStyle(ButtonStyle.Secondary).setDisabled(skillPage === 0),
                        new ButtonBuilder().setCustomId(`sk_n_${authorUser.id}`).setEmoji('<:right:1439164491072929915>').setStyle(ButtonStyle.Secondary).setDisabled(skillPage >= totalSkillPages - 1),
                        new ButtonBuilder().setCustomId(`v_pro_${authorUser.id}`).setLabel('العـودة').setStyle(ButtonStyle.Danger)
                    );
                    return { content: '', files: [new AttachmentBuilder(buffer, { name: 's.png' })], components: [nav] };
                }

                if (currentView === 'inventory') {
                    if (invCategory === 'main') {
                        const displayMora = (targetUser.id === TARGET_OWNER_ID && authorUser.id !== TARGET_OWNER_ID) ? "???" : totalMora.toLocaleString();
                        const buffer = await generateMainHub(targetMember, db, displayMora);
                        
                        const row1 = new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId(`c_mat_${authorUser.id}`).setLabel('مـوارد').setStyle(ButtonStyle.Primary).setEmoji('💎'), 
                            new ButtonBuilder().setCustomId(`c_fis_${authorUser.id}`).setLabel('صـيد').setStyle(ButtonStyle.Secondary).setEmoji('🎣'), 
                            new ButtonBuilder().setCustomId(`c_far_${authorUser.id}`).setLabel('مـزرعـة').setStyle(ButtonStyle.Success).setEmoji('🌾') 
                        );
                        
                        const row2 = new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId(`v_port_${authorUser.id}`).setLabel('ممـتـلكـات').setStyle(ButtonStyle.Primary).setEmoji('💼'), 
                            new ButtonBuilder().setCustomId(`c_oth_${authorUser.id}`).setLabel('اخـرى').setStyle(ButtonStyle.Secondary).setEmoji('📦'), 
                            new ButtonBuilder().setCustomId(`v_pro_${authorUser.id}`).setStyle(ButtonStyle.Danger).setEmoji('↩️') 
                        );

                        return { content: '', files: [new AttachmentBuilder(buffer, { name: 'h.png' })], components: [row1, row2] };
                    }

                    if (activeItemDetails) {
                        if (!generateItemDetailsCard) return { content: "❌ لا يمكن رسم صفحة العنصر حالياً.", components: [] };
                        
                        const buffer = await generateItemDetailsCard(cleanName, activeItemDetails);
                        const btnRow = new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId(`d_back_${authorUser.id}`).setLabel('العـودة').setStyle(ButtonStyle.Secondary).setEmoji('↩️')
                        );
                        
                        if (targetUser.id === authorUser.id && !['current_rod', 'current_boat'].includes(activeItemDetails.id)) {
                            btnRow.addComponents(new ButtonBuilder().setCustomId(`trade_init_${authorUser.id}`).setLabel('إعـطـاء').setStyle(ButtonStyle.Primary).setEmoji('🎁'));
                            
                            // 🔥 الأزرار الذكية للصهر والدمج 🔥
                            if (isSmeltable(activeItemDetails.id)) {
                                btnRow.addComponents(new ButtonBuilder().setCustomId(`route_smelt_${activeItemDetails.id}`).setLabel('صـهـر').setStyle(ButtonStyle.Danger).setEmoji('🌋'));
                                
                                if (activeItemDetails.quantity >= 4) {
                                    btnRow.addComponents(new ButtonBuilder().setCustomId(`route_synth_${activeItemDetails.id}`).setLabel('دمـج').setStyle(ButtonStyle.Success).setEmoji('⚗️'));
                                }
                            }
                        }

                        return { content: '', files: [new AttachmentBuilder(buffer, { name: 'item.png' })], components: [btnRow] };
                    }

                    let items = [];
                    let totalValue = 0;

                    if (invCategory === 'market') {
                        let portfolio = [];
                        let dbMarketRes = { rows: [] };
                        try {
                            const [portRes, marketRes] = await Promise.all([
                                safeQuery(db, `SELECT * FROM user_portfolio WHERE "guildID" = $1 AND "userID" = $2`, `SELECT * FROM user_portfolio WHERE guildid = $1 AND userid = $2`, [guildId, targetUser.id]),
                                db.query("SELECT * FROM market_items").catch(()=>({rows:[]}))
                            ]);
                            portfolio = portRes?.rows || [];
                            dbMarketRes = marketRes || { rows: [] };
                        } catch(e) {}

                        const market = new Map(marketConfig.map(item => [item.id, item]));
                        let dbMarketPrices = new Map((dbMarketRes?.rows || []).map(row => [row.id, Number(row.currentPrice || row.currentprice)]));

                        for (const row of portfolio) {
                            const itemID = row.itemID || row.itemid;
                            const marketItem = market.get(itemID);
                            if (!marketItem) continue;

                            let currentPrice = dbMarketPrices.has(itemID) ? dbMarketPrices.get(itemID) : marketItem.price;
                            const quantity = Number(row.quantity) || 0;
                            if (quantity <= 0) continue;

                            const itemTotalValue = currentPrice * quantity;
                            totalValue += itemTotalValue;

                            let purchasePrice = Number(row.purchasePrice || row.purchaseprice) || 0;
                            const info = resolveItemInfoLocal(itemID);
                            
                            info.description = `${info.description || ''}\n\n📊 السعر الحالي: ${currentPrice.toLocaleString()} 🪙\n💰 سعر الشراء: ${purchasePrice.toLocaleString()} 🪙\n💎 القيمة الإجمالية: ${(currentPrice * quantity).toLocaleString()} 🪙`;
                            items.push({ ...info, name: marketItem.name, quantity, id: itemID, purchasePrice, currentPrice, itemTotalValue });
                        }

                        const totalPages = Math.max(1, Math.ceil(items.length / 9)); 
                        const slice = items.slice((invPage-1)*9, invPage*9);

                        let buffer;
                        if (generatePortfolioCard) {
                            buffer = await generatePortfolioCard(cleanName, slice, invPage, totalPages, totalValue);
                        } else {
                            return { content: "❌ عذراً، مكتبة الرسم غير متاحة للممتلكات.", components: [] };
                        }

                        if (items.length === 0) {
                            const rowBack = new ActionRowBuilder().addComponents(
                                new ButtonBuilder().setCustomId(`cat_main_${authorUser.id}`).setLabel('العودة للرئيسية').setEmoji('↩️').setStyle(ButtonStyle.Danger)
                            );
                            return { content: '', files: [new AttachmentBuilder(buffer, { name: 'portfolio.png' })], components: [rowBack] };
                        }

                        if (slice.length > 0 && selectedIndex >= slice.length) {
                            selectedIndex = slice.length - 1;
                        } else if (slice.length === 0) {
                            selectedIndex = 0;
                        }

                        const row1 = new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId(`inv_p_${authorUser.id}`).setEmoji('<:left:1439164494759723029>').setStyle(ButtonStyle.Secondary).setDisabled(invPage === 1),
                            new ButtonBuilder().setCustomId(`cat_main_${authorUser.id}`).setEmoji('↩️').setStyle(ButtonStyle.Danger),
                            new ButtonBuilder().setCustomId(`inv_n_${authorUser.id}`).setEmoji('<:right:1439164491072929915>').setStyle(ButtonStyle.Secondary).setDisabled(invPage >= totalPages)
                        );

                        return { content: '', files: [new AttachmentBuilder(buffer, { name: 'portfolio.png' })], components: [row1] };
                    } 
                    else {
                        items = await getNormalInventoryItems(invCategory);

                        const totalPages = Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE));
                        const slice = items.slice((invPage-1)*ITEMS_PER_PAGE, invPage*ITEMS_PER_PAGE);

                        const buffer = await generateInventoryCard(cleanName, invCategory, slice, invPage, totalPages, selectedIndex);

                        if (items.length === 0) {
                            const rowBack = new ActionRowBuilder().addComponents(
                                new ButtonBuilder().setCustomId(`cat_main_${authorUser.id}`).setLabel('العودة للرئيسية').setEmoji('↩️').setStyle(ButtonStyle.Danger)
                            );
                            return { content: '', files: [new AttachmentBuilder(buffer, { name: 'i.png' })], components: [rowBack] };
                        }

                        if (slice.length > 0 && selectedIndex >= slice.length) {
                            selectedIndex = slice.length - 1;
                        } else if (slice.length === 0) {
                            selectedIndex = 0;
                        }

                        const row1 = new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId(`d_l2_${authorUser.id}`).setEmoji('⏪').setStyle(ButtonStyle.Secondary),
                            new ButtonBuilder().setCustomId(`d_u1_${authorUser.id}`).setEmoji('⬆️').setStyle(ButtonStyle.Primary),
                            new ButtonBuilder().setCustomId(`d_r2_${authorUser.id}`).setEmoji('⏩').setStyle(ButtonStyle.Secondary)
                        );
                        const row2 = new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId(`d_l1_${authorUser.id}`).setEmoji('⬅️').setStyle(ButtonStyle.Primary),
                            new ButtonBuilder().setCustomId(`d_ok_${authorUser.id}`).setEmoji('💠').setStyle(ButtonStyle.Success),
                            new ButtonBuilder().setCustomId(`d_r1_${authorUser.id}`).setEmoji('➡️').setStyle(ButtonStyle.Primary)
                        );
                        const row3 = new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId(`d_u2_${authorUser.id}`).setEmoji('⏫').setStyle(ButtonStyle.Secondary),
                            new ButtonBuilder().setCustomId(`d_d1_${authorUser.id}`).setEmoji('⬇️').setStyle(ButtonStyle.Primary),
                            new ButtonBuilder().setCustomId(`d_d2_${authorUser.id}`).setEmoji('⏬').setStyle(ButtonStyle.Secondary)
                        );
                        const row4 = new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId(`inv_p_${authorUser.id}`).setEmoji('<:left:1439164494759723029>').setStyle(ButtonStyle.Secondary).setDisabled(invPage === 1),
                            new ButtonBuilder().setCustomId(`cat_main_${authorUser.id}`).setEmoji('↩️').setStyle(ButtonStyle.Danger),
                            new ButtonBuilder().setCustomId(`inv_n_${authorUser.id}`).setEmoji('<:right:1439164491072929915>').setStyle(ButtonStyle.Secondary).setDisabled(invPage >= totalPages)
                        );

                        return { 
                            content: '', 
                            files: [new AttachmentBuilder(buffer, { name: 'i.png' })], 
                            components: [row1, row2, row3, row4] 
                        };
                    }
                }
            };

            const msg = await reply(await renderView());
            
            const collector = msg.createMessageComponentCollector({ filter: i => true, time: 300000 });

            collector.on('collect', async (i) => {
                const id = i.customId;

                // 🔥 النقل السلس والمضمون للحدادة 🔥
                if (id.startsWith('route_smelt_') || id.startsWith('route_synth_')) {
                    if (i.user.id !== authorUser.id) return i.reply({ content: '❌ هذا ليس بروفايلك!', flags: [MessageFlags.Ephemeral] });
                    
                    const isSmelt = id.startsWith('route_smelt_');
                    const itemIdToRoute = id.replace(isSmelt ? 'route_smelt_' : 'route_synth_', '');
                    
                    await i.deferUpdate().catch(()=>{});
                    
                    const forgeCmd = client.commands.get('حدادة') || client.commands.find(c => c.name === 'حدادة' || (c.aliases && c.aliases.includes('forge')));
                    if (forgeCmd) {
                        collector.stop('routed_to_forge'); 
                        
                        const fakeInt = {
                            isChatInputCommand: false,
                            content: `-${isSmelt ? 'صهر' : 'دمج'}`, 
                            commandName: isSmelt ? 'صهر' : 'دمج',
                            author: authorUser,  // 🔥 تم إصلاح المتغير المفقود هنا
                            user: authorUser,    // 🔥 تم إصلاح المتغير المفقود هنا
                            member: interactionOrMessage.member || guild?.members.cache.get(authorUser.id),
                            channel: i.channel,
                            guild: guild,
                            client: client,
                            reply: async (p) => await i.editReply(p).catch(console.error),
                            editReply: async (p) => await i.editReply(p).catch(console.error), 
                            deferReply: async () => {},
                            fetchReply: async () => i.message,
                            preselectedItem: itemIdToRoute,
                            preselectedAction: isSmelt ? 'smelt' : 'synth'
                        };
                        
                        return forgeCmd.execute(fakeInt);
                    } else {
                        return i.followUp({ content: "❌ نظام الحدادة غير متوفر حالياً.", flags: [MessageFlags.Ephemeral] });
                    }
                }

                if (id.startsWith('trade_init_')) {
                    if (i.user.id !== authorUser.id) return i.reply({ content: '❌ لا يمكنك التحكم في حقيبة غيرك!', flags: [MessageFlags.Ephemeral] });
                    if (!activeItemDetails) return i.deferUpdate();
                    
                    const userSelect = new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId(`trade_target_${authorUser.id}`).setPlaceholder('اختر اللاعب الذي تود التبادل معه...'));
                    const cancelBtn = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`d_back_${authorUser.id}`).setLabel('إلغاء المبادلة').setStyle(ButtonStyle.Danger));
                    
                    await i.update({ 
                        content: `**🎁 إعطاء أو مبادلة العنصر:** ${activeItemDetails.emoji} ${activeItemDetails.name}\nيرجى تحديد اللاعب من القائمة بالأسفل:`, 
                        embeds: [], 
                        components: [userSelect, cancelBtn],
                        files: []
                    });
                    return; 
                }

                if (i.isUserSelectMenu() && id.startsWith('trade_target_')) {
                    if (i.user.id !== authorUser.id) return i.reply({ content: '❌ لا يمكنك التحكم في حقيبة غيرك!', flags: [MessageFlags.Ephemeral] });
                    
                    const targetID = i.values[0];
                    if (targetID === authorUser.id || (await client.users.fetch(targetID)).bot) {
                        return i.reply({ content: '❌ لا يمكنك التبادل مع نفسك أو مع البوتات!', flags: [MessageFlags.Ephemeral] });
                    }

                    const modal = new ModalBuilder().setCustomId(`trade_modal_${targetID}`).setTitle('إعـطـاء / مـبـادلـة');
                    modal.addComponents(
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('trade_qty').setLabel('الكمية المراد إرسالها').setStyle(TextInputStyle.Short).setRequired(true)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('trade_price').setLabel('السعر (مورا) - ضع 0 للهدية المجانية').setStyle(TextInputStyle.Short).setValue('0').setRequired(true))
                    );
                    
                    await i.showModal(modal).catch(console.error);

                    try {
                        const modalSubmit = await i.awaitModalSubmit({ filter: m => m.user.id === authorUser.id && m.customId === `trade_modal_${targetID}`, time: 60000 });
                        const qty = parseInt(modalSubmit.fields.getTextInputValue('trade_qty'));
                        const price = parseInt(modalSubmit.fields.getTextInputValue('trade_price'));

                        if (isNaN(qty) || qty <= 0) return modalSubmit.reply({ content: '❌ كمية غير صالحة.', flags: [MessageFlags.Ephemeral] });
                        if (isNaN(price) || price < 0) return modalSubmit.reply({ content: '❌ سعر غير صالح.', flags: [MessageFlags.Ephemeral] });

                        let checkTargetInvRes = await safeQuery(db, `SELECT "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, `SELECT quantity FROM user_inventory WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [targetID, guildId, activeItemDetails.id]);
                        const targetCurrentQty = checkTargetInvRes.rows[0] ? Number(checkTargetInvRes.rows[0].quantity) : 0;
                        
                        if (targetCurrentQty + qty > MAX_INVENTORY_LIMIT) {
                            return modalSubmit.reply({ content: `❌ **لا يمكنك إرسال هذه الكمية!**\nالطرف الآخر سيصل للحد الأقصى (${MAX_INVENTORY_LIMIT}).\n> يمتلك حالياً: **${targetCurrentQty}**`, flags: [MessageFlags.Ephemeral] });
                        }

                        let checkInvRes = await safeQuery(db, `SELECT "quantity", "id" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, `SELECT quantity, id FROM user_inventory WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [authorUser.id, guildId, activeItemDetails.id]);
                        const senderInvData = checkInvRes.rows[0];

                        if (!senderInvData || Number(senderInvData.quantity) < qty) return modalSubmit.reply({ content: '❌ أنت لا تملك هذه الكمية في حقيبتك!', flags: [MessageFlags.Ephemeral] });

                        if (price === 0) {
                            await db.query('BEGIN').catch(()=>{});
                            const newSenderQty = Number(senderInvData.quantity) - qty;
                            if (newSenderQty > 0) {
                                await db.query(`UPDATE user_inventory SET "quantity" = $1 WHERE "id" = $2`, [newSenderQty, senderInvData.id]);
                            } else {
                                await db.query(`DELETE FROM user_inventory WHERE "id" = $1`, [senderInvData.id]);
                            }

                            await db.query(`INSERT INTO user_inventory ("userID", "guildID", "itemID", "quantity") VALUES ($1, $2, $3, $4) ON CONFLICT ("userID", "guildID", "itemID") DO UPDATE SET "quantity" = LEAST(user_inventory."quantity" + $4, 999)`, [targetID, guildId, activeItemDetails.id, qty]);
                            await db.query('COMMIT').catch(()=>{});

                            await modalSubmit.reply({ content: `🎁 <@${authorUser.id}> أرسل **${qty}x ${activeItemDetails.emoji} ${activeItemDetails.name}** كهدية إلى <@${targetID}>!` });
                            
                            activeItemDetails.quantity -= qty;
                            if(activeItemDetails.quantity <= 0) activeItemDetails = null;
                            await msg.edit(await renderView());
                        } else {
                            await modalSubmit.deferReply();
                            const tradeId = Date.now().toString();
                            const tradeButtons = new ActionRowBuilder().addComponents(
                                new ButtonBuilder().setCustomId(`trade_acc_${tradeId}`).setLabel('قبول وشراء ✅').setStyle(ButtonStyle.Success),
                                new ButtonBuilder().setCustomId(`trade_dec_${tradeId}`).setLabel('رفض ❌').setStyle(ButtonStyle.Danger)
                            );

                            const tradeMsgObj = await modalSubmit.followUp({ content: `⚖️ **عـقـد تـجـاري**\nمرحباً <@${targetID}>!\nيعرض عليك <@${authorUser.id}>:\n**استلام:** ${qty}x ${activeItemDetails.emoji} ${activeItemDetails.name}\n**دفع:** ${price.toLocaleString()} 🪙`, components: [tradeButtons] });

                            const tradeFilter = btn => btn.user.id === targetID && btn.customId.includes(tradeId);
                            const tradeCollector = tradeMsgObj.createMessageComponentCollector({ filter: tradeFilter, time: 60000 });

                            tradeCollector.on('collect', async btn => {
                                await btn.deferUpdate();
                                if (btn.customId.includes('dec_')) {
                                    tradeCollector.stop('declined');
                                    return tradeMsgObj.edit({ content: `❌ تم رفض الصفقة من قبل <@${targetID}>.`, components: [] });
                                }

                                let targetLvlRes = await safeQuery(db, `SELECT "mora" FROM levels WHERE "user" = $1 AND "guild" = $2`, `SELECT mora FROM levels WHERE userid = $1 AND guildid = $2`, [targetID, guildId]);
                                const targetMora = targetLvlRes.rows[0] ? Number(targetLvlRes.rows[0].mora) : 0;
                                
                                if (targetMora < price) return btn.followUp({ content: '❌ لا تملك المورا الكافية!', flags: [MessageFlags.Ephemeral] });

                                let checkInvFinalRes = await safeQuery(db, `SELECT "quantity", "id" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, `SELECT quantity, id FROM user_inventory WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [authorUser.id, guildId, activeItemDetails.id]);
                                const senderInvFinal = checkInvFinalRes.rows[0];

                                if (!senderInvFinal || Number(senderInvFinal.quantity) < qty) {
                                    tradeCollector.stop('failed');
                                    return tradeMsgObj.edit({ content: `❌ فشلت الصفقة: البائع لا يملك الكمية المطلوبة حالياً!`, components: [] });
                                }

                                try {
                                    await db.query('BEGIN').catch(()=>{});
                                    const finalSenderQty = Number(senderInvFinal.quantity) - qty;
                                    if (finalSenderQty > 0) {
                                        await db.query(`UPDATE user_inventory SET "quantity" = $1 WHERE "id" = $2`, [finalSenderQty, senderInvFinal.id]);
                                    } else {
                                        await db.query(`DELETE FROM user_inventory WHERE "id" = $1`, [senderInvFinal.id]);
                                    }
                                    
                                    await db.query(`INSERT INTO user_inventory ("userID", "guildID", "itemID", "quantity") VALUES ($1, $2, $3, $4) ON CONFLICT ("userID", "guildID", "itemID") DO UPDATE SET "quantity" = LEAST(user_inventory."quantity" + $4, 999)`, [targetID, guildId, activeItemDetails.id, qty]);
                                    await db.query(`UPDATE levels SET "mora" = "mora" - $1 WHERE "user" = $2 AND "guild" = $3`, [price, targetID, guildId]);
                                    await db.query(`UPDATE levels SET "mora" = "mora" + $1 WHERE "user" = $2 AND "guild" = $3`, [price, authorUser.id, guildId]);
                                    await db.query('COMMIT').catch(()=>{});

                                    tradeCollector.stop('accepted');
                                    await tradeMsgObj.edit({ content: `✅ **تمت الصفقة بنجاح!**\nاشترى <@${targetID}> ${qty}x ${activeItemDetails.name} مقابل ${price.toLocaleString()} 🪙 من <@${authorUser.id}>.`, components: [] });

                                    activeItemDetails.quantity -= qty;
                                    if(activeItemDetails.quantity <= 0) activeItemDetails = null;
                                    await msg.edit(await renderView());
                                } catch (e) {
                                    await db.query('ROLLBACK').catch(()=>{});
                                    tradeCollector.stop('error');
                                    await tradeMsgObj.edit({ content: `❌ حدث خطأ فني أثناء الصفقة.`, components: [] });
                                }
                            });

                            tradeCollector.on('end', (collected, reason) => {
                                if (reason === 'time') tradeMsgObj.edit({ content: `⏳ انتهى وقت العرض.`, components: [] }).catch(()=>{});
                            });
                        }
                    } catch(e) {}
                    return;
                }

                if (i.user.id !== authorUser.id) {
                    return i.reply({ content: '❌ لا يمكنك التحكم في حقيبة غيرك!', flags: [MessageFlags.Ephemeral] });
                }

                if (id.startsWith('c_') || id.startsWith('v_port_')) {
                    await i.deferUpdate();
                    if (id.startsWith('c_mat_')) { currentView = 'inventory'; invCategory = 'موارد'; }
                    else if (id.startsWith('c_fis_')) { currentView = 'inventory'; invCategory = 'صيد'; }
                    else if (id.startsWith('c_far_')) { currentView = 'inventory'; invCategory = 'مزرعة'; }
                    else if (id.startsWith('c_oth_')) { currentView = 'inventory'; invCategory = 'أخرى'; }
                    else if (id.startsWith('v_port_')) { currentView = 'inventory'; invCategory = 'market'; }
                    
                    invPage = 1; selectedIndex = 0; activeItemDetails = null;
                }
                else if (id.startsWith('v_inv_')) { await i.deferUpdate(); currentView = 'inventory'; invCategory = 'main'; selectedIndex = 0; activeItemDetails = null; }
                else if (id.startsWith('v_com_')) { await i.deferUpdate(); currentView = 'combat'; skillPage = 0; activeItemDetails = null; }
                else if (id.startsWith('v_pro_')) { await i.deferUpdate(); currentView = 'profile'; activeItemDetails = null; }
                else if (id.startsWith('cat_main_')) { await i.deferUpdate(); invCategory = 'main'; activeItemDetails = null; }
                else if (id.startsWith('inv_n_')) { await i.deferUpdate(); invPage++; selectedIndex = 0; activeItemDetails = null; }
                else if (id.startsWith('inv_p_')) { await i.deferUpdate(); invPage--; selectedIndex = 0; activeItemDetails = null; }
                else if (id.startsWith('sk_n_')) { await i.deferUpdate(); skillPage++; }
                else if (id.startsWith('sk_p_')) { await i.deferUpdate(); skillPage--; }
                else if (id.startsWith('d_back_')) { await i.deferUpdate(); activeItemDetails = null; }

                else if (id.startsWith('d_')) {
                    await i.deferUpdate();
                    const moveType = id.split('_')[1]; 
                    
                    const col = selectedIndex % 5;
                    const row = Math.floor(selectedIndex / 5);
                    
                    if (moveType === 'r1') { selectedIndex = row * 5 + ((col + 1) % 5); } 
                    else if (moveType === 'l1') { selectedIndex = row * 5 + ((col - 1 + 5) % 5); }
                    else if (moveType === 'd1') { selectedIndex = ((row + 1) % 3) * 5 + col; }
                    else if (moveType === 'u1') { selectedIndex = ((row - 1 + 3) % 3) * 5 + col; }
                    else if (moveType === 'r2') { selectedIndex = row * 5 + ((col + 2) % 5); }
                    else if (moveType === 'l2') { selectedIndex = row * 5 + ((col - 2 + 5) % 5); }
                    else if (moveType === 'd2') { selectedIndex = ((row + 2) % 3) * 5 + col; }
                    else if (moveType === 'u2') { selectedIndex = ((row - 2 + 3) % 3) * 5 + col; }
                    else if (moveType === 'ok') {
                        let items = [];
                        if (invCategory === 'market') {
                            const [portfolioRes, dbMarketRes] = await Promise.all([
                                safeQuery(db, `SELECT * FROM user_portfolio WHERE "guildID" = $1 AND "userID" = $2`, `SELECT * FROM user_portfolio WHERE guildid = $1 AND userid = $2`, [guildId, targetUser.id]),
                                db.query("SELECT * FROM market_items").catch(()=>({rows:[]}))
                            ]);
                            const portfolio = portfolioRes?.rows || [];
                            const market = new Map(marketConfig.map(item => [item.id, item]));
                            let dbMarketPrices = new Map((dbMarketRes?.rows || []).map(row => [row.id, Number(row.currentPrice || row.currentprice)]));

                            for (const row of portfolio) {
                                const itemID = row.itemID || row.itemid;
                                const marketItem = market.get(itemID);
                                if (!marketItem) continue;
                                let currentPrice = dbMarketPrices.has(itemID) ? dbMarketPrices.get(itemID) : marketItem.price;
                                const quantity = Number(row.quantity) || 0;
                                if (quantity <= 0) continue;
                                let purchasePrice = Number(row.purchasePrice || row.purchaseprice) || 0;
                                const info = resolveItemInfoLocal(itemID);
                                
                                info.description = `${info.description || ''}\n\n📊 السعر الحالي: ${currentPrice.toLocaleString()} 🪙\n💰 سعر الشراء: ${purchasePrice.toLocaleString()} 🪙\n💎 القيمة الإجمالية: ${(currentPrice * quantity).toLocaleString()} 🪙`;
                                items.push({ ...info, quantity, id: itemID });
                            }
                        } else {
                            items = await getNormalInventoryItems(invCategory);
                        }

                        const perPage = invCategory === 'market' ? 9 : ITEMS_PER_PAGE;
                        const slice = items.slice((invPage-1)*perPage, invPage*perPage);
                        
                        if (slice[selectedIndex]) {
                            activeItemDetails = slice[selectedIndex];
                        } else {
                            return i.followUp({ content: `❌ هذا المربع فارغ يا عزيزي.`, flags: [MessageFlags.Ephemeral] });
                        }
                    }
                }
                
                await msg.edit(await renderView());
            });

            // 🔥 منع تفريغ الأزرار لو كان السبب هو الذهاب للحدادة لضمان استمرار الواجهة 🔥
            collector.on('end', (collected, reason) => {
                if (reason === 'routed_to_forge') return; 
                if(msg && msg.editable) {
                    msg.edit({ components: [] }).catch(() => null);
                }
            });

        } catch (error) {
            console.error(error);
        }
    }
};
