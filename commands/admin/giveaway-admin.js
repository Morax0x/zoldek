const { PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, Colors, MessageFlags } = require("discord.js");
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
            .setDescription('إنشاء قيفاواي جديد عبر لوحة التحكم')
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
            .addIntegerOption(option => option.setName('amount').setDescription('عدد التذاكر (الوزن) الذي ستحصل عليه (أقل شيء 1)').setRequired(true).setMinValue(1))
        ),

    name: 'giveaway-admin',
    aliases: ['giveaway', 'g-admin', 'قيف', 'قيفاواي', 'g-end', 'انهاء', 'reroll', 'ريرول', 'setgweights', 'وزن-القيفاواي'],
    category: "Admin",
    description: "إدارة وتكوين القيفاواي",

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        const client = interactionOrMessage.client;
        const db = client.sql;
        const guild = interactionOrMessage.guild;

        const member = isSlash ? interactionOrMessage.member : interactionOrMessage.member;
        if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            const err = '❌ ليس لديك صلاحيات.';
            return isSlash ? interactionOrMessage.reply({ content: err, flags: [MessageFlags.Ephemeral] }) : interactionOrMessage.reply(err);
        }

        try {
            await db.query(`CREATE TABLE IF NOT EXISTS giveaway_weights ("guildID" TEXT, "roleID" TEXT PRIMARY KEY, "weight" INTEGER)`);
        } catch(e) {}

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
            
            if (subcommand !== 'start') {
                await interactionOrMessage.deferReply({ flags: [MessageFlags.Ephemeral] }); 
            } else {
                await interactionOrMessage.deferReply({ flags: [MessageFlags.Ephemeral] }); 
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
            try {
                if (isSlash) return await interactionOrMessage.editReply(payload);
                return await interactionOrMessage.reply(payload);
            } catch (e) {
                if (e.code === 10062) return;
            }
        };

        try {
            if (subcommand === 'start') {
                let giveawayData = { prize: null, durationRaw: null, durationMs: null, winnerCount: 1, description: null, image: null, targetChannel: channel, xpReward: 0, moraReward: 0, color: null };

                const updateEmbed = () => {
                    const embed = new EmbedBuilder()
                        .setTitle("✥ لوحة إنشاء الهبات (Giveaway) ✥")
                        .setDescription("قم بتعبئة بيانات الهبة من خلال الأزرار السفلية.\nيجب إكمال **البيانات الأساسية** أولاً لتتمكن من إرسال القيفاواي.")
                        .setColor(Colors.DarkVividPink)
                        .setThumbnail(guild.iconURL({ dynamic: true }))
                        .addFields([
                            { name: "🎁 الجائزة (*)", value: giveawayData.prize ? `\`${giveawayData.prize}\`` : "❌ لم تُحدد", inline: true },
                            { name: "⏳ المدة (*)", value: giveawayData.durationRaw ? `\`${giveawayData.durationRaw}\`` : "❌ لم تُحدد", inline: true },
                            { name: "👥 الفائزون (*)", value: `\`${giveawayData.winnerCount}\``, inline: true },
                            { name: "📢 القناة", value: `<#${giveawayData.targetChannel.id}>`, inline: true },
                            { name: "💎 المكافآت الإضافية", value: `مورا: \`${giveawayData.moraReward}\` | XP: \`${giveawayData.xpReward}\``, inline: true },
                            { name: "🎨 لون الإمبد", value: giveawayData.color ? `\`${giveawayData.color}\`` : "الافتراضي (أزرق)", inline: true }
                        ])
                        .setFooter({ text: "نظام إدارة الهبات الإمبراطوري", iconURL: client.user.displayAvatarURL() });
                    if (giveawayData.image) embed.setImage(giveawayData.image);
                    return embed;
                };

                const getRows = (disabled = false) => {
                    const isReady = giveawayData.prize && giveawayData.durationMs;
                    return new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('g_core_data').setLabel('تعديل البيانات الأساسية').setEmoji('📝').setStyle(ButtonStyle.Primary).setDisabled(disabled),
                        new ButtonBuilder().setCustomId('g_extra_data').setLabel('تعديل الإضافات (اختياري)').setEmoji('⚙️').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
                        new ButtonBuilder().setCustomId('g_send_final').setLabel('إطلاق القيفاواي').setEmoji('🚀').setStyle(ButtonStyle.Success).setDisabled(disabled || !isReady) 
                    );
                };

                let msg;
                if (isSlash) {
                    msg = await interactionOrMessage.editReply({ embeds: [updateEmbed()], components: [getRows()] });
                } else {
                    msg = await interactionOrMessage.reply({ embeds: [updateEmbed()], components: [getRows()] });
                }

                const collector = msg.createMessageComponentCollector({ 
                    filter: i => i.user.id === member.id && ['g_core_data', 'g_extra_data', 'g_send_final'].includes(i.customId), 
                    time: 5 * 60 * 1000 
                });

                collector.on('collect', async i => {
                    try {
                        if (i.customId === 'g_core_data') {
                            const modal = new ModalBuilder().setCustomId('modal_g_core').setTitle('البيانات الأساسية للقيفاواي');
                            const prizeInput = new TextInputBuilder().setCustomId('m_prize').setLabel("ما هي الجائزة؟").setStyle(TextInputStyle.Short).setRequired(true);
                            if(giveawayData.prize) prizeInput.setValue(giveawayData.prize);
                            
                            const timeInput = new TextInputBuilder().setCustomId('m_time').setLabel("المدة (مثال: 10m, 1h, 2d)").setStyle(TextInputStyle.Short).setRequired(true);
                            if(giveawayData.durationRaw) timeInput.setValue(giveawayData.durationRaw);
                            
                            const winnersInput = new TextInputBuilder().setCustomId('m_winners').setLabel("عدد الفائزين").setStyle(TextInputStyle.Short).setValue(String(giveawayData.winnerCount)).setRequired(true);

                            modal.addComponents(new ActionRowBuilder().addComponents(prizeInput), new ActionRowBuilder().addComponents(timeInput), new ActionRowBuilder().addComponents(winnersInput));
                            await i.showModal(modal);

                            try {
                                const submit = await i.awaitModalSubmit({ time: 60000, filter: s => s.user.id === i.user.id && s.customId === 'modal_g_core' });
                                const p = submit.fields.getTextInputValue('m_prize');
                                const t = submit.fields.getTextInputValue('m_time');
                                const w = parseInt(submit.fields.getTextInputValue('m_winners'));

                                const ms = parseDuration(t);
                                if (!ms) return await submit.reply({ content: "❌ صيغة الوقت غير صحيحة. حاول مرة أخرى (مثال: 30m).", flags: [MessageFlags.Ephemeral] });
                                if (isNaN(w) || w < 1) return await submit.reply({ content: "❌ عدد الفائزين غير صالح.", flags: [MessageFlags.Ephemeral] });

                                giveawayData.prize = p; giveawayData.durationRaw = t; giveawayData.durationMs = ms; giveawayData.winnerCount = w;
                                await submit.update({ embeds: [updateEmbed()], components: [getRows()] }).catch(()=>{});
                            } catch (e) {}
                        }

                        else if (i.customId === 'g_extra_data') {
                            const modal = new ModalBuilder().setCustomId('modal_g_extra').setTitle('الإعدادات الإضافية');
                            const channelInput = new TextInputBuilder().setCustomId('m_channel').setLabel("آيدي القناة (اتركه فارغاً للحالية)").setStyle(TextInputStyle.Short).setRequired(false);
                            const moraInput = new TextInputBuilder().setCustomId('m_mora').setLabel("مكافأة مورا (تلقائي للفائز)").setStyle(TextInputStyle.Short).setRequired(false);
                            const xpInput = new TextInputBuilder().setCustomId('m_xp').setLabel("مكافأة خبرة (تلقائي للفائز)").setStyle(TextInputStyle.Short).setRequired(false);
                            const imageInput = new TextInputBuilder().setCustomId('m_image').setLabel("رابط الصورة (https://...)").setStyle(TextInputStyle.Short).setRequired(false);
                            const colorInput = new TextInputBuilder().setCustomId('m_color').setLabel("لون الإمبد (مثال: #ff0000 أو Red)").setStyle(TextInputStyle.Short).setRequired(false);
                            
                            if (giveawayData.image) imageInput.setValue(giveawayData.image);
                            if (giveawayData.moraReward > 0) moraInput.setValue(String(giveawayData.moraReward));
                            if (giveawayData.xpReward > 0) xpInput.setValue(String(giveawayData.xpReward));
                            if (giveawayData.color) colorInput.setValue(giveawayData.color);

                            modal.addComponents(new ActionRowBuilder().addComponents(channelInput), new ActionRowBuilder().addComponents(moraInput), new ActionRowBuilder().addComponents(xpInput), new ActionRowBuilder().addComponents(imageInput), new ActionRowBuilder().addComponents(colorInput));
                            await i.showModal(modal);

                            try {
                                const submit = await i.awaitModalSubmit({ time: 60000, filter: s => s.user.id === i.user.id && s.customId === 'modal_g_extra' });
                                const chID = submit.fields.getTextInputValue('m_channel');
                                const m = parseInt(submit.fields.getTextInputValue('m_mora')) || 0;
                                const x = parseInt(submit.fields.getTextInputValue('m_xp')) || 0;
                                const img = submit.fields.getTextInputValue('m_image'); 
                                const c = submit.fields.getTextInputValue('m_color');

                                if (chID) {
                                    const ch = member.guild.channels.cache.get(chID);
                                    if (ch) giveawayData.targetChannel = ch;
                                    else return await submit.reply({ content: "❌ القناة غير موجودة أو الآيدي خطأ.", flags: [MessageFlags.Ephemeral] }).catch(()=>{});
                                }

                                giveawayData.moraReward = m; giveawayData.xpReward = x;
                                if (img && img.startsWith('http')) giveawayData.image = img;
                                else giveawayData.image = null;
                                
                                giveawayData.color = c ? c.trim() : null;

                                await submit.update({ embeds: [updateEmbed()], components: [getRows()] }).catch(()=>{});
                            } catch (e) {}
                        }

                        else if (i.customId === 'g_send_final') {
                            if (!i.deferred && !i.replied) await i.deferUpdate().catch(()=>{}); 
                            try {
                                collector.stop('sent');
                                // 🔥 هنا نرسل اللون المخصص إلى الهاندلر 🔥
                                await startGiveaway(client, i, giveawayData.targetChannel, giveawayData.durationMs, giveawayData.winnerCount, giveawayData.prize, giveawayData.xpReward, giveawayData.moraReward, giveawayData.image, giveawayData.color);
                                const successEmbed = new EmbedBuilder().setColor("Green").setTitle("✅ تم إطلاق القيفاواي!").setDescription(`تم بدء السحب بنجاح في <#${giveawayData.targetChannel.id}>!\n\nتم حفظ البيانات بأمان ولن تتأثر بإعادة تشغيل البوت.`);
                                await i.editReply({ embeds: [successEmbed], components: [] }).catch(()=>{});
                            } catch (error) {
                                await i.followUp({ content: "❌ حدث خطأ أثناء بدء القيفاواي.", flags: [MessageFlags.Ephemeral] }).catch(()=>{});
                            }
                        }
                    } catch (error) {
                        if (error.code === 10062) return; 
                    }
                });

                collector.on('end', (c, reason) => {
                    if (reason === 'time') {
                        if (isSlash) interactionOrMessage.editReply({ components: [getRows(true)] }).catch(() => {});
                        else msg.edit({ components: [getRows(true)] }).catch(() => {});
                    }
                });
                return;
            }

            if (subcommand === 'end') {
                if (!targetMessageId) return reply("❌ يرجى وضع آيدي رسالة القيفاواي.");
                
                const dbRes = await client.sql.query(`SELECT * FROM active_giveaways WHERE "messageID" = $1 OR messageid = $1`, [targetMessageId]).catch(()=>({rows:[]}));
                const giveaway = dbRes.rows[0];

                if (!giveaway) return reply("❌ لم يتم العثور على قيفاواي بهذا الآيدي.");
                if (Number(giveaway.isFinished || giveaway.isfinished) === 1) return reply("⚠️ هذا القيفاواي منتهي بالفعل.");

                await endGiveaway(client, targetMessageId, true); 
                return reply(`✅ تم إنهاء القيفاواي (ID: ${targetMessageId}) واختيار الفائزين بنجاح!`);
            }

            if (subcommand === 'reroll') {
                if (targetMessageId) {
                    try {
                        await rerollGiveaway(client, interactionOrMessage, targetMessageId);
                        return;
                    } catch (err) {
                        return reply(`❌ حدث خطأ. تأكد من الآيدي وأن القيفاواي مسجل في قاعدة البيانات.`);
                    }
                }

                const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
                const gRes = await db.query(`SELECT * FROM active_giveaways WHERE ("isFinished" = 1 OR "endsAt" <= $1) AND "endsAt" > $2 ORDER BY "endsAt" DESC LIMIT 25`, [Date.now(), sevenDaysAgo]).catch(()=>({rows:[]}));
                const giveawaysList = gRes.rows;

                if (giveawaysList.length === 0) return reply("❌ لا يوجد أي قيفاوايز حديثة لعمل ريرول لها.\nجرب وضع الآيدي يدوياً.");

                const options = giveawaysList.map(g => {
                    let endsDate = "تاريخ غير معروف";
                    try {
                        if (typeof getKSADateString === 'function') endsDate = getKSADateString(g.endsAt || g.endsat);
                        else endsDate = new Date(g.endsAt || g.endsat).toLocaleDateString('en-US');
                    } catch (e) {}

                    const status = (g.isFinished === 1 || g.isfinished === 1) ? "منتهي" : "معلق";
                    let label = g.prize || "جائزة مجهولة";
                    if (label.length > 100) label = label.substring(0, 97) + "...";

                    return new StringSelectMenuOptionBuilder()
                        .setLabel(label)
                        .setValue(g.messageID || g.messageid)
                        .setDescription(`[${status}] (ID: ${g.messageID || g.messageid}) - ${endsDate}`)
                        .setEmoji((g.isFinished === 1 || g.isfinished === 1) ? '✅' : '⏳');
                });

                const selectMenu = new StringSelectMenuBuilder().setCustomId('g_reroll_select').setPlaceholder('اختر القيفاواي الذي تريد عمل ريرول له...').addOptions(options);
                const row = new ActionRowBuilder().addComponents(selectMenu);

                return reply({ content: "الرجاء اختيار قيفاواي من القائمة أدناه:", components: [row] });
            }

            if (subcommand === 'weight') {
                if (!targetRole || isNaN(targetWeight) || targetWeight < 1) {
                    return reply("❌ الاستخدام: `/giveaway-admin weight <@Role> <Weight>` (أقل شيء 1).");
                }
                
                await db.query(`INSERT INTO giveaway_weights ("guildID", "roleID", "weight") VALUES ($1, $2, $3) ON CONFLICT ("roleID") DO UPDATE SET "weight" = EXCLUDED."weight"`, [guild.id, targetRole.id, targetWeight]);
                return reply(`✅ تم تحديد وزن رتبة ${targetRole.name} إلى **${targetWeight}** تذكرة.`);
            }

        } catch (err) {
            return reply("❌ حدث خطأ داخلي.");
        }
    }
};
