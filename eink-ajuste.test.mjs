import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

// Adaptar cada pieza a la resolución de la pantalla de tinta a la que se envía (Carlos, 18-nov-2026).
// Una regla para todos (assets/admira-eink.js · ajuste): el panel la enseña antes de enviar, la orden lleva el modo
// (content-<N>-cover / -contain; sin sufijo, automático) y cada puente la aplica a SU resolución: el del Fold y el
// player de la Samsung con este mismo código; el del Mac Studio (~/.admira-eink/eink_bridge.py r12) con su copia en Python.
const require = createRequire(import.meta.url);
const A = require('./assets/admira-eink.js');
const read = f => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
const panel = read('./eink/index.html'), puente = read('./eink/puente/index.html'), player = read('./eink/player/index.html');

test('la resolución sale del censo; sin dato, la de la SY11-ab', () => {
  assert.deepEqual(A.medidas({ device: { eink: { resolution: '480x800' } } }), { w: 480, h: 800 });
  assert.deepEqual(A.medidas({ device: { display: { width: 1200, height: 1600 } } }), { w: 1200, h: 1600 });
  assert.deepEqual(A.medidas({}), { w: 480, h: 800 });
});

test('la orden lleva el modo de ajuste y las antiguas siguen valiendo', () => {
  assert.deepEqual(A.leeContenido('content-2089'), { num: 2089, modo: 'auto' });
  assert.deepEqual(A.leeContenido('content-2089-cover'), { num: 2089, modo: 'cover' });
  assert.deepEqual(A.leeContenido('/content-7-contain'), { num: 7, modo: 'contain' });
  assert.equal(A.leeContenido('content-7-zoom'), null);
  for (const cmd of ['content-1593-cover', 'content-1593-contain', 'content-1593']) assert.equal(A.aceptaOrden(cmd), true, cmd);
});

test('automático: rellena si recorta como mucho un 20 %, si no encaja con bandas blancas', () => {
  const sy11 = (w, h) => A.ajuste(w, h, 480, 800, 'auto');
  assert.equal(sy11(480, 800).recorte, 0);                       // a medida
  assert.equal(sy11(360, 640).modo, 'cover');                    // 9:16 → recorta un 6 % arriba y abajo
  assert.equal(sy11(360, 640).lados, 'arriba y abajo');
  assert.equal(sy11(1200, 1600).modo, 'cover');                  // 3:4 → justo el 20 %
  assert.equal(sy11(1920, 1080).modo, 'contain');                // 16:9 → entera, bandas arriba y abajo
  assert.equal(sy11(1920, 1080).lados, 'arriba y abajo');
  assert.equal(A.ajuste(360, 640, 1200, 1600, 'auto').modo, 'contain');   // en la Samsung de 3:4 un 9:16 perdería un 25 %
});

test('rellenar llena toda la pantalla y encajar la deja entera, centradas', () => {
  const c = A.ajuste(1920, 1080, 480, 800, 'cover');
  assert.ok(c.w >= 480 && c.h >= 800 && Math.abs(c.x + c.w / 2 - 240) < 1e-6 && Math.abs(c.y) < 1e-6);
  const e = A.ajuste(1920, 1080, 480, 800, 'contain');
  assert.ok(Math.abs(e.w - 480) < 1e-6 && e.h <= 800 && Math.abs(e.y + e.h / 2 - 400) < 1e-6);
});

test('el panel enseña cómo quedará en cada pantalla y manda el modo en la orden', () => {
  assert.match(panel, /id="modos"/);
  for (const m of ['auto', 'cover', 'contain']) assert.match(panel, new RegExp('data-modo="' + m + '"'));
  assert.match(panel, /id="asi"/, 'previo «así se verá» por pantalla marcada');
  assert.match(panel, /"content-" \+ num \+ \(modoAjuste === "auto" \? "" : "-" \+ modoAjuste\)/);
  assert.match(panel, /orden\(k, comandoDe\(pieza\.num\), vista\)/);
  assert.match(panel, /E\.ajuste\(/); assert.match(panel, /E\.medidas\(/);
  assert.match(panel, /EinkSY11\.trama\(/, 'en BWRY el previo va tramado en 4 colores, como lo pinta la tinta');
  assert.match(panel, /aspect-ratio:' \+ md\.w \+ ' \/ ' \+ md\.h/, 'la miniatura de cada tarjeta tiene la forma de su pantalla');
});

test('el puente del Fold y el player de la Samsung aplican la misma regla', () => {
  assert.match(puente, /src="\/assets\/admira-eink\.js\?v=/);
  assert.match(puente, /A\.leeContenido\(cmd\)/);
  assert.match(puente, /A\.ajuste\(img\.naturalWidth, img\.naturalHeight, E\.W, E\.H, modo \|\| "auto"\)/);
  assert.match(player, /src="\/assets\/admira-eink\.js\?v=/);
  assert.match(player, /A\.leeContenido\(cmd\)/);
  assert.match(player, /A\.ajuste\(IMG\.naturalWidth, IMG\.naturalHeight, innerWidth, innerHeight, "auto"\)/);
});

// Las páginas que usan la regla piden el script versionado: /assets se sirve con max-age=604800 y un navegador con la
// copia anterior (sin ajuste ni medidas) dejaba el panel sin tarjetas (18-nov-2026, tras publicar PR 216).
test('admira-eink.js y eink-sy11.js se piden con versión, para no quedarse con la copia en caché', () => {
  for (const [nombre, html] of [['panel', panel], ['puente', puente], ['player', player], ['mando', read('./mando.html')], ['players', read('./players.html')], ['playlists', read('./playlists/index.html')]]) {
    assert.ok(!/src="\/assets\/(admira-eink|eink-sy11)\.js"/.test(html), nombre + ' pide un script de tinta sin versión');
  }
});
