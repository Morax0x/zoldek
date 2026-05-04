const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require("discord.js");

const THUMBNAILS = [
    "https://i.postimg.cc/85ML0fm9/download.jpg",
    "https://i.postimg.cc/B6H2VPBR/download_(1).jpg",
    "https://i.postimg.cc/d1rGxZjb/download_(2).jpg",
    "https://i.postimg.cc/d1rGxZjb/download_(2).jpg",
    "https://i.postimg.cc/pTzK65Jg/Post_by_oddarette_4_images.jpg",
    "https://i.postimg.cc/L8GYF65Y/11.jpg",
    "https://i.postimg.cc/g0RwzFLc/download_(3).jpg",
    "https://i.postimg.cc/MGRc62fz/download_(4).jpg",
    "https://i.postimg.cc/5tvH4dQ0/download_(5).jpg",
    "https://i.postimg.cc/pL3hMXrm/download_(6).jpg"
];

const VOTE_LINK = "https://top.gg/discord/servers/732581242885705728/vote";

module.exports = {
    name: 'vote',
    description: 'صوت للامبراطورية واحصل على مكافآت',
    aliases: ['تصويت', 'صوت'],
    data: new SlashCommandBuilder()
        .setName('vote')
        .setDescription('Vote for the Empire and get rewards'),

    async execute(interactionOrMessage, args) {

        const isSlash = !!interactionOrMessage.isChatInputCommand;
        if (isSlash) await interactionOrMessage.deferReply();

        const createVotePayload = () => {
            const randomImage = THUMBNAILS[Math.floor(Math.random() * THUMBNAILS.length)];
            
            const embed = new EmbedBuilder()
                .setTitle('✥ صـوت للامبراطـوريـة')
                .setDescription(`✦  للتصـويـت [اضغـط هـنـا](${VOTE_LINK})\n✦ يمكـنـك التصويـت مـرة كـل 12 سـاعـة`)
                .setThumbnail(randomImage)
                .setColor('Random')
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('remind_12h')
                    .setLabel('ذكـرنـي بـعـد 12 سـاعـة')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('⏰'),
                new ButtonBuilder()
                    .setCustomId('remind_24h')
                    .setLabel('ذكـرنـي بـعـد 24 سـاعـة')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('📅')
            );

            return { embeds: [embed], components: [row] };
        };

        const handleReminder = async (interaction, timeMs, label) => {
            await interaction.reply({ content: `✅ **تم!** سأقوم بتذكيرك في الخاص بعد **${label}** لتقوم بالتصويت مجدداً.`, ephemeral: true });

            setTimeout(async () => {
                try {
                    const user = interaction.user;
                    const dmPayload = createVotePayload();
                    
                    dmPayload.content = `🔔 **تنبيه:** حان موعد التصويت يا بطل!`;
                    
                    const dmMessage = await user.send(dmPayload);

                    const collector = dmMessage.createMessageComponentCollector({ componentType: ComponentType.Button, time: 24 * 60 * 60 * 1000 }); 
                    
                    collector.on('collect', async i => {
                        const newTime = i.customId === 'remind_12h' ? 12 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
                        const newLabel = i.customId === 'remind_12h' ? '12 ساعة' : '24 ساعة';
                        
                        handleReminder(i, newTime, newLabel);
                    });

                } catch (err) {
                    console.error(`[Vote Reminder] Could not send DM to ${interaction.user.tag}:`, err.message);
                }
            }, timeMs);
        };

        const initialPayload = createVotePayload();
        
        let sentMsg;
        if (isSlash) {
            sentMsg = await interactionOrMessage.editReply(initialPayload);
        } else {
            sentMsg = await interactionOrMessage.reply(initialPayload);
        }

        const collector = sentMsg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 600000 }); 

        collector.on('collect', async i => {
            const timeMs = i.customId === 'remind_12h' ? 12 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
            const label = i.customId === 'remind_12h' ? '12 ساعة' : '24 ساعة';
            
            await handleReminder(i, timeMs, label);
        });
    }
};
