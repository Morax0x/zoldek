const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, Colors } = require("discord.js");

const ACCEPT_GIFS = [
    "https://i.postimg.cc/MKdNxXLS/f71198155e2fcceb77d434526689b006.gif",
    "https://i.postimg.cc/VLYp3XDr/92ee950095047a2744b85532cbb34b71.gif",
    "https://i.postimg.cc/qqrSBK0N/be1fd3b9ce4580bb31cb376eccf5e315.gif",
    "https://i.postimg.cc/ydc2zPM0/38f1e9010a069eb6bb8a5e7f04fe1d1b.gif",
    "https://i.postimg.cc/JzYf3t3N/fbb3746bdbc7507d07ae0a0b23ab1071.gif",
    "https://i.postimg.cc/02P1PT2D/314dfa902c28d93c285e53453111cf57.gif",
    "https://i.postimg.cc/Fzgt0ZGY/ed8113a52d8517b31b4073b9ee9db314.gif"
];

const REJECT_GIFS = [
    "https://i.postimg.cc/cJsv39ms/6fced129ae6541ed381b5b5809c09ae6.gif",
    "https://i.postimg.cc/6px2W54M/7b6519089cc27135155459ece52f51f4.gif",
    "https://i.postimg.cc/DfD4NcvF/1381036c9dcf14117351747e672ed515.gif"
];

const MORA_EMOJI = '<:mora:1435647151349698621>'; 

module.exports = {
    name: 'marry',
    description: 'طلب زواج مع تحديد المهر (يمنع زواج المحارم)',
    aliases: ['زواج', 'خطبة'],
    
    async execute(message, args) {
        const client = message.client;
        const db = client.sql;
        const guildId = message.guild.id;

        const replyTemp = async (content) => {
            const msg = await message.reply(content);
            setTimeout(() => msg.delete().catch(() => {}), 5000);
        };

        const targetMemberCheck = message.mentions.members.first();
        if (!targetMemberCheck || !args[1]) {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('show_family_help')
                    .setLabel('أوامـر الـزواج والعائلـة')
                    .setStyle(ButtonStyle.Primary) 
                    .setEmoji('💍')
            );

            const promptEmbed = new EmbedBuilder()
                .setColor(Colors.Blue)
                .setTitle('💍 نظام العائلة والزواج')
                .setDescription('**لاستعراض كافة الأوامر المتاحة وتفاصيلها، اضغط على الزر أدناه.**')
                .setFooter({ text: 'قائمة الأوامر ستظهر لك فقط (مخفية).' });

            const helpMsg = await message.reply({
                embeds: [promptEmbed],
                components: [row]
            });

            const collector = helpMsg.createMessageComponentCollector({ time: 30000 });

            collector.on('collect', async i => {
                if (i.customId === 'show_family_help') {
                    const helpListEmbed = new EmbedBuilder()
                        .setColor(Colors.Gold)
                        .setTitle('📜 دليل أوامر العائلة')
                        .setDescription('إليك قائمة بجميع الأوامر المتاحة في النظام:')
                        .addFields(
                            { name: '🔹 !زواج @منشن مبلغ', value: 'لطلب الزواج من عضو ودفع المهر المحدد.', inline: false },
                            { name: '🔹 !طلاق @منشن', value: 'لإنهاء العلاقة الزوجية (طلاق أو خلع).', inline: false },
                            { name: '🔹 !تبني @منشن', value: 'لتبني عضو جديد وضمه لشجرة عائلتك.', inline: false },
                            { name: '🔹 !طلب-اب @منشن', value: 'لتقديم طلب للانضمام لعائلة شخص ما كابن.', inline: false },
                            { name: '🔹 !تبرؤ @منشن', value: 'لطرد ابن من العائلة وحذفه من السجلات.', inline: false },
                            { name: '🔹 !هروب', value: 'للهروب من العائلة والاستقلال (تدفع تعويض).', inline: false },
                            { name: '🔹 !شجرة', value: 'لعرض بطاقة شجرة العائلة المصورة.', inline: false },
                            { name: '🔹 !قرابة @منشن', value: 'لكشف صلة القرابة بينك وبين عضو آخر.', inline: false }
                        )
                        .setFooter({ text: 'نظام العائلة • الإمبراطورية' });

                    await i.reply({
                        embeds: [helpListEmbed],
                        ephemeral: true 
                    });
                }
            });

            collector.on('end', () => helpMsg.delete().catch(() => {}));
            return;
        }

        try {
            await db.query(`CREATE TABLE IF NOT EXISTS marriages ("id" SERIAL PRIMARY KEY, "userID" TEXT, "partnerID" TEXT, "marriageDate" BIGINT, "guildID" TEXT, "dowry" BIGINT DEFAULT 0)`);
            await db.query(`ALTER TABLE marriages ADD COLUMN IF NOT EXISTS "dowry" BIGINT DEFAULT 0`);
        } catch (e) {}

        let familyConfig = null;
        try {
            const configRes = await db.query(`SELECT * FROM family_config WHERE "guildID" = $1`, [guildId]);
            familyConfig = configRes.rows[0];
        } catch(e) {
            try {
                const configRes = await db.query(`SELECT * FROM family_config WHERE guildid = $1`, [guildId]);
                familyConfig = configRes.rows[0];
            } catch(err) {}
        }
        
        if (!familyConfig || !(familyConfig.maleRole || familyConfig.malerole) || !(familyConfig.femaleRole || familyConfig.femalerole)) {
            return message.reply("🚫 **لم يتم إعداد رتب العائلة!** اطلب من الإدارة استخدام `!set-family-role`.");
        }

        const targetMember = message.mentions.members.first();
        let dowry = parseInt(args[1]);

        if (isNaN(dowry) || dowry < 0) {
            return replyTemp(`⚠️ **صيغـة غير صحيحة!**\nالاستخدام الصحيح: \`!زواج @الطرف_الثاني المبلغ\`\nمثال: \`!زواج @فلان 5000\``);
        }

        if (targetMember.id === message.author.id) return replyTemp("❌ تبي تتزوج نفسك؟ استهدي بالله.");
        if (targetMember.user.bot) return replyTemp("🤖 لا يمكنك الزواج من الروبوتات!");

        const checkRole = (member, rolesData) => {
            if (!rolesData) return false;
            try {
                const roleIds = JSON.parse(rolesData); 
                if (Array.isArray(roleIds)) return roleIds.some(id => member.roles.cache.has(id));
            } catch {
                return member.roles.cache.has(rolesData);
            }
            return false;
        };

        const isAuthorMale = checkRole(message.member, familyConfig.maleRole || familyConfig.malerole);
        const isAuthorFemale = checkRole(message.member, familyConfig.femaleRole || familyConfig.femalerole);
        const isTargetMale = checkRole(targetMember, familyConfig.maleRole || familyConfig.malerole);
        const isTargetFemale = checkRole(targetMember, familyConfig.femaleRole || familyConfig.femalerole);

        if (!isAuthorMale && !isAuthorFemale) return replyTemp("🚫 **يجب عليك تحديد جنسك أولاً!** (خذ رتبة ولد أو بنت).");
        if (!isTargetMale && !isTargetFemale) return replyTemp("🚫 **الطرف الآخر لم يحدد جنسه بعد!**");

        if ((isAuthorMale && isTargetMale) || (isAuthorFemale && isTargetFemale)) {
            return replyTemp("<:5gyy:1414564326496534628> **مـا نستقـبل شـواذ اذلـف**");
        }

        try {
            let isParentRes;
            try { isParentRes = await db.query(`SELECT 1 FROM children WHERE "parentID" = $1 AND "childID" = $2 AND "guildID" = $3 LIMIT 1`, [targetMember.id, message.author.id, guildId]); }
            catch(e) { isParentRes = await db.query(`SELECT 1 FROM children WHERE parentid = $1 AND childid = $2 AND guildid = $3 LIMIT 1`, [targetMember.id, message.author.id, guildId]).catch(()=>({rows:[]})); }
            if (isParentRes.rows.length > 0) return replyTemp(`🚫 **لا يجوز!** ${targetMember.displayName} هو والدك/والدتك.`);

            let isChildRes;
            try { isChildRes = await db.query(`SELECT 1 FROM children WHERE "parentID" = $1 AND "childID" = $2 AND "guildID" = $3 LIMIT 1`, [message.author.id, targetMember.id, guildId]); }
            catch(e) { isChildRes = await db.query(`SELECT 1 FROM children WHERE parentid = $1 AND childid = $2 AND guildid = $3 LIMIT 1`, [message.author.id, targetMember.id, guildId]).catch(()=>({rows:[]})); }
            if (isChildRes.rows.length > 0) return replyTemp(`🚫 **لا يجوز!** ${targetMember.displayName} هو ابنك/ابنتك.`);

            let authorParentsRes;
            try { authorParentsRes = await db.query(`SELECT "parentID" FROM children WHERE "childID" = $1 AND "guildID" = $2`, [message.author.id, guildId]); }
            catch(e) { authorParentsRes = await db.query(`SELECT parentid FROM children WHERE childid = $1 AND guildid = $2`, [message.author.id, guildId]).catch(()=>({rows:[]})); }
            
            let targetParentsRes;
            try { targetParentsRes = await db.query(`SELECT "parentID" FROM children WHERE "childID" = $1 AND "guildID" = $2`, [targetMember.id, guildId]); }
            catch(e) { targetParentsRes = await db.query(`SELECT parentid FROM children WHERE childid = $1 AND guildid = $2`, [targetMember.id, guildId]).catch(()=>({rows:[]})); }

            const authorParents = authorParentsRes.rows.map(r => r.parentID || r.parentid);
            const targetParents = targetParentsRes.rows.map(r => r.parentID || r.parentid);
            
            const isSibling = authorParents.some(parent => targetParents.includes(parent));
            if (isSibling) return replyTemp(`🚫 **لا يجوز!** ${targetMember.displayName} هو أخوك/أختك (لديكم نفس الوالدين).`);

            let authorCountRes;
            try { authorCountRes = await db.query(`SELECT count(*) as count FROM marriages WHERE "userID" = $1 AND "guildID" = $2`, [message.author.id, guildId]); }
            catch(e) { authorCountRes = await db.query(`SELECT count(*) as count FROM marriages WHERE userid = $1 AND guildid = $2`, [message.author.id, guildId]).catch(()=>({rows:[{count:0}]})); }
            
            let targetCountRes;
            try { targetCountRes = await db.query(`SELECT count(*) as count FROM marriages WHERE "userID" = $1 AND "guildID" = $2`, [targetMember.id, guildId]); }
            catch(e) { targetCountRes = await db.query(`SELECT count(*) as count FROM marriages WHERE userid = $1 AND guildid = $2`, [targetMember.id, guildId]).catch(()=>({rows:[{count:0}]})); }

            const authorCount = Number(authorCountRes.rows[0].count);
            const targetCount = Number(targetCountRes.rows[0].count);

            if (isAuthorMale && authorCount >= 4) return replyTemp("🚫 **عـنـدك 4 زوجـات ارقـد**");
            if (isAuthorFemale && authorCount >= 1) return replyTemp("🚫 **أنتِ متزوجة بالفعل!**");

            if (isTargetMale && targetCount >= 4) return replyTemp(`🚫 **${targetMember.displayName} وصل للحد الأقصى من الزوجات!**`);
            if (isTargetFemale && targetCount >= 1) return replyTemp(`🚫 **${targetMember.displayName} متزوجة بالفعـل!**`);

            let alreadyMarriedRes;
            try { alreadyMarriedRes = await db.query(`SELECT * FROM marriages WHERE "userID" = $1 AND "partnerID" = $2 AND "guildID" = $3 LIMIT 1`, [message.author.id, targetMember.id, guildId]); }
            catch(e) { alreadyMarriedRes = await db.query(`SELECT * FROM marriages WHERE userid = $1 AND partnerid = $2 AND guildid = $3 LIMIT 1`, [message.author.id, targetMember.id, guildId]).catch(()=>({rows:[]})); }
            
            if (alreadyMarriedRes.rows.length > 0) return replyTemp("❌ **أنتم متزوجين بعض أصـلاً!**");

        } catch(e) {
            console.error("Family Check Error:", e);
            return replyTemp("❌ حدث خطأ داخلي أثناء الفحص.");
        }

        let authorData = await client.getLevel(message.author.id, guildId);
        if (!authorData || Number(authorData.mora) < dowry) {
            return replyTemp(`💸 **رصيدك لا يكفي للمهر!** تملك: ${authorData ? Number(authorData.mora).toLocaleString() : 0} ${MORA_EMOJI}`);
        }

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('accept_marry').setLabel('المـوافـقـة').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('reject_marry').setLabel('رفــض').setStyle(ButtonStyle.Danger)
        );

        const embed = new EmbedBuilder()
            .setTitle('✥ طـلـب زواج !')
            .setColor("Random")
            .setDescription(`
✶ ${targetMember}
✶ ${message.author}

طـلـب الزواج منـك !
دفـع لك مهـر بقيمـة: **${dowry.toLocaleString()}** ${MORA_EMOJI}
            `)
            .setThumbnail(message.author.displayAvatarURL())
            .setTimestamp();

        const proposalMsg = await message.channel.send({ content: `${targetMember}`, embeds: [embed], components: [row] });

        const filter = i => i.user.id === targetMember.id;
        const collector = proposalMsg.createMessageComponentCollector({ filter, time: 120000, max: 1 });

        collector.on('collect', async i => {
            if (i.customId === 'reject_marry') {
                const rejectGif = REJECT_GIFS[Math.floor(Math.random() * REJECT_GIFS.length)];

                const rejectEmbed = new EmbedBuilder()
                    .setTitle('✥ زواج مـرفـوض ...')
                    .setColor("Red")
                    .setDescription(`✶ قـام ${targetMember} برفـض الزواج منـك !`)
                    .setImage(rejectGif);

                await i.update({ content: ``, embeds: [rejectEmbed], components: [] });
                return;
            }

            if (i.customId === 'accept_marry') {
                // 🔥 جلب البيانات بعد الانتظار للتأكد من الرصيد الحالي 🔥
                let currentAuthorData = await client.getLevel(message.author.id, guildId);
                if (!currentAuthorData || Number(currentAuthorData.mora) < dowry) {
                    return i.update({ content: `❌ **فشلت العملية:** العريس صرف فلوسه أثناء الانتظار!`, components: [], embeds: [] });
                }

                try {
                    await db.query('BEGIN');

                    // خصم المهر من العريس باستخدام الداتابيز مباشرة لضمان الدقة
                    await db.query(`UPDATE levels SET "mora" = CAST("mora" AS BIGINT) - $1 WHERE "user" = $2 AND "guild" = $3`, [dowry, message.author.id, guildId])
                        .catch(() => db.query(`UPDATE levels SET mora = mora - $1 WHERE userid = $2 AND guildid = $3`, [dowry, message.author.id, guildId]));

                    // إضافة المهر للعروس
                    await db.query(`UPDATE levels SET "mora" = CAST("mora" AS BIGINT) + $1 WHERE "user" = $2 AND "guild" = $3`, [dowry, targetMember.id, guildId])
                        .catch(() => db.query(`UPDATE levels SET mora = mora + $1 WHERE userid = $2 AND guildid = $3`, [dowry, targetMember.id, guildId]));
                    
                    // تحديث الكاش بالبوت
                    currentAuthorData.mora = Number(currentAuthorData.mora) - dowry;
                    await client.setLevel(currentAuthorData);
                    let targetData = await client.getLevel(targetMember.id, guildId);
                    if (targetData) {
                        targetData.mora = Number(targetData.mora) + dowry;
                        await client.setLevel(targetData);
                    }

                    const now = Date.now();
                    // تسجل عملية الزواج
                    try {
                        await db.query(`INSERT INTO marriages ("userID", "partnerID", "marriageDate", "guildID", "dowry") VALUES ($1, $2, $3, $4, $5)`, [message.author.id, targetMember.id, now, guildId, dowry]);
                    } catch (e) {
                        await db.query(`INSERT INTO marriages (userid, partnerid, marriagedate, guildid, dowry) VALUES ($1, $2, $3, $4, $5)`, [message.author.id, targetMember.id, now, guildId, dowry]).catch(()=>{});
                    }

                    await db.query('COMMIT');
                } catch (err) {
                    await db.query('ROLLBACK').catch(()=>{});
                    console.error("Marriage Error:", err);
                    return i.update({ content: `❌ **حدث خطأ في قاعدة البيانات ولم يتم إتمام الزواج.**`, components: [], embeds: [] });
                }

                const acceptGif = ACCEPT_GIFS[Math.floor(Math.random() * ACCEPT_GIFS.length)];

                const acceptEmbed = new EmbedBuilder()
                    .setColor("Green")
                    .setTitle(`💍 مـبـروك الـزواج 💍`)
                    .setDescription(`
تم عقد قران **${message.member.displayName}** و **${targetMember.displayName}**!
تم تحويل المهر: **${dowry.toLocaleString()}** ${MORA_EMOJI}
                    `)
                    .setImage(acceptGif);

                await i.update({ content: `||${message.author} ${targetMember}||`, embeds: [acceptEmbed], components: [] });
            }
        });

        collector.on('end', (collected, reason) => {
            if (reason === 'time') {
                proposalMsg.edit({ content: `⏳ **انتهى الوقت..** يبدو أن ${targetMember.displayName} يفكر/تفكر في الأمر.`, components: [], embeds: [] }).catch(()=>{});
            }
        });
    }
};
