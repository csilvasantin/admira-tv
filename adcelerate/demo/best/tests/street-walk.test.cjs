const test=require('node:test');const assert=require('node:assert/strict');const Walk=require('../street-walk.js');
class Panorama {
 constructor(){this.pano='panels';this.pov={heading:49.5,pitch:2};this.zoom=.9;this.status='OK';this.links=[];this.events={};}
 addListener(name,fn){(this.events[name]??=[]).push(fn);return{remove:()=>this.events[name]=this.events[name].filter(f=>f!==fn)};}
 fire(name){for(const fn of this.events[name]||[])fn();}
 getLocation(){return {pano:this.locationPano||this.pano};}getPano(){return this.pano;}getStatus(){return this.status;}getPov(){return this.pov;}getLinks(){return this.links;}getZoom(){return this.zoom;}
 setPano(pano){this.pano=pano;this.fire('pano_changed');this.fire('status_changed');}setPov(pov){this.pov=pov;this.fire('pov_changed');}setZoom(z){this.zoom=z;}
}
function fixture(options={}){const p=new Panorama();if(options.initialPano)p.pano=options.initialPano;const requests=[],states=[],changes=[];const service={getPanorama:(request,callback)=>requests.push({pano:request.pano,callback})};
 const walk=Walk.create({panorama:p,service,afterPaint:fn=>fn(),panelPano:'panels',frontPano:'front',...options,onState:s=>states.push(s),onPanoChange:pano=>changes.push(pano)});
 const reply=(idx,date='2023-03',links=[{pano:'next',heading:136,description:'Plaza'}],status='OK')=>requests[idx].callback({location:{pano:requests[idx].pano,latLng:{lat:()=>41.4,lng:()=>2.15}},imageDate:date,links},status);
 return{p,requests,states,changes,walk,reply};}
test('direction chooses real links within 60 degrees with wraparound and backward bearing',()=>{
 const links=[{pano:'east',heading:10},{pano:'west',heading:185}];assert.equal(Walk.chooseLink(links,350).pano,'east');assert.equal(Walk.chooseLink(links,5,true).pano,'west');assert.equal(Walk.chooseLink(links,95),null);
});
test('initial metadata exposes exact date and real links; staring at billboard is not a sideways step',()=>{
 const f=fixture();try{assert.equal(f.walk.getState().date,'');f.reply(0);assert.equal(f.walk.getState().date,'2023-03');assert.equal(f.walk.getState().supportVisible,true);assert.equal(f.walk.command({action:'forward'}),false);assert.equal(f.p.getPano(),'panels');}finally{f.walk.dispose();}
});
test('one pending hop, no invented destination and no inherited date or support after leaving panels',()=>{
 const f=fixture();try{f.reply(0);f.p.setPov({heading:136,pitch:2});assert.equal(f.walk.command({action:'forward'}),true);assert.equal(f.walk.getState().date,'');assert.equal(f.walk.getState().supportVisible,false);assert.equal(f.walk.command({action:'forward'}),true);assert.equal(f.requests.length,2);f.reply(1,'2024-07',[{pano:'panels',heading:316,description:'Quiosco'}]);assert.equal(f.walk.getState().pano,'next');assert.equal(f.walk.getState().date,'2024-07');assert.equal(f.walk.getState().steps,1);assert.equal(f.walk.command({action:'link',pano:'invented'}),false);}finally{f.walk.dispose();}
});
test('links_changed cannot inject previous-node links into the new node',()=>{
 const f=fixture();try{f.reply(0);f.p.links=[{pano:'stale',heading:30}];f.walk.command({action:'link',pano:'next'});f.reply(1,'2025-01',[{pano:'panels',heading:316,description:'Back'}]);f.p.links=[{pano:'stale',heading:30}];f.p.fire('links_changed');assert.deepEqual(f.walk.getState().links.map(x=>x.pano),['panels']);}finally{f.walk.dispose();}
});
test('explicit home supersedes pending hop and stale lookup cannot restore old metadata',()=>{
 const f=fixture();try{f.reply(0);f.walk.command({action:'link',pano:'next'});f.walk.command({action:'home'});f.reply(1,'2099-01');assert.equal(f.walk.getState().date,'');f.reply(2);assert.equal(f.walk.getState().pano,'panels');assert.equal(f.walk.getState().steps,0);}finally{f.walk.dispose();}
});
test('native click movement clears overlays immediately and missing metadata date stays unknown',()=>{
 const f=fixture();try{f.reply(0);f.p.setPano('native');assert.equal(f.walk.getState().supportVisible,false);assert.equal(f.walk.getState().links.length,0);f.reply(1,null,[]);assert.equal(f.walk.getState().date,'');assert.equal(f.walk.getState().status,'unavailable');assert.equal(f.walk.getState().steps,1);}finally{f.walk.dispose();}
});
test('isolated front image offers no fabricated walking links and explicit returns are not counted as steps',()=>{
 const f=fixture();try{f.reply(0);f.walk.command({action:'front'});f.reply(1,'2017-11',[]);assert.equal(f.walk.getState().status,'unavailable');assert.equal(f.walk.getState().date,'2017-11');assert.equal(f.walk.getState().steps,0);assert.equal(f.walk.command({action:'backward'}),false);}finally{f.walk.dispose();}
});
test('disposal invalidates service callbacks and removes panorama event listeners',()=>{
 const f=fixture();f.walk.dispose();const n=f.states.length;f.reply(0);f.p.setPano('late');assert.equal(f.states.length,n);assert.equal(f.walk.command({action:'home'}),false);assert.ok(Object.values(f.p.events).every(list=>list.length===0));
});

test('old OK status cannot finish a new panorama before its fresh status_changed',()=>{
 const f=fixture();try{f.reply(0);f.p.setPano=function(pano){this.pano=pano;this.fire('pano_changed');};f.walk.command({action:'link',pano:'next'});f.reply(1,'2024-07');assert.equal(f.walk.getState().status,'loading');assert.equal(f.walk.getState().date,'');f.p.fire('status_changed');assert.equal(f.walk.getState().status,'ready');assert.equal(f.walk.getState().date,'2024-07');}finally{f.walk.dispose();}
});
test('a common neighbour keeps its new service heading when links_changed still carries old geometry',()=>{
 const f=fixture();try{f.reply(0,'2023-03',[{pano:'next',heading:136},{pano:'shared',heading:90}]);f.walk.command({action:'link',pano:'next'});f.reply(1,'2024-07',[{pano:'shared',heading:180}]);f.p.links=[{pano:'shared',heading:90}];f.p.fire('links_changed');assert.equal(f.walk.getState().links[0].heading,180);}finally{f.walk.dispose();}
});

const pause=()=>new Promise(resolve=>setTimeout(resolve,30));
test('held walking follows one real hop at a time and key release during loading ends the chain',async()=>{
 const f=fixture({continuationDelayMs:5});try{
  f.reply(0);f.p.setPov({heading:136,pitch:2});f.walk.command({action:'forward',hold:true});
  for(let i=0;i<10;i++)f.walk.command({action:'forward',hold:true});
  assert.equal(f.requests.length,2);
  f.reply(1,'2023-04',[{pano:'third',heading:136}]);await pause();assert.equal(f.requests.length,3);
  f.walk.command({action:'release'});f.reply(2,'2023-05',[{pano:'fourth',heading:136}]);await pause();
  assert.equal(f.requests.length,3);assert.equal(f.walk.getState().steps,2);
 }finally{f.walk.dispose();}
});
test('tap commands during pending loading coalesce to at most one further hop',async()=>{
 const f=fixture({continuationDelayMs:5});try{
  f.reply(0);f.p.setPov({heading:136,pitch:2});f.walk.command({action:'forward'});
  for(let i=0;i<10;i++)f.walk.command({action:'forward'});
  f.reply(1,'2023-04',[{pano:'third',heading:136}]);await pause();assert.equal(f.requests.length,3);
  f.reply(2,'2023-05',[{pano:'fourth',heading:136}]);await pause();assert.equal(f.requests.length,3);
 }finally{f.walk.dispose();}
});
test('native navigation cancels previously held movement',async()=>{
 const f=fixture({continuationDelayMs:5});try{
  f.reply(0);f.p.setPov({heading:136,pitch:2});f.walk.command({action:'forward',hold:true});
  f.reply(1,'2023-04',[{pano:'third',heading:136}]);f.p.setPano('native');
  f.reply(2,'2023-05',[{pano:'fourth',heading:136}]);await pause();assert.equal(f.requests.length,3);
 }finally{f.walk.dispose();}
});
test('fresh SDK exits augment service links without deleting metadata or reusing old headings',()=>{
 const f=fixture();try{
  f.reply(0);f.p.links=[{pano:'next',heading:130}];f.walk.command({action:'link',pano:'next'});
  f.reply(1,'2023-04',[{pano:'shared',heading:180},{pano:'metadata-only',heading:200}]);
  f.p.links=[{pano:'shared',heading:90},{pano:'sdk-extra',heading:234}];
  f.p.locationPano='panels';f.p.fire('links_changed');assert.equal(f.walk.getState().links.length,2);
  f.p.locationPano='next';f.p.fire('links_changed');
  assert.deepEqual(f.walk.getState().links.map(l=>[l.pano,l.heading]),[['shared',180],['metadata-only',200],['sdk-extra',234]]);
 }finally{f.walk.dispose();}
});
test('selected site home and POV are independent of Vila calibration and no missing front is fabricated',()=>{
 const f=fixture({homePano:'jardinets',homePov:{heading:265,pitch:0,zoom:.9},frontPano:null});try{
  f.reply(0);assert.equal(f.walk.command({action:'front'}),false);
  f.walk.command({action:'home'});assert.equal(f.requests.at(-1).pano,'jardinets');assert.equal(f.p.pov.heading,265);
  f.reply(1);assert.equal(f.walk.getState().supportVisible,false);assert.equal(f.walk.getState().steps,0);
 }finally{f.walk.dispose();}
});

const jesus=['neHfCciaSwwcDYjCqOBBKQ','ChcRiAHJGowOisoZmsbTng','ri33zzkLzbZkkbAEBoWwiQ'];
test('guided Jesús crossing follows two current Google links and counts both real photographic steps',async()=>{
 const f=fixture({initialPano:jesus[0],continuationDelayMs:5});try{
  f.reply(0,'2023-03',[{pano:jesus[1],heading:139.3922}]);f.p.setPov({heading:234,pitch:0});
  assert.equal(f.walk.getState().canEnterJesus,true);assert.equal(f.walk.command({action:'forward'}),false);
  assert.equal(f.walk.command({action:'jesus'}),true);assert.equal(f.p.pov.heading,139.3922);assert.equal(f.walk.getState().routeActive,true);
  f.reply(1,'2023-03',[{pano:jesus[2],heading:256.35852}]);await pause();
  assert.equal(f.p.getPano(),jesus[2]);assert.equal(f.p.pov.heading,256.35852);
  f.reply(2,'2023-03',[{pano:'LfSZ7DvyHTbBUyp649aI3A',heading:230.22261}]);await pause();
  assert.equal(f.walk.getState().steps,2);assert.equal(f.walk.getState().routeActive,false);assert.equal(f.requests.length,3);
 }finally{f.walk.dispose();}
});
test('release during a guided step finishes only that step and never initiates the second',async()=>{
 const f=fixture({initialPano:jesus[0],continuationDelayMs:5});try{
  f.reply(0,'2023-03',[{pano:jesus[1],heading:139}]);f.walk.command({action:'jesus'});f.walk.command({action:'release'});
  f.reply(1,'2023-03',[{pano:jesus[2],heading:256}]);await pause();
  assert.equal(f.requests.length,2);assert.equal(f.walk.getState().steps,1);assert.equal(f.walk.getState().routeActive,false);
 }finally{f.walk.dispose();}
});
test('guided crossing refuses a missing live link instead of synthesizing a second hop',async()=>{
 const f=fixture({initialPano:jesus[0],continuationDelayMs:5});try{
  f.reply(0,'2023-03',[{pano:jesus[1],heading:139}]);f.walk.command({action:'jesus'});
  f.reply(1,'2023-03',[{pano:'other',heading:256}]);await pause();
  assert.equal(f.requests.length,2);assert.equal(f.walk.getState().routeActive,false);
 }finally{f.walk.dispose();}
});
