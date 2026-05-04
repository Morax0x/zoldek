const { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    StringSelectMenuBuilder, 
    StringSelectMenuOptionBuilder, 
    Colors 
} = require('discord.js');

const { OWNER_ID, skillsConfig, potionItems } = require('./constants');
const { ensureInventoryTable, buildHpBar } = require('./utils');

function buildSkillSelector(player) {
    const options = [];
      
    const cd = player.special_cooldown;
    const cdText = cd > 0 ? ` (كولداون: ${cd})` : '';
      
    let myClassSkill = null;
    
    if (player.class === 'Leader') {
        myClassSkill = { name: "صرخة الحرب", desc: "زيادة ضرر الفريق 30% ونسبة الكريت.", emoji: "👑" };
    } 
    else if (player.class === 'Tank') {
        myClassSkill = { name: "استفزاز", desc: "جذب الوحش + درع 50% + عكس ضرر 40%.", emoji: "🛡️" };
    } 
    else if (player.class === 'Priest') {
        myClassSkill = { name: "النور المقدس", desc: "شفاء الفريق أو إحياء ميت.", emoji: "✨" };
    } 
    else if (player.class === 'Mage') {
        myClassSkill = { name: "شعوذة", desc: "سحر عشوائي (نار، جليد، أو برق).", emoji: "🔮" };
    } 
    else if (player.class === 'Summoner') {
        myClassSkill = { name: "استدعاء", desc: "وحش يهاجم 6 جولات وينفجر بالنهاية.", emoji: "🐺" };
    }

    if (myClassSkill) {
        options.push(new StringSelectMenuOptionBuilder()
            .setLabel(myClassSkill.name)
            .setValue('class_special_skill')
            .setDescription(`${myClassSkill.desc}${cdText}`)
            .setEmoji(myClassSkill.emoji));
    }

    if (player.isHybridPriest) {
        options.push(new StringSelectMenuOptionBuilder()
            .setLabel("النور المقدس (إرث)")
            .setValue('hybrid_heal') 
            .setDescription("شفاء الفريق (مهارة الكاهن المحتفظ بها).")
            .setEmoji("✨"));
    }

    const userSkills = player.skills || {};
    const availableSkills = Object.values(userSkills).filter(s => 
        (s.currentLevel > 0 || s.id.startsWith('race_')) && 
        s.stat_type !== 'Owner' 
    );
      
    availableSkills.forEach(skill => {
        const cooldown = (player.id === OWNER_ID) ? 0 : (player.skillCooldowns[skill.id] || 0);
        const description = (cooldown > 0) ? `🕓 كولداون: ${cooldown} جولات` : `⚡ ${skill.description}`;
          
        options.push(new StringSelectMenuOptionBuilder()
            .setLabel(skill.name)
            .setValue(skill.id)
            .setDescription(description.substring(0, 100))
            .setEmoji(skill.emoji || '✨'));
    });

    if (options.length === 0) return null;
      
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
        .setCustomId('skill_select_menu')
        .setPlaceholder('اختر مهارة لتفعيلها...')
        .addOptions(options.slice(0, 25))
    );
}

async function buildPotionSelector(player, sql, guildID) {
    if (!sql) return null;
    
    try {
        await ensureInventoryTable(sql); 
        // جلب الجرعات من قاعدة البيانات الجديدة
        const userItemsRes = await sql.query(`SELECT "itemID", "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2`, [player.id, guildID]);
        
        const potions = userItemsRes.rows.map(ui => {
            const itemDef = potionItems.find(si => si.id === ui.itemID);
            if (itemDef) return { ...itemDef, quantity: Number(ui.quantity) };
            return null;
        }).filter(p => p !== null && p.quantity > 0);

        const options = [];

        if (potions.length > 0) {
            potions.forEach(p => {
                options.push(new StringSelectMenuOptionBuilder()
                    .setLabel(`${p.name} (x${p.quantity})`)
                    .setValue(`use_potion_${p.id}`)
                    .setDescription(p.description.substring(0, 90))
                    .setEmoji(p.emoji));
            });
        } else {
            options.push(new StringSelectMenuOptionBuilder()
                .setLabel('لا تملك جرعات')
                .setValue('no_potions')
                .setDescription('اضغط بالأسفل لشراء الجرعات')
                .setEmoji('🚫'));
        }

        // الخيار الدائم لفتح المتجر السريع
        options.push(new StringSelectMenuOptionBuilder()
            .setLabel('شراء المزيد من الجرعات')
            .setValue('buy_potions_action') 
            .setDescription('فتح متجر الجرعات السريع')
            .setEmoji('🛒'));

        return new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('potion_select_menu')
                .setPlaceholder('اختر جرعة أو اشترِ المزيد...')
                .addOptions(options.slice(0, 25))
        );

    } catch (e) {
        console.error("UI Potion Error:", e);
        return null;
    }
}

function generateBattleEmbed(players, monster, floor, theme, log, actedPlayers = [], color = null) {
    const embedColor = color || theme.color || '#2F3136'; 

    const embed = new EmbedBuilder()
        .setTitle(`${theme.emoji} الطابق ${floor} | ضد ${monster.name}`)
        .setColor(embedColor); 

    if (monster.image) {
        embed.setImage(monster.image);
    } else if (theme.image) {
        embed.setImage(theme.image);
    }

    let monsterStatus = "";
    if (monster.effects.some(e => e.type === 'poison')) monsterStatus += " ☠️";
    if (monster.effects.some(e => e.type === 'burn')) monsterStatus += " 🔥";
    if (monster.effects.some(e => e.type === 'weakness')) monsterStatus += " 📉";
    if (monster.effects.some(e => e.type === 'confusion')) monsterStatus += " 😵";
    if (monster.frozen) monsterStatus += " ❄️";
    if (monster.effects.some(e => e.type === 'lightning_weaken')) monsterStatus += " ⚡";
    if (monster.effects.some(e => e.type === 'reflect')) monsterStatus += " 🔄"; 
    if (monster.effects.some(e => e.type === 'blind')) monsterStatus += " 🕶️";   
    if (monster.effects.some(e => e.type === 'stun')) monsterStatus += " 💫";    
    if (monster.effects.some(e => e.type === 'evasion')) monsterStatus += " 💨"; 

    const monsterBar = buildHpBar(monster.hp, monster.maxHp);
    embed.addFields({ 
        name: `👹 **${monster.name}** ${monsterStatus}`, 
        value: `${monsterBar} \`[${monster.hp}/${monster.maxHp}]\``, 
        inline: false 
    });

    let teamStatus = players.map(p => {
        let icon = p.isDead ? '💀' : (p.defending ? '🛡️' : '');
        let arabClass = p.class;
          
        if (p.class === 'Leader') { 
            if (p.isHybridPriest) {
                arabClass = 'القائد الكاهن'; 
                icon += '👑✨ '; 
            } else {
                arabClass = 'القائد'; 
                icon += '👑 '; 
            }
        }
        else if (p.class === 'Former Leader') { arabClass = 'قائد سابق'; icon += '🥀 '; }
        else if (p.class === 'Tank') { arabClass = 'مُدرّع'; icon += '🛡️ '; }
        else if (p.class === 'Priest') { arabClass = 'كاهن'; icon += '✨ '; }
        else if (p.class === 'Mage') { arabClass = 'ساحر'; icon += '🔮 '; }
        else if (p.class === 'Summoner') { arabClass = 'مستدعٍ'; if(p.summon && p.summon.active) icon += '🐺'; }
        
        let hpDisplay;
        if (p.id === OWNER_ID) {
            arabClass = 'الإمبراطور';
            icon += '👁️ ';
            hpDisplay = `[▓▓▓▓▓▓▓▓▓▓] ???/???`; 
        } else {
            hpDisplay = p.isDead ? (p.isPermDead ? 'تحللت الجثة' : 'مـات') : buildHpBar(p.hp, p.maxHp, p.shield);
        }

        let displayName;
        let statusCircle;

        if (p.isDead) {
            statusCircle = "💀";
            displayName = `**${p.name}** [${arabClass}]`; 
        } else if (actedPlayers.includes(p.id)) {
            statusCircle = "🔴";
            displayName = `**${p.name}** [${arabClass}]`; 
        } else {
            statusCircle = "🟢";
            displayName = `<@${p.id}> [${arabClass}]`; 
        }

        let playerDebuffs = "";
        if (p.effects.some(e => e.type === 'water_pressure')) playerDebuffs += " 🌊";
        if (p.effects.some(e => e.type === 'blind')) playerDebuffs += " 🕶️";

        return `${statusCircle} ${icon} ${displayName}${playerDebuffs}\n${hpDisplay}`;
    }).join('\n\n');

    embed.addFields({ name: `🛡️ **فريق المغامرين**`, value: teamStatus, inline: false  });

    const logText = log.slice(-8).join('\n') || "بانتظار بدء الاشتباك...";
    embed.addFields({ name: "📜 احـداث المعـركـة:", value: logText, inline: false });

    return embed;
}

function generateBattleRows(disabled = false) {
    const row1 = new ActionRowBuilder();

    const btnAtk = new ButtonBuilder()
        .setCustomId('atk')
        .setLabel('هجوم')
        .setEmoji('⚔️')
        .setStyle(ButtonStyle.Danger) 
        .setDisabled(disabled);

    const btnSkill = new ButtonBuilder()
        .setCustomId('skill')
        .setLabel('مهارة')
        .setEmoji('✨')
        .setStyle(ButtonStyle.Primary) 
        .setDisabled(disabled);

    row1.addComponents(btnAtk, btnSkill);

    const row2 = new ActionRowBuilder();

    const btnDef = new ButtonBuilder()
        .setCustomId('def')
        .setLabel('دفاع')
        .setEmoji('🛡️')
        .setStyle(ButtonStyle.Secondary) 
        .setDisabled(disabled);

    const btnHeal = new ButtonBuilder()
        .setCustomId('heal')
        .setLabel('جـرعـة')
        .setEmoji('🧪')
        .setStyle(ButtonStyle.Success) 
        .setDisabled(disabled);

    row2.addComponents(btnDef, btnHeal);

    return [row1, row2];
}

module.exports = {
    buildSkillSelector,
    buildPotionSelector,
    generateBattleEmbed,
    generateBattleRows
};
