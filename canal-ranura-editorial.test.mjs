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

function editorialSec(cfg = {}) {
  const context = vm.createContext({
    KIND: { video:'video', animation:'video', image:'image', 'digital-twin':'image', 'twin-npc':'image', audio:'audio', music:'audio', locucion:'audio', interactive:'interactive', xperiencia:'interactive' },
    cfg: Object.assign({ imgSec: 9, audioSec: 18, interSec: 60 }, cfg),
  });
  vm.runInContext(`${functionSource(canal, 'editorialSec')}\nglobalThis.sec=editorialSec;`, context);
  return context.sec;
}

test('la ranura editorial de parrilla/borrador manda sobre la ranura de la pantalla', () => {
  const sec = editorialSec();
  assert.equal(sec({ type:'image' }), 9);                       // Stock: ranura de la pantalla
  assert.equal(sec({ type:'image', _previewSec: 25 }), 25);      // parrilla/borrador: su duración
  assert.equal(sec({ type:'audio' }), 18);                       // Stock: ranura de audio
  assert.equal(sec({ type:'music', _previewSec: 10 }), 10);      // parrilla: 10 s, no 18
  assert.equal(sec({ type:'interactive', _previewSec: 40 }), 40);
  assert.equal(sec({ type:'interactive', _interSec: 22 }), 22);
  assert.equal(sec({ type:'interactive' }), 60);
});

test('un audio más corto que su ranura ocupa su longitud real, nunca de más', () => {
  const sec = editorialSec();
  assert.equal(sec({ type:'audio', _dur: 6 }), 6);               // cuña de 6 s → 6 s, no 18
  assert.equal(sec({ type:'locucion', _dur: 5.2, _previewSec: 10 }), 6);
  assert.equal(sec({ type:'audio', _dur: 180 }), 18);            // canción de 3 min → ranura
  assert.equal(sec({ type:'audio', _dur: 180, _previewSec: 30 }), 30);
});

test('vídeo: duración real conocida o 0 (desconocida); nunca hereda la ranura de imagen', () => {
  const sec = editorialSec();
  assert.equal(sec({ type:'video', _dur: 37 }), 37);
  assert.equal(sec({ type:'animation' }), 0);
});

test('mínimos de seguridad y configuración de pantalla', () => {
  const sec = editorialSec({ imgSec: 0, audioSec: 1, interSec: 0 });
  assert.equal(sec({ type:'image' }), 2);
  assert.equal(sec({ type:'audio' }), 3);
  assert.equal(sec({ type:'interactive' }), 5);
});

test('reproducir, imputar (/emit) y publicar al mando usan la MISMA regla', () => {
  const play = functionSource(canal, 'play');
  assert.match(play, /startAdv\(syncOn\?syncRemainingMs\(\):editorialSec\(it\)\*1000\);\n  \} else if\(k==='interactive'\)/);
  assert.match(play, /a\.onloadedmetadata=\(\)=>\{ if\(_tok!==_playTok\|\|!a\.duration/);
  assert.match(play, /it\._dur=Math\.ceil\(a\.duration\)/);
  assert.doesNotMatch(play, /Math\.max\(3,cfg\.audioSec\)/);
  const emit = functionSource(canal, 'emitRecord');
  assert.match(emit, /const secs = editorialSec\(it\) \|\| 15;/);
  assert.doesNotMatch(emit, /cfg\.audioSec/);
  const now = functionSource(canal, 'signageNowPush');
  assert.match(now, /effectiveDuration=syncOn\?Math\.round\(syncSlotMs\(\)\/1000\):editorialSec\(it\)/);
  const pl = functionSource(canal, 'signagePlaylistPush');
  // En sincro manda la línea temporal del máster; en local, la ranura editorial.
  assert.match(pl, /dur:\(syncOn\?Math\.ceil\(syncItemDurationMs\(it\)\/1000\):Math\.ceil\(editorialSec\(it\)\)\)\|\|null/);
});

test('la parrilla (/grid/day) entra con su slotSeconds como duración editorial', () => {
  const grid = functionSource(canal, 'loadGrid');
  assert.match(grid, /const _gsec=Math\.max\(2,Math\.min\(120,Number\(d\.config&&d\.config\.slotSeconds\)\|\|10\)\);/);
  assert.match(grid, /_previewSec:_gsec, _grid:true/);
  assert.match(grid, /\+'~'\+\(x\._previewSec\|\|''\)\)\.join\('\|'\)/);   // un cambio de ranura también reconstruye
});
