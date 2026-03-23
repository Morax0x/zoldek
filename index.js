const { Client, GatewayIntentBits, Collection, REST, Routes, Partials, Events } = require("discord.js");
require('dotenv').config();
const fs = require('fs');
const path = require('path');

// 1. الاتصال بقاعدة البيانات مع إعدادات حماية الـ  Pool
const db = require('./database.js');

const aiConfig = require('./utils/aiConfig');
const { generateQuestAlert } = require('./generators/achievement-generator.js'); 
const { generateAchievementCard } = require('./generators/achievement-card-generator.js'); 
const { initGiveaways } = require('./handlers/giveaway-handler.js');
const { loadRoleSettings } = require('./handlers/reaction-role-handler.js');
const autoJoin = require('./handlers/auto-join.js'); 
const { startAuctionSystem } = require('./handlers/auction-handler.js');
const { startAutoChat } = require('./handlers/ai/auto-chat.js');
// 🔥 إضافة نظام النسخ الاحتياطي التلقائي 🔥
const { startAutoBackup } = require('./utils/auto-backup.js');

const MAIN_GUILD_ID = "952732360074494003"; 
const botToken = process.env.DISCORD_BOT_TOKEN;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.DirectMessages 
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction] 
});

// 🔥 إدارة أخطاء قاعدة البيانات العالمية (تمنع انهيار البوت عند ضغط السحابة)
if (db) {
    db.on('error', (err) => {
        console.error('❌ [Critical DB Pool Error]:', err.message);
    });
}

client.commands = new Collection();
client.cooldowns = new Collection();
client.talkedRecently = new Map();
client.recentMessageTimestamps = new Collection(); 
client.antiRolesCache = new Map(); 

client.EMOJI_MORA = '<:mora:1435647151349698621>';
client.EMOJI_STAR = '⭐';
client.EMOJI_WI = '<a:wi:1435572304988868769>';
client.EMOJI_WII = '<a:wii:1435572329039007889>';
client.EMOJI_FASTER = '<a:JaFaster:1435572430042042409>';
client.EMOJI_PRAY = '<:0Pray:1437067281493524502>';
client.EMOJI_COOL = '<a:NekoCool:1435572459276337245>';

client.sql = db;
client.db = db; 

client.generateQuestAlert = generateQuestAlert;
client.generateAchievementCard = generateAchievementCard; 

try {
    const { registerFont } = require('canvas');
    const beinPath = path.join(__dirname, 'fonts', 'bein-ar-normal.ttf');
    if (fs.existsSync(beinPath)) registerFont(beinPath, { family: 'Bein' });
    else {
        const beinPathAlt = path.join(__dirname, 'fonts', 'Bein-Normal.ttf');
        if (fs.existsSync(beinPathAlt)) registerFont(beinPathAlt, { family: 'Bein' });
    }
    const emojiPath = path.join(__dirname, 'efonts', 'NotoEmoji.ttf');
    if (fs.existsSync(emojiPath)) registerFont(emojiPath, { family: 'NotoEmoji' });
} catch (e) {}

// 🔥 دالة تسجيل الأوامر مفصولة لتجنب الخنق 🔥
async function registerCommands() {
    const rest = new REST({ version: '10' }).setToken(botToken);
    const commands = [];
    const loadedCommandNames = new Set();

    function getFiles(dir) {
        const files = fs.readdirSync(dir, { withFileTypes: true });
        let commandFiles = [];
        for (const file of files) {
            if (file.isDirectory()) commandFiles = [...commandFiles, ...getFiles(path.join(dir, file.name))];
            else if (file.name.endsWith('.js')) commandFiles.push(path.join(dir, file.name));
        }
        return commandFiles;
    }

    const commandFiles = getFiles(path.join(__dirname, 'commands'));
    for (const file of commandFiles) {
        try {
            const command = require(file);
            const cmdName = command.data ? command.data.name : command.name;
            if (cmdName) {
                if (loadedCommandNames.has(cmdName)) continue;
                loadedCommandNames.add(cmdName);
                if (command.data) commands.push(command.data.toJSON());
                if ('execute' in command) client.commands.set(cmdName, command);
            }
        } catch (err) {}
    }
      
    try { 
        await rest.put(Routes.applicationGuildCommands(client.user.id, MAIN_GUILD_ID), { body: [] });
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log("✅ Slash commands registered successfully!");
    } catch (error) {
        console.error("❌ Failed to register slash commands:", error);
    }
}

async function bootstrap() {
    try {
        console.log("⏳ Loading and checking database tables...");
        const dbSetupModule = require("./database-setup.js");
        const setupDatabase = dbSetupModule.setupDatabase || dbSetupModule;
        await setupDatabase(client.sql); 

        if (aiConfig && typeof aiConfig.init === 'function') {
            await aiConfig.init(client.sql); 
        }
        console.log("✅ Database and AI Config initialized successfully!");
    } catch (err) {
        console.error("!!! Database Setup Fatal Error !!!", err);
        setTimeout(() => process.exit(1), 5000);
    }

    require('./utils/db-manager.js')(client, client.sql);
    require('./handlers/systems-manager.js')(client, client.sql);
    try { require('./handlers/backup-scheduler.js')(client, client.sql); } catch(e) {}

    const eventsPath = path.join(__dirname, 'events');
    const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
    for (const file of eventFiles) { 
        const filePath = path.join(eventsPath, file); 
        const event = require(filePath); 
        if (event.once) client.once(event.name, (...args) => event.execute(...args, client)); 
        else client.on(event.name, (...args) => event.execute(...args, client)); 
    }

    require('./interaction-handler.js')(client, client.sql, client.antiRolesCache);

    client.once(Events.ClientReady, async () => { 
        console.log(`✅ Logged in as ${client.user.username}`);
          
        // 🔥 تشغيل المؤقتات (القلب النابض) فوراً بدون أي تأخير 🔥
        try { 
            console.log("⏳ Starting Cron Jobs...");
            require('./handlers/cron-jobs.js')(client, client.sql); 
            console.log("✅ Cron Jobs Started Successfully!");
        } catch(e) { console.error("❌ Cron Jobs Failed:", e.message); }

        try { await autoJoin(client); } catch(e) {}
        try { await initGiveaways(client); } catch(e) {}
        try { require('./handlers/voice-timer.js')(client); } catch(e) {}
        try { startAuctionSystem(client); } catch(e) {}
        try { startAutoChat(client); } catch(e) {}
        try { require('./handlers/weekly-role.js')(client); } catch(e) {}

        try { await loadRoleSettings(client.sql, client.antiRolesCache); } catch(e) {}
        
        try { startAutoBackup(client); } catch(e) {}

        try { 
            const { resumeActiveDungeons } = require('./handlers/dungeon-handler.js');
            if (resumeActiveDungeons) await resumeActiveDungeons(client, client.sql);
        } catch(e) {}

        // تسجيل الأوامر في الخلفية لكي لا يعيق تشغيل البوت
        registerCommands();
    }); 

    try { require('./handlers/topgg-handler.js')(client, client.sql); } catch (err) {}

    client.login(botToken);
}

bootstrap();

// ==========================================
// 🛡️ نظام الإغلاق الآمن المطوّر
// ==========================================
async function shutdownGracefully(signal) {
    console.log(`\n🛑 [${signal}] الإمبراطور أمر بإنهاء البوت... جاري التوقف !`);
    
    try {
        if (client.user) {
            client.user.setStatus('dnd');
            client.user.setActivity('جاري حفظ البيانات...', { type: 3 });
        }

        if (client.sql) {
            console.log("⏳ جاري رفع بيانات الرام المهمة إلى السحابة...");
            
            // ⚠️ حفظ أوقات الفويس العالقة:
            if (client.voiceJoinedTracker && client.voiceJoinedTracker.size > 0) {
                const now = Date.now();
                let savedCount = 0;
                
                for (const [userId, joinInfo] of client.voiceJoinedTracker.entries()) {
                    try {
                        const minutesSpent = Math.floor((now - joinInfo.timestamp) / 60000);
                        if (minutesSpent > 0 && client.addVoiceTime) {
                            await client.addVoiceTime(userId, joinInfo.guildId, minutesSpent);
                            savedCount++;
                        }
                    } catch (e) {}
                }
                console.log(`✅ تم إنقاذ أوقات ${savedCount} عضو من الرومات الصوتية!`);
            }
        }

    } catch (err) {
        console.error("❌ حدث خطأ أثناء التوقف الآمن:", err.message);
    } finally {
        console.log("👋 وداعاً... (البوت توقف الآن)");
        if (client) client.destroy();
        if (db) {
            setTimeout(async () => {
                await db.end();
                process.exit(0);
            }, 2000);
        } else {
            process.exit(0);
        }
    }
}

process.on('SIGINT', () => shutdownGracefully('SIGINT'));
process.on('SIGTERM', () => shutdownGracefully('SIGTERM'));

// منع انهيار البوت من الأخطاء غير المتوقعة
process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});
