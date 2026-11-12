import { paintGalleon } from './galleon-layout.mjs';

const SCREEN = 'corsair-galleon-100';
const lcd = document.querySelector('#galleon-lcd');
const mosaic = document.createElement('canvas');
const keys = Array.from(document.querySelectorAll('#galleon-keys canvas'));
const surfaces = { lcd, mosaic, keys };
const tracks = { landscape: null, portrait: null };

function makeTrack(item) {
  if (!item?.url) return null;
  const url = new URL(item.url);
  if (url.protocol !== 'https:') return null;
  const video = item.type === 'video';
  const media = document.createElement(video ? 'video' : 'img');
  if (video) {
    media.muted = true;
    media.playsInline = true;
    media.loop = true;
    media.preload = 'auto';
  }
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
  tracks[orientation] = makeTrack(item);
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
  return (track.video ? track.media.readyState >= 2 : track.media.complete) ? track.media : null;
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
  paintGalleon(surfaces, {
    landscape: paintable(tracks.landscape),
    portrait: paintable(tracks.portrait),
  });
}, 100);

void refresh();
