const { Events } = require("discord.js");

const OWNER_ID = process.env.OWNER_ID || '1145327691772481577'; 

const TRASH_EMOJI = '🗑️';

module.exports = {
    name: Events.MessageReactionAdd,
    async execute(reaction, user) {
        if (user.bot) return;

        if (reaction.emoji.name !== TRASH_EMOJI) return;

        if (user.id !== OWNER_ID) return;

        if (reaction.message.partial) {
            try {
                await reaction.message.fetch();
            } catch (error) {
                return;
            }
        }

        try {
            await reaction.message.delete();
            
            console.log(`[Owner Action] تم حذف رسالة في ${reaction.message.channel.name} بواسطة المالك.`);
        } catch (error) {
            if (error.code === 10008) {
                // الرسالة محذوفة مسبقاً
                return;
            }
            
            console.error('[Reaction Delete] حدث خطأ غير متوقع:', error);
        }
    },
};
