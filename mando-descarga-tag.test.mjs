import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const mando = await readFile(new URL('./mando.html', import.meta.url), 'utf8');
const canal = await readFile(new URL('./canal.html', import.meta.url), 'utf8');

test('el % de descarga va al lado del número del tag y la pastilla se rellena con el % real del equipo destino', () => {
  assert.match(mando, /<span class="tag-field"><input id="tagInput"[^>]*><b class="tag-pct" id="tagPct" aria-live="polite"><\/b><\/span>/);
  assert.match(mando, /\.tag-entry\.dl input\{padding-right:66px;background-image:linear-gradient\(90deg,.*? var\(--dl-pct\),transparent var\(--dl-pct\)\)\}/);
  assert.match(mando, /function paintTagDownload\(pct,state\)/);
  assert.match(mando, /entry\.style\.setProperty\('--dl-pct',\(state==='done'\?100:n\)\+'%'\)/);
  assert.match(mando, /label\.textContent=state==='done'\?'✓ 100%':state==='stalled'\?\('⌛ '\+n\+'%'\):\('⇩ '\+n\+'%'\)/);
  // Se pinta desde el estado real de /screen/cache en cada sondeo, y al final queda verde o en rojo.
  assert.match(mando, /paintRemoteButton\(visual\); paintTagDownload\(state\.pct,state\.ready\?'done':'dl'\);/);
  assert.match(mando, /finishRemoteButton\(visual,'timeout'\); paintTagDownload\(lastPct,'stalled'\);/);
  // Aplicar de nuevo, limpiar el tag o cambiar de pantalla borran el relleno.
  assert.equal((mando.match(/paintTagDownload\(null\)/g) || []).length, 3);
});

test('el player no emite una pieza pedida por #ID hasta tenerla entera en disco, tampoco con stream=1', () => {
  assert.match(canal, /if\(_dl\.has\(it\.id\)&&!_ready\.has\(it\.id\)\) return null;/);
  assert.match(canal, /if\(!forced&&_asapItemId&&String\(it\.id\)===String\(_asapItemId\)&&cacheable\(it\)&&!_csrc\)\{\n\s*if\(playlist\.length>1\)\{ play\(cur\+1\); return; \}/);
  // Y solo maybeResumeCold la arranca, cuando _ready la libera.
  assert.match(canal, /if\(target&&\(!cacheable\(target\)\|\|_ready\.has\(target\.id\)\)\)\{\n\s*_asapItemId=null;/);
});
