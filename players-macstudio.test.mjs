import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('./players.html',import.meta.url),'utf8');
const sh=readFileSync(new URL('./tools/macstudio-player.command',import.meta.url),'utf8');
const pick=n=>html.match(new RegExp('function '+n+'\\([\\s\\S]*?\\n'))[0];
test('bloque Mac Studio · 3 pantallas con los mismos atajos',()=>{
  assert.match(html,/id="macstudio"[\s\S]*?Mac Studio · 3 pantallas[\s\S]*?data-ms="dual">Custom/);
  assert.match(html,/macMini\(b\.dataset\.ms,MS,'msStatus','Mac Studio'\)/);
});
test('Custom en el Mac Studio se SUMA al dual activo del Mac Mini (mismo grupo global)',()=>{
  const v={landscape:{id:'h'},portrait:{id:'v'}};
  const ctx=vm.createContext({MM:['macmini-1','macmini-2','macmini-3'],state:{saved:{mode:'dual',screens:['macmini-1','macmini-2','macmini-3'],variants:v,power:{'macmini-1':'on'}}},currentFamily:()=>null,slim:x=>x,comboMode:()=>'dual'});
  vm.runInContext(html.slice(html.indexOf('function macMiniBody('),html.indexOf('\nasync function macMini(')),ctx);
  const b=ctx.macMiniBody('dual',['macstudio-1','macstudio-2','macstudio-3']);
  assert.equal(b.mode,'dual'); assert.deepEqual([...b.screens],['macmini-1','macmini-2','macmini-3','macstudio-1','macstudio-2','macstudio-3']);
  assert.equal(b.variants,v); assert.equal(b.power['macstudio-2'],'on'); assert.equal(b.power['macmini-1'],'on');
  const s=ctx.macMiniBody('sencillo',['macstudio-1','macstudio-2','macstudio-3']);
  ctx.state.saved.screens=['macmini-1','macmini-2','macmini-3','macstudio-1','macstudio-2','macstudio-3'];
  const s2=ctx.macMiniBody('sencillo',['macstudio-1','macstudio-2','macstudio-3']);
  assert.deepEqual([...s2.screens],['macmini-1','macmini-2','macmini-3']); assert.equal(s2.power['macstudio-1'],'off');
});
test('lanzador del Mac Studio: ids, perfiles y pids propios, Chrome y orientación comprobada',()=>{
  assert.doesNotMatch(sh,/macmini-[123]/);
  assert.match(sh,/PIDS="\$HOME\/\.admira-player\/pids-macstudio"/);
  assert.match(sh,/ADMIRA_PLAYER_BROWSER:-chrome/);
  assert.match(sh,/orientación V·H·V comprobada/);
});
