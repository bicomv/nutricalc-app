/**
 * Fallback via OCR para relatórios do CQBAL cujo texto embutido no PDF não é
 * extraível de forma confiável (fontes customizadas sem ToUnicode). Em vez de
 * tentar decodificar a fonte, renderiza a página com o visualizador de PDF
 * do próprio Chromium (Electron) e lê o texto visualmente via Tesseract.
 */
const { BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const { PNG } = require('pngjs');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseCQBALText } = require('./cqbal-parser');

// Os relatórios do CQBAL são desenhados girados 90° (paisagem dentro de uma
// página retrato). O visualizador de PDF do Chromium reproduz essa rotação
// tal como está no arquivo, então giramos a imagem capturada de volta antes
// de mandar para o OCR.
function rotatePng90Clockwise(buf) {
  const src = PNG.sync.read(buf);
  const dst = new PNG({ width: src.height, height: src.width });
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const srcIdx = (src.width * y + x) << 2;
      const dstX = src.height - 1 - y;
      const dstY = x;
      const dstIdx = (dst.width * dstY + dstX) << 2;
      dst.data[dstIdx] = src.data[srcIdx];
      dst.data[dstIdx + 1] = src.data[srcIdx + 1];
      dst.data[dstIdx + 2] = src.data[srcIdx + 2];
      dst.data[dstIdx + 3] = src.data[srcIdx + 3];
    }
  }
  return PNG.sync.write(dst);
}

async function renderPdfToPng(buf) {
  const tmpPath = path.join(os.tmpdir(), `cqbal-ocr-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);
  fs.writeFileSync(tmpPath, buf);
  const win = new BrowserWindow({
    show: false,
    width: 2450,
    height: 6400,
    webPreferences: { plugins: true }
  });
  try {
    const fileUrl = 'file:///' + tmpPath.replace(/\\/g, '/') + '#zoom=150&toolbar=0';
    await win.loadURL(fileUrl);
    // Dá tempo do plugin de PDF do Chromium terminar de renderizar.
    await new Promise(resolve => setTimeout(resolve, 1500));
    const image = await win.webContents.capturePage();
    return image.toPNG();
  } finally {
    win.destroy();
    fs.unlink(tmpPath, () => {});
  }
}

// Rodar o Tesseract dentro do processo principal do Electron (ou aguardar o
// stdout de um filho comum via execFile/exec) trava silenciosamente depois
// que uma BrowserWindow já foi criada no processo — problema conhecido do
// Node no Windows com processos filhos "presos" a um job object do Electron.
// Rodar o filho *detached*, com stdio ignorado, e ler o resultado de um
// arquivo (em vez de esperar o pipe do stdout fechar) contorna isso de forma
// confiável. Reaproveitamos o próprio executável do Electron como Node puro
// via ELECTRON_RUN_AS_NODE, para funcionar também no app empacotado, sem
// exigir Node.js instalado à parte.
function runOcrWorker(imagePath, outputPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.join(__dirname, 'cqbal-ocr-worker.js'), imagePath, outputPath],
      { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: 'ignore', detached: true }
    );
    child.unref();
    child.on('error', reject);

    const startedAt = Date.now();
    const timeoutMs = 60000;
    const poll = setInterval(() => {
      if (fs.existsSync(outputPath)) {
        clearInterval(poll);
        try {
          const payload = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
          if (payload.error) return reject(new Error(payload.error));
          resolve(payload.text);
        } catch (e) {
          reject(new Error('Resposta inválida do worker de OCR: ' + e.message));
        }
        return;
      }
      if (Date.now() - startedAt > timeoutMs) {
        clearInterval(poll);
        reject(new Error('Tempo esgotado aguardando o OCR.'));
      }
    }, 300);
  });
}

async function parseCQBALViaOCR(buf, fileName = '') {
  const png = await renderPdfToPng(buf);
  const rotated = rotatePng90Clockwise(png);
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const tmpImgPath = path.join(os.tmpdir(), `cqbal-ocr-${runId}.png`);
  const tmpOutPath = path.join(os.tmpdir(), `cqbal-ocr-${runId}.json`);
  fs.writeFileSync(tmpImgPath, rotated);
  let text;
  try {
    text = await runOcrWorker(tmpImgPath, tmpOutPath);
  } finally {
    fs.unlink(tmpImgPath, () => {});
    fs.unlink(tmpOutPath, () => {});
  }
  const parsed = parseCQBALText(text, fileName);
  parsed.fileName = fileName;
  parsed.viaOCR = true;
  return parsed;
}

module.exports = { parseCQBALViaOCR, renderPdfToPng, rotatePng90Clockwise };
