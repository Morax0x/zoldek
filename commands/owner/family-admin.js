const { 
    ActionRowBuilder, 
    StringSelectMenuBuilder, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    ComponentType, 
    Colors,
    EmbedBuilder,
    MessageFlags
} = require("discord.js");

const OWNER_ID = "1145327691772481577"; 

// 🛡️ نظام استعلامات فولاذي لحماية قاعدة البيانات 🛡️
const safeExecute = async (db, qPg, params) => {
    try { await db.query(qPg, params); return true; } catch(e) { 
        let fallbackQuery = qPg
            .replace(/"userID"/gi, "userid")
            .replace(/"guildID"/gi, "guildid")
            .replace(/"partnerID"/gi, "partnerid")
            .replace(/"parentID"/gi, "parentid")
            .replace(/"childID"/gi, "childid")
            .replace(/"marriageDate"/gi, "marriagedate")
            .replace(/"adoptDate"/gi, "adoptdate");

        if (fallbackQuery !== qPg) {
            try { await db.query(fallbackQuery, params); return true; } catch(e2) { return false; }
        }
        return false;
    }
};

module.exports = {
    name: 'family-admin',
    description: 'لوحة التحكم بالعائلات (بريفكس فقط)',
    aliases: ['fa', 'fam', 'fadmin'], 
    category: "Owner",

    async execute(message, args) {
        const client = message.client;
        const db = client.sql;
        const guildId = message.guild.id;

        if (message.author.id !== OWNER_ID) return; 

        // دالة بحث ذكية لجلب الآيدي من (منشن - آيدي مباشر - يوزرنيم)
        const resolveUser = async (input) => {
            if (!input) return null;
            let cleanId = input.replace(/[<@!>]/g, '').trim();
            
            try {
                const user = await client.users.fetch(cleanId);
                return user.id;
            } catch (e) {}

            const member = message.guild.members.cache.find(m => 
                m.user.username.toLowerCase() === input.toLowerCase() || 
                m.displayName.toLowerCase() === input.toLowerCase()
            );
            if (member) return member.id;

            return null;
        };

        const menuRow = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('family_admin_menu')
                .setPlaceholder('🔻 اختر إجراءً إمبراطورياً...')
                .addOptions([
                    { label: 'تزويج إجباري', value: 'force_marry', emoji: '💍' },
                    { label: 'طلاق إجباري', value: 'force_divorce', emoji: '💔' },
                    { label: 'تبني إجباري (متعدد)', value: 'force_adopt', emoji: '👶' },
                    { label: 'تحرير ابن', value: 'force_disown', emoji: '🦅' },
                    { label: 'تصفير عضو بالكامل', value: 'reset_user', emoji: '☢️' }
                ])
        );

        const embed = new EmbedBuilder()
            .setColor(Colors.DarkGold)
            .setTitle('👑 لوحة التحكم بالعائلات')
            .setDescription('اختر الإجراء من القائمة أدناه.\nيمكنك إدخال (الآيدي) أو (المنشن) أو (اسم المستخدم) في الحقول.')
            .setThumbnail(message.author.displayAvatarURL());

        const response = await message.reply({ embeds: [embed], components: [menuRow] });

        const filter = i => i.user.id === OWNER_ID && i.customId === 'family_admin_menu';
        const collector = response.createMessageComponentCollector({ filter, componentType: ComponentType.StringSelect, time: 60000 });

        collector.on('collect', async i => {
            const choice = i.values[0];
            let modal;

            if (choice === 'force_marry') {
                modal = new ModalBuilder().setCustomId('modal_force_marry').setTitle('💍 تزويج إجباري');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('user1').setLabel('الطرف الأول (آيدي/منشن/اسم)').setStyle(TextInputStyle.Short)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('user2').setLabel('الطرف الثاني (آيدي/منشن/اسم)').setStyle(TextInputStyle.Short))
                );
            } else if (choice === 'force_divorce') {
                modal = new ModalBuilder().setCustomId('modal_force_divorce').setTitle('💔 طلاق إجباري');
                modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('target').setLabel('الشخص (آيدي/منشن/اسم)').setStyle(TextInputStyle.Short)));
            } else if (choice === 'force_adopt') {
                modal = new ModalBuilder().setCustomId('modal_force_adopt').setTitle('👶 تبني إجباري (يقبل المتعدد)');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('parent').setLabel('الأب / الأم (آيدي/منشن/اسم)').setStyle(TextInputStyle.Short)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('children').setLabel('الأبناء (ضع مسافة بينهم للتعدد)').setStyle(TextInputStyle.Paragraph))
                );
            } else if (choice === 'force_disown') {
                modal = new ModalBuilder().setCustomId('modal_force_disown').setTitle('🦅 تحرير ابن');
                modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('child').setLabel('الابن (آيدي/منشن/اسم)').setStyle(TextInputStyle.Short)));
            } else if (choice === 'reset_user') {
                modal = new ModalBuilder().setCustomId('modal_reset_user').setTitle('☢️ تصفير عضو');
                modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('target').setLabel('العضو (آيدي/منشن/اسم)').setStyle(TextInputStyle.Short)));
            }

            await i.showModal(modal);

            try {
                const submitted = await i.awaitModalSubmit({ time: 60000, filter: sub => sub.user.id === OWNER_ID });
                
                if (submitted.customId === 'modal_force_marry') {
                    const rawU1 = submitted.fields.getTextInputValue('user1');
                    const rawU2 = submitted.fields.getTextInputValue('user2');
                    
                    const u1 = await resolveUser(rawU1);
                    const u2 = await resolveUser(rawU2);

                    if (!u1 || !u2) return submitted.reply({ content: `❌ لم يتم العثور على الأعضاء.`, flags: [MessageFlags.Ephemeral] });
                    if (u1 === u2) return submitted.reply({ content: "❌ لا يمكنك تزويج الشخص لنفسه!", flags: [MessageFlags.Ephemeral] });

                    // 🔥 إزالة DELETE من الطرف الأول للتعدد وعدم فسخ الزواجات السابقة 🔥
                    const now = Date.now();
                    await safeExecute(db, `INSERT INTO marriages ("userID", "partnerID", "guildID", "marriageDate") VALUES ($1, $2, $3, $4)`, [u1, u2, guildId, now]);
                    await safeExecute(db, `INSERT INTO marriages ("userID", "partnerID", "guildID", "marriageDate") VALUES ($1, $2, $3, $4)`, [u2, u1, guildId, now]);
                    
                    await submitted.reply({ content: `✅ **تم تزويج <@${u1}> و <@${u2}> غصباً عنهم وبأمر الإمبراطور!**` });
                }
                
                else if (submitted.customId === 'modal_force_divorce') {
                    const rawT = submitted.fields.getTextInputValue('target');
                    const t = await resolveUser(rawT);
                    if (!t) return submitted.reply({ content: `❌ لم يتم العثور على الشخص.`, flags: [MessageFlags.Ephemeral] });

                    await safeExecute(db, `DELETE FROM marriages WHERE "userID" = $1 OR "partnerID" = $2`, [t, t]);
                    await submitted.reply({ content: `✅ **تم تطليق <@${t}> من أي شريك!**` });
                }
                
                else if (submitted.customId === 'modal_force_adopt') {
                    const rawP = submitted.fields.getTextInputValue('parent');
                    const rawChildren = submitted.fields.getTextInputValue('children');
                    
                    const p = await resolveUser(rawP);
                    if (!p) return submitted.reply({ content: `❌ لم يتم العثور على الأب.`, flags: [MessageFlags.Ephemeral] });

                    const childrenInputs = rawChildren.split(/\s+/).filter(Boolean);
                    let successList = [];
                    let failList = [];

                    for (const rawC of childrenInputs) {
                        const c = await resolveUser(rawC);
                        if (!c) {
                            failList.push(rawC);
                            continue;
                        }
                        if (p === c) {
                            failList.push(rawC + " (نفس الشخص)");
                            continue;
                        }

                        // إزالة الآباء السابقين للطفل وضمّه للأب الجديد
                        await safeExecute(db, `DELETE FROM children WHERE "childID" = $1 AND "guildID" = $2`, [c, guildId]);
                        const success = await safeExecute(db, `INSERT INTO children ("parentID", "childID", "adoptDate", "guildID") VALUES ($1, $2, $3, $4)`, [p, c, Date.now(), guildId]);
                        if (success) {
                            successList.push(`<@${c}>`);
                        } else {
                            failList.push(rawC + " (خطأ DB)");
                        }
                    }

                    let replyMsg = `✅ **اكتملت عملية التبني الإمبراطورية:**\n\n`;
                    if (successList.length > 0) replyMsg += `**تم ضمهم كأبناء لـ <@${p}>:**\n${successList.join(' , ')}\n\n`;
                    if (failList.length > 0) replyMsg += `**فشل تبني:**\n${failList.join(' , ')}`;

                    await submitted.reply({ content: replyMsg });
                }
                
                else if (submitted.customId === 'modal_force_disown') {
                    const rawC = submitted.fields.getTextInputValue('child');
                    const c = await resolveUser(rawC);
                    if (!c) return submitted.reply({ content: `❌ لم يتم العثور على العضو.`, flags: [MessageFlags.Ephemeral] });

                    await safeExecute(db, `DELETE FROM children WHERE "childID" = $1 AND "guildID" = $2`, [c, guildId]);
                    await submitted.reply({ content: `✅ **تم تحرير <@${c}> وطرده من عائلته!**` });
                }
                
                else if (submitted.customId === 'modal_reset_user') {
                    const rawT = submitted.fields.getTextInputValue('target');
                    const t = await resolveUser(rawT);
                    if (!t) return submitted.reply({ content: `❌ لم يتم العثور على العضو.`, flags: [MessageFlags.Ephemeral] });

                    await safeExecute(db, `DELETE FROM marriages WHERE "userID" = $1 OR "partnerID" = $2`, [t, t]);
                    await safeExecute(db, `DELETE FROM children WHERE "childID" = $1`, [t]);
                    await safeExecute(db, `DELETE FROM children WHERE "parentID" = $1`, [t]);

                    await submitted.reply({ content: `✅ **تم تصفير ونفي <@${t}> من سجلات العائلة بالكامل!**` });
                }

                await response.delete().catch(()=>{});

            } catch (err) {
                // Time expired or error
            }
        });
    }
};
