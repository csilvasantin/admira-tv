import {CLASSES} from './core.mjs';
const API='/videoanalytics/api/history';
const dayFormat=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit'});
const hourFormat=new Intl.DateTimeFormat('es-ES',{timeZone:'Europe/Madrid',hour:'2-digit',minute:'2-digit',hour12:false});
export const dayKey=value=>dayFormat.format(new Date(value));

// This is an in-flight outbox, NOT a local substitute for persistent history.
// Only acknowledged server rows are displayed as saved. No browser storage.
export class HistoryClient{
  constructor({fetchImpl=(...args)=>fetch(...args),now=()=>Date.now(),id=()=>crypto.randomUUID(),onState=()=>{}}={}){
    Object.assign(this,{fetchImpl,now,id,onState});this.pending=[];this.rows=[];this.busy=false;this.saved=0;this.error=null;this.lost=0;this.expired=0;this.loaded=false;this.requested=false;
  }
  add(events,source='detector'){
    for(const event of events){
      if(!Object.hasOwn(CLASSES,event.class)||CLASSES[event.class].manualOnly&&source!=='manual')continue;
      if(this.pending.length>=2000){this.lost++;continue;}
      this.pending.push({id:this.id(),kind:event.class,at:this.now(),source});
    }
    this.onState(this);
  }
  async request(url,options={}){
    const response=await this.fetchImpl(url,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(10000),...options});
    if(!response.ok)throw new Error(response.status===401?'login':response.status===403?'access':response.status===404||response.status===501||response.status===503?'unavailable':'request');
    let data;try{data=await response.json();}catch{throw new Error('unavailable');}
    if(data?.ok!==true)throw new Error('unavailable');return data;
  }
  async sync(){
    if(this.busy){this.requested=true;return;}
    this.busy=true;this.error=null;this.onState(this);
    try{
      const fresh=this.pending.filter(e=>e.at>=this.now()-7*86400000+1000);
      this.expired+=this.pending.length-fresh.length;this.pending=fresh;
      // Read/authenticate before sending. A static preview does not masquerade
      // as a server; unavailable auth/storage is a visible, unsaved state.
      const from=this.now()-31*86400000,to=this.now()+60000;
      let data=await this.request(`${API}?from=${from}&to=${to}`);
      if(!Array.isArray(data.rows))throw new Error('unavailable');
      let sent=false;
      for(let batch=0;this.pending.length&&batch<20;batch++){
        const events=this.pending.slice(0,100);
        const ack=await this.request(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({events})});
        if(!Array.isArray(ack.accepted)||events.some(e=>!ack.accepted.includes(e.id)))throw new Error('unconfirmed');
        const ids=new Set(events.map(e=>e.id));this.pending=this.pending.filter(e=>!ids.has(e.id));this.saved+=events.length;sent=true;
      }
      if(sent)data=await this.request(`${API}?from=${from}&to=${to}`);
      if(!Array.isArray(data.rows)||data.rows.length>8000||data.rows.some(r=>!Number.isSafeInteger(r.hour)||r.hour<0||!Object.hasOwn(CLASSES,r.kind)||!['detector','manual'].includes(r.source)||!Number.isSafeInteger(r.total)||r.total<0))throw new Error('invalid_history');
      this.rows=data.rows;this.loaded=true;
    }catch(error){this.error=error.message;if(['login','access'].includes(this.error)){this.rows=[];this.loaded=false;}}
    finally{
      this.busy=false;this.onState(this);
      const repeat=this.requested&&!this.error;this.requested=false;
      if(repeat)return this.sync();
    }
  }
}
export function installHistoryUI({document,client=new HistoryClient()}){
  const $=id=>document.getElementById(id);
  const option=(value,text)=>{const e=document.createElement('option');e.value=value;e.textContent=text;return e;};
  const renderRows=()=>{
    const date=$('history-day').value||dayKey(Date.now()),selected=$('history-hour').value;
    const rows=client.rows.filter(r=>dayKey(r.hour)===date);
    const hours=[...new Set(rows.map(r=>r.hour))].sort((a,b)=>b-a);
    $('history-hour').replaceChildren(option('all','Todas las horas'),...hours.map(hour=>option(String(hour),`${hourFormat.format(hour)} · ${new Date(hour).toISOString().slice(11,16)} UTC`)));
    $('history-hour').value=hours.includes(Number(selected))?selected:'all';
    $('history-rows').replaceChildren();
    for(const hour of hours.filter(h=>$('history-hour').value==='all'||String(h)===$('history-hour').value)){
      const entries=rows.filter(r=>r.hour===hour),item=document.createElement('li');
      const title=document.createElement('strong');title.textContent=`${hourFormat.format(hour)} · ${entries.reduce((s,r)=>s+r.total,0)} pasos`;
      const text=document.createElement('p');text.className='small';text.textContent=entries.map(r=>`${CLASSES[r.kind].label}: ${r.total}${r.source==='manual'?' (manual)':''}`).join(' · ');
      item.append(title,text);$('history-rows').append(item);
    }
    $('history-empty').hidden=hours.length>0;
    $('history-empty').textContent=client.loaded?'Sin registros guardados para este día.':'El histórico necesita conexión al servidor privado.';
  };
  const render=()=>{
    const selected=$('history-day').value||dayKey(Date.now());
    const days=[...new Set([dayKey(Date.now()),...client.rows.map(r=>dayKey(r.hour))])].sort().reverse();
    $('history-day').replaceChildren(...days.map(day=>option(day,day.split('-').reverse().join('/'))));
    $('history-day').value=days.includes(selected)?selected:days[0];
    const messages={login:'Inicia sesión en Admira.tv para guardar y consultar.',access:'Histórico privado: requiere rol administrador de Admira.tv.',unavailable:'Servidor de histórico no disponible en esta vista.',unconfirmed:'El servidor no confirmó el envío; puedes reintentar.'};
    $('history-status').textContent=(client.busy?'Sincronizando con el servidor…':client.error?(messages[client.error]||'No se pudo sincronizar. Puedes reintentar.'):client.loaded?`Histórico sincronizado · ${client.rows.reduce((sum,r)=>sum+r.total,0)} pasos en los últimos 31 días.`:'Histórico privado pendiente de conexión.')+
      (client.pending.length?` ${client.pending.length} sin confirmar; no recargues antes de sincronizar.`:'')+(client.lost?` ${client.lost} eventos fuera de cola no se han enviado.`:'')+(client.expired?` ${client.expired} eventos antiguos sin confirmación: no se pueden reintentar.`:'');
    $('history-refresh').disabled=client.busy;renderRows();
  };
  client.onState=render;
  $('history-day').addEventListener('change',renderRows);
  $('history-hour').addEventListener('change',renderRows);
  $('history-refresh').addEventListener('click',()=>client.sync());
  $('history-panel').addEventListener('toggle',()=>{if($('history-panel').open)client.sync();});
  render();
  return client;
}
