import {accessFor, authHeaders, readSession} from '../../_auth-session.js';
import {CATEGORIES, STYLES, twinPrompt} from '../../../videoanalytics/xtore/twins.mjs';

// /image/edit de api.admira.store es generación de pago: sin sesión Pixeria ni clave
// de flota responde 401 «unauthorized». Xtore llamaba desde el navegador sin
// credenciales; aquí la sesión de Admira.tv abre la puerta y la clave (STOCK_NOTIFY_KEY,
// = NOTIFY_KEY del worker) se queda en el servidor. El prompt lo fija el servidor.
const EDIT='https://api.admira.store/image/edit';
const MAX_BODY=6_000_000, MAX_RESPONSE=8_100_000;
const SYS='Genera un objeto ficticio redibujado. No describas ni clasifiques atributos sensibles. Nunca copies una identidad real.';
const json=(data,status=200)=>Response.json(data,{status,headers:authHeaders()});

async function readBody(request){
  const text=await request.text();
  if(text.length>MAX_BODY)throw new Error('size');
  return JSON.parse(text);
}
export async function onRequest({request,env},{fetchImpl=fetch}={}){
  try{
    if(request.method!=='POST')return json({ok:false,error:'method'},405);
    if(request.headers.get('origin')!==new URL(request.url).origin||request.headers.get('content-type')?.split(';')[0]!=='application/json')return json({ok:false,error:'origin_or_type'},403);
    const session=await readSession(request,env);
    if(!session)return json({ok:false,error:'unauthorized'},401);
    const access=await accessFor(env,session.email,'admira-tv');
    if(!access.allowed)return json({ok:false,error:'forbidden'},403);
    if(!env.STOCK_NOTIFY_KEY)return json({ok:false,error:'edit_not_configured'},503);
    let body;try{body=await readBody(request);}catch{return json({ok:false,error:'invalid_body'},400);}
    if(!body||Object.keys(body).some(k=>!['image','category','style'].includes(k))||!Object.hasOwn(CATEGORIES,body.category)||!Object.hasOwn(STYLES,body.style)||typeof body.image!=='string'||!body.image.startsWith('data:image/png;base64,'))return json({ok:false,error:'invalid_edit'},400);
    const upstream=await fetchImpl(EDIT,{method:'POST',headers:{'Content-Type':'application/json','X-Notify-Key':env.STOCK_NOTIFY_KEY},
      body:JSON.stringify({image:body.image,mime:'image/png',sys:SYS,prompt:twinPrompt(body.category,body.style)}),signal:AbortSignal.timeout(85_000)});
    body.image=null;
    if(!upstream.ok){await upstream.body?.cancel();return json({ok:false,error:'edit_upstream_http',status:upstream.status},502);}
    if(Number(upstream.headers.get('content-length'))>MAX_RESPONSE){await upstream.body?.cancel();return json({ok:false,error:'edit_too_large'},502);}
    return new Response(upstream.body,{status:200,headers:{...authHeaders(),'content-type':'application/json','cache-control':'no-store'}});
  }catch{
    console.error(JSON.stringify({event:'xtore_edit_unavailable'}));
    return json({ok:false,error:'edit_unavailable'},503);
  }
}
