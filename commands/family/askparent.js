const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, Colors } = require("discord.js");

const BASE_ADOPT_FEE = 2000; 
const BASE_CHILDREN_LIMIT = 10;
const MORA_EMOJI = '<:mora:1435647151349698621>'; 

const SUCCESS_IMAGES = [
    "https://i.postimg.cc/NFjJ9WGf/09888ef8ca948e79af1de55c4133ba56.gif",
    "https://i.postimg.cc/xTJH3zXK/c064b5f4ff5d6e75f98cc79f7f605e80.gif",
    "https://i.postimg.cc/zvMh1Jcn/0206387ccc342eedf921c7514b1f0fb6.gif",
    "https://i.postimg.cc/s295ZCM3/958ec02e67fbb4e4c641b61612709095.gif"
];

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
        .replace(/"partnerID"/gi, "partnerid")
        .replace(/"adoptDate"/gi, "adoptdate");

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
            .replace(/"partnerID"/gi, "partnerid")
            .replace(/"adoptDate"/gi, "adoptdate");

        if (fallbackQuery !== qPg) {
            try { await db.query(fallbackQuery, params); return true; } catch(e2) { return false; }
        }
        return false;
    }
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('askparent')
        .setDescription('طلب من شخص أن يتبناك (تصبح ابنه).')
        .addUserOption(option => 
            option.setName('parent')
                .setDescription('الشخص الذي تريد أن يكون والدك')
                .setRequired(true)),

    name: 'askparent',
    aliases: ['اب', 'طلب-اب', 'ام', 'bechild'],
    category: "Family",
    description: "طلب الانضمام لعائلة كابن.",

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, user, parentUser, channel, client;

        if (isSlash) {
            interaction = interactionOrMessage;
            user = interaction.user;
            parentUser = interaction.options.getUser('parent');
            channel = interaction.channel;
            client = interaction.client;
            await interaction.deferReply();
        } else {
            message = interactionOrMessage;
            user = message.author;
            parentUser = message.mentions.users.first() || client.users.cache.get(args[0]);
            channel = message.channel;
            client = message.client;
        }

        const reply = async (payload, autoDelete = false) => {
            let msg;
            if (isSlash) msg = await interaction.editReply(payload);
            else msg = await message.reply(payload);

            if (autoDelete) {
                setTimeout(() => msg.delete().catch(() => {}), 8000);
            }
            return msg;
        };

        const db = client.sql;
        const guildId = isSlash ? interaction.guild.id : message.guild.id;

        if (!parentUser) return reply("❌ يرجى تحديد الأب/الأم المحتمل!", true);
        if (parentUser.bot) return reply("🤖 الروبوتات لا تتبنى البشر!", true);
        if (parentUser.id === user.id) return reply("❌ لا يمكنك تبني نفسك!", true);

        // 🔥 فحص الزيجات لحساب الحد الأقصى للأبناء لولي الأمر المحتمل 🔥
        const marriagesRes = await safeQuery(db, `SELECT "partnerID" FROM marriages WHERE "userID" = $1 AND "guildID" = $2`, [parentUser.id, guildId]);
        const numberOfSpouses = marriagesRes.rows.length;
        
        // حد الأبناء: 10 للأعزب، 20 لمتزوج واحد، 30 لمتزوج اثنين... الخ
        const maxChildrenAllowed = BASE_CHILDREN_LIMIT * (numberOfSpouses + 1);

        let parentsChildrenCount = 0;
        const countRes = await safeQuery(db, `SELECT count(*) as count FROM children WHERE "parentID" = $1 AND "guildID" = $2`, [parentUser.id, guildId]);
        parentsChildrenCount = Number(countRes.rows[0]?.count || 0);
        
        if (parentsChildrenCount >= maxChildrenAllowed) {
            return reply(`🚫 **${parentUser.username}** لديه الحد الأقصى من الأطفال (${maxChildrenAllowed})!`, true);
        }

        const dynamicFee = BASE_ADOPT_FEE + (parentsChildrenCount * 2000);

        let childData = await client.getLevel(user.id, guildId);
        if (!childData) childData = { id: `${guildId}-${user.id}`, user: user.id, guild: guildId, xp: 0, level: 1, mora: 0 };
        childData.mora = Number(childData.mora) || 0;

        if (childData.mora < dynamicFee) {
            return reply(`💸 **ليس لديك مورا كافية!**\nتكلفة الانضمام لعائلة **${parentUser.username}** هي: **${dynamicFee.toLocaleString()}** ${MORA_EMOJI} (بناءً على عدد أفراد العائلة الحاليين).`, true);
        }

        const existingParentRes = await safeQuery(db, `SELECT "parentID" FROM children WHERE "childID" = $1 AND "guildID" = $2 LIMIT 1`, [user.id, guildId]);
        if (existingParentRes.rows.length > 0) return reply("❌ **لديك عائلة بالفعل!** لا يمكنك البحث عن أب جديد وأنت على ذمة عائلة.", true);

        const isHeMyChildRes = await safeQuery(db, `SELECT 1 FROM children WHERE "parentID" = $1 AND "childID" = $2 LIMIT 1`, [user.id, parentUser.id]);
        if (isHeMyChildRes.rows.length > 0) return reply("😵‍💫 **لا يعقل!** هذا الشخص هو ابنك، كيف تطلب منه أن يتبناك؟", true);

        const marriageCheckRes = await safeQuery(db, `SELECT "partnerID" FROM marriages WHERE "userID" = $1 AND "guildID" = $2 LIMIT 1`, [user.id, guildId]);
        const marriageCheck = marriageCheckRes.rows[0];
        if (marriageCheck && (marriageCheck.partnerID === parentUser.id || marriageCheck.partnerid === parentUser.id)) {
            return reply("🚫 لا يمكنك أن تكون ابناً لشريك حياتك!", true);
        }

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('accept_child').setLabel('قبول الانضمام ✅').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('decline_child').setLabel('رفض ❌').setStyle(ButtonStyle.Danger)
        );

        const embed = new EmbedBuilder()
            .setTitle('📜 طلب انضمام للعائلة')
            .setDescription(
                `يا **${parentUser}**،\n` +
                `يتقدم **${user}** بطلب رسمي للانضمام لعائلتك كابن لك.\n\n` +
                `💰 **رسوم التسجيل:** سيدفع الابن **${dynamicFee.toLocaleString()}** ${MORA_EMOJI} كهدية لك.\n` +
                `📊 **حجم العائلة الحالي:** ${parentsChildrenCount} / ${maxChildrenAllowed}`
            )
            .setColor(Colors.Gold)
            .setThumbnail(user.displayAvatarURL())
            .setFooter({ text: 'نظام العائلة • الإمبراطورية' });

        const msgContent = { content: `${parentUser}`, embeds: [embed], components: [row] };
        const msg = isSlash ? await interaction.editReply(msgContent) : await channel.send(msgContent);

        const filter = i => i.user.id === parentUser.id;
        const collector = msg.createMessageComponentCollector({ filter, componentType: ComponentType.Button, time: 60000 });

        collector.on('collect', async i => {
            if (i.customId === 'decline_child') {
                await i.update({ content: `💔 **رفض الأب الطلب.** حظاً أوفر في المرة القادمة.`, embeds: [], components: [] });
                return;
            }

            if (i.customId === 'accept_child') {
                childData = await client.getLevel(user.id, guildId);
                childData.mora = Number(childData.mora) || 0;

                if (childData.mora < dynamicFee) {
                    return i.update({ content: `❌ **فشلت العملية:** الابن أفلس أثناء الانتظار!`, embeds: [], components: [] });
                }

                let parentText = "";
                const randomImage = SUCCESS_IMAGES[Math.floor(Math.random() * SUCCESS_IMAGES.length)];
                
                try {
                    await db.query('BEGIN');

                    childData.mora -= dynamicFee;
                    await client.setLevel(childData);

                    let parentData = await client.getLevel(parentUser.id, guildId);
                    if (!parentData) parentData = { id: `${guildId}-${parentUser.id}`, user: parentUser.id, guild: guildId, xp: 0, level: 1, mora: 0 };
                    parentData.mora = (Number(parentData.mora) || 0) + dynamicFee;
                    await client.setLevel(parentData);

                    const now = Date.now();
                    await db.query(`INSERT INTO children ("parentID", "childID", "adoptDate", "guildID") VALUES ($1, $2, $3, $4)`, [parentUser.id, user.id, now, guildId]);

                    const parentMarRes = await safeQuery(db, `SELECT "partnerID" FROM marriages WHERE "userID" = $1 AND "guildID" = $2`, [parentUser.id, guildId]);
                    const parentMarriage = parentMarRes.rows[0];
                    
                    if (parentMarriage) {
                        const partnerId = parentMarriage.partnerID || parentMarriage.partnerid;
                        const checkPartnerChild = await safeQuery(db, `SELECT 1 FROM children WHERE "parentID" = $1 AND "childID" = $2`, [partnerId, user.id]);
                        if (checkPartnerChild.rows.length === 0) {
                            await safeExecute(db, `INSERT INTO children ("parentID", "childID", "adoptDate", "guildID") VALUES ($1, $2, $3, $4)`, [partnerId, user.id, now, guildId]);
                            parentText = " وشريكه";
                        }
                    }

                    await db.query('COMMIT');
                } catch (e) {
                    await db.query('ROLLBACK').catch(()=>{});
                    console.error("Askparent Database Error:", e);
                    return i.update({ content: `❌ حدث خطأ داخلي أثناء معالجة الطلب.`, embeds: [], components: [] });
                }

                const successEmbed = new EmbedBuilder()
                    .setColor('Random') 
                    .setTitle('🎉 تـبـنـي نـاجـح')
                    .setDescription(`أصبح **${user}** رسمياً ابناً لـ **${parentUser}**${parentText}!\nتم تحويل **${dynamicFee.toLocaleString()}** ${MORA_EMOJI} لولـي الامـر`)
                    .setImage(randomImage); 

                await i.update({ content: `||${user} ${parentUser}||`, embeds: [successEmbed], components: [] });
            }
        });

        collector.on('end', (c, reason) => {
            if (reason === 'time') msg.edit({ content: '⏳ انتهى وقت الطلب.', components: [], embeds: [] }).catch(()=>{});
        });
    }
};
