const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { RankCardBuilder } = require("discord-card-canvas");

// 🔥 استدعاء الدالة بشكل آمن ومؤكد 🔥
function getCalculateRequiredXP() {
    try {
        const { calculateRequiredXP } = require('../../handlers/handler-utils.js');
        if (typeof calculateRequiredXP === 'function') return calculateRequiredXP;
    } catch (e) {
        console.error("Failed to load handler-utils.js in level command. Using fallback.");
    }
    
    // معادلة الطوارئ في حال فشل تحميل الملف (نسخة مطابقة للمعادلة القوية)
    return function(lvl) {
        const level = Number(lvl) || 0;
        if (level < 15) return Math.floor(15 * (level ** 2) + (100 * level) + 150);
        if (level < 35) return Math.floor(35 * (level ** 2) + (300 * level) + 1000);
        if (level < 60) return Math.floor(85 * (level ** 2.2) + (800 * level) + 5000);
        return Math.floor(250 * (level ** 2.5) + (2000 * level) + 20000);
    };
}

function getRandomColorHex() {
    const randomColor = Math.floor(Math.random() * 16777215).toString(16);
    return `#${randomColor.padStart(6, '0')}`;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('level')
        .setDescription('عرض بطاقة المستوى الخاصة بك أو بعضو آخر')
        .addUserOption(option => option.setName('user').setDescription('العضو المراد عرض رتبته').setRequired(false)),

    name: 'level',
    aliases: ['lvl', 'لفل', 'مستوى', 'رانك', 'rank'],
    category: "Leveling",
    description: "عرض بطاقة المستوى والرتبة",
    cooldown: 5,

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        const client = interactionOrMessage.client;
        const db = client.sql;
        const guildId = interactionOrMessage.guild.id;

        let targetUser;

        if (isSlash) {
            targetUser = interactionOrMessage.options.getMember('user') || interactionOrMessage.member;
            await interactionOrMessage.deferReply();
        } else {
            targetUser = interactionOrMessage.mentions.members.first() || interactionOrMessage.guild.members.cache.get(args[0]) || interactionOrMessage.member;
        }

        const reply = async (payload) => {
            if (isSlash) return interactionOrMessage.editReply(payload);
            return interactionOrMessage.reply(payload);
        };

        try {
            const score = await client.getLevel(targetUser.id, guildId);

            if (!score) {
                return reply({ content: "❌ هذا العضو ليس لديه رتبة أو مستوى بعد." });
            }

            const totalXp = Number(score.totalXP || score.totalxp) || 0;
            
            // 🔥 حماية استعلام الرانك المزدوجة للسحابة 🔥
            let rank = 1;
            try {
                const rankRes = await db.query(`SELECT COUNT(*) as count FROM levels WHERE "guild" = $1 AND "totalXP" > $2`, [guildId, totalXp]);
                rank = Number(rankRes.rows[0].count) + 1;
            } catch(e) {
                const rankRes = await db.query(`SELECT COUNT(*) as count FROM levels WHERE guild = $1 AND totalxp > $2`, [guildId, totalXp]).catch(()=>({rows:[{count:0}]}));
                rank = Number(rankRes.rows[0].count) + 1;
            }

            const currentLevel = Number(score.level) || 0;
            const currentXp = Number(score.xp) || 0;
            
            // استدعاء دالة حساب الإكس بي الموثوقة
            const calculateRequiredXP = getCalculateRequiredXP();
            const requiredXP = calculateRequiredXP(currentLevel);

            const randomAccentColor = getRandomColorHex(); 
            const hardcodedBlue = "#0CA7FF"; 
            const backgroundColor = "#070d19";
            const userStatus = targetUser.presence ? targetUser.presence.status : "offline";

            const card = new RankCardBuilder({
                currentLvl: currentLevel,
                currentRank: rank,
                currentXP: currentXp, 
                requiredXP: requiredXP,
                backgroundColor: { background: backgroundColor, bubbles: randomAccentColor }, 
                avatarImgURL: targetUser.user.displayAvatarURL({ extension: 'png' }),
                nicknameText: { content: targetUser.user.tag, font: 'Cairo', color: hardcodedBlue },
                userStatus: userStatus,
                progressbarColor: hardcodedBlue,
                levelText: { font: 'Cairo', color: hardcodedBlue },
                rankText: { font: 'Cairo', color: hardcodedBlue },
                xpText: { font: 'Cairo', color: hardcodedBlue },
            });

            const canvasRank = await card.build();
            const attachment = new AttachmentBuilder(canvasRank.toBuffer(), { name: 'rank.png' });
            
            await reply({ files: [attachment] });

        } catch (error) {
            console.error("Error creating rank card:", error);
            await reply({ content: "❌ حدث خطأ أثناء إنشاء بطاقة المستوى." });
        }
    }
};
