const { SlashCommandBuilder, PermissionsBitField, EmbedBuilder } = require('discord.js');

function recalculateLevel(totalXP) {
    if (totalXP < 0) totalXP = 0;
    let level = 0; 
    let xp = totalXP;
    let nextXP = 100; 
    while (xp >= nextXP) {
        xp -= nextXP;
        level++;
        nextXP = 5 * (level ** 2) + (50 * level) + 100;
    }
    return { level: level + 1, xp: Math.floor(xp), totalXP: totalXP };
}

function calculateTotalXP(level) {
    if (level <= 1) return 0;
    let totalXP = 0;
    for (let i = 0; i < (level - 1); i++) {
        totalXP += (5 * (i ** 2) + (50 * i) + 100);
    }
    return totalXP;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leveladmin')
        .setDescription('لوحة التحكم الشاملة بنظام المستويات (للمشرفين)')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
        
        .addSubcommand(subcommand => subcommand.setName('add').setDescription('إضافة مستويات لعضو')
            .addUserOption(option => option.setName('user').setDescription('العضو').setRequired(true))
            .addIntegerOption(option => option.setName('amount').setDescription('الكمية').setRequired(true)))
        
        .addSubcommand(subcommand => subcommand.setName('remove').setDescription('إزالة مستويات من عضو')
            .addUserOption(option => option.setName('user').setDescription('العضو').setRequired(true))
            .addIntegerOption(option => option.setName('amount').setDescription('الكمية').setRequired(true)))
        
        .addSubcommand(subcommand => subcommand.setName('set').setDescription('تحديد مستوى معين لعضو')
            .addUserOption(option => option.setName('user').setDescription('العضو').setRequired(true))
            .addIntegerOption(option => option.setName('level').setDescription('المستوى الجديد').setRequired(true)))
        
        .addSubcommand(subcommand => subcommand.setName('xp').setDescription('إضافة أو إزالة خبرة (XP)')
            .addStringOption(option => option.setName('action').setDescription('العملية').setRequired(true).addChoices({ name: 'إضافة', value: 'add' }, { name: 'إزالة', value: 'remove' }))
            .addUserOption(option => option.setName('user').setDescription('العضو').setRequired(true))
            .addIntegerOption(option => option.setName('amount').setDescription('الكمية').setRequired(true)))

        .addSubcommand(subcommand => subcommand.setName('channel').setDescription('تحديد قناة إشعارات التلفيل')
            .addChannelOption(option => option.setName('target').setDescription('القناة (اتركه فارغاً للوضع الافتراضي)').setRequired(false)))
        
        .addSubcommand(subcommand => subcommand.setName('message').setDescription('تخصيص رسالة التلفيل')
            .addStringOption(option => option.setName('action').setDescription('الخيار').setRequired(true).addChoices({ name: 'نمط الإمبراطورية', value: 'empire' }, { name: 'نص مخصص', value: 'custom' }, { name: 'عرض الحالي', value: 'show' }, { name: 'إعادة ضبط', value: 'reset' }))
            .addStringOption(option => option.setName('text').setDescription('النص المخصص (إذا اخترت نص مخصص)').setRequired(false)))

        .addSubcommand(subcommand => subcommand.setName('reward').setDescription('إعداد الرتب التلقائية للمستويات')
            .addStringOption(option => option.setName('action').setDescription('العملية').setRequired(true).addChoices({ name: 'إضافة', value: 'add' }, { name: 'حذف', value: 'remove' }, { name: 'عرض الكل', value: 'show' }))
            .addIntegerOption(option => option.setName('level').setDescription('المستوى').setRequired(false))
            .addRoleOption(option => option.setName('role').setDescription('الرتبة').setRequired(false)))

        .addSubcommand(subcommand => subcommand.setName('rolebuff').setDescription('تحديد بف دائم لرتبة معينة')
            .addRoleOption(option => option.setName('role').setDescription('الرتبة').setRequired(true))
            .addIntegerOption(option => option.setName('percent').setDescription('النسبة المئوية (مثال: 50)').setRequired(true)))
        
        .addSubcommand(subcommand => subcommand.setName('userbuff').setDescription('إعطاء بف مؤقت لعضو')
            .addUserOption(option => option.setName('user').setDescription('العضو').setRequired(true))
            .addIntegerOption(option => option.setName('percent').setDescription('النسبة المئوية').setRequired(true))
            .addIntegerOption(option => option.setName('hours').setDescription('عدد الساعات').setRequired(true))),

    name: 'leveladmin',
    aliases: ['la', 'add-level', 'remove-level', 'set-level', 'xp', 'setlevelchannel', 'setlevelmessage', 'role-level', 'setlevelrole', 'set-role-buff', 'give-buff'],
    category: "Leveling",
    description: "إدارة شاملة لنظام المستويات",

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        const client = interactionOrMessage.client;
        const db = client.sql;
        const guild = interactionOrMessage.guild;
        
        if (!guild) return;
        const guildId = guild.id;

        const member = isSlash ? interactionOrMessage.member : interactionOrMessage.member;
        if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            const err = '🚫 لا تملك صلاحية `ManageGuild` لاستخدام هذا الأمر!';
            return isSlash ? interactionOrMessage.reply({ content: err, ephemeral: true }) : interactionOrMessage.reply(err);
        }

        try {
            await db.query(`CREATE TABLE IF NOT EXISTS level_roles ("guildID" TEXT, "roleID" TEXT, "level" INTEGER)`);
            await db.query(`CREATE TABLE IF NOT EXISTS role_buffs ("guildID" TEXT, "roleID" TEXT, "buffPercent" INTEGER)`);
            await db.query(`CREATE TABLE IF NOT EXISTS user_buffs ("guildID" TEXT, "userID" TEXT, "buffPercent" INTEGER, "expiresAt" BIGINT, "buffType" TEXT, "multiplier" REAL)`);
            
            // 🔥 إضافة عمود قناة التلفيل لحل مشكلة عدم الحفظ 🔥
            try { await db.query(`ALTER TABLE settings ADD COLUMN "levelChannel" TEXT`); } catch(e) {}
            try { await db.query(`ALTER TABLE settings ADD COLUMN levelchannel TEXT`); } catch(e) {}
        } catch(e) {}

        let subcommand = '';
        let targetUser = null;
        let amount = null;
        let actionStr = '';
        let textInput = '';
        let targetChannel = null;
        let targetRole = null;
        let hoursInput = null;

        if (isSlash) {
            subcommand = interactionOrMessage.options.getSubcommand();
            targetUser = interactionOrMessage.options.getMember('user');
            amount = interactionOrMessage.options.getInteger('amount') ?? interactionOrMessage.options.getInteger('level') ?? interactionOrMessage.options.getInteger('percent');
            actionStr = interactionOrMessage.options.getString('action') || '';
            textInput = interactionOrMessage.options.getString('text') || '';
            targetChannel = interactionOrMessage.options.getChannel('target');
            targetRole = interactionOrMessage.options.getRole('role');
            hoursInput = interactionOrMessage.options.getInteger('hours');
            await interactionOrMessage.deferReply();
        } else {
            const cmdName = interactionOrMessage.content.split(' ')[0].toLowerCase().slice(1); 
            
            if (cmdName === 'la' || cmdName === 'leveladmin') {
                const subArg = args[0] ? args[0].toLowerCase() : '';
                if (['add', 'remove', 'set'].includes(subArg)) {
                    subcommand = subArg; targetUser = interactionOrMessage.mentions.members.first(); amount = parseInt(args[2]);
                } else if (subArg === 'xp') {
                    subcommand = 'xp'; actionStr = args[1]; targetUser = interactionOrMessage.mentions.members.first(); amount = parseInt(args[3]);
                } else if (subArg === 'channel') {
                    subcommand = 'channel'; targetChannel = args[1] === 'reset' ? 'reset' : interactionOrMessage.mentions.channels.first();
                } else if (subArg === 'message') {
                    subcommand = 'message'; actionStr = args[1]; textInput = args.slice(2).join(' ');
                } else if (subArg === 'reward') {
                    subcommand = 'reward'; actionStr = args[1] || 'add'; amount = parseInt(args[2]); targetRole = interactionOrMessage.mentions.roles.first();
                } else if (subArg === 'rolebuff') {
                    subcommand = 'rolebuff'; targetRole = interactionOrMessage.mentions.roles.first(); amount = parseInt(args[2]);
                } else if (subArg === 'userbuff') {
                    subcommand = 'userbuff'; targetUser = interactionOrMessage.mentions.members.first(); amount = parseInt(args[2]); hoursInput = parseInt(args[3]);
                }
            } else {
                if (cmdName.includes('add-level')) { subcommand = 'add'; targetUser = interactionOrMessage.mentions.members.first(); amount = parseInt(args[1]); }
                else if (cmdName.includes('remove-level')) { subcommand = 'remove'; targetUser = interactionOrMessage.mentions.members.first(); amount = parseInt(args[1]); }
                else if (cmdName.includes('set-level')) { subcommand = 'set'; targetUser = interactionOrMessage.mentions.members.first(); amount = parseInt(args[1]); }
                else if (cmdName.includes('xp')) { subcommand = 'xp'; actionStr = args[0]; targetUser = interactionOrMessage.mentions.members.first(); amount = parseInt(args[2]); }
                else if (cmdName.includes('setlevelchannel')) { subcommand = 'channel'; targetChannel = args[0] === 'reset' ? 'reset' : interactionOrMessage.mentions.channels.first(); }
                else if (cmdName.includes('setlevelmessage')) { subcommand = 'message'; actionStr = args[0]; textInput = args.slice(1).join(' '); }
                else if (cmdName.includes('role-level') || cmdName.includes('setlevelrole')) { subcommand = 'reward'; actionStr = args[0] || 'add'; amount = parseInt(args[1]); targetRole = interactionOrMessage.mentions.roles.first(); }
                else if (cmdName.includes('set-role-buff')) { subcommand = 'rolebuff'; targetRole = interactionOrMessage.mentions.roles.first(); amount = parseInt(args[1]); }
                else if (cmdName.includes('give-buff')) { subcommand = 'userbuff'; targetUser = interactionOrMessage.mentions.members.first(); amount = parseInt(args[1]); hoursInput = parseInt(args[2]); }
            }
        }

        const reply = async (payload) => {
            if (isSlash) return interactionOrMessage.editReply(payload);
            return interactionOrMessage.reply(payload);
        };

        if (!subcommand) return reply("❌ صيغة الأمر خاطئة. يرجى التأكد من كتابة الأمر بشكل صحيح.");

        try {
            if (['add', 'remove', 'set', 'xp'].includes(subcommand)) {
                if (!targetUser || isNaN(amount) || amount === null) return reply("❌ بيانات غير مكتملة (يرجى تحديد العضو والرقم).");
                
                let score = await client.getLevel(targetUser.id, guildId);
                if (!score) score = { ...client.defaultData, user: targetUser.id, guild: guildId };
                
                score.level = Number(score.level) || 1;
                score.xp = Number(score.xp) || 0;
                score.totalXP = Number(score.totalxp || score.totalXP) || 0;
                const oldLevel = score.level;
                let embed = new EmbedBuilder().setColor("Green");

                if (subcommand === 'add') {
                    const newLvl = score.level + amount;
                    score.level = newLvl; score.xp = 0; score.totalXP = calculateTotalXP(newLvl);
                    embed.setTitle(`Success!`).setDescription(`✅ تمت إضافة **${amount}** مستوى لـ ${targetUser}!\nالمستوى الجديد: **${score.level}**`);
                } 
                else if (subcommand === 'remove') {
                    const newLvl = Math.max(1, score.level - amount);
                    const rec = recalculateLevel(calculateTotalXP(newLvl));
                    score.level = rec.level; score.xp = rec.xp; score.totalXP = rec.totalXP;
                    embed.setTitle(`Success!`).setDescription(`✅ تمت إزالة **${amount}** مستوى من ${targetUser}!\nالمستوى الجديد: **${score.level}**`);
                } 
                else if (subcommand === 'set') {
                    const rec = recalculateLevel(calculateTotalXP(amount));
                    score.level = rec.level; score.xp = rec.xp; score.totalXP = rec.totalXP;
                    embed.setTitle(`Success!`).setDescription(`✅ تم تحديد مستوى ${targetUser} إلى **${amount}**!`);
                } 
                else if (subcommand === 'xp') {
                    let newTot = actionStr === 'add' ? score.totalXP + amount : Math.max(0, score.totalXP - amount);
                    const rec = recalculateLevel(newTot);
                    score.level = rec.level; score.xp = rec.xp; score.totalXP = rec.totalXP;
                    embed.setTitle(actionStr === 'add' ? `✅ تمت إضافة خبرة` : `🗑️ تمت إزالة خبرة`).setDescription(`الخبرة الحالية: **${score.xp}** | المستوى: **${score.level}** لـ ${targetUser}`);
                }

                await client.setLevel(score);
                if (score.level !== oldLevel && client.checkAndAwardLevelRoles) {
                    await client.checkAndAwardLevelRoles(targetUser, score.level);
                }
                return reply({ embeds: [embed] });
            }

            // 🔥 الإصلاح الجذري لقسم قناة الإشعارات 🔥
            if (subcommand === 'channel') {
                if (!targetChannel || targetChannel === 'reset') {
                    try { await db.query(`INSERT INTO settings ("guild", "levelChannel") VALUES ($1, NULL) ON CONFLICT("guild") DO UPDATE SET "levelChannel" = NULL`, [guildId]); }
                    catch(e) { await db.query(`INSERT INTO settings (guild, levelchannel) VALUES ($1, NULL) ON CONFLICT(guild) DO UPDATE SET levelchannel = NULL`, [guildId]).catch(()=>{}); }
                    return reply("✅ تم العودة للوضع الافتراضي. سيتم إرسال بطاقة اللفل في نفس القناة التي يتفاعل فيها العضو.");
                } else {
                    try { await db.query(`INSERT INTO settings ("guild", "levelChannel") VALUES ($1, $2) ON CONFLICT("guild") DO UPDATE SET "levelChannel" = EXCLUDED."levelChannel"`, [guildId, targetChannel.id]); }
                    catch(e) { await db.query(`INSERT INTO settings (guild, levelchannel) VALUES ($1, $2) ON CONFLICT(guild) DO UPDATE SET levelchannel = EXCLUDED.levelchannel`, [guildId, targetChannel.id]).catch(()=>{}); }
                    return reply(`✅ تم تحديد قناة الإشعارات بنجاح إلى: ${targetChannel}`);
                }
            }

            if (subcommand === 'message') {
                if (actionStr === 'empire') {
                    const desc = "╭⭒★︰ <a:wi:1435572304988868769> {member} <a:wii:1435572329039007889>\\n✶ مبارك صعودك في سُلّم الإمبراطورية\\n★ فقد كـسرت حـاجـز الـمستوى〃{level_old}〃وبلغـت المسـتـوى الـ 〃{level}〃 <a:MugiStronk:1438795606872166462> وتعاظم شأنك بين جموع الرعية فامضِ قُدمًا نحو المجد <:2KazumaSalut:1437129108806176768>";
                    try { await db.query(`INSERT INTO settings ("guild", "lvlUpDesc") VALUES ($1, $2) ON CONFLICT ("guild") DO UPDATE SET "lvlUpDesc" = EXCLUDED."lvlUpDesc", "lvlUpTitle" = NULL, "lvlUpImage" = NULL`, [guildId, desc]); }
                    catch(e) { await db.query(`INSERT INTO settings (guild, lvlUpDesc) VALUES ($1, $2) ON CONFLICT (guild) DO UPDATE SET lvlUpDesc = EXCLUDED.lvlUpDesc, lvlUpTitle = NULL, lvlUpImage = NULL`, [guildId, desc]).catch(()=>{}); }
                    return reply("✅ **تم تفعيل رسالة التلفيل بنمط الإمبراطورية!**");
                } 
                else if (actionStr === 'custom' || actionStr === 'desc') {
                    if (!textInput) return reply("❌ يرجى إدخال النص.");
                    try { await db.query(`INSERT INTO settings ("guild", "lvlUpDesc") VALUES ($1, $2) ON CONFLICT ("guild") DO UPDATE SET "lvlUpDesc" = EXCLUDED."lvlUpDesc", "lvlUpTitle" = NULL, "lvlUpImage" = NULL`, [guildId, textInput]); }
                    catch(e) { await db.query(`INSERT INTO settings (guild, lvlUpDesc) VALUES ($1, $2) ON CONFLICT (guild) DO UPDATE SET lvlUpDesc = EXCLUDED.lvlUpDesc, lvlUpTitle = NULL, lvlUpImage = NULL`, [guildId, textInput]).catch(()=>{}); }
                    return reply("✅ تم تحديث النص المخصص لرسالة التلفيل.");
                }
                else if (actionStr === 'reset') {
                    try { await db.query(`INSERT INTO settings ("guild", "lvlUpDesc") VALUES ($1, NULL) ON CONFLICT ("guild") DO UPDATE SET "lvlUpDesc" = NULL, "lvlUpTitle" = NULL, "lvlUpImage" = NULL`, [guildId]); }
                    catch(e) { await db.query(`INSERT INTO settings (guild, lvlUpDesc) VALUES ($1, NULL) ON CONFLICT (guild) DO UPDATE SET lvlUpDesc = NULL, lvlUpTitle = NULL, lvlUpImage = NULL`, [guildId]).catch(()=>{}); }
                    return reply("✅ تم إعادة ضبط رسالة التلفيل للوضع الافتراضي.");
                }
                else if (actionStr === 'show') {
                    let setRes;
                    try { setRes = await db.query(`SELECT "lvlUpDesc" FROM settings WHERE "guild" = $1`, [guildId]); }
                    catch(e) { setRes = await db.query(`SELECT lvlupdesc as "lvlUpDesc" FROM settings WHERE guild = $1`, [guildId]).catch(()=>({rows:[]})); }
                    
                    let rawMsg = setRes.rows[0]?.lvlUpDesc || setRes.rows[0]?.lvlupdesc;
                    let msg = "";
                    if (rawMsg) {
                        msg = rawMsg.replace(/{member}/gi, `<@${interactionOrMessage.member.id}>`).replace(/{level}/gi, `10`).replace(/{level_old}/gi, `9`).replace(/\\n/g, '\n');
                    } else {
                        msg = "لم يتم تخصيص نص (يستخدم النظام الرسالة الافتراضية).";
                    }
                    return reply({ embeds: [new EmbedBuilder().setTitle('معاينة النص الحالي').setDescription(msg).setColor("Blue")] });
                }
            }

            if (subcommand === 'reward') {
                if (actionStr === 'add') {
                    if (!amount || !targetRole) return reply("❌ يرجى تحديد المستوى والرتبة بشكل صحيح.");
                    try {
                        await db.query(`DELETE FROM level_roles WHERE "guildID" = $1 AND "level" = $2`, [guildId, amount]);
                        await db.query(`INSERT INTO level_roles ("guildID", "roleID", "level") VALUES ($1, $2, $3)`, [guildId, targetRole.id, amount]);
                    } catch(e) {
                        await db.query(`DELETE FROM level_roles WHERE guildid = $1 AND level = $2`, [guildId, amount]).catch(()=>{});
                        await db.query(`INSERT INTO level_roles (guildid, roleid, level) VALUES ($1, $2, $3)`, [guildId, targetRole.id, amount]).catch(()=>{});
                    }
                    return reply(`✅ تم الإعداد: سيحصل الأعضاء على رتبة ${targetRole} عند الوصول للمستوى **${amount}**.`);
                } 
                else if (actionStr === 'remove' || actionStr === 'delete') {
                    if (!amount) return reply("❌ يرجى تحديد المستوى المراد حذف رتبته.");
                    try { await db.query(`DELETE FROM level_roles WHERE "guildID" = $1 AND "level" = $2`, [guildId, amount]); }
                    catch(e) { await db.query(`DELETE FROM level_roles WHERE guildid = $1 AND level = $2`, [guildId, amount]).catch(()=>{}); }
                    return reply(`✅ تم حذف رتبة المكافأة الخاصة بالمستوى **${amount}**.`);
                }
                else if (actionStr === 'show' || actionStr === 'list') {
                    let rolesRes;
                    try { rolesRes = await db.query(`SELECT * FROM level_roles WHERE "guildID" = $1 ORDER BY "level" ASC`, [guildId]); }
                    catch(e) { rolesRes = await db.query(`SELECT * FROM level_roles WHERE guildid = $1 ORDER BY level ASC`, [guildId]).catch(()=>({rows:[]})); }
                    
                    if (rolesRes.rows.length === 0) return reply("⚠️ لا توجد رتب مكافآت مضافة في السيرفر حالياً.");
                    let desc = rolesRes.rows.map(r => `🔹 **مستوى ${r.level}**: <@&${r.roleID || r.roleid}>`).join('\n');
                    return reply({ embeds: [new EmbedBuilder().setTitle('📜 قائمة رتب التلفيل التلقائية').setDescription(desc).setColor('Blue')] });
                }
            }

            if (subcommand === 'rolebuff') {
                if (!targetRole || isNaN(amount) || amount === null) return reply("❌ يرجى تحديد الرتبة والنسبة (مثال: 50).");
                try { await db.query(`DELETE FROM role_buffs WHERE "roleID" = $1`, [targetRole.id]); }
                catch(e) { await db.query(`DELETE FROM role_buffs WHERE roleid = $1`, [targetRole.id]).catch(()=>{}); }
                
                if (amount !== 0) {
                    try { await db.query(`INSERT INTO role_buffs ("guildID", "roleID", "buffPercent") VALUES ($1, $2, $3)`, [guildId, targetRole.id, amount]); }
                    catch(e) { await db.query(`INSERT INTO role_buffs (guildid, roleid, buffpercent) VALUES ($1, $2, $3)`, [guildId, targetRole.id, amount]).catch(()=>{}); }
                    return reply(`✅ تم تعيين مضاعف خبرة (Buff) للرتبة ${targetRole} بنسبة **+${amount}%**.`);
                }
                return reply(`✅ تم إزالة البف من الرتبة ${targetRole}.`);
            }

            if (subcommand === 'userbuff') {
                if (!targetUser || isNaN(amount) || isNaN(hoursInput) || amount === null) return reply("❌ يرجى تحديد العضو، النسبة المئوية، وعدد الساعات.");
                const expiresAt = Date.now() + (hoursInput * 60 * 60 * 1000);
                const multiplier = amount / 100;
                try { await db.query(`INSERT INTO user_buffs ("guildID", "userID", "buffPercent", "expiresAt", "buffType", "multiplier") VALUES ($1, $2, $3, $4, $5, $6)`, [guildId, targetUser.id, amount, expiresAt, 'xp', multiplier]); }
                catch(e) { await db.query(`INSERT INTO user_buffs (guildid, userid, buffpercent, expiresat, bufftype, multiplier) VALUES ($1, $2, $3, $4, $5, $6)`, [guildId, targetUser.id, amount, expiresAt, 'xp', multiplier]).catch(()=>{}); }
                
                return reply(`✅ تم إعطاء مضاعف خبرة **+${amount}%** للعضو ${targetUser} لمدة **${hoursInput}** ساعة.`);
            }

        } catch (err) {
            console.error("Level Admin Command Error:", err);
            reply("❌ حدث خطأ داخلي أثناء معالجة الطلب في قاعدة البيانات.");
        }
    }
};
