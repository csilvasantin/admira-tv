// La Supercomputer: player de admira.tv en los 7 ventiladores UNI FAN TL LCD de METAHUMAN.
// Cada pantalla se pinta en un Chrome sin ventana a 400×400 y su screencast va por USB al
// ventilador. Modos (escena.mjs): independiente y repetir usan el canal de admira.tv tal cual;
// extender y sincro usan la página de escena del puente con un reloj común. La iluminación
// RGB va por el controlador UNI FAN TL. El gemelo (admira.store/supercomputer) manda la escena
// y la luz a través de la nube y recibe el estado y las miniaturas.
//   node player.mjs            → emite en los ventiladores
//   node player.mjs --dry-run  → solo renderiza (sin USB): ver /player/1.jpg
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SIDE, isJpeg, mergeConfig, planEscena, escenaDeConfig } from './core.mjs';
import { normalizarEscena, normalizarLuz, luzDe } from './escena.mjs';
import { launchChrome, Cdp, openPlayerPage } from './cdp.mjs';
import { Medios } from './medios.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const configPath = process.env.VENTILADORES_CONFIG || path.join(directory, 'config.json');
const dryRun = process.argv.includes('--dry-run');
const delay = ms => new Promise(r => setTimeout(r, ms));
const log = (state, extra = {}) => console.log(JSON.stringify({ at: new Date().toISOString(), state, ...extra }));

const cfg = mergeConfig(JSON.parse(await fs.readFile(configPath, 'utf8').catch(() => '{}')));
const datos = process.env.VENTILADORES_DATOS || path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'AdmiraVentiladores');
const profileRoot = path.join(datos, 'perfiles');
const estadoPath = path.join(datos, 'estado.json');
const medios = new Medios(path.join(datos, 'medios'));
const health = { state: 'starting', dryRun, circuit: cfg.circuit, players: [], fans: [] };
let stopping = false, fans = [], players = [], controlador = null, estado = null;
let nube = { activa: !!cfg.nube?.api, ok: null, at: 0, error: '' };
const luzAplicada = new Map();

// ── Estado deseado: escena + luz ───────────────────────────────────────────────
// Manda el más reciente entre estado.json (lo último que llegó del gemelo o de la API local)
// y config.json (editarlo a mano también cuenta: su fecha es su revisión).
const numFans = () => fans.length || 7;
async function estadoInicial() {
  const guardado = await fs.readFile(estadoPath, 'utf8').then(JSON.parse).catch(() => null);
  const stat = await fs.stat(configPath).catch(() => null);
  const desdeConfig = { escena: escenaDeConfig(cfg), luz: cfg.luz, revision: Math.round(stat?.mtimeMs || 0), origen: 'config.json' };
  return guardado && guardado.revision >= desdeConfig.revision ? guardado : desdeConfig;
}

// Los cambios van en fila: el gemelo y la API local pueden pedir a la vez.
let colaEstado = Promise.resolve();
function aplicar(nuevo, origen) {
  const p = colaEstado.then(() => aplicarYa(nuevo, origen));
  colaEstado = p.catch(e => log('escena_error', { origen, error: String(e.message || e) }));
  return p;
}
async function aplicarYa(nuevo, origen) {
  const escena = normalizarEscena(nuevo.escena ?? estado?.escena ?? { modo: 'independiente' }, numFans());
  const luz = nuevo.luz === undefined ? (estado?.luz ?? null) : (nuevo.luz ? normalizarLuz(nuevo.luz) : null);
  if (['extender', 'sincro'].includes(escena.modo)) {
    if (!escena.piezas.length) throw new Error(`${escena.modo} necesita al menos una pieza`);
    if (!escena.epoch) escena.epoch = Date.now();
    await Promise.all(escena.piezas.map(id => medios.asegurar(id)));   // sin hueco negro al cambiar
  }
  estado = { escena, luz, revision: Number(nuevo.revision) || Date.now(), origen, at: Date.now() };
  await fs.mkdir(datos, { recursive: true });
  await fs.writeFile(estadoPath, JSON.stringify(estado, null, 2));
  log('escena', { origen, modo: escena.modo, piezas: escena.piezas, luz: luz?.efecto ?? null, revision: estado.revision });
  if (health.state === 'emitting') await sincronizarPlayers();
  luzAplicada.clear();
  await aplicarLuz();
  return estado;
}

// ── HTTP local (127.0.0.1): salud, API de escena/luz y lo que necesitan las páginas de escena ──
const ESTATICOS = { '/escena.html': 'text/html; charset=utf-8', '/escena.mjs': 'text/javascript; charset=utf-8' };
const leerCuerpo = req => new Promise((ok, ko) => {
  let s = ''; req.on('data', c => { s += c; if (s.length > 1e6) req.destroy(); });
  req.on('end', () => { try { ok(JSON.parse(s || '{}')); } catch (e) { ko(e); } }); req.on('error', ko);
});
const json = (res, v, status = 200) => { res.statusCode = status; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(v, null, 2)); };

function informe() {
  return {
    maquina: cfg.machine, version: cfg.userAgentToken, at: Date.now(), dryRun, state: health.state,
    escena: estado?.escena, luz: estado?.luz, revision: estado?.revision ?? 0, origen: estado?.origen,
    players: players.map(p => ({ screen: p.screen, fans: p.fans, fps: p.fps, frames: p.frames })),
    fans: (fans.length ? fans : players.flatMap(p => p.fans.map(n => ({ n })))).map(f => ({
      n: f.n, port: f.port, index: f.index, rpm: f.rpm, sent: f.sent, errors: f.errors,
      fps: players.find(p => p.fans.includes(f.n))?.fps ?? 0 }))
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  try {
    const m = /^\/(player|fan)\/(\d+)\.jpg$/.exec(url.pathname);
    if (m) {
      const n = Number(m[2]);
      const jpeg = m[1] === 'player' ? players[n - 1]?.last : (fans.find(f => f.n === n)?.last ?? players.find(p => p.fans.includes(n))?.last);
      if (!jpeg) { res.statusCode = 404; return res.end(); }
      res.setHeader('content-type', 'image/jpeg');
      return res.end(jpeg);
    }
    if (url.pathname.startsWith('/media/')) return medios.servir(url.pathname.slice(7), req, res);
    if (ESTATICOS[url.pathname]) {
      res.setHeader('content-type', ESTATICOS[url.pathname]); res.setHeader('cache-control', 'no-store');
      return res.end(await fs.readFile(path.join(directory, url.pathname.slice(1))));
    }
    if (url.pathname === '/escena.json') {
      const piezas = estado?.escena?.piezas ?? [];
      const lista = await Promise.all(piezas.map(async id => [id, await medios.asegurar(id).catch(() => null)]));
      return json(res, { escena: estado?.escena, medios: Object.fromEntries(lista.filter(([, m]) => m)) });
    }
    if (url.pathname === '/estado') return json(res, { estado, informe: informe(), nube });
    if (req.method === 'POST' && (url.pathname === '/escena' || url.pathname === '/luz')) {
      const cuerpo = await leerCuerpo(req);
      const nuevo = url.pathname === '/escena' ? { escena: cuerpo } : { luz: cuerpo };
      return json(res, { ok: true, estado: await aplicar(nuevo, 'local') });
    }
    if (url.pathname !== '/health') return json(res, { error: 'not found' }, 404);
    health.modo = estado?.escena?.modo;
    health.players = players.map((p, i) => ({ n: i + 1, screen: p.screen, fans: p.fans, frames: p.frames, fps: p.fps, lastFrameAgoMs: p.lastAt ? Date.now() - p.lastAt : null }));
    health.fans = fans.map(f => ({ n: f.n, port: f.port, index: f.index, rpm: f.rpm, sent: f.sent, errors: f.errors, lastError: f.lastError || undefined }));
    health.nube = nube;
    return json(res, health);
  } catch (e) {
    return json(res, { ok: false, error: String(e.message || e) }, 400);
  }
});
// Puerto ocupado = ya hay otro player: dos emitiendo a los mismos ventiladores se pisarían.
server.on('error', e => {
  log('health_port_error', { port: cfg.healthPort, error: e.code || e.message });
  if (e.code === 'EADDRINUSE') process.exit(1);
});
server.listen(cfg.healthPort, '127.0.0.1');

// ── Fotogramas → ventiladores ──────────────────────────────────────────────────
// Cada ventilador recibe siempre el fotograma más reciente, a como mucho cfg.fps;
// si el canal no cambia (imagen fija) se reenvía el último cada 2 s para que no caduque.
function pump(fan) {
  if (fan.busy || stopping) return;
  const now = Date.now(), gap = 1000 / cfg.fps;
  const fresh = fan.pending && fan.pending !== fan.last;
  const stale = fan.last && now - fan.sentAt > 2000;
  if (!fresh && !stale) return;
  if (now - fan.sentAt < gap) { clearTimeout(fan.timer); fan.timer = setTimeout(() => pump(fan), gap - (now - fan.sentAt)); return; }
  const jpeg = fresh ? fan.pending : fan.last;
  fan.sentAt = now; fan.last = jpeg;
  fan.frame(jpeg).catch(() => {}).finally(() => setImmediate(() => pump(fan)));
}

function deliver(player, jpeg) {
  if (!isJpeg(jpeg) || !players.includes(player)) return;
  player.last = jpeg; player.lastAt = Date.now(); player.frames++; player.window++;
  for (const n of player.fans) {
    const fan = fans.find(f => f.n === n);
    if (fan) { fan.pending = jpeg; pump(fan); }
  }
}

// ── Chrome por player ──────────────────────────────────────────────────────────
async function userAgent(cdp) {
  const { userAgent: ua } = await cdp.send('Browser.getVersion');
  return `${ua.replace('HeadlessChrome', 'Chrome')} ${cfg.userAgentToken}`;
}

// Un Chrome por player, cada uno con su perfil. En headless solo pinta la ventana activa de
// cada navegador: con 7 ventanas en un mismo Chrome, el screencast de las 6 de detrás se callaba.
async function startPlayer(p) {
  p.chrome = await launchChrome(cfg.chrome, path.join(profileRoot, p.screen));
  p.cdp = await Cdp.connect(p.chrome.ws);
  p.page = await openPlayerPage(p.cdp, { url: p.url, side: SIDE, quality: cfg.quality, userAgent: await userAgent(p.cdp) });
  p.cdp.on((method, params, sessionId) => {
    if (sessionId !== p.page.sessionId) return;
    if (method === 'Page.screencastFrame') {
      p.page.ack(params.sessionId).catch(() => {});
      deliver(p, Buffer.from(params.data, 'base64'));
    } else if (method === 'Inspector.targetCrashed') {
      log('page_crashed', { screen: p.screen });
      p.page.reload().catch(() => {});
    } else if (method === 'Page.frameNavigated' && !params.frame.parentId) {
      p.page.startScreencast().catch(() => {});
    }
  });
  log('player_started', { screen: p.screen, fans: p.fans, url: p.url });
}

async function cerrarPlayer(p) {
  await p.page?.close();
  if (p.cdp && !p.cdp.closed) await Promise.race([p.cdp.send('Browser.close').catch(() => {}), delay(2000)]);
  p.cdp?.close(); p.chrome?.child.kill();
}

// Ajusta los Chrome al plan de la escena: los que no cambian siguen (las páginas de escena
// leen /escena.json cada segundo), los que sobran se cierran y los nuevos se abren.
async function sincronizarPlayers() {
  const plan = planEscena(estado.escena, fans.length ? fans : Array.from({ length: 7 }, (_, i) => ({ n: i + 1 })), cfg);
  const clave = p => `${p.screen} ${p.url} ${p.fans.join(',')}`;
  const quedan = players.filter(p => plan.some(q => clave(q) === p.clave));
  const salen = players.filter(p => !quedan.includes(p));
  const entran = plan.filter(q => !quedan.some(p => p.clave === clave(q)))
    .map(q => ({ ...q, clave: clave(q), frames: 0, window: 0, fps: 0, last: null, lastAt: 0, chrome: null, cdp: null, page: null, mini: null }));
  players = [...quedan, ...entran].sort((a, b) => a.fans[0] - b.fans[0]);
  await Promise.all(salen.map(cerrarPlayer));
  await Promise.all(entran.map(startPlayer));
}

// ── Iluminación ────────────────────────────────────────────────────────────────
// Solo se envía lo que cambia; con «la luz sigue al vídeo» en sincro se revisa cada 250 ms.
async function aplicarLuz() {
  if (!controlador || !estado?.luz || !fans.length) return;
  const ahora = Date.now(), respirar = new Map();
  for (const f of fans) {
    const l = luzDe(estado.luz, f.n, estado.escena, ahora), k = JSON.stringify(l);
    if (luzAplicada.get(f.n) === k) continue;
    luzAplicada.set(f.n, k);
    if (l.efecto === 'respirar') respirar.set(f.port, l);   // efecto de grupo: todo el puerto
    else await controlador.luzVentilador(f.port, f.index, l).catch(e => log('luz_error', { fan: f.n, error: e.message }));
  }
  for (const [port, l] of respirar) {
    await controlador.luzPuerto(port, fans.filter(f => f.port === port).length, l).catch(e => log('luz_error', { port, error: e.message }));
  }
}
setInterval(() => { if (estado?.luz?.sigueVideo && estado.escena.modo === 'sincro') aplicarLuz(); }, 250).unref();

// ── Nube: el gemelo de admira.store/supercomputer ──────────────────────────────
// Cada 3 s: informe + miniaturas → nube; la respuesta trae la escena y la luz deseadas.
async function claveNube() {
  if (cfg.nube?.clave) return cfg.nube.clave;
  const fichero = (cfg.nube?.claveFichero || '~/.admira_supercomputer_key').replace(/^~/, os.homedir());
  return (await fs.readFile(fichero, 'utf8')).trim();
}
let nubeOcupada = false;
async function tickNube() {
  if (!cfg.nube?.api || !estado || nubeOcupada) return;
  nubeOcupada = true;
  try {
    for (const p of players) p.mini = await p.page?.miniatura().catch(() => p.mini) ?? p.mini;
    const miniaturas = {};
    for (const p of players) for (const n of p.fans) if (p.mini) miniaturas[n] = p.mini.toString('base64');
    const r = await fetch(cfg.nube.api.replace(/\/$/, '') + '/maquina', {
      method: 'POST', signal: AbortSignal.timeout(8000),
      headers: { authorization: 'Bearer ' + await claveNube(), 'content-type': 'application/json' },
      body: JSON.stringify({ informe: informe(), miniaturas })
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    nube = { activa: true, ok: true, at: Date.now(), error: '' };
    if (d.deseado && Number(d.deseado.revision) > (estado.revision || 0)) await aplicar(d.deseado, 'gemelo');
  } catch (e) {
    if (nube.ok !== false) log('nube_error', { error: String(e.message || e) });
    nube = { ...nube, activa: true, ok: false, error: String(e.message || e) };
  } finally { nubeOcupada = false; }
}

// ── USB y bucle principal ──────────────────────────────────────────────────────
async function openUsb() {
  if (dryRun) return [];
  const { openFans, Controlador } = await import('./tl-lcd.mjs');
  const list = await openFans();
  for (const f of list) {
    f.pending = null; f.last = null; f.sentAt = 0; f.timer = null;
    const deg = cfg.rotation[String(f.n)];
    if (cfg.brightness !== null || deg !== undefined) {
      await f.settings(cfg.brightness ?? 80, deg ?? 0).catch(e => log('fan_settings_failed', { fan: f.n, error: e.message }));
    }
  }
  controlador = await Controlador.abrir().catch(() => null);
  log('fans_ready', { fans: list.map(f => ({ n: f.n, port: f.port, index: f.index })), controlador: !!controlador });
  return list;
}

async function watchRpm() {
  const list = await controlador?.rpm().catch(() => null);
  if (!list) return;
  for (const f of fans) f.rpm = list.find(r => r.port === f.port && r.index === f.index)?.rpm;
  const stopped = fans.filter(f => f.rpm === 0).map(f => f.n);
  if (stopped.length) log('fan_stopped', { fans: stopped });
}

// ARRANQUE EN FRÍO ATASCADO (canal r2 de 04-nov-2026): con ?ids= la pieza puede quedar en disco
// por un camino que no llama a maybeResumeCold(), y el canal se queda en «DESCARGANDO CONTENIDOS
// n/n · …» para siempre (visto en 4 de 7 ventiladores). Sin tocar el canal: si el placeholder dice
// que todo está descargado y no baja nada en dos lecturas seguidas, se recarga esa página, como
// haría la orden `hardreload`; al arrancar adopta la pieza de disco y emite. Como mucho 1/min.
const COLD_STUCK = `(() => { const s = document.getElementById('coldStat');
  if (!s || !document.querySelector('.coldload')) return null;
  const m = /^(\\d+)\\/(\\d+) · …$/.exec(s.textContent || '');
  return m && +m[1] > 0 && m[1] === m[2] ? s.textContent : null; })()`;
async function unstickCold(p) {
  if (!p.page || !p.url.includes('canal.html')) return;
  const stuck = await p.page.evaluate(COLD_STUCK).catch(() => null);
  if (!stuck) { p.coldSeen = 0; return; }
  if (++p.coldSeen < 2 || Date.now() - (p.coldReloadAt || 0) < 60000) return;
  p.coldSeen = 0; p.coldReloadAt = Date.now();
  log('cold_stuck_reload', { screen: p.screen, stat: stuck });
  await p.page.reload().catch(() => {});
}

async function run() {
  fans = await openUsb();
  if (!dryRun && !fans.length) throw new Error('no se encontró ningún ventilador TL LCD');
  estado = estado ?? await estadoInicial();
  await aplicarYa(estado, estado.origen || 'config.json').catch(async e => {
    log('escena_error', { origen: 'arranque', error: String(e.message || e) });
    await aplicarYa({ escena: { modo: 'independiente' }, luz: estado?.luz }, 'respaldo');
  });
  await sincronizarPlayers();
  health.state = 'emitting';
  // Medida de fps y respaldo: si el screencast se calla 4 s, una captura refresca el fotograma.
  // Cada 10 s se leen las RPM: sin L-Connect nadie más vigila que los ventiladores giren.
  for (let tick = 0; !stopping && players.every(p => !p.cdp || !p.cdp.closed); tick++) {
    await delay(1000);
    for (const p of players) {
      p.fps = p.window; p.window = 0;
      if (p.page && Date.now() - p.lastAt > 4000) p.page.screenshot().then(j => deliver(p, j)).catch(() => {});
    }
    if (tick % 5 === 0) await Promise.all(players.map(unstickCold));
    if (!dryRun && tick % 10 === 0) await watchRpm();
    if (tick % 3 === 0) tickNube();
  }
  const lost = players.filter(p => p.cdp?.closed).map(p => p.screen);
  if (lost.length) log('chrome_lost', { screens: lost });
}

async function closeAll() {
  await Promise.all(players.map(cerrarPlayer));
  for (const f of fans) f.close();
  controlador?.close(); controlador = null;
}

async function shutdown() {
  stopping = true; health.state = 'stopping';
  await closeAll();
  server.close();
}
// Recarga en caliente: si cambia config.json o el código, el player sale y arrancar.ps1 lo relanza.
// Así cambiar los vídeos de los ventiladores no exige reiniciar la tarea (que pide elevación).
const watched = [configPath, ...['core.mjs', 'player.mjs', 'cdp.mjs', 'tl-lcd.mjs', 'escena.mjs', 'medios.mjs'].map(f => path.join(directory, f))];
const stamp = async f => (await fs.stat(f).catch(() => null))?.mtimeMs ?? 0;
const stamps = await Promise.all(watched.map(stamp));
setInterval(async () => {
  for (const [i, f] of watched.entries()) {
    if (stopping || (await stamp(f)) === stamps[i]) continue;
    log('reload', { file: path.basename(f) });
    await shutdown(); process.exit(0);
  }
}, 3000).unref();

process.on('SIGINT', () => { shutdown().then(() => process.exit(0)); });
process.on('SIGTERM', () => { shutdown().then(() => process.exit(0)); });

while (!stopping) {
  try { await run(); }
  catch (e) { health.state = 'error'; log('error', { error: String(e.message || e) }); }
  if (stopping) break;
  await closeAll();
  fans = []; players = []; health.state = 'restarting';
  log('restarting', { inSeconds: 5 });
  await delay(5000);
}
