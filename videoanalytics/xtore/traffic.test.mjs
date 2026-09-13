import test from 'node:test';
import assert from 'node:assert/strict';
import {trafficSnapshot,TRAFFIC_TTL,MAX_TRAFFIC_TRACKS} from './traffic.mjs';
const observation=(extra={})=>({trackId:1,class:'person',bbox:[.1,.2,.3,.4],confirmed:true,ageMs:40,...extra});

test('wire copies only ephemeral geometry, clips ROI edges and preserves capture/observation ages',()=>{
  const source=observation({bbox:[-.1,.8,.4,.4],ageMs:200,name:'not transmitted',photo:'not transmitted',look:{gender:'not transmitted'}});
  const original=structuredClone(source),value=trafficSnapshot([source],100,10000);
  assert.equal(value.frameAt,9900);assert.equal(value.tracks[0].observedAt,9800);
  assert.deepEqual(Object.keys(value.tracks[0]).sort(),['id','kind','box','x','y','observedAt','confirmed'].sort());
  assert.deepEqual(value.tracks[0].box,[0,.8,.30000000000000004,.19999999999999996]);
  assert.equal(value.tracks[0].x,.15000000000000002);assert.equal(value.tracks[0].y,1);
  assert.deepEqual(source,original);value.tracks[0].box[0]=.5;assert.deepEqual(source,original);
  assert.equal(trafficSnapshot([observation({ageMs:0})],100,10000).tracks[0].observedAt,9900);
});

test('only confirmed fresh tracks with real nonempty geometry travel; empty analysis remains valid',()=>{
  const invalid=[{confirmed:false},{ageMs:TRAFFIC_TTL},{ageMs:-1},{ageMs:NaN},{class:'unknown'},{trackId:0},{trackId:1.5},
    {bbox:[0,0,0,.1]},{bbox:[2,0,.1,.1]},{bbox:[0,0,NaN,.1]},{bbox:[0,0,.1]}];
  for(const extra of invalid)assert.deepEqual(trafficSnapshot([observation(extra)],0,10000),{frameAt:10000,tracks:[]});
  for(const age of [-1,TRAFFIC_TTL,NaN,Infinity])assert.equal(trafficSnapshot([],age,10000),null);
  assert.equal(trafficSnapshot(null,0,10000),null);assert.equal(trafficSnapshot([],0,NaN),null);
  assert.deepEqual(trafficSnapshot([],50,10000),{frameAt:9950,tracks:[]});
  assert.equal(trafficSnapshot([observation()],1499,10000).tracks.length,1);
});

test('a scooter requires human confirmation on an existing track; a manual counter supplies no trajectory',()=>{
  assert.equal(trafficSnapshot([observation({class:'scooter'})],0,10000).tracks.length,0);
  assert.equal(trafficSnapshot([{class:'scooter',manual:true}],0,10000).tracks.length,0);
  const result=trafficSnapshot([observation({class:'scooter',manual:true})],0,10000);
  assert.equal(result.tracks[0].kind,'scooter');assert.equal(result.tracks[0].manual,true);
  assert.equal(trafficSnapshot([observation({manual:true})],0,10000).tracks[0].manual,undefined);
});

test('duplicates and excessive candidates cannot expand the bounded track payload',()=>{
  const candidates=Array.from({length:300},(_,i)=>observation({trackId:i+1}));
  assert.equal(trafficSnapshot(candidates,0,10000).tracks.length,MAX_TRAFFIC_TRACKS);
  assert.equal(trafficSnapshot([observation(),observation({class:'car'})],0,10000).tracks.length,1);
});
