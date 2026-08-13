import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost } from './functions/api/playout.js';

function envFor(email='csilvasantin@gmail.com'){
  return {
    ADMIN_TOKEN:'server-secret',
    ACCESS:{get:async key=>key==='admira-tv:auth:session:test-session'?JSON.stringify({email,expiresAt:Date.now()+60000}):null},
  };
}

test('la cookie first-party autoriza y el secreto sólo viaja desde el servidor',async()=>{
  const original=globalThis.fetch;
  let observed=null;
  globalThis.fetch=async(_url,init)=>{observed=init;return Response.json({ok:true,state:{mode:'synchronized'}});};
  try{
    const request=new Request('https://admira.tv/api/playout',{method:'POST',headers:{Cookie:'__Host-atv_session=test-session','Content-Type':'application/json'},body:JSON.stringify({mode:'synchronized',screens:['a','b']})});
    const response=await onRequestPost({request,env:envFor()});
    assert.equal(response.status,200);
    assert.equal(observed.headers.Authorization,'Bearer server-secret');
    assert.doesNotMatch(await response.text(),/server-secret/);
  }finally{globalThis.fetch=original;}
});

test('sin sesión first-party no existe escritura',async()=>{
  const request=new Request('https://admira.tv/api/playout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  const response=await onRequestPost({request,env:envFor()});
  assert.equal(response.status,401);
});
