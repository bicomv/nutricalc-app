const cp = require('child_process');
const path = require('path');

const targetDir = path.join(__dirname, '..', 'node_modules', 'better-sqlite3');
console.log('Instalando binário pré-compilado do better-sqlite3 para Electron 41.2.1 x64...');

try {
  cp.execSync('npx prebuild-install --runtime electron --target 41.2.1 --arch x64 --platform win32 --force', {
    cwd: targetDir,
    stdio: 'inherit'
  });
  console.log('✅ Binário do SQLite para Electron configurado com sucesso!');
} catch (e) {
  console.error('Erro ao configurar SQLite:', e.message);
  process.exit(1);
}
