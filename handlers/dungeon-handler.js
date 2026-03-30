const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ChannelType, ComponentType, MessageFlags, Colors } = require('discord.js');
const { runDungeon } = require('./dungeon-battle.js'); 
const { dungeonConfig, EMOJI_MORA, OWNER_ID } = require('./dungeon/constants.js');
const { manageTickets } = require('./dungeon/utils.js');

const activeDungeonRequests = new Map();
const COOLDOWN_TIME = 1 * 60 * 60 * 1000; 

async function startDungeon(interaction, db) {
    const user = interaction.user;

    const isButtonInteraction = interaction.isButton && typeof interaction.isButton === 'function' && interaction.isButton();

    if (isButtonInteraction && interaction.customId === 'dungeon_campfire') {
        return; 
    }

    if (activeDungeonRequests.has(user.id)) {
        return interaction.reply({ content: "🚫 لديك طلب دانجون نشط بالفعل!", flags: [MessageFlags.Ephemeral] });
    }

    const leaderDataRes = await db.query(`SELECT "level" FROM levels WHERE "user" = $1 AND "guild" = $2`, [user.id, interaction.guild.id]);
    const leaderData = leaderDataRes.rows[0];
    
    if (!leaderData || Number(leaderData.level) < 10) {
        const denyEmbed = new EmbedBuilder()
            .setTitle("✶ لا تستوفي الشروط")
            .setDescription("- الـدانجـون محفوف بالمخـاطر، ارفع مستواك إلى **10** لتتمكن من قيادة غارة الدانجون.")
            .setColor('#FF0000')
            .setThumbnail('https://i.postimg.cc/hPxYnBZ7/adaft-ʿnwan.png');

        return interaction.reply({ embeds: [denyEmbed], flags: [MessageFlags.Ephemeral] });
    }

    let abyssKing = false;
    try {
        const settingsRes = await db.query(`SELECT "roleAbyss" FROM settings WHERE "guild" = $1`, [interaction.guild.id]);
        const settings = settingsRes.rows[0];
        if (settings && (settings.roleAbyss || settings.roleabyss) && interaction.member.roles.cache.has(settings.roleAbyss || settings.roleabyss)) {
            abyssKing = true;
        }
    } catch (e) {}

    if (user.id !== OWNER_ID && !abyssKing) { 
        const lastRunRes = await db.query(`SELECT "last_dungeon" FROM levels WHERE "user" = $1 AND "guild" = $2`, [user.id, interaction.guild.id]);
        const lastRun = lastRunRes.rows[0];
        const lastDungeon = lastRun ? (Number(lastRun.last_dungeon) || 0) : 0;
        const now = Date.now();
        if (now - lastDungeon < COOLDOWN_TIME) {
             const remaining = lastDungeon + COOLDOWN_TIME;
             return interaction.reply({ content: `⏳ **استرح قليلاً!** الكولداون ينتهي <t:${Math.floor(remaining/1000)}:R>.`, flags: [MessageFlags.Ephemeral] });
        }
    }

    const themeKeys = Object.keys(dungeonConfig.themes || {});
    if (themeKeys.length === 0) {
        return interaction.reply({ content: "❌ لا توجد بيانات للدانجون حالياً.", flags: [MessageFlags.Ephemeral] });
    }

    const randomKey = themeKeys[Math.floor(Math.random() * themeKeys.length)];
    const selectedTheme = { ...dungeonConfig.themes[randomKey], key: randomKey };
      
    let startFloor = 1;
    const saveRes = await db.query(`SELECT * FROM dungeon_saves WHERE "hostID" = $1`, [user.id]);
    const save = saveRes.rows[0];

    if (save) {
        let expiryTime = 24 * 60 * 60 * 1000;
        const member = interaction.member || (interaction.guild ? interaction.guild.members.cache.get(user.id) : null);
        
        if (member) {
            if (member.roles.cache.has('1422160802416164885')) expiryTime = 72 * 60 * 60 * 1000;
            else if (member.roles.cache.has('1395674235002945636')) expiryTime = 35 * 60 * 60 * 1000;
        }

        const timeLeft = expiryTime - (Date.now() - Number(save.timestamp));

        if (timeLeft > 0) {
            startFloor = Number(save.floor); 
        } else {
            await db.query(`DELETE FROM dungeon_saves WHERE "hostID" = $1`, [user.id]);
        }
    }

    activeDungeonRequests.set(user.id, { status: 'lobby', startFloor: startFloor });

    try {
        await lobbyPhase(interaction, null, selectedTheme, db, startFloor);
    } catch (err) {
        console.error(err);
        activeDungeonRequests.delete(user.id);
        const replyFunc = interaction.reply ? interaction.reply.bind(interaction) : interaction.channel.send.bind(interaction.channel);
        replyFunc({ content: "❌ حدث خطأ أثناء بدء اللوبي.", flags: [MessageFlags.Ephemeral] }).catch(()=>{});
    }
}

async function lobbyPhase(interaction, oldMsg, theme, db, startFloor = 1) {
    const host = interaction.user;
    const guildId = interaction.guild.id;
      
    let partyClasses = new Map();
    partyClasses.set(host.id, 'Leader');
    let party = [host.id];

    const isUserAbyssKing = async (userId) => {
        try {
            const settingsRes = await db.query(`SELECT "roleAbyss" FROM settings WHERE "guild" = $1`, [guildId]);
            const settings = settingsRes.rows[0];
            if (!settings || (!settings.roleAbyss && !settings.roleabyss)) return false;
            const member = await interaction.guild.members.fetch(userId).catch(() => null);
            if (member && member.roles.cache.has(settings.roleAbyss || settings.roleabyss)) return true;
        } catch (e) {}
        return false;
    };
      
    const updateEmbed = () => {
        const memberList = party.map((id, i) => {
            const cls = partyClasses.get(id);
            let arabCls = cls;
            if (cls === 'Leader') arabCls = 'القائد 👑';
            else if (cls === 'Tank') arabCls = 'مُدرّع 🛡️';
            else if (cls === 'Priest') arabCls = 'كاهن ✨';
            else if (cls === 'Mage') arabCls = 'ساحر ❄️';
            else if (cls === 'Summoner') arabCls = 'مستدعٍ 🐺';
            return `\`${i+1}.\` <@${id}> — **${arabCls}**`;
        }).join('\n');

        const imageUrl = theme.image || 'https://i.postimg.cc/NMkWVyLV/line.png';

        let desc = `**القائد:** ${host}\n**الشروط:** لفل 5+ و 100 ${EMOJI_MORA}\n\n🔮 **تم فتح البوابة إلى ${theme.name}!**`;
        
        if (startFloor > 1) {
            desc += `\n🏕️ **(سيتم استكمال الرحلة من الطابق ${startFloor})**`;
        }

        desc += `\nاختر تخصصك واستعد للمعركة.\n\n👥 **الفريق:**\n${memberList}`;

        return new EmbedBuilder()
            .setTitle(`دانجون: ${theme.name}`) 
            .setColor(theme.color || '#2F3136') 
            .setDescription(desc)
            .setImage(imageUrl) 
            .setThumbnail(host.displayAvatarURL());
    };

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('join').setLabel('انضمام').setStyle(ButtonStyle.Success).setEmoji('➕'), 
        new ButtonBuilder().setCustomId('start').setLabel('انطلاق').setStyle(ButtonStyle.Primary).setEmoji('⚔️'), 
        new ButtonBuilder().setCustomId('cancel').setLabel('إلغاء').setStyle(ButtonStyle.Danger).setEmoji('✖️') 
    );

    let msg;
    if (interaction.reply && typeof interaction.reply === 'function') {
        if (interaction.replied || interaction.deferred) {
            msg = await interaction.followUp({ embeds: [updateEmbed()], components: [row], fetchReply: true });
        } else {
            msg = await interaction.reply({ embeds: [updateEmbed()], components: [row], fetchReply: true });
        }
    } else {
        msg = await interaction.channel.send({ embeds: [updateEmbed()], components: [row] });
    }
      
    const collector = msg.createMessageComponentCollector({ time: 60000 });

    collector.on('collect', async i => {
        if (i.replied || i.deferred) return;

        try {
            if (i.customId === 'join') {
                if (i.user.id === host.id) return i.reply({ content: "👑 أنت القائد.", flags: [MessageFlags.Ephemeral] });
                if (party.length >= 5 && !party.includes(i.user.id)) return i.reply({ content: "🚫 الفريق ممتلئ.", flags: [MessageFlags.Ephemeral] });

                const targetIsKing = await isUserAbyssKing(i.user.id);

                if (!party.includes(i.user.id) && i.user.id !== OWNER_ID && !targetIsKing) {
                    const jDataRes = await db.query(`SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2`, [i.user.id, guildId]);
                    const jData = jDataRes.rows[0];
                    
                    if (!jData || Number(jData.level) < 5 || Number(jData.mora) < 100) return i.reply({ content: "🚫 لا تستوفي الشروط (لفل 5+ ومورا 100).", flags: [MessageFlags.Ephemeral] });
                    
                    const limitCheck = await manageTickets(i.user.id, guildId, db, 'check', i.member);
                    
                    if (limitCheck.tickets <= 0) {
                        const now = new Date();
                        const nextReset = new Date(now);
                        nextReset.setUTCHours(21, 0, 0, 0); 
                        if (now > nextReset) nextReset.setDate(nextReset.getDate() + 1);
                        const timestamp = Math.floor(nextReset.getTime() / 1000);

                        return i.reply({ 
                            content: `✶ **نفـذت تذاكـرك!** انتظر إلى أن تصرف نقابة المغامرين تذاكرك الجديدة.\n- **وقت تجديد التذاكر:** <t:${timestamp}:R>`, 
                            flags: [MessageFlags.Ephemeral] 
                        });
                    }
                }

                if (targetIsKing && !party.includes(i.user.id)) {
                    await i.followUp({ content: "👑 **بصفتك ملك الهاوية، تم تخطي شروط وتذاكر الدخول لك!**", flags: [MessageFlags.Ephemeral] }).catch(()=>{});
                }

                const takenClasses = [];
                partyClasses.forEach((c, u) => { if(u !== i.user.id) takenClasses.push(c); });
                const opts = [];
                const addOpt = (v, l, e) => { if(!takenClasses.includes(v)) opts.push(new StringSelectMenuOptionBuilder().setLabel(l).setValue(v).setEmoji(e)); };
                  
                addOpt('Tank', 'المُدرّع', '🛡️'); 
                addOpt('Priest', 'الكاهن', '✨'); 
                addOpt('Mage', 'الساحر', '❄️'); 
                addOpt('Summoner', 'المستدعي', '🐺');

                if (opts.length === 0) return i.reply({ content: "🚫 جميع التخصصات مأخوذة.", flags: [MessageFlags.Ephemeral] });

                const sRow = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('cls').setPlaceholder('اختر تخصصك...').addOptions(opts));
                const sMsg = await i.reply({ content: "🛡️ اختر تخصصك:", components: [sRow], flags: [MessageFlags.Ephemeral], fetchReply: true });

                const sel = await sMsg.awaitMessageComponent({ filter: x => x.user.id === i.user.id, time: 20000, componentType: ComponentType.StringSelect }).catch(() => null);
                
                if (sel) {
                    const chosen = sel.values[0];
                    const dCheck = Array.from(partyClasses.entries()).filter(x => x[0] !== i.user.id).map(x => x[1]);
                    
                    if (sel.replied || sel.deferred) return; 

                    if (dCheck.includes(chosen)) {
                        return sel.update({ content: "🚫 سبقك بها غيرك.", components: [] }).catch(()=>{});
                    }

                    await sel.deferUpdate().catch(()=>{});
                    
                    partyClasses.set(i.user.id, chosen);
                    if (!party.includes(i.user.id)) party.push(i.user.id);
                        
                    await sel.editReply({ content: `✅ تم: **${chosen}**`, components: [] }).catch(()=>{});
                    await msg.edit({ embeds: [updateEmbed()] }).catch(()=>{});
                } else {
                    await i.editReply({ content: "⏰ انتهى الوقت.", components: [] }).catch(()=>{});
                }

            } else if (i.customId === 'start') {
                if (i.user.id !== host.id) return i.reply({ content: "⛔ القائد فقط.", flags: [MessageFlags.Ephemeral] });
                
                if (!i.replied && !i.deferred) await i.deferUpdate();
                collector.stop('start');

            } else if (i.customId === 'cancel') {
                if (i.user.id !== host.id) return i.reply({ content: "⛔ القائد فقط.", flags: [MessageFlags.Ephemeral] });
                
                if (!i.replied && !i.deferred) await i.deferUpdate();
                collector.stop('user_cancel');
            }
        } catch (e) { console.error(e); }
    });

    collector.on('end', async (c, reason) => {
        if (reason === 'start') {
            const now = Date.now();
            
            if (startFloor > 1) {
                await db.query(`DELETE FROM dungeon_saves WHERE "hostID" = $1 AND "guildID" = $2`, [host.id, guildId]);
            }

            let validParty = [];
            let kickedMembers = [];

            for (const id of party) {
                const targetIsKing = await isUserAbyssKing(id);

                if (id === host.id || id === OWNER_ID || targetIsKing) {
                    validParty.push(id);
                    
                    if (id !== OWNER_ID && !targetIsKing) {
                        await db.query(`UPDATE levels SET "mora" = "mora" - 100 WHERE "user" = $1 AND "guild" = $2`, [id, guildId]);
                    }
                    
                    if (id === host.id && id !== OWNER_ID && !targetIsKing) {
                        await db.query(`UPDATE levels SET "last_dungeon" = $1 WHERE "user" = $2 AND "guild" = $3`, [now, id, guildId]);
                    }
                } else {
                    const memberObj = await msg.guild.members.fetch(id).catch(() => null);
                    const consumeResult = await manageTickets(id, guildId, db, 'consume', memberObj);
                    
                    if (consumeResult.success) {
                        validParty.push(id);
                        await db.query(`UPDATE levels SET "mora" = "mora" - 100 WHERE "user" = $1 AND "guild" = $2`, [id, guildId]);
                        
                        const dRes = await db.query(`SELECT "last_join_reset" FROM levels WHERE "user" = $1 AND "guild" = $2`, [id, guildId]);
                        const d = dRes.rows[0];
                        const lastJoin = d ? (Number(d.last_join_reset) || 0) : 0;
                        if (now - lastJoin > COOLDOWN_TIME) {
                            await db.query(`UPDATE levels SET "last_join_reset" = $1, "dungeon_join_count" = 1 WHERE "user" = $2 AND "guild" = $3`, [now, id, guildId]);
                        } else {
                            await db.query(`UPDATE levels SET "dungeon_join_count" = "dungeon_join_count" + 1 WHERE "user" = $1 AND "guild" = $2`, [id, guildId]);
                        }
                    } else {
                        kickedMembers.push(id);
                    }
                }
            }

            for (const kickedId of kickedMembers) { partyClasses.delete(kickedId); }

            if (kickedMembers.length > 0) {
                msg.channel.send(`⚠️ **تنبيه:** تم استبعاد ${kickedMembers.map(id => `<@${id}>`).join(', ')} لانتهاء محاولاتهم اليومية!`).catch(()=>{});
            }

            try {
                // 🔥 إنشاء الثريد بأمان تام
                const thread = await msg.channel.threads.create({
                    name: `🏰-دانجون-${theme.name.replace(/ /g, '-')}`,
                    autoArchiveDuration: 60,
                    type: ChannelType.PublicThread,
                    reason: 'Start Dungeon Battle'
                });

                if (msg.editable) await msg.edit({ content: `✅ **بوابة الـدانـجون فُتحت!** <#${thread.id}>`, components: [] });

                await new Promise(r => setTimeout(r, 1500));

                for (const uid of validParty) { 
                    try { await thread.members.add(uid); } catch(e){} 
                }

                const startMsg = await thread.send(`🔔 **يتم الآن استدعاء وحوش ${theme.name}.. استعدوا!**`);

                if (typeof runDungeon === 'function') {
                    try {
                        await runDungeon(thread, msg.channel, validParty, theme, db, host.id, partyClasses, activeDungeonRequests, startFloor);
                    } catch (battleError) {
                        console.error("[Dungeon] Battle Error:", battleError);
                        activeDungeonRequests.delete(host.id);
                        thread.send("❌ **فشل في استدعاء الوحوش. الرجاء إعادة المحاولة!**").catch(()=>{});
                    }
                } else {
                    throw new Error("Dungeon battle logic (runDungeon) is not loaded correctly.");
                }

            } catch (e) {
                console.error("Dungeon Start Fatal Error:", e);
                activeDungeonRequests.delete(host.id);
                msg.channel.send(`❌ **فشل في استكمال طقوس الدانجون:** ${e.message}`).catch(()=>{});
            }
        } else {
            activeDungeonRequests.delete(host.id);
            if (msg.editable) {
                try {
                    const fetchedMsg = await msg.fetch().catch(() => null);
                    if (fetchedMsg && fetchedMsg.embeds.length > 0) {
                        const oldEmbed = fetchedMsg.embeds[0];
                        const cancelledEmbed = EmbedBuilder.from(oldEmbed)
                            .setTitle(`🚫 تم إلغاء الغارة: ${theme.name}`)
                            .setColor(Colors.Red);
                        
                        if (reason === 'user_cancel') {
                             const hostIsKing = await isUserAbyssKing(host.id);
                             const penaltyMs = hostIsKing ? 0 : 3 * 60 * 1000; 
                             
                             if (!hostIsKing) {
                                 const fullCooldown = 1 * 60 * 60 * 1000; 
                                 const newLastDungeon = Date.now() - (fullCooldown - penaltyMs);
                                 await db.query(`UPDATE levels SET "last_dungeon" = $1 WHERE "user" = $2 AND "guild" = $3`, [newLastDungeon, host.id, guildId]);
                                 const readyTimestamp = Math.floor((Date.now() + penaltyMs) / 1000);
                                 cancelledEmbed.setDescription(`**قمـت بـ الغـاء الغـارة الاخيـرة .. انتـظر <t:${readyTimestamp}:R> لتفتح غـارة جديدة**`);
                             } else {
                                 cancelledEmbed.setDescription(`**👑 بصفتك ملك الهاوية، يمكنك فتح غارة جديدة متى شئت**`);
                             }
                             cancelledEmbed.setFooter({ text: "قام القائد بإلغاء الغارة" });
                        } else {
                             cancelledEmbed.setFooter({ text: "انتهى وقت الانتظار" });
                        }
                        
                        await msg.edit({ content: '', embeds: [cancelledEmbed], components: [] });
                    } else {
                        await msg.edit({ content: "❌ تم الإلغاء.", components: [] });
                    }
                } catch (err) {
                    console.log("Error updating cancelled embed:", err);
                }
            }
        }
    });
}

// 🔥🔥 دالة استعادة الدانجون بعد الريستارت 🔥🔥
async function resumeActiveDungeons(client, db) {
    try {
        let res;
        try { res = await db.query(`SELECT * FROM active_dungeons`); }
        catch (e) { res = { rows: [] }; }
        
        if (res.rows.length === 0) return;

        console.log(`[Dungeon] Found ${res.rows.length} active dungeons to resume...`);

        for (const row of res.rows) {
            const channelID = row.channelID || row.channelid;
            const guildID = row.guildID || row.guildid;
            const hostID = row.hostID || row.hostid;
            let dataStr = row.data;

            let resumeData;
            try {
                resumeData = typeof dataStr === 'string' ? JSON.parse(dataStr) : dataStr;
            } catch (e) {
                console.error("Failed to parse resumeData for channel", channelID);
                await db.query(`DELETE FROM active_dungeons WHERE "channelID" = $1`, [channelID]).catch(()=>{});
                continue;
            }

            const guild = client.guilds.cache.get(guildID);
            if (!guild) continue;

            let threadChannel = guild.channels.cache.get(channelID);
            if (!threadChannel) {
                try {
                    threadChannel = await guild.channels.fetch(channelID);
                } catch (e) {
                    console.log("Thread not found, deleting active dungeon state for", channelID);
                    await db.query(`DELETE FROM active_dungeons WHERE "channelID" = $1`, [channelID]).catch(()=>{});
                    continue;
                }
            }

            if (!threadChannel) continue;

            const mainChannel = threadChannel.parent;

            const themeName = resumeData.themeName;
            const themeKey = Object.keys(dungeonConfig.themes).find(key => dungeonConfig.themes[key].name === themeName) || Object.keys(dungeonConfig.themes)[0];
            const theme = { ...dungeonConfig.themes[themeKey], key: themeKey };

            const partyIDs = resumeData.players.map(p => p.id);
            const partyClasses = new Map();
            resumeData.players.forEach(p => partyClasses.set(p.id, p.class));

            activeDungeonRequests.set(hostID, { status: 'battle', startFloor: resumeData.floor });

            runDungeon(threadChannel, mainChannel, partyIDs, theme, db, hostID, partyClasses, activeDungeonRequests, resumeData.floor, resumeData).catch(e => console.error("Error resuming dungeon:", e));
        }
    } catch (e) {
        console.error("Error resuming active dungeons:", e);
    }
}

module.exports = { startDungeon, resumeActiveDungeons };
