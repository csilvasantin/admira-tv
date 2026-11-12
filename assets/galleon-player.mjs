import { paintGalleon } from './galleon-layout.mjs';

const SCREEN = 'corsair-galleon-100';
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
  if (event.data?.type !== 'admira:galleon:select' || event.origin !== twinOrigin) return;
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
});

async function publishFrame() {
  if (!twinOrigin || exporting) return;
  exporting = true;
  let landscape, portrait;
  try {
    const framePlaying = playing;
    const ready = { landscape: Boolean(paintable(tracks.landscape)), portrait: Boolean(paintable(tracks.portrait)) };
    landscape = await createImageBitmap(lcd);
    portrait = await createImageBitmap(mosaic);
    window.parent.postMessage({ type: 'admira:galleon:frame', landscape, portrait, playing: framePlaying, ready }, twinOrigin, [landscape, portrait]);
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

function syncTrack(track, elapsed) {
  if (!track?.video) return;
  const media = track.media;
  if (Number.isFinite(media.duration) && media.duration > 0) {
    const target = (elapsed / 1000) % media.duration;
    if (Math.abs(target - media.currentTime) > 0.4) media.currentTime = target;
  }
  if (media.paused) void media.play().catch(() => {});
}

function paintable(track) {
  if (!track) return null;
  return (track.video ? track.media.readyState >= 2 : track.media.complete && track.media.naturalWidth > 0) ? track.media : null;
}

async function refresh() {
  const start = Date.now();
  try {
    const response = await fetch('/api/playout?screen=' + SCREEN, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return;
    const plan = await response.json();
    if (!plan.ok) return;
    if (twinSelection !== null) return;
    const enabled = plan.power !== 'off';
    setTrack('landscape', enabled ? plan.variants?.landscape || plan.item : null);
    setTrack('portrait', enabled ? plan.variants?.portrait : null);
    const elapsed = Math.max(0, Number(plan.serverNow) - Number(plan.updatedAt) + (Date.now() - start) / 2);
    if (plan.updatedAt && Number.isFinite(elapsed)) {
      for (const track of Object.values(tracks)) syncTrack(track, elapsed);
    }
  } catch {
    // Mantén el contenido ya cargado si falla un sondeo.
  } finally {
    setTimeout(refresh, 2500);
  }
}

setInterval(() => {
  const landscape = paintable(tracks.landscape);
  const portrait = paintable(tracks.portrait);
  paintGalleon(surfaces, { landscape, portrait });
  playing = Boolean(landscape || portrait);
}, 100);

setInterval(() => void publishFrame(), 200);
void refresh();
