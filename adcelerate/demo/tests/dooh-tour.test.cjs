const {test}=require('node:test');
const assert=require('node:assert/strict');
const {create}=require('../js/dooh-tour.js');
const stops=[{id:'a',siteId:'vila',label:'Izquierda'},{id:'b',siteId:'vila',label:'Derecha'},{id:'c',siteId:'jardinets',label:'Jardinets'}];
function harness(extra={}){
  let time=0,sequence=0;const timers=new Map(),sent=[],states=[];
  const tour=create({stops,send:command=>sent.push(command),onChange:s=>states.push(s),now:()=>time,
    setTimeout:(fn,ms)=>{const id=++sequence;timers.set(id,{fn,at:time+ms});return id;},clearTimeout:id=>timers.delete(id),...extra});
  const tick=ms=>{const end=time+ms;for(;;){const next=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;timers.delete(next[0]);time=next[1].at;next[1].fn();}time=end;};
  const ready=()=>{const s=tour.getState();tour.accept({requestId:s.requestId,surfaceId:s.surfaceId,status:'ready'});};
  return {tour,tick,ready,sent,states,timers};
}
test('dwell starts after matching screen readiness, never from arrival scheduling',()=>{
  const h=harness();h.tour.start();h.tick(7000);
  assert.equal(h.tour.getState().status,'loading');assert.equal(h.tour.getState().index,0);
  assert.equal(h.tour.accept({requestId:99,surfaceId:'a',status:'ready'}),false);
  assert.equal(h.tour.accept({requestId:1,surfaceId:'b',status:'ready'}),false);
  h.ready();h.tick(8999);assert.equal(h.tour.getState().index,0);
  h.tick(1);assert.equal(h.tour.getState().surfaceId,'b');assert.equal(h.tour.getState().status,'loading');
});
test('three screens repeat continuously and can begin at the selected destination',()=>{
  const h=harness();h.tour.start('c');assert.equal(h.tour.getState().index,0);assert.equal(h.tour.getState().surfaceId,'c');
  for(const id of ['a','b','c']){h.ready();h.tick(9000);assert.equal(h.tour.getState().surfaceId,id);}
  assert.equal(h.tour.getState().lap,2);
  assert.deepEqual(h.sent.filter(c=>c.action==='focus').map(c=>c.requestId),[1,2,3,4]);
});
test('pausing during exposure preserves remaining time and refocuses before resuming',()=>{
  const h=harness();h.tour.start();h.ready();h.tick(5000);h.tour.pause();
  assert.equal(h.tour.getState().status,'paused');assert.equal(h.tour.getState().remainingMs,4000);
  h.tick(60000);assert.equal(h.tour.getState().index,0);
  h.tour.resume();assert.equal(h.tour.getState().status,'loading');
  assert.equal(h.tour.accept({requestId:1,surfaceId:'a',status:'ready'}),false);
  h.ready();h.tick(3999);assert.equal(h.tour.getState().index,0);h.tick(1);assert.equal(h.tour.getState().index,1);
});
test('pause or stop while the photograph is loading cannot be revived by a late ready',()=>{
  for(const action of ['pause','stop']){
    const h=harness();h.tour.start();h.tour[action]();
    h.tour.accept({requestId:1,surfaceId:'a',status:'ready'});h.tick(60000);
    assert.equal(h.tour.getState().status,action==='pause'?'paused':'stopped');
    assert.equal(h.sent.filter(c=>c.action==='focus').length,1);
  }
});
test('timeout stays on the screen with a recoverable error and fresh request on retry',()=>{
  const h=harness();h.tour.start('b');h.tick(30000);
  assert.equal(h.tour.getState().status,'error');assert.equal(h.tour.getState().reason,'timeout');
  h.tour.accept({requestId:1,surfaceId:'b',status:'ready'});assert.equal(h.tour.getState().status,'error');
  h.tour.resume();assert.equal(h.tour.getState().surfaceId,'b');assert.equal(h.tour.getState().requestId,2);
  h.ready();assert.equal(h.tour.getState().status,'playing');
});
test('a manual gesture after readiness stops the tour and stale previous-screen events do not',()=>{
  const h=harness();h.tour.start();h.ready();h.tick(9000);h.ready();
  h.tour.accept({requestId:1,surfaceId:'a',status:'cancelled',reason:'manual'});
  assert.equal(h.tour.getState().status,'playing');
  h.tour.accept({requestId:2,surfaceId:'b',status:'cancelled',reason:'manual'});
  h.tick(60000);assert.equal(h.tour.getState().status,'stopped');assert.equal(h.tour.getState().surfaceId,'b');
});
test('destroy clears pending timers and refuses a new start or late readiness',()=>{
  const h=harness();h.tour.start();h.ready();h.tour.destroy();
  assert.equal(h.timers.size,0);assert.equal(h.tour.start(),false);
  assert.equal(h.tour.accept({requestId:1,surfaceId:'a',status:'ready'}),false);
});

test('screen inspection accepts only a calibrated screen belonging to the selected site',()=>{
  const context=require('../js/outdoor-context.js');
  const frame={},origin='https://admira.tv';
  const accepts=payload=>context.accepts({source:frame,origin,data:context.message('support-select',payload)},frame,origin);
  assert.equal(accepts({siteId:'jardinets',screenId:'jardinets-main'}),true);
  assert.equal(accepts({siteId:'vila',screenId:'vila-right'}),true);
  assert.equal(accepts({siteId:'jardinets',screenId:'vila-right'}),false);
  assert.equal(accepts({siteId:'vila',screenId:'invented'}),false);
});

test('only the explicit DooH deep link survives legacy BEST entry as an automatic human tour',()=>{
  const context=require('../js/outdoor-context.js');
  const valid=context.bestEntry('?tour=dooh&site=jardinets',false);
  assert.match(valid,/tour=dooh/);assert.match(valid,/view=human/);assert.match(valid,/site=jardinets/);
  assert.doesNotMatch(context.bestEntry('?tour=anything',false),/tour=/);
  assert.equal(context.bestEntry('?embed=1&tour=dooh',true),null);
});

const UrbanRoutes=require('../js/urban-route.js');
function walkingHarness(){
  const routes=UrbanRoutes.create([{id:'out',fromSiteId:'vila',toSiteId:'jardinets',panos:['V','X','Y','J']},{id:'back',fromSiteId:'jardinets',toSiteId:'vila',panos:['J','Z','V']}]);
  const travel=[];
  return {...harness({stops:[{id:'a',siteId:'vila',pano:'V'},{id:'b',siteId:'vila',pano:'V'},{id:'c',siteId:'jardinets',pano:'J'}],findRoute:routes.find,sendRoute:c=>travel.push(c)}),travel,routes};
}
test('walking entry waits for its real position and refuses to teleport from an unknown street',()=>{
  const h=walkingHarness();h.tour.start('a',{mode:'walk'});assert.equal(h.tour.getState().status,'locating');assert.equal(h.sent.length,0);
  h.tour.observePosition({pano:'unknown',status:'ready'});assert.equal(h.tour.getState().reason,'off-route');assert.equal(h.sent.length,0);assert.equal(h.travel.length,0);
});
test('a full walking loop visits both Vila screens then traverses the directed outward and return paths',()=>{
  const h=walkingHarness();h.tour.observePosition({pano:'V',status:'ready'});h.tour.start('a',{mode:'walk'});
  h.ready();h.tick(9000);assert.equal(h.tour.getState().surfaceId,'b');assert.equal(h.travel.length,0);
  h.ready();h.tick(9000);let s=h.tour.getState();assert.equal(s.status,'travelling');assert.equal(s.routeId,'out');
  h.tick(5000);assert.equal(h.sent.filter(c=>c.action==='focus').length,2);
  h.tour.acceptRoute({routeId:'out',requestId:s.requestId,status:'ready',pano:'J',step:3,total:3});
  assert.equal(h.tour.getState().status,'loading');h.ready();h.tick(9000);s=h.tour.getState();
  assert.equal(s.routeId,'back');assert.equal(s.status,'travelling');
  h.tour.acceptRoute({routeId:'back',requestId:s.requestId,status:'ready',pano:'V',step:2,total:2});h.ready();
  assert.equal(h.tour.getState().surfaceId,'a');assert.equal(h.tour.getState().lap,2);
});
test('pausing on a street resumes from the completed in-flight hop and rejects the cancelled route token',()=>{
  const h=walkingHarness();h.tour.observePosition({pano:'X',status:'ready'});h.tour.start('c',{mode:'walk'});
  const old=h.tour.getState().requestId;h.tour.pause();h.tour.observePosition({pano:'Y',status:'ready'});h.tick(60000);
  h.tour.resume();const s=h.tour.getState();assert.equal(s.routeStep,2);assert.notEqual(s.requestId,old);
  assert.equal(h.tour.acceptRoute({routeId:'out',requestId:old,status:'ready',pano:'J'}),false);
  assert.equal(h.sent.filter(c=>c.action==='focus').length,0);
  h.tour.acceptRoute({routeId:'out',requestId:s.requestId,status:'ready',pano:'J'});assert.equal(h.tour.getState().status,'loading');
});
test('route progress refreshes a per-hop watchdog, while a stalled or missing link never skips ahead',()=>{
  const h=walkingHarness();h.tour.observePosition({pano:'V',status:'ready'});h.tour.start('c',{mode:'walk'});
  const requestId=h.tour.getState().requestId;h.tick(25000);
  h.tour.acceptRoute({routeId:'out',requestId,status:'walking',pano:'X',step:1,total:3});h.tick(25000);assert.equal(h.tour.getState().status,'travelling');
  h.tour.acceptRoute({routeId:'out',requestId,status:'walking',pano:'X',step:1,total:3});h.tick(5000);assert.equal(h.tour.getState().reason,'timeout');
  assert.equal(h.sent.filter(c=>c.action==='focus').length,0);
});
test('manual control cancels a travelling tour and delayed arrival cannot reveal a destination screen',()=>{
  const h=walkingHarness();h.tour.observePosition({pano:'X',status:'ready'});h.tour.start('c',{mode:'walk'});
  const s=h.tour.getState();h.tour.stop('manual');h.tour.acceptRoute({routeId:s.routeId,requestId:s.requestId,status:'ready',pano:'J'});
  h.tick(60000);assert.equal(h.tour.getState().status,'stopped');assert.equal(h.sent.length,0);
});
test('directed routes cannot be reversed implicitly and lookup chooses an actual suffix from the current panorama',()=>{
  const routes=UrbanRoutes.create([{id:'out',fromSiteId:'vila',toSiteId:'jardinets',panos:['V','X','J']}]);
  assert.equal(routes.find('X','jardinets').id,'out');assert.equal(routes.find('X','vila'),null);
  assert.ok(Object.isFrozen(routes.get('out').panos));assert.throws(()=>routes.get('out').panos.push('fake'));
});

test('both Vila screen identities stay on their connected alternate photograph during a walking loop',()=>{
  const routes=UrbanRoutes.create([{id:'return',fromSiteId:'jardinets',toSiteId:'vila',panos:['J','V2']}]);
  const travel=[];const h=harness({stops:[{id:'a',siteId:'vila',pano:'V'},{id:'b',siteId:'vila',pano:'V'}],findRoute:routes.find,sendRoute:c=>travel.push(c),canFocus:(id,pano)=>['V','V2'].includes(pano)});
  h.tour.observePosition({pano:'J',status:'ready'});h.tour.start('a',{mode:'walk'});const s=h.tour.getState();
  h.tour.acceptRoute({routeId:'return',requestId:s.requestId,status:'ready',pano:'V2',step:1,total:1});
  assert.equal(h.sent.at(-1).preservePano,true);h.ready();assert.equal(h.tour.getState().pano,'V2');
  h.tick(9000);assert.equal(h.tour.getState().surfaceId,'b');assert.equal(h.sent.at(-1).preservePano,true);
  h.ready();assert.equal(h.tour.getState().pano,'V2');assert.equal(travel.filter(c=>c.action==='start').length,1);
});
