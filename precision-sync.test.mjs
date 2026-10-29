import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const api=createRequire(import.meta.url)('./assets/precision-sync.js');
const mba=createRequire(import.meta.url)('./assets/mba-auto-sync.js');
const samples=offset=>Array.from({length:9},(_,i)=>({offset:offset+(i>4?2000:0),rtt:i>4?800:20+i}));
function clock(){let wall=100000,mono=0,saved;const c=api.createClock({wallNow:()=>wall,monoNow:()=>mono,save:v=>saved=v});
 return {c,step:ms=>{wall+=ms;mono+=ms;},jump:ms=>wall+=ms,get saved(){return saved;}};}
test('four timestamps remove server processing and estimate midpoint offset',()=>{
 assert.deepEqual(api.measurement(1000,1110,1117,1027),{offset:100,rtt:20});
 for(const v of [[0,0,0,4000],[2,2,1,3],[2,3,3,1],[0,NaN,0,1]])assert.equal(api.measurement(...v),null);
});
test('best five of nine reject congested outliers; too few measurements preserve lock',()=>{
 const {c}=clock();assert.equal(c.accept(samples(120)),true);assert.equal(c.now(),100120);
 assert.equal(c.status().rttMs,22);assert.equal(c.status().uncertaintyMs,12);
 assert.equal(c.accept([{offset:-999,rtt:1}]),false);assert.equal(c.now(),100120);
});
test('wall-clock jumps do not move acquired time; subsequent updates slew 20ms/s',()=>{
 const d=clock();d.c.accept(samples(100));d.jump(3600000);d.step(1000);assert.equal(d.c.now(),101100);
 d.c.accept(samples(200));d.step(1000);assert.equal(d.c.now(),102120);
 d.step(4000);assert.equal(d.c.now(),106200);
 // Persist against the current wall epoch, not the old monotonic anchor.
 assert.equal(d.saved.offset,200-3600000);
});
test('recent persisted clock provides holdover; stale state is rejected and fresh lock replaces holdover',()=>{
 const make=s=>api.createClock({wallNow:()=>100000,monoNow:()=>0,load:()=>s});
 const c=make({offset:20,measuredAt:90000});assert.equal(c.now(),100020);assert.equal(c.status().source,'holdover');
 c.accept(samples(500));assert.equal(c.now(),100020);assert.equal(c.status().source,'https');
 assert.equal(make({offset:20,measuredAt:1-86400000}).ready,false);
});
test('a valid large correction reacquires after suspended monotonic time',()=>{
 const d=clock();d.c.accept(samples(100));d.step(1000);
 d.c.accept(samples(3600100));assert.equal(d.c.now(),3701100);assert.equal(d.c.status().slewing,false);
});
test('transport takes nine independent uncached samples; failures keep a usable previous clock',async()=>{
 let mono=0,calls=0;const c=api.createClock({wallNow:()=>1000,monoNow:()=>mono});
 const fetcher=async(url,opt)=>{calls++;assert.match(url,/sample=/);assert.equal(opt.cache,'no-store');assert.equal(opt.credentials,'omit');
 const at=1000+mono;mono+=20;return {ok:true,json:async()=>({ok:true,protocol:'admira-clock-v1',serverReceivedAt:at+110,serverSentAt:at+110})};};
 assert.equal(await c.synchronize(fetcher,'https://clock.test'),true);assert.equal(calls,9);assert.equal(c.status().offsetMs,100);
 assert.equal(await c.synchronize(async()=>{throw Error('offline');},'https://clock.test'),false);assert.equal(c.status().offsetMs,100);
});
const media=()=>({currentTime:5,duration:30,paused:false,ended:false,seeking:false,readyState:4,playbackRate:1});
test('servo corrects both directions, leaves fine band at 1x and preserves pitch',()=>{
 const s=api.createServo(),m=media();const tick=target=>s.tick({media:m,identity:1,enabled:true,targetSec:target,nowMs:1000});
 assert.equal(tick(5).mode,'locked');assert.equal(m.playbackRate,1);
 tick(5.15);assert.ok(m.playbackRate>1);assert.equal(m.preservesPitch,true);
 tick(4.85);assert.ok(m.playbackRate<1);tick(5.005);assert.equal(m.playbackRate,1);
});
test('large drift seeks with cooldown; paused, buffering, standby and local never force playback',()=>{
 const s=api.createServo(),m=media();const tick=(enabled=true,now=1000)=>s.tick({media:m,identity:1,enabled,targetSec:10,nowMs:now});
 assert.equal(tick().mode,'seek');assert.equal(m.currentTime,10.04);m.currentTime=5;
 assert.equal(tick(true,1250).mode,'correcting');assert.equal(m.currentTime,5);
 assert.equal(tick(true,4000).mode,'seek');
 for(const condition of ['paused','seeking','ended']){m[condition]=true;m.playbackRate=.9;assert.equal(tick().mode,'idle');assert.equal(m.playbackRate,1);m[condition]=false;}
 m.readyState=1;assert.equal(tick().mode,'idle');m.readyState=4;assert.equal(tick(false).mode,'idle');
});
test('old media rate resets on transition; circular wall does not seek spuriously at wrap',()=>{
 const s=api.createServo(),m=media(),next=media();m.currentTime=29.99;
 const state=s.tick({media:m,identity:1,enabled:true,targetSec:.01,nowMs:1,circular:true});
 assert.equal(state.mode,'correcting');assert.ok(m.playbackRate>1);assert.equal(state.seeks,0);
 s.tick({media:next,identity:2,enabled:false,nowMs:2});assert.equal(m.playbackRate,1);
});
test('MBA pending activation uses precision clock despite delayed state timestamp',()=>{
 let at=89999,scheduled;const active={revision:'a',epochMs:0,items:[{id:'a',url:'https://s/a',dur:10}]};
 const pending={...active,revision:'b',epochMs:90000};
 const c=mba.create({now:()=>at,serverNow:()=>at,setTimeout:(fn,delay)=>{scheduled={fn,delay};return 1;},clearTimeout:()=>{}});
 c.receive({ok:true,group:'mba-admira-tv',serverNow:85000,active,pending},at);
 assert.equal(c.current.revision,'a');assert.equal(scheduled.delay,1);at=90000;scheduled.fn();assert.equal(c.current.revision,'b');
});
test('canal servo reacquires after suspension but respects pause, standby, direct and preview',()=>{
 const html=readFileSync(new URL('./canal.html',import.meta.url),'utf8');
 const source=html.slice(html.indexOf('function precisionSyncTick(){'),html.indexOf('\nfunction syncFallbackSlotMs'));
 let calls=[],ticks=[];const ctx=vm.createContext({_precisionServo:{tick:v=>ticks.push(v)},syncOn:true,_extendedAssignment:null,
 paused:false,_standby:false,directOn:false,PREVIEW:{on:false},playlist:[{}],cur:0,SYNC_REMOTE:{},mediaEl:media(),
 performance:{now:()=>2000},_precisionBoundaryAt:0,_playTok:1,syncTimeline:()=>({index:1,elapsed:1000}),play:i=>calls.push(i)});
 vm.runInContext(source,ctx);vm.runInContext('precisionSyncTick()',ctx);assert.deepEqual(calls,[1]);
 for(const flag of ['paused','_standby','directOn']){ctx[flag]=true;vm.runInContext('precisionSyncTick()',ctx);assert.equal(ticks.at(-1).enabled,false);ctx[flag]=false;}
 ctx.PREVIEW.on=true;vm.runInContext('precisionSyncTick()',ctx);assert.equal(ticks.at(-1).enabled,false);assert.deepEqual(calls,[1]);
});
