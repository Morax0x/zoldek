const { ContextMenuCommandBuilder, ApplicationCommandType, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require("discord.js");
const { getReportSettings, hasReportPermission, processReportLogic, sendReportError } = require("../../handlers/report-handler.js");

// (هذا هو المودال (النافذة المنبثقة) الذي يظهر)
class ReportModal extends ModalBuilder {
    constructor(targetMember, message) {
        super();
        this.setCustomId(`report_modal_${targetMember.id}_${message.id}`);
        this.setTitle('نموذج تقديم البلاغ');

        const reasonInput = new TextInputBuilder()
            .setCustomId('report_reason')
            .setLabel("سبب البلاغ (مطلوب)")
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder("اذكر سبب البلاغ بالتفصيل...")
            .setMaxLength(500)
            .setRequired(true);

        this.addComponents(new ActionRowBuilder().addComponents(reasonInput));
    }
}

module.exports = {
    data: new ContextMenuCommandBuilder()
        .setName('تقديم بلاغ')
        .setType(ApplicationCommandType.Message),

    async execute(interaction) {

        const client = interaction.client;
        const db = client.sql; // تم التغيير إلى db ليتوافق مع أسلوبنا
        const message = interaction.targetMessage; // الرسالة التي تم الضغط عليها

        // --- ( 🌟 تم إصلاح الكود هنا 🌟 ) ---
        const targetUser = message.author; // (1. جلب اليوزر (لا يمكن أن يكون فارغاً))
        let targetMember; // (2. جلب العضو)

        try {
            targetMember = await interaction.guild.members.fetch(targetUser.id);
        } catch (e) {
            console.error("Failed to fetch member for report:", e);
            return interaction.reply({ content: "لا يمكن التبليغ عن هذا العضو، ربما غادر السيرفر.", ephemeral: true });
        }
        // --- ( 🌟 نهاية الإصلاح 🌟 ) ---

        // (التحقق من الإعدادات والصلاحيات)
        // ⚠️ ملاحظة: تم إضافة await لأن PostgreSQL يتطلب عمليات غير متزامنة
        const settings = await getReportSettings(db, interaction.guildId);
        
        if (!settings || !settings.logChannelID) {
            return interaction.reply({ content: "يجب على المسؤول إعداد البوت أولاً باستخدام أمر `/اعدادات-البلاغات`.", ephemeral: true });
        }
        
        if (!(await hasReportPermission(db, interaction.member))) {
             return interaction.reply({ content: "ليس لديك صلاحية استخدام هذا الأمر.", ephemeral: true });
        }

        // (قواعد الرفض السريعة)
        if (targetMember.id === interaction.user.id) {
            return sendReportError(interaction, "❖ بـلاغ مـرفـوض", "يـليـل وبعدين معـاك تـبـي تبـلغ عـلى نفـسك ؟ مجـنون انـت؟؟", true);
        }
        if (targetMember.user.bot) {
            return sendReportError(interaction, "❖ تـم رفـض بـلاغـك !", "تحـاول تـبلغ على بـوت ؟؟ صـاحي انـت اقول قم انذلف", true);
        }

        // (إظهار المودال)
        const modal = new ReportModal(targetMember, message);
        await interaction.showModal(modal);

        // (انتظار إرسال المودال)
        try {
            const modalSubmit = await interaction.awaitModalSubmit({
                time: 300000, // 5 دقائق
                filter: i => i.customId === modal.data.custom_id && i.user.id === interaction.user.id,
            });

            // (استخدام deferReply هنا بدلاً من الـ handler الرئيسي)
            await modalSubmit.deferReply({ ephemeral: true });

            const reason = modalSubmit.fields.getTextInputValue('report_reason');
            const messageLink = message.url;

            // (استدعاء المنطق الرئيسي)
            await processReportLogic(client, modalSubmit, targetMember, reason, messageLink);

        } catch (e) {
            if (e.code === 'InteractionCollectorError') {
                // (انتهى الوقت)
            } else {
                console.error("Report modal error:", e);
            }
        }
    }
};
