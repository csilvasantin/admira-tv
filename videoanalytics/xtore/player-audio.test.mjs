import test from 'node:test';
import assert from 'node:assert/strict';
import {PlayerAudioBridge} from './player-audio.mjs';
function fixture(t){
  t.mock.timers.enable({apis:['setTimeout']});let id=0;
  const sent=[],states=[],target={postMessage:(data,origin)=>sent.push({data,origin})};
  const bridge=new PlayerAudioBridge({target,id:()=>String(++id),onState:s=>states.push(s)});
  const receive=(data,extra={})=>bridge.receive({source:target,origin:'null',data:{source:'admira-tv-canal',...data},...extra});
  t.after(()=>bridge.stop());return {bridge,target,sent,states,receive};
}
test('sound acknowledgements require the exact frame, origin and request and report effective audio',t=>{
  const f=fixture(t);f.bridge.setMuted(true);
  assert.equal(f.sent[0].data.command,'audiooff');assert.equal(f.sent[0].origin,'*');
  const ack={requestId:'1',ok:true,audio:{muted:true,volume:1}};
  f.receive(ack,{source:{}});f.receive(ack,{origin:'https://other.test'});f.receive({...ack,requestId:'unrelated'});
  assert.equal(f.states.at(-1).pending,true);
  f.receive(ack);assert.equal(f.states.at(-1).muted,true);assert.equal(f.states.at(-1).pending,false);
  f.bridge.setMuted(false);assert.equal(f.sent.at(-1).data.command,'audioon');
  f.receive({requestId:'2',ok:true,audio:{muted:false,volume:0}});
  assert.equal(f.states.at(-1).muted,true);
});
test('internal audio changes synchronize without issuing commands; invalid reports cannot invent state',t=>{
  const f=fixture(t);
  f.receive({event:'audio-state',muted:true,volume:0.7});
  assert.equal(f.states.at(-1).muted,true);assert.equal(f.sent.length,0);
  for(const volume of [-1,2,NaN,null])f.receive({event:'audio-state',muted:false,volume});
  assert.equal(f.states.length,1);
  f.receive({event:'media-state',muted:false,volume:0.7});assert.equal(f.states.at(-1).muted,false);
});
test('sound timeout and negative ACK allow retry without closing playback; late responses stay obsolete',t=>{
  const f=fixture(t);f.bridge.setMuted(true);assert.equal(f.bridge.setMuted(false),false);
  t.mock.timers.tick(2501);assert.match(f.states.at(-1).error,/Sin confirmación/);assert.equal(f.bridge.closed,false);
  f.bridge.setMuted(false);f.receive({requestId:'1',ok:true,audio:{muted:true,volume:1}});assert.equal(f.states.at(-1).pending,true);
  f.receive({requestId:'2',ok:false});assert.equal(f.states.at(-1).pending,false);
  f.bridge.setMuted(true);f.receive({requestId:'3',ok:true});assert.match(f.states.at(-1).error,/no confirmó/);
  f.bridge.stop();const count=f.states.length;f.receive({event:'audio-state',muted:true,volume:1});t.mock.timers.tick(3000);
  assert.equal(f.states.length,count);assert.equal(f.bridge.setMuted(false),false);
});
