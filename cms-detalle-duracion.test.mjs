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

test('En emisión nace desplegado y se puede compactar desde su cabecera', () => {
  assert.match(cms, /<section class="emitBoard" id="emitBoard">\s*<details class="emitDetails" id="emitDetails" open>/);
  assert.match(cms, /<summary class="ebHead">[\s\S]*?EN EMISIÓN — AHORA/);
  assert.match(cms, /\.emitDetails\[open\] \.ebEmitHint::after\{content:'compactar'\}/);
  assert.match(cms, /\.emitDetails:not\(\[open\]\) \.ebEmitHint::after\{content:'desplegar'\}/);
});

test('el progreso se calcula cada segundo y comunica cuánto queda', () => {
  assert.match(cms, /data-duration="'\+info\.duration\+'" data-started-at="'\+info\.startedAt\+'"/);
  assert.match(cms, /elapsed=Math\.max\(0,Math\.min\(duration,\(at-started\)\/1000\)\), remaining=Math\.max\(0,duration-elapsed\)/);
  assert.match(cms, /label\.textContent='quedan '\+durationTxt\(remaining\)/);
  assert.match(cms, /bar\.style\.width=pct\.toFixed\(1\)\+'%'/);
  assert.match(cms, /setInterval\(\(\)=>\{ if\(!document\.hidden\)paintEmissionProgress\(Date\.now\(\)\); \},1000\)/);
  assert.match(cms, /aria-valuetext/);
});

test('el player publica la duración prevista y corrige la real al cargar el vídeo', () => {
  assert.match(canal, /dur:\(it\._dur\|\|it\._previewSec\|\|0\)/);
  assert.match(canal, /_nowItem\.dur=it\._dur; _postNow\(_nowItem\)/);
});
