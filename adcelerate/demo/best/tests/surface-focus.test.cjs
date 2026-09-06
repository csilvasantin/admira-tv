const {test}=require('node:test');const assert=require('node:assert/strict');
const Focus=require('../surface-focus.js'),Surfaces=require('../../js/dooh-surfaces.js');
const tick=()=>new Promise(r=>setImmediate(r));
function fixture(opts={}){
 const events=[],paints=[],cancelled=[],surface=Surfaces.get('jardinets-main');
 let camera={pano:surface.pano,...surface.pov,visible:true};
 const c=Focus.create({getSurface:Surfaces.get,prepare:async()=>surface.pov,getCamera:()=>camera,onState:s=>events.push(s),onCancel:id=>cancelled.push(id),afterPaint:f=>paints.push(f),timeoutMs:500,settleMs:0,...opts});
 return {c,events,paints,cancelled,surface,setCamera:c=>camera=c,scene:()=>c.observe({pano:surface.pano,status:'ready'})};
}
test('surface arrives only after prepared camera, fresh scene, and two-frame paint callback',async()=>{
 const f=fixture();f.c.focus(f.surface.id,1);await tick();assert.equal(f.events.at(-1).status,'loading');f.scene();assert.equal(f.paints.length,1);assert.equal(f.events.at(-1).status,'loading');f.paints.shift()();assert.equal(f.events.at(-1).status,'ready');f.c.dispose();
});
test('same-surface restart rejects earlier tokens and cancellation remains effective during dwell',async()=>{
 const f=fixture();f.c.focus(f.surface.id,1);await tick();f.scene();const old=f.paints.shift();f.c.focus(f.surface.id,2);await tick();old();assert.equal(f.events.at(-1).requestId,2);assert.equal(f.events.at(-1).status,'loading');f.scene();f.paints.shift()();assert.equal(f.events.at(-1).status,'ready');assert.equal(f.c.cancel('manual',1),false);f.c.cancel('manual',2);assert.deepEqual(f.events.at(-1),{surfaceId:f.surface.id,requestId:2,status:'cancelled',reason:'manual'});
});
test('cancel before queued prepare prevents camera work; cancel during prepare invalidates its continuation',async()=>{
 let calls=0,resolve;const f=fixture({prepare:()=>{calls++;return new Promise(r=>resolve=r)}});
 f.c.focus(f.surface.id,1);f.c.cancel('manual');await tick();assert.equal(calls,0);
 f.c.focus(f.surface.id,2);await tick();assert.equal(calls,1);f.c.cancel('manual');resolve(f.surface.pov);await tick();f.scene();assert.equal(f.paints.length,0);assert.equal(f.events.at(-1).status,'cancelled');
});
test('timeout invalidates camera preparation before reporting error and ignores late readiness',async()=>{
 let complete,valid=true,mutations=0;const f=fixture({timeoutMs:12,onCancel:()=>valid=false,prepare:()=>new Promise(resolve=>complete=()=>{if(valid)mutations++;resolve(Surfaces.get('jardinets-main').pov)})});
 f.c.focus(f.surface.id,7);await new Promise(r=>setTimeout(r,25));assert.equal(valid,false);assert.equal(f.events.at(-1).reason,'timeout');complete();await tick();f.scene();assert.equal(mutations,0);assert.equal(f.events.at(-1).status,'error');
});
test('loss of current scene or hidden/wrong camera cannot be acknowledged as a readable surface',async()=>{
 const f=fixture();f.c.focus(f.surface.id,1);await tick();f.setCamera({pano:f.surface.pano,...f.surface.pov,visible:false});f.scene();assert.equal(f.paints.length,0);f.setCamera({pano:f.surface.pano,...f.surface.pov,visible:true});f.scene();f.c.observe({pano:f.surface.pano,status:'loading'});f.paints.shift()();assert.equal(f.events.at(-1).status,'loading');f.c.dispose();
});
test('calibrated inventory is exactly two Vila posters and one Jardinets poster; fitting adapts to portrait',()=>{
 assert.deepEqual(Surfaces.all.map(s=>s.siteId),['vila','vila','jardinets']);
 for(const s of Surfaces.all){const wide=Surfaces.fit(s,1440,814),narrow=Surfaces.fit(s,390,758);assert.ok(narrow.zoom>wide.zoom);assert.ok(narrow.zoom<=4.5);assert.ok(Math.abs(narrow.heading-s.pov.heading)<1);}
 assert.equal(Surfaces.get('unknown'),null);
});

test('optical projection follows the measured native Google turn, not a linear-angle zoom approximation',()=>{
 const q=Surfaces.get('jardinets-main').corners.tl;
 const initial=Surfaces.project(...q,{heading:290.7,pitch:-4},2.8,1440,814);
 assert.ok(Math.abs(initial[0]-619)<.001);assert.ok(Math.abs(initial[1]-179)<.001);
 const turned=Surfaces.project(...q,{heading:298.7,pitch:-4},2.8,1440,814);
 assert.ok(Math.abs(turned[0]-263)<1,'same native poster feature measured at x263 after +8 degrees');
 for(const zoom of [.9,1.6,2.8,4])for(const pov of [{heading:282.7,pitch:-4},{heading:298.7,pitch:2}]){
  const pixel=Surfaces.project(...q,pov,zoom,1440,814),back=Surfaces.unproject(...pixel,pov,zoom,1440,814);
  assert.ok(Math.abs(back[0]-q[0])<1e-8);assert.ok(Math.abs(back[1]-q[1])<1e-8);
 }
});
test('fitted posters leave a clear margin above tour dock at desktop and mobile viewport sizes',()=>{
 for(const [w,h] of [[1440,814],[1280,634],[390,758]])for(const surface of Surfaces.all){
  const pov=Surfaces.fit(surface,w,h),pixels=Object.values(surface.corners).map(q=>Surfaces.project(...q,pov,pov.zoom,w,h));
  assert.ok(pixels.every(p=>p[0]>16&&p[0]<w-16));
  assert.ok(Math.max(...pixels.map(p=>p[1]))<h-Math.min(275,h*.45)-16,JSON.stringify({w,h,id:surface.id,pixels}));
 }
});

test('walking arrival views preserve the same screen identities and reject unrelated panoramas',()=>{
 const pano='xyBUNhtkdE7tUUGrvRPwmA';assert.equal(Surfaces.all.length,3);
 for(const id of ['vila-left','vila-right']){const pose=Surfaces.poseFor(id,pano);assert.equal(pose.id,id);assert.equal(pose.pano,pano);assert.equal(pose.elementId,Surfaces.get(id).elementId);assert.ok(Surfaces.fit(pose,390,758).zoom>1);}
 assert.equal(Surfaces.poseFor('jardinets-main',pano),null);assert.equal(Surfaces.poseFor('vila-left','unknown'),null);
 const left=Surfaces.poseFor('vila-left',pano),pixel=Surfaces.project(...left.corners.tl,{heading:13,pitch:-6},2.3,1440,814);assert.ok(Math.abs(pixel[0]-615)<.01);assert.ok(Math.abs(pixel[1]-185)<.01);
});
