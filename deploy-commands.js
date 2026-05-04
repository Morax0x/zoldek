const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

const token = process.env.DISCORD_BOT_TOKEN;
const clientId = "1434804075484020755";
const guildId = "952732360074494003";

if (!token || !clientId || !guildId || guildId === "YOUR_SERVER_ID_HERE" || clientId === "YOUR_BOT_CLIENT_ID_HERE") {
    console.error("!!! خطأ فادح: يرجى التأكد من تعبئة (clientId) و (guildId) وتوفر التوكن.");
    process.exit(1);
}

const commands = [];
const commandsPath = path.join(__dirname, 'commands');

function loadCommands(dir) {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
            loadCommands(fullPath);
        } else if (file.endsWith('.js')) {
            try {
                const command = require(fullPath);
                if (command.data && 'execute' in command) {
                    commands.push(command.data.toJSON());
                    console.log(`[+] تم تحميل: ${command.data.name}`);
                }
            } catch (error) {
                console.error(`[X] خطأ في تحميل ${fullPath}:`, error);
            }
        }
    }
}

console.log("جارٍ البحث عن الأوامر...");
loadCommands(commandsPath);

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
    try {
        console.log(`بدء تحديث ${commands.length} أمر (/) للتطبيق.`);

        const data = await rest.put(
            Routes.applicationGuildCommands(clientId, guildId),
            { body: commands },
        );

        console.log(`✅ تم تحديث ${data.length} أمر بنجاح للسيرفر المحدد!`);
        console.log(`📢 الآن يمكنك تجربة الكليك يمين -> Apps`);
    } catch (error) {
        console.error(error);
    }
})();
