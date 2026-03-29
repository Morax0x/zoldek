const { EmbedBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, PermissionsBitField, Colors } = require("discord.js");

let GHOST_ROLE_ID = null; 

const internalCache = new Map();

async function loadRoleSettings(db, antiRolesCache = internalCache) {
    antiRolesCache.clear();
    
    if (!db) return;

    try {
        const res = await db.query("SELECT role_id, anti_roles, is_removable FROM role_settings");
        const rows = res.rows;
        
        for (const row of rows) {
            const antiRolesList = row.anti_roles ? row.anti_roles.split(',').map(id => id.trim()).filter(id => id.length > 0) : [];
            antiRolesCache.set(row.role_id, {
                anti_roles: antiRolesList,
                is_removable: Boolean(row.is_removable)
            });
        }
        console.log(`[Reaction Roles] تم تحميل ${antiRolesCache.size} إعداد رول في الذاكرة.`);
    } catch (e) {
        console.log("[Reaction Roles] لم يتم العثور على جداول الإعدادات أو أنها فارغة.");
    }
}

function setGhostRole(roleId) {
    GHOST_ROLE_ID = roleId;
}

async function handleReactionRole(interaction, client, db, antiRolesCache) {
    try {
        if (!antiRolesCache) {
            antiRolesCache = internalCache;
            if (antiRolesCache.size === 0) {
                await loadRoleSettings(db, antiRolesCache);
            }
        }

        if (!db) {
             return interaction.reply({ content: "⚠️ قاعدة البيانات مشغولة حالياً (تحديث)، يرجى المحاولة بعد ثوانٍ.", ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        const guild = interaction.guild;
        const selectedValues = interaction.values;
        const member = interaction.member;
        const memberRoleIds = new Set(member.roles.cache.keys());

        const menuMasterRes = await db.query("SELECT is_locked FROM role_menus_master WHERE message_id = $1", [interaction.message.id]);
        const menuMaster = menuMasterRes.rows[0];

        if (!menuMaster) {
            return interaction.editReply({ content: '❌ حدث خطأ: هذه القائمة غير مسجلة في قاعدة البيانات.' });
        }
        
        const isLocked = menuMaster.is_locked === 1 || menuMaster.is_locked === true;

        const allMenuRoleDataRes = await db.query(`
            SELECT T1.role_id, T2.is_removable, T1.value
            FROM role_menu_items T1
            LEFT JOIN role_settings T2 ON T1.role_id = T2.role_id
            WHERE T1.message_id = $1
        `, [interaction.message.id]); 
        
        const allMenuRoleData = allMenuRoleDataRes.rows;
        
        let conflictDetected = false;
        
        if (isLocked) {
            const currentMenuRoles = allMenuRoleData.filter(roleData => memberRoleIds.has(roleData.role_id));

            if (currentMenuRoles.length > 0) {
                if (selectedValues.length === 0 || currentMenuRoles.some(roleData => !selectedValues.includes(roleData.value)) || selectedValues.length > 1) { 
                    const refusalMessage = `✥ اجـراء مرفـوض <:0dalami:1395674712473862185>\n- تـم تحديـد عرقـك بالفعـل لا يسمح بتغييـره `;
                    return interaction.editReply({ content: refusalMessage });
                }
            } else if (selectedValues.length > 1) {
                const refusalMessage = `✥ اجـراء مرفـوض <:0dalami:1395674712473862185>\n- يسمح لك بتحديد عرق واحد لا غير `;
                return interaction.editReply({ content: refusalMessage });
            }
        }
        
        const rolesToKeep = new Set();
        const rolesToAdd = [];
        let rolesToStrip = []; 
        
        if (!isLocked) {
            for (const selectedValue of selectedValues) {
                const menuData = allMenuRoleData.find(d => d.value === selectedValue);
                if (!menuData) continue;
                
                const targetRoleId = menuData.role_id;
                const roleSettings = antiRolesCache.get(targetRoleId) || {};
                const antiRoleIds = roleSettings.anti_roles || [];
                
                const selfConflict = antiRoleIds.some(id => selectedValues.includes(allMenuRoleData.find(d => d.role_id === id)?.value));

                if (selfConflict) {
                    conflictDetected = true;
                    break;
                }
            }
        }

        if (conflictDetected) { 
            if (GHOST_ROLE_ID && guild.roles.cache.has(GHOST_ROLE_ID)) {
                if (!memberRoleIds.has(GHOST_ROLE_ID)) {
                    await member.roles.add(GHOST_ROLE_ID, 'تضارب في اختيار الرتب المضادة');
                }
                const refusalMessage = `✥ حـددت رتـب متضـاربـة لذا تـم رفـض الاجراء وتم منحك رتـبة روح هائـمـة 👻`;
                return interaction.editReply({ content: refusalMessage });
            } else {
                const refusalMessage = `✥ اجـراء مرفـوض<:0dalami:1395674712473862185>\n- حدث تعارض بين الرتب المختارة.`;
                return interaction.editReply({ content: refusalMessage });
            }
        }

        for (const selectedValue of selectedValues) {
            const menuData = allMenuRoleData.find(d => d.value === selectedValue);
            if (!menuData) continue;

            const targetRoleId = menuData.role_id;
            const targetRole = guild.roles.cache.get(targetRoleId);
            if (!targetRole) continue;

            rolesToKeep.add(targetRoleId);

            if (!memberRoleIds.has(targetRoleId)) {
                rolesToAdd.push(targetRole);
            }

            const roleSettings = antiRolesCache.get(targetRoleId) || {};
            const antiRoleIds = roleSettings.anti_roles || [];

            for (const antiRoleId of antiRoleIds) {
                const antiRole = guild.roles.cache.get(antiRoleId);
                if (antiRole && memberRoleIds.has(antiRole.id) && !rolesToKeep.has(antiRole.id)) {
                    rolesToStrip.push(antiRole);
                }
            }
        }

        if (!isLocked) {
            for (const roleData of allMenuRoleData) {
                const roleId = roleData.role_id;
                
                const isRemovable = roleData.is_removable !== 0 && roleData.is_removable !== false; 

                if (isRemovable && memberRoleIds.has(roleId) && !rolesToKeep.has(roleId)) {
                    const roleToRemove = guild.roles.cache.get(roleId);
                    if(roleToRemove) {
                        rolesToStrip.push(roleToRemove);
                    }
                }
            }
        }
        
        const uniqueRolesToStrip = [...new Set(rolesToStrip)].filter(r => r && r.id !== GHOST_ROLE_ID); 
        const uniqueRolesToAdd = [...new Set(rolesToAdd)];

        try {
            if (uniqueRolesToStrip.length > 0) {
                await member.roles.remove(uniqueRolesToStrip, 'Reaction Role Update');
            }
            if (uniqueRolesToAdd.length > 0) {
                await member.roles.add(uniqueRolesToAdd, 'Reaction Role Update');
                
                // 🔥==================================================🔥
                // 🔥 النظام السحري: إعطاء السلاح والمهارة فوراً وبصمت 🔥
                // 🔥==================================================🔥
                try {
                    let raceRolesRes;
                    try { 
                        raceRolesRes = await db.query(`SELECT "roleID", "raceName" FROM race_roles WHERE "guildID" = $1`, [guild.id]); 
                    } catch(e) { 
                        raceRolesRes = await db.query(`SELECT roleid as "roleID", racename as "raceName" FROM race_roles WHERE guildid = $1`, [guild.id]).catch(()=>({rows:[]})); 
                    }
                    
                    if (raceRolesRes && raceRolesRes.rows.length > 0) {
                        for (const role of uniqueRolesToAdd) {
                            const matchedRace = raceRolesRes.rows.find(r => r.roleID === role.id || r.roleid === role.id);
                            if (matchedRace) {
                                const raceName = matchedRace.raceName || matchedRace.racename;
                                const userID = member.id;
                                const guildID = guild.id;

                                // 1. إعطاء السلاح بلفل 1 بصمت (لا يستبدل إذا كان موجوداً)
                                try {
                                    await db.query(`INSERT INTO user_weapons ("userID", "guildID", "raceName", "weaponLevel") VALUES ($1, $2, $3, 1) ON CONFLICT ("userID", "guildID", "raceName") DO NOTHING`, [userID, guildID, raceName]);
                                } catch(e) {
                                    await db.query(`INSERT INTO user_weapons (userid, guildid, racename, weaponlevel) VALUES ($1, $2, $3, 1) ON CONFLICT (userid, guildid, racename) DO NOTHING`, [userID, guildID, raceName]).catch(()=>{});
                                }

                                // 2. إعطاء المهارة العرقية بلفل 1 بصمت
                                const raceSkillId = `race_${raceName.toLowerCase().replace(/\s+/g, '_')}_skill`;
                                try {
                                    await db.query(`INSERT INTO user_skills ("userID", "guildID", "skillID", "skillLevel") VALUES ($1, $2, $3, 1) ON CONFLICT ("userID", "guildID", "skillID") DO NOTHING`, [userID, guildID, raceSkillId]);
                                } catch(e) {
                                    await db.query(`INSERT INTO user_skills (userid, guildid, skillid, skilllevel) VALUES ($1, $2, $3, 1) ON CONFLICT (userid, guildid, skillid) DO NOTHING`, [userID, guildID, raceSkillId]).catch(()=>{});
                                }
                                
                                console.log(`[Reaction-Roles Auto-Gear] Granted Level 1 Weapon & Skill for ${raceName} to ${member.user.username}`);
                            }
                        }
                    }
                } catch (err) {
                    console.error("[Auto-Gear Error in Reaction Roles]:", err);
                }
                // 🔥================= نهاية النظام السحري =================🔥
            }
        } catch (e) {
            console.error("RR Handler Error (Discord API):", e);
            return interaction.editReply({ content: "❌ حدث خطأ أثناء تعديل رتبك. (تأكد أن رتبة البوت أعلى من الرتب المطلوبة)" });
        }

        let responseMsg = '';
        const animatedEmoji = '<a:6HypedDance:1401907058047189127>';
        const idleEmoji = '<:1Hmmmm:1414570720704467035>';

        if (uniqueRolesToAdd.length > 0 || uniqueRolesToStrip.length > 0) {
            responseMsg += `> تـم تحديـث الـرتـب ${animatedEmoji}\n\n`;

            if (uniqueRolesToAdd.length > 0) {
                const addedMentions = uniqueRolesToAdd.map(r => `${r}`).join(' ');
                responseMsg += `- الرتب المضافة:\n${addedMentions}\n`;
            }

            if (uniqueRolesToStrip.length > 0) {
                const strippedMentions = uniqueRolesToStrip.map(r => `${r}`).join(' ');
                responseMsg += `- الـرتـب الـمزالــة:\n${strippedMentions}\n`;
            }
        } else {
            responseMsg = `❖ تـم التـحديـث لـم يتـم ازالـة او اضـافـة اي رتـبـة ${idleEmoji}`;
        }

        return interaction.editReply({ content: responseMsg });

    } catch (error) {
        console.error("[Reaction Role Handler] Fatal Error:", error);
        try {
            if (!interaction.replied && !interaction.deferred) {
                 await interaction.reply({ content: "❌ حدث خطأ داخلي.", ephemeral: true });
            } else {
                 await interaction.editReply({ content: "❌ حدث خطأ داخلي." });
            }
        } catch (e) {}
    }
}

module.exports = {
    handleReactionRole,
    loadRoleSettings,
    setGhostRole
};
