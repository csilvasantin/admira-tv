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

function hudHarness(t){
  const {create}=require('../js/human-view.js');
  const elements=new Map(),keys={};
  const node=()=>({classList:{add(){},remove(){},toggle(){}},style:{},dataset:{},textContent:'',replacements:0,
    setAttribute(){},addEventListener(){},focus(){this.focused=true;},replaceChildren(...children){this.children=children;this.replacements++;}});
  const element=node();element.querySelector=id=>{if(!elements.has(id))elements.set(id,node());return elements.get(id);};
  element.querySelectorAll=()=>[];
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
  assert.deepEqual(h.sent,[{action:'forward'}]);
  h.keys.keydown({...e,target:{tagName:'INPUT'}});assert.equal(h.sent.length,1);
  h.hud.leave();h.keys.keydown(e);assert.equal(h.sent.length,1);
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
