const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, Colors, MessageFlags } = require('discord.js');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');
const fs = require('fs');

// تسجيل الخطوط
try {
    const fontsDir = path.join(process.cwd(), 'fonts');
    const beinPath = path.join(fontsDir, 'bein-ar-normal.ttf');
    const emojiPath = path.join(fontsDir, 'NotoEmoj.ttf');
    if (fs.existsSync(beinPath)) GlobalFonts.registerFromPath(beinPath, 'Bein');
    if (fs.existsSync(emojiPath)) GlobalFonts.registerFromPath(emojiPath, 'Emoji');
} catch (e) {}

const FONT_MAIN = '"Bein", "Arial", sans-serif';
const FONT_EMOJI = '"Emoji", "Arial", sans-serif';

const upgradeMats = require('../../json/upgrade-materials.json'); 
const R2_URL = 'https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev';

const ID_TO_IMAGE = {
    'mat_dragon_1': 'dragon_ash.png', 'mat_dragon_2': 'dragon_scale.png', 'mat_dragon_3': 'dragon_claw.png', 'mat_dragon_4': 'dragon_heart.png', 'mat_dragon_5': 'dragon_core.png',
    'mat_human_1': 'human_iron.png', 'mat_human_2': 'human_steel.png', 'mat_human_3': 'human_meteor.png', 'mat_human_4': 'human_seal.png', 'mat_human_5': 'human_crown.png',
    'mat_elf_1': 'elf_branch.png', 'mat_elf_2': 'elf_bark.png', 'mat_elf_3': 'elf_flower.png', 'mat_elf_4': 'elf_crystal.png', 'mat_elf_5': 'elf_tear.png',
    'mat_darkelf_1': 'darkelf_obsidian.png', 'mat_darkelf_2': 'darkelf_glass.png', 'mat_darkelf_3': 'darkelf_crystal.png', 'mat_darkelf_4': 'darkelf_void.png', 'mat_darkelf_5': 'darkelf_ash.png',
    'mat_seraphim_1': 'seraphim_feathe.png', 'mat_seraphim_2': 'seraphim_halo.png', 'mat_seraphim_3': 'seraphim_crystal.png', 'mat_seraphim_4': 'seraphim_core.png', 'mat_seraphim_5': 'seraphim_chalice.png',
    'mat_demon_1': 'demon_ember.png', 'mat_demon_2': 'demon_horn.png', 'mat_demon_3': 'demon_crystal.png', 'mat_demon_4': 'demon_flame.png', 'mat_demon_5': 'demon_crown.png',
    'mat_vampire_1': 'vampire_blood.png', 'mat_vampire_2': 'vampire_vial.png', 'mat_vampire_3': 'vampire_fang.png', 'mat_vampire_4': 'vampire_moon.png', 'mat_vampire_5': 'vampire_chalice.png',
    'mat_spirit_1': 'spirit_dust.png', 'mat_spirit_2': 'spirit_remnant.png', 'mat_spirit_3': 'spirit_crystal.png', 'mat_spirit_4': 'spirit_core.png', 'mat_spirit_5': 'spirit_pulse.png',
    'mat_hybrid_1': 'hybrid_claw.png', 'mat_hybrid_2': 'hybrid_fur.png', 'mat_hybrid_3': 'hybrid_bone.png', 'mat_hybrid_4': 'hybrid_crystal.png', 'mat_hybrid_5': 'hybrid_soul.png',
    'mat_dwarf_1': 'dwarf_copper.png', 'mat_dwarf_2': 'dwarf_bronze.png', 'mat_dwarf_3': 'dwarf_mithril.png', 'mat_dwarf_4': 'dwarf_heart.png', 'mat_dwarf_5': 'dwarf_hammer.png',
    'mat_ghoul_1': 'ghoul_bone.png', 'mat_ghoul_2': 'ghoul_remains.png', 'mat_ghoul_3': 'ghoul_skull.png', 'mat_ghoul_4': 'ghoul_crystal.png', 'mat_ghoul_5': 'ghoul_core.png',
    'book_general_1': 'gen_book_tactic.png', 'book_general_2': 'gen_book_combat.png', 'book_general_3': 'gen_book_arts.png', 'book_general_4': 'gen_book_war.png', 'book_general_5': 'gen_book_wisdom.png',
    'book_race_1': 'race_book_stone.png', 'book_race_2': 'race_book_ancestor.png', 'book_race_3': 'race_book_secrets.png', 'book_race_4': 'race_book_covenant.png', 'book_race_5': 'race_book_pact.png'
};

const RARITY_COLORS = { 'Common': '#A8B8D0', 'Uncommon': '#2ECC71', 'Rare': '#00C3FF', 'Epic': '#B968FF', 'Legendary': '#FFD700' };
const RARITY_ARABIC = { 'Common': 'عادي', 'Uncommon': 'شائع', 'Rare': 'نادر', 'Epic': 'ملحمي', 'Legendary': 'أسطوري' };
const RACE_TRANSLATIONS = { 'Human': 'بشري', 'Dragon': 'تنين', 'Elf': 'آلف', 'Dark Elf': 'آلف الظلام', 'Seraphim': 'سيرافيم', 'Demon': 'شيطان', 'Vampire': 'مصاص دماء', 'Spirit': 'روح', 'Dwarf': 'قزم', 'Ghoul': 'غول', 'Hybrid': 'نصف وحش' };

const RAM_IMAGE_CACHE = new Map();

async function getCachedImage(url) {
    if (!url) return null;
    if (RAM_IMAGE_CACHE.has(url)) return await RAM_IMAGE_CACHE.get(url);
    const promise = loadImage(url).catch(() => null);
    RAM_IMAGE_CACHE.set(url, promise);
    return await promise;
}

function getMaterialImageUrl(itemId, raceName, isBook = false, bookCat = 'general') {
    const imgName = ID_TO_IMAGE[itemId] || `${itemId}.png`;
    if (isBook) return `${R2_URL}/images/materials/${bookCat}/${imgName}`;
    const raceFolder = raceName.toLowerCase().replace(' ', '_');
    return `${R2_URL}/images/materials/${raceFolder}/${imgName}`;
}

function drawAutoScaledText(ctx, text, x, y, maxWidth, maxFontSize, minFontSize = 10) {
    let currentFontSize = maxFontSize;
    ctx.font = `bold ${currentFontSize}px ${FONT_MAIN}`;
    while (ctx.measureText(text).width > maxWidth && currentFontSize > minFontSize) {
        currentFontSize--;
        ctx.font = `bold ${currentFontSize}px ${FONT_MAIN}`;
    }
    ctx.fillText(text, x, y);
}

function drawOrnateFrame(ctx, x, y, w, h, color) {
    const bgGrad = ctx.createLinearGradient(x, y, x, y + h);
    bgGrad.addColorStop(0, 'rgba(15, 20, 30, 0.9)');
    bgGrad.addColorStop(1, 'rgba(5, 10, 15, 0.95)');
    ctx.fillStyle = bgGrad; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, w, h);
    const cl = 20; ctx.lineWidth = 4; ctx.shadowColor = color; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.moveTo(x, y + cl); ctx.lineTo(x, y); ctx.lineTo(x + cl, y);
    ctx.moveTo(x + w - cl, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + cl);
    ctx.moveTo(x + w, y + h - cl); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - cl, y + h);
    ctx.moveTo(x + cl, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - cl);
    ctx.stroke(); ctx.shadowBlur = 0;
}

// 🔥 دالة رسم البطاقة الفردية (عشان نستخدمها في كل مكان بدون تكرار) 🔥
function drawSingleCard(ctx, item, x, y, img, cardW, cardH) {
    const color = RARITY_COLORS[item.rarity] || '#FFFFFF';

    drawOrnateFrame(ctx, x, y, cardW, cardH, color);

    const aura = ctx.createRadialGradient(x + cardW/2, y + 130, 10, x + cardW/2, y + 130, 140);
    aura.addColorStop(0, `${color}40`); aura.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = aura; ctx.fillRect(x, y, cardW, cardH);

    const imgSize = 140; 
    if (img) {
        ctx.shadowColor = color; ctx.shadowBlur = 30;
        ctx.drawImage(img, x + (cardW - imgSize)/2, y + 30, imgSize, imgSize);
        ctx.shadowBlur = 0;
    } else {
        ctx.fillStyle = '#FFF'; ctx.font = `80px ${FONT_EMOJI}`;
        ctx.fillText(item.emoji || '📦', x + cardW/2, y + 105);
    }

    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x + 10, y + 210, cardW - 20, 50); 
    ctx.fillStyle = '#FFFFFF'; 
    const cleanName = item.name.replace(/[\u{1F600}-\u{1F6FF}]/gu, '').trim();
    drawAutoScaledText(ctx, cleanName, x + cardW/2, y + 235, cardW - 30, 24, 14);

    ctx.fillStyle = color; ctx.font = `bold 22px ${FONT_MAIN}`;
    ctx.fillText(`الندرة: ${RARITY_ARABIC[item.rarity]}`, x + cardW/2, y + 295);
}

// 🎨 رسم شاشة الترحيب (الموسوعة الرئيسية)
async function generateHubCanvas() {
    const width = 1200, height = 800; 
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const bgGrad = ctx.createRadialGradient(width/2, height/2, 100, width/2, height/2, 900);
    bgGrad.addColorStop(0, '#1a1025'); bgGrad.addColorStop(1, '#050508');
    ctx.fillStyle = bgGrad; ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#FFFFFF';
    for(let i=0; i<150; i++) {
        ctx.globalAlpha = Math.random() * 0.4 + 0.1;
        ctx.beginPath(); ctx.arc(Math.random() * width, Math.random() * height, Math.random() * 2, 0, Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha = 1.0;

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#B968FF'; ctx.font = `bold 65px ${FONT_MAIN}`; 
    ctx.shadowColor = '#B968FF'; ctx.shadowBlur = 20;
    ctx.fillText('🔮 موسوعة الارتيفاكت والموارد', width / 2, 120);
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#FFFFFF'; ctx.font = `32px ${FONT_MAIN}`;
    ctx.fillText('مرحباً بك في مكتبة الإمبراطورية. استخدم الأزرار بالأسفل للتنقل.', width / 2, 210);

    const boxW = 500, boxH = 380, gap = 80; 
    const startX = (width - (boxW * 2 + gap)) / 2;

    const box1Center = startX + boxW / 2;
    const box2Center = startX + boxW + gap + boxW / 2;
    const boxY = 300;

    // صندوق الأسلحة
    drawOrnateFrame(ctx, startX, boxY, boxW, boxH, '#FFD700');
    ctx.fillStyle = '#FFD700'; ctx.font = `bold 42px ${FONT_MAIN}`;
    ctx.fillText('⚔️ موارد الأسلحة', box1Center, boxY + 80);
    ctx.fillStyle = '#E0E0E0'; ctx.font = `26px ${FONT_MAIN}`;
    ctx.fillText('لكل عرق 5 موارد متدرجة الندرة', box1Center, boxY + 170);
    ctx.fillText('تستخدم في ورشة الحدادة لتطوير', box1Center, boxY + 230);
    ctx.fillText('سلاح العرق الخاص بك للحد الأقصى.', box1Center, boxY + 290);

    // صندوق المهارات
    drawOrnateFrame(ctx, startX + boxW + gap, boxY, boxW, boxH, '#00C3FF');
    ctx.fillStyle = '#00C3FF'; ctx.font = `bold 42px ${FONT_MAIN}`;
    ctx.fillText('📚 كتب المهارات', box2Center, boxY + 80);
    ctx.fillStyle = '#E0E0E0'; ctx.font = `26px ${FONT_MAIN}`;
    ctx.fillText('تنقسم إلى كتب عامة وكتب عرقية', box2Center, boxY + 170);
    ctx.fillText('تُستخدم في الأكاديمية السحرية', box2Center, boxY + 230);
    ctx.fillText('لصقل مهاراتك ورفع مستواها.', box2Center, boxY + 290);

    return canvas.toBuffer('image/png');
}

// 🎨 رسم بطاقة الموارد للأسلحة (5 عناصر)
async function generateItemsCanvas(title, items, isBook = false, bookCat = 'general', raceName = '') {
    const width = 1200, height = 1000; 
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const bgGrad = ctx.createRadialGradient(width/2, height/2, 100, width/2, height/2, 1000);
    bgGrad.addColorStop(0, '#101520'); bgGrad.addColorStop(1, '#05050a');
    ctx.fillStyle = bgGrad; ctx.fillRect(0, 0, width, height);

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FFD700'; ctx.font = `bold 60px ${FONT_MAIN}`;
    ctx.shadowColor = '#FFD700'; ctx.shadowBlur = 20;
    ctx.fillText(title, width / 2, 90);
    ctx.shadowBlur = 0;

    const images = await Promise.all(items.map(async item => {
        const url = getMaterialImageUrl(item.id, raceName, isBook, bookCat);
        return await getCachedImage(url);
    }));

    const cardW = 320; 
    const cardH = 340;
    const gapX = 60;   
    const gapY = 60;   

    const row1StartX = (width - (cardW * 3 + gapX * 2)) / 2;
    const row1Y = 190;

    const row2StartX = (width - (cardW * 2 + gapX)) / 2;
    const row2Y = row1Y + cardH + gapY;

    for (let i = 0; i < 5; i++) {
        const item = items[i];
        if (!item) continue;
        const x = i < 3 ? row1StartX + i * (cardW + gapX) : row2StartX + (i - 3) * (cardW + gapX);
        const y = i < 3 ? row1Y : row2Y;
        drawSingleCard(ctx, item, x, y, images[i], cardW, cardH);
    }

    return canvas.toBuffer('image/png');
}

// 🎨 رسم شاشة الكتب المدمجة (عامة + أعراق) - 🔥 تم تصحيح الطول 🔥
async function generateCombinedBooksCanvas(generalBooks, raceBooks) {
    const width = 1200, height = 2050; // 🔥 تم زيادة الطول بشكل مريح جداً لتفادي القص
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // تمديد الخلفية لتغطي الطول الجديد
    const bgGrad = ctx.createRadialGradient(width/2, height/2, 100, width/2, height/2, 2000);
    bgGrad.addColorStop(0, '#101520'); bgGrad.addColorStop(1, '#05050a');
    ctx.fillStyle = bgGrad; ctx.fillRect(0, 0, width, height);

    const cardW = 320; 
    const cardH = 340;
    const gapX = 60;   
    const gapY = 60;   
    const row1StartX = (width - (cardW * 3 + gapX * 2)) / 2;
    const row2StartX = (width - (cardW * 2 + gapX)) / 2;

    // --- القسم الأول: الكتب العامة ---
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#00C3FF'; ctx.font = `bold 60px ${FONT_MAIN}`;
    ctx.shadowColor = '#00C3FF'; ctx.shadowBlur = 20;
    ctx.fillText('📘 كتب المهارات العامة', width / 2, 90);
    ctx.shadowBlur = 0;

    const genImages = await Promise.all(generalBooks.map(async item => await getCachedImage(getMaterialImageUrl(item.id, '', true, 'general'))));
    const genRow1Y = 190;
    const genRow2Y = genRow1Y + cardH + gapY;

    for (let i = 0; i < 5; i++) {
        if (!generalBooks[i]) continue;
        const x = i < 3 ? row1StartX + i * (cardW + gapX) : row2StartX + (i - 3) * (cardW + gapX);
        const y = i < 3 ? genRow1Y : genRow2Y;
        drawSingleCard(ctx, generalBooks[i], x, y, genImages[i], cardW, cardH);
    }

    // --- فاصل فخم بين القسمين ---
    const lineY = genRow2Y + cardH + 70;
    const lineGrad = ctx.createLinearGradient(100, lineY, 1100, lineY);
    lineGrad.addColorStop(0, 'rgba(255,255,255,0)'); lineGrad.addColorStop(0.5, 'rgba(255,255,255,0.4)'); lineGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.strokeStyle = lineGrad; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(100, lineY); ctx.lineTo(1100, lineY); ctx.stroke();

    // --- القسم الثاني: كتب الأعراق ---
    ctx.fillStyle = '#FF5555'; ctx.font = `bold 60px ${FONT_MAIN}`;
    ctx.shadowColor = '#FF5555'; ctx.shadowBlur = 20;
    ctx.fillText('📕 كتب مهارات الأعراق', width / 2, lineY + 90);
    ctx.shadowBlur = 0;

    const raceImages = await Promise.all(raceBooks.map(async item => await getCachedImage(getMaterialImageUrl(item.id, '', true, 'race'))));
    const raceRow1Y = lineY + 190;
    const raceRow2Y = raceRow1Y + cardH + gapY;

    for (let i = 0; i < 5; i++) {
        if (!raceBooks[i]) continue;
        const x = i < 3 ? row1StartX + i * (cardW + gapX) : row2StartX + (i - 3) * (cardW + gapX);
        const y = i < 3 ? raceRow1Y : raceRow2Y;
        drawSingleCard(ctx, raceBooks[i], x, y, raceImages[i], cardW, cardH);
    }

    return canvas.toBuffer('image/png');
}

// 🔥 دالة مساعدة لجلب عرق اللاعب 🔥
async function getUserRace(db, user, guild) {
    try {
        let res = await db.query(`SELECT "raceName" FROM user_weapons WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guild.id]);
        if (res && res.rows && res.rows.length > 0) return res.rows[0].raceName;
        
        let res2 = await db.query(`SELECT racename FROM user_weapons WHERE userid = $1 AND guildid = $2`, [user.id, guild.id]);
        if (res2 && res2.rows && res2.rows.length > 0) return res2.rows[0].racename;
    } catch(e) {}
    
    try {
        const member = guild.members.cache.get(user.id) || await guild.members.fetch(user.id).catch(()=>null);
        if (member) {
            let raceRolesRes = await db.query(`SELECT "roleID", "raceName" FROM race_roles WHERE "guildID" = $1`, [guild.id]);
            if (!raceRolesRes || !raceRolesRes.rows || !raceRolesRes.rows.length) {
                raceRolesRes = await db.query(`SELECT roleid, racename FROM race_roles WHERE guildid = $1`, [guild.id]);
            }
            if (raceRolesRes && raceRolesRes.rows) {
                const userRoleIDs = member.roles.cache.map(r => String(r.id));
                const matched = raceRolesRes.rows.find(r => userRoleIDs.includes(String(r.roleID || r.roleid)));
                if (matched) return matched.raceName || matched.racename;
            }
        }
    } catch (e) {}
    return null;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('معلومات-الارتيفاكت')
        .setDescription('موسوعة تعرض تفاصيل الموارد والكتب الخاصة بالتطوير'),
    name: 'معلومات-الارتيفاكت',
    aliases: ['ارتيفاكت', 'موارد', 'artifacts'],
    category: 'Economy', 
    
    async execute(interactionOrMessage) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let user = isSlash ? interactionOrMessage.user : interactionOrMessage.author;
        let guild = isSlash ? interactionOrMessage.guild : interactionOrMessage.guild;

        const reply = async (payload) => {
            if (isSlash) {
                if (!interactionOrMessage.deferred && !interactionOrMessage.replied) await interactionOrMessage.deferReply();
                return interactionOrMessage.editReply(payload);
            } else {
                return interactionOrMessage.reply(payload);
            }
        };

        const db = interactionOrMessage.client.sql;

        const raceOptions = upgradeMats.weapon_materials.map(r => ({
            label: `موارد عرق ${RACE_TRANSLATIONS[r.race] || r.race}`,
            value: `race_${r.race}`,
            emoji: '💎'
        }));

        const selectRow = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('arti_select_race')
                .setPlaceholder('🔻 اختر عرقاً لاستعراض موارده...')
                .addOptions(raceOptions.slice(0, 25))
        );

        // 🔥 الأزرار الجديدة (ارتيفاكتي + الكتب المدمجة) 🔥
        const btnRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('arti_my_race').setLabel('ارتيفاكتي').setStyle(ButtonStyle.Primary).setEmoji('✨'),
            new ButtonBuilder().setCustomId('arti_books_all').setLabel('كتب المهارات').setStyle(ButtonStyle.Success).setEmoji('📚')
        );

        const hubBuffer = await generateHubCanvas();
        const msg = await reply({ 
            content: '', 
            embeds: [], 
            components: [selectRow, btnRow], 
            files: [new AttachmentBuilder(hubBuffer, { name: 'hub.png' })], 
            fetchReply: true 
        });

        if (!msg || !msg.createMessageComponentCollector) return;

        const filter = i => i.user.id === user.id;
        const collector = msg.createMessageComponentCollector({ filter, time: 180000 });

        collector.on('collect', async (i) => {
            await i.deferUpdate().catch(() => {});

            let newBuffer = null;

            if (i.customId === 'arti_my_race') {
                const raceName = await getUserRace(db, user, guild);
                if (!raceName) {
                    return i.followUp({ content: '❌ يجب عليك اختيار عرق أولاً من الأكاديمية أو الحدادة.', flags: [MessageFlags.Ephemeral] });
                }
                const raceData = upgradeMats.weapon_materials.find(r => r.race.toLowerCase() === raceName.toLowerCase());
                if (raceData) {
                    const arabicRace = RACE_TRANSLATIONS[raceData.race] || raceData.race;
                    newBuffer = await generateItemsCanvas(`⚔️ ارتيفاكت عرق ${arabicRace}`, raceData.materials, false, '', raceData.race);
                }
            } 
            else if (i.customId === 'arti_books_all') {
                const generalBooks = upgradeMats.skill_books.find(c => c.category === 'General_Skills').books;
                const raceBooks = upgradeMats.skill_books.find(c => c.category === 'Race_Skills').books;
                newBuffer = await generateCombinedBooksCanvas(generalBooks, raceBooks);
            } 
            else if (i.isStringSelectMenu() && i.customId === 'arti_select_race') {
                const raceName = i.values[0].replace('race_', '');
                const raceData = upgradeMats.weapon_materials.find(r => r.race === raceName);
                if (raceData) {
                    const arabicRace = RACE_TRANSLATIONS[raceName] || raceName;
                    newBuffer = await generateItemsCanvas(`⚔️ ارتيفاكت عرق ${arabicRace}`, raceData.materials, false, '', raceName);
                }
            }

            if (newBuffer) {
                await i.editReply({ 
                    content: '', 
                    embeds: [], 
                    files: [new AttachmentBuilder(newBuffer, { name: 'arti.png' })],
                    components: [selectRow, btnRow]
                }).catch(() => {});
            }
        });

        collector.on('end', () => {
            if (msg && msg.editable) {
                selectRow.components[0].setDisabled(true);
                btnRow.components.forEach(btn => btn.setDisabled(true));
                msg.edit({ components: [selectRow, btnRow] }).catch(() => {});
            }
        });
    }
};
