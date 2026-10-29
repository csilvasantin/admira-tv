import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const api=createRequire(import.meta.url)('./assets/mba-auto-sync.js');
const items=[{id:'old',url:'https://stock.admira.store/old.mp4',type:'video',dur:10}];
const active={revision:'old-revision',epochMs:0,items};
const pending={revision:'new-revision',epochMs:90000,items:[{id:'new',url:'https://stock.admira.store/new.mp4',type:'video',dur:12},...items]};
function device(skew=0){
 let globalNow=1000, seq=0;const timers=new Map(),seen=[];
 const client=api.create({now:()=>globalNow+skew,
  setTimeout:(fn,delay)=>{const id=++seq;timers.set(id,{fn,at:globalNow+delay});return id;},
  clearTimeout:id=>timers.delete(id),onChange:s=>seen.push(s.revision)});
 return {client,seen,receive:(at,extra={})=>{globalNow=at;return client.receive({ok:true,group:'mba-admira-tv',serverNow:at,active,pending,...extra},at+skew);},
  advance:at=>{globalNow=at;for(const [id,t] of timers){if(t.at<=at){timers.delete(id);t.fn();}}}};
}
test('four clocks and staggered polls retain old revision until one shared activation',()=>{
 const devices=[device(-60000),device(7000),device(0),device(999999)];
 devices.forEach((d,i)=>d.receive(1000+i*14000));
 devices.forEach(d=>d.advance(89999));
 assert.deepEqual(devices.map(d=>d.client.current.revision),Array(4).fill('old-revision'));
 devices.forEach(d=>d.advance(90000));
 assert.deepEqual(devices.map(d=>d.client.current.revision),Array(4).fill('new-revision'));
 assert.ok(devices.every(d=>d.client.current.epochMs===90000));
 assert.ok(devices.every(d=>d.client.current.items.every(i=>i._syncDurationLocked)));
});
test('late and stale responses cannot return an activated player to an earlier revision',()=>{
 const d=device();d.receive(95000);assert.equal(d.client.current.revision,'new-revision');
 d.receive(96000,{pending:null});assert.equal(d.client.current.revision,'new-revision');
 assert.deepEqual(d.seen,['new-revision']);
});
test('invalid pending revision leaves previous snapshot and activation timer usable',()=>{
 const d=device();d.receive(1000);
 assert.throws(()=>d.receive(2000,{pending:{...pending,items:[{...items[0],dur:0}]}}),/invalid_mba_item/);
 d.advance(90000);assert.equal(d.client.current.revision,'new-revision');
});
test('an older response cannot remove a revision that has already been prepared',()=>{
 const d=device();d.receive(1000);d.receive(2000,{pending:null});d.advance(90000);
 assert.equal(d.client.current.revision,'new-revision');
});
test('only the four physical MBA identities select the new source',()=>{
 for(const color of ['azul','crema','rosa','plata'])assert.equal(api.isTargetScreen('macbookair'+color),true);
 for(const id of ['macstudio-starbucks-horizontal','macbookair16plata','iphone-mupi','macbookairazul-tema'])assert.equal(api.isTargetScreen(id),false);
});
test('cache metadata can be recorded without changing authoritative durations',async()=>{
 const html=readFileSync(new URL('./canal.html',import.meta.url),'utf8');
 const source=html.slice(html.indexOf('async function runTechnicalAnalysis(){'),html.indexOf('\nlet _asapItemId='));
 const locked={id:'new',url:pending.items[0].url,_dur:12,_syncDurationLocked:true};
 const local={id:'new',_dur:1};
 const ctx=vm.createContext({_techBusy:false,_techQ:[locked],_techQueued:new Set(['new']),_cacheTech:new Map(),
  analyzeCachedContent:async()=>({duration:999}),playlist:[locked],all:[local],
  saveCacheTech(){},_cacheSig:'x',cacheReport(){},signagePlaylistPush(){},setTimeout:fn=>fn(),Promise});
 vm.runInContext(source,ctx);await vm.runInContext('runTechnicalAnalysis()',ctx);
 assert.equal(locked._dur,12);assert.equal(local._dur,999);assert.equal(ctx._cacheTech.get('new').duration,999);
});
