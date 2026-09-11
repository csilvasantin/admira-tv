import test from 'node:test';
import assert from 'node:assert/strict';
import {PassageTracker, quadMatrix, validQuad, validRect, CLASSES, SNAPSHOT_TTL} from './core.mjs';
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
  assert.equal(t.update([p(15)],2700,200,100).length,1);
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
  assert.deepEqual(t.update([p(15)],1100,200,100),[]);
  t.reset();assert.equal(t.tracks.length,0);
});
