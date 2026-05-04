const { EmbedBuilder, SlashCommandBuilder } = require("discord.js");

let logTransaction;
try {
    ({ logTransaction } = require('../../handlers/economy-logger.js'));
} catch (e) {
    logTransaction = async () => {}; 
}

const ALLOWED_IDS = ["1145327691772481577", "288421280368295947"];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('موراا') 
        .setDescription('يضيف، يزيل، أو يحدد رصيد المورا لمستخدم معين (حتى للمغادرين).')
        .addSubcommand(subcommand =>
            subcommand
                .setName('اضافة')
                .setDescription('إضافة مورا إلى رصيد مستخدم')
                .addUserOption(option => option.setName('المستخدم').setDescription('المستخدم (منشن أو آيدي)').setRequired(true))
                .addIntegerOption(option => option.setName('المبلغ').setDescription('المبلغ الذي تريد إضافته').setRequired(true).setMinValue(1))
                .addStringOption(option => 
                    option.setName('المكان')
                        .setDescription('أين تريد إضافة المبلغ؟ (الافتراضي: كاش)')
                        .addChoices(
                            { name: 'كاش 💵', value: 'cash' },
                            { name: 'بنك 🏦', value: 'bank' }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('ازالة')
                .setDescription('إزالة مورا من رصيد مستخدم')
                .addUserOption(option => option.setName('المستخدم').setDescription('المستخدم (منشن أو آيدي)').setRequired(true))
                .addIntegerOption(option => option.setName('المبلغ').setDescription('المبلغ الذي تريد إزالته').setRequired(true).setMinValue(1))
                .addStringOption(option => 
                    option.setName('المكان')
                        .setDescription('من أين تريد إزالة المبلغ؟ (الافتراضي: كاش ثم بنك)')
                        .addChoices(
                            { name: 'كاش 💵', value: 'cash' },
                            { name: 'بنك 🏦', value: 'bank' }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('تحديد')
                .setDescription('تحديد رصيد المورا لمستخدم')
                .addUserOption(option => option.setName('المستخدم').setDescription('المستخدم (منشن أو آيدي)').setRequired(true))
                .addIntegerOption(option => option.setName('المبلغ').setDescription('الرصيد الجديد').setRequired(true).setMinValue(0))
                .addStringOption(option => 
                    option.setName('المكان')
                        .setDescription('أي رصيد تريد تحديده؟ (الافتراضي: كاش)')
                        .addChoices(
                            { name: 'كاش 💵', value: 'cash' },
                            { name: 'بنك 🏦', value: 'bank' }
                        )
                )
        ),

    name: 'موراا', 
    aliases: ['gm', 'set-mora'],
    category: "Economy",
    description: "يضيف، يزيل، أو يحدد رصيد المورا لمستخدم معين.",

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, user, member, guild, client;
        let method, targetUser, amount, place;

        if (isSlash) {
            user = interactionOrMessage.user;
        } else {
            user = interactionOrMessage.author;
        }

        if (!ALLOWED_IDS.includes(user.id)) {
            const content = "⛔️ **عذراً، هذا الأمر خاص بمطور البوت فقط!**";
            if (isSlash) return interactionOrMessage.reply({ content, ephemeral: true });
            return interactionOrMessage.reply(content);
        }

        if (isSlash) {
            interaction = interactionOrMessage;
            member = interaction.member;
            guild = interaction.guild;
            client = interaction.client;

            method = interaction.options.getSubcommand();
            targetUser = interaction.options.getUser('المستخدم'); 
            amount = interaction.options.getInteger('المبلغ');
            place = interaction.options.getString('المكان') || 'cash'; 

            if (method === 'اضافة') method = 'add';
            else if (method === 'ازالة') method = 'remove';
            else if (method === 'تحديد') method = 'set';

            await interaction.deferReply();
        } else {
            message = interactionOrMessage;
            member = message.member;
            guild = message.guild;
            client = message.client;

            method = args[0] ? args[0].toLowerCase() : null;
            
            targetUser = message.mentions.users.first();
            if (!targetUser && args[1]) {
                try {
                    targetUser = await client.users.fetch(args[1]);
                } catch (e) {
                    targetUser = null;
                }
            }

            amount = parseInt(args[2]);
            place = 'cash'; 
        }

        const reply = async (payload) => {
            if (isSlash) return interaction.editReply(payload);
            return message.reply(payload);
        };

        const replyError = async (content) => {
            const payload = { content, ephemeral: true };
            if (isSlash) return interaction.editReply(payload);
            return message.reply(payload);
        };

        if (!targetUser || isNaN(amount) || amount < 0 || !['add', 'remove', 'set'].includes(method)) {
            return replyError("البيانات غير صحيحة أو المستخدم غير موجود (تأكد من الآيدي).");
        }

        let data = await client.getLevel(targetUser.id, guild.id);

        if (!data) {
            data = { ...client.defaultData, user: targetUser.id, guild: guild.id };
        }

        data.mora = Number(data.mora) || 0;
        data.bank = Number(data.bank) || 0;

        let actionWord = "";

        if (method === 'add') {
            actionWord = "اضـافـة";
            if (place === 'bank') {
                data.bank += amount;
            } else {
                data.mora += amount;
            }
            
            if (logTransaction) {
                await logTransaction(client, targetUser.id, guild.id, amount, `Admin Add (${user.username})`);
            }

        } else if (method === 'remove') {
            actionWord = "ازالـة";
            
            if (place === 'bank') {
                data.bank = Math.max(0, data.bank - amount);
            } else {
                if (data.mora >= amount) {
                    data.mora -= amount;
                } else {
                    let remaining = amount - data.mora;
                    data.mora = 0;
                    data.bank = Math.max(0, data.bank - remaining);
                }
            }

        } else if (method === 'set') {
            actionWord = "تحديد"; 
            if (place === 'bank') {
                data.bank = amount;
            } else {
                data.mora = amount;
            }
        }

        await client.setLevel(data);

        let totalBalance = data.mora + data.bank;
        let statusText = `تـمـت ${actionWord}`;

        const embed = new EmbedBuilder()
            .setColor(0xFFD700) 
            .setTitle(`✥ تـم تحديـث الرصيـد`)
            .setThumbnail('https://i.postimg.cc/NfH9T3CN/5953886680689347550-120.jpg') 
            .setDescription(`
✶ الاسـم: <@${targetUser.id}>
✶ ${statusText} **${amount.toLocaleString()}** <:mora:1435647151349698621>
✶ الرصيـد الجديـد: **${totalBalance.toLocaleString()}** <:mora:1435647151349698621>`)
            .setFooter({ text: `UserID: ${targetUser.id}` }) 
            .setTimestamp();

        await reply({ embeds: [embed] });
    }
};
