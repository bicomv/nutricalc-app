const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const Database = require('better-sqlite3');
const fs = require('fs');

let win, db;

function initDB() {
  const dbPath = path.join(app.getPath('userData'), 'nutricalc.db');
  console.log('DB:', dbPath);
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS diets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      species_id TEXT,
      species_label TEXT,
      date TEXT,
      cost_day REAL DEFAULT 0,
      source TEXT DEFAULT 'opt',
      state_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS custom_feeds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      species_id TEXT NOT NULL,
      data_json TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
}

// ── IPC HANDLERS ──
function setupIPC() {
  // Diets
  ipcMain.handle('db-get-diets', () => {
    const rows = db.prepare('SELECT * FROM diets ORDER BY created_at DESC').all();
    return rows.map(r => { try { r.state = JSON.parse(r.state_json); } catch(e) { r.state = null; } return r; });
  });
  ipcMain.handle('db-save-diet', (_, d) => {
    const info = db.prepare('INSERT INTO diets (name, species_id, species_label, date, cost_day, source, state_json) VALUES (?,?,?,?,?,?,?)').run(
      d.name, d.species_id, d.species_label, d.date, d.cost_day, d.source||'opt', JSON.stringify(d.state));
    return info.lastInsertRowid;
  });
  ipcMain.handle('db-delete-diet', (_, id) => { db.prepare('DELETE FROM diets WHERE id=?').run(id); return true; });

  // Custom feeds per species
  ipcMain.handle('db-get-custom-feeds', (_, spId) => {
    const rows = db.prepare('SELECT * FROM custom_feeds WHERE species_id=? ORDER BY created_at').all(spId);
    return rows.map(r => { try { return {...JSON.parse(r.data_json), _dbId: r.id}; } catch(e) { return null; } }).filter(Boolean);
  });
  ipcMain.handle('db-save-custom-feed', (_, spId, data) => {
    const info = db.prepare('INSERT INTO custom_feeds (species_id, data_json) VALUES (?,?)').run(spId, JSON.stringify(data));
    return info.lastInsertRowid;
  });
  ipcMain.handle('db-update-custom-feed', (_, dbId, data) => {
    db.prepare('UPDATE custom_feeds SET data_json=? WHERE id=?').run(JSON.stringify(data), dbId);
    return true;
  });
  ipcMain.handle('db-delete-custom-feed', (_, dbId) => {
    db.prepare('DELETE FROM custom_feeds WHERE id=?').run(dbId); return true;
  });

  // App state (generic key-value)
  ipcMain.handle('db-save-state', (_, key, val) => {
    db.prepare('INSERT OR REPLACE INTO app_state (key, value) VALUES (?,?)').run(key, JSON.stringify(val)); return true;
  });
  ipcMain.handle('db-get-state', (_, key) => {
    const r = db.prepare('SELECT value FROM app_state WHERE key=?').get(key);
    return r ? JSON.parse(r.value) : null;
  });

  // Export
  ipcMain.handle('dialog-save-json', async (_, data, defaultName) => {
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Exportar Nutricalc', defaultPath: defaultName,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (canceled || !filePath) return false;
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  });

  // Manual update check
  ipcMain.handle('check-for-updates', async () => {
    try {
      const result = await autoUpdater.checkForUpdatesAndNotify();
      return { success: true, version: result?.updateInfo?.version || null };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // Import
  ipcMain.handle('dialog-open-json', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Importar Nutricalc',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile']
    });
    if (canceled || !filePaths.length) return null;
    return JSON.parse(fs.readFileSync(filePaths[0], 'utf8'));
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 860, minWidth: 800, minHeight: 600,
    title: 'Nutricalc',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'index.html'));
}

function setupAutoUpdater() {
  // Ignora erros de dev sem o arquivo .yml
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', () => {
    if (win) dialog.showMessageBox(win, { 
      type: 'info', 
      title: 'Atualização', 
      message: 'Uma nova versão do Nutricalc foi encontrada! Estamos baixando em segundo plano e ela será instalada automaticamente.' 
    });
  });

  autoUpdater.on('update-downloaded', () => {
    if (win) {
      dialog.showMessageBox(win, {
        type: 'info',
        title: 'Atualização Pronta',
        message: 'A nova versão foi baixada! Reinicie o aplicativo para aplicar as melhorias.',
        buttons: ['Reiniciar Agora', 'Mais Tarde']
      }).then(r => {
        if (r.response === 0) autoUpdater.quitAndInstall();
      });
    }
  });

  autoUpdater.checkForUpdatesAndNotify().catch(() => {
    // Falha silenciosa no caso de ausência de rede ou rodando em modo dev
  });
}

app.whenReady().then(() => { initDB(); setupIPC(); createWindow(); setupAutoUpdater(); });
app.on('window-all-closed', () => { if (db) db.close(); if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
