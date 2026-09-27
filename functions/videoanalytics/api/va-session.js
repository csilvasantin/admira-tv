import {accessFor, authHeaders, readSession} from '../../_auth-session.js';

// Productor servidor del P0 VA (FLT-101113 · #4475). El navegador del analizador
// entrega aquí el snapshot agregado admira.audience-session.v1 con su sesión admin;
// este Worker lo firma con la credencial de flota (solo servidor) y lo publica en
// va_session_publish del MCP de Admira.tv (FLT-101073/101077, Oráculo). Sin
// VA_MCP_TOKEN + VA_ACCOUNT el puente queda apagado (503) y no toca nada.
const ENDPOINT='https://mcp-tv.admira.store/mcp';
const SITE='admira-xperience-santa-rosa-19';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ACCOUNT=/^[a-z0-9][a-z0-9-]{0,79}$/;
const MAX_BODY=4096;
const json=(data,status=200)=>Response.json(data,{status,headers:authHeaders()});

// Solo la forma básica: el contrato completo (esquema cerrado, tiempos, replay)
// lo valida va_session_publish; aquí no se duplica ni se reescribe.
export function validSnapshot(s){
  return !!s&&typeof s==='object'&&!Array.isArray(s)&&s.schema==='admira.audience-session.v1'&&s.site===SITE&&typeof s.sessionId==='string'&&UUID.test(s.sessionId)&&Number.isSafeInteger(s.updatedAt)&&Number.isSafeInteger(s.startedAt);
}
async function readBody(request){
  const text=await request.text();
  if(text.length>MAX_BODY)throw new Error('size');
  return JSON.parse(text);
}
// El MCP responde JSON o SSE (event: message / data: {...}).
export function parseRpc(text){
  const line=text.split('\n').find(l=>l.startsWith('data:'));
  return JSON.parse(line?line.slice(5):text);
}
export async function publish(env,snapshot,{fetchImpl=fetch,now=Date.now()}={}){
  // seq y ts salen del reloj del servidor: crecen en cada latido y no dependen del navegador.
  const args={account:env.VA_ACCOUNT,site:SITE,sessionId:snapshot.sessionId,seq:now,ts:now,snapshot};
  const response=await fetchImpl(env.VA_MCP_ENDPOINT||ENDPOINT,{method:'POST',
    headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream',Authorization:`Bearer ${env.VA_MCP_TOKEN}`,'User-Agent':'admira-tv-va-producer/1'},
    body:JSON.stringify({jsonrpc:'2.0',id:now,method:'tools/call',params:{name:'va_session_publish',arguments:args}}),signal:AbortSignal.timeout(5000)});
  if(!response.ok)return {ok:false,error:'va_upstream_http',status:response.status};
  const data=parseRpc(await response.text());
  if(data.error)return {ok:false,error:'va_upstream_rpc'};
  const text=data.result?.content?.[0]?.text||'';
  // Solo se reenvía el código va_* del MCP, nunca el texto libre del upstream.
  if(data.result?.isError)return {ok:false,error:(text.match(/va_[a-z_]+/)||['va_rejected'])[0]};
  const r=JSON.parse(text);
  return {ok:true,revision:r.revision,duplicate:!!r.duplicate,identity:r.identity};
}
export async function onRequest({request,env},deps={}){
  try{
    if(request.method!=='POST')return json({ok:false,error:'method'},405);
    const origin=new URL(request.url).origin;
    if(request.headers.get('origin')!==origin||request.headers.get('content-type')?.split(';')[0]!=='application/json')return json({ok:false,error:'origin_or_type'},403);
    const session=await readSession(request,env);
    if(!session)return json({ok:false,error:'unauthorized'},401);
    const access=await accessFor(env,session.email,'admira-tv',true);
    if(!access.allowed)return json({ok:false,error:'forbidden'},403);
    if(!env.VA_MCP_TOKEN||!ACCOUNT.test(env.VA_ACCOUNT||''))return json({ok:false,error:'va_bridge_not_configured'},503);
    let body;try{body=await readBody(request);}catch{return json({ok:false,error:'invalid_body'},400);}
    if(!body||Object.keys(body).some(k=>k!=='snapshot')||!validSnapshot(body.snapshot))return json({ok:false,error:'invalid_snapshot'},400);
    const result=await publish(env,body.snapshot,deps);
    return json(result,result.ok?200:502);
  }catch{
    console.error(JSON.stringify({event:'xtore_va_bridge_unavailable'}));
    return json({ok:false,error:'va_bridge_unavailable'},503);
  }
}
