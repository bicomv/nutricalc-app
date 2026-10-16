/* Read-only public catalog. Publishing is restricted by GitHub repository access. */
(() => {
  if (!window.api?.catalogStatus) return;
  let cache = { feeds: [], revision: 0, checkedAt: null };
  const base = new Map(Object.entries(DB).map(([sp, d]) => [sp, JSON.parse(JSON.stringify(d.feeds))]));
  const group = sp => ['bovcorte','bovleite','ovinos','caprinos'].includes(sp) ? 'ruminantes' : sp;
  const dialog = document.createElement('dialog');
  dialog.id = 'catalogDialog';
  dialog.style.cssText = 'width:min(620px,90vw);max-height:80vh;overflow:auto;border:1px solid #cbd5e1;border-radius:14px;padding:24px;color:#173b32;background:#fff;box-shadow:0 16px 70px #0005';
  document.body.append(dialog);
  const launcher = document.createElement('button');
  launcher.id = 'catalogLauncher'; launcher.className = 'btn bs'; launcher.textContent = '☁ Atualizar banco original';
  launcher.style.cssText = 'background:rgba(255,255,255,.12);color:#fff;border:1.5px solid rgba(255,255,255,.25);font-size:12px';
  launcher.onclick = () => open().catch(e => nAlert(e.message));
  const homeActions = document.querySelector('#landing button[onclick="checkAppUpdate()"]')?.parentElement;
  if (homeActions) {
    homeActions.style.cssText += ';display:flex;gap:8px;justify-content:center;flex-wrap:wrap';
    homeActions.append(launcher);
  } else document.getElementById('landing').append(launcher);
  function el(tag, text) { const node = document.createElement(tag); node.textContent = text; dialog.append(node); return node; }
  async function call(method) {
    const result = await window.api[method]();
    if (!result.ok) throw new Error(result.error);
    return result.data;
  }
  function updateDefaults() {
    for (const [sp, original] of base) {
      let next = Math.max(...original.map(f => f.id), 200) + 10000;
      DB[sp].feeds = [...JSON.parse(JSON.stringify(original)), ...cache.feeds.filter(r => r.species === group(sp)).map(r => ({ ...r.feed, id: next++, _officialId: r.id }))];
    }
  }
  function appendToCurrent() {
    if (!S.sp || S.activeDbProfileName !== 'Banco Padrão' || S.loadedDietId) return 0;
    let count = 0;
    for (const row of cache.feeds.filter(r => r.species === group(S.sp))) {
      if (S.feeds.some(f => f._officialId === row.id)) continue;
      S.feeds.push({ ...row.feed, id: newFeedId(), _officialId: row.id }); count++;
    }
    if (count) { ensurePdr(); rFeeds(); }
    return count;
  }
  const previousInit = initSpecies;
  initSpecies = async function(sp) { await ready; await previousInit(sp); appendToCurrent(); };
  async function open() {
    await ready;
    const status = await call('catalogStatus');
    dialog.replaceChildren();
    el('h2', 'Atualizar banco original');
    el('p', 'Baixe os alimentos oficiais publicados pelo responsável pelo NutriCalc. Continue usando sem conta e offline após a atualização.');
    el('p', cache.checkedAt ? 'Última atualização: ' + new Date(cache.checkedAt).toLocaleString('pt-BR') : 'O banco original do aplicativo está disponível. Nenhuma atualização online foi baixada.');
    const message = el('p', ''); message.setAttribute('role', 'status');
    const buttons = [];
    function button(label, action) {
      const b = el('button', label); b.type = 'button'; b.className = 'btn bs'; b.style.margin = '5px'; buttons.push(b);
      b.onclick = async () => {
        buttons.forEach(b => b.disabled = true);
        try { await action(); } catch(e) { message.textContent = e.message; }
        finally { buttons.forEach(b => b.disabled = false); }
      };
      return b;
    }
    button('Atualizar banco original', async () => {
      message.textContent = 'Baixando os alimentos oficiais…';
      cache = await call('catalogSync'); updateDefaults();
      const count = appendToCurrent();
      await open();
      dialog.querySelector('[role="status"]').textContent = 'Banco atualizado: ' + cache.feeds.length + ' alimento(s) oficial(is), ' + count + ' adicionado(s) ao banco padrão atual. Dietas e alimentos locais preservados.';
    });
    el('p', 'As atualizações adicionam alimentos oficiais ao banco padrão. As composições e preços já usados em dietas ou bancos locais não são substituídos.');
    if (status.error) message.textContent = status.error;
    button('Fechar', () => dialog.close());
    if (!dialog.open) dialog.showModal();
  }
  const ready = (async () => {
    try { cache = await call('catalogCached'); updateDefaults(); }
    catch(e) { console.warn('Catálogo offline indisponível:', e.message); }
  })();
})();
