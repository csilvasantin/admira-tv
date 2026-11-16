// Player del Corsair Galleon 100 SD (encargo #7569). Pinta la LCD superior (16:9) con la señal de la flota y las 12
// teclas como NAVEGADOR de la playlist (Carlos, 16-nov-2026): previo, título y posición de las 6 piezas anteriores
// (dos filas de arriba) y las 6 siguientes (dos de abajo); tocar una tecla salta a esa pieza. Sólo hay una pista de
// vídeo (la horizontal): la vertical ya no se decodifica, y las teclas sólo se repintan al cambiar de pieza.
//   · playout (/api/playout): Custom · Dual H·V o extendido mandan, como en cualquier pantalla (sin saltos);
//   · autónomo: la playlist propia del teclado (/api/playlist?screen=…) emparejada H·V y anclada al reloj del
//     servidor (assets/galleon-schedule.mjs); un salto por tecla desplaza ese reloj hasta la siguiente revisión.
// El gemelo de admira.store se suscribe por postMessage (subscribe/select/live → frame/ended). El adaptador USB
// del Mac Studio (tools/galleon-player) carga esta página con ?native=1: sólo él late en /signage/now, lee los
// fotogramas con window.admiraGalleonFrames(sinceKeys), salta con window.admiraGalleonJump(tecla) y maneja el
// transporte con window.admiraGalleonTransport('toggle'|'next'|'prev') desde la rueda derecha. Sólo en ese modo
// suena (por el Mac Studio), con el volumen que el adaptador escribe en window.admiraGalleonOutput desde la rueda
// izquierda; en el gemelo va mudo.
import { paintLcd, paintKeys } from './galleon-layout.mjs';
import { jumpOffsetMs, navigatorWindow, pairPlaylist, slotAt, trackOf } from './galleon-schedule.mjs';

const params = new URLSearchParams(location.search);
const SCREEN = /^[a-z0-9][a-z0-9-]{1,79}$/.test(params.get('screen') || '') ? params.get('screen') : 'corsair-galleon-100';
const NATIVE = params.get('native') === '1';
const API = /^https:\/\/(www\.)?admira\.tv$/.test(location.origin) ? '' : 'https://admira.tv';
const NOW_API = 'https://api.admira.store/signage/now';
const PLAYOUT_MS = 2500, PLAYLIST_MS = 12000, PROGRAM_MS = 500, BEAT_MS = 10000;
const KEYS_BEFORE = 6, KEYS_AFTER = 6;

const lcd = document.querySelector('#galleon-lcd');
const mosaic = document.createElement('canvas');
const keys = Array.from(document.querySelectorAll('#galleon-keys canvas'));
const tracks = { landscape: null };
const twinOrigins = new Set(['https://admira.store', 'https://www.admira.store']);
let twinOrigin = '';
let exporting = false;
let playing = false;
let twinSelection = null;
let plan = null;
let clockOffset = 0; // serverNow − Date.now(), medido en cada sondeo del playout
let playlist = { rev: null, name: '', slots: [] };
let onAir = { source: 'none', id: '', title: '', index: -1, total: 0, paired: false };
let jump = { ms: 0, rev: null }; // salto por tecla o rueda: desplaza el reloj; se olvida al cambiar la playlist
let pausedAt = null; // reloj del servidor en el que se pausó (rueda derecha); en pausa el programa no toca nada
let keypad = { key: '', map: [], rev: 0, painted: false }; // navegador de teclas: qué turno enseña cada una; rev sube al repintar
let frameCount = 0;
let version = '';
let audio = { muted: true, volume: 0 };
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
  const track = tracks.landscape;
  if (track?.video) {
    track.media.loop = false;
    track.media.currentTime = 0;
    void track.media.play().catch(() => {});
  }
  onAir = { source: 'twin', id: String(horizontal.id || ''), title: String(event.data.title || ''), index: 0, total: 1, paired: true };
  refreshNavigator();
});

function readiness() {
  return { landscape: Boolean(paintable(tracks.landscape)), portrait: keypad.painted };
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
    media.muted = true; // applyAudio() le da voz en modo nativo
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
  onAir = { source, id: '', title: '', index: -1, total: 0, paired: false };
  refreshNavigator();
}

/** Decide qué va en la LCD ahora mismo: playout si manda, si no la playlist propia por reloj de servidor (más el salto). */
function program() {
  if (twinSelection !== null || !plan || pausedAt !== null) return;
  if (plan.power === 'off') return clear('off');
  if (plan.variants || plan.item) {
    setTrack('landscape', plan.variants?.landscape || plan.item);
    const elapsed = serverNow() - Number(plan.updatedAt);
    if (plan.updatedAt && Number.isFinite(elapsed)) syncTrack(tracks.landscape, Math.max(0, elapsed));
    onAir = { source: 'playout', id: String(plan.item?.id || ''), title: String(plan.item?.title || ''), index: 0, total: 1, paired: Boolean(plan.variants?.landscape && plan.variants?.portrait) };
    refreshNavigator();
    return;
  }
  if (jump.rev !== playlist.rev) jump = { ms: 0, rev: playlist.rev };
  const at = slotAt(playlist.slots, serverNow() + jump.ms);
  if (!at) return clear('playlist');
  const landscape = trackOf(at.slot.landscape);
  setTrack('landscape', landscape);
  syncTrack(tracks.landscape, at.offsetMs);
  onAir = { source: 'playlist', id: String(landscape?.id || ''), title: at.slot.title, index: at.index, total: at.total, paired: at.slot.paired };
  refreshNavigator();
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

// ── Navegador de las 12 teclas: previos de las piezas vecinas en la playlist ──
const previews = new Map(); // url → Promise<lienzo 320×180 | null>
const PREVIEW = { width: 320, height: 180 };

/** Un fotograma de la pieza (vídeo: al 10 % o a los 2 s; imagen: entera) en un lienzo pequeño; null si no se puede. */
function previewOf(item) {
  const track = trackOf(item);
  if (!track) return Promise.resolve(null);
  if (previews.has(track.url)) return previews.get(track.url);
  const promise = new Promise(resolve => {
    const done = image => {
      if (!image) return resolve(null);
      const canvas = document.createElement('canvas');
      canvas.width = PREVIEW.width; canvas.height = PREVIEW.height;
      const context = canvas.getContext('2d');
      const sourceWidth = image.videoWidth || image.naturalWidth, sourceHeight = image.videoHeight || image.naturalHeight;
      if (!context || !sourceWidth || !sourceHeight) return resolve(null);
      const scale = Math.min(PREVIEW.width / sourceWidth, PREVIEW.height / sourceHeight);
      const width = Math.round(sourceWidth * scale), height = Math.round(sourceHeight * scale);
      context.fillStyle = '#000'; context.fillRect(0, 0, PREVIEW.width, PREVIEW.height);
      try { context.drawImage(image, Math.floor((PREVIEW.width - width) / 2), Math.floor((PREVIEW.height - height) / 2), width, height); } catch { return resolve(null); }
      resolve(canvas);
    };
    const timer = setTimeout(() => done(null), 20000);
    if (track.type === 'image') {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.onload = () => { clearTimeout(timer); done(image); };
      image.onerror = () => { clearTimeout(timer); done(null); };
      image.src = track.url;
      return;
    }
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous'; video.muted = true; video.playsInline = true; video.preload = 'auto';
    const finish = image => { clearTimeout(timer); done(image); video.removeAttribute('src'); video.load(); };
    video.onerror = () => finish(null);
    video.onloadeddata = () => {
      const target = Number.isFinite(video.duration) && video.duration > 0 ? Math.min(2, video.duration * 0.1) : 0;
      if (target <= 0 || Math.abs(video.currentTime - target) < 0.05) return finish(video);
      video.onseeked = () => finish(video);
      video.currentTime = target;
    };
    video.src = track.url;
  });
  previews.set(track.url, promise);
  return promise;
}

/** Qué turno enseña cada tecla ahora; si cambia (otra pieza en antena u otra playlist) repinta las 12 teclas. */
function refreshNavigator() {
  const total = onAir.source === 'playlist' ? playlist.slots.length : 0;
  const map = navigatorWindow(total, onAir.index, { before: KEYS_BEFORE, after: KEYS_AFTER });
  const key = playlist.rev + ':' + onAir.source + ':' + onAir.index + ':' + map.join(',');
  if (key === keypad.key) return;
  keypad = { key, map, rev: keypad.rev + 1, painted: false };
  void paintNavigator(key);
}

async function paintNavigator(key) {
  const entries = keypad.map.map((index, position) => {
    if (index === null) return null;
    const slot = playlist.slots[index];
    const offset = position < KEYS_BEFORE ? position - KEYS_BEFORE : position - KEYS_BEFORE + 1;
    return { slot, title: slot?.title || '', offset, next: offset > 0, position: index + 1, total: playlist.slots.length, image: null };
  });
  const repaint = () => {
    if (keypad.key !== key) return; // ya hay otra ventana en marcha
    paintKeys({ mosaic, keys }, entries);
    keypad.rev++;
    keypad.painted = true;
  };
  repaint(); // primero el texto: la tecla responde al instante aunque el previo tarde
  await Promise.all(entries.map(async entry => {
    if (!entry) return;
    entry.image = await previewOf(entry.slot?.landscape);
  }));
  repaint();
}

/** Salta al turno `index` de la playlist propia (reanudando si estaba en pausa). Devuelve si había salto posible. */
function jumpToSlot(index) {
  if (onAir.source !== 'playlist' || twinSelection !== null || !Number.isInteger(index) || index < 0 || index >= playlist.slots.length) return false;
  if (pausedAt !== null) resume();
  jump = { ms: jumpOffsetMs(playlist.slots, index, serverNow()), rev: playlist.rev };
  program();
  return true;
}

/** Toque en la tecla `key` (0…11, orden físico): salta a la pieza que enseña. */
function jumpToKey(key) {
  const index = keypad.map[key];
  return index === null || index === undefined ? false : jumpToSlot(index);
}

// ── Transporte (rueda derecha): pausa/reanuda, siguiente, anterior ──
function pause() {
  if (pausedAt !== null) return;
  pausedAt = serverNow();
  if (tracks.landscape?.video) tracks.landscape.media.pause();
}
function resume() {
  if (pausedAt === null) return;
  // El reloj siguió corriendo en pausa: se desplaza lo pausado para que la pieza siga por donde iba.
  jump = { ms: jump.ms - (serverNow() - pausedAt), rev: playlist.rev };
  pausedAt = null;
  if (tracks.landscape?.video) void tracks.landscape.media.play().catch(() => {});
  program();
}
function transport(action) {
  if (action === 'toggle') { if (pausedAt === null) pause(); else resume(); }
  else if (action === 'next' || action === 'prev') {
    if (onAir.source !== 'playlist' || !playlist.slots.length) return { paused: pausedAt !== null, index: onAir.index, moved: false };
    const total = playlist.slots.length;
    jumpToSlot((((onAir.index + (action === 'next' ? 1 : -1)) % total) + total) % total);
  }
  return { paused: pausedAt !== null, index: onAir.index, moved: action !== 'toggle' };
}

/** Volumen de las ruedas (window.admiraGalleonOutput.volume/muted): suena sólo cuando el teclado recibe la señal.
 * Fuera del adaptador la página va muda. */
function applyAudio() {
  if (pausedAt !== null && tracks.landscape?.video && !tracks.landscape.media.paused) tracks.landscape.media.pause();
  const output = NATIVE && window.admiraGalleonOutput && typeof window.admiraGalleonOutput === 'object' ? window.admiraGalleonOutput : null;
  const volume = output && Number.isFinite(Number(output.volume)) ? Math.min(1, Math.max(0, Number(output.volume))) : 0;
  audio = { muted: !output?.connected || output.muted === true || volume === 0, volume };
  for (const [orientation, track] of Object.entries(tracks)) {
    if (!track?.video) continue;
    const sounds = orientation === 'landscape' && !audio.muted;
    if (track.media.muted === sounds) track.media.muted = !sounds;
    if (sounds && Math.abs(track.media.volume - volume) > 0.001) track.media.volume = volume;
  }
}

// ── Adaptador USB (?native=1): fotogramas para el teclado, saltos, volumen y latido en la flota ──
if (NATIVE) {
  // La LCD va en cada llamada; las teclas sólo cuando han cambiado desde `sinceKeys` (el adaptador recuerda keysRev).
  window.admiraGalleonFrames = sinceKeys => {
    try {
      const frames = { frame: frameCount, playing, paused: pausedAt !== null, ready: readiness(), onAir, keysRev: keypad.rev, landscape: lcd.toDataURL('image/jpeg', 0.85) };
      if (keypad.painted && keypad.rev !== sinceKeys) frames.keys = mosaic.toDataURL('image/jpeg', 0.85);
      return frames;
    } catch (error) {
      return { frame: frameCount, error: String(error?.message || error) };
    }
  };
  window.admiraGalleonJump = key => jumpToKey(Number(key));
  window.admiraGalleonTransport = action => transport(String(action));
  // Un productor ESTABLE por pantalla: /signage/now concede la pantalla al primer productor que late y rechaza (409)
  // a cualquier otro durante 3 min. Con un id aleatorio por perfil/origen, cada arranque del adaptador perdía la
  // pantalla frente a su propia carga anterior (pasó el 13-nov-2026 entre la prueba local y la de producción).
  const producer = 'galleon-usb-' + SCREEN;
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
        display: { width: 720, height: 384, cssWidth: 720, cssHeight: 384, viewportWidth: innerWidth, viewportHeight: innerHeight, devicePixelRatio: 1, orientation: 'landscape', keys: '3×4 · 160 px · navegador', mosaic: '480×640' },
        system: { os: 'macOS', platform: window.navigator.platform || '', language: window.navigator.language || '', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '' },
        hardware: { dedicated: true, model: 'Corsair Galleon 100 SD', serial: String(output.serial || '') },
        software: { player: 'Corsair Galleon 100 SD', playerVersion: String(output.version || ''), webRelease: version, engine: 'Chromium headless', userAgent: window.navigator.userAgent },
        audio: { muted: audio.muted, volume: audio.volume, playing: playing && !audio.muted && pausedAt === null },
        network: { online: window.navigator.onLine !== false },
      },
      health: { source: 'live', ready, output: output.connected ? 'usb' : 'yielded', frame: frameCount, jump: jump.ms !== 0, paused: pausedAt !== null },
      loc: 'corsair', locName: 'Corsair Galleon 100 SD', machine: 'MacStudio',
    }) }).catch(() => {});
  };
  setTimeout(beat, 2000);
  setInterval(beat, BEAT_MS);
}

setInterval(() => {
  applyAudio();
  const landscape = paintable(tracks.landscape);
  paintLcd(lcd, landscape);
  playing = Boolean(landscape);
  frameCount++;
}, 100);

setInterval(() => void publishFrame(), 200);
setInterval(program, PROGRAM_MS);
void refreshPlayout();
void refreshPlaylist();
