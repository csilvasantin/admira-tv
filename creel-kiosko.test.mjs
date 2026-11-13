// Kiosko /creel: pantalla LED del Hotel Creel (PortAventura NeXT) · late como hotel-creel (Carlos, 13-nov-2026)
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./creel/index.html', import.meta.url), 'utf8');

test('el kiosko /creel late en /signage/now como hotel-creel con productor estable y la pieza en antena', () => {
  assert.match(html, /var SCREEN = \(function \(\) \{ var v = qs\("screen"\); return \/\^\[a-z0-9\]\[a-z0-9-\]\{1,79\}\$\/\.test\(v\) \? v : "hotel-creel"; \}\)\(\);/);
  assert.match(html, /var NOW_API = "https:\/\/api\.admira\.store\/signage\/now";/);
  assert.match(html, /producer: "creel-led-" \+ SCREEN/);
  assert.match(html, /locName: "Hotel Creel \\u00B7 LED \(PortAventura\)"/);
  assert.match(html, /setInterval\(beat, 10000\);/);
  assert.match(html, /id: "creel-fondo"/);
});

test('el kiosko escucha la maqueta de admira.store (presencia, zona y personaje) y pinta luces, retrato y HUD', () => {
  assert.match(html, /"https:\/\/admira\.store": 1, "https:\/\/www\.admira\.store": 1/);
  assert.match(html, /d\.type === "creel-personaje"/);
  assert.match(html, /nombre\.indexOf\(letters\.charAt\(li\)\) >= 0/);
  assert.match(html, /g\.measureText\(linea\)\.width \+ 30/);
});
