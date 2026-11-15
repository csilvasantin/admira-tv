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
  const ini = html.indexOf('function leeVersion()');
  assert.ok(ini > 0);
  const fin = html.indexOf('\n  }\n', ini) + 4;
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
    const loop = new Function('raf', 'pinta', 'navigator', 'location', src + '; return loop;')(f => cola.push(f), pinta, { onLine: online }, { reload: () => recargas++ });
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
      'var lista = st.lista, listaRev = null, listaNombre = "", idx = -1, fallos = 0, pantallasOn = true; function siguiente() { st.sig++; }' + src +
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
