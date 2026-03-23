const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

let farmAnimals;
try {
    farmAnimals = require('../../json/farm-animals.json');
} catch(e) {
    farmAnimals = require('../json/farm-animals.json');
}

const EMOJI_MORA = '<:mora:1435647151349698621>';
const OWNER_ID = "1145327691772481577";

module.exports = {
    data: new SlashCommandBuilder()
        .setName('farm-comp')
        .setDescription('تعويض المزارعين عن 3 أيام (أمر مؤقت وخاص بالإمبراطور)'),
    
    async execute(interaction) {
        // 1. حماية إضافية: لا أحد يستطيع تشغيله غيرك
        if (interaction.user.id !== OWNER_ID) {
            return interaction.reply({ content: "❌ هذا الأمر مخصص للإمبراطور فقط!", ephemeral: true });
        }

        const db = interaction.client.sql;
        if (!db) return interaction.reply({ content: "❌ لا يوجد اتصال بقاعدة البيانات.", ephemeral: true });

        // 2. تعليق الرد لأن العملية ستأخذ وقتاً طويلاً
        await interaction.deferReply();

        try {
            const guildId = interaction.guild.id;

            // 3. جلب جميع المزارعين وحيواناتهم
            let userFarmRes;
            try { userFarmRes = await db.query(`SELECT "userID", "animalID", "quantity" FROM user_farm WHERE "guildID" = $1`, [guildId]); }
            catch(e) { userFarmRes = await db.query(`SELECT userid as "userID", animalid as "animalID", quantity FROM user_farm WHERE guildid = $1`, [guildId]).catch(()=>({rows:[]})); }

            const userFarm = userFarmRes.rows;
            if (!userFarm || userFarm.length === 0) {
                return interaction.editReply("❌ لم أجد أي حيوانات في مزارع اللاعبين لتعويضهم.");
            }

            // 4. حساب التعويض لكل لاعب (دخل 3 أيام بغض النظر عن الجوع)
            const userIncomes = new Map();
            for (const row of userFarm) {
                const uid = row.userID;
                const aid = row.animalID;
                const qty = Number(row.quantity) || 1;

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

            await interaction.editReply(`⏳ **تم بدء عملية التعويض!**\nجاري إيداع المورا وإرسال الإعلانات لـ **${userIncomes.size}** مزارع.\n*(الرجاء عدم إرسال رسائل كثيرة هنا حتى ينتهي البوت لتجنب اللاج...)*`);

            let successCount = 0;

            // 5. حلقة التوزيع والإرسال الآمن (مضاد للباند)
            for (const [uid, amount] of userIncomes.entries()) {
                try {
                    // أ. إضافة المورا مباشرة في الرصيد
                    try {
                        await db.query(`UPDATE levels SET "mora" = COALESCE(CAST("mora" AS BIGINT), 0) + $1 WHERE "user" = $2 AND "guild" = $3`, [amount, uid, guildId]);
                    } catch(e) {
                        await db.query(`UPDATE levels SET mora = COALESCE(CAST(mora AS BIGINT), 0) + $1 WHERE userid = $2 AND guildid = $3`, [amount, uid, guildId]).catch(()=>{});
                    }

                    // ب. إنشاء الإيمبد المطلوب
                    const embed = new EmbedBuilder()
                        .setTitle('✥ إعلان من القصر الإمبراطوري !')
                        .setDescription(`✦ مزارعو الإمبراطورية يُكافَؤون بزيادة ثلاثية في إنتاجهم تقديرًا لإخلاصهم\n✦ حـصـلـت عـلـى: **${amount.toLocaleString()}** ${EMOJI_MORA}`)
                        .setColor('Random')
                        .setThumbnail('https://i.postimg.cc/cLjcQKYN/Ganzo-pixel.jpg')
                        .setFooter({ text: 'Empire | الامبراطورية ™' });

                    // ج. إرسال الرسالة مع المنشن
                    await interaction.channel.send({ content: `<@${uid}>`, embeds: [embed] });
                    successCount++;

                } catch (err) {
                    console.error(`Failed to compensate user ${uid}:`, err.message);
                }

                // 🔥 سحر الأمان: تأخير لمدة ثانيتين (2000 ملي ثانية) بين كل رسالة والأخرى لتجنب باند ديسكورد 🔥
                await new Promise(resolve => setTimeout(resolve, 2000));
            }

            // 6. رسالة النهاية
            await interaction.channel.send(`✅ **اكتمل المرسوم الإمبراطوري!**\nتم تعويض **${successCount}** مزارع بنجاح بإنتاج 3 أيام.`);

        } catch (error) {
            console.error(error);
            await interaction.channel.send("❌ حدث خطأ فادح أثناء تنفيذ التعويض.");
        }
    }
};
