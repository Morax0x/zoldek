const { PermissionsBitField, SlashCommandBuilder } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('xp-admin')
        .setDescription('إعدادات نقاط الخبرة (XP) للنص والصوت.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
        .addSubcommand(sub => sub
            .setName('voice')
            .setDescription('تحديد نقاط الخبرة للقنوات الصوتية لكل دقيقة.')
            .addIntegerOption(option =>
                option.setName('amount')
                .setDescription('كمية الـ XP التي سيتم منحها كل دقيقة (0 لإيقافها)')
                .setRequired(true)
                .setMinValue(0))
        )
        .addSubcommand(sub => sub
            .setName('text')
            .setDescription('تحديد الحد الأقصى لنقاط الخبرة للنص لكل دقيقة.')
            .addIntegerOption(option =>
                option.setName('max')
                .setDescription('الحد الأقصى للـ XP (سيكون التوزيع من 1 إلى هذا الرقم)')
                .setRequired(true)
                .setMinValue(1))
        ),

    name: 'xp-admin',
    aliases: ['vxpsettings', 'setvoicexp', 'voice-xp-settings', 'xpsettings', 'setxp', 'set-xp', 'xp-settings'],
    category: "Admin",
    description: "إعدادات الـ XP.",
    cooldown: 3,

    async execute (interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, guild, client, member;

        if (isSlash) {
            interaction = interactionOrMessage;
            guild = interaction.guild;
            client = interaction.client;
            member = interaction.member;
            await interaction.deferReply({ ephemeral: true });
        } else {
            message = interactionOrMessage;
            guild = message.guild;
            client = message.client;
            member = message.member;
        }

        const db = client.sql;

        const reply = async (payload) => {
            if (typeof payload === 'string') payload = { content: payload };
            payload.ephemeral = false; 
            if (isSlash) return interaction.editReply(payload);
            return message.channel.send(payload);
        };
        const replyError = async (content) => {
            const payload = { content, ephemeral: true };
            if (isSlash) return interaction.editReply(payload);
            return message.reply(payload);
        };

        if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return replyError("You do not have permission to use this command!");
        }

        let subcommand = '';
        let amount = 0;

        if (isSlash) {
            subcommand = interaction.options.getSubcommand();
            if (subcommand === 'voice') amount = interaction.options.getInteger('amount');
            if (subcommand === 'text') amount = interaction.options.getInteger('max');
        } else {
            const cmdName = message.content.split(' ')[0].toLowerCase().slice(1);
            if (cmdName.includes('vxp') || cmdName.includes('voice')) {
                subcommand = 'voice';
                if (args.length < 1 || isNaN(args[0])) return replyError("Please provide valid arguments! `vxpsettings (xp)`\n(Example: `-vxpsettings 20` will give 20 XP per minute)");
                amount = parseInt(args[0]);
                if (amount < 0) return replyError("XP cannot be less than 0 XP!");
            } else if (cmdName.includes('xp')) {
                subcommand = 'text';
                if (args.length < 1 || isNaN(args[0])) return replyError(`Please provide a valid argument! \`xpsettings (max_xp)\`\n(Example: \`-xpsettings 25\` will give 1-25 XP per minute)`);
                amount = parseInt(args[0]);
                if (amount < 1) return replyError(`XP cannot be less than 1 XP!`);
            }
        }

        try {
            await db.query(`INSERT INTO settings ("guild") VALUES ($1) ON CONFLICT ("guild") DO NOTHING`, [guild.id]);

            const cooldownSeconds = 60;
            const cooldownMS = cooldownSeconds * 1000;

            if (subcommand === 'voice') {
                await db.query(`UPDATE settings SET "voiceXP" = $1, "voiceCooldown" = $2 WHERE "guild" = $3`, [amount, cooldownMS, guild.id]);
                return reply(`Users in voice channels will now gain ${amount}XP every ${cooldownSeconds} seconds.`);
            }

            if (subcommand === 'text') {
                await db.query(`UPDATE settings SET "customXP" = $1, "customCooldown" = $2 WHERE "guild" = $3`, [amount, cooldownMS, guild.id]);
                return reply(`Users from now will gain 1 - ${amount} XP / ${cooldownSeconds} seconds.`);
            }

        } catch (err) {
            console.error("XP Admin Error:", err);
            return replyError("❌ | حدث خطأ داخلي أثناء تحديث الإعدادات.");
        }
    }
};
