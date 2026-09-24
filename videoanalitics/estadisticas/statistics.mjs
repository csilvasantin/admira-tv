import {HistoryClient,dayKey,passTime} from '../../videoanalytics/xtore/history.mjs';
import {KINDS,dayRange,confirmedRows,summarize,hourOf} from './model.mjs';
const $=id=>document.getElementById(id),client=new HistoryClient(),number=new Intl.NumberFormat('es-ES');
const clock=new Intl.DateTimeFormat('es-ES',{timeZone:'Europe/Madrid',hour:'2-digit',minute:'2-digit',second:'2-digit'});
const hour=new Intl.DateTimeFormat('es-ES',{timeZone:'Europe/Madrid',hour:'2-digit',minute:'2-digit'});
for(const [id,first,last,selected] of [['start',0,23,0],['end',1,24,24]])for(let n=first;n<=last;n++){
  const option=document.createElement('option');option.value=String(n);option.textContent=String(n).padStart(2,'0')+':00';option.selected=n===selected;$(id).append(option);
}
$('day').value=dayKey(Date.now());$('day').max=dayKey(Date.now());
let revision=0,busy=false,proofKind='',lastCounts={};
const LABELS={person:'Personas',car:'Coches',motorcycle:'Motos',bicycle:'Bicis'};
function clear(){for(const kind of KINDS)$('total-'+kind).textContent='—';$('manual').textContent='Observaciones manuales: —';$('rows').replaceChildren();$('empty').hidden=false;}
async function paintProof(events,total,kind){
  $('proof-rows').replaceChildren();
  const label=LABELS[kind]||kind;
  $('proof-status').textContent=events.length===total?`${label}: ${events.length} pasos, la misma cifra que la tarjeta.`:`${label}: ${events.length} filas y la tarjeta marca ${total}.`;
  for(const event of events){
    const item=document.createElement('li'),time=document.createElement('time');
    time.dateTime=new Date(event.at).toISOString();time.textContent=passTime(event.at);item.append(time);
    if(kind==='person'){
      const note=document.createElement('span');note.textContent='generando gemelo';item.append(note);
      try{
        const status=await fetch(`/videoanalytics/api/twin?id=${encodeURIComponent(event.id)}&status=1`,{credentials:'same-origin',cache:'no-store'});
        const body=status.ok?await status.json():null;
        if(body?.state==='ready'){
          const response=await fetch(`/videoanalytics/api/twin?id=${encodeURIComponent(event.id)}`,{credentials:'same-origin',cache:'no-store'});
          if(response.ok){
            const url=URL.createObjectURL(await response.blob()),img=document.createElement('img');
            img.alt='Gemelo sintético, no la persona real';img.src=url;note.textContent='gemelo';
            img.addEventListener('click',()=>{$('proof-zoom').src=url;$('proof-light').showModal();});
            item.append(img);
          }
        }
      }catch{/* the row keeps the time and the generating state */}
    }
    else{
      try{
        const response=await fetch(`/videoanalytics/api/proof?id=${encodeURIComponent(event.id)}`,{credentials:'same-origin',cache:'no-store'});
        if(!response.ok){const note=document.createElement('span');note.textContent='sin recorte guardado';item.append(note);}
        else{
          const url=URL.createObjectURL(await response.blob()),img=document.createElement('img');
          img.alt=`Recorte de ${label}`;img.src=url;
          img.addEventListener('click',()=>{$('proof-zoom').src=url;$('proof-light').showModal();});
          item.append(img);
        }
      }catch{const note=document.createElement('span');note.textContent='sin recorte guardado';item.append(note);}
    }
    $('proof-rows').append(item);
  }
}
async function showProof(kind){
  proofKind=kind;
  document.querySelectorAll('.totals article').forEach(card=>card.setAttribute('aria-pressed',card.dataset.kind===kind?'true':'false'));
  const range=dayRange($('day').value),start=Number($('start').value),end=Number($('end').value);
  if(!range)return;
  const proof=await client.loadProof({from:range.from,to:range.to,kind,source:'detector'});
  const shown=proof.events.filter(event=>hourOf(event.at)>=start&&hourOf(event.at)<end);
  paintProof(shown,Number.isInteger(lastCounts[kind])?lastCounts[kind]:proof.total,kind);
}
async function refresh(){
  const version=++revision,day=$('day').value,start=Number($('start').value),end=Number($('end').value),range=dayRange(day);
  clear();$('login').hidden=true;$('status').dataset.error='false';
  if(!range||!summarize([],start,end)||day>dayKey(Date.now())){busy=false;$('refresh').disabled=false;$('status').textContent='Elige un día válido y una hora final posterior a la inicial.';$('status').dataset.error='true';return;}
  busy=true;$('refresh').disabled=true;$('status').textContent='Consultando registros guardados…';$('empty').textContent='Consultando…';
  try{
    const data=await client.request(`/videoanalytics/api/history?from=${range.from}&to=${range.to}`);
    if(version!==revision)return;
    const rows=confirmedRows(data,range);if(!rows)throw new Error('invalid_history');
    const result=summarize(rows,start,end);
    $('empty').hidden=result.hasRecords;$('empty').textContent='Sin registros confirmados para esta franja.';
    lastCounts=result.counts;
    if(result.hasRecords){
      for(const kind of KINDS)$('total-'+kind).textContent=number.format(result.counts[kind]);
      $('manual').textContent=`Observaciones manuales: ${number.format(result.manual)} · separadas del detector`;
    }
    for(const row of result.hours){const tr=document.createElement('tr');
      for(const value of [`${hour.format(row.hour)} · ${new Date(row.hour).toISOString().slice(11,16)} UTC`,...KINDS.map(kind=>number.format(row.counts[kind])),number.format(row.manual)]){const td=document.createElement('td');td.textContent=value;tr.append(td);}$('rows').append(tr);
    }
    $('status').textContent=`Registros confirmados en el servidor · consulta ${clock.format(Date.now())} · ${day.split('-').reverse().join('/')}, ${start}:00–${end}:00.`;
    if(proofKind)await showProof(proofKind);
  }catch(error){
    if(version!==revision)return;
    clear();$('status').dataset.error='true';$('login').hidden=error.message!=='login';
    const messages={login:'Inicia sesión para consultar las estadísticas guardadas.',access:'Esta cuenta no tiene acceso de administrador al histórico.',unavailable:'El servidor de estadísticas no está disponible. Puedes reintentar.',invalid_history:'No se pudo validar la respuesta del servidor.'};
    $('status').textContent=messages[error.message]||'No se pudo consultar el servidor. Puedes reintentar.';$('empty').textContent='Sin lectura confirmada. No se muestran ceros como si fueran mediciones.';
  }finally{if(version===revision){busy=false;$('refresh').disabled=false;}}
}
document.querySelectorAll('.totals article').forEach(card=>{
  card.tabIndex=0;card.setAttribute('role','button');
  const open=()=>{proofKind=card.dataset.kind;showProof(card.dataset.kind).catch(error=>{$('proof-status').textContent=error.message==='login'?'Inicia sesión para ver cada paso.':'No se pudo leer la lista de pasos.';});};
  card.addEventListener('click',open);
  card.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();open();}});
});
$('proof-close').addEventListener('click',()=>$('proof-light').close());
$('filters').addEventListener('submit',event=>{event.preventDefault();refresh();});
for(const id of ['day','start','end'])$(id).addEventListener('change',refresh);
window.addEventListener('focus',()=>{if(!busy)refresh();});
window.addEventListener('online',()=>{if(!busy)refresh();});
setInterval(()=>{if(!document.hidden&&!busy)refresh();},30000);
refresh();
