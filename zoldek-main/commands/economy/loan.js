const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Colors, SlashCommandBuilder, MessageFlags } = require("discord.js");
const EMOJI_MORA = '<:mora:1435647151349698621>';

const LOANS = [
    { id: 'loan_5000', label: 'قرض 5,000', amount: 5000, requiredLevel: 5, totalToRepay: 5500, dailyPayment: 184, isElite: false },
    { id: 'loan_15000', label: 'قرض 15,000', amount: 15000, requiredLevel: 20, totalToRepay: 16500, dailyPayment: 550, isElite: false },
    { id: 'loan_30000', label: 'قرض 30,000', amount: 30000, requiredLevel: 30, totalToRepay: 33000, dailyPayment: 1100, isElite: false },
    // 🔥 قروض النخبة الجديدة 🔥 (السداد على 40 يوم بدلاً من 30)
    { id: 'loan_50000', label: 'قرض 50,000', amount: 50000, requiredLevel: 40, totalToRepay: 55000, dailyPayment: 1375, isElite: true, eliteLevel: 'A' },
    { id: 'loan_80000', label: 'قرض 80,000', amount: 80000, requiredLevel: 50, totalToRepay: 88000, dailyPayment: 2200, isElite: true, eliteLevel: 'S' }
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('قرض')
        .setDescription('الحصول على قرض من البنك.'),

    name: 'loan',
    aliases: ['قرض'],
    category: "Economy",
    description: 'الحصول على قرض من البنك.',

    async execute(interactionOrMessage, args) {

        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, client, sql, user, member, guild;

        try {
            if (isSlash) {
                interaction = interactionOrMessage;
                client = interaction.client;
                sql = client.sql;
                user = interaction.user;
                member = interaction.member;
                guild = interaction.guild;
                await interaction.deferReply();
            } else {
                message = interactionOrMessage;
                client = message.client;
                sql = client.sql;
                user = message.author;
                member = message.member;
                guild = message.guild;
            }

            const sendReply = async (payload) => {
                if (isSlash) {
                    return interaction.editReply(payload);
                } else {
                    return message.reply(payload);
                }
            };

            const sendError = async (content) => {
                const payload = { content, flags: [MessageFlags.Ephemeral] };
                if (isSlash) {
                    return interaction.editReply(payload);
                } else {
                    return message.reply(payload);
                }
            };

            // 🔥 الحماية المزدوجة (Fallback) لفحص وجود قرض سابق 🔥
            let existingLoan;
            try {
                const getLoanRes = await sql.query(`SELECT * FROM user_loans WHERE "userID" = $1 AND "guildID" = $2 AND "remainingAmount" > 0`, [user.id, guild.id]);
                existingLoan = getLoanRes.rows[0];
            } catch (e) {
                const getLoanRes = await sql.query(`SELECT * FROM user_loans WHERE userid = $1 AND guildid = $2 AND remainingamount > 0`, [user.id, guild.id]).catch(()=>({rows:[]}));
                existingLoan = getLoanRes.rows[0];
            }

            if (existingLoan) {
                return sendError(`❌ لديك قرض سابق لم تقم بسداده. المبلغ المتبقي: **${Number(existingLoan.remainingAmount || existingLoan.remainingamount).toLocaleString()}** ${EMOJI_MORA}.`);
            }

            // 🔥 فحص رتبة السمعة لتحديد القروض المتاحة 🔥
            let userRepPoints = 0;
            try {
                let repRes;
                try { repRes = await sql.query(`SELECT "rep_points" FROM user_reputation WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guild.id]); }
                catch(e) { repRes = await sql.query(`SELECT rep_points FROM user_reputation WHERE userid = $1 AND guildid = $2`, [user.id, guild.id]).catch(()=>({rows:[]})); }
                if (repRes.rows.length > 0) userRepPoints = Number(repRes.rows[0].rep_points) || 0;
            } catch(e) {}

            const isRankA = userRepPoints >= 250; // رتبة A وما فوق
            const isRankS = userRepPoints >= 500; // رتبة S وما فوق

            const hasRoleA = member.roles.cache.has('1395674235002945636'); // رول مخصص للـ 50 الف
            const hasRoleS = member.roles.cache.has('1422160802416164885'); // رول مخصص للكل 50 و 80 الف

            const canSeeLoan50k = isRankA || hasRoleA || hasRoleS;
            const canSeeLoan80k = isRankS || hasRoleS;

            const mainEmbed = new EmbedBuilder()
                .setTitle('بنـك الامـبراطـوريـة')
                .setDescription(
                    `✬ اهـلا بك بقسم القـروض اختر القرض الذي يناسبك <a:6aMoney:1439572832219693116>\n` +
                    `✬ جمـيع القـروض بفائـدة 10% وتسداد بشكل آلي على مدار 30 يـوم ان لم تكن من النخبة\n\n` +
                    `✦ تـأكد من مراجعـة عـقد القرض قبـل توقيعـه <:stop:1436337453098340442>`
                )
                .setColor(Colors.Gold)
                .setImage('https://i.postimg.cc/GmQN2JWF/bank.gif'); 

            const rows = [];
            let currentRow = new ActionRowBuilder();
            let buttonCount = 0;

            LOANS.forEach(loan => {
                let canShow = true;
                if (loan.id === 'loan_50000' && !canSeeLoan50k) canShow = false;
                if (loan.id === 'loan_80000' && !canSeeLoan80k) canShow = false;

                if (canShow) {
                    if (buttonCount >= 5) {
                        rows.push(currentRow);
                        currentRow = new ActionRowBuilder();
                        buttonCount = 0;
                    }
                    currentRow.addComponents(
                        new ButtonBuilder()
                            .setCustomId(loan.id)
                            .setLabel(loan.label)
                            .setStyle(loan.isElite ? ButtonStyle.Danger : ButtonStyle.Primary) // قروض النخبة بلون مختلف
                            .setEmoji(EMOJI_MORA)
                    );
                    buttonCount++;
                }
            });
            if (buttonCount > 0) rows.push(currentRow);

            const msg = await sendReply({ embeds: [mainEmbed], components: rows, fetchReply: true });

            const filter = (i) => i.user.id === user.id;
            const collector = msg.createMessageComponentCollector({ filter, time: 180000 });

            collector.on('collect', async i => {
                try {
                    if (i.customId === 'cancel_loan') {
                        return i.update({ embeds: [mainEmbed], components: rows });
                    }

                    let data = await client.getLevel(user.id, guild.id);
                    if (!data) data = { ...client.defaultData, user: user.id, guild: guild.id };

                    if (i.customId.startsWith('loan_')) {
                        const selectedLoan = LOANS.find(l => l.id === i.customId);
                        if (!selectedLoan) return;

                        if (Number(data.level) < selectedLoan.requiredLevel) {
                            return i.reply({
                                content: `❌ لا يمكنك أخذ هذا القرض. يتطلب لفل **${selectedLoan.requiredLevel}** وأنت لفل **${data.level}**.`,
                                flags: [MessageFlags.Ephemeral]
                            });
                        }

                        const payDays = selectedLoan.isElite ? 40 : 30;

                        const confirmationEmbed = new EmbedBuilder()
                            .setTitle(`⚠️ عـقـد الـقـرض: ${selectedLoan.label}`)
                            .setColor(Colors.Red)
                            .setDescription(
                                `✶ مبلـغ القرض: **${selectedLoan.amount.toLocaleString()}** ${EMOJI_MORA}\n` +
                                `✦ قيمـة السداد الكاملة على ${payDays} يوم: **${selectedLoan.totalToRepay.toLocaleString()}** ${EMOJI_MORA}\n` +
                                `✬ مبـلغ القسـط اليومي: **${selectedLoan.dailyPayment.toLocaleString()}** ${EMOJI_MORA}\n\n` +
                                `✶ هـل انـت موافـق علـى توقيـع عقد القرض<:mirkk:1435648219488190525>؟\n\n` +
                                `> **✦ عواقب التخلف عن السداد <:araara:1436297148894412862>:**\n` +
                                `✬ خصم نقاط الخبرة\n` +
                                `✬ الحرمان من استعمال المتجر\n` +
                                `✬ عقوبة 5% على مكاسب الخبرة والمورا\n` +
                                `✬ ان كان لديك اي اصول او ممتلكات بالمزرعة ستصادر لسداد قرضك`
                            );

                        const confirmationRow = new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId(`confirm_${selectedLoan.id}`)
                                .setLabel('✅ تـوقـيع العـقد')
                                .setStyle(ButtonStyle.Success),
                            new ButtonBuilder()
                                .setCustomId('cancel_loan')
                                .setLabel('❌ رفـض القـرض')
                                .setStyle(ButtonStyle.Secondary)
                        );

                        return i.update({ embeds: [confirmationEmbed], components: [confirmationRow] });
                    }

                    if (i.customId.startsWith('confirm_loan_')) {
                        const loanId = i.customId.replace('confirm_', '');
                        const selectedLoan = LOANS.find(l => l.id === loanId);
                        if (!selectedLoan) return;

                        if (Number(data.level) < selectedLoan.requiredLevel) {
                             return i.update({
                                content: `❌ لا يمكنك أخذ هذا القرض. يتطلب لفل **${selectedLoan.requiredLevel}** وأنت لفل **${data.level}**.`,
                                embeds: [], components: []
                            });
                        }

                        // 🔥 الحماية المزدوجة قبل التنفيذ 🔥
                        let existingLoanCheck;
                        try {
                            const checkRes = await sql.query(`SELECT * FROM user_loans WHERE "userID" = $1 AND "guildID" = $2 AND "remainingAmount" > 0`, [user.id, guild.id]);
                            existingLoanCheck = checkRes.rows[0];
                        } catch (e) {
                            const checkRes = await sql.query(`SELECT * FROM user_loans WHERE userid = $1 AND guildid = $2 AND remainingamount > 0`, [user.id, guild.id]).catch(()=>({rows:[]}));
                            existingLoanCheck = checkRes.rows[0];
                        }
                        
                        if (existingLoanCheck) {
                             return i.update({
                                content: `❌ لديك قرض سابق لم تقم بسداده.`,
                                embeds: [], components: []
                            });
                        }

                        // 🔥 التعديل الجوهري: إضافة الفلوس لقاعدة البيانات فعلياً وحفظ القرض 🔥
                        try {
                            await sql.query("BEGIN");
                            
                            // 1. إضافة الفلوس للرصيد في قاعدة البيانات (هذا ما كان ينقص الكود)
                            try {
                                await sql.query(`UPDATE levels SET "mora" = CAST(COALESCE("mora", '0') AS BIGINT) + $1 WHERE "user" = $2 AND "guild" = $3`, [selectedLoan.amount, user.id, guild.id]);
                            } catch(e) {
                                await sql.query(`UPDATE levels SET mora = CAST(COALESCE(mora, '0') AS BIGINT) + $1 WHERE userid = $2 AND guildid = $3`, [selectedLoan.amount, user.id, guild.id]).catch(()=>{});
                            }

                            // 2. تحديث الكاش (الذاكرة المؤقتة)
                            data.mora = String(BigInt(data.mora || 0) + BigInt(selectedLoan.amount));
                            await client.setLevel(data);

                            // 3. تسجيل القرض
                            try {
                                await sql.query(`
                                    INSERT INTO user_loans ("userID", "guildID", "loanAmount", "remainingAmount", "dailyPayment", "lastPaymentDate", "missedPayments") 
                                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                                `, [user.id, guild.id, selectedLoan.amount, selectedLoan.totalToRepay, selectedLoan.dailyPayment, Date.now(), 0]);
                            } catch (e) {
                                await sql.query(`
                                    INSERT INTO user_loans (userid, guildid, loanamount, remainingamount, dailypayment, lastpaymentdate, missedpayments) 
                                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                                `, [user.id, guild.id, selectedLoan.amount, selectedLoan.totalToRepay, selectedLoan.dailyPayment, Date.now(), 0]);
                            }

                            await sql.query("COMMIT");

                            const disabledRows = [];
                            if (i.message.components && Array.isArray(i.message.components)) {
                                i.message.components.forEach(row => {
                                    const newRow = new ActionRowBuilder();
                                    row.components.forEach(component => {
                                        newRow.addComponents(
                                            ButtonBuilder.from(component).setDisabled(true)
                                        );
                                    });
                                    disabledRows.push(newRow);
                                });
                            }
                            await i.update({ components: disabledRows });

                            const payDaysStr = selectedLoan.isElite ? '40' : '30';
                            await i.followUp({
                                content: `✅ تم استلام قرض بقيمة **${selectedLoan.amount.toLocaleString()}** ${EMOJI_MORA}.\nسيتم خصم **${selectedLoan.dailyPayment}** يومياً لمدة ${payDaysStr} يوما.`
                            });

                            collector.stop();

                        } catch (txError) {
                            await sql.query("ROLLBACK").catch(()=>{});
                            // التراجع عن الفلوس التي أضيفت في الذاكرة لتجنب التعارض
                            let newMora = BigInt(data.mora || 0) - BigInt(selectedLoan.amount);
                            data.mora = newMora > 0n ? String(newMora) : "0";
                            await client.setLevel(data);
                            
                            console.error("Loan Transaction Error:", txError);
                            return i.followUp({ 
                                content: `❌ حدث خطأ في قاعدة البيانات ولم يتم منح القرض. لم يتم خصم أو إضافة أي شيء.`, 
                                flags: [MessageFlags.Ephemeral] 
                            });
                        }
                    }
                } catch (collectorError) {
                    console.error("خطأ في الكوليكتور الخاص بالقرض:", collectorError);
                    try {
                        await i.followUp({ content: 'حدث خطأ أثناء معالجة طلبك.', flags: [MessageFlags.Ephemeral] });
                    } catch (e) {}
                }
            });

            collector.on('end', (collected, reason) => {
                if (reason !== 'collect') {
                    const disabledRows = [];
                    if (msg.components && Array.isArray(msg.components)) {
                        msg.components.forEach(row => {
                            const newRow = new ActionRowBuilder();
                            row.components.forEach(component => {
                                newRow.addComponents(ButtonBuilder.from(component).setDisabled(true));
                            });
                            disabledRows.push(newRow);
                        });
                    }
                    msg.edit({ components: disabledRows }).catch(() => {});
                }
            });

        } catch (error) {
            console.error("خطأ في أمر القرض (loan):", error);
            const errorPayload = { content: "حدث خطأ أثناء محاولة عرض قائمة القروض.", flags: [MessageFlags.Ephemeral] };
            if (isSlash) {
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply(errorPayload);
                } else {
                    await interaction.reply(errorPayload);
                }
            } else {
                message.reply(errorPayload.content);
            }
        }
    }
};
