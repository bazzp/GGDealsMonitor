const { app, BrowserWindow, ipcMain, Notification } = require('electron');
const path = require('path');

let mainWindow;
let monitoring = false;
let games = [];

ipcMain.on('get-games', (event) => {
    event.sender.send('games', games);
});

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 900,
        height: 700,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });
    mainWindow.loadFile('index.html');
}

const fetch = require('node-fetch');
const cheerio = require('cheerio');

// Pomocnicza funkcja do prezentacji ceny
function formatPrice(val) {
    if (val === null || val === undefined) return "-";
    if (val === 0) return "FREE";
    return `${val} zł`;
}

async function fetchGameData(url) {
    try {
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (!res.ok) throw new Error("Nie udało się pobrać strony");
        const html = await res.text();
        const $ = cheerio.load(html);

        const name = $('h1').first().text().trim() || 'Nieznana gra';

        let official = null;
        let keyshop = null;

        $('.game-header-price-box').each((i, el) => {
            const label = $(el).find('.game-info-price-label').text().toLowerCase();
            const priceText = $(el).find('.price-inner.numeric').text().trim();
            let price = null;
            if (/free/i.test(priceText)) {
                price = 0;
            } else {
                price = parseFloat(priceText.replace(/[^\d,\.]/g, '').replace(',', '.'));
                if (isNaN(price)) price = null;
            }
            if (/official/.test(label) && official === null) {
                official = price;
            }
            if (/keyshop/.test(label) && keyshop === null) {
                keyshop = price;
            }
        });

        return { name, url, official, keyshop };
    } catch (e) {
        
        return { name: 'Błąd pobierania', url, official: null, keyshop: null };
    }
}

function notifyPriceChange(game, oldOfficial, newOfficial, oldKeyshop, newKeyshop) {
    let msg = '';
    if (oldOfficial !== undefined && newOfficial !== undefined && oldOfficial !== newOfficial) {
        msg += `Oficjalny sklep: z ${formatPrice(oldOfficial)} na ${formatPrice(newOfficial)}\n`;
    }
    if (oldKeyshop !== undefined && newKeyshop !== undefined && oldKeyshop !== newKeyshop) {
        msg += `Keyshop: z ${formatPrice(oldKeyshop)} na ${formatPrice(newKeyshop)}\n`;
    }
    if (msg.trim() !== '') {
        new Notification({
            title: `Zmiana ceny gry: ${game.name}`,
            body: msg.trim()
        }).show();
    }
}

function checkAndNotify(game, newOfficial, newKeyshop, oldOfficial, oldKeyshop) {
    notifyPriceChange(game, oldOfficial, newOfficial, oldKeyshop, newKeyshop);
}

async function monitorLoop() {
    while (monitoring) {
        for (let game of games) {
            const oldOfficial = game.official;
            const oldKeyshop = game.keyshop;
            const data = await fetchGameData(game.url);

            // Zaktualizuj ceny TYLKO jeśli pobrano nowe (nie null/undefined)
            if (data.official !== null && data.official !== undefined) {
                game.official = data.official;
            }
            if (data.keyshop !== null && data.keyshop !== undefined) {
                game.keyshop = data.keyshop;
            }

            checkAndNotify(game, game.official, game.keyshop, oldOfficial, oldKeyshop);
        }
        if (mainWindow && !mainWindow.isDestroyed())
            mainWindow.webContents.send('games', games);
        if (games.length === 0) {
            monitoring = false;
            break;
        }
        await new Promise(res => setTimeout(res, 60 * 100)); // 1 minuta
    }
}

ipcMain.handle('add-game', async (event, url) => {
    if (games.some(g => g.url === url)) return;
    const data = await fetchGameData(url);
    const game = {
        name: data.name,
        url: data.url,
        official: data.official,
        keyshop: data.keyshop
    };
    games.push(game);

    checkAndNotify(game, data.official, data.keyshop, undefined, undefined);

    if (!monitoring && games.length > 0) {
        monitoring = true;
        monitorLoop();
    }
    if (mainWindow && !mainWindow.isDestroyed())
        mainWindow.webContents.send('games', games);
});

ipcMain.on('remove-game', (event, idx) => {
    if (idx >= 0 && idx < games.length) {
        games.splice(idx, 1);
        if (mainWindow && !mainWindow.isDestroyed())
            mainWindow.webContents.send('games', games);
    }
});

app.whenReady().then(() => {
    createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});