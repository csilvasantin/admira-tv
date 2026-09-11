import test from 'node:test';
import assert from 'node:assert/strict';
import {TwinSession,SOURCE_TTL,RESULT_TTL,twinPrompt,stockPayload,decodeImage} from './twins.mjs';

const source=()=>({width:8,height:8,data:new Uint8ClampedArray(8*8*4).fill(61)});
const result=()=>({mime:'image/png',bytes:new Uint8Array([137,80,78,71,9,8,7,6])});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};

test('selecting is local; generating requires an explicit choice and consent',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});let calls=0;
  const s=new TwinSession({generate:async()=>{calls++;return result();}}),original=source();
  s.select(original,'person');assert.equal(calls,0);
  assert.equal(await s.create('8bit',false),false);assert.equal(await s.create('unknown',true),false);
  assert.equal(await s.create('8bit',true),true);assert.equal(calls,1);
  assert.equal(s.phase,'review');assert.equal(s.source,null);assert.ok(original.data.every(v=>v===0));
  s.clear();
});
test('one active original; failure and cancellation retire it and ignore late results',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});const job=deferred();
  const s=new TwinSession({generate:()=>job.promise}),original=source();s.select(original,'car');
  const pending=s.create('16bit',true),other=source();
  assert.equal(s.select(other,'person'),false);assert.ok(other.data.every(v=>v===0));
  s.clear();assert.ok(original.data.every(v=>v===0));const late=result();job.resolve(late);await pending;
  assert.equal(s.phase,'empty');assert.equal(s.result,null);assert.ok(late.bytes.every(v=>v===0));
  s.generate=async()=>{throw new Error('provider failed');};const retry=source();s.select(retry,'car');await s.create('twin',true);
  assert.equal(s.phase,'failed');assert.equal(s.source,null);assert.ok(retry.data.every(v=>v===0));s.clear();
});
test('late responses cannot retire a newer selection after cancellation',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});const job=deferred();
  const s=new TwinSession({generate:()=>job.promise});s.select(source(),'person');const pending=s.create('8bit',true);
  s.clear();const newer=source();s.select(newer,'bicycle');job.resolve(result());await pending;
  assert.equal(s.phase,'selected');assert.equal(s.source,newer);assert.ok(newer.data.some(v=>v!==0));s.clear();
});
test('original expires even when a provider never settles; generated result has its own TTL',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});let signal;
  const s=new TwinSession({generate:args=>{signal=args.signal;return new Promise(()=>{});}}),original=source();
  s.select(original,'person');void s.create('8bit',true);t.mock.timers.tick(SOURCE_TTL);
  assert.equal(signal.aborted,true);assert.equal(s.phase,'expired');assert.equal(s.source,null);assert.ok(original.data.every(v=>v===0));
  s.generate=async()=>result();s.select(source(),'bicycle');await s.create('16bit',true);const generated=s.result;
  t.mock.timers.tick(RESULT_TTL);assert.equal(s.result,null);assert.ok(generated.bytes.every(v=>v===0));
});
test('public upload is gated by review and receives only the generated asset',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});let sent;
  const s=new TwinSession({generate:async()=>result(),publish:async args=>{sent=args;return {id:'1789123456789-abc123',url:'https://api.admira.store/stock/asset/1789123456789-abc123'};}});
  s.select(source(),'motorcycle');await s.create('twin',true);
  assert.equal(await s.publishReviewed(false),false);assert.equal(sent,undefined);
  assert.equal(await s.publishReviewed(true),true);assert.equal('source' in sent,false);assert.equal(sent.result,s.result);
  assert.equal(s.phase,'published');assert.equal(s.source,null);s.clear();
});
test('expired results cannot publish after suspended timers and ambiguous uploads stay visible',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});let now=0,calls=0;const job=deferred();
  const s=new TwinSession({now:()=>now,generate:async()=>result(),publish:()=>{calls++;return job.promise;}});
  s.select(source(),'car');await s.create('twin',true);now=RESULT_TTL+1;
  assert.equal(await s.publishReviewed(true),false);assert.equal(calls,0);assert.equal(s.phase,'result-expired');
  s.select(source(),'car');await s.create('16bit',true);const pending=s.publishReviewed(true);
  t.mock.timers.tick(RESULT_TTL);assert.equal(s.phase,'publish-unknown');assert.equal(s.result,null);
  job.resolve({id:'1789123456789-abc123',url:'https://api.admira.store/stock/asset/1789123456789-abc123'});await pending;
  assert.equal(s.phase,'publish-unknown');s.clear();
});
test('publication ambiguity never retries or restores an original',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});let calls=0;
  const s=new TwinSession({generate:async()=>result(),publish:async()=>{calls++;throw new Error('lost response');}});
  s.select(source(),'car');await s.create('8bit',true);await s.publishReviewed(true);
  assert.equal(s.phase,'publish-unknown');assert.equal(await s.publishReviewed(true),false);assert.equal(calls,1);
  assert.equal(s.source,null);s.clear();
});
test('prompts cover all categories/styles without demographic tags or anonymity claims',()=>{
  for(const category of ['person','car','motorcycle','bicycle'])for(const style of ['8bit','16bit','twin']){
    const prompt=twinPrompt(category,style),payload=stockPayload(result(),category,style);
    assert.match(prompt,/Redibuja desde cero/);assert.equal(payload.type,'digital-twin');
    assert.equal(payload.base64,'iVBORwkIBwY=');assert.equal('image' in payload,false);
    assert.ok(!payload.tags.some(tag=>/seg:|hombre|mujer|edad|anonimizado/.test(tag)));
    assert.match(payload.comment,/No acredita anonimización/);
  }
  assert.throws(()=>twinPrompt('__proto__','8bit'));
});
test('remote images must be bounded raster data, never URLs or SVG',()=>{
  assert.equal(decodeImage('data:image/png;base64,iVBORwkIBwY=').bytes.length,8);
  for(const value of ['https://example.com/photo.png','data:image/svg+xml;base64,PHN2Zz4=','data:image/png;base64,YWJj','data:image/png;base64,'+'A'.repeat(8_000_000)])assert.throws(()=>decodeImage(value));
});
