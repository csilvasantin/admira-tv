import {PRESENCE_GRACE} from './core.mjs';

export const SCOOTER_TRACK_MEMORY=8000;
const ELIGIBLE=new Set(['person','bicycle','motorcycle']);
const LABEL={person:'Persona',bicycle:'Bici',motorcycle:'Moto'};

// A human confirmation changes the representation of an existing trajectory.
// It never supplies a detector prediction, image, position, or inferred movement.
export class ScooterTrackMarks{
  constructor({onConfirm=()=>{},now=()=>performance.now()}={}){
    Object.assign(this,{onConfirm,now});this.marks=new Map();this.candidates=new Map();
    // Keep the once-per-ID ledger through clear/suspend/counter resets. Tracking
    // IDs are monotonic within the source session; removing a mark is not undo.
    this.counted=new Set();
  }
  fresh(o,at=this.now()){
    return !!o&&ELIGIBLE.has(o.class)&&o.confirmed===true&&
      Number.isSafeInteger(o.trackId)&&o.trackId>0&&
      Array.isArray(o.bbox)&&o.bbox.length===4&&o.bbox.every(Number.isFinite)&&
      o.bbox[2]>0&&o.bbox[3]>0&&o.bbox[0]<1&&o.bbox[1]<1&&o.bbox[0]+o.bbox[2]>0&&o.bbox[1]+o.bbox[3]>0&&
      Number.isFinite(o.observedAt)&&o.observedAt>=0&&o.observedAt<=at&&
      Number.isFinite(o.ageMs)&&o.ageMs>=0&&Math.max(o.ageMs,at-o.observedAt)<PRESENCE_GRACE;
  }
  prune(at=this.now()){
    for(const [id,lastObserved] of this.marks)if(at-lastObserved>=SCOOTER_TRACK_MEMORY)this.marks.delete(id);
    for(const [id,o] of this.candidates)if(!this.fresh(o,at))this.candidates.delete(id);
  }
  update(observations){
    const at=this.now();this.prune(at);const next=new Map();
    for(const o of Array.isArray(observations)?observations:[]){
      if(!this.fresh(o,at))continue;
      const previous=next.get(o.trackId)||this.candidates.get(o.trackId);
      if(previous&&previous.observedAt>o.observedAt)continue;
      next.set(o.trackId,{...o,bbox:[...o.bbox]});
      if(this.marks.has(o.trackId))this.marks.set(o.trackId,Math.max(this.marks.get(o.trackId),o.observedAt));
    }
    this.candidates=next;
  }
  confirm(id){
    this.prune();const o=this.candidates.get(id);
    if(!o||this.marks.has(id))return false;
    this.marks.set(id,o.observedAt);
    if(!this.counted.has(id)){
      this.counted.add(id);
      this.onConfirm([{class:'scooter',trackId:id,manual:true}]);
    }
    return true;
  }
  annotate(observations){
    this.prune();
    return (Array.isArray(observations)?observations:[]).map(o=>
      this.marks.has(o?.trackId)&&this.fresh(o)?{...o,bbox:[...o.bbox],class:'scooter',manual:true}:o);
  }
  clear(){this.marks.clear();this.candidates.clear();}
}

export function installScooterTracks({document,onConfirm,now=()=>performance.now(),setTimer=setTimeout,clearTimer=clearTimeout}){
  const $=id=>document.getElementById(id),select=$('scooter-track'),confirm=$('confirm-scooter-track'),remove=$('clear-scooter-tracks'),status=$('scooter-tracks-status');
  const model=new ScooterTrackMarks({onConfirm,now});let timer=null,signature='',notice='';
  function render(){
    clearTimer(timer);timer=null;model.prune();
    const rows=[...model.candidates.values()].sort((a,b)=>a.trackId-b.trackId);
    const next=rows.map(o=>`${o.trackId}:${o.class}:${model.marks.has(o.trackId)}`).join('|');
    if(next!==signature||!select.children.length){
      const selected=select.value,placeholder=document.createElement('option');
      placeholder.value='';placeholder.textContent=rows.length?'Selecciona una trayectoria visible':'Sin trayectorias confirmadas recientes';
      const options=rows.map(o=>{const option=document.createElement('option');option.value=String(o.trackId);option.textContent=`${LABEL[o.class]} #${o.trackId}${model.marks.has(o.trackId)?' · patinete confirmado':''}`;return option;});
      select.replaceChildren(placeholder,...options);
      select.value=rows.some(o=>String(o.trackId)===selected)?selected:'';signature=next;
    }
    select.disabled=!rows.length;confirm.disabled=!model.candidates.has(Number(select.value))||model.marks.has(Number(select.value));
    remove.disabled=!model.marks.size;
    status.textContent=notice||`${model.marks.size} marcas manuales activas. Solo se ofrecen trayectorias reales y recientes.`;
    const at=now(),deadlines=[...rows.map(o=>o.observedAt+PRESENCE_GRACE),...[...model.marks.values()].map(stamp=>stamp+SCOOTER_TRACK_MEMORY)];
    if(deadlines.length)timer=setTimer(render,Math.max(1,Math.min(...deadlines)-at));
  }
  select.addEventListener('change',render);
  confirm.addEventListener('click',()=>{
    const id=Number(select.value),alreadyCounted=model.counted.has(id);
    notice=model.confirm(id)?`Patinete confirmado en #${id}. ${alreadyCounted?'Su paso ya estaba registrado.':'Un paso manual registrado.'} Los conteos originales se conservan.`:'La trayectoria ya no está disponible o ya está marcada.';
    render();
  });
  function clear(){model.clear();notice='Marcas retiradas. Contadores e histórico se conservan.';render();}
  remove.addEventListener('click',clear);
  render();
  return {update(observations){model.update(observations);notice='';render();},annotate:observations=>model.annotate(observations),clear};
}
