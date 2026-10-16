(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.FeedTransfer=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const nameKey=f=>String(f.name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR');
  function changes(a,b){
    const keys=new Set([...Object.keys(a),...Object.keys(b)]);
    return [...keys].filter(k=>!k.startsWith('_')&&!['id','name','custoKg'].includes(k)&&String(a[k]??0)!==String(b[k]??0));
  }
  function compare(source,target){
    return source.map((feed,index)=>{
      const matches=target.filter(f=>nameKey(f)===nameKey(feed)||f._copiedFromName===nameKey(feed));
      if(!matches.length)return {index,feed,kind:'missing',changes:[]};
      if(matches.some(f=>!changes(feed,f).length))return null;
      return {index,feed,kind:'changed',changes:changes(feed,matches[0])};
    }).filter(Boolean);
  }
  function copy(source,target,indexes,sourceName){
    if(!Array.isArray(indexes)||!indexes.length||indexes.length>5000||new Set(indexes).size!==indexes.length)throw new Error('Selecione os alimentos para copiar.');
    const feeds=JSON.parse(JSON.stringify(target));
    const allowed=new Map(compare(source,target).map(r=>[r.index,r]));
    let next=Math.max(0,...feeds.map(f=>Number(f.id)||0))+1;
    for(const index of indexes){
      if(!Number.isInteger(index)||!allowed.has(index))throw new Error('Comparação desatualizada. Compare os bancos novamente.');
      const row=allowed.get(index),feed=JSON.parse(JSON.stringify(row.feed));
      delete feed._dbId;delete feed._custom;delete feed._officialId;delete feed._officialRevision;
      feed.id=next++;feed._copiedFromName=nameKey(row.feed);
      if(feeds.some(f=>nameKey(f)===nameKey(feed))){
        const original=feed.name+' ('+sourceName+')';let name=original,n=2;
        while(feeds.some(f=>nameKey(f)===nameKey({name})))name=original+' '+n++;
        feed.name=name;
      }
      feeds.push(feed);
    }
    return feeds;
  }
  return {nameKey,changes,compare,copy};
});
