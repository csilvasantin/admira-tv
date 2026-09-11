// Evaluate the real, bounded bridge functions in isolation; never publish labels.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../../canal.html',import.meta.url),'utf8');
test('categorical person command in the actual player does not invent age or gender',()=>{
  const code=html.slice(html.indexOf('const AUD_KIND_ALIAS='),html.indexOf('function runCli(raw)'));
  const context={window:{},setAdmiraMode(){},emitAudienceState(){}};
  vm.runInNewContext(code,context);
  for(const input of ['persona','coche','moto','bici']){
    context.forceAudience(input);assert.equal(context.window.__xplForce.age,null);assert.equal(context.window.__xplForce.gender,null);
  }
  context.forceAudience('u');assert.equal(context.window.__xplForce,null);
});
test('player authorizes actual Admira parents, not an opaque origin or third parties',()=>{
  const code=html.slice(html.indexOf('function bridgeOriginAllowed('),html.indexOf('function bridgeReply('));
  const context={};vm.runInNewContext(code,context);
  for(const origin of ['https://admira.tv','https://www.admira.tv','http://127.0.0.1:56594'])assert.equal(context.bridgeOriginAllowed(origin),true);
  for(const origin of ['null','https://evil.example','https://admira.tv.evil.example'])assert.equal(context.bridgeOriginAllowed(origin),false);
  assert.ok(html.includes("if((event.origin==='https://admira.tv'||event.origin==='https://www.admira.tv')&&event.source!==window.parent) return;"));
});
