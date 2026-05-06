const { PermissionsBitField, EmbedBuilder, AttachmentBuilder, Colors } = require("discord.js");
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');

try {
    const fontPath = path.join(process.cwd(), 'fonts', 'bein-ar-normal.ttf');
    GlobalFonts.registerFromPath(fontPath, 'Bein');
} catch (e) { 
    console.error("Font loading error:", e);
}

module.exports = {
    name: 'color',
    aliases: ['colors', 'لون', 'الوان', 'صبغات'],
    category: "Utility",
    description: 'لوحة الالوان',

    async execute(message, args) {
        const { guild, member } = message;

        function parseArabicNumbers(str) {
            return str.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
        }

        let colorRoles = guild.roles.cache.filter(role => {
            const num = parseInt(role.name);
            return !isNaN(num) && /^\d+$/.test(role.name) && num >= 1 && num <= 150 && !role.managed && role.id !== guild.id;
        });

        const uniqueRoles = new Map();
        colorRoles.forEach(role => {
            const num = parseInt(role.name);
            if (!uniqueRoles.has(num)) uniqueRoles.set(num, role);
        });

        const sortedRoles = Array.from(uniqueRoles.values()).sort((a, b) => parseInt(a.name) - parseInt(b.name));

        if (sortedRoles.length === 0) {
            return message.reply("❌ **لا توجد رتب ألوان (1-150) معدة في السيرفر.**");
        }

        if (!args[0]) {
            try {
                const total = sortedRoles.length;
                const columns = 10;
                const rows = Math.ceil(total / columns);
                
                const boxSize = 60;
                const gap = 18;
                const paddingSide = 40;
                const headerHeight = 100;
                const paddingBottom = 40;

                const width = (columns * boxSize) + ((columns - 1) * gap) + (paddingSide * 2);
                const height = (rows * boxSize) + ((rows - 1) * gap) + headerHeight + paddingBottom;

                const canvas = createCanvas(width, height);
                const ctx = canvas.getContext('2d');

                ctx.fillStyle = '#1e2124'; 
                ctx.fillRect(0, 0, width, height);

                ctx.fillStyle = '#282b30';
                const dotGap = 20;
                for (let dx = 0; dx < width; dx += dotGap) {
                    for (let dy = 0; dy < height; dy += dotGap) {
                        ctx.beginPath();
                        ctx.arc(dx, dy, 1.5, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }

                ctx.fillStyle = '#2c2f33'; 
                ctx.fillRect(0, 0, width, headerHeight);
                
                const gradientLine = ctx.createLinearGradient(0, 0, width, 0);
                gradientLine.addColorStop(0, '#5865F2');
                gradientLine.addColorStop(1, '#EB459E');
                ctx.fillStyle = gradientLine;
                ctx.fillRect(0, headerHeight - 4, width, 4);

                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                
                ctx.font = 'bold 32px "Bein", sans-serif';
                ctx.fillStyle = '#FFFFFF';
                ctx.fillText(`🎨 لــوحـة الألــوان`, paddingSide, headerHeight / 2);

                ctx.textAlign = 'right';
                ctx.font = '20px "Bein", sans-serif';
                ctx.fillStyle = '#bbbbbb';
                ctx.fillText(`${total} الالـوان المتـاحـة`, width - paddingSide, headerHeight / 2);

                function drawRoundedRect(ctx, x, y, w, h, r) {
                    ctx.beginPath();
                    ctx.moveTo(x + r, y);
                    ctx.lineTo(x + w - r, y);
                    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
                    ctx.lineTo(x + w, y + h - r);
                    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
                    ctx.lineTo(x + r, y + h);
                    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
                    ctx.lineTo(x, y + r);
                    ctx.quadraticCurveTo(x, y, x + r, y);
                    ctx.closePath();
                }

                sortedRoles.forEach((role, i) => {
                    const col = i % columns;
                    const row = Math.floor(i / columns);

                    const x = paddingSide + (col * (boxSize + gap));
                    const y = headerHeight + paddingSide + (row * (boxSize + gap)) - 20;

                    drawRoundedRect(ctx, x, y, boxSize, boxSize, 10);
                    ctx.fillStyle = role.hexColor;
                    ctx.fill();

                    ctx.save();
                    drawRoundedRect(ctx, x, y, boxSize, boxSize / 2, 10);
                    ctx.clip();
                    const glossGradient = ctx.createLinearGradient(x, y, x, y + boxSize);
                    glossGradient.addColorStop(0, 'rgba(255, 255, 255, 0.25)');
                    glossGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.0)');
                    ctx.fillStyle = glossGradient;
                    ctx.fill();
                    ctx.restore();

                    ctx.save();
                    drawRoundedRect(ctx, x, y, boxSize, boxSize, 10);
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
                    ctx.lineWidth = 1;
                    ctx.stroke();
                    ctx.restore();

                    ctx.font = 'bold 22px "Bein", sans-serif'; 
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    
                    const textX = x + (boxSize / 2);
                    const textY = y + (boxSize / 2) + 2;

                    ctx.lineJoin = 'round';
                    ctx.miterLimit = 2;
                    ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)'; 
                    ctx.lineWidth = 2.5; 
                    ctx.strokeText(role.name, textX, textY);

                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillText(role.name, textX, textY);
                });

                const attachment = new AttachmentBuilder(await canvas.encode('png'), { name: 'colors.png' });
                const prefix = message.client.prefix || '!'; 
                
                return message.reply({ 
                    content: `✥ لـ اختيـار اي لون اكتب الامر التـالـي:\n\`${prefix}لون (رقم)\``, 
                    files: [attachment] 
                });

            } catch (error) {
                console.error(error);
                return message.reply("❌ حدث خطأ أثناء إنشاء الصورة.");
            }
        }

        let input = args[0].toLowerCase();
        input = parseArabicNumbers(input);

        const removeKeywords = ['0', 'remove', 'off', 'ازالة', 'مسح', 'حذف'];
        if (removeKeywords.includes(input)) {
            const currentColors = member.roles.cache.filter(r => {
                const n = parseInt(r.name);
                return !isNaN(n) && /^\d+$/.test(r.name) && n >= 1 && n <= 150 && uniqueRoles.has(n);
            });

            if (currentColors.size > 0) {
                try {
                    await member.roles.remove(currentColors);
                    return message.reply(`✅ **تم إزالة جميع الألوان منك.**`);
                } catch (err) {
                    return message.reply("❌ لا أمتلك صلاحية لإزالة الرتب.");
                }
            } else {
                return message.reply("⚠️ **أنت لا تملك أي لون حالياً.**");
            }
        }

        const requestedNumber = parseInt(input);

        if (isNaN(requestedNumber) || requestedNumber < 1 || requestedNumber > 150) {
            return message.reply("❌ **يرجى اختيار رقم لون صحيح بين 1 و 150.**");
        }

        const targetRole = uniqueRoles.get(requestedNumber);

        if (!targetRole) {
            return message.reply(`❌ **اللون رقم ${requestedNumber} غير متوفر حالياً.**`);
        }

        const dangerousPermissions = [
            PermissionsBitField.Flags.Administrator,
            PermissionsBitField.Flags.ManageGuild,
            PermissionsBitField.Flags.ManageRoles,
            PermissionsBitField.Flags.ManageChannels,
            PermissionsBitField.Flags.BanMembers,
            PermissionsBitField.Flags.KickMembers,
            PermissionsBitField.Flags.ManageMessages,
            PermissionsBitField.Flags.MentionEveryone
        ];

        if (targetRole.permissions.has(PermissionsBitField.Flags.Administrator) || dangerousPermissions.some(perm => targetRole.permissions.has(perm))) {
            return message.reply("⛔ **تنبيه أمني:** لا يمكن إعطاء هذا اللون لأنه يحتوي على صلاحيات إدارية!");
        }

        if (!targetRole.editable) {
            return message.reply("❌ **لا أستطيع إعطاء هذا اللون، رتبتي أقل منه!**");
        }

        try {
            if (member.roles.cache.has(targetRole.id)) {
                await member.roles.remove(targetRole);
                return message.reply({ 
                    content: `✅ **تم إزالة اللون \`${targetRole.name}\` منك.**`,
                    allowedMentions: { repliedUser: true }
                });
            } else {
                const rolesToRemove = member.roles.cache.filter(r => {
                    const n = parseInt(r.name);
                    return !isNaN(n) && /^\d+$/.test(r.name) && n >= 1 && n <= 150 && r.id !== targetRole.id;
                });
                
                if (rolesToRemove.size > 0) await member.roles.remove(rolesToRemove);

                await member.roles.add(targetRole);
                return message.reply({ 
                    content: `✅ **تم تغيير لونك إلى:** \`${targetRole.name}\``,
                    allowedMentions: { repliedUser: true }
                });
            }
        } catch (error) {
            console.error(error);
            return message.reply("❌ حدث خطأ أثناء تغيير الألوان.");
        }
    }
};
