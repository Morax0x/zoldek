const path = require('path');

const rootDir = process.cwd();
const dungeonConfig = require(path.join(rootDir, 'json', 'dungeon-config.json'));
const weaponsConfig = require(path.join(rootDir, 'json', 'weapons-config.json'));
const skillsConfig = require(path.join(rootDir, 'json', 'skills-config.json'));
const ownerSkills = require(path.join(rootDir, 'json', 'owner-skills.json'));

let potionItems = [];
try {
    potionItems = require(path.join(rootDir, 'json', 'potions.json'));
} catch (e) {
    try {
        const shopItems = require(path.join(rootDir, 'json', 'shop-items.json'));
        potionItems = shopItems.filter(i => i.category === 'potions');
    } catch (err) { 
        console.error("Error loading potions:", err); 
    }
}

const EMOJI_MORA = '<:mora:1435647151349698621>'; 
const EMOJI_XP = '<a:levelup:1437805366048985290>'; 
const EMOJI_BUFF = '<a:buff:1438796257522094081>';
const EMOJI_NERF = '<a:Nerf:1438795685280612423>';
const OWNER_ID = "1145327691772481577"; 
const BASE_HP = 100;
const HP_PER_LEVEL = 4;

const WIN_IMAGES = [
    'https://i.postimg.cc/85MLkpTk/download.gif',
    'https://i.postimg.cc/4xHyR8fG/download-(1).gif',
    'https://i.postimg.cc/YqhqQXm6/download-(2).gif',
    'https://i.postimg.cc/gkSsT0Jf/Shingeki-no-Bahamut-Jeanne-D-Arc-demon-version.gif',
    'https://i.postimg.cc/QdSqTdLJ/Very-Cool.gif',
    'https://i.postimg.cc/g2c9vj7f/download-(5).gif',
    'https://i.postimg.cc/KjK7XP46/download-(8).gif',
    'https://i.postimg.cc/MHRDM0xV/Search-happy-birthday-dabi-jan-18-hokusu.gif',
    'https://i.postimg.cc/5t3MhvCf/download-(3).gif',
    'https://i.postimg.cc/vBNCyvHn/download-(4).gif',
    'https://i.postimg.cc/13SWFd8q/download-(9).gif',
    'https://i.postimg.cc/wvrxrJC0/https-c-tenor-com-Xszop-Y9bg-XIAAAAC-muramasa-fate-go-muramasa.gif',
    'https://i.postimg.cc/Y0g4fbvv/download-(6).gif',
    'https://i.postimg.cc/RZbMhw01/Goblin-Slayer.gif',
    'https://i.postimg.cc/2ymYMwHk/𝕲𝖔𝖇𝖑𝖎𝖓-𝕾𝖑𝖆𝖞𝖊𝖗.gif',
    'https://i.postimg.cc/JhMrnyLd/download-1.gif',
    'https://i.postimg.cc/FHgv29L0/download.gif',
    'https://i.postimg.cc/9MzjRZNy/haru-midoriya.gif',
    'https://i.postimg.cc/4ygk8q3G/tumblr-nmao11Zm-Bx1r3rdh2o2-500-gif-500-281.gif',
    'https://i.postimg.cc/pL6NNpdC/Epic7-Epic-Seven-GIF-Epic7-Epic-Seven-Tensura-Discover-Share-GIFs.gif',
    'https://i.postimg.cc/05dLktNF/download-5.gif'
];

const LOSE_IMAGES = [
    'https://i.postimg.cc/0Q11Kn1Z/Overlord-S3-3.gif',
    'https://i.postimg.cc/5N4YFqfG/Mob-Psycho-100.gif',
    'https://i.postimg.cc/63h69g4z/Ainz-Ooal-Gown.gif',
    'https://i.postimg.cc/90JfBKcn/Solo-Leveling-Statue-Smile-GIF-Solo-Leveling-statue-smile-Solo-Leveling-Statue-discover-and-shar.gif',
    'https://i.postimg.cc/ZqZL9vDj/Register-Login-(1).gif',
    'https://i.postimg.cc/T1XbszMh/download-(11).gif',
    'https://i.postimg.cc/QCNPcn4F/download-(7).gif',
    'https://i.postimg.cc/HnQwsp4Z/download-(10).gif',
    'https://i.postimg.cc/QMrfpyVj/Overlord-2.gif',
    'https://i.postimg.cc/sXjKLGYZ/We-Heart-It-(1).gif',
    'https://i.postimg.cc/3J41zTvX/Gabimaru-Anime-GIF-Gabimaru-Anime-Hell-Paradise-Discover-Share-GIFs.gif'
];

module.exports = {
    dungeonConfig,
    weaponsConfig,
    skillsConfig,
    ownerSkills, 
    potionItems,
    EMOJI_MORA,
    EMOJI_XP,
    EMOJI_BUFF,
    EMOJI_NERF,
    OWNER_ID,
    BASE_HP,
    HP_PER_LEVEL,
    WIN_IMAGES,
    LOSE_IMAGES
};
