const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, Colors } = require("discord.js");

const TOTAL_DISOWN_FEE = 2000;
const MORA_EMOJI = '<:mora:1435647151349698621>'; 
const DISOWN_GIF = "https://media.tenor.com/images/3f3d3263013697669536067759367295/tenor.gif"; 
const BOT_REJECT_IMAGE = "https://i.postimg.cc/0jQvvNNh/fort.jpg"; 

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
        .replace(/"childID"/gi, "childid")
        .replace(/"partnerID"/gi, "partnerid");

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
            .replace(/"childID"/gi, "childid")
            .replace(/"partnerID"/gi, "partnerid");

        if (fallbackQuery !== qPg) {
            try { await db.query(fallbackQuery, params); return true; } catch(e2) { return false; }
        }
        return false;
    }
};

module.exports = {
    name: 'disown',
    description: 'التبرؤ من ابن وطرده من العائلة (يتطلب موافقة الشريك ودفع تعويض للابن)',
    aliases: ['تبرؤ', 'طرد-ابن', 'kickchild'],

    async execute(message, args) {
        const client = message.client;
        const db = client.sql;
        const guildId = message.guild.id;
        const userId = message.author.id;
        const OWNER_ID = "1145327691772481577"; 

        const replyTemp = async (content) => {
            const msg = await message.reply(content);
            setTimeout(() => msg.delete().catch(() => {}), 8000); 
        };

        if (args[0] === 'clean' || args[0] === 'تنظيف') {
            const childrenRes = await safeQuery(db, `SELECT "childID" FROM children WHERE "parentID" = $1 AND "guildID" = $2`, [userId, guildId]);
            
            let removed = 0;
            for (const row of childrenRes.rows) {
                const cId = row.childID || row.childid;
                const member = await message.guild.members.fetch(cId).catch(()=>null);
                if (!member) {
                    await safeExecute(db, `DELETE FROM children WHERE "childID" = $1 AND "guildID" = $2`, [cId, guildId]);
                    removed++;
                }
            }
            
            if (removed > 0) {
                return replyTemp(`🧹 **تم التنظيف بنجاح!**\nتم مسح **${removed}** أبناء معلقين غادروا السيرفر من شجرة عائلتك.`);
            } else {
                return replyTemp(`✅ **شجرة عائلتك نظيفة!** جميع أبنائك متواجدون في السيرفر.`);
            }
        }

        let childMember = message.mentions.members.first();
        if (!childMember && args[0]) {
            const cleanId = args[0].replace(/[<@!>]/g, '');
            childMember = await message.guild.members.fetch(cleanId).catch(()=>null);
        }

        if (!childMember) {
            return replyTemp(`❌ **خطأ في الاستخدام!**\nعليك تحديد الابن: \`!disown @الابن\`\nأو للتنظيف: \`!disown clean\``);
        }

        if (childMember.id === client.user.id || childMember.id === OWNER_ID) {
            return message.reply({ content: "❌ لا يمكنك التبرؤ من أسياد القلعة!", files: [BOT_REJECT_IMAGE] }).catch(()=>{});
        }

        const isMyChildRes = await safeQuery(db, `SELECT 1 FROM children WHERE "parentID" = $1 AND "childID" = $2 AND "guildID" = $3`, [userId, childMember.id, guildId]);
        
        if (isMyChildRes.rows.length === 0) {
            return replyTemp(`🚫 **${childMember.displayName}** ليس مسجلاً كابن لك في السجلات.`);
        }

        let partnerId = null;
        const marriageDataRes = await safeQuery(db, `SELECT "partnerID" FROM marriages WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId]);
            
        if (marriageDataRes.rows.length > 0) {
            partnerId = marriageDataRes.rows[0].partnerID || marriageDataRes.rows[0].partnerid;
        }
        
        let partnerMember = partnerId ? await message.guild.members.fetch(partnerId).catch(() => null) : null;

        const feePerPerson = partnerMember ? (TOTAL_DISOWN_FEE / 2) : TOTAL_DISOWN_FEE;

        async function performDisown(interaction, parentIds, childId, amountPerPerson) {
            try {
                await db.query('BEGIN');

                for (const pid of parentIds) {
                    const pData = await client.getLevel(pid, guildId);
                    if (!pData || (Number(pData.mora) || 0) < amountPerPerson) {
                        await db.query('ROLLBACK').catch(()=>{});
                        return interaction.update({ content: `❌ **فشلت العملية:** أحد الآباء لا يملك مورا كافية للتعويض!`, embeds: [], components: [] });
                    }
                    pData.mora = (Number(pData.mora) || 0) - amountPerPerson;
                    await client.setLevel(pData);
                }

                let childData = await client.getLevel(childId, guildId);
                if (!childData) childData = { id: `${guildId}-${childId}`, user: childId, guild: guildId, xp: 0, level: 1, mora: 0 };
                
                const totalCompensation = amountPerPerson * parentIds.length; 
                childData.mora = (Number(childData.mora) || 0) + totalCompensation;
                await client.setLevel(childData);

                // طرد الطفل تماماً من العائلة بمسح جميع القيود التي تربطه بها
                await safeExecute(db, `DELETE FROM children WHERE "childID" = $1 AND "guildID" = $2`, [childId, guildId]);

                await db.query('COMMIT');

                const successEmbed = new EmbedBuilder()
                    .setColor(Colors.Red)
                    .setTitle(`🚷 تم التبرؤ من الابن`)
                    .setDescription(`تم طرد **${childMember.displayName}** من العائلة.\n💸 تم منح الابن **${totalCompensation.toLocaleString()}** ${MORA_EMOJI} كتعويض إجباري.`)
                    .setImage(DISOWN_GIF);

                await interaction.update({ content: null, embeds: [successEmbed], components: [] });

            } catch (error) {
                await db.query('ROLLBACK').catch(()=>{});
                console.error("Disown Error:", error);
                return interaction.update({ content: `❌ حدث خطأ في النظام أثناء العملية.`, embeds: [], components: [] }).catch(()=>{});
            }
        }

        if (partnerMember) {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('confirm').setLabel(`موافقة ودفع ${feePerPerson}`).setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('cancel').setLabel('رفض').setStyle(ButtonStyle.Secondary)
            );

            const confirmMsg = await message.channel.send({
                content: `${partnerMember}`,
                embeds: [new EmbedBuilder()
                    .setTitle('🚷 تصويت على طرد ابن')
                    .setDescription(`يريد ${message.author} التبرؤ من **${childMember}**.\nيجب على كل منكما دفع **${feePerPerson}** ${MORA_EMOJI}.\nهل توافق يا ${partnerMember}؟`)
                    .setColor(Colors.Orange)
                ],
                components: [row]
            });

            const collector = confirmMsg.createMessageComponentCollector({ filter: i => i.user.id === partnerId, time: 60000, max: 1 });

            collector.on('collect', async i => {
                if (i.customId === 'cancel') return i.update({ content: "✅ تم إلغاء قرار الطرد.", embeds: [], components: [] });
                await performDisown(i, [userId, partnerId], childMember.id, feePerPerson);
            });
            
            collector.on('end', (collected, reason) => {
                if (reason === 'time') {
                    confirmMsg.edit({ content: `⏳ **انتهى الوقت!** الشريك لم يستجب، تم إلغاء الطلب.`, components: [], embeds: [] }).catch(()=>{});
                }
            });
            
        } else {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('solo_confirm').setLabel(`تأكيد الطرد ودفع ${feePerPerson}`).setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('solo_cancel').setLabel('تراجع').setStyle(ButtonStyle.Secondary)
            );

            const soloMsg = await message.reply({
                embeds: [new EmbedBuilder()
                    .setTitle('⚠️ تأكيد التبرؤ')
                    .setDescription(`هل أنت متأكد من طرد **${childMember.displayName}**؟\nستدفع تعويضاً قدره **${feePerPerson}** ${MORA_EMOJI}.`)
                    .setColor(Colors.DarkRed)
                ],
                components: [row]
            });

            const collector = soloMsg.createMessageComponentCollector({ filter: i => i.user.id === userId, time: 60000, max: 1 });

            collector.on('collect', async i => {
                if (i.customId === 'solo_cancel') return i.update({ content: "✅ تم التراجع عن الطرد.", embeds: [], components: [] });
                await performDisown(i, [userId], childMember.id, feePerPerson);
            });
            
            collector.on('end', (collected, reason) => {
                if (reason === 'time') {
                    soloMsg.edit({ content: `⏳ **انتهى الوقت!** تم إلغاء الطلب.`, components: [], embeds: [] }).catch(()=>{});
                }
            });
        }
    }
};
