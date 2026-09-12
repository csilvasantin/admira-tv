// /api/previo/<id>.jpg — foto de fachada del «previo DooH» de una ubicación (FLT-100364 · Yokup #3210).
// La captura (Street View proyectada 1600x900) vive en el bucket R2 admira-catalogo-imagenes
// (binding CATALOGO, wrangler.toml) con clave previo/<id>.jpg; se siembra desde la CLI:
//   env -u CLOUDFLARE_API_TOKEN npx wrangler r2 object put admira-catalogo-imagenes/previo/<id>.jpg \
//     --file <jpg> --content-type image/jpeg --remote
// El registro de la ubicación en el KV de omnipublicity (previo.imagen) apunta aquí y la UI del
// previo pinta el player (previo.quad) sobre esta imagen en un canvas con crossOrigin="anonymous":
// por eso el GET es público, cacheable 1 día y con CORS abierto. Un solo fichero [[ruta]]: en Pages
// Functions el comodín captura también la base (/api/previo → sonda), patrón de
// functions/contentcatalogue/api/imagen/[[ruta]].js.
//   GET  /api/previo             → {ok, configured}
//   GET  /api/previo/<id>.jpg    → la imagen (200) · 404 si no existe
const ID_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;
const CORS = {'access-control-allow-origin':'*', 'access-control-allow-methods':'GET, HEAD, OPTIONS', 'access-control-max-age':'86400'};

function json(payload, status = 200){
  return Response.json(payload, {status, headers:{'cache-control':'no-store', 'x-content-type-options':'nosniff', ...CORS}});
}
function notFound(){
  return new Response('Not found', {status:404, headers:{'cache-control':'public, max-age=60', ...CORS}});
}

export async function onRequest({request, env, params}){
  if(request.method === 'OPTIONS') return new Response(null, {status:204, headers:CORS});
  if(request.method !== 'GET' && request.method !== 'HEAD') return json({error:'Método no permitido.'}, 405);
  const partes = (Array.isArray(params.ruta) ? params.ruta : String(params.ruta || '').split('/')).filter(Boolean);
  if(!partes.length) return json({ok:true, configured:Boolean(env.CATALOGO), url:'/api/previo/<id>.jpg'});
  if(partes.length !== 1 || !env.CATALOGO) return notFound();
  const id = decodeURIComponent(partes[0]).replace(/\.(jpe?g|png|webp)$/i, '');
  if(!ID_RE.test(id)) return notFound();
  const obj = await env.CATALOGO.get(`previo/${id}.jpg`);
  if(!obj) return notFound();
  const headers = new Headers({
    'content-type': obj.httpMetadata?.contentType || 'image/jpeg',
    'cache-control': 'public, max-age=86400',
    'x-content-type-options': 'nosniff',
    ...CORS
  });
  if(obj.httpEtag) headers.set('etag', obj.httpEtag);
  return new Response(request.method === 'HEAD' ? null : obj.body, {status:200, headers});
}
