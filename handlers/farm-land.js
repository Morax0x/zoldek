const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder, Colors } = require("discord.js");
const Canvas = require('canvas');
const seedsData = require('../json/seeds.json');
const { getLandPlots } = require('../utils/farmUtils.js');

let updateGuildStat, addXPAndCheckLevel;
try {
    ({ updateGuildStat } = require('./guild-board-handler.js'));
    ({ addXPAndCheckLevel } = require('./handler-utils.js')); 
} catch (e) {
    try { 
        ({ updateGuildStat } = require('../handlers/guild-board-handler.js'));
        ({ addXPAndCheckLevel } = require('../handlers/handler-utils.js'));
    } catch (e2) {}
}

const EMOJI_MORA = '<:mora:1435647151349698621>';
const PLOW_COST_BULK = 10; 

const TILE_SIZE = 64;   
const GRID_COLS = 6;    
const GRID_ROWS = 6;    
const MAX_GAME_PLOTS = 36; 

const R2_URL = 'https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev';
const ASSETS_URL = `${R2_URL}/images/farm`;

// 🚀 أقوى نظام كاش بالرام (يحفظ مسار التحميل نفسه عشان يمنع التكرار نهائياً)
const RAM_IMAGE_CACHE = new Map();

async function getFarmAsset(name) {
    if (RAM_IMAGE_CACHE.has(name)) return await RAM_IMAGE_CACHE.get(name);
    
    const url = `${ASSETS_URL}/${name}.png`;
    const promise = Canvas.loadImage(url).catch((e) => {
        console.error(`Failed to load image: ${url}`);
        return null;
    });
    
    RAM_IMAGE_CACHE.set(name, promise);
    return await promise;
}

const farmLocks = new Map();

async function getGrowthMultiplier(db, userId, guildId) {
    try {
        let repRes;
        try { repRes = await db.query(`SELECT "rep_points" FROM user_reputation WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId]); }
        catch(e) { repRes = await db.query(`SELECT rep_points FROM user_reputation WHERE userid = $1 AND guildid = $2`, [userId, guildId]).catch(()=>({rows:[]})); }
        
        const points = repRes.rows[0]?.rep_points || 0;
        
        if (points >= 1000) return 0.80; 
        if (points >= 500)  return 0.85; 
        if (points >= 250)  return 0.90; 
        if (points >= 100)  return 0.95; 
        if (points >= 50)   return 0.97; 
        return 1.0; 
    } catch(e) { return 1.0; }
}

async function ensureLandTable(db) {
    await db.query(`
        CREATE TABLE IF NOT EXISTS user_lands (
            "userID" TEXT,
            "guildID" TEXT,
            "plotID" BIGINT,
            "status" TEXT, 
            "seedID" TEXT,
            "plantTime" BIGINT,
            PRIMARY KEY ("userID", "guildID", "plotID")
        )
    `).catch(() => {});
}

async function renderLand(interaction, client, db) {
    await ensureLandTable(db);
    
    const user = interaction.user || interaction.author; 
    const userId = user.id;
    const guildId = interaction.guild.id;
    const now = Date.now();

    // 🚀 جلب البيانات والصور الأساسية كلها بضربة وحدة (Parallel Execution)
    const [
        growthMultiplier, unlockedPlotsRaw, userPlotsRes, workerBuffRes,
        grassImg, tilledImg, lockImg, witheredImg, sproutImg,
        bTop, bBot, bLeft, bRight, cTL, cTR, cBL, cBR
    ] = await Promise.all([
        getGrowthMultiplier(db, userId, guildId),
        getLandPlots(client, userId, guildId),
        db.query(`SELECT * FROM user_lands WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId]).catch(() => db.query(`SELECT * FROM user_lands WHERE userid = $1 AND guildid = $2`, [userId, guildId]).catch(()=>({rows:[]}))),
        db.query(`SELECT "expiresAt" FROM user_buffs WHERE "userID" = $1 AND "guildID" = $2 AND "buffType" = 'farm_worker' AND "expiresAt" > $3`, [userId, guildId, now]).catch(() => db.query(`SELECT expiresat FROM user_buffs WHERE userid = $1 AND guildid = $2 AND bufftype = 'farm_worker' AND expiresat > $3`, [userId, guildId, now]).catch(()=>({rows:[]}))),
        getFarmAsset('grass'), getFarmAsset('tilled'), getFarmAsset('lock'), getFarmAsset('withered'), getFarmAsset('sprout'),
        getFarmAsset('border_top'), getFarmAsset('border_bottom'), getFarmAsset('border_left'), getFarmAsset('border_right'),
        getFarmAsset('corner_top_left'), getFarmAsset('corner_top_right'), getFarmAsset('corner_bottom_left'), getFarmAsset('corner_bottom_right')
    ]);

    const images = {
        grass: grassImg, tilled: tilledImg, lock: lockImg, withered: witheredImg, sprout: sproutImg,
        borderTop: bTop, borderBottom: bBot, borderLeft: bLeft, borderRight: bRight,
        cornerTL: cTL, cornerTR: cTR, cornerBL: cBL, cornerBR: cBR
    };

    const unlockedPlots = unlockedPlotsRaw >= 30 ? 36 : unlockedPlotsRaw;
    const userPlots = userPlotsRes.rows;

    let canPlow = false, hasTilled = false, readyCount = 0, witheredCount = 0, minRemainingTime = Infinity, totalPlowCost = 0;
    const neededCrops = new Set(); // لاستخراج الصور المطلوبة بدون تكرار

    for (let i = 1; i <= unlockedPlots; i++) {
        const p = userPlots.find(x => Number(x.plotID || x.plotid) === i);
        
        if (!p || p.status === 'empty') {
            totalPlowCost += PLOW_COST_BULK;
            canPlow = true;
        } else if (p.status === 'tilled') {
            hasTilled = true;
        } else if (p.status === 'planted' && (p.seedID || p.seedid)) {
            const sID = p.seedID || p.seedid;
            const seed = seedsData.find(s => s.id === sID);
            if (seed) {
                const growthMs = (seed.growth_time_hours * 3600000) * growthMultiplier;
                const age = now - Number(p.plantTime || p.planttime);
                const remaining = growthMs - age;

                if (remaining > 0 && remaining < minRemainingTime) minRemainingTime = remaining;
                
                // التحقق مما إذا كان المحصول جاهزاً لنطلب صورته
                if (age >= growthMs && age < (growthMs + (seed.wither_time_hours * 3600000))) {
                    neededCrops.add(seed.id);
                }
            }
        }
    }

    // 🚀 تحميل صور المحاصيل المطلوبة فقط دفعة واحدة (إذا لم تكن محملة أصلاً)
    await Promise.all(Array.from(neededCrops).map(id => getFarmAsset(id)));

    const totalWidth = (GRID_COLS * TILE_SIZE) + (TILE_SIZE * 2);
    const totalHeight = (GRID_ROWS * TILE_SIZE) + (TILE_SIZE * 2);

    const canvas = Canvas.createCanvas(totalWidth, totalHeight);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false; 

    ctx.fillStyle = '#e2c286'; 
    ctx.fillRect(0, 0, totalWidth, totalHeight);

    if (images.cornerTL) ctx.drawImage(images.cornerTL, 0, 0, TILE_SIZE, TILE_SIZE);
    if (images.cornerTR) ctx.drawImage(images.cornerTR, totalWidth - TILE_SIZE, 0, TILE_SIZE, TILE_SIZE);
    if (images.cornerBL) ctx.drawImage(images.cornerBL, 0, totalHeight - TILE_SIZE, TILE_SIZE, TILE_SIZE);
    if (images.cornerBR) ctx.drawImage(images.cornerBR, totalWidth - TILE_SIZE, totalHeight - TILE_SIZE, TILE_SIZE, TILE_SIZE);

    for (let c = 0; c < GRID_COLS; c++) {
        const x = (c + 1) * TILE_SIZE;
        if (images.borderTop) ctx.drawImage(images.borderTop, x, 0, TILE_SIZE, TILE_SIZE);
        if (images.borderBottom) ctx.drawImage(images.borderBottom, x, totalHeight - TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }

    for (let r = 0; r < GRID_ROWS; r++) {
        const y = (r + 1) * TILE_SIZE;
        if (images.borderLeft) ctx.drawImage(images.borderLeft, 0, y, TILE_SIZE, TILE_SIZE);
        if (images.borderRight) ctx.drawImage(images.borderRight, totalWidth - TILE_SIZE, y, TILE_SIZE, TILE_SIZE);
    }

    const startX = TILE_SIZE;
    const startY = TILE_SIZE;

    for (let i = 1; i <= MAX_GAME_PLOTS; i++) {
        const index = i - 1;
        const col = index % GRID_COLS;
        const row = Math.floor(index / GRID_COLS);
        
        const x = startX + (col * TILE_SIZE);
        const y = startY + (row * TILE_SIZE);

        if (images.grass) ctx.drawImage(images.grass, x, y, TILE_SIZE, TILE_SIZE);

        if (i > unlockedPlots) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
            if (images.lock) ctx.drawImage(images.lock, x, y, TILE_SIZE, TILE_SIZE);
        } else {
            const plotData = userPlots.find(p => Number(p.plotID || p.plotid) === i);
            
            if (plotData && plotData.status === 'tilled') {
                if (images.tilled) ctx.drawImage(images.tilled, x, y, TILE_SIZE, TILE_SIZE);
            } 
            else if (plotData && plotData.status === 'planted') {
                if (images.tilled) ctx.drawImage(images.tilled, x, y, TILE_SIZE, TILE_SIZE);

                const sID = plotData.seedID || plotData.seedid;
                const seed = seedsData.find(s => s.id === sID);
                if (seed) {
                    const growthMs = (seed.growth_time_hours * 3600000) * growthMultiplier;
                    const witherMs = seed.wither_time_hours * 3600000;
                    const age = now - Number(plotData.plantTime || plotData.planttime);

                    if (age >= (growthMs + witherMs)) {
                        if (images.withered) ctx.drawImage(images.withered, x, y, TILE_SIZE, TILE_SIZE);
                        witheredCount++;
                    } else if (age >= growthMs) {
                        const cropImg = await getFarmAsset(seed.id); // 🚀 يستدعيها من الرام بصفر ثانية
                        if (cropImg) ctx.drawImage(cropImg, x, y, TILE_SIZE, TILE_SIZE);
                        readyCount++;
                    } else {
                        if (images.sprout) ctx.drawImage(images.sprout, x, y, TILE_SIZE, TILE_SIZE);
                    }
                }
            }
        }
    }

    const attachment = new AttachmentBuilder(canvas.toBuffer(), { name: 'farm-view.png' });

    const actionRows = [];
    let currentRow = new ActionRowBuilder();

    const addButton = (btn) => {
        if (currentRow.components.length >= 5) {
            actionRows.push(currentRow);
            currentRow = new ActionRowBuilder();
        }
        currentRow.addComponents(btn);
    };

    if (canPlow) {
        addButton(new ButtonBuilder().setCustomId(`land_plow_one_${userId}`).setLabel(`حـراثـة`).setStyle(ButtonStyle.Secondary).setEmoji('⛏️'));
        addButton(new ButtonBuilder().setCustomId(`land_plow_all_${userId}`).setLabel(`حـراثـة الكـل (${totalPlowCost})`).setStyle(ButtonStyle.Primary).setEmoji('🚜'));
    }

    if (hasTilled) {
        addButton(new ButtonBuilder().setCustomId(`land_start_plant_${userId}`).setLabel(`زراعـة`).setStyle(ButtonStyle.Success).setEmoji('🌱'));
    }

    if (readyCount > 0) {
        addButton(new ButtonBuilder().setCustomId(`land_harvest_all_${userId}`).setLabel('حصـاد').setStyle(ButtonStyle.Success).setEmoji('🌾'));
    }
    
    if (witheredCount > 0) {
        addButton(new ButtonBuilder().setCustomId(`land_clean_all_${userId}`).setLabel('تنظيـف').setStyle(ButtonStyle.Danger).setEmoji('🚿'));
    }

    if (minRemainingTime !== Infinity) {
        const hours = Math.floor(minRemainingTime / (1000 * 60 * 60));
        const minutes = Math.floor((minRemainingTime % (1000 * 60 * 60)) / (1000 * 60));
        const timeString = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
        
        let label = `⏳ النـمو: ${timeString}`;
        if (growthMultiplier < 1.0) {
            const bonusPercent = Math.round((1.0 - growthMultiplier) * 100);
            label += ` | ⚡ +${bonusPercent}% سرعة`;
        }

        addButton(new ButtonBuilder().setCustomId('info_growth_time').setLabel(label).setStyle(ButtonStyle.Secondary).setDisabled(true));
    } else if (growthMultiplier < 1.0) {
        const bonusPercent = Math.round((1.0 - growthMultiplier) * 100);
        addButton(new ButtonBuilder().setCustomId('info_growth_bonus').setLabel(`⚡ بركة النمو: +${bonusPercent}% سرعة`).setStyle(ButtonStyle.Secondary).setDisabled(true));
    }

    const workerBuff = workerBuffRes.rows[0];
    if (workerBuff) {
        const timeLeft = Number(workerBuff.expiresAt || workerBuff.expiresat) - now;
        const daysLeft = Math.floor(timeLeft / (24 * 60 * 60 * 1000));
        const hoursLeft = Math.floor((timeLeft % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
        const timeString = `${daysLeft} يـ ${hoursLeft} سـ`;
        addButton(new ButtonBuilder().setCustomId('info_worker_status').setLabel(`👨‍🌾 العامل: ${timeString}`).setStyle(ButtonStyle.Secondary).setDisabled(true));
    }

    if (currentRow.components.length > 0) {
        actionRows.push(currentRow);
    }

    return { 
        content: `**🌱 مزرعة ${interaction.member.displayName}**`, 
        components: actionRows, 
        files: [attachment]
    };
}

async function handleLandInteractions(i, client, db) {
    await ensureLandTable(db); 
    
    if (!i.customId.startsWith('land_') && !i.customId.startsWith('farm_plant_modal_')) return;

    if (!i.deferred && !i.replied && !i.customId.startsWith('farm_plant_modal_') && !i.customId.startsWith('land_start_plant_') && !i.customId.startsWith('land_plant_select_seed_')) {
        await i.deferUpdate().catch(()=>{});
    }

    const parts = i.customId.split('_');
    const ownerId = parts[parts.length - 1]; 
    const baseAction = parts.slice(0, parts.length - 1).join('_'); 

    if (i.user.id !== ownerId) {
        return await i.followUp({ 
            content: `🚫 **هذه المزرعة ليست لك!**\nاستخدم أمر \`/مزرعتي\` لعرض مزرعتك الخاصة.`, 
            flags: [MessageFlags.Ephemeral] 
        }).catch(()=>{});
    }

    const userId = i.user.id;
    const guildId = i.guild.id;

    if (farmLocks.has(userId) && baseAction !== 'land_start_plant') {
        return await i.followUp({ content: "⏳ يرجى الانتظار، هنالك عملية قيد التنفيذ في مزرعتك.", flags: [MessageFlags.Ephemeral] }).catch(()=>{});
    }
    
    if (baseAction !== 'land_start_plant') {
        farmLocks.set(userId, true);
    }

    const updateView = async () => {
        const data = await renderLand(i, client, db);
        
        const currentComponents = i.message.components;
        let navRow = null;
        if (currentComponents && currentComponents.length > 0) {
            navRow = currentComponents[currentComponents.length - 1]; 
        }

        const finalComponents = data.components ? [...data.components] : [];
        if (navRow) finalComponents.push(navRow);

        await i.editReply({ 
            content: data.content, 
            components: finalComponents, 
            files: data.files,
            embeds: [] 
        }).catch(()=>{});
    };

    try {
        if (baseAction === 'land_plow_one') {
            let maxPlots = await getLandPlots(client, userId, guildId);
            if (maxPlots >= 30) maxPlots = 36;
            
            let targetPlot = null;
            let userPlotsRes;
            try { userPlotsRes = await db.query(`SELECT * FROM user_lands WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId]); }
            catch(e) { userPlotsRes = await db.query(`SELECT * FROM user_lands WHERE userid = $1 AND guildid = $2`, [userId, guildId]).catch(()=>({rows:[]})); }
            
            const userPlots = userPlotsRes.rows;
            const recordedIds = userPlots.map(p => Number(p.plotID || p.plotid));

            for (let pid = 1; pid <= maxPlots; pid++) {
                if (!recordedIds.includes(pid)) { targetPlot = pid; break; } 
                else {
                    const plot = userPlots.find(p => Number(p.plotID || p.plotid) === pid);
                    if (plot.status === 'empty') { targetPlot = pid; break; }
                }
            }

            if (!targetPlot) return await i.followUp({ content: "🚫 **لا توجد أرض فارغة!**", flags: [MessageFlags.Ephemeral] }).catch(()=>{});

            try {
                await db.query(`
                    INSERT INTO user_lands ("userID", "guildID", "plotID", "status") 
                    VALUES ($1, $2, $3, 'tilled')
                    ON CONFLICT ("userID", "guildID", "plotID") DO UPDATE SET "status" = 'tilled'
                `, [userId, guildId, targetPlot]);
            } catch(e) {
                await db.query(`
                    INSERT INTO user_lands (userid, guildid, plotid, status) 
                    VALUES ($1, $2, $3, 'tilled')
                    ON CONFLICT (userid, guildid, plotid) DO UPDATE SET status = 'tilled'
                `, [userId, guildId, targetPlot]).catch(()=>{});
            }

            await updateView();
            return;
        }

        if (baseAction === 'land_plow_all') {
            let maxPlots = await getLandPlots(client, userId, guildId);
            if (maxPlots >= 30) maxPlots = 36;

            let existingPlotsRes;
            try { existingPlotsRes = await db.query(`SELECT "plotID", "status" FROM user_lands WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId]); }
            catch(e) { existingPlotsRes = await db.query(`SELECT plotid, status FROM user_lands WHERE userid = $1 AND guildid = $2`, [userId, guildId]).catch(()=>({rows:[]})); }
            
            const existingPlots = existingPlotsRes.rows;
            const existingIds = existingPlots.map(p => Number(p.plotID || p.plotid));
            let plotsToPlow = [];

            for (let pid = 1; pid <= maxPlots; pid++) {
                if (!existingIds.includes(pid)) plotsToPlow.push(pid);
                else {
                    const plot = existingPlots.find(p => Number(p.plotID || p.plotid) === pid);
                    if (plot && plot.status === 'empty') plotsToPlow.push(pid);
                }
            }

            if (plotsToPlow.length === 0) return await i.followUp({ content: "🚫 **لا توجد أراضي بور!**", flags: [MessageFlags.Ephemeral] }).catch(()=>{});

            const totalCost = plotsToPlow.length * PLOW_COST_BULK;
            
            let userData = await client.getLevel(userId, guildId);
            if (!userData) userData = { ...client.defaultData, user: userId, guild: guildId };

            if (Number(userData.mora || 0) < totalCost) return await i.followUp({ content: `❌ **رصيدك غير كافي!** تحتاج **${totalCost}** ${EMOJI_MORA}`, flags: [MessageFlags.Ephemeral] }).catch(()=>{});
            
            try {
                await db.query(`UPDATE levels SET "mora" = CAST(COALESCE("mora", '0') AS BIGINT) - $1 WHERE "user" = $2 AND "guild" = $3`, [totalCost, userId, guildId]);
                userData.mora = String(Number(userData.mora || 0) - totalCost);
                if (typeof client.setLevel === 'function') await client.setLevel(userData);
                
                await db.query("BEGIN");
                for (const pid of plotsToPlow) {
                    await db.query(`
                        INSERT INTO user_lands ("userID", "guildID", "plotID", "status") 
                        VALUES ($1, $2, $3, 'tilled')
                        ON CONFLICT ("userID", "guildID", "plotID") DO UPDATE SET "status" = 'tilled'
                    `, [userId, guildId, pid]);
                }
                await db.query("COMMIT");
            } catch (e) {
                await db.query("ROLLBACK").catch(()=>{});
                try {
                    await db.query(`UPDATE levels SET mora = CAST(COALESCE(mora, '0') AS BIGINT) - $1 WHERE userid = $2 AND guildid = $3`, [totalCost, userId, guildId]);
                    userData.mora = String(Number(userData.mora || 0) - totalCost);
                    if (typeof client.setLevel === 'function') await client.setLevel(userData);
                    
                    await db.query("BEGIN");
                    for (const pid of plotsToPlow) {
                        await db.query(`
                            INSERT INTO user_lands (userid, guildid, plotid, status) 
                            VALUES ($1, $2, $3, 'tilled')
                            ON CONFLICT (userid, guildid, plotid) DO UPDATE SET status = 'tilled'
                        `, [userId, guildId, pid]);
                    }
                    await db.query("COMMIT");
                } catch(err) {
                    await db.query("ROLLBACK").catch(()=>{});
                }
            }

            await updateView();
            return;
        }

        if (baseAction === 'land_start_plant') {
            const seedOptions = await Promise.all(seedsData.map(async s => {
                const count = await getSeedCount(db, userId, guildId, s.id);
                return new StringSelectMenuOptionBuilder()
                    .setLabel(s.name)
                    .setDescription(`لديك: ${count}`)
                    .setValue(s.id)
                    .setEmoji(s.emoji);
            }));

            const msgId = i.message.id;
            const row = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`land_plant_select_seed_${msgId}_${userId}`)
                    .setPlaceholder('اختر نوع البذور...')
                    .addOptions(seedOptions)
            );

            await i.reply({ content: '🌱 **اختر البذور:**', components: [row], flags: [MessageFlags.Ephemeral] }).catch(()=>{});
            return;
        }

        if (i.isStringSelectMenu() && i.customId.startsWith('land_plant_select_seed')) {
            const rawAction = i.customId; 
            const rawParts = rawAction.split('_');
            const msgId = rawParts[rawParts.length - 2]; 

            const seedId = i.values[0];
            const seed = seedsData.find(s => s.id === seedId);
            
            const modal = new ModalBuilder().setCustomId(`farm_plant_modal_${msgId}_${seedId}_${userId}`).setTitle(`زراعة ${seed.name}`);
            const input = new TextInputBuilder().setCustomId('plant_qty').setLabel('العدد').setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            await i.showModal(modal).catch(()=>{});
            return; 
        }

        if (i.isModalSubmit() && i.customId.startsWith('farm_plant_modal_')) {
            await i.deferReply({ flags: [MessageFlags.Ephemeral] }).catch(()=>{});
            
            const rawModalId = i.customId.replace('farm_plant_modal_', ''); 
            const firstUnderscore = rawModalId.indexOf('_');
            const msgId = rawModalId.substring(0, firstUnderscore);
            const rest = rawModalId.substring(firstUnderscore + 1);
            const lastUnderscore = rest.lastIndexOf('_');
            const seedId = rest.substring(0, lastUnderscore);
            
            const qtyInput = parseInt(i.fields.getTextInputValue('plant_qty'));
            const seed = seedsData.find(s => s.id === seedId);

            if (isNaN(qtyInput) || qtyInput <= 0) return await i.editReply("❌ رقم خطأ.").catch(()=>{});

            const [tilledPlotsRes, invItemRes] = await Promise.all([
                db.query(`SELECT "plotID" FROM user_lands WHERE "userID" = $1 AND "guildID" = $2 AND "status" = 'tilled'`, [userId, guildId]).catch(() => db.query(`SELECT plotid FROM user_lands WHERE userid = $1 AND guildid = $2 AND status = 'tilled'`, [userId, guildId]).catch(()=>({rows:[]}))),
                db.query(`SELECT "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [userId, guildId, seedId]).catch(() => db.query(`SELECT quantity FROM user_inventory WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [userId, guildId, seedId]).catch(()=>({rows:[]})))
            ]);
            
            const tilledPlots = tilledPlotsRes.rows;
            const invItem = invItemRes.rows[0];
            const seedStock = invItem ? Number(invItem.quantity || invItem.Quantity) : 0;

            const countToPlant = Math.min(qtyInput, tilledPlots.length, seedStock);

            if (countToPlant === 0) return await i.editReply("❌ لا يمكن الزراعة (نقص بذور أو أرض غير محروثة).").catch(()=>{});

            try {
                if (seedStock === countToPlant) {
                    await db.query(`DELETE FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [userId, guildId, seedId]);
                } else {
                    await db.query(`UPDATE user_inventory SET "quantity" = "quantity" - $1 WHERE "userID" = $2 AND "guildID" = $3 AND "itemID" = $4`, [countToPlant, userId, guildId, seedId]);
                }
            } catch(e) {
                if (seedStock === countToPlant) {
                    await db.query(`DELETE FROM user_inventory WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [userId, guildId, seedId]).catch(()=>{});
                } else {
                    await db.query(`UPDATE user_inventory SET quantity = quantity - $1 WHERE userid = $2 AND guildid = $3 AND itemid = $4`, [countToPlant, userId, guildId, seedId]).catch(()=>{});
                }
            }

            const now = Date.now();
            
            try {
                await db.query("BEGIN");
                for (let k = 0; k < countToPlant; k++) {
                    await db.query(`UPDATE user_lands SET "status" = 'planted', "seedID" = $1, "plantTime" = $2 WHERE "userID" = $3 AND "guildID" = $4 AND "plotID" = $5`, [seed.id, now, userId, guildId, tilledPlots[k].plotID || tilledPlots[k].plotid]);
                }
                await db.query("COMMIT");
            } catch (e) {
                await db.query("ROLLBACK");
                try {
                    await db.query("BEGIN");
                    for (let k = 0; k < countToPlant; k++) {
                        await db.query(`UPDATE user_lands SET status = 'planted', seedid = $1, planttime = $2 WHERE userid = $3 AND guildid = $4 AND plotid = $5`, [seed.id, now, userId, guildId, tilledPlots[k].plotID || tilledPlots[k].plotid]);
                    }
                    await db.query("COMMIT");
                } catch(err) { await db.query("ROLLBACK").catch(()=>{}); }
            }

            await i.editReply(`✅ **تم زراعة ${countToPlant}x ${seed.name}**`).catch(()=>{});

            try {
                const mainMsg = await i.channel.messages.fetch(msgId).catch(() => null);
                if (mainMsg) {
                    const newData = await renderLand(i, client, db);
                    
                    const currentComponents = mainMsg.components;
                    let navRow = null;
                    if (currentComponents && currentComponents.length > 0) {
                        navRow = currentComponents[currentComponents.length - 1]; 
                    }

                    const finalComponents = newData.components ? [...newData.components] : [];
                    if (navRow) finalComponents.push(navRow);

                    await mainMsg.edit({
                        content: newData.content,
                        embeds: [], 
                        components: finalComponents,
                        files: newData.files
                    }).catch(()=>{});
                }
            } catch (err) {}
            
            return;
        }

        if (baseAction === 'land_harvest_all') {
            const [growthMultiplier, plantedPlotsRes] = await Promise.all([
                getGrowthMultiplier(db, userId, guildId),
                db.query(`SELECT * FROM user_lands WHERE "userID" = $1 AND "guildID" = $2 AND "status" = 'planted'`, [userId, guildId]).catch(() => db.query(`SELECT * FROM user_lands WHERE userid = $1 AND guildid = $2 AND status = 'planted'`, [userId, guildId]).catch(()=>({rows:[]})))
            ]);
            
            const plantedPlots = plantedPlotsRes.rows;
            const now = Date.now();
            let totalRevenue = 0, totalXP = 0, harvestedCount = 0;
            const plotsToReset = [];

            for (const plot of plantedPlots) {
                const sID = plot.seedID || plot.seedid;
                const seed = seedsData.find(s => s.id === sID);
                if (!seed) continue;
                
                const growthMs = (seed.growth_time_hours * 3600000) * growthMultiplier;
                const witherMs = seed.wither_time_hours * 3600000;
                const age = now - Number(plot.plantTime || plot.planttime);

                if (age >= growthMs && age < (growthMs + witherMs)) {
                    totalRevenue += seed.sell_price;
                    totalXP += seed.xp_reward;
                    harvestedCount++;
                    plotsToReset.push(plot.plotID || plot.plotid);
                }
            }

            if (harvestedCount === 0) return await i.followUp({ content: "🚫 لا يوجد حصاد جاهز.", flags: [MessageFlags.Ephemeral] }).catch(()=>{});

            try {
                await db.query("BEGIN");
                for (const pid of plotsToReset) {
                    await db.query(`UPDATE user_lands SET "status" = 'empty', "seedID" = NULL, "plantTime" = NULL WHERE "userID" = $1 AND "guildID" = $2 AND "plotID" = $3`, [userId, guildId, pid]);
                }
                await db.query("COMMIT");
            } catch (e) {
                await db.query("ROLLBACK");
                try {
                    await db.query("BEGIN");
                    for (const pid of plotsToReset) {
                        await db.query(`UPDATE user_lands SET status = 'empty', seedid = NULL, planttime = NULL WHERE userid = $1 AND guildid = $2 AND plotid = $3`, [userId, guildId, pid]);
                    }
                    await db.query("COMMIT");
                } catch(err) { await db.query("ROLLBACK").catch(()=>{}); }
            }

            if (addXPAndCheckLevel && totalXP > 0) {
                 await addXPAndCheckLevel(client, i.member, db, totalXP, totalRevenue, false).catch(()=>{});
            } else {
                 try { await db.query(`UPDATE levels SET "mora" = CAST(COALESCE("mora", '0') AS BIGINT) + $1, "xp" = CAST(COALESCE("xp", '0') AS BIGINT) + $2, "totalXP" = CAST(COALESCE("totalXP", '0') AS BIGINT) + $2 WHERE "user" = $3 AND "guild" = $4`, [totalRevenue, totalXP, userId, guildId]); }
                 catch(e) { await db.query(`UPDATE levels SET mora = CAST(COALESCE(mora, '0') AS BIGINT) + $1, xp = CAST(COALESCE(xp, '0') AS BIGINT) + $2, totalxp = CAST(COALESCE(totalxp, '0') AS BIGINT) + $2 WHERE userid = $3 AND guildid = $4`, [totalRevenue, totalXP, userId, guildId]).catch(()=>{}); }
            }

            if (updateGuildStat) {
                updateGuildStat(client, guildId, userId, 'crops_harvested', totalRevenue).catch(()=>{});
            }

            await i.followUp({ content: `🌾 **تم حصاد ${harvestedCount} محاصيل!**\n💰 الأرباح: **+${totalRevenue.toLocaleString()}** مورا\n✨ الخبرة: **+${totalXP}** XP` }).catch(()=>{});
            await updateView();
            return;
        }

        if (baseAction === 'land_clean_all') {
            const [growthMultiplier, plantedPlotsRes] = await Promise.all([
                getGrowthMultiplier(db, userId, guildId),
                db.query(`SELECT * FROM user_lands WHERE "userID" = $1 AND "guildID" = $2 AND "status" = 'planted'`, [userId, guildId]).catch(() => db.query(`SELECT * FROM user_lands WHERE userid = $1 AND guildid = $2 AND status = 'planted'`, [userId, guildId]).catch(()=>({rows:[]})))
            ]);
            
            const plantedPlots = plantedPlotsRes.rows;
            const now = Date.now();
            const plotsToReset = [];

            for (const plot of plantedPlots) {
                const sID = plot.seedID || plot.seedid;
                const seed = seedsData.find(s => s.id === sID);
                if (!seed) { plotsToReset.push(plot.plotID || plot.plotid); continue; }
                
                const growthMs = (seed.growth_time_hours * 3600000) * growthMultiplier;
                const witherMs = seed.wither_time_hours * 3600000;
                const age = now - Number(plot.plantTime || plot.planttime);
                if (age >= (growthMs + witherMs)) plotsToReset.push(plot.plotID || plot.plotid);
            }

            try {
                await db.query("BEGIN");
                for (const pid of plotsToReset) {
                    await db.query(`UPDATE user_lands SET "status" = 'empty', "seedID" = NULL, "plantTime" = NULL WHERE "userID" = $1 AND "guildID" = $2 AND "plotID" = $3`, [userId, guildId, pid]);
                }
                await db.query("COMMIT");
            } catch (e) {
                await db.query("ROLLBACK");
                try {
                    await db.query("BEGIN");
                    for (const pid of plotsToReset) {
                        await db.query(`UPDATE user_lands SET status = 'empty', seedid = NULL, planttime = NULL WHERE userid = $1 AND guildid = $2 AND plotid = $3`, [userId, guildId, pid]);
                    }
                    await db.query("COMMIT");
                } catch(err) { await db.query("ROLLBACK").catch(()=>{}); }
            }

            await i.followUp({ content: `🚿 **تم تنظيف ${plotsToReset.length} أراضي ذابلة.**`, flags: [MessageFlags.Ephemeral] }).catch(()=>{});
            await updateView();
            return;
        }
    } finally {
        if (baseAction !== 'land_start_plant') {
            farmLocks.delete(userId);
        }
    }
}

async function getSeedCount(db, userId, guildId, seedId) {
    try {
        let invItemRes;
        try { invItemRes = await db.query(`SELECT "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [userId, guildId, seedId]); }
        catch(e) { invItemRes = await db.query(`SELECT quantity FROM user_inventory WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [userId, guildId, seedId]).catch(()=>({rows:[]})); }
        
        const invItem = invItemRes.rows[0];
        return invItem ? Number(invItem.quantity || invItem.Quantity) : 0;
    } catch(e) {
        return 0;
    }
}

module.exports = { renderLand, handleLandInteractions };
