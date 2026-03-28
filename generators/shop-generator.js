const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');

try {
    GlobalFonts.registerFromPath(path.join(__dirname, '../fonts/cairo-Pandaify'), 'Cairo');
} catch (e) {}

async function generateGlobalShopBoard(allItems) {
    const columns = 4;
    const boxSize = 240;
    const gapX = 30;
    const gapY = 40;
    const startX = 45;
    const startY = 180;

    const rows = Math.ceil(allItems.length / columns);
    const canvasWidth = 1140;
    const canvasHeight = startY + (rows * (boxSize + gapY)) + 50;

    const canvas = createCanvas(canvasWidth, canvasHeight);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#0F0F16';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const gradient = ctx.createLinearGradient(0, 0, 0, 150);
    gradient.addColorStop(0, '#1E1E2C');
    gradient.addColorStop(1, '#14141E');
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(30, 20, 1080, 120, 20);
    ctx.fill();

    ctx.fillStyle = '#FFD700';
    ctx.textAlign = 'center';
    ctx.font = 'bold 45px "Cairo", sans-serif';
    ctx.fillText('متجر الإمبراطورية الرسمي', canvasWidth / 2, 80);

    ctx.fillStyle = '#A8A8B3';
    ctx.font = '22px "Cairo", sans-serif';
    ctx.fillText('اختر العنصر الذي تود شراءه من القائمة بالأسفل', canvasWidth / 2, 120);

    for (let i = 0; i < allItems.length; i++) {
        const item = allItems[i];
        const row = Math.floor(i / columns);
        const col = i % columns;
        
        const x = startX + (col * (boxSize + gapX));
        const y = startY + (row * (boxSize + gapY));

        ctx.fillStyle = '#1A1A24';
        ctx.beginPath();
        ctx.roundRect(x, y, boxSize, boxSize, 25);
        ctx.fill();

        ctx.strokeStyle = '#2A2A3E';
        ctx.lineWidth = 3;
        ctx.stroke();

        try {
            if (item.image) {
                const itemImage = await loadImage(item.image);
                ctx.drawImage(itemImage, x + 60, y + 25, 120, 120);
            } else {
                throw new Error("No image");
            }
        } catch (e) {
            ctx.fillStyle = '#252533';
            ctx.beginPath();
            ctx.roundRect(x + 60, y + 25, 120, 120, 15);
            ctx.fill();
        }

        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.font = 'bold 22px "Cairo", sans-serif';
        ctx.fillText(item.name, x + (boxSize / 2), y + 180);

        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 20px "Cairo", sans-serif';
        const priceText = item.price > 0 ? `${item.price.toLocaleString()} مورا` : 'مـورا ؟';
        ctx.fillText(priceText, x + (boxSize / 2), y + 220);
    }

    return canvas.toBuffer('image/png');
}

module.exports = { generateGlobalShopBoard };
