const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Colors, SlashCommandBuilder, AttachmentBuilder } = require("discord.js");

// 🔥 استدعاء الدوال من المركز الجديد للـ PvP 🔥
const { activePvpChallenges, EMOJI_MORA } = require('../../handlers/pvp/pvp-state.js');
const { cleanDisplayName } = require('../../handlers/pvp/pvp-utils.js');
const { getUserRace, getWeaponData } = require('../../handlers/pvp/pvp-data.js');
const { generatePvPChallengeImage } = require('../../generators/pvp-summary-generator.js'); 

let updateGuildStat;
try {
    ({ updateGuildStat } = require('../../handlers/guild-board-handler.js'));
} catch (e) {}

const PVP_COOLDOWN_MS = 5 * 60 * 1000;
const MAX_LOAN_BET = 500; 
const TARGET_OWNER_ID = "1145327691772481577"; 

module.exports = {
    data: new SlashCommandBuilder()
        .setName('تحدي')
        .setDescription('تحدي عضو آخر في قتال 1 ضد 1 على رهان مورا.')
        .addUserOption(option => 
            option.setName('المستخدم')
            .setDescription('الخصم الذي تريد تحديه')
            .setRequired(true))
        .addIntegerOption(option =>
            option.setName('المبلغ')
            .setDescription('مبلغ المورا الذي تراهن به')
            .setRequired(true)
            .setMinValue(1)),

    name: 'pvp',
    aliases: ['قتال', 'تحدي'],
    category: "Economy",
    description: 'تحدي عضو آخر في قتال 1 ضد 1 على رهان مورا.',

    async execute(interactionOrMessage, args) {

        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, guild, client, challenger;
        let opponent, bet;

        if (isSlash) {
            interaction = interactionOrMessage;
            guild = interaction.guild;
            client = interaction.client;
            challenger = interaction.member;
            opponent = interaction.options.getMember('المستخدم');
            bet = interaction.options.getInteger('المبلغ');
            await interaction.deferReply(); 
        } else {
            message = interactionOrMessage;
            guild = message.guild;
            client = message.client;
            challenger = message.member;

            opponent = message.mentions.members.first();
            const betArg = args[1];

            if (!opponent || !betArg || isNaN(parseInt(betArg))) {
                return message.reply(`الاستخدام: \`-pvp <@User> <المبلغ>\``);
            }
            bet = parseInt(betArg);
        }

        const replyError = async (content) => {
            if (isSlash) {
                return interaction.editReply({ content, ephemeral: true });
            } else {
                return message.reply({ content });
            }
        };

        const sendChallenge = async (payload) => {
            if (isSlash) {
                return interaction.editReply(payload);
            } else {
                return message.channel.send(payload);
            }
        };

        const channel = interactionOrMessage.channel;
        const sql = client.sql; 
        
        if (bet <= 0) {
            return replyError("مبلغ الرهان يجب أن يكون رقماً موجباً.");
        }

        if (opponent.id === challenger.id) {
            return replyError("متـوحـد انـت؟ تتحدى نفسـك؟ <a:MugiStronk:1438795606872166462>");
        }

        const isBotChallenge = opponent.id === client.user.id;
        if (opponent.user.bot && !isBotChallenge) {
            return replyError("ما تقدر تتحدى بـوت يا متـخـلف <a:MugiStronk:1438795606872166462>");
        }
        if (isBotChallenge && challenger.id !== TARGET_OWNER_ID) {
            return replyError("❌ لا يتجرأ على تحدي الزعيم إلا الإمبراطور نفسه!");
        }

        if (bet > MAX_LOAN_BET) {
            const challengerLoanRes = await sql.query(`SELECT "remainingAmount" FROM user_loans WHERE "userID" = $1 AND "guildID" = $2`, [challenger.id, guild.id]);
            const challengerLoan = challengerLoanRes.rows[0];
            if (challengerLoan && Number(challengerLoan.remainingAmount || challengerLoan.remainingamount) > 0) {
                return replyError(`❌ **عذراً!** عليك قرض لم يتم سداده.\nلا يمكنك المراهنة بأكثر من **${MAX_LOAN_BET}** ${EMOJI_MORA} في التحديات حتى تسدد قرضك.`);
            }
        }

        if (!isBotChallenge) {
            if (bet > MAX_LOAN_BET) {
                const opponentLoanRes = await sql.query(`SELECT "remainingAmount" FROM user_loans WHERE "userID" = $1 AND "guildID" = $2`, [opponent.id, guild.id]);
                const opponentLoan = opponentLoanRes.rows[0];
                if (opponentLoan && Number(opponentLoan.remainingAmount || opponentLoan.remainingamount) > 0) {
                    return replyError(`❌ الخصم ${opponent.displayName} عليه قرض ولا يمكنه المراهنة بأكثر من **${MAX_LOAN_BET}** ${EMOJI_MORA}.`);
                }
            }
        }

        let challengerData = await client.getLevel(challenger.id, guild.id);
        if (!challengerData) {
            challengerData = { ...client.defaultData, user: challenger.id, guild: guild.id };
        }

        let opponentData;
        if (!isBotChallenge) {
            opponentData = await client.getLevel(opponent.id, guild.id);
            if (!opponentData) {
                opponentData = { ...client.defaultData, user: opponent.id, guild: guild.id };
            }
        } else {
            opponentData = { mora: 999999999 }; 
        }

        const now = Date.now();

        const woundedDebuffRes = await sql.query(`SELECT * FROM user_buffs WHERE "userID" = $1 AND "guildID" = $2 AND "buffType" = 'pvp_wounded' AND "expiresAt" > $3`, [challenger.id, guild.id, now]);
        const woundedDebuff = woundedDebuffRes.rows[0];

        if (woundedDebuff) {
            const woundTimeLeft = Math.ceil((Number(woundedDebuff.expiresAt || woundedDebuff.expiresat) - now) / 60000);
            return replyError(`❌ | أنت جريح حالياً! 🤕\nيمـكنـك تلقـي التحديـات ولكن لا يمـكـنـك ارسالـهـا ستشفـى بالكـامل بعـد **${woundTimeLeft}** دقيقـة`);
        }

        const timeLeft = (Number(challengerData.lastPVP || challengerData.lastpvp) || 0) + PVP_COOLDOWN_MS - now;
        const executorId = isSlash ? interaction.user.id : message.author.id;

        if (timeLeft > 0 && executorId !== TARGET_OWNER_ID) {
            const minutes = Math.floor(timeLeft / 60000);
            const seconds = Math.floor((timeLeft % 60000) / 1000);
            return replyError(`🕐 لقد قمت بقتال مؤخراً. يرجى الانتظار **${minutes} دقيقة و ${seconds} ثانية**.`);
        }

        if (Number(challengerData.mora) < bet) {
            return replyError(`ليس لديك **${bet.toLocaleString()}** ${EMOJI_MORA} في رصيدك (الكاش) لهذا الرهان!`);
        }
        if (!isBotChallenge && Number(opponentData.mora) < bet) {
            return replyError(`خصمك ${opponent.displayName} لا يملك **${bet.toLocaleString()}** ${EMOJI_MORA} في رصيده (الكاش).`);
        }

        const challengerRace = await getUserRace(challenger, sql); 
        const challengerWeapon = await getWeaponData(sql, challenger);

        if (!challengerRace || !challengerWeapon || Number(challengerWeapon.currentLevel) === 0) {
            return replyError(`❌ | لا يمكنك بدء تحدٍ وأنت لست جاهزاً! (تحتاج إلى عرق + سلاح مستوى 1 على الأقل).`);
        }

        challengerData.lastPVP = Date.now();
        await client.setLevel(challengerData);

        if (isBotChallenge) {
            // 🔥 مسح إمبد القبول كما طلبت وتمريره مباشرة 🔥
            const coreManager = require('../../handlers/pvp/pvp-manager.js');
            return await coreManager.startPvpBattle(isSlash ? interaction : message, client, sql, challenger, opponent, bet, true);
        }

        activePvpChallenges.add(channel.id);
        const totalPot = bet * 2;

        const opponentRaceObj = await getUserRace(opponent, sql);
        
        const challengerInfo = {
            name: cleanDisplayName(challenger.displayName || challenger.user.username),
            avatar: challenger.displayAvatarURL({ extension: 'png', size: 256, forceStatic: true }),
            level: challengerData.level || 1,
            race: challengerRace ? (challengerRace.raceName || challengerRace.racename) : 'Human'
        };

        const opponentInfo = {
            name: cleanDisplayName(opponent.displayName || opponent.user.username),
            avatar: opponent.displayAvatarURL({ extension: 'png', size: 256, forceStatic: true }),
            level: opponentData.level || 1,
            race: opponentRaceObj ? (opponentRaceObj.raceName || opponentRaceObj.racename) : 'Human'
        };

        if (!isSlash) await channel.sendTyping();

        let files = [];
        try {
            const imageBuffer = await generatePvPChallengeImage(challengerInfo, opponentInfo, bet, totalPot, 'pending');
            if (imageBuffer) {
                files.push(new AttachmentBuilder(imageBuffer, { name: 'challenge.png' }));
            }
        } catch (err) {
            console.error(err);
        }

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`pvp_accept_${challenger.id}_${opponent.id}_${bet}`)
                .setLabel('قــبـــول')
                .setStyle(ButtonStyle.Success)
                .setEmoji('⚔️'),
            new ButtonBuilder()
                .setCustomId(`pvp_decline_${challenger.id}_${opponent.id}_${bet}`)
                .setLabel('رفــــض')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🛡️')
        );

        const payload = {
            content: `<@${opponent.id}>`, // 🔥 النص المطلوب فقط: منشن الخصم 🔥
            files: files,
            embeds: [],
            components: [row] // ✅ الأزرار تظهر دائماً بغض النظر عن نجاح توليد الصورة
        };

        const challengeMsg = await sendChallenge(payload);

        setTimeout(async () => {
            if (activePvpChallenges.has(channel.id)) {
                activePvpChallenges.delete(channel.id);

                // 🔥 رسم تحديث للصورة عند التايم أوت 🔥
                try {
                    const timeoutBuffer = await generatePvPChallengeImage(challengerInfo, opponentInfo, bet, totalPot, 'timeout');
                    if (timeoutBuffer) {
                        const timeoutAttach = new AttachmentBuilder(timeoutBuffer, { name: 'challenge_timeout.png' });
                        if (isSlash) {
                            await interaction.editReply({ content: `<@${opponent.id}>`, files: [timeoutAttach], components: [], embeds: [] }).catch(()=>{});
                        } else {
                            await challengeMsg.edit({ content: `<@${opponent.id}>`, files: [timeoutAttach], components: [], embeds: [] }).catch(()=>{});
                        }
                    }
                } catch(e){}

                challengerData.lastPVP = 0;
                await client.setLevel(challengerData);
            }
        }, 60000);
    }
};
