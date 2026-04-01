const { SlashCommandBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require("discord.js");
const Canvas = require('canvas');

const TEST_MODE = false;
const CHILDREN_PER_PAGE = 10; 

// 🔥 نظام ألوان وتصميم إمبراطوري احترافي جداً 🔥
const THEME = {
    BG_TOP: "#0d1117",
    BG_BOT: "#010409",
    GRID: "rgba(255, 255, 255, 0.02)",
    MALE: "#58a6ff",
    FEMALE: "#f778ba",
    DEFAULT: "#2ea043",
    GOLD: "#e2b714",
    LINE: "#30363d",
    LINE_GLOW: "rgba(88, 166, 255, 0.4)",
    TEXT: "#ffffff",
    NAME_BG: "rgba(13, 17, 23, 0.9)"
};

const DIMS = {
    NODE: 85, PARTNER: 70, KID: 65, GRAND: 50, GREAT_GRAND: 40, 
    PARENT: 75, GRANDPARENT: 55, SIBLING: 65,
    LEVEL_GAP: 280, SIB_GAP: 60,
};

const Y_GRANDPARENTS = 80;
const Y_PARENTS = Y_GRANDPARENTS + DIMS.LEVEL_GAP;
const Y_MAIN = Y_PARENTS + DIMS.LEVEL_GAP;
const Y_KIDS = Y_MAIN + DIMS.LEVEL_GAP;
const Y_GRAND = Y_KIDS + DIMS.LEVEL_GAP;
const Y_GREAT_GRAND = Y_GRAND + DIMS.LEVEL_GAP; 
const CANVAS_HEIGHT = Y_GREAT_GRAND + DIMS.GREAT_GRAND + 120;

// 🛡️ نظام معالجة استعلامات فولاذي 🛡️
const safeQuery = async (db, qPg, params) => {
    let res;
    try { 
        res = await db.query(qPg, params); 
    } catch(e) { 
        res = { rows: [] }; 
    }

    const rows1 = Array.isArray(res) ? res : (res?.rows || []);
    if (rows1.length > 0) return { rows: rows1 };

    let fallbackQuery = qPg
        .replace(/"userID"/gi, "userid")
        .replace(/"guildID"/gi, "guildid")
        .replace(/"parentID"/gi, "parentid")
        .replace(/"childID"/gi, "childid")
        .replace(/"partnerID"/gi, "partnerid");

    if (fallbackQuery !== qPg) {
        try { 
            let res2 = await db.query(fallbackQuery, params); 
            const rows2 = Array.isArray(res2) ? res2 : (res2?.rows || []);
            return { rows: rows2 };
        } catch(e2) { }
    }
    return { rows: [] };
};

// ⚡ كاش للصور لتسريع الرسم ⚡
const imageCache = new Map();

async function getCachedImage(url) {
    if (!url) return null;
    if (imageCache.has(url)) return imageCache.get(url);
    try {
        const img = await Canvas.loadImage(url);
        imageCache.set(url, img);
        return img;
    } catch {
        return null;
    }
}

async function getUserColor(client, userId, guild, db) {
    if (TEST_MODE) return THEME.DEFAULT;
    try {
        const configRes = await safeQuery(db, `SELECT "maleRole", "femaleRole" FROM family_config WHERE "guildID" = $1`, [guild.id]);
        const config = configRes.rows[0];
        if (!config) return THEME.DEFAULT;
        
        let member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
        if (!member) return THEME.DEFAULT;
        
        const checkRole = (rolesData) => {
            if (!rolesData) return false;
            try {
                const roleIds = JSON.parse(rolesData);
                if (Array.isArray(roleIds)) return roleIds.some(id => member.roles.cache.has(id));
            } catch {
                return member.roles.cache.has(rolesData);
            }
            return false;
        };

        if (checkRole(config.maleRole || config.malerole)) return THEME.MALE;
        if (checkRole(config.femaleRole || config.femalerole)) return THEME.FEMALE;
        return THEME.DEFAULT;
    } catch { return THEME.DEFAULT; }
}

async function drawTreePage(treeData, pageIndex) {
    const start = pageIndex * CHILDREN_PER_PAGE;
    const end = start + CHILDREN_PER_PAGE;
    const currentChildren = treeData.children.slice(start, end);

    let childBlocks = [];
    let childrenTotalWidth = 0;

    for (let child of currentChildren) {
        const spouseW = (child.partners.length * (DIMS.PARTNER * 2 + 20));
        const topW = (DIMS.KID * 2) + spouseW;
        
        let botW = 0;
        for (const grand of child.offspring) {
            const greatCount = grand.offspring ? grand.offspring.length : 0;
            const grandBlockW = Math.max(DIMS.GRAND * 2 + 20, greatCount * (DIMS.GREAT_GRAND * 2 + 10));
            botW += grandBlockW;
        }
        
        const blockW = Math.max(topW, botW, DIMS.KID * 2.5);
        childBlocks.push({ data: child, width: blockW, spouseW: spouseW });
        childrenTotalWidth += blockW + DIMS.SIB_GAP;
    }

    const leftSiblingsWidth = treeData.siblings.left.length * (DIMS.SIBLING * 2 + 30);
    const rightSiblingsWidth = treeData.siblings.right.length * (DIMS.SIBLING * 2 + 30);
    
    let parentsWidth = 0;
    for (const p of treeData.parents) {
        const gpCount = p.grandparents ? p.grandparents.length : 0;
        const pBlockW = Math.max(DIMS.PARENT * 2 + 50, gpCount * (DIMS.GRANDPARENT * 2 + 30));
        parentsWidth += pBlockW + 40;
    }

    const partnersWidth = (treeData.partners.length * (DIMS.PARTNER * 2 + 30)) + (DIMS.NODE * 2);
    const mainRowWidth = partnersWidth + leftSiblingsWidth + rightSiblingsWidth + 200;

    const canvasWidth = Math.max(childrenTotalWidth, mainRowWidth, parentsWidth, 1600) + 200;
    const centerX = canvasWidth / 2;

    const canvas = Canvas.createCanvas(canvasWidth, CANVAS_HEIGHT);
    const ctx = canvas.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    grad.addColorStop(0, THEME.BG_TOP);
    grad.addColorStop(1, THEME.BG_BOT);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvasWidth, CANVAS_HEIGHT);

    ctx.lineWidth = 1;
    ctx.strokeStyle = THEME.GRID;
    const gridSize = 40;
    for(let x=0; x<canvasWidth; x+=gridSize) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,CANVAS_HEIGHT); ctx.stroke(); }
    for(let y=0; y<CANVAS_HEIGHT; y+=gridSize) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(canvasWidth,y); ctx.stroke(); }

    const radGrad = ctx.createRadialGradient(centerX, Y_MAIN, 50, centerX, Y_MAIN, 800);
    radGrad.addColorStop(0, "rgba(226, 183, 20, 0.08)");
    radGrad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = radGrad;
    ctx.fillRect(0, 0, canvasWidth, CANVAS_HEIGHT);

    function drawNameLabel(name, x, y, color) {
        const fontSize = 18;
        ctx.font = `bold ${fontSize}px "Sans", "Arial"`;
        const textMetrics = ctx.measureText(name);
        const boxWidth = textMetrics.width + 30;
        const boxHeight = 36;
        const boxX = x - (boxWidth / 2);
        const boxY = y + 10;

        ctx.shadowColor = color;
        ctx.shadowBlur = 10;
        ctx.fillStyle = THEME.NAME_BG;
        ctx.beginPath();
        if(ctx.roundRect) ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 18);
        else ctx.rect(boxX, boxY, boxWidth, boxHeight);
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.lineWidth = 2;
        ctx.strokeStyle = color;
        ctx.stroke();

        ctx.fillStyle = THEME.TEXT;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(name, x, boxY + (boxHeight / 2));
    }

    const renderQueue = [];

    function queueAvatar(user, x, y, radius, isMain=false) {
        renderQueue.push({ user, x, y, radius, isMain });
    }

    function drawCurvedLine(x1, y1, x2, y2, color=THEME.LINE, width=3) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.bezierCurveTo(x1, y1 + (y2 - y1)/2, x2, y1 + (y2 - y1)/2, x2, y2);
        ctx.lineWidth = width;
        ctx.strokeStyle = color;
        ctx.shadowColor = THEME.LINE_GLOW;
        ctx.shadowBlur = 5;
        ctx.stroke();
        ctx.restore();
    }

    function drawHorizontalLine(x1, y1, x2, y2, color=THEME.LINE, width=3) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineWidth = width;
        ctx.strokeStyle = color;
        ctx.shadowColor = THEME.LINE_GLOW;
        ctx.shadowBlur = 5;
        ctx.stroke();
        ctx.restore();
    }

    let currentPX = centerX - (parentsWidth / 2) + 25;
    for(const p of treeData.parents) {
        const gpCount = p.grandparents ? p.grandparents.length : 0;
        const pBlockW = Math.max(DIMS.PARENT * 2 + 50, gpCount * (DIMS.GRANDPARENT * 2 + 30));
        const pCenterX = currentPX + (pBlockW / 2);

        if (gpCount > 0) {
            let gpX = pCenterX - ((gpCount * (DIMS.GRANDPARENT * 2 + 30)) / 2) + DIMS.GRANDPARENT;
            for (const gp of p.grandparents) {
                drawCurvedLine(pCenterX, Y_PARENTS, gpX, Y_GRANDPARENTS);
                queueAvatar(gp, gpX, Y_GRANDPARENTS, DIMS.GRANDPARENT);
                gpX += DIMS.GRANDPARENT * 2 + 30;
            }
        }
        
        drawCurvedLine(centerX, Y_MAIN, pCenterX, Y_PARENTS);
        queueAvatar(p, pCenterX, Y_PARENTS, DIMS.PARENT);
        currentPX += pBlockW + 40;
    }

    let pX = centerX + DIMS.NODE + 50;
    if (treeData.partners.length > 0) {
        let lastPx = centerX + DIMS.NODE + 50 + ((treeData.partners.length - 1) * (DIMS.PARTNER * 2 + 30));
        drawHorizontalLine(centerX, Y_MAIN, lastPx, Y_MAIN, THEME.FEMALE, 4);
    }
    
    for(const p of treeData.partners) {
        queueAvatar(p, pX, Y_MAIN, DIMS.PARTNER);
        pX += DIMS.PARTNER * 2 + 30;
    }

    const siblingsLineY = Y_MAIN - DIMS.NODE - 50;
    if (treeData.siblings.left.length > 0 || treeData.siblings.right.length > 0) {
        drawHorizontalLine(centerX, Y_MAIN, centerX, siblingsLineY, THEME.LINE, 3);
    }

    let sX = centerX - DIMS.NODE - 80;
    for(const sib of treeData.siblings.left) {
        drawHorizontalLine(centerX, siblingsLineY, sX, siblingsLineY, THEME.LINE, 3);
        drawHorizontalLine(sX, siblingsLineY, sX, Y_MAIN, THEME.LINE, 3);
        queueAvatar(sib, sX, Y_MAIN, DIMS.SIBLING);
        sX -= (DIMS.SIBLING * 2 + 30);
    }
    
    let rightStart = centerX + DIMS.NODE + (treeData.partners.length * (DIMS.PARTNER * 2 + 30)) + 80;
    for(const sib of treeData.siblings.right) {
        drawHorizontalLine(centerX, siblingsLineY, rightStart, siblingsLineY, THEME.LINE, 3);
        drawHorizontalLine(rightStart, siblingsLineY, rightStart, Y_MAIN, THEME.LINE, 3);
        queueAvatar(sib, rightStart, Y_MAIN, DIMS.SIBLING);
        rightStart += (DIMS.SIBLING * 2 + 30);
    }

    queueAvatar(treeData.main, centerX, Y_MAIN, DIMS.NODE, true);

    if (childBlocks.length > 0) {
        let currentX = centerX - (childrenTotalWidth / 2);
        for(const block of childBlocks) {
            const blockCenter = currentX + (block.width / 2);
            const kidRealX = blockCenter - (block.spouseW / 2);
            
            drawCurvedLine(centerX, Y_MAIN, kidRealX, Y_KIDS);
            queueAvatar(block.data, kidRealX, Y_KIDS, DIMS.KID);
            
            let spX = kidRealX + DIMS.KID + 30;
            let lastSpouseX = kidRealX;
            
            if (block.data.partners && block.data.partners.length > 0) {
                let endSpousePx = kidRealX + DIMS.KID + 30 + ((block.data.partners.length - 1) * (DIMS.PARTNER * 2 + 20));
                drawHorizontalLine(kidRealX, Y_KIDS, endSpousePx, Y_KIDS, THEME.FEMALE, 3);
                for (const sp of block.data.partners) {
                    queueAvatar(sp, spX, Y_KIDS, DIMS.PARTNER);
                    lastSpouseX = spX;
                    spX += DIMS.PARTNER * 2 + 20;
                }
            }

            let parentsCenterX = (kidRealX + lastSpouseX) / 2;
            if (block.data.offspring.length > 0) {
                let grandStartX = currentX; 
                for (const grand of block.data.offspring) {
                    const greatCount = grand.offspring ? grand.offspring.length : 0;
                    const grandBlockW = Math.max(DIMS.GRAND * 2 + 20, greatCount * (DIMS.GREAT_GRAND * 2 + 10));
                    const grandCenterX = grandStartX + (grandBlockW / 2);

                    drawCurvedLine(parentsCenterX, Y_KIDS, grandCenterX, Y_GRAND);
                    queueAvatar(grand, grandCenterX, Y_GRAND, DIMS.GRAND);

                    if (greatCount > 0) {
                        let greatX = grandStartX + DIMS.GREAT_GRAND + 10;
                        for (const great of grand.offspring) {
                            drawCurvedLine(grandCenterX, Y_GRAND, greatX, Y_GREAT_GRAND);
                            queueAvatar(great, greatX, Y_GREAT_GRAND, DIMS.GREAT_GRAND);
                            greatX += DIMS.GREAT_GRAND * 2 + 10;
                        }
                    }
                    grandStartX += grandBlockW;
                }
            }
            currentX += block.width + DIMS.SIB_GAP;
        }
    }

    for (const data of renderQueue) {
        const { user, x, y, radius, isMain } = data;
        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,0.8)";
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.closePath();
        ctx.fill(); 
        ctx.clip();

        try {
            if (user.avatarURL) {
                const img = await getCachedImage(user.avatarURL);
                if(img) ctx.drawImage(img, x - radius, y - radius, radius * 2, radius * 2);
                else {
                    ctx.fillStyle = "#161b22";
                    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
                }
            } else {
                ctx.fillStyle = "#161b22";
                ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
            }
        } catch (err) {
            ctx.fillStyle = "#161b22";
            ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
        }
        ctx.restore();

        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.lineWidth = isMain ? 7 : 4;
        ctx.strokeStyle = isMain ? THEME.GOLD : (user.color || THEME.DEFAULT);
        ctx.shadowColor = isMain ? THEME.GOLD : (user.color || THEME.DEFAULT);
        ctx.shadowBlur = 10;
        ctx.stroke();
        ctx.shadowBlur = 0; 
        
        const name = user.username || "مجهول";
        const shortName = name.length > 12 ? name.substring(0, 10)+".." : name;
        drawNameLabel(shortName, x, y + radius, isMain ? THEME.GOLD : (user.color || THEME.DEFAULT));
    }

    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = 'bold 24px "Sans", "Arial"';
    ctx.textAlign = 'right';
    ctx.fillText(`إمبراطورية العائلات - الصفحة ${pageIndex + 1}`, canvasWidth - 40, CANVAS_HEIGHT - 30);

    return new AttachmentBuilder(canvas.toBuffer(), { name: 'family-tree.png' });
}

module.exports = {
    name: 'tree',
    description: 'عرض شجرة العائلة الشاملة والموسعة بتصميم إمبراطوري',
    aliases: ['شجرة', 'family'],
    
    async execute(message, args) {
        const client = message.client;
        const guild = message.guild;
        const db = client.sql;

        const targetMember = message.mentions.members.first() || 
                             message.guild.members.cache.get(args[0]) || 
                             message.member;
                             
        const targetUser = targetMember.user;
        const guildId = guild.id;

        // 🔥 نظام منع الحلقات اللانهائية (Anti-Loop) 🔥
        const processedNodes = new Set();
        
        const allInvolvedUserIds = new Set();
        const addId = (id) => { if (id) allInvolvedUserIds.add(id); };
        addId(targetUser.id);

        const getParents = async (id) => {
            const res = await safeQuery(db, `SELECT "parentID" FROM children WHERE "childID" = $1 AND "guildID" = $2`, [id, guildId]);
            const pSet = new Set();
            res.rows.forEach(r => { if(r.parentID) pSet.add(r.parentID); if(r.parentid) pSet.add(r.parentid); });
            return Array.from(pSet);
        };

        const getChildren = async (id) => {
            const res = await safeQuery(db, `SELECT "childID" FROM children WHERE "parentID" = $1 AND "guildID" = $2`, [id, guildId]);
            const cSet = new Set();
            res.rows.forEach(r => { if(r.childID) cSet.add(r.childID); if(r.childid) cSet.add(r.childid); });
            return Array.from(cSet);
        };

        const getPartners = async (id) => {
            const res1 = await safeQuery(db, `SELECT "partnerID" FROM marriages WHERE "userID" = $1 AND "guildID" = $2`, [id, guildId]);
            const res2 = await safeQuery(db, `SELECT "userID" FROM marriages WHERE "partnerID" = $1 AND "guildID" = $2`, [id, guildId]);
            const pSet = new Set();
            res1.rows.forEach(r => { if(r.partnerID) pSet.add(r.partnerID); if(r.partnerid) pSet.add(r.partnerid); });
            res2.rows.forEach(r => { if(r.userID) pSet.add(r.userID); if(r.userid) pSet.add(r.userid); });
            return Array.from(pSet);
        };

        const directParents = await getParents(targetUser.id);
        directParents.forEach(addId);
        let allParentFigures = new Set(directParents);

        for (const pid of directParents) {
            if(processedNodes.has(pid)) continue;
            processedNodes.add(pid);
            const pPartners = await getPartners(pid);
            pPartners.forEach(id => { addId(id); allParentFigures.add(id); });
        }

        const parentDataMap = new Map();
        for (const pid of allParentFigures) {
            const gpIds = await getParents(pid);
            gpIds.forEach(addId);
            parentDataMap.set(pid, { grandparents: gpIds });
        }

        let siblingsSet = new Set();
        for (const pid of allParentFigures) {
            const kids = await getChildren(pid);
            kids.forEach(k => { if(k !== targetUser.id) { addId(k); siblingsSet.add(k); } });
        }

        const targetPartners = await getPartners(targetUser.id);
        targetPartners.forEach(addId);

        let allChildren = new Set(await getChildren(targetUser.id));
        for (const pid of targetPartners) {
            if(processedNodes.has(`part_${pid}`)) continue;
            processedNodes.add(`part_${pid}`);
            const pKids = await getChildren(pid);
            pKids.forEach(k => allChildren.add(k));
        }
        allChildren.forEach(addId);

        const childDataMap = new Map();
        for (const cid of allChildren) {
            const cPartners = await getPartners(cid);
            cPartners.forEach(addId);

            let cKids = new Set(await getChildren(cid));
            for (const cpid of cPartners) {
                if(processedNodes.has(`cpart_${cpid}`)) continue;
                processedNodes.add(`cpart_${cpid}`);
                const cpKids = await getChildren(cpid);
                cpKids.forEach(k => cKids.add(k));
            }
            cKids.forEach(addId);

            const grandMap = new Map();
            for (const gid of cKids) {
                const gPartners = await getPartners(gid);
                gPartners.forEach(addId);

                let gKids = new Set(await getChildren(gid));
                for(const gpid of gPartners) {
                     if(processedNodes.has(`gpart_${gpid}`)) continue;
                     processedNodes.add(`gpart_${gpid}`);
                     const gpKids = await getChildren(gpid);
                     gpKids.forEach(k => gKids.add(k));
                }
                gKids.forEach(addId);
                grandMap.set(gid, { partners: gPartners, offspring: Array.from(gKids) });
            }
            childDataMap.set(cid, { partners: cPartners, offspring: Array.from(cKids), grandMap: grandMap });
        }

        const allIDsArray = Array.from(allInvolvedUserIds);
        let membersMap = new Map(); 

        try {
            const fetchedMembers = await guild.members.fetch({ user: allIDsArray });
            fetchedMembers.forEach(m => membersMap.set(m.id, m));
        } catch (e) {
            allIDsArray.forEach(id => {
                const m = guild.members.cache.get(id);
                if (m) membersMap.set(id, m);
            });
        }

        const prepareUserObj = async (id) => {
            const m = membersMap.get(id);
            let username = "مجهول";
            let avatarURL = null;
            if (m) {
                username = m.user.username;
                avatarURL = m.user.displayAvatarURL({ extension: 'png', size: 256 });
            } else {
                try {
                    const u = await client.users.fetch(id);
                    username = u.username;
                    avatarURL = u.displayAvatarURL({ extension: 'png', size: 256 });
                } catch {
                    username = `عضو (${id.substring(0,4)}..)`;
                }
            }
            const color = m ? await getUserColor(client, id, guild, db) : THEME.DEFAULT;
            return { username, id, color, avatarURL };
        };

        const mainUserObj = await prepareUserObj(targetUser.id);
        if (!mainUserObj) return message.reply("❌ تعذر العثور على بيانات المستخدم.");

        let treeData = {
            main: mainUserObj,
            parents: [],
            partners: [],
            children: [],
            siblings: { left: [], right: [] }
        };

        for (const pid of allParentFigures) {
            const u = await prepareUserObj(pid);
            if (u) {
                const pData = parentDataMap.get(pid);
                let gpObjs = [];
                for(const gpId of pData.grandparents) {
                    const gpu = await prepareUserObj(gpId);
                    if(gpu) gpObjs.push(gpu);
                }
                treeData.parents.push({ ...u, grandparents: gpObjs });
            }
        }

        const siblingsArray = Array.from(siblingsSet);
        for (let i = 0; i < siblingsArray.length; i++) {
            const u = await prepareUserObj(siblingsArray[i]);
            if (u) {
                if (i % 2 === 0) treeData.siblings.left.push(u);
                else treeData.siblings.right.push(u);
            }
        }

        for (const pid of targetPartners) {
            const u = await prepareUserObj(pid);
            if (u) treeData.partners.push(u);
        }

        for (const cid of allChildren) {
            const childObj = await prepareUserObj(cid);
            if (!childObj) continue;

            const cData = childDataMap.get(cid);
            let cPartnersObjs = [];
            for (const cpid of cData.partners) {
                const u = await prepareUserObj(cpid);
                if (u) cPartnersObjs.push(u);
            }

            let grandObjs = [];
            for (const gid of cData.offspring) {
                const u = await prepareUserObj(gid);
                if (!u) continue;

                const gData = cData.grandMap.get(gid);
                let greatObjs = [];
                for (const greatId of gData.offspring) {
                    const gu = await prepareUserObj(greatId);
                    if (gu) greatObjs.push(gu);
                }
                grandObjs.push({ ...u, offspring: greatObjs });
            }

            treeData.children.push({
                ...childObj,
                partners: cPartnersObjs,
                offspring: grandObjs
            });
        }

        if (treeData.parents.length === 0 && treeData.partners.length === 0 && treeData.children.length === 0 && treeData.siblings.left.length === 0 && treeData.siblings.right.length === 0) {
            const msg = await message.reply({ content: `🍂 **شجرة ${targetUser.username} فارغة تماماً!**` });
            setTimeout(() => msg.delete().catch(() => {}), 5000);
            return; 
        }

        let currentPage = 0;
        const totalPages = Math.ceil(treeData.children.length / CHILDREN_PER_PAGE) || 1;

        const getButtons = (page) => {
            const row = new ActionRowBuilder();
            row.addComponents(
                new ButtonBuilder().setCustomId('prev_tree').setStyle(ButtonStyle.Secondary).setEmoji('1439164494759723029').setDisabled(page === 0),
                new ButtonBuilder().setCustomId('next_tree').setStyle(ButtonStyle.Secondary).setEmoji('1439164491072929915').setDisabled(page >= totalPages - 1)
            );
            return row;
        };

        // 🔥 تأمين عملية الرد لتجنب التعليق عند الحسابات الضخمة 🔥
        message.channel.sendTyping().catch(()=>{});
        
        try {
            const img = await drawTreePage(treeData, currentPage);
            const msg = await message.reply({ 
                files: [img],
                components: totalPages > 1 ? [getButtons(currentPage)] : []
            });

            if (!client.ignoredTreeMessages) client.ignoredTreeMessages = new Set();
            client.ignoredTreeMessages.add(msg.id);
            
            setTimeout(() => {
                client.ignoredTreeMessages.delete(msg.id);
            }, 10 * 60 * 1000);

            if (totalPages <= 1) return;

            const collector = msg.createMessageComponentCollector({ 
                filter: i => i.user.id === message.author.id, 
                time: 300000,
                componentType: ComponentType.Button 
            });

            collector.on('collect', async i => {
                if (i.customId === 'prev_tree') currentPage--;
                if (i.customId === 'next_tree') currentPage++;
                await i.deferUpdate().catch(()=>{});
                const newImg = await drawTreePage(treeData, currentPage);
                await i.editReply({ files: [newImg], components: [getButtons(currentPage)] }).catch(()=>{});
            });

            collector.on('end', () => msg.edit({ components: [] }).catch(()=>{}));
            
        } catch (fatalError) {
            console.error("Fatal Error generating tree:", fatalError);
            message.reply("❌ حدث خطأ فادح أثناء رسم شجرة العائلة، ربما الشجرة معقدة جداً أو تحتوي على علاقات متعارضة.").catch(()=>{});
        }
    }
};
