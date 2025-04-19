const { app, BrowserWindow, ipcMain, Notification } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let games = [];
let monitoring = false;
const stateFile = path.join(app.getPath('userData'), 'games.json');

function saveGamesToFile() {
    fs.writeFileSync(stateFile, JSON.stringify(games, null, 2), 'utf-8');
}

function loadGamesFromFile() {
    if (fs.existsSync(stateFile)) {
        try {
            const data = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
            if (Array.isArray(data)) {
                games = data;
                return true;
            }
        } catch (e) { }
    }
    return false;
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 900,
        height: 700,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    mainWindow.loadFile('index.html');
}

const fetch = require('node-fetch');
const cheerio = require('cheerio');

async function fetchGameData(url) {
    try {
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (!res.ok) throw new Error("Nie udało się pobrać strony");
        const html = await res.text();
        const $ = cheerio.load(html);

        // Nazwa gry
        const name = $('h1').first().text().trim() || 'Nieznana gra';

        // Szukaj wszystkich boxów cenowych
        let official = null;
        let keyshop = null;

        $('.game-header-price-box').each((i, el) => {
            const label = $(el).find('.game-info-price-label').text().toLowerCase();
            const priceText = $(el).find('.price-inner.numeric').text();
            const price = parseFloat(priceText.replace(/[^\d,\.]/g, '').replace(',', '.'));
            if (/official/.test(label) && official === null && !isNaN(price)) {
                official = price;
            }
            if (/keyshop/.test(label) && keyshop === null && !isNaN(price)) {
                keyshop = price;
            }
        });

        return { name, url, official, keyshop };
    } catch (e) {
        return { name: 'Błąd pobierania', url, official: null, keyshop: null };
    }
}

function checkThresholdAndNotify(game) {
    if (!game.threshold || game.threshold === "" || game.notified) return;
    const threshold = Number(game.threshold);
    let notify = false;
    let price = null;
    if (game.official && game.official <= threshold) {
        notify = true;
        price = game.official;
    }
    if (game.keyshop && game.keyshop <= threshold && (price === null || game.keyshop < price)) {
        notify = true;
        price = game.keyshop;
    }
    if (notify) {
        new Notification({
            title: 'Cena gry spadła!',
            body: `${game.name} jest teraz za ${price} zł!`
        }).show();
        game.notified = true;
        saveGamesToFile();
    }
}

async function monitorLoop() {
    while (monitoring) {
        for (let game of games) {
            const data = await fetchGameData(game.url);
            game.official = data.official;
            game.keyshop = data.keyshop;
            checkThresholdAndNotify(game);
        }
        saveGamesToFile();
        if (mainWindow && !mainWindow.isDestroyed())
            mainWindow.webContents.send('games', games);
        if (games.length === 0) {
            monitoring = false;
            break;
        }
        await new Promise(res => setTimeout(res, 60 * 1000)); // 1 minuta
    }
}

// IPC handlers
ipcMain.handle('add-game', async (event, url, threshold) => {
    // Sprawdź, czy już jest ta gra na liście
    if (games.some(g => g.url === url)) return;
    const data = await fetchGameData(url);
    const game = {
        name: data.name,
        url: data.url,
        official: data.official,
        keyshop: data.keyshop,
        threshold: threshold ? Number(threshold) : null,
        notified: false
    };
    games.push(game);
    saveGamesToFile();
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
        saveGamesToFile();
        if (mainWindow && !mainWindow.isDestroyed())
            mainWindow.webContents.send('games', games);
    }
});

ipcMain.on('get-games', (event) => {
    event.sender.send('games', games);
});

// App start
app.whenReady().then(() => {
    loadGamesFromFile();
    createWindow();
    if (games.length > 0) {
        monitoring = true;
        monitorLoop();
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});