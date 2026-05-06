module.exports = {
    // 1. نصوص المهام الفردية والإنجازات (تم ربطها في index.js)
    getQuestMessage: function(questType, userIdentifier, questName, rewardDetails, panelChannelLink, client) {
        // تعريف الإيموجيات الأساسية المأخوذة من الملف الرئيسي
        const EMOJI_WI = client?.EMOJI_WI || '<a:wi:1435572304988868769>';
        const EMOJI_WII = client?.EMOJI_WII || '<a:wii:1435572329039007889>';
        const EMOJI_FASTER = client?.EMOJI_FASTER || '<a:JaFaster:1435572430042042409>';
        const EMOJI_PRAY = client?.EMOJI_PRAY || '<:0Pray:1437067281493524502>';
        const EMOJI_COOL = client?.EMOJI_COOL || '<a:NekoCool:1435572459276337245>';

        if (questType === 'achievement') {
            return [
                `╭⭒★︰ ${EMOJI_WI} ${userIdentifier} ${EMOJI_WII}`,
                `✶ انـرت سمـاء الامـبراطـوريـة بإنجـازك ${EMOJI_FASTER}`,
                `✥ انـجـاز: **${questName}**`,
                ``,
                `- فـالتسـجل امبراطوريتـنـا اسمـك بيـن العظـمـاء ${EMOJI_PRAY}`,
                rewardDetails,
                panelChannelLink
            ].filter(Boolean).join('\n');
        } else {
            const typeText = questType === 'daily' ? 'يوميـة' : 'اسبوعيـة';
            return [
                `╭⭒★︰ ${EMOJI_WI} ${userIdentifier} ${EMOJI_WII}`,
                `✶ اتـممـت مهمـة ${typeText}`,
                `✥ الـمهـمـة: **${questName}**`,
                ``,
                `- لقـد أثبـت انـك احـد اركـان الامبراطـورية ${EMOJI_PRAY}`,
                `- لا يُكلـف مثـلك الا بالمستحيـل ${EMOJI_COOL} ~`,
                rewardDetails,
                panelChannelLink
            ].filter(Boolean).join('\n');
        }
    },

    // 2. نصوص الأوسمة (ختم المهام بالكامل)
    getBadgeMessage: function(questType, userIdentifier, client, panelChannelLink = "") {
        const EMOJI_WI = client?.EMOJI_WI || '<a:wi:1435572304988868769>';
        const EMOJI_WII = client?.EMOJI_WII || '<a:wii:1435572329039007889>';

        const typeText = questType === 'daily' ? 'اليوميـة' : 'الاسبوعيـة';
        const durationText = questType === 'daily' ? 'لباقـي اليوم' : 'طوال الاسبوع';
        
        return [
            `╭⭒★︰ ${EMOJI_WI} ${userIdentifier} ${EMOJI_WII}`,
            `✶ انجـزت مـهامك ${typeText} !`,
            `✥ حصـلت عـلى وسـام المـجد ${durationText}`,
            panelChannelLink
        ].filter(Boolean).join('\n');
    },

    // 3. نصوص انتزاع الملوك
    getKingMessage: function(userIdentifier, kingTitle, recordValue, client) {
        const EMOJI_WI = client?.EMOJI_WI || '<a:wi:1435572304988868769>';
        const EMOJI_WII = client?.EMOJI_WII || '<a:wii:1435572329039007889>';

        return [
            `╭⭒★︰ ${EMOJI_WI} ${userIdentifier} ${EMOJI_WII}`,
            `✶ رقمٌ يُكسر وعرشٌ يتبدل.. لقد فرضت سيطرتك واعتليت القمة`,
            `✥ انتزعت عـرش: **${kingTitle}**`,
            `- برقـم قيـاسـي: \`${recordValue}\``
        ].join('\n');
    }
};
