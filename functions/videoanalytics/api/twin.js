import {accessFor, authHeaders, readSession} from '../../_auth-session.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ORIGINAL_TTL=3*60*1000, TWIN_TTL=48*60*60*1000, MAX_JPEG=40000;
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
  if(typeof value!=='string'||value.length<40||value.length>60000)return null;
  let raw;try{raw=Uint8Array.from(atob(value),c=>c.charCodeAt(0));}catch{return null;}
  if(raw.length<40||raw.length>MAX_JPEG||raw[0]!==0xff||raw[1]!==0xd8||raw[2]!==0xff)return null;
  return raw;
}
async function authorize(request,env){
  const session=await readSession(request,env);
  if(!session)return json({ok:false,error:'unauthorized'},401);
  const access=await accessFor(env,session.email,'admira-tv',true);
  if(!access.allowed)return json({ok:false,error:'forbidden'},403);
  if(!env.VIDEO_ANALYTICS_DB)return json({ok:false,error:'twin_not_configured'},503);
  return null;
}
async function ready(db,now){
  await db.prepare('CREATE TABLE IF NOT EXISTS xtore_person_originals (id TEXT PRIMARY KEY, at INTEGER NOT NULL, expires_at INTEGER NOT NULL, jpeg BLOB NOT NULL)').bind().run();
  await db.prepare('CREATE TABLE IF NOT EXISTS xtore_twins (id TEXT PRIMARY KEY, at INTEGER NOT NULL, expires_at INTEGER NOT NULL, jpeg BLOB NOT NULL)').bind().run();
  await db.prepare('DELETE FROM xtore_person_originals WHERE expires_at < ?').bind(now).run();
  await db.prepare('DELETE FROM xtore_twins WHERE expires_at < ?').bind(now).run();
}
function image(bytes){
  const raw=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
  return new Response(raw,{status:200,headers:{...authHeaders(),'content-type':'image/jpeg','cache-control':'private, no-store','x-content-type-options':'nosniff'}});
}

// The original face never leaves this handler as a response. Stats only receive the synthetic twin.
export async function onRequest({request,env}){
  try{
    if(!['GET','POST'].includes(request.method))return json({ok:false,error:'method'},405);
    const origin=new URL(request.url).origin;
    if(request.method==='POST'&&(request.headers.get('origin')!==origin||request.headers.get('content-type')?.split(';')[0]!=='application/json'))return json({ok:false,error:'origin_or_type'},403);
    const denied=await authorize(request,env);if(denied)return denied;
    const db=env.VIDEO_ANALYTICS_DB,now=Date.now();
    await ready(db,now);
    if(request.method==='GET'){
      const params=new URL(request.url).searchParams,id=params.get('id')||'';
      if(!UUID.test(id))return json({ok:false,error:'invalid_id'},400);
      const twin=(await db.prepare('SELECT jpeg, expires_at FROM xtore_twins WHERE id = ?').bind(id).all()).results?.[0];
      const readyTwin=twin&&Number(twin.expires_at)>now;
      if(params.get('status')==='1'){
        const original=(await db.prepare('SELECT expires_at FROM xtore_person_originals WHERE id = ?').bind(id).all()).results?.[0];
        const state=readyTwin?'ready':original&&Number(original.expires_at)>now?'generating':'none';
        return json({ok:true,state});
      }
      if(!readyTwin)return json({ok:false,error:'not_ready'},404);
      return image(twin.jpeg);
    }
    let body;try{body=await readBody(request);}catch{return json({ok:false,error:'invalid_body'},400);}
    if(!body||Object.keys(body).some(key=>!['id','stage','jpeg'].includes(key))||!UUID.test(body.id||'')||!['original','twin'].includes(body.stage))return json({ok:false,error:'invalid_twin'},400);
    const jpeg=jpegBytes(body.jpeg);if(!jpeg)return json({ok:false,error:'invalid_jpeg'},400);
    const passage=(await db.prepare('SELECT kind, at FROM xtore_passages WHERE id = ?').bind(body.id).all()).results?.[0];
    if(!passage)return json({ok:false,error:'unknown_event'},404);
    if(passage.kind!=='person')return json({ok:false,error:'not_person'},400);
    if(body.stage==='original'){
      const twin=(await db.prepare('SELECT id FROM xtore_twins WHERE id = ?').bind(body.id).all()).results?.[0];
      if(twin)return json({ok:true,id:body.id,stage:'original',kept:false});
      await db.prepare('INSERT INTO xtore_person_originals (id, at, expires_at, jpeg) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO NOTHING').bind(body.id,passage.at,now+ORIGINAL_TTL,jpeg).run();
      return json({ok:true,id:body.id,stage:'original',ttl_ms:ORIGINAL_TTL});
    }
    await db.prepare('INSERT INTO xtore_twins (id, at, expires_at, jpeg) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO NOTHING').bind(body.id,passage.at,now+TWIN_TTL,jpeg).run();
    await db.prepare('DELETE FROM xtore_person_originals WHERE id = ?').bind(body.id).run();
    return json({ok:true,id:body.id,stage:'twin',ttl_ms:TWIN_TTL});
  }catch{
    console.error(JSON.stringify({event:'xtore_twin_unavailable'}));
    return json({ok:false,error:'twin_unavailable'},503);
  }
}
