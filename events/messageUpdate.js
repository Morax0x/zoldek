const { Events } = require("discord.js");

const treeCooldowns = new Set();

module.exports = {
    name: Events.MessageUpdate,
    async execute(oldMessage, newMessage) {
        if (newMessage.partial) {
            try {
                await newMessage.fetch();
            } catch (e) {
                return; 
            }
        }
        if (!newMessage.guild) return;

        const client = newMessage.client;
        const db = client.sql; 
        
        if (!db) return; 

        try {
            // 🔥 حماية أسماء الأعمدة ذات الحروف المزدوجة والمحجوزة
            const settingsResult = await db.query(`SELECT "treeChannelID", "treeBotID", "treeMessageID" FROM settings WHERE "guild" = $1`, [newMessage.guild.id]);
            const settings = settingsResult.rows[0];
            
            if (!settings || (!settings.treeChannelID && !settings.treechannelid)) return;

            const targetChannelId = settings.treeChannelID || settings.treechannelid;
            const targetBotId = settings.treeBotID || settings.treebotid;

            if (newMessage.channel.id !== targetChannelId) return;
            if (!newMessage.author.bot) return;

            if (targetBotId && newMessage.author.id !== targetBotId) return;

            let fullContent = (newMessage.content || "") + " ";
            
            if (newMessage.embeds.length > 0) {
                const embed = newMessage.embeds[0];
                fullContent += (embed.description || "") + " ";
                fullContent += (embed.title || "") + " ";
                
                if (embed.fields && embed.fields.length > 0) {
                    embed.fields.forEach(field => {
                        fullContent += (field.value || "") + " ";
                    });
                }
            }

            const validPhrases = [
                "watered the tree", 
                "سقى الشجرة", 
                "Watered",
                "your tree",
                "قام بسقاية",
                "level up", 
                "tree grew",
                "has watered"
            ];

            const isTreeMessage = validPhrases.some(phrase => fullContent.toLowerCase().includes(phrase.toLowerCase()));

            if (isTreeMessage) {
                const match = fullContent.match(/<@!?(\d+)>/);
                
                if (match && match[1]) {
                    const userID = match[1];
                    
                    if (userID === client.user.id || userID === newMessage.author.id) return;

                    if (treeCooldowns.has(userID)) return;
                    
                    treeCooldowns.add(userID);
                    setTimeout(() => treeCooldowns.delete(userID), 60000); 

                    const guildID = newMessage.guild.id;

                    // تمت إزالة الـ console.log المزعجة من هنا ✔️

                    if (client.incrementQuestStats) {
                        await client.incrementQuestStats(userID, guildID, 'water_tree', 1).catch(()=>{});
                    } else {
                        console.error("[TREE ERROR] incrementQuestStats function missing in client!");
                    }
                }
            }
        } catch (err) {
            console.error("[Tree Update Error]", err);
        }
    },
};
