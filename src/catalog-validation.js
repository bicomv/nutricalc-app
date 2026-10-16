'use strict';
const SPECIES = ['ruminantes', 'suinos', 'aves', 'equinos'];
const NUMBERS = ['ms','ndt','pb','dpb','pdr','ee','fdn','fda','fb','pd','pt','cl','ell','vita','ca','p','mg','na','k','s','cu','zn','fe','mn','i','co','se','em','ed','eb','lis','met','metcis','tre','trip','arg','val','iso','leu','his','fen','custoKg'];
function validateFeed(feed) {
  if (!feed || typeof feed !== 'object' || Array.isArray(feed)) throw new Error('Alimento inválido.');
  if (typeof feed.name !== 'string' || !feed.name.trim() || feed.name.length > 160 || /[<>\x00-\x1f]/.test(feed.name)) throw new Error('Nome inválido (máximo 160 caracteres, sem HTML).');
  const clean = { name: feed.name.trim(), tipo: '' };
  if (feed.tipo !== undefined) {
    if (typeof feed.tipo !== 'string' || feed.tipo.length > 60 || /[<>\x00-\x1f]/.test(feed.tipo)) throw new Error('Tipo inválido.');
    clean.tipo = feed.tipo;
  }
  for (const key of NUMBERS) if (Object.hasOwn(feed, key)) {
    if (typeof feed[key] !== 'number' || !Number.isFinite(feed[key]) || feed[key] < 0 || feed[key] > 10000000) throw new Error('Valor inválido: ' + key);
    clean[key] = feed[key];
  }
  if (!(clean.ms > 0 && clean.ms <= 100)) throw new Error('Matéria seca deve ser maior que 0 e até 100%.');
  for (const key of ['pb','ndt','dpb','pdr','ee','fdn','fda','fb','pd','pt','cl','ca','p','mg','na','k','s','lis','met','metcis','tre','trip','arg','val','iso','leu','his','fen']) if (clean[key] > 100) throw new Error(key + ' deve ser até 100%.');
  return clean;
}
function validateCatalog(value) {
  if (!value || value.version !== 1 || !Number.isSafeInteger(value.revision) || value.revision < 1 || !Array.isArray(value.feeds) || value.feeds.length > 5000) throw new Error('Formato do catálogo inválido.');
  const seen = new Set();
  const feeds = value.feeds.map(row => {
    if (!row || typeof row.id !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,79}$/.test(row.id) || seen.has(row.id) || !SPECIES.includes(row.species)) throw new Error('Identificador duplicado ou registro inválido no catálogo.');
    seen.add(row.id);
    return { id: row.id, species: row.species, feed: validateFeed(row.feed) };
  });
  return { version: 1, revision: value.revision, feeds };
}
module.exports = { validateFeed, validateCatalog, SPECIES, NUMBERS };
