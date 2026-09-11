// In-process fixtures only. These do not select a real browser capture source,
// bypass browser permissions, or inject synthetic detections into the UI preview.
import test from 'node:test';
import assert from 'node:assert/strict';
let serial=0;
async function fixture({surface='browser',denied=false,slowLoad=false}={}){
  const nodes=new Map();
  class Element {
    constructor(id=''){this.listeners={};this.style={};this.classList={add(){},remove(){},toggle(){}};this.hidden=false;this.disabled=false;this.value='';this.textContent='';this.children=[];this.clientWidth=960;this.clientHeight=540;this.videoWidth=1280;this.videoHeight=720;this.readyState=2;this.currentTime=1;this.width=640;this.height=480;this.id=id;}
    set id(id){this._id=id;if(id)nodes.set(id,this);}get id(){return this._id;}
    addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
    async emit(type,event={}){for(const fn of this.listeners[type]||[])await fn(event);}
    append(child){this.children.push(child);}replaceChildren(...children){this.children=children;}
    getContext(){return {fillRect(){},clearRect(){},strokeRect(){},fillText(){},drawImage(){},measureText(){return {width:100};}};}
    removeAttribute(){}load(){}async play(){}remove(){}
  }
  const get=id=>nodes.get(id)||new Element(id);
  const doc=new Element();doc.hidden=false;doc.getElementById=get;doc.createElement=()=>new Element();doc.head=new Element();
  const win=new Element();win.tf={ready:async()=>{},getBackend:()=> 'fixture'};
  let finishLoad,finishDetection;
  const detections=[];
  const detector={detect:()=>new Promise((resolve,reject)=>{finishDetection=resolve;detections.push({resolve,reject});}),dispose(){}};
  win.cocoSsd={load:()=>slowLoad?new Promise(resolve=>{finishLoad=()=>resolve(detector);}):Promise.resolve(detector)};
  const track=new Element();track.stopped=false;track.stop=()=>{track.stopped=true;};track.getSettings=()=>({displaySurface:surface});
  const stream={getTracks:()=>[track],getVideoTracks:()=>[track]};
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getDisplayMedia:async()=>{if(denied)throw Object.assign(new Error(),{name:'NotAllowedError'});return stream;}}}});
  globalThis.document=doc;globalThis.window=win;globalThis.ResizeObserver=class{observe(){}};
  get('confidence').value='65';
  await import(`./xtore.mjs?fixture=${++serial}`);
  const calibrate=async()=>{await get('edit-coordinates').emit('click');await get('apply-coordinates').emit('click');};
  return {get,doc,track,calibrate,detections,finishLoad:()=>finishLoad(),finishDetection:()=>finishDetection?.([])};
}

test('permission denial stays disconnected and is explained',async()=>{
  const f=await fixture({denied:true});await f.get('connect').emit('click');
  assert.equal(f.get('connection').textContent,'Sin conexión');
  assert.match(f.get('status').textContent,/No se ha concedido permiso/);
  assert.equal(f.get('analyze').disabled,true);
});
test('a monitor/window selection is stopped, not analyzed',async()=>{
  const f=await fixture({surface:'window'});await f.get('connect').emit('click');
  assert.equal(f.track.stopped,true);assert.equal(f.get('stop').disabled,true);
  assert.match(f.get('status').textContent,/no una ventana/);
});
test('analysis requires two calibrated surfaces and stopping clears the source',async()=>{
  const f=await fixture();await f.get('connect').emit('click');
  assert.equal(f.get('analyze').disabled,true);
  await f.calibrate();assert.equal(f.get('analyze').disabled,false);
  await f.get('stop').emit('click');
  assert.equal(f.track.stopped,true);assert.equal(f.get('scene').srcObject,null);
  assert.equal(f.get('tablet').hidden,true);assert.equal(f.get('capture-canvas').hidden,true);
});
test('late model load after disconnect never resumes analysis',async()=>{
  const f=await fixture({slowLoad:true});await f.get('connect').emit('click');await f.calibrate();
  const starting=f.get('analyze').emit('click');
  await Promise.resolve();await f.get('stop').emit('click');f.finishLoad();await starting;
  assert.equal(f.get('connection').textContent,'Sin conexión');assert.equal(f.get('scene').srcObject,null);
  assert.equal(f.get('connect').disabled,false);
});
test('hidden view pauses and ignores an in-flight inference',async()=>{
  const f=await fixture();await f.get('connect').emit('click');await f.calibrate();await f.get('analyze').emit('click');
  assert.equal(f.get('connection').textContent,'Analizando');
  f.doc.hidden=true;await f.doc.emit('visibilitychange');f.finishDetection();await Promise.resolve();
  assert.equal(f.get('connection').textContent,'Pestaña conectada');
  assert.equal(f.get('capture-canvas').hidden,true);assert.equal(f.get('event-counter').textContent,'0 pasos');
  await f.get('stop').emit('click');
});
test('changing source resolution invalidates calibration',async()=>{
  const f=await fixture();await f.get('connect').emit('click');await f.calibrate();
  f.get('scene').videoWidth=1440;await f.get('scene').emit('resize');
  assert.equal(f.get('analyze').disabled,true);assert.equal(f.get('tablet').hidden,true);
  await f.get('stop').emit('click');
});
test('an obsolete inference error cannot stop a newly resumed analysis',async()=>{
  const f=await fixture();await f.get('connect').emit('click');await f.calibrate();
  await f.get('analyze').emit('click');
  const oldInference=f.detections[0];
  await f.get('analyze').emit('click');
  await f.get('analyze').emit('click');
  assert.equal(f.detections.length,2);
  oldInference.reject(new Error('Late failure from the previous generation'));
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.get('connection').textContent,'Analizando');
  await f.get('stop').emit('click');f.finishDetection();
});
test('category totals survive expiry, pause and disconnect, then reset on a new connection',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const f=await fixture();
  assert.equal(f.get('count-person').textContent,'0');
  await f.get('connect').emit('click');await f.calibrate();await f.get('analyze').emit('click');
  const predictions=x=>['person','car','motorcycle','bicycle'].map(category=>({class:category,score:.9,bbox:[x,10,30,60]}));
  f.detections[0].resolve(predictions(10));await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.get('event-counter').textContent,'0 pasos');
  f.get('scene').currentTime++;t.mock.timers.tick(200);
  f.detections[1].resolve(predictions(20));await new Promise(resolve=>setImmediate(resolve));
  for(const category of ['person','car','motorcycle','bicycle'])assert.equal(f.get(`count-${category}`).textContent,'1');
  assert.equal(f.get('event-counter').textContent,'4 pasos');
  assert.equal(f.get('capture-canvas').hidden,false);
  f.get('scene').currentTime++;t.mock.timers.tick(200);
  f.detections[2].resolve(predictions(25));await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.get('event-counter').textContent,'4 pasos');
  t.mock.timers.tick(6000);
  assert.equal(f.get('capture-canvas').hidden,true);
  assert.equal(f.get('count-person').textContent,'1');
  assert.equal(f.get('event-counter').textContent,'4 pasos');
  await f.get('analyze').emit('click');
  assert.equal(f.get('connection').textContent,'Pestaña conectada');
  assert.equal(f.get('event-counter').textContent,'4 pasos');
  await f.get('stop').emit('click');
  assert.equal(f.get('event-counter').textContent,'4 pasos');
  await f.get('connect').emit('click');
  assert.equal(f.get('event-counter').textContent,'0 pasos');
  for(const category of ['person','car','motorcycle','bicycle'])assert.equal(f.get(`count-${category}`).textContent,'0');
  await f.get('stop').emit('click');
});
