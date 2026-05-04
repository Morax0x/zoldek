const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, ComponentType, Colors } = require('discord.js');
const { calculateMoraBuff } = require('../../streak-handler.js'); 

let updateGuildStat;
try {
    ({ updateGuildStat } = require('../../handlers/guild-board-handler.js'));
} catch (e) {}

const EMOJI_MORA = '<:mora:1435647151349698621>';
const OWNER_ID = "1145327691772481577"; 
const ROCK = '🪨';
const PAPER = '📄';
const SCISSORS = '✂️';
const MOVES = [ROCK, PAPER, SCISSORS];

const MIN_BET = 10;
const MAX_BET_SOLO = 100; 
const MAX_LOAN_BET = 500; 
const COOLDOWN_MS = 1 * 60 * 60 * 1000; 

function formatTime(ms) {
    if (ms < 0) ms = 0;
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
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
        .setName('حجرة')
        .setDescription('لعبة حجرة ورقة مقص (فردي أو ضد شخص آخر).')
        .addIntegerOption(option => 
            option.setName('الرهان')
                .setDescription('مبلغ الرهان (اختياري)')
                .setMinValue(MIN_BET)
                .setRequired(false))
        .addUserOption(option => 
            option.setName('الخصم')
                .setDescription('الشخص الذي تريد تحديه (اختياري)')
                .setRequired(false)),

    name: 'rps',
    aliases: ['حجرة', 'rock', 'r', 'حجره', 'ورقة', 'ورقه', 'مقص'],
    category: "Economy",
    description: "لعبة حجرة ورقة مقص.",

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, user, member, guild, client, channel;
        let betInput, opponentInput;

        if (isSlash) {
            interaction = interactionOrMessage;
            user = interaction.user;
            member = interaction.member;
            guild = interaction.guild;
            client = interaction.client;
            channel = interaction.channel;
            betInput = interaction.options.getInteger('الرهان');
            opponentInput = interaction.options.getUser('الخصم');
            await interaction.deferReply();
        } else {
            message = interactionOrMessage;
            user = message.author;
            member = message.member;
            guild = message.guild;
            client = message.client;
            channel = message.channel;
            
            if (args[0] && !isNaN(parseInt(args[0]))) {
                betInput = parseInt(args[0]);
                opponentInput = message.mentions.users.first();
            } else if (message.mentions.users.first()) {
                opponentInput = message.mentions.users.first();
                if (args[1] && !isNaN(parseInt(args[1]))) betInput = parseInt(args[1]);
            }
        }

        const reply = async (payload) => {
            if (isSlash) return interaction.editReply(payload);
            return message.channel.send(payload);
        };

        if (!client.activePlayers) client.activePlayers = new Set();

        if (client.activePlayers.has(user.id)) {
            const msg = "🚫 لديك لعبة أو طلب معلق حالياً! أكمله أولاً.";
            if (isSlash) return interaction.editReply({ content: msg });
            return message.reply(msg); 
        }

        const db = client.sql;
        let userData = await client.getLevel(user.id, guild.id);
        if (!userData) userData = { ...client.defaultData, user: user.id, guild: guild.id };

        const now = Date.now();
        if (user.id !== OWNER_ID) {
            const reductionMs = await getCooldownReductionMs(db, user.id, guild.id);
            const effectiveCooldown = Math.max(0, COOLDOWN_MS - reductionMs);
            const timeLeft = (Number(userData.lastRPS || userData.lastrps) || 0) + effectiveCooldown - now;
            
            if (timeLeft > 0) {
                return reply({ content: `🕐 انتظر **\`${formatTime(timeLeft)}\`** قبل اللعب مرة أخرى.` });
            }
        }

        client.activePlayers.add(user.id);

        if (!betInput) {
            let proposedBet = 100;
            const userBalance = Number(userData.mora) || 0;

            if (userBalance < MIN_BET) {
                client.activePlayers.delete(user.id); 
                return reply({ content: `❌ لا تملك مورا كافية للعب (الحد الأدنى ${MIN_BET})!`, ephemeral: true });
            }
            if (userBalance < 100) proposedBet = userBalance;

            return startGame(channel, user, member, opponentInput, proposedBet, client, guild, db, isSlash ? interaction : null);
        } else {
            return startGame(channel, user, member, opponentInput, betInput, client, guild, db, isSlash ? interaction : null);
        }
    }
};

async function startGame(channel, user, member, opponent, bet, client, guild, db, interaction) {
    let userData = await client.getLevel(user.id, guild.id);
    if (!userData || Number(userData.mora) < bet) {
        client.activePlayers.delete(user.id); 
        const msg = `❌ ليس لديك مورا كافية! (رصيدك: ${userData ? Number(userData.mora) : 0})`;
        if (interaction && !interaction.replied) await interaction.followUp({ content: msg, ephemeral: true });
        else channel.send(msg);
        return;
    }

    if (opponent && opponent.id !== user.id && !opponent.bot) {
        if (bet > MAX_LOAN_BET) {
            try {
                const res = await db.query(`SELECT "remainingAmount" FROM user_loans WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guild.id]);
                if (res.rows.length > 0 && Number(res.rows[0].remainingamount || res.rows[0].remainingAmount) > 0) {
                    client.activePlayers.delete(user.id);
                    const msg = `❌ **عذراً!** عليك قرض. حدك الأقصى في التحديات هو **${MAX_LOAN_BET}** ${EMOJI_MORA} حتى تسدد قرضك.`;
                    if (interaction && !interaction.replied) await interaction.followUp({ content: msg, ephemeral: true }); else channel.send(msg);
                    return;
                }
            } catch(e) {}
        }

        if (bet > MAX_LOAN_BET) {
            try {
                const res = await db.query(`SELECT "remainingAmount" FROM user_loans WHERE "userID" = $1 AND "guildID" = $2`, [opponent.id, guild.id]);
                if (res.rows.length > 0 && Number(res.rows[0].remainingamount || res.rows[0].remainingAmount) > 0) {
                    client.activePlayers.delete(user.id);
                    const msg = `❌ الخصم ${opponent} عليه قرض ولا يمكنه المراهنة بأكثر من **${MAX_LOAN_BET}** ${EMOJI_MORA}.`;
                    if (interaction && !interaction.replied) await interaction.followUp(msg); else channel.send(msg);
                    return;
                }
            } catch(e) {}
        }

        if (client.activePlayers.has(opponent.id)) {
            client.activePlayers.delete(user.id); 
            const msg = `🚫 اللاعب ${opponent} لديه لعبة نشطة بالفعل.`;
            if (interaction) await interaction.followUp(msg); else channel.send(msg);
            return;
        }

        let opponentData = await client.getLevel(opponent.id, guild.id);
        if (!opponentData || Number(opponentData.mora) < bet) {
            client.activePlayers.delete(user.id); 
            const msg = `❌ الخصم ${opponent} لا يملك مورا كافية!`;
            if (interaction && !interaction.replied) await interaction.followUp(msg);
            else channel.send(msg);
            return;
        }

        client.activePlayers.add(opponent.id);

        const inviteEmbed = new EmbedBuilder()
            .setTitle('🥊 تحدي حجرة ورقة مقص')
            .setDescription(`${user} يتحدى ${opponent} على **${bet}** ${EMOJI_MORA}!\n\nاضغط "قبول" للبدء.`)
            .setColor("Orange");

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('rps_accept').setLabel('قبول').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('rps_decline').setLabel('رفض').setStyle(ButtonStyle.Danger)
        );

        let inviteMsg;
        if (interaction && !interaction.replied) {
             inviteMsg = await interaction.editReply({ content: `${opponent}`, embeds: [inviteEmbed], components: [row] });
        } else {
             inviteMsg = await channel.send({ content: `${opponent}`, embeds: [inviteEmbed], components: [row] });
        }

        const filter = i => i.user.id === opponent.id && (i.customId === 'rps_accept' || i.customId === 'rps_decline');
        
        try {
            const response = await inviteMsg.awaitMessageComponent({ filter, time: 30000 });
            
            if (response.customId === 'rps_decline') {
                client.activePlayers.delete(user.id);
                client.activePlayers.delete(opponent.id);
                await response.update({ content: `❌ تم رفض التحدي.`, embeds: [], components: [] });
                return;
            }

            await response.deferUpdate();
            
            userData = await client.getLevel(user.id, guild.id);
            opponentData = await client.getLevel(opponent.id, guild.id);
            
            if (Number(userData.mora) < bet || Number(opponentData.mora) < bet) {
                client.activePlayers.delete(user.id);
                client.activePlayers.delete(opponent.id);
                return inviteMsg.edit({ content: "❌ أحد اللاعبين صرف أمواله قبل بدء اللعبة!", embeds: [], components: [] });
            }

            userData.mora = Number(userData.mora) - bet;
            opponentData.mora = Number(opponentData.mora) - bet;
            if (user.id !== OWNER_ID) userData.lastRPS = Date.now();
            await client.setLevel(userData);
            await client.setLevel(opponentData);

            await runRPSRound(inviteMsg, user, member, opponent, bet, true, client, guild, db);

        } catch (e) {
            client.activePlayers.delete(user.id);
            client.activePlayers.delete(opponent.id);
            await inviteMsg.edit({ content: "⏰ انتهى وقت قبول التحدي.", embeds: [], components: [] });
        }

    } else {
        if (opponent && opponent.bot) {
            client.activePlayers.delete(user.id);
            return channel.send("🤖 لا يمكنك تحدي البوتات في PvP، العب فردي.");
        }
        
        if (bet > MAX_BET_SOLO) {
             client.activePlayers.delete(user.id);
             const msg = `🚫 الحد الأقصى للرهان الفردي هو **${MAX_BET_SOLO}** ${EMOJI_MORA}.`;
             if (interaction && !interaction.replied) await interaction.followUp({ content: msg, ephemeral: true });
             else channel.send(msg);
             return;
        }

        userData.mora = Number(userData.mora) - bet;
        if (user.id !== OWNER_ID) userData.lastRPS = Date.now();
        await client.setLevel(userData);
        
        const initialEmbed = new EmbedBuilder()
            .setTitle('حجرة ورقة مقص!')
            .setDescription(`اختر حركتك يا ${user.username}!`)
            .setColor("Blue");
            
        const initialRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('rps_rock').setEmoji(ROCK).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('rps_paper').setEmoji(PAPER).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('rps_scissors').setEmoji(SCISSORS).setStyle(ButtonStyle.Secondary)
        );

        let msg;
        if (interaction) {
             if (!interaction.replied) {
                msg = await interaction.editReply({ content: " ", embeds: [initialEmbed], components: [initialRow] });
             } else {
                msg = await channel.send({ content: `${user}`, embeds: [initialEmbed], components: [initialRow] });
             }
        } else {
             msg = await channel.send({ content: " ", embeds: [initialEmbed], components: [initialRow] });
        }
        
        await runRPSRound(msg, user, member, null, bet, false, client, guild, db);
    }
}

async function runRPSRound(message, player1, member1, player2, bet, isPvP, client, guild, db) {
    if (isPvP) {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('rps_rock').setEmoji(ROCK).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('rps_paper').setEmoji(PAPER).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('rps_scissors').setEmoji(SCISSORS).setStyle(ButtonStyle.Secondary)
        );

        const embed = new EmbedBuilder()
            .setTitle('حجرة ورقة مقص!')
            .setDescription(`اللاعبين: ${player1} vs ${player2}\nاختاروا حركتكم!`)
            .setColor("Blue");

        await message.edit({ content: " ", embeds: [embed], components: [row] });
    }

    const moves = {};
    const filter = i => {
        if (isPvP) return (i.user.id === player1.id || i.user.id === player2.id) && !moves[i.user.id];
        return i.user.id === player1.id;
    };

    const collector = message.createMessageComponentCollector({ filter, time: 30000 });

    collector.on('collect', async i => {
        await i.deferUpdate().catch(() => {}); 
        
        let move = '';
        if (i.customId === 'rps_rock') move = ROCK;
        if (i.customId === 'rps_paper') move = PAPER;
        if (i.customId === 'rps_scissors') move = SCISSORS;

        moves[i.user.id] = move;

        if (isPvP) {
            if (Object.keys(moves).length === 2) {
                collector.stop('finished');
            } else {
                await i.followUp({ content: `✅ ${i.user} اختار حركته! بانتظار الخصم...`, ephemeral: true }).catch(() => {});
            }
        } else {
            collector.stop('finished');
        }
    });

    collector.on('end', async (collected, reason) => {
        client.activePlayers.delete(player1.id);
        if (player2) client.activePlayers.delete(player2.id);

        if (reason !== 'finished') {
            if (isPvP) {
                let p1Data = await client.getLevel(player1.id, guild.id);
                let p2Data = await client.getLevel(player2.id, guild.id);
                p1Data.mora = Number(p1Data.mora) + bet;
                p2Data.mora = Number(p2Data.mora) + bet;
                await client.setLevel(p1Data);
                await client.setLevel(p2Data);
            } else {
                let p1Data = await client.getLevel(player1.id, guild.id);
                p1Data.mora = Number(p1Data.mora) + bet;
                p1Data.lastRPS = 0; 
                await client.setLevel(p1Data);
            }
            return message.edit({ content: "⏰ انتهى الوقت! تم إلغاء اللعبة وإعادة المورا.", embeds: [], components: [] }).catch(() => {});
        }

        const p1Move = moves[player1.id];
        
        let p2Move;
        if (isPvP) {
            p2Move = moves[player2.id];
        } else {
            p2Move = MOVES[Math.floor(Math.random() * MOVES.length)];
            if (p2Move === p1Move && Math.random() < 0.5) {
                const otherMoves = MOVES.filter(m => m !== p1Move);
                p2Move = otherMoves[Math.floor(Math.random() * otherMoves.length)];
            }
        }

        let result; 

        if (p1Move === p2Move) result = 0;
        else if (
            (p1Move === ROCK && p2Move === SCISSORS) ||
            (p1Move === PAPER && p2Move === ROCK) ||
            (p1Move === SCISSORS && p2Move === PAPER)
        ) result = 1;
        else result = 2;

        let resultEmbed = new EmbedBuilder().setColor("Gold");
        let p2Name = isPvP ? player2.displayName : "البوت";

        if (result === 0) {
            let p1Data = await client.getLevel(player1.id, guild.id);
            p1Data.mora = Number(p1Data.mora) + bet;

            if (!isPvP) {
                p1Data.lastRPS = 0; 
            }
            await client.setLevel(p1Data);
            
            if (isPvP) {
                let p2Data = await client.getLevel(player2.id, guild.id);
                p2Data.mora = Number(p2Data.mora) + bet;
                await client.setLevel(p2Data);
            }

            resultEmbed.setTitle("🤝 تـعــادل!")
                .setDescription(
                    `✶ قـام ${player1} بـ اختيـار ${p1Move}\n` +
                    `✶ قـام ${p2Name} بـ اختيـار ${p2Move}\n\n` +
                    `تم استرجاع المورا ${!isPvP ? "وإلغاء الكولداون" : ""}.`
                );
        
        } else if (result === 1) {
            let p1Data = await client.getLevel(player1.id, guild.id);
            
            let winnings = 0;
            let buffString = "";
            let casinoTax = 0;
            let taxText = "";

            if (isPvP) {
                winnings = bet * 2; 

                p1Data.mora = Number(p1Data.mora) + winnings;
                
                resultEmbed.setTitle(`🏆 الفائز: ${player1.displayName}!`)
                    .setColor("Green")
                    .setDescription(
                        `✶ قـام ${player1} بـ اختيـار ${p1Move}\n` +
                        `✶ قـام ${p2Name} بـ اختيـار ${p2Move}\n\n` +
                        `ربـح **${winnings.toLocaleString()}** ${EMOJI_MORA}`
                    )
                    .setThumbnail(player1.displayAvatarURL({ dynamic: true }));

            } else {
                let multiplier = 1.0;
                try {
                    if (calculateMoraBuff) multiplier = await calculateMoraBuff(member1, db); 
                } catch(e) {}
                
                winnings = Math.floor((bet * 2) * multiplier); 
                
                try {
                    const settingsRes = await db.query(`SELECT "roleCasinoKing" FROM settings WHERE "guild" = $1`, [guild.id]);
                    const settings = settingsRes.rows[0];
                    const roleId = settings?.rolecasinoking || settings?.roleCasinoKing;

                    if (roleId && !member1.roles.cache.has(roleId)) {
                        const kingMembers = guild.roles.cache.get(roleId)?.members;
                        if (kingMembers && kingMembers.size > 0) {
                            const king = kingMembers.first();
                            casinoTax = Math.floor(winnings * 0.01);
                            if (casinoTax > 0) {
                                winnings -= casinoTax;
                                taxText = `\n👑 ضريبـة ملـك الكازيـنـو (-1%): **${casinoTax}**-`;
                                // ✅ RETURNING لتحديث كاش الملك فوراً
                                const kingRes = await db.query(`UPDATE levels SET "bank" = "bank" + $1 WHERE "user" = $2 AND "guild" = $3 RETURNING "bank"`, [casinoTax, king.id, guild.id]);
                                if (client.updateLevelField && kingRes.rows[0]) client.updateLevelField(king.id, guild.id, { bank: Number(kingRes.rows[0].bank) });
                            }
                        }
                    }
                } catch(e) {}

                const buffPercent = Math.round((multiplier - 1) * 100);
                if (buffPercent > 0) buffString = ` (+${buffPercent}%)`;
                
                p1Data.mora = Number(p1Data.mora) + winnings;

                if (updateGuildStat) {
                    updateGuildStat(client, guild.id, player1.id, 'casino_profit', winnings - bet);
                }
                
                resultEmbed.setTitle(`🏆 الفائز: ${player1.displayName}!`)
                    .setColor("Green")
                    .setDescription(
                        `✶ قـمت بـ اختيـار ${p1Move}\n` +
                        `✶ قـمـت انـا بـ اختيـار ${p2Move}\n\n` +
                        `ربـحت **${winnings.toLocaleString()}** ${EMOJI_MORA}${buffString}${taxText}`
                    )
                    .setThumbnail(player1.displayAvatarURL({ dynamic: true }));
            }
            await client.setLevel(p1Data);

        } else {
            if (isPvP) {
                let p2Data = await client.getLevel(player2.id, guild.id);
                let winnings = bet * 2; 

                p2Data.mora = Number(p2Data.mora) + winnings;
                await client.setLevel(p2Data);

                resultEmbed.setTitle(`🏆 الفائز: ${player2.displayName}!`)
                    .setColor("Green")
                    .setDescription(
                        `✶ قـام ${player1} بـ اختيـار ${p1Move}\n` +
                        `✶ قـام ${p2Name} بـ اختيـار ${p2Move}\n\n` +
                        `ربـح **${winnings.toLocaleString()}** ${EMOJI_MORA}`
                    )
                    .setThumbnail(player2.displayAvatarURL({ dynamic: true }));
            } else {
                resultEmbed.setTitle("💀 لقد خسرت!")
                    .setColor("Red")
                    .setDescription(
                        `✶ قـمت بـ اختيـار ${p1Move}\n` +
                        `✶ قـمـت انـا بـ اختيـار ${p2Move}\n\n` +
                        `خـسرت رهـانك (**${bet}** ${EMOJI_MORA})`
                    )
                    .setThumbnail(client.user.displayAvatarURL({ dynamic: true }));
            }
        }

        await message.edit({ content: null, embeds: [resultEmbed], components: [] }).catch(() => {});
    });
}
