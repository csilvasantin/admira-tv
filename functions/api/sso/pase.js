// GET /api/sso/pase?aud=admiranext.com — pase SSO firmado de un solo uso y 2 minutos (Yokup #3165).
// Solo mismo origen (la página del catálogo lo pide con fetch + credentials:'include').
//   401 sin sesión del portal · 403 si el email no está en ADMIRA_SSO_EMAILS · 503 sin secreto
//   200 {ok:true, pase, exp, email_masked}
// Contrato y firma en functions/_sso-pase.js. El pase NUNCA se escribe en logs.
import { readSession, hasAnyAccess, authHeaders } from '../../_auth-session.js';
import { emitirPase, emailsPermitidos, emailEnmascarado, normEmail, AUD_DEFECTO } from '../../_sso-pase.js';

const AUDS = new Set([AUD_DEFECTO]);

function json(payload, status = 200){
  return Response.json(payload, {status, headers:authHeaders({'Cache-Control':'no-store, private, max-age=0', 'Vary':'Cookie'})});
}

function mismoOrigen(request){
  // fetch same-origin no manda Origin en GET; Sec-Fetch-Site sí. Se rechaza lo que venga
  // declaradamente de otro sitio; si el navegador no lo declara, la cookie __Host- SameSite=Lax
  // ya no viaja en sub-peticiones cross-site.
  const site = request.headers.get('Sec-Fetch-Site');
  if(site && site !== 'same-origin' && site !== 'none') return false;
  const origin = request.headers.get('Origin');
  if(origin){ try{ return new URL(origin).origin === new URL(request.url).origin; }catch(_){ return false; } }
  return true;
}

export async function onRequestGet({ request, env }){
  if(!mismoOrigen(request)) return json({ok:false, error:'origen'}, 403);
  const url = new URL(request.url);
  const aud = String(url.searchParams.get('aud') || AUD_DEFECTO).trim().toLowerCase();
  if(!AUDS.has(aud)) return json({ok:false, error:'aud'}, 400);
  const session = await readSession(request, env);
  if(!session || !(await hasAnyAccess(env, session.email))) return json({ok:false, error:'unauthorized'}, 401);
  const email = normEmail(session.email);
  if(!emailsPermitidos(env).has(email)) return json({ok:false, error:'forbidden', email_masked:emailEnmascarado(email)}, 403);
  if(!env.ADMIRA_SSO_SECRET) return json({ok:false, error:'sso_no_configurado'}, 503);
  const {pase, exp} = await emitirPase(env.ADMIRA_SSO_SECRET, {email, aud});
  return json({ok:true, pase, exp, aud, email_masked:emailEnmascarado(email)});
}

export function onRequest(){
  return new Response(null, {status:405, headers:authHeaders({Allow:'GET'})});
}
