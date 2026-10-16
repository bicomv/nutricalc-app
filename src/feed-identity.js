(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.FeedIdentity=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const nutrients='ms ndt pb dpb pdr ee fdn fda fb pd pt cl ell vita ca p mg na k s cu zn fe mn i co se em ed eb lis met metcis tre trip arg val iso leu his fen'.split(' ');
  const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+/g,' ');
  function key(feed){
    const values={};
    for(const k of nutrients){
      let value=Number(feed[k]??0);
      if(k==='pdr'&&Number(feed.dpb)>0)value=Math.round(Number(feed.pb||0)*Number(feed.dpb)/100*100)/100;
      if(value!==0)values[k]=value;
    }
    return JSON.stringify([normalize(feed.name),normalize(feed.tipo),values]);
  }
  function exists(feeds,feed){const identity=key(feed);return feeds.some(f=>key(f)===identity);}
  return {key,exists};
});
