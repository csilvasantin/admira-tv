#!/usr/bin/env node
'use strict';
// Adaptador USB del Corsair Galleon 100 SD (encargo #7569, Neo, 13-nov-2026).
// Carga https://admira.tv/galleon?native=1 en un Chrome SIN ventana (headless: nada aparece en los monitores de
// Carlos ni se roba el foco), lee lo que expone window.admiraGalleonFrames() y lo vuelca por USB con
// @elgato-stream-deck/node, la misma librería que el controlador Starbucks de AdmiraCorsair: la LCD superior
// (720×384, el player) a cada fotograma y las 12 teclas (160×160) sólo cuando cambian, porque desde el 16-nov-2026
// son el navegador de la playlist (previos de las 6 piezas anteriores y las 6 siguientes); tocar una tecla salta
// a esa pieza (window.admiraGalleonJump). Cede siempre el teclado: si Elgato Stream Deck
// o ese controlador tienen el USB, espera sin tocarlo; mantener la tecla 12 un segundo lo devuelve a Elgato.
// Guarda en ~/.admira-galleon lo último que salió por USB (last-lcd.png, last-keys.png): la captura real.
// Suena por los altavoces del Mac Studio. Rueda izquierda = volumen (girar sube o baja a saltos de 5 %, pulsar silencia;
// anillo verde con el nivel, rojo en silencio). Rueda derecha = transporte (pulsar pausa o reanuda, girar a la derecha
// pasa a la siguiente pieza y a la izquierda a la anterior; anillo azul en marcha, ámbar en pausa). Si hay un reloj
// LaMetric configurado (lametric.json), enseña el título de la pieza en antena. Cuando entra una pieza nueva en la
// playlist: jingle de recreativa por los altavoces y anillos parpadeando.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { execFile, execFileSync } = require('node:child_process');
const { LCD, MOSAIC, dataUrlToBuffer, keyTiles, createExitGesture, createKeyTaps, createVolumeControl, createTransportControl, ringColors, transportRing, clampVolume, lametricText, arcadeFlicker, arcadeJingle, newPieces } = require('./galleon-frames.cjs');

const RUNTIME = process.env.ADMIRA_GALLEON_HOME || path.join(os.homedir(), '.admira-galleon');
const SCREEN = /^[a-z0-9][a-z0-9-]{1,79}$/.test(process.env.ADMIRA_GALLEON_SCREEN || '') ? process.env.ADMIRA_GALLEON_SCREEN : 'corsair-galleon-100';
const PAGE_URL = process.env.ADMIRA_GALLEON_URL || ('https://admira.tv/galleon?screen=' + SCREEN + '&native=1');
/**
 * Chrome propio del adaptador: Chrome for Testing, que instala macstudio-galleon.command en ~/.admira-galleon/browsers.
 * No vale el Google Chrome de /Applications: lanzado sin ventana, macOS lo daba por «ya abierto» y el Dock, Spotlight y
 * los enlaces dejaban de abrir el Chrome de Carlos (16-nov-2026). El de pruebas tiene otro bundle id y no interfiere.
 */
function chromeForTesting() {
  const root = path.join(RUNTIME, 'browsers', 'chrome');
  let versions = [];
  try { versions = fs.readdirSync(root).filter(name => name.startsWith('mac')).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })); } catch { return ''; }
  for (const name of versions.reverse()) {
    const binary = path.join(root, name, name.startsWith('mac_arm') ? 'chrome-mac-arm64' : 'chrome-mac-x64', 'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
    if (fs.existsSync(binary)) return binary;
  }
  return '';
}
const CHROME = process.env.ADMIRA_GALLEON_CHROME || chromeForTesting() || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FPS = Math.min(15, Math.max(2, Number(process.env.ADMIRA_GALLEON_FPS) || 10));
const VERSION = 'usb-7 · 17-nov-2026';
const ARCADE_FILE = path.join(RUNTIME, 'arcade.wav');
const LAMETRIC_FILE = path.join(RUNTIME, 'lametric.json');
const VOLUME_FILE = path.join(RUNTIME, 'volume.json');
const ELGATO_APP = '/Applications/Elgato Stream Deck.app';
const ELGATO_BIN = ELGATO_APP + '/Contents/MacOS/Stream Deck';
const STARBUCKS_READY = path.join(os.homedir(), 'Library/Application Support/AdmiraCorsair/fullscreen/ready.json');

fs.mkdirSync(RUNTIME, { recursive: true });
const load = name => require(require.resolve(name, { paths: [RUNTIME, __dirname] }));
const { listStreamDecks, openStreamDeck } = load('@elgato-stream-deck/node');
const sharp = load('sharp');
const puppeteer = load('puppeteer-core');

const log = message => fs.appendFileSync(path.join(RUNTIME, 'player.log'), new Date().toISOString() + ' ' + message + '\n');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const processAlive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
const elgatoRunning = () => { try { return execFileSync('/bin/ps', ['-axo', 'comm='], { encoding: 'utf8' }).split('\n').some(line => line.trim() === ELGATO_BIN); } catch { return false; } };
const starbucksRunning = () => { try { const ready = JSON.parse(fs.readFileSync(STARBUCKS_READY, 'utf8')); return Number.isInteger(ready.pid) && processAlive(ready.pid); } catch { return false; } };

let holderAt = 0, holderName = '';
/** Quién tiene el teclado ahora (se mira una vez por segundo: ps cuesta). */
function holder() {
  if (Date.now() - holderAt < 1000) return holderName;
  holderAt = Date.now();
  holderName = elgatoRunning() ? 'Elgato Stream Deck' : starbucksRunning() ? 'controlador Starbucks (AdmiraCorsair)' : '';
  return holderName;
}

let device = null, serial = '', browser = null, page = null, closing = false, lastFrame = -1, lastKeys = -1, sent = 0, lastSaved = 0, yielding = '';
let told = null, toldAt = 0, hookWaitSince = Date.now();
const status = extra => fs.writeFileSync(path.join(RUNTIME, 'status.json'), JSON.stringify({ pid: process.pid, screen: SCREEN, url: PAGE_URL,
  serial, connected: Boolean(device), yielding, frames: sent, fps: FPS, version: VERSION, chrome: CHROME, audio, paused, lametric: lametric ? { host: lametric.host, shown: lametricShown } : null, at: Date.now(), ...extra }));

// ── Volumen: las dos ruedas del teclado. Se recuerda entre arranques en volume.json. ──
function loadVolume() {
  try { const saved = JSON.parse(fs.readFileSync(VOLUME_FILE, 'utf8')); return { volume: clampVolume(saved.volume), muted: saved.muted === true }; } catch { return { volume: 0.5, muted: false }; }
}
let audio = loadVolume();
const volumeControl = createVolumeControl(state => {
  audio = state;
  try { fs.writeFileSync(VOLUME_FILE, JSON.stringify(state)); } catch {}
  log('volumen ' + Math.round(state.volume * 100) + '%' + (state.muted ? ' · silencio' : ''));
  void showVolume();
  status();
}, audio);
/** Pinta el nivel en el anillo de LEDs del dial izquierdo (volumen). */
async function showVolume(target = device) {
  if (!target || celebrating) return;
  try { await target.setEncoderRingColors(0, ringColors(audio)); } catch (error) { log('anillo-error ' + error.message); }
}

// ── LaMetric Time (Carlos, 16-nov-2026): el reloj de LEDs enseña el título de la pieza en antena por su API local. ──
// Configuración en ~/.admira-galleon/lametric.json {"host":"192.168.86.20","key":"…"} (clave de developer.lametric.com,
// sólo en este Mac, nunca en el repo ni en el registro). Sin fichero, no se hace nada. Una notificación con cycles 0
// se queda en el reloj hasta que se sustituye (al cambiar de pieza) o se retira (cuando el teclado deja de emitir).
function loadLametric() {
  try {
    const config = JSON.parse(fs.readFileSync(LAMETRIC_FILE, 'utf8'));
    return /^[A-Za-z0-9.\-]+$/.test(String(config.host || '')) && typeof config.key === 'string' && config.key ? { host: config.host, key: config.key } : null;
  } catch { return null; }
}
const lametric = loadLametric();
let lametricShown = '', lametricId = null, lametricRetryAt = 0;
async function lametricRequest(method, pathname, body) {
  const auth = Buffer.from('dev:' + lametric.key).toString('base64');
  const response = await fetch('http://' + lametric.host + ':8080/api/v2' + pathname, { method, headers: { Authorization: 'Basic ' + auth, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  return response.json().catch(() => null);
}
async function lametricDismiss() {
  if (lametricId === null) return;
  const id = lametricId;
  lametricId = null;
  try { await lametricRequest('DELETE', '/device/notifications/' + encodeURIComponent(id)); } catch {}
}
let lametricBusy = Promise.resolve();
/** Enseña `text` en el reloj (o lo retira si va vacío); sólo actúa cuando cambia. Las llamadas se encadenan. */
function lametricShow(text) {
  if (!lametric || text === lametricShown || Date.now() < lametricRetryAt) return;
  lametricShown = text;
  lametricBusy = lametricBusy.then(async () => {
    await lametricDismiss();
    if (!text) { log('lametric retirado'); return; }
    try {
      // Sin `lifetime`: el reloj rechaza los valores largos (400) y con cycles 0 la notificación ya se queda hasta retirarla.
      const result = await lametricRequest('POST', '/device/notifications', { priority: 'info', icon_type: 'none', model: { cycles: 0, frames: [{ text }] } });
      lametricId = result?.success?.id ?? null;
      log('lametric «' + text.slice(0, 70) + '»');
    } catch (error) { log('lametric-error ' + error.message); lametricShown = ''; lametricRetryAt = Date.now() + 30000; }
  });
}

// ── Pieza nueva en la playlist (Carlos, 16-nov-2026): jingle de recreativa de los 80 por los altavoces (afplay, al
// volumen del player, en silencio si el player está en silencio) y los anillos de los dos diales parpadeando 2 s. ──
let knownPieces = null, celebrating = false;
try { fs.writeFileSync(ARCADE_FILE, arcadeJingle()); } catch (error) { log('arcade-error ' + error.message); }
async function celebrate(count) {
  if (celebrating) return;
  celebrating = true;
  log('pieza nueva ×' + count + ': arcade');
  if (!audio.muted && audio.volume > 0) execFile('/usr/bin/afplay', ['-v', String(Math.max(0.2, audio.volume)), ARCADE_FILE], error => { if (error) log('afplay-error ' + error.message); });
  try {
    for (let frame = 0; frame < 24 && device; frame++) {
      const colors = arcadeFlicker(frame);
      await Promise.all([0, 1].map(index => device.setEncoderRingColors(index, colors)));
      await sleep(80);
    }
  } catch (error) { log('anillo-error ' + error.message); }
  celebrating = false;
  await showVolume();
  await showTransport();
}

// ── Transporte: la rueda derecha. Pulsar pausa/reanuda; girar pasa a la siguiente o a la anterior pieza. ──
let paused = false;
/** Pinta el estado en el anillo del dial derecho: azul en marcha, ámbar en pausa. */
async function showTransport(target = device) {
  if (!target || celebrating) return;
  try { await target.setEncoderRingColors(1, transportRing({ paused })); } catch (error) { log('anillo-error ' + error.message); }
}
async function transportAction(action) {
  try {
    const result = await page.evaluate(a => typeof window.admiraGalleonTransport === 'function' ? window.admiraGalleonTransport(a) : null, action);
    if (!result) { log('transporte ' + action + ' → la página no lo admite'); return; }
    paused = result.paused === true;
    lametricShow(lametricText(await page.evaluate(() => (window.admiraGalleonFrames(-1) || {}).onAir).catch(() => null), { paused, connected: true }));
    log('transporte ' + action + (action === 'toggle' ? (paused ? ' → pausa' : ' → sigue') : (result.moved ? ' → pieza ' + (result.index + 1) : ' → sin playlist')));
    await showTransport();
    status();
  } catch (error) { log('transporte-error ' + error.message); }
}
// Serialize wheel commands so pause -> mute observes the acknowledged page state.
let wheelQueue = Promise.resolve();
const enqueueWheel = action => { wheelQueue = wheelQueue.then(action).catch(error => log('rueda-error ' + error.message)); };
const transportControl = createTransportControl(action => enqueueWheel(() => transportAction(action)));
async function leftPress(control) {
  const result = await page.evaluate(() => {
    const frames = window.admiraGalleonFrames?.(-1);
    if (!frames) return { unavailable: true };
    if (frames.paused && frames.onAir?.source === 'playlist') {
      return window.admiraGalleonRemovePaused?.() || { unavailable: true };
    }
    return { mute: true };
  });
  if (result?.mute) volumeControl('down', control);
  else if (result?.removed) {
    paused = result.paused === true;
    lastKeys = -1;
    await showTransport();
    status();
    log('playlist: retirada local ' + result.ids.join(','));
  } else log('playlist: retirada no aplicada ' + (result?.error || 'página no preparada'));
}

async function releaseDevice(reason) {
  if (!device) return;
  const current = device;
  device = null;
  lametricShow('');
  try { await current.clearPanel(); } catch {}
  try { await current.close(); } catch {}
  log('usb-released ' + reason);
  status();
}

async function returnToElgato() {
  log('menu-corsair: tecla 12 mantenida → devuelvo el teclado a Elgato');
  await releaseDevice('menu-corsair');
  try { execFileSync('/usr/bin/open', ['-g', '-j', '-a', ELGATO_APP, '--args', '--runinbk']); } catch (error) { log('open-elgato-error ' + error.message); }
  holderAt = 0;
}

async function openDevice() {
  const found = (await listStreamDecks()).find(entry => entry.model === 'galleon-k100');
  if (!found) return false;
  const opened = await openStreamDeck(found.path);
  opened.on('error', error => { log('usb-error ' + error.message); void releaseDevice('usb-error'); });
  // Teclas: un toque salta a la pieza que enseña (también en la 12, si se suelta antes del segundo); las ruedas, volumen.
  const gesture = createExitGesture(() => void returnToElgato(), { onTap: index => void jumpTo(index) });
  const taps = createKeyTaps(index => void jumpTo(index));
  opened.on('down', control => { if (control?.type === 'encoder' && control.index === 0) { enqueueWheel(() => leftPress(control)); return; } if (!gesture('down', control) && !taps('down', control) && !volumeControl('down', control)) transportControl('down', control); });
  opened.on('up', control => { if (!gesture('up', control) && !taps('up', control) && !volumeControl('up', control)) transportControl('up', control); });
  opened.on('rotate', (control, value) => { if (!volumeControl('rotate', control, value)) transportControl('rotate', control, value); });
  try { await opened.setBrightness(100); } catch {}
  try { await opened.clearPanel(); } catch {}
  device = opened;
  serial = found.serialNumber || '';
  await showVolume(opened);
  await showTransport(opened);
  lastFrame = -1;
  lastKeys = -1;
  log('usb-open ' + found.model + ' ' + serial);
  status();
  return true;
}

async function openBrowser() {
  // Sin silenciar el audio: el player suena por la salida de audio del Mac (el headless nuevo sí la usa). El volumen lo pone la página
  // según window.admiraGalleonOutput (volume/muted), que escribe tell(). OJO: puppeteer añade por su cuenta el interruptor de
  // silencio (mute-audio) a todo Chrome sin ventana; hay que excluirlo con ignoreDefaultArgs o CoreAudio ve el flujo pero sale
  // en silencio (así se perdió el sonido el 16-nov-2026).
  const args = ['--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--no-first-run', '--no-default-browser-check',
    '--window-size=760,1100'];
  // Sólo para probar en local una copia de /galleon servida en 127.0.0.1 (la API de admira.tv no da CORS): nunca en producción.
  if (process.env.ADMIRA_GALLEON_INSECURE === '1' && /^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(PAGE_URL)) args.push('--disable-web-security');
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true, userDataDir: path.join(RUNTIME, 'chrome-profile'), args,
    ignoreDefaultArgs: ['--' + 'mute-audio'] });
  browser.on('disconnected', () => { if (!closing) { log('chrome-disconnected'); process.exit(1); } });
  page = await browser.newPage();
  await page.setViewport({ width: 740, height: 1100 });
  page.on('pageerror', error => log('page-error ' + error.message));
  await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  log('page-open ' + PAGE_URL);
}

/** Dice a la página si el teclado recibe la señal (así su latido en la flota cuenta la verdad) y el volumen de las ruedas. */
async function tell(connected) {
  const key = [connected, audio.volume, audio.muted].join('|');
  if (told === key && Date.now() - toldAt < 1000) return;
  told = key;
  toldAt = Date.now();
  try { await page.evaluate(state => { window.admiraGalleonOutput = state; }, { connected, serial, version: VERSION, at: Date.now(), volume: audio.volume, muted: audio.muted }); } catch {}
}

/** Toque en una tecla: la página salta a la pieza que esa tecla enseña (si está en su playlist). */
async function jumpTo(index) {
  try {
    const jumped = await page.evaluate(key => typeof window.admiraGalleonJump === 'function' && window.admiraGalleonJump(key), index);
    log('tecla ' + (index + 1) + (jumped ? ' → salto' : ' → sin pieza'));
  } catch (error) { log('salto-error ' + error.message); }
}

async function pushFrame() {
  const frames = await page.evaluate(since => typeof window.admiraGalleonFrames === 'function' ? window.admiraGalleonFrames(since) : null, lastKeys);
  if (!frames || frames.error) return false;
  const target = device;
  if (!target || closing) return false;
  // Las teclas sólo cuando la página dice que han cambiado (otra pieza en antena): 12 volcados, no 120 por segundo.
  const keysJpeg = frames.keys !== undefined ? dataUrlToBuffer(frames.keys) : null;
  if (keysJpeg) {
    const mosaicRaw = await sharp(keysJpeg).resize(MOSAIC.width, MOSAIC.height, { fit: 'fill' }).removeAlpha().raw().toBuffer();
    const tiles = keyTiles(mosaicRaw);
    for (let index = 0; index < tiles.length; index++) {
      if (device !== target || closing) return false; // el teclado se soltó a mitad (parada o cesión)
      await target.fillKeyBuffer(index, tiles[index], { format: 'rgb' });
    }
    lastKeys = frames.keysRev;
    fs.writeFileSync(path.join(RUNTIME, 'last-keys.png'), await sharp(mosaicRaw, { raw: { width: MOSAIC.width, height: MOSAIC.height, channels: 3 } }).png().toBuffer());
    log('teclas ' + frames.keysRev + ' ' + JSON.stringify(frames.onAir || null));
  }
  lametricShow(lametricText(frames.onAir, { paused, connected: true }));
  if (Array.isArray(frames.pieces)) {
    const added = newPieces(knownPieces, frames.pieces);
    knownPieces = frames.pieces;
    if (added.length) void celebrate(added.length);
  }
  if (frames.frame === lastFrame) return Boolean(keysJpeg);
  const lcdJpeg = dataUrlToBuffer(frames.landscape);
  if (!lcdJpeg) return false;
  const lcdRaw = await sharp(lcdJpeg).resize(LCD.width, LCD.height, { fit: 'fill' }).removeAlpha().raw().toBuffer();
  if (device !== target || closing) return false;
  await target.fillLcd(0, lcdRaw, { format: 'rgb' });
  lastFrame = frames.frame;
  sent++;
  if (Date.now() - lastSaved > 5000) {
    lastSaved = Date.now();
    fs.writeFileSync(path.join(RUNTIME, 'last-lcd.png'), await sharp(lcdRaw, { raw: { width: LCD.width, height: LCD.height, channels: 3 } }).png().toBuffer());
    status({ onAir: frames.onAir, ready: frames.ready, playing: frames.playing });
    if (sent === 1 || sent % 600 === 0) log('frames ' + sent + ' ' + JSON.stringify(frames.onAir || null));
  }
  return true;
}

async function shutdown(reason) {
  if (closing) return;
  closing = true;
  log('parada ' + reason);
  await releaseDevice('parada');
  try { await lametricBusy; } catch {}
  try { await browser?.close(); } catch {}
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('uncaughtException', error => { log('exception ' + error.message); void releaseDevice('exception').then(() => process.exit(1)); });
process.on('unhandledRejection', error => { log('rejection ' + String(error?.message || error)); void releaseDevice('rejection').then(() => process.exit(1)); });

(async () => {
  log('arranque ' + VERSION + ' fps=' + FPS + ' pantalla=' + SCREEN + ' chrome=' + CHROME + ' volumen=' + Math.round(audio.volume * 100) + '%' + (audio.muted ? ' · silencio' : ''));
  status();
  await openBrowser();
  while (!closing) {
    const who = holder();
    if (who) {
      if (device) await releaseDevice('cede a ' + who);
      if (yielding !== who) { yielding = who; log('cede: ' + who + ' tiene el teclado; espero'); status(); }
      await tell(false);
      await sleep(2000);
      continue;
    }
    if (yielding) { yielding = ''; log('teclado libre'); status(); }
    if (!device) {
      // Sin fotogramas de la página (p. ej. producción aún sin el gancho nativo) no se toca el USB: el teclado sigue como estaba.
      const hook = await page.evaluate(() => typeof window.admiraGalleonFrames === 'function').catch(() => false);
      if (!hook) {
        // La página cargada no trae el gancho (release antiguo o carga a medias): se recarga cada 30 s hasta que aparezca.
        if (Date.now() - hookWaitSince > 30000) { hookWaitSince = Date.now(); log('sin gancho nativo: recargo la página'); await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {}); }
        await tell(false); await sleep(3000); continue;
      }
      if (!await openDevice()) { await tell(false); await sleep(3000); continue; }
    }
    await tell(true);
    const started = Date.now();
    try { await pushFrame(); } catch (error) {
      log('frame-error ' + error.message);
      await releaseDevice('frame-error');
      await sleep(1000);
      continue;
    }
    await sleep(Math.max(0, 1000 / FPS - (Date.now() - started)));
  }
})().catch(error => { log('fatal ' + error.message); process.exit(1); });
