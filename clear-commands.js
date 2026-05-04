const { REST, Routes } = require('discord.js');

const token = process.env.DISCORD_BOT_TOKEN;
const clientId = "1434804075484020755";
const guildId = "952732360074494003";

if (!token || !clientId || !guildId || guildId === "YOUR_SERVER_ID_HERE" || clientId === "YOUR_BOT_CLIENT_ID_HERE") {
    console.error("!!! خطأ فادح: يرجى فتح ملف clear-commands.js وتعبئة (clientId) و (guildId) يدوياً.");
    process.exit(1);
}

const rest = new REST().setToken(token);

(async () => {
    try {
        console.log('بدء حذف أوامر السيرفر (Guild)...');
        await rest.put(
            Routes.applicationGuildCommands(clientId, guildId),
            { body: [] }, 
        );
        console.log('✅ تم حذف أوامر السيرفر (Guild) بنجاح.');

        console.log('بدء حذف الأوامر العالمية (Global)...');
        await rest.put(
            Routes.applicationCommands(clientId),
            { body: [] }, 
        );
        console.log('✅ تم حذف الأوامر العالمية (Global) بنجاح.');

        console.log('--- ✅ اكتمل التنظيف ---');

    } catch (error) {
        console.error('حدث خطأ أثناء حذف الأوامر:', error);
    }
})();
