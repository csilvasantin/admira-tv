// Presence is recent visual evidence, independently of one-time passage counts.
// Deterministic clock and in-memory messages only: no capture, player or network.
import test from 'node:test';
import assert from 'node:assert/strict';
import {PassageTracker,PassageCounts,PRESENCE_GRACE} from './core.mjs';
import {SignageBridge,AUDIENCE_TTL,VEHICLE_EXIT_TAIL} from './signage.mjs';

const thresholds={person:.65,car:.65,motorcycle:.65,bicycle:.4};
const detection=(category='person',x=100,score=.9)=>({class:category,score,bbox:[x,100,80,180]});
const observation=(category='person',ageMs=0,extra={})=>({class:category,ageMs,confirmed:true,...extra});
function bridgeFixture(){
  let now=10000,sequence=0,timerId=0;
  const timers=new Map(),sent=[],states=[],errors=[];
  const target={postMessage:(data,origin)=>sent.push({data,origin,at:now})};
  const bridge=new SignageBridge({target,now:()=>now,id:()=>String(++sequence),
    setTimer:(fn,ms)=>{const id=++timerId;timers.set(id,{fn,at:now+ms});return id;},
    clearTimer:id=>timers.delete(id),onState:state=>states.push(state),onFailure:error=>errors.push(error)});
  const ack=(requestId=sent.at(-1).data.requestId,ok=true)=>bridge.receive({origin:'null',source:target,data:{source:'admira-tv-canal',requestId,ok}});
  const tick=ms=>{
    const end=now+ms;let iterations=0;
    while(true){
      const next=[...timers.entries()].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at||a[0]-b[0])[0];
      if(!next)break;
      assert.ok(++iterations<1000,'timers must not spin');
      timers.delete(next[0]);now=next[1].at;next[1].fn();
    }
    now=end;
  };
  bridge.start();ack();
  return {bridge,target,sent,states,errors,timers,ack,tick,get now(){return now;}};
}

test('stationary subjects remain confirmed for over 20s without counting a passage',()=>{
  const tracker=new PassageTracker(),counts=new PassageCounts();let ids;
  const detections=['person','car','motorcycle','bicycle'].map((kind,i)=>detection(kind,100+i*180,kind==='bicycle'?.45:.9));
  for(let now=0;now<=22000;now+=200){
    counts.add(tracker.update(detections,now,1000,600,thresholds));
    const visible=tracker.visible(now);
    assert.equal(visible.length,4);
    if(!ids)ids=visible.map(o=>o.trackId);
    assert.deepEqual(visible.map(o=>o.trackId),ids);
    assert.ok(visible.every(o=>o.ageMs===0));
    if(now===0)assert.ok(visible.every(o=>!o.confirmed));
    if(now===200){assert.ok(visible.filter(o=>o.class!=='bicycle').every(o=>o.confirmed));assert.equal(visible.find(o=>o.class==='bicycle').confirmed,false);}
    if(now>=400)assert.ok(visible.every(o=>o.confirmed));
  }
  assert.equal(counts.total,0);
});

test('one moving passage stays visible and keeps its ID for over 20s without duplicate counts',()=>{
  const tracker=new PassageTracker(),counts=new PassageCounts();let id;
  for(let now=0;now<=22000;now+=200){
    counts.add(tracker.update([detection('person',now?120:100)],now,1000,600,thresholds));
    const current=tracker.visible(now)[0];
    id??=current.trackId;assert.equal(current.trackId,id);
    if(now)assert.equal(current.confirmed,true);
  }
  assert.equal(counts.total,1);assert.equal(counts.counts.person,1);
});

test('a cyclist keeps both person and bicycle passage counts while confirmed bicycle wins playback priority',()=>{
  const tracker=new PassageTracker(),counts=new PassageCounts(),f=bridgeFixture();let ids;
  for(let elapsed=0;elapsed<=2400;elapsed+=200){
    if(elapsed)f.tick(200);
    const x=100+Math.min(elapsed/10,40);
    // Overlapping rider and bike boxes are distinct classes, not duplicate people.
    const detections=[
      {class:'person',score:.9,bbox:[x,100,60,140]},
      {class:'bicycle',score:.45,bbox:[x-20,160,140,85]},
    ];
    counts.add(tracker.update(detections,f.now,1000,600,thresholds));
    const visible=tracker.visible(f.now);
    assert.equal(visible.length,2);
    ids??=visible.map(o=>o.trackId);assert.deepEqual(visible.map(o=>o.trackId),ids);
    assert.equal(new Set(ids).size,2);
    f.bridge.presence(visible);f.ack();
    if(elapsed>=400){
      assert.ok(visible.every(o=>o.confirmed));
      assert.equal(counts.counts.person,1);assert.equal(counts.counts.bicycle,1);
      assert.equal(counts.total,2,'bicycle priority does not subtract the rider passage');
      assert.equal(f.sent.at(-1).data.command,'admiratv audiencia bici');
    }
  }
  assert.equal(counts.counts.car,0);assert.equal(counts.counts.motorcycle,0);
  assert.ok(f.sent.filter(s=>s.at>=10400).every(s=>s.data.command==='admiratv audiencia bici'));
  assert.equal(f.bridge.closed,false);assert.deepEqual(f.errors,[]);f.bridge.stop();
});

test('1.5s absence expires presence, then reconfirms the same already-counted track',()=>{
  const tracker=new PassageTracker(),counts=new PassageCounts();
  counts.add(tracker.update([detection()],0,1000,600,thresholds));
  counts.add(tracker.update([detection('person',120)],200,1000,600,thresholds));
  const id=tracker.visible(200)[0].trackId;
  assert.equal(tracker.visible(200+PRESENCE_GRACE-1)[0].confirmed,true);
  assert.deepEqual(tracker.visible(200+PRESENCE_GRACE),[]);
  assert.equal(tracker.tracks.length,1,'association memory is not visible presence');
  counts.add(tracker.update([detection('person',120)],1800,1000,600,thresholds));
  assert.equal(tracker.visible(1800)[0].trackId,id);assert.equal(tracker.visible(1800)[0].confirmed,false);
  counts.add(tracker.update([detection('person',120)],2000,1000,600,thresholds));
  assert.equal(tracker.visible(2000)[0].confirmed,true);assert.equal(counts.total,1);
});

test('weak frames preserve association but cannot sustain presence or create a fresh track',()=>{
  const tracker=new PassageTracker(),counts=new PassageCounts();
  tracker.update([detection('person',100,.45)],0,1000,600,thresholds);
  assert.deepEqual(tracker.visible(0),[]);
  tracker.update([detection()],100,1000,600,thresholds);
  tracker.update([detection()],300,1000,600,thresholds);
  const id=tracker.visible(300)[0].trackId;
  for(let now=500;now<=22100;now+=200){
    counts.add(tracker.update([detection('person',100,.45)],now,1000,600,thresholds));
    const visible=tracker.visible(now);
    if(now<1800){assert.equal(visible[0].uncertain,true);assert.equal(visible[0].trackId,id);}
    else assert.deepEqual(visible,[]);
  }
  tracker.update([detection()],22300,1000,600,thresholds);
  assert.equal(tracker.visible(22300)[0].trackId,id);assert.equal(tracker.visible(22300)[0].confirmed,false);
  tracker.update([detection()],22500,1000,600,thresholds);
  assert.equal(tracker.visible(22500)[0].confirmed,true);assert.equal(counts.total,0);
});

test('tracker and bridge expire from frame time, not slow inference completion',()=>{
  const tracker=new PassageTracker(),f=bridgeFixture();
  tracker.update([detection()],f.now-200,1000,600,thresholds);
  tracker.update([detection()],f.now,1000,600,thresholds);
  f.tick(PRESENCE_GRACE);
  f.bridge.presence(tracker.visible(f.now));
  assert.equal(f.sent.length,1,'late results must not send an audience');
  assert.deepEqual(tracker.visible(NaN),[]);assert.deepEqual(tracker.visible(f.now-2000),[]);
  f.bridge.stop();
});

test('presence renews at 1000ms, not frame rate; stationary confirmation never becomes a count',()=>{
  const tracker=new PassageTracker(),counts=new PassageCounts(),f=bridgeFixture();
  tracker.update([detection()],f.now-200,1000,600,thresholds);
  for(let elapsed=0;elapsed<=22000;elapsed+=200){
    if(elapsed)f.tick(200);
    counts.add(tracker.update([detection()],f.now,1000,600,thresholds));
    f.bridge.presence(tracker.visible(f.now));f.ack();
  }
  const updates=f.sent.filter(s=>s.data.command==='admiratv audiencia persona');
  assert.equal(updates.length,23);
  assert.ok(updates.every((s,i)=>i===0||s.at-updates[i-1].at===1000));
  assert.equal(counts.total,0);assert.equal(f.bridge.closed,false);assert.deepEqual(f.errors,[]);
  for(const s of updates){assert.deepEqual(Object.keys(s.data),['source','requestId','command']);assert.equal(s.origin,'*');}
  f.tick(PRESENCE_GRACE-1);assert.equal(f.sent.at(-1).data.command,'admiratv audiencia persona');
  f.tick(1);assert.equal(f.sent.at(-1).data.command,'admiratv audiencia u');f.ack();f.bridge.stop();
});

test('priority falls directly bicycle → motorcycle → car → person as fresher alternatives remain',()=>{
  const f=bridgeFixture();
  f.bridge.presence([observation('person'),observation('car',200),observation('motorcycle',400),observation('bicycle',600)]);f.ack();
  assert.equal(f.sent.at(-1).data.command,'admiratv audiencia bici');
  f.tick(2300);f.bridge.presence([observation('person')]);
  assert.equal(f.sent.at(-1).data.command,'admiratv audiencia bici','vehicle tail still outranks fresh person');
  for(const [delay,expected] of [[600,'moto'],[200,'coche'],[200,'persona'],[500,'u']]){
    f.tick(delay);assert.equal(f.sent.at(-1).data.command,'admiratv audiencia '+expected);f.ack();
  }
  assert.deepEqual(f.sent.slice(1).map(s=>s.data.command),['bici','moto','coche','persona','u'].map(k=>'admiratv audiencia '+k));
  assert.equal(f.bridge.closed,false);f.bridge.stop();
});

test('absence, stale/unconfirmed/invalid labels and no further frames cannot prolong presence',()=>{
  const f=bridgeFixture();
  f.bridge.presence([observation()]);f.ack();
  f.tick(500);f.bridge.presence([observation('person',PRESENCE_GRACE),observation('car',-1),observation('bicycle',NaN),observation('motorcycle',0,{confirmed:false}),observation('scooter'),observation('__proto__')]);
  assert.equal(f.sent.at(-1).data.command,'admiratv audiencia u');f.ack();
  const count=f.sent.length;f.bridge.presence([]);f.tick(PRESENCE_GRACE);assert.equal(f.sent.length,count);
  f.bridge.presence([observation('car',1000)]);f.ack();f.tick(499);assert.equal(f.sent.at(-1).data.command,'admiratv audiencia coche');
  f.tick(1);assert.equal(f.sent.at(-1).data.command,'admiratv audiencia coche');
  f.tick(VEHICLE_EXIT_TAIL-1);assert.equal(f.sent.at(-1).data.command,'admiratv audiencia coche');
  f.tick(1);assert.equal(f.sent.at(-1).data.command,'admiratv audiencia u');f.ack();f.bridge.stop();
});

for(const kind of ['car','motorcycle','bicycle'])test(`${kind} music has a 2s exit tail without keeping visual presence or renewing old evidence`,()=>{
  const tracker=new PassageTracker(),f=bridgeFixture();
  tracker.update([detection(kind)],f.now-200,1000,600,thresholds);
  tracker.update([detection(kind)],f.now,1000,600,thresholds);
  const observed=tracker.visible(f.now);
  assert.ok(observed.every(o=>o.observedAt===f.now),'use the tracker evidence token, not a bridge-generated timestamp');
  f.bridge.presence(observed);f.ack();const commandCount=f.sent.length;
  const deadline=f.now+PRESENCE_GRACE+VEHICLE_EXIT_TAIL;
  for(let i=0;i<7;i++){
    f.tick(200);f.bridge.presence(observed.map(o=>({...o})));f.ack();
    assert.equal(f.bridge.deadline,deadline,'copied old ageMs must not renew its deadline');
  }
  f.tick(100);assert.deepEqual(tracker.visible(f.now),[],'no visual box or inferred presence during the tail');
  assert.equal(f.bridge.presenceSamples.length,0);assert.equal(f.bridge.vehicleTails.size,1);
  const tailCommands=f.sent.length;
  for(let i=0;i<9;i++){
    f.tick(200);f.bridge.presence(observed);assert.equal(f.sent.length,tailCommands,'tail cannot itself renew commands');
  }
  f.tick(199);assert.equal(f.bridge.presenceKind,kind);
  f.tick(1);assert.equal(f.sent.at(-1).data.command,'admiratv audiencia u');f.ack();
  const count=f.sent.length;f.bridge.presence(observed.map(o=>({...o})));f.tick(1000);
  assert.equal(f.sent.length,count,'expired frame cannot reactivate the tail');
  assert.ok(commandCount<=tailCommands);f.bridge.stop();
});

test('unstamped observations require real ageing: replaying the same object never renews its exit tail',()=>{
  const f=bridgeFixture(),sample=observation('car');
  f.bridge.presence([sample]);f.ack();const until=f.bridge.deadline;
  for(let i=0;i<17;i++){f.tick(200);f.bridge.presence([sample]);f.ack();assert.equal(f.bridge.deadline,until);}
  f.tick(100);assert.equal(f.sent.at(-1).data.command,'admiratv audiencia u');f.ack();
  const count=f.sent.length;f.bridge.presence([sample]);assert.equal(f.sent.length,count);f.bridge.stop();
});

test('only newer strong evidence extends a tail; older stamps cannot replace it and higher-priority vehicles interrupt',()=>{
  const f=bridgeFixture();f.bridge.presence([observation('car',0,{observedAt:10})]);f.ack();
  f.tick(1000);f.bridge.presence([observation('car',0,{observedAt:20})]);f.ack();
  const until=f.bridge.deadline;
  f.tick(500);f.bridge.presence([observation('car',0,{observedAt:10})]);assert.equal(f.bridge.deadline,until);
  f.tick(1000);f.bridge.presence([observation('person',0,{observedAt:30})]);
  assert.equal(f.sent.at(-1).data.command,'admiratv audiencia coche');
  f.bridge.presence([observation('bicycle',0,{observedAt:30}),observation('person',0,{observedAt:30})]);f.ack();
  assert.equal(f.sent.at(-1).data.command,'admiratv audiencia bici');
  f.bridge.neutral();f.ack();const count=f.sent.length;assert.equal(f.bridge.vehicleTails.size,0);
  f.tick(5000);assert.equal(f.sent.length,count,'pause removes every queued vehicle immediately');f.bridge.stop();
});

test('stop clears an automatic exit tail and pending timers without allowing later commands',()=>{
  const f=bridgeFixture();f.bridge.presence([observation('bicycle')]);f.ack();
  f.tick(PRESENCE_GRACE);assert.equal(f.bridge.vehicleTails.size,1);
  f.bridge.stop();assert.equal(f.bridge.vehicleTails.size,0);assert.equal(f.timers.size,0);
  const count=f.sent.length;f.tick(10000);f.bridge.presence([observation('car')]);assert.equal(f.sent.length,count);
});

test('same-category pending ACK keeps its request ID and remains bounded by the first watchdog',()=>{
  const f=bridgeFixture();f.bridge.presence([observation()]);const first=f.sent.at(-1).data.requestId;
  for(let i=0;i<12;i++){f.tick(200);f.bridge.presence([observation()]);}
  assert.equal(f.sent.length,2);assert.equal(f.sent.at(-1).data.requestId,first);
  assert.equal(f.bridge.closed,false);f.tick(100);
  assert.equal(f.bridge.closed,true);assert.equal(f.errors.length,1);
  f.ack(first);f.bridge.presence([observation()]);assert.equal(f.sent.length,2);
});

test('delayed valid ACK permits a later renewal without starvation; superseded ACK is inert',()=>{
  const f=bridgeFixture();f.bridge.presence([observation()]);const first=f.sent.at(-1).data.requestId;
  f.tick(1200);f.bridge.presence([observation()]);assert.equal(f.sent.length,2);
  f.ack(first);assert.equal(f.bridge.closed,false);
  f.tick(100);f.bridge.presence([observation()]);const renewal=f.sent.at(-1).data.requestId;
  assert.notEqual(renewal,first);f.ack();
  f.bridge.presence([observation('car')]);const car=f.sent.at(-1).data.requestId;
  f.bridge.presence([observation('bicycle')]);f.ack();f.ack(car,false);
  assert.equal(f.states.at(-1).kind,'bicycle');assert.equal(f.bridge.closed,false);assert.deepEqual(f.errors,[]);
  f.bridge.stop();
});

test('neutral and stop discard stored presence; manual passage keeps its separate six-second TTL',()=>{
  const f=bridgeFixture();f.bridge.presence([observation()]);f.ack();
  f.bridge.neutral();f.ack();const count=f.sent.length;
  f.tick(PRESENCE_GRACE);assert.equal(f.sent.length,count);
  f.bridge.passage([{class:'car'}]);f.ack();f.tick(PRESENCE_GRACE);
  assert.equal(f.sent.at(-1).data.command,'admiratv audiencia coche');
  f.tick(AUDIENCE_TTL-PRESENCE_GRACE);assert.equal(f.sent.at(-1).data.command,'admiratv audiencia u');f.ack();
  f.bridge.presence([observation()]);f.ack();f.bridge.stop();const stopped=f.sent.length;
  f.tick(AUDIENCE_TTL);f.bridge.presence([observation('bicycle')]);assert.equal(f.sent.length,stopped);assert.equal(f.timers.size,0);
});
