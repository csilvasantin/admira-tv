// Imagen real de cada producto del catálogo (FLT-100318). La página recorta la
// fotografía del folleto (bbox del analizador sobre el lienzo de pdf.js) y la sube
// aquí; el creador de anuncios (admiranext.com/tiktok) la pinta en un canvas con
// crossOrigin="anonymous", así que el GET es PÚBLICO, cacheable y con CORS abierto.
//
//   POST /contentcatalogue/api/imagen              {catalogo_id, slug, image:"data:image/jpeg;base64,…"}
//        → {ok:true, url:"https://admira.tv/contentcatalogue/api/imagen/<catalogo_id>/<slug>"}
//        Verja: la misma sesión del portal que ya pasa la página (cookie __Host-atv_session,
//        functions/_auth-session.js) + mismo origen. No hay token aparte: la Function lee la
//        sesión, así que no hace falta un secreto extra que mantener. El sembrado desde la
//        CLI va directo al bucket con `wrangler r2 object put`.
//   GET  /contentcatalogue/api/imagen/<catalogo_id>/<slug>   → la imagen (Cache-Control 1 día, ACAO *)
//   GET  /contentcatalogue/api/imagen                         → {ok, configured} (sonda)
//
// Rutas: functions/contentcatalogue/api/imagen/[[ruta]].js (el comodín captura también la base).
// Almacén: bucket R2 admira-catalogo-imagenes (binding CATALOGO, wrangler.toml), clave
// cc/img/<catalogo_id>/<slug>. Las páginas completas del folleto van con slug pagina-<n>
// (el modal de la ficha las enseña con la caja resaltada).

import { readSession, hasAnyAccess } from '../../_auth-session.js';

export const MAX_BODY_BYTES = 900 * 1024;      // dataURL de un recorte ≤512 px (~150 KB) o una página (~250 KB)
const ID_RE = /^[a-z0-9][a-z0-9-]{0,59}$/;
const DATA_RE = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/;
export const PUBLIC_ORIGIN = 'https://admira.tv';

export function json(payload, status = 200, extra = {}){
  return Response.json(payload, {status, headers:{'cache-control':'no-store', 'x-content-type-options':'nosniff', ...extra}});
}

export function idValido(v){ return ID_RE.test(String(v || '')); }
export function clave(catalogoId, slug){ return `cc/img/${catalogoId}/${slug}`; }
export function urlPublica(catalogoId, slug){ return `${PUBLIC_ORIGIN}/contentcatalogue/api/imagen/${catalogoId}/${slug}`; }

function sameOrigin(request){
  const origin = request.headers.get('origin');
  if(!origin) return false;
  try{ return new URL(origin).origin === new URL(request.url).origin; }
  catch(_){ return false; }
}

async function readLimited(request, maxBytes){
  const declared = Number(request.headers.get('content-length') || 0);
  if(declared > maxBytes) throw new Error('body_too_large');
  const buf = new Uint8Array(await request.arrayBuffer());
  if(buf.byteLength > maxBytes) throw new Error('body_too_large');
  if(!buf.byteLength) throw new Error('body_empty');
  try{ return JSON.parse(new TextDecoder().decode(buf)); }catch(_){ throw new Error('json_invalid'); }
}

function decodeBase64(b64){
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for(let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function guardarImagen({request, env}){
  if(!sameOrigin(request)) return json({error:'Origen no permitido.'}, 403);
  if(!env.CATALOGO) return json({error:'Almacén de imágenes no configurado (binding CATALOGO).', configured:false}, 503);
  const session = await readSession(request, env);
  if(!session || !(await hasAnyAccess(env, session.email))) return json({error:'Inicia sesión en admira.tv para guardar imágenes.'}, 401);

  let body;
  try{ body = await readLimited(request, MAX_BODY_BYTES); }
  catch(error){
    const grande = error.message === 'body_too_large';
    return json({error:grande ? 'La imagen supera el tamaño permitido (máx. ~650 KB).' : 'Envía {catalogo_id, slug, image}.'}, grande ? 413 : 400);
  }
  const catalogoId = String(body?.catalogo_id || ''), slug = String(body?.slug || '');
  if(!idValido(catalogoId) || !idValido(slug)) return json({error:'catalogo_id y slug deben ser [a-z0-9-] (máx. 60).'}, 400);
  const m = DATA_RE.exec(String(body?.image || ''));
  if(!m) return json({error:'image debe ser un data URL JPEG, PNG o WebP.'}, 415);
  let bytes;
  try{ bytes = decodeBase64(m[2]); }catch(_){ return json({error:'La imagen no es base64 válido.'}, 400); }
  if(!bytes.byteLength) return json({error:'La imagen está vacía.'}, 400);
  const type = `image/${m[1]}`;
  await env.CATALOGO.put(clave(catalogoId, slug), bytes, {
    httpMetadata:{contentType:type, cacheControl:'public, max-age=86400'},
    customMetadata:{type, catalogo_id:catalogoId, slug, por:String(session.email || ''), fecha:new Date().toISOString()}
  });
  return json({ok:true, url:urlPublica(catalogoId, slug), bytes:bytes.byteLength, type});
}

export async function servirImagen({env, request}, catalogoId, slug){
  if(!idValido(catalogoId) || !idValido(slug)) return new Response('Not found', {status:404, headers:{'cache-control':'no-store'}});
  if(!env.CATALOGO) return new Response('Almacén no configurado', {status:503});
  const obj = request.method === 'HEAD' ? await env.CATALOGO.head(clave(catalogoId, slug)) : await env.CATALOGO.get(clave(catalogoId, slug));
  if(!obj) return new Response('Not found', {status:404, headers:{'cache-control':'public, max-age=60', 'access-control-allow-origin':'*'}});
  const headers = new Headers({
    'content-type':obj.httpMetadata?.contentType || obj.customMetadata?.type || 'image/jpeg',
    'cache-control':'public, max-age=86400',
    'access-control-allow-origin':'*',
    'access-control-expose-headers':'etag',
    'x-content-type-options':'nosniff',
    'etag':obj.httpEtag,
    'content-length':String(obj.size)
  });
  const ifNone = request.headers.get('if-none-match');
  if(ifNone && ifNone === obj.httpEtag) return new Response(null, {status:304, headers});
  return new Response(request.method === 'HEAD' ? null : obj.body, {status:200, headers});
}

export function preflight(){
  return new Response(null, {status:204, headers:{'access-control-allow-origin':'*', 'access-control-allow-methods':'GET, HEAD, OPTIONS', 'access-control-allow-headers':'*', 'access-control-max-age':'86400'}});
}
