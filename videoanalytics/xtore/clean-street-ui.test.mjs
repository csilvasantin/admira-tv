// Pixel-backed display fixture: checks the production composition without real
// camera access, browser capture, network transmission or injected live tracks.
import test from 'node:test';
import assert from 'node:assert/strict';
import {installCleanStreetUI} from './clean-street-ui.mjs';
import {trackColor} from './tracking-overlay.mjs';

function fixture(t){
  let now=1000;
  t.mock.timers.enable({apis:['setTimeout']});t.mock.method(performance,'now',()=>now);
  const old=Object.getOwnPropertyDescriptor(globalThis,'ImageData');
  Object.defineProperty(globalThis,'ImageData',{configurable:true,writable:true,value:class {constructor(data,width,height){Object.assign(this,{data,width,height});}}});
  t.after(()=>{if(old)Object.defineProperty(globalThis,'ImageData',old);else delete globalThis.ImageData;});
  class Canvas{
    constructor(){this._width=0;this._height=0;this.style={};this.children=[];this.pixels=new Uint8ClampedArray();
      const node=this;this.context={fillStyle:'#000000',save(){},restore(){},setLineDash(dash){this.dash=dash;},
        fillRect(x,y,w,h){const hex=this.fillStyle.slice(1);const color=[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16));color.push(255);for(let yy=Math.max(0,Math.floor(y));yy<Math.min(node.height,y+h);yy++)for(let xx=Math.max(0,Math.floor(x));xx<Math.min(node.width,x+w);xx++)node.pixels.set(color,(yy*node.width+xx)*4);},
        drawImage(source,x=0,y=0,w=source.width,h=source.height){for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){const offset=(Math.floor(yy*source.height/h)*source.width+Math.floor(xx*source.width/w))*4;node.pixels.set(source.pixels.subarray(offset,offset+4),((yy+y)*node.width+xx+x)*4);}},
        getImageData(){return {width:node.width,height:node.height,data:new Uint8ClampedArray(node.pixels)};},
        putImageData(image){node.pixels.set(image.data);},measureText(text){return {width:text.length*7};},
        strokeRect(...rect){node.boxes.push({rect,color:this.strokeStyle});},fillText(text){node.labels.push({text,color:this.fillStyle});}};
      this.reset();}
    reset(){this.pixels=new Uint8ClampedArray(this.width*this.height*4);this.boxes=[];this.labels=[];}
    get width(){return this._width;}set width(value){this._width=value;this.reset();}
    get height(){return this._height;}set height(value){this._height=value;this.reset();}
    getContext(){return this.context;}addEventListener(){}setAttribute(name,value){this[name]=value;}replaceChildren(...items){this.children=items;}
  }
  const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,new Canvas());return nodes.get(id);};
  const document={getElementById:get,createElement:()=>new Canvas(),addEventListener(){}};
  const ui=installCleanStreetUI({document});t.after(()=>ui.reset());
  const frame=(people=false)=>{const f=new Canvas();f.width=160;f.height=120;f.context.fillStyle='#505050';f.context.fillRect(0,0,160,120);
    if(people){f.context.fillStyle='#e20a0a';f.context.fillRect(32,24,64,72);f.context.fillStyle='#0ae20a';f.context.fillRect(112,36,32,60);}return f;};
  const tracks=[{trackId:54,class:'person',bbox:[.2,.2,.4,.6],ageMs:0,confirmed:true},{trackId:55,class:'person',bbox:[.7,.3,.2,.5],ageMs:0,confirmed:true}];
  return {ui,get,frame,tracks,at:value=>{now=value;},tick:ms=>{now+=ms;t.mock.timers.tick(ms);}};
}
const pixel=(canvas,x,y)=>[...canvas.pixels.slice((y*canvas.width+x)*4,(y*canvas.width+x)*4+4)];

for(const learned of [false,true])test(`paired clean view hides detected bodies and carries colored IDs ${learned?'using learned street':'with no previously observed background'}`,t=>{
  const f=fixture(t);
  if(learned)for(let i=0;i<4;i++){f.at(1000+i*125);f.ui.update(f.frame(),[],[],1000+i*125);}
  f.at(1500);const raw=f.frame(true),before=new Uint8ClampedArray(raw.pixels);
  const predictions=f.tracks.map(track=>({class:track.class,score:.95,bbox:track.bbox.map((n,i)=>n*(i%2?raw.height:raw.width))}));
  f.ui.update(raw,predictions,f.tracks,1500);const pair=f.ui.frames();assert.ok(pair);
  assert.equal(pair.capturedAt,1500);assert.notEqual(pair.clean,pair.original);
  assert.deepEqual(pair.clean.labels.map(label=>label.text),['Persona #54','Persona #55']);
  assert.deepEqual(pair.clean.boxes.map(box=>box.color),[trackColor(54),trackColor(55)]);
  for(const [x,y] of [[64,78],[128,80]]){
    assert.notDeepEqual(pixel(pair.clean,x,y),pixel(raw,x,y));assert.equal(pixel(pair.clean,x,y)[3],255);
    if(learned)assert.deepEqual(pixel(pair.clean,x,y),[80,80,80,255]);
  }
  assert.deepEqual(pair.original.pixels,before);assert.deepEqual(raw.pixels,before);
  assert.deepEqual(pixel(pair.clean,4,4),pixel(raw,4,4));
  // Editing the H presentation is not required for the paired clean view.
  assert.equal(f.ui.enabled,false);
  f.tick(1500);assert.equal(f.ui.frames(),null);assert.equal(pair.clean.width,1);assert.equal(pair.original.width,1);
});
