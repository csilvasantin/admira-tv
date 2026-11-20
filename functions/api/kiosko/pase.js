// POST /api/kiosko/pase {screen, item, url} — el canal pide aquí el pase de kiosco de un elemento URL protegido de
// su playlist (p. ej. https://www.admiranext.com/analytics) y recibe {ok, src}: la dirección de canje en
// admiranext.com que pone en el iframe. Sin sesión: la pantalla no teclea nada. Solo se firma si esa URL está en la
// playlist PUBLICADA de esa pantalla (que solo escriben el portal o el Stock con su clave) y en las rutas de kiosco.
// El pase dura 120 s, es de un solo uso y no se escribe en logs.
import { authHeaders } from '../../_auth-session.js';
import { onRequestGet as leerPlaylist } from '../playlist.js';
import { emitirPaseKiosko, elementoConKiosko, ENTRADA_KIOSKO } from '../../_kiosko-pase.js';

function json(payload, status = 200){
  return Response.json(payload, {status, headers:authHeaders({'Cache-Control':'no-store, private, max-age=0'})});
}
function mismoOrigen(request){
  const site = request.headers.get('Sec-Fetch-Site');
  if(site && site !== 'same-origin' && site !== 'none') return false;
  const origin = request.headers.get('Origin');
  if(!origin || origin === 'null') return !origin;
  return /^https:\/\/(www\.)?admira\.tv$/.test(origin) || origin === new URL(request.url).origin;
}

export async function onRequestPost({request, env, waitUntil}){
  if(!mismoOrigen(request)) return json({ok:false, error:'origen'}, 403);
  let body = {};
  try{ body = await request.json(); }catch(_){ return json({ok:false, error:'json'}, 400); }
  const screen = String(body.screen || '').trim();
  if(!/^[a-z0-9][a-z0-9._-]{1,99}$/i.test(screen)) return json({ok:false, error:'bad_screen'}, 400);
  if(!env.ADMIRA_SSO_SECRET) return json({ok:false, error:'kiosko_no_configurado'}, 503);
  const origen = new URL(request.url).origin;
  const r = await leerPlaylist({request:new Request(origen + '/api/playlist?screen=' + encodeURIComponent(screen)), env, waitUntil:waitUntil || (() => {})});
  const d = r && r.ok ? await r.json().catch(() => null) : null;
  const items = d && d.draft && Array.isArray(d.draft.items) ? d.draft.items.concat(Array.isArray(d.auto) ? d.auto : []) : [];
  const hit = elementoConKiosko(items, {item:body.item, url:body.url});
  if(!hit) return json({ok:false, error:'no_en_playlist'}, 404);
  const {pase, exp} = await emitirPaseKiosko(env.ADMIRA_SSO_SECRET, {screen, ruta:hit.ruta});
  return json({ok:true, src:ENTRADA_KIOSKO + '?pase=' + pase, exp, ruta:hit.ruta});
}
export function onRequest(){ return json({ok:false, error:'usa POST'}, 405); }
