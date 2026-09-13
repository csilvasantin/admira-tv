import test from 'node:test';
import assert from 'node:assert/strict';
import {TrackingOverlay,trackColor,drawTrackingAnnotations} from './tracking-overlay.mjs';
function fixture(t,options={}){
  t.mock.timers.enable({apis:['setTimeout']});let now=0;
  class Node{
    constructor(){this.style={};this.children=[];this.classList={toggle:(k,v)=>{this[k]=v;}};this.ownerDocument={createElement:()=>new Node()};}
    append(child){this.children.push(child);child.parent=this;}
    remove(){this.parent.children=this.parent.children.filter(n=>n!==this);}
    replaceChildren(){this.children=[];}
  }
  const root=new Node(),overlay=new TrackingOverlay(root,{now:()=>now,...options});
  const tick=ms=>{now+=ms;t.mock.timers.tick(ms);};
  const obs=(id,ageMs=0)=>({trackId:id,class:'person',bbox:[.1,.2,.1,.5],ageMs,confirmed:true});
  return {root,overlay,tick,obs};
}
test('boxes move by normalized coordinates, retain nodes and distinct ID colors, clip at ROI',t=>{
  const f=fixture(t);f.overlay.render([f.obs(1),f.obs(2)]);
  const [a,b]=f.root.children;assert.notEqual(a.style.color,b.style.color);assert.equal(a.children[0].textContent,'Persona #1');
  f.overlay.render([{...f.obs(1),bbox:[.4,.2,.1,.5]},f.obs(2)]);
  assert.equal(f.root.children[0],a);assert.equal(a.style.left,'40%');assert.equal(a.style.color,trackColor(1));
  f.overlay.render([{...f.obs(1),bbox:[-.1,.9,.3,.3]}]);
  assert.equal(a.style.left,'0%');assert.ok(parseFloat(a.style.height)<=10.01);assert.equal(f.root.children.length,1);
  assert.equal(new Set(Array.from({length:256},(_,i)=>trackColor(i+1))).size,256);f.overlay.clear();
});
test('overlay expires each observation independently even if inference stalls; clear cancels timers',t=>{
  const f=fixture(t);f.overlay.render([f.obs(1,1400),f.obs(2)]);f.tick(100);
  assert.equal(f.root.children.length,1);assert.equal(f.root.children[0].children[0].textContent,'Persona #2');
  f.tick(1400);assert.equal(f.root.children.length,0);
  f.overlay.render([f.obs(3)]);f.overlay.clear();f.tick(5000);assert.equal(f.root.children.length,0);
});
test('unconfirmed or low-confidence continuity is dashed; no manual scooter or invalid boxes',t=>{
  const f=fixture(t);f.overlay.render([{...f.obs(1),confirmed:false},{...f.obs(2),uncertain:true}]);
  assert.ok(f.root.children.every(n=>n.uncertain));assert.match(f.root.children[0].title,/confirmando/);
  f.overlay.render([{...f.obs(1),class:'scooter'},{...f.obs(2),bbox:[2,2,.2,.2]},f.obs(3,1500),{...f.obs(4),bbox:[NaN,0,1,1]}]);
  assert.equal(f.root.children.length,0);
});
test('nearby trajectory numbers use separate rows instead of overlapping; cramped ROI hides labels only',t=>{
  const f=fixture(t);f.root.clientWidth=400;f.root.clientHeight=300;
  f.overlay.render([f.obs(1),f.obs(2),f.obs(3)]);
  const labels=f.root.children.map(n=>n.children[0]);
  assert.ok(labels.every(n=>!n.hidden));
  const tops=labels.map(n=>parseFloat(n.style.top));assert.equal(new Set(tops).size,3);
  assert.ok(tops.every((a,i)=>tops.every((b,j)=>i===j||Math.abs(a-b)>=18)));
  f.root.clientHeight=16;f.overlay.layoutLabels();assert.ok(labels.every(n=>n.hidden));
  assert.equal(f.root.children.length,3);f.overlay.clear();
});
function labelRect(entry,root,charWidth=7,height=16){
  return {x:entry.anchor[0]*root.clientWidth+2+parseFloat(entry.label.style.left),y:entry.anchor[1]*root.clientHeight+2+parseFloat(entry.label.style.top),w:Math.ceil(entry.label.textContent.length*charWidth+6),h:height};
}
test('iPad label metrics keep 15px type and 18px line plus padding apart and within the viewport',t=>{
  const f=fixture(t,{labelHeight:20,labelCharWidth:9.5,reservedTop:0});f.root.clientWidth=300;f.root.clientHeight=100;
  f.overlay.render([1,2,3].map(id=>({...f.obs(id),bbox:[.99,.99,.01,.01]})));
  const entries=[...f.overlay.nodes.values()];assert.ok(entries.every(e=>!e.label.hidden));
  const rects=entries.map(e=>labelRect(e,f.root,9.5,20));
  for(const [i,a] of rects.entries()){
    assert.ok(a.x>=0&&a.x+a.w<=300&&a.y>=0&&a.y+a.h<=100);
    for(const b of rects.slice(i+1))assert.ok(a.y+a.h+2<=b.y||b.y+b.h+2<=a.y);
  }
  f.overlay.clear();
});
test('dynamic status reservations relocate labels without crossing header or wrapped footer',t=>{
  let reservedBottom=18;
  const f=fixture(t,{reservedTop:24,reservedBottom:()=>reservedBottom});f.root.clientWidth=400;f.root.clientHeight=100;
  f.overlay.render([f.obs(1),f.obs(2),f.obs(3)]);
  const entries=[...f.overlay.nodes.values()];assert.ok(entries.every(e=>!e.label.hidden));
  const check=()=>{for(const e of entries.filter(e=>!e.label.hidden)){const r=labelRect(e,f.root);assert.ok(r.y>=24&&r.y+r.h<=100-reservedBottom);}};
  check();reservedBottom=48;f.overlay.layoutLabels();check();
  assert.equal(entries.filter(e=>!e.label.hidden).length,1);assert.equal(f.root.children.length,3);
  reservedBottom=80;f.overlay.layoutLabels();assert.ok(entries.every(e=>e.label.hidden));
  reservedBottom=0;f.overlay.layoutLabels();assert.ok(entries.every(e=>!e.label.hidden));check();f.overlay.clear();
});
test('horizontal label estimates include padding and gap; oversized labels hide without deleting tracks',t=>{
  const f=fixture(t,{labelHeight:20,labelCharWidth:9.5,labelGap:4,reservedTop:0});f.root.clientWidth=300;f.root.clientHeight=80;
  f.overlay.render([{...f.obs(1),bbox:[0,0,.1,.5]},{...f.obs(2),bbox:[.31,0,.1,.5]}]);
  const entries=[...f.overlay.nodes.values()],rects=entries.map(e=>labelRect(e,f.root,9.5,20));
  assert.ok(entries.every(e=>!e.label.hidden));assert.ok(Math.abs(rects[0].y-rects[1].y)>=24);
  f.root.clientWidth=100;f.overlay.layoutLabels();assert.ok(entries.every(e=>e.label.hidden));assert.equal(f.root.children.length,2);
  f.root.clientWidth=101;f.overlay.layoutLabels();assert.ok(entries.every(e=>!e.label.hidden));f.overlay.clear();
});
test('invalid or unavailable reservations fail closed and recover at the next layout',t=>{
  let reserved=NaN;
  const f=fixture(t,{reservedBottom:()=>{if(reserved==='throw')throw new Error('No layout');return reserved;}});f.root.clientWidth=400;f.root.clientHeight=300;
  f.overlay.render([f.obs(1)]);const e=f.overlay.nodes.get(1);assert.equal(e.label.hidden,true);
  reserved='throw';assert.doesNotThrow(()=>f.overlay.layoutLabels());assert.equal(e.label.hidden,true);
  reserved=0;f.overlay.layoutLabels();assert.equal(e.label.hidden,false);f.overlay.clear();
});
test('bitmap annotations retain ID colors, separate labels, clip boxes and omit expired or manual observations',()=>{
  const boxes=[],labels=[];
  const c={save(){},restore(){},setLineDash(dash){this.dash=dash;},fillRect(){},measureText(text){return {width:text.length*7};},strokeRect(...rect){boxes.push({rect,color:this.strokeStyle,dash:this.dash});},fillText(text,x,y){labels.push({text,x,y,color:this.fillStyle});}};
  const obs=id=>({trackId:id,class:'person',bbox:[-.1,.9,.3,.3],ageMs:0,confirmed:true});
  drawTrackingAnnotations(c,320,180,[obs(2),{...obs(1),confirmed:false},{...obs(3),ageMs:1400},{...obs(4),class:'scooter'},{...obs(5),bbox:[2,0,.1,.2]}],100);
  assert.equal(boxes.length,2);assert.equal(labels.length,2);
  assert.deepEqual(labels.map(label=>label.text),['Persona #1','Persona #2']);
  assert.deepEqual(boxes.map(box=>box.color),[trackColor(1),trackColor(2)]);
  assert.deepEqual(boxes[0].dash,[4,3]);assert.deepEqual(boxes[1].dash,[]);
  assert.equal(boxes[0].rect[0],0);assert.ok(boxes[0].rect[1]+boxes[0].rect[3]<=180);
  assert.ok(Math.abs(labels[0].y-labels[1].y)>=20);assert.ok(labels.every(label=>label.x>=0&&label.y>=9&&label.y<=171));
  boxes.length=0;labels.length=0;drawTrackingAnnotations(c,320,180,[obs(1)],1500);
  assert.equal(boxes.length,0);assert.equal(labels.length,0);
});
