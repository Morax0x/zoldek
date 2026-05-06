const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ComponentType, Colors, MessageFlags } = require("discord.js");

const ALIMONY_AMOUNT = 2500; 
const MORA_EMOJI = '<:mora:1435647151349698621>';

const DIVORCE_GIFS = [
    "https://media.tenor.com/B7y-Y8qX3pkAAAAC/break-up.gif",
    "https://media.tenor.com/uP_kX8vM8Q0AAAAC/sad-anime.gif",
    "https://media.tenor.com/Images/breakup.gif",
    "https://media.tenor.com/2P_D8-9Q8-0AAAAC/divorce-anime.gif",
    "https://media.tenor.com/images/1381036c9dcf14117351747e672ed515/tenor.gif"
];

// 🛡️ نظام معالجة استعلامات فولاذي وذكي للحماية من الانهيارات 🛡️
const safeQuery = async (db, qPg, params) => {
    try { 
        let res = await db.query(qPg, params); 
        return { rows: Array.isArray(res) ? res : (res?.rows || []) };
    } catch(e) { 
        let fallbackQuery = qPg
            .replace(/"userID"/gi, "userid")
            .replace(/"guildID"/gi, "guildid")
            .replace(/"partnerID"/gi, "partnerid")
            .replace(/"parentID"/gi, "parentid")
            .replace(/"childID"/gi, "childid");

        if (fallbackQuery !== qPg) {
            try { 
                let res2 = await db.query(fallbackQuery, params); 
                return { rows: Array.isArray(res2) ? res2 : (res2?.rows || []) };
            } catch(e2) { }
        }
        return { rows: [] };
    }
};

const safeExecute = async (db, qPg, params) => {
    try { await db.query(qPg, params); return true; } catch(e) { 
        let fallbackQuery = qPg
            .replace(/"userID"/gi, "userid")
            .replace(/"guildID"/gi, "guildid")
            .replace(/"partnerID"/gi, "partnerid")
            .replace(/"parentID"/gi, "parentid")
            .replace(/"childID"/gi, "childid");

        if (fallbackQuery !== qPg) {
            try { await db.query(fallbackQuery, params); return true; } catch(e2) { return false; }
        }
        return false;
    }
};

module.exports = {
    name: 'divorce',
    description: 'التقدم بطلب الطلاق او الخلع',
    aliases: ['طلاق', 'انفصال', 'خلع'],

    async execute(message, args) {
        const client = message.client;
        const db = client.sql;
        const user = message.member;
        const guildId = message.guild.id;

        try {
            const targetMember = message.mentions.members.first();
            let partnerId;
            let partner;

            const res = await safeQuery(db, `SELECT * FROM marriages WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guildId]);
            const allMarriages = res.rows;

            if (allMarriages.length === 0) {
                const msg = await message.reply("🚫 **أنت لست متزوجاً أصلاً!**");
                setTimeout(() => msg.delete().catch(() => {}), 5000);
                return;
            }

            if (targetMember) {
                const specificMarriage = allMarriages.find(m => (m.partnerID || m.partnerid) === targetMember.id);
                if (!specificMarriage) {
                    const msg = await message.reply(`🚫 **أنت لست متزوجاً من ${targetMember.displayName}!**`);
                    setTimeout(() => msg.delete().catch(() => {}), 5000);
                    return;
                }
                partnerId = targetMember.id;
                partner = targetMember;
            } else {
                if (allMarriages.length === 1) {
                    partnerId = allMarriages[0].partnerID || allMarriages[0].partnerid;
                    partner = await message.guild.members.fetch(partnerId).catch(() => null);
                } else {
                    const options = await Promise.all(allMarriages.map(async (m) => {
                        const pid = m.partnerID || m.partnerid;
                        const p = await message.guild.members.fetch(pid).catch(() => null);
                        return {
                            label: p ? p.displayName : `Unknown User (${pid})`,
                            value: pid,
                            description: `الزوجة المحددة للطلاق`,
                            emoji: '💍'
                        };
                    }));

                    const selectMenu = new StringSelectMenuBuilder()
                        .setCustomId('select_wife_divorce')
                        .setPlaceholder('اختر الزوجة التي تريد طلاقها')
                        .addOptions(options);

                    const row = new ActionRowBuilder().addComponents(selectMenu);
                    
                    const selectMsg = await message.reply({ content: "**لديك أكثر من زوجة، اختر من تريد طلاقها:**", components: [row] });

                    const filter = i => i.customId === 'select_wife_divorce' && i.user.id === user.id;
                    try {
                        const selection = await selectMsg.awaitMessageComponent({ filter, time: 30000, componentType: ComponentType.StringSelect });
                        partnerId = selection.values[0];
                        partner = await message.guild.members.fetch(partnerId).catch(() => null);
                        await selection.deferUpdate(); 
                        await selectMsg.delete().catch(() => {});
                    } catch (e) {
                        return selectMsg.edit({ content: "⏰ **انتهى الوقت!** حاول مرة أخرى.", components: [] }).catch(()=>{});
                    }
                }
            }

            // نظام الطلاق التلقائي في حال غادر الطرف الآخر السيرفر
            if (!partner) {
                try {
                    await db.query('BEGIN');
                    await safeExecute(db, `DELETE FROM marriages WHERE "userID" = $1 AND "partnerID" = $2 AND "guildID" = $3`, [user.id, partnerId, guildId]); 
                    await safeExecute(db, `UPDATE children SET "parentID" = $1 WHERE "parentID" = $2 AND "guildID" = $3`, [user.id, partnerId, guildId]);
                    await db.query('COMMIT');
                } catch(e) {
                    await db.query('ROLLBACK').catch(()=>{});
                }

                const embed = new EmbedBuilder()
                    .setColor("Grey")
                    .setTitle("⚖️ فسخ عقد تلقائي")
                    .setDescription(
                        `بما أن الشريك (<@${partnerId}>) غادر السيرفر، تم فسخ عقد الزواج تلقائياً.\n` +
                        `👶 **الحضانة:** انتقلت حضانة جميع الأطفال إليك بالكامل.`
                    )
                    .setFooter({ text: "نظام الطلاق التلقائي" });

                const msg = await message.reply({ embeds: [embed] });
                setTimeout(() => msg.delete().catch(() => {}), 15000);
                return;
            }

            let familyConfig = null;
            const confRes = await safeQuery(db, `SELECT * FROM family_config WHERE "guildID" = $1`, [guildId]);
            if (confRes.rows.length > 0) familyConfig = confRes.rows[0];
            
            const checkRole = (rolesData) => {
                if (!rolesData) return false;
                try {
                    const roleIds = JSON.parse(rolesData);
                    if (Array.isArray(roleIds)) return roleIds.some(id => user.roles.cache.has(id));
                } catch {
                    return user.roles.cache.has(rolesData);
                }
                return false;
            };

            const isMale = familyConfig && checkRole(familyConfig.maleRole || familyConfig.malerole);
            
            let title, desc, footer;
            let cost = ALIMONY_AMOUNT;

            if (isMale) {
                title = "✥ طـلب طــلاق";
                desc = `✶ تقـدم ${user} بطلب الطـلاق منـك\n✶ حـكمـت المحكمـة عليـه بدفع نفـقة لك ومقدارها **${cost.toLocaleString()}** ${MORA_EMOJI}`;
                footer = "المدعي: الزوج";
            } else {
                title = "✥ طـلب خـلـع";
                desc = `✶ تقـدمت ${user} بطلب الخـلـع منـك\n✶ حـكمـت المحكمـة عليـها بدفع تعويض لك ومقدارها **${cost.toLocaleString()}** ${MORA_EMOJI}`;
                footer = "المدعية: الزوجة";
            }

            // استخراج الأطفال المشتركين
            const childRes = await safeQuery(db, `SELECT DISTINCT "childID" FROM children WHERE ("parentID" = $1 OR "parentID" = $2) AND "guildID" = $3`, [user.id, partner.id, guildId]);
            const sharedChildren = childRes.rows.map(r => r.childID || r.childid);
            const hasChildren = sharedChildren.length > 0;

            if (hasChildren) {
                desc += `\n\n**👶 الحضانة:** بما أن لديكم أبناء، عليك تحديد من سيبقى بحضانتك (الباقون سيذهبون للطرف الآخر).`;
            }

            let userData = await client.getLevel(user.id, guildId);
            if (!userData || Number(userData.mora) < cost) {
                const msg = await message.reply(`💸 **لا تملك قيمة النفقة/التعويض!** المطلوب: ${cost.toLocaleString()} ${MORA_EMOJI}`);
                setTimeout(() => msg.delete().catch(() => {}), 5000);
                return;
            }

            const row = new ActionRowBuilder();
            
            if (hasChildren) {
                row.addComponents(
                    new ButtonBuilder().setCustomId('custody_session').setLabel('تحديد حضانة الأطفال').setStyle(ButtonStyle.Primary).setEmoji('👶')
                );
            } else {
                row.addComponents(
                    new ButtonBuilder().setCustomId('confirm_divorce_direct').setLabel('تأكيد وإرسال الطلب').setStyle(ButtonStyle.Danger).setEmoji('💔')
                );
            }
            
            row.addComponents(
                new ButtonBuilder().setCustomId('cancel_divorce').setLabel('إلغاء العملية').setStyle(ButtonStyle.Secondary)
            );

            const embed = new EmbedBuilder()
                .setTitle(title)
                .setColor("Random")
                .setDescription(desc)
                .setFooter({ text: footer });

            const courtMsg = await message.channel.send({ content: `${user}`, embeds: [embed], components: [row] });

            const collector = courtMsg.createMessageComponentCollector({ 
                filter: i => [user.id, partner.id].includes(i.user.id),
                time: 300000 
            });

            let selectedKidsForUser = [];

            collector.on('collect', async i => {
                if (i.customId === 'cancel_divorce') {
                    if (i.user.id !== user.id) return i.reply({ content: `⚠️ هذا الخيار لصاحب الطلب فقط!`, flags: [MessageFlags.Ephemeral] });
                    await i.deferUpdate(); 
                    await courtMsg.delete().catch(() => {}); 
                    const msg = await message.channel.send({ content: `🏳️ **تم إلغاء إجراءات المحكمة.**` });
                    setTimeout(() => msg.delete().catch(() => {}), 5000);
                    return;
                }

                if (i.customId === 'confirm_divorce_direct') {
                    if (i.user.id !== user.id) return i.reply({ content: `⚠️ هذا الخيار لصاحب الطلب فقط!`, flags: [MessageFlags.Ephemeral] });
                    
                    const partnerRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('partner_accept_divorce').setLabel('قبول الطلاق').setStyle(ButtonStyle.Success),
                        new ButtonBuilder().setCustomId('partner_reject_divorce').setLabel('رفض').setStyle(ButtonStyle.Danger)
                    );
                    await i.update({ content: `يرجى من ${partner} اتخاذ القرار:`, embeds: [new EmbedBuilder().setTitle("⚖️ موافقة الشريك").setDescription(`يطلب ${user} الانفصال، هل توافق وتستلم مبلغ ${cost.toLocaleString()} ${MORA_EMOJI}؟`).setColor(Colors.Orange)], components: [partnerRow] });
                }

                if (i.customId === 'custody_session') {
                    if (i.user.id !== user.id) return i.reply({ content: `⚠️ هذا الخيار لصاحب الطلب فقط!`, flags: [MessageFlags.Ephemeral] });
                    
                    const childOptions = [];
                    for (const cid of sharedChildren) {
                        const mem = await message.guild.members.fetch(cid).catch(()=>null);
                        const name = mem ? mem.displayName : `مجهول (${cid})`;
                        childOptions.push({ label: name, value: cid, emoji: '👶' });
                    }

                    const selectMenu = new StringSelectMenuBuilder()
                        .setCustomId('custody_select')
                        .setPlaceholder('اختر الأبناء الذين تريد حضانتهم...')
                        .addOptions(childOptions.slice(0, 25))
                        .setMinValues(1)
                        .setMaxValues(Math.min(childOptions.length, 25));

                    const rowMenu = new ActionRowBuilder().addComponents(selectMenu);
                    const rowBtns = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('custody_confirm').setLabel('تأكيد التحديد').setStyle(ButtonStyle.Success),
                        new ButtonBuilder().setCustomId('custody_leave_all').setLabel('التخلي عن الجميع').setStyle(ButtonStyle.Danger)
                    );

                    await i.update({ content: `حدد الأبناء الذين تريد حضانتهم يا ${user} (الأبناء غير المحددين سيذهبون للطرف الآخر):`, embeds: [], components: [rowMenu, rowBtns] });
                }

                if (i.customId === 'custody_select') {
                    if (i.user.id !== user.id) return i.reply({ content: `⚠️ هذا الخيار لصاحب الطلب فقط!`, flags: [MessageFlags.Ephemeral] });
                    selectedKidsForUser = i.values;
                    await i.reply({ content: "✅ تم حفظ التحديد مؤقتاً، اضغط (تأكيد التحديد) للاعتماد.", flags: [MessageFlags.Ephemeral] });
                }

                if (i.customId === 'custody_confirm' || i.customId === 'custody_leave_all') {
                    if (i.user.id !== user.id) return i.reply({ content: `⚠️ هذا الخيار لصاحب الطلب فقط!`, flags: [MessageFlags.Ephemeral] });
                    
                    if (i.customId === 'custody_leave_all') selectedKidsForUser = [];
                    else if (selectedKidsForUser.length === 0) return i.reply({ content: "❌ الرجاء تحديد طفل واحد على الأقل، أو اضغط على زر (التخلي عن الجميع).", flags: [MessageFlags.Ephemeral] });

                    const keepingNames = [];
                    const leavingNames = [];
                    for (const cid of sharedChildren) {
                        const mem = await message.guild.members.fetch(cid).catch(()=>null);
                        const name = mem ? mem.displayName : `مجهول (${cid})`;
                        if (selectedKidsForUser.includes(cid)) keepingNames.push(name);
                        else leavingNames.push(name);
                    }

                    const partnerDesc = `يا ${partner}، يطلب ${user} الطلاق ويريد حضانة:\n` +
                        (keepingNames.length > 0 ? `🟢 **${keepingNames.join('، ')}**\n` : `🟢 **لا أحد (تخلى عن الجميع)**\n`) +
                        `\nبينما سيترك لك حضانة:\n` +
                        (leavingNames.length > 0 ? `🔵 **${leavingNames.join('، ')}**\n` : `🔵 **لا أحد**\n`) +
                        `\nهل توافق على هذا التوزيع والانفصال واستلام **${cost.toLocaleString()}** ${MORA_EMOJI}؟`;

                    const rowPartner = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('partner_accept_divorce').setLabel('موافق على الطلاق والتوزيع').setStyle(ButtonStyle.Success),
                        new ButtonBuilder().setCustomId('partner_reject_divorce').setLabel('أرفض').setStyle(ButtonStyle.Danger)
                    );

                    await i.update({ content: `${partner}`, embeds: [new EmbedBuilder().setTitle("⚖️ موافقة الشريك على التوزيع").setDescription(partnerDesc).setColor(Colors.Orange)], components: [rowPartner] });
                }

                if (i.customId === 'partner_accept_divorce' || i.customId === 'partner_reject_divorce') {
                    if (i.user.id !== partner.id) return i.reply({ content: `⚠️ هذا الخيار للشريك (${partner.displayName}) فقط!`, flags: [MessageFlags.Ephemeral] });
                    
                    if (i.customId === 'partner_reject_divorce') {
                        await i.update({ content: `❌ **رفض ${partner.displayName} طلب الطلاق.** تم إلغاء الإجراءات.`, embeds: [], components: [] });
                        return;
                    }

                    await performDivorce(i, user, partner, cost, selectedKidsForUser, sharedChildren);
                }
            });

            async function performDivorce(interaction, payer, receiver, amount, payerKidsIds, allSharedKids) {
                try {
                    await db.query('BEGIN');
                    
                    let payerDB = await client.getLevel(payer.id, guildId);
                    if (!payerDB || Number(payerDB.mora) < amount) {
                        await db.query('ROLLBACK').catch(()=>{});
                        return interaction.update({ content: `❌ **فشلت العملية:** ${payer.displayName} أفلس أثناء التفاوض!`, embeds: [], components: [] });
                    }
                    payerDB.mora = Number(payerDB.mora) - amount;
                    await client.setLevel(payerDB);

                    let receiverDB = await client.getLevel(receiver.id, guildId);
                    if (!receiverDB) receiverDB = { id: `${guildId}-${receiver.id}`, user: receiver.id, guild: guildId, xp: 0, level: 1, mora: 0 };
                    receiverDB.mora = Number(receiverDB.mora) + amount;
                    await client.setLevel(receiverDB);

                    await safeExecute(db, `DELETE FROM marriages WHERE (("userID" = $1 AND "partnerID" = $2) OR ("userID" = $2 AND "partnerID" = $1)) AND "guildID" = $3`, [payer.id, receiver.id, guildId]);

                    let payerKept = 0;
                    let receiverKept = 0;

                    for (const cid of allSharedKids) {
                        if (payerKidsIds.includes(cid)) {
                            await safeExecute(db, `DELETE FROM children WHERE "parentID" = $1 AND "childID" = $2`, [receiver.id, cid]);
                            const check = await safeQuery(db, `SELECT 1 FROM children WHERE "parentID" = $1 AND "childID" = $2`, [payer.id, cid]);
                            if(check.rows.length === 0) await safeExecute(db, `INSERT INTO children ("parentID", "childID", "adoptDate", "guildID") VALUES ($1, $2, $3, $4)`, [payer.id, cid, Date.now(), guildId]);
                            payerKept++;
                        } else {
                            await safeExecute(db, `DELETE FROM children WHERE "parentID" = $1 AND "childID" = $2`, [payer.id, cid]);
                            const check = await safeQuery(db, `SELECT 1 FROM children WHERE "parentID" = $1 AND "childID" = $2`, [receiver.id, cid]);
                            if(check.rows.length === 0) await safeExecute(db, `INSERT INTO children ("parentID", "childID", "adoptDate", "guildID") VALUES ($1, $2, $3, $4)`, [receiver.id, cid, Date.now(), guildId]);
                            receiverKept++;
                        }
                    }

                    await db.query('COMMIT');

                    const finalGif = DIVORCE_GIFS[Math.floor(Math.random() * DIVORCE_GIFS.length)];
                    let custodyDesc = "";
                    if (allSharedKids.length > 0) {
                        custodyDesc = `\n👶 **توزيع الحضانة:**\n🟢 حصل ${payer.displayName} على حضانة (${payerKept}) أبناء.\n🔵 حصل ${receiver.displayName} على حضانة (${receiverKept}) أبناء.`;
                    }

                    const finalEmbed = new EmbedBuilder()
                        .setColor("Grey")
                        .setTitle(`⚖️ تم الانفصال رسمياً`)
                        .setDescription(
                            `تم التفريق بين **${payer.displayName}** و **${receiver.displayName}**.\n` +
                            `💸 **النفقة المحولة:** ${amount.toLocaleString()} ${MORA_EMOJI}\n` +
                            custodyDesc
                        )
                        .setImage(finalGif)
                        .setTimestamp();

                    await interaction.update({ content: ``, embeds: [finalEmbed], components: [] });

                } catch (error) {
                    await db.query('ROLLBACK').catch(()=>{});
                    console.error("Divorce Transaction Error:", error);
                    return interaction.update({ content: `❌ حدث خطأ داخلي أثناء تنفيذ الطلاق.`, embeds: [], components: [] }).catch(()=>{});
                }
            }

        } catch (error) {
            console.error("Error in divorce command:", error);
        }
    }
};
