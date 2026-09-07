import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const canal = await readFile(new URL('./canal.html', import.meta.url), 'utf8');

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `falta ${name}`);
  const brace = source.indexOf('{', start);
  let depth = 0, quote = '', escaped = false;
  for (let i = brace; i < source.length; i += 1) {
    const c = source[i];
    if (quote) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === quote) quote = ''; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{') depth += 1;
    else if (c === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`${name} incompleta`);
}

test('la sincro también baja su playlist a disco: nunca «0 de 40 · pendiente» para siempre', () => {
  const rebuild = functionSource(canal, 'rebuild');
  const branch = /if\(syncOn\)\{([\s\S]*?)\n\s*return;/.exec(rebuild);
  assert.ok(branch, 'no se encontró la rama sincro de rebuild');
  assert.match(branch[1], /try\{ schedulePrecache\(\); \}catch\(_\)\{\}/);
  assert.ok(branch[1].indexOf('schedulePrecache()') < branch[1].indexOf('play(syncIndex())'));
});

test('lo que ya está en disco se adopta al arrancar: cada pieza se baja UNA sola vez', () => {
  const adopt = functionSource(canal, 'cacheAdopt');
  assert.match(adopt, /const keys=await c\.keys\(\); _diskUrls=new Set\(keys\.map\(r=>r\.url\)\);/);
  assert.match(adopt, /_diskUrls\.has\(it\.url\)\)\{ _ready\.add\(it\.id\);/);
  const sched = functionSource(canal, 'schedulePrecache');
  assert.match(sched, /cacheAdopt\(\)\.then\(adopted=>\{/);
  assert.match(sched, /if\(adopted\) cacheReport\(\);/);
  // Una descarga nueva entra en el inventario memorizado.
  assert.match(canal, /_ready\.add\(it\.id\); if\(_diskUrls\) _diskUrls\.add\(it\.url\);/);
});
