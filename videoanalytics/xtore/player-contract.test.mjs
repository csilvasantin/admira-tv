// Evaluate the real, bounded bridge functions in isolation; never publish labels.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../../canal.html',import.meta.url),'utf8');
test('categorical person command in the actual player does not invent age or gender',()=>{
  const code=html.slice(html.indexOf('const AUD_KIND_ALIAS='),html.indexOf('function runCli(raw)'));
  const context={window:{},XTORE_PARENT:'',setAdmiraMode(){},emitAudienceState(){}};
  vm.runInNewContext(code,context);
  for(const input of ['persona','coche','moto','bici']){
    context.forceAudience(input);assert.equal(context.window.__xplForce.age,null);assert.equal(context.window.__xplForce.gender,null);
  }
  context.forceAudience('u');assert.equal(context.window.__xplForce,null);
});
test('actual conditional engine keeps the general loop until a known criterion has content, then returns without repeated restarts',async()=>{
  let now=10000;const rebuilds=[];
  const rules={default:{category:'bad-default'},rules:[
    {id:'weather',kind:'car',conds:[{fact:'temperature',op:'==',value:20}],assets:['promo']},
    {id:'mixed',kind:'person',conds:[{fact:'audGender',value:'mixed'}],assets:['promo']},
    {id:'female',gender:'f',assets:['promo']},
    {id:'adult',age:'adulto',assets:['promo']},
    {id:'context',minCount:0,assets:['promo']},
    {id:'bike',kind:'bicycle',assets:['missing']},
    {id:'car',kind:'car',assets:['promo']},
  ]};
  const context={window:{},qs:new URLSearchParams(),XTORE_PARENT:'http://127.0.0.1:56594',playoutMode:'conditional',console,seg:{},seenSig:'',scr:{},
    Date:class extends Date{static now(){return now;}},setInterval:()=>0,clearInterval(){},flashCli(){},syncSegPanel(){},emitAudienceState(){},
    xtorePublicRead:async()=>rules,all:[{id:'default'},{id:'promo'}],matchesSeg:(it,s)=>!s.ids||s.ids.includes(it.id),
    rebuild:()=>rebuilds.push(JSON.parse(JSON.stringify(context.seg))),setAdmiraMode:()=>assert.fail('An existing conditional loop must not restart its engine')};
  vm.runInNewContext(readFileSync(new URL('../../xpl-runtime.js',import.meta.url),'utf8'),context);
  vm.runInNewContext(html.slice(html.indexOf('function xtoreMusicEnabled()'),html.indexOf('function xtorePublicRead(')),context);
  vm.runInNewContext(html.slice(html.indexOf('const AUD_KIND_ALIAS='),html.indexOf('function runCli(raw)')),context);
  vm.runInNewContext(html.slice(html.indexOf('const XPLCanal = (function(){'),html.indexOf('// ── AUDIENCIA REMOTA: sondeo')),context);
  const engine=context.window.XPLCanal;engine.start();await new Promise(resolve=>setImmediate(resolve));
  for(const label of ['u','u','persona','bici'])context.forceAudience(label);
  assert.equal(engine.world.fact('audAge'),'unknown');assert.equal(rebuilds.length,1);assert.equal(rebuilds[0].category,'all');
  context.forceAudience('coche');context.forceAudience('coche');assert.equal(rebuilds.length,2);assert.deepEqual(rebuilds[1].ids,['promo']);
  now+=6001;engine.tick();assert.equal(rebuilds.length,3);assert.equal(rebuilds[2].ids,null);assert.equal(rebuilds[2].category,'all');
  context.forceAudience('u');engine.tick();assert.equal(rebuilds.length,3);engine.stop();
});
test('player authorizes actual Admira parents, not an opaque origin or third parties',()=>{
  const code=html.slice(html.indexOf('function bridgeOriginAllowed('),html.indexOf('function bridgeReply('));
  const context={};vm.runInNewContext(code,context);
  for(const origin of ['https://admira.tv','https://www.admira.tv','http://127.0.0.1:56594'])assert.equal(context.bridgeOriginAllowed(origin),true);
  for(const origin of ['null','https://evil.example','https://admira.tv.evil.example'])assert.equal(context.bridgeOriginAllowed(origin),false);
  assert.ok(html.includes("if((event.origin==='https://admira.tv'||event.origin==='https://www.admira.tv')&&event.source!==window.parent) return;"));
});
test('Xtore catalogue isolates malformed metadata and rejects an invalid replacement',()=>{
  const code=html.slice(html.indexOf('function xtoreCatalogItems('),html.indexOf('async function loadFeed('));
  const context={MEDIA:['image','video']};vm.runInNewContext(code,context);
  const items=context.xtoreCatalogItems([{id:'ok',type:'image',url:'https://example.test/a.png',tags:'default',title:{}},null]);
  assert.equal(items.length,1);assert.equal(items[0].title,'');assert.equal(items[0].tags.length,0);
  assert.throws(()=>context.xtoreCatalogItems([{type:'image',url:{}}]),/No valid/);
  assert.throws(()=>context.xtoreCatalogItems({}),/Invalid/);
});
test('optional H264 lookup has a deadline and transient timeouts do not poison the cache',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});let calls=0;
  const context={XTORE_PARENT:'https://admira.tv',AbortController,setTimeout,clearTimeout,
    fetch:async(url,{signal})=>{calls++;if(calls===1)return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('timeout'))));return {ok:true};}};
  vm.runInNewContext(html.slice(html.indexOf('const _h264Variant='),html.indexOf("try{ const saved=JSON.parse(LS(CACHE_TECH_KEY")),context);
  const it={id:'qa',url:'https://example.test/stock/qa/asset.mp4'};
  const first=context.h264VariantFor(it);t.mock.timers.tick(2001);assert.equal(await first,null);
  assert.equal(await context.h264VariantFor(it),'https://example.test/stock/qa/asset-h264.mp4');assert.equal(calls,2);
});
test('failed Xtore feed retries early, coalesces callers and preserves the last catalogue',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});let calls=0,release;const rebuilt=[];
  const context={XTORE_PARENT:'https://admira.tv',xtoreMusicEnabled:()=>true,Date,MEDIA:['image'],all:[{id:'old',type:'image',url:'https://example.test/old.png'}],playlist:[{id:'old'}],
    setTimeout,clearTimeout,INDEX:'',setStockStatus(){},restoreCatalog:()=>false,setLive(){},_lastFeed:0,_statusT:0,_statusT2:0,
    xtorePublicRead:()=>{calls++;return new Promise((resolve,reject)=>{release=calls===1?()=>reject(new Error('offline')):()=>resolve({items:[{id:'new',type:'image',url:'https://example.test/new.png',tags:'bad'}]});});},
    mergeMatrixExtras(){},saveCatalog(){},guardState:()=>({}),dimCache:{},seenSig:'',seg:{},cfg:{max:50},playoutMode:'conditional',
    rebuild:()=>rebuilt.push(true),freshScan(){},pendingImport:null,measurePass(){}};
  vm.runInNewContext(html.slice(html.indexOf('let _xtoreFeedBusy='),html.indexOf('function restartFeed()')),context);
  const first=context.loadFeed(true);await context.loadFeed(true);assert.equal(calls,1);release();await first;
  assert.equal(context.all[0].id,'old');assert.equal(rebuilt.length,0);
  t.mock.timers.tick(3001);assert.equal(calls,2);release();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(context.all[0].id,'new');assert.equal(rebuilt.length,1);
  t.mock.timers.tick(30000);assert.equal(calls,2);
});
test('a delayed error or end from media A cannot skip media B',t=>{
  t.mock.timers.enable({apis:['setTimeout']});let next=0,sync=0;
  const context={_playTok:1,syncOn:false,next:()=>next++,syncFinishCurrent:()=>sync++};
  vm.runInNewContext(html.slice(html.indexOf('function mediaAdvance('),html.indexOf('async function play(')),context);
  setTimeout(()=>context.mediaAdvance(1),600);context._playTok=2;t.mock.timers.tick(601);
  context.mediaAdvance(1,true);assert.equal(next,0);assert.equal(sync,0);
  context.mediaAdvance(2);assert.equal(next,1);context.syncOn=true;context.mediaAdvance(2,true);assert.equal(sync,1);
  const playback=html.slice(html.indexOf('async function play('),html.indexOf('function next()'));
  assert.equal(playback.includes('setTimeout(next,600)'),false);
});
