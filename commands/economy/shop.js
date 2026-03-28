const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, PermissionsBitField, MessageFlags } = require("discord.js");
const shopItems = require('../../json/shop-items.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('متجر')
        .setDescription('إعداد اللوحة الثابتة للمتجر المرئي (للإدارة)'),

    name: 'shop',
    aliases: ['متجر', 'setup-shop'],
    category: "Economy",

    async execute(interactionOrMessage) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, guild, client, member, channel;

        if (isSlash) {
            interaction = interactionOrMessage;
            guild = interaction.guild;
            client = interaction.client;
            member = interaction.member;
            channel = interaction.channel;
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        } else {
            message = interactionOrMessage;
            guild = message.guild;
            client = message.client;
            member = message.member;
            channel = message.channel;
        }

        const replyEphemeral = async (payload) => {
            if (typeof payload === 'string') payload = { content: payload };
            payload.flags = MessageFlags.Ephemeral;
            if (isSlash) return interaction.editReply(payload);
            else return message.reply(payload);
        };

        if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return replyEphemeral('❌ هذا الأمر مخصص للإدارة فقط لإعداد لوحة المتجر.');
        }

        let generateGlobalShopBoard;
        try { 
            generateGlobalShopBoard = require('../../generators/shop-generator.js').generateGlobalShopBoard; 
        } catch(e) {}

        if (!generateGlobalShopBoard) return replyEphemeral('❌ نظام الرسم غير متوفر.');

        const db = client.sql;

        const imageBuffer = await generateGlobalShopBoard(shopItems);

        const options = shopItems.map(item => ({
            label: item.name,
            description: `السعر: ${item.price} | ${item.description.substring(0, 50)}`,
            value: `buy_item_${item.id}`,
            emoji: item.emoji || '📦'
        }));

        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('shop_buy_select')
                .setPlaceholder('🛒 اختر العنصر الذي تود شراءه من هنا...')
                .addOptions(options)
        );

        await channel.send({
            files: [{ attachment: imageBuffer, name: 'empire_shop_board.png' }],
            components: [row]
        });

        try {
            await db.query(`INSERT INTO settings ("guild") VALUES ($1) ON CONFLICT ("guild") DO NOTHING`, [guild.id]);
            await db.query(`UPDATE settings SET "shopChannelID" = $1 WHERE "guild" = $2`, [channel.id, guild.id]);
            await replyEphemeral('✅ تم نشر لوحة المتجر المرئية وحفظها بنجاح.');
        } catch (err) {
            await replyEphemeral('⚠️ تم نشر المتجر، ولكن حدث خطأ أثناء حفظ الروم في قاعدة البيانات.');
        }
    }
};
