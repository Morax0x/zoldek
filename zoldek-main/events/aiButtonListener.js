const { Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const aiLimitHandler = require('../utils/aiLimitHandler');
const aiConfig = require('../utils/aiConfig');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        if (!interaction.isButton()) return;
        if (!interaction.customId.startsWith('ai_')) return;

        if (!interaction.guild) {
            return interaction.reply({ content: "❌ أوامر الذكاء الاصطناعي تعمل داخل السيرفرات فقط.", flags: [MessageFlags.Ephemeral] });
        }

        const userID = interaction.user.id;
        const guildID = interaction.guild.id;
        const db = interaction.client.sql;

        try {
            if (interaction.customId === 'ai_topup_2500') {
                await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

                const COST = 2500;
                const REWARD_MESSAGES = 100;

                let uData = null;
                if (interaction.client.getLevel) {
                    uData = await interaction.client.getLevel(userID, guildID);
                }
                
                let userMora = 0;
                let userBank = 0;

                if (uData) {
                    userMora = Number(uData.mora || 0);
                    userBank = Number(uData.bank || 0);
                } else {
                    let res;
                    try { res = await db.query(`SELECT mora, bank FROM levels WHERE "user" = $1 AND "guild" = $2`, [userID, guildID]); }
                    catch(e) { res = await db.query(`SELECT mora, bank FROM levels WHERE userid = $1 AND guildid = $2`, [userID, guildID]).catch(()=>({rows:[]})); }
                    if (res && res.rows.length > 0) {
                        userMora = Number(res.rows[0].mora || res.rows[0].Mora || 0);
                        userBank = Number(res.rows[0].bank || res.rows[0].Bank || 0);
                    }
                }

                const totalBalance = userMora + userBank;

                if (totalBalance < COST) {
                    return interaction.editReply({
                        content: `🚫 **عذراً، رصيدك غير كافٍ!**\nتحتاج إلى **${COST}** مورا، وأنت تملك إجمالي **${totalBalance}** مورا فقط (كاش + بنك).`
                    });
                }

                if (userMora >= COST) {
                    userMora -= COST;
                } else {
                    let diff = COST - userMora;
                    userMora = 0;
                    userBank -= diff;
                }

                if (uData && interaction.client.setLevel) {
                    uData.mora = userMora;
                    uData.bank = userBank;
                    await interaction.client.setLevel(uData);
                }

                try { await db.query(`UPDATE levels SET "mora" = $1, "bank" = $2 WHERE "user" = $3 AND "guild" = $4`, [userMora, userBank, userID, guildID]); }
                catch(e) { await db.query(`UPDATE levels SET mora = $1, bank = $2 WHERE userid = $3 AND guildid = $4`, [userMora, userBank, userID, guildID]).catch(()=>{}); }

                await aiLimitHandler.addPurchasedBalance(userID, REWARD_MESSAGES, db);

                const embed = new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setTitle('✅ تمت عملية الشحن')
                    .setDescription(`💎 **تم خصم ${COST} مورا.**\n🤖 **تمت إضافة ${REWARD_MESSAGES} رسالة لرصيد محادثتك.**\n\nيمكنك الآن التحدث مع الذكاء الاصطناعي!`)
                    .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL() });

                await interaction.editReply({ embeds: [embed] });
            }

            else if (interaction.customId === 'ai_pay_category_1000') {
                await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

                const COST = 1000;
                
                let uData = null;
                if (interaction.client.getLevel) uData = await interaction.client.getLevel(userID, guildID);
                
                let userMora = 0, userBank = 0;
                if (uData) {
                    userMora = Number(uData.mora || 0); userBank = Number(uData.bank || 0);
                } else {
                    let res;
                    try { res = await db.query(`SELECT mora, bank FROM levels WHERE "user" = $1 AND "guild" = $2`, [userID, guildID]); }
                    catch(e) { res = await db.query(`SELECT mora, bank FROM levels WHERE userid = $1 AND guildid = $2`, [userID, guildID]).catch(()=>({rows:[]})); }
                    if (res && res.rows.length > 0) {
                        userMora = Number(res.rows[0].mora || 0); userBank = Number(res.rows[0].bank || 0);
                    }
                }

                if ((userMora + userBank) < COST) {
                    return interaction.editReply({ content: `❌ **رصيدك غير كافٍ!** ما معك **${COST}** مورا عشان تفتح الشات.` });
                }

                if (userMora >= COST) userMora -= COST;
                else { let diff = COST - userMora; userMora = 0; userBank -= diff; }

                if (uData && interaction.client.setLevel) { uData.mora = userMora; uData.bank = userBank; await interaction.client.setLevel(uData); }
                
                try { await db.query(`UPDATE levels SET "mora" = $1, "bank" = $2 WHERE "user" = $3 AND "guild" = $4`, [userMora, userBank, userID, guildID]); }
                catch(e) { await db.query(`UPDATE levels SET mora = $1, bank = $2 WHERE userid = $3 AND guildid = $4`, [userMora, userBank, userID, guildID]).catch(()=>{}); }

                const modeButtons = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('ai_mode_select_sfw').setLabel('SFW (عادية)').setStyle(ButtonStyle.Success).setEmoji('🛡️'),
                    new ButtonBuilder().setCustomId('ai_mode_select_nsfw').setLabel('NSFW (منحرفة)').setStyle(ButtonStyle.Danger).setEmoji('🔥')
                );

                await interaction.editReply({ content: "✅ تم الدفع بنجاح! اختر الوضع من الرسالة أدناه 👇" });

                await interaction.channel.send({
                    content: `✅ **تم دفع ${COST} مورا من قبل <@${interaction.user.id}>!**\nالآن اختر شخصيتي لهذا اليوم (لمدة 24 ساعة):`,
                    components: [modeButtons]
                });
            }

            else if (interaction.customId === 'ai_mode_select_sfw' || interaction.customId === 'ai_mode_select_nsfw') {
                await interaction.deferUpdate();

                const mode = interaction.customId.includes('nsfw') ? 'NSFW' : 'SFW';
                
                aiConfig.setPaidChannel(guildID, interaction.channel.id, mode);

                await interaction.editReply({
                    content: `🔓 **تم تفعيل الشات بوضع ${mode}!**\nاستمتعوا لمدة 24 ساعة مع الإمبراطورة. ⏳`,
                    components: [] 
                });
            }

        } catch (error) {
            console.error('[AI Button Error]', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '❌ حدث خطأ أثناء معالجة الطلب.', flags: [MessageFlags.Ephemeral] });
            } else {
                await interaction.followUp({ content: '❌ حدث خطأ أثناء معالجة الطلب.', flags: [MessageFlags.Ephemeral] }).catch(() => {});
            }
        }
    }
};
