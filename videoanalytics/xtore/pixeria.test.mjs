// Contract-only fixtures: no camera, network, paid inference or public writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateTwin,publishTwin} from './pixeria.mjs';

const original='data:image/png;base64,iVBORwEBAQE=';
const generated='data:image/png;base64,iVBORwkIBwY=';
function fixtures(t,fetch){
  let canvas;
  t.mock.method(globalThis,'fetch',fetch);
  const previous={document:globalThis.document,ImageData:globalThis.ImageData,createImageBitmap:globalThis.createImageBitmap};
  globalThis.document={createElement:()=>canvas={width:1,height:1,getContext:()=>({putImageData(){}}),toDataURL:()=>original}};
  globalThis.ImageData=class {constructor(data,width,height){Object.assign(this,{data,width,height});}};
  globalThis.createImageBitmap=async()=>({width:16,height:16,close(){}});
  t.after(()=>{for(const [key,value] of Object.entries(previous))if(value===undefined)delete globalThis[key];else globalThis[key]=value;});
  return {get canvas(){return canvas;}};
}
const args=()=>({source:{width:8,height:8,data:new Uint8ClampedArray(256).fill(61)},category:'person',style:'8bit',signal:new AbortController().signal});
test('generate sends the selected original only to edit; public payload contains only the result',async t=>{
  const requests=[],f=fixtures(t,async(url,options)=>{
    requests.push({url,...options,body:JSON.parse(options.body)});
    return Response.json(url.endsWith('/image/edit')?{ok:true,image:generated}:{ok:true,id:'1789123456789-abc123',url:'https://api.admira.store/stock/asset/1789123456789-abc123'});
  });
  const input=args(),result=await generateTwin(input);
  await publishTwin({...input,result});
  assert.equal(requests.length,2);
  assert.equal(requests[0].url,'https://api.admira.store/image/edit');assert.equal(requests[0].body.image,original);
  assert.equal(requests[1].url,'https://api.admira.store/stock/publish');assert.equal(requests[1].body.base64,'iVBORwkIBwY=');
  assert.ok(!['source','image','sourceUrl','r2Staged'].some(key=>key in requests[1].body));
  for(const request of requests){assert.equal(request.credentials,'omit');assert.equal(request.redirect,'error');assert.equal(request.cache,'no-store');}
  assert.equal(f.canvas.width,1);assert.equal(f.canvas.height,1);
});
test('an unchanged or undecodable image never becomes a publishable result',async t=>{
  const responses=[original,'https://example.com/original.png',generated];
  fixtures(t,async()=>Response.json({ok:true,image:responses.shift()}));
  await assert.rejects(generateTwin(args()));await assert.rejects(generateTwin(args()));
  globalThis.createImageBitmap=async()=>{throw new Error('decode failed');};
  await assert.rejects(generateTwin(args()));
});
test('generation stops waiting after 90 seconds without an automatic retry',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});let calls=0;
  fixtures(t,async(url,options)=>{calls++;return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError'))));});
  const pending=generateTwin(args()),rejected=assert.rejects(pending);
  t.mock.timers.tick(90_000);await rejected;assert.equal(calls,1);
});
test('an oversized edit response is rejected before JSON/image decoding',async t=>{
  fixtures(t,async()=>new Response(new Uint8Array(8_100_001)));
  await assert.rejects(generateTwin(args()),/response-too-large/);
});
