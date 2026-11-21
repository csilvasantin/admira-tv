// Shared by the channel, the Galleon and the isolated emergency player.
(function(root){
  const key=item=>String(item.stockId||item.id||'').replace(/^default:(?:stock-)?/,'');
  function ordered(base,state,convert=x=>x){
    if(state.emergency)return [convert(state.emergency)];
    const front=state.front.map(convert), tail=state.tail.map(convert);
    if(!front.length&&!tail.length)return base;
    const owned=new Set([...front,...tail].map(key));
    return [...front,...base.filter(item=>!owned.has(key(item))),...tail];
  }
  function watch({screen,onChange,origin='',storage,restoreEmpty=true}){
    try{storage||=window.localStorage;}catch{}
    const cache='adtv_import_priority:'+screen;
    let signature='',stopped=false,timer;
    function apply(data) {
      if(!data||!Array.isArray(data.front)||!Array.isArray(data.tail)||!Object.hasOwn(data,'emergency'))return;
      const next=JSON.stringify([data.emergency?.event,data.front.map(x=>x.event),data.tail.map(x=>x.event)]);
      if(next===signature)return;
      try{storage.setItem(cache,JSON.stringify(data));}catch{}
      onChange(data);signature=next;
    }
    try{const saved=JSON.parse(storage.getItem(cache));if(restoreEmpty||saved?.emergency)apply(saved);}catch{}
    async function refresh(){
      try{
        const r=await fetch(origin+'/api/import-priority?screen='+encodeURIComponent(screen),{cache:'no-store',signal:AbortSignal.timeout(5000)});
        if(r.ok&&!stopped){const data=await r.json();if(data.ok&&!stopped)apply(data);}
      }catch{}finally{if(!stopped)timer=setTimeout(refresh,3000);}
    }
    refresh();return ()=>{stopped=true;clearTimeout(timer);};
  }
  root.AdmiraImportPriority={ordered,watch};
})(globalThis);
