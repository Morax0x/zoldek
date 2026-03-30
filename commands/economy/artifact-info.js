const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, Colors, MessageFlags } = require('discord.js');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');
const fs = require('fs');

// تسجيل الخطوط (نفس اللي نستخدمه دايم)
try {
    const fontsDir = path.join(process.cwd(), 'fonts');
    const beinPath = path.join(fontsDir, 'bein-ar-normal.ttf');
    const emojiPath = path.join(fontsDir, 'NotoEmoj.ttf');
    if (fs.existsSync(beinPath)) GlobalFonts.registerFromPath(beinPath, 'Bein');
    if (fs.existsSync(emojiPath)) GlobalFonts.registerFromPath(emojiPath, 'Emoji');
} catch (e) {}

const FONT_MAIN = '"Bein", "Arial", sans-serif';
const FONT_EMOJI = '"Emoji", "Arial", sans-serif';

const upgradeMats = require('../../json/upgrade-materials.json'); // تأكد من مسار الجيسون
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

function roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath(); ctx.moveTo(x + radius, y); ctx.lineTo(x + width - radius, y); ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius); ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height); ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius); ctx.quadraticCurveTo(x, y, x + radius, y); ctx.closePath();
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

// 🎨 رسم شاشة الترحيب (الموسوعة الرئيسية)
async function generateHubCanvas() {
    const width = 1200, height = 700;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const bgGrad = ctx.createRadialGradient(width/2, height/2, 100, width/2, height/2, 800);
    bgGrad.addColorStop(0, '#1a1025'); bgGrad.addColorStop(1, '#050508');
    ctx.fillStyle = bgGrad; ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#FFFFFF';
    for(let i=0; i<150; i++) {
        ctx.globalAlpha = Math.random() * 0.4 + 0.1;
        ctx.beginPath(); ctx.arc(Math.random() * width, Math.random() * height, Math.random() * 2, 0, Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha = 1.0;

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#B968FF'; ctx.font = `bold 60px ${FONT_MAIN}`;
    ctx.shadowColor = '#B968FF'; ctx.shadowBlur = 20;
    ctx.fillText('🔮 موسوعة الارتيفاكت والموارد', width / 2, 100);
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#FFFFFF'; ctx.font = `30px ${FONT_MAIN}`;
    ctx.fillText('مرحباً بك في مكتبة الإمبراطورية. اختر قسماً من الأسفل للاستكشاف.', width / 2, 180);

    const boxW = 500, boxH = 300, gap = 60;
    const startX = (width - (boxW * 2 + gap)) / 2;

    // صندوق الأسلحة
    drawOrnateFrame(ctx, startX, 280, boxW, boxH, '#FFD700');
    ctx.fillStyle = '#FFD700'; ctx.font = `bold 40px ${FONT_MAIN}`;
    ctx.fillText('⚔️ موارد الأسلحة', startX + boxW/2, 340);
    ctx.fillStyle = '#E0E0E0'; ctx.font = `24px ${FONT_MAIN}`;
    ctx.fillText('لكل عرق 5 موارد متدرجة الندرة', startX + boxW/2, 420);
    ctx.fillText('تستخدم في ورشة الحدادة لتطوير', startX + boxW/2, 460);
    ctx.fillText('سلاح العرق الخاص بك للحد الأقصى.', startX + boxW/2, 500);

    // صندوق المهارات
    drawOrnateFrame(ctx, startX + boxW + gap, 280, boxW, boxH, '#00C3FF');
    ctx.fillStyle = '#00C3FF'; ctx.font = `bold 40px ${FONT_MAIN}`;
    ctx.fillText('📚 كتب المهارات', startX + boxW + gap + boxW/2, 340);
    ctx.fillStyle = '#E0E0E0'; ctx.font = `24px ${FONT_MAIN}`;
    ctx.fillText('تنقسم إلى كتب عامة وكتب عرقية', startX + boxW + gap + boxW/2, 420);
    ctx.fillText('تُستخدم في الأكاديمية السحرية', startX + boxW + gap + boxW/2, 460);
    ctx.fillText('لصقل مهاراتك ورفع مستواها.', startX + boxW + gap + boxW/2, 500);

    return canvas.toBuffer('image/png');
}

// 🎨 رسم بطاقة الموارد (5 عناصر)
async function generateItemsCanvas(title, items, isBook = false, bookCat = 'general', raceName = '') {
    const width = 1200, height = 900;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const bgGrad = ctx.createRadialGradient(width/2, height/2, 100, width/2, height/2, 900);
    bgGrad.addColorStop(0, '#101520'); bgGrad.addColorStop(1, '#05050a');
    ctx.fillStyle = bgGrad; ctx.fillRect(0, 0, width, height);

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FFD700'; ctx.font = `bold 60px ${FONT_MAIN}`;
    ctx.shadowColor = '#FFD700'; ctx.shadowBlur = 20;
    ctx.fillText(title, width / 2, 80);
    ctx.shadowBlur = 0;

    // تحميل الصور
    const images = await Promise.all(items.map(async item => {
        const url = getMaterialImageUrl(item.id, raceName, isBook, bookCat);
        return await getCachedImage(url);
    }));

    // حسبة الشبكة (3 فوق، 2 تحت)
    const cardW = 320, cardH = 340;
    const gapX = 40, gapY = 50;

    // الصف الأول (3 كروت)
    const row1StartX = (width - (cardW * 3 + gapX * 2)) / 2;
    const row1Y = 180;

    // الصف الثاني (كرتين)
    const row2StartX = (width - (cardW * 2 + gapX)) / 2;
    const row2Y = row1Y + cardH + gapY;

    for (let i = 0; i < 5; i++) {
        const item = items[i];
        if (!item) continue;

        const x = i < 3 ? row1StartX + i * (cardW + gapX) : row2StartX + (i - 3) * (cardW + gapX);
        const y = i < 3 ? row1Y : row2Y;

        const color = RARITY_COLORS[item.rarity] || '#FFFFFF';

        // رسم الإطار
        drawOrnateFrame(ctx, x, y, cardW, cardH, color);

        // وهج خلفي للصورة
        const aura = ctx.createRadialGradient(x + cardW/2, y + 140, 10, x + cardW/2, y + 140, 150);
        aura.addColorStop(0, `${color}40`); aura.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = aura; ctx.fillRect(x, y, cardW, cardH);

        // الصورة
        const imgSize = 160;
        const img = images[i];
        if (img) {
            ctx.shadowColor = color; ctx.shadowBlur = 30;
            ctx.drawImage(img, x + (cardW - imgSize)/2, y + 40, imgSize, imgSize);
            ctx.shadowBlur = 0;
        } else {
            ctx.fillStyle = '#FFF'; ctx.font = `80px ${FONT_EMOJI}`;
            ctx.fillText(item.emoji || '📦', x + cardW/2, y + 120);
        }

        // شريط الاسم
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(x + 10, y + 220, cardW - 20, 50);
        ctx.fillStyle = '#FFFFFF'; ctx.font = `bold 26px ${FONT_MAIN}`;
        ctx.fillText(item.name.replace(/[\u{1F600}-\u{1F6FF}]/gu, '').trim(), x + cardW/2, y + 245);

        // الندرة
        ctx.fillStyle = color; ctx.font = `22px ${FONT_MAIN}`;
        ctx.fillText(`الندرة: ${RARITY_ARABIC[item.rarity]}`, x + cardW/2, y + 300);
    }

    return canvas.toBuffer('image/png');
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('معلومات-الارتيفاكت')
        .setDescription('موسوعة تعرض تفاصيل الموارد والكتب الخاصة بالتطوير'),
    name: 'معلومات-الارتيفاكت',
    aliases: ['ارتيفاكت', 'موارد', 'artifacts'],
    category: 'Economy', // 🔥 تم النقل للـ Economy
    
    async execute(interactionOrMessage) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let user = isSlash ? interactionOrMessage.user : interactionOrMessage.author;

        const reply = async (payload) => {
            if (isSlash) {
                if (!interactionOrMessage.deferred && !interactionOrMessage.replied) await interactionOrMessage.deferReply();
                return interactionOrMessage.editReply(payload);
            } else {
                return interactionOrMessage.reply(payload);
            }
        };

        // تجهيز الخيارات والأزرار
        const raceOptions = upgradeMats.weapon_materials.map(r => ({
            label: `موارد عرق ${RACE_TRANSLATIONS[r.race] || r.race}`,
            value: `race_${r.race}`,
            emoji: '💎'
        }));

        const selectRow = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('arti_select_race')
                .setPlaceholder('اختر عرقاً لعرض موارده...')
                .addOptions(raceOptions.slice(0, 25))
        );

        const btnRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('arti_books_general').setLabel('الكتب العامة').setStyle(ButtonStyle.Primary).setEmoji('📘'),
            new ButtonBuilder().setCustomId('arti_books_race').setLabel('كتب الأعراق').setStyle(ButtonStyle.Success).setEmoji('📕'),
            new ButtonBuilder().setCustomId('arti_hub').setLabel('الرئيسية').setStyle(ButtonStyle.Secondary).setEmoji('🏠')
        );

        // إرسال الشاشة الرئيسية
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

            if (i.customId === 'arti_hub') {
                newBuffer = await generateHubCanvas();
            } 
            else if (i.customId === 'arti_books_general') {
                const bookData = upgradeMats.skill_books.find(c => c.category === 'General_Skills');
                newBuffer = await generateItemsCanvas('📘 كتب المهارات العامة', bookData.books, true, 'general', '');
            } 
            else if (i.customId === 'arti_books_race') {
                const bookData = upgradeMats.skill_books.find(c => c.category === 'Race_Skills');
                newBuffer = await generateItemsCanvas('📕 كتب مهارات الأعراق', bookData.books, true, 'race', '');
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
