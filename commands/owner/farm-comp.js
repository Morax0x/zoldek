const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

let farmAnimals;
try {
    farmAnimals = require('../../json/farm-animals.json');
} catch(e) {
    farmAnimals = require('../json/farm-animals.json');
}

const EMOJI_MORA = '<:mora:1435647151349698621>';
const OWNER_ID = "1145327691772481577";

// 🛡️ نظام معالجة البيانات الفولاذي
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
        .replace(/"animalID"/gi, "animalid")
        .replace(/"quantity"/gi, "quantity")
        .replace(/"mora"/gi, "mora")
        .replace(/"user"/gi, "userid")
        .replace(/"guild"/gi, "guildid")
        .replace(/"casinoChannelID"/gi, "casinochannelid");
    
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
        .setName('farm-comp')
        .setDescription('تعويض المزارعين عن 3 أيام (أمر مؤقت وخاص بالإمبراطور)'),
    
    async execute(interaction) {
        // حماية إضافية: لا أحد يستطيع تشغيله غيرك
        if (interaction.user.id !== OWNER_ID) {
            return interaction.reply({ content: "❌ هذا الأمر مخصص للإمبراطور فقط!", ephemeral: true });
        }

        const db = interaction.client.sql;
        if (!db) return interaction.reply({ content: "❌ لا يوجد اتصال بقاعدة البيانات.", ephemeral: true });

        // تعليق الرد لأن العملية ستأخذ وقتاً طويلاً
        await interaction.deferReply();

        try {
            const guildId = interaction.guild.id;

            // 🔍 محاولة إيجاد روم الكازينو من الإعدادات
            let targetChannel = interaction.channel; // الافتراضي: نفس القناة
            const settingsRes = await safeQuery(db, `SELECT "casinoChannelID" FROM settings WHERE "guild" = $1`, [guildId]);
            const casinoId = settingsRes.rows[0] ? (settingsRes.rows[0].casinoChannelID || settingsRes.rows[0].casinochannelid) : null;
            
            if (casinoId) {
                const fetchedChannel = interaction.guild.channels.cache.get(casinoId);
                if (fetchedChannel) {
                    targetChannel = fetchedChannel;
                }
            }

            // جلب جميع المزارعين وحيواناتهم
            const userFarmRes = await safeQuery(db, `SELECT "userID", "animalID", "quantity" FROM user_farm WHERE "guildID" = $1`, [guildId]);
            const userFarm = userFarmRes.rows;
            
            if (!userFarm || userFarm.length === 0) {
                return interaction.editReply("❌ لم أجد أي حيوانات في مزارع اللاعبين لتعويضهم.");
            }

            // حساب التعويض لكل لاعب (دخل 3 أيام بغض النظر عن الجوع)
            const userIncomes = new Map();
            for (const row of userFarm) {
                const uid = row.userID || row.userid;
                const aid = row.animalID || row.animalid;
                const qty = Number(row.quantity || row.Quantity) || 1;

                const animal = farmAnimals.find(a => String(a.id) === String(aid));
                if (!animal) continue;

                // حساب قيمة التعويض = دخل الحيوان اليومي * العدد * 3 أيام
                const compAmount = (Number(animal.income_per_day) || 0) * qty * 3;

                if (compAmount > 0) {
                    userIncomes.set(uid, (userIncomes.get(uid) || 0) + compAmount);
                }
            }

            if (userIncomes.size === 0) {
                return interaction.editReply("❌ لا يوجد تعويض مستحق للمزارعين.");
            }

            await interaction.editReply(`⏳ **تم بدء عملية التعويض!**\nجاري إيداع المورا وإرسال الإعلانات لـ **${userIncomes.size}** مزارع في روم <#${targetChannel.id}>.\n*(الرجاء الانتظار حتى تظهر رسالة الانتهاء لتجنب تعليق البوت...)*`);

            let successCount = 0;

            // حلقة التوزيع والإرسال الآمن (مضاد للباند)
            for (const [uid, amount] of userIncomes.entries()) {
                try {
                    // أ. التأكد من وجود اللاعب في البنك
                    let check = await safeQuery(db, `SELECT "mora" FROM levels WHERE "user"=$1 AND "guild"=$2`, [uid, guildId]);
                    if (check.rows.length === 0) {
                        await safeQuery(db, `INSERT INTO levels ("user", "guild", "xp", "level", "totalXP", "mora") VALUES ($1, $2, 0, 1, 0, 0)`, [uid, guildId]);
                    }

                    // ب. إضافة المورا في الداتا بيز
                    await safeQuery(db, `UPDATE levels SET "mora" = CAST(COALESCE("mora", '0') AS BIGINT) + CAST($1 AS BIGINT) WHERE "user" = $2 AND "guild" = $3`, [String(amount), uid, guildId]);

                    // 🔥 ج. تحديث الذاكرة المؤقتة (Cache) لضمان عدم مسح الرصيد 🔥
                    if (interaction.client.getLevel) {
                        let cache = await interaction.client.getLevel(uid, guildId);
                        if (cache) {
                            cache.mora = String(BigInt(cache.mora || 0) + BigInt(amount));
                            if (interaction.client.setLevel) await interaction.client.setLevel(cache);
                        }
                    }

                    // د. إنشاء الإيمبد المطلوب
                    const embed = new EmbedBuilder()
                        .setTitle('✥ إعلان من القصر الإمبراطوري !')
                        .setDescription(`✦ مزارعو الإمبراطورية يُكافَؤون بزيادة ثلاثية في إنتاجهم تقديرًا لإخلاصهم\n✦ حـصـلـت عـلـى: **${amount.toLocaleString()}** ${EMOJI_MORA}`)
                        .setColor('Random')
                        .setThumbnail('https://i.postimg.cc/cLjcQKYN/Ganzo-pixel.jpg')
                        .setFooter({ text: 'Empire | الامبراطورية ™' });

                    // هـ. إرسال الرسالة إلى روم الكازينو مع المنشن
                    await targetChannel.send({ content: `<@${uid}>`, embeds: [embed] });
                    successCount++;

                } catch (err) {
                    console.error(`Failed to compensate user ${uid}:`, err.message);
                }

                // سحر الأمان: تأخير لمدة ثانيتين (2000 ملي ثانية) بين كل رسالة والأخرى لتجنب باند ديسكورد
                await new Promise(resolve => setTimeout(resolve, 2000));
            }

            // رسالة النهاية في الروم التي استخدمت فيها الأمر
            await interaction.channel.send(`✅ **اكتمل المرسوم الإمبراطوري!**\nتم تعويض **${successCount}** مزارع بنجاح بإنتاج 3 أيام.`);

        } catch (error) {
            console.error(error);
            await interaction.channel.send("❌ حدث خطأ فادح أثناء تنفيذ التعويض.");
        }
    }
};
