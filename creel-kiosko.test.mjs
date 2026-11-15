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
  assert.match(html, /fetch\("\/api\/playlist\?screen=" \+ PLAYLIST_SCREEN, \{ cache: "no-store"(, signal: ctl \? ctl\.signal : undefined)? \}\)/);
  assert.match(html, /el\.crossOrigin = "anonymous";/);
  assert.match(html, /el\.muted = mudo; el\.playsInline = true;/);
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

test('sin Intl, el latido no se rompe: zonaTele() devuelve "" en vez de lanzar', () => {
  assert.ok(!html.includes('Intl.DateTimeFormat().resolvedOptions().timeZone || ""'), 'beat() no debe llamar a Intl sin try');
  assert.ok(html.includes('timezone: zonaTele()'));
  const ini = html.indexOf('function zonaTele()');
  assert.ok(ini > 0);
  const fin = html.indexOf('\n  }\n', ini) + 4;
  const src = html.slice(ini, fin);
  const sinIntl = { DateTimeFormat() { throw new Error('sin Intl'); } };
  assert.equal(new Function('Intl', src + '; return zonaTele();')(sinIntl), '');
  assert.equal(new Function('Intl', src + '; return zonaTele();')(undefined), '');
  const conIntl = { DateTimeFormat() { return { resolvedOptions() { return { timeZone: 'Europe/Madrid' }; } }; } };
  assert.equal(new Function('Intl', src + '; return zonaTele();')(conIntl), 'Europe/Madrid');
});

test('sin red, si todas las piezas de la playlist fallan seguidas, el fondo espera 30 s en vez de girar en bucle', () => {
  assert.match(html, /var fallos = 0;/);
  assert.match(html, /el\.onended = siguiente; el\.onerror = falla;/);
  assert.match(html, /el\.onerror = falla;\n/);
  assert.match(html, /if \(fallos < lista\.length\) \{ siguiente\(\); return; \}/);
  assert.match(html, /mediaTimer = setTimeout\(siguiente, 30000\);/);
  assert.match(html, /mediaOk = true; fallos = 0;/);
});

test('sin mando, el kiosko se autoactualiza: relee /version.json cada 10 min y recarga solo si cambia una versión conocida', async () => {
  assert.match(html, /setInterval\(leeVersion, 10 \* 60 \* 1000\);/);
  const ini = html.indexOf('  var versionBusy = false');
  assert.ok(ini > 0);
  const fin = html.indexOf('\n  }\n', html.indexOf('function leeVersion()', ini)) + 4;
  const src = html.slice(ini, fin);
  const corre = async (inicial, respuesta) => {
    let recargas = 0;
    const loc = { reload() { recargas++; } };
    const fetchF = () => respuesta instanceof Error ? Promise.reject(respuesta) : Promise.resolve({ ok: true, json: () => Promise.resolve(respuesta) });
    const f = new Function('fetch', 'location', 'inicial', 'var version = inicial; ' + src + '; leeVersion(); return new Promise(function (r) { setTimeout(function () { r(version); }, 20); });');
    const v = await f(fetchF, loc, inicial);
    return { v, recargas };
  };
  assert.deepEqual(await corre('', { version: 'v1' }), { v: 'v1', recargas: 0 });      // arrancó sin red: rellena, no recarga
  assert.deepEqual(await corre('v1', { version: 'v1' }), { v: 'v1', recargas: 0 });    // misma versión: nada
  assert.deepEqual(await corre('v1', { version: 'v2' }), { v: 'v1', recargas: 1 });    // deploy nuevo: recarga
  assert.deepEqual(await corre('v1', new Error('sin red')), { v: 'v1', recargas: 0 }); // sin red: nunca recarga
  assert.deepEqual(await corre('v1', {}), { v: 'v1', recargas: 0 });                   // respuesta vacía: nada
});

test('refresco nocturno: tras más de 20 h encendida, recarga una vez entre las 05:00 y 05:59 de Madrid y solo con red', () => {
  const ini = html.indexOf('var arranque = Date.now();');
  assert.ok(ini > 0);
  const fin = html.indexOf('\n', html.indexOf('function refrescoNocturno(', ini)) + 1;
  const src = html.slice(ini, fin);
  const f = new Function('Date', src + '; return refrescoNocturno;');
  const T0 = 1e12, H = 3600000;
  const r = f({ now: () => T0 });
  assert.equal(r(T0 + 21 * H, '05:10'), true);   // 21 h encendida y son las 05: recarga
  assert.equal(r(T0 + 19 * H, '05:10'), false);  // menos de 20 h: no
  assert.equal(r(T0 + 21 * H, '04:59'), false);  // fuera de la franja: no
  assert.equal(r(T0 + 21 * H, '15:05'), false);  // las 15 no son las 05
  // solo se evalúa tras una lectura buena de /version.json (con red), dentro de leeVersion
  const lv = html.slice(html.indexOf('function leeVersion()'), html.indexOf('var arranque'));
  assert.ok(lv.indexOf('refrescoNocturno(') > lv.indexOf('version = v;'));
});

test('pantalla siempre encendida: pide Screen Wake Lock al arrancar, al volver a ser visible y cada minuto, sin romperse si no hay API', async () => {
  const ini = html.indexOf('var wakeLock = null');
  const fin = html.indexOf('setInterval(pideWakeLock, 60000);') + 'setInterval(pideWakeLock, 60000);'.length;
  assert.ok(ini > 0 && fin > ini);
  const src = html.slice(ini, fin);
  const monta = (nav, vis = 'visible') => {
    const ev = {}, ivs = [];
    const doc = { visibilityState: vis, addEventListener: (k, f) => { ev[k] = f; } };
    new Function('navigator', 'document', 'setInterval', src)(nav, doc, (f, d) => ivs.push(d));
    return { ev, ivs, doc };
  };
  let pedidos = 0, rel = null;
  const nav = { wakeLock: { request: (k) => { assert.equal(k, 'screen'); pedidos++; return Promise.resolve({ addEventListener: (e, f) => { rel = f; } }); } } };
  const m = monta(nav);
  assert.equal(pedidos, 1); assert.deepEqual(m.ivs, [60000]); assert.equal(typeof m.ev.visibilitychange, 'function');
  m.ev.visibilitychange(); assert.equal(pedidos, 1);           // pedido en curso: no repite
  await new Promise(r => setTimeout(r, 0));
  m.ev.visibilitychange(); assert.equal(pedidos, 1);           // ya lo tiene: no repite
  rel(); m.ev.visibilitychange(); assert.equal(pedidos, 2);    // se soltó (p. ej. al ocultarse): lo vuelve a pedir
  assert.doesNotThrow(() => monta({}));                        // WebView sin Wake Lock: nada
  let p2 = 0; monta({ wakeLock: { request: () => { p2++; return Promise.resolve({ addEventListener() {} }); } } }, 'hidden');
  assert.equal(p2, 0);                                         // oculta: no lo pide
  assert.doesNotThrow(() => monta({ wakeLock: { request: () => { throw new Error('NotAllowed'); } } }));
});

test('un error al pintar un fotograma no congela el LED (sigue pidiendo fotogramas y solo recarga tras 300 fallos seguidos con red)', () => {
  const ini = html.indexOf('var fallosPinta = 0;');
  const fin = html.indexOf('\n  }\n', html.indexOf('function loop(')) + 4;
  assert.ok(ini > 0 && fin > ini);
  const src = html.slice(ini, fin);
  const monta = (pinta, online = true) => {
    const cola = []; let recargas = 0;
    const loop = new Function('raf', 'pinta', 'navigator', 'location', 'function anota() {}; ' + src + '; return loop;')(f => cola.push(f), pinta, { onLine: online }, { reload: () => recargas++ });
    const corre = n => { loop(1); for (let i = 0; i < n && cola.length; i++) cola.shift()(i + 2); };
    return { corre, cola, rec: () => recargas };
  };
  let n = 0; const a = monta(() => { n++; if (n === 3) throw new Error('fotograma roto'); });
  a.corre(10); assert.equal(n, 11); assert.equal(a.cola.length, 1); assert.equal(a.rec(), 0); // sigue tras el error
  const b = monta(() => { throw new Error('siempre'); }); b.corre(400); assert.equal(b.rec(), 1); // recarga una vez
  const c = monta(() => { throw new Error('siempre'); }, false); c.corre(400); assert.equal(c.rec(), 0); // sin red: no
});

test('la última playlist buena se recuerda (≤72 h) y se emite si la TCL arranca sin red o /api/playlist falla; la red la sustituye', async () => {
  const ini = html.indexOf('  var LISTA_KEY = ');
  const fin = html.indexOf('\n  }\n', html.indexOf('function cargaLista(')) + 4;
  assert.ok(ini > 0 && fin > ini);
  const src = html.slice(ini, fin);
  const mk = (store, fetchImpl, now = 1e12) => {
    const st = { lista: [], sig: 0 };
    const api = new Function('st', 'localStorage', 'fetch', 'Date', 'PLAYLIST_SCREEN',
      'var lista = st.lista, listaBase = [], listaSlug = null, listaRev = null, listaNombre = "", idx = -1, fallos = 0, pantallasOn = true; function siguiente() { st.sig++; } function filtraPorPersonaje() { lista = listaBase; idx = -1; siguiente(); }' + src +
      '; return { cargaLista, get lista() { return lista; }, get nombre() { return listaNombre; } };')(st,
      { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } }, fetchImpl, { now: () => now }, 'hotel-creel');
    return { api, st };
  };
  const tick = () => new Promise(r => setTimeout(r, 0));
  const items = [{ id: 'a', title: 'A', assetType: 'video', asset: 'https://x/a.mp4', seconds: 10, tags: ['horizontal'], sub: 'fuera' }, { id: 'v', assetType: 'video', asset: 'https://x/v.mp4', tags: ['vertical'] }];
  const ok = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, draft: { rev: 7, name: 'Creel', items } }) });
  const store = {};
  const a = mk(store, ok); a.api.cargaLista(); await tick(); await tick();
  assert.equal(a.api.lista.length, 1); const c = JSON.parse(store['creel-lista-hotel-creel']);
  assert.equal(c.items.length, 2); assert.equal(c.items[0].sub, undefined); assert.equal(c.t, 1e12);
  a.api.cargaLista(); await tick(); await tick(); assert.equal(a.st.sig, 1);          // misma rev de la red: no reinicia
  const b = mk(store, () => Promise.reject(new Error('sin red')), 1e12 + 3600000); b.api.cargaLista(); await tick(); await tick();
  assert.equal(b.api.lista.length, 1); assert.equal(b.api.nombre, 'Creel'); assert.equal(b.st.sig, 1); // sin red: la recordada
  b.api.cargaLista(); await tick(); await tick(); assert.equal(b.st.sig, 1);          // ya emite: no reinicia
  const e = mk(store, () => Promise.resolve({ ok: false, json: () => Promise.reject(0) })); e.api.cargaLista(); await tick(); await tick();
  assert.equal(e.api.lista.length, 1);                                               // 5xx: la recordada
  const v = mk(store, () => Promise.reject(0), 1e12 + 73 * 3600000); v.api.cargaLista(); await tick(); await tick();
  assert.equal(v.api.lista.length, 0);                                               // más de 72 h: no
  let red = false; const s = mk(store, () => red ? ok() : Promise.reject(0)); s.api.cargaLista(); await tick(); await tick();
  red = true; s.api.cargaLista(); await tick(); await tick(); assert.equal(s.st.sig, 2); // vuelve la red: la sustituye
});


test('kiosko /creel: al volver la red se pone al día al instante (clima, playlist y fondo en espera)', () => {
  const ini = html.indexOf('function vuelveRed()');
  const fin = html.indexOf('\n  }\n', ini) + 4;
  assert.ok(ini > 0 && fin > ini);
  assert.match(html, /window\.addEventListener\("online", vuelveRed\);/);
  const mk = (st) => new Function('st', 'var clima = { ok: st.ok }, climaReintento = 1, media = st.media, lista = st.lista; function clearTimeout() { st.ct++; } function leeClima() { st.clima++; } function cargaLista() { st.carga++; } function siguiente() { st.sig++; }' + html.slice(ini, fin) + '; return vuelveRed;')(st);
  const a = { ok: false, media: null, lista: [1], ct: 0, clima: 0, carga: 0, sig: 0 }; mk(a)();
  assert.deepEqual([a.ct, a.clima, a.carga, a.sig], [1, 1, 1, 1]);                    // sin clima y fondo en espera: todo ya
  const b = { ok: true, media: {}, lista: [1], ct: 0, clima: 0, carga: 0, sig: 0 }; mk(b)();
  assert.deepEqual([b.ct, b.clima, b.carga, b.sig], [0, 0, 1, 0]);                    // ya emitiendo: no corta la pieza en curso
  const c = { ok: true, media: null, lista: [], ct: 0, clima: 0, carga: 0, sig: 0 }; mk(c)();
  assert.equal(c.sig, 0);                                                             // sin lista: nada que reintentar
});

test('una imagen de la playlist que se cuelga (sin load ni error) no atasca el fondo: a los 20 s cuenta como fallo y pasa a la siguiente', () => {
  assert.match(html, /mediaTimer = setTimeout\(falla, 20000\); \/\/ por si la imagen se atasca/);
  assert.match(html, /el\.onload = function \(\) \{ if \(mediaTimer\) clearTimeout\(mediaTimer\); mediaOk = true; fallos = 0;/);
});

test('un sondeo colgado de /locations/cmd no deja el mando sordo: guarda de 15 s que aborta, cambia de host y vuelve a sondear', () => {
  assert.match(html, /var vuelta = \+\+cmdVuelta, ctl = typeof AbortController === "function" \? new AbortController\(\) : null;/);
  assert.match(html, /cmdHost = \(cmdHost \+ 1\) % CMD_HOSTS\.length; cmdIdle\+\+; cmdBusy = false; setTimeout\(sondeaOrdenes, 3000\);\n    \}, 15000\);/);
  assert.match(html, /signal: ctl \? ctl\.signal : undefined/);
  assert.match(html, /if \(!d \|\| vuelta !== cmdVuelta\) return;/);
  assert.match(html, /clearTimeout\(guarda\); if \(vuelta !== cmdVuelta\) return; cmdBusy = false;/);
});

test('una petición de playlist colgada no deja la TCL sin fondo ni apila conexiones: guarda de 15 s que aborta y emite la última lista buena', () => {
  assert.match(html, /var listaBusy = false; \/\/ una sola petición de playlist a la vez/);
  assert.match(html, /if \(listaBusy\) return;\n    listaBusy = true;/);
  assert.match(html, /var guarda = setTimeout\(function \(\) \{ if \(!fin\(\)\) return; if \(ctl\) \{ try \{ ctl\.abort\(\); \} catch \(e\) \{\} \} listaRecordada\(\); \}, 15000\);/);
  assert.match(html, /if \(!fin\(\)\) return; \/\/ respuesta tardía de una petición ya abandonada/);
  assert.match(html, /\.catch\(function \(\) \{ if \(fin\(\)\) listaRecordada\(\); \}\);/);
});

test('una petición de clima colgada no deja el HUD sin reintento ni apila conexiones: una sola a la vez, guarda de 15 s que aborta, conserva la caché e ignora respuestas tardías', async () => {
  assert.match(html, /var climaBusy = false; \/\/ una sola petición de clima a la vez/);
  assert.match(html, /if \(climaBusy\) return;\n    climaBusy = true;/);
  assert.match(html, /if \(ctl\) \{ try \{ ctl\.abort\(\); \} catch \(e\) \{\} \} if \(x\) \{ try \{ x\.abort\(\); \} catch \(e\) \{\} \} fail\(\); \}, 15000\), x = null;/);
  assert.match(html, /if \(!fin\(\)\) return; \/\/ respuesta tardía de una petición ya abandonada: se ignora\n      try \{\n        var c = j\.current/);
  const ini = html.indexOf('  var climaBusy = false;');
  const fin = html.indexOf('\n  leeClima();', ini);
  assert.ok(ini > 0 && fin > ini);
  // Simulación: fetch que nunca responde (resolvedor guardado), temporizadores manuales y AbortController falso.
  const st = { fetches: [], timers: [], aborts: 0 };
  const env = new Function('st', `
    var clima = { temp: 21, real: "sol", ok: false }, climaReintento = null, CLIMA_KEY = "k";
    var localStorage = { setItem: function () {} };
    function tipoDe() { return "nubes"; }
    function setTimeout(f, ms) { st.timers.push({ f: f, ms: ms, vivo: true }); return st.timers.length; }
    function clearTimeout(id) { if (id && st.timers[id - 1]) st.timers[id - 1].vivo = false; }
    function AbortController() { this.signal = {}; this.abort = function () { st.aborts++; }; }
    var XMLHttpRequest = null;
    function fetch(url, o) { return new Promise(function (res, rej) { st.fetches.push({ res: res, rej: rej, signal: o.signal }); }); }
    ${html.slice(ini, fin)}
    return { leeClima: leeClima, clima: clima };`)(st);
  env.leeClima(); env.leeClima(); env.leeClima();
  assert.equal(st.fetches.length, 1);                          // colgada: no se apilan otras
  assert.ok(st.fetches[0].signal);                              // lleva signal para poder abortarla
  const g = st.timers.find(t => t.ms === 15000 && t.vivo); assert.ok(g);
  g.f();                                                         // pasan 15 s sin respuesta
  assert.equal(st.aborts, 1);
  assert.equal(env.clima.ok, false);
  assert.equal(env.clima.temp, 21);                             // conserva la última lectura buena (caché)
  assert.ok(st.timers.some(t => t.ms === 120000 && t.vivo));    // reintento en 2 min
  st.fetches[0].res({ ok: true, json: () => ({ current: { temperature_2m: 5, weather_code: 3 } }) });
  await new Promise(r => setImmediate(r));
  assert.equal(env.clima.temp, 21);                             // la respuesta tardía se ignora
  env.leeClima(); assert.equal(st.fetches.length, 2);           // ya libre: puede volver a pedir
  st.fetches[1].res({ ok: true, json: () => ({ current: { temperature_2m: 18, weather_code: 3 } }) });
  await new Promise(r => setImmediate(r));
  assert.equal(env.clima.temp, 18); assert.equal(env.clima.ok, true);
  assert.equal(st.timers.filter(t => t.ms === 15000 && t.vivo).length, 0); // guarda retirada al llegar la respuesta
});

test('un latido colgado de /signage/now no apila conexiones con api.admira.store: uno solo a la vez, guarda de 9 s que aborta y un final tardío no libera al siguiente', async () => {
  assert.match(html, /var beatBusy = false, beatVuelta = 0; \/\/ un solo latido a la vez/);
  assert.match(html, /if \(beatBusy\) return;\n    beatBusy = true;/);
  assert.match(html, /signal: ctl \? ctl\.signal : undefined \}\)\.then\(libre, libre\);/);
  const ini = html.indexOf('  var beatBusy = false');
  const fin = html.indexOf('\n  setTimeout(beat, 2000);', ini);
  assert.ok(ini > 0 && fin > ini);
  const st = { fetches: [], timers: [], aborts: 0 };
  const env = new Function('st', `
    var escena = { cara: null, nivel: "lejos", quien: "" }, clima = { tipo: "sol" }, pantallasOn = true, SCREEN = "hotel-creel", NOW_API = "https://api.admira.store/signage/now", version = "v", W = 1440, H = 540, diag = { errores: 0, ultimo: "" }, arranque = 0, media = null, mediaOk = false, mudo = true;
    function fpsAhora() { return 60; } function memoriaMB() { return 80; } function pantallaFija() { return "si"; } function teleVisible() { return "si"; } function climaMin() { return 3; } function mandoSeg() { return 2; } function listaOrigen() { return "red"; } var recargaPrevia = "arranque"; var desfaseReloj = null; function encajeTele() { return { orientation: "landscape", encaje: "16:9" }; } var cortesRed = 0, ultimoCorte = 0; function redLatido(o) { return { online: o }; } function listaMin() { return 0; } function fondoLatido() { return "rojo"; } var intro = { on: false };
    var innerWidth = 1920, innerHeight = 1080, navigator = { platform: "", language: "es", userAgent: "tcl", onLine: true }, window = { devicePixelRatio: 1 }; window.parent = window;
    var location = { origin: "https://admira.tv" };
    function piezaEnAntena() { return null; } function zonaTele() { return ""; }
    function setTimeout(f, ms) { st.timers.push({ f: f, ms: ms, vivo: true }); return st.timers.length; }
    function clearTimeout(id) { if (id && st.timers[id - 1]) st.timers[id - 1].vivo = false; }
    function AbortController() { this.signal = {}; this.abort = function () { st.aborts++; }; }
    function fetch(url, o) { return new Promise(function (res, rej) { st.fetches.push({ url: url, res: res, rej: rej, signal: o.signal }); }); }
    ${html.slice(ini, fin)}
    return { beat: beat };`)(st);
  const tick = () => new Promise(r => setImmediate(r));
  env.beat(); env.beat(); env.beat();
  assert.equal(st.fetches.length, 1);                            // colgado: no se apilan otros POST
  assert.ok(st.fetches[0].signal);
  assert.match(st.fetches[0].url, /signage\/now/);
  const g = st.timers.find(t => t.ms === 9000 && t.vivo); assert.ok(g);
  g.f();                                                           // pasan 9 s sin respuesta
  assert.equal(st.aborts, 1);
  env.beat(); assert.equal(st.fetches.length, 2);                 // el siguiente latido sale a su hora
  st.fetches[0].rej(new Error('abort')); await tick();            // final tardío del abandonado
  env.beat(); assert.equal(st.fetches.length, 2);                 // no libera al que está en curso
  st.fetches[1].res({ ok: true }); await tick();
  assert.equal(st.timers.filter(t => t.ms === 9000 && t.vivo).length, 0); // guarda retirada
  env.beat(); assert.equal(st.fetches.length, 3);                 // libre tras responder
});

test('un vídeo de fondo congelado a mitad (currentTime quieto sin ended ni error) ya no deja el LED parado: a los 4 s play() y a los 8 s pasa a la siguiente', () => {
  assert.match(html, /var vigiaT = -1, vigiaQuieto = 0;/);
  assert.match(html, /setInterval\(vigilaVideo, 1000\);/);
  assert.match(html, /media = null; mediaOk = false; vigiaT = -1; vigiaQuieto = 0;/);
  const ini = html.indexOf('  function siguiente() {');
  const fin = html.indexOf('\n  setInterval(vigilaVideo, 1000);', ini);
  assert.ok(ini > 0 && fin > ini);
  const st = { timers: [], creados: [] };
  const env = new Function('st', `
    var mudo = true, negro = false, mediaTimer = null, media = null, mediaOk = false, idx = -1, fallos = 0;
    var lista = [{ assetType: "video", asset: "https://x/a.mp4", seconds: 30 }, { assetType: "video", asset: "https://x/b.mp4", seconds: 30 }];
    function falla() { st.fallas = (st.fallas || 0) + 1; }
    function setTimeout(f, ms) { st.timers.push({ f: f, ms: ms, vivo: true }); return st.timers.length; }
    function clearTimeout(id) { if (id && st.timers[id - 1]) st.timers[id - 1].vivo = false; }
    var document = { createElement: function (tag) { var el = { tagName: tag.toUpperCase(), currentTime: 0, ended: false, plays: 0,
      play: function () { this.plays++; return Promise.resolve(); }, pause: function () {}, removeAttribute: function () {}, load: function () {} }; st.creados.push(el); return el; } };
    ${html.slice(ini, fin)}
    return { siguiente: siguiente, vigila: vigilaVideo, estado: function () { return { media: media, mediaOk: mediaOk, idx: idx }; } };`)(st);
  env.siguiente();
  const a = env.estado().media; assert.equal(a.src, 'https://x/a.mp4');
  for (let k = 0; k < 10; k++) env.vigila();                    // aún sin canplay: no se vigila (lo cubre la guarda de duración)
  assert.equal(env.estado().idx, 0);
  a.oncanplay(); assert.equal(a.plays, 1);
  for (let k = 1; k <= 5; k++) { a.currentTime = k; env.vigila(); } // avanza: todo bien
  assert.equal(env.estado().idx, 0);
  env.vigila(); env.vigila(); env.vigila(); env.vigila();       // 4 s quieto: se le da un play()
  assert.equal(a.plays, 2); assert.equal(env.estado().idx, 0);
  a.currentTime = 6; env.vigila();                               // el play() lo despierta: vuelve a contar desde cero
  for (let k = 0; k < 7; k++) env.vigila();
  assert.equal(env.estado().idx, 0);
  env.vigila();                                                  // 8 s quieto: a la siguiente pieza
  assert.equal(env.estado().idx, 1);
  assert.equal(env.estado().media.src, 'https://x/b.mp4');
  assert.equal(env.estado().mediaOk, false);
  const b = env.estado().media; b.oncanplay();
  b.ended = true; for (let k = 0; k < 12; k++) env.vigila();     // terminado: lo resuelve onended, el vigilante no salta
  assert.equal(env.estado().idx, 1);
  assert.equal(st.fallas || 0, 0);
});

test('al volver a ser visible (TCL sale de reposo) se pone al día sin mando y, oculta, el vigilante no salta piezas pausadas por el navegador', () => {
  assert.match(html, /if \(typeof document !== "undefined" && document\.visibilityState === "hidden"\) \{ vigiaT = -1; vigiaQuieto = 0; return; \}/);
  assert.match(html, /function vuelveVisible\(\) \{\n    if \(document\.visibilityState !== "visible"\) return;/);
  assert.match(html, /media\.paused && !media\.ended\) \{ var pr = media\.play\(\);/);
  assert.match(html, /vuelveRed\(\); leeVersion\(\); beat\(\);/);
  assert.match(html, /document\.addEventListener\("visibilitychange", vuelveVisible\);/);
  // el vigilante, con la página oculta, no cuenta segundos quietos
  const ini = html.indexOf('  var vigiaT = -1, vigiaQuieto = 0;'), fin = html.indexOf('  setInterval(vigilaVideo, 1000);');
  const st = { saltos: 0 };
  const env = new Function('st', `
    var media = { tagName: "VIDEO", currentTime: 3, ended: false, play: function () {} }, mediaOk = true;
    var document = { visibilityState: "hidden" };
    function siguiente() { st.saltos++; }
    ${html.slice(ini, fin)}
    return { vigila: vigilaVideo, ver: function (v) { document.visibilityState = v; } };`)(st);
  for (let k = 0; k < 20; k++) env.vigila();
  assert.equal(st.saltos, 0);
  env.ver('visible'); for (let k = 0; k < 9; k++) env.vigila();  // visible y de verdad quieto 8 s: sí salta
  assert.equal(st.saltos, 1);
});

test('una pieza abandonada (imagen colgada que carga tarde, vídeo ya emitido) no manda sobre la siguiente: se le quitan los manejadores y se corta su descarga', () => {
  assert.match(html, /function suelta\(m\) \{/);
  assert.match(html, /suelta\(media\); media = null; mediaOk = false; fallos = 0;/);
  assert.match(html, /mediaTimer = null; \}\n    suelta\(media\);\n    media = null;/);
  const ini = html.indexOf('\n  function falla() {\n    fallos++;');
  const fin = html.indexOf('\n  setInterval(vigilaVideo, 1000);', ini);
  assert.ok(ini > 0 && fin > ini);
  const st = { timers: [], creados: [] };
  const env = new Function('st', `
    var mudo = true, negro = false, mediaTimer = null, media = null, mediaOk = false, idx = -1, fallos = 0;
    var lista = [{ assetType: "image", asset: "https://cuelga/a.png", seconds: 10 }, { assetType: "video", asset: "https://x/b.mp4", seconds: 30 }];
    function setTimeout(f, ms) { st.timers.push({ f: f, ms: ms, vivo: true }); return st.timers.length; }
    function clearTimeout(id) { if (id && st.timers[id - 1]) st.timers[id - 1].vivo = false; }
    var document = { createElement: function (tag) { var el = { tagName: tag.toUpperCase(), currentTime: 0, ended: false, cargas: 0, pausas: 0,
      play: function () { return Promise.resolve(); }, pause: function () { this.pausas++; }, load: function () { this.cargas++; },
      removeAttribute: function (a) { if (a === "src") this.src = ""; } }; st.creados.push(el); return el; } };
    ${html.slice(ini, fin)}
    return { siguiente: siguiente, falla: falla, estado: function () { return { media: media, mediaOk: mediaOk, idx: idx, fallos: fallos }; } };`)(st);
  const vivos = () => st.timers.filter(t => t.vivo);
  env.siguiente();
  const a = env.estado().media; assert.equal(a.tagName, 'IMG'); assert.equal(a.src, 'https://cuelga/a.png');
  vivos().find(t => t.ms === 20000).f();                          // la imagen se cuelga: a los 20 s cuenta como fallo y pasa al vídeo
  const b = env.estado().media; assert.equal(b.tagName, 'VIDEO'); assert.equal(env.estado().idx, 1);
  assert.equal(a.src, '', 'la imagen abandonada deja de descargarse');
  assert.equal(a.onload, null); assert.equal(a.onerror, null);
  b.oncanplay();
  const guardaB = vivos().find(t => t.ms === 38000); assert.ok(guardaB); // guarda de duración del vídeo en curso (30 + 8 s)
  if (a.onload) a.onload();                                       // la imagen colgada «carga» tarde: no recorta el vídeo
  assert.ok(guardaB.vivo); assert.equal(vivos().filter(t => t.ms === 10000).length, 0);
  assert.equal(env.estado().media, b); assert.equal(env.estado().mediaOk, true);
  b.onended();                                                     // termina el vídeo: vuelve a la imagen
  assert.equal(b.src, ''); assert.equal(b.pausas, 1); assert.equal(b.cargas, 1); // decodificador liberado
  assert.equal(b.onended, null); assert.equal(b.oncanplay, null); assert.equal(b.onerror, null);
  // sin red: todas fallan seguidas y queda la espera de 30 s; un error tardío de la abandonada no la acorta
  const c = env.estado().media; c.onerror();                       // fallo 1 de 2: pasa a la siguiente
  const d = env.estado().media; d.onerror();                       // fallo 2 de 2: espera de 30 s
  assert.equal(env.estado().media, null);
  const espera = vivos().find(t => t.ms === 30000); assert.ok(espera);
  assert.equal(d.onerror, null); assert.equal(d.src, '');
  if (d.onerror) d.onerror(); if (c.onload) c.onload();
  assert.ok(espera.vivo); assert.equal(env.estado().media, null);
});

test('una lectura de /version.json colgada no apila conexiones con admira.tv: una sola a la vez, guarda de 15 s que aborta y una respuesta tardía no recarga ni libera a la siguiente', async () => {
  assert.match(html, /var versionBusy = false, versionVuelta = 0; \/\/ una sola lectura de \/version\.json a la vez/);
  assert.match(html, /if \(versionBusy\) return;\n    versionBusy = true;/);
  assert.match(html, /fetch\("\/version\.json", \{ cache: "no-store", signal: ctl \? ctl\.signal : undefined \}\)/);
  const ini = html.indexOf('  var versionBusy = false');
  const fin = html.indexOf('\n  }\n', html.indexOf('function leeVersion()', ini)) + 4;
  assert.ok(ini > 0 && fin > ini);
  const st = { fetches: [], timers: [], aborts: 0, recargas: 0 };
  const env = new Function('st', `
    var version = "v1", location = { reload: function () { st.recargas++; } };
    function horaMadrid() { return "12:00"; } function refrescoNocturno() { return false; }
    function setTimeout(f, ms) { st.timers.push({ f: f, ms: ms, vivo: true }); return st.timers.length; }
    function clearTimeout(id) { if (id && st.timers[id - 1]) st.timers[id - 1].vivo = false; }
    function AbortController() { this.signal = {}; this.abort = function () { st.aborts++; }; }
    function fetch(url, o) { return new Promise(function (res, rej) { st.fetches.push({ url: url, res: res, rej: rej, signal: o.signal }); }); }
    ${html.slice(ini, fin)}
    return { lee: leeVersion, ver: function () { return version; } };`)(st);
  const tick = () => new Promise(r => setImmediate(r));
  const resp = (v) => ({ ok: true, json: () => Promise.resolve({ version: v }) });
  env.lee(); env.lee(); env.lee();
  assert.equal(st.fetches.length, 1);                              // colgada: no se apilan otras lecturas
  assert.ok(st.fetches[0].signal);
  assert.match(st.fetches[0].url, /version\.json/);
  const g = st.timers.find(t => t.ms === 15000 && t.vivo); assert.ok(g);
  g.f();                                                             // pasan 15 s sin respuesta
  assert.equal(st.aborts, 1);
  env.lee(); assert.equal(st.fetches.length, 2);                    // la siguiente lectura sale
  st.fetches[0].res(resp('v2')); await tick(); await tick();        // respuesta tardía de la abandonada
  assert.equal(st.recargas, 0);                                      // no recarga por una lectura abandonada
  env.lee(); assert.equal(st.fetches.length, 2);                    // ni libera a la que está en curso
  st.fetches[1].res(resp('v1')); await tick(); await tick();
  assert.equal(st.timers.filter(t => t.ms === 15000 && t.vivo).length, 0); // guarda retirada
  assert.equal(env.ver(), 'v1'); assert.equal(st.recargas, 0);
  env.lee(); assert.equal(st.fetches.length, 3);                    // libre tras responder
  st.fetches[2].rej(new Error('sin red')); await tick();
  env.lee(); assert.equal(st.fetches.length, 4);                    // un error de red también libera
  st.fetches[3].res(resp('v3')); await tick(); await tick();
  assert.equal(st.recargas, 1);                                      // un deploy de verdad sigue recargando
});

test('un acuse colgado de /locations/cmd/ack no para el mando: guarda de 5 s que aborta y deja seguir la cadena de órdenes', async () => {
  assert.match(html, /body: body, signal: ctl \? ctl\.signal : undefined \}\)\.then\(listo, listo\);/);
  const ini = html.indexOf('  function acusa(');
  const fin = html.indexOf('\n  }\n', ini) + 4;
  assert.ok(ini > 0 && fin > ini);
  const st = { fetches: [], timers: [], aborts: 0 };
  const acusa = new Function('st', `
    var SCREEN = "creel", COLA = "creel", CMD_HOSTS = ["https://a/locations/cmd"], cmdHost = 0;
    function setTimeout(f, ms) { st.timers.push({ f: f, ms: ms, vivo: true }); return st.timers.length; }
    function clearTimeout(id) { if (id && st.timers[id - 1]) st.timers[id - 1].vivo = false; }
    function AbortController() { this.signal = {}; this.abort = function () { st.aborts++; }; }
    function fetch(url, o) { return new Promise(function (res, rej) { st.fetches.push({ url: url, res: res, rej: rej, signal: o.signal }); }); }
    ${html.slice(ini, fin)}
    return acusa;`)(st);
  const tick = () => new Promise(r => setImmediate(r));
  // acuse colgado: a los 5 s aborta y la promesa se resuelve
  let hecho = false;
  acusa({ cid: 1, action: 'reload' }, 'ok').then(() => { hecho = true; });
  assert.equal(st.fetches.length, 1); assert.match(st.fetches[0].url, /\/ack$/); assert.ok(st.fetches[0].signal);
  await tick(); assert.equal(hecho, false);
  const g = st.timers.find(t => t.ms === 5000 && t.vivo); assert.ok(g);
  g.f(); await tick();
  assert.equal(hecho, true); assert.equal(st.aborts, 1);
  // acuse que responde: se resuelve y la guarda se apaga sin abortar
  let ok = false;
  acusa({ cid: 2, action: 'next' }, 'ok').then(() => { ok = true; });
  st.fetches[1].res({ ok: true }); await tick();
  assert.equal(ok, true); assert.equal(st.timers[1].vivo, false); assert.equal(st.aborts, 1);
  // error de red: también sigue
  let err = false;
  acusa({ cid: 3, action: 'next' }, 'ok').then(() => { err = true; });
  st.fetches[2].rej(new Error('sin red')); await tick();
  assert.equal(err, true);
});

test('corte de red largo con la TCL encendida: pasadas 6 h sin lectura buena, el HUD vuelve a «— °C» y «CLIMA —» (no se queda con el clima de ayer)', () => {
  assert.match(html, /var CLIMA_MAX = 6 \* 3600 \* 1000;/);
  assert.match(html, /function fail\(\) \{ fin\(\); clima\.ok = false; caducaClima\(\);/);
  assert.match(html, /clima\.ok = true;\n        clima\.t = Date\.now\(\);/);
  const ini = html.indexOf('  var CLIMA_MAX');
  const fin = html.indexOf('\n', html.indexOf('function caducaClima', ini));
  const mk = (clima, ahora) => new Function('clima', 'Date', html.slice(ini, fin) + '; caducaClima(); return clima;')(clima, { now: () => ahora });
  const H = 3600 * 1000, t0 = 1e12;
  assert.deepEqual(mk({ temp: 18, real: 'sol', t: t0 }, t0 + 5 * H), { temp: 18, real: 'sol', t: t0 });     // 5 h: conserva
  assert.deepEqual(mk({ temp: 18, real: 'sol', t: t0 }, t0 + 6 * H), { temp: null, real: null, t: 0 });   // 6 h: caduca
  assert.deepEqual(mk({ temp: null, real: null, t: 0 }, t0 + 9 * H), { temp: null, real: null, t: 0 });   // sin dato: nada
});

test('diagnóstico remoto: los errores JS se cuentan y el latido lleva cuántos, el último (≤120 caracteres) y los minutos encendida', () => {
  assert.match(html, /window\.addEventListener\("error", function \(ev\) \{ anota\(ev && \(ev\.error \|\| ev\.message\)\); \}\);/);
  assert.match(html, /window\.addEventListener\("unhandledrejection", function \(ev\) \{ anota\(ev && ev\.reason\); \}\);/);
  assert.match(html, /errores: diag\.errores, ultimoError: diag\.ultimo, encendidaMin: Math\.round\(\(Date\.now\(\) - arranque\) \/ 60000\)/);
  assert.match(html, /catch \(e\) \{ fallosPinta\+\+; if \(fallosPinta === 1\) anota\(e\);/); // un fotograma roto cuenta una vez por racha, no 60 por segundo
  const ini = html.indexOf('  var diag = ');
  const fin = html.indexOf('  window.addEventListener("error"', ini);
  const diag = new Function(html.slice(ini, fin) + '; anota(new Error("x is not a function")); anota({ reason: new Error("fallo de red") }); anota("Script error."); anota(null); anota({ message: "z".repeat(300) }); return diag;')();
  assert.equal(diag.errores, 5);
  assert.equal(diag.ultimo, "z".repeat(120));
  const d2 = new Function(html.slice(ini, fin) + '; anota({ reason: new Error("fallo de red") }); return diag;')();
  assert.equal(d2.ultimo, "fallo de red");
});

test('fotogramas por segundo: el latido lleva los fps medios desde el latido anterior y qué fondo emite, para ver sin ir a la tele si el LED va a saltos o congelado', () => {
  assert.match(html, /try \{ pinta\(t \|\| Date\.now\(\)\); fallosPinta = 0; fotogramas\+\+; \}/); // solo cuentan los fotogramas pintados bien
  assert.match(html, /fps: fpsAhora\(Date\.now\(\)\), memoriaMB: memoriaMB\(\), fondo: fondoLatido\(\), intro: !!\(intro && intro\.on\), pantallaFija: pantallaFija\(\), visible: teleVisible\(\), climaMin: climaMin\(\), mandoSeg: mandoSeg\(\), lista: listaOrigen\(\), listaMin: listaMin\(\), recarga: recargaPrevia \}/);
  const ini = html.indexOf('  var fotogramas = 0');
  const fin = html.indexOf('\n', html.indexOf('function fpsAhora', ini));
  const r = new Function('Date', html.slice(ini, fin) + '; var out = []; fotogramas += 600; out.push(fpsAhora(1e12 + 10000)); fotogramas += 150; out.push(fpsAhora(1e12 + 20000)); out.push(fpsAhora(1e12 + 30000)); out.push(fpsAhora(1e12 + 30000)); return out;')({ now: () => 1e12 });
  assert.deepEqual(r, [60, 15, 0, 0]); // fluido, a saltos, congelado y sin tiempo transcurrido (sin dividir por cero)
});

test('memoria del WebView: el latido lleva los MB de JS en uso (performance.memory) para ver una fuga antes de que cuelgue la TCL, y null sin romper si el WebView no lo da', () => {
  assert.match(html, /memoriaMB: memoriaMB\(\), fondo:/);
  const ini = html.indexOf('  function memoriaMB()');
  const fin = html.indexOf('\n', ini);
  assert.ok(ini > 0 && fin > ini);
  const f = (perf) => new Function('performance', html.slice(ini, fin) + '; return memoriaMB();')(perf);
  assert.equal(f({ memory: { usedJSHeapSize: 85 * 1048576 + 300000 } }), 85);
  assert.equal(f({}), null);                                  // WebView sin performance.memory
  assert.equal(f({ memory: { usedJSHeapSize: 0 } }), null);   // cifra vacía: no inventa 0 MB
  assert.equal(f({ get memory() { throw new Error('bloqueado'); } }), null); // no rompe el latido
  assert.equal(new Function(html.slice(ini, fin) + '; return memoriaMB();')(), null); // sin performance
});

test('pantalla fija: el latido dice si el Wake Lock está concedido ("si"), perdido ("no") o el WebView no lo tiene ("sin-api"), para saber sin ir a la tele si la TCL atenuará o saltará el salvapantallas', () => {
  assert.match(html, /memoriaMB: memoriaMB\(\), fondo: .*, pantallaFija: pantallaFija\(\), visible: teleVisible\(\), climaMin: climaMin\(\), mandoSeg: mandoSeg\(\), lista: listaOrigen\(\), listaMin: listaMin\(\), recarga: recargaPrevia \}/);
  const ini = html.indexOf('  function pantallaFija()');
  const fin = html.indexOf('\n', ini);
  assert.ok(ini > 0 && fin > ini);
  const f = (wakeLock, navigator) => new Function('wakeLock', 'navigator', html.slice(ini, fin) + '; return pantallaFija();')(wakeLock, navigator);
  assert.equal(f({ released: false }, { wakeLock: {} }), 'si');
  assert.equal(f(null, { wakeLock: {} }), 'no');       // API sí, pero sin concesión (perdido o denegado)
  assert.equal(f(null, {}), 'sin-api');                 // WebView viejo sin Screen Wake Lock
  assert.equal(f(null, { get wakeLock() { throw new Error('bloqueado'); } }), 'sin-api'); // no rompe el latido
  assert.equal(new Function('wakeLock', html.slice(ini, fin) + '; return pantallaFija();')(null), typeof navigator !== 'undefined' && navigator.wakeLock ? 'no' : 'sin-api');
});

test('tele visible: el latido dice si el LED está en primer plano ("si") o la TCL lo mandó al fondo ("no": otra entrada, app, menú o reposo), sin ir a la tele', () => {
  assert.match(html, /pantallaFija: pantallaFija\(\), visible: teleVisible\(\), climaMin: climaMin\(\), mandoSeg: mandoSeg\(\), lista: listaOrigen\(\), listaMin: listaMin\(\), recarga: recargaPrevia \}/);
  const ini = html.indexOf('  function teleVisible()');
  const fin = html.indexOf('\n', ini);
  assert.ok(ini > 0 && fin > ini);
  const f = (document) => new Function('document', html.slice(ini, fin) + '; return teleVisible();')(document);
  assert.equal(f({ visibilityState: 'visible' }), 'si');
  assert.equal(f({ visibilityState: 'hidden' }), 'no');
  assert.equal(f({}), '?');                                   // WebView sin Page Visibility
  assert.equal(f(undefined), '?');
  assert.equal(f({ get visibilityState() { throw new Error('bloqueado'); } }), '?'); // no rompe el latido
});

test('edad del clima: el latido lleva climaMin (minutos desde la última lectura buena de Open-Meteo, null sin lectura) para saber sin ir a la tele si el HUD pinta clima en directo, de caché o ninguno', () => {
  assert.match(html, /visible: teleVisible\(\), climaMin: climaMin\(\), mandoSeg: mandoSeg\(\), lista: listaOrigen\(\), listaMin: listaMin\(\), recarga: recargaPrevia \}/);
  const ini = html.indexOf('  function climaMin()');
  const fin = html.indexOf('\n', ini);
  assert.ok(ini > 0 && fin > ini);
  const f = (clima, now) => new Function('clima', 'Date', html.slice(ini, fin) + '; return climaMin();')(clima, { now: () => now });
  assert.equal(f({ t: 1e12 }, 1e12), 0);                        // lectura recién llegada
  assert.equal(f({ t: 1e12 }, 1e12 + 47 * 60000 + 20000), 47);  // de caché: 47 min
  assert.equal(f({ t: 0 }, 1e12), null);                        // sin lectura (o caducada a las 6 h)
  assert.equal(f({}, 1e12), null);
  assert.equal(f({ t: 1e12 + 60000 }, 1e12), null);             // reloj de la tele hacia atrás: no inventa edad negativa
  assert.equal(f({ get t() { throw new Error('bloqueado'); } }, 1e12), null); // no rompe el latido
  const caduca = html.slice(html.indexOf('  function caducaClima()'), html.indexOf('\n', html.indexOf('  function caducaClima()')));
  const c = new Function('Date', 'var CLIMA_MAX = 6 * 3600 * 1000, clima = { t: 1e12, temp: 19, real: "sol" }; ' + caduca + '; ' + html.slice(ini, fin) + '; caducaClima(); return climaMin();')({ now: () => 1e12 + 6 * 3600 * 1000 });
  assert.equal(c, null);                                        // pasadas 6 h el HUD vuelve a «— °C» y el latido dice null
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

test('pantalla en negro: el latido dice fondo "negro" si la apagaron desde admira.store (pantalla-off) e intro true/false, para distinguir sin ir a la tele un apagado ordenado de un fallo', () => {
  assert.match(html, /fondo: fondoLatido\(\), intro: !!\(intro && intro\.on\), pantallaFija/);
  const ini = html.indexOf('  function fondoLatido()'), fin = html.indexOf('\n', ini);
  const f = (env) => new Function('negro', 'pantallasOn', 'media', 'mediaOk', html.slice(ini, fin) + '; return fondoLatido();')(env.negro, env.on, env.media, env.ok);
  const video = { tagName: 'VIDEO' }, img = { tagName: 'IMG' };
  assert.equal(f({ negro: true, on: true, media: video, ok: true }), 'negro');   // pantalla-off: negro aunque el vídeo siga cargado
  assert.equal(f({ negro: false, on: false, media: video, ok: true }), 'apagado');
  assert.equal(f({ negro: false, on: true, media: video, ok: true }), 'video');
  assert.equal(f({ negro: false, on: true, media: img, ok: true }), 'imagen');
  assert.equal(f({ negro: false, on: true, media: null, ok: false }), 'rojo');
  assert.equal(f({ negro: false, on: true, media: { get tagName() { throw new Error('x'); } }, ok: true }), '?'); // no rompe el latido
});

test('mando sordo: el latido lleva mandoSeg, los segundos desde el último sondeo bueno de la cola de órdenes, para ver sin ir a la tele si la TCL no obedece al mando', () => {
  assert.match(html, /return; \/\/ respuesta tardía de un sondeo ya abandonado: no se ejecuta\n        cmdOkTs = Date\.now\(\);/); // solo cuenta una respuesta vigente
  assert.match(html, /climaMin: climaMin\(\), mandoSeg: mandoSeg\(\), lista: listaOrigen\(\), listaMin: listaMin\(\), recarga: recargaPrevia \}/);
  const ini = html.indexOf('  function mandoSeg()'), fin = html.indexOf('\n', ini);
  assert.ok(ini > 0);
  const f = (ts, now) => new Function('cmdOkTs', 'Date', html.slice(ini, fin) + '; return mandoSeg();')(ts, { now: () => now });
  assert.equal(f(0, 1e12), null);                 // aún no leyó la cola
  assert.equal(f(1e12, 1e12 + 1400), 1);          // sano
  assert.equal(f(1e12, 1e12 + 90000), 90);        // sordo hace minuto y medio
  assert.equal(f(1e12 + 5000, 1e12), null);       // reloj hacia atrás: no inventa
  assert.equal(new Function('cmdOkTs', 'Date', html.slice(ini, fin) + '; return mandoSeg();')(1, { now() { throw new Error('x'); } }), null); // no rompe el latido
});

test('lista caída: el latido dice si la playlist viene de la red, de la recordada o no hay, y los minutos desde la última lectura buena', () => {
  assert.match(html, /listaRecordada\(\); return; \}\n      listaOkTs = Date\.now\(\);/); // solo cuenta una respuesta vigente y válida
  assert.match(html, /mandoSeg: mandoSeg\(\), lista: listaOrigen\(\), listaMin: listaMin\(\), recarga: recargaPrevia \}/);
  const a = html.indexOf('  function listaOrigen()'), b = html.indexOf('\n', a);
  const c = html.indexOf('  function listaMin()'), d = html.indexOf('\n', c);
  assert.ok(a > 0 && c > 0);
  const o = (base, red) => new Function('listaBase', 'listaDeRed', html.slice(a, b) + '; return listaOrigen();')(base, red);
  assert.equal(o([], false), 'ninguna');
  assert.equal(o([1], true), 'red');
  assert.equal(o([1], false), 'recordada');
  assert.equal(o(null, true), null); // no rompe el latido
  const m = (ts, now) => new Function('listaOkTs', 'Date', html.slice(c, d) + '; return listaMin();')(ts, { now: () => now });
  assert.equal(m(0, 1e12), null);
  assert.equal(m(1e12, 1e12 + 59000), 0);
  assert.equal(m(1e12, 1e12 + 30 * 60000 + 5), 30);
  assert.equal(m(1e12 + 5000, 1e12), null);
  assert.equal(new Function('listaOkTs', 'Date', html.slice(c, d) + '; return listaMin();')(1, { now() { throw new Error('x'); } }), null);
});

test('motivo del arranque: el latido dice si la página se recargó sola (deploy, nocturno, pintura) o arrancó la TCL', () => {
  assert.match(html, /lista: listaOrigen\(\), listaMin: listaMin\(\), recarga: recargaPrevia \}/);
  assert.match(html, /localStorage\.setItem\(RECARGA_KEY, "deploy\|" \+ Date\.now\(\)\); \} catch \(e\) \{\} try \{ location\.reload\(\); \}/);
  assert.match(html, /localStorage\.setItem\(RECARGA_KEY, "nocturno\|" \+ Date\.now\(\)\); \} catch \(e\) \{\} try \{ location\.reload\(\); \}/);
  assert.match(html, /localStorage\.setItem\(RECARGA_KEY, "pintura\|" \+ Date\.now\(\)\); \} catch \(e2\) \{\} try \{ location\.reload\(\); \}/);
  const a = html.indexOf('  function leeRecarga('), b = html.indexOf('\n', a);
  assert.ok(a > 0);
  const f = new Function('RECARGA_KEY', html.slice(a, b) + '; return leeRecarga;')('creel-recarga');
  const ls = (v) => { const m = { 'creel-recarga': v }; return { m, getItem: k => m[k] ?? null, removeItem: k => { delete m[k]; } }; };
  const T = 1e12;
  let l = ls('deploy|' + (T - 5000)); assert.equal(f(l, T), 'deploy'); assert.equal(l.m['creel-recarga'], undefined); // se lee y se borra
  assert.equal(f(ls('nocturno|' + (T - 1000)), T), 'nocturno');
  assert.equal(f(ls('pintura|' + T), T), 'pintura');
  assert.equal(f(ls(undefined), T), 'arranque');                 // sin marca: arranque en frío
  assert.equal(f(ls('deploy|' + (T - 300000)), T), 'arranque');  // marca vieja (5 min): no cuenta
  assert.equal(f(ls('deploy|' + (T + 5000)), T), 'arranque');    // marca del futuro: no cuenta
  assert.equal(f(ls('<b>|' + T), T), 'arranque');                // motivo desconocido: no se repite
  assert.equal(f({ getItem() { throw new Error('x'); } }, T), null); // sin almacenamiento: nunca rompe
});

test('red de la TCL: el latido cuenta los cortes de wifi y da la calidad si el WebView la expone', () => {
  assert.match(html, /network: redLatido\(navigator\.onLine !== false, navigator\.connection, cortesRed, ultimoCorte, Date\.now\(\)\) \}/);
  assert.match(html, /addEventListener\("offline", function \(\) \{ cortesRed\+\+; ultimoCorte = Date\.now\(\); \}\)/);
  const a = html.indexOf('  function redLatido('), b = html.indexOf('\n', a);
  assert.ok(a > 0);
  const f = new Function(html.slice(a, b) + '; return redLatido;')();
  const T = 1e12;
  assert.deepEqual(f(true, undefined, 0, 0, T), { online: true, cortes: 0, corteMin: null });          // sin cortes ni connection
  assert.deepEqual(f(true, undefined, 2, T - 180000, T), { online: true, cortes: 2, corteMin: 3 });   // dos cortes, el último hace 3 min
  assert.deepEqual(f(false, { effectiveType: '4g', downlink: 9.5, rtt: 50 }, 1, T, T), { online: false, cortes: 1, corteMin: 0, tipo: '4g', mbps: 9.5, rttMs: 50 });
  assert.deepEqual(f(true, { downlink: NaN, rtt: 'x' }, 0, 0, T), { online: true, cortes: 0, corteMin: null }); // valores raros: fuera
  assert.equal(f(true, { get effectiveType() { throw new Error('x'); } }, 0, 0, T).online, true); // connection que lanza: nunca rompe
});

test('encaje en la TCL: el latido da la orientación real del visor y si es 16:9', () => {
  assert.match(html, /orientation: encajeTele\(innerWidth, innerHeight\)\.orientation, encaje: encajeTele\(innerWidth, innerHeight\)\.encaje \}/);
  assert.doesNotMatch(html, /orientation: "landscape" \}/);
  const a = html.indexOf('  function encajeTele('), b = html.indexOf('\n', a);
  assert.ok(a > 0);
  const f = new Function(html.slice(a, b) + '; return encajeTele;')();
  assert.deepEqual(f(1920, 1080), { orientation: 'landscape', encaje: '16:9' });
  assert.deepEqual(f(960, 540), { orientation: 'landscape', encaje: '16:9' });   // TCL con devicePixelRatio 2
  assert.deepEqual(f(1920, 1032), { orientation: 'landscape', encaje: 'otro' }); // barra de Android comiendo alto
  assert.deepEqual(f(1080, 1920), { orientation: 'portrait', encaje: 'otro' });
  assert.deepEqual(f(0, 1080), { orientation: '?', encaje: '?' });
  assert.deepEqual(f(undefined, NaN), { orientation: '?', encaje: '?' });
});

test('reloj de la TCL: el latido da el desfase en segundos frente a la cabecera Date de admira.tv', () => {
  assert.match(html, /timezone: zonaTele\(\), relojSeg: desfaseReloj \}/);
  assert.match(html, /relojDesfase\(r\.headers && r\.headers\.get\("Date"\), Date\.now\(\)\); if \(dr !== null\) desfaseReloj = dr;/);
  const a = html.indexOf('  function relojDesfase('), b = html.indexOf('\n', a);
  assert.ok(a > 0);
  const f = new Function(html.slice(a, b) + '; return relojDesfase;')();
  const T = Date.parse('Mon, 16 Nov 2026 00:20:00 GMT');
  assert.equal(f('Mon, 16 Nov 2026 00:20:00 GMT', T), 0);            // en hora
  assert.equal(f('Mon, 16 Nov 2026 00:20:00 GMT', T + 125400), 125);  // TCL adelantada ~2 min
  assert.equal(f('Mon, 16 Nov 2026 00:20:00 GMT', T - 3600000), -3600); // TCL atrasada 1 h
  assert.equal(f(null, T), null);                                     // sin cabecera
  assert.equal(f('basura', T), null);
  assert.equal(f('Mon, 16 Nov 2026 00:20:00 GMT', NaN), null);
});
