const { SlashCommandBuilder, EmbedBuilder, Colors, MessageFlags } = require("discord.js");
const { startDungeon } = require("../../handlers/dungeon-handler.js");
const { manageTickets } = require("../../handlers/dungeon/utils.js");

const OWNER_ID = "1145327691772481577";
const COOLDOWN_MS = 3 * 60 * 60 * 1000; // 🔥 تم زيادة وقت الانتظار إلى 3 ساعات

module.exports = {
    data: new SlashCommandBuilder()
        .setName('dungeon')
        .setDescription('⚔️ ادخل الدانجون وحارب الوحوش !')
        .setDMPermission(false),

    name: 'dungeon',
    aliases: ['دانجون', 'برج', 'dgn'],
    category: "Economy",
    description: "نظام الدانجون المتقدم (PvE)",

    async execute(context, args) {
        const isSlash = context.isChatInputCommand === true;
        let interaction;

        // 🛡️ توحيد بيئة العمل لكي تتعامل دالة startDungeon براحة سواء كان سلاش أو بريفكس
        if (isSlash) {
            interaction = context;
        } else {
            interaction = {
                user: context.author,
                guild: context.guild,
                member: context.member,
                channel: context.channel,
                client: context.client,
                id: context.id,
                isChatInputCommand: false,
                deferred: false,
                replied: false,
                
                // دالة رد ذكية تحفظ الرسالة الأصلية لكي يتم تعديلها لاحقاً
                reply: async (payload) => {
                    const safePayload = { ...payload };
                    delete safePayload.flags; // الرسائل العادية لا تدعم Ephemeral 
                    const msg = await context.reply(safePayload);
                    interaction.replied = true;
                    interaction.lastBotReply = msg;
                    return msg;
                },
                editReply: async (payload) => {
                    const safePayload = { ...payload };
                    delete safePayload.flags;
                    if (interaction.lastBotReply) return interaction.lastBotReply.edit(safePayload);
                    return context.channel.send(safePayload);
                },
                followUp: async (payload) => {
                    const safePayload = { ...payload };
                    delete safePayload.flags;
                    return context.channel.send(safePayload);
                },
                deferReply: async () => { interaction.deferred = true; },
                deferUpdate: async () => {},
                isButton: () => false 
            };
        }

        const { client, user, guild } = interaction;
        const db = client.sql;

        if (!guild) {
            const errPayload = { content: "🚫 **عذراً، هذا الأمر يعمل فقط داخل السيرفرات!**", flags: [MessageFlags.Ephemeral] };
            return isSlash ? interaction.reply(errPayload) : interaction.reply(errPayload).then(m => setTimeout(()=>m.delete().catch(()=>null), 5000));
        }

        try {
            await db.query(`ALTER TABLE levels ADD COLUMN IF NOT EXISTS "last_dungeon" BIGINT DEFAULT 0`);
            await db.query(`ALTER TABLE levels ADD COLUMN IF NOT EXISTS "dungeon_tickets" INTEGER DEFAULT 0`);
            await db.query(`ALTER TABLE levels ADD COLUMN IF NOT EXISTS "last_ticket_reset" TEXT DEFAULT ''`);
            await db.query(`CREATE TABLE IF NOT EXISTS dungeon_saves ("hostID" TEXT PRIMARY KEY, "guildID" TEXT, "floor" INTEGER, "timestamp" BIGINT)`);
        } catch (ignored) {}

        let isAbyssKing = false;
        try {
            const settingsRes = await db.query(`SELECT "roleAbyss" FROM settings WHERE "guild" = $1`, [guild.id]);
            const settings = settingsRes.rows[0];
            if (settings && (settings.roleAbyss || settings.roleabyss) && interaction.member.roles.cache.has(settings.roleAbyss || settings.roleabyss)) {
                isAbyssKing = true;
            }
        } catch (e) {}

        // التحقق من مهلة الدانجون (Cooldown)
        if (user.id !== OWNER_ID && !isAbyssKing) { 
            let userData = await client.getLevel(user.id, guild.id);
            
            if (!userData) {
                userData = { user: user.id, guild: guild.id, xp: 0, level: 1, mora: 0 };
                await db.query(`INSERT INTO levels ("user", "guild", "xp", "level", "mora") VALUES ($1, $2, 0, 1, 0)`, [user.id, guild.id]);
            }

            const lastRun = Number(userData.last_dungeon) || 0;
            const now = Date.now();
            const diff = now - lastRun;

            if (diff < COOLDOWN_MS) {
                const limitInfo = await manageTickets(user.id, guild.id, db, 'check', interaction.member);
                const readyTimestamp = Math.floor((lastRun + COOLDOWN_MS) / 1000);

                const cooldownEmbed = new EmbedBuilder()
                    .setTitle('✥ اسـتـراحـة مـحـارب !')
                    .setDescription(
                        `★ رويـدك ايهـا المحارب ارتح قليلا قبل غزو الدانجون مجددا !\n\n` +
                        `★ يمكنك غـزو الدانجـون:\n ★ <t:${readyTimestamp}:R>\n\n` + 
                        `★ لديـك **(${limitInfo.tickets}/${limitInfo.max})** تذكرة يمكنك الانضمام لفريق آخر`
                    )
                    .setThumbnail('https://i.postimg.cc/4xMWNV22/doun.png')
                    .setColor(Math.floor(Math.random() * 0xFFFFFF));

                const payload = { 
                    embeds: [cooldownEmbed], 
                    flags: [MessageFlags.Ephemeral] 
                };

                return await interaction.reply(payload);
            }
        }

        // إذا كان المالك أو سيد الهاوية، نرسل الرسالة دون أن نعطل الرد الرئيسي لـ startDungeon
        if (isAbyssKing && user.id !== OWNER_ID) {
            const kingPayload = { content: "👑 **ملك الهاوية! أبواب الدانجون تفتح لك بلا قيود أو انتظار.**" };
            if (isSlash) {
                await interaction.reply({ ...kingPayload, flags: [MessageFlags.Ephemeral] }).catch(()=>{});
            } else {
                interaction.channel.send(kingPayload).then(m => setTimeout(()=>m.delete().catch(()=>null), 5000));
            }
        }

        try {
            // تنفيذ كود الدانجون الخارجي (الذي سيقوم بالرد وتعديل الرسالة)
            await startDungeon(interaction, db);
        } catch (err) {
            console.error("[Dungeon Command Error]", err);
            const errMsg = { content: "❌ حدث خطأ تقني أثناء بدء الدانجون.", flags: [MessageFlags.Ephemeral] };
            
            try {
                if (interaction.replied || interaction.deferred) await interaction.followUp(errMsg);
                else await interaction.reply(errMsg);
            } catch (e) {} // تجاهل الأخطاء إذا كانت الرسالة ممسوحة أصلاً
        }
    }
};
