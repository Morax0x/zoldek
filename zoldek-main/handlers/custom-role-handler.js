const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require("discord.js");

const forbiddenNames = [
    'موراكس','morax','ادمن','admin','أدمن','ADM','AdMin','مدير','manager','Manager','MANAGER',
    'مشرف','moderator','Moderator','MOD','Mod','ستاف','staff','Staff','STAFF','اونر','owner',
    'Owner','OWNR','مالك','boss','chief','رئيس','Leader','leader','مشرف عام','General Moderator',
    'supervisor','SuperAdmin','Super Admin','مشرف رئيسي','Head Moderator','Head Admin','Head Manager',
    'مدير عام','General Manager','مدير تنفيذي','Executive Manager','مدير عمليات','Operations Manager',
    'مدير فريق','Team Leader','رئيس الفريق','Team Chief','رئيس الإدارة','Administration Head',
    'المشرف الأعلى','Top Moderator','HR Manager','رئيس العمليات','Chief Operations','Commander','Leader Admin',
    'إدارة','اداري','ادارة','أدارة','إداري','Management','Managerial','Adminstration','Administratif'
];

async function checkPermissions(member, db) {
    const guildID = member.guild.id;
    try {
        // 🔥 استخدام "" للحفاظ على حالة الأحرف
        const allowedRolesRes = await db.query(`SELECT "roleID" FROM custom_role_permissions WHERE "guildID" = $1`, [guildID]);
        const allowedRoles = allowedRolesRes.rows;
        if (allowedRoles.length === 0) return false; 
        
        const allowedRoleIDs = allowedRoles.map(r => r.roleID || r.roleid);
        return member.roles.cache.some(r => allowedRoleIDs.includes(r.id));
    } catch (e) {
        console.error("checkPermissions error:", e.message);
        return false;
    }
}

async function getAnchorRole(guild, db) {
    try {
        const settingsRes = await db.query(`SELECT "customRoleAnchorID" FROM settings WHERE "guild" = $1`, [guild.id]);
        const settings = settingsRes.rows[0];
        if (!settings || (!settings.customRoleAnchorID && !settings.customroleanchorid)) return null;
        return guild.roles.cache.get(settings.customRoleAnchorID || settings.customroleanchorid);
    } catch (e) {
        console.error("getAnchorRole error:", e.message);
        return null;
    }
}

async function getMemberRole(userID, guildID, guild, db) {
    try {
        const dataRes = await db.query(`SELECT "roleID" FROM custom_roles WHERE "guildID" = $1 AND "userID" = $2`, [guildID, userID]);
        const data = dataRes.rows[0];
        if (!data) return null;
        return guild.roles.cache.get(data.roleID || data.roleid);
    } catch (e) {
        console.error("getMemberRole error:", e.message);
        return null;
    }
}

async function handleCustomRoleInteraction(i, client, db) {
    const memberId = i.user.id;
    const guild = i.guild;

    if (!(await checkPermissions(i.member, db))) {
        return i.reply({ content: 'روح اشتري عضويـة الرتـب يــا فقـير <:2wt:1415691127608180847>', ephemeral: true });
    }

    const anchorRole = await getAnchorRole(guild, db);
    if (!anchorRole) {
        return i.reply({ content: "خطأ إداري: لم يتم تحديد 'الرتبة الثابتة' (Anchor Role).", ephemeral: true });
    }

    const role = await getMemberRole(memberId, guild.id, guild, db);

    if (i.isButton()) {
        const customId = i.customId;

        if (customId === 'customrole_create') {
            if (role) return i.reply({ content: 'لديك رتبة بالفعل!', ephemeral: true });
            const modal = new ModalBuilder()
                .setCustomId('customrole_modal_create')
                .setTitle('إنشاء رتبة')
                .addComponents(new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('roleNameInput').setLabel('اسم الرتبة').setStyle(TextInputStyle.Short).setRequired(true)
                ));
            return i.showModal(modal);
        }

        if (customId === 'customrole_add_self') {
            if (!role) return i.reply({ content: 'يجب أن تنشئ رتبة أولاً!', ephemeral: true });
            await i.member.roles.add(role).catch(() => {});
            return i.reply({ content: ` <a:7dan:1394308359024541799> تـــم إضــافـــة الرتــبـــة ${role.name}`, ephemeral: true });
        }
        
        if (customId === 'customrole_remove_self') {
            if (!role) return i.reply({ content: 'أنت لا تملك رتبة مخصصة لإزالتها.', ephemeral: true });
            await i.member.roles.remove(role).catch(() => {});
            return i.reply({ content: ` <:2ZeroTwoAnnoyed:1418501701001936958> تـــم إزالـــة الرتبــة ${role.name}`, ephemeral: true });
        }

        if (['customrole_change_name', 'customrole_change_color', 'customrole_change_icon'].includes(customId)) {
            if (!role) return i.reply({ content: 'يجب أن تنشئ رتبة أولاً قبل تعديلها!', ephemeral: true });

            let modal;
            if (customId === 'customrole_change_name') {
                modal = new ModalBuilder().setCustomId('customrole_modal_name').setTitle('تغيير الاسم')
                    .addComponents(new ActionRowBuilder().addComponents(
                        new TextInputBuilder().setCustomId('newName').setLabel('الاسـم الجديــد؟').setStyle(TextInputStyle.Short).setRequired(true).setValue(role.name)
                    ));
            } else if (customId === 'customrole_change_color') {
                modal = new ModalBuilder().setCustomId('customrole_modal_color').setTitle('تغيير اللون')
                    .addComponents(new ActionRowBuilder().addComponents(
                        new TextInputBuilder().setCustomId('newColor').setLabel(' رمز اللون بالهيكس (مثل #FF0000)').setStyle(TextInputStyle.Short).setRequired(true).setValue(role.hexColor)
                    ));
            } else if (customId === 'customrole_change_icon') {
                modal = new ModalBuilder().setCustomId('customrole_modal_icon').setTitle('تغيير الأيقونة')
                    .addComponents(new ActionRowBuilder().addComponents(
                        new TextInputBuilder().setCustomId('newIcon').setLabel('الصق رابط الصورة أو رسالة الإيموجي').setStyle(TextInputStyle.Short).setRequired(true)
                    ));
            }
            return i.showModal(modal);
        }
    }

    if (i.isModalSubmit()) {
        const customId = i.customId;

        if (customId === 'customrole_modal_create') {
            await i.deferReply({ ephemeral: true });
            if (role) return i.editReply({ content: '❖ حـلاوة هي؟ <a:6bonk:1401906810973327430> خـلاص معـاك رتبـة اذا ما ظهـرت اضغـط اضـافـة', ephemeral: true });
            
            const roleName = i.fields.getTextInputValue('roleNameInput');
            if (forbiddenNames.some(name => roleName.toLowerCase().includes(name.toLowerCase()))) {
                return i.editReply({ content: '❖  لا يشيـخ؟ ممنـوع تحـط رتبـة بهـذا الاسـم <a:8shot:1401840462997749780>', ephemeral: true });
            }

            try {
                // مسح الرتبة القديمة إن وجدت
                await db.query(`DELETE FROM custom_roles WHERE "guildID" = $1 AND "userID" = $2`, [guild.id, memberId]);

                const newRole = await guild.roles.create({
                    name: roleName,
                    color: Math.floor(Math.random() * 16777215),
                    mentionable: true
                });
                
                try {
                    await newRole.setPosition(anchorRole.position - 1);
                } catch (posErr) {
                    console.warn("فشل تحديد موقع الرتبة المخصصة:", posErr.message);
                }

                // حفظ في القاعدة بالصيغة الصحيحة
                await db.query(`INSERT INTO custom_roles ("id", "guildID", "userID", "roleID") VALUES ($1, $2, $3, $4)`, [`${guild.id}-${memberId}`, guild.id, memberId, newRole.id]);
                    
                await i.member.roles.add(newRole).catch(() => {});
                return i.editReply({ content: `❖ تـم تـم سويـت رتـبتـك يالامـيـر <:2Piola:1414568762212089917>: ${roleName}`, ephemeral: true });
            } catch (err) {
                console.error("Failed to create custom role:", err);
                return i.editReply({ content: 'حدث خطأ أثناء إنشاء الرتبة. الرجاء التأكد أن البوت يمتلك صلاحية Manage Roles وأن رتبته هي الأعلى.', ephemeral: true });
            }
        }

        if (!role) return i.reply({ content: '❖ ويـن رتبتـك يـاخـي؟ مدري نسـيت  <:2girlthink:1414936456396279909>', ephemeral: true });

        if (customId === 'customrole_modal_name') {
            const newName = i.fields.getTextInputValue('newName');
            if (forbiddenNames.some(name => newName.toLowerCase().includes(name.toLowerCase()))) {
                return i.reply({ content: '❖  لا يشيـخ؟ ممنـوع تحـط رتبـة بهـذا الاسـم <a:8shot:1401840462997749780>', ephemeral: true });
            }
            await role.edit({ name: newName }).catch(e => console.error("Role edit name error:", e));
            return i.reply({ content: `❖ <:2BCrikka:1414595716864806962> غـيـرت اسـم رتـبتـك الـى : ${newName}`, ephemeral: true });
        }
        
        if (customId === 'customrole_modal_color') {
            const newColor = i.fields.getTextInputValue('newColor');
            try {
                await role.edit({ color: newColor });
                return i.reply({ content: `❖ تـم تـغـييـر لـون رتـبـتك <:2ugay:1414566928453861510>`, ephemeral: true });
            } catch (e) {
                return i.reply({ content: `❖ اللون غير صالح. الرجاء استخدام كود هيكس (مثل #FFFFFF).`, ephemeral: true });
            }
        }
        
        if (customId === 'customrole_modal_icon') {
            let input = i.fields.getTextInputValue('newIcon').trim();
            let iconURL = input;

            const messageLinkRegex = /https:\/\/(?:canary\.|ptb\.)?discord\.com\/channels\/(\d+)\/(\d+)\/(\d+)/;
            const match = input.match(messageLinkRegex);

            if (match) {
                const [, , channelId, messageId] = match;
                try {
                    const channel = await client.channels.fetch(channelId);
                    const message = await channel.messages.fetch(messageId);
                    const emojiMatch = message.content.match(/<a?:\w+:(\d+)>/);
                    if (emojiMatch) {
                        iconURL = `https://cdn.discordapp.com/emojis/${emojiMatch[1]}.png`;
                    } else if (message.attachments.size > 0) {
                        iconURL = message.attachments.first().url;
                    } else {
                        return i.reply({ content: '❖ ما حصلت ايموجي أو صورة في الرسالة!', ephemeral: true });
                    }
                } catch (err) {
                    return i.reply({ content: '❖ فشل في جلب الرسالة أو الايموجي!', ephemeral: true });
                }
            }

            try {
                await role.edit({ icon: iconURL });
                return i.reply({ content: `❖ تـم تغـييـر صـورة رتـبـتك - طلعت ذويق <a:6CaughtIn4K:1401839339482382356>`, ephemeral: true });
            } catch (e) {
                 return i.reply({ content: `❖ فشل في تغيير الصورة. تأكد أن الرابط صالح (png/jpg) وأن السيرفر لديه بوست كافٍ (Level 2+).`, ephemeral: true });
            }
        }
    }
}

async function checkDailyCustomRoleExpiration(client, db) {
    console.log("[Custom Roles] بدء فحص صلاحيات الرتب الخاصة...");
    
    try {
        const allCustomRolesRes = await db.query(`SELECT * FROM custom_roles`);
        const allCustomRoles = allCustomRolesRes.rows;
        if (allCustomRoles.length === 0) return;

        for (const record of allCustomRoles) {
            try {
                const guildId = record.guildID || record.guildid;
                const userId = record.userID || record.userid;
                const roleId = record.roleID || record.roleid;
                const recordId = record.id;

                const guild = client.guilds.cache.get(guildId);
                if (!guild) continue;

                const allowedRolesDBRes = await db.query(`SELECT "roleID" FROM custom_role_permissions WHERE "guildID" = $1`, [guildId]);
                const allowedRolesDB = allowedRolesDBRes.rows;
                
                if (allowedRolesDB.length === 0) continue;

                const allowedRoleIDs = allowedRolesDB.map(r => r.roleID || r.roleid);
                const member = await guild.members.fetch(userId).catch(() => null);
                
                if (!member) {
                    const role = guild.roles.cache.get(roleId);
                    if (role) await role.delete("غادر العضو المالك").catch(() => {});
                    await db.query(`DELETE FROM custom_roles WHERE "id" = $1`, [recordId]);
                    continue;
                }

                const hasPermission = member.roles.cache.some(r => allowedRoleIDs.includes(r.id));

                if (!hasPermission) {
                    const role = guild.roles.cache.get(roleId);
                    if (role) {
                        await role.delete("فقدان العضو لرتبة الصلاحية (VIP/Booster)").catch(e => console.error(`[Custom Roles] فشل حذف رتبة ${role.id}:`, e.message));
                    }
                    await db.query(`DELETE FROM custom_roles WHERE "id" = $1`, [recordId]);
                    console.log(`[Custom Roles] تم حذف رتبة العضو ${member.user.tag} لانتهاء الصلاحية.`);
                }
            } catch (err) {
                console.error(`[Custom Roles Error] Record ID ${record.id}:`, err.message);
            }
        }
    } catch (error) {
        console.error("[Custom Roles] Check Error:", error.message);
    }
    console.log("[Custom Roles] انتهى الفحص.");
}

module.exports = {
    handleCustomRoleInteraction,
    checkDailyCustomRoleExpiration 
};
