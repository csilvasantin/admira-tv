import test from 'node:test';
import assert from 'node:assert/strict';
import {PassageTracker, PassageCounts, quadMatrix, validQuad, validRect, CLASSES, SNAPSHOT_TTL} from './core.mjs';
const p=(x=10,category='person',score=.9)=>({class:category,score,bbox:[x,10,30,60]});

test('rectangles stay within the selected surface',()=>{
  assert.ok(validRect([.7,.02,.28,.3]));
  for(const r of [[0,0,0,0],[.9,0,.3,.2],[-.1,0,.2,.2],[0,0,NaN,.2],[]])assert.equal(validRect(r),false);
});
test('quadrilateral validates clockwise order and rejects crossings',()=>{
  assert.ok(validQuad([[.7,.4],[.9,.42],[.88,.7],[.68,.65]]));
  assert.equal(validQuad([[0,0],[1,1],[1,0],[0,1]]),false);
  assert.equal(validQuad([[0,0],[0,0],[1,1],[0,1]]),false);
  assert.equal(validQuad([[0,0],[1,0],[1,1],[0,2]]),false);
});
test('CanalKiosk homography maps all four corners without distortion errors',()=>{
  const corners=[[140,30],[310,40],[285,260],[120,235]];
  const m=quadMatrix(640,480,corners);
  for(const [i,[x,y]] of [[0,0],[640,0],[640,480],[0,480]].entries()){
    const d=m[3]*x+m[7]*y+m[15];
    assert.ok(Math.abs((m[0]*x+m[4]*y+m[12])/d-corners[i][0])<1e-8);
    assert.ok(Math.abs((m[1]*x+m[5]*y+m[13])/d-corners[i][1])<1e-8);
  }
});
test('static objects and single-frame noise do not create events',()=>{
  const t=new PassageTracker();
  assert.deepEqual(t.update([p()],0,200,100),[]);
  assert.deepEqual(t.update([p()],200,200,100),[]);
  assert.deepEqual(t.update([p(11)],400,200,100),[]);
});
test('a moving object yields one capture per short-lived track',()=>{
  const t=new PassageTracker();t.update([p()],0,200,100);
  assert.equal(t.update([p(15)],250,200,100).length,1);
  assert.equal(t.update([p(20)],500,200,100).length,0);
  t.update([],2200,200,100);t.update([p()],2400,200,100);
  assert.equal(t.update([p(15)],2700,200,100).length,0);
  t.update([],11000,200,100);t.update([p()],11200,200,100);
  assert.equal(t.update([p(15)],11500,200,100).length,1);
});
test('low confidence, malformed predictions and unrelated COCO labels are ignored',()=>{
  const t=new PassageTracker();
  const invalid=[p(10,'dog'),p(10,'person',.2),{...p(),bbox:[NaN,1,2,3]}, {...p(),bbox:[1,1,-1,4]}];
  assert.deepEqual(t.update(invalid,0,200,100),[]);
  assert.equal(t.tracks.length,0);
});
test('two nearby tracks are matched only once per frame',()=>{
  const t=new PassageTracker();t.update([p(10),p(60)],0,200,100);
  const results=t.update([p(15),p(65)],300,200,100);
  assert.equal(results.length,2);assert.equal(new Set(results.map(p=>p.trackId)).size,2);
});
test('rider vehicle takes precedence over person and colors match MCP',()=>{
  const t=new PassageTracker();t.update([p(10,'person'),p(10,'bicycle')],0,200,100);
  assert.equal(t.update([p(15,'person'),p(15,'bicycle')],200,200,100)[0].class,'bicycle');
  assert.equal(CLASSES.bicycle.color,'#F59E0B');assert.equal(CLASSES.car.color,'#8B5E3C');
  assert.equal(SNAPSHOT_TTL,6000);
});
test('reset discards identities and a long gap is not consecutive evidence',()=>{
  const t=new PassageTracker();t.update([p()],0,200,100);
  assert.deepEqual(t.update([p(15)],3100,200,100),[]);
  t.reset();assert.equal(t.tracks.length,0);
});
test('category counts accumulate all confirmed objects, not just the capture border',()=>{
  const counts=new PassageCounts();
  counts.add([p(),p(50),p(10,'car'),p(10,'motorcycle'),p(10,'bicycle')]);
  counts.add([p(10,'car'),p(10,'dog'),null,{class:'__proto__'}]);
  assert.deepEqual(counts.counts,{person:2,car:2,motorcycle:1,bicycle:1,scooter:0});
  assert.equal(counts.total,6);
  counts.reset();
  assert.deepEqual(counts.counts,{person:0,car:0,motorcycle:0,bicycle:0,scooter:0});
  assert.equal(counts.total,0);
});
test('repeated frames do not increase totals; new confirmed passages do',()=>{
  const tracker=new PassageTracker(),counts=new PassageCounts();
  for(const [time,x] of [[0,10],[200,15],[400,20],[600,25]]){
    counts.add(tracker.update([p(x),p(x,'car')],time,200,100));
  }
  assert.deepEqual(counts.counts,{person:1,car:1,motorcycle:0,bicycle:0,scooter:0});
  tracker.update([],2200,200,100);
  counts.add(tracker.update([p(10)],2400,200,100));
  counts.add(tracker.update([p(15)],2600,200,100));
  assert.equal(counts.counts.person,1);assert.equal(counts.total,2);
  tracker.update([],11000,200,100);
  counts.add(tracker.update([p(10)],11200,200,100));counts.add(tracker.update([p(15)],11400,200,100));
  assert.equal(counts.counts.person,2);assert.equal(counts.total,3);
});
test('a low-confidence fast bicycle requires three moving observations and counts once',()=>{
  const tracker=new PassageTracker(),thresholds={person:.65,car:.65,motorcycle:.65,bicycle:.4};
  for(const [i,x] of [0,140,280,420].entries()){
    const events=tracker.update([p(x,'bicycle',.45),p(x,'person',.45)],i*200,1000,500,thresholds);
    assert.equal(events.length,i===2?1:0);
    if(events.length)assert.equal(events[0].class,'bicycle');
  }
  assert.equal(tracker.tracks.length,1);
});
test('parked low-confidence bikes, a long observation gap and >100% scores do not count',()=>{
  const t=new PassageTracker(),threshold={bicycle:.4};
  for(const [i,x] of [10,11,12,11,10].entries())assert.deepEqual(t.update([p(x,'bicycle',.45)],i*200,1000,500,threshold),[]);
  t.reset();t.update([p(10,'bicycle',.45)],0,1000,500,threshold);
  assert.deepEqual(t.update([p(50,'bicycle',.45)],3100,1000,500,threshold),[]);
  assert.deepEqual(t.update([p(50,'bicycle',.45)],3300,1000,500,threshold),[]);
  t.reset();assert.deepEqual(t.update([p(20,'bicycle',1.5)],0,1000,500,threshold),[]);assert.equal(t.tracks.length,0);
});

test('weak matches bridge confidence flicker but never create or confirm tracks',()=>{
  const t=new PassageTracker();t.update([p(10)],0,200,100);
  assert.equal(t.update([p(15)],200,200,100).length,1);
  for(let i=1;i<=12;i++)assert.deepEqual(t.update([p(15+i,'person',.42)],200+i*700,200,100),[]);
  assert.deepEqual(t.update([p(30)],9000,200,100),[]);assert.equal(t.tracks.length,1);
  const noise=new PassageTracker();for(let i=0;i<8;i++)noise.update([p(10+i*4,'person',.42)],i*200,200,100);
  assert.equal(noise.tracks.length,0);
});
test('a slow inference cadence can confirm movement without forgetting every frame',()=>{
  const t=new PassageTracker();t.update([p(10)],0,200,100);
  assert.equal(t.update([p(20)],1800,200,100).length,1);
  assert.deepEqual(t.update([p(30)],3600,200,100),[]);
});
test('duplicate proposals do not create duplicate people',()=>{
  const t=new PassageTracker();t.update([p(10),p(11)],0,200,100);
  assert.equal(t.update([p(16),p(17)],200,200,100).length,1);assert.equal(t.tracks.length,1);
});
test('two people crossing with a brief occlusion keep two tracks, not a new person each frame',()=>{
  const t=new PassageTracker(),seen=[];
  for(let i=0;i<12;i++){
    const a={...p(100+i*35),bbox:[100+i*35,50,30,80]},b={...p(600-i*35),bbox:[600-i*35,60,30,80]};
    seen.push(...t.update(i===7?[a]:[b,a],i*200,1000,500));
  }
  assert.equal(seen.length,2);assert.equal(t.tracks.length,2);
});
test('a walking group preserves maximum valid matches instead of stealing a neighbour track',()=>{
  const tracker=new PassageTracker(),events=[];
  for(let i=0;i<8;i++)events.push(...tracker.update([280+60*i,380+60*i].map(x=>({class:'person',score:.9,bbox:[x,50,40,100]})),i*200,1000,500));
  assert.equal(events.length,2);assert.equal(tracker.tracks.length,2);
});
test('resetting counters retains tracking so a present person cannot increment again',()=>{
  const t=new PassageTracker(),counts=new PassageCounts();t.update([p(10)],0,200,100);
  counts.add(t.update([p(15)],200,200,100));assert.equal(counts.total,1);
  counts.reset();counts.add(t.update([p(20)],400,200,100));assert.equal(counts.total,0);
});
test('a new person after an observed exit counts; scooters are never fabricated by COCO',()=>{
  const t=new PassageTracker();t.update([p(860)],0,1000,500);assert.equal(t.update([p(945)],200,1000,500).length,1);
  t.update([],1500,1000,500);t.update([p(860)],1600,1000,500);
  assert.equal(t.update([p(945)],1800,1000,500).length,1);
  assert.deepEqual(t.update([p(10,'scooter')],2000,1000,500),[]);
  const counts=new PassageCounts();counts.add([{class:'scooter'}]);assert.equal(counts.counts.scooter,1);
});
