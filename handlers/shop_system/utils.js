const { EmbedBuilder, Colors } = require("discord.js");
const path = require('path');

const EMOJI_MORA = '<:mora:1435647151349698621>'; 
const OWNER_ID = "1145327691772481577"; 
const XP_EXCHANGE_RATE = 3;
const BANNER_URL = 'https://i.postimg.cc/NMkWVyLV/line.png';

let shopItems = [], potionItems = [], farmAnimals = [], weaponsConfig = [], skillsConfig = [];

// 🔥 تم استخدام try/catch لضمان عدم انهيار البوت إذا كان فيه مشكلة في ملفات JSON 🔥
try { shopItems = require('../../json/shop-items.json'); } catch(e){}
try { potionItems = require('../../json/potions.json'); } catch(e){}
try { farmAnimals = require('../../json/farm-animals.json'); } catch(e){}
try { weaponsConfig = require('../../json/weapons-config.json'); } catch(e){}
try { skillsConfig = require('../../json/skills-config.json'); } catch(e){}

const rootDir = process.cwd();
let rodsConfig = [], boatsConfig = [], baitsConfig = [];
try {
    const fishingConfig = require(path.join(rootDir, 'json', 'fishing-config.json'));
    rodsConfig = fishingConfig.rods || [];
    boatsConfig = fishingConfig.boats || [];
    baitsConfig = fishingConfig.baits || [];
} catch (e) { 
    // محاولة قراءة الملف القديم لو فشل الجديد
    try {
        const fishJson = require(path.join(rootDir, 'json', 'fish.json'));
        rodsConfig = fishJson.rods || [];
        boatsConfig = fishJson.boats || [];
        baitsConfig = fishJson.baits || [];
    } catch(err) {
        console.error("Error loading fishing config:", err); 
    }
}

const THUMBNAILS = new Map([
    ['upgrade_weapon', 'https://i.postimg.cc/CMXxsXT1/tsmym-bdwn-ʿnwan-7.png'],
    ['upgrade_skill', 'https://i.postimg.cc/CMkxJJF4/tsmym-bdwn-ʿnwan-8.png'],
    ['upgrade_rod', 'https://i.postimg.cc/Wz0g0Zg0/fishing.png'], 
    ['upgrade_boat', 'https://i.postimg.cc/Wz0g0Zg0/fishing.png'], 
    ['exchange_xp', 'https://i.postimg.cc/2yKbQSd3/tsmym-bdwn-ʿnwan-6.png'],
    ['personal_guard_1d', 'https://i.postimg.cc/CMv2qp8n/tsmym-bdwn-ʿnwan-1.png'],
    ['streak_shield', 'https://i.postimg.cc/3rbLwCMj/tsmym-bdwn-ʿnwan-2.png'],
    ['streak_shield_media', 'https://i.postimg.cc/3rbLwCMj/tsmym-bdwn-ʿnwan-2.png'],
    ['xp_buff_1d_3', 'https://i.postimg.cc/TP9zNLK4/tsmym-bdwn-ʿnwan-3.png'],
    ['xp_buff_1d_7', 'https://i.postimg.cc/Gmn6cJYG/tsmym-bdwn-ʿnwan-4.png'],
    ['xp_buff_2d_10', 'https://i.postimg.cc/NFrPt5jN/tsmym-bdwn-ʿnwan-5.png'],
    ['vip_role_3d', 'https://i.postimg.cc/4drRpC7d/2.webp'],
    ['discord_effect_5', 'https://i.postimg.cc/50QZ4PPL/1.webp'],
    ['discord_effect_10', 'https://i.postimg.cc/tJHmX9nh/3.webp'],
    ['nitro_basic', 'https://i.postimg.cc/Qxmn3G8K/5.webp'],
    ['nitro_gaming', 'https://i.postimg.cc/kXJfw1Q4/6.webp'],
    ['change_race', 'https://i.postimg.cc/rs4mmjvs/tsmym-bdwn-ʿnwan-9.png'],
    ['item_temp_reply', 'https://cdn-icons-png.flaticon.com/512/3063/3063822.png'],
    ['potions_menu', 'https://cdn-icons-png.flaticon.com/512/867/867927.png']
]);

async function ensureInventoryTable(db) {
    if(!db) return;
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS user_inventory (
                "id" BIGSERIAL PRIMARY KEY,
                "guildID" TEXT,
                "userID" TEXT,
                "itemID" TEXT,
                "quantity" BIGINT DEFAULT 0,
                UNIQUE("guildID", "userID", "itemID")
            );
        `);
    } catch(e) {
        console.error("[Database Error] ensureInventoryTable failed:", e.message);
    }
}

async function sendShopLog(client, guildId, member, item, price, type = "شراء") {
    try {
        let settingsRes;
        try { settingsRes = await client.db.query(`SELECT "shopLogChannelID" FROM settings WHERE "guild" = $1`, [guildId]); }
        catch(e) { settingsRes = await client.db.query(`SELECT shoplogchannelid FROM settings WHERE guild = $1`, [guildId]).catch(()=>({rows:[]})); }
        
        const settings = settingsRes.rows[0];
        if (!settings || (!settings.shopLogChannelID && !settings.shoplogchannelid)) return;
        
        const channelId = settings.shopLogChannelID || settings.shoplogchannelid;
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel) return;

        const embed = new EmbedBuilder()
            .setTitle(`🛒 سجل عمليات المتجر`)
            .setColor(type.includes("بيع") ? Colors.Green : Colors.Gold)
            .addFields(
                { name: '👤 العضو', value: `${member} \n(\`${member.id}\`)`, inline: true },
                { name: '📦 العنصر', value: `**${item}**`, inline: true },
                { name: '💰 المبلغ', value: `**${price.toLocaleString()}** ${EMOJI_MORA}`, inline: true },
                { name: '🏷️ نوع العملية', value: type, inline: true },
                { name: '⏰ الوقت', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
            )
            .setThumbnail(member.user.displayAvatarURL())
            .setTimestamp();
            
        await channel.send({ embeds: [embed] }).catch(()=>{});
    } catch (e) { 
        // نتجاهل الأخطاء البسيطة عشان ما يعلق المتجر بسبب اللوج
        // console.error("[Shop Log Error]", e.message); 
    }
}

module.exports = {
    EMOJI_MORA,
    OWNER_ID,
    XP_EXCHANGE_RATE,
    BANNER_URL,
    THUMBNAILS,
    shopItems,
    potionItems,
    farmAnimals,
    weaponsConfig,
    skillsConfig,
    rodsConfig,
    boatsConfig,
    baitsConfig,
    ensureInventoryTable,
    sendShopLog
};
