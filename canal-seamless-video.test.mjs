import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('./assets/seamless-video.js',import.meta.url),'utf8');
function fixture(){
 const frames=[],animation=[],timers=[],made=[];
 class Node {
  constructor(tag){this.tagName=tag.toUpperCase();this.style={};this.handlers={};this.readyState=4;this.videoWidth=1920;this.videoHeight=1080;this.currentTime=0;this.seeking=false;this.pauses=0;this.children=[];}
  appendChild(n){n.parent=this;this.children.push(n);return n;}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);this.parent=null;}
  querySelector(tag){return this.children.find(n=>n.tagName===tag.toUpperCase())||null;}
  getContext(){return {drawImage(){}};}
  setAttribute(){} removeAttribute(){} load(){} pause(){this.pauses++;} play(){return Promise.resolve();}
  addEventListener(name,fn){this.handlers[name]=fn;}
  requestVideoFrameCallback(fn){frames.push(fn);}
 }
 const doc={body:new Node('body'),createElement(tag){const n=new Node(tag);made.push(n);return n;}};
 const context={};vm.runInNewContext(source,context);
 const stage=new Node('div'),old=new Node('video');old.style.opacity='1';stage.appendChild(old);
 const c=context.AdmiraSeamlessVideo.create(stage,{document:doc,raf:fn=>animation.push(fn),later:fn=>timers.push(fn)});
 return {c,stage,old,frames,animation,timers,made,Node};
}
test('holds the old frame through loading and seeking; fades only the decoded clock frame',()=>{
 const f=fixture(),canvas=f.c.freeze();assert(canvas);assert.equal(f.old.pauses,1);
 f.c.attach();const next=new f.Node('video');next.style.opacity='0';f.stage.appendChild(next);
 let alive=true;f.c.reveal(next,()=>alive,()=>5);
 next.currentTime=1;f.frames.shift()();assert.equal(next.style.opacity,'0');assert.equal(canvas.style.opacity,undefined);
 next.currentTime=5;next.seeking=true;f.frames.shift()();assert.equal(next.style.opacity,'0');
 next.seeking=false;f.frames.shift()();assert.equal(next.style.opacity,'1');assert.equal(next._admiraDecodedFrameSeen,true);
 f.animation.shift()();assert.equal(canvas.style.opacity,'0');f.timers.shift()();assert(!canvas.parent);
});
test('taking a warmed video cannot be paused later by its preload callback',async()=>{
 const f=fixture();f.c.prepare('next','cached.mp4');const warmed=f.made.at(-1);
 warmed.handlers.loadeddata();await Promise.resolve();const adopted=f.c.take('next');assert.equal(adopted,warmed);
 f.frames.shift()();assert.equal(adopted.pauses,0);assert.equal(f.c.take('next'),null);
});
test('standby clears held images and warming; stale frame callbacks cannot reveal media',()=>{
 const f=fixture();f.c.freeze();f.c.attach();const next=new f.Node('video');next.style.opacity='0';
 f.c.reveal(next,()=>true,()=>0);f.c.prepare('next','cached.mp4');const warm=f.made.at(-1);
 f.c.clear();f.frames.shift()();assert.equal(next.style.opacity,'0');assert.equal(f.stage.children.length,0);assert.equal(warm.pauses,1);
});
test('only the coffee programme opts in and adopted metadata is applied before playback',()=>{
 const canal=readFileSync(new URL('./canal.html',import.meta.url),'utf8');
 assert.match(canal,/startsWith\('starbucks-gdg51-seven-20261015-r'\)/);
 assert.match(canal,/if\(!seamless\)\{v.addEventListener\('playing', _reveal/);
 assert.match(canal,/if\(v.readyState>=1\)v.onloadedmetadata\(\)/);
 assert.match(canal,/if\(typeof coffeeTransitions!=='undefined'\)coffeeTransitions.clear\(\)/);
});
