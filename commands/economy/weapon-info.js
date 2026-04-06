const { EmbedBuilder, Colors, SlashCommandBuilder } = require("discord.js");
const weaponsConfig = require('../../json/weapons-config.json');
const upgradeMats = require('../../json/upgrade-materials.json');
const { getUserRace, getWeaponData, cleanDisplayName } = require('../../handlers/pvp-core.js');

const EMOJI_MORA = '<:mora:1435647151349698621>';
const R2_URL = 'https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev';

const RACE_TRANSLATIONS = new Map([
    ['Human', 'بشري'],
    ['Dragon', 'تنين'],
    ['Elf', 'الف'],
    ['Dark Elf', 'الف الظلام'],
    ['Seraphim', 'سيرافيم'],
    ['Demon', 'شيطان'],
    ['Vampire', 'مصاص دماء'],
    ['Spirit', 'روح'],
    ['Dwarf', 'قزم'],
    ['Ghoul', 'غول'],
    ['Hybrid', 'نصف وحش']
]);

const REVERSE_RACE_TRANSLATIONS = new Map(
    Array.from(RACE_TRANSLATIONS, a => [a[1].toLowerCase(), a[0]])
);

// 🔥 دالة سحب صورة السلاح بذكاء عبر موارد الترقية 🔥
function getWeaponImageURL(raceName) {
    if (!raceName) return null;
    const raceMats = upgradeMats.weapon_materials.find(m => m.race.toLowerCase() === raceName.toLowerCase());
    if (raceMats && raceMats.materials.length > 0) {
        const firstMatId = raceMats.materials[0].id;
        const raceFolder = raceName.toLowerCase().replace(/\s+/g, '_');
        
        // استنتاج اسم الصورة من الدليل اللي عندك في الانفنتوري
        const ID_TO_IMAGE = {
            'mat_dragon_1': 'dragon_ash.png', 'mat_human_1': 'human_iron.png',
            'mat_elf_1': 'elf_branch.png', 'mat_darkelf_1': 'darkelf_obsidian.png',
            'mat_seraphim_1': 'seraphim_feathe.png', 'demon_1': 'demon_ember.png', 'mat_demon_1': 'demon_ember.png',
            'mat_vampire_1': 'vampire_blood.png', 'mat_spirit_1': 'spirit_dust.png',
            'mat_hybrid_1': 'hybrid_claw.png', 'mat_dwarf_1': 'dwarf_copper.png',
            'mat_ghoul_1': 'ghoul_bone.png'
        };

        const imgName = ID_TO_IMAGE[firstMatId] || `${firstMatId}.png`;
        return `${R2_URL}/images/materials/${raceFolder}/${imgName}`;
    }
    return null;
}

// 🔥 دالة الحسبة الموحدة للسلاح متطابقة مع محرك القتال 🔥
function calculateDisplayedDamage(weaponConfig, level) {
    if (!weaponConfig || level < 1) return 15;
    const base = weaponConfig.base_damage;
    const inc = weaponConfig.damage_increment;

    if (level <= 15) {
        return Math.floor(base + (inc * (level - 1)));
    } else {
        const damageAt15 = base + (inc * 14);
        const targetDamageAt30 = 1000; 
        const levelsRemaining = 15; 
        const dynamicIncrement = (targetDamageAt30 - damageAt15) / levelsRemaining;
        let finalDamage = damageAt15 + (dynamicIncrement * (level - 15));
        if (level >= 30) return targetDamageAt30;
        return Math.floor(finalDamage);
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('سلاح')
        .setDescription('يعرض تفاصيل سلاحك، أو سلاح عضو آخر، أو سلاح عرق معين.')
        .addUserOption(option =>
            option.setName('المستخدم')
            .setDescription('عرض سلاح مستخدم معين (اتركه فارغاً لعرض سلاحك)')
            .setRequired(false))
        .addStringOption(option =>
            option.setName('اسم-السلاح')
            .setDescription('البحث عن نوع سلاح أو عرق معين (مثل "تنين")')
            .setRequired(false)
            .setAutocomplete(true)),

    name: 'weapon-info',
    aliases: ['سلاح', 'شرح-سلاح', 'سلاحي'],
    category: "Economy",
    description: 'يعرض تفاصيل سلاحك، أو سلاح عضو آخر، أو سلاح عرق معين.',

    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused().toLowerCase();

        const filtered = weaponsConfig.filter(w => {
            const translatedRace = RACE_TRANSLATIONS.get(w.race) || '';
            return w.name.toLowerCase().includes(focusedValue) ||
                   w.race.toLowerCase().includes(focusedValue) ||
                   translatedRace.toLowerCase().includes(focusedValue);
        });

        await interaction.respond(
            filtered.slice(0, 25).map(w => ({
                name: `${w.emoji} ${w.name} (${RACE_TRANSLATIONS.get(w.race) || w.race})`,
                value: w.id
            }))
        );
    },

    async execute(interactionOrMessage, args) {

        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, guild, client, member;
        let targetMember, searchQuery;

        if (isSlash) {
            interaction = interactionOrMessage;
            guild = interaction.guild;
            client = interaction.client;
            member = interaction.member;

            targetMember = interaction.options.getMember('المستخدم');
            searchQuery = interaction.options.getString('اسم-السلاح');

            if (!targetMember && !searchQuery) {
                targetMember = member;
            }
            await interaction.deferReply();
        } else {
            message = interactionOrMessage;
            guild = message.guild;
            client = message.client;
            member = message.member;

            targetMember = message.mentions.members.first();
            searchQuery = args.length > 0 ? args.join(' ').toLowerCase() : null;

            if (!targetMember && !searchQuery) {
                 targetMember = member;
            } else if (targetMember) {
                 searchQuery = null;
            } else if (message.content.endsWith('سلاحي')) {
                 targetMember = member;
                 searchQuery = null;
            }
        }

        const reply = async (payload) => {
            if (isSlash) {
                return interaction.editReply(payload);
            } else {
                return message.channel.send(payload);
            }
        };

        const replyError = async (content) => {
            const payload = { content };
            if (isSlash) {
                payload.ephemeral = true;
                return interaction.editReply(payload);
            } else {
                return message.reply(payload);
            }
        };

        const db = client.sql;

        if (targetMember) {
            const user = targetMember.user;
            const cleanName = cleanDisplayName(user.displayName);

            const userRace = await getUserRace(targetMember, db);
            const weaponData = await getWeaponData(db, targetMember);

            if (!userRace) {
                return replyError(`❌ **${cleanName}** لا يمتلك عرقاً حالياً.`);
            }

            if (!weaponData) {
                return replyError(`❌ **${cleanName}** يمتلك عرق \`${userRace.raceName || userRace.racename}\` لكنه لم يصنع سلاحه الأساسي بعد من الحدادة.`);
            }

            const actualDamage = calculateDisplayedDamage(weaponData, weaponData.currentLevel);
            const weaponImage = getWeaponImageURL(weaponData.race);

            const description = [
                `✥ **الـعـرق:** \`${weaponData.race}\``,
                `✶ **المستوى الحالي:** \`Lv. ${weaponData.currentLevel} / ${weaponData.max_level}\``,
                `✶ **الضرر الحالي:** \`${actualDamage}\` DMG`,
            ].join('\n');

            const embed = new EmbedBuilder()
                .setTitle(`${weaponData.emoji} سلاح ${cleanName}`)
                .setColor(Colors.Green)
                .addFields(
                    { name: "✶ مواصفات السلاح الحالي", value: description }
                );

            if (weaponImage) {
                embed.setThumbnail(weaponImage);
            }

            return reply({ embeds: [embed] });

        } else if (searchQuery) {

            let finalQuery = searchQuery.toLowerCase();
            const arabicMatch = REVERSE_RACE_TRANSLATIONS.get(finalQuery);
            if (arabicMatch) {
                finalQuery = arabicMatch.toLowerCase();
            }

            const weapon = weaponsConfig.find(w => 
                w.id.toLowerCase() === finalQuery ||
                w.name.toLowerCase().includes(finalQuery) || 
                w.race.toLowerCase().includes(finalQuery)
            );

            if (!weapon) {
                return replyError('❌ لم أتمكن من العثور على سلاح أو عرق بهذا الاسم.');
            }

            const damageAt15 = calculateDisplayedDamage(weapon, 15);
            const damageAt30 = calculateDisplayedDamage(weapon, 30);
            const weaponImage = getWeaponImageURL(weapon.race);

            const description = [
                `✥ **الـعـرق:** \`${weapon.race}\``,
                `✶ **الضرر الأساسي (Lv.1):** \`${weapon.base_damage}\` DMG`,
                `✶ **الضرر في (Lv.15):** \`${damageAt15}\` DMG`,
                `✶ **الضرر عند الصحوة (Lv.30):** \`${damageAt30}\` DMG`,
                `✶ **أقصى مستوى:** \`Lv. ${weapon.max_level}\``,
            ].join('\n');

            const embed = new EmbedBuilder()
                .setTitle(`${weapon.emoji} ${weapon.name}`)
                .setColor(Colors.Blue)
                .addFields(
                    { name: "✶ المواصفات الأساسية", value: description },
                    { name: "✥ نظام الصحوة الإجباري", value: `ابتداءً من المستوى 16، سيتم توحيد قوة جميع الأسلحة لتصل إلى **1000 ضرر** في المستوى 30، لضمان توازن المعارك النهائية.` }
                );

            if (weaponImage) {
                embed.setThumbnail(weaponImage);
            }

            return reply({ embeds: [embed] });
        } else {
            return replyError('يرجى تحديد مستخدم أو اسم سلاح.');
        }
    }
};
