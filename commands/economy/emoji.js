const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, Colors } = require('discord.js');
const { calculateMoraBuff } = require('../../streak-handler.js');

let updateGuildStat;
try {
    ({ updateGuildStat } = require('../../handlers/guild-board-handler.js'));
} catch (e) {}

const EMOJI_MORA = '<:mora:1435647151349698621>';
const MIN_BET = 10;
const MAX_BET = 100; 
const COOLDOWN_MS = 1 * 60 * 60 * 1000; 
const MEMORY_TIME = 3000; 

const EMOJI_POOL = [
    '🍎', '🍌', '🍇', '🍉', '🍒', '🍓', '🍍', '🥝', '🥥', '🥑', 
    '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯',
    '⚽', '🏀', '🏈', '⚾', '🎾', '🏐', '🎱', '🏓', '🥊', '🥋',
    '🚗', '🚕', '🚙', '🚌', '🚒', '✈️', '🚀', '🛸', '🛶', '🚤',
    '😀', '😎', '🥳', '😡', '🥶', '🤡', '👽', '🤖', '👻', '💀',
    '⌚', '📱', '💻', '📷', '📺', '💡', '🔦', '💎', '💍', '👑'
];

function formatTime(ms) {
    if (ms < 0) ms = 0;
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor(((ms % 360000) % 60000) / 1000);
    return `${minutes} دقيقة و ${seconds} ثانية`;
}

// 🔥 دالة حساب تخفيض وقت الانتظار بناءً على السمعة (صامتة تماماً) 🔥
async function getCooldownReductionMs(db, userId, guildId) {
    try {
        let repRes;
        try { repRes = await db.query(`SELECT "rep_points" FROM user_reputation WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId]); }
        catch(e) { repRes = await db.query(`SELECT rep_points FROM user_reputation WHERE userid = $1 AND guildid = $2`, [userId, guildId]).catch(()=>({rows:[]})); }
        
        const points = repRes.rows[0]?.rep_points || repRes.rows[0]?.rep_points || 0;
        
        let reductionMinutes = 0;
        if (points >= 1000) reductionMinutes = 30;      // SS
        else if (points >= 500) reductionMinutes = 15;  // S
        else if (points >= 250) reductionMinutes = 10;  // A
        else if (points >= 100) reductionMinutes = 8;   // B
        else if (points >= 50) reductionMinutes = 7;    // C
        else if (points >= 25) reductionMinutes = 6;    // D
        else if (points >= 10) reductionMinutes = 5;    // E

        return reductionMinutes * 60 * 1000; 
    } catch(e) { return 0; }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ايموجي')
        .setDescription('لعبة الذاكرة: احفظ أماكن الإيموجيات واربح!')
        .addIntegerOption(option => 
            option.setName('الرهان')
                .setDescription('مبلغ الرهان (اختياري)')
                .setRequired(false)
                .setMinValue(MIN_BET)
                .setMaxValue(MAX_BET)
        ),

    name: 'emoji',
    aliases: ['ايموجي', 'ذاكرة', 'mem', 'e'],
    category: "Economy",
    description: "لعبة تحدي الذاكرة (3x3).",

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, user, member, guild, client, channel;
        let betInput;

        if (isSlash) {
            interaction = interactionOrMessage;
            user = interaction.user;
            member = interaction.member;
            guild = interaction.guild;
            client = interaction.client;
            channel = interaction.channel;
            betInput = interaction.options.getInteger('الرهان');
            await interaction.deferReply();
        } else {
            message = interactionOrMessage;
            user = message.author;
            member = message.member;
            guild = message.guild;
            client = message.client;
            channel = message.channel;
            if (args[0] && !isNaN(parseInt(args[0]))) betInput = parseInt(args[0]);
        }

        const reply = async (payload) => {
            if (isSlash) return interaction.editReply(payload);
            return message.channel.send(payload);
        };

        const replyError = async (content) => {
            const payload = { content, ephemeral: true };
            if (isSlash) return interaction.editReply(payload);
            return message.reply(payload);
        };

        if (!client.activePlayers) client.activePlayers = new Set();
        
        if (client.activePlayers.has(user.id)) {
            return replyError("🚫 لديك لعبة نشطة بالفعل! أكملها أولاً.");
        }

        const db = client.sql;
        let userData = await client.getLevel(user.id, guild.id);
        if (!userData) userData = { ...client.defaultData, user: user.id, guild: guild.id };

        const now = Date.now();
        const OWNER_ID = "1145327691772481577"; 
        if (user.id !== OWNER_ID) {
            const lastPlayed = Number(userData.lastMemory || userData.lastmemory) || 0; 
            
            // 🔥 حساب الوقت المتبقي مع تخفيض السمعة 🔥
            const reductionMs = await getCooldownReductionMs(db, user.id, guild.id);
            const effectiveCooldown = Math.max(0, COOLDOWN_MS - reductionMs);
            const timeLeft = (lastPlayed + effectiveCooldown) - now;
            
            if (timeLeft > 0) {
                return replyError(`🕐 انتظر **\`${formatTime(timeLeft)}\`** قبل اللعب مرة أخرى.`);
            }
        }

        let finalBetAmount = betInput;

        if (finalBetAmount) {
            if (finalBetAmount < MIN_BET) return replyError(`❌ الحد الأدنى للرهان هو **${MIN_BET}** ${EMOJI_MORA}.`);
            if (finalBetAmount > MAX_BET) return replyError(`🚫 الحد الأقصى للرهان هو **${MAX_BET}** ${EMOJI_MORA}.`);
        } 
        else {
            if (Number(userData.mora) < MIN_BET) return replyError(`❌ لا تملك مورا كافية (الحد الأدنى ${MIN_BET})!`);
            finalBetAmount = 100;
            if (Number(userData.mora) < 100) finalBetAmount = Number(userData.mora);
        }

        return startMemoryGame(channel, user, member, finalBetAmount, client, guild, db, isSlash ? interaction : null);
    }
};

async function startMemoryGame(channel, user, member, bet, client, guild, db, interaction) {
    if (client.activePlayers.has(user.id)) return;
    
    let userData = await client.getLevel(user.id, guild.id);
    if (!userData) userData = { ...client.defaultData, user: user.id, guild: guild.id };

    if (Number(userData.mora) < bet) {
        const msg = `❌ ليس لديك مورا كافية! (رصيدك: ${userData.mora})`;
        if (interaction && !interaction.replied && !interaction.deferred) await interaction.reply({ content: msg, ephemeral: true });
        else if (interaction) await interaction.editReply({ content: msg, ephemeral: true });
        else channel.send(msg);
        return;
    }

    client.activePlayers.add(user.id);
    
    userData.mora = Number(userData.mora) - bet;
    const nowTime = Date.now();
    userData.lastMemory = nowTime; 
    
    try {
        await db.query(`UPDATE levels SET "mora" = $1, "lastMemory" = $2 WHERE "user" = $3 AND "guild" = $4`, [userData.mora, nowTime, user.id, guild.id]);
    } catch(e) {
        await db.query(`UPDATE levels SET mora = $1, lastmemory = $2 WHERE userid = $3 AND guildid = $4`, [userData.mora, nowTime, user.id, guild.id]).catch(()=>{});
    }

    await client.setLevel(userData);

    let gridEmojis = [];
    const poolCopy = [...EMOJI_POOL];
    for(let i=0; i<9; i++) {
        const randomIndex = Math.floor(Math.random() * poolCopy.length);
        gridEmojis.push(poolCopy[randomIndex]);
        poolCopy.splice(randomIndex, 1);
    }

    const targetIndex = Math.floor(Math.random() * 9);
    const targetEmoji = gridEmojis[targetIndex];

    const rowsReveal = [];
    for (let i = 0; i < 3; i++) {
        const row = new ActionRowBuilder();
        for (let j = 0; j < 3; j++) {
            const index = (i * 3) + j;
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`mem_reveal_${index}`)
                    .setEmoji(gridEmojis[index])
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true) 
            );
        }
        rowsReveal.push(row);
    }

    const memorizeEmbed = new EmbedBuilder()
        .setTitle('🧠 تحدي الذاكرة!')
        .setDescription(`**احفظ أماكن الإيموجيات!**\nستختفي بعد **3 ثواني**...`)
        .setColor(Colors.Gold)
        .setFooter({ text: `الرهان: ${bet}` });

    let gameMsg;
    try {
        if (interaction) {
            gameMsg = await interaction.editReply({ content: " ", embeds: [memorizeEmbed], components: rowsReveal });
        } else {
            gameMsg = await channel.send({ content: `${user}`, embeds: [memorizeEmbed], components: rowsReveal });
        }
    } catch (e) {
        client.activePlayers.delete(user.id);
        return;
    }

    setTimeout(async () => {
        try {
            const rowsHidden = [];
            for (let i = 0; i < 3; i++) {
                const row = new ActionRowBuilder();
                for (let j = 0; j < 3; j++) {
                    const index = (i * 3) + j;
                    row.addComponents(
                        new ButtonBuilder()
                            .setCustomId(`mem_guess_${index}`)
                            .setLabel('❓')
                            .setStyle(ButtonStyle.Primary)
                    );
                }
                rowsHidden.push(row);
            }

            const askEmbed = new EmbedBuilder()
                .setTitle('🤔 أين كان هذا الإيموجي؟')
                .setDescription(`## ${targetEmoji}\n\nاضغط على الزر الصحيح الذي كان يحتوي على هذا الإيموجي!`)
                .setColor(Colors.Blue);

            await gameMsg.edit({ embeds: [askEmbed], components: rowsHidden });

            const collector = gameMsg.createMessageComponentCollector({ 
                filter: i => i.user.id === user.id, 
                time: 10000,
                max: 1
            });

            collector.on('collect', async i => {
                try {
                    await i.deferUpdate();
                    const clickedIndex = parseInt(i.customId.split('_')[2]);

                    const rowsFinal = [];
                    for (let r = 0; r < 3; r++) {
                        const row = new ActionRowBuilder();
                        for (let c = 0; c < 3; c++) {
                            const idx = (r * 3) + c;
                            const btn = new ButtonBuilder()
                                .setCustomId(`mem_end_${idx}`)
                                .setEmoji(gridEmojis[idx])
                                .setDisabled(true);

                            if (idx === targetIndex) {
                                btn.setStyle(ButtonStyle.Success);
                            } else if (idx === clickedIndex && clickedIndex !== targetIndex) {
                                btn.setStyle(ButtonStyle.Danger);
                            } else {
                                btn.setStyle(ButtonStyle.Secondary);
                            }
                            row.addComponents(btn);
                        }
                        rowsFinal.push(row);
                    }

                    if (clickedIndex === targetIndex) {
                        let moraMultiplier = 1.0;
                        if (calculateMoraBuff) {
                            moraMultiplier = await calculateMoraBuff(member, db);
                        }

                        let winAmount = Math.floor(bet * 2.0 * moraMultiplier);
                        let casinoTax = 0;
                        let taxText = "";

                        let settings;
                        try {
                            const settingsRes = await db.query(`SELECT "roleCasinoKing" FROM settings WHERE "guild" = $1`, [guild.id]);
                            settings = settingsRes.rows[0];
                        } catch(e) {
                            const settingsRes = await db.query(`SELECT rolecasinoking FROM settings WHERE guild = $1`, [guild.id]).catch(()=>({rows:[]}));
                            settings = settingsRes.rows[0];
                        }
                        
                        if (settings && (settings.roleCasinoKing || settings.rolecasinoking) && !member.roles.cache.has(settings.roleCasinoKing || settings.rolecasinoking)) {
                            const kingMembers = guild.roles.cache.get(settings.roleCasinoKing || settings.rolecasinoking)?.members;
                            if (kingMembers && kingMembers.size > 0) {
                                const king = kingMembers.first();
                                casinoTax = Math.floor(winAmount * 0.01);
                                if (casinoTax > 0) {
                                    winAmount -= casinoTax;
                                    taxText = `\n👑 ضريبـة ملـك الكازيـنـو (-1%): **${casinoTax}**-`;
                                    try {
                                        const kingRes = await db.query(`UPDATE levels SET "bank" = "bank" + $1 WHERE "user" = $2 AND "guild" = $3 RETURNING "bank"`, [casinoTax, king.id, guild.id]);
                                        if (client.updateLevelField && kingRes.rows[0]) client.updateLevelField(king.id, guild.id, { bank: Number(kingRes.rows[0].bank) });
                                    } catch(e) {
                                        await db.query(`UPDATE levels SET bank = bank + $1 WHERE userid = $2 AND guildid = $3`, [casinoTax, king.id, guild.id]).catch(()=>{});
                                    }
                                }
                            }
                        }

                        const payout = bet + winAmount;
                        
                        let buffString = "";
                        const buffPercent = Math.round((moraMultiplier - 1) * 100);
                        if (buffPercent > 0) buffString = ` (+${buffPercent}%)`;

                        try {
                            const winRes = await db.query(`UPDATE levels SET "mora" = "mora" + $1 WHERE "user" = $2 AND "guild" = $3 RETURNING "mora"`, [payout, user.id, guild.id]);
                            if (client.updateLevelField && winRes.rows[0]) client.updateLevelField(user.id, guild.id, { mora: Number(winRes.rows[0].mora) });
                        } catch(e) {
                            await db.query(`UPDATE levels SET mora = mora + $1 WHERE userid = $2 AND guildid = $3`, [payout, user.id, guild.id]).catch(()=>{});
                        }

                        if (updateGuildStat) {
                            updateGuildStat(client, guild.id, user.id, 'casino_profit', winAmount);
                        }

                        const winEmbed = new EmbedBuilder()
                            .setTitle('🎉 ذاكــرة قويــة!')
                            .setDescription(`✶ أحسنت! إجابة صحيحة.\n\nربـحت **${winAmount.toLocaleString()}** ${EMOJI_MORA}${buffString}${taxText}`)
                            .setColor(Colors.Green)
                            .setThumbnail(user.displayAvatarURL());

                        await gameMsg.edit({ embeds: [winEmbed], components: rowsFinal });

                    } else {
                        const loseEmbed = new EmbedBuilder()
                            .setTitle('❌ ذاكرة سمـكـة')
                            .setDescription(`✶ خطـأ اختـرت ايموجـي مختلف.\n\nخـسرت **${bet}** ${EMOJI_MORA}`)
                            .setColor(Colors.Red);

                        await gameMsg.edit({ embeds: [loseEmbed], components: rowsFinal });
                    }
                } catch (err) {
                    console.error("Error in memory collector:", err);
                }
            });

            collector.on('end', (collected, reason) => {
                client.activePlayers.delete(user.id);
                
                if (reason === 'time') {
                    const timeEmbed = new EmbedBuilder()
                        .setTitle('⏰ انتهى الوقت!')
                        .setDescription(`لم تختر شيئاً.\nخـسرت **${bet}** ${EMOJI_MORA}`)
                        .setColor(Colors.Red);
                    gameMsg.edit({ embeds: [timeEmbed], components: [] }).catch(()=>{});
                }
            });

        } catch (err) {
            console.error("Memory Game Error:", err);
            client.activePlayers.delete(user.id);
        }

    }, MEMORY_TIME);
}
