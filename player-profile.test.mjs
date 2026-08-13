import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { onRequestGet, onRequestPut } from './functions/api/player-profile.js';

const source=fs.readFileSync(new URL('./functions/api/player-profile.js',import.meta.url),'utf8');
const mando=fs.readFileSync(new URL('./mando.html',import.meta.url),'utf8');

test('el perfil manual es same-origin, exige sesión y sólo admite campos inventariados',()=>{
  assert.match(source,/sessionEmail\(request, env\)/);
  assert.match(source,/error: "unauthorized"/);
  assert.match(source,/const FIELD_KEYS = new Set/);
  assert.match(source,/PREFIX \+ screen/);
});

test('un valor manual vacío elimina el override y cada escritura conserva autor y fecha',()=>{
  assert.match(source,/else delete fields\[key\]/);
  assert.match(source,/updatedAt: Date\.now\(\), updatedBy: actor/);
});

test('Status ofrece editor sólo cuando falta el dato medido',()=>{
  assert.match(mando,/function statusManualEditor\(fieldKey,label,value\)/);
  assert.match(mando,/if\(missing&&fieldKey\) value=statusManualEditor/);
  assert.match(mando,/fetch\(PROFILE_API,\{method:'PUT'/);
});

test('el perfil manual persiste por pantalla y rechaza claves arbitrarias',async()=>{
  const store=new Map([['admira-tv:auth:session:token-ok',JSON.stringify({email:'csilva@admira.com',expiresAt:Date.now()+60000})]]);
  const env={ACCESS:{get:async key=>store.get(key)||null,put:async(key,value)=>store.set(key,value)}};
  const unauthorized=await onRequestGet({request:new Request('https://admira.tv/api/player-profile?screen=macbookpro16'),env});
  assert.equal(unauthorized.status,401);
  const request=new Request('https://admira.tv/api/player-profile',{method:'PUT',headers:{cookie:'__Host-atv_session=token-ok','content-type':'application/json'},body:JSON.stringify({screen:'macbookpro16',fields:{'system.osVersion':'macOS 26','secreto':'no'}})});
  const saved=await onRequestPut({request,env}); assert.equal(saved.status,200);
  const doc=JSON.parse(await saved.text()); assert.deepEqual(doc.profile.fields,{'system.osVersion':'macOS 26'}); assert.equal(doc.profile.updatedBy,'csilva@admira.com');
  const read=await onRequestGet({request:new Request('https://admira.tv/api/player-profile?screen=macbookpro16',{headers:{cookie:'__Host-atv_session=token-ok'}}),env});
  assert.deepEqual((await read.json()).profile.fields,{'system.osVersion':'macOS 26'});
});
