const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, Colors } = require("discord.js");

const MORA_EMOJI = '<:mora:1435647151349698621>';
const BASE_CHILDREN_LIMIT = 10;
const BASE_ADOPT_FEE = 2000;

const SUCCESS_IMAGES = [
    "https://i.postimg.cc/NFjJ9WGf/09888ef8ca948e79af1de55c4133ba56.gif",
    "https://i.postimg.cc/rmK7wjp0/9b69370e7a44d135d98fa1c5c3cdd14f.gif",
    "https://i.postimg.cc/3wrPPY5j/072c330217a59b0edf061c88669d663b.gif",
    "https://i.postimg.cc/htnF1VCW/dd75d02bb40ac5721b7357b33d735489.gif"
];

const BOT_REJECT_IMAGE = "https://i.postimg.cc/qvDt3BLj/106a40ccbff92cbaf02fd54ba9de5ebc.gif";
const OWNER_ID = "1145327691772481577"; 

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
    name: 'adopt',
    description: 'تبني عضو جديد في العائلة (بشروط صارمة لمنع تداخل الأنساب)',
    aliases: ['تبني', 'ضم'],

    async execute(message, args) {
        const client = message.client;
        const db = client.sql;
        const guildId = message.guild.id;
        const userId = message.author.id;

        const replyTemp = async (content) => {
            const msg = await message.reply(content);
            setTimeout(() => msg.delete().catch(() => {}), 8000); 
        };

        const childMember = message.mentions.members.first() || message.guild.members.cache.get(args[0]);

        if (!childMember) {
            return replyTemp(`❌ **خطأ في الاستخدام!**\nالطريقة الصحيحة: \`${message.content.split(' ')[0]} @الطفل\`\nمثال: \`!adopt @user\``);
        }

        if (childMember.id === client.user.id || childMember.id === OWNER_ID) {
            await message.reply({ files: [BOT_REJECT_IMAGE] });
            if (message.member.moderatable) {
                try {
                    await message.member.timeout(60 * 1000, "محاولة تبني غير قانونية (تطاول على المقامات)");
                } catch (e) {}
            }
            return;
        }

        if (childMember.id === userId) return replyTemp("❌ لا يمكنك تبني نفسك!");
        if (childMember.user.bot) return replyTemp("🤖 لا يمكنك تبني الروبوتات!");

        await safeExecute(db, `CREATE TABLE IF NOT EXISTS children ("parentID" TEXT, "childID" TEXT, "adoptDate" BIGINT, "guildID" TEXT)`, []);
        
        let currentChildrenCount = 0;
        const countRes = await safeQuery(db, `SELECT count(*) as count FROM children WHERE "parentID" = $1 AND "guildID" = $2`, [userId, guildId]);
        currentChildrenCount = Number(countRes.rows[0]?.count || 0);

        // 🔥 فحص الزيجات لحساب الحد الأقصى للأبناء 🔥
        const marriagesRes = await safeQuery(db, `SELECT "partnerID" FROM marriages WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId]);
        const numberOfSpouses = marriagesRes.rows.length;
        
        // حد الأبناء: 10 للأعزب، 20 لمتزوج واحد، 30 لمتزوج اثنين... الخ
        const maxChildrenAllowed = BASE_CHILDREN_LIMIT * (numberOfSpouses + 1);

        if (currentChildrenCount >= maxChildrenAllowed) {
            return replyTemp(`🚫 **لقد وصلت للحد الأقصى من الأطفال (${maxChildrenAllowed})!**\nعليك التبرؤ من أحدهم أولاً باستخدام أمر \`!disown @الابن\``);
        }

        const fee = BASE_ADOPT_FEE + (currentChildrenCount * 2000);
        let authorData = await client.getLevel(userId, guildId);
        if (!authorData) authorData = { id: `${guildId}-${userId}`, user: userId, guild: guildId, xp: 0, level: 1, mora: 0 };
        authorData.mora = Number(authorData.mora) || 0;

        if (authorData.mora < fee) {
            return replyTemp(`💸 **ليس لديك مورا كافية!**\nالرسوم: **${fee.toLocaleString()}** ${MORA_EMOJI}`);
        }
        
        // سنأخذ الشريك الأول للموافقة عليه في حال كان متزوجاً
        let partnerId = numberOfSpouses > 0 ? (marriagesRes.rows[0].partnerID || marriagesRes.rows[0].partnerid) : null;

        if (partnerId === childMember.id) return replyTemp("🚫 **لا يمكنك تبني شريك حياتك!**");

        const cpRes = await safeQuery(db, `SELECT "parentID" FROM children WHERE "childID" = $1 AND "guildID" = $2`, [childMember.id, guildId]);
        const currentParents = cpRes.rows;
        
        if (currentParents.length > 0) {
            let isStepParent = false;
            for (const row of currentParents) {
                const pId = row.parentID || row.parentid;
                if (pId === userId) {
                    return replyTemp(`❌ **${childMember.displayName}** هو ابنك بالفعل!`);
                }
                const parentSpouseRes = await safeQuery(db, `SELECT "partnerID" FROM marriages WHERE "userID" = $1 AND "guildID" = $2`, [pId, guildId]);
                const pSpouse = parentSpouseRes.rows[0];
                if (pSpouse && (pSpouse.partnerID === userId || pSpouse.partnerid === userId)) {
                    isStepParent = true;
                    break;
                }
            }

            if (!isStepParent) {
                return replyTemp(`🚫 **لا يمكن إتمام العملية!**\n**${childMember.displayName}** لديه عائلة بالفعل (أب/أم).\nلا يمكنك تبنيه إلا إذا كنت متزوجاً من والده/والدته الحاليين لإكمال العائلة.`);
            }
        }

        let queue = [userId]; 
        let checked = new Set();
        
        while (queue.length > 0) {
            let current = queue.shift();
            if (checked.has(current)) continue;
            checked.add(current);

            const parentsRes = await safeQuery(db, `SELECT "parentID" FROM children WHERE "childID" = $1 AND "guildID" = $2`, [current, guildId]);
            for (const p of parentsRes.rows) {
                const pId = p.parentID || p.parentid;
                if (pId === childMember.id) {
                    return replyTemp(`🚫 **لا يعقل!** كيف تتبنى **${childMember.displayName}** وهو (أبوك/جدك)؟ احترم المقامات.`);
                }
                if (!checked.has(pId)) queue.push(pId);
            }
            if (checked.size > 20) break; 
        }

        queue = [userId];
        checked = new Set();
        let myDescendants = new Set();

        while (queue.length > 0) {
            let current = queue.shift();
            if (checked.has(current)) continue;
            checked.add(current);

            const childrenRes = await safeQuery(db, `SELECT "childID" FROM children WHERE "parentID" = $1 AND "guildID" = $2`, [current, guildId]);
            for (const c of childrenRes.rows) {
                const cId = c.childID || c.childid;
                myDescendants.add(cId);
                if (cId === childMember.id) {
                    return replyTemp(`🚫 **هذا من نسلك!**\n**${childMember.displayName}** موجود بالفعل في شجرة عائلتك (حفيد أو حفيد حفيد..).\nهو مربوط بك بالدم ولا يحتاج لتبني.`);
                }
                if (!checked.has(cId)) queue.push(cId);
            }
            if (checked.size > 50) break;
        }

        const mpRes = await safeQuery(db, `SELECT "parentID" FROM children WHERE "childID" = $1 AND "guildID" = $2`, [userId, guildId]);
        const myParents = mpRes.rows.map(r => r.parentID || r.parentid);
        
        const cpParentsRes = await safeQuery(db, `SELECT "parentID" FROM children WHERE "childID" = $1 AND "guildID" = $2`, [childMember.id, guildId]);
        const childParents = cpParentsRes.rows.map(r => r.parentID || r.parentid);
        
        if (myParents.some(p => childParents.includes(p))) {
            return replyTemp(`🚫 **لا يعقل!** كيف تتبنى أخاك/أختك؟`);
        }

        const targetSpouseRes = await safeQuery(db, `SELECT "partnerID" FROM marriages WHERE "userID" = $1 AND "guildID" = $2`, [childMember.id, guildId]);
        const targetSpouse = targetSpouseRes.rows[0];
        if (targetSpouse && myDescendants.has(targetSpouse.partnerID || targetSpouse.partnerid)) {
            return replyTemp(`🚫 **هذه زوجة ابنك / زوج ابنتك!**\nلا يمكن تبني أصهارك الموجودين في شجرة العائلة.`);
        }

        if (partnerId) {
            const partnerMember = await message.guild.members.fetch(partnerId).catch(() => null);
            if (!partnerMember) return replyTemp("❌ شريكك غير موجود في السيرفر!");

            const rowPartner = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('partner_approve').setLabel('موافقة (شريك)').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('partner_reject').setLabel('رفض').setStyle(ButtonStyle.Danger)
            );

            const partnerMsg = await message.channel.send({
                content: `${partnerMember}`,
                embeds: [new EmbedBuilder()
                    .setColor(Colors.Gold)
                    .setTitle('👨‍👩‍👧‍👦 قرار عائلي مشترك')
                    .setDescription(`**${message.member.displayName}** يريد تبني **${childMember.displayName}**.\nهل توافق على انضمام هذا الطفل للعائلة؟`)
                ],
                components: [rowPartner]
            });

            try {
                const confirmation = await partnerMsg.awaitMessageComponent({ 
                    filter: i => i.user.id === partnerId, 
                    time: 60000,
                    componentType: ComponentType.Button 
                });

                if (confirmation.customId === 'partner_reject') {
                    await confirmation.update({ content: `🚫 **${partnerMember.displayName}** رفض التبني.`, embeds: [], components: [] });
                    return;
                }
                
                await confirmation.update({ content: `✅ **وافق الشريك!** الآن ننتظر موافقة الطفل...`, components: [] });

            } catch (e) {
                return partnerMsg.edit({ content: `⏳ **انتهى الوقت!** لم يرد الشريك.`, components: [], embeds: [] });
            }
        }

        const rowChild = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('child_accept').setLabel('أقبل التبني').setStyle(ButtonStyle.Primary).setEmoji('👶'),
            new ButtonBuilder().setCustomId('child_reject').setLabel('أرفض').setStyle(ButtonStyle.Secondary)
        );

        const childMsg = await message.channel.send({
            content: `${childMember}`,
            embeds: [new EmbedBuilder()
                .setColor(Colors.Blue)
                .setTitle('🏠 عرض تبني')
                .setDescription(
                    `عرض عليك **${message.member.displayName}** ${partnerId ? `وشريكه` : ``} الانضمام لعائلتهم!\n` +
                    `هل تقبل أن تكون ابنهم؟\n\n` +
                    `💰 **هدية التبني:** سيتم تحويل **${fee.toLocaleString()}** ${MORA_EMOJI} لك!`
                )
            ],
            components: [rowChild]
        });

        try {
            const childConfirm = await childMsg.awaitMessageComponent({
                filter: i => i.user.id === childMember.id,
                time: 60000,
                componentType: ComponentType.Button
            });

            if (childConfirm.customId === 'child_reject') {
                await childConfirm.update({ content: `💔 رفض **${childMember.displayName}** العرض.`, embeds: [], components: [] });
                return;
            }
            
            authorData = await client.getLevel(userId, guildId);
            authorData.mora = Number(authorData.mora) || 0;

            if (authorData.mora < fee) {
                return childConfirm.update({ content: `❌ **فشلت العملية:** الأب مفلس!`, components: [], embeds: [] });
            }

            authorData.mora -= fee;
            await client.setLevel(authorData);

            let childData = await client.getLevel(childMember.id, guildId);
            if (!childData) childData = { id: `${guildId}-${childMember.id}`, user: childMember.id, guild: guildId, xp: 0, level: 1, mora: 0 };
            childData.mora = Number(childData.mora) || 0;
            childData.mora += fee;
            await client.setLevel(childData);

            const now = Date.now();
            await safeExecute(db, `INSERT INTO children ("parentID", "childID", "adoptDate", "guildID") VALUES ($1, $2, $3, $4)`, [userId, childMember.id, now, guildId]);

            if (partnerId) {
                const checkPartnerRes = await safeQuery(db, `SELECT 1 FROM children WHERE "parentID" = $1 AND "childID" = $2`, [partnerId, childMember.id]);
                if (checkPartnerRes.rows.length === 0) {
                    await safeExecute(db, `INSERT INTO children ("parentID", "childID", "adoptDate", "guildID") VALUES ($1, $2, $3, $4)`, [partnerId, childMember.id, now, guildId]);
                }
            }

            const randomImage = SUCCESS_IMAGES[Math.floor(Math.random() * SUCCESS_IMAGES.length)];

            const successEmbed = new EmbedBuilder()
                .setColor('Random') 
                .setTitle(`🎉 تهانينا للعائلة الجديدة!`)
                .setDescription(
                    `أصبح **${childMember.displayName}** رسمياً ابن **${message.member.displayName}** ${partnerId ? `وشريكه` : ``}!\n` +
                    `🎁 **هدية:** تم تحويل **${fee.toLocaleString()}** ${MORA_EMOJI} للطفل.`
                )
                .setImage(randomImage);

            await childConfirm.update({
                content: `||${message.author} ${childMember}||`,
                embeds: [successEmbed],
                components: []
            });

        } catch (e) {
            childMsg.edit({ content: `⏳ **انتهى الوقت..** الطفل لم يرد.`, components: [], embeds: [] });
        }
    }
};
