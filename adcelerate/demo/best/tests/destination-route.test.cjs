const{test}=require('node:test'),assert=require('node:assert/strict'),Route=require('../route-walk.js');
const routes=require('../../js/urban-route.js'),sites=require('../../js/outdoor-sites.js'),evidence=require('../../data/urban-route-evidence.json');
function fakeClock(){let time=0,id=0;const tasks=new Map();return{now:()=>time,setTimeout(fn,ms){const key=++id;tasks.set(key,{fn,at:time+ms});return key},clearTimeout:key=>tasks.delete(key),advance(ms){const target=time+ms;let guard=0;while(true){const due=[...tasks].filter(([,t])=>t.at<=target).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;assert.ok(++guard<100000);time=due[1].at;tasks.delete(due[0]);due[1].fn();}time=target;}}}
// The walker answers each hop with the recorded metadata of its target, after a native transition time.
function replay(routeId,speed,loadMs=350){
  const timer=fakeClock(),route=routes.get(routeId),commands=[],events=[],hopTimes=[],arrivals=[];
  const view=pano=>({status:'ready',pano,links:evidence.nodes[pano].links.map(l=>({pano:l.pano,heading:l.heading}))});
  let state=view(route.panos[0]);
  const walker={getState:()=>state,command(c){
    commands.push(c);hopTimes.push(timer.now());
    if(['link','handoff'].includes(c.action)){state={status:'loading',pano:c.pano,links:[]};timer.setTimeout(()=>{state=view(c.pano);controller.observe(state);},loadMs);}
    return true;}};
  const controller=Route.create({timer,getRoute:id=>routes.get(id),getWalker:()=>walker,onState:e=>events.push(e),onArrival:r=>arrivals.push(r.id)});
  assert.equal(controller.start(routeId,1e9+1,{speed}),true);
  timer.advance(route.panos.length*5000);
  return {route,commands,events,hopTimes,arrivals};
}
test('Jardinets → Starbucks reaches the entrance photograph with no cut at ×1 and ×8',()=>{
  for(const speed of [1,8]){
    const {route,commands,events,hopTimes,arrivals}=replay('jardinets-starbucks',speed);
    assert.equal(events.at(-1).status,'ready',`×${speed}`);assert.equal(events.at(-1).pano,'bNZ9QjiL55gYQ2iyOhSqMw');
    assert.ok(!events.some(e=>['error','cancelled'].includes(e.status)),`no cut at ×${speed}`);
    assert.deepEqual(arrivals,['jardinets-starbucks']);
    // Every walking step is a recorded Google link; the only photograph change without one is the catalogued handoff.
    const hops=commands.filter(c=>['link','handoff'].includes(c.action));
    assert.deepEqual(hops.map(c=>c.pano),route.panos.slice(1));
    hops.forEach((c,i)=>assert.equal(c.action,route.handoffs.includes(i)?'handoff':'link'));
    // ×8 shortens only the readable pause: Google's native transition keeps its 600 ms between hops.
    hopTimes.slice(1).forEach((t,i)=>assert.ok(t-hopTimes[i]>=600,`hop ${i+1} at ×${speed}`));
  }
});
test('the other Starbucks walks arrive at the visit photograph of their destination',()=>{
  for(const id of ['vila-starbucks','starbucks-jardinets','starbucks-vila']){
    const {route,events}=replay(id,8);
    assert.equal(events.at(-1).status,'ready',id);assert.equal(events.at(-1).pano,sites.get(route.toSiteId).entry.pano);
  }
});
