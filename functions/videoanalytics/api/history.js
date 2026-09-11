import {accessFor, authHeaders, readSession} from '../../_auth-session.js';

const KINDS=new Set(['person','car','motorcycle','bicycle','scooter']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DAY=86400000,MAX_BODY=32768;
const json=(data,status=200)=>Response.json(data,{status,headers:authHeaders()});
async function readBody(request){
  if(!request.body)throw new Error('body');
  const reader=request.body.getReader(),chunks=[];let length=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>MAX_BODY){await reader.cancel();throw new Error('size');}chunks.push(value);}}
  finally{reader.releaseLock();}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return JSON.parse(new TextDecoder().decode(bytes));
}
export function validateEvents(body,now){
  if(!body||Object.keys(body).some(k=>k!=='events')||!Array.isArray(body.events)||!body.events.length||body.events.length>100)return null;
  const ids=new Set();
  for(const e of body.events){
    if(!e||Object.keys(e).some(k=>!['id','kind','at','source'].includes(k))||typeof e.id!=='string'||!UUID.test(e.id)||ids.has(e.id)||!KINDS.has(e.kind)||!['detector','manual'].includes(e.source)||e.kind==='scooter'&&e.source!=='manual'||!Number.isSafeInteger(e.at)||e.at<now-7*DAY||e.at>now+60000)return null;
    ids.add(e.id);
  }
  return body.events;
}
// Fixed Xtore scope. Never trust a camera/tenant supplied by the browser.
// The existing, verified portal session and root admin/owner role are required.
export async function onRequest({request,env}){
  try{
    if(!['GET','POST'].includes(request.method))return json({ok:false,error:'method'},405);
    const origin=new URL(request.url).origin;
    if(request.method==='POST'&&(request.headers.get('origin')!==origin||request.headers.get('content-type')?.split(';')[0]!=='application/json'))return json({ok:false,error:'origin_or_type'},403);
    const session=await readSession(request,env);
    if(!session)return json({ok:false,error:'unauthorized'},401);
    const access=await accessFor(env,session.email,'admira-tv',true);
    if(!access.allowed)return json({ok:false,error:'forbidden'},403);
    const db=env.VIDEO_ANALYTICS_DB;
    if(!db)return json({ok:false,error:'history_not_configured'},503);
    const now=Date.now();
    if(request.method==='GET'){
      const params=new URL(request.url).searchParams;
      const from=Number(params.get('from')??now-31*DAY),to=Number(params.get('to')??now+60000);
      if(!Number.isSafeInteger(from)||!Number.isSafeInteger(to)||from<0||to<=from||to-from>32*DAY)return json({ok:false,error:'invalid_range'},400);
      const {results}=await db.prepare('SELECT CAST(at / 3600000 AS INTEGER) * 3600000 AS hour, kind, source, COUNT(*) AS total FROM xtore_passages WHERE at >= ? AND at < ? GROUP BY hour, kind, source ORDER BY hour DESC').bind(from,to).all();
      return json({ok:true,camera:'puerta-cam',timezone:'Europe/Madrid',rows:results});
    }
    let body;try{body=await readBody(request);}catch{return json({ok:false,error:'invalid_body'},400);}
    const events=validateEvents(body,now);if(!events)return json({ok:false,error:'invalid_events'},400);
    // Atomic batches + primary key make uncertain retries idempotent. Fields are
    // whitelisted above: images, descriptions, bounding boxes and identities fail.
    const results=await db.batch(events.map(e=>db.prepare('INSERT INTO xtore_passages (id, kind, at, source) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO NOTHING').bind(e.id,e.kind,e.at,e.source)));
    return json({ok:true,accepted:events.map(e=>e.id),inserted:results.reduce((sum,r)=>sum+r.meta.changes,0)});
  }catch{
    console.error(JSON.stringify({event:'xtore_history_unavailable'}));
    return json({ok:false,error:'history_unavailable'},503);
  }
}
