import {changes} from './queue-phases.mjs';
const store=(new URLSearchParams(location.search).get('store')||'starbucks-paseo-de-gracia').replace(/[^a-z0-9-]/g,'');
const mug='https://playertaza.csilvasantin.workers.dev',relay='https://mcp-ainimation.admira.store';
const el=document.getElementById('aviso');let revision=null,seen=new Map(),pending=[],busy=false,polling=false;
window.__tazaAvisos=[];
async function show(){
 if(busy||!pending.length)return;busy=true;const p=pending.shift(),rev=revision;
 try{
  const current=await (await fetch(mug+'/api/store-binding',{cache:'no-store'})).json();
  if(current.binding?.revision!==rev||current.binding?.project!=='starbucks-queue')return;
  const name=p.nombre||('PEDIDO '+p.numero);el.replaceChildren();
  const title=document.createElement('strong');title.textContent=name;
  const state=document.createElement('div');state.textContent=p.label;
  el.append(title,state);el.classList.add('on');
  const r=await fetch(mug+'/api/mug-status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project:'starbucks-queue',via:'queue-follow',source:'gestorColas',name,verb:p.label})});
  const d=await r.json();el.dataset.delivery=d.ok&&d.bubble?.queued?'queued':'not-sent';
  if(!d.ok&&d.retry_ms){pending.unshift(p);}else if(!d.ok)throw Error(d.error||'No enviado');
  window.__tazaAvisos.push({numero:p.numero,nombre:name,phase:p.phase,at:Date.now(),queued:!!d.bubble?.queued});
 }catch(e){el.dataset.delivery='error';seen.delete(p.id||p.numero);}
 finally{setTimeout(()=>{busy=false;show();},3500);}
}
async function tick(){if(polling)return;polling=true;try{
 const d=await (await fetch(mug+'/api/store-binding',{cache:'no-store'})).json();
 if(d.binding?.project!=='starbucks-queue'){revision=null;seen.clear();pending=[];el.classList.remove('on');return;}
 if(revision!==d.binding.revision){revision=d.binding.revision;seen.clear();pending=[];}
 const r=await fetch(relay+'/cola/estado?store='+encodeURIComponent(store),{cache:'no-store'});if(!r.ok)throw Error('Cola no disponible');
 const snapshot=await r.json();
 for(const p of changes(snapshot,seen)){pending=pending.filter(x=>(x.id||x.numero)!==(p.id||p.numero));pending.push(p);}
 show();
 }catch(e){el.dataset.delivery='error';}finally{polling=false;}}
tick();setInterval(tick,2000);
