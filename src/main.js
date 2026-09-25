const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const Database = require('better-sqlite3');
const fs = require('fs');
const { parseCQBALUrl } = require('./cqbal-parser');

let win, db, isQuitting = false;

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
    CREATE TABLE IF NOT EXISTS database_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      species_id TEXT NOT NULL,
      species_label TEXT,
      description TEXT,
      is_active INTEGER DEFAULT 0,
      data_json TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

  // ── DATABASE PROFILES (MÚLTIPLOS BANCOS DE DADOS) ──
  ipcMain.handle('db-get-profiles', (_, spId) => {
    let rows;
    if (spId && spId !== 'all') {
      rows = db.prepare('SELECT * FROM database_profiles WHERE species_id=? ORDER BY is_active DESC, updated_at DESC').all(spId);
    } else {
      rows = db.prepare('SELECT * FROM database_profiles ORDER BY updated_at DESC').all();
    }
    return rows.map(r => {
      try { r.data = JSON.parse(r.data_json); } catch(e) { r.data = {}; }
      return r;
    });
  });

  ipcMain.handle('db-save-profile', (_, p) => {
    const info = db.prepare(`
      INSERT INTO database_profiles (name, species_id, species_label, description, is_active, data_json, updated_at)
      VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)
    `).run(p.name, p.species_id, p.species_label || p.species_id, p.description || '', p.is_active ? 1 : 0, JSON.stringify(p.data || {}));
    
    if (p.is_active) {
      db.prepare('UPDATE database_profiles SET is_active=0 WHERE id != ? AND species_id=?').run(info.lastInsertRowid, p.species_id);
    }
    return info.lastInsertRowid;
  });

  ipcMain.handle('db-update-profile', (_, id, p) => {
    db.prepare(`
      UPDATE database_profiles 
      SET name = COALESCE(?, name),
          description = COALESCE(?, description),
          data_json = COALESCE(?, data_json),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(p.name !== undefined ? p.name : null, p.description !== undefined ? p.description : null, p.data ? JSON.stringify(p.data) : null, id);
    return true;
  });

  ipcMain.handle('db-set-active-profile', (_, id, spId) => {
    db.prepare('UPDATE database_profiles SET is_active=0 WHERE species_id=?').run(spId);
    db.prepare('UPDATE database_profiles SET is_active=1 WHERE id=?').run(id);
    return true;
  });

  ipcMain.handle('db-delete-profile', (_, id) => {
    db.prepare('DELETE FROM database_profiles WHERE id=?').run(id);
    return true;
  });

  ipcMain.handle('dialog-export-profile', async (_, profileData, defaultName) => {
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Exportar Banco de Dados Nutricalc',
      defaultPath: defaultName || 'banco_nutricalc.json',
      filters: [{ name: 'Banco de Dados Nutricalc (*.json)', extensions: ['json'] }]
    });
    if (canceled || !filePath) return false;
    fs.writeFileSync(filePath, JSON.stringify(profileData, null, 2), 'utf8');
    return true;
  });

  ipcMain.handle('dialog-import-profile', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Importar Banco de Dados Nutricalc',
      filters: [{ name: 'Banco de Dados Nutricalc (*.json)', extensions: ['json'] }],
      properties: ['openFile']
    });
    if (canceled || !filePaths.length) return null;
    try {
      return JSON.parse(fs.readFileSync(filePaths[0], 'utf8'));
    } catch(e) {
      console.error('Erro ao ler JSON de banco:', e);
      return { error: 'Arquivo inválido ou corrompido: ' + e.message };
    }
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

  // Versão do app (lida do package.json em tempo de execução, para o app
  // sempre exibir a versão realmente instalada em vez de um número fixo).
  ipcMain.handle('get-app-version', () => app.getVersion());

  // Backup completo do banco de dados (dietas, alimentos, bancos), disponível
  // também sob demanda pelo menu "Backup" da interface, não só no update.
  ipcMain.handle('backup-database-file', () => backupDatabaseFile());

  // Fechar o app: o renderer confirma que já persistiu a sessão/dieta atual.
  ipcMain.handle('confirm-close', () => {
    isQuitting = true;
    if (win) win.destroy();
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

  // Planilha modelo de alimentos (CSV): salvar o modelo em branco
  ipcMain.handle('dialog-save-text', async (_, content, defaultName) => {
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Salvar modelo de planilha',
      defaultPath: defaultName || 'modelo.csv',
      filters: [{ name: 'Planilha (CSV)', extensions: ['csv'] }]
    });
    if (canceled || !filePath) return false;
    fs.writeFileSync(filePath, content, 'utf8');
    return true;
  });

  // Abrir uma planilha (CSV) preenchida para importar alimentos
  ipcMain.handle('dialog-open-text', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Selecionar planilha de alimentos',
      filters: [{ name: 'Planilha (CSV)', extensions: ['csv', 'txt'] }],
      properties: ['openFile']
    });
    if (canceled || !filePaths.length) return null;
    return { name: path.basename(filePaths[0]), content: fs.readFileSync(filePaths[0], 'utf8') };
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

  // Importa alimento a partir do LINK do relatório do CQBAL (dados já vêm
  // estruturados no próprio link — muito mais confiável que PDF/OCR).
  ipcMain.handle('parse-cqbal-url', (_, url) => {
    try {
      return parseCQBALUrl(url);
    } catch (err) {
      return { error: err.message };
    }
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 860, minWidth: 800, minHeight: 600,
    title: 'Nutricalc',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'index.html'));

  // Ao fechar, dá ao renderer a chance de salvar a dieta/sessão atual antes
  // de encerrar. O renderer responde via IPC 'confirm-close' (que destrói a
  // janela). Um timeout garante que o app feche mesmo se algo der errado.
  win.on('close', (e) => {
    if (isQuitting) return;
    e.preventDefault();
    try {
      win.webContents.send('app-will-close');
    } catch (err) {
      isQuitting = true;
      win.destroy();
      return;
    }
    setTimeout(() => { isQuitting = true; if (win) win.destroy(); }, 4000);
  });
}

// Copia o banco de dados inteiro (dietas, alimentos, bancos) para um arquivo
// escolhido pelo usuário. Usa a API de backup do better-sqlite3 (Online
// Backup API do SQLite) em vez de copiar o arquivo bruto: isso garante uma
// cópia consistente mesmo com o journal_mode=WAL ativo (gravações recentes
// podem estar só no arquivo -wal, não no .db principal ainda).
async function backupDatabaseFile() {
  if (!db || !win) return false;
  try {
    const defaultName = 'nutricalc_backup_' + new Date().toISOString().slice(0, 10) + '.db';
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Salvar Backup do Nutricalc',
      defaultPath: defaultName,
      filters: [{ name: 'Banco de Dados Nutricalc (*.db)', extensions: ['db'] }]
    });
    if (canceled || !filePath) return false;
    await db.backup(filePath);
    await dialog.showMessageBox(win, {
      type: 'info', title: 'Backup Concluído',
      message: 'Backup salvo com sucesso em:\n' + filePath
    });
    return true;
  } catch (err) {
    await dialog.showMessageBox(win, {
      type: 'error', title: 'Erro no Backup',
      message: 'Não foi possível salvar o backup: ' + err.message
    });
    return false;
  }
}

// Diálogo exibido quando a atualização já foi baixada e está pronta para
// instalar. Oferece um backup opcional antes de reiniciar — se o usuário
// fizer o backup, o diálogo reaparece para ele então decidir se reinicia.
async function showUpdateReadyDialog() {
  if (!win) return;
  const r = await dialog.showMessageBox(win, {
    type: 'info',
    title: 'Atualização Pronta',
    message: 'A nova versão foi baixada! Você pode reiniciar agora para aplicar as melhorias.\n\nPor garantia, se quiser, salve antes uma cópia de segurança das suas dietas e alimentos.',
    buttons: ['💾 Fazer Backup (opcional)', 'Reiniciar Agora', 'Mais Tarde'],
    defaultId: 1,
    cancelId: 2
  });
  if (r.response === 0) {
    await backupDatabaseFile();
    return showUpdateReadyDialog(); // reapresenta para decidir reiniciar ou não
  }
  if (r.response === 1) {
    isQuitting = true;
    autoUpdater.quitAndInstall();
  }
  // response === 2 (Mais Tarde): não faz nada, o app continua rodando
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

  autoUpdater.on('update-downloaded', () => { showUpdateReadyDialog(); });

  autoUpdater.checkForUpdatesAndNotify().catch(() => {
    // Falha silenciosa no caso de ausência de rede ou rodando em modo dev
  });
}

app.whenReady().then(() => { initDB(); setupIPC(); createWindow(); setupAutoUpdater(); });
app.on('window-all-closed', () => { if (db) db.close(); if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
