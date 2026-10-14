import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequest as api,olvidaEstado} from './functions/gestorColas/api/[op].js';
import {claveDe} from './functions/gestorColas/_lib.js';
const env={COLAS_SEED:'isolated-test-only'},room='queue-review';
const ctx=(op,{publico=false,key='',body,cookie='',environment=env}={})=>({env:environment,params:{op},request:new Request(`https://admira.tv/gestorColas/api/${op}?sala=${room}${publico?'&publico=1':''}`,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-clave-sala':key,cookie},...(body?{body:JSON.stringify(body)}:{})})});
const deferred=()=>{let resolve;return {promise:new Promise(r=>resolve=r),resolve:v=>resolve(v)}};
const reply=n=>new Response(JSON.stringify({ok:true,recibido:[{id:n}],preparando:[],listo:[]}));

test('concurrent public reads share one relay request; late pre-write read cannot refill fresh cache',async()=>{
 olvidaEstado();const original=globalThis.fetch,old=deferred();let reads=0;
 globalThis.fetch=async url=>String(url).includes('/cola/estado')?(++reads===1?old.promise:reply('after-write')):new Response(JSON.stringify({ok:true,id:'stable-id'}));
 try {
  const a=api(ctx('estado',{publico:true})),b=api(ctx('estado',{publico:true}));
  await new Promise(r=>setImmediate(r));assert.equal(reads,1);
  const key=await claveDe(env,room);
  assert.equal((await api(ctx('avanzar',{key,body:{pedido:'stable-id',a:'listo'}}))).status,200);
  old.resolve(reply('before-write'));await Promise.all([a,b]);
  const fresh=await (await api(ctx('estado',{publico:true}))).json();assert.equal(fresh.recibido[0].id,'after-write');assert.equal(reads,2);
  await api(ctx('estado',{publico:true}));assert.equal(reads,2);
 }finally{globalThis.fetch=original;olvidaEstado();}
});

test('room key cannot authorize another room; reset requires explicit confirmation',async()=>{
 const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return reply('unexpected')};
 try{
  const wrong=await claveDe(env,'different-room');
  for(const op of ['crear','avanzar','llamar','reiniciar'])assert.equal((await api(ctx(op,{key:wrong,body:{pedido:'A001',confirmar:true}}))).status,401);
  assert.equal(calls,0);
  const right=await claveDe(env,room);
  assert.equal((await api(ctx('reiniciar',{key:right,body:{}}))).status,400);assert.equal(calls,0);
 }finally{globalThis.fetch=original;}
});

test('payment token remains server-side and relay calls have a bounded timeout',async()=>{
 const original=globalThis.fetch,calls=[];globalThis.fetch=async(url,init)=>{calls.push({url:String(url),init});return new Response(JSON.stringify(String(url).includes('/cola/pedido')?{ok:true,id:'gc-stable',pago:'exact-order-only'}:{ok:true,id:'gc-stable',estado:'recibido'}));};
 try{
  const key=await claveDe(env,room),r=await api(ctx('crear',{key,body:{nombre:'Test',idem:'stable-order'}})),result=await r.json();
  assert.equal(result.pago,undefined);assert.equal(JSON.parse(calls[1].init.body).pago,'exact-order-only');
  assert.equal(calls[0].init.headers['x-cola-admin'],undefined);assert.ok(calls.every(c=>c.init.signal instanceof AbortSignal));
 }finally{globalThis.fetch=original;}
});

test('expired session and signed-in user without access cannot write; valid existing access can',async()=>{
 const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return reply('valid-order')};
 const values=new Map(),environment={...env,ACCESS:{get:async key=>values.get(key)||null}},cookie='__Host-atv_session=isolated-session';
 const session=email=>JSON.stringify({email,expiresAt:Date.now()+60000});
 try{
  values.set('admira-tv:auth:session:isolated-session',JSON.stringify({email:'test@example.invalid',expiresAt:Date.now()-1}));
  assert.equal((await api(ctx('llamar',{cookie,environment,body:{pedido:'stable-id'}}))).status,401);
  values.set('admira-tv:auth:session:isolated-session',session('test@example.invalid'));
  values.set('admira-tv:users:v3',JSON.stringify({v:3,users:[{email:'test@example.invalid',status:'active',roles:{}}]}));
  assert.equal((await api(ctx('llamar',{cookie,environment,body:{pedido:'stable-id'}}))).status,401);assert.equal(calls,0);
  values.set('admira-tv:users:v3',JSON.stringify({v:3,users:[{email:'test@example.invalid',status:'active',roles:{'admira-tv':'staff'}}]}));
  assert.equal((await api(ctx('llamar',{cookie,environment,body:{pedido:'stable-id'}}))).status,200);assert.equal(calls,1);
 }finally{globalThis.fetch=original;}
});
