const { EmbedBuilder, Colors, SlashCommandBuilder } = require("discord.js");

const EMOJI_MORA = '<:mora:1435647151349698621>';
const COOLDOWN_MS = 1 * 60 * 1000; // 1 دقيقة

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ايداع')
        .setDescription('إيداع المورا من الكاش إلى البنك.')
        .addStringOption(option =>
            option.setName('المبلغ')
            .setDescription('المبلغ الذي تريد إيداعه (اتركه فارغاً لإيداع الكل)')
            .setRequired(false)), // 🔥 جعلنا الخيار اختيارياً لكي يقبل الأمر بدون رقم 🔥

    name: 'deposit',
    aliases: ['ايداع', 'dep'],
    category: "Economy",
    cooldown: 3, 
    description: 'إيداع المورا من الكاش إلى البنك',

    async execute(interactionOrMessage, args) {

        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, guild, client, user;
        let amountArg;

        if (isSlash) {
            interaction = interactionOrMessage;
            guild = interaction.guild;
            client = interaction.client;
            user = interaction.user;
            amountArg = interaction.options.getString('المبلغ');
            await interaction.deferReply(); 
        } else {
            message = interactionOrMessage;
            guild = message.guild;
            client = message.client;
            user = message.author;
            amountArg = args[0];
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

        const guildId = guild.id;
        const db = client.sql; 

        // جلب البيانات الأساسية لفحص الكولداون والمبلغ المتاح
        let data = await client.getLevel(user.id, guildId);
        if (!data) data = { ...client.defaultData, user: user.id, guild: guildId };

        const now = Date.now();
        const lastDeposit = Number(data.lastDeposit || data.lastdeposit) || 0;
        const timeLeft = lastDeposit + COOLDOWN_MS - now;

        if (timeLeft > 0) {
            const seconds = Math.floor((timeLeft % 60000) / 1000);
            return replyError(`🕐 يمكنك الإيداع مرة واحدة كل دقيقة. يرجى الانتظار **${seconds} ثانية**.`);
        }

        let amountToDeposit = 0;
        
        // 🔥 التعديل هنا: إذا لم يدخل رقم، أو كتب "all" أو "الكل"، سيعتبره إيداع كامل 🔥
        let isAll = false;
        if (!amountArg || ['all', 'الكل'].includes(amountArg.toLowerCase())) {
            isAll = true;
        }

        if (!isAll) {
            amountToDeposit = parseInt(amountArg.replace(/,/g, ''));
            if (isNaN(amountToDeposit) || amountToDeposit <= 0) {
                 return replyError(`❌ الرجاء إدخال مبلغ صحيح أكبر من صفر، أو اترك الأمر فارغاً لإيداع الكل.`);
            }
        }

        try {
            let result;
            
            // 🔥 ضربة واحدة (Atomic Query): تحديث سريع وآمن 🔥
            if (isAll) {
                try {
                    const q1 = `UPDATE levels SET "bank" = "bank" + "mora", "mora" = 0, "lastDeposit" = $3 WHERE "user" = $1 AND "guild" = $2 AND "mora" > 0 RETURNING "bank", "mora"`;
                    result = await db.query(q1, [user.id, guildId, now]);
                } catch(e) {
                    const q2 = `UPDATE levels SET bank = bank + mora, mora = 0, lastdeposit = $3 WHERE userid = $1 AND guildid = $2 AND mora > 0 RETURNING bank, mora`;
                    result = await db.query(q2, [user.id, guildId, now]);
                }
            } else {
                try {
                    const q1 = `UPDATE levels SET "mora" = "mora" - CAST($1 AS BIGINT), "bank" = "bank" + CAST($1 AS BIGINT), "lastDeposit" = $4 WHERE "user" = $2 AND "guild" = $3 AND "mora" >= CAST($1 AS BIGINT) RETURNING "bank", "mora"`;
                    result = await db.query(q1, [String(amountToDeposit), user.id, guildId, now]);
                } catch (e) {
                    const q2 = `UPDATE levels SET mora = mora - CAST($1 AS BIGINT), bank = bank + CAST($1 AS BIGINT), lastdeposit = $4 WHERE userid = $2 AND guildid = $3 AND mora >= CAST($1 AS BIGINT) RETURNING bank, mora`;
                    result = await db.query(q2, [String(amountToDeposit), user.id, guildId, now]);
                }
            }

            if (!result || result.rowCount === 0) {
                return replyError(`❌ فشلت العملية: يبدو أن رصيدك الكاش غير كافٍ أو صفر! <:stop:1436337453098340442>`);
            }

            const finalBank = BigInt(result.rows[0].bank || 0);
            const finalMora = BigInt(result.rows[0].mora || 0);
            
            // 🔥 حساب المبلغ الفعلي الذي تم إيداعه بدقة وطباعته بالأرقام 🔥
            const actualDeposited = isAll ? (finalBank - BigInt(data.bank || 0)) : BigInt(amountToDeposit);

            // تحديث الكاش الداخلي بصمت لمنع الكتابة المؤجلة من إرجاع القيمة القديمة
            data.bank = String(finalBank);
            data.mora = String(finalMora);
            data.lastDeposit = now;
            await client.setLevel(data);

            const interestAmount = Math.floor(Number(finalBank) * 0.0005);
            const displayAmount = actualDeposited.toLocaleString(); // طباعة المبلغ الفعلي كرقم

            const embed = new EmbedBuilder()
                .setColor("Random")
                .setTitle('✶ تـم الايداع !')
                .setThumbnail(user.displayAvatarURL())
                .setDescription(
                    `❖ تـم ايـداع: **${displayAmount}** ${EMOJI_MORA}\n` +
                    `❖ رصـيد البـنك: **${finalBank.toLocaleString()}** ${EMOJI_MORA}\n` +
                    `❖ رصـيـدك الكـاش: **${finalMora.toLocaleString()}** ${EMOJI_MORA}\n\n` +
                    `◇ ستحصل على فائدة يومية 0.05% : **${interestAmount.toLocaleString()}** ${EMOJI_MORA}\n` +
                    `◇ وسنحمي اموالك بنسبة اكبر من السرقـة`
                );

            await reply({ embeds: [embed] });

        } catch (error) {
            console.error("Deposit Error:", error);
            return replyError("حدث خطأ داخلي أثناء الإيداع.");
        }
    }
};
