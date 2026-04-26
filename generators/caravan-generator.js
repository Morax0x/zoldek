const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');
const fs   = require('fs');

/* ═══════ تسجيل الخطوط ═══════ */
try {
    const fontsDir  = path.join(process.cwd(), 'fonts');
    const beinPath  = path.join(fontsDir, 'bein-ar-normal.ttf');
    const emojiPath = path.join(fontsDir, 'NotoEmoj.ttf');
    if (fs.existsSync(beinPath))  GlobalFonts.registerFromPath(beinPath,  'Bein');
    if (fs.existsSync(emojiPath)) GlobalFonts.registerFromPath(emojiPath, 'Emoji');
} catch {}

const F  = '"Bein","Arial",sans-serif';
const FE = '"Emoji","Arial",sans-serif';
const W  = 1400;
const H  = 780;

/* ══════════════════════════════════════════════════════
   ░░  HELPERS  ░░
══════════════════════════════════════════════════════ */

/** مستطيل بزوايا مستديرة */
function rr(ctx, x, y, w, h, r = 16) {
    if (w < 2*r) r = w/2;
    if (h < 2*r) r = h/2;
    ctx.beginPath();
    ctx.moveTo(x+r, y);
    ctx.arcTo(x+w, y,   x+w, y+h, r);
    ctx.arcTo(x+w, y+h, x,   y+h, r);
    ctx.arcTo(x,   y+h, x,   y,   r);
    ctx.arcTo(x,   y,   x+w, y,   r);
    ctx.closePath();
}

/** خلفية مشتركة: سماء ليلية + كثبان */
function drawNightBg(ctx, accent = '#FFD700') {
    /* سماء */
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0,   '#04050F');
    sky.addColorStop(0.55,'#090D20');
    sky.addColorStop(1,   '#180A04');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    /* نجوم */
    for (let i = 0; i < 180; i++) {
        const sx  = Math.random() * W;
        const sy  = Math.random() * H * 0.68;
        const sr  = Math.random() * 1.6 + 0.2;
        ctx.globalAlpha = Math.random() * 0.55 + 0.1;
        ctx.fillStyle   = '#FFFFFF';
        ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    /* قمر */
    const mx = 80, my = 70, mr = 38;
    const moonGrad = ctx.createRadialGradient(mx-8, my-8, 4, mx, my, mr);
    moonGrad.addColorStop(0, '#FFFDE8');
    moonGrad.addColorStop(0.6,'#FFE87A');
    moonGrad.addColorStop(1, 'rgba(255,230,80,0)');
    ctx.fillStyle   = moonGrad;
    ctx.shadowColor = '#FFE87A';
    ctx.shadowBlur  = 30;
    ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur  = 0;

    /* كثبان */
    ctx.fillStyle = '#1E0E04';
    ctx.beginPath();
    ctx.moveTo(0, H);
    ctx.bezierCurveTo(W*.12, H-100, W*.28, H-155, W*.5,  H-110);
    ctx.bezierCurveTo(W*.68, H-70,  W*.82, H-130, W, H-85);
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();

    ctx.fillStyle = '#140800';
    ctx.beginPath();
    ctx.moveTo(0, H);
    ctx.bezierCurveTo(W*.18, H-58, W*.42, H-95, W*.6, H-65);
    ctx.bezierCurveTo(W*.76, H-38, W*.9,  H-78, W, H-48);
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
}

/** رأس الصفحة: avatar + اسم + صندوق المورا */
async function drawHeader(ctx, user, title, mora = null, subtitle = '') {
    /* شريط أسود شبه شفاف */
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, W, 100);

    /* خط ذهبي أسفل الهيدر */
    const hLine = ctx.createLinearGradient(0, 0, W, 0);
    hLine.addColorStop(0,   'rgba(255,215,0,0)');
    hLine.addColorStop(0.5, 'rgba(255,215,0,0.9)');
    hLine.addColorStop(1,   'rgba(255,215,0,0)');
    ctx.fillStyle = hLine;
    ctx.fillRect(0, 98, W, 2);

    /* صورة المستخدم */
    try {
        const av = await loadImage(user.displayAvatarURL({ extension:'png', size:128 }));
        ctx.save();
        ctx.beginPath(); ctx.arc(52, 50, 36, 0, Math.PI*2); ctx.clip();
        ctx.drawImage(av, 16, 14, 72, 72);
        ctx.restore();
        ctx.strokeStyle='#FFD700'; ctx.lineWidth=2.5;
        ctx.shadowColor='#FFD700'; ctx.shadowBlur=10;
        ctx.beginPath(); ctx.arc(52,50,36,0,Math.PI*2); ctx.stroke();
        ctx.shadowBlur=0;
    } catch {}

    /* اسم المستخدم */
    ctx.font = `bold 22px ${F}`;
    ctx.fillStyle = '#FFD700';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(user.username, 100, subtitle ? 38 : 50);
    if (subtitle) {
        ctx.font = `16px ${F}`; ctx.fillStyle='#AABBCC';
        ctx.fillText(subtitle, 100, 62);
    }

    /* عنوان وسط */
    ctx.font = `bold 30px ${F}`;
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.shadowColor='rgba(255,215,0,0.4)'; ctx.shadowBlur=14;
    ctx.fillText(title, W/2, 50);
    ctx.shadowBlur=0;

    /* رصيد المورا */
    if (mora !== null) {
        const moraStr = `💰 ${Number(mora).toLocaleString()} مورا`;
        ctx.font = `bold 20px ${F}`;
        ctx.textAlign = 'right';
        ctx.fillStyle = '#FFD700';
        ctx.fillText(moraStr, W-30, 50);
    }
}

/** لوحة مع إطار ذهبي وزوايا مزخرفة */
function drawPanel(ctx, x, y, w, h, accent = '#FFD700', alpha = 0.92) {
    const g = ctx.createLinearGradient(x, y, x, y+h);
    g.addColorStop(0, `rgba(18,24,44,${alpha})`);
    g.addColorStop(1, `rgba(7,9,18,${alpha})`);
    rr(ctx, x, y, w, h, 16);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = accent + '55';
    ctx.lineWidth   = 1.5;
    rr(ctx, x, y, w, h, 16);
    ctx.stroke();

    /* زوايا مزخرفة */
    const cl = 18;
    ctx.strokeStyle = accent;
    ctx.lineWidth   = 2.5;
    ctx.shadowColor = accent;
    ctx.shadowBlur  = 10;
    ctx.beginPath();
    const corners = [
        [x,y+cl, x,y, x+cl,y],
        [x+w-cl,y, x+w,y, x+w,y+cl],
        [x+w,y+h-cl, x+w,y+h, x+w-cl,y+h],
        [x+cl,y+h, x,y+h, x,y+h-cl],
    ];
    corners.forEach(([x1,y1,x2,y2,x3,y3]) => {
        ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.lineTo(x3,y3);
    });
    ctx.stroke();
    ctx.shadowBlur = 0;
}

/** شريط تقدم */
function drawBar(ctx, x, y, w, h, pct, color, label = '') {
    rr(ctx, x, y, w, h, h/2);
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fill();
    const filled = Math.max(0, Math.min(1, pct)) * w;
    if (filled > 1) {
        const g = ctx.createLinearGradient(x, 0, x+w, 0);
        g.addColorStop(0, color+'88');
        g.addColorStop(1, color);
        rr(ctx, x, y, filled, h, h/2);
        ctx.fillStyle   = g;
        ctx.shadowColor = color;
        ctx.shadowBlur  = 12;
        ctx.fill();
        ctx.shadowBlur = 0;
    }
    if (label) {
        ctx.font      = `bold ${h+2}px ${F}`;
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, x+w/2, y+h/2);
    }
}

/** نجوم الترقية */
function stars(n, max = 5) {
    return '★'.repeat(Math.min(n,max)) + '☆'.repeat(Math.max(0,max-n));
}

/** نص يمين (عربي) */
function rt(ctx, text, x, y, size, color='#FFFFFF', bold=false) {
    ctx.font      = `${bold?'bold ':''}${size}px ${F}`;
    ctx.fillStyle = color;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
}

/** نص وسط */
function ct(ctx, text, x, y, size, color='#FFFFFF', bold=false) {
    ctx.font      = `${bold?'bold ':''}${size}px ${F}`;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
}

/** خط فاصل أفقي */
function divider(ctx, x, y, w, color='rgba(255,255,255,0.12)') {
    const g = ctx.createLinearGradient(x, 0, x+w, 0);
    g.addColorStop(0,   'transparent');
    g.addColorStop(0.2, color);
    g.addColorStop(0.8, color);
    g.addColorStop(1,   'transparent');
    ctx.strokeStyle = g;
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+w,y); ctx.stroke();
}

/** تصدير Buffer */
async function toBuffer(canvas) {
    const buf = await (canvas.encode ? canvas.encode('png') : canvas.toBuffer('image/png'));
    canvas.width = 0; canvas.height = 0;
    return buf;
}

const DEST_COLORS = {
    gold_city:        '#FFD700',
    magic_academy:    '#9B59FF',
    imperial_capital: '#DC143C',
    ancient_ruins:    '#CD853F',
    nature_valley:    '#2ECC71',
};

/* ─── كائن الـ helpers (يجب تعريفه قبل دوال الـ generator) ─── */
const _h = { rr, drawNightBg, drawHeader, drawPanel, drawBar, stars, rt, ct, divider, toBuffer, F, FE, W, H, DEST_COLORS };

/* ══════════════════════════════════════════════════════
   3.  CARAVAN STATUS  —  حالة الرحلة التفصيلية
══════════════════════════════════════════════════════ */
async function generateCaravanStatus(user, caravan, stats, destConfig) {
    const { drawNightBg, drawHeader, drawPanel, drawBar, rr, rt, ct, divider, stars, toBuffer, F, DEST_COLORS } = _h;
    const caravanConfig = require('../json/caravan-config.json');
    const now       = Date.now();
    const startTime = Number(caravan.starttime  || caravan.startTime  || now);
    const endTime   = Number(caravan.endtime    || caravan.endTime    || now);
    const progress  = Math.min(1, Math.max(0, (now-startTime)/(endTime-startTime)));
    const tleft     = Math.max(0, endTime-now);
    const hrs       = Math.floor(tleft/3600000);
    const mins      = Math.floor((tleft%3600000)/60000);
    const secs      = Math.floor((tleft%60000)/1000);
    const accent    = destConfig.color || '#FFD700';
    const atkRes    = Number(caravan.attackresolved || caravan.attackResolved || 0);
    const rewardM   = Number(caravan.rewardmultiplier || caravan.rewardMultiplier || 1.0);

    const canvas = createCanvas(W, H);
    const ctx    = canvas.getContext('2d');
    drawNightBg(ctx);
    await drawHeader(ctx, user, `${destConfig.emoji} ${destConfig.name}`, null,
        tleft<=0 ? '✅ وصلت — جارٍ توزيع المكافآت' : `⏳ ${hrs}س ${mins}د ${secs}ث متبقية`);

    /* ═══ منطقة الخريطة الكبيرة ═══ */
    const mapX=30, mapY=114, mapW=760, mapH=430;
    const mapBg=ctx.createLinearGradient(mapX,mapY,mapX+mapW,mapY+mapH);
    mapBg.addColorStop(0,'rgba(6,12,28,0.90)');
    mapBg.addColorStop(1,'rgba(3,6,14,0.95)');
    rr(ctx,mapX,mapY,mapW,mapH,18);
    ctx.fillStyle=mapBg; ctx.fill();
    ctx.strokeStyle=accent+'44'; ctx.lineWidth=1.5;
    rr(ctx,mapX,mapY,mapW,mapH,18); ctx.stroke();

    /* شبكة */
    ctx.strokeStyle='rgba(255,255,255,0.025)'; ctx.lineWidth=1;
    for(let gx=mapX;gx<mapX+mapW;gx+=65){ctx.beginPath();ctx.moveTo(gx,mapY);ctx.lineTo(gx,mapY+mapH);ctx.stroke();}
    for(let gy=mapY;gy<mapY+mapH;gy+=65){ctx.beginPath();ctx.moveTo(mapX,gy);ctx.lineTo(mapX+mapW,gy);ctx.stroke();}

    /* نقطتا البداية والنهاية */
    const oX=mapX+70, oY=mapY+mapH-60;
    const dX=mapX+mapW-70, dY=mapY+70;
    const cpX=(oX+dX)/2+30, cpY=(oY+dY)/2-60;

    /* موقع القافلة الآن على المنحنى */
    const t=progress;
    const cX=Math.round((1-t)*(1-t)*oX + 2*(1-t)*t*cpX + t*t*dX);
    const cY=Math.round((1-t)*(1-t)*oY + 2*(1-t)*t*cpY + t*t*dY);

    /* مسار كامل (شبح) */
    ctx.strokeStyle=accent+'22'; ctx.lineWidth=4; ctx.setLineDash([10,7]);
    ctx.beginPath(); ctx.moveTo(oX,oY); ctx.quadraticCurveTo(cpX,cpY,dX,dY); ctx.stroke();
    ctx.setLineDash([]);

    /* مسار مقطوع (تقدم) */
    const gradient=ctx.createLinearGradient(oX,oY,cX,cY);
    gradient.addColorStop(0,accent+'44'); gradient.addColorStop(1,accent);
    ctx.strokeStyle=gradient; ctx.lineWidth=5;
    ctx.shadowColor=accent; ctx.shadowBlur=16;
    ctx.beginPath(); ctx.moveTo(oX,oY); ctx.quadraticCurveTo(cpX,cpY,cX,cY); ctx.stroke();
    ctx.shadowBlur=0;

    /* نقطة البداية */
    ctx.fillStyle='#00FF88'; ctx.shadowColor='#00FF88'; ctx.shadowBlur=14;
    ctx.beginPath(); ctx.arc(oX,oY,10,0,Math.PI*2); ctx.fill();
    ctx.shadowBlur=0;
    ct(ctx,'🏠 البيت',oX,oY+26,16,'#88FFBB');

    /* نقطة الوجهة */
    ctx.fillStyle=accent; ctx.shadowColor=accent; ctx.shadowBlur=18;
    ctx.beginPath(); ctx.arc(dX,dY,13,0,Math.PI*2); ctx.fill();
    ctx.shadowBlur=0;
    ctx.font=`30px ${F}`; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(destConfig.emoji,dX,dY-38);
    ct(ctx,destConfig.name,dX,dY+28,16,accent,true);

    /* أيقونة القافلة المتحركة */
    ctx.font=`${atkRes===0&&(caravan.guardmessageid||caravan.guardMessageId)?'44':'52'}px ${F}`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.shadowColor=atkRes!==0&&atkRes===-1?'#FF0000':accent; ctx.shadowBlur=24;
    ctx.fillText(atkRes===0&&(caravan.guardmessageid||caravan.guardMessageId)?'⚔️':'🐪', cX, cY-8);
    ctx.shadowBlur=0;

    /* حالة الهجوم إذا وُجدت */
    if(atkRes===0&&(caravan.guardmessageid||caravan.guardMessageId)){
        const aw=200, ah=36, ax=cX-aw/2, ay=cY-60;
        rr(ctx,ax,ay,aw,ah,10);
        ctx.fillStyle='rgba(255,50,50,0.85)'; ctx.fill();
        ct(ctx,'⚔️ تحت الهجوم!',cX,ay+ah/2,16,'#FFFFFF',true);
    }

    /* ═══ اللوحة اليمنى: تفاصيل ═══ */
    const rx=800, ry=114, rw=570, rh=430;
    drawPanel(ctx,rx,ry,rw,rh,accent);

    let py=ry+30;
    ct(ctx,'📊 تفاصيل الرحلة',rx+rw/2,py,22,accent,true); py+=38;
    divider(ctx,rx+20,py,rw-40,accent+'55'); py+=22;

    /* الوجهة */
    ctx.font=`52px ${F}`; ctx.textAlign='right'; ctx.textBaseline='middle';
    ctx.shadowColor=accent; ctx.shadowBlur=14;
    ctx.fillText(destConfig.emoji,rx+rw-22,py+22);
    ctx.shadowBlur=0;
    rt(ctx,destConfig.name,rx+rw-82,py+10,21,accent,true);
    rt(ctx,destConfig.description,rx+rw-82,py+34,14,'#7A8A9A'); py+=62;

    divider(ctx,rx+20,py,rw-40); py+=18;

    /* التقدم */
    rt(ctx,`${(progress*100).toFixed(1)}%`,rx+rw-22,py+10,26,accent,true);
    rt(ctx,'التقدم:',rx+rw-22,py+36,16,'#8899AA'); py+=16;
    drawBar(ctx,rx+20,py,rw-40,20,progress,accent,`${(progress*100).toFixed(0)}%`); py+=34;

    /* الوقت */
    rt(ctx,tleft<=0?'وصلت!':`${hrs}س ${mins}د ${secs}ث`,rx+rw-22,py+12,20,tleft<=0?'#00FF88':'#CCDDEE',true);
    rt(ctx,'الوقت المتبقي:',rx+rw-22,py+34,15,'#8899AA'); py+=52;

    divider(ctx,rx+20,py,rw-40); py+=18;

    /* الحالة */
    const statusMap={
        '0_none': {t:'🟢 في الطريق',   c:'#00FF88'},
        '0_atk':  {t:'⚔️ تحت الهجوم!', c:'#FF4444'},
        '1':      {t:'🛡️ نجحت الحراسة',c:'#00BFFF'},
        '2':      {t:'😔 فشلت الحراسة',c:'#FFA500'},
        '-1':     {t:'💀 تم النهب',     c:'#FF2222'},
    };
    const stKey=atkRes===0?((caravan.guardmessageid||caravan.guardMessageId)?'0_atk':'0_none'):String(atkRes);
    const st=statusMap[stKey]||statusMap['0_none'];
    rt(ctx,st.t,rx+rw-22,py+12,20,st.c,true);
    rt(ctx,'الحالة:',rx+rw-22,py+34,15,'#8899AA'); py+=52;

    /* معامل المكافأة */
    const mColor=rewardM>=1?'#00FF88':rewardM>=0.7?'#FFD700':'#FF5555';
    rt(ctx,`×${rewardM.toFixed(2)}`,rx+rw-22,py+12,22,mColor,true);
    rt(ctx,'معامل المكافأة:',rx+rw-22,py+34,15,'#8899AA'); py+=52;

    divider(ctx,rx+20,py,rw-40); py+=18;

    /* الأدوات المجهزة */
    rt(ctx,'الأدوات المجهزة:',rx+rw-22,py,16,'#8899AA'); py+=24;
    const arts=JSON.parse(caravan.equippedartifacts||caravan.equippedArtifacts||'[]');
    if(!arts.length){ rt(ctx,'لا يوجد أدوات',rx+rw-22,py,15,'#445566'); py+=24; }
    else { arts.forEach(a=>{ rt(ctx,`• ${a}`,rx+rw-22,py,14,'#9AAABB'); py+=22; }); }

    /* ══ شريط التقدم السفلي ══ */
    const bY=H-100;
    ctx.fillStyle='rgba(0,0,0,0.65)'; ctx.fillRect(0,bY,W,100);
    divider(ctx,0,bY,W,accent+'55');
    drawBar(ctx,30,bY+18,W-60,26,progress,accent,`${(progress*100).toFixed(0)}%`);
    ct(ctx,tleft<=0?'✅ وصلت القافلة! سيتم التوزيع تلقائياً.':`⏱ الوصول: <t:${Math.floor(endTime/1000)}:R>`,
       W/2, bY+62, 18,'#AABBCC');

    return toBuffer(canvas);
}

/* ══════════════════════════════════════════════════════
   4.  UPGRADE PANEL
══════════════════════════════════════════════════════ */
async function generateUpgradePanel(user, stats, mora) {
    const { drawNightBg, drawHeader, drawPanel, drawBar, rr, ct, divider, stars, toBuffer, F, DEST_COLORS } = _h;
    const caravanConfig = require('../json/caravan-config.json');
    const canvas = createCanvas(W, H);
    const ctx    = canvas.getContext('2d');
    drawNightBg(ctx);
    await drawHeader(ctx, user, '🏗️ ترقية القافلة', mora, 'اختر نوع الترقية من القائمة');

    const upgs = Object.entries(caravanConfig.upgrades);
    const cw2=630, ch=270, gap=22;
    const gridX=(W-(2*cw2+gap))/2, gridY=120;
    const COLORS=['#FF9933','#00C3FF','#8888FF','#2ECC71'];

    upgs.forEach(([key,cfg],i)=>{
        const col=COLORS[i]||'#FFD700';
        const rank=Number(stats[`${key}_rank`]||1);
        const maxed=rank>=cfg.max_level;
        const cost=maxed?0:cfg.costs[rank];
        const cx3=gridX+(i%2)*(cw2+gap);
        const cy3=gridY+Math.floor(i/2)*(ch+gap);

        /* خلفية البطاقة */
        const bg=ctx.createLinearGradient(cx3,cy3,cx3,cy3+ch);
        bg.addColorStop(0,col+'1A'); bg.addColorStop(1,'rgba(5,8,18,0.95)');
        rr(ctx,cx3,cy3,cw2,ch,18);
        ctx.fillStyle=bg; ctx.fill();
        ctx.strokeStyle=maxed?col:col+'66'; ctx.lineWidth=maxed?2.5:1.5;
        ctx.shadowColor=maxed?col:'transparent'; ctx.shadowBlur=maxed?12:0;
        rr(ctx,cx3,cy3,cw2,ch,18); ctx.stroke();
        ctx.shadowBlur=0;

        /* أيقونة + اسم */
        ctx.font=`52px ${F}`; ctx.textAlign='left'; ctx.textBaseline='middle';
        ctx.fillText(cfg.emoji, cx3+22, cy3+54);

        ctx.font=`bold 26px ${F}`; ctx.fillStyle=col;
        ctx.textAlign='right'; ctx.fillText(cfg.name, cx3+cw2-22, cy3+40);

        ctx.font=`16px ${F}`; ctx.fillStyle='#8899AA';
        ctx.fillText(cfg.description, cx3+cw2-22, cy3+66);

        /* نجوم */
        ctx.font=`bold 28px ${F}`; ctx.fillStyle=col;
        ctx.shadowColor=col; ctx.shadowBlur=10;
        ctx.fillText(stars(rank), cx3+cw2-22, cy3+104);
        ctx.shadowBlur=0;
        ctx.font=`16px ${F}`; ctx.fillStyle='#667788';
        ctx.fillText(`لv.${rank} / لv.${cfg.max_level}`, cx3+cw2-22, cy3+130);

        /* شريط */
        drawBar(ctx, cx3+22, cy3+148, cw2-44, 14, rank/cfg.max_level, col);

        divider(ctx, cx3+22, cy3+178, cw2-44, col+'33');

        /* تكلفة الترقية */
        if (maxed) {
            ct(ctx,'✅ وصلت للحد الأقصى',cx3+cw2/2,cy3+215,18,'#00FF88',true);
        } else {
            ct(ctx,`⬆️ التكلفة: ${cost.toLocaleString()} مورا`,cx3+cw2/2,cy3+210,19,
               Number(mora)>=cost?'#FFD700':'#FF5555', true);
            const effect=key==='capacity'?`+${(cfg.bonus_per_level*100).toFixed(0)}% حمولة`
                :key==='speed'?`-${(cfg.time_reduction*100).toFixed(0)}% مدة`
                :key==='defense'?`-${(cfg.risk_reduction*100).toFixed(0)}% خطر`
                :`+${(cfg.bonus_per_level*100).toFixed(0)}% مكافآت`;
            ct(ctx,`التأثير: ${effect}`,cx3+cw2/2,cy3+238,15,'#8899AA');
        }
    });

    return toBuffer(canvas);
}

/* ══════════════════════════════════════════════════════
   5.  EQUIP PANEL
══════════════════════════════════════════════════════ */
async function generateEquipPanel(user, equipped, inventoryItems, allItems, mora) {
    const { drawNightBg, drawHeader, drawPanel, rr, ct, rt, divider, toBuffer, F } = _h;
    const RARITY_COLORS={Common:'#A8B8D0',Uncommon:'#2ECC71',Rare:'#00C3FF',Epic:'#B968FF',Legendary:'#FFD700'};
    const canvas = createCanvas(W, H);
    const ctx    = canvas.getContext('2d');
    drawNightBg(ctx);
    await drawHeader(ctx, user, '🔮 تجهيز القافلة (الحد: 3)', mora, 'اختر أداة من القائمة للتبديل');

    /* ── الفتحات المجهّزة (أعلى) ── */
    const slotW=380, slotH=150, slotGap=30;
    const slotStart=(W-(3*slotW+2*slotGap))/2;
    for(let s=0;s<3;s++){
        const sx=slotStart+s*(slotW+slotGap), sy=116;
        const itemId=equipped[s]||null;
        const item=itemId?allItems.find(x=>x.id===itemId):null;
        const col=item?(RARITY_COLORS[item.rarity]||'#AABBCC'):'#334455';

        drawPanel(ctx,sx,sy,slotW,slotH,col,0.88);
        ct(ctx,`فتحة ${s+1}`,sx+slotW/2,sy+22,16,'#556677');
        divider(ctx,sx+20,sy+38,slotW-40,col+'44');
        if(item){
            ctx.font=`32px ${F}`; ctx.textAlign='center'; ctx.textBaseline='middle';
            ctx.shadowColor=col; ctx.shadowBlur=12;
            ctx.fillText(item.type==='book'?'📖':'⚙️',sx+50,sy+90);
            ctx.shadowBlur=0;
            ct(ctx,item.name,sx+slotW/2+10,sy+72,17,col,true);
            ct(ctx,item.rarity,sx+slotW/2+10,sy+100,15,'#8899AA');
            const isMat=!item.type||item.type==='material';
            ct(ctx,isMat?`⚡ +${((item.rarity==='Legendary'?.20:item.rarity==='Epic'?.12:item.rarity==='Rare'?.08:item.rarity==='Uncommon'?.05:.03)*100).toFixed(0)}% سرعة`
                :`🍀 +${((item.rarity==='Legendary'?.20:item.rarity==='Epic'?.12:item.rarity==='Rare'?.08:item.rarity==='Uncommon'?.05:.03)*100).toFixed(0)}% حظ`,
                sx+slotW/2,sy+126,14,col);
        } else {
            ctx.globalAlpha=0.25;
            ctx.font=`48px ${F}`; ctx.textAlign='center'; ctx.textBaseline='middle';
            ctx.fillText('➕',sx+slotW/2,sy+slotH/2+6);
            ctx.globalAlpha=1;
            ct(ctx,'فارغة',sx+slotW/2,sy+slotH-20,14,'#334455');
        }
    }

    /* ── ملخص البافات ── */
    const { getEquippedBuffs } = require('../handlers/caravan-core.js');
    const buffs = getEquippedBuffs(equipped);
    const sumY=282, sumH=60;
    const sumBg=ctx.createLinearGradient(30,sumY,W-30,sumY);
    sumBg.addColorStop(0,'rgba(0,195,255,0.08)'); sumBg.addColorStop(1,'rgba(46,204,113,0.08)');
    rr(ctx,30,sumY,W-60,sumH,12);
    ctx.fillStyle=sumBg; ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,0.1)'; ctx.lineWidth=1;
    rr(ctx,30,sumY,W-60,sumH,12); ctx.stroke();

    ct(ctx,`⚡ إجمالي بافات السرعة: +${(buffs.speedBuff*100).toFixed(0)}%  |  🍀 إجمالي بافات الحظ: +${(buffs.luckBuff*100).toFixed(0)}%`,
       W/2, sumY+sumH/2, 20, '#CCDDEE', true);

    /* ── شبكة المخزون ── */
    divider(ctx, 30, 356, W-60, 'rgba(255,255,255,0.15)');
    ct(ctx,'📦 مخزنك — اختر أداة للتبديل', W/2, 376, 20,'#FFD700',true);

    const iw=200, ih=110, igap=14, cols=6;
    const igridW=cols*iw+(cols-1)*igap;
    const igridX=(W-igridW)/2;
    const maxShow=Math.min(inventoryItems.length,18);

    for(let i=0;i<maxShow;i++){
        const iv=inventoryItems[i];
        const item2=allItems.find(x=>x.id===(iv.itemid||iv.itemID));
        const col2=item2?(RARITY_COLORS[item2.rarity]||'#AABBCC'):'#334455';
        const isEq=equipped.includes(iv.itemid||iv.itemID);
        const ix2=igridX+(i%cols)*(iw+igap);
        const iy2=398+Math.floor(i/cols)*(ih+igap);

        const ibg=ctx.createLinearGradient(ix2,iy2,ix2,iy2+ih);
        ibg.addColorStop(0,col2+(isEq?'33':'14'));
        ibg.addColorStop(1,'rgba(5,8,18,0.92)');
        rr(ctx,ix2,iy2,iw,ih,10);
        ctx.fillStyle=ibg; ctx.fill();
        ctx.strokeStyle=isEq?col2:col2+'44'; ctx.lineWidth=isEq?2:1;
        if(isEq){ctx.shadowColor=col2; ctx.shadowBlur=10;}
        rr(ctx,ix2,iy2,iw,ih,10); ctx.stroke();
        ctx.shadowBlur=0;

        if(isEq){ct(ctx,'✅',ix2+18,iy2+18,16,'#00FF88');}
        ct(ctx,item2?.type==='book'?'📖':'⚙️', ix2+iw/2, iy2+36, 26,'#FFFFFF');
        ct(ctx,(item2?.name||iv.itemid||iv.itemID).substring(0,10), ix2+iw/2, iy2+68, 13,col2,true);
        ct(ctx,item2?.rarity||'?', ix2+iw/2, iy2+88, 12,'#667788');
    }

    return toBuffer(canvas);
}

/* ══════════════════════════════════════════════════════
   2.  SEND MAP  —  خريطة اختيار الوجهة
══════════════════════════════════════════════════════ */
async function generateSendMap(user, stats, mora) {
    const { drawNightBg, drawHeader, drawPanel, drawBar, rr, rt, ct, divider, toBuffer, F, DEST_COLORS } = _h;
    const caravanConfig = require('../json/caravan-config.json');
    const { calcDuration, calcRiskFactor, getEquippedBuffs } = require('../handlers/caravan-core.js');

    const canvas = createCanvas(W, H);
    const ctx    = canvas.getContext('2d');
    drawNightBg(ctx);
    await drawHeader(ctx, user, '🗺️ اختر وجهة القافلة', mora, 'اختر وجهتك بالقائمة أدناه');

    /* ── منطقة الخريطة ── */
    const mapX=30, mapY=112, mapW=W-60, mapH=360;
    const mapBg=ctx.createLinearGradient(mapX,mapY,mapX,mapY+mapH);
    mapBg.addColorStop(0,'rgba(8,15,35,0.85)');
    mapBg.addColorStop(1,'rgba(4,8,16,0.90)');
    rr(ctx,mapX,mapY,mapW,mapH,18);
    ctx.fillStyle=mapBg; ctx.fill();
    ctx.strokeStyle='rgba(255,215,0,0.2)'; ctx.lineWidth=1.5;
    rr(ctx,mapX,mapY,mapW,mapH,18); ctx.stroke();

    /* شبكة خفيفة */
    ctx.strokeStyle='rgba(255,255,255,0.03)'; ctx.lineWidth=1;
    for(let gx=mapX;gx<mapX+mapW;gx+=70){ctx.beginPath();ctx.moveTo(gx,mapY);ctx.lineTo(gx,mapY+mapH);ctx.stroke();}
    for(let gy=mapY;gy<mapY+mapH;gy+=70){ctx.beginPath();ctx.moveTo(mapX,gy);ctx.lineTo(mapX+mapW,gy);ctx.stroke();}

    /* نقطة البيت */
    const homeX=120, homeY=mapY+mapH-60;
    ctx.fillStyle='#00FF88'; ctx.shadowColor='#00FF88'; ctx.shadowBlur=14;
    ctx.beginPath(); ctx.arc(homeX,homeY,10,0,Math.PI*2); ctx.fill();
    ctx.shadowBlur=0;
    ctx.font=`18px ${F}`; ctx.textAlign='center'; ctx.fillStyle='#88FFBB';
    ctx.fillText('🏠 البيت',homeX,homeY+22);

    /* وجهات على الخريطة */
    const dests = caravanConfig.destinations;
    const nodePositions = [
        {x:900, y:mapY+60},
        {x:680, y:mapY+160},
        {x:1120,y:mapY+200},
        {x:480, y:mapY+80},
        {x:340, y:mapY+220},
    ];

    const buffs = getEquippedBuffs([]);
    dests.forEach((d,i)=>{
        const np=nodePositions[i]||{x:500+i*120,y:mapY+120};
        const col=d.color||'#FFD700';

        /* مسار من البيت */
        const cpx=(homeX+np.x)/2, cpy=mapY+mapH*0.3;
        ctx.strokeStyle=col+'44'; ctx.lineWidth=2; ctx.setLineDash([6,5]);
        ctx.beginPath(); ctx.moveTo(homeX,homeY);
        ctx.quadraticCurveTo(cpx,cpy,np.x,np.y); ctx.stroke();
        ctx.setLineDash([]);

        /* هالة العقدة */
        const halo=ctx.createRadialGradient(np.x,np.y,4,np.x,np.y,38);
        halo.addColorStop(0,col+'55'); halo.addColorStop(1,'transparent');
        ctx.fillStyle=halo;
        ctx.beginPath(); ctx.arc(np.x,np.y,38,0,Math.PI*2); ctx.fill();

        /* نقطة */
        ctx.fillStyle=col; ctx.shadowColor=col; ctx.shadowBlur=18;
        ctx.beginPath(); ctx.arc(np.x,np.y,12,0,Math.PI*2); ctx.fill();
        ctx.shadowBlur=0;

        /* أيقونة */
        ctx.font=`26px ${F}`; ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText(d.emoji, np.x, np.y-32);

        /* اسم */
        ctx.font=`bold 16px ${F}`; ctx.fillStyle='#FFFFFF'; ctx.textAlign='center';
        ctx.fillText(d.name, np.x, np.y+28);
    });

    /* ── بطاقات الوجهات (أسفل) ── */
    const cardY=mapY+mapH+14, cardH=228, cardW=240, cardGap=14;
    const totalW=dests.length*cardW+(dests.length-1)*cardGap;
    const startX=(W-totalW)/2;

    dests.forEach((d,i)=>{
        const cx2=startX+i*(cardW+cardGap);
        const col=d.color||'#FFD700';
        const bg2=ctx.createLinearGradient(cx2,cardY,cx2,cardY+cardH);
        bg2.addColorStop(0,col+'22'); bg2.addColorStop(1,'rgba(5,8,18,0.95)');
        rr(ctx,cx2,cardY,cardW,cardH,14);
        ctx.fillStyle=bg2; ctx.fill();
        ctx.strokeStyle=col+'88'; ctx.lineWidth=1.5;
        rr(ctx,cx2,cardY,cardW,cardH,14); ctx.stroke();

        /* أيقونة */
        ctx.font=`44px ${F}`; ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.shadowColor=col; ctx.shadowBlur=16;
        ctx.fillText(d.emoji, cx2+cardW/2, cardY+44);
        ctx.shadowBlur=0;

        /* اسم */
        ct(ctx, d.name, cx2+cardW/2, cardY+84, 17, col, true);

        /* تفاصيل */
        const adjDur=calcDuration(d,{speed_rank:1},{speedBuff:0});
        const adjRisk=calcRiskFactor(d,{defense_rank:1});
        const hrs2=Math.floor(adjDur/3600000);
        const mins2=Math.floor((adjDur%3600000)/60000);

        const lines=[
            {label:`⏱ ${hrs2}س ${mins2}د`,           color:'#CCDDEE'},
            {label:`⚠️ ${(adjRisk*100).toFixed(0)}% خطر`, color: adjRisk>=0.35?'#FF6644':'#FFAA44'},
            {label:`💰 ${d.cost.toLocaleString()} مورا`,  color:'#FFD700'},
        ];
        let ly2=cardY+114;
        lines.forEach(l=>{
            ct(ctx,l.label,cx2+cardW/2,ly2,15,l.color);
            ly2+=26;
        });

        /* نوع المكافأة */
        const typeMap={mora:'🟡 مورا',xp:'✨ خبرة',reputation:'🌟 سمعة',artifact:'📦 تحف',nature:'🌱 طبيعة'};
        ct(ctx,typeMap[d.reward_type]||'?', cx2+cardW/2, cardY+cardH-20, 14,'#8899AA');
    });

    return toBuffer(canvas);
}

/* ══════════════════════════════════════════════════════
   1.  HUB  —  الشاشة الرئيسية
══════════════════════════════════════════════════════ */
async function generateCaravanHub(user, stats, activeCaravan, mora) {
    const { rr, drawNightBg, drawHeader, drawPanel, drawBar, stars, rt, ct, divider, toBuffer, F } = _h;
    const canvas = createCanvas(W, H);
    const ctx    = canvas.getContext('2d');
    drawNightBg(ctx);
    await drawHeader(ctx, user, '✦ نظام القوافل الإمبراطوري ✦', mora, `رحلات ناجحة: ${stats.successful_trips||0} / ${stats.total_trips||0}`);

    const now = Date.now();

    /* ── الجانب الأيسر: ترقيات القافلة ── */
    const lx = 30, ly = 118, lw = 340, lh = 520;
    drawPanel(ctx, lx, ly, lw, lh, '#FFD700');

    ct(ctx, '🏗️ مستوى الترقيات', lx+lw/2, ly+34, 22, '#FFD700', true);
    divider(ctx, lx+20, ly+58, lw-40);

    const upgrades = [
        { emoji:'📦', name:'الحمولة', key:'capacity_rank', color:'#FF9933' },
        { emoji:'⚡', name:'السرعة',  key:'speed_rank',    color:'#00C3FF' },
        { emoji:'🛡️', name:'الدرع',   key:'defense_rank',  color:'#8888FF' },
        { emoji:'🍀', name:'الحظ',    key:'luck_rank',     color:'#2ECC71' },
    ];
    let uy = ly + 82;
    for (const u of upgrades) {
        const rank = Number(stats[u.key] || 1);
        /* بطاقة الترقية */
        const ux = lx+18, uw = lw-36, uh = 98;
        const bg = ctx.createLinearGradient(ux, uy, ux+uw, uy+uh);
        bg.addColorStop(0, 'rgba(255,255,255,0.04)');
        bg.addColorStop(1, 'rgba(255,255,255,0.01)');
        rr(ctx, ux, uy, uw, uh, 12);
        ctx.fillStyle = bg; ctx.fill();
        ctx.strokeStyle = u.color+'44'; ctx.lineWidth=1;
        rr(ctx, ux, uy, uw, uh, 12); ctx.stroke();

        /* أيقونة + اسم */
        ctx.font=`32px ${F}`; ctx.textAlign='right'; ctx.textBaseline='middle';
        ctx.fillText(u.emoji, ux+uw-12, uy+32);
        rt(ctx, u.name, ux+uw-52, uy+32, 20, '#FFFFFF', true);

        /* نجوم */
        ctx.font=`bold 22px ${F}`; ctx.textAlign='right';
        ctx.fillStyle=u.color; ctx.shadowColor=u.color; ctx.shadowBlur=8;
        ctx.fillText(stars(rank), ux+uw-12, uy+68);
        ctx.shadowBlur=0;

        /* شريط مستوى */
        drawBar(ctx, ux+12, uy+78, uw-24, 10, rank/5, u.color);
        uy += 110;
    }

    /* ── المنتصف: رسمة القافلة الكبيرة ── */
    const cx = 400, cy = 140, cw = 580;

    /* هالة */
    const halo = ctx.createRadialGradient(cx+cw/2, 400, 40, cx+cw/2, 400, 220);
    halo.addColorStop(0, 'rgba(255,215,0,0.12)');
    halo.addColorStop(1, 'rgba(255,215,0,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(cx, cy, cw, H-cy-80);

    /* جمل كبير */
    ctx.font=`180px ${F}`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.shadowColor='#FFD700'; ctx.shadowBlur=40;
    ctx.fillText('🐪', cx+cw/2, 390);
    ctx.shadowBlur=0;

    /* عنوان تحت الجمل */
    ct(ctx, 'قافلتك الإمبراطورية', cx+cw/2, 510, 24, '#FFD70099');

    /* ── الجانب الأيمن: الرحلة النشطة أو "لا رحلة" ── */
    const rx = 1010, ry = 118, rw = 360, rh = 520;
    const caravanConfig = require('../json/caravan-config.json');

    if (activeCaravan) {
        const destId = activeCaravan.destinationid || activeCaravan.destinationId;
        const dest   = caravanConfig.destinations.find(d=>d.id===destId) || {};
        const start  = Number(activeCaravan.starttime  || activeCaravan.startTime  || now);
        const end    = Number(activeCaravan.endtime    || activeCaravan.endTime    || now);
        const prog   = Math.min(1, Math.max(0,(now-start)/(end-start)));
        const tleft  = Math.max(0, end-now);
        const hrs    = Math.floor(tleft/3600000);
        const mins   = Math.floor((tleft%3600000)/60000);
        const accent = dest.color || '#FFD700';

        drawPanel(ctx, rx, ry, rw, rh, accent);
        ct(ctx, '🗺️ رحلة نشطة', rx+rw/2, ry+34, 22, accent, true);
        divider(ctx, rx+20, ry+58, rw-40, accent+'55');

        ctx.font=`72px ${F}`; ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.shadowColor=accent; ctx.shadowBlur=20;
        ctx.fillText(dest.emoji||'🚀', rx+rw/2, ry+130);
        ctx.shadowBlur=0;

        ct(ctx, dest.name||'وجهة مجهولة', rx+rw/2, ry+195, 22, '#FFFFFF', true);
        divider(ctx, rx+20, ry+218, rw-40);

        const atkRes = Number(activeCaravan.attackresolved||activeCaravan.attackResolved||0);
        let statusText='🟢 في الطريق', statusColor='#00FF88';
        if (atkRes===0 && (activeCaravan.guardmessageid||activeCaravan.guardMessageId))
            { statusText='⚔️ تحت الهجوم!'; statusColor='#FF4444'; }
        else if (atkRes===1)  { statusText='🛡️ نجحت الحراسة'; statusColor='#00BFFF'; }
        else if (atkRes===2)  { statusText='😔 فشلت الحراسة'; statusColor='#FFA500'; }
        else if (atkRes===-1) { statusText='💀 تم النهب';    statusColor='#FF2222'; }

        ct(ctx, statusText, rx+rw/2, ry+252, 20, statusColor, true);

        /* شريط التقدم */
        rt(ctx, `${(prog*100).toFixed(0)}%`, rx+rw-20, ry+296, 18, accent, true);
        drawBar(ctx, rx+20, ry+308, rw-40, 18, prog, accent, `${(prog*100).toFixed(0)}%`);

        ct(ctx, `⏳ ${hrs}س ${mins}د متبقي`, rx+rw/2, ry+345, 18, '#CCDDEE');
        ct(ctx, `<t:${Math.floor(end/1000)}:R>`, rx+rw/2, ry+370, 16, '#8899AA');

        divider(ctx, rx+20, ry+395, rw-40);
        ct(ctx, '📊 إحصائيات', rx+rw/2, ry+422, 18, '#FFD700', true);
        const rewardMulti = Number(activeCaravan.rewardmultiplier||activeCaravan.rewardMultiplier||1);
        ct(ctx, `معامل المكافأة: ×${rewardMulti.toFixed(2)}`, rx+rw/2, ry+452, 16, '#AABBCC');

        const artifacts = JSON.parse(activeCaravan.equippedartifacts||activeCaravan.equippedArtifacts||'[]');
        ct(ctx, `الأدوات المجهزة: ${artifacts.length}/3`, rx+rw/2, ry+478, 16, '#AABBCC');
    } else {
        drawPanel(ctx, rx, ry, rw, rh, '#445566');
        ct(ctx, '📭 لا توجد رحلة نشطة', rx+rw/2, ry+34, 20, '#778899', true);
        divider(ctx, rx+20, ry+58, rw-40, '#33445566');

        ctx.font=`80px ${F}`; ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.globalAlpha=0.3;
        ctx.fillText('🏜️', rx+rw/2, ry+160);
        ctx.globalAlpha=1;

        ct(ctx, 'أرسل قافلتك الآن', rx+rw/2, ry+240, 22, '#556677', true);
        ct(ctx, 'واجمع الثروات والمكافآت', rx+rw/2, ry+272, 17, '#445566');
        divider(ctx, rx+20, ry+310, rw-40, '#33445566');

        ct(ctx, `📊 الرحلات الكلية: ${stats.total_trips||0}`, rx+rw/2, ry+348, 18, '#667788');
        ct(ctx, `✅ الناجحة: ${stats.successful_trips||0}`, rx+rw/2, ry+378, 18, '#557766');
        const successRate = stats.total_trips > 0
            ? ((stats.successful_trips/stats.total_trips)*100).toFixed(0) : '0';
        ct(ctx, `🏆 نسبة النجاح: ${successRate}%`, rx+rw/2, ry+408, 18, '#667744');
    }

    /* ── شريط الأوامر أسفل ── */
    ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.fillRect(0, H-78, W, 78);
    divider(ctx, 0, H-78, W, 'rgba(255,215,0,0.35)');
    const btns=[
        {label:'📤 إرسال رحلة', color:'#FFD700'},
        {label:'🗺️ الحالة',     color:'#00C3FF'},
        {label:'🏗️ الترقيات',  color:'#9B59FF'},
        {label:'🔮 التجهيز',    color:'#2ECC71'},
    ];
    const bw=300, gap=28, bstart=(W-(btns.length*bw+(btns.length-1)*gap))/2;
    btns.forEach((b,i)=>{
        const bx=bstart+i*(bw+gap), by=H-65, bh=46;
        const bg2=ctx.createLinearGradient(bx,by,bx+bw,by);
        bg2.addColorStop(0,b.color+'22'); bg2.addColorStop(1,b.color+'11');
        rr(ctx,bx,by,bw,bh,10);
        ctx.fillStyle=bg2; ctx.fill();
        ctx.strokeStyle=b.color+'88'; ctx.lineWidth=1.5;
        rr(ctx,bx,by,bw,bh,10); ctx.stroke();
        ct(ctx,b.label,bx+bw/2,by+bh/2,18,b.color,true);
    });

    return toBuffer(canvas);
}

module.exports = {
    /* سيُضاف لاحقاً */
    generateCaravanHub,
    generateSendMap,
    generateCaravanStatus,
    generateUpgradePanel,
    generateEquipPanel,
    _h,
};
