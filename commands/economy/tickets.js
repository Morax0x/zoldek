const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const path = require('path');

// ✅ المسار الصحيح: استدعاء دالة التذاكر ودالة الخيم معاً
const { manageTickets, manageCampfires } = require(path.join(process.cwd(), 'handlers/dungeon/utils.js'));

module.exports = {
    // ============================================================
    // 1. بيانات السلاش كوماند (Slash Command Data)
    // ============================================================
    data: new SlashCommandBuilder()
        .setName('tickets')
        .setDescription('عرض عدد تذاكر وخيم الدانجون المتوفرة')
        .addUserOption(option => 
            option.setName('user')
                .setDescription('الشخص الذي تريد رؤية تذاكره')
                .setRequired(false)
        ),

    // ============================================================
    // 2. خصائص الهاندلر
    // ============================================================
    name: 'tickets',
    // 🔥 تمت إضافة اختصارات الخيم هنا 🔥
    aliases: ['ticket', 'تذاكري', 'تذاكر', 'تذكرة', 'خيمة', 'خيم', 'مخيمات', 'camps', 'campfires'],
    category: "Economy", 
    description: 'عرض عدد تذاكر الدانجون والخيم المتوفرة وموعد التجديد.',
    usage: '-tickets [@user]',

    // ============================================================
    // 3. التنفيذ
    // ============================================================
    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, user, targetMember;

        // تجهيز المتغيرات بناءً على المصدر (سلاش أو رسالة)
        if (isSlash) {
            interaction = interactionOrMessage;
            user = interaction.user;
            targetMember = interaction.options.getMember('user') || interaction.member;
        } else {
            message = interactionOrMessage;
            user = message.author;
            targetMember = message.mentions.members.first() || message.member;
        }

        const client = interactionOrMessage.client;
        const sql = client.sql; 

        if (!sql) {
            console.error("❌ Error: SQL Database is not attached to Client.");
            return;
        }

        const targetUser = targetMember.user;

        // 1. جلب بيانات التذاكر (تمت إضافة await)
        const ticketData = await manageTickets(targetUser.id, interactionOrMessage.guild.id, sql, 'check', targetMember);

        // 2. 🔥 جلب بيانات الخيم 🔥 (تمت إضافة await)
        const campData = await manageCampfires(targetUser.id, interactionOrMessage.guild.id, sql, 'check', targetMember);

        // 3. حساب موعد التجديد (الساعة 12:00 ص بتوقيت السعودية)
        const now = new Date();
        const nextReset = new Date(now);
        nextReset.setUTCHours(21, 0, 0, 0); // 21:00 UTC = 00:00 KSA

        if (now > nextReset) {
            nextReset.setDate(nextReset.getDate() + 1);
        }

        const timestamp = Math.floor(nextReset.getTime() / 1000);

        // 4. تجهيز النصوص
        const titleText = targetUser.id === user.id ? 'عـدد تـذاكـرك' : `عـدد تـذاكـر ${targetUser.username}`;

        // 5. تصميم الإيمبد
        const embed = new EmbedBuilder()
            .setTitle('✥ تـذاكـر وخيـم الدانـجـون')
            .setColor('#E8271C') 
            .setThumbnail('https://i.postimg.cc/0jksK7N9/duti.png')
            .setDescription(
                `✶ ${titleText} ايـها المحـارب هـو **(${ticketData.tickets}/${ticketData.max})**\n\n` +
                `✶ كلـمـا ارتقـيـت بالامبراطـوريـة زادت تـذاكـرك 🎫\n\n` +
                `✶ عـدد الخيـم هو: (${campData.count}/${campData.max})⛺\n\n` + 
                `✶ تـتجـدد التذاكـر والخيم:\n <t:${timestamp}:R>`
            )
            .setFooter({ text: targetUser.username, iconURL: targetUser.displayAvatarURL() });

        // الإرسال
        if (isSlash) {
            await interaction.reply({ embeds: [embed] });
        } else {
            await message.channel.send({ embeds: [embed] });
        }
    },
};
