import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequest} from './twin-edit.js';

const env={STOCK_NOTIFY_KEY:'k'.repeat(32),SESSIONS:{get:async()=>null}};
const req=(body,headers={})=>new Request('https://admira.tv/videoanalytics/api/twin-edit',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://admira.tv',...headers},body:JSON.stringify(body)});
const image='data:image/png;base64,iVBORwEBAQE=';

test('without an Admira.tv session the relay answers 401 and never calls Pixeria',async()=>{
  let calls=0;
  const response=await onRequest({request:req({image,category:'person',style:'twin'}),env},{fetchImpl:async()=>{calls++;}});
  assert.equal(response.status,401);assert.equal(calls,0);
});
test('cross-origin posts are refused',async()=>{
  const response=await onRequest({request:req({image,category:'person',style:'twin'},{Origin:'https://evil.example'}),env});
  assert.equal(response.status,403);
});
test('a signed-in operator is relayed with the server key and a server-fixed prompt',async()=>{
  const calls=[];
  const signed={...env,ACCESS:{get:async()=>JSON.stringify({email:'csilva@admira.com',expiresAt:Date.now()+60000})}};
  const response=await onRequest({request:req({image,category:'person',style:'twin'},{Cookie:'__Host-atv_session=fixture'}),env:signed},
    {fetchImpl:async(url,init)=>{calls.push({url,init,body:JSON.parse(init.body)});return Response.json({ok:true,image:'data:image/png;base64,AAAA'});}});
  assert.equal(response.status,200);assert.equal((await response.json()).ok,true);
  assert.equal(calls[0].url,'https://api.admira.store/image/edit');
  assert.equal(calls[0].init.headers['X-Notify-Key'],signed.STOCK_NOTIFY_KEY);
  assert.equal(calls[0].body.image,image);assert.match(calls[0].body.prompt,/personaje adulto ficticio/);
  const bad=await onRequest({request:req({image,category:'person',style:'twin',prompt:'x'},{Cookie:'__Host-atv_session=fixture'}),env:signed},{fetchImpl:async()=>{throw new Error('no');}});
  assert.equal(bad.status,400);
});
