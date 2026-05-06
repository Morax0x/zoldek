const { AttachmentBuilder, SlashCommandBuilder } = require("discord.js");
const Canvas = require('canvas');

const EMPEROR_ID = '1145327691772481577';
const EMPEROR_CARD_URL = 'https://i.postimg.cc/8CK5jbWN/card-(2).jpg';

const R2_BASE_URL = 'https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev/images/balance';

const RACE_ASSETS = {
    'Human':    { bg: 'bg_human.png',    frame: 'frame_human.png' },
    'Dragon':   { bg: 'bg_dragon.png',   frame: 'frame_dragon.png' },
    'Elf':      { bg: 'bg_elf.png',      frame: 'frame_elf.png' },
    'Dark Elf': { bg: 'bg_darkelf.png',  frame: 'frame_darkelf.png' },
    'Dwarf':    { bg: 'bg_dwarf.png',    frame: 'frame_dwarf.png' },
    'Ghoul':    { bg: 'bg_ghoul.png',    frame: 'frame_ghoul.png' },
    'Vampire':  { bg: 'bg_vampire.png',  frame: 'frame_vampire.png' },
    'Hybrid':   { bg: 'bg_hybrid.png',   frame: 'frame_hybrid.png' },
    'Seraphim': { bg: 'bg_seraphim.png', frame: 'frame_seraphim.png' },
    'Demon':    { bg: 'bg_demon.png',    frame: 'frame_demon.png' },
    'Spirit':   { bg: 'bg_spirit.png',   frame: 'frame_spirit.png' },
    'Default':  { bg: 'card.png',        frame: null } // البطاقة القديمة للي ما عنده عرق
};

// ألوان داكنة جداً وشفافة (Opacity 0.35) عشان تندمج مع التصميم وما تشوهه
const RACE_COLORS = {
    'Human':    'rgba(100, 110, 120, 0.35)', 
    'Dragon':   'rgba(212, 175, 55, 0.35)',  // ذهبي للتنين
    'Elf':      'rgba(30, 80, 40, 0.35)',    
    'Dark Elf': 'rgba(60, 20, 90, 0.35)',    
    'Dwarf':    'rgba(120, 70, 30, 0.35)',   
    'Ghoul':    'rgba(90, 0, 0, 0.35)',      
    'Vampire':  'rgba(110, 10, 20, 0.35)',   
    'Hybrid':   'rgba(130, 90, 10, 0.35)',   
    'Seraphim': 'rgba(0, 90, 140, 0.35)',    
    'Demon':    'rgba(100, 0, 0, 0.35)',     
    'Spirit':   'rgba(0, 100, 100, 0.35)',   
    'Default':  'rgba(212, 175, 55, 0.35)',  
    'Emperor':  'rgba(255, 215, 0, 0.40)'    // ذهبي للإمبراطور
};

const RACE_MAPPING = [
    { keys: ['dragon', 'تنين', 'تنانين', 'دراجون', 'دراغون'], race: 'Dragon' },
    { keys: ['human', 'بشري', 'انسان', 'بشر', 'إنسان'], race: 'Human' },
    { keys: ['dark elf', 'ظلام', 'دارك', 'مظلم'], race: 'Dark Elf' },
    { keys: ['elf', 'الف', 'آلف', 'ايلف', 'إلف', 'جان'], race: 'Elf' },
    { keys: ['seraphim', 'سيرافيم', 'سماوي', 'ملائكة', 'ملاك', 'سرافيم'], race: 'Seraphim' },
    { keys: ['demon', 'شيطان', 'شياطين', 'ديمون'], race: 'Demon' },
    { keys: ['vampire', 'مصاص', 'فامباير', 'دماء'], race: 'Vampire' },
    { keys: ['spirit', 'روح', 'ارواح', 'أرواح', 'شبح'], race: 'Spirit' },
    { keys: ['dwarf', 'قزم', 'اقزام', 'أقزام', 'دوارف'], race: 'Dwarf' },
    { keys: ['ghoul', 'غول', 'غيلان', 'غُول'], race: 'Ghoul' },
    { keys: ['hybrid', 'نصف', 'هجين', 'هجناء', 'هايبرد'], race: 'Hybrid' }
];

function roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.closePath();
}

function drawAutoScaledText(ctx, text, x, y, maxWidth, maxFontSize, minFontSize = 18) {
    let currentFontSize = maxFontSize;
    ctx.font = `bold ${currentFontSize}px "Cairo", "Arial"`;
    while (ctx.measureText(text).width > maxWidth && currentFontSize > minFontSize) {
        currentFontSize -= 2;
        ctx.font = `bold ${currentFontSize}px "Cairo", "Arial"`;
    }
    ctx.fillText(text, x, y);
}

const imageCache = new Map();
const raceRolesCache = new Map();

async function getCachedImage(filename) {
    if (!filename) return null;
    const url = filename.startsWith('http') ? filename : `${R2_BASE_URL}/${filename}`;
    if (imageCache.has(url)) return imageCache.get(url);
    
    try {
        const img = await Canvas.loadImage(url);
        imageCache.set(url, img);
        return img;
    } catch (e) {
        return null;
    }
}

async function getUserRaceName(user, guild, db) {
    if (!guild) return 'Default';
    const member = guild.members.cache.get(user.id) || await guild.members.fetch({ user: user.id, force: true }).catch(() => null);
    if (!member) return 'Default';

    let raceRolesRows = null;
    const now = Date.now();
    
    if (raceRolesCache.has(guild.id) && (now - raceRolesCache.get(guild.id).timestamp) < 300000) {
        raceRolesRows = raceRolesCache.get(guild.id).rows;
    } else {
        try {
            let res = await db.query(`SELECT * FROM race_roles WHERE "guildID" = $1`, [guild.id]);
            if (!res || !res.rows) res = await db.query(`SELECT * FROM race_roles WHERE guildid = $1`, [guild.id]).catch(() => null);
            if (res && res.rows) {
                raceRolesRows = res.rows;
                raceRolesCache.set(guild.id, { rows: raceRolesRows, timestamp: now });
            }
        } catch (e) {}
    }

    if (raceRolesRows && raceRolesRows.length > 0) {
        const userRoleIDs = member.roles.cache.map(r => String(r.id).trim());
        const matched = raceRolesRows.find(r => userRoleIDs.includes(String(r.roleID || r.roleid).trim()));
        if (matched) {
            const nameLower = (matched.raceName || matched.racename).toLowerCase().trim();
            for (const group of RACE_MAPPING) {
                for (const key of group.keys) {
                    if (key === 'الف' && (nameLower.includes('مخالف') || nameLower.includes('تحالف'))) continue;
                    if (nameLower.includes(key)) return group.race;
                }
            }
        }
    }

    for (const role of member.roles.cache.values()) {
        const nameLower = role.name.toLowerCase().trim();
        for (const group of RACE_MAPPING) {
            for (const key of group.keys) {
                if (key === 'الف' && (nameLower.includes('مخالف') || nameLower.includes('تحالف'))) continue;
                if (nameLower.includes(key)) return group.race;
            }
        }
    }
    return 'Default';
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('رصيد')
        .setDescription('يعرض رصيدك من المورا في بطاقة بنكية احترافية.')
        .addUserOption(option => 
            option.setName('المستخدم')
            .setDescription('المستخدم الذي تريد عرض رصيده (اختياري)')
            .setRequired(false)),

    name: 'balance',
    aliases: ['bal', 'mora', 'رصيد', 'مورا','فلوس'],
    category: "Economy",
    description: "يعرض رصيدك من المورا.",

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, member, client, guild;
        let user; 
        let commandAuthor; 

        try {
            if (isSlash) {
                interaction = interactionOrMessage;
                client = interaction.client;
                guild = interaction.guild;
                commandAuthor = interaction.user;
                const targetUser = interaction.options.getUser('المستخدم') || interaction.user;
                user = targetUser;
                member = await guild.members.fetch(targetUser.id).catch(() => null);

                if (!member) return interaction.reply({ content: 'لم أتمكن من العثور على هذا العضو في السيرفر.', flags: [64] }); 
                await interaction.deferReply();
            } else {
                message = interactionOrMessage;
                client = message.client;
                guild = message.guild;
                commandAuthor = message.author;
                member = message.mentions.members.first() || message.guild.members.cache.get(args[0]) || message.member;
                user = member.user;
            }

            const isEmperor = (user.id === EMPEROR_ID);
            const isSpying = (isEmperor && commandAuthor.id !== EMPEROR_ID);

            const avatarPromise = Canvas.loadImage(user.displayAvatarURL({ extension: 'png', size: 256 })).catch(() => null);

            const balancePromise = (async () => {
                let sMora = 0, sBank = 0, foundInCache = false;
                if (client.getLevel) {
                    try {
                        let cachedData = await client.getLevel(user.id, guild.id);
                        if (cachedData && (cachedData.mora !== undefined || cachedData.Mora !== undefined)) {
                            sMora = Number(cachedData.mora || cachedData.Mora) || 0;
                            sBank = Number(cachedData.bank || cachedData.Bank) || 0;
                            foundInCache = true;
                        }
                    } catch(e) {}
                }
                if (!foundInCache) {
                    try {
                        const res = await client.sql.query(`SELECT "mora", "bank" FROM levels WHERE "user" = $1 AND "guild" = $2`, [user.id, guild.id]);
                        if (res.rows.length > 0) { sMora = Number(res.rows[0].mora) || 0; sBank = Number(res.rows[0].bank) || 0; }
                    } catch (e) {
                        try {
                            const res = await client.sql.query(`SELECT mora, bank FROM levels WHERE userid = $1 AND guildid = $2`, [user.id, guild.id]);
                            if (res.rows.length > 0) { sMora = Number(res.rows[0].mora) || 0; sBank = Number(res.rows[0].bank) || 0; }
                        } catch(err) {}
                    }
                }
                return { sMora, sBank };
            })();

            const racePromise = getUserRaceName(user, guild, client.sql);

            const [avatarImg, { sMora: safeMora, sBank: safeBank }, userRace] = await Promise.all([avatarPromise, balancePromise, racePromise]);

            const assets = RACE_ASSETS[userRace] || RACE_ASSETS['Default'];
            const bgFile = isEmperor ? 'bg_morax.png' : assets.bg;
            const frameFile = isEmperor ? 'farm_morax.png' : assets.frame; 
            const themeColor = isEmperor ? RACE_COLORS['Emperor'] : (RACE_COLORS[userRace] || RACE_COLORS['Default']);

            const [bgImage, frameImage, chipImg, cashImg, bankImg, mastercardImg, glitchImg] = await Promise.all([
                getCachedImage(bgFile),
                getCachedImage(frameFile),
                getCachedImage('chip.png'),
                getCachedImage('icon_cash.png'),
                getCachedImage('icon_bank.png'),
                getCachedImage('icon_mastercard.png'),
                isSpying ? getCachedImage('gl.png') : null
            ]);

            const canvas = Canvas.createCanvas(1000, 400); 
            const ctx = canvas.getContext('2d');

            const cornerRadius = 25;
            ctx.beginPath();
            roundRect(ctx, 0, 0, canvas.width, canvas.height, cornerRadius);
            ctx.clip(); 

            if (bgImage) ctx.drawImage(bgImage, 0, 0, canvas.width, canvas.height);
            else { ctx.fillStyle = '#1A1C20'; ctx.fillRect(0, 0, canvas.width, canvas.height); }

            const overlayGrad = ctx.createLinearGradient(0, 0, canvas.width, 0);
            overlayGrad.addColorStop(0, 'rgba(8, 10, 15, 0.4)');
            overlayGrad.addColorStop(0.5, 'rgba(8, 10, 15, 0.7)'); 
            overlayGrad.addColorStop(1, 'rgba(8, 10, 15, 0.85)'); 
            ctx.fillStyle = overlayGrad;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            const avatarX = 180; 
            const avatarY = 200; 
            const avatarRadius = 95; 

            if (avatarImg) {
                ctx.save();
                ctx.beginPath(); ctx.arc(avatarX, avatarY, avatarRadius, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
                ctx.drawImage(avatarImg, avatarX - avatarRadius, avatarY - avatarRadius, avatarRadius * 2, avatarRadius * 2); 
                ctx.restore();
            } else {
                ctx.fillStyle = "#333333";
                ctx.beginPath(); ctx.arc(avatarX, avatarY, avatarRadius, 0, Math.PI * 2, true); ctx.fill();
            }

            if (frameImage) {
                const frameSize = 270; 
                ctx.drawImage(frameImage, avatarX - (frameSize / 2), avatarY - (frameSize / 2), frameSize, frameSize);
            } else {
                // للمستخدم العادي الذي ليس لديه عرق يرسم له الإطار الذهبي الافتراضي
                ctx.beginPath(); ctx.arc(avatarX, avatarY, avatarRadius, 0, Math.PI * 2);
                ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(212, 175, 55, 0.6)'; ctx.stroke();
            }

            let displayName = user.displayName || user.username;
            if (displayName.length > 15) displayName = displayName.substring(0, 15) + '...';
            
            ctx.font = 'bold 36px "Cairo", "Arial"';
            const textWidth = ctx.measureText(displayName).width;
            
            const badgeX = 320;
            const badgeY = 40;
            const badgeW = textWidth + 60;
            const badgeH = 60;

            const badgeGrad = ctx.createLinearGradient(badgeX, badgeY, badgeX + badgeW, badgeY);
            badgeGrad.addColorStop(0, 'rgba(25, 30, 35, 0.9)');
            badgeGrad.addColorStop(1, 'rgba(10, 15, 20, 0.4)');
            
            ctx.fillStyle = badgeGrad;
            ctx.beginPath(); roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 15); ctx.fill();
            ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(212, 175, 55, 0.4)'; ctx.stroke();

            // الخط الجانبي بلون العرق الشفاف
            ctx.fillStyle = themeColor;
            ctx.beginPath(); roundRect(ctx, badgeX + 6, badgeY + 10, 5, badgeH - 20, 3); ctx.fill();

            ctx.fillStyle = '#FFFFFF';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(displayName, badgeX + 25, badgeY + (badgeH / 2));

            const iconX = 310; 
            const boxX = 420;  
            const boxW = 340;  
            const boxH = 65;   

            // --- المحفظة ---
            const walletY = 135;
            if (cashImg) ctx.drawImage(cashImg, iconX, walletY - 15, 95, 95);

            if (isSpying && glitchImg) {
                ctx.drawImage(glitchImg, boxX, walletY - 10, 340, 85);
            } else {
                ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
                ctx.beginPath(); roundRect(ctx, boxX, walletY, boxW, boxH, 15); ctx.fill();
                ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(212, 175, 55, 0.3)'; ctx.stroke();
                
                // الأرقام رجعت للونها الذهبي الساطع
                ctx.fillStyle = '#FFD700'; 
                ctx.textAlign = 'left';
                drawAutoScaledText(ctx, `${safeMora.toLocaleString()}`, boxX + 20, walletY + (boxH / 2) + 2, boxW - 40, 38, 18);
            }

            // --- البنك ---
            const bankY = 250;
            if (bankImg) ctx.drawImage(bankImg, iconX, bankY - 15, 95, 95);

            if (isSpying && glitchImg) {
                ctx.drawImage(glitchImg, boxX, bankY - 10, 340, 85);
            } else {
                ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
                ctx.beginPath(); roundRect(ctx, boxX, bankY, boxW, boxH, 15); ctx.fill();
                ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(212, 175, 55, 0.3)'; ctx.stroke();
                
                // الأرقام رجعت للونها الأخضر الزاهي
                ctx.fillStyle = '#2ECC71'; 
                ctx.textAlign = 'left';
                drawAutoScaledText(ctx, `${safeBank.toLocaleString()}`, boxX + 20, bankY + (boxH / 2) + 2, boxW - 40, 38, 18);
            }

            ctx.globalAlpha = 0.85; 
            if (chipImg) {
                ctx.drawImage(chipImg, 815, 115, 100, 100);
            }
            if (mastercardImg) {
                ctx.drawImage(mastercardImg, 805, 245, 120, 75);
            }
            ctx.globalAlpha = 1.0; 

            // الإطار الخارجي بلون العرق الشفاف
            ctx.lineWidth = 4;
            ctx.strokeStyle = themeColor;
            ctx.beginPath();
            roundRect(ctx, 2, 2, canvas.width - 4, canvas.height - 4, cornerRadius);
            ctx.stroke();

            const attachment = new AttachmentBuilder(canvas.toBuffer(), { name: `mora-card-${userRace}.png` });

            if (isSlash) {
                await interaction.editReply({ files: [attachment] });
            } else {
                await message.channel.send({ files: [attachment] });
            }

        } catch (error) {
            const errorPayload = { content: "حدث خطأ أثناء إنشاء بطاقة الرصيد.", flags: [64] };
            if (isSlash) {
                if (interaction.deferred || interaction.replied) await interaction.editReply(errorPayload);
                else await interaction.reply(errorPayload);
            } else {
                message.reply(errorPayload.content);
            }
        }
    }
};
