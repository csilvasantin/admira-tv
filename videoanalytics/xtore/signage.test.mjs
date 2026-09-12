import test from 'node:test';
import assert from 'node:assert/strict';
import {PLAYER_ORIGIN,AUDIENCE_TTL,playerURL,SignageBridge} from './signage.mjs';
function fixture(t){
  t.mock.timers.enable({apis:['setTimeout']});
  let serial=0,now=0;const sent=[],states=[],errors=[];
  const target={postMessage:(data,origin)=>sent.push({data,origin})};
  const bridge=new SignageBridge({target,id:()=>String(++serial),now:()=>now,onState:s=>states.push(s),onFailure:e=>errors.push(e)});
  const ack=(requestId=sent.at(-1).data.requestId,extra={})=>bridge.receive({origin:'null',source:target,data:{source:'admira-tv-canal',requestId,ok:true},...extra});
  const tick=ms=>{now+=ms;t.mock.timers.tick(ms);};
  return {sent,states,errors,bridge,target,ack,tick};
}
test('virtual player URL is isolated, music-enabled, conditional and without camera, screenshots or auction',()=>{
  assert.throws(()=>playerURL('xtanco-totem'));
  const url=new URL(playerURL('xtore-virtual-12345678'));
  assert.equal(url.origin,PLAYER_ORIGIN);
  assert.equal(url.searchParams.get('screen'),'xtore-virtual-12345678');
  assert.equal(url.searchParams.get('circuit'),'admiranext');assert.equal(url.searchParams.get('machine'),'');
  assert.equal(url.searchParams.get('playerType'),'virtual');
  for(const k of ['cam','shot','rtb'])assert.equal(url.searchParams.get(k),'0');
  assert.equal(url.searchParams.get('mode'),'conditional');assert.equal(url.searchParams.get('muted'),'0');assert.equal(url.searchParams.get('xtoreMusic'),'1');
  assert.equal(url.searchParams.get('format'),null);assert.equal(url.searchParams.get('stream'),'1');assert.equal(url.searchParams.get('xtoreParent'),'1');
  assert.equal(url.searchParams.get('parentOrigin'),PLAYER_ORIGIN);
  assert.equal(new URL(playerURL('xtore-virtual-12345678','http://127.0.0.1:56594')).origin,'http://127.0.0.1:56594');
  assert.throws(()=>playerURL('xtore-virtual-12345678','https://evil.example'));
});
test('bridge requires source, origin and correlated ACK; sends only category and expires to neutral',t=>{
  const f=fixture(t);f.bridge.start();f.bridge.passage([{class:'bicycle'}]);assert.equal(f.sent.length,1);
  f.ack(undefined,{origin:'https://attacker.test'});assert.equal(f.bridge.ready,false);
  f.ack(undefined,{source:{}});assert.equal(f.bridge.ready,false);
  f.ack('not-pending');assert.equal(f.bridge.ready,false);
  f.ack();assert.equal(f.bridge.ready,true);
  f.bridge.passage([{class:'person',sex:'m',image:'PRIVATE'},{class:'bicycle'}]);
  assert.equal(f.sent.at(-1).data.command,'admiratv audiencia bici');
  assert.deepEqual(Object.keys(f.sent.at(-1).data),['source','requestId','command']);
  assert.ok(f.sent.every(s=>s.origin==='*'));f.ack();
  f.tick(AUDIENCE_TTL);assert.equal(f.sent.at(-1).data.command,'admiratv audiencia u');f.ack();
  f.bridge.stop();
});
test('ACK timeout fails closed and stop prevents later commands',t=>{
  const f=fixture(t);f.bridge.start();f.ack();f.bridge.passage([{class:'car'}]);f.tick(2501);
  assert.equal(f.errors.length,1);assert.equal(f.bridge.closed,true);
  f.ack();f.bridge.passage([{class:'person'}]);assert.equal(f.sent.length,2);
});
test('late ACK cannot overwrite newer category and rejected commands shut down',t=>{
  const f=fixture(t);f.bridge.start();f.ack();
  f.bridge.passage([{class:'person'}]);const old=f.sent.at(-1).data.requestId;
  f.bridge.passage([{class:'car'}]);f.ack();f.ack(old);
  assert.equal(f.states.at(-1).kind,'car');
  f.bridge.passage([{class:'bicycle'}]);f.ack(undefined,{data:{source:'admira-tv-canal',requestId:f.sent.at(-1).data.requestId,ok:false}});
  assert.equal(f.errors.length,1);assert.equal(f.bridge.closed,true);
});
test('subsequent real passages refresh the neutral deadline; unknown labels do not',t=>{
  const f=fixture(t);f.bridge.start();f.ack();f.bridge.passage([{class:'bicycle'}]);f.ack();f.tick(4000);
  f.bridge.passage([{class:'car'}]);f.ack();f.tick(2500);assert.equal(f.sent.at(-1).data.command,'admiratv audiencia coche');
  f.bridge.passage([{class:'dog'}]);f.tick(3500);assert.equal(f.sent.at(-1).data.command,'admiratv audiencia u');
  f.ack();f.bridge.stop();
});
test('superseded missing or negative ACK cannot stop a newer acknowledged state',t=>{
  const f=fixture(t);f.bridge.start();f.ack();f.bridge.passage([{class:'person'}]);const old=f.sent.at(-1).data.requestId;
  f.tick(1000);f.bridge.passage([{class:'bicycle'}]);f.ack();
  f.ack(old,{data:{source:'admira-tv-canal',requestId:old,ok:false}});
  f.tick(1600);assert.equal(f.bridge.closed,false);assert.deepEqual(f.errors,[]);assert.equal(f.states.at(-1).kind,'bicycle');f.bridge.stop();
});
test('frequent new passages cannot renew an unacknowledged channel indefinitely',t=>{
  const f=fixture(t);f.bridge.start();f.ack();f.bridge.passage([{class:'car'}]);f.ack();
  f.bridge.passage([{class:'bicycle'}]);
  for(let i=0;i<3;i++){f.tick(1000);f.bridge.passage([{class:'bicycle'}]);}
  assert.equal(f.bridge.closed,true);assert.equal(f.errors.length,1);
});
test('startup probes reuse a neutral request ID, stop after ACK and are bounded to 20s',t=>{
  const f=fixture(t);f.bridge.start();f.tick(500);f.tick(500);
  assert.equal(f.sent.length,3);assert.equal(new Set(f.sent.map(s=>s.data.requestId)).size,1);
  f.ack();f.tick(500);assert.equal(f.sent.length,3);f.bridge.stop();
});
test('startup without a reply closes after 20s',t=>{
  const g=fixture(t);g.bridge.start();g.tick(20001);assert.equal(g.bridge.closed,true);assert.equal(g.errors.length,1);
});
test('pausing analysis returns to the general loop without closing the bridge or leaking an old expiry',t=>{
  const f=fixture(t);f.bridge.start();f.ack();f.bridge.passage([{class:'car'}]);f.ack();f.tick(1000);
  f.bridge.neutral();f.ack();const count=f.sent.length;f.tick(6000);
  assert.equal(f.sent.length,count);assert.equal(f.bridge.closed,false);assert.equal(f.states.at(-1).kind,'none');f.bridge.stop();
});
