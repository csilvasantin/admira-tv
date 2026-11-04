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
const profileDir = path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'AdmiraVentiladores', 'chrome');
const health = { state: 'starting', dryRun, mode: cfg.mode, circuit: cfg.circuit, players: [], fans: [] };
let stopping = false, chrome = null, cdp = null, fans = [], players = [];

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
  health.players = players.map((p, i) => ({ n: i + 1, screen: p.screen, fans: p.fans, frames: p.frames, fps: p.fps, lastFrameAgoMs: p.lastAt ? Date.now() - p.lastAt : null }));
  health.fans = fans.map(f => ({ n: f.n, port: f.port, index: f.index, rpm: f.rpm, sent: f.sent, errors: f.errors, lastError: f.lastError || undefined }));
  res.end(JSON.stringify(health, null, 2));
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

async function userAgent() {
  const { userAgent: ua } = await cdp.send('Browser.getVersion');
  return `${ua.replace('HeadlessChrome', 'Chrome')} ${cfg.userAgentToken}`;
}

async function startPlayers() {
  const ua = await userAgent();
  const plan = playersFor(fans.length ? fans : Array.from({ length: 7 }, (_, i) => ({ n: i + 1 })), cfg);
  players = plan.map(p => ({ ...p, frames: 0, window: 0, fps: 0, last: null, lastAt: 0, page: null }));
  for (const p of players) {
    const url = canalUrl(cfg, p.screen);
    p.page = await openPlayerPage(cdp, { url, side: SIDE, quality: cfg.quality, userAgent: ua });
    log('player_started', { screen: p.screen, fans: p.fans, url });
  }
  cdp.on((method, params, sessionId) => {
    const p = players.find(x => x.page?.sessionId === sessionId);
    if (!p) return;
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

async function run() {
  fans = await openUsb();
  if (!dryRun && !fans.length) throw new Error('no se encontró ningún ventilador TL LCD');
  chrome = await launchChrome(cfg.chrome, profileDir);
  cdp = await Cdp.connect(chrome.ws);
  await startPlayers();
  health.state = 'emitting';
  // Medida de fps y respaldo: si el screencast se calla 4 s, una captura refresca el fotograma.
  // Cada 10 s se leen las RPM: sin L-Connect nadie más vigila que los ventiladores giren.
  for (let tick = 0; !stopping && !cdp.closed && chrome.child.exitCode === null; tick++) {
    await delay(1000);
    for (const p of players) {
      p.fps = p.window; p.window = 0;
      if (Date.now() - p.lastAt > 4000) p.page.screenshot().then(j => deliver(p, j)).catch(() => {});
    }
    if (!dryRun && tick % 10 === 0) await watchRpm();
  }
}

async function shutdown() {
  stopping = true; health.state = 'stopping';
  for (const p of players) await p.page?.close();
  cdp?.close(); chrome?.child.kill();
  for (const f of fans) f.close();
  server.close();
}
process.on('SIGINT', () => { shutdown().then(() => process.exit(0)); });
process.on('SIGTERM', () => { shutdown().then(() => process.exit(0)); });

while (!stopping) {
  try { await run(); }
  catch (e) { health.state = 'error'; log('error', { error: String(e.message || e) }); }
  if (stopping) break;
  for (const p of players) await p.page?.close();
  cdp?.close(); chrome?.child.kill();
  for (const f of fans) f.close();
  fans = []; players = [];
  log('restarting', { inSeconds: 5 });
  await delay(5000);
}
