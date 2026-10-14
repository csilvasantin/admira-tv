// Local fixture review of queue UI and real facade/relay handlers with dummy room keys.
// No production deployment, credentials, permissions grants or external queue writes.
// Run from a checkout with its approved ainimation relay source:
// AINIMATION_WORKTREE=/path/to/ainimation PLAYWRIGHT_PATH=/path/to/playwright \
// TV_REVIEW_CHROME='/path/to/chrome' node tools/review-queue-flow.mjs
// Output defaults /tmp/admira-tv-queue-review; TV_QUEUE_EVIDENCE_DIR overrides it.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile,unlink} from 'node:fs/promises';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import http from 'node:http';
import path from 'node:path';
const ROOT=process.env.TV_QUEUE_WORKTREE||fileURLToPath(new URL('../',import.meta.url)).replace(/\/$/,'') ;
const OUT=process.env.TV_QUEUE_EVIDENCE_DIR||'/tmp/admira-tv-queue-review';
const RELAY=process.env.AINIMATION_WORKTREE;if(!RELAY)throw new Error('AINIMATION_WORKTREE must point to the approved ainimation source checkout');
const require=createRequire(import.meta.url);
const SERVE=process.argv.includes('--serve');
const {chromium}=SERVE?{}:require(process.env.PLAYWRIGHT_PATH||'playwright');
const {onRequest:facade,olvidaEstado}=await import(pathToFileURL(ROOT+'/functions/gestorColas/api/[op].js'));
const {claveDe,RELE}=await import(pathToFileURL(ROOT+'/functions/gestorColas/_lib.js'));
const {ColaTienda}=await import(pathToFileURL(RELAY+'/mcp/server/src/cola.js'));
const {acceso}=await import(pathToFileURL(RELAY+'/mcp/server/src/cola-acceso.js'));
const env={COLAS_SEED:'test-only-in-memory-no-real-secret'};
const A='oraculo-review-a',B='oraculo-review-b';
const keys={[A]:await claveDe(env,A),[B]:await claveDe(env,B)};
const memory=new Map(),objects=new Map(),requests=[],checks=[],blocked=[],expectedBlockedContext=[],authChecks=[],errors=[];
const originalFetch=globalThis.fetch;
function room(s){if(!objects.has(s)){const data=new Map();memory.set(s,data);objects.set(s,new ColaTienda({storage:{get:async k=>structuredClone(data.get(k)),put:async(k,v)=>data.set(k,structuredClone(v))}},{}));}return objects.get(s);}
globalThis.fetch=async(input,init)=>{
 const req=input instanceof Request?input:new Request(input,init),u=new URL(req.url);
 assert.equal(u.origin,RELE);assert.ok(u.pathname.startsWith('/cola/'));const s=u.searchParams.get('store');assert.ok([A,B].includes(s));
 const role=await acceso(req,env,s);assert.equal(role.admin,false);assert.equal(role.kiosko,false);
 const headers=new Headers({'content-type':'application/json','x-cola-puede':role.puede.join(',')});
 if(req.headers.get('x-cola-pago'))headers.set('x-cola-pago',req.headers.get('x-cola-pago'));
 return room(s).fetch(new Request('https://cola'+u.pathname+u.search,{method:req.method,headers,...(req.method==='POST'?{body:await req.text()}:{})}));
};
await mkdir(OUT,{recursive:true});await unlink(OUT+'/failure.json').catch(()=>{});
const banner='<aside style="position:fixed;bottom:0;left:0;right:0;z-index:2147483647;background:#7a2300;color:white;font:600 14px system-ui;padding:10px;text-align:center">DEMONSTRACIÓN AISLADA · no valida autorización de producción · memoria de prueba</aside>';
const contextNotice='/* Shared project context is outside this in-memory queue fixture; no production authorization verified. */';
const bootstrap='<script>for(const [room,key] of Object.entries('+JSON.stringify(keys)+'))localStorage.setItem("gc_clave:"+room,key);document.addEventListener("click",e=>{const a=e.target.closest("a[href]");if(a&&new URL(a.href,location.href).origin!==location.origin){e.preventDefault();alert("Demostración aislada: enlaces externos desactivados / Isolated demonstration: external links disabled");}},true);</script>';
const server=http.createServer(async(req,res)=>{try{
 const u=new URL(req.url,'http://local');
 const json=(status,data)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));};
 if(SERVE){
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; frame-src 'none'; font-src 'self' data:; form-action 'self'; base-uri 'self'");
  res.setHeader('Cache-Control','no-store');
  if(u.pathname==='/'){
   res.writeHead(200,{'content-type':'text/html'});res.end('<!doctype html><html lang="es"><meta charset="utf-8"><title>Turnos · demostración aislada</title><style>body{font:18px system-ui;margin:40px;line-height:1.7}a{margin-right:20px}</style><h1>Turnos · demostración aislada</h1><p>Relé real en memoria. No contiene pedidos reales, no comprueba autorización de producción y no llama a servicios externos. El estado desaparece al detener el servidor.</p><p><a href="/gestorColas/?sala='+A+'&lang=es">Control ES · sala A</a><a href="/gestorColas/?sala='+A+'&lang=en">Control EN · sala A</a><a href="/gestorColas/?sala='+B+'&lang=es">Control ES · sala B</a><a href="/gestorColas/pantalla/?sala='+A+'&lang=en&voz=0">Pantalla pública · sala A</a></p>'+banner+'</html>');return;
  }
  if(u.pathname==='/auth-gate.js'){res.writeHead(410,{'content-type':'text/javascript'});res.end('/* Auth assets are outside the isolated queue fixture. No production authorization verified. */');return;}
  if(u.pathname.startsWith('/auth/')||u.pathname.startsWith('/users/api/'))return json(403,{ok:false,error:'production-auth-outside-isolated-fixture'});
  if(u.pathname.startsWith('/gestorColas/api/')){
   if(!['GET','POST','OPTIONS'].includes(req.method))return json(405,{ok:false,error:'method-not-allowed'});
   if(req.headers.origin&&req.headers.origin!==('http://'+req.headers.host))return json(403,{ok:false,error:'cross-origin-not-allowed'});
   if(![A,B].includes(u.searchParams.get('sala')))return json(400,{ok:false,error:'only-isolated-rooms-allowed'});
   let text='';for await(const chunk of req){text+=chunk;if(text.length>65536)return json(413,{ok:false,error:'body-too-large'});}
   const op=u.pathname.split('/').pop();if(op==='clave')return json(403,{ok:false,error:'no-production-session-in-fixture'});
   const body=text?JSON.parse(text):null;if(body?.sala&&body.sala!==u.searchParams.get('sala'))return json(400,{ok:false,error:'only-isolated-rooms-allowed'});
   const reply=await facade({request:new Request('http://'+req.headers.host+req.url,{method:req.method,headers:req.headers,...(text?{body:text}:{})}),env,params:{op}});
   res.writeHead(reply.status,{'content-type':'application/json','cache-control':'no-store'});res.end(await reply.text());return;
  }
 }
 if(u.pathname==='/admira-contexto.js'){res.writeHead(200,{'content-type':'text/javascript'});res.end(contextNotice);return;}
 if(u.pathname.includes('/.'))throw Error('path');
 let file=decodeURIComponent(u.pathname);if(file.endsWith('/'))file+='index.html';const actual=path.resolve(ROOT,'.'+file);if(!actual.startsWith(ROOT+'/'))throw Error('path');let body=await readFile(actual);const ext=path.extname(actual);if(ext==='.html')body=Buffer.from(body.toString().replace('</body>',(SERVE?bootstrap:'')+banner+'</body>'));res.writeHead(200,{'content-type':({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'})[ext]||'application/octet-stream'});res.end(body);
}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(SERVE?Number(process.env.TV_QUEUE_REVIEW_PORT||8760):0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port;
if(SERVE){
 console.log(JSON.stringify({url:base,isolated:true,productionAuthorizationVerified:false,externalRequests:false,rooms:[A,B],storage:'volatile-memory',shutdown:'SIGINT or SIGTERM'}));
 await new Promise(resolve=>{for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close(resolve));});globalThis.fetch=originalFetch;process.exit(0);
}
const browser=await chromium.launch({headless:true,...(process.env.TV_REVIEW_CHROME?{executablePath:process.env.TV_REVIEW_CHROME}:{})});
const context=await browser.newContext({viewport:{width:1440,height:950},recordVideo:{dir:OUT},serviceWorkers:'block'});
let failCall=false,loseCreate=false,delayRead=false,releaseRead=null;
const files=new Map([['/gestorColas/','gestorColas/index.html'],['/gestorColas/index.html','gestorColas/index.html'],['/gestorColas/room-client.mjs','gestorColas/room-client.mjs'],['/gestorColas/pantalla/','gestorColas/pantalla/index.html']]);
await context.addInitScript(keys=>{for(const [room,key] of Object.entries(keys))localStorage.setItem('gc_clave:'+room,key);},keys);
await context.route('**/*',async route=>{
 const req=route.request(),u=new URL(req.url());
 try{
 if(u.origin===base&&u.pathname==='/admira-contexto.js')return route.fulfill({status:200,contentType:'text/javascript',body:contextNotice});
 if(u.origin==='https://pixer-ctx-5934-preview.csilvasantin.workers.dev'&&u.pathname==='/ctx'&&req.method()==='POST'){expectedBlockedContext.push({origin:u.origin,path:u.pathname,method:req.method()});return route.abort('blockedbyclient');}
 if(u.origin===base&&(u.pathname==='/auth-gate.js'||u.pathname.startsWith('/auth/')||u.pathname.startsWith('/users/api/'))){if(u.pathname==='/auth-gate.js')return route.fulfill({status:410,contentType:'text/javascript',body:'/* Not loaded in isolated UI fixture. No auth decision fabricated. */'});return route.abort('blockedbyclient');}
 if(u.origin===base&&u.pathname.startsWith('/gestorColas/api/')){
  const op=u.pathname.split('/').pop(),s=u.searchParams.get('sala');assert.ok([A,B].includes(s),'Unexpected room');
  requests.push({op,room:s,method:req.method(),body:req.postData()?JSON.parse(req.postData()):null});
  if(failCall&&op==='llamar'){failCall=false;return route.fulfill({status:503,json:{ok:false,error:'Injected call failure (isolated demo)'}});}
  const response=await facade({request:new Request(req.url(),{method:req.method(),headers:req.headers(),...(req.method()==='POST'?{body:req.postData()}:{})}),env,params:{op}});
  const text=await response.text();
  if(loseCreate&&op==='crear'){loseCreate=false;return route.abort('failed');}
  if(delayRead&&op==='estado'&&s===A&&!u.searchParams.has('publico')){delayRead=false;await new Promise(r=>releaseRead=r);}
  return route.fulfill({status:response.status,contentType:'application/json',body:text});
 }
 if(u.origin!==base&&(/\/(auth|users|cola|api)\//.test(u.pathname)||u.origin===RELE))return route.abort('blockedbyclient');
 if(!['GET','HEAD','OPTIONS'].includes(req.method())&&!(u.origin==='https://admira.tv'&&u.pathname.startsWith('/auth/'))){blocked.push({origin:u.origin,path:u.pathname,method:req.method()});return route.abort('blockedbyclient');}
 await route.continue();
 }catch(e){errors.push(String(e));try{await route.abort('failed');}catch{}}
});
try{
 const es=await context.newPage(),en=await context.newPage(),display=await context.newPage();
 for(const p of [es,en,display]){p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.url().includes('/auth/session?'))authChecks.push({status:r.status(),source:'unintercepted browser auth'});});}
 await Promise.all([es.goto(base+'/gestorColas/?sala='+A+'&lang=es'),en.goto(base+'/gestorColas/?sala='+A+'&lang=en'),display.goto(base+'/gestorColas/pantalla/?sala='+A+'&lang=en&voz=0&sondeo=2')]);
 const online=p=>p.waitForFunction(()=>document.querySelector('#gcConnection')?.dataset.state==='online'&&!document.documentElement.classList.contains('gate-locked'));
 await Promise.all([online(es),online(en),display.waitForFunction(()=>document.body.dataset.ok==='1')]);
 checks.push('Isolated local UI fixture only; production authorization is not tested or bypassed');
 await es.locator('#nNombre').fill('Demo Ana');await es.locator('#bCrear').click();await es.waitForFunction(()=>document.querySelector('#kds .c.recibido'));
 await en.evaluate(()=>window.__gestorColas.tic());assert.equal(await en.locator('#kds .c.recibido').count(),1);checks.push('Two operators observe one created paid-simulated order');
 await es.screenshot({path:OUT+'/01-received-es.png'});await en.screenshot({path:OUT+'/02-received-en.png'});
 await es.locator('[data-a="preparando"]').click();await en.evaluate(()=>window.__gestorColas.tic());await en.waitForFunction(()=>document.querySelector('#kds .c.preparando'));
 await en.locator('[data-a="listo"]').click();await en.waitForFunction(()=>document.querySelector('#kds .c.listo'));
 await display.waitForFunction(()=>document.querySelector('#listo')?.textContent.includes('A001'));
 assert.ok(!(await display.locator('body').textContent()).includes('Demo Ana'),'Public display exposes first name only');
 await display.waitForTimeout(500);await display.screenshot({path:OUT+'/03-display-ready-en.png'});await en.screenshot({path:OUT+'/04-ready-en.png'});
 failCall=true;await en.locator('[data-llamar]').click();await en.waitForFunction(()=>document.querySelector('#msg').textContent.includes('Injected call failure'));
 await en.waitForFunction(()=>!document.querySelector('[data-llamar]')?.disabled);await en.locator('[data-llamar]').click();await en.waitForFunction(()=>document.querySelector('#msg').textContent.includes('registered'));
 checks.push('Prepare, ready, public minimized display, failed call unlock and successful retry');
 await en.locator('[data-a="recogido"]').click();await en.waitForFunction(()=>!document.querySelector('#kds .c'));
 await display.waitForFunction(()=>!document.querySelector('#listo')?.textContent.includes('A001'));checks.push('Collected order removed from operator and public display');
 loseCreate=true;await es.evaluate(()=>window.__gestorColas.tic());await es.locator('#nNombre').fill('Demo Retry');await es.locator('#bCrear').click();await es.waitForFunction(()=>document.querySelector('#bCrear').textContent.includes('Reintentar'));
 const firstIdem=requests.filter(r=>r.op==='crear').at(-1).body.idem;
 await es.reload();await online(es);assert.match(await es.locator('#bCrear').textContent(),/Reintentar/);await es.locator('#bCrear').click();await es.waitForFunction(()=>!document.querySelector('#bCrear').textContent.includes('Reintentar'));
 assert.equal(requests.filter(r=>r.op==='crear').at(-1).body.idem,firstIdem);
 assert.equal(await es.locator('#kds .c').count(),1);checks.push('Lost create response survives reload, original idempotency nonce retained, no duplicate order');
 await es.screenshot({path:OUT+'/05-retry-recovered-es.png'});
 delayRead=true;const pending=es.evaluate(()=>window.__gestorColas.tic());while(!releaseRead)await new Promise(r=>setTimeout(r,25));
 await es.evaluate(room=>window.__gestorColas.cmd('/sala '+room),B);await online(es);releaseRead();await pending;await new Promise(r=>setTimeout(r,250));
 assert.equal(await es.locator('#kds .c').count(),0);assert.ok((await es.locator('#gcConnection').textContent()).includes(B));checks.push('Delayed previous-room response cannot replace new-room state');
 await es.screenshot({path:OUT+'/06-new-room-es.png'});
 // Reuse numbers by replacing ONLY the isolated fixture storage, without granting an admin capability.
 await en.evaluate(()=>window.__gestorColas.tic());const staleId=await en.locator('[data-a="listo"]').getAttribute('data-pedido');
 memory.get(A).set('cola',{pedidos:{},n:0});olvidaEstado(A);
 const make=await facade({request:new Request('https://admira.tv/gestorColas/api/crear?sala='+A,{method:'POST',headers:{'content-type':'application/json','x-clave-sala':keys[A]},body:JSON.stringify({nombre:'Demo New',idem:'new-after-fixture-reset'})}),env,params:{op:'crear'}});const newOrder=await make.json();assert.equal(newOrder.numero,'A001');
 const click=en.locator('[data-a="listo"]');await click.click();await en.waitForFunction(()=>document.querySelector('#msg').textContent.toLowerCase().includes('no encontrado'));
 const state=await facade({request:new Request('https://admira.tv/gestorColas/api/estado?sala='+A,{headers:{'x-clave-sala':keys[A]}}),env,params:{op:'estado'}});const current=await state.json();assert.equal(current.recibido[0].id,newOrder.id);assert.equal(current.listo.length,0);assert.equal(requests.filter(r=>r.op==='avanzar').at(-1).body.pedido,staleId);
 checks.push('Stale rendered ID cannot alter a different order after number A001 is reused');
 await en.locator('#bLang').click();assert.equal(await en.locator('html').getAttribute('lang'),'es');await en.evaluate(room=>window.__gestorColas.cmd('/sala '+room),B);await online(en);await en.reload();await online(en);assert.equal(await en.locator('html').getAttribute('lang'),'es');assert.ok(en.url().includes('lang=es'));
 await en.evaluate(()=>window.__gestorColas.cmd('/idioma en'));await en.reload();await online(en);assert.equal(await en.locator('html').getAttribute('lang'),'en');assert.ok(en.url().includes('lang=en'));await en.evaluate(room=>window.__gestorColas.cmd('/sala '+room),A);await online(en);
 checks.push('Language button and command persist URL, room switches and reload (EN to ES to EN)');
 await en.evaluate(()=>window.__gestorColas.tic());await en.screenshot({path:OUT+'/07-number-reuse-safe-en.png'});
 assert.equal(errors.length,0,errors.join('\n'));assert.equal(blocked.length,0,'Unexpected mutation attempted');
 console.log(JSON.stringify({ok:true,checks,authChecks,expectedBlockedContext,requests:requests.length,screenshots:7,isolated:true,realQueueWrites:0},null,2));
 await writeFile(OUT+'/proof.json',JSON.stringify({at:new Date().toISOString(),executor:'MBP16',agent:'OraculoMacMini',ok:true,checks,authChecks,requests,blocked,expectedBlockedContext,errors,isolated:true,realQueueWrites:0,limitations:['Local headless UI fixture only: auth assets and shared project context not loaded, production authorization not validated; never fabricate /auth/session or access answers','Actual facade and relay handlers with dummy room keys and in-memory storage; no live queue mutation or production deployment','Voice disabled; visual public announcement verified, audible output not proven']},null,2));
}catch(e){await writeFile(OUT+'/failure.json',JSON.stringify({message:e.message,stack:e.stack,checks,authChecks,errors,blocked,expectedBlockedContext},null,2));throw e;}
finally{await context.close();await browser.close();await new Promise(r=>server.close(r));globalThis.fetch=originalFetch;}
