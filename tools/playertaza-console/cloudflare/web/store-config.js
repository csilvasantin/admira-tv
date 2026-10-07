(() => {
 const host=document.querySelector('[data-store-config]');if(!host)return;
 host.innerHTML=`<h2 style="font-size:16px;margin:0 0 10px">Proyecto de CarlosGdG</h2>
 <label>Proyecto <select id="project-select" style="width:100%;margin:6px 0" aria-label="Proyecto"><option value="canalkiosk">CanalKiosk</option><option value="starbucks">Starbucks</option><option value="yarigai">Yarigai</option><option value="store">Otra store</option></select></label>
 <label>Buscar store <input id="store-search" placeholder="CanalKiosk, Starbucks, nombre o ID" style="width:100%;margin:6px 0"></label>
 <label>Store <select id="store-select" style="width:100%;margin:6px 0" aria-label="Store"></select></label>
 <label>Pantalla <select id="store-screen" style="width:100%;margin:6px 0" aria-label="Pantalla"></select></label>
 <label>ID de otra pantalla <input id="store-custom-screen" placeholder="Opcional: ID de pantalla o URL del player" style="width:100%;margin:6px 0"></label>
 <div><button id="store-save" type="button">Guardar asociación</button> <button id="store-release" type="button">Desvincular</button></div>
 <p id="store-binding-label">Leyendo asociación…</p><p id="store-current" role="status">Esperando contenido</p>
 <p style="font-size:12px;color:#8b96a3">El GIF y la cola de envío no confirman reproducción en los LEDs. Contrasta la taza con la cámara.</p>`;
 const $=id=>host.querySelector('#'+id);let stores=[],binding=null,loading=false,storeRequest=0;
 async function api(path,body){const r=await fetch(path+(path.includes('?')?'&':'?')+'_='+Date.now(),{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,cache:'no-store'});const d=await r.json();if(!r.ok||d.ok===false)throw Error(d.error||'No disponible');return d;}
 function list(query=''){
  const q=query.toLocaleLowerCase();const project=$('project-select').value;const matches=stores.filter(s=>(project==='store'||project==='yarigai'&&s.id==='yarigai'||project==='canalkiosk'&&s.id==='canalkiosk-jardinets'||project==='starbucks'&&/starbucks|sbux/i.test(s.name+' '+s.id))&&(s.name+' '+s.id+' '+(s.kind||'')).toLocaleLowerCase().includes(q));
  const current=$('store-select').value||binding?.storeId||'canalkiosk-jardinets';
  const selected=stores.find(s=>s.id===current);const rows=matches.slice(0,100);
  $('store-select').replaceChildren(...rows.map(s=>new Option(s.name,s.id)));
  if(rows.some(s=>s.id===current))$('store-select').value=current;
 }
 async function screens(){
  const revision=++storeRequest,id=$('store-select').value;if(!id)return;
  try{
   const d=await api('/api/store?id='+encodeURIComponent(id));if(revision!==storeRequest)return;
   const options=[new Option(id==='yarigai'?'Contenido enviado por Yarigai':d.store.demo?'Selección en directo de CanalKiosk':'Elegir pantalla emisora',''),...d.store.screens.map(s=>new Option(s.name,s.id))];
   $('store-screen').replaceChildren(...options);$('store-custom-screen').value='';
   if(binding?.storeId===id&&binding.screen){if(d.store.screens.some(s=>s.id===binding.screen))$('store-screen').value=binding.screen;else $('store-custom-screen').value=binding.screen;}
  }catch(e){$('store-current').textContent=e.message;}
 }
 function displayBinding(){ $('store-binding-label').textContent=binding?'Taza asociada a '+binding.name+(binding.screen?' · '+binding.screen:' · '+(binding.mode==='producer'?'contenido de Yarigai':binding.mode==='demo'?'demo interactiva':'pantalla pendiente')):'Taza sin asociación'; }
 function screenId(){const raw=$('store-custom-screen').value.trim();if(!raw)return $('store-screen').value;try{const u=new URL(raw);return u.searchParams.get('screen')||u.searchParams.get('screenId')||raw;}catch{return raw;}}
 $('project-select').addEventListener('change',async()=>{$('store-search').value='';$('store-select').value='';list();await screens();$('store-current').textContent='Pulsa Guardar asociación para activar el proyecto';});
 $('store-search').addEventListener('input',()=>list($('store-search').value));
 $('store-select').addEventListener('change',screens);
 $('store-save').addEventListener('click',async()=>{
  $('store-save').disabled=true;
  try{const d=await api('/api/store-binding',{enabled:true,storeId:$('store-select').value,screen:screenId()});binding=d.binding;displayBinding();await poll();}
  catch(e){$('store-current').textContent=e.message;}finally{$('store-save').disabled=false;}
 });
 $('store-release').addEventListener('click',async()=>{try{await api('/api/store-binding',{enabled:false});binding=null;displayBinding();$('store-current').textContent='Seguimiento desactivado';}catch(e){$('store-current').textContent=e.message;}});
 async function poll(){
  if(loading)return;loading=true;
  try{
   const latest=await api('/api/store-binding');binding=latest.binding;displayBinding();
   if(!binding){$('store-current').textContent='Elige una store para seguir lo que suena';return;}
   const d=await api('/api/store-sync',{});
   const bridge=d.delivery?.gifReady?'Envío disponible; LEDs pendientes de comprobar':'Envío a CarlosGdG no disponible · revisar Bubble en el Mini';
   $('store-current').textContent=(d.title?'Suena: '+d.title:d.message||'Esperando contenido')+' · '+bridge;
  }catch(e){$('store-current').textContent=e.message;}finally{loading=false;}
 }
 (async()=>{try{const [catalog,current]=await Promise.all([api('/api/stores'),api('/api/store-binding')]);stores=catalog.stores;binding=current.binding;$('project-select').value=binding?.project||(binding?.storeId==='yarigai'?'yarigai':binding?.storeId==='canalkiosk-jardinets'?'canalkiosk':/starbucks|sbux/i.test(binding?.name+' '+binding?.storeId)?'starbucks':'store');list();await screens();await poll();setInterval(poll,5000);}catch(e){$('store-current').textContent=e.message;}})();
})();
