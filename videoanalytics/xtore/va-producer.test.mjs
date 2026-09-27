import test from 'node:test';
import assert from 'node:assert/strict';
import {VaProducer} from './va-producer.mjs';
import {onRequest,parseRpc} from '../../functions/videoanalytics/api/va-session.js';
import {audienceSnapshot,DEFAULT_DIRECTION_AXIS} from './audience-session.mjs';

const snapshot=(person=3,revision=1)=>audienceSnapshot({sessionId:crypto.randomUUID(),startedAt:Date.now()-1000,revision,updatedAt:Date.now(),
  counts:{person,car:0,motorcycle:0,bicycle:0,scooter:0},directions:{enter:person,exit:0,unknown:0},axis:DEFAULT_DIRECTION_AXIS,state:'analyzing'});
function envFor({email='csilva@admira.com',role='viewer',session=true,token='server-only',account='admira'}={}){
  return {VA_MCP_TOKEN:token,VA_ACCOUNT:account,ACCESS:{get:async key=>key==='admira-tv:auth:session:fixture'&&session?JSON.stringify({email,expiresAt:Date.now()+60000}):key==='admira-tv:users:v3'?JSON.stringify({v:3,projects:[{id:'admira-tv'}],users:[{email,status:'active',roles:{'admira-tv':role}}]}):null}};
}
function request(env,body,headers={},deps){
  return onRequest({env,request:new Request('https://admira.tv/videoanalytics/api/va-session',{method:'POST',
    headers:{Cookie:'__Host-atv_session=fixture','Content-Type':'application/json',Origin:'https://admira.tv',...headers},body:JSON.stringify(body)})},deps);
}
// MCP falso con la respuesta SSE real de mcp-tv.admira.store.
function mcp(result,calls=[]){
  return async(url,init)=>{calls.push({url,init,body:JSON.parse(init.body)});
    return new Response(`event: message\ndata: ${JSON.stringify({jsonrpc:'2.0',id:1,result})}\n\n`,{headers:{'Content-Type':'text/event-stream'}});};
}

test('bridge requires admin session, same origin and server-side configuration',async()=>{
  const s=snapshot();
  assert.equal((await request(envFor({session:false}),{snapshot:s})).status,401);
  assert.equal((await request(envFor({email:'viewer@example.test'}),{snapshot:s})).status,403);
  assert.equal((await request(envFor(),{snapshot:s},{Origin:'https://evil.example'})).status,403);
  const off=await request(envFor({token:''}),{snapshot:s});
  assert.equal(off.status,503);assert.equal((await off.json()).error,'va_bridge_not_configured');
  assert.equal((await request(envFor({account:'Bad Account'}),{snapshot:s})).status,503);
});
test('bridge rejects foreign fields and non-aggregate payloads before calling MCP',async()=>{
  const calls=[],deps={fetchImpl:mcp({content:[{type:'text',text:'{}'}]},calls)};
  assert.equal((await request(envFor(),{snapshot:snapshot(),image:'x'},{},deps)).status,400);
  assert.equal((await request(envFor(),{snapshot:{...snapshot(),site:'otro'}},{},deps)).status,400);
  assert.equal((await request(envFor(),{snapshot:{...snapshot(),schema:'x'}},{},deps)).status,400);
  assert.equal(calls.length,0);
});
test('bridge publishes the envelope with server credential, clock and account',async()=>{
  const calls=[],s=snapshot(9,4),now=Date.now();
  const r=await request(envFor(),{snapshot:s},{},{now,fetchImpl:mcp({content:[{type:'text',text:JSON.stringify({ok:true,duplicate:false,revision:4,identity:'NeoGrokBotBox'})}]},calls)});
  assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true,revision:4,duplicate:false,identity:'NeoGrokBotBox'});
  const [call]=calls;
  assert.equal(call.url,'https://mcp-tv.admira.store/mcp');
  assert.equal(call.init.headers.Authorization,'Bearer server-only');
  assert.equal(call.body.params.name,'va_session_publish');
  assert.deepEqual(call.body.params.arguments,{account:'admira',site:'admira-xperience-santa-rosa-19',sessionId:s.sessionId,seq:now,ts:now,snapshot:s});
});
test('bridge forwards only the va_* error code from MCP',async()=>{
  const r=await request(envFor(),{snapshot:snapshot()},{},{fetchImpl:mcp({isError:true,content:[{type:'text',text:'Error: va_scope_denied (detalle interno)'}]})});
  assert.equal(r.status,502);assert.deepEqual(await r.json(),{ok:false,error:'va_scope_denied'});
  assert.deepEqual(parseRpc('{"result":1}'),{result:1});
});
test('producer beats while running, sends a final beat on stop and switches off on fatal errors',async()=>{
  const bodies=[],reply={ok:true,revision:1};
  const fetchImpl=async(url,init)=>{bodies.push(JSON.parse(init.body));return Response.json(reply);};
  const p=new VaProducer({snapshot:()=>({state:'analyzing'}),fetchImpl,interval:10});
  p.start();await new Promise(r=>setTimeout(r,35));
  assert.ok(p.published>=2);
  await p.stop();const sent=bodies.length;await new Promise(r=>setTimeout(r,30));
  assert.equal(bodies.length,sent);
  Object.assign(reply,{ok:false,error:'va_bridge_not_configured'});
  const q=new VaProducer({snapshot:()=>({}),fetchImpl,interval:10});
  q.start();await new Promise(r=>setTimeout(r,30));
  assert.equal(q.off,'va_bridge_not_configured');assert.equal(q.running,false);
  const before=bodies.length;q.start();await new Promise(r=>setTimeout(r,20));assert.equal(bodies.length,before);
});
test('producer keeps retrying transient errors',async()=>{
  let n=0;const fetchImpl=async()=>{n++;return n===1?Response.json({ok:false,error:'va_stale_envelope'},{status:502}):Response.json({ok:true,revision:2});};
  const p=new VaProducer({snapshot:()=>({}),fetchImpl,interval:5});
  p.start();await new Promise(r=>setTimeout(r,30));await p.stop();
  assert.equal(p.off,null);assert.ok(p.published>=1);assert.equal(p.revision,2);
});
