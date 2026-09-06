const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const OutdoorContext = require('../../js/outdoor-context.js');
const OutdoorSites = require('../../js/outdoor-sites.js');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const bridge = html.split('/* OUTDOOR CHILD BRIDGE START */')[1].split('/* OUTDOOR CHILD BRIDGE END */')[0];
const valid = () => ({siteId:'bcn-kiosk-016',hour:9.75,baseCount:173.5,effectiveCount:121,
  mix:{familias:31,jovenes:29,turistas:13,seniors:27},manual:true,selection:'plaza',
  layers:{crowd:true,buildings:false,roads:true,night:false}});
function fixture(embedded=true,walkMode=false) {
  const listeners={},sent=[],calls={boot:0,refresh:0,stop:0,hide:0,walk:0,surfaceCancel:0,surfaceFocus:[],manual:0};
  const parent={postMessage:(message,origin)=>sent.push({message,origin})};
  const context=vm.createContext({window:{OUTDOOR_EMBED:embedded,parent},location:{origin:'https://admira.tv'},OutdoorContext,OutdoorSites,activeWalkSite:OutdoorSites.get('vila'),bootWalk:async()=>calls.walk++,walkLoadFailure:()=>{},
    addEventListener:(name,fn)=>{listeners[name]=fn;},boot:()=>calls.boot++,refreshFranja:()=>calls.refresh++,
    surfaceFocus:{cancel:()=>calls.surfaceCancel++,focus:(...args)=>calls.surfaceFocus.push(args)},manualSurfaceInteraction:()=>calls.manual++,
    streetWalk:null,WALK_MODE:walkMode,walkBootTimer:null,walkBootFailed:false,walkBootGeneration:0,clearTimeout,stopCam:()=>calls.stop++,hideStreetView:()=>calls.hide++,fmtHm:()=> '09:45',FRANJAS:[{aforo:460}],selFranjaIdx:0,_shotDone:false});
  vm.runInContext(bridge+';installOutdoorChild();',context);
  const dispatch=(data,overrides={})=>listeners.message?.({data,origin:'https://admira.tv',source:parent,...overrides});
  return {context,listeners,sent,calls,dispatch};
}
test('child announces readiness without starting Google before context',()=>{
  const f=fixture();assert.equal(f.calls.boot,0);assert.equal(f.sent.length,1);
  assert.equal(f.sent[0].message.type,'ready');assert.equal(f.sent[0].origin,'https://admira.tv');
});
test('only the same-origin parent can provide a valid context',()=>{
  const f=fixture(),message=OutdoorContext.message('context',valid());
  f.dispatch(message,{origin:'https://other.example'});f.dispatch(message,{source:{}});
  f.dispatch(OutdoorContext.message('context',{...valid(),effectiveCount:-1}));
  assert.equal(f.calls.boot,0);f.dispatch(message);assert.equal(f.calls.boot,1);
});
test('photo uses exact transferred hour, count and profile mix without nearest-franja substitution',()=>{
  const f=fixture();f.dispatch(OutdoorContext.message('context',valid()));
  const audience=vm.runInContext('currentAudience()',f.context);
  assert.equal(audience.h,9.75);assert.equal(audience.aforo,121);assert.equal(audience.baseCount,173.5);
  assert.equal(audience.manual,true);assert.deepEqual({...audience.mix},valid().mix);
  assert.equal(vm.runInContext('outdoorContext.selection',f.context),'plaza');
});
test('new context updates the existing renderer without a second boot',()=>{
  const f=fixture();f.dispatch(OutdoorContext.message('context',valid()));
  f.dispatch(OutdoorContext.message('context',{...valid(),effectiveCount:49}));
  assert.equal(f.calls.boot,1);assert.equal(f.calls.refresh,1);
  assert.equal(vm.runInContext('currentAudience().aforo',f.context),49);
});
test('stop cancels camera/panorama and refuses delayed context restarts',()=>{
  const f=fixture();f.dispatch(OutdoorContext.message('stop'));
  f.dispatch(OutdoorContext.message('context',valid()));
  assert.equal(f.calls.stop,1);assert.equal(f.calls.hide,1);assert.equal(f.calls.boot,0);assert.equal(f.calls.surfaceCancel,1);
  assert.equal(vm.runInContext('_shotDone',f.context),true);
});
test('Escape closes child through the exact parent origin and cancels rendering intent',()=>{
  const f=fixture();let prevented=false;
  f.listeners.keydown({key:'Escape',preventDefault:()=>prevented=true});
  assert.equal(prevented,true);assert.equal(f.calls.stop,1);
  assert.equal(f.sent.at(-1).message.type,'close');assert.equal(f.sent.at(-1).origin,'https://admira.tv');
});
test('top-level BEST does not install an embedded renderer',()=>{
  const f=fixture(false);assert.equal(f.sent.length,0);assert.equal(f.calls.boot,0);assert.equal(f.listeners.message,undefined);
});

test('site selection before context does not start Google; selecting later keeps audience origin intact',()=>{
 const f=fixture(true,true);
 f.dispatch(OutdoorContext.message('walk-command',{action:'site',siteId:'jardinets'}));
 assert.equal(f.context.activeWalkSite.id,'jardinets');assert.equal(f.calls.walk,0);assert.equal(f.calls.boot,0);
 f.dispatch(OutdoorContext.message('context',valid()));
 f.dispatch(OutdoorContext.message('walk-command',{action:'site',siteId:'vila'}));
 assert.equal(f.calls.walk,1);assert.equal(vm.runInContext('outdoorContext.siteId',f.context),'bcn-kiosk-016');
 assert.equal(vm.runInContext('currentAudience().aforo',f.context),121);
});
