const { ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, MessageFlags, ChannelType, EmbedBuilder, Colors } = require("discord.js");
const { generatePvPImage } = require('../../generators/pvp-generator.js');
const { generatePvPResultImage } = require('../../generators/pvp-summary-generator.js');
const { getWeaponData, getUserRace } = require('./pvp-data.js');
const { cleanDisplayName } = require('./pvp-utils.js');

const KNIGHT_ID = "guard";
const EMOJI_MORA = '<:mora:1435647151349698621>';

async function startKnightBattle(context, client, sql, playerMember, amountToSteal) {
    const guild = context.guild;
    const userId = playerMember.id;
    const playerName = cleanDisplayName(playerMember.displayName || playerMember.user.username);

    // سحب بيانات اللاعب
    let pData = await client.getLevel(userId, guild.id) || { level: 1, mora: 0, bank: 0 };
    const pRace = await getUserRace(playerMember, sql);
    const pWeapon = await getWeaponData(sql, playerMember);
    
    // وزن وحسابات الفارس (أقوى من اللاعب بقليل ليكون تحدياً حقيقياً)
    const pMaxHp = 800 + ((pData.level || 1) * 60);
    const knightMaxHp = Math.floor(pMaxHp * 1.8);
    const knightDmg = Math.floor((pWeapon?.currentDamage || 20) * 1.4);

    // 🔥 إنشاء ثريد معزول لقتال الفارس 🔥
    let thread;
    try {
        const threadName = `🏰-قلعة-الإمبراطور-${playerName}`.substring(0, 100);
        if (context.message && typeof context.message.startThread === 'function') {
            thread = await context.message.startThread({ name: threadName, autoArchiveDuration: 60, reason: 'Knight Battle' });
        } else if (context.channel && typeof context.channel.threads?.create === 'function') {
            thread = await context.channel.threads.create({ name: threadName, autoArchiveDuration: 60, type: ChannelType.PublicThread });
        }
    } catch (e) {
        console.error("Thread creation failed for Knight:", e);
        if (context.channel) await context.channel.send("❌ فشل إنشاء ساحة المعركة في القلعة.").catch(()=>{});
        return;
    }

    if (!thread) return;

    try { await thread.members.add(userId); } catch(e) {}
    
    // إرسال رسالة التوجيه للثريد
    try { 
        if (context.editReply) {
            await context.editReply({ content: `🏰 **حراس القلعة يحاصرونك!** انتقل إلى الساحة: <#${thread.id}>`, embeds: [], components: [] }).catch(()=>{}); 
        } else if (context.reply) {
            await context.reply({ content: `🏰 **حراس القلعة يحاصرونك!** انتقل إلى الساحة: <#${thread.id}>` }).catch(()=>{}); 
        }
    } catch(e){}

    // بناء حالة المعركة (Battle State) المتوافقة مع PvP الجديد
    const battleState = {
        isPvE: true,
        isEnded: false,
        amountToSteal: amountToSteal,
        turn: [userId, KNIGHT_ID],
        activeTurn: userId,
        thread: thread,
        message: null,
        client: client,
        sql: sql,
        guildId: guild.id,
        log: ["🛡️ فارس الإمبراطور يغلق الأبواب! 'لن تخرج من هنا حياً!'"],
        players: new Map([
            [userId, { 
                id: userId, name: playerName, hp: pMaxHp, maxHp: pMaxHp, 
                damage: pWeapon?.currentDamage || 20, def: 10, effects: [], isMonster: false, member: playerMember,
                raceName: pRace ? (pRace.raceName || pRace.racename) : 'بشري', weapon: pWeapon || { currentDamage: 20 }
            }],
            [KNIGHT_ID, { 
                id: KNIGHT_ID, name: "فارس الإمبراطور", hp: knightMaxHp, maxHp: knightMaxHp, 
                damage: knightDmg, def: 20, effects: [], isMonster: true, image: 'https://i.postimg.cc/d1ndBX7B/download.gif',
                raceName: 'زعيم', weapon: { currentDamage: knightDmg }
            }]
        ])
    };

    await renderBattleFrame(battleState);
}

// 🔥 رندرة وإدارة الأزرار داخل الثريد 🔥
async function renderBattleFrame(state) {
    if (state.isEnded) return;

    const imgBuffer = await generatePvPImage(state);
    const attachment = imgBuffer ? new AttachmentBuilder(imgBuffer, { name: 'knight_battle.png' }) : null;

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`k_atk`).setLabel('هجوم').setStyle(ButtonStyle.Danger).setEmoji('⚔️')
    );

    const payload = {
        content: `**مبارزة الموت: ضد فارس الإمبراطور** <@${state.activeTurn}>`,
        files: attachment ? [attachment] : [],
        components: [row]
    };

    let msg;
    if (state.message) {
        msg = await state.message.edit(payload).catch(async () => {
            return await state.thread.send(payload);
        });
    } else {
        msg = await state.thread.send(payload);
        state.message = msg;
    }

    // إعداد الـ Collector لانتظار هجوم اللاعب
    const filter = i => i.user.id === state.activeTurn;
    const collector = msg.createMessageComponentCollector({ filter, time: 120000, max: 1 });

    collector.on('collect', async (i) => {
        await i.deferUpdate().catch(()=>{});
        
        const player = state.players.get(state.activeTurn);
        const guard = state.players.get(KNIGHT_ID);
        
        // 1. اللاعب يهاجم الفارس
        const pDmg = player.damage;
        guard.hp -= pDmg;
        state.log.push(`⚔️ **${player.name}** سدد ضربة بـ **${pDmg}** ضرر!`);

        if (guard.hp <= 0) {
            state.isEnded = true;
            return await endKnightBattle(state, state.activeTurn);
        }

        // 2. الفارس يرد الهجوم
        const gDmg = guard.damage;
        player.hp -= gDmg;
        state.log.push(`🛡️ **الفارس** عاقبك بقوة بـ **${gDmg}** ضرر!`);

        if (player.hp <= 0) {
            state.isEnded = true;
            return await endKnightBattle(state, KNIGHT_ID);
        }

        // تحديث المعركة للدور التالي
        await renderBattleFrame(state);
    });

    collector.on('end', async (collected, reason) => {
        if (reason === 'time' && !state.isEnded) {
            state.isEnded = true;
            state.log.push("⏳ انتهى الوقت! الفارس يغتالك لترددك!");
            await endKnightBattle(state, KNIGHT_ID);
        }
    });
}

// 🔥 إنهاء المعركة وتوزيع/سحب الغنائم 🔥
async function endKnightBattle(state, winnerId) {
    const isPlayerWinner = winnerId !== KNIGHT_ID;
    
    // توليد صورة النتيجة النهائية
    const resultImg = await generatePvPResultImage(state, winnerId, isPlayerWinner ? "S" : "F", state.amountToSteal, 0);
    
    const userId = state.activeTurn;
    let pData = await state.client.getLevel(userId, state.guildId) || { mora: 0, bank: 0 };

    if (isPlayerWinner) {
        // اللاعب فاز: يأخذ المورا من الخزنة
        pData.mora = String((Number(pData.mora) || 0) + state.amountToSteal);
    } else {
        // الفارس فاز: يخصم الغرامة من اللاعب (كاش أولاً ثم بنك)
        let mora = Number(pData.mora) || 0;
        let bank = Number(pData.bank) || 0;
        if (mora >= state.amountToSteal) {
            mora -= state.amountToSteal;
        } else {
            const diff = state.amountToSteal - mora;
            mora = 0;
            bank = Math.max(0, bank - diff);
        }
        pData.mora = String(mora);
        pData.bank = String(bank);
    }
    
    await state.client.setLevel(pData);

    const attachment = resultImg ? new AttachmentBuilder(resultImg, { name: 'result.png' }) : null;
    const files = attachment ? [attachment] : [];

    await state.message.edit({
        content: isPlayerWinner ? `🏆 **لقد هزمت الفارس بنجاح وسرقت ${state.amountToSteal.toLocaleString()} ${EMOJI_MORA}!** <@${userId}>` : `💀 **لقد سحقك الفارس وتم تغريمك ${state.amountToSteal.toLocaleString()} ${EMOJI_MORA}!** <@${userId}>`,
        files: files,
        components: []
    }).catch(()=>{});

    // إغلاق الثريد بعد دقيقتين
    setTimeout(async () => {
        try { await state.thread.delete('انتهت المعركة مع الفارس'); } catch(e){}
    }, 120000);
}

module.exports = { startKnightBattle };
