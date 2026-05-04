const { EmbedBuilder, SlashCommandBuilder } = require("discord.js");
const jobs = require('../../json/jobs.json');
const ownerID = "1145327691772481577";
const { calculateMoraBuff } = require('../../streak-handler.js');

let updateGuildStat;
try {
    ({ updateGuildStat } = require('../../handlers/guild-board-handler.js'));
} catch (e) {}

const COOLDOWN_MS = 1 * 60 * 60 * 1000; 

async function getCooldownReductionMs(db, userId, guildId) {
    try {
        let repRes;
        try { repRes = await db.query(`SELECT "rep_points" FROM user_reputation WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId]); }
        catch(e) { repRes = await db.query(`SELECT rep_points FROM user_reputation WHERE userid = $1 AND guildid = $2`, [userId, guildId]).catch(()=>({rows:[]})); }
        
        const points = repRes.rows[0]?.rep_points || 0;
        
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

module.exports = {
    data: new SlashCommandBuilder()
        .setName('عمل')
        .setDescription('تعمل لتحصل على مورا.'),

    name: 'work',
    aliases: ['عمل', 'w'],
    category: "Economy",
    description: "تعمل لتحصل على مورا ",

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, guild, client, user, member;

        if (isSlash) {
            interaction = interactionOrMessage;
            guild = interaction.guild;
            client = interaction.client;
            user = interaction.user;
            member = interaction.member;
            await interaction.deferReply();
        } else {
            message = interactionOrMessage;
            guild = message.guild;
            client = message.client;
            user = message.author;
            member = message.member;
        }

        const reply = async (payload) => {
            if (isSlash) {
                return interaction.editReply(payload);
            } else {
                return message.channel.send(payload);
            }
        };

        const replyError = async (content) => {
            const payload = { content, ephemeral: true };
            if (isSlash) {
                return interaction.editReply(payload);
            } else {
                return message.reply(payload);
            }
        };

        const guildId = guild.id;
        const db = client.sql;

        let data = await client.getLevel(user.id, guildId);
        if (!data) {
            data = { ...client.defaultData, user: user.id, guild: guildId };
            await client.setLevel(data);
        }

        const now = Date.now();
        const reductionMs = await getCooldownReductionMs(db, user.id, guildId);
        const effectiveCooldown = Math.max(0, COOLDOWN_MS - reductionMs);
        const timeLeft = (Number(data.lastWork || data.lastwork) || 0) + effectiveCooldown - now;

        if (timeLeft > 0 && user.id !== ownerID) {
            const minutes = Math.floor(timeLeft / 60000);
            const seconds = Math.floor((timeLeft % 60000) / 1000);
            return replyError(`🕐 لقد عملت مؤخراً. يرجى الانتظار **${minutes} دقيقة و ${seconds} ثانية**.`);
        }

        const baseAmount = Math.floor(Math.random() * (200 - 50 + 1)) + 50;
        const randomJob = jobs[Math.floor(Math.random() * jobs.length)];

        const moraMultiplier = await calculateMoraBuff(member, db);
        let finalAmount = Math.floor(baseAmount * moraMultiplier);

        let casinoTax = 0;
        let taxText = "";

        try {
            let settingsRes;
            try {
                settingsRes = await db.query(`SELECT "roleCasinoKing" FROM settings WHERE "guild" = $1`, [guildId]);
            } catch (e) {
                settingsRes = await db.query(`SELECT rolecasinoking FROM settings WHERE guild = $1`, [guildId]);
            }
            
            const settings = settingsRes.rows[0];
            const roleId = settings?.rolecasinoking || settings?.roleCasinoKing;

            if (roleId && !member.roles.cache.has(roleId)) {
                const kingMembers = guild.roles.cache.get(roleId)?.members;
                if (kingMembers && kingMembers.size > 0) {
                    const king = kingMembers.first();
                    casinoTax = Math.floor(finalAmount * 0.01);
                    if (casinoTax > 0) {
                        finalAmount -= casinoTax;
                        taxText = `\n👑 ضريبـة ملـك الكازيـنـو (-1%): **${casinoTax}**-`;
                        
                        // ✅ RETURNING لتحديث كاش الملك فوراً
                        try {
                            const kingRes = await db.query(`UPDATE levels SET "bank" = "bank" + $1 WHERE "user" = $2 AND "guild" = $3 RETURNING "bank"`, [casinoTax, king.id, guildId]);
                            if (client.updateLevelField && kingRes.rows[0]) client.updateLevelField(king.id, guildId, { bank: Number(kingRes.rows[0].bank) });
                        } catch (e) {
                            await db.query(`UPDATE levels SET bank = bank + $1 WHERE userid = $2 AND guildid = $3`, [casinoTax, king.id, guildId]).catch(()=>{});
                        }
                    }
                }
            }
        } catch (e) {
            console.error("خطأ في جلب أو تحديث ضريبة الكازينو:", e);
        }

        data.mora = (Number(data.mora) || 0) + finalAmount;
        data.lastWork = now;

        await client.setLevel(data);

        if (updateGuildStat) {
            updateGuildStat(client, guildId, user.id, 'mora_earned', finalAmount);
        }

        const buffPercent = (moraMultiplier - 1) * 100;
        let buffString = "";

        if (buffPercent > 0) {
            buffString = ` (+${buffPercent.toFixed(0)}%)`;
        } else if (buffPercent < 0) {
            buffString = ` (${buffPercent.toFixed(0)}%)`;
        }

        const description = [
            `✥ بـدأت الـعـمـل كـ ${randomJob}`,
            `✶ حـصـلـت عـلـى **${finalAmount}** <:mora:1435647151349698621>${buffString}${taxText}`,
            `✐ ينتهي دوامك بعـد سـاعـة <a:HypedDance:1435572391190204447>`
        ].join('\n');

        const embed = new EmbedBuilder()
            .setColor("Random")
            .setAuthor({ name: `✶ عـمـل عـمـل !`, iconURL: user.displayAvatarURL() })
            .setDescription(description);

        await reply({ embeds: [embed] });
    }
};
