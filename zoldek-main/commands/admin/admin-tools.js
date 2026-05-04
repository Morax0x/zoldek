const { SlashCommandBuilder, PermissionsBitField, EmbedBuilder, Colors, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags, ButtonBuilder, ButtonStyle } = require('discord.js');
const shopItems = require('../../json/shop-items.json');
const farmAnimals = require('../../json/farm-animals.json');
const seedsData = require('../../json/seeds.json');
const feedItems = require('../../json/feed-items.json');
const marketItems = require('../../json/market-items.json');
const questsConfig = require('../../json/quests-config.json');
const weaponsConfig = require('../../json/weapons-config.json');
const skillsConfig = require('../../json/skills-config.json');
const upgradeMats = require('../../json/upgrade-materials.json'); 

let potionsConfig = [];
try { potionsConfig = require('../../json/potions.json'); } catch(e){}

let fishingConfig = {};
let validBaitIDs = ['worm', 'cricket', 'shrimp', 'squid', 'magic'];
try { 
    fishingConfig = require('../../json/fishing-config.json'); 
    if (fishingConfig.baits) validBaitIDs = fishingConfig.baits.map(b => b.id);
} catch(e){}

const EMOJI_MORA = '<:mora:1435647151349698621>';
const REAL_MARKET_IDS = ['APPLE', 'ANDROID', 'TESLA', 'GOLD', 'LAND', 'BITCOIN', 'SPACEX', 'SILVER', 'ART'];

function normalize(str) {
    if (!str) return "";
    return str.toString().toLowerCase()
        .replace(/[أإآ]/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/ي/g, 'ى')
        .replace(/ؤ/g, 'و')
        .replace(/ئ/g, 'ي')
        .replace(/_/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function getTodayDateString() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date());
}

const kingStatsMap = {
    'roleCasinoKing': 'casino_profit',
    'roleAbyss': 'dungeon_floor',
    'roleChatter': 'messages',
    'rolePhilanthropist': 'mora_donated',
    'roleThief': 'mora_stolen',
    'roleVoice': 'voice_time',
    'roleFisherKing': 'fish_caught',
    'rolePvPKing': 'pvp_wins'
};

const safeQuery = async (db, qPg, params) => {
    let res;
    try { 
        res = await db.query(qPg, params); 
    } catch(e) { 
        res = { rows: [] }; 
    }

    const rows1 = Array.isArray(res) ? res : (res?.rows || []);
    if (rows1.length > 0) return { rows: rows1 };

    let fallbackQuery = qPg
        .replace(/"userID"/g, "userid")
        .replace(/"guildID"/g, "guildid")
        .replace(/"itemID"/g, "itemid")
        .replace(/"skillID"/g, "skillid")
        .replace(/"skillLevel"/g, "skilllevel")
        .replace(/"raceName"/g, "racename")
        .replace(/"weaponLevel"/g, "weaponlevel")
        .replace(/"quantity"/g, "quantity")
        .replace(/"mora"/g, "mora")
        .replace(/"bank"/g, "bank")
        .replace(/"level"/g, "level")
        .replace(/"id"/g, "id")
        .replace(/"user"/g, "userid")
        .replace(/"guild"/g, "guildid");
    
    if (fallbackQuery !== qPg) {
        try { 
            let res2 = await db.query(fallbackQuery, params); 
            const rows2 = Array.isArray(res2) ? res2 : (res2?.rows || []);
            return { rows: rows2 };
        } catch(e2) { }
    }
    
    return { rows: [] };
};

// 🔥 دالة طلب التأكيد النهائي لمنع تصفير الحسابات والأدوار بالغلط 🔥
async function confirmAction(interaction, title, description) {
    const confirmId = `confirm_${Date.now()}`;
    const cancelId = `cancel_${Date.now()}`;
    
    const embed = new EmbedBuilder()
        .setTitle(`⚠️ تأكيد الإجراء الخطير: ${title}`)
        .setDescription(description + "\n\n**هل أنت متأكد من هذا الإجراء؟ لا يمكن التراجع عنه!**")
        .setColor(Colors.Red);
        
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(confirmId).setLabel('تأكيد التصفير النهائي').setStyle(ButtonStyle.Danger).setEmoji('✅'),
        new ButtonBuilder().setCustomId(cancelId).setLabel('إلغاء التصفير').setStyle(ButtonStyle.Secondary).setEmoji('❌')
    );
    
    const replyMsg = await interaction.editReply({ content: '', embeds: [embed], components: [row], fetchReply: true });
    
    try {
        const btnInt = await replyMsg.awaitMessageComponent({
            filter: btn => btn.user.id === interaction.user.id && (btn.customId === confirmId || btn.customId === cancelId),
            time: 30000
        });
        
        if (btnInt.customId === cancelId) {
            await btnInt.update({ content: '❌ تم الإلغاء بأمان، لم يتم المساس بشيء.', embeds: [], components: [] });
            return false;
        }
        
        await btnInt.deferUpdate(); 
        return true;
    } catch (err) {
        await interaction.editReply({ content: '❌ انتهى وقت التأكيد، تم إلغاء الإجراء التلقائي.', embeds: [], components: [] });
        return false;
    }
}

async function getUserRace(member, db) {
    if (!member || !member.guild) return null;
    let raceRolesRes = await safeQuery(db, `SELECT "roleID", "raceName" FROM race_roles WHERE "guildID" = $1`, [member.guild.id]);
    let allRaceRoles = raceRolesRes.rows || [];
    if (!member.roles || !member.roles.cache) return null;
    const userRoleIDs = member.roles.cache.map(r => r.id);
    return allRaceRoles.find(r => userRoleIDs.includes(r.roleID || r.roleid)) || null;
}

async function getGearSummaryEmbed(userID, guildID, db, targetUser) {
    let levelsRes = await safeQuery(db, `SELECT "rodLevel", "boatLevel", "currentLocation", "max_dungeon_floor" FROM levels WHERE "user" = $1 AND "guild" = $2`, [userID, guildID]);
    const levelsData = levelsRes.rows[0] || { rodLevel: 1, boatLevel: 1, currentLocation: 'beach', max_dungeon_floor: 0 };
    const rodLvl = levelsData.rodLevel || levelsData.rodlevel || 1;
    const boatLvl = levelsData.boatLevel || levelsData.boatlevel || 1;
    const cLoc = levelsData.currentLocation || levelsData.currentlocation || 'beach'; 
    const maxFloor = levelsData.max_dungeon_floor || levelsData.max_dungeon_floor || 0;

    let weaponRes = await safeQuery(db, `SELECT "raceName", "weaponLevel" FROM user_weapons WHERE "userID" = $1 AND "guildID" = $2`, [userID, guildID]);
    const weaponData = weaponRes.rows[0];
    const wRace = weaponData ? (weaponData.raceName || weaponData.racename) : null;
    const wLvl = weaponData ? (weaponData.weaponLevel || weaponData.weaponlevel) : null;
    const weaponText = weaponData ? `**${wRace}** (Lv.${wLvl})` : "لا يوجد سلاح";

    let skillsRes = await safeQuery(db, `SELECT "skillID", "skillLevel" FROM user_skills WHERE "userID" = $1 AND "guildID" = $2`, [userID, guildID]);
    const skillsData = skillsRes.rows || [];

    let skillsText = "لا يوجد مهارات مكتسبة";
    if (skillsData.length > 0) {
        skillsText = skillsData.map(s => {
            const sId = s.skillID || s.skillid;
            const sLvl = s.skillLevel || s.skilllevel;
            const sConf = skillsConfig.find(sc => sc.id === sId);
            return `🔹 **${sConf ? sConf.name : sId}** (Lv.${sLvl})`;
        }).join('\n');
    }

    const embed = new EmbedBuilder()
        .setTitle(`🛡️ الجرد الحالي لمعدات: ${targetUser.username}`)
        .setColor(Colors.DarkGold)
        .setThumbnail(targetUser.displayAvatarURL())
        .addFields(
            { name: '⚔️ السلاح الحالي', value: weaponText, inline: true },
            { name: '🎣 معدات الصيد', value: `السنارة: **Lv.${rodLvl}**\nالقارب: **Lv.${boatLvl}**\nالموقع: **${cLoc}**`, inline: true },
            { name: '⛺ الدانجون', value: `أعلى طابق: **${maxFloor}**`, inline: true },
            { name: '✨ المهارات القتالية', value: skillsText, inline: false }
        );

    return embed;
}

module.exports = {
    name: 'admin-tools',
    description: 'لـوحـة الامبراطـور',
    aliases: ['ادمن', 'admin', 'تعديل-ادمن', 'ادوات-ادمن', 'control'],
    category: 'Admin',

    async execute(message, args) {
        const client = message.client;
        const db = client.sql;

        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return; 

        try { await safeQuery(db, `ALTER TABLE settings ADD COLUMN IF NOT EXISTS "marketStatus" TEXT DEFAULT 'normal'`, []); } catch (e) {}

        if (args[0] && (args[0].toLowerCase() === 'سوق' || args[0].toLowerCase() === 'market')) {
            return this.sendMarketPanel(message, db);
        }

        let targetUser = message.mentions.users.first();
        if (!targetUser && args[0]) {
            const possibleId = args[0].replace(/[<@!>]/g, ''); 
            if (/^\d+$/.test(possibleId)) {
                try {
                    targetUser = await client.users.fetch(possibleId);
                } catch (e) {}
            }
        }

        if (!targetUser) {
            const embed = new EmbedBuilder()
                .setTitle('🛠️ لوحة تحكم الإمبراطورية')
                .setColor(Colors.DarkGrey)
                .setDescription("لإدارة عضو معين:\n`-ادمن @منشن` أو `-ادمن [ID]`\n\nلإدارة الاقتصاد والسوق:\n`-ادمن سوق`");
            return message.reply({ embeds: [embed] });
        }

        const targetMember = await message.guild.members.fetch(targetUser.id).catch(() => null);
        if (!targetMember) return message.reply("❌ العضو غير موجود في السيرفر.");

        const randomColor = Math.floor(Math.random()*16777215); 

        const embed = new EmbedBuilder()
            .setTitle(`✥ لـوحـة التـحـكـم بالامبراطـوريـة`)
            .setColor(randomColor)
            .setThumbnail(targetUser.displayAvatarURL())
            .setDescription(`**${targetUser.username}**`);

        const btnRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`admin_open_panel_${targetUser.id}`)
                .setLabel('اصـدار امـر 👑')
                .setStyle(ButtonStyle.Danger)
        );

        const initMsg = await message.reply({ embeds: [embed], components: [btnRow] });

        const filter = i => i.user.id === message.author.id && i.customId.startsWith('admin_open_panel_');
        const collector = initMsg.createMessageComponentCollector({ filter, time: 300000 });

        collector.on('collect', async i => {
            await this.sendHiddenUserPanel(i, targetUser, targetMember, db, client, initMsg);
        });
    },

    async sendHiddenUserPanel(interaction, targetUser, targetMember, db, client, initMsg) {
        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`admin_user_hidden_${targetUser.id}`)
                .setPlaceholder('اختر الإجراء السري...')
                .addOptions([
                    { label: '📋 فحص الحساب', value: 'check', description: 'عرض إحصائيات اللاعب' },
                    { label: '💰 إدارة المورا والخبرة', value: 'economy', emoji: '🪙' },
                    { label: '🔄 تبديل ونقل حسابين', value: 'swap_accounts', description: 'نقل البيانات بين شخصين', emoji: '🔄' }, 
                    { label: '🎭 تغيير العرق', value: 'change_race', description: 'تغيير العرق وتصحيح بيانات الأسلحة', emoji: '🎭' },
                    { label: '👑 تعيين ملك يدوي', value: 'set_king', description: 'تتويج العضو', emoji: '👑' },
                    { label: '🗑️ إخلاء عرش ملك', value: 'empty_king', description: 'طرد الملك الحالي وتصفير نقاطه', emoji: '🗑️' },
                    { label: '🌟 إدارة السمعة', value: 'reputation', emoji: '🌟' },
                    { label: '🗳️ فرص التزكية', value: 'rep_chances', emoji: '🗳️' },
                    { label: '🎟️ إدارة التذاكر', value: 'tickets', emoji: '🎟️' },
                    { label: '⛺ منح خيمة (دانجون)', value: 'dungeon_tent', emoji: '⛺' },
                    { label: '🎒 إدارة العناصر', value: 'items', emoji: '🎒' },
                    { label: '⚔️ تعديل الأسلحة والمهارات', value: 'combat_gear', emoji: '⚔️' },
                    { label: '🕵️ إدارة التعزيز المخفي', value: 'hidden_buff', description: 'تعديل لفل سلاح/مهارة في الخفاء!', emoji: '🕵️' },
                    { label: '🪄 إزالة تأثير (بف/لعنة)', value: 'remove_buffs', description: 'إلغاء تعزيز أو لعنة مؤقتة وتصفيرها', emoji: '🪄' },
                    { label: '⛵ معدات وموقع الصيد', value: 'fishing_gear', emoji: '🎣' }, 
                    { label: '🔥 إدارة الستريك (شات/ميديا)', value: 'manage_streaks', description: 'تعديل أيام الستريك والدروع', emoji: '🔥' },
                    { label: '🗑️ تصفير الأسلحة والمهارات', value: 'reset_combat', emoji: '🗑️' },
                    { label: '⚠️ تصفير الحساب بالكامل', value: 'reset', emoji: '⚠️' }
                ])
        );

        await interaction.reply({ content: `👑 **لوحة تحكم: ${targetUser.username}**`, components: [row], flags: [MessageFlags.Ephemeral] });

        const filter = i => i.user.id === interaction.user.id;
        const actionCollector = interaction.channel.createMessageComponentCollector({ filter, time: 300000 });

        actionCollector.on('collect', async i => {
            if (!i.customId.startsWith(`admin_user_hidden_${targetUser.id}`)) return;
            const val = i.values[0];
            const guildID = i.guild.id;
            const userID = targetUser.id;

            if (val === 'check') {
                await this.checkUser(i, client, db, targetUser);
            } 
            else if (val === 'change_race') {
                let raceRolesRes = await safeQuery(db, `SELECT "roleID", "raceName" FROM race_roles WHERE "guildID" = $1`, [guildID]);
                let allRaceRoles = raceRolesRes.rows || [];

                if (allRaceRoles.length === 0) {
                    return i.reply({ content: "❌ لا توجد أعراق مبرمجة في هذا السيرفر حالياً.", flags: [MessageFlags.Ephemeral] });
                }

                const options = allRaceRoles.slice(0, 25).map(r => ({
                    label: r.raceName || r.racename,
                    value: r.roleID || r.roleid,
                    description: `نقل اللاعب إلى عرق ${r.raceName || r.racename}`
                }));

                const raceMenu = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId(`mod_race_${Date.now()}`)
                        .setPlaceholder('🎭 اختر العرق الجديد...')
                        .addOptions(options)
                );

                await i.update({ content: `🎭 **تغيير وتصحيح عرق ${targetUser}:**\nهذا الخيار سيغير رتبة اللاعب وينقل مستوى سلاحه ومهارته العرقية تلقائياً لمنع تعليق الحساب.\n\nالرجاء اختيار العرق الجديد:`, embeds: [], components: [raceMenu] });

                const raceCollector = interaction.channel.createMessageComponentCollector({ filter: subI => subI.user.id === i.user.id && subI.customId.startsWith('mod_race_'), time: 60000 });

                raceCollector.on('collect', async subI => {
                    await subI.deferUpdate();
                    const selectedRoleID = subI.values[0];
                    const selectedRace = allRaceRoles.find(r => (r.roleID || r.roleid) === selectedRoleID);
                    const newRaceName = selectedRace.raceName || selectedRace.racename;

                    const allRoleIds = allRaceRoles.map(r => r.roleID || r.roleid);
                    for (const rId of allRoleIds) {
                        if (rId !== selectedRoleID && targetMember.roles.cache.has(rId)) {
                            await targetMember.roles.remove(rId).catch(()=>{});
                        }
                    }
                    if (!targetMember.roles.cache.has(selectedRoleID)) {
                        await targetMember.roles.add(selectedRoleID).catch(()=>{});
                    }

                    let currentWeaponLevel = 1;
                    const wRes = await safeQuery(db, `SELECT "weaponLevel" FROM user_weapons WHERE "userID" = $1 AND "guildID" = $2 LIMIT 1`, [userID, guildID]);
                    if (wRes.rows.length > 0) currentWeaponLevel = Number(wRes.rows[0].weaponLevel || wRes.rows[0].weaponlevel);

                    await safeQuery(db, `DELETE FROM user_weapons WHERE "userID" = $1 AND "guildID" = $2`, [userID, guildID]);
                    await safeQuery(db, `INSERT INTO user_weapons ("userID", "guildID", "raceName", "weaponLevel") VALUES ($1, $2, $3, $4)`, [userID, guildID, newRaceName, currentWeaponLevel]);

                    let currentRaceSkillLevel = 1;
                    const sRes = await safeQuery(db, `SELECT "skillLevel" FROM user_skills WHERE "userID" = $1 AND "guildID" = $2 AND "skillID" LIKE 'race_%'`, [userID, guildID]);
                    if (sRes.rows.length > 0) currentRaceSkillLevel = Number(sRes.rows[0].skillLevel || sRes.rows[0].skilllevel);

                    await safeQuery(db, `DELETE FROM user_skills WHERE "userID" = $1 AND "guildID" = $2 AND "skillID" LIKE 'race_%'`, [userID, guildID]);
                    
                    const newRaceSkillId = `race_${newRaceName.toLowerCase().replace(/\s+/g, '_')}_skill`;
                    await safeQuery(db, `INSERT INTO user_skills ("userID", "guildID", "skillID", "skillLevel") VALUES ($1, $2, $3, $4)`, [userID, guildID, newRaceSkillId, currentRaceSkillLevel]);

                    const summaryEmbed = await getGearSummaryEmbed(userID, guildID, db, targetUser);
                    await subI.editReply({ content: `✅ **تم تغيير وتصحيح عرق اللاعب إلى (${newRaceName}) بنجاح!**\nتم تحديث الرتبة، ونقل مستوى السلاح (Lv.${currentWeaponLevel}) والمهارة العرقية (Lv.${currentRaceSkillLevel}) بأمان لتجنب تعليق الحساب.`, embeds: [summaryEmbed], components: [] });
                    raceCollector.stop();
                });
            }
            else if (val === 'economy') {
                const modalId = `mod_eco_${Date.now()}`;
                const modal = new ModalBuilder().setCustomId(modalId).setTitle('إدارة الموارد');
                const typeInput = new TextInputBuilder().setCustomId('eco_type').setLabel('النوع (مورا / خبرة)').setStyle(TextInputStyle.Short).setRequired(true);
                const actionInput = new TextInputBuilder().setCustomId('eco_action').setLabel('الإجراء (اضافة / خصم / تحديد)').setStyle(TextInputStyle.Short).setRequired(true);
                const amountInput = new TextInputBuilder().setCustomId('eco_amount').setLabel('الكمية (أرقام فقط)').setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(typeInput), new ActionRowBuilder().addComponents(actionInput), new ActionRowBuilder().addComponents(amountInput));
                await i.showModal(modal);

                try {
                    const modalSubmit = await i.awaitModalSubmit({ filter: sub => sub.customId === modalId && sub.user.id === i.user.id, time: 120000 });
                    await modalSubmit.deferReply({ flags: [MessageFlags.Ephemeral] });

                    const type = normalize(modalSubmit.fields.getTextInputValue('eco_type'));
                    const action = normalize(modalSubmit.fields.getTextInputValue('eco_action'));
                    const amount = parseInt(modalSubmit.fields.getTextInputValue('eco_amount'));
                    
                    if (isNaN(amount)) return modalSubmit.editReply({ content: "❌ الرجاء إدخال رقم صحيح." });
                    
                    let ud = await client.getLevel(userID, guildID);
                    if (!ud) ud = { ...client.defaultData, user: userID, guild: guildID };

                    let field = type.includes('مورا') || type.includes('فلوس') ? 'mora' : 'xp';
                    
                    if (action.includes('اضاف')) ud[field] = Number(ud[field] || 0) + amount;
                    else if (action.includes('خصم')) ud[field] = Math.max(0, Number(ud[field] || 0) - amount);
                    else if (action.includes('تحديد')) ud[field] = amount;

                    await client.setLevel(ud);
                    await modalSubmit.editReply({ content: `✅ تم تعديل اقتصاد ${targetUser} بنجاح.` });
                } catch(e) {}
            }
            else if (val === 'hidden_buff') {
                const modalId = `mod_hidden_${Date.now()}`;
                const modal = new ModalBuilder().setCustomId(modalId).setTitle('إدارة التعزيز المخفي');
                const typeInput = new TextInputBuilder().setCustomId('hb_type').setLabel('النوع (سلاح أم مهارة؟)').setStyle(TextInputStyle.Short).setRequired(true);
                const nameInput = new TextInputBuilder().setCustomId('hb_name').setLabel('اسم المهارة (اتركه فارغاً إذا كان سلاح)').setStyle(TextInputStyle.Short).setRequired(false);
                const levelInput = new TextInputBuilder().setCustomId('hb_level').setLabel('اللفل المخفي (اكتب 0 لإزالة التعزيز)').setStyle(TextInputStyle.Short).setRequired(true);
                
                modal.addComponents(new ActionRowBuilder().addComponents(typeInput), new ActionRowBuilder().addComponents(nameInput), new ActionRowBuilder().addComponents(levelInput));
                await i.showModal(modal);

                try {
                    const modalSubmit = await i.awaitModalSubmit({ filter: sub => sub.customId === modalId && sub.user.id === i.user.id, time: 120000 });
                    await modalSubmit.deferReply({ flags: [MessageFlags.Ephemeral] });

                    const type = normalize(modalSubmit.fields.getTextInputValue('hb_type'));
                    const name = modalSubmit.fields.getTextInputValue('hb_name');
                    const level = parseInt(modalSubmit.fields.getTextInputValue('hb_level'));

                    if (isNaN(level) || level < 0) return modalSubmit.editReply("❌ يرجى إدخال رقم لفل صحيح.");

                    let buffType = '';
                    let successMsg = '';

                    if (type.includes('سلاح')) {
                        buffType = 'hidden_weapon';
                        successMsg = level === 0 ? `✅ تم إزالة التعزيز المخفي لسلاح ${targetUser}.` : `✅ تم تفعيل تعزيز مخفي لسلاح ${targetUser} ليصبح **Lv.${level}** بالقتال.`;
                    } else if (type.includes('مهار')) {
                        if (!name) return modalSubmit.editReply("❌ يرجى كتابة اسم المهارة للبحث عنها.");
                        const searchName = normalize(name);
                        const foundSkill = skillsConfig.find(s => normalize(s.name).includes(searchName) || s.id.toLowerCase().includes(searchName));
                        if (!foundSkill) return modalSubmit.editReply(`❌ لم أجد مهارة باسم: ${name}`);
                        
                        buffType = `hidden_skill_${foundSkill.id}`;
                        successMsg = level === 0 ? `✅ تم إزالة التعزيز المخفي لمهارة (${foundSkill.name}).` : `✅ تم تفعيل تعزيز مخفي لمهارة (${foundSkill.name}) لتصبح **Lv.${level}** بالقتال.`;
                    } else {
                        return modalSubmit.editReply("❌ نوع غير معروف. يرجى كتابة (سلاح) أو (مهارة).");
                    }

                    const expireTime = Date.now() + (365 * 24 * 60 * 60 * 1000); 
                    
                    if (level === 0) {
                        await safeQuery(db, `DELETE FROM user_buffs WHERE "userID" = $1 AND "guildID" = $2 AND "buffType" = $3`, [userID, guildID, buffType]);
                    } else {
                        await safeQuery(db, `DELETE FROM user_buffs WHERE "userID" = $1 AND "guildID" = $2 AND "buffType" = $3`, [userID, guildID, buffType]);
                        await safeQuery(db, `INSERT INTO user_buffs ("guildID", "userID", "buffPercent", "expiresAt", "buffType", "multiplier") VALUES ($1, $2, $3, $4, $5, $6)`, [guildID, userID, 0, expireTime, buffType, level]);
                    }

                    await modalSubmit.editReply({ content: successMsg });

                } catch(e) {}
            }
            // 🔥 نظام إزالة التأثيرات/اللعنات المؤقتة الجديد 🔥
            else if (val === 'remove_buffs') {
                let activeBuffsRes = await safeQuery(db, `SELECT * FROM user_buffs WHERE "userID" = $1 AND "guildID" = $2`, [userID, guildID]);
                let activeBuffs = activeBuffsRes.rows || [];

                if (activeBuffs.length === 0) {
                    return i.reply({ content: "❌ هذا اللاعب لا يمتلك أي تعزيزات أو لعنات مؤقتة حالياً.", flags: [MessageFlags.Ephemeral] });
                }

                let options = activeBuffs.map(b => {
                    let bType = b.buffType || b.bufftype;
                    let bPercent = b.buffPercent || b.buffpercent;
                    
                    let labelName = bType;
                    if (bType === 'xp') labelName = 'خبرة (XP)';
                    else if (bType === 'mora') labelName = 'مورا (Mora)';
                    else if (bType === 'pvp_wounded') labelName = 'لعنة النزاع';
                    else if (bType === 'farm_worker') labelName = 'عامل المزرعة';
                    else if (bType.startsWith('hidden_')) labelName = 'تعزيز مخفي';
                    
                    let valStr = Number(bPercent) !== 0 ? `${Number(bPercent) > 0 ? '+' : ''}${bPercent}%` : 'مفعل';
                    
                    return {
                        label: `${labelName} | ${valStr}`.substring(0, 100),
                        value: `rmbuff_${bType}`.substring(0, 100),
                        description: `إزالة وتصفير هذا التأثير من اللاعب`
                    };
                }).slice(0, 24);

                // إزالة التكرارات من القائمة إذا كان لديه نفس نوع البف مرتين
                options = options.filter((v, idx, a) => a.findIndex(t => (t.value === v.value)) === idx);

                options.push({
                    label: '🗑️ إزالة الكل (المؤقت فقط)',
                    value: 'rmbuff_all',
                    description: 'تصفير جميع التعزيزات واللعنات المؤقتة (خبرة/مورا/نزاع)'
                });

                const buffMenu = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId(`mod_rm_buff_${Date.now()}`)
                        .setPlaceholder('🪄 اختر التعزيز أو اللعنة لإزالتها...')
                        .addOptions(options)
                );

                await i.update({ content: `🪄 **إدارة تأثيرات ${targetUser}:**\nاختر التأثير الذي تريد تصفيره وإزالته:`, embeds: [], components: [buffMenu] });

                const buffCollector = interaction.channel.createMessageComponentCollector({ filter: subI => subI.user.id === i.user.id && subI.customId.startsWith('mod_rm_buff_'), time: 60000 });

                buffCollector.on('collect', async subI => {
                    await subI.deferUpdate();
                    const selectedVal = subI.values[0];
                    
                    if (selectedVal === 'rmbuff_all') {
                        // 🔥 الحماية: يمسح فقط الأشياء المؤقتة (الخبرة، المورا، النزاع) لكي لا يطير عامل المزرعة أو التعزيز المخفي 🔥
                        await safeQuery(db, `DELETE FROM user_buffs WHERE "userID" = $1 AND "guildID" = $2 AND "buffType" IN ('xp', 'mora', 'pvp_wounded')`, [userID, guildID]);
                        await subI.editReply({ content: `✅ **تمت إزالة جميع التعزيزات واللعنات المؤقتة (الخبرة والمورا) لـ ${targetUser} وتصفيرها بالكامل بنجاح!**`, components: [] });
                    } else {
                        const buffType = selectedVal.replace('rmbuff_', '');
                        await safeQuery(db, `DELETE FROM user_buffs WHERE "userID" = $1 AND "guildID" = $2 AND "buffType" = $3`, [userID, guildID, buffType]);
                        await subI.editReply({ content: `✅ **تمت إزالة تأثير (${buffType}) وتصفيره بنجاح!**`, components: [] });
                    }
                    buffCollector.stop();
                });
            }
            else if (val === 'swap_accounts') {
                const modalId = `mod_swap_${Date.now()}`;
                const modal = new ModalBuilder().setCustomId(modalId).setTitle('تبديل ونقل الحسابات');
                const id1Input = new TextInputBuilder().setCustomId('swap_id1').setLabel('آيدي الحساب الأول').setStyle(TextInputStyle.Short).setRequired(true);
                const id2Input = new TextInputBuilder().setCustomId('swap_id2').setLabel('آيدي الحساب الثاني (سيتبادل معه)').setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(id1Input), new ActionRowBuilder().addComponents(id2Input));
                await i.showModal(modal);

                try {
                    const modalSubmit = await i.awaitModalSubmit({ filter: sub => sub.customId === modalId && sub.user.id === i.user.id, time: 120000 });
                    await modalSubmit.deferReply({ flags: [MessageFlags.Ephemeral] });

                    const id1 = modalSubmit.fields.getTextInputValue('swap_id1').trim();
                    const id2 = modalSubmit.fields.getTextInputValue('swap_id2').trim();

                    if (id1 === id2) return modalSubmit.editReply("❌ الآيديات متطابقة.");

                    const ud1 = await client.getLevel(id1, guildID);
                    const ud2 = await client.getLevel(id2, guildID);
                    const tempId = `TEMP_${Date.now()}`;

                    const swapAnyColumn = async (tableName, targetCol, gCol = 'guildID', idColFormat = null) => {
                        let id1_pk = idColFormat === 1 ? `${guildID}-${id1}` : null;
                        let id2_pk = idColFormat === 1 ? `${guildID}-${id2}` : null;
                        let temp_pk = idColFormat === 1 ? `${guildID}-${tempId}` : null;

                        try {
                            if(idColFormat) {
                                await safeQuery(db, `UPDATE ${tableName} SET "${targetCol}" = $1, "id" = $4 WHERE "${targetCol}" = $2 AND "${gCol}" = $3`, [tempId, id1, guildID, temp_pk]);
                                await safeQuery(db, `UPDATE ${tableName} SET "${targetCol}" = $1, "id" = $4 WHERE "${targetCol}" = $2 AND "${gCol}" = $3`, [id1, id2, guildID, id1_pk]);
                                await safeQuery(db, `UPDATE ${tableName} SET "${targetCol}" = $1, "id" = $4 WHERE "${targetCol}" = $2 AND "${gCol}" = $3`, [id2, tempId, guildID, id2_pk]);
                            } else {
                                await safeQuery(db, `UPDATE ${tableName} SET "${targetCol}" = $1 WHERE "${targetCol}" = $2 AND "${gCol}" = $3`, [tempId, id1, guildID]);
                                await safeQuery(db, `UPDATE ${tableName} SET "${targetCol}" = $1 WHERE "${targetCol}" = $2 AND "${gCol}" = $3`, [id1, id2, guildID]);
                                await safeQuery(db, `UPDATE ${tableName} SET "${targetCol}" = $1 WHERE "${targetCol}" = $2 AND "${gCol}" = $3`, [id2, tempId, guildID]);
                            }
                        } catch(e) {}
                    };

                    await db.query('BEGIN');
                    await swapAnyColumn('levels', 'user', 'guild', 1);
                    await swapAnyColumn('user_inventory', 'userID');
                    await swapAnyColumn('user_portfolio', 'userID');
                    await swapAnyColumn('user_farm', 'userID');
                    await swapAnyColumn('user_lands', 'userID');
                    await swapAnyColumn('user_achievements', 'userID');
                    await swapAnyColumn('user_reputation', 'userID');
                    await swapAnyColumn('user_weapons', 'userID');
                    await swapAnyColumn('user_skills', 'userID');
                    await swapAnyColumn('dungeon_stats', 'userID');
                    await swapAnyColumn('streaks', 'userID', 'guildID', 1);
                    await swapAnyColumn('media_streaks', 'userID', 'guildID', 1);
                    await swapAnyColumn('user_buffs', 'userID');
                    await swapAnyColumn('user_loans', 'userID');
                    await swapAnyColumn('marriages', 'userID');
                    await swapAnyColumn('marriages', 'partnerID');
                    await swapAnyColumn('children', 'parentID');
                    await swapAnyColumn('children', 'childID');
                    await db.query('COMMIT');
                    
                    if (client.levelCache) {
                        client.levelCache.delete(`${guildID}-${id1}`);
                        client.levelCache.delete(`${guildID}-${id2}`);
                    }
                    if (typeof client.setLevel === 'function') {
                        if (ud1) await client.setLevel({ ...ud1, user: id2, id: `${guildID}-${id2}` });
                        if (ud2) await client.setLevel({ ...ud2, user: id1, id: `${guildID}-${id1}` });
                    }

                    await modalSubmit.editReply({ content: `✅ **تم نقل وتبديل البيانات بنجاح!**` });
                } catch(e) { 
                    await db.query('ROLLBACK').catch(()=>{});
                    await i.followUp({content: "❌ حدث خطأ.", flags: [MessageFlags.Ephemeral]}).catch(()=>{});
                }
            }
            // 🔥 إضافة التأكيد للإخلاء والتصفير 🔥
            else if (val === 'set_king' || val === 'empty_king') {
                const isEmpting = val === 'empty_king';
                
                if (isEmpting) {
                    await i.deferUpdate();
                    const confirm = await confirmAction(i, 'إخلاء عرش ملك', `هل أنت متأكد أنك تريد إخلاء وطرد الملك وتصفير نقاط هذا العرش بالكامل لليوم؟`);
                    if (!confirm) return;
                }
                
                const kingMenu = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId(`mod_king_${Date.now()}`)
                        .setPlaceholder(isEmpting ? '🗑️ اختر العرش لإخلائه وتصفيره...' : '👑 اختر العرش لتقليده إياه...')
                        .addOptions([
                            { label: 'ملك الكازينو', value: 'roleCasinoKing', emoji: '🎰' },
                            { label: 'ملك الهاوية', value: 'roleAbyss', emoji: '🌑' },
                            { label: 'ملك البلاغة', value: 'roleChatter', emoji: '🗣️' },
                            { label: 'ملك الكرم', value: 'rolePhilanthropist', emoji: '🤝' },
                            { label: 'ملك اللصوص', value: 'roleThief', emoji: '🥷' }, 
                            { label: 'ملك الصوت', value: 'roleVoice', emoji: '🎙️' }, 
                            { label: 'ملك القنص', value: 'roleFisherKing', emoji: '🎣' },
                            { label: 'ملك النزاع', value: 'rolePvPKing', emoji: '⚔️' }
                        ])
                );
                
                if (isEmpting) {
                    await i.editReply({ content: `🗑️ **اختر العرش الذي تريد إخلائه بالكامل:**`, embeds: [], components: [kingMenu] });
                } else {
                    await i.update({ content: `👑 **اختر اللقب الذي تريد إعطاءه لـ ${targetUser}:**`, embeds: [], components: [kingMenu] });
                }

                const kingCollector = i.channel.createMessageComponentCollector({ filter: subI => subI.user.id === i.user.id && subI.customId.startsWith('mod_king_'), time: 60000 });
                
                kingCollector.on('collect', async subI => {
                    await subI.deferUpdate();
                    let selectedRoleColumn = subI.values[0];
                    
                    let settingsRes = await safeQuery(db, `SELECT "${selectedRoleColumn}" FROM settings WHERE "guild" = $1`, [guildID]);
                    let roleId = settingsRes.rows[0] ? (settingsRes.rows[0][selectedRoleColumn] || settingsRes.rows[0][selectedRoleColumn.toLowerCase()]) : null;

                    if (!roleId && selectedRoleColumn === 'roleVoice') {
                        settingsRes = await safeQuery(db, `SELECT "roleVoiceKing" FROM settings WHERE "guild" = $1`, [guildID]);
                        roleId = settingsRes.rows[0] ? (settingsRes.rows[0]['roleVoiceKing'] || settingsRes.rows[0]['rolevoiceking']) : null;
                    }

                    if (!roleId) return await subI.editReply({ content: `❌ لم يتم إعداد رتبة لهذا الملك في إعدادات السيرفر.`, components: [] });

                    const targetRole = i.guild.roles.cache.get(roleId);
                    if (!targetRole) return await subI.editReply({ content: `❌ الرتبة المطلوبة غير موجودة في السيرفر.`, components: [] });

                    const todayStr = getTodayDateString();
                    const statName = kingStatsMap[selectedRoleColumn] || kingStatsMap['roleVoice'];

                    if (isEmpting) {
                        targetRole.members.forEach(async (member) => {
                            await member.roles.remove(targetRole).catch(() => {});
                        });

                        if (selectedRoleColumn === 'roleCasinoKing') {
                            await safeQuery(db, `UPDATE kings_board_tracker SET "casino_profit" = 0, "mora_earned" = 0 WHERE "guildID" = $1 AND "date" = $2`, [guildID, todayStr]);
                        } else {
                            await safeQuery(db, `UPDATE kings_board_tracker SET "${statName}" = 0 WHERE "guildID" = $1 AND "date" = $2`, [guildID, todayStr]);
                        }

                        await subI.editReply({ content: `🗑️ **تم إخلاء عرش (${targetRole.name}) وتصفير جميع نقاطه لليوم بنجاح!**`, components: [] });
                    } else {
                        let currentMax = 0;
                        if (selectedRoleColumn === 'roleCasinoKing') {
                            const res = await safeQuery(db, `SELECT SUM(COALESCE("casino_profit", 0) + COALESCE("mora_earned", 0)) as val FROM kings_board_tracker WHERE "guildID" = $1 AND "date" = $2 GROUP BY "userID" ORDER BY val DESC LIMIT 1`, [guildID, todayStr]);
                            currentMax = res.rows[0] ? Number(res.rows[0].val) : 0;
                        } else if (selectedRoleColumn === 'roleAbyss') {
                            const res = await safeQuery(db, `SELECT "dungeon_floor" as val FROM kings_board_tracker WHERE "guildID" = $1 AND "date" = $2 ORDER BY "dungeon_floor" DESC LIMIT 1`, [guildID, todayStr]);
                            currentMax = res.rows[0] ? Number(res.rows[0].val) : 0;
                        } else {
                            const res = await safeQuery(db, `SELECT SUM(COALESCE("${statName}", 0)) as val FROM kings_board_tracker WHERE "guildID" = $1 AND "date" = $2 GROUP BY "userID" ORDER BY val DESC LIMIT 1`, [guildID, todayStr]);
                            currentMax = res.rows[0] ? Number(res.rows[0].val) : 0;
                        }

                        const newVal = currentMax + 2; 
                        const trackerId = `${userID}-${guildID}-${todayStr}`;

                        await safeQuery(db, `
                            INSERT INTO kings_board_tracker ("id", "userID", "guildID", "date", "${statName}") 
                            VALUES ($1, $2, $3, $4, $5)
                            ON CONFLICT("id") DO UPDATE SET "${statName}" = GREATEST(kings_board_tracker."${statName}", $5)
                        `, [trackerId, userID, guildID, todayStr, newVal]);

                        targetRole.members.forEach(async (member) => {
                            if (member.id !== userID) await member.roles.remove(targetRole).catch(() => {});
                        });

                        if (!targetMember.roles.cache.has(roleId)) {
                            await targetMember.roles.add(targetRole).catch(() => {});
                        }

                        await subI.editReply({ content: `👑 **تم تتويج ${targetUser} بلقب (${targetRole.name}) لليوم!**\nسيتم سحب الرتبة وتصفير المنافسة غداً لبدء سباق جديد.`, components: [] });
                    }
                    kingCollector.stop();
                });
            }
            else if (val === 'reputation') {
                const modalId = `mod_rep_${Date.now()}`;
                const modal = new ModalBuilder().setCustomId(modalId).setTitle('إدارة السمعة (النقاط)');
                const actionInput = new TextInputBuilder().setCustomId('rep_action').setLabel('الإجراء (اضافة / خصم / تحديد)').setStyle(TextInputStyle.Short).setRequired(true);
                const amountInput = new TextInputBuilder().setCustomId('rep_amount').setLabel('النقاط (أرقام فقط)').setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(actionInput), new ActionRowBuilder().addComponents(amountInput));
                await i.showModal(modal);

                try {
                    const modalSubmit = await i.awaitModalSubmit({ filter: sub => sub.customId === modalId && sub.user.id === i.user.id, time: 120000 });
                    await modalSubmit.deferReply({ flags: [MessageFlags.Ephemeral] });

                    const action = normalize(modalSubmit.fields.getTextInputValue('rep_action'));
                    const amount = parseInt(modalSubmit.fields.getTextInputValue('rep_amount'));
                    if (isNaN(amount) || amount < 0) return modalSubmit.editReply({ content: "❌ الرجاء إدخال رقم صحيح وموجب." });

                    const repDataRes = await safeQuery(db, `SELECT "rep_points" FROM user_reputation WHERE "userID" = $1 AND "guildID" = $2`, [userID, guildID]);
                    let currentPoints = repDataRes.rows[0] ? Number(repDataRes.rows[0].rep_points || repDataRes.rows[0].rep_Points || 0) : 0;
                    let newPoints = currentPoints;

                    if (action.includes('اضاف') || action.includes('زود')) newPoints += amount;
                    else if (action.includes('خصم') || action.includes('نقص') || action.includes('ازال')) newPoints = Math.max(0, newPoints - amount);
                    else if (action.includes('تحديد') || action.includes('حط')) newPoints = amount;
                    else return modalSubmit.editReply({ content: "❌ إجراء غير معروف. استعمل (إضافة/خصم/تحديد)." });

                    await safeQuery(db, `
                        INSERT INTO user_reputation ("userID", "guildID", "rep_points") VALUES ($1, $2, $3)
                        ON CONFLICT("userID", "guildID") DO UPDATE SET "rep_points" = EXCLUDED."rep_points"
                    `, [userID, guildID, newPoints]);

                    await modalSubmit.editReply({ content: `✅ تم ضبط سمعة ${targetUser} لتصبح **${newPoints}** 🌟` });
                } catch(e) {}
            }
            else if (val === 'rep_chances') {
                const modalId = `mod_repchan_${Date.now()}`;
                const modal = new ModalBuilder().setCustomId(modalId).setTitle('منح فرص تزكية');
                const amountInput = new TextInputBuilder().setCustomId('repchan_amount').setLabel('عدد الفرص الإضافية (أرقام فقط)').setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(amountInput));
                await i.showModal(modal);

                try {
                    const modalSubmit = await i.awaitModalSubmit({ filter: sub => sub.customId === modalId && sub.user.id === i.user.id, time: 120000 });
                    await modalSubmit.deferReply({ flags: [MessageFlags.Ephemeral] });

                    const amount = parseInt(modalSubmit.fields.getTextInputValue('repchan_amount'));
                    if (isNaN(amount) || amount <= 0) return modalSubmit.editReply({ content: "❌ الرجاء إدخال رقم صحيح وموجب." });

                    const todayDateStr = new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Riyadh' });
                    try { await db.query(`ALTER TABLE user_reputation ADD COLUMN IF NOT EXISTS "daily_reps_given" INTEGER DEFAULT 0`); } catch(e) {}

                    await safeQuery(db, `
                        INSERT INTO user_reputation ("userID", "guildID", "last_rep_given", "daily_reps_given") 
                        VALUES ($1, $2, $3, $4)
                        ON CONFLICT("userID", "guildID") DO UPDATE SET "last_rep_given" = $3, "daily_reps_given" = COALESCE(user_reputation."daily_reps_given", 0) - $5
                    `, [userID, guildID, todayDateStr, -amount, amount]);

                    await modalSubmit.editReply({ content: `✅ تم منح **${amount}** فرصة تزكية إضافية لـ ${targetUser} بنجاح! يمكنه استخدامها الآن. 🗳️` });
                } catch(e) {}
            }
            else if (val === 'tickets') {
                const modalId = `mod_tkt_${Date.now()}`;
                const modal = new ModalBuilder().setCustomId(modalId).setTitle('إدارة تذاكر الدانجون');
                const amountInput = new TextInputBuilder().setCustomId('tkt_amount').setLabel('الكمية للإضافة').setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(amountInput));
                await i.showModal(modal);

                try {
                    const modalSubmit = await i.awaitModalSubmit({ filter: sub => sub.customId === modalId && sub.user.id === i.user.id, time: 120000 });
                    await modalSubmit.deferReply({ flags: [MessageFlags.Ephemeral] });

                    const amount = parseInt(modalSubmit.fields.getTextInputValue('tkt_amount'));
                    if (isNaN(amount)) return modalSubmit.editReply({ content: "❌ الرجاء إدخال رقم صحيح." });

                    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' });
                    
                    await safeQuery(db, `
                        INSERT INTO dungeon_stats ("guildID", "userID", "tickets", "last_reset") VALUES ($1, $2, $3, $4)
                        ON CONFLICT("guildID", "userID") DO UPDATE SET "tickets" = COALESCE(dungeon_stats."tickets", 0) + $3
                    `, [guildID, userID, amount, todayStr]); 
                    
                    await modalSubmit.editReply({ content: `✅ تم إضافة **${amount}** 🎟️ تذاكر لـ ${targetUser}.` });
                } catch(e) {}
            }
            else if (val === 'dungeon_tent') {
                const modalId = `mod_tent_${Date.now()}`;
                const modal = new ModalBuilder().setCustomId(modalId).setTitle('إعداد طابق الدانجون (الخيمة)');
                const floorInput = new TextInputBuilder().setCustomId('tent_floor').setLabel('رقم الطابق المراد حفظه كـ (Checkpoint)').setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(floorInput));
                await i.showModal(modal);

                try {
                    const modalSubmit = await i.awaitModalSubmit({ filter: sub => sub.customId === modalId && sub.user.id === i.user.id, time: 120000 });
                    await modalSubmit.deferReply({ flags: [MessageFlags.Ephemeral] });

                    const floor = parseInt(modalSubmit.fields.getTextInputValue('tent_floor'));
                    if (isNaN(floor) || floor < 0) return modalSubmit.editReply({ content: "❌ الرجاء إدخال رقم طابق صحيح." });

                    await safeQuery(db, `INSERT INTO levels ("user", "guild", "xp", "totalXP", "level", "mora", "max_dungeon_floor") VALUES ($1, $2, 0, 0, 1, 0, $3) ON CONFLICT ("user", "guild") DO UPDATE SET "max_dungeon_floor" = $3`, [userID, guildID, floor]);

                    await modalSubmit.editReply({ content: `✅ تم نصب خيمة الحفظ لـ ${targetUser} في **الطابق ${floor}** من الدانجون ⛺.` });
                } catch(e) {}
            }
            // 🔥 إضافة التأكيد لتصفير القتال 🔥
            else if (val === 'reset_combat') {
                await i.deferUpdate();
                const confirm = await confirmAction(i, 'تصفير الأسلحة والمهارات', `هل أنت متأكد من مسح جميع أسلحة ومهارات **${targetUser.username}** القتالية بشكل نهائي؟`);
                if (!confirm) return;
                
                await safeQuery(db, `DELETE FROM user_weapons WHERE "userID" = $1 AND "guildID" = $2`, [userID, guildID]);
                await safeQuery(db, `DELETE FROM user_skills WHERE "userID" = $1 AND "guildID" = $2`, [userID, guildID]);
                
                const summaryEmbed = await getGearSummaryEmbed(userID, guildID, db, targetUser);
                await i.editReply({ content: `🗑️ ✅ تم تصفير جميع الأسلحة والمهارات القتالية لـ ${targetUser} بنجاح!`, embeds: [summaryEmbed], components: [] });
            }
            else if (val === 'combat_gear') {
                const modalId = `mod_gear_${Date.now()}`;
                const modal = new ModalBuilder().setCustomId(modalId).setTitle('تعديل معدات القتال بذكاء');
                const typeInput = new TextInputBuilder().setCustomId('gear_type').setLabel('النوع (سلاح / مهارة)').setStyle(TextInputStyle.Short).setRequired(true);
                const nameInput = new TextInputBuilder().setCustomId('gear_name').setLabel('اسم المهارة (أو اسم العرق لتعديل السلاح)').setStyle(TextInputStyle.Short).setRequired(false);
                const levelInput = new TextInputBuilder().setCustomId('gear_level').setLabel('المستوى الجديد (أرقام فقط - 0 للحذف)').setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(typeInput), new ActionRowBuilder().addComponents(nameInput), new ActionRowBuilder().addComponents(levelInput));
                await i.showModal(modal);

                try {
                    const modalSubmit = await i.awaitModalSubmit({ filter: sub => sub.customId === modalId && sub.user.id === i.user.id, time: 120000 });
                    await modalSubmit.deferReply({ flags: [MessageFlags.Ephemeral] });

                    const type = normalize(modalSubmit.fields.getTextInputValue('gear_type'));
                    const name = modalSubmit.fields.getTextInputValue('gear_name');
                    const level = parseInt(modalSubmit.fields.getTextInputValue('gear_level'));
                    
                    if (isNaN(level) || level < 0) return modalSubmit.editReply({ content: "❌ مستوى غير صالح." });

                    let successMessage = "";

                    if (type.includes('سلاح')) {
                        let raceName = null;
                        
                        if (name && name.trim().length > 1) {
                            const searchRace = normalize(name);
                            const foundConf = weaponsConfig.find(w => normalize(w.race).includes(searchRace));
                            if (foundConf) raceName = foundConf.race;
                        }
                        
                        if (!raceName) {
                            const userRace = await getUserRace(targetMember, db);
                            if (userRace) raceName = userRace.raceName || userRace.racename;
                        }
                        
                        if (!raceName) return modalSubmit.editReply({ content: "❌ لم يتم تحديد عرق للبحث، وهذا اللاعب لا يمتلك رتبة عرق حالياً. يرجى كتابة اسم العرق في حقل 'الاسم'." });

                        if (level === 0) {
                            await safeQuery(db, `DELETE FROM user_weapons WHERE "userID" = $1 AND "guildID" = $2 AND "raceName" = $3`, [userID, guildID, raceName]);
                            successMessage = `✅ تم إزالة سلاح العرق (${raceName}) لـ ${targetUser}.`;
                        } else {
                            await safeQuery(db, `INSERT INTO user_weapons ("userID", "guildID", "raceName", "weaponLevel") VALUES ($1, $2, $3, $4) ON CONFLICT ("userID", "guildID", "raceName") DO UPDATE SET "weaponLevel" = EXCLUDED."weaponLevel"`, [userID, guildID, raceName, level]);
                            successMessage = `✅ تم إعطاء / ضبط مستوى سلاح (${raceName}) لـ ${targetUser} ليصبح **Lv.${level}**.`;
                        }
                    } 
                    else if (type.includes('مهارة') || type.includes('مهاره')) {
                        if (!name) return modalSubmit.editReply({ content: "❌ يرجى كتابة اسم المهارة." });
                        
                        const searchName = normalize(name);
                        let foundSkill = skillsConfig.find(s => normalize(s.name) === searchName || s.id.toLowerCase() === name.toLowerCase().trim());
                        if (!foundSkill) foundSkill = skillsConfig.find(s => normalize(s.name).includes(searchName));
                        
                        if (!foundSkill) return modalSubmit.editReply({ content: `❌ لم أتمكن من العثور على مهارة تطابق: "${name}"` });
                        
                        const skillId = foundSkill.id;

                        if (level === 0) {
                            await safeQuery(db, `DELETE FROM user_skills WHERE "userID" = $1 AND "guildID" = $2 AND "skillID" = $3`, [userID, guildID, skillId]);
                            successMessage = `✅ تم سحب المهارة (${foundSkill.name}) من ${targetUser}.`;
                        } else {
                            await safeQuery(db, `INSERT INTO user_skills ("userID", "guildID", "skillID", "skillLevel") VALUES ($1, $2, $3, $4) ON CONFLICT ("userID", "guildID", "skillID") DO UPDATE SET "skillLevel" = EXCLUDED."skillLevel"`, [userID, guildID, skillId, level]);
                            successMessage = `✅ تم إعطاء / ضبط مستوى مهارة (${foundSkill.name}) لـ ${targetUser} لتصبح **Lv.${level}**.`;
                        }
                    } else {
                        return modalSubmit.editReply({ content: "❌ نوع غير معروف. اكتب (سلاح) أو (مهارة)." });
                    }

                    const summaryEmbed = await getGearSummaryEmbed(userID, guildID, db, targetUser);
                    await modalSubmit.editReply({ content: successMessage, embeds: [summaryEmbed] });

                } catch(e) {}
            }
            else if (val === 'fishing_gear') {
                const modalId = `mod_fish_${Date.now()}`;
                const modal = new ModalBuilder().setCustomId(modalId).setTitle('إدارة معدات وموقع الصيد');
                const typeInput = new TextInputBuilder().setCustomId('fish_type').setLabel('النوع (سنارة / قارب / مكان)').setStyle(TextInputStyle.Short).setRequired(true);
                const valInput = new TextInputBuilder().setCustomId('fish_val').setLabel('الرقم / اسم المكان (مثال: beach, deep)').setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(typeInput), new ActionRowBuilder().addComponents(valInput));
                await i.showModal(modal);

                try {
                    const modalSubmit = await i.awaitModalSubmit({ filter: sub => sub.customId === modalId && sub.user.id === i.user.id, time: 120000 });
                    await modalSubmit.deferReply({ flags: [MessageFlags.Ephemeral] });

                    const type = normalize(modalSubmit.fields.getTextInputValue('fish_type'));
                    const inputVal = modalSubmit.fields.getTextInputValue('fish_val').toLowerCase().trim();
                    let successMessage = "";

                    if (type.includes('سنارة') || type.includes('صنارة')) {
                        const level = parseInt(inputVal);
                        if (isNaN(level) || level <= 0) return modalSubmit.editReply("❌ مستوى السنارة غير صحيح.");
                        await safeQuery(db, `UPDATE levels SET "rodLevel" = $1 WHERE "user" = $2 AND "guild" = $3`, [level, userID, guildID]);
                        successMessage = `✅ تم ضبط مستوى السنارة لـ ${targetUser} إلى **Lv.${level}**.`;
                    }
                    else if (type.includes('قارب') || type.includes('يخت') || type.includes('سفينة')) {
                        const level = parseInt(inputVal);
                        if (isNaN(level) || level <= 0) return modalSubmit.editReply("❌ مستوى القارب غير صحيح.");
                        await safeQuery(db, `UPDATE levels SET "boatLevel" = $1 WHERE "user" = $2 AND "guild" = $3`, [level, userID, guildID]);
                        successMessage = `✅ تم ضبط مستوى القارب لـ ${targetUser} إلى **Lv.${level}**.`;
                    }
                    else if (type.includes('مكان') || type.includes('شاطئ') || type.includes('موقع')) {
                        const locs = ['beach', 'shallow', 'deep', 'bermuda', 'trench', 'atlantis', 'dark_sea'];
                        if (!locs.includes(inputVal)) return modalSubmit.editReply(`❌ مكان غير صحيح. الأماكن المتاحة:\n${locs.join(', ')}`);
                        
                        await safeQuery(db, `UPDATE levels SET "currentLocation" = $1 WHERE "user" = $2 AND "guild" = $3`, [inputVal, userID, guildID]);
                        successMessage = `✅ تم تغيير مكان الصيد لـ ${targetUser} إلى الشاطئ: **${inputVal}**.`;
                    } else {
                        return modalSubmit.editReply("❌ نوع غير معروف. استخدم (سنارة / قارب / مكان).");
                    }

                    const summaryEmbed = await getGearSummaryEmbed(userID, guildID, db, targetUser);
                    await modalSubmit.editReply({ content: successMessage, embeds: [summaryEmbed] });

                } catch(e) {}
            }
            else if (val === 'items') {
                const modalId = `mod_item_${Date.now()}`;
                const modal = new ModalBuilder().setCustomId(modalId).setTitle('إدارة العناصر الشاملة');
                const actionInput = new TextInputBuilder().setCustomId('itm_action').setLabel('الإجراء (اعطاء / ازالة)').setStyle(TextInputStyle.Short).setRequired(true);
                const nameInput = new TextInputBuilder().setCustomId('itm_name').setLabel('اسم العنصر أو الكود الدقيق').setStyle(TextInputStyle.Short).setRequired(true);
                const qtyInput = new TextInputBuilder().setCustomId('itm_qty').setLabel('الكمية (أرقام فقط)').setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(actionInput), new ActionRowBuilder().addComponents(nameInput), new ActionRowBuilder().addComponents(qtyInput));
                await i.showModal(modal);

                try {
                    const modalSubmit = await i.awaitModalSubmit({ filter: sub => sub.customId === modalId && sub.user.id === i.user.id, time: 120000 });
                    await modalSubmit.deferReply({ flags: [MessageFlags.Ephemeral] });

                    const action = normalize(modalSubmit.fields.getTextInputValue('itm_action'));
                    const name = modalSubmit.fields.getTextInputValue('itm_name');
                    const qty = parseInt(modalSubmit.fields.getTextInputValue('itm_qty')) || 1;

                    const findUniversalItem = (searchQuery) => {
                        const input = normalize(searchQuery);
                        const rawId = searchQuery.toLowerCase().trim();
                        let found = null;

                        found = shopItems.find(i => normalize(i.name) === input || i.id.toLowerCase() === rawId);
                        if (found && !marketItems.some(m => m.id === found.id) && !farmAnimals.some(f => f.id === found.id)) return { ...found, type: 'inventory' };

                        found = marketItems.find(i => normalize(i.name) === input || i.id.toLowerCase() === rawId);
                        if (found) return { ...found, type: 'market' };

                        found = farmAnimals.find(i => normalize(i.name) === input || String(i.id).toLowerCase() === rawId);
                        if (found) return { ...found, type: 'farm' };

                        found = seedsData.find(i => normalize(i.name) === input || String(i.id).toLowerCase() === rawId);
                        if (found) return { ...found, type: 'inventory' };

                        found = feedItems.find(i => normalize(i.name) === input || String(i.id).toLowerCase() === rawId);
                        if (found) return { ...found, type: 'inventory' };

                        if (potionsConfig.length) {
                            found = potionsConfig.find(i => normalize(i.name) === input || i.id.toLowerCase() === rawId);
                            if (found) return { ...found, type: 'inventory' };
                        }

                        if (upgradeMats && upgradeMats.weapon_materials) {
                            for (const race of upgradeMats.weapon_materials) {
                                const mat = race.materials.find(m => normalize(m.name) === input || m.id.toLowerCase() === rawId);
                                if (mat) return { ...mat, type: 'inventory' };
                            }
                        }
                        
                        if (upgradeMats && upgradeMats.skill_books) {
                            for (const cat of upgradeMats.skill_books) {
                                const book = cat.books.find(b => normalize(b.name) === input || b.id.toLowerCase() === rawId);
                                if (book) return { ...book, type: 'inventory' };
                            }
                        }

                        if (fishingConfig.baits) {
                            found = fishingConfig.baits.find(b => normalize(b.name) === input || b.id.toLowerCase() === rawId);
                            if (found) return { ...found, type: 'inventory' };
                        }

                        return null;
                    };

                    const item = findUniversalItem(name);
                    if (!item) return modalSubmit.editReply({ content: `❌ لم يتم العثور على عنصر يطابق: "${name}".\n*(تلميح: يمكنك استخدام الآيدي الخاص بالعنصر أو اسمه كاملاً. يدعم الأرتيفاكت والموارد أيضاً).*` });

                    if (action.includes('اعطاء') || action.includes('اضاف')) {
                        if (item.type === 'market') {
                            let pfItemRes = await safeQuery(db, `SELECT * FROM user_portfolio WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [userID, guildID, item.id]);
                            if (pfItemRes.rows.length > 0) {
                                await safeQuery(db, `UPDATE user_portfolio SET "quantity" = "quantity" + $1 WHERE "userID" = $2 AND "guildID" = $3 AND "itemID" = $4`, [qty, userID, guildID, item.id]);
                            } else {
                                await safeQuery(db, `INSERT INTO user_portfolio ("guildID", "userID", "itemID", "quantity") VALUES ($1, $2, $3, $4)`, [guildID, userID, item.id, qty]);
                            }
                        } else if (item.type === 'farm') {
                            const now = Date.now();
                            await safeQuery(db, `INSERT INTO user_farm ("guildID", "userID", "animalID", "quantity", "purchaseTimestamp", "lastFedTimestamp") VALUES ($1, $2, $3, $4, $5, $6)`, [guildID, userID, item.id, qty, now, now]);
                        } else {
                            let invItemRes = await safeQuery(db, `SELECT * FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [userID, guildID, item.id]);
                            if (invItemRes.rows.length > 0) {
                                await safeQuery(db, `UPDATE user_inventory SET "quantity" = "quantity" + $1 WHERE "userID" = $2 AND "guildID" = $3 AND "itemID" = $4`, [qty, userID, guildID, item.id]);
                            } else {
                                await safeQuery(db, `INSERT INTO user_inventory ("guildID", "userID", "itemID", "quantity") VALUES ($1, $2, $3, $4)`, [guildID, userID, item.id, qty]);
                            }
                        }
                        await modalSubmit.editReply({ content: `✅ تم إضافة **${qty}** × **${item.name}** إلى ${targetUser}.` });
                    } 
                    else if (action.includes('ازال') || action.includes('سحب')) {
                        if (item.type === 'market') {
                            await safeQuery(db, `UPDATE user_portfolio SET "quantity" = GREATEST(0, "quantity" - $1) WHERE "userID" = $2 AND "guildID" = $3 AND "itemID" = $4`, [qty, userID, guildID, item.id]);
                        } else if (item.type === 'farm') {
                            await safeQuery(db, `UPDATE user_farm SET "quantity" = GREATEST(0, "quantity" - $1) WHERE "userID" = $2 AND "guildID" = $3 AND "animalID" = $4`, [qty, userID, guildID, item.id]);
                        } else {
                            await safeQuery(db, `UPDATE user_inventory SET "quantity" = GREATEST(0, "quantity" - $1) WHERE "userID" = $2 AND "guildID" = $3 AND "itemID" = $4`, [qty, userID, guildID, item.id]);
                        }
                        await modalSubmit.editReply({ content: `✅ تم سحب **${qty}** × **${item.name}** من ${targetUser}.` });
                    }
                } catch(e) {}
            }
            // 🔥 إدارة الستريك المتطورة (عادي / ميديا) 🔥
            else if (val === 'manage_streaks') {
                const modalId = `mod_streak_${Date.now()}`;
                const modal = new ModalBuilder().setCustomId(modalId).setTitle('إدارة الستريك والدروع');
                const typeInput = new TextInputBuilder().setCustomId('s_type').setLabel('نوع الستريك (اكتب: عادي أو ميديا)').setStyle(TextInputStyle.Short).setRequired(true);
                const actionInput = new TextInputBuilder().setCustomId('s_action').setLabel('تعديل ماذا؟ (اكتب: ستريك أو درع)').setStyle(TextInputStyle.Short).setRequired(true);
                const amountInput = new TextInputBuilder().setCustomId('s_val').setLabel('القيمة أو العدد').setStyle(TextInputStyle.Short).setRequired(true);
                
                modal.addComponents(new ActionRowBuilder().addComponents(typeInput), new ActionRowBuilder().addComponents(actionInput), new ActionRowBuilder().addComponents(amountInput));
                await i.showModal(modal);

                try {
                    const modalSubmit = await i.awaitModalSubmit({ filter: sub => sub.customId === modalId && sub.user.id === i.user.id, time: 120000 });
                    await modalSubmit.deferReply({ flags: [MessageFlags.Ephemeral] });

                    const typeStr = normalize(modalSubmit.fields.getTextInputValue('s_type'));
                    const actionStr = normalize(modalSubmit.fields.getTextInputValue('s_action'));
                    const valNum = parseInt(modalSubmit.fields.getTextInputValue('s_val'));

                    if (isNaN(valNum) || valNum < 0) return modalSubmit.editReply("❌ يرجى إدخال رقم صحيح للإجراء.");

                    const isMedia = typeStr.includes('ميديا') || typeStr.includes('صور') || typeStr.includes('فيديو');
                    const isShield = actionStr.includes('درع') || actionStr.includes('حماي');

                    const tableName = isMedia ? 'media_streaks' : 'streaks';
                    const colName = isShield ? 'hasItemShield' : 'streakCount';
                    const pkId = `${guildID}-${userID}`;

                    await safeQuery(db, `CREATE TABLE IF NOT EXISTS ${tableName} ("id" TEXT PRIMARY KEY, "guildID" TEXT, "userID" TEXT, "streakCount" BIGINT, "hasItemShield" BIGINT)`);
                    
                    await safeQuery(db, `
                        INSERT INTO ${tableName} ("id", "guildID", "userID", "${colName}") 
                        VALUES ($1, $2, $3, $4) 
                        ON CONFLICT("id") DO UPDATE SET "${colName}" = $4
                    `, [pkId, guildID, userID, valNum]);

                    const kindText = isMedia ? 'الميديا' : 'الشات (العادي)';
                    const actText = isShield ? 'دروع ستريك' : 'أيام ستريك';

                    await modalSubmit.editReply({ content: `✅ تم تعيين **${actText}** (${kindText}) لـ ${targetUser} لتصبح **${valNum}** بنجاح. 🔥🛡️` });
                } catch(e) {}
            }
            // 🔥 إضافة التأكيد لتصفير الحساب بالكامل 🔥
            else if (val === 'reset') {
                await i.deferUpdate();
                const confirm = await confirmAction(i, 'تصفير الحساب بالكامل', `هل أنت متأكد أنك تريد مسح جميع بيانات واقتصاد وأدوات **${targetUser.username}** بشكل لا رجعة فيه؟`);
                if (!confirm) return;

                await safeQuery(db, `DELETE FROM levels WHERE "user" = $1 AND "guild" = $2`, [userID, guildID]);
                await safeQuery(db, `DELETE FROM user_portfolio WHERE "userID" = $1 AND "guildID" = $2`, [userID, guildID]);
                await safeQuery(db, `DELETE FROM user_farm WHERE "userID" = $1 AND "guildID" = $2`, [userID, guildID]);
                await safeQuery(db, `DELETE FROM user_achievements WHERE "userID" = $1 AND "guildID" = $2`, [userID, guildID]);
                await safeQuery(db, `DELETE FROM user_reputation WHERE "userID" = $1 AND "guildID" = $2`, [userID, guildID]);
                await safeQuery(db, `DELETE FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2`, [userID, guildID]);
                await safeQuery(db, `DELETE FROM user_weapons WHERE "userID" = $1 AND "guildID" = $2`, [userID, guildID]);
                await safeQuery(db, `DELETE FROM user_skills WHERE "userID" = $1 AND "guildID" = $2`, [userID, guildID]);
                await safeQuery(db, `DELETE FROM dungeon_stats WHERE "userID" = $1 AND "guildID" = $2`, [userID, guildID]);
                await safeQuery(db, `DELETE FROM streaks WHERE "userID" = $1 AND "guildID" = $2`, [userID, guildID]);
                await safeQuery(db, `DELETE FROM media_streaks WHERE "userID" = $1 AND "guildID" = $2`, [userID, guildID]);
                
                await client.setLevel({ ...client.defaultData, user: userID, guild: guildID });

                await i.editReply({ content: `☢️ **تم تصفير حساب ${targetUser} ومسح جميع بياناته بالكامل!**`, embeds: [], components: [] });
            }
        });
    },

    async sendMarketPanel(message, db) {
        const embed = new EmbedBuilder()
            .setTitle(`📈 لوحة تحكم اقتصاد السيرفر`)
            .setColor(Colors.DarkVividPink)
            .setDescription("الرجاء اختيار الإجراء المطلوب للسوق:");

        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`admin_market_${message.guild.id}`)
                .setPlaceholder('اختر الإجراء...')
                .addOptions([
                    { label: '📉 افتعال انهيار', value: 'crash' },
                    { label: '📈 افتعال انتعاش', value: 'boom' },
                    { label: '⚖️ تعديل حالة السوق', value: 'status', description: 'ركود / ازدهار / طبيعي' },
                    { label: '✏️ تحديد سعر سهم', value: 'price' },
                    { label: '☢️ تصفير السوق الإجباري', value: 'reset_market' }
                ])
        );

        const panelMsg = await message.reply({ embeds: [embed], components: [row] });
        const filter = i => i.user.id === message.author.id;
        const collector = panelMsg.createMessageComponentCollector({ filter, time: 300000 });

        collector.on('collect', async interaction => {
            const val = interaction.values[0];

            if (val === 'crash') {
                const allItemsRes = await safeQuery(db, "SELECT * FROM market_items", []);
                let report = [];
                for (const item of allItemsRes.rows) {
                    if (!REAL_MARKET_IDS.includes(item.id)) continue;
                    const dropPercent = (Math.random() * 0.20) + 0.20; 
                    
                    const oldPrice = Number(item.currentPrice || item.currentprice) || 100;
                    const newPrice = Math.max(10, Math.floor(oldPrice * (1 - dropPercent)));
                    const changePercent = ((newPrice - oldPrice) / oldPrice).toFixed(4); // حساب دقيق
                    
                    // 🔥 تحديث سجل الرسم البياني فوراً 🔥
                    let pHistory = [];
                    try { pHistory = JSON.parse(item.priceHistory || item.pricehistory || '[]'); } catch(e) {}
                    if (!Array.isArray(pHistory)) pHistory = [oldPrice];
                    pHistory.push(newPrice);
                    if (pHistory.length > 25) pHistory.shift();
                    
                    try { await db.query(`ALTER TABLE market_items ADD COLUMN IF NOT EXISTS "lastPrice" BIGINT DEFAULT 0`); } catch(e){}
                    try { await db.query(`ALTER TABLE market_items ADD COLUMN IF NOT EXISTS "priceHistory" TEXT DEFAULT '[]'`); } catch(e){}

                    await safeQuery(db, `UPDATE market_items SET "currentPrice" = $1, "lastChangePercent" = $2, "lastPrice" = $3, "priceHistory" = $4 WHERE "id" = $5`, [newPrice, changePercent, oldPrice, JSON.stringify(pHistory), item.id]);
                    
                    report.push(`${item.name || item.id}: ${oldPrice} ➔ ${newPrice}`);
                }
                await interaction.reply({ content: `📉 **انهيار السوق!**\n\`\`\`\n${report.join('\n')}\n\`\`\``, flags: [MessageFlags.Ephemeral] });
            }
            else if (val === 'boom') {
                const allItemsRes = await safeQuery(db, "SELECT * FROM market_items", []);
                let report = [];
                for (const item of allItemsRes.rows) {
                    if (!REAL_MARKET_IDS.includes(item.id)) continue;
                    const risePercent = (Math.random() * 0.20) + 0.15; 
                    
                    const oldPrice = Number(item.currentPrice || item.currentprice) || 100;
                    const newPrice = Math.floor(oldPrice * (1 + risePercent));
                    const changePercent = ((newPrice - oldPrice) / oldPrice).toFixed(4); // حساب دقيق
                    
                    // 🔥 تحديث سجل الرسم البياني فوراً 🔥
                    let pHistory = [];
                    try { pHistory = JSON.parse(item.priceHistory || item.pricehistory || '[]'); } catch(e) {}
                    if (!Array.isArray(pHistory)) pHistory = [oldPrice];
                    pHistory.push(newPrice);
                    if (pHistory.length > 25) pHistory.shift();

                    try { await db.query(`ALTER TABLE market_items ADD COLUMN IF NOT EXISTS "lastPrice" BIGINT DEFAULT 0`); } catch(e){}
                    try { await db.query(`ALTER TABLE market_items ADD COLUMN IF NOT EXISTS "priceHistory" TEXT DEFAULT '[]'`); } catch(e){}

                    await safeQuery(db, `UPDATE market_items SET "currentPrice" = $1, "lastChangePercent" = $2, "lastPrice" = $3, "priceHistory" = $4 WHERE "id" = $5`, [newPrice, changePercent, oldPrice, JSON.stringify(pHistory), item.id]);
                    
                    report.push(`${item.name || item.id}: ${oldPrice} ➔ ${newPrice}`);
                }
                await interaction.reply({ content: `📈 **انتعاش السوق!**\n\`\`\`\n${report.join('\n')}\n\`\`\``, flags: [MessageFlags.Ephemeral] });
            }
            else if (val === 'status') {
                const modalId = `mod_mrkt_status_${Date.now()}`;
                const modal = new ModalBuilder().setCustomId(modalId).setTitle('حالة السوق');
                const statInput = new TextInputBuilder().setCustomId('m_status').setLabel('اكتب: ركود أو ازدهار أو طبيعي').setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(statInput));
                await interaction.showModal(modal);

                try {
                    const modalSubmit = await interaction.awaitModalSubmit({ filter: i => i.customId === modalId && i.user.id === message.author.id, time: 120000 });
                    await modalSubmit.deferReply({ flags: [MessageFlags.Ephemeral] });

                    const status = normalize(modalSubmit.fields.getTextInputValue('m_status'));
                    let statusKey = 'normal';
                    if (status.includes('ركود')) statusKey = 'recession';
                    if (status.includes('ازدهار')) statusKey = 'boom';
                    
                    await safeQuery(db, `INSERT INTO settings ("guild") VALUES ($1) ON CONFLICT ("guild") DO NOTHING`, [message.guild.id]);
                    await safeQuery(db, `UPDATE settings SET "marketStatus" = $1 WHERE "guild" = $2`, [statusKey, message.guild.id]);

                    await modalSubmit.editReply({ content: `✅ تم ضبط حالة السوق على: **${statusKey}**` });
                } catch(e) {}
            }
            else if (val === 'price') {
                const modalId = `mod_mrkt_price_${Date.now()}`;
                const modal = new ModalBuilder().setCustomId(modalId).setTitle('تحديد السعر');
                const nameInput = new TextInputBuilder().setCustomId('m_name').setLabel('اسم السهم أو الكود').setStyle(TextInputStyle.Short).setRequired(true);
                const priceInput = new TextInputBuilder().setCustomId('m_price').setLabel('السعر الجديد').setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(nameInput), new ActionRowBuilder().addComponents(priceInput));
                await interaction.showModal(modal);

                try {
                    const modalSubmit = await interaction.awaitModalSubmit({ filter: i => i.customId === modalId && i.user.id === message.author.id, time: 120000 });
                    await modalSubmit.deferReply({ flags: [MessageFlags.Ephemeral] });

                    const itemID = modalSubmit.fields.getTextInputValue('m_name');
                    const price = parseInt(modalSubmit.fields.getTextInputValue('m_price'));
                    
                    const item = marketItems.find(i => normalize(i.name) === normalize(itemID) || i.id.toLowerCase() === itemID.toLowerCase().trim());
                    if (!item) return modalSubmit.editReply({ content: "❌ السهم غير موجود." });

                    let dbItemRes = await safeQuery(db, `SELECT * FROM market_items WHERE "id" = $1`, [item.id]);
                    const dbItem = dbItemRes.rows[0];
                    const oldPrice = dbItem ? Number(dbItem.currentPrice || dbItem.currentprice) : item.price;
                    const changePercent = oldPrice > 0 ? ((price - oldPrice) / oldPrice).toFixed(4) : 0;
                    
                    // 🔥 تحديث سجل الرسم البياني للسهم المعدل يدوياً ليتفاعل الخط فوراً 🔥
                    let pHistory = [];
                    try { pHistory = JSON.parse(dbItem.priceHistory || dbItem.pricehistory || '[]'); } catch(e) {}
                    if (!Array.isArray(pHistory)) pHistory = [oldPrice];
                    pHistory.push(price);
                    if (pHistory.length > 25) pHistory.shift();

                    try { await db.query(`ALTER TABLE market_items ADD COLUMN IF NOT EXISTS "lastPrice" BIGINT DEFAULT 0`); } catch(e){}
                    try { await db.query(`ALTER TABLE market_items ADD COLUMN IF NOT EXISTS "priceHistory" TEXT DEFAULT '[]'`); } catch(e){}

                    await safeQuery(db, `UPDATE market_items SET "currentPrice" = $1, "lastChangePercent" = $2, "lastPrice" = $3, "priceHistory" = $4 WHERE "id" = $5`, [price, changePercent, oldPrice, JSON.stringify(pHistory), item.id]);

                    await modalSubmit.editReply({ content: `✅ تم ضبط سعر **${item.name}** إلى **${price}** (سيتم تحديث الرسم البياني الآن!)` });
                } catch(e) {}
            }
            // 🔥 إضافة التأكيد لتصفير السوق الإجباري 🔥
            else if (val === 'reset_market') {
                await interaction.deferUpdate();
                const confirm = await confirmAction(interaction, 'تصفير السوق الإجباري', `هل أنت متأكد أنك تريد إرجاع جميع أسعار الأسهم إلى السعر الافتراضي ومسح تاريخ التداول بالكامل؟`);
                if (!confirm) return;

                // تصفير السوق واسترجاع الأسعار الأساسية من الكونفيج
                for (const item of marketItems) {
                    await safeQuery(db, `UPDATE market_items SET "currentPrice" = $1, "lastPrice" = $1, "lastChangePercent" = 0, "priceHistory" = '[]' WHERE "id" = $2`, [item.price, item.id]);
                }
                
                await interaction.editReply({ content: `☢️ **تم مسح سجلات السوق وإعادة أسعار جميع الأسهم للوضع الافتراضي بنجاح!**`, embeds: [], components: [] });
            }
        });
    },

    async checkUser(interaction, client, db, targetUser) {
        try { await interaction.deferReply({ flags: [MessageFlags.Ephemeral] }); } catch(e){}

        const guildID = interaction.guild.id;
        const userID = targetUser.id;

        let userData = await client.getLevel(userID, guildID) || {};
        
        let streakDataRes = await safeQuery(db, `SELECT * FROM streaks WHERE "guildID" = $1 AND "userID" = $2`, [guildID, userID]);
        let streakData = streakDataRes.rows[0] || {};
        
        let mediaStreakDataRes = await safeQuery(db, `SELECT * FROM media_streaks WHERE "guildID" = $1 AND "userID" = $2`, [guildID, userID]);
        let mediaStreakData = mediaStreakDataRes.rows[0] || {};
        
        let repDataRes = await safeQuery(db, `SELECT "rep_points" FROM user_reputation WHERE "guildID" = $1 AND "userID" = $2`, [guildID, userID]);
        let repData = repDataRes.rows[0] || { rep_points: 0 };
        
        let portfolioRes = await safeQuery(db, `SELECT * FROM user_portfolio WHERE "guildID" = $1 AND "userID" = $2`, [guildID, userID]);
        let portfolio = portfolioRes.rows || [];
        
        let achievementsRes = await safeQuery(db, `SELECT "achievementID" FROM user_achievements WHERE "guildID" = $1 AND "userID" = $2`, [guildID, userID]);
        let achievements = achievementsRes.rows || [];
        
        let dungeonStatsRes = await safeQuery(db, `SELECT "tickets" FROM dungeon_stats WHERE "guildID" = $1 AND "userID" = $2`, [guildID, userID]);
        let dungeonStats = dungeonStatsRes.rows[0];
        let tickets = dungeonStats ? (dungeonStats.tickets || dungeonStats.Tickets || 0) : 0;

        const embed = new EmbedBuilder()
            .setTitle(`📋 تقرير فحص: ${targetUser.username}`)
            .setThumbnail(targetUser.displayAvatarURL())
            .setColor(Colors.Green)
            .addFields(
                { name: '💰 الاقتصاد', value: `مورا: **${(parseInt(userData.mora) || 0).toLocaleString()}**\nبنك: **${(parseInt(userData.bank) || 0).toLocaleString()}**\nXP: **${(parseInt(userData.xp) || 0).toLocaleString()}** (Lv. ${userData.level || 1})`, inline: true },
                { name: '🌟 السمعة والتذاكر', value: `السمعة: **${repData.rep_points || repData.rep_Points || 0}**\nالتذاكر: **${tickets}**`, inline: true },
                { name: '🔥 الستريك', value: `شات: **${streakData.streakCount || streakData.streakcount || 0}** (Shield: ${streakData.hasItemShield || streakData.hasitemshield ? '✅' : '❌'})\nميديا: **${mediaStreakData.streakCount || mediaStreakData.streakcount || 0}** (Shield: ${mediaStreakData.hasItemShield || mediaStreakData.hasitemshield ? '✅' : '❌'})`, inline: true },
                { name: '📈 المحفظة', value: portfolio.length > 0 ? portfolio.map(p => `${p.itemID || p.itemid}: ${p.quantity || p.Quantity}`).join(', ') : 'لا يوجد', inline: false },
                { name: '🏆 الإنجازات', value: `مكتمل: **${achievements.length}**`, inline: true }
            );

        await interaction.editReply({ embeds: [embed] });
    }
};
