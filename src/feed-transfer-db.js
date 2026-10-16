const {copy}=require('./feed-transfer');
function transferFeeds(db,input){
  if(!input||!Number.isSafeInteger(input.sourceId)||!Number.isSafeInteger(input.targetId)||input.sourceId===input.targetId)throw new Error('Escolha dois bancos diferentes.');
  return db.transaction(()=>{
    const source=db.prepare('SELECT * FROM database_profiles WHERE id=?').get(input.sourceId);
    const target=db.prepare('SELECT * FROM database_profiles WHERE id=?').get(input.targetId);
    if(!source||!target)throw new Error('Banco não encontrado.');
    if(source.species_id!==target.species_id)throw new Error('Compare bancos da mesma espécie para preservar as unidades nutricionais.');
    if(source.data_json!==input.expectedSource||target.data_json!==input.expectedTarget)throw new Error('Os bancos foram alterados. Compare novamente antes de copiar.');
    const s=JSON.parse(source.data_json),t=JSON.parse(target.data_json);
    if(!Array.isArray(s.feeds)||!Array.isArray(t.feeds))throw new Error('Banco sem lista de alimentos válida.');
    t.feeds=copy(s.feeds,t.feeds,input.indexes,source.name);
    db.prepare('UPDATE database_profiles SET data_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(JSON.stringify(t),target.id);
    return {targetId:target.id,data:t,count:input.indexes.length};
  })();
}
module.exports={transferFeeds};
