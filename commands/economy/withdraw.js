const { EmbedBuilder, Colors, SlashCommandBuilder } = require("discord.js");

const EMOJI_MORA = '<:mora:1435647151349698621>';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('سحب')
        .setDescription('سحب المورا من البنك إلى رصيدك (الكاش).')
        .addStringOption(option =>
            option.setName('المبلغ')
            .setDescription('المبلغ الذي تريد سحبه (اتركه فارغاً لسحب الكل)')
            .setRequired(false)), // 🔥 جعلنا الخيار اختيارياً لكي يسحب الكل تلقائياً 🔥

    name: 'withdraw',
    aliases: ['سحب', 'with'],
    category: "Economy",
    cooldown: 3, 
    description: 'سحب المورا من البنك إلى رصيدك الكاش',

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

        // تحديث الكاش فقط لضمان وجود الحساب في الذاكرة
        let data = await client.getLevel(user.id, guildId);
        if (!data) data = { ...client.defaultData, user: user.id, guild: guildId };

        let amountToWithdraw = 0;
        
        // 🔥 التعديل هنا: إذا لم يكتب رقم أو كتب "الكل"، سيسحب الرصيد بالكامل 🔥
        let isAll = false;
        if (!amountArg || ['all', 'الكل'].includes(amountArg.toLowerCase())) {
            isAll = true;
        }

        if (!isAll) {
            amountToWithdraw = parseInt(amountArg.replace(/,/g, ''));
            if (isNaN(amountToWithdraw) || amountToWithdraw <= 0) {
                 return replyError(`❌ الرجاء إدخال مبلغ صحيح أكبر من صفر، أو اترك الأمر فارغاً لسحب الكل.`);
            }
        }

        try {
            let result;
            
            // 🔥 ضربة واحدة (Atomic Query): تحديث وفحص وإرجاع البيانات في أجزاء من الثانية! 🔥
            if (isAll) {
                // سحب الكل
                try {
                    const q1 = `UPDATE levels SET "mora" = "mora" + "bank", "bank" = 0 WHERE "user" = $1 AND "guild" = $2 AND "bank" > 0 RETURNING "bank", "mora"`;
                    result = await db.query(q1, [user.id, guildId]);
                } catch(e) {
                    const q2 = `UPDATE levels SET mora = mora + bank, bank = 0 WHERE userid = $1 AND guildid = $2 AND bank > 0 RETURNING bank, mora`;
                    result = await db.query(q2, [user.id, guildId]);
                }
            } else {
                // سحب مبلغ محدد
                try {
                    const q1 = `UPDATE levels SET "bank" = "bank" - CAST($1 AS BIGINT), "mora" = "mora" + CAST($1 AS BIGINT) WHERE "user" = $2 AND "guild" = $3 AND "bank" >= CAST($1 AS BIGINT) RETURNING "bank", "mora"`;
                    result = await db.query(q1, [String(amountToWithdraw), user.id, guildId]);
                } catch (e) {
                    const q2 = `UPDATE levels SET bank = bank - CAST($1 AS BIGINT), mora = mora + CAST($1 AS BIGINT) WHERE userid = $2 AND guildid = $3 AND bank >= CAST($1 AS BIGINT) RETURNING bank, mora`;
                    result = await db.query(q2, [String(amountToWithdraw), user.id, guildId]);
                }
            }

            if (!result || result.rowCount === 0) {
                return replyError(`❌ فشلت العملية: يبدو أن رصيدك البنكي غير كافٍ أو صفر! <:stop:1436337453098340442>`);
            }

            const finalBank = BigInt(result.rows[0].bank || 0);
            const finalMora = BigInt(result.rows[0].mora || 0);
            
            // 🔥 حساب المبلغ الفعلي الذي تم سحبه بدقة وطباعته بدلاً من كلمة "كل المبلغ" 🔥
            const actualWithdrawn = isAll ? (finalMora - BigInt(data.mora || 0)) : BigInt(amountToWithdraw);

            // تحديث الكاش الداخلي بصمت لمنع الكتابة المؤجلة من إرجاع القيمة القديمة
            data.bank = String(finalBank);
            data.mora = String(finalMora);
            await client.setLevel(data);

            const displayAmount = actualWithdrawn.toLocaleString();

            const embed = new EmbedBuilder()
                .setColor("Random")
                .setTitle('✶ تـمت عمليـة السحـب !')
                .setThumbnail(user.displayAvatarURL())
                .setDescription(
                    `❖ تـم سـحـب: **${displayAmount}** ${EMOJI_MORA}\n` +
                    `❖ رصـيد البـنك: **${finalBank.toLocaleString()}** ${EMOJI_MORA}\n` +
                    `❖ رصـيـدك الكـاش: **${finalMora.toLocaleString()}** ${EMOJI_MORA}`
                );

            await reply({ embeds: [embed] });

        } catch (error) {
            console.error("Withdraw Error:", error);
            return replyError("حدث خطأ داخلي أثناء السحب.");
        }
    }
};
