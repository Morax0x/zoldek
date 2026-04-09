const { EmbedBuilder, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags, Colors } = require("discord.js");

let updateGuildStat;
try {
    ({ updateGuildStat } = require('../../handlers/guild-board-handler.js'));
} catch (e) {}

const COOLDOWN_MS = 5 * 60 * 1000; 
const EMOJI_MORA = '<:mora:1435647151349698621>';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('تحويل')
        .setDescription('تحول مورا إلى عضو آخر (أول تحويل يومياً مجاني، ثم تُطبق الضريبة حسب رتبتك).')
        .addUserOption(option =>
            option.setName('المستلم')
            .setDescription('العضو الذي تريد التحويل له')
            .setRequired(true))
        .addIntegerOption(option =>
            option.setName('المبلغ')
            .setDescription('المبلغ الذي تريد تحويله')
            .setRequired(true)
            .setMinValue(1)),

    name: 'transfer',
    aliases: ['تحويل', 'c'],
    category: "Economy",
    description: 'تحول مورا إلى عضو آخر لحظياً.',

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, guild, client, sender, db, senderMember;
        let receiver, amount;

        try {
            if (isSlash) {
                interaction = interactionOrMessage;
                guild = interaction.guild;
                client = interaction.client;
                db = client.sql; 
                sender = interaction.user;
                senderMember = interaction.member;
                receiver = interaction.options.getMember('المستلم');
                amount = interaction.options.getInteger('المبلغ');
                await interaction.deferReply();
            } else {
                message = interactionOrMessage;
                guild = message.guild;
                client = message.client;
                db = client.sql; 
                sender = message.author;
                senderMember = message.member;
                receiver = message.mentions.members.first();
                amount = parseInt(args[1]);
            }

            const replyError = async (content) => {
                if (isSlash) {
                    if (interaction.replied || interaction.deferred) {
                        return interaction.editReply({ content, embeds: [], components: [] }).catch(e => console.error("Edit Reply Error:", e));
                    }
                    return interaction.reply({ content, flags: [MessageFlags.Ephemeral] }).catch(e => console.error("Reply Error:", e));
                } else {
                    return message.reply({ content }).catch(e => console.error("Message Reply Error:", e));
                }
            };

            if (!client.activePlayers) client.activePlayers = new Set();

            if (client.activePlayers.has(sender.id)) {
                return replyError("🚫 **لا يمكنك التحويل الآن!** أنت مشغول في عملية أو تأكيد آخر، الرجاء الانتظار.");
            }

            if (!receiver || isNaN(amount) || amount <= 0 || !Number.isInteger(amount)) {
                return replyError(`طريقة التحويل الصحيحة:\n- \`تحويل <@user> <المبلغ>\``);
            }
            if (amount > 1000000000000) {
                return replyError("❌ **المبلغ كبير جداً!** لا يمكن تحويل هذا الرقم الفلكي دفعة واحدة.");
            }

            if (receiver.id === sender.id) return replyError("❌ لا يمكنك التحويل لنفسك!");
            if (receiver.user?.bot) return replyError("❌ لا يمكنك التحويل للبوتات!");

            try {
                await db.query(`ALTER TABLE levels ADD COLUMN IF NOT EXISTS "lastTransferDate" TEXT DEFAULT ''`);
                await db.query(`ALTER TABLE levels ADD COLUMN IF NOT EXISTS "dailyTransferCount" BIGINT DEFAULT 0`);
            } catch (e) {
                console.error("DB Alter Error:", e);
            }

            let senderData = await client.getLevel(sender.id, guild.id);
            if (!senderData) senderData = { ...client.defaultData, user: sender.id, guild: guild.id, mora: 0, bank: 0 };

            try {
                let loanRes;
                try { loanRes = await db.query(`SELECT "remainingAmount" FROM user_loans WHERE "userID" = $1 AND "guildID" = $2`, [sender.id, guild.id]); } 
                catch (e) { loanRes = await db.query(`SELECT remainingamount FROM user_loans WHERE userid = $1 AND guildid = $2`, [sender.id, guild.id]).catch(()=>({rows:[]})); }
                
                const loanData = loanRes?.rows[0];
                if (loanData && Number(loanData.remainingAmount || loanData.remainingamount) > 0) {
                    return replyError(`❌ **عذراً!** لا يمكنك التحويل وعليك قرض بقيمة **${Number(loanData.remainingAmount || loanData.remainingamount).toLocaleString()}** مورا.`);
                }
            } catch (e) { console.error("Loan Check Error:", e); }

            const now = Date.now();
            const timeLeft = (Number(senderData.lastTransfer || senderData.lasttransfer) || 0) + COOLDOWN_MS - now;
            if (timeLeft > 0) {
                const minutes = Math.floor(timeLeft / 60000);
                const seconds = Math.floor((timeLeft % 60000) / 1000);
                return replyError(`🕐 يرجى الانتظار **${minutes} دقيقة و ${seconds} ثانية** لعمل تحويل جديد.`);
            }

            let pMora = Number(senderData.mora) || 0;
            let pBank = Number(senderData.bank) || 0;

            if (pMora + pBank < amount) {
                return replyError(`❌ ليس لديك مورا كافية! (رصيدك الإجمالي بالكاش والبنك: **${(pMora + pBank).toLocaleString()}** فقط)`);
            }

            let senderRepPoints = 0;
            try {
                let repRes;
                try { repRes = await db.query(`SELECT "rep_points" FROM user_reputation WHERE "userID" = $1 AND "guildID" = $2`, [sender.id, guild.id]); }
                catch(e) { repRes = await db.query(`SELECT rep_points FROM user_reputation WHERE userid = $1 AND guildid = $2`, [sender.id, guild.id]).catch(()=>({rows:[]})); }
                if (repRes.rows.length > 0) senderRepPoints = Number(repRes.rows[0].rep_points) || 0;
            } catch(e) { console.error("Rep Check Error:", e); }

            let dynamicTaxRate = 0.06; // E وتحت
            let rankName = 'E فما دون';
            if (senderRepPoints >= 1000) { dynamicTaxRate = 0.01; rankName = 'SS'; }
            else if (senderRepPoints >= 500) { dynamicTaxRate = 0.01; rankName = 'S'; }
            else if (senderRepPoints >= 250) { dynamicTaxRate = 0.02; rankName = 'A'; }
            else if (senderRepPoints >= 100) { dynamicTaxRate = 0.03; rankName = 'B'; }
            else if (senderRepPoints >= 50) { dynamicTaxRate = 0.04; rankName = 'C'; }
            else if (senderRepPoints >= 25) { dynamicTaxRate = 0.05; rankName = 'D'; }

            let isPhilanthropistKing = false;
            try {
                let settingsRes;
                try { settingsRes = await db.query(`SELECT "rolePhilanthropist" FROM settings WHERE "guild" = $1`, [guild.id]); } 
                catch (e) { settingsRes = await db.query(`SELECT rolephilanthropist FROM settings WHERE guild = $1`, [guild.id]).catch(()=>({rows:[]})); }
                const settings = settingsRes?.rows[0];
                const roleId = settings?.rolephilanthropist || settings?.rolePhilanthropist;
                if (roleId && senderMember.roles.cache.has(roleId)) isPhilanthropistKing = true;
            } catch(e) { console.error("Philanthropist Check Error:", e); }

            const saudiDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date());
            let tempDailyCount = Number(senderData.dailyTransferCount || senderData.dailytransfercount) || 0;
            if (senderData.lastTransferDate !== saudiDate && senderData.lasttransferdate !== saudiDate) tempDailyCount = 0;
            
            let displayTaxRate = (tempDailyCount === 0 || isPhilanthropistKing) ? 0 : dynamicTaxRate;
            const displayTaxAmount = Math.floor(amount * displayTaxRate);
            const displayAmountReceived = amount - displayTaxAmount;

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('confirm_transfer').setLabel('تأكـيد').setStyle(ButtonStyle.Success).setEmoji('💸'),
                new ButtonBuilder().setCustomId('cancel_transfer').setLabel('إلغـاء').setStyle(ButtonStyle.Danger)
            );

            let footerText = `💡 الضريبة: ${Math.round(displayTaxRate * 100)}% - بناءً على رتبتك: ${rankName} `;
            if (isPhilanthropistKing) {
                footerText = "👑 إعفاء ملك الكرم: تحويل مجاني بلا رسوم!";
            } else if (tempDailyCount === 0) {
                footerText = "💡 هذا هو تحويلك اليومي المجاني الأول! الضريبة: 0%";
            }

            const receiverName = receiver.user ? receiver.user.username : receiver.displayName;

            const confirmEmbed = new EmbedBuilder()
                .setColor(Colors.Orange)
                .setTitle('⏳ تأكيد التحويل')
                .setDescription(`هل أنت متأكد من تحويل **${amount.toLocaleString()}** ${EMOJI_MORA} إلى <@${receiver.id}>؟\n\n` +
                                `الرسوم الضريبية: **${displayTaxAmount.toLocaleString()}** ${EMOJI_MORA}\n` +
                                `المبلغ الصافي المستلم: **${displayAmountReceived.toLocaleString()}** ${EMOJI_MORA}`)
                .setFooter({ text: footerText });

            let confirmMsg;
            if (isSlash) {
                confirmMsg = await interaction.editReply({ content: `<@${sender.id}>`, embeds: [confirmEmbed], components: [row], fetchReply: true });
            } else {
                confirmMsg = await message.channel.send({ content: `<@${sender.id}>`, embeds: [confirmEmbed], components: [row] });
            }

            client.activePlayers.add(sender.id);

            const collector = confirmMsg.createMessageComponentCollector({
                filter: i => i.user.id === sender.id,
                time: 30000,
                max: 1,
                componentType: ComponentType.Button
            });

            collector.on('collect', async i => {
                await i.deferUpdate().catch(e => console.error("Defer Update Error:", e));

                row.components.forEach(c => c.setDisabled(true));
                await confirmMsg.edit({ components: [row] }).catch(e => console.error("Edit Buttons Error:", e));

                if (i.customId === 'cancel_transfer') {
                    client.activePlayers.delete(sender.id);
                    return confirmMsg.edit({ content: `🚫 **تم إلغاء عملية التحويل.**`, embeds: [], components: [] }).catch(()=>{});
                }

                senderData = await client.getLevel(sender.id, guild.id);
                if (!senderData) senderData = { user: sender.id, guild: guild.id, mora: 0, bank: 0 };
                
                let currentMora = Number(senderData.mora) || 0;
                let currentBank = Number(senderData.bank) || 0;

                if (currentMora + currentBank < amount) {
                    client.activePlayers.delete(sender.id);
                    return confirmMsg.edit({ content: `❌ فشل التحويل! لا تملك مورا كافية وقت التأكيد.`, embeds: [], components: [] }).catch(()=>{});
                }

                const originalMora = currentMora;
                const originalBank = currentBank;

                if (currentMora >= amount) {
                    currentMora -= amount;
                } else {
                    const remainingToPay = amount - currentMora;
                    currentMora = 0; 
                    currentBank -= remainingToPay;
                }

                try {
                    await db.query('BEGIN');

                    senderData.mora = String(currentMora);
                    senderData.bank = String(currentBank);
                    senderData.dailyTransferCount = tempDailyCount + 1;
                    senderData.lastTransferDate = saudiDate;
                    senderData.lastTransfer = Date.now();

                    try {
                        await db.query(`UPDATE levels SET "mora" = $1, "bank" = $2, "dailyTransferCount" = $3, "lastTransferDate" = $4, "lastTransfer" = $5 WHERE "user" = $6 AND "guild" = $7`, 
                            [currentMora, currentBank, senderData.dailyTransferCount, saudiDate, senderData.lastTransfer, sender.id, guild.id]);
                    } catch(e) {
                        await db.query(`UPDATE levels SET mora = $1, bank = $2, dailytransfercount = $3, lasttransferdate = $4, lasttransfer = $5 WHERE userid = $6 AND guildid = $7`, 
                            [currentMora, currentBank, senderData.dailyTransferCount, saudiDate, senderData.lastTransfer, sender.id, guild.id]).catch(()=>{});
                    }
                    
                    if (client.setLevel) await client.setLevel(senderData);

                    // ✅ إضافة نسبية آمنة + RETURNING لتحديث الكاش بالقيمة الفعلية من DB
                    let receiverData = await client.getLevel(receiver.id, guild.id);
                    if (!receiverData) receiverData = { ...client.defaultData, user: receiver.id, guild: guild.id, mora: 0 };

                    let rMoraRes;
                    try {
                        rMoraRes = await db.query(`UPDATE levels SET "mora" = "mora" + $1 WHERE "user" = $2 AND "guild" = $3 RETURNING "mora"`, [displayAmountReceived, receiver.id, guild.id]);
                    } catch(e) {
                        rMoraRes = await db.query(`UPDATE levels SET mora = mora + $1 WHERE userid = $2 AND guildid = $3 RETURNING mora`, [displayAmountReceived, receiver.id, guild.id]).catch(()=>({rows:[]}));
                    }
                    if (rMoraRes?.rows[0]) {
                        receiverData.mora = String(rMoraRes.rows[0].mora);
                    } else {
                        receiverData.mora = String((Number(receiverData.mora) || 0) + displayAmountReceived);
                    }
                    if (client.setLevel) await client.setLevel(receiverData);

                    await db.query('COMMIT'); 
                } catch (e) {
                    console.error("Transfer Transaction Error:", e);
                    await db.query('ROLLBACK').catch(()=>{}); 
                    senderData.mora = String(originalMora);
                    senderData.bank = String(originalBank);
                    if (client.setLevel) await client.setLevel(senderData);
                    client.activePlayers.delete(sender.id);
                    return confirmMsg.edit({ content: "❌ **فشلت العملية:** حدث خطأ تقني أثناء التحويل وتم استرجاع أموالك.", embeds: [], components: [] }).catch(()=>{});
                }

                client.activePlayers.delete(sender.id);

                if (updateGuildStat) {
                    updateGuildStat(client, guild.id, sender.id, 'mora_donated', amount);
                }

                const successEmbed = new EmbedBuilder()
                    .setColor(Colors.Green)
                    .setTitle('✅ تـم التـحويـل بنجـاح')
                    .setDescription([
                        `**المرسل:** ${sender.username}`,
                        `**المستلم:** ${receiverName}`,
                        `\n**المبلغ المُرسل:** ${amount.toLocaleString()} ${EMOJI_MORA}`,
                        `**الضريبة (${Math.round(displayTaxRate * 100)}%):** ${displayTaxAmount.toLocaleString()} ${EMOJI_MORA}`,
                        `**المبلغ المستلم:** ${displayAmountReceived.toLocaleString()} ${EMOJI_MORA}`
                    ].join('\n'))
                    .setFooter({ text: footerText })
                    .setImage('https://i.postimg.cc/vHhJTgyx/download-3.jpg')
                    .setTimestamp();

                await confirmMsg.edit({ content: `<@${receiver.id}>`, embeds: [successEmbed], components: [] }).catch(e => console.error("Edit Success Msg Error:", e));
            });

            collector.on('end', collected => {
                if (collected.size === 0) {
                    client.activePlayers.delete(sender.id);
                    confirmMsg.edit({ content: `⏳ **انتهى الوقت.** تم إلغاء عملية التحويل.`, embeds: [], components: [] }).catch(()=>{});
                }
            });

        } catch (error) {
            console.error("Top Level Transfer Error:", error);
            if (sender) client.activePlayers.delete(sender.id);
            replyError("❌ حدث خطأ غير متوقع، تم إلغاء العملية.").catch(()=>{});
        }
    }
};
