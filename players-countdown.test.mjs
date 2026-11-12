import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const players=readFileSync(new URL('./players.html',import.meta.url),'utf8');
const canal=readFileSync(new URL('./canal.html',import.meta.url),'utf8');
test('Custom con selector de combinación (Dual H·V la primera)',()=>{
  assert.match(players,/<h2>Custom<\/h2>/);
  assert.match(players,/id="customCombo"[\s\S]*?<option value="dual">Dual H·V/);
  assert.match(players,/data-mm="dual">Custom</);
  assert.match(players,/mode:comboMode\(\)/);
});
test('cuenta atrás por pantalla con acuse playout-sync',()=>{
  assert.match(players,/cmd:'playout-sync'/);
  assert.match(players,/'⏳ '/);
  assert.match(players,/aplicado en /);
  assert.match(players,/confirmApplied\(MM\.concat\(before\)/);
  assert.match(players,/confirmApplied\(state\.selected\.concat\(before\)/);
});
test('el player relee la asignación al recibir playout-sync',()=>{
  assert.match(canal,/if\(cmd==='playout-sync'\)\{ try\{ await pollMode\(\); \}/);
});
test('una orden posterior del panel retira el tag en vivo',()=>{
  assert.match(canal,/Number\(plan\.revision\)>_liveTagAt/);
  assert.match(canal,/save\(LIVE_TAG_KEY\+':at',String\(_liveTagAt\)\)/);
  assert.doesNotMatch(canal,/AUDIENCE_REMOTE\|\|_liveTag\|\|_liveMode/);
});
