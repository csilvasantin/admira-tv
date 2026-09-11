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
