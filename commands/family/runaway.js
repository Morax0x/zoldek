const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, Colors } = require("discord.js");

const RUNAWAY_FEE = 1000; 
const MORA_EMOJI = '<:mora:1435647151349698621>'; 
const RUNAWAY_GIF = "https://media.tenor.com/ScoBC7-a5QkAAAAC/anime-run.gif"; 

// 🛡️ نظام معالجة استعلامات فولاذي وذكي للحماية من الانهيارات 🛡️
const safeQuery = async (db, qPg, params) => {
    let res;
    try { 
        res = await db.query(qPg, params); 
    } catch(e) { 
        res = { rows: [] }; 
    }

    const rows1 = Array.isArray(res) ? res : (res?.rows || []);
    if (rows1.length > 0) return { rows: rows1 };

    let fallbackQuery = qPg
        .replace(/"userID"/gi, "userid")
        .replace(/"guildID"/gi, "guildid")
        .replace(/"parentID"/gi, "parentid")
        .replace(/"childID"/gi, "childid");

    if (fallbackQuery !== qPg) {
        try { 
            let res2 = await db.query(fallbackQuery, params); 
            const rows2 = Array.isArray(res2) ? res2 : (res2?.rows || []);
            return { rows: rows2 };
        } catch(e2) { }
    }
    
    return { rows: [] };
};

const safeExecute = async (db, qPg, params) => {
    try { await db.query(qPg, params); return true; } catch(e) { 
        let fallbackQuery = qPg
            .replace(/"userID"/gi, "userid")
            .replace(/"guildID"/gi, "guildid")
            .replace(/"parentID"/gi, "parentid")
            .replace(/"childID"/gi, "childid");

        if (fallbackQuery !== qPg) {
            try { await db.query(fallbackQuery, params); return true; } catch(e2) { return false; }
        }
        return false;
    }
};

module.exports = {
    name: 'runaway',
    description: 'الهروب من العائلة (يتم دفع الرسوم للوالدين كتعويض)',
    aliases: ['هروب', 'استقلال', 'escape'],

    async execute(message, args) {
        const client = message.client;
        const db = client.sql;
        const guildId = message.guild.id;
        const userId = message.author.id;

        const replyTemp = async (content) => {
            const msg = await message.reply(content);
            setTimeout(() => msg.delete().catch(() => {}), 5000);
        };

        const res = await safeQuery(db, `SELECT "parentID" FROM children WHERE "childID" = $1 AND "guildID" = $2`, [userId, guildId]);
        const parents = res.rows;

        if (parents.length === 0) {
            return replyTemp("🚫 **أنت لست ابناً لأحد!** أنت حر طليق بالفعل 🦅.");
        }

        let userData = await client.getLevel(userId, guildId);
        if (!userData) userData = { id: `${guildId}-${userId}`, user: userId, guild: guildId, xp: 0, level: 1, mora: 0 };
        userData.mora = Number(userData.mora) || 0;

        if (userData.mora < RUNAWAY_FEE) {
            return replyTemp(`💸 **لا تملك تكلفة الاستقلال!**\nتحتاج إلى **${RUNAWAY_FEE.toLocaleString()}** ${MORA_EMOJI} لتعويض والديك.`);
        }

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('confirm_run').setLabel('نعم، سأهرب!').setStyle(ButtonStyle.Danger).setEmoji('🏃‍♂️'),
            new ButtonBuilder().setCustomId('cancel_run').setLabel('تراجع').setStyle(ButtonStyle.Secondary)
        );

        const embed = new EmbedBuilder()
            .setColor(Colors.Orange)
            .setTitle(`🏃‍♂️ قرار الهروب من العائلة`)
            .setDescription(
                `هل أنت متأكد أنك تريد الهروب من والديك والتخلي عن اسم العائلة؟\n\n` +
                `⚠️ **النتيجة:** سيتم حذف اسمك من سجلات العائلة فوراً.\n` +
                `💸 **التكلفة:** سيتم خصم **${RUNAWAY_FEE.toLocaleString()}** ${MORA_EMOJI} وتحويلها لوالديك كتعويض.\n\n` +
                `*هذا القرار نهائي ولا يمكن التراجع عنه.*`
            )
            .setThumbnail(message.author.displayAvatarURL());

        const confirmMsg = await message.reply({ embeds: [embed], components: [row] });

        const filter = i => i.user.id === userId;
        const collector = confirmMsg.createMessageComponentCollector({ filter, time: 60000, max: 1 });

        collector.on('collect', async i => {
            if (i.customId === 'cancel_run') {
                await i.update({ content: `✅ **تراجعت عن الهروب.** العائلة هي السند!`, embeds: [], components: [] });
                return;
            }

            if (i.customId === 'confirm_run') {
                userData = await client.getLevel(userId, guildId);
                userData.mora = Number(userData.mora) || 0;

                if (userData.mora < RUNAWAY_FEE) {
                    return i.update({ content: `❌ **فشلت الخطة:** ليس لديك مال كافٍ للتعويض!`, embeds: [], components: [] });
                }

                try {
                    await db.query('BEGIN');

                    userData.mora -= RUNAWAY_FEE;
                    await client.setLevel(userData);

                    const amountPerParent = Math.floor(RUNAWAY_FEE / parents.length);

                    for (const p of parents) {
                        const pid = p.parentID || p.parentid;
                        let parentData = await client.getLevel(pid, guildId);
                        if (!parentData) parentData = { id: `${guildId}-${pid}`, user: pid, guild: guildId, xp: 0, level: 1, mora: 0 };
                        
                        parentData.mora = (Number(parentData.mora) || 0) + amountPerParent;
                        await client.setLevel(parentData);
                    }

                    await safeExecute(db, `DELETE FROM children WHERE "childID" = $1 AND "guildID" = $2`, [userId, guildId]);

                    await db.query('COMMIT');

                    const successEmbed = new EmbedBuilder()
                        .setColor(Colors.Red)
                        .setTitle(`🦅 تم الهروب بنجاح!`)
                        .setDescription(
                            `قام **${message.member.displayName}** بالهروب من عائلته وأصبح مستقلاً!\n` +
                            `💸 **التعويض:** تم تحويل **${amountPerParent.toLocaleString()}** ${MORA_EMOJI} لكل والد.`
                        )
                        .setImage(RUNAWAY_GIF);

                    await i.update({ content: `💔 **انقطعت صلة الرحم..**`, embeds: [successEmbed], components: [] });

                } catch (error) {
                    await db.query('ROLLBACK').catch(()=>{});
                    console.error("Runaway Error:", error);
                    return i.update({ content: `❌ حدث خطأ داخلي أثناء عملية الهروب.`, embeds: [], components: [] }).catch(()=>{});
                }
            }
        });

        collector.on('end', (c, reason) => {
            if (reason === 'time') {
                confirmMsg.edit({ content: `⏳ **انتهى الوقت..** يبدو أنك خفت من العقاب.`, embeds: [], components: [] }).catch(()=>{});
            }
        });
    }
};
