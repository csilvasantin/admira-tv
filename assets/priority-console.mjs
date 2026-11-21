const $=id=>document.getElementById(id);
const screen=$('screen'),level=$('level'),end=$('end'),send=$('send');
let current=null,pending=null,serial=0,writing=false;
async function json(url,options){
  const r=await fetch(url,{cache:'no-store',credentials:'same-origin',...options});
  const data=await r.json();if(!r.ok||!data.ok)throw Error(data.error||'Servicio no disponible.');
  return data;
}
function controls(){
  send.disabled=!screen.value||writing;end.disabled=writing||!current?.emergency;
  send.textContent=['Activar emergencia en ','Emitir primero en ','Añadir al final en '][level.value]+(screen.selectedOptions[0]?.textContent||'la pantalla');
}
async function refresh(){
  const turn=++serial;
  try {
    const state=screen.value?await json('/api/playlist?effective=1&screen='+encodeURIComponent(screen.value)):null;
    if(turn!==serial)return;
    current=state?.priority;
    $('incident').textContent=current?.emergency?'Emergencia activa · '+current.emergency.title:state?'Programación ordinaria':'';
    end.hidden=!current?.emergency;
    const items=state?.draft?.items||[];
    $('queue').replaceChildren(...items.map(item=>{const li=document.createElement('li');li.textContent=(item.priority??2)+' · '+item.title;return li;}));
  }catch{if(turn!==serial)return;current=null;end.hidden=true;$('incident').textContent='No se pudo consultar la emisión.';}
  controls();
}
async function command(values){
  if(writing||!screen.value)return;
  const spec={screens:[screen.value],...values},key=JSON.stringify(spec);
  if(pending?.key!==key)pending={key,event:crypto.randomUUID()};
  writing=true;screen.disabled=true;controls();
  try{
    await json('/api/stock-playlists',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...spec,event:pending.event})});
    pending=null;level.value='2';$('status').textContent=values.action?'Emergencia finalizada.':'Orden registrada.';
  }catch(e){$('status').textContent='Orden sin confirmar · '+e.message;}
  finally{writing=false;screen.disabled=false;await refresh();}
}
screen.onchange=()=>{current=null;pending=null;$('queue').replaceChildren();end.hidden=true;refresh();};
level.onchange=controls;
document.querySelector('form').onsubmit=e=>{e.preventDefault();command({priority:Number(level.value),stockIds:[$('stock').value.trim()]});};
end.onclick=()=>{if(current?.emergency)command({action:'end-emergency',expected:current.emergency.event});};
try {
  const data=await json('/api/stock-playlists');
  const seen=new Set();
  for(const row of data.rows)if(!seen.has(row.screen)){seen.add(row.screen);screen.add(new Option((row.deviceName||row.screen)+' · '+row.screen,row.screen));}
  const initial=new URLSearchParams(location.search).get('screen');if(seen.has(initial))screen.value=initial;
  await refresh();
}catch{$('status').textContent='Inicia sesión con acceso al player para consultar sus pantallas.';}
setInterval(()=>{if(screen.value&&!document.hidden&&!writing)refresh();},10000);
