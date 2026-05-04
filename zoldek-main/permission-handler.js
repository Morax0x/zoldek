const { Collection } = require("discord.js");

const ownerID = "1145327691772481577"; 

const DB_COOLDOWN_COMMANDS = [
    { name: 'daily', db_column: 'lastDaily', cooldown_ms: 22 * 60 * 60 * 1000, level_required: 0 },
    { name: 'work', db_column: 'lastWork', cooldown_ms: 1 * 60 * 60 * 1000, level_required: 0 },
    { name: 'rob', db_column: 'lastRob', cooldown_ms: 1 * 60 * 60 * 1000, level_required: 10 },
    { name: 'guess', db_column: 'lastGuess', cooldown_ms: 1 * 60 * 60 * 1000, level_required: 0 },
    { name: 'rps', db_column: 'lastRPS', cooldown_ms: 1 * 60 * 60 * 1000, level_required: 0 },
    { name: 'roulette', db_column: 'lastRoulette', cooldown_ms: 1 * 60 * 60 * 1000, level_required: 0 },
    { name: 'transfer', db_column: 'lastTransfer', cooldown_ms: 5 * 60 * 1000, level_required: 10 },
    { name: 'deposit', db_column: 'lastDeposit', cooldown_ms: 1 * 60 * 60 * 1000, level_required: 0 },
];

function formatTimeSimple(ms) {
    if (ms < 0) ms = 0;
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

async function checkPermissions(message, command) {
    const { client } = message;
    const targetUser = message.author || message.user;
    if (!targetUser) return true;
    
    const isOwner = targetUser.id === ownerID;
    if (isOwner) return true; 

    const cmdInfo = DB_COOLDOWN_COMMANDS.find(c => command.name === c.name || (command.aliases && command.aliases.includes(c.name)));

    if (cmdInfo && cmdInfo.level_required > 0) {
        let userLevel = 1;
        try {
            const res = await client.sql.query('SELECT "level" FROM levels WHERE "user" = $1 AND "guild" = $2', [targetUser.id, message.guild.id]);
            if (res.rows[0]) userLevel = parseInt(res.rows[0].level) || 1;
        } catch(e) {}

        const requiredLevel = cmdInfo.level_required;
        if (userLevel < requiredLevel) {
            const cmdName = (command.aliases && command.aliases.find(a => ['تحويل', 'سرقة', 'نهب'].includes(a))) || command.name; 
            const replyData = { content: `✥ مـا زلـت رحالاً يا غـلام ! ارفـع مستواك الـى \__${requiredLevel}__\ لتتمكن من استعمال \`${cmdName}\` <:araara:1436297148894412862>`, flags: [64] };
            
            if (message.replied || message.deferred) {
                message.followUp(replyData).catch(()=>{});
            } else {
                message.reply(replyData).catch(()=>{});
            }
            return false;
        }
    }
    return true; 
}

async function checkCooldown(message, command) {
    const { client } = message;
    const targetUser = message.author || message.user;
    if (!targetUser) return false;

    const isOwner = targetUser.id === ownerID;
    if (isOwner) return false;

    const now = Date.now();
    const cmdInfo = DB_COOLDOWN_COMMANDS.find(c => command.name === c.name || (command.aliases && command.aliases.includes(c.name)));
    let timeLeft = 0;

    if (cmdInfo) {
        let lastUsed = 0;
        try {
            const dbCol = cmdInfo.db_column;
            const res = await client.sql.query('SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2', [targetUser.id, message.guild.id]);
            if (res.rows[0]) {
                lastUsed = parseInt(res.rows[0][dbCol] || res.rows[0][dbCol.toLowerCase()] || 0);
            }
        } catch(e) {}

        const expirationTime = lastUsed + cmdInfo.cooldown_ms;
        if (now < expirationTime) {
            timeLeft = expirationTime - now;
        }
    } else {
        if (!client.cooldowns.has(command.name)) {
            client.cooldowns.set(command.name, new Collection());
        }

        const timestamps = client.cooldowns.get(command.name);
        const cooldownAmount = (command.cooldown || 3) * 1000;

        if (timestamps.has(targetUser.id)) {
            const expirationTime = timestamps.get(targetUser.id) + cooldownAmount;
            if (now < expirationTime) {
                timeLeft = expirationTime - now;
            } else {
                timestamps.set(targetUser.id, now);
                setTimeout(() => timestamps.delete(targetUser.id), cooldownAmount);
            }
        } else {
            timestamps.set(targetUser.id, now);
            setTimeout(() => timestamps.delete(targetUser.id), cooldownAmount);
        }
    }

    if (timeLeft > 0) {
        const timeString = formatTimeSimple(timeLeft); 
        const cmdName = (command.aliases && command.aliases.find(a => a.length > 2)) || command.name; 
        return `✥ انـتـظـر \`${timeString}\` لتستعمل \`${cmdName}\` مجددا <:stop:1436337453098340442>`;
    }

    return false; 
}

module.exports = { checkPermissions, checkCooldown };
