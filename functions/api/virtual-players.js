import { accessFor, authHeaders, sessionEmail } from '../_auth-session.js';

const virtualID = s => typeof s === 'string' && /^(?:xtore-)?virtual-[a-z0-9][a-z0-9-]{2,47}$/.test(s);
const physicalID = s => typeof s === 'string' && /^[a-z0-9][a-z0-9_-]{1,79}$/.test(s) && !/^(?:xtore-)?virtual-/.test(s);
const json = (body, status = 200) => Response.json(body, { status, headers: authHeaders() });

export async function onRequestGet({ request, env }) {
  if (!env.VIRTUAL_PLAYERS) return json({ ok: false, error: 'registry_unavailable' }, 503);
  const params = new URL(request.url).searchParams;
  const device = params.get('device');
  try {
    if (device !== null) {
      if (!physicalID(device)) return json({ ok: false, error: 'invalid_physical_screen' }, 400);
      // Public programming assignment; never credentials or device telemetry.
      const pairing = await env.VIRTUAL_PLAYERS.getByName('physical:' + device).readPairing();
      return json({ ok: true, pairing });
    }
    const screen = params.get('screen');
    if (!virtualID(screen)) return json({ ok: false, error: 'invalid_virtual_player' }, 400);
    const player = await env.VIRTUAL_PLAYERS.getByName(screen).readPlayer();
    return json({ ok: true, player }, player ? 200 : 404);
  } catch (_) { return json({ ok: false, error: 'registry_unavailable' }, 503); }
}

export async function onRequestPost({ request, env }) {
  // First-party session + ACL. No fleet key is ever shipped to either website.
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return json({ ok: false, error: 'invalid_origin' }, 403);
  const actor = await sessionEmail(request, env);
  if (!actor) return json({ ok: false, error: 'unauthorized' }, 401);
  const access = await accessFor(env, actor, 'digitalsignage-player');
  if (!access.allowed || !['owner', 'admin', 'editor', 'operator'].includes(access.role)) return json({ ok: false, error: 'forbidden' }, 403);
  if (!env.VIRTUAL_PLAYERS) return json({ ok: false, error: 'registry_unavailable' }, 503);
  let body;
  try { body = await request.json(); } catch (_) { return json({ ok: false, error: 'invalid_json' }, 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ ok: false, error: 'invalid_request' }, 400);
  try {
    if (body.action === 'register') {
      if (!virtualID(body.screen)) return json({ ok: false, error: 'invalid_virtual_player' }, 400);
      return json(await env.VIRTUAL_PLAYERS.getByName(body.screen).register({ screen: body.screen, name: body.name, circuit: body.circuit, mode: body.mode }));
    }
    if (body.action !== 'pair' || !physicalID(body.device) || (body.screen !== null && !virtualID(body.screen)) || !Number.isSafeInteger(body.revision)) return json({ ok: false, error: 'invalid_pairing' }, 400);
    const source = body.screen === null ? null : await env.VIRTUAL_PLAYERS.getByName(body.screen).readPlayer();
    if (body.screen !== null && !source) return json({ ok: false, error: 'virtual_player_not_registered' }, 404);
    const pairing = await env.VIRTUAL_PLAYERS.getByName('physical:' + body.device).assignPairing({ screen: body.device, source, revision: body.revision });
    return json({ ok: true, pairing });
  } catch (error) {
    const conflict = /revision_conflict|ya está registrado/.test(error.message);
    return json({ ok: false, error: conflict ? 'revision_conflict' : 'request_failed', message: conflict ? 'El registro ha cambiado. Actualiza antes de volver a guardar.' : 'No se pudo guardar. Comprueba los datos y reintenta.' }, conflict ? 409 : 400);
  }
}
