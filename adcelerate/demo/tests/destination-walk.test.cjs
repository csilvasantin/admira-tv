const {test}=require('node:test'),assert=require('node:assert/strict');
const DestinationWalk=require('../js/destination-walk.js'),routes=require('../js/urban-route.js'),sites=require('../js/outdoor-sites.js');
const context=require('../js/outdoor-context.js');
const JARDINETS=sites.get('jardinets').entry.pano,STARBUCKS=sites.get('starbucks').entry.pano;
function fixture(){
  const sent=[],states=[];
  const walk=DestinationWalk.create({findRoute:routes.find,sendRoute:c=>sent.push(context.validateRouteCommand(c)),onChange:s=>states.push(s)});
  return {walk,sent,states,event(status,extra={}){const s=walk.getState(),route=routes.get(s.routeId);
    return {requestId:s.requestId,routeId:s.routeId,status,step:s.step,total:route.panos.length-1,pano:route.panos[s.step],...extra};}};
}
test('choosing Starbucks on foot at Jardinets walks the catalogued route to its entrance photograph',()=>{
  const f=fixture();assert.equal(f.walk.start('starbucks',JARDINETS,{speed:8}),true);
  const route=routes.get('jardinets-starbucks');
  assert.deepEqual(f.sent,[{action:'start',routeId:route.id,requestId:f.walk.getState().requestId,speed:8}]);
  assert.deepEqual({...f.states.at(-1),requestId:0},{status:'travelling',routeId:route.id,siteId:'starbucks',fromSiteId:'jardinets',requestId:0,step:0,total:route.panos.length-1,speed:8,reason:null});
  for(let step=1;step<route.panos.length-1;step++)assert.equal(f.walk.accept(f.event('walking',{step,pano:route.panos[step]})),true);
  assert.equal(f.walk.getState().step,route.panos.length-2);assert.equal(f.walk.isActive(),true);
  assert.equal(f.walk.accept(f.event('ready',{step:route.panos.length-1,pano:STARBUCKS})),true);
  assert.equal(f.walk.getState().status,'arrived');assert.equal(f.walk.isActive(),false);
  // Arrival releases the walker, so the shop door and the sign overlays come back.
  assert.deepEqual(f.sent.at(-1),{action:'cancel',routeId:route.id,requestId:f.walk.getState().requestId});
  // Its late «cancelled» answer is swallowed here and never reaches the tour.
  const count=f.states.length;assert.equal(f.walk.accept(f.event('cancelled',{reason:'cancel'})),true);
  assert.equal(f.states.length,count);assert.equal(f.walk.getState().status,'arrived');
});
test('Vila walks to Starbucks and Starbucks walks back to either kiosk',()=>{
  for(const [from,to] of [['vila','starbucks'],['starbucks','jardinets'],['starbucks','vila']]){
    const f=fixture();assert.equal(f.walk.start(to,sites.get(from).entry.pano),true,from+' → '+to);
    assert.equal(f.sent[0].routeId,from+'-'+to);assert.equal(f.sent[0].speed,1);
  }
});
test('with no catalogued route from the current photograph, or already there, the caller keeps the direct jump',()=>{
  const f=fixture();
  assert.equal(f.walk.start('starbucks','a-photograph-off-every-route'),false);
  assert.equal(f.walk.start('starbucks',''),false);assert.equal(f.walk.start('starbucks',null),false);
  assert.equal(f.walk.start('lesseps',STARBUCKS),false,'no catalogued Starbucks → Lesseps walk');
  assert.equal(f.walk.start('jardinets',JARDINETS),false,'already at the destination photograph');
  assert.deepEqual(f.sent,[]);assert.deepEqual(f.states,[]);assert.equal(f.walk.getState().status,'idle');
});
test('request identifiers live apart from the tour, so its route events are never taken',()=>{
  const f=fixture();f.walk.start('starbucks',JARDINETS);
  assert.ok(f.walk.getState().requestId>1e9);
  const tourEvent={requestId:3,routeId:'jardinets-lesseps',status:'walking',step:1,total:116,pano:routes.get('jardinets-lesseps').panos[1]};
  assert.equal(f.walk.accept(tourEvent),false);assert.equal(f.walk.accept({...f.event('walking'),requestId:3}),false);
  assert.equal(f.walk.accept(null),false);
  const first=f.walk.getState().requestId;f.walk.cancel();f.walk.start('starbucks',JARDINETS);
  assert.equal(f.walk.getState().requestId,first+1);
});
test('taking control stops the walk; Google arrows count as control and only real failures ask for a direct jump',()=>{
  let f=fixture();f.walk.start('starbucks',JARDINETS);
  assert.equal(f.walk.cancel('manual'),true);assert.equal(f.walk.cancel('manual'),false,'one cancel only');
  assert.equal(f.sent.at(-1).action,'cancel');assert.deepEqual([f.states.at(-1).status,f.states.at(-1).reason],['cancelled','manual']);
  f=fixture();f.walk.start('starbucks',JARDINETS);f.walk.accept(f.event('error',{reason:'manual'}));
  assert.deepEqual([f.walk.getState().status,f.walk.getState().reason],['cancelled','manual']);
  f=fixture();f.walk.start('starbucks',JARDINETS);f.walk.accept(f.event('error',{reason:'missing-link'}));
  assert.deepEqual([f.walk.getState().status,f.walk.getState().reason],['error','missing-link']);
  f=fixture();f.walk.start('starbucks',JARDINETS);f.walk.accept(f.event('cancelled',{reason:'cancel'}));
  assert.deepEqual([f.walk.getState().status,f.walk.getState().reason],['cancelled','cancel']);
});
test('the speed of a walk in progress follows the Paseo multiplier, bound to its own request',()=>{
  const f=fixture();assert.equal(f.walk.setSpeed(4),true);assert.deepEqual(f.sent,[],'nothing to update while idle');
  f.walk.start('starbucks',JARDINETS,{speed:2});const {requestId}=f.walk.getState();
  assert.equal(f.walk.setSpeed(8),true);assert.deepEqual(f.sent.at(-1),{action:'speed',routeId:'jardinets-starbucks',requestId,speed:8});
  for(const speed of [0,3,'8',NaN])assert.equal(f.walk.setSpeed(speed),false);
  assert.equal(f.walk.getState().speed,8);
  f.walk.start('vila',STARBUCKS,{speed:3});assert.equal(f.walk.getState().speed,1,'unsupported multipliers fall back to ×1');
  assert.deepEqual(f.sent.slice(-2).map(c=>c.action),['cancel','start'],'a new destination replaces the old walk');
});
