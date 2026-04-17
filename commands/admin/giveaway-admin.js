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

const safeQuery = async (db, qPg, params) => {
    let res;
    try { res = await db.query(qPg, params); } catch(e) { res = { rows: [] }; }
    const rows1 = Array.isArray(res) ? res : (res?.rows || []);
    if (rows1.length > 0) return { rows: rows1 };

    let fallbackQuery = qPg.replace(/"messageID"/gi, "messageid").replace(/"isFinished"/gi, "isfinished").replace(/"endsAt"/gi, "endsat").replace(/"roleID"/gi, "roleid");
    if (fallbackQuery !== qPg) {
        try { 
            let res2 = await db.query(fallbackQuery, params); 
            return { rows: Array.isArray(res2) ? res2 : (res2?.rows || []) };
        } catch(e2) { }
    }
    return { rows: [] };
};

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
        const isSlash = typeof interactionOrMessage.isChatInputCommand === 'function' && interactionOrMessage.isChatInputCommand();
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
            await interactionOrMessage.deferReply({ flags: [MessageFlags.Ephemeral] }); 
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
                if (isSlash) {
                    if (interactionOrMessage.deferred || interactionOrMessage.replied) return await interactionOrMessage.editReply(payload);
                    return await interactionOrMessage.reply(payload);
                }
                return await interactionOrMessage.reply(payload);
            } catch (e) {
                if (e.code === 10062) return null;
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
                            { name: "🎨 لون الإمبد", value: giveawayData.color ? `\`${giveawayData.color}\`` : "الافتراضي (أزرق)", inline: true },
                            { name: "📝 الوصف المخصص", value: giveawayData.description ? "✅ تم تعيين وصف" : "لم يُحدد", inline: true }
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

                const msg = await reply({ embeds: [updateEmbed()], components: [getRows()], fetchReply: true });
                if (!msg) return;

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
                            const descInput = new TextInputBuilder().setCustomId('m_desc').setLabel("وصف مخصص للقيفاواي (يظهر فوق العداد)").setStyle(TextInputStyle.Paragraph).setRequired(false);
                            const channelInput = new TextInputBuilder().setCustomId('m_channel').setLabel("آيدي القناة (اتركه فارغاً للحالية)").setStyle(TextInputStyle.Short).setRequired(false);
                            const moraInput = new TextInputBuilder().setCustomId('m_mora').setLabel("مكافأة مورا (تلقائي للفائز)").setStyle(TextInputStyle.Short).setRequired(false);
                            const xpInput = new TextInputBuilder().setCustomId('m_xp').setLabel("مكافأة خبرة (تلقائي للفائز)").setStyle(TextInputStyle.Short).setRequired(false);
                            const imageInput = new TextInputBuilder().setCustomId('m_image').setLabel("رابط الصورة (https://...)").setStyle(TextInputStyle.Short).setRequired(false);
                            
                            if (giveawayData.description) descInput.setValue(giveawayData.description);
                            if (giveawayData.image) imageInput.setValue(giveawayData.image);
                            if (giveawayData.moraReward > 0) moraInput.setValue(String(giveawayData.moraReward));
                            if (giveawayData.xpReward > 0) xpInput.setValue(String(giveawayData.xpReward));

                            modal.addComponents(new ActionRowBuilder().addComponents(descInput), new ActionRowBuilder().addComponents(channelInput), new ActionRowBuilder().addComponents(moraInput), new ActionRowBuilder().addComponents(xpInput), new ActionRowBuilder().addComponents(imageInput));
                            await i.showModal(modal);

                            try {
                                const submit = await i.awaitModalSubmit({ time: 60000, filter: s => s.user.id === i.user.id && s.customId === 'modal_g_extra' });
                                const d = submit.fields.getTextInputValue('m_desc');
                                const chID = submit.fields.getTextInputValue('m_channel');
                                const m = parseInt(submit.fields.getTextInputValue('m_mora')) || 0;
                                const x = parseInt(submit.fields.getTextInputValue('m_xp')) || 0;
                                const img = submit.fields.getTextInputValue('m_image'); 

                                if (chID) {
                                    const ch = member.guild.channels.cache.get(chID);
                                    if (ch) giveawayData.targetChannel = ch;
                                    else return await submit.reply({ content: "❌ القناة غير موجودة أو الآيدي خطأ.", flags: [MessageFlags.Ephemeral] }).catch(()=>{});
                                }

                                giveawayData.description = d ? d.trim() : null;
                                giveawayData.moraReward = m; giveawayData.xpReward = x;
                                if (img && img.startsWith('http')) giveawayData.image = img;
                                else giveawayData.image = null;
                                
                                await submit.update({ embeds: [updateEmbed()], components: [getRows()] }).catch(()=>{});
                            } catch (e) {}
                        }

                        else if (i.customId === 'g_send_final') {
                            if (!i.deferred && !i.replied) await i.deferUpdate().catch(()=>{}); 
                            try {
                                collector.stop('sent');
                                await startGiveaway(client, i, giveawayData.targetChannel, giveawayData.durationMs, giveawayData.winnerCount, giveawayData.prize, giveawayData.xpReward, giveawayData.moraReward, giveawayData.image, giveawayData.color, giveawayData.description);
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
                if (!targetMessageId) return reply({ content: "❌ يرجى وضع آيدي رسالة القيفاواي.", flags: [MessageFlags.Ephemeral] });
                
                const giveawayRes = await safeQuery(db, 'SELECT * FROM active_giveaways WHERE "messageID" = $1', [targetMessageId]);
                const giveaway = giveawayRes.rows[0];

                if (!giveaway) return reply({ content: "❌ لم يتم العثور على قيفاواي بهذا الآيدي.", flags: [MessageFlags.Ephemeral] });
                if (Number(giveaway.isFinished || giveaway.isfinished) === 1) return reply({ content: "⚠️ هذا القيفاواي منتهي بالفعل.", flags: [MessageFlags.Ephemeral] });

                await endGiveaway(client, targetMessageId, true); 
                return reply({ content: `✅ تم إنهاء القيفاواي (ID: ${targetMessageId}) واختيار الفائزين بنجاح!`, flags: [MessageFlags.Ephemeral] });
            }

            // 🔥 حل جذري وتحديث لقائمة واسكربت الريرول (إعادة السحب) 🔥
            if (subcommand === 'reroll') {
                if (targetMessageId) {
                    try {
                        await rerollGiveaway(client, interactionOrMessage, targetMessageId);
                        return;
                    } catch (err) {
                        return reply({ content: `❌ حدث خطأ. تأكد من الآيدي وأن القيفاواي مسجل في قاعدة البيانات.`, flags: [MessageFlags.Ephemeral] });
                    }
                }

                const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
                const gRes = await safeQuery(db, `SELECT * FROM active_giveaways WHERE ("isFinished" = 1 OR "endsAt" <= $1) AND "endsAt" > $2 ORDER BY "endsAt" DESC LIMIT 25`, [Date.now(), sevenDaysAgo]);
                const giveawaysList = gRes.rows;

                if (giveawaysList.length === 0) return reply({ content: "❌ لا يوجد أي قيفاوايز حديثة لعمل ريرول لها.\nجرب وضع الآيدي يدوياً.", flags: [MessageFlags.Ephemeral] });

                const options = giveawaysList.map(g => {
                    let endsDate = "تاريخ غير معروف";
                    const endsAtValue = g.endsAt || g.endsat;
                    if (endsAtValue) {
                        endsDate = new Date(Number(endsAtValue)).toLocaleDateString('en-CA');
                    }

                    const status = (g.isFinished === 1 || g.isfinished === 1) ? "منتهي" : "معلق";
                    let label = g.prize || "جائزة مجهولة";
                    if (label.length > 100) label = label.substring(0, 97) + "...";

                    return new StringSelectMenuOptionBuilder()
                        .setLabel(label)
                        .setValue(g.messageID || g.messageid)
                        .setDescription(`[${status}] (ID: ${g.messageID || g.messageid}) - ${endsDate}`)
                        .setEmoji((g.isFinished === 1 || g.isfinished === 1) ? '✅' : '⏳');
                });

                const selectMenu = new StringSelectMenuBuilder().setCustomId('g_reroll_select_local').setPlaceholder('اختر القيفاواي الذي تريد عمل ريرول له...').addOptions(options);
                const row = new ActionRowBuilder().addComponents(selectMenu);

                const rMsg = await reply({ content: "الرجاء اختيار قيفاواي من القائمة أدناه:", components: [row], fetchReply: true });
                if (!rMsg) return;

                // إنشاء Collector محلي يعمل بدون أخطاء خارجية
                const rerollCollector = rMsg.createMessageComponentCollector({ filter: i => i.user.id === member.id && i.customId === 'g_reroll_select_local', time: 60000 });
                rerollCollector.on('collect', async i => {
                    await i.deferUpdate().catch(()=>{});
                    const msgId = i.values[0];
                    await rerollGiveaway(client, i, msgId);
                });
                rerollCollector.on('end', () => {
                    if (isSlash) interactionOrMessage.editReply({ components: [] }).catch(()=>{});
                    else rMsg.edit({ components: [] }).catch(()=>{});
                });
                return;
            }

            if (subcommand === 'weight') {
                if (!targetRole || isNaN(targetWeight) || targetWeight < 1) {
                    return reply({ content: "❌ الاستخدام: `/giveaway-admin weight <@Role> <Weight>` (أقل شيء 1).", flags: [MessageFlags.Ephemeral] });
                }
                
                try {
                    let wRes = await safeQuery(db, `SELECT * FROM giveaway_weights WHERE "roleID" = $1`, [targetRole.id]);
                    if (wRes.rows.length > 0) {
                        await db.query(`UPDATE giveaway_weights SET "weight" = $1 WHERE "roleID" = $2`, [targetWeight, targetRole.id]);
                    } else {
                        await db.query(`INSERT INTO giveaway_weights ("guildID", "roleID", "weight") VALUES ($1, $2, $3)`, [guild.id, targetRole.id, targetWeight]);
                    }
                } catch(e) {
                    try {
                        let wRes2 = await db.query(`SELECT * FROM giveaway_weights WHERE roleid = '${targetRole.id}'`).catch(()=>({rows:[]}));
                        if(wRes2.rows && wRes2.rows.length > 0) {
                            await db.query(`UPDATE giveaway_weights SET weight = ${targetWeight} WHERE roleid = '${targetRole.id}'`);
                        } else {
                            await db.query(`INSERT INTO giveaway_weights (guildid, roleid, weight) VALUES ('${guild.id}', '${targetRole.id}', ${targetWeight})`);
                        }
                    } catch(e2) { }
                }
                return reply({ content: `✅ تم تحديد وزن رتبة ${targetRole.name} إلى **${targetWeight}** تذكرة.`, flags: [MessageFlags.Ephemeral] });
            }

        } catch (err) {
            console.error("[Giveaway Admin Error]:", err);
            return reply({ content: "❌ حدث خطأ داخلي.", flags: [MessageFlags.Ephemeral] });
        }
    }
};
