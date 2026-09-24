import {accessFor, authHeaders, readSession} from '../../_auth-session.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VEHICLES=new Set(['car','motorcycle','bicycle']);
const TTL=48*60*60*1000, MAX_JPEG=40000;
const json=(data,status=200)=>Response.json(data,{status,headers:authHeaders()});

async function readBody(request){
  if(!request.body)throw new Error('body');
  const reader=request.body.getReader(),chunks=[];let length=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>90000){await reader.cancel();throw new Error('size');}chunks.push(value);}}
  finally{reader.releaseLock();}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return JSON.parse(new TextDecoder().decode(bytes));
}
function jpegBytes(value){
  if(typeof value!=='string'||!value.length||value.length>60000)return null;
  let raw;try{raw=Uint8Array.from(atob(value),c=>c.charCodeAt(0));}catch{return null;}
  if(raw.length<40||raw.length>MAX_JPEG||raw[0]!==0xff||raw[1]!==0xd8||raw[2]!==0xff)return null;
  return raw;
}
async function authorize(request,env){
  const session=await readSession(request,env);
  if(!session)return json({ok:false,error:'unauthorized'},401);
  const access=await accessFor(env,session.email,'admira-tv',true);
  if(!access.allowed)return json({ok:false,error:'forbidden'},403);
  if(!env.VIDEO_ANALYTICS_DB)return json({ok:false,error:'proof_not_configured'},503);
  return null;
}
async function ready(db){
  await db.prepare('CREATE TABLE IF NOT EXISTS xtore_proofs (id TEXT PRIMARY KEY, kind TEXT NOT NULL, at INTEGER NOT NULL, expires_at INTEGER NOT NULL, jpeg BLOB NOT NULL)').bind().run();
  await db.prepare('DELETE FROM xtore_proofs WHERE expires_at < ?').bind(Date.now()).run();
}

// Separate from POST /history. The passage row stays {id,kind,at,source}.
// People are refused: v1 does not store a face. Vehicles keep a short-lived bbox crop.
export async function onRequest({request,env}){
  try{
    if(!['GET','POST'].includes(request.method))return json({ok:false,error:'method'},405);
    const origin=new URL(request.url).origin;
    if(request.method==='POST'&&(request.headers.get('origin')!==origin||request.headers.get('content-type')?.split(';')[0]!=='application/json'))return json({ok:false,error:'origin_or_type'},403);
    const denied=await authorize(request,env);if(denied)return denied;
    const db=env.VIDEO_ANALYTICS_DB;
    await ready(db);
    const now=Date.now();
    if(request.method==='GET'){
      const id=new URL(request.url).searchParams.get('id')||'';
      if(!UUID.test(id))return json({ok:false,error:'invalid_id'},400);
      const row=(await db.prepare('SELECT kind, jpeg, expires_at FROM xtore_proofs WHERE id = ?').bind(id).all()).results?.[0];
      if(!row||Number(row.expires_at)<=now)return json({ok:false,error:'not_found'},404);
      const bytes=row.jpeg instanceof Uint8Array?row.jpeg:new Uint8Array(row.jpeg);
      return new Response(bytes,{status:200,headers:{...authHeaders(),'content-type':'image/jpeg','cache-control':'private, no-store','x-content-type-options':'nosniff'}});
    }
    let body;try{body=await readBody(request);}catch{return json({ok:false,error:'invalid_body'},400);}
    if(!body||Object.keys(body).some(key=>key!=='id'&&key!=='jpeg')||!UUID.test(body.id||''))return json({ok:false,error:'invalid_proof'},400);
    const jpeg=jpegBytes(body.jpeg);if(!jpeg)return json({ok:false,error:'invalid_jpeg'},400);
    const passage=(await db.prepare('SELECT kind, at FROM xtore_passages WHERE id = ?').bind(body.id).all()).results?.[0];
    if(!passage)return json({ok:false,error:'unknown_event'},404);
    if(passage.kind==='person')return json({ok:false,error:'person_photo_omitted'},400);
    if(!VEHICLES.has(passage.kind))return json({ok:false,error:'not_vehicle'},400);
    if(now-Number(passage.at)>TTL)return json({ok:false,error:'expired'},400);
    await db.prepare('INSERT INTO xtore_proofs (id, kind, at, expires_at, jpeg) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING').bind(body.id,passage.kind,passage.at,Number(passage.at)+TTL,jpeg).run();
    return json({ok:true,id:body.id,ttl_ms:TTL});
  }catch{
    console.error(JSON.stringify({event:'xtore_proof_unavailable'}));
    return json({ok:false,error:'proof_unavailable'},503);
  }
}
