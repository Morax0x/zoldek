const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, Colors, Collection, MessageFlags } = require("discord.js");
const { calculateMoraBuff } = require('../../streak-handler.js'); 

let updateGuildStat;
try {
    ({ updateGuildStat } = require('../../handlers/guild-board-handler.js'));
} catch (e) {}

const EMOJI_MORA = '<:mora:1435647151349698621>';
const MIN_BET = 10;
const MAX_BET_SOLO = 100; 
const COOLDOWN_MS = 1 * 60 * 60 * 1000; 
const MAX_LOAN_BET = 500; 
const OWNER_ID = "1145327691772481577"; 
const RACE_ICONS = ['🐎', '🦄', '🦓', '🐪', '🐂', '🐆', '🐢', '🐉', '🦖', '🐇'];
const TRACK_LENGTH = 20;

const STUCK_TIMEOUT = 2 * 60 * 1000; 

const COMMENTS = [
    "🌯 أحد الخيول وقف يطلب شاورما!",
    "☕ الحصان تعب.. يبي له كرك يعدل المزاج!",
    "🚀 يا ساتر! انطلاقة صاروخية لا تصدق!",
    "👀 الحكم يطالع في الجوال والخيول تغش!",
    "🐢 سباق سلاحف ولا خيول هذا؟ تحركوا!",
    "💸 الجمهور يطالب باسترجاع فلوس التذاكر!",
    "⚡ سرعة خيالية! هل مركب تيربو؟",
    "🥕 حصانك شاف جزرة ووقف ياكلها!",
    "🌪️ عاصفة غبارية تقلب الموازين!",
    "🛌 أحد المتسابقين قرر ياخذ قيلولة!",
    "😱 منافسة أشرس من خصم الراتب!",
    "📸 سيلفي مع الجمهور قبل خط النهاية!",
    "🦵 عرقلة واضحة! وين الـ VAR؟",
    "🦁 الأسد يطارد المتصدر.. اهرب!",
    "🧼 الأرضية زلقة.. انتبهوا من الزحلقة!",
    "🚑 الإسعاف وصل.. خيلك دايخ!",
    "💃 الخيل قام يرقص بنص الحلبة!",
    "📱 فارس مشغول يصور سناب!",
    "🛑 إشارة حمراء بنص الحلبة.. الكل وقف!",
    "🦟 ذبانة دخلت في عين المتصدر!",
    "🐸 ضفدع عملاق يعترض الطريق!",
    "🍌 قشرة موز.. وزززحححلقة!",
    "👻 يقولون في جنّي يدف الحصان الأخير!",
    "🛒 أحد الخيول راح البقالة ورجع!",
    "🚜 الحصان قلب تراكتر وبدأ يحرث الأرض!",
    "📡 انقطع الاتصال مع الفارس!",
    "🔋 بطارية الحصان خلصت.. اشحنوه!",
    "🥤 استراحة مياه.. الجو حار!",
    "🎮 المتسابق يفكر إنه يلعب فيفا!",
    "🚽 أحد الخيول طلب إذن يروح الحمام!",
    "🔭 الحكم يحتاج نظارة مو شايف شي!",
    "🎈 بالونة خوفت الخيول ورجعتهم ورا!",
    "🚧 تحويلة مرورية في المسار رقم 3!",
    "🌮 الحصان اشتم ريحة كبسة وراح يركض لها!",
    "🦎 ضب دخل المضمار والخيول هربت!",
    "💍 حصان وقف يخطب فرس بنص السباق!",
    "🚁 هليكوبتر الشرطة تلاحق المتصدر للسرعة الزائدة!",
    "🤡 مهرج نزل الحلبة وضحك الخيول!",
    "🧊 الأرضية تجمدت! الخيول تتزحلق!",
    "🔥 حماس المعلق خلى الحصان يركض أسرع!",
    "🥊 ملاكمة مفاجئة بين حصانين في الخلف!",
    "🕶️ الحصان لبس نظارة شمسية وشاف نفسه!",
    "🏃‍♂️ متسابق نزل من الحصان وقام يركض بنفسه!",
    "🛑 رادار ساهر صور الحصان رقم 2!",
    "🕊️ حمامة وقفت على راس المتسابق وشتت انتباهه!",
    "🎶 دي جي اشتغل والخيول قامت تهز!",
    "🧹 عامل النظافة يكنس المضمار والسباق شغال!",
    "💰 كيس فلوس طاح والخيول تهاوشت عليه!",
    "🌧️ مطرت فجأة والخيول خايفة تتبلل!",
    "🚗 سيارة دخلت بالغلط تحسبه شارع عام!",
    "🧙‍♂️ ساحر حول الحصان الأول لأرنب!",
    "💤 الجمهور نام من الملل.. اصحوا!",
    "🍔 راعي الحصان يلوح له ببرجر عشان يسرع!",
    "🧘‍♂️ حصان قرر يسوي يوغا بنص الطريق!"
];

function formatTime(ms) {
    if (ms < 0) ms = 0;
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function safeCleanup(client, gameKey, playerIds) {
    try {
        if (client.activeGames) client.activeGames.delete(gameKey);
        
        if (client.activePlayers) {
            if (Array.isArray(playerIds)) {
                playerIds.forEach(id => {
                    client.activePlayers.delete(`race_${id}`); 
                    if (client.raceTimestamps) client.raceTimestamps.delete(`race_${id}`);
                });
            } else if (playerIds) {
                client.activePlayers.delete(`race_${playerIds}`); 
                if (client.raceTimestamps) client.raceTimestamps.delete(`race_${playerIds}`);
            }
        }
    } catch (e) {
        console.error("[Race Cleanup Error]", e);
    }
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

async function getCooldownReductionMs(db, userId, guildId) {
    try {
        let repRes;
        try { repRes = await db.query(`SELECT "rep_points" FROM user_reputation WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId]); }
        catch(e) { repRes = await db.query(`SELECT rep_points FROM user_reputation WHERE userid = $1 AND guildid = $2`, [userId, guildId]).catch(()=>({rows:[]})); }
        
        const points = repRes.rows[0]?.rep_points || repRes.rows[0]?.rep_points || 0;
        
        let reductionMinutes = 0;
        if (points >= 1000) reductionMinutes = 30;
        else if (points >= 500) reductionMinutes = 15;
        else if (points >= 250) reductionMinutes = 10;
        else if (points >= 100) reductionMinutes = 8;
        else if (points >= 50) reductionMinutes = 7;
        else if (points >= 25) reductionMinutes = 6;
        else if (points >= 10) reductionMinutes = 5;

        return reductionMinutes * 60 * 1000; 
    } catch(e) { return 0; }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('سباق')
        .setDescription('تحدي البوت (فردي) أو أصدقائك (جماعي) في سباق الخيول.')
        .addIntegerOption(option =>
            option.setName('الرهان')
                .setDescription(`المبلغ الذي تريد المراهنة به (اختياري)`)
                .setRequired(false)
                .setMinValue(MIN_BET)
        )
        .addUserOption(option => option.setName('الخصم1').setDescription('الخصم الأول').setRequired(false))
        .addUserOption(option => option.setName('الخصم2').setDescription('الخصم الثاني').setRequired(false))
        .addUserOption(option => option.setName('الخصم3').setDescription('الخصم الثالث').setRequired(false))
        .addUserOption(option => option.setName('الخصم4').setDescription('الخصم الرابع').setRequired(false))
        .addUserOption(option => option.setName('الخصم5').setDescription('الخصم الخامس').setRequired(false)),

    name: 'race',
    aliases: ['سباق', 'سابق', 'سباق_خيول', 'race'],
    category: "Economy",
    description: `تحدي البوت أو تحدي أصدقائك في سباق الخيول.`,

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, author, client, guild, db, channel;
        let betInput, opponents = new Collection();

        try {
            if (isSlash) {
                interaction = interactionOrMessage;
                author = interaction.member;
                client = interaction.client;
                guild = interaction.guild;
                channel = interaction.channel;
                db = client.sql; 
                betInput = interaction.options.getInteger('الرهان');
                for (let i = 1; i <= 5; i++) {
                    const user = interaction.options.getUser(`الخصم${i}`);
                    if (user) {
                        const member = await guild.members.fetch(user.id).catch(() => null);
                        if (member && !member.user.bot && member.id !== author.id) opponents.set(member.id, member);
                    }
                }
                await interaction.deferReply();
            } else {
                message = interactionOrMessage;
                author = message.member;
                client = message.client;
                guild = message.guild;
                channel = message.channel;
                db = client.sql; 
                if (args[0] && !isNaN(parseInt(args[0]))) {
                    betInput = parseInt(args[0]);
                    if (message.mentions.members.size > 0) {
                        message.mentions.members.forEach(member => {
                            if (!member.user.bot && member.id !== author.id) opponents.set(member.id, member);
                        });
                    }
                } else if (message.mentions.members.size > 0) {
                    message.mentions.members.forEach(member => {
                        if (!member.user.bot && member.id !== author.id) opponents.set(member.id, member);
                    });
                    if (args[1] && !isNaN(parseInt(args[1]))) betInput = parseInt(args[1]);
                }
            }

            const reply = async (payload) => {
                if (isSlash) return interaction.editReply(payload);
                return message.channel.send(payload);
            };

            const replyError = async (content) => {
                 const payload = { content, flags: [MessageFlags.Ephemeral] };
                 if (isSlash) return interaction.editReply(payload);
                 return message.reply(payload);
            };

            try { await db.query(`ALTER TABLE levels ADD COLUMN IF NOT EXISTS "lastRace" BIGINT DEFAULT 0`); } catch (e) { }

            if (!client.activeGames) client.activeGames = new Set();
            if (!client.activePlayers) client.activePlayers = new Set();
            if (!client.raceTimestamps) client.raceTimestamps = new Map(); 

            const raceKey = `race_${author.id}`;

            if (client.activePlayers.has(raceKey)) {
                const startTime = client.raceTimestamps.get(raceKey) || 0;
                const timeDiff = Date.now() - startTime;

                if (timeDiff > STUCK_TIMEOUT || startTime === 0) {
                    safeCleanup(client, `${channel.id}-${author.id}`, author.id);
                } else {
                    return reply({ content: `🚫 **لديك سباق جارٍ حالياً!**\nإذا كان السباق معلقاً، سيتم فتحه تلقائياً بعد مرور دقيقتين.`, flags: [MessageFlags.Ephemeral] });
                }
            }

            let row = await client.getLevel(author.id, guild.id);
            if (!row) {
                const defaultD = { ...client.defaultData, user: author.id, guild: guild.id };
                await client.setLevel(defaultD);
                row = defaultD;
            }

            const now = Date.now();
            
            if (author.id !== OWNER_ID) {
                const lastRaceTime = Number(row.lastRace || row.lastrace) || 0; 
                const reductionMs = await getCooldownReductionMs(db, author.id, guild.id);
                const effectiveCooldown = Math.max(0, COOLDOWN_MS - reductionMs);
                const timeLeft = lastRaceTime + effectiveCooldown - now;
                if (timeLeft > 0) {
                    return reply({ content: `🕐 انتظر **\`${formatTime(timeLeft)}\`** قبل التسابق مرة أخرى.` });
                }
            }

            if (!betInput) {
                const userBalance = Number(row.mora) || 0;
                if (userBalance < MIN_BET) return replyError(`❌ لا تملك مورا كافية للعب (الحد الأدنى ${MIN_BET})!`);
                betInput = userBalance < 100 ? userBalance : 100;
            }

            if (isNaN(betInput) || betInput < MIN_BET || !Number.isInteger(betInput)) {
                return replyError(`الحد الأدنى للرهان هو **${MIN_BET}** ${EMOJI_MORA} !`);
            }

            const gameKey = `${channel.id}-${author.id}`; 
            
            if (opponents.size === 0) {
                if (betInput > MAX_BET_SOLO) {
                    return replyError(`🚫 **تنبيه:** الحد الأقصى للرهان في السباق الفردي (ضد البوت) هو **${MAX_BET_SOLO}** ${EMOJI_MORA}!\n(للعب بمبالغ أكبر، تحدى لاعبين آخرين).`);
                }
                
                if (Number(row.mora) < betInput) {
                    return replyError(`ليس لديك مورا كافية لهذا الرهان! (رصيدك: ${row.mora})`);
                }

                client.activePlayers.add(raceKey);
                client.raceTimestamps.set(raceKey, Date.now());
                client.activeGames.add(gameKey);

                return await playSoloRaceSelection(channel, author, betInput, row, db, replyError, reply, client, gameKey);

            } else {
                if (betInput > MAX_LOAN_BET) {
                    const authorLoanRes = await db.query(`SELECT "remainingAmount" FROM user_loans WHERE "userID" = $1 AND "guildID" = $2`, [author.id, guild.id]);
                    const authorLoan = authorLoanRes.rows[0];
                    if (authorLoan && Number(authorLoan.remainingAmount || authorLoan.remainingamount) > 0) {
                        return replyError(`❌ **عذراً!** عليك قرض. حدك الأقصى للرهان الجماعي هو **${MAX_LOAN_BET}** ${EMOJI_MORA} حتى تسدد قرضك.`);
                    }
                    
                    for (const opponent of opponents.values()) {
                        const opponentLoanRes = await db.query(`SELECT "remainingAmount" FROM user_loans WHERE "userID" = $1 AND "guildID" = $2`, [opponent.id, guild.id]);
                        const opponentLoan = opponentLoanRes.rows[0];
                        if (opponentLoan && Number(opponentLoan.remainingAmount || opponentLoan.remainingamount) > 0) {
                            return replyError(`❌ اللاعب ${opponent.displayName} عليه قرض ولا يمكنه المشاركة برهان أعلى من **${MAX_LOAN_BET}**.`);
                        }
                    }
                }

                if (Number(row.mora) < betInput) return replyError(`❌ ليس لديك مورا كافية للرهان! (تحتاج ${betInput})`);
                
                for (const opponent of opponents.values()) {
                    let opData = await client.getLevel(opponent.id, guild.id);
                    if (!opData || Number(opData.mora) < betInput) return replyError(`❌ اللاعب ${opponent.displayName} لا يملك ${betInput} مورا للمشاركة!`);
                    
                    const opKey = `race_${opponent.id}`;
                    if (client.activePlayers.has(opKey)) {
                        const startTime = client.raceTimestamps.get(opKey) || 0;
                        if (Date.now() - startTime < STUCK_TIMEOUT && startTime !== 0) {
                            return replyError(`❌ اللاعب ${opponent.displayName} مشغول في سباق آخر حالياً!`);
                        }
                    }
                }

                client.activeGames.add(gameKey);
                client.activePlayers.add(raceKey);
                client.raceTimestamps.set(raceKey, Date.now());
                
                opponents.forEach(o => {
                    const opKey = `race_${o.id}`;
                    client.activePlayers.add(opKey);
                    client.raceTimestamps.set(opKey, Date.now());
                });

                return await playChallengeRace(channel, author, opponents, betInput, row, db, reply, client, gameKey);
            }

        } catch (err) {
            console.error("[Race Command Error]", err);
            if (author) safeCleanup(client, `${channel?.id}-${author.id}`, author.id);
            const msg = "حدث خطأ غير متوقع.";
            if (interaction && isSlash) interaction.editReply({ content: msg, flags: [MessageFlags.Ephemeral] }).catch(() => {});
            else if (message) message.reply(msg).catch(() => {});
        }
    }
};

async function playSoloRaceSelection(channel, author, bet, authorData, db, replyError, replyFunction, client, gameKey) {
    try {
        authorData.mora = String(Number(authorData.mora) - bet);
        try { await db.query(`UPDATE levels SET "mora" = GREATEST(0, CAST(COALESCE("mora", '0') AS BIGINT) - $1) WHERE "user" = $2 AND "guild" = $3`, [bet, author.id, channel.guild.id]); }
        catch(e) { await db.query(`UPDATE levels SET mora = GREATEST(0, CAST(COALESCE(mora, '0') AS BIGINT) - $1) WHERE userid = $2 AND guildid = $3`, [bet, author.id, channel.guild.id]).catch(()=>{}); }
        await client.setLevel(authorData);

        const shuffledIcons = shuffleArray([...RACE_ICONS]);
        const raceOptions = shuffledIcons.slice(0, 2); 
        
        const buttonStyles = [ButtonStyle.Primary, ButtonStyle.Danger]; 

        const row = new ActionRowBuilder();
        raceOptions.forEach((icon, index) => {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`race_pick_${index}`)
                    .setEmoji(icon) 
                    .setStyle(buttonStyles[index % buttonStyles.length]) 
            );
        });

        const embed = new EmbedBuilder()
            .setTitle('🐎 اختر متسابقك!')
            .setDescription(`تم خصم الرهان: **${bet}** ${EMOJI_MORA}\n\nاضغط على الزر الخاص بالحصان الذي تراهن عليه! لديك 30 ثانية.`)
            .setColor("Blue");

        const msg = await replyFunction({ embeds: [embed], components: [row], fetchReply: true });

        const filter = i => i.user.id === author.id && i.customId.startsWith('race_pick_');
        
        try {
            const selection = await msg.awaitMessageComponent({ filter, time: 30000 });
            await selection.deferUpdate().catch(()=>{});
            
            const selectedIndex = parseInt(selection.customId.split('_')[2]);
            
            if (author.id !== OWNER_ID) {
                 try {
                     await db.query(`UPDATE levels SET "lastRace" = $1 WHERE "user" = $2 AND "guild" = $3`, [Date.now(), author.id, channel.guild.id]);
                     authorData.lastRace = Date.now();
                 } catch (e) {}
            }

            await msg.delete().catch(()=>{});
            await playSoloRace(channel, author, bet, authorData, db, client, gameKey, raceOptions, selectedIndex);

        } catch (e) {
            authorData.mora = String(Number(authorData.mora) + bet);
            try { await db.query(`UPDATE levels SET "mora" = CAST(COALESCE("mora", '0') AS BIGINT) + $1 WHERE "user" = $2 AND "guild" = $3`, [bet, author.id, channel.guild.id]); }
            catch(e2) { await db.query(`UPDATE levels SET mora = CAST(COALESCE(mora, '0') AS BIGINT) + $1 WHERE userid = $2 AND guildid = $3`, [bet, author.id, channel.guild.id]).catch(()=>{}); }
            await client.setLevel(authorData);

            safeCleanup(client, gameKey, author.id);
            await msg.edit({ content: `⏰ انتهى وقت الاختيار. تم استرجاع **${bet}** ${EMOJI_MORA} لمحفظتك.`, embeds: [], components: [] }).catch(()=>{});
        }

    } catch (err) {
        console.error("[Race Selection Error]", err);
        safeCleanup(client, gameKey, author.id);
    }
}

async function playSoloRace(channel, author, bet, authorData, db, client, gameKey, raceOptions, selectedIndex) {
    try {
        const participants = raceOptions.map((icon, index) => ({
            id: index === selectedIndex ? author.id : `bot_${index}`,
            name: index === selectedIndex ? author.displayName : `المنافس ${index + 1}`,
            icon: icon,
            progress: 0,
            isPlayer: index === selectedIndex,
            status: ""
        }));

        const renderTrack = () => {
            return participants.map(p => {
                const spaces = Math.floor(p.progress);
                const remaining = TRACK_LENGTH - spaces;
                const trackLine = '🏁' + '➖'.repeat(Math.max(0, remaining)) + p.icon + '➖'.repeat(Math.max(0, spaces)) + '|';
                return `**${p.name}** ${p.status}\n${trackLine}`;
            }).join('\n\n');
        };

        const embed = new EmbedBuilder()
            .setTitle('🐎 السباق الكبير!')
            .setDescription(`لقد راهنت على: ${participants.find(p=>p.isPlayer).icon}\nالرهان: **${bet}** ${EMOJI_MORA}\n\n${renderTrack()}`)
            .setColor("Orange")
            .setFooter({ text: "السباق جارٍ..." });

        const raceMsg = await channel.send({ embeds: [embed] });

        let isFinished = false;

        const raceInterval = setInterval(async () => {
            if (isFinished) return;

            try {
                let winner = null;
                const randomComment = COMMENTS[Math.floor(Math.random() * COMMENTS.length)];

                participants.forEach(p => {
                    const chance = Math.random();
                    let move = 0;
                    p.status = ""; 

                    if (chance < 0.05) { move = 0; p.status = "💤"; }
                    else if (chance < 0.15) { move = 0.5; p.status = "🥕"; }
                    else if (chance > 0.90) { move = 4.5; p.status = "🚀"; }
                    else if (chance > 0.80) { move = 3; p.status = "🌪️"; }
                    else { move = Math.random() * 3.5 + 1; }

                    p.progress += move;
                    if (p.progress >= TRACK_LENGTH && !winner) winner = p;
                });

                embed.setDescription(`لقد راهنت على: ${participants.find(p=>p.isPlayer).icon}\nالرهان: **${bet}** ${EMOJI_MORA}\n\n${renderTrack()}\n\n🎙️ **${randomComment}**`);
                await raceMsg.edit({ embeds: [embed] }).catch(() => {
                    isFinished = true;
                    clearInterval(raceInterval);
                });

                if (winner) {
                    isFinished = true;
                    clearInterval(raceInterval);
                    safeCleanup(client, gameKey, author.id);

                    if (winner.isPlayer) {
                        const moraMultiplier = await calculateMoraBuff(author, db); 
                        let totalWin = Math.floor(bet * moraMultiplier); 
                        
                        let casinoTax = 0;
                        let taxText = "";
                        const settingsRes = await db.query(`SELECT "roleCasinoKing" FROM settings WHERE "guild" = $1`, [channel.guild.id]);
                        const settings = settingsRes.rows[0];
                        if (settings && (settings.roleCasinoKing || settings.rolecasinoking) && !author.roles.cache.has(settings.roleCasinoKing || settings.rolecasinoking)) {
                            const kingMembers = channel.guild.roles.cache.get(settings.roleCasinoKing || settings.rolecasinoking)?.members;
                            if (kingMembers && kingMembers.size > 0) {
                                const king = kingMembers.first();
                                casinoTax = Math.floor(totalWin * 0.01);
                                if (casinoTax > 0) {
                                    totalWin -= casinoTax;
                                    taxText = `\n👑 ضريبـة ملـك الكازيـنـو (-1%): **${casinoTax}**-`;
                                    const kingRes = await db.query(`UPDATE levels SET "bank" = CAST(COALESCE("bank", '0') AS BIGINT) + $1 WHERE "user" = $2 AND "guild" = $3 RETURNING "bank"`, [casinoTax, king.id, channel.guild.id]).catch(()=>({rows:[]}));
                                    if (client.updateLevelField && kingRes.rows[0]) client.updateLevelField(king.id, channel.guild.id, { bank: Number(kingRes.rows[0].bank) });
                                }
                            }
                        }

                        const finalPayout = bet + totalWin;

                        authorData.mora = String(Number(authorData.mora) + finalPayout);
                        try { await db.query(`UPDATE levels SET "mora" = CAST(COALESCE("mora", '0') AS BIGINT) + $1 WHERE "user" = $2 AND "guild" = $3`, [finalPayout, author.id, channel.guild.id]); }
                        catch(e) { await db.query(`UPDATE levels SET mora = CAST(COALESCE(mora, '0') AS BIGINT) + $1 WHERE userid = $2 AND guildid = $3`, [finalPayout, author.id, channel.guild.id]).catch(()=>{}); }
                        await client.setLevel(authorData);

                        if (updateGuildStat) {
                            updateGuildStat(client, channel.guild.id, author.id, 'casino_profit', totalWin);
                        }

                        const buffPercent = Math.floor((moraMultiplier - 1) * 100);
                        const buffText = buffPercent > 0 ? ` (+%${buffPercent})` : '';

                        const winEmbed = new EmbedBuilder()
                            .setTitle(`🏆 فـاز خيلك بالمركز الأول!`)
                            .setDescription(`🎉 مبروك! توقعك كان في محله!\n\n✶ ربحـت: ${totalWin.toLocaleString()} ${EMOJI_MORA}${buffText}${taxText}`)
                            .setColor("Green")
                            .setThumbnail(author.user.displayAvatarURL());
                        
                        channel.send({ embeds: [winEmbed] });
                    } else {
                        const loseEmbed = new EmbedBuilder()
                            .setTitle('💔 خسر خيلك...')
                            .setDescription(`الفائز كان: **${winner.name}** ${winner.icon}\nخسرت الرهان **${bet}** ${EMOJI_MORA}.`)
                            .setColor("Red");
                        
                        channel.send({ embeds: [loseEmbed] });
                    }
                }
            } catch (err) {
                isFinished = true;
                clearInterval(raceInterval);
                safeCleanup(client, gameKey, author.id);
            }
        }, 1200); 
    } catch (err) {
        safeCleanup(client, gameKey, author.id);
    }
}

async function playChallengeRace(channel, author, opponents, bet, authorData, db, replyFunction, client, gameKey) {
    const allPlayerIds = [author.id, ...opponents.map(o => o.id)];
    const totalPot = bet * (opponents.size + 1);

    try {
        const requiredOpponentsIDs = opponents.map(o => o.id);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('race_pvp_accept').setLabel('قبول').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('race_pvp_decline').setLabel('رفض').setStyle(ButtonStyle.Danger)
        );

        const embed = new EmbedBuilder()
            .setTitle(`🏁 تـحـدي سباق الخيول!`)
            .setDescription(`✥ قـام ${author}\n✶ بدعـوتـك ${opponents.map(o => o.toString()).join(', ')}\nعلى سـباق خيول جماعي! 🐎\nمـبـلغ الـرهـان ${bet} ${EMOJI_MORA} (لكل شخص)\nالجائـزة الكـبرى: **${totalPot.toLocaleString()}** ${EMOJI_MORA}`)
            .setColor("Orange");

        const challengeMsg = await replyFunction({ content: opponents.map(o => o.toString()).join(' '), embeds: [embed], components: [row], fetchReply: true });
        
        const acceptedOpponentsIDs = new Set(); 
        let raceHasStarted = false;

        const challengeCollector = challengeMsg.createMessageComponentCollector({ time: 60000 });

        const startRace = async () => {
            raceHasStarted = true;
            challengeCollector.stop('started');
            const finalPlayers = [author, ...opponents.values()];

            for (const player of finalPlayers) {
                let data = await client.getLevel(player.id, channel.guild.id);
                if (!data) data = { ...channel.client.defaultData, user: player.id, guild: channel.guild.id };
                
                data.mora = String(Math.max(0, Number(data.mora) - bet));
                try { await db.query(`UPDATE levels SET "mora" = GREATEST(0, CAST(COALESCE("mora", '0') AS BIGINT) - $1) WHERE "user" = $2 AND "guild" = $3`, [bet, player.id, channel.guild.id]); }
                catch(e) { await db.query(`UPDATE levels SET mora = GREATEST(0, CAST(COALESCE(mora, '0') AS BIGINT) - $1) WHERE userid = $2 AND guildid = $3`, [bet, player.id, channel.guild.id]).catch(()=>{}); }
                
                if (player.id !== OWNER_ID) {
                     try { await db.query(`UPDATE levels SET "lastRace" = $1 WHERE "user" = $2 AND "guild" = $3`, [Date.now(), player.id, channel.guild.id]); } catch(e){}
                     data.lastRace = Date.now();
                }
                await client.setLevel(data);
            }
            
            const participants = finalPlayers.map((p, index) => ({
                id: p.id, name: p.displayName, avatar: p.user.displayAvatarURL(),
                member: p,
                icon: RACE_ICONS[index % RACE_ICONS.length], progress: 0, status: ""
            }));

            const renderTrack = () => participants.map(p => {
                const spaces = Math.floor(p.progress);
                const remaining = TRACK_LENGTH - spaces;
                return `**${p.name}** ${p.status}\n🏁` + '➖'.repeat(Math.max(0, remaining)) + p.icon + '➖'.repeat(Math.max(0, spaces)) + '|';
            }).join('\n\n');

            const raceEmbed = new EmbedBuilder().setTitle('🐎 السباق بدأ!').setDescription(`الجائزة الكبرى: **${totalPot.toLocaleString()}** ${EMOJI_MORA}\n\n${renderTrack()}`).setColor("Blue");
            await challengeMsg.edit({ content: null, embeds: [raceEmbed], components: [] });

            let isFinished = false;

            const raceInterval = setInterval(async () => {
                if (isFinished) return;

                try {
                    let winner = null;
                    const randomComment = COMMENTS[Math.floor(Math.random() * COMMENTS.length)];

                    participants.forEach(p => {
                        const chance = Math.random();
                        let move = 0;
                        p.status = ""; 
                        if (chance < 0.05) { move = 0; p.status = "💤"; }
                        else if (chance < 0.15) { move = 0.5; p.status = "🥕"; }
                        else if (chance > 0.90) { move = 4.5; p.status = "🚀"; }
                        else { move = Math.random() * 3.5 + 1; }
                        p.progress += move;
                        if (p.progress >= TRACK_LENGTH && !winner) winner = p;
                    });

                    raceEmbed.setDescription(`الجائزة الكبرى: **${totalPot.toLocaleString()}** ${EMOJI_MORA}\n\n${renderTrack()}\n\n🎙️ **${randomComment}**`);
                    await challengeMsg.edit({ embeds: [raceEmbed] }).catch(() => {
                        isFinished = true;
                        clearInterval(raceInterval);
                    });

                    if (winner) {
                        isFinished = true;
                        clearInterval(raceInterval);
                        safeCleanup(client, gameKey, allPlayerIds);

                        let winnerData = await client.getLevel(winner.id, channel.guild.id);
                        if (winnerData) {
                            winnerData.mora = String(Number(winnerData.mora) + totalPot);
                            try { await db.query(`UPDATE levels SET "mora" = CAST(COALESCE("mora", '0') AS BIGINT) + $1 WHERE "user" = $2 AND "guild" = $3`, [totalPot, winner.id, channel.guild.id]); }
                            catch(e) { await db.query(`UPDATE levels SET mora = CAST(COALESCE(mora, '0') AS BIGINT) + $1 WHERE userid = $2 AND guildid = $3`, [totalPot, winner.id, channel.guild.id]).catch(()=>{}); }
                            await client.setLevel(winnerData);
                        }

                        const winEmbed = new EmbedBuilder()
                            .setTitle(`🏆 الفائز هو ${winner.name}!`)
                            .setDescription(`🎉 **${winner.name}** اكتسح السباق وحصل على الجائزة الكبرى **${totalPot.toLocaleString()}** ${EMOJI_MORA}!`)
                            .setColor("Gold")
                            .setThumbnail(winner.avatar);
                        channel.send({ content: `<@${winner.id}>`, embeds: [winEmbed] });
                    }
                } catch (e) {
                    isFinished = true;
                    clearInterval(raceInterval);
                    safeCleanup(client, gameKey, allPlayerIds);
                }
            }, 1200); 
        };

        challengeCollector.on('collect', async i => {
            if (!requiredOpponentsIDs.includes(i.user.id)) return i.reply({ content: `التحدي ليس مرسلاً لك!`, flags: [MessageFlags.Ephemeral] }).catch(()=>{});
            
            if (i.customId === 'race_pvp_decline') {
                challengeCollector.stop('decline');
                await i.update({ content: `✬ رفـض ${i.member.displayName} التـحدي. تم الإلغاء.`, embeds: [], components: [] }).catch(()=>{});
                return;
            }
            
            if (i.customId === 'race_pvp_accept') {
                if (!acceptedOpponentsIDs.has(i.user.id)) {
                    acceptedOpponentsIDs.add(i.user.id);
                    await i.reply({ content: `✦ لقد قبلت التحدي! بانتظار البقية...`, flags: [MessageFlags.Ephemeral] }).catch(()=>{});
                    if (acceptedOpponentsIDs.size === requiredOpponentsIDs.length && !raceHasStarted) {
                        await startRace();
                    }
                } else {
                     await i.reply({ content: `أنت قبلت بالفعل!`, flags: [MessageFlags.Ephemeral] }).catch(()=>{});
                }
            }
        });

        challengeCollector.on('end', async (collected, reason) => {
            if (!raceHasStarted) {
                safeCleanup(client, gameKey, allPlayerIds);
                if (reason !== 'decline') {
                    challengeMsg.edit({ content: `✶ انتـهـى الـوقـت، لـم يقـبل الجـميع التحـدي!`, embeds: [], components: [] }).catch(()=>{});
                }
            }
        });
    } catch (err) {
        console.error("[Play Challenge Race Error]", err);
        safeCleanup(client, gameKey, allPlayerIds);
    }
}
