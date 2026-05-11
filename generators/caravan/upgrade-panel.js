const {
    createCanvas, W, H, C, FE,
    drawBg, drawHeader, drawCornerAccents, drawPanel,
    drawBar, drawStars, divLine,
    toBuf,
    R, M, L, rr,
} = require('./shared');

async function generateUpgradePanel(user, stats, mora) {
    const cfg    = require('../../json/caravan-config.json');
    const canvas = createCanvas(W, H);
    const ctx    = canvas.getContext('2d');
    await drawBg(ctx, 'hubbg');
    await drawHeader(ctx, 'مركز تطوير القوافل');
    drawCornerAccents(ctx);

    const upgList = [
        { key: 'capacity_rank', name: cfg.upgrades.capacity.name, emoji: '❤️',
          max_level: cfg.upgrades.capacity.max_level, costs: cfg.upgrades.capacity.costs,
          effectLabel: `+${cfg.upgrades.capacity.hp_per_level} HP لكل مستوى (يبدأ من ${cfg.upgrades.capacity.base_hp})`,
          col: '#FF4466' },
        { key: 'speed_rank',    name: cfg.upgrades.speed.name,    emoji: '⚡',
          max_level: cfg.upgrades.speed.max_level,    costs: cfg.upgrades.speed.costs,
          effectLabel: `${(cfg.upgrades.speed.time_reduction * 100).toFixed(0)}% وقت أقل للمستوى (حد ${cfg.upgrades.speed.max_level}%)`,
          col: '#00C3FF' },
        { key: 'defense_rank',  name: cfg.upgrades.defense.name,  emoji: '🛡️',
          max_level: cfg.upgrades.defense.max_level,  costs: cfg.upgrades.defense.costs,
          effectLabel: `${(cfg.upgrades.defense.risk_reduction * 100).toFixed(0)}% خطر أقل للمستوى (حد ${cfg.upgrades.defense.max_level}%)`,
          col: '#8888FF' },
        { key: 'luck_rank',     name: cfg.upgrades.luck.name,     emoji: '🍀',
          max_level: cfg.upgrades.luck.max_level,     costs: cfg.upgrades.luck.costs,
          effectLabel: `تأثير حظ تراكمي بسيط للرحلات`,
          col: '#2ECC71' },
    ];

    const cw = 720, ch = 330, gap = 40;
    const gx0 = (W - (2 * cw + gap)) / 2;
    const gy0 = 180;

    upgList.forEach((u, i) => {
        const col   = u.col;
        const rank  = Number(stats[u.key] || 1);
        const maxed = rank >= u.max_level;
        const cost  = maxed ? 0 : (u.costs[rank] || 0);
        const canAf = !maxed && Number(mora) >= cost;
        const cx    = gx0 + (i % 2) * (cw + gap);
        const cy    = gy0 + Math.floor(i / 2) * (ch + gap);

        drawPanel(ctx, cx, cy, cw, ch, col, { radius: 24 });

        if (maxed) {
            rr(ctx, cx + 30, cy + 30, 96, 44, 12);
            ctx.fillStyle   = col + 'CC'; ctx.fill();
            M(ctx, 'MAX', cx + 78, cy + 52, 22, '#FFF');
        } else {
            rr(ctx, cx + 30, cy + 30, 90, 44, 12);
            ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fill();
            ctx.strokeStyle = col + '88'; ctx.lineWidth = 2;
            rr(ctx, cx + 30, cy + 30, 90, 44, 12); ctx.stroke();
            M(ctx, `${rank} / ${u.max_level}`, cx + 75, cy + 52, 22, col);
        }

        R(ctx, u.name, cx + cw - 30, cy + 50, 36, col);
        R(ctx, u.effectLabel, cx + cw - 30, cy + 95, 26, C.textD);

        ctx.font = `80px ${FE}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(u.emoji, cx + 30, cy + 110);

        divLine(ctx, cx + 30, cy + 145, cw - 60, col + '44');

        drawStars(ctx, rank, u.max_level, cx + cw - 30, cy + 180, 40, col);
        L(ctx, `المستوى ${rank}`, cx + 30, cy + 180, 28, C.textD);

        drawBar(ctx, cx + 30, cy + 215, cw - 60, 32, rank / u.max_level, col, false);

        divLine(ctx, cx + 30, cy + 265, cw - 60, col + '33');

        if (maxed) {
            M(ctx, 'تم الوصول للحد الاقصى', cx + cw / 2, cy + 295, 28, col);
        } else {
            R(ctx, `التكلفة: ${cost.toLocaleString()}`, cx + cw - 30, cy + 295, 28, canAf ? C.gold : C.red);

            const btnW = 280, btnX = cx + 30, btnY = cy + 270;
            const btnG = ctx.createLinearGradient(btnX, btnY, btnX + btnW, btnY + 54);
            btnG.addColorStop(0, canAf ? col + '44' : 'rgba(120,40,40,0.40)');
            btnG.addColorStop(1, canAf ? col + '20' : 'rgba(80,20,20,0.25)');
            rr(ctx, btnX, btnY, btnW, 54, 14);
            ctx.fillStyle   = btnG; ctx.fill();
            ctx.strokeStyle = canAf ? col + 'BB' : C.red + '66'; ctx.lineWidth = 2.5;
            rr(ctx, btnX, btnY, btnW, 54, 14); ctx.stroke();
            M(ctx, canAf ? `متوفر للترقية` : 'رصيد غير كاف', cx + 170, cy + 297, 24, canAf ? '#FFF' : C.red);
        }
    });

    return toBuf(canvas);
}

module.exports = { generateUpgradePanel };
