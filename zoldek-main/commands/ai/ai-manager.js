const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType } = require('discord.js');
const aiConfig = require('../../utils/aiConfig.js'); 
const aiLimitHandler = require('../../utils/aiLimitHandler.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ai')
        .setDescription('🤖 لوحة تحكم الذكاء الاصطناعي (الإمبراطورة)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        
        .addSubcommand(sub => 
            sub.setName('setup')
               .setDescription('✅ تفعيل الذكاء في قناة معينة بشكل دائم')
               .addChannelOption(option => option.setName('channel').setDescription('اختر القناة').setRequired(true))
               .addStringOption(option => 
                   option.setName('mode')
                   .setDescription('وضعية الشخصية')
                   .setRequired(true)
                   .addChoices(
                       { name: '🛡️ عام (SFW) - شخصية عادية', value: 'sfw' },
                       { name: '🔞 خاص (NSFW) - شخصية جريئة ومنحرفة', value: 'nsfw' }
                   )
               )
        )
        
        .addSubcommand(sub => 
            sub.setName('remove')
               .setDescription('❌ إيقاف الذكاء في قناة معينة')
               .addChannelOption(option => option.setName('channel').setDescription('اختر القناة').setRequired(true))
        )
        
        .addSubcommand(sub => 
            sub.setName('list')
               .setDescription('📜 عرض قائمة القنوات المفعلة')
        )
        
        .addSubcommand(sub =>
            sub.setName('category')
               .setDescription('🔒 قفل كتاغوري كامل بنظام الدفع (Pay to Chat)')
               .addStringOption(opt => 
                   opt.setName('action')
                      .setDescription('العملية')
                      .setRequired(true)
                      .addChoices(
                          { name: '🔒 قفل (Add Lock)', value: 'add' },
                          { name: '🔓 فك القفل (Remove Lock)', value: 'remove' }
                      )
               )
               .addChannelOption(opt => 
                   opt.setName('target')
                      .setDescription('اختر الكتاغوري')
                      .addChannelTypes(ChannelType.GuildCategory)
                      .setRequired(true)
               )
        )

        .addSubcommand(sub => 
            sub.setName('block')
               .setDescription('🚫 منع عضو من التحدث مع البوت')
               .addUserOption(option => option.setName('user').setDescription('العضو').setRequired(true))
        )
        
        .addSubcommand(sub => 
            sub.setName('unblock')
               .setDescription('🟢 السماح لعضو بالتحدث مع البوت مجدداً')
               .addUserOption(option => option.setName('user').setDescription('العضو').setRequired(true))
        )

        .addSubcommandGroup(group => group
            .setName('limit')
            .setDescription('إدارة حدود رسائل الذكاء الاصطناعي للرتب')
            .addSubcommand(sub => sub
                .setName('set')
                .setDescription('🤖 تحديد حد الرسائل اليومي لرتبة معينة')
                .addRoleOption(opt => opt.setName('role').setDescription('الرتبة المستهدفة').setRequired(true))
                .addIntegerOption(opt => opt.setName('amount').setDescription('عدد الرسائل اليومي المسموح').setRequired(true))
            )
            .addSubcommand(sub => sub
                .setName('show')
                .setDescription('📜 عرض قائمة حدود الذكاء الاصطناعي')
            )
        ),

    name: 'ai-admin',
    aliases: ['set-ai-limit', 'ailimit', 'setlimit', 'حد-الذكاء'],
    category: 'Admin',

    async execute(interactionOrMessage, args) {
        
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        
        if (!isSlash) {
            const message = interactionOrMessage;
            if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return message.reply('❌ ليس لديك صلاحية استخدام هذا الأمر.');
            }

            if (args[0] && ['list', 'قائمة', 'info'].includes(args[0].toLowerCase())) {
                const db = message.client.sql;
                const limitsRes = await db.query(`SELECT * FROM ai_role_limits WHERE "guildID" = $1 ORDER BY "limitCount" ASC`, [message.guild.id]);
                const limits = limitsRes.rows;

                if (limits.length === 0) {
                    return message.reply('ℹ️ **لم يتم تحديد أي حدود للرتب حتى الآن.**');
                }

                const description = limits.map((row, index) => {
                    const roleId = row.roleID || row.roleid;
                    const limitCount = row.limitCount || row.limitcount;
                    const role = message.guild.roles.cache.get(roleId);
                    const roleName = role ? role.toString() : `\`Deleted Role (${roleId})\``;
                    return `**${index + 1}.** ${roleName} ➔ **${limitCount}** رسالة/يومياً`;
                }).join('\n');

                const listEmbed = new EmbedBuilder()
                    .setColor(0xD4AF37)
                    .setTitle('📜 قائمة حدود الذكاء الاصطناعي (AI Limits)')
                    .setDescription(description)
                    .setFooter({ text: `عدد الرتب المحددة: ${limits.length}`, iconURL: message.guild.iconURL() })
                    .setTimestamp();

                return message.reply({ embeds: [listEmbed] });
            }

            if (!args[0] || !args[1]) {
                return message.reply(`💡 **طريقة الاستخدام:**\n1️⃣ للتعيين: \`${args.prefix}ailimit [الرتبة] [العدد]\`\n2️⃣ للقائمة: \`${args.prefix}ailimit list\``);
            }

            const role = message.mentions.roles.first() || message.guild.roles.cache.get(args[0]);
            const limit = parseInt(args[1]);

            if (!role) {
                return message.reply('❌ لم أتمكن من العثور على هذه الرتبة.');
            }

            if (isNaN(limit) || limit < 0) {
                return message.reply('❌ يرجى إدخال عدد صحيح للحد اليومي.');
            }

            try {
                await aiLimitHandler.setRoleLimit(message.guild.id, role.id, limit, message.client.sql);

                const embed = new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setTitle('✅ تم تحديث الحدود بنجاح')
                    .setDescription(`تم تعيين الحد اليومي لرتبة **${role.name}** ليكون **${limit}** رسالة.`)
                    .addFields(
                        { name: '🎭 الرتبة', value: `${role}`, inline: true },
                        { name: '🔢 الحد اليومي', value: `${limit} رسالة`, inline: true }
                    )
                    .setFooter({ text: 'نظام الذكاء الاصطناعي', iconURL: message.guild.iconURL() })
                    .setTimestamp();

                return await message.reply({ embeds: [embed] });

            } catch (error) {
                console.error("[Set AI Limit Error]:", error);
                return await message.reply('❌ حدث خطأ أثناء حفظ البيانات.');
            }
        }

        const interaction = interactionOrMessage;
        const subcommandGroup = interaction.options.getSubcommandGroup();
        const subcommand = interaction.options.getSubcommand();

        if (subcommandGroup === 'limit') {
            const db = interaction.client.sql;
            
            if (subcommand === 'set') {
                const role = interaction.options.getRole('role');
                const limit = interaction.options.getInteger('amount');
                
                try {
                    await aiLimitHandler.setRoleLimit(interaction.guild.id, role.id, limit, db);
                    const embed = new EmbedBuilder()
                        .setColor(0x00FF00)
                        .setTitle('✅ تم تحديث الحدود بنجاح')
                        .setDescription(`تم تعيين الحد اليومي لرتبة **${role.name}** ليكون **${limit}** رسالة.`)
                        .addFields(
                            { name: '🎭 الرتبة', value: `${role}`, inline: true },
                            { name: '🔢 الحد اليومي', value: `${limit} رسالة`, inline: true }
                        )
                        .setFooter({ text: 'نظام الذكاء الاصطناعي', iconURL: interaction.guild.iconURL() })
                        .setTimestamp();
                    return interaction.reply({ embeds: [embed], ephemeral: true });
                } catch (e) {
                    console.error("[Slash Set AI Limit Error]:", e);
                    return interaction.reply({ content: '❌ حدث خطأ أثناء حفظ البيانات.', ephemeral: true });
                }
            }
            
            if (subcommand === 'show') {
                const limitsRes = await db.query(`SELECT * FROM ai_role_limits WHERE "guildID" = $1 ORDER BY "limitCount" ASC`, [interaction.guild.id]);
                const limits = limitsRes.rows;

                if (limits.length === 0) {
                    return interaction.reply({ content: 'ℹ️ **لم يتم تحديد أي حدود للرتب حتى الآن.**', ephemeral: true });
                }

                const description = limits.map((row, index) => {
                    const roleId = row.roleID || row.roleid;
                    const limitCount = row.limitCount || row.limitcount;
                    const role = interaction.guild.roles.cache.get(roleId);
                    const roleName = role ? role.toString() : `\`Deleted Role (${roleId})\``;
                    return `**${index + 1}.** ${roleName} ➔ **${limitCount}** رسالة/يومياً`;
                }).join('\n');

                const listEmbed = new EmbedBuilder()
                    .setColor(0xD4AF37)
                    .setTitle('📜 قائمة حدود الذكاء الاصطناعي (AI Limits)')
                    .setDescription(description)
                    .setFooter({ text: `عدد الرتب المحددة: ${limits.length}`, iconURL: interaction.guild.iconURL() })
                    .setTimestamp();

                return interaction.reply({ embeds: [listEmbed], ephemeral: true });
            }
        }

        if (subcommand === 'setup') {
            const channel = interaction.options.getChannel('channel');
            const mode = interaction.options.getString('mode');
            const isNsfw = mode === 'nsfw';

            await aiConfig.addChannel(channel.id, isNsfw); 

            const embed = new EmbedBuilder()
                .setColor(isNsfw ? 0xFF0000 : 0x00FF00)
                .setTitle('✅ تم تفعيل النظام بنجاح')
                .setDescription(`**القناة:** ${channel}\n**الوضع:** ${isNsfw ? '🔞 خاص (NSFW)' : '🛡️ عام (SFW)'}`)
                .setFooter({ text: 'الإمبراطورة جاهزة للعمل' });
            
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (subcommand === 'remove') {
            const channel = interaction.options.getChannel('channel');
            await aiConfig.removeChannel(channel.id);
            return interaction.reply({ content: `✅ **تم إيقاف** خدمات الذكاء الاصطناعي في قناة ${channel}.`, ephemeral: true });
        }

        if (subcommand === 'list') {
            const channels = await aiConfig.getAllChannels();
            const channelList = Object.entries(channels).map(([id, settings]) => {
                return `<#${id}> : ${settings.nsfw ? '🔞 **خاص**' : '🛡️ **عام**'}`;
            }).join('\n');

            const embed = new EmbedBuilder()
                .setColor(0xD4AF37)
                .setTitle('📜 قنوات الذكاء الاصطناعي المفعلة')
                .setDescription(channelList || "🚫 **لا توجد قنوات مفعلة حالياً.**");

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (subcommand === 'category') {
            const action = interaction.options.getString('action');
            const category = interaction.options.getChannel('target');

            if (action === 'add') {
                await aiConfig.addRestrictedCategory(interaction.guild.id, category.id);
                return interaction.reply({ 
                    content: `🔒 **تم قفل الكتاغوري بنجاح:** ${category.name}\n\n📌 **كيف يعمل؟**\nأي شخص يحاول التحدث مع البوت في أي قناة داخل هذا الكتاغوري، سيطلب منه البوت دفع **1000 مورا** لفتح القناة لمدة 24 ساعة.`,
                    ephemeral: true 
                });
            } else {
                await aiConfig.removeRestrictedCategory(category.id);
                return interaction.reply({ 
                    content: `🔓 **تم فك القفل عن الكتاغوري:** ${category.name}\nالآن يمكن التحدث بحرية (إذا كانت القنوات مفعلة بـ setup).`, 
                    ephemeral: true 
                });
            }
        }

        if (subcommand === 'block') {
            const user = interaction.options.getUser('user');
            await aiConfig.blockUser(user.id);
            return interaction.reply({ content: `🚫 **تم حظر** العضو ${user} من استخدام البوت.`, ephemeral: true });
        }

        if (subcommand === 'unblock') {
            const user = interaction.options.getUser('user');
            await aiConfig.unblockUser(user.id);
            return interaction.reply({ content: `🟢 **تم فك الحظر** عن العضو ${user}.`, ephemeral: true });
        }
    }
};
