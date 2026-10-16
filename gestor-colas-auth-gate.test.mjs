import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createSession,sessionCookie} from './functions/_auth-session.js';
import {onRequest as api} from './functions/gestorColas/api/[op].js';

const gate=await readFile(new URL('./auth-gate.js',import.meta.url),'utf8');
const html=await readFile(new URL('./gestorColas/index.html',import.meta.url),'utf8');
const routing=gate.slice(gate.indexOf('var PATH_PROJECTS ='),gate.indexOf('var REMEMBER_HOURS'));

test('la entrada de barra y sus rutas usan el proyecto Admira TV registrado',()=>{
 for(const pathname of ['/gestorColas/','/gestorColas/pantalla/']){
  const context={location:{pathname},document:{documentElement:{hasAttribute:name=>new RegExp('<html[^>]*\\b'+name+'(?:\\s|>)').test(html)}}};
  vm.runInNewContext(routing,context);
  assert.equal(context.SOLUTION,'admira-tv');
  assert.equal(context.REQUIRE_SERVER_SESSION,true,'la barra exige la misma sesión de servidor que sus escrituras');
 }
});

test('una sesión humana válida permite avanzar; sin sesión el relé no recibe la orden',async()=>{
 const originalFetch=globalThis.fetch,rows=new Map(),calls=[];
 const env={ACCESS:{get:async k=>rows.get(k)||null,put:async(k,v)=>rows.set(k,v)},COLA_ADMIN:'test-service-only'};
 const token=await createSession(env,{email:'csilva@admira.com',name:'Carlos',sub:'test'});
 globalThis.fetch=async(url,options)=>{calls.push({url,options});return Response.json({ok:true,id:'own-rehearsal',numero:'A027',estado:'listo'});};
 try{
  const request=cookie=>new Request('https://admira.tv/gestorColas/api/avanzar?sala=starbucks-paseo-de-gracia',{method:'POST',headers:{'content-type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify({pedido:'own-rehearsal',a:'listo'})});
  const denied=await api({request:request(),env,params:{op:'avanzar'}});
  assert.equal(denied.status,401);assert.equal(calls.length,0);
  const accepted=await api({request:request(sessionCookie(token).split(';')[0]),env,params:{op:'avanzar'}});
  assert.equal(accepted.status,200);assert.equal((await accepted.json()).estado,'listo');
  assert.equal(calls.length,1);assert.match(calls[0].url,/store=starbucks-paseo-de-gracia$/);
  assert.equal(JSON.parse(calls[0].options.body).id,'own-rehearsal');
 }finally{globalThis.fetch=originalFetch;}
});
