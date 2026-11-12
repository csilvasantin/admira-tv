import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assignmentFor, cleanPower, cleanVariants } from './functions/api/playout.js';

const players=fs.readFileSync(new URL('./players.html',import.meta.url),'utf8');
const canal=fs.readFileSync(new URL('./canal.html',import.meta.url),'utf8');
const H={id:'h1',url:'https://api.admira.store/stock/asset/h1',type:'video',title:'H'};
const V={id:'v1',url:'https://api.admira.store/stock/asset/v1',type:'video',title:'V'};

test('dual entrega las dos versiones a cada pantalla como tesela completa y reloj común',()=>{
  const state={configured:true,mode:'dual',screens:['macmini-1','macmini-2','macmini-3'],variants:cleanVariants({landscape:H,portrait:V}),power:{'macmini-1':'on'},revision:7};
  const a=assignmentFor(state,'macmini-1');
  assert.equal(a.mode,'extended'); assert.equal(a.dual,true);
  assert.equal(a.variants.landscape.id,'h1'); assert.equal(a.variants.portrait.id,'v1');
  assert.deepEqual([a.tile.rows,a.tile.cols,a.tile.w,a.tile.h],[1,1,1,1]);
  assert.equal(a.power,'on');
  assert.equal(assignmentFor(state,'admiranext02-a').mode,'autonomous');
});

test('variantes y encendido se limpian',()=>{
  assert.equal(cleanVariants({landscape:{id:'x',url:'http://x',type:'video'}}),null);
  assert.equal(cleanVariants({portrait:V}).landscape,null);
  assert.deepEqual(cleanPower({'MacMini-1':'off','macmini-2':'x',bad$:'on'}),{'macmini-1':'off'});
});

test('canal escoge la versión por orientación (orient= o ventana) y cae al marco editorial',()=>{
  assert.match(canal,/function dualAssignment\(d\)/);
  assert.match(canal,/qs\.get\('orient'\)/);
  assert.match(canal,/fit:own\?'fill':'editorial'/);
  assert.match(canal,/function _extendedFills\(\)/);
  assert.match(canal,/d\.power==='off'&&!_standby\) standbyOn\(true\)/);
});

test('players ofrece Dual H·V y los atajos del Mac Mini',()=>{
  assert.match(players,/data-mode="dual"/);
  for(const k of ['sencillo','secuencia','extendido','dual']) assert.match(players,new RegExp('data-mm="'+k+'"'));
  assert.match(players,/function dualFamilies\(items\)/);
  assert.match(players,/\{\[R\[0\]\]:'off',\[R\[1\]\]:'on',\[R\[2\]\]:'off'\}/);
});
