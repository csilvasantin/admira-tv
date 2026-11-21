export const PHASES = {recibido:'RECIBIDO',preparando:'PREPARANDO',listo:'LISTO'};
export function changes(snapshot,seen){
 const out=[];
 for(const [phase,label] of Object.entries(PHASES))for(const p of snapshot[phase]||[]){
  const id=p.id||p.numero;if(!id)continue;
  if(seen.get(id)!==phase){seen.set(id,phase);out.push({...p,phase,label});}
 }
 return out;
}
