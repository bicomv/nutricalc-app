const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { validateFeed, validateCatalog } = require('../src/catalog-validation');
const { createCatalogService, validateConfig } = require('../src/catalog-service');

test('all application scripts parse', () => {
  const html = fs.readFileSync('src/index.html','utf8');
  for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
  for (const file of ['src/main.js','src/preload.js','src/catalog-ui.js','src/catalog-service.js']) new vm.Script(fs.readFileSync(file,'utf8'));
});
test('rejects executable markup, invalid numeric values and invalid dry matter', () => {
  for (const feed of [null, [], {name:'<img src=x>',ms:90}, {name:'x',ms:0}, {name:'x',ms:101}, {name:'x',ms:90,pb:-1}, {name:'x',ms:90,pb:NaN}, {name:'x',ms:90,pb:Infinity}, {name:'x',ms:90,lis:101}, {name:'x',ms:90,tipo:'<script>'}]) assert.throws(() => validateFeed(feed));
});
test('preserves all species nutrient keys and strips internal fields', () => {
  assert.deepEqual(validateFeed({name:' Milho ',ms:88,pb:8,fb:2,pd:0.2,pt:0.3,cl:0.1,ell:1.9,custoKg:2,_dbId:4,id:100,_custom:true}),{name:'Milho',tipo:'',ms:88,pb:8,fb:2,pd:0.2,pt:0.3,cl:0.1,ell:1.9,custoKg:2});
});
const config = { catalogUrl:'https://raw.githubusercontent.com/bicomv/nutricalc-app/main/catalog/foods.json' };
function memoryDB() {
  let value;
  return { prepare() { return { get() {return value ? {value} : undefined;}, run(_key, next) {value=next;} }; } };
}
const sample = {version:1,revision:1,feeds:[{id:'milho-001',species:'aves',feed:{name:'Milho',ms:88,pb:8}}]};
test('only official GitHub catalog path is allowed', () => {
  assert.deepEqual(validateConfig(config),config);
  for (const catalogUrl of ['http://raw.githubusercontent.com/bicomv/nutricalc-app/main/catalog/foods.json','https://raw.githubusercontent.com/evil/repo/main/catalog/foods.json','https://raw.githubusercontent.com.evil.test/bicomv/nutricalc-app/main/catalog/foods.json']) assert.throws(()=>validateConfig({...config,catalogUrl}));
});
test('public client has no login, publishing or suggestion methods', () => {
  const service=createCatalogService({config,db:memoryDB()});
  assert.deepEqual(service.status(),{catalogConfigured:true,error:null});
  assert.deepEqual(Object.keys(service).sort(),['cached','status','sync']);
  assert.equal(service.cached().feeds.length,0);
});
test('catalog rejects duplicated IDs, bad species and unsafe feed payloads', () => {
  assert.deepEqual(validateCatalog(sample),{...sample,feeds:[{...sample.feeds[0],feed:{name:'Milho',tipo:'',ms:88,pb:8}}]});
  for (const value of [{...sample,revision:-1},{...sample,feeds:[...sample.feeds,...sample.feeds]},{...sample,feeds:[{...sample.feeds[0],species:'unknown'}]},{...sample,feeds:[{...sample.feeds[0],feed:{name:'<script>',ms:90}}]}]) assert.throws(()=>validateCatalog(value));
});
test('valid download is cached; invalid, oversized, old or unavailable downloads preserve it', async () => {
  const db=memoryDB(); let response=()=>new Response(JSON.stringify(sample));
  const service=createCatalogService({config,db,shell:{},fetchImpl:async(_url,options)=>{assert.equal(options.redirect,'error');return response();}});
  await service.sync(); const before=service.cached(); assert.equal(before.feeds.length,1);
  for (const get of [()=>new Response('bad json'),()=>new Response(JSON.stringify({...sample,revision:0})),()=>new Response('missing',{status:404}),()=>new Response('x'.repeat(2*1024*1024+1))]) {
    response=get; await assert.rejects(service.sync()); assert.deepEqual(service.cached(),before);
  }
  response=()=>{throw new Error('offline');}; await assert.rejects(service.sync(),/offline/); assert.deepEqual(service.cached(),before);
  response=()=>new Response(JSON.stringify({...sample,revision:2})); await service.sync();
  response=()=>new Response(JSON.stringify(sample)); await assert.rejects(service.sync(),/antigo/); assert.equal(service.cached().revision,2);
});
