const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');

let arabicReshaper;
try {
    arabicReshaper = require('arabic-reshaper');
} catch (e) {}

function fixAr(text) {
    if (!arabicReshaper || typeof text !== 'string') return text;
    try {
        if (typeof arabicReshaper.reshape === 'function') return arabicReshaper.reshape(text);
        if (typeof arabicReshaper.convertArabic === 'function') return arabicReshaper.convertArabic(text);
        if (typeof arabicReshaper === 'function') return arabicReshaper(text);
        return text;
    } catch (err) {
        return text;
    }
}

try {
    GlobalFonts.registerFromPath(path.join(__dirname, '../fonts/bein-ar-normal.ttf'), 'Bein');
} catch (e) {}

function measureWrappedText(ctx, text, maxWidth) {
    const words = text.split(' ');
    let line = '';
    let lineCount = 1;
    for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        if (ctx.measureText(fixAr(testLine)).width > maxWidth && n > 0) {
            lineCount++;
            line = words[n] + ' ';
        } else {
            line = testLine;
        }
    }
    return lineCount;
}

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';
    let currentY = y;
    for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        if (ctx.measureText(fixAr(testLine)).width > maxWidth && n > 0) {
            ctx.fillText(fixAr(line), x, currentY);
            currentY += lineHeight;
            line = words[n] + ' ';
        } else {
            line = testLine;
        }
    }
    ctx.fillText(fixAr(line), x, currentY);
    return currentY + lineHeight;
}

function drawPremiumPanel(ctx, x, y, w, h, borderColor) {
    ctx.fillStyle = 'rgba(15, 20, 30, 0.85)';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 20);
    ctx.fill();

    ctx.lineWidth = 2;
    ctx.strokeStyle = borderColor;
    ctx.stroke();

    const highlight = ctx.createLinearGradient(x, y, x + w, y + h);
    highlight.addColorStop(0, 'rgba(255, 255, 255, 0.1)');
    highlight.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = highlight;
    ctx.fill();
}

async function generateGuideImage(type) {
    const width = 1200; 
    
    let mainTitle = '';
    let content = [];
    let themeColor = '#FFD700'; 

    if (type === 'rep') {
        mainTitle = "دليل السمعة والرتب";
        themeColor = '#00BFFF'; 
        content = [
            { title: 'كيف ترفع سمعتك', desc: 'تستطيع رفع سمعتك عن طريق التفاعل المستمر يوميا وإنجاز المهام اليومية والأسبوعية، أو بالحفاظ على الألقاب الملكية حتى نهاية اليوم.' },
            { title: 'التصنيفات الدائمة', desc: 'تبدأ رحلتك كمغامر مبتدئ بتصنيف منخفض وتتدرج حسب عدد النقاط التي تجمعها حتى تصل إلى أعلى رتبة عند وصولك لـ 1000 نقطة سمعة.' },
            { title: 'ضريبة الخمول', desc: 'لضمان بقاء الأقوى والأنشط، يتم خصم نقاط سمعة من أصحاب الرتب العالية أسبوعيا إذا لم يقوموا بالتفاعل داخل السيرفر.' }
        ];
    } 
    else if (type === 'kings_1' || type === 'kings_2') {
        mainTitle = "ألقاب الملوك";
        themeColor = '#FFD700'; 
        const allKings = [
            { title: 'ملك الكازينو', desc: 'سيد الثروة والمال الذي يطوع الحظ لخدمة خزائنه', req: 'تحقيق أعلى مجموع أرباح من ألعاب الكازينو خلال اليوم الحالي.', buff: 'يقتطع ضريبة لصالحه من أرباح جميع اللاعبين الآخرين.', rep: '🌟 +5 سمعة يومياً' },
            { title: 'ملك الهاوية', desc: 'المحارب الذي لم تهزه أهوال الظلام وقهر أعماق الدانجون', req: 'الوصول إلى أعمق طابق في الدانجون من بين جميع اللاعبين.', buff: 'يحصل على إعفاء كامل من تذاكر الدانجون ووقت الانتظار.', rep: '🌟 +4 سمعة يومياً' },
            { title: 'ملك البلاغة', desc: 'اكبر متفاعل طول فترة اليوم في الدردشة العامة', req: 'إرسال أكبر عدد إجمالي من الرسائل في الدردشة خلال اليوم الحالي.', buff: 'يتم مضاعفة نقاط الخبرة التي يحصل عليها من الرسائل.', rep: '🌟 +7 سمعة يومياً' },
            { title: 'ملك الكرم', desc: 'من غمر الرعايا بجوده وأصبح رمزا للعطاء في السيرفر', req: 'تحويل وتبرع بأكبر مبلغ إجمالي من عملة المورا للاعبين الآخرين خلال اليوم.', buff: 'يتم إعفاؤه بالكامل من أي رسوم أو ضرائب عند التحويل.', rep: '🌟 +1 سمعة يومياً' },
            
            // 🔥 التعديل للملوك الجدد 🔥
            { title: 'ملك الصوت', desc: 'سيد المجالس الذي يطرب بحديثه مسامع الإمبراطورية', req: 'قضاء أطول وقت ممكن في القنوات الصوتية خلال اليوم.', buff: 'يحصل على 3 فرص تزكية إضافية يومياً لمنحها للرعية.', rep: '🌟 +4 سمعة يومياً' },
            { title: 'ملك القنص', desc: 'الصياد الاعظم الذي خضعت له البحار وأخرجت كنوزها', req: 'اصطياد أكبر كمية من الأسماك بنجاح خلال اليوم الحالي.', buff: 'ترتفع نسبة حظه بشكل ملحوظ أثناء عمليات الصيد.', rep: '🌟 +2 سمعة يومياً' },
            { title: 'ملك النزاع', desc: 'الفارس الذي لا يقهر في الميدان وكلمته هي الفصل بالنزال', req: 'الانتصار بأكبر عدد من المعارك الحية ضد لاعبين آخرين خلال اليوم.', buff: 'يحصل على غنائم مورا إضافية من اللاعبين المهزومين.', rep: '🌟 +3 سمعة يومياً' },
            { title: 'ملك اللصوص', desc: 'سيد الظلال الذي يخترق أقوى الحصون ويسلب أغلى الكنوز', req: 'سرقة أكبر كمية من المورا بنجاح من اللاعبين الآخرين خلال اليوم.', buff: 'ميزة هروب الاشباح يتجنب الغرامة إذا أمسك به حارس الضحية.', rep: '🌟 +3 سمعة يومياً' }
        ];

        if (type === 'kings_1') {
            content = allKings.slice(0, 4);
            mainTitle += " - الجزء الأول";
        } else {
            content = allKings.slice(4, 8);
            mainTitle += " - الجزء الثاني";
        }
    } 
    else if (type === 'ach') {
        mainTitle = "الأوسمة والرتب التفاعلية";
        themeColor = '#FF8C00'; 
        content = [
            { title: 'وسام المهام اليومية', desc: 'يمنح للمغامر الذي ينهي معظم مهامه اليومية المطلوبة بنجاح قبل نهاية اليوم.' },
            { title: 'وسام المهام الأسبوعية', desc: 'يمنح للمغامر الذي يتمكن من إكمال أغلب مهامه الأسبوعية بنجاح قبل نهاية الأسبوع.' },
            { title: 'ثرثار الحانة', desc: 'رتبة مؤقتة تتجدد يوميا، تمنح لمن يثبت تفاعله القوي بإرسال 100 رسالة أو أكثر داخل قنوات الدردشة الرئيسية.' },
            { title: 'قاهر الفرسان', desc: 'وسام شجاعة يمنح للمقاتل الذي يتمكن من هزيمة فارس الإمبراطور أربع مرات خلال نفس اليوم.' }
        ];
    }

    const tempCanvas = createCanvas(width, 100);
    const tCtx = tempCanvas.getContext('2d');
    tCtx.direction = 'rtl';
    
    let totalHeight = 200; 
    const padding = 30;
    const textMaxWidth = width - 160;

    for (const item of content) {
        let itemHeight = padding * 2; 
        itemHeight += 45; 
        
        tCtx.font = '30px "Bein", sans-serif';
        itemHeight += measureWrappedText(tCtx, item.desc, textMaxWidth) * 45;

        if (item.req) {
            itemHeight += 15; 
            tCtx.font = 'bold 28px "Bein", sans-serif';
            itemHeight += measureWrappedText(tCtx, "طريقة الانتزاع: " + item.req, textMaxWidth) * 45;
        }
        if (item.buff) {
            itemHeight += 10; 
            tCtx.font = 'bold 28px "Bein", sans-serif';
            itemHeight += measureWrappedText(tCtx, "الميزة الملكية: " + item.buff, textMaxWidth) * 45;
        }
        if (item.rep) {
            itemHeight += 10;
            tCtx.font = 'bold 28px "Bein", sans-serif';
            itemHeight += measureWrappedText(tCtx, "الجائزة: " + item.rep, textMaxWidth) * 45;
        }
        
        item.calculatedHeight = itemHeight;
        totalHeight += itemHeight + 25; 
    }
    
    totalHeight += 50; 

    const canvas = createCanvas(width, totalHeight);
    const ctx = canvas.getContext('2d');
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';

    const bgGrad = ctx.createLinearGradient(0, 0, 0, totalHeight);
    bgGrad.addColorStop(0, '#0a0a0f');
    bgGrad.addColorStop(1, '#151520');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, totalHeight);

    ctx.lineWidth = 8;
    ctx.strokeStyle = themeColor;
    ctx.strokeRect(10, 10, width - 20, totalHeight - 20);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.strokeRect(22, 22, width - 44, totalHeight - 44);

    ctx.textAlign = 'center';
    ctx.fillStyle = themeColor;
    ctx.font = 'bold 60px "Bein", sans-serif';
    ctx.shadowColor = themeColor; 
    ctx.shadowBlur = 20;
    ctx.fillText(fixAr(mainTitle), width / 2, 90);
    ctx.shadowBlur = 0;

    const gradLine = ctx.createLinearGradient(width / 2 - 300, 0, width / 2 + 300, 0);
    gradLine.addColorStop(0, 'rgba(0,0,0,0)');
    gradLine.addColorStop(0.5, themeColor);
    gradLine.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradLine;
    ctx.fillRect(width / 2 - 300, 120, 600, 3);

    ctx.textAlign = 'right';
    let currentY = 170;

    for (const item of content) {
        drawPremiumPanel(ctx, 50, currentY, width - 100, item.calculatedHeight, 'rgba(255, 255, 255, 0.15)');

        let textY = currentY + 50;

        ctx.fillStyle = themeColor;
        ctx.font = 'bold 36px "Bein", sans-serif';
        ctx.fillText(fixAr(item.title), width - 80, textY);
        
        textY += 45; 

        ctx.fillStyle = '#E0E0E0';
        ctx.font = '30px "Bein", sans-serif';
        textY = drawWrappedText(ctx, item.desc, width - 80, textY, textMaxWidth, 45);

        if (item.req) {
            textY += 10;
            ctx.font = 'bold 28px "Bein", sans-serif';
            ctx.fillStyle = '#FF5555';
            ctx.fillText(fixAr("طريقة الانتزاع: "), width - 80, textY);
            
            const reqLabelWidth = ctx.measureText(fixAr("طريقة الانتزاع: ")).width;
            ctx.fillStyle = '#CCCCCC';
            ctx.font = '28px "Bein", sans-serif';
            textY = drawWrappedText(ctx, item.req, width - 80 - reqLabelWidth, textY, textMaxWidth - reqLabelWidth, 45);
        }

        if (item.buff) {
            ctx.font = 'bold 28px "Bein", sans-serif';
            ctx.fillStyle = '#00FF88';
            ctx.fillText(fixAr("الميزة الملكية: "), width - 80, textY);
            
            const buffLabelWidth = ctx.measureText(fixAr("الميزة الملكية: ")).width;
            ctx.fillStyle = '#CCCCCC';
            ctx.font = '28px "Bein", sans-serif';
            textY = drawWrappedText(ctx, item.buff, width - 80 - buffLabelWidth, textY, textMaxWidth - buffLabelWidth, 45);
        }

        if (item.rep) {
            ctx.font = 'bold 28px "Bein", sans-serif';
            ctx.fillStyle = '#00BFFF'; 
            ctx.fillText(fixAr("الجائزة: "), width - 80, textY);
            
            const repLabelWidth = ctx.measureText(fixAr("الجائزة: ")).width;
            ctx.fillStyle = '#FFD700'; 
            ctx.font = 'bold 28px "Bein", sans-serif';
            textY = drawWrappedText(ctx, item.rep, width - 80 - repLabelWidth, textY, textMaxWidth - repLabelWidth, 45);
        }

        currentY += item.calculatedHeight + 25;
    }

    return await canvas.encode('image/png');
}

module.exports = { generateGuideImage };
