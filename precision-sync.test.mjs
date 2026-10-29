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
 for(const condition of ['paused','ended']){m[condition]=true;m.playbackRate=.9;assert.equal(tick().mode,'idle');assert.equal(m.playbackRate,1);m[condition]=false;}
 m.seeking=true;m.playbackRate=.9;assert.equal(tick().mode,'seeking');assert.equal(m.playbackRate,.9);m.seeking=false;
 m.readyState=1;assert.equal(tick().mode,'buffering');assert.equal(m.playbackRate,.9);m.readyState=4;assert.equal(tick(false).mode,'idle');
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

function asynchronousMedia() {
 let currentTime=99,rate=1,pitch=false;const listeners=new Map();
 const m={duration:228,paused:false,ended:false,seeking:false,readyState:4,rateWrites:0,pitchWrites:0,seeks:[],
  get currentTime(){return currentTime;},set currentTime(v){m.seeking=true;m.seeks.push(v);},
  get playbackRate(){return rate;},set playbackRate(v){rate=v;m.rateWrites++;},
  get preservesPitch(){return pitch;},set preservesPitch(v){pitch=v;m.pitchWrites++;},
  addEventListener:(n,f)=>listeners.set(n,f),removeEventListener:(n,f)=>{if(listeners.get(n)===f)listeners.delete(n);},
  advance:s=>{if(!m.seeking&&!m.paused)currentTime+=s*rate;},
  complete:(target)=>{currentTime=target;m.seeking=false;listeners.get('seeked')?.();},
  listener:()=>listeners.get('seeked')};return m;
}
test('asynchronous seek latency is measured and compensated while rate correction converges',()=>{
 for(const latency of [650,1500]){
 let now=0,completion=null;const m=asynchronousMedia(),s=api.createServo({now:()=>now});
 const tick=()=>s.tick({media:m,identity:'long-h264',enabled:true,targetSec:100+now/1000,nowMs:now});
 for(now=0;now<=20000;now+=50){
  if(completion&&now===completion.at){m.complete(completion.target);completion=null;}
  if(now%250===0){const count=m.seeks.length;tick();if(m.seeks.length>count)completion={at:now+latency,target:m.seeks.at(-1)};}
  m.advance(.05);
 }
 const state=s.status();assert.equal(state.seekLatencyMs,latency);assert.equal(state.seekLeadMs,latency+40);
 assert.ok(state.seeks>=1&&state.seeks<=3,JSON.stringify(state));if(latency===1500)assert.ok(state.seeks>=2,'long seek must use the learned lead on a subsequent correction');assert.ok(Math.abs(state.driftMs)<=20,JSON.stringify(state));
 assert.equal(m.pitchWrites,1);assert.ok(m.rateWrites<50,'stable rates must not be rewritten every tick');
 }
});
test('rate and pitch setters run only when changed; seeking keeps the selected rate',()=>{
 let now=0;const m=asynchronousMedia(),s=api.createServo({now:()=>now});m.complete(100);
 const tick=target=>s.tick({media:m,identity:1,enabled:true,targetSec:target,nowMs:now});
 tick(100.1);const writes=m.rateWrites;for(let i=0;i<8;i++){now+=250;tick(100.1);}
 assert.equal(m.rateWrites,writes);assert.equal(m.pitchWrites,1);
 m.seeking=true;now+=250;assert.equal(tick(101).mode,'seeking');assert.equal(m.rateWrites,writes);
});
test('seek completion and counters belong to their media identity; old callbacks cannot contaminate a new piece',()=>{
 let now=0;const a=asynchronousMedia(),b=asynchronousMedia(),s=api.createServo({now:()=>now});
 s.tick({media:a,identity:'a',enabled:true,targetSec:100,nowMs:now});const old=a.listener();
 now=100;s.tick({media:b,identity:'b',enabled:true,targetSec:99,nowMs:now});now=800;old();
 const state=s.status();assert.equal(state.identity,'b');assert.equal(state.seeks,0);assert.equal(state.totalSeeks,1);
 assert.equal(state.seekLatencyMs,null);assert.equal(state.seekInFlight,false);assert.equal(a.listener(),undefined);
});
test('a stalled seek times out without a seek storm and a paused operator never resumes',()=>{
 let now=0;const m=asynchronousMedia(),s=api.createServo({now:()=>now});
 const tick=enabled=>s.tick({media:m,identity:1,enabled,targetSec:100+now/1000,nowMs:now});
 tick(true);for(now=250;now<=10500;now+=250)tick(true);
 assert.equal(m.seeks.length,1);assert.equal(s.status().seekFailures,1);assert.equal(s.status().mode,'seeking');
 m.paused=true;m.playbackRate=1.1;now+=250;assert.equal(tick(true).mode,'idle');assert.equal(m.playbackRate,1);
 assert.equal(m.paused,true);assert.equal(m.seeks.length,1);
});
test('canal telemetry refuses a servo sample from the previous media token',()=>{
 const html=readFileSync(new URL('./canal.html',import.meta.url),'utf8');
 const source=html.slice(html.indexOf('function precisionSyncStatus(){'),html.indexOf('// The same servo controls'));
 const ctx=vm.createContext({_precisionClock:{status:()=>({ready:true})},_precisionServo:{status:()=>({identity:1,driftMs:800,seeks:26,totalSeeks:30})},
 _playTok:2,mediaEl:media(),_precisionFrames:new WeakMap(),syncOn:false,performance:{now:()=>0},syncNow:()=>100});
 vm.runInContext(source,ctx);const state=vm.runInContext('precisionSyncStatus()',ctx);
 assert.equal(state.mediaToken,2);assert.equal(state.servo.driftMs,null);assert.equal(state.servo.seeks,0);
 assert.equal(state.servo.totalSeeks,30);assert.equal(state.servo.mode,'awaiting-media');
});
test('auto strategy selects WebKit including iOS browsers and keeps Chromium/Android/Electron on rate',()=>{
 for(const ua of ['Version/18 Safari/605 AppleWebKit/605','AdmiraMacOSPlayer/1.7','AdmiraIOSPlayer/2','AppleWebKit/605 CriOS/130 Mobile Safari/604','AppleWebKit/605 FxiOS/130 Mobile Safari/604']){
  assert.equal(api.strategyForUserAgent(ua),'seek');assert.equal(api.createServo({userAgent:ua}).status().strategy,'seek');
 }
 for(const ua of ['AppleWebKit/537 Chrome/130 Safari/537','AppleWebKit/537 Chromium/130','AppleWebKit/537 Edg/130','Electron/33 Safari/537','Android AppleWebKit/537',''])assert.equal(api.strategyForUserAgent(ua),'rate');
 assert.equal(api.createServo({userAgent:'Safari',strategy:'rate'}).status().strategy,'rate');
 assert.equal(api.createServo({userAgent:'Chrome',strategy:'seek'}).status().strategy,'seek');
});
function seekHarness(){
 let now=0,start=0,time=99,rate=1,pending=null,stall=0,key='a|https://s/a|228',identity=1,writes=0,media;
 const servo=api.createServo({strategy:'seek',now:()=>now});
 function swap(nextKey,nextIdentity){key=nextKey;identity=nextIdentity;start=now;time=99;rate=1;pending=null;stall=0;
  const events=new Map();media={duration:228,paused:false,ended:false,seeking:false,readyState:4,
   get currentTime(){return time;},set currentTime(v){media.seeking=true;pending={at:now+200,target:v};},
   get playbackRate(){return rate;},set playbackRate(v){writes++;rate=v;},
   addEventListener:(n,f)=>events.set(n,f),removeEventListener:(n,f)=>{if(events.get(n)===f)events.delete(n);},events};
 }
 swap(key,identity);
 function tick(enabled=true){return servo.tick({media,identity,assetKey:key,enabled,targetSec:100+(now-start)/1000,nowMs:now});}
 function run(ms){const stop=now+ms;for(;now<=stop;now+=50){
  if(pending&&now===pending.at){time=pending.target;pending=null;media.seeking=false;stall=now+800;media.events.get('seeked')?.();}
  if((now-start)%250===0)tick();if(!media.seeking&&!media.paused&&now>=stall)time+=.05*rate;
 }return servo.status();}
 return {servo,run,tick,swap,get media(){return media;},get writes(){return writes;}};
}
test('WebKit fixed-rate strategy learns stable residual rather than early seeked and avoids rate writes',()=>{
 const h=seekHarness(),s=h.run(20000);assert.equal(h.writes,0);assert.equal(s.seeks,2);
 assert.equal(s.seekLatencyMs,200);assert.ok(s.settledLatencyMs>=1750);
 assert.ok(Math.abs(s.nextSeekLeadMs-1000)<2);assert.ok(Math.abs(s.driftMs)<=35);assert.equal(s.rate,1);
});
test('only a validated within-band asset lead survives a new identity; another asset starts independently',()=>{
 const h=seekHarness();h.run(3000);h.swap('a|https://s/a|228',2);
 assert.equal(h.tick().nextSeekLeadMs,40,'out-of-band residual is not a reusable calibration');
 const learned=h.run(20000).nextSeekLeadMs;h.swap('a|https://s/a|228',3);
 let s=h.tick();assert.equal(s.leadSource,'asset');assert.equal(s.nextSeekLeadMs,learned);assert.equal(s.seeks,0);
 s=h.run(5000);assert.equal(s.seeks,1);assert.ok(Math.abs(s.driftMs)<=35);
 h.swap('a|https://s/a-new-url|228',4);assert.equal(h.tick().nextSeekLeadMs,40);
});
test('asset lead cache is limited to32entries and fixed-rate guards never resume paused or disabled media',()=>{
 const h=seekHarness();for(let i=0;i<33;i++){h.swap('asset-'+i,i+1);h.run(20000);}
 h.swap('asset-0',40);assert.equal(h.tick().leadSource,'default');
 h.media.paused=true;assert.equal(h.tick().mode,'idle');assert.equal(h.media.paused,true);
 h.media.paused=false;assert.equal(h.tick(false).mode,'idle');assert.equal(h.writes,0);
});
