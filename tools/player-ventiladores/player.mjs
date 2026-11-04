// Player de admira.tv en los ventiladores UNI FAN TL LCD de METAHUMAN.
// El canal (canal.html) corre tal cual en Chrome sin ventana a 400×400; cada fotograma
// del screencast se manda por USB a su ventilador. No se toca el código del canal.
//   node player.mjs            → emite en los ventiladores
//   node player.mjs --dry-run  → solo renderiza (sin USB): ver /player/1.jpg
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SIDE, isJpeg, mergeConfig, playersFor, canalUrl } from './core.mjs';
import { launchChrome, Cdp, openPlayerPage } from './cdp.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const configPath = process.env.VENTILADORES_CONFIG || path.join(directory, 'config.json');
const dryRun = process.argv.includes('--dry-run');
const delay = ms => new Promise(r => setTimeout(r, ms));
const log = (state, extra = {}) => console.log(JSON.stringify({ at: new Date().toISOString(), state, ...extra }));

const cfg = mergeConfig(JSON.parse(await fs.readFile(configPath, 'utf8').catch(() => '{}')));
const profileRoot = path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'AdmiraVentiladores', 'perfiles');
const health = { state: 'starting', dryRun, mode: cfg.mode, circuit: cfg.circuit, players: [], fans: [] };
let stopping = false, fans = [], players = [];

const server = http.createServer((req, res) => {
  const m = /^\/(player|fan)\/(\d+)\.jpg$/.exec(req.url || '');
  if (m) {
    const n = Number(m[2]);
    const jpeg = m[1] === 'player' ? players[n - 1]?.last : fans.find(f => f.n === n)?.last;
    if (!jpeg) { res.statusCode = 404; return res.end(); }
    res.setHeader('content-type', 'image/jpeg');
    return res.end(jpeg);
  }
  res.setHeader('content-type', 'application/json');
  if (req.url !== '/health') { res.statusCode = 404; return res.end('{"error":"not found"}'); }
  health.players = players.map((p, i) => ({ n: i + 1, screen: p.screen, fans: p.fans, ids: p.ids, frames: p.frames, fps: p.fps, lastFrameAgoMs: p.lastAt ? Date.now() - p.lastAt : null }));
  health.fans = fans.map(f => ({ n: f.n, port: f.port, index: f.index, rpm: f.rpm, sent: f.sent, errors: f.errors, lastError: f.lastError || undefined }));
  res.end(JSON.stringify(health, null, 2));
});
// Puerto ocupado = ya hay otro player: dos emitiendo a los mismos ventiladores se pisarían.
server.on('error', e => {
  log('health_port_error', { port: cfg.healthPort, error: e.code || e.message });
  if (e.code === 'EADDRINUSE') process.exit(1);
});
server.listen(cfg.healthPort, '127.0.0.1');

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
  if (!isJpeg(jpeg)) return;
  player.last = jpeg; player.lastAt = Date.now(); player.frames++; player.window++;
  for (const n of player.fans) {
    const fan = fans.find(f => f.n === n);
    if (fan) { fan.pending = jpeg; pump(fan); }
  }
}

async function userAgent(cdp) {
  const { userAgent: ua } = await cdp.send('Browser.getVersion');
  return `${ua.replace('HeadlessChrome', 'Chrome')} ${cfg.userAgentToken}`;
}

// Un Chrome por player, cada uno con su perfil. En headless solo pinta la ventana activa de
// cada navegador: con 7 ventanas en un mismo Chrome, el screencast de las 6 de detrás se callaba
// y solo llegaba la captura de respaldo cada 4 s (4-nov-2026).
async function startPlayer(p) {
  p.chrome = await launchChrome(cfg.chrome, path.join(profileRoot, p.screen));
  p.cdp = await Cdp.connect(p.chrome.ws);
  const url = canalUrl(cfg, p.screen, p.ids);
  p.page = await openPlayerPage(p.cdp, { url, side: SIDE, quality: cfg.quality, userAgent: await userAgent(p.cdp) });
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
  log('player_started', { screen: p.screen, fans: p.fans, url });
}

async function startPlayers() {
  const plan = playersFor(fans.length ? fans : Array.from({ length: 7 }, (_, i) => ({ n: i + 1 })), cfg);
  players = plan.map(p => ({ ...p, frames: 0, window: 0, fps: 0, last: null, lastAt: 0, chrome: null, cdp: null, page: null }));
  await Promise.all(players.map(startPlayer));
}

async function openUsb() {
  if (dryRun) return [];
  const { openFans } = await import('./tl-lcd.mjs');
  const list = await openFans();
  for (const f of list) {
    f.pending = null; f.last = null; f.sentAt = 0; f.timer = null;
    const deg = cfg.rotation[String(f.n)];
    if (cfg.brightness !== null || deg !== undefined) {
      await f.settings(cfg.brightness ?? 80, deg ?? 0).catch(e => log('fan_settings_failed', { fan: f.n, error: e.message }));
    }
  }
  log('fans_ready', { fans: list.map(f => ({ n: f.n, port: f.port, index: f.index })) });
  return list;
}

async function watchRpm() {
  const { readRpm } = await import('./tl-lcd.mjs');
  const list = await readRpm().catch(() => null);
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
  await startPlayers();
  health.state = 'emitting';
  // Medida de fps y respaldo: si el screencast se calla 4 s, una captura refresca el fotograma.
  // Cada 10 s se leen las RPM: sin L-Connect nadie más vigila que los ventiladores giren.
  for (let tick = 0; !stopping && players.every(p => !p.cdp.closed); tick++) {
    await delay(1000);
    for (const p of players) {
      p.fps = p.window; p.window = 0;
      if (Date.now() - p.lastAt > 4000) p.page.screenshot().then(j => deliver(p, j)).catch(() => {});
    }
    if (tick % 5 === 0) await Promise.all(players.map(unstickCold));
    if (!dryRun && tick % 10 === 0) await watchRpm();
  }
  const lost = players.filter(p => p.cdp.closed).map(p => p.screen);
  if (lost.length) log('chrome_lost', { screens: lost });
}

// Browser.close cierra el Chrome real aunque no sea el proceso que lanzamos.
async function closeAll() {
  await Promise.all(players.map(async p => {
    await p.page?.close();
    if (p.cdp && !p.cdp.closed) await Promise.race([p.cdp.send('Browser.close').catch(() => {}), delay(2000)]);
    p.cdp?.close(); p.chrome?.child.kill();
  }));
  for (const f of fans) f.close();
}

async function shutdown() {
  stopping = true; health.state = 'stopping';
  await closeAll();
  server.close();
}
// Recarga en caliente: si cambia config.json o el código, el player sale y arrancar.ps1 lo relanza.
// Así cambiar los vídeos de los ventiladores no exige reiniciar la tarea (que pide elevación).
const watched = [configPath, ...['core.mjs', 'player.mjs', 'cdp.mjs', 'tl-lcd.mjs'].map(f => path.join(directory, f))];
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
  fans = []; players = [];
  log('restarting', { inSeconds: 5 });
  await delay(5000);
}
