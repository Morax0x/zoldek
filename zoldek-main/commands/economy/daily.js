const { EmbedBuilder, Colors, SlashCommandBuilder } = require("discord.js");
const { calculateMoraBuff } = require('../../streak-handler.js');

let updateGuildStat;
try {
    ({ updateGuildStat } = require('../../handlers/guild-board-handler.js'));
} catch (e) {}

const REWARDS = {
    1: { min: 100, max: 150 },
    2: { min: 150, max: 200 },
    3: { min: 200, max: 300 },
    4: { min: 300, max: 450 },
    5: { min: 450, max: 600 },
    6: { min: 600, max: 800 },
    7: { min: 800, max: 1000 } 
};
const MAX_STREAK_DAY = 7;

function getRandomAmount(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getKSADateString(timestamp) {
    return new Date(timestamp).toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' });
}

function getTimeUntilNextMidnightKSA() {
    const now = new Date();
    const ksaTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Riyadh' }));
    
    const nextMidnight = new Date(ksaTime);
    nextMidnight.setHours(24, 0, 0, 0); 
    
    return nextMidnight.getTime() - ksaTime.getTime();
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('daily')
        .setDescription('احصل على راتبك اليومي (يتجدد الساعة 12 ص بتوقيت السعودية).'),

    name: 'daily',
    aliases: ['راتب', 'يومي', 'd', 'جائزة', 'جائزه'],
    category: "Economy",
    description: "احصل على راتبك اليومي",

    async execute(interactionOrMessage, args) {

        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, client, guild, user, member;

        if (isSlash) {
            interaction = interactionOrMessage;
            member = interaction.member;
            user = interaction.user;
            guild = interaction.guild;
            client = interaction.client;
            await interaction.deferReply();
        } else {
            message = interactionOrMessage;
            member = message.member;
            user = message.author;
            guild = message.guild;
            client = message.client;
        }

        const reply = async (payload) => {
            if (isSlash) {
                return interaction.editReply(payload);
            } else {
                return message.channel.send(payload);
            }
        };

        const sql = client.sql;

        let data = await client.getLevel(user.id, guild.id);
        if (!data) {
            data = { ...client.defaultData, user: user.id, guild: guild.id };
        }

        const now = Date.now();
        const lastDaily = Number(data.lastDaily || data.lastdaily) || 0;

        const todayKSA = getKSADateString(now);
        const lastDailyKSA = getKSADateString(lastDaily);

        if (todayKSA === lastDailyKSA) {
            const timeLeft = getTimeUntilNextMidnightKSA();
            const nextTimeUnix = Math.floor((Date.now() + timeLeft) / 1000);

            const cooldownEmbed = new EmbedBuilder()
                .setColor('#2291D4')
                .setThumbnail('https://i.postimg.cc/c428jYdZ/Daily.png')
                .setDescription(
                    `❖ استـلـمـت راتبـك بالفعـل <:stop:1436337453098340442>\n` +
                    `✶ يمكـنـك استلام راتبـك التالي:\n` +
                    `✶ <t:${nextTimeUnix}:R>`
                );

            if (isSlash) return interaction.editReply({ embeds: [cooldownEmbed], ephemeral: true });
            return message.reply({ embeds: [cooldownEmbed] });
        }

        let newStreak = Number(data.dailyStreak || data.dailystreak) || 0;
        
        const date1 = new Date(todayKSA);
        const date2 = new Date(lastDailyKSA);
        
        const dayDifference = Math.round((date1 - date2) / (1000 * 60 * 60 * 24));

        if (dayDifference === 1) {
            newStreak += 1;
        } else {
            newStreak = 1;
        }

        const currentRewardKey = newStreak > MAX_STREAK_DAY ? MAX_STREAK_DAY : newStreak;
        
        const rewardRange = REWARDS[currentRewardKey];
        const baseAmount = getRandomAmount(rewardRange.min, rewardRange.max);

        const moraMultiplier = await calculateMoraBuff(member, sql);
        const finalAmount = Math.floor(baseAmount * moraMultiplier);

        data.mora = (Number(data.mora) || 0) + finalAmount;
        data.lastDaily = now;
        data.dailyStreak = newStreak;

        await client.setLevel(data);

        if (updateGuildStat) {
            updateGuildStat(client, guild.id, user.id, 'mora_earned', finalAmount);
        }

        let descriptionLines;
        let buffString = "";
        const buffPercent = (moraMultiplier - 1) * 100;

        if (buffPercent > 0) {
            buffString = ` (+${buffPercent.toFixed(0)}%)`;
        } else if (buffPercent < 0) {
            buffString = ` (${buffPercent.toFixed(0)}%)`;
        }

        descriptionLines = [
            `✥ استلـمـت جـائـزتـك اليـوميـة`,
            `✶ حـصـلـت عـلـى **${finalAmount}** <:mora:1435647151349698621>${buffString}`,
            `✶ أنت في اليوم **${newStreak}** على التوالـي!`
        ];

        const embed = new EmbedBuilder()
            .setColor(Colors.Gold)
            .setTitle('💰 جـائـزتـك اليومـيـة')
            .setThumbnail(user.displayAvatarURL())
            .setDescription(descriptionLines.join('\n'))
            .setTimestamp();

        await reply({ embeds: [embed] });
    }
};
