import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const canal = await readFile(new URL("./canal.html", import.meta.url), "utf8");

test("el MUPI evita el zoom y conserva la ficha dentro del modo clean", () => {
  assert.match(canal, /#mupi\{[^}]*touch-action:manipulation/);
  assert.match(canal, /<aside id="localInfo"[^>]*hidden/);
  assert.doesNotMatch(canal, /\.clean\s+#localInfo\s*\{[^}]*display:none/);
});

test('ficha común: cierre y asa accesibles, contador efectivo y audio en filas separadas',()=>{
  for(const [id,label] of [['li-close','Cerrar ficha'],['li-drag','Mover ficha']])
    assert.match(canal,new RegExp('<button id="'+id+'" type="button"[^>]*aria-label="'+label+'"'));
  assert.match(canal,/id="li-position" aria-label="Posición en la playlist"/);
  assert.match(canal,/pos=samePos\?\(cur\+1\)\+' de '\+playlist.length:'— de —'/);
  assert.match(canal,/#localInfo .li-toolbar\{ position:sticky/);
  assert.match(canal,/#localInfo .li-audio\{[^}]*flex-direction:column[^}]*gap:6px/);
  assert.match(canal,/class="li-audio-bars" aria-hidden="true"/);
  assert.doesNotMatch(canal,/#localInfo .li-audio-label\{[^}]*position:absolute/);
  assert.match(canal,/#localInfo\{[^}]*max-height:calc\(100% - 60px\)/);
});

function cardFixture(){
  const nodes=new Map();
  const node=id=>{if(!nodes.has(id))nodes.set(id,{id,hidden:false,offsetLeft:18,offsetTop:18,offsetWidth:220,offsetHeight:320,clientWidth:540,clientHeight:960,style:{},handlers:new Map(),captured:null,
    appendChild(child){this.child=child;},addEventListener(type,fn){this.handlers.set(type,fn);},setPointerCapture(id){this.captured=id;},releasePointerCapture(id){if(this.captured===id)this.captured=null;}});return nodes.get(id);};
  const c={$:node,displayRotation:0,window:{},_mupiResizeObserver:null,localInfoHide(){node('localInfo').hidden=true;c.localInfoDragEnd();}};
  vm.createContext(c);
  vm.runInContext(canal.slice(canal.indexOf('let _localInfoDrag=null;'),canal.indexOf('// Pointer Events da un doble toque')),c);
  const event=(extra={})=>({pointerId:1,button:0,isPrimary:true,clientX:100,clientY:100,preventDefault(){},stopPropagation(){},...extra});
  return {c,node,event,fire:(id,type,extra)=>node(id).handlers.get(type)(event(extra))};
}

test('arrastre acotado en viewport estable, independiente del formato y giro de la pieza',()=>{
  const f=cardFixture(),{c,node,fire}=f;
  fire('li-drag','pointerdown');assert.equal(node('li-drag').captured,1);
  fire('li-drag','pointermove',{clientX:145,clientY:180});
  assert.equal(node('localInfo').style.left,'63px');assert.equal(node('localInfo').style.top,'98px');
  fire('li-drag','pointermove',{clientX:5000,clientY:5000});
  assert.equal(node('localInfo').style.left,'310px');assert.equal(node('localInfo').style.top,'630px');
  for(const type of ['pointerup','pointercancel','lostpointercapture']){
    fire('li-drag','pointerdown');fire('li-drag',type);assert.equal(node('li-drag').captured,null);
  }
  assert.equal(node('wrap').child,node('localInfo'));
  for(const r of [0,90,180,270]){
    c.displayRotation=r;fire('li-drag','pointerdown');fire('li-drag','pointermove',{clientX:110,clientY:120});
    assert.equal(node('localInfo').style.left,'28px');assert.equal(node('localInfo').style.top,'38px');fire('li-drag','pointerup');
  }
  node('wrap').clientWidth=260;node('wrap').clientHeight=380;c.localInfoClamp(999,999);
  assert.equal(node('localInfo').style.left,'30px');assert.equal(node('localInfo').style.top,'50px');
});

test('X/Escape cancelan arrastre, botones no propagan doble toque y flechas mueven sin navegar',()=>{
  const {node,fire}=cardFixture();
  fire('li-drag','keydown',{key:'ArrowDown'});assert.equal(node('localInfo').style.top,'28px');
  fire('li-drag','keydown',{key:'ArrowRight',shiftKey:true});assert.equal(node('localInfo').style.left,'48px');
  let stopped=false;fire('localInfo','dblclick',{stopPropagation(){stopped=true;}});assert.equal(stopped,true);
  for(const action of ['click','Escape']){
    node('localInfo').hidden=false;fire('li-drag','pointerdown');
    if(action==='click')fire('li-close','click');else fire('localInfo','keydown',{key:'Escape'});
    assert.equal(node('localInfo').hidden,true);assert.equal(node('li-drag').captured,null);
  }
  node('li-drag').captured=null;fire('li-drag','pointerdown',{button:2});assert.equal(node('li-drag').captured,null);
});

test("doble clic y doble toque abren la misma ficha viva", () => {
  assert.match(canal, /addEventListener\('dblclick',localInfoDoubleClick\)/);
  assert.match(canal, /addEventListener\('pointerup',localInfoPointerUp,\{passive:false\}\)/);
  assert.match(canal, /now-_localInfoTapAt<=420/);
  assert.match(canal, /Math\.hypot\(dx,dy\)<=56/);
  assert.match(canal, /_localInfoIgnoreDblUntil=now\+550/);
  assert.match(canal, /window\.ADMIRA_TOGGLE_LOCAL_INFO=localInfoToggle/);
});

test("el gesto no secuestra controles y la ficha ofrece metadatos reales", () => {
  assert.match(canal, /closest\('button,input,select,textarea,a,#seg,#tap'\)/);
  for (const label of [
    "estado local", "tipo", "posición", "progreso", "resolución",
    "tamaño", "origen", "pantalla"
  ]) assert.match(canal, new RegExp(`row\\('${label}'`));
  assert.doesNotMatch(canal, /row\('id'/);
  assert.match(canal, /function localInfoStock\(it\)/);
  assert.match(canal, /String\(x\.id\)===String\(it\.id\)/);
  assert.match(canal, /li-primary-tag/);
  assert.match(canal, /'#'\+String\(meta\.num\)/);
  assert.match(canal, /testTags\(meta\)/);
  assert.match(canal, /setInterval\(localInfoRender,1000\)/);
});
