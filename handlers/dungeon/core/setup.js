const { getRealPlayerData } = require('../utils');
const { cleanName } = require('./battle-utils');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

async function applyDynamicBuffs(member, player, currentThemeKey, guildId, db) {
    if (!currentThemeKey || !member) return "";
    
    try {
        const tableCheck = await db.query("SELECT count(*) FROM information_schema.tables WHERE table_name = 'race_dungeon_buffs'");
        if (parseInt(tableCheck.rows[0].count) === 0) return "";
    } catch (e) { return ""; }

    let buffMsgArray = [];

    const memberRoles = member.roles.cache.map(r => r.id);
    if (memberRoles.length === 0) {
        return "";
    }

    const placeholders = memberRoles.map((_, i) => `$${i + 3}`).join(',');
    
    try {
        const activeBuffsRes = await db.query(`
            SELECT * FROM race_dungeon_buffs 
            WHERE "guildID" = $1 AND "dungeonKey" = $2 AND "roleID" IN (${placeholders})
        `, [guildId, currentThemeKey, ...memberRoles]);

        const activeBuffs = activeBuffsRes.rows;

        if (activeBuffs && activeBuffs.length > 0) {

            player.atk = Number(player.atk) || 0;
            player.maxHp = Number(player.maxHp) || 100;
            player.hp = Number(player.hp) || player.maxHp;
            player.def = Number(player.def) || 0;
            player.shield = Number(player.shield) || 0;
            player.critRate = Number(player.critRate) || 0;
            player.lifesteal = Number(player.lifesteal) || 0;

            for (const buff of activeBuffs) {
                let val = parseFloat(buff.buffvalue || buff.buffValue); 
                if (isNaN(val)) continue;

                const multiplier = val / 100; 
                const statTypeClean = (buff.stattype || buff.statType).toLowerCase().trim();

                switch (statTypeClean) {
                    case 'atk':
                    case 'attack':
                        const atkBonus = Math.floor(player.atk * multiplier);
                        player.atk += atkBonus;
                        buffMsgArray.push(`⚔️ +${Math.floor(val)}% هجوم`);
                        break;

                    case 'hp':
                    case 'health':
                        const hpBonus = Math.floor(player.maxHp * multiplier);
                        player.maxHp += hpBonus;
                        player.hp += hpBonus; 
                        buffMsgArray.push(`❤️ +${Math.floor(val)}% HP`);
                        break;

                    case 'def':
                    case 'defense':
                        player.def += multiplier; 
                        player.defense = player.def; 
                        buffMsgArray.push(`🛡️ +${Math.floor(val)}% دفاع`);
                        break;

                    case 'shield':
                        const shieldBonus = Math.floor(player.maxHp * multiplier);
                        player.shield += shieldBonus;
                        player.startingShield = (player.startingShield || 0) + shieldBonus;
                        buffMsgArray.push(`💠 +${shieldBonus} درع`);
                        break;

                    case 'lifesteal':
                        player.lifesteal += multiplier; 
                        buffMsgArray.push(`🩸 +${Math.floor(val)}% شفاء`);
                        break;

                    case 'crit':
                    case 'critrate':
                        player.critRate += multiplier;
                        buffMsgArray.push(`✨ +${Math.floor(val)}% كريت`);
                        break;
                }
            }
        }
    } catch(e) {
        console.error("[Race Buff Error]", e);
    }

    return buffMsgArray.length > 0 ? `🌟 **ميزات العرق:** ${buffMsgArray.join(' | ')}` : "";
}

async function setupPlayers(guild, partyIDs, partyClasses, sql, OWNER_ID, themeKey) {
    let players = [];
    
    const promises = partyIDs.map(id => guild.members.fetch(id).catch(() => null));
    const members = await Promise.all(promises);

    for (const m of members) {
        if (m) {
            const cls = partyClasses.get(m.id) || 'Adventurer';
            let playerData = await getRealPlayerData(m, sql, cls); 
            
            playerData.atk = Number(playerData.atk);
            playerData.maxHp = Number(playerData.maxHp);
            playerData.hp = playerData.maxHp; 
            
            playerData.originalClass = cls;
            playerData.name = cleanName(playerData.name);
            playerData.startingShield = 0; 
            playerData.threat = 0;
            playerData.totalDamage = 0;
            playerData.shieldFloorsCount = 0; 
            playerData.summon = null; 

            const raceBuffMsg = await applyDynamicBuffs(m, playerData, themeKey, guild.id, sql);
            if (raceBuffMsg) {
                playerData.raceBuffText = raceBuffMsg;
            }

            playerData.isSealed = false;
            playerData.sealMultiplier = 1.0; 
            
            if (m.id !== OWNER_ID) {
                let maxItemLevel = 0;
                if (playerData.skills && typeof playerData.skills === 'object') {
                    const skillValues = Object.values(playerData.skills);
                    for (const skill of skillValues) {
                        const lvl = parseInt(skill.currentLevel) || parseInt(skill.level) || 0;
                        if (lvl > maxItemLevel) maxItemLevel = lvl;
                    }
                }
                if (playerData.weapon && typeof playerData.weapon === 'object') {
                    const wLvl = parseInt(playerData.weapon.currentLevel) || parseInt(playerData.weapon.level) || parseInt(playerData.weapon.lvl) || 0;
                    if (wLvl > maxItemLevel) maxItemLevel = wLvl;
                }
                if (maxItemLevel > 10) {
                    playerData.isSealed = true;
                    playerData.sealMultiplier = 0.2;
                }
            }

            players.push(playerData);
        }
    }

    return players;
}

async function startDungeonLobby(message, startFloor = 1) {
    const client = message.client;
    const db = client.sql;
    
    const host = message.author || message.user; 

    const activeRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('join_dungeon').setLabel('انضمام').setStyle(ButtonStyle.Success).setEmoji('⚔️'),
        new ButtonBuilder().setCustomId('start_dungeon_game').setLabel('بدء المعركة').setStyle(ButtonStyle.Danger).setEmoji('🔥'),
        new ButtonBuilder().setCustomId('cancel_dungeon').setLabel('إلغاء').setStyle(ButtonStyle.Secondary)
    );

    const lobbyEmbed = new EmbedBuilder()
        .setTitle(`🏰 بوابة الدانجون (الطابق ${startFloor})`) 
        .setDescription(
            `القائد **${host.username}** يجمع فريقاً!\n` +
            `اضغط على "انضمام" للمشاركة.\n\n` +
            `🛑 **ملاحظة:** ستبدأ الرحلة مباشرة من الطابق **${startFloor}**.`
        )
        .setColor('DarkRed')
        .setThumbnail(host.displayAvatarURL());

    let msg;
    if (message.reply && typeof message.reply === 'function') {
         if (!message.replied && !message.deferred) {
             msg = await message.reply({ embeds: [lobbyEmbed], components: [activeRow], fetchReply: true });
         } else {
             msg = await message.followUp({ embeds: [lobbyEmbed], components: [activeRow], fetchReply: true });
         }
    } else {
         msg = await message.channel.send({ embeds: [lobbyEmbed], components: [activeRow] });
    }

    const gameData = {
        hostID: host.id,
        players: [host.id], 
        currentFloor: startFloor, 
        status: 'lobby',
        hp: {}, 
        maxHp: {},
        startTime: Date.now()
    };

    const channelId = message.channel ? message.channel.id : message.channelId;
    const guildId = message.guild ? message.guild.id : message.guildId;

    await db.query(`
        INSERT INTO active_dungeons ("channelID", "guildID", "hostID", "data") 
        VALUES ($1, $2, $3, $4) 
        ON CONFLICT ("channelID", "guildID") DO UPDATE SET 
        "hostID" = EXCLUDED."hostID", 
        "data" = EXCLUDED."data"
    `, [channelId, guildId, host.id, JSON.stringify(gameData)]);
}

module.exports = { setupPlayers, startDungeonLobby };
