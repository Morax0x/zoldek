const { Events, EmbedBuilder } = require("discord.js");
const { updateNickname } = require("../streak-handler.js"); 
const questsConfig = require('../json/quests-config.json');

// 🔥 استدعاء الدالة المركزية لإضافة الإكس بي 
let addXPAndCheckLevel;
try {
    ({ addXPAndCheckLevel } = require('../handlers/handler-utils.js'));
} catch (e) {
    try { ({ addXPAndCheckLevel } = require('./handler-utils.js')); } catch (err) {}
}

const recentBoosters = new Set();
const recentNicknameUpdates = new Set();

module.exports = {
    name: Events.GuildMemberUpdate,
    async execute(oldMember, newMember) {
        const client = newMember.client;
        const db = client.sql;
        if (!db) return;

        const guildID = newMember.guild.id;
        const userID = newMember.id;

        try {
            if (oldMember.nickname !== newMember.nickname) {
                if (recentNicknameUpdates.has(userID)) return;

                let streakRes;
                try { streakRes = await db.query(`SELECT * FROM streaks WHERE "guildID" = $1 AND "userID" = $2`, [guildID, userID]); }
                catch(e) { streakRes = await db.query(`SELECT * FROM streaks WHERE guildid = $1 AND userid = $2`, [guildID, userID]).catch(()=>({rows:[]})); }
                const streakData = streakRes.rows[0];

                if (streakData && (streakData.nicknameActive === 1 || streakData.nicknameactive === 1)) {
                    recentNicknameUpdates.add(userID);
                    await updateNickname(newMember, db);
                    setTimeout(() => recentNicknameUpdates.delete(userID), 5000); 
                }
            }

            if (client.checkRoleAchievement) {
                await client.checkRoleAchievement(newMember, null, 'ach_race_role');
                
                let caesarRes;
                try { caesarRes = await db.query(`SELECT "roleID" FROM quest_achievement_roles WHERE "guildID" = $1 AND "achievementID" = $2`, [guildID, 'ach_caesar_role']); }
                catch(e) { caesarRes = await db.query(`SELECT roleid as "roleID" FROM quest_achievement_roles WHERE guildid = $1 AND achievementid = $2`, [guildID, 'ach_caesar_role']).catch(()=>({rows:[]})); }
                if (caesarRes.rows.length > 0) await client.checkRoleAchievement(newMember, caesarRes.rows[0].roleID || caesarRes.rows[0].roleid, 'ach_caesar_role');
                
                let treeRes;
                try { treeRes = await db.query(`SELECT "roleID" FROM quest_achievement_roles WHERE "guildID" = $1 AND "achievementID" = $2`, [guildID, 'ach_tree_role']); }
                catch(e) { treeRes = await db.query(`SELECT roleid as "roleID" FROM quest_achievement_roles WHERE guildid = $1 AND achievementid = $2`, [guildID, 'ach_tree_role']).catch(()=>({rows:[]})); }
                if (treeRes.rows.length > 0) await client.checkRoleAchievement(newMember, treeRes.rows[0].roleID || treeRes.rows[0].roleid, 'ach_tree_role');
                
                let tagRes;
                try { tagRes = await db.query(`SELECT "roleID" FROM quest_achievement_roles WHERE "guildID" = $1 AND "achievementID" = $2`, [guildID, 'ach_tag_role']); }
                catch(e) { tagRes = await db.query(`SELECT roleid as "roleID" FROM quest_achievement_roles WHERE guildid = $1 AND achievementid = $2`, [guildID, 'ach_tag_role']).catch(()=>({rows:[]})); }
                if (tagRes.rows.length > 0) await client.checkRoleAchievement(newMember, tagRes.rows[0].roleID || tagRes.rows[0].roleid, 'ach_tag_role');
            }

            const wasBoosting = oldMember.premiumSince;
            const isBoosting = newMember.premiumSince;

            if (!wasBoosting && isBoosting) {
                if (recentBoosters.has(userID)) return;
                
                recentBoosters.add(userID);
                setTimeout(() => recentBoosters.delete(userID), 60000); 

                const boostQuest = questsConfig.achievements.find(q => q.stat === 'boost_count');

                if (boostQuest) {
                    
                    // 🔥 الإضافة السحرية الصامتة للإكس بي والمورا عبر الدالة المركزية
                    if (addXPAndCheckLevel) {
                        await addXPAndCheckLevel(client, newMember, db, boostQuest.reward.xp, boostQuest.reward.mora, false);
                    }

                    // تحديث عدد مرات البوست فقط
                    try {
                        await db.query(`
                            INSERT INTO levels ("user", "guild", "boost_count") 
                            VALUES ($1, $2, 1) 
                            ON CONFLICT ("user", "guild") DO UPDATE SET 
                            "boost_count" = COALESCE(levels."boost_count", 0) + 1
                        `, [userID, guildID]);
                    } catch(e) {
                        await db.query(`
                            INSERT INTO levels (userid, guildid, boost_count) 
                            VALUES ($1, $2, 1) 
                            ON CONFLICT (userid, guildid) DO UPDATE SET 
                            boost_count = COALESCE(levels.boost_count, 0) + 1
                        `, [userID, guildID]).catch(()=>{});
                    }

                    let settingsRes;
                    try { settingsRes = await db.query(`SELECT "chatChannelID", "questChannelID" FROM settings WHERE "guild" = $1`, [guildID]); }
                    catch(e) { settingsRes = await db.query(`SELECT chatchannelid as "chatChannelID", questchannelid as "questChannelID" FROM settings WHERE guild = $1`, [guildID]).catch(()=>({rows:[]})); }
                    const settings = settingsRes.rows[0];

                    if (settings && (settings.chatChannelID || settings.chatchannelid)) {
                        const channelId = settings.chatChannelID || settings.chatchannelid;
                        const channel = newMember.guild.channels.cache.get(channelId);
                        if (channel) {
                            const embed = new EmbedBuilder()
                                .setTitle('🚀 بوستر جديد!')
                                .setDescription(`شـكـراً لـك ${newMember} عـلـى دعـم الـسـيـرفـر بـالـبـوسـت! ❤️\n\n**الـجـائـزة:**\n💰 ${boostQuest.reward.mora.toLocaleString()} مورا\n✨ ${boostQuest.reward.xp.toLocaleString()} XP`)
                                .setColor('#ff73fa')
                                .setImage('https://i.imgur.com/s160gP1.gif');
                            await channel.send({ content: `${newMember}`, embeds: [embed] }).catch(()=>{});
                        }
                    }
                }
            }

        } catch (err) {
            console.error("[GuildMemberUpdate Error]", err);
        }
    }
};
