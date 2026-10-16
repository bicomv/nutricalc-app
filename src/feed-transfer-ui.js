(()=>{
  let modal=null;
  window.openFeedTransfer=async function(){
    if(!window.api?.transferFeeds)return nAlert('Comparação disponível no aplicativo desktop.');
    if(modal?.open)return;
    const species=S.sp;
    modal=document.createElement('dialog');modal.id='feedTransferDialog';
    modal.style.cssText='width:min(1000px,94vw);max-height:88vh;overflow:auto;padding:24px;border:1px solid #cbd5e1;border-radius:14px;background:white;color:#173b32';
    document.body.append(modal);
    modal.addEventListener('close',()=>modal.remove(),{once:true});
    const add=(tag,text,parent=modal)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;parent.append(e);return e;};
    add('h2','Comparar e copiar alimentos entre bancos');
    add('p','Escolha a origem e o destino. O banco de origem é preservado; os alimentos selecionados serão copiados sem alterar as exigências ou a seleção do destino.');
    add('p','São comparados bancos da mesma espécie, para manter as unidades nutricionais compatíveis.');
    const controls=add('div');controls.style.cssText='display:flex;gap:14px;flex-wrap:wrap;align-items:end;margin:16px 0';
    const select=(label)=>{const l=add('label',label,controls);l.style.cssText='display:flex;flex-direction:column;gap:6px;flex:1;min-width:220px';const s=add('select',undefined,l);s.style.padding='8px';return s;};
    const origin=select('Banco de origem'),destination=select('Banco de destino');
    const status=add('p','Carregando bancos…');status.setAttribute('role','status');
    const area=add('div');const footer=add('div');footer.style.marginTop='14px';
    let profiles=[],source,target,rows=[],busy=false;
    const button=(text,action,parent=footer)=>{const b=add('button',text,parent);b.type='button';b.className='btn bs';b.style.margin='4px';b.onclick=async()=>{if(busy)return;busy=true;refreshButton.disabled=true;copyButton.disabled=true;try{await action();}catch(e){status.textContent=e.message;}finally{busy=false;refreshButton.disabled=false;updateCount();}};return b;};
    async function saveActive(){
      if(!S.activeDbProfileId)return;
      if(typeof _dbSaveTimer!=='undefined'&&_dbSaveTimer){clearTimeout(_dbSaveTimer);_dbSaveTimer=null;}
      await window.api.updateDbProfile(S.activeDbProfileId,{data:{feeds:S.feeds,selectedIds:S.sel,presets:S.presets,activePreset:S.aPre,req:S.req,nuts:S.nuts}});
    }
    async function readProfiles(){await saveActive();profiles=await window.api.getDbProfiles(species);}
    origin.onchange=destination.onchange=()=>refreshButton.click();
    const refreshButton=button('Comparar',async()=>{await readProfiles();render();},controls);
    button('Inverter origem e destino',()=>{const v=origin.value;origin.value=destination.value;destination.value=v;render();},controls);
    const copyButton=button('Enviar selecionados para o destino',async()=>{
      if(!source||!target)throw new Error('Compare os bancos primeiro.');
      const indexes=[...area.querySelectorAll('input[data-index]:checked')].map(e=>Number(e.dataset.index));
      const result=await window.api.transferFeeds({sourceId:source.id,targetId:target.id,expectedSource:JSON.stringify(source.data),expectedTarget:JSON.stringify(target.data),indexes});
      if(result.targetId===S.activeDbProfileId){S.feeds=result.data.feeds;ensurePdr();S.dirty=true;if(typeof scheduleSessionSave==='function')scheduleSessionSave();}
      await readProfiles();render();await rDbs();
      status.textContent=result.count+' alimento(s) copiado(s). Banco de origem e exigências preservados.';
    });
    const close=add('button','Fechar',footer);close.className='btn bs';close.onclick=()=>{if(!busy)modal.close();};
    modal.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
    function updateCount(){
      const selected=[...area.querySelectorAll('input[data-index]:checked')];
      copyButton.textContent='Enviar '+selected.length+' alimento(s) para '+(target?.name||'o destino');copyButton.disabled=busy||!selected.length;
      const summary=area.querySelector('[data-selection]');
      if(summary)summary.textContent=selected.length?'Selecionados: '+selected.map(c=>rows.find(r=>r.index===Number(c.dataset.index)).feed.name).join('; '):'Nenhum alimento selecionado. Marque abaixo quais deseja enviar.';
      area.querySelectorAll('input[data-index]').forEach(c=>c.closest('tr').style.background=c.checked?'#ecfdf5':'');
      const all=area.querySelector('[data-select-all]');if(all){all.checked=!!rows.length&&selected.length===rows.length;all.indeterminate=selected.length>0&&selected.length<rows.length;}
    }
    function render(){
      area.replaceChildren();rows=[];
      source=profiles.find(p=>p.id===Number(origin.value));target=profiles.find(p=>p.id===Number(destination.value));
      if(!source||!target||source.id===target.id){status.textContent='Escolha dois bancos diferentes.';updateCount();return;}
      const a=source.data.feeds||[],b=target.data.feeds||[];
      rows=FeedTransfer.compare(a,b);
      const reverse=FeedTransfer.compare(b,a);
      const missing=rows.filter(r=>r.kind==='missing').length,changed=rows.length-missing;
      status.textContent=missing+' alimento(s) só na origem; '+reverse.filter(r=>r.kind==='missing').length+' só no destino; '+changed+' com mesmo nome e composição ou tipo diferente. Diferenças de preço são ignoradas.';
      if(!rows.length){add('p','Todos os alimentos da origem já estão no destino com os mesmos valores.',area);updateCount();return;}
      add('h3','Alimentos de '+source.name+' que você pode enviar para '+target.name,area);
      add('p','Marque somente os alimentos que deseja enviar. Se o mesmo nome tiver outra composição, será criada uma nova versão sem substituir o alimento do destino. Preços não entram na comparação.',area);
      add('p','',area).dataset.selection='';
      const all=add('label','Selecionar todos ',area),check=add('input',undefined,all);check.type='checkbox';check.dataset.selectAll='';check.onchange=()=>{area.querySelectorAll('input[data-index]').forEach(c=>c.checked=check.checked);updateCount();};
      const scroll=add('div',undefined,area);scroll.style.cssText='max-height:45vh;overflow:auto;margin-top:12px';
      const table=add('table',undefined,scroll);table.style.cssText='width:100%';
      const head=add('tr',undefined,add('thead',undefined,table));['Selecionar','Alimento','Diferença entre os bancos','Composição'].forEach(t=>add('th',t,head));
      const body=add('tbody',undefined,table);
      for(const row of rows){
        const tr=add('tr',undefined,body),td=add('td',undefined,tr),c=add('input',undefined,td);c.type='checkbox';c.dataset.index=row.index;c.onchange=updateCount;
        c.id='transfer-feed-'+row.index;c.setAttribute('aria-label','Enviar '+row.feed.name);
        const label=add('label',row.feed.name,add('td',undefined,tr));label.htmlFor=c.id;label.style.cursor='pointer';
        const diff=add('td',undefined,tr);
        if(row.kind==='missing')add('span','Não existe no destino',diff);
        else{
          add('strong','Composição ou tipo diferente',diff);
          const match=b.find(f=>FeedTransfer.nameKey(f)===FeedTransfer.nameKey(row.feed)||f._copiedFromName===FeedTransfer.nameKey(row.feed));
          for(const key of row.changes){
            const nut=(source.data.nuts||S.nuts||[]).find(n=>n.key===key);
            const format=v=>typeof v==='number'?v.toLocaleString('pt-BR'):String(v??0);
            add('div',(nut?.label||key)+': origem '+format(row.feed[key])+' → destino '+format(match?.[key]),diff);
          }
        }
        const detail=add('details',undefined,add('td',undefined,tr));add('summary','Ver composição',detail);
        const list=add('pre',JSON.stringify(Object.fromEntries(Object.entries(row.feed).filter(([k])=>!k.startsWith('_')&&!['id','custoKg'].includes(k))),null,2),detail);list.style.cssText='white-space:pre-wrap;font-size:11px';
      }
      updateCount();
    }
    modal.showModal();
    try{
      await readProfiles();
      for(const p of profiles){for(const s of [origin,destination]){const o=add('option',p.name,s);o.value=p.id;}}
      destination.value=String(S.activeDbProfileId||profiles[0]?.id||'');origin.value=String(profiles.find(p=>String(p.id)!==destination.value)?.id||'');
      render();
    }catch(e){status.textContent='Não foi possível carregar os bancos: '+e.message;}
  };
})();
