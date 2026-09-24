import {HistoryClient,dayKey} from '../../videoanalytics/xtore/history.mjs';
import {KINDS,dayRange,confirmedRows,summarize} from './model.mjs';
const $=id=>document.getElementById(id),client=new HistoryClient(),number=new Intl.NumberFormat('es-ES');
const clock=new Intl.DateTimeFormat('es-ES',{timeZone:'Europe/Madrid',hour:'2-digit',minute:'2-digit',second:'2-digit'});
const hour=new Intl.DateTimeFormat('es-ES',{timeZone:'Europe/Madrid',hour:'2-digit',minute:'2-digit'});
for(const [id,first,last,selected] of [['start',0,23,0],['end',1,24,24]])for(let n=first;n<=last;n++){
  const option=document.createElement('option');option.value=String(n);option.textContent=String(n).padStart(2,'0')+':00';option.selected=n===selected;$(id).append(option);
}
$('day').value=dayKey(Date.now());$('day').max=dayKey(Date.now());
let revision=0,busy=false;
function clear(){for(const kind of KINDS)$('total-'+kind).textContent='—';$('manual').textContent='Observaciones manuales: —';$('rows').replaceChildren();$('empty').hidden=false;}
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
    if(result.hasRecords){
      for(const kind of KINDS)$('total-'+kind).textContent=number.format(result.counts[kind]);
      $('manual').textContent=`Observaciones manuales: ${number.format(result.manual)} · separadas del detector`;
    }
    for(const row of result.hours){const tr=document.createElement('tr');
      for(const value of [`${hour.format(row.hour)} · ${new Date(row.hour).toISOString().slice(11,16)} UTC`,...KINDS.map(kind=>number.format(row.counts[kind])),number.format(row.manual)]){const td=document.createElement('td');td.textContent=value;tr.append(td);}$('rows').append(tr);
    }
    $('status').textContent=`Registros confirmados en el servidor · consulta ${clock.format(Date.now())} · ${day.split('-').reverse().join('/')}, ${start}:00–${end}:00.`;
  }catch(error){
    if(version!==revision)return;
    clear();$('status').dataset.error='true';$('login').hidden=error.message!=='login';
    const messages={login:'Inicia sesión para consultar las estadísticas guardadas.',access:'Esta cuenta no tiene acceso de administrador al histórico.',unavailable:'El servidor de estadísticas no está disponible. Puedes reintentar.',invalid_history:'No se pudo validar la respuesta del servidor.'};
    $('status').textContent=messages[error.message]||'No se pudo consultar el servidor. Puedes reintentar.';$('empty').textContent='Sin lectura confirmada. No se muestran ceros como si fueran mediciones.';
  }finally{if(version===revision){busy=false;$('refresh').disabled=false;}}
}
$('filters').addEventListener('submit',event=>{event.preventDefault();refresh();});
for(const id of ['day','start','end'])$(id).addEventListener('change',refresh);
window.addEventListener('focus',()=>{if(!busy)refresh();});
window.addEventListener('online',()=>{if(!busy)refresh();});
setInterval(()=>{if(!document.hidden&&!busy)refresh();},30000);
refresh();
