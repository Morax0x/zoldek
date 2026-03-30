const { SlashCommandBuilder, EmbedBuilder, Colors, MessageFlags } = require("discord.js");
const { startDungeon } = require("../../handlers/dungeon-handler.js");
const { manageTickets } = require("../../handlers/dungeon/utils.js");

const OWNER_ID = "1145327691772481577";
const COOLDOWN_MS = 3 * 60 * 60 * 1000; 

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
        // 🔥 فحص قوي وذكي لمعرفة نوع الأمر (سلاش أو رسالة عادية)
        const isSlash = context.isChatInputCommand && typeof context.isChatInputCommand === 'function' && context.isChatInputCommand();
        let interaction;

        if (isSlash) {
            interaction = context;
            try {
                // حماية من تعليق السلاش 
                if (!interaction.deferred && !interaction.replied) {
                    await interaction.deferReply().catch(()=>{}); 
                }
            } catch(e) {}
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
                
                reply: async (payload) => {
                    const safePayload = { ...payload };
                    delete safePayload.flags; 
                    try {
                        const msg = await context.reply(safePayload);
                        interaction.replied = true;
                        interaction.lastBotReply = msg;
                        return msg;
                    } catch(e) {
                        return context.channel.send(safePayload).catch(()=>{});
                    }
                },
                editReply: async (payload) => {
                    const safePayload = { ...payload };
                    delete safePayload.flags;
                    if (interaction.lastBotReply && interaction.lastBotReply.editable) {
                        return interaction.lastBotReply.edit(safePayload).catch(()=>{});
                    }
                    return context.channel.send(safePayload).catch(()=>{});
                },
                followUp: async (payload) => {
                    const safePayload = { ...payload };
                    delete safePayload.flags;
                    return context.channel.send(safePayload).catch(()=>{});
                },
                deferReply: async () => { interaction.deferred = true; },
                deferUpdate: async () => {},
                isButton: () => false 
            };
        }

        const { client, user, guild } = interaction;
        const db = client.sql;

        // دالة رد للطوارئ تضمن وصول الرد بأي طريقة
        const safeReply = async (payload) => {
            try {
                if (isSlash) {
                    if (interaction.deferred || interaction.replied) return await interaction.editReply(payload);
                    return await interaction.reply(payload);
                } else {
                    return await interaction.reply(payload);
                }
            } catch (e) {
                // إذا فشل كل شيء، ارسل رسالة في الشات كحل أخير
                try {
                    delete payload.flags;
                    await interaction.channel.send({ content: `<@${user.id}>`, ...payload });
                } catch (err) {}
            }
        };

        if (!guild) {
            return await safeReply({ content: "🚫 **عذراً، هذا الأمر يعمل فقط داخل السيرفرات!**", flags: [MessageFlags.Ephemeral] });
        }

        let isAbyssKing = false;
        try {
            const settingsRes = await db.query(`SELECT "roleAbyss" FROM settings WHERE "guild" = $1`, [guild.id]);
            const settings = settingsRes.rows[0];
            if (settings && (settings.roleAbyss || settings.roleabyss) && interaction.member.roles.cache.has(settings.roleAbyss || settings.roleabyss)) {
                isAbyssKing = true;
            }
        } catch (e) {}

        if (user.id !== OWNER_ID && !isAbyssKing) { 
            let userDataRes;
            try { userDataRes = await db.query(`SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2`, [user.id, guild.id]); }
            catch(e) { userDataRes = await db.query(`SELECT * FROM levels WHERE userid = $1 AND guildid = $2`, [user.id, guild.id]).catch(()=>({rows:[]})); }

            let userData = userDataRes.rows[0];
            
            if (!userData) {
                userData = { user: user.id, guild: guild.id, xp: 0, level: 1, mora: 0, last_dungeon: 0 };
            }

            const lastRun = Number(userData.last_dungeon || userData.last_Dungeon || 0);
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

                return await safeReply({ embeds: [cooldownEmbed], flags: [MessageFlags.Ephemeral] });
            }
        }

        try {
            // توجيه الدالة الصحيحة من dungeon-handler.js
            await startDungeon(interaction, db);
        } catch (err) {
            console.error("[Dungeon Command Error]", err);
            await safeReply({ content: "❌ حدث خطأ تقني أثناء بدء الدانجون.", flags: [MessageFlags.Ephemeral] });
        }
    }
};
