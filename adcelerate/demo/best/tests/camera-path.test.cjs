const {test} = require('node:test');
const assert = require('node:assert/strict');
require('../camera-path.js');
const {create:createController, atCamera, anchorAltitude, waitForPanorama} = globalThis.KioskCameraPath;
const create = (map, options = {}) => createController(map, {requestFrame:cb=>{queueMicrotask(cb);return 0;},cancelFrame:()=>{},...options});
const flush = async()=>{for(let i=0;i<10;i++)await Promise.resolve();};
const shot = {name:'plaza',durationMillis:100,camera:{center:{lat:41.4002641,lng:2.1573332,altitude:20},altitudeMode:'RELATIVE_TO_GROUND',range:220,tilt:45,heading:238.13}};
const close = {...shot,name:'quiosco',camera:{...shot.camera,range:18,tilt:78}};
class FakeMap {
  constructor(){this.listeners=new Map();this.calls=[];this.center={lat:41,lng:2,altitude:120};this.range=2200;this.tilt=47;this.heading=25;}
  addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(fn);}
  removeEventListener(type,fn){this.listeners.get(type)?.delete(fn);}
  emit(type,data={}){for(const fn of [...this.listeners.get(type)||[]])fn(data);}
  stopCameraAnimation(){return undefined;}
  flyCameraTo(options){this.calls.push(options);}
  flyCameraAround(options){this.calls.push({...options,endCamera:options.camera,orbit:true});}
  land(){const c=this.calls.at(-1).endCamera;this.center={...c.center,altitude:c.center.altitude+58};this.range=c.range;this.heading=c.heading;this.tilt=c.tilt;this.emit('gmp-animationend');}
  steady(value=true){this.emit('gmp-steadychange',{isSteady:value});}
  listenerCount(){return [...this.listeners.values()].reduce((sum,s)=>sum+s.size,0);}
}
test('arrival requires animation end and fresh steady TRUE at the destination',async()=>{
  const map=new FakeMap(),path=create(map);let done=false;
  const flight=path.run([shot,close]).then(s=>{done=true;return s;});await flush();
  map.steady(true);map.land();map.steady(false);await flush();assert.equal(map.calls.length,1);assert.equal(done,false);
  map.steady(true);await flush();assert.equal(map.calls.length,2);
  map.land();map.steady(true);assert.equal(await flight,'ready');assert.equal(path.isRunning(),false);path.dispose();assert.equal(map.listenerCount(),0);
});
test('stopping while loading removes callbacks and prevents later stages',async()=>{
  const map=new FakeMap(),path=create(map);const phases=[];
  const flight=path.run([shot,close],p=>phases.push(p.phase));await flush();map.land();
  path.cancel();const count=phases.length;map.steady(true);map.emit('gmp-animationend');
  assert.equal(await flight,'cancelled');assert.equal(phases.length,count);assert.equal(map.calls.length,1);path.dispose();assert.equal(map.listenerCount(),0);
});
test('superseding an arrival cannot revive its old continuation',async()=>{
  const map=new FakeMap(),path=create(map);const first=path.run([shot,close]);await flush();
  const second=path.run([close]);await flush();map.land();map.steady(true);
  assert.equal(await first,'cancelled');assert.equal(await second,'ready');assert.equal(map.calls.length,2);path.dispose();
});
test('cancel between event and promise continuation emits no late ready callback',async()=>{
  const map=new FakeMap(),path=create(map);const phases=[];
  const flight=path.run([shot],p=>phases.push(p.phase));await flush();map.land();map.steady(true);path.cancel();
  assert.equal(await flight,'cancelled');assert.equal(phases.includes('ready'),false);path.dispose();
});
test('known loaded no-op camera does not wait for a nonexistent steady change',async()=>{
  const map=new FakeMap(),path=create(map);const first=path.run([shot]);await flush();map.land();map.steady(true);assert.equal(await first,'ready');
  assert.equal(await path.run([shot]),'ready');assert.equal(map.calls.length,1);path.dispose();
});
test('timeout pauses instead of pretending arrival or starting Street View',async(t)=>{
  t.mock.timers.enable({apis:['setTimeout']});const map=new FakeMap(),path=create(map,{loadTimeout:20});
  const flight=path.run([shot,close]);await flush();map.land();map.steady(false);t.mock.timers.tick(121);
  assert.equal(await flight,'timeout');assert.equal(map.calls.length,1);path.dispose();assert.equal(map.listenerCount(),0);
});
test('map error fails the path and releases listeners',async()=>{
  const map=new FakeMap(),path=create(map);const flight=path.run([shot,close]);await flush();map.emit('gmp-error');
  assert.equal(await flight,'error');assert.equal(map.calls.length,1);path.dispose();assert.equal(map.listenerCount(),0);
});
test('waits for async native stop before attaching the new flight',async()=>{
  const map=new FakeMap();let release;map.stopCameraAnimation=()=>new Promise(r=>release=r);
  const path=create(map);const flight=path.run([shot]);await flush();assert.equal(map.calls.length,0);release();await flush();assert.equal(map.calls.length,1);
  map.land();map.steady(true);assert.equal(await flight,'ready');map.stopCameraAnimation=()=>{};path.dispose();
});
test('old animationend at orbit start cannot finish a new orbit',async()=>{
  const map=new FakeMap();Object.assign(map,{center:shot.camera.center,range:shot.camera.range,heading:shot.camera.heading,tilt:shot.camera.tilt});
  const path=create(map);let done=false;const flight=path.run([{...shot,orbit:true}]).then(s=>{done=true;return s;});await flush();
  map.emit('gmp-animationend');map.steady(true);await flush();assert.equal(done,false);
  map.heading+=30;map.emit('gmp-headingchange');map.land();map.steady(true);assert.equal(await flight,'ready');path.dispose();
});
class Panorama {
  constructor(){this.pano='rear';this.status='OK';this.listeners=new Set();}
  addListener(type,fn){this.listeners.add(fn);return{remove:()=>this.listeners.delete(fn)};}
  getPano(){return this.pano;}
  getStatus(){return this.status;}
  statusChanged(){for(const f of [...this.listeners])f();}
}
test('switching panorama needs fresh lookup event even if getStatus keeps old OK',async()=>{
  const p=new Panorama(),controller=new AbortController();let done=false;
  const waiting=waitForPanorama(p,'front',controller.signal,10000,()=>{p.pano='front';}).then(s=>{done=true;return s;});
  await flush();assert.equal(done,false);p.statusChanged();assert.equal(await waiting,'ready');assert.equal(p.listeners.size,0);
});
test('panorama availability failure and cancellation never reveal the requested view',async()=>{
  const p=new Panorama(),controller=new AbortController();
  const waiting=waitForPanorama(p,'front',controller.signal,10000,()=>{p.pano='front';});controller.abort();assert.equal(await waiting,'cancelled');assert.equal(p.listeners.size,0);
  const fail=waitForPanorama(p,'missing',new AbortController().signal,10000,()=>{p.pano='missing';});p.status='ZERO_RESULTS';p.statusChanged();assert.equal(await fail,'error');assert.equal(p.listeners.size,0);
});
test('the same already available panorama may be reused without another lookup',async()=>{
  const p=new Panorama();assert.equal(await waitForPanorama(p,'rear',new AbortController().signal),'ready');assert.equal(p.listeners.size,0);
});

// Captured from the real Google Maps preview after its first relative shot.
const normalized = {center:{lat:41.40021528128905,lng:2.157228519095109,altitude:66.97383101705964},range:234.53992232134624,tilt:45.00009246065933,heading:238.12993077293044};
test('real Google normalized center/range represents the requested eye, not a failed arrival',()=>{
  assert.equal(atCamera(normalized,shot.camera),true);
  assert.ok(Math.abs(anchorAltitude(normalized,shot.camera)-59.7553)<0.01);
  assert.equal(atCamera({...normalized,range:normalized.range+10},shot.camera),false);
  assert.equal(atCamera({...shot.camera,range:250},shot.camera),false);
});
test('normalized camera with earlier steady TRUE finishes after end and paint without a new steadychange',async()=>{
  const map=new FakeMap(),path=create(map);let done=false;
  const flight=path.run([shot]).then(s=>{done=true;return s;});await flush();map.steady(true);
  Object.assign(map,normalized);map.emit('gmp-animationend');assert.equal(done,false);
  assert.equal(await flight,'ready');path.dispose();
});
test('stop between animationend and paint cancels the scheduled readiness check',async()=>{
  const frames=[];const map=new FakeMap(),path=create(map,{requestFrame:cb=>{frames.push(cb);return frames.length;},cancelFrame:()=>{}});
  const flight=path.run([shot,close]);await flush();map.steady(true);map.land();path.cancel();
  for(const frame of frames)frame();assert.equal(await flight,'cancelled');assert.equal(map.calls.length,1);path.dispose();
});
