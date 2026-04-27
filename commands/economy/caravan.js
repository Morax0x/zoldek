const {
    SlashCommandBuilder, AttachmentBuilder, EmbedBuilder,
    ActionRowBuilder, ButtonBuilder, ButtonStyle,
    StringSelectMenuBuilder, ComponentType, MessageFlags
} = require('discord.js');

const {
    caravanConfig, initCaravanTables, getUserCaravanStats,
    getActiveCaravan, getEquippedBuffs, calcDuration, calcRiskFactor,
    sendCaravan, upgradeCaravan, setupCaravanChecker,
    safeQuery, safeExecute, EMOJI_MORA
} = require('../../handlers/caravan-core.js');

const upgradeMats = require('../../json/upgrade-materials.json');
const path = require('path');

let GEN;
try { GEN = require('../../generators/caravan-generator.js'); }
catch { GEN = {}; }

let allGameItems = [];
try {
    const shopItems = require(path.join(process.cwd(), 'json', 'shop-items.json')) || [];
    const wepItems = require(path.join(process.cwd(), 'json', 'weapons-config.json'));
    allGameItems = [...shopItems];
    if (wepItems && wepItems.weapons) {
        Object.keys(wepItems.weapons).forEach(k => {
            wepItems.weapons[k].forEach(w => allGameItems.push({ id: w.id, name: w.name, rarity: w.rarity }));
        });
    }
} catch(e) {}

function getItemNameSafe(id) {
    const itm = allGameItems.find(x => x.id === id);
    if (itm && itm.name) return itm.name;
    return String(id).replace(/_/g, ' ');
}

function allItemsList() {
    const list = [];
    if (upgradeMats?.weapon_materials)
        upgradeMats.weapon_materials.forEach(r => r.materials.forEach(m => list.push({ ...m, type: 'material' })));
    if (upgradeMats?.skill_books)
        upgradeMats.skill_books.forEach(c => c.books.forEach(b => list.push({ ...b, type: 'book' })));
    return list;
}

async function getMora(db, userId, guildId) {
    try {
        const r = await db.query(`SELECT "mora" FROM levels WHERE "user"=$1 AND "guild"=$2`, [userId, guildId]);
        return Number(r.rows[0]?.mora || 0);
    } catch { return 0; }
}

function navRow(hasActiveCaravan = false, disabled = false) {
    const row = new ActionRowBuilder();
    
    if (!hasActiveCaravan) {
        row.addComponents(
            new ButtonBuilder().setCustomId('cv_send').setLabel('📤 إرسال رحلة').setStyle(ButtonStyle.Primary).setDisabled(disabled),
            new ButtonBuilder().setCustomId('cv_equip').setLabel('🔮 التجهيز').setStyle(ButtonStyle.Secondary).setDisabled(disabled)
        );
    } else {
        row.addComponents(
            new ButtonBuilder().setCustomId('cv_status').setLabel('🗺️ متابعة الرحلة').setStyle(ButtonStyle.Success).setDisabled(disabled)
        );
    }
    
    row.addComponents(
        new ButtonBuilder().setCustomId('cv_upgrade').setLabel('🏗️ الترقيات').setStyle(ButtonStyle.Secondary).setDisabled(disabled)
    );

    return row;
}

async function sendCanvas(fn, args, content = '') {
    try {
        if (typeof fn !== 'function') throw new Error('no fn');
        const buf = await fn(...args);
        return { files: [new AttachmentBuilder(buf, { name: 'caravan.png' })], content };
    } catch (e) {
        return { embeds: [new EmbedBuilder().setColor('#FF4444').setDescription('⚠️ تعذّر توليد الصورة.')], content };
    }
}

const activeProcesses = new Set();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('caravan')
        .setDescription('🐪 نظام القوافل — مركز التحكم الكامل'),

    name:     'caravan',
    aliases:  ['قافلة', 'قوافل', 'رحلة', 'تجارة'],
    category: 'Economy',
    description: 'نظام القوافل المتكامل',

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, client, guild, user;

        if (isSlash) {
            interaction = interactionOrMessage;
            client = interaction.client; guild = interaction.guild; user = interaction.user;
            await interaction.deferReply().catch(() => {});
        } else {
            message = interactionOrMessage;
            client = message.client; guild = message.guild; user = message.author;
        }

        const db = client.sql;
        setupCaravanChecker(client, db);

        const reply = async (payload) => {
            try {
                if (isSlash) return await interaction.editReply(payload);
                return await message.channel.send(payload);
            } catch { return null; }
        };

        async function showHub(editMsg = null) {
            const [stats, active, mora, lvlRes, repRes] = await Promise.all([
                getUserCaravanStats(db, user.id, guild.id),
                getActiveCaravan(db, user.id, guild.id),
                getMora(db, user.id, guild.id),
                safeQuery(db, `SELECT "level","xp","totalXP" FROM levels WHERE "user"=$1 AND "guild"=$2`, [user.id, guild.id]),
                safeQuery(db, `SELECT "rep_points" FROM user_reputation WHERE "userID"=$1 AND "guildID"=$2`, [user.id, guild.id]),
            ]);

            const lvlRow  = lvlRes?.rows?.[0] || {};
            const lvlKey  = Object.keys(lvlRow).find(k => k.toLowerCase() === 'level')    || 'level';
            const repRow  = repRes?.rows?.[0] || {};
            const repKey  = Object.keys(repRow).find(k => k.toLowerCase() === 'rep_points') || 'rep_points';
            const profExtra = {
                level:     Number(lvlRow[lvlKey] || 1),
                repPoints: Number(repRow[repKey]  || 0),
            };

            const payload = await sendCanvas(GEN.generateCaravanHub, [user, stats, active, mora, profExtra]);
            payload.components = [navRow(!!active)];
            
            if (editMsg) return editMsg.edit(payload).catch(() => {});
            return reply(payload);
        }

        const hubMsg = await showHub();
        if (!hubMsg) return;

        const collector = hubMsg.createMessageComponentCollector({
            filter: i => i.user.id === user.id,
            time: 5 * 60 * 1000,
            idle: 3 * 60 * 1000,
        });

        collector.on('collect', async i => {
            if (activeProcesses.has(user.id)) {
                return i.reply({ content: '⏳ الرجاء الانتظار، جاري المعالجة...', flags: [MessageFlags.Ephemeral] }).catch(()=>{});
            }
            activeProcesses.add(user.id);
            await i.deferUpdate().catch(() => {});
            const id = i.customId;

            try {
                if (id === 'cv_send') {
                    const active = await getActiveCaravan(db, user.id, guild.id);
                    if (active) {
                        await i.followUp({ content: '❌ لديك رحلة نشطة بالفعل!', flags: [MessageFlags.Ephemeral] });
                        activeProcesses.delete(user.id);
                        return;
                    }
                    const mora = await getMora(db, user.id, guild.id);
                    const stats = await getUserCaravanStats(db, user.id, guild.id);
                    const payload = await sendCanvas(GEN.generateSendMap, [user, stats, mora]);

                    const opts = caravanConfig.destinations.map(d => ({
                        label: d.name,
                        value: d.id,
                        description: `${d.duration_hours}س | ${d.cost.toLocaleString()} مورا | خطر ${(d.risk_factor*100).toFixed(0)}%`,
                        emoji: d.emoji.replace(/️/g,''),
                    }));
                    payload.components = [
                        new ActionRowBuilder().addComponents(
                            new StringSelectMenuBuilder()
                                .setCustomId('cv_dest_sel')
                                .setPlaceholder('🗺️ اختر المدينة للإنطلاق...')
                                .addOptions(opts)
                        ),
                        new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId('cv_back').setLabel('↩️ التراجع للرئيسية').setStyle(ButtonStyle.Danger)
                        ),
                    ];
                    await hubMsg.edit(payload).catch(() => {});
                }

                else if (id === 'cv_dest_sel') {
                    const destId = i.values[0];
                    const dest   = caravanConfig.destinations.find(d => d.id === destId);
                    const mora   = await getMora(db, user.id, guild.id);
                    if (mora < dest.cost) {
                        await i.followUp({ content: `❌ تحتاج **${dest.cost.toLocaleString()}** ${EMOJI_MORA}. رصيدك: **${mora.toLocaleString()}**`, flags: [MessageFlags.Ephemeral] });
                        activeProcesses.delete(user.id);
                        return;
                    }
                    
                    await safeExecute(db, `UPDATE levels SET "mora"=CAST(COALESCE("mora",'0') AS BIGINT)-$1 WHERE "user"=$2 AND "guild"=$3`, [dest.cost, user.id, guild.id]);

                    const sessionKey  = `${user.id}-${guild.id}`;
                    const savedArts   = client.caravanEquip?.get(sessionKey) || [];
                    const result      = await sendCaravan(db, user.id, guild.id, destId, savedArts);
                    
                    if (result.error) {
                        await i.followUp({ content: `❌ ${result.error}`, flags: [MessageFlags.Ephemeral] });
                        activeProcesses.delete(user.id);
                        return;
                    }
                    
                    const eta = Math.floor(result.endTime / 1000);
                    await i.followUp({
                        embeds: [new EmbedBuilder()
                            .setColor(dest.color || '#00FF88')
                            .setTitle(`🐪 انطلقت القافلة بنجاح إلى ${dest.emoji} ${dest.name}!`)
                            .setDescription(`📅 **وقت الوصول المتوقع:** <t:${eta}:R>\n⚠️ **نسبة الخطر في الطريق:** ${(result.riskFactor*100).toFixed(0)}%`)
                        ],
                        flags: [MessageFlags.Ephemeral],
                    }).catch(() => {});
                    await showHub(hubMsg);
                }

                else if (id === 'cv_status') {
                    const active = await getActiveCaravan(db, user.id, guild.id);
                    if (!active) {
                        await i.followUp({ content: '📭 لا توجد رحلة نشطة للتبعها.', flags: [MessageFlags.Ephemeral] });
                        activeProcesses.delete(user.id);
                        return;
                    }
                    const destId = active.destinationid || active.destinationId;
                    const dest   = caravanConfig.destinations.find(d => d.id === destId) || {};
                    const stats  = await getUserCaravanStats(db, user.id, guild.id);
                    const payload = await sendCanvas(GEN.generateCaravanStatus, [user, active, stats, dest]);
                    payload.components = [
                        new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId('cv_back').setLabel('↩️ العودة للرئيسية').setStyle(ButtonStyle.Secondary)
                        ),
                    ];
                    await hubMsg.edit(payload).catch(() => {});
                }

                else if (id === 'cv_upgrade') {
                    const [stats, mora] = await Promise.all([
                        getUserCaravanStats(db, user.id, guild.id),
                        getMora(db, user.id, guild.id),
                    ]);
                    const payload = await sendCanvas(GEN.generateUpgradePanel, [user, stats, mora]);

                    const opts = Object.entries(caravanConfig.upgrades).map(([key, cfg]) => {
                        const rank  = Number(stats[`${key}_rank`] || 1);
                        const maxed = rank >= cfg.max_level;
                        const cost  = maxed ? 0 : cfg.costs[rank];
                        return {
                            label:       `${cfg.name} — مستوى ${rank}${maxed?' (MAX)':''}`,
                            value:       key,
                            description: maxed ? 'تأثير كامل ونشط' : `تكلفة الترقية: ${cost.toLocaleString()} مورا`,
                            emoji:       cfg.emoji,
                        };
                    });
                    payload.components = [
                        new ActionRowBuilder().addComponents(
                            new StringSelectMenuBuilder().setCustomId('cv_upg_sel').setPlaceholder('🛠️ حدد العنصر لترقيته...').addOptions(opts)
                        ),
                        new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId('cv_back').setLabel('↩️ رجوع للرئيسية').setStyle(ButtonStyle.Secondary)
                        ),
                    ];
                    await hubMsg.edit(payload).catch(() => {});
                }

                else if (id === 'cv_upg_sel') {
                    const result = await upgradeCaravan(db, user.id, guild.id, i.values[0]);
                    if (result.error) {
                        await i.followUp({ content: `❌ ${result.error}`, flags: [MessageFlags.Ephemeral] });
                    } else {
                        await i.followUp({
                            embeds: [new EmbedBuilder()
                                .setColor('#2ECC71')
                                .setDescription(`✅ تمت ترقية ${result.upgCfg.emoji} **${result.upgCfg.name}** إلى مستوى **${result.newLevel}**\n💰 التكلفة: **${result.cost.toLocaleString()}** مورا`)
                            ],
                            flags: [MessageFlags.Ephemeral],
                        }).catch(() => {});
                    }
                    
                    const [stats2, mora2] = await Promise.all([
                        getUserCaravanStats(db, user.id, guild.id),
                        getMora(db, user.id, guild.id),
                    ]);
                    const payload2 = await sendCanvas(GEN.generateUpgradePanel, [user, stats2, mora2]);
                    const opts2 = Object.entries(caravanConfig.upgrades).map(([key, cfg]) => {
                        const rank  = Number(stats2[`${key}_rank`] || 1);
                        const maxed = rank >= cfg.max_level;
                        const cost  = maxed ? 0 : cfg.costs[rank];
                        return {
                            label:       `${cfg.name} — مستوى ${rank}${maxed?' (MAX)':''}`,
                            value:       key,
                            description: maxed ? 'تأثير كامل ونشط' : `تكلفة الترقية: ${cost.toLocaleString()} مورا`,
                            emoji:       cfg.emoji,
                        };
                    });
                    payload2.components = [
                        new ActionRowBuilder().addComponents(
                            new StringSelectMenuBuilder().setCustomId('cv_upg_sel').setPlaceholder('🛠️ حدد العنصر لترقيته...').addOptions(opts2)
                        ),
                        new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId('cv_back').setLabel('↩️ رجوع للرئيسية').setStyle(ButtonStyle.Secondary)
                        ),
                    ];
                    await hubMsg.edit(payload2).catch(() => {});
                }

                else if (id === 'cv_equip') {
                    const active = await getActiveCaravan(db, user.id, guild.id);
                    if (active) {
                        await i.followUp({ content: '❌ لا يمكنك تجهيز الأدوات والقافلة في منتصف رحلتها!', flags: [MessageFlags.Ephemeral] });
                        activeProcesses.delete(user.id);
                        return;
                    }
                    const invRes = await safeQuery(db, `SELECT "itemID","quantity" FROM user_inventory WHERE "userID"=$1 AND "guildID"=$2 AND "quantity">0`, [user.id, guild.id]);
                    if (!invRes.rows.length) {
                        await i.followUp({ content: '📦 ليس لديك أدوات لتجهيزها، احصل عليها من الدانجون أو الحدادة.', flags: [MessageFlags.Ephemeral] });
                        activeProcesses.delete(user.id);
                        return;
                    }
                    
                    const allItems  = allItemsList();
                    const sessionKey = `${user.id}-${guild.id}`;
                    if (!client.caravanEquip) client.caravanEquip = new Map();
                    const equipped  = client.caravanEquip.get(sessionKey) || [];
                    const mora      = await getMora(db, user.id, guild.id);
                    const payload   = await sendCanvas(GEN.generateEquipPanel, [user, equipped, invRes.rows, allItems, mora]);

                    const opts = invRes.rows.slice(0, 25).map(row => {
                        const id2  = row.itemid || row.itemID;
                        const cleanName = getItemNameSafe(id2);
                        const isEq = equipped.includes(id2);
                        return {
                            label:       cleanName.substring(0, 25),
                            value:       id2,
                            description: isEq ? '✅ تم تجهيزها في القافلة' : 'توجد في المخزن',
                            emoji:       isEq ? '✅' : '📦',
                        };
                    });
                    
                    payload.components = [
                        new ActionRowBuilder().addComponents(
                            new StringSelectMenuBuilder().setCustomId('cv_eq_sel').setPlaceholder('🔧 اختر أداة لتركيبها أو خلعها...').addOptions(opts)
                        ),
                        new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId('cv_back').setLabel('↩️ رجوع للرئيسية').setStyle(ButtonStyle.Secondary)
                        ),
                    ];
                    await hubMsg.edit(payload).catch(() => {});
                }

                else if (id === 'cv_eq_sel') {
                    const sessionKey = `${user.id}-${guild.id}`;
                    const current    = client.caravanEquip?.get(sessionKey) || [];
                    const itemId     = i.values[0];
                    let updated;
                    if (current.includes(itemId)) {
                        updated = current.filter(x => x !== itemId);
                    } else if (current.length >= 3) {
                        await i.followUp({ content: '❌ مساحة القافلة ممتلئة (3 أدوات كحد أقصى). اخلع أداة لتتمكن من إضافة غيرها.', flags: [MessageFlags.Ephemeral] });
                        activeProcesses.delete(user.id);
                        return;
                    } else {
                        updated = [...current, itemId];
                    }
                    if (!client.caravanEquip) client.caravanEquip = new Map();
                    client.caravanEquip.set(sessionKey, updated);

                    const invRes2   = await safeQuery(db, `SELECT "itemID","quantity" FROM user_inventory WHERE "userID"=$1 AND "guildID"=$2 AND "quantity">0`, [user.id, guild.id]);
                    const allItems2 = allItemsList();
                    const mora2     = await getMora(db, user.id, guild.id);
                    const payload2  = await sendCanvas(GEN.generateEquipPanel, [user, updated, invRes2.rows, allItems2, mora2]);
                    
                    const opts2 = invRes2.rows.slice(0, 25).map(row => {
                        const id2  = row.itemid || row.itemID;
                        const cleanName = getItemNameSafe(id2);
                        const isEq = updated.includes(id2);
                        return {
                            label:       cleanName.substring(0, 25),
                            value:       id2,
                            description: isEq ? '✅ تم تجهيزها في القافلة' : 'توجد في المخزن',
                            emoji:       isEq ? '✅' : '📦',
                        };
                    });
                    
                    payload2.components = [
                        new ActionRowBuilder().addComponents(
                            new StringSelectMenuBuilder().setCustomId('cv_eq_sel').setPlaceholder('🔧 اختر أداة لتركيبها أو خلعها...').addOptions(opts2)
                        ),
                        new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId('cv_back').setLabel('↩️ رجوع للرئيسية').setStyle(ButtonStyle.Secondary)
                        ),
                    ];
                    await hubMsg.edit(payload2).catch(() => {});
                }

                else if (id === 'cv_back') {
                    await showHub(hubMsg);
                }
            } finally {
                activeProcesses.delete(user.id);
            }
        });

        collector.on('end', async () => {
            try {
                const activeCheck = await getActiveCaravan(db, user.id, guild.id);
                await hubMsg.edit({ components: [navRow(!!activeCheck, true)] }).catch(() => {});
            } catch(e) {}
        });
    }
};
