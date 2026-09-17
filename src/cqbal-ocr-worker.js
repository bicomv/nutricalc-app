/**
 * Worker de OCR executado em processo filho *detached* (via
 * ELECTRON_RUN_AS_NODE=1, para funcionar mesmo no app empacotado sem
 * depender de um Node.js instalado à parte). Recebe o caminho de uma imagem
 * PNG e o caminho de um arquivo de saída; escreve o texto reconhecido (ou o
 * erro) nesse arquivo como JSON — o processo pai lê o resultado de lá em vez
 * de aguardar stdout, pois isso trava quando chamado logo após o pai ter
 * criado uma BrowserWindow (stdio pipe nunca fecha nesse cenário no Windows).
 */
const fs = require('fs');
const Tesseract = require('tesseract.js');

async function main() {
  const imagePath = process.argv[2];
  const outputPath = process.argv[3];
  if (!imagePath || !outputPath) {
    throw new Error('Caminho da imagem ou do arquivo de saída não informado.');
  }
  const { data } = await Tesseract.recognize(imagePath, 'por');
  fs.writeFileSync(outputPath, JSON.stringify({ text: data.text }));
}

main().then(() => process.exit(0)).catch(err => {
  const outputPath = process.argv[3];
  const message = String(err && err.stack || err);
  if (outputPath) {
    try { fs.writeFileSync(outputPath, JSON.stringify({ error: message })); } catch (e) {}
  }
  process.exit(1);
});
