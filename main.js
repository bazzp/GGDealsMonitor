const { app, BrowserWindow, ipcMain, Notification } = require('electron');
const path = require('path');
const puppeteer = require('puppeteer');

let mainWindow;
let lastOfficial = null;
let lastKeyshop = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 400,
        height: 350,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        }
    });

    mainWindow.loadFile('index.html');
}

async function getPrices() {
    const url = 'https://gg.deals/game/minecraft/';
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox']
    });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 0 });

    await page.waitForSelector('.header-game-prices-content .game-header-price-box:nth-child(1) .price-inner.numeric', {timeout: 20000});
    await page.waitForSelector('.header-game-prices-content .game-header-price-box:nth-child(2) .price-inner.numeric', {timeout: 20000});

    const official = await page.$eval(
        '.header-game-prices-content .game-header-price-box:nth-child(1) .price-inner.numeric',
        el => el.innerText.trim()
    );
    const keyshop = await page.$eval(
        '.header-game-prices-content .game-header-price-box:nth-child(2) .price-inner.numeric',
        el => el.innerText.trim()
    );

    await browser.close();

    const parsePrice = (txt) => {
        const cleaned = txt.replace('~', '').replace('zł', '').replace(',', '.').replace(/[^\d.]/g, '');
        return parseFloat(cleaned);
    };

    return {
        official: parsePrice(official),
        keyshop: parsePrice(keyshop)
    };
}

// Monitor loop
async function monitorPrices() {
    while (true) {
        try {
            const prices = await getPrices();
            mainWindow.webContents.send('prices', prices);

            if (prices.official && lastOfficial !== prices.official) {
                new Notification({ title: "Minecraft – GG.deals (oficjalny sklep)", body: `Najniższa cena: ${prices.official.toFixed(2)} zł` }).show();
                lastOfficial = prices.official;
            }
            if (prices.keyshop && lastKeyshop !== prices.keyshop) {
                new Notification({ title: "Minecraft – GG.deals (keyshop)", body: `Najniższa cena: ${prices.keyshop.toFixed(2)} zł` }).show();
                lastKeyshop = prices.keyshop;
            }
        } catch (e) {
            mainWindow.webContents.send('prices', { official: null, keyshop: null, error: e.message });
        }
        await new Promise(res => setTimeout(res, 60 * 1000));
    }
}

app.whenReady().then(() => {
    createWindow();
    monitorPrices();

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});