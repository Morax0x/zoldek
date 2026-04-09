const { EmbedBuilder, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags, Colors } = require("discord.js");
const { startGuardBattle } = require('../../handlers/knight-battle');

let updateGuildStat;
try {
    ({ updateGuildStat } = require('../../handlers/guild-board-handler.js'));
} catch (e) {}

const EMOJI_MORA = '<:mora:1435647151349698621>';
const EMPRESS_BOT_ID = "1434804075484020755";
const REAL_OWNER_ID = "1145327691772481577";

const MIN_CASH_PERCENT = 0.05;
const MAX_CASH_PERCENT = 0.10;
const MIN_BANK_PERCENT = 0.01;
const MAX_BANK_PERCENT = 0.05;
const ROBBER_FINE_PERCENT = 0.10;

const MIN_ROB_AMOUNT = 100;
const MIN_REQUIRED_CASH = 100;
const COOLDOWN_MS = 1 * 60 * 60 * 1000;

const robberyPardons = new Map();
const activeRobberies = new Set();

function getKSADateString() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' });
}

function getNextMidnightTimestamp() {
    const now = new Date();
    const ksaTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Riyadh" }));
    const nextMidnight = new Date(ksaTime);
    nextMidnight.setHours(24, 0, 0, 0);
    return Math.floor((Date.now() + (nextMidnight.getTime() - ksaTime.getTime())) / 1000);
}

function formatTime(ms) {
    if (ms < 0) ms = 0;
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const hh = String(hours).padStart(2, '0');
    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');
    if (hours > 0) return `${hh}:${mm}:${ss}`;
    return `${mm}:${ss}`;
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

function deductFromRobber(data, amount) {
    let mora = Number(data.mora) || 0;
    let bank = Number(data.bank) || 0;
    
    if (mora >= amount) {
        mora -= amount;
    } else {
        const remaining = amount - mora;
        mora = 0;
        bank = Math.max(0, bank - remaining);
    }
    
    data.mora = String(mora);
    data.bank = String(bank);
    return data;
}

async function sendDMToVictim(victim, messageContent) {
    try {
        if (victim.bot) return;
        await victim.send(messageContent);
    } catch (error) {}
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('سرقة')
        .setDescription('محاولة سرقة المورا من عضو آخر.')
        .addUserOption(option => 
            option.setName('الضحية')
            .setDescription('العضو الذي تريد سرقته')
            .setRequired(true)),

    name: 'rob',
    aliases: ['سرقة', 'نهب'],
    category: "Economy",
    description: 'محاولة سرقة المورا من عضو آخر.',

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, guild, client, robber, victim;

        if (isSlash) {
            interaction = interactionOrMessage;
            guild = interaction.guild;
            client = interaction.client;
            robber = interaction.member;
            victim = interaction.options.getMember('الضحية');
        } else {
            message = interactionOrMessage;
            guild = message.guild;
            client = message.client;
            robber = message.member;
            victim = message.mentions.members.first();
        }

        const reply = async (payload) => {
            if (typeof payload === 'string') payload = { content: payload };
            if (isSlash) {
                if (interaction.deferred || interaction.replied) return interaction.editReply(payload);
                return interaction.reply(payload);
            }
            else return message.reply(payload).catch(() => message.channel.send(payload));
        };

        if (!victim) return reply("الاستخدام: /سرقة <@user> أو -rob <@user>");

        if (victim.id === REAL_OWNER_ID) {
            if (!isSlash && message) await message.delete().catch(() => {});
            if (isSlash && !interaction.replied && !interaction.deferred) await interaction.reply({ content: `🏰`, flags: [MessageFlags.Ephemeral] });

            const redirectMsg = await interactionOrMessage.channel.send({
                content: `🏰 **تـم نـقـل قـصـر الامبراطـور الى حسـاب الامبراطورة!**\nحاول مجـددا ولكن منشن البوت <@${EMPRESS_BOT_ID}> ..`
            });
            setTimeout(() => redirectMsg.delete().catch(() => {}), 10000);
            return;
        }

        if (isSlash && !interaction.deferred && !interaction.replied) await interaction.deferReply();

        const sql = client.sql;

        if (victim.id === robber.id) {
            if (robber.id === REAL_OWNER_ID) {
                const context = isSlash ? interaction : message;
                return await startGuardBattle(context, client, sql, robber, 5000);
            }
            return reply("تـسـرق نـفـسـك؟ غـبـي انـت؟؟ <:mirkk:1435648219488190525>");
        }

        if (activeRobberies.has(robber.id)) {
            return reply("🚫 **لديك عملية سطو جارية بالفعل!** أنهِها أولاً.");
        }

        let robberData = await client.getLevel(robber.id, guild.id);
        if (!robberData) robberData = { ...client.defaultData, user: robber.id, guild: guild.id };
        
        let victimData = await client.getLevel(victim.id, guild.id);
        if (!victimData) victimData = { ...client.defaultData, user: victim.id, guild: guild.id };

        const robberTotalWealth = (Number(robberData.mora) || 0) + (Number(robberData.bank) || 0);
        if (robberTotalWealth < MIN_REQUIRED_CASH) {
             return reply(`❌ **لا يمكنك السرقة!**\nتحتاج إلى رصيد إجمالي لا يقل عن **${MIN_REQUIRED_CASH.toLocaleString()}** ${EMOJI_MORA} لتتمكن من دفع الغرامة.`);
        }

        const now = Date.now();
        const reductionMs = await getCooldownReductionMs(sql, robber.id, guild.id);
        const effectiveCooldown = Math.max(0, COOLDOWN_MS - reductionMs);
        const timeLeft = (Number(robberData.lastRob || robberData.lastrob) || 0) + effectiveCooldown - now;
        
        if (timeLeft > 0) {
            return reply(`🕐 حـرامـي مـجتـهد انـت <:stop:1436337453098340442> انتـظـر **\`${formatTime(timeLeft)}\`** عشان تسـوي عمـليـة سـطو ثـانيـة.`);
        }

        if (victim.id !== EMPRESS_BOT_ID) {
            const victimTotalWealth = (Number(victimData.mora) || 0) + (Number(victimData.bank) || 0);
            if (victimTotalWealth < MIN_REQUIRED_CASH) {
                return reply(`❌ الضحية **${victim.displayName}** فقير جداً! لا يملك ما يكفي لسرقته.`);
            }
        }

        const victimMora = Number(victimData.mora) || 0;
        const victimBank = Number(victimData.bank) || 0;
        let amountToSteal = 0;
        let targetPool, poolName, victimPoolAmount;
        
        if (victim.id !== EMPRESS_BOT_ID) {
            if (victimBank >= MIN_REQUIRED_CASH && victimMora >= MIN_REQUIRED_CASH) {
                targetPool = Math.random() < 0.5 ? 'mora' : 'bank';
            } else if (victimBank >= MIN_REQUIRED_CASH) {
                targetPool = 'bank';
            } else {
                targetPool = 'mora';
            }

            victimPoolAmount = targetPool === 'bank' ? victimBank : victimMora;
            poolName = targetPool === 'bank' ? "البنك" : "الكاش";

            const robberCap = Math.floor(robberTotalWealth * ROBBER_FINE_PERCENT);
            let victimCap;

            if (targetPool === 'bank') {
                const randomPercent = Math.random() * (MAX_BANK_PERCENT - MIN_BANK_PERCENT) + MIN_BANK_PERCENT;
                victimCap = Math.floor(victimPoolAmount * randomPercent);
            } else {
                const randomPercent = Math.random() * (MAX_CASH_PERCENT - MIN_CASH_PERCENT) + MIN_CASH_PERCENT;
                victimCap = Math.floor(victimPoolAmount * randomPercent);
            }

            amountToSteal = Math.min(robberCap, victimCap);
            if (amountToSteal < MIN_ROB_AMOUNT) {
                 if (victimPoolAmount >= MIN_ROB_AMOUNT) amountToSteal = MIN_ROB_AMOUNT;
                 else {
                     return reply(`❌ الضحية لا يملك ما يكفي لسرقته في ${poolName}!`);
                 }
            }
            
            if (robberTotalWealth < amountToSteal) {
                return reply(`❌ **رصيدك لا يكفي لدفع الغرامة المحتملة!** تحتاج كضمان على الأقل **${amountToSteal.toLocaleString()}** ${EMOJI_MORA}.`);
            }
        }

        activeRobberies.add(robber.id);
        robberData.lastRob = now;
        await client.setLevel(robberData);

        if (victim.id === EMPRESS_BOT_ID) {
            const minEmperor = 100;
            const maxEmperor = 9999;
            amountToSteal = Math.floor(Math.random() * (maxEmperor - minEmperor + 1)) + minEmperor;
            
            if (amountToSteal > robberTotalWealth) {
                amountToSteal = robberTotalWealth;
            }

            const embed = new EmbedBuilder()
                .setTitle('❖ مـحاولـة سـطـو عـلـى قلـعة الامبراطـور')
                .setDescription(`✶ خـطـوة واحدة تفـصل بينـك وبين الغنيمة أو السجن.. ادخـل من أي بـاب من أبواب القلعـة... **${amountToSteal.toLocaleString()}** ${EMOJI_MORA}`)
                .setColor('#2F3136')
                .setImage('https://i.postimg.cc/0jQvvNNh/fort.jpg'); 

            const buttons = [];
            for (let i = 1; i <= 9; i++) {
                buttons.push(new ButtonBuilder().setCustomId(`rob_${i}`).setLabel('🚪').setStyle(ButtonStyle.Secondary));
            }
            
            const rows = [
                new ActionRowBuilder().addComponents(buttons.slice(0, 3)),
                new ActionRowBuilder().addComponents(buttons.slice(3, 6)),
                new ActionRowBuilder().addComponents(buttons.slice(6, 9))
            ];

            const correctIndex = Math.floor(Math.random() * 9);

            const msg = await reply({ embeds: [embed], components: rows });
            
            const filter = i => i.user.id === robber.id;
            const collector = msg.createMessageComponentCollector({ filter, componentType: ComponentType.Button, time: 20000, max: 1 });

            collector.on('collect', async i => {
                const clickedIndex = parseInt(i.customId.split('_')[1]) - 1;

                if (clickedIndex === correctIndex) {
                    robberData.mora = String((Number(robberData.mora) || 0) + amountToSteal);
                    await client.setLevel(robberData);

                    const winEmbed = new EmbedBuilder()
                        .setTitle('❖ سـطـو نـاجـح !')
                        .setColor(Colors.Green)
                        .setImage('https://i.postimg.cc/QVLQyyDK/rob.gif')
                        .setDescription(`لقد تمكنت من التسلل وسرقة **${amountToSteal.toLocaleString()}** ${EMOJI_MORA} من خزانة الإمبراطور!`);
                    
                    await i.update({ embeds: [winEmbed], components: [] });
                    activeRobberies.delete(robber.id);

                } else {
                    const todayDate = getKSADateString();
                    const lastPardonDate = robberyPardons.get(robber.id);
                    const canBePardoned = lastPardonDate !== todayDate;

                    if (canBePardoned) {
                        robberData.mora = String((Number(robberData.mora) || 0) + 100);
                        await client.setLevel(robberData);
                        robberyPardons.set(robber.id, todayDate);

                        const nextMidnightTimestamp = getNextMidnightTimestamp();
                        const pardonEmbed = new EmbedBuilder()
                            .setTitle('❖ مـحاولـة سـطـو فـاشـلـة')
                            .setColor('#FFD700')
                            .setImage('https://i.postimg.cc/cLky0W3d/mor.gif')
                            .setDescription(
                                `✶ أمسك بك الفرسان وأنت تحاول السطو على القلعة ولكن **عفا عنك الإمبراطور** وأعطاك 100 ${EMOJI_MORA}\n\n` +
                                `★ فـرسـان الامبراطـور يراقبـونـك حـتـى : <t:${nextMidnightTimestamp}:R>`
                            );
                        await i.update({ embeds: [pardonEmbed], components: [] });
                        activeRobberies.delete(robber.id); 

                    } else {
                        await msg.delete().catch(() => {});
                        activeRobberies.delete(robber.id);
                        
                        const context = isSlash ? interaction : message;
                        return await startGuardBattle(context, client, sql, robber, amountToSteal);
                    }
                }
            });

            collector.on('end', async (collected, reason) => {
                activeRobberies.delete(robber.id);
                if (reason === 'time' && collected.size === 0) {
                    deductFromRobber(robberData, amountToSteal);
                    await client.setLevel(robberData);
                    
                    const timeEmbed = new EmbedBuilder()
                        .setTitle('⏰ فات الأوان!')
                        .setColor(Colors.Red)
                        .setDescription(`تأخرت في الاختيار فأمسك بك الحراس! خسرت **${amountToSteal}** ${EMOJI_MORA}.`);
                    
                    msg.edit({ embeds: [timeEmbed], components: [] }).catch(()=>{});
                }
            });

            return; 
        }

        let descArray = [
            `✦ انـت تسـطو علـى ممتـلكـات: ${victim} <:thief:1436331309961187488>`,
            `⌕ اخـتـر البـاب الصحـيـح الـذي يحـوي عـلـى ${amountToSteal.toLocaleString()} ${EMOJI_MORA} (من ${poolName})!`,
            `لديـك 15 ثانيـة لاختيـار البـاب الصحيـح :bomb:`
        ];

        if (targetPool === 'bank') {
            descArray.push(`🔒 حماية البنك عالية لذا نسبة نجاح السرقة أقل.`);
        }

        const description = descArray.join('\n');

        const embed = new EmbedBuilder()
            .setTitle('✥ عملـيـة سـطـو ...')
            .setDescription(description)
            .setColor('#8B4513')
            .setImage('https://i.postimg.cc/mkRP0fq6/door.gif');

        const buttons = [
            new ButtonBuilder().setCustomId('rob_1').setLabel('🚪').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('rob_2').setLabel('🚪').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('rob_3').setLabel('🚪').setStyle(ButtonStyle.Secondary)
        ];

        const correctButtonIndex = Math.floor(Math.random() * 3);

        const row = new ActionRowBuilder().addComponents(buttons);
        const msg = await reply({ embeds: [embed], components: [row] });

        const filter = i => i.user.id === robber.id;
        const collector = msg.createMessageComponentCollector({ filter, componentType: ComponentType.Button, time: 15000, max: 1 });

        collector.on('collect', async i => {
            try {
                robberData = await client.getLevel(robber.id, guild.id) || robberData;
                victimData = await client.getLevel(victim.id, guild.id) || victimData;
                
                const clickedIndex = parseInt(i.customId.split('_')[1]) - 1;
                
                if (Number(victimData.hasGuard || victimData.hasguard) > 0) {
                    let isThiefKing = false;
                    try {
                        const settingsRes = await sql.query(`SELECT "roleThief" FROM settings WHERE "guild" = $1`, [guild.id]);
                        const roleThief = settingsRes.rows[0]?.roleThief || settingsRes.rows[0]?.rolethief;
                        if (roleThief && robber.roles.cache.has(roleThief)) {
                            isThiefKing = true;
                        }
                    } catch (e) {}

                    if (isThiefKing) {
                        victimData.hasGuard = (Number(victimData.hasGuard || victimData.hasguard) || 0) - 1; 
                        const guardLeft = victimData.hasGuard;
                        if (guardLeft === 0) victimData.guardExpires = 0;
                        
                        await client.setLevel(victimData);

                        let guardStatusMsg = guardLeft === 0 
                            ? "- انتهى عقـد الحراسـة يسعدنـا ان توقـع عقد حراسـة جديد معنا لحماية ممتلكاتك" 
                            : `- ينتهي عقد الحراسة بعد: ${guardLeft} مرات`;

                        const ghostEmbed = new EmbedBuilder()
                            .setTitle('🥷 مـلـك اللصـوص !')
                            .setColor(Colors.DarkVividPink)
                            .setImage('https://i.postimg.cc/R0d0XSbV/run.gif')
                            .setDescription(`✬ حاولت الدخول ولكن وجدت الحارس الشخصي بانتظارك!\n\nبصفتك **ملك اللصوص**، تمكنت من التمويه والفرار كالشبح قبل أن يمسك بك الحارس!.`);
                        
                        await i.update({ embeds: [ghostEmbed], components: [] }).catch(()=>{});
                        sendDMToVictim(victim, `✥ حـاول ${robber} السـطو عـلى ممتلكـاتك.. تصدى له الحارس، ولكنه هرب كالشبح بفضل لقبه (سيد الظلال) ولم يدفع لك أي غرامة!\n${guardStatusMsg}`);
                    } else {
                        deductFromRobber(robberData, amountToSteal);
                        victimData.mora = String((Number(victimData.mora) || 0) + amountToSteal);
                        
                        victimData.hasGuard = (Number(victimData.hasGuard || victimData.hasguard) || 0) - 1; 
                        const guardLeft = victimData.hasGuard;
                        if (guardLeft === 0) victimData.guardExpires = 0;
                        
                        await client.setLevel(victimData);
                        await client.setLevel(robberData);

                        let guardStatusMsg = guardLeft === 0 
                            ? "- انتهى عقـد الحراسـة يسعدنـا ان توقـع عقد حراسـة جديد معنا لحماية ممتلكاتك" 
                            : `- ينتهي عقد الحراسة بعد: ${guardLeft} مرات`;

                        const guardEmbed = new EmbedBuilder()
                            .setTitle('✶ تــم الـقـبـض :shield: !')
                            .setColor('#46455f')
                            .setImage('https://i.postimg.cc/Hx6tZnJv/nskht-mn-ambratwryt-alanmy.jpg')
                            .setDescription(`✬ دخلت من الباب الخطـا ووجدت الحارس الشخصي بانتظارك! <:catla:1437335118153781360>\n\n✬ تـم القبض عليك وتغريـمك **${amountToSteal.toLocaleString()}** ${EMOJI_MORA} واعطـائـها للضحـية`);
                        
                        await i.update({ embeds: [guardEmbed], components: [] }).catch(()=>{});
                        sendDMToVictim(victim, `✥ حـاول ${robber} السـطو عـلى ممتلـكـاتك ولكـن الحـارس امسك به واخذ **${amountToSteal}** منه واعطاها لك\n${guardStatusMsg}`);
                    }

                } else {
                    if (clickedIndex === correctButtonIndex) {
                        robberData.mora = String((Number(robberData.mora) || 0) + amountToSteal);
                        
                        if (targetPool === 'bank') {
                            if (Number(victimData.bank) >= amountToSteal) {
                                victimData.bank = String(Number(victimData.bank) - amountToSteal);
                            } else {
                                const remainder = amountToSteal - Number(victimData.bank);
                                victimData.bank = '0';
                                victimData.mora = String(Math.max(0, Number(victimData.mora) - remainder));
                            }
                        } else {
                            if (Number(victimData.mora) >= amountToSteal) {
                                victimData.mora = String(Number(victimData.mora) - amountToSteal);
                            } else {
                                const remainder = amountToSteal - Number(victimData.mora);
                                victimData.mora = '0';
                                victimData.bank = String(Math.max(0, Number(victimData.bank) - remainder));
                            }
                        }

                        if (updateGuildStat) {
                            updateGuildStat(client, guild.id, robber.id, 'mora_stolen', amountToSteal).catch(()=>{});
                        }

                        const winEmbed = new EmbedBuilder()
                            .setTitle('✅ حـرامـي مـحـتـرف <:thief:1436331309961187488>')
                            .setColor(Colors.Orange)
                            .setImage('https://i.postimg.cc/QVLQyyDK/rob.gif')
                            .setDescription(`لقد اخترت الباب الصحيح وسرقت **${amountToSteal.toLocaleString()}** ${EMOJI_MORA} من ${victim.displayName}!`);
                        
                        await i.update({ embeds: [winEmbed], components: [] }).catch(()=>{});
                        sendDMToVictim(victim, `✥ قـام ${robber} بالسـطو عـلى ممتلـكـاتك وسـرق **${amountToSteal}**`);

                    } else {
                        deductFromRobber(robberData, amountToSteal);
                        victimData.mora = String((Number(victimData.mora) || 0) + amountToSteal);

                        const loseEmbed = new EmbedBuilder()
                            .setTitle('💥 بــــووم !')
                            .setColor(Colors.Red)
                            .setImage('https://i.postimg.cc/HkdZWrG5/boom.gif')
                            .setDescription(`لقد اخترت الباب الخطأ وانفجرت القنبلة!\n\nفشلت السرقة، وتم تغريمك **${amountToSteal.toLocaleString()}** ${EMOJI_MORA} وإعطاؤها للضحية.`);
                        
                        await i.update({ embeds: [loseEmbed], components: [] }).catch(()=>{});
                        sendDMToVictim(victim, `✥ حـاول ${robber} السـطـو عـلى ممتلكـاتك ولكنـه فـشل وحصـلت علـى **${amountToSteal}** كـ تعويض`);
                    }
                }
                
                await client.setLevel(robberData);
                await client.setLevel(victimData);
            } catch (e) {} finally {
                activeRobberies.delete(robber.id);
            }
        });

        collector.on('end', async (collected, reason) => {
            activeRobberies.delete(robber.id);
            if (reason === 'time' && collected.size === 0) {
                robberData = await client.getLevel(robber.id, guild.id) || robberData;
                victimData = await client.getLevel(victim.id, guild.id) || victimData;

                deductFromRobber(robberData, amountToSteal);
                victimData.mora = String((Number(victimData.mora) || 0) + amountToSteal);
                
                await client.setLevel(robberData);
                await client.setLevel(victimData);

                const timeEmbed = new EmbedBuilder()
                    .setTitle('⏰ انتهى الوقت!')
                    .setColor(Colors.Red)
                    .setImage('https://i.postimg.cc/Hx6tZnJv/nskht-mn-ambratwryt-alanmy.jpg')
                    .setDescription(`لقد ترددت طويلاً وتم القبض عليك!\n\nفشلت السرقة، وتم تغريمك **${amountToSteal.toLocaleString()}** ${EMOJI_MORA} وإعطاؤها للضحية.`);

                msg.edit({ embeds: [timeEmbed], components: [] }).catch(()=>{});
                sendDMToVictim(victim, `✥ حـاول ${robber} السـطـو عـلى ممتلكـاتك ولكنـه فـشل (تأخر في الوقت) وحصـلت علـى **${amountToSteal}** كـ تعويض`);
            }
        });
    }
};
