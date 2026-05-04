const { EmbedBuilder, PermissionsBitField, Colors } = require("discord.js");

module.exports = {
    name: "setcamps",
    aliases: ["تحديد_خيم", "scamp", "setcampfire", "campadmin"],
    description: "إدارة حدود الخيم للرتب (عرض القائمة أو تعيين حد جديد)",
    category: "Admin",
    usage: "-setcamps [@Role] [Number]",

    async execute(message, args) {
        const { guild, client } = message;
        const db = client.sql;

        // 1. التحقق من الصلاحيات (أدمن فقط)
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply("🚫 **ليس لديك صلاحية لاستخدام هذا الأمر.**");
        }

        // ============================================================
        // الحالة الأولى: عرض القائمة (إذا لم يحدد رتبة)
        // ============================================================
        if (!args[0]) {
            // جلب البيانات من الجدول مع حماية للأعمدة
            let allRolesRes;
            try {
                allRolesRes = await db.query(`SELECT "roleID", "limitCount" FROM role_campfire_limits WHERE "guildID" = $1 ORDER BY "limitCount" DESC`, [guild.id]);
            } catch(e) {
                allRolesRes = await db.query(`SELECT roleid as "roleID", limitcount as "limitCount" FROM role_campfire_limits WHERE guildid = $1 ORDER BY limitcount DESC`, [guild.id]).catch(()=>({rows:[]}));
            }
            const allRoles = allRolesRes.rows;

            if (!allRoles || allRoles.length === 0) {
                return message.reply({ 
                    embeds: [
                        new EmbedBuilder()
                            .setTitle("⛺ إعدادات الخيم")
                            .setDescription("❌ **لا توجد رتب مخصصة حالياً.**\nجميع اللاعبين لديهم الحد الافتراضي (خيمة واحدة).")
                            .setColor(Colors.Red)
                            .setFooter({ text: "استخدم الأمر مع رتبة لتخصيص العدد." })
                    ]
                });
            }

            // تنسيق القائمة
            let description = "**قائمة الرتب وعدد الخيم المسموح:**\n\n";
            let foundCount = 0;

            for (const data of allRoles) {
                const roleID = data.roleID || data.roleid;
                const limitCount = data.limitCount || data.limitcount;
                const role = guild.roles.cache.get(roleID);
                
                if (role) {
                    description += `**${foundCount + 1}.** ${role} ➔ \`${limitCount}\` ⛺\n`;
                    foundCount++;
                } else {
                    // تنظيف الرتب المحذوفة تلقائياً
                    try {
                        await db.query(`DELETE FROM role_campfire_limits WHERE "guildID" = $1 AND "roleID" = $2`, [guild.id, roleID]);
                    } catch(e) {
                        await db.query(`DELETE FROM role_campfire_limits WHERE guildid = $1 AND roleid = $2`, [guild.id, roleID]).catch(()=>{});
                    }
                }
            }

            if (foundCount === 0) description = "لا توجد بيانات (تم تنظيف الرتب المحذوفة).";

            const listEmbed = new EmbedBuilder()
                .setTitle("⛺ لوحة تحكم الخيم (Campfire Limits)")
                .setColor(Colors.Blue)
                .setDescription(description)
                .addFields({ 
                    name: '💡 طريقة التعديل:', 
                    value: `\`${this.usage || '-setcamps @Role 5'}\`` 
                })
                .setThumbnail("https://i.postimg.cc/KcJ6gtzV/22.jpg");

            return message.reply({ embeds: [listEmbed] });
        }

        // ============================================================
        // الحالة الثانية: تعيين حد جديد لرتبة
        // ============================================================
        
        const role = message.mentions.roles.first() || guild.roles.cache.get(args[0]);
        const limit = parseInt(args[1]);

        // التحقق من صحة المدخلات
        if (!role) {
            return message.reply("⚠️ **لم يتم العثور على الرتبة!** تأكد من منشن الرتبة أو وضع الآيدي بشكل صحيح.");
        }

        if (isNaN(limit) || limit < 1) {
            return message.reply("⚠️ **الرقم غير صحيح!** يجب أن يكون عدد الخيم 1 أو أكثر.\nمثال: `-setcamps @VIP 5`");
        }

        try {
            // 🔥 الحماية الفولاذية: حذف القديم ثم إضافة الجديد بدل ON CONFLICT 🔥
            try {
                await db.query(`DELETE FROM role_campfire_limits WHERE "guildID" = $1 AND "roleID" = $2`, [guild.id, role.id]);
                await db.query(`INSERT INTO role_campfire_limits ("guildID", "roleID", "limitCount") VALUES ($1, $2, $3)`, [guild.id, role.id, limit]);
            } catch(e) {
                await db.query(`DELETE FROM role_campfire_limits WHERE guildid = $1 AND roleid = $2`, [guild.id, role.id]).catch(()=>{});
                await db.query(`INSERT INTO role_campfire_limits (guildid, roleid, limitcount) VALUES ($1, $2, $3)`, [guild.id, role.id, limit]).catch(()=>{});
            }

            const successEmbed = new EmbedBuilder()
                .setTitle("✅ تم تحديث إعدادات الخيم")
                .setColor(Colors.Green)
                .setDescription(
                    `تم بنجاح تعيين الحد الأقصى للخيم لهذه الرتبة:\n\n` +
                    `🔰 **الرتبة:** ${role}\n` +
                    `🔢 **العدد الجديد:** \`${limit}\` خيم يومياً`
                )
                .setThumbnail("https://i.postimg.cc/KcJ6gtzV/22.jpg")
                .setFooter({ text: `تم التعديل بواسطة: ${message.author.username}`, iconURL: message.author.displayAvatarURL() })
                .setTimestamp();

            message.reply({ embeds: [successEmbed] });

        } catch (err) {
            console.error(err);
            message.reply("❌ حدث خطأ تقني أثناء حفظ البيانات.");
        }
    }
};
