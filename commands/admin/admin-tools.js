const { SlashCommandBuilder, PermissionsBitField, EmbedBuilder, Colors, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require('discord.js');
const shopItems = require('../../json/shop-items.json');
const farmAnimals = require('../../json/farm-animals.json');
const seedsData = require('../../json/seeds.json');
const feedItems = require('../../json/feed-items.json');
const marketItems = require('../../json/market-items.json');
const questsConfig = require('../../json/quests-config.json');
const weaponsConfig = require('../../json/weapons-config.json');
const skillsConfig = require('../../json/skills-config.json');

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

async function getUserRace(member, db) {
    if (!member || !member.guild) return null;
    let allRaceRoles = [];
    try {
        const res = await db.query(`SELECT "roleID", "raceName" FROM race_roles WHERE "guildID" = $1`, [member.guild.id]);
        allRaceRoles = res.rows;
    } catch (e) {
        const res = await db.query(`SELECT roleid, racename FROM race_roles WHERE guildid = $1`, [member.guild.id]).catch(()=>({rows:[]}));
        allRaceRoles = res.rows;
    }
    if (!member.roles || !member.roles.cache) return null;
    const userRoleIDs = member.roles.cache.map(r => r.id);
    return allRaceRoles.find(r => userRoleIDs.includes(r.roleID || r.roleid)) || null;
}

async function getGearSummaryEmbed(userID, guildID, db, targetUser) {
    let levelsRes;
    try { levelsRes = await db.query(`SELECT "rodLevel", "boatLevel", "currentLocation", "max_dungeon_floor" FROM levels WHERE "user" = $1 AND "guild" = $2`, [userID, guildID]); }
    catch(e) { levelsRes = await db.query(`SELECT rodlevel, boatlevel, currentlocation, max_dungeon_floor FROM levels WHERE userid = $1 AND guildid = $2`, [userID, guildID]).catch(()=>({rows:[]})); }
    
    const levelsData = levelsRes.rows[0] || { rodLevel: 1, boatLevel: 1, currentLocation: 'beach', max_dungeon_floor: 0 };
    const rodLvl = levelsData.rodLevel || levelsData.rodlevel || 1;
    const boatLvl = levelsData.boatLevel || levelsData.boatlevel || 1;
    const cLoc = levelsData.currentLocation || levelsData.currentlocation || 'beach'; 
    const maxFloor = levelsData.max_dungeon_floor || 0;

    let weaponRes;
    try { weaponRes = await db.query(`SELECT "raceName", "weaponLevel" FROM user_weapons WHERE "userID" = $1 AND "guildID" = $2`, [userID, guildID]); }
    catch(e) { weaponRes = await db.query(`SELECT racename, weaponlevel FROM user_weapons WHERE userid = $1 AND guildid = $2`, [userID, guildID]).catch(()=>({rows:[]})); }
    const weaponData = weaponRes.rows[0];
    const wRace = weaponData ? (weaponData.raceName || weaponData.racename) : null;
    const wLvl = weaponData ? (weaponData.weaponLevel || weaponData.weaponlevel) : null;
    const weaponText = weaponData ? `**${wRace}** (Lv.${wLvl})` : "لا يوجد سلاح";

    let skillsRes;
    try { skillsRes = await db.query(`SELECT "skillID", "skillLevel" FROM user_skills WHERE "userID" = $1 AND "guildID" = $2`, [userID, guildID]); }
    catch(e) { skillsRes = await db.query(`SELECT skillid, skilllevel FROM user_skills WHERE userid = $1 AND guildid = $2`, [userID, guildID]).catch(()=>({rows:[]})); }
    const skillsData = skillsRes.rows;

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

        try { await db.query(`ALTER TABLE settings ADD COLUMN IF NOT EXISTS "marketStatus" TEXT DEFAULT 'normal'`); } catch (e) {}

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

        await this.sendUserPanel(message, targetUser, targetMember, db, client);
    },

    async sendUserPanel(message, targetUser, targetMember, db, client) {
        const embed = new EmbedBuilder()
            .setTitle(`👑 لـوحـة الامبراطـور: ${targetUser.username}`)
            .setThumbnail(targetUser.displayAvatarURL())
            .setColor(Colors.Gold)
            .setDescription("مـا امـرك سيـادة الامبراطـور؟");

        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`admin_user_${targetUser.id}`)
                .setPlaceholder('اختر الإجراء...')
                .addOptions([
                    { label: '📋 فحص الحساب', value: 'check', description: 'عرض إحصائيات اللاعب' },
                    { label: '💰 إدارة المورا والخبرة', value: 'economy', emoji: '🪙' },
                    { label: '🔄 تبديل ونقل حسابين', value: 'swap_accounts', description: 'نقل (اللفل، المورا، الستريك، الأسلحة) بين شخصين', emoji: '🔄' }, 
                    { label: '👑 تعيين ملك يدوي', value: 'set_king', description: 'تتويج العضو ورفع نقاطه في اللوحة', emoji: '👑' },
                    { label: '🗑️ إخلاء عرش ملك', value: 'empty_king', description: 'تصفير نقاط عرش معين وطرد الملك الحالي', emoji: '🗑️' },
                    { label: '🌟 إدارة السمعة', value: 'reputation', description: 'إضافة/خصم/تحديد نقاط السمعة', emoji: '🌟' },
                    { label: '🗳️ فرص التزكية', value: 'rep_chances', description: 'منح فرص تصويت (تزكية) إضافية لليوم', emoji: '🗳️' },
                    { label: '🎟️ إدارة التذاكر', value: 'tickets', emoji: '🎟️' },
                    { label: '⛺ منح خيمة (دانجون)', value: 'dungeon_tent', description: 'تحديد طابق الحفظ في الدانجون', emoji: '⛺' },
                    { label: '🎒 إدارة العناصر', value: 'items', description: 'إعطاء/سحب الأغراض (حيوانات، أسهم، بذور، أعلاف)', emoji: '🎒' },
                    { label: '⚔️ تعديل الأسلحة والمهارات', value: 'combat_gear', description: 'تغيير لفل السلاح أو المهارة', emoji: '⚔️' },
                    { label: '🗑️ تصفير الأسلحة والمهارات', value: 'reset_combat', description: 'مسح جميع مهارات وأسلحة اللاعب بالكامل', emoji: '🗑️' },
                    { label: '⛵ معدات وموقع الصيد', value: 'fishing_gear', description: 'تغيير السنارة، القارب، أو موقع الشاطئ', emoji: '🎣' }, 
                    { label: '🛡️ إعطاء درع ميديا', value: 'media_shield', emoji: '🛡️' },
                    { label: '⚠️ تصفير الحساب', value: 'reset', description: 'مسح جميع البيانات!', emoji: '⚠️' }
                ])
        );

        const panelMsg = await message.reply({ embeds: [embed], components: [row] });
        const filter = i => i.user.id === message.author.id;
        const collector = panelMsg.createMessageComponentCollector({ filter, time: 300000 });

        collector.on('collect', async interaction => {
            const val = interaction.values[0];
            const guildID = message.guild.id;
            const userID = targetUser.id;

            if (val === 'check') {
                await this.checkUser(interaction, client, db, targetUser);
            } 
            else if (val === 'economy') {
                const modalId = `mod_eco_${Date.now()}`;
                const modal = new ModalBuilder().setCustomId(modalId).setTitle('إدارة الموارد');
                const typeInput = new TextInputBuilder().setCustomId('eco_type').setLabel('النوع (مورا / خبرة)').setStyle(TextInputStyle.Short).setRequired(true);
                const actionInput = new TextInputBuilder().setCustomId('eco_action').setLabel('الإجراء (اضافة / خصم / تحديد)').setStyle(TextInputStyle.Short).setRequired(true);
                const amountInput = new TextInputBuilder().setCustomId('eco_amount').setLabel('الكمية (أرقام فقط)').setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(typeInput), new ActionRowBuilder().addComponents(actionInput), new ActionRowBuilder().addComponents(amountInput));
                await interaction.showModal(modal);

                try {
                    const modalSubmit = await interaction.awaitModalSubmit({ filter: i => i.customId === modalId && i.user.id === message.author.id, time: 120000 });
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
                } catch(e) { if (e.code !== 'InteractionCollectorError') console.error(e); }
            }
            else if (val === 'swap_accounts') {
                const modalId = `mod_swap_${Date.now()}`;
                const modal = new ModalBuilder().setCustomId(modalId).setTitle('تبديل ونقل الحسابات');
                const id1Input = new TextInputBuilder().setCustomId('swap_id1').setLabel('آيدي الحساب الأول').setStyle(TextInputStyle.Short).setRequired(true);
                const id2Input = new TextInputBuilder().setCustomId('swap_id2').setLabel('آيدي الحساب الثاني (سيتبادل معه)').setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(id1Input), new ActionRowBuilder().addComponents(id2Input));
                await interaction.showModal(modal);

                try {
                    const modalSubmit = await interaction.awaitModalSubmit({ filter: i => i.customId === modalId && i.user.id === message.author.id, time: 120000 });
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
                                await db.query(`UPDATE ${tableName} SET "${targetCol}" = $1, "id" = $4 WHERE "${targetCol}" = $2 AND "${gCol}" = $3`, [tempId, id1, guildID, temp_pk]);
                                await db.query(`UPDATE ${tableName} SET "${targetCol}" = $1, "id" = $4 WHERE "${targetCol}" = $2 AND "${gCol}" = $3`, [id1, id2, guildID, id1_pk]);
                                await db.query(`UPDATE ${tableName} SET "${targetCol}" = $1, "id" = $4 WHERE "${targetCol}" = $2 AND "${gCol}" = $3`, [id2, tempId, guildID, id2_pk]);
                            } else {
                                await db.query(`UPDATE ${tableName} SET "${targetCol}" = $1 WHERE "${targetCol}" = $2 AND "${gCol}" = $3`, [tempId, id1, guildID]);
                                await db.query(`UPDATE ${tableName} SET "${targetCol}" = $1 WHERE "${targetCol}" = $2 AND "${gCol}" = $3`, [id1, id2, guildID]);
                                await db.query(`UPDATE ${tableName} SET "${targetCol}" = $1 WHERE "${targetCol}" = $2 AND "${gCol}" = $3`, [id2, tempId, guildID]);
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

                    await modalSubmit.editReply({ content: `✅ **تم نقل وتبديل البيانات بنجاح!**\nتم تبديل جميع البيانات **(المورا، اللفل، الإكس بي، الستريك، المزرعة، العائلة، وغيرها)** بين <@${id1}> و <@${id2}> بصمت.` });

                } catch(e) { 
                    await db.query('ROLLBACK').catch(()=>{});
                    if (e.code !== 'InteractionCollectorError') console.error(e); 
                    await interaction.followUp({content: "❌ حدث خطأ أثناء التبديل.", flags: [MessageFlags.Ephemeral]}).catch(()=>{});
                }
            }
            else if (val === 'set_king' || val === 'empty_king') {
                const isEmpting = val === 'empty_king';
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
                
                await interaction.update({ content: isEmpting ? `🗑️ **اختر العرش الذي تريد إخلائه بالكامل:**` : `👑 **اختر اللقب الذي تريد إعطاءه لـ ${targetUser}:**`, embeds: [], components: [kingMenu] });

                const kingCollector = panelMsg.createMessageComponentCollector({ filter: i => i.user.id === message.author.id && i.customId.startsWith('mod_king_'), time: 60000 });
                
                kingCollector.on('collect', async i => {
                    await i.deferUpdate();
                    const selectedRoleColumn = i.values[0];
                    
                    let settingsRes;
                    try { settingsRes = await db.query(`SELECT "${selectedRoleColumn}" FROM settings WHERE "guild" = $1`, [guildID]); }
                    catch(e) { settingsRes = await db.query(`SELECT ${selectedRoleColumn} FROM settings WHERE guild = $1`, [guildID]).catch(()=>({rows:[]})); }
                    
                    const roleId = settingsRes.rows[0] ? settingsRes.rows[0][selectedRoleColumn] : null;
                    if (!roleId) return await i.editReply({ content: `❌ لم يتم إعداد رتبة لهذا الملك في إعدادات السيرفر.`, components: [] });

                    const targetRole = message.guild.roles.cache.get(roleId);
                    if (!targetRole) return await i.editReply({ content: `❌ الرتبة المطلوبة غير موجودة في السيرفر.`, components: [] });

                    const todayStr = getTodayDateString();
                    const statName = kingStatsMap[selectedRoleColumn];

                    if (isEmpting) {
                        targetRole.members.forEach(async (member) => {
                            await member.roles.remove(targetRole).catch(() => {});
                        });

                        if (selectedRoleColumn === 'roleCasinoKing') {
                            await db.query(`UPDATE kings_board_tracker SET "casino_profit" = 0, "mora_earned" = 0 WHERE "guildID" = $1 AND "date" = $2`, [guildID, todayStr]).catch(()=>{});
                        } else {
                            await db.query(`UPDATE kings_board_tracker SET "${statName}" = 0 WHERE "guildID" = $1 AND "date" = $2`, [guildID, todayStr]).catch(()=>{});
                        }

                        await i.editReply({ content: `🗑️ **تم إخلاء عرش (${targetRole.name}) وتصفير جميع نقاطه لليوم بنجاح!**`, components: [] });
                    } else {
                        let currentMax = 0;
                        if (selectedRoleColumn === 'roleCasinoKing') {
                            const res = await db.query(`SELECT SUM(COALESCE("casino_profit", 0) + COALESCE("mora_earned", 0)) as val FROM kings_board_tracker WHERE "guildID" = $1 AND "date" = $2 GROUP BY "userID" ORDER BY val DESC LIMIT 1`, [guildID, todayStr]).catch(()=>({rows:[]}));
                            currentMax = res.rows[0] ? Number(res.rows[0].val) : 0;
                        } else if (selectedRoleColumn === 'roleAbyss') {
                            const res = await db.query(`SELECT "dungeon_floor" as val FROM kings_board_tracker WHERE "guildID" = $1 AND "date" = $2 ORDER BY "dungeon_floor" DESC LIMIT 1`, [guildID, todayStr]).catch(()=>({rows:[]}));
                            currentMax = res.rows[0] ? Number(res.rows[0].val) : 0;
                        } else {
                            const res = await db.query(`SELECT SUM(COALESCE("${statName}", 0)) as val FROM kings_board_tracker WHERE "guildID" = $1 AND "date" = $2 GROUP BY "userID" ORDER BY val DESC LIMIT 1`, [guildID, todayStr]).catch(()=>({rows:[]}));
                            currentMax = res.rows[0] ? Number(res.rows[0].val) : 0;
                        }

                        const newVal = currentMax + 10; 
                        const trackerId = `${userID}-${guildID}-${todayStr}`;

                        try {
                            await db.query(`
                                INSERT INTO kings_board_tracker ("id", "userID", "guildID", "date", "${statName}") 
                                VALUES ($1, $2, $3, $4, $5)
                                ON CONFLICT("id") DO UPDATE SET "${statName}" = $5
                            `, [trackerId, userID, guildID, todayStr, newVal]);
                        } catch(e) {
                            await db.query(`
                                INSERT INTO kings_board_tracker (id, userid, guildid, date, ${statName}) 
                                VALUES ($1, $2, $3, $4, $5)
                                ON CONFLICT(id) DO UPDATE SET ${statName} = $5
                            `, [trackerId, userID, guildID, todayStr, newVal]).catch(()=>{});
                        }

                        targetRole.members.forEach(async (member) => {
                            if (member.id !== userID) await member.roles.remove(targetRole).catch(() => {});
                        });

                        if (!targetMember.roles.cache.has(roleId)) {
                            await targetMember.roles.add(targetRole).catch(() => {});
                        }

                        await i.editReply({ content: `👑 **تم تتويج ${targetUser} بلقب (${targetRole.name}) لليوم!**\nسيتم سحب الرتبة وتصفير المنافسة غداً لبدء سباق جديد.`, components: [] });
                    }
                    kingCollector.stop();
                });
            }
            // 🔥 إصلاح السمعة: استخدام UPSERT ذكي بدل قراءة ثم كتابة لتفادي أخطاء السجلات المفقودة
            else if (val === 'reputation') {
                const modalId = `mod_rep_${Date.now()}`;
                const modal = new ModalBuilder().setCustomId(modalId).setTitle('إدارة السمعة (النقاط)');
                const actionInput = new TextInputBuilder().setCustomId('rep_action').setLabel('الإجراء (اضافة / خصم / تحديد)').setStyle(TextInputStyle.Short).setRequired(true);
                const amountInput = new TextInputBuilder().setCustomId('rep_amount').setLabel('النقاط (أرقام فقط)').setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(actionInput), new ActionRowBuilder().addComponents(amountInput));
                await interaction.showModal(modal);

                try {
                    const modalSubmit = await interaction.awaitModalSubmit({ filter: i => i.customId === modalId && i.user.id === message.author.id, time: 120000 });
                    await modalSubmit.deferReply({ flags: [MessageFlags.Ephemeral] });

                    const action = normalize(modalSubmit.fields.getTextInputValue('rep_action'));
                    const amount = parseInt(modalSubmit.fields.getTextInputValue('rep_amount'));
                    if (isNaN(amount) || amount < 0) return modalSubmit.editReply({ content: "❌ الرجاء إدخال رقم صحيح وموجب." });

                    let repDataRes;
                    try { repDataRes = await db.query(`SELECT "rep_points" FROM user_reputation WHERE "userID" = $1 AND "guildID" = $2`, [userID, guildID]); }
                    catch(e) { repDataRes = await db.query(`SELECT rep_points FROM user_reputation WHERE userid = $1 AND guildid = $2`, [userID, guildID]).catch(()=>({rows:[]})); }
                    
                    let currentPoints = repDataRes.rows[0] ? Number(repDataRes.rows[0].rep_points) : 0;
                    let newPoints = currentPoints;

                    if (action.includes('اضاف') || action.includes('زود')) newPoints += amount;
                    else if (action.includes('خصم') || action.includes('نقص') || action.includes('ازال')) newPoints = Math.max(0, newPoints - amount);
                    else if (action.includes('تحديد') || action.includes('حط')) newPoints = amount;
                    else return modalSubmit.editReply({ content: "❌ إجراء غير معروف. استعمل (إضافة/خصم/تحديد)." });

                    try {
                        await db.query(`
                            INSERT INTO user_reputation ("userID", "guildID", "rep_points") VALUES ($1, $2, $3)
                            ON CONFLICT("userID", "guildID") DO UPDATE SET "rep_points" = EXCLUDED."rep_points"
                        `, [userID, guildID, newPoints]);
                    } catch(e) {
                        await db.query(`
                            INSERT INTO user_reputation (userid, guildid, rep_points) VALUES ($1, $2, $3)
                            ON CONFLICT(userid, guildid) DO UPDATE SET rep_points = EXCLUDED.rep_points
                        `, [userID, guildID, newPoints]).catch(()=>{});
                    }

                    await modalSubmit.editReply({ content: `✅ تم ضبط سمعة ${targetUser} لتصبح **${newPoints}** 🌟` });
                } catch(e) { if (e.code !== 'InteractionCollectorError') console.error(e); }
            }
            else if (val === 'rep_chances') {
                const modalId = `mod_repchan_${Date.now()}`;
                const modal = new ModalBuilder().setCustomId(modalId).setTitle('منح فرص تزكية');
                const amountInput = new TextInputBuilder().setCustomId('repchan_amount').setLabel('عدد الفرص الإضافية (أرقام فقط)').setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(amountInput));
                await interaction.showModal(modal);

                try {
                    const modalSubmit = await interaction.awaitModalSubmit({ filter: i => i.customId === modalId && i.user.id === message.author.id, time: 120000 });
                    await modalSubmit.deferReply({ flags: [MessageFlags.Ephemeral] });

                    const amount = parseInt(modalSubmit.fields.getTextInputValue('repchan_amount'));
                    if (isNaN(amount) || amount <= 0) return modalSubmit.editReply({ content: "❌ الرجاء إدخال رقم صحيح وموجب." });

                    const todayDateStr = new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Riyadh' });
                    try { await db.query(`ALTER TABLE user_reputation ADD COLUMN IF NOT EXISTS "daily_reps_given" INTEGER DEFAULT 0`); } catch(e) {}

                    try {
                        await db.query(`
                            INSERT INTO user_reputation ("userID", "guildID", "last_rep_given", "daily_reps_given") 
                            VALUES ($1, $2, $3, $4)
                            ON CONFLICT("userID", "guildID") DO UPDATE SET "last_rep_given" = $3, "daily_reps_given" = COALESCE(user_reputation."daily_reps_given", 0) - $5
                        `, [userID, guildID, todayDateStr, -amount, amount]);
                    } catch(e) {
                        await db.query(`
                            INSERT INTO user_reputation (userid, guildid, last_rep_given, daily_reps_given) 
                            VALUES ($1, $2, $3, $4)
                            ON CONFLICT(userid, guildid) DO UPDATE SET last_rep_given = $3, daily_reps_given = COALESCE(daily_reps_given, 0) - $5
                        `, [userID, guildID, todayDateStr, -amount, amount]).catch(()=>{});
                    }

                    await modalSubmit.editReply({ content: `✅ تم منح **${amount}** فرصة تزكية إضافية لـ ${targetUser} بنجاح! يمكنه استخدامها الآن. 🗳️` });
                } catch(e) { if (e.code !== 'InteractionCollectorError') console.error(e); }
            }
            else if (val === 'tickets') {
                const modalId = `mod_tkt_${Date.now()}`;
                const modal = new ModalBuilder().setCustomId(modalId).setTitle('إدارة تذاكر الدانجون');
                const amountInput = new TextInputBuilder().setCustomId('tkt_amount').setLabel('الكمية للإضافة').setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(amountInput));
                await interaction.showModal(modal);

                try {
                    const modalSubmit = await interaction.awaitModalSubmit({ filter: i => i.customId === modalId && i.user.id === message.author.id, time: 120000 });
                    await modalSubmit.deferReply({ flags: [MessageFlags.Ephemeral] });

                    const amount = parseInt(modalSubmit.fields.getTextInputValue('tkt_amount'));
                    if (isNaN(amount)) return modalSubmit.editReply({ content: "❌ الرجاء إدخال رقم صحيح." });

                    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' });
                    try { 
                        await db.query(`
                            INSERT INTO dungeon_stats ("guildID", "userID", "tickets", "last_reset") VALUES ($1, $2, $3, $4)
                            ON CONFLICT("guildID", "userID") DO UPDATE SET "tickets" = COALESCE(dungeon_stats."tickets", 0) + $3
                        `, [guildID, userID, amount, todayStr]); 
                    } catch(e) { 
                        await db.query(`
                            INSERT INTO dungeon_stats (guildid, userid, tickets, last_reset) VALUES ($1, $2, $3, $4)
                            ON CONFLICT(guildid, userid) DO UPDATE SET tickets = COALESCE(tickets, 0) + $3
                        `, [guildID, userID, amount, todayStr]).catch(()=>{}); 
                    }
                    await modalSubmit.editReply({ content: `✅ تم إضافة **${amount}** 🎟️ تذاكر لـ ${targetUser}.` });
                } catch(e) { if (e.code !== 'InteractionCollectorError') console.error(e); }
            }
            else if (val === 'dungeon_tent') {
                const modalId = `mod_tent_${Date.now()}`;
                const modal = new ModalBuilder().setCustomId(modalId).setTitle('إعداد طابق الدانجون (الخيمة)');
                const floorInput = new TextInputBuilder().setCustomId('tent_floor').setLabel('رقم الطابق المراد حفظه كـ (Checkpoint)').setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(floorInput));
                await interaction.showModal(modal);

                try {
                    const modalSubmit = await interaction.awaitModalSubmit({ filter: i => i.customId === modalId && i.user.id === message.author.id, time: 120000 });
                    await modalSubmit.deferReply({ flags: [MessageFlags.Ephemeral] });

                    const floor = parseInt(modalSubmit.fields.getTextInputValue('tent_floor'));
                    if (isNaN(floor) || floor < 0) return modalSubmit.editReply({ content: "❌ الرجاء إدخال رقم طابق صحيح." });

                    try {
                        await db.query(`INSERT INTO levels ("user", "guild", "xp", "totalXP", "level", "mora", "max_dungeon_floor") VALUES ($1, $2, 0, 0, 1, 0, $3) ON CONFLICT ("user", "guild") DO UPDATE SET "max_dungeon_floor" = $3`, [userID, guildID, floor]);
                    } catch(e) {
                        await db.query(`INSERT INTO levels (userid, guildid, xp, totalxp, level, mora, max_dungeon_floor) VALUES ($1, $2, 0, 0, 1, 0, $3) ON CONFLICT (userid, guildid) DO UPDATE SET max_dungeon_floor = $3`, [userID, guildID, floor]).catch(()=>{});
                    }

                    await modalSubmit.editReply({ content: `✅ تم نصب خيمة الحفظ لـ ${targetUser} في **الطابق ${floor}** من الدانجون ⛺.` });
                } catch(e) { if (e.code !== 'InteractionCollectorError') console.error(e); }
            }
            // 🔥 إصلاح المهارات والأسلحة: تم إضافة خيار التصفير هنا تحت الزر الجديد 🔥
            else if (val === 'reset_combat') {
                await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
                try {
                    await db.query(`DELETE FROM user_weapons WHERE "userID" = $1 AND "guildID" = $2`, [userID, guildID]);
                    await db.query(`DELETE FROM user_skills WHERE "userID" = $1 AND "guildID" = $2`, [userID, guildID]);
                } catch(e) {
                    await db.query(`DELETE FROM user_weapons WHERE userid = $1 AND guildid = $2`, [userID, guildID]).catch(()=>{});
                    await db.query(`DELETE FROM user_skills WHERE userid = $1 AND guildid = $2`, [userID, guildID]).catch(()=>{});
                }
                const summaryEmbed = await getGearSummaryEmbed(userID, guildID, db, targetUser);
                await interaction.editReply({ content: `🗑️ ✅ تم تصفير جميع الأسلحة والمهارات القتالية لـ ${targetUser} بنجاح!`, embeds: [summaryEmbed] });
            }
            else if (val === 'combat_gear') {
                const modalId = `mod_gear_${Date.now()}`;
                const modal = new ModalBuilder().setCustomId(modalId).setTitle('تعديل معدات القتال');
                const typeInput = new TextInputBuilder().setCustomId('gear_type').setLabel('النوع (سلاح / مهارة)').setStyle(TextInputStyle.Short).setRequired(true);
                const nameInput = new TextInputBuilder().setCustomId('gear_name').setLabel('اسم المهارة (اتركه فارغاً إذا كان سلاحاً)').setStyle(TextInputStyle.Short).setRequired(false);
                const levelInput = new TextInputBuilder().setCustomId('gear_level').setLabel('المستوى الجديد (أرقام فقط)').setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(typeInput), new ActionRowBuilder().addComponents(nameInput), new ActionRowBuilder().addComponents(levelInput));
                await interaction.showModal(modal);

                try {
                    const modalSubmit = await interaction.awaitModalSubmit({ filter: i => i.customId === modalId && i.user.id === message.author.id, time: 120000 });
                    await modalSubmit.deferReply({ flags: [MessageFlags.Ephemeral] });

                    const type = normalize(modalSubmit.fields.getTextInputValue('gear_type'));
                    const name = modalSubmit.fields.getTextInputValue('gear_name');
                    const level = parseInt(modalSubmit.fields.getTextInputValue('gear_level'));
                    
                    if (isNaN(level) || level < 0) return modalSubmit.editReply({ content: "❌ مستوى غير صالح." });

                    let successMessage = "";

                    if (type.includes('سلاح')) {
                        const userRace = await getUserRace(targetMember, db);
                        if (!userRace) return modalSubmit.editReply({ content: "❌ هذا اللاعب لا يمتلك أي عرق حالياً، لا يمكن ترقية سلاحه! أعطه رتبة عرق أولاً." });
                        
                        const raceName = userRace.raceName || userRace.racename;

                        if (level === 0) {
                            try { await db.query(`DELETE FROM user_weapons WHERE "userID" = $1 AND "guildID" = $2 AND "raceName" = $3`, [userID, guildID, raceName]); }
                            catch(e) { await db.query(`DELETE FROM user_weapons WHERE userid = $1 AND guildid = $2 AND racename = $3`, [userID, guildID, raceName]).catch(()=>{}); }
                            successMessage = `✅ تم إزالة سلاح العرق (${raceName}) لـ ${targetUser}.`;
                        } else {
                            try {
                                await db.query(`INSERT INTO user_weapons ("userID", "guildID", "raceName", "weaponLevel") VALUES ($1, $2, $3, $4) ON CONFLICT ("userID", "guildID", "raceName") DO UPDATE SET "weaponLevel" = EXCLUDED."weaponLevel"`, [userID, guildID, raceName, level]);
                            } catch(e) {
                                await db.query(`INSERT INTO user_weapons (userid, guildid, racename, weaponlevel) VALUES ($1, $2, $3, $4) ON CONFLICT (userid, guildid, racename) DO UPDATE SET weaponlevel = EXCLUDED.weaponlevel`, [userID, guildID, raceName, level]).catch(()=>{});
                            }
                            successMessage = `✅ تم ضبط مستوى سلاح (${raceName}) لـ ${targetUser} إلى **Lv.${level}**.`;
                        }
                    } 
                    else if (type.includes('مهارة') || type.includes('مهاره')) {
                        if (!name) return modalSubmit.editReply({ content: "❌ يرجى كتابة اسم المهارة أو أي تلميح للبحث عنها." });
                        
                        const searchName = normalize(name);
                        const foundSkill = skillsConfig.find(s => normalize(s.name).includes(searchName) || s.id.toLowerCase().includes(searchName));
                        
                        if (!foundSkill) return modalSubmit.editReply({ content: `❌ لم أتمكن من العثور على مهارة تطابق كلمة: "${name}"` });
                        
                        const skillId = foundSkill.id;

                        if (level === 0) {
                            try { await db.query(`DELETE FROM user_skills WHERE "userID" = $1 AND "guildID" = $2 AND "skillID" = $3`, [userID, guildID, skillId]); }
                            catch(e) { await db.query(`DELETE FROM user_skills WHERE userid = $1 AND guildid = $2 AND skillid = $3`, [userID, guildID, skillId]).catch(()=>{}); }
                            successMessage = `✅ تم إزالة المهارة (${foundSkill.name}) لـ ${targetUser}.`;
                        } else {
                            try {
                                await db.query(`INSERT INTO user_skills ("userID", "guildID", "skillID", "skillLevel") VALUES ($1, $2, $3, $4) ON CONFLICT ("userID", "guildID", "skillID") DO UPDATE SET "skillLevel" = EXCLUDED."skillLevel"`, [userID, guildID, skillId, level]);
                            } catch(e) {
                                await db.query(`INSERT INTO user_skills (userid, guildid, skillid, skilllevel) VALUES ($1, $2, $3, $4) ON CONFLICT (userid, guildid, skillid) DO UPDATE SET skilllevel = EXCLUDED.skilllevel`, [userID, guildID, skillId, level]).catch(()=>{});
                            }
                            successMessage = `✅ تم ضبط مستوى مهارة (${foundSkill.name}) لـ ${targetUser} إلى **Lv.${level}**.`;
                        }
                    } else {
                        return modalSubmit.editReply({ content: "❌ نوع غير معروف. استخدم (سلاح / مهارة)." });
                    }

                    const summaryEmbed = await getGearSummaryEmbed(userID, guildID, db, targetUser);
                    await modalSubmit.editReply({ content: successMessage, embeds: [summaryEmbed] });

                } catch(e) { if (e.code !== 'InteractionCollectorError') console.error(e); }
            }
            else if (val === 'fishing_gear') {
                // الكود نفسه سليم لم أقم بتغييره هنا.
                const modalId = `mod_fish_${Date.now()}`;
                const modal = new ModalBuilder().setCustomId(modalId).setTitle('إدارة معدات وموقع الصيد');
                const typeInput = new TextInputBuilder().setCustomId('fish_type').setLabel('النوع (سنارة / قارب / مكان)').setStyle(TextInputStyle.Short).setRequired(true);
                const valInput = new TextInputBuilder().setCustomId('fish_val').setLabel('الرقم / اسم المكان (مثال: beach, deep)').setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(typeInput), new ActionRowBuilder().addComponents(valInput));
                await interaction.showModal(modal);

                try {
                    const modalSubmit = await interaction.awaitModalSubmit({ filter: i => i.customId === modalId && i.user.id === message.author.id, time: 120000 });
                    await modalSubmit.deferReply({ flags: [MessageFlags.Ephemeral] });

                    const type = normalize(modalSubmit.fields.getTextInputValue('fish_type'));
                    const inputVal = modalSubmit.fields.getTextInputValue('fish_val').toLowerCase().trim();
                    let successMessage = "";

                    if (type.includes('سنارة') || type.includes('صنارة')) {
                        const level = parseInt(inputVal);
                        if (isNaN(level) || level <= 0) return modalSubmit.editReply("❌ مستوى السنارة غير صحيح.");
                        try { await db.query(`UPDATE levels SET "rodLevel" = $1 WHERE "user" = $2 AND "guild" = $3`, [level, userID, guildID]); }
                        catch(e) { await db.query(`UPDATE levels SET rodLevel = $1 WHERE userid = $2 AND guildid = $3`, [level, userID, guildID]).catch(()=>{}); }
                        successMessage = `✅ تم ضبط مستوى السنارة لـ ${targetUser} إلى **Lv.${level}**.`;
                    }
                    else if (type.includes('قارب') || type.includes('يخت') || type.includes('سفينة')) {
                        const level = parseInt(inputVal);
                        if (isNaN(level) || level <= 0) return modalSubmit.editReply("❌ مستوى القارب غير صحيح.");
                        try { await db.query(`UPDATE levels SET "boatLevel" = $1 WHERE "user" = $2 AND "guild" = $3`, [level, userID, guildID]); }
                        catch(e) { await db.query(`UPDATE levels SET boatLevel = $1 WHERE userid = $2 AND guildid = $3`, [level, userID, guildID]).catch(()=>{}); }
                        successMessage = `✅ تم ضبط مستوى القارب لـ ${targetUser} إلى **Lv.${level}**.`;
                    }
                    else if (type.includes('مكان') || type.includes('شاطئ') || type.includes('موقع')) {
                        const locs = ['beach', 'shallow', 'deep', 'bermuda', 'trench', 'atlantis', 'dark_sea'];
                        if (!locs.includes(inputVal)) return modalSubmit.editReply(`❌ مكان غير صحيح. الأماكن المتاحة:\n${locs.join(', ')}`);
                        
                        try { await db.query(`UPDATE levels SET "currentLocation" = $1 WHERE "user" = $2 AND "guild" = $3`, [inputVal, userID, guildID]); }
                        catch(e) { await db.query(`UPDATE levels SET currentlocation = $1 WHERE userid = $2 AND guildid = $3`, [inputVal, userID, guildID]).catch(()=>{}); }
                        successMessage = `✅ تم تغيير مكان الصيد لـ ${targetUser} إلى الشاطئ: **${inputVal}**.`;
                    } else {
                        return modalSubmit.editReply("❌ نوع غير معروف. استخدم (سنارة / قارب / مكان).");
                    }

                    const summaryEmbed = await getGearSummaryEmbed(userID, guildID, db, targetUser);
                    await modalSubmit.editReply({ content: successMessage, embeds: [summaryEmbed] });

                } catch(e) { if (e.code !== 'InteractionCollectorError') console.error(e); }
            }
            // 🔥 إصلاح إعطاء وحذف الأغراض هنا 🔥
            else if (val === 'items') {
                const modalId = `mod_item_${Date.now()}`;
                const modal = new ModalBuilder().setCustomId(modalId).setTitle('إدارة العناصر');
                const actionInput = new TextInputBuilder().setCustomId('itm_action').setLabel('الإجراء (اعطاء / ازالة)').setStyle(TextInputStyle.Short).setRequired(true);
                const nameInput = new TextInputBuilder().setCustomId('itm_name').setLabel('اسم العنصر').setStyle(TextInputStyle.Short).setRequired(true);
                const qtyInput = new TextInputBuilder().setCustomId('itm_qty').setLabel('الكمية').setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(actionInput), new ActionRowBuilder().addComponents(nameInput), new ActionRowBuilder().addComponents(qtyInput));
                await interaction.showModal(modal);

                try {
                    const modalSubmit = await interaction.awaitModalSubmit({ filter: i => i.customId === modalId && i.user.id === message.author.id, time: 120000 });
                    await modalSubmit.deferReply({ flags: [MessageFlags.Ephemeral] });

                    const action = normalize(modalSubmit.fields.getTextInputValue('itm_action'));
                    const name = modalSubmit.fields.getTextInputValue('itm_name');
                    const qty = parseInt(modalSubmit.fields.getTextInputValue('itm_qty')) || 1;

                    const item = this.findItem(name);
                    if (!item) return modalSubmit.editReply({ content: `❌ لم يتم العثور على عنصر باسم "${name}".\n*(تلميح: تأكد من كتابة اسم الحيوان، أو السهم، أو العلف بشكل صحيح).*` });

                    if (action.includes('اعطاء') || action.includes('اضاف')) {
                        if (item.type === 'market') {
                            try {
                                await db.query(`INSERT INTO user_portfolio ("guildID", "userID", "itemID", "quantity") VALUES ($1, $2, $3, $4) ON CONFLICT("guildID", "userID", "itemID") DO UPDATE SET "quantity" = user_portfolio."quantity" + $4`, [guildID, userID, item.id, qty]);
                            } catch(e) {
                                let pfItemRes = await db.query(`SELECT * FROM user_portfolio WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [userID, guildID, item.id]).catch(()=>({rows:[]}));
                                if (pfItemRes.rows.length > 0) {
                                    await db.query(`UPDATE user_portfolio SET quantity = quantity + $1 WHERE userid = $2 AND guildid = $3 AND itemid = $4`, [qty, userID, guildID, item.id]).catch(()=>{});
                                } else {
                                    await db.query(`INSERT INTO user_portfolio (guildid, userid, itemid, quantity) VALUES ($1, $2, $3, $4)`, [guildID, userID, item.id, qty]).catch(()=>{});
                                }
                            }
                        } else if (item.type === 'farm') {
                            // تم إصلاح مشكلة اللوب، يضيف الكمية في سطر واحد لتوافق نظام المزرعة الجديد
                            const now = Date.now();
                            try { await db.query(`INSERT INTO user_farm ("guildID", "userID", "animalID", "quantity", "purchaseTimestamp", "lastFedTimestamp") VALUES ($1, $2, $3, $4, $5, $6)`, [guildID, userID, item.id, qty, now, now]); }
                            catch(e) { await db.query(`INSERT INTO user_farm (guildid, userid, animalid, quantity, purchasetimestamp, lastfedtimestamp) VALUES ($1, $2, $3, $4, $5, $6)`, [guildID, userID, item.id, qty, now, now]).catch(()=>{}); }
                        } else if (item.type === 'feed' || item.type === 'seed') {
                            try { await db.query(`INSERT INTO user_inventory ("guildID", "userID", "itemID", "quantity") VALUES ($1, $2, $3, $4) ON CONFLICT("guildID", "userID", "itemID") DO UPDATE SET "quantity" = COALESCE(user_inventory."quantity", 0) + $4`, [guildID, userID, item.id, qty]); }
                            catch(e) { 
                                let invItemRes = await db.query(`SELECT * FROM user_inventory WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [userID, guildID, item.id]).catch(()=>({rows:[]}));
                                if (invItemRes.rows.length > 0) {
                                    await db.query(`UPDATE user_inventory SET quantity = quantity + $1 WHERE userid = $2 AND guildid = $3 AND itemid = $4`, [qty, userID, guildID, item.id]).catch(()=>{});
                                } else {
                                    await db.query(`INSERT INTO user_inventory (guildid, userid, itemid, quantity) VALUES ($1, $2, $3, $4)`, [guildID, userID, item.id, qty]).catch(()=>{});
                                }
                            }
                        }
                        await modalSubmit.editReply({ content: `✅ تم إضافة **${qty}** × **${item.name}** لـ ${targetUser}.` });
                    } 
                    else if (action.includes('ازال') || action.includes('سحب')) {
                        // الاعتماد على userID و itemID في الحذف بدلاً من عمود id الذي قد لا يكون موجوداً
                        if (item.type === 'market') {
                            try { await db.query(`UPDATE user_portfolio SET "quantity" = GREATEST(0, "quantity" - $1) WHERE "userID" = $2 AND "guildID" = $3 AND "itemID" = $4`, [qty, userID, guildID, item.id]); }
                            catch(e) { await db.query(`UPDATE user_portfolio SET quantity = GREATEST(0, quantity - $1) WHERE userid = $2 AND guildid = $3 AND itemid = $4`, [qty, userID, guildID, item.id]).catch(()=>{}); }
                        } else if (item.type === 'farm') {
                            try { await db.query(`UPDATE user_farm SET "quantity" = GREATEST(0, "quantity" - $1) WHERE "userID" = $2 AND "guildID" = $3 AND "animalID" = $4`, [qty, userID, guildID, item.id]); }
                            catch(e) { await db.query(`UPDATE user_farm SET quantity = GREATEST(0, quantity - $1) WHERE userid = $2 AND guildid = $3 AND animalid = $4`, [qty, userID, guildID, item.id]).catch(()=>{}); }
                        } else if (item.type === 'feed' || item.type === 'seed') {
                            try { await db.query(`UPDATE user_inventory SET "quantity" = GREATEST(0, "quantity" - $1) WHERE "userID" = $2 AND "guildID" = $3 AND "itemID" = $4`, [qty, userID, guildID, item.id]); }
                            catch(e) { await db.query(`UPDATE user_inventory SET quantity = GREATEST(0, quantity - $1) WHERE userid = $2 AND guildid = $3 AND itemid = $4`, [qty, userID, guildID, item.id]).catch(()=>{}); }
                        }
                        await modalSubmit.editReply({ content: `✅ تم سحب **${qty}** × **${item.name}** من ${targetUser}.` });
                    }
                } catch(e) { if (e.code !== 'InteractionCollectorError') console.error(e); }
            }
            else if (val === 'media_shield') {
                await this.giveMediaShield(interaction, client, db, targetUser);
            }
            // 🔥 إصلاح التصفير الشامل: تم تضمين جميع الجداول المفقودة 🔥
            else if (val === 'reset') {
                await this.resetUser(interaction, client, db, targetUser);
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
                const allItemsRes = await db.query("SELECT * FROM market_items");
                let report = [];
                for (const item of allItemsRes.rows) {
                    if (!REAL_MARKET_IDS.includes(item.id)) continue;
                    const dropPercent = (Math.random() * 0.20) + 0.20; 
                    const newPrice = Math.max(10, Math.floor(Number(item.currentPrice || item.currentprice) * (1 - dropPercent)));
                    const changePercent = ((newPrice - Number(item.currentPrice || item.currentprice)) / Number(item.currentPrice || item.currentprice));
                    
                    try { await db.query(`UPDATE market_items SET "currentPrice" = $1, "lastChangePercent" = $2 WHERE "id" = $3`, [newPrice, changePercent.toFixed(2), item.id]); }
                    catch(e) { await db.query(`UPDATE market_items SET currentprice = $1, lastchangepercent = $2 WHERE id = $3`, [newPrice, changePercent.toFixed(2), item.id]).catch(()=>{}); }
                    
                    report.push(`${item.name || item.id}: ${item.currentPrice || item.currentprice} ➔ ${newPrice}`);
                }
                await interaction.reply({ content: `📉 **انهيار السوق!**\n\`\`\`\n${report.join('\n')}\n\`\`\``, flags: [MessageFlags.Ephemeral] });
            }
            else if (val === 'boom') {
                const allItemsRes = await db.query("SELECT * FROM market_items");
                let report = [];
                for (const item of allItemsRes.rows) {
                    if (!REAL_MARKET_IDS.includes(item.id)) continue;
                    const risePercent = (Math.random() * 0.20) + 0.15; 
                    const newPrice = Math.floor(Number(item.currentPrice || item.currentprice) * (1 + risePercent));
                    const changePercent = ((newPrice - Number(item.currentPrice || item.currentprice)) / Number(item.currentPrice || item.currentprice));
                    
                    try { await db.query(`UPDATE market_items SET "currentPrice" = $1, "lastChangePercent" = $2 WHERE "id" = $3`, [newPrice, changePercent.toFixed(2), item.id]); }
                    catch(e) { await db.query(`UPDATE market_items SET currentprice = $1, lastchangepercent = $2 WHERE id = $3`, [newPrice, changePercent.toFixed(2), item.id]).catch(()=>{}); }
                    
                    report.push(`${item.name || item.id}: ${item.currentPrice || item.currentprice} ➔ ${newPrice}`);
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
                    
                    try { await db.query(`INSERT INTO settings ("guild") VALUES ($1) ON CONFLICT ("guild") DO NOTHING`, [message.guild.id]); }
                    catch(e) { await db.query(`INSERT INTO settings (guild) VALUES ($1) ON CONFLICT (guild) DO NOTHING`, [message.guild.id]).catch(()=>{}); }
                    
                    try { await db.query(`UPDATE settings SET "marketStatus" = $1 WHERE "guild" = $2`, [statusKey, message.guild.id]); }
                    catch(e) { await db.query(`UPDATE settings SET marketstatus = $1 WHERE guild = $2`, [statusKey, message.guild.id]).catch(()=>{}); }

                    await modalSubmit.editReply({ content: `✅ تم ضبط حالة السوق على: **${statusKey}**` });
                } catch(e) { if (e.code !== 'InteractionCollectorError') console.error(e); }
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
                    
                    const item = this.findItem(itemID);
                    if (!item || item.type !== 'market') return modalSubmit.editReply({ content: "❌ السهم غير موجود." });

                    let dbItemRes;
                    try { dbItemRes = await db.query(`SELECT * FROM market_items WHERE "id" = $1`, [item.id]); }
                    catch(e) { dbItemRes = await db.query(`SELECT * FROM market_items WHERE id = $1`, [item.id]).catch(()=>({rows:[]})); }

                    const dbItem = dbItemRes.rows[0];
                    const currentPrice = dbItem ? Number(dbItem.currentPrice || dbItem.currentprice) : item.price;
                    const changePercent = ((price - currentPrice) / currentPrice).toFixed(2);
                    
                    try { await db.query(`UPDATE market_items SET "currentPrice" = $1, "lastChangePercent" = $2 WHERE "id" = $3`, [price, changePercent, item.id]); }
                    catch(e) { await db.query(`UPDATE market_items SET currentprice = $1, lastchangepercent = $2 WHERE id = $3`, [price, changePercent, item.id]).catch(()=>{}); }

                    await modalSubmit.editReply({ content: `✅ تم ضبط سعر **${item.name}** إلى **${price}**` });
                } catch(e) { if (e.code !== 'InteractionCollectorError') console.error(e); }
            }
            else if (val === 'reset_market') {
                await interaction.reply({ content: "☢️ سيتم تنفيذ تصفير السوق يدوياً، يرجى كتابة `-ادمن تصفير-السوق` للتأكيد.", flags: [MessageFlags.Ephemeral] });
            }
        });
    },

    async checkUser(interaction, client, db, targetUser) {
        try { await interaction.deferReply({ flags: [MessageFlags.Ephemeral] }); } catch(e){}

        const guildID = interaction.guild.id;
        const userID = targetUser.id;

        let userData = await client.getLevel(userID, guildID) || {};
        
        let streakData = {}, mediaStreakData = {}, repData = { rep_points: 0 }, portfolio = [], achievements = [], tickets = 0;

        try {
            const streakDataRes = await db.query(`SELECT * FROM streaks WHERE "guildID" = $1 AND "userID" = $2`, [guildID, userID]);
            streakData = streakDataRes.rows[0] || {};
            
            const mediaStreakDataRes = await db.query(`SELECT * FROM media_streaks WHERE "guildID" = $1 AND "userID" = $2`, [guildID, userID]);
            mediaStreakData = mediaStreakDataRes.rows[0] || {};
            
            const repDataRes = await db.query(`SELECT "rep_points" FROM user_reputation WHERE "guildID" = $1 AND "userID" = $2`, [guildID, userID]);
            repData = repDataRes.rows[0] || { rep_points: 0 };
            
            const portfolioRes = await db.query(`SELECT * FROM user_portfolio WHERE "guildID" = $1 AND "userID" = $2`, [guildID, userID]);
            portfolio = portfolioRes.rows;
            
            const achievementsRes = await db.query(`SELECT "achievementID" FROM user_achievements WHERE "guildID" = $1 AND "userID" = $2`, [guildID, userID]);
            achievements = achievementsRes.rows;
            
            const dungeonStatsRes = await db.query(`SELECT "tickets" FROM dungeon_stats WHERE "guildID" = $1 AND "userID" = $2`, [guildID, userID]);
            const dungeonStats = dungeonStatsRes.rows[0];
            tickets = dungeonStats ? dungeonStats.tickets : 0;
        } catch(e) {
            const streakDataRes = await db.query(`SELECT * FROM streaks WHERE guildid = $1 AND userid = $2`, [guildID, userID]).catch(()=>({rows:[]}));
            streakData = streakDataRes.rows[0] || {};
            
            const mediaStreakDataRes = await db.query(`SELECT * FROM media_streaks WHERE guildid = $1 AND userid = $2`, [guildID, userID]).catch(()=>({rows:[]}));
            mediaStreakData = mediaStreakDataRes.rows[0] || {};
            
            const repDataRes = await db.query(`SELECT rep_points FROM user_reputation WHERE guildid = $1 AND userid = $2`, [guildID, userID]).catch(()=>({rows:[]}));
            repData = repDataRes.rows[0] || { rep_points: 0 };
            
            const portfolioRes = await db.query(`SELECT * FROM user_portfolio WHERE guildid = $1 AND userid = $2`, [guildID, userID]).catch(()=>({rows:[]}));
            portfolio = portfolioRes.rows;
            
            const achievementsRes = await db.query(`SELECT achievementid FROM user_achievements WHERE guildid = $1 AND userid = $2`, [guildID, userID]).catch(()=>({rows:[]}));
            achievements = achievementsRes.rows;
            
            const dungeonStatsRes = await db.query(`SELECT tickets FROM dungeon_stats WHERE guildid = $1 AND userid = $2`, [guildID, userID]).catch(()=>({rows:[]}));
            const dungeonStats = dungeonStatsRes.rows[0];
            tickets = dungeonStats ? dungeonStats.tickets : 0;
        }

        const embed = new EmbedBuilder()
            .setTitle(`📋 تقرير فحص: ${targetUser.username}`)
            .setThumbnail(targetUser.displayAvatarURL())
            .setColor(Colors.Green)
            .addFields(
                { name: '💰 الاقتصاد', value: `مورا: **${(parseInt(userData.mora) || 0).toLocaleString()}**\nبنك: **${(parseInt(userData.bank) || 0).toLocaleString()}**\nXP: **${(parseInt(userData.xp) || 0).toLocaleString()}** (Lv. ${userData.level || 1})`, inline: true },
                { name: '🌟 السمعة والتذاكر', value: `السمعة: **${repData.rep_points || repData.rep_points}**\nالتذاكر: **${tickets}**`, inline: true },
                { name: '🔥 الستريك', value: `شات: **${streakData.streakCount || streakData.streakcount || 0}** (Shield: ${streakData.hasItemShield || streakData.hasitemshield ? '✅' : '❌'})\nميديا: **${mediaStreakData.streakCount || mediaStreakData.streakcount || 0}** (Shield: ${mediaStreakData.hasItemShield || mediaStreakData.hasitemshield ? '✅' : '❌'})`, inline: true },
                { name: '📈 المحفظة', value: portfolio.length > 0 ? portfolio.map(p => `${p.itemID || p.itemid}: ${p.quantity}`).join(', ') : 'لا يوجد', inline: false },
                { name: '🏆 الإنجازات', value: `مكتمل: **${achievements.length}**`, inline: true }
            );

        await interaction.editReply({ embeds: [embed] });
    },

    async giveMediaShield(interaction, client, db, targetUser) {
        try { await interaction.deferReply({ flags: [MessageFlags.Ephemeral] }); } catch(e){}
        const id = `${interaction.guild.id}-${targetUser.id}`;
        try {
            await db.query(`INSERT INTO media_streaks ("id", "guildID", "userID", "hasItemShield") VALUES ($1, $2, $3, 1) ON CONFLICT("id") DO UPDATE SET "hasItemShield" = 1`, [id, interaction.guild.id, targetUser.id]);
        } catch(e) {
            await db.query(`INSERT INTO media_streaks (id, guildid, userid, hasitemshield) VALUES ($1, $2, $3, 1) ON CONFLICT(id) DO UPDATE SET hasitemshield = 1`, [id, interaction.guild.id, targetUser.id]).catch(()=>{});
        }
        await interaction.editReply({ content: `✅ تم تفعيل درع ميديا لـ ${targetUser}.` });
    },

    async resetUser(interaction, client, db, targetUser) {
        try { await interaction.deferReply({ flags: [MessageFlags.Ephemeral] }); } catch(e){}
        const guildID = interaction.guild.id;
        const userID = targetUser.id;

        // 🔥 التصفير الشامل تم وضع كل الجداول فيه لضمان حذف اللاعب تماماً
        try {
            await db.query(`DELETE FROM levels WHERE "user" = $1 AND "guild" = $2`, [userID, guildID]);
            await db.query(`DELETE FROM user_portfolio WHERE "userID" = $1 AND "guildID" = $2`, [userID, guildID]);
            await db.query(`DELETE FROM user_farm WHERE "userID" = $1 AND "guildID" = $2`, [userID, guildID]);
            await db.query(`DELETE FROM user_achievements WHERE "userID" = $1 AND "guildID" = $2`, [userID, guildID]);
            await db.query(`DELETE FROM user_reputation WHERE "userID" = $1 AND "guildID" = $2`, [userID, guildID]);
            await db.query(`DELETE FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2`, [userID, guildID]);
            await db.query(`DELETE FROM user_weapons WHERE "userID" = $1 AND "guildID" = $2`, [userID, guildID]);
            await db.query(`DELETE FROM user_skills WHERE "userID" = $1 AND "guildID" = $2`, [userID, guildID]);
            await db.query(`DELETE FROM dungeon_stats WHERE "userID" = $1 AND "guildID" = $2`, [userID, guildID]);
            await db.query(`DELETE FROM streaks WHERE "userID" = $1 AND "guildID" = $2`, [userID, guildID]);
            await db.query(`DELETE FROM media_streaks WHERE "userID" = $1 AND "guildID" = $2`, [userID, guildID]);
        } catch(e) {
            await db.query(`DELETE FROM levels WHERE userid = $1 AND guildid = $2`, [userID, guildID]).catch(()=>{});
            await db.query(`DELETE FROM user_portfolio WHERE userid = $1 AND guildid = $2`, [userID, guildID]).catch(()=>{});
            await db.query(`DELETE FROM user_farm WHERE userid = $1 AND guildid = $2`, [userID, guildID]).catch(()=>{});
            await db.query(`DELETE FROM user_achievements WHERE userid = $1 AND guildid = $2`, [userID, guildID]).catch(()=>{});
            await db.query(`DELETE FROM user_reputation WHERE userid = $1 AND guildid = $2`, [userID, guildID]).catch(()=>{});
            await db.query(`DELETE FROM user_inventory WHERE userid = $1 AND guildid = $2`, [userID, guildID]).catch(()=>{});
            await db.query(`DELETE FROM user_weapons WHERE userid = $1 AND guildid = $2`, [userID, guildID]).catch(()=>{});
            await db.query(`DELETE FROM user_skills WHERE userid = $1 AND guildid = $2`, [userID, guildID]).catch(()=>{});
            await db.query(`DELETE FROM dungeon_stats WHERE userid = $1 AND guildid = $2`, [userID, guildID]).catch(()=>{});
            await db.query(`DELETE FROM streaks WHERE userid = $1 AND guildid = $2`, [userID, guildID]).catch(()=>{});
            await db.query(`DELETE FROM media_streaks WHERE userid = $1 AND guildid = $2`, [userID, guildID]).catch(()=>{});
        }
        
        await client.setLevel({ ...client.defaultData, user: userID, guild: guildID });

        await interaction.editReply({ content: `☢️ **تم تصفير حساب ${targetUser} ومسح جميع بياناته بالكامل!**` });
    },

    findItem(nameOrID) {
        const input = normalize(nameOrID);
        
        let item = shopItems.find(i => normalize(i.name) === input || i.id.toLowerCase() === nameOrID.toLowerCase());
        if (item && !marketItems.some(m => m.id === item.id) && !farmAnimals.some(f => f.id === item.id)) return { ...item, type: 'shop_special' };
        
        item = marketItems.find(i => normalize(i.name) === input || i.id.toLowerCase() === nameOrID.toLowerCase());
        if (item) return { ...item, type: 'market' };
        
        // 🔥 تم إصلاح دالة البحث: لو كتبت اسم حيوان يعطيك الحيوان نفسه بدلاً من العلف الخاص فيه 🔥
        item = farmAnimals.find(i => normalize(i.name) === input || String(i.id).toLowerCase() === nameOrID.toLowerCase());
        if (item) return { ...item, type: 'farm' };

        item = seedsData.find(i => normalize(i.name) === input || String(i.id).toLowerCase() === nameOrID.toLowerCase());
        if (item) return { ...item, type: 'seed' };

        item = feedItems.find(i => normalize(i.name) === input || String(i.id).toLowerCase() === nameOrID.toLowerCase());
        if (item) return { ...item, type: 'feed' };

        return null;
    }
};
