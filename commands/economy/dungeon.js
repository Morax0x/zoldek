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
        // 🔥 تغليف كامل للكود في try-catch لمنع الموت الصامت 🔥
        try {
            const isSlash = !!(context.isChatInputCommand && context.isChatInputCommand());
            let interaction;

            if (isSlash) {
                interaction = context;
                // تأمين الرد الأولي لضمان عدم تعليق الديسكورد
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
                        const p = { ...payload }; delete p.flags;
                        const msg = await context.reply(p);
                        interaction.replied = true;
                        interaction.lastBotReply = msg;
                        return msg;
                    },
                    editReply: async (payload) => {
                        const p = { ...payload }; delete p.flags;
                        if (interaction.lastBotReply && interaction.lastBotReply.editable) {
                            return await interaction.lastBotReply.edit(p);
                        }
                        const msg = await context.channel.send(p);
                        interaction.lastBotReply = msg;
                        return msg;
                    },
                    followUp: async (payload) => {
                        const p = { ...payload }; delete p.flags;
                        return await context.channel.send(p);
                    },
                    fetchReply: async () => interaction.lastBotReply,
                    deferReply: async () => { interaction.deferred = true; },
                    deferUpdate: async () => {},
                    isButton: () => false 
                };
            }

            const { client, user, guild } = interaction;
            const db = client.sql || client.db;

            if (!guild) return await interaction.editReply({ content: "🚫 **يعمل في السيرفرات فقط!**" }).catch(()=>{});
            if (!db) return await interaction.editReply({ content: "🚫 **قاعدة البيانات غير متصلة!**" }).catch(()=>{});

            let isAbyssKing = false;
            try {
                let sRes = await db.query(`SELECT "roleAbyss" FROM settings WHERE "guild" = $1`, [guild.id]).catch(()=>({rows:[]}));
                if (!sRes.rows.length) sRes = await db.query(`SELECT roleabyss FROM settings WHERE guildid = $1`, [guild.id]).catch(()=>({rows:[]}));
                
                const settings = sRes.rows[0];
                if (settings && (settings.roleAbyss || settings.roleabyss) && interaction.member?.roles?.cache?.has(settings.roleAbyss || settings.roleabyss)) {
                    isAbyssKing = true;
                }
            } catch (e) {}

            if (user.id !== OWNER_ID && !isAbyssKing) { 
                let uRes = await db.query(`SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2`, [user.id, guild.id]).catch(()=>({rows:[]}));
                if (!uRes.rows.length) uRes = await db.query(`SELECT * FROM levels WHERE userid = $1 AND guildid = $2`, [user.id, guild.id]).catch(()=>({rows:[]}));

                let uData = uRes.rows[0] || { last_dungeon: 0 };
                const lastRun = Number(uData.last_dungeon || uData.last_Dungeon || 0);
                const diff = Date.now() - lastRun;

                if (diff < COOLDOWN_MS) {
                    const limitInfo = await manageTickets(user.id, guild.id, db, 'check', interaction.member);
                    const ready = Math.floor((lastRun + COOLDOWN_MS) / 1000);

                    const cEmbed = new EmbedBuilder()
                        .setTitle('✥ اسـتـراحـة مـحـارب !')
                        .setDescription(`★ رويـدك ايهـا المحارب ارتح قليلا قبل غزو الدانجون مجددا !\n\n★ يمكنك غـزو الدانجـون:\n ★ <t:${ready}:R>\n\n★ لديـك **(${limitInfo.tickets}/${limitInfo.max})** تذكرة يمكنك الانضمام لفريق آخر`)
                        .setThumbnail('https://i.postimg.cc/4xMWNV22/doun.png')
                        .setColor('Random');

                    return await interaction.editReply({ embeds: [cEmbed], flags: [MessageFlags.Ephemeral] }).catch(()=>{});
                }
            }

            // تشغيل الدانجون الحقيقي
            await startDungeon(interaction, db);

        } catch (err) {
            // 🔥 هنا نقطة الحماية العظمى، إذا صار خطأ بيطبع لك السبب فوراً 🔥
            console.error("[Dungeon Critical Error]:", err);
            const errStr = `❌ **عطل فني في الدانجون:**\n\`\`\`js\n${err.message}\n\`\`\``;
            if (context.channel) await context.channel.send(errStr).catch(()=>{});
        }
    }
};
