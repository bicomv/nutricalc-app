const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {compare,copy}=require('../src/feed-transfer');
const {transferFeeds}=require('../src/feed-transfer-db');
const Database=require('better-sqlite3');
test('normalizes names, compares nutrient values and ignores internal IDs',()=>{
  assert.equal(compare([{name:'Milho',ms:90,custoKg:1}],[{name:'Milho',ms:90,custoKg:8}]).length,0);
  assert.deepEqual(compare([{name:'Milho',ms:90,pb:8,custoKg:1}],[{name:'Milho',ms:90,pb:9,custoKg:8}])[0].changes,['pb']);
  assert.equal(compare([{id:1,name:'  MILHÓ  grão ',ms:90,_dbId:2}],[{id:9,name:'milho grão',ms:90}]).length,0);
  assert.equal(compare([{name:'Milho',ms:90}],[{name:'Milho',ms:89}])[0].kind,'changed');
  assert.equal(compare([{name:'Soja',ms:90}],[{name:'Milho',ms:89}])[0].kind,'missing');
});
test('copies independently with unique IDs, preserves existing food and deduplicates copied variants',()=>{
  const source=[{id:1,name:'Milho',ms:90,_dbId:44,_officialId:'x'},{id:2,name:'Soja',ms:88}];
  const target=[{id:1,name:'Milho',ms:89}];
  const result=copy(source,target,[0,1],'Banco A');
  assert.deepEqual(result[0],target[0]);assert.equal(result[1].name,'Milho (Banco A)');
  assert.equal(new Set(result.map(f=>f.id)).size,3);assert.equal(result[1]._dbId,undefined);assert.equal(result[1]._officialId,undefined);
  assert.equal(compare(source,result).length,0);
  result[2].ms=1;assert.equal(source[1].ms,88);assert.equal(target.length,1);
  assert.throws(()=>copy(source,target,[99],'A'));assert.throws(()=>copy(source,target,[0,0],'A'));
});
test('database transfer preserves presets, selection and source; rejects stale data and cross-species transfers',()=>{
  const db=new Database(':memory:');
  try{
    db.exec('CREATE TABLE database_profiles(id INTEGER PRIMARY KEY,name TEXT,species_id TEXT,data_json TEXT,updated_at TEXT)');
    const source={feeds:[{id:1,name:'Soja',ms:88}],presets:{source:true}};
    const target={feeds:[{id:1,name:'Milho',ms:90}],selectedIds:[1],presets:{grow:{cms:4}},nuts:[{key:'ms'}]};
    const insert=db.prepare('INSERT INTO database_profiles(id,name,species_id,data_json) VALUES(?,?,?,?)');
    insert.run(1,'Origem','aves',JSON.stringify(source));insert.run(2,'Destino','aves',JSON.stringify(target));insert.run(3,'Outro','equinos',JSON.stringify(target));
    const input={sourceId:1,targetId:2,expectedSource:JSON.stringify(source),expectedTarget:JSON.stringify(target),indexes:[0]};
    const result=transferFeeds(db,input);
    assert.equal(result.count,1);assert.deepEqual(result.data.selectedIds,[1]);assert.deepEqual(result.data.presets,target.presets);assert.deepEqual(result.data.nuts,target.nuts);
    assert.equal(db.prepare('SELECT data_json FROM database_profiles WHERE id=1').get().data_json,JSON.stringify(source));
    const saved=db.prepare('SELECT data_json FROM database_profiles WHERE id=2').get().data_json;
    assert.throws(()=>transferFeeds(db,input),/alterados/);
    assert.equal(db.prepare('SELECT data_json FROM database_profiles WHERE id=2').get().data_json,saved);
    assert.throws(()=>transferFeeds(db,{...input,targetId:3}),/mesma espécie/);
    assert.throws(()=>transferFeeds(db,{...input,targetId:1}),/diferentes/);
  }finally{db.close();}
});
test('transfer interface parses',()=>{new vm.Script(fs.readFileSync('src/feed-transfer-ui.js','utf8'));});
