const { EmbedBuilder, Colors } = require("discord.js");

// 🛡️ نظام استعلام فولاذي لحماية قاعدة البيانات 🛡️
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

module.exports = {
    name: 'relation',
    description: 'كشف صلة القرابة الدقيقة والمفصلة بينك وبين عضو آخر',
    aliases: ['قرابة', 'صلة', 'rel', 'kinship'],
    category: 'Family',

    async execute(message, args) {
        const client = message.client;
        const db = client.sql;
        const guildId = message.guild.id;
        const userA = message.author; 
        
        const userBMember = message.mentions.members.first() || message.guild.members.cache.get(args[0]);
        if (!userBMember) {
            const msg = await message.reply("❌ **منشن الشخص عشان أفحص شجرة العائلة وأطلع لك القرابة!**");
            setTimeout(() => msg.delete().catch(() => {}), 5000);
            return;
        }

        const userB = userBMember.user; 

        if (userA.id === userB.id) {
            const msg = await message.reply("🪞 **أنت هو أنت!**");
            setTimeout(() => msg.delete().catch(() => {}), 5000);
            return;
        }

        let familyConfig = null;
        try {
            const configRes = await safeQuery(db, `SELECT "maleRole", "femaleRole" FROM family_config WHERE "guildID" = $1`, [guildId]);
            familyConfig = configRes.rows[0];
        } catch(e) {}
        
        const getGenderedTitle = (member, type) => {
            const checkRole = (rolesData) => {
                if (!rolesData) return false;
                try {
                    const roleIds = JSON.parse(rolesData);
                    if (Array.isArray(roleIds)) return roleIds.some(id => member.roles.cache.has(id));
                } catch {
                    return member.roles.cache.has(rolesData);
                }
                return false;
            };

            const isMale = familyConfig && checkRole(familyConfig.maleRole || familyConfig.malerole);
            const isFemale = familyConfig && checkRole(familyConfig.femaleRole || familyConfig.femalerole);
            
            const titles = {
                spouse: isMale ? "الزوج" : (isFemale ? "الزوجة" : "شريك حياة"),
                parent: isMale ? "الأب" : (isFemale ? "الأم" : "الوالد"),
                child: isMale ? "الابن" : (isFemale ? "الابنة" : "الابن"),
                sibling: isMale ? "الأخ" : (isFemale ? "الأخت" : "الشقيق"),
                grandparent: isMale ? "الجد" : (isFemale ? "الجدة" : "الجد"),
                great_grandparent: isMale ? "الجد الأكبر" : (isFemale ? "الجدة الكبرى" : "الجد الأكبر"),
                grandchild: isMale ? "الحفيد" : (isFemale ? "الحفيدة" : "الحفيد"),
                great_grandchild: isMale ? "ابن الحفيد" : (isFemale ? "ابنة الحفيد" : "سليل"),
                uncle: isMale ? "العم/الخال" : (isFemale ? "العمة/الخالة" : "قريب من الدرجة الثانية"),
                nephew: isMale ? "ابن الأخ/الأخت" : (isFemale ? "ابنة الأخ/الأخت" : "ابن الشقيق"),
                cousin: isMale ? "ابن العم/الخال" : (isFemale ? "ابنة العم/الخال" : "قريب"),
                parent_in_law: isMale ? "حمو (أبو الزوج/ة)" : (isFemale ? "حماة (أم الزوج/ة)" : "من الأصهار"),
                child_in_law: isMale ? "زوج الابنة (الصهر)" : (isFemale ? "زوجة الابن (الكنة)" : "زوج الابن/ة"),
                sibling_in_law: isMale ? "أخ الزوج/ة (أو زوج الأخت)" : (isFemale ? "أخت الزوج/ة (أو زوجة الأخ)" : "صهر"),
                step_parent: isMale ? "زوج الأم" : (isFemale ? "زوجة الأب" : "زوج الوالد"),
                step_child: isMale ? "(ابن الزوج/ة)" : (isFemale ? "ابنة الزوج/ة)" : "ربيب"),
                step_sibling: isMale ? "أخ غير شقيق" : (isFemale ? "أخت غير شقيقة" : "أخ غير شقيق"),
                co_wife: isFemale ? "ضـرة (شريكة زوج)" : "شريك",
            };

            return titles[type] || "قريب";
        };

        // دوال جلب البيانات التي تدعم المصفوفات (للتعدد)
        const getParents = async (id) => {
            const res = await safeQuery(db, `SELECT "parentID" FROM children WHERE "childID" = $1 AND "guildID" = $2`, [id, guildId]);
            return res.rows.map(r => r.parentID || r.parentid);
        };
        const getChildren = async (id) => {
            const res = await safeQuery(db, `SELECT "childID" FROM children WHERE "parentID" = $1 AND "guildID" = $2`, [id, guildId]);
            return res.rows.map(r => r.childID || r.childid);
        };
        const getPartners = async (id) => {
            const res1 = await safeQuery(db, `SELECT "partnerID" FROM marriages WHERE "userID" = $1 AND "guildID" = $2`, [id, guildId]);
            const res2 = await safeQuery(db, `SELECT "userID" FROM marriages WHERE "partnerID" = $1 AND "guildID" = $2`, [id, guildId]);
            const pSet = new Set();
            res1.rows.forEach(r => { if(r.partnerID) pSet.add(r.partnerID); if(r.partnerid) pSet.add(r.partnerid); });
            res2.rows.forEach(r => { if(r.userID) pSet.add(r.userID); if(r.userid) pSet.add(r.userid); });
            return Array.from(pSet);
        };

        let relName = "غـربـاء 🚶‍♂️";
        let relEmoji = "❓";
        let relColor = Colors.Grey;
        let relationFound = false;

        // جلب دوائر القرابة للشخص أ والشخص ب
        const partnersA = await getPartners(userA.id);
        const partnersB = await getPartners(userB.id);
        const parentsA = await getParents(userA.id);
        const parentsB = await getParents(userB.id);
        const childrenA = await getChildren(userA.id);
        const childrenB = await getChildren(userB.id);

        // 1. فحص الشريك (الزوج / الزوجة)
        if (partnersA.includes(userB.id)) {
            relName = getGenderedTitle(userBMember, 'spouse');
            relEmoji = "💍";
            relColor = Colors.LuminousVividPink;
            relationFound = true;
        }

        // 2. فحص الوالدين والأبناء
        if (!relationFound) {
            if (parentsA.includes(userB.id)) {
                relName = getGenderedTitle(userBMember, 'parent');
                relEmoji = "👑";
                relColor = Colors.Gold;
                relationFound = true;
            } else if (childrenA.includes(userB.id)) {
                relName = getGenderedTitle(userBMember, 'child');
                relEmoji = "🍼";
                relColor = Colors.Blue;
                relationFound = true;
            }
        }

        // 3. فحص الإخوة
        if (!relationFound) {
            const areSiblings = parentsA.some(pid => parentsB.includes(pid));
            if (areSiblings) {
                relName = getGenderedTitle(userBMember, 'sibling');
                relEmoji = "🤝";
                relColor = Colors.Green;
                relationFound = true;
            }
        }

        // 4. فحص الأجداد والأحفاد
        let grandParentsA = [];
        let grandChildrenA = [];
        if (!relationFound) {
            for (const pid of parentsA) {
                const gps = await getParents(pid);
                grandParentsA.push(...gps);
            }
            if (grandParentsA.includes(userB.id)) {
                relName = getGenderedTitle(userBMember, 'grandparent');
                relEmoji = "👴";
                relColor = Colors.Grey;
                relationFound = true;
            }
            
            if (!relationFound) {
                for (const cid of childrenA) {
                    const gcs = await getChildren(cid);
                    grandChildrenA.push(...gcs);
                }
                if (grandChildrenA.includes(userB.id)) {
                    relName = getGenderedTitle(userBMember, 'grandchild');
                    relEmoji = "🧸";
                    relColor = Colors.Aqua;
                    relationFound = true;
                }
            }
        }

        // 5. فحص الجد الأكبر
        if (!relationFound) {
            let greatGrandParentsA = [];
            for (const gpid of grandParentsA) {
                const ggps = await getParents(gpid);
                greatGrandParentsA.push(...ggps);
            }
            if (greatGrandParentsA.includes(userB.id)) {
                relName = getGenderedTitle(userBMember, 'great_grandparent');
                relEmoji = "📜";
                relColor = Colors.DarkVividPink;
                relationFound = true;
            }
        }

        // 6. فحص الأعمام والأخوال وأبناء الأخ/الأخت
        let mySiblings = [];
        if (!relationFound) {
            let unclesA = [];
            for (const pid of parentsA) {
                const gps = await getParents(pid);
                for (const gp of gps) {
                    const uncles = (await getChildren(gp)).filter(u => u !== pid);
                    unclesA.push(...uncles);
                }
            }
            if (unclesA.includes(userB.id)) {
                relName = getGenderedTitle(userBMember, 'uncle');
                relEmoji = "🎩";
                relColor = Colors.Purple;
                relationFound = true;
            }

            if (!relationFound) {
                for (const pid of parentsA) {
                    const sibs = (await getChildren(pid)).filter(s => s !== userA.id);
                    mySiblings.push(...sibs);
                }
                if (parentsB.some(pb => mySiblings.includes(pb))) {
                    relName = getGenderedTitle(userBMember, 'nephew');
                    relEmoji = "🐣";
                    relColor = Colors.LightGrey;
                    relationFound = true;
                }
            }
        }

        // 7. فحص أبناء العم/الخال
        if (!relationFound) {
            let parentsASiblings = [];
            for (const pa of parentsA) {
                const gps = await getParents(pa);
                for (const gp of gps) {
                    const sibs = (await getChildren(gp)).filter(s => s !== pa);
                    parentsASiblings.push(...sibs);
                }
            }
            if (parentsB.some(pb => parentsASiblings.includes(pb))) {
                relName = getGenderedTitle(userBMember, 'cousin');
                relEmoji = "👥";
                relColor = Colors.Teal;
                relationFound = true;
            }
        }

        // 8. فحص الأصهار (أهل الزوج/الزوجة) - يدعم التعدد!
        if (!relationFound) {
            let partnersParents = [];
            for (const partnerId of partnersA) {
                const pp = await getParents(partnerId);
                partnersParents.push(...pp);
            }
            
            if (partnersParents.includes(userB.id)) {
                relName = getGenderedTitle(userBMember, 'parent_in_law');
                relEmoji = "🎎";
                relColor = Colors.DarkOrange;
                relationFound = true;
            }

            if (!relationFound) {
                let childrenPartners = [];
                for (const cid of childrenA) {
                    const cp = await getPartners(cid);
                    childrenPartners.push(...cp);
                }
                if (childrenPartners.includes(userB.id)) {
                    relName = getGenderedTitle(userBMember, 'child_in_law');
                    relEmoji = "🤝";
                    relColor = Colors.Yellow;
                    relationFound = true;
                }
            }

            if (!relationFound) {
                let partnersSiblings = [];
                for (const partnerId of partnersA) {
                    const pp = await getParents(partnerId);
                    for (const p of pp) {
                        const sibs = (await getChildren(p)).filter(s => s !== partnerId);
                        partnersSiblings.push(...sibs);
                    }
                }
                if (partnersSiblings.includes(userB.id)) {
                    relName = getGenderedTitle(userBMember, 'sibling_in_law');
                    relEmoji = "🎋";
                    relColor = Colors.DarkGold;
                    relationFound = true;
                }
            }

            if (!relationFound) {
                if (partnersB.some(pb => mySiblings.includes(pb))) {
                    relName = getGenderedTitle(userBMember, 'sibling_in_law');
                    relEmoji = "🎋";
                    relColor = Colors.DarkGold;
                    relationFound = true;
                }
            }
        }

        // 9. فحص علاقات التعدد: الضرة (تشترك في نفس الزوج)
        if (!relationFound) {
            const shareSamePartner = partnersA.some(p => partnersB.includes(p));
            if (shareSamePartner) {
                relName = getGenderedTitle(userBMember, 'co_wife');
                relEmoji = "🎭";
                relColor = Colors.LuminousVividPink;
                relationFound = true;
            }
        }

        // 10. فحص العلاقات غير الشقيقة (أبناء الشريك، زوج الوالد)
        if (!relationFound) {
            let parentsPartners = [];
            for (const pid of parentsA) {
                const pPartners = await getPartners(pid);
                parentsPartners.push(...pPartners.filter(p => !parentsA.includes(p)));
            }

            if (parentsPartners.includes(userB.id)) {
                relName = getGenderedTitle(userBMember, 'step_parent');
                relEmoji = "🧣";
                relColor = Colors.Orange;
                relationFound = true;
            }

            if (!relationFound) {
                let partnersChildren = [];
                for (const partnerId of partnersA) {
                    const pc = await getChildren(partnerId);
                    partnersChildren.push(...pc.filter(c => !childrenA.includes(c)));
                }
                if (partnersChildren.includes(userB.id)) {
                    relName = getGenderedTitle(userBMember, 'step_child');
                    relEmoji = "🐥";
                    relColor = Colors.Orange;
                    relationFound = true;
                }
            }
        }

        const embed = new EmbedBuilder()
            .setColor(relColor)
            .setAuthor({ name: 'نظام فحص الأنساب', iconURL: client.user.displayAvatarURL() })
            .setTitle(`🔍 نتيجة فحص صلة القرابة`)
            .setDescription(`
> **بين:** ${userA}
> **و:** ${userBMember}

✨ **النتيجة:**
# ${relEmoji} ${relName}
            `)
            .setThumbnail(userBMember.displayAvatarURL({ dynamic: true }))
            .setFooter({ text: 'سجل العائلة الإمبراطوري', iconURL: message.guild.iconURL() })
            .setTimestamp();

        const msg = await message.reply({ embeds: [embed] });
        
        setTimeout(() => msg.delete().catch(() => {}), 15000);
    }
};
