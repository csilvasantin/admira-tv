import test from 'node:test';
import assert from 'node:assert/strict';
import {TemporalStreetBackground,hideShortcut} from './clean-street.mjs';
const frame=(color=80)=>({width:20,height:20,data:new Uint8ClampedArray(Array.from({length:1600},(_,i)=>i%4===3?255:color))});
const person={class:'person',bbox:[.3,.3,.3,.4]},car={...person,class:'car'};
const pixel=(f,x=8,y=8)=>[...f.data.slice((y*20+x)*4,(y*20+x)*4+4)];
function paint(f,color=220){for(let y=6;y<14;y++)for(let x=6;x<12;x++)f.data.set([color,10,10,255],(y*20+x)*4);return f;}
function train(b){for(let t=0;t<4;t++)b.update(frame(),[],t*125);}
test('H removes a detected person using learned street, leaves original untouched and preserves outside pixels',()=>{
  const b=new TemporalStreetBackground();train(b);const raw=paint(frame()),copy=new Uint8ClampedArray(raw.data);
  const r=b.update(raw,[person],500);assert.deepEqual(pixel(r),[80,80,80,255]);assert.equal(r.unknown,0);
  assert.deepEqual(pixel(r,1,1),pixel(raw,1,1));assert.deepEqual(raw.data,copy);
});
test('unobserved area is opaque and marked; a person present at startup is never learned',()=>{
  const b=new TemporalStreetBackground();let r;for(let t=0;t<8;t++)r=b.update(paint(frame()),[person],t*125);
  assert.ok(r.unknown>0);assert.equal(pixel(r)[3],255);assert.notDeepEqual(pixel(r),[220,10,10,255]);
  for(let t=8;t<12;t++)b.update(frame(),[],t*125);
  r=b.update(paint(frame()),[person],1500);assert.equal(r.unknown,0);assert.deepEqual(pixel(r),[80,80,80,255]);
});
test('vehicles are visible but excluded from clean background learning',()=>{
  const b=new TemporalStreetBackground();let r;for(let t=0;t<6;t++)r=b.update(paint(frame()),[car],t*125);
  assert.deepEqual(pixel(r),[220,10,10,255]);r=b.update(paint(frame()),[person],800);assert.ok(r.unknown>0);
});
test('background ages out after20s even under continuous detections; replay cannot teach',()=>{
  const b=new TemporalStreetBackground();train(b);assert.equal(b.update(frame(),[],375),null);
  let r;for(let t=500;t<=21000;t+=500)r=b.update(paint(frame()),[person],t);
  assert.ok(r.unknown>0);
});
test('large scene changes and stale source gaps invalidate learned street',()=>{
  const b=new TemporalStreetBackground();train(b);let r=b.update(paint(frame(160)),[person],500);
  assert.equal(r.sceneChanged,true);assert.ok(r.unknown>0);
  const fresh=new TemporalStreetBackground();train(fresh);
  assert.ok(fresh.update(paint(frame()),[person],2500).unknown>0);
});
test('reset zeroes memory and next person region is unknown; storage stays bounded',()=>{
  const b=new TemporalStreetBackground();train(b);const bytes=b.background;b.reset();assert.ok(bytes.every(v=>v===0));
  assert.ok(b.update(paint(frame()),[person],900).unknown>0);
  assert.throws(()=>b.update({width:1000,height:1000,data:[]},[],1000),/Invalid/);
});
test('H keyboard ignores editable fields, modifiers, repeats and composition',()=>{
  assert.equal(hideShortcut({key:'H'}),true);assert.equal(hideShortcut({key:'h'}),true);
  for(const flag of ['repeat','isComposing','ctrlKey','metaKey','altKey'])assert.equal(hideShortcut({key:'h',[flag]:true}),false);
  assert.equal(hideShortcut({key:'h',target:{closest:()=>({})}}),false);assert.equal(hideShortcut({key:'z'}),false);
});
