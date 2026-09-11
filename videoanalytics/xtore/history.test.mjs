import test from 'node:test';
import assert from 'node:assert/strict';
import {HistoryClient,dayKey} from './history.mjs';
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
