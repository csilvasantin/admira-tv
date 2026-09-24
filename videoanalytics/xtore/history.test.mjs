import test from 'node:test';
import assert from 'node:assert/strict';
import {HistoryClient,dayKey,passTime} from './history.mjs';
import {onRequest} from '../../functions/videoanalytics/api/history.js';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const migration=readFileSync(new URL('../../drizzle/0000_xtore_passages.sql',import.meta.url),'utf8');
const event=(extra={})=>({id:crypto.randomUUID(),kind:'person',at:Date.now(),source:'detector',...extra});
function database(path=':memory:',initialize=true){
  const sqlite=new DatabaseSync(path);if(initialize)sqlite.exec(migration);
  const prepare=sql=>({bind(...values){return {all:async()=>({results:sqlite.prepare(sql).all(...values)}),run:async()=>({meta:{changes:sqlite.prepare(sql).run(...values).changes}})};}});
  const db={prepare,async batch(statements){sqlite.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());sqlite.exec('COMMIT');return results;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
  return {db,close:()=>sqlite.close(),sqlite};
}
function envFor(db,{email='csilva@admira.com',role='viewer',session=true}={}){
  return {VIDEO_ANALYTICS_DB:db,ACCESS:{get:async key=>key==='admira-tv:auth:session:fixture'&&session?JSON.stringify({email,expiresAt:Date.now()+60000}):key==='admira-tv:users:v3'?JSON.stringify({v:3,projects:[{id:'admira-tv'}],users:[{email,status:'active',roles:{'admira-tv':role}}]}):null}};
}
function request(env,body,headers={}){
  return onRequest({env,request:new Request('https://admira.tv/videoanalytics/api/history',{
    method:body?'POST':'GET',headers:{Cookie:'__Host-atv_session=fixture',...(body?{'Content-Type':'application/json',Origin:'https://admira.tv'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})})});
}
test('history requires a verified session and admin/owner access, and fails closed without D1',async()=>{
  const d=database();try{
    assert.equal((await request(envFor(d.db,{session:false}))).status,401);
    assert.equal((await request(envFor(d.db,{email:'viewer@example.test'}))).status,403);
    assert.equal((await request(envFor(undefined))).status,503);
    assert.equal((await request(envFor(d.db,{email:'admin@example.test',role:'admin'}))).status,200);
  }finally{d.close();}
});
test('private writes reject cross-origin, missing Origin, images and unsupported classifications',async()=>{
  const d=database(),env=envFor(d.db);try{
    for(const Origin of ['https://evil.example','null',''])assert.equal((await request(env,{events:[event()]},{Origin})).status,403);
    for(const bad of [event({image:'base64'}),event({sex:'m'}),event({bbox:[1,2,3,4]}),event({kind:'scooter'}),event({source:'model-x'}),event({id:['uuid']}),event({at:Date.now()+120000})])assert.equal((await request(env,{events:[bad]})).status,400);
    assert.equal((await request(env,{events:[event()],camera:'other'})).status,400);
    assert.equal((await request(env,{events:Array.from({length:101},()=>event())})).status,400);
    assert.equal((await request(env,{events:[event({image:'x'.repeat(40000)})]})).status,400);
    assert.equal(d.sqlite.prepare('SELECT COUNT(*) AS n FROM xtore_passages').get().n,0);
  }finally{d.close();}
});
test('the same event is committed once; manual scooters are labelled and no images are stored',async()=>{
  const d=database(),env=envFor(d.db),events=[event(),event({kind:'scooter',source:'manual'})];try{
    assert.equal((await (await request(env,{events})).json()).inserted,2);
    assert.equal((await (await request(env,{events})).json()).inserted,0);
    const response=await request(env),data=await response.json();assert.match(response.headers.get('Cache-Control'),/no-store/);
    assert.equal(data.rows.reduce((sum,r)=>sum+r.total,0),2);assert.ok(data.rows.some(r=>r.kind==='scooter'&&r.source==='manual'));
    assert.deepEqual(d.sqlite.prepare('PRAGMA table_info(xtore_passages)').all().map(c=>c.name),['id','kind','at','source']);
  }finally{d.close();}
});
test('persistent database survives process-store reopen and can be read by another authorized account',async()=>{
  const folder=mkdtempSync(join(tmpdir(),'xtore-history-test-')),path=join(folder,'metadata.sqlite');let d;
  try{
    d=database(path);await request(envFor(d.db),{events:[event({at:Date.now()-2*86400000})]});d.close();
    d=database(path,false);const response=await request(envFor(d.db,{email:'admin-two@example.test',role:'admin'}));
    assert.equal((await response.json()).rows[0].total,1);
  }finally{d?.close();rmSync(folder,{recursive:true});}
});
test('client retains uncertain writes and retries the exact event IDs without images',async()=>{
  const sent=[];let fails=true;
  const client=new HistoryClient({fetchImpl:async(url,options)=>{
    if(options.method==='POST'){const body=JSON.parse(options.body);sent.push(body);if(fails)throw new Error('offline');return Response.json({ok:true,accepted:body.events.map(e=>e.id)});}
    return Response.json({ok:true,rows:[]});
  }});
  client.add([{class:'person',bbox:[1,2,3,4],score:.9,image:'must not leave'}]);await client.sync();assert.equal(client.pending.length,1);
  fails=false;await client.sync();assert.equal(client.pending.length,0);assert.deepEqual(sent[0],sent[1]);
  assert.deepEqual(Object.keys(sent[0].events[0]).sort(),['at','id','kind','source']);
});
test('a sync requested during a slow final read is coalesced, not lost',async()=>{
  let finishRead,reads=0;const sent=[];
  const client=new HistoryClient({fetchImpl:async(url,options)=>{
    if(options.method==='POST'){const body=JSON.parse(options.body);sent.push(...body.events);return Response.json({ok:true,accepted:body.events.map(e=>e.id)});}
    if(++reads===2)return new Promise(resolve=>{finishRead=()=>resolve(Response.json({ok:true,rows:[]}));});
    return Response.json({ok:true,rows:[]});
  }});
  client.add([{class:'person'}]);const syncing=client.sync();
  await new Promise(resolve=>setImmediate(resolve));assert.equal(client.saved,1);
  client.add([{class:'car'}]);await client.sync();finishRead();await syncing;
  assert.equal(client.pending.length,0);assert.equal(sent.length,2);assert.equal(client.saved,2);
});
test('expired uncertain metadata does not poison batches of new events or claim deletion on the server',async()=>{
  let now=Date.now();const sent=[];
  const client=new HistoryClient({now:()=>now,fetchImpl:async(url,options)=>{
    if(options.method==='POST'){const body=JSON.parse(options.body);sent.push(...body.events);return Response.json({ok:true,accepted:body.events.map(e=>e.id)});}
    return Response.json({ok:true,rows:[]});
  }});
  client.add([{class:'person'}]);now+=8*86400000;client.add([{class:'car'}]);await client.sync();
  assert.equal(client.expired,1);assert.equal(client.lost,0);assert.equal(client.pending.length,0);assert.equal(sent[0].kind,'car');
});
test('losing authorization clears previously rendered private rows',async()=>{
  let allowed=true;
  const client=new HistoryClient({fetchImpl:async()=>allowed?Response.json({ok:true,rows:[{hour:Date.now(),kind:'person',source:'detector',total:4}]}):new Response('',{status:403})});
  await client.sync();assert.equal(client.rows.length,1);allowed=false;await client.sync();assert.equal(client.rows.length,0);assert.equal(client.loaded,false);
});
test('static previews and missing auth never claim saved history or drain the outbox',async()=>{
  for(const response of [new Response('<html>preview</html>'),new Response('no',{status:401}),new Response('offline',{status:503})]){
    const client=new HistoryClient({fetchImpl:async()=>response.clone()});client.add([{class:'person'}]);await client.sync();
    assert.equal(client.loaded,false);assert.equal(client.saved,0);assert.equal(client.pending.length,1);assert.ok(client.error);
  }
});
test('outbox is bounded, unsupported scooter inference cannot enter and manual counts are distinct',()=>{
  const client=new HistoryClient();client.add([{class:'scooter'}]);assert.equal(client.pending.length,0);
  client.add([{class:'scooter'}],'manual');assert.equal(client.pending[0].source,'manual');
  client.add(Array.from({length:2010},()=>({class:'person'})));assert.equal(client.pending.length,2000);assert.equal(client.lost,11);
});
test('calendar days use Madrid consistently, including DST and midnight',()=>{
  assert.equal(dayKey(Date.parse('2026-09-11T22:30:00Z')),'2026-09-12');
  assert.equal(dayKey(Date.parse('2026-01-01T22:30:00Z')),'2026-01-01');
});
test('Xtore CSP permits its own private API while retaining strict scripts and opaque player',()=>{
  const headers=readFileSync(new URL('../../_headers',import.meta.url),'utf8').split('/videoanalytics/xtore/*')[1];
  assert.match(headers,/connect-src 'self'/);assert.doesNotMatch(headers,/unsafe-eval/);
});

test('paired history exposes only saved buckets, original read time and explicit unsaved state',async()=>{
  const {historySnapshot}=await import('./history.mjs');
  let now=Date.parse('2026-09-24T10:30:00Z'),fail=false;
  const hour=Math.floor(now/3600000)*3600000;
  const client=new HistoryClient({now:()=>now,fetchImpl:async()=>fail?new Response('',{status:403}):Response.json({ok:true,rows:[{hour,kind:'person',source:'detector',total:9}]})});
  await client.sync();client.add([{class:'person'}]);
  const snapshot=historySnapshot(client);
  assert.equal(snapshot.rows[0].total,9);assert.equal(snapshot.pending,1);assert.equal(snapshot.updatedAt,now);
  assert.equal(snapshot.from,now-31*86400000);assert.equal(snapshot.to,now+60000);
  assert.equal(JSON.stringify(snapshot).includes(client.pending[0].id),false);
  now+=300000;assert.equal(historySnapshot(client).updatedAt,snapshot.updatedAt);
  fail=true;await client.sync();const denied=historySnapshot(client);
  assert.equal(denied.loaded,false);assert.deepEqual(denied.rows,[]);assert.equal(denied.updatedAt,null);assert.equal(denied.from,null);assert.equal(denied.error,'access');
});
function eventsRequest(env,query=''){
  return onRequest({env,request:new Request(`https://admira.tv/videoanalytics/api/history?view=events${query}`,{
    method:'GET',headers:{Cookie:'__Host-atv_session=fixture'}})});
}
test('event detail lists each passage with its time and never returns images',async()=>{
  const d=database(),env=envFor(d.db,{email:'admin@example.test',role:'admin'});
  const at=Date.parse('2026-09-24T10:15:07Z');
  const cars=[event({kind:'car',at}),event({kind:'car',at:at+1000}),event({kind:'car',at:at+2000,source:'manual'})];
  try{
    assert.equal((await eventsRequest(envFor(d.db,{session:false}))).status,401);
    assert.equal((await eventsRequest(envFor(d.db,{email:'viewer@example.test'}))).status,403);
    await request(env,{events:[...cars,event({kind:'person',at:at+500})]});
    const page=await (await eventsRequest(env,`&kind=car&source=detector&from=${at-1000}&to=${at+10000}&limit=2&offset=0`)).json();
    assert.equal(page.total,2);assert.equal(page.events.length,2);assert.equal(page.camera,'puerta-cam');
    assert.deepEqual(Object.keys(page.events[0]).sort(),['at','id','kind','source']);
    assert.equal(page.events.every(row=>row.kind==='car'&&row.source==='detector'&&!('image' in row)),true);
    assert.equal((await eventsRequest(env,'&kind=truck')).status,400);
    assert.equal((await eventsRequest(env,'&source=camera')).status,400);
    assert.equal((await eventsRequest(env,'&limit=0')).status,400);
    const all=await (await request(env)).json();
    assert.equal(all.rows.reduce((sum,row)=>sum+row.total,0),4);
  }finally{d.close();}
});
test('proof of pass loads every detector car and the row count matches the card',async()=>{
  const from=Date.parse('2026-09-24T00:00:00Z'),to=from+86400000;
  const cars=[{id:crypto.randomUUID(),kind:'car',at:from+1000,source:'detector'},{id:crypto.randomUUID(),kind:'car',at:from+61000,source:'detector'},{id:crypto.randomUUID(),kind:'car',at:from+120000,source:'detector'}];
  const client=new HistoryClient({fetchImpl:async url=>{
    const query=new URL(url,'https://admira.tv').searchParams;
    const matched=cars.filter(row=>row.kind===query.get('kind')&&row.source===query.get('source'));
    const offset=Number(query.get('offset')||0),limit=Number(query.get('limit')||100);
    return Response.json({ok:true,total:matched.length,events:matched.slice(offset,offset+limit)});
  }});
  const proof=await client.loadProof({from,to,kind:'car',source:'detector'});
  assert.equal(proof.total,3);assert.equal(proof.events.length,proof.total);
  assert.match(passTime(cars[0].at),/\d{2}:\d{2}:\d{2}/);
});
