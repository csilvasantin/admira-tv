const {test}=require('node:test');const assert=require('node:assert/strict');
const routes=require('../js/urban-route.js'),context=require('../js/outdoor-context.js');
const evidence=require('../data/urban-route-evidence.json');
const sites=require('../js/outdoor-sites.js'),surfaces=require('../js/dooh-surfaces.js');
test('eight directed paths join the visit photographs and match their verified step evidence',()=>{
  assert.deepEqual(routes.all.map(r=>r.id),['vila-jardinets','jardinets-lesseps','lesseps-vila','jardinets-vila',
    'jardinets-starbucks','starbucks-jardinets','vila-starbucks','starbucks-vila']);
  for(const route of routes.all){
    const proof=evidence.routes.find(r=>r.id===route.id);assert.deepEqual(route.panos,proof.panos);
    assert.deepEqual([...route.handoffs],proof.handoffs);assert.equal(proof.steps.length,route.panos.length-1);
    assert.equal(route.panos[0],sites.get(route.fromSiteId).entry.pano);assert.equal(route.panos.at(-1),sites.get(route.toSiteId).entry.pano);
    // A kiosk arrival is a calibrated screen pose; Starbucks has no screen and arrives at its entrance photograph.
    if(surfaces.all.some(s=>s.siteId===route.toSiteId))
      assert.ok(surfaces.all.some(s=>s.siteId===route.toSiteId&&surfaces.hasPose(s.id,route.panos.at(-1))),`calibrated arrival for ${route.id}`);
    proof.steps.forEach((step,i)=>{
      assert.equal(step.from,route.panos[i]);assert.equal(step.to,route.panos[i+1]);
      const destination=evidence.nodes[step.to];assert.equal(destination.status,'OK');assert.equal(destination.date,step.date);
      if(route.handoffs.includes(i)){
        // Same spot, another photograph: only at either end and never counted as a walking step.
        assert.equal(step.handoff,true);assert.ok(i===0||i===route.panos.length-2);assert.ok(step.metres>=0&&step.metres<=10);
      }else{
        const link=evidence.nodes[step.from].links.find(link=>link.pano===step.to);
        assert.ok(link,`Google link ${step.from} → ${step.to}`);assert.equal(link.heading,step.heading);
        assert.ok(step.metres>0&&step.metres<35);assert.ok(destination.date>='2022',`recent linked view ${step.to}`);
      }
    });
    assert.ok(route.panos.length-1-route.handoffs.length>=20,`${route.id} is a walk, not a jump`);
    const middle=route.panos[Math.floor(route.panos.length/2)];
    assert.equal(routes.find(middle,route.toSiteId)?.id,route.id);
  }
  const observation=evidence.observations[0];
  assert.deepEqual(observation.routeIds,routes.all.map(r=>r.id));assert.deepEqual(observation.errors,[]);
  assert.equal(observation.checkedEdges,routes.all.reduce((n,r)=>n+r.panos.length-1,0));
});
test('the tour circuit Vila → Jardinets → Lesseps → Vila is closed from each calibrated photograph',()=>{
  for(const [from,to,id] of [['vila','jardinets','vila-jardinets'],['jardinets','lesseps','jardinets-lesseps'],['lesseps','vila','lesseps-vila']])
    assert.equal(routes.find(sites.get(from).entry.pano,to)?.id,id);
  // The arrival at Vila is the panel photograph itself, reached by an explicit catalogued handoff.
  const back=routes.get('lesseps-vila');assert.equal(back.panos.at(-1),'2NoSvJbqMCZ0RXhR8pTSLA');assert.ok(back.handoffs.includes(back.panos.length-2));
});
test('«Destino» reaches the Starbucks entrance photograph on foot from Jardinets and from Vila, and walks back',()=>{
  assert.equal(sites.get('starbucks').entry.pano,'bNZ9QjiL55gYQ2iyOhSqMw');assert.ok(!surfaces.all.some(s=>s.siteId==='starbucks'));
  for(const [from,to] of [['jardinets','starbucks'],['vila','starbucks'],['starbucks','jardinets'],['starbucks','vila']]){
    const route=routes.find(sites.get(from).entry.pano,to);
    assert.equal(route?.id,from+'-'+to);assert.equal(route.panos.at(-1),sites.get(to).entry.pano);
  }
  // The Starbucks routes leave the tour circuit untouched: from each kiosk the tour still finds its own leg.
  assert.equal(routes.find(sites.get('jardinets').entry.pano,'vila')?.id,'jardinets-vila');
  assert.equal(routes.find(sites.get('vila').entry.pano,'jardinets')?.id,'vila-jardinets');
});
test('handoffs are rejected in the middle of a route or when they replace the whole walk',()=>{
  const base={id:'r',fromSiteId:'vila',toSiteId:'jardinets',panos:['a','b','c','d']};
  assert.ok(routes.create([{...base,handoffs:[0,2]}]));assert.ok(routes.create([base]).all[0].handoffs.length===0);
  for(const handoffs of [[1],[0,0],[3],['0'],'0'])assert.throws(()=>routes.create([{...base,handoffs}]),/Invalid urban route/);
  assert.throws(()=>routes.create([{...base,panos:['a','b'],handoffs:[0]}]),/Invalid urban route/);
});
test('route and audio messages require current frame, bounded fields and catalogued destinations',()=>{
  const frame={},origin='https://admira.tv',route=routes.all[0];
  const accepts=(type,payload,source=frame)=>context.accepts({source,origin,data:context.message(type,payload)},frame,origin);
  const command={action:'start',routeId:route.id,requestId:7};assert.ok(accepts('route-command',command));assert.equal(accepts('route-command',command,{}),false);
  assert.equal(accepts('route-command',{...command,routeId:'invented-street'}),false);
  const total=route.panos.length-1,state={routeId:route.id,requestId:7,status:'walking',step:1,total,pano:route.panos[1]};
  assert.ok(accepts('route-state',state));for(const extra of [{step:-1},{step:total+1},{total:total-1},{requestId:NaN}])assert.equal(accepts('route-state',{...state,...extra}),false);
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
