// Player del Corsair Galleon 100 SD (encargo #7569). Pinta la LCD superior (16:9) y el mosaico vertical de las
// 12 teclas desde la misma señal que el resto de la flota:
//   · playout (/api/playout): Custom · Dual H·V o extendido mandan, como en cualquier pantalla;
//   · autónomo: la playlist propia del teclado (/api/playlist?screen=…) emparejada H·V y anclada al reloj del
//     servidor (assets/galleon-schedule.mjs), para que el teclado físico y el gemelo 3D coincidan sin hablarse.
// El gemelo de admira.store se suscribe por postMessage (subscribe/select/live → frame/ended). El adaptador USB
// del Mac Studio (tools/galleon-player) carga esta página con ?native=1: sólo él late en /signage/now y lee los
// fotogramas con window.admiraGalleonFrames().
import { paintGalleon } from './galleon-layout.mjs';
import { pairPlaylist, slotAt, trackOf } from './galleon-schedule.mjs';

const params = new URLSearchParams(location.search);
const SCREEN = /^[a-z0-9][a-z0-9-]{1,79}$/.test(params.get('screen') || '') ? params.get('screen') : 'corsair-galleon-100';
const NATIVE = params.get('native') === '1';
const API = /^https:\/\/(www\.)?admira\.tv$/.test(location.origin) ? '' : 'https://admira.tv';
const NOW_API = 'https://api.admira.store/signage/now';
const PLAYOUT_MS = 2500, PLAYLIST_MS = 12000, PROGRAM_MS = 500, BEAT_MS = 10000;

const lcd = document.querySelector('#galleon-lcd');
const mosaic = document.createElement('canvas');
const keys = Array.from(document.querySelectorAll('#galleon-keys canvas'));
const surfaces = { lcd, mosaic, keys };
const tracks = { landscape: null, portrait: null };
const twinOrigins = new Set(['https://admira.store', 'https://www.admira.store']);
let twinOrigin = '';
let exporting = false;
let playing = false;
let twinSelection = null;
let plan = null;
let clockOffset = 0; // serverNow − Date.now(), medido en cada sondeo del playout
let playlist = { rev: null, name: '', slots: [] };
let onAir = { source: 'none', id: '', title: '', index: -1, total: 0, paired: false };
let frameCount = 0;
let version = '';
const serverNow = () => Date.now() + clockOffset;

function stockTrack(item) {
  if (!item || !['image', 'video', 'animation'].includes(item.type)) return null;
  try {
    const url = new URL(item.url);
    if (url.origin === 'https://api.admira.store' && url.pathname.startsWith('/stock/asset/')) return item;
    if (url.origin === 'https://stock.admira.store' && url.pathname.startsWith('/stock/')) return item;
  } catch {}
  return null;
}

window.addEventListener('message', event => {
  if (event.source !== window.parent || !twinOrigins.has(event.origin)) return;
  if (event.data?.type === 'admira:galleon:subscribe') twinOrigin = event.origin;
  if (event.origin !== twinOrigin) return;
  if (event.data?.type === 'admira:galleon:live') {
    // El gemelo vuelve a la señal real: la misma que el teclado físico.
    if (twinSelection === null) return;
    twinSelection = null;
    program();
    return;
  }
  if (event.data?.type !== 'admira:galleon:select') return;
  const horizontal = stockTrack(event.data.landscape);
  const vertical = stockTrack(event.data.portrait);
  if (!horizontal || !vertical || !Number.isSafeInteger(event.data.sequence) || event.data.sequence === twinSelection) return;
  twinSelection = event.data.sequence;
  setTrack('landscape', horizontal);
  setTrack('portrait', vertical);
  for (const [orientation, track] of Object.entries(tracks)) {
    if (!track?.video) continue;
    track.media.loop = orientation !== 'landscape';
    track.media.currentTime = 0;
    void track.media.play().catch(() => {});
  }
  onAir = { source: 'twin', id: String(horizontal.id || ''), title: String(event.data.title || ''), index: 0, total: 1, paired: true };
});

function readiness() {
  return { landscape: Boolean(paintable(tracks.landscape)), portrait: Boolean(paintable(tracks.portrait)) };
}

async function publishFrame() {
  if (!twinOrigin || exporting) return;
  exporting = true;
  let landscape, portrait;
  try {
    const framePlaying = playing;
    const ready = readiness();
    landscape = await createImageBitmap(lcd);
    portrait = await createImageBitmap(mosaic);
    window.parent.postMessage({ type: 'admira:galleon:frame', landscape, portrait, playing: framePlaying, ready, onAir }, twinOrigin, [landscape, portrait]);
  } catch {
    landscape?.close();
    portrait?.close();
  } finally {
    exporting = false;
  }
}

function makeTrack(item) {
  if (!item?.url) return null;
  const url = new URL(item.url);
  if (url.protocol !== 'https:') return null;
  const video = item.type === 'video' || item.type === 'animation';
  const media = document.createElement(video ? 'video' : 'img');
  if (video) {
    media.muted = true;
    media.playsInline = true;
    media.loop = true;
    media.preload = 'auto';
  }
  media.crossOrigin = 'anonymous';
  media.src = url.href;
  return { media, url: url.href, video };
}

function setTrack(orientation, item) {
  const current = tracks[orientation];
  if ((current?.url ?? null) === (item?.url ?? null)) return;
  if (current?.video) {
    current.media.pause();
    current.media.removeAttribute('src');
    current.media.load();
  }
  const track = makeTrack(item);
  tracks[orientation] = track;
  if (orientation === 'landscape' && track?.video) track.media.onended = () => {
    if (tracks.landscape === track && twinSelection !== null) {
      window.parent.postMessage({ type: 'admira:galleon:ended', sequence: twinSelection }, twinOrigin);
    }
  };
}

/** Lleva un vídeo a la posición del turno (ms desde su inicio); las imágenes no necesitan reloj. */
function syncTrack(track, positionMs) {
  if (!track?.video) return;
  const media = track.media;
  if (Number.isFinite(media.duration) && media.duration > 0) {
    const target = (positionMs / 1000) % media.duration;
    if (Math.abs(target - media.currentTime) > 0.4) media.currentTime = target;
  }
  if (media.paused) void media.play().catch(() => {});
}

function paintable(track) {
  if (!track) return null;
  return (track.video ? track.media.readyState >= 2 : track.media.complete && track.media.naturalWidth > 0) ? track.media : null;
}

function clear(source) {
  setTrack('landscape', null);
  setTrack('portrait', null);
  onAir = { source, id: '', title: '', index: -1, total: 0, paired: false };
}

/** Decide qué va en cada superficie ahora mismo: playout si manda, si no la playlist propia por reloj de servidor. */
function program() {
  if (twinSelection !== null || !plan) return;
  if (plan.power === 'off') return clear('off');
  if (plan.variants || plan.item) {
    setTrack('landscape', plan.variants?.landscape || plan.item);
    setTrack('portrait', plan.variants?.portrait || plan.item);
    const elapsed = serverNow() - Number(plan.updatedAt);
    if (plan.updatedAt && Number.isFinite(elapsed)) for (const track of Object.values(tracks)) syncTrack(track, Math.max(0, elapsed));
    onAir = { source: 'playout', id: String(plan.item?.id || ''), title: String(plan.item?.title || ''), index: 0, total: 1, paired: Boolean(plan.variants?.landscape && plan.variants?.portrait) };
    return;
  }
  const at = slotAt(playlist.slots, serverNow());
  if (!at) return clear('playlist');
  const landscape = trackOf(at.slot.landscape), portrait = trackOf(at.slot.portrait);
  setTrack('landscape', landscape);
  setTrack('portrait', portrait);
  for (const track of Object.values(tracks)) syncTrack(track, at.offsetMs);
  onAir = { source: 'playlist', id: String(landscape?.id || portrait?.id || ''), title: at.slot.title, index: at.index, total: at.total, paired: at.slot.paired };
}

async function refreshPlayout() {
  const start = Date.now();
  try {
    const response = await fetch(API + '/api/playout?screen=' + SCREEN, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (response.ok) {
      const next = await response.json();
      if (next.ok) {
        if (Number.isFinite(Number(next.serverNow))) clockOffset = Number(next.serverNow) + (Date.now() - start) / 2 - Date.now();
        plan = next;
        program();
      }
    }
  } catch {
    // Mantén el contenido ya cargado si falla un sondeo.
  } finally {
    setTimeout(refreshPlayout, PLAYOUT_MS);
  }
}

async function refreshPlaylist() {
  try {
    const response = await fetch(API + '/api/playlist?screen=' + SCREEN, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (response.ok) {
      const data = await response.json();
      const draft = data?.draft;
      if (data?.ok && draft && Array.isArray(draft.items) && draft.rev !== playlist.rev) {
        playlist = { rev: draft.rev, name: String(draft.name || ''), slots: pairPlaylist(draft.items) };
        program();
      }
    }
  } catch {
    // La última playlist buena sigue en antena.
  } finally {
    setTimeout(refreshPlaylist, PLAYLIST_MS);
  }
}

// ── Adaptador USB (?native=1): fotogramas para el teclado y latido en la flota ──
if (NATIVE) {
  window.admiraGalleonFrames = () => {
    try {
      return { frame: frameCount, playing, ready: readiness(), onAir,
        landscape: lcd.toDataURL('image/jpeg', 0.85), portrait: mosaic.toDataURL('image/jpeg', 0.85) };
    } catch (error) {
      return { frame: frameCount, error: String(error?.message || error) };
    }
  };
  const producer = (() => {
    try {
      let id = localStorage.getItem('adtv_galleon_producer');
      if (!id) { id = 'galleon-' + Math.random().toString(36).slice(2, 10); localStorage.setItem('adtv_galleon_producer', id); }
      return id;
    } catch { return 'galleon-' + Date.now().toString(36); }
  })();
  fetch(API + '/version.json', { cache: 'no-store' }).then(r => r.json()).then(data => { version = String(data?.version || ''); }).catch(() => {});
  const beat = () => {
    // window.admiraGalleonOutput lo escribe el adaptador: si el teclado no recibe la señal (Elgato o el
    // controlador Starbucks tienen el USB) la flota lo ve en reposo, no «en antena» por lo que diga la API.
    const output = window.admiraGalleonOutput && typeof window.admiraGalleonOutput === 'object' ? window.admiraGalleonOutput : { connected: false };
    const ready = readiness();
    const item = onAir.id || onAir.title ? { id: onAir.id, title: onAir.title, type: tracks.landscape?.video ? 'video' : 'image',
      playlist: { name: playlist.name, index: onAir.index + 1, total: onAir.total, source: onAir.source, paired: onAir.paired } } : null;
    fetch(NOW_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      screen: SCREEN, producer, item, standby: !(playing && output.connected), role: 'galleon', version,
      device: {
        display: { width: 720, height: 384, cssWidth: 720, cssHeight: 384, viewportWidth: innerWidth, viewportHeight: innerHeight, devicePixelRatio: 1, orientation: 'landscape', keys: '3×4 · 160 px', mosaic: '480×640' },
        system: { os: 'macOS', platform: navigator.platform || '', language: navigator.language || '', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '' },
        hardware: { dedicated: true, model: 'Corsair Galleon 100 SD', serial: String(output.serial || '') },
        software: { player: 'Corsair Galleon 100 SD', playerVersion: String(output.version || ''), webRelease: version, engine: 'Chromium headless', userAgent: navigator.userAgent },
        audio: { muted: true, playing: false },
        network: { online: navigator.onLine !== false },
      },
      health: { source: 'live', ready, output: output.connected ? 'usb' : 'yielded', frame: frameCount },
      loc: 'corsair', locName: 'Corsair Galleon 100 SD', machine: 'MacStudio',
    }) }).catch(() => {});
  };
  setTimeout(beat, 2000);
  setInterval(beat, BEAT_MS);
}

setInterval(() => {
  const landscape = paintable(tracks.landscape);
  const portrait = paintable(tracks.portrait);
  paintGalleon(surfaces, { landscape, portrait });
  playing = Boolean(landscape || portrait);
  frameCount++;
}, 100);

setInterval(() => void publishFrame(), 200);
setInterval(program, PROGRAM_MS);
void refreshPlayout();
void refreshPlaylist();
