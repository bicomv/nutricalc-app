// Development-only runner. Start Electron on loopback debug port 19437 first.
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
  const targets = await (await fetch('http://127.0.0.1:19437/json/list')).json();
  const target = targets.find(t => t.type === 'page' && t.url.endsWith('/index.html'));
  assert.ok(target, 'NutriCalc window exists');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject) => {ws.onopen=resolve;ws.onerror=reject;});
  let seq=0; const pending=new Map();
  ws.onmessage=e=>{const r=JSON.parse(e.data);if(pending.has(r.id)){pending.get(r.id)(r);pending.delete(r.id);}};
  async function cdp(method, params={}) {const id=++seq;const p=new Promise(resolve=>pending.set(id,resolve));ws.send(JSON.stringify({id,method,params}));return p;}
  async function evaluate(expression) {
    const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
    if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
    return r.result.result.value;
  }
  const status=await evaluate('window.api.catalogStatus()');
  assert.deepEqual(status,{ok:true,data:{catalogConfigured:true,error:null}});
  assert.equal(await evaluate("typeof window.api.catalogLogin"),'undefined');
  assert.equal(await evaluate("typeof window.api.catalogOpenForm"),'undefined');
  assert.equal(await evaluate("!!document.querySelector('#landing #catalogLauncher')"),true);
  const previousCache=await evaluate("window.api.getState('officialCatalogGithub')");
  const bundled=await evaluate("({count:DB.bovcorte.feeds.length,feed:DB.bovcorte.feeds[0]})");
  const duplicateCatalog={version:1,revision:3,feeds:[{id:'test-duplicate-original',species:'ruminantes',feed:{...bundled.feed,custoKg:999}}],checkedAt:new Date().toISOString()};
  await evaluate('window.api.saveState("officialCatalogGithub",'+JSON.stringify(duplicateCatalog)+')');
  await cdp('Page.reload');await new Promise(resolve=>setTimeout(resolve,600));
  await evaluate("initSpecies('bovcorte')");
  assert.equal(await evaluate('DB.bovcorte.feeds.length'),bundled.count,'downloaded duplicate does not enter original defaults');
  assert.equal(await evaluate("S.feeds.filter(f=>f._officialId==='test-duplicate-original').length"),0,'downloaded duplicate does not enter current profile');
  await evaluate("document.querySelector('#catalogLauncher').click()");
  const dialog=await evaluate("new Promise(resolve=>setTimeout(()=>resolve({open:document.querySelector('#catalogDialog').open,text:document.querySelector('#catalogDialog').textContent,disabled:[...document.querySelectorAll('#catalogDialog button')].some(b=>b.disabled)}),100))");
  assert.equal(dialog.open,true);assert.match(dialog.text,/Atualizar banco original/);assert.doesNotMatch(dialog.text,/Entrar com Google|Sugerir|formulário/i);
  await evaluate("document.querySelector('#catalogDialog').close(); initSpecies('bovcorte')");
  const feeds=await evaluate("({sp:S.sp,count:S.feeds.length,unique:new Set(S.feeds.map(f=>f.id)).size,api:typeof window.require})");
  assert.equal(feeds.sp,'bovcorte');assert.ok(feeds.count>30);assert.equal(feeds.count,feeds.unique);assert.equal(feeds.api,'undefined');
  const escaped = await evaluate(`(() => { const f=S.feeds[0]; const original=f.name; f.name='x" autofocus onfocus="window.__injected=1'; modEditFeed(f.id); const value=document.querySelector('#ef_n').value; const injected=document.querySelector('#ef_n').hasAttribute('onfocus'); f.name=original;closeMod();return {value,injected}; })()`);
  assert.equal(escaped.injected,false); assert.match(escaped.value,/autofocus/);
  await evaluate(`(async()=>{
    window.__transferOriginal=JSON.parse(JSON.stringify(S.feeds));
    window.__transferSource=await window.api.saveDbProfile({name:'Teste origem comparação',species_id:S.sp,data:{feeds:[{...S.feeds[0],ms:S.feeds[0].ms===90?89:90},{id:9999,name:'Ingrediente exclusivo teste transferência',ms:91,pb:12}],presets:{}}});
    await openFeedTransfer();
    const selects=document.querySelectorAll('#feedTransferDialog select');selects[0].value=window.__transferSource;selects[1].value=S.activeDbProfileId;
    [...document.querySelectorAll('#feedTransferDialog button')].find(b=>b.textContent==='Comparar').click();
  })()`);
  await evaluate('new Promise(resolve=>setTimeout(resolve,250))');
  const transfer=await evaluate(`({rows:document.querySelectorAll('#feedTransferDialog input[data-index]').length,text:document.querySelector('#feedTransferDialog').textContent})`);
  assert.equal(transfer.rows,2);assert.match(transfer.text,/Composição ou tipo diferente/);assert.match(transfer.text,/Não existe no destino/);assert.match(transfer.text,/origem .* → destino/);
  await evaluate(`const choice=document.querySelector('#feedTransferDialog input[data-index="1"]');choice.checked=true;choice.dispatchEvent(new Event('change'));`);
  assert.equal(await evaluate("[...document.querySelectorAll('#feedTransferDialog button')].find(b=>b.textContent.startsWith('Enviar ')).disabled"),false);
  assert.match(await evaluate("document.querySelector('#feedTransferDialog [data-selection]').textContent"),/Ingrediente exclusivo teste transferência/);
  await evaluate(`[...document.querySelectorAll('#feedTransferDialog button')].find(b=>b.textContent.startsWith('Enviar ')).click()`);
  await evaluate('new Promise(resolve=>setTimeout(resolve,250))');
  assert.equal(await evaluate('S.feeds.length-window.__transferOriginal.length'),1);
  assert.equal(await evaluate('S.feeds[0].ms===window.__transferOriginal[0].ms'),true);
  assert.match(await evaluate("document.querySelector('#feedTransferDialog [role=status]').textContent"),/1 alimento\(s\) copiado/);
  await evaluate(`(async()=>{document.querySelector('#feedTransferDialog').close();S.feeds=window.__transferOriginal;await autoSaveDbProfileImmediately();await window.api.deleteDbProfile(window.__transferSource);})()`);
  await evaluate("goTab('feeds')");
  const screenshot=await cdp('Page.captureScreenshot',{format:'png'});
  fs.writeFileSync('.test-profile/smoke.png',Buffer.from(screenshot.result.data,'base64'));
  await evaluate('window.api.saveState("officialCatalogGithub",'+JSON.stringify(previousCache||{version:1,revision:1,feeds:[],checkedAt:null})+')');
  console.log('PASS: original catalog duplicate rejected in defaults and current bank; selected transfer; UI and Node isolation.');
  // Close the development window so the interactive launch has no debug port.
  await evaluate("window.api.confirmClose()").catch(()=>{});
  ws.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
