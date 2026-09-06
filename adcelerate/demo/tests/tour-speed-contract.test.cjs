const {test}=require('node:test'),assert=require('node:assert/strict');
const context=require('../js/outdoor-context.js'),routes=require('../js/urban-route.js');
test('speed updates are bounded and bound to the exact route, frame and request',()=>{
  const route=routes.all[0],frame={},origin='https://admira.tv';
  const accepts=payload=>context.accepts({origin,source:frame,data:context.message('route-command',payload)},frame,origin);
  for(const speed of [1,2,4,6,8])assert.ok(accepts({action:'speed',routeId:route.id,requestId:7,speed}));
  for(const speed of [0,3,10,Infinity,NaN,'8',null,undefined])assert.equal(accepts({action:'speed',routeId:route.id,requestId:7,speed}),false);
  assert.equal(accepts({action:'speed',routeId:'fake',requestId:7,speed:2}),false);
  const state={routeId:route.id,requestId:7,status:'walking',step:0,total:route.panos.length-1,pano:route.panos[0],speed:8};
  assert.equal(context.validateRouteState(state).speed,8);assert.equal(context.validateRouteState({...state,speed:3}),null);
  const wrong={source:{},origin,data:context.message('route-command',{action:'speed',routeId:route.id,requestId:7,speed:8})};assert.equal(context.accepts(wrong,frame,origin),false);
});
test('speed and explicit direct deep links persist only the supported values',()=>{
  assert.match(context.bestEntry('?tour=dooh&travel=walk&speed=8',false),/speed=8/);
  assert.match(context.bestEntry('?tour=dooh&travel=direct&speed=4',false),/travel=direct/);
  for(const speed of ['3','0','NaN','Infinity','2.5'])assert.doesNotMatch(context.bestEntry('?tour=dooh&speed='+speed,false),/speed=/);
});
