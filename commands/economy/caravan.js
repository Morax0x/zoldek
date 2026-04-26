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

let generateCaravanCard;
try { ({ generateCaravanCard } = require('../../generators/caravan-generator.js')); }
catch { generateCaravanCard = null; }

/* ═══════════════════ بيانات الأمر ═══════════════════ */
module.exports = {
    data: new SlashCommandBuilder()
        .setName('caravan')
        .setDescription('نظام القوافل — أرسل قافلتك في مهام لجمع الثروات والمكافآت.')
        .addSubcommand(sub => sub
            .setName('send')
            .setDescription('أرسل قافلتك في رحلة جديدة'))
        .addSubcommand(sub => sub
            .setName('status')
            .setDescription('اعرض حالة قافلتك الحالية'))
        .addSubcommand(sub => sub
            .setName('upgrade')
            .setDescription('قم بترقية قافلتك'))
        .addSubcommand(sub => sub
            .setName('equip')
            .setDescription('جهّز أدوات من مخزنك على القافلة')),

    name:     'caravan',
    aliases:  ['قافلة', 'قوافل', 'رحلة'],
    category: 'Economy',
    description: 'نظام القوافل المتكامل',

    /* ═══════════════════ execute ═══════════════════ */
    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, client, guild, user, member;

        if (isSlash) {
            interaction = interactionOrMessage;
            client = interaction.client;
            guild  = interaction.guild;
            user   = interaction.user;
            member = interaction.member;
            await interaction.deferReply().catch(() => {});
        } else {
            message = interactionOrMessage;
            client  = message.client;
            guild   = message.guild;
            user    = message.author;
            member  = message.member;
        }

        const db = client.sql;
        const reply = async (payload) =>
            isSlash ? interaction.editReply(payload).catch(() => {})
                    : message.channel.send(payload).catch(() => {});

        // تهيئة الجداول + الفاحص التلقائي (مرة واحدة فقط)
        await initCaravanTables(db).catch(() => {});
        setupCaravanChecker(client, db);

        // تحديد الأمر الفرعي (سلاش أو نص)
        let sub = isSlash ? interaction.options.getSubcommand() : (args?.[0] || 'status');
        if (['send','إرسال','أرسل'].includes(sub))         sub = 'send';
        else if (['upgrade','ترقية','ترقيه'].includes(sub)) sub = 'upgrade';
        else if (['equip','جهز','تجهيز'].includes(sub))    sub = 'equip';
        else sub = 'status';

        /* ─────────── send ─────────── */
        if (sub === 'send') {
            const active = await getActiveCaravan(db, user.id, guild.id);
            if (active) {
                return reply({ embeds: [new EmbedBuilder()
                    .setColor('#FF4444')
                    .setDescription(`❌ لديك قافلة نشطة بالفعل! استخدم \`/caravan status\` لمتابعتها.`)
                ] });
            }

            // قائمة الوجهات
            const options = caravanConfig.destinations.map(d => ({
                label:       d.name,
                value:       d.id,
                description: `${d.duration_hours}س | تكلفة: ${d.cost.toLocaleString()} مورا | خطر: ${(d.risk_factor*100).toFixed(0)}%`,
                emoji:       d.emoji.replace(/️/g, ''),
            }));

            const selectRow = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('caravan_dest_select')
                    .setPlaceholder('اختر وجهة الرحلة...')
                    .addOptions(options)
            );

            const stats   = await getUserCaravanStats(db, user.id, guild.id);
            const descLines = caravanConfig.destinations.map(d => {
                const buffs   = getEquippedBuffs([]);
                const dur     = calcDuration(d, stats, buffs);
                const risk    = calcRiskFactor(d, stats);
                const hours   = Math.floor(dur / 3600000);
                const mins    = Math.floor((dur % 3600000) / 60000);
                return `${d.emoji} **${d.name}** — ${hours}س${mins>0?` ${mins}د`:''} | ⚠️ ${(risk*100).toFixed(0)}% | 💰 ${d.cost.toLocaleString()} ${EMOJI_MORA}`;
            });

            const menuMsg = await reply({
                embeds: [new EmbedBuilder()
                    .setColor('#FFD700')
                    .setTitle('🗺️ اختر وجهة قافلتك')
                    .setDescription(descLines.join('\n'))
                    .setFooter({ text: 'لديك 60 ثانية للاختيار' })
                ],
                components: [selectRow],
                fetchReply: true,
            });

            const msgRef = isSlash ? await interaction.fetchReply() : menuMsg;
            const collector = msgRef.createMessageComponentCollector({
                componentType: ComponentType.StringSelect,
                filter: i => i.customId === 'caravan_dest_select' && i.user.id === user.id,
                time: 60000, max: 1,
            });

            collector.on('collect', async i => {
                await i.deferUpdate().catch(() => {});
                const destId = i.values[0];
                const dest   = caravanConfig.destinations.find(d => d.id === destId);

                // التحقق من الرصيد
                const userData = await safeQuery(db,
                    `SELECT "mora" FROM levels WHERE "user"=$1 AND "guild"=$2`, [user.id, guild.id]);
                const mora = Number(userData.rows[0]?.mora || 0);
                if (mora < dest.cost) {
                    await i.followUp({ content: `❌ تحتاج **${dest.cost.toLocaleString()}** ${EMOJI_MORA} لإرسال القافلة. رصيدك: **${mora.toLocaleString()}**`, flags: [MessageFlags.Ephemeral] });
                    return;
                }

                // خصم التكلفة
                await safeExecute(db,
                    `UPDATE levels SET "mora"=CAST(COALESCE("mora",'0') AS BIGINT)-$1 WHERE "user"=$2 AND "guild"=$3`,
                    [dest.cost, user.id, guild.id]);

                const sessionKey     = `${user.id}-${guild.id}`;
                const savedArtifacts = client.caravanEquip?.get(sessionKey) || [];
                const result = await sendCaravan(db, user.id, guild.id, destId, savedArtifacts);
                if (result.error) {
                    await i.followUp({ content: `❌ ${result.error}`, flags: [MessageFlags.Ephemeral] });
                    return;
                }

                const hours = Math.floor(result.durationMs / 3600000);
                const mins  = Math.floor((result.durationMs % 3600000) / 60000);
                const eta   = Math.floor(result.endTime / 1000);

                await msgRef.edit({
                    embeds: [new EmbedBuilder()
                        .setColor(dest.color || '#00FF88')
                        .setTitle(`🐪 انطلقت القافلة إلى ${dest.emoji} ${dest.name}!`)
                        .setDescription(
                            `✶ **المدة:** ${hours}س ${mins}د\n` +
                            `✶ **الوصول:** <t:${eta}:R>\n` +
                            `✶ **الخطر:** ${(result.riskFactor*100).toFixed(0)}%\n` +
                            `✶ المكافآت ستُضاف تلقائياً عند العودة.`
                        )
                        .setFooter({ text: 'تابع حالة قافلتك بـ /caravan status' })
                    ],
                    components: [],
                }).catch(() => {});
            });

            collector.on('end', async (collected) => {
                if (!collected.size) {
                    await msgRef.edit({ components: [] }).catch(() => {});
                }
            });
            return;
        }

        /* ─────────── status ─────────── */
        if (sub === 'status') {
            const active = await getActiveCaravan(db, user.id, guild.id);
            const stats  = await getUserCaravanStats(db, user.id, guild.id);

            if (!active) {
                const upgs = caravanConfig.upgrades;
                const lines = Object.entries(upgs).map(([key, cfg]) => {
                    const rank = Number(stats[`${key}_rank`] || stats[`${key}rank`] || 1);
                    return `${cfg.emoji} **${cfg.name}:** لv.${rank} / لv.${cfg.max_level}`;
                });
                return reply({ embeds: [new EmbedBuilder()
                    .setColor('#2A3A5A')
                    .setTitle('🐪 قافلتك — لا توجد رحلة نشطة')
                    .setDescription(
                        `لا توجد قافلة نشطة الآن.\nاستخدم \`/caravan send\` لإرسال قافلة.\n\n` +
                        `**ترقيات القافلة:**\n${lines.join('\n')}\n\n` +
                        `📊 الرحلات الناجحة: **${stats.successful_trips||0}** / **${stats.total_trips||0}**`
                    )
                ] });
            }

            const destId = active.destinationid || active.destinationId;
            const dest   = caravanConfig.destinations.find(d => d.id === destId);

            if (!generateCaravanCard) {
                return reply({ embeds: [new EmbedBuilder()
                    .setColor(dest?.color || '#FFD700')
                    .setTitle(`🗺️ قافلة — ${dest?.name || destId}`)
                    .setDescription(
                        `📍 الوجهة: ${dest?.emoji} ${dest?.name}\n` +
                        `⏳ الوصول: <t:${Math.floor(Number(active.endtime||active.endTime)/1000)}:R>`
                    )
                ] });
            }

            try {
                const buffer     = await generateCaravanCard(user, active, stats, dest);
                const attachment = new AttachmentBuilder(buffer, { name: 'caravan.png' });
                return reply({ files: [attachment] });
            } catch (e) {
                console.error('[caravan status canvas]', e);
                return reply({ content: '⚠️ تعذّر توليد الصورة. حاول مرة أخرى.' });
            }
        }

        /* ─────────── upgrade ─────────── */
        if (sub === 'upgrade') {
            const stats = await getUserCaravanStats(db, user.id, guild.id);
            const upgs  = caravanConfig.upgrades;

            const options = Object.entries(upgs).map(([key, cfg]) => {
                const rank = Number(stats[`${key}_rank`] || stats[`${key}rank`] || 1);
                const maxed = rank >= cfg.max_level;
                const cost  = maxed ? 0 : cfg.costs[rank];
                return {
                    label:       `${cfg.name} — لv.${rank}${maxed?' (الأقصى)':` → لv.${rank+1}`}`,
                    value:       key,
                    description: maxed ? 'وصلت للحد الأقصى' : `التكلفة: ${cost.toLocaleString()} مورا`,
                    emoji:       cfg.emoji,
                };
            });

            const menuMsg = await reply({
                embeds: [new EmbedBuilder()
                    .setColor('#00C3FF')
                    .setTitle('🏗️ ترقية القافلة')
                    .setDescription(
                        Object.entries(upgs).map(([key, cfg]) => {
                            const rank = Number(stats[`${key}_rank`] || 1);
                            const cost = rank >= cfg.max_level ? '(الأقصى)' : `${cfg.costs[rank].toLocaleString()} ${EMOJI_MORA}`;
                            return `${cfg.emoji} **${cfg.name}:** لv.${rank} — ${cost}\n> ${cfg.description}`;
                        }).join('\n\n')
                    )
                ],
                components: [new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('caravan_upgrade_select')
                        .setPlaceholder('اختر نوع الترقية...')
                        .addOptions(options)
                )],
                fetchReply: true,
            });

            const msgRef    = isSlash ? await interaction.fetchReply() : menuMsg;
            const collector = msgRef.createMessageComponentCollector({
                componentType: ComponentType.StringSelect,
                filter: i => i.customId === 'caravan_upgrade_select' && i.user.id === user.id,
                time: 60000, max: 1,
            });

            collector.on('collect', async i => {
                await i.deferUpdate().catch(() => {});
                const result = await upgradeCaravan(db, user.id, guild.id, i.values[0]);
                if (result.error) {
                    await i.followUp({ content: `❌ ${result.error}`, flags: [MessageFlags.Ephemeral] });
                } else {
                    await msgRef.edit({
                        embeds: [new EmbedBuilder()
                            .setColor('#00FF88')
                            .setTitle(`✅ تمت الترقية بنجاح!`)
                            .setDescription(
                                `${result.upgCfg.emoji} **${result.upgCfg.name}** → لv.**${result.newLevel}**\n` +
                                `خُصم: **${result.cost.toLocaleString()}** ${EMOJI_MORA}`
                            )
                        ],
                        components: [],
                    }).catch(() => {});
                }
            });

            collector.on('end', async (collected) => {
                if (!collected.size) await msgRef.edit({ components: [] }).catch(() => {});
            });
            return;
        }

        /* ─────────── equip ─────────── */
        if (sub === 'equip') {
            const active = await getActiveCaravan(db, user.id, guild.id);
            if (active) {
                return reply({ embeds: [new EmbedBuilder()
                    .setColor('#FF4444')
                    .setDescription('❌ لا يمكن تغيير الأدوات أثناء رحلة نشطة. انتظر عودة القافلة.')
                ] });
            }

            // جلب الأدوات من المخزن
            const invRes = await safeQuery(db,
                `SELECT "itemID","quantity" FROM user_inventory WHERE "userID"=$1 AND "guildID"=$2 AND "quantity">0`,
                [user.id, guild.id]);

            if (!invRes.rows.length) {
                return reply({ embeds: [new EmbedBuilder()
                    .setColor('#445566')
                    .setDescription('📦 مخزنك فارغ! احصل على أدوات عبر `/gacha`.')
                ] });
            }

            const upgMats = require('../../json/upgrade-materials.json');
            const allItems = [];
            if (upgMats?.weapon_materials)
                upgMats.weapon_materials.forEach(r => r.materials.forEach(m => allItems.push(m)));
            if (upgMats?.skill_books)
                upgMats.skill_books.forEach(c => c.books.forEach(b => allItems.push(b)));

            const RARITY_COLOR = { Common:'⚪', Uncommon:'🟢', Rare:'🔵', Epic:'🟣', Legendary:'🟡' };

            // قراءة التجهيزات الحالية من الجلسة (نخزنها مؤقتاً في Map على client)
            if (!client.caravanEquip) client.caravanEquip = new Map();
            const sessionKey    = `${user.id}-${guild.id}`;
            const equippedNow   = client.caravanEquip.get(sessionKey) || [];

            const options = invRes.rows.slice(0, 25).map(row => {
                const id   = row.itemid || row.itemID;
                const item = allItems.find(x => x.id === id);
                const isEq = equippedNow.includes(id);
                return {
                    label:       (item?.name || id).substring(0, 25),
                    value:       id,
                    description: `${RARITY_COLOR[item?.rarity]||'⚪'} ${item?.rarity||'?'} — ${isEq?'✅ مجهّز':'غير مجهّز'}`,
                    emoji:       isEq ? '✅' : '📦',
                };
            });

            const buffs    = getEquippedBuffs(equippedNow);
            const menuMsg  = await reply({
                embeds: [new EmbedBuilder()
                    .setColor('#B968FF')
                    .setTitle('🔮 تجهيز الأدوات على القافلة (الحد الأقصى: 3)')
                    .setDescription(
                        `اختر أداة للتبديل (تجهيز/خلع).\n\n` +
                        `**مجهّز الآن:** ${equippedNow.length ? equippedNow.join(', ') : 'لا شيء'}\n` +
                        `⚡ بافات السرعة: **+${(buffs.speedBuff*100).toFixed(0)}%**\n` +
                        `🍀 بافات الحظ: **+${(buffs.luckBuff*100).toFixed(0)}%**\n\n` +
                        `> المواد ترفع السرعة، والكتب ترفع الحظ.`
                    )
                ],
                components: [new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('caravan_equip_select')
                        .setPlaceholder('اختر أداة للتبديل...')
                        .addOptions(options)
                )],
                fetchReply: true,
            });

            const msgRef    = isSlash ? await interaction.fetchReply() : menuMsg;
            const collector = msgRef.createMessageComponentCollector({
                componentType: ComponentType.StringSelect,
                filter: i => i.customId === 'caravan_equip_select' && i.user.id === user.id,
                time: 90000,
            });

            collector.on('collect', async i => {
                await i.deferUpdate().catch(() => {});
                const itemId  = i.values[0];
                const current = client.caravanEquip.get(sessionKey) || [];
                let updated;
                if (current.includes(itemId)) {
                    updated = current.filter(x => x !== itemId);
                } else if (current.length >= 3) {
                    await i.followUp({ content: '❌ الحد الأقصى 3 أدوات. أزل أداة أولاً.', flags: [MessageFlags.Ephemeral] });
                    return;
                } else {
                    updated = [...current, itemId];
                }
                client.caravanEquip.set(sessionKey, updated);
                const newBuffs = getEquippedBuffs(updated);

                // تحديث خيارات القائمة
                const newOptions = invRes.rows.slice(0,25).map(row => {
                    const id   = row.itemid || row.itemID;
                    const item = allItems.find(x => x.id === id);
                    const isEq = updated.includes(id);
                    return {
                        label:       (item?.name || id).substring(0, 25),
                        value:       id,
                        description: `${RARITY_COLOR[item?.rarity]||'⚪'} ${item?.rarity||'?'} — ${isEq?'✅ مجهّز':'غير مجهّز'}`,
                        emoji:       isEq ? '✅' : '📦',
                    };
                });

                await msgRef.edit({
                    embeds: [new EmbedBuilder()
                        .setColor('#B968FF')
                        .setTitle('🔮 تجهيز الأدوات على القافلة (الحد الأقصى: 3)')
                        .setDescription(
                            `اختر أداة للتبديل (تجهيز/خلع).\n\n` +
                            `**مجهّز الآن:** ${updated.length ? updated.map(id => allItems.find(x=>x.id===id)?.name||id).join(', ') : 'لا شيء'}\n` +
                            `⚡ بافات السرعة: **+${(newBuffs.speedBuff*100).toFixed(0)}%**\n` +
                            `🍀 بافات الحظ: **+${(newBuffs.luckBuff*100).toFixed(0)}%**\n\n` +
                            `> الأدوات محفوظة للرحلة القادمة.`
                        )
                    ],
                    components: [new ActionRowBuilder().addComponents(
                        new StringSelectMenuBuilder()
                            .setCustomId('caravan_equip_select')
                            .setPlaceholder('اختر أداة للتبديل...')
                            .addOptions(newOptions)
                    )],
                }).catch(() => {});
            });

            collector.on('end', async () => {
                await msgRef.edit({ components: [] }).catch(() => {});
            });
        }
    }
};
