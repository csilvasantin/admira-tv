import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('./src/worker.js',import.meta.url),'utf8');
const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const kv=new Map();const env={KV:{get:async k=>kv.get(k)||null,put:async(k,v)=>kv.set(k,v),delete:async k=>kv.delete(k)}};
const origin='https://playertaza.example';
const response=x=>new Response(JSON.stringify(x),{headers:{'content-type':'application/json'}});
let item=null;
globalThis.fetch=async(url)=>{
 const u=String(url);
 if(u.includes('/signage/now'))return response({ok:true,item});
 if(u.endsWith('/locations/alsea-sbux-021'))return response({location:{id:'alsea-sbux-021',name:'Starbucks Paseo de Gracia',surfaces:[{screen:'starbucks-screen',name:'Menú'}]}});
 if(u.includes('locations?slim'))return response({locations:[{id:'alsea-sbux-021',name:'Starbucks Paseo de Gracia',kind:'Cafetería'}]});
 throw Error('Unexpected URL '+u);
};
async function api(path,body){const r=await worker.fetch(new Request(origin+path,{method:body?'POST':'GET',headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined}),env);return {status:r.status,data:await r.json()};}
test('catalog, persistent binding, and Jardinets demo selection',async()=>{
 kv.clear();assert.equal((await api('/api/stores')).data.stores.length,3);
 const bind=(await api('/api/store-binding',{storeId:'canalkiosk-jardinets',screen:''})).data.binding;
 assert.equal(bind.mode,'demo');assert.equal((await api('/api/store-binding')).data.binding.revision,bind.revision);
 const accepted=await api('/api/mug-status',{name:'Queen',verb:'Radio ga ga',via:'adcelerate-best',source:'mappedMusic'});
 assert.equal(accepted.data.ok,true);assert.equal((await api('/api/store-sync',{})).data.state,'received');
});
test('unrelated follower cannot overwrite a bound demo',async()=>{
 const before=kv.get('mugStatus');const out=await api('/api/mug-status',{name:'Wrong',verb:'Other',via:'signage-follow'});
 assert.equal(out.data.ok,false);assert.equal(kv.get('mugStatus'),before);
});
test('Starbucks binding isolates Jardinets and only follows its selected screen',async()=>{
 const b=await api('/api/store-binding',{storeId:'alsea-sbux-021',screen:'starbucks-screen'});assert.equal(b.data.binding.name,'Starbucks Paseo de Gracia');
 assert.equal((await api('/api/mug-status',{name:'Queen',verb:'Jardinets',via:'adcelerate-best',source:'mappedMusic'})).data.ok,false);
 kv.delete('mugStatus');item={id:'song',title:'Coffee jazz',artist:'Jazz',ts:Date.now()};
 const sync=(await api('/api/store-sync',{})).data;
 assert.equal(sync.state,'live');assert.equal(sync.title,'Coffee jazz');assert.equal(JSON.parse(kv.get('mugStatus')).storeId,'alsea-sbux-021');
 assert.equal(sync.send.bubble.queued,false,'GIF does not imply physical delivery');
});
test('no signal and missing screen are reported honestly',async()=>{
 item={id:'old',title:'Old song',ts:Date.now()-180000};assert.equal((await api('/api/store-sync',{})).data.state,'offline');
 await api('/api/store-binding',{storeId:'alsea-sbux-021',screen:''});assert.equal((await api('/api/store-sync',{})).data.state,'waiting');
});
test('invalid IDs rejected and unlink restores existing generic writers',async()=>{
 assert.equal((await api('/api/store-binding',{storeId:'../bad',screen:''})).status,400);
 await api('/api/store-binding',{enabled:false});kv.delete('mugStatus');
 assert.equal((await api('/api/mug-status',{name:'Generic',verb:'OK',via:'signage-follow'})).data.ok,true);
});
test('manual GIF and artist launch do not override an associated store',async()=>{
 await api('/api/store-binding',{storeId:'canalkiosk-jardinets',screen:''});
 assert.equal((await api('/api/gif',{pixels:[]})).status,409);
 assert.equal((await api('/api/mug-launch',{zone:'queen',step:'name'})).data.ok,false);
});

test('Yarigai project accepts its producer and rejects kiosk writes',async()=>{
 kv.delete('mugStatus');
 const binding=(await api('/api/store-binding',{storeId:'yarigai',screen:''})).data.binding;
 assert.equal(binding.project,'yarigai');assert.equal(binding.mode,'producer');
 assert.equal((await api('/api/mug-status',{name:'Kiosk',verb:'Wrong',via:'adcelerate-best',source:'mappedMusic'})).data.ok,false);
 assert.equal((await api('/api/mug-status',{name:'Yarigai',verb:'Estado',via:'yarig',source:'yarig.ai'})).data.ok,true);
 assert.equal((await api('/api/store-sync',{})).data.state,'received');
});
test('latest project content queues once when bridge recovers',async()=>{
 const b=(await api('/api/store-binding',{storeId:'canalkiosk-jardinets',screen:''})).data.binding;
 kv.set('mugStatus',JSON.stringify({text:'RECOVERY SONG',via:'adcelerate-best',source:'mappedMusic',ts:b.updatedAt+1}));
 let queued=0;
 env.IPHONE_QUEUE={idFromName:()=>1,get:()=>({fetch:async req=>{if(new URL(req.url).pathname==='/api/iphone/status')return response({gifReady:true});queued++;return response({id:'recovery-job'});}})};
 await api('/api/store-sync',{});await api('/api/store-sync',{});
 assert.equal(queued,1);delete env.IPHONE_QUEUE;
});
