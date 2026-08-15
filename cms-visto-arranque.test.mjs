import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const cms = await readFile(new URL('./cms.html', import.meta.url), 'utf8');

test('Visto distingue el latido de la hora de arranque real', () => {
  assert.match(cms, /<th data-col="visto" data-sort="num"[^>]*>Visto · arranque<\/th>/);
  assert.match(cms, /const live=nowByScreen\[p\.screen\]\|\|\{\}, started=stampMs\(live\.startedAt\)/);
  assert.match(cms, /class="ebSeenAge">'\+\(hasAge\?'hace '\+agoTxt\(age\):'—'\)/);
  assert.match(cms, /class="ebSeenStart'\+\(started\?'':' missing'\)\+'">arranque '\+clockTxt\(started\)/);
  assert.match(cms, /Arranque de la pieza:/);
});

test('la hora admite timestamps en segundos o milisegundos y no inventa ausencias', () => {
  assert.match(cms, /numeric<1e12\?numeric\*1000:numeric/);
  assert.match(cms, /if\(!ms\)return '—'/);
  assert.match(cms, /hasAge=rawAge!=null&&rawAge!==''&&Number\.isFinite\(age\)/);
  assert.match(cms, /toLocaleTimeString\('es-ES',\{hour:'2-digit',minute:'2-digit',second:'2-digit'\}\)/);
});

test('la columna reserva ancho para las dos líneas y conserva la ordenación por antigüedad', () => {
  assert.match(cms, /<col data-min="132"><col data-min="120">/);
  assert.match(cms, /\.ebSeenCell\{white-space:nowrap\}/);
  assert.match(cms, /visto:\s+p => Number\(p\.age_seconds\)\|\|0/);
  assert.match(cms, /data-col="visto">'\+seenCell\(p\)\+'<\/td>/);
});
