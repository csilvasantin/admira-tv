// In-process fixtures only. These do not select a real browser capture source,
// bypass browser permissions, or inject synthetic detections into the UI preview.
import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
let serial=0;
const cleanups=[];
afterEach(async()=>{for(const cleanup of cleanups.splice(0))await cleanup();});
async function fixture({surface='browser',denied=false,slowLoad=false,segment,storage,sourceWidth=1280,sourceHeight=720}={}){
  const nodes=new Map();
  class Element {
    constructor(id=''){this.listeners={};this.style={};this.classList={add(){},remove(){},toggle(){}};this.hidden=false;this.disabled=false;this.value='';this.textContent='';this.children=[];this.clientWidth=960;this.clientHeight=540;this.videoWidth=1280;this.videoHeight=720;this.readyState=2;this.currentTime=1;this.width=640;this.height=480;this.id=id;}
    set id(id){this._id=id;if(id)nodes.set(id,this);}get id(){return this._id;}
    addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
    async emit(type,event={}){for(const fn of this.listeners[type]||[])await fn(event);}
    append(...children){this.children.push(...children);for(const child of children)child.parentNode=this;}replaceChildren(...children){this.children=children;}
    querySelectorAll(tag){return this.children.flatMap(child=>[...(child.tagName===tag?[child]:[]),...child.querySelectorAll(tag)]);}
    getContext(){return {fillRect(){},clearRect(){},strokeRect(){},fillText(){},drawImage(){},putImageData:data=>{this.lastImageData=data;},getImageData:(x,y,width,height)=>({width,height,data:new Uint8ClampedArray(width*height*4).fill(127)}),measureText(){return {width:100};}};}
    setAttribute(name,value){this[name]=value;}removeAttribute(name){delete this[name];}load(){}async play(){}remove(){this.removed=true;if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(c=>c!==this);}
  }
  const get=id=>nodes.get(id)||new Element(id);
  const doc=new Element();doc.hidden=false;doc.getElementById=get;doc.createElement=tag=>{const e=Object.assign(new Element(),{tagName:tag});if(tag==='iframe'){e.sent=[];e.contentWindow={postMessage:(data,origin)=>e.sent.push({data,origin})};}return e;};doc.head=new Element();
  const win=new Element();win.tf={ready:async()=>{},getBackend:()=> 'fixture'};
  win.localStorage=storage;
  get('scene').videoWidth=sourceWidth;get('scene').videoHeight=sourceHeight;
  if(segment)win.deeplab={load:async()=>({segment,dispose(){}})};
  let finishLoad,finishDetection;
  const detections=[];
  const detector={detect:()=>new Promise((resolve,reject)=>{finishDetection=resolve;detections.push({resolve,reject});}),dispose(){}};
  win.cocoSsd={load:()=>slowLoad?new Promise(resolve=>{finishLoad=()=>resolve(detector);}):Promise.resolve(detector)};
  const track=new Element();track.stopped=false;track.stop=()=>{track.stopped=true;};track.getSettings=()=>({displaySurface:surface});
  const stream={getTracks:()=>[track],getVideoTracks:()=>[track]};
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getDisplayMedia:async()=>{if(denied)throw Object.assign(new Error(),{name:'NotAllowedError'});return stream;}}}});
  globalThis.document=doc;globalThis.window=win;globalThis.ResizeObserver=class{observe(){}};
  globalThis.ImageData=class{constructor(data,width,height){Object.assign(this,{data,width,height});}};
  get('confidence').value='65';
  await import(`./xtore.mjs?fixture=${++serial}`);
  cleanups.push(async()=>{await get('stop').emit('click');await get('stop-signage').emit('click');});
  const calibrate=async()=>{await get('edit-coordinates').emit('click');await get('apply-coordinates').emit('click');};
  return {get,doc,win,track,calibrate,detections,finishLoad:()=>finishLoad(),finishDetection:()=>finishDetection?.([])};
}

test('permission denial stays disconnected and is explained',async()=>{
  const f=await fixture({denied:true});await f.get('connect').emit('click');
  assert.equal(f.get('connection').textContent,'Cámara sin conectar');
  assert.match(f.get('status').textContent,/No se ha concedido permiso/);
  assert.equal(f.get('analyze').disabled,true);
});

test('last marked camera iPad and DS restore on a new visit only after sharing, never start analysis',async()=>{
  const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
  const a=await fixture({storage});await a.get('connect').emit('click');await a.get('edit-coordinates').emit('click');
  for(const [i,value] of [50,25,75,25,75,85,50,85].entries())a.get(`coord-${12+i}`).value=String(value);
  await a.get('apply-coordinates').emit('click');assert.match(a.get('preset-status').textContent,/guardado automáticamente/);
  await a.get('stop').emit('click');
  const b=await fixture({storage,sourceWidth:1920,sourceHeight:1080});
  assert.equal(b.get('analyze').disabled,true);assert.equal(b.get('scene').srcObject,undefined);
  await b.get('connect').emit('click');
  assert.equal(b.get('analyze').disabled,false);assert.equal(b.get('connection').textContent,'Pestaña conectada');
  assert.match(b.get('calibration-status').textContent,/Preset cargado.*cartelería: marcada/);
  assert.equal(b.get('tablet').hidden,false);assert.match(b.get('signage').style.transform,/matrix3d/);
  await b.get('stop').emit('click');
});
test('wrong format preserves the saved preset without applying it or changing the counters',async()=>{
  const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
  const a=await fixture({storage});await a.get('connect').emit('click');await a.calibrate();await a.get('stop').emit('click');
  const before=[...data.values()][0];const b=await fixture({storage,sourceWidth:1440});await b.get('connect').emit('click');
  assert.equal(b.get('analyze').disabled,true);assert.equal(b.get('tablet').hidden,true);
  assert.match(b.get('preset-status').textContent,/formato.*distinto/);assert.equal([...data.values()][0],before);
  await b.get('stop').emit('click');
});
test('forget preset leaves current framing and counts alone but next connection needs new marks',async()=>{
  const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
  const f=await fixture({storage});await f.get('connect').emit('click');await f.calibrate();await f.get('add-scooter').emit('click');
  await f.get('forget-preset').emit('click');assert.equal(f.get('analyze').disabled,false);assert.equal(f.get('count-scooter').textContent,'1');assert.equal(data.size,0);
  await f.get('stop').emit('click');await f.get('connect').emit('click');assert.equal(f.get('analyze').disabled,true);await f.get('stop').emit('click');
});
test('cancelled coordinates cannot apply after format change or disconnect',async()=>{
  const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
  const f=await fixture({storage});await f.get('connect').emit('click');await f.calibrate();
  const saved=[...data.values()][0];
  await f.get('edit-coordinates').emit('click');f.get('scene').videoWidth=1440;await f.get('scene').emit('resize');
  await f.get('apply-coordinates').emit('click');assert.equal(f.get('analyze').disabled,true);assert.equal([...data.values()][0],saved);
  await f.get('edit-coordinates').emit('click');await f.get('stop').emit('click');await f.get('apply-coordinates').emit('click');
  assert.equal(f.get('analyze').disabled,true);assert.equal([...data.values()][0],saved);
  await f.get('scene').emit('resize');assert.equal(f.get('tablet').hidden,true);assert.equal(f.get('scene').srcObject,null);
});
test('incremental aspect drift is compared to the calibrated source, not the last resize',async()=>{
  const f=await fixture();await f.get('connect').emit('click');await f.calibrate();
  for(let w=1285;w<=1440;w+=5){f.get('scene').videoWidth=w;await f.get('scene').emit('resize');}
  assert.equal(f.get('analyze').disabled,true);assert.equal(f.get('tablet').hidden,true);await f.get('stop').emit('click');
});
test('delayed metadata restores once and proportional resize waits for a fresh frame',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
  const a=await fixture({storage});await a.get('connect').emit('click');await a.calibrate();await a.get('stop').emit('click');
  const f=await fixture({storage,sourceWidth:0,sourceHeight:0});await f.get('connect').emit('click');
  assert.equal(f.get('analyze').disabled,true);f.get('scene').videoWidth=1280;f.get('scene').videoHeight=720;await f.get('scene').emit('resize');
  assert.equal(f.get('analyze').disabled,false);
  await f.get('set-roi').emit('click');await f.get('scene').emit('resize');assert.equal(f.get('analyze').disabled,true);
  await f.calibrate();await f.get('analyze').emit('click');
  f.get('scene').videoWidth=1920;f.get('scene').videoHeight=1080;await f.get('scene').emit('resize');f.finishDetection();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.get('connection').textContent,'Pestaña conectada');assert.equal(f.get('analyze').textContent,'Pausar análisis');
  assert.match(f.get('analysis-health').textContent,/reanudación automática/);
  assert.equal(f.get('tablet').hidden,false);assert.equal(f.get('count-person').textContent,'0');await f.get('stop').emit('click');
});
test('storage quota failure preserves the previous preset and leaves forget available',async()=>{
  let full=false;const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>{if(full)throw new Error('QuotaExceededError');data.set(k,v);},removeItem:k=>data.delete(k)};
  const f=await fixture({storage});await f.get('connect').emit('click');await f.calibrate();const saved=[...data.values()][0];full=true;
  await f.get('edit-coordinates').emit('click');f.get('coord-0').value='65';await f.get('apply-coordinates').emit('click');
  assert.equal([...data.values()][0],saved);assert.match(f.get('preset-status').textContent,/No se pudo guardar/);assert.equal(f.get('forget-preset').disabled,false);
  await f.get('forget-preset').emit('click');assert.equal(data.size,0);await f.get('stop').emit('click');
});
test('music has one player before sharing, through capture calibration and after disconnect',async()=>{
  const f=await fixture(),frame=f.get('signage').children[0];
  assert.ok(frame);assert.equal(f.get('signage').hidden,false);
  assert.equal(f.get('scene').srcObject,undefined);assert.equal(f.get('analyze').disabled,true);
  assert.match(frame.src,/xtoreMusic=1/);assert.match(frame.src,/muted=0/);
  await f.get('connect').emit('click');await f.calibrate();
  assert.equal(f.get('signage').children[0],frame);
  await f.get('stop').emit('click');
  assert.equal(f.get('signage').children[0],frame);assert.equal(frame.removed,undefined);
  assert.equal(f.get('scene').srcObject,null);assert.equal(f.track.stopped,true);
  assert.equal(f.get('signage').hidden,false);assert.match(f.get('signage-mode').textContent,/analizador inactivo/);
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
  assert.equal(f.get('connection').textContent,'Cámara sin conectar');assert.equal(f.get('scene').srcObject,null);
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
test('returning from hidden resumes only the previously active analysis and only on a fresh frame',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const f=await fixture();await f.get('connect').emit('click');await f.calibrate();await f.get('analyze').emit('click');
  f.doc.hidden=true;await f.doc.emit('visibilitychange');f.finishDetection();await new Promise(resolve=>setImmediate(resolve));
  f.get('scene').currentTime++;t.mock.timers.tick(1000);await new Promise(resolve=>setImmediate(resolve));assert.equal(f.detections.length,1);
  f.doc.hidden=false;await f.doc.emit('visibilitychange');t.mock.timers.tick(500);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.get('connection').textContent,'Analizando');assert.equal(f.detections.length,2);assert.equal(f.get('count-person').textContent,'0');
  await f.get('analyze').emit('click');f.finishDetection();await new Promise(resolve=>setImmediate(resolve));
  f.doc.hidden=true;await f.doc.emit('visibilitychange');f.doc.hidden=false;await f.doc.emit('visibilitychange');f.get('scene').currentTime++;t.mock.timers.tick(2000);
  assert.equal(f.detections.length,2);assert.equal(f.get('analyze').textContent,'Iniciar análisis');
});
test('temporary track mute recovers after unmute and fresh video; manual pause cancels recovery',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const f=await fixture();await f.get('connect').emit('click');await f.calibrate();await f.get('analyze').emit('click');
  await f.track.emit('mute');f.finishDetection();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.get('test-person').disabled,true);
  f.get('scene').currentTime++;t.mock.timers.tick(1000);await new Promise(resolve=>setImmediate(resolve));assert.equal(f.detections.length,1);
  await f.track.emit('unmute');t.mock.timers.tick(500);await new Promise(resolve=>setImmediate(resolve));assert.equal(f.detections.length,2);
  await f.track.emit('mute');f.finishDetection();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.get('analyze').disabled,false);await f.get('analyze').emit('click');
  await f.track.emit('unmute');f.get('scene').currentTime++;t.mock.timers.tick(1000);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.detections.length,2);assert.equal(f.get('analyze').textContent,'Iniciar análisis');
});
test('manual music tests are cleared before detector loading and stay blocked through automatic recovery',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const f=await fixture({slowLoad:true});
  const frame=f.get('signage').children.find(node=>node.tagName==='iframe');
  const ack=()=>f.win.emit('message',{source:frame.contentWindow,origin:'null',data:{source:'admira-tv-canal',requestId:frame.sent.at(-1).data.requestId,ok:true}});
  await ack();await f.get('connect').emit('click');await f.calibrate();
  await f.get('test-person').emit('click');await ack();
  assert.equal(frame.sent.at(-1).data.command,'admiratv audiencia persona');
  assert.equal(f.get('event-counter').textContent,'0 pasos');assert.equal(f.get('capture-canvas').hidden,true);
  const starting=f.get('analyze').emit('click');await Promise.resolve();
  assert.equal(f.detections.length,0);assert.equal(f.get('test-person').disabled,true);
  assert.equal(frame.sent.at(-1).data.command,'admiratv audiencia u');await ack();
  const loadingCommands=frame.sent.length;await f.get('test-car').emit('click');assert.equal(frame.sent.length,loadingCommands);
  f.finishLoad();await starting;assert.equal(f.detections.length,1);assert.equal(frame.sent.length,loadingCommands);
  await f.track.emit('mute');await ack();
  assert.equal(f.get('analyze').textContent,'Pausar análisis');assert.match(f.get('analysis-health').textContent,/reanudación automática/);
  const suspendedCommands=frame.sent.length;
  for(const kind of ['person','car','motorcycle','bicycle','none']){
    assert.equal(f.get(`test-${kind}`).disabled,true);await f.get(`test-${kind}`).emit('click');
  }
  assert.equal(frame.sent.length,suspendedCommands);
  f.finishDetection();await new Promise(resolve=>setImmediate(resolve));
  await f.track.emit('unmute');f.get('scene').currentTime++;t.mock.timers.tick(500);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.get('connection').textContent,'Analizando');assert.equal(f.detections.length,2);
  assert.equal(frame.sent.length,suspendedCommands);assert.equal(frame.sent.at(-1).data.command,'admiratv audiencia u');
  assert.equal(f.get('event-counter').textContent,'0 pasos');assert.equal(f.get('capture-canvas').hidden,true);
  await f.get('analyze').emit('click');await ack();f.finishDetection();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.get('test-person').disabled,false);await f.get('test-car').emit('click');await ack();
  assert.equal(frame.sent.at(-1).data.command,'admiratv audiencia coche');assert.equal(f.get('event-counter').textContent,'0 pasos');
});
test('missing frames waits without counting frozen images, then recovers from the same source',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});let now=0;t.mock.method(performance,'now',()=>now);
  const f=await fixture();await f.get('connect').emit('click');await f.calibrate();await f.get('analyze').emit('click');
  f.finishDetection();await new Promise(resolve=>setImmediate(resolve));now=3100;t.mock.timers.tick(3100);
  assert.match(f.get('analysis-health').textContent,/reanudación automática/);assert.equal(f.detections.length,1);
  now+=5000;t.mock.timers.tick(5000);assert.equal(f.detections.length,1);assert.equal(f.get('count-person').textContent,'0');
  f.get('scene').currentTime++;now+=500;t.mock.timers.tick(500);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.get('connection').textContent,'Analizando');assert.equal(f.detections.length,2);f.finishDetection();
});
test('recovery waits for an old inference; late detections are discarded and disconnect cancels intent',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const f=await fixture();await f.get('connect').emit('click');await f.calibrate();await f.get('analyze').emit('click');
  await f.track.emit('mute');await f.track.emit('unmute');f.get('scene').currentTime++;t.mock.timers.tick(1000);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.detections.length,1);
  f.detections[0].resolve([{class:'person',score:.99,bbox:[10,10,50,90]}]);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.get('count-person').textContent,'0');t.mock.timers.tick(500);await new Promise(resolve=>setImmediate(resolve));assert.equal(f.detections.length,2);
  await f.track.emit('mute');await f.get('stop').emit('click');f.finishDetection();await new Promise(resolve=>setImmediate(resolve));
  await f.track.emit('unmute');f.get('scene').currentTime++;t.mock.timers.tick(2000);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.detections.length,2);assert.equal(f.get('connection').textContent,'Cámara sin conectar');
});
test('recovery retries a browser-paused source only while visible and requested, never granting a new capture',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});let now=0;t.mock.method(performance,'now',()=>now);
  const f=await fixture();await f.get('connect').emit('click');await f.calibrate();await f.get('analyze').emit('click');
  const scene=f.get('scene');let plays=0;scene.paused=true;scene.play=async()=>{plays++;scene.paused=false;};
  f.doc.hidden=true;await f.doc.emit('visibilitychange');f.finishDetection();await new Promise(resolve=>setImmediate(resolve));
  now+=1000;t.mock.timers.tick(1000);await new Promise(resolve=>setImmediate(resolve));assert.equal(plays,0);
  f.doc.hidden=false;await f.doc.emit('visibilitychange');now+=500;t.mock.timers.tick(500);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(plays,1);assert.equal(f.detections.length,1);
  scene.currentTime++;now+=500;t.mock.timers.tick(500);await new Promise(resolve=>setImmediate(resolve));assert.equal(f.detections.length,2);
  await f.track.emit('mute');f.finishDetection();await new Promise(resolve=>setImmediate(resolve));await f.get('analyze').emit('click');
  scene.paused=true;await f.track.emit('unmute');now+=3000;t.mock.timers.tick(3000);await new Promise(resolve=>setImmediate(resolve));assert.equal(plays,1);
  assert.equal(f.get('analyze').textContent,'Iniciar análisis');assert.equal(f.track.stopped,false);
});
test('format changes and calibration cancel automatic recovery while a proportional resize recovers',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const f=await fixture();await f.get('connect').emit('click');await f.calibrate();await f.get('analyze').emit('click');
  f.get('scene').videoWidth=1920;f.get('scene').videoHeight=1080;await f.get('scene').emit('resize');f.finishDetection();await new Promise(resolve=>setImmediate(resolve));
  f.get('scene').currentTime++;t.mock.timers.tick(500);await new Promise(resolve=>setImmediate(resolve));assert.equal(f.detections.length,2);
  f.get('scene').videoWidth=2100;await f.get('scene').emit('resize');f.finishDetection();await new Promise(resolve=>setImmediate(resolve));
  f.get('scene').currentTime++;t.mock.timers.tick(2000);await new Promise(resolve=>setImmediate(resolve));assert.equal(f.detections.length,2);assert.equal(f.get('analyze').disabled,true);
  await f.calibrate();await f.get('analyze').emit('click');await f.track.emit('mute');f.finishDetection();await new Promise(resolve=>setImmediate(resolve));
  await f.get('edit-coordinates').emit('click');await f.get('apply-coordinates').emit('click');await f.track.emit('unmute');f.get('scene').currentTime++;t.mock.timers.tick(1000);
  assert.equal(f.detections.length,3);assert.equal(f.get('analyze').textContent,'Iniciar análisis');
});
test('changing source resolution invalidates calibration',async()=>{
  const f=await fixture();await f.get('connect').emit('click');await f.calibrate();
  f.get('scene').videoWidth=1440;await f.get('scene').emit('resize');
  assert.equal(f.get('analyze').disabled,true);assert.equal(f.get('tablet').hidden,true);
  await f.get('stop').emit('click');
});
test('calibrated signage projects the existing music player without starting analysis or restarting music',async()=>{
  const f=await fixture();await f.get('connect').emit('click');
  await f.get('edit-coordinates').emit('click');
  const quad=[50,25,75,25,75,85,50,85];
  for(const [i,value] of quad.entries())f.get(`coord-${12+i}`).value=String(value);
  await f.get('apply-coordinates').emit('click');
  assert.equal(f.get('signage').hidden,false);assert.equal(f.get('start-signage').disabled,true);
  assert.equal(f.get('signage').children.length,1);assert.match(f.get('calibration-status').textContent,/cartelería: marcada/);
  assert.equal(f.get('connection').textContent,'Pestaña conectada');
  const first=f.get('signage').children[0];await f.get('edit-coordinates').emit('click');
  assert.equal(first.removed,undefined);assert.equal(f.get('signage').hidden,true);assert.equal(f.get('analyze').disabled,true);
  await f.get('stage').emit('click');await f.get('apply-coordinates').emit('click');assert.equal(f.get('signage').children.length,1);
  f.get('scene').videoWidth=1440;await f.get('scene').emit('resize');
  assert.equal(f.get('signage').hidden,false);assert.equal(f.get('start-signage').disabled,true);assert.equal(f.get('signage').children[0],first);
  await f.get('stop').emit('click');
});
test('partial signage coordinates cannot be accepted silently',async()=>{
  const f=await fixture();await f.get('connect').emit('click');await f.get('edit-coordinates').emit('click');
  f.get('coord-12').value='50';await f.get('apply-coordinates').emit('click');
  assert.match(f.get('status').textContent,/Completa las ocho/);assert.equal(f.get('start-signage').disabled,true);
  await f.get('stop').emit('click');
});
test('automatic signage is removed on hide; late loads are ignored',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const f=await fixture();await f.get('connect').emit('click');await f.get('edit-coordinates').emit('click');
  for(const [i,value] of [50,25,75,25,75,85,50,85].entries())f.get(`coord-${12+i}`).value=String(value);
  await f.get('apply-coordinates').emit('click');await f.get('start-signage').emit('click');
  const iframe=f.get('signage').children[0];assert.ok(iframe.src.includes('xtore-virtual-'));assert.equal(iframe.sandbox,'allow-scripts');
  const sent=iframe.sent;await iframe.emit('load');
  await f.win.emit('message',{source:iframe.contentWindow,origin:'null',data:{source:'admira-tv-canal',requestId:sent[0].data.requestId,ok:true}});
  assert.equal(f.get('signage-status').textContent,'Canal conectado · esperando emisión');
  assert.match(f.get('signage-command').textContent,/Bucle general · orden aceptada/);
  await f.get('analyze').emit('click');assert.equal(iframe.removed,undefined);
  f.doc.hidden=true;await f.doc.emit('visibilitychange');assert.equal(iframe.removed,true);assert.equal(f.get('signage').children.length,0);
  const afterHide=sent.length;await iframe.emit('load');assert.equal(sent.length,afterHide);await f.get('stop').emit('click');f.finishDetection();
});
test('signage with a healthy ACK keeps retrying slow media without resetting the capture',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const f=await fixture();await f.get('connect').emit('click');await f.get('edit-coordinates').emit('click');
  for(const [i,value] of [50,25,75,25,75,85,50,85].entries())f.get(`coord-${12+i}`).value=String(value);
  await f.get('apply-coordinates').emit('click');await f.get('start-signage').emit('click');
  const iframe=f.get('signage').children[0];await f.win.emit('message',{source:iframe.contentWindow,origin:'null',data:{source:'admira-tv-canal',requestId:iframe.sent[0].data.requestId,ok:true}});
  t.mock.timers.tick(30001);assert.notEqual(iframe.removed,true);assert.match(f.get('signage-status').textContent,/Carga demorada/);
  assert.equal(f.get('signage-idle').hidden,true);
  await f.get('confidence').emit('input');assert.equal(f.get('signage').children.length,1);await f.get('stop').emit('click');
});
test('pause keeps the normal loop, manual stop stays off, returning to a visible tab never starts inference',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const f=await fixture();await f.get('connect').emit('click');await f.get('edit-coordinates').emit('click');
  for(const [i,value] of [50,25,75,25,75,85,50,85].entries())f.get(`coord-${12+i}`).value=String(value);
  await f.get('apply-coordinates').emit('click');const iframe=f.get('signage').children[0];
  await f.win.emit('message',{source:iframe.contentWindow,origin:'null',data:{source:'admira-tv-canal',requestId:iframe.sent[0].data.requestId,ok:true}});
  await f.get('analyze').emit('click');await f.get('analyze').emit('click');
  assert.equal(iframe.removed,undefined);assert.equal(iframe.sent.at(-1).data.command,'admiratv audiencia u');f.finishDetection();
  f.doc.hidden=true;await f.doc.emit('visibilitychange');assert.equal(iframe.removed,true);
  f.doc.hidden=false;await f.doc.emit('visibilitychange');assert.equal(f.get('signage').children.length,1);assert.equal(f.get('connection').textContent,'Pestaña conectada');
  await f.get('stop-signage').emit('click');await f.get('confidence').emit('input');
  assert.equal(f.get('signage-idle-label').textContent,'Player apagado');
  assert.equal(f.get('signage').children.length,0);
  f.doc.hidden=true;await f.doc.emit('visibilitychange');f.doc.hidden=false;await f.doc.emit('visibilitychange');
  assert.equal(f.get('signage').children.length,0);await f.get('start-signage').emit('click');assert.equal(f.get('signage').children.length,1);
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
test('pause, confidence edits and Reset do not recount the person still in view',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});let now=0;t.mock.method(performance,'now',()=>now);
  const f=await fixture();await f.get('connect').emit('click');await f.calibrate();await f.get('analyze').emit('click');
  const detect=async x=>{f.detections.at(-1).resolve([{class:'person',score:.9,bbox:[x,10,30,60]}]);await new Promise(resolve=>setImmediate(resolve));};
  await detect(10);now+=200;f.get('scene').currentTime++;t.mock.timers.tick(200);await detect(20);
  assert.equal(f.get('count-person').textContent,'1');
  await f.get('analyze').emit('click');now+=2200;
  await f.get('analyze').emit('click');await detect(25);
  assert.equal(f.get('count-person').textContent,'1');
  f.get('confidence').value='70';await f.get('confidence').emit('input');
  f.get('bicycle-confidence').value='45';await f.get('bicycle-confidence').emit('input');
  await f.get('reset-counts').emit('click');assert.equal(f.get('event-counter').textContent,'0 pasos');
  assert.equal(f.get('capture-canvas').hidden,true);
  now+=200;f.get('scene').currentTime++;t.mock.timers.tick(200);await detect(30);
  assert.equal(f.get('count-person').textContent,'0');
  assert.match(f.get('history-status').textContent,/1 sin confirmar/);
  await f.get('stop').emit('click');
});
test('manual scooters require a connected source and never fabricate a capture or player command',async()=>{
  const f=await fixture();await f.get('add-scooter').emit('click');assert.equal(f.get('count-scooter').textContent,'0');
  const wasHidden=f.get('capture-canvas').hidden,player=f.get('signage').children[0],commands=player.sent.length;
  await f.get('connect').emit('click');await f.get('add-scooter').emit('click');
  assert.equal(f.get('count-scooter').textContent,'1');assert.equal(f.get('event-counter').textContent,'1 paso');
  assert.equal(f.get('capture-canvas').hidden,wasHidden);assert.match(f.get('status').textContent,/manualmente/);
  assert.equal(f.get('signage').children[0],player);assert.equal(player.sent.length,commands);await f.get('stop').emit('click');
});
const personMask={width:2,height:2,legend:{person:[128,0,0]},segmentationMap:new Uint8ClampedArray([128,0,0,255,128,0,0,255,128,0,0,255,128,0,0,255])};
async function confirmPerson(f,t){
  const p=x=>[{class:'person',score:.9,bbox:[x,10,30,60]}];
  f.detections[0].resolve(p(10));await new Promise(resolve=>setImmediate(resolve));
  f.get('scene').currentTime++;t.mock.timers.tick(200);
  f.detections[1].resolve(p(20));await new Promise(resolve=>setImmediate(resolve));
}
test('rendered cutouts are wiped on pause without changing category counts',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const f=await fixture({segment:async()=>personMask});
  await f.get('prepare-cutouts').emit('click');
  await f.get('connect').emit('click');await f.calibrate();await f.get('analyze').emit('click');
  await confirmPerson(f,t);
  const canvases=f.get('cutouts').querySelectorAll('canvas');
  assert.equal(canvases.length,1);assert.equal(f.get('count-person').textContent,'1');
  assert.match(f.get('cutout-status').textContent,/recortes locales, no anonimizados/);
  await f.get('analyze').emit('click');
  assert.equal(f.get('cutouts').children.length,0);assert.equal(canvases[0].width,1);
  assert.equal(f.get('count-person').textContent,'1');await f.get('stop').emit('click');
});
test('a late mask cannot restore cutouts after disconnect',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});let finish;
  const f=await fixture({segment:input=>input.width===16?Promise.resolve(personMask):new Promise(resolve=>{finish=resolve;})});
  await f.get('prepare-cutouts').emit('click');
  await f.get('connect').emit('click');await f.calibrate();await f.get('analyze').emit('click');
  await confirmPerson(f,t);await f.get('stop').emit('click');finish(personMask);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.get('cutouts').children.length,0);assert.equal(f.get('connection').textContent,'Cámara sin conectar');
  assert.equal(f.get('count-person').textContent,'1');
});
test('a new passage during segmentation queues the latest capture without cancelling both',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});const jobs=[];
  const f=await fixture({segment:input=>input.width===16?Promise.resolve(personMask):new Promise(resolve=>{jobs.push(resolve);})});
  await f.get('prepare-cutouts').emit('click');
  await f.get('connect').emit('click');await f.calibrate();await f.get('analyze').emit('click');
  await confirmPerson(f,t);assert.equal(jobs.length,1);
  for(const category of ['car','bicycle'])for(const x of [10,20]){
    f.get('scene').currentTime++;t.mock.timers.tick(200);
    f.detections.at(-1).resolve([{class:category,score:.9,bbox:[x,10,30,60]}]);
    await new Promise(resolve=>setImmediate(resolve));
  }
  assert.equal(jobs.length,1);assert.equal(f.get('event-counter').textContent,'3 pasos');
  jobs[0](personMask);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.get('cutouts').querySelectorAll('canvas').length,1);
  assert.equal(f.get('cutouts').querySelectorAll('figcaption')[0].textContent,'Persona');
  assert.equal(jobs.length,2);
  jobs[1]({...personMask,legend:{bicycle:[128,0,0]}});await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.get('cutouts').querySelectorAll('figcaption')[0].textContent,'Bici');
  assert.equal(f.get('event-counter').textContent,'3 pasos');
  await f.get('stop').emit('click');
});
test('a newer passage cannot extend the active cutout source lifetime',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});let now=0;const jobs=[];
  t.mock.method(performance,'now',()=>now);
  const tick=ms=>{now+=ms;t.mock.timers.tick(ms);};
  const f=await fixture({segment:input=>input.width===16?Promise.resolve(personMask):new Promise(resolve=>{jobs.push({input,resolve});})});
  await f.get('prepare-cutouts').emit('click');
  await f.get('connect').emit('click');await f.calibrate();await f.get('analyze').emit('click');
  const detect=async(category,x,delay)=>{
    if(delay){f.get('scene').currentTime++;tick(delay);}
    f.detections.at(-1).resolve([{class:category,score:.9,bbox:[x,10,30,60]}]);
    await new Promise(resolve=>setImmediate(resolve));
  };
  await detect('person',10,0);await detect('person',20,200);
  assert.equal(jobs.length,1);const firstInput=jobs[0].input;
  assert.ok(firstInput.lastImageData.data.some(value=>value!==0));
  await detect('car',10,3800);await detect('car',20,200);
  assert.equal(f.get('event-counter').textContent,'2 pasos');
  tick(2001);
  assert.equal(firstInput.width,1);assert.equal(firstInput.height,1);
  assert.ok(firstInput.lastImageData.data.every(value=>value===0));
  jobs[0].resolve(personMask);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.get('cutouts').children.length,0);assert.equal(jobs.length,2);
  assert.ok(jobs[1].input.lastImageData.data.some(value=>value!==0));
  jobs[1].resolve({...personMask,legend:{car:[128,0,0]}});await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.get('cutouts').querySelectorAll('figcaption')[0].textContent,'Coche');
  assert.equal(f.get('event-counter').textContent,'2 pasos');
  await f.get('stop').emit('click');
});
test('choosing a cutout retains only a temporary original and pause clears it',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const f=await fixture({segment:async()=>personMask});
  await f.get('prepare-cutouts').emit('click');
  await f.get('connect').emit('click');await f.calibrate();await f.get('analyze').emit('click');
  await confirmPerson(f,t);
  await f.get('cutouts').querySelectorAll('button')[0].emit('click');
  assert.equal(f.get('twin-panel').open,true);assert.equal(f.get('twin-source').hidden,false);
  assert.equal(f.get('twin-generate').disabled,true);
  const selected=f.get('twin-source').lastImageData;
  f.get('twin-consent').checked=true;await f.get('twin-consent').emit('change');
  assert.equal(f.get('twin-generate').disabled,false);
  await f.get('analyze').emit('click');
  assert.equal(f.get('twin-source').hidden,true);assert.equal(f.get('twin-source').width,1);
  assert.ok(selected.data.every(value=>value===0));assert.equal(f.get('twin-generate').disabled,true);
  assert.equal(f.get('count-person').textContent,'1');await f.get('stop').emit('click');
});
