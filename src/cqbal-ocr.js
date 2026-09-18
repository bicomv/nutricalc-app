/**
 * Fallback via OCR para relatórios do CQBAL cujo texto embutido no PDF não é
 * extraível de forma confiável (fontes customizadas sem ToUnicode). Em vez de
 * tentar decodificar a fonte, renderiza CADA página do PDF como imagem e lê o
 * texto visualmente via Tesseract.
 *
 * Renderização das páginas: usa o build do pdf.js que já vem embutido no
 * pdf-parse (node_modules/pdf-parse/lib/pdf.js/v2.0.550) dentro de uma janela
 * oculta. O pdf.js aplica automaticamente a rotação de cada página ao gerar o
 * viewport, então relatórios desenhados em paisagem (girados 90°) saem já na
 * orientação correta — resolvendo o caso em que "o PDF lido na horizontal não
 * pegava tudo". Todas as páginas são renderizadas e passadas ao OCR.
 *
 * Se a renderização via pdf.js falhar por qualquer motivo, cai no método
 * antigo (visualizador de PDF do Chromium + capturePage + rotação manual),
 * que já funcionava para PDFs de uma página.
 */
const { BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const { PNG } = require('pngjs');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseCQBALText } = require('./cqbal-parser');

// ── Caminhos do pdf.js embutido no pdf-parse ──
function resolvePdfjsPaths() {
  const pdfParseDir = path.dirname(require.resolve('pdf-parse'));
  const base = path.join(pdfParseDir, 'lib', 'pdf.js', 'v2.0.550', 'build');
  return {
    lib: path.join(base, 'pdf.js'),
    worker: path.join(base, 'pdf.worker.js')
  };
}

// Renderiza TODAS as páginas do PDF para PNG (uma imagem por página), já na
// orientação correta. Retorna um array de Buffers PNG. Lança se não conseguir.
async function renderPdfPagesViaPdfjs(buf) {
  const paths = resolvePdfjsPaths();

  // Copiamos a lib e o worker do pdf.js para o tmp e os referenciamos por
  // <script src>/workerSrc. Isso evita (a) inserir megabytes de JS inline e o
  // risco de um "</script>" dentro do código, e (b) problemas de carregar
  // arquivos de dentro do app.asar no app empacotado.
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const tmpLib = path.join(os.tmpdir(), `cqbal-pdflib-${runId}.js`);
  const tmpWorker = path.join(os.tmpdir(), `cqbal-pdfworker-${runId}.js`);
  const tmpHtml = path.join(os.tmpdir(), `cqbal-pdfrender-${runId}.html`);
  fs.copyFileSync(paths.lib, tmpLib);
  fs.copyFileSync(paths.worker, tmpWorker);

  const libUrl = 'file:///' + tmpLib.replace(/\\/g, '/');
  const workerUrl = 'file:///' + tmpWorker.replace(/\\/g, '/');
  const b64 = buf.toString('base64');

  // A base64 do PDF vai gravada dentro do próprio HTML para não trafegar uma
  // string gigante por executeJavaScript.
  const html = `<!doctype html><html><head><meta charset="utf-8"><script src="${libUrl}"></script></head>
<body><script>
(async function(){
  window.__done=false; window.__err=null; window.__result=[];
  try{
    var lib = window.pdfjsLib || window['pdfjs-dist/build/pdf'];
    lib.GlobalWorkerOptions.workerSrc = ${JSON.stringify(workerUrl)};
    var b64 = ${JSON.stringify(b64)};
    var raw = atob(b64);
    var arr = new Uint8Array(raw.length);
    for (var i=0;i<raw.length;i++) arr[i]=raw.charCodeAt(i);
    var pdf = await lib.getDocument({data:arr}).promise;
    var out = [];
    for (var p=1;p<=pdf.numPages;p++){
      var page = await pdf.getPage(p);
      // Resolução adaptativa: alvo de ~2400px no maior lado (boa leitura para o
      // OCR sem estourar o limite de canvas do Chromium). A rotação intrínseca
      // da página já é aplicada pelo getViewport, e renderizamos a página
      // INTEIRA (canvas do tamanho exato do viewport, com Math.ceil para não
      // raspar a última linha/coluna de pixels), evitando qualquer corte.
      var base = page.getViewport(1.0);
      var longSide = Math.max(base.width, base.height) || 1;
      var scale = 2400 / longSide;
      if (scale < 1.5) scale = 1.5;
      if (scale > 4) scale = 4;
      var maxDim = 8000;
      if (base.width*scale > maxDim || base.height*scale > maxDim){
        scale = maxDim / longSide;
      }
      var viewport = page.getViewport(scale);
      var canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0,0,canvas.width,canvas.height);
      await page.render({canvasContext:ctx, viewport:viewport}).promise;
      out.push(canvas.toDataURL('image/png'));
    }
    window.__result = out;
    window.__done = true;
  }catch(e){
    window.__err = String(e && e.stack || e);
    window.__done = true;
  }
})();
</script></body></html>`;

  fs.writeFileSync(tmpHtml, html, 'utf8');

  const rwin = new BrowserWindow({
    show: false,
    width: 1200,
    height: 1600,
    webPreferences: {
      offscreen: false,
      webSecurity: false,
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  try {
    await rwin.loadFile(tmpHtml);
    // Espera o render assíncrono terminar (poll do flag global na página).
    const startedAt = Date.now();
    const timeoutMs = 90000;
    let dataUrls = null;
    while (true) {
      const state = await rwin.webContents.executeJavaScript(
        'window.__done ? {done:true, err:window.__err, result:window.__result} : {done:false}'
      );
      if (state && state.done) {
        if (state.err) throw new Error('pdf.js render falhou: ' + state.err);
        dataUrls = state.result || [];
        break;
      }
      if (Date.now() - startedAt > timeoutMs) {
        throw new Error('Tempo esgotado renderizando páginas do PDF.');
      }
      await new Promise(r => setTimeout(r, 250));
    }
    if (!dataUrls.length) throw new Error('Nenhuma página renderizada.');
    return dataUrls.map(u => Buffer.from(u.split(',')[1], 'base64'));
  } finally {
    rwin.destroy();
    fs.unlink(tmpHtml, () => {});
    fs.unlink(tmpWorker, () => {});
    fs.unlink(tmpLib, () => {});
  }
}

// Os relatórios do CQBAL são desenhados girados 90° (paisagem dentro de uma
// página retrato). O visualizador de PDF do Chromium reproduz essa rotação
// tal como está no arquivo, então giramos a imagem capturada de volta antes
// de mandar para o OCR. (Usado apenas no fallback via capturePage.)
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

// Método antigo (fallback): renderiza o PDF pelo visualizador do Chromium e
// captura a viewport. Funciona bem para relatórios de uma página.
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

// Roda o OCR sobre um Buffer PNG e devolve o texto reconhecido.
async function ocrPng(pngBuf) {
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const tmpImgPath = path.join(os.tmpdir(), `cqbal-ocr-${runId}.png`);
  const tmpOutPath = path.join(os.tmpdir(), `cqbal-ocr-${runId}.json`);
  fs.writeFileSync(tmpImgPath, pngBuf);
  try {
    return await runOcrWorker(tmpImgPath, tmpOutPath);
  } finally {
    fs.unlink(tmpImgPath, () => {});
    fs.unlink(tmpOutPath, () => {});
  }
}

async function parseCQBALViaOCR(buf, fileName = '') {
  let pageBuffers;
  try {
    // Caminho preferido: renderiza todas as páginas já na orientação correta.
    pageBuffers = await renderPdfPagesViaPdfjs(buf);
  } catch (err) {
    console.warn('Render via pdf.js falhou, usando fallback capturePage:', err.message);
    // Fallback: método antigo (uma imagem, rotação manual).
    const png = await renderPdfToPng(buf);
    pageBuffers = [rotatePng90Clockwise(png)];
  }

  // OCR de cada página; o texto de todas é concatenado e passado ao parser,
  // que localiza os nutrientes independentemente de em qual página aparecem.
  const texts = [];
  for (let i = 0; i < pageBuffers.length; i++) {
    try {
      const t = await ocrPng(pageBuffers[i]);
      if (t) texts.push(t);
    } catch (e) {
      console.warn(`OCR da página ${i + 1} falhou:`, e.message);
    }
  }

  const fullText = texts.join('\n');
  const parsed = parseCQBALText(fullText, fileName);
  parsed.fileName = fileName;
  parsed.viaOCR = true;
  parsed.ocrPages = pageBuffers.length;
  return parsed;
}

module.exports = { parseCQBALViaOCR, renderPdfToPng, rotatePng90Clockwise, renderPdfPagesViaPdfjs };
