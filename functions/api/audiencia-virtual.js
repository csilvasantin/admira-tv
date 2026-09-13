import { accessFor, authHeaders, sessionEmail } from '../_auth-session.js';

// RELÉ DE AUDIENCIA DEL PLAYER VIRTUAL (FLT-100400, Carlos 13-sep-2026: «sincronízalo con el player
// exterior que está emitiendo el Xtanco, condicionado por la cámara de la tienda de zapatillas»).
// El analizador de Xtore decide en el navegador el tipo de pasante y lo manda a su iframe; ese enlace
// no cruza dispositivos. Este relé lleva SOLO esa categoría al bus de audiencia de mcp-tv, en la
// pantalla del player virtual, para que los dispositivos físicos emparejados con él (assets/
// player-pairing.js) cambien de carril a la vez. Nunca viajan imágenes, cajas, identidad, sexo ni
// edad. La clave de flota vive en el servidor (XTORE_AUDIENCE_FLEET_KEY); el portal no la ve.
const virtualID = s => typeof s === 'string' && /^(?:xtore-)?virtual-[a-z0-9][a-z0-9-]{2,47}$/.test(s);
const KINDS = new Set(['person', 'car', 'motorcycle', 'bicycle', 'none']);
const BUS = 'https://mcp-tv.admira.store/audience/';
const json = (body, status = 200) => Response.json(body, { status, headers: authHeaders() });

export async function onRequestPost({ request, env, fetchImpl = fetch }) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return json({ ok: false, error: 'invalid_origin' }, 403);
  const actor = await sessionEmail(request, env);
  if (!actor) return json({ ok: false, error: 'unauthorized' }, 401);
  const access = await accessFor(env, actor, 'digitalsignage-player');
  if (!access.allowed || !['owner', 'admin', 'editor', 'operator'].includes(access.role)) return json({ ok: false, error: 'forbidden' }, 403);
  let body;
  try { body = await request.json(); } catch (_) { return json({ ok: false, error: 'invalid_json' }, 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ ok: false, error: 'invalid_request' }, 400);
  const extra = Object.keys(body).filter(k => k !== 'screen' && k !== 'kind');
  if (extra.length) return json({ ok: false, error: 'only_screen_and_kind' }, 400);   // nada de sexo, edad ni imágenes
  if (!virtualID(body.screen) || !KINDS.has(body.kind)) return json({ ok: false, error: 'invalid_audience' }, 400);
  if (!env.XTORE_AUDIENCE_FLEET_KEY) return json({ ok: false, error: 'relay_unconfigured' }, 503);
  if (env.VIRTUAL_PLAYERS) {
    const player = await env.VIRTUAL_PLAYERS.getByName(body.screen).readPlayer().catch(() => null);
    if (!player) return json({ ok: false, error: 'virtual_player_not_registered' }, 404);
  }
  // «none» no se publica: el bus caduca solo (TTL 2 s) y el player vuelve a su playlist.
  if (body.kind === 'none') return json({ ok: true, relayed: false, kind: 'none' });
  const label = { kind: body.kind, sex: 'u', age_band: 'unknown', confidence: 1, source: 'xtore-analizador', ts: new Date().toISOString() };
  let response;
  try {
    response = await fetchImpl(BUS + body.screen, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + env.XTORE_AUDIENCE_FLEET_KEY }, body: JSON.stringify(label) });
  } catch (_) { return json({ ok: false, error: 'bus_unreachable' }, 502); }
  const data = await response.json().catch(() => null);
  if (!response.ok || !data || data.ok === false) return json({ ok: false, error: 'bus_rejected', status: response.status }, 502);
  return json({ ok: true, relayed: true, kind: body.kind, lane: data.decision?.lane || null });
}
