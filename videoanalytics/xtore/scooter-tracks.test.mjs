import test from 'node:test';
import assert from 'node:assert/strict';
import {ScooterTrackMarks,installScooterTracks,SCOOTER_TRACK_MEMORY} from './scooter-tracks.mjs';

const observation=(id,at,extra={})=>({trackId:id,class:'person',confirmed:true,observedAt:at,ageMs:0,bbox:[.1,.2,.12,.3],score:.9,...extra});
function fixture(){let at=1000;const events=[];const model=new ScooterTrackMarks({now:()=>at,onConfirm:items=>events.push(...items)});return {model,events,get at(){return at;},advance:ms=>{at+=ms;}};}

test('only a fresh confirmed real person, bike or motorcycle may be marked',()=>{
  const f=fixture();
  const bad=[observation(1,f.at,{class:'car'}),observation(2,f.at,{class:'scooter'}),observation(3,f.at,{confirmed:false}),observation(4,f.at,{ageMs:1500}),observation(5,f.at+1),observation(6,f.at,{bbox:[1.2,0,.1,.2]}),observation(7,f.at,{bbox:[0,0,NaN,.2]}),observation(8,f.at,{ageMs:-1}),observation(0,f.at)];
  f.model.update(bad);for(let id=0;id<=8;id++)assert.equal(f.model.confirm(id),false);assert.deepEqual(f.events,[]);
  const good=['person','bicycle','motorcycle'].map((kind,i)=>observation(i+10,f.at,{class:kind}));
  f.model.update(good);for(const o of good)assert.equal(f.model.confirm(o.trackId),true);
  assert.deepEqual(f.events.map(e=>e.trackId),[10,11,12]);
});

test('confirmation creates exactly one manual passage per ID and preserves original observations',()=>{
  const f=fixture(),real=observation(11,f.at,{class:'bicycle'}),person=observation(12,f.at);
  f.model.update([real,person]);assert.equal(f.model.confirm(11),true);assert.equal(f.model.confirm(11),false);
  const annotated=f.model.annotate([real,person]);
  assert.deepEqual(f.events,[{class:'scooter',trackId:11,manual:true}]);
  assert.deepEqual(annotated[0],{...real,class:'scooter',manual:true});
  assert.equal(real.class,'bicycle');assert.equal(real.manual,undefined);assert.notEqual(annotated[0].bbox,real.bbox);assert.equal(annotated[1],person);
});

test('fresh trajectory positions alone sustain a mark; temporary absence supplies no motion',()=>{
  const f=fixture();f.model.update([observation(1,f.at)]);f.model.confirm(1);
  f.advance(1000);const moved=observation(1,f.at,{bbox:[.4,.3,.1,.25]});f.model.update([moved]);
  assert.deepEqual(f.model.annotate([moved])[0].bbox,moved.bbox);
  f.advance(5000);f.model.update([]);assert.deepEqual(f.model.annotate([]),[]);assert.equal(f.model.marks.size,1);
  f.advance(2999);f.model.update([]);assert.equal(f.model.marks.size,1);
  f.advance(1);f.model.update([]);assert.equal(f.model.marks.size,0);assert.equal(f.events.length,1);
});

test('replaying an old observation with zero age never extends mark lifetime or restores fresh presence',()=>{
  const f=fixture(),real=observation(9,f.at);f.model.update([real]);f.model.confirm(9);
  for(let i=0;i<8;i++){f.advance(1000);f.model.update([{...real,ageMs:0}]);}
  assert.equal(f.at-real.observedAt,SCOOTER_TRACK_MEMORY);assert.equal(f.model.marks.size,0);
  assert.equal(f.model.confirm(9),false);assert.equal(f.model.annotate([real])[0],real);assert.equal(f.events.length,1);
});

test('clear removes tracking without undoing counts or allowing a second count for the same ID',()=>{
  const f=fixture();f.model.update([observation(1,f.at)]);f.model.confirm(1);f.model.clear();
  assert.equal(f.model.marks.size,0);assert.equal(f.model.candidates.size,0);assert.equal(f.events.length,1);
  f.advance(100);const fresh=observation(1,f.at);f.model.update([fresh]);assert.equal(f.model.confirm(1),true);
  assert.equal(f.events.length,1);assert.equal(f.model.annotate([fresh])[0].manual,true);
  f.model.update([observation(2,f.at)]);f.model.confirm(2);assert.equal(f.events.length,2);
});

test('unconfirmed and expired observations cannot be annotated even while the mark is retained',()=>{
  const f=fixture(),real=observation(3,f.at);f.model.update([real]);f.model.confirm(3);
  const uncertain={...real,confirmed:false};assert.equal(f.model.annotate([uncertain])[0],uncertain);
  f.advance(1500);assert.equal(f.model.annotate([real])[0],real);assert.equal(f.model.marks.size,1);
});

function uiFixture(){
  let at=1000,sequence=0;const timers=new Map(),events=[],nodes=new Map();
  const element=()=>({value:'',textContent:'',children:[],disabled:false,listeners:{},addEventListener(k,fn){this.listeners[k]=fn;},replaceChildren(...items){this.children=items;this.value=items[0]?.value||'';}});
  const get=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
  const document={getElementById:get,createElement:element};
  const ui=installScooterTracks({document,onConfirm:items=>events.push(...items),now:()=>at,setTimer:(fn,ms)=>{const id=++sequence;timers.set(id,{fn,at:at+ms});return id;},clearTimer:id=>timers.delete(id)});
  return {ui,events,get,get at(){return at;},select:id=>{get('scooter-track').value=String(id);get('scooter-track').listeners.change();},advance(ms){at+=ms;for(const [id,timer] of [...timers])if(timer.at<=at){timers.delete(id);timer.fn();}},timers};
}

test('UI requires a chosen fresh trajectory and withdraws stale choices without another frame',()=>{
  const f=uiFixture();assert.equal(f.get('confirm-scooter-track').disabled,true);
  f.ui.update([observation(22,f.at)]);assert.equal(f.get('confirm-scooter-track').disabled,true);
  f.select(22);assert.equal(f.get('confirm-scooter-track').disabled,false);
  f.advance(1500);assert.equal(f.get('scooter-track').disabled,true);assert.equal(f.get('confirm-scooter-track').disabled,true);
  f.get('confirm-scooter-track').listeners.click();assert.equal(f.events.length,0);
});

test('UI confirms once, removes only marks, and updates selector labels without changing its selected ID',()=>{
  const f=uiFixture();f.ui.update([observation(7,f.at)]);f.select(7);f.get('confirm-scooter-track').listeners.click();
  assert.equal(f.events.length,1);assert.equal(f.get('scooter-track').value,'7');assert.match(f.get('scooter-track').children[1].textContent,/patinete confirmado/);
  assert.equal(f.get('confirm-scooter-track').disabled,true);assert.equal(f.get('clear-scooter-tracks').disabled,false);
  f.get('clear-scooter-tracks').listeners.click();assert.equal(f.events.length,1);assert.match(f.get('scooter-tracks-status').textContent,/se conservan/);assert.equal(f.timers.size,0);
  f.advance(100);f.ui.update([observation(7,f.at)]);f.select(7);f.get('confirm-scooter-track').listeners.click();
  assert.equal(f.events.length,1);assert.match(f.get('scooter-tracks-status').textContent,/ya estaba registrado/);
  f.ui.clear();
});
