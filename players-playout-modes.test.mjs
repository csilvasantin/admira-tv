import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const players=fs.readFileSync(new URL('./players.html',import.meta.url),'utf8');
const canal=fs.readFileSync(new URL('./canal.html',import.meta.url),'utf8');

test('Players ofrece exactamente los tres modos y Autónomo es el predeterminado',()=>{
  assert.match(players,/data-mode="autonomous"/);
  assert.match(players,/data-mode="synchronized"/);
  assert.match(players,/data-mode="extended"/);
  assert.match(players,/class="mode active" data-mode="autonomous"/);
  assert.match(players,/por defecto/);
});

test('Sincro exige selección explícita y los no elegidos siguen autónomos',()=>{
  assert.match(players,/state\.mode!==['"]autonomous['"]&&state\.selected\.length<2/);
  assert.match(players,/screens:state\.selected/);
  assert.match(canal,/mode==='synchronized'/);
  assert.match(canal,/else if\(syncOn\|\|playoutMode!=='local'/);
});

test('la sección Players hereda ACL del player y firma las escrituras',()=>{
  const gate=fs.readFileSync(new URL('./auth-gate.js',import.meta.url),'utf8');
  assert.match(gate,/"players":"digitalsignage-player"/);
  assert.match(players,/PLAYOUT='\/api\/playout'/);
  assert.match(players,/finally\{validate\(true\);\}/);
});

test('Extendido exige un contenido y representa el mural por teselas ordenadas',()=>{
  assert.match(players,/state\.mode==='extended'&&!state\.item/);
  assert.match(players,/background-size:'\+\(l\.cols\*100\)/);
  assert.match(canal,/#stage\.extended-tile>video,#stage\.extended-tile>img/);
  assert.match(canal,/--wall-col/);
  assert.match(canal,/tesela ['"]\+\(d\.tile\.index\+1\)/);
});

test('el player consulta asignación por pantalla antes del modo histórico',()=>{
  assert.match(canal,/PLAYOUT_ASSIGNMENT_API='\/api\/playout'/);
  assert.match(canal,/applyPlayoutAssignment\(plan\)/);
  assert.match(canal,/if\(applyPlayoutAssignment\(plan\)\) return/);
});

test('el vídeo extendido se alinea con reloj servidor y publica su tesela',()=>{
  assert.match(canal,/_extendedClockOffset=Number\(d\.serverNow\|\|Date\.now\(\)\)-Date\.now\(\)/);
  assert.match(canal,/\(\(Date\.now\(\)\+_extendedClockOffset\)\/1000\)%v\.duration/);
  assert.match(canal,/if\(drift>\.7\)/);
  assert.match(canal,/sinc\.tile=_extendedAssignment\.tile/);
});

test('los scripts inline conservan sintaxis JavaScript válida',()=>{
  for(const [name,source] of [['players',players],['canal',canal]]){
    const scripts=[...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(Boolean);
    scripts.forEach((code,index)=>assert.doesNotThrow(()=>new vm.Script(code,{filename:name+'-'+index+'.js'})));
  }
});
