import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const canal = await readFile(new URL('./canal.html', import.meta.url), 'utf8');

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `falta ${name}`);
  const brace = source.indexOf('{', start);
  let depth = 0, quote = '', escaped = false;
  for (let i = brace; i < source.length; i += 1) {
    const c = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === quote) quote = '';
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{') depth += 1;
    else if (c === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`${name} incompleta`);
}

test('la sincro recorre la duración completa de cada cápsula', () => {
  const context = vm.createContext({
    playlist: [
      { id:'a', type:'video', _dur:60.2 },
      { id:'b', type:'video', _dur:180 },
      { id:'c', type:'image', _previewSec:10 },
    ],
    SYNC_REMOTE:{slotMs:20000}, syncSlotSec:20,
    _cacheTech:new Map(), KIND:{video:'video',image:'image'}, cfg:{imgSec:8,audioSec:30,interSec:20},
    at:0,
  });
  vm.runInContext([
    'function syncNow(){ return at; }',
    functionSource(canal,'syncFallbackSlotMs'),
    functionSource(canal,'syncItemDurationMs'),
    functionSource(canal,'syncTimeline'),
  ].join('\n'), context);
  const timeline = at => { context.at=at; return vm.runInContext('syncTimeline()',context); };
  assert.deepEqual(JSON.parse(JSON.stringify(timeline(60999))), {index:0,duration:61000,elapsed:60999,remaining:1,total:251000});
  assert.equal(timeline(61000).index, 1);
  assert.equal(timeline(240999).index, 1);
  assert.equal(timeline(241000).index, 2);
  assert.equal(timeline(251000).index, 0);
});

test('los 20 segundos son sólo respaldo y la duración descubierta se republica', () => {
  assert.match(canal, /return sec>0\?Math\.max\(1000,Math\.ceil\(sec\)\*1000\):syncFallbackSlotMs\(\)/);
  assert.match(canal, /const sig=items\.map\(i=>\[i\.id,i\.url,i\.thumb,i\.dur\|\|0\]\.join\('~'\)\)\.join\('\|'\)/);
  assert.match(canal, /try\{ signagePlaylistPush\(\); \}catch\(_\)\{\}/);
  assert.match(canal, /if\(target!==cur\)\{ play\(target\); return; \}/);
  assert.match(canal, /v\.onended=\(\)=>syncOn\?syncFinishCurrent\(\):next\(\)/);
});
