import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const cms = await readFile(new URL('./cms.html', import.meta.url), 'utf8');
const canal = await readFile(new URL('./canal.html', import.meta.url), 'utf8');

test('todas las fichas viven bajo Detalle y el grupo nace compactado', () => {
  assert.match(cms, /<details class="fleetDetail" id="fleetDetail">\s*<summary>Detalle/);
  assert.match(cms, /<summary>Detalle[\s\S]*?<div class="grid" id="grid">/);
  assert.doesNotMatch(cms, /<details class="fleetDetail" id="fleetDetail"[^>]*\sopen(?:\s|>)/);
  assert.match(cms, /\.fleetDetail\[open\] \.fleetDetailHint::after\{content:'compactar'\}/);
  assert.match(cms, /detailCount\.textContent=shown\+' player'/);
});

test('En emisión muestra la duración real con respaldos honestos', () => {
  assert.match(cms, /function durationTxt\(value\)/);
  assert.match(cms, /durationSeconds\(live&&live\.dur,live&&live\.duration,listed&&listed\.dur/);
  assert.match(cms, /stock\.dur,stock\.duration,stock\._dur/);
  assert.match(cms, /class="ebPieceDuration'\+\(info\.duration\?'':' missing'\)\+'">duración '\+durationTxt\(info\.duration\)/);
  assert.match(cms, /if\(!sec\)return '—'/);
});

test('el player publica la duración prevista y corrige la real al cargar el vídeo', () => {
  assert.match(canal, /dur:\(it\._dur\|\|it\._previewSec\|\|0\)/);
  assert.match(canal, /_nowItem\.dur=it\._dur; _postNow\(_nowItem\)/);
});
