const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const path = require('path');

const TIERS = {
    bronze: { id: 'bronze', name: 'نحاسية', price: 100, color: 0xcd7f32, label: '100 نحاسية' },
    silver: { id: 'silver', name: 'فضية', price: 500, color: 0xc0c0c0, label: '500 فضية' },
    gold:   { id: 'gold',   name: 'ذهبية', price: 1000, color: 0xffd700, label: '1000 ذهبية' }
};

const SYMBOLS = {
    MORA_CROWN: { emoji: '👑', type: 'mora', multi: 10, name: 'التاج الإمبراطوري' },
    MORA_SWORD: { emoji: '⚔️', type: 'mora', multi: 3, name: 'سيف الفرسان' },
    MORA_FISH:  { emoji: '🐟', type: 'mora', multi: 1.5, name: 'السمكة الذهبية' },
    GACHA:      { emoji: '🎁', type: 'item', item: 'gacha_chest', name: 'صندوق غاتشا' },
    SEED:       { emoji: '🌱', type: 'item', item: 'seed', name: 'بذور زراعية' },
    ANIMAL:     { emoji: '🐄', type: 'item', item: 'animal', name: 'حيوان مزرعة' },
    BAIT:       { emoji: '🪱', type: 'item', item: 'bait', name: 'طعوم صيد' },
    POTION:     { emoji: '🧪', type: 'item', item: 'potion', name: 'جرعة دانجون' },
    REP:        { emoji: '🌟', type: 'rep', name: 'نقطة سمعة' },
    JOKER:      { emoji: '🧚‍♀️', type: 'joker' }, 
    MIMIC:      { emoji: '👹', type: 'mimic' },  
    JUNK:       ['🪨', '🪵', '🍄', '☁️', '🦴', '🍎', '🧩'] 
};

// 🛡️ نظام الحماية المزدوج
const activeProcesses = new Set(); // لمنع الضغط السريع على الأزرار
const activeGames = new Set(); // لمنع فتح أكثر من بطاقة في نفس الوقت

const EMPEROR_ID = '1145327691772481577'; 
const BANNER_IMAGE = 'https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev/images/img/sk.png'; 

let loadedSeeds = [], loadedPotions = [], loadedBaits = [], loadedAnimals = [];
try { loadedSeeds = require(path.join(process.cwd(), 'json', 'seeds.json')); } catch(e){}
try { loadedPotions = require(path.join(process.cwd(), 'json', 'potions.json')); } catch(e){}
try { loadedBaits = require(path.join(process.cwd(), 'json', 'baits.json')); } catch(e){}
try { loadedAnimals = require(path.join(process.cwd(), 'json', 'farm-animals.json')); } catch(e){}

const fallbackSeeds = ['seed_wheat', 'seed_carrot', 'seed_tomato', 'seed_potato'];
const fallbackPotions = ['health_potion_1', 'health_potion_2', 'strength_potion_1'];
const fallbackBaits = ['bait_worm', 'bait_meat', 'bait_magic'];
const fallbackAnimals = ['cow', 'chicken', 'sheep'];

const seedIds = loadedSeeds.length ? loadedSeeds.map(s => s.id) : fallbackSeeds;
const potionIds = loadedPotions.length ? loadedPotions.map(p => p.id) : fallbackPotions;
const baitIds = loadedBaits.length ? loadedBaits.map(b => b.id) : fallbackBaits;
const animalIds = loadedAnimals.length ? loadedAnimals.map(a => a.id) : fallbackAnimals;

function getRandomColor() {
    return Math.floor(Math.random() * 16777215);
}

function generateGrid(tierId) {
    const grid = [];
    for (let i = 0; i < 9; i++) {
        let r = Math.random() * 100;
        let randomJunk = SYMBOLS.JUNK[Math.floor(Math.random() * SYMBOLS.JUNK.length)];

        if (tierId === 'gold') {
            if (r < 10) grid.push(SYMBOLS.MIMIC.emoji);        
            else if (r < 11.5) grid.push(SYMBOLS.JOKER.emoji); 
            else if (r < 12) grid.push(SYMBOLS.REP.emoji);     
            else if (r < 14) grid.push(SYMBOLS.GACHA.emoji);   
            else if (r < 17) grid.push(SYMBOLS.ANIMAL.emoji);  
            else if (r < 21) grid.push(SYMBOLS.MORA_CROWN.emoji); 
            else if (r < 26) grid.push(SYMBOLS.POTION.emoji);  
            else if (r < 33) grid.push(SYMBOLS.MORA_SWORD.emoji); 
            else grid.push(randomJunk);                        
        } else if (tierId === 'silver') {
            if (r < 1) grid.push(SYMBOLS.JOKER.emoji);         
            else if (r < 2) grid.push(SYMBOLS.GACHA.emoji);    
            else if (r < 6) grid.push(SYMBOLS.POTION.emoji);   
            else if (r < 12) grid.push(SYMBOLS.MORA_SWORD.emoji); 
            else if (r < 20) grid.push(SYMBOLS.MORA_FISH.emoji);  
            else if (r < 28) grid.push(SYMBOLS.BAIT.emoji);    
            else grid.push(randomJunk);                        
        } else { 
            if (r < 0.5) grid.push(SYMBOLS.JOKER.emoji);       
            else if (r < 1) grid.push(SYMBOLS.GACHA.emoji);    
            else if (r < 7) grid.push(SYMBOLS.MORA_FISH.emoji);
            else if (r < 15) grid.push(SYMBOLS.BAIT.emoji);    
            else if (r < 25) grid.push(SYMBOLS.SEED.emoji);    
            else grid.push(randomJunk);                        
        }
    }
    return grid;
}

function checkWin(revealedSymbols) {
    let jokerCount = revealedSymbols.filter(s => s === SYMBOLS.JOKER.emoji).length;
    let others = revealedSymbols.filter(s => s !== SYMBOLS.JOKER.emoji && s !== SYMBOLS.MIMIC.emoji && !SYMBOLS.JUNK.includes(s));
    
    let counts = {};
    for (let s of others) counts[s] = (counts[s] || 0) + 1;

    for (const key in SYMBOLS) {
        const symbolObj = SYMBOLS[key];
        if (symbolObj.type === 'joker' || symbolObj.type === 'mimic' || Array.isArray(symbolObj)) continue;
        if ((counts[symbolObj.emoji] || 0) + jokerCount >= 3) {
            return { win: true, symbolObj: symbolObj };
        }
    }

    return { win: false };
}

function buildGridComponents(revealedArray, gridArray, disableAll) {
    const rows = [];
    for (let i = 0; i < 3; i++) {
        const row = new ActionRowBuilder();
        for (let j = 0; j < 3; j++) {
            const index = i * 3 + j;
            const isRevealed = revealedArray[index];
            const symbol = gridArray[index];
            const btn = new ButtonBuilder().setCustomId(`scratch_${index}`).setDisabled(isRevealed || disableAll);

            if (isRevealed) {
                btn.setStyle(symbol === '👹' ? ButtonStyle.Danger : (SYMBOLS.JUNK.includes(symbol) ? ButtonStyle.Secondary : ButtonStyle.Primary)).setLabel(symbol);
            } else {
                btn.setStyle(ButtonStyle.Secondary).setLabel('❓'); 
            }
            row.addComponents(btn);
        }
        rows.push(row);
    }
    return rows;
}

async function giveInventoryItem(db, guildId, userId, itemId, quantity) {
    try {
        await db.query(`
            INSERT INTO user_inventory ("guildID", "userID", "itemID", "quantity") 
            VALUES ($1, $2, $3, $4) 
            ON CONFLICT ("guildID", "userID", "itemID") 
            DO UPDATE SET quantity = user_inventory.quantity + $4
        `, [guildId, userId, itemId, quantity]);
    } catch(e) {
        await db.query(`
            INSERT INTO user_inventory (guildID, userID, itemID, quantity) 
            VALUES ($1, $2, $3, $4) 
            ON CONFLICT (guildID, userID, itemID) 
            DO UPDATE SET quantity = user_inventory.quantity + $4
        `, [guildId, userId, itemId, quantity]).catch(()=>{});
    }
}

async function giveFarmAnimal(db, guildId, userId, animalId) {
    try {
        let res = await db.query(`SELECT * FROM user_farm WHERE "guildID" = $1 AND "userID" = $2 AND "animalID" = $3`, [guildId, userId, animalId]).catch(()=>({rows:[]}));
        if (res && res.rows && res.rows.length > 0) {
            await db.query(`UPDATE user_farm SET quantity = quantity + 1 WHERE "guildID" = $1 AND "userID" = $2 AND "animalID" = $3`, [guildId, userId, animalId]).catch(()=>{});
        } else {
            await db.query(`INSERT INTO user_farm ("guildID", "userID", "animalID", "quantity", "purchaseTimestamp", "lastCollected", "lastFedTimestamp") VALUES ($1, $2, $3, 1, $4, $5, $6)`, [guildId, userId, animalId, Date.now(), Date.now(), Date.now()]).catch(()=>{});
        }
    } catch(e) {}
}

async function giveReputation(db, guildId, userId) {
    try {
        let res = await db.query(`SELECT * FROM user_reputation WHERE "guildID" = $1 AND "userID" = $2`, [guildId, userId]).catch(()=>({rows:[]}));
        if (res && res.rows && res.rows.length > 0) {
            await db.query(`UPDATE user_reputation SET rep_points = rep_points + 1 WHERE "guildID" = $1 AND "userID" = $2`, [guildId, userId]).catch(()=>{});
        } else {
            await db.query(`INSERT INTO user_reputation ("guildID", "userID", "rep_points") VALUES ($1, $2, 1)`, [guildId, userId]).catch(()=>{});
        }
    } catch(e) {}
}

module.exports = {
    name: 'scratch',
    description: '✥ اشـتـري بـطـاقـة اليانـصيـب🎟️',
    aliases: ['يانصيب', 'يا نصيب', 'تذكرة', 'حظ', 'كرت', 'خدش'],
    category: 'Economy',

    async execute(message, args) {
        const client = message.client;
        const author = message.author;
        const guild = message.guild;
        const db = client.sql;

        // 🛡️ فحص الحماية من الإرسال المزدوج للأمر
        if (activeGames.has(author.id)) {
            return message.reply({ content: "⚠️ لديك بطاقة يانصيب نشطة حالياً في الشات! قم بإنهائها أولاً لتتمكن من شراء بطاقة جديدة.", flags: [64] }).catch(()=>{});
        }
        activeGames.add(author.id); // قفل اللاعب

        let data = await client.getLevel(author.id, guild.id);
        if (!data) data = { ...(client.defaultData || {}), user: author.id, guild: guild.id, mora: 0 };

        if (author.id !== EMPEROR_ID) {
            const baseCooldown = 3600 * 1000; 
            let discount = 0;

            let advRank = data.adventurer_rank || data.rank || data.adventurerRank || data.rankName || ""; 
            if (typeof advRank === 'string') {
                const rankLower = advRank.toLowerCase();
                if (rankLower.includes('اسطوري') || rankLower.includes('s')) discount = 0.50;      
                else if (rankLower.includes('ماسي') || rankLower.includes('a')) discount = 0.40;   
                else if (rankLower.includes('ذهبي') || rankLower.includes('b')) discount = 0.30;   
                else if (rankLower.includes('فضي') || rankLower.includes('c')) discount = 0.20;    
                else if (rankLower.includes('برونزي') || rankLower.includes('d')) discount = 0.10; 
            } else if (typeof advRank === 'number') {
                discount = Math.min(advRank * 0.05, 0.50); 
            }

            const finalCooldown = baseCooldown - (baseCooldown * discount);
            const lastScratch = Number(data.lastScratch || data.lastscratch) || 0;

            if (lastScratch > 0) {
                const expirationTime = lastScratch + finalCooldown;
                if (Date.now() < expirationTime) {
                    const expireTimestamp = Math.floor(expirationTime / 1000); 
                    activeGames.delete(author.id); // فك القفل في حال الرفض
                    
                    const cooldownEmbed = new EmbedBuilder()
                        .setColor(getRandomColor())
                        .setThumbnail('https://i.postimg.cc/50QZ4PPL/1.webp')
                        .setDescription(`֎ نفـدت التذاكـر .. يمكنك شراء تذكـرة جديـدة بعـد: <t:${expireTimestamp}:R> <a:Nerf:1438795685280612423>`);
                    
                    return message.reply({ embeds: [cooldownEmbed] });
                }
            }
        }

        const chooseEmbed = new EmbedBuilder()
            .setTitle('✥ اشـتـري بـطـاقـة اليانـصيـب🎟️')
            .setDescription('✶ جـرب حـظـك باليانصيـب واشتري تذكرتك\n\n✦ اجـمـع 3 رمـوز مشـابهـة لمضاعفـة ربحـك <a:mTrophy:1438797228826300518>\n✦ رمـز الحـظ «🧚‍♀️» يكـمـل اي رمـز آخـر <a:6aMoney:1439572832219693116>')
            .setColor(getRandomColor())
            .setImage(BANNER_IMAGE)
            .setFooter({ text: '\u200B', iconURL: author.displayAvatarURL() });

        const chooseRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('buy_bronze').setLabel(TIERS.bronze.label).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('buy_silver').setLabel(TIERS.silver.label).setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('buy_gold').setLabel(TIERS.gold.label).setStyle(ButtonStyle.Success)
        );

        const initialMsg = await message.reply({ embeds: [chooseEmbed], components: [chooseRow] });

        const filter = i => i.user.id === author.id;
        const collector = initialMsg.createMessageComponentCollector({ filter, time: 120000 });

        let gameActive = false;
        let currentTier = null;
        let grid = [];
        let revealed = Array(9).fill(false);

        collector.on('collect', async (i) => {
            if (activeProcesses.has(i.user.id)) return i.reply({ content: "⚠️ هدي اللعب! جاري معالجة طلبك السابق.", ephemeral: true });
            activeProcesses.add(i.user.id);

            if (i.customId.startsWith('buy_')) {
                const tierId = i.customId.split('_')[1];
                currentTier = TIERS[tierId];

                data = await client.getLevel(author.id, guild.id);
                let balance = Number(data.mora) || 0;

                if (balance < currentTier.price) {
                    activeProcesses.delete(i.user.id);
                    return i.reply({ content: `❌ رصيدك لا يكفي! تحتاج إلى **${currentTier.price}** <:mora:1435647151349698621> لشراء التذكرة.`, ephemeral: true });
                }

                data.mora = balance - currentTier.price;
                if (author.id !== EMPEROR_ID) data.lastScratch = Date.now(); 
                await client.setLevel(data);

                gameActive = true;
                grid = generateGrid(tierId);

                const gameEmbed = new EmbedBuilder()
                    .setTitle(`✶ بطـاقـة يانصيـب ${currentTier.name}`)
                    .setDescription(`✦ اشتـريـت تذكـرة ${currentTier.price} ${currentTier.name} <:mora:1435647151349698621>\n✦ اكشـط بطاقة اليانصيـب \n✦ حـاول جـمع 3 رمـوز مشابهـة <:2BCrikka:1437806481071411391>`)
                    .setColor(getRandomColor())
                    .setImage(BANNER_IMAGE)
                    .setFooter({ text: '\u200B', iconURL: author.displayAvatarURL() });

                await i.update({ embeds: [gameEmbed], components: buildGridComponents(revealed, grid, false) });
            } 
            
            else if (i.customId.startsWith('scratch_') && gameActive) {
                const index = parseInt(i.customId.split('_')[1]);
                revealed[index] = true;

                const revealedSymbols = grid.filter((_, idx) => revealed[idx]);
                let gameOver = false;
                let finalEmbed = new EmbedBuilder()
                    .setFooter({ text: '\u200B', iconURL: author.displayAvatarURL() })
                    .setColor(getRandomColor())
                    .setImage(BANNER_IMAGE);

                const baseDesc = `✦ اشتـريـت تذكـرة ${currentTier.price} ${currentTier.name} <:mora:1435647151349698621>\n✦ اكشـط بطاقة اليانصيـب \n✦ حـاول جـمع 3 رمـوز مشابهـة <:2BCrikka:1437806481071411391>`;

                if (grid[index] === SYMBOLS.MIMIC.emoji) {
                    gameOver = true;
                    finalEmbed.setTitle(`✶ خـسـرت .. Gg`).setColor(0xE74C3C)
                    finalEmbed.setDescription(`✶ **تمزقت بطاقـة اليانصيـب !**\nلقد أيقظت الميميك والتهـم اموالـك👹\nخسرت **${currentTier.price}** 💥`);
                } 
                else {
                    const winStatus = checkWin(revealedSymbols);
                    if (winStatus.win) {
                        gameOver = true;
                        const s = winStatus.symbolObj;
                        let prizeText = "";
                        
                        finalEmbed.setTitle(`✶ كـفـوو علـيـك ~`).setColor(0x2ECC71);

                        if (s.type === 'mora') {
                            const prize = Math.floor(currentTier.price * s.multi);
                            let winData = await client.getLevel(author.id, guild.id);
                            if (!winData) winData = { ...(client.defaultData || {}), user: author.id, guild: guild.id, mora: 0 };
                            winData.mora = (Number(winData.mora) || 0) + prize;
                            await client.setLevel(winData);
                            prizeText = `**${prize}** <:mora:1435647151349698621>`;
                        } 
                        else if (s.type === 'rep') {
                            await giveReputation(db, guild.id, author.id);
                            prizeText = `**1 نقطة سمعة** 🌟`;
                        } 
                        else if (s.type === 'item') {
                            let itemId = s.item;
                            let qty = 1;

                            if (s.item === 'seed') {
                                itemId = seedIds[Math.floor(Math.random() * seedIds.length)];
                                qty = Math.floor(Math.random() * 41) + 10; 
                                prizeText = `**${qty} حزمة بذور** 🌱`;
                                await giveInventoryItem(db, guild.id, author.id, itemId, qty);
                            } 
                            else if (s.item === 'bait') {
                                itemId = baitIds[Math.floor(Math.random() * baitIds.length)];
                                qty = Math.floor(Math.random() * 21) + 10; 
                                prizeText = `**${qty} طعوم صيد** 🪱`;
                                await giveInventoryItem(db, guild.id, author.id, itemId, qty);
                            } 
                            else if (s.item === 'potion') {
                                itemId = potionIds[Math.floor(Math.random() * potionIds.length)];
                                qty = Math.floor(Math.random() * 3) + 1; 
                                prizeText = `**${qty} جرعات دانجون** 🧪`;
                                await giveInventoryItem(db, guild.id, author.id, itemId, qty);
                            } 
                            else if (s.item === 'animal') {
                                itemId = animalIds[Math.floor(Math.random() * animalIds.length)];
                                prizeText = `**حيوان مزرعة عشوائي** 🐄`;
                                await giveFarmAnimal(db, guild.id, author.id, itemId);
                            } 
                            else if (s.item === 'gacha_chest') {
                                prizeText = `**صندوق غاتشا** 🎁`;
                                await giveInventoryItem(db, guild.id, author.id, 'gacha_chest', 1);
                            }
                        }

                        finalEmbed.setDescription(`✦ ضـربـة حـظ ! <a:mTrophy:1438797228826300518>\n✦ جـمعـت 3 رمـوز لـ «${s.name}»\n✦ ربـحـت ${prizeText}`);
                    } 
                    else if (revealedSymbols.length === 9) {
                        gameOver = true;
                        finalEmbed.setTitle(`✶ خـسـرت .. Gg`).setColor(0x95A5A6);
                        finalEmbed.setDescription(`✶ بـطاقـة يـانصـيب خـاسـرة امتلأت الساحة بالخردة ~\n✶ خـسـرت **${currentTier.price}** <:mora:1435647151349698621>`);
                    }
                    else {
                        finalEmbed.setTitle(`✶ بطـاقـة يانصيـب ${currentTier.name}`).setDescription(`${baseDesc}\n\n✦ استمر.. متبقي لك **${9 - revealedSymbols.length}** فـرص`);
                    }
                }

                if (gameOver) {
                    gameActive = false;
                    collector.stop('finished');
                    await i.update({ embeds: [finalEmbed], components: buildGridComponents(Array(9).fill(true), grid, true) });
                } else {
                    await i.update({ embeds: [finalEmbed], components: buildGridComponents(revealed, grid, false) });
                }
            }
            activeProcesses.delete(i.user.id);
        });

        collector.on('end', async (collected, reason) => {
            activeGames.delete(author.id); // 🛡️ فك قفل اللاعب بمجرد انتهاء التفاعل
            if (reason === 'time' && initialMsg) {
                await initialMsg.edit({ components: gameActive ? buildGridComponents(revealed, grid, true) : [] }).catch(() => {});
            }
        });
    }
};
