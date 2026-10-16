const fs = require('node:fs');
const { validateCatalog } = require('../src/catalog-validation');
try {
  const data = fs.readFileSync('catalog/foods.json');
  if (data.length > 2 * 1024 * 1024) throw new Error('O arquivo excede 2 MiB.');
  const catalog = validateCatalog(JSON.parse(data.toString('utf8')));
  console.log('Catálogo válido: revisão ' + catalog.revision + ', ' + catalog.feeds.length + ' alimento(s).');
} catch (e) { console.error(e.message); process.exitCode = 1; }
