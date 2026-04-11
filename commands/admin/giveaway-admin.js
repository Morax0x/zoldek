const { PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require("discord.js");
const { startGiveaway, endGiveaway, rerollGiveaway } = require('../../handlers/giveaway-handler.js'); 

function parseDuration(durationStr) {
    if (!durationStr) return null;
    const regex = /(\d+)\s*([smhd])/i;
    const match = durationStr.match(regex);
    if (!match) return null;
    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    switch (unit) {
        case 's': return value * 1000;
        case 'm': return value * 60 * 1000;
        case 'h': return value * 60 * 60 * 1000;
        case 'd': return value * 24 * 60 * 60 * 1000;
        default: return null;
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('giveaway-admin')
        .setDescription('إدارة القيفاواي (إنشاء، إنهاء، سحب جديد، أوزان)')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
        
        .addSubcommand(subcommand => subcommand
            .setName('start')
            .setDescription('إنشاء قيفاواي جديد بسهولة')
        )
        
        .addSubcommand(subcommand => subcommand
            .setName('end')
            .setDescription('إنهاء قيفاواي نشط فوراً واختيار الفائزين')
            .addStringOption(option => option.setName('message_id').setDescription('آيدي رسالة القيفاواي').setRequired(true))
        )

        .addSubcommand(subcommand => subcommand
            .setName('reroll')
            .setDescription('اختيار فائز جديد أو إنهاء قيفاواي معلق')
            .addStringOption(option => option.setName('message_id').setDescription('آيدي رسالة القيفاواي (اختياري)').setRequired(false))
        )

        .addSubcommand(subcommand => subcommand
            .setName('weight')
            .setDescription('يحدد وزن (فرصة) الرتبة في الفوز بالقيفاواي')
            .addRoleOption(option => option.setName('role').setDescription('الرتبة التي تريد تحديد وزنها').setRequired(true))
            .addIntegerOption(option => option.setName('amount').setDescription('عدد التذاكر (الوزن) (أقل شيء 1)').setRequired(true).setMinValue(1))
        ),

    name: 'giveaway-admin',
    aliases: ['giveaway', 'g-admin', 'قيف', 'قيفاواي', 'g-end', 'انهاء', 'reroll', 'ريرول', 'setgweights', 'وزن-القيفاواي'],
    category: "Admin",

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        const client = interactionOrMessage.client;
        const db = client.sql;
        const guild = interactionOrMessage.guild;

        const member = isSlash ? interactionOrMessage.member : interactionOrMessage.member;
        if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            const err = '❌ ليس لديك صلاحيات.';
            return isSlash ? interactionOrMessage.reply({ content: err, ephemeral: true }) : interactionOrMessage.reply(err);
        }

        let subcommand = '';
        let targetMessageId = null;
        let targetRole = null;
        let targetWeight = null;
        let channel = interactionOrMessage.channel;

        if (isSlash) {
            subcommand = interactionOrMessage.options.getSubcommand();
            if (subcommand === 'end' || subcommand === 'reroll') targetMessageId = interactionOrMessage.options.getString('message_id');
            if (subcommand === 'weight') {
                targetRole = interactionOrMessage.options.getRole('role');
                targetWeight = interactionOrMessage.options.getInteger('amount');
            }
        } else {
            const cmdName = interactionOrMessage.content.split(' ')[0].toLowerCase().slice(1);
            if (cmdName.includes('giveaway') || cmdName.includes('قيف') || cmdName.includes('g-admin')) subcommand = 'start';
            else if (cmdName.includes('g-end') || cmdName.includes('انهاء')) { subcommand = 'end'; targetMessageId = args[0]; }
            else if (cmdName.includes('reroll') || cmdName.includes('ريرول')) { subcommand = 'reroll'; targetMessageId = args[0]; }
            else if (cmdName.includes('setgweights') || cmdName.includes('وزن')) {
                subcommand = 'weight';
                targetRole = interactionOrMessage.mentions.roles.first();
                targetWeight = parseInt(args[1]);
            }
        }

        const reply = async (payload) => {
            if (isSlash) {
                if (interactionOrMessage.deferred || interactionOrMessage.replied) return await interactionOrMessage.editReply(payload);
                return await interactionOrMessage.reply(payload);
            }
            return await interactionOrMessage.reply(payload);
        };

        try {
            // ==========================================
            // 1. إعداد القيفاواي (نظام المودال الذكي)
            // ==========================================
            if (subcommand === 'start') {
                const setupButton = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('open_giveaway_modal')
                        .setLabel('🛠️ إعداد قيفاواي جديد')
                        .setStyle(ButtonStyle.Success)
                );

                const embed = new EmbedBuilder()
                    .setTitle('✥ إدارة القيفاواي')
                    .setDescription('اضغط على الزر أدناه لفتح نموذج إعداد القيفاواي بسرعة وسهولة.')
                    .setColor(Colors.DarkVividPink);

                let msg;
                if (isSlash) {
                    await interactionOrMessage.reply({ embeds: [embed], components: [setupButton], ephemeral: true });
                    msg = await interactionOrMessage.fetchReply();
                } else {
                    msg = await interactionOrMessage.reply({ embeds: [embed], components: [setupButton] });
                }

                const collector = msg.createMessageComponentCollector({ filter: i => i.user.id === member.id, time: 300000 });

                collector.on('collect', async i => {
                    if (i.customId === 'open_giveaway_modal') {
                        const modal = new ModalBuilder().setCustomId('giveaway_setup_modal').setTitle('إعدادات القيفاواي');

                        const prizeInput = new TextInputBuilder().setCustomId('prize').setLabel("ما هي الجائزة؟").setStyle(TextInputStyle.Short).setRequired(true);
                        const timeInput = new TextInputBuilder().setCustomId('duration').setLabel("المدة (مثال: 10m, 1h, 2d)").setStyle(TextInputStyle.Short).setRequired(true);
                        const winnersInput = new TextInputBuilder().setCustomId('winners').setLabel("عدد الفائزين").setStyle(TextInputStyle.Short).setValue("1").setRequired(true);
                        const moraInput = new TextInputBuilder().setCustomId('mora').setLabel("مكافأة مورا إضافية (اختياري)").setStyle(TextInputStyle.Short).setRequired(false).setValue("0");
                        const xpInput = new TextInputBuilder().setCustomId('xp').setLabel("مكافأة خبرة إضافية (اختياري)").setStyle(TextInputStyle.Short).setRequired(false).setValue("0");

                        modal.addComponents(
                            new ActionRowBuilder().addComponents(prizeInput),
                            new ActionRowBuilder().addComponents(timeInput),
                            new ActionRowBuilder().addComponents(winnersInput),
                            new ActionRowBuilder().addComponents(moraInput),
                            new ActionRowBuilder().addComponents(xpInput)
                        );

                        await i.showModal(modal);

                        try {
                            const submit = await i.awaitModalSubmit({ time: 120000, filter: s => s.user.id === i.user.id });
                            await submit.deferReply({ ephemeral: true });

                            const p = submit.fields.getTextInputValue('prize');
                            const t = submit.fields.getTextInputValue('duration');
                            const w = parseInt(submit.fields.getTextInputValue('winners')) || 1;
                            const m = parseInt(submit.fields.getTextInputValue('mora')) || 0;
                            const x = parseInt(submit.fields.getTextInputValue('xp')) || 0;

                            const durationMs = parseDuration(t);
                            if (!durationMs || durationMs < 10000) return submit.editReply("❌ صيغة الوقت غير صحيحة أو قصيرة جداً (مثال صحيح: 1h).");
                            if (w < 1) return submit.editReply("❌ عدد الفائزين يجب أن يكون 1 على الأقل.");

                            // تشغيل القيفاواي فوراً
                            await startGiveaway(client, submit, channel, durationMs, w, p, x, m);
                            await submit.editReply(`✅ **تم إرسال القيفاواي في القناة بنجاح!**\nالجائزة: ${p} | المدة: ${t}`);
                            collector.stop();
                        } catch (e) {
                            if (e.code !== 'InteractionCollectorError') console.error("Modal Error:", e);
                        }
                    }
                });
                return;
            }

            // =========================
            // 2. إنهاء القيفاواي
            // =========================
            if (subcommand === 'end') {
                if (isSlash) await interactionOrMessage.deferReply({ ephemeral: true });
                if (!targetMessageId) return reply("❌ يرجى إدخال آيدي رسالة القيفاواي.");
                await endGiveaway(client, targetMessageId, true); 
                return reply(`✅ تم إرسال طلب إنهاء القيفاواي.`);
            }

            // =========================
            // 3. ريرول القيفاواي
            // =========================
            if (subcommand === 'reroll') {
                if (isSlash) await interactionOrMessage.deferReply({ ephemeral: true });
                if (!targetMessageId) return reply("❌ يرجى إدخال آيدي رسالة القيفاواي لعمل الريرول.");
                await rerollGiveaway(client, interactionOrMessage, targetMessageId);
                return;
            }

            // =========================
            // 4. أوزان القيفاواي
            // =========================
            if (subcommand === 'weight') {
                if (isSlash) await interactionOrMessage.deferReply({ ephemeral: true });
                if (!targetRole || !targetWeight || targetWeight < 1) return reply("❌ الاستخدام خاطئ.");
                await db.query(`INSERT INTO giveaway_weights ("guildID", "roleID", "weight") VALUES ($1, $2, $3) ON CONFLICT ("roleID") DO UPDATE SET "weight" = EXCLUDED."weight"`, [guild.id, targetRole.id, targetWeight]);
                return reply(`✅ تم تحديد وزن رتبة ${targetRole.name} إلى **${targetWeight}** تذكرة.`);
            }

        } catch (err) {
            console.error("Giveaway Admin Error:", err);
            return reply("❌ حدث خطأ داخلي.");
        }
    }
};
