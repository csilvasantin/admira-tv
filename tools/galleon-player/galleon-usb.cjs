#!/usr/bin/env node
'use strict';
// Adaptador USB del Corsair Galleon 100 SD (encargo #7569, Neo, 13-nov-2026).
// Carga https://admira.tv/galleon?native=1 en un Chrome SIN ventana (headless: nada aparece en los monitores de
// Carlos ni se roba el foco), lee los dos fotogramas que expone window.admiraGalleonFrames() y los vuelca por USB
// a la LCD superior (720×384, horizontal) y a las 12 teclas (160×160, mosaico vertical) con @elgato-stream-deck/node,
// la misma librería que el controlador Starbucks de AdmiraCorsair. Cede siempre el teclado: si Elgato Stream Deck
// o ese controlador tienen el USB, espera sin tocarlo; mantener la tecla 12 un segundo lo devuelve a Elgato.
// Guarda en ~/.admira-galleon lo último que salió por USB (last-lcd.png, last-keys.png): la captura real.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { execFileSync } = require('node:child_process');
const { LCD, MOSAIC, dataUrlToBuffer, keyTiles, createExitGesture } = require('./galleon-frames.cjs');

const RUNTIME = process.env.ADMIRA_GALLEON_HOME || path.join(os.homedir(), '.admira-galleon');
const SCREEN = /^[a-z0-9][a-z0-9-]{1,79}$/.test(process.env.ADMIRA_GALLEON_SCREEN || '') ? process.env.ADMIRA_GALLEON_SCREEN : 'corsair-galleon-100';
const PAGE_URL = process.env.ADMIRA_GALLEON_URL || ('https://admira.tv/galleon?screen=' + SCREEN + '&native=1');
const CHROME = process.env.ADMIRA_GALLEON_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FPS = Math.min(15, Math.max(2, Number(process.env.ADMIRA_GALLEON_FPS) || 10));
const VERSION = 'usb-1 · 13-nov-2026';
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

let device = null, serial = '', browser = null, page = null, closing = false, lastFrame = -1, sent = 0, lastSaved = 0, yielding = '';
let told = null, toldAt = 0;
const status = extra => fs.writeFileSync(path.join(RUNTIME, 'status.json'), JSON.stringify({ pid: process.pid, screen: SCREEN, url: PAGE_URL,
  serial, connected: Boolean(device), yielding, frames: sent, fps: FPS, version: VERSION, at: Date.now(), ...extra }));

async function releaseDevice(reason) {
  if (!device) return;
  const current = device;
  device = null;
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
  const gesture = createExitGesture(() => void returnToElgato());
  opened.on('down', control => gesture('down', control));
  opened.on('up', control => gesture('up', control));
  try { await opened.setBrightness(100); } catch {}
  try { await opened.clearPanel(); } catch {}
  device = opened;
  serial = found.serialNumber || '';
  lastFrame = -1;
  log('usb-open ' + found.model + ' ' + serial);
  status();
  return true;
}

async function openBrowser() {
  const args = ['--autoplay-policy=no-user-gesture-required', '--mute-audio', '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--no-first-run', '--no-default-browser-check',
    '--window-size=760,1100'];
  // Sólo para probar en local una copia de /galleon servida en 127.0.0.1 (la API de admira.tv no da CORS): nunca en producción.
  if (process.env.ADMIRA_GALLEON_INSECURE === '1' && /^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(PAGE_URL)) args.push('--disable-web-security');
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true, userDataDir: path.join(RUNTIME, 'chrome-profile'), args });
  browser.on('disconnected', () => { if (!closing) { log('chrome-disconnected'); process.exit(1); } });
  page = await browser.newPage();
  await page.setViewport({ width: 740, height: 1100 });
  page.on('pageerror', error => log('page-error ' + error.message));
  await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  log('page-open ' + PAGE_URL);
}

/** Dice a la página si el teclado recibe la señal: así su latido en la flota cuenta la verdad. */
async function tell(connected) {
  if (told === connected && Date.now() - toldAt < 1000) return;
  told = connected;
  toldAt = Date.now();
  try { await page.evaluate(state => { window.admiraGalleonOutput = state; }, { connected, serial, version: VERSION, at: Date.now() }); } catch {}
}

async function pushFrame() {
  const frames = await page.evaluate(() => typeof window.admiraGalleonFrames === 'function' ? window.admiraGalleonFrames() : null);
  if (!frames || frames.error || frames.frame === lastFrame) return false;
  const lcdJpeg = dataUrlToBuffer(frames.landscape), mosaicJpeg = dataUrlToBuffer(frames.portrait);
  if (!lcdJpeg || !mosaicJpeg) return false;
  const [lcdRaw, mosaicRaw] = await Promise.all([
    sharp(lcdJpeg).resize(LCD.width, LCD.height, { fit: 'fill' }).removeAlpha().raw().toBuffer(),
    sharp(mosaicJpeg).resize(MOSAIC.width, MOSAIC.height, { fit: 'fill' }).removeAlpha().raw().toBuffer(),
  ]);
  if (!device) return false;
  await device.fillLcd(0, lcdRaw, { format: 'rgb' });
  const tiles = keyTiles(mosaicRaw);
  for (let index = 0; index < tiles.length; index++) await device.fillKeyBuffer(index, tiles[index], { format: 'rgb' });
  lastFrame = frames.frame;
  sent++;
  if (Date.now() - lastSaved > 5000) {
    lastSaved = Date.now();
    fs.writeFileSync(path.join(RUNTIME, 'last-lcd.png'), await sharp(lcdRaw, { raw: { width: LCD.width, height: LCD.height, channels: 3 } }).png().toBuffer());
    fs.writeFileSync(path.join(RUNTIME, 'last-keys.png'), await sharp(mosaicRaw, { raw: { width: MOSAIC.width, height: MOSAIC.height, channels: 3 } }).png().toBuffer());
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
  try { await browser?.close(); } catch {}
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('uncaughtException', error => { log('exception ' + error.message); void releaseDevice('exception').then(() => process.exit(1)); });
process.on('unhandledRejection', error => { log('rejection ' + String(error?.message || error)); void releaseDevice('rejection').then(() => process.exit(1)); });

(async () => {
  log('arranque ' + VERSION + ' fps=' + FPS + ' pantalla=' + SCREEN);
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
      if (!hook || !await openDevice()) { await tell(false); await sleep(3000); continue; }
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
