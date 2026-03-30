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
        let interaction;
        const isSlash = context.isChatInputCommand && typeof context.isChatInputCommand === 'function' && context.isChatInputCommand();

        // 🔥 نظام حماية خارق يمنع البوت من الموت بصمت 🔥
        try {
            if (isSlash) {
                interaction = context;
                if (!interaction.deferred && !interaction.replied) {
                    await interaction.deferReply().catch(()=>{}); 
                }
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
                        const msg = await context.reply(safePayload).catch(()=>null);
                        interaction.replied = true;
                        interaction.lastBotReply = msg;
                        return msg;
                    },
                    editReply: async (payload) => {
                        const safePayload = { ...payload };
                        delete safePayload.flags;
                        if (interaction.lastBotReply) return interaction.lastBotReply.edit(safePayload).catch(()=>null);
                        return context.channel.send(safePayload).catch(()=>null);
                    },
                    followUp: async (payload) => {
                        const safePayload = { ...payload };
                        delete safePayload.flags;
                        return context.channel.send(safePayload).catch(()=>null);
                    },
                    deferReply: async () => { interaction.deferred = true; },
                    deferUpdate: async () => {},
                    isButton: () => false 
                };
            }

            const { client, user, guild } = interaction;
            const db = client.sql || client.db; 

            const safeReply = async (payload) => {
                try {
                    if (isSlash) {
                        if (interaction.deferred || interaction.replied) return await interaction.editReply(payload);
                        return await interaction.reply(payload);
                    } else {
                        return await interaction.reply(payload);
                    }
                } catch (e) {
                    try {
                        delete payload.flags;
                        await interaction.channel.send({ content: `<@${user.id}>`, ...payload });
                    } catch (err) {}
                }
            };

            if (!guild) return await safeReply({ content: "🚫 **تعمل فقط داخل السيرفرات!**", flags: [MessageFlags.Ephemeral] });
            if (!db) return await safeReply({ content: "🚫 **قاعدة البيانات غير متصلة!**", flags: [MessageFlags.Ephemeral] });

            let isAbyssKing = false;
            try {
                let settingsRes = await db.query(`SELECT "roleAbyss" FROM settings WHERE "guild" = $1`, [guild.id]).catch(()=>({rows:[]}));
                if (!settingsRes.rows.length) settingsRes = await db.query(`SELECT roleabyss FROM settings WHERE guildid = $1`, [guild.id]).catch(()=>({rows:[]}));
                
                const settings = settingsRes.rows[0];
                if (settings && (settings.roleAbyss || settings.roleabyss) && interaction.member && interaction.member.roles && interaction.member.roles.cache.has(settings.roleAbyss || settings.roleabyss)) {
                    isAbyssKing = true;
                }
            } catch (e) {}

            if (user.id !== OWNER_ID && !isAbyssKing) { 
                let userDataRes = await db.query(`SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2`, [user.id, guild.id]).catch(()=>({rows:[]}));
                if (!userDataRes.rows.length) userDataRes = await db.query(`SELECT * FROM levels WHERE userid = $1 AND guildid = $2`, [user.id, guild.id]).catch(()=>({rows:[]}));

                let userData = userDataRes.rows[0];
                if (!userData) userData = { user: user.id, guild: guild.id, xp: 0, level: 1, mora: 0, last_dungeon: 0 };

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

            // تشغيل الدانجون بنجاح
            await startDungeon(interaction, db);

        } catch (err) {
            // هذا الجزء رح يطبع لك الخطأ بالضبط في الشات لو صار أي خلل
            console.error("[Dungeon Mastery Error]", err);
            const errMsg = { content: `❌ **حدث خطأ فني أثناء بدء الدانجون:**\n\`\`\`js\n${err.message}\n\`\`\``, flags: [MessageFlags.Ephemeral] };
            try {
                if (isSlash && (context.deferred || context.replied)) await context.editReply(errMsg).catch(()=>context.channel.send(errMsg));
                else await context.reply(errMsg).catch(()=>context.channel.send(errMsg));
            } catch (e) {} 
        }
    }
};
