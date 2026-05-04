const { EmbedBuilder, Colors, SlashCommandBuilder } = require("discord.js");
const skillsConfig = require('../../json/skills-config.json');
const upgradeMats = require('../../json/upgrade-materials.json');

const EMOJI_MORA = '<:mora:1435647151349698621>';
const R2_URL = 'https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev';

// ── Effect explanation dictionary ─────────────────────────────────────────────
const EFFECT_INFO = {
    burn:       { icon: '🔥', name: 'حرق',       desc: 'يتفاعل مع جسد الخصم كل دور ويخصم منه ضرراً ثابتاً.' },
    silence:    { icon: '🔇', name: 'صمت',       desc: 'يمنع الخصم من استخدام أي مهارة طوال مدته.' },
    vulnerable: { icon: '💔', name: 'هشاشة',     desc: 'يزيد الضرر الواقع على الخصم بنسبة 30%.' },
    weaken:     { icon: '📉', name: 'إضعاف',     desc: 'يقلل قوة هجوم الخصم بنسبة 30%.' },
    stun:       { icon: '😵', name: 'شلل',       desc: 'يوقف دور الخصم التالي بالكامل.' },
    confusion:  { icon: '🌀', name: 'ارتباك',    desc: 'يجعل الخصم يضرب نفسه أحياناً بدلاً من المهاجم.' },
    poison:     { icon: '☠️', name: 'تسمم',      desc: 'ضرر مستمر كل دور لمدة 3 أدوار.' },
    bleed:      { icon: '🩸', name: 'نزيف',      desc: 'ضرر مستمر من فقدان الدم كل دور لمدة 3 أدوار.' },
    blind:      { icon: '🙈', name: 'عمى',        desc: 'يقلل دقة الخصم ويزيد احتمال تفادي هجماته.' },
    bat:        { icon: '🦇', name: 'شفط الدم',  desc: 'يسرق 5% من الحد الأقصى لصحة الخصم كل دور لمصلحة المهاجم.' },
    taunt:      { icon: '😤', name: 'استفزاز',   desc: 'يجبر الخصم على مهاجمة هذا اللاعب فقط.' },
    thorns:     { icon: '🌵', name: 'أشواك',     desc: 'يعيد 30% من الضرر المستلم إلى المهاجم.' },
    reflect:    { icon: '🔄', name: 'انعكاس',    desc: 'يعكس جزءاً من الضرر القادم على صاحبه.' },
    evasion:    { icon: '👻', name: 'مراوغة',    desc: 'يجعل الهجوم التالي يخطئك بالكامل.' },
    heal:       { icon: '💚', name: 'شفاء',      desc: 'يستعيد جزءاً من الصحة القصوى.' },
    cleanse:    { icon: '✨', name: 'تطهير',     desc: 'يزيل جميع التأثيرات السلبية عن المستخدم.' },
    atk_buff:   { icon: '💪', name: 'تعزيز',     desc: 'يرفع قوة الهجوم بنسبة ثابتة لعدة أدوار.' },
};

// ── Detailed race skill mechanics ─────────────────────────────────────────────
const RACE_SKILL_DATA = {
    race_dragon_skill: {
        color: 0xFF4500,
        dmgTrait: '**ضرر مباشر ضخم** — قوة المهارة × **1.2**',
        traitNote: null,
        specialFx: [
            ['🔥 حرق',     '50%', '3 أدوار'],
            ['🔇 صمت',     '30%', '2 دور'],
            ['💔 هشاشة',   '20%', '2 دور'],
        ],
        fallback: '📉 إضعاف  **أو**  😵 شلل',
        usedEffects: ['burn', 'silence', 'vulnerable', 'weaken', 'stun'],
    },
    race_elf_skill: {
        color: 0x00CC66,
        dmgTrait: '**ضرر خفيف** — احتمال **20%** لضربة خارقة (× **1.5** ضرر)',
        traitNote: 'إذا نجحت الضربة الخارقة يظهر في السجل: ⚡ ضربة خارقة',
        specialFx: [
            ['😵 شلل',     '40%', '1 دور'],
            ['📉 إضعاف',   '50%', '2 دور'],
            ['🔇 صمت',     '30%', '2 دور'],
        ],
        fallback: '🌀 ارتباك  **أو**  🙈 عمى',
        usedEffects: ['stun', 'weaken', 'silence', 'confusion', 'blind'],
    },
    race_dark_elf_skill: {
        color: 0x7B2FBE,
        dmgTrait: '**ضرر اغتيال** — يرتفع إلى × **1.5** إذا كان الخصم مُرتبكاً (`confusion`)',
        traitNote: 'أفضل استخدام: بعد تطبيق ارتباك على الخصم أولاً',
        specialFx: [
            ['🌀 ارتباك',  '50%', '2 دور'],
            ['🔇 صمت',     '40%', '2 دور'],
            ['☠️ تسمم',    '40%', '3 أدوار'],
        ],
        fallback: '😵 شلل  **أو**  🩸 نزيف',
        usedEffects: ['confusion', 'silence', 'poison', 'stun', 'bleed'],
    },
    race_demon_skill: {
        color: 0x8B0000,
        dmgTrait: '**ضرر انفجاري** — قوة المهارة × **1.2** — المهاجم يفقد **10%** من حده الأقصى',
        traitNote: 'يُطبَّق الضرر الذاتي دائماً بغض النظر عن النتيجة',
        specialFx: [
            ['💔 هشاشة',   '50%', '2 دور'],
            ['🔥 حرق',     '50%', '3 أدوار'],
            ['🔇 صمت',     '30%', '2 دور'],
        ],
        fallback: '☠️ تسمم  **أو**  🌀 ارتباك',
        usedEffects: ['vulnerable', 'burn', 'silence', 'poison', 'confusion'],
    },
    race_seraphim_skill: {
        color: 0xFFD700,
        dmgTrait: '**ضرر الانتقام** — الضرر = قوة المهارة × (1 + نسبة الصحة المفقودة × 0.8)',
        traitNote: 'كلما كانت صحتك أقل، كان الضرر أشد — قوة قصوى عند الصحة الحرجة',
        specialFx: [
            ['💚 شفاء ذاتي', '50%', 'فوري (25% HP)'],
            ['🔇 صمت',       '40%', '2 دور'],
            ['💔 هشاشة',     '30%', '2 دور'],
        ],
        fallback: '🔥 حرق  **أو**  📉 إضعاف',
        usedEffects: ['heal', 'silence', 'vulnerable', 'burn', 'weaken'],
    },
    race_spirit_skill: {
        color: 0x4169E1,
        dmgTrait: '**ضرر طيفي** — يتجاهل 15% من الدفاع — قوة المهارة × **1.15**',
        traitNote: 'التأثيرات الذاتية (مراوغة وانعكاس) تحمي المهاجم',
        specialFx: [
            ['👻 مراوغة (ذاتي)', '30%', '1 دور'],
            ['🔇 صمت',            '50%', '2 دور'],
            ['🔄 انعكاس (ذاتي)',  '30%', '2 دور'],
        ],
        fallback: '🌀 ارتباك  **أو**  😵 شلل',
        usedEffects: ['evasion', 'silence', 'reflect', 'confusion', 'stun'],
    },
    race_hybrid_skill: {
        color: 0xFF8C00,
        dmgTrait: '**فوضى أولية** — الضرر عشوائي بين × **0.8** و× **1.2** قوة المهارة',
        traitNote: 'الضرر غير متوقع — قد يكون ضعيفاً أو قوياً في كل استخدام',
        specialFx: [
            ['😵 شلل',    '30%', '1 دور'],
            ['🌀 ارتباك', '40%', '2 دور'],
            ['🩸 نزيف',   '40%', '3 أدوار'],
        ],
        fallback: '**عشوائي** من البركة العامة 🎲',
        fallbackNote: 'البركة: 🔥حرق · ☠️تسمم · 🌀ارتباك · 📉إضعاف · 🔇صمت · 💔هشاشة · 🙈عمى',
        usedEffects: ['stun', 'confusion', 'bleed', 'burn', 'poison', 'weaken', 'silence', 'vulnerable', 'blind'],
    },
    race_ghoul_skill: {
        color: 0x556B2F,
        dmgTrait: '**ضرر إعدام** — يتضاعف × **2** إذا كانت صحة الخصم أقل من **20%**',
        traitNote: 'أفضل استخدام: عند اقتراب الخصم من الموت لإنهاء المعركة',
        specialFx: [
            ['☠️ تسمم',    '50%', '3 أدوار'],
            ['📉 إضعاف',   '50%', '2 دور'],
            ['🔇 صمت',     '30%', '2 دور'],
        ],
        fallback: '🌀 ارتباك  **أو**  🩸 نزيف',
        usedEffects: ['poison', 'weaken', 'silence', 'confusion', 'bleed'],
    },
    race_vampire_skill: {
        color: 0x6A0572,
        dmgTrait: '**ضرر سرقة الحياة** — يشفي المهاجم دائماً بـ **25%** من الضرر المُسبَّب',
        traitNote: 'الشفاء يحدث دائماً بغض النظر عن التأثيرات الخاصة',
        specialFx: [
            ['🦇 شفط الدم', '50%', '5 أدوار (5% HP/دور)'],
            ['🩸 نزيف',     '50%', '3 أدوار'],
            ['🔇 صمت',      '20%', '2 دور'],
        ],
        fallback: '📉 إضعاف  **أو**  🌀 ارتباك',
        usedEffects: ['bat', 'bleed', 'silence', 'weaken', 'confusion'],
    },
    race_dwarf_skill: {
        color: 0x8B6914,
        dmgTrait: '**ضربة المطرقة** — قوة المهارة × **1.4**',
        traitNote: 'التأثيرات الثلاثة تحمي المهاجم — الضمان يطال الخصم دائماً',
        specialFx: [
            ['😤 استفزاز (ذاتي)',  '50%', '2 دور'],
            ['🌵 أشواك (ذاتي)',    '50%', '2 دور'],
            ['🔄 انعكاس (ذاتي)',   '40%', '2 دور'],
        ],
        fallback: '😵 شلل  **أو**  📉 إضعاف (على الخصم)',
        usedEffects: ['taunt', 'thorns', 'reflect', 'stun', 'weaken'],
    },
    race_human_skill: {
        color: 0x1E90FF,
        dmgTrait: '**نصل الحقيقة** — ضرر حقيقي يتجاهل درع الخصم بالكامل',
        traitNote: 'قوة المهارة × 1.0 — الميزة هي تجاوز الدفاع',
        specialFx: [
            ['✨ تطهير (ذاتي)',  '50%', 'فوري'],
            ['💪 تعزيز (ذاتي)', '50%', '3 أدوار (+30%)'],
            ['🔇 صمت',          '40%', '2 دور'],
        ],
        fallback: '💔 هشاشة  **أو**  📉 إضعاف (على الخصم)',
        usedEffects: ['cleanse', 'atk_buff', 'silence', 'vulnerable', 'weaken'],
    },
};

// ── Generic skill usage tips ───────────────────────────────────────────────────
const SKILL_TIPS = new Map([
    ['skill_healing',       'استخدمها عندما تكون صحتك منخفضة؛ تستعيد نسبة من الحد الأقصى.'],
    ['skill_shielding',     'افعّلها قبل هجوم الخصم لامتصاص الضرر القادم.'],
    ['skill_buffing',       'استخدمها قبل هجومك التالي مباشرةً لمضاعفة الضرر.'],
    ['skill_rebound',       'فعّلها حين تتوقع هجوماً شديداً لإرجاع جزء منه.'],
    ['skill_weaken',        'افرضها على الخصم قبل انتهاء دورك لتقليل ضرره القادم.'],
    ['skill_dispel',        'استخدمها عند رؤية درع أو تعزيز على الخصم لإزالتها فوراً.'],
    ['skill_cleanse',       'أنقذ نفسك من السم أو الإضعاف قبل أن تتراكم التأثيرات.'],
    ['skill_poison',        'أطلقها مبكراً لتراكم ضرر مستمر طوال المعركة.'],
    ['skill_gamble',        'للمقامرين فقط — احتمال 50% لضرر ضخم أو ضرر بسيط + إيذاء نفسك.'],
    // Race skills tips
    ['race_dragon_skill',    'استخدمها مباشرةً — الحرق يراكم ضرراً مستمراً، والهشاشة تضخم هجماتك التالية.'],
    ['race_elf_skill',       'لا تتردد في استخدامها في كل فرصة؛ احتمال الشلل والإضعاف يشلّ الخصم.'],
    ['race_dark_elf_skill',  'الاستراتيجية المثلى: طبّق الارتباك أولاً بمهارة عامة ثم استخدمها للضرر المضاعف.'],
    ['race_demon_skill',     'استخدمها حين صحتك مرتفعة — الضرر الذاتي (10% HP) يستحق الهجوم الضخم.'],
    ['race_seraphim_skill',  'احتفظ بها حتى تنخفض صحتك — الضرر يتضاعف كلما اقتربت من الموت.'],
    ['race_spirit_skill',    'المراوغة والانعكاس الذاتيان يجعلانك شبه منيع في الدور التالي.'],
    ['race_hybrid_skill',    'الفوضى قوتها: لا يمكن للخصم التنبؤ بما سيحدث — استخدمها باستمرار.'],
    ['race_ghoul_skill',     'احتفظ بها حتى يصل الخصم لأقل من 20% صحة للضرر المضاعف القاتل.'],
    ['race_vampire_skill',   'كلما كانت مهارتك أقوى زاد الشفاء — استخدمها للتعافي وإيذاء الخصم معاً.'],
    ['race_dwarf_skill',     'الأشواك والانعكاس الذاتيان يعاقبان الخصم على كل هجوم في الدورين القادمين.'],
    ['race_human_skill',     'الضرر الحقيقي يبزّ الدفاعات العالية — استخدمها على الخصوم ذوي الدروع الثقيلة.'],
]);

const ID_TO_IMAGE = {
    'book_general_1': 'gen_book_tactic.png', 'book_general_2': 'gen_book_combat.png',
    'book_general_3': 'gen_book_arts.png',   'book_general_4': 'gen_book_war.png',
    'book_general_5': 'gen_book_wisdom.png',
    'book_race_1': 'race_book_stone.png',    'book_race_2': 'race_book_ancestor.png',
    'book_race_3': 'race_book_secrets.png',  'book_race_4': 'race_book_covenant.png',
    'book_race_5': 'race_book_pact.png',
};

function getSkillImageURL(skillId) {
    if (!skillId) return null;
    const isRaceSkill = skillId.startsWith('race_');
    const categoryName = isRaceSkill ? 'Race_Skills' : 'General_Skills';
    const typeFolder   = isRaceSkill ? 'race' : 'general';
    const bookCat = upgradeMats.skill_books.find(c => c.category === categoryName);
    if (bookCat && bookCat.books.length > 0) {
        const imgName = ID_TO_IMAGE[bookCat.books[0].id] || `${bookCat.books[0].id}.png`;
        return `${R2_URL}/images/materials/${typeFolder}/${imgName}`;
    }
    return null;
}

function getSkillDisplayValue(skillConfig, currentLevel) {
    if (!skillConfig) return 0;
    const level = Math.max(1, currentLevel || 1);
    const base  = skillConfig.base_value;
    const inc   = skillConfig.value_increment;
    const isPercentage = skillConfig.stat_type === '%'
        || skillConfig.id.includes('heal')
        || skillConfig.id.includes('shield');

    if (level <= 15) {
        return Math.floor(base + (inc * (level - 1)));
    } else {
        const valueAt15        = base + (inc * 14);
        const targetValueAt30  = isPercentage ? 70 : 200;
        const dynamicIncrement = (targetValueAt30 - valueAt15) / 15;
        if (level >= 30) return targetValueAt30;
        return Math.floor(valueAt15 + (dynamicIncrement * (level - 15)));
    }
}

// ── Build detailed embed for a race skill ─────────────────────────────────────
function buildRaceEmbed(skill, raceData) {
    const tip = SKILL_TIPS.get(skill.id) || 'لا توجد نصيحة خاصة.';

    // Stats
    const raw1  = getSkillDisplayValue(skill, 1)  * 5;
    const raw15 = getSkillDisplayValue(skill, 15) * 5;
    const raw30 = getSkillDisplayValue(skill, 30) * 5;
    const statsText = [
        `✶ **القوة الأساسية (Lv.1):** \`${raw1}\``,
        `✶ **القوة في (Lv.15):** \`${raw15}\``,
        `✶ **القوة عند الصحوة (Lv.30):** \`${raw30}\``,
        `✶ **أقصى مستوى:** \`Lv.${skill.max_level || 30}\``,
        `*(الأرقام قبل حساب أسلحة والسمعة)*`,
    ].join('\n');

    // Special effects table
    const fxLines = raceData.specialFx.map(([name, chance, dur]) =>
        `\`${chance.padStart(4)}\`  ${name}  —  ${dur}`
    ).join('\n');
    const fxText = fxLines
        + (raceData.traitNote ? `\n\n> 📌 ${raceData.traitNote}` : '');

    // Effect explanations for effects used by this skill
    const explanations = (raceData.usedEffects || [])
        .map(k => EFFECT_INFO[k])
        .filter(Boolean)
        .map(e => `**${e.icon} ${e.name}** — ${e.desc}`)
        .join('\n');

    // Fallback text
    const fallbackText = `${raceData.fallback}`
        + (raceData.fallbackNote ? `\n> ${raceData.fallbackNote}` : '');

    const embed = new EmbedBuilder()
        .setTitle(`${skill.emoji || '✨'} ${skill.name}  ❖  مهارة عرقية حصرية`)
        .setColor(raceData.color || Colors.Blue)
        .addFields(
            { name: '⚔️ طريقة حساب الضرر', value: raceData.dmgTrait, inline: false },
            { name: '🎲 التأثيرات الخاصة  *(كل واحدة تُطبَّق منفردة)*', value: fxText, inline: false },
            {
                name: '⚡ ضمان الفشل  *(يُفعَّل تلقائياً إذا فشلت جميع النسب)*',
                value: fallbackText,
                inline: false,
            },
            { name: '📊 إحصائيات المهارة', value: statsText, inline: false },
            { name: '📖 شرح التأثيرات', value: explanations || 'غير متوفر.', inline: false },
            { name: '💡 نصيحة الاستخدام', value: tip, inline: false },
        )
        .setFooter({ text: 'التأثيرات المُعلَّمة بـ (ذاتي) تنطبق على المستخدم · ✦ = تأثير ضمان الفشل' });

    const img = getSkillImageURL(skill.id);
    if (img) embed.setThumbnail(img);
    return embed;
}

// ── Build embed for generic (non-race) skill ──────────────────────────────────
function buildGenericEmbed(skill) {
    const tip = SKILL_TIPS.get(skill.id) || 'لا توجد نصيحة خاصة.';
    const isPercentage = skill.stat_type === '%'
        || skill.id.includes('heal')
        || skill.id.includes('shield');
    const sym = isPercentage ? '%' : '';

    let v1  = getSkillDisplayValue(skill, 1);
    let v15 = getSkillDisplayValue(skill, 15);
    let v30 = getSkillDisplayValue(skill, 30);
    let dmgNote = '';
    if (!isPercentage) {
        v1  *= 5; v15 *= 5; v30 *= 5;
        dmgNote = '\n*(الأرقام تمثل الضرر الأساسي قبل المضاعفات)*';
    }

    const statsText = [
        `✶ **القوة الأساسية (Lv.1):** \`${v1}${sym}\``,
        `✶ **القوة في (Lv.15):** \`${v15}${sym}\``,
        `✶ **القوة عند الصحوة (Lv.30):** \`${v30}${sym}\``,
        `✶ **أقصى مستوى:** \`Lv.${skill.max_level || 30}\``,
    ].join('\n') + dmgNote;

    const embed = new EmbedBuilder()
        .setTitle(`${skill.emoji || '✨'} ${skill.name}`)
        .setColor(Colors.Gold)
        .addFields(
            { name: '✶ الوصف والقدرات', value: skill.description || 'لا يوجد وصف.', inline: false },
            { name: '📊 إحصائيات المهارة', value: statsText, inline: false },
            { name: '💡 نصيحة الاستخدام', value: tip, inline: false },
        );

    const img = getSkillImageURL(skill.id);
    if (img) embed.setThumbnail(img);
    return embed;
}

// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
    data: new SlashCommandBuilder()
        .setName('مهارة')
        .setDescription('يعرض شرحاً تفصيلياً لمهارة مع احتمالات التأثيرات ونصيحة الاستخدام.')
        .addStringOption(option =>
            option.setName('اسم-المهارة')
                .setDescription('اسم المهارة')
                .setRequired(true)
                .setAutocomplete(true)),

    name: 'skill-info',
    aliases: ['مهارة', 'شرح-مهارة'],
    category: 'Economy',
    description: 'يعرض شرحاً تفصيلياً لمهارة مع احتمالات التأثيرات ونصيحة الاستخدام.',

    async autocomplete(interaction) {
        const q = interaction.options.getFocused().toLowerCase();
        const filtered = skillsConfig.filter(s =>
            s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q)
        );
        await interaction.respond(
            filtered.slice(0, 25).map(s => ({ name: `${s.emoji || '✨'} ${s.name}`, value: s.id }))
        );
    },

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let skillQuery;

        if (isSlash) {
            skillQuery = interactionOrMessage.options.getString('اسم-المهارة').toLowerCase();
            await interactionOrMessage.deferReply();
        } else {
            if (!args || !args.length)
                return interactionOrMessage.reply('**الاستخدام:** `-مهارة <اسم المهارة>`\n**مثال:** `-مهارة شفاء`');
            skillQuery = args.join(' ').toLowerCase();
        }

        const reply = payload => isSlash
            ? interactionOrMessage.editReply(payload)
            : interactionOrMessage.channel.send(payload);

        const replyError = content => isSlash
            ? interactionOrMessage.editReply({ content })
            : interactionOrMessage.reply(content);

        const skill = skillsConfig.find(s =>
            s.id.toLowerCase() === skillQuery || s.name.toLowerCase().includes(skillQuery)
        );

        if (!skill)
            return replyError('❌ لم أتمكن من إيجاد مهارة بهذا الاسم. جرب الاسم العربي (مثل: شفاء).');

        const isRaceSkill = skill.id.startsWith('race_');
        const raceData    = RACE_SKILL_DATA[skill.id];

        if (isRaceSkill && raceData) {
            return reply({ embeds: [buildRaceEmbed(skill, raceData)] });
        } else {
            return reply({ embeds: [buildGenericEmbed(skill)] });
        }
    },
};
