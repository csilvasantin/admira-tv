const {test}=require('node:test');const assert=require('node:assert/strict');
const routes=require('../js/urban-route.js'),context=require('../js/outdoor-context.js');
const evidence=require('../data/urban-route-evidence.json');
test('all five directed paths preserve the existing circuit and match their verified step evidence',()=>{
  assert.equal(routes.all.length,5);
  assert.deepEqual(routes.all.slice(0,3).map(r=>r.panos.length-1),[40,39,39]);
  for(const route of routes.all){
    const proof=evidence.routes.find(r=>r.id===route.id);assert.deepEqual(route.panos,proof.panos);
    assert.equal(proof.steps.length,route.panos.length-1);
    proof.steps.forEach((step,i)=>{
      assert.equal(step.from,route.panos[i]);assert.equal(step.to,route.panos[i+1]);
      assert.ok(step.metres>0&&step.metres<25);assert.ok(Number.isFinite(step.heading));
    });
  }
  const back=routes.get('jardinets-vila-connected');assert.equal(back.panos.at(-1),'xyBUNhtkdE7tUUGrvRPwmA');
  assert.notEqual(back.panos.at(-1),'2NoSvJbqMCZ0RXhR8pTSLA');
});
test('Lesseps completes the directed walking circuit without a hidden return to the original Vila photo',()=>{
  const outward=routes.get('jardinets-lesseps'),back=routes.get('lesseps-vila-connected');
  assert.deepEqual([outward.panos.length-1,back.panos.length-1],[137,98]);
  assert.equal(outward.panos[0],'L6xcO37SQfBmCxsT9lPdjQ');
  assert.equal(outward.panos.at(-1),'FSGuPbr-GnVq2_FxQVLfkg');
  assert.equal(back.panos[0],outward.panos.at(-1));
  assert.equal(back.panos.at(-1),routes.get('vila-connected-jardinets').panos[0]);
  for(const route of [outward,back]){
    assert.equal(new Set(route.panos).size,route.panos.length);
    const proof=evidence.routes.find(r=>r.id===route.id);
    for(const step of proof.steps){
      const source=evidence.nodes[step.from],destination=evidence.nodes[step.to];
      const link=source.links.find(link=>link.pano===step.to);
      assert.ok(link,`Google link ${step.from} → ${step.to}`);
      assert.equal(link.heading,step.heading);assert.equal(destination.date,step.date);
      assert.ok(destination.date>='2022',`recent linked view ${step.to}`);
    }
    const middle=route.panos[Math.floor(route.panos.length/2)];
    assert.equal(routes.find(middle,route.toSiteId)?.id,route.id);
  }
  const observation=evidence.observations.find(o=>o.routeIds.includes(outward.id));
  assert.equal(observation.checkedEdges,235);assert.deepEqual(observation.errors,[]);
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
