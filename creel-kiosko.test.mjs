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
  assert.match(html, /var ly = H \* 0\.026;/);
});

test('el kiosko reproduce de fondo la playlist de admira.tv de la pantalla (mando), con tinte Hawkins, y la cuenta en el latido', () => {
  assert.match(html, /fetch\("\/api\/playlist\?screen=" \+ PLAYLIST_SCREEN, \{ cache: "no-store" \}\)/);
  assert.match(html, /el\.crossOrigin = "anonymous";/);
  assert.match(html, /el\.muted = true; el\.playsInline = true;/);
  assert.match(html, /g\.fillStyle = "rgba\(140,11,20,\.42\)"; g\.fillRect\(0, 0, W, H\); \/\/ tinte Hawkins/);
  assert.match(html, /: pieza \|\| \{ id: "creel-fondo"/);
  assert.match(html, /setInterval\(cargaLista, 60000\);/);
});

test('el kiosko obedece «📺 Pantallas» del mando por la cola /locations/cmd (pantallas-on/off/toggle) y acusa', () => {
  assert.match(html, /var CMD_HOSTS = \["https:\/\/api\.admira\.store\/locations\/cmd", "https:\/\/brain\.digitalavatar\.ai\/locations\/cmd"\]/);
  assert.match(html, /if \(cmd === "pantallas-on" \|\| cmd === "pantallas" \|\| cmd === "contenido-on"\) \{ pantallas\(true\); return "executed"; \}/);
  assert.match(html, /if \(cmd === "pantallas-off" \|\| cmd === "contenido-off"\) \{ pantallas\(false\); return "executed"; \}/);
  assert.match(html, /cmdState\.since = d\.seq \|\| 0; cmdState\.init = true;/);          // el atraso anterior al arranque no se ejecuta
  assert.match(html, /CMD_HOSTS\[cmdHost\] \+ "\/ack"/);
  assert.match(html, /localStorage\.setItem\("creel-pantallas", pantallasOn \? "1" : "0"\)/);
  assert.match(html, /pantallas: pantallasOn \? "on" : "off"/);
});

test('el kiosko puede emitir la playlist de otra pantalla con ?playlist= (sin cambiar de identidad) y omite las piezas verticales', () => {
  assert.match(html, /var PLAYLIST_SCREEN = \(function \(\) \{ var v = qs\("playlist"\);/);
  assert.match(html, /fetch\("\/api\/playlist\?screen=" \+ PLAYLIST_SCREEN/);
  assert.match(html, /lista = horizontales\.length \? horizontales : todas;/);
  assert.match(html, /producer: "creel-led-" \+ SCREEN/); // el latido sigue siendo de la pantalla propia
});

test('sin red, el kiosko conserva la última temperatura buena (≤6 h) y reintenta el clima en 2 min', () => {
  assert.match(html, /var CLIMA_KEY = "creel-clima-v1"/);
  assert.match(html, /Date\.now\(\) - cc\.t < 6 \* 3600 \* 1000/);
  assert.match(html, /localStorage\.setItem\(CLIMA_KEY/);
  assert.match(html, /climaReintento = setTimeout\(leeClima, 2 \* 60 \* 1000\)/);
});

test('sin dato de clima (ni real ni forzado) el HUD no inventa «Sol»: sin icono y «CLIMA —»', () => {
  assert.match(html, /var conDato = !!\(clima\.forzado \|\| clima\.real\)/);
  assert.match(html, /conDato \? String\(NOMBRE\[tipo\] \|\| ""\)\.toUpperCase\(\) : "CLIMA \\u2014"/);
});

test('sin Intl, el respaldo de horaMadrid() sigue el horario de verano de la UE (no +1 h fijo)', () => {
  const ini = html.indexOf('function horaMadrid()');
  const fin = html.indexOf('\n  }\n', ini) + 4;
  const src = html.slice(ini, fin);
  const pad2 = (n) => (n < 10 ? '0' : '') + n;
  const sinIntl = { DateTimeFormat() { throw new Error('sin Intl'); } };
  const a = (iso) => {
    const fijo = Date.parse(iso);
    class D extends Date { constructor(...x) { super(...(x.length ? x : [fijo])); } }
    return new Function('Intl', 'Date', 'pad2', src + '; return horaMadrid();')(sinIntl, D, pad2);
  };
  assert.equal(a('2026-11-14T10:05:00Z'), '11:05'); // invierno: UTC+1
  assert.equal(a('2026-07-01T10:05:00Z'), '12:05'); // verano: UTC+2
  assert.equal(a('2026-03-29T00:59:00Z'), '01:59'); // justo antes del cambio de marzo
  assert.equal(a('2026-03-29T01:00:00Z'), '03:00'); // cambio de marzo
  assert.equal(a('2026-10-25T00:59:00Z'), '02:59'); // última hora de verano
  assert.equal(a('2026-10-25T01:00:00Z'), '02:00'); // vuelta a invierno
});
