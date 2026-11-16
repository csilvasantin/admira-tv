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
  assert.match(html, /el\.muted = mudo; el\.playsInline = true;/); // mudo persistente (sonido-off, 15-nov-2026)
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
  assert.match(html, /listaBase = horizontales\.length \? horizontales : todas;/);
  assert.match(html, /producer: "creel-led-" \+ SCREEN/); // el latido sigue siendo de la pantalla propia
});

test('el kiosko emite solas las piezas del Stock etiquetadas personaje:<slug> mientras ese personaje manda, y lo cuenta en el latido (Carlos, 14-nov-2026)', () => {
  assert.match(html, /\(i\.tags \|\| \[\]\)\.indexOf\("personaje:" \+ slug\) >= 0/);
  assert.match(html, /listaSlug = slug; lista = slug \? piezasDe\(slug\) : listaBase; idx = -1; siguiente\(\);/);
  assert.match(html, /if \(slug === listaSlug\) return;/);
  assert.match(html, /listaBase = horizontales\.length \? horizontales : todas;/);
  assert.match(html, /personaje: listaSlug \|\| ""/); // el latido cuenta el personaje (o «intro») en antena
});

test('la pared obedece al detector de Casa Creel por su propia cola (?cola=): personaje, fondo y truenos, como pantalla.js', () => {
  assert.match(html, /var COLA = \(function \(\) \{ var v = qs\("cola"\);/);
  assert.match(html, /fetch\(CMD_HOSTS\[cmdHost\] \+ "\?id=" \+ encodeURIComponent\(COLA\)/);
  assert.match(html, /if \(cmd === "tag-creel-fondo"\) \{ personaje\(""\); return true; \}/);
  assert.match(html, /if \(cmd === "tag-vecna-truenos"\) \{/);
  assert.match(html, /\^tag-creel-\(\[a-z0-9-\]\+\)\$/);
  assert.match(html, /"sr-whatsit": "Sr\. Whatsit", max: "Max", vecna: "Vecna", once: "Once"/);
  assert.match(html, /if \(ordenPersonaje\(cmd\)\) return "executed";/);
  assert.match(html, /function piezasDe\(slug\)/);
  assert.match(html, /var cc = once \? \["#7ad8ff", "#1d4f8a", "#06122e"\] : vecna \? \["#cf2549", "#6b1041", "#150b27"\]/);
  assert.match(html, /if \(nivel === "puerta" && !once\) g\.scale\(1, -1\);/);
});

test('la pared llena el visor sin franjas (TCL 16:9, 15-nov-2026) y conserva el 8:3 de siempre con ?formato=83', () => {
  assert.match(html, /lleno = fmt === "169" \|\| fmt === "lleno" \|\| \(fmt !== "83" && a < 2\.2\);/);
  assert.match(html, /H = Math\.round\(W \/ asp\); L = maqueta\(\);/);
  assert.match(html, /escala = bw \/ W;/);                       // a la resolución real del visor (devicePixelRatio)
  assert.match(html, /g\.setTransform\(escala, 0, 0, escala, 0, 0\);/);
  assert.match(html, /window\.addEventListener\("resize", ajusta\);/);
  assert.match(html, /H = 540; escala = 1; L = null; caja\.removeAttribute\("style"\);/);
});
