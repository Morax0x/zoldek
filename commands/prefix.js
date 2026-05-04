const { PermissionsBitField } = require("discord.js");

module.exports = {
    name: 'prefix',
    aliases: ['set-prefix', 'بريفكس'],
    category: "Admin",
    description: "Set server prefix",
    cooldown: 3,

    async execute (message, args) {
        const isSlash = !!message.isChatInputCommand;
        if (isSlash) return;

        const guild = message.guild;
        const client = message.client;
        const member = message.member;
        const db = client.sql;

        if(!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return message.reply(`❌ **عذراً، لا تملك صلاحية \`ManageGuild\` لاستخدام هذا الأمر.**`);
        }

        if (!args[0]) return message.reply(`❌ **الرجاء كتابة البريفكس الجديد.**\nمثال: \`-prefix !\``);
        const newPrefix = args[0];

        let currentPrefix = "-";
        try {
            // استخدام الجدول الموحد للبريفكس
            const res = await db.query(`SELECT "serverprefix" FROM prefix WHERE "guild" = $1`, [guild.id]);
            if (res.rows.length > 0 && res.rows[0].serverprefix) {
                currentPrefix = res.rows[0].serverprefix;
            }
        } catch (e) {
            // يمكن تجاهل الخطأ هنا في حال كان الجدول غير موجود، سيتم إنشاؤه في الخطوة التالية
        }

        if(newPrefix === currentPrefix) {
            return message.reply(`⚠ **هذا هو البريفكس الحالي بالفعل!**`);
        }

        try {
            // إنشاء الجدول في حال لم يكن موجوداً لضمان عدم حدوث خطأ
            await db.query(`CREATE TABLE IF NOT EXISTS prefix ("guild" TEXT PRIMARY KEY, "serverprefix" TEXT)`);

            await db.query(`
                INSERT INTO prefix ("guild", "serverprefix") 
                VALUES ($1, $2) 
                ON CONFLICT("guild") DO UPDATE SET "serverprefix" = EXCLUDED."serverprefix"
            `, [guild.id, newPrefix]);
            
            return message.reply(`✅ **تم تغيير بريفكس السيرفر بنجاح إلى:** \`${newPrefix}\``);
            
        } catch (error) {
            console.error("Prefix change error:", error);
            return message.reply("❌ **حدث خطأ أثناء حفظ البيانات في قاعدة البيانات.**");
        }
    }
}
