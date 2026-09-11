// In-memory controller tests, never injected into a live capture or player.
import test from 'node:test';
import assert from 'node:assert/strict';
import {installSignageUI} from './signage-ui.mjs';

function fixture(t){
  t.mock.timers.enable({apis:['setTimeout']});
  const nodes=new Map();
  const element=()=>({textContent:'',hidden:false,listeners:{},children:[],
    setAttribute(k,v){this[k]=v;},addEventListener(k,fn){this.listeners[k]=fn;},
    append(child){this.children.push(child);child.remove=()=>{child.removed=true;this.children=this.children.filter(c=>c!==child);};}});
  const get=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
  const document={hidden:false,getElementById:get,createElement(){const e=element();e.sent=[];e.contentWindow={postMessage:data=>e.sent.push(data)};return e;}};
  const window={...element(),location:{origin:'http://127.0.0.1:56594'}};
  const ui=installSignageUI({document,window});ui.setEligible(true);t.after(()=>ui.stop());
  const frame=()=>get('signage').children[0];
  const emit=(data,f=frame())=>window.listeners.message({source:f.contentWindow,origin:'null',data:{source:'admira-tv-canal',...data}});
  const ack=(f=frame())=>emit({requestId:f.sent.at(-1).requestId,ok:true},f);
  const media=(phase,f=frame())=>emit({event:'media-state',id:'test-only',mode:'conditional',phase,loop:true},f);
  return {ui,get,frame,ack,media,emit};
}

for(const [phase,label] of [['playing','reproduciendo'],['poster-loaded','miniatura de respaldo'],['document-loaded','interactivo cargado']]){
  test(`ACK before/after ${phase} cannot replace playback evidence or its limits`,t=>{
    const f=fixture(t),frame=f.frame();
    f.media(phase);const detail=f.get('signage-media').textContent;
    assert.equal(f.get('signage-status').textContent,`Bucle general · ${label}`);
    f.ack();
    assert.equal(f.get('signage-status').textContent,`Bucle general · ${label}`);
    f.ui.neutral();f.ack();
    assert.equal(f.get('signage-status').textContent,`Bucle general · ${label}`);
    assert.equal(f.get('signage-media').textContent,detail);
    assert.match(f.get('signage-command').textContent,/Bucle general · orden aceptada/);
    assert.equal(f.frame(),frame);
    f.media('selected');f.ui.neutral();f.ack();
    assert.equal(f.get('signage-status').textContent,'Cargando contenido · emisión pendiente');
    f.media(phase);assert.equal(f.get('signage-status').textContent,`Bucle general · ${label}`);
  });
}
test('ACK alone or selection never confirms playback or cancels the startup deadline',t=>{
  const f=fixture(t),frame=f.frame();f.ack();
  assert.equal(f.get('signage-status').textContent,'Canal conectado · esperando emisión');
  f.media('selected');f.ui.neutral();f.ack();
  assert.equal(f.get('signage-status').textContent,'Cargando contenido · emisión pendiente');
  t.mock.timers.tick(30001);assert.equal(frame.removed,true);
  assert.match(f.get('signage-status').textContent,/Sin emisión confirmada/);
  assert.equal(f.get('signage-command').textContent,'Canal de órdenes cerrado');
});
test('restart clears both channels; late media, ACK and loads from A cannot change B',t=>{
  const f=fixture(t),a=f.frame();f.ack();f.media('playing');a.listeners.load();
  f.ui.setEligible(false);f.ui.setEligible(true);const b=f.frame();
  assert.notEqual(a,b);f.ack();const pending=f.get('signage-status').textContent;
  assert.equal(pending,'Canal conectado · esperando emisión');
  f.media('playing',a);f.emit({requestId:a.sent.at(-1).requestId,ok:false},a);a.listeners.load();
  assert.equal(f.get('signage-status').textContent,pending);assert.equal(f.frame(),b);
  assert.equal(f.get('signage-media').textContent,'Sin confirmación de emisión');
  t.mock.timers.tick(30001);assert.equal(b.removed,true);
  assert.match(f.get('signage-status').textContent,/Sin emisión confirmada/);
});
