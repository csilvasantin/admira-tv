import test from 'node:test';
import assert from 'node:assert/strict';
import {DirectionCounter,DEFAULT_DIRECTION_AXIS,validDirectionAxis,audienceSnapshot} from './audience-session.mjs';
import {PassageTracker,PassageCounts} from './core.mjs';
import {CalibrationPresetStore} from './preset.mjs';
function path(points,{axis=DEFAULT_DIRECTION_AXIS,counter=new DirectionCounter(),tracker=new PassageTracker(),totals=new PassageCounts(),start=1000}={}){
  points.forEach(([x,y],i)=>{const now=start+i*200;const events=tracker.update([{class:'person',score:.9,bbox:[x*1000,y*1000,100,180]}],now,1000,1000);totals.add(events);counter.update(tracker.visible(now),events,now,axis);});
  return {counter,tracker,totals};
}
test('approach and departure count once each; cumulative total is independent',()=>{
  const a=path([[.3,.2],[.3,.25],[.3,.3],[.3,.36],[.3,.4]]);
  assert.deepEqual(a.totals.counts.person,1);assert.deepEqual(a.counter.snapshot(1),{enter:1,exit:0,unknown:0});
  const b=path([[.6,.6],[.6,.55],[.6,.5],[.6,.45]]);assert.deepEqual(b.counter.snapshot(1),{enter:0,exit:1,unknown:0});
});
test('short, lateral and jittery movement stays unclassified',()=>{
  for(const points of [[[.3,.2],[.3,.22],[.3,.21],[.3,.225]],[[.2,.4],[.25,.4],[.3,.4],[.35,.4]]]){
    const {counter,totals}=path(points);assert.equal(totals.counts.person,1);assert.deepEqual(counter.snapshot(1),{enter:0,exit:0,unknown:1});
  }
});
test('diagonal calibration and reverse direction are supported',()=>{
  assert.equal(validDirectionAxis([[.8,.2],[.2,.8]]),true);
  const {counter}=path([[.65,.2],[.61,.24],[.57,.28],[.53,.32]],{axis:[[.8,.2],[.2,.8]]});assert.equal(counter.enter,1);
  assert.equal(validDirectionAxis([[0,0],[0,.05]]),false);
});
test('reset and geometry changes never classify old passages into new totals',()=>{
  const a=path([[.3,.2],[.3,.24]]);a.counter.reset();a.totals.reset();
  path([[.3,.28],[.3,.32],[.3,.37],[.3,.42]],{...a,start:1400});
  assert.deepEqual(a.counter.snapshot(0),{enter:0,exit:0,unknown:0});
});
test('a gap requires fresh trajectory evidence and duplicate frames cannot confirm direction',()=>{
  const c=new DirectionCounter();const obs=(y)=>[{class:'person',trackId:1,bbox:[.3,y,.1,.1],confirmed:true,uncertain:false,ageMs:0}];
  c.update(obs(.2),[{class:'person',trackId:1}],1000);c.update(obs(.3),[],3000);c.update(obs(.5),[],3000);
  assert.equal(c.enter,0);c.update(obs(.34),[],3200);c.update(obs(.4),[],3400);assert.equal(c.enter,1);
});
test('axis persists with calibration without invalidating older presets',()=>{
  const map=new Map(),store=new CalibrationPresetStore(()=>({getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)}));
  const common={source:[1000,600],roi:[.1,.1,.5,.5]};store.save(common);assert.equal(store.read().state,'saved');
  store.save({...common,directionAxis:[[.8,.2],[.2,.8]]});assert.deepEqual(store.read().preset.directionAxis,[[.8,.2],[.2,.8]]);
});
test('wire snapshot includes only aggregates and detached geometry',()=>{
  const counts={person:9,car:1,motorcycle:0,bicycle:2,scooter:0};const a=audienceSnapshot({sessionId:'00000000-0000-0000-0000-000000000001',startedAt:1,revision:2,updatedAt:3,counts,directions:{enter:4,exit:3,unknown:2},axis:DEFAULT_DIRECTION_AXIS,state:'paused'});
  counts.person=500;assert.equal(a.counts.person,9);assert.equal(a.metric,'cumulative-passages');assert.equal(a.tracks,undefined);
});
