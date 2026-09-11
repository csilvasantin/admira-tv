import test from 'node:test';
import assert from 'node:assert/strict';
import {isolatePixels,CutoutJob} from './cutouts.mjs';
const fixture=(category='person')=>{
  const source={width:8,height:8,data:new Uint8ClampedArray(8*8*4).fill(255)};
  const map=new Uint8ClampedArray(4*4*4);
  for(let y=0;y<4;y++)for(let x=0;x<4;x++){const i=(y*4+x)*4;map[i]=x<2?128:0;map[i+3]=255;}
  return {source,segmentation:{width:4,height:4,segmentationMap:map,legend:{[category==='motorcycle'?'motorbike':category]:[128,0,0]}},event:{class:category,bbox:[0,0,8,8]}};
};
test('masks isolate all four categories and remove hidden RGB bytes from the background',()=>{
  for(const category of ['person','car','motorcycle','bicycle']){
    const {source,segmentation,event}=fixture(category),result=isolatePixels(source,segmentation,event);
    assert.equal(result.visible,32);
    assert.deepEqual([...result.data.slice(0,4)],[255,255,255,255]);
    assert.deepEqual([...result.data.slice(4*4,5*4)],[0,0,0,0]);
    assert.equal(source.data[0],255);
  }
});
test('bounding boxes are clipped and missing or tiny masks never fall back to originals',()=>{
  const {source,segmentation,event}=fixture();
  const clipped=isolatePixels(source,segmentation,{...event,bbox:[-4,-4,8,12]});
  assert.equal(clipped.width,4);assert.equal(clipped.height,8);
  assert.equal(isolatePixels(source,{...segmentation,legend:{}},event),null);
  assert.equal(isolatePixels(source,segmentation,{...event,bbox:[0,0,2,2]}),null);
  assert.equal(isolatePixels(source,segmentation,{...event,bbox:[100,0,8,8]}),null);
  assert.equal(isolatePixels(source,segmentation,{...event,class:'dog'}),null);
});
test('cutout expiry and cancellation suppress late results and clear source bytes',async()=>{
  for(const mode of ['expired','cleared']){
    const {source,segmentation,event}=fixture();let now=0,finish,called=false;
    const job=new CutoutJob({now:()=>now});
    const pending=job.run({source,events:[event],segment:()=>new Promise(resolve=>{finish=resolve;}),expiresAt:6000,onResult:()=>{called=true;}});
    if(mode==='cleared'){job.clear();assert.ok(source.data.every(v=>v===0));}else now=6000;
    finish(segmentation);assert.equal(await pending,false);
    assert.equal(called,false);assert.ok(source.data.every(v=>v===0));assert.equal(job.busy,false);
  }
});
test('old failures are ignored while current failures are surfaced',async()=>{
  const job=new CutoutJob({now:()=>0});let fail;
  const first=fixture();
  const pending=job.run({...first,events:[first.event],segment:()=>new Promise((_,reject)=>{fail=reject;}),expiresAt:6000,onResult:()=>assert.fail()});
  job.clear();fail(new Error('Old inference'));assert.equal(await pending,false);
  const second=fixture();
  await assert.rejects(job.run({...second,events:[second.event],segment:async()=>{throw new Error('Current inference');},expiresAt:6000,onResult:()=>assert.fail()}),/Current inference/);
  assert.ok(second.source.data.every(v=>v===0));
});
test('one job at a time and at most four cutouts keep temporary memory bounded',async()=>{
  const job=new CutoutJob({now:()=>0}),a=fixture();let finish,result;
  const pending=job.run({...a,events:Array(8).fill(a.event),segment:()=>new Promise(resolve=>{finish=resolve;}),expiresAt:6000,onResult:r=>{result=r;}});
  const b=fixture();assert.equal(await job.run({...b,events:[b.event],segment:()=>assert.fail(),expiresAt:6000,onResult:()=>assert.fail()}),false);
  assert.ok(b.source.data.every(v=>v===0));finish(a.segmentation);await pending;
  assert.equal(result.length,4);assert.ok(a.source.data.every(v=>v===0));
});
