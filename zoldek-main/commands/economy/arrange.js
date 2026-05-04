const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const path = require('path');

let streakHandler;
try {
    streakHandler = require('../../streak-handler.js');
} catch (e) {}

let updateGuildStat;
try {
    ({ updateGuildStat } = require('../../handlers/guild-board-handler.js'));
} catch (e) {}

const activePlayers = new Set();
const cooldowns = new Map();

const OWNER_ID = "1145327691772481577";

const MIN_BET = 10;
const MAX_BET = 100;

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
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
        .setName('arrange')
        .setDescription('لعبة ترتيب الأرقام')
        .addIntegerOption(option => 
            option.setName('amount')
                .setDescription('مبلغ الرهان (بين 10 و 100)')
                .setRequired(false)
                .setMinValue(MIN_BET)
                .setMaxValue(MAX_BET)
        ),

    name: 'arrange',
    aliases: ['رتب', 'ترتيب'],
    category: "Economy",
    description: 'لعبـة ترتيــب الأرقــام',
    
    async execute(interactionOrMessage, args) {
        
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, user, guild, channel, betArg;

        if (isSlash) {
            interaction = interactionOrMessage;
            user = interaction.user;
            guild = interaction.guild;
            channel = interaction.channel;
            betArg = interaction.options.getInteger('amount');
            await interaction.deferReply();
        } else {
            message = interactionOrMessage;
            user = message.author;
            guild = message.guild;
            channel = message.channel;
            betArg = args[0] ? parseInt(args[0]) : null;
        }

        const userId = user.id;
        const guildId = guild.id;
        
        const replyError = async (content) => {
            const payload = { content: content };
            if (isSlash) return interaction.editReply(payload);
            return message.reply(payload);
        };

        const client = isSlash ? interaction.client : message.client;
        if (!client.sql) return replyError("❌ خطأ: قاعدة البيانات غير متصلة.");
        
        const db = client.sql; 
        const MORA_EMOJI = client.EMOJI_MORA || '<:mora:1435647151349698621>';

        const clearActive = () => activePlayers.delete(userId);

        if (activePlayers.has(userId)) {
            return replyError("🚫 **لديك عملية نشطة بالفعل!** أكمل اللعبة أو الرهان الحالي أولاً.");
        }

        if (userId !== OWNER_ID) {
            if (cooldowns.has(userId)) {
                const baseCooldown = 3600000; // ساعة كاملة
                const reductionMs = await getCooldownReductionMs(db, userId, guildId);
                const effectiveCooldown = Math.max(0, baseCooldown - reductionMs);

                const expirationTime = cooldowns.get(userId) + effectiveCooldown;
                if (Date.now() < expirationTime) {
                    const timeLeft = (expirationTime - Date.now()) / 1000 / 60;
                    return replyError(`<:stop:1436337453098340442> **ريــلاكــس!** يمكنك اللعب مجدداً بعد **${timeLeft.toFixed(0)} دقيقة**.`);
                }
            }
        }

        activePlayers.add(userId);

        const startGame = async (finalBetAmount) => {
            try {
                let userCheck;
                try {
                    const userCheckRes = await db.query(`SELECT "mora" FROM levels WHERE "user" = $1 AND "guild" = $2`, [userId, guildId]);
                    userCheck = userCheckRes.rows[0];
                } catch(e) {
                    const userCheckRes = await db.query(`SELECT mora FROM levels WHERE userid = $1 AND guildid = $2`, [userId, guildId]).catch(()=>({rows:[]}));
                    userCheck = userCheckRes.rows[0];
                }
                
                if (userCheck && Number(userCheck.mora) < finalBetAmount && !betArg) {
                     finalBetAmount = Number(userCheck.mora);
                }

                if (!userCheck || Number(userCheck.mora) < finalBetAmount) {
                      clearActive(); 
                      return replyError(`💸 **رصيدك غير كافــي!** <:mirkk:1435648219488190525>`);
                }
                
                if (finalBetAmount < MIN_BET) {
                    clearActive();
                    return replyError(`❌ **الحد الأدنى للرهان هو ${MIN_BET} ${MORA_EMOJI}**`);
                }

                try {
                    await db.query(`UPDATE levels SET "mora" = "mora" - $1 WHERE "user" = $2 AND "guild" = $3`, [finalBetAmount, userId, guildId]);
                } catch(e) {
                    await db.query(`UPDATE levels SET mora = mora - $1 WHERE userid = $2 AND guildid = $3`, [finalBetAmount, userId, guildId]).catch(console.error);
                }

                const nowTime = Date.now();
                if (userId !== OWNER_ID) cooldowns.set(userId, nowTime);
                
                try {
                    await db.query(`UPDATE levels SET "lastArrange" = $1 WHERE "user" = $2 AND "guild" = $3`, [nowTime, userId, guildId]);
                } catch (e) {
                    await db.query(`UPDATE levels SET lastArrange = $1 WHERE userid = $2 AND guildid = $3`, [nowTime, userId, guildId]).catch(()=>{});
                }

                if (typeof client.getLevel === 'function' && typeof client.setLevel === 'function') {
                    let cacheData = await client.getLevel(userId, guildId);
                    if (!cacheData) cacheData = { ...client.defaultData, user: userId, guild: guildId };
                    
                    cacheData.lastArrange = nowTime;
                    await client.setLevel(cacheData);
                }

                const numbersCount = 9;
                const randomNumbers = new Set();
                while (randomNumbers.size < numbersCount) {
                    randomNumbers.add(getRandomInt(1, 99));
                }
                const numbersArray = Array.from(randomNumbers);
                const sortedSolution = [...numbersArray].sort((a, b) => a - b);
                
                const buttonMap = {}; 
                const buttons = numbersArray.map(num => {
                    const btn = new ButtonBuilder()
                        .setCustomId(`num_${num}`)
                        .setLabel(`${num}`)
                        .setStyle(ButtonStyle.Secondary);
                    buttonMap[`num_${num}`] = btn;
                    return btn;
                });

                const shuffledButtons = buttons.sort(() => Math.random() - 0.5);
                const row1 = new ActionRowBuilder().addComponents(shuffledButtons.slice(0, 3));
                const row2 = new ActionRowBuilder().addComponents(shuffledButtons.slice(3, 6));
                const row3 = new ActionRowBuilder().addComponents(shuffledButtons.slice(6, 9));
                const allRows = [row1, row2, row3];

                const gameEmbed = new EmbedBuilder()
                    .setColor('#FFD700')
                    .setThumbnail(user.displayAvatarURL())
                    .setTitle('❖ رتـب الأرقـام مـن الأصغر للأكـبر')
                    .setDescription(`❖ الرهــان: **${finalBetAmount} ${MORA_EMOJI}**\nاضغط الأزرار بالترتيب الصحيح قبل انتهاء الوقت!`)
                    .setFooter({ text: '❖ لــديــك 25 ثـانيــة' });

                const gameMsg = isSlash 
                    ? await interaction.editReply({ content: '', embeds: [gameEmbed], components: allRows })
                    : await message.channel.send({ embeds: [gameEmbed], components: allRows });

                const startTime = Date.now();
                const collector = gameMsg.createMessageComponentCollector({ 
                    componentType: ComponentType.Button, 
                    time: 25000 
                });

                let currentStep = 0; 
                let isGameFinished = false; // حماية ضد الردود المزدوجة

                const finishGame = async (i, reason) => {
                    if (isGameFinished) return;
                    isGameFinished = true;
                    clearActive(); 
                    try {
                        if (reason === 'win') {
                            const timeTaken = ((Date.now() - startTime) / 1000).toFixed(2);
                            
                            let moraMultiplier = 1.0;
                            const memberObj = isSlash ? interaction.member : message.member;
                            
                            if (streakHandler && streakHandler.calculateMoraBuff) {
                                moraMultiplier = await streakHandler.calculateMoraBuff(memberObj, db);
                            }
                            
                            let profit = Math.floor(finalBetAmount * 3.0 * moraMultiplier); 
                            
                            let casinoTax = 0;
                            let taxText = "";

                            let settings;
                            try {
                                const settingsRes = await db.query(`SELECT "roleCasinoKing" FROM settings WHERE "guild" = $1`, [guildId]);
                                settings = settingsRes.rows[0];
                            } catch(e) {
                                const settingsRes = await db.query(`SELECT rolecasinoking FROM settings WHERE guild = $1`, [guildId]).catch(()=>({rows:[]}));
                                settings = settingsRes.rows[0];
                            }

                            if (settings && (settings.roleCasinoKing || settings.rolecasinoking) && !memberObj.roles.cache.has(settings.roleCasinoKing || settings.rolecasinoking)) {
                                const kingMembers = guild.roles.cache.get(settings.roleCasinoKing || settings.rolecasinoking)?.members;
                                if (kingMembers && kingMembers.size > 0) {
                                    const king = kingMembers.first();
                                    casinoTax = Math.floor(profit * 0.01);
                                    if (casinoTax > 0) {
                                        profit -= casinoTax;
                                        taxText = `\n👑 ضريبـة ملـك الكازيـنـو (-1%): **${casinoTax}**-`;
                                        try {
                                            const kingRes = await db.query(`UPDATE levels SET "bank" = "bank" + $1 WHERE "user" = $2 AND "guild" = $3 RETURNING "bank"`, [casinoTax, king.id, guildId]);
                                            if (client.updateLevelField && kingRes.rows[0]) client.updateLevelField(king.id, guildId, { bank: Number(kingRes.rows[0].bank) });
                                        } catch(e) {
                                            await db.query(`UPDATE levels SET bank = bank + $1 WHERE userid = $2 AND guildid = $3`, [casinoTax, king.id, guildId]).catch(()=>{});
                                        }
                                    }
                                }
                            }

                            const totalPrize = finalBetAmount + profit; 
                            
                            const buffOnlyPercent = Math.round((moraMultiplier - 1) * 100);
                            let buffText = "";
                            if (buffOnlyPercent > 0) buffText = ` (+${buffOnlyPercent}%)`; 

                            try {
                                const winRes = await db.query(`UPDATE levels SET "mora" = "mora" + $1 WHERE "user" = $2 AND "guild" = $3 RETURNING "mora"`, [totalPrize, userId, guildId]);
                                if (client.updateLevelField && winRes.rows[0]) client.updateLevelField(userId, guildId, { mora: Number(winRes.rows[0].mora) });
                            } catch(e) {
                                await db.query(`UPDATE levels SET mora = mora + $1 WHERE userid = $2 AND guildid = $3`, [totalPrize, userId, guildId]).catch(console.error);
                            }

                            if (updateGuildStat) {
                                updateGuildStat(client, guildId, userId, 'casino_profit', profit);
                            }

                            const winEmbed = new EmbedBuilder()
                                .setColor('#00FF00')
                                .setThumbnail(user.displayAvatarURL())
                                .setTitle('❖ كفــوو عليك <:2BCrikka:1437806481071411391>')
                                .setDescription(`✶ جبتها صــح!\n⏱️ الوقت: **${timeTaken}ث**\n💰 ربـحـت: **${profit}** ${MORA_EMOJI}${buffText}${taxText}`);

                            Object.values(buttonMap).forEach(btn => {
                                btn.setDisabled(true);
                                if (btn.data.style === ButtonStyle.Secondary) btn.setStyle(ButtonStyle.Success);
                            });
                            
                            const payload = { embeds: [winEmbed], components: allRows };
                            if (i) await i.update(payload).catch(()=>{});
                            else await gameMsg.edit(payload).catch(()=>{});

                        } else if (reason === 'lose') {
                            const loseEmbed = new EmbedBuilder()
                                .setColor('#FF0000')
                                .setThumbnail(user.displayAvatarURL())
                                .setTitle(' خـسـرت <:catla:1437335118153781360>!')
                                .setDescription(`ضغطت رقم غلط!\nراحت عليك **${finalBetAmount} ${MORA_EMOJI}**`);

                            Object.values(buttonMap).forEach(btn => {
                                btn.setDisabled(true);
                                if (btn.data.style === ButtonStyle.Secondary) btn.setStyle(ButtonStyle.Secondary); 
                            });
                            
                            const payload = { embeds: [loseEmbed], components: allRows };
                            if (i) await i.update(payload).catch(()=>{});
                            else await gameMsg.edit(payload).catch(()=>{});

                        } else if (reason === 'time') {
                            const loseEmbed = new EmbedBuilder()
                                .setColor('#FF0000')
                                .setThumbnail(user.displayAvatarURL())
                                .setTitle(' خـسـرت <:catla:1437335118153781360>!')
                                .setDescription(`انتهى الوقت!\nراحت عليك **${finalBetAmount} ${MORA_EMOJI}**`);

                            Object.values(buttonMap).forEach(btn => btn.setDisabled(true));
                            await gameMsg.edit({ embeds: [loseEmbed], components: allRows }).catch(() => {});
                        }
                    } catch (err) { console.error("Game finish error:", err); }
                };

                collector.on('collect', async i => {
                    if (isGameFinished) return i.deferUpdate().catch(()=>{}); // حماية إذا انتهت اللعبة
                    
                    if (i.user.id !== userId) return i.reply({ content: 'هذه اللعبة ليست لك!', flags: [MessageFlags.Ephemeral] });

                    const clickedNum = parseInt(i.customId.split('_')[1]);
                    const correctNum = sortedSolution[currentStep];

                    if (clickedNum === correctNum) {
                        currentStep++;
                        buttonMap[i.customId].setStyle(ButtonStyle.Success).setDisabled(true);

                        if (currentStep === sortedSolution.length) {
                            collector.stop('finished');
                            await finishGame(i, 'win');
                        } else {
                            // 🔥 التحديث الفوري (Instant Feedback) 🔥
                            await i.update({ components: allRows }).catch(()=>{});
                        }
                    } else {
                        buttonMap[i.customId].setStyle(ButtonStyle.Danger);
                        collector.stop('finished');
                        await finishGame(i, 'lose');
                    }
                });

                collector.on('end', async (collected, reason) => {
                    if (reason === 'time') {
                        await finishGame(null, 'time');
                    } else if (reason !== 'finished') {
                        clearActive();
                    }
                });

            } catch (err) {
                clearActive();
                console.error("خطأ أثناء بدء اللعبة:", err);
                replyError("حدث خطأ أثناء بدء اللعبة.");
            }
        };

        if (betArg && isNaN(betArg)) {
             clearActive();
             return replyError("❌ **الرجاء إدخال مبلغ رهان صحيح (أرقام فقط).**");
        }

        let finalBetAmount = betArg;

        if (finalBetAmount) {
            if (finalBetAmount < MIN_BET) {
                clearActive(); return replyError(`❌ **الحد الأدنى للرهان هو ${MIN_BET} ${MORA_EMOJI}**`);
            }
            if (finalBetAmount > MAX_BET) {
                clearActive(); return replyError(`❌ **الحد الأقصى للرهان هو ${MAX_BET} ${MORA_EMOJI}**`);
            }
            return startGame(finalBetAmount);
        }

        let userData;
        try {
            const userDataRes = await db.query(`SELECT "mora" FROM levels WHERE "user" = $1 AND "guild" = $2`, [userId, guildId]);
            userData = userDataRes.rows[0];
        } catch(e) {
            const userDataRes = await db.query(`SELECT mora FROM levels WHERE userid = $1 AND guildid = $2`, [userId, guildId]).catch(()=>({rows:[]}));
            userData = userDataRes.rows[0];
        }
        
        if (!userData || Number(userData.mora) < MIN_BET) {
            clearActive();
            return replyError(`💸 **ليس لديك مورا كافية للعب! (الحد الأدنى ${MIN_BET})** <:catla:1437335118153781360>`);
        }

        let proposedBet = 100;
        if (Number(userData.mora) < 100) proposedBet = Number(userData.mora);

        return startGame(proposedBet);
    }
};
