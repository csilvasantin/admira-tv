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
test('slow media warns without destroying the connected player; late media recovers',t=>{
  const f=fixture(t),frame=f.frame();f.ack();
  assert.equal(f.get('signage-status').textContent,'Canal conectado · esperando emisión');
  f.media('selected');f.ui.neutral();f.ack();
  assert.equal(f.get('signage-status').textContent,'Cargando contenido · emisión pendiente');
  t.mock.timers.tick(30001);assert.notEqual(frame.removed,true);
  assert.match(f.get('signage-status').textContent,/Carga demorada/);
  assert.match(f.get('signage-command').textContent,/orden aceptada/);
  f.media('playing');assert.equal(f.get('signage-status').textContent,'Bucle general · reproduciendo');
  assert.equal(f.frame(),frame);
});
test('restart clears both channels; late media, ACK and loads from A cannot change B',t=>{
  const f=fixture(t),a=f.frame();f.ack();f.media('playing');a.listeners.load();
  f.ui.setEligible(false);f.ui.setEligible(true);const b=f.frame();
  assert.notEqual(a,b);f.ack();const pending=f.get('signage-status').textContent;
  assert.equal(pending,'Canal conectado · esperando emisión');
  f.media('playing',a);f.emit({requestId:a.sent.at(-1).requestId,ok:false},a);a.listeners.load();
  assert.equal(f.get('signage-status').textContent,pending);assert.equal(f.frame(),b);
  assert.equal(f.get('signage-media').textContent,'Sin confirmación de emisión');
  t.mock.timers.tick(30001);assert.notEqual(b.removed,true);
  assert.match(f.get('signage-status').textContent,/Carga demorada/);
  b.listeners.load();b.listeners.load();assert.equal(b.removed,true);
  assert.match(f.get('signage-status').textContent,/intentó navegar/);
});
test('music starts without an analyzer and only active analysis may condition it',t=>{
  const f=fixture(t),frame=f.frame();f.ack();
  const first=frame.sent.length;
  f.ui.passage([{class:'car'}]);assert.equal(frame.sent.length,first);
  f.ui.setAnalysis(true);assert.equal(frame.sent.length,first);
  f.ui.passage([{class:'car'}]);assert.equal(frame.sent.at(-1).command,'admiratv audiencia coche');f.ack();
  f.ui.setAnalysis(false);assert.equal(frame.sent.at(-1).command,'admiratv audiencia u');f.ack();
  const paused=frame.sent.length;
  f.ui.setAnalysis(false);f.ui.passage([{class:'car'}]);t.mock.timers.tick(6001);
  assert.equal(frame.sent.length,paused);assert.equal(f.frame(),frame);
  assert.match(f.get('signage-mode').textContent,/analizador inactivo/);
});
test('explicit manual music tests require ACK and paused analysis, and expire back to the playlist',t=>{
  const f=fixture(t),frame=f.frame(),initial=frame.sent.length;
  assert.equal(f.get('test-person').disabled,true);f.get('test-person').listeners.click();assert.equal(frame.sent.length,initial);
  f.ack();assert.equal(f.get('test-person').disabled,false);
  for(const [kind,command] of [['person','persona'],['car','coche'],['motorcycle','moto'],['bicycle','bici']]){
    f.get(`test-${kind}`).listeners.click();assert.equal(frame.sent.at(-1).command,`admiratv audiencia ${command}`);f.ack();
    assert.match(f.get('signage-test-status').textContent,/Última prueba manual/);
    assert.match(f.get('signage-test-status').textContent,/Sin detección, captura ni incremento de contadores/);
  }
  t.mock.timers.tick(6001);assert.equal(frame.sent.at(-1).command,'admiratv audiencia u');f.ack();
  f.get('test-person').listeners.click();f.ack();f.get('test-none').listeners.click();assert.equal(frame.sent.at(-1).command,'admiratv audiencia u');f.ack();
  f.ui.setAnalysis(true);const active=frame.sent.length;assert.equal(f.get('test-person').disabled,true);
  f.get('test-person').listeners.click();assert.equal(frame.sent.length,active);
  f.ui.setAnalysis(false);f.ack();f.ui.stop();assert.equal(f.get('test-person').disabled,true);
});
test('missing playlist and autoplay rejection are not called playback or stalled downloads',t=>{
  const f=fixture(t);f.ack();
  for(const [phase,label] of [['playlist-empty',/Sin contenidos reproducibles con #musica/],['audio-blocked',/Sonido pendiente/]]){
    f.emit({event:'media-state',id:'playlist-default',mode:'conditional',phase,music:true,loop:true});
    t.mock.timers.tick(30001);f.ui.neutral();f.ack();assert.match(f.get('signage-status').textContent,label);
  }
  f.emit({event:'media-state',id:'music-test-only',mode:'conditional',phase:'playing',music:true,loop:true,mediaType:'audio',muted:false,volume:1});
  assert.equal(f.get('signage-status').textContent,'Playlist musical asociada · reproduciendo');
  assert.match(f.get('signage-media').textContent,/no confirma el volumen/);
  f.emit({event:'media-state',id:'music-test-only',mode:'conditional',phase:'playing',music:true,loop:true,mediaType:'audio',muted:true,volume:1});
  assert.match(f.get('signage-media').textContent,/en silencio/);
});
test('manual tests cannot cross into requested analysis or its temporary recovery',t=>{
  const f=fixture(t),frame=f.frame();f.ack();f.get('test-person').listeners.click();f.ack();
  f.ui.setAnalysis(false,false);assert.equal(frame.sent.at(-1).command,'admiratv audiencia u');f.ack();
  assert.equal(f.get('test-person').disabled,true);const waiting=frame.sent.length;
  f.get('test-person').listeners.click();assert.equal(frame.sent.length,waiting);
  f.ui.setAnalysis(true,false);assert.equal(frame.sent.length,waiting);
  f.ui.setAnalysis(false,false);f.ack();const recovering=frame.sent.length;
  f.get('test-person').listeners.click();assert.equal(frame.sent.length,recovering);
  f.ui.setAnalysis(false,true);assert.equal(f.get('test-person').disabled,false);
});
test('sidebar mute leaves the same player and audience active, follows internal sound controls and survives restart',t=>{
  const f=fixture(t),frame=f.frame();
  assert.equal(f.get('mute-signage').disabled,true);f.ack();f.ui.setAnalysis(true);
  assert.equal(f.get('mute-signage').disabled,false);
  f.get('mute-signage').listeners.click();const audioRequest=frame.sent.at(-1).requestId;
  assert.equal(frame.sent.at(-1).command,'audiooff');assert.equal(f.get('mute-signage').disabled,true);
  f.ui.passage([{class:'car'}]);assert.equal(frame.sent.at(-1).command,'admiratv audiencia coche');f.ack();
  f.emit({requestId:audioRequest,ok:true,audio:{muted:true,volume:1}});
  assert.equal(f.frame(),frame);assert.equal(f.get('mute-signage')['aria-pressed'],'true');
  assert.match(f.get('mute-signage').textContent,/Activar sonido/);
  f.emit({event:'media-state',id:'new-piece',mode:'conditional',phase:'playing',muted:true,volume:1});
  assert.equal(f.get('mute-signage')['aria-pressed'],'true');
  f.ui.setEligible(false);f.ui.setEligible(true);
  assert.equal(new URL(f.frame().src).searchParams.get('muted'),'1');f.ack();
  f.emit({event:'audio-state',muted:false,volume:0.6});
  assert.match(f.get('mute-signage').textContent,/Silenciar player/);assert.equal(f.get('mute-signage')['aria-pressed'],'false');
  f.emit({event:'audio-state',muted:true,volume:1},frame);assert.equal(f.get('mute-signage')['aria-pressed'],'false');
});
test('unconfirmed sound command shows a retry without stopping or falsely muting the player',t=>{
  const f=fixture(t),frame=f.frame();f.ack();f.get('mute-signage').listeners.click();
  t.mock.timers.tick(2501);assert.equal(f.frame(),frame);assert.equal(f.get('mute-signage').disabled,false);
  assert.equal(f.get('mute-signage')['aria-pressed'],'false');assert.match(f.get('signage-audio').textContent,/Sin confirmación/);
});
