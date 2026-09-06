const {test}=require('node:test');const assert=require('node:assert/strict');
const routes=require('../js/urban-route.js'),context=require('../js/outdoor-context.js');
const evidence=require('../data/urban-route-evidence.json');
test('all three directed paths match the observed Google edges, including the connected return viewpoint',()=>{
  assert.equal(routes.all.length,3);
  assert.deepEqual(routes.all.map(r=>r.panos.length-1),[40,39,39]);
  for(const route of routes.all){const proof=evidence.routes.find(r=>r.id===route.id);assert.deepEqual(route.panos,proof.panos);
    proof.steps.forEach((step,i)=>{assert.equal(step.from,route.panos[i]);assert.equal(step.to,route.panos[i+1]);assert.ok(step.metres<16);assert.ok(Number.isFinite(step.heading));assert.ok(/^202[36]-/.test(step.date));});}
  const back=routes.get('jardinets-vila-connected');assert.equal(back.panos.at(-1),'xyBUNhtkdE7tUUGrvRPwmA');
  assert.notEqual(back.panos.at(-1),'2NoSvJbqMCZ0RXhR8pTSLA');
});
test('route and audio messages require current frame, bounded fields and catalogued destinations',()=>{
  const frame={},origin='https://admira.tv',route=routes.all[0];
  const accepts=(type,payload,source=frame)=>context.accepts({source,origin,data:context.message(type,payload)},frame,origin);
  const command={action:'start',routeId:route.id,requestId:7};assert.ok(accepts('route-command',command));assert.equal(accepts('route-command',command,{}),false);
  assert.equal(accepts('route-command',{...command,routeId:'invented-street'}),false);
  const state={routeId:route.id,requestId:7,status:'walking',step:1,total:40,pano:route.panos[1]};
  assert.ok(accepts('route-state',state));for(const extra of [{step:-1},{step:41},{total:39},{requestId:NaN}])assert.equal(accepts('route-state',{...state,...extra}),false);
  const audio={action:'enable',screenId:'vila-left',requestId:8,volume:.35};assert.ok(accepts('audio-command',audio));
  for(const extra of [{volume:Infinity},{volume:-.1},{screenId:'unknown'},{action:'autoplay'}])assert.equal(accepts('audio-command',{...audio,...extra}),false);
  assert.ok(accepts('audio-state',{screenId:'vila-left',requestId:8,status:'blocked',volume:.35}));
});
test('walking focus explicitly preserves the current panorama and deep links preserve the selected travel mode',()=>{
  const focus={action:'focus',surfaceId:'vila-left',requestId:1,preservePano:true};assert.deepEqual(context.validateSurfaceCommand(focus),focus);
  assert.equal(context.validateSurfaceCommand({...focus,preservePano:'yes'}),null);
  assert.match(context.bestEntry('?tour=dooh&travel=walk',false),/travel=walk/);
  assert.doesNotMatch(context.bestEntry('?tour=dooh&travel=anything',false),/travel=/);
});
