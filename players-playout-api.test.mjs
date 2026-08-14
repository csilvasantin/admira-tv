import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet, onRequestPost } from './functions/api/playout.js';

function envFor(email='csilvasantin@gmail.com'){
  const records=new Map([['admira-tv:auth:session:test-session',JSON.stringify({email,expiresAt:Date.now()+60000})]]);
  return {ACCESS:{get:async key=>records.get(key)||null,put:async(key,value)=>records.set(key,value)},records};
}

test('la cookie first-party autoriza y persiste la configuración en el almacenamiento del sitio',async()=>{
  const env=envFor();
  const request=new Request('https://admira.tv/api/playout',{method:'POST',headers:{Cookie:'__Host-atv_session=test-session','Content-Type':'application/json'},body:JSON.stringify({mode:'synchronized',screens:['a-screen','b-screen']})});
  const response=await onRequestPost({request,env});
  assert.equal(response.status,200);
  const saved=JSON.parse(env.records.get('admira-tv:playout:v1'));
  assert.equal(saved.mode,'synchronized');
  assert.deepEqual(saved.screens,['a-screen','b-screen']);
});

test('cada player lee sin login sólo su asignación y los no elegidos quedan autónomos',async()=>{
  const env=envFor();
  env.records.set('admira-tv:playout:v1',JSON.stringify({configured:true,mode:'extended',screens:['a-screen','b-screen'],item:{id:'x',url:'https://cdn.example/x.mp4',type:'video'},layout:{rows:1,cols:2},revision:7,updatedAt:5}));
  const selected=await (await onRequestGet({request:new Request('https://admira.tv/api/playout?screen=b-screen'),env})).json();
  const other=await (await onRequestGet({request:new Request('https://admira.tv/api/playout?screen=other-screen'),env})).json();
  assert.equal(selected.mode,'extended');
  assert.deepEqual(selected.tile,{index:1,total:2,row:0,col:1,rows:1,cols:2});
  assert.equal(other.mode,'autonomous');
});

test('la asignación sincronizada identifica al primer player como máster de playlist',async()=>{
  const env=envFor();
  env.records.set('admira-tv:playout:v1',JSON.stringify({configured:true,mode:'synchronized',screens:['a-screen','b-screen'],revision:8,updatedAt:6}));
  const follower=await (await onRequestGet({request:new Request('https://admira.tv/api/playout?screen=b-screen'),env})).json();
  assert.deepEqual(follower.group,{id:'synchronized-main',index:1,total:2,leader:'a-screen'});
});

test('sin sesión first-party no existe escritura ni lectura de la topología completa',async()=>{
  const env=envFor();
  const post=await onRequestPost({request:new Request('https://admira.tv/api/playout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}),env});
  const get=await onRequestGet({request:new Request('https://admira.tv/api/playout'),env});
  assert.equal(post.status,401);
  assert.equal(get.status,401);
});
