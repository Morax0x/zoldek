const { EmbedBuilder } = require('discord.js');

const REWARD_MORA = 25000; 
const REWARD_XP = 5000;    
const EMOJI_MORA = '<:mora:1435647151349698621>'; 

const BOOST_IMAGES = [
    'https://i.postimg.cc/7P2ZnqWn/0880cb8a-9c19-4bcc-b48e-fe1f7d18e61e.png',
    'https://i.postimg.cc/66vpfBmn/1118410b-2e5e-42eb-b4e8-332da08cf6fe.png',
    'https://i.postimg.cc/tRx4N9Md/3a34f764-270e-4fba-b4e9-a2d9c5333fd8.png',
    'https://i.postimg.cc/7P2ZnqWM/ec27dbd0-2b6f-4efa-92b3-b20237316eb7.png'
];

const REACTIONS = [
    '1435572304988868769', 
    '1439665966354268201', 
    '1435572329039007889'  
];

// 🔥 استيراد دالة التلفيل السحرية 🔥
let addXPAndCheckLevel;
try {
    ({ addXPAndCheckLevel } = require('../handlers/handler-utils.js'));
} catch (e) {
    console.error("Missing handler-utils.js in boostDetector", e);
}

module.exports = {
    name: 'messageCreate',
    async execute(message) {
        
        // 🔥 الحماية ضد رسائل الخاص (تمنع انهيار البوت تماماً) 🔥
        if (!message.guild) return;
        
        const client = message.client; 

        // تجاهل رسائل البوتات العادية، مع السماح لرسائل النظام الخاصة بالبوست
        if (message.author.bot && message.type !== 8 && message.type !== 9 && message.type !== 10 && message.type !== 11) return;

        const db = client.sql; 
        if (!db) return; 

        let settings;
        try {
            const res = await db.query(`SELECT "boostChannelID" FROM settings WHERE "guild" = $1`, [message.guild.id]);
            settings = res.rows[0];
        } catch (e) {
            const res = await db.query(`SELECT boostchannelid FROM settings WHERE guild = $1`, [message.guild.id]).catch(()=>({rows:[]}));
            settings = res.rows[0];
        }

        if (!settings || (!settings.boostchannelid && !settings.boostChannelID)) return;
        const targetChannelID = settings.boostChannelID || settings.boostchannelid;
        
        if (message.channel.id !== targetChannelID) return;

        const isSystemBoost = [8, 9, 10, 11].includes(message.type);
        const hasBoostText = message.content.toLowerCase().includes('boosted the server') || 
                             message.content.includes('قام بتعزيز السيرفر') || 
                             (message.system && isSystemBoost);

        if (isSystemBoost || hasBoostText) {
            
            try {
                for (const reactionId of REACTIONS) {
                    await message.react(reactionId).catch(() => {});
                    await new Promise(r => setTimeout(r, 300)); 
                }
            } catch (err) {}

            try {
                // 🔥 استخدام الدالة المركزية لإضافة الجوائز بصمت تام (بدون رفع لفل أو إرسال تهنئة) 🔥
                if (addXPAndCheckLevel && message.member) {
                    // نمرر false في النهاية لكي لا يقوم برفع اللفل وإرسال صورة
                    await addXPAndCheckLevel(client, message.member, db, REWARD_XP, REWARD_MORA, false);
                }
            } catch (err) {
                console.error("[Boost Reward Error]:", err);
            }

            const randomImage = BOOST_IMAGES[Math.floor(Math.random() * BOOST_IMAGES.length)];
            const boosterName = message.member ? message.member.displayName : message.author.username; 

            // إضافة الفواصل للأرقام لتصبح أجمل (مثال: 25,000)
            const msgContent = 
                `✥ **${boosterName}**\n` +
                `✬ مـعـزز جديـد ارتقـى لمصـاف العظمـاء <:sboosting:1439665969864773663>!\n\n` +
                `✶ شكـرا عـلى دعـم الامبراطـوريـة استمتـع بمميزاتـك الخاصـة <a:NekoCool:1435572459276337245>\n\n` +
                `✬ Mora: **${REWARD_MORA.toLocaleString()}** ${EMOJI_MORA} | XP: **${REWARD_XP.toLocaleString()}** <a:levelup:1437805366048985290>`;

            await message.channel.send({ 
                content: msgContent,
                files: [randomImage] 
            }).catch(() => {});
        }
    }
};
