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
    ['skill_gamble', 'للمخاطرين فقط! قد تسبب ضرراً هائلاً، أو ضرراً ضعيفاً جداً. تعتمد على الحظ.']
]);

const RACE_MECHANICS = {
    'race_dragon_skill': {
        trait: 'ضرر ناري مباشر هائل.',
        specials: '🔥 حرق (50%)\n🤫 صمت (30%)\n🎯 هشاشة (20%)',
        fallback: '📉 إضعاف أو 😵 شلل'
    },
    'race_human_skill': {
        trait: 'نصل الحقيقة (ضرر حقيقي يتجاهل دروع ودفاع الخصم).',
        specials: '✨ تطهير نفسك (50%)\n💪 تعزيز هجومك (50%)\n🤫 صمت للخصم (40%)',
        fallback: '🎯 هشاشة أو 📉 إضعاف'
    },
    'race_seraphim_skill': {
        trait: 'ضرر انتقامي (يزداد الضرر كلما نقصت صحتك).',
        specials: '💖 شفاء نفسك (50%)\n🤫 صمت (40%)\n🎯 هشاشة (30%)',
        fallback: '🔥 حرق أو 📉 إضعاف'
    },
    'race_demon_skill': {
        trait: 'ضرر انفجاري مرعب (تضحي بـ 10% من صحتك القصوى لاستخدامه).',
        specials: '🎯 هشاشة (50%)\n🔥 حرق (50%)\n🤫 صمت (30%)',
        fallback: '☠️ سم أو 🌀 ارتباك'
    },
    'race_elf_skill': {
        trait: 'ضرر رشيق (فرصة 20% لتسديد ضربة خارقة بضرر 1.5x).',
        specials: '😵 شلل (40%)\n📉 إضعاف (50%)\n🤫 صمت (30%)',
        fallback: '🌀 ارتباك أو 👁️ عمى'
    },
    'race_dark_elf_skill': {
        trait: 'ضرر اغتيال (يزداد الضرر مع ارتباك الخصم).',
        specials: '🌀 ارتباك (50%)\n🤫 صمت (40%)\n☠️ سم (40%)',
        fallback: '😵 شلل أو 🩸 نزيف'
    },
    'race_vampire_skill': {
        trait: 'ضرر امتصاص (يعالجك دائماً بنسبة 25% من الضرر المُسبب).',
        specials: '🦇 خفاش طفيلي (50%)\n🩸 نزيف (50%)\n🤫 صمت (20%)',
        fallback: '📉 إضعاف أو 🌀 ارتباك'
    },
    'race_hybrid_skill': {
        trait: 'ضرر غريزي متذبذب (بين 80% إلى 120% في كل هجمة).',
        specials: '😵 شلل (30%)\n🌀 ارتباك (40%)\n🩸 نزيف (40%)',
        fallback: '🎲 تأثير سلبي عشوائي من القائمة العامة'
    },
    'race_spirit_skill': {
        trait: 'ضرر طيفي (يتجاهل 15% من الدفاع ويضرب بـ 1.15x).',
        specials: '👻 مراوغة تامة (30%)\n🤫 صمت (50%)\n🔄 انعكاس (30%)',
        fallback: '🌀 ارتباك أو 😵 شلل'
    },
    'race_dwarf_skill': {
        trait: 'ضرر المطرقة (يضرب بقوة أساسية x1.4).',
        specials: '🤬 استفزاز (50%)\n🌵 أشواك (50%)\n🔄 انعكاس (40%)',
        fallback: '😵 شلل أو 📉 إضعاف'
    },
    'race_ghoul_skill': {
        trait: 'ضرر إعدام (يتضاعف الضرر x2 إذا كان دم الخصم أقل من 20%).',
        specials: '☠️ سم (50%)\n📉 إضعاف (50%)\n🤫 صمت (30%)',
        fallback: '🌀 ارتباك أو 🩸 نزيف'
    }
};

const EFFECT_GLOSSARY = `
**دليل حالات التأثير في المعركة:**
🤫 **صمت:** يمنع الخصم من استخدام "المهارات" ويجبره على الهجوم العادي.
🦇 **خفاش:** طفيلي يسحب 5% من دم الخصم لـ 5 جولات ويعالجك.
🤬 **استفزاز:** يجبر الزعيم على ترك زملائك ومهاجمتك أنت فقط.
🌵 **أشواك:** يعكس ضرراً ثابتاً للمهاجم في كل مرة يضربك.
🎯 **هشاشة:** يكسر الدفاع ليزيد الضرر المتلقى بنسبة 30%.
🌀 **ارتباك:** يجعل الخصم يهاجم نفسه بنسبة من ضرره.
👻 **مراوغة:** تفادي الهجوم القادم بنسبة 100%.
✦ **التأثير المضمون:** إذا خانك الحظ وفشلت جميع نسب مهارة العرق سيقوم النظام تلقائياً بتطبيق تأثير مضمون كي لا تضيع ضربتك!`;

const ID_TO_IMAGE = {
    'book_general_1': 'gen_book_tactic.png', 'book_general_2': 'gen_book_combat.png', 'book_general_3': 'gen_book_arts.png', 'book_general_4': 'gen_book_war.png', 'book_general_5': 'gen_book_wisdom.png',
    'book_race_1': 'race_book_stone.png', 'book_race_2': 'race_book_ancestor.png', 'book_race_3': 'race_book_secrets.png', 'book_race_4': 'race_book_covenant.png', 'book_race_5': 'race_book_pact.png'
};

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
            return replyError('❌ لم أتمكن من العثور على مهارة بهذا الاسم. جرب البحث بالاسم (مثل: مهارة شفاء).');
        }

        const isRaceSkill = skill.id.startsWith('race_');

        const isPercentage = skill.stat_type === '%' || skill.id.includes('heal') || skill.id.includes('shield');
        const statSymbol = isPercentage ? '%' : '';
        
        let valAt1 = getSkillDisplayValue(skill, 1);
        let valAt15 = getSkillDisplayValue(skill, 15);
        let valAt30 = getSkillDisplayValue(skill, 30);
        
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
            .setColor(isRaceSkill ? Colors.Blue : Colors.Gold);

        if (!isRaceSkill) {
            embed.addFields(
                { name: "✶ الـوصـف والـقـدرات", value: skill.description || "لا يوجد وصف." },
                { name: "📊 إحصائيات المهارة والمستويات", value: description },
                { name: "✥ نصيحة للاستعمال", value: SKILL_TIPS.get(skill.id) || "لا توجد نصيحة خاصة لهذه المهارة." }
            );
        } else {
            const mech = RACE_MECHANICS[skill.id];
            if (mech) {
                embed.addFields(
                    { name: "📊 إحصائيات المهارة والمستويات", value: description },
                    { name: "⚔️ الميكانيكية التكتيكية للعرق", value: `**ميزة الضرر:**\n${mech.trait}\n\n**التأثيرات الخاصة (تُحسب بالترتيب):**\n${mech.specials}\n\n**التأثير المضمون (في حال فشلت جميع النسب):**\n${mech.fallback}` },
                    { name: "📖 دليل التأثيرات", value: EFFECT_GLOSSARY }
                );
            } else {
                embed.addFields(
                    { name: "✶ الـوصـف والـقـدرات", value: skill.description || "لا يوجد وصف." },
                    { name: "📊 إحصائيات المهارة", value: description }
                );
            }
        }

        if (skillImage) {
            embed.setThumbnail(skillImage);
        }

        await reply({ embeds: [embed] });
    }
};
