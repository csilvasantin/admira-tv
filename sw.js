/* admira.tv service worker — DISCO-PRIMERO de punta a punta (r44).
 * Objetivo: que el CANAL arranque y emita SIN RED, incluido un reinicio del player
 * (WKWebView macOS/iOS · Electron Windows/Linux · WebView Android cargan www.admira.tv).
 *
 * DOCTRINA:
 *  1) APP SHELL DEL CANAL: /canal (URL canónica; el player navega a /canal.html?embed=mupi
 *     y Cloudflare hace 308 → /canal) + assets críticos (admira-nav.js, xpl-runtime.js,
 *     favicon, iconos) → NETWORK-FIRST con fallback a caché. NUNCA stale-while-revalidate
 *     para el shell: _headers sirve el HTML no-cache a propósito y los deploys deben verse
 *     al instante CON red; el SW solo entra al rescate SIN red o con error de red.
 *  2) NO INTERFERIR: el SW NO toca el media del reproductor (lo gestiona la Cache API
 *     'admira-canal-v1' de canal.html; además el media es cross-origin → passthrough total),
 *     ni las APIs (api.admira.store, *.workers.dev), ni /signage/shot, ni POST /screen/cache.
 *     Todo lo que no sea shell → passthrough (sin respondWith → red directa).
 *  3) VERSIONADO: caché de shell propia y versionada; en activate se limpian SOLO versiones
 *     viejas del shell (admira-shell-* / admira-tv-*) — JAMÁS 'admira-canal-v1' (media en disco).
 *     skipWaiting + clients.claim → los players cogen el SW nuevo al primer reinicio con red.
 */
const CACHE = 'admira-shell-r44';

// Shell del canal: la HTML canónica + sus assets críticos same-origin.
const SHELL = [
  '/',
  '/canal',
  '/favicon.svg',
  '/admira-nav.js',
  '/xpl-runtime.js',
  '/offline.html',
  '/icon-192.png',
  '/icon-512.png',
];

// Assets críticos same-origin (no-HTML) que el shell necesita para arrancar offline.
// Se comparan por PATH (ignorando ?v=… de cache-busting).
const CRITICAL = new Set([
  '/favicon.svg',
  '/admira-nav.js',
  '/xpl-runtime.js',
  '/icon-192.png',
  '/icon-512.png',
]);

self.addEventListener('install', (e) => {
  // addAll es atómico: si un asset falla, no rompemos la instalación (cache individual best-effort).
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      Promise.all(SHELL.map((u) => c.add(u).catch(() => {})))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(
        ks
          // Limpia SOLO versiones viejas del shell. NUNCA 'admira-canal-v1' (media en disco
          // del canal) ni ninguna otra caché ajena.
          .filter((k) => k !== CACHE && /^admira-(shell|tv)-/.test(k))
          .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Network-first con fallback a caché. Guarda una copia fresca cuando hay red.
// `fallbacks`: lista de peticiones/URLs alternativas a probar en caché si falla la red.
function networkFirst(req, fallbacks) {
  return fetch(req)
    .then((r) => {
      // Solo cacheamos respuestas OK y básicas (no opaque/redirect) para no envenenar el shell.
      if (r && r.ok && (r.type === 'basic' || r.type === 'default')) {
        const cp = r.clone();
        caches.open(CACHE).then((c) => c.put(req, cp)).catch(() => {});
      }
      return r;
    })
    .catch(async () => {
      const c = await caches.open(CACHE);
      // 1) match exacto  2) ignorando query (?v=, ?embed=…)  3) fallbacks explícitos
      let hit = await c.match(req);
      if (hit) return hit;
      hit = await c.match(req, { ignoreSearch: true });
      if (hit) return hit;
      for (const f of (fallbacks || [])) {
        hit = await c.match(f, { ignoreSearch: true });
        if (hit) return hit;
      }
      return Response.error();
    });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;              // POST /screen/cache, etc. → red directa
  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (url.origin !== self.location.origin) return; // media + APIs cross-origin → intactos

  const isHTML = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');

  if (isHTML) {
    // El player navega a /canal.html?embed=mupi → 308 → /canal?embed=mupi. Offline no hay
    // 308, así que para cualquier ruta /canal* caemos al shell de /canal cacheado; last resort /offline.html.
    const isCanal = /^\/canal(\.html)?$/.test(url.pathname);
    const fallbacks = isCanal ? ['/canal', '/offline.html'] : ['/offline.html'];
    e.respondWith(networkFirst(req, fallbacks));
    return;
  }

  // Assets críticos del shell (same-origin): network-first, fallback a caché (ignora ?v=).
  if (CRITICAL.has(url.pathname)) {
    e.respondWith(networkFirst(req, [url.pathname]));
    return;
  }

  // Resto same-origin (media same-origin si lo hubiera, /assets, /signage/shot GET, etc.):
  // passthrough → lo maneja la red / la Cache API del canal. El SW no interfiere.
});
