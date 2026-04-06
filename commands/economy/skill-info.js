const { EmbedBuilder, Colors, SlashCommandBuilder } = require("discord.js");
const skillsConfig = require('../../json/skills-config.json');
const upgradeMats = require('../../json/upgrade-materials.json');

const EMOJI_MORA = '<:mora:1435647151349698621>';
const R2_URL = 'https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev';

const SKILL_TIPS = new Map([
    ['skill_healing', 'استخدمها عندما تكون صحتك منخفضة، فهي تستعيد نسبة من طاقتك الكاملة.'],
    ['skill_shielding', 'استخدمها قبل أن تتلقى هجوماً قوياً من الخصم لتقليل الضرر بشكل كبير.'],
    ['skill_buffing', 'استخدمها قبل هجومك التالي مباشرة لمضاعفة الضرر الذي تسببه.'],
    ['skill_rebound', 'فعّلها عندما تتوقع هجوماً قوياً لتعكس جزءاً كبيراً من الضرر إلى الخصم.'],
    ['skill_weaken', 'استخدمها على الخصم لتقليل ضرر هجومه القادم وحماية نفسك.'],
    ['skill_dispel', 'استخدمها إذا كان خصمك يستخدم "درع" أو "تعزيز" لإزالة تأثيراتها عنه.'],
    ['skill_cleanse', 'استخدمها لإزالة التأثيرات السلبية عنك مثل "السم" أو "الإضعاف".'],
    ['skill_poison', 'استخدمها في بداية القتال. تسبب ضرراً بسيطاً فورياً، وضرر مستمر كل دور.'],
    ['skill_gamble', 'للمخاطرين فقط! قد تسبب ضرراً هائلاً، أو ضرراً ضعيفاً جداً. تعتمد على الحظ.'],
    ['race_dragon_skill', 'هجوم ناري قوي يسبب ضرراً حقيقياً يتجاهل أي درع لدى الخصم.'],
    ['race_human_skill', 'مهارة دفاعية وهجومية. تمنحك درعاً وتعزيزاً للضرر في نفس الوقت.'],
    ['race_seraphim_skill', 'هجوم يسرق الحياة. يسبب ضرراً للخصم ويعالجك بنسبة كبيرة من صحتك الكاملة.'],
    ['race_demon_skill', 'هجوم انتحاري. يسبب ضرراً هائلاً للخصم، لكنه يخصم 10% من صحتك الحالية.'],
    ['race_elf_skill', 'هجوم سريع يضرب مرتين متتاليتين، مسبباً ضرراً مزدوجاً في دور واحد.'],
    ['race_dark_elf_skill', 'يسبب ضرراً فورياً ويضع أقوى سم في اللعبة على الخصم.'],
    ['race_vampire_skill', 'هجوم يسرق الحياة بناءً على الضرر المُسبب. كلما كان هجومك أقوى، زاد شفاؤك.'],
    ['race_hybrid_skill', 'مهارة متقلبة. تمنحك تأثير عشوائي (درع، أو تعزيز، أو شفاء).'],
    ['race_spirit_skill', 'هجوم طيفي عشوائي قد يشل الخصم أو يسرق قوته أو يجعلك تعكس الضرر.'],
    ['race_dwarf_skill', 'يمنحك درعاً قوياً جداً يقلل الضرر بنسبة كبيرة، لكنه يستهلك دورك (لا يمكنك الهجوم).'],
    ['race_ghoul_skill', 'هجوم متوسط يلحق ضرراً بالخصم ويقوم بإضعافه في نفس الوقت.']
]);

const ID_TO_IMAGE = {
    'book_general_1': 'gen_book_tactic.png', 'book_general_2': 'gen_book_combat.png', 'book_general_3': 'gen_book_arts.png', 'book_general_4': 'gen_book_war.png', 'book_general_5': 'gen_book_wisdom.png',
    'book_race_1': 'race_book_stone.png', 'book_race_2': 'race_book_ancestor.png', 'book_race_3': 'race_book_secrets.png', 'book_race_4': 'race_book_covenant.png', 'book_race_5': 'race_book_pact.png'
};

// 🔥 دالة سحب صورة كتاب المهارة من R2 🔥
function getSkillImageURL(skillId) {
    if (!skillId) return null;
    const isRaceSkill = skillId.startsWith('race_');
    const categoryName = isRaceSkill ? 'Race_Skills' : 'General_Skills';
    const typeFolder = isRaceSkill ? 'race' : 'general';

    const bookCat = upgradeMats.skill_books.find(c => c.category === categoryName);
    if (bookCat && bookCat.books.length > 0) {
        const firstBookId = bookCat.books[0].id;
        const imgName = ID_TO_IMAGE[firstBookId] || `${firstBookId}.png`;
        return `${R2_URL}/images/materials/${typeFolder}/${imgName}`;
    }
    return null;
}

// 🔥 دالة الحسبة الموحدة للمهارات المطابقة للمحرك القتالي 🔥
function getSkillDisplayValue(skillConfig, currentLevel) {
    if (!skillConfig) return 0;
    const level = Math.max(1, currentLevel || 1);
    const base = skillConfig.base_value;
    const inc = skillConfig.value_increment;
    const isPercentage = skillConfig.stat_type === '%' || skillConfig.id.includes('heal') || skillConfig.id.includes('shield');

    if (level <= 15) {
        return Math.floor(base + (inc * (level - 1)));
    } else {
        const valueAt15 = base + (inc * 14);
        const targetValueAt30 = isPercentage ? 70 : 200; 
        const levelsRemaining = 15;
        const dynamicIncrement = (targetValueAt30 - valueAt15) / levelsRemaining;
        let finalValue = valueAt15 + (dynamicIncrement * (level - 15));
        if (level >= 30) return targetValueAt30;
        return Math.floor(finalValue);
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('مهارة')
        .setDescription('يعرض شرحاً تفصيلياً ونصيحة لاستخدام مهارة معينة.')
        .addStringOption(option =>
            option.setName('اسم-المهارة')
            .setDescription('اسم المهارة التي تريد البحث عنها')
            .setRequired(true)
            .setAutocomplete(true)),

    name: 'skill-info',
    aliases: ['مهارة', 'شرح-مهارة'],
    category: "Economy",
    description: 'يعرض شرحاً تفصيلياً ونصيحة لاستخدام مهارة معينة.',

    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused().toLowerCase();
        const filtered = skillsConfig.filter(s => 
            s.name.toLowerCase().includes(focusedValue) || 
            s.id.toLowerCase().includes(focusedValue)
        );

        await interaction.respond(
            filtered.slice(0, 25).map(s => ({
                name: `${s.emoji || '✨'} ${s.name}`,
                value: s.id
            }))
        );
    },

    async execute(interactionOrMessage, args) {

        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message;
        let skillQuery;

        if (isSlash) {
            interaction = interactionOrMessage;
            skillQuery = interaction.options.getString('اسم-المهارة').toLowerCase();
            await interaction.deferReply();
        } else {
            message = interactionOrMessage;
            if (!args.length) {
                return message.reply('**الاستخدام:** `-مهارة <اسم المهارة>`\n**مثال:** `-مهارة شفاء`');
            }
            skillQuery = args.join(' ').toLowerCase();
        }

        const reply = async (payload) => {
            if (isSlash) {
                return interaction.editReply(payload);
            } else {
                return message.channel.send(payload);
            }
        };

        const replyError = async (content) => {
            if (isSlash) {
                return interaction.editReply({ content, ephemeral: true });
            } else {
                return message.reply(content);
            }
        };

        const skill = skillsConfig.find(s => 
            s.id.toLowerCase() === skillQuery ||
            s.name.toLowerCase().includes(skillQuery)
        );

        if (!skill) {
            return replyError('❌ لم أتمكن من العثور على مهارة بهذا الاسم. جرب كتابة الاسم العربي (مثل: شفاء).');
        }

        const tip = SKILL_TIPS.get(skill.id) || "لا توجد نصيحة خاصة لهذه المهارة.";
        const isRaceSkill = skill.id.startsWith('race_');

        // حساب القيم الموحدة بناءً على النظام الجديد
        const isPercentage = skill.stat_type === '%' || skill.id.includes('heal') || skill.id.includes('shield');
        const statSymbol = isPercentage ? '%' : '';
        
        let valAt1 = getSkillDisplayValue(skill, 1);
        let valAt15 = getSkillDisplayValue(skill, 15);
        let valAt30 = getSkillDisplayValue(skill, 30);
        
        // توضيح للضرر الفعلي للمهارات الهجومية (الـ 200 تنضرب في 5 في القتال)
        let dmgNote = "";
        if (!isPercentage) {
            valAt1 = valAt1 * 5;
            valAt15 = valAt15 * 5;
            valAt30 = valAt30 * 5;
            dmgNote = "\n*(الأرقام تمثل الضرر الأساسي للمهارة قبل حساب تأثيرات الأسلحة والسمعة)*";
        }
        
        const skillImage = getSkillImageURL(skill.id);

        const description = [
            `✶ **القوة الأساسية (Lv.1):** \`${valAt1}${statSymbol}\``,
            `✶ **القوة في (Lv.15):** \`${valAt15}${statSymbol}\``,
            `✶ **القوة عند الصحوة (Lv.30):** \`${valAt30}${statSymbol}\``,
            `✶ **نوع المهارة:** \`${isRaceSkill ? 'عرقية (حصرية)' : 'عامة (متاحة للكل)'}\``,
            `✶ **أقصى مستوى:** \`Lv. ${skill.max_level || 30}\``
        ].join('\n') + dmgNote;

        const embed = new EmbedBuilder()
            .setTitle(`${skill.emoji || '✨'} ${skill.name} ${isRaceSkill ? '(خاص بالعرق)' : ''}`)
            .setColor(isRaceSkill ? Colors.Blue : Colors.Gold)
            .addFields(
                { name: "✶ الـوصـف والـقـدرات", value: skill.description || "لا يوجد وصف." },
                { name: "📊 إحصائيات المهارة والمستويات", value: description },
                { name: "✥ نصيحة للاستعمال", value: tip }
            );

        if (skillImage) {
            embed.setThumbnail(skillImage);
        }

        await reply({ embeds: [embed] });
    }
};
