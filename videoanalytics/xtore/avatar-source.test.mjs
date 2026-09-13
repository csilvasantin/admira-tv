import test from 'node:test';
import assert from 'node:assert/strict';
import {readAvatarPhoto} from './avatar-source.mjs';
import {installTwinUI} from './twin-ui.mjs';
const source=()=>({width:4,height:4,data:new Uint8ClampedArray(64).fill(72)});
test('photo import bounds dimensions and closes the decoder and temporary canvas',async()=>{
  let closed=false,draw;
  const surface={getContext:()=>({drawImage:(_,x,y,w,h)=>{draw={w,h};},getImageData:()=>source()})};
  await readAvatarPhoto({type:'image/jpeg',size:4000},{decode:async()=>({width:4000,height:3000,close:()=>{closed=true;}}),canvas:()=>surface});
  assert.deepEqual(draw,{w:1024,h:768});assert.equal(closed,true);assert.equal(surface.width,1);assert.equal(surface.height,1);
});
test('unsupported and oversized photos never reach decoding; decoded size limits release the bitmap',async()=>{
  let calls=0,closed=false;
  const decode=async()=>{calls++;return {width:6000,height:5000,close:()=>{closed=true;}};};
  for(const file of [{type:'image/svg+xml',size:50},{type:'image/png',size:0},{type:'image/png',size:8*1024*1024+1}])await assert.rejects(readAvatarPhoto(file,{decode}));
  assert.equal(calls,0);await assert.rejects(readAvatarPhoto({type:'image/png',size:100},{decode}));
  assert.equal(calls,1);assert.equal(closed,true);
});
function fixture(t,readPhoto){
  t.mock.timers.enable({apis:['setTimeout']});
  const previous=globalThis.ImageData;globalThis.ImageData=class{constructor(data,width,height){Object.assign(this,{data,width,height});}};
  t.after(()=>{if(previous===undefined)delete globalThis.ImageData;else globalThis.ImageData=previous;});
  const nodes=new Map();
  const get=id=>{if(!nodes.has(id))nodes.set(id,{value:'',checked:false,listeners:{},
    addEventListener(name,fn){this.listeners[name]=fn;},removeAttribute(name){delete this[name];},
    querySelectorAll(){return [];},getContext(){return {putImageData(){}};}});return nodes.get(id);};
  let generated=0,published=0;
  const ui=installTwinUI({document:{getElementById:get},readPhoto,
    generate:async()=>{generated++;return {mime:'image/png',bytes:new Uint8Array([137,80,78,71,8,9])};},
    publish:async()=>{published++;throw new Error('never publish in this test');}});
  t.after(()=>ui.clear());
  get('twin-style').value='8bit';
  const upload=()=>{get('twin-photo').files=[{type:'image/png',size:100}];return get('twin-photo').listeners.change();};
  return {get,ui,upload,calls:()=>({generated,published})};
}
test('selecting a photo is local; generated avatar downloads without publishing its original',async t=>{
  const original=source(),f=fixture(t,async()=>original);
  await f.upload();assert.equal(f.ui.session.phase,'selected');assert.equal(f.get('twin-generate').disabled,true);
  assert.deepEqual(f.calls(),{generated:0,published:0});assert.equal(f.get('twin-download').hidden,true);
  f.get('twin-consent').checked=true;f.get('twin-consent').listeners.change();
  await f.get('twin-generate').listeners.click();
  assert.equal(f.ui.session.phase,'review');assert.ok(original.data.every(v=>v===0));
  const link=f.get('twin-download');assert.equal(link.hidden,false);assert.equal(link.download,'xtore-avatar-8bit.png');
  const bytes=new Uint8Array(await (await fetch(link.href)).arrayBuffer());assert.deepEqual([...bytes],[137,80,78,71,8,9]);
  assert.deepEqual(f.calls(),{generated:1,published:0});
  f.ui.clear();assert.equal(link.hidden,true);assert.equal(link.href,undefined);
});
test('a cancelled or superseded decode cannot restore an original after pause or a new selection',async t=>{
  let resolve;
  const f=fixture(t,()=>new Promise(r=>{resolve=r;}));
  const pending=f.upload(),late=source();f.ui.cancelOriginal();resolve(late);await pending;
  assert.equal(f.ui.session.phase,'empty');assert.ok(late.data.every(v=>v===0));
  const second=f.upload(),other=source();
  f.ui.select({width:4,height:4,getContext:()=>({getImageData:()=>other})},'bicycle');
  const obsolete=source();resolve(obsolete);await second;
  assert.ok(obsolete.data.every(v=>v===0));assert.equal(f.ui.session.source,other);assert.equal(f.ui.session.category,'bicycle');
});
