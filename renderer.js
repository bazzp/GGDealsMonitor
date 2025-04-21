// Gry mają być ładowane na starcie i po focusie okna
window.addEventListener('DOMContentLoaded', () => {
    window.electron.ipcRenderer.send('get-games');
});
window.addEventListener('focus', () => {
    window.electron.ipcRenderer.send('get-games');
});

// Odbiór i wyświetlanie gier
window.electron.ipcRenderer.on('games', (event, games) => {
    renderGames(games);
});

function renderGames(games) {
    const tbody = document.querySelector('#games-table tbody');
    tbody.innerHTML = '';
    games.forEach((game, idx) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
      <td>${game.name}</td>
      <td>
        ${
            game.lastError
                ? '<span title="Błąd pobierania ceny">⚠️</span>'
                : game.price !== null
                    ? game.price + ' zł'
                    : '-'
        }
      </td>
      <td>${game.threshold} zł</td>
      <td>
        <button class="remove-btn" onclick="removeGame(${idx})" title="Usuń">🗑️</button>
      </td>
    `;
        tbody.appendChild(tr);
    });
}

// Dodawanie gry
async function addGame() {
    const url = document.querySelector('#game-url').value;
    const name = document.querySelector('#game-name').value;
    const threshold = document.querySelector('#game-threshold').value;
    await window.electron.ipcRenderer.invoke('add-game', url, name, threshold);
}

// Usuwanie gry
async function removeGame(idx) {
    await window.electron.ipcRenderer.invoke('remove-game', idx);
}