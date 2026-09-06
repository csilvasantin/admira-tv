const test=require('node:test');
const assert=require('node:assert/strict');
const Tour=require('../js/dooh-tour.js');
const Focus=require('../best/surface-focus.js');
const Surfaces=require('../js/dooh-surfaces.js');
const Contract=require('../js/outdoor-context.js');
const origin='https://admira.tv';
test('surface messages require the exact origin and renderer; arbitrary panorama requests cannot enter the contract',()=>{
 const frame={},payload={action:'focus',surfaceId:'jardinets-main',requestId:7};
 const event={source:frame,origin,data:Contract.message('surface-command',payload)};
 assert.equal(Contract.accepts(event,frame,origin),true);
 assert.equal(Contract.accepts({...event,source:{}},frame,origin),false);
 assert.equal(Contract.accepts({...event,origin:'https://other.example'},frame,origin),false);
 assert.equal(Contract.validateSurfaceCommand({...payload,surfaceId:'unregistered'}),null);
 assert.equal(Contract.validateSurfaceCommand({...payload,requestId:1.5}),null);
 assert.deepEqual(Contract.validateSurfaceCommand({...payload,pano:'arbitrary-destination'}),payload);
});
function linked(){
 let time=0,timerId=0,camera=null;const timers=new Map(),prepares=[],paint=[],messages=[];
 let focus;
 const tour=Tour.create({stops:Surfaces.all,now:()=>time,setTimeout:(fn,ms)=>{const id=++timerId;timers.set(id,{fn,at:time+ms});return id;},clearTimeout:id=>timers.delete(id),send:m=>{messages.push(m);if(m.action==='focus')focus.focus(m.surfaceId,m.requestId);else focus.cancel('cancel',m.requestId);}});
 focus=Focus.create({settleMs:0,getSurface:Surfaces.get,getCamera:()=>camera,prepare:surface=>new Promise(resolve=>prepares.push({surface,resolve})),onState:s=>{assert.ok(Contract.validateSurfaceState(s));tour.accept(s);},afterPaint:fn=>paint.push(fn)});
 const flush=async()=>{for(let i=0;i<5;i++)await Promise.resolve();};
 const settle=async index=>{const p=prepares[index];camera={pano:p.surface.pano,visible:true,...p.surface.pov};focus.observe({pano:p.surface.pano,status:'ready'});p.resolve(p.surface.pov);await flush();};
 const tick=ms=>{time+=ms;for(const [id,t] of [...timers])if(t.at<=time){timers.delete(id);t.fn();}};
 return{tour,focus,prepares,paint,messages,flush,settle,tick,setCamera:c=>camera=c,dispose(){tour.destroy();focus.dispose();}};
}
test('a complete panorama cannot start exposure until the requested camera and paint are also ready',async()=>{
 const f=linked();try{
  f.tour.start('jardinets-main');await f.flush();const surface=Surfaces.get('jardinets-main');
  f.setCamera({pano:surface.pano,visible:true,heading:surface.pov.heading+15,pitch:surface.pov.pitch,zoom:surface.pov.zoom});
  f.focus.observe({pano:surface.pano,status:'ready'});f.prepares[0].resolve(surface.pov);await f.flush();
  assert.equal(f.paint.length,0);assert.equal(f.tour.getState().status,'loading');
  f.setCamera({pano:surface.pano,visible:true,...surface.pov});f.focus.check();assert.equal(f.tour.getState().status,'loading');
  f.paint.shift()();assert.equal(f.tour.getState().status,'playing');
 }finally{f.dispose();}
});
test('manual cancellation after panorama readiness but before paint prevents dwell and any next camera request',async()=>{
 const f=linked();try{
  f.tour.start('vila-left');await f.flush();await f.settle(0);assert.equal(f.paint.length,1);
  f.focus.cancel('manual');f.paint.shift()();f.tick(90000);
  assert.equal(f.tour.getState().status,'stopped');assert.equal(f.messages.filter(m=>m.action==='focus').length,1);
 }finally{f.dispose();}
});
test('late preparation of the former screen cannot confirm the newly requested screen',async()=>{
 const f=linked();try{
  f.tour.start('vila-left');await f.flush();f.tour.start('jardinets-main');await f.flush();
  await f.settle(0);assert.equal(f.tour.getState().surfaceId,'jardinets-main');assert.equal(f.tour.getState().status,'loading');assert.equal(f.paint.length,0);
  await f.settle(1);f.paint.shift()();assert.equal(f.tour.getState().surfaceId,'jardinets-main');assert.equal(f.tour.getState().status,'playing');
 }finally{f.dispose();}
});

test('cancellation during texture settling suppresses readiness even after its timer would expire',async()=>{
 const surface=Surfaces.get('jardinets-main'),events=[];let paint;
 const focus=Focus.create({getSurface:Surfaces.get,prepare:async()=>surface.pov,
  getCamera:()=>({pano:surface.pano,visible:true,...surface.pov}),
  afterPaint:fn=>{paint=fn},settleMs:15,onState:state=>events.push(state)});
 try{
  focus.focus(surface.id,90);focus.observe({pano:surface.pano,status:'ready'});
  for(let i=0;i<5;i++)await Promise.resolve();
  assert.equal(typeof paint,'function');paint();focus.cancel('manual');
  await new Promise(resolve=>setTimeout(resolve,35));
  assert.deepEqual(events.map(e=>e.status),['loading','cancelled']);
 }finally{focus.dispose()}
});
