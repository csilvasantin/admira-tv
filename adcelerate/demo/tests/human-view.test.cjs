const {test}=require('node:test');
const assert=require('node:assert/strict');
const {relativeTarget,dateLabel}=require('../js/human-view.js');

test('radar is anchored to the verified kiosk node, with no invented map position',()=>{
  const t=relativeTarget({lat:41.4002641,lng:2.1573332},0);
  assert.equal(t.distance,0);assert.equal(t.x,50);assert.equal(t.y,50);
  assert.equal(relativeTarget(null,20),null);
});
test('radar turns with the actual panorama heading and keeps geodesic distance',()=>{
  const position={lat:41.4002641-20/111320,lng:2.1573332};
  const forward=relativeTarget(position,0),backward=relativeTarget(position,180);
  assert.ok(Math.abs(forward.distance-20)<.001);
  assert.ok(forward.y<50);assert.ok(backward.y>50);
  assert.ok(Math.abs(forward.distance-backward.distance)<.001);
});
test('distant kiosk stays on the radar edge without reporting a shortened distance',()=>{
  const t=relativeTarget({lat:41.3902641,lng:2.1573332},0);
  assert.ok(t.distance>1100);assert.ok(Math.abs(Math.hypot(t.x-50,t.y-50)-39)<.001);
});
test('panorama date uses only valid returned metadata, never a default historic label',()=>{
  assert.equal(dateLabel('2023-03'),'marzo de 2023');
  assert.equal(dateLabel('2017-11'),'noviembre de 2017');
  for(const date of ['', '2023-13', 'unavailable', '<b>2023</b>'])
    assert.equal(dateLabel(date),'Fecha de imagen no disponible');
});

function hudHarness(t,withButtons=false){
  const {create}=require('../js/human-view.js');
  const elements=new Map(),keys={};
  const node=()=>({classList:{add(){},remove(){},toggle(){}},style:{},dataset:{},textContent:'',replacements:0,
    events:{},setAttribute(){},addEventListener(event,fn){this.events[event]=fn;},focus(){this.focused=true;},replaceChildren(...children){this.children=children;this.replacements++;}});
  const element=node();element.querySelector=id=>{if(!elements.has(id))elements.set(id,node());return elements.get(id);};
  element.controls=withButtons?['forward','backward'].map(action=>{const button=node();button.dataset.walk=action;button.tagName='BUTTON';button.owner=element;return button;}):[];
  element.querySelectorAll=()=>element.controls;
  element.contains=target=>target.owner===element;
  const prevDocument=global.document,prevEvents=global.addEventListener;
  global.document={createElement:node};global.addEventListener=(event,fn)=>{keys[event]=fn;};
  t.after(()=>{global.document=prevDocument;global.addEventListener=prevEvents;});
  const sent=[];
  const hud=create({element,send:x=>sent.push(x),onExit(){},onInspect(){}});
  return {element,elements,keys,sent,hud};
}
test('human entry immediately owns keyboard focus without capturing editable controls',t=>{
  const h=hudHarness(t);h.hud.enter();assert.equal(h.element.focused,true);assert.equal(h.element.tabIndex,-1);
  const e={key:'w',target:{tagName:'DIV'},preventDefault(){}};h.keys.keydown(e);
  assert.deepEqual(h.sent,[{action:'forward',hold:true}]);
  h.keys.keydown({...e,target:{tagName:'INPUT'}});assert.equal(h.sent.length,1);
  h.keys.keyup({key:'w'});assert.deepEqual(h.sent.at(-1),{action:'release'});
  h.hud.leave();const sent=h.sent.length;h.keys.keydown(e);assert.equal(h.sent.length,sent);
});
test('turning the panorama does not replace focused route buttons',t=>{
  const h=hudHarness(t);h.hud.enter();
  const state={status:'ready',pano:'a',heading:40,date:'2023-03',position:null,
    links:[{pano:'b',heading:80,description:'Calle'}],steps:0,supportVisible:false};
  h.hud.setState(state);
  const routes=h.elements.get('#human-routes'),button=routes.children[0],count=routes.replacements;
  h.hud.setState({...state,heading:90});
  assert.equal(routes.replacements,count);assert.equal(routes.children[0],button);
});


test('W works after a HUD button receives focus; native Enter and editable keys remain untouched',t=>{
  const h=hudHarness(t);h.hud.enter();
  const target={tagName:'BUTTON',owner:h.element};let prevented=0;
  const key=key=>({key,target,preventDefault(){prevented++;}});
  h.keys.keydown(key('w'));assert.deepEqual(h.sent.at(-1),{action:'forward',hold:true});
  h.keys.keyup(key('w'));assert.deepEqual(h.sent.at(-1),{action:'release'});
  const count=h.sent.length,prior=prevented;
  h.keys.keydown(key('Enter'));h.keys.keydown(key(' '));
  h.keys.keydown({...key('w'),ctrlKey:true});
  h.keys.keydown({...key('w'),target:{tagName:'SELECT'}});
  assert.equal(h.sent.length,count);assert.equal(prevented,prior);
});
test('holding the on-screen advance button sends one held intent and release without a duplicate click',t=>{
  const h=hudHarness(t,true);h.hud.enter();const button=h.element.controls[0];button.disabled=false;
  button.events.pointerdown({button:0,pointerId:1,preventDefault(){}});
  button.events.pointerup({pointerId:1});button.events.click({detail:1});
  assert.deepEqual(h.sent,[{action:'forward',hold:true},{action:'release'}]);
  button.events.click({detail:0});assert.deepEqual(h.sent.at(-1),{action:'forward'});
});

test('held pointer remains releasable during loading and window pointerup prevents another hop',t=>{
  const h=hudHarness(t,true);h.hud.enter();const button=h.element.controls[0];
  const ready={status:'ready',pano:'a',heading:40,date:'2023-03',position:null,links:[{pano:'b',heading:80,description:'Calle'}],steps:0,supportVisible:false};
  h.hud.setState(ready);button.events.pointerdown({button:0,pointerId:2,preventDefault(){}});
  h.hud.setState({...ready,status:'loading',links:[]});
  assert.equal(button.disabled,false,'active pointer can still release the held button');
  h.keys.pointerup({pointerId:2});assert.deepEqual(h.sent.at(-1),{action:'release'});
  assert.equal(button.disabled,true,'unheld movement is disabled until the current image is ready');
  h.hud.setState(ready);button.events.pointerdown({button:0,pointerId:3,preventDefault(){}});
  button.events.lostpointercapture({pointerId:3});assert.deepEqual(h.sent.at(-1),{action:'release'});
});

test('Jardinets never inherits Vila audience or recommendation and returning restores the same simulation',t=>{
  const h=hudHarness(t);const sites=require('../js/outdoor-sites.js');h.hud.enter();
  const context={siteId:'bcn-kiosk-016',effectiveCount:460,baseCount:460,hour:18,manual:false,
    mix:{familias:25,jovenes:40,turistas:20,seniors:15}};
  h.hud.updateAudience(context,{familias:'Familias',jovenes:'Jóvenes',turistas:'Turistas',seniors:'Seniors'},'Creatividad B');
  assert.equal(h.elements.get('#human-audience').textContent,460);
  h.hud.setSite(sites.get('jardinets'));
  assert.equal(h.elements.get('#human-audience').textContent,'—');
  assert.equal(h.elements.get('#human-audience-label').textContent,'Audiencia pendiente de conectar');
  assert.equal(h.elements.get('#human-recommendation').textContent,'');
  assert.equal(h.elements.get('#human-time').textContent,'');
  assert.equal(h.elements.get('#human-target-label').textContent,'PUNTO DE VISITA');
  assert.equal(h.elements.get('#human-site-name').textContent,'Quiosco de Jardinets');
  h.hud.setSite(sites.get('vila'));
  assert.equal(h.elements.get('#human-audience').textContent,460);
  assert.equal(h.elements.get('#human-recommendation').textContent,'Creatividad B');
});
test('radar follows the selected destination rather than the fixed Vila origin',()=>{
  const sites=require('../js/outdoor-sites.js'),visit=sites.get('jardinets').position;
  assert.equal(relativeTarget(visit,265,visit).distance,0);
  assert.ok(relativeTarget(visit,265,sites.get('vila').position).distance>200);
});

test('a route target changes the destination and radar without lending Vila audience to Jardinets',t=>{
  const h=hudHarness(t),sites=require('../js/outdoor-sites.js');h.hud.enter('vila');
  h.hud.updateAudience({siteId:'bcn-kiosk-016',effectiveCount:460,baseCount:460,hour:18,manual:false,mix:{familias:25,jovenes:40,turistas:20,seniors:15}},{familias:'Familias',jovenes:'Jóvenes',turistas:'Turistas',seniors:'Seniors'},'Demo Vila');
  h.hud.setState({status:'ready',pano:'on-street',heading:180,date:'2023-03',position:sites.get('vila').position,links:[],steps:4,supportVisible:false});
  h.hud.setRouteTarget('jardinets');
  assert.equal(h.elements.get('#human-site-select').value,'jardinets');
  assert.equal(h.elements.get('#human-target-label').textContent,'HACIA JARDINETS');
  assert.notEqual(h.elements.get('#human-distance').textContent,'0 m aprox.');
  assert.equal(h.elements.get('#human-audience').textContent,460);
  assert.match(h.elements.get('#human-audience-label').textContent,/Vila de Gràcia/);
  assert.equal(h.elements.get('#human-site-name').textContent,'Quiosco News & Coffee');
  h.hud.setRouteTarget(null);
  assert.equal(h.elements.get('#human-site-select').value,'vila');assert.equal(h.elements.get('#human-distance').textContent,'0 m aprox.');
});

test('Lesseps appears as a third destination with its own empty audience state and can be the initial visit',t=>{
  const h=hudHarness(t);h.hud.enter('lesseps');
  assert.deepEqual(h.elements.get('#human-site-select').children.map(option=>option.value),['vila','jardinets','lesseps']);
  assert.equal(h.elements.get('#human-site-select').value,'lesseps');assert.equal(h.elements.get('#human-site-name').textContent,'Quiosco de Lesseps');
  h.hud.updateAudience({siteId:'bcn-kiosk-016',effectiveCount:460,baseCount:460,hour:18,manual:false,mix:{familias:25,jovenes:40,turistas:20,seniors:15}},{},'Vila only');
  assert.equal(h.elements.get('#human-audience').textContent,'—');assert.equal(h.elements.get('#human-time').textContent,'');
  assert.equal(h.elements.get('#human-audience-label').textContent,'Audiencia pendiente de conectar');assert.equal(h.elements.get('#human-recommendation').textContent,'');
});
