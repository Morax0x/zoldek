const { 
    EmbedBuilder, 
    SlashCommandBuilder, 
    MessageFlags, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ComponentType 
} = require("discord.js");
const path = require('path');

const rootDir = process.cwd();
let fishingConfig = { rods: [], boats: [] };
try {
    fishingConfig = require(path.join(rootDir, 'json', 'fishing-config.json'));
} catch (e) {
    fishingConfig.rods = [{ level: 1, cooldown: 300000 }]; 
    fishingConfig.boats = [{ level: 1, speed_bonus: 0 }];
}

const EMOJI_READY = '🟢';
const EMOJI_WAIT = '🔴';
const EMOJI_ALL = '🟣';
const HIDDEN_EMBED_IMAGE = 'https://i.postimg.cc/m2ZrjxB9/time.png';

function formatTimeSimple(ms) {
    if (ms < 0) ms = 0;
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function getTimeUntilNextMidnightKSA() {
    const now = new Date();
    const ksaTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Riyadh' }));
    const nextMidnight = new Date(ksaTime);
    nextMidnight.setHours(24, 0, 0, 0); 
    return nextMidnight.getTime() - ksaTime.getTime();
}

function getKSADateString(timestamp) {
    return new Date(timestamp).toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' });
}

async function getCooldownReductionMs(db, userId, guildId) {
    try {
        let repRes;
        try { repRes = await db.query(`SELECT "rep_points" FROM user_reputation WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId]); }
        catch(e) { repRes = await db.query(`SELECT rep_points FROM user_reputation WHERE userid = $1 AND guildid = $2`, [userId, guildId]).catch(()=>({rows:[]})); }
        
        const points = repRes.rows[0]?.rep_points || repRes.rows[0]?.rep_points || 0;
        
        let reductionMinutes = 0;
        if (points >= 1000) reductionMinutes = 30;
        else if (points >= 500) reductionMinutes = 15;
        else if (points >= 250) reductionMinutes = 10;
        else if (points >= 100) reductionMinutes = 8;
        else if (points >= 50) reductionMinutes = 7;
        else if (points >= 25) reductionMinutes = 6;
        else if (points >= 10) reductionMinutes = 5;

        return reductionMinutes * 60 * 1000;
    } catch(e) { return 0; }
}

const COMMANDS_TO_CHECK = [
    { name: 'work', db_column: 'lastWork', fallback: 'lastwork', cooldown: 1 * 60 * 60 * 1000, label: 'عمل' },
    { name: 'rob', db_column: 'lastRob', fallback: 'lastrob', cooldown: 1 * 60 * 60 * 1000, label: 'سرقة' },
    { name: 'rps', db_column: 'lastRPS', fallback: 'lastrps', cooldown: 1 * 60 * 60 * 1000, label: 'حجرة' },
    { name: 'guess', db_column: 'lastGuess', fallback: 'lastguess', cooldown: 1 * 60 * 60 * 1000, label: 'خمن' },
    { name: 'roulette', db_column: 'lastRoulette', fallback: 'lastroulette', cooldown: 1 * 60 * 60 * 1000, label: 'روليت' },
    { name: 'emoji', db_column: 'lastMemory', fallback: 'lastmemory', cooldown: 1 * 60 * 60 * 1000, label: 'ايموجي' }, 
    { name: 'arrange', db_column: 'lastArrange', fallback: 'lastarrange', cooldown: 1 * 60 * 60 * 1000, label: 'رتب' },
    { name: 'pvp', db_column: 'lastPVP', fallback: 'lastpvp', cooldown: 5 * 60 * 1000, label: 'تحدي' },
    { name: 'race', db_column: 'lastRace', fallback: 'lastrace', cooldown: 1 * 60 * 60 * 1000, label: 'سباق' }, 
    { name: 'dungeon', db_column: 'last_dungeon', fallback: 'last_dungeon', cooldown: 3 * 60 * 60 * 1000, label: 'دانجون' },
    { name: 'scratch', db_column: 'lastScratch', fallback: 'lastscratch', cooldown: 1 * 60 * 60 * 1000, label: 'يانصيب' } 
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('وقت')
        .setDescription('يعرض الوقت المتبقي لاستخدام أوامر الاقتصاد.')
        .addUserOption(option =>
            option.setName('المستخدم')
            .setDescription('عرض أوقات مستخدم آخر (اختياري)')
            .setRequired(false)),

    name: 'gametime',
    aliases: ['وقت', 'وقت الالعاب', 'cooldown', 'time'],
    category: "Economy",
    description: 'يعرض الوقت المتبقي لاستخدام أوامر الاقتصاد.',

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, client, guild, targetUser, originalUser; 

        try {
            if (isSlash) {
                interaction = interactionOrMessage;
                client = interaction.client;
                guild = interaction.guild;
                targetUser = interaction.options.getUser('المستخدم') || interaction.user;
                originalUser = interaction.user;
                await interaction.deferReply();
            } else {
                message = interactionOrMessage;
                client = message.client;
                guild = message.guild;
                targetUser = message.mentions.users.first() || message.author;
                originalUser = message.author;
            }

            const calculateUserData = async (userToCheck) => {
                let data = await client.getLevel(userToCheck.id, guild.id);
                if (!data) data = { ...client.defaultData, user: userToCheck.id, guild: guild.id };

                try {
                    let dbRes;
                    try { dbRes = await client.sql.query(`SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2`, [userToCheck.id, guild.id]); }
                    catch(e) { dbRes = await client.sql.query(`SELECT * FROM levels WHERE userid = $1 AND guildid = $2`, [userToCheck.id, guild.id]).catch(()=>({rows:[]})); }
                    
                    if (dbRes && dbRes.rows.length > 0) {
                        data = { ...data, ...dbRes.rows[0] };
                    }
                } catch (err) {}

                const now = Date.now();
                const readyGames = [];
                const waitGames = [];

                const cooldownReductionMs = await getCooldownReductionMs(client.sql, userToCheck.id, guild.id);

                const lastDaily = Number(data.lastDaily || data.lastdaily) || 0;
                const todayKSA = getKSADateString(now);
                const lastDailyKSA = getKSADateString(lastDaily);

                if (todayKSA === lastDailyKSA) {
                    const timeUntilMidnight = getTimeUntilNextMidnightKSA();
                    waitGames.push(`${EMOJI_WAIT} **راتب**: \`${formatTimeSimple(timeUntilMidnight)}\``);
                } else {
                    readyGames.push(`${EMOJI_READY} **راتب**`);
                }

                for (const cmd of COMMANDS_TO_CHECK) {
                    const lastUsed = Number(data[cmd.db_column] || data[cmd.fallback] || 0);
                    const effectiveCooldown = Math.max(0, cmd.cooldown - cooldownReductionMs);
                    const timeLeft = (lastUsed + effectiveCooldown) - now;

                    if (timeLeft > 0) {
                        waitGames.push(`${EMOJI_WAIT} **${cmd.label}**: \`${formatTimeSimple(timeLeft)}\``);
                    } else {
                        readyGames.push(`${EMOJI_READY} **${cmd.label}**`);
                    }
                }

                const baseFishCooldown = 3600000; 
                const effectiveFishCooldown = Math.max(0, baseFishCooldown - cooldownReductionMs);
                
                const lastFish = Number(data.lastFish || data.lastfish) || 0;
                const fishTimeLeft = (lastFish + effectiveFishCooldown) - now;

                if (fishTimeLeft > 0) {
                    waitGames.push(`${EMOJI_WAIT} **صيد**: \`${formatTimeSimple(fishTimeLeft)}\``);
                } else {
                    readyGames.push(`${EMOJI_READY} **صيد**`);
                }

                return { readyGames, waitGames };
            };

            const { readyGames, waitGames } = await calculateUserData(targetUser);

            const embed = new EmbedBuilder()
                .setTitle('✥ وقـت الالعـاب')
                .setColor("Random")
                .setThumbnail('https://i.postimg.cc/zGqbJNzm/ayqwnt.png')
                .setDescription(`
✶ الالعاب المتـاحـة: ${EMOJI_READY}
✶ الالعاب الغير متـاحة: ${EMOJI_WAIT}
✶ عـرض الكل: ${EMOJI_ALL}
                `)
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('show_ready').setStyle(ButtonStyle.Secondary).setEmoji(EMOJI_READY),
                new ButtonBuilder().setCustomId('show_all').setStyle(ButtonStyle.Secondary).setEmoji(EMOJI_ALL),
                new ButtonBuilder().setCustomId('show_wait').setStyle(ButtonStyle.Secondary).setEmoji(EMOJI_WAIT)
            );

            let sentMessage;
            if (isSlash) {
                sentMessage = await interaction.editReply({ embeds: [embed], components: [row] });
            } else {
                sentMessage = await message.channel.send({ embeds: [embed], components: [row] });
            }

            const collector = sentMessage.createMessageComponentCollector({ 
                componentType: ComponentType.Button, 
                time: 60000 
            });

            collector.on('collect', async (i) => {
                const clickerIsOwner = i.user.id === originalUser.id;
                const subjectUser = clickerIsOwner ? targetUser : i.user;

                const result = await calculateUserData(subjectUser);

                let finalDesc = "";
                let finalColor = "Random";

                if (i.customId === 'show_ready') {
                    finalDesc = result.readyGames.length > 0 
                        ? `**✅ القائمة المتاحة لـ ${subjectUser.username}:**\n\n${result.readyGames.join('\n')}` 
                        : `❌ لا توجد ألعاب متاحة حالياً لـ ${subjectUser.username}..`;
                    finalColor = "Green";
                } 
                else if (i.customId === 'show_wait') {
                    finalDesc = result.waitGames.length > 0 
                        ? `**⏳ قائمة الانتظار لـ ${subjectUser.username}:**\n\n${result.waitGames.join('\n')}` 
                        : `جـميـع الالعـاب متاحـة لـك الان !`;
                    finalColor = "Red";
                }
                else if (i.customId === 'show_all') {
                    const allGames = [...result.readyGames, ...result.waitGames];
                    finalDesc = `**📋 الحالة العامة لـ ${subjectUser.username}:**\n\n${allGames.join('\n')}`;
                    finalColor = "Blue";
                }

                const hiddenEmbed = new EmbedBuilder()
                    .setColor(finalColor)
                    .setDescription(finalDesc)
                    .setImage(HIDDEN_EMBED_IMAGE);

                await i.reply({ embeds: [hiddenEmbed], flags: [MessageFlags.Ephemeral] });
            });

            collector.on('end', () => {
                const disabledRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('show_ready').setStyle(ButtonStyle.Secondary).setEmoji(EMOJI_READY).setDisabled(true),
                    new ButtonBuilder().setCustomId('show_all').setStyle(ButtonStyle.Secondary).setEmoji(EMOJI_ALL).setDisabled(true),
                    new ButtonBuilder().setCustomId('show_wait').setStyle(ButtonStyle.Secondary).setEmoji(EMOJI_WAIT).setDisabled(true)
                );
                
                if (isSlash) {
                    interaction.editReply({ components: [disabledRow] }).catch(() => {});
                } else {
                    sentMessage.edit({ components: [disabledRow] }).catch(() => {});
                }
            });

        } catch (error) {
            console.error("Error in gametime command:", error);
        }
    }
};
