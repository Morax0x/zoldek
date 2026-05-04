const activePvpChallenges = new Set();
const activePvpBattles = new Map();
const activePveBattles = new Map();

const BASE_HP = 800;       
const HP_PER_LEVEL = 60;   
const SKILL_COOLDOWN_TURNS = 3; 

const WIN_IMAGES = [
    'https://i.postimg.cc/JhMrnyLd/download-1.gif',
    'https://i.postimg.cc/FHgv29L0/download.gif',
    'https://i.postimg.cc/9MzjRZNy/haru-midoriya.gif',
    'https://i.postimg.cc/4ygk8q3G/tumblr-nmao11Zm-Bx1r3rdh2o2-500-gif-500-281.gif',
    'https://i.postimg.cc/pL6NNpdC/Epic7-Epic-Seven-GIF-Epic7-Epic-Seven-Tensura-Discover-Share-GIFs.gif',
    'https://i.postimg.cc/05dLktNF/download-5.gif',
    'https://i.postimg.cc/sXRVMwhZ/download-2.gif'
];

const LOSE_IMAGES = [
    'https://i.postimg.cc/xd8msjxk/escapar-a-toda-velocidad.gif',
    'https://i.postimg.cc/1zb8JGVC/download.gif',
    'https://i.postimg.cc/rmSwjvkV/download-1.gif',
    'https://i.postimg.cc/8PyPZRqt/download.jpg'
];

const EMOJI_MORA = '<:mora:1435647151349698621>';

module.exports = {
    activePvpChallenges,
    activePvpBattles,
    activePveBattles,
    BASE_HP,
    HP_PER_LEVEL,
    SKILL_COOLDOWN_TURNS,
    WIN_IMAGES,
    LOSE_IMAGES,
    EMOJI_MORA
};
