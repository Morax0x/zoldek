const { SlashCommandBuilder } = require('discord.js');

const OWNER_ID = "1145327691772481577"; // آيدي الإمبراطور

module.exports = {
    data: new SlashCommandBuilder()
        .setName('فحص-البيانات')
        .setDescription('أمر خاص بالإمبراطور لفحص بيانات السحابة مباشرة (أسلحة/مهارات/أعراق)'),
    
    name: 'checkdb',
    aliases: ['فحص-داتا'],
    category: "Owner",
    description: 'فحص بيانات السحابة مباشرة',

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        const message = isSlash ? interactionOrMessage : interactionOrMessage;
        const user = isSlash ? interactionOrMessage.user : interactionOrMessage.author;
        const client = message.client;

        // حماية: الأمر لك أنت فقط
        if (user.id !== OWNER_ID) return message.reply("👑 هذا الأمر للإمبراطور فقط.");

        if (isSlash) await interactionOrMessage.deferReply({ ephemeral: true });

        const reply = async (content) => {
            if (isSlash) return interactionOrMessage.editReply({ content });
            return message.reply({ content });
        };

        try {
            // جلب البيانات من السحابة
            const weapons = await client.sql.query(`SELECT * FROM user_weapons WHERE "userID" = $1`, [user.id]);
            const skills = await client.sql.query(`SELECT * FROM user_skills WHERE "userID" = $1`, [user.id]);
            const races = await client.sql.query(`SELECT * FROM race_roles WHERE "guildID" = $1 LIMIT 3`, [message.guild.id]);

            let text = `📊 **نتيجة فحص السحابة (Supabase) لـ ${user.username}:**\n\n`;

            text += `⚔️ **أسلحتك (${weapons.rowCount}):**\n\`\`\`json\n${JSON.stringify(weapons.rows, null, 2)}\n\`\`\`\n`;
            text += `✨ **مهاراتك (${skills.rowCount}):**\n\`\`\`json\n${JSON.stringify(skills.rows, null, 2)}\n\`\`\`\n`;
            text += `🧬 **بعض رولات الأعراق المسجلة بالسيرفر (${races.rowCount}):**\n\`\`\`json\n${JSON.stringify(races.rows, null, 2)}\n\`\`\``;

            // حماية من تجاوز حد ديسكورد (2000 حرف)
            if (text.length > 1950) {
                text = text.substring(0, 1950) + "\n\n... (تم قص النص لأنه طويل جداً)";
            }
            
            await reply(text);

        } catch (err) {
            await reply(`❌ **حدث خطأ أثناء فحص السحابة:**\n\`\`\`${err.message}\`\`\``);
        }
    }
};
