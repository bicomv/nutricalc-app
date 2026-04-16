# 🧬 Nutricalc — Aplicativo Desktop

Sistema para cálculos da disciplina de Formulação de Dietas na Nutrição Animal.
**UENP** — Docentes: Petrônio P. Porto, Marcos A. A. Silva, José C. Arevalo Jr., Luiz G. S. Maistro

## 🚀 Como Rodar

### Pré-requisitos
- **Node.js** (v18 ou superior): https://nodejs.org
- **Git** (opcional): https://git-scm.com

### Passo a passo

```bash
# 1. Abra o terminal na pasta do projeto e instale as dependências:
npm install

# 2. Reconstrua o módulo nativo (better-sqlite3) para o Electron:
npx electron-rebuild

# 3. Rode o app:
npm start
```

### Se der erro no `electron-rebuild` (Windows):
```bash
# Instale as ferramentas de compilação C++ (necessário 1x só):
npm install -g windows-build-tools

# OU instale o Visual Studio Build Tools:
# https://visualstudio.microsoft.com/visual-cpp-build-tools/
# Marque "Desktop development with C++"

# Depois tente novamente:
npx electron-rebuild
```

### Se der erro no Linux:
```bash
# Instale dependências de compilação:
sudo apt install build-essential python3

# Depois:
npx electron-rebuild
```

## 📦 Gerar Instalador

```bash
# Windows (.exe):
npm run dist:win

# Linux (.AppImage):
npm run dist:linux
```

O instalador será gerado na pasta `release/`.

## 💾 Banco de Dados

Os dados são salvos automaticamente em SQLite:
- **Windows**: `%APPDATA%/nutricalc/nutricalc.db`
- **Linux**: `~/.config/nutricalc/nutricalc.db`
- **Mac**: `~/Library/Application Support/nutricalc/nutricalc.db`

Inclui:
- Dietas salvas (persistem entre sessões)
- Alimentos customizados (por espécie)
- Estado do app

## 📤 Exportar / 📥 Importar

O sistema ainda suporta exportar/importar JSON para:
- Backup manual
- Transferir dados entre computadores
- Compartilhar dietas com colegas

## 🏗️ Estrutura do Projeto

```
nutricalc-app/
├── package.json          # Dependências e scripts
├── README.md             # Este arquivo
└── src/
    ├── main.js           # Processo principal (Electron + SQLite)
    ├── preload.js        # Bridge segura (main ↔ renderer)
    └── index.html        # Interface completa do app
```
