const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, PermissionsBitField, ChannelType } = require("discord.js");
const axios = require('axios'); 
const { loadRoleSettings } = require("../../handlers/reaction-role-handler.js");

function cleanRoleIds(input) {
    if (!input) return [];
    return input.split(/[\s,]+/)
        .map(id => id.trim())
        .filter(id => id.length > 0 && !isNaN(id));
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('reaction-roles')
        .setDescription('لوحة التحكم الشاملة بنظام الرتب والقوائم.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageRoles)
        
        // ==========================
        // 1. قسم الرتب المضادة
        // ==========================
        .addSubcommandGroup(group => group
            .setName('anti-role')
            .setDescription('إدارة الرتب المتعارضة.')
            .addSubcommand(sub => sub
                .setName('add')
                .setDescription('أضف رتبة تتعارض مع الرتبة الأصلية.')
                .addRoleOption(opt => opt.setName('main_role').setDescription('الرول الموجود في القائمة (الأصلي).').setRequired(true))
                .addRoleOption(opt => opt.setName('anti_role').setDescription('الرول الذي سيتم حذفه تلقائياً.').setRequired(true))
                .addBooleanOption(opt => opt.setName('removable').setDescription('هل يمكن للعضو إزالة الرول بالضغط مجدداً؟').setRequired(false))
            )
            .addSubcommand(sub => sub
                .setName('remove')
                .setDescription('إلغاء التعارض بين رتبتين.')
                .addRoleOption(opt => opt.setName('main_role').setDescription('الرول الأصلي.').setRequired(true))
                .addRoleOption(opt => opt.setName('anti_role').setDescription('الرول الذي تريد إزالته من قائمة التعارض.').setRequired(true))
            )
            .addSubcommand(sub => sub
                .setName('show')
                .setDescription('عرض الرتب المضادة المسجلة لرتبة معينة.')
                .addRoleOption(opt => opt.setName('role').setDescription('الرول الذي تريد كشف إعداداته.').setRequired(true))
            )
        )

        // ==========================
        // 2. قسم إنشاء وتعديل القوائم
        // ==========================
        .addSubcommandGroup(group => group
            .setName('menu')
            .setDescription('إنشاء وتعديل قوائم الرتب.')
            .addSubcommand(sub => sub
                .setName('create')
                .setDescription('انشئ إيمبد رولات جديد.')
                .addChannelOption(opt => opt.setName('channel').setDescription('اختر القناة').setRequired(true).addChannelTypes(ChannelType.GuildText))
                .addStringOption(opt => opt.setName('title').setDescription('عنوان الإيمبد').setRequired(true))
                .addStringOption(opt => opt.setName('roles').setDescription('آيديات الرولات (مفصولين بفراغ).').setRequired(true))
                .addStringOption(opt => opt.setName('desc').setDescription('وصف الإيمبد.').setRequired(false))
                .addStringOption(opt => opt.setName('color').setDescription('لون الإيمبد كـ هيكس كود.').setRequired(false))
                .addStringOption(opt => opt.setName('image').setDescription('رابط صورة الإيمبد.').setRequired(false))
                .addStringOption(opt => opt.setName('footer').setDescription('النص الذي يظهر أسفل الإيمبد.').setRequired(false))
                .addStringOption(opt => opt.setName('copy_id').setDescription('آيدي رسالة لنسخ محتواها إلى الوصف.').setRequired(false))
            )
            // 🔥 الأمر الجديد لتعديل الإيمبد الخاص بالقائمة 🔥
            .addSubcommand(sub => sub
                .setName('edit')
                .setDescription('تعديل إيمبد قائمة رتب موجودة.')
                .addStringOption(opt => opt.setName('msg_id').setDescription('آيدي رسالة القائمة.').setRequired(true))
                .addStringOption(opt => opt.setName('title').setDescription('عنوان الإيمبد الجديد.').setRequired(false))
                .addStringOption(opt => opt.setName('desc').setDescription('وصف الإيمبد الجديد.').setRequired(false))
                .addStringOption(opt => opt.setName('color').setDescription('لون الإيمبد كـ هيكس كود.').setRequired(false))
                .addStringOption(opt => opt.setName('image').setDescription('رابط صورة الإيمبد (اكتب remove للحذف).').setRequired(false))
                .addStringOption(opt => opt.setName('footer').setDescription('النص أسفل الإيمبد (اكتب remove للحذف).').setRequired(false))
                .addStringOption(opt => opt.setName('copy_id').setDescription('آيدي رسالة لنسخ محتواها إلى الوصف.').setRequired(false))
            )
            .addSubcommand(sub => sub
                .setName('add_option')
                .setDescription('إضافة خيار رول جديد في قائمة موجودة.')
                .addStringOption(opt => opt.setName('msg_id').setDescription('آيدي رسالة القائمة.').setRequired(true))
                .addRoleOption(opt => opt.setName('role').setDescription('الرول الممنوح.').setRequired(true))
                .addStringOption(opt => opt.setName('label').setDescription('النص الظاهر.').setRequired(true))
                .addStringOption(opt => opt.setName('value').setDescription('قيمة فريدة للخيار.').setRequired(true))
                .addStringOption(opt => opt.setName('emoji').setDescription('إيموجي الخيار.').setRequired(false))
                .addStringOption(opt => opt.setName('desc').setDescription('وصف قصير تحت الخيار.').setRequired(false))
            )
            .addSubcommand(sub => sub
                .setName('remove_option')
                .setDescription('إزالة خيار رول من قائمة.')
                .addStringOption(opt => opt.setName('msg_id').setDescription('آيدي رسالة القائمة.').setRequired(true))
                .addRoleOption(opt => opt.setName('role').setDescription('الرول المراد إزالته.').setRequired(true))
            )
            .addSubcommand(sub => sub
                .setName('edit_option')
                .setDescription('تعديل إيموجي، نص، أو وصف خيار.')
                .addStringOption(opt => opt.setName('msg_id').setDescription('آيدي رسالة القائمة.').setRequired(true))
                .addRoleOption(opt => opt.setName('role').setDescription('الرول المراد تعديله.').setRequired(true))
                .addStringOption(opt => opt.setName('new_emoji').setDescription('الإيموجي الجديد.').setRequired(false))
                .addStringOption(opt => opt.setName('new_label').setDescription('النص الجديد.').setRequired(false))
                .addStringOption(opt => opt.setName('new_desc').setDescription('الوصف الجديد.').setRequired(false))
            )
        )

        // ==========================
        // 3. قسم الأدوات والإدارة
        // ==========================
        .addSubcommandGroup(group => group
            .setName('tools')
            .setDescription('أدوات متقدمة للقوائم.')
            .addSubcommand(sub => sub
                .setName('lock')
                .setDescription('قفل أو فتح القائمة.')
                .addStringOption(opt => opt.setName('msg_id').setDescription('آيدي الرسالة.').setRequired(true))
                .addBooleanOption(opt => opt.setName('state').setDescription('مغلقة = True, مفتوحة = False').setRequired(true))
            )
            .addSubcommand(sub => sub
                .setName('register')
                .setDescription('تسجيل قائمة رتب غير محفوظة في الداتابيس.')
                .addStringOption(opt => opt.setName('msg_id').setDescription('آيدي الرسالة.').setRequired(true))
            )
            .addSubcommand(sub => sub
                .setName('import')
                .setDescription('استيراد إعدادات رتب مضادة من ملف JSON.')
                .addAttachmentOption(opt => opt.setName('file').setDescription('ملف الـ JSON').setRequired(true))
            )
            .addSubcommand(sub => sub
                .setName('copy')
                .setDescription('نسخ إيمبد قائمة رتب لقناة أخرى.')
                .addStringOption(opt => opt.setName('msg_id').setDescription('آيدي الرسالة الأصلية.').setRequired(true))
                .addChannelOption(opt => opt.setName('channel').setDescription('القناة الجديدة.').setRequired(true).addChannelTypes(ChannelType.GuildText))
            )
        ),

    name: 'rr-admin',
    aliases: ['rradmin'],
    category: "Admin",

    async execute(interaction, args) {
        if (!interaction.isChatInputCommand) return interaction.reply("هذا الأمر متاح كأمر سلاش فقط.");

        const db = interaction.client.sql;
        if (!db) return interaction.reply({ content: '❌ خطأ: قاعدة البيانات غير متصلة.', ephemeral: true });

        // بناء الجداول إذا لم تكن موجودة
        try {
            await db.query(`CREATE TABLE IF NOT EXISTS role_settings ("role_id" TEXT PRIMARY KEY, "anti_roles" TEXT, "is_removable" INTEGER DEFAULT 1)`);
            await db.query(`CREATE TABLE IF NOT EXISTS role_menus_master ("message_id" TEXT PRIMARY KEY, "custom_id" TEXT, "is_locked" INTEGER DEFAULT 0)`);
            await db.query(`CREATE TABLE IF NOT EXISTS role_menu_items ("message_id" TEXT, "value" TEXT, "role_id" TEXT, "description" TEXT, "emoji" TEXT)`);
        } catch (e) {
            console.error("Database setup error in Reaction Roles:", e);
        }

        const group = interaction.options.getSubcommandGroup();
        const subcommand = interaction.options.getSubcommand();
        await interaction.deferReply({ ephemeral: true });

        // ============================================================
        // 🛡️ 1. الرتب المضادة (Anti-Role)
        // ============================================================
        if (group === 'anti-role') {
            if (subcommand === 'add') {
                const mainRole = interaction.options.getRole('main_role');
                const antiRole = interaction.options.getRole('anti_role');
                const isRemovableInput = interaction.options.getBoolean('removable');

                if (mainRole.id === antiRole.id) return interaction.editReply("❌ لا يمكن أن تكون الرتبة مضادة لنفسها.");

                const currentRes = await db.query(`SELECT * FROM role_settings WHERE "role_id" = $1`, [mainRole.id]);
                let currentSettings = currentRes.rows[0];

                let antiRolesList = [];
                let isRemovable = 1; 

                if (currentSettings) {
                    if (currentSettings.anti_roles && currentSettings.anti_roles.length > 0) {
                        antiRolesList = currentSettings.anti_roles.split(',');
                    }
                    isRemovable = currentSettings.is_removable;
                }

                if (!antiRolesList.includes(antiRole.id)) {
                    antiRolesList.push(antiRole.id);
                } else {
                    return interaction.editReply(`ℹ️ الرول **${antiRole.name}** مضاف بالفعل كرتبة مضادة لـ **${mainRole.name}**.`);
                }

                if (isRemovableInput !== null) isRemovable = isRemovableInput ? 1 : 0;
                const newAntiRolesStr = antiRolesList.join(',');

                await db.query(`
                    INSERT INTO role_settings ("role_id", "anti_roles", "is_removable") 
                    VALUES ($1, $2, $3)
                    ON CONFLICT("role_id") DO UPDATE SET 
                    "anti_roles" = EXCLUDED."anti_roles",
                    "is_removable" = EXCLUDED."is_removable"
                `, [mainRole.id, newAntiRolesStr, isRemovable]);

                await loadRoleSettings(db, interaction.client.antiRolesCache);
                return interaction.editReply(`✅ **تم التحديث:**\nعند اختيار **${mainRole.name}**، سيتم إزالة **${antiRole.name}** تلقائياً.`);
            }

            else if (subcommand === 'remove') {
                const mainRole = interaction.options.getRole('main_role');
                const antiRole = interaction.options.getRole('anti_role');

                const currentRes = await db.query(`SELECT * FROM role_settings WHERE "role_id" = $1`, [mainRole.id]);
                let currentSettings = currentRes.rows[0];

                if (!currentSettings || !currentSettings.anti_roles) {
                    return interaction.editReply(`❌ لا توجد أي رتب مضادة مسجلة لـ **${mainRole.name}**.`);
                }

                let antiRolesList = currentSettings.anti_roles.split(',');
                if (!antiRolesList.includes(antiRole.id)) {
                    return interaction.editReply(`❌ الرول **${antiRole.name}** ليس مسجلاً كمضاد لـ **${mainRole.name}**.`);
                }

                antiRolesList = antiRolesList.filter(id => id !== antiRole.id);
                
                if (antiRolesList.length === 0) {
                    await db.query(`DELETE FROM role_settings WHERE "role_id" = $1`, [mainRole.id]);
                } else {
                    await db.query(`UPDATE role_settings SET "anti_roles" = $1 WHERE "role_id" = $2`, [antiRolesList.join(','), mainRole.id]);
                }

                await loadRoleSettings(db, interaction.client.antiRolesCache);
                return interaction.editReply(`✅ تم فك الارتباط: **${antiRole.name}** لم يعد يتعارض مع **${mainRole.name}**.`);
            }

            else if (subcommand === 'show') {
                const role = interaction.options.getRole('role');
                const setRes = await db.query(`SELECT * FROM role_settings WHERE "role_id" = $1`, [role.id]);
                const settings = setRes.rows[0];

                if (!settings) return interaction.editReply(`ℹ️ لا توجد إعدادات خاصة أو رتب مضادة لـ **${role.name}**.`);

                const antiRolesIds = settings.anti_roles ? settings.anti_roles.split(',') : [];
                const antiRolesMentions = antiRolesIds.map(id => {
                    const r = interaction.guild.roles.cache.get(id);
                    return r ? `${r} (\`${id}\`)` : `Deleted Role (\`${id}\`)`;
                });

                const embed = new EmbedBuilder()
                    .setTitle(`⚙️ إعدادات الرتبة: ${role.name}`)
                    .setColor(role.color || 'Blue')
                    .addFields(
                        { name: '📥 قابل للإزالة (Toggle)', value: settings.is_removable ? '✅ نعم' : '❌ لا (إجباري)', inline: true },
                        { name: '🚫 الرتب المضادة (سيتم حذفها)', value: antiRolesMentions.length > 0 ? antiRolesMentions.join('\n') : 'لا يوجد', inline: false }
                    );

                return interaction.editReply({ embeds: [embed] });
            }
        }

        // ============================================================
        // 📋 2. قوائم الرتب (Menus)
        // ============================================================
        else if (group === 'menu') {
            
            // --- إنشاء قائمة ---
            if (subcommand === 'create') {
                const channel = interaction.options.getChannel('channel');
                const title = interaction.options.getString('title');
                const descriptionInput = interaction.options.getString('desc');
                const rolesInput = interaction.options.getString('roles');
                const imageUrl = interaction.options.getString('image');
                const colorInput = interaction.options.getString('color');
                const footerText = interaction.options.getString('footer'); 
                const copyId = interaction.options.getString('copy_id');

                let finalDescription = descriptionInput;

                if (copyId) {
                    try {
                        const msgToCopy = await interaction.channel.messages.fetch(copyId);
                        const copiedContent = msgToCopy.content || msgToCopy.embeds[0]?.description || null;
                        if (copiedContent !== null) finalDescription = copiedContent;
                    } catch {
                        return interaction.editReply({ content: '❌ لم أستطع العثور على الرسالة بالـ ID للنسخ.' });
                    }
                }

                if (!finalDescription) finalDescription = '\u200B'; 
                const roleIds = cleanRoleIds(rolesInput);
                if (roleIds.length === 0) return interaction.editReply({ content: '❌ يجب إدخال آيديات رولات صحيحة.' });

                const options = [];
                const rolesToInsert = [];
                const uniqueRoleIds = [...new Set(roleIds)];

                for (const roleId of uniqueRoleIds) {
                    const role = interaction.guild.roles.cache.get(roleId);
                    if (role) {
                        const value = `rr_role_${roleId}`;
                        options.push(new StringSelectMenuOptionBuilder().setLabel(role.name).setValue(value));
                        rolesToInsert.push({ value, roleId: role.id, label: role.name });
                    }
                }

                if (options.length === 0) return interaction.editReply({ content: '❌ لم أستطع العثور على أي من الرولات المُدخلة.' });

                const menuCustomId = `rr_${Date.now()}`;
                const embed = new EmbedBuilder().setTitle(title).setDescription(finalDescription);
                embed.setColor(colorInput || 'Blue');
                if (imageUrl) embed.setImage(imageUrl);
                if (footerText) embed.setFooter({ text: footerText });

                const menu = new StringSelectMenuBuilder()
                    .setCustomId(menuCustomId)
                    .setPlaceholder('اختر رول...')
                    .addOptions(options.slice(0, 25))
                    .setMinValues(0)
                    .setMaxValues(options.length > 25 ? 25 : options.length);

                const sentMessage = await channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] });

                try {
                    await db.query("BEGIN");
                    await db.query(`INSERT INTO role_menus_master ("message_id", "custom_id", "is_locked") VALUES ($1, $2, $3)`, [sentMessage.id, menuCustomId, 0]);
                    for (const item of rolesToInsert) {
                        await db.query(`INSERT INTO role_menu_items ("message_id", "value", "role_id", "description") VALUES ($1, $2, $3, $4)`, [sentMessage.id, item.value, item.roleId, item.label]); 
                    }
                    await db.query("COMMIT");
                } catch (e) {
                    await db.query("ROLLBACK");
                    console.error("RR Create Error:", e);
                }

                return interaction.editReply({ content: `✅ تم إنشاء الإيمبد في ${channel}. آيدي الرسالة: \`${sentMessage.id}\`` });
            }

            // 🔥 --- تعديل قائمة (الإيمبد) --- 🔥
            else if (subcommand === 'edit') {
                const messageId = interaction.options.getString('msg_id');
                const title = interaction.options.getString('title');
                const descriptionInput = interaction.options.getString('desc');
                const colorInput = interaction.options.getString('color');
                const imageUrl = interaction.options.getString('image');
                const footerText = interaction.options.getString('footer');
                const copyId = interaction.options.getString('copy_id');

                const mRes = await db.query(`SELECT * FROM role_menus_master WHERE "message_id" = $1`, [messageId]);
                if (mRes.rows.length === 0) return interaction.editReply('❌ الرسالة ليست مسجلة كقائمة رتب.');

                const messageToEdit = await interaction.channel.messages.fetch(messageId).catch(() => null);
                if (!messageToEdit) return interaction.editReply('❌ لا يمكن العثور على الرسالة في هذه القناة.');

                const oldEmbed = messageToEdit.embeds[0];
                if (!oldEmbed) return interaction.editReply('❌ الرسالة لا تحتوي على إيمبد لتعديله.');

                let finalDescription = descriptionInput !== null ? descriptionInput : oldEmbed.description;

                if (copyId) {
                    try {
                        const msgToCopy = await interaction.channel.messages.fetch(copyId);
                        const copiedContent = msgToCopy.content || msgToCopy.embeds[0]?.description || null;
                        if (copiedContent !== null) finalDescription = copiedContent;
                    } catch {
                        return interaction.editReply({ content: '❌ لم أستطع العثور على الرسالة بالـ ID للنسخ.' });
                    }
                }

                const newEmbed = EmbedBuilder.from(oldEmbed);
                
                if (title !== null) newEmbed.setTitle(title);
                if (finalDescription !== null) newEmbed.setDescription(finalDescription);
                if (colorInput !== null) newEmbed.setColor(colorInput);
                
                if (imageUrl !== null) {
                    if (imageUrl.toLowerCase() === 'remove') newEmbed.setImage(null);
                    else newEmbed.setImage(imageUrl);
                }

                if (footerText !== null) {
                    if (footerText.toLowerCase() === 'remove') newEmbed.setFooter(null);
                    else newEmbed.setFooter({ text: footerText });
                }

                await messageToEdit.edit({ embeds: [newEmbed] });
                return interaction.editReply(`✅ تم تعديل الإيمبد بنجاح.`);
            }

            // --- إضافة خيار ---
            else if (subcommand === 'add_option') {
                const messageId = interaction.options.getString('msg_id');
                const role = interaction.options.getRole('role');
                const label = interaction.options.getString('label');
                const value = interaction.options.getString('value');
                const emojiStr = interaction.options.getString('emoji');
                const descStr = interaction.options.getString('desc'); 

                const mRes = await db.query(`SELECT * FROM role_menus_master WHERE "message_id" = $1`, [messageId]);
                if (mRes.rows.length === 0) return interaction.editReply('❌ الرسالة ليست مسجلة كقائمة رتب.');

                const messageToEdit = await interaction.channel.messages.fetch(messageId).catch(() => null); 
                if (!messageToEdit || !messageToEdit.components[0] || messageToEdit.components[0].components[0].type !== 3)
                    return interaction.editReply('❌ الرسالة لا تحتوي على قائمة اختيار.');

                const currentMenu = StringSelectMenuBuilder.from(messageToEdit.components[0].components[0]);

                if (currentMenu.options.some(opt => opt.data.value === value)) return interaction.editReply('❌ القيمة مستخدمة بالفعل.');
                if (currentMenu.options.length >= 25) return interaction.editReply('❌ القائمة ممتلئة (25 خيار).');

                const newOption = new StringSelectMenuOptionBuilder().setLabel(label).setValue(value);
                if(emojiStr) newOption.setEmoji(emojiStr);
                if(descStr) newOption.setDescription(descStr);

                currentMenu.addOptions(newOption);
                currentMenu.setMaxValues(currentMenu.options.length);

                await db.query(`INSERT INTO role_menu_items ("message_id", "value", "role_id", "description", "emoji") VALUES ($1, $2, $3, $4, $5)`, [messageId, value, role.id, descStr, emojiStr]); 
                await messageToEdit.edit({ components: [new ActionRowBuilder().addComponents(currentMenu)] });

                return interaction.editReply(`✅ تم إضافة الرول ${role.name} بنجاح.`);
            }

            // --- إزالة خيار ---
            else if (subcommand === 'remove_option') {
                const messageId = interaction.options.getString('msg_id');
                const roleToRemove = interaction.options.getRole('role');

                const itemRes = await db.query(`SELECT "value" FROM role_menu_items WHERE "message_id" = $1 AND "role_id" = $2`, [messageId, roleToRemove.id]);
                if (itemRes.rows.length === 0) return interaction.editReply(`❌ الرول ${roleToRemove.name} غير موجود في هذه القائمة.`);
                
                const valueToRemove = itemRes.rows[0].value;
                const messageToEdit = await interaction.channel.messages.fetch(messageId).catch(() => null); 
                const currentMenu = StringSelectMenuBuilder.from(messageToEdit.components[0].components[0]);

                currentMenu.options = currentMenu.options.filter(opt => opt.data.value !== valueToRemove);
                currentMenu.setMaxValues(currentMenu.options.length > 0 ? currentMenu.options.length : 1);

                await db.query(`DELETE FROM role_menu_items WHERE "message_id" = $1 AND "value" = $2`, [messageId, valueToRemove]);
                await messageToEdit.edit({ components: [new ActionRowBuilder().addComponents(currentMenu)] });

                return interaction.editReply(`✅ تم إزالة الرول ${roleToRemove.name} بنجاح.`);
            }

            // --- تعديل خيار ---
            else if (subcommand === 'edit_option') {
                const messageId = interaction.options.getString('msg_id');
                const roleToEdit = interaction.options.getRole('role');

                const itemRes = await db.query(`SELECT "value", "description", "emoji" FROM role_menu_items WHERE "message_id" = $1 AND "role_id" = $2`, [messageId, roleToEdit.id]);
                if (itemRes.rows.length === 0) return interaction.editReply(`❌ الرول ${roleToEdit.name} غير موجود لتعديله.`);
                
                const dbItem = itemRes.rows[0];
                const newEmoji = interaction.options.getString('new_emoji');
                const newLabel = interaction.options.getString('new_label');
                const newDesc = interaction.options.getString('new_desc');

                const messageToEdit = await interaction.channel.messages.fetch(messageId).catch(() => null); 
                const currentMenu = StringSelectMenuBuilder.from(messageToEdit.components[0].components[0]);
                const optionIndex = currentMenu.options.findIndex(opt => opt.data.value === dbItem.value);
                const oldOption = currentMenu.options[optionIndex];

                let updatedEmoji = newEmoji !== null ? newEmoji : dbItem.emoji;
                let updatedLabel = newLabel !== null ? newLabel : oldOption.data.label;
                let updatedDescription = newDesc !== null ? newDesc : dbItem.description;

                const updatedOption = new StringSelectMenuOptionBuilder().setLabel(updatedLabel).setValue(dbItem.value);
                if (updatedEmoji) updatedOption.setEmoji(updatedEmoji);
                if (updatedDescription) updatedOption.setDescription(updatedDescription);

                currentMenu.options[optionIndex] = updatedOption;

                await db.query(`UPDATE role_menu_items SET "emoji" = $1, "description" = $2 WHERE "message_id" = $3 AND "value" = $4`, [updatedEmoji, updatedDescription, messageId, dbItem.value]);
                await messageToEdit.edit({ components: [new ActionRowBuilder().addComponents(currentMenu)] });

                return interaction.editReply(`✅ تم التحديث بنجاح.`);
            }
        }

        // ============================================================
        // ⚙️ 3. الأدوات المتفرقة (Tools)
        // ============================================================
        else if (group === 'tools') {
            
            if (subcommand === 'lock') {
                const messageId = interaction.options.getString('msg_id');
                const shouldLock = interaction.options.getBoolean('state');
                const isLockedInt = shouldLock ? 1 : 0;

                const res = await db.query(`UPDATE role_menus_master SET "is_locked" = $1 WHERE "message_id" = $2`, [isLockedInt, messageId]);
                if (res.rowCount === 0) return interaction.editReply('❌ الرسالة غير مسجلة.');

                return interaction.editReply(`✅ أصبحت القائمة: **${shouldLock ? 'مغلقة' : 'مفتوحة'}**.`);
            }

            else if (subcommand === 'register') {
                const messageId = interaction.options.getString('msg_id');
                const msg = await interaction.channel.messages.fetch(messageId).catch(() => null);
                if (!msg || !msg.components[0]?.components[0]) return interaction.editReply('❌ رسالة غير صالحة.');

                const selectMenu = msg.components[0].components[0];
                const existRes = await db.query(`SELECT "message_id" FROM role_menus_master WHERE "message_id" = $1`, [messageId]);
                if (existRes.rows.length > 0) return interaction.editReply('ℹ️ مسجلة مسبقاً.');

                const menuCustomId = selectMenu.customId || `rr_manual_${Date.now()}`;
                
                try {
                    await db.query("BEGIN");
                    await db.query(`INSERT INTO role_menus_master ("message_id", "custom_id", "is_locked") VALUES ($1, $2, 0)`, [messageId, menuCustomId]);
                    
                    let count = 0;
                    for (const option of selectMenu.options) {
                        const match = option.value.match(/(\d{17,19})/); 
                        const roleId = match ? match[0] : (option.value.length >= 17 ? option.value : null);
                        
                        if (roleId && interaction.guild.roles.cache.has(roleId)) {
                            await db.query(`INSERT INTO role_menu_items ("message_id", "value", "role_id", "description", "emoji") VALUES ($1, $2, $3, $4, $5)`, [messageId, option.value, roleId, option.description, option.emoji?.name]);
                            count++;
                        }
                    }
                    await db.query("COMMIT");

                    if (!selectMenu.customId) {
                        const newMenu = StringSelectMenuBuilder.from(selectMenu).setCustomId(menuCustomId);
                        await msg.edit({ components: [new ActionRowBuilder().addComponents(newMenu)] });
                    }
                    return interaction.editReply(`✅ مسجلة! الرتب المضافة: ${count}`);
                } catch(e) {
                    await db.query("ROLLBACK");
                    return interaction.editReply("❌ خطأ داخلي.");
                }
            }

            else if (subcommand === 'copy') {
                const originalMsgId = interaction.options.getString('msg_id');
                const newChannel = interaction.options.getChannel('channel');

                const originalMsg = await interaction.channel.messages.fetch(originalMsgId).catch(() => null);
                if (!originalMsg || originalMsg.embeds.length === 0) return interaction.editReply('❌ رسالة أو إيمبد غير صالح.');

                const masterRes = await db.query(`SELECT "custom_id", "is_locked" FROM role_menus_master WHERE "message_id" = $1`, [originalMsgId]);
                if (masterRes.rows.length === 0) return interaction.editReply('❌ غير مسجلة.');
                const masterEntry = masterRes.rows[0];

                const newCustomId = `rr_${Date.now()}_copy`;
                const newMenu = StringSelectMenuBuilder.from(originalMsg.components[0].components[0]).setCustomId(newCustomId);

                const sentMessage = await newChannel.send({ embeds: originalMsg.embeds, components: [new ActionRowBuilder().addComponents(newMenu)] });

                try {
                    await db.query("BEGIN");
                    await db.query(`INSERT INTO role_menus_master ("message_id", "custom_id", "is_locked") VALUES ($1, $2, $3)`, [sentMessage.id, newCustomId, masterEntry.is_locked]);
                    
                    const items = await db.query(`SELECT * FROM role_menu_items WHERE "message_id" = $1`, [originalMsgId]);
                    for (const item of items.rows) {
                        await db.query(`INSERT INTO role_menu_items ("message_id", "value", "role_id", "description", "emoji") VALUES ($1, $2, $3, $4, $5)`, [sentMessage.id, item.value, item.role_id, item.description, item.emoji]);
                    }
                    await db.query("COMMIT");
                    return interaction.editReply(`✅ نُسخت إلى ${newChannel}. آيدي الجديدة: \`${sentMessage.id}\``);
                } catch (e) {
                    await db.query("ROLLBACK");
                    return interaction.editReply("❌ خطأ.");
                }
            }

            else if (subcommand === 'import') {
                const file = interaction.options.getAttachment('file');
                if (!file.contentType.includes('application/json')) return interaction.editReply("❌ JSON فقط.");
                
                try {
                    const response = await axios.get(file.url);
                    const settingsArray = response.data;
                    if (!Array.isArray(settingsArray)) return interaction.editReply("❌ خطأ بتركيبة الـ JSON.");

                    await db.query("BEGIN");
                    await db.query(`DELETE FROM role_settings`);

                    let count = 0;
                    for (const item of settingsArray) {
                        if (item.role_id && Array.isArray(item.anti_roles)) {
                            const validAnti = item.anti_roles.filter(id => interaction.guild.roles.cache.has(id)).join(',');
                            if (interaction.guild.roles.cache.has(item.role_id)) {
                                await db.query(`INSERT INTO role_settings ("role_id", "anti_roles", "is_removable") VALUES ($1, $2, $3)`, [item.role_id, validAnti, item.is_removable ? 1 : 0]);
                                count++;
                            }
                        }
                    }
                    await db.query("COMMIT");
                    await loadRoleSettings(db, interaction.client.antiRolesCache);
                    return interaction.editReply(`✅ رُفعت! الإعدادات: ${count}`);
                } catch(e) {
                    await db.query("ROLLBACK");
                    return interaction.editReply("❌ فشل.");
                }
            }
        }
    }
};
