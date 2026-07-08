// Gamificación — PROXY same-origin de admira.tv al MOTOR REAL (Worker admira-loyalty).
//
// Va same-origin en admira.tv (NO *.workers.dev) porque los ISP españoles bloquean
// 188.114.96.0/22 → workers.dev inaccesible para el navegador (lección de la casa).
// El navegador llama a /gamification/api/<path>; esta función reenvía al Worker de
// producción con una ALLOWLIST ESTRICTA. Sin secretos (el Worker protege lo suyo).
//
// Rutas permitidas (catch-all [[path]] bajo /gamification/api/):
//   POST /gamification/api/events                    → Worker POST /events
//   GET  /gamification/api/gamification/me           → Worker GET  /gamification/me
//   GET  /gamification/api/gamification/leaderboard  → Worker GET  /gamification/leaderboard
// Cualquier otra ruta (p.ej. /admin, rutas del Club) → 404. Nunca se reenvía.

const UPSTREAM = 'https://admira-loyalty.csilvasantin.workers.dev';

// path canónico → método HTTP exacto permitido. Todo lo demás se rechaza.
const ALLOW = {
  'events': 'POST',
  'gamification/me': 'GET',
  'gamification/leaderboard': 'GET',
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

async function proxy(ctx) {
  const { request, params } = ctx;

  // Reconstruye el path pedido a partir del catch-all ([[path]] → array o string).
  const parts = Array.isArray(params.path) ? params.path : (params.path ? [params.path] : []);
  const key = parts.join('/');

  // Allowlist estricta: path conocido Y método exacto.
  const wantMethod = ALLOW[key];
  if (!wantMethod || wantMethod !== request.method) {
    return json({ error: 'not_found', path: key }, 404);
  }

  // Query se pasa tal cual (subjectId, locationId, …). Nunca cabeceras de auth.
  const src = new URL(request.url);
  const target = UPSTREAM + '/' + key + (src.search || '');

  const init = {
    method: request.method,
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
  };
  if (request.method === 'POST') {
    init.body = await request.text(); // body verbatim, sin re-serializar
  }

  let up;
  try {
    up = await fetch(target, init);
  } catch (e) {
    // Degradación elegante: el panel muestra esqueleto + aviso si el motor no responde.
    return json({ error: 'upstream_unreachable', message: String((e && e.message) || e) }, 502);
  }

  // Pasa status y cuerpo tal cual; fuerza JSON y no-cache.
  const text = await up.text();
  return new Response(text, {
    status: up.status,
    headers: {
      'Content-Type': up.headers.get('Content-Type') || 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export const onRequestGet = (ctx) => proxy(ctx);
export const onRequestPost = (ctx) => proxy(ctx);

// Same-origin no dispara preflight CORS; respondemos OPTIONS por si acaso.
export const onRequestOptions = () =>
  new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
