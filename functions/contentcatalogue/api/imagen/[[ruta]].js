// /contentcatalogue/api/imagen[/<catalogo_id>/<slug>] — imagen real del producto (ver _imagen-lib.js).
// Un solo fichero: en Pages Functions el comodín [[ruta]] captura también la ruta base
// (/contentcatalogue/api/imagen), así que un imagen.js hermano nunca llegaría a ejecutarse.
//   POST  /contentcatalogue/api/imagen                      guarda el recorte (sesión del portal + mismo origen)
//   GET   /contentcatalogue/api/imagen                      sonda {ok, configured}
//   GET   /contentcatalogue/api/imagen/<catalogo_id>/<slug> la imagen (pública, CORS *, caché 1 día)
import { guardarImagen, servirImagen, json, preflight } from '../_imagen-lib.js';

export async function onRequest(context){
  const {request, env, params} = context;
  if(request.method === 'OPTIONS') return preflight();
  const partes = (Array.isArray(params.ruta) ? params.ruta : String(params.ruta || '').split('/')).filter(Boolean);
  if(!partes.length){
    if(request.method === 'POST') return guardarImagen(context);
    if(request.method === 'GET' || request.method === 'HEAD') return json({ok:true, configured:Boolean(env.CATALOGO), url:'/contentcatalogue/api/imagen/<catalogo_id>/<slug>'});
    return json({error:'Método no permitido.'}, 405);
  }
  if(request.method !== 'GET' && request.method !== 'HEAD') return json({error:'Método no permitido.'}, 405);
  if(partes.length !== 2) return new Response('Not found', {status:404, headers:{'cache-control':'no-store'}});
  return servirImagen(context, decodeURIComponent(partes[0]), decodeURIComponent(partes[1]).replace(/\.(jpe?g|png|webp)$/i, ''));
}
