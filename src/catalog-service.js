'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { validateCatalog } = require('./catalog-validation');

function validateConfig(config) {
  const url = new URL(config.catalogUrl);
  if (url.protocol !== 'https:' || url.hostname !== 'raw.githubusercontent.com' || url.port || url.username || url.password || url.search || url.hash || !/^\/bicomv\/nutricalc-app\/[A-Za-z0-9._-]+\/catalog\/foods\.json$/.test(url.pathname)) throw new Error('Endereço do catálogo oficial inválido.');
  return { catalogUrl: url.href };
}

function createCatalogService({ db, config, fetchImpl = fetch }) {
  let settings, configError;
  try { settings = validateConfig(config ?? JSON.parse(fs.readFileSync(path.join(__dirname, 'catalog-config.json'), 'utf8'))); }
  catch (e) { configError = e.message; }
  function requireConfig() { if (!settings) throw new Error('Configuração do banco oficial inválida: ' + configError); }
  function cached() {
    const row = db.prepare('SELECT value FROM app_state WHERE key=?').get('officialCatalogGithub');
    if (!row) return { version: 1, revision: 0, feeds: [], checkedAt: null };
    const value = JSON.parse(row.value);
    return { ...validateCatalog(value), checkedAt: value.checkedAt };
  }
  return {
    status() { return { catalogConfigured: !!settings, error: configError || null }; },
    cached,
    async sync() {
      requireConfig();
      const response = await fetchImpl(settings.catalogUrl, { redirect: 'error', signal: AbortSignal.timeout(20000), headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' } });
      if (!response.ok) throw new Error(response.status === 404 ? 'O catálogo ainda não foi publicado no GitHub. Seu banco local continua disponível.' : 'Não foi possível baixar o catálogo (' + response.status + '). Tente novamente mais tarde.');
      const limit = 2 * 1024 * 1024;
      if (Number(response.headers.get('content-length')) > limit) throw new Error('Catálogo excedeu o limite de tamanho.');
      const reader = response.body.getReader();
      const chunks = []; let size = 0;
      try {
        while (true) {
          const { value, done } = await reader.read(); if (done) break;
          size += value.byteLength;
          if (size > limit) { await reader.cancel(); throw new Error('Catálogo excedeu o limite de tamanho.'); }
          chunks.push(Buffer.from(value));
        }
      } finally { reader.releaseLock(); }
      const catalog = validateCatalog(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      const previous = cached();
      if (catalog.revision < previous.revision) throw new Error('Catálogo antigo recebido. A cópia local foi preservada.');
      const value = { ...catalog, checkedAt: new Date().toISOString() };
      db.prepare('INSERT OR REPLACE INTO app_state (key,value) VALUES (?,?)').run('officialCatalogGithub', JSON.stringify(value));
      return value;
    }
  };
}
module.exports = { createCatalogService, validateConfig };
