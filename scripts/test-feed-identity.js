const {test}=require('node:test');const assert=require('node:assert/strict');const {key,exists}=require('../src/feed-identity');
test('matches existing original food despite ID, price, metadata, zero defaults and derived PDR',()=>{
  const a={id:1,name:'  MILHÓ  grão ',tipo:'Concentrado',ms:90,pb:20,dpb:50,custoKg:1};
  const b={id:9,name:'milho grão',tipo:'Concentrado',ms:90,pb:20,dpb:50,pdr:10,ca:0,ee:0,custoKg:8,_officialId:'published'};
  assert.equal(key(a),key(b));assert.equal(exists([a],b),true);
  assert.equal(exists([a],{...b,pb:21}),false);
});
test('keeps distinct composition and type as separate versions',()=>{
  const a={name:'Soja',ms:90,pb:40,tipo:'Concentrado'};
  assert.notEqual(key(a),key({...a,pb:45}));assert.notEqual(key(a),key({...a,tipo:'Outros'}));
});
