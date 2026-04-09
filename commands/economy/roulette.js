const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, Colors, Collection } = require("discord.js");
const { calculateMoraBuff } = require('../../streak-handler.js'); 

let updateGuildStat;
try {
    ({ updateGuildStat } = require('../../handlers/guild-board-handler.js'));
} catch (e) {}

const EMOJI_MORA = '<:mora:1435647151349698621>';
const MIN_BET = 10;
const MAX_BET_SOLO = 100; 
const MAX_LOAN_BET = 500; 
const COOLDOWN_MS = 1 * 60 * 60 * 1000; 
const CHAMBER_COUNT = 6;
const OWNER_ID = "1145327691772481577";

const PULL_EMOJIS = ['🎯', '😮‍💨', '🥶', '🤯', '👑'];

function formatTime(ms) {
    if (ms < 0) ms = 0;
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function getMultipliers(playerCount) {
    if (playerCount === 1) return [1.2, 1.5, 2.0, 3.0, 4.0];
    return [1.1, 1.2, 1.3, 1.5, 1.8];
}

function setupChambers() {
    const chambers = Array(CHAMBER_COUNT).fill(0);
    const bulletPosition = Math.floor(Math.random() * CHAMBER_COUNT);
    chambers[bulletPosition] = 1;
    return chambers;
}

async function getCooldownReductionMs(db, userId, guildId) {
    try {
        let repRes;
        try { repRes = await db.query(`SELECT "rep_points" FROM user_reputation WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId]); }
        catch(e) { repRes = await db.query(`SELECT rep_points FROM user_reputation WHERE userid = $1 AND guildid = $2`, [userId, guildId]).catch(()=>({rows:[]})); }
        
        const points = repRes.rows[0]?.rep_points || 0;
        
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
        .setName('روليت')
        .setDescription('لعبة الروليت الروسية (فردي أو جماعي).')
        .addIntegerOption(option => 
            option.setName('الرهان')
                .setDescription('مبلغ الرهان (اختياري)')
                .setMinValue(MIN_BET)
                .setRequired(false))
        .addUserOption(option => option.setName('الخصم1').setDescription('تحدي لاعب آخر').setRequired(false))
        .addUserOption(option => option.setName('الخصم2').setDescription('تحدي لاعب آخر').setRequired(false))
        .addUserOption(option => option.setName('الخصم3').setDescription('تحدي لاعب آخر').setRequired(false))
        .addUserOption(option => option.setName('الخصم4').setDescription('تحدي لاعب آخر').setRequired(false))
        .addUserOption(option => option.setName('الخصم5').setDescription('تحدي لاعب آخر').setRequired(false)),

    name: 'roulette',
    aliases: ['روليت', 'rl'],
    category: "Economy",
    description: "لعبة الروليت الروسية.",

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, user, member, guild, client, channel;
        let betInput, opponents = new Collection();

        if (isSlash) {
            interaction = interactionOrMessage;
            user = interaction.user;
            member = interaction.member; 
            guild = interaction.guild;
            client = interaction.client;
            channel = interaction.channel;
            betInput = interaction.options.getInteger('الرهان');
            for (let i = 1; i <= 5; i++) {
                const opp = interaction.options.getUser(`الخصم${i}`);
                if (opp) {
                    const m = await guild.members.fetch(opp.id).catch(() => null);
                    if (m && !m.user.bot && m.id !== user.id) opponents.set(m.id, m);
                }
            }
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
                opponents = message.mentions.members.filter(m => !m.user.bot && m.id !== user.id);
            }
        }

        const reply = async (payload) => {
            if (isSlash) return interaction.editReply(payload);
            return message.channel.send(payload);
        };

        if (!client.activePlayers) client.activePlayers = new Set(); 
        
        if (client.activePlayers.has(user.id)) return reply({ content: "🚫 لديك لعبة نشطة! أكملها أولاً.", ephemeral: true });

        const db = client.sql;
        let userData = await client.getLevel(user.id, guild.id);
        if (!userData) userData = { ...client.defaultData, user: user.id, guild: guild.id };
        const now = Date.now();

        if (user.id !== OWNER_ID) {
            const reductionMs = await getCooldownReductionMs(db, user.id, guild.id);
            const effectiveCooldown = Math.max(0, COOLDOWN_MS - reductionMs);
            const timeLeft = (Number(userData.lastRoulette || userData.lastroulette) || 0) + effectiveCooldown - now;
            
            if (timeLeft > 0) return reply({ content: `🕐 انتظر **\`${formatTime(timeLeft)}\`**.` });
        }

        if (!betInput) {
            const balance = Number(userData.mora) || 0;
            let proposedBet = balance < MIN_BET ? 0 : (balance < 100 ? balance : 100);
            if (balance < MIN_BET) return reply({ content: `❌ لا تملك مورا كافية!`, ephemeral: true });

            return startRoulette(channel, user, member, opponents, proposedBet, client, guild, db, isSlash ? interaction : null);
        } else {
            return startRoulette(channel, user, member, opponents, betInput, client, guild, db, isSlash ? interaction : null);
        }
    }
};

async function startRoulette(channel, user, member, opponents, bet, client, guild, db, interaction) {
    if (client.activePlayers.has(user.id)) return;

    let userData = await client.getLevel(user.id, guild.id);
    if (!userData) userData = { ...client.defaultData, user: user.id, guild: guild.id };
    
    if (Number(userData.mora) < bet) {
        const msg = `❌ ليس لديك مورا كافية!`;
        if (interaction) await interaction.followUp({ content: msg, ephemeral: true }); else channel.send(msg);
        return;
    }

    if (opponents.size > 0) {
        if (bet > MAX_LOAN_BET) {
            let myLoan;
            try {
                const res = await db.query(`SELECT "remainingAmount" FROM user_loans WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guild.id]);
                myLoan = res.rows[0];
            } catch(e) {
                const res = await db.query(`SELECT remainingamount FROM user_loans WHERE userid = $1 AND guildid = $2`, [user.id, guild.id]).catch(()=>({rows:[]}));
                myLoan = res.rows[0];
            }
            if (myLoan && Number(myLoan.remainingAmount || myLoan.remainingamount) > 0) {
                const msg = `❌ **عذراً!** عليك قرض. حدك الأقصى في الجماعي **${MAX_LOAN_BET}** ${EMOJI_MORA}.`;
                if (interaction) await interaction.followUp({ content: msg, ephemeral: true }); else channel.send(msg);
                return;
            }
        }

        for (const opp of opponents.values()) {
            if (bet > MAX_LOAN_BET) {
                let oppLoan;
                try {
                    const res = await db.query(`SELECT "remainingAmount" FROM user_loans WHERE "userID" = $1 AND "guildID" = $2`, [opp.id, guild.id]);
                    oppLoan = res.rows[0];
                } catch(e) {
                    const res = await db.query(`SELECT remainingamount FROM user_loans WHERE userid = $1 AND guildid = $2`, [opp.id, guild.id]).catch(()=>({rows:[]}));
                    oppLoan = res.rows[0];
                }
                if (oppLoan && Number(oppLoan.remainingAmount || oppLoan.remainingamount) > 0) {
                    const msg = `❌ اللاعب ${opp} عليه قرض ولا يمكنه المراهنة بأكثر من **${MAX_LOAN_BET}** ${EMOJI_MORA}.`;
                    if (interaction) await interaction.followUp(msg); else channel.send(msg);
                    return;
                }
            }

            if (client.activePlayers.has(opp.id)) {
                const msg = `🚫 اللاعب ${opp} مشغول في لعبة أخرى.`;
                if (interaction) await interaction.followUp(msg); else channel.send(msg);
                return;
            }
            
            const oppData = await client.getLevel(opp.id, guild.id);
            if (!oppData || Number(oppData.mora) < bet) {
                const msg = `🚫 اللاعب ${opp} مفلس أو لا يملك رصيداً كافياً.`;
                if (interaction) await interaction.followUp(msg); else channel.send(msg);
                return;
            }
        }
        
        client.activePlayers.add(user.id);
        opponents.forEach(o => client.activePlayers.add(o.id));

        const totalPot = bet * (opponents.size + 1);
        const players = [user, ...opponents.values()];
        const playerIds = players.map(p => p.id);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('rl_pvp_accept').setLabel('قبول').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('rl_pvp_decline').setLabel('رفض').setStyle(ButtonStyle.Danger)
        );

        const embed = new EmbedBuilder().setTitle(`🔫 روليت جماعي!`).setDescription(`الرهان: **${bet}** ${EMOJI_MORA}\nالجائزة: **${totalPot}** ${EMOJI_MORA}`).setColor(Colors.Orange).setImage('https://i.postimg.cc/J44F9YWS/gun.gif');

        let inviteMsg;
        try {
            if (interaction) inviteMsg = await interaction.editReply({ content: `${opponents.map(o => o.toString()).join(' ')}`, embeds: [embed], components: [row] });
            else inviteMsg = await channel.send({ content: `${opponents.map(o => o.toString()).join(' ')}`, embeds: [embed], components: [row] });
        } catch (err) {
            client.activePlayers.delete(user.id);
            opponents.forEach(o => client.activePlayers.delete(o.id));
            return;
        }

        const accepted = new Set([user.id]);
        const collector = inviteMsg.createMessageComponentCollector({ time: 60000 });

        collector.on('collect', async i => {
            if (!playerIds.includes(i.user.id)) return i.reply({ content: "ليس لك.", ephemeral: true });
            
            if (i.customId === 'rl_pvp_decline') {
                collector.stop('declined');
                await i.update({ content: `❌ تم الإلغاء بواسطة <@${i.user.id}>.`, embeds: [], components: [] });
                return;
            }
            if (i.customId === 'rl_pvp_accept') {
                if (accepted.has(i.user.id)) return i.reply({ content: "قبلت بالفعل.", ephemeral: true });
                accepted.add(i.user.id);
                await i.reply({ content: `✅`, ephemeral: true });
                if (accepted.size === players.length) collector.stop('start');
            }
        });

        collector.on('end', async (c, reason) => {
            if (reason !== 'start') {
                players.forEach(p => client.activePlayers.delete(p.id));
                if (reason !== 'declined') inviteMsg.edit({ content: "⏰ انتهى الوقت ولم يقبل الجميع.", embeds: [], components: [] }).catch(() => {});
                return;
            }
            for (const p of players) {
                let d = await client.getLevel(p.id, guild.id);
                d.mora = (Number(d.mora) || 0) - bet;
                if (p.id !== OWNER_ID) d.lastRoulette = Date.now();
                await client.setLevel(d);
            }
            await playMultiplayerGame(inviteMsg, players, bet, totalPot, client, guild, db);
        });

    } else {
        if (bet > MAX_BET_SOLO) {
            const msg = `🚫 الحد الأقصى للرهان الفردي هو **${MAX_BET_SOLO}** ${EMOJI_MORA}.`;
            if (interaction) await interaction.followUp({ content: msg, ephemeral: true }); else channel.send(msg);
            return;
        }

        client.activePlayers.add(user.id);
        userData.mora = (Number(userData.mora) || 0) - bet;
        if (user.id !== OWNER_ID) userData.lastRoulette = Date.now();
        await client.setLevel(userData);

        const initialEmbed = new EmbedBuilder().setTitle('❖ رولــيـت (فردي)').setColor("Random").setImage('https://i.postimg.cc/J44F9YWS/gun.gif').addFields({ name: 'الطلقة الحالية', value: `1 / ${CHAMBER_COUNT}`, inline: true }, { name: 'المضاعف الحالي', value: 'x1.0', inline: true });
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('rl_pull').setLabel('سحب الزناد').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('rl_cashout').setLabel('انسحاب (Cash Out)').setStyle(ButtonStyle.Success).setDisabled(true)
        );

        let msg;
        try {
            if (interaction) msg = await interaction.editReply({ content: " ", embeds: [initialEmbed], components: [row] });
            else msg = await channel.send({ content: " ", embeds: [initialEmbed], components: [row] });
            
            await playSoloRound(msg, user, member, bet, userData, client, db);
        } catch (err) {
            client.activePlayers.delete(user.id);
            if (interaction) await interaction.followUp({ content: "حدث خطأ.", ephemeral: true });
        }
    }
}

async function playSoloRound(message, user, member, bet, userData, client, db) {
    let chambers = setupChambers();
    let currentTurn = 0;
    let currentMultiplier = 1.0;
    const MULTIPLIERS = getMultipliers(1);
    const buttonStyles = [ButtonStyle.Primary, ButtonStyle.Secondary, ButtonStyle.Success, ButtonStyle.Danger];

    const updateEmbed = () => {
        return new EmbedBuilder().setTitle('❖ رولــيـت (فردي)').setColor("Random").setImage('https://i.postimg.cc/J44F9YWS/gun.gif').addFields(
            { name: 'الطلقة الحالية', value: `${currentTurn + 1} / ${CHAMBER_COUNT}`, inline: true },
            { name: 'المضاعف الحالي', value: `x${currentMultiplier}`, inline: true }
        );
    };

    const collector = message.createMessageComponentCollector({ filter: i => i.user.id === user.id, time: 120000 });

    collector.on('collect', async i => {
        try {
            await i.deferUpdate().catch(() => {});

            if (i.customId === 'rl_cashout') {
                let moraMultiplier = await calculateMoraBuff(member, db);
                let win = Math.floor(bet * currentMultiplier * moraMultiplier);
                
                let casinoTax = 0;
                let taxText = "";
                let settings;
                try {
                    const settingsRes = await db.query(`SELECT "roleCasinoKing" FROM settings WHERE "guild" = $1`, [message.guild.id]);
                    settings = settingsRes.rows[0];
                } catch(e) {
                    const settingsRes = await db.query(`SELECT rolecasinoking FROM settings WHERE guild = $1`, [message.guild.id]).catch(()=>({rows:[]}));
                    settings = settingsRes.rows[0];
                }
                
                if (settings && (settings.roleCasinoKing || settings.rolecasinoking) && !member.roles.cache.has(settings.roleCasinoKing || settings.rolecasinoking)) {
                    const kingMembers = message.guild.roles.cache.get(settings.roleCasinoKing || settings.rolecasinoking)?.members;
                    if (kingMembers && kingMembers.size > 0) {
                        const king = kingMembers.first();
                        casinoTax = Math.floor(win * 0.01);
                        if (casinoTax > 0) {
                            win -= casinoTax;
                            taxText = `\n👑 ضريبـة ملـك الكازيـنـو (-1%): **${casinoTax}**-`;
                            // ✅ RETURNING لتحديث كاش الملك فوراً
                            try {
                                const kingRes = await db.query(`UPDATE levels SET "bank" = "bank" + $1 WHERE "user" = $2 AND "guild" = $3 RETURNING "bank"`, [casinoTax, king.id, message.guild.id]);
                                if (client.updateLevelField && kingRes.rows[0]) client.updateLevelField(king.id, message.guild.id, { bank: Number(kingRes.rows[0].bank) });
                            } catch(e) { await db.query(`UPDATE levels SET bank = bank + $1 WHERE userid = $2 AND guildid = $3`, [casinoTax, king.id, message.guild.id]).catch(()=>{}); }
                        }
                    }
                }

                // ✅ RETURNING لتحديث كاش اللاعب فوراً ومنع الكتابة المؤجلة من محو المكاسب
                try {
                    const winRes = await db.query(`UPDATE levels SET "mora" = "mora" + $1 WHERE "user" = $2 AND "guild" = $3 RETURNING "mora"`, [win, user.id, message.guild.id]);
                    if (client.updateLevelField && winRes.rows[0]) client.updateLevelField(user.id, message.guild.id, { mora: Number(winRes.rows[0].mora) });
                } catch(e) { await db.query(`UPDATE levels SET mora = mora + $1 WHERE userid = $2 AND guildid = $3`, [win, user.id, message.guild.id]).catch(console.error); }

                if (updateGuildStat) {
                    updateGuildStat(client, message.guild.id, user.id, 'casino_profit', Math.max(0, win - bet));
                }

                const winEmbed = new EmbedBuilder()
                    .setTitle('✅ نجاة!')
                    .setDescription(`انـسـحبـت من اللعـبـة ونجـوت بـ: **${win}** ${EMOJI_MORA}${taxText}`)
                    .setColor(Colors.Green)
                    .setImage('https://i.postimg.cc/K8QBCQmS/download-1.gif')
                    .setThumbnail(user.displayAvatarURL());

                await message.edit({ embeds: [winEmbed], components: [] });
                collector.stop('finished');
            } 
            else if (i.customId === 'rl_pull') {
                if (chambers[currentTurn] === 1) {
                    const loseEmbed = new EmbedBuilder()
                        .setTitle('💥 بــــووم!')
                        .setDescription(`سـحبـت الزناد وانطلقت الرصاصـة ...\n\nخسـرت رهـانـك **${bet}** ${EMOJI_MORA}`)
                        .setColor(Colors.Red)
                        .setImage('https://i.postimg.cc/3Np26Tx9/download.gif')
                        .setThumbnail(user.displayAvatarURL());
                    
                    await message.edit({ embeds: [loseEmbed], components: [] });
                    collector.stop('finished');
                } else {
                    currentMultiplier = MULTIPLIERS[currentTurn];
                    currentTurn++;
                    if (currentTurn === 5) {
                        let moraMultiplier = await calculateMoraBuff(member, db);
                        let win = Math.floor(bet * MULTIPLIERS[4] * moraMultiplier);
                        
                        let casinoTax = 0;
                        let taxText = "";
                        let settings;
                        try {
                            const settingsRes = await db.query(`SELECT "roleCasinoKing" FROM settings WHERE "guild" = $1`, [message.guild.id]);
                            settings = settingsRes.rows[0];
                        } catch(e) {
                            const settingsRes = await db.query(`SELECT rolecasinoking FROM settings WHERE guild = $1`, [message.guild.id]).catch(()=>({rows:[]}));
                            settings = settingsRes.rows[0];
                        }
                        
                        if (settings && (settings.roleCasinoKing || settings.rolecasinoking) && !member.roles.cache.has(settings.roleCasinoKing || settings.rolecasinoking)) {
                            const kingMembers = message.guild.roles.cache.get(settings.roleCasinoKing || settings.rolecasinoking)?.members;
                            if (kingMembers && kingMembers.size > 0) {
                                const king = kingMembers.first();
                                casinoTax = Math.floor(win * 0.01);
                                if (casinoTax > 0) {
                                    win -= casinoTax;
                                    taxText = `\n👑 ضريبـة ملـك الكازيـنـو (-1%): **${casinoTax}**-`;
                                    // ✅ RETURNING لتحديث كاش الملك
                                    try {
                                        const kingRes = await db.query(`UPDATE levels SET "bank" = "bank" + $1 WHERE "user" = $2 AND "guild" = $3 RETURNING "bank"`, [casinoTax, king.id, message.guild.id]);
                                        if (client.updateLevelField && kingRes.rows[0]) client.updateLevelField(king.id, message.guild.id, { bank: Number(kingRes.rows[0].bank) });
                                    } catch(e) { await db.query(`UPDATE levels SET bank = bank + $1 WHERE userid = $2 AND guildid = $3`, [casinoTax, king.id, message.guild.id]).catch(()=>{}); }
                                }
                            }
                        }

                        // ✅ RETURNING لتحديث كاش اللاعب ومنع الكتابة المؤجلة من محو المكاسب
                        try {
                            const winRes = await db.query(`UPDATE levels SET "mora" = "mora" + $1 WHERE "user" = $2 AND "guild" = $3 RETURNING "mora"`, [win, user.id, message.guild.id]);
                            if (client.updateLevelField && winRes.rows[0]) client.updateLevelField(user.id, message.guild.id, { mora: Number(winRes.rows[0].mora) });
                        } catch(e) { await db.query(`UPDATE levels SET mora = mora + $1 WHERE userid = $2 AND guildid = $3`, [win, user.id, message.guild.id]).catch(console.error); }

                        if (updateGuildStat) {
                            updateGuildStat(client, message.guild.id, user.id, 'casino_profit', Math.max(0, win - bet));
                        }

                        const maxEmbed = new EmbedBuilder().setTitle('🏆 نجاة أسطورية!').setDescription(`ربحت **${win}** ${EMOJI_MORA}${taxText}`).setColor("Gold").setImage('https://i.postimg.cc/K8QBCQmS/download-1.gif').setThumbnail(user.displayAvatarURL());
                        await message.edit({ embeds: [maxEmbed], components: [] });
                        collector.stop('finished');
                    } else {
                        let moraMultiplier = await calculateMoraBuff(member, db);
                        const potentialWin = Math.floor(bet * currentMultiplier * moraMultiplier);
                        const nextEmbed = updateEmbed();
                        nextEmbed.setDescription(`*كليك*... فارغة! 😅`);
                        
                        const randomStyle = buttonStyles[Math.floor(Math.random() * buttonStyles.length)];

                        const newRow = new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId('rl_pull').setLabel('سحب الزناد مجدداً').setStyle(randomStyle),
                            new ButtonBuilder().setCustomId('rl_cashout').setLabel(`انسحاب (${potentialWin})`).setStyle(ButtonStyle.Success)
                        );
                        await message.edit({ embeds: [nextEmbed], components: [newRow] });
                    }
                }
            }
        } catch (error) {
            console.error("Roulette Error:", error);
            collector.stop('error'); 
        }
    });

    collector.on('end', async (collected, reason) => {
        client.activePlayers.delete(user.id);
        if (reason === 'time') {
            await message.edit({ content: "⏰ انتهى الوقت.", components: [] }).catch(()=>{});
        }
    });
}

async function playMultiplayerGame(msg, players, bet, totalPot, client, guild, db) {
    const MULTIPLIERS = getMultipliers(players.length);
    const gameStates = new Map();
    players.forEach(p => gameStates.set(p.id, { chambers: setupChambers(), turn: 0, multiplier: 1.0, status: 'playing', player: p }));

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('rl_race_pull').setLabel('🔥 إطلاق').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('rl_race_out').setLabel('🏳️ انسحاب').setStyle(ButtonStyle.Secondary)
    );
    const embed = new EmbedBuilder().setTitle('🔫 بدأ السباق!').setColor("Orange").setDescription(`الكل دفع **${bet}**. الجائزة: **${totalPot}**`);
    await msg.edit({ content: " ", embeds: [embed], components: [row] });

    const collector = msg.createMessageComponentCollector({ time: 90000 });

    collector.on('collect', async i => {
        try {
            await i.deferUpdate().catch(()=>{}); 
            const state = gameStates.get(i.user.id);
            if (!state || state.status !== 'playing') return;

            if (i.customId === 'rl_race_out') {
                state.status = 'cashed_out';
                await i.followUp({ content: `انسحبت x${state.multiplier}`, ephemeral: true });
            } else {
                if (state.chambers[state.turn] === 1) {
                    state.status = 'dead'; state.multiplier = 0;
                    await i.followUp({ content: `💥 مت!`, ephemeral: true });
                } else {
                    state.multiplier = MULTIPLIERS[state.turn]; state.turn++;
                    if (state.turn === 5) { state.status = 'max_win'; await i.followUp({ content: `🏆 Max!`, ephemeral: true }); }
                    else await i.followUp({ content: `نجاة! التالي x${MULTIPLIERS[state.turn]}`, ephemeral: true });
                }
            }
            if (Array.from(gameStates.values()).every(s => s.status !== 'playing')) collector.stop();
        } catch (e) {
            console.error("Multiplayer Roulette Error:", e);
        }
    });

    collector.on('end', async () => {
        players.forEach(p => client.activePlayers.delete(p.id));
        
        let winner = null, maxMult = 0;
        for (const s of gameStates.values()) {
            if (s.multiplier > maxMult) { maxMult = s.multiplier; winner = s.player; }
        }
        
        if (winner && maxMult > 1) {
            let finalWinnings = totalPot;
            // ✅ RETURNING لتحديث كاش الفائز فوراً
            try {
                const winRes = await db.query(`UPDATE levels SET "mora" = "mora" + $1 WHERE "user" = $2 AND "guild" = $3 RETURNING "mora"`, [finalWinnings, winner.id, guild.id]);
                if (client.updateLevelField && winRes.rows[0]) client.updateLevelField(winner.id, guild.id, { mora: Number(winRes.rows[0].mora) });
            } catch(e) { await db.query(`UPDATE levels SET mora = mora + $1 WHERE userid = $2 AND guildid = $3`, [finalWinnings, winner.id, guild.id]).catch(console.error); }

            const winEmbed = new EmbedBuilder()
                .setTitle(`🏆 الفائز: ${winner.displayName}`)
                .setDescription(`ربـح **${finalWinnings}** ${EMOJI_MORA}`)
                .setColor("Gold");

            msg.edit({ embeds: [winEmbed], components: [] }).catch(()=>{});
        } else {
            const loseEmbed = new EmbedBuilder().setTitle("💀 لا فائز").setDescription(`استرجاع الأموال.`).setColor("Red");
            // ✅ RETURNING لتحديث كاش كل لاعب عند الاسترداد
            for (const p of players) {
                try {
                    const refundRes = await db.query(`UPDATE levels SET "mora" = "mora" + $1 WHERE "user" = $2 AND "guild" = $3 RETURNING "mora"`, [bet, p.id, guild.id]);
                    if (client.updateLevelField && refundRes.rows[0]) client.updateLevelField(p.id, guild.id, { mora: Number(refundRes.rows[0].mora) });
                } catch(e) { await db.query(`UPDATE levels SET mora = mora + $1 WHERE userid = $2 AND guildid = $3`, [bet, p.id, guild.id]).catch(console.error); }
            }
            msg.edit({ embeds: [loseEmbed], components: [] }).catch(()=>{});
        }
    });
}
