/* admira.tv service worker — conservador y seguro para la flota:
 * - Solo intercepta GET del MISMO origen (NUNCA toca api.admira.store ni terceros → los datos de emisión van siempre a red).
 * - HTML/navegación: network-first (siempre fresco cuando hay red; cae a caché y luego a /offline.html sin conexión).
 * - Estáticos (svg/png/js/css): stale-while-revalidate (ya van versionados con ?v=).
 * Bump CACHE para invalidar en cada release. */
const CACHE = 'admira-tv-r36';
const SHELL = ['/', '/favicon.svg', '/offline.html', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (url.origin !== self.location.origin) return; // cross-origin (api.admira.store, etc.) → intacto

  const isHTML = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  if (isHTML) {
    // network-first: emisión siempre fresca; sin red → caché → offline
    e.respondWith(
      fetch(req)
        .then((r) => { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); return r; })
        .catch(() => caches.match(req).then((m) => m || caches.match('/offline.html')))
    );
    return;
  }

  // estáticos: stale-while-revalidate
  e.respondWith(
    caches.match(req).then((m) => {
      const net = fetch(req)
        .then((r) => { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); return r; })
        .catch(() => m);
      return m || net;
    })
  );
});
